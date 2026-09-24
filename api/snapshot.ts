/**
 * 原型展示環境的資料存放點（暫時性，非正式後端）。
 *
 * 整包模擬資料以「一個工作區一筆 JSON」存進 Upstash Redis，沒有資料表、沒有 schema——
 * 需求還在變動，現在切資料表等於在規格定案前把結構定死，客戶每改一次想法就要搬一次家。
 * 真正的後端另行設計，屆時整個資料夾刪除即可，不影響 src/ 底下任何商業規則。
 *
 * 併發：以版本號做 compare-and-set。兩人同時操作時，後手會被擋下並收到目前版本，
 * 由前端要求重新載入——寧可他重做一次，也不要他的單無聲蓋掉別人剛簽核的那張。
 *
 * 詳見 repo 根目錄的 PROTOTYPE-HOSTING.md。
 */
export const config = { runtime: 'edge' }

/** 工作區代碼：限英數與連字號，避免被拿來組出奇怪的 Redis 鍵 */
const WORKSPACE_PATTERN = /^[a-z0-9-]{1,32}$/

/**
 * Upstash 的連線資訊。Vercel 的整合依版本不同會注入兩組命名之一，
 * 兩種都讀，省得因為改名而整個壞掉。
 */
function upstash(): { url: string; token: string } | undefined {
  const env = process.env
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return undefined
  return { url, token }
}

async function redis(command: unknown[]): Promise<unknown> {
  const conn = upstash()
  if (!conn) throw new Error('尚未連結 Upstash Redis（缺少 KV_REST_API_URL / KV_REST_API_TOKEN）')
  const res = await fetch(conn.url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${conn.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  if (!res.ok) throw new Error(`Redis 回應 ${res.status}：${await res.text()}`)
  const body = (await res.json()) as { result?: unknown; error?: string }
  if (body.error) throw new Error(`Redis 錯誤：${body.error}`)
  return body.result
}

const versionKey = (ws: string) => `rorica:${ws}:version`
const dataKey = (ws: string) => `rorica:${ws}:data`

/**
 * 版本號與資料分成兩把鍵，CAS 在 Lua 裡做——版本號是純整數，
 * 不必把 240KB 的 JSON 丟進 Lua 解析。
 * 回傳 -1 代表寫入成功；其餘數值為目前版本，代表有人搶先一步。
 */
const CAS_SCRIPT = `
local cur = tonumber(redis.call('GET', KEYS[1]) or '0')
if cur ~= tonumber(ARGV[1]) then return cur end
local nxt = cur + 1
redis.call('SET', KEYS[1], nxt)
redis.call('SET', KEYS[2], ARGV[2])
return -1
`

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const ws = (url.searchParams.get('ws') ?? 'demo').toLowerCase()
  if (!WORKSPACE_PATTERN.test(ws)) {
    return json({ error: '工作區代碼僅接受英文字母、數字與連字號，最長 32 字' }, 400)
  }

  try {
    if (req.method === 'GET') {
      const [version, data] = (await redis(['MGET', versionKey(ws), dataKey(ws)])) as (string | null)[]
      // 尚未建立過的工作區：回 version 0 與空資料，前端即以種子資料起步
      return json({ workspace: ws, version: Number(version ?? 0), snapshot: data ? JSON.parse(data) : null })
    }

    // POST 與 PUT 同義：關閉分頁時用 navigator.sendBeacon 補送最後一次異動，而它只能送 POST
    if (req.method === 'PUT' || req.method === 'POST') {
      const body = (await req.json()) as { baseVersion?: number; snapshot?: unknown }
      if (typeof body.baseVersion !== 'number' || body.snapshot == null) {
        return json({ error: '缺少 baseVersion 或 snapshot' }, 400)
      }
      const result = Number(
        await redis(['EVAL', CAS_SCRIPT, '2', versionKey(ws), dataKey(ws), String(body.baseVersion), JSON.stringify(body.snapshot)]),
      )
      if (result === -1) return json({ workspace: ws, version: body.baseVersion + 1 })
      // 有人搶先寫入：告知目前版本，由前端提示使用者重新載入
      return json({ error: 'conflict', workspace: ws, version: result }, 409)
    }

    return json({ error: `不支援的方法 ${req.method}` }, 405)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : String(error) }, 500)
  }
}

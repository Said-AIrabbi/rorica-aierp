/**
 * POST /api/colormind/launch  {name, l, a, b}  → {launch_url, expires_in}
 *
 * Agents協作中心「到 ColorMind 確認並帶回」這個人工步驟呼叫：帶色名與 Lab 向 ColorMind 簽發預測頁連結。
 * return_url 原樣送出（COLORMIND_RETURN_URL，例如 http://localhost:5173/#/four-modules），不加任何參數：
 * ColorMind 帶回時會把 code 加在 ? 之後、# 之前，由 src/lib/colormind-return.ts 讀取。
 */
import { LAUNCH_PATH, callColorMind, json, returnUrlFor, sameOrigin } from '../_lib/colormind.js'

// Node.js 執行環境（Vercel 的 Edge 已不建議使用；Node 的連線錯誤也比較看得出原因），機房見 vercel.json 的 regions

async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: `不支援的方法 ${req.method}` }, 405)
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, 403)

  const body = (await req.json().catch(() => null)) as { name?: unknown; l?: unknown; a?: unknown; b?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const { l, a, b } = body ?? {}
  if ([...name].length < 1 || [...name].length > 80) return json({ error: '色樣名稱須為 1～80 字' }, 400)
  if (typeof l !== 'number' || !(l >= 0 && l <= 100)) return json({ error: 'L* 須介於 0～100' }, 400)
  if (typeof a !== 'number' || !(a >= -128 && a <= 127)) return json({ error: 'a* 須介於 -128～127' }, 400)
  if (typeof b !== 'number' || !(b >= -128 && b <= 127)) return json({ error: 'b* 須介於 -128～127' }, 400)

  const r = await callColorMind(LAUNCH_PATH, { 色樣名稱: name, L: l, a, b, return_url: returnUrlFor(req) })
  return json(r.body, r.status)
}

export default { fetch: handler }

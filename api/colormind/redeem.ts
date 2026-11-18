/**
 * POST /api/colormind/redeem  {code}  → {色樣名稱, L, a, b, recipes: [{序號, C, M, Y, K, R, G, B}]}
 *
 * 由 src/lib/colormind-return.ts 呼叫：使用者在 ColorMind 按「帶回配方」後回到 ERP（?code=…#/four-modules），
 * 網址上的 code 一載入就換成配方（code 只能換一次、約 15 分鐘內有效）。
 */
import { REDEEM_PATH, callColorMind, json, sameOrigin } from '../_lib/colormind'

// Node.js 執行環境（Vercel 的 Edge 已不建議使用；Node 的連線錯誤也比較看得出原因），機房見 vercel.json 的 regions

async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: `不支援的方法 ${req.method}` }, 405)
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, 403)

  const body = (await req.json().catch(() => null)) as { code?: unknown } | null
  const code = typeof body?.code === 'string' ? body.code.trim() : ''
  if (!code || code.length > 2048) return json({ error: '短碼無效或已使用' }, 400)

  const r = await callColorMind(REDEEM_PATH, { code })
  return json(r.body, r.status)
}

export default { fetch: handler }

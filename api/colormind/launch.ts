/**
 * POST /api/colormind/launch  {name, l, a, b, req}  → {launch_url, expires_in}
 *
 * 由 ERP 的「電腦色號」區塊呼叫：帶色名與 Lab 向 ColorMind 簽發預測頁連結。
 * req 是瀏覽器端產生的請求代號，放進 return_url，回來時用它對回是哪一個色號在等結果。
 */
import { LAUNCH_PATH, callColorMind, json, returnUrlFor, sameOrigin } from '../_lib/colormind'

export const config = { runtime: 'edge' }

const REQ_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return json({ error: `不支援的方法 ${req.method}` }, 405)
  if (!sameOrigin(req)) return json({ error: 'forbidden' }, 403)

  const body = (await req.json().catch(() => null)) as { name?: unknown; l?: unknown; a?: unknown; b?: unknown; req?: unknown } | null
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const { l, a, b } = body ?? {}
  if ([...name].length < 1 || [...name].length > 80) return json({ error: '色樣名稱須為 1～80 字' }, 400)
  if (typeof l !== 'number' || !(l >= 0 && l <= 100)) return json({ error: 'L* 須介於 0～100' }, 400)
  if (typeof a !== 'number' || !(a >= -128 && a <= 127)) return json({ error: 'a* 須介於 -128～127' }, 400)
  if (typeof b !== 'number' || !(b >= -128 && b <= 127)) return json({ error: 'b* 須介於 -128～127' }, 400)
  if (typeof body?.req !== 'string' || !REQ_PATTERN.test(body.req)) return json({ error: '請求代號格式不正確' }, 400)

  const back = new URL(returnUrlFor(req))
  back.searchParams.set('req', body.req)

  const r = await callColorMind(LAUNCH_PATH, { 色樣名稱: name, L: l, a, b, return_url: back.toString() })
  return json(r.body, r.status)
}

/**
 * /portal/* → 選布平台（fabric-portal）。讓 ERP 與選布平台共用同一個網址：
 * vercel.json 把 /portal 與 /portal/… 改寫到這支函式，這裡原樣轉給 PORTAL_ORIGIN（選布平台以 BASE_PATH=/portal 建置）。
 *
 * - PORTAL_ORIGIN 是伺服器端環境變數（例如 https://xxxx.trycloudflare.com），換網址只要改變數、重新部署，不必改程式。
 * - 回應以串流原樣回傳（Agents協作中心的即時推送也走這裡），登入 cookie 由瀏覽器記在本站網址下。
 * - 選布平台回的轉址若指向它自己的網址，改成本站的相對路徑，使用者始終停在本站。
 * - 本機開發由 vite.config.ts 的 local-api 代跑同一支程式（/portal 開頭的請求）。
 */
export const config = { runtime: 'edge' }

const PREFIX = '/portal'
/** 不轉給選布平台的請求標頭（連線層的、由 fetch 自己決定的） */
const DROP_REQUEST = ['host', 'connection', 'content-length', 'accept-encoding', 'x-portal-path']
/** 不原樣回傳的回應標頭：fetch 已解壓縮，長度與編碼要由平台重新決定 */
const DROP_RESPONSE = ['content-encoding', 'content-length', 'transfer-encoding', 'connection']

/**
 * 要轉發的路徑：Vercel 改寫後的網址可能仍是原路徑，也可能帶在 ?__portal= 裡（vercel.json），兩種都接受。
 * Vercel 會把規則擷取的參數附加到查詢字串，所以參數一律命名 __portal，並在這裡拿掉，不轉給選布平台。
 */
export function portalPath(url: URL): { path: string; search: string } {
  const params = new URLSearchParams(url.search)
  const fromQuery = params.get('__portal')
  params.delete('__portal')
  const search = params.toString() ? `?${params}` : ''
  if (url.pathname === PREFIX || url.pathname.startsWith(`${PREFIX}/`)) return { path: url.pathname, search }
  const rest = (fromQuery ?? '').replace(/^\/+/, '')
  return { path: rest ? `${PREFIX}/${rest}` : PREFIX, search }
}

/** 選布平台回的 Location：指向它自己（或本站）時改成站內相對路徑，其他網址原樣 */
export function rewriteLocation(location: string, upstream: URL, site: URL): string {
  try {
    const u = new URL(location, upstream)
    if (u.origin === upstream.origin || u.origin === site.origin) return `${u.pathname}${u.search}${u.hash}`
  } catch {
    // 不是網址：原樣
  }
  return location
}

export default async function handler(req: Request): Promise<Response> {
  const origin = (process.env.PORTAL_ORIGIN ?? '').trim().replace(/\/+$/, '')
  if (!/^https?:\/\/[^/?#]+$/.test(origin)) {
    return new Response('選布平台尚未設定（PORTAL_ORIGIN）', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  const site = new URL(req.url)
  const upstream = new URL(origin)
  const { path, search } = portalPath(site)
  const target = new URL(`${path}${search}`, upstream)

  const headers = new Headers(req.headers)
  for (const h of DROP_REQUEST) headers.delete(h)
  headers.set('x-forwarded-host', site.host)
  headers.set('x-forwarded-proto', site.protocol.replace(':', ''))

  const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
  let res: Response
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? req.body : undefined,
      redirect: 'manual',
      // 串流上傳（照片）需要 half duplex
      ...(hasBody ? ({ duplex: 'half' } as Record<string, string>) : {}),
    })
  } catch {
    return new Response('暫時連不到選布平台，請稍後再試', { status: 502, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })
  }

  const out = new Headers(res.headers)
  for (const h of DROP_RESPONSE) out.delete(h)
  const location = out.get('location')
  if (location) out.set('location', rewriteLocation(location, upstream, site))
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out })
}

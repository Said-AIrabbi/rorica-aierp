/**
 * ColorMind 預測頁嵌入串接（ColorMind「預測頁嵌入串接說明」）的 ERP 後端端。
 *
 * 金鑰只在這裡（伺服器環境變數），瀏覽器拿不到；launch、redeem 都由這裡代呼叫。
 *
 * 環境變數：
 *   COLORMIND_BASE_URL    預設 https://test.tcolormind.ai；本機接假 ColorMind 時設 http://localhost:4010
 *   COLORMIND_API_KEY     Bearer 金鑰；未設定時兩支端點都回 503
 *   COLORMIND_RETURN_URL  按「帶回配方」後回到的完整網址，原樣送出；未設定時為本站的 /#/four-modules。
 *                         這個網址的網域須先請 ColorMind 加入允許清單（正式須為 https）
 */

export const LAUNCH_PATH = '/api/embed/predict/launch'
export const REDEEM_PATH = '/api/embed/predict/redeem'

export interface ColorMindRecipe {
  序號: number
  C: number
  M: number
  Y: number
  K: number
  R: number
  G: number
  B: number
}

export interface ColorMindResult {
  色樣名稱: string
  L: number
  a: number
  b: number
  recipes: ColorMindRecipe[]
}

/**
 * ColorMind 換取結果整理成 ERP 用的形狀（{色樣名稱, L, a, b, recipes}）。
 * 現行的回傳是 items：客戶在 ColorMind 點選要帶回的顏色（各自的色名、Lab、RGB、染料）；
 * 帶回的顏色一律是客戶點選的那一個（第一個），不是一開始送去的目標色。舊的回傳（recipes：CMYK＋RGB）原樣通過。
 * 沒有點選任何顏色時回 null。
 */
export function normalizeRedeemed(data: unknown): ColorMindResult | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  if (!Array.isArray(o.items)) return o as unknown as ColorMindResult
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
  const picked = o.items
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x, i) => {
      const zh = typeof x['色樣名稱'] === 'string' ? x['色樣名稱'].trim() : ''
      const en = typeof x['英文色名'] === 'string' ? x['英文色名'].trim() : ''
      return { name: zh && en ? `${zh} ${en}` : zh || en, L: n(x.L), a: n(x.a), b: n(x.b), R: n(x.R), G: n(x.G), B: n(x.B), no: n(x.id) ?? i + 1 }
    })
    .filter((x) => [x.L, x.a, x.b, x.R, x.G, x.B].every((v) => v !== null))
  const first = picked[0]
  if (!first) return null
  return {
    色樣名稱: first.name,
    L: first.L!,
    a: first.a!,
    b: first.b!,
    // 新的回傳沒有 CMYK（改用染料配方），以 0 補位
    recipes: picked.map((x) => ({ 序號: x.no, C: 0, M: 0, Y: 0, K: 0, R: x.R!, G: x.G!, B: x.B! })),
  }
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

function config(): { base: string; key: string } | undefined {
  const key = process.env.COLORMIND_API_KEY?.trim()
  if (!key) return undefined
  const base = (process.env.COLORMIND_BASE_URL || 'https://test.tcolormind.ai').replace(/\/+$/, '')
  return { base, key }
}

/**
 * 只接受本站頁面發出的請求：瀏覽器跨站呼叫一定帶 Origin，且與本站不同。
 * 原型沒有伺服器端登入，這只是擋掉別的網站拿本站代刷 ColorMind，不是身分驗證。
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin')
  if (!origin) return true
  return origin === new URL(req.url).origin
}

export function returnUrlFor(req: Request): string {
  return process.env.COLORMIND_RETURN_URL?.trim() || new URL('/#/four-modules', req.url).toString()
}

/** 呼叫 ColorMind；回傳對方的狀態碼與內容，錯誤訊息轉成可給使用者看的中文 */
export async function callColorMind(path: string, body: unknown): Promise<{ status: number; body: unknown }> {
  const cfg = config()
  if (!cfg) return { status: 503, body: { error: 'ERP 尚未設定 ColorMind 金鑰（COLORMIND_API_KEY）' } }
  let res: Response
  try {
    res = await fetch(`${cfg.base}${path}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cfg.key}`, 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    // detail：連線失敗的技術原因（錯誤代碼，不含金鑰），方便判斷是網路、DNS 還是憑證
    const cause = (e as { cause?: { code?: unknown; message?: unknown } }).cause
    const detail = String(cause?.code ?? cause?.message ?? (e instanceof Error ? e.message : e)).slice(0, 200)
    return { status: 502, body: { error: '連不上 ColorMind，請稍後再試', detail } }
  }
  const data = (await res.json().catch(() => null)) as { error?: unknown; detail?: unknown } | null
  if (res.ok) return { status: 200, body: data }
  // 401 是金鑰問題、503 是對方尚未設定完成：都不是使用者能處理的，換成固定說明；400 帶對方的原因
  const reason =
    res.status === 401
      ? 'ColorMind 金鑰不正確，請聯絡系統管理員'
      : res.status === 503
        ? 'ColorMind 這條串接尚未設定完成，請聯絡系統管理員（請勿重試）'
        : typeof data?.detail === 'string' // ColorMind 的 400 原因放在 detail
          ? data.detail
          : typeof data?.error === 'string'
            ? data.error
            : `ColorMind 回應 ${res.status}`
  return { status: res.status === 400 ? 400 : 502, body: { error: reason } }
}

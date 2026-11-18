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
  } catch {
    return { status: 502, body: { error: '連不上 ColorMind，請稍後再試' } }
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

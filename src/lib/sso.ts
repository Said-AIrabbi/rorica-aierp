/**
 * 與選布平台（fabric-portal）的單一登入：選布平台是登入中心，ERP 只負責驗證它簽的通行證。
 * 格式與規則見 fabric-portal 的 docs/erp-sso.md，這裡是 ERP 端的實作。
 *
 * 流程：
 *   ① 登入頁按「以選布平台帳號登入」→ startSso()：產生 state 存在本分頁，轉到選布平台 /sso/erp
 *   ② 選布平台（已登入的內部人員）帶著通行證轉回 {本站}#/sso-callback?ticket=…
 *   ③ verifyTicket()：驗簽章（ECDSA P-256 公鑰）、發行者、對象、效期、state、是否用過
 *   ④ 依通行證上的 email 對應 ERP 帳號主檔的「信箱」，以那個 ERP 帳號登入（mocks/session.ts）
 * 選布平台帳號選單的「前往 ERP」會先到 #/sso-start，由這裡產生 state 再走 ①，
 * 所以每一張通行證都是 ERP 自己請求的，不接受對方單方面送來的票。
 *
 * 用公鑰驗證：公鑰可以公開放在前端，拿到它也簽不出通行證。
 * 這仍是原型——ERP 的登入狀態本身存在瀏覽器裡，正式系統須由後端建立連線階段。
 */

/** 選布平台網址：部署後以環境變數指定，本機開發預設 localhost:3000 */
export const FABRIC_PORTAL_URL = (import.meta.env.VITE_FABRIC_PORTAL_URL || 'http://localhost:3000').replace(/\/+$/, '')

/** 選布平台簽通行證用的公鑰（SPKI DER 的 base64）；沒有設定時登入頁不顯示單一登入按鈕 */
const PUBLIC_KEY_B64: string = import.meta.env.VITE_ERP_SSO_PUBLIC_KEY ?? ''

export const isSsoConfigured = (): boolean => PUBLIC_KEY_B64.trim().length > 0

const STATE_KEY = 'rorica-erp-sso-state'
const USED_JTI_KEY = 'rorica-erp-sso-used'
/** 兩邊時鐘的容許誤差（秒） */
const CLOCK_SKEW_S = 30

export interface SsoClaims {
  v: 1
  iss: 'fabric-portal'
  aud: 'erp'
  sub: string
  name: string
  staff: 'owner' | 'sales'
  state: string
  iat: number
  exp: number
  jti: string
}

export type SsoHashAction = { kind: 'start' } | { kind: 'callback'; ticket: string } | null

/** 網址上的 #/sso-start 或 #/sso-callback?ticket=…（HashRouter 下兩者都在 # 之後） */
export function readSsoHash(hash: string = window.location.hash): SsoHashAction {
  if (hash === '#/sso-start') return { kind: 'start' }
  if (hash.startsWith('#/sso-callback')) {
    const ticket = new URLSearchParams(hash.slice(hash.indexOf('?') + 1)).get('ticket')
    return ticket ? { kind: 'callback', ticket } : null
  }
  return null
}

/** 把通行證從網址列拿掉：不留在瀏覽紀錄、也不會被複製分享出去 */
export function clearSsoHash(): void {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#/`)
}

/** 本站在選布平台允許清單裡登記的位址：origin＋路徑（不含 ? 與 #） */
function returnUrl(): string {
  return `${window.location.origin}${window.location.pathname}`
}

function randomState(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** 轉到選布平台取通行證 */
export function startSso(): void {
  const state = randomState()
  try {
    window.sessionStorage.setItem(STATE_KEY, state)
  } catch {
    // 存不進去時回來會因 state 對不上而失敗，訊息會請使用者改用帳密
  }
  const q = new URLSearchParams({ return: returnUrl(), state })
  window.location.assign(`${FABRIC_PORTAL_URL}/sso/erp?${q}`)
}

const fromB64url = (s: string): Uint8Array<ArrayBuffer> => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4))
  return Uint8Array.from(bin, (c) => c.charCodeAt(0))
}

function takeState(): string | null {
  try {
    const s = window.sessionStorage.getItem(STATE_KEY)
    window.sessionStorage.removeItem(STATE_KEY)
    return s
  } catch {
    return null
  }
}

/** 用過的 jti（只留未過期的），防止同一張通行證被重放 */
function markJtiUsed(jti: string, exp: number): boolean {
  const now = Math.floor(Date.now() / 1000)
  let used: { jti: string; exp: number }[] = []
  try {
    used = JSON.parse(window.localStorage.getItem(USED_JTI_KEY) ?? '[]') as { jti: string; exp: number }[]
  } catch {
    used = []
  }
  used = used.filter((u) => u.exp + CLOCK_SKEW_S > now)
  if (used.some((u) => u.jti === jti)) return false
  used.push({ jti, exp })
  try {
    window.localStorage.setItem(USED_JTI_KEY, JSON.stringify(used))
  } catch {
    // 寫不進去仍以 60 秒效期與 state 擋重放
  }
  return true
}

/** 驗證通行證；通過回傳內容，否則丟出可直接顯示給使用者的錯誤 */
export async function verifyTicket(ticket: string, now = Date.now()): Promise<SsoClaims> {
  if (!isSsoConfigured()) throw new Error('ERP 尚未設定單一登入的公鑰')
  const expectedState = takeState()
  const [body, sig, extra] = ticket.split('.')
  if (!body || !sig || extra !== undefined) throw new Error('通行證格式不正確，請重新登入')

  const key = await crypto.subtle.importKey('spki', fromB64url(PUBLIC_KEY_B64.trim()), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify'])
  const ok = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, fromB64url(sig), new TextEncoder().encode(body))
  if (!ok) throw new Error('通行證簽章無效，請重新登入')

  let claims: SsoClaims
  try {
    claims = JSON.parse(new TextDecoder().decode(fromB64url(body))) as SsoClaims
  } catch {
    throw new Error('通行證內容無法解讀，請重新登入')
  }
  const t = Math.floor(now / 1000)
  if (claims.v !== 1 || claims.iss !== 'fabric-portal' || claims.aud !== 'erp') throw new Error('通行證不是發給本系統的')
  if (typeof claims.exp !== 'number' || claims.exp + CLOCK_SKEW_S < t) throw new Error('通行證已過期，請重新登入')
  if (typeof claims.iat !== 'number' || claims.iat - CLOCK_SKEW_S > t) throw new Error('通行證時間不正確，請檢查電腦時鐘')
  if (!expectedState || claims.state !== expectedState) throw new Error('登入請求對不上，請從 ERP 登入頁重新開始')
  if (typeof claims.jti !== 'string' || !markJtiUsed(claims.jti, claims.exp)) throw new Error('這張通行證已使用過，請重新登入')
  if (typeof claims.sub !== 'string' || !claims.sub.includes('@')) throw new Error('通行證缺少帳號信箱')
  return claims
}

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

export type SsoHashAction =
  | { kind: 'start' }
  | { kind: 'callback'; ticket: string }
  | { kind: 'embed'; next: string }
  | null

/** 只接受站內路徑（/four-modules），避免被拿來導去別的網站 */
function safeNext(raw: string | null): string {
  return raw && /^\/[A-Za-z0-9/_-]*$/.test(raw) ? raw : '/'
}

/** 網址上的 #/sso-start、#/sso-callback?ticket=…、#/sso-embed?next=…（HashRouter 下都在 # 之後） */
export function readSsoHash(hash: string = window.location.hash): SsoHashAction {
  if (hash === '#/sso-start') return { kind: 'start' }
  if (hash.startsWith('#/sso-embed')) {
    const q = hash.includes('?') ? new URLSearchParams(hash.slice(hash.indexOf('?') + 1)) : new URLSearchParams()
    return { kind: 'embed', next: safeNext(q.get('next')) }
  }
  if (hash.startsWith('#/sso-callback')) {
    const ticket = new URLSearchParams(hash.slice(hash.indexOf('?') + 1)).get('ticket')
    return ticket ? { kind: 'callback', ticket } : null
  }
  return null
}

/** 把通行證從網址列拿掉：不留在瀏覽紀錄、也不會被複製分享出去；next 為登入後要去的站內頁 */
export function clearSsoHash(next = '/'): void {
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}#${safeNext(next)}`)
}

const FABRIC_ORIGIN = new URL(FABRIC_PORTAL_URL).origin

/**
 * 嵌在選布平台後台（Agents協作中心）時的登入：框架不能轉去選布平台（對方禁止被嵌入），
 * 改由上層頁面代領通行證——送出 state 給上層，等上層把通行證送回來。
 * 只對選布平台的 origin 送、只收上層視窗從那個 origin 送來的訊息。
 */
export function requestEmbedTicket(timeoutMs = 15_000): Promise<string> {
  if (window.parent === window) return Promise.reject(new Error('不在選布平台的頁面裡，無法自動登入'))
  const state = randomState()
  try {
    window.sessionStorage.setItem(STATE_KEY, state)
  } catch {
    // 存不進去時回來會因 state 對不上而失敗
  }
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener('message', onMessage)
      reject(new Error('選布平台沒有回應，請重新整理頁面'))
    }, timeoutMs)
    function onMessage(e: MessageEvent) {
      if (e.origin !== FABRIC_ORIGIN || e.source !== window.parent) return
      const data = e.data as { type?: unknown; ticket?: unknown; error?: unknown } | null
      if (data?.type === 'erp-sso-ticket' && typeof data.ticket === 'string') {
        window.clearTimeout(timer)
        window.removeEventListener('message', onMessage)
        resolve(data.ticket)
      } else if (data?.type === 'erp-sso-error') {
        window.clearTimeout(timer)
        window.removeEventListener('message', onMessage)
        reject(new Error(`選布平台無法簽發通行證（${String(data.error)}）`))
      }
    }
    window.addEventListener('message', onMessage)
    window.parent.postMessage({ type: 'erp-sso-request', state }, FABRIC_ORIGIN)
  })
}

/*
  Agents協作中心的共用狀態放在選布平台（agent-hub 模組）。單一登入時用剛驗過的通行證換一張存取證，
  協作中心以它讀寫共用狀態、接收即時推送。換不到（模組沒開、以帳密登入）就維持單機模式。
*/
const HUB_KEY = 'rorica-erp-agent-hub'

export interface HubAccess {
  url: string
  token: string
  name: string
}

export async function exchangeHubToken(ticket: string): Promise<void> {
  try {
    const r = await fetch(`${FABRIC_PORTAL_URL}/api/agent-hub/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ticket }),
    })
    if (!r.ok) return
    const body = (await r.json()) as { token?: string; exp?: number; name?: string }
    if (body.token && body.exp) {
      window.sessionStorage.setItem(HUB_KEY, JSON.stringify({ token: body.token, exp: body.exp, name: body.name ?? '' }))
    }
  } catch {
    // 協作中心同步是附加功能：換不到不影響登入
  }
}

/** 目前有效的存取證；沒有或已過期回傳 undefined（協作中心改為單機模式） */
export function getHubAccess(): HubAccess | undefined {
  try {
    const raw = window.sessionStorage.getItem(HUB_KEY)
    if (!raw) return undefined
    const h = JSON.parse(raw) as { token: string; exp: number; name: string }
    if (h.exp * 1000 <= Date.now()) return undefined
    return { url: FABRIC_PORTAL_URL, token: h.token, name: h.name }
  } catch {
    return undefined
  }
}

export function clearHubAccess(): void {
  try {
    window.sessionStorage.removeItem(HUB_KEY)
  } catch {
    // 沒有可清的
  }
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

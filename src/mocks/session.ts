import type { Account } from '@/types'
import { accounts } from './data'

/**
 * 目前登入帳號（原型用）。
 *
 * 真實系統這是伺服器上的 session；原型以瀏覽器分頁的 sessionStorage 承載，
 * 登入頁驗過帳密後寫入，關掉分頁即登出。
 *
 * 放在 mocks 而非 React context，是因為 mutations.ts 扮演的是「後端」——
 * 權限規格第七章第 2 節要求可見性與動作權限的判定一律在後端進行，
 * 前端的隱藏只是呈現、不作為安全邊界。資料層要擋，就得在這一側知道呼叫者是誰。
 *
 * **這不是真的身分驗證。** 密碼在前端以明文比對，任何人開 devtools 都能繞過；
 * 原型的登入只是為了讓「不同角色看到不同畫面」這件事演得出來。
 * 正式系統的帳密、雜湊與連線階段管理屬後端工作（docs/backend-infra-requirements.md）。
 */

const STORAGE_KEY = 'rorica-erp-current-account'

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    // 無痕視窗或封鎖網站資料時會丟例外，視為未登入
    return null
  }
}

function writeStored(id: string | null): void {
  try {
    if (id === null) window.sessionStorage.removeItem(STORAGE_KEY)
    else window.sessionStorage.setItem(STORAGE_KEY, id)
  } catch {
    // 存不進去不影響本次瀏覽，登入狀態仍在記憶體中
  }
}

/** 未登入時為 null；測試腳本可直接用 setCurrentAccountId 指定身分，不必走登入頁 */
let currentAccountId: string | null = typeof window === 'undefined' ? null : readStored()

export function getCurrentAccountId(): string | null {
  return currentAccountId
}

export function isSignedIn(): boolean {
  return currentAccountId !== null && accounts.some((a) => a.id === currentAccountId)
}

/**
 * 目前帳號。未登入時回傳 undefined——權限層看到 undefined 一律擋下
 * （assertCanAct 會丟「未指定操作帳號」），不會誤放行。
 */
export function getCurrentAccount(): Account | undefined {
  if (currentAccountId === null) return undefined
  return accounts.find((a) => a.id === currentAccountId)
}

/**
 * 登入：以帳號代碼（Account.code）與密碼比對。
 * 帳號不存在、密碼不符、帳號已停用——三種情形一律回同一句話，
 * 免得訊息本身變成「這個帳號存在」的線索。
 */
export function signIn(code: string, password: string): Account {
  const lockedFor = signInLockRemainingSeconds()
  if (lockedFor > 0) throw new Error(`登入失敗次數過多，請 ${lockedFor} 秒後再試`)

  const account = accounts.find((a) => a.code.toLowerCase() === code.trim().toLowerCase())
  if (!account || account.password !== password || account.status === '停用') {
    const lock = recordFailedSignIn()
    // 錯在帳號、密碼或停用，訊息一律相同，不透露哪一項有問題
    throw new Error(lock > 0 ? `登入失敗次數過多，請 ${lock} 秒後再試` : '帳號或密碼錯誤，或該帳號已停用')
  }
  clearFailedSignIns()
  currentAccountId = account.id
  writeStored(account.id)
  signedInAccountId = account.id
  writeSignedIn(account.id)
  return account
}

/**
 * 以選布平台單一登入：通行證已由 lib/sso.ts 驗過，這裡依 email 對應帳號主檔的「信箱」。
 * 對應不到或帳號已停用一律拒絕——ERP 的權限只看 ERP 自己的帳號角色，選布平台的身分不帶進來。
 */
export function signInWithSsoEmail(email: string): Account {
  const target = email.trim().toLowerCase()
  const account = accounts.find((a) => a.mailbox.trim().toLowerCase() === target)
  if (!account || account.status === '停用') {
    throw new Error(`選布平台帳號 ${target} 沒有對應的 ERP 帳號（或已停用）。請管理員在帳戶主檔把信箱設成相同的 email。`)
  }
  clearFailedSignIns()
  currentAccountId = account.id
  writeStored(account.id)
  signedInAccountId = account.id
  writeSignedIn(account.id)
  return account
}

/**
 * 連續登入失敗的暫時鎖定：同一個瀏覽器連錯 MAX_FAILED_SIGN_INS 次，鎖 LOCK_SECONDS 秒。
 *
 * 不分帳號計次——若依帳號計，等於告訴對方「這個帳號存在」（與上面錯誤訊息一致的考量）。
 * 存在 localStorage 而非記憶體，重新整理頁面不會歸零；讀寫失敗（無痕、封鎖網站資料）時退回記憶體。
 * 這仍是前端的把關，正式系統須在伺服器端依帳號與來源 IP 限制（docs/backend-infra-requirements.md）。
 */
const MAX_FAILED_SIGN_INS = 5
const LOCK_SECONDS = 60
const FAILED_KEY = 'rorica-erp-failed-sign-ins'

let failedMemory: { count: number; lockedUntil: number } = { count: 0, lockedUntil: 0 }

function readFailed(): { count: number; lockedUntil: number } {
  try {
    const raw = window.localStorage.getItem(FAILED_KEY)
    if (raw) return JSON.parse(raw) as { count: number; lockedUntil: number }
  } catch {
    // 讀不到就用記憶體裡那份
  }
  return failedMemory
}

function writeFailed(state: { count: number; lockedUntil: number }): void {
  failedMemory = state
  try {
    window.localStorage.setItem(FAILED_KEY, JSON.stringify(state))
  } catch {
    // 寫不進去仍以記憶體計次
  }
}

/** 目前還要鎖幾秒；未鎖定回 0 */
export function signInLockRemainingSeconds(): number {
  if (typeof window === 'undefined') return 0
  return Math.max(0, Math.ceil((readFailed().lockedUntil - Date.now()) / 1000))
}

/** 記一次失敗，達上限即上鎖並歸零計數；回傳上鎖秒數（未上鎖為 0） */
function recordFailedSignIn(): number {
  if (typeof window === 'undefined') return 0
  const count = readFailed().count + 1
  if (count >= MAX_FAILED_SIGN_INS) {
    writeFailed({ count: 0, lockedUntil: Date.now() + LOCK_SECONDS * 1000 })
    return LOCK_SECONDS
  }
  writeFailed({ count, lockedUntil: 0 })
  return 0
}

function clearFailedSignIns(): void {
  if (typeof window === 'undefined') return
  writeFailed({ count: 0, lockedUntil: 0 })
}

/**
 * 管理員切換身分（代入）：畫面與權限照被切換的帳號，但「實際登入者」仍記為管理員本人，
 * 所以切到業務之後還能再切、或一鍵回到本人。登出時一併清除。
 *
 * 判斷的是實際登入者是不是管理員，不是目前代入的身分——
 * 否則切到業務後就失去切換權，管理員本人反而回不來。
 * 頁首選單只對實際登入者為管理員時顯示，這裡是資料層的第二道。
 */
const SIGNED_IN_KEY = 'rorica-erp-signed-in-account'

function readSignedIn(): string | null {
  try {
    return window.sessionStorage.getItem(SIGNED_IN_KEY)
  } catch {
    return null
  }
}

function writeSignedIn(id: string | null): void {
  try {
    if (id === null) window.sessionStorage.removeItem(SIGNED_IN_KEY)
    else window.sessionStorage.setItem(SIGNED_IN_KEY, id)
  } catch {
    // 存不進去不影響本次瀏覽
  }
}

/** 實際以帳密登入的帳號 id；沒有代入時與目前身分相同 */
let signedInAccountId: string | null = typeof window === 'undefined' ? null : (readSignedIn() ?? currentAccountId)

/** 實際以帳密登入的帳號（代入別人時，這裡仍是管理員本人） */
export function getSignedInAccount(): Account | undefined {
  const id = signedInAccountId ?? currentAccountId
  return id === null ? undefined : accounts.find((a) => a.id === id)
}

/** 實際登入者是否為管理員：決定能不能切換身分 */
export function canSwitchAccount(): boolean {
  return Boolean(getSignedInAccount()?.roles.includes('管理員'))
}

export function switchAccountAsAdmin(id: string): void {
  if (!canSwitchAccount()) throw new Error('只有管理員可以切換身分')
  const target = accounts.find((a) => a.id === id)
  if (!target || target.status === '停用') throw new Error('該帳號不存在或已停用')
  currentAccountId = id
  writeStored(id)
}

export function signOut(): void {
  currentAccountId = null
  writeStored(null)
  signedInAccountId = null
  writeSignedIn(null)
}

/**
 * 取用目前帳號，未登入即丟錯。寫入類的動作要記「誰做的」，沒有登入者就不該往下走。
 * 唯讀路徑仍用 getCurrentAccount()——未登入時它回 undefined，權限層自然一律擋下。
 */
export function requireCurrentAccount(): Account {
  const account = getCurrentAccount()
  if (!account) throw new Error('尚未登入，無法執行此動作')
  return account
}

/** 直接指定身分：供測試腳本與原型的「切換身分」使用，不經過密碼 */
export function setCurrentAccountId(id: string): void {
  if (!accounts.some((a) => a.id === id)) throw new Error(`帳號 ${id} 不存在`)
  currentAccountId = id
  writeStored(id)
}

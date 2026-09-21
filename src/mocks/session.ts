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
  const account = accounts.find((a) => a.code.toLowerCase() === code.trim().toLowerCase())
  if (!account || account.password !== password || account.status === '停用') {
    throw new Error('帳號或密碼錯誤，或該帳號已停用')
  }
  currentAccountId = account.id
  writeStored(account.id)
  return account
}

export function signOut(): void {
  currentAccountId = null
  writeStored(null)
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

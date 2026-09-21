import type { Account } from '@/types'
import { accounts } from './data'

/**
 * 目前登入帳號（原型用）。
 *
 * 真實系統這是伺服器上的 session；原型沒有登入頁，改為由抬頭列切換帳號，
 * 讓權限規格的三層控制（功能／動作／欄位）在畫面上看得出效果。
 *
 * 放在 mocks 而非 React context，是因為 mutations.ts 扮演的是「後端」——
 * 權限規格第七章第 2 節要求可見性與動作權限的判定一律在後端進行，
 * 前端的隱藏只是呈現、不作為安全邊界。資料層要擋，就得在這一側知道呼叫者是誰。
 */

const STORAGE_KEY = 'rorica-erp-current-account'

/** 預設以業務身分進站：表1 與表8 的建單者，最能看到完整的主流程 */
const DEFAULT_ACCOUNT_ID = accounts.find((a) => a.roles.includes('業務'))?.id ?? accounts[0].id

function readStored(): string | null {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY)
  } catch {
    // 無痕視窗或封鎖網站資料時會丟例外，退回預設帳號即可
    return null
  }
}

let currentAccountId: string =
  typeof window === 'undefined' ? DEFAULT_ACCOUNT_ID : (readStored() ?? DEFAULT_ACCOUNT_ID)

export function getCurrentAccountId(): string {
  return currentAccountId
}

export function getCurrentAccount(): Account {
  return accounts.find((a) => a.id === currentAccountId) ?? accounts[0]
}

export function setCurrentAccountId(id: string): void {
  if (!accounts.some((a) => a.id === id)) throw new Error(`帳號 ${id} 不存在`)
  currentAccountId = id
  try {
    window.sessionStorage.setItem(STORAGE_KEY, id)
  } catch {
    // 存不進去不影響本次瀏覽，切換仍然生效
  }
}

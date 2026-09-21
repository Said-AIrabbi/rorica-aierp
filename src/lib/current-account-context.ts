import { createContext, useContext } from 'react'
import type { Account } from '@/types'
import type { docAccess, DocAction, DocKey, FieldGroup, MasterKey } from './permissions'

/**
 * 目前登入帳號的 context 與查詢介面。
 *
 * 與 Provider 分檔，是因為同一個檔案同時匯出元件與非元件時 fast-refresh 會失效
 * （oxlint react/only-export-components）。真值在 mocks/session.ts，這裡只是 React 側的讀取口。
 */
export interface CurrentAccountValue {
  account: Account
  switchTo: (id: string) => void
  /** 登出：回到登入頁並清掉查詢快取 */
  signOut: () => void
  /** ① 功能權限：看不看得到這張單據的入口 */
  canView: (doc: DocKey) => boolean
  access: (doc: DocKey) => ReturnType<typeof docAccess>
  /** ② 動作權限：按鈕能不能按 */
  can: (doc: DocKey, action: DocAction) => boolean
  actions: (doc: DocKey) => DocAction[]
  /**
   * 動作權限＋職責分離一次問完。回傳 undefined 代表可以按；
   * 回傳字串即為不能按的原因，直接拿去當按鈕的 title 或提示文字。
   */
  blockedReason: (doc: DocKey, action: DocAction, createdByAccountId?: string) => string | undefined
  /** ③ 欄位可見性 */
  canSee: (group: FieldGroup) => boolean
  canViewMasterData: (master: MasterKey) => boolean
  canMaintain: (master: MasterKey) => boolean
}

export const CurrentAccountContext = createContext<CurrentAccountValue | null>(null)

export function useCurrentAccount(): CurrentAccountValue {
  const ctx = useContext(CurrentAccountContext)
  if (!ctx) throw new Error('useCurrentAccount 必須在 CurrentAccountProvider 內使用')
  return ctx
}

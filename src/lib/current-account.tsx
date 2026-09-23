import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { accounts } from '@/mocks/data'
import { getCurrentAccountId, setCurrentAccountId, signIn, signOut } from '@/mocks/session'
import { LoginPage } from '@/features/auth/LoginPage'
import {
  actionsFor,
  canDoAction,
  canMaintainMaster,
  canSeeFieldGroup,
  canViewDoc,
  canViewMaster,
  docAccess,
  permissionSettingsVersion,
  separationViolation,
  subscribePermissionSettings,
} from './permissions'
import { CurrentAccountContext, type CurrentAccountValue } from './current-account-context'

/**
 * 目前登入帳號的 React 側包裝，同時扮演登入閘門。
 *
 * 真值放在 mocks/session.ts（資料層要用它判權限）；這裡負責兩件事：
 *   ① 未登入時整個系統換成登入頁——沒有身分就沒有權限，畫面也不該先出現
 *   ② 登入或切換身分後讓畫面重繪並清掉查詢快取
 */
export function CurrentAccountProvider({ children }: { children: ReactNode }) {
  const [accountId, setAccountId] = useState(getCurrentAccountId)
  const queryClient = useQueryClient()

  const switchTo = useCallback(
    (id: string) => {
      setCurrentAccountId(id)
      setAccountId(id)
      // 換身分等於換一組可見資料與可按按鈕，快取一律重取
      queryClient.invalidateQueries()
    },
    [queryClient],
  )

  const handleSignIn = useCallback(
    (code: string, password: string) => {
      const account = signIn(code, password)
      setAccountId(account.id)
      queryClient.invalidateQueries()
    },
    [queryClient],
  )

  const handleSignOut = useCallback(() => {
    signOut()
    setAccountId(null)
    queryClient.clear()
  }, [queryClient])

  const account = accountId === null ? undefined : accounts.find((a) => a.id === accountId)

  // 管理員調整權限設定後：查詢介面重建（側欄、按鈕即時更新），已取回的資料重取（欄位可見性可能變了）
  const settingsVersion = useSyncExternalStore(subscribePermissionSettings, permissionSettingsVersion)
  useEffect(() => {
    if (settingsVersion > 0) queryClient.invalidateQueries()
  }, [settingsVersion, queryClient])

  const value = useMemo<CurrentAccountValue | null>(() => {
    if (!account) return null
    return {
      account,
      switchTo,
      signOut: handleSignOut,
      canView: (doc) => canViewDoc(account, doc),
      access: (doc) => docAccess(account, doc),
      can: (doc, action) => canDoAction(account, doc, action),
      actions: (doc) => actionsFor(account, doc),
      blockedReason: (doc, action, createdByAccountId) => {
        if (!canDoAction(account, doc, action)) {
          return `「${account.name}」（${account.roles.join('、')}）沒有這個動作的權限`
        }
        return separationViolation(account, doc, action, createdByAccountId)
      },
      canSee: (group) => canSeeFieldGroup(account, group),
      canViewMasterData: (master) => canViewMaster(account, master),
      canMaintain: (master) => canMaintainMaster(account, master),
    }
    // settingsVersion 不在函式內使用，但變了就要產生新物件，下游才會重繪
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, switchTo, handleSignOut, settingsVersion])

  // 未登入（或帳號已被刪除）一律回登入頁
  if (!value) return <LoginPage onSignIn={handleSignIn} />

  return <CurrentAccountContext.Provider value={value}>{children}</CurrentAccountContext.Provider>
}

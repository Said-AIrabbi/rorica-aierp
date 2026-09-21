import { useCallback, useMemo, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { accounts } from '@/mocks/data'
import { getCurrentAccountId, setCurrentAccountId } from '@/mocks/session'
import {
  actionsFor,
  canDoAction,
  canMaintainMaster,
  canSeeFieldGroup,
  canViewDoc,
  canViewMaster,
  docAccess,
  separationViolation,
} from './permissions'
import { CurrentAccountContext, type CurrentAccountValue } from './current-account-context'

/**
 * 目前登入帳號的 React 側包裝。
 *
 * 真值放在 mocks/session.ts（資料層要用它判權限）；這裡只負責讓畫面在切換帳號後重繪。
 * 原型沒有登入頁，改由抬頭列切換身分——這樣權限規格的三層控制才看得出效果。
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

  const value = useMemo<CurrentAccountValue>(() => {
    const account = accounts.find((a) => a.id === accountId) ?? accounts[0]
    return {
      account,
      switchTo,
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
  }, [accountId, switchTo])

  return <CurrentAccountContext.Provider value={value}>{children}</CurrentAccountContext.Provider>
}

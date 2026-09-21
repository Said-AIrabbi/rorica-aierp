import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { UserMinus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { api } from '@/mocks/api'
import { setAccountExclusions } from '@/mocks/mutations'
import {
  DOC_ACTIONS,
  DOC_KEYS,
  DOC_LABELS,
  FIELD_GROUPS,
  canDoActionByRoles,
  canSeeFieldGroupByRoles,
} from '@/lib/permissions'
import type { Account } from '@/types'

/**
 * 權限設定 — 第二頁：個別排除。
 *
 * 最終權限 ＝（該帳號所有角色的聯集）－（本頁的排除清單），**排除永遠勝過聯集**。
 *
 * 與角色矩陣分成兩頁的理由（權限規格第二章）：單看矩陣時，「取消勾選」對只掛一個角色的人
 * 等於禁止、對掛兩個角色的人卻無效。把限制集中在這一頁，管理員才不會設了以為有效、實際上靜默失效。
 *
 * **只能收緊、不能放寬**：本頁只列出該帳號的角色「本來就給了」的項目，
 * 沒給的根本不出現——要放寬就去加角色，不能從這裡開後門。
 */
export function ExclusionsPage() {
  const queryClient = useQueryClient()
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: api.accounts })
  const [selectedId, setSelectedId] = useState<string>()

  const mutation = useMutation({
    mutationFn: ({ id, exclusions }: { id: string; exclusions: Account['exclusions'] }) =>
      setAccountExclusions(id, exclusions ?? {}),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.success('已更新個別排除')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const selected = accounts.find((a) => a.id === selectedId) ?? accounts[0]

  if (!selected) {
    return <p className="text-sm text-muted-foreground">沒有可維護的帳號。</p>
  }

  const excludedActions = selected.exclusions?.actions ?? []
  const excludedGroups = selected.exclusions?.fieldGroups ?? []

  const toggleAction = (doc: string, action: string, excluded: boolean) => {
    const actions = excluded
      ? [...excludedActions, { doc, action }]
      : excludedActions.filter((e) => !(e.doc === doc && e.action === action))
    mutation.mutate({ id: selected.id, exclusions: { actions, fieldGroups: excludedGroups } })
  }

  const toggleGroup = (group: string, excluded: boolean) => {
    const fieldGroups = excluded ? [...excludedGroups, group] : excludedGroups.filter((g) => g !== group)
    mutation.mutate({ id: selected.id, exclusions: { actions: excludedActions, fieldGroups } })
  }

  return (
    <div>
      <PageHeader
        title="權限設定 — 個別排除"
        description="針對單一帳號勾掉特定動作或欄位群組。排除永遠勝過角色聯集。"
        actions={
          <Link
            to="/settings/permissions"
            className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 text-sm text-ink-body hover:bg-muted"
          >
            角色矩陣（上一頁）
          </Link>
        }
      />

      <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <p className="font-medium text-ink-body">
          <UserMinus className="mr-1 inline h-4 w-4" />
          最終權限 ＝（該帳號所有角色的聯集）－（本頁的排除清單）
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
          <li>
            <b>取消角色矩陣的勾選不等於禁止</b>——多角色的人會從另一個角色拿回來。要確實禁止某個人，請用本頁
          </li>
          <li>
            <b>只能收緊、不能放寬</b>：本頁只列出該帳號的角色本來就給了的項目。要放寬請去加角色，不從這裡開後門
          </li>
        </ul>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        {/* 帳號清單 */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-base">帳號</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            {accounts.map((a) => {
              const count = (a.exclusions?.actions?.length ?? 0) + (a.exclusions?.fieldGroups?.length ?? 0)
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => setSelectedId(a.id)}
                  className={`flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-2 text-left text-sm ${
                    a.id === selected.id ? 'bg-brand text-white' : 'hover:bg-muted'
                  }`}
                >
                  <span>
                    <span className="font-mono text-xs">{a.code}</span>　{a.name}
                    <span className={`block text-xs ${a.id === selected.id ? 'text-white/80' : 'text-muted-foreground'}`}>
                      {a.roles.join('、')}
                      {a.status === '停用' && '（已停用）'}
                    </span>
                  </span>
                  {count > 0 && (
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[11px] ${
                        a.id === selected.id ? 'bg-white/20' : 'bg-warning/20 text-warning'
                      }`}
                    >
                      {count}
                    </span>
                  )}
                </button>
              )
            })}
          </CardContent>
        </Card>

        <div className="space-y-4 lg:col-span-3">
          {/* 動作排除 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                排除動作 — {selected.name}（{selected.roles.join('、')}）
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {DOC_KEYS.map((doc) => {
                  // 只列出這個帳號的角色本來就給了的動作
                  const granted = DOC_ACTIONS[doc].filter((action) =>
                    canDoActionByRoles(selected.roles, doc, action),
                  )
                  if (granted.length === 0) return null
                  return (
                    <div key={doc}>
                      <p className="mb-1 text-sm font-medium text-ink">{DOC_LABELS[doc]}</p>
                      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                        {granted.map((action) => {
                          const excluded = excludedActions.some((e) => e.doc === doc && e.action === action)
                          return (
                            <label key={action} className="flex items-center gap-1.5 text-sm">
                              <input
                                type="checkbox"
                                checked={excluded}
                                disabled={mutation.isPending}
                                onChange={(e) => toggleAction(doc, action, e.target.checked)}
                                className="h-4 w-4 accent-[var(--color-destructive)]"
                              />
                              <span className={excluded ? 'text-destructive line-through' : 'text-ink-body'}>
                                {action}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                勾起來＝<b>禁止</b>這個帳號做這件事，即使他的角色有這個權限。
              </p>
            </CardContent>
          </Card>

          {/* 欄位群組排除 */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">排除欄位群組</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {FIELD_GROUPS.filter((group) => canSeeFieldGroupByRoles(selected.roles, group)).map((group) => {
                  const excluded = excludedGroups.includes(group)
                  return (
                    <label key={group} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={excluded}
                        disabled={mutation.isPending}
                        onChange={(e) => toggleGroup(group, e.target.checked)}
                        className="h-4 w-4 accent-[var(--color-destructive)]"
                      />
                      <span className={excluded ? 'text-destructive line-through' : 'text-ink-body'}>{group}</span>
                    </label>
                  )
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                該帳號的角色看不到的群組不會列在這裡——排除只能收緊，不能用來放寬。
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

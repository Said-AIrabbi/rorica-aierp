import { useState } from 'react'
import { Link } from 'react-router-dom'
import { RotateCcw, ShieldCheck } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCurrentAccount } from '@/lib/current-account-context'
import {
  ACCOUNT_ROLES,
  DOC_ACTIONS,
  DOC_KEYS,
  DOC_LABELS,
  FIELD_GROUPS,
  FIELD_GROUP_CONTENT,
  docPermission,
  isDocPermissionOverridden,
  isFieldVisibilityOverridden,
  overriddenCount,
  permissionAuditLog,
  resetPermissionSettings,
  roleFieldVisible,
  setRoleDocAccess,
  setRoleDocAction,
  setRoleFieldVisibility,
  type DocAccess,
  type DocKey,
} from '@/lib/permissions'
import { formatDate } from '@/lib/dates'

const ACCESS_OPTIONS: { value: DocAccess; label: string; hint: string }[] = [
  { value: '可操作', label: '●', hint: '可操作' },
  { value: '唯讀', label: '○', hint: '唯讀檢視' },
  { value: '無權限', label: '－', hint: '無權限（介面不呈現）' },
]

/**
 * 權限設定 — 第一頁：角色矩陣。
 *
 * 權限規格的「重要前提」：權限是**可維護的設定值**，由管理員於介面上調整，
 * 不寫死在程式裡。本頁調的是「角色 × 單據 × 動作」與「角色 × 欄位群組」。
 *
 * 與「個別排除」刻意分成兩頁（第二章「為何分兩頁」）：單看本頁時，
 * 「取消勾選」對只掛一個角色的人等於禁止、對掛兩個角色的人卻無效——
 * 把限制集中在個別排除那一頁，管理員才不會設了以為有效、實際上靜默失效。
 */
export function RoleMatrixPage() {
  const { account } = useCurrentAccount()
  // 設定寫在模組層（非 react-query），故以計數器強制重繪
  const [, bump] = useState(0)
  const refresh = () => bump((n) => n + 1)

  const [openDoc, setOpenDoc] = useState<DocKey | null>('表1')
  const audit = permissionAuditLog()

  const guard = (fn: () => void, message: string) => {
    try {
      fn()
      refresh()
      toast.success(message)
    } catch (error) {
      toast.error((error as Error).message)
    }
  }

  return (
    <div>
      <PageHeader
        title="權限設定 — 角色矩陣"
        description="調整「誰可以對哪張單做哪件事、看到哪些欄位」。設定對象是角色，改一次全體生效。"
        actions={
          <>
            <Link
              to="/settings/exclusions"
              className="inline-flex items-center rounded-md border border-border px-2.5 py-1.5 text-sm text-ink-body hover:bg-muted"
            >
              個別排除（下一頁）
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                if (!window.confirm('將全部權限設定還原為出廠預設值，確定嗎？')) return
                guard(() => resetPermissionSettings(account), '已還原為出廠預設值')
              }}
            >
              <RotateCcw className="mr-1 h-4 w-4" /> 還原預設
            </Button>
          </>
        }
      />

      <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <p className="font-medium text-ink-body">
          <ShieldCheck className="mr-1 inline h-4 w-4" />
          目前有 {overriddenCount()} 格與出廠預設不同（以底色標示）
        </p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs">
          <li>設定對象是「角色」而非個別帳號——改一次角色設定，掛該角色的所有帳號一起生效</li>
          <li>
            多角色的帳號權限取<b>聯集</b>：取消本頁的勾選，對只掛一個角色的人等於禁止，對掛兩個角色的人卻無效。
            要確實禁止某個人，請用<Link to="/settings/exclusions" className="text-brand hover:underline">個別排除</Link>
          </li>
          <li>
            職責分離等八項業務約束（管理層不得建立表1／表9、建單者不得自行簽核等）
            <b>不出現在本頁</b>，於資料層強制執行，不開放關閉
          </li>
        </ul>
      </div>

      {/* ---------- 角色 × 單據 × 動作 ---------- */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">角色 × 單據 × 動作</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-medium text-muted-foreground">單據</th>
                  {ACCOUNT_ROLES.map((role) => (
                    <th key={role} className="px-2 py-2 text-center font-medium text-muted-foreground">
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DOC_KEYS.map((doc) => (
                  <tr key={doc} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        className="text-left font-medium text-brand hover:underline"
                        onClick={() => setOpenDoc(openDoc === doc ? null : doc)}
                      >
                        {DOC_LABELS[doc]}
                      </button>
                    </td>
                    {ACCOUNT_ROLES.map((role) => {
                      const perm = docPermission(doc, role)
                      const changed = isDocPermissionOverridden(doc, role)
                      return (
                        <td key={role} className={`px-2 py-2 text-center ${changed ? 'bg-warning/10' : ''}`}>
                          <select
                            value={perm.access}
                            onChange={(e) =>
                              guard(
                                () => setRoleDocAccess(account, doc, role, e.target.value as DocAccess),
                                `已將「${role}」在${DOC_LABELS[doc]}改為「${e.target.value}」`,
                              )
                            }
                            className="rounded border border-border bg-surface px-1.5 py-1 text-sm"
                          >
                            {ACCESS_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value} title={o.hint}>
                                {o.label} {o.hint}
                              </option>
                            ))}
                          </select>
                          {perm.actions.length > 0 && (
                            <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                              {perm.actions.join('、')}
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 點單據名稱展開該張單的動作勾選 */}
          {openDoc && (
            <div className="mt-4 rounded-lg border border-border p-3">
              <p className="mb-2 text-sm font-medium text-ink">{DOC_LABELS[openDoc]} 的動作</p>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <th className="py-1.5 pr-3 font-medium text-muted-foreground">動作</th>
                      {ACCOUNT_ROLES.map((role) => (
                        <th key={role} className="px-2 py-1.5 text-center font-medium text-muted-foreground">
                          {role}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DOC_ACTIONS[openDoc].map((action) => (
                      <tr key={action} className="border-b border-border/60">
                        <td className="py-1.5 pr-3">{action}</td>
                        {ACCOUNT_ROLES.map((role) => {
                          const checked = docPermission(openDoc, role).actions.includes(action)
                          return (
                            <td key={role} className="px-2 py-1.5 text-center">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) =>
                                  guard(
                                    () =>
                                      setRoleDocAction(account, openDoc, role, action, e.target.checked),
                                    `已${e.target.checked ? '開放' : '取消'}「${role}」的「${action}」`,
                                  )
                                }
                                className="h-4 w-4 accent-[var(--color-brand)]"
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                勾選任一動作會自動把該格提升為「● 可操作」；改為唯讀或無權限時，該角色在這張單上的動作一併清空。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* ---------- 角色 × 欄位群組 ---------- */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle className="text-base">角色 × 欄位群組</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="py-2 pr-3 font-medium text-muted-foreground">欄位群組</th>
                  {ACCOUNT_ROLES.map((role) => (
                    <th key={role} className="px-2 py-2 text-center font-medium text-muted-foreground">
                      {role}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {FIELD_GROUPS.map((group) => (
                  <tr key={group} className="border-b border-border/60 align-top">
                    <td className="py-2 pr-3">
                      <div className="font-medium text-ink">{group}</div>
                      <div className="text-[11px] leading-tight text-muted-foreground">
                        {FIELD_GROUP_CONTENT[group]}
                      </div>
                    </td>
                    {ACCOUNT_ROLES.map((role) => (
                      <td
                        key={role}
                        className={`px-2 py-2 text-center ${
                          isFieldVisibilityOverridden(role, group) ? 'bg-warning/10' : ''
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={roleFieldVisible(role, group)}
                          onChange={(e) =>
                            guard(
                              () => setRoleFieldVisibility(account, role, group, e.target.checked),
                              `已將「${role}」對「${group}」改為${e.target.checked ? '可見' : '不可見'}`,
                            )
                          }
                          className="h-4 w-4 accent-[var(--color-brand)]"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            不可見的欄位不輸出到前端，也不出現在該角色觸發的列印版面（決策16）。未指派群組的欄位一律預設不可見（決策36）。
          </p>
        </CardContent>
      </Card>

      {/* ---------- 稽核軌跡 ---------- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">權限異動稽核軌跡</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-muted-foreground">本次瀏覽尚無權限異動。</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {audit.slice(0, 30).map((entry, i) => (
                <li key={i} className="flex gap-3 border-b border-border/60 pb-1 last:border-0">
                  <span className="shrink-0 text-muted-foreground">{formatDate(entry.at)}</span>
                  <span className="shrink-0 font-medium text-ink-body">{entry.byAccountName}</span>
                  <span className="text-ink-body">{entry.description}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            每次權限異動寫入稽核軌跡（何人、何時、把哪個角色的哪項權限改成什麼），不覆蓋前次紀錄（決策20）。
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

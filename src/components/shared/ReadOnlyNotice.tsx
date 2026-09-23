import type { ReactNode } from 'react'
import { Link, Outlet } from 'react-router-dom'
import { Eye } from 'lucide-react'
import { useCurrentAccount } from '@/lib/current-account-context'
import { DOC_LABELS, type DocAction, type DocKey } from '@/lib/permissions'

/**
 * 唯讀提示：目前帳號對這張單據只有檢視權時，放在詳情頁頂端說明「為什麼看不到編輯按鈕」。
 * 可操作的角色不顯示任何東西。
 */
export function ReadOnlyNotice({ doc, printable = true }: { doc: DocKey; printable?: boolean }) {
  const { account, access } = useCurrentAccount()
  if (access(doc) !== '唯讀') return null
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-ink-body print:hidden">
      <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span>
        你的角色（{account.roles.join('、')}）對{DOC_LABELS[doc]}為<b>唯讀</b>：
        {printable ? '可檢視、列印，不可建立或修改。' : '可檢視，不可列印、建立或修改。'}
      </span>
    </div>
  )
}

/**
 * 路由層的動作保護：沒有該動作權限時不渲染頁面，改顯示說明與返回連結。
 * 用在「新增」這類整頁都是寫入的畫面——只藏列表上的新增按鈕不夠，網址直接打進來仍進得去。
 */
export function RequireAction({
  doc,
  action,
  backTo,
  children,
}: {
  doc: DocKey
  action: DocAction
  backTo: string
  children: ReactNode
}) {
  const { account, can } = useCurrentAccount()
  if (can(doc, action)) return <>{children}</>
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-ink-body">
      你的角色（{account.roles.join('、')}）沒有{DOC_LABELS[doc]}的「{action}」權限。
      <Link to={backTo} className="ml-2 text-brand-dark underline">
        返回列表
      </Link>
    </div>
  )
}

/**
 * 路由層的檢視保護：該角色對這張單據為「無權限」時，整組頁面（列表、詳情、新增）都不渲染。
 * 側欄已經不顯示入口，但網址直接打進來仍要擋——否則只是看到一張空列表，像是壞掉而不是沒權限。
 */
export function RequireView({ doc }: { doc: DocKey }) {
  const { account, canView } = useCurrentAccount()
  if (canView(doc)) return <Outlet />
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-ink-body">
      你的角色（{account.roles.join('、')}）沒有{DOC_LABELS[doc]}的檢視權限。
      <Link to="/" className="ml-2 text-brand-dark underline">
        返回首頁
      </Link>
    </div>
  )
}

/** 帳戶主檔（含角色權限、個別排除分頁）僅管理員可進入（權限規格第七章第 1 節：帳號管理僅管理員） */
export function RequireAdmin() {
  const { account } = useCurrentAccount()
  if (account.roles.includes('管理員')) return <Outlet />
  return (
    <div className="rounded-lg border border-border bg-muted/50 p-4 text-sm text-ink-body">
      帳戶主檔與權限設定僅管理員可進入。
      <Link to="/" className="ml-2 text-brand-dark underline">
        返回首頁
      </Link>
    </div>
  )
}

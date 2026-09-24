import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bell, Download, LogOut, Menu, UserCog } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/mocks/api'
import { buildNotifications } from '@/lib/notifications'
import { accounts, buildSessionSnapshot } from '@/mocks/data'
import { useCurrentAccount } from '@/lib/current-account-context'
import { isRemoteStorage, workspaceId } from '@/prototype-storage'

/**
 * 匯出目前資料（JSON）。
 *
 * 取代原本的「重置模擬資料」——資料改為共用且留存之後，那顆按鈕會一鍵毀掉所有人的進度。
 * 要回到乾淨資料，改用沒被用過的工作區代碼（?ws=）或另一個純展示版本。
 * 這裡留一條自己備份的路：展示環境不保證永久保存，想留住的東西請自己存一份。
 */
function exportSnapshot() {
  const stamp = new Date().toISOString().slice(0, 19).replaceAll(':', '').replace('T', '-')
  const name = isRemoteStorage() ? `rorica-erp-${workspaceId()}-${stamp}.json` : `rorica-erp-${stamp}.json`
  const blob = new Blob([JSON.stringify(buildSessionSnapshot(), null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function Header({ className = '', onMenuClick }: { className?: string; onMenuClick?: () => void }) {
  const { account, switchTo, signOut } = useCurrentAccount()
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })
  const { data: stockReservations = [] } = useQuery({ queryKey: ['stockReservations'], queryFn: api.stockReservations })
  const { data: proformaInvoices = [] } = useQuery({ queryKey: ['proformaInvoices'], queryFn: api.proformaInvoices })
  const notifications = buildNotifications(packingNotices, purchaseOrders, stockReservations, proformaInvoices)

  return (
    <header className={`flex h-16 items-center justify-between gap-2 border-b border-border bg-surface px-4 sm:px-6 ${className}`}>
      <div className="flex min-w-0 items-center gap-2">
        {/* < md 沒有固定側欄，導覽入口改由此開啟抽屜 */}
        <button
          type="button"
          onClick={onMenuClick}
          aria-label="開啟導覽"
          className="-ml-1 rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-ink md:hidden"
        >
          <Menu className="h-5 w-5" />
        </button>
        <div className="min-w-0 truncate text-sm text-muted-foreground">
          {/* 螢幕窄時只留客戶名稱本身，「客戶：」與英文全名讓位給右側操作 */}
          <span className="hidden lg:inline">客戶：</span>
          <span className="font-medium text-ink">
            <span className="hidden lg:inline">RORICA TEXTILE CO., LTD.（皇加布業）</span>
            <span className="lg:hidden">皇加布業</span>
          </span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <button
          type="button"
          onClick={exportSnapshot}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-ink sm:px-2.5"
          title="把目前所有單據與主檔存成一個 JSON 檔案留底"
        >
          <Download className="h-3.5 w-3.5" /> <span className="hidden sm:inline">匯出目前資料</span>
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-ink"
              aria-label="通知"
            >
              <Bell className="h-5 w-5" />
              {notifications.length > 0 && (
                <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-destructive" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[min(20rem,calc(100vw-2rem))]">
            <DropdownMenuLabel>
              通知中心（展示用，依現有資料即時運算，非真實推播機制）
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.length === 0 ? (
              <div className="px-2 py-3 text-sm text-muted-foreground">目前沒有待處理提醒</div>
            ) : (
              notifications.map((n) => (
                <DropdownMenuItem key={n.id} asChild>
                  <Link to={n.link} className="flex flex-col items-start gap-0.5 whitespace-normal">
                    <span className="text-xs font-medium text-brand-dark">{n.type}</span>
                    <span className="text-sm text-ink-body">{n.message}</span>
                  </Link>
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        {/*
          身分切換：原型沒有登入頁，改由此處切換帳號，
          讓權限規格的三層控制（側欄／按鈕／欄位）在畫面上看得出效果。
        */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-2 rounded-md px-1 py-1 hover:bg-muted"
              title="切換目前登入身分（原型展示用）"
            >
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-blue text-xs font-semibold text-white">
                {account.name.slice(0, 1)}
              </div>
              {/* 頭像在小螢幕已足以辨識目前身分，姓名與角色僅在 sm 以上顯示 */}
              <div className="hidden text-left text-sm sm:block">
                <div className="font-medium text-ink">{account.name}</div>
                <div className="text-xs text-muted-foreground">{account.roles.join('、')}</div>
              </div>
              <UserCog className="hidden h-3.5 w-3.5 text-muted-foreground sm:block" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-2rem))]">
            <DropdownMenuLabel>
              切換身分（原型展示用，不需重新輸入密碼）
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {accounts
              .filter((a) => a.status === '啟用')
              .map((a) => (
                <DropdownMenuItem key={a.id} onSelect={() => switchTo(a.id)}>
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className={a.id === account.id ? 'font-semibold text-brand-dark' : ''}>{a.name}</span>
                    <span className="text-xs text-muted-foreground">{a.roles.join('、')}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={signOut}>
              <LogOut className="mr-2 h-3.5 w-3.5" /> 登出
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

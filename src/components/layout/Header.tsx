import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bell, Menu, RotateCcw } from 'lucide-react'
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
import { clearSessionSnapshot } from '@/mocks/data'

function resetDemoData() {
  if (!window.confirm('重置模擬資料將清除本次瀏覽分頁中測試建立/異動的所有單據，回到預設展示資料，確定要重置嗎？')) {
    return
  }
  clearSessionSnapshot()
  window.location.reload()
}

export function Header({ className = '', onMenuClick }: { className?: string; onMenuClick?: () => void }) {
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })
  const { data: stockReservations = [] } = useQuery({ queryKey: ['stockReservations'], queryFn: api.stockReservations })
  const notifications = buildNotifications(packingNotices, purchaseOrders, stockReservations)

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
          onClick={resetDemoData}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-ink sm:px-2.5"
          title="清除本次測試建立/異動的單據，回到預設展示資料"
        >
          <RotateCcw className="h-3.5 w-3.5" /> <span className="hidden sm:inline">重置模擬資料</span>
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
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-blue text-xs font-semibold text-white">
            陳
          </div>
          {/* 頭像在小螢幕已足以辨識目前身分，姓名與角色僅在 sm 以上顯示 */}
          <div className="hidden text-sm sm:block">
            <div className="font-medium text-ink">陳美玲</div>
            <div className="text-xs text-muted-foreground">業務</div>
          </div>
        </div>
      </div>
    </header>
  )
}

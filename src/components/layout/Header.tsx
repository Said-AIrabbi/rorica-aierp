import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bell, RotateCcw } from 'lucide-react'
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

export function Header({ className = '' }: { className?: string }) {
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })
  const { data: stockReservations = [] } = useQuery({ queryKey: ['stockReservations'], queryFn: api.stockReservations })
  const notifications = buildNotifications(packingNotices, purchaseOrders, stockReservations)

  return (
    <header className={`flex h-16 items-center justify-between border-b border-border bg-surface px-6 ${className}`}>
      <div className="text-sm text-muted-foreground">
        客戶：<span className="font-medium text-ink">RORICA TEXTILE CO., LTD.（皇加布業）</span>
      </div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={resetDemoData}
          className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-ink"
          title="清除本次測試建立/異動的單據，回到預設展示資料"
        >
          <RotateCcw className="h-3.5 w-3.5" /> 重置模擬資料
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
          <DropdownMenuContent align="end" className="w-80">
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
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-blue text-xs font-semibold text-white">
            陳
          </div>
          <div className="text-sm">
            <div className="font-medium text-ink">陳美玲</div>
            <div className="text-xs text-muted-foreground">業務</div>
          </div>
        </div>
      </div>
    </header>
  )
}

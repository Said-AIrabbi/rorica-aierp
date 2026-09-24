import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { api } from '@/mocks/api'
import { markNotificationsRead } from '@/mocks/mutations'
import { unreadDocumentEvents } from '@/mocks/document-events'
import { buildNotifications } from '@/lib/notifications'
import { DOC_LABELS } from '@/lib/permissions'
import { useCurrentAccount } from '@/lib/current-account-context'

/**
 * 通知中心。兩種東西放在同一顆鈴鐺底下，但性質不同，故分段顯示：
 *
 *   單據異動——**誰做了什麼**。任一單據新增或更新即記一筆，全員共用同一份清單
 *               （資料層如何偵測見 src/mocks/document-events.ts）。
 *   待辦提醒——**什麼快到期了**。依現有資料即時運算，沒有事件、也沒有已讀。
 *
 * 紅點只算單據異動的未讀：待辦提醒只要條件還成立就一直在，拿它當未讀會永遠消不掉。
 */

/** 本機模式下資料只在自己這一分頁，5 秒輪詢純粹是記憶體讀取；遠端模式另有 15 秒的伺服器輪詢 */
const REFRESH_MS = 5000

export function NotificationBell() {
  const { account } = useCurrentAccount()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data: events = [] } = useQuery({
    queryKey: ['documentEvents'],
    queryFn: api.documentEvents,
    refetchInterval: REFRESH_MS,
  })
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })
  const { data: stockReservations = [] } = useQuery({ queryKey: ['stockReservations'], queryFn: api.stockReservations })
  const { data: proformaInvoices = [] } = useQuery({ queryKey: ['proformaInvoices'], queryFn: api.proformaInvoices })
  const reminders = buildNotifications(packingNotices, purchaseOrders, stockReservations, proformaInvoices)

  const unread = unreadDocumentEvents(events, account.id)

  /**
   * 別人剛做的事跳一則提示。
   *
   * 只認「這一次開著畫面期間才出現」的事件——第一次載入時把既有的通知全部認作已見過，
   * 否則每次重新整理都會被十幾則舊消息淹沒。
   */
  const seen = useRef<Set<string> | undefined>(undefined)
  useEffect(() => {
    if (!seen.current) {
      seen.current = new Set(events.map((e) => e.id))
      return
    }
    const fresh = events.filter((e) => !seen.current!.has(e.id))
    fresh.forEach((e) => seen.current!.add(e.id))
    const others = fresh.filter((e) => e.actorId !== account.id)
    if (others.length === 0) return
    const first = others[0]
    toast(`${first.actorName}：${DOC_LABELS[first.doc]} ${first.kind}`, {
      description: others.length === 1 ? first.summary : `${first.summary}（另有 ${others.length - 1} 則異動）`,
    })
  }, [events, account.id])

  /** 打開就算讀過。已讀時間點寫進資料裡，換裝置不會又看到同一批紅點 */
  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next || unread.length === 0) return
    void markNotificationsRead().then(() => queryClient.invalidateQueries({ queryKey: ['documentEvents'] }))
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="relative rounded-full p-2 text-muted-foreground hover:bg-muted hover:text-ink"
          aria-label={unread.length > 0 ? `通知（${unread.length} 則未讀）` : '通知'}
        >
          <Bell className="h-5 w-5" />
          {unread.length > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white">
              {unread.length > 99 ? '99+' : unread.length}
            </span>
          ) : (
            reminders.length > 0 && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent-blue" />
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-[min(32rem,calc(100vh-6rem))] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto"
      >
        <DropdownMenuLabel>單據異動（任一單據有新增或更新即通知全體）</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {events.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">目前沒有單據異動</div>
        ) : (
          events.slice(0, 30).map((e) => (
            <DropdownMenuItem key={e.id} asChild>
              <Link to={e.link} className="flex flex-col items-start gap-0.5 whitespace-normal">
                <span className="flex w-full items-baseline justify-between gap-2">
                  <span className="text-xs font-medium text-brand-dark">
                    {DOC_LABELS[e.doc]} · {e.kind}
                    {e.count > 1 && ` ${e.count} 筆`}
                  </span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {dayjs(e.at).format('MM/DD HH:mm')}
                  </span>
                </span>
                <span className="text-sm text-ink-body">{e.summary}</span>
                <span className="text-[11px] text-muted-foreground">
                  {e.actorId === account.id ? '你' : e.actorName}
                </span>
              </Link>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuLabel>待辦提醒（依現有資料即時運算，非真實推播機制）</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {reminders.length === 0 ? (
          <div className="px-2 py-3 text-sm text-muted-foreground">目前沒有待處理提醒</div>
        ) : (
          reminders.map((n) => (
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
  )
}

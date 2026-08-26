import dayjs from 'dayjs'
import { addWorkdays } from '@/lib/dates'
import { freezeDate, isFrozen, isPurchaseOrderOverdue } from '@/lib/workflow'
import type { PackingNotice, PurchaseOrder, StockReservation } from '@/types'

/**
 * 展示用通知中心：純前端依現有 mock 資料即時運算，不具備真正的排程/推播能力，
 * 也不區分帳號已讀狀態；真實後端需求詳見 docs/backend-infra-requirements.md。
 */
export interface NotificationItem {
  id: string
  type: '凍結提醒' | '逾期提醒' | '預留到期提醒' | '新草稿待處理'
  message: string
  link: string
}

/** 庫存預留到期提醒：到期前 1 天 */
const RESERVATION_REMINDER_DAYS = 1

/** 凍結提醒：凍結前 1 個工作天。以「今天再推 1 個工作天」是否已達凍結日判斷，跨週末不會提早或漏發 */
function isFreezeReminderDue(freezeAt: dayjs.Dayjs, now: dayjs.Dayjs): boolean {
  return !addWorkdays(now, 1).isBefore(freezeAt, 'day')
}

export function buildNotifications(
  packingNotices: PackingNotice[],
  purchaseOrders: PurchaseOrder[],
  stockReservations: StockReservation[],
): NotificationItem[] {
  const now = dayjs()
  const items: NotificationItem[] = []

  packingNotices.forEach((n) => {
    // 草稿狀態尚未正式生效，不受凍結旗標限制，故不需提醒即將凍結
    if (n.status === '草稿' || isFrozen(n.effectiveAt)) return
    const freezeAt = freezeDate(n.effectiveAt)
    if (freezeAt && isFreezeReminderDue(freezeAt, now)) {
      items.push({
        id: `freeze-${n.id}`,
        type: '凍結提醒',
        message: `${n.id} 將於 ${freezeAt.format('MM/DD')} 自動凍結，如需修改請儘速處理`,
        link: `/packing-notice/${n.id}`,
      })
    }
  })

  purchaseOrders.forEach((o) => {
    // 草稿狀態尚未送出，不受凍結旗標限制，故不需提醒即將凍結
    if (o.status !== '草稿' && !isFrozen(o.effectiveAt)) {
      const freezeAt = freezeDate(o.effectiveAt)
      if (freezeAt && isFreezeReminderDue(freezeAt, now)) {
        items.push({
          id: `freeze-${o.id}`,
          type: '凍結提醒',
          message: `${o.id} 將於 ${freezeAt.format('MM/DD')} 自動凍結，如需修改請儘速處理`,
          link: `/purchase-order/${o.id}`,
        })
      }
    }

    if (isPurchaseOrderOverdue(o)) {
      items.push({
        id: `overdue-${o.id}`,
        type: '逾期提醒',
        message: `${o.id} 建立超過 2 天仍未簽回，請跟催廠商`,
        link: `/purchase-order/${o.id}`,
      })
    }
    if (o.status === '草稿') {
      items.push({
        id: `draft-${o.id}`,
        type: '新草稿待處理',
        message: `${o.id} 因表1包裝通知單無現貨已自動建立草稿，請補齊廠商/類型等資訊`,
        link: `/purchase-order/${o.id}`,
      })
    }
  })

  stockReservations.forEach((r) => {
    if (r.status !== '預留中') return
    const expiresAt = dayjs(r.expiresAt)
    if (expiresAt.diff(now, 'day') <= RESERVATION_REMINDER_DAYS && expiresAt.diff(now, 'day') >= 0) {
      items.push({
        id: `reservation-${r.id}`,
        type: '預留到期提醒',
        message: `${r.productName}／${r.color} 庫存預留將於 ${expiresAt.format('MM/DD')} 到期`,
        link: `/packing-notice/${r.packingNoticeId}`,
      })
    }
  })

  return items
}

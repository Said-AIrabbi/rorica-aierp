import dayjs, { type Dayjs } from 'dayjs'

/** 交期預設天數：公司統一 14 天，不同客戶可個別調整 */
export const DEFAULT_LEAD_TIME_DAYS = 14

/** 建單後自動簽核鎖定天數 */
export const AUTO_SIGN_LOCK_WORKDAYS = 7

/** 顏色超過幾個月未使用視為「疑似覆色」 */
export const COLOR_STALE_MONTHS = 12

export function formatDate(date: string | Date | Dayjs | undefined | null): string {
  if (!date) return '-'
  return dayjs(date).format('YYYY/MM/DD')
}

export function formatDateTime(date: string | Date | Dayjs | undefined | null): string {
  if (!date) return '-'
  return dayjs(date).format('YYYY/MM/DD HH:mm')
}

/** 略過週末的工作天推算（不處理國定假日，prototype 簡化版） */
export function addWorkdays(date: string | Date | Dayjs, workdays: number): Dayjs {
  let result = dayjs(date)
  let remaining = workdays
  while (remaining > 0) {
    result = result.add(1, 'day')
    const day = result.day()
    if (day !== 0 && day !== 6) {
      remaining -= 1
    }
  }
  return result
}

export function expectedDeliveryDate(
  createdAt: string | Date | Dayjs,
  leadTimeDays: number = DEFAULT_LEAD_TIME_DAYS,
): Dayjs {
  return dayjs(createdAt).add(leadTimeDays, 'day')
}

export function isColorStale(lastUsedAt: string | Date | Dayjs | undefined | null): boolean {
  if (!lastUsedAt) return false
  return dayjs().diff(dayjs(lastUsedAt), 'month') >= COLOR_STALE_MONTHS
}

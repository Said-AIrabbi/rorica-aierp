import dayjs, { type Dayjs } from 'dayjs'
import { isFrozen } from '@/lib/workflow'
import type {
  DyeOrder,
  PackingNotice,
  PiCurrency,
  ProformaInvoice,
  PurchaseOrder,
  SecondaryProcessingOrder,
} from '@/types'

/**
 * Phase 2 PI 單的共用規則。
 * 規格見 docs/PRD-Phase2-PI-2026-09-18.md；本檔集中放「算得出來的規則」
 * （有效期、自動作廢、應出貨日、覆蓋規則判定），畫面與資料層共用同一份，避免兩邊各算一次。
 */

/** 報價有效期：自建單日起 14 天，逾期價格作廢但單據保留、可複製（決策1） */
export const PI_QUOTE_VALID_DAYS = 14

/** 未成交自動作廢：建立滿 3 個月仍未簽回轉換者一律作廢，不因重新報價而展延（決策2） */
export const PI_AUTO_VOID_MONTHS = 3

/**
 * 付款條件常用模式（2026/09/17 皇加提供，共 11 項）。
 * 選用後可自行修改；含 ％／天數者以底線留空，由業務直接在文字上填數字。
 */
export const PI_PAYMENT_TERM_TEMPLATES = [
  'T/T BEFORE SHIPMENT',
  'T/T AFTER SHIPMENT',
  '___% DEPOSIT IN ADVANCE FOR PRODUCTION; ___% T/T BEFORE SHIPMENT',
  'L/C AT SIGHT',
  'L/C AT USANCE 90 DAYS',
  'D/A',
  'D/P AT SIGHT',
  '月結30天',
  '月結45天',
  '月結60天',
  '月結90天',
] as const

/** 貿易條件的中文別稱，僅供畫面提示，列印一律印英文代號 */
export const PI_TRADE_TERM_HINTS: Record<string, string> = {
  EXW: '工廠交貨',
  FOB: '船上交貨',
  CFR: '亦寫作 C&F',
  CIF: '含保險費運費',
  FCA: '貨交運送人',
  'DOOR TO DOOR': '門到門',
  'EXPRESS COURIER': '快遞',
}

/**
 * 簡易匯率參照（決策41）：商品主檔價格一律以 NTD 為主，選用外幣時僅供業務報價時換算參考。
 * 不入帳、不追溯歷史匯率——換算損益屬 Phase 3，故此處是固定參照值而非即時匯率。
 */
export const PI_FX_REFERENCE: Record<PiCurrency, number> = {
  NTD: 1,
  USD: 32,
  RMB: 4.5,
}

export const PI_CURRENCY_SYMBOL: Record<PiCurrency, string> = {
  NTD: 'NT$',
  USD: 'US$',
  RMB: '¥',
}

/** 主檔牌價（NTD）換算為該幣別的參照金額 */
export function ntdToCurrency(ntd: number, currency: PiCurrency): number {
  return ntd / PI_FX_REFERENCE[currency]
}

/** PI 總金額：單價 × 數量逐列加總（決策13） */
/**
 * PI 總金額。看不到售價的角色（生管、倉管）拿到的明細**沒有 unitPrice 這個欄位**
 * （欄位可見性會直接刪掉），此時回傳 undefined 而不是 NaN——
 * 算不出來要講「算不出來」，不是丟一個會在畫面上變成「NaN」的數字出去。
 */
export function piTotalAmount(pi: ProformaInvoice): number | undefined {
  if (pi.items.some((item) => item.unitPrice == null)) return undefined
  return pi.items.reduce((sum, item) => sum + item.unitPrice * item.yard, 0)
}

export function piQuoteValidUntil(createdAt: string | Date | Dayjs): Dayjs {
  return dayjs(createdAt).add(PI_QUOTE_VALID_DAYS, 'day')
}

export function piAutoVoidAt(createdAt: string | Date | Dayjs): Dayjs {
  return dayjs(createdAt).add(PI_AUTO_VOID_MONTHS, 'month')
}

/**
 * 待人工處理（規則3）：取代版偵測到下游已對外發出後掛上，裁決前一律成立。
 * 這不是一個狀態——PI 仍留在草稿，只是動不了（決策27）。
 */
export function isPiOnManualHold(pi: ProformaInvoice): boolean {
  return Boolean(pi.manualHandling && !pi.manualHandling.resolvedAt)
}

/**
 * 畫面實際顯示的狀態：報價逾期與 3 個月自動作廢都是「時間到了就成立」，
 * 不需要有人按按鈕，故比照表2 逾期的做法即時推算，不寫回資料。
 * 已簽回之後的狀態（已轉換等）不再受這兩個時鐘影響。
 * 待人工處理中的 PI 也不自動作廢——爭議卡著不是業務不處理，時鐘不該繼續跑。
 */
export function effectivePiStatus(pi: ProformaInvoice): ProformaInvoice['status'] {
  if (pi.status === '已作廢' || pi.status === '已轉換') return pi.status
  if (isPiOnManualHold(pi)) return pi.status
  const now = dayjs()
  if (pi.status !== '已簽回' && now.isAfter(piAutoVoidAt(pi.createdAt))) return '已作廢'
  if (pi.status === '待簽回' && now.isAfter(dayjs(pi.quoteValidUntil))) return '已逾期'
  return pi.status
}

/** 逾期後不可直接簽回，須先重新報價並批准（Phase 2 第三章狀態流程） */
export function canSignBackPi(pi: ProformaInvoice): boolean {
  return !isPiOnManualHold(pi) && effectivePiStatus(pi) === '待簽回'
}

export function canConvertPi(pi: ProformaInvoice): boolean {
  return !isPiOnManualHold(pi) && effectivePiStatus(pi) === '已簽回'
}

/**
 * 應出貨日（決策31、36）：Day 0 為該 PI 底下「第一張」表1 的**生效日**，
 * 全批共用同一個到期日，不因後續分批建單而各自重算。
 * 表1 都還沒生效時交期尚未起算，回傳 undefined。
 */
export function piDueDate(pi: ProformaInvoice, packingNotices: PackingNotice[]): Dayjs | undefined {
  const effectiveDates = packingNotices
    .filter((n) => pi.packingNoticeIds.includes(n.id) && n.effectiveAt)
    .map((n) => dayjs(n.effectiveAt))
  if (effectiveDates.length === 0) return undefined
  const day0 = effectiveDates.reduce((earliest, d) => (d.isBefore(earliest) ? d : earliest))
  return day0.add(pi.leadTimeDays, 'day')
}

/** 逾期預警掛在 PI 層級：底下只要還有未出貨（未完成）的表1，過了應出貨日即成立 */
export function isPiShipmentOverdue(pi: ProformaInvoice, packingNotices: PackingNotice[]): boolean {
  const due = piDueDate(pi, packingNotices)
  if (!due) return false
  const pending = packingNotices.filter((n) => pi.packingNoticeIds.includes(n.id) && n.status !== '已完成')
  return pending.length > 0 && dayjs().isAfter(due, 'day')
}

/**
 * 「已對外發出」的判定（決策26）：分界是有沒有讓外部廠商動起來，而非單據是否存在——
 * 表1 判無庫存時系統會自動建立表2 草稿，把該草稿也算已開的話，規則2 在無庫存路徑上永遠不成立。
 * 回傳擋下的原因清單，空陣列代表下游都還沒對外。
 */
export function piDownstreamBlockers(
  packingNoticeId: string,
  purchaseOrders: PurchaseOrder[],
  dyeOrders: DyeOrder[],
  secondaryProcessingOrders: SecondaryProcessingOrder[],
): string[] {
  const blockers: string[] = []
  purchaseOrders
    .filter((o) => o.parentId === packingNoticeId && o.status !== '草稿')
    .forEach((o) => blockers.push(`${o.id} 訂購單已送出廠商`))
  dyeOrders
    .filter((o) => o.parentId === packingNoticeId && o.status !== '草稿')
    .forEach((o) => blockers.push(`${o.id} 染單已生效發包`))
  secondaryProcessingOrders
    .filter((o) => o.parentId === packingNoticeId && o.status !== '草稿')
    .forEach((o) => blockers.push(`${o.id} 二次加工單已發包`))
  return blockers
}

export type PiOverwriteRule =
  | { rule: 0; packingNoticeId: string; reason: string }
  | { rule: 1; packingNoticeId: string }
  | { rule: 2; packingNoticeId: string }
  | { rule: 3; packingNoticeId: string; blockers: string[] }

/**
 * 取代版 PI 對單一張表1 的覆蓋規則（Phase 2 第四章第 2 節）：
 * 0 凍結（最高優先，一律不適用以下規則）→ 1 草稿直接覆蓋 → 2 已生效未對外發出可更新 → 3 已對外發出擋下。
 */
export function piOverwriteRule(
  notice: PackingNotice,
  purchaseOrders: PurchaseOrder[],
  dyeOrders: DyeOrder[],
  secondaryProcessingOrders: SecondaryProcessingOrder[],
): PiOverwriteRule {
  if (notice.status !== '草稿' && isFrozen(notice.effectiveAt)) {
    return { rule: 0, packingNoticeId: notice.id, reason: `${notice.id} 生效滿 7 個工作天已凍結` }
  }
  if (notice.status === '草稿') return { rule: 1, packingNoticeId: notice.id }
  const blockers = piDownstreamBlockers(notice.id, purchaseOrders, dyeOrders, secondaryProcessingOrders)
  return blockers.length > 0
    ? { rule: 3, packingNoticeId: notice.id, blockers }
    : { rule: 2, packingNoticeId: notice.id }
}

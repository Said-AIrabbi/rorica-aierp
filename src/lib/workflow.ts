import dayjs from 'dayjs'
import { addWorkdays } from '@/lib/dates'
import { meterToYard } from '@/lib/units'
import type {
  AbnormalNotice,
  DyeOrder,
  GoodsReceipt,
  PackingNotice,
  PurchaseOrder,
  SecondaryProcessingPackaging,
  ShippingOrder,
} from '@/types'

/**
 * 表1包裝通知單／表2訂購單「已凍結」旗標：自單據轉為「生效」之日起算滿 7 個工作天自動加註，
 * 不再提供修改。此旗標獨立於狀態機之外，與是否已完成無關；「草稿」狀態尚未正式生效、
 * 未對外送出，一律豁免（不論放幾天皆可自由修改），見 isPackingNoticeEditable／isPurchaseOrderEditable。
 */
export const FREEZE_WORKDAYS = 7

/** 表2 訂購單：幾天內未簽回，系統自動標記為已逾期（僅提醒跟催，效果等同已確認，不阻擋後續流程） */
export const PURCHASE_ORDER_OVERDUE_DAYS = 2

/** 凍結日：自「生效日」起算 7 個工作天；尚未生效（草稿）則無凍結日 */
export function freezeDate(effectiveAt: string | undefined): dayjs.Dayjs | null {
  return effectiveAt ? addWorkdays(effectiveAt, FREEZE_WORKDAYS) : null
}

/** 單據是否已凍結：自生效日起算滿 7 個工作天，尚未生效者永不凍結 */
export function isFrozen(effectiveAt: string | undefined): boolean {
  const at = freezeDate(effectiveAt)
  return at ? dayjs().isAfter(at) : false
}

/**
 * 包裝通知單是否可編輯：凍結後整份單據不再提供修改；
 * 「草稿」狀態尚未正式生效，不受凍結旗標限制，可隨時修改。
 */
export function isPackingNoticeEditable(notice: Pick<PackingNotice, 'effectiveAt' | 'status'>): boolean {
  if (notice.status === '草稿') return true
  return !isFrozen(notice.effectiveAt)
}

/**
 * 訂購單是否可編輯：凍結後整份單據不再提供修改；
 * 「草稿」狀態尚未正式送出（待簽回），不受凍結旗標限制，可隨時修改，比照包裝通知單的處理方式。
 */
export function isPurchaseOrderEditable(order: Pick<PurchaseOrder, 'effectiveAt' | 'status'>): boolean {
  if (order.status === '草稿') return true
  return !isFrozen(order.effectiveAt)
}

/** 訂購單建立後是否已逾 2 天仍未簽回 */
export function isPurchaseOrderOverdue(order: Pick<PurchaseOrder, 'status' | 'createdAt' | 'signedAt'>): boolean {
  if (order.status !== '待簽回' || order.signedAt) return false
  return dayjs().diff(dayjs(order.createdAt), 'day') >= PURCHASE_ORDER_OVERDUE_DAYS
}

/**
 * 顯示用的「有效狀態」：逾期未簽回的訂購單，畫面上呈現為已逾期，
 * 但效果等同已確認，不阻擋後續「標記完成」等流程。
 */
export function effectivePurchaseOrderStatus(order: Pick<PurchaseOrder, 'status' | 'createdAt' | 'signedAt'>): PurchaseOrder['status'] {
  return isPurchaseOrderOverdue(order) ? '已逾期' : order.status
}

/**
 * 訂購單是否已可觸發後續履行流程（建立表4染整單或表6入庫單）：已簽回，或已逾期但效果等同已確認；
 * 「成品」類型另需大貨樣確認通過；三條路徑皆須尚未建立對應的下游單據，避免重複觸發。
 * 觸發後訂購單狀態本身「不會」立即變成已完成——已完成的判定改由下游單據完成時回頭結案
 * （成品/胚布純採購：表6入庫完成；胚布送染整：表4染整單完成），比照PRD「三種完成判定各自獨立」規則。
 */
export function isPurchaseOrderReadyToTriggerFulfillment(
  order: Pick<PurchaseOrder, 'status' | 'createdAt' | 'signedAt' | 'type' | 'hasDyeVendor' | 'largeSampleConfirmedAt' | 'parentId'>,
  goodsReceipts: Pick<GoodsReceipt, 'parentId' | 'source'>[],
  dyeOrders: Pick<DyeOrder, 'parentId'>[],
): boolean {
  const effective = effectivePurchaseOrderStatus(order)
  const signedOrOverdue = effective === '已簽回' || effective === '已逾期'
  if (!signedOrOverdue) return false
  if (order.type === '成品') {
    if (!order.largeSampleConfirmedAt) return false
    return !goodsReceipts.some((r) => r.parentId === order.parentId && r.source === '直採大貨-成品')
  }
  if (order.hasDyeVendor) {
    return !dyeOrders.some((d) => d.parentId === order.parentId)
  }
  return !goodsReceipts.some((r) => r.parentId === order.parentId && r.source === '直採大貨-胚布')
}

/**
 * 表1包裝通知單「已完成」判定：所有明細物品皆已出貨。優先以「來源明細列 id」逐列比對
 * 已完成表8出貨單的明細（同品名同色但不同規格分支／不同包裝方式的兩列才不會互相沖抵），
 * 出貨明細未帶來源 id（手動加開的品項）時才退回以「皇加品名＋顏色」比對。
 */
export function isPackingNoticeFullyShipped(
  notice: Pick<PackingNotice, 'items'>,
  parentId: string,
  shippingOrders: Pick<ShippingOrder, 'parentId' | 'status' | 'items'>[],
): boolean {
  const completedItems = shippingOrders
    .filter((s) => s.parentId === parentId && s.status === '已完成')
    .flatMap((s) => s.items)
  return notice.items.every((item) => {
    const shippedQty = completedItems
      .filter((i) =>
        i.sourceItemId
          ? i.sourceItemId === item.id
          : i.roricaProductName === item.roricaProductName && i.color === item.color,
      )
      .reduce((sum, i) => sum + i.yard, 0)
    return shippedQty >= item.yard
  })
}

/**
 * 表4 染單「單卷不可超過＿＿Y」提示文字的數值：依表1包裝通知單該筆明細的
 * 「定碼長度（米）」換算為碼後，再套用該單的「生產數量容許誤差」上限，無條件進位取整。
 * 例：定碼 50M ≈ 54.7Y，容許誤差 ±10% → 54.7 × 1.1 ≈ 60.2 → 單卷不可超過 61Y。
 * 數值依該筆單卷碼數上限動態變化（非固定值）；未指定定碼長度的明細不產生此提示。
 */
export function rollYardUpperLimit(
  fixedLengthMeter: number | undefined,
  tolerance: Pick<PackingNotice['tolerance'], 'mode' | 'customText'>,
): number | null {
  if (!fixedLengthMeter) return null
  const pct = tolerance.mode === '±5%' ? 0.05 : tolerance.mode === '±10%' ? 0.1 : parseCustomTolerancePct(tolerance.customText)
  if (pct == null) return null
  return Math.ceil(meterToYard(fixedLengthMeter) * (1 + pct))
}

/**
 * 表4 染單「單卷碼數」的預設值：即表1該筆明細「定碼長度（米）」換算成碼數——
 * 這是每一卷應有的碼數，與該列的商品總數（整批數量）無關；上限提示另見 rollYardUpperLimit。
 * 未指定定碼長度（非定碼ROLL包裝）的明細沒有單卷碼數，回傳 null 由人工填寫。
 */
export function defaultRollYard(fixedLengthMeter: number | undefined): number | null {
  if (!fixedLengthMeter) return null
  return Number(meterToYard(fixedLengthMeter).toFixed(1))
}

/** 容許誤差選「其他」時，自文字說明中解析百分比（如「±8%」「8%」）；解析不出則不產生上限提示 */
function parseCustomTolerancePct(customText: string | undefined): number | null {
  if (!customText) return null
  const matched = customText.match(/(\d+(?:\.\d+)?)\s*%/)
  return matched ? Number(matched[1]) / 100 : null
}

/**
 * 表6 入庫單縮率：作為每次胚布送染之後的損耗紀錄。
 * 縮率＝（投胚量－本次入庫總碼數）÷投胚量，四捨五入至小數點一位；
 * 僅委外加工送染整路徑（有記錄投胚量）適用，直採大貨路徑無生產/染整過程，不產生數量誤差。
 */
export function goodsReceiptShrinkageRate(receipt: Pick<GoodsReceipt, 'pledgedQty' | 'rolls'>): number | null {
  if (!receipt.pledgedQty) return null
  const totalLength = receipt.rolls.reduce((sum, r) => sum + r.length, 0)
  if (totalLength === 0) return null
  return Number(((receipt.pledgedQty - totalLength) / receipt.pledgedQty).toFixed(3))
}

// ---------- 表5 二次加工單 ----------

/**
 * 表5的包裝設定整組唯讀帶入自表1包裝通知單：加工廠出貨時需依客戶原始包裝要求作業，
 * 故不在二次加工單重新設定，避免兩處各存一份而不一致。
 * 彩條／容許誤差在表1是「模式＋自訂文字」的結構，帶入時攤平為單一顯示文字，比照表2/表4做法。
 */
export function buildSecondaryProcessingPackaging(notice: PackingNotice): SecondaryProcessingPackaging {
  return {
    sampleQty: notice.sampleQty,
    sampleQtyNote: notice.sampleQtyNote,
    packagingType: notice.packagingType,
    shipMethod: notice.shipMethod,
    shipMethodNote: notice.shipMethodNote,
    colorRatioNote:
      notice.colorRatio.mode === '客人指定' ? `客人指定：${notice.colorRatio.customText ?? ''}` : '空白',
    toleranceNote: notice.tolerance.mode === '其他' ? (notice.tolerance.customText ?? '其他') : notice.tolerance.mode,
    labelTypes: notice.labelTypes,
    embossing: notice.embossing.join('、'),
    edgeCut: notice.edgeCut,
    allowSplicing: notice.allowSplicing,
  }
}

// ---------- 表9 異常通知單 ----------

/** 客戶簽收後幾個月內可提出客訴，逾期不受理 */
export const ABNORMAL_CLAIM_MONTHS = 6

/** 客訴成案（表9受理）後須於幾個月內結案；逾期視為異常需另行追蹤，但不強制擋單 */
export const ABNORMAL_CLOSE_MONTHS = 12

/** 客訴受理期限：自原出貨（簽收）日起算 6 個月 */
export function abnormalClaimDeadline(shipDate: string): dayjs.Dayjs {
  return dayjs(shipDate).add(ABNORMAL_CLAIM_MONTHS, 'month')
}

/**
 * 是否仍在可受理客訴的期間內。無出貨日期者（如皇加自行發現的上游追討附單）不受此限，
 * 因為 6 個月是自「客戶簽收」起算，沒有簽收就沒有起算點。
 */
export function isWithinAbnormalClaimWindow(shipDate: string | undefined, at: string | Date = new Date()): boolean {
  if (!shipDate) return true
  return !dayjs(at).isAfter(abnormalClaimDeadline(shipDate))
}

/** 結案期限：自受理日起算 12 個月 */
export function abnormalCloseDeadline(createdAt: string): dayjs.Dayjs {
  return dayjs(createdAt).add(ABNORMAL_CLOSE_MONTHS, 'month')
}

/** 已成案但逾 12 個月仍未結案：畫面標示提醒追蹤原因，不阻擋操作 */
export function isAbnormalCloseOverdue(notice: Pick<AbnormalNotice, 'status' | 'createdAt'>): boolean {
  if (notice.status === '已完成') return false
  return dayjs().isAfter(abnormalCloseDeadline(notice.createdAt))
}

/**
 * 表9是否具備結案條件：所有「已勾選」的處理方式皆執行完畢才算已完成（PRD 決策73）。
 * 回傳尚未完成的項目描述，空陣列即代表可結案。
 */
export function pendingAbnormalHandlings(notice: AbnormalNotice): string[] {
  const pending: string[] = []
  const { returnGoods, deduction, replacement, other } = notice.handling
  if (returnGoods) {
    const rolls = notice.returnedRolls ?? []
    if (rolls.length === 0) pending.push('退貨：尚未登記退回布卷')
    else if (rolls.some((r) => r.verdict === '待複核')) pending.push('退貨：仍有布卷待人工複核判定良品／瑕疵')
  }
  if (deduction && (deduction.amount == null || !deduction.upstreamVendorId)) {
    pending.push('扣款不退貨：需填寫扣款金額與向廠商申請對象')
  }
  if (replacement && !replacement.shippingOrderId) pending.push('補貨換貨：尚未建立關聯的新出貨單')
  if (other && !other.note.trim()) pending.push('其他補償：需填寫說明')
  return pending
}

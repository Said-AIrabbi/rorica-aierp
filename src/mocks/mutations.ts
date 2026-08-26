import dayjs from 'dayjs'
import { yardToMeter, yardWeightToMeterWeight } from '@/lib/units'
import {
  allocateWholeRolls,
  availableFabricLabels,
  isRollReserved,
  reservationExpiresAt,
  suggestSplicingCombination,
} from '@/lib/inventory'
import {
  buildSecondaryProcessingPackaging,
  defaultRollYard,
  effectivePurchaseOrderStatus,
  isPackingNoticeFullyShipped,
} from '@/lib/workflow'
import type {
  ActualReceiptComparison,
  Customer,
  DyeOrder,
  DyeOrderItem,
  DyeRequest,
  FabricLabel,
  GoodsReceipt,
  GoodsReceiptRoll,
  PackingNotice,
  PackingNoticeItem,
  PackingNoticeMarking,
  Product,
  PurchaseOrder,
  PurchaseOrderItem,
  SecondaryProcessingItem,
  SecondaryProcessingOrder,
  SplicingSuggestion,
  Vendor,
  ShippingOrder,
  ShippingOrderItem,
  StockReservation,
} from '@/types'
import {
  accounts,
  customers,
  dyeOrders,
  dyeRequests,
  fabricLabels,
  goodsReceipts,
  packingNotices,
  persistSessionSnapshot,
  products,
  purchaseOrders,
  resolveProduct,
  secondaryProcessingOrders,
  shippingOrders,
  splicingSuggestions,
  stockReservations,
  vendors,
} from './data'

/**
 * Prototype 用的假網路延遲；所有 mutation 皆以此函式回傳結果，
 * 故在此統一寫入本次瀏覽分頁的 sessionStorage 暫存快照（見 data.ts），
 * 讓使用者可連貫測試表1→表8整條流程且重新整理頁面不掉資料，分頁關閉後則自動清除、不污染預設模擬資料。
 */
function delay<T>(value: T, ms = 300): Promise<T> {
  persistSessionSnapshot()
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function pad(n: number, len = 3) {
  return String(n).padStart(len, '0')
}

// ---------- 表1 包裝通知單 ----------

export type PackingNoticeItemInput = Omit<PackingNoticeItem, 'id' | 'meter'>

export interface PackingNoticeInput {
  /** 客戶名稱：文字輸入，符合既有客戶簡稱/全稱則沿用，否則自動建立新客戶主檔並給予編號 */
  customerName: string
  customerOrderNo: string
  expectedDeliveryAt: string
  sampleQty: number
  shipMethod: PackingNotice['shipMethod']
  shipMethodNote?: string
  colorRatio: PackingNotice['colorRatio']
  labelTypes: PackingNotice['labelTypes']
  packagingType: PackingNotice['packagingType']
  tolerance: PackingNotice['tolerance']
  items: PackingNoticeItemInput[]
  allowSplicing?: boolean
  marking: PackingNoticeMarking
  embossing: PackingNotice['embossing']
  edgeCut: boolean
}

function buildItems(id: string, items: PackingNoticeItemInput[]): PackingNoticeItem[] {
  return items.map((item, i) => ({
    ...item,
    id: `${id}-L${i + 1}`,
    meter: Number(yardToMeter(item.yard).toFixed(1)),
  }))
}

/** 燙金（多選）帶入表2/表4時，以頓號連接顯示 */
function embossingDisplay(embossing: PackingNotice['embossing']): string {
  return embossing.join('、')
}

/** 彩條帶入表2/表4時的顯示文字 */
function colorRatioDisplay(colorRatio: PackingNotice['colorRatio']): string {
  return colorRatio.mode === '客人指定' ? `客人指定：${colorRatio.customText ?? ''}` : '空白'
}

/**
 * 客戶欄位開放文字輸入：輸入名稱若與既有客戶簡稱或全稱完全相同則沿用該客戶；
 * 完全查無則視為全新客戶，單據建立時自動建立客戶主檔並給予編號（其餘欄位留待日後補齊，
 * 交期預設天數比照全公司統一14天）。
 */
function resolveCustomerByName(name: string): Customer {
  const trimmed = name.trim()
  const existing = customers.find((c) => c.shortName === trimmed || c.fullNameCN === trimmed)
  if (existing) return existing

  const customer: Customer = {
    id: `CUST-${pad(customers.length + 1)}`,
    code: `C${pad(customers.length + 1)}`,
    shortName: trimmed,
    fullNameCN: trimmed,
    fullNameEN: '',
    personInCharge: '',
    personInChargePhone: '',
    contactPerson: '',
    contactPersonPhone: '',
    address: '',
    invoiceAddress: '',
    taxId: '',
    taxRate: '',
    paymentTerms: '',
    leadTimeDays: 14,
  }
  customers.push(customer)
  return customer
}

/**
 * 系統自動查詢與判斷庫存：可用庫存＝實際庫存－已預留未出貨。
 * 足夠則自動建立庫存預留紀錄（綁定客戶／捲號批次／14天效期），並自動建立／併入表8出貨單草稿
 * （有庫存路徑，表8兩個進入點之一）；不接疋時僅接受單一捲即可覆蓋需求量的整捲，
 * 可接疋時依接疋規則提供拼接組合建議。庫存不足的明細，於全部明細判斷完畢後統一觸發表2訂購單草稿
 * （無庫存路徑，見 autoCreatePurchaseOrderDraft）。
 */
function autoReserveStockForNotice(notice: PackingNotice): void {
  const outOfStockItems: PackingNoticeItem[] = []

  notice.items.forEach((item) => {
    const available = availableFabricLabels(item.roricaProductName, item.color, fabricLabels, stockReservations, item.productId)

    // 可接疋的訂單：先看零星捲能不能剛好湊出原疋標準尺寸的整數倍（無耗損）。
    // 湊得出來只「提供建議」不自動預留，待生管確認採用（PRD 決策1）；
    // 湊不出來就依 PRD 決策5 不接疋，落到下方整捲＋裁切的配貨邏輯。
    if (notice.allowSplicing) {
      const product = resolveProduct(item.productId, item.roricaProductName)
      const standardSize = product?.originalRollStandardYard ?? 0
      const combo = suggestSplicingCombination(item.yard, available, standardSize)
      if (combo) {
        splicingSuggestions.unshift({
          id: `${item.id}-SPL1`,
          packingNoticeId: notice.id,
          packingNoticeItemId: item.id,
          customerId: notice.customerId,
          productName: item.roricaProductName,
          productId: item.productId,
          color: item.color,
          requiredQty: item.yard,
          rollCodes: combo.rolls.map((r) => r.rollCode),
          totalLength: combo.totalLength,
          standardSize,
          status: '待確認',
          createdAt: dayjs().toISOString(),
        })
        return
      }
    }

    // 不接疋（或湊不出整數倍）：可用庫存以加總計算，取整捲直到覆蓋需求量，
    // 最後一捲不足整支者於出貨時裁切，裁剩的零碼布留庫存等待下次湊單。
    const chosen = allocateWholeRolls(item.yard, available)
    if (!chosen) {
      outOfStockItems.push(item)
      return
    }
    reserveRollsForItem(notice, item, chosen)
  })

  if (outOfStockItems.length > 0) {
    autoCreatePurchaseOrderDraft(notice, outOfStockItems)
  }
}

/**
 * 建立庫存預留紀錄（綁定客戶／記錄捲號批次／14天效期逾期自動釋放），
 * 並自動建立／併入表8出貨單草稿——有庫存路徑貨已在庫存中，是表8兩個進入點之一。
 * 拼接出貨時捲號組合完整記錄於出貨明細的 rollCodes，供日後客訴回溯。
 */
function reserveRollsForItem(notice: PackingNotice, item: PackingNoticeItem, chosen: FabricLabel[]): StockReservation {
  const qty = Number(chosen.reduce((sum, r) => sum + r.length, 0).toFixed(2))
  const createdAt = dayjs().toISOString()
  const reservation: StockReservation = {
    id: `${item.id}-RES${stockReservations.filter((r) => r.packingNoticeItemId === item.id).length + 1}`,
    packingNoticeId: notice.id,
    packingNoticeItemId: item.id,
    customerId: notice.customerId,
    productName: item.roricaProductName,
    color: item.color,
    rollCodes: chosen.map((r) => r.rollCode),
    qty,
    unit: 'Yard',
    status: '預留中',
    createdAt,
    expiresAt: reservationExpiresAt(createdAt).toISOString(),
  }
  stockReservations.unshift(reservation)

  const product = resolveProduct(item.productId, item.roricaProductName)
  autoCreateOrAppendShippingOrder(notice.id, notice.customerId, [
    {
      sourceItemId: item.id,
      customerProductName: item.customerProductName,
      roricaProductName: item.roricaProductName,
      color: item.color,
      rollCodes: chosen.map((r) => r.rollCode),
      // 出貨數量以訂單需求量為準；整捲＋裁切時最後一捲裁剩的零碼布留庫存
      yard: item.yard,
      meter: Number(yardToMeter(item.yard).toFixed(1)),
      unitPrice: product?.sellPrice,
      note: item.note,
    },
  ])
  return reservation
}

/**
 * 生管確認採用系統建議的拼接組合（PRD 決策1：拼接組合由系統提供建議，非全自動執行，仍由人工最終確認）。
 * 確認後才真正建立庫存預留與出貨單草稿明細，並記錄實際使用的捲號組合。
 */
export function confirmSplicingSuggestion(id: string): Promise<SplicingSuggestion> {
  const idx = splicingSuggestions.findIndex((sg) => sg.id === id)
  if (idx === -1) throw new Error(`拼接建議 ${id} 不存在`)
  const suggestion = splicingSuggestions[idx]
  if (suggestion.status !== '待確認') throw new Error('此拼接建議已處理過')
  const notice = packingNotices.find((n) => n.id === suggestion.packingNoticeId)
  const item = notice?.items.find((i) => i.id === suggestion.packingNoticeItemId)
  if (!notice || !item) throw new Error('找不到對應的包裝通知單明細')

  // 建議產生後、確認前，同一批布卷可能已被其他包裝通知單預留走，故以「可用庫存」重新驗證（已預留者不算可用）
  const rolls = fabricLabels.filter(
    (l) => suggestion.rollCodes.includes(l.rollCode) && l.status === '已建立' && !isRollReserved(l.rollCode, stockReservations),
  )
  if (rolls.length !== suggestion.rollCodes.length) throw new Error('建議的布卷已被其他單據使用，請重新查詢庫存')

  reserveRollsForItem(notice, item, rolls)
  const updated: SplicingSuggestion = { ...suggestion, status: '已採用', decidedAt: dayjs().toISOString() }
  splicingSuggestions[idx] = updated
  return delay(updated)
}

/**
 * 生管判定不採用拼接建議：改為整捲＋裁切分開出貨（裁剩零碼布留庫存待下次湊單）；
 * 整捲加總仍不足時，該筆明細改走無現貨路徑，觸發表2訂購單草稿。
 */
export function rejectSplicingSuggestion(id: string): Promise<SplicingSuggestion> {
  const idx = splicingSuggestions.findIndex((sg) => sg.id === id)
  if (idx === -1) throw new Error(`拼接建議 ${id} 不存在`)
  const suggestion = splicingSuggestions[idx]
  if (suggestion.status !== '待確認') throw new Error('此拼接建議已處理過')
  const notice = packingNotices.find((n) => n.id === suggestion.packingNoticeId)
  const item = notice?.items.find((i) => i.id === suggestion.packingNoticeItemId)
  if (!notice || !item) throw new Error('找不到對應的包裝通知單明細')

  const available = availableFabricLabels(item.roricaProductName, item.color, fabricLabels, stockReservations, item.productId)
  const chosen = allocateWholeRolls(item.yard, available)
  if (chosen) {
    reserveRollsForItem(notice, item, chosen)
  } else {
    autoCreatePurchaseOrderDraft(notice, [item])
  }

  const updated: SplicingSuggestion = { ...suggestion, status: '已改為整捲裁切', decidedAt: dayjs().toISOString() }
  splicingSuggestions[idx] = updated
  return delay(updated)
}

/**
 * 無庫存路徑：系統於表1判斷「無庫存」時自動建立表2訂購單草稿（非生管手動開單）。
 * 只帶「庫存不足」的明細逐列（1:1）進來——已預留到現貨的品項不需要再採購，
 * 否則會對同一批貨重複下單。狀態為「草稿」，類型/廠商等欄位留待生管透過
 * completePurchaseOrderDraft() 補齊後才送出為「待簽回」。建立後由通知中心提示生管有新草稿待處理。
 */
function autoCreatePurchaseOrderDraft(notice: PackingNotice, outOfStockItems: PackingNoticeItem[]): void {
  if (outOfStockItems.length === 0) return
  if (purchaseOrders.some((p) => p.parentId === notice.id)) return
  const id = `${notice.id}-P1`
  const items: PurchaseOrderItem[] = outOfStockItems.map((item) => ({
    id: `${id}-${item.id}`,
    customerProductName: item.customerProductName,
    roricaProductName: item.roricaProductName,
    productId: item.productId,
    color: item.color,
    yard: item.yard,
    meter: item.meter,
    packingMethod: item.packingMethod,
    fixedLengthMeter: item.fixedLengthMeter,
    processingMethod: item.processingMethod,
    processingMethodNote: item.processingMethodNote,
    note: item.note,
  }))
  const draft: PurchaseOrder = {
    id,
    parentId: notice.id,
    type: '胚布',
    vendorId: '',
    status: '草稿',
    createdAt: dayjs().toISOString(),
    dueDate: dayjs().add(14, 'day').toISOString(),
    note: '',
    items,
    embossing: embossingDisplay(notice.embossing),
    colorRatioNote: colorRatioDisplay(notice.colorRatio),
  }
  purchaseOrders.unshift(draft)
}

export function createPackingNotice(input: PackingNoticeInput): Promise<PackingNotice> {
  const today = dayjs()
  const countToday = packingNotices.filter((n) => n.id.startsWith(`ORD-${today.format('YYYYMMDD')}`)).length
  const id = `ORD-${today.format('YYYYMMDD')}-${pad(countToday + 1)}`
  const customer = resolveCustomerByName(input.customerName)
  const notice: PackingNotice = {
    id,
    customerId: customer.id,
    customerOrderNo: input.customerOrderNo,
    status: '草稿',
    createdAt: today.toISOString(),
    expectedDeliveryAt: input.expectedDeliveryAt,
    sampleQty: input.sampleQty,
    shipMethod: input.shipMethod,
    shipMethodNote: input.shipMethod.includes('其他') ? input.shipMethodNote : undefined,
    colorRatio: input.colorRatio,
    labelTypes: input.labelTypes,
    packagingType: input.packagingType,
    tolerance: input.tolerance,
    items: buildItems(id, input.items),
    allowSplicing: input.allowSplicing ?? false,
    marking: input.marking,
    embossing: input.embossing,
    edgeCut: input.edgeCut,
  }
  packingNotices.unshift(notice)
  autoReserveStockForNotice(notice)
  return delay(notice)
}

/** 手動釋放庫存預留（例如客戶取消需求）；14天效期到期則由 effectiveReservationStatus 自動視為已釋放 */
export function releaseStockReservation(id: string): Promise<StockReservation> {
  const idx = stockReservations.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`庫存預留紀錄 ${id} 不存在`)
  const updated: StockReservation = { ...stockReservations[idx], status: '已釋放', releasedAt: dayjs().toISOString() }
  stockReservations[idx] = updated
  return delay(updated)
}

export function updatePackingNotice(id: string, input: PackingNoticeInput): Promise<PackingNotice> {
  const idx = packingNotices.findIndex((n) => n.id === id)
  if (idx === -1) throw new Error(`包裝通知單 ${id} 不存在`)
  const customer = resolveCustomerByName(input.customerName)
  const updated: PackingNotice = {
    ...packingNotices[idx],
    customerId: customer.id,
    customerOrderNo: input.customerOrderNo,
    expectedDeliveryAt: input.expectedDeliveryAt,
    sampleQty: input.sampleQty,
    shipMethod: input.shipMethod,
    shipMethodNote: input.shipMethod.includes('其他') ? input.shipMethodNote : undefined,
    colorRatio: input.colorRatio,
    labelTypes: input.labelTypes,
    packagingType: input.packagingType,
    tolerance: input.tolerance,
    items: buildItems(id, input.items),
    allowSplicing: input.allowSplicing ?? packingNotices[idx].allowSplicing,
    marking: input.marking,
    embossing: input.embossing,
    edgeCut: input.edgeCut,
  }
  packingNotices[idx] = updated
  return delay(updated)
}

export function setPackingNoticeStatus(id: string, status: PackingNotice['status']): Promise<PackingNotice> {
  const idx = packingNotices.findIndex((n) => n.id === id)
  if (idx === -1) throw new Error(`包裝通知單 ${id} 不存在`)
  const updated: PackingNotice = {
    ...packingNotices[idx],
    status,
    // 生效日決定凍結旗標的起算點，故僅第一次離開草稿時記錄，之後不再變動
    effectiveAt: status !== '草稿' ? (packingNotices[idx].effectiveAt ?? dayjs().toISOString()) : packingNotices[idx].effectiveAt,
  }
  packingNotices[idx] = updated
  return delay(updated)
}

// ---------- 表2 訂購單 ----------

export interface PurchaseOrderInput {
  parentId: string
  type: PurchaseOrder['type']
  /** 是否委外染整：僅「胚布」類型適用 */
  hasDyeVendor?: boolean
  /** 賣方（供應商／染整廠），選自廠商資料主檔 */
  vendorId: string
  /** 染整廠：開關打開後才填，格式為「染整廠名稱＋廠點」；可與賣方為不同廠商 */
  dyeVendorId?: string
  dueDate: string
  note: string
  /** 單價：訂購單專屬額外欄位，可編輯；鍵值為來源表1明細列 id */
  itemUnitPrices: Record<string, number | undefined>
}

/**
 * 手動建立訂購單入口（供無自動觸發情境時，生管仍可直接開單）；系統於表1判斷「無庫存」時
 * 已會自動建立草稿（見 autoCreatePurchaseOrderDraft／completePurchaseOrderDraft），非此路徑。
 * 明細與表1包裝通知單完全一致，逐列（1:1）帶入，包裝單有幾筆明細訂購單就對應產生幾筆，非合併為一筆。
 */
export function createPurchaseOrder(input: PurchaseOrderInput): Promise<PurchaseOrder> {
  const notice = packingNotices.find((n) => n.id === input.parentId)
  if (!notice) throw new Error(`包裝通知單 ${input.parentId} 不存在`)
  const existingForParent = purchaseOrders.filter((p) => p.parentId === input.parentId).length
  const id = `${input.parentId}-P${existingForParent + 1}`
  const items: PurchaseOrderItem[] = notice.items.map((item) => ({
    id: `${id}-${item.id}`,
    customerProductName: item.customerProductName,
    roricaProductName: item.roricaProductName,
    productId: item.productId,
    color: item.color,
    yard: item.yard,
    meter: item.meter,
    packingMethod: item.packingMethod,
    fixedLengthMeter: item.fixedLengthMeter,
    processingMethod: item.processingMethod,
    processingMethodNote: item.processingMethodNote,
    unitPrice: input.itemUnitPrices[item.id],
    note: item.note,
  }))
  const order: PurchaseOrder = {
    id,
    parentId: input.parentId,
    type: input.type,
    hasDyeVendor: input.type === '胚布' ? Boolean(input.hasDyeVendor) : undefined,
    vendorId: input.vendorId,
    // 染整廠僅在「是否填入染整廠商」開關打開時記錄，與賣方各自獨立
    dyeVendorId: input.type === '胚布' && input.hasDyeVendor ? input.dyeVendorId : undefined,
    status: '待簽回',
    createdAt: dayjs().toISOString(),
    // 手動建單當下即送出（待簽回），視同生效，凍結旗標自此起算
    effectiveAt: dayjs().toISOString(),
    dueDate: input.dueDate,
    note: input.note,
    items,
    embossing: embossingDisplay(notice.embossing),
    colorRatioNote: colorRatioDisplay(notice.colorRatio),
  }
  purchaseOrders.unshift(order)
  return delay(order)
}

export interface PurchaseOrderDraftCompletionInput {
  type: PurchaseOrder['type']
  hasDyeVendor?: boolean
  vendorId: string
  dyeVendorId?: string
  dueDate: string
  note: string
  itemUnitPrices: Record<string, number | undefined>
}

/**
 * 生管補齊系統自動建立的表2草稿（廠商／類型／交期／單價等），送出後狀態由「草稿」轉為「待簽回」，
 * 進入正常簽回流程（2日內未簽回自動標記已逾期）。
 */
export function completePurchaseOrderDraft(id: string, input: PurchaseOrderDraftCompletionInput): Promise<PurchaseOrder> {
  const idx = purchaseOrders.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`訂購單 ${id} 不存在`)
  const current = purchaseOrders[idx]
  if (current.status !== '草稿') throw new Error('僅草稿狀態可送出')
  const updated: PurchaseOrder = {
    ...current,
    type: input.type,
    hasDyeVendor: input.type === '胚布' ? Boolean(input.hasDyeVendor) : undefined,
    vendorId: input.vendorId,
    dyeVendorId: input.type === '胚布' && input.hasDyeVendor ? input.dyeVendorId : undefined,
    dueDate: input.dueDate,
    note: input.note,
    items: current.items.map((item) => ({ ...item, unitPrice: input.itemUnitPrices[item.id] ?? item.unitPrice })),
    status: '待簽回',
    // 草稿送出即為生效，凍結旗標自此日起算7個工作天（草稿期間不計）
    effectiveAt: current.effectiveAt ?? dayjs().toISOString(),
  }
  purchaseOrders[idx] = updated
  return delay(updated)
}

/**
 * 大貨樣確認送樣（成品類型專用）：比照表4，退回不設次數上限，
 * 通過後記錄大貨樣確認日，作為訂購單進入「已完成」狀態的判定條件。
 */
export function submitPurchaseOrderLargeSample(id: string, result: '通過' | '退回', reason?: string): Promise<PurchaseOrder> {
  const idx = purchaseOrders.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`訂購單 ${id} 不存在`)
  const current = purchaseOrders[idx]
  const submission = {
    id: `${current.id}-SAMPLE${(current.largeSampleSubmissions?.length ?? 0) + 1}`,
    submittedAt: dayjs().toISOString(),
    result,
    reason: result === '退回' ? reason : undefined,
  }
  const updated: PurchaseOrder = {
    ...current,
    largeSampleSubmissions: [...(current.largeSampleSubmissions ?? []), submission],
    largeSampleConfirmedAt: result === '通過' ? submission.submittedAt : current.largeSampleConfirmedAt,
  }
  purchaseOrders[idx] = updated
  return delay(updated)
}

/** 賣方（供應商／染整廠）簽回訂購單；2日內未簽回則系統自動標記為已逾期，效果等同已確認 */
export function signPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const idx = purchaseOrders.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`訂購單 ${id} 不存在`)
  const updated: PurchaseOrder = {
    ...purchaseOrders[idx],
    status: '已簽回',
    signedAt: dayjs().toISOString(),
  }
  purchaseOrders[idx] = updated
  return delay(updated)
}

function nextGoodsReceiptId(parentId: string) {
  const existingForParent = goodsReceipts.filter((r) => r.parentId === parentId).length
  return `${parentId}-R${existingForParent + 1}`
}

/**
 * 建立表6入庫單草稿，倉管人員自動帶入具倉管角色的帳號。
 * 關聯單據以實際單號記錄（成品訂單／胚布訂單／染單／二次加工單），入庫確認後結案的就是這一張。
 */
function createGoodsReceiptDraft(
  parentId: string,
  source: GoodsReceipt['source'],
  related: { type: GoodsReceipt['relatedDocType']; id: string },
  pledgedQty?: number,
): void {
  const warehouseAccount = accounts.find((a) => a.roles.includes('倉管')) ?? accounts[0]
  goodsReceipts.unshift({
    id: nextGoodsReceiptId(parentId),
    parentId,
    source,
    relatedDocType: related.type,
    relatedDocId: related.id,
    status: '草稿',
    receiptDate: dayjs().toISOString(),
    operatorAccountId: warehouseAccount.id,
    rolls: [],
    pledgedQty,
  })
}

/**
 * 染整完成時自動建立表5二次加工單草稿：加工廠與加工單價留白待生管補齊。
 * 若該張表1已有二次加工單（含人工建立的），則不重複建立。
 */
function autoCreateSecondaryProcessingDraft(parentId: string, sourceItems: PackingNoticeItem[], dyeOrderId: string): void {
  if (secondaryProcessingOrders.some((o) => o.parentId === parentId)) return
  const notice = packingNotices.find((n) => n.id === parentId)
  if (!notice || sourceItems.length === 0) return

  const id = `${parentId}-X1`
  secondaryProcessingOrders.unshift({
    id,
    parentId,
    // 記錄來源染單，讓下游入庫單可沿「入庫單→二次加工單→染單」回推到正確的那一張染單
    dyeOrderId,
    customerId: notice.customerId,
    status: '草稿',
    createdAt: dayjs().toISOString(),
    dueDate: notice.expectedDeliveryAt,
    vendorId: '',
    items: sourceItems.map((item, i) => ({
      id: `${id}-L${i + 1}`,
      sourceItemId: item.id,
      customerProductName: item.customerProductName,
      roricaProductName: item.roricaProductName,
      productId: item.productId,
      color: item.color,
      yard: item.yard,
      meter: item.meter,
      processingMethod: item.processingMethod,
      processingMethodNote: item.processingMethodNote,
      note: item.note,
    })),
    packaging: buildSecondaryProcessingPackaging(notice),
  })
}

/** 直採大貨的來源分類：依訂購單類型（成品／胚布）對應入庫單觸發來源，僅未委外染整路徑適用 */
function goodsReceiptSourceForPurchaseOrder(type: PurchaseOrder['type']): GoodsReceipt['source'] {
  return type === '成品' ? '直採大貨-成品' : '直採大貨-胚布'
}

/**
 * 依「客戶＋皇加品名（產品分支）＋顏色＋染整廠」查詢歷史色號，回傳結果依三種情境分流：
 * 1) 查得到且12個月內使用過：直接沿用，色樣編號自動帶入。
 * 2) 查得到但超過12個月未使用（「重新複色」情境）：仍沿用舊色號並記錄最後使用日，
 *    由畫面提醒使用者可沿用或自行建立表3重新複色，**不自動開立表3**。
 * 3) 完全查無：自動觸發表3打色通知單委託染整廠打色（平行進行，非開染單前置條件），色樣編號留空，
 *    並回傳該張表3的單號記錄於染單明細，作為色樣編號的來源（表3與染單為1:N）。
 * 色號非通用碼：換一家染整廠即視為無色號，即使顏色相同；同品名的不同規格分支亦各自獨立，
 * 故一律優先以產品編號解析商品主檔，查無才退回以品名＋客戶比對。
 */
function resolveDyeOrderItemSampleCode(
  parentId: string,
  customerId: string,
  productId: string | undefined,
  roricaProductName: string,
  color: string,
  dyeVendorId: string,
): { sampleCode?: string; lastUsedAt?: string; dyeRequestId?: string } {
  const product = resolveProductForCustomer(productId, roricaProductName, customerId)
  const historical = product?.colors.find((c) => c.color === color && c.dyeVendorId === dyeVendorId)
  if (historical) return { sampleCode: historical.sampleCode, lastUsedAt: historical.lastUsedAt }

  // 完全查無色號：同一張表1、同一產品分支、同一染整廠的待打色顏色併入同一張表3的色號清單，
  // 不是每個顏色各開一張單（表3本來就是一張單掛一份可新增／刪除的色號清單）。
  const openRequest = dyeRequests.find(
    (d) =>
      d.parentId === parentId &&
      d.dyeVendorId === dyeVendorId &&
      d.productId === (product?.id ?? roricaProductName) &&
      d.status !== '已完成',
  )
  if (openRequest) {
    if (!openRequest.colors.some((c) => c.color === color)) {
      openRequest.colors = [
        ...openRequest.colors,
        { id: `${openRequest.id}-C${openRequest.colors.length + 1}`, color },
      ]
    }
    return { dyeRequestId: openRequest.id }
  }

  const id = nextDyeRequestId(parentId)
  dyeRequests.unshift({
    id,
    parentId,
    buyer: '皇加',
    dyeVendorId,
    requestDate: dayjs().toISOString(),
    productId: product?.id ?? roricaProductName,
    greigeFabricCode: product?.greigeFabricCode,
    colors: buildDyeRequestColors(id, [color]),
    status: '草稿',
  })
  return { dyeRequestId: id }
}

/**
 * 表3打色通知單的子序號：主號貫穿下以 -C{n}（Color card）自成一組流水號。
 * 不與染單共用 -D，否則同一張表1底下的打色通知單與染整單會出現相同單號。
 */
function nextDyeRequestId(parentId: string): string {
  return `${parentId}-C${dyeRequests.filter((d) => d.parentId === parentId).length + 1}`
}

/**
 * 依產品編號解析商品主檔；查無編號時以「皇加品名＋客戶」比對——
 * 歷史色號的查詢鍵包含客戶，故不可只用品名撈到別家客戶的同名商品。
 */
function resolveProductForCustomer(productId: string | undefined, productName: string, customerId: string) {
  if (productId) {
    const byId = products.find((p) => p.id === productId)
    if (byId) return byId
  }
  return products.find((p) => p.productName === productName.trim() && p.customerId === customerId)
}

/**
 * 觸發訂購單後續履行流程。分流規則：
 * 「成品」或「胚布未委外染整」→ 建立表6入庫單草稿（來源：直採大貨-成品／胚布）；
 * 「胚布已委外染整」→ 依明細品名分組，逐品名建立表4染整單草稿（訂購單結案後開染單，與有胚匯流）；
 *   每筆色號依「客戶＋皇加品名＋顏色＋染整廠」自動查詢歷史色號，查無則平行觸發表3打色通知單，
 *   非開染單前置條件。
 * 注意：此動作本身「不會」將訂購單標記為已完成——三條路徑各自的完成判定改由下游單據
 * （表6入庫單／表4染整單）完成時回頭結案（見 setGoodsReceiptStatus／submitDyeOrderLargeSample）。
 */
export function triggerPurchaseOrderFulfillment(id: string): Promise<PurchaseOrder> {
  const idx = purchaseOrders.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`訂購單 ${id} 不存在`)
  const order = purchaseOrders[idx]

  // 未簽回（含尚未送出的草稿）不得觸發後續單據，與畫面按鈕的顯示條件一致；逾期未簽回視同已確認
  const effective = effectivePurchaseOrderStatus(order)
  if (effective !== '已簽回' && effective !== '已逾期') {
    throw new Error('訂購單尚未簽回，無法觸發後續流程')
  }

  if (order.type === '成品' && !order.largeSampleConfirmedAt) {
    throw new Error('大貨樣尚未確認通過，無法觸發入庫流程')
  }

  if (order.type === '胚布' && order.hasDyeVendor) {
    if (dyeOrders.some((d) => d.parentId === order.parentId)) {
      throw new Error('已建立染整單，無需重複觸發')
    }
    const notice = packingNotices.find((n) => n.id === order.parentId)
    // 受託加工廠為訂購單指定的「染整廠」；未填時才退回賣方（同一家廠商兼供應與染整的情況）
    const dyeVendorId = order.dyeVendorId || order.vendorId
    // 依產品分支分組：同品名不同規格分支是不同商品，不可併在同一張染單
    const groups = new Map<string, PurchaseOrderItem[]>()
    order.items.forEach((item) => {
      const key = item.productId ?? item.roricaProductName
      const list = groups.get(key) ?? []
      list.push(item)
      groups.set(key, list)
    })
    let seq = dyeOrders.filter((d) => d.parentId === order.parentId).length
    groups.forEach((groupItems) => {
      seq += 1
      const dyeOrderId = `${order.parentId}-D${seq}`
      const productName = groupItems[0].roricaProductName
      const productId = groupItems[0].productId
      // 胚布材質／胚布規格／成品規格依明細的產品分支自動帶入（唯讀）
      const product = resolveProduct(productId, productName)
      const items: DyeOrderItem[] = groupItems.map((item, i) => {
        const resolved = resolveDyeOrderItemSampleCode(
          order.parentId,
          notice?.customerId ?? '',
          item.productId,
          productName,
          item.color,
          dyeVendorId,
        )
        return {
          id: `${dyeOrderId}-L${i + 1}`,
          color: item.color,
          sampleCode: resolved.sampleCode,
          sampleCodeLastUsedAt: resolved.lastUsedAt,
          dyeRequestId: resolved.dyeRequestId,
          // 單卷碼數＝該筆明細的定碼長度換算碼數（每一卷應有的碼數），非整批商品總數
          rollYard: defaultRollYard(item.fixedLengthMeter) ?? undefined,
          fabricMaterial: product?.material,
          fabricSpec: product?.greigeSpec,
          finishedSpec: product?.finishedSpec,
          unitPrice: item.unitPrice,
          // 胚布尚未投入染整前一律為待染；到廠確認後才轉指染
          pendingDyeQty: item.yard,
          inDyeQty: 0,
          finishedQty: 0,
        }
      })
      dyeOrders.unshift({
        id: dyeOrderId,
        parentId: order.parentId,
        status: '草稿',
        dueDate: order.dueDate,
        productName,
        productId,
        embossing: order.embossing,
        colorRatioNote: order.colorRatioNote,
        vendorId: dyeVendorId,
        items,
        unit: 'Yard',
      })
    })
    return delay(order)
  }

  if (goodsReceipts.some((r) => r.parentId === order.parentId && r.source === goodsReceiptSourceForPurchaseOrder(order.type))) {
    throw new Error('已建立入庫單，無需重複觸發')
  }
  createGoodsReceiptDraft(order.parentId, goodsReceiptSourceForPurchaseOrder(order.type), {
    type: order.type === '成品' ? '成品訂單' : '胚布訂單',
    id: order.id,
  })
  return delay(order)
}

// ---------- 表3 打色通知單 ----------

export function sendDyeRequest(id: string): Promise<void> {
  const idx = dyeRequests.findIndex((d) => d.id === id)
  if (idx === -1) throw new Error(`打色通知單 ${id} 不存在`)
  dyeRequests[idx] = { ...dyeRequests[idx], status: '已送出' }
  return delay(undefined)
}

export interface DyeRequestInput {
  parentId: string
  dyeVendorId: string
  /** 皇加品名：文字輸入／選自商品資料主檔；查得到主檔則沿用其 id 與胚布編號，否則直接記錄品名 */
  productName: string
  /** 產品編號：選定產品分支時由畫面帶入，可精準指到規格分支；全新品名留空 */
  productId?: string
  /** 色號清單：建單時僅輸入顏色名稱，色樣編號由染廠提供，待回覆後於詳情頁補填 */
  colors: string[]
  note?: string
}

/**
 * 建單當下僅登記待打色的顏色，色樣編號留空——該編號為染整廠打色完成後回覆的實體追蹤碼，
 * 非系統可自行產生，由生管於表3詳情頁手動補填（見 updateDyeRequestColors）。
 */
function buildDyeRequestColors(requestId: string, colorNames: string[]): DyeRequest['colors'] {
  return colorNames.map((color, i) => ({
    id: `${requestId}-C${i + 1}`,
    color,
  }))
}

export interface DyeRequestColorInput {
  id?: string
  color: string
  sampleCode?: string
}

/**
 * 更新色號清單：染整廠回覆後由生管補填顏色／色樣編號，或因重新覆色追加新列（不設次數上限）。
 * 已完成的打色通知單不再提供修改。
 */
export function updateDyeRequestColors(id: string, colors: DyeRequestColorInput[]): Promise<DyeRequest> {
  const idx = dyeRequests.findIndex((d) => d.id === id)
  if (idx === -1) throw new Error(`打色通知單 ${id} 不存在`)
  const current = dyeRequests[idx]
  if (current.status === '已完成') throw new Error('已完成的打色通知單不可修改色號清單')
  const updated: DyeRequest = {
    ...current,
    colors: colors.map((c, i) => ({
      id: c.id ?? `${id}-C${i + 1}`,
      color: c.color.trim(),
      sampleCode: c.sampleCode?.trim() || undefined,
    })),
  }
  dyeRequests[idx] = updated
  return delay(updated)
}

export function createDyeRequest(input: DyeRequestInput): Promise<DyeRequest> {
  // 表3的子序號為 -C{n}，與表4染單的 -D{n} 分開，避免同一主號下單號相撞
  const id = nextDyeRequestId(input.parentId)
  // 品名比對得到商品資料主檔時沿用其 id（供後續帶出胚布編號等資訊），全新品名則直接記錄品名字串
  const product = resolveProduct(input.productId, input.productName)
  const request: DyeRequest = {
    id,
    parentId: input.parentId,
    buyer: '皇加',
    dyeVendorId: input.dyeVendorId,
    requestDate: dayjs().toISOString(),
    productId: product?.id ?? input.productName.trim(),
    greigeFabricCode: product?.greigeFabricCode,
    colors: buildDyeRequestColors(id, input.colors),
    note: input.note,
    status: '草稿',
  }
  dyeRequests.unshift(request)
  return delay(request)
}

/**
 * 色卡送樣確認：完整送樣子流程，退回不設次數上限，選「退回」後該筆鎖定、自動新增下一筆。
 * 通過後打色通知單狀態變更為「已完成」，並將色樣編號回填至對應染單（若染單已先行開立且色號欄位仍空白）。
 */
export function submitDyeRequestColorSample(id: string, result: '通過' | '退回', reason?: string): Promise<DyeRequest> {
  const idx = dyeRequests.findIndex((d) => d.id === id)
  if (idx === -1) throw new Error(`打色通知單 ${id} 不存在`)
  const current = dyeRequests[idx]
  const submission = {
    id: `${current.id}-SAMPLE${(current.colorSampleSubmissions?.length ?? 0) + 1}`,
    submittedAt: dayjs().toISOString(),
    result,
    reason: result === '退回' ? reason : undefined,
  }
  const updated: DyeRequest = {
    ...current,
    colorSampleSubmissions: [...(current.colorSampleSubmissions ?? []), submission],
    colorSampleConfirmedAt: result === '通過' ? submission.submittedAt : current.colorSampleConfirmedAt,
    status: result === '通過' ? '已完成' : '色卡送樣確認',
  }
  dyeRequests[idx] = updated

  if (result === '通過') {
    dyeOrders.forEach((order, oi) => {
      if (order.parentId !== updated.parentId) return
      const items = order.items.map((item) => {
        if (item.sampleCode) return item
        // 僅回填已實際填入色樣編號的色號列，避免把尚未補填的空值蓋進染單
        const match = updated.colors.find((c) => c.color === item.color && c.sampleCode)
        // 一併記錄色樣編號來源於哪張表3（表3與染單為1:N，外鍵記在染單端）
        return match ? { ...item, sampleCode: match.sampleCode, dyeRequestId: updated.id } : item
      })
      dyeOrders[oi] = { ...order, items }
    })

    // 色樣編號回填為新的歷史色號紀錄（客戶＋皇加品名＋顏色＋染整廠），供後續查得使用
    const productIdx = products.findIndex((pr) => pr.id === updated.productId)
    if (productIdx !== -1) {
      const now = dayjs().toISOString()
      const colors = [...products[productIdx].colors]
      updated.colors.forEach((c) => {
        if (!c.sampleCode) return
        const existing = colors.findIndex((hc) => hc.color === c.color && hc.dyeVendorId === updated.dyeVendorId)
        const record = { color: c.color, dyeVendorId: updated.dyeVendorId, lastUsedAt: now, sampleCode: c.sampleCode }
        if (existing === -1) colors.push(record)
        else colors[existing] = record
      })
      products[productIdx] = { ...products[productIdx], colors }
    }
  }

  return delay(updated)
}

// ---------- 表4 染整單 ----------

/** 明細單列輸入：僅需輸入色彩與各項描述性欄位，三段式庫存以「待染數量」起算 */
export interface DyeOrderItemInput {
  color: string
  sampleCode?: string
  /** 勾選「無色號」：明確表示此列尚無色號，跳過歷史色號查詢，亦不自動觸發表3 */
  noSampleCode?: boolean
  colorMatchStandard?: string
  rollYard?: number
  fabricMaterial?: string
  fabricSpec?: string
  finishedSpec?: string
  unitPrice?: number
  pendingDyeQty: number
}

export interface DyeOrderInput {
  parentId: string
  vendorId: string
  dueDate: string
  productName: string
  /** 產品編號：畫面選定產品分支時帶入，歷史色號查詢與規格帶入皆優先以此解析 */
  productId?: string
  internalContact?: string
  note?: string
  greigeFabricCode?: string
  shippingSampleQty?: number
  unit: DyeOrder['unit']
  items: DyeOrderItemInput[]
}

/** 建立染整單草稿：生管可直接開單，不需等待表3或色號判斷完成，此時尚未觸發委外加工 */
export function createDyeOrder(input: DyeOrderInput): Promise<DyeOrder> {
  const notice = packingNotices.find((n) => n.id === input.parentId)
  if (!notice) throw new Error(`包裝通知單 ${input.parentId} 不存在`)
  const existingForParent = dyeOrders.filter((d) => d.parentId === input.parentId).length
  const id = `${input.parentId}-D${existingForParent + 1}`
  const items: DyeOrderItem[] = input.items.map((item, i) => {
    // 勾選「無色號」或已手動指定色樣編號時，皆不再查詢歷史色號（亦不觸發表3）
    const resolved = item.noSampleCode
      ? { sampleCode: undefined, lastUsedAt: undefined, dyeRequestId: undefined }
      : item.sampleCode
        ? { sampleCode: item.sampleCode, lastUsedAt: undefined, dyeRequestId: undefined }
        : resolveDyeOrderItemSampleCode(
            input.parentId,
            notice.customerId,
            input.productId,
            input.productName,
            item.color,
            input.vendorId,
          )
    return {
      id: `${id}-L${i + 1}`,
      color: item.color,
      sampleCode: resolved.sampleCode,
      sampleCodeLastUsedAt: resolved.lastUsedAt,
      dyeRequestId: resolved.dyeRequestId,
      colorMatchStandard: item.colorMatchStandard,
      // 單卷碼數：畫面未填時取表1對應明細的定碼長度換算碼數
      rollYard: item.rollYard ?? defaultRollYard(notice.items[i]?.fixedLengthMeter) ?? undefined,
      fabricMaterial: item.fabricMaterial,
      fabricSpec: item.fabricSpec,
      finishedSpec: item.finishedSpec,
      unitPrice: item.unitPrice,
      pendingDyeQty: item.pendingDyeQty,
      inDyeQty: 0,
      finishedQty: 0,
    }
  })
  const order: DyeOrder = {
    id,
    parentId: input.parentId,
    status: '草稿',
    dueDate: input.dueDate,
    productName: input.productName,
    productId: input.productId,
    embossing: embossingDisplay(notice.embossing),
    colorRatioNote: colorRatioDisplay(notice.colorRatio),
    vendorId: input.vendorId,
    internalContact: input.internalContact,
    note: input.note,
    items,
    greigeFabricCode: input.greigeFabricCode,
    shippingSampleQty: input.shippingSampleQty,
    unit: input.unit,
  }
  dyeOrders.unshift(order)
  return delay(order)
}

/**
 * 更新染單各列色樣編號：染單不受表3卡控，此欄位在結案（已完成）前皆可修改，
 * 不限於表3回填的時機——生管拿到染整廠回覆即可直接於染單補填或更正。
 */
export function updateDyeOrderSampleCodes(id: string, sampleCodeByItem: Record<string, string>): Promise<DyeOrder> {
  const idx = dyeOrders.findIndex((d) => d.id === id)
  if (idx === -1) throw new Error(`染整單 ${id} 不存在`)
  const current = dyeOrders[idx]
  if (current.status === '已完成') throw new Error('已完成的染整單不可修改色樣編號')
  const updated: DyeOrder = {
    ...current,
    items: current.items.map((item) => {
      if (!(item.id in sampleCodeByItem)) return item
      const next = sampleCodeByItem[item.id].trim()
      // 手動改動後即脫離歷史色號沿用關係，一併清除重新複色提醒的依據
      return next === (item.sampleCode ?? '')
        ? item
        : { ...item, sampleCode: next || undefined, sampleCodeLastUsedAt: undefined }
    }),
  }
  dyeOrders[idx] = updated
  return delay(updated)
}

/**
 * 生管確認後正式建單：狀態變為生效，此時才觸發委外加工。
 * 三段式庫存此時「不」變動——委外染整路徑的胚布直送染整廠、不經皇加倉庫，
 * 染單建立當下不需要胚布已到貨，要等胚布實際到廠確認才真正扣帳（待染→指染），
 * 見 confirmGreigeArrival。
 */
export function confirmDyeOrder(id: string): Promise<DyeOrder> {
  const idx = dyeOrders.findIndex((d) => d.id === id)
  if (idx === -1) throw new Error(`染整單 ${id} 不存在`)
  const current = dyeOrders[idx]
  const updated: DyeOrder = {
    ...current,
    status: '生效',
    effectiveAt: dayjs().toISOString(),
  }
  dyeOrders[idx] = updated

  // 染單晚於入庫單建立時（胚布已先買進來放庫存的「有胚」情境），
  // 轉生效當下依關聯胚布訂單的到貨日補扣待染→指染，不必再等下一張入庫單
  const arrivedPO = purchaseOrders.find((po) => po.parentId === updated.parentId && po.type === '胚布' && po.greigeArrivedAt)
  if (arrivedPO?.greigeArrivedAt) applyGreigeArrivalToDyeOrder(idx, arrivedPO.greigeArrivedAt)

  return delay(dyeOrders[idx])
}

/**
 * 胚布到貨扣帳（待染→指染）：由胚布訂單的表6入庫單結案時觸發，非染單自身的人工動作。
 * 貨到才代表胚布可投入染整，故此時才把各列待染數量轉為指染數量，
 * 維持「待染＋指染＋成品＝總投入量」的三段式恆等關係；已完成的染單不再變動。
 */
function applyGreigeArrivalToDyeOrder(idx: number, arrivedAt: string): void {
  const current = dyeOrders[idx]
  if (current.status === '已完成') return
  dyeOrders[idx] = {
    ...current,
    greigeArrivedAt: current.greigeArrivedAt ?? arrivedAt,
    items: current.items.map((item) => ({
      ...item,
      pendingDyeQty: 0,
      inDyeQty: item.inDyeQty + item.pendingDyeQty,
    })),
  }
}

/** 胚布入庫結案時，連動同一張表1底下所有尚未結案的染單完成待染→指染扣帳 */
function applyGreigeArrivalToParent(parentId: string, arrivedAt: string): void {
  dyeOrders.forEach((order, idx) => {
    if (order.parentId !== parentId) return
    if (order.status === '草稿') return
    applyGreigeArrivalToDyeOrder(idx, arrivedAt)
  })
}

/**
 * 大貨樣確認送樣：完整送樣子流程，退回不設次數上限，選「退回」後該筆鎖定不可修改、自動新增下一筆送樣紀錄。
 * 「通過」為染單結案的唯一判定條件，通過的當下同時發生兩件事（無需另一道人工結案動作）：
 * 1) 染單狀態變更為「已完成」，各列指染數量全數轉為成品數量；
 * 2) 建立表6入庫單草稿（來源：委外加工）。
 * 另回頭結案關聯的表2胚布送染整訂購單。實際交付數量的對照另由表6入庫確認時記錄，不在此登記。
 */
export function submitDyeOrderLargeSample(id: string, result: '通過' | '退回', reason?: string): Promise<DyeOrder> {
  const idx = dyeOrders.findIndex((d) => d.id === id)
  if (idx === -1) throw new Error(`染整單 ${id} 不存在`)
  const current = dyeOrders[idx]
  const submission = {
    id: `${current.id}-SAMPLE${(current.largeSampleSubmissions?.length ?? 0) + 1}`,
    submittedAt: dayjs().toISOString(),
    result,
    reason: result === '退回' ? reason : undefined,
  }
  const submissions = [...(current.largeSampleSubmissions ?? []), submission]

  if (result !== '通過') {
    const rejected: DyeOrder = { ...current, largeSampleSubmissions: submissions }
    dyeOrders[idx] = rejected
    return delay(rejected)
  }

  // 投胚量：無 OCR 廠商單據標示值時，取染單各列「使用胚布」的原始投入量（指染+成品）作為投胚基準
  const pledgedQty = current.items.reduce((sum, item) => sum + item.pendingDyeQty + item.inDyeQty + item.finishedQty, 0)
  const updated: DyeOrder = {
    ...current,
    largeSampleSubmissions: submissions,
    largeSampleConfirmedAt: submission.submittedAt,
    status: '已完成',
    // 指染（染整進行中）全數轉為成品；未經到廠確認的待染量亦於此併入，
    // 維持「待染＋指染＋成品＝總投入量」的三段式恆等關係
    items: current.items.map((item) => ({
      ...item,
      pendingDyeQty: 0,
      inDyeQty: 0,
      finishedQty: item.finishedQty + item.inDyeQty + item.pendingDyeQty,
    })),
  }
  dyeOrders[idx] = updated

  /**
   * 染整完成後的去向分岔：
   * 來源表1明細有指定「加工方法」的品項，染完還要送二次加工，貨不會直接進倉，
   * 故改為自動建立表5二次加工單草稿，入庫單留待表5結案時才建立；
   * 沒有加工方法的品項則維持原本做法，直接建立表6入庫單草稿。
   * 一張染單同時含兩種品項時兩張單都會建立，各自帶各自的品項與投胚量。
   */
  const notice = packingNotices.find((n) => n.id === updated.parentId)
  const noticeItems = notice?.items ?? []
  /**
   * 判斷染單各列是否需要二次加工：以「產品分支（查無則品名）＋顏色」對回表1明細，
   * 不用索引位置——染單是依產品分支分組建立的，索引與表1明細順序不一定一致。
   */
  const sourceItemOf = (item: DyeOrderItem) =>
    noticeItems.find(
      (n) =>
        n.color === item.color &&
        (updated.productId && n.productId ? n.productId === updated.productId : n.roricaProductName === updated.productName),
    )
  const plainPledgedQty = updated.items.reduce(
    (sum, item) => (sourceItemOf(item)?.processingMethod ? sum : sum + item.finishedQty),
    0,
  )
  /**
   * 需要二次加工的品項只取「本張染單自己的明細」——同一張表1可能有多張染單（依產品分支分組），
   * 若直接掃全表1的明細，沒有加工品項的那張染單結案時也會誤建二次加工單，
   * 並把來源染單記成自己，導致下游入庫單沿鏈回推到錯的染單。
   */
  const processingSourceItems = updated.items
    .map((item) => sourceItemOf(item))
    .filter((item): item is PackingNoticeItem => Boolean(item?.processingMethod))

  if (processingSourceItems.length > 0) {
    autoCreateSecondaryProcessingDraft(updated.parentId, processingSourceItems, updated.id)
  }

  if (processingSourceItems.length === 0 || plainPledgedQty > 0) {
    createGoodsReceiptDraft(
      updated.parentId,
      '委外加工',
      { type: '染單', id: updated.id },
      processingSourceItems.length === 0 ? pledgedQty : plainPledgedQty,
    )
  }

  // 胚布訂單－送染整：被動監聽關聯的表4染單狀態變為「已完成」，回頭結案表2訂購單（非訂購單自身動作）
  const poIdx = purchaseOrders.findIndex((p) => p.parentId === updated.parentId && p.type === '胚布' && p.hasDyeVendor)
  if (poIdx !== -1) {
    purchaseOrders[poIdx] = { ...purchaseOrders[poIdx], status: '已完成' }
  }

  return delay(updated)
}

// ---------- 表6 入庫單 ----------

export function updateGoodsReceiptRolls(id: string, rolls: GoodsReceiptRoll[]): Promise<GoodsReceipt> {
  const idx = goodsReceipts.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`入庫單 ${id} 不存在`)
  const updated: GoodsReceipt = { ...goodsReceipts[idx], rolls }
  goodsReceipts[idx] = updated
  return delay(updated)
}

/** 更新投胚量：優先取 OCR 辨識廠商單據標示值，此處為人工覆核／輸入介面 */
export function updateGoodsReceiptPledgedQty(id: string, pledgedQty: number | undefined): Promise<GoodsReceipt> {
  const idx = goodsReceipts.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`入庫單 ${id} 不存在`)
  const updated: GoodsReceipt = { ...goodsReceipts[idx], pledgedQty }
  goodsReceipts[idx] = updated
  return delay(updated)
}

/** 用途：人工選擇的分類欄位，比照舊系統代碼 */
export function updateGoodsReceiptPurpose(id: string, purpose: GoodsReceipt['purpose']): Promise<GoodsReceipt> {
  const idx = goodsReceipts.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`入庫單 ${id} 不存在`)
  const updated: GoodsReceipt = { ...goodsReceipts[idx], purpose }
  goodsReceipts[idx] = updated
  return delay(updated)
}

export interface GoodsReceiptVendorInfoInput {
  vendorId?: string
  vendorShipmentNo?: string
  vendorShipDate?: string
  receiptAttachmentName?: string
}

/** 廠商名稱／廠商出貨單號／出貨日期（OCR辨識）／原始收據附件，此處為人工覆核／輸入介面 */
export function updateGoodsReceiptVendorInfo(id: string, input: GoodsReceiptVendorInfoInput): Promise<GoodsReceipt> {
  const idx = goodsReceipts.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`入庫單 ${id} 不存在`)
  const updated: GoodsReceipt = { ...goodsReceipts[idx], ...input }
  goodsReceipts[idx] = updated
  return delay(updated)
}

/**
 * 將入庫的每一卷對應回表1包裝通知單的明細列：
 * 1) 布卷本身已指定來源明細（OCR 比對或倉管人工指定）者優先採用；
 * 2) 其餘依明細順序「填滿一列的碼數再換下一列」配額，避免用輪替（i % 明細數）把
 *    第 n 卷隨機套到第 n 筆明細上，造成品名／顏色／規格分支張冠李戴。
 */
function assignRollsToNoticeItems(receipt: GoodsReceipt, items: PackingNoticeItem[]): (PackingNoticeItem | undefined)[] {
  const remaining = items.map((item) => item.yard)
  let cursor = 0
  return receipt.rolls.map((roll) => {
    if (roll.sourceItemId) {
      const explicit = items.find((i) => i.id === roll.sourceItemId)
      if (explicit) return explicit
    }
    if (items.length === 0) return undefined
    while (cursor < items.length - 1 && remaining[cursor] <= 0) cursor += 1
    const item = items[cursor]
    remaining[cursor] -= roll.length
    return item
  })
}

/** 依入庫單所屬包裝通知單明細，推算每卷布卷應對應的品名／顏色／幅寬與規格分支 */
function buildFabricLabelsForReceipt(receipt: GoodsReceipt): { label: FabricLabel; sourceItemId?: string }[] {
  const notice = packingNotices.find((n) => n.id === receipt.parentId)
  const items = notice?.items ?? []
  const assigned = assignRollsToNoticeItems(receipt, items)
  /**
   * 條碼流水號在同一「胚布編號」下全域接續，不直接沿用廠商單據上的卷號——
   * 不同廠商（染整廠／加工廠／供應商）的單據卷號各自從 1 起算，同一支胚布編號的兩張入庫單
   * 會產生一模一樣的條碼，出貨扣帳時以捲號比對就會重複扣到同一捲。
   * 廠商單據上的卷號仍完整保留於入庫單 rolls.rollNo，不會遺失。
   */
  const seqByPrefix = new Map<string, number>()
  const nextSeq = (prefix: string): number => {
    if (!seqByPrefix.has(prefix)) {
      seqByPrefix.set(
        prefix,
        fabricLabels
          .filter((l) => rollCodePrefixAndSeq(l.rollCode).prefix === prefix)
          .reduce((max, l) => Math.max(max, rollCodePrefixAndSeq(l.rollCode).seq), 0),
      )
    }
    const seq = (seqByPrefix.get(prefix) ?? 0) + 1
    seqByPrefix.set(prefix, seq)
    return seq
  }
  return receipt.rolls.map((roll, i) => {
    const item = assigned[i]
    const product = item ? resolveProduct(item.productId, item.roricaProductName) : undefined
    // 條碼／序號格式為「胚布編號＋流水號」，如 T3268305-01
    const codePrefix = product?.greigeFabricCode ?? item?.roricaProductName ?? receipt.id
    return {
      sourceItemId: item?.id,
      label: {
        id: `${receipt.id}-L${roll.rollNo}`,
        receiptId: receipt.id,
        rollCode: `${codePrefix}-${pad(nextSeq(codePrefix), 2)}`,
        productName: item?.roricaProductName ?? product?.productName ?? '未指定品名',
        // 帶上產品編號，庫存比對才能區分同品名的不同規格分支
        productId: product?.id,
        composition: product?.material,
        color: item?.color ?? '未指定',
        width: product?.width ?? 0,
        // 批號為廠商單據上的批次號，由 OCR 帶入或倉管補填；未提供則留空，不自行造號
        batchCode: roll.batchCode,
        length: roll.length,
        unit: 'Yard',
        status: '已建立',
      },
    }
  })
}

/**
 * 由入庫單沿關聯鏈解析出「本張入庫單對應的那一張染單」。
 * 委外加工路徑有兩個觸發點：染單結案（關聯單據＝染單）與二次加工單結案（關聯單據＝二次加工單，
 * 需再經 dyeOrderId 轉一手）。同一張表1可能有多張染單（依產品分支分組），
 * 故一律以單號解析，不可用「主號＋已完成」抓第一張，否則會貼到錯的染單。
 * 舊資料沒有關聯單號時，才退回以主號比對已完成的染單。
 */
function resolveDyeOrderIndexForReceipt(receipt: GoodsReceipt): number {
  if (receipt.relatedDocType === '染單' && receipt.relatedDocId) {
    return dyeOrders.findIndex((d) => d.id === receipt.relatedDocId)
  }
  if (receipt.relatedDocType === '二次加工單' && receipt.relatedDocId) {
    const spo = secondaryProcessingOrders.find((o) => o.id === receipt.relatedDocId)
    if (spo?.dyeOrderId) return dyeOrders.findIndex((d) => d.id === spo.dyeOrderId)
    // 人工開立的二次加工單沒有來源染單，僅能以主號回推
    return dyeOrders.findIndex((d) => d.parentId === receipt.parentId && d.status === '已完成')
  }
  return dyeOrders.findIndex((d) => d.parentId === receipt.parentId && d.status === '已完成')
}

/**
 * 標記入庫單狀態；標記為「已完成」時：
 * 1) 依規則觸發表7布卷條碼標籤（每卷入庫布卷各一張），並自動建立／併入表8出貨單草稿
 *    （無庫存路徑：貨剛入庫才匯入表8，兩個進入點之一）；
 * 2) 委外加工送染整路徑：於表1包裝通知單、表4染整單新增「實際入庫數量對照」區塊；
 * 3) 純採購路徑（直採大貨-成品／胚布）：回頭結案對應的表2訂購單，
 *    委外加工路徑則不需再結案（表4染單於大貨樣通過當下已完成）。
 */
export function setGoodsReceiptStatus(id: string, status: GoodsReceipt['status']): Promise<GoodsReceipt> {
  const idx = goodsReceipts.findIndex((r) => r.id === id)
  if (idx === -1) throw new Error(`入庫單 ${id} 不存在`)
  if (status === '已複核' && goodsReceipts[idx].rolls.some((r) => r.ocrConfidence === '低' && !r.reviewed)) {
    throw new Error('尚有低信心度欄位待人工複核，請先勾選「已人工複核」')
  }
  const updated: GoodsReceipt = { ...goodsReceipts[idx], status }
  goodsReceipts[idx] = updated

  if (status === '已完成' && !fabricLabels.some((l) => l.receiptId === updated.id)) {
    const built = buildFabricLabelsForReceipt(updated)
    fabricLabels.unshift(...built.map((b) => b.label))

    const notice = packingNotices.find((n) => n.id === updated.parentId)
    if (notice) {
      const shippingItems: ShippingOrderItem[] = built.map(({ label, sourceItemId }) => {
        const sourceItem = notice.items.find((i) => i.id === sourceItemId)
        const product = resolveProduct(label.productId ?? sourceItem?.productId, label.productName)
        return {
          sourceItemId,
          customerProductName: sourceItem?.customerProductName,
          roricaProductName: label.productName,
          color: label.color,
          rollCodes: [label.rollCode],
          yard: label.length,
          meter: Number(yardToMeter(label.length).toFixed(1)),
          unitPrice: product?.sellPrice,
          note: sourceItem?.note,
        }
      })
      autoCreateOrAppendShippingOrder(updated.parentId, notice.customerId, shippingItems)
    }
  }

  if (status === '已完成' && updated.source === '委外加工') {
    const actualQty = updated.rolls.reduce((sum, r) => sum + r.length, 0)
    const comparison: ActualReceiptComparison = {
      id: `${updated.id}-CMP`,
      receiptId: updated.id,
      recordedAt: dayjs().toISOString(),
      actualQty,
      unit: 'Yard',
    }
    const noticeIdx = packingNotices.findIndex((n) => n.id === updated.parentId)
    if (noticeIdx !== -1) {
      packingNotices[noticeIdx] = {
        ...packingNotices[noticeIdx],
        actualReceiptComparisons: [...(packingNotices[noticeIdx].actualReceiptComparisons ?? []), comparison],
      }
    }
    const dyeOrderIdx = resolveDyeOrderIndexForReceipt(updated)
    if (dyeOrderIdx !== -1) {
      dyeOrders[dyeOrderIdx] = {
        ...dyeOrders[dyeOrderIdx],
        actualReceiptComparisons: [...(dyeOrders[dyeOrderIdx].actualReceiptComparisons ?? []), comparison],
      }
    }
  }

  /**
   * 結案關聯單據：以入庫單記錄的關聯單號直接結案（舊資料沒有關聯單號時，才退回以主號＋來源類型反推）。
   * 委外加工路徑的上游（染單／二次加工單）在入庫前就已經完成，入庫單只是伴隨動作，不需再結案；
   * 訂購單則相反——入庫完成才是訂購單完成的前提。
   */
  if (status === '已完成' && (updated.source === '直採大貨-成品' || updated.source === '直採大貨-胚布')) {
    const type = updated.source === '直採大貨-成品' ? '成品' : '胚布'
    const poIdx = updated.relatedDocId
      ? purchaseOrders.findIndex((p) => p.id === updated.relatedDocId)
      : purchaseOrders.findIndex((p) => p.parentId === updated.parentId && p.type === type)
    if (poIdx !== -1) {
      const arrivedAt = dayjs().toISOString()
      purchaseOrders[poIdx] = {
        ...purchaseOrders[poIdx],
        status: '已完成',
        // 胚布訂單：入庫結案即代表該批胚布已到貨，可投入染整
        greigeArrivedAt: type === '胚布' ? (purchaseOrders[poIdx].greigeArrivedAt ?? arrivedAt) : purchaseOrders[poIdx].greigeArrivedAt,
      }
      // 胚布到貨連動：同一張表1底下已起單的染單，待染數量於此時轉為指染數量
      if (type === '胚布') applyGreigeArrivalToParent(updated.parentId, arrivedAt)
    }
  }

  return delay(updated)
}

// ---------- 表7 布卷條碼標籤 ----------
// 表7 非系統畫面／表單，僅為列印在標籤紙上、貼附於布捲上的實體身分標籤；
// 以下邏輯對應的是入庫/分割等實體事件觸發時，系統內部須同步更新的條碼紀錄。

/** 布卷條碼「胚布編號＋流水號」中的流水號部分（最後一個 "-" 之後） */
function rollCodePrefixAndSeq(rollCode: string): { prefix: string; seq: number } {
  const idx = rollCode.lastIndexOf('-')
  const prefix = rollCode.slice(0, idx)
  const seq = Number(rollCode.slice(idx + 1))
  return { prefix, seq: Number.isNaN(seq) ? 0 : seq }
}

/**
 * 分割布卷（一捲拆成多捲）：原條碼標記為終止狀態，不可再用於出貨等後續操作，但保留紀錄供追溯，
 * 同時記一筆長度異動（異動前原長度→異動後0，原因「已分割」）；
 * 分割產生的新捲條碼直接接續當時最大可用流水號（非原編號的子序號），各自依分割後的長度建立新條碼。
 */
export function splitFabricLabel(id: string, firstLength: number): Promise<FabricLabel[]> {
  const idx = fabricLabels.findIndex((l) => l.id === id)
  if (idx === -1) throw new Error(`布卷條碼標籤 ${id} 不存在`)
  const original = fabricLabels[idx]
  if (original.status !== '已建立') throw new Error('僅「已建立」狀態的布卷可以分割')
  if (!(firstLength > 0) || firstLength >= original.length) {
    throw new Error('分割長度需大於 0 且小於原布卷長度')
  }
  const secondLength = original.length - firstLength

  const { prefix, seq: originalSeq } = rollCodePrefixAndSeq(original.rollCode)
  const maxSeq = fabricLabels
    .filter((l) => rollCodePrefixAndSeq(l.rollCode).prefix === prefix)
    .reduce((max, l) => Math.max(max, rollCodePrefixAndSeq(l.rollCode).seq), originalSeq)

  const now = dayjs().toISOString()
  const terminated: FabricLabel = {
    ...original,
    status: '已終止',
    length: 0,
    lengthHistory: [...(original.lengthHistory ?? []), { at: now, beforeLength: original.length, afterLength: 0, reason: '已分割' }],
  }
  fabricLabels[idx] = terminated

  const newLabels: FabricLabel[] = [firstLength, secondLength].map((length, i) => ({
    id: `${original.receiptId}-L${maxSeq + i + 1}`,
    receiptId: original.receiptId,
    rollCode: `${prefix}-${pad(maxSeq + i + 1, 2)}`,
    productName: original.productName,
    composition: original.composition,
    color: original.color,
    width: original.width,
    batchCode: original.batchCode,
    length,
    unit: original.unit,
    status: '已建立',
    splitFromRollCode: original.rollCode,
  }))
  fabricLabels.unshift(...newLabels)
  return delay(newLabels)
}

// ---------- 表8 出貨單 ----------

export type ShippingOrderItemInput = Omit<ShippingOrderItem, 'meter'>

export interface ShippingOrderInput {
  parentId: string
  customerId: string
  isSampleOrder: boolean
  items: ShippingOrderItemInput[]
  purpose?: ShippingOrder['purpose']
}

/**
 * 表1到表8完整流程：表8有兩個自動進入點——有庫存路徑由表1建立庫存預留時直接匯入；
 * 無庫存路徑則等表6入庫單完成才匯入（貨剛入庫）。兩者皆自動建立／併入同一張出貨單草稿
 * （依包裝單明細帶入），若該包裝通知單已有「草稿」狀態的出貨單草稁則併入明細，否則新建一張。
 */
function autoCreateOrAppendShippingOrder(parentId: string, customerId: string, newItems: ShippingOrderItem[]): void {
  if (newItems.length === 0) return
  const draftIdx = shippingOrders.findIndex((s) => s.parentId === parentId && s.status === '草稿')
  if (draftIdx !== -1) {
    shippingOrders[draftIdx] = { ...shippingOrders[draftIdx], items: [...shippingOrders[draftIdx].items, ...newItems] }
    return
  }
  const existingForParent = shippingOrders.filter((s) => s.parentId === parentId).length
  const warehouseAccount = accounts.find((a) => a.roles.includes('倉管')) ?? accounts[0]
  shippingOrders.unshift({
    id: `${parentId}-S${existingForParent + 1}`,
    parentId,
    customerId,
    status: '草稿',
    shipDate: dayjs().toISOString(),
    isSampleOrder: false,
    items: newItems,
    operatorAccountId: warehouseAccount.id,
  })
}

/** 建立出貨單：明細以布卷條碼組合記錄（拼接出貨即為實際使用的捲號組合） */
export function createShippingOrder(input: ShippingOrderInput): Promise<ShippingOrder> {
  const existingForParent = shippingOrders.filter((s) => s.parentId === input.parentId).length
  const warehouseAccount = accounts.find((a) => a.roles.includes('倉管')) ?? accounts[0]
  const order: ShippingOrder = {
    id: `${input.parentId}-S${existingForParent + 1}`,
    parentId: input.parentId,
    customerId: input.customerId,
    status: '草稿',
    shipDate: dayjs().toISOString(),
    isSampleOrder: input.isSampleOrder,
    items: input.items.map((item) => ({ ...item, meter: Number(yardToMeter(item.yard).toFixed(1)) })),
    operatorAccountId: warehouseAccount.id,
    purpose: input.purpose,
  }
  shippingOrders.unshift(order)
  return delay(order)
}

/**
 * 更新出貨單明細：明細由包裝通知單直接帶入後「可微調／刪除」，
 * 供倉管於確認建單前調整實際出貨的品項與數量；已建立之後不再提供修改。
 */
export function updateShippingOrderItems(id: string, items: ShippingOrderItem[]): Promise<ShippingOrder> {
  const idx = shippingOrders.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`出貨單 ${id} 不存在`)
  const current = shippingOrders[idx]
  if (current.status !== '草稿') throw new Error('僅草稿狀態可調整明細')
  if (items.length === 0) throw new Error('至少需保留一筆明細')
  const updated: ShippingOrder = {
    ...current,
    // Yard/Meter 雙單位一律同時記錄，Meter 依 Yard 重新換算
    items: items.map((item) => ({ ...item, meter: Number(yardToMeter(item.yard).toFixed(1)) })),
  }
  shippingOrders[idx] = updated
  return delay(updated)
}

/** 簽名欄：處理人／倉管／出貨／業務，比照紙本單據四個簽名欄位 */
export function updateShippingOrderSignatures(id: string, signatures: ShippingOrder['signatures']): Promise<ShippingOrder> {
  const idx = shippingOrders.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`出貨單 ${id} 不存在`)
  const updated: ShippingOrder = { ...shippingOrders[idx], signatures }
  shippingOrders[idx] = updated
  return delay(updated)
}

export function setShippingOrderStatus(id: string, status: ShippingOrder['status']): Promise<ShippingOrder> {
  const idx = shippingOrders.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`出貨單 ${id} 不存在`)
  const updated: ShippingOrder = { ...shippingOrders[idx], status }
  shippingOrders[idx] = updated
  return delay(updated)
}

/**
 * 確認出貨完成，並觸發扣庫存：依明細記錄的布卷條碼組合逐捲扣減表7條碼標籤的長度
 * （拼接出貨時一筆明細對應多個捲號，依序扣到出貨量扣完為止；最後一捲不足整支即為裁切，
 * 裁剩的零碼布留在該捲條碼上等待下次湊單）。部分出貨（尚有剩餘長度）狀態轉為「已使用」，
 * 全部出貨（長度歸零）轉為「已完成」，兩者皆不可逆；每次扣減皆記錄一筆長度異動紀錄。
 */
export function completeShippingOrder(id: string): Promise<ShippingOrder> {
  const idx = shippingOrders.findIndex((s) => s.id === id)
  if (idx === -1) throw new Error(`出貨單 ${id} 不存在`)
  const updated: ShippingOrder = { ...shippingOrders[idx], status: '已完成' }
  shippingOrders[idx] = updated

  const now = dayjs().toISOString()
  updated.items.forEach((item) => {
    let remaining = item.yard
    const spliced = item.rollCodes.length > 1
    item.rollCodes.forEach((rollCode) => {
      if (remaining <= 0) return
      const labelIdx = fabricLabels.findIndex((l) => l.rollCode === rollCode)
      if (labelIdx === -1) return
      const label = fabricLabels[labelIdx]
      const deducted = Math.min(label.length, remaining)
      const afterLength = Number((label.length - deducted).toFixed(2))
      remaining = Number((remaining - deducted).toFixed(2))
      fabricLabels[labelIdx] = {
        ...label,
        length: afterLength,
        status: afterLength <= 0 ? '已完成' : '已使用',
        lengthHistory: [
          ...(label.lengthHistory ?? []),
          { at: now, beforeLength: label.length, afterLength, reason: spliced ? '拼接使用' : '出貨' },
        ],
      }
    })
  })

  // 表1「已完成」判定：所有明細物品皆已出貨，由出貨單完成時回頭結案，非人工手動標記
  const noticeIdx = packingNotices.findIndex((n) => n.id === updated.parentId)
  if (noticeIdx !== -1) {
    const notice = packingNotices[noticeIdx]
    if (notice.status === '生效' && isPackingNoticeFullyShipped(notice, notice.id, shippingOrders)) {
      packingNotices[noticeIdx] = { ...notice, status: '已完成' }
    }
  }

  return delay(updated)
}

// ---------- 商品資料主檔 ----------

/**
 * 商品資料主檔編輯視窗可輸入的欄位。
 * 「產品編號」「米重（G/M）」「歷史色號」不在其中：前者為建檔時產生的識別碼，
 * 米重依碼重÷0.9144 自動連動且唯讀，歷史色號由表3/表4實際使用時累積，皆不開放手動維護。
 */
export interface ProductInput {
  productName: string
  customerProductName: string
  customerId: string
  categoryCode: Product['categoryCode']

  greigeFabricCode?: string
  material: string
  greigeSpec: string
  finishedSpec: string
  thicknessMm: number
  characteristics: string
  width: number
  widthTolerancePct: number
  weightGY: number
  weightTolerancePct: number
  originalRollStandardYard: number
  costPrice?: number
  sellPrice?: number
}

export function updateProduct(id: string, input: ProductInput): Promise<Product> {
  const idx = products.findIndex((p) => p.id === id)
  if (idx === -1) throw new Error(`商品 ${id} 不存在`)
  if (!input.productName.trim()) throw new Error('皇加品名為必填')

  const updated: Product = {
    ...products[idx],
    ...input,
    // 米重為唯讀衍生欄位，一律由碼重重新換算，不接受畫面傳入值
    weightMY: Number(yardWeightToMeterWeight(input.weightGY).toFixed(2)),
  }
  products[idx] = updated
  return delay(updated)
}

// ---------- 表5 二次加工單 ----------

export interface SecondaryProcessingInput {
  /** 來源表1包裝通知單單號 */
  parentId: string
  vendorId: string
  vendorContactPerson?: string
  vendorPhone?: string
  vendorAddress?: string
  internalContact?: string
  dueDate: string
  note?: string
  /** 納入本單的表1明細列 id：只挑需要二次加工的品項，非全部帶入 */
  sourceItemIds: string[]
  /** 加工單價：鍵值為來源表1明細列 id */
  itemUnitPrices: Record<string, number | undefined>
}

/**
 * 建立表5二次加工單：加工明細與包裝設定皆由表1帶入（明細數量、加工方法唯讀，僅加工單價可編輯），
 * 廠商資訊選自廠商資料主檔。同一張表1可開多張（不同加工廠分開發包），故單號流水為 -X{n}。
 */
export function createSecondaryProcessingOrder(input: SecondaryProcessingInput): Promise<SecondaryProcessingOrder> {
  const notice = packingNotices.find((n) => n.id === input.parentId)
  if (!notice) throw new Error(`包裝通知單 ${input.parentId} 不存在`)
  if (!input.vendorId) throw new Error('請選擇加工廠')

  const sourceItems = notice.items.filter((item) => input.sourceItemIds.includes(item.id))
  if (sourceItems.length === 0) throw new Error('請至少選擇一筆加工明細')

  const existingForParent = secondaryProcessingOrders.filter((o) => o.parentId === notice.id).length
  const id = `${notice.id}-X${existingForParent + 1}`

  const order: SecondaryProcessingOrder = {
    id,
    parentId: notice.id,
    customerId: notice.customerId,
    status: '草稿',
    createdAt: dayjs().toISOString(),
    dueDate: input.dueDate,
    vendorId: input.vendorId,
    vendorContactPerson: input.vendorContactPerson,
    vendorPhone: input.vendorPhone,
    vendorAddress: input.vendorAddress,
    internalContact: input.internalContact,
    note: input.note,
    items: sourceItems.map((item, i) => ({
      id: `${id}-L${i + 1}`,
      sourceItemId: item.id,
      customerProductName: item.customerProductName,
      roricaProductName: item.roricaProductName,
      productId: item.productId,
      color: item.color,
      yard: item.yard,
      meter: item.meter,
      processingMethod: item.processingMethod,
      processingMethodNote: item.processingMethodNote,
      unitPrice: input.itemUnitPrices[item.id],
      note: item.note,
    })),
    packaging: buildSecondaryProcessingPackaging(notice),
  }
  secondaryProcessingOrders.unshift(order)
  return delay(order)
}

export function setSecondaryProcessingStatus(
  id: string,
  status: SecondaryProcessingOrder['status'],
): Promise<SecondaryProcessingOrder> {
  const idx = secondaryProcessingOrders.findIndex((o) => o.id === id)
  if (idx === -1) throw new Error(`二次加工單 ${id} 不存在`)
  const current = secondaryProcessingOrders[idx]
  if (status === '生效' && !current.vendorId) throw new Error('請先指定加工廠才能發包')

  const updated: SecondaryProcessingOrder = {
    ...current,
    status,
    effectiveAt: status === '草稿' ? current.effectiveAt : (current.effectiveAt ?? dayjs().toISOString()),
  }
  secondaryProcessingOrders[idx] = updated

  // 加工完成即代表貨要進倉：接續建立表6入庫單草稿，讓染整→二次加工→入庫的流程接得起來
  if (status === '已完成' && current.status !== '已完成') {
    const pledgedQty = updated.items.reduce((sum, item) => sum + item.yard, 0)
    createGoodsReceiptDraft(updated.parentId, '委外加工', { type: '二次加工單', id: updated.id }, pledgedQty)
  }

  return delay(updated)
}

/** 加工單價與備註：僅草稿狀態可調整，比照表8出貨明細的做法 */
export function updateSecondaryProcessingItems(
  id: string,
  items: SecondaryProcessingItem[],
): Promise<SecondaryProcessingOrder> {
  const idx = secondaryProcessingOrders.findIndex((o) => o.id === id)
  if (idx === -1) throw new Error(`二次加工單 ${id} 不存在`)
  if (secondaryProcessingOrders[idx].status !== '草稿') throw new Error('僅草稿狀態可調整明細')
  if (items.length === 0) throw new Error('至少需保留一筆明細')
  const updated: SecondaryProcessingOrder = { ...secondaryProcessingOrders[idx], items }
  secondaryProcessingOrders[idx] = updated
  return delay(updated)
}

// ---------- 客戶資料主檔 ----------

/**
 * 客戶主檔編輯視窗可輸入的欄位。
 * 「系統編號」不在其中：它是建檔時自動產生的主鍵，所有單據以此關聯客戶，一律不可修改；
 * 「客戶代碼」則相反，是對外使用的代號，開放使用者隨時更新，改動不影響既有單據的關聯。
 */
export type CustomerInput = Omit<Customer, 'id'>

export function updateCustomer(id: string, input: CustomerInput): Promise<Customer> {
  const idx = customers.findIndex((c) => c.id === id)
  if (idx === -1) throw new Error(`客戶 ${id} 不存在`)
  if (!input.code.trim()) throw new Error('客戶代碼為必填')
  if (!input.shortName.trim()) throw new Error('客戶簡稱為必填')
  // 代碼非主鍵，但仍須全檔唯一，否則對外溝通會指到兩家客戶
  if (customers.some((c) => c.id !== id && c.code.trim() === input.code.trim())) {
    throw new Error(`客戶代碼「${input.code}」已被其他客戶使用`)
  }

  const updated: Customer = { ...customers[idx], ...input }
  customers[idx] = updated
  return delay(updated)
}

// ---------- 廠商資料主檔 ----------

/** 廠商主檔編輯視窗可輸入的欄位；系統編號為自動產生的主鍵，不在其中 */
export type VendorInput = Omit<Vendor, 'id'>

export function updateVendor(id: string, input: VendorInput): Promise<Vendor> {
  const idx = vendors.findIndex((v) => v.id === id)
  if (idx === -1) throw new Error(`廠商 ${id} 不存在`)
  if (!input.code.trim()) throw new Error('廠商代碼為必填')
  if (!input.name.trim()) throw new Error('廠名為必填')
  if (input.types.length === 0) throw new Error('請至少選擇一種廠商類型')
  if (!input.taxId.trim()) throw new Error('統一編號為必填')
  if (vendors.some((v) => v.id !== id && v.code.trim() === input.code.trim())) {
    throw new Error(`廠商代碼「${input.code}」已被其他廠商使用`)
  }

  const updated: Vendor = { ...vendors[idx], ...input }
  vendors[idx] = updated
  return delay(updated)
}

export interface SecondaryProcessingVendorInput {
  vendorId: string
  vendorContactPerson?: string
  vendorPhone?: string
  vendorAddress?: string
  internalContact?: string
  dueDate?: string
  note?: string
}

/**
 * 廠商資訊：僅草稿狀態可調整。
 * 染整完成時自動建立的二次加工單草稿沒有加工廠，須由生管於此補齊後才能發包。
 */
export function updateSecondaryProcessingVendor(
  id: string,
  input: SecondaryProcessingVendorInput,
): Promise<SecondaryProcessingOrder> {
  const idx = secondaryProcessingOrders.findIndex((o) => o.id === id)
  if (idx === -1) throw new Error(`二次加工單 ${id} 不存在`)
  if (secondaryProcessingOrders[idx].status !== '草稿') throw new Error('僅草稿狀態可調整廠商資訊')
  const updated: SecondaryProcessingOrder = { ...secondaryProcessingOrders[idx], ...input }
  secondaryProcessingOrders[idx] = updated
  return delay(updated)
}

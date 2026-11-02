import dayjs from 'dayjs'
import { meterToYard } from './units'
import { shippingItemNoticeId } from './workflow'
import { toNtd, type FxRates } from './money'
import type {
  AbnormalNotice,
  Customer,
  DyeOrder,
  FabricLabel,
  GoodsReceipt,
  PackingNotice,
  Product,
  PurchaseOrder,
  SecondaryProcessingOrder,
  ShippingOrder,
} from '@/types'

/**
 * 首頁儀表板的計算（決策171）。只算數字、不碰畫面。
 *
 * - 銷量＝實際出貨：已完成的表8，依出貨日落在期間內；換貨出貨單（表9 補償）不計
 * - 營收＝售價 × 碼數，依匯率換成 NTD；看不到售價的角色拿到的資料沒有單價，營收自然算不出來
 * - **每碼完整成本**依出貨的那幾捲布對回它的入庫批次：
 *     成品直採：表2 單價
 *     胚布→染整（→二次加工）：（胚布單價＋染整單價）× 投胚量 ÷ 入庫碼數 ＋ 二次加工單價
 *   染整按投入胚布計價；縮率優先用該批實際（投胚量 vs 入庫碼數），沒有再用表4 預期縮率，再沒有用產品平均
 * - 全程完整精度，顯示時才四捨五入（lib/money）
 */
export interface DashboardDocs {
  shippingOrders: ShippingOrder[]
  fabricLabels: FabricLabel[]
  goodsReceipts: GoodsReceipt[]
  purchaseOrders: PurchaseOrder[]
  dyeOrders: DyeOrder[]
  secondaryProcessingOrders: SecondaryProcessingOrder[]
  packingNotices: PackingNotice[]
  products: Product[]
  customers: Customer[]
  abnormalNotices: AbnormalNotice[]
}

export interface Period {
  from: dayjs.Dayjs
  /** 不含 */
  to: dayjs.Dayjs
}

/** 一捲布每碼成本的組成（NTD／碼）；任一需要的單價缺漏即為 undefined */
export interface UnitCost {
  greige: number
  dye: number
  secondary: number
  /** 成品直採的進價（與胚布＋染整互斥） */
  finished: number
  total: number
}

export interface ShipmentLine {
  orderId: string
  shipDate: string
  customerId: string
  productKey: string
  productName: string
  color: string
  yard: number
  revenueNtd?: number
  /** 原幣別：非 NTD 的營收是換算來的，畫面要附匯率提示 */
  currency: string
  /** 有成本的碼數與其成本（NTD）；成本資料不完整的部分不計 */
  costedYard: number
  costNtd: number
  costParts: { greige: number; dye: number; secondary: number; finished: number }
  /** 這一列算成本時缺資料的入庫批次 */
  incompleteReceipts: string[]
}

const toYard = (length: number, unit: 'Yard' | 'Meter') => (unit === 'Meter' ? meterToYard(length) : length)

function sameProduct(a: { productId?: string; roricaProductName?: string }, label: FabricLabel): boolean {
  if (a.productId && label.productId) return a.productId === label.productId
  return (a.roricaProductName ?? '') === label.productName
}

/** 縮率倍數＝投入 ÷ 產出（1 ÷（1－縮率））；查不到時回傳 undefined */
function shrinkFactor(receipt: GoodsReceipt, dye: DyeOrder | undefined, color: string, product: Product | undefined): number | undefined {
  const received = receipt.rolls.reduce((s, r) => s + r.length, 0)
  if (receipt.pledgedQty && received > 0) return receipt.pledgedQty / received
  const pct = dye?.items.find((i) => i.color === color)?.expectedShrinkagePct
  if (pct != null && pct < 100) return 1 / (1 - pct / 100)
  const records = (product?.shrinkageRecords ?? []).filter((r) => !dye || r.dyeVendorId === dye.vendorId)
  if (records.length > 0) {
    const avg = records.reduce((s, r) => s + r.ratePct, 0) / records.length
    if (avg < 100) return 1 / (1 - avg / 100)
  }
  return undefined
}

/** 染單上每碼的染整單價（表4 可選以米計價，換成每碼） */
function dyePricePerYard(dye: DyeOrder, color: string): number | undefined {
  const price = dye.items.find((i) => i.color === color)?.unitPrice
  if (price == null) return undefined
  return dye.unit === 'Meter' ? price * 0.9144 : price
}

/** 一捲布的每碼完整成本（NTD）；資料不完整回傳 undefined */
export function rollUnitCost(label: FabricLabel, docs: DashboardDocs): UnitCost | undefined {
  const receipt = docs.goodsReceipts.find((r) => r.id === label.receiptId)
  if (!receipt) return undefined
  const product = docs.products.find((p) => p.id === label.productId)
  const poItemPrice = (po: PurchaseOrder | undefined) =>
    po?.items.find((i) => sameProduct(i, label) && i.color === label.color)?.unitPrice ??
    po?.items.find((i) => sameProduct(i, label))?.unitPrice

  // 舊資料沒記關聯單據：依入庫來源回推同一張表1 底下的單據
  const relatedType =
    receipt.relatedDocType ??
    (receipt.source === '直採大貨-成品' ? '成品訂單' : receipt.source === '直採大貨-胚布' ? '胚布訂單' : undefined)
  if (relatedType === '成品訂單' || relatedType === '胚布訂單') {
    const po =
      docs.purchaseOrders.find((p) => p.id === receipt.relatedDocId) ??
      docs.purchaseOrders.find((p) => p.parentId === receipt.parentId && p.type === (relatedType === '成品訂單' ? '成品' : '胚布'))
    const price = poItemPrice(po)
    if (price == null) return undefined
    return { greige: 0, dye: 0, secondary: 0, finished: price, total: price }
  }

  const sp =
    receipt.relatedDocType === '二次加工單'
      ? docs.secondaryProcessingOrders.find((o) => o.id === receipt.relatedDocId)
      : undefined
  const dye =
    receipt.relatedDocType === '染單'
      ? docs.dyeOrders.find((d) => d.id === receipt.relatedDocId)
      : sp?.dyeOrderId
        ? docs.dyeOrders.find((d) => d.id === sp.dyeOrderId)
        : // 舊資料（委外加工但沒記關聯單據）：同一張表1 的染單
          !receipt.relatedDocType && receipt.source === '委外加工'
          ? docs.dyeOrders.find((d) => d.parentId === receipt.parentId)
          : sp
            ? docs.dyeOrders.find((d) => d.parentId === sp.parentId)
            : undefined
  if (!dye) return undefined
  // 表4 的來源表2：決策163 起記單號；舊資料以同一張表1 的胚布訂單對應
  const greigePo =
    docs.purchaseOrders.find((p) => p.id === dye.purchaseOrderId) ??
    docs.purchaseOrders.find((p) => p.parentId === dye.parentId && p.type === '胚布')
  const greigePrice = poItemPrice(greigePo)
  const dyePrice = dyePricePerYard(dye, label.color)
  const factor = shrinkFactor(receipt, dye, label.color, product)
  if (greigePrice == null || dyePrice == null || factor == null) return undefined
  let secondary = 0
  if (sp) {
    const price = sp.items.find((i) => i.color === label.color && sameProduct(i, label))?.unitPrice
      ?? sp.items.find((i) => i.color === label.color)?.unitPrice
    if (price == null) return undefined
    secondary = price
  }
  const greige = greigePrice * factor
  const dyeCost = dyePrice * factor
  return { greige, dye: dyeCost, secondary, finished: 0, total: greige + dyeCost + secondary }
}

/** 期間內的出貨明細（每列已算好營收與成本） */
export function shipmentLines(docs: DashboardDocs, period: Period, rates: FxRates): ShipmentLine[] {
  const costCache = new Map<string, UnitCost | undefined>()
  const unitCostOf = (label: FabricLabel) => {
    if (!costCache.has(label.id)) costCache.set(label.id, rollUnitCost(label, docs))
    return costCache.get(label.id)
  }
  const lines: ShipmentLine[] = []
  for (const order of docs.shippingOrders) {
    if (order.status !== '已完成' || order.sourceAbnormalId) continue
    const date = dayjs(order.shipDate)
    if (date.isBefore(period.from) || !date.isBefore(period.to)) continue
    const currency = order.currency ?? 'NTD'
    for (const item of order.items) {
      const noticeId = shippingItemNoticeId(order, item)
      const source = docs.packingNotices.find((n) => n.id === noticeId)?.items.find((i) => i.id === item.sourceItemId)
      const productId = source?.productId
      const productName = item.roricaProductName || source?.roricaProductName || '（未填品名）'
      const line: ShipmentLine = {
        orderId: order.id,
        shipDate: order.shipDate,
        customerId: order.customerId,
        productKey: productId ?? productName,
        productName,
        color: item.color || source?.color || '',
        yard: item.yard,
        revenueNtd: item.unitPrice == null ? undefined : toNtd(item.unitPrice * item.yard, currency, rates),
        currency,
        costedYard: 0,
        costNtd: 0,
        costParts: { greige: 0, dye: 0, secondary: 0, finished: 0 },
        incompleteReceipts: [],
      }
      // 每捲出了多少：決策166 起有逐捲出貨紀錄；舊出貨沒有紀錄，依捲數平均分攤
      const labels = item.rollCodes
        .map((code) => docs.fabricLabels.find((l) => l.rollCode === code))
        .filter((l): l is FabricLabel => Boolean(l))
      const portions = labels.map((label) => {
        const recorded = (label.shipments ?? [])
          .filter((s) => s.shippingOrderId === order.id)
          .reduce((s, x) => s + toYard(x.length, label.unit), 0)
        return { label, yard: recorded > 0 ? recorded : item.yard / Math.max(labels.length, 1) }
      })
      for (const { label, yard } of portions) {
        const cost = unitCostOf(label)
        if (!cost) {
          if (!line.incompleteReceipts.includes(label.receiptId)) line.incompleteReceipts.push(label.receiptId)
          continue
        }
        line.costedYard += yard
        line.costNtd += cost.total * yard
        line.costParts.greige += cost.greige * yard
        line.costParts.dye += cost.dye * yard
        line.costParts.secondary += cost.secondary * yard
        line.costParts.finished += cost.finished * yard
      }
      if (labels.length === 0) line.incompleteReceipts.push(`${order.id}（未填布卷）`)
      lines.push(line)
    }
  }
  return lines
}

export interface Totals {
  yard: number
  /** 有售價的碼數與營收 */
  pricedYard: number
  revenueNtd: number
  costedYard: number
  costNtd: number
  /** 同時有售價與成本的部分：毛利只看這一段 */
  marginRevenueNtd: number
  marginCostNtd: number
  costParts: { greige: number; dye: number; secondary: number; finished: number }
  incompleteReceipts: Set<string>
  /** 營收裡有外幣換算的部分 */
  hasForeign: boolean
}

export function summarize(lines: ShipmentLine[]): Totals {
  const t: Totals = {
    yard: 0,
    pricedYard: 0,
    revenueNtd: 0,
    costedYard: 0,
    costNtd: 0,
    marginRevenueNtd: 0,
    marginCostNtd: 0,
    costParts: { greige: 0, dye: 0, secondary: 0, finished: 0 },
    incompleteReceipts: new Set(),
    hasForeign: false,
  }
  for (const l of lines) {
    if (l.revenueNtd != null && l.currency !== 'NTD') t.hasForeign = true
    t.yard += l.yard
    if (l.revenueNtd != null) {
      t.pricedYard += l.yard
      t.revenueNtd += l.revenueNtd
    }
    t.costedYard += l.costedYard
    t.costNtd += l.costNtd
    t.costParts.greige += l.costParts.greige
    t.costParts.dye += l.costParts.dye
    t.costParts.secondary += l.costParts.secondary
    t.costParts.finished += l.costParts.finished
    l.incompleteReceipts.forEach((r) => t.incompleteReceipts.add(r))
    // 毛利：營收按「有成本的碼數」比例計入，避免拿全部營收對上部分成本
    if (l.revenueNtd != null && l.yard > 0 && l.costedYard > 0) {
      t.marginRevenueNtd += l.revenueNtd * (l.costedYard / l.yard)
      t.marginCostNtd += l.costNtd
    }
  }
  return t
}

/** 依某個鍵分組加總（產品、客戶、月份） */
export function groupTotals(lines: ShipmentLine[], keyOf: (l: ShipmentLine) => string): Map<string, Totals> {
  const groups = new Map<string, ShipmentLine[]>()
  for (const l of lines) {
    const k = keyOf(l)
    groups.set(k, [...(groups.get(k) ?? []), l])
  }
  return new Map([...groups].map(([k, ls]) => [k, summarize(ls)]))
}

/** 上一期：同長度、緊接在前 */
export function previousPeriod(period: Period): Period {
  const days = period.to.diff(period.from, 'day')
  return { from: period.from.subtract(days, 'day'), to: period.from }
}

export interface StockTotals {
  availableYard: number
  reservedYard: number
  defectYard: number
}

/** 庫存：在庫未鎖住＝可用、被表1 鎖住＝預留中（決策170）、瑕疵／報廢 */
export function stockTotals(labels: FabricLabel[], keep: (l: FabricLabel) => boolean = () => true): StockTotals {
  const t: StockTotals = { availableYard: 0, reservedYard: 0, defectYard: 0 }
  for (const l of labels.filter(keep)) {
    const y = toYard(l.length, l.unit)
    if (l.status === '瑕疵／報廢') t.defectYard += y
    else if (l.status === '在庫') {
      if (l.reservedFor) t.reservedYard += y
      else t.availableYard += y
    }
  }
  return t
}

export interface AbnormalTotals {
  count: number
  abnormalYard: number
  returnYard: number
  deductionNtd: number
  hasDeductionAmount: boolean
}

/** 表9（客訴，不含附單）期間內件數與數量；扣款金額依權限可能看不到 */
export function abnormalTotals(notices: AbnormalNotice[], period: Period): AbnormalTotals {
  const t: AbnormalTotals = { count: 0, abnormalYard: 0, returnYard: 0, deductionNtd: 0, hasDeductionAmount: false }
  for (const n of notices) {
    if (n.kind !== '客訴異常') continue
    const d = dayjs(n.noticeDate)
    if (d.isBefore(period.from) || !d.isBefore(period.to)) continue
    t.count += 1
    t.abnormalYard += n.abnormalQty
    t.returnYard += n.handling.returnGoods?.yard ?? 0
    if (n.handling.deduction?.amount != null) {
      t.deductionNtd += n.handling.deduction.amount
      t.hasDeductionAmount = true
    }
  }
  return t
}

/**
 * 示範數據（只給儀表板看，不寫入任何單據）：原型的示範資料裡已完成的出貨很少，圖表幾乎是空的。
 * 以固定種子產生近 12 個月的出貨明細，數字固定、每次一樣；畫面須明確標示「示範數據」。
 */
export function demoShipmentLines(
  products: { key: string; name: string }[],
  customerIds: string[],
  endMonth: dayjs.Dayjs,
): ShipmentLine[] {
  let seed = 20261102
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed / 2147483648
  }
  const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)]
  const currencies = ['NTD', 'NTD', 'NTD', 'USD', 'USD', 'RMB', 'EUR', 'HKD']
  const fx: Record<string, number> = { NTD: 1, USD: 32, RMB: 4.5, EUR: 34.5, HKD: 4.1 }
  const lines: ShipmentLine[] = []
  if (products.length === 0 || customerIds.length === 0) return lines
  // 產品各自有固定的價位與成本結構，月份間只有小幅波動
  const profile = new Map(products.map((p) => [p.key, { price: 90 + rand() * 140, costRatio: 0.55 + rand() * 0.25, dyed: rand() > 0.35 }]))
  for (let m = 11; m >= 0; m--) {
    const month = endMonth.subtract(m, 'month').startOf('month')
    const count = 6 + Math.floor(rand() * 8)
    for (let i = 0; i < count; i++) {
      const p = pick(products)
      const prof = profile.get(p.key)!
      const yard = Math.round(50 + rand() * 750)
      const priceNtd = prof.price * (0.92 + rand() * 0.16)
      const costPerYard = priceNtd * prof.costRatio
      const currency = pick(currencies)
      const greige = prof.dyed ? costPerYard * 0.6 : 0
      const dye = prof.dyed ? costPerYard * 0.32 : 0
      const secondary = prof.dyed ? costPerYard * 0.08 : 0
      lines.push({
        orderId: `DEMO-${month.format('YYYYMM')}-${i + 1}`,
        shipDate: month.add(Math.floor(rand() * 27), 'day').toISOString(),
        customerId: pick(customerIds),
        productKey: p.key,
        productName: p.name,
        color: '',
        yard,
        // 營收先依幣別換算成 NTD（示範固定匯率），與正式資料同一條算法
        revenueNtd: ((priceNtd / fx[currency]) * yard) * fx[currency],
        currency,
        costedYard: yard,
        costNtd: costPerYard * yard,
        costParts: {
          greige: greige * yard,
          dye: dye * yard,
          secondary: secondary * yard,
          finished: prof.dyed ? 0 : costPerYard * yard,
        },
        incompleteReceipts: [],
      })
    }
  }
  return lines
}

import dayjs from 'dayjs'
import { addWorkdays } from '@/lib/dates'
import { meterToYard } from '@/lib/units'
import type {
  AbnormalNotice,
  DraftApprovalState,
  DyeOrder,
  GoodsReceipt,
  PackingNotice,
  PackingNoticeItem,
  PackingNoticeMarking,
  PackingNoticeTolerance,
  PurchaseOrder,
  PurchaseOrderItem,
  SecondaryProcessingOrder,
  SecondaryProcessingPackaging,
  ShippingOrder,
  ShippingOrderItem,
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
 * 單據鎖定模型（權限規格第七章第 4 節，決策30）。
 *
 * 表1 身上有三種互相獨立的鎖定來源（權限規格列的第四種「爭議中的取代版 PI」鎖在 PI 自己身上，見 isPiOnManualHold）。若各自做成一個布林旗標，解鎖時很容易漏掉其中一個，
 * 故一律收斂為單一的「鎖定清單」：一張單可同時有多個鎖，**全部解除才可編輯**。
 * 日後新增鎖定情境時只是多一筆鎖，不需要改動既有的判斷邏輯。
 */
export interface DocumentLock {
  /** 鎖定來源，直接顯示於畫面（「本單因○○○被鎖定」，而非只是禁用按鈕） */
  source: string
  /** 鎖定時間；推算而來的鎖（如凍結）為該鎖生效的時點 */
  since?: string
  /** 解除條件，一併顯示，讓使用者知道要找誰 */
  release: string
}

/**
 * 表1 的簽核旗標（決策118）。
 *
 * 未記錄者的預設值**依狀態而定**：
 *   已生效／已完成 → 已簽核。既有的生效單不該因為新增欄位而倒退回待簽。
 *   仍是草稿 → 未送簽。**草稿不可能已經簽核過**——簽核的當下就會轉生效。
 *
 * 一律當成「已簽核」曾造成一個死胡同（2026/09/24）：PI 轉來的表1 沒帶這個欄位，
 * 於是畫面顯示已簽核、狀態卻停在草稿，送簽與簽核兩顆按鈕都不出現，這張單再也生效不了。
 */
export function packingNoticeApprovalState(
  notice: Pick<PackingNotice, 'approvalState' | 'status'>,
): NonNullable<PackingNotice['approvalState']> {
  if (notice.approvalState) return notice.approvalState
  return notice.status === '草稿' ? '未送簽' : '已簽核'
}

/** 表4 預期縮率的預設值（%，決策159） */
export const DEFAULT_SHRINKAGE_PCT = 5

/** 表4 明細的預期縮率：未記錄者（舊單）視為預設值 */
export function shrinkagePctOf(item: { expectedShrinkagePct?: number }): number {
  return item.expectedShrinkagePct ?? DEFAULT_SHRINKAGE_PCT
}

/**
 * 依預期縮率推算指染數量：指染數量＝成品數量 ÷（1－預期縮率），取到小數 1 位。
 * 布染完會縮，要交出成品數量，投下去的胚布就得多放縮掉的那一份。
 *
 * 算法與表6 的實際縮率（（投胚量－入庫碼數）÷ 投胚量）一致（決策160）：
 * 用實績平均當預期縮率，推回來的指染數量才會剛好對上。縮率須小於 100%。
 */
export function inDyeQtyFromShrinkage(finishedQty: number, shrinkagePct: number): number {
  if (shrinkagePct >= 100) return finishedQty
  return Math.round((finishedQty / (1 - shrinkagePct / 100)) * 10) / 10
}

/**
 * 預期縮率推薦值（決策160）：同一產品＋同一染整廠的縮率實績平均，小數 1 位。
 * 沒有實績（或看不到「生產績效」欄位群組而讀不到實績）時回傳 undefined，由呼叫端退回預設 5%。
 *
 * **預設 5% 不計入平均**（皇加指定）：5% 只是還沒有任何單據時的起始值，有了實績就只看實績。
 * 第一筆實績進來後，推薦值就是那一筆本身，不會被 5% 往回拉。
 */
export function recommendedShrinkage(
  product: { shrinkageRecords?: { dyeVendorId: string; ratePct: number }[] } | undefined,
  dyeVendorId: string | undefined,
): { pct: number; count: number } | undefined {
  if (!product?.shrinkageRecords || !dyeVendorId) return undefined
  const rates = product.shrinkageRecords.filter((r) => r.dyeVendorId === dyeVendorId).map((r) => r.ratePct)
  if (rates.length === 0) return undefined
  const avg = rates.reduce((sum, r) => sum + r, 0) / rates.length
  return { pct: Math.round(avg * 10) / 10, count: rates.length }
}

/**
 * 表2／表4 的簽核旗標（決策153），推定規則與表1 相同：
 * 未記錄者，草稿視為未送簽、其餘視為已簽核——本機制上線前已送出的單不倒退回待簽核。
 */
export function draftApprovalState(doc: {
  approvalState?: DraftApprovalState
  status: string
}): DraftApprovalState {
  if (doc.approvalState) return doc.approvalState
  return doc.status === '草稿' ? '未送簽' : '已簽核'
}

export function packingNoticeLocks(
  notice: Pick<PackingNotice, 'effectiveAt' | 'status' | 'manualHoldPiId' | 'approvalState' | 'submittedAt'>,
): DocumentLock[] {
  const locks: DocumentLock[] = []

  // ① 待簽核唯讀（決策118）：送簽後草稿轉唯讀，要改得先請管理層退回
  if (notice.status === '草稿' && packingNoticeApprovalState(notice) === '待簽核') {
    locks.push({
      source: '待簽核唯讀——已送簽，等待管理層簽核',
      since: notice.submittedAt,
      release: '管理層簽核通過（轉生效）或退回草稿',
    })
  }

  // ② 人工凍結（Phase 2 決策27、39）：取代版 PI 建立當下偵測到下游已對外發出
  if (notice.manualHoldPiId) {
    locks.push({
      source: `人工凍結——取代版 PI ${notice.manualHoldPiId} 待人工處理`,
      release: '管理層裁決「繼續」或「作廢」後由系統解除',
    })
  }

  // ③ 生效後凍結（主文件決策38）：生效滿 7 個工作天，終態不解除；草稿豁免
  if (notice.status !== '草稿' && isFrozen(notice.effectiveAt)) {
    locks.push({
      source: `生效後凍結——已逾生效後 ${FREEZE_WORKDAYS} 個工作天`,
      since: freezeDate(notice.effectiveAt)?.toISOString(),
      release: '不解除（終態）',
    })
  }

  return locks
}

/**
 * 是否可編輯：以「是否存在未解除的鎖」判斷，不以個別旗標判斷（決策30）。
 * 這樣日後多一種鎖，這裡不用改。
 */
export function isPackingNoticeEditable(
  notice: Pick<PackingNotice, 'effectiveAt' | 'status' | 'manualHoldPiId' | 'approvalState' | 'submittedAt'>,
): boolean {
  return packingNoticeLocks(notice).length === 0
}

/** 不可編輯時的原因；多個鎖一併列出——只講其中一個，使用者解掉還是動不了 */
export function packingNoticeFreezeReason(
  notice: Pick<PackingNotice, 'effectiveAt' | 'status' | 'manualHoldPiId' | 'approvalState' | 'submittedAt'>,
): string | undefined {
  const locks = packingNoticeLocks(notice)
  if (locks.length === 0) return undefined
  return locks.map((l) => l.source).join('；')
}

export function isPurchaseOrderEditable(order: Pick<PurchaseOrder, 'effectiveAt' | 'status'>): boolean {
  if (order.status === '草稿') return true
  return !isFrozen(order.effectiveAt)
}

/**
 * 訂購單送到廠商手上後是否已逾 2 天仍未簽回。
 *
 * 起算點為管理層「簽核並送出」的時間（決策153）——那才是廠商收到單子的時刻。
 * 原本自建單日起算，加了簽核關卡後，表1 生效時自動建立的草稿可能放了幾天才簽核，
 * 一送出就已經「逾期」。撤回後重新簽核即重新送出，故以最新一次簽核為準。
 * 本欄位上線前送出的舊單沒有簽核時間，沿用建單日。
 */
export function isPurchaseOrderOverdue(
  order: Pick<PurchaseOrder, 'status' | 'createdAt' | 'signedAt' | 'approvedAt'>,
): boolean {
  if (order.status !== '待簽回' || order.signedAt) return false
  return dayjs().diff(dayjs(order.approvedAt ?? order.createdAt), 'day') >= PURCHASE_ORDER_OVERDUE_DAYS
}

/**
 * 顯示用的「有效狀態」：逾期未簽回的訂購單，畫面上呈現為已逾期，
 * 但效果等同已確認，不阻擋後續「標記完成」等流程。
 */
export function effectivePurchaseOrderStatus(
  order: Pick<PurchaseOrder, 'status' | 'createdAt' | 'signedAt' | 'approvedAt'>,
): PurchaseOrder['status'] {
  return isPurchaseOrderOverdue(order) ? '已逾期' : order.status
}

/**
 * 訂購單是否已可觸發後續履行流程（建立表4染整單或表6入庫單）：已簽回，或已逾期但效果等同已確認；
 * 「成品」類型另需大貨樣確認通過；三條路徑皆須尚未建立對應的下游單據，避免重複觸發。
 * 觸發後訂購單狀態本身「不會」立即變成已完成——已完成的判定改由下游單據完成時回頭結案
 * （成品/胚布純採購：表6入庫完成；胚布送染整：表4染整單完成），比照PRD「三種完成判定各自獨立」規則。
 */
export function isPurchaseOrderReadyToTriggerFulfillment(
  order: Pick<
    PurchaseOrder,
    'id' | 'status' | 'createdAt' | 'signedAt' | 'approvedAt' | 'type' | 'hasDyeVendor' | 'largeSampleConfirmedAt' | 'parentId'
  >,
  goodsReceipts: Pick<GoodsReceipt, 'parentId' | 'source' | 'relatedDocId'>[],
  dyeOrders: Pick<DyeOrder, 'parentId' | 'purchaseOrderId'>[],
): boolean {
  const effective = effectivePurchaseOrderStatus(order)
  const signedOrOverdue = effective === '已簽回' || effective === '已逾期'
  if (!signedOrOverdue) return false
  if (order.type === '成品' && !order.largeSampleConfirmedAt) return false
  if (order.type === '胚布' && order.hasDyeVendor) return purchaseOrderDyeOrders(order, dyeOrders).length === 0
  return purchaseOrderReceipts(order, goodsReceipts).length === 0
}

/**
 * 這張表2 開出來的表4（決策163）：以表4 記的來源表2 單號對應。
 * 舊資料沒有記單號時才退回「同一張主表1」——那是表2 還不能合併時的對法。
 */
export function purchaseOrderDyeOrders<T extends Pick<DyeOrder, 'parentId' | 'purchaseOrderId'>>(
  order: Pick<PurchaseOrder, 'id' | 'parentId'>,
  dyeOrders: T[],
): T[] {
  return dyeOrders.filter((d) => (d.purchaseOrderId ? d.purchaseOrderId === order.id : d.parentId === order.parentId))
}

/** 這張表2 開出來的表6（決策163）：以入庫單記的關聯單號對應，舊資料才退回主表1＋來源類型 */
export function purchaseOrderReceipts<T extends Pick<GoodsReceipt, 'parentId' | 'source' | 'relatedDocId'>>(
  order: Pick<PurchaseOrder, 'id' | 'parentId' | 'type'>,
  goodsReceipts: T[],
): T[] {
  const source = order.type === '成品' ? '直採大貨-成品' : '直採大貨-胚布'
  return goodsReceipts.filter((r) =>
    r.relatedDocId ? r.relatedDocId === order.id : r.parentId === order.parentId && r.source === source,
  )
}

/** 表2 明細的來源表1（決策163）：舊資料沒記錄者視為單頭的主表1 */
export function purchaseItemNoticeId(
  order: Pick<PurchaseOrder, 'parentId'>,
  item: Pick<PurchaseOrderItem, 'sourceNoticeId'>,
): string {
  return item.sourceNoticeId ?? order.parentId
}

/** 這張表2 關聯的所有表1，主表1 排第一 */
export function purchaseOrderNoticeIds(order: Pick<PurchaseOrder, 'parentId' | 'items'>): string[] {
  return [...new Set([order.parentId, ...order.items.map((i) => purchaseItemNoticeId(order, i))])]
}

/**
 * 入庫單的布卷可以對應哪些表1 明細（決策163）：看關聯的上游單據有哪些明細，不再只看主表1——
 * 合併的表2／表4 一張單裝著好幾張表1 的貨，分批開的則只裝其中幾列。
 * 上游查不到明細來源（舊資料）時，才退回主表1 的全部明細。畫面上挑「這卷是哪一列」與資料層產生條碼共用本函式。
 */
export function receiptNoticeItems(
  receipt: Pick<GoodsReceipt, 'parentId' | 'relatedDocType' | 'relatedDocId'>,
  docs: {
    packingNotices: PackingNotice[]
    purchaseOrders: PurchaseOrder[]
    dyeOrders: Pick<DyeOrder, 'id' | 'items'>[]
    secondaryProcessingOrders: Pick<SecondaryProcessingOrder, 'id' | 'items'>[]
  },
): PackingNoticeItem[] {
  let sourceIds: (string | undefined)[] = []
  if (receipt.relatedDocType === '染單') {
    sourceIds = docs.dyeOrders.find((d) => d.id === receipt.relatedDocId)?.items.map((i) => i.sourceItemId) ?? []
  } else if (receipt.relatedDocType === '二次加工單') {
    sourceIds = docs.secondaryProcessingOrders.find((o) => o.id === receipt.relatedDocId)?.items.map((i) => i.sourceItemId) ?? []
  } else if (receipt.relatedDocType) {
    const po = docs.purchaseOrders.find((p) => p.id === receipt.relatedDocId)
    sourceIds =
      po?.items.map((i) =>
        purchaseOrderItemSourceId(i, docs.packingNotices.find((n) => n.id === purchaseItemNoticeId(po, i))),
      ) ?? []
  }
  const allItems = docs.packingNotices.flatMap((n) => n.items)
  const items = [...new Set(sourceIds.filter((v): v is string => Boolean(v)))]
    .map((itemId) => allItems.find((i) => i.id === itemId))
    .filter((v): v is PackingNoticeItem => Boolean(v))
  if (items.length > 0) return items
  return docs.packingNotices.find((n) => n.id === receipt.parentId)?.items ?? []
}

/**
 * 入庫單關聯的所有表1（決策163）：看它的關聯上游單據——合併的表2／表4 開出的入庫單裝著好幾張表1 的貨，
 * 只看入庫單自己的主表1 會讓其他來源表1 看不到它。查不到上游時只算主表1。
 */
export function receiptNoticeIds(
  receipt: Pick<GoodsReceipt, 'parentId' | 'relatedDocType' | 'relatedDocId'>,
  docs: {
    purchaseOrders: Pick<PurchaseOrder, 'id' | 'parentId' | 'items'>[]
    dyeOrders: Pick<DyeOrder, 'id' | 'parentId' | 'items'>[]
  },
): string[] {
  let upstream: string[] = []
  if (receipt.relatedDocType === '染單') {
    const d = docs.dyeOrders.find((x) => x.id === receipt.relatedDocId)
    upstream = d ? dyeOrderNoticeIds(d) : []
  } else if (receipt.relatedDocType === '成品訂單' || receipt.relatedDocType === '胚布訂單') {
    const p = docs.purchaseOrders.find((x) => x.id === receipt.relatedDocId)
    upstream = p ? purchaseOrderNoticeIds(p) : []
  }
  // 表5 二次加工單一張只對一張表1，即入庫單的主表1
  return [...new Set([receipt.parentId, ...upstream])]
}

/** 表4 明細的來源表1（決策163）：舊資料沒記錄者視為單頭的主表1 */
export function dyeItemNoticeId(order: Pick<DyeOrder, 'parentId'>, item: { sourceNoticeId?: string }): string {
  return item.sourceNoticeId ?? order.parentId
}

/** 這張表4 關聯的所有表1，主表1 排第一 */
export function dyeOrderNoticeIds(order: Pick<DyeOrder, 'parentId' | 'items'>): string[] {
  return [...new Set([order.parentId, ...order.items.map((i) => dyeItemNoticeId(order, i))])]
}

// ---------- 表8 與表1 的對應（決策163：一張表8 可合併多張表1，一張表1 可分多張表8 出） ----------

/** 表8 明細的來源表1：舊資料沒記錄者視為單頭的主表1 */
export function shippingItemNoticeId(
  order: Pick<ShippingOrder, 'parentId'>,
  item: Pick<ShippingOrderItem, 'sourceNoticeId'>,
): string {
  return item.sourceNoticeId ?? order.parentId
}

/** 這張表8 關聯的所有表1，主表1 排第一 */
export function shippingOrderNoticeIds(order: Pick<ShippingOrder, 'parentId' | 'items'>): string[] {
  return [...new Set([order.parentId, ...order.items.map((i) => shippingItemNoticeId(order, i))])]
}

/** 某張表1 在這張表8 上的箱/袋號（索引對應該表1 的嘜頭組別） */
export function shippingBoxNosFor(
  order: Pick<ShippingOrder, 'parentId' | 'markingBoxNos' | 'otherMarkingBoxNos'>,
  noticeId: string,
): string[] | undefined {
  return noticeId === order.parentId ? order.markingBoxNos : order.otherMarkingBoxNos?.[noticeId]
}

/** 某張表1 在這張表8 上的嘜頭（決策164）：表8 改過就用改過的，否則用表1 的 */
export function shippingMarkingsFor(
  order: Pick<ShippingOrder, 'markingOverrides'>,
  noticeId: string,
  noticeMarkings: PackingNoticeMarking[] | undefined,
): PackingNoticeMarking[] {
  return order.markingOverrides?.[noticeId] ?? noticeMarkings ?? []
}

/**
 * 兩組嘜頭內容是否相同（決策164）：文字去頭尾空白、空字串與未填視為相同、不看欄位順序。
 * 表8 用它判斷「是否已改得跟表1 不一樣」——畫面上的提示與資料層要不要留覆寫用同一把尺。
 */
export function sameMarkings(a: PackingNoticeMarking[], b: PackingNoticeMarking[]): boolean {
  const canon = (list: PackingNoticeMarking[]) =>
    JSON.stringify(
      list.map((m) =>
        Object.entries(m)
          .map(([k, v]) => [k, typeof v === 'string' ? v.trim() : v] as const)
          .filter(([, v]) => v !== undefined && v !== '' && v !== false)
          .sort(([x], [y]) => x.localeCompare(y)),
      ),
    )
  return canon(a) === canon(b)
}

/** 收貨地址比對用：去頭尾空白、連續空白視為一個；合併表8 要求地址相同（決策163） */
export function normalizeAddress(address: string | undefined): string {
  return (address ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * 表1 的生產數量容許誤差換成百分比（決策163）：±5% → 5、±10% → 10。
 * 「其他」是文字說明，系統讀不懂，視為 0——須出足下單量，短交由管理層手動結案。
 */
export function tolerancePct(tolerance: PackingNoticeTolerance | undefined): number {
  if (tolerance?.mode === '±5%') return 5
  if (tolerance?.mode === '±10%') return 10
  return 0
}

/**
 * 這一列表8 明細是否在出表1 的這一列。
 * 有來源明細 id 就逐列比對；舊資料沒有時退回「皇加品名＋顏色」，但只限主表1 就是它的表8——
 * 合併單若也用品名比對，兩張表1 的同品名同色會被重複計算。
 */
function shipsNoticeItem(
  order: Pick<ShippingOrder, 'parentId'>,
  line: ShippingOrderItem,
  noticeId: string,
  item: Pick<PackingNoticeItem, 'id' | 'roricaProductName' | 'color'>,
): boolean {
  if (shippingItemNoticeId(order, line) !== noticeId) return false
  if (line.sourceItemId) return line.sourceItemId === item.id
  return order.parentId === noticeId && line.roricaProductName === item.roricaProductName && line.color === item.color
}

type ShippingForCount = Pick<ShippingOrder, 'id' | 'parentId' | 'status' | 'items' | 'sourceAbnormalId'>

/** 表9 的換貨出貨單是補償，不是履約——不計入表1 的出貨量與排程量 */
const fulfilsNotice = (order: ShippingForCount) => !order.sourceAbnormalId

/** 表1 某列明細已出貨的量（Y）：所有「已完成」表8 中出這一列的加總，不論那張表8 的主表1 是誰 */
export function noticeItemShippedYard(
  noticeId: string,
  item: Pick<PackingNoticeItem, 'id' | 'roricaProductName' | 'color'>,
  shippingOrders: ShippingForCount[],
): number {
  return shippingOrders
    .filter((o) => o.status === '已完成' && fulfilsNotice(o))
    .flatMap((o) => o.items.filter((line) => shipsNoticeItem(o, line, noticeId, item)))
    .reduce((sum, line) => sum + line.yard, 0)
}

/** 表1 某列明細已排上表8 的量（Y）：草稿、已建立、已完成都算；可排除正在編輯的那一張 */
export function noticeItemScheduledYard(
  noticeId: string,
  item: Pick<PackingNoticeItem, 'id' | 'roricaProductName' | 'color'>,
  shippingOrders: ShippingForCount[],
  excludeOrderId?: string,
): number {
  return shippingOrders
    .filter((o) => o.id !== excludeOrderId && fulfilsNotice(o))
    .flatMap((o) => o.items.filter((line) => shipsNoticeItem(o, line, noticeId, item)))
    .reduce((sum, line) => sum + line.yard, 0)
}

/**
 * 剩餘未排量（決策163）＝下單量－已排上任何表8 的量（含已出貨）。
 * 新開表8 或加入明細時數量預設帶這個數字，不再帶下單量——否則第二次出貨又會帶滿。
 */
export function noticeItemRemainingYard(
  noticeId: string,
  item: Pick<PackingNoticeItem, 'id' | 'roricaProductName' | 'color' | 'yard'>,
  shippingOrders: ShippingForCount[],
  excludeOrderId?: string,
): number {
  const left = item.yard - noticeItemScheduledYard(noticeId, item, shippingOrders, excludeOrderId)
  return Math.max(0, Number(left.toFixed(2)))
}

/**
 * 表1 某列可排上表8 的上限（Y）：下單量加上容許誤差的上限——
 * 染整入庫常比下單多一點，容許範圍內多出的貨照樣可以出。
 */
export function noticeItemScheduleCap(
  item: Pick<PackingNoticeItem, 'yard'>,
  tolerance: PackingNoticeTolerance | undefined,
): number {
  return Number((item.yard * (1 + tolerancePct(tolerance) / 100)).toFixed(2))
}

/** 表1 某列是否已出貨完成：出貨量達到「下單量－容許誤差下限」即算（決策163） */
export function isNoticeItemFullyShipped(
  noticeId: string,
  item: Pick<PackingNoticeItem, 'id' | 'roricaProductName' | 'color' | 'yard'>,
  tolerance: PackingNoticeTolerance | undefined,
  shippingOrders: ShippingForCount[],
): boolean {
  const floor = item.yard * (1 - tolerancePct(tolerance) / 100)
  return noticeItemShippedYard(noticeId, item, shippingOrders) >= floor - 1e-6
}

/**
 * 表1包裝通知單「已完成」判定：每一列明細都已出貨完成（決策163）。
 *
 * 出貨量逐列加總所有已完成表8 中出這一列的量——表8 可合併多張表1、一張表1 也可分多張表8 出，
 * 故不看表8 的主表1 是誰，只看明細的來源。達到「下單量－容許誤差下限」即算出完：
 * 容許誤差 ±5% 的 1000Y 出了 950Y 就算完成；「其他」須出足，短交由管理層手動結案。
 */
export function isPackingNoticeFullyShipped(
  notice: Pick<PackingNotice, 'id' | 'items' | 'tolerance'>,
  shippingOrders: ShippingForCount[],
): boolean {
  return notice.items.every((item) => isNoticeItemFullyShipped(notice.id, item, notice.tolerance, shippingOrders))
}

/**
 * 彩條顯示文字：最多 3 組客人指定內容，未填即為「空白」。
 * 下游（表2／表4／表5）一律唯讀帶入，顯示格式集中在此，不各自拼字串。
 */
export function colorRatioText(colorRatios: string[] | undefined): string {
  const list = (colorRatios ?? []).map((v) => v.trim()).filter(Boolean)
  if (list.length === 0) return '空白'
  return list.map((v, i) => `客人指定${i + 1}：${v}`).join('／')
}

/**
 * 包裝設定區塊（表5／表8）的彩條摘要：彩條已是明細層級，表頭記不了代表全部的單一值，
 * 故只標明有無指定、細節看明細，避免印出與明細不一致的值。
 */
export function colorRatioSummary(items: { colorRatios?: string[] }[]): string {
  return items.some((i) => (i.colorRatios ?? []).some((v) => v.trim())) ? '逐品項指定（詳見明細）' : '空白'
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
    colorRatioNote: colorRatioSummary(notice.items),
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
 * 是否仍在可受理客訴的期間內。無出貨日期者（如皇加自行發現的異常通知附單）不受此限，
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
/**
 * 一起結案的那一組（決策169）：主單與掛在它底下的所有附單。從附單進來時先找回主單；
 * 皇加自行發現、沒有主單的獨立附單自成一組。
 */
export function abnormalFamily(notice: AbnormalNotice, all: AbnormalNotice[]): AbnormalNotice[] {
  const root = (notice.parentAbnormalId && all.find((n) => n.id === notice.parentAbnormalId)) || notice
  return [root, ...all.filter((n) => n.parentAbnormalId === root.id)]
}

/**
 * 這一張距離可結案還缺什麼（決策169）：已進入處理、已經管理層批准、處理方式都做完、已會計簽核。
 * 已結案者回傳空陣列。會計簽核前的檢查（skipAccounting）不看會計簽核本身。
 */
export function abnormalCloseBlockers(notice: AbnormalNotice, opts: { skipAccounting?: boolean } = {}): string[] {
  if (notice.status === '已完成') return []
  if (notice.status === '受理中') return ['生管尚未按「進入處理」']
  if (!notice.approvedAt) return ['管理層尚未批准']
  const blockers = pendingAbnormalHandlings(notice)
  if (!opts.skipAccounting && !notice.accountingSignedAt) blockers.push('會計尚未簽核')
  return blockers
}

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

/** 小嘜頭上固定會印的產地字樣：不需使用者輸入，列印時自動帶入 */
export const SMALL_MARKING_FIXED_LINE = 'MADE IN TAIWAN'

/**
 * 小嘜頭的內容行：第一行為固定的產地字樣，其餘取自表1 的小嘜頭文字窗格，
 * 逐行原樣列印（空行略過）。列印與畫面顯示共用此函式，兩邊看到的內容才會一致。
 */
export function smallMarkingLines(text: string | undefined): string[] {
  const custom = (text ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  return [SMALL_MARKING_FIXED_LINE, ...custom]
}

/**
 * 表2 明細對應的表1 明細 id（決策148）。
 *
 * 新資料直接讀 sourceItemId；本欄新增前的明細沒有它，但 id 一律是「表2 單號-表1 明細 id」，
 * 故以 id 尾端對回來源。用尾端比對而非字串切割：表2 單號本身也含連字號，切割會切錯位置。
 */
export function purchaseOrderItemSourceId(item: PurchaseOrderItem, notice: PackingNotice | undefined): string | undefined {
  if (item.sourceItemId) return item.sourceItemId
  return notice?.items.find((n) => item.id.endsWith(`-${n.id}`))?.id
}

/**
 * 某張表1 的各筆明細已被哪一張表2 用掉（決策148）：手動開表2 時標記「已轉換訂購單」，
 * 避免同一批布重複下單。同一筆被多張用到時記第一張——提示的目的是「已經有了」，不是列清單。
 */
export function purchaseOrdersBySourceItem(
  notice: PackingNotice | undefined,
  orders: PurchaseOrder[],
): Map<string, { orderId: string; status: PurchaseOrder['status'] }> {
  const used = new Map<string, { orderId: string; status: PurchaseOrder['status'] }>()
  if (!notice) return used
  // 合併單（決策163）的主表1 可能是別張，故逐列看來源，不只看主表1
  orders.forEach((o) => {
    o.items.forEach((item) => {
      if (purchaseItemNoticeId(o, item) !== notice.id) return
      const sourceId = purchaseOrderItemSourceId(item, notice)
      if (sourceId && !used.has(sourceId)) used.set(sourceId, { orderId: o.id, status: o.status })
    })
  })
  return used
}

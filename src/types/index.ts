// ---------- 主檔（Masters） ----------

export interface Customer {
  /**
   * 系統編號（主鍵）：建檔時由系統自動產生（CUST-001…），不開放修改。
   * 所有單據一律以此欄位關聯客戶，故「客戶代碼」改動不會影響既有單據。
   */
  id: string
  /** 客戶代碼：對外使用的代號，由使用者維護，可隨時更新；需全檔唯一但非系統主鍵 */
  code: string
  shortName: string
  fullNameCN: string
  fullNameEN: string
  /** 負責人：與連絡人為兩個不同角色，各自留存聯絡方式 */
  personInCharge: string
  personInChargePhone: string
  /** 連絡人：日常對接窗口，與負責人分開存 */
  contactPerson: string
  contactPersonPhone: string
  address: string
  invoiceAddress: string
  taxId: string
  /** 稅率：如「5%」，客戶主檔編輯視窗欄位 */
  taxRate: string
  paymentTerms: string
  leadTimeDays: number
}

export const PRODUCT_CATEGORIES = [
  { code: '1', zh: '緞布', en: 'Satin' },
  { code: '2', zh: '垂彈緞布／奎特', en: 'Stretch Satin & Crepe' },
  { code: '3', zh: '色紗', en: 'Yarn Dyed' },
  { code: '4', zh: '米卡多／山東綢', en: 'Mikado & Slub' },
  { code: '5', zh: '塔夫塔／裡布', en: 'Taffeta & Lining' },
  { code: '6', zh: '雪紡', en: 'Chiffon' },
  { code: '7', zh: '歐根紗', en: 'Organdy' },
  { code: '8', zh: '菱角網／六角網', en: 'Tulle' },
  { code: '9', zh: '硬網／彈網', en: 'Hard & Stretch Tulle' },
  { code: '10', zh: '變化網', en: 'Design Tulle' },
  { code: '11', zh: '拉西魯', en: 'Raschel' },
] as const

export interface ColorRecord {
  color: string
  dyeVendorId: string
  lastUsedAt: string
  /** 歷史色樣編號：查詢鍵為「客戶＋皇加品名＋顏色＋染整廠」，查得到則開染單時自動帶入 */
  sampleCode: string
}

export interface Product {
  /**
   * 產品編號（主鍵）：建檔時由系統自動產生（PROD-001…），不開放修改。
   * 各單據一律以此欄位關聯商品。
   */
  id: string
  customerId: string
  productName: string
  /** 客戶品名：與皇加品名一對一對應，表1明細輸入皇加品名後由本主檔帶出 */
  customerProductName: string
  /** 胚布編號：表3打色通知單依皇加品名自動帶出，唯讀 */
  greigeFabricCode?: string
  categoryCode: (typeof PRODUCT_CATEGORIES)[number]['code']
  /**
   * 產品序號（產品分支）：唯讀，建檔時由系統自動指派。
   * 同一個皇加品名底下，若規格（幅寬／碼重／胚布規格／成品規格等）有些微不同，
   * 會各自建為一筆商品，以此序號區分是哪一個分支，格式為兩位數流水號（01、02…）。
   */
  sortNo: string
  /** 胚布材質：自由文字（如「100% POLY/METALLIC」「N/T 42/58」），表4明細第二列自動帶入 */
  material: string
  /** 胚布規格：表4明細第二列自動帶入 */
  greigeSpec: string
  /** 成品規格：表4明細第二列自動帶入 */
  finishedSpec: string
  colors: ColorRecord[]
  thicknessMm: number
  characteristics: string
  width: number
  widthTolerancePct: number
  weightGY: number
  /** 碼重容許誤差（%）：來源客戶產品表附帶的 ±5%，與幅寬 ±3% 同層級 */
  weightTolerancePct: number
  /** 米重（G/M）：由碼重自動換算（碼重÷0.9144），唯讀不可手動輸入，隨碼重連動 */
  weightMY: number
  /**
   * 原疋標準尺寸（碼）：接疋判斷基準，數值會大於客戶要求的捲長。
   * 表1可接疋時，系統以此為單位判斷拼接組合是否恰好落在整疋倍數上。
   */
  originalRollStandardYard: number
  /** 進價（採購成本）／售價：以「碼」為計價單位；米價由共用係數 0.9144 換算顯示，不另存欄位 */
  costPrice?: number
  sellPrice?: number
}

/** 廠商類型：同一廠商可能身兼多重角色，故設計為複選 */
export type VendorType = '成品供應商' | '胚布供應商' | '染整廠'

export interface Vendor {
  /**
   * 系統編號（主鍵）：建檔時由系統自動產生（VEND-001…），不開放修改。
   * 所有單據一律以此欄位關聯廠商，故「廠商代碼」改動不會影響既有單據。
   */
  id: string
  /** 廠商代碼：對外使用的代號，由使用者維護，可隨時更新；需全檔唯一但非系統主鍵 */
  code: string
  name: string
  types: VendorType[]
  /** 廠點代號：如「某某染整A」「某某織造B」，染整廠欄位帶入格式為「名稱＋廠點」 */
  siteCode?: string
  /** 公司地址：染單「受託加工廠資訊」自動帶入 */
  address?: string
  /** 發票地址：與公司地址為獨立欄位，開票地址不一定同公司地址 */
  invoiceAddress?: string
  contactPerson: string
  phone: string
  /** 統一編號：指廠商自己的統編（廠商編輯視窗必填欄位） */
  taxId: string
  /** 稅率：如「5%」 */
  taxRate: string
  /** 付款方式／票期：財務對帳關鍵欄位，如「月結45天」 */
  paymentTerms: string
}

export type AccountRole = '生管' | '業務' | '倉管' | '財務' | '管理層' | '管理員'

export interface Account {
  id: string
  code: string
  name: string
  /** 密碼：帳號主檔必填欄位，畫面上一律以遮蔽形式呈現 */
  password: string
  mailbox: string
  phone: string
  roles: AccountRole[]
  status: '啟用' | '停用'
}

/** 欄位層級權限矩陣（示範架構，實際各角色可見欄位仍需與客戶逐一核對確認） */
export type PermissionField = '訂單基本資訊' | '售價' | '進價' | '客戶聯絡資訊' | '帳號管理'
export type PermissionLevel = '可見' | '不可見' | '可見＋可操作'

export const ROLE_PERMISSION_MATRIX: Record<AccountRole, Record<PermissionField, PermissionLevel>> = {
  業務: { 訂單基本資訊: '可見', 售價: '可見', 進價: '不可見', 客戶聯絡資訊: '可見', 帳號管理: '不可見' },
  生管: { 訂單基本資訊: '可見', 售價: '不可見', 進價: '可見', 客戶聯絡資訊: '不可見', 帳號管理: '不可見' },
  倉管: { 訂單基本資訊: '可見', 售價: '不可見', 進價: '不可見', 客戶聯絡資訊: '不可見', 帳號管理: '不可見' },
  財務: { 訂單基本資訊: '可見', 售價: '可見', 進價: '可見', 客戶聯絡資訊: '可見', 帳號管理: '不可見' },
  管理層: { 訂單基本資訊: '可見', 售價: '可見', 進價: '可見', 客戶聯絡資訊: '可見', 帳號管理: '不可見' },
  管理員: { 訂單基本資訊: '可見', 售價: '可見', 進價: '可見', 客戶聯絡資訊: '可見', 帳號管理: '可見＋可操作' },
}

// ---------- 單據 ----------

export type PackingNoticeStatus = '草稿' | '生效' | '已完成'

/** 包裝方式：選擇「定碼ROLL可接疋／不可接疋」時展開「定碼長度」欄位，輸入米數自動換算為碼數 */
export const PACKING_METHODS = ['捲支', '板捲', '定碼ROLL可接疋', '定碼ROLL不可接疋', '原疋捲', '其他'] as const
export const FIXED_ROLL_PACKING_METHODS: (typeof PACKING_METHODS)[number][] = ['定碼ROLL可接疋', '定碼ROLL不可接疋']

/** 加工方法：每個商品明細只對應一種加工方法，單選；未指定加工時留空 */
export const PROCESSING_METHODS = ['上膠', '壓褶', '壓光', '膠印', '噴沖', '柔軟', '手感'] as const

export type ProcessingMethod = (typeof PROCESSING_METHODS)[number]

export interface PackingNoticeItem {
  id: string
  customerProductName: string
  roricaProductName: string
  /**
   * 商品資料主檔的產品編號：指向明細實際選定的產品分支。
   * 同一皇加品名可能有多個規格分支，僅靠品名無法判斷是哪一個，
   * 故下游（表2/表4規格帶入、表7條碼、庫存比對）一律優先以此欄位查主檔。
   * 品名為主檔查無的全新品項時留空，此時退回以品名比對。
   */
  productId?: string
  color: string
  yard: number
  meter: number
  packingMethod: (typeof PACKING_METHODS)[number]
  /** 定碼長度（米）：僅包裝方式為「定碼ROLL可接疋／不可接疋」時輸入，系統自動換算對應碼數 */
  fixedLengthMeter?: number
  /** 加工方法：單選，每個商品只對應一種 */
  processingMethod?: ProcessingMethod
  /** 加工方法說明：如上膠的膠種、壓褶的褶型、手感的軟硬程度等，僅在已指定加工方法時填寫 */
  processingMethodNote?: string
  /** 明細備註：文字輸入 */
  note?: string
}

export const MARKING_SHAPES = ['正三角形', '菱形', 'A5大小'] as const
export const EMBOSSING_OPTIONS = ['布邊', '布頭', '否'] as const
export const SHIP_METHODS = ['海運', '空運', '小三通', '其他'] as const
export const COLOR_RATIO_MODES = ['空白', '客人指定'] as const
export const LABEL_TYPES = ['皇加標籤', '客人指定標籤', '工廠原標籤'] as const
export const PACKAGING_TYPES = ['只貼嘜頭不裝袋', '防水PP袋', '一般PP袋', '可混色裝箱', '不可混色裝箱'] as const
export const TOLERANCE_MODES = ['±5%', '±10%', '其他'] as const

/** 嘜頭：出貨箱嘜頭列印所需資訊 */
export interface PackingNoticeMarking {
  shape: (typeof MARKING_SHAPES)[number]
  destination?: string
  grossWeightKg?: number
  netWeightKg?: number
  composition?: string
  origin?: string
  hasSmallMarking: boolean
  smallMarkingText?: string
}

/** 彩條：空白，或客人指定並附文字說明 */
export interface PackingNoticeColorRatio {
  mode: (typeof COLOR_RATIO_MODES)[number]
  customText?: string
}

/** 生產數量容許誤差：±5%／±10%，或其他並附文字說明 */
export interface PackingNoticeTolerance {
  mode: (typeof TOLERANCE_MODES)[number]
  customText?: string
}

/** 實際入庫數量對照：委外加工送染整路徑，入庫確認時記錄廠商實際交付數量，供與原計畫數量對照參考，不覆蓋原有明細 */
export interface ActualReceiptComparison {
  id: string
  receiptId: string
  recordedAt: string
  actualQty: number
  unit: 'Yard' | 'Meter'
}

export interface PackingNotice {
  id: string
  customerId: string
  customerOrderNo: string
  status: PackingNoticeStatus
  createdAt: string
  effectiveAt?: string
  expectedDeliveryAt: string
  /** 出貨樣數量：半碼一單位，0~5碼滾輪選單 */
  sampleQty: number
  /** 出貨方式：海運/空運/小三通/其他，可複選 */
  shipMethod: (typeof SHIP_METHODS)[number][]
  /** 出貨方式為「其他」時的文字說明 */
  shipMethodNote?: string
  /** 彩條：空白，或客人指定並附文字說明 */
  colorRatio: PackingNoticeColorRatio
  /** 標籤類型：皇加標籤/客人指定標籤/工廠原標籤，多選，預設全選 */
  labelTypes: (typeof LABEL_TYPES)[number][]
  /** 出貨包裝：只貼嘜頭不裝袋/防水PP袋/一般PP袋/可混色裝箱/不可混色裝箱 */
  packagingType: (typeof PACKAGING_TYPES)[number]
  /** 生產數量容許誤差：±5%／±10%，或其他並附文字說明 */
  tolerance: PackingNoticeTolerance
  items: PackingNoticeItem[]
  /** 接疋規則：訂單層級可調整欄位，預設「不可」，依客戶偏好決定 */
  allowSplicing: boolean
  marking: PackingNoticeMarking
  actualReceiptComparisons?: ActualReceiptComparison[]
  /** 燙金：多選（布邊/布頭/否），新增於表2、表4唯讀帶入（帶入時以頓號連接顯示） */
  embossing: (typeof EMBOSSING_OPTIONS)[number][]
  /** 裁邊：是/否 */
  edgeCut: boolean
}

// ---------- 庫存預留（流程一：有現貨與無現貨總覽） ----------

export type StockReservationStatus = '預留中' | '已釋放' | '已轉出貨'

export interface StockReservation {
  id: string
  packingNoticeId: string
  packingNoticeItemId: string
  customerId: string
  productName: string
  color: string
  /** 綁定的實際布卷條碼／批次（可能為接疋拼接組合） */
  rollCodes: string[]
  qty: number
  unit: 'Yard' | 'Meter'
  status: StockReservationStatus
  createdAt: string
  expiresAt: string
  releasedAt?: string
}

/**
 * 接疋拼接組合建議：可用庫存需靠零星捲拼接才能滿足時，系統只「提供建議」不自動預留，
 * 由生管確認採用後才建立庫存預留（PRD 決策1）；若生管改判不接疋，則改以整捲＋裁切出貨。
 */
export type SplicingSuggestionStatus = '待確認' | '已採用' | '已改為整捲裁切'

export interface SplicingSuggestion {
  id: string
  packingNoticeId: string
  packingNoticeItemId: string
  customerId: string
  productName: string
  productId?: string
  color: string
  /** 需求量（碼） */
  requiredQty: number
  /** 建議拼接的捲號組合（最多3捲＝2次接合） */
  rollCodes: string[]
  /** 組合總碼數 */
  totalLength: number
  /** 原疋標準尺寸（碼）：判斷基準，組合總長須為其整數倍 */
  standardSize: number
  status: SplicingSuggestionStatus
  createdAt: string
  decidedAt?: string
}

export type PurchaseOrderStatus = '草稿' | '待簽回' | '已簽回' | '已逾期' | '已完成'
/** 成品：供應商直接出貨成品，完成後直接入庫；胚布：可另勾選是否委外染整，決定完成後走直採大貨或委外加工分支 */
export type PurchaseOrderType = '成品' | '胚布'

/** 明細與表1包裝通知單完全一致，逐列（1:1）帶入，包裝單有幾筆明細訂購單就對應產生幾筆；單價為訂購單專屬可編輯欄位，其餘唯讀 */
export interface PurchaseOrderItem {
  id: string
  customerProductName: string
  roricaProductName: string
  /** 產品編號：唯讀，帶入自包裝單，指向明細選定的產品分支 */
  productId?: string
  color: string
  yard: number
  meter: number
  packingMethod: string
  /** 定碼長度（米）：唯讀，帶入自包裝單；僅包裝方式為「定碼ROLL可接疋／不可接疋」時有值 */
  fixedLengthMeter?: number
  /** 加工方法／說明：唯讀，帶入自包裝單（明細欄位與包裝單完全一致，僅單價為訂購單專屬可編輯欄位） */
  processingMethod?: ProcessingMethod
  processingMethodNote?: string
  unitPrice?: number
  /** 明細備註：唯讀，帶入自包裝單 */
  note?: string
}

export interface PurchaseOrder {
  id: string
  parentId: string
  type: PurchaseOrderType
  /** 是否委外染整：僅「胚布」類型適用；勾選後完成訂購單將觸發表3打色通知單，走委外加工路徑而非直接入庫 */
  hasDyeVendor?: boolean
  /** 賣方：供應商／染整廠，選自廠商資料主檔 */
  vendorId: string
  /**
   * 染整廠：「是否填入染整廠商」開關打開後才有值，格式為「染整廠名稱＋廠點」（由廠商主檔帶出）。
   * 賣方與染整廠可能不是同一家（跟A買胚布、送B染），故獨立於 vendorId 之外。
   */
  dyeVendorId?: string
  status: PurchaseOrderStatus
  createdAt: string
  /** 生效日：草稿送出（轉為待簽回）當下記錄；凍結旗標自此日起算7個工作天 */
  effectiveAt?: string
  /**
   * 胚布到貨確認日：僅「胚布」類型適用，由關聯的表6入庫單結案時回填。
   * 到貨即代表胚布可投入染整，故同時把關聯染單的待染數量轉為指染數量。
   */
  greigeArrivedAt?: string
  signedAt?: string
  dueDate: string
  note: string
  items: PurchaseOrderItem[]
  /** 燙金／彩條：唯讀，數值帶入自表單1包裝通知單 */
  embossing: string
  colorRatioNote: string
  /** 大貨樣確認送樣：僅「成品」類型適用，比照表4送樣退回迴圈，退回不設次數上限 */
  largeSampleConfirmedAt?: string
  largeSampleSubmissions?: LargeSampleSubmission[]
}

export type DyeRequestStatus = '草稿' | '已送出' | '色卡送樣確認' | '已完成'

/**
 * 色號清單單列：染整廠打色完成回覆後，由生管於表3補填顏色與色樣編號（實體追蹤碼，非系統產生）；
 * 需要重新覆色時直接追加一筆並於備註註記原因，不設次數上限。色樣編號通過後回填至染單。
 * 預留色卡貼附空間供列印。
 */
export interface DyeRequestColorEntry {
  id: string
  color: string
  /** 色樣編號：染整廠回覆後手動填入，建單當下通常留空 */
  sampleCode?: string
}

export interface DyeRequest {
  id: string
  parentId: string
  /** 買方：唯讀，固定顯示「皇加」（染整廠視角，皇加為委託打色的買方） */
  buyer: '皇加'
  dyeVendorId: string
  requestDate: string
  productId: string
  /** 胚布編號：唯讀，依皇加品名自動帶出 */
  greigeFabricCode?: string
  colors: DyeRequestColorEntry[]
  /** 色卡送樣確認：完整送樣子流程，退回不設次數上限，選「退回」後該筆鎖定、自動新增下一筆 */
  colorSampleSubmissions?: LargeSampleSubmission[]
  colorSampleConfirmedAt?: string
  /** 備註：自由文字，如「請安排打色，謝謝！色號太久重新覆色」 */
  note?: string
  status: DyeRequestStatus
}

export type DyeOrderStatus = '草稿' | '生效' | '已完成'

/** 大貨樣確認送樣：完整送樣子流程（送樣→待回覆→確認），退回不設次數上限，選「退回」後該筆鎖定不可修改，自動新增下一筆 */
export interface LargeSampleSubmission {
  id: string
  submittedAt: string
  result: '通過' | '退回'
  reason?: string
}

/**
 * 明細單列：逐色/逐批追蹤。三段式庫存追蹤（待染／指染／成品數量）以每列各自累計，
 * 三者合計應等於該列的總投入量。色樣編號在染單結案前皆可修改，非表3回填即鎖定。
 */
export interface DyeOrderItem {
  id: string
  color: string
  /** 色樣編號：可留空（不受表3卡控），查得到歷史色號則自動帶入，結案前皆可修改 */
  sampleCode?: string
  /**
   * 色樣編號來源的表3打色通知單單號（選填）：表3與染單為1:N，外鍵記在染單端。
   * 「已有色號」路徑（沿用歷史色號、不需打色）保持空白，並非每張染單都必須連結表3。
   */
  dyeRequestId?: string
  /**
   * 沿用的歷史色號最後使用日：僅在自動帶入歷史色號時記錄。
   * 超過12個月未使用即屬「重新複色」情境，畫面提醒使用者可沿用舊色號或自行建立表3，非自動開單。
   */
  sampleCodeLastUsedAt?: string
  /** 對色標準：模糊搜尋文字輸入 */
  colorMatchStandard?: string
  /** 單卷碼數：提示性文字用數值，非系統硬性擋單驗證 */
  rollYard?: number
  fabricMaterial?: string
  fabricSpec?: string
  finishedSpec?: string
  /** 加工單價 */
  unitPrice?: number
  pendingDyeQty: number
  inDyeQty: number
  finishedQty: number
}

export interface DyeOrder {
  id: string
  parentId: string
  status: DyeOrderStatus
  /** 交期：可手動修改；有訂購單時預設帶入其交貨日期，「有胚」無訂購單則人工選擇，預設規則同樣14天 */
  dueDate: string
  /** 品名：唯讀，帶入表1包裝通知單「皇加品名」 */
  productName: string
  /** 產品編號：帶入表1明細選定的產品分支，歷史色號查詢與規格帶入皆優先以此解析 */
  productId?: string
  /** 燙金／彩條：唯讀，數值帶入自表單1包裝通知單 */
  embossing: string
  colorRatioNote: string
  vendorId: string
  /** 皇加聯絡窗口：既有欄位，自由文字 */
  internalContact?: string
  /** 備註：自由文字，供記錄染色技法代稱（如「厚染」）等；單卷碼數上限為系統另行計算的提示文字，非存於此欄 */
  note?: string
  items: DyeOrderItem[]
  /** 使用胚布：收布編號 */
  greigeFabricCode?: string
  /** 出貨檢樣，如 0.5Y */
  shippingSampleQty?: number
  unit: 'Yard' | 'Meter'
  effectiveAt?: string
  /**
   * 胚布到貨（可投入染整）日：非染單自身的人工動作，而是由胚布訂單的表6入庫單結案時觸發，
   * 到貨的當下才真正扣帳（待染→指染），非染單一轉生效就視為已投入染整。
   * 染單晚於入庫單建立時，於確認建單（轉生效）當下依關聯胚布訂單的到貨日一併補扣。
   */
  greigeArrivedAt?: string
  largeSampleConfirmedAt?: string
  largeSampleSubmissions?: LargeSampleSubmission[]
  /** 實際入庫數量對照：由表6入庫確認時寫入，與明細的指染／成品計畫數量並列對照，不覆蓋原欄位 */
  actualReceiptComparisons?: ActualReceiptComparison[]
}

export type GoodsReceiptSource = '委外加工' | '直採大貨-成品' | '直採大貨-胚布'

/**
 * 入庫單關聯單據的類型：入庫確認後結案的就是這張單。
 * 委外加工路徑有兩個觸發點，關聯的上游因此可能是染單（染完直接進倉）
 * 或二次加工單（染完還要加工，加工完才進倉），不能只靠 source 反推。
 */
export type GoodsReceiptRelatedDocType = '成品訂單' | '胚布訂單' | '染單' | '二次加工單'
export type GoodsReceiptStatus = '草稿' | '已複核' | '已完成'

export interface GoodsReceiptRoll {
  rollNo: string
  /**
   * 對應的表1包裝通知單明細列 id：決定這一卷入庫後產生的條碼標籤要掛哪個品名／顏色／規格分支。
   * 由 OCR 辨識結果比對或倉管人工指定；未指定時系統依明細順序與數量自動配額。
   */
  sourceItemId?: string
  /** 批號：廠商單據上的批次號（可能兩組代碼並列，如「批3 P017」），OCR 帶入或人工補填 */
  batchCode?: string
  /** 碼數 (Y) */
  length: number
  /** 米數 (M)：不論出貨、入庫或樣品，一律同時記錄Yard與Meter雙單位 */
  meter: number
  weight: number
  ocrConfidence: '高' | '低' | '人工輸入'
  /** 低信心度（手寫）欄位需勾選「已人工複核」才能確認入庫 */
  reviewed?: boolean
}

export const GOODS_RECEIPT_PURPOSES = ['銷貨用', '鍋貨用', '樣品用', '其他'] as const

export interface GoodsReceipt {
  id: string
  parentId: string
  source: GoodsReceiptSource
  /**
   * 關聯單據：建立入庫單的上游單據，依來源類型四選一（成品訂單／胚布訂單／染單／二次加工單）。
   * 以實際單號直接關聯，不再由「主號＋來源類型」反推——同一張表1底下可能有多張染單／二次加工單，
   * 反推會指到錯的那一張，也分不出委外加工路徑的兩個觸發點。
   */
  relatedDocType?: GoodsReceiptRelatedDocType
  relatedDocId?: string
  status: GoodsReceiptStatus
  receiptDate: string
  operatorAccountId: string
  /** 廠商名稱：下拉，選自廠商資料主檔 */
  vendorId?: string
  /** 廠商出貨單號：OCR辨識 */
  vendorShipmentNo?: string
  /** 出貨日期：OCR辨識 */
  vendorShipDate?: string
  /** 原始收據附件：上傳掃描檔供覆核比對，prototype僅記錄檔名 */
  receiptAttachmentName?: string
  rolls: GoodsReceiptRoll[]
  /** 投胚量：委外加工送染整路徑的損耗紀錄基準，優先取 OCR 辨識廠商單據標示值，否則取染單「使用胚布」的待染數量 */
  pledgedQty?: number
  /** 用途：人工選擇的分類欄位，比照舊系統代碼；入倉部門則依倉管人員（operatorAccountId）的角色推導顯示，不另存欄位 */
  purpose?: (typeof GOODS_RECEIPT_PURPOSES)[number]
}

/**
 * 布卷狀態：已建立→已使用（部分出貨，不可逆）→已完成（全部出貨，不可逆）；
 * 「已終止」為分割後的原捲；「瑕疵／報廢」為另一個終態，標記後不可再被任何訂單挑選。
 */
export type FabricLabelStatus = '已建立' | '已使用' | '已完成' | '已終止' | '瑕疵／報廢'

export interface FabricLabelLengthChange {
  at: string
  beforeLength: number
  afterLength: number
  reason: string
}

export interface FabricLabel {
  id: string
  receiptId: string
  rollCode: string
  productName: string
  /** 產品編號：入庫建立條碼時由來源明細帶入，庫存比對優先以此判斷是否為同一規格分支 */
  productId?: string
  /** 成分：如 100% NYLON */
  composition?: string
  color: string
  width: number
  /** 批：批次號，可能為兩組代碼並列，如「批3、P017」 */
  batchCode?: string
  /** 長度（碼），非固定不變，異動時見 lengthHistory；長度雙單位（Yard/Meter）同時列印，Meter由 lib/units 換算顯示 */
  length: number
  unit: 'Yard' | 'Meter'
  status: FabricLabelStatus
  splitFromRollCode?: string
  /** 標記為瑕疵／報廢的時間與原因；標記後該捲不可再被任何訂單挑選 */
  defectedAt?: string
  defectNote?: string
  lengthHistory?: FabricLabelLengthChange[]
}

export type ShippingOrderStatus = '草稿' | '已建立' | '已完成'

export interface ShippingOrderItem {
  /** 客戶品名／皇加品名／色號：明細由包裝通知單直接帶入，可微調 */
  customerProductName?: string
  roricaProductName?: string
  color?: string
  /** 來源表1明細列 id：表1「所有明細皆已出貨」的完成判定以此逐列比對，避免同品名同色互相沖抵 */
  sourceItemId?: string
  /**
   * 布疋條碼編號：一筆明細可對應多個捲號——拼接（接疋）出貨時即為實際使用的捲號組合，
   * 供日後客訴回溯；出貨扣帳時依序扣減這些捲的長度。
   */
  rollCodes: string[]
  /** 不論出貨、入庫或樣品，一律同時記錄Yard與Meter雙單位 */
  yard: number
  meter: number
  /** 售價（/Y）；金額＝售價×Yard數量，自動計算，對照入庫單的「進價」 */
  unitPrice?: number
  /** 明細備註 */
  note?: string
}

/** 簽名欄：處理人／倉管／出貨／業務，比照紙本單據四個簽名欄位 */
export interface ShippingOrderSignatures {
  processedBy?: string
  warehouse?: string
  shipped?: string
  sales?: string
}

export interface ShippingOrder {
  id: string
  parentId: string
  customerId: string
  status: ShippingOrderStatus
  shipDate: string
  isSampleOrder: boolean
  items: ShippingOrderItem[]
  /** 倉管人員：自動帶入登入帳號；出倉部門依此帳號的角色推導顯示，不另存欄位 */
  operatorAccountId?: string
  /** 用途：人工選擇的分類欄位，比照入庫單做法 */
  purpose?: (typeof GOODS_RECEIPT_PURPOSES)[number]
  signatures?: ShippingOrderSignatures
}

// ---------- 表5 二次加工單 ----------

export type SecondaryProcessingStatus = '草稿' | '生效' | '已完成'

export interface SecondaryProcessingItem {
  id: string
  /** 來源表1明細列 id：一張二次加工單只挑出需要加工的品項，非全部帶入 */
  sourceItemId: string
  customerProductName: string
  roricaProductName: string
  /** 產品編號：唯讀，帶入自包裝單，指向明細選定的產品分支 */
  productId?: string
  color: string
  yard: number
  meter: number
  /** 加工方法／說明：唯讀，帶入自表1明細（表1未指定加工方法者不會出現在此單） */
  processingMethod?: ProcessingMethod
  processingMethodNote?: string
  /** 加工單價：二次加工單專屬可編輯欄位，比照表2訂購單的單價 */
  unitPrice?: number
  note?: string
}

/**
 * 包裝設定：唯讀，整組帶入自表1包裝通知單。
 * 加工廠出貨時需依客戶原始包裝要求作業，故不在此單重新設定，避免與表1兩處不一致。
 */
export interface SecondaryProcessingPackaging {
  sampleQty: number
  packagingType: (typeof PACKAGING_TYPES)[number]
  shipMethod: (typeof SHIP_METHODS)[number][]
  shipMethodNote?: string
  colorRatioNote: string
  toleranceNote: string
  labelTypes: (typeof LABEL_TYPES)[number][]
  embossing: string
  edgeCut: boolean
  allowSplicing: boolean
}

export interface SecondaryProcessingOrder {
  id: string
  /** 主號貫穿：`${表1單號}-X{n}` */
  parentId: string
  /**
   * 來源染單單號：由表4大貨樣通過結案時自動建立本單者才有值，供入庫單沿鏈回推
   * （入庫單→二次加工單→染單）；生管人工建單時沒有對應染單，保持空白。
   */
  dyeOrderId?: string
  customerId: string
  status: SecondaryProcessingStatus
  createdAt: string
  effectiveAt?: string
  /** 交期：預設帶入表1出貨日期，可調整 */
  dueDate: string
  /** 加工廠：選自廠商資料主檔，與賣方／受託加工廠共用同一張主檔 */
  vendorId: string
  /** 以下三欄由廠商主檔自動帶入，可就本單覆寫（如指定不同廠點窗口） */
  vendorContactPerson?: string
  vendorPhone?: string
  vendorAddress?: string
  /** 皇加聯絡窗口：自由文字，比照表4 */
  internalContact?: string
  note?: string
  items: SecondaryProcessingItem[]
  packaging: SecondaryProcessingPackaging
}

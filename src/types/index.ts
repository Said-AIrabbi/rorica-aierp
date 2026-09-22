// ---------- 主檔（Masters） ----------

/**
 * 客戶狀態：A～C 為往來等級（由業務依交易量與付款狀況評定），已歇業為終止往來。
 * 已歇業的客戶仍保留主檔與歷史單據——單據上的客戶是既成事實，不可刪除，只改狀態。
 */
export const CUSTOMER_STATUSES = ['A level', 'B level', 'C level', '已歇業'] as const
export type CustomerStatus = (typeof CUSTOMER_STATUSES)[number]

/**
 * 客戶聯絡資訊：一個客戶可以有多組（不同窗口、不同分公司或倉庫收件人）。
 * 陣列第一組為主要聯絡人，單據上帶出的即為這一組；主檔至少要有一組，其餘皆非必填。
 */
export interface CustomerContact {
  /** 聯絡人姓名：每一組的必填欄位，其餘聯絡方式視實際有無填寫 */
  name: string
  email?: string
  /** 市話 */
  phone?: string
  /** 手機 */
  mobile?: string
  /**
   * 收貨地址：該窗口實際收貨的地點（倉庫、分公司、收樣地址），與公司地址／發票地址分開。
   * 同一客戶不同窗口常收在不同地方，故隨聯絡資訊逐組記錄，而非客戶層級單一欄位。
   */
  shippingAddress?: string
  /**
   * 銀行帳戶：該窗口對應的收付款帳戶（銀行／分行／戶名／帳號，自由文字）。
   * 與收貨地址同理逐組記錄——客戶可能依採購單位不同而用不同帳戶結帳。
   */
  bankAccount?: string
}

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
  /**
   * 連絡人：日常對接窗口，與負責人分開存；可有多組，第一組為主要聯絡人。
   * 由表1 建單當下自動建檔的新客戶尚未填寫，故允許為空陣列，待主檔補齊。
   */
  contacts: CustomerContact[]
  address: string
  invoiceAddress: string
  taxId: string
  /**
   * TAX ID（國外稅務統編）：國外客戶的稅務識別號（如 VAT No.、EIN），與台灣統一編號分開存。
   * 兩者格式與用途皆不同，且國外客戶多半沒有台灣統編，合併一欄會無法區分。
   */
  foreignTaxId?: string
  /** 稅率：如「5%」，客戶主檔編輯視窗欄位 */
  taxRate: string
  paymentTerms: string
  leadTimeDays: number
  /** 客戶狀態：A～C 往來等級或已歇業；舊資料未設定者視為 B level */
  status: CustomerStatus
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
  { code: '12', zh: '緹花', en: 'Jacquards' },
  { code: '13', zh: '針織', en: 'Knit' },
  { code: '14', zh: '印花／壓摺', en: 'Printing & Crinkle' },
  { code: '15', zh: '環保系列產品／膚麗娟', en: 'Eco Friendly' },
  { code: '16', zh: '法國蕾絲', en: 'French Lace' },
  { code: '17', zh: '皇加300CM產品', en: 'RORICA 300CM' },
  { code: '18', zh: '繽紛系列', en: 'Fancy Fabric' },
  { code: '19', zh: '材料配件', en: 'Accessories' },
] as const

/**
 * 數位色值：打色完成後登記的電腦色號，供業務／生管在畫面上看到「純白色」實際是哪個白，
 * 並預留給日後串接 3D 服裝設計軟體（CLO3D、Browzwear）與布商的數位材質檔（U3M）。
 *
 * 三組色值各自選填、可只填其一。**LAB 為主值**——它與裝置無關（D65／10° 觀察者），
 * 是分光儀量出來的讀數；HEX 與 CMYK 可由 LAB 換算，也可手動覆寫。
 * 畫面上的色塊只是螢幕示意，一律以實體色卡為準。
 */
export interface DigitalColor {
  lab?: { l: number; a: number; b: number }
  /** 六位十六進位，含 #，大寫（如 #F7F7F2） */
  hex?: string
  /** 0–100 的百分比 */
  cmyk?: { c: number; m: number; y: number; k: number }
  recordedAt?: string
  recordedByAccountId?: string
}

export interface ColorRecord {
  color: string
  dyeVendorId: string
  lastUsedAt: string
  /** 歷史色樣編號：查詢鍵為「客戶＋皇加品名＋顏色＋染整廠」，查得到則開染單時自動帶入 */
  sampleCode: string
  /** 數位色值：由表3 打色通知單登記後帶入；舊色號可能沒有 */
  digital?: DigitalColor
}

export interface Product {
  /**
   * 記錄識別碼：即「產品編號-產品序號」（1-11-01、8-13-02），系統不另設第三組編號。
   * 同一個產品編號可能有多個規格分支（如 N120 的 60" 與 120" 同為 8-13），
   * 單靠產品編號無法指到唯一一筆，故以編號與分支序號合起來作為關聯鍵。
   * 畫面上不單獨呈現此欄，使用者看到的一律是產品編號與產品序號兩欄。
   */
  id: string
  /**
   * 產品編號：皇加既有的編碼方式「**產品類別-流水號**」，如 1-11 ＝ 第一類緞布的第 11 個產品。
   * 建檔時由系統依所選類別自動產生（該類別現有最大流水號加一），不開放修改。
   *
   * 同一皇加品名的多個規格分支**共用同一個產品編號**，以「產品序號（分支）」區分。
   * 既有產品表中有少數品項的類別前綴與所在類別不符（如 20-60 列在第二類），匯入時照原樣保留。
   */
  productCode: string
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
  /** 成分（原稱胚布材質）：自由文字（如「100% POLY/METALLIC」「N/T 42/58」），表4明細第二列自動帶入 */
  material: string
  /** 胚布規格：表4明細第二列自動帶入 */
  greigeSpec: string
  /** 成品規格：表4明細第二列自動帶入 */
  finishedSpec: string
  colors: ColorRecord[]
  thicknessMm: number
  characteristics: string
  width: number
  /**
   * 幅寬原文：產品表上的幅寬多為範圍寫法（58/60"、118/120"），單一數值存不下來。
   * 上方 width 取範圍低標供接疋與規格運算，此欄保留原文供畫面與列印呈現；未提供者為 undefined。
   */
  widthSpec?: string
  /** 幅寬容許誤差（%）：決策97 起與碼重統一為 ±5%（原為 ±3%） */
  widthTolerancePct: number
  weightGY: number
  /** 碼重容許誤差（%）：來源客戶產品表附帶的 ±5%，與幅寬同層級 */
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
  /**
   * 個別排除（權限規格決策32）：角色矩陣之外，管理員可針對單一帳號勾掉特定動作或欄位群組。
   * 最終權限 ＝（該帳號所有角色的聯集）－（本清單）。**只能收緊、不能放寬**——
   * 不可用它給某帳號一個其所有角色都沒有的權限，否則權限來源會分散在兩處、稽核時查不清楚。
   * 型別定義於 @/lib/permissions（AccountExclusions），此處以結構型別避免 types → lib 的反向相依。
   */
  exclusions?: {
    actions?: { doc: string; action: string }[]
    fieldGroups?: string[]
  }
}

/**
 * 欄位層級權限矩陣（**已被取代，僅留作沿革對照**）。
 *
 * 主文件決策116（2026/09/21）：本表原為 5 群 × 5 角色的示範架構，已由
 * 《帳號主檔權限規格》第五章取代——欄位群組擴為 7 群、補列「管理層」角色。
 * 實際判定一律走 `@/lib/permissions` 的 canSeeFieldGroup()，不要再讀本表。
 *
 * @deprecated 改用 `canSeeFieldGroup` from '@/lib/permissions'
 */
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

/**
 * 表1 的簽核旗標（主文件決策118 / 權限規格決策4）。
 *
 * **狀態機不新增狀態**——「草稿→生效→已完成」三態維持不變，簽核以草稿上的這個旗標呈現。
 * 草稿建立時為「未送簽」，業務送簽後轉「待簽核」（草稿轉唯讀），管理層簽核通過即轉「已簽核」
 * 並同時讓 status 變成「生效」；管理層亦可退回，旗標回到「未送簽」、status 仍是草稿。
 */
export type PackingNoticeApprovalState = '未送簽' | '待簽核' | '已簽核'

/**
 * 退回紀錄（權限規格決策37）：表1、表8、表9 三處退回共用同一套規則——
 * 原因必填、每次寫入不覆蓋前次、不設次數上限。反覆退回本身即為異常訊號，
 * 由本清單呈現，不以系統擋單。
 */
export interface DocumentRejection {
  at: string
  /** 退回者的帳號 id */
  byAccountId: string
  reason: string
}

/** 包裝方式：選擇「定碼ROLL可接疋／不可接疋」時展開「定碼長度」欄位，輸入米數自動換算為碼數 */
export const PACKING_METHODS = ['捲支', '板捲', '定碼ROLL可接疋', '定碼ROLL不可接疋', '原疋捲', '其他'] as const
export const FIXED_ROLL_PACKING_METHODS: (typeof PACKING_METHODS)[number][] = ['定碼ROLL可接疋', '定碼ROLL不可接疋']

/** 加工方法：每個商品明細只對應一種加工方法，單選；未指定加工時留空 */
export const PROCESSING_METHODS = ['上膠', '壓褶', '壓光', '膠印', '噴蔥', '柔軟', '手感'] as const

export type ProcessingMethod = (typeof PROCESSING_METHODS)[number]

export interface PackingNoticeItem {
  id: string
  /** 彩條：最多 3 組「客人指定」內容，隨品項新增／刪減；空陣列或未填＝空白 */
  colorRatios?: string[]
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
  /**
   * 來源 PI 明細列 id（Phase 2 決策42）：改版 PI 覆蓋既有表1 時要逐列對位，
   * 靠品名或顏色比對會在同品名多色時對錯列，故明確記錄來源列。
   */
  sourcePiItemId?: string
}

export const MARKING_SHAPES = ['正三角形', '菱形', 'A5大小'] as const
export const EMBOSSING_OPTIONS = ['布邊', '布頭', '否'] as const
export const SHIP_METHODS = ['海運', '空運', '小三通', '其他'] as const
/**
 * 彩條上限：一個品項最多 3 組「客人指定」內容（客人指定1／2／3）。
 * 彩條原為表頭的單選欄位，已改為明細層級——同一張表1 的不同品項（不同顏色／材質）
 * 各自可能有不同的彩條要求，放表頭只能記一組。空陣列／未填即為「空白」。
 */
export const COLOR_RATIO_MAX = 3
export const LABEL_TYPES = ['皇加標籤', '客人指定標籤', '工廠原標籤'] as const
export const PACKAGING_TYPES = ['只貼嘜頭不裝袋', '防水PP袋', '一般PP袋', '可混色裝箱', '不可混色裝箱'] as const
export const TOLERANCE_MODES = ['±5%', '±10%', '其他'] as const

/** 嘜頭：出貨箱嘜頭列印所需資訊 */
export interface PackingNoticeMarking {
  shape: (typeof MARKING_SHAPES)[number]
  /**
   * 抬頭文字：印在嘜頭最顯眼位置的字樣（客戶品牌／代號）。
   * 正三角形與菱形印在形狀「內部」；A5大小沒有形狀，整段印在最上方，故允許多行。
   */
  headerText?: string
  destination?: string
  grossWeightKg?: number
  netWeightKg?: number
  composition?: string
  origin?: string
  hasSmallMarking: boolean
  smallMarkingText?: string
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
  /**
   * 簽核旗標（決策118）。未記錄者（早於本機制的舊資料）視為「已簽核」——
   * 既有的生效單不該因為新增欄位而倒退回待簽核。
   */
  approvalState?: PackingNoticeApprovalState
  /** 建單帳號：職責分離要用（建單者不得自行簽核），故必須記錄 */
  createdByAccountId?: string
  createdAt: string
  /** 業務送簽的時間；退回後再次送簽會覆蓋為最新一次 */
  submittedAt?: string
  /** 管理層簽核通過的時間與帳號 */
  approvedAt?: string
  approvedByAccountId?: string
  /** 歷次退回（決策37）：不覆蓋前次，不設次數上限 */
  rejections?: DocumentRejection[]
  effectiveAt?: string
  expectedDeliveryAt: string
  /** 出貨樣數量：半碼一單位，0~20碼滾輪選單 */
  sampleQty: number
  /** 出貨樣數量說明：數字本身講不清楚的條件（誰的樣、寄哪裡、剪法），非必填 */
  sampleQtyNote?: string
  /** 出貨方式：海運/空運/小三通/其他，可複選 */
  shipMethod: (typeof SHIP_METHODS)[number][]
  /** 出貨方式為「其他」時的文字說明 */
  shipMethodNote?: string
  /** 彩條：空白，或客人指定並附文字說明 */
  /** 標籤類型：皇加標籤/客人指定標籤/工廠原標籤，多選，預設全選 */
  labelTypes: (typeof LABEL_TYPES)[number][]
  /** 出貨包裝：只貼嘜頭不裝袋/防水PP袋/一般PP袋/可混色裝箱/不可混色裝箱 */
  packagingType: (typeof PACKAGING_TYPES)[number]
  /** 生產數量容許誤差：±5%／±10%，或其他並附文字說明 */
  tolerance: PackingNoticeTolerance
  items: PackingNoticeItem[]
  /**
   * 明細數量的輸入單位基準：建單時 Yard／Meter 切換一次即套用到整個明細區塊。
   * 資料一律以 Yard 存放商品總數（meter 為換算值），此欄只記錄「當初是以哪個單位下單」——
   * 沒有這個欄位，存檔後畫面上 Yard 與 Meter 兩欄並列，就看不出哪一個是客戶實際下的數字、
   * 哪一個是系統換算出來的。舊資料未記錄者視為 Yard。
   */
  itemUnit?: 'Yard' | 'Meter'
  /** 接疋規則：訂單層級可調整欄位，預設「不可」，依客戶偏好決定 */
  allowSplicing: boolean
  /**
   * 嘜頭：一張訂單可能同時需要多組嘜頭（不同目的地、不同箱型、或客戶指定的多種標記），
   * 故比照明細改為陣列，至少一組。
   */
  markings: PackingNoticeMarking[]
  actualReceiptComparisons?: ActualReceiptComparison[]
  /**
   * 來源 PI 單號（Phase 2 決策42）：由 PI 轉換建立者記錄來源，供改版覆蓋時回頭對位；
   * 未經 PI、直接開立的表1 留空。
   */
  sourcePiId?: string
  /**
   * 收貨地址（Phase 2 決策40）：自 PI 選定的聯絡窗口帶入，並續帶至表8 出貨單——
   * 三張單據為同一筆地址、只填一次。未經 PI 的表1 留空。
   */
  shippingAddress?: string
  /**
   * 人工凍結來源（Phase 2 決策27、39）：取代版 PI 套用時偵測到下游已對外發出，
   * 該 PI 轉「待人工處理」並凍結它與這張表1，直到管理層裁決為止。
   * 凍結旗標因此有兩種來源——①生效滿 7 個工作天自動；②本欄位有值。
   * 其他單據（表2／表4／表5）不受影響，流程照常進行。
   */
  manualHoldPiId?: string
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
  /**
   * 是否為生管自訂的組合（而非採用系統建議）。
   * 自訂時 rollCodes 與 totalLength 會被改寫為實際採用的那一組，
   * 這個旗標讓畫面與日後回溯看得出「這是人工挑的」。
   */
  customised?: boolean
/** 自訂組合的備註（選填，決策120）：給後手看的提示，如「同批染缸」。決定權在生管，不強制填寫 */
  note?: string
}

export type PurchaseOrderStatus = '草稿' | '待簽回' | '已簽回' | '已逾期' | '已完成'
/** 成品：供應商直接出貨成品，完成後直接入庫；胚布：可另勾選是否委外染整，決定完成後走直採大貨或委外加工分支 */
export type PurchaseOrderType = '成品' | '胚布'

/** 明細與表1包裝通知單完全一致，逐列（1:1）帶入，包裝單有幾筆明細訂購單就對應產生幾筆；單價為訂購單專屬可編輯欄位，其餘唯讀 */
export interface PurchaseOrderItem {
  id: string
  /** 彩條：唯讀，1:1 帶入自包裝單明細（最多 3 組） */
  colorRatios?: string[]
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
   * 到貨即代表胚布可投入染整，故同時把關聯染單的成品數量整批登記為指染數量。
   */
  greigeArrivedAt?: string
  signedAt?: string
  dueDate: string
  note: string
  items: PurchaseOrderItem[]
  /** 燙金：唯讀，數值帶入自表單1包裝通知單（彩條已改為明細逐筆帶入） */
  embossing: string
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
  /** 數位色值（顏色圖示＋電腦色號）：打色完成後登記，結案後仍可補登 */
  digital?: DigitalColor
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
  /**
   * 成品規格：手動輸入。打色是「試出這塊布最後長什麼樣」的過程，實際規格往往到這時才確定，
   * 故在本單登記；待單據結案（已完成）確認無誤後，可由人工套用為商品資料主檔的「成品規格」。
   * 不自動回寫主檔——打色可能退回重打，未確認的規格不應污染主檔。
   */
  finishedSpec?: string
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
 * 明細單列：逐色/逐批追蹤。庫存以每列各自累計（成品數量／指染數量兩段），
 * 三者合計應等於該列的總投入量。色樣編號在染單結案前皆可修改，非表3回填即鎖定。
 */
export interface DyeOrderItem {
  id: string
  /** 彩條：唯讀，帶入自表1 該筆明細（最多 3 組） */
  colorRatios?: string[]
  /**
   * 來源表1 明細的 id：一張表1 的品項可能含多種顏色／材質，需分批開多張表4，
   * 故記住這一列是表1 的哪一筆明細，才能在下一次建單時提示該品項已建單。
   */
  sourceItemId?: string
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
   * 超過12個月未使用即屬「重新覆色」情境，畫面提醒使用者可沿用舊色號或自行建立表3，非自動開單。
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
  /**
   * 成品數量（原稱「待染數量」）：該列應產出的成品數量，建單時即等於來源表1 明細的數量。
   * 此數量代表這張染單要交出來的量，不隨染整進度增減。
   */
  finishedQty: number
  /**
   * 指染數量：目前投入染整中的數量。建單時可手動填寫（胚布已在廠即可投染），
   * 胚布到貨時整批轉入，染單結案（大貨樣通過）時歸零——貨已染完，不再在染整中。
   */
  inDyeQty: number
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
  /** 燙金：唯讀，數值帶入自表單1包裝通知單（彩條已改為明細逐筆帶入） */
  embossing: string
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
   * 到貨的當下才登記為指染中，非染單一轉生效就視為已投入染整。
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
  /** 投胚量：委外加工送染整路徑的損耗紀錄基準，優先取 OCR 辨識廠商單據標示值，否則取染單「使用胚布」的成品數量 */
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
  /**
   * 幅寬原文（決策115）：標籤是給人辨識的實體憑證，須與皇加產品表及客戶手上的規格一致，
   * 故範圍寫法照印（58/60"）。下方 width 為計算基準（範圍低標），僅供接疋與規格運算，不上標籤。
   * 舊資料或主檔未提供原文者留空，此時標籤退回列印 width。
   */
  widthSpec?: string
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
  /** 收貨地址（決策40）：自表1 帶入（表1 再自 PI 帶入），三張單據共用同一筆、只填一次 */
  shippingAddress?: string
  id: string
  parentId: string
  customerId: string
  status: ShippingOrderStatus
  /** 建單帳號：職責分離要用（建單者不得自行按出貨完成） */
  createdByAccountId?: string
  /** 歷次退回（決策37）：僅「已建立」可退回草稿，「已完成」不可退回 */
  rejections?: DocumentRejection[]
  shipDate: string
  isSampleOrder: boolean
  items: ShippingOrderItem[]
  /** 倉管人員：自動帶入登入帳號；出倉部門依此帳號的角色推導顯示，不另存欄位 */
  operatorAccountId?: string
  /** 用途：人工選擇的分類欄位，比照入庫單做法 */
  purpose?: (typeof GOODS_RECEIPT_PURPOSES)[number]
  signatures?: ShippingOrderSignatures
  /**
   * 來源表9異常通知單：換貨不另開「換貨單」，而是「表9（勾選補貨換貨）＋新出貨單」兩個獨立動作，
   * 新出貨單需記錄來源表9單號，供追溯換貨事件的完整脈絡（PRD 決策74）。
   */
  sourceAbnormalId?: string
  /**
   * 箱/袋號：出貨當下人工填寫，僅用於本張出貨單列印嘜頭，不與表1 或其他單據連動。
   * 索引對應來源表1 的嘜頭組別（markings 的第幾組），每組嘜頭各自一個箱/袋號。
   */
  markingBoxNos?: string[]
}

// ---------- 表5 二次加工單 ----------

export type SecondaryProcessingStatus = '草稿' | '生效' | '已完成'

export interface SecondaryProcessingItem {
  id: string
  /** 彩條：唯讀，帶入自表1 該筆明細（最多 3 組） */
  colorRatios?: string[]
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
  sampleQtyNote?: string
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

// ---------- 表9 異常通知單（客訴／退貨，PRD 補充文件 2026/08/31） ----------

/**
 * 異常問題分類：兩階連動——先選大分類，再選其底下的細項（皇加 2026/08/31 提供）。
 * 「其它」無細項、「交期問題」僅一項，故細項一律不可設為必填。
 * 分類與自由文字的「異常問題」併存，非二擇一：分類供統計與向上游歸因，自由文字仍記事件經過。
 */
export const ABNORMAL_CATEGORIES = [
  {
    name: '布面問題',
    items: [
      '色點', '色花', '白斑', '髒污', '油污', '霉斑', '螞蟻斑', '勾紗', '結紗', '裂紗', '滑紗',
      '破洞', '粗細紗', '擦傷', '水傷', '緯檔', '斷經', '折痕', '水波紋', '雞爪痕', '網孔異常',
    ],
  },
  { name: '顏色問題', items: ['色差', '左右異色', '染色不均', '顏色不對'] },
  { name: '手感問題', items: ['太軟', '太硬', '粗糙', '光澤度'] },
  { name: '品質問題', items: ['品質不對', '布面效果不對', '緯斜', '幅寬', '薄厚度', '接疋', '磅重', '異味'] },
  { name: '交期問題', items: ['DELAY'] },
  { name: '其它', items: [] },
] as const

export type AbnormalCategoryName = (typeof ABNORMAL_CATEGORIES)[number]['name']

export type AbnormalNoticeStatus = '受理中' | '處理中' | '已完成'

/**
 * 單據種類：
 * - 客訴異常＝表9本體（對客戶）
 * - 上游追討＝附單（對染整廠／供應商）。啟動點有兩種：客訴後回頭追討（掛在表9底下），
 *   或皇加自行發現問題主動追討（此時沒有客訴、沒有母單），故附單不能只是表9內的欄位區塊。
 *   欄位依客戶指示「暫時與表9相同」，上游廠商記於「扣款不退貨」區塊的「向廠商申請對象」。
 */
export type AbnormalNoticeKind = '客訴異常' | '上游追討'

/** 處理方式：四個區塊各自獨立，可複選（PRD 決策73），未勾選者為 undefined */
export interface AbnormalHandling {
  /** 退貨：依實際碼數，非整捲或整張出貨單 */
  returnGoods?: { yard: number; feeEstimate?: string }
  /** 扣款不退貨：金額依異常程度（非全額），並記錄向哪家廠商申請 */
  deduction?: { amount?: number; upstreamVendorId?: string }
  /** 補貨換貨：不另開換貨單，改以「本單＋新出貨單」兩個獨立動作完成 */
  replacement?: { yard: number; freightEstimate?: string; shippingOrderId?: string }
  /** 其他補償：自由文字，如補空運費用 */
  other?: { note: string }
}

export type ReturnedRollVerdict = '待複核' | '良品' | '瑕疵'

/**
 * 退回布卷：一律先進「退貨暫存倉」（僅倉庫實體分區，非布卷狀態，見 PRD 決策79），
 * 人工複核判定後才決定原條碼復活（良品）或轉為瑕疵／報廢。
 */
export interface ReturnedRoll {
  /** 原布卷條碼；客戶端遺失條碼、無法回溯時留空，複核為良品時改依接續流水號新建條碼 */
  rollCode?: string
  /** 退回碼數 */
  yard: number
  verdict: ReturnedRollVerdict
  reviewedAt?: string
  /** 原條碼遺失且複核為良品時，系統新建的條碼（此時該次退回視為新的入庫事件） */
  newRollCode?: string
  note?: string
}

export interface AbnormalNotice {
  /** AB-YYYYMMDD-NNN（受理日）；附單為母單號＋子序號 -U{n}，自行發現者自產主號後同樣掛 -U1 */
  id: string
  kind: AbnormalNoticeKind
  /** 附單所屬的表9；皇加自行發現而開立的附單沒有母單，此欄留空 */
  parentAbnormalId?: string
  status: AbnormalNoticeStatus
  createdAt: string
  /** 受理日期 */
  noticeDate: string
  /** 製表人：自動帶入登入帳號 */
  createdByAccountId: string
  /**
   * 管理層批准（權限規格第四章第 4 節）：業務建單 → **管理層批准** → 生管收單。
   * 批准前單據停留在「受理中」，不進入處理分流。未記錄者（早於本機制的舊資料）視為已批准。
   */
  approvedAt?: string
  approvedByAccountId?: string
  /**
   * 會計簽核（權限規格決策25）：財務角色的系統動作，**僅記錄簽核帳號與時間**；
   * 表單上的會計簽名欄維持唯讀、列印後手簽。系統簽核推動狀態，紙本簽名留存正本。
   */
  accountingSignedAt?: string
  accountingSignedByAccountId?: string
  /** 歷次退回（權限規格決策37）：管理層於批准階段退回業務補件或更正 */
  rejections?: DocumentRejection[]
  customerId?: string
  /** 生產編號：委外染整情境的追溯鍵，關聯回表4染單 */
  productionCode?: string
  dyeOrderId?: string
  /**
   * 關聯訂購單：純採購（無染整）沒有生產編號，改以表2訂購單為追溯鍵（PRD 決策78）。
   * 與生產編號互斥，由來源出貨單的布卷來源決定帶哪一個，兩者不可皆空。
   */
  purchaseOrderId?: string
  /** 原出貨單（表8）：出貨日期、品名、顏色、出貨數量皆由此唯讀帶入 */
  shippingOrderId?: string
  shipDate?: string
  productName: string
  productId?: string
  color: string
  shippedQty: number
  unit: 'Yard' | 'Meter'
  /** 異常數量：唯一需人工填寫的關聯來源欄位，可小於出貨數量（部分退） */
  abnormalQty: number
  categoryName?: AbnormalCategoryName
  categoryItem?: string
  issueNote: string
  handling: AbnormalHandling
  /** 同批未出貨庫存亦有異常時，連動標記為瑕疵／報廢的條碼 */
  batchDefectRollCodes: string[]
  returnedRolls?: ReturnedRoll[]
  /** 生管回覆：文字欄位；管理層／業務／會計三欄為列印後手簽，系統上不輸入 */
  productionReply?: string
  processedAt?: string
  completedAt?: string
}

// ---------- Phase 2：PI 單（Proforma Invoice） ----------

/**
 * PI 狀態流（Phase 2 規格第三章）：
 * 草稿 → 待批准 →（管理層批准）→ 待簽回 → 已簽回 → 已轉換
 * 例外：報價 14 天到期轉「已逾期」（重新報價可回到待簽回）；建立滿 3 個月未簽回轉換一律「已作廢」。
 * 規則3 的爭議不是一個狀態：取代版一旦偵測到下游已對外發出，就**留在草稿**並掛上
 * manualHandling（見 ProformaInvoice），在管理層裁決前不得送批准／簽回／套用（決策27）。
 * 註：作廢僅存在於 PI（決策38）——表1～表9 只負責執行，不設作廢態。
 */
export const PI_STATUSES = ['草稿', '待批准', '待簽回', '已簽回', '已轉換', '已逾期', '已作廢'] as const
export type ProformaInvoiceStatus = (typeof PI_STATUSES)[number]

/** 幣別：一張 PI 只能有一種（決策14）；商品主檔價格以 NTD 為主，其餘僅作簡易匯率參照（決策41） */
export const PI_CURRENCIES = ['USD', 'RMB', 'NTD'] as const
export type PiCurrency = (typeof PI_CURRENCIES)[number]

/** 貿易條件常用選項（2026/09/17 皇加提供，共 7 項）；選用後可自行修改，另有備註一行 */
export const PI_TRADE_TERMS = ['EXW', 'FOB', 'CFR', 'CIF', 'FCA', 'DOOR TO DOOR', 'EXPRESS COURIER'] as const

/** 起運地：固定選項，以英文顯示（決策17） */
export const PI_PORTS = ['KEELUNG', 'TAIPEI', 'TAICHUNG', 'KAOHSIUNG'] as const

/** 交期天數下拉（2026/09/17 提供，共 4 項）：下定到出貨的期限 */
export const PI_LEAD_TIME_DAYS = [30, 45, 60, 90] as const

export interface ProformaInvoiceItem {
  id: string
  /**
   * PO NO.：即表1 的「客戶訂單號」。一張 PI 可含多個 PO，而拆單以 PO 為界（決策43），
   * 故 PO 記在明細層級，轉換時依此分組成多張表1。
   */
  poNo: string
  roricaProductName: string
  /** 產品編號（決策44）：選定產品分支時記錄，隨轉換帶入表1 明細 */
  productId?: string
  customerProductName: string
  color: string
  /** 數量一律以 Yard 存放，meter 為換算值；itemUnit 記錄當初以哪個單位報價 */
  yard: number
  meter: number
  /** 單價：手動輸入，來源為報價單（報價單本身不納入系統，決策12） */
  unitPrice: number
  packingMethod: (typeof PACKING_METHODS)[number]
  /** 定碼長度（米）：包裝方式為定碼ROLL 時展開，比照表1（決策53） */
  fixedLengthMeter?: number
  /** 彩條：最多 3 組，比照表1 的明細層級設計 */
  colorRatios?: string[]
  note?: string
}

/**
 * 規則3（下游已對外發出）的人工處理紀錄。
 * 掛上且尚未 resolvedAt 者即「待人工處理」——PI 留在草稿動不了、其來源 PI 的表1 一併凍結，
 * 期間一張表1 都不會被改到，也不可再建第三張取代版。
 */
export interface PiManualHandling {
  detectedAt: string
  /** 擋下原因：哪幾張下游單據已經讓外部廠商動起來 */
  blockedBy: string[]
  resolvedAt?: string
  /** 繼續＝依舊 PI 出貨、新 PI 作廢；作廢＝整筆終止（不設第三個出口，決策28） */
  resolution?: '繼續' | '作廢'
}

export interface ProformaInvoice {
  id: string
  /** 前版 PI 單號：取代版（作廢並重開）自動填入；「複製為新 PI」留空（決策24） */
  previousPiId?: string
  /** 被哪一張取代版取代（原單標記用） */
  replacedByPiId?: string
  status: ProformaInvoiceStatus
  createdAt: string
  /** 報價有效期限：建單日 +14 天，逾期價格作廢但單據保留、可複製（決策1） */
  quoteValidUntil: string
  approvedAt?: string
  signedBackAt?: string
  /** 客戶簽回附件：非必填、不作為轉表1 的卡控（決策48）；原型僅記檔名 */
  signedBackFileName?: string
  convertedAt?: string
  voidedAt?: string
  voidReason?: string
  /**
   * 客戶：PI 階段對方可能尚未成為客戶，故允許只有名稱而無主檔 id——
   * 自動建檔留在表1（決策51），轉換時才建立主檔並給編號。
   */
  customerId?: string
  customerName: string
  /** 收貨人：客戶主檔聯絡資訊的第幾組（決策37：只能是該客戶底下的聯絡人） */
  contactIndex?: number
  /** 收貨地址：由選定聯絡窗口帶出，隨轉換帶入表1、表8（決策40） */
  shippingAddress?: string
  currency: PiCurrency
  tradeTerm: string
  tradeTermNote?: string
  portOfLoading: (typeof PI_PORTS)[number]
  destination?: string
  leadTimeDays: (typeof PI_LEAD_TIME_DAYS)[number]
  leadTimeNote?: string
  paymentTerm: string
  paymentTermNote?: string
  /** 估算 CBM：公式待皇加提供，目前不計算（Phase 2 第七章） */
  estimatedCbm?: number
  /** 報價數量的輸入單位基準；轉換後表1 沿用同一基準（決策7） */
  itemUnit: 'Yard' | 'Meter'
  items: ProformaInvoiceItem[]
  /** 嘜頭：PI 可多組，轉換時每張表1 都帶入全部（決策52） */
  markings: PackingNoticeMarking[]
  /** 已轉換產生的表1 單號（一張 PI 可拆多張，決策4） */
  packingNoticeIds: string[]
  manualHandling?: PiManualHandling
}

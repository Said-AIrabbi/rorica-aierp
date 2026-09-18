/**
 * 單據列印共用設定。
 * 公司抬頭資訊為列印版面固定內容（買方＝皇加，見表2「統一編號、抬頭」欄位規則），
 * 集中於此一處維護，日後異動只需改這裡，不需逐張單據修改。
 */
export const PRINT_COMPANY = {
  name: '皇加布業有限公司',
  nameEn: 'RORICA TEXTILE CO., LTD.',
  taxId: '16784675',
  address: '242 新北市新莊區中央路712號2樓',
  phone: '02-2296-8760',
  /** 傳真：皇加確認暫不提供；留空時列印抬頭不印出 FAX 欄位，不留空白佔位 */
  fax: '',
} as const

/** 各單據的列印抬頭：表號與單據名稱一律成對出現，與系統畫面的 formCode 用語一致 */
/**
 * PI 單列印用的皇加收款帳戶（Phase 2 決策35）。
 * 這是「客戶要匯款給皇加」的帳戶，屬公司層級固定資訊——
 * 與客戶主檔聯絡資訊裡的銀行帳戶無關（那是客戶自己的帳戶，供收付時對帳）。
 */
export const PRINT_BANK_ACCOUNT = {
  bankName: '第一商業銀行 新莊分行',
  bankCode: '007-1234',
  swift: 'FCBKTWTP',
  accountName: 'RORICA TEXTILE CO., LTD.',
  accountNo: '123-45-678901',
} as const

export const PRINT_TITLES = {
  proformaInvoice: { formCode: 'PI', title: 'PROFORMA INVOICE 預估發票' },
  packingNotice: { formCode: '表1', title: '包裝通知單' },
  purchaseOrder: { formCode: '表2', title: '訂購單' },
  dyeRequest: { formCode: '表3', title: '打色通知單' },
  dyeOrder: { formCode: '表4', title: '染單－委託加工通知單' },
  secondaryProcessing: { formCode: '表5', title: '二次加工單' },
  goodsReceipt: { formCode: '表6', title: '入庫單' },
  fabricLabel: { formCode: '表7', title: '布疋條碼標籤' },
  shippingOrder: { formCode: '表8', title: '出貨單' },
  shippingSample: { formCode: '表8', title: '樣品單' },
  abnormalNotice: { formCode: '表9', title: '異常通知單' },
  upstreamClaim: { formCode: '表9 附單', title: '上游追討附單' },
  // 嘜頭：貼於出貨紙箱的標記，不套用公司抬頭，故不列於此（版面見 features/packing-notice/MarkingPrint.tsx）
} as const

/** 出貨單／訂購單等紙本單據沿用的簽名欄；表8為四欄（處理人／倉管／出貨／業務） */
export const SHIPPING_SIGNATURE_LABELS = ['處理人', '倉管', '出貨', '業務'] as const

/** PI 單簽名欄：皇加承辦、管理層批准（決策3、47）、客戶回簽（決策48：回簽即代表接受） */
export const PI_SIGNATURE_LABELS = ['皇加承辦', '管理層批准', '客戶簽回（簽名／蓋章）'] as const

/** 對外單據（送廠商簽回）的簽名欄：皇加承辦與廠商簽回各一 */
export const VENDOR_SIGNATURE_LABELS = ['皇加承辦', '皇加主管', '廠商簽回（簽名／蓋章）'] as const

/**
 * 表9 異常通知單／其附單的簽核欄：四欄比照紙本。
 * 核決者的稱呼全系統統一為「管理層」（2026/09/18；原紙本寫「主管」、口語稱董事長，皆指帳號主檔既有的管理層角色）。
 * 三個簽名欄實際為列印後手簽，系統上不輸入（生管回覆例外，為系統文字欄位）。
 */
export const ABNORMAL_SIGNATURE_LABELS = ['生管回覆', '管理層簽名', '業務簽名', '會計簽名'] as const

/** 空值於紙本一律印為底線留白，避免印出「-」讓廠商誤以為是資料 */
export function printValue(value: string | number | undefined | null, blank = ' '): string {
  if (value === undefined || value === null || value === '') return blank
  return String(value)
}

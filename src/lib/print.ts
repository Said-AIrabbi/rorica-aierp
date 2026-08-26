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
  phone: '02-8995-6568',
  /** 傳真：皇加確認暫不提供；留空時列印抬頭不印出 FAX 欄位，不留空白佔位 */
  fax: '',
} as const

/** 各單據的列印抬頭：表號與單據名稱一律成對出現，與系統畫面的 formCode 用語一致 */
export const PRINT_TITLES = {
  packingNotice: { formCode: '表1', title: '包裝通知單' },
  purchaseOrder: { formCode: '表2', title: '訂購單' },
  dyeRequest: { formCode: '表3', title: '打色通知單' },
  dyeOrder: { formCode: '表4', title: '染單－委託加工通知單' },
  secondaryProcessing: { formCode: '表5', title: '二次加工單' },
  goodsReceipt: { formCode: '表6', title: '入庫單' },
  fabricLabel: { formCode: '表7', title: '布疋條碼標籤' },
  shippingOrder: { formCode: '表8', title: '出貨單' },
  shippingSample: { formCode: '表8', title: '樣品單' },
  // 表1嘜頭：客戶尚未提供實際版面格式，待提供後再建立對應列印版面
} as const

/** 出貨單／訂購單等紙本單據沿用的簽名欄；表8為四欄（處理人／倉管／出貨／業務） */
export const SHIPPING_SIGNATURE_LABELS = ['處理人', '倉管', '出貨', '業務'] as const

/** 對外單據（送廠商簽回）的簽名欄：皇加承辦與廠商簽回各一 */
export const VENDOR_SIGNATURE_LABELS = ['皇加承辦', '皇加主管', '廠商簽回（簽名／蓋章）'] as const

/** 空值於紙本一律印為底線留白，避免印出「-」讓廠商誤以為是資料 */
export function printValue(value: string | number | undefined | null, blank = ' '): string {
  if (value === undefined || value === null || value === '') return blank
  return String(value)
}

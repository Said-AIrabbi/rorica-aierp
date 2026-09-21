import {
  abnormalNotices,
  accounts,
  customers,
  dyeOrders,
  dyeRequests,
  fabricLabels,
  goodsReceipts,
  packingNotices,
  products,
  proformaInvoices,
  purchaseOrders,
  secondaryProcessingOrders,
  shippingOrders,
  splicingSuggestions,
  stockReservations,
  vendors,
} from './data'
import { applyFieldVisibility } from './field-visibility'
import { getCurrentAccount } from './session'
import { canViewDoc, canViewMaster, type DocKey, type MasterKey } from '@/lib/permissions'

/** Prototype 用的假網路延遲，模擬真實 API 呼叫的等待感 */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

/**
 * 讀取端的權限把關（權限規格第七章第 2 節：可見性的判定一律在後端進行）。
 *
 * 兩層一起套：
 *   ① 功能權限——沒有檢視權的單據一律回空陣列，該帳號的介面上等於不存在
 *   ② 欄位可見性——看得到的單據，再把該角色不可見的欄位整個拿掉（不是遮起來）
 *
 * 側欄已經先隱藏了入口，這裡是「直接打網址進來」時的第二道。
 */
function readDoc<T extends object>(key: string, doc: DocKey, rows: T[]): Promise<T[]> {
  if (!canViewDoc(getCurrentAccount(), doc)) return delay([])
  return delay(applyFieldVisibility(key, rows))
}

function readMaster<T extends object>(key: string, master: MasterKey, rows: T[]): Promise<T[]> {
  if (!canViewMaster(getCurrentAccount(), master)) return delay([])
  return delay(applyFieldVisibility(key, rows))
}

export const api = {
  proformaInvoices: () => readDoc('proformaInvoices', 'PI', proformaInvoices),
  packingNotices: () => readDoc('packingNotices', '表1', packingNotices),
  purchaseOrders: () => readDoc('purchaseOrders', '表2', purchaseOrders),
  secondaryProcessingOrders: () => readDoc('secondaryProcessingOrders', '表5', secondaryProcessingOrders),
  dyeRequests: () => readDoc('dyeRequests', '表3', dyeRequests),
  dyeOrders: () => readDoc('dyeOrders', '表4', dyeOrders),
  goodsReceipts: () => readDoc('goodsReceipts', '表6', goodsReceipts),
  fabricLabels: () => readDoc('fabricLabels', '表7', fabricLabels),
  shippingOrders: () => readDoc('shippingOrders', '表8', shippingOrders),
  abnormalNotices: () => readDoc('abnormalNotices', '表9', abnormalNotices),
  customers: () => readMaster('customers', '客戶', customers),
  products: () => readMaster('products', '商品', products),
  vendors: () => readMaster('vendors', '廠商', vendors),
  accounts: () => readMaster('accounts', '帳號', accounts),
  /**
   * 庫存預留與拼接建議附屬於表1／布卷，沒有自己的權限列；
   * 跟著表1 的檢視權走——看不到表1 的角色也不需要看到它鎖了哪幾捲。
   */
  stockReservations: () => readDoc('stockReservations', '表1', stockReservations),
  splicingSuggestions: () => readDoc('splicingSuggestions', '表1', splicingSuggestions),
}

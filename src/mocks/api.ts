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
  purchaseOrders,
  secondaryProcessingOrders,
  shippingOrders,
  splicingSuggestions,
  stockReservations,
  vendors,
} from './data'

/** Prototype 用的假網路延遲，模擬真實 API 呼叫的等待感 */
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

export const api = {
  packingNotices: () => delay(packingNotices),
  purchaseOrders: () => delay(purchaseOrders),
  secondaryProcessingOrders: () => delay(secondaryProcessingOrders),
  dyeRequests: () => delay(dyeRequests),
  dyeOrders: () => delay(dyeOrders),
  goodsReceipts: () => delay(goodsReceipts),
  fabricLabels: () => delay(fabricLabels),
  shippingOrders: () => delay(shippingOrders),
  abnormalNotices: () => delay(abnormalNotices),
  stockReservations: () => delay(stockReservations),
  splicingSuggestions: () => delay(splicingSuggestions),
  customers: () => delay(customers),
  products: () => delay(products),
  vendors: () => delay(vendors),
  accounts: () => delay(accounts),
}

import { canSeeFieldGroup, type FieldGroup } from '@/lib/permissions'
import { getCurrentAccount } from './session'

/**
 * 欄位層級可見性的實作（權限規格第五章、第七章第 2 節）。
 *
 * 規格要的是「**不可見的欄位不輸出到前端**」，而不是前端拿到之後再遮起來——
 * 前端的隱藏只是呈現，不作為安全邊界。原型的 mocks/api.ts 扮演後端的讀取端，
 * 故過濾就做在這裡：每個角色拿到的物件，看不到的欄位根本不存在。
 *
 * 連帶的兩個效果，都是規格要的：
 *   ① 列印也跟著留白——列印即該角色所見，不另設固定版面（決策29）
 *   ② 前端不需要到處寫遮罩；既有的「值為 undefined 就顯示 -」照舊運作（決策16：留白而非顯示 0）
 *
 * **不遮 id 與關聯鍵**：遮掉單號會讓畫面連結斷掉，那不是權限問題而是壞掉。
 * 權限只管金額與績效這類內容欄位。
 */

/** 每張單上「哪個欄位屬於哪一群」。未列出的欄位＝訂單基本資訊，一律可見。 */
type FieldMap = Partial<Record<FieldGroup, string[]>>

/** 明細列的欄位對照（items / rolls 之類的子陣列） */
interface Spec {
  own?: FieldMap
  items?: { key: string; map: FieldMap }[]
}

const SPECS: Record<string, Spec> = {
  // 表2 訂購單：對廠商的採購成本
  purchaseOrders: {
    items: [{ key: 'items', map: { 進價: ['unitPrice'] } }],
  },
  // 表4 染單：加工單價屬「加工與委外費用」，既非售價也非採購進價
  dyeOrders: {
    items: [{ key: 'items', map: { 加工與委外費用: ['processingUnitPrice', 'unitPrice'] } }],
  },
  // 表5 二次加工單：加工費同上
  secondaryProcessingOrders: {
    own: { 加工與委外費用: ['processingFee'] },
    items: [{ key: 'items', map: { 加工與委外費用: ['processingFee', 'unitPrice'] } }],
  },
  // 表6 入庫單：進價；縮率與損耗屬「生產績效」
  goodsReceipts: {
    own: { 生產績效: ['shrinkageRate', 'lossQty'] },
    items: [{ key: 'rolls', map: { 進價: ['unitPrice', 'purchasePrice'] } }],
  },
  // 表8 出貨單：對客戶的售價與金額
  shippingOrders: {
    items: [{ key: 'items', map: { 售價: ['unitPrice', 'amount'] } }],
  },
  // 表9 異常通知單：對客戶的退款／扣款屬售價群，向染整廠追討的索賠屬加工與委外費用
  abnormalNotices: {
    own: { 售價: ['refundAmount', 'deductionAmount'], 加工與委外費用: ['claimAmount'] },
  },
  // PI 單價歸「售價」群（權限規格第五章）
  proformaInvoices: {
    items: [{ key: 'items', map: { 售價: ['unitPrice'] } }],
  },
  // 商品主檔：進價與售價分屬兩群
  products: {
    own: { 進價: ['purchasePrice'], 售價: ['sellPrice'] },
  },
  // 客戶主檔的聯絡資訊（含 TAX ID 與銀行帳戶）
  customers: {
    own: { 客戶聯絡資訊: ['taxId', 'bankAccount', 'personInChargePhone'] },
    items: [{ key: 'contacts', map: { 客戶聯絡資訊: ['email', 'phone', 'mobile', 'address', 'bankAccount'] } }],
  },
}

function stripFields<T extends object>(row: T, map: FieldMap, visible: (g: FieldGroup) => boolean): T {
  let out: T | undefined
  for (const [group, fields] of Object.entries(map) as [FieldGroup, string[]][]) {
    if (visible(group)) continue
    for (const field of fields) {
      if (!(field in row)) continue
      out = out ?? { ...row }
      delete (out as Record<string, unknown>)[field]
    }
  }
  return out ?? row
}

/**
 * 依目前登入帳號過濾一份清單。沒有任何欄位要拿掉時回傳原陣列（不製造多餘的新物件，
 * 讓 react-query 的參照比較仍然有效）。
 */
export function applyFieldVisibility<T extends object>(key: string, rows: T[]): T[] {
  const spec = SPECS[key]
  if (!spec) return rows
  const account = getCurrentAccount()
  const visible = (g: FieldGroup) => canSeeFieldGroup(account, g)

  // 先算一次這張單有沒有任何一群是看不到的，全看得到就整包原樣回傳
  const groups = new Set<FieldGroup>()
  Object.keys(spec.own ?? {}).forEach((g) => groups.add(g as FieldGroup))
  spec.items?.forEach((entry) => Object.keys(entry.map).forEach((g) => groups.add(g as FieldGroup)))
  if ([...groups].every(visible)) return rows

  return rows.map((row) => {
    let next = spec.own ? stripFields(row, spec.own, visible) : row
    spec.items?.forEach((entry) => {
      const list = (next as Record<string, unknown>)[entry.key]
      if (!Array.isArray(list)) return
      const stripped = list.map((child: object) => stripFields(child, entry.map, visible))
      // 逐列都沒變就不換陣列，避免無謂的重繪
      if (stripped.some((child, i) => child !== list[i])) {
        next = { ...next, [entry.key]: stripped }
      }
    })
    return next
  })
}

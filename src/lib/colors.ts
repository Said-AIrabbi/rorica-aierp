import { isColorStale, COLOR_STALE_MONTHS } from '@/lib/dates'
import type { Product } from '@/types'

/**
 * 歷史色號查詢結果（供表1、表2 在開染單之前就先提醒使用者）。
 *
 * 查詢鍵為「客戶＋皇加品名（產品分支）＋顏色＋染整廠」四者。表1 建單當下**還沒有染整廠**
 * （染整廠要到表2 訂購單勾選委外染整時才指定），所以此時只能以前三鍵查詢，
 * 得到的是「有哪些染整廠做過這個顏色」，而非最終結論——故多一種「視染整廠而定」的結果，
 * 不謊稱查得到，也不謊稱一定要打色。表2 指定染整廠後才會有確定答案。
 */
export type ColorLookupKind = '已有色號' | '疑似複色' | '全新配色' | '視染整廠而定'

export interface ColorLookupResult {
  kind: ColorLookupKind
  /** 沿用的色樣編號（查得到時） */
  sampleCode?: string
  lastUsedAt?: string
  /** 曾做過這個顏色的染整廠 id（尚未指定染整廠時，供判斷選哪一家可沿用色號） */
  knownVendorIds: string[]
  /** 一句話說明，直接顯示在欄位旁；文字已含「會不會開表3」的結論 */
  message: string
}

/**
 * 由單據明細解析商品主檔：優先用產品編號（精準指到規格分支），
 * 查無才以「皇加品名＋客戶」比對——歷史色號的查詢鍵包含客戶，
 * 不可只用品名撈到別家客戶的同名商品。
 */
export function resolveProductForColorLookup(
  products: Product[],
  customerId: string | undefined,
  productId: string | undefined,
  productName: string | undefined,
): Product | undefined {
  if (productId) {
    const byId = products.find((p) => p.id === productId)
    if (byId) return byId
  }
  if (!productName?.trim()) return undefined
  const name = productName.trim()
  return products.find((p) => p.productName === name && (!customerId || p.customerId === customerId))
}

/**
 * 查詢某一筆明細的色號狀態。
 * 資訊不足（尚未填品名或顏色、或品名不在商品主檔）時回傳 null，由呼叫端不顯示標籤——
 * 此時給任何結論都是猜的。
 */
export function lookupColorSample(params: {
  products: Product[]
  customerId?: string
  productId?: string
  productName?: string
  color?: string
  /** 染整廠：表2 指定後才有值；未指定時只做前三鍵查詢 */
  dyeVendorId?: string
  /** 染整廠顯示名稱（vendorDisplayName 的結果），用於組出說明文字 */
  vendorNameOf?: (vendorId: string) => string
}): ColorLookupResult | null {
  const { products, customerId, productId, productName, color, dyeVendorId } = params
  if (!color?.trim()) return null
  const product = resolveProductForColorLookup(products, customerId, productId, productName)
  if (!product) return null

  const nameOf = params.vendorNameOf ?? ((id: string) => id)
  const records = product.colors.filter((c) => c.color === color.trim())

  if (dyeVendorId) {
    const matched = records.find((c) => c.dyeVendorId === dyeVendorId)
    if (!matched) {
      return {
        kind: '全新配色',
        knownVendorIds: records.map((c) => c.dyeVendorId),
        message:
          records.length > 0
            ? `${nameOf(dyeVendorId)} 沒有做過此配色（色號非通用碼，換廠即視為無色號；做過的有 ${records
                .map((c) => nameOf(c.dyeVendorId))
                .join('、')}）。開染單時系統將自動開立表3 委託打色。`
            : '此客戶＋品名＋顏色查無任何歷史色號。開染單時系統將自動開立表3 委託打色。',
      }
    }
    if (isColorStale(matched.lastUsedAt)) {
      return {
        kind: '疑似複色',
        sampleCode: matched.sampleCode,
        lastUsedAt: matched.lastUsedAt,
        knownVendorIds: records.map((c) => c.dyeVendorId),
        message: `色號 ${matched.sampleCode} 查得到，但已逾 ${COLOR_STALE_MONTHS} 個月未使用。系統會沿用舊色號、不自動開表3；如需重新複色請於染單自行建立。`,
      }
    }
    return {
      kind: '已有色號',
      sampleCode: matched.sampleCode,
      lastUsedAt: matched.lastUsedAt,
      knownVendorIds: records.map((c) => c.dyeVendorId),
      message: `可沿用色號 ${matched.sampleCode}，開染單時自動帶入，不需要表3。`,
    }
  }

  // 尚未指定染整廠（表1 階段）
  if (records.length === 0) {
    return {
      kind: '全新配色',
      knownVendorIds: [],
      message: '此客戶＋品名＋顏色查無任何歷史色號，不論送哪一家染整廠都需要打色，屆時系統會自動開立表3。',
    }
  }
  const fresh = records.filter((c) => !isColorStale(c.lastUsedAt))
  if (fresh.length === 0) {
    return {
      kind: '疑似複色',
      knownVendorIds: records.map((c) => c.dyeVendorId),
      message: `${records.map((c) => nameOf(c.dyeVendorId)).join('、')} 做過此配色，但都已逾 ${COLOR_STALE_MONTHS} 個月未使用；送這幾家會沿用舊色號（可自行決定是否重新複色），送其他家則需要打色。`,
    }
  }
  return {
    kind: '視染整廠而定',
    knownVendorIds: records.map((c) => c.dyeVendorId),
    message: `${fresh.map((c) => nameOf(c.dyeVendorId)).join('、')} 做過此配色可沿用色號；表2 若指定其他染整廠，換廠即視為無色號，屆時會自動開立表3。`,
  }
}

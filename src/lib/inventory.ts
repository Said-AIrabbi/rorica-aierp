import dayjs, { type Dayjs } from 'dayjs'
import type { FabricLabel, StockReservation } from '@/types'

/** 庫存預留時效：逾期自動釋放 */
export const STOCK_RESERVATION_DAYS = 14

/** 接疋判斷基準：零星捲加總需等於原疋標準尺寸整數倍，最多幾捲（幾次接合） */
export const MAX_SPLICING_ROLLS = 3

export function reservationExpiresAt(createdAt: string | Date | Dayjs) {
  return dayjs(createdAt).add(STOCK_RESERVATION_DAYS, 'day')
}

/** 庫存預留是否已逾 14 天效期未出貨 */
export function isReservationExpired(reservation: Pick<StockReservation, 'status' | 'expiresAt'>): boolean {
  if (reservation.status !== '預留中') return false
  return dayjs().isAfter(dayjs(reservation.expiresAt))
}

/** 顯示用「有效狀態」：逾期未出貨的預留，畫面上呈現為已釋放（時效到自動釋放，不允許人工強制超賣覆蓋） */
export function effectiveReservationStatus(reservation: Pick<StockReservation, 'status' | 'expiresAt'>): StockReservation['status'] {
  return isReservationExpired(reservation) ? '已釋放' : reservation.status
}

/** 該布卷條碼目前是否已被有效（未釋放、未逾期）的預留占用 */
export function isRollReserved(rollCode: string, reservations: StockReservation[]): boolean {
  return reservations.some((r) => r.rollCodes.includes(rollCode) && effectiveReservationStatus(r) === '預留中')
}

/** 可用庫存＝實際庫存（已建立、未使用）－已預留未出貨的布卷 */
/**
 * 可用庫存布卷：需求端帶有產品編號時，只比對同一個產品分支的布卷
 * （同品名不同規格分支不可互相沖抵）；未帶產品編號（全新品項或舊資料）才退回以品名比對。
 */
export function availableFabricLabels(
  productName: string,
  color: string,
  labels: FabricLabel[],
  reservations: StockReservation[],
  productId?: string,
): FabricLabel[] {
  return labels.filter((l) => {
    const sameProduct = productId && l.productId ? l.productId === productId : l.productName === productName
    return sameProduct && l.color === color && l.status === '已建立' && !isRollReserved(l.rollCode, reservations)
  })
}

export function availableQuantity(
  productName: string,
  color: string,
  labels: FabricLabel[],
  reservations: StockReservation[],
): number {
  return availableFabricLabels(productName, color, labels, reservations).reduce((sum, l) => sum + l.length, 0)
}

export interface SplicingCombination {
  rolls: FabricLabel[]
  totalLength: number
}

/**
 * 接疋拼接組合建議：判斷基準為零星捲加總「等於原疋標準尺寸的整數倍」，最多 3 捲（2 次接合），
 * 因為湊出剛好整疋，天生無耗損。湊不出整數倍時回傳 null——依 PRD 決策5，此時不接疋，
 * 改為整捲＋裁切分開出貨（見 allocateWholeRolls），裁剩的零碼布留庫存等待下次湊單。
 * 本函式僅提供「建議」，是否採用由人工最終確認（PRD 決策1），不直接建立庫存預留。
 */
export function suggestSplicingCombination(
  requiredQty: number,
  availableRolls: FabricLabel[],
  standardSize: number,
): SplicingCombination | null {
  if (!(standardSize > 0)) return null
  const sorted = [...availableRolls].sort((a, b) => a.length - b.length)
  let best: SplicingCombination | null = null

  function combinations(start: number, chosen: FabricLabel[]) {
    if (chosen.length > 0) {
      const totalLength = Number(chosen.reduce((sum, r) => sum + r.length, 0).toFixed(2))
      // 需同時滿足：足夠出貨、且剛好落在原疋標準尺寸的整數倍上（無耗損）
      if (totalLength >= requiredQty && isMultipleOf(totalLength, standardSize)) {
        if (!best || totalLength < best.totalLength) best = { rolls: [...chosen], totalLength }
      }
    }
    if (chosen.length >= MAX_SPLICING_ROLLS) return
    for (let i = start; i < sorted.length; i += 1) {
      chosen.push(sorted[i])
      combinations(i + 1, chosen)
      chosen.pop()
    }
  }

  combinations(0, [])
  return best
}

/** 浮點長度的整數倍判斷：容許 0.01 碼的誤差，避免 50.0 + 50.0 !== 100 這類浮點誤差誤判 */
function isMultipleOf(total: number, unit: number): boolean {
  const ratio = total / unit
  return Math.abs(ratio - Math.round(ratio)) < 0.0001 && Math.round(ratio) >= 1
}

/**
 * 不接疋時的整捲配貨：可用庫存（實際庫存－已預留未出貨）是以加總計算的，
 * 故只要總量足夠即可出貨——取整捲直到覆蓋需求量，最後一捲不足整支時於出貨時裁切，
 * 裁剩的零碼布留庫存等待下次湊單（PRD 決策5）。總量不足則回傳 null，該筆明細走無現貨路徑。
 */
export function allocateWholeRolls(requiredQty: number, availableRolls: FabricLabel[]): FabricLabel[] | null {
  // 由大到小取用，讓需要裁切的捲數降到最低
  const sorted = [...availableRolls].sort((a, b) => b.length - a.length)
  const chosen: FabricLabel[] = []
  let total = 0
  for (const roll of sorted) {
    if (total >= requiredQty) break
    chosen.push(roll)
    total += roll.length
  }
  return total >= requiredQty ? chosen : null
}

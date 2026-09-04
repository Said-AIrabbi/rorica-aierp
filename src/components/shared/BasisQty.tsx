import { formatNumber, meterToYard, yardToMeter } from '@/lib/units'

/**
 * 數量的雙單位呈現規則（全系統一致）。
 *
 * 同一筆數量一律同時存在 Yard 與 Meter，但兩欄等重並列會看不出「客戶當初下單用的是哪一個」——
 * 另一個是系統換算出來的。故一律以**來源表1 的建單基準**為主值，另一單位標 ≈ 為換算值。
 * 基準只有表1 記錄（`PackingNotice.itemUnit`），下游單據都要回頭取。
 */
export type QtyBasis = 'Yard' | 'Meter'

/** 主值：碼取整數、米取一位，沿用各單據原本的小數位慣例 */
export function basisQtyText(yard: number, meter: number, unit: QtyBasis): string {
  return unit === 'Yard' ? formatNumber(yard, 0) : formatNumber(meter, 1)
}

/** 換算值說明文字（含單位全名，避免只看到 ≈ 數字不知道是什麼單位） */
export function basisConvertedText(yard: number, meter: number, unit: QtyBasis): string {
  return unit === 'Yard' ? `≈ ${formatNumber(meter, 1)} 米 (Meter)` : `≈ ${formatNumber(yard, 1)} 碼 (Yard)`
}

/** 畫面用：主值一行、換算值一行（灰字），供表格儲存格直接放入 */
export function BasisQty({ yard, meter, unit }: { yard: number; meter: number; unit: QtyBasis }) {
  return (
    <>
      <div>{basisQtyText(yard, meter, unit)}</div>
      <div className="text-xs text-muted-foreground">{basisConvertedText(yard, meter, unit)}</div>
    </>
  )
}

/**
 * 布卷長度的雙單位文字，如「50.3m（≈ 55.0yd）」。
 *
 * 布卷的基準不是訂單基準，而是**這一捲入庫時實際量測用的單位**（`FabricLabel.unit`）——
 * 另一個同樣是換算值，故一律把實測單位放前面，換算值標 ≈。
 */
export function rollLengthText(length: number, unit: QtyBasis): string {
  const yard = unit === 'Yard' ? length : meterToYard(length)
  const meter = unit === 'Meter' ? length : yardToMeter(length)
  return unit === 'Yard'
    ? `${formatNumber(yard, 1)}yd（≈ ${formatNumber(meter, 1)}m）`
    : `${formatNumber(meter, 1)}m（≈ ${formatNumber(yard, 1)}yd）`
}

/** 表頭用：「商品總數 (Yard)」這類標題的單位字樣 */
export function basisHeader(label: string, unit: QtyBasis): string {
  return `${label} (${unit})`
}

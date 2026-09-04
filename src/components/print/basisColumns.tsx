import { formatNumber } from '@/lib/units'
import type { QtyBasis } from '@/components/shared/BasisQty'
import type { PrintColumn } from './PrintSheet'

/**
 * 列印版面的數量欄：主值欄依來源表1 的建單基準命名（(Y)／(M)），換算值欄標 ≈。
 * 與畫面同一套規則（見 BasisQty），差別只在紙張欄寬有限，單位縮寫為 (Y)／(M)。
 */
export function basisQtyColumns<T>(options: {
  unit: QtyBasis
  /** 主值欄標題前綴，例如「數量」「商品總數」「碼數」 */
  label: string
  yard: (row: T) => number
  meter: (row: T) => number
  width?: string
  convertedWidth?: string
}): PrintColumn<T>[] {
  const { unit, label, yard, meter, width = '18mm', convertedWidth = '16mm' } = options
  return [
    {
      header: unit === 'Yard' ? `${label} (Y)` : `${label} (M)`,
      cell: (r) => formatNumber(unit === 'Yard' ? yard(r) : meter(r), 1),
      align: 'right',
      width,
    },
    {
      header: unit === 'Yard' ? '≈ (M)' : '≈ (Y)',
      cell: (r) => formatNumber(unit === 'Yard' ? meter(r) : yard(r), 1),
      align: 'right',
      width: convertedWidth,
    },
  ]
}

/** 表頭欄位：載明這張單的數量是以哪個單位下的，另一個是換算值 */
export function basisMetaValue(unit: QtyBasis): string {
  return `${unit}（另一單位為換算值）`
}

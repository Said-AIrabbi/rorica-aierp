import { formatNumber } from '@/lib/units'
import type { QtyBasis } from '@/components/shared/BasisQty'
import type { PrintColumn } from './PrintSheet'

/**
 * 列印版面的數量欄：依來源表1 的建單基準只印一欄（(Y)／(M)）。
 * 換算值不列印（決策174）——紙上只留客戶實際下單的單位；畫面上仍以 ≈ 附另一單位。
 */
export function basisQtyColumns<T>(options: {
  unit: QtyBasis
  /** 主值欄標題前綴，例如「數量」「商品總數」「碼數」 */
  label: string
  yard: (row: T) => number
  meter: (row: T) => number
  width?: string
}): PrintColumn<T>[] {
  const { unit, label, yard, meter, width = '18mm' } = options
  return [
    {
      header: unit === 'Yard' ? `${label} (Y)` : `${label} (M)`,
      cell: (r) => formatNumber(unit === 'Yard' ? yard(r) : meter(r), 1),
      align: 'right',
      width,
    },
  ]
}

/** 表頭欄位：載明這張單的數量是以哪個單位下的（換算值不列印，決策174） */
export function basisMetaValue(unit: QtyBasis): string {
  return unit
}

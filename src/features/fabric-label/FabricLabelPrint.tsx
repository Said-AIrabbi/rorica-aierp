import { Barcode } from '@/components/print/Barcode'
import { formatNumber, meterToYard, yardToMeter } from '@/lib/units'
import { productBranchSuffix } from '@/mocks/data'
import type { FabricLabel } from '@/types'

/**
 * 表7 布疋條碼標籤列印版面。
 * 非系統畫面／表單，而是列印在標籤紙上、貼附於布捲的實體身分標籤：
 * 上方條碼＋人讀碼／中段欄位資訊／下方再印一次相同條碼＋人讀碼
 * （方便布捲不同位置皆可掃描辨識）。
 * 幅寬依定案僅印英吋、不印公分；長度雙單位同時列印。
 */
export function FabricLabelPrint({ label }: { label: FabricLabel }) {
  const yard = label.unit === 'Yard' ? label.length : meterToYard(label.length)
  const meter = label.unit === 'Meter' ? label.length : yardToMeter(label.length)

  const barcodeBlock = (
    <div>
      <Barcode value={label.rollCode} height={11} />
      <div className="pr-label-code">{label.rollCode}</div>
    </div>
  )

  return (
    <section className="pr-sheet pr-label-sheet">
      <div className="pr-label">
        {barcodeBlock}

        <div className="pr-label-fields">
          <div className="pr-label-name">
            {label.productName}
            {productBranchSuffix(label.productId)}
          </div>
          <dl className="pr-label-grid">
            <dt>成分</dt>
            <dd>{label.composition ?? '—'}</dd>
            <dt>顏色</dt>
            <dd>{label.color}</dd>
            <dt>幅寬</dt>
            {/* 實體標籤僅印英吋，不印公分換算 */}
            <dd>{label.width}"</dd>
            <dt>批</dt>
            <dd>{label.batchCode ?? '—'}</dd>
            <dt>產品編號</dt>
            <dd>{label.productId ?? '—'}</dd>
            <dt>長度</dt>
            <dd>
              {formatNumber(yard, 1)}yd／{formatNumber(meter, 1)}m
            </dd>
          </dl>
        </div>

        {barcodeBlock}
      </div>
    </section>
  )
}

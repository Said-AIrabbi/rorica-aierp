import { Barcode } from '@/components/print/Barcode'
import { formatNumber, meterToYard, yardToMeter } from '@/lib/units'
import { getProduct, productBranchSuffix } from '@/mocks/data'
import type { FabricLabel } from '@/types'

/**
 * 表7 布疋條碼標籤（決策141）：印在**專用連續標籤紙**上。
 *
 * 紙張每張 寬 48mm × 高 65mm，列印範圍 寬 45mm × 高 62mm 置中（四周各 1.5mm）；
 * 一張標籤一頁，沿紙卷垂直連續——一次印十幾捲是機器自己連續走紙，不必換紙。
 * 頁面尺寸與邊界見 print.css 的 @page pr-label。
 */

/**
 * 條碼區（條碼＋人讀碼）的高度。
 *
 * 實測規格：**下條碼區上緣到標籤紙齒孔為 12mm**。齒孔是紙本身的裁切線、系統不印，
 * 而列印範圍底邊離齒孔還有 1.5mm 紙張留白，故條碼區在列印範圍內的實高是 12 − 1.5 ＝ 10.5mm。
 * 上條碼區比照同一高度——兩個條碼是同一個掃描目標，大小不一致只會讓人以為印錯。
 */
export const LABEL_BARCODE_ZONE_MM = 12 - 1.5
/** 條碼本體高度：條碼區扣掉人讀碼一行（7pt × 行高 1.25 ≈ 3.1mm）與間距 */
const LABEL_BARCODE_HEIGHT_MM = 7

/**
 * 單張標籤。非系統畫面／表單，而是貼附於布捲的實體身分標籤：
 * 上方條碼＋人讀碼／中段欄位資訊／下方再印一次相同條碼＋人讀碼
 * （方便布捲不同位置皆可掃描辨識）。
 * 幅寬依定案僅印英吋、不印公分；長度雙單位同時列印。
 */
function FabricLabelCard({ label }: { label: FabricLabel }) {
  const yard = label.unit === 'Yard' ? label.length : meterToYard(label.length)
  const meter = label.unit === 'Meter' ? label.length : yardToMeter(label.length)

  const barcodeBlock = (
    <div className="pr-label-barcode" style={{ height: `${LABEL_BARCODE_ZONE_MM}mm` }}>
      <Barcode value={label.rollCode} height={LABEL_BARCODE_HEIGHT_MM} />
      <div className="pr-label-code">{label.rollCode}</div>
    </div>
  )

  return (
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
          {/* 決策115：印「幅寬原文」，範圍寫法照印（58/60"）；主檔未提供原文者退回印計算基準。
              實體標籤一律僅印英吋，不印公分換算 */}
          <dd>{label.widthSpec ?? `${label.width}"`}</dd>
          <dt>批</dt>
          <dd>{label.batchCode ?? '—'}</dd>
          <dt>產品編號</dt>
          <dd>{(label.productId ? getProduct(label.productId)?.productCode : undefined) ?? label.productId ?? '—'}</dd>
          <dt>長度</dt>
          <dd>
            {label.unit === 'Yard'
              ? `${formatNumber(yard, 1)}yd（≈ ${formatNumber(meter, 1)}m）`
              : `${formatNumber(meter, 1)}m（≈ ${formatNumber(yard, 1)}yd）`}
          </dd>
        </dl>
      </div>

      {barcodeBlock}
    </div>
  )
}

/**
 * 多張標籤：一張一頁，依序沿紙卷往下印。
 * 換頁由 .pr-sheet + .pr-sheet 的 break-before 處理，每一頁的尺寸就是一張標籤紙。
 */
export function FabricLabelSheets({ labels }: { labels: FabricLabel[] }) {
  return (
    <>
      {labels.map((label) => (
        <section key={label.id} className="pr-sheet pr-label-sheet">
          <FabricLabelCard label={label} />
        </section>
      ))}
    </>
  )
}

/** 單捲列印：一張標籤紙 */
export function FabricLabelPrint({ label }: { label: FabricLabel }) {
  return <FabricLabelSheets labels={[label]} />
}

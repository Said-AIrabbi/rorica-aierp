import { Barcode } from '@/components/print/Barcode'
import { formatNumber, meterToYard, yardToMeter } from '@/lib/units'
import { getProduct, productBranchSuffix } from '@/mocks/data'
import type { FabricLabel } from '@/types'

/**
 * 表7 布疋條碼標籤：每張 寬 45mm × 長 62mm，排在 A4 直式上。
 * A4（210×297mm）一橫排放 4 張（180mm）、直排放 4 列（248mm），一頁 16 張；
 * 超過 16 捲才接第二頁。整組置中，四周各留 15mm／24.5mm，避開印表機的不可列印邊界。
 */
export const LABEL_COLUMNS = 4
export const LABEL_ROWS = 4
export const LABELS_PER_A4 = LABEL_COLUMNS * LABEL_ROWS

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
    <div>
      <Barcode value={label.rollCode} height={9} />
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

/** 多張標籤：每 16 張一頁 A4，由左而右、由上而下排列；最後一頁不足 16 張時其餘格位留白 */
export function FabricLabelSheets({ labels }: { labels: FabricLabel[] }) {
  const pages: FabricLabel[][] = []
  for (let i = 0; i < labels.length; i += LABELS_PER_A4) pages.push(labels.slice(i, i + LABELS_PER_A4))
  return (
    <>
      {pages.map((page, p) => (
        <section key={p} className="pr-sheet pr-label-sheet">
          <div className="pr-label-a4">
            {page.map((label) => (
              <FabricLabelCard key={label.id} label={label} />
            ))}
          </div>
        </section>
      ))}
    </>
  )
}

/** 單捲列印：同樣印在 A4 標籤紙上，佔左上第一格 */
export function FabricLabelPrint({ label }: { label: FabricLabel }) {
  return <FabricLabelSheets labels={[label]} />
}

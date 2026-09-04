import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PRINT_TITLES, VENDOR_SIGNATURE_LABELS } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { getPackingNotice, getVendor, productBranchSuffix, vendorDisplayName } from '@/mocks/data'
import { basisQtyColumns, basisMetaValue } from '@/components/print/basisColumns'
import type { QtyBasis } from '@/components/shared/BasisQty'
import type { PurchaseOrder, PurchaseOrderItem } from '@/types'

/** 數量欄依來源表1 的建單基準排序：主值在前，換算值標 ≈，對外單據才看得出賣方要交的是幾碼還是幾米 */
const buildColumns = (unit: QtyBasis): PrintColumn<PurchaseOrderItem>[] => [
  { header: '項次', cell: (_r, i) => i + 1, align: 'center', width: '8mm' },
  { header: '客戶品名', cell: (r) => r.customerProductName },
  { header: '皇加品名', cell: (r) => `${r.roricaProductName}${productBranchSuffix(r.productId)}` },
  { header: '顏色', cell: (r) => r.color },
  ...basisQtyColumns<PurchaseOrderItem>({ unit, label: '數量', yard: (r) => r.yard, meter: (r) => r.meter }),
  {
    header: '包裝方式',
    cell: (r) => (
      <>
        {r.packingMethod}
        {r.fixedLengthMeter ? <div>定碼 {formatNumber(r.fixedLengthMeter, 1)}M</div> : null}
      </>
    ),
  },
  { header: '加工方法', cell: (r) => r.processingMethod ?? '不指定' },
  { header: '單價', cell: (r) => (r.unitPrice === undefined ? ' ' : formatNumber(r.unitPrice, 2)), align: 'right', width: '16mm' },
  {
    header: '金額',
    cell: (r) => (r.unitPrice === undefined ? ' ' : formatNumber(r.unitPrice * r.yard, 0)),
    align: 'right',
    width: '20mm',
  },
]

/**
 * 表2 訂購單列印版面：送賣方（供應商／染整廠）簽名回傳的對外單據，
 * 故頁尾固定印出「2 日內簽名回傳」的簽回規則，並保留廠商簽章欄。
 */
export function PurchaseOrderPrint({ order }: { order: PurchaseOrder }) {
  const vendor = getVendor(order.vendorId)
  const dyeVendor = order.dyeVendorId ? getVendor(order.dyeVendorId) : undefined
  const amount = order.items.reduce((sum, i) => sum + (i.unitPrice ?? 0) * i.yard, 0)
  const itemUnit: QtyBasis = getPackingNotice(order.parentId)?.itemUnit ?? 'Yard'

  const meta: PrintMetaItem[] = [
    { label: '訂購單號', value: order.id },
    { label: '來源包裝通知單', value: order.parentId },
    { label: '類型', value: order.type === '胚布' ? `胚布${order.hasDyeVendor ? '（委外染整）' : '（純採購）'}` : '成品' },
    { label: '日期', value: formatDate(order.createdAt) },
    { label: '賣方', value: vendorDisplayName(vendor), span: 2 },
    { label: '交貨日期', value: formatDate(order.dueDate) },
    { label: '狀態', value: order.status },
    ...(dyeVendor
      ? [{ label: '染整廠（名稱＋廠點）', value: vendorDisplayName(dyeVendor), span: 2 as const }]
      : []),
    { label: '燙金', value: order.embossing },
    { label: '彩條', value: order.colorRatioNote },
    { label: '數量輸入基準', value: basisMetaValue(itemUnit) },
  ]

  return (
    <PrintSheet
      formCode={PRINT_TITLES.purchaseOrder.formCode}
      title={PRINT_TITLES.purchaseOrder.title}
      docNo={order.id}
      date={order.createdAt}
      meta={meta}
      signatures={VENDOR_SIGNATURE_LABELS}
      footNote="本訂購單請於 2 日內簽名回傳；逾期未回傳者視同確認，不影響後續流程。"
    >
      <PrintSection title="訂購明細" note="明細逐列對應包裝通知單；數量以客戶下單基準為主值，另一單位為換算值。">
        <PrintTable
          columns={buildColumns(itemUnit)}
          rows={order.items}
          totalRow={[
            '合計',
            null,
            null,
            null,
            formatNumber(order.items.reduce((s, i) => s + (itemUnit === 'Yard' ? i.yard : i.meter), 0), 1),
            formatNumber(order.items.reduce((s, i) => s + (itemUnit === 'Yard' ? i.meter : i.yard), 0), 1),
            null,
            null,
            null,
            amount > 0 ? formatNumber(amount, 0) : null,
          ]}
        />
      </PrintSection>

      {order.note && (
        <PrintSection title="備註">
          <div style={{ border: '0.5pt solid #000', minHeight: '12mm', padding: '1.5mm 2mm' }}>{order.note}</div>
        </PrintSection>
      )}
    </PrintSheet>
  )
}

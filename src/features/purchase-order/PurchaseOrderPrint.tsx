import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PRINT_TITLES, VENDOR_SIGNATURE_LABELS } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { getPackingNotice, getVendor, productBranchSuffix, vendorDisplayName } from '@/mocks/data'
import { basisQtyColumns } from '@/components/print/basisColumns'
import type { QtyBasis } from '@/components/shared/BasisQty'
import type { PurchaseOrder, PurchaseOrderItem } from '@/types'

/**
 * 訂購明細欄位。
 *
 * 這張單是給賣方看的，故只印賣方作業需要的資訊：
 * - **客戶品名、加工方法不印**：客戶品名是皇加對客戶的稱呼，加工方法屬表5 二次加工的範疇，與供應商無關
 * - **胚布單另外不印顏色與包裝方式**：胚布是未染的坯布，顏色由後續染整決定；包裝方式屬成品交付規格
 *
 * 數量欄依來源表1 的建單基準排序：主值在前，換算值標 ≈，對外單據才看得出賣方要交的是幾碼還是幾米。
 */
const buildColumns = (unit: QtyBasis, isGreige: boolean): PrintColumn<PurchaseOrderItem>[] => [
  { header: '項次', cell: (_r, i) => i + 1, align: 'center', width: '8mm' },
  { header: '皇加品名', cell: (r) => `${r.roricaProductName}${productBranchSuffix(r.productId)}` },
  ...(isGreige ? [] : [{ header: '顏色', cell: (r: PurchaseOrderItem) => r.color }]),
  ...basisQtyColumns<PurchaseOrderItem>({ unit, label: '數量', yard: (r) => r.yard, meter: (r) => r.meter }),
  ...(isGreige
    ? []
    : [
        {
          header: '包裝方式',
          cell: (r: PurchaseOrderItem) => (
            <>
              {r.packingMethod}
              {r.fixedLengthMeter ? <div>定碼 {formatNumber(r.fixedLengthMeter, 1)}M</div> : null}
            </>
          ),
        },
      ]),
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
  // 胚布單：顏色未定、包裝屬成品規格，兩欄都不印
  const columns = buildColumns(itemUnit, order.type === '胚布')
  const qtyIndex = columns.findIndex((c) => String(c.header).startsWith('數量'))

  const meta: PrintMetaItem[] = [
    { label: '訂購單號', value: order.id },
    { label: '來源包裝通知單', value: order.parentId },
    // 類型、狀態、數量輸入基準不列印：皆為皇加內部的採購分類與流程追蹤資訊
    { label: '日期', value: formatDate(order.createdAt) },
    { label: '賣方', value: vendorDisplayName(vendor) },
    { label: '交貨日期', value: formatDate(order.dueDate) },
    ...(dyeVendor
      ? [{ label: '染整廠（名稱＋廠點）', value: vendorDisplayName(dyeVendor), span: 2 as const }]
      : []),
    { label: '燙金', value: order.embossing },
    { label: '彩條', value: order.colorRatioNote },
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
          columns={columns}
          rows={order.items}
          /* 合計列以欄位位置推算，不寫死 null 的個數——欄位會依單據類型增減，寫死一定會錯位 */
          totalRow={columns.map((col, i) => {
            if (i === 0) return '合計'
            if (i === qtyIndex) {
              return formatNumber(order.items.reduce((s, item) => s + (itemUnit === 'Yard' ? item.yard : item.meter), 0), 1)
            }
            if (i === qtyIndex + 1) {
              return formatNumber(order.items.reduce((s, item) => s + (itemUnit === 'Yard' ? item.meter : item.yard), 0), 1)
            }
            if (col.header === '金額') return amount > 0 ? formatNumber(amount, 0) : null
            return null
          })}
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

import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PRINT_TITLES, VENDOR_SIGNATURE_LABELS } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { getCustomer, getPackingNotice, getVendor, productBranchSuffix, vendorDisplayName } from '@/mocks/data'
import { basisQtyColumns, basisMetaValue } from '@/components/print/basisColumns'
import type { QtyBasis } from '@/components/shared/BasisQty'
import type { SecondaryProcessingItem, SecondaryProcessingOrder } from '@/types'

/** 數量欄依來源表1 的建單基準排序：主值在前，換算值標 ≈ */
const buildColumns = (unit: QtyBasis): PrintColumn<SecondaryProcessingItem>[] => [
  { header: '項次', cell: (_r, i) => i + 1, align: 'center', width: '8mm' },
  { header: '客戶品名', cell: (r) => r.customerProductName },
  { header: '皇加品名', cell: (r) => `${r.roricaProductName}${productBranchSuffix(r.productId)}` },
  { header: '顏色', cell: (r) => r.color },
  ...basisQtyColumns<SecondaryProcessingItem>({
    unit,
    label: '商品總數',
    yard: (r) => r.yard,
    meter: (r) => r.meter,
    width: '20mm',
  }),
  {
    header: '加工方法',
    cell: (r) => (
      <>
        {r.processingMethod ?? ' '}
        {r.processingMethodNote ? <div>（{r.processingMethodNote}）</div> : null}
      </>
    ),
  },
  { header: '加工單價', cell: (r) => (r.unitPrice === undefined ? ' ' : formatNumber(r.unitPrice, 2)), align: 'right', width: '16mm' },
  {
    header: '金額',
    cell: (r) => (r.unitPrice === undefined ? ' ' : formatNumber(r.unitPrice * r.yard, 0)),
    align: 'right',
    width: '18mm',
  },
  { header: '備註', cell: (r) => r.note ?? ' ' },
]

/**
 * 表5 二次加工單列印版面：送加工廠的對外單據。
 * 包裝設定整組唯讀帶入自表1——加工廠出貨時須依客戶原始包裝要求作業，故一併印出。
 */
export function SecondaryProcessingPrint({ order }: { order: SecondaryProcessingOrder }) {
  const vendor = getVendor(order.vendorId)
  const customer = getCustomer(order.customerId)
  const amount = order.items.reduce((sum, i) => sum + (i.unitPrice ?? 0) * i.yard, 0)
  const pk = order.packaging
  // 數量以來源表1 的建單基準為主值：加工廠看到的數字要跟客戶下單的單位一致
  const itemUnit: QtyBasis = getPackingNotice(order.parentId)?.itemUnit ?? 'Yard'

  const meta: PrintMetaItem[] = [
    { label: '二次加工單號', value: order.id },
    { label: '來源包裝通知單', value: order.parentId },
    { label: '客戶', value: customer?.shortName ?? order.customerId },
    { label: '交期', value: formatDate(order.dueDate) },
    { label: '加工廠', value: vendorDisplayName(vendor), span: 2 },
    { label: '聯絡人', value: order.vendorContactPerson ?? vendor?.contactPerson ?? ' ' },
    { label: '電話', value: order.vendorPhone ?? vendor?.phone ?? ' ' },
    { label: '加工廠地址', value: order.vendorAddress ?? vendor?.address ?? ' ', span: 2 },
    { label: '皇加聯絡窗口', value: order.internalContact ?? ' ' },
    { label: '狀態', value: order.status },
    { label: '數量輸入基準', value: basisMetaValue(itemUnit) },
  ]

  return (
    <PrintSheet
      formCode={PRINT_TITLES.secondaryProcessing.formCode}
      title={PRINT_TITLES.secondaryProcessing.title}
      docNo={order.id}
      date={order.createdAt}
      meta={meta}
      signatures={VENDOR_SIGNATURE_LABELS}
      footNote="加工完成後請依下方包裝設定出貨；包裝要求源自客戶原始訂單，不得逕行變更。"
    >
      <PrintSection title="加工明細">
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
            amount > 0 ? formatNumber(amount, 0) : null,
            null,
          ]}
        />
      </PrintSection>

      <PrintSection title="包裝設定（帶入自表1包裝通知單）">
        <table className="pr-table">
          <tbody>
            <tr>
              <th style={{ width: '28mm' }}>出貨樣數量</th>
              <td>
                {pk.sampleQty} 碼{pk.sampleQtyNote ? `（${pk.sampleQtyNote}）` : ''}
              </td>
              <th style={{ width: '28mm' }}>出貨包裝</th>
              <td>{pk.packagingType}</td>
            </tr>
            <tr>
              <th>出貨方式</th>
              <td>
                {pk.shipMethod.map((m) => (m === '其他' ? `其他：${pk.shipMethodNote || ''}` : m)).join('、')}
              </td>
              <th>彩條</th>
              <td>{pk.colorRatioNote}</td>
            </tr>
            <tr>
              <th>生產數量容許誤差</th>
              <td>{pk.toleranceNote}</td>
              <th>標籤類型</th>
              <td>{pk.labelTypes.join('、')}</td>
            </tr>
            <tr>
              <th>燙金</th>
              <td>{pk.embossing}</td>
              <th>裁邊／可接疋</th>
              <td>
                {pk.edgeCut ? '裁邊' : '不裁邊'}／{pk.allowSplicing ? '可接疋' : '不可接疋'}
              </td>
            </tr>
          </tbody>
        </table>
      </PrintSection>

      {order.note && (
        <PrintSection title="備註">
          <div style={{ border: '0.5pt solid #000', minHeight: '12mm', padding: '1.5mm 2mm' }}>{order.note}</div>
        </PrintSection>
      )}
    </PrintSheet>
  )
}

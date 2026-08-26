import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PRINT_TITLES, SHIPPING_SIGNATURE_LABELS } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { getAccount, getCustomer } from '@/mocks/data'
import type { ShippingOrder, ShippingOrderItem } from '@/types'

const columns: PrintColumn<ShippingOrderItem>[] = [
  { header: '項次', cell: (_r, i) => i + 1, align: 'center', width: '8mm' },
  { header: '客戶品名', cell: (r) => r.customerProductName ?? ' ' },
  { header: '皇加品名', cell: (r) => r.roricaProductName ?? ' ' },
  { header: '顏色', cell: (r) => r.color ?? ' ' },
  {
    header: '布疋條碼編號',
    // 拼接出貨時一筆明細對應多個捲號，逐一印出供客訴回溯
    cell: (r) => (r.rollCodes.length === 0 ? ' ' : r.rollCodes.map((c) => <div key={c}>{c}</div>)),
  },
  { header: '數量 (Y)', cell: (r) => formatNumber(r.yard, 1), align: 'right', width: '18mm' },
  { header: '(M)', cell: (r) => formatNumber(r.meter, 1), align: 'right', width: '16mm' },
  { header: '售價', cell: (r) => (r.unitPrice === undefined ? ' ' : formatNumber(r.unitPrice, 2)), align: 'right', width: '16mm' },
  {
    header: '金額',
    cell: (r) => (r.unitPrice === undefined ? ' ' : formatNumber(r.unitPrice * r.yard, 0)),
    align: 'right',
    width: '20mm',
  },
  { header: '備註', cell: (r) => r.note ?? ' ' },
]

/**
 * 表8 出貨單／樣品單列印版面：隨貨交付客戶的對外單據。
 * 出貨單與樣品單共用同一份版面，差異僅在抬頭標題（類型欄位勾選）。
 * 底部四個簽名欄（處理人／倉管／出貨／業務）沿用紙本習慣。
 */
export function ShippingOrderPrint({ order }: { order: ShippingOrder }) {
  const customer = getCustomer(order.customerId)
  const operator = order.operatorAccountId ? getAccount(order.operatorAccountId) : undefined
  const title = order.isSampleOrder ? PRINT_TITLES.shippingSample : PRINT_TITLES.shippingOrder
  const amount = order.items.reduce((sum, i) => sum + (i.unitPrice ?? 0) * i.yard, 0)

  const meta: PrintMetaItem[] = [
    { label: '出貨單號', value: order.id },
    { label: '來源包裝通知單', value: order.parentId },
    { label: '類型', value: order.isSampleOrder ? '樣品單' : '出貨單' },
    { label: '出貨日期', value: formatDate(order.shipDate) },
    { label: '客戶', value: customer ? `${customer.code}　${customer.shortName}` : order.customerId, span: 2 },
    { label: '倉管人員', value: operator?.name ?? ' ' },
    { label: '出倉部門', value: operator?.roles.join('、') ?? ' ' },
    { label: '客戶地址', value: customer?.address ?? ' ', span: 2 },
    { label: '用途', value: order.purpose ?? ' ' },
    { label: '狀態', value: order.status },
  ]

  return (
    <PrintSheet
      formCode={title.formCode}
      title={title.title}
      docNo={order.id}
      date={order.shipDate}
      meta={meta}
      signatures={SHIPPING_SIGNATURE_LABELS}
      footNote="數量一律同時記錄 Yard 與 Meter；拼接出貨之捲號組合完整列於明細。"
    >
      <PrintSection title="出貨明細">
        <PrintTable
          columns={columns}
          rows={order.items}
          totalRow={[
            '合計',
            null,
            null,
            null,
            null,
            formatNumber(order.items.reduce((s, i) => s + i.yard, 0), 1),
            formatNumber(order.items.reduce((s, i) => s + i.meter, 0), 1),
            null,
            amount > 0 ? formatNumber(amount, 0) : null,
            null,
          ]}
        />
      </PrintSection>
    </PrintSheet>
  )
}

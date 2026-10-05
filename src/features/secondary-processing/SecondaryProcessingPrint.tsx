import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PackagingPrintSection } from '@/components/print/PackagingPrintSection'
import { PRINT_TITLES, VENDOR_SIGNATURE_LABELS } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber, sumLineAmounts } from '@/lib/units'
import { getPackingNotice, getVendor, productBranchSuffix, vendorDisplayName } from '@/mocks/data'
import { basisQtyColumns } from '@/components/print/basisColumns'
import type { QtyBasis } from '@/components/shared/BasisQty'
import type { SecondaryProcessingItem, SecondaryProcessingOrder } from '@/types'
import { colorRatioText } from '@/lib/workflow'

/**
 * 數量欄依來源表1 的建單基準排序：主值在前，換算值標 ≈。
 *
 * 欄寬依實測內容分配，合計 190mm（A4 直式可用寬度）；
 * 加工方法、彩條與備註移到同一項次的第二行（見 itemSubRow）——
 * 十一個欄位的內容總寬量出來是 332mm，留在表內每一格都會換行。
 */
const buildColumns = (unit: QtyBasis): PrintColumn<SecondaryProcessingItem>[] => [
  { header: '項次', cell: (_r, i) => i + 1, align: 'center', width: '10mm' },
  { header: '客戶品名', cell: (r) => r.customerProductName, width: '40mm' },
  {
    header: '皇加品名',
    cell: (r) => `${r.roricaProductName}${productBranchSuffix(r.productId)}`,
    width: '36mm',
  },
  { header: '顏色', cell: (r) => r.color, width: '18mm' },
  ...basisQtyColumns<SecondaryProcessingItem>({
    unit,
    label: '商品總數',
    yard: (r) => r.yard,
    meter: (r) => r.meter,
    width: '23mm',
    convertedWidth: '15mm',
  }),
  {
    header: '加工單價',
    cell: (r) => (r.unitPrice === undefined ? ' ' : formatNumber(r.unitPrice, 2)),
    align: 'right',
    width: '22mm',
  },
  {
    header: '金額',
    cell: (r) => (r.unitPrice === undefined ? ' ' : formatNumber(r.unitPrice * r.yard, 0)),
    align: 'right',
    width: '26mm',
  },
]

/** 同一項次的第二行：加工方法（本單的主題）、彩條、備註；皆空則不輸出 */
const itemSubRow = (item: SecondaryProcessingItem) => {
  const ratios = (item.colorRatios ?? []).filter((v) => v.trim())
  const parts = [
    item.processingMethod
      ? `加工方法：${item.processingMethod}${item.processingMethodNote ? `（${item.processingMethodNote}）` : ''}`
      : undefined,
    ratios.length > 0 ? `彩條：${colorRatioText(item.colorRatios)}` : undefined,
    item.note ? `備註：${item.note}` : undefined,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('　／　') : null
}

/**
 * 表5 二次加工單列印版面：送加工廠的對外單據。
 * 包裝設定整組唯讀帶入自表1——加工廠出貨時須依客戶原始包裝要求作業，故一併印出。
 */
export function SecondaryProcessingPrint({ order }: { order: SecondaryProcessingOrder }) {
  const vendor = getVendor(order.vendorId)
  // 看不到單價的角色印出來是「-」，不是 0（決策16、29）
  const amount = sumLineAmounts(order.items, (i) => i.unitPrice, (i) => i.yard)
  // 數量以來源表1 的建單基準為主值：加工廠看到的數字要跟客戶下單的單位一致
  const itemUnit: QtyBasis = getPackingNotice(order.parentId)?.itemUnit ?? 'Yard'

  // 客戶、聯絡人、電話、加工廠地址、狀態不列印：客戶是皇加的商業資訊不對加工廠揭露，
  // 聯絡人／電話／地址是加工廠自己的資料，狀態則是皇加系統內的流程追蹤
  const meta: PrintMetaItem[] = [
    { label: '二次加工單號', value: order.id },
    { label: '來源包裝通知單', value: order.parentId },
    { label: '交期', value: formatDate(order.dueDate) },
    { label: '加工廠', value: vendorDisplayName(vendor) },
    { label: '皇加聯絡窗口', value: order.internalContact ?? ' ', span: 2 },
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
          subRow={itemSubRow}
          totalRow={[
            '合計',
            null,
            null,
            null,
            formatNumber(order.items.reduce((s, i) => s + (itemUnit === 'Yard' ? i.yard : i.meter), 0), 1),
            formatNumber(order.items.reduce((s, i) => s + (itemUnit === 'Yard' ? i.meter : i.yard), 0), 1),
            null,
            amount ? formatNumber(amount, 0) : null,
          ]}
        />
      </PrintSection>

      <PackagingPrintSection packaging={order.packaging} />

      {order.note && (
        <PrintSection title="備註">
          <div style={{ border: '0.5pt solid #000', minHeight: '12mm', padding: '1.5mm 2mm' }}>{order.note}</div>
        </PrintSection>
      )}
    </PrintSheet>
  )
}

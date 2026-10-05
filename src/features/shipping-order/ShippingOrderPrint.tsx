import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PackagingPrintSection } from '@/components/print/PackagingPrintSection'
import { PRINT_TITLES, SHIPPING_SIGNATURE_LABELS } from '@/lib/print'
import { buildSecondaryProcessingPackaging } from '@/lib/workflow'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { getAccount, getCustomer, getPackingNotice } from '@/mocks/data'
import type { ShippingOrder, ShippingOrderItem } from '@/types'

/** 數量欄依來源表1 的輸入基準排序：主值在前，換算值標 ≈，避免對外單據看不出客戶實際下的數字 */
const buildColumns = (unit: 'Yard' | 'Meter'): PrintColumn<ShippingOrderItem>[] => [
  { header: '項次', cell: (_r, i) => i + 1, align: 'center', width: '8mm' },
  { header: '客戶品名', cell: (r) => r.customerProductName ?? ' ' },
  { header: '皇加品名', cell: (r) => r.roricaProductName ?? ' ' },
  { header: '顏色', cell: (r) => r.color ?? ' ' },
  {
    header: '布疋條碼編號',
    // 拼接出貨時一筆明細對應多個捲號，逐一印出供客訴回溯
    cell: (r) => (r.rollCodes.length === 0 ? ' ' : r.rollCodes.map((c) => <div key={c}>{c}</div>)),
  },
  {
    header: unit === 'Yard' ? '數量 (Y)' : '數量 (M)',
    cell: (r) => formatNumber(unit === 'Yard' ? r.yard : r.meter, 1),
    align: 'right',
    width: '18mm',
  },
  {
    header: unit === 'Yard' ? '≈ (M)' : '≈ (Y)',
    cell: (r) => formatNumber(unit === 'Yard' ? r.meter : r.yard, 1),
    align: 'right',
    width: '16mm',
  },
  // 售價與金額不列印：本單隨貨交付客戶，價格資訊不隨貨外流，僅保留於系統畫面
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
  const notice = getPackingNotice(order.parentId)
  const itemUnit = notice?.itemUnit ?? 'Yard'
  // 包裝設定原樣帶入自表1：倉管依此出貨、客戶也照此驗收，與表5 共用同一份版面
  const packaging = notice ? buildSecondaryProcessingPackaging(notice) : undefined

  /**
   * 地址欄（決策133）：這張紙是送貨的人與客戶驗收時看的，印錯地址就是送錯地方。
   *
   * 有本單的收貨地址（自表1 帶入，或倉管在出貨單上改過）就印它，標題為「收貨地址」；
   * 留白才退回印客戶主檔的公司地址，標題也跟著回到「客戶地址」——
   * **標題與值一起換**：若一律標成收貨地址卻印著公司地址，看紙的人會以為那就是客戶指定的送達地點。
   */
  const addressMeta: PrintMetaItem = order.shippingAddress
    ? { label: '收貨地址', value: order.shippingAddress, span: 2 }
    : { label: '客戶地址', value: customer?.address ?? ' ', span: 2 }

  const meta: PrintMetaItem[] = [
    { label: '出貨單號', value: order.id },
    { label: '來源包裝通知單', value: order.parentId },
    { label: '類型', value: order.isSampleOrder ? '樣品單' : '出貨單' },
    { label: '出貨日期', value: formatDate(order.shipDate) },
    { label: '客戶', value: customer ? `${customer.code}　${customer.shortName}` : order.customerId, span: 2 },
    { label: '倉管人員', value: operator?.name ?? ' ' },
    // 決策117：列印操作帳號姓名，不再依角色推導部門
    { label: '出倉部門', value: operator?.name ?? ' ' },
    addressMeta,
    { label: '用途', value: order.purpose ?? ' ' },
    { label: '數量輸入基準', value: `${itemUnit}（另一單位為換算值）` },
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
      footNote="數量一律同時記錄 Yard 與 Meter；拼接出貨之捲號組合完整列於明細；包裝要求源自客戶原始訂單。"
    >
      <PrintSection title="出貨明細">
        <PrintTable
          columns={buildColumns(itemUnit)}
          rows={order.items}
          totalRow={[
            '合計',
            null,
            null,
            null,
            null,
            formatNumber(
              order.items.reduce((s, i) => s + (itemUnit === 'Yard' ? i.yard : i.meter), 0),
              1,
            ),
            formatNumber(
              order.items.reduce((s, i) => s + (itemUnit === 'Yard' ? i.meter : i.yard), 0),
              1,
            ),
            null,
          ]}
        />
      </PrintSection>

      {packaging && <PackagingPrintSection packaging={packaging} />}
    </PrintSheet>
  )
}

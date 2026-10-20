import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PRINT_TITLES, VENDOR_SIGNATURE_LABELS } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { getVendor, productBranchSuffix, vendorDisplayName } from '@/mocks/data'
import type { PurchaseOrder, PurchaseOrderItem } from '@/types'
import { colorRatioText } from '@/lib/workflow'

/**
 * 訂購明細欄位。
 *
 * 這張單是給賣方看的，故只印賣方作業需要的資訊：
 * - **客戶品名、加工方法不印**：客戶品名是皇加對客戶的稱呼，加工方法屬表5 二次加工的範疇，與供應商無關
 * - **胚布單另外不印顏色與包裝方式**：胚布是未染的坯布，顏色由後續染整決定；包裝方式屬成品交付規格
 *
 * - **數量一律以碼（Y）印一欄，不印換算的米數；也不印金額**（決策156）：
 *   供應商以碼計價交貨，客戶以米下單（PI／表1 的建單基準為 M）者同樣只印換算後的碼數。
 *   兩個單位並列反而讓賣方猶豫該照哪一欄交；金額則由單價與數量自明，採購總額屬皇加內部的對帳資訊
 */
/*
 * 欄寬以實測內容分配（2026/10/05），合計 190mm；決策155 起可用寬度為 196mm，多出的 6mm 按比例分給各欄。
 * 決策156 拿掉「≈ (M)」與「金額」兩欄後，空出的寬度分給品名與包裝方式（成品單）、全歸品名（胚布單）。
 * 成品單與胚布單的欄位數不同（胚布不印顏色、包裝方式與彩條，決策92），
 * 故品名欄的寬度分開給：胚布單少了三欄，那些寬度全歸品名。
 *
 * 彩條移到同一項次的第二行（見 ratioSubRow）——實測單欄內容需 114mm，
 * 留在表內其他欄位會被壓到每格都換行。
 */
const buildColumns = (isGreige: boolean): PrintColumn<PurchaseOrderItem>[] => [
  { header: '項次', cell: (_r, i) => i + 1, align: 'center', width: '10mm' },
  {
    header: '皇加品名',
    cell: (r) => `${r.roricaProductName}${productBranchSuffix(r.productId)}`,
    width: isGreige ? '140mm' : '58mm',
  },
  ...(isGreige ? [] : [{ header: '顏色', cell: (r: PurchaseOrderItem) => r.color, width: '18mm' }]),
  { header: '數量 (Y)', cell: (r) => formatNumber(r.yard, 1), align: 'right', width: '22mm' },
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
          width: '64mm',
        },
      ]),
  // 單價本來就以碼計（每碼），與數量欄同一個單位
  { header: '單價', cell: (r) => (r.unitPrice === undefined ? ' ' : formatNumber(r.unitPrice, 2)), align: 'right', width: '18mm' },
]

/**
 * 同一項次的第二行：彩條。
 * 彩條與包裝方式同屬包裝要求，胚布單一律不印（決策92），故胚布單不輸出第二行。
 */
const ratioSubRow = (isGreige: boolean) => (item: PurchaseOrderItem) => {
  if (isGreige) return null
  const ratios = (item.colorRatios ?? []).filter((v) => v.trim())
  return ratios.length > 0 ? `彩條：${colorRatioText(item.colorRatios)}` : null
}

/**
 * 表2 訂購單列印版面：送賣方（供應商／染整廠）簽名回傳的對外單據，
 * 故頁尾固定印出「2 日內簽名回傳」的簽回規則，並保留廠商簽章欄。
 */
export function PurchaseOrderPrint({ order }: { order: PurchaseOrder }) {
  const vendor = getVendor(order.vendorId)
  const dyeVendor = order.dyeVendorId ? getVendor(order.dyeVendorId) : undefined
  // 胚布單：顏色未定、包裝屬成品規格，兩欄都不印
  // 胚布單的欄位與欄寬都不同（不印顏色、包裝方式與彩條，決策92）
  const isGreige = order.type === '胚布'
  const columns = buildColumns(isGreige)
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
  ]

  return (
    <PrintSheet
      formCode={PRINT_TITLES.purchaseOrder.formCode}
      title={PRINT_TITLES.purchaseOrder.title}
      docNo={order.id}
      hideHeadDocNo
      date={order.createdAt}
      meta={meta}
      signatures={VENDOR_SIGNATURE_LABELS}
      footNote="本訂購單請於 2 日內簽名回傳；逾期未回傳者視同確認，不影響後續流程。"
    >
      <PrintSection title="訂購明細" note="明細逐列對應包裝通知單；數量與單價一律以碼（Y）計，客戶以米下單者已換算為碼。">
        <PrintTable
          columns={columns}
          rows={order.items}
          subRow={ratioSubRow(isGreige)}
          /* 合計列以欄位位置推算，不寫死 null 的個數——欄位會依單據類型增減，寫死一定會錯位 */
          totalRow={columns.map((_col, i) => {
            if (i === 0) return '合計'
            if (i === qtyIndex) return formatNumber(order.items.reduce((s, item) => s + item.yard, 0), 1)
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

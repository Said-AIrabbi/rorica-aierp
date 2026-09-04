import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PRINT_TITLES, VENDOR_SIGNATURE_LABELS } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { getVendor, productBranchSuffix, vendorDisplayName } from '@/mocks/data'
import type { DyeOrder, DyeOrderItem } from '@/types'

/**
 * 胚布規格與成品規格字串長（如「100% POLY 75D/72F × 150D/48F」），
 * 擠在同一列會把其他欄位壓到換行；改排在同一項次的第二行（見 subRow）。
 */
const columns: PrintColumn<DyeOrderItem>[] = [
  { header: '項次', cell: (_r, i) => i + 1, align: 'center', width: '8mm' },
  { header: '顏色', cell: (r) => r.color },
  { header: '色樣編號', cell: (r) => r.sampleCode ?? '________' },
  { header: '對色標準', cell: (r) => r.colorMatchStandard ?? ' ' },
  { header: '胚布材質', cell: (r) => r.fabricMaterial ?? ' ' },
  { header: '單卷碼數', cell: (r) => (r.rollYard ? `${formatNumber(r.rollYard, 1)} Y` : ' '), align: 'right', width: '18mm' },
  { header: '指染數量', cell: (r) => formatNumber(r.inDyeQty, 1), align: 'right', width: '18mm' },
  { header: '成品數量', cell: (r) => formatNumber(r.finishedQty, 1), align: 'right', width: '18mm' },
  { header: '加工單價', cell: (r) => (r.unitPrice === undefined ? ' ' : formatNumber(r.unitPrice, 2)), align: 'right', width: '16mm' },
]

/** 同一項次的第二行：只印有值的規格，兩者皆空則不輸出第二行 */
const specSubRow = (item: DyeOrderItem) => {
  const parts = [
    item.fabricSpec ? `胚布規格：${item.fabricSpec}` : undefined,
    item.finishedSpec ? `成品規格：${item.finishedSpec}` : undefined,
  ].filter(Boolean)
  return parts.length > 0 ? parts.join('　／　') : null
}

/**
 * 表4 染單－委託加工通知單列印版面：送染整廠的對外單據。
 * 依 PRD 版面順序，明細區塊在上、使用胚布區塊在下；
 * 三段式庫存的「待染數量」屬於使用胚布區塊，指染／成品數量則列於明細。
 */
export function DyeOrderPrint({ order }: { order: DyeOrder }) {
  const vendor = getVendor(order.vendorId)
  const pendingTotal = order.items.reduce((sum, i) => sum + i.pendingDyeQty, 0)

  // 狀態、廠商地址、胚布到貨日、皇加聯絡窗口不列印：皆為內部流程資訊，
  // 對收單的染整廠沒有作業意義（地址是他們自己的、狀態與到貨日是皇加系統內的追蹤）
  const meta: PrintMetaItem[] = [
    { label: '染單編號', value: order.id },
    { label: '訂單編號（表1）', value: order.parentId },
    { label: '品名', value: `${order.productName}${productBranchSuffix(order.productId)}`, span: 2 },
    { label: '交期', value: formatDate(order.dueDate) },
    { label: '委託加工廠', value: vendorDisplayName(vendor), span: 2 },
    { label: '單位', value: order.unit },
    { label: '出貨檢樣', value: order.shippingSampleQty ? `${order.shippingSampleQty} Y` : ' ' },
    { label: '燙金', value: order.embossing },
    { label: '彩條', value: order.colorRatioNote },
  ]

  return (
    <PrintSheet
      formCode={PRINT_TITLES.dyeOrder.formCode}
      title={PRINT_TITLES.dyeOrder.title}
      docNo={order.id}
      date={order.effectiveAt ?? order.dueDate}
      meta={meta}
      signatures={VENDOR_SIGNATURE_LABELS}
      footNote="加工完成後請直接製作大貨樣送皇加確認。"
    >
      <PrintSection title="使用胚布">
        <table className="pr-table">
          <tbody>
            <tr>
              <th style={{ width: '28mm' }}>收布編號</th>
              <td>{order.greigeFabricCode ?? ' '}</td>
              <th style={{ width: '28mm' }}>待染數量</th>
              <td className="pr-num">
                {formatNumber(pendingTotal, 1)} {order.unit}
              </td>
            </tr>
          </tbody>
        </table>
      </PrintSection>


      {/* 備註固定輸出：沒有內容時留空框供染整廠現場手寫 */}
      <PrintSection title="備註">
        <div style={{ border: '0.5pt solid #000', minHeight: '12mm', padding: '1.5mm 2mm' }}>{order.note ?? ' '}</div>
      </PrintSection>
      {/* 明細放在最後：規格第二行讓每個項次佔兩行，放中間會把備註與使用胚布擠到次頁 */}
      <PrintSection title="明細">
        <PrintTable
          columns={columns}
          rows={order.items}
          subRow={specSubRow}
          totalRow={columns.map((col, i) => {
            if (i === 0) return '合計'
            if (col.header === '指染數量') return formatNumber(order.items.reduce((s, x) => s + x.inDyeQty, 0), 1)
            if (col.header === '成品數量') return formatNumber(order.items.reduce((s, x) => s + x.finishedQty, 0), 1)
            return null
          })}
        />
      </PrintSection>
    </PrintSheet>
  )
}

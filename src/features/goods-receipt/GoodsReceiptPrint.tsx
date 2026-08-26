import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PRINT_TITLES } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber, formatPercent } from '@/lib/units'
import { goodsReceiptShrinkageRate } from '@/lib/workflow'
import { getAccount, getVendor, vendorDisplayName } from '@/mocks/data'
import type { GoodsReceipt, GoodsReceiptRoll } from '@/types'

const columns: PrintColumn<GoodsReceiptRoll>[] = [
  { header: '疋號', cell: (r) => r.rollNo, align: 'center', width: '14mm' },
  { header: '批號', cell: (r) => r.batchCode ?? ' ', width: '24mm' },
  { header: '碼數 (Y)', cell: (r) => formatNumber(r.length, 1), align: 'right', width: '22mm' },
  { header: '米數 (M)', cell: (r) => formatNumber(r.meter, 1), align: 'right', width: '22mm' },
  { header: '重量 (KG)', cell: (r) => formatNumber(r.weight, 1), align: 'right', width: '22mm' },
  {
    header: 'OCR 信心度',
    cell: (r) => `${r.ocrConfidence}${r.ocrConfidence === '低' ? (r.reviewed ? '（已複核）' : '（待複核）') : ''}`,
    align: 'center',
  },
]

/**
 * 表6 入庫單列印版面：內部驗收與存查用。
 * 明細為 OCR 辨識廠商出貨收據後的正規化結果，低信心度欄位一併印出複核狀態，
 * 供與原始收據附件對照存檔。
 */
export function GoodsReceiptPrint({ receipt }: { receipt: GoodsReceipt }) {
  const vendor = receipt.vendorId ? getVendor(receipt.vendorId) : undefined
  const operator = getAccount(receipt.operatorAccountId)
  const shrinkage = goodsReceiptShrinkageRate(receipt)
  const totalYard = receipt.rolls.reduce((s, r) => s + r.length, 0)

  const meta: PrintMetaItem[] = [
    { label: '入庫單號', value: receipt.id },
    { label: '來源包裝通知單', value: receipt.parentId },
    { label: '來源分類', value: receipt.source },
    { label: '入庫日', value: formatDate(receipt.receiptDate) },
    {
      label: '關聯單據',
      value: receipt.relatedDocId ? `${receipt.relatedDocType}：${receipt.relatedDocId}` : ' ',
      span: 2,
    },
    { label: '倉管人員', value: operator?.name ?? receipt.operatorAccountId },
    { label: '入倉部門', value: operator?.roles.join('、') ?? ' ' },
    { label: '廠商名稱', value: vendorDisplayName(vendor), span: 2 },
    { label: '廠商出貨單號', value: receipt.vendorShipmentNo ?? ' ' },
    { label: '廠商出貨日期', value: receipt.vendorShipDate ? formatDate(receipt.vendorShipDate) : ' ' },
    { label: '用途', value: receipt.purpose ?? ' ' },
    { label: '投胚量', value: receipt.pledgedQty ? `${formatNumber(receipt.pledgedQty, 1)} Y` : ' ' },
    { label: '縮率', value: shrinkage === null ? ' ' : formatPercent(shrinkage, 1) },
    { label: '原始收據附件', value: receipt.receiptAttachmentName ?? ' ' },
  ]

  return (
    <PrintSheet
      formCode={PRINT_TITLES.goodsReceipt.formCode}
      title={PRINT_TITLES.goodsReceipt.title}
      docNo={receipt.id}
      date={receipt.receiptDate}
      meta={meta}
      signatures={['倉管', '複核', '主管']}
      footNote="縮率＝（投胚量－入庫總碼數）÷ 投胚量；低信心度欄位須經人工複核後方可確認入庫。"
    >
      <PrintSection title="入庫明細">
        <PrintTable
          columns={columns}
          rows={receipt.rolls}
          totalRow={[
            '合計',
            `${receipt.rolls.length} 捲`,
            formatNumber(totalYard, 1),
            formatNumber(receipt.rolls.reduce((s, r) => s + r.meter, 0), 1),
            formatNumber(receipt.rolls.reduce((s, r) => s + r.weight, 0), 1),
            null,
          ]}
        />
      </PrintSection>
    </PrintSheet>
  )
}

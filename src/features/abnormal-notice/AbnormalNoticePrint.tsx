import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { ABNORMAL_SIGNATURE_LABELS, PRINT_TITLES, printValue } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { getAccount, getCustomer, getVendor, vendorDisplayName } from '@/mocks/data'
import type { AbnormalNotice, ReturnedRoll } from '@/types'

interface HandlingRow {
  name: string
  qty: string
  amount: string
  note: string
}

const handlingColumns: PrintColumn<HandlingRow>[] = [
  { header: '處理方式', cell: (r) => r.name, width: '30mm' },
  { header: '碼數 (Y)', cell: (r) => r.qty, align: 'right', width: '22mm' },
  { header: '金額／費用估算', cell: (r) => r.amount, width: '40mm' },
  { header: '說明', cell: (r) => r.note },
]

const returnedColumns: PrintColumn<ReturnedRoll>[] = [
  { header: '項次', cell: (_r, i) => i + 1, align: 'center', width: '8mm' },
  { header: '原布卷條碼', cell: (r) => r.rollCode ?? '（條碼遺失）' },
  { header: '退回碼數 (Y)', cell: (r) => formatNumber(r.yard, 1), align: 'right', width: '22mm' },
  { header: '複核判定', cell: (r) => r.verdict, align: 'center', width: '18mm' },
  { header: '複核後條碼', cell: (r) => printValue(r.newRollCode) },
  { header: '備註', cell: (r) => printValue(r.note) },
]

/**
 * 表9 異常通知單／上游追討附單列印版面。
 * 四個簽核欄（生管回覆／主管＝董事長／業務／會計）為紙本手簽，故系統上只填生管回覆，
 * 其餘三欄一律留白供列印後簽名；附單需列印給染整廠，版面比照表9（PRD 決策81）。
 */
export function AbnormalNoticePrint({ notice }: { notice: AbnormalNotice }) {
  const isUpstream = notice.kind === '上游追討'
  const title = isUpstream ? PRINT_TITLES.upstreamClaim : PRINT_TITLES.abnormalNotice
  const customer = notice.customerId ? getCustomer(notice.customerId) : undefined
  const author = getAccount(notice.createdByAccountId)
  const upstreamVendor = notice.handling.deduction?.upstreamVendorId
    ? getVendor(notice.handling.deduction.upstreamVendorId)
    : undefined

  const meta: PrintMetaItem[] = [
    { label: '單號', value: notice.id },
    { label: '製表人', value: printValue(author?.name) },
    { label: '日期', value: formatDate(notice.noticeDate) },
    { label: '狀態', value: notice.status },
    // 追溯鍵二擇一：委外染整走生產編號（→表4），純採購走訂購單（→表2）
    { label: '生產編號', value: printValue(notice.productionCode) },
    { label: '關聯訂購單', value: printValue(notice.purchaseOrderId) },
    { label: isUpstream ? '客戶（原客訴來源）' : '客戶', value: printValue(customer?.shortName) },
    { label: '原出貨單', value: printValue(notice.shippingOrderId) },
    { label: '出貨日期', value: notice.shipDate ? formatDate(notice.shipDate) : ' ' },
    { label: '皇加品名', value: printValue(notice.productName) },
    { label: '顏色', value: printValue(notice.color) },
    { label: '出貨數量 (Y)', value: formatNumber(notice.shippedQty, 1) },
    { label: '異常數量 (Y)', value: formatNumber(notice.abnormalQty, 1) },
    { label: '異常問題分類', value: [notice.categoryName, notice.categoryItem].filter(Boolean).join('／') || ' ' },
    { label: '上游追討對象', value: printValue(vendorDisplayName(upstreamVendor)), span: 2 },
  ]

  const handlingRows: HandlingRow[] = []
  const { returnGoods, deduction, replacement, other } = notice.handling
  if (returnGoods) {
    handlingRows.push({
      name: '退貨',
      qty: formatNumber(returnGoods.yard, 1),
      amount: printValue(returnGoods.feeEstimate),
      note: '依實際碼數退貨，退回布先進退貨暫存倉待複核',
    })
  }
  if (deduction) {
    handlingRows.push({
      name: '扣款不退貨',
      qty: ' ',
      amount: deduction.amount != null ? `NT ${formatNumber(deduction.amount, 0)}` : ' ',
      note: `向 ${printValue(vendorDisplayName(upstreamVendor), '　　　')} 申請扣款（金額依異常程度，非全額）`,
    })
  }
  if (replacement) {
    handlingRows.push({
      name: '補貨換貨',
      qty: formatNumber(replacement.yard, 1),
      amount: printValue(replacement.freightEstimate),
      note: `關聯新出貨單：${printValue(replacement.shippingOrderId, '待建立')}`,
    })
  }
  if (other) handlingRows.push({ name: '其他補償', qty: ' ', amount: ' ', note: other.note })

  return (
    <PrintSheet
      formCode={title.formCode}
      title={title.title}
      docNo={notice.id}
      date={notice.noticeDate}
      meta={meta}
      signatures={ABNORMAL_SIGNATURE_LABELS}
      footNote="客戶簽收後 6 個月內受理，成案後 12 個月內結案。退貨依實際碼數處理，不要求整批。"
    >
      <PrintSection title="異常問題">
        <div style={{ border: '0.5pt solid #000', minHeight: '18mm', padding: '2mm' }}>{notice.issueNote}</div>
      </PrintSection>

      <PrintSection
        title="處理方式（可複選）"
        note="同一張異常單可同時處理多件事（如退貨＋額外補償出貨）；所有勾選項目皆執行完畢，本單才結案。"
      >
        <PrintTable columns={handlingColumns} rows={handlingRows} emptyText="（尚未確認處理方式）" />
      </PrintSection>

      {notice.batchDefectRollCodes.length > 0 && (
        <PrintSection
          title="瑕疵樣布／同批庫存標記"
          note="上列條碼已標記為「瑕疵／報廢」，不可再被任何訂單挑選出貨。"
        >
          <div style={{ border: '0.5pt solid #000', padding: '2mm' }}>
            {notice.batchDefectRollCodes.join('、')}（{notice.batchDefectRollCodes.length} 筆）
          </div>
        </PrintSection>
      )}

      {notice.returnedRolls && notice.returnedRolls.length > 0 && (
        <PrintSection title="退回布卷複核（退貨暫存倉）" note="良品：原條碼復活；條碼遺失則新建。瑕疵：轉為瑕疵／報廢。">
          <PrintTable columns={returnedColumns} rows={notice.returnedRolls} />
        </PrintSection>
      )}

      <PrintSection title="生管回覆">
        <div style={{ border: '0.5pt solid #000', minHeight: '14mm', padding: '2mm' }}>
          {printValue(notice.productionReply)}
        </div>
      </PrintSection>
    </PrintSheet>
  )
}

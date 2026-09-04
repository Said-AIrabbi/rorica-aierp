import { PrintSheet, PrintSection, PrintTable, type PrintColumn, type PrintMetaItem } from '@/components/print/PrintSheet'
import { PRINT_TITLES } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { getCustomer, productBranchSuffix } from '@/mocks/data'
import type { PackingNotice, PackingNoticeItem } from '@/types'

/** 出貨方式／彩條／容許誤差在資料層皆為「模式＋自訂文字」，列印時攤平為單一文字 */
export function shipMethodText(notice: PackingNotice): string {
  return notice.shipMethod.map((m) => (m === '其他' ? `其他：${notice.shipMethodNote || ''}` : m)).join('、')
}
export function colorRatioText(notice: PackingNotice): string {
  return notice.colorRatio.mode === '客人指定' ? `客人指定：${notice.colorRatio.customText || ''}` : '空白'
}
export function toleranceText(notice: PackingNotice): string {
  return notice.tolerance.mode === '其他' ? `其他：${notice.tolerance.customText || ''}` : notice.tolerance.mode
}

/**
 * 明細欄位：數量以建單時的輸入基準為主值，另一單位標為換算值（≈）——
 * 兩欄等重並列會看不出哪個數字是客戶實際下的、哪個是系統換算的。
 */
const buildItemColumns = (unit: 'Yard' | 'Meter'): PrintColumn<PackingNoticeItem>[] => [
  { header: '項次', cell: (_r, i) => i + 1, align: 'center', width: '8mm' },
  { header: '客戶品名', cell: (r) => r.customerProductName },
  { header: '皇加品名', cell: (r) => `${r.roricaProductName}${productBranchSuffix(r.productId)}` },
  { header: '顏色', cell: (r) => r.color },
  {
    header: unit === 'Yard' ? '商品總數 (Y)' : '商品總數 (M)',
    cell: (r) => formatNumber(unit === 'Yard' ? r.yard : r.meter, 1),
    align: 'right',
    width: '20mm',
  },
  {
    header: unit === 'Yard' ? '≈ (M)' : '≈ (Y)',
    cell: (r) => formatNumber(unit === 'Yard' ? r.meter : r.yard, 1),
    align: 'right',
    width: '18mm',
  },
  {
    header: '包裝方式',
    cell: (r) => (
      <>
        {r.packingMethod}
        {r.fixedLengthMeter ? <div>定碼 {formatNumber(r.fixedLengthMeter, 1)}M</div> : null}
      </>
    ),
  },
  {
    header: '加工方法',
    cell: (r) =>
      r.processingMethod ? (
        <>
          {r.processingMethod}
          {r.processingMethodNote ? <div>（{r.processingMethodNote}）</div> : null}
        </>
      ) : (
        '不指定'
      ),
  },
  { header: '備註', cell: (r) => r.note ?? ' ' },
]

/**
 * 表1 包裝通知單列印版面。
 * 版面順序依 PRD 決策55：明細緊接表頭之後，其餘區塊（嘜頭、出貨樣數量、出貨方式／彩條、
 * 燙金／標籤類型、裁邊／生產數量容許誤差）依序下移。
 */
export function PackingNoticePrint({ notice }: { notice: PackingNotice }) {
  const customer = getCustomer(notice.customerId)
  // 建單時的數量輸入基準；舊資料未記錄者視為 Yard
  const itemUnit = notice.itemUnit ?? 'Yard'
  const meta: PrintMetaItem[] = [
    { label: '客戶代號', value: customer?.code ?? notice.customerId },
    { label: '客戶簡稱', value: customer?.shortName ?? ' ' },
    { label: '訂單號碼（主號）', value: notice.id },
    { label: '客戶訂單號', value: notice.customerOrderNo },
    { label: '建立日期', value: formatDate(notice.createdAt) },
    { label: '出貨日期', value: formatDate(notice.expectedDeliveryAt) },
    { label: '狀態', value: notice.status },
    { label: '可接疋', value: notice.allowSplicing ? '可接疋' : '不可接疋' },
    { label: '數量輸入基準', value: `${itemUnit}（另一單位為換算值）` },
  ]

  const totalYard = notice.items.reduce((sum, i) => sum + i.yard, 0)
  const totalMeter = notice.items.reduce((sum, i) => sum + i.meter, 0)

  return (
    <PrintSheet
      formCode={PRINT_TITLES.packingNotice.formCode}
      title={PRINT_TITLES.packingNotice.title}
      docNo={notice.id}
      date={notice.createdAt}
      meta={meta}
      signatures={['業務', '生管', '倉管', '主管']}
      footNote="本單為生產與出貨依據，明細數量為下單時的計畫值。"
    >
      <PrintSection title="明細">
        <PrintTable
          columns={buildItemColumns(itemUnit)}
          rows={notice.items}
          totalRow={[
            '合計',
            null,
            null,
            null,
            formatNumber(itemUnit === 'Yard' ? totalYard : totalMeter, 1),
            formatNumber(itemUnit === 'Yard' ? totalMeter : totalYard, 1),
            null,
            null,
            null,
          ]}
        />
      </PrintSection>

      {/* 嘜頭可有多組，逐組各印一個表格；只有一組時不加序號，維持原本版面 */}
      {notice.markings.map((marking, index) => (
        <PrintSection
          key={index}
          title={notice.markings.length > 1 ? `嘜頭 ${index + 1}／${notice.markings.length}` : '嘜頭'}
        >
          <table className="pr-table">
            <tbody>
              <tr>
                <th style={{ width: '24mm' }}>嘜頭形狀</th>
                <td>{marking.shape}</td>
                <th style={{ width: '24mm' }}>小嘜頭</th>
                <td>
                  {marking.hasSmallMarking
                    ? `加印${marking.smallMarkingText ? `：${marking.smallMarkingText}` : ''}`
                    : '不加印'}
                </td>
              </tr>
              <tr>
                <th>客戶簡稱</th>
                <td>{customer?.shortName ?? ' '}</td>
                <th>運送目的地</th>
                <td>{marking.destination ?? ' '}</td>
              </tr>
              <tr>
                <th>毛重 (Kg)</th>
                <td>{marking.grossWeightKg ?? ' '}</td>
                <th>淨重 (Kg)</th>
                <td>{marking.netWeightKg ?? ' '}</td>
              </tr>
              <tr>
                <th>成分</th>
                <td>{marking.composition ?? ' '}</td>
                <th>產地</th>
                <td>{marking.origin ?? ' '}</td>
              </tr>
            </tbody>
          </table>
        </PrintSection>
      ))}

      <PrintSection title="出貨與包裝設定">
        <table className="pr-table">
          <tbody>
            <tr>
              <th style={{ width: '30mm' }}>出貨樣數量</th>
              <td>{notice.sampleQty} 碼</td>
              <th style={{ width: '30mm' }}>出貨方式</th>
              <td>{shipMethodText(notice)}</td>
            </tr>
            <tr>
              <th>彩條</th>
              <td>{colorRatioText(notice)}</td>
              <th>燙金</th>
              <td>{notice.embossing.join('、')}</td>
            </tr>
            <tr>
              <th>標籤類型</th>
              <td>{notice.labelTypes.join('、')}</td>
              <th>出貨包裝</th>
              <td>{notice.packagingType}</td>
            </tr>
            <tr>
              <th>裁邊</th>
              <td>{notice.edgeCut ? '是' : '否'}</td>
              <th>生產數量容許誤差</th>
              <td>{toleranceText(notice)}</td>
            </tr>
          </tbody>
        </table>
      </PrintSection>
    </PrintSheet>
  )
}

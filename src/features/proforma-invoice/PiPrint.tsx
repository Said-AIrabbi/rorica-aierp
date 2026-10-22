import { Fragment } from 'react'
import { PrintSheet, PrintSection, PrintTable, type PrintColumn } from '@/components/print/PrintSheet'
import { PI_SIGNATURE_LABELS, PRINT_TITLES, printValue } from '@/lib/print'
import { resolvePiBankAccount } from '@/lib/company'
import { formatDate } from '@/lib/dates'
import { formatNumber, yardPriceToMeterPrice } from '@/lib/units'
import { PI_CURRENCY_SYMBOL, isSurchargeItem, piQuantityItems, piTotalAmount } from '@/lib/pi'
import { basisQtyText } from '@/components/shared/BasisQty'
import { colorRatioText } from '@/lib/workflow'
import { companyProfile, getProduct } from '@/mocks/data'
import { MarkingThumbnail, SmallMarkingThumbnail } from '@/features/packing-notice/MarkingPrint'
import type { ProformaInvoice, ProformaInvoiceItem } from '@/types'

/**
 * PI 單列印版面（Phase 2 決策22，版面比照現行 BR6 範本）。
 * 這張單是給客戶的報價／預估發票，故金額、付款條件、皇加收款帳戶一律列印（決策35）；
 * 皇加內部的流程資訊（狀態、來源表1）不印。
 */
export function PiPrint({ pi }: { pi: ProformaInvoice }) {
  const symbol = PI_CURRENCY_SYMBOL[pi.currency]
  /**
   * 收款帳戶（決策138）：送簽後印的是**凍結的副本**，不是現在的主檔內容。
   * 已對外送出的 PI 重印必須與客戶手上那張紙一致——
   * 否則客戶照新帳戶匯款，錢進了哪裡沒人說得清。
   */
  const bank = resolvePiBankAccount(companyProfile, pi)
  const total = piTotalAmount(pi)
  // 數量合計不含 surcharge（決策157）：它是費用，數量只是用來乘出金額
  const quantityItems = piQuantityItems(pi.items)
  const totalQty = quantityItems.reduce((sum, item) => sum + (pi.itemUnit === 'Yard' ? item.yard : item.meter), 0)
  /**
   * 碼數總量：金額的計算基準一律是碼（單價以每碼存放）。
   * 以米報價時單價與數量都印米制（決策134 之一），這一欄仍附上碼數——
   * 皇加內部的布卷、標籤與出貨單都以碼計，客戶日後對帳或追單時用得到。
   */
  const totalYard = quantityItems.reduce((sum, item) => sum + item.yard, 0)
  /**
   * 單價的列印單位跟著報價基準走（2026/10/05，決策134 之一）。
   * 原本固定印每碼：以米報價的客戶拿「米數 × 每碼單價」會算出一個不等於金額的數字，
   * 得自己發現要換算成碼才對得上。改為單位一致後，紙上的數量 × 單價 ≈ 金額。
   */
  const pricePerDisplayUnit = (row: ProformaInvoiceItem) =>
    pi.itemUnit === 'Yard' ? row.unitPrice : yardPriceToMeterPrice(row.unitPrice)
  const priceUnitLabel = pi.itemUnit === 'Yard' ? 'Y' : 'M'

  /*
 * 欄寬以實測內容分配（2026/10/05）：逐欄量出種子資料裡最長的內容需要幾毫米，
 * 再把剩餘寬度分給可能變長的文字欄，合計 190mm；決策155 起可用寬度為 196mm（210 − 左右各 7mm），表格寬 100%，多出的 6mm 由瀏覽器按比例分給各欄。
 */
  const columns: PrintColumn<ProformaInvoiceItem>[] = [
    { header: 'PO NO.', cell: (row) => row.poNo, width: '21mm' },
    { header: 'ITEM NO.', cell: (row) => row.roricaProductName, width: '26mm' },
    { header: '客戶品名', cell: (row) => printValue(row.customerProductName), width: '34mm' },
    { header: 'COLOR', cell: (row) => row.color, width: '21mm' },
    {
      // 報價基準為 Meter 時另附碼數：皇加內部與下游單據一律以碼計，客戶對帳時用得到
      header: `QTY (${pi.itemUnit})`,
      cell: (row) =>
        // surcharge 只印乘出金額用的數字，不帶單位、不附碼數——它不是布的長度（決策157）
        isSurchargeItem(row)
          ? formatNumber(pi.itemUnit === 'Yard' ? row.yard : row.meter, 2)
          : pi.itemUnit === 'Yard'
            ? basisQtyText(row.yard, row.meter, pi.itemUnit)
            : `${basisQtyText(row.yard, row.meter, pi.itemUnit)}（${formatNumber(row.yard, 1)} Y）`,
      align: 'right',
      // 以米報價時這一欄要塞「5,070.3 Meter（5,545 Y）」這種內容，實測需 41.3mm
      width: '42mm',
    },
    {
      // 標題分兩行：接成一行時它比欄內的數字長得多，欄寬只能遷就標題，
      // 省下的寬度讓給內容真的會變長的 COLOR 與客戶品名
      header: (
        <>
          <div>UNIT PRICE</div>
          <div>
            ({symbol}/{priceUnitLabel})
          </div>
        </>
      ),
      cell: (row) => formatNumber(pricePerDisplayUnit(row), 2),
      align: 'right',
      width: '20mm',
    },
    {
      header: `AMOUNT (${symbol})`,
      cell: (row) => formatNumber(row.unitPrice * row.yard, 2),
      align: 'right',
      width: '26mm',
    },
  ]

  return (
    <PrintSheet
      formCode={PRINT_TITLES.proformaInvoice.formCode}
      title={PRINT_TITLES.proformaInvoice.title}
      docNo={pi.id}
      date={pi.createdAt}
      meta={[
        { label: '客戶 MESSRS', value: pi.customerName },
        { label: '收貨地址 DELIVERY TO', value: printValue(pi.shippingAddress), span: 2 },
        { label: '幣別 CURRENCY', value: pi.currency },
        { label: '貿易條件 TERMS', value: `${pi.tradeTerm}${pi.tradeTermNote ? `（${pi.tradeTermNote}）` : ''}` },
        { label: '起運地 FROM', value: pi.portOfLoading },
        { label: '目的地 TO', value: printValue(pi.destination) },
        {
          label: '交期 DELIVERY',
          value: `${pi.leadTimeDays} 天${pi.leadTimeNote ? `（${pi.leadTimeNote}）` : ''}`,
        },
        { label: '報價有效期 VALID UNTIL', value: formatDate(pi.quoteValidUntil), span: 2 },
        {
          label: '付款條件 PAYMENT',
          value: `${pi.paymentTerm}${pi.paymentTermNote ? `（${pi.paymentTermNote}）` : ''}`,
          span: 2,
        },
      ]}
      signatures={PI_SIGNATURE_LABELS}
      footNote={
        pi.itemUnit === 'Yard'
          ? `本報價有效期至 ${formatDate(pi.quoteValidUntil)}`
          : // 每米單價為每碼單價 ÷ 0.9144 的換算值，印到小數 2 位；數量乘單價與金額可能有尾差，先講明免得客戶來問
            `本報價有效期至 ${formatDate(pi.quoteValidUntil)}。單價以米計（1 碼 ＝ 0.9144 米），金額依碼數結算，數量乘單價可能有小數尾差。`
      }
    >
      <PrintSection title="明細 DESCRIPTION">
        <PrintTable
          columns={columns}
          rows={pi.items}
          // 合計列依欄位位置推算，避免欄位增減時空欄數寫死對不上
          totalRow={[
            '合計 TOTAL',
            null,
            null,
            null,
            pi.itemUnit === 'Yard'
              ? `${formatNumber(totalQty, 0)} ${pi.itemUnit}`
              : `${formatNumber(totalQty, 1)} ${pi.itemUnit}（${formatNumber(totalYard, 1)} Y）`,
            null,
            `${symbol} ${formatNumber(total, 2)}`,
          ]}
          subRow={(row) => {
            // surcharge 沒有規格、包裝與彩條可印（決策157）
            if (isSurchargeItem(row)) return row.note || null
            const product = row.productId ? getProduct(row.productId) : undefined
            // 規格與彩條字串長，擠在同一列會把表格撐爆，故放到同一項次的第二行
            const parts = [
              product?.material,
              product?.widthSpec,
              product?.weightGY ? `${product.weightGY}G/Y` : '',
              row.packingMethod,
              row.fixedLengthMeter ? `定碼 ${formatNumber(row.fixedLengthMeter, 1)}M` : '',
              colorRatioText(row.colorRatios),
              row.note,
            ].filter(Boolean)
            return parts.length > 0 ? parts.join('　／　') : null
          }}
        />
      </PrintSection>

      {/* 皇加自身的收款帳戶：客戶要匯款給皇加，故一律列印（決策35） */}
      <PrintSection title="匯款資訊 BANK INFORMATION">
        <table className="pr-table">
          <tbody>
            <tr>
              <th style={{ width: '30mm' }}>BANK</th>
              {/* 英文行名優先：這是英文版面的對外文件，中文行名國外銀行不受理 */}
              <td>
                {printValue(bank?.bankNameEn || bank?.bankName)}
                {bank?.bankCode ? `（${bank.bankCode}）` : ''}
              </td>
              <th style={{ width: '26mm' }}>SWIFT</th>
              <td>{printValue(bank?.swift)}</td>
            </tr>
            <tr>
              <th>ACCOUNT NAME</th>
              <td>{printValue(bank?.accountName)}</td>
              <th>ACCOUNT NO.</th>
              <td>{printValue(bank?.accountNo)}</td>
            </tr>
            {/* 受款行地址：國外匯款常被要求填寫；沒填則整列不印，不留空白欄位 */}
            {bank?.bankAddress && (
              <tr>
                <th>BANK ADDRESS</th>
                <td colSpan={3}>{bank.bankAddress}</td>
              </tr>
            )}
          </tbody>
        </table>
      </PrintSection>

      {/*
        嘜頭以圖示呈現（決策145）：客戶在報價單上就看到箱子上實際會印成什麼樣子，
        而不是一串用斜線串起來的欄位值。圖裡的每一行就是日後貼箱的內容（與表8 列印同一個元件）；
        有加印小嘜頭者並列小嘜頭的圖。
      */}
      <PrintSection title="嘜頭 SHIPPING MARKS">
        <div className="pr-mark-thumbs">
          {pi.markings.map((marking, i) => {
            const label = pi.markings.length > 1 ? `嘜頭 ${i + 1}／${pi.markings.length}` : '嘜頭'
            return (
              <Fragment key={i}>
                <div className="pr-mark-thumb-item">
                  <div className="pr-mark-thumb-caption">
                    {label}　{marking.shape}
                  </div>
                  <MarkingThumbnail marking={marking} />
                </div>
                {marking.hasSmallMarking && (
                  <div className="pr-mark-thumb-item">
                    <div className="pr-mark-thumb-caption">{label}　小嘜頭</div>
                    <SmallMarkingThumbnail marking={marking} />
                  </div>
                )}
              </Fragment>
            )
          })}
        </div>
      </PrintSection>
    </PrintSheet>
  )
}

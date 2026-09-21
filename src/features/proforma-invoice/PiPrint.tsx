import { PrintSheet, PrintSection, PrintTable, type PrintColumn } from '@/components/print/PrintSheet'
import { PI_SIGNATURE_LABELS, PRINT_BANK_ACCOUNT, PRINT_TITLES, printValue } from '@/lib/print'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { PI_CURRENCY_SYMBOL, piTotalAmount } from '@/lib/pi'
import { basisQtyText } from '@/components/shared/BasisQty'
import { colorRatioText } from '@/lib/workflow'
import { getProduct } from '@/mocks/data'
import type { ProformaInvoice, ProformaInvoiceItem } from '@/types'

/**
 * PI 單列印版面（Phase 2 決策22，版面比照現行 BR6 範本）。
 * 這張單是給客戶的報價／預估發票，故金額、付款條件、皇加收款帳戶一律列印（決策35）；
 * 皇加內部的流程資訊（狀態、來源表1）不印。
 */
export function PiPrint({ pi }: { pi: ProformaInvoice }) {
  const symbol = PI_CURRENCY_SYMBOL[pi.currency]
  const total = piTotalAmount(pi)
  const totalQty = pi.items.reduce((sum, item) => sum + (pi.itemUnit === 'Yard' ? item.yard : item.meter), 0)
  // 金額一律以碼數計算（單價為每碼），故合計列另附碼數總量供客戶核對
  const totalYard = pi.items.reduce((sum, item) => sum + item.yard, 0)

  const columns: PrintColumn<ProformaInvoiceItem>[] = [
    { header: 'PO NO.', cell: (row) => row.poNo, width: '20mm' },
    { header: 'ITEM NO.', cell: (row) => row.roricaProductName, width: '24mm' },
    { header: '客戶品名', cell: (row) => printValue(row.customerProductName), width: '24mm' },
    { header: 'COLOR', cell: (row) => row.color, width: '20mm' },
    {
      // 報價基準為 Meter 時，另附碼數——單價是「每碼」，只印米數的話客戶拿數量乘單價會對不上金額
      header: `QTY (${pi.itemUnit})`,
      cell: (row) =>
        pi.itemUnit === 'Yard'
          ? basisQtyText(row.yard, row.meter, pi.itemUnit)
          : `${basisQtyText(row.yard, row.meter, pi.itemUnit)}（${formatNumber(row.yard, 1)} Y）`,
      align: 'right',
      width: '26mm',
    },
    {
      header: `UNIT PRICE (${symbol}/Y)`,
      cell: (row) => formatNumber(row.unitPrice, 2),
      align: 'right',
      width: '22mm',
    },
    {
      header: `AMOUNT (${symbol})`,
      cell: (row) => formatNumber(row.unitPrice * row.yard, 2),
      align: 'right',
      width: '24mm',
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
      footNote={`本報價有效期至 ${formatDate(pi.quoteValidUntil)}`}
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
              <td>
                {PRINT_BANK_ACCOUNT.bankName}（{PRINT_BANK_ACCOUNT.bankCode}）
              </td>
              <th style={{ width: '26mm' }}>SWIFT</th>
              <td>{PRINT_BANK_ACCOUNT.swift}</td>
            </tr>
            <tr>
              <th>ACCOUNT NAME</th>
              <td>{PRINT_BANK_ACCOUNT.accountName}</td>
              <th>ACCOUNT NO.</th>
              <td>{PRINT_BANK_ACCOUNT.accountNo}</td>
            </tr>
          </tbody>
        </table>
      </PrintSection>

      <PrintSection title="嘜頭 SHIPPING MARKS">
        <table className="pr-table">
          <tbody>
            {pi.markings.map((marking, i) => (
              <tr key={i}>
                <th style={{ width: '30mm' }}>
                  {pi.markings.length > 1 ? `嘜頭 ${i + 1}／${pi.markings.length}` : '嘜頭'}
                </th>
                <td>
                  {[
                    marking.shape,
                    marking.headerText?.replace(/\n/g, ' '),
                    marking.destination,
                    marking.composition,
                    marking.grossWeightKg ? `G.W ${formatNumber(marking.grossWeightKg, 1)}KG` : '',
                    marking.netWeightKg ? `N.W ${formatNumber(marking.netWeightKg, 1)}KG` : '',
                    marking.origin,
                    marking.hasSmallMarking ? '加印小嘜頭' : '',
                  ]
                    .filter(Boolean)
                    .join('　／　')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </PrintSection>
    </PrintSheet>
  )
}

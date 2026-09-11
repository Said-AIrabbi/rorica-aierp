import { PrintSection } from './PrintSheet'
import type { SecondaryProcessingPackaging } from '@/types'

/**
 * 包裝設定列印區塊：表5 二次加工單與表8 出貨單共用同一份版面。
 * 兩張單的包裝要求都原樣帶入自表1 包裝通知單（加工廠與倉管都得照客戶原始要求作業），
 * 故版面集中在此，不各自寫一份——兩邊長得不一樣會讓現場以為哪一張才算準。
 */
export function PackagingPrintSection({
  packaging,
  title = '包裝設定（帶入自表1包裝通知單）',
}: {
  packaging: SecondaryProcessingPackaging
  title?: string
}) {
  const pk = packaging
  return (
    <PrintSection title={title}>
      <table className="pr-table">
        <tbody>
          <tr>
            <th style={{ width: '28mm' }}>出貨樣數量</th>
            <td>
              {pk.sampleQty} 碼{pk.sampleQtyNote ? `（${pk.sampleQtyNote}）` : ''}
            </td>
            <th style={{ width: '28mm' }}>出貨包裝</th>
            <td>{pk.packagingType}</td>
          </tr>
          <tr>
            <th>出貨方式</th>
            <td>{pk.shipMethod.map((m) => (m === '其他' ? `其他：${pk.shipMethodNote || ''}` : m)).join('、')}</td>
            <th>彩條</th>
            <td>{pk.colorRatioNote}</td>
          </tr>
          <tr>
            <th>生產數量容許誤差</th>
            <td>{pk.toleranceNote}</td>
            <th>標籤類型</th>
            <td>{pk.labelTypes.join('、')}</td>
          </tr>
          <tr>
            <th>燙金</th>
            <td>{pk.embossing}</td>
            <th>裁邊／可接疋</th>
            <td>
              {pk.edgeCut ? '裁邊' : '不裁邊'}／{pk.allowSplicing ? '可接疋' : '不可接疋'}
            </td>
          </tr>
        </tbody>
      </table>
    </PrintSection>
  )
}

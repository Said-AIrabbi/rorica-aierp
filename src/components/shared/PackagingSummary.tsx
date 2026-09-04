import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import type { SecondaryProcessingPackaging } from '@/types'

/**
 * 包裝設定唯讀呈現：整組帶入自表1 包裝通知單，下游單據（表5 二次加工單、表8 出貨單）
 * 一律照客戶原始包裝要求作業，不在各自單據重新設定。
 * 各處共用同一份呈現，避免同一組設定在不同單據上長得不一樣。
 */
export function PackagingSummary({ packaging }: { packaging: SecondaryProcessingPackaging }) {
  return (
    <>
      <p className="mb-3 text-xs text-muted-foreground">以下為表1 包裝通知單的包裝要求，唯讀帶入，不在本單重新設定。</p>
      <DetailGrid>
        <DetailField label="出貨樣數量" value={`${packaging.sampleQty} 碼`} />
        <DetailField label="出貨包裝" value={packaging.packagingType} />
        <DetailField
          label="出貨方式"
          value={
            packaging.shipMethod.join('、') +
            (packaging.shipMethodNote ? `（${packaging.shipMethodNote}）` : '')
          }
        />
        <DetailField label="彩條" value={packaging.colorRatioNote} />
        <DetailField label="生產數量容許誤差" value={packaging.toleranceNote} />
        <DetailField label="標籤類型" value={packaging.labelTypes.join('、')} />
        <DetailField label="燙金" value={packaging.embossing || '否'} />
        <DetailField label="裁邊" value={packaging.edgeCut ? '是' : '否'} />
        <DetailField label="可接疋" value={packaging.allowSplicing ? '可接疋' : '不可接疋'} />
      </DetailGrid>
    </>
  )
}

import { digitalColorSummary, formatCmyk, formatLab, hasDigitalColor, swatchHex } from '@/lib/digital-color'
import { cn } from '@/lib/utils'
import type { DigitalColor } from '@/types'

/**
 * 顏色圖示：依登記的電腦色號畫出色塊，滑鼠移上去看 LAB／HEX／CMYK。
 * 沒登記過就不畫——不拿色名猜顏色，免得「純白色」被畫成某個猜測的白。
 * 色塊只是螢幕示意，實際顏色以實體色卡為準。
 *
 * 尺寸只有兩種，className 不該拿來改寬高：
 *   - 預設 **60×60 px**：卡片、詳情頁、登記預覽等一切非表格處，不可再小——太小看不出色差
 *   - compact（14×14 px）：**僅限表格列**（表1 明細、商品列表、布卷列表），讓表格維持簡潔，
 *     要看清楚顏色請點進詳情頁
 */
export const SWATCH_SIZE_PX = 60
const COMPACT_SWATCH_SIZE_PX = 14

export function ColorSwatch({
  digital,
  compact = false,
  className,
}: {
  digital: DigitalColor | undefined
  /** 僅供表格列使用 */
  compact?: boolean
  className?: string
}) {
  const px = compact ? COMPACT_SWATCH_SIZE_PX : SWATCH_SIZE_PX
  const hex = swatchHex(digital)
  if (!hex) return null
  return (
    <span
      title={`${digitalColorSummary(digital)}\n（螢幕示意，以實體色卡為準）`}
      aria-label={`顏色圖示 ${hex}`}
      className={cn(
        'inline-block shrink-0 cursor-help border border-black/15 align-middle',
        compact ? 'rounded-sm' : 'rounded-md',
        className,
      )}
      style={{ backgroundColor: hex, width: px, height: px }}
    />
  )
}

/** 色塊＋三組色號的完整呈現，用於主檔卡片等有空間的地方 */
export function DigitalColorDetail({ digital }: { digital: DigitalColor | undefined }) {
  if (!hasDigitalColor(digital)) {
    return <div className="text-muted-foreground">電腦色號：尚未登記</div>
  }
  return (
    <div className="flex items-center gap-3">
      <ColorSwatch digital={digital} />
      <div className="space-y-0.5 font-mono text-[11px] leading-tight text-ink-body">
        {digital.lab && <div>LAB {formatLab(digital.lab)}</div>}
        {digital.hex && <div>HEX {digital.hex}</div>}
        {digital.cmyk && <div>CMYK {formatCmyk(digital.cmyk)}</div>}
      </div>
    </div>
  )
}

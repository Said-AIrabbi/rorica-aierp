import { useMemo } from 'react'
import { code128TotalWidth, encodeCode128B } from '@/lib/barcode'

/**
 * Code 128 條碼（SVG）。以模組數為 viewBox 寬度、preserveAspectRatio="none" 拉伸，
 * 確保不論列印尺寸如何縮放，條與空的比例都維持正確、可被掃描槍讀取。
 */
export function Barcode({
  value,
  height = 12,
  className,
}: {
  value: string
  /** 條碼高度（mm） */
  height?: number
  className?: string
}) {
  const modules = useMemo(() => encodeCode128B(value), [value])
  const total = code128TotalWidth(modules)

  let x = 0
  const bars = modules.map((m, i) => {
    const rect = m.bar ? <rect key={i} x={x} y={0} width={m.width} height={10} fill="#000" /> : null
    x += m.width
    return rect
  })

  return (
    <svg
      className={className}
      viewBox={`0 0 ${total} 10`}
      preserveAspectRatio="none"
      style={{ width: '100%', height: `${height}mm`, display: 'block' }}
      role="img"
      aria-label={`條碼 ${value}`}
    >
      {bars}
    </svg>
  )
}

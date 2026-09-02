import { formatNumber } from '@/lib/units'
import type { PackingNoticeMarking } from '@/types'

/**
 * 嘜頭列印版面（依皇加提供的三張實際嘜頭範例重製）。
 *
 * 嘜頭是貼在出貨紙箱上的標記，不是公司對外單據，故**不套用單據抬頭**
 * （公司名／統編／電話那一段），整張紙就是嘜頭本身。
 *
 * 一張 A4 直式印滿相同內容：正三角形／菱形為 2 欄 × 3 列共 6 份，
 * A5大小為 1 欄 × 2 列共 2 份（A5 剛好是 A4 對半）。每格加外框線供裁切。
 * 份數不在系統設定——要印幾張由瀏覽器列印對話框的份數決定。
 *
 * 資料一律取自表1 的嘜頭欄位：抬頭文字印在形狀內（A5 無形狀，整段印在最上方），
 * 其餘欄位依範例印在形狀外側，未填寫者整行不印。
 */
export function MarkingPrint({ marking }: { marking: PackingNoticeMarking }) {
  const isA5 = marking.shape === 'A5大小'
  const copies = isA5 ? 2 : 6
  return (
    <section className="pr-sheet pr-mark-sheet">
      <div className={isA5 ? 'pr-mark-grid pr-mark-grid-a5' : 'pr-mark-grid'}>
        {Array.from({ length: copies }).map((_, i) => (
          <MarkCell key={i} marking={marking} />
        ))}
      </div>
    </section>
  )
}

function MarkCell({ marking }: { marking: PackingNoticeMarking }) {
  const isA5 = marking.shape === 'A5大小'
  // 未填寫的欄位整行不印，避免嘜頭上出現空白標題
  const lines = [
    marking.destination,
    marking.composition,
    marking.grossWeightKg ? `G.W ${formatNumber(marking.grossWeightKg, 1)} KGS` : undefined,
    marking.netWeightKg ? `N.W ${formatNumber(marking.netWeightKg, 1)} KGS` : undefined,
    // 產地照欄位字面列印：填 Taiwan 就印 Taiwan，填 MADE IN TAIWAN 就印 MADE IN TAIWAN
    marking.origin,
  ].filter((l): l is string => Boolean(l && String(l).trim()))

  return (
    <div className={isA5 ? 'pr-mark-cell pr-mark-cell-a5' : 'pr-mark-cell'}>
      {isA5 ? (
        // A5 沒有形狀：抬頭文字整段（可多行）印在最上方
        marking.headerText && <div className="pr-mark-a5-head">{marking.headerText}</div>
      ) : (
        <MarkShape shape={marking.shape} text={marking.headerText ?? ''} />
      )}
      {lines.length > 0 && (
        <div className="pr-mark-lines">
          {lines.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      )}
    </div>
  )
}

/** 中日文字元寬度約為拉丁字母的 1.7 倍，估算字串寬度時分開計算 */
function visualLength(text: string): number {
  return [...text].reduce((sum, ch) => sum + (/[⺀-鿿＀-￯]/.test(ch) ? 1.7 : 1), 0)
}

/**
 * 形狀以 SVG 繪製並讓抬頭文字置中於形狀內；用 SVG 而非 CSS 邊框拼三角形，
 * 是因為列印時線寬與比例才不會隨瀏覽器縮放跑掉。
 *
 * 字級依文字長度自動縮小：形狀內可寫字的寬度有限（菱形腰身更窄），
 * 若照固定字級印，長一點的抬頭文字會整段穿出形狀外緣。
 */
function MarkShape({ shape, text }: { shape: PackingNoticeMarking['shape']; text: string }) {
  const isDiamond = shape === '菱形'
  const points = isDiamond ? '50,3 97,31 50,59 3,31' : '50,3 97,59 3,59'
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean)
  const centerY = isDiamond ? 31 : 45

  /**
   * 形狀內每個高度可寫的寬度都不同——菱形越往上下越窄、三角形越往上越窄，
   * 所以不能只用單一的最大寬度判斷，否則多行文字的第一行仍會穿出斜邊。
   * 這裡逐行檢查各自所在高度的可用寬度，字級由大往小試到全部塞得下為止。
   */
  const widthAt = (y: number) =>
    (isDiamond ? 94 * (1 - Math.abs(y - 31) / 28) : 94 * ((y - 3) / 56)) * 0.86

  let fontSize = 11
  for (let i = 0; i < 40; i++) {
    const lh = fontSize * 1.2
    const top = centerY - ((lines.length - 1) * lh) / 2
    const fits = lines.every((line, li) => visualLength(line) * fontSize * 0.6 <= widthAt(top + li * lh))
    if (fits || fontSize <= 3.5) break
    fontSize = Number((fontSize - 0.25).toFixed(2))
  }

  // 多行時整組文字垂直置中於形狀的可寫字區
  const lineHeight = fontSize * 1.2
  const firstY = centerY - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.35

  return (
    <svg className="pr-mark-shape" viewBox="0 0 100 62" preserveAspectRatio="xMidYMid meet">
      <polygon points={points} fill="none" stroke="#000" strokeWidth="0.8" />
      {lines.map((line, i) => (
        <text
          key={i}
          x="50"
          y={firstY + i * lineHeight}
          textAnchor="middle"
          className="pr-mark-shape-text"
          style={{ fontSize: `${fontSize}px` }}
        >
          {line}
        </text>
      ))}
    </svg>
  )
}

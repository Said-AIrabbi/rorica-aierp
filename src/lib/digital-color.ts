import type { ColorRecord, DigitalColor, Product } from '@/types'

/**
 * 數位色值（電腦色號）的換算與驗證。
 *
 * LAB 是主值：分光儀量出來的讀數，與螢幕、印表機無關，也是日後交給 3D 服裝軟體最可靠的一組。
 * HEX／CMYK 由 LAB 換算時：
 *   - HEX 走標準 CIELAB(D65) → XYZ → sRGB，超出 sRGB 色域的顏色會被截斷（畫面上提示「超出螢幕色域」）
 *   - CMYK 是未套 ICC 色彩描述檔的簡易換算，只能當參考；要印刷請以印刷廠提供的值覆寫
 */

export const LAB_RANGE = { l: [0, 100], a: [-128, 127], b: [-128, 127] } as const

const HEX_RE = /^#?([0-9a-f]{6})$/i

/** 接受 #abc123 或 abc123，回傳大寫含 # 的格式；格式不對回傳 undefined */
export function normalizeHex(input: string | undefined): string | undefined {
  const m = input?.trim().match(HEX_RE)
  return m ? `#${m[1].toUpperCase()}` : undefined
}

export function labToHex(lab: NonNullable<DigitalColor['lab']>): { hex: string; outOfGamut: boolean } {
  const fy = (lab.l + 16) / 116
  const fx = fy + lab.a / 500
  const fz = fy - lab.b / 200
  const finv = (t: number) => (t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787)
  // D65 參考白
  const x = 0.95047 * finv(fx)
  const y = 1.0 * finv(fy)
  const z = 1.08883 * finv(fz)
  const linear = [
    3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
    -0.969266 * x + 1.8760108 * y + 0.041556 * z,
    0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
  ]
  const outOfGamut = linear.some((c) => c < -0.001 || c > 1.001)
  const hex = linear
    .map((c) => {
      const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.max(c, 0) ** (1 / 2.4) - 0.055
      return Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, '0')
    })
    .join('')
    .toUpperCase()
  return { hex: `#${hex}`, outOfGamut }
}

/** 未套 ICC 的簡易換算，僅供參考 */
export function hexToCmyk(hex: string): NonNullable<DigitalColor['cmyk']> {
  const h = normalizeHex(hex)!.slice(1)
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
  const k = 1 - Math.max(r, g, b)
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 100 }
  const pct = (v: number) => Math.round(((1 - v - k) / (1 - k)) * 100)
  return { c: pct(r), m: pct(g), y: pct(b), k: Math.round(k * 100) }
}

/** 畫面色塊用的顏色：有 HEX 用 HEX，否則由 LAB 換算；兩者都沒有回傳 undefined */
export function swatchHex(digital: DigitalColor | undefined): string | undefined {
  if (!digital) return undefined
  return normalizeHex(digital.hex) ?? (digital.lab ? labToHex(digital.lab).hex : undefined)
}

export function hasDigitalColor(digital: DigitalColor | undefined): digital is DigitalColor {
  return !!digital && (!!digital.lab || !!digital.hex || !!digital.cmyk)
}

export function formatLab(lab: DigitalColor['lab']): string | undefined {
  if (!lab) return undefined
  const f = (v: number) => (Math.round(v * 100) / 100).toString()
  return `L* ${f(lab.l)}　a* ${f(lab.a)}　b* ${f(lab.b)}`
}

export function formatCmyk(cmyk: DigitalColor['cmyk']): string | undefined {
  if (!cmyk) return undefined
  return `C${cmyk.c} M${cmyk.m} Y${cmyk.y} K${cmyk.k}`
}

/** 一行文字摘要，供色塊的滑鼠提示使用 */
export function digitalColorSummary(digital: DigitalColor | undefined): string {
  if (!hasDigitalColor(digital)) return '尚未登記電腦色號'
  return [
    formatLab(digital.lab) && `LAB ${formatLab(digital.lab)}`,
    digital.hex && `HEX ${digital.hex}`,
    formatCmyk(digital.cmyk) && `CMYK ${formatCmyk(digital.cmyk)}`,
  ]
    .filter(Boolean)
    .join('\n')
}

/** 驗證並正規化；有錯丟出中文訊息。三組都空回傳 undefined（＝清除） */
export function validateDigitalColor(input: DigitalColor): DigitalColor | undefined {
  const out: DigitalColor = {}
  if (input.lab) {
    const { l, a, b } = input.lab
    if (![l, a, b].every((v) => Number.isFinite(v))) throw new Error('LAB 三個值都要填數字')
    if (l < LAB_RANGE.l[0] || l > LAB_RANGE.l[1]) throw new Error('L* 應介於 0–100')
    if (a < LAB_RANGE.a[0] || a > LAB_RANGE.a[1] || b < LAB_RANGE.b[0] || b > LAB_RANGE.b[1]) {
      throw new Error('a*、b* 應介於 -128–127')
    }
    out.lab = { l, a, b }
  }
  if (input.hex !== undefined && input.hex.trim() !== '') {
    const hex = normalizeHex(input.hex)
    if (!hex) throw new Error('HEX 應為六位十六進位，例如 #F7F7F2')
    out.hex = hex
  }
  if (input.cmyk) {
    const vals = [input.cmyk.c, input.cmyk.m, input.cmyk.y, input.cmyk.k]
    if (!vals.every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) throw new Error('CMYK 四個值都要介於 0–100')
    out.cmyk = { ...input.cmyk }
  }
  return hasDigitalColor(out) ? out : undefined
}

/**
 * 查某商品某顏色的數位色值（表1 等尚未指定染整廠的地方用）。
 * 同一顏色可能有多家染整廠打過、各自量出不同的值：指定了染整廠就用那一家的，
 * 否則取最近使用的那一筆——那最接近客戶現在拿到的顏色。
 * 指定了染整廠卻查無該廠的值時回傳 undefined：換廠即視為不同色號，不拿別家的值充數。
 */
export function digitalColorFor(
  product: Product | undefined,
  color: string | undefined,
  dyeVendorId?: string,
): ColorRecord | undefined {
  if (!product || !color?.trim()) return undefined
  const records = product.colors.filter((c) => c.color === color.trim() && hasDigitalColor(c.digital))
  if (dyeVendorId) return records.find((c) => c.dyeVendorId === dyeVendorId)
  return [...records].sort((x, y) => y.lastUsedAt.localeCompare(x.lastUsedAt))[0]
}

import type { CompanyProfile, PiCurrency } from '@/types'
import { PI_CURRENCY_SYMBOL } from './pi'

/**
 * 金額、匯率與顯示規則（決策171、172）。
 *
 * - 匯率以「1 單位外幣 = ? NTD」存在公司資訊，全系統只有一組現行匯率（不留歷史）
 * - **全程以完整精度計算，只在顯示時四捨五入**：先進位再加總，加總會對不上
 * - 總金額：NTD 整數、外幣 2 位小數；每碼（每米）單價同一規則
 * - 百分比一律整數，不到 1% 顯示「<1%」
 */
export type FxRates = Record<PiCurrency, number>

/** 公司資訊尚未設定匯率時的預設值（沿用原 PI 報價參照值，決策41） */
export const DEFAULT_FX_RATES: FxRates = { NTD: 1, USD: 32, RMB: 4.5, EUR: 34.5, HKD: 4.1 }

/** 換算過的金額一律附上這句提示（決策172） */
export const FX_NOTE = '依匯率資訊計算，與實際金額有些許落差'

export function companyFxRates(profile: Pick<CompanyProfile, 'fxRates'> | undefined): FxRates {
  return { ...DEFAULT_FX_RATES, ...(profile?.fxRates ?? {}), NTD: 1 }
}

export function toNtd(amount: number, currency: PiCurrency, rates: FxRates): number {
  return amount * rates[currency]
}

export function fromNtd(ntd: number, currency: PiCurrency, rates: FxRates): number {
  return ntd / rates[currency]
}

/** 幣別的顯示小數位：NTD 整數、外幣 2 位 */
export function currencyDigits(currency: PiCurrency): number {
  return currency === 'NTD' ? 0 : 2
}

/** 數字依幣別規則四捨五入顯示（不含符號）；undefined／NaN 顯示「-」 */
export function formatAmount(value: number | undefined | null, currency: PiCurrency): string {
  if (value == null || Number.isNaN(value)) return '-'
  const digits = currencyDigits(currency)
  return value.toLocaleString('zh-TW', { minimumFractionDigits: digits, maximumFractionDigits: digits })
}

/** 含幣別符號的金額，例：NT$ 1,250,000、US$ 3,150.00 */
export function formatMoney(value: number | undefined | null, currency: PiCurrency): string {
  if (value == null || Number.isNaN(value)) return '-'
  return `${PI_CURRENCY_SYMBOL[currency]} ${formatAmount(value, currency)}`
}

/** 百分比（比值 0～1）：整數，0 < x < 1% 顯示「<1%」 */
export function formatPct(ratio: number | undefined | null): string {
  if (ratio == null || Number.isNaN(ratio) || !Number.isFinite(ratio)) return '-'
  const pct = ratio * 100
  if (pct > 0 && pct < 0.5) return '<1%'
  return `${Math.round(pct)}%`
}

/**
 * 一組數值各佔幾 %（整數），總和剛好 100（圓餅圖用）。
 * 最大餘數法：先全部捨去，剩下的百分點依小數部分大小依序補上——
 * 不會出現「數值較小的那塊比例反而較大」（差額硬補給最大塊時會發生）。
 * 回傳與輸入同順序；總和為 0 時全部 0。
 */
export function integerShares(values: number[]): number[] {
  const total = values.reduce((s, v) => s + v, 0)
  if (total <= 0) return values.map(() => 0)
  const raw = values.map((v) => (v / total) * 100)
  const shares = raw.map(Math.floor)
  let left = 100 - shares.reduce((s, v) => s + v, 0)
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r), v: values[i] })).sort((a, b) => b.frac - a.frac || b.v - a.v)
  for (const { i } of order) {
    if (left <= 0) break
    shares[i] += 1
    left -= 1
  }
  return shares
}

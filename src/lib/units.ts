/** Yard/Meter 全公司統一換算係數 */
export const YARD_TO_METER = 0.9144

export function yardToMeter(yard: number): number {
  return yard * YARD_TO_METER
}

export function meterToYard(meter: number): number {
  return meter / YARD_TO_METER
}

/**
 * 幅寬換算係數：商品資料主檔的幅寬以「英吋」為原始單位（廠商提供之規格單位），
 * 系統畫面以英吋為主、括號附註公分換算；實體標籤列印僅印英吋，不印公分。
 */
export const INCH_TO_CM = 2.54

export function inchToCm(inch: number): number {
  return inch * INCH_TO_CM
}

/** 碼重/米重換算：米重(G/M) = 碼重(G/Y) ÷ 0.9144 */
export function yardWeightToMeterWeight(weightPerYard: number): number {
  return weightPerYard / YARD_TO_METER
}

/**
 * 單價的計價單位換算：主檔進價/售價以「碼」為計價單位，
 * 每米單價 = 每碼單價 ÷ 0.9144（同一段布，以米計價時每單位較貴）。
 * 牌價Y／牌價M 目前不拆分為兩個欄位，改以此係數即時換算顯示。
 */
export function yardPriceToMeterPrice(pricePerYard: number): number {
  return pricePerYard / YARD_TO_METER
}

export function formatNumber(value: number, fractionDigits = 2): string {
  return value.toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })
}

export function formatPercent(value: number, fractionDigits = 1): string {
  return `${(value * 100).toFixed(fractionDigits)}%`
}

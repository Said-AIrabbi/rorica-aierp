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

/**
 * 數值格式化。**接受 undefined 並回傳「-」**，這不是防禦性寫法，是權限設計的必要配套：
 * 欄位可見性（mocks/field-visibility.ts）刻意把看不到的欄位從物件上**刪掉**，
 * 所以生管拿到的 PI 明細根本沒有 unitPrice 這個欄位。畫面若假設它一定是數字，
 * 整個詳情頁會白畫面——看不到金額是對的，看不到整張單就是壞掉。
 *
 * NaN 同理：金額欄位被刪之後做的加總會變成 NaN，顯示「-」比顯示「NaN」誠實。
 */
export function formatNumber(value: number | undefined | null, fractionDigits = 2): string {
  if (value == null || Number.isNaN(value)) return '-'
  return value.toLocaleString('zh-TW', {
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  })
}

/**
 * 明細金額加總（單價 × 數量）。**任何一列的單價看不到就回傳 undefined。**
 *
 * 不可以用 `?? 0` 代替：把看不到的單價當成 0，畫面與列印上會出現一個貨真價實的「0」，
 * 看的人會以為這批不用錢。算不出來就說算不出來（配合 formatNumber 顯示「-」）。
 */
export function sumLineAmounts<T>(
  items: T[],
  unitPrice: (item: T) => number | undefined,
  qty: (item: T) => number,
): number | undefined {
  if (items.some((item) => unitPrice(item) == null)) return undefined
  return items.reduce((sum, item) => sum + (unitPrice(item) as number) * qty(item), 0)
}

/** 同 formatNumber：欄位可見性會刪掉看不到的欄位，故一併容忍 undefined 與 NaN */
export function formatPercent(value: number | undefined | null, fractionDigits = 1): string {
  if (value == null || Number.isNaN(value)) return '-'
  return `${(value * 100).toFixed(fractionDigits)}%`
}

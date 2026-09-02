import { z } from 'zod'
import {
  COLOR_RATIO_MODES,
  EMBOSSING_OPTIONS,
  FIXED_ROLL_PACKING_METHODS,
  LABEL_TYPES,
  MARKING_SHAPES,
  PACKAGING_TYPES,
  PACKING_METHODS,
  PROCESSING_METHODS,
  SHIP_METHODS,
  TOLERANCE_MODES,
} from '@/types'

export const packingNoticeMarkingSchema = z.object({
  shape: z.enum(MARKING_SHAPES),
  // 抬頭文字：三角形／菱形印在形狀內，A5 整段印在最上方（可多行）
  headerText: z.string().optional(),
  destination: z.string().optional(),
  grossWeightKg: z.coerce.number().min(0).optional(),
  netWeightKg: z.coerce.number().min(0).optional(),
  composition: z.string().optional(),
  origin: z.string().optional(),
  hasSmallMarking: z.boolean(),
  smallMarkingText: z.string().optional(),
})

export const packingNoticeItemSchema = z
  .object({
    customerProductName: z.string().min(1, '請輸入客戶品名'),
    roricaProductName: z.string().min(1, '請輸入皇加品名'),
    /** 產品編號：選定產品分支時記錄，全新品項留空 */
    productId: z.string().optional(),
    color: z.string().min(1, '請輸入顏色'),
    yard: z.coerce.number().positive('商品總數需大於 0'),
    packingMethod: z.enum(PACKING_METHODS),
    // 空白輸入會被 coerce 成 0；以 min(0) 收下再於送出前轉回 undefined，避免與 optional() 的型別推導衝突
    fixedLengthMeter: z.coerce.number().min(0).optional(),
    // 加工方法為單選且非必填：畫面以空字串代表「未指定」，送出前轉為 undefined
    processingMethod: z.enum(PROCESSING_METHODS).or(z.literal('')).optional(),
    processingMethodNote: z.string().optional(),
    note: z.string().optional(),
  })
  .refine(
    (item) => !FIXED_ROLL_PACKING_METHODS.includes(item.packingMethod) || (item.fixedLengthMeter ?? 0) > 0,
    { message: '定碼ROLL包裝方式需輸入定碼長度（米）', path: ['fixedLengthMeter'] },
  )

export const packingNoticeColorRatioSchema = z.object({
  mode: z.enum(COLOR_RATIO_MODES),
  customText: z.string().optional(),
})

export const packingNoticeToleranceSchema = z.object({
  mode: z.enum(TOLERANCE_MODES),
  customText: z.string().optional(),
})

export const packingNoticeFormSchema = z
  .object({
    // 客戶欄位開放文字輸入：符合既有客戶簡稱/全稱則沿用，否則單據建立時系統自動建立新客戶主檔並給予編號
    customerName: z.string().min(1, '請輸入客戶名稱'),
    customerOrderNo: z.string().min(1, '請輸入客戶訂單號'),
    expectedDeliveryAt: z.string().min(1, '請選擇出貨日期'),
    sampleQty: z.coerce.number().min(0).max(5),
    // 出貨方式：PRD規定可複選（海運/空運/小三通/其他）
    shipMethod: z.array(z.enum(SHIP_METHODS)).min(1, '請至少選擇一種出貨方式'),
    // 出貨方式勾選「其他」時需另外文字說明
    shipMethodNote: z.string().optional(),
    colorRatio: packingNoticeColorRatioSchema,
    labelTypes: z.array(z.enum(LABEL_TYPES)).min(1, '請至少選擇一種標籤類型'),
    packagingType: z.enum(PACKAGING_TYPES),
    tolerance: packingNoticeToleranceSchema,
    items: z.array(packingNoticeItemSchema).min(1, '至少需要一筆明細'),
    allowSplicing: z.boolean(),
    marking: packingNoticeMarkingSchema,
    // 燙金非必填：未勾選任何項目時預設為「否」，「布邊」「布頭」可複選
    embossing: z.array(z.enum(EMBOSSING_OPTIONS)),
    edgeCut: z.boolean(),
  })
  .refine((values) => !values.shipMethod.includes('其他') || Boolean(values.shipMethodNote?.trim()), {
    message: '請輸入出貨方式說明',
    path: ['shipMethodNote'],
  })

export type PackingNoticeFormValues = z.infer<typeof packingNoticeFormSchema>

/** 出貨樣數量：半碼一單位，0~5碼滾輪選單 */
export const SAMPLE_QTY_OPTIONS = Array.from({ length: 11 }, (_, i) => i * 0.5)

import { z } from 'zod'
import {
  COLOR_RATIO_MAX,
  FIXED_ROLL_PACKING_METHODS,
  MARKING_SHAPES,
  PACKING_METHODS,
  PI_CURRENCIES,
  PI_LEAD_TIME_DAYS,
  PI_PORTS,
} from '@/types'

/** 嘜頭欄位與表1 完全相同（決策20、52）；轉換時每張表1 帶入全部 */
export const piMarkingSchema = z.object({
  shape: z.enum(MARKING_SHAPES),
  headerText: z.string().optional(),
  destination: z.string().optional(),
  grossWeightKg: z.coerce.number().min(0).optional(),
  netWeightKg: z.coerce.number().min(0).optional(),
  composition: z.string().optional(),
  origin: z.string().optional(),
  hasSmallMarking: z.boolean(),
  smallMarkingText: z.string().optional(),
})

export const piItemSchema = z
  .object({
    // PO NO.：拆單以 PO 為界（決策43），故為明細必填欄位
    poNo: z.string().min(1, '請輸入 PO NO.'),
    roricaProductName: z.string().min(1, '請輸入皇加品名'),
    /** 產品編號：選定產品分支時記錄，隨轉換帶入表1（決策44） */
    productId: z.string().optional(),
    customerProductName: z.string().optional(),
    color: z.string().min(1, '請輸入顏色'),
    yard: z.coerce.number().positive('數量需大於 0'),
    unitPrice: z.coerce.number().min(0, '單價需大於等於 0'),
    packingMethod: z.enum(PACKING_METHODS),
    fixedLengthMeter: z.coerce.number().min(0).optional(),
    colorRatios: z.array(z.string()).max(COLOR_RATIO_MAX, `彩條最多 ${COLOR_RATIO_MAX} 組`).optional(),
    note: z.string().optional(),
  })
  .refine(
    (item) => !FIXED_ROLL_PACKING_METHODS.includes(item.packingMethod) || (item.fixedLengthMeter ?? 0) > 0,
    { message: '定碼ROLL包裝方式需輸入定碼長度（米）', path: ['fixedLengthMeter'] },
  )

export const piFormSchema = z.object({
  // 客戶：查無主檔時仍可送出（PI 階段對方尚未成為客戶，決策51）
  customerName: z.string().min(1, '請輸入或選擇客戶'),
  contactIndex: z.coerce.number().min(0).optional(),
  currency: z.enum(PI_CURRENCIES),
  tradeTerm: z.string().min(1, '請選擇貿易條件'),
  tradeTermNote: z.string().optional(),
  portOfLoading: z.enum(PI_PORTS),
  destination: z.string().optional(),
  // 下拉值經 coerce 仍是 number，型別收斂留到送出時做（見 PiFormPage 的 payload）
  leadTimeDays: z.coerce
    .number()
    .refine((v) => PI_LEAD_TIME_DAYS.includes(v as (typeof PI_LEAD_TIME_DAYS)[number]), '請選擇交期天數'),
  leadTimeNote: z.string().optional(),
  paymentTerm: z.string().min(1, '請選擇或輸入付款條件'),
  paymentTermNote: z.string().optional(),
  itemUnit: z.enum(['Yard', 'Meter']),
  items: z.array(piItemSchema).min(1, '至少需要一筆明細'),
  markings: z.array(piMarkingSchema).min(1, '至少需要一組嘜頭'),
})

export type PiFormValues = z.infer<typeof piFormSchema>

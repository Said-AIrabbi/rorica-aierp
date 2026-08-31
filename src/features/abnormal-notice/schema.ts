import { z } from 'zod'

/**
 * 表9 異常通知單開單表單。
 * 「處理方式」四個區塊各自獨立、可複選（非單選），故以四個勾選旗標＋各自的子欄位表示；
 * 開單當下可先不決定處理方式，由生管回覆後再於明細頁補上。
 */
export const abnormalNoticeFormSchema = z
  .object({
    kind: z.enum(['客訴異常', '上游追討']),
    /** 上游追討附單掛在哪張表9底下；皇加自行發現時留空，系統自產獨立主號 */
    parentAbnormalId: z.string().optional(),
    shippingOrderId: z.string().min(1, '請選擇來源出貨單'),
    shippingOrderItemIndex: z.coerce.number().min(0),
    abnormalQty: z.coerce.number().positive('異常數量需大於 0'),
    categoryName: z.string().optional(),
    categoryItem: z.string().optional(),
    issueNote: z.string().min(1, '請填寫異常問題'),

    hasReturn: z.boolean(),
    returnYard: z.coerce.number().optional(),
    returnFeeEstimate: z.string().optional(),

    hasDeduction: z.boolean(),
    deductionAmount: z.coerce.number().optional(),
    deductionVendorId: z.string().optional(),

    hasReplacement: z.boolean(),
    replacementYard: z.coerce.number().optional(),
    replacementFreightEstimate: z.string().optional(),

    hasOther: z.boolean(),
    otherNote: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    // 勾選了才檢查子欄位——沒勾選的區塊在畫面上是收合的，不應該擋單
    if (v.hasReturn && !(Number(v.returnYard) > 0)) {
      ctx.addIssue({ code: 'custom', path: ['returnYard'], message: '請填寫退貨碼數' })
    }
    if (v.hasReplacement && !(Number(v.replacementYard) > 0)) {
      ctx.addIssue({ code: 'custom', path: ['replacementYard'], message: '請填寫補出碼數' })
    }
    if (v.hasOther && !v.otherNote?.trim()) {
      ctx.addIssue({ code: 'custom', path: ['otherNote'], message: '請填寫其他補償說明' })
    }
  })

export type AbnormalNoticeFormValues = z.infer<typeof abnormalNoticeFormSchema>

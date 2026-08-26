import { z } from 'zod'

export const purchaseOrderFormSchema = z.object({
  parentId: z.string().min(1, '請選擇來源包裝通知單'),
  type: z.enum(['成品', '胚布']),
  hasDyeVendor: z.boolean().optional(),
  vendorId: z.string().min(1, '請選擇賣方'),
  /** 染整廠：「是否填入染整廠商」開關打開後必填，可與賣方為不同廠商 */
  dyeVendorId: z.string().optional(),
  dueDate: z.string().min(1, '請輸入交期'),
  note: z.string(),
  itemUnitPrices: z.record(z.string(), z.coerce.number().min(0).optional()),
})
  .refine((v) => !(v.type === '胚布' && v.hasDyeVendor) || Boolean(v.dyeVendorId), {
    message: '請選擇染整廠（名稱＋廠點）',
    path: ['dyeVendorId'],
  })

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderFormSchema>

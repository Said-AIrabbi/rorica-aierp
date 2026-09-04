import { z } from 'zod'

export const dyeOrderItemSchema = z.object({
  color: z.string().min(1, '請輸入顏色'),
  sampleCode: z.string().optional(),
  /** 勾選「無色號」：跳過歷史色號查詢，亦不自動觸發表3 */
  noSampleCode: z.boolean().optional(),
  colorMatchStandard: z.string().optional(),
  rollYard: z.coerce.number().min(0).optional(),
  fabricMaterial: z.string().optional(),
  fabricSpec: z.string().optional(),
  finishedSpec: z.string().optional(),
  unitPrice: z.coerce.number().min(0).optional(),
  pendingDyeQty: z.coerce.number().min(0, '待染數量需大於等於 0'),
  // 指染數量：建單時可先手動填寫（部分胚布已到廠即可投染），未填則為 0，日後由「胚布到貨」整批轉入
  inDyeQty: z.coerce.number().min(0, '指染數量需大於等於 0').optional(),
})

export const dyeOrderFormSchema = z.object({
  parentId: z.string().min(1, '請選擇來源包裝通知單'),
  vendorId: z.string().min(1, '請選擇委外加工廠'),
  dueDate: z.string().min(1, '請選擇交期'),
  productName: z.string().min(1, '請輸入品名'),
  /** 產品編號：帶入表1明細選定的產品分支，歷史色號查詢與規格帶入皆以此優先解析 */
  productId: z.string().optional(),
  internalContact: z.string().optional(),
  note: z.string().optional(),
  greigeFabricCode: z.string().optional(),
  shippingSampleQty: z.coerce.number().min(0).optional(),
  unit: z.enum(['Yard', 'Meter']),
  items: z.array(dyeOrderItemSchema).min(1, '至少需要一筆明細'),
})

export type DyeOrderFormValues = z.infer<typeof dyeOrderFormSchema>

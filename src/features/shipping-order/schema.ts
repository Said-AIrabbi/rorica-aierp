import { z } from 'zod'
import { GOODS_RECEIPT_PURPOSES } from '@/types'

export const shippingOrderItemSchema = z.object({
  customerProductName: z.string().optional(),
  roricaProductName: z.string().optional(),
  color: z.string().optional(),
  sourceItemId: z.string().optional(),
  // 一筆明細可對應多個捲號：拼接（接疋）出貨時即為實際使用的捲號組合
  rollCodes: z.array(z.string()).min(1, '請選擇布卷條碼'),
  yard: z.coerce.number().positive('Yard數量需大於 0'),
  unitPrice: z.coerce.number().min(0).optional(),
  note: z.string().optional(),
})

export const shippingOrderFormSchema = z.object({
  parentId: z.string().min(1, '請選擇來源包裝通知單'),
  isSampleOrder: z.boolean(),
  items: z.array(shippingOrderItemSchema).min(1, '至少需要一筆出貨明細'),
  purpose: z.enum(GOODS_RECEIPT_PURPOSES).optional(),
})

export type ShippingOrderFormValues = z.infer<typeof shippingOrderFormSchema>

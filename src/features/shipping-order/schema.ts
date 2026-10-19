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
  // 空白＝沿用表1 單價（決策142），不是 0 元：表單端以 setValueAs 把空字串轉成 undefined，
  // 否則 coerce 會把它變成 0，「贈品」與「沿用表1 單價」就分不出來
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

import { z } from 'zod'

export const dyeRequestFormSchema = z.object({
  parentId: z.string().min(1, '請選擇來源包裝通知單'),
  dyeVendorId: z.string().min(1, '請選擇染整廠'),
  // 皇加品名：文字輸入／選自商品資料主檔（比照表1），查得到主檔則自動帶出胚布編號
  productName: z.string().min(1, '請輸入皇加品名'),
  /** 產品編號：選定產品分支時記錄，全新品名留空 */
  productId: z.string().optional(),
  colors: z.array(z.string().min(1, '請輸入顏色')).min(1, '至少需要一筆顏色'),
  note: z.string().optional(),
})

export type DyeRequestFormValues = z.infer<typeof dyeRequestFormSchema>

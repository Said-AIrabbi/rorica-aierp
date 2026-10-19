import type { CustomerContact } from '@/types'

/** 空白的一組聯絡資訊：客戶與廠商主檔新增時預先開一列供填寫（決策151） */
export const EMPTY_CONTACT: CustomerContact = {
  name: '',
  title: '',
  email: '',
  phone: '',
  mobile: '',
  shippingAddress: '',
  bankAccount: '',
}

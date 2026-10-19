import type { ReactNode } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { EMPTY_CONTACT } from '@/lib/contacts'
import type { CustomerContact } from '@/types'

/**
 * 聯絡資訊（可多組）：客戶主檔與廠商主檔共用同一張卡片，欄位與規則一致。
 * 第一組為主要聯絡人，單據上帶出的即為這一組；至少一組並填姓名，由資料層把關。
 */
export function ContactsEditor({
  contacts: value,
  onChange,
  hint,
  showPrivate,
}: {
  contacts: CustomerContact[]
  onChange: (next: CustomerContact[]) => void
  /** 卡片頂端的說明：各主檔的窗口組成不同，由呼叫端給 */
  hint: ReactNode
  /**
   * 是否看得到受遮蔽的欄位（客戶聯絡資訊／廠商聯絡資訊群組）。
   * 看不到時只留姓名與職稱——資料本來就沒傳到前端，給空白輸入框會讓人以為是沒填；存檔時由資料層補回原值。
   */
  showPrivate: boolean
}) {
  // 既有資料可能還沒有聯絡資訊（表1 建單時自動建檔的客戶），畫面一律至少呈現一列供填寫
  const contacts = value.length > 0 ? value : [EMPTY_CONTACT]
  const setContact = (index: number, patch: Partial<CustomerContact>) =>
    onChange(contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)))

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>聯絡資訊（可多組）</CardTitle>
        <Button variant="outline" size="sm" onClick={() => onChange([...contacts, { ...EMPTY_CONTACT }])}>
          <Plus className="mr-1 h-4 w-4" /> 新增聯絡資訊
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          {hint}第一組為主要聯絡人，單據上帶出的即為這一組；
          <strong className="text-ink-body">至少要有一組並填寫聯絡人姓名</strong>，其餘欄位與組別皆非必填。
        </p>
        {!showPrivate && (
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            你的帳號沒有檢視 E-MAIL、電話、手機、收貨地址、銀行帳戶的權限，這些欄位不顯示；存檔時原有內容會保留。
          </p>
        )}
        {contacts.map((contact, index) => (
          <div key={index} className="rounded-lg border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                {index === 0 ? '主要聯絡人（單據帶出此組）' : `聯絡資訊 ${index + 1}`}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive hover:text-destructive"
                disabled={contacts.length <= 1}
                onClick={() => onChange(contacts.filter((_, i) => i !== index))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">聯絡人{index === 0 ? '（必填）' : ''}</Label>
                <Input
                  value={contact.name}
                  onChange={(e) => setContact(index, { name: e.target.value })}
                  placeholder={index === 0 ? '必填' : '非必填'}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">職稱</Label>
                <Input
                  value={contact.title ?? ''}
                  onChange={(e) => setContact(index, { title: e.target.value })}
                  placeholder="非必填，如 採購專員"
                />
              </div>
              {showPrivate && (
                <>
                  <div className="space-y-1">
                    <Label className="text-xs">E-MAIL</Label>
                    <Input
                      value={contact.email ?? ''}
                      onChange={(e) => setContact(index, { email: e.target.value })}
                      placeholder="非必填"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">電話</Label>
                    <Input
                      value={contact.phone ?? ''}
                      onChange={(e) => setContact(index, { phone: e.target.value })}
                      placeholder="非必填"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">手機</Label>
                    <Input
                      value={contact.mobile ?? ''}
                      onChange={(e) => setContact(index, { mobile: e.target.value })}
                      placeholder="非必填"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                    <Label className="text-xs">收貨地址</Label>
                    <Input
                      value={contact.shippingAddress ?? ''}
                      onChange={(e) => setContact(index, { shippingAddress: e.target.value })}
                      placeholder="非必填，該窗口實際收貨地點"
                    />
                  </div>
                  <div className="space-y-1 lg:col-span-3">
                    <Label className="text-xs">銀行帳戶</Label>
                    <Input
                      value={contact.bankAccount ?? ''}
                      onChange={(e) => setContact(index, { bankAccount: e.target.value })}
                      placeholder="非必填，如「第一銀行 圓山分行 123-45678901 皇加布業」"
                    />
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

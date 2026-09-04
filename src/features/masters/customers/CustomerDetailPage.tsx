import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/mocks/api'
import { createCustomer, deleteCustomer, masterDefaults, updateCustomer, type CustomerInput } from '@/mocks/mutations'
import { DeleteMasterButton } from '@/components/shared/DeleteMasterButton'
import { CUSTOMER_STATUSES, type Customer, type CustomerContact } from '@/types'

function toInput(customer: Customer): CustomerInput {
  const { id: _id, ...rest } = customer
  return rest
}

const EMPTY_CONTACT: CustomerContact = { name: '', email: '', phone: '', mobile: '', address: '' }

/** 新增時的空白表單：代碼先給下一個流水號當預設值，使用者可自行改寫 */
function emptyInput(): CustomerInput {
  return {
    code: masterDefaults.customerCode(),
    shortName: '',
    fullNameCN: '',
    fullNameEN: '',
    personInCharge: '',
    personInChargePhone: '',
    // 聯絡資訊至少一組：新增畫面直接開一列空白供填寫
    contacts: [EMPTY_CONTACT],
    address: '',
    invoiceAddress: '',
    taxId: '',
    taxRate: '5%',
    paymentTerms: '',
    // 交期預設天數：全公司統一 14 天
    leadTimeDays: 14,
    // 新客戶等級待業務評定，先給 C level
    status: 'C level',
  }
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['customers'], queryFn: api.customers })
  // 新增與編輯共用同一份表單：路由 /masters/customers/new 即為新增模式
  const isNew = id === 'new'
  const customer = data.find((c) => c.id === id)
  const [draft, setDraft] = useState<CustomerInput | null>(isNew ? emptyInput() : null)

  useEffect(() => {
    if (customer) setDraft(toInput(customer))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id])

  const mutation = useMutation({
    mutationFn: () => (isNew ? createCustomer(draft!) : updateCustomer(id!, draft!)),
    onSuccess: async (saved) => {
      // 客戶簡稱／代碼在各單據上以顯示欄位呈現，異動後一併刷新引用到客戶的查詢
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['packingNotices'] }),
      ])
      toast.success(isNew ? `已建立客戶 ${saved.code} ${saved.shortName}` : `${customer?.shortName ?? id} 客戶資料已更新`)
      if (isNew) navigate(`/masters/customers/${saved.id}`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCustomer(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['customers'] })
      toast.success(`已刪除客戶 ${customer?.shortName ?? id}`)
      navigate('/masters/customers')
    },
    // 有單據引用時 mutation 層會擋下並回傳引用的單號，原文顯示給使用者
    onError: (error: Error) => toast.error(error.message),
  })

  if ((!customer && !isNew) || !draft) {
    return <div className="text-sm text-muted-foreground">找不到客戶資料</div>
  }

  const set = <K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  // 既有客戶可能還沒有聯絡資訊（表1 建單時自動建檔者），畫面一律至少呈現一列供填寫
  const contacts = draft.contacts.length > 0 ? draft.contacts : [EMPTY_CONTACT]
  const setContacts = (next: CustomerContact[]) => set('contacts', next)
  const setContact = (index: number, patch: Partial<CustomerContact>) =>
    setContacts(contacts.map((c, i) => (i === index ? { ...c, ...patch } : c)))
  const dirty = isNew || (customer ? JSON.stringify(draft) !== JSON.stringify(toInput(customer)) : false)

  return (
    <div>
      <PageHeader
        title={isNew ? '新增客戶' : `${customer!.code}　${customer!.shortName}`}
        description="客戶資料主檔編輯視窗。系統編號為建檔時自動產生的主鍵，不可修改；客戶代碼為對外代號，可隨時更新，不影響既有單據關聯。"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/masters/customers')}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回列表
            </Button>
            {!isNew && (
              <DeleteMasterButton
                label="客戶"
                name={`${customer!.code} ${customer!.shortName}`}
                pending={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate()}
              />
            )}
            <Button onClick={() => mutation.mutate()} disabled={!dirty || mutation.isPending}>
              <Save className="mr-1 h-4 w-4" />
              {isNew ? '建立客戶' : '儲存客戶資料'}
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>基本識別</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">系統編號（唯讀）</Label>
              <Input value={isNew ? '建立後自動產生' : customer!.id} disabled />
              <p className="text-xs text-muted-foreground">建檔時自動編號，單據以此關聯</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">客戶代碼</Label>
              <Input value={draft.code} onChange={(e) => set('code', e.target.value)} />
              <p className="text-xs text-muted-foreground">對外代號，可更新；須全檔唯一</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">客戶簡稱</Label>
              <Input value={draft.shortName} onChange={(e) => set('shortName', e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">客戶狀態</Label>
              {/* A～C 為往來等級，已歇業為終止往來；以分段按鈕呈現，一眼看得出目前落在哪一級 */}
              <div className="inline-flex overflow-hidden rounded-md border border-input">
                {CUSTOMER_STATUSES.map((status) => (
                  <button
                    key={status}
                    type="button"
                    onClick={() => set('status', status)}
                    className={
                      draft.status === status
                        ? status === '已歇業'
                          ? 'bg-destructive px-3 py-1.5 text-xs font-medium text-white'
                          : 'bg-brand px-3 py-1.5 text-xs font-medium text-white'
                        : 'bg-background px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted'
                    }
                  >
                    {status}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                往來等級由業務評定；已歇業僅停止往來，主檔與歷史單據一律保留
              </p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">統一編號</Label>
              <Input value={draft.taxId} onChange={(e) => set('taxId', e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">公司名稱（中）</Label>
              <Input value={draft.fullNameCN} onChange={(e) => set('fullNameCN', e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">公司名稱（英）</Label>
              <Input value={draft.fullNameEN} onChange={(e) => set('fullNameEN', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>公司資訊</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">負責人</Label>
              <Input value={draft.personInCharge} onChange={(e) => set('personInCharge', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">負責人電話</Label>
              <Input value={draft.personInChargePhone} onChange={(e) => set('personInChargePhone', e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">公司地址</Label>
              <Input value={draft.address} onChange={(e) => set('address', e.target.value)} />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">發票地址</Label>
              <Input value={draft.invoiceAddress} onChange={(e) => set('invoiceAddress', e.target.value)} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>聯絡資訊（可多組）</CardTitle>
            <Button variant="outline" size="sm" onClick={() => setContacts([...contacts, { ...EMPTY_CONTACT }])}>
              <Plus className="mr-1 h-4 w-4" /> 新增聯絡資訊
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              同一個客戶可能有多個窗口（採購、倉庫收貨、財務）。第一組為主要聯絡人，單據上帶出的即為這一組；
              <strong className="text-ink-body">至少要有一組並填寫聯絡人姓名</strong>，其餘欄位與組別皆非必填。
            </p>
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
                    onClick={() => setContacts(contacts.filter((_, i) => i !== index))}
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
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">地址</Label>
                    <Input
                      value={contact.address ?? ''}
                      onChange={(e) => setContact(index, { address: e.target.value })}
                      placeholder="非必填，如收樣或倉庫收貨地址"
                    />
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>交易條件</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">稅率</Label>
              <Input value={draft.taxRate} onChange={(e) => set('taxRate', e.target.value)} placeholder="如 5%" />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">付款方式／票期</Label>
              <Input value={draft.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">交期預設天數</Label>
              <Input
                type="number"
                min="0"
                step="1"
                value={draft.leadTimeDays}
                onChange={(e) => set('leadTimeDays', Number(e.target.value) || 0)}
              />
              <p className="text-xs text-muted-foreground">全公司統一 14 天，可依客戶個別調整</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

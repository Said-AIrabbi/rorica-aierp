import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/mocks/api'
import { updateCustomer, type CustomerInput } from '@/mocks/mutations'
import type { Customer } from '@/types'

function toInput(customer: Customer): CustomerInput {
  const { id: _id, ...rest } = customer
  return rest
}

export function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['customers'], queryFn: api.customers })
  const customer = data.find((c) => c.id === id)
  const [draft, setDraft] = useState<CustomerInput | null>(null)

  useEffect(() => {
    if (customer) setDraft(toInput(customer))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer?.id])

  const mutation = useMutation({
    mutationFn: () => updateCustomer(id!, draft!),
    onSuccess: async () => {
      // 客戶簡稱／代碼在各單據上以顯示欄位呈現，異動後一併刷新引用到客戶的查詢
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['packingNotices'] }),
      ])
      toast.success(`${customer?.shortName ?? id} 客戶資料已更新`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!customer || !draft) {
    return <div className="text-sm text-muted-foreground">找不到客戶資料</div>
  }

  const set = <K extends keyof CustomerInput>(key: K, value: CustomerInput[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  const dirty = JSON.stringify(draft) !== JSON.stringify(toInput(customer))

  return (
    <div>
      <PageHeader
        title={`${customer.code}　${customer.shortName}`}
        description="客戶資料主檔編輯視窗。系統編號為建檔時自動產生的主鍵，不可修改；客戶代碼為對外代號，可隨時更新，不影響既有單據關聯。"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/masters/customers')}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回列表
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!dirty || mutation.isPending}>
              <Save className="mr-1 h-4 w-4" />
              儲存客戶資料
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
              <Input value={customer.id} disabled />
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
            <CardTitle>聯絡資訊</CardTitle>
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
            <div className="space-y-1">
              <Label className="text-xs">連絡人</Label>
              <Input value={draft.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">連絡人電話</Label>
              <Input value={draft.contactPersonPhone} onChange={(e) => set('contactPersonPhone', e.target.value)} />
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

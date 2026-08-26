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
import { updateVendor, type VendorInput } from '@/mocks/mutations'
import type { Vendor, VendorType } from '@/types'

/** 廠商類型為複選（同一廠商可能身兼多重角色），與 VendorType 保持同步 */
const VENDOR_TYPES: VendorType[] = ['成品供應商', '胚布供應商', '染整廠']

function toInput(vendor: Vendor): VendorInput {
  const { id: _id, ...rest } = vendor
  return rest
}

export function VendorDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })
  const vendor = data.find((v) => v.id === id)
  const [draft, setDraft] = useState<VendorInput | null>(null)

  useEffect(() => {
    if (vendor) setDraft(toInput(vendor))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vendor?.id])

  const mutation = useMutation({
    mutationFn: () => updateVendor(id!, draft!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['vendors'] })
      toast.success(`${vendor?.name ?? id} 廠商資料已更新`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!vendor || !draft) {
    return <div className="text-sm text-muted-foreground">找不到廠商資料</div>
  }

  const set = <K extends keyof VendorInput>(key: K, value: VendorInput[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  const dirty = JSON.stringify(draft) !== JSON.stringify(toInput(vendor))

  return (
    <div>
      <PageHeader
        title={`${vendor.code}　${vendor.name}`}
        description="廠商資料主檔編輯視窗。系統編號為建檔時自動產生的主鍵，不可修改；廠商代碼為對外代號，可隨時更新，不影響既有單據關聯。"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/masters/vendors')}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回列表
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!dirty || mutation.isPending}>
              <Save className="mr-1 h-4 w-4" />
              儲存廠商資料
            </Button>
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>廠商資料</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">系統編號（唯讀）</Label>
            <Input value={vendor.id} disabled />
            <p className="text-xs text-muted-foreground">建檔時自動編號，單據以此關聯</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">廠商代碼</Label>
            <Input value={draft.code} onChange={(e) => set('code', e.target.value)} />
            <p className="text-xs text-muted-foreground">對外代號，可更新；須全檔唯一</p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">廠名（公司名稱）</Label>
            <Input value={draft.name} onChange={(e) => set('name', e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">廠商類型（可複選）</Label>
            <div className="flex flex-wrap items-center gap-4 pt-1.5">
              {VENDOR_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.types.includes(type)}
                    onChange={(e) =>
                      set('types', e.target.checked ? [...draft.types, type] : draft.types.filter((t) => t !== type))
                    }
                  />
                  {type}
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">廠點代號</Label>
            <Input
              value={draft.siteCode ?? ''}
              onChange={(e) => set('siteCode', e.target.value)}
              placeholder="如 A、B；染整廠欄位帶入格式為「名稱＋廠點」"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">負責人／聯絡人</Label>
            <Input value={draft.contactPerson} onChange={(e) => set('contactPerson', e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">電話</Label>
            <Input value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-4">
            <Label className="text-xs">公司地址</Label>
            <Input
              value={draft.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
              placeholder="表4染整單「受託加工廠資訊」與表5二次加工單自動帶入"
            />
          </div>

          {/* 開票地址不一定同公司地址，故為獨立欄位 */}
          <div className="space-y-1 sm:col-span-2 lg:col-span-4">
            <Label className="text-xs">發票地址</Label>
            <Input value={draft.invoiceAddress ?? ''} onChange={(e) => set('invoiceAddress', e.target.value)} />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">統一編號</Label>
            <Input value={draft.taxId} onChange={(e) => set('taxId', e.target.value)} placeholder="廠商自己的統編" />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">稅率</Label>
            <Input value={draft.taxRate} onChange={(e) => set('taxRate', e.target.value)} placeholder="如 5%" />
          </div>

          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">付款方式／票期</Label>
            <Input value={draft.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} placeholder="財務對帳關鍵欄位，如 月結45天" />
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/mocks/api'
import { createDyeRequest } from '@/mocks/mutations'
import { productBranchLabel, resolveProduct } from '@/mocks/data'
import { dyeRequestFormSchema, type DyeRequestFormValues } from './schema'

export function DyeRequestFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: api.products })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DyeRequestFormValues>({
    resolver: zodResolver(dyeRequestFormSchema),
    defaultValues: { parentId: '', dyeVendorId: '', productName: '', colors: [''], note: '' },
  })

  const colors = watch('colors') ?? ['']
  const appendColor = () => setValue('colors', [...colors, ''])
  const removeColor = (index: number) =>
    setValue(
      'colors',
      colors.filter((_, i) => i !== index),
    )

  const mutation = useMutation({
    mutationFn: (values: DyeRequestFormValues) => createDyeRequest(values),
    onSuccess: async (request) => {
      await queryClient.invalidateQueries({ queryKey: ['dyeRequests'] })
      toast.success(`已建立 ${request.id}`)
      navigate(`/dye-request/${request.id}`)
    },
  })

  const parentId = watch('parentId')
  const dyeVendorId = watch('dyeVendorId')
  const productName = watch('productName')
  // 胚布編號依皇加品名自動帶出；自由輸入的全新品名查無主檔時留空
  const selectedProduct = resolveProduct(watch('productId'), productName)

  return (
    <div>
      <Link to="/dye-request" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回打色通知單列表
      </Link>

      <PageHeader
        title="新增打色通知單"
        formCode="表3"
        description="色卡（客戶＋皇加品名＋色號＋染整廠）全新配色時建單；與表4染整單為平行關係、無先後卡控。"
      />

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">單頭資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>來源包裝通知單</Label>
                <Select value={parentId} onValueChange={(v) => setValue('parentId', v, { shouldValidate: true })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="請選擇包裝通知單" />
                  </SelectTrigger>
                  <SelectContent>
                    {packingNotices.map((n) => (
                      <SelectItem key={n.id} value={n.id}>
                        {n.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.parentId && <p className="text-xs text-destructive">{errors.parentId.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>買方</Label>
                <Input value="皇加" disabled />
              </div>

              <div className="space-y-1.5">
                <Label>皇加品名</Label>
                <Combobox
                  value={selectedProduct ? productBranchLabel(selectedProduct) : productName}
                  onChange={(v) => {
                    // 下拉以「產品分支」為單位；同品名多個規格分支時，選定的分支決定帶出哪一組胚布編號
                    const matched = products.find((p) => productBranchLabel(p) === v) ?? products.find((p) => p.productName === v.trim())
                    setValue('productName', matched?.productName ?? v, { shouldValidate: true })
                    setValue('productId', matched?.id, { shouldValidate: true })
                  }}
                  options={products.map((p) => productBranchLabel(p))}
                  placeholder="輸入或搜尋品名"
                  emptyText="查無品項，可直接使用輸入內容"
                />
                {errors.productName && <p className="text-xs text-destructive">{errors.productName.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>胚布編號（唯讀，依皇加品名自動帶出）</Label>
                <Input value={selectedProduct?.greigeFabricCode ?? ''} disabled placeholder="請先選擇皇加品名" />
              </div>

              <div className="space-y-1.5">
                <Label>染整廠</Label>
                <Select value={dyeVendorId} onValueChange={(v) => setValue('dyeVendorId', v, { shouldValidate: true })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="請選擇染整廠" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors
                      .filter((v) => v.types.includes('染整廠'))
                      .map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                {errors.dyeVendorId && <p className="text-xs text-destructive">{errors.dyeVendorId.message}</p>}
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>備註</Label>
                <Textarea rows={2} placeholder="例：請安排打色，謝謝！色號太久重新覆色" {...register('note')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">色號清單（色樣編號由染廠提供，回填至染單）</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={appendColor}>
              <Plus className="mr-1 h-4 w-4" /> 新增顏色
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {errors.colors?.root && <p className="text-xs text-destructive">{errors.colors.root.message}</p>}
            {colors.map((_, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input {...register(`colors.${index}`)} placeholder="請輸入顏色" />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 text-destructive hover:text-destructive"
                  disabled={colors.length <= 1}
                  onClick={() => removeColor(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/dye-request')}>
            取消
          </Button>
          <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={isSubmitting || mutation.isPending}>
            {mutation.isPending ? '建立中...' : '建立打色通知單'}
          </Button>
        </div>
      </form>
    </div>
  )
}

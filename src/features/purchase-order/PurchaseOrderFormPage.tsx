import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import dayjs from 'dayjs'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/mocks/api'
import { vendorDisplayName } from '@/mocks/data'
import { createPurchaseOrder } from '@/mocks/mutations'
import { formatNumber, meterToYard } from '@/lib/units'
import { lookupColorSample } from '@/lib/colors'
import { ColorLookupBadge, ColorLookupLegend } from '@/components/shared/ColorLookupBadge'
import { purchaseOrderFormSchema, type PurchaseOrderFormValues } from './schema'

export function PurchaseOrderFormPage() {
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
  } = useForm<PurchaseOrderFormValues>({
    resolver: zodResolver(purchaseOrderFormSchema),
    defaultValues: {
      parentId: '',
      type: '胚布',
      hasDyeVendor: false,
      vendorId: '',
      dyeVendorId: '',
      dueDate: dayjs().add(14, 'day').format('YYYY-MM-DD'),
      note: '',
      itemUnitPrices: {},
    },
  })

  const mutation = useMutation({
    mutationFn: createPurchaseOrder,
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] })
      toast.success(`已建立 ${order.id}`)
      navigate(`/purchase-order/${order.id}`)
    },
  })

  const parentId = watch('parentId')
  const type = watch('type')
  const hasDyeVendor = watch('hasDyeVendor')
  const vendorId = watch('vendorId')
  const dyeVendorId = watch('dyeVendorId')
  const notice = packingNotices.find((n) => n.id === parentId)

  return (
    <div>
      <Link to="/purchase-order" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回訂購單列表
      </Link>

      <PageHeader
        title="新增訂購單"
        formCode="表2"
        description="成品／胚布分類登打；胚布可勾選是否委外染整，決定完成後走直接入庫或委外加工路徑。建立後即進入待簽回，2日內未簽回系統自動標記為已逾期，效果視同已確認。明細與燙金/彩條自動帶入來源包裝通知單。"
      />

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">單頭資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-4 text-sm text-muted-foreground">統一編號 16784675，抬頭：皇加布業有限公司</p>
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
                <Label>類型</Label>
                <Select
                  value={type}
                  onValueChange={(v) => {
                    setValue('type', v as '成品' | '胚布')
                    if (v !== '胚布') {
                      setValue('hasDyeVendor', false)
                      setValue('dyeVendorId', '')
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{type}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="成品">成品</SelectItem>
                    <SelectItem value="胚布">胚布</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {type === '胚布' && (
                <div className="flex items-center gap-2 pt-6">
                  <input
                    id="hasDyeVendor"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={hasDyeVendor ?? false}
                    onChange={(e) => {
                      setValue('hasDyeVendor', e.target.checked)
                      if (!e.target.checked) setValue('dyeVendorId', '')
                    }}
                  />
                  <Label htmlFor="hasDyeVendor" className="cursor-pointer font-normal">
                    是否填入染整廠商（勾選後完成訂購單將走委外染整路徑，而非直接入庫）
                  </Label>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>賣方（供應商／染整廠）</Label>
                <Select value={vendorId} onValueChange={(v) => setValue('vendorId', v, { shouldValidate: true })}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="請選擇廠商" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}（{v.types.join('、')}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.vendorId && <p className="text-xs text-destructive">{errors.vendorId.message}</p>}
              </div>

              {/* 染整廠與賣方各自獨立：可能跟A買胚布、送B染 */}
              {type === '胚布' && hasDyeVendor && (
                <div className="space-y-1.5">
                  <Label>染整廠（名稱＋廠點）</Label>
                  <Select value={dyeVendorId ?? ''} onValueChange={(v) => setValue('dyeVendorId', v, { shouldValidate: true })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="請選擇染整廠" />
                    </SelectTrigger>
                    <SelectContent>
                      {vendors
                        .filter((v) => v.types.includes('染整廠'))
                        .map((v) => (
                          <SelectItem key={v.id} value={v.id}>
                            {vendorDisplayName(v)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {errors.dyeVendorId && <p className="text-xs text-destructive">{errors.dyeVendorId.message}</p>}
                </div>
              )}

              <div className="space-y-1.5">
                <Label>交期</Label>
                <Input type="date" {...register('dueDate')} />
                {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>燙金（唯讀，帶入表1）</Label>
                <Input value={notice?.embossing.join('、') ?? ''} disabled placeholder="請先選擇包裝通知單" />
              </div>

              <div className="space-y-1.5">
                <Label>彩條（唯讀，帶入表1）</Label>
                <Input
                  value={notice ? (notice.colorRatio.mode === '客人指定' ? `客人指定：${notice.colorRatio.customText ?? ''}` : '空白') : ''}
                  disabled
                  placeholder="請先選擇包裝通知單"
                />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>備註</Label>
                <Textarea rows={3} {...register('note')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">明細（與表1包裝通知單1:1帶入，僅單價可編輯）</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="px-4">
              <ColorLookupLegend withVendor={Boolean(dyeVendorId)} />
            </div>
            {!notice ? (
              <p className="px-4 text-sm text-muted-foreground">請先選擇來源包裝通知單以帶入明細。</p>
            ) : (
              <div className="overflow-x-auto">
                <Table className="min-w-[44rem]">
                  <TableHeader>
                    <TableRow>
                      <TableHead>客戶品名</TableHead>
                      <TableHead>皇加品名</TableHead>
                      <TableHead>顏色</TableHead>
                      <TableHead>色號查詢</TableHead>
                      <TableHead className="text-right">Yard</TableHead>
                      <TableHead className="text-right">Meter</TableHead>
                      <TableHead>包裝方式</TableHead>
                      <TableHead className="text-right">定碼長度</TableHead>
                      <TableHead className="text-right">單價</TableHead>
                      <TableHead>備註</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {notice.items.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>{item.customerProductName}</TableCell>
                        <TableCell>{item.roricaProductName}</TableCell>
                        <TableCell>{item.color}</TableCell>
                        <TableCell>
                          {/* 選定染整廠後即為完整四鍵查詢：這裡就能看出這批顏色要不要打色 */}
                          <ColorLookupBadge
                            showMessage={false}
                            result={lookupColorSample({
                              products,
                              customerId: notice.customerId,
                              productId: item.productId,
                              productName: item.roricaProductName,
                              color: item.color,
                              dyeVendorId: dyeVendorId || undefined,
                              vendorNameOf: (vendorId) => vendorDisplayName(vendors.find((v) => v.id === vendorId)),
                            })}
                          />
                        </TableCell>
                        <TableCell className="text-right">{item.yard}</TableCell>
                        <TableCell className="text-right">{item.meter}</TableCell>
                        <TableCell>{item.packingMethod}</TableCell>
                        <TableCell className="text-right">
                          {item.fixedLengthMeter
                            ? `${formatNumber(item.fixedLengthMeter, 1)}M ／ ${formatNumber(meterToYard(item.fixedLengthMeter), 1)}Y`
                            : '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <Input
                            type="number"
                            step="0.1"
                            className="ml-auto w-24 text-right"
                            {...register(`itemUnitPrices.${item.id}`)}
                          />
                        </TableCell>
                        <TableCell className="text-muted-foreground">{item.note || '-'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/purchase-order')}>
            取消
          </Button>
          <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={isSubmitting || mutation.isPending || !notice}>
            {mutation.isPending ? '建立中...' : '建立訂購單'}
          </Button>
        </div>
      </form>
    </div>
  )
}

import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/mocks/api'
import { createDyeOrder } from '@/mocks/mutations'
import { getVendor, resolveProduct } from '@/mocks/data'
import { formatNumber, yardToMeter } from '@/lib/units'
import { defaultRollYard, rollYardUpperLimit } from '@/lib/workflow'
import { dyeOrderFormSchema, type DyeOrderFormValues } from './schema'

export function DyeOrderFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: api.products })
  const { data: dyeOrders = [] } = useQuery({ queryKey: ['dyeOrders'], queryFn: api.dyeOrders })

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DyeOrderFormValues>({
    resolver: zodResolver(dyeOrderFormSchema),
    defaultValues: {
      parentId: '',
      vendorId: '',
      dueDate: '',
      productName: '',
      internalContact: '',
      note: '',
      greigeFabricCode: '',
      shippingSampleQty: 0.5,
      unit: 'Yard',
      items: [],
    },
  })

  const parentId = watch('parentId')
  const vendorId = watch('vendorId')
  const unit = watch('unit')
  const items = watch('items')
  const notice = packingNotices.find((n) => n.id === parentId)
  // 有訂購單時，受託加工廠依訂購單選定的加工廠自動帶入且唯讀；「有胚」無訂購單情境才人工選擇
  const relatedPO = notice ? purchaseOrders.find((p) => p.parentId === notice.id && p.hasDyeVendor) : undefined
  const vendorLocked = Boolean(relatedPO?.vendorId)
  const dyeVendors = vendors.filter((v) => v.types.includes('染整廠'))
  // 對色標準：以既有染單曾用過的值作為模糊搜尋來源，亦可自由輸入新值
  const colorMatchOptions = Array.from(
    new Set(dyeOrders.flatMap((d) => d.items.map((i) => i.colorMatchStandard)).filter((v): v is string => Boolean(v))),
  )
  // 單卷碼數上限提示：依表1該筆明細的定碼長度與生產數量容許誤差動態計算
  const rollLimits = notice
    ? notice.items.map((i) => rollYardUpperLimit(i.fixedLengthMeter, notice.tolerance)).filter((v): v is number => v != null)
    : []
  const rollLimit = rollLimits.length > 0 ? Math.max(...rollLimits) : null

  useEffect(() => {
    if (!notice) return
    setValue(
      'items',
      notice.items.map((item) => {
        // 胚布材質／胚布規格／成品規格自商品資料主檔依皇加品名自動帶入，帶入後仍可修改
        const product = resolveProduct(item.productId, item.roricaProductName)
        return {
          color: item.color,
          sampleCode: '',
          noSampleCode: false,
          colorMatchStandard: '',
          // 單卷碼數＝該筆明細定碼長度換算的每卷碼數（非整批商品總數）
          rollYard: defaultRollYard(item.fixedLengthMeter) ?? undefined,
          // 胚布材質／胚布規格／成品規格依明細的產品分支自動帶入，唯讀不可改
          fabricMaterial: product?.material ?? '',
          fabricSpec: product?.greigeSpec ?? '',
          finishedSpec: product?.finishedSpec ?? '',
          unitPrice: undefined,
          pendingDyeQty: item.yard,
        }
      }),
    )
    setValue('productName', notice.items[0]?.roricaProductName ?? '')
    // 產品編號：歷史色號查詢與規格帶入皆優先以產品分支解析
    setValue('productId', notice.items[0]?.productId)
    const po = purchaseOrders.find((p) => p.parentId === notice.id && p.hasDyeVendor)
    setValue('dueDate', dayjs(po?.dueDate ?? dayjs().add(14, 'day')).format('YYYY-MM-DD'))
    if (po?.vendorId) setValue('vendorId', po.vendorId, { shouldValidate: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.id, products.length])

  const mutation = useMutation({
    mutationFn: (values: DyeOrderFormValues) =>
      createDyeOrder({ ...values, dueDate: dayjs(values.dueDate).toISOString() }),
    onSuccess: async (order) => {
      // 若明細色號查無歷史色號，系統會平行自動觸發表3打色通知單，一併刷新
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['dyeOrders'] }),
        queryClient.invalidateQueries({ queryKey: ['dyeRequests'] }),
      ])
      toast.success(`已建立 ${order.id}`)
      navigate(`/dye-order/${order.id}`)
    },
  })

  return (
    <div>
      <Link to="/dye-order" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回染整單列表
      </Link>

      <PageHeader
        title="新增染整單"
        formCode="表4"
        description="無色卡時亦可直接起單；委外加工廠可直接製作大貨樣；確認後，明細有指定加工方法者觸發表5二次加工單，其餘觸發表6入庫單。明細依表1包裝通知單明細1:1帶入。"
      />

      <form onSubmit={handleSubmit((values) => mutation.mutate(values))} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">單頭資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
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
                <Label>品名（唯讀，帶入表1）</Label>
                <Input value={watch('productName')} disabled placeholder="請先選擇包裝通知單" />
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

              <div className="space-y-1.5">
                <Label>交期（可手動修改）</Label>
                <Input type="date" {...register('dueDate')} />
                {errors.dueDate && <p className="text-xs text-destructive">{errors.dueDate.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>單位</Label>
                <Select value={unit} onValueChange={(v) => setValue('unit', v as 'Yard' | 'Meter')}>
                  <SelectTrigger className="w-full">
                    <SelectValue>{unit}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Yard">Yard</SelectItem>
                    <SelectItem value="Meter">Meter</SelectItem>
                  </SelectContent>
                </Select>
              </div>

            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">明細（依表1明細1:1帶入，逐色/逐批填寫加工資訊）</CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            {!notice ? (
              <p className="px-4 text-sm text-muted-foreground">請先選擇來源包裝通知單以帶入明細。</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>顏色</TableHead>
                      <TableHead>色樣編號</TableHead>
                      <TableHead>對色標準</TableHead>
                      <TableHead>單卷碼數</TableHead>
                      <TableHead>胚布材質</TableHead>
                      <TableHead>胚布規格</TableHead>
                      <TableHead>成品規格</TableHead>
                      <TableHead className="text-right">加工單價</TableHead>
                      <TableHead className="text-right">待染數量</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell className="whitespace-nowrap">{item.color}</TableCell>
                        <TableCell>
                          <Input
                            className="w-32"
                            {...register(`items.${index}.sampleCode`)}
                            disabled={item.noSampleCode}
                            placeholder={item.noSampleCode ? '不查色號' : '可留空'}
                          />
                          <label className="mt-1 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5"
                              checked={item.noSampleCode ?? false}
                              onChange={(e) => {
                                setValue(`items.${index}.noSampleCode`, e.target.checked)
                                if (e.target.checked) setValue(`items.${index}.sampleCode`, '')
                              }}
                            />
                            無色號
                          </label>
                        </TableCell>
                        <TableCell>
                          <Combobox
                            className="w-36"
                            value={item.colorMatchStandard ?? ''}
                            onChange={(v) => setValue(`items.${index}.colorMatchStandard`, v)}
                            options={colorMatchOptions}
                            placeholder="輸入或搜尋"
                            emptyText="查無紀錄，可直接使用輸入內容"
                          />
                        </TableCell>
                        <TableCell>
                          {/* 米數換算置於輸入框右側並保留固定寬度，避免出現/消失時推移輸入框位置 */}
                          <div className="flex items-center gap-1.5">
                            <Input type="number" min="0" className="w-20 text-right" {...register(`items.${index}.rollYard`)} />
                            <span className="w-16 shrink-0 text-left text-xs whitespace-nowrap text-muted-foreground">
                              {item.rollYard ? `≈ ${formatNumber(yardToMeter(Number(item.rollYard)), 1)} 米` : ''}
                            </span>
                          </div>
                        </TableCell>
                        {/* 胚布材質／胚布規格／成品規格：依明細的產品分支自動帶入，唯讀不可改，
                            要改請回商品資料主檔維護，避免同一分支的規格在各單據各存一份而不一致 */}
                        <TableCell>
                          <Input className="w-32" disabled {...register(`items.${index}.fabricMaterial`)} />
                        </TableCell>
                        <TableCell>
                          <Input className="w-24" disabled {...register(`items.${index}.fabricSpec`)} />
                        </TableCell>
                        <TableCell>
                          <Input className="w-24" disabled {...register(`items.${index}.finishedSpec`)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" step="0.1" className="w-20 text-right" {...register(`items.${index}.unitPrice`)} />
                        </TableCell>
                        <TableCell className="text-right">
                          <Input type="number" className="w-20 text-right" {...register(`items.${index}.pendingDyeQty`)} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {errors.items?.root && <p className="px-4 text-xs text-destructive">{errors.items.root.message}</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">備註</CardTitle>
          </CardHeader>
          <CardContent>
            {rollLimit != null && (
              <p className="mb-2 text-sm font-medium text-ink">
                單卷不可超過 {rollLimit} Y
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  （依表1定碼長度換算成碼後，加計生產數量容許誤差 {notice?.tolerance.mode} 上限）
                </span>
              </p>
            )}
            <Textarea rows={2} placeholder="例：厚染" {...register('note')} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">使用胚布</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>收布編號</Label>
                <Input {...register('greigeFabricCode')} placeholder="例：T3268305" />
              </div>
              <div className="space-y-1.5">
                <Label>待染數量合計（唯讀，各列加總）</Label>
                <Input disabled value={items.reduce((sum, item) => sum + (Number(item.pendingDyeQty) || 0), 0)} />
              </div>
              <div className="space-y-1.5">
                <Label>出貨檢樣</Label>
                <Input type="number" step="0.1" min="0" {...register('shippingSampleQty')} />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">受託加工廠資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>委外加工廠{vendorLocked && '（唯讀，依關聯訂購單選定的加工廠帶入）'}</Label>
                {vendorLocked ? (
                  <Input disabled value={getVendor(vendorId)?.name ?? ''} />
                ) : (
                  <Select value={vendorId} onValueChange={(v) => setValue('vendorId', v, { shouldValidate: true })}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="請選擇染整廠" />
                    </SelectTrigger>
                    <SelectContent>
                      {dyeVendors.map((v) => (
                        <SelectItem key={v.id} value={v.id}>
                          {v.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.vendorId && <p className="text-xs text-destructive">{errors.vendorId.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>地址（唯讀，自廠商主檔帶入）</Label>
                <Input disabled value={getVendor(vendorId)?.address ?? ''} placeholder="請先選擇委外加工廠" />
              </div>

              <div className="space-y-1.5">
                <Label>皇加聯絡窗口</Label>
                <Input {...register('internalContact')} placeholder="非必填" />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/dye-order')}>
            取消
          </Button>
          <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={isSubmitting || mutation.isPending || !notice}>
            {mutation.isPending ? '建立中...' : '建立染整單'}
          </Button>
        </div>
      </form>
    </div>
  )
}

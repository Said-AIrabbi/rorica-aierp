import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/mocks/api'
import { getCustomer } from '@/mocks/data'
import { createShippingOrder } from '@/mocks/mutations'
import { shippingOrderFormSchema, type ShippingOrderFormValues } from './schema'
import { formatNumber, yardToMeter } from '@/lib/units'
import { noticeItemRemainingYard, shippingItemNoticeId } from '@/lib/workflow'
import { GOODS_RECEIPT_PURPOSES } from '@/types'

export function ShippingOrderFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: fabricLabels = [] } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })
  const { data: shippingOrders = [] } = useQuery({ queryKey: ['shippingOrders'], queryFn: api.shippingOrders })

  /** 這一列在既有出貨單草稿上排了多少——新單填超過剩餘未排量時，差額從這些草稿移過來（決策163） */
  const inDrafts = (noticeId: string, itemId: string | undefined) =>
    shippingOrders
      .filter((o) => o.status === '草稿' && !o.sourceAbnormalId)
      .flatMap((o) => o.items.filter((line) => shippingItemNoticeId(o, line) === noticeId && line.sourceItemId === itemId))
      .reduce((sum, line) => sum + line.yard, 0)

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ShippingOrderFormValues>({
    resolver: zodResolver(shippingOrderFormSchema),
    defaultValues: {
      parentId: '',
      isSampleOrder: false,
      items: [{ customerProductName: '', roricaProductName: '', color: '', rollCodes: [], yard: 0, unitPrice: undefined, note: '' }],
      purpose: undefined,
    },
  })

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'items' })

  const mutation = useMutation({
    mutationFn: (values: ShippingOrderFormValues) => {
      const notice = packingNotices.find((n) => n.id === values.parentId)
      if (!notice) throw new Error('找不到來源包裝通知單')
      return createShippingOrder({ ...values, customerId: notice.customerId })
    },
    onError: (error: Error) => toast.error(error.message),
    onSuccess: async (order) => {
      await queryClient.invalidateQueries({ queryKey: ['shippingOrders'] })
      toast.success(
        order.removedDraftIds?.length
          ? `已建立 ${order.id}；${order.removedDraftIds.join('、')} 的明細已全數移入，該草稿已刪除`
          : `已建立 ${order.id}`,
      )
      navigate(`/shipping-order/${order.id}`)
    },
  })

  const parentId = watch('parentId')
  const isSampleOrder = watch('isSampleOrder')
  const selectedNotice = packingNotices.find((n) => n.id === parentId)
  const customer = selectedNotice ? getCustomer(selectedNotice.customerId) : undefined

  /**
   * 明細由包裝通知單直接帶入，可微調/刪除。
   * 數量預設帶剩餘未排量（決策163）；全都已排在草稿上時改帶草稿上的量——開新單就是要把這批貨移過來出。
   */
  function loadItemsFromNotice(id: string) {
    const notice = packingNotices.find((n) => n.id === id)
    if (!notice) return
    replace(
      notice.items.map((item) => ({
        sourceItemId: item.id,
        customerProductName: item.customerProductName,
        roricaProductName: item.roricaProductName,
        color: item.color,
        rollCodes: [],
        yard: noticeItemRemainingYard(notice.id, item, shippingOrders) || inDrafts(notice.id, item.id),
        unitPrice: undefined,
        note: item.note,
      })),
    )
  }

  return (
    <div>
      <Link to="/shipping-order" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回出貨單列表
      </Link>

      <PageHeader
        title="新增出貨單／樣品單"
        formCode="表8"
        description="有庫存路徑：直接由表1調撥；無庫存路徑：需等表6入庫單完成才可調撥。"
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
                <Select
                  value={parentId}
                  onValueChange={(v) => {
                    setValue('parentId', v, { shouldValidate: true })
                    loadItemsFromNotice(v)
                  }}
                >
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
                <Label>客戶（依包裝通知單自動帶入）</Label>
                <Input value={customer?.shortName ?? ''} disabled placeholder="請先選擇包裝通知單" />
              </div>

              <div className="flex items-center gap-2 pt-6">
                <input
                  id="isSampleOrder"
                  type="checkbox"
                  className="h-4 w-4 rounded border-input"
                  checked={isSampleOrder}
                  onChange={(e) => setValue('isSampleOrder', e.target.checked)}
                />
                <Label htmlFor="isSampleOrder" className="cursor-pointer">
                  樣品單（走一般出貨常規倉庫）
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label>用途</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  // 「請選擇」是空字串，要轉成未填——否則 enum 驗證不過，表單送不出去又沒有任何提示
                  {...register('purpose', { setValueAs: (v) => (v === '' ? undefined : v) })}
                >
                  <option value="">請選擇</option>
                  {GOODS_RECEIPT_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              出貨明細（由包裝通知單直接帶入，可微調/刪除；數量超過未排量時，差額自既有出貨單草稿移入）
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                append({ customerProductName: '', roricaProductName: '', color: '', rollCodes: [], yard: 0, unitPrice: undefined, note: '' })
              }
            >
              <Plus className="mr-1 h-4 w-4" /> 新增品項
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {errors.items?.root && <p className="text-xs text-destructive">{errors.items.root.message}</p>}
            {fields.map((field, index) => {
              const yard = watch(`items.${index}.yard`)
              const unitPrice = watch(`items.${index}.unitPrice`)
              const amount = yard && unitPrice ? yard * unitPrice : undefined
              const rollCodes = watch(`items.${index}.rollCodes`) ?? []
              return (
                <div key={field.id} className="grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-4">
                  <div className="space-y-1">
                    <Label className="text-xs">客戶品名</Label>
                    <Input {...register(`items.${index}.customerProductName`)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">皇加品名</Label>
                    <Input {...register(`items.${index}.roricaProductName`)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">色號</Label>
                    <Input {...register(`items.${index}.color`)} />
                  </div>
                  <div className="space-y-1">
                    {/* 一筆明細可對應多個捲號：拼接出貨時逐一加入，記錄實際使用的捲號組合。
                        非必填（決策162）：建立後由倉管填入，出貨完成前須補齊 */}
                    <Label className="text-xs">布卷條碼（非必填，可多選＝拼接組合）</Label>
                    <Select
                      value=""
                      onValueChange={(v) => {
                        if (rollCodes.includes(v)) return
                        setValue(`items.${index}.rollCodes`, [...rollCodes, v], { shouldValidate: true })
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={rollCodes.length > 0 ? `已選 ${rollCodes.length} 卷，可再加入` : '可留空，由倉管填入'} />
                      </SelectTrigger>
                      <SelectContent>
                        {fabricLabels
                          .filter((l) => l.status !== '已完成' && l.status !== '已終止')
                          .map((l) => (
                            <SelectItem key={l.id} value={l.rollCode}>
                              {l.rollCode}（{l.productName}／{l.color}）
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                    {rollCodes.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {rollCodes.map((code) => (
                          <button
                            key={code}
                            type="button"
                            className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-ink-body hover:border-destructive hover:text-destructive"
                            onClick={() =>
                              setValue(
                                `items.${index}.rollCodes`,
                                rollCodes.filter((c) => c !== code),
                                { shouldValidate: true },
                              )
                            }
                          >
                            {code} ×
                          </button>
                        ))}
                      </div>
                    )}
                    {errors.items?.[index]?.rollCodes && (
                      <p className="text-xs text-destructive">{errors.items[index]?.rollCodes?.message}</p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Yard</Label>
                    <Input type="number" step="1" {...register(`items.${index}.yard`)} />
                    {(() => {
                      const sourceItemId = watch(`items.${index}.sourceItemId`)
                      const noticeItem = selectedNotice?.items.find((i) => i.id === sourceItemId)
                      if (!selectedNotice || !noticeItem) return null
                      const remaining = noticeItemRemainingYard(selectedNotice.id, noticeItem, shippingOrders)
                      const drafted = inDrafts(selectedNotice.id, noticeItem.id)
                      return (
                        <p className="text-xs text-muted-foreground">
                          未排 {formatNumber(remaining, 0)}Y{drafted > 0 ? `／草稿已排 ${formatNumber(drafted, 0)}Y` : ''}
                        </p>
                      )
                    })()}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Meter（自動換算）</Label>
                    <Input value={yard ? formatNumber(yardToMeter(Number(yard)), 1) : ''} disabled placeholder="-" />
                  </div>
                  <div className="space-y-1">
                    {/* 幣別取自所選的表1（決策143）；建單後記在表8 身上 */}
                    <Label className="text-xs">售價 ({selectedNotice?.currency ?? 'NTD'}/Y)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="留空則帶入表1 單價"
                      {...register(`items.${index}.unitPrice`, {
                        setValueAs: (v) => (v === '' || v == null ? undefined : Number(v)),
                      })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">金額（自動計算）</Label>
                    <Input value={amount != null ? amount.toFixed(2) : ''} disabled placeholder="-" />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">備註</Label>
                    <Input {...register(`items.${index}.note`)} />
                  </div>
                  <div className="flex items-end gap-1.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 text-destructive hover:text-destructive"
                      disabled={fields.length <= 1}
                      onClick={() => remove(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/shipping-order')}>
            取消
          </Button>
          <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={isSubmitting || mutation.isPending}>
            {mutation.isPending ? '建立中...' : '建立出貨單'}
          </Button>
        </div>
      </form>
    </div>
  )
}

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/mocks/api'
import { getCustomer, vendorDisplayName } from '@/mocks/data'
import { createAbnormalNotice } from '@/mocks/mutations'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { ABNORMAL_CLAIM_MONTHS, isWithinAbnormalClaimWindow } from '@/lib/workflow'
import { ABNORMAL_CATEGORIES, type AbnormalCategoryName, type AbnormalHandling } from '@/types'
import { abnormalNoticeFormSchema, type AbnormalNoticeFormValues } from './schema'

export function AbnormalNoticeFormPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const { data: shippingOrders = [] } = useQuery({ queryKey: ['shippingOrders'], queryFn: api.shippingOrders })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })
  const { data: abnormalNotices = [] } = useQuery({ queryKey: ['abnormalNotices'], queryFn: api.abnormalNotices })

  // 由某張表9的「建立上游追討附單」進來時，帶著母單號與種類
  const presetParent = searchParams.get('parent') ?? undefined
  const presetKind = searchParams.get('kind') === '上游追討' ? '上游追討' : '客訴異常'
  const parentNotice = presetParent ? abnormalNotices.find((n) => n.id === presetParent) : undefined

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<AbnormalNoticeFormValues>({
    resolver: zodResolver(abnormalNoticeFormSchema),
    defaultValues: {
      kind: presetKind,
      parentAbnormalId: presetParent,
      shippingOrderId: parentNotice?.shippingOrderId ?? '',
      shippingOrderItemIndex: 0,
      abnormalQty: 0,
      categoryName: parentNotice?.categoryName,
      categoryItem: parentNotice?.categoryItem,
      issueNote: '',
      hasReturn: false,
      hasDeduction: presetKind === '上游追討',
      hasReplacement: false,
      hasOther: false,
    },
  })

  const values = watch()
  const source = shippingOrders.find((s) => s.id === values.shippingOrderId)
  const item = source?.items[Number(values.shippingOrderItemIndex) || 0]
  const customer = source ? getCustomer(source.customerId) : undefined
  const withinWindow = isWithinAbnormalClaimWindow(source?.shipDate)
  // 異常數量上限為原出貨數量（可等於）：即時擋在畫面上，不必等送出才由 mutation 丟錯
  const exceedsShipped = !!item && Number(values.abnormalQty) > item.yard
  const categoryItems =
    ABNORMAL_CATEGORIES.find((c) => c.name === values.categoryName)?.items ?? ([] as readonly string[])

  const mutation = useMutation({
    mutationFn: (v: AbnormalNoticeFormValues) => {
      const handling: AbnormalHandling = {}
      if (v.hasReturn) handling.returnGoods = { yard: Number(v.returnYard), feeEstimate: v.returnFeeEstimate || undefined }
      if (v.hasDeduction)
        handling.deduction = {
          amount: v.deductionAmount === undefined || Number.isNaN(v.deductionAmount) ? undefined : Number(v.deductionAmount),
          upstreamVendorId: v.deductionVendorId || undefined,
        }
      if (v.hasReplacement)
        handling.replacement = { yard: Number(v.replacementYard), freightEstimate: v.replacementFreightEstimate || undefined }
      if (v.hasOther) handling.other = { note: v.otherNote ?? '' }

      return createAbnormalNotice({
        kind: v.kind,
        parentAbnormalId: v.parentAbnormalId,
        shippingOrderId: v.shippingOrderId,
        shippingOrderItemIndex: Number(v.shippingOrderItemIndex) || 0,
        abnormalQty: Number(v.abnormalQty),
        categoryName: v.categoryName as AbnormalCategoryName | undefined,
        categoryItem: v.categoryItem || undefined,
        issueNote: v.issueNote,
        handling,
      })
    },
    onSuccess: async (notice) => {
      await queryClient.invalidateQueries({ queryKey: ['abnormalNotices'] })
      toast.success(`已受理 ${notice.id}`)
      navigate(`/abnormal-notice/${notice.id}`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <div>
      <Link to="/abnormal-notice" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回異常通知單列表
      </Link>

      <PageHeader
        title={values.kind === '上游追討' ? '新增上游追討附單' : '受理客訴（開立異常通知單）'}
        formCode={values.kind === '上游追討' ? '表9 附單' : '表9'}
        description={
          values.kind === '上游追討'
            ? '向染整廠／供應商追討退貨或退款的附單，欄位暫時與表9相同；上游廠商填於「扣款不退貨」的向廠商申請對象。'
            : '單號於受理當下自動產生（AB-YYYYMMDD-NNN），不繼承原出貨單的主號子序號。'
        }
      />

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">關聯來源（多為唯讀帶入，僅異常數量需人工填寫）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>來源出貨單（表8）</Label>
                <Select
                  value={values.shippingOrderId}
                  onValueChange={(v) => {
                    setValue('shippingOrderId', v, { shouldValidate: true })
                    setValue('shippingOrderItemIndex', 0)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="請選擇出貨單" />
                  </SelectTrigger>
                  <SelectContent>
                    {shippingOrders.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.id}（{formatDate(s.shipDate)}）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.shippingOrderId && <p className="text-xs text-destructive">{errors.shippingOrderId.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>異常品項</Label>
                <Select
                  value={String(values.shippingOrderItemIndex ?? 0)}
                  onValueChange={(v) => setValue('shippingOrderItemIndex', Number(v))}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="請先選擇出貨單" />
                  </SelectTrigger>
                  <SelectContent>
                    {(source?.items ?? []).map((it, i) => (
                      <SelectItem key={i} value={String(i)}>
                        {it.roricaProductName}／{it.color}（{formatNumber(it.yard, 1)} Y）
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>客戶（唯讀）</Label>
                <Input value={customer?.shortName ?? ''} disabled placeholder="依出貨單帶入" />
              </div>
              <div className="space-y-1.5">
                <Label>出貨日期（唯讀）</Label>
                <Input value={source ? formatDate(source.shipDate) : ''} disabled placeholder="-" />
              </div>
              <div className="space-y-1.5">
                <Label>皇加品名／顏色（唯讀）</Label>
                <Input value={item ? `${item.roricaProductName ?? ''}／${item.color ?? ''}` : ''} disabled placeholder="-" />
              </div>
              <div className="space-y-1.5">
                <Label>出貨數量（唯讀）</Label>
                <Input value={item ? `${formatNumber(item.yard, 1)} Y` : ''} disabled placeholder="-" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-destructive">異常數量（Y，可小於出貨數量＝部分退）</Label>
                {/* 上限為原出貨數量：退貨依實際碼數處理，退回的碼數不可能多於當初出的貨 */}
                <Input
                  type="number"
                  step="0.1"
                  min="0"
                  max={item?.yard}
                  className="border-destructive/50"
                  {...register('abnormalQty')}
                />
                {errors.abnormalQty && <p className="text-xs text-destructive">{errors.abnormalQty.message}</p>}
                {exceedsShipped && (
                  <p className="text-xs text-destructive">
                    異常數量不可大於原出貨數量 {formatNumber(item!.yard, 1)} Y
                  </p>
                )}
              </div>
            </div>

            {source && !withinWindow && values.kind === '客訴異常' && (
              <p className="mt-3 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                此出貨單出貨日為 {formatDate(source.shipDate)}，已逾 {ABNORMAL_CLAIM_MONTHS} 個月客訴受理期限，系統不受理。
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">異常問題</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>異常問題分類（大分類）</Label>
                <Select
                  value={values.categoryName ?? ''}
                  onValueChange={(v) => {
                    setValue('categoryName', v)
                    // 切換大分類時清空細項，避免殘留不屬於該分類的選項
                    setValue('categoryItem', undefined)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="請選擇" />
                  </SelectTrigger>
                  <SelectContent>
                    {ABNORMAL_CATEGORIES.map((c) => (
                      <SelectItem key={c.name} value={c.name}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                {/* 「其它」無細項、「交期問題」僅一項，故細項一律非必填 */}
                <Label>細項（依大分類連動；「其它」無細項）</Label>
                <Select
                  value={values.categoryItem ?? ''}
                  onValueChange={(v) => setValue('categoryItem', v)}
                  disabled={categoryItems.length === 0}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={categoryItems.length === 0 ? '此分類無細項' : '請選擇'} />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryItems.map((i) => (
                      <SelectItem key={i} value={i}>
                        {i}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>異常問題（自由文字，記錄事件經過）</Label>
                <Textarea rows={3} {...register('issueNote')} placeholder="如：6/12 安排出貨 1,097.6M，客戶反映手感不對太軟。" />
                {errors.issueNote && <p className="text-xs text-destructive">{errors.issueNote.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">處理方式（可複選，非單選；亦可留待生管回覆後再補）</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <HandlingBlock
              checked={values.hasReturn}
              onCheckedChange={(v) => setValue('hasReturn', v)}
              title="退貨"
              note="依實際碼數退貨，非整捲或整張出貨單"
            >
              <div className="space-y-1">
                <Label className="text-xs">退貨碼數 (Y)</Label>
                <Input type="number" step="0.1" {...register('returnYard')} />
                {errors.returnYard && <p className="text-xs text-destructive">{errors.returnYard.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">退貨費用估算</Label>
                <Input {...register('returnFeeEstimate')} placeholder="NT 9,000~10,000" />
              </div>
            </HandlingBlock>

            <HandlingBlock
              checked={values.hasDeduction}
              onCheckedChange={(v) => setValue('hasDeduction', v)}
              title="扣款不退貨"
              note="金額依異常程度，非全額；由生管以本單為基準向廠商申請"
            >
              <div className="space-y-1">
                <Label className="text-xs">扣款金額</Label>
                <Input type="number" step="1" {...register('deductionAmount')} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">向廠商申請對象</Label>
                <Select value={values.deductionVendorId ?? ''} onValueChange={(v) => setValue('deductionVendorId', v)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="選自廠商資料主檔" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {vendorDisplayName(v)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </HandlingBlock>

            <HandlingBlock
              checked={values.hasReplacement}
              onCheckedChange={(v) => setValue('hasReplacement', v)}
              title="補貨換貨"
              note="不另開換貨單：換貨＝本單＋新出貨單，新出貨單於明細頁建立並記錄來源表9單號"
            >
              <div className="space-y-1">
                <Label className="text-xs">補出碼數 (Y)</Label>
                <Input type="number" step="0.1" {...register('replacementYard')} />
                {errors.replacementYard && <p className="text-xs text-destructive">{errors.replacementYard.message}</p>}
              </div>
              <div className="space-y-1">
                <Label className="text-xs">運費估算</Label>
                <Input {...register('replacementFreightEstimate')} placeholder="NT 3,000~4,000（空運）" />
              </div>
            </HandlingBlock>

            <HandlingBlock
              checked={values.hasOther}
              onCheckedChange={(v) => setValue('hasOther', v)}
              title="其他補償"
              note="自由文字，如補空運費用"
            >
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">說明</Label>
                <Input {...register('otherNote')} />
                {errors.otherNote && <p className="text-xs text-destructive">{errors.otherNote.message}</p>}
              </div>
            </HandlingBlock>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/abnormal-notice')}>
            取消
          </Button>
          <Button
            type="submit"
            className="bg-brand hover:bg-brand-dark"
            disabled={mutation.isPending || exceedsShipped || (values.kind === '客訴異常' && !!source && !withinWindow)}
          >
            {mutation.isPending ? '建立中...' : '受理並建立'}
          </Button>
        </div>
      </form>
    </div>
  )
}

/** 處理方式區塊：勾選後才展開各自的子欄位，對應「可複選、非單選」的規則 */
function HandlingBlock({
  checked,
  onCheckedChange,
  title,
  note,
  children,
}: {
  checked: boolean
  onCheckedChange: (v: boolean) => void
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <label className="flex cursor-pointer items-start gap-2">
        <input type="checkbox" className="mt-1 h-4 w-4 rounded border-input" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
        <span>
          <span className="text-sm font-medium text-ink">{title}</span>
          <span className="block text-xs text-muted-foreground">{note}</span>
        </span>
      </label>
      {checked && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>}
    </div>
  )
}

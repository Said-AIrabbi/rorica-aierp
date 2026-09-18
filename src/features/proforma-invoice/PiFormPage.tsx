import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import { PageHeader } from '@/components/shared/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/mocks/api'
import { productBranchLabel, resolveProduct } from '@/mocks/data'
import { createProformaInvoice, updateProformaInvoice } from '@/mocks/mutations'
import { formatDate } from '@/lib/dates'
import { formatNumber, meterToYard, yardToMeter } from '@/lib/units'
import {
  PI_CURRENCY_SYMBOL,
  PI_PAYMENT_TERM_TEMPLATES,
  PI_TRADE_TERM_HINTS,
  piQuoteValidUntil,
} from '@/lib/pi'
import { PRINT_BANK_ACCOUNT } from '@/lib/print'
import { MarkingPreview, SmallMarkingPreview } from '@/features/packing-notice/MarkingPrint'
import {
  COLOR_RATIO_MAX,
  FIXED_ROLL_PACKING_METHODS,
  MARKING_SHAPES,
  PACKING_METHODS,
  PI_CURRENCIES,
  PI_LEAD_TIME_DAYS,
  PI_PORTS,
  PI_TRADE_TERMS,
  type PackingNoticeMarking,
} from '@/types'
import { piFormSchema, type PiFormValues } from './schema'

const EMPTY_ITEM: PiFormValues['items'][number] = {
  poNo: '',
  roricaProductName: '',
  customerProductName: '',
  color: '',
  yard: 0,
  unitPrice: 0,
  packingMethod: PACKING_METHODS[0],
  fixedLengthMeter: undefined,
  productId: undefined,
  colorRatios: [],
  note: '',
}

const EMPTY_MARKING: PiFormValues['markings'][number] = {
  shape: MARKING_SHAPES[0],
  headerText: '',
  destination: '',
  composition: '',
  origin: 'MADE IN TAIWAN',
  grossWeightKg: undefined,
  netWeightKg: undefined,
  hasSmallMarking: false,
  smallMarkingText: '',
}

/** 預覽用：表單值可能帶空字串與字串數字，轉成列印元件吃的型別 */
function previewMarking(value: PiFormValues['markings'][number] | undefined): PackingNoticeMarking {
  const num = (v: unknown) => (Number(v) > 0 ? Number(v) : undefined)
  return {
    shape: value?.shape ?? MARKING_SHAPES[0],
    headerText: value?.headerText,
    destination: value?.destination,
    composition: value?.composition,
    origin: value?.origin,
    grossWeightKg: num(value?.grossWeightKg),
    netWeightKg: num(value?.netWeightKg),
    hasSmallMarking: value?.hasSmallMarking ?? false,
    smallMarkingText: value?.smallMarkingText,
  }
}

export function PiFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: api.customers })
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: api.products })
  const { data: proformaInvoices = [] } = useQuery({ queryKey: ['proformaInvoices'], queryFn: api.proformaInvoices })
  const existing = isEdit ? proformaInvoices.find((pi) => pi.id === id) : undefined

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PiFormValues>({
    resolver: zodResolver(piFormSchema),
    defaultValues: {
      customerName: '',
      contactIndex: 0,
      currency: 'USD',
      tradeTerm: PI_TRADE_TERMS[1],
      tradeTermNote: '',
      portOfLoading: PI_PORTS[0],
      destination: '',
      leadTimeDays: PI_LEAD_TIME_DAYS[1],
      leadTimeNote: '',
      paymentTerm: PI_PAYMENT_TERM_TEMPLATES[0],
      paymentTermNote: '',
      itemUnit: 'Yard',
      items: [EMPTY_ITEM],
      markings: [EMPTY_MARKING],
    },
  })

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })
  const {
    fields: markingFields,
    append: appendMarking,
    remove: removeMarking,
  } = useFieldArray({ control, name: 'markings' })

  // 編輯既有草稿：資料抓到後才 reset，否則重新整理頁面會拿到空白預設值
  useEffect(() => {
    if (!existing) return
    reset({
      customerName: existing.customerName,
      contactIndex: existing.contactIndex ?? 0,
      currency: existing.currency,
      tradeTerm: existing.tradeTerm,
      tradeTermNote: existing.tradeTermNote ?? '',
      portOfLoading: existing.portOfLoading,
      destination: existing.destination ?? '',
      leadTimeDays: existing.leadTimeDays,
      leadTimeNote: existing.leadTimeNote ?? '',
      paymentTerm: existing.paymentTerm,
      paymentTermNote: existing.paymentTermNote ?? '',
      itemUnit: existing.itemUnit,
      items: existing.items.map((item) => ({
        poNo: item.poNo,
        roricaProductName: item.roricaProductName,
        customerProductName: item.customerProductName,
        productId: item.productId,
        color: item.color,
        yard: item.yard,
        unitPrice: item.unitPrice,
        packingMethod: item.packingMethod,
        fixedLengthMeter: item.fixedLengthMeter,
        colorRatios: item.colorRatios ?? [],
        note: item.note ?? '',
      })),
      markings: existing.markings.map((m) => ({ ...m, headerText: m.headerText ?? '' })),
    })
  }, [existing, reset])

  const values = watch()
  const itemUnit = values.itemUnit
  const matchedCustomer = customers.find(
    (c) => c.shortName === values.customerName?.trim() || c.fullNameCN === values.customerName?.trim(),
  )
  const contacts = matchedCustomer?.contacts ?? []
  const contactIndex = Number(values.contactIndex ?? 0)
  const selectedContact = contacts[contactIndex]

  // 數量一律以 Yard 存放；基準為 Meter 時輸入框顯示米數，離開欄位即換算回碼
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({})
  const resetDrafts = () => setQtyDraft({})
  const qtyValue = (index: number) => {
    const draft = qtyDraft[index]
    if (draft !== undefined) return draft
    const yard = Number(values.items?.[index]?.yard ?? 0)
    if (!yard) return ''
    return itemUnit === 'Yard' ? String(yard) : String(Number(yardToMeter(yard).toFixed(1)))
  }
  const onQtyChange = (index: number, raw: string) => {
    setQtyDraft((prev) => ({ ...prev, [index]: raw }))
    const parsed = Number(raw)
    const yard = !raw || !Number.isFinite(parsed) ? 0 : itemUnit === 'Yard' ? parsed : meterToYard(parsed)
    setValue(`items.${index}.yard`, Number(yard.toFixed(1)), { shouldValidate: true })
  }

  const totalAmount = (values.items ?? []).reduce(
    (sum, item) => sum + Number(item.unitPrice ?? 0) * Number(item.yard ?? 0),
    0,
  )

  const mutation = useMutation({
    mutationFn: (v: PiFormValues) => {
      const payload = {
        ...v,
        // schema 只驗得出「是這四個數字之一」，型別上仍是 number，於此收斂
        leadTimeDays: v.leadTimeDays as (typeof PI_LEAD_TIME_DAYS)[number],
        items: v.items.map((item) => ({
          ...item,
          customerProductName: item.customerProductName ?? '',
          fixedLengthMeter: FIXED_ROLL_PACKING_METHODS.includes(item.packingMethod) ? item.fixedLengthMeter : undefined,
        })),
        markings: v.markings.map((m) => ({ ...m })),
      }
      return isEdit && id ? updateProformaInvoice(id, payload) : createProformaInvoice(payload)
    },
    onSuccess: async (pi) => {
      await queryClient.invalidateQueries({ queryKey: ['proformaInvoices'] })
      toast.success(isEdit ? `已更新 ${pi.id}` : `已建立 ${pi.id}`)
      navigate(`/proforma-invoice/${pi.id}`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  return (
    <div>
      <Link
        to={isEdit ? `/proforma-invoice/${id}` : '/proforma-invoice'}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> {isEdit ? '返回 PI 單' : '返回 PI 單列表'}
      </Link>

      <PageHeader
        title={isEdit ? `編輯 PI 單 ${id}` : '新增 PI 單'}
        formCode="PI"
        description="報價有效期 14 天；建立後須經董事長批准才可發出，客戶回簽後依 PO 拆單轉為表1。"
      />

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">單頭資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>客戶</Label>
                <Combobox
                  value={values.customerName ?? ''}
                  onChange={(v) => {
                    setValue('customerName', v, { shouldValidate: true })
                    setValue('contactIndex', 0)
                  }}
                  // 已歇業客戶不給選（比照表1，決策51）
                  options={customers.filter((c) => c.status !== '已歇業').map((c) => c.shortName)}
                  placeholder="輸入或搜尋客戶"
                  emptyText="查無客戶主檔，PI 階段可先用輸入內容"
                />
                {errors.customerName && <p className="text-xs text-destructive">{errors.customerName.message}</p>}
                {!matchedCustomer && (values.customerName ?? '').trim() !== '' && (
                  <p className="text-xs text-warning">
                    查無此客戶主檔。PI 階段不建檔，待客戶回簽轉表1 時才自動建立主檔並給予編號（決策51）。
                  </p>
                )}
                {matchedCustomer?.status === '已歇業' && (
                  <p className="text-xs text-destructive">此客戶已歇業，不可開立新 PI。</p>
                )}
              </div>

              <div className="space-y-1.5">
                <Label>收貨人（限該客戶底下的聯絡人）</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={contactIndex}
                  onChange={(e) => setValue('contactIndex', Number(e.target.value))}
                  disabled={contacts.length === 0}
                >
                  {contacts.length === 0 ? (
                    <option value={0}>（請先選定已建檔的客戶）</option>
                  ) : (
                    contacts.map((c, i) => (
                      <option key={i} value={i}>
                        {i === 0 ? `${c.name}（主要聯絡人）` : c.name}
                      </option>
                    ))
                  )}
                </select>
                <p className="text-xs text-muted-foreground">
                  送第三方收貨時，請先於客戶主檔新增一組聯絡資訊承載（決策37）。
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>收貨地址（依收貨人自動帶出，隨轉換帶入表1／表8）</Label>
                <Input value={selectedContact?.shippingAddress ?? ''} disabled placeholder="請先選擇收貨人" />
              </div>

              <div className="space-y-1.5">
                <Label>幣別（一張 PI 僅能一種）</Label>
                <div className="flex flex-wrap gap-3">
                  {PI_CURRENCIES.map((c) => (
                    <label key={c} className="flex items-center gap-1.5 text-sm font-normal">
                      <input
                        type="radio"
                        className="h-4 w-4"
                        checked={values.currency === c}
                        onChange={() => setValue('currency', c, { shouldValidate: true })}
                      />
                      {c}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">
                  主檔牌價以 NTD 為主，外幣僅作簡易匯率參照、不入帳（決策41）。
                </p>
              </div>

              <div className="space-y-1.5">
                <Label>貿易條件</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...register('tradeTerm')}
                >
                  {PI_TRADE_TERMS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                      {PI_TRADE_TERM_HINTS[t] ? `（${PI_TRADE_TERM_HINTS[t]}）` : ''}
                    </option>
                  ))}
                </select>
                <Input {...register('tradeTermNote')} placeholder="備註（非必填）" />
              </div>

              <div className="space-y-1.5">
                <Label>起運地 / 目的地</Label>
                <div className="flex gap-1.5">
                  <select
                    className="h-9 w-32 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                    {...register('portOfLoading')}
                  >
                    {PI_PORTS.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                  <Input {...register('destination')} placeholder="目的地（自由輸入）" />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>交期（下定到出貨）</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...register('leadTimeDays')}
                >
                  {PI_LEAD_TIME_DAYS.map((d) => (
                    <option key={d} value={d}>
                      {d} 天
                    </option>
                  ))}
                </select>
                <Input {...register('leadTimeNote')} placeholder="備註（非必填）" />
                <p className="text-xs text-muted-foreground">
                  應出貨日＝第一張表1「生效日」＋交期天數，全批共用同一到期日（決策36）。
                </p>
              </div>

              <div className="space-y-1.5 lg:col-span-2">
                <Label>付款條件</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={values.paymentTerm}
                  onChange={(e) => setValue('paymentTerm', e.target.value, { shouldValidate: true })}
                >
                  {PI_PAYMENT_TERM_TEMPLATES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                  {/* 選用後可自行修改，故下方另給可編輯欄位；改過的內容也留在此選單中 */}
                  {!PI_PAYMENT_TERM_TEMPLATES.includes(
                    values.paymentTerm as (typeof PI_PAYMENT_TERM_TEMPLATES)[number],
                  ) && <option value={values.paymentTerm}>{values.paymentTerm}（已自行修改）</option>}
                </select>
                <Input
                  value={values.paymentTerm}
                  onChange={(e) => setValue('paymentTerm', e.target.value, { shouldValidate: true })}
                  placeholder="可直接修改，如填入 30% / 70% 的百分比"
                />
                <Input {...register('paymentTermNote')} placeholder="備註（非必填）" />
                {errors.paymentTerm && <p className="text-xs text-destructive">{errors.paymentTerm.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>報價有效期限（建單日 +14 天）</Label>
                <Input
                  value={formatDate(existing ? existing.quoteValidUntil : piQuoteValidUntil(dayjs()))}
                  disabled
                />
              </div>

              <div className="space-y-1.5 lg:col-span-2">
                <Label>銀行帳戶（皇加收款帳戶，固定列印於 PI）</Label>
                <Input
                  value={`${PRINT_BANK_ACCOUNT.bankName}（${PRINT_BANK_ACCOUNT.bankCode}）　${PRINT_BANK_ACCOUNT.accountNo}`}
                  disabled
                />
              </div>

              <div className="space-y-1.5">
                <Label>估算 CBM</Label>
                <Input value="計算公式待皇加提供" disabled />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">明細</CardTitle>
            <div className="flex items-center gap-3">
              {/* 單位切換一次套用整個區塊；資料一律以 Yard 存放（決策7） */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">單位</span>
                <div className="inline-flex overflow-hidden rounded-md border border-input">
                  {(['Yard', 'Meter'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => {
                        setValue('itemUnit', unit)
                        resetDrafts()
                      }}
                      className={
                        itemUnit === unit
                          ? 'bg-brand px-3 py-1 text-xs font-medium text-white'
                          : 'bg-background px-3 py-1 text-xs text-muted-foreground hover:bg-muted'
                      }
                    >
                      {unit}
                    </button>
                  ))}
                </div>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  append(EMPTY_ITEM)
                  resetDrafts()
                }}
              >
                <Plus className="mr-1 h-4 w-4" /> 新增品項
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {errors.items?.root && <p className="text-xs text-destructive">{errors.items.root.message}</p>}
            {fields.map((field, index) => {
              const item = values.items?.[index]
              const product = resolveProduct(item?.productId, item?.roricaProductName)
              const colorRatios = item?.colorRatios ?? []
              return (
                <div key={field.id} className="rounded-lg border border-border p-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">PO NO.（拆單以此為界）</Label>
                      <Input {...register(`items.${index}.poNo`)} placeholder="例：N21103" />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">皇加品名（ITEM NO.）</Label>
                      <Combobox
                        value={product ? productBranchLabel(product) : (item?.roricaProductName ?? '')}
                        onChange={(v) => {
                          const matched =
                            products.find((p) => productBranchLabel(p) === v) ??
                            products.find((p) => p.productName === v.trim())
                          setValue(`items.${index}.roricaProductName`, matched?.productName ?? v, {
                            shouldValidate: true,
                          })
                          setValue(`items.${index}.productId`, matched?.id)
                          // 客戶品名與規格皆由商品主檔帶出，不再人工輸入規格字串（決策9、10）
                          setValue(`items.${index}.customerProductName`, matched?.customerProductName ?? '')
                        }}
                        options={products.map((p) => productBranchLabel(p))}
                        placeholder="輸入或搜尋品名"
                        emptyText="查無品項，可直接使用輸入內容"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">客戶品名（主檔帶出）</Label>
                      <Input value={item?.customerProductName ?? ''} disabled />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">顏色</Label>
                      <Input {...register(`items.${index}.color`)} placeholder="例：WHITE" />
                    </div>

                    <div className="space-y-1 lg:col-span-2">
                      <Label className="text-xs">規格（成分／幅寬／碼重，皆由商品主檔帶出）</Label>
                      <Input
                        value={
                          product
                            ? [product.material, product.widthSpec, product.weightGY ? `${product.weightGY}G/Y` : '']
                                .filter(Boolean)
                                .join('　')
                            : ''
                        }
                        disabled
                        placeholder="請先選擇皇加品名"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">數量（{itemUnit}）</Label>
                      <Input
                        type="number"
                        step={itemUnit === 'Yard' ? '1' : '0.1'}
                        value={qtyValue(index)}
                        onChange={(e) => onQtyChange(index, e.target.value)}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {itemUnit === 'Yard'
                          ? `≈ ${formatNumber(yardToMeter(Number(item?.yard ?? 0)), 1)} 米`
                          : `≈ ${formatNumber(Number(item?.yard ?? 0), 1)} 碼`}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">單價（{PI_CURRENCY_SYMBOL[values.currency]}／碼）</Label>
                      <Input type="number" step="0.01" {...register(`items.${index}.unitPrice`)} />
                      <p className="text-[11px] text-muted-foreground">
                        金額 {formatNumber(Number(item?.unitPrice ?? 0) * Number(item?.yard ?? 0), 2)}
                      </p>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">包裝方式</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        {...register(`items.${index}.packingMethod`)}
                      >
                        {PACKING_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* 定碼ROLL 才展開定碼長度，比照表1（決策53） */}
                    {FIXED_ROLL_PACKING_METHODS.includes(item?.packingMethod ?? PACKING_METHODS[0]) && (
                      <div className="space-y-1">
                        <Label className="text-xs">定碼長度（米）</Label>
                        <Input type="number" step="0.1" {...register(`items.${index}.fixedLengthMeter`)} />
                        <p className="text-[11px] text-muted-foreground">
                          ≈ {formatNumber(meterToYard(Number(item?.fixedLengthMeter ?? 0)), 1)} 碼
                        </p>
                      </div>
                    )}

                    <div className="space-y-1 lg:col-span-2">
                      <Label className="text-xs">彩條（最多 {COLOR_RATIO_MAX} 組）</Label>
                      <div className="space-y-1.5">
                        {colorRatios.map((_, ri) => (
                          <div key={ri} className="flex gap-1.5">
                            <Input
                              {...register(`items.${index}.colorRatios.${ri}`)}
                              placeholder={`客人指定${ri + 1}`}
                            />
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="shrink-0 text-destructive hover:text-destructive"
                              onClick={() =>
                                setValue(
                                  `items.${index}.colorRatios`,
                                  colorRatios.filter((_, x) => x !== ri),
                                )
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        {colorRatios.length < COLOR_RATIO_MAX && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setValue(`items.${index}.colorRatios`, [...colorRatios, ''])}
                          >
                            <Plus className="mr-1 h-3.5 w-3.5" /> 新增彩條
                          </Button>
                        )}
                      </div>
                    </div>

                    <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                      <Label className="text-xs">明細備註</Label>
                      <div className="flex gap-1.5">
                        <Input {...register(`items.${index}.note`)} placeholder="非必填" />
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive hover:text-destructive"
                          disabled={fields.length <= 1}
                          onClick={() => {
                            remove(index)
                            resetDrafts()
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            <div className="text-right text-sm font-medium text-ink">
              總金額 {PI_CURRENCY_SYMBOL[values.currency]} {formatNumber(totalAmount, 2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">嘜頭（SHIPPING MARKS，與表1 為同一組資料）</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => appendMarking(EMPTY_MARKING)}>
              <Plus className="mr-1 h-4 w-4" /> 新增嘜頭
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-xs text-muted-foreground">
              轉換時每張表1 都會帶入全部嘜頭；表1 端可刪減、不可新增（決策52）。
            </p>
            {markingFields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-border p-3">
                <div className="flex flex-col gap-4 lg:flex-row">
                  <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">形狀</Label>
                      <select
                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                        {...register(`markings.${index}.shape`)}
                      >
                        {MARKING_SHAPES.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">運送目的地</Label>
                      <Input {...register(`markings.${index}.destination`)} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs">抬頭文字</Label>
                      <Textarea rows={2} {...register(`markings.${index}.headerText`)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">毛重 G.W（KG）</Label>
                      <Input type="number" step="0.1" {...register(`markings.${index}.grossWeightKg`)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">淨重 N.W（KG）</Label>
                      <Input type="number" step="0.1" {...register(`markings.${index}.netWeightKg`)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">成分</Label>
                      <Input {...register(`markings.${index}.composition`)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">產地</Label>
                      <Input {...register(`markings.${index}.origin`)} />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <label className="flex items-center gap-1.5 text-sm font-normal">
                        <input type="checkbox" className="h-4 w-4" {...register(`markings.${index}.hasSmallMarking`)} />
                        小嘜頭加印
                      </label>
                      {values.markings?.[index]?.hasSmallMarking && (
                        <Textarea
                          rows={3}
                          placeholder={'一行一項，如：\n100% NYLON'}
                          {...register(`markings.${index}.smallMarkingText`)}
                        />
                      )}
                    </div>
                  </div>

                  {/* 預覽與列印共用同一份版面元件，所見即所印 */}
                  <div className="flex shrink-0 flex-col items-center gap-2">
                    <MarkingPreview marking={previewMarking(values.markings?.[index])} />
                    {values.markings?.[index]?.hasSmallMarking && (
                      <SmallMarkingPreview marking={previewMarking(values.markings?.[index])} />
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      disabled={markingFields.length <= 1}
                      onClick={() => removeMarking(index)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" /> 刪除這組
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate('/proforma-invoice')}>
            取消
          </Button>
          <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={isSubmitting || mutation.isPending}>
            {mutation.isPending ? '儲存中...' : isEdit ? '儲存草稿' : '建立 PI 單'}
          </Button>
        </div>
      </form>
    </div>
  )
}

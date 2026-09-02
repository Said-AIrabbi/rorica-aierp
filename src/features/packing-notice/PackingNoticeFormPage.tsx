import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useFieldArray, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Lock, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import dayjs from 'dayjs'
import { PageHeader } from '@/components/shared/PageHeader'
import { ConcurrentEditNotice } from '@/components/shared/ConcurrentEditNotice'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Combobox } from '@/components/ui/combobox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/mocks/api'
import { productBranchLabel, resolveProduct, vendorDisplayName } from '@/mocks/data'
import { createPackingNotice, updatePackingNotice } from '@/mocks/mutations'
import { packingNoticeFormSchema, type PackingNoticeFormValues } from './schema'
import {
  COLOR_RATIO_MODES,
  EMBOSSING_OPTIONS,
  FIXED_ROLL_PACKING_METHODS,
  LABEL_TYPES,
  MARKING_SHAPES,
  PACKAGING_TYPES,
  PACKING_METHODS,
  PROCESSING_METHODS,
  SHIP_METHODS,
  TOLERANCE_MODES,
  type ProcessingMethod,
} from '@/types'
import { freezeDate, isPackingNoticeEditable } from '@/lib/workflow'
import { formatDate } from '@/lib/dates'
import { formatNumber, meterToYard, yardToMeter } from '@/lib/units'
import { lookupColorSample } from '@/lib/colors'
import { ColorLookupBadge, ColorLookupLegend } from '@/components/shared/ColorLookupBadge'

function itemErrorMessages(itemErrors: Record<string, unknown> | undefined): string[] {
  if (!itemErrors) return []
  return Object.values(itemErrors)
    .map((e) => (e && typeof e === 'object' && 'message' in e ? String((e as { message?: unknown }).message ?? '') : ''))
    .filter(Boolean)
}

const EMPTY_ITEM: PackingNoticeFormValues['items'][number] = {
  customerProductName: '',
  roricaProductName: '',
  color: '',
  yard: 0,
  packingMethod: PACKING_METHODS[0],
  fixedLengthMeter: undefined,
  productId: undefined,
  processingMethod: '',
  processingMethodNote: '',
  note: '',
}

export function PackingNoticeFormPage() {
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: notices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: customers = [] } = useQuery({ queryKey: ['customers'], queryFn: api.customers })
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: api.products })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })
  const existing = isEdit ? notices.find((n) => n.id === id) : undefined

  const {
    register,
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PackingNoticeFormValues>({
    resolver: zodResolver(packingNoticeFormSchema),
    defaultValues: {
      customerName: '',
      customerOrderNo: '',
      expectedDeliveryAt: dayjs().add(14, 'day').format('YYYY-MM-DD'),
      sampleQty: 0,
      shipMethod: [SHIP_METHODS[0]],
      shipMethodNote: '',
      colorRatio: { mode: COLOR_RATIO_MODES[0], customText: '' },
      labelTypes: [...LABEL_TYPES],
      packagingType: PACKAGING_TYPES[0],
      tolerance: { mode: TOLERANCE_MODES[0], customText: '' },
      items: [EMPTY_ITEM],
      allowSplicing: false,
      embossing: [],
      edgeCut: false,
      marking: {
        shape: MARKING_SHAPES[0],
        destination: '',
        grossWeightKg: undefined,
        netWeightKg: undefined,
        composition: '',
        origin: '',
        hasSmallMarking: false,
        smallMarkingText: '',
      },
    },
    // 編輯模式下，包裝通知單資料透過非同步查詢取得；用 `values`（而非手動 reset）
    // 讓 RHF 在資料到位後自動同步表單，這是官方建議處理「非同步預設值」的方式。
    values: existing
      ? {
          customerName: customers.find((c) => c.id === existing.customerId)?.shortName ?? '',
          customerOrderNo: existing.customerOrderNo,
          expectedDeliveryAt: dayjs(existing.expectedDeliveryAt).format('YYYY-MM-DD'),
          sampleQty: existing.sampleQty,
          shipMethod: existing.shipMethod,
          shipMethodNote: existing.shipMethodNote ?? '',
          colorRatio: existing.colorRatio,
          labelTypes: existing.labelTypes,
          packagingType: existing.packagingType,
          tolerance: existing.tolerance,
          items: existing.items.map((item) => ({
            customerProductName: item.customerProductName,
            roricaProductName: item.roricaProductName,
            productId: item.productId,
            color: item.color,
            yard: item.yard,
            packingMethod: item.packingMethod,
            fixedLengthMeter: item.fixedLengthMeter,
            processingMethod: item.processingMethod ?? '',
            processingMethodNote: item.processingMethodNote ?? '',
            note: item.note,
          })),
          allowSplicing: existing.allowSplicing,
          marking: existing.marking,
          embossing: existing.embossing.filter((o) => o !== '否'),
          edgeCut: existing.edgeCut,
        }
      : undefined,
  })

  const shipMethodValues = watch('shipMethod') ?? []
  const colorRatioMode = watch('colorRatio.mode')
  const toleranceMode = watch('tolerance.mode')
  const embossingValues = watch('embossing') ?? []
  const labelTypeValues = watch('labelTypes') ?? []
  const itemValues = watch('items') ?? []
  const customerNameValue = watch('customerName')

  const { fields, append, remove } = useFieldArray({ control, name: 'items' })

  /**
   * 明細區塊的輸入單位：Yard／Meter 切換一次即套用到所有品項，不逐列各自設定。
   * 資料一律以 Yard 存放商品總數、以 Meter 存放定碼長度（沿用原資料模型），
   * 此處僅切換輸入與顯示的單位，切換時即時換算既有數值。
   */
  const [itemUnit, setItemUnit] = useState<'Yard' | 'Meter'>('Yard')
  // 編輯既有單據時，以當初建單的基準開啟，避免以 Yard 顯示一張當初用 Meter 下的單
  useEffect(() => {
    if (existing?.itemUnit) setItemUnit(existing.itemUnit)
  }, [existing?.itemUnit])
  // 輸入過程中保留使用者原始鍵入的字串，避免換算後的小數位在打字途中被四捨五入回寫
  const [qtyDraft, setQtyDraft] = useState<Record<number, string>>({})
  const [fixedDraft, setFixedDraft] = useState<Record<number, string>>({})
  const resetDrafts = () => {
    setQtyDraft({})
    setFixedDraft({})
  }

  function displayQty(index: number): string {
    const draft = qtyDraft[index]
    if (draft !== undefined) return draft
    const yard = itemValues[index]?.yard
    if (!yard) return yard === 0 ? '0' : ''
    return itemUnit === 'Yard' ? String(yard) : String(Number(yardToMeter(yard).toFixed(1)))
  }

  function changeQty(index: number, raw: string) {
    setQtyDraft((prev) => ({ ...prev, [index]: raw }))
    const parsed = Number(raw)
    const yard = !raw || !Number.isFinite(parsed) ? 0 : itemUnit === 'Yard' ? parsed : meterToYard(parsed)
    setValue(`items.${index}.yard`, Number(yard.toFixed(2)), { shouldValidate: true })
  }

  function displayFixedLength(index: number): string {
    const draft = fixedDraft[index]
    if (draft !== undefined) return draft
    const meter = itemValues[index]?.fixedLengthMeter
    if (!meter) return ''
    return itemUnit === 'Meter' ? String(meter) : String(Number(meterToYard(meter).toFixed(1)))
  }

  function changeProcessingMethod(index: number, method: ProcessingMethod | '') {
    if (method === itemValues[index]?.processingMethod) return
    setValue(`items.${index}.processingMethod`, method, { shouldValidate: true })
    // 說明文字專屬於當下選定的加工方法；換一種加工（或改回「不指定」）即清空，
    // 避免「直條褶1.5cm」這類說明被留在「上膠」底下、隨明細帶到表2給廠商看
    setValue(`items.${index}.processingMethodNote`, '', { shouldValidate: true })
  }

  function changeFixedLength(index: number, raw: string) {
    setFixedDraft((prev) => ({ ...prev, [index]: raw }))
    const parsed = Number(raw)
    const meter = !raw || !Number.isFinite(parsed) ? 0 : itemUnit === 'Meter' ? parsed : yardToMeter(parsed)
    setValue(`items.${index}.fixedLengthMeter`, Number(meter.toFixed(2)), { shouldValidate: true })
  }

  // 皇加品名下拉選項：連結產品主檔；客戶欄位比對得到現有客戶時，優先只顯示該客戶的品項
  /**
   * 色號查詢：表1 這個階段還沒指定染整廠（要到表2 才選），故只能以「客戶＋品名＋顏色」三鍵查，
   * 結果可能是「視染整廠而定」。提前顯示是為了讓業務／生管在建單當下就知道
   * 這個顏色之後會不會需要開表3 打色，而不是等開染單才發現。
   */
  const vendorNameOf = (vendorId: string) => vendorDisplayName(vendors.find((v) => v.id === vendorId))
  function colorLookupFor(index: number) {
    const item = itemValues[index]
    return lookupColorSample({
      products,
      customerId: matchedCustomer?.id,
      productId: item?.productId,
      productName: item?.roricaProductName,
      color: item?.color,
      vendorNameOf,
    })
  }

  const matchedCustomer = customers.find(
    (c) => c.shortName === customerNameValue?.trim() || c.fullNameCN === customerNameValue?.trim(),
  )
  const productOptions = matchedCustomer ? products.filter((p) => p.customerId === matchedCustomer.id) : products

  /**
   * 皇加品名下拉選項：以「產品分支」為單位，同品名有多個規格分支時附上序號與關鍵規格，
   * 讓使用者選到的是特定分支而非只有品名——下游的規格帶入、條碼、庫存比對都依此分支。
   */
  const productBranchOptions = productOptions.map((p) => productBranchLabel(p))
  const productByBranchLabel = new Map(productOptions.map((p) => [productBranchLabel(p), p]))

  /** 已選定分支時顯示分支標籤，否則顯示使用者自行輸入的品名 */
  function branchDisplayValue(index: number): string {
    const item = itemValues[index]
    const product = item?.productId ? products.find((p) => p.id === item.productId) : undefined
    return product ? productBranchLabel(product) : (item?.roricaProductName ?? '')
  }

  function selectProductBranch(index: number, label: string) {
    const matched = productByBranchLabel.get(label) ?? products.find((p) => p.productName === label.trim())
    setValue(`items.${index}.roricaProductName`, matched?.productName ?? label, { shouldValidate: true })
    // 查無主檔時視為全新品項：清掉產品編號，下游改以品名比對
    setValue(`items.${index}.productId`, matched?.id, { shouldValidate: true })
    // 客戶品名於商品資料主檔與皇加品名一對一對應，選定分支即帶出；查無主檔時保留手動輸入內容
    if (matched) setValue(`items.${index}.customerProductName`, matched.customerProductName, { shouldValidate: true })
  }

  // 顏色下拉選項：依該列已選的產品分支帶出其歷史顏色清單；尚未選定則列出全品項顏色供參考
  function colorOptionsFor(index: number): string[] {
    const item = itemValues[index]
    const matched = resolveProduct(item?.productId, item?.roricaProductName)
    if (matched) return matched.colors.map((c) => c.color)
    return Array.from(new Set(products.flatMap((p) => p.colors.map((c) => c.color))))
  }

  const mutation = useMutation({
    mutationFn: async (values: PackingNoticeFormValues) => {
      const payload = {
        ...values,
        itemUnit,
        expectedDeliveryAt: dayjs(values.expectedDeliveryAt).toISOString(),
        // 燙金非必填：未勾選任何項目時預設為「否」
        embossing: values.embossing.length > 0 ? values.embossing : (['否'] as PackingNoticeFormValues['embossing']),
        // 加工方法的「不指定」在畫面上是空字串，存檔時轉回 undefined；未指定加工則不留說明
        items: values.items.map((item) => ({
          ...item,
          processingMethod: item.processingMethod || undefined,
          processingMethodNote: item.processingMethod ? item.processingMethodNote : undefined,
        })),
      }
      return isEdit && id ? updatePackingNotice(id, payload) : createPackingNotice(payload)
    },
    onSuccess: async (notice) => {
      // 建立包裝通知單可能同時自動建立新客戶主檔、觸發庫存預留、表8出貨單草稿、表2訂購單草稿，一併刷新才能立即在跳轉後的畫面看到完整連動結果
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['packingNotices'] }),
        queryClient.invalidateQueries({ queryKey: ['customers'] }),
        queryClient.invalidateQueries({ queryKey: ['stockReservations'] }),
        queryClient.invalidateQueries({ queryKey: ['shippingOrders'] }),
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] }),
      ])
      toast.success(isEdit ? `已儲存 ${notice.id}` : `已建立 ${notice.id}`)
      navigate(`/packing-notice/${notice.id}`)
    },
  })

  const noticeEditable = existing ? isPackingNoticeEditable(existing) : true

  if (isEdit && !existing) {
    return <div className="text-sm text-muted-foreground">找不到單號 {id} 的包裝通知單。</div>
  }

  if (isEdit && existing && !noticeEditable) {
    return (
      <div>
        <Link
          to={`/packing-notice/${id}`}
          className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" /> 返回單據詳情
        </Link>
        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {id} 已於 {formatDate(freezeDate(existing.effectiveAt))} 自動凍結（自生效日起算滿 7 個工作天；草稿狀態尚未生效不受此限），不再提供修改。
          </span>
        </div>
      </div>
    )
  }

  return (
    <div>
      <Link
        to={isEdit ? `/packing-notice/${id}` : '/packing-notice'}
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> {isEdit ? '返回單據詳情' : '返回包裝通知單列表'}
      </Link>

      <PageHeader
        title={isEdit ? `編輯 ${id}` : '新增包裝通知單'}
        formCode="表1"
        description="流程起點：客戶訂單建立主單號（ORD-YYYYMMDD-NNN），後續各表以此貫穿。"
      />

      {isEdit && <ConcurrentEditNotice />}

      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        className="space-y-4"
      >
        <Card>
          <CardHeader>
            <CardTitle className="text-base">單頭資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>客戶</Label>
                <Combobox
                  value={customerNameValue}
                  onChange={(v) => setValue('customerName', v, { shouldValidate: true })}
                  options={customers.map((c) => c.shortName)}
                  placeholder="輸入或搜尋客戶，全新客戶將於建立單據時自動建檔"
                  emptyText="查無客戶，可直接使用輸入內容建立新客戶"
                />
                {errors.customerName && <p className="text-xs text-destructive">{errors.customerName.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>客戶訂單號</Label>
                <Input {...register('customerOrderNo')} placeholder="例：C001-62028" />
                {errors.customerOrderNo && <p className="text-xs text-destructive">{errors.customerOrderNo.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>出貨日期</Label>
                <Input type="date" {...register('expectedDeliveryAt')} />
                {errors.expectedDeliveryAt && <p className="text-xs text-destructive">{errors.expectedDeliveryAt.message}</p>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">明細</CardTitle>
            <div className="flex items-center gap-3">
              {/* 單位切換：一次套用到明細區塊所有品項，非逐列設定 */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">單位</span>
                <div className="inline-flex overflow-hidden rounded-md border border-input">
                  {(['Yard', 'Meter'] as const).map((unit) => (
                    <button
                      key={unit}
                      type="button"
                      onClick={() => {
                        setItemUnit(unit)
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
            <ColorLookupLegend />

            {fields.map((field, index) => (
              <div key={field.id} className="rounded-lg border border-border p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
                  <div className="space-y-1">
                    <Label className="text-xs">客戶品名</Label>
                    <Input {...register(`items.${index}.customerProductName`)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">皇加品名（產品分支）</Label>
                    <Combobox
                      value={branchDisplayValue(index)}
                      onChange={(v) => selectProductBranch(index, v)}
                      options={productBranchOptions}
                      placeholder="輸入或搜尋品名"
                      emptyText="查無品項，可直接使用輸入內容"
                    />
                  </div>
                  <div className="space-y-1 lg:col-span-2">
                    <Label className="text-xs">顏色</Label>
                    <Combobox
                      value={itemValues[index]?.color ?? ''}
                      onChange={(v) => setValue(`items.${index}.color`, v, { shouldValidate: true })}
                      options={colorOptionsFor(index)}
                      placeholder="輸入或搜尋顏色"
                      emptyText="查無顏色，可直接使用輸入內容"
                    />
                    {/* 填完品名與顏色即可查歷史色號，先告知之後會不會需要表3 */}
                    <ColorLookupBadge result={colorLookupFor(index)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">商品總數 ({itemUnit})</Label>
                    <Input
                      type="number"
                      step={itemUnit === 'Yard' ? '1' : '0.1'}
                      min="0"
                      value={displayQty(index)}
                      onChange={(e) => changeQty(index, e.target.value)}
                    />
                    {itemValues[index]?.yard ? (
                      <p className="text-xs text-muted-foreground">
                        {itemUnit === 'Yard'
                          ? `≈ ${formatNumber(yardToMeter(itemValues[index].yard), 1)} 米 (Meter)`
                          : `≈ ${formatNumber(itemValues[index].yard, 1)} 碼 (Yard)`}
                      </p>
                    ) : null}
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">包裝方式</Label>
                    <select
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      {...register(`items.${index}.packingMethod`)}
                    >
                      {PACKING_METHODS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                  {FIXED_ROLL_PACKING_METHODS.includes(itemValues[index]?.packingMethod) && (
                    <div className="space-y-1">
                      <Label className="text-xs">定碼長度 ({itemUnit})</Label>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        value={displayFixedLength(index)}
                        onChange={(e) => changeFixedLength(index, e.target.value)}
                      />
                      {itemValues[index]?.fixedLengthMeter ? (
                        <p className="text-xs text-muted-foreground">
                          {itemUnit === 'Meter'
                            ? `≈ ${formatNumber(meterToYard(itemValues[index].fixedLengthMeter!), 1)} 碼 (Yard)`
                            : `≈ ${formatNumber(itemValues[index].fixedLengthMeter!, 1)} 米 (Meter)`}
                        </p>
                      ) : null}
                    </div>
                  )}
                  {/* 加工方法：單選，每個商品只對應一種；選定後才展開說明欄位。與明細備註並排同一列 */}
                  <div className="space-y-1 sm:col-span-2 lg:col-span-3">
                    <Label className="text-xs">加工方法</Label>
                    <div className="flex gap-1.5">
                      <select
                        className="h-9 w-32 shrink-0 rounded-md border border-input bg-background px-2 text-sm"
                        value={itemValues[index]?.processingMethod ?? ''}
                        onChange={(e) => changeProcessingMethod(index, e.target.value as ProcessingMethod | '')}
                      >
                        <option value="">不指定</option>
                        {PROCESSING_METHODS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      {itemValues[index]?.processingMethod ? (
                        <Input
                          placeholder={`${itemValues[index].processingMethod}說明（非必填）`}
                          {...register(`items.${index}.processingMethodNote`)}
                        />
                      ) : (
                        <span className="self-center text-xs text-muted-foreground">選定加工方法後可填寫說明</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1 sm:col-span-2 lg:col-span-3">
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
                          // 輸入暫存以列索引為鍵，刪除列後索引會位移，一併清除避免錯位
                          resetDrafts()
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                {errors.items?.[index] && (
                  <p className="mt-1 text-xs text-destructive">{itemErrorMessages(errors.items[index]).join('、')}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">包裝設定</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>出貨樣數量（半碼一單位，0~5碼）</Label>
                <Input
                  type="number"
                  step="0.5"
                  min="0"
                  max="5"
                  className="w-28"
                  value={watch('sampleQty')}
                  onChange={(e) => {
                    const raw = e.target.value
                    if (raw === '') {
                      setValue('sampleQty', 0, { shouldValidate: true })
                      return
                    }
                    const num = Number(raw)
                    if (Number.isNaN(num)) return
                    setValue('sampleQty', Math.min(5, Math.max(0, num)), { shouldValidate: true })
                  }}
                />
                {errors.sampleQty && <p className="text-xs text-destructive">{errors.sampleQty.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>出貨包裝</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...register('packagingType')}
                >
                  {PACKAGING_TYPES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                {errors.packagingType && <p className="text-xs text-destructive">{errors.packagingType.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>出貨方式（可複選）</Label>
                <div className="flex flex-wrap gap-3">
                  {SHIP_METHODS.map((m) => (
                    <label key={m} className="flex items-center gap-1.5 text-sm font-normal">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={shipMethodValues.includes(m)}
                        onChange={(e) =>
                          setValue(
                            'shipMethod',
                            e.target.checked ? [...shipMethodValues, m] : shipMethodValues.filter((v) => v !== m),
                            { shouldValidate: true },
                          )
                        }
                      />
                      {m}
                    </label>
                  ))}
                </div>
                {errors.shipMethod && <p className="text-xs text-destructive">{errors.shipMethod.message}</p>}
                {shipMethodValues.includes('其他') && (
                  <Input {...register('shipMethodNote')} placeholder="請輸入出貨方式說明" className="mt-1.5" />
                )}
                {errors.shipMethodNote && <p className="text-xs text-destructive">{errors.shipMethodNote.message}</p>}
              </div>

              <div className="space-y-1.5">
                <Label>彩條（非必填）</Label>
                <label className="flex items-center gap-1.5 text-sm font-normal">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={colorRatioMode === '客人指定'}
                    onChange={(e) => {
                      setValue('colorRatio.mode', e.target.checked ? '客人指定' : '空白')
                      if (!e.target.checked) setValue('colorRatio.customText', '')
                    }}
                  />
                  客人指定
                </label>
                {colorRatioMode === '客人指定' && (
                  <Input {...register('colorRatio.customText')} placeholder="請輸入客人指定內容" className="mt-1.5" />
                )}
              </div>

              <div className="space-y-1.5">
                <Label>生產數量容許誤差</Label>
                <div className="flex flex-wrap items-center gap-3">
                  {TOLERANCE_MODES.map((mode) => (
                    <label key={mode} className="flex items-center gap-1.5 text-sm font-normal">
                      <input
                        type="radio"
                        className="h-4 w-4"
                        checked={toleranceMode === mode}
                        onChange={() => setValue('tolerance.mode', mode)}
                      />
                      {mode}
                    </label>
                  ))}
                </div>
                {toleranceMode === '其他' && (
                  <Input {...register('tolerance.customText')} placeholder="請輸入容許誤差說明" className="mt-1.5" />
                )}
              </div>

              <div className="space-y-1.5">
                <Label>燙金（非必填，可複選）</Label>
                <div className="flex flex-wrap gap-3">
                  {EMBOSSING_OPTIONS.filter((o) => o !== '否').map((o) => (
                    <label key={o} className="flex items-center gap-1.5 text-sm font-normal">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={embossingValues.includes(o)}
                        onChange={(e) =>
                          setValue(
                            'embossing',
                            e.target.checked ? [...embossingValues, o] : embossingValues.filter((v) => v !== o),
                            { shouldValidate: true },
                          )
                        }
                      />
                      {o}
                    </label>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="edgeCut"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={watch('edgeCut')}
                  onChange={(e) => setValue('edgeCut', e.target.checked)}
                />
                <Label htmlFor="edgeCut" className="cursor-pointer font-normal">
                  裁邊
                </Label>
              </div>

              <div className="space-y-1.5">
                <Label>標籤類型（可複選，預設全選）</Label>
                <div className="flex flex-wrap gap-3">
                  {LABEL_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-1.5 text-sm font-normal">
                      <input
                        type="checkbox"
                        className="h-4 w-4"
                        checked={labelTypeValues.includes(t)}
                        onChange={(e) =>
                          setValue(
                            'labelTypes',
                            e.target.checked ? [...labelTypeValues, t] : labelTypeValues.filter((v) => v !== t),
                            { shouldValidate: true },
                          )
                        }
                      />
                      {t}
                    </label>
                  ))}
                </div>
                {errors.labelTypes && <p className="text-xs text-destructive">{errors.labelTypes.message}</p>}
              </div>

              <div className="flex items-center gap-2">
                <input id="allowSplicing" type="checkbox" className="h-4 w-4" {...register('allowSplicing')} />
                <Label htmlFor="allowSplicing" className="cursor-pointer font-normal">
                  可接疋（最多3捲）
                </Label>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">嘜頭</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label>嘜頭形狀</Label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...register('marking.shape')}
                >
                  {MARKING_SHAPES.map((shape) => (
                    <option key={shape} value={shape}>
                      {shape}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label>運送目的地</Label>
                <Input {...register('marking.destination')} placeholder="非必填" />
              </div>
              <div className="space-y-1.5">
                <Label>成分</Label>
                <Input {...register('marking.composition')} placeholder="非必填" />
              </div>
              <div className="space-y-1.5">
                <Label>產地</Label>
                <Input {...register('marking.origin')} placeholder="非必填" />
              </div>
              <div className="space-y-1.5">
                <Label>毛重 (Kg)</Label>
                <Input type="number" step="0.1" min="0" {...register('marking.grossWeightKg')} />
              </div>
              <div className="space-y-1.5">
                <Label>淨重 (Kg)</Label>
                <Input type="number" step="0.1" min="0" {...register('marking.netWeightKg')} />
              </div>
              <div className="flex items-center gap-2 sm:col-span-2 lg:col-span-3">
                <input id="hasSmallMarking" type="checkbox" className="h-4 w-4" {...register('marking.hasSmallMarking')} />
                <Label htmlFor="hasSmallMarking" className="cursor-pointer font-normal">
                  小嘜頭加印
                </Label>
              </div>
              {watch('marking.hasSmallMarking') && (
                <div className="space-y-1.5 sm:col-span-2 lg:col-span-3">
                  <Label>小嘜頭內容</Label>
                  <Input {...register('marking.smallMarkingText')} placeholder="例：RORICA-K2-2026" />
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => navigate(isEdit ? `/packing-notice/${id}` : '/packing-notice')}>
            取消
          </Button>
          <Button type="submit" className="bg-brand hover:bg-brand-dark" disabled={isSubmitting || mutation.isPending}>
            {mutation.isPending ? '儲存中...' : isEdit ? '儲存變更' : '建立包裝通知單'}
          </Button>
        </div>
      </form>
    </div>
  )
}

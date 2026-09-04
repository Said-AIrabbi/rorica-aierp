import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PrintActions } from '@/components/print/PrintActions'
import { ShippingOrderPrint } from './ShippingOrderPrint'
import { MarkingPrint } from '@/features/packing-notice/MarkingPrint'
import { PackagingSummary } from '@/components/shared/PackagingSummary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/mocks/api'
import { getAccount, getCustomer } from '@/mocks/data'
import {
  completeShippingOrder,
  setShippingOrderStatus,
  updateShippingOrderItems,
  updateShippingOrderMarkingBoxNo,
  updateShippingOrderSignatures,
} from '@/mocks/mutations'
import { formatDate } from '@/lib/dates'
import { formatNumber, meterToYard, yardToMeter } from '@/lib/units'
import { buildSecondaryProcessingPackaging } from '@/lib/workflow'
import type { ShippingOrderItem, ShippingOrderSignatures } from '@/types'

export function ShippingOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: shippingOrders = [] } = useQuery({ queryKey: ['shippingOrders'], queryFn: api.shippingOrders })
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const order = shippingOrders.find((s) => s.id === id)

  const [signatures, setSignatures] = useState<ShippingOrderSignatures>({})
  useEffect(() => {
    if (order) setSignatures(order.signatures ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  // 明細由包裝通知單帶入後可微調／刪除，供倉管於確認建單前調整實際出貨內容
  const [itemDraft, setItemDraft] = useState<ShippingOrderItem[]>([])
  // 箱/袋號輸入草稿：鍵為嘜頭組別索引；打字時只更新草稿，離開欄位才寫入，避免每個字都送一次
  const [boxNoDraft, setBoxNoDraft] = useState<Record<number, string>>({})
  useEffect(() => {
    if (order) setItemDraft(order.items)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.items])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shippingOrders'] })

  const boxNoMutation = useMutation({
    mutationFn: ({ index, boxNo }: { index: number; boxNo: string }) =>
      updateShippingOrderMarkingBoxNo(id!, index, boxNo),
    onSuccess: async () => {
      await invalidate()
      setBoxNoDraft({})
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const saveSignaturesMutation = useMutation({
    mutationFn: () => updateShippingOrderSignatures(id!, signatures),
    onSuccess: async () => {
      await invalidate()
      toast.success('簽名欄已儲存')
    },
  })

  const saveItemsMutation = useMutation({
    mutationFn: () => updateShippingOrderItems(id!, itemDraft),
    onSuccess: async () => {
      await invalidate()
      toast.success('出貨明細已儲存')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const buildMutation = useMutation({
    mutationFn: () => setShippingOrderStatus(id!, '已建立'),
    onSuccess: async (updated) => {
      await invalidate()
      toast.success(`${updated.id} 已建立，可安排出貨`)
    },
  })

  const completeMutation = useMutation({
    mutationFn: () => completeShippingOrder(id!),
    onSuccess: async (updated) => {
      // 出貨完成可能連帶扣減表7布卷庫存，並在所有明細皆已出貨時回頭結案表1包裝通知單
      await Promise.all([
        invalidate(),
        queryClient.invalidateQueries({ queryKey: ['fabricLabels'] }),
        queryClient.invalidateQueries({ queryKey: ['packingNotices'] }),
      ])
      toast.success(`${updated.id} 已確認出貨完成，已扣減對應布卷條碼庫存`)
    },
  })

  if (!order) {
    return (
      <div className="text-sm text-muted-foreground">
        找不到單號 {id} 的出貨單。
        <button className="ml-2 text-brand underline" onClick={() => navigate('/shipping-order')}>
          返回列表
        </button>
      </div>
    )
  }

  const customer = getCustomer(order.customerId)
  const operator = order.operatorAccountId ? getAccount(order.operatorAccountId) : undefined
  // 明細僅在草稿（尚未確認建單）階段可微調／刪除
  const itemsEditable = order.status === '草稿'
  const itemsDirty = JSON.stringify(itemDraft) !== JSON.stringify(order.items)
  const notice = packingNotices.find((n) => n.id === order.parentId)
  const markings = notice?.markings ?? []
  // 箱/袋號：逐組嘜頭各一個，草稿階段填寫；離開欄位即自動儲存，不需要另外按儲存
  const boxNoOf = (index: number) => boxNoDraft[index] ?? order?.markingBoxNos?.[index] ?? ''
  const saveBoxNo = (index: number) => {
    const next = boxNoDraft[index]
    if (next === undefined || next === (order?.markingBoxNos?.[index] ?? '')) return
    boxNoMutation.mutate({ index, boxNo: next })
  }
  // 數量以「當初下單用的單位」為主值呈現，另一單位標為換算值；沿用表1 的作法，
  // 兩欄等重並列會看不出哪個數字是客戶實際下的、哪個是系統換算的
  const itemUnit = notice?.itemUnit ?? 'Yard'
  const toBasis = (yard: number) => (itemUnit === 'Yard' ? yard : yardToMeter(yard))
  const fromBasis = (value: number) => (itemUnit === 'Yard' ? value : meterToYard(value))

  return (
    <div>
      <Link to="/shipping-order" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回出貨單列表
      </Link>

      <PageHeader
        title={order.id}
        formCode="表8"
        description={
          <>
            來源包裝通知單：
            <Link to={`/packing-notice/${order.parentId}`} className="text-brand-dark underline">
              {order.parentId}
            </Link>
          </>
        }
        actions={
          <>
            <StatusBadge status={order.status} className="text-sm" />
            <PrintActions
              sheets={[
                { key: 'doc', label: '列印出貨單', sheet: <ShippingOrderPrint order={order} /> },
                // 嘜頭資料維護於表1，但貼箱是出貨當下的動作，故列印入口放在表8。
                // 一張單可能有多組嘜頭，各自一張 A4，故列印選單逐組列出。
                ...markings.map((m, index) => ({
                  key: `marking-${index}`,
                  label: markings.length > 1 ? `列印嘜頭 ${index + 1}` : '列印嘜頭',
                  sheet: <MarkingPrint marking={m} boxNo={boxNoOf(index)} />,
                })),
              ]}
            />
            {order.status === '草稿' && (
              <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={buildMutation.isPending} onClick={() => buildMutation.mutate()}>
                建立出貨單
              </Button>
            )}
            {order.status === '已建立' && (
              <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
                確認出貨完成
              </Button>
            )}
          </>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">單頭資訊</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField label="客戶" value={customer?.shortName} />
            <DetailField
              label="類型"
              value={
                order.isSampleOrder ? (
                  <Badge variant="outline" className="border-accent-blue text-accent-blue">
                    樣品單
                  </Badge>
                ) : (
                  <Badge variant="outline">一般出貨</Badge>
                )
              }
            />
            <DetailField label="出貨日" value={formatDate(order.shipDate)} />
            <DetailField label="倉管人員" value={operator?.name ?? '-'} />
            <DetailField label="出倉部門" value={operator?.roles[0] ?? '-'} />
            <DetailField label="用途" value={order.purpose ?? '-'} />
          </DetailGrid>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">
            出貨明細（{itemsEditable ? itemDraft.length : order.items.length} 項）
            {itemsEditable && '　—　由包裝通知單帶入，確認建單前可微調數量／售價或刪除品項'}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客戶品名</TableHead>
                  <TableHead>皇加品名</TableHead>
                  <TableHead>色號</TableHead>
                  <TableHead>布卷條碼（拼接時為捲號組合）</TableHead>
                  <TableHead className="text-right">數量 ({itemUnit})</TableHead>
                  <TableHead className="text-right">售價 (/Y)</TableHead>
                  <TableHead className="text-right">金額</TableHead>
                  <TableHead>備註</TableHead>
                  {itemsEditable && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(itemsEditable ? itemDraft : order.items).map((item, i) => (
                  <TableRow key={`${item.rollCodes.join('+')}-${i}`}>
                    <TableCell>{item.customerProductName || '-'}</TableCell>
                    <TableCell>{item.roricaProductName || '-'}</TableCell>
                    <TableCell>{item.color || '-'}</TableCell>
                    <TableCell>{item.rollCodes.join('＋')}</TableCell>
                    <TableCell className="text-right">
                      {itemsEditable ? (
                        <Input
                          type="number"
                          step={itemUnit === 'Yard' ? '1' : '0.1'}
                          min="0"
                          className="w-24 text-right"
                          value={Number(toBasis(item.yard).toFixed(itemUnit === 'Yard' ? 0 : 1))}
                          onChange={(e) =>
                            setItemDraft((prev) =>
                              prev.map((x, xi) =>
                                xi === i ? { ...x, yard: Number(fromBasis(Number(e.target.value) || 0).toFixed(2)) } : x,
                              ),
                            )
                          }
                        />
                      ) : (
                        <div>{formatNumber(itemUnit === 'Yard' ? item.yard : item.meter, itemUnit === 'Yard' ? 0 : 1)}</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {itemUnit === 'Yard'
                          ? `≈ ${formatNumber(itemsEditable ? yardToMeter(item.yard) : item.meter, 1)} 米 (Meter)`
                          : `≈ ${formatNumber(item.yard, 1)} 碼 (Yard)`}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      {itemsEditable ? (
                        <Input
                          type="number"
                          step="0.1"
                          min="0"
                          className="w-24 text-right"
                          value={item.unitPrice ?? ''}
                          onChange={(e) =>
                            setItemDraft((prev) =>
                              prev.map((x, xi) =>
                                xi === i ? { ...x, unitPrice: e.target.value === '' ? undefined : Number(e.target.value) } : x,
                              ),
                            )
                          }
                        />
                      ) : item.unitPrice != null ? (
                        formatNumber(item.unitPrice, 1)
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.unitPrice != null ? formatNumber(item.yard * item.unitPrice, 1) : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {itemsEditable ? (
                        <Input
                          className="w-32"
                          value={item.note ?? ''}
                          placeholder="非必填"
                          onChange={(e) =>
                            setItemDraft((prev) => prev.map((x, xi) => (xi === i ? { ...x, note: e.target.value } : x)))
                          }
                        />
                      ) : (
                        item.note || '-'
                      )}
                    </TableCell>
                    {itemsEditable && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          disabled={itemDraft.length <= 1}
                          onClick={() => setItemDraft((prev) => prev.filter((_, xi) => xi !== i))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {itemsEditable && (
            <div className="mt-3 flex justify-end px-4">
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                disabled={!itemsDirty || saveItemsMutation.isPending}
                onClick={() => saveItemsMutation.mutate()}
              >
                {saveItemsMutation.isPending ? '儲存中...' : '儲存出貨明細'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 裝箱出貨要照客戶原始包裝要求作業，故與嘜頭一樣由表1 唯讀帶入 */}
      {notice && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">包裝設定（帶入自表1包裝通知單）</CardTitle>
          </CardHeader>
          <CardContent>
            <PackagingSummary packaging={buildSecondaryProcessingPackaging(notice)} />
          </CardContent>
        </Card>
      )}

      {markings.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              嘜頭（帶入自表1包裝通知單{markings.length > 1 ? `，共 ${markings.length} 組` : ''}）
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {markings.map((marking, index) => (
              <div key={index} className={markings.length > 1 ? 'rounded-lg border border-border p-3' : undefined}>
                {markings.length > 1 && (
                  // 序號對應列印選單的「列印嘜頭 N」，貼箱時才知道印出來的是哪一組
                  <div className="mb-2 text-xs font-medium text-muted-foreground">嘜頭 {index + 1}</div>
                )}
                {/* 箱/袋號是出貨當下才知道的資訊（箱袋編到幾號），故在表8 填寫；
                    草稿階段可輸入，離開欄位即自動儲存，確認建立後轉為唯讀 */}
                <div className="mb-3 space-y-1">
                  <Label className="text-xs">箱/袋號（列印嘜頭用）</Label>
                  {itemsEditable ? (
                    <Input
                      className="w-56"
                      value={boxNoOf(index)}
                      placeholder="非必填，例：C/NO 1-20"
                      onChange={(e) => setBoxNoDraft((prev) => ({ ...prev, [index]: e.target.value }))}
                      onBlur={() => saveBoxNo(index)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') e.currentTarget.blur()
                      }}
                    />
                  ) : (
                    <div className="text-sm text-ink-body">{order.markingBoxNos?.[index] || '-'}</div>
                  )}
                </div>
                <DetailGrid>
                  <DetailField label="嘜頭形狀" value={marking.shape} />
                  <DetailField label="客戶簡稱" value={customer?.shortName} />
                  <DetailField label="抬頭文字" value={marking.headerText || '-'} />
                  <DetailField label="運送目的地" value={marking.destination || '-'} />
                  <DetailField label="毛重(Kg)" value={marking.grossWeightKg != null ? formatNumber(marking.grossWeightKg, 1) : '-'} />
                  <DetailField label="淨重(Kg)" value={marking.netWeightKg != null ? formatNumber(marking.netWeightKg, 1) : '-'} />
                  <DetailField label="成分" value={marking.composition || '-'} />
                  <DetailField label="產地" value={marking.origin || '-'} />
                  <DetailField label="小嘜頭" value={marking.hasSmallMarking ? marking.smallMarkingText || '是' : '否'} />
                </DetailGrid>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">簽名欄</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="space-y-1.5">
              <Label className="text-xs">處理人</Label>
              <Input value={signatures.processedBy ?? ''} onChange={(e) => setSignatures((s) => ({ ...s, processedBy: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">倉管</Label>
              <Input value={signatures.warehouse ?? ''} onChange={(e) => setSignatures((s) => ({ ...s, warehouse: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">出貨</Label>
              <Input value={signatures.shipped ?? ''} onChange={(e) => setSignatures((s) => ({ ...s, shipped: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">業務</Label>
              <Input value={signatures.sales ?? ''} onChange={(e) => setSignatures((s) => ({ ...s, sales: e.target.value }))} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button type="button" variant="outline" size="sm" disabled={saveSignaturesMutation.isPending} onClick={() => saveSignaturesMutation.mutate()}>
              儲存簽名欄
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

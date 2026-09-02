import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PrintActions } from '@/components/print/PrintActions'
import { PurchaseOrderPrint } from './PurchaseOrderPrint'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { api } from '@/mocks/api'
import { getVendor, productBranchSuffix, vendorDisplayName } from '@/mocks/data'
import { completePurchaseOrderDraft, signPurchaseOrder, submitPurchaseOrderLargeSample, triggerPurchaseOrderFulfillment } from '@/mocks/mutations'
import { formatDate } from '@/lib/dates'
import { lookupColorSample } from '@/lib/colors'
import { ColorLookupBadge } from '@/components/shared/ColorLookupBadge'
import { formatNumber, meterToYard } from '@/lib/units'
import {
  effectivePurchaseOrderStatus,
  freezeDate,
  isPurchaseOrderEditable,
  isPurchaseOrderOverdue,
  isPurchaseOrderReadyToTriggerFulfillment,
  PURCHASE_ORDER_OVERDUE_DAYS,
} from '@/lib/workflow'
import type { PurchaseOrder } from '@/types'

export function PurchaseOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })
  const { data: goodsReceipts = [] } = useQuery({ queryKey: ['goodsReceipts'], queryFn: api.goodsReceipts })
  const { data: dyeOrders = [] } = useQuery({ queryKey: ['dyeOrders'], queryFn: api.dyeOrders })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: api.products })
  // 歷史色號的查詢鍵含客戶，故需回頭取來源表1 的客戶（訂購單本身只記主號）
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const order = data.find((o) => o.id === id)
  const sourceNotice = packingNotices.find((n) => n.id === data.find((o) => o.id === id)?.parentId)
  const [rejectReason, setRejectReason] = useState('')
  const [draftType, setDraftType] = useState<PurchaseOrder['type']>('胚布')
  const [draftHasDyeVendor, setDraftHasDyeVendor] = useState(false)
  const [draftVendorId, setDraftVendorId] = useState('')
  /** 染整廠：與賣方各自獨立（可能跟A買胚布、送B染），僅「是否填入染整廠商」開關打開時需要 */
  const [draftDyeVendorId, setDraftDyeVendorId] = useState('')
  const [draftDueDate, setDraftDueDate] = useState('')
  const [draftNote, setDraftNote] = useState('')

  useEffect(() => {
    if (order && order.status === '草稿') {
      setDraftDueDate(order.dueDate.slice(0, 10))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] }),
      queryClient.invalidateQueries({ queryKey: ['dyeRequests'] }),
      queryClient.invalidateQueries({ queryKey: ['dyeOrders'] }),
      queryClient.invalidateQueries({ queryKey: ['goodsReceipts'] }),
    ])
  }

  const signMutation = useMutation({
    mutationFn: () => signPurchaseOrder(id!),
    onSuccess: async (updated) => {
      await invalidateAll()
      toast.success(`${updated.id} 已簽回`)
    },
  })

  const submitSampleMutation = useMutation({
    mutationFn: (input: { result: '通過' | '退回'; reason?: string }) =>
      submitPurchaseOrderLargeSample(id!, input.result, input.reason),
    onSuccess: async (_updated, input) => {
      await invalidateAll()
      setRejectReason('')
      toast.success(input.result === '通過' ? `${id} 大貨樣已確認通過` : `${id} 大貨樣已退回，已自動新增下一筆送樣紀錄`)
    },
  })

  const triggerMutation = useMutation({
    mutationFn: () => triggerPurchaseOrderFulfillment(id!),
    onSuccess: async (updated) => {
      await invalidateAll()
      toast.success(
        updated.type === '胚布' && updated.hasDyeVendor
          ? `已依明細品名自動建立表4染整單草稿（訂購單將於染整單完成時回頭結案）`
          : `已自動建立表6入庫單草稿（訂購單將於入庫完成時回頭結案）`,
      )
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const completeDraftMutation = useMutation({
    mutationFn: () =>
      completePurchaseOrderDraft(id!, {
        type: draftType,
        hasDyeVendor: draftHasDyeVendor,
        vendorId: draftVendorId,
        dyeVendorId: draftDyeVendorId || undefined,
        dueDate: draftDueDate,
        note: draftNote,
        itemUnitPrices: {},
      }),
    onSuccess: async (updated) => {
      await invalidateAll()
      toast.success(`${updated.id} 已送出，進入待簽回`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!order) {
    return (
      <div className="text-sm text-muted-foreground">
        找不到單號 {id} 的訂購單。
        <button className="ml-2 text-brand underline" onClick={() => navigate('/purchase-order')}>
          返回列表
        </button>
      </div>
    )
  }

  const vendor = getVendor(order.vendorId)
  const overdue = isPurchaseOrderOverdue(order)
  const editable = isPurchaseOrderEditable(order)
  const displayStatus = effectivePurchaseOrderStatus(order)
  const readyToTrigger = isPurchaseOrderReadyToTriggerFulfillment(order, goodsReceipts, dyeOrders)
  const linkedDyeOrders = order.hasDyeVendor ? dyeOrders.filter((d) => d.parentId === order.parentId) : []
  const linkedGoodsReceipt = goodsReceipts.find(
    (r) => r.parentId === order.parentId && r.source === (order.type === '成品' ? '直採大貨-成品' : '直採大貨-胚布'),
  )

  return (
    <div>
      <Link to="/purchase-order" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回訂購單列表
      </Link>

      <PageHeader
        title={order.id}
        formCode="表2"
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
            <StatusBadge status={displayStatus} className="text-sm" />
            <PrintActions sheets={[{ key: 'doc', label: '列印訂購單', sheet: <PurchaseOrderPrint order={order} /> }]} />
            {!editable && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                <Lock className="h-3 w-3" /> 已凍結
              </span>
            )}
            {order.status === '待簽回' && !order.signedAt && (
              <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={signMutation.isPending} onClick={() => signMutation.mutate()}>
                確認已簽回
              </Button>
            )}
            {readyToTrigger && (
              <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={triggerMutation.isPending} onClick={() => triggerMutation.mutate()}>
                {order.type === '胚布' && order.hasDyeVendor ? '建立染整單' : '建立入庫單'}
              </Button>
            )}
          </>
        }
      />

      {overdue && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            建立超過 {PURCHASE_ORDER_OVERDUE_DAYS} 天仍未簽回，系統已自動標記為「已逾期」，效果視同已確認，不影響後續流程；請業務跟催廠商補簽回。
          </span>
        </div>
      )}

      {!editable && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            已於 {formatDate(freezeDate(order.effectiveAt))} 自動凍結（自生效日起算滿 7 個工作天；草稿狀態尚未送出不受此限），不再提供修改。
          </span>
        </div>
      )}

      {order.status === '草稿' && (
        <Card className="mb-4 border-brand/30">
          <CardHeader>
            <CardTitle className="text-base">系統自動建立草稿（表1判斷無庫存時自動觸發），請補齊以下資訊後送出</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>類型</Label>
                <Select
                  value={draftType}
                  onValueChange={(v) => {
                    setDraftType(v as PurchaseOrder['type'])
                    if (v !== '胚布') setDraftHasDyeVendor(false)
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>{draftType}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="成品">成品</SelectItem>
                    <SelectItem value="胚布">胚布</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draftType === '胚布' && (
                <div className="flex items-center gap-2 pt-6">
                  <input
                    id="draftHasDyeVendor"
                    type="checkbox"
                    className="h-4 w-4"
                    checked={draftHasDyeVendor}
                    onChange={(e) => {
                      setDraftHasDyeVendor(e.target.checked)
                      if (!e.target.checked) setDraftDyeVendorId('')
                    }}
                  />
                  <Label htmlFor="draftHasDyeVendor" className="cursor-pointer font-normal">
                    是否填入染整廠商
                  </Label>
                </div>
              )}

              <div className="space-y-1.5">
                <Label>賣方（供應商／染整廠）</Label>
                <Select value={draftVendorId} onValueChange={setDraftVendorId}>
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
              </div>

              {draftType === '胚布' && draftHasDyeVendor && (
                <div className="space-y-1.5">
                  <Label>染整廠（名稱＋廠點）</Label>
                  <Select value={draftDyeVendorId} onValueChange={setDraftDyeVendorId}>
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
                </div>
              )}

              <div className="space-y-1.5">
                <Label>交期</Label>
                <Input type="date" value={draftDueDate} onChange={(e) => setDraftDueDate(e.target.value)} />
              </div>

              <div className="space-y-1.5 sm:col-span-2">
                <Label>備註</Label>
                <Textarea rows={2} value={draftNote} onChange={(e) => setDraftNote(e.target.value)} />
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button
                className="bg-brand hover:bg-brand-dark"
                disabled={
                  completeDraftMutation.isPending ||
                  !draftVendorId ||
                  !draftDueDate ||
                  (draftType === '胚布' && draftHasDyeVendor && !draftDyeVendorId)
                }
                onClick={() => completeDraftMutation.mutate()}
              >
                送出（進入待簽回）
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">單頭資訊</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">統一編號 16784675，抬頭：皇加布業有限公司</p>
          <DetailGrid>
            <DetailField label="類型" value={order.type} />
            {order.type === '胚布' && <DetailField label="是否填入染整廠商" value={order.hasDyeVendor ? '是' : '否'} />}
            <DetailField label="賣方（供應商／染整廠）" value={vendorDisplayName(vendor)} />
            {order.type === '胚布' && order.hasDyeVendor && (
              <DetailField label="染整廠名稱＋廠點" value={vendorDisplayName(getVendor(order.dyeVendorId ?? '')) || '-'} />
            )}
            <DetailField label="廠商聯絡人" value={vendor?.contactPerson} />
            <DetailField label="燙金" value={order.embossing} />
            <DetailField label="彩條" value={order.colorRatioNote} />
            <DetailField label="建立日" value={formatDate(order.createdAt)} />
            <DetailField label="簽回日" value={formatDate(order.signedAt)} />
            <DetailField label="交期" value={formatDate(order.dueDate)} />
            <DetailField label="備註" value={order.note || '-'} />
            {order.type === '胚布' && order.hasDyeVendor ? (
              <DetailField
                label="關聯染整單（表4，完成時回頭結案本單）"
                value={
                  linkedDyeOrders.length > 0 ? (
                    <div className="flex flex-wrap gap-2">
                      {linkedDyeOrders.map((d) => (
                        <Link key={d.id} to={`/dye-order/${d.id}`} className="text-brand-dark underline">
                          {d.id}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    '尚未建立'
                  )
                }
              />
            ) : (
              <DetailField
                label="關聯入庫單（表6，完成時回頭結案本單）"
                value={
                  linkedGoodsReceipt ? (
                    <Link to={`/goods-receipt/${linkedGoodsReceipt.id}`} className="text-brand-dark underline">
                      {linkedGoodsReceipt.id}
                    </Link>
                  ) : (
                    '尚未建立'
                  )
                }
              />
            )}
          </DetailGrid>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">明細（{order.items.length} 項）</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客戶品名</TableHead>
                  <TableHead>皇加品名</TableHead>
                  <TableHead>顏色</TableHead>
                  <TableHead className="text-right">Yard</TableHead>
                  <TableHead className="text-right">Meter</TableHead>
                  <TableHead>色號查詢</TableHead>
                  <TableHead>包裝方式</TableHead>
                  <TableHead className="text-right">定碼長度</TableHead>
                  <TableHead>加工方法</TableHead>
                  <TableHead className="text-right">單價</TableHead>
                  <TableHead>備註</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.customerProductName}</TableCell>
                    <TableCell>
                      {item.roricaProductName}
                      {/* 同品名有多個規格分支時附上分支序號，讓明細看得出指的是哪一個 */}
                      <span className="text-muted-foreground">{productBranchSuffix(item.productId)}</span>
                    </TableCell>
                    <TableCell>{item.color}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.yard, 0)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.meter, 1)}</TableCell>
                    <TableCell>
                      {/* 本單已指定染整廠時即為完整四鍵查詢，結論確定；未指定則仍為「視染整廠而定」 */}
                      <ColorLookupBadge
                        showMessage={false}
                        result={lookupColorSample({
                          products,
                          customerId: sourceNotice?.customerId,
                          productId: item.productId,
                          productName: item.roricaProductName,
                          color: item.color,
                          dyeVendorId: order.dyeVendorId,
                          vendorNameOf: (vendorId) => vendorDisplayName(vendors.find((v) => v.id === vendorId)),
                        })}
                      />
                    </TableCell>
                    <TableCell>{item.packingMethod}</TableCell>
                    <TableCell className="text-right">
                      {item.fixedLengthMeter
                        ? `${formatNumber(item.fixedLengthMeter, 1)}M ／ ${formatNumber(meterToYard(item.fixedLengthMeter), 1)}Y`
                        : '-'}
                    </TableCell>
                    <TableCell>
                      {item.processingMethod ? (
                        <span className="text-xs">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-ink-body">{item.processingMethod}</span>
                          {item.processingMethodNote ? (
                            <span className="ml-1 text-muted-foreground">{item.processingMethodNote}</span>
                          ) : null}
                        </span>
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">{item.unitPrice != null ? formatNumber(item.unitPrice, 1) : '-'}</TableCell>
                    <TableCell className="text-muted-foreground">{item.note || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {order.type === '成品' && (displayStatus === '已簽回' || displayStatus === '已逾期') && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">大貨樣確認送樣（退回不設次數上限，可反覆送樣；通過後才可觸發表6入庫流程，入庫完成才算已完成）</CardTitle>
          </CardHeader>
          <CardContent>
            {order.largeSampleSubmissions && order.largeSampleSubmissions.length > 0 && (
              <ul className="mb-4 space-y-1.5 text-sm">
                {order.largeSampleSubmissions.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-2 text-ink-body">
                    <span className="text-muted-foreground">{formatDate(s.submittedAt)}</span>
                    <StatusBadge status={s.result} />
                    {s.reason && <span className="text-muted-foreground">（{s.reason}）</span>}
                  </li>
                ))}
              </ul>
            )}
            {!order.largeSampleConfirmedAt && (
              <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">退回原因（選填，僅登記退回時使用）</label>
                  <Input
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    placeholder="例：色差過大，需重新製作大貨樣"
                    className="w-72"
                  />
                </div>
                <Button
                  variant="outline"
                  className="border-destructive text-destructive hover:bg-destructive/10"
                  disabled={submitSampleMutation.isPending}
                  onClick={() => submitSampleMutation.mutate({ result: '退回', reason: rejectReason || undefined })}
                >
                  登記退回
                </Button>
                <Button
                  className="bg-brand hover:bg-brand-dark"
                  disabled={submitSampleMutation.isPending}
                  onClick={() => submitSampleMutation.mutate({ result: '通過' })}
                >
                  登記通過
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

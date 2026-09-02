import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PrintActions } from '@/components/print/PrintActions'
import { DyeOrderPrint } from './DyeOrderPrint'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/mocks/api'
import { getVendor } from '@/mocks/data'
import { confirmDyeOrder, createDyeRequest, submitDyeOrderLargeSample, updateDyeOrderSampleCodes } from '@/mocks/mutations'
import { formatDate, isColorStale, COLOR_STALE_MONTHS } from '@/lib/dates'
import { formatNumber, yardToMeter } from '@/lib/units'
import { rollYardUpperLimit } from '@/lib/workflow'

export function DyeOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['dyeOrders'], queryFn: api.dyeOrders })
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const order = data.find((d) => d.id === id)
  const [rejectReason, setRejectReason] = useState('')
  // 色樣編號在染單結案前皆可修改，不限於表3回填的時機
  const [sampleCodeDraft, setSampleCodeDraft] = useState<Record<string, string>>({})

  useEffect(() => {
    if (order) {
      setSampleCodeDraft(Object.fromEntries(order.items.map((i) => [i.id, i.sampleCode ?? ''])))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.items])

  const invalidateAll = async () => {
    // 染整單完成時依明細有無加工方法，建立表5二次加工單或表6入庫單草稿，並回頭結案對應的表2訂購單（胚布送染整路徑）
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['dyeOrders'] }),
      queryClient.invalidateQueries({ queryKey: ['goodsReceipts'] }),
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] }),
    ])
  }

  const confirmOrderMutation = useMutation({
    mutationFn: () => confirmDyeOrder(id!),
    onSuccess: async () => {
      await invalidateAll()
      toast.success(`${id} 已正式建單，狀態變為生效，已觸發委外加工`)
    },
  })

  // 大貨樣「通過」即為結案動作：狀態轉已完成、指染轉成品、並依明細去向建立下一張單據，無需另一道人工結案
  const submitSampleMutation = useMutation({
    mutationFn: (input: { result: '通過' | '退回'; reason?: string }) => submitDyeOrderLargeSample(id!, input.result, input.reason),
    onSuccess: async (_updated, input) => {
      await invalidateAll()
      setRejectReason('')
      toast.success(
        input.result === '通過'
          ? `${id} 大貨樣已通過，染整單已完成；需二次加工的品項已建立表5加工單草稿，其餘已建立表6入庫單草稿`
          : `${id} 大貨樣已退回，已自動新增下一筆送樣紀錄`,
      )
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const saveSampleCodesMutation = useMutation({
    mutationFn: () => updateDyeOrderSampleCodes(id!, sampleCodeDraft),
    onSuccess: async () => {
      await invalidateAll()
      toast.success(`${id} 色樣編號已儲存`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  // 重新覆色：色號超過12個月未使用時系統僅提醒，由使用者自行決定是否建立表3（非自動開單）
  const recolorMutation = useMutation({
    mutationFn: (input: { colors: string[] }) =>
      createDyeRequest({
        parentId: order!.parentId,
        dyeVendorId: order!.vendorId,
        productName: order!.productName,
        productId: order!.productId,
        colors: input.colors,
        note: `色號超過 ${COLOR_STALE_MONTHS} 個月未使用，重新覆色（來源染單 ${order!.id}）`,
      }),
    onSuccess: async (request) => {
      await queryClient.invalidateQueries({ queryKey: ['dyeRequests'] })
      toast.success(`已建立表3打色通知單 ${request.id}，可前往補齊色號清單`)
      navigate(`/dye-request/${request.id}`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!order) {
    return (
      <div className="text-sm text-muted-foreground">
        找不到單號 {id} 的染整單。
        <button className="ml-2 text-brand underline" onClick={() => navigate('/dye-order')}>
          返回列表
        </button>
      </div>
    )
  }

  const vendor = getVendor(order.vendorId)
  const totals = order.items.reduce(
    (acc, item) => ({
      pendingDyeQty: acc.pendingDyeQty + item.pendingDyeQty,
      inDyeQty: acc.inDyeQty + item.inDyeQty,
      finishedQty: acc.finishedQty + item.finishedQty,
    }),
    { pendingDyeQty: 0, inDyeQty: 0, finishedQty: 0 },
  )
  // 查得到色號但超過12個月未使用＝「重新覆色」情境：系統僅提醒，不自動開立表3
  const staleItems = order.items.filter((item) => isColorStale(item.sampleCodeLastUsedAt))
  // 色樣編號在結案（已完成）前皆可修改，不受表3回填時機限制
  const sampleCodeEditable = order.status !== '已完成'
  const sampleCodeDirty = order.items.some((i) => (sampleCodeDraft[i.id] ?? '') !== (i.sampleCode ?? ''))
  // 單卷碼數上限：依來源表1該筆明細的定碼長度與生產數量容許誤差動態計算
  const notice = packingNotices.find((n) => n.id === order.parentId)
  const rollLimits = order.items
    .map((item) => {
      const source = notice?.items.find((n) => n.color === item.color)
      return notice ? rollYardUpperLimit(source?.fixedLengthMeter, notice.tolerance) : null
    })
    .filter((v): v is number => v != null)
  const rollLimit = rollLimits.length > 0 ? Math.max(...rollLimits) : null

  return (
    <div>
      <Link to="/dye-order" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回染整單列表
      </Link>

      <PageHeader
        title={order.id}
        formCode="表4"
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
            <PrintActions sheets={[{ key: 'doc', label: '列印染單', sheet: <DyeOrderPrint order={order} /> }]} />
            {order.status === '草稿' && (
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                disabled={confirmOrderMutation.isPending}
                onClick={() => confirmOrderMutation.mutate()}
              >
                確認正式建單
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
            <DetailField label="訂單編號" value={order.parentId} />
            <DetailField label="交期" value={formatDate(order.dueDate)} />
            <DetailField label="品名" value={order.productName} />
            <DetailField label="燙金" value={order.embossing} />
            <DetailField label="彩條" value={order.colorRatioNote} />
            <DetailField label="生效日" value={formatDate(order.effectiveAt)} />
            {/* 胚布到貨由胚布訂單的表6入庫單結案時觸發，非染單自身的人工動作 */}
            <DetailField
              label="胚布到貨日（入庫單觸發）"
              value={order.greigeArrivedAt ? formatDate(order.greigeArrivedAt) : '胚布尚未到貨（全數待染）'}
            />
            <DetailField label="大貨樣確認日" value={formatDate(order.largeSampleConfirmedAt)} />
          </DetailGrid>
        </CardContent>
      </Card>

      {staleItems.length > 0 && (
        <div className="mt-4 flex flex-wrap items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>
              下列色號查得到歷史紀錄，但已超過 {COLOR_STALE_MONTHS} 個月未使用，屬「重新覆色」情境：
              {staleItems.map((i) => `${i.color}（${i.sampleCode ?? '-'}）`).join('、')}。
            </p>
            <p className="mt-0.5 text-xs">
              系統已沿用舊色號，未自動開立表3；如需重新覆色，請點右側按鈕自行建立打色通知單。
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="shrink-0 border-warning text-warning hover:bg-warning/10"
            disabled={recolorMutation.isPending}
            onClick={() => recolorMutation.mutate({ colors: staleItems.map((i) => i.color) })}
          >
            建立表3重新覆色
          </Button>
        </div>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">明細（三段式庫存追蹤逐列累計）</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>顏色</TableHead>
                  <TableHead>色樣編號</TableHead>
                  <TableHead>對色標準</TableHead>
                  <TableHead className="text-right">單卷碼數</TableHead>
                  <TableHead>胚布材質</TableHead>
                  <TableHead>胚布規格</TableHead>
                  <TableHead>成品規格</TableHead>
                  <TableHead className="text-right">加工單價</TableHead>
                  <TableHead className="text-right">待染數量</TableHead>
                  <TableHead className="text-right">指染數量</TableHead>
                  <TableHead className="text-right">成品數量</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {order.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="whitespace-nowrap">{item.color}</TableCell>
                    <TableCell>
                      {sampleCodeEditable ? (
                        <div className="flex items-center gap-1">
                          <Input
                            className="w-40"
                            value={sampleCodeDraft[item.id] ?? ''}
                            placeholder="可留空"
                            onChange={(e) => setSampleCodeDraft((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          />
                          {isColorStale(item.sampleCodeLastUsedAt) && (
                            <span
                              className="text-warning"
                              title={`最後使用：${formatDate(item.sampleCodeLastUsedAt)}，超過 ${COLOR_STALE_MONTHS} 個月未使用`}
                            >
                              ⚠
                            </span>
                          )}
                        </div>
                      ) : (
                        <>
                          {item.sampleCode || '-'}
                          {isColorStale(item.sampleCodeLastUsedAt) && (
                            <span
                              className="ml-1 text-warning"
                              title={`最後使用：${formatDate(item.sampleCodeLastUsedAt)}，超過 ${COLOR_STALE_MONTHS} 個月未使用`}
                            >
                              ⚠
                            </span>
                          )}
                        </>
                      )}
                      {/* 色樣編號來源的表3（表3與染單為1:N）；沿用既有色號者無此連結 */}
                      {item.dyeRequestId && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          來源：
                          <Link to={`/dye-request/${item.dyeRequestId}`} className="text-brand-dark underline">
                            {item.dyeRequestId}
                          </Link>
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{item.colorMatchStandard || '-'}</TableCell>
                    <TableCell className="text-right">
                      {item.rollYard ?? '-'}
                      {item.rollYard ? (
                        <span className="ml-1 text-xs text-muted-foreground">
                          （≈ {formatNumber(yardToMeter(item.rollYard), 1)} 米）
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell>{item.fabricMaterial || '-'}</TableCell>
                    <TableCell>{item.fabricSpec || '-'}</TableCell>
                    <TableCell>{item.finishedSpec || '-'}</TableCell>
                    <TableCell className="text-right">{item.unitPrice != null ? formatNumber(item.unitPrice, 1) : '-'}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.pendingDyeQty, 0)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.inDyeQty, 0)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.finishedQty, 0)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 px-4">
            <p className="text-xs text-muted-foreground">
              合計：待染 {formatNumber(totals.pendingDyeQty, 0)} ／ 指染 {formatNumber(totals.inDyeQty, 0)} ／ 成品{' '}
              {formatNumber(totals.finishedQty, 0)} {order.unit}
            </p>
            {sampleCodeEditable && (
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                disabled={!sampleCodeDirty || saveSampleCodesMutation.isPending}
                onClick={() => saveSampleCodesMutation.mutate()}
              >
                {saveSampleCodesMutation.isPending ? '儲存中...' : '儲存色樣編號'}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
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
          <p className="text-sm text-ink-body">{order.note || '-'}</p>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">使用胚布</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField label="收布編號" value={order.greigeFabricCode} />
            <DetailField label="待染數量" value={`${formatNumber(totals.pendingDyeQty, 0)} ${order.unit}`} />
            <DetailField
              label="出貨檢樣"
              value={order.shippingSampleQty != null ? `${order.shippingSampleQty} ${order.unit}` : '-'}
            />
          </DetailGrid>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">受託加工廠資訊</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField label="公司" value={vendor?.name} />
            <DetailField label="地址" value={vendor?.address} />
            <DetailField label="廠商聯絡人" value={vendor?.contactPerson} />
            <DetailField label="皇加聯絡窗口" value={order.internalContact} />
          </DetailGrid>
        </CardContent>
      </Card>

      {order.status !== '草稿' && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              大貨樣確認送樣（退回不設次數上限，可反覆送樣；通過即結案，明細有加工方法者建立表5二次加工單，其餘建立表6入庫單）
            </CardTitle>
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

      {order.actualReceiptComparisons && order.actualReceiptComparisons.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">實際入庫數量對照（供參考，不覆蓋指染/成品計畫數量）</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {order.actualReceiptComparisons.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-2 text-ink-body">
                  <span className="text-muted-foreground">{formatDate(c.recordedAt)}</span>
                  <Link to={`/goods-receipt/${c.receiptId}`} className="text-brand-dark underline">
                    {c.receiptId}
                  </Link>
                  <span>
                    實際交付 {formatNumber(c.actualQty, 0)} {c.unit}
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PrintActions } from '@/components/print/PrintActions'
import { AbnormalNoticePrint } from './AbnormalNoticePrint'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/mocks/api'
import { getAccount, getCustomer, getVendor, vendorDisplayName } from '@/mocks/data'
import {
  completeAbnormalNotice,
  createReplacementShippingOrder,
  markAbnormalBatchRolls,
  registerReturnedRoll,
  reviewReturnedRoll,
  startAbnormalProcessing,
  updateAbnormalNoticeHandling,
} from '@/mocks/mutations'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { abnormalCloseDeadline, isAbnormalCloseOverdue, pendingAbnormalHandlings } from '@/lib/workflow'
import { ABNORMAL_CATEGORIES, type AbnormalCategoryName, type AbnormalHandling } from '@/types'

export function AbnormalNoticeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: abnormalNotices = [] } = useQuery({ queryKey: ['abnormalNotices'], queryFn: api.abnormalNotices })
  const { data: fabricLabels = [] } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })
  const notice = abnormalNotices.find((n) => n.id === id)

  // 處理方式與生管回覆的編輯草稿（結案前皆可調整）
  const [handling, setHandling] = useState<AbnormalHandling>({})
  const [productionReply, setProductionReply] = useState('')
  const [categoryName, setCategoryName] = useState<AbnormalCategoryName | undefined>()
  const [categoryItem, setCategoryItem] = useState<string | undefined>()
  useEffect(() => {
    if (!notice) return
    setHandling(notice.handling)
    setProductionReply(notice.productionReply ?? '')
    setCategoryName(notice.categoryName)
    setCategoryItem(notice.categoryItem)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notice?.id, notice?.handling, notice?.productionReply])

  const [returnRollCode, setReturnRollCode] = useState('')
  const [returnYard, setReturnYard] = useState('')
  const [batchSelection, setBatchSelection] = useState<string[]>([])

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['abnormalNotices'] }),
      queryClient.invalidateQueries({ queryKey: ['fabricLabels'] }),
      queryClient.invalidateQueries({ queryKey: ['shippingOrders'] }),
    ])

  const onError = (error: Error) => toast.error(error.message)

  const saveMutation = useMutation({
    mutationFn: () => updateAbnormalNoticeHandling(id!, { handling, productionReply, categoryName, categoryItem }),
    onSuccess: async () => {
      await invalidate()
      toast.success('處理方式與生管回覆已儲存')
    },
    onError,
  })

  const startMutation = useMutation({
    mutationFn: () => startAbnormalProcessing(id!),
    onSuccess: async () => {
      await invalidate()
      toast.success('已完成三方簽核，狀態轉為處理中，依處理方式分流')
    },
    onError,
  })

  const completeMutation = useMutation({
    mutationFn: () => completeAbnormalNotice(id!),
    onSuccess: async () => {
      await invalidate()
      toast.success('所有處理方式皆已完成，本單結案')
    },
    onError,
  })

  const registerMutation = useMutation({
    mutationFn: () => registerReturnedRoll(id!, { rollCode: returnRollCode || undefined, yard: Number(returnYard) }),
    onSuccess: async () => {
      await invalidate()
      setReturnRollCode('')
      setReturnYard('')
      toast.success('已登記退回布卷，待人工複核判定良品／瑕疵')
    },
    onError,
  })

  const reviewMutation = useMutation({
    mutationFn: (input: { index: number; verdict: '良品' | '瑕疵' }) => reviewReturnedRoll(id!, input.index, input.verdict),
    onSuccess: async (_data, input) => {
      await invalidate()
      toast.success(input.verdict === '良品' ? '複核為良品，條碼已復活回可用庫存' : '複核為瑕疵，條碼已轉為瑕疵／報廢')
    },
    onError,
  })

  const batchMutation = useMutation({
    mutationFn: () => markAbnormalBatchRolls(id!, batchSelection),
    onSuccess: async () => {
      await invalidate()
      setBatchSelection([])
      toast.success('同批條碼已標記為瑕疵／報廢，不可再被挑選出貨')
    },
    onError,
  })

  const replacementMutation = useMutation({
    mutationFn: () => createReplacementShippingOrder(id!),
    onSuccess: async (order) => {
      await invalidate()
      toast.success(`已建立換貨出貨單 ${order.id}`)
    },
    onError,
  })

  if (!notice) {
    return (
      <div className="text-sm text-muted-foreground">
        找不到單號 {id} 的異常通知單。
        <button className="ml-2 text-brand underline" onClick={() => navigate('/abnormal-notice')}>
          返回列表
        </button>
      </div>
    )
  }

  const isUpstream = notice.kind === '上游追討'
  const editable = notice.status !== '已完成'
  const customer = notice.customerId ? getCustomer(notice.customerId) : undefined
  const author = getAccount(notice.createdByAccountId)
  const categoryItems = ABNORMAL_CATEGORIES.find((c) => c.name === categoryName)?.items ?? ([] as readonly string[])
  const pending = pendingAbnormalHandlings(notice)
  const children = abnormalNotices.filter((n) => n.parentAbnormalId === notice.id)

  // 同批可標記的候選捲：同品名／同色且尚未出貨完畢、尚未標記者
  const batchCandidates = fabricLabels.filter(
    (l) =>
      l.productName === notice.productName &&
      l.color === notice.color &&
      (l.status === '已建立' || l.status === '已使用'),
  )

  return (
    <div>
      <Link to="/abnormal-notice" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回異常通知單列表
      </Link>

      <PageHeader
        title={notice.id}
        formCode={isUpstream ? '表9 附單' : '表9'}
        description={
          isUpstream ? (
            <>
              上游追討附單（向染整廠／供應商索取退貨或退款）
              {notice.parentAbnormalId && (
                <>
                  ，母單：
                  <Link to={`/abnormal-notice/${notice.parentAbnormalId}`} className="text-brand-dark underline">
                    {notice.parentAbnormalId}
                  </Link>
                </>
              )}
            </>
          ) : (
            <>
              受理日 {formatDate(notice.noticeDate)}　結案期限 {formatDate(abnormalCloseDeadline(notice.createdAt))}
            </>
          )
        }
        actions={
          <>
            <StatusBadge status={notice.status} className="text-sm" />
            <PrintActions
              sheets={[{ key: 'doc', label: isUpstream ? '列印附單' : '列印異常通知單', sheet: <AbnormalNoticePrint notice={notice} /> }]}
            />
            {notice.status === '受理中' && (
              <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={startMutation.isPending} onClick={() => startMutation.mutate()}>
                完成簽核，開始處理
              </Button>
            )}
            {notice.status === '處理中' && (
              <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={completeMutation.isPending} onClick={() => completeMutation.mutate()}>
                結案
              </Button>
            )}
          </>
        }
      />

      {isAbnormalCloseOverdue(notice) && (
        <p className="mb-4 flex items-start gap-1.5 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          本單成案已逾 12 個月仍未結案，視為異常，需另行追蹤原因。
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">關聯來源（唯讀帶入，僅異常數量為人工填寫）</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField label="製表人" value={author?.name ?? '-'} />
            <DetailField label="日期" value={formatDate(notice.noticeDate)} />
            <DetailField label={isUpstream ? '客戶（原客訴來源）' : '客戶'} value={customer?.shortName ?? '-'} />
            {/* 追溯鍵二擇一：委外染整走生產編號回表4，純採購沒有生產編號，改以表2訂購單追溯 */}
            <DetailField
              label="生產編號（→表4 染單）"
              value={
                notice.productionCode && notice.dyeOrderId ? (
                  <Link to={`/dye-order/${notice.dyeOrderId}`} className="text-brand-dark underline">
                    {notice.productionCode}
                  </Link>
                ) : (
                  (notice.productionCode ?? '-')
                )
              }
            />
            <DetailField
              label="關聯訂購單（純採購追溯鍵）"
              value={
                notice.purchaseOrderId ? (
                  <Link to={`/purchase-order/${notice.purchaseOrderId}`} className="text-brand-dark underline">
                    {notice.purchaseOrderId}
                  </Link>
                ) : (
                  '-'
                )
              }
            />
            <DetailField
              label="原出貨單（表8）"
              value={
                notice.shippingOrderId ? (
                  <Link to={`/shipping-order/${notice.shippingOrderId}`} className="text-brand-dark underline">
                    {notice.shippingOrderId}
                  </Link>
                ) : (
                  '-'
                )
              }
            />
            <DetailField label="出貨日期" value={notice.shipDate ? formatDate(notice.shipDate) : '-'} />
            <DetailField label="皇加品名" value={notice.productName || '-'} />
            <DetailField label="顏色" value={notice.color || '-'} />
            <DetailField label="出貨數量" value={`${formatNumber(notice.shippedQty, 1)} Y`} />
            <DetailField
              label="異常數量"
              value={<span className="font-semibold text-destructive">{formatNumber(notice.abnormalQty, 1)} Y</span>}
            />
            <DetailField label="異常問題分類" value={[notice.categoryName, notice.categoryItem].filter(Boolean).join('／') || '-'} />
          </DetailGrid>
          <div className="mt-3 rounded-lg border border-border bg-muted p-3 text-sm text-ink-body">
            <div className="mb-1 text-xs text-muted-foreground">異常問題</div>
            {notice.issueNote}
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">
            處理方式（可複選，非單選）與生管回覆
            {!editable && '　—　已結案，僅供檢視'}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>異常問題分類（大分類）</Label>
              <Select
                value={categoryName ?? ''}
                onValueChange={(v) => {
                  setCategoryName(v as AbnormalCategoryName)
                  setCategoryItem(undefined)
                }}
                disabled={!editable}
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
              <Label>細項（依大分類連動）</Label>
              <Select
                value={categoryItem ?? ''}
                onValueChange={setCategoryItem}
                disabled={!editable || categoryItems.length === 0}
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
          </div>

          <HandlingBlock
            title="退貨"
            note="依實際碼數退貨；退回布先進退貨暫存倉，人工複核後才決定條碼復活或報廢"
            disabled={!editable}
            checked={!!handling.returnGoods}
            onCheckedChange={(v) => setHandling((h) => ({ ...h, returnGoods: v ? { yard: notice.abnormalQty } : undefined }))}
          >
            <div className="space-y-1">
              <Label className="text-xs">退貨碼數 (Y)</Label>
              <Input
                type="number"
                step="0.1"
                disabled={!editable}
                value={handling.returnGoods?.yard ?? ''}
                onChange={(e) =>
                  setHandling((h) => ({ ...h, returnGoods: { ...h.returnGoods!, yard: Number(e.target.value) || 0 } }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">退貨費用估算</Label>
              <Input
                disabled={!editable}
                value={handling.returnGoods?.feeEstimate ?? ''}
                onChange={(e) =>
                  setHandling((h) => ({ ...h, returnGoods: { ...h.returnGoods!, feeEstimate: e.target.value } }))
                }
              />
            </div>
          </HandlingBlock>

          <HandlingBlock
            title="扣款不退貨"
            note="金額依異常程度，非全額；生管以本單為基準向廠商申請扣款"
            disabled={!editable}
            checked={!!handling.deduction}
            onCheckedChange={(v) => setHandling((h) => ({ ...h, deduction: v ? {} : undefined }))}
          >
            <div className="space-y-1">
              <Label className="text-xs">扣款金額</Label>
              <Input
                type="number"
                step="1"
                disabled={!editable}
                value={handling.deduction?.amount ?? ''}
                onChange={(e) =>
                  setHandling((h) => ({
                    ...h,
                    deduction: { ...h.deduction, amount: e.target.value === '' ? undefined : Number(e.target.value) },
                  }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">向廠商申請對象{isUpstream && '（本附單的上游廠商）'}</Label>
              <Select
                value={handling.deduction?.upstreamVendorId ?? ''}
                onValueChange={(v) => setHandling((h) => ({ ...h, deduction: { ...h.deduction, upstreamVendorId: v } }))}
                disabled={!editable}
              >
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
            title="補貨換貨"
            note="不另開換貨單：換貨＝本單＋新出貨單，新出貨單記錄來源表9單號"
            disabled={!editable}
            checked={!!handling.replacement}
            onCheckedChange={(v) => setHandling((h) => ({ ...h, replacement: v ? { yard: 0 } : undefined }))}
          >
            <div className="space-y-1">
              <Label className="text-xs">補出碼數 (Y)</Label>
              <Input
                type="number"
                step="0.1"
                disabled={!editable}
                value={handling.replacement?.yard ?? ''}
                onChange={(e) =>
                  setHandling((h) => ({ ...h, replacement: { ...h.replacement!, yard: Number(e.target.value) || 0 } }))
                }
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">運費估算</Label>
              <Input
                disabled={!editable}
                value={handling.replacement?.freightEstimate ?? ''}
                onChange={(e) =>
                  setHandling((h) => ({ ...h, replacement: { ...h.replacement!, freightEstimate: e.target.value } }))
                }
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">關聯新出貨單</Label>
              {notice.handling.replacement?.shippingOrderId ? (
                <div>
                  <Link to={`/shipping-order/${notice.handling.replacement.shippingOrderId}`} className="text-sm text-brand-dark underline">
                    {notice.handling.replacement.shippingOrderId}
                  </Link>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={notice.status !== '處理中' || replacementMutation.isPending}
                  onClick={() => replacementMutation.mutate()}
                >
                  <Plus className="mr-1 h-4 w-4" /> 建立換貨出貨單
                </Button>
              )}
            </div>
          </HandlingBlock>

          <HandlingBlock
            title="其他補償"
            note="自由文字，如補空運費用"
            disabled={!editable}
            checked={!!handling.other}
            onCheckedChange={(v) => setHandling((h) => ({ ...h, other: v ? { note: '' } : undefined }))}
          >
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">說明</Label>
              <Input
                disabled={!editable}
                value={handling.other?.note ?? ''}
                onChange={(e) => setHandling((h) => ({ ...h, other: { note: e.target.value } }))}
              />
            </div>
          </HandlingBlock>

          <div className="space-y-1.5">
            <Label>生管回覆（簽核第一欄；其餘三欄為列印後手簽）</Label>
            <Textarea rows={3} disabled={!editable} value={productionReply} onChange={(e) => setProductionReply(e.target.value)} />
          </div>

          {editable && (
            <div className="flex justify-end">
              <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
                {saveMutation.isPending ? '儲存中...' : '儲存處理方式與回覆'}
              </Button>
            </div>
          )}

          {notice.status === '處理中' && pending.length > 0 && (
            <p className="rounded-md border border-warning/40 bg-warning/5 p-2.5 text-xs text-warning">
              尚未完成：{pending.join('；')}
            </p>
          )}
        </CardContent>
      </Card>

      {notice.handling.returnGoods && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              退貨處理（退貨暫存倉→人工複核）
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                退貨暫存倉僅為倉庫實體分區，非布卷狀態；複核完成前條碼維持原狀態
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {notice.status === '處理中' && (
              <div className="mb-3 grid grid-cols-1 gap-3 rounded-lg border border-border p-3 sm:grid-cols-3">
                <div className="space-y-1">
                  <Label className="text-xs">退回布卷條碼（客戶端遺失條碼可留空）</Label>
                  <Select value={returnRollCode} onValueChange={setReturnRollCode}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="條碼遺失（改開新條碼）" />
                    </SelectTrigger>
                    <SelectContent>
                      {fabricLabels
                        .filter((l) => l.productName === notice.productName && l.color === notice.color)
                        .map((l) => (
                          <SelectItem key={l.id} value={l.rollCode}>
                            {l.rollCode}（{l.status}）
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">退回碼數 (Y)</Label>
                  <Input type="number" step="0.1" value={returnYard} onChange={(e) => setReturnYard(e.target.value)} />
                </div>
                <div className="flex items-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={registerMutation.isPending}
                    onClick={() => registerMutation.mutate()}
                  >
                    登記退回布卷
                  </Button>
                  {returnRollCode && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setReturnRollCode('')}>
                      改為條碼遺失
                    </Button>
                  )}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>原條碼</TableHead>
                    <TableHead className="text-right">退回碼數 (Y)</TableHead>
                    <TableHead>複核判定</TableHead>
                    <TableHead>複核後條碼</TableHead>
                    <TableHead>複核時間</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(notice.returnedRolls ?? []).map((roll, i) => (
                    <TableRow key={i}>
                      <TableCell>{roll.rollCode ?? <span className="text-muted-foreground">（條碼遺失）</span>}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatNumber(roll.yard, 1)}</TableCell>
                      <TableCell>
                        <StatusBadge status={roll.verdict} />
                      </TableCell>
                      <TableCell>
                        {roll.newRollCode ?? (roll.verdict === '良品' ? (roll.rollCode ?? '-') : '-')}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{roll.reviewedAt ? formatDateTime(roll.reviewedAt) : '-'}</TableCell>
                      <TableCell>
                        {roll.verdict === '待複核' && notice.status === '處理中' && (
                          <div className="flex gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              disabled={reviewMutation.isPending}
                              onClick={() => reviewMutation.mutate({ index: i, verdict: '良品' })}
                            >
                              良品（條碼復活）
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="text-destructive"
                              disabled={reviewMutation.isPending}
                              onClick={() => reviewMutation.mutate({ index: i, verdict: '瑕疵' })}
                            >
                              瑕疵（報廢）
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {(notice.returnedRolls ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground">
                        尚未登記退回布卷
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">瑕疵樣布／同批庫存標記</CardTitle>
        </CardHeader>
        <CardContent>
          {notice.batchDefectRollCodes.length > 0 && (
            <div className="mb-3 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive">
              下列條碼已標記為「瑕疵／報廢」，不可再被挑選出貨：
              <div className="mt-1 font-mono text-xs">
                {notice.batchDefectRollCodes.join('、')}（{notice.batchDefectRollCodes.length} 筆）
              </div>
            </div>
          )}
          {editable && (
            <>
              <p className="mb-2 text-xs text-muted-foreground">
                若同批未出貨庫存也有問題，勾選後一併標記為瑕疵／報廢。此動作不可復原，僅列出同品名同色、尚未出貨完畢的捲。
              </p>
              <div className="flex flex-wrap gap-1.5">
                {batchCandidates.map((l) => {
                  const selected = batchSelection.includes(l.rollCode)
                  return (
                    <button
                      key={l.id}
                      type="button"
                      className={`rounded border px-2 py-1 text-xs ${
                        selected ? 'border-destructive bg-destructive/10 text-destructive' : 'border-border bg-muted text-ink-body'
                      }`}
                      onClick={() =>
                        setBatchSelection((prev) =>
                          prev.includes(l.rollCode) ? prev.filter((c) => c !== l.rollCode) : [...prev, l.rollCode],
                        )
                      }
                    >
                      {l.rollCode}　{formatNumber(l.length, 1)}Y　{l.status}
                    </button>
                  )
                })}
                {batchCandidates.length === 0 && <span className="text-sm text-muted-foreground">同批沒有可標記的庫存捲</span>}
              </div>
              {batchSelection.length > 0 && (
                <div className="mt-3 flex justify-end">
                  <Button size="sm" variant="outline" className="text-destructive" disabled={batchMutation.isPending} onClick={() => batchMutation.mutate()}>
                    標記所選 {batchSelection.length} 捲為瑕疵／報廢
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">簽核（需列印後手簽）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {['主管簽名（董事長）', '業務簽名', '會計簽名'].map((label) => (
              <div key={label} className="space-y-1.5">
                <Label className="text-xs">{label}</Label>
                <Input disabled placeholder="列印後簽名" />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            三個簽名欄實際為列印後手簽，系統上不輸入；生管回覆為系統文字欄位，見上方卡片。
          </p>
        </CardContent>
      </Card>

      {!isUpstream && (
        <Card className="mt-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">
              上游追討附單
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                向染整廠追討為平行進行的獨立流程，與本單各自結案
              </span>
            </CardTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => navigate(`/abnormal-notice/new?kind=上游追討&parent=${notice.id}`)}
            >
              <Plus className="mr-1 h-4 w-4" /> 建立附單
            </Button>
          </CardHeader>
          <CardContent>
            {children.length === 0 ? (
              <p className="text-sm text-muted-foreground">尚未建立上游追討附單</p>
            ) : (
              <div className="space-y-2">
                {children.map((child) => {
                  const vendor = child.handling.deduction?.upstreamVendorId
                    ? getVendor(child.handling.deduction.upstreamVendorId)
                    : undefined
                  return (
                    <div key={child.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-2.5 text-sm">
                      <Link to={`/abnormal-notice/${child.id}`} className="font-medium text-brand-dark underline">
                        {child.id}
                      </Link>
                      <StatusBadge status={child.status} />
                      <Badge variant="outline">{vendorDisplayName(vendor) || '上游廠商未指定'}</Badge>
                      <span className="text-muted-foreground">受理日 {formatDate(child.noticeDate)}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/** 處理方式區塊：勾選後才展開子欄位，對應「可複選、非單選」的規則 */
function HandlingBlock({
  title,
  note,
  checked,
  disabled,
  onCheckedChange,
  children,
}: {
  title: string
  note: string
  checked: boolean
  disabled?: boolean
  onCheckedChange: (v: boolean) => void
  children: React.ReactNode
}) {
  return (
    <div className="rounded-lg border border-border p-3">
      <label className="flex cursor-pointer items-start gap-2">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 rounded border-input"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
        <span>
          <span className="text-sm font-medium text-ink">{title}</span>
          <span className="block text-xs text-muted-foreground">{note}</span>
        </span>
      </label>
      {checked && <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>}
    </div>
  )
}

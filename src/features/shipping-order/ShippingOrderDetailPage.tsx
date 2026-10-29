import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, RotateCcw, Save, Trash2, Undo2, X } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { ReadOnlyNotice } from '@/components/shared/ReadOnlyNotice'
import { RejectDialog } from '@/components/shared/RejectDialog'
import { useCurrentAccount } from '@/lib/current-account-context'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PrintActions } from '@/components/print/PrintActions'
import { ShippingOrderPrint } from './ShippingOrderPrint'
import { AddNoticeItemsDialog, type AddNoticeItemLine } from './AddNoticeItemsDialog'
import { MarkingPrint, SmallMarkingPrint } from '@/features/packing-notice/MarkingPrint'
import {
  shippingBoxNosFor,
  shippingItemNoticeId,
  shippingMarkingsFor,
  sameMarkings,
  shippingOrderNoticeIds,
  smallMarkingLines,
} from '@/lib/workflow'
import { PackagingSummary } from '@/components/shared/PackagingSummary'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/mocks/api'
import { getAccount, getCustomer } from '@/mocks/data'
import { GOODS_RECEIPT_PURPOSES, MARKING_SHAPES } from '@/types'
import {
  addShippingOrderItemsFromNotices,
  completeShippingOrder,
  rollsReservedByOtherNotices,
  removeNoticeFromShippingOrder,
  rejectShippingOrder,
  setShippingOrderStatus,
  updateShippingOrderItems,
  updateShippingOrderHeader,
  updateShippingOrderMarkings,
  updateShippingOrderRollCodes,
  updateShippingOrderSignatures,
} from '@/mocks/mutations'
import { formatDate } from '@/lib/dates'
import { formatNumber, meterToYard, yardToMeter } from '@/lib/units'
import { buildSecondaryProcessingPackaging } from '@/lib/workflow'
import type { PackingNoticeMarking, ShippingOrder, ShippingOrderItem, ShippingOrderSignatures } from '@/types'

export function ShippingOrderDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: shippingOrders = [] } = useQuery({ queryKey: ['shippingOrders'], queryFn: api.shippingOrders })
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: fabricLabels = [] } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })
  const order = shippingOrders.find((s) => s.id === id)
  /**
   * 售價幣別（決策143）：讀本單自己記下的值，不回頭查表1——
   * 看得到售價的財務沒有表1 的檢視權，回頭查會查不到，美金就被標成台幣。
   */
  const priceCurrency = order?.currency ?? 'NTD'

  const [signatures, setSignatures] = useState<ShippingOrderSignatures>({})
  useEffect(() => {
    if (order) setSignatures(order.signatures ?? {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  // 明細由包裝通知單帶入後可微調／刪除，供倉管於確認建單前調整實際出貨內容
  const [itemDraft, setItemDraft] = useState<ShippingOrderItem[]>([])
  // 箱/袋號輸入草稿：鍵為「表1單號#嘜頭組別索引」（合併單各表1 的嘜頭分開記，決策163）；
  // 與單頭一起按「儲存單頭資訊」寫入，未儲存則維持原狀
  const [boxNoDraft, setBoxNoDraft] = useState<Record<string, string>>({})
  const [addOpen, setAddOpen] = useState(false)
  /** 嘜頭輸入草稿（決策164）：鍵同箱/袋號「表1單號#組別索引」，按「儲存嘜頭」才寫入 */
  const [markingDraft, setMarkingDraft] = useState<Record<string, PackingNoticeMarking>>({})
  /** 單頭草稿：出貨日／類型／用途，僅草稿階段可改，按儲存才寫入 */
  const [headDraft, setHeadDraft] = useState({ shipDate: '', isSampleOrder: false, purpose: '', shippingAddress: '' })
  const [rejectOpen, setRejectOpen] = useState(false)
  /** 布疋條碼草稿（決策162）：依明細列序，「已建立」後由倉管填入，按儲存才寫入 */
  const [rollDraft, setRollDraft] = useState<string[][]>([])
  useEffect(() => {
    if (order) {
      setItemDraft(order.items)
      setRollDraft(order.items.map((item) => item.rollCodes))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id, order?.items])

  useEffect(() => {
    if (order) {
      setHeadDraft({
        shipDate: order.shipDate.slice(0, 10),
        isSampleOrder: order.isSampleOrder,
        purpose: order.purpose ?? '',
        shippingAddress: order.shippingAddress ?? '',
      })
      setBoxNoDraft({})
      setMarkingDraft({})
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?.id])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['shippingOrders'] })

  const saveHeadMutation = useMutation({
    mutationFn: () =>
      updateShippingOrderHeader(id!, {
        shipDate: headDraft.shipDate,
        isSampleOrder: headDraft.isSampleOrder,
        purpose: (headDraft.purpose || undefined) as ShippingOrder['purpose'],
        shippingAddress: headDraft.shippingAddress,
        markingBoxNos: markingBoxNoPayload(order!.parentId),
        otherMarkingBoxNos: Object.fromEntries(
          sourceNotices.filter((n) => n.id !== order!.parentId).map((n) => [n.id, markingBoxNoPayload(n.id)]),
        ),
      }),
    onSuccess: async () => {
      await invalidate()
      toast.success('單頭資訊已儲存')
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

  /** 合併出貨（決策163）：被移空的草稿會刪除，提示使用者是哪幾張 */
  const addItemsMutation = useMutation({
    mutationFn: (lines: AddNoticeItemLine[]) => addShippingOrderItemsFromNotices(id!, lines),
    onSuccess: async ({ removedDraftIds }) => {
      await invalidate()
      setAddOpen(false)
      toast.success(
        removedDraftIds.length > 0
          ? `已加入明細；${removedDraftIds.join('、')} 的明細已全數移入本單，該草稿已刪除`
          : '已加入明細，其他草稿中對應的數量已扣除',
      )
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const removeNoticeMutation = useMutation({
    mutationFn: (noticeId: string) => removeNoticeFromShippingOrder(id!, noticeId),
    onSuccess: async () => {
      await invalidate()
      toast.success('已移除該表1 的明細，數量回到未排')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const saveMarkingsMutation = useMutation({
    mutationFn: () =>
      updateShippingOrderMarkings(id!, {
        markings: Object.fromEntries(
          sourceNotices.map((n) => [
            n.id,
            shippingMarkingsFor(order!, n.id, n.markings).map((m, i) => markingDraft[`${n.id}#${i}`] ?? m),
          ]),
        ),
        boxNos: Object.fromEntries(sourceNotices.map((n) => [n.id, markingBoxNoPayload(n.id)])),
      }),
    onSuccess: async () => {
      await invalidate()
      setMarkingDraft({})
      setBoxNoDraft({})
      toast.success('嘜頭已儲存（只改本張出貨單，不回寫表1）')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const saveRollsMutation = useMutation({
    mutationFn: () => updateShippingOrderRollCodes(id!, rollDraft),
    onSuccess: async () => {
      await invalidate()
      toast.success('布疋條碼已儲存')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const permissions = useCurrentAccount()

  /**
   * 表8 退回草稿（權限規格第四章第 3 節）：僅「已建立」可退回。
   * 「已完成」不可退——扣庫存已發生，退回等於要回沖庫存，性質上屬異常處理，應走表9。
   */
  const rejectMutation = useMutation({
    mutationFn: (reason: string) => rejectShippingOrder(id!, reason),
    onSuccess: async (updated) => {
      await invalidate()
      toast.success(`${updated.id} 已退回草稿，回到業務手上可編輯`)
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
      // 部分出貨的捲仍在庫（決策166），但實體標籤上印的長度已過時：提醒重印，不強制
      const partial = (await api.fabricLabels()).filter(
        (l) => l.status === '在庫' && l.shipments?.some((s) => s.shippingOrderId === updated.id),
      )
      if (partial.length > 0) {
        toast.info(`布卷 ${partial.map((l) => l.rollCode).join('、')} 出貨後仍有剩餘，長度已變動，建議重印標籤`)
      }
    },
    onError: (error: Error) => toast.error(error.message),
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
  // 草稿內容（明細、單頭、簽名欄）在寫入端檢查「編輯草稿」，畫面同一把尺
  const canEditDraft = permissions.can('表8', '編輯草稿')
  const itemsEditable = order.status === '草稿' && canEditDraft
  const itemsDirty = JSON.stringify(itemDraft) !== JSON.stringify(order.items)
  // 布疋條碼（決策162）：業務建草稿可留空，「已建立」後由倉管填入，每列都有才能確認出貨
  const rollsEditable = order.status === '已建立' && permissions.can('表8', '填入布疋條碼')
  const rollsDirty = JSON.stringify(rollDraft) !== JSON.stringify(order.items.map((item) => item.rollCodes))
  const missingRollRows = order.items.map((item, i) => (item.rollCodes.length === 0 ? i + 1 : 0)).filter(Boolean)
  const usedElsewhere = new Set(rollDraft.flat())
  // 被其他表1 預留的捲（決策167）：可以挑，確認出貨時才轉移預留；畫面逐列提醒
  const reservedByOthers = rollsEditable ? rollsReservedByOtherNotices(order, rollDraft) : rollsReservedByOtherNotices(order)
  const reservedByOtherCodes = new Set(reservedByOthers.map((r) => r.rollCode))
  /** 可挑的布卷：尚可出貨者，同品名同色排前面；其他列已選的不重複列出 */
  const rollOptionsFor = (item: ShippingOrderItem, row: number) =>
    fabricLabels
      .filter((l) => l.status !== '已完成' && l.status !== '已終止' && l.status !== '瑕疵／報廢')
      .filter((l) => !usedElsewhere.has(l.rollCode) || rollDraft[row]?.includes(l.rollCode))
      .filter((l) => !rollDraft[row]?.includes(l.rollCode))
      .map((l) => ({ label: l, match: l.productName === item.roricaProductName && l.color === item.color }))
      .sort((a, b) => Number(b.match) - Number(a.match))
  // 主表1：數量基準以它為準；合併單（決策163）的其他表1 由明細推算，嘜頭與包裝依表1 分段呈現
  const notice = packingNotices.find((n) => n.id === order.parentId)
  const noticeIds = shippingOrderNoticeIds(order)
  const merged = noticeIds.length > 1
  const sourceNotices = noticeIds
    .map((nid) => packingNotices.find((n) => n.id === nid))
    .filter((n): n is NonNullable<typeof n> => Boolean(n))
  // 嘜頭：表8 改過的（決策164）優先，否則帶表1 的
  const markingGroups = sourceNotices.flatMap((n) => {
    const list = shippingMarkingsFor(order, n.id, n.markings)
    return list.map((marking, index) => ({ notice: n, marking, index, count: list.length }))
  })
  const markingKey = (g: (typeof markingGroups)[number]) => `${g.notice.id}#${g.index}`
  const draftMarking = (g: (typeof markingGroups)[number]) => markingDraft[markingKey(g)] ?? g.marking
  const patchMarking = (g: (typeof markingGroups)[number], patch: Partial<PackingNoticeMarking>) =>
    setMarkingDraft((prev) => ({ ...prev, [markingKey(g)]: { ...draftMarking(g), ...patch } }))
  const markingsDirty = Object.keys(markingDraft).length > 0 || Object.keys(boxNoDraft).length > 0
  const numOrUndef = (v: string) => (v === '' ? undefined : Number(v))
  /** 嘜頭組別的名稱：合併單加上表1 單號，否則沿用「嘜頭 N」 */
  const markingLabel = (g: (typeof markingGroups)[number], prefix: string) =>
    merged ? `${prefix} ${g.notice.id}${g.count > 1 ? `-${g.index + 1}` : ''}` : g.count > 1 ? `${prefix} ${g.index + 1}` : prefix
  // 箱/袋號：逐組嘜頭各一個，草稿階段填寫，與單頭一起手動儲存
  const boxNoOf = (noticeId: string, index: number) =>
    boxNoDraft[`${noticeId}#${index}`] ?? shippingBoxNosFor(order, noticeId)?.[index] ?? ''
  /** 送出時以該表1 嘜頭組數為長度，缺的補空字串，避免索引與嘜頭組別錯位 */
  const markingBoxNoPayload = (noticeId: string) =>
    shippingMarkingsFor(order, noticeId, packingNotices.find((n) => n.id === noticeId)?.markings).map((_, i) =>
      boxNoOf(noticeId, i),
    )
  const canMerge = itemsEditable && !order.sourceAbnormalId
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
            {noticeIds.map((nid, i) => (
              <span key={nid}>
                {i > 0 && '、'}
                <Link to={`/packing-notice/${nid}`} className="text-brand-dark underline">
                  {nid}
                </Link>
              </span>
            ))}
            {merged && '（合併出貨，第一張為主表1）'}
          </>
        }
        actions={
          <>
            <StatusBadge status={order.status} className="text-sm" />
            <PrintActions
              outboundDoc="表8 出貨單"
              sheets={[
                { key: 'doc', label: '列印出貨單', sheet: <ShippingOrderPrint order={order} /> },
                // 嘜頭資料維護於表1，但貼箱是出貨當下的動作，故列印入口放在表8。
                // 一張單可能有多組嘜頭，各自一張 A4，故列印選單逐組列出。
                // 合併單（決策163）各表1 的嘜頭不同，逐表1、逐組列出
                ...markingGroups.map((g) => ({
                  key: `marking-${g.notice.id}-${g.index}`,
                  label: markingLabel(g, '列印嘜頭'),
                  // 列印取已儲存的箱/袋號：未按儲存的輸入不應印到對外的嘜頭上
                  sheet: <MarkingPrint marking={g.marking} boxNo={shippingBoxNosFor(order, g.notice.id)?.[g.index] ?? ''} />,
                })),
                // 小嘜頭縫在布疋上，只有勾選加印的嘜頭組別才有，故僅就這些組別提供入口
                ...markingGroups.flatMap((g) =>
                  g.marking.hasSmallMarking
                    ? [
                        {
                          key: `small-marking-${g.notice.id}-${g.index}`,
                          label: markingLabel(g, '列印小嘜頭'),
                          sheet: <SmallMarkingPrint marking={g.marking} />,
                        },
                      ]
                    : [],
                ),
              ]}
            />
            {order.status === '草稿' && permissions.can('表8', '建立') && (
              <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={buildMutation.isPending} onClick={() => buildMutation.mutate()}>
                建立出貨單
              </Button>
            )}
            {order.status === '已建立' && (
              <>
                {/* 出貨完成會觸發扣庫存：生管、倉管可按，且不得為本單的建立者（權限規格第七章第 1 節、決策61） */}
                {permissions.can('表8', '改為出貨完成') &&
                  (() => {
                    const blocked =
                      permissions.blockedReason('表8', '改為出貨完成', order.createdByAccountId) ??
                      (missingRollRows.length > 0
                        ? `第 ${missingRollRows.join('、')} 項明細尚未填入布疋條碼，須由倉管補齊`
                        : undefined)
                    return (
                      <Button
                        size="sm"
                        className="bg-brand hover:bg-brand-dark"
                        disabled={completeMutation.isPending || Boolean(blocked)}
                        title={blocked}
                        onClick={() => completeMutation.mutate()}
                      >
                        確認出貨完成
                      </Button>
                    )
                  })()}
                {permissions.can('表8', '退回') && (
                  <Button
                    size="sm"
                    className="bg-reject text-reject-foreground hover:bg-reject/90"
                    disabled={rejectMutation.isPending}
                    onClick={() => setRejectOpen(true)}
                  >
                    <Undo2 className="mr-1 h-4 w-4" /> 退回
                  </Button>
                )}
              </>
            )}
          </>
        }
      />

      <ReadOnlyNotice doc="表8" />

      {canMerge && (
        <AddNoticeItemsDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          order={order}
          packingNotices={packingNotices}
          shippingOrders={shippingOrders}
          pending={addItemsMutation.isPending}
          onConfirm={(lines) => addItemsMutation.mutate(lines)}
        />
      )}

      {order.status === '已建立' && missingRollRows.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          第 {missingRollRows.join('、')} 項明細尚未填入布疋條碼——
          {rollsEditable ? '請在出貨明細挑選實際出貨的布卷後儲存，' : '待倉管填入，'}
          全部填齊後才能確認出貨完成。
        </div>
      )}

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`退回 ${order.id}`}
        description="退回後本單回到草稿，回到業務手上可編輯。已確認出貨完成者不可退回——扣庫存已經發生，該走表9 異常通知單。"
        pending={rejectMutation.isPending}
        onConfirm={(reason) => {
          setRejectOpen(false)
          rejectMutation.mutate(reason)
        }}
      />

      {/* 歷次退回（決策37）：不覆蓋前次、不設次數上限；反覆退回本身即為異常訊號 */}
      {order.rejections && order.rejections.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-surface p-3 text-sm">
          <p className="font-medium text-ink">退回紀錄（{order.rejections.length} 次）</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {order.rejections.map((r, i) => (
              <li key={i}>
                {formatDate(r.at)}　{getAccount(r.byAccountId)?.name ?? r.byAccountId}：{r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">單頭資訊</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField label="客戶" value={customer?.shortName} />
            {itemsEditable ? (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">類型</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={headDraft.isSampleOrder ? 'sample' : 'normal'}
                  onChange={(e) => setHeadDraft((d) => ({ ...d, isSampleOrder: e.target.value === 'sample' }))}
                >
                  <option value="normal">一般出貨</option>
                  <option value="sample">樣品單</option>
                </select>
              </div>
            ) : (
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
            )}
            {itemsEditable ? (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">出貨日</label>
                <Input
                  type="date"
                  value={headDraft.shipDate}
                  onChange={(e) => setHeadDraft((d) => ({ ...d, shipDate: e.target.value }))}
                />
              </div>
            ) : (
              <DetailField label="出貨日" value={formatDate(order.shipDate)} />
            )}
            {/*
              收貨地址：建單時沿 PI → 表1 帶入，草稿階段可改（決策133）。
              編輯時**一律顯示輸入框**，即使原本沒有值——上游沒帶到地址時，
              若沿用「有值才顯示」的寫法，這張單就永遠補不上地址。
            */}
            {itemsEditable ? (
              <div className="space-y-1 sm:col-span-2">
                <label className="text-xs text-muted-foreground">收貨地址</label>
                <Input
                  value={headDraft.shippingAddress}
                  onChange={(e) => setHeadDraft((d) => ({ ...d, shippingAddress: e.target.value }))}
                  placeholder="自表1 帶入，可改為本次實際送達地點；留白則不印"
                />
              </div>
            ) : (
              order.shippingAddress && <DetailField label="收貨地址" value={order.shippingAddress} />
            )}
            <DetailField label="倉管人員" value={operator?.name ?? '-'} />
            {/* 決策117：改記並列印操作帳號姓名，不再依角色推導部門 */}
            <DetailField label="出倉部門" value={operator?.name ?? '-'} />
            {itemsEditable ? (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">用途</label>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={headDraft.purpose}
                  onChange={(e) => setHeadDraft((d) => ({ ...d, purpose: e.target.value }))}
                >
                  <option value="">請選擇</option>
                  {GOODS_RECEIPT_PURPOSES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <DetailField label="用途" value={order.purpose ?? '-'} />
            )}
          </DetailGrid>
          {itemsEditable && (
            <div className="mt-3 flex justify-end">
              {/* 手動儲存：沒按就維持原狀 */}
              <Button
                variant="outline"
                size="sm"
                disabled={saveHeadMutation.isPending || !headDraft.shipDate}
                onClick={() => saveHeadMutation.mutate()}
              >
                <Save className="mr-1 h-4 w-4" /> 儲存單頭資訊
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">
            出貨明細（{itemsEditable ? itemDraft.length : order.items.length} 項）
            {itemsEditable && '　—　由包裝通知單帶入，確認建單前可微調數量／售價或刪除品項；布疋條碼由倉管於建立後填入'}
            {rollsEditable && '　—　請填入實際出貨的布疋條碼（拼接時可選多捲）'}
          </CardTitle>
          {canMerge && (
            <div className="pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                <Plus className="mr-1 h-4 w-4" /> 從其他表1 加入明細
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent className="px-0">
          {merged && (
            <div className="mb-3 flex flex-wrap items-center gap-2 px-4 text-xs text-muted-foreground">
              合併出貨：
              {noticeIds.map((nid) => (
                <span key={nid} className="inline-flex items-center gap-1 rounded border border-border bg-muted px-1.5 py-0.5 text-ink-body">
                  {nid}
                  {nid === order.parentId ? (
                    <span className="text-muted-foreground">（主）</span>
                  ) : (
                    canMerge && (
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive"
                        title={`移除 ${nid} 的明細`}
                        disabled={removeNoticeMutation.isPending || itemsDirty}
                        onClick={() => removeNoticeMutation.mutate(nid)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )
                  )}
                </span>
              ))}
            </div>
          )}
          <div className="overflow-x-auto">
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  {merged && <TableHead>來源表1</TableHead>}
                  <TableHead>客戶品名</TableHead>
                  <TableHead>皇加品名</TableHead>
                  <TableHead>色號</TableHead>
                  <TableHead>布卷條碼（拼接時為捲號組合）</TableHead>
                  <TableHead className="text-right">數量 ({itemUnit})</TableHead>
                  <TableHead className="text-right">售價 ({priceCurrency}/Y)</TableHead>
                  <TableHead className="text-right">金額 ({priceCurrency})</TableHead>
                  <TableHead>備註</TableHead>
                  {itemsEditable && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(itemsEditable ? itemDraft : order.items).map((item, i) => (
                  <TableRow key={`${item.rollCodes.join('+')}-${i}`}>
                    {merged && <TableCell className="whitespace-nowrap">{shippingItemNoticeId(order, item)}</TableCell>}
                    <TableCell>{item.customerProductName || '-'}</TableCell>
                    <TableCell>{item.roricaProductName || '-'}</TableCell>
                    <TableCell>{item.color || '-'}</TableCell>
                    <TableCell>
                      {rollsEditable ? (
                        <div className="min-w-[14rem] space-y-1">
                          {(rollDraft[i] ?? []).length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {(rollDraft[i] ?? []).map((code) => (
                                <button
                                  key={code}
                                  type="button"
                                  className="rounded border border-border bg-muted px-1.5 py-0.5 text-xs text-ink-body hover:border-destructive hover:text-destructive"
                                  onClick={() =>
                                    setRollDraft((prev) => prev.map((codes, ci) => (ci === i ? codes.filter((c) => c !== code) : codes)))
                                  }
                                >
                                  {code} ×
                                </button>
                              ))}
                            </div>
                          )}
                          {(rollDraft[i] ?? []).some((code) => reservedByOtherCodes.has(code)) && (
                            <p className="text-xs text-warning">
                              {(rollDraft[i] ?? []).filter((code) => reservedByOtherCodes.has(code)).join('、')}{' '}
                              已被其他表1 預留，確認出貨完成時會從原預留轉移
                            </p>
                          )}
                          <select
                            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                            value=""
                            onChange={(e) => {
                              const code = e.target.value
                              if (!code) return
                              setRollDraft((prev) => prev.map((codes, ci) => (ci === i ? [...codes, code] : codes)))
                            }}
                          >
                            <option value="">{(rollDraft[i] ?? []).length > 0 ? '再加入一卷（拼接）' : '請選擇布卷條碼'}</option>
                            {rollOptionsFor(item, i).map(({ label, match }) => (
                              <option key={label.id} value={label.rollCode}>
                                {match ? '' : '［品名／色號不同］'}
                                {label.rollCode}（{label.productName}／{label.color}，{formatNumber(label.length, 1)}Y）
                                {rollsReservedByOtherNotices({ parentId: order.parentId, items: [item] }, [[label.rollCode]]).length > 0
                                  ? '［已被其他表1 預留，出貨時轉移］'
                                  : ''}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : item.rollCodes.length > 0 ? (
                        item.rollCodes.join('＋')
                      ) : (
                        <span className="text-xs text-muted-foreground">待倉管填入</span>
                      )}
                    </TableCell>
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
                          step="0.01"
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
                        formatNumber(item.unitPrice, 2)
                      ) : (
                        '-'
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {item.unitPrice != null ? formatNumber(item.yard * item.unitPrice, 2) : '-'}
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
          {rollsEditable && (
            <div className="mt-3 flex justify-end px-4">
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                disabled={!rollsDirty || saveRollsMutation.isPending}
                onClick={() => saveRollsMutation.mutate()}
              >
                {saveRollsMutation.isPending ? '儲存中...' : '儲存布疋條碼'}
              </Button>
            </div>
          )}
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
      {sourceNotices.map((n) => (
        <Card key={n.id} className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              包裝設定（帶入自表1包裝通知單{merged ? ` ${n.id}` : ''}）
            </CardTitle>
          </CardHeader>
          <CardContent>
            <PackagingSummary packaging={buildSecondaryProcessingPackaging(n)} />
          </CardContent>
        </Card>
      ))}

      {markingGroups.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              嘜頭（帶入自表1包裝通知單{markingGroups.length > 1 ? `，共 ${markingGroups.length} 組` : ''}）
              {itemsEditable && '　—　草稿階段各欄位皆可修改，只改本張出貨單，不回寫表1'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {markingGroups.map((g) => {
              const { index } = g
              const marking = draftMarking(g)
              const original = g.notice.markings?.[index]
              const changed = Boolean(original) && !sameMarkings([marking], [original!])
              return (
              <div key={`${g.notice.id}-${index}`} className={markingGroups.length > 1 ? 'rounded-lg border border-border p-3' : undefined}>
                {markingGroups.length > 1 && (
                  // 名稱對應列印選單的「列印嘜頭 …」，貼箱時才知道印出來的是哪一組
                  <div className="mb-2 text-xs font-medium text-muted-foreground">{markingLabel(g, '嘜頭')}</div>
                )}
                {/* 箱/袋號是出貨當下才知道的資訊（箱袋編到幾號），故在表8 填寫；
                    草稿階段可輸入，與單頭一起儲存，確認建立後轉為唯讀 */}
                <div className="mb-3 space-y-1">
                  <Label className="text-xs">箱/袋號（列印嘜頭用）</Label>
                  {itemsEditable ? (
                    <Input
                      className="w-56"
                      value={boxNoOf(g.notice.id, index)}
                      placeholder="非必填，例：C/NO 1-20"
                      onChange={(e) => setBoxNoDraft((prev) => ({ ...prev, [`${g.notice.id}#${index}`]: e.target.value }))}
                    />
                  ) : (
                    <div className="text-sm text-ink-body">{shippingBoxNosFor(order, g.notice.id)?.[index] || '-'}</div>
                  )}
                </div>
                {itemsEditable ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <div className="space-y-1">
                        <Label className="text-xs">嘜頭形狀</Label>
                        <select
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={marking.shape}
                          onChange={(e) => patchMarking(g, { shape: e.target.value as PackingNoticeMarking['shape'] })}
                        >
                          {MARKING_SHAPES.map((shape) => (
                            <option key={shape} value={shape}>
                              {shape}
                            </option>
                          ))}
                        </select>
                      </div>
                      {/* 客戶簡稱取自客戶主檔、嘜頭列印不印（決策144），僅供對照 */}
                      <DetailField label="客戶簡稱（取自客戶主檔）" value={customer?.shortName} />
                      <div className="space-y-1">
                        <Label className="text-xs">運送目的地</Label>
                        <Input value={marking.destination ?? ''} onChange={(e) => patchMarking(g, { destination: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">毛重(Kg)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={marking.grossWeightKg ?? ''}
                          onChange={(e) => patchMarking(g, { grossWeightKg: numOrUndef(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">淨重(Kg)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.1"
                          value={marking.netWeightKg ?? ''}
                          onChange={(e) => patchMarking(g, { netWeightKg: numOrUndef(e.target.value) })}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">成分</Label>
                        <Input value={marking.composition ?? ''} onChange={(e) => patchMarking(g, { composition: e.target.value })} />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">產地</Label>
                        <Input value={marking.origin ?? ''} onChange={(e) => patchMarking(g, { origin: e.target.value })} />
                        <label className="flex items-center gap-1.5 pt-1 text-xs text-ink-body">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5"
                            checked={Boolean(marking.hasRoc)}
                            onChange={(e) => patchMarking(g, { hasRoc: e.target.checked })}
                          />
                          產地下方加印 R.O.C.
                        </label>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">抬頭文字</Label>
                      <Textarea
                        rows={2}
                        value={marking.headerText ?? ''}
                        onChange={(e) => patchMarking(g, { headerText: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="flex items-center gap-1.5 text-xs text-ink-body">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5"
                          checked={marking.hasSmallMarking}
                          onChange={(e) => patchMarking(g, { hasSmallMarking: e.target.checked })}
                        />
                        加印小嘜頭
                      </label>
                      {marking.hasSmallMarking && (
                        <Textarea
                          rows={3}
                          placeholder="一行一列；第一行固定印 MADE IN TAIWAN，不必輸入"
                          value={marking.smallMarkingText ?? ''}
                          onChange={(e) => patchMarking(g, { smallMarkingText: e.target.value })}
                        />
                      )}
                    </div>
                    {changed && original && (
                      <div className="flex items-center justify-between gap-2 rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                        已與表1 {g.notice.id} 的嘜頭不同（只影響本張出貨單）
                        <Button type="button" variant="ghost" size="sm" onClick={() => patchMarking(g, original)}>
                          <RotateCcw className="mr-1 h-3.5 w-3.5" /> 還原為表1 內容
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                <DetailGrid>
                  <DetailField label="嘜頭形狀" value={marking.shape} />
                  <DetailField label="客戶簡稱" value={customer?.shortName} />
                  <DetailField label="抬頭文字" value={marking.headerText || '-'} />
                  <DetailField label="運送目的地" value={marking.destination || '-'} />
                  <DetailField label="毛重(Kg)" value={marking.grossWeightKg != null ? formatNumber(marking.grossWeightKg, 1) : '-'} />
                  <DetailField label="淨重(Kg)" value={marking.netWeightKg != null ? formatNumber(marking.netWeightKg, 1) : '-'} />
                  <DetailField label="成分" value={marking.composition || '-'} />
                  <DetailField label="產地" value={marking.origin || '-'} />
                  <DetailField label="R.O.C." value={marking.hasRoc ? '加印' : '否'} />
                  <DetailField
                    label="小嘜頭"
                    value={marking.hasSmallMarking ? smallMarkingLines(marking.smallMarkingText).join('／') : '否'}
                  />
                </DetailGrid>
                )}
                {!itemsEditable && changed && (
                  <p className="mt-2 text-xs text-muted-foreground">本組嘜頭已於出貨單修改，與表1 {g.notice.id} 不同</p>
                )}
              </div>
              )
            })}
            {itemsEditable && (
              <div className="flex justify-end">
                <Button
                  type="button"
                  size="sm"
                  className="bg-brand hover:bg-brand-dark"
                  disabled={!markingsDirty || saveMarkingsMutation.isPending}
                  onClick={() => saveMarkingsMutation.mutate()}
                >
                  <Save className="mr-1 h-4 w-4" /> 儲存嘜頭
                </Button>
              </div>
            )}
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
              {canEditDraft ? (
                <Input value={signatures.processedBy ?? ''} onChange={(e) => setSignatures((s) => ({ ...s, processedBy: e.target.value }))} />
              ) : (
                <div className="text-sm text-ink">{order.signatures?.processedBy || '-'}</div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">倉管</Label>
              {canEditDraft ? (
                <Input value={signatures.warehouse ?? ''} onChange={(e) => setSignatures((s) => ({ ...s, warehouse: e.target.value }))} />
              ) : (
                <div className="text-sm text-ink">{order.signatures?.warehouse || '-'}</div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">出貨</Label>
              {canEditDraft ? (
                <Input value={signatures.shipped ?? ''} onChange={(e) => setSignatures((s) => ({ ...s, shipped: e.target.value }))} />
              ) : (
                <div className="text-sm text-ink">{order.signatures?.shipped || '-'}</div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">業務</Label>
              {canEditDraft ? (
                <Input value={signatures.sales ?? ''} onChange={(e) => setSignatures((s) => ({ ...s, sales: e.target.value }))} />
              ) : (
                <div className="text-sm text-ink">{order.signatures?.sales || '-'}</div>
              )}
            </div>
          </div>
          {canEditDraft && (
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="outline" size="sm" disabled={saveSignaturesMutation.isPending} onClick={() => saveSignaturesMutation.mutate()}>
                儲存簽名欄
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

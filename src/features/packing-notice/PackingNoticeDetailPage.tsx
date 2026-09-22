import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Lock, Pencil, Send, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { AuditTrailCard } from '@/components/shared/AuditTrailCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PrintActions } from '@/components/print/PrintActions'
import { PackingNoticePrint } from './PackingNoticePrint'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/mocks/api'
import { accounts, getCustomer, productBranchSuffix, vendorDisplayName } from '@/mocks/data'
import {
  applyCustomSplicingCombination,
  approvePackingNotice,
  confirmSplicingSuggestion,
  rejectPackingNotice,
  rejectSplicingSuggestion,
  submitPackingNoticeForApproval,
} from '@/mocks/mutations'
import { useCurrentAccount } from '@/lib/current-account-context'
import { CustomSplicingDialog } from './CustomSplicingDialog'
import { formatDate, formatDateTime } from '@/lib/dates'
import { lookupColorSample } from '@/lib/colors'
import { ColorLookupBadge } from '@/components/shared/ColorLookupBadge'
import { ColorSwatch } from '@/components/shared/ColorSwatch'
import { digitalColorFor } from '@/lib/digital-color'
import { formatNumber, meterToYard } from '@/lib/units'
import { effectiveReservationStatus, isExactMultipleOfStandard } from '@/lib/inventory'
import {
  colorRatioText,
  isPackingNoticeEditable,
  packingNoticeApprovalState,
  packingNoticeLocks,
  isPackingNoticeFullyShipped,
} from '@/lib/workflow'
import { MarkingPreview, SmallMarkingPreview } from './MarkingPrint'
import { smallMarkingLines } from '@/lib/workflow'

export function PackingNoticeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: notices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })
  const { data: fabricLabels = [] } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })
  const { data: dyeRequests = [] } = useQuery({ queryKey: ['dyeRequests'], queryFn: api.dyeRequests })
  const { data: dyeOrders = [] } = useQuery({ queryKey: ['dyeOrders'], queryFn: api.dyeOrders })
  const { data: goodsReceipts = [] } = useQuery({ queryKey: ['goodsReceipts'], queryFn: api.goodsReceipts })
  const { data: secondaryProcessingOrders = [] } = useQuery({
    queryKey: ['secondaryProcessingOrders'],
    queryFn: api.secondaryProcessingOrders,
  })
  const { data: shippingOrders = [] } = useQuery({ queryKey: ['shippingOrders'], queryFn: api.shippingOrders })
  const { data: stockReservations = [] } = useQuery({ queryKey: ['stockReservations'], queryFn: api.stockReservations })
  const { data: splicingSuggestions = [] } = useQuery({ queryKey: ['splicingSuggestions'], queryFn: api.splicingSuggestions })
  const { data: products = [] } = useQuery({ queryKey: ['products'], queryFn: api.products })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })

  /** 拼接建議的處理結果會連動庫存預留與出貨單草稿，故一併重新整理 */
  const invalidateSplicing = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['splicingSuggestions'] }),
      queryClient.invalidateQueries({ queryKey: ['stockReservations'] }),
      queryClient.invalidateQueries({ queryKey: ['shippingOrders'] }),
      queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] }),
    ])
  }

  const confirmSplicingMutation = useMutation({
    mutationFn: (suggestionId: string) => confirmSplicingSuggestion(suggestionId),
    onSuccess: async () => {
      await invalidateSplicing()
      toast.success('已採用拼接組合，並建立庫存預留與出貨單草稿明細')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const rejectSplicingMutation = useMutation({
    mutationFn: (suggestionId: string) => rejectSplicingSuggestion(suggestionId),
    onSuccess: async () => {
      await invalidateSplicing()
      toast.success('已改為整捲＋裁切出貨；整捲仍不足者已改走無現貨路徑（表2訂購單草稿）')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const permissions = useCurrentAccount()
  // 開著自訂拼接對話框的那一筆**表1 明細**（兩個入口共用，故以明細為鍵）
  const [customSplicingItemId, setCustomSplicingItemId] = useState<string | null>(null)

  const customSplicingMutation = useMutation({
    mutationFn: ({ itemId, rollCodes, note }: { itemId: string; rollCodes: string[]; note: string }) =>
      applyCustomSplicingCombination(id!, itemId, rollCodes, note),
    onSuccess: async () => {
      await invalidateSplicing()
      setCustomSplicingItemId(null)
      toast.success('已採用自訂拼接組合，並重建庫存預留')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  /**
   * 決策118 的三個動作：送簽 → 簽核 → （或）退回草稿。
   * 簽核成功時才會建立表2／表8 草稿，故一併作廢那兩份快取。
   */
  const submitMutation = useMutation({
    mutationFn: () => submitPackingNoticeForApproval(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['packingNotices'] })
      toast.success('已送簽，等待管理層簽核（草稿此時轉為唯讀）')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const approveMutation = useMutation({
    mutationFn: () => approvePackingNotice(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries()
      toast.success('簽核通過，表1 已生效；表2／表8 草稿於此時建立')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => rejectPackingNotice(id!, reason),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['packingNotices'] })
      toast.success('已退回草稿，回到業務手上可編輯（庫存預留不釋放）')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const notice = notices.find((n) => n.id === id)

  if (!notice) {
    return (
      <div className="text-sm text-muted-foreground">
        找不到單號 {id} 的包裝通知單。
        <button className="ml-2 text-brand underline" onClick={() => navigate('/packing-notice')}>
          返回列表
        </button>
      </div>
    )
  }

  const customer = getCustomer(notice.customerId)
  // 建單時的數量輸入基準：畫面以此為主值呈現，另一單位標為換算值；舊資料未記錄者視為 Yard
  const itemUnit = notice.itemUnit ?? 'Yard'
  const relatedPOs = purchaseOrders.filter((p) => p.parentId === notice.id)
  const relatedDyeRequests = dyeRequests.filter((d) => d.parentId === notice.id)
  const relatedDyeOrders = dyeOrders.filter((d) => d.parentId === notice.id)
  const relatedReceipts = goodsReceipts.filter((r) => r.parentId === notice.id)
  const relatedSecondary = secondaryProcessingOrders.filter((o) => o.parentId === notice.id)
  const relatedShipping = shippingOrders.filter((s) => s.parentId === notice.id)
  const relatedReservations = stockReservations.filter((r) => r.packingNoticeId === notice.id)
  const relatedSuggestions = splicingSuggestions.filter((sg) => sg.packingNoticeId === notice.id)
  const pendingSuggestions = relatedSuggestions.filter((sg) => sg.status === '待確認')
  const editable = isPackingNoticeEditable(notice)
  const fullyShipped = isPackingNoticeFullyShipped(notice, notice.id, shippingOrders)
  const locks = packingNoticeLocks(notice)
  // 拼接確認屬庫存配貨、不是編輯表1，故生管有此權限而其餘表1 動作仍唯讀（主文件決策17）
  const splicingBlocked = permissions.blockedReason('表1', '確認拼接組合')
  const canConfirmSplicing = !splicingBlocked
  const approvalState = packingNoticeApprovalState(notice)
  // 決策118：草稿 → 送簽 → 管理層簽核 → 生效。業務自己沒有生效權
  const canSubmit = notice.status === '草稿' && approvalState === '未送簽'
  const canApprove = notice.status === '草稿' && approvalState === '待簽核'
  const submitBlocked = permissions.blockedReason('表1', '送簽')
  const approveBlocked = permissions.blockedReason('表1', '簽核', notice.createdByAccountId)
  const rejectBlocked = permissions.blockedReason('表1', '退回')
  const editBlocked = permissions.blockedReason('表1', '編輯草稿')

  return (
    <div>
      <Link to="/packing-notice" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回包裝通知單列表
      </Link>

      <PageHeader
        title={notice.id}
        formCode="表1"
        description={`客戶：${customer?.fullNameCN ?? notice.customerId}`}
        actions={
          <>
            <StatusBadge status={notice.status} className="text-sm" />
            {/* 嘜頭的列印入口在表8（貼箱是出貨當下的動作）；表1 只列印包裝通知單本身，嘜頭在下方以預覽呈現 */}
            <PrintActions sheets={[{ key: 'doc', label: '列印包裝通知單', sheet: <PackingNoticePrint notice={notice} /> }]} />
            {!editable && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                <Lock className="h-3 w-3" /> 已凍結
              </span>
            )}
            {editable && !editBlocked && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/packing-notice/${notice.id}/edit`)}>
                <Pencil className="mr-1 h-4 w-4" /> 編輯
              </Button>
            )}
            {/* 決策118：業務送簽 */}
            {canSubmit && !submitBlocked && (
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                disabled={submitMutation.isPending}
                onClick={() => submitMutation.mutate()}
              >
                <Send className="mr-1 h-4 w-4" /> 送簽
              </Button>
            )}
            {/* 決策118：管理層簽核即生效；建單者不得自行簽核 */}
            {canApprove && (
              <>
                <Button
                  size="sm"
                  className="bg-brand hover:bg-brand-dark"
                  disabled={approveMutation.isPending || Boolean(approveBlocked)}
                  title={approveBlocked}
                  onClick={() => approveMutation.mutate()}
                >
                  <CheckCircle2 className="mr-1 h-4 w-4" /> 簽核（即生效）
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={rejectMutation.isPending || Boolean(rejectBlocked)}
                  title={rejectBlocked}
                  onClick={() => {
                    // 退回原因必填——沒有原因，業務無從修正（權限規格決策37）
                    const reason = window.prompt('退回原因（必填）：')
                    if (reason?.trim()) rejectMutation.mutate(reason)
                  }}
                >
                  <Undo2 className="mr-1 h-4 w-4" /> 退回草稿
                </Button>
              </>
            )}
          </>
        }
      />

      {/*
        鎖定清單（權限規格決策30）：一張單可同時有多個鎖，全部解除才可編輯。
        只講其中一個，使用者解掉還是動不了，故逐筆列出來源與解除條件。
      */}
      {locks.length > 0 && (
        <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">
                本單目前有 {locks.length} 個未解除的鎖，不可修改
              </p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {locks.map((lock, i) => (
                  <li key={i}>
                    {lock.source}
                    <span className="text-warning/70">（解除條件：{lock.release}）</span>
                  </li>
                ))}
              </ul>
              {notice.manualHoldPiId && (
                <p className="mt-1 text-xs">表2／表4／表5 等下游單據不受影響，流程照常進行。</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 決策118：簽核關卡的目前位置 */}
      {notice.status === '草稿' && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <span className="font-medium text-ink-body">簽核狀態：{approvalState}</span>
          {approvalState === '未送簽' && '——業務編輯完成後按「送簽」，進入管理層的待簽清單。'}
          {approvalState === '待簽核' && '——草稿已轉唯讀，等待管理層簽核；要修改請先請管理層退回。'}
          <div className="mt-1 text-xs">
            決策118：庫存預留已於建單當下完成；表2 訂購單與表8 出貨單草稿要等簽核生效才建立。
          </div>
        </div>
      )}

      {/* 歷次退回（決策37）：不覆蓋前次，反覆退回本身即為異常訊號 */}
      {notice.rejections && notice.rejections.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-surface p-3 text-sm">
          <p className="font-medium text-ink">退回紀錄（{notice.rejections.length} 次）</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {notice.rejections.map((r, i) => (
              <li key={i}>
                {formatDate(r.at)}　{accounts.find((a) => a.id === r.byAccountId)?.name ?? r.byAccountId}：{r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      {notice.status === '生效' && !fullyShipped && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          尚未全數出貨完成，狀態將於關聯的表8出貨單全數確認出貨後自動變更為「已完成」，不需人工標記。
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">單頭資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid>
              <DetailField label="客戶簡稱" value={customer?.shortName} />
              <DetailField label="客戶訂單號" value={notice.customerOrderNo} />
              <DetailField label="建立日" value={formatDate(notice.createdAt)} />
              <DetailField label="生效日" value={formatDate(notice.effectiveAt)} />
              <DetailField label="出貨日期" value={formatDate(notice.expectedDeliveryAt)} />
              <DetailField label="數量輸入基準" value={`${itemUnit}（另一單位為系統換算值）`} />
              {/* PI → 表1 → 表8 的收貨地址只填一次（決策40）；未經 PI 的表1 兩欄皆不顯示 */}
              {notice.sourcePiId && (
                <DetailField
                  label="來源 PI 單號"
                  value={
                    <Link to={`/proforma-invoice/${notice.sourcePiId}`} className="text-brand hover:underline">
                      {notice.sourcePiId}
                    </Link>
                  }
                />
              )}
              {notice.shippingAddress && <DetailField label="收貨地址（自 PI 帶入）" value={notice.shippingAddress} />}
            </DetailGrid>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">客戶聯絡資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid>
              <DetailField label="負責人" value={customer?.personInCharge} />
              <DetailField label="負責人電話" value={customer?.personInChargePhone} />
              {/* 客戶可有多組聯絡資訊，單據帶出主要聯絡人（第一組） */}
              <DetailField label="連絡人" value={customer?.contacts[0]?.name} />
              <DetailField
                label="連絡人電話"
                value={customer?.contacts[0]?.phone || customer?.contacts[0]?.mobile}
              />
              <DetailField label="付款條件" value={customer?.paymentTerms} />
              <DetailField label="交期預設天數" value={`${customer?.leadTimeDays} 天`} />
            </DetailGrid>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">明細（{notice.items.length} 項）</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[44rem]">
              <TableHeader>
                <TableRow>
                  <TableHead>客戶品名</TableHead>
                  <TableHead>皇加品名</TableHead>
                  <TableHead>顏色</TableHead>
                  <TableHead className="text-right">商品總數 ({itemUnit})</TableHead>
                  <TableHead>色號查詢</TableHead>
                  <TableHead>包裝方式</TableHead>
                  <TableHead className="text-right">定碼長度</TableHead>
                  <TableHead>加工方法</TableHead>
                  <TableHead>彩條</TableHead>
                  <TableHead>備註</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notice.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>{item.customerProductName}</TableCell>
                    <TableCell>
                      {item.roricaProductName}
                      {/* 同品名有多個規格分支時附上分支序號，讓明細看得出指的是哪一個 */}
                      <span className="text-muted-foreground">{productBranchSuffix(item.productId)}</span>
                    </TableCell>
                    <TableCell>
                      {/* 顏色圖示：取此商品此顏色最近一次打色登記的電腦色號；表1 尚未指定染整廠，故不分廠 */}
                      <span className="inline-flex items-center gap-1.5">
                        <ColorSwatch
                          compact
                          digital={
                            digitalColorFor(
                              products.find((p) => p.id === item.productId),
                              item.color,
                            )?.digital
                          }
                        />
                        {item.color}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <div>{itemUnit === 'Yard' ? formatNumber(item.yard, 0) : formatNumber(item.meter, 1)}</div>
                      <div className="text-xs text-muted-foreground">
                        {itemUnit === 'Yard'
                          ? `≈ ${formatNumber(item.meter, 1)} 米 (Meter)`
                          : `≈ ${formatNumber(item.yard, 1)} 碼 (Yard)`}
                      </div>
                    </TableCell>
                    <TableCell>
                      {/* 表1 階段尚未指定染整廠，故可能是「視染整廠而定」；表2 選定染整廠後才有確定結論 */}
                      <ColorLookupBadge
                        showMessage={false}
                        result={lookupColorSample({
                          products,
                          customerId: notice.customerId,
                          productId: item.productId,
                          productName: item.roricaProductName,
                          color: item.color,
                          vendorNameOf: (vendorId) => vendorDisplayName(vendors.find((v) => v.id === vendorId)),
                        })}
                      />
                    </TableCell>
                    <TableCell>{item.packingMethod}</TableCell>
                    <TableCell className="text-right">
                      {item.fixedLengthMeter ? (
                        <>
                          <div>
                            {itemUnit === 'Meter'
                              ? `${formatNumber(item.fixedLengthMeter, 1)} M`
                              : `${formatNumber(meterToYard(item.fixedLengthMeter), 1)} Y`}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {itemUnit === 'Meter'
                              ? `≈ ${formatNumber(meterToYard(item.fixedLengthMeter), 1)} 碼 (Yard)`
                              : `≈ ${formatNumber(item.fixedLengthMeter, 1)} 米 (Meter)`}
                          </div>
                        </>
                      ) : (
                        '-'
                      )}
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
                    {/* 彩條：逐品項最多 3 組客人指定，未填即為空白 */}
                    <TableCell className="text-xs">{colorRatioText(item.colorRatios)}</TableCell>
                    <TableCell>{item.note || '-'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">包裝設定</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField
              label="出貨樣數量"
              value={`${notice.sampleQty} 碼${notice.sampleQtyNote ? `（${notice.sampleQtyNote}）` : ''}`}
            />
            <DetailField label="出貨包裝" value={notice.packagingType} />
            <DetailField
              label="出貨方式"
              value={notice.shipMethod
                .map((m) => (m === '其他' ? `其他：${notice.shipMethodNote || ''}` : m))
                .join('、')}
            />
            <DetailField
              label="生產數量容許誤差"
              value={notice.tolerance.mode === '其他' ? `其他：${notice.tolerance.customText || ''}` : notice.tolerance.mode}
            />
            <DetailField label="燙金" value={notice.embossing.join('、')} />
            <DetailField label="裁邊" value={notice.edgeCut ? '是' : '否'} />
            <DetailField label="標籤類型" value={notice.labelTypes.join('、')} />
            <DetailField label="接疋規則" value={notice.allowSplicing ? '可接疋' : '不可接疋'} />
          </DetailGrid>
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">嘜頭（共 {notice.markings.length} 組）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {notice.markings.map((marking, index) => (
            // 多組嘜頭各自獨立成一區：列印時也是逐組各印一張，序號即對應關係
            <div key={index} className="rounded-lg border border-border p-3">
              <div className="mb-2 text-xs font-medium text-muted-foreground">嘜頭 {index + 1}</div>
              <div className="flex flex-col gap-4 lg:flex-row">
                <div className="flex-1">
              <DetailGrid>
                <DetailField label="嘜頭形狀" value={marking.shape} />
                <DetailField label="客戶簡稱" value={customer?.shortName} />
                <DetailField label="抬頭文字" value={marking.headerText || '-'} />
                <DetailField label="運送目的地" value={marking.destination || '-'} />
                <DetailField label="毛重" value={marking.grossWeightKg ? `${marking.grossWeightKg} Kg` : '-'} />
                <DetailField label="淨重" value={marking.netWeightKg ? `${marking.netWeightKg} Kg` : '-'} />
                <DetailField label="成分" value={marking.composition || '-'} />
                <DetailField label="產地" value={marking.origin || '-'} />
                <DetailField
                  label="小嘜頭"
                  value={marking.hasSmallMarking ? smallMarkingLines(marking.smallMarkingText).join('／') : '不加印'}
                />
              </DetailGrid>
                </div>
                {/* 預覽與列印共用同一份版面元件；實際列印入口在表8（貼箱是出貨當下的動作） */}
                <div className="shrink-0 space-y-1.5">
                  <div className="text-xs text-muted-foreground">預覽（實際列印為 A4 一張多份，入口在表8）</div>
                  <MarkingPreview marking={marking} />
                  {marking.hasSmallMarking && (
                    <>
                      <div className="pt-1 text-xs text-muted-foreground">小嘜頭預覽（A4 一張 24 份）</div>
                      <SmallMarkingPreview marking={marking} />
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {notice.actualReceiptComparisons && notice.actualReceiptComparisons.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">實際入庫數量對照（委外加工路徑，供參考，不覆蓋原有明細）</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1.5 text-sm">
              {notice.actualReceiptComparisons.map((c) => (
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

      {relatedSuggestions.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">
              接疋配貨待確認（系統提供建議，非全自動執行，仍由生管最終確認）
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <p className="px-4 pb-2 text-xs text-muted-foreground">
本單為「可接疋」，故<b>凡是要用到一捲以上的明細都列在這裡等你確認</b>，系統不會自行預留（決策121）。
              兩種情況：①<b>湊得出整疋</b>——零星捲加總剛好是原疋標準尺寸的整數倍，最多 3 捲（2 次接合），天生無耗損；
              ②<b>湊不出整疋</b>——系統改以整捲＋裁切配出下列組合，出貨時會裁剩零碼布。
              確認採用後才建立庫存預留並記錄實際使用的捲號組合；按「自訂組合」可自行改挑布卷。
            </p>
            <div className="overflow-x-auto">
              <Table className="min-w-[44rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>皇加品名</TableHead>
                    <TableHead>顏色</TableHead>
                    <TableHead className="text-right">需求量</TableHead>
                    <TableHead>建議捲號組合</TableHead>
                    <TableHead className="text-right">組合總碼數</TableHead>
                    <TableHead>原疋標準尺寸</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relatedSuggestions.map((sg) => (
                    <TableRow key={sg.id}>
                      <TableCell>{sg.productName}</TableCell>
                      <TableCell>{sg.color}</TableCell>
                      <TableCell className="text-right">{formatNumber(sg.requiredQty, 0)} Yard</TableCell>
                      <TableCell>{sg.rollCodes.join('＋')}</TableCell>
                      <TableCell className="text-right">
                        {formatNumber(sg.totalLength, 0)} Yard
                        <span className="ml-1 text-xs text-muted-foreground">
                          （
                          {sg.standardSize <= 0
                            ? '-'
                            : isExactMultipleOfStandard(sg.totalLength, sg.standardSize)
                              ? `${Math.round(sg.totalLength / sg.standardSize)} 整疋`
                              : `非整疋，出貨後約裁剩 ${formatNumber(sg.totalLength - sg.requiredQty, 1)} 碼`}
                          ）
                        </span>
                      </TableCell>
                      <TableCell>{formatNumber(sg.standardSize, 0)} Yard</TableCell>
                      <TableCell>
                        <StatusBadge status={sg.status} />
                        {sg.customised && (
                          <div className="mt-0.5 text-[11px] text-muted-foreground">
                            生管自訂
                            {sg.note && <div className="max-w-[12rem] whitespace-normal">依據：{sg.note}</div>}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {sg.status === '待確認' && canConfirmSplicing && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-brand hover:bg-brand-dark"
                              disabled={confirmSplicingMutation.isPending}
                              onClick={() => confirmSplicingMutation.mutate(sg.id)}
                            >
                              確認採用
                            </Button>
                            {/* 生管自己挑捲：系統算不到的考量（同批染缸、同支布前後段、客戶指定捲號） */}
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setCustomSplicingItemId(sg.packingNoticeItemId)}
                            >
                              自訂組合
                            </Button>
                            {/*
                              「不接疋」只對湊得出整疋的組合有意義——非整疋的建議本身
                              就是整捲＋裁切的方案，再按一次不接疋等於同一件事
                            */}
                            {isExactMultipleOfStandard(sg.totalLength, sg.standardSize) && (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={rejectSplicingMutation.isPending}
                                onClick={() => rejectSplicingMutation.mutate(sg.id)}
                              >
                                不接疋（整捲＋裁切）
                              </Button>
                            )}
                          </div>
                        )}
                        {sg.status === '待確認' && !canConfirmSplicing && (
                          <span className="text-xs text-muted-foreground">{splicingBlocked}</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {customSplicingItemId &&
        (() => {
          const target = notice.items.find((i) => i.id === customSplicingItemId)
          if (!target) return null
          const sg = pendingSuggestions.find((x) => x.packingNoticeItemId === target.id)
          const reservation = relatedReservations.find(
            (r) => r.packingNoticeItemId === target.id && effectiveReservationStatus(r) === '預留中',
          )
          const product = products.find((p) => p.id === target.productId)
          return (
            <CustomSplicingDialog
              open
              onOpenChange={(open) => !open && setCustomSplicingItemId(null)}
              item={target}
              requiredQty={target.yard}
              standardSize={sg?.standardSize ?? product?.originalRollStandardYard ?? 0}
              currentRollCodes={sg?.rollCodes ?? reservation?.rollCodes ?? []}
              hasSuggestion={Boolean(sg)}
              fabricLabels={fabricLabels}
              stockReservations={stockReservations}
              pending={customSplicingMutation.isPending}
              onConfirm={(rollCodes, note) =>
                customSplicingMutation.mutate({ itemId: target.id, rollCodes, note })
              }
            />
          )
        })()}

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">庫存查詢結果（有現貨路徑：系統自動建立庫存預留）</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {relatedReservations.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">
              {pendingSuggestions.length > 0
                ? '本單為可接疋，需用到一捲以上的明細一律等生管確認後才建立庫存預留（見上方卡片）。'
                : '查無可用庫存可自動預留，本單走無現貨路徑（下訂購單／染整生產）。'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              {/*
                湊不出整疋時，系統依決策5 自動以整捲＋裁切配貨——但那等於系統自己決定了
                要接幾捲、裁掉多少，而接疋與裁切要不要接受是客戶的事（決策120）。
                故每一列都留「自訂組合」入口，讓生管重挑並留下依據。
              */}
              <p className="px-4 pb-2 text-xs text-muted-foreground">
                預留到多捲即代表出貨時需接疋或裁切。要換成別的捲、或改用零碼布湊，按該列的「自訂組合」。
              </p>
              <Table className="min-w-[48rem]">
                <TableHeader>
                  <TableRow>
                    <TableHead>皇加品名</TableHead>
                    <TableHead>顏色</TableHead>
                    <TableHead>捲號</TableHead>
                    <TableHead className="text-right">預留數量</TableHead>
                    <TableHead>效期至</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relatedReservations.map((r) => {
                    const forItem = notice.items.find((i) => i.id === r.packingNoticeItemId)
                    // 多捲＝系統已經自己決定要接疋或裁切了，而那是客戶要不要接受的事（決策120）
                    const multiRoll = r.rollCodes.length > 1
                    const canRepick =
                      canConfirmSplicing &&
                      forItem &&
                      editable &&
                      effectiveReservationStatus(r) === '預留中'
                    return (
                      <TableRow key={r.id}>
                        <TableCell>{r.productName}</TableCell>
                        <TableCell>{r.color}</TableCell>
                        <TableCell>
                          {r.rollCodes.join('、')}
                          {multiRoll && (
                            <span className="ml-1.5 rounded bg-warning/15 px-1 py-0.5 text-[10px] text-warning">
                              {r.rollCodes.length} 捲
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {formatNumber(r.qty, 0)} {r.unit}
                        </TableCell>
                        <TableCell>{formatDateTime(r.expiresAt)}</TableCell>
                        <TableCell>
                          <StatusBadge status={effectiveReservationStatus(r)} />
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {canRepick && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setCustomSplicingItemId(r.packingNoticeItemId)}
                            >
                              自訂組合
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">關聯單據（主單號貫穿追蹤）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <RelatedGroup title="表2 訂購單" items={relatedPOs.map((p) => ({ id: p.id, status: p.status }))} to="/purchase-order" />
            <RelatedGroup title="表3 打色通知單" items={relatedDyeRequests.map((d) => ({ id: d.id, status: d.status }))} to="/dye-request" />
            <RelatedGroup title="表4 染整單" items={relatedDyeOrders.map((d) => ({ id: d.id, status: d.status }))} to="/dye-order" />
            <RelatedGroup
              title="表5 二次加工單"
              items={relatedSecondary.map((o) => ({ id: o.id, status: o.status }))}
              to="/secondary-processing"
            />
            <RelatedGroup title="表6 入庫單" items={relatedReceipts.map((r) => ({ id: r.id, status: r.status }))} to="/goods-receipt" />
            <RelatedGroup title="表8 出貨單" items={relatedShipping.map((s) => ({ id: s.id, status: s.status }))} to="/shipping-order" />
          </div>
        </CardContent>
      </Card>

      <AuditTrailCard
        events={[
          { at: notice.createdAt, label: '建立單據（草稿）' },
          ...(notice.effectiveAt ? [{ at: notice.effectiveAt, label: '狀態變更為生效' }] : []),
          ...relatedReservations.map((r) => ({ at: r.createdAt, label: `自動建立庫存預留 ${r.rollCodes.join('、')}` })),
          ...relatedReservations
            .filter((r) => r.releasedAt)
            .map((r) => ({ at: r.releasedAt as string, label: `庫存預留已釋放 ${r.rollCodes.join('、')}` })),
          ...(notice.actualReceiptComparisons ?? []).map((c) => ({
            at: c.recordedAt,
            label: `記錄實際入庫數量對照（${c.receiptId}）`,
          })),
        ]}
      />

      <div className="mt-3 text-xs text-muted-foreground print:hidden">
        最後同步時間 {formatDateTime(new Date())}（Prototype 展示用假資料）
      </div>
    </div>
  )
}

function RelatedGroup({ title, items, to }: { title: string; items: { id: string; status: string }[]; to: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="text-xs font-semibold text-muted-foreground">{title}</div>
      {items.length === 0 ? (
        <div className="mt-2 text-sm text-muted-foreground">尚未建立</div>
      ) : (
        <div className="mt-2 space-y-1.5">
          {items.map((item) => (
            <Link key={item.id} to={`${to}/${item.id}`} className="flex items-center justify-between text-sm hover:text-brand-dark">
              <span>{item.id}</span>
              <StatusBadge status={item.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

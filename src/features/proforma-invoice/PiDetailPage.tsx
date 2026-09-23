import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { ReadOnlyNotice } from '@/components/shared/ReadOnlyNotice'
import { RejectDialog } from '@/components/shared/RejectDialog'
import { useCurrentAccount } from '@/lib/current-account-context'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PrintActions } from '@/components/print/PrintActions'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/mocks/api'
import { getAccount, getProduct } from '@/mocks/data'
import {
  applyReplacementPi,
  approveProformaInvoice,
  convertPiToPackingNotices,
  copyProformaInvoiceAsNew,
  markPiSignedBack,
  rejectProformaInvoice,
  resolvePiManualHandling,
  submitProformaInvoice,
  voidAndReopenProformaInvoice,
  voidProformaInvoice,
} from '@/mocks/mutations'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { BasisQty } from '@/components/shared/BasisQty'
import { colorRatioText } from '@/lib/workflow'
import {
  PI_CURRENCY_SYMBOL,
  canConvertPi,
  canSignBackPi,
  effectivePiStatus,
  isPiOnManualHold,
  piDownstreamBlockers,
  piDueDate,
  piTotalAmount,
} from '@/lib/pi'
import { PRINT_BANK_ACCOUNT } from '@/lib/print'
import { MarkingPreview, SmallMarkingPreview } from '@/features/packing-notice/MarkingPrint'
import { PiPrint } from './PiPrint'

export function PiDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  // 每個按鈕對應寫入端要求的 PI 動作權限（mutations 的 assertCanAct），唯讀角色一律只看
  const { can } = useCurrentAccount()
  const piCan = (action: Parameters<typeof can>[1]) => can('PI', action)
  const [signedFileName, setSignedFileName] = useState('')
  const [rejectOpen, setRejectOpen] = useState(false)
  const { data = [] } = useQuery({ queryKey: ['proformaInvoices'], queryFn: api.proformaInvoices })
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  // 下游三張單：用來預告「作廢並重開」會不會落入規則3（畫面提示，判定本身在資料層）
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })
  const { data: dyeOrders = [] } = useQuery({ queryKey: ['dyeOrders'], queryFn: api.dyeOrders })
  const { data: secondaryProcessingOrders = [] } = useQuery({
    queryKey: ['secondaryProcessingOrders'],
    queryFn: api.secondaryProcessingOrders,
  })
  const pi = data.find((x) => x.id === id)

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['proformaInvoices'] })
    await queryClient.invalidateQueries({ queryKey: ['packingNotices'] })
    await queryClient.invalidateQueries({ queryKey: ['stockReservations'] })
  }

  const action = useMutation({
    mutationFn: async (fn: () => Promise<unknown>) => fn(),
    onSuccess: async () => {
      await refresh()
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!pi) {
    return (
      <div>
        <PageHeader title="PI 單" formCode="PI" description="查無此單據" />
      </div>
    )
  }

  const status = effectivePiStatus(pi)
  const symbol = PI_CURRENCY_SYMBOL[pi.currency]
  const total = piTotalAmount(pi)
  const dueDate = piDueDate(pi, packingNotices)
  const poNos = [...new Set(pi.items.map((item) => item.poNo))]
  const isReplacement = Boolean(pi.previousPiId)
  // 待人工處理不是狀態：PI 留在草稿但整條流程卡住，裁決前不得送批准／簽回／套用（決策27）
  const onHold = isPiOnManualHold(pi)
  // 已對外發出的下游：有的話，按「作廢並重開」會直接進入待人工處理（決策27）
  const dispatchedDownstream = pi.packingNoticeIds.flatMap((noticeId) =>
    piDownstreamBlockers(noticeId, purchaseOrders, dyeOrders, secondaryProcessingOrders),
  )

  const run = (fn: () => Promise<unknown>, successText: string) =>
    action.mutate(fn, { onSuccess: () => toast.success(successText) })

  return (
    <div>
      <Link
        to="/proforma-invoice"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> 返回 PI 單列表
      </Link>

      <PageHeader
        title={pi.id}
        formCode="PI"
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge status={status} />
            <span>{pi.customerName}</span>
            <span>·</span>
            <span>
              {symbol} {formatNumber(total, 2)}
            </span>
            {onHold && (
              <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                待人工處理
              </span>
            )}
            {pi.previousPiId && <span className="text-warning">取代版（前版 {pi.previousPiId}）</span>}
            {pi.replacedByPiId && <span className="text-warning">已由 {pi.replacedByPiId} 取代</span>}
          </span>
        }
        actions={
          <>
            {status === '草稿' && !onHold && (
              <>
                {piCan('編輯草稿') && (
                  <Button size="sm" variant="outline" onClick={() => navigate(`/proforma-invoice/${pi.id}/edit`)}>
                    編輯草稿
                  </Button>
                )}
                {piCan('送簽') && (
                  <Button
                    size="sm"
                    className="bg-brand hover:bg-brand-dark"
                    onClick={() => run(() => submitProformaInvoice(pi.id), '已送出，等待管理層批准')}
                  >
                    送出批准
                  </Button>
                )}
              </>
            )}
            {(status === '待批准' || status === '已逾期') && !onHold && piCan('批准') && (
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                onClick={() =>
                  run(
                    () => approveProformaInvoice(pi.id),
                    status === '已逾期' ? '已重新報價並批准，效期重新起算 14 天' : '已批准，可發出給客戶',
                  )
                }
              >
                {status === '已逾期' ? '重新報價並批准' : '管理層批准'}
              </Button>
            )}
            {/* 批准的另一半：不批准就得退回，否則單子只能卡在待批准（權限規格決策50） */}
            {status === '待批准' && !onHold && piCan('退回') && (
              <Button
                size="sm"
                className="bg-reject text-reject-foreground hover:bg-reject/90"
                onClick={() => setRejectOpen(true)}
              >
                <Undo2 className="mr-1 h-4 w-4" /> 退回
              </Button>
            )}
            {canSignBackPi(pi) && piCan('編輯草稿') && (
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                onClick={() => run(() => markPiSignedBack(pi.id, signedFileName), '已標記客戶回簽')}
              >
                標記已簽回
              </Button>
            )}
            {canConvertPi(pi) && !isReplacement && !onHold && piCan('結案') && (
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                onClick={() =>
                  action.mutate(() => convertPiToPackingNotices(pi.id), {
                    onSuccess: (result) => {
                      const notices = (result as { notices: { id: string }[] }).notices
                      toast.success(`已依 PO 拆為 ${notices.length} 張表1：${notices.map((n) => n.id).join('、')}`)
                    },
                  })
                }
              >
                轉換為包裝通知單（依 PO 拆單）
              </Button>
            )}
            {canConvertPi(pi) && isReplacement && !onHold && piCan('結案') && (
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                onClick={() =>
                  action.mutate(() => applyReplacementPi(pi.id), {
                    onSuccess: (result) => {
                      const r = result as { updated: string[]; frozen: string[]; blocked: string[] }
                      if (r.blocked.length > 0) {
                        toast.error(`下游已對外發出，已轉為待人工處理：${r.blocked.join('；')}`)
                      } else {
                        toast.success(
                          `已覆蓋 ${r.updated.length} 張表1${r.frozen.length > 0 ? `（${r.frozen.length} 張已凍結略過）` : ''}`,
                        )
                      }
                    },
                  })
                }
              >
                套用至既有表1（覆蓋規則）
              </Button>
            )}
            {onHold && piCan('批准') && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => run(() => resolvePiManualHandling(pi.id, '繼續'), '已裁決：依舊 PI 出貨')}
                >
                  裁決：繼續（依舊 PI 出貨）
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive"
                  onClick={() => run(() => resolvePiManualHandling(pi.id, '作廢'), '已裁決：整筆終止')}
                >
                  裁決：作廢（整筆終止）
                </Button>
              </>
            )}
            {piCan('建立') && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                action.mutate(() => copyProformaInvoiceAsNew(pi.id), {
                  onSuccess: (result) => {
                    const created = result as { id: string }
                    toast.success(`已複製為 ${created.id}`)
                    navigate(`/proforma-invoice/${created.id}`)
                  },
                })
              }
            >
              複製為新 PI
            </Button>
            )}
            {status === '已轉換' && piCan('建立') && (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  action.mutate(() => voidAndReopenProformaInvoice(pi.id), {
                    onSuccess: (result) => {
                      const created = result as { id: string }
                      toast.success(`已建立取代版 ${created.id}`)
                      navigate(`/proforma-invoice/${created.id}`)
                    },
                  })
                }
                title={
                  dispatchedDownstream.length > 0
                    ? `下游已對外發出（${dispatchedDownstream.join('；')}），建立取代版後將留在草稿並轉入待人工處理`
                    : '建立取代版，內容照抄並覆蓋既有表1'
                }
              >
                作廢並重開{dispatchedDownstream.length > 0 ? '（將待人工處理）' : ''}
              </Button>
            )}
            {status !== '已作廢' && status !== '已轉換' && !onHold && piCan('編輯草稿') && (
              <Button
                size="sm"
                variant="outline"
                className="text-destructive"
                onClick={() => run(() => voidProformaInvoice(pi.id, '人工作廢'), '已作廢')}
              >
                作廢
              </Button>
            )}
            <PrintActions sheets={[{ key: 'pi', label: '列印 PI', sheet: <PiPrint pi={pi} /> }]} />
          </>
        }
      />

      <ReadOnlyNotice doc="PI" />

      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`退回 PI ${pi.id}`}
        description="退回後本單回到草稿，業務可修改後重新送出批准。報價效期不重新起算——退回不是重新報價。"
        pending={action.isPending}
        onConfirm={(reason) => {
          setRejectOpen(false)
          run(() => rejectProformaInvoice(pi.id, reason), '已退回草稿，業務可修改後重新送出')
        }}
      />

      {/* 歷次退回：不覆蓋前次，反覆退回本身即為異常訊號（比照表1） */}
      {pi.rejections && pi.rejections.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-surface p-3 text-sm">
          <p className="font-medium text-ink">退回紀錄（{pi.rejections.length} 次）</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {pi.rejections.map((r, i) => (
              <li key={i}>
                {formatDate(r.at)}　{getAccount(r.byAccountId)?.name ?? r.byAccountId}：{r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-4">
        {!onHold && status === '已轉換' && dispatchedDownstream.length > 0 && (
          <div className="rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
            <p className="font-medium">本 PI 的下游已對外發出，改版將需管理層裁決</p>
            <ul className="mt-1 list-disc pl-5 text-xs">
              {dispatchedDownstream.map((reason, i) => (
                <li key={i}>{reason}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              此時按「作廢並重開」，取代版會留在草稿並轉入待人工處理：本 PI 與其表1 一併凍結、一張表1 都不會被改到，
              待管理層裁決「繼續（依舊 PI 出貨）」或「作廢（整筆終止）」。
            </p>
          </div>
        )}

        {onHold && pi.manualHandling && (
          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base text-destructive">待人工處理（規則3：下游已對外發出）</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5 text-sm">
              <p>偵測時間：{formatDateTime(pi.manualHandling.detectedAt)}</p>
              <ul className="list-disc pl-5 text-muted-foreground">
                {pi.manualHandling.blockedBy.map((reason, i) => (
                  <li key={i}>{reason}</li>
                ))}
              </ul>
              <p className="text-muted-foreground">
                擋下的時點在 PI 本身：本張取代版留在草稿、不得送批准／簽回／套用，前一版 PI 與其表1 一併凍結，
                期間一張表1 都不會被改到，也不可再建立第三張取代版。請由管理層裁決「繼續（依舊 PI 出貨）」或
                「作廢（整筆終止）」——不設「照客戶要求改」或「另開補單」的第三個出口。
              </p>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">單頭資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid>
              <DetailField label="客戶" value={pi.customerName} />
              <DetailField label="收貨地址（帶入表1／表8）" value={pi.shippingAddress ?? '-'} />
              <DetailField label="PO NO." value={poNos.join('、')} />
              <DetailField label="幣別" value={pi.currency} />
              <DetailField
                label="貿易條件"
                value={`${pi.tradeTerm}${pi.tradeTermNote ? `（${pi.tradeTermNote}）` : ''}`}
              />
              <DetailField label="起運地 / 目的地" value={`${pi.portOfLoading} → ${pi.destination ?? '-'}`} />
              <DetailField
                label="交期"
                value={`${pi.leadTimeDays} 天${pi.leadTimeNote ? `（${pi.leadTimeNote}）` : ''}`}
              />
              <DetailField
                label="應出貨日（第一張表1 生效日 + 交期）"
                value={dueDate ? dueDate.format('YYYY/MM/DD') : '表1 尚未生效，交期未起算'}
              />
              <DetailField
                label="付款條件"
                value={`${pi.paymentTerm}${pi.paymentTermNote ? `（${pi.paymentTermNote}）` : ''}`}
              />
              <DetailField label="建立日" value={formatDate(pi.createdAt)} />
              <DetailField label="報價有效期限" value={formatDate(pi.quoteValidUntil)} />
              <DetailField label="管理層批准" value={pi.approvedAt ? formatDateTime(pi.approvedAt) : '-'} />
              <DetailField label="客戶簽回" value={pi.signedBackAt ? formatDateTime(pi.signedBackAt) : '-'} />
              <DetailField label="簽回附件" value={pi.signedBackFileName ?? '（未上傳，非必填）'} />
              <DetailField label="估算 CBM" value="計算公式待皇加提供" />
              <DetailField
                label="銀行帳戶（皇加收款帳戶）"
                value={`${PRINT_BANK_ACCOUNT.bankName} ${PRINT_BANK_ACCOUNT.accountNo}`}
              />
              <DetailField label="已轉表1" value={pi.packingNoticeIds.length > 0 ? pi.packingNoticeIds.join('、') : '-'} />
              <DetailField label="作廢原因" value={pi.voidReason ?? '-'} />
            </DetailGrid>

            {canSignBackPi(pi) && piCan('編輯草稿') && (
              <div className="mt-4 flex max-w-md items-center gap-2">
                <Input
                  value={signedFileName}
                  onChange={(e) => setSignedFileName(e.target.value)}
                  placeholder="簽回附件檔名（非必填，如 PI-xxx-signed.pdf）"
                />
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">明細（單位基準：{pi.itemUnit}）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table className="min-w-[960px]">
                <TableHeader>
                  <TableRow>
                    <TableHead>PO NO.</TableHead>
                    <TableHead>皇加品名</TableHead>
                    <TableHead>產品編號</TableHead>
                    <TableHead>客戶品名</TableHead>
                    <TableHead>成分／幅寬／碼重</TableHead>
                    <TableHead>顏色</TableHead>
                    <TableHead className="text-right">數量</TableHead>
                    <TableHead className="text-right">單價（/碼）</TableHead>
                    <TableHead className="text-right">金額</TableHead>
                    <TableHead>包裝方式</TableHead>
                    <TableHead>彩條</TableHead>
                    <TableHead>備註</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pi.items.map((item) => {
                    const product = item.productId ? getProduct(item.productId) : undefined
                    return (
                      <TableRow key={item.id}>
                        <TableCell>{item.poNo}</TableCell>
                        <TableCell>{item.roricaProductName}</TableCell>
                        <TableCell>{product ? `${product.productCode}-${product.sortNo}` : '-'}</TableCell>
                        <TableCell>{item.customerProductName || '-'}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {product
                            ? [product.material, product.widthSpec, product.weightGY ? `${product.weightGY}G/Y` : '']
                                .filter(Boolean)
                                .join('　')
                            : '-'}
                        </TableCell>
                        <TableCell>{item.color}</TableCell>
                        <TableCell className="text-right">
                          <BasisQty yard={item.yard} meter={item.meter} unit={pi.itemUnit} />
                        </TableCell>
                        <TableCell className="text-right">{formatNumber(item.unitPrice, 2)}</TableCell>
                        <TableCell className="text-right">{formatNumber(item.unitPrice * item.yard, 2)}</TableCell>
                        <TableCell>
                          {item.packingMethod}
                          {item.fixedLengthMeter ? `（定碼 ${formatNumber(item.fixedLengthMeter, 1)}M）` : ''}
                        </TableCell>
                        <TableCell className="text-xs">{colorRatioText(item.colorRatios)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{item.note || '-'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="mt-3 text-right text-sm font-medium">
              總金額 {symbol} {formatNumber(total, 2)}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">嘜頭（SHIPPING MARKS）</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              與表1 為同一組資料，只填一次；轉換時每張表1 都帶入全部嘜頭，表1 端可刪減、不可新增。
            </p>
            <div className="flex flex-wrap gap-4">
              {pi.markings.map((marking, i) => (
                <div key={i} className="flex flex-col items-center gap-2">
                  <MarkingPreview marking={marking} />
                  {marking.hasSmallMarking && <SmallMarkingPreview marking={marking} />}
                  <span className="text-xs text-muted-foreground">
                    嘜頭 {i + 1}／{pi.markings.length}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {pi.packingNoticeIds.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">已轉換的包裝通知單</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>表1 單號</TableHead>
                    <TableHead>客戶訂單號（PO）</TableHead>
                    <TableHead>狀態</TableHead>
                    <TableHead>生效日</TableHead>
                    <TableHead>出貨日期</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pi.packingNoticeIds.map((noticeId) => {
                    const notice = packingNotices.find((n) => n.id === noticeId)
                    return (
                      <TableRow
                        key={noticeId}
                        className="cursor-pointer"
                        onClick={() => navigate(`/packing-notice/${noticeId}`)}
                      >
                        <TableCell>{noticeId}</TableCell>
                        <TableCell>{notice?.customerOrderNo ?? '-'}</TableCell>
                        <TableCell>{notice ? <StatusBadge status={notice.status} /> : '-'}</TableCell>
                        <TableCell>{notice?.effectiveAt ? formatDate(notice.effectiveAt) : '尚未生效'}</TableCell>
                        <TableCell>{notice ? formatDate(notice.expectedDeliveryAt) : '-'}</TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

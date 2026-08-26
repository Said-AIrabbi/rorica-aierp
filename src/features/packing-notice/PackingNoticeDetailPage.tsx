import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Lock, Pencil } from 'lucide-react'
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
import { getCustomer, productBranchSuffix } from '@/mocks/data'
import { confirmSplicingSuggestion, rejectSplicingSuggestion, setPackingNoticeStatus } from '@/mocks/mutations'
import { formatDate, formatDateTime } from '@/lib/dates'
import { formatNumber, meterToYard } from '@/lib/units'
import { effectiveReservationStatus } from '@/lib/inventory'
import { freezeDate, isPackingNoticeEditable, isPackingNoticeFullyShipped } from '@/lib/workflow'
import type { PackingNoticeStatus } from '@/types'

export function PackingNoticeDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: notices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })
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

  const statusMutation = useMutation({
    mutationFn: (status: PackingNoticeStatus) => setPackingNoticeStatus(id!, status),
    onSuccess: async (notice) => {
      await queryClient.invalidateQueries({ queryKey: ['packingNotices'] })
      toast.success(`${notice.id} 已變更為「${notice.status}」`)
    },
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
            {/* 嘜頭列印格式待客戶提供實際版面後再建立，此處僅列印包裝通知單本身 */}
            <PrintActions sheets={[{ key: 'doc', label: '列印包裝通知單', sheet: <PackingNoticePrint notice={notice} /> }]} />
            {!editable && (
              <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2.5 py-1 text-xs font-medium text-warning">
                <Lock className="h-3 w-3" /> 已凍結
              </span>
            )}
            {editable && (
              <Button variant="outline" size="sm" onClick={() => navigate(`/packing-notice/${notice.id}/edit`)}>
                <Pencil className="mr-1 h-4 w-4" /> 編輯
              </Button>
            )}
            {notice.status === '草稿' && (
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate('生效')}
              >
                確認建檔（轉生效）
              </Button>
            )}
          </>
        }
      />

      {!editable && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
          <Lock className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            已於 {formatDate(freezeDate(notice.effectiveAt))} 自動凍結（自生效日起算滿 7 個工作天；草稿狀態尚未生效不受此限），不再提供修改。
          </span>
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
              <DetailField label="連絡人" value={customer?.contactPerson} />
              <DetailField label="連絡人電話" value={customer?.contactPersonPhone} />
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>客戶品名</TableHead>
                  <TableHead>皇加品名</TableHead>
                  <TableHead>顏色</TableHead>
                  <TableHead className="text-right">商品總數 (Yard)</TableHead>
                  <TableHead className="text-right">米數 (Meter)</TableHead>
                  <TableHead>包裝方式</TableHead>
                  <TableHead className="text-right">定碼長度</TableHead>
                  <TableHead>加工方法</TableHead>
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
                    <TableCell>{item.color}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.yard, 0)}</TableCell>
                    <TableCell className="text-right">{formatNumber(item.meter, 1)}</TableCell>
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
            <DetailField label="出貨樣數量" value={`${notice.sampleQty} 碼`} />
            <DetailField label="出貨包裝" value={notice.packagingType} />
            <DetailField
              label="出貨方式"
              value={notice.shipMethod
                .map((m) => (m === '其他' ? `其他：${notice.shipMethodNote || ''}` : m))
                .join('、')}
            />
            <DetailField
              label="彩條"
              value={notice.colorRatio.mode === '客人指定' ? `客人指定：${notice.colorRatio.customText || ''}` : '空白'}
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
          <CardTitle className="text-base">嘜頭</CardTitle>
        </CardHeader>
        <CardContent>
          <DetailGrid>
            <DetailField
              label="嘜頭形狀"
              // 嘜頭列印格式（正三角形／菱形／A5大小）待客戶提供實際版面後再建立
              value={`${notice.marking.shape}（列印格式待客戶提供）`}
            />
            <DetailField label="客戶簡稱" value={customer?.shortName} />
            <DetailField label="運送目的地" value={notice.marking.destination || '-'} />
            <DetailField label="毛重" value={notice.marking.grossWeightKg ? `${notice.marking.grossWeightKg} Kg` : '-'} />
            <DetailField label="淨重" value={notice.marking.netWeightKg ? `${notice.marking.netWeightKg} Kg` : '-'} />
            <DetailField label="成分" value={notice.marking.composition || '-'} />
            <DetailField label="產地" value={notice.marking.origin || '-'} />
            <DetailField
              label="小嘜頭"
              value={notice.marking.hasSmallMarking ? notice.marking.smallMarkingText || '加印（未填內容）' : '不加印'}
            />
          </DetailGrid>
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
              接疋拼接組合建議（系統提供建議，非全自動執行，仍由人工最終確認）
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <p className="px-4 pb-2 text-xs text-muted-foreground">
              判斷基準：零星捲加總等於原疋標準尺寸的整數倍，最多 3 捲（2 次接合），因湊出剛好整疋、天生無耗損。
              確認採用後才會建立庫存預留並記錄實際使用的捲號組合；改判不接疋則改為整捲＋裁切分開出貨，裁剩的零碼布留庫存等待下次湊單。
            </p>
            <div className="overflow-x-auto">
              <Table>
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
                          （{sg.standardSize > 0 ? `${Math.round(sg.totalLength / sg.standardSize)} 整疋` : '-'}）
                        </span>
                      </TableCell>
                      <TableCell>{formatNumber(sg.standardSize, 0)} Yard</TableCell>
                      <TableCell>
                        <StatusBadge status={sg.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {sg.status === '待確認' && (
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              className="bg-brand hover:bg-brand-dark"
                              disabled={confirmSplicingMutation.isPending}
                              onClick={() => confirmSplicingMutation.mutate(sg.id)}
                            >
                              確認採用
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={rejectSplicingMutation.isPending}
                              onClick={() => rejectSplicingMutation.mutate(sg.id)}
                            >
                              不接疋（整捲＋裁切）
                            </Button>
                          </div>
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

      <Card className="mt-4">
        <CardHeader>
          <CardTitle className="text-base">庫存查詢結果（有現貨路徑：系統自動建立庫存預留）</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {relatedReservations.length === 0 ? (
            <p className="px-4 text-sm text-muted-foreground">
              {pendingSuggestions.length > 0
                ? '可用庫存需靠拼接才足夠，系統已提供拼接組合建議（見上方卡片），待人工確認後才會建立庫存預留。'
                : '查無可用庫存可自動預留，本單走無現貨路徑（下訂購單／染整生產）。'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>皇加品名</TableHead>
                    <TableHead>顏色</TableHead>
                    <TableHead>捲號</TableHead>
                    <TableHead className="text-right">預留數量</TableHead>
                    <TableHead>效期至</TableHead>
                    <TableHead>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {relatedReservations.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>{r.productName}</TableCell>
                      <TableCell>{r.color}</TableCell>
                      <TableCell>{r.rollCodes.join('、')}</TableCell>
                      <TableCell className="text-right">
                        {formatNumber(r.qty, 0)} {r.unit}
                      </TableCell>
                      <TableCell>{formatDateTime(r.expiresAt)}</TableCell>
                      <TableCell>
                        <StatusBadge status={effectiveReservationStatus(r)} />
                      </TableCell>
                    </TableRow>
                  ))}
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

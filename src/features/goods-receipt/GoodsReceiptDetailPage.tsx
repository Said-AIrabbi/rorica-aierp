import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { PrintActions } from '@/components/print/PrintActions'
import { GoodsReceiptPrint } from './GoodsReceiptPrint'
import { FabricLabelPrint } from '@/features/fabric-label/FabricLabelPrint'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { api } from '@/mocks/api'
import { getAccount, getVendor, productBranchSuffix } from '@/mocks/data'
import {
  setGoodsReceiptStatus,
  updateGoodsReceiptPledgedQty,
  updateGoodsReceiptPurpose,
  updateGoodsReceiptRolls,
  updateGoodsReceiptVendorInfo,
} from '@/mocks/mutations'
import { formatDate } from '@/lib/dates'
import { formatNumber, formatPercent, yardToMeter } from '@/lib/units'
import { cn } from '@/lib/utils'
import { goodsReceiptShrinkageRate } from '@/lib/workflow'
import { GOODS_RECEIPT_PURPOSES, type GoodsReceipt, type GoodsReceiptRoll } from '@/types'

const CONFIDENCE_CLASS: Record<string, string> = {
  高: 'text-success',
  低: 'text-warning',
  人工輸入: 'text-muted-foreground',
}
const CONFIDENCE_OPTIONS: GoodsReceiptRoll['ocrConfidence'][] = ['高', '低', '人工輸入']

export function GoodsReceiptDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['goodsReceipts'], queryFn: api.goodsReceipts })
  const { data: vendors = [] } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })
  const { data: dyeOrders = [] } = useQuery({ queryKey: ['dyeOrders'], queryFn: api.dyeOrders })
  const { data: purchaseOrders = [] } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })
  const { data: packingNotices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: fabricLabels = [] } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })
  const { data: secondaryProcessingOrders = [] } = useQuery({
    queryKey: ['secondaryProcessingOrders'],
    queryFn: api.secondaryProcessingOrders,
  })
  const receipt = data.find((r) => r.id === id)
  /** 來源表1明細：每一卷入庫布卷都對應其中一列，決定條碼標籤的品名／顏色／規格分支 */
  const sourceItems = packingNotices.find((n) => n.id === receipt?.parentId)?.items ?? []

  const [rolls, setRolls] = useState<GoodsReceiptRoll[]>([])
  const [pledgedQty, setPledgedQty] = useState('')
  const [vendorId, setVendorId] = useState('')
  const [vendorShipmentNo, setVendorShipmentNo] = useState('')
  const [vendorShipDate, setVendorShipDate] = useState('')
  const [receiptAttachmentName, setReceiptAttachmentName] = useState<string | undefined>(undefined)

  useEffect(() => {
    if (receipt) {
      setRolls(receipt.rolls)
      setPledgedQty(receipt.pledgedQty ? String(receipt.pledgedQty) : '')
      setVendorId(receipt.vendorId ?? '')
      setVendorShipmentNo(receipt.vendorShipmentNo ?? '')
      setVendorShipDate(receipt.vendorShipDate ? receipt.vendorShipDate.slice(0, 10) : '')
      setReceiptAttachmentName(receipt.receiptAttachmentName)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receipt?.id])

  const editable = receipt?.status === '草稿'

  const saveRollsMutation = useMutation({
    mutationFn: () => updateGoodsReceiptRolls(id!, rolls),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['goodsReceipts'] })
      toast.success('布卷明細已儲存')
    },
  })

  const savePledgedQtyMutation = useMutation({
    mutationFn: () => updateGoodsReceiptPledgedQty(id!, pledgedQty.trim() === '' ? undefined : Number(pledgedQty)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['goodsReceipts'] })
      toast.success('投胚量已儲存')
    },
  })

  const savePurposeMutation = useMutation({
    mutationFn: (purpose: GoodsReceipt['purpose']) => updateGoodsReceiptPurpose(id!, purpose),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['goodsReceipts'] })
      toast.success('用途已儲存')
    },
  })

  const saveVendorInfoMutation = useMutation({
    mutationFn: () =>
      updateGoodsReceiptVendorInfo(id!, {
        vendorId: vendorId || undefined,
        vendorShipmentNo: vendorShipmentNo || undefined,
        vendorShipDate: vendorShipDate || undefined,
        receiptAttachmentName,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['goodsReceipts'] })
      toast.success('廠商資訊已儲存')
    },
  })

  const statusMutation = useMutation({
    mutationFn: (status: '已複核' | '已完成') => setGoodsReceiptStatus(id!, status),
    onSuccess: async (updated) => {
      // 入庫確認為「已完成」時會一併建立表7條碼、併入表8出貨單草稿、回頭結案表2訂購單／表1實際入庫對照，須一併刷新
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['goodsReceipts'] }),
        queryClient.invalidateQueries({ queryKey: ['fabricLabels'] }),
        queryClient.invalidateQueries({ queryKey: ['shippingOrders'] }),
        queryClient.invalidateQueries({ queryKey: ['purchaseOrders'] }),
        queryClient.invalidateQueries({ queryKey: ['packingNotices'] }),
        queryClient.invalidateQueries({ queryKey: ['dyeOrders'] }),
      ])
      toast.success(`${updated.id} 已變更為「${updated.status}」`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!receipt) {
    return (
      <div className="text-sm text-muted-foreground">
        找不到單號 {id} 的入庫單。
        <button className="ml-2 text-brand underline" onClick={() => navigate('/goods-receipt')}>
          返回列表
        </button>
      </div>
    )
  }

  const operator = getAccount(receipt.operatorAccountId)
  const vendor = receipt.vendorId ? getVendor(receipt.vendorId) : undefined
  /**
   * 關聯單據：優先用入庫單記錄的實際單號（成品訂單／胚布訂單／染單／二次加工單），
   * 這樣才分得出委外加工路徑的兩個觸發點（表4染單結案 vs. 表5二次加工單結案）；
   * 舊資料沒有關聯單號時，才退回以主號＋來源類型反推。
   */
  const RELATED_DOC_PATH: Record<NonNullable<GoodsReceipt['relatedDocType']>, string> = {
    成品訂單: 'purchase-order',
    胚布訂單: 'purchase-order',
    染單: 'dye-order',
    二次加工單: 'secondary-processing',
  }
  const relatedDoc = receipt.relatedDocId
    ? [...purchaseOrders, ...dyeOrders, ...secondaryProcessingOrders].find((d) => d.id === receipt.relatedDocId)
    : receipt.source === '委外加工'
      ? dyeOrders.find((d) => d.parentId === receipt.parentId && d.status === '已完成')
      : receipt.source === '直採大貨-成品'
        ? purchaseOrders.find((p) => p.parentId === receipt.parentId && p.type === '成品')
        : purchaseOrders.find((p) => p.parentId === receipt.parentId && p.type === '胚布')
  const relatedDocType =
    receipt.relatedDocType ??
    (receipt.source === '委外加工' ? '染單' : receipt.source === '直採大貨-成品' ? '成品訂單' : '胚布訂單')
  const relatedDocPath = RELATED_DOC_PATH[relatedDocType]
  /**
   * 沿鏈回推的染單：關聯單據是二次加工單時，經其 dyeOrderId 轉一手；
   * 「實際入庫數量對照」即記錄於這張染單，故一併顯示，方便核對貼對了沒有。
   */
  const chainedDyeOrder =
    relatedDocType === '染單'
      ? dyeOrders.find((d) => d.id === receipt.relatedDocId)
      : relatedDocType === '二次加工單'
        ? (() => {
            const spo = secondaryProcessingOrders.find((o) => o.id === receipt.relatedDocId)
            return spo?.dyeOrderId ? dyeOrders.find((d) => d.id === spo.dyeOrderId) : undefined
          })()
        : undefined
  const totalLength = rolls.reduce((sum, r) => sum + r.length, 0)
  const totalMeter = rolls.reduce((sum, r) => sum + r.meter, 0)
  const shrinkage = goodsReceiptShrinkageRate(receipt)
  const receiptLabels = fabricLabels
    .filter((l) => l.receiptId === receipt.id)
    .sort((a, b) => a.rollCode.localeCompare(b.rollCode))
  const isOutsourced = receipt.source === '委外加工'
  const pendingReviewCount = rolls.filter((r) => r.ocrConfidence === '低' && !r.reviewed).length

  function updateRoll(index: number, patch: Partial<GoodsReceiptRoll>) {
    setRolls((prev) =>
      prev.map((r, i) => {
        if (i !== index) return r
        const next = { ...r, ...patch }
        if (patch.length !== undefined) next.meter = Number(yardToMeter(next.length).toFixed(1))
        return next
      }),
    )
  }

  return (
    <div>
      <Link to="/goods-receipt" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> 返回入庫單列表
      </Link>

      <PageHeader
        title={receipt.id}
        formCode="表6"
        description={
          <>
            來源包裝通知單：
            <Link to={`/packing-notice/${receipt.parentId}`} className="text-brand-dark underline">
              {receipt.parentId}
            </Link>
          </>
        }
        actions={
          <>
            <StatusBadge status={receipt.status} className="text-sm" />
            {/*
              入庫單本身為內部驗收存查；表7標籤實務上是整張入庫單一次印完（10捲即10張），
              故第二個列印輸出直接把本單產生的布卷標籤全部排版，每張各佔一頁標籤紙。
            */}
            <PrintActions
              sheets={[
                { key: 'doc', label: '列印入庫單', sheet: <GoodsReceiptPrint receipt={receipt} /> },
                ...(receiptLabels.length > 0
                  ? [
                      {
                        key: 'labels',
                        label: `列印布卷標籤（${receiptLabels.length}）`,
                        sheet: (
                          <>
                            {receiptLabels.map((l) => (
                              <FabricLabelPrint key={l.id} label={l} />
                            ))}
                          </>
                        ),
                      },
                    ]
                  : []),
              ]}
            />
            {receipt.status === '草稿' && (
              <Button
                size="sm"
                className="bg-brand hover:bg-brand-dark"
                disabled={statusMutation.isPending || rolls.length === 0 || pendingReviewCount > 0}
                onClick={() => statusMutation.mutate('已複核')}
              >
                確認複核
              </Button>
            )}
            {receipt.status === '已複核' && (
              <Button size="sm" className="bg-brand hover:bg-brand-dark" disabled={statusMutation.isPending} onClick={() => statusMutation.mutate('已完成')}>
                標記完成入庫
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
            <DetailField label="觸發來源" value={receipt.source} />
            <DetailField
              label={`關聯單據：${relatedDocType}${relatedDocType === '成品訂單' || relatedDocType === '胚布訂單' ? '（入庫確認後一併結案）' : '（上游已完成，入庫為伴隨動作）'}`}
              value={
                relatedDoc ? (
                  <Link to={`/${relatedDocPath}/${relatedDoc.id}`} className="text-brand-dark underline">
                    {relatedDoc.id}
                  </Link>
                ) : (
                  '-'
                )
              }
            />
            {isOutsourced && chainedDyeOrder && relatedDocType === '二次加工單' && (
              <DetailField
                label="所屬染單（沿鏈回推）"
                value={
                  <Link to={`/dye-order/${chainedDyeOrder.id}`} className="text-brand-dark underline">
                    {chainedDyeOrder.id}
                  </Link>
                }
              />
            )}
            <DetailField label="入庫日" value={formatDate(receipt.receiptDate)} />
            <DetailField label="倉管人員" value={operator?.name} />
            <DetailField label="入倉部門" value={operator?.roles[0] ?? '-'} />
            <DetailField label="廠商名稱" value={vendor?.name ?? '-'} />
            <DetailField label="廠商出貨單號（OCR）" value={receipt.vendorShipmentNo || '-'} />
            <DetailField label="出貨日期（OCR）" value={formatDate(receipt.vendorShipDate)} />
            <DetailField label="布卷總數" value={`${rolls.length} 卷`} />
            <DetailField label="長度合計" value={`${formatNumber(totalLength, 0)} Yard ／ ${formatNumber(totalMeter, 1)} Meter`} />
            {isOutsourced && (
              <DetailField label="縮率" value={shrinkage !== null ? formatPercent(shrinkage) : '待填投胚量後計算'} />
            )}
            <DetailField
              label="用途"
              value={
                editable ? (
                  <select
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                    value={receipt.purpose ?? ''}
                    onChange={(e) => savePurposeMutation.mutate((e.target.value || undefined) as GoodsReceipt['purpose'])}
                  >
                    <option value="">請選擇</option>
                    {GOODS_RECEIPT_PURPOSES.map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                ) : (
                  (receipt.purpose ?? '-')
                )
              }
            />
          </DetailGrid>
        </CardContent>
      </Card>

      {editable && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">廠商資訊與原始收據附件</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">廠商名稱</label>
                <Select value={vendorId} onValueChange={setVendorId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="請選擇廠商" />
                  </SelectTrigger>
                  <SelectContent>
                    {vendors.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">廠商出貨單號（OCR）</label>
                <Input value={vendorShipmentNo} onChange={(e) => setVendorShipmentNo(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">出貨日期（OCR）</label>
                <Input type="date" value={vendorShipDate} onChange={(e) => setVendorShipDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">原始收據附件（掃描檔）</label>
                <input
                  type="file"
                  className="block w-full text-sm text-muted-foreground file:mr-2 file:rounded-md file:border file:border-input file:bg-background file:px-2 file:py-1 file:text-sm"
                  onChange={(e) => setReceiptAttachmentName(e.target.files?.[0]?.name)}
                />
                {receiptAttachmentName && <p className="text-xs text-muted-foreground">已選檔案：{receiptAttachmentName}</p>}
              </div>
            </div>
            <div className="mt-3 flex justify-end">
              <Button type="button" variant="outline" size="sm" disabled={saveVendorInfoMutation.isPending} onClick={() => saveVendorInfoMutation.mutate()}>
                儲存廠商資訊
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {isOutsourced && (
        <Card className="mt-4">
          <CardHeader>
            <CardTitle className="text-base">投胚量（縮率計算基準）</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-muted-foreground">
              縮率＝（投胚量－本次入庫總碼數）÷投胚量。優先取 OCR 辨識廠商單據標示值，若無則取染單「使用胚布」的待染數量，此處為人工覆核／輸入介面。
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">投胚量（Yard）</label>
                <Input
                  type="number"
                  step="1"
                  value={pledgedQty}
                  onChange={(e) => setPledgedQty(e.target.value)}
                  className="w-40"
                  disabled={!editable}
                />
              </div>
              {editable && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={savePledgedQtyMutation.isPending}
                  onClick={() => savePledgedQtyMutation.mutate()}
                >
                  儲存投胚量
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-4">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base">布卷明細（OCR 辨識結果，信心度低者建議人工複核）</CardTitle>
            {pendingReviewCount > 0 && (
              <p className="mt-1 text-xs text-warning">{pendingReviewCount} 個欄位待人工複核</p>
            )}
          </div>
          {editable && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setRolls((prev) => [
                  ...prev,
                  { rollNo: String(prev.length + 1), batchCode: '', length: 0, meter: 0, weight: 0, ocrConfidence: '人工輸入', reviewed: true },
                ])
              }
            >
              <Plus className="mr-1 h-4 w-4" /> 新增布卷
            </Button>
          )}
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>疋號</TableHead>
                  <TableHead>對應表1明細</TableHead>
                  <TableHead>批號</TableHead>
                  <TableHead className="text-right">碼數 (Y)</TableHead>
                  <TableHead className="text-right">米數 (M)</TableHead>
                  <TableHead className="text-right">重量 (KG)</TableHead>
                  <TableHead>OCR 辨識信心度</TableHead>
                  <TableHead>已人工複核</TableHead>
                  {editable && <TableHead className="w-10" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {rolls.map((roll, index) =>
                  editable ? (
                    <TableRow key={index}>
                      <TableCell>{roll.rollNo}</TableCell>
                      {/* 對應的表1明細列決定這一卷入庫後產生的條碼要掛哪個品名／顏色／規格分支；
                          留白時系統依明細順序與數量自動配額 */}
                      <TableCell>
                        <select
                          className="h-9 max-w-48 rounded-md border border-input bg-background px-2 text-sm"
                          value={roll.sourceItemId ?? ''}
                          onChange={(e) => updateRoll(index, { sourceItemId: e.target.value || undefined })}
                        >
                          <option value="">（依數量自動配額）</option>
                          {sourceItems.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.roricaProductName}
                              {productBranchSuffix(item.productId)}／{item.color}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-28"
                          placeholder="如 批3 P017"
                          value={roll.batchCode ?? ''}
                          onChange={(e) => updateRoll(index, { batchCode: e.target.value })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          className="ml-auto w-24 text-right"
                          value={roll.length}
                          onChange={(e) => updateRoll(index, { length: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.1"
                          className="ml-auto w-24 text-right"
                          value={roll.meter}
                          onChange={(e) => updateRoll(index, { meter: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.1"
                          className="ml-auto w-24 text-right"
                          value={roll.weight}
                          onChange={(e) => updateRoll(index, { weight: Number(e.target.value) })}
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                          value={roll.ocrConfidence}
                          onChange={(e) => updateRoll(index, { ocrConfidence: e.target.value as GoodsReceiptRoll['ocrConfidence'] })}
                        >
                          {CONFIDENCE_OPTIONS.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </TableCell>
                      <TableCell>
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={roll.reviewed ?? false}
                          disabled={roll.ocrConfidence !== '低'}
                          onChange={(e) => updateRoll(index, { reviewed: e.target.checked })}
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRolls((prev) => prev.filter((_, i) => i !== index))}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ) : (
                    <TableRow key={index}>
                      <TableCell>{roll.rollNo}</TableCell>
                      <TableCell>
                        {(() => {
                          const item = sourceItems.find((i) => i.id === roll.sourceItemId)
                          return item
                            ? `${item.roricaProductName}${productBranchSuffix(item.productId)}／${item.color}`
                            : '依數量自動配額'
                        })()}
                      </TableCell>
                      <TableCell>{roll.batchCode || '-'}</TableCell>
                      <TableCell className="text-right">{formatNumber(roll.length, 0)}</TableCell>
                      <TableCell className="text-right">{formatNumber(roll.meter, 1)}</TableCell>
                      <TableCell className="text-right">{formatNumber(roll.weight, 1)}</TableCell>
                      <TableCell className={cn('font-medium', CONFIDENCE_CLASS[roll.ocrConfidence])}>
                        {roll.ocrConfidence}
                        {roll.ocrConfidence === '低' && !roll.reviewed && (
                          <span className="ml-1 text-xs text-muted-foreground">（待人工複核）</span>
                        )}
                      </TableCell>
                      <TableCell>{roll.ocrConfidence === '低' ? (roll.reviewed ? '已複核' : '未複核') : '-'}</TableCell>
                    </TableRow>
                  ),
                )}
              </TableBody>
            </Table>
          </div>
          {editable && (
            <div className="mt-3 flex justify-end px-4">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saveRollsMutation.isPending}
                onClick={() => saveRollsMutation.mutate()}
              >
                儲存布卷明細
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

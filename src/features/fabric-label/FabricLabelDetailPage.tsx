import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Scissors } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DetailField, DetailGrid } from '@/components/shared/DetailField'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Barcode } from '@/components/print/Barcode'
import { PrintActions } from '@/components/print/PrintActions'
import { FabricLabelPrint } from './FabricLabelPrint'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/mocks/api'
import { markFabricLabelDefective, splitFabricLabel } from '@/mocks/mutations'
import { formatDate } from '@/lib/dates'
import { formatNumber, inchToCm, meterToYard, yardToMeter } from '@/lib/units'

/** 長度雙單位同時顯示，如 55.0yd／50.3m；不論欄位以 Yard 或 Meter 儲存皆換算補齊另一單位 */
function dualUnitLength(length: number, unit: 'Yard' | 'Meter') {
  const yard = unit === 'Yard' ? length : meterToYard(length)
  const meter = unit === 'Meter' ? length : yardToMeter(length)
  return `${formatNumber(yard, 1)}yd／${formatNumber(meter, 1)}m`
}

export function FabricLabelDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })
  const label = data.find((l) => l.id === id)

  const [splitOpen, setSplitOpen] = useState(false)
  const [splitLength, setSplitLength] = useState('')
  const [defectOpen, setDefectOpen] = useState(false)
  const [defectNote, setDefectNote] = useState('')

  const splitMutation = useMutation({
    mutationFn: (length: number) => splitFabricLabel(id!, length),
    onSuccess: async (newLabels) => {
      await queryClient.invalidateQueries({ queryKey: ['fabricLabels'] })
      toast.success(`原布卷已終止，已產生新條碼 ${newLabels.map((l) => l.rollCode).join('、')}`)
      setSplitOpen(false)
      setSplitLength('')
      navigate(`/fabric-label/${newLabels[0].id}`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const defectMutation = useMutation({
    mutationFn: (note: string) => markFabricLabelDefective(id!, note),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['fabricLabels'] })
      toast.success(`${updated.rollCode} 已標記為瑕疵／報廢，不再供任何訂單挑選`)
      setDefectOpen(false)
      setDefectNote('')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  if (!label) {
    return (
      <div className="text-sm text-muted-foreground">
        找不到條碼 {id} 的布卷條碼標籤。
        <button className="ml-2 text-brand underline" onClick={() => navigate('/fabric-label')}>
          返回列表
        </button>
      </div>
    )
  }

  return (
    <div>
      <Link to="/fabric-label" className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-ink print:hidden">
        <ArrowLeft className="h-4 w-4" /> 返回布卷資料列表
      </Link>

      <PageHeader
        title={label.rollCode}
        formCode="表7"
        description={
          <>
            來源入庫單：
            <Link to={`/goods-receipt/${label.receiptId}`} className="text-brand-dark underline">
              {label.receiptId}
            </Link>
          </>
        }
        actions={
          <>
            <StatusBadge status={label.status} className="text-sm print:hidden" />
            <PrintActions sheets={[{ key: 'label', label: '列印標籤', sheet: <FabricLabelPrint label={label} /> }]} />
            {label.status === '已建立' && label.length > 0 && (
              <Button size="sm" variant="outline" className="print:hidden" onClick={() => setSplitOpen(true)}>
                <Scissors className="mr-1 h-4 w-4" /> 分割布卷
              </Button>
            )}
            {/* 瑕疵／報廢為布卷的另一個終態；已完成或已終止的布卷不再開放標記 */}
            {(label.status === '已建立' || label.status === '已使用') && (
              <Button size="sm" variant="outline" className="print:hidden" onClick={() => setDefectOpen(true)}>
                <AlertTriangle className="mr-1 h-4 w-4" /> 標記瑕疵／報廢
              </Button>
            )}
          </>
        }
      />

      <Dialog open={splitOpen} onOpenChange={setSplitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>分割布卷 {label.rollCode}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            分割後原條碼 {label.rollCode} 將標記為「已終止」，不可再用於出貨；系統會產生兩張新條碼，流水號接續本入庫單目前最大可用流水號。
          </p>
          <div className="space-y-1.5">
            <Label>第一捲分割長度（{label.unit}，原長度 {label.length} {label.unit}）</Label>
            <Input
              type="number"
              step="0.1"
              value={splitLength}
              onChange={(e) => setSplitLength(e.target.value)}
              placeholder={`請輸入小於 ${label.length} 的長度`}
            />
            {splitLength && Number(splitLength) > 0 && Number(splitLength) < label.length && (
              <p className="text-xs text-muted-foreground">
                第二捲將自動產生，長度為 {(label.length - Number(splitLength)).toFixed(1)} {label.unit}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSplitOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-brand hover:bg-brand-dark"
              disabled={splitMutation.isPending || !splitLength}
              onClick={() => splitMutation.mutate(Number(splitLength))}
            >
              {splitMutation.isPending ? '分割中...' : '確認分割'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={defectOpen} onOpenChange={setDefectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>標記瑕疵／報廢 {label.rollCode}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            標記後本捲進入終態，<strong>不可再被任何訂單挑選</strong>：可用庫存查詢不再取用，出貨單明細若含本捲亦會被擋下。
            此動作不可復原，長度與異動紀錄皆完整保留供追溯。
          </p>
          <div className="space-y-1.5">
            <Label>原因（選填）</Label>
            <Input
              value={defectNote}
              onChange={(e) => setDefectNote(e.target.value)}
              placeholder="如：色差過大、破洞、水漬"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDefectOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={defectMutation.isPending}
              onClick={() => defectMutation.mutate(defectNote)}
            >
              {defectMutation.isPending ? '標記中...' : '確認標記'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {label.status === '瑕疵／報廢' && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            本捲已於 {formatDate(label.defectedAt)} 標記為瑕疵／報廢
            {label.defectNote ? `（${label.defectNote}）` : ''}，不再供任何訂單挑選；紀錄保留供追溯。
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">標籤資訊</CardTitle>
          </CardHeader>
          <CardContent>
            <DetailGrid>
              <DetailField label="布卷條碼" value={label.rollCode} />
              <DetailField label="皇加品名" value={label.productName} />
              <DetailField label="成分" value={label.composition ?? '-'} />
              <DetailField label="顏色" value={label.color} />
              {/* 系統畫面以英吋為主並附註公分換算；下方實體標籤列印僅印英吋 */}
              <DetailField label="幅寬" value={`${label.width}"（≈ ${formatNumber(inchToCm(label.width), 1)} cm）`} />
              <DetailField label="批" value={label.batchCode ?? '-'} />
              <DetailField label="長度（雙單位）" value={dualUnitLength(label.length, label.unit)} />
              <DetailField label="分割來源布卷" value={label.splitFromRollCode ?? '-'} />
            </DetailGrid>
          </CardContent>
        </Card>

        {label.lengthHistory && label.lengthHistory.length > 0 && (
          <Card className="lg:col-span-2 print:hidden">
            <CardHeader>
              <CardTitle className="text-base">長度異動紀錄</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                {label.lengthHistory.map((change, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2 text-ink-body">
                    <span className="text-muted-foreground">{formatDate(change.at)}</span>
                    <span>
                      {dualUnitLength(change.beforeLength, label.unit)} → {dualUnitLength(change.afterLength, label.unit)}
                    </span>
                    <span className="text-muted-foreground">（{change.reason}）</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base print:hidden">實體標籤預覽（列印格式：上方條碼＋人讀碼／中段欄位資訊／下方再印一次條碼＋人讀碼）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mx-auto max-w-xs rounded-lg border-2 border-dashed border-border bg-surface-muted p-4 print:max-w-none print:border-none print:bg-white print:p-0">
              <div className="rounded-md border border-border bg-white p-4 shadow-sm print:shadow-none">
                {/* 上方條碼＋人讀碼 */}
                <div className="h-10">
                  {/* 實際可掃描的 Code 128 條碼，與列印標籤同一組編碼 */}
                  <Barcode value={label.rollCode} height={10} />
                </div>
                <div className="mt-1 text-center font-mono text-xs tracking-widest text-ink">{label.rollCode}</div>

                {/* 中段欄位資訊 */}
                <div className="mt-3 border-y border-dashed border-border py-3">
                  <div className="text-sm font-semibold text-ink">皇加品名：{label.productName}</div>
                  <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-ink-body">
                    <span className="text-muted-foreground">成分</span>
                    <span>{label.composition ?? '-'}</span>
                    <span className="text-muted-foreground">顏色</span>
                    <span>{label.color}</span>
                    <span className="text-muted-foreground">幅寬</span>
                    <span>{label.width}"</span>
                    <span className="text-muted-foreground">批</span>
                    <span>{label.batchCode ?? '-'}</span>
                    <span className="text-muted-foreground">長度</span>
                    <span>{dualUnitLength(label.length, label.unit)}</span>
                  </div>
                </div>

                {/* 下方再印一次相同條碼＋人讀碼 */}
                <div className="mt-3 h-10">
                  {/* 實際可掃描的 Code 128 條碼，與列印標籤同一組編碼 */}
                  <Barcode value={label.rollCode} height={10} />
                </div>
                <div className="mt-1 text-center font-mono text-xs tracking-widest text-ink">{label.rollCode}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

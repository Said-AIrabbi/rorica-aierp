import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { api } from '@/mocks/api'
import { getCustomer } from '@/mocks/data'
import { releaseStockReservation } from '@/mocks/mutations'
import { formatDateTime } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { effectiveReservationStatus, isRollReserved } from '@/lib/inventory'
import { rollLengthText } from '@/components/shared/BasisQty'
import type { FabricLabel } from '@/types'

/** 凍結窗格用的 class：表頭卡上緣、固定欄卡左緣，邊線用 box-shadow 畫（collapse 版面下 border 會跟著捲走） */
const STICKY_HEAD = 'sticky top-0 z-10 bg-inherit shadow-[inset_0_-1px_0_var(--color-border)]'
const STICKY_CELL = 'sticky left-0 z-20 bg-inherit shadow-[1px_0_0_var(--color-border)]'

interface StockRow {
  productName: string
  color: string
  /** 同一品名底下有現貨的顏色數：同品名的每一列都帶同樣的數字 */
  colorCount: number
  /** 該品名＋顏色目前的布卷數 */
  rollCount: number
  onHandQty: number
  reservedQty: number
  availableQty: number
  /** 該色的實際布卷，供展開檢視逐捲長度 */
  rolls: FabricLabel[]
}

export function StockOverviewPage() {
  const queryClient = useQueryClient()
  const { data: fabricLabels = [], isLoading } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })
  const { data: reservations = [] } = useQuery({ queryKey: ['stockReservations'], queryFn: api.stockReservations })

  const activeReservations = useMemo(
    () => reservations.filter((r) => effectiveReservationStatus(r) === '預留中'),
    [reservations],
  )

  const rows = useMemo<StockRow[]>(() => {
    // 品名可能含空白，故以資料不會出現的 NUL 字元組鍵，並把品名／顏色一起放進值裡
    const onHand = new Map<string, { productName: string; color: string; labels: FabricLabel[] }>()
    fabricLabels
      .filter((l) => l.status === '已建立')
      .forEach((l) => {
        const key = `${l.productName}\u0000${l.color}`
        const entry = onHand.get(key) ?? { productName: l.productName, color: l.color, labels: [] }
        entry.labels.push(l)
        onHand.set(key, entry)
      })

    // 同品名有幾個顏色：先數過一輪，再逐列帶入
    const colorCountByProduct = new Map<string, number>()
    onHand.forEach(({ productName }) => {
      colorCountByProduct.set(productName, (colorCountByProduct.get(productName) ?? 0) + 1)
    })

    return Array.from(onHand.values())
      .map(({ productName, color, labels }) => {
        const onHandQty = labels.reduce((sum, l) => sum + l.length, 0)
        const reservedQty = activeReservations
          .filter((r) => r.productName === productName && r.color === color)
          .reduce((sum, r) => sum + r.qty, 0)
        return {
          productName,
          color,
          colorCount: colorCountByProduct.get(productName) ?? 1,
          rollCount: labels.length,
          onHandQty,
          reservedQty,
          availableQty: Math.max(onHandQty - reservedQty, 0),
          // 逐捲檢視由長到短：挑整疋或湊零碼都是先看最長的幾捲
          rolls: [...labels].sort((a, b) => b.length - a.length),
        }
      })
      // 同品名的各色排在一起，才看得出「這個品名有幾色」
      .sort((a, b) => a.productName.localeCompare(b.productName) || a.color.localeCompare(b.color))
  }, [fabricLabels, activeReservations])

  /** 展開中的品名＋顏色：一個分支可能上百捲，逐捲明細只在點選時展開 */
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const rowKey = (row: Pick<StockRow, 'productName' | 'color'>) => `${row.productName}\u0000${row.color}`
  const expandedRow = rows.find((r) => rowKey(r) === expandedKey)

  const releaseMutation = useMutation({
    mutationFn: (id: string) => releaseStockReservation(id),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({ queryKey: ['stockReservations'] })
      toast.success(`${updated.id} 已釋放預留`)
    },
  })

  const columns = useMemo<ColumnDef<StockRow, unknown>[]>(
    () => [
      { accessorKey: 'productName', header: '皇加品名' },
      { accessorKey: 'color', header: '顏色' },
      // 該色目前有幾捲：捲數與逐捲長度是挑貨的依據
      { id: 'rollCount', header: '布卷數', accessorFn: (row) => `${row.rollCount} 捲` },
      { id: 'onHandQty', header: '實際庫存 (Yard)', accessorFn: (row) => formatNumber(row.onHandQty, 0) },
      { id: 'reservedQty', header: '已預留未出貨 (Yard)', accessorFn: (row) => formatNumber(row.reservedQty, 0) },
      {
        id: 'availableQty',
        header: '可用庫存 (Yard)',
        accessorFn: (row) => row.availableQty,
        cell: ({ row }) => (
          <span className="font-medium">
            {formatNumber(row.original.availableQty, 0)}{' '}
            {row.original.availableQty > 0 ? (
              <Badge variant="outline" className="ml-1 border-success text-success">
                有現貨
              </Badge>
            ) : (
              <Badge variant="outline" className="ml-1 border-muted-foreground text-muted-foreground">
                無現貨
              </Badge>
            )}
          </span>
        ),
      },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="現貨/無現貨總覽"
        description="ERP 即時查詢庫存（捲/批次層級），可用庫存＝實際庫存－已預留未出貨；建立包裝通知單時系統會依此自動判斷並建立庫存預留紀錄。點任一列可展開該色的逐捲明細。"
      />

      <DataTable
        columns={columns}
        data={rows}
        searchPlaceholder="搜尋皇加品名、顏色..."
        emptyText={isLoading ? '載入中...' : '目前沒有現貨庫存資料'}
        onRowClick={(row) => setExpandedKey((prev) => (prev === rowKey(row) ? null : rowKey(row)))}
      />

      {expandedRow && (
        <Card className="mt-4 border-brand/30">
          <CardHeader>
            <CardTitle className="text-base">
              布卷明細　{expandedRow.productName}　{expandedRow.color}
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {expandedRow.rollCount} 捲，合計 {formatNumber(expandedRow.onHandQty, 1)} Yard（點同一列可收合）
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-0">
            <div className="max-h-[22rem] overflow-auto">
              <table className="w-full min-w-[44rem] caption-bottom text-sm">
                <TableHeader>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableHead className={cn(STICKY_HEAD, 'left-0 z-30')}>布卷條碼</TableHead>
                    <TableHead className={STICKY_HEAD}>長度</TableHead>
                    <TableHead className={STICKY_HEAD}>幅寬</TableHead>
                    <TableHead className={STICKY_HEAD}>批</TableHead>
                    <TableHead className={STICKY_HEAD}>狀態</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {expandedRow.rolls.map((roll) => (
                    <TableRow key={roll.rollCode} className="bg-card">
                      <TableCell className={cn(STICKY_CELL, 'font-mono text-xs')}>{roll.rollCode}</TableCell>
                      {/* 長度以該捲入庫時實際量測的單位為主值，另一單位標 ≈（決策86 表7 規則） */}
                      <TableCell>{rollLengthText(roll.length, roll.unit)}</TableCell>
                      <TableCell>{roll.width}"</TableCell>
                      <TableCell>{roll.batchCode || '-'}</TableCell>
                      <TableCell>
                        {isRollReserved(roll.rollCode, activeReservations) ? (
                          <Badge variant="outline" className="border-warning text-warning">
                            已預留
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-success text-success">
                            可用
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">庫存預留中（14天效期，逾期自動釋放）</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          {/* 本表為手寫版面（含操作按鈕欄）不走 DataTable，凍結窗格在此比照辦理：
              捲軸收在框內（sticky 相對最近的捲動祖先定位），來源單號欄固定於左側 */}
          <div className="max-h-[26rem] overflow-auto">
            <table className="w-full min-w-[44rem] caption-bottom text-sm">
              <TableHeader>
                <TableRow className="bg-muted hover:bg-muted">
                  <TableHead className={cn(STICKY_HEAD, 'left-0 z-30')}>來源包裝通知單</TableHead>
                  <TableHead className={STICKY_HEAD}>客戶</TableHead>
                  <TableHead className={STICKY_HEAD}>皇加品名</TableHead>
                  <TableHead className={STICKY_HEAD}>顏色</TableHead>
                  <TableHead className={STICKY_HEAD}>捲號</TableHead>
                  <TableHead className={cn(STICKY_HEAD, 'text-right')}>數量</TableHead>
                  <TableHead className={STICKY_HEAD}>效期至</TableHead>
                  <TableHead className={cn(STICKY_HEAD, 'w-10')} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeReservations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="h-20 text-center text-muted-foreground">
                      目前沒有預留中的庫存
                    </TableCell>
                  </TableRow>
                ) : (
                  activeReservations.map((r) => (
                    // 整列須為不透明色，固定欄以 bg-inherit 取色才不會透出捲動中的內容
                    <TableRow key={r.id} className="bg-card">
                      <TableCell className={STICKY_CELL}>{r.packingNoticeId}</TableCell>
                      <TableCell>{getCustomer(r.customerId)?.shortName ?? r.customerId}</TableCell>
                      <TableCell>{r.productName}</TableCell>
                      <TableCell>{r.color}</TableCell>
                      <TableCell>{r.rollCodes.join('、')}</TableCell>
                      <TableCell className="text-right">
                        {formatNumber(r.qty, 0)} {r.unit}
                      </TableCell>
                      <TableCell>{formatDateTime(r.expiresAt)}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          disabled={releaseMutation.isPending}
                          onClick={() => releaseMutation.mutate(r.id)}
                        >
                          釋放
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>接疋（拼接組合）建議由系統提供，非全自動執行，仍需人工於出貨時最終確認；不允許人工強制超賣覆蓋庫存預留。</span>
      </div>
    </div>
  )
}

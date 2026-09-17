import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight, Info } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/mocks/api'
import { isRollReserved } from '@/lib/inventory'
import { formatNumber, meterToYard } from '@/lib/units'
import { rollLengthText } from '@/components/shared/BasisQty'
import type { FabricLabel, Product } from '@/types'

/** 布卷長度一律換算為碼呈現：帳務基準為 Yard */
function toYard(roll: FabricLabel): number {
  return roll.unit === 'Yard' ? roll.length : meterToYard(roll.length)
}

/** 與實體標籤同一種呈現：以該捲實測單位為主值，另一單位標 ≈，避免與標籤對不起來 */
function dualUnitLength(roll: FabricLabel): string {
  return rollLengthText(roll.length, roll.unit)
}

type RollFilter = '可用' | '已預留' | '瑕疵／報廢' | '全部'

/**
 * 商品編輯視窗的「布卷資料」卡（PRD 第四章第 5 節、決策 61-3）。
 * 資料層布卷仍是獨立的第五張主檔，但 UI 層併入商品主檔：
 * 使用者先在商品列表看到商品，點進商品後才看到這個分支底下實際存在的每一捲布，
 * 不需要在側邊選單另外找一張「布卷資料主檔」。
 *
 * 本卡唯讀——布卷狀態一律只能經由入庫、出貨、分割、客訴等單據觸發改變，
 * 不可在商品頁直接修改，以免繞過單據導致稽核軌跡中斷；單捲的長度異動紀錄、
 * 分割與實體標籤列印仍在該捲的布卷頁（點條碼進入）。
 */
export function ProductStockCard({ product }: { product: Product }) {
  const [expanded, setExpanded] = useState(true)
  const [filter, setFilter] = useState<RollFilter>('可用')
  const { data: fabricLabels = [] } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })
  const { data: stockReservations = [] } = useQuery({ queryKey: ['stockReservations'], queryFn: api.stockReservations })

  // 只比對同一產品分支的布卷：44 吋的布卷不可沖抵 72 吋的需求，即使品名相同
  const rolls = fabricLabels.filter((l) => l.productId === product.id)

  const defective = rolls.filter((l) => l.status === '瑕疵／報廢')
  const inStock = rolls.filter((l) => l.status === '已建立')
  const reserved = inStock.filter((l) => isRollReserved(l.rollCode, stockReservations))
  const available = inStock.filter((l) => !isRollReserved(l.rollCode, stockReservations))
  const availableYard = available.reduce((sum, l) => sum + toYard(l), 0)

  const summary: { key: RollFilter; value: string; note: string }[] = [
    { key: '可用', value: `${available.length} 捲`, note: `合計 ${formatNumber(availableYard, 1)} 碼` },
    { key: '已預留', value: `${reserved.length} 捲`, note: '綁定客戶、14 天效期' },
    { key: '瑕疵／報廢', value: `${defective.length} 捲`, note: '不可再被訂單挑選' },
    { key: '全部', value: `${rolls.length} 捲`, note: '含已出貨與已終止' },
  ]

  const visibleRolls =
    filter === '可用'
      ? available
      : filter === '已預留'
        ? reserved
        : filter === '瑕疵／報廢'
          ? defective
          : rolls

  return (
    <Card>
      <CardHeader>
        <CardTitle>布卷資料（本產品分支實際存在的每一捲布）</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/10 p-3 text-xs text-ink-body">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" />
          <span>
            以本商品的產品編號 {product.id} 即時查詢布卷資料，非儲存於商品主檔。
            <strong>商品</strong>一列＝一個產品分支（型錄性質）；<strong>布卷</strong>一列＝倉庫裡實際存在的那一捲布（庫存帳性質，入庫時自動產生）。
            本卡唯讀，布卷狀態一律只能經由入庫、出貨、分割、客訴等單據觸發改變；
            點條碼可進入該捲檢視長度異動紀錄、分割布卷並列印實體標籤（表7 列印格式）。
          </span>
        </div>

        {/* 摘要同時是篩選器：點哪一格就只看那一類布卷 */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.map((item) => (
            <button
              key={item.key}
              type="button"
              className={`rounded-lg border p-3 text-left transition-colors ${
                filter === item.key ? 'border-brand bg-brand/10' : 'border-border bg-muted hover:border-brand/50'
              }`}
              onClick={() => {
                setFilter(item.key)
                setExpanded(true)
              }}
            >
              <div className="text-xs text-muted-foreground">{item.key}</div>
              <div className="mt-0.5 text-lg font-semibold text-ink">{item.value}</div>
              <div className="text-[11px] text-muted-foreground">{item.note}</div>
            </button>
          ))}
        </div>

        {rolls.length > 0 && (
          <>
            {/* 一個分支可能有上百捲，故提供收合 */}
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 text-sm text-brand-dark hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {expanded ? '收合布卷明細' : `展開布卷明細（${filter} ${visibleRolls.length} 捲）`}
            </button>

            {expanded && (
              <div className="mt-2 max-h-96 overflow-auto rounded-lg border border-border">
                <Table>
                  <TableHeader className="sticky top-0 bg-muted">
                    <TableRow>
                      <TableHead>布卷條碼</TableHead>
                      <TableHead>顏色</TableHead>
                      <TableHead>批</TableHead>
                      <TableHead className="text-right">長度（雙單位）</TableHead>
                      <TableHead>來源入庫單</TableHead>
                      <TableHead>狀態</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visibleRolls.map((roll) => (
                      <TableRow key={roll.id}>
                        <TableCell>
                          <Link to={`/fabric-label/${roll.id}`} className="text-brand-dark underline">
                            {roll.rollCode}
                          </Link>
                          {roll.splitFromRollCode && (
                            <span className="ml-1.5 text-xs text-muted-foreground">（由 {roll.splitFromRollCode} 分割）</span>
                          )}
                        </TableCell>
                        <TableCell>{roll.color}</TableCell>
                        <TableCell>{roll.batchCode ?? '-'}</TableCell>
                        <TableCell className="text-right tabular-nums">{dualUnitLength(roll)}</TableCell>
                        <TableCell className="text-muted-foreground">{roll.receiptId}</TableCell>
                        <TableCell>
                          <StatusBadge status={roll.status} />
                          {roll.status === '已建立' && isRollReserved(roll.rollCode, stockReservations) && (
                            <span className="ml-1.5 text-xs text-muted-foreground">已預留</span>
                          )}
                          {roll.defectNote && <div className="text-xs text-destructive">{roll.defectNote}</div>}
                        </TableCell>
                      </TableRow>
                    ))}
                    {visibleRolls.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center text-muted-foreground">
                          此分類目前沒有布卷
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </>
        )}

        {rolls.length === 0 && <p className="mt-3 text-sm text-muted-foreground">本產品分支目前沒有任何布卷紀錄</p>}
      </CardContent>
    </Card>
  )
}

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/mocks/api'
import { isRollReserved } from '@/lib/inventory'
import { formatNumber, meterToYard } from '@/lib/units'
import type { FabricLabel, Product } from '@/types'

/** 布卷長度一律換算為碼呈現：帳務基準為 Yard */
function toYard(roll: FabricLabel): number {
  return roll.unit === 'Yard' ? roll.length : meterToYard(roll.length)
}

/**
 * 商品編輯視窗的第五張卡「庫存」（PRD 第四章第 5 節、決策 61-3）。
 * 以本商品的產品編號為條件即時查詢布卷資料主檔；資料不儲存於商品主檔，僅為查詢結果的呈現。
 * 本卡唯讀——布卷狀態一律只能經由入庫、出貨、分割、客訴等單據觸發改變，
 * 不可在商品頁直接修改，以免繞過單據導致稽核軌跡中斷。
 */
export function ProductStockCard({ product }: { product: Product }) {
  const [expanded, setExpanded] = useState(false)
  const { data: fabricLabels = [] } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })
  const { data: stockReservations = [] } = useQuery({ queryKey: ['stockReservations'], queryFn: api.stockReservations })

  // 只比對同一產品分支的布卷：44 吋的布卷不可沖抵 72 吋的需求，即使品名相同
  const rolls = fabricLabels.filter((l) => l.productId === product.id)

  const defective = rolls.filter((l) => l.status === '瑕疵／報廢')
  const inStock = rolls.filter((l) => l.status === '已建立')
  const reserved = inStock.filter((l) => isRollReserved(l.rollCode, stockReservations))
  const available = inStock.filter((l) => !isRollReserved(l.rollCode, stockReservations))
  const availableYard = available.reduce((sum, l) => sum + toYard(l), 0)

  const summary = [
    { label: '可用', value: `${available.length} 捲`, note: `合計 ${formatNumber(availableYard, 1)} 碼` },
    { label: '已預留', value: `${reserved.length} 捲`, note: '綁定客戶、14 天效期' },
    { label: '瑕疵／報廢', value: `${defective.length} 捲`, note: '不可再被訂單挑選' },
    { label: '本分支全部', value: `${rolls.length} 捲`, note: '含已出貨與已終止' },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>庫存（唯讀，即時查詢布卷資料主檔）</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="mb-3 text-xs text-muted-foreground">
          以本商品的產品編號 {product.id} 為條件查詢，資料不儲存於商品主檔。布卷狀態一律只能經由入庫、出貨、分割、客訴等單據觸發改變，不可於本頁直接修改，以免繞過單據導致稽核軌跡中斷。
        </p>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {summary.map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-muted p-3">
              <div className="text-xs text-muted-foreground">{item.label}</div>
              <div className="mt-0.5 text-lg font-semibold text-ink">{item.value}</div>
              <div className="text-[11px] text-muted-foreground">{item.note}</div>
            </div>
          ))}
        </div>

        {rolls.length > 0 && (
          <>
            {/* 一個分支可能有上百捲，故預設只顯示摘要，需要時才展開逐捲明細 */}
            <button
              type="button"
              className="mt-3 inline-flex items-center gap-1 text-sm text-brand-dark hover:underline"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              {expanded ? '收合逐捲明細' : `展開逐捲明細（${rolls.length} 捲）`}
            </button>

            {expanded && (
              <div className="mt-2 max-h-80 overflow-y-auto rounded-lg border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">條碼</th>
                      <th className="px-3 py-2 text-right font-medium">長度（碼）</th>
                      <th className="px-3 py-2 text-left font-medium">批</th>
                      <th className="px-3 py-2 text-left font-medium">狀態</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rolls.map((roll) => (
                      <tr key={roll.id} className="border-t border-border">
                        <td className="px-3 py-1.5">
                          <Link to={`/fabric-label/${roll.id}`} className="text-brand-dark underline">
                            {roll.rollCode}
                          </Link>
                        </td>
                        <td className="px-3 py-1.5 text-right tabular-nums">{formatNumber(toYard(roll), 1)}</td>
                        <td className="px-3 py-1.5">{roll.batchCode ?? '-'}</td>
                        <td className="px-3 py-1.5">
                          <StatusBadge status={roll.status} />
                          {roll.status === '已建立' && isRollReserved(roll.rollCode, stockReservations) && (
                            <span className="ml-1.5 text-xs text-muted-foreground">已預留</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {rolls.length === 0 && <p className="mt-3 text-sm text-muted-foreground">本產品分支目前沒有任何布卷紀錄</p>}
      </CardContent>
    </Card>
  )
}

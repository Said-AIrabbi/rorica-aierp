import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getVendor, vendorDisplayName } from '@/mocks/data'
import { formatDate } from '@/lib/dates'
import { formatNumber } from '@/lib/units'
import { DEFAULT_SHRINKAGE_PCT, recommendedShrinkage } from '@/lib/workflow'
import type { Product } from '@/types'

/**
 * 縮率實績（決策160）：每次委外加工確認入庫記一筆，依染整廠分組列出平均——
 * 這個平均就是之後開表4 時預期縮率的推薦值（同一產品＋同一染整廠）。
 */
export function ShrinkageRecordsCard({ product }: { product: Product }) {
  const records = [...(product.shrinkageRecords ?? [])].sort((a, b) => b.recordedAt.localeCompare(a.recordedAt))
  const vendorIds = [...new Set(records.map((r) => r.dyeVendorId))]

  return (
    <Card>
      <CardHeader>
        <CardTitle>縮率實績（委外加工確認入庫時逐筆記錄）</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          縮率＝（投胚量－入庫碼數）÷ 投胚量，與表6 入庫單同一算法。同一染整廠的平均即開表4 時預期縮率的推薦值；
          沒有實績的染整廠預設 {DEFAULT_SHRINKAGE_PCT}%。
        </p>
        {records.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無縮率實績。</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {vendorIds.map((vendorId) => {
                const rec = recommendedShrinkage(product, vendorId)
                return (
                  <span key={vendorId} className="rounded-md border border-border bg-muted/40 px-2.5 py-1 text-sm">
                    {vendorDisplayName(getVendor(vendorId)) || vendorId}：平均{' '}
                    <b className="text-ink">{formatNumber(rec?.pct ?? 0, 1)}%</b>
                    <span className="text-muted-foreground">（{rec?.count ?? 0} 筆）</span>
                  </span>
                )
              })}
            </div>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>入庫日</TableHead>
                    <TableHead>染整廠</TableHead>
                    <TableHead>入庫單</TableHead>
                    <TableHead>染單</TableHead>
                    <TableHead className="text-right">投胚量 (Y)</TableHead>
                    <TableHead className="text-right">入庫碼數 (Y)</TableHead>
                    <TableHead className="text-right">實際縮率</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {records.map((r) => (
                    <TableRow key={r.receiptId}>
                      <TableCell>{formatDate(r.recordedAt)}</TableCell>
                      <TableCell>{vendorDisplayName(getVendor(r.dyeVendorId)) || r.dyeVendorId}</TableCell>
                      <TableCell>
                        <Link to={`/goods-receipt/${r.receiptId}`} className="text-brand-dark underline">
                          {r.receiptId}
                        </Link>
                      </TableCell>
                      <TableCell>
                        {r.dyeOrderId ? (
                          <Link to={`/dye-order/${r.dyeOrderId}`} className="text-brand-dark underline">
                            {r.dyeOrderId}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell className="text-right">{formatNumber(r.pledgedQty, 1)}</TableCell>
                      <TableCell className="text-right">{formatNumber(r.receivedQty, 1)}</TableCell>
                      <TableCell className="text-right">{formatNumber(r.ratePct, 1)}%</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}

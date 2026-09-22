import { useMemo, useState } from 'react'
import { AlertTriangle, Scissors } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { availableFabricLabels, checkCustomSplicing } from '@/lib/inventory'
import { formatNumber } from '@/lib/units'
import type { FabricLabel, PackingNoticeItem, SplicingSuggestion, StockReservation } from '@/types'

/**
 * 自訂拼接組合（主文件決策17）。
 *
 * 系統的自動建議只找「剛好整疋、最多 3 捲」那種無耗損組合，但現場常有它算不到的考量——
 * 同批染缸、同一支布的前後段、客戶指定捲號。這裡讓生管自己從現有可用布卷挑。
 *
 * 做不出來的組合（沒選、總量不足）擋下；做得出來但有代價的（超過 3 捲、湊不到整疋）
 * 只提醒不卡控——生管知道自己在做什麼，規則不該把人擋死。
 */
export function CustomSplicingDialog({
  open,
  onOpenChange,
  suggestion,
  item,
  fabricLabels,
  stockReservations,
  onConfirm,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  suggestion: SplicingSuggestion
  item: PackingNoticeItem | undefined
  fabricLabels: FabricLabel[]
  stockReservations: StockReservation[]
  onConfirm: (rollCodes: string[]) => void
  pending: boolean
}) {
  // 預選系統建議的那一組，讓生管從它改起，而不是從空白開始重挑
  const [selected, setSelected] = useState<string[]>(suggestion.rollCodes)

  const available = useMemo(() => {
    if (!item) return []
    return availableFabricLabels(
      item.roricaProductName,
      item.color,
      fabricLabels,
      stockReservations,
      item.productId,
    ).sort((a, b) => b.length - a.length)
  }, [item, fabricLabels, stockReservations])

  const chosen = available.filter((l) => selected.includes(l.rollCode))
  const check = checkCustomSplicing(chosen, suggestion.requiredQty, suggestion.standardSize)

  const toggle = (rollCode: string) =>
    setSelected((prev) =>
      prev.includes(rollCode) ? prev.filter((c) => c !== rollCode) : [...prev, rollCode],
    )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>自訂拼接組合</DialogTitle>
          <DialogDescription>
            {suggestion.productName}　{suggestion.color}　需求量 {formatNumber(suggestion.requiredQty, 0)} Yard
            　原疋標準尺寸 {formatNumber(suggestion.standardSize, 0)} Yard
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          系統只找得到「剛好整疋、最多 3 捲」的無耗損組合。若你有系統算不到的考量
          （同批染缸、同一支布的前後段、客戶指定捲號），在此自行挑選即可；
          超過 3 捲或湊不到整疋只會提醒，不會擋下。
        </p>

        <div className="max-h-72 overflow-y-auto rounded-md border border-border">
          {available.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">目前沒有可用的布卷。</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-border text-left">
                  <th className="w-10 px-3 py-2" />
                  <th className="px-3 py-2 font-medium text-muted-foreground">捲號</th>
                  <th className="px-3 py-2 font-medium text-muted-foreground">批號</th>
                  <th className="px-3 py-2 text-right font-medium text-muted-foreground">長度</th>
                </tr>
              </thead>
              <tbody>
                {available.map((roll) => {
                  const isSuggested = suggestion.rollCodes.includes(roll.rollCode)
                  return (
                    <tr key={roll.rollCode} className="border-b border-border/60 last:border-0">
                      <td className="px-3 py-1.5">
                        <input
                          type="checkbox"
                          checked={selected.includes(roll.rollCode)}
                          onChange={() => toggle(roll.rollCode)}
                          className="h-4 w-4 accent-[var(--color-brand)]"
                        />
                      </td>
                      <td className="px-3 py-1.5 font-mono text-xs">
                        {roll.rollCode}
                        {isSuggested && (
                          <span className="ml-1.5 rounded bg-brand/10 px-1 py-0.5 text-[10px] text-brand-dark">
                            系統建議
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{roll.batchCode}</td>
                      <td className="px-3 py-1.5 text-right">{formatNumber(roll.length, 1)} Yard</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
          已選 <b>{chosen.length}</b> 捲（{Math.max(chosen.length - 1, 0)} 次接合），合計{' '}
          <b>{formatNumber(check.totalLength, 1)} Yard</b>
          {suggestion.standardSize > 0 && (
            <span className="text-muted-foreground">
              　＝ {formatNumber(check.totalLength / suggestion.standardSize, 2)} 疋
            </span>
          )}
        </div>

        {check.errors.length > 0 && (
          <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2.5 text-sm text-destructive">
            {check.errors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        )}
        {check.warnings.length > 0 && (
          <ul className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-2.5 text-sm text-warning">
            {check.warnings.map((w, i) => (
              <li key={i} className="flex items-start gap-1.5">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="bg-brand hover:bg-brand-dark"
            disabled={check.errors.length > 0 || pending}
            onClick={() => onConfirm(selected)}
          >
            <Scissors className="mr-1 h-4 w-4" />
            採用這個組合
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

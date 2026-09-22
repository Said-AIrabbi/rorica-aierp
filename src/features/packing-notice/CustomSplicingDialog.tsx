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
import type { FabricLabel, PackingNoticeItem, StockReservation } from '@/types'

/**
 * 自訂拼接組合（主文件決策17、決策120）。
 *
 * 兩個入口共用這個對話框：
 *   ① 系統湊得出整疋 → 有一筆待確認的建議，生管可改挑別的捲
 *   ② 系統湊不出整疋但庫存夠 → 依決策5 自動以整捲＋裁切配好了，沒有建議可按。
 *      但那等於系統自己決定了要接幾捲、裁掉多少——而**接疋與裁切要不要接受是客戶的事**。
 *      故這種明細也進得來，讓生管重挑並留下依據。
 *
 * 做不出來的組合（沒選、總量不足）擋下；做得出來但有代價的（超過 3 捲、湊不到整疋）
 * 只提醒不卡控，但要求填依據——客戶那端的同意系統拿不到證明，至少留得下是憑什麼這樣配。
 */
export function CustomSplicingDialog({
  open,
  onOpenChange,
  item,
  requiredQty,
  standardSize,
  currentRollCodes,
  hasSuggestion,
  fabricLabels,
  stockReservations,
  onConfirm,
  pending,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  item: PackingNoticeItem | undefined
  requiredQty: number
  standardSize: number
  /** 目前已配到的捲（目前配貨的，或已預留的），開啟時預選 */
  currentRollCodes: string[]
  /** 是否來自「系統有給建議」那一條路——決定提示文字 */
  hasSuggestion: boolean
  fabricLabels: FabricLabel[]
  stockReservations: StockReservation[]
  onConfirm: (rollCodes: string[], note: string) => void
  pending: boolean
}) {
  // 從目前這一組改起，而不是從空白重挑
  const [selected, setSelected] = useState<string[]>(currentRollCodes)
  const [note, setNote] = useState('')

  const available = useMemo(() => {
    if (!item) return []
    const rolls = availableFabricLabels(
      item.roricaProductName,
      item.color,
      fabricLabels,
      stockReservations,
      item.productId,
    )
    // 這筆明細目前已預留的捲，對它自己而言仍然可選（availableFabricLabels 會把它們濾掉）
    const own = fabricLabels.filter(
      (l) => currentRollCodes.includes(l.rollCode) && !rolls.some((r) => r.rollCode === l.rollCode),
    )
    return [...rolls, ...own].sort((a, b) => b.length - a.length)
  }, [item, fabricLabels, stockReservations, currentRollCodes])

  const chosen = available.filter((l) => selected.includes(l.rollCode))
  const check = checkCustomSplicing(chosen, requiredQty, standardSize)
  // 有代價的組合要留下依據：客戶那端的同意系統拿不到證明
  const noteRequired = check.warnings.length > 0
  const noteMissing = noteRequired && note.trim().length === 0

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
            {item?.roricaProductName}　{item?.color}　需求量 {formatNumber(requiredQty, 0)} Yard
            {standardSize > 0 && <>　原疋標準尺寸 {formatNumber(standardSize, 0)} Yard</>}
          </DialogDescription>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          {hasSuggestion
            ? '系統只找得到「剛好整疋、最多 3 捲」的無耗損組合。若你有系統算不到的考量（同批染缸、同一支布的前後段、客戶指定捲號），在此自行挑選即可。'
            : '本筆湊不出整疋，系統已依決策5 自動以整捲＋裁切配貨。要換成別的捲、或改用零碼布湊，在此重新挑選即可。'}
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
                  const isCurrent = currentRollCodes.includes(roll.rollCode)
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
                        {isCurrent && (
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
          {standardSize > 0 && (
            <span className="text-muted-foreground">
              　＝ {formatNumber(check.totalLength / standardSize, 2)} 疋
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

        {/*
          接疋與裁切要不要接受，決定權在客戶而不是生管，而客戶那端的同意
          （電話、mail、口頭）系統拿不到證明。有提醒時就要求把依據寫下來。
        */}
        <label className="block">
          <span className="mb-1 block text-sm font-medium text-ink-body">
            依據{noteRequired && <span className="text-destructive">（必填）</span>}
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder={
              noteRequired
                ? '例：9/20 與客戶採購王小姐電話確認，同意 3 捲接疋、尾段裁切'
                : '選填，例：同批染缸'
            }
            className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
          />
          {noteRequired && (
            <span className="mt-1 block text-xs text-muted-foreground">
              這個組合會接疋或裁剩零碼布，要不要接受是<b>客戶</b>的決定。系統拿不到客戶那端的同意證明，
              請寫下依據（何時、與誰確認），隨單留存。
            </span>
          )}
        </label>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            className="bg-brand hover:bg-brand-dark"
            disabled={check.errors.length > 0 || noteMissing || pending}
            title={noteMissing ? '請先填寫依據' : undefined}
            onClick={() => onConfirm(selected, note)}
          >
            <Scissors className="mr-1 h-4 w-4" />
            採用這個組合
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

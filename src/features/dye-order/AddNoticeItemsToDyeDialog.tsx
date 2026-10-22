import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { getCustomer } from '@/mocks/data'
import { formatNumber } from '@/lib/units'
import { draftApprovalState } from '@/lib/workflow'
import type { DyeOrder, PackingNotice } from '@/types'

/**
 * 表4 草稿「從其他表1 加入明細」（決策163）：同一產品＋同一染整廠的布一起投染。
 *
 * 只列出與本單同一產品的表1 明細（不同產品不合併）。還在別張「未送簽」表4 草稿上的列可以勾
 * （會從那張移過來），已送簽或已生效的表4 上的列不能動，只顯示在哪一張。
 */
export function AddNoticeItemsToDyeDialog({
  open,
  onOpenChange,
  order,
  packingNotices,
  dyeOrders,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: DyeOrder
  packingNotices: PackingNotice[]
  dyeOrders: DyeOrder[]
  pending: boolean
  onConfirm: (itemIds: string[]) => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const sameProduct = (item: PackingNotice['items'][number]) =>
    order.productId && item.productId ? order.productId === item.productId : order.productName === item.roricaProductName
  const candidates = packingNotices
    .filter((n) => n.status === '生效')
    .map((n) => ({ notice: n, items: n.items.filter(sameProduct) }))
    .filter((c) => c.items.length > 0)
  const holderOf = (itemId: string) => dyeOrders.find((d) => d.items.some((i) => i.sourceItemId === itemId))
  const toggle = (itemId: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setPicked(new Set())
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>從其他表1 加入明細（合併投染）</DialogTitle>
          <DialogDescription>
            只列出與本單同一產品（{order.productName}）的明細，染整廠一律照本單。還在其他未送簽染整單草稿上的明細會從那張移過來
            （移空的草稿刪除）；已送簽或已生效的染整單上的明細不能移動。
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">沒有同一產品的已生效包裝通知單。</p>
        ) : (
          <div className="space-y-4">
            {candidates.map(({ notice, items }) => (
              <div key={notice.id} className="rounded-lg border border-border">
                <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium text-ink">
                  {notice.id}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{getCustomer(notice.customerId)?.shortName}</span>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[32rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>顏色</TableHead>
                        <TableHead className="text-right">數量 (Y)</TableHead>
                        <TableHead>目前所在</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((item) => {
                        const holder = holderOf(item.id)
                        const inThis = holder?.id === order.id
                        const openDraft = holder && holder.status === '草稿' && draftApprovalState(holder) === '未送簽'
                        const movable = !holder || (!inThis && Boolean(openDraft))
                        return (
                          <TableRow key={item.id} className={movable ? undefined : 'opacity-60'}>
                            <TableCell>
                              <input
                                type="checkbox"
                                className="h-4 w-4"
                                disabled={!movable}
                                checked={picked.has(item.id)}
                                onChange={() => toggle(item.id)}
                              />
                            </TableCell>
                            <TableCell>{item.color}</TableCell>
                            <TableCell className="text-right">{formatNumber(item.yard, 0)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {!holder
                                ? '尚未開染整單'
                                : inThis
                                  ? '已在本單'
                                  : movable
                                    ? `${holder.id}（草稿，將移入本單）`
                                    : `${holder.id}（${holder.status}，不可移動）`}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button className="bg-brand hover:bg-brand-dark" disabled={pending || picked.size === 0} onClick={() => onConfirm([...picked])}>
            加入 {picked.size > 0 ? `${picked.size} 筆` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

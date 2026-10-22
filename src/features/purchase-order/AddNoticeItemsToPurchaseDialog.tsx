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
import { draftApprovalState, purchaseOrdersBySourceItem } from '@/lib/workflow'
import type { PackingNotice, PurchaseOrder } from '@/types'

/**
 * 表2 草稿「從其他表1 加入明細」（決策163）：同一家廠商的貨合成一張訂購單。
 *
 * 表2 的明細與表1 一列對一列，所以是整列勾選。還在別張「未送簽」表2 草稿上的列可以勾（會從那張移過來），
 * 已送簽或已送出的表2 上的列不能動，只顯示在哪一張。
 */
export function AddNoticeItemsToPurchaseDialog({
  open,
  onOpenChange,
  order,
  packingNotices,
  purchaseOrders,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: PurchaseOrder
  packingNotices: PackingNotice[]
  purchaseOrders: PurchaseOrder[]
  pending: boolean
  onConfirm: (itemIds: string[]) => void
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const candidates = packingNotices.filter((n) => n.status === '生效')
  const openDraft = (orderId: string) => {
    const o = purchaseOrders.find((p) => p.id === orderId)
    return Boolean(o && o.status === '草稿' && draftApprovalState(o) === '未送簽')
  }
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
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>從其他表1 加入明細（合併訂購）</DialogTitle>
          <DialogDescription>
            加入的明細一律照本單的廠商、類型與染整廠下單。還在其他未送簽訂購單草稿上的明細會從那張移過來（移空的草稿刪除）；
            已送簽或已送出的訂購單上的明細不能移動。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {candidates.map((notice) => {
            const usedBy = purchaseOrdersBySourceItem(notice, purchaseOrders)
            return (
              <div key={notice.id} className="rounded-lg border border-border">
                <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium text-ink">
                  {notice.id}
                  <span className="ml-2 text-xs font-normal text-muted-foreground">{getCustomer(notice.customerId)?.shortName}</span>
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[36rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>皇加品名</TableHead>
                        <TableHead>顏色</TableHead>
                        <TableHead className="text-right">數量 (Y)</TableHead>
                        <TableHead>目前所在</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notice.items.map((item) => {
                        const holder = usedBy.get(item.id)
                        const inThis = holder?.orderId === order.id
                        const movable = !holder || (!inThis && openDraft(holder.orderId))
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
                            <TableCell>{item.roricaProductName}</TableCell>
                            <TableCell>{item.color}</TableCell>
                            <TableCell className="text-right">{formatNumber(item.yard, 0)}</TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {!holder
                                ? '尚未開訂購單'
                                : inThis
                                  ? '已在本單'
                                  : movable
                                    ? `${holder.orderId}（草稿，將移入本單）`
                                    : `${holder.orderId}（${holder.status}，不可移動）`}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )
          })}
        </div>

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

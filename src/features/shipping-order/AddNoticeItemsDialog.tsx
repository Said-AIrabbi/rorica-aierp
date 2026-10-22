import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatNumber } from '@/lib/units'
import {
  normalizeAddress,
  noticeItemRemainingYard,
  noticeItemScheduleCap,
  shippingItemNoticeId,
} from '@/lib/workflow'
import type { PackingNotice, ShippingOrder } from '@/types'

export interface AddNoticeItemLine {
  noticeId: string
  itemId: string
  qty: number
}

/**
 * 表8 草稿「從其他表1 加入明細」（決策163）。
 *
 * 只列得出可以合併的表1：已生效、同客戶、同幣別、與本單收貨地址相同。
 * 數量預設帶剩餘未排量；填得比它多時，差額從其他出貨單草稿移過來（原草稿會扣掉），
 * 再多就只能到容許誤差上限，送出時由資料層擋下。
 */
export function AddNoticeItemsDialog({
  open,
  onOpenChange,
  order,
  packingNotices,
  shippingOrders,
  pending,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  order: ShippingOrder
  packingNotices: PackingNotice[]
  shippingOrders: ShippingOrder[]
  pending: boolean
  onConfirm: (lines: AddNoticeItemLine[]) => void
}) {
  const [qtyDraft, setQtyDraft] = useState<Record<string, string>>({})

  const candidates = useMemo(
    () =>
      packingNotices.filter(
        (n) =>
          n.status === '生效' &&
          n.customerId === order.customerId &&
          (n.currency ?? 'NTD') === (order.currency ?? 'NTD') &&
          normalizeAddress(n.shippingAddress) === normalizeAddress(order.shippingAddress),
      ),
    [packingNotices, order],
  )

  /** 這一列在其他草稿上排了多少（可移過來的量） */
  const inOtherDrafts = (noticeId: string, itemId: string) =>
    shippingOrders
      .filter((o) => o.id !== order.id && o.status === '草稿' && !o.sourceAbnormalId)
      .flatMap((o) => o.items.filter((line) => shippingItemNoticeId(o, line) === noticeId && line.sourceItemId === itemId))
      .reduce((sum, line) => sum + line.yard, 0)

  const keyOf = (noticeId: string, itemId: string) => `${noticeId}|${itemId}`
  const lines: AddNoticeItemLine[] = Object.entries(qtyDraft)
    .map(([key, v]) => {
      const [noticeId, itemId] = key.split('|')
      return { noticeId, itemId, qty: Number(v) }
    })
    .filter((l) => l.qty > 0)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setQtyDraft({})
        onOpenChange(next)
      }}
    >
      <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>從其他表1 加入明細（合併出貨）</DialogTitle>
          <DialogDescription>
            只列出已生效、同客戶、同幣別、收貨地址與本單相同的包裝通知單。數量預設為剩餘未排量；
            填得更多時，差額會從其他出貨單草稿移過來（原草稿扣掉、移空則刪除）。
          </DialogDescription>
        </DialogHeader>

        {candidates.length === 0 ? (
          <p className="text-sm text-muted-foreground">沒有可以合併的包裝通知單。</p>
        ) : (
          <div className="space-y-4">
            {candidates.map((notice) => (
              <div key={notice.id} className="rounded-lg border border-border">
                <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-medium text-ink">
                  {notice.id}
                  {notice.id === order.parentId && <span className="ml-2 text-xs text-muted-foreground">（本單主表1）</span>}
                </div>
                <div className="overflow-x-auto">
                  <Table className="min-w-[40rem]">
                    <TableHeader>
                      <TableRow>
                        <TableHead>皇加品名</TableHead>
                        <TableHead>顏色</TableHead>
                        <TableHead className="text-right">下單 (Y)</TableHead>
                        <TableHead className="text-right">未排 (Y)</TableHead>
                        <TableHead className="text-right">其他草稿 (Y)</TableHead>
                        <TableHead className="text-right">本次加入 (Y)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {notice.items.map((item) => {
                        const key = keyOf(notice.id, item.id)
                        const remaining = noticeItemRemainingYard(notice.id, item, shippingOrders)
                        const movable = inOtherDrafts(notice.id, item.id)
                        const cap = noticeItemScheduleCap(item, notice.tolerance)
                        return (
                          <TableRow key={item.id}>
                            <TableCell>{item.roricaProductName}</TableCell>
                            <TableCell>{item.color}</TableCell>
                            <TableCell className="text-right">{formatNumber(item.yard, 0)}</TableCell>
                            <TableCell className="text-right">{formatNumber(remaining, 0)}</TableCell>
                            <TableCell className="text-right">{movable > 0 ? formatNumber(movable, 0) : '-'}</TableCell>
                            <TableCell className="text-right">
                              <Input
                                type="number"
                                min="0"
                                step="1"
                                className="ml-auto w-24 text-right"
                                placeholder={remaining > 0 ? String(remaining) : '0'}
                                title={`含容許誤差最多可排 ${formatNumber(cap, 0)}Y`}
                                value={qtyDraft[key] ?? ''}
                                onChange={(e) => setQtyDraft((prev) => ({ ...prev, [key]: e.target.value }))}
                                onFocus={() => {
                                  // 第一次點進來就帶剩餘未排量，不必自己算
                                  if (qtyDraft[key] === undefined && remaining > 0) {
                                    setQtyDraft((prev) => ({ ...prev, [key]: String(remaining) }))
                                  }
                                }}
                              />
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
          <Button
            className="bg-brand hover:bg-brand-dark"
            disabled={pending || lines.length === 0}
            onClick={() => onConfirm(lines)}
          >
            加入 {lines.length > 0 ? `${lines.length} 筆` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

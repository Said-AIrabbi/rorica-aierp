import { useEffect, useState } from 'react'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * 退回對話框：PI、表1、表9 共用。
 *
 * 退回原因必填（權限規格決策37）——沒有原因，收到退回的人無從修正，只能回頭問一次。
 * 用對話框而不是瀏覽器的輸入框，是因為退回原因要寫得完整：原因會原文存進異動紀錄、
 * 出現在對方的單據上，單行輸入框寫不下也看不到自己寫了什麼。
 *
 * 關閉時清空內容——上一次沒送出的草稿留著，下次開啟會誤送成這一次的原因。
 */
export function RejectDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '確定退回',
  pending = false,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** 退回之後會發生什麼——單據回到誰手上、什麼東西不會跟著還原 */
  description: string
  confirmLabel?: string
  pending?: boolean
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (!open) setReason('')
  }, [open])

  const trimmed = reason.trim()

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-4 w-4 text-reject" />
            {title}
          </DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <label htmlFor="reject-reason" className="text-sm font-medium text-ink">
            退回原因<span className="ml-1 text-reject">必填</span>
          </label>
          <Textarea
            id="reject-reason"
            rows={4}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="請寫清楚要修正什麼，例如：客戶訂單號與 PO 不符、單價漏更新為最新報價。"
          />
          <p className="text-xs text-muted-foreground">原因會原文記入退回紀錄並顯示在單據上，不覆蓋前次退回。</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button
            className="bg-reject text-reject-foreground hover:bg-reject/90"
            disabled={pending || trimmed.length === 0}
            onClick={() => onConfirm(trimmed)}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

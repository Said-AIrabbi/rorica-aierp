import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * 主檔刪除按鈕（含二次確認）。
 *
 * 主檔刪除與單據作廢不同：單據有狀態機可回復，主檔一旦刪掉，
 * 引用它的歷史單據就會指向不存在的資料。故一律先確認，
 * 且實際能不能刪由 mutation 層檢查引用（見 mutations 的 assertNotReferenced），
 * 畫面不預先隱藏按鈕——擋下時要讓使用者看到「被哪張單據用著」的原因。
 */
export function DeleteMasterButton({
  label,
  name,
  pending,
  onConfirm,
}: {
  /** 主檔名稱，如「客戶」「廠商」 */
  label: string
  /** 這一筆的顯示名稱，出現在確認訊息中 */
  name: string
  pending?: boolean
  onConfirm: () => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button
        variant="outline"
        className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setOpen(true)}
        disabled={pending}
      >
        <Trash2 className="mr-1 h-4 w-4" />
        刪除{label}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>刪除{label}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-ink-body">
            確定要刪除「{name}」嗎？此動作無法復原。
            <br />
            <span className="text-muted-foreground">
              若已有單據引用這筆{label}資料，系統會擋下刪除並顯示引用的單號——歷史單據上的{label}是既成事實，不應被抹除。
            </span>
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={pending}
              onClick={() => {
                setOpen(false)
                onConfirm()
              }}
            >
              確定刪除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

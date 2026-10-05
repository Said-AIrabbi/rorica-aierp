import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RejectDialog } from '@/components/shared/RejectDialog'
import { accounts } from '@/mocks/data'
import { formatDate } from '@/lib/dates'
import type { DocumentWithdrawal } from '@/types'

/**
 * 撤回草稿（主文件決策132）：表2、表3、表4、表5、表6 共用的按鈕與對話框。
 *
 * 與「退回」分成兩個動作，但**共用同一個對話框**——原因必填、多行輸入、送出前看得見自己寫了什麼
 * （決策二：比照現有退回）。顏色也沿用 #b55650：使用者認的是「這顆會把單子往回推」，
 * 不需要為退回與撤回各記一種顏色。
 *
 * label 可覆寫：表6 依皇加指定寫「退回複核」，動作本身仍是撤回草稿。
 */
export function WithdrawDraftButton({
  label = '撤回草稿',
  description,
  pending = false,
  onConfirm,
}: {
  label?: string
  /** 撤回之後會發生什麼——單據回到哪個狀態、什麼東西不會跟著還原 */
  description: string
  pending?: boolean
  onConfirm: (reason: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <Button size="sm" className="bg-reject text-reject-foreground hover:bg-reject/90" onClick={() => setOpen(true)}>
        <Undo2 className="mr-1 h-3.5 w-3.5" /> {label}
      </Button>
      <RejectDialog
        open={open}
        onOpenChange={setOpen}
        title={label}
        description={description}
        confirmLabel={`確定${label}`}
        pending={pending}
        onConfirm={(reason) => {
          setOpen(false)
          onConfirm(reason)
        }}
      />
    </>
  )
}

/**
 * 撤回紀錄。與退回紀錄分開顯示——這張單是「被別人打回來過」還是「自己送出去又收回來」，
 * 是看紀錄的人第一個想知道的事，混在一個清單裡就分不出來了。
 */
export function WithdrawalNotes({
  entries,
  label = '撤回紀錄',
}: {
  entries: DocumentWithdrawal[] | undefined
  label?: string
}) {
  if (!entries?.length) return null
  return (
    <div className="mb-4 rounded-lg border border-border bg-surface p-3 text-sm">
      <p className="font-medium text-ink">
        {label}（{entries.length} 次）
      </p>
      <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
        {entries.map((entry, i) => (
          <li key={i}>
            {formatDate(entry.at)}　{accounts.find((a) => a.id === entry.byAccountId)?.name ?? entry.byAccountId}：
            {entry.reason}
          </li>
        ))}
      </ul>
    </div>
  )
}

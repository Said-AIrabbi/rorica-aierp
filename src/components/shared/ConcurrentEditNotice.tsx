import { Lock } from 'lucide-react'
import dayjs from 'dayjs'

/**
 * 展示用並發編輯鎖定提示：純靜態說明，不具備真正的鎖定能力（原型無真實後端/多使用者狀態）。
 * 真實鎖定 API 需求詳見 docs/backend-infra-requirements.md。
 */
export function ConcurrentEditNotice() {
  return (
    <div className="mb-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
      <Lock className="mt-0.5 h-4 w-4 shrink-0" />
      <span>
        （展示用）此單據編輯鎖定於 {dayjs().format('HH:mm')} 建立，15 分鐘無操作將自動釋放；儲存或離開頁面時立即釋放。
        原型無真實多使用者狀態，此提示僅示範鎖定 UX，不會實際阻擋其他分頁編輯。
      </span>
    </div>
  )
}

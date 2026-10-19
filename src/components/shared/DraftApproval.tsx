import { useState } from 'react'
import { CheckCircle2, Undo2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RejectDialog } from '@/components/shared/RejectDialog'
import { accounts } from '@/mocks/data'
import { formatDate } from '@/lib/dates'
import type { DocumentRejection, DraftApprovalState } from '@/types'

/**
 * 表2／表4 的簽核關卡（主文件決策153）：生管送簽 → 管理層「簽核並送出」或退回。
 * 版面與表1 詳情頁相同——兩張單沿用同一套簽核規則，畫面也就長一樣，使用者不必重學。
 */

/**
 * 頁首的「簽核並送出」與「退回」兩顆按鈕。
 * 沒有權限的整顆不出現（權限規格決策52）；有權限但被職責分離擋下時反灰並附原因。
 */
export function ApprovalReviewButtons({
  docId,
  canApprove,
  canReject,
  blocked,
  approveLabel,
  rejectDescription,
  pending,
  onApprove,
  onReject,
}: {
  docId: string
  canApprove: boolean
  canReject: boolean
  /** 職責分離擋下的原因；有值即反灰 */
  blocked?: string
  approveLabel: string
  rejectDescription: string
  pending: boolean
  onApprove: () => void
  onReject: (reason: string) => void
}) {
  const [rejectOpen, setRejectOpen] = useState(false)
  return (
    <>
      {canApprove && (
        <Button
          size="sm"
          className="bg-brand hover:bg-brand-dark"
          disabled={pending || Boolean(blocked)}
          title={blocked}
          onClick={onApprove}
        >
          <CheckCircle2 className="mr-1 h-4 w-4" /> {approveLabel}
        </Button>
      )}
      {canReject && (
        <Button
          size="sm"
          className="bg-reject text-reject-foreground hover:bg-reject/90"
          disabled={pending}
          onClick={() => setRejectOpen(true)}
        >
          <Undo2 className="mr-1 h-4 w-4" /> 退回
        </Button>
      )}
      <RejectDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title={`退回 ${docId}`}
        description={rejectDescription}
        pending={pending}
        onConfirm={(reason) => {
          setRejectOpen(false)
          onReject(reason)
        }}
      />
    </>
  )
}

/** 草稿上的簽核狀態說明與歷次退回紀錄 */
export function ApprovalStatusNotes({
  isDraft,
  state,
  afterApproval,
  rejections,
}: {
  isDraft: boolean
  state: DraftApprovalState
  /** 簽核並送出之後會發生什麼，如「轉待簽回，送到廠商手上」 */
  afterApproval: string
  rejections?: DocumentRejection[]
}) {
  return (
    <>
      {isDraft && (
        <div className="mb-4 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
          <span className="font-medium text-ink-body">簽核狀態：{state}</span>
          {state === '未送簽' && '——生管編輯完成後按「送簽」，進入管理層的待簽清單。'}
          {state === '待簽核' && `——草稿已轉唯讀，等待管理層簽核並送出（${afterApproval}）；要修改請先請管理層退回。`}
        </div>
      )}
      {/* 歷次退回（權限規格決策37）：不覆蓋前次，反覆退回本身即為異常訊號 */}
      {rejections && rejections.length > 0 && (
        <div className="mb-4 rounded-lg border border-border bg-surface p-3 text-sm">
          <p className="font-medium text-ink">退回紀錄（{rejections.length} 次）</p>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {rejections.map((r, i) => (
              <li key={i}>
                {formatDate(r.at)}　{accounts.find((a) => a.id === r.byAccountId)?.name ?? r.byAccountId}：{r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  )
}

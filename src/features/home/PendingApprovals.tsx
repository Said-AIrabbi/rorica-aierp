import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ClipboardCheck } from 'lucide-react'
import { api } from '@/mocks/api'
import { getCustomer } from '@/mocks/data'
import { useCurrentAccount } from '@/lib/current-account-context'
import { isPiOnManualHold } from '@/lib/pi'
import { packingNoticeApprovalState } from '@/lib/workflow'
import { formatDate } from '@/lib/dates'
import type { DocKey } from '@/lib/permissions'

/** 待簽清單的一列：單號、要簽的是什麼、以及（若不能簽）為什麼 */
interface PendingItem {
  doc: DocKey
  id: string
  to: string
  summary: string
  since?: string
  /** 有值即為「這張單輪到你，但你不能簽」——多半是職責分離（建單者不得自行簽核） */
  blocked?: string
}

const DOC_STYLE: Record<string, { label: string; action: string }> = {
  PI: { label: 'PI 單', action: '待批准' },
  表1: { label: '表1 包裝通知單', action: '待簽核' },
  表9: { label: '表9 異常通知單', action: '待批准' },
}

/**
 * 待我簽核／批准。
 *
 * 管理層的系統動作只有三個（PI 批准、表1 簽核與退回、表9 批准與退回），而這三個按鈕
 * 各自躺在各張單的詳情頁裡——沒有這張清單，核決者登入後無從得知「現在有幾張單等我」，
 * 得逐張列表翻找狀態。核決是被動工作，入口必須主動把單送到眼前。
 *
 * 沒有待辦（或該帳號本來就沒有核決權）時整塊不渲染，其餘角色的首頁維持原樣。
 * 職責分離擋下的單仍然列出並附上原因：把它藏起來，這張單會無聲地卡在待簽狀態。
 */
export function PendingApprovals() {
  const permissions = useCurrentAccount()
  const { data: pis = [] } = useQuery({ queryKey: ['proformaInvoices'], queryFn: api.proformaInvoices })
  const { data: notices = [] } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })
  const { data: abnormals = [] } = useQuery({ queryKey: ['abnormalNotices'], queryFn: api.abnormalNotices })

  const items: PendingItem[] = []

  // PI：送出批准後停在「待批准」；「已逾期」是同一關卡，批准時一併重新起算效期
  if (permissions.can('PI', '批准')) {
    for (const pi of pis) {
      if (pi.status !== '待批准' && pi.status !== '已逾期') continue
      // 人工凍結中的 PI 要先裁決「繼續／作廢」，此時批准鍵本來就不出現
      if (isPiOnManualHold(pi)) continue
      items.push({
        doc: 'PI',
        id: pi.id,
        to: `/proforma-invoice/${pi.id}`,
        summary: `${pi.customerName}${pi.status === '已逾期' ? '（報價已逾期，批准即重新起算 14 天）' : ''}`,
        since: pi.createdAt,
      })
    }
  }

  // 表1：業務送簽後草稿轉唯讀，等簽核（決策118）
  if (permissions.can('表1', '簽核')) {
    for (const notice of notices) {
      if (notice.status !== '草稿' || packingNoticeApprovalState(notice) !== '待簽核') continue
      items.push({
        doc: '表1',
        id: notice.id,
        to: `/packing-notice/${notice.id}`,
        summary: getCustomer(notice.customerId)?.fullNameCN ?? notice.customerId,
        since: notice.submittedAt,
        blocked: permissions.blockedReason('表1', '簽核', notice.createdByAccountId),
      })
    }
  }

  // 表9：業務受理客訴後停在「受理中」，批准前不進入處理分流
  if (permissions.can('表9', '批准')) {
    for (const notice of abnormals) {
      if (notice.status !== '受理中' || notice.approvedAt) continue
      items.push({
        doc: '表9',
        id: notice.id,
        to: `/abnormal-notice/${notice.id}`,
        summary: notice.kind,
        since: notice.noticeDate,
        blocked: permissions.blockedReason('表9', '批准', notice.createdByAccountId),
      })
    }
  }

  if (items.length === 0) return null

  return (
    <div className="mb-6 rounded-xl border border-brand/30 bg-brand/5 p-4">
      <div className="mb-3 flex items-center gap-2">
        <ClipboardCheck className="h-4 w-4 text-brand-dark" />
        <h2 className="text-sm font-semibold text-ink">待我簽核／批准（{items.length}）</h2>
        <span className="text-xs text-muted-foreground">點入單據後，簽核按鈕在頁面右上角</span>
      </div>
      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={`${item.doc}-${item.id}`}>
            <Link
              to={item.to}
              className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm transition-shadow hover:shadow-sm"
            >
              <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand-dark">
                {DOC_STYLE[item.doc].label}
              </span>
              <span className="font-medium text-ink">{item.id}</span>
              <span className="text-muted-foreground">{item.summary}</span>
              <span className="ml-auto flex items-center gap-2 text-xs">
                {item.since && <span className="text-muted-foreground">{formatDate(item.since)} 起</span>}
                {item.blocked ? (
                  <span className="text-warning">{item.blocked}</span>
                ) : (
                  <span className="font-medium text-brand-dark">{DOC_STYLE[item.doc].action}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

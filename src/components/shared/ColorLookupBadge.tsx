import { StatusBadge } from '@/components/shared/StatusBadge'
import type { ColorLookupResult } from '@/lib/colors'

/**
 * 色號查詢結果標籤：把「這筆明細之後會不會需要開表3 打色通知單」提前講清楚。
 *
 * 明細表格內只放標籤（showMessage=false）——四種標籤的意思由區塊下方的圖例一次說明，
 * 每列再重複一段長句會把欄寬撐開、擠壓其他欄位；該列的實際理由（做過的染整廠、色號、
 * 未使用月數）改掛在標籤的 title，滑鼠移上去即可看到。
 */
export function ColorLookupBadge({
  result,
  showMessage = true,
}: {
  result: ColorLookupResult | null
  showMessage?: boolean
}) {
  if (!result) return null
  if (!showMessage) {
    return (
      <span title={result.message} className="cursor-help">
        <StatusBadge status={result.kind} />
      </span>
    )
  }
  return (
    <div className="space-y-0.5">
      <StatusBadge status={result.kind} />
      <span className="text-xs text-muted-foreground">{result.message}</span>
    </div>
  )
}

/** 圖例：四種結果各代表什麼，放在明細區塊下方一次說明，不必每列重複 */
export function ColorLookupLegend({ withVendor }: { withVendor?: boolean }) {
  return (
    <div className="mt-3 space-y-1 rounded-lg border border-border bg-muted p-3 text-xs text-ink-body">
      <div className="font-medium">色號查詢結果說明（查詢鍵：客戶＋皇加品名＋顏色＋染整廠）</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status="已有色號" />
        <span>查得到且近期使用過，開染單時自動帶入色樣編號，不需要表3。</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status="疑似複色" />
        <span>查得到但逾 12 個月未使用；系統沿用舊色號、不自動開表3，由生管決定是否重新複色。</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <StatusBadge status="全新配色" />
        <span>查無色號，開染單時系統會自動開立表3 委託染整廠打色（與染單平行進行，不卡開單）。</span>
      </div>
      {!withVendor && (
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusBadge status="視染整廠而定" />
          <span>
            有染整廠做過此配色，但本單尚未指定染整廠。色號非通用碼——換一家染整廠即視為無色號，
            最終要不要打色，等表2 訂購單選定染整廠才確定。
          </span>
        </div>
      )}
    </div>
  )
}

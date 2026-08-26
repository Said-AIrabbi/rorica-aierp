import { History } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatDateTime } from '@/lib/dates'

export interface AuditTrailEvent {
  at: string
  label: string
}

/**
 * 展示用異動紀錄：依單據現有時間戳欄位組合呈現，非逐欄位 diff 的真實稽核紀錄。
 * 真實稽核軌跡需求詳見 docs/backend-infra-requirements.md。
 */
export function AuditTrailCard({ events }: { events: AuditTrailEvent[] }) {
  const sorted = [...events].sort((a, b) => (a.at < b.at ? 1 : -1))

  return (
    <Card className="mt-4 print:hidden">
      <CardHeader>
        <CardTitle className="text-base">異動紀錄（展示用，依既有時間戳組合呈現）</CardTitle>
      </CardHeader>
      <CardContent>
        {sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground">尚無紀錄</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {sorted.map((e, i) => (
              <li key={i} className="flex items-center gap-2 text-ink-body">
                <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="text-muted-foreground">{formatDateTime(e.at)}</span>
                <span>{e.label}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

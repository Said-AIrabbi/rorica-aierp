import type { ReactNode } from 'react'

export function PageHeader({
  title,
  description,
  formCode,
  actions,
}: {
  title: string
  description?: ReactNode
  formCode?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          {formCode && (
            <span className="rounded bg-brand/10 px-2 py-0.5 text-xs font-semibold text-brand-dark">
              {formCode}
            </span>
          )}
          <h1 className="text-xl font-semibold text-ink">{title}</h1>
        </div>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

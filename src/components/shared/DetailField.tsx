import type { ReactNode } from 'react'

export function DetailField({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm text-ink">{value ?? '-'}</div>
    </div>
  )
}

export function DetailGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-4">{children}</div>
}

import { cn } from '@/lib/utils'
import { statusVariant, statusVariantClass } from '@/lib/status'

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string
  /** 顯示文字若與狀態值不同（例如附加統計數字），可另外指定 */
  label?: string
  className?: string
}) {
  const variant = statusVariant(status)
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium',
        statusVariantClass[variant],
        className,
      )}
    >
      {label ?? status}
    </span>
  )
}

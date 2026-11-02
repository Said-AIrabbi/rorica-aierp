import { useState } from 'react'
import { Check, Moon, Palette, Sun } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { applyTheme, loadThemeId, themeById, THEMES, type ThemeMode } from '@/lib/theme'

/** 頁首的「顏色主題」選單（決策173）：淺色、深色各三套，選了立即套用並記在這台電腦 */
export function ThemeMenu() {
  const [current, setCurrent] = useState(loadThemeId)
  const choose = (id: string) => {
    applyTheme(id)
    setCurrent(id)
  }
  const group = (mode: ThemeMode, label: string, Icon: typeof Sun) => (
    <>
      <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </DropdownMenuLabel>
      {THEMES.filter((t) => t.mode === mode).map((t) => (
        <DropdownMenuItem key={t.id} onSelect={() => choose(t.id)} className="gap-2">
          {/* 色票：背景／卡片／品牌色三格 */}
          <span className="flex overflow-hidden rounded border border-border">
            {t.swatch.map((c, i) => (
              <span key={i} className="h-4 w-3" style={{ background: c }} />
            ))}
          </span>
          <span className="flex-1">{t.name}</span>
          {current === t.id && <Check className="h-4 w-4 text-brand-dark" />}
        </DropdownMenuItem>
      ))}
    </>
  )
  const mode = themeById(current).mode
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-ink"
          title="顏色主題"
          aria-label="顏色主題"
        >
          {mode === 'dark' ? <Moon className="h-5 w-5" /> : <Palette className="h-5 w-5" />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {group('light', '淺色模式', Sun)}
        <DropdownMenuSeparator />
        {group('dark', '深色模式', Moon)}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

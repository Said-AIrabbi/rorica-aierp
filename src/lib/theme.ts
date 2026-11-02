/**
 * 顏色主題（決策173）：淺色、深色兩種模式，各三套配色。
 *
 * 配色本身全在 index.css（以 html 的 data-theme 切換一組 CSS 變數）；這裡只管「選了哪一套」。
 * 選擇記在本機瀏覽器（localStorage），每個人、每台電腦各自記；讀寫失敗（隱私模式等）就用預設。
 * 列印與標籤紙不受主題影響：列印版面寫死黑字白底。
 */
export type ThemeMode = 'light' | 'dark'

export interface ThemeOption {
  id: string
  mode: ThemeMode
  name: string
  /** 選單上的色票：背景、卡片、品牌色 */
  swatch: [string, string, string]
}

export const THEMES: ThemeOption[] = [
  { id: 'light-green', mode: 'light', name: '皇加綠', swatch: ['#faf9f5', '#ffffff', '#7dc067'] },
  { id: 'light-ocean', mode: 'light', name: '海灣藍', swatch: ['#f5f8fb', '#ffffff', '#3f88c5'] },
  { id: 'light-clay', mode: 'light', name: '暖陶杏', swatch: ['#fbf7f3', '#ffffff', '#c47a52'] },
  { id: 'dark-forest', mode: 'dark', name: '夜林綠', swatch: ['#121612', '#1b201b', '#4a8a37'] },
  { id: 'dark-navy', mode: 'dark', name: '深海藍', swatch: ['#0f151c', '#17202a', '#2f74b5'] },
  { id: 'dark-graphite', mode: 'dark', name: '石墨金', swatch: ['#151515', '#1f1f1f', '#8c7536'] },
]

export const DEFAULT_THEME = 'light-green'
const STORAGE_KEY = 'rorica-erp-theme'

export function themeById(id: string | null | undefined): ThemeOption {
  return THEMES.find((t) => t.id === id) ?? THEMES[0]
}

export function loadThemeId(): string {
  try {
    return themeById(window.localStorage.getItem(STORAGE_KEY)).id
  } catch {
    return DEFAULT_THEME
  }
}

/** 套到 html：data-theme 換整組變數、dark class 給 Tailwind 的 dark: 用、color-scheme 讓原生控制項跟著變 */
export function applyTheme(id: string): void {
  const theme = themeById(id)
  const root = document.documentElement
  root.dataset.theme = theme.id
  root.classList.toggle('dark', theme.mode === 'dark')
  root.style.colorScheme = theme.mode
  try {
    window.localStorage.setItem(STORAGE_KEY, theme.id)
  } catch {
    // 無法寫入時只是下次不記得，不影響這次使用
  }
}

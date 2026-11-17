/**
 * ERP 被嵌在選布平台後台（Agents協作中心）時的外觀：
 * 不顯示 ERP 的側欄與頁首，配色改用選布平台送來的主題，並把內容高度回報給上層，
 * 讓上層的框架跟著撐開——看起來就是選布平台自己的一頁。
 *
 * 只收、只送選布平台 origin 的訊息；主題只接受下列幾個變數，值也要像顏色或長度。
 */
import { FABRIC_PORTAL_URL } from './sso'

const FABRIC_ORIGIN = new URL(FABRIC_PORTAL_URL).origin

/** 是否被別的頁面框住（嵌在選布平台裡） */
export function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/** 上層可以覆寫的主題變數（對應 index.css 的 :root 變數） */
const THEME_VARS = [
  '--background',
  '--card',
  '--muted',
  '--foreground',
  '--muted-foreground',
  '--border',
  '--primary',
  '--primary-foreground',
  '--radius',
  '--font-sans',
] as const

const SAFE_VALUE = /^[#(),.%\w\s"'-]{1,200}$/

function applyEmbedTheme(tokens: Record<string, unknown>): void {
  const root = document.documentElement
  // 選布平台只有淺色；不呼叫 applyTheme，免得把這次的配色記成使用者在 ERP 的偏好
  root.classList.remove('dark')
  root.style.colorScheme = 'light'
  for (const name of THEME_VARS) {
    const v = tokens[name]
    if (typeof v === 'string' && SAFE_VALUE.test(v)) root.style.setProperty(name, v)
  }
}

/** 開始接收上層的主題、回報高度；回傳取消函式 */
export function connectEmbed(content: HTMLElement): () => void {
  const onMessage = (e: MessageEvent) => {
    if (e.origin !== FABRIC_ORIGIN || e.source !== window.parent) return
    const data = e.data as { type?: unknown; tokens?: unknown } | null
    if (data?.type === 'erp-theme' && data.tokens && typeof data.tokens === 'object') {
      applyEmbedTheme(data.tokens as Record<string, unknown>)
    }
  }
  window.addEventListener('message', onMessage)
  window.parent.postMessage({ type: 'erp-embed-ready' }, FABRIC_ORIGIN)

  let last = 0
  const report = () => {
    const h = Math.ceil(content.getBoundingClientRect().height)
    if (h === last) return
    last = h
    window.parent.postMessage({ type: 'erp-height', height: h }, FABRIC_ORIGIN)
  }
  const ro = new ResizeObserver(report)
  ro.observe(content)
  report()

  return () => {
    window.removeEventListener('message', onMessage)
    ro.disconnect()
  }
}

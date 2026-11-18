import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar, MobileNav } from './Sidebar'
import { Header } from './Header'
import { connectEmbed, isEmbedded } from '@/lib/embed'

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false)
  const { pathname } = useLocation()

  // 換頁後關閉抽屜：手機上點完連結若抽屜還開著，會擋住剛載入的頁面
  useEffect(() => setNavOpen(false), [pathname])

  if (isEmbedded()) return <EmbeddedShell />

  return (
    <div className="flex h-dvh bg-surface-muted print:h-auto print:block">
      <Sidebar className="print:hidden" />
      <MobileNav open={navOpen} onClose={() => setNavOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <Header className="print:hidden" onMenuClick={() => setNavOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 print:overflow-visible print:p-0">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

/** 嵌在選布平台裡：只有頁面本身，沒有側欄、頁首與外距；主題與高度和上層對接（見 lib/embed.ts） */
function EmbeddedShell() {
  const content = useRef<HTMLDivElement>(null)
  useEffect(() => (content.current ? connectEmbed(content.current) : undefined), [])
  return (
    <div ref={content} className="bg-background">
      <Outlet />
    </div>
  )
}

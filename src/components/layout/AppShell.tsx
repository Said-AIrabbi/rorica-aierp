import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { Header } from './Header'

export function AppShell() {
  return (
    <div className="flex h-screen bg-surface-muted print:h-auto print:block">
      <Sidebar className="print:hidden" />
      <div className="flex min-w-0 flex-1 flex-col print:block">
        <Header className="print:hidden" />
        <main className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0">
          <div className="mx-auto max-w-7xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}

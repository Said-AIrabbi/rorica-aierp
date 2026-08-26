import { NavLink } from 'react-router-dom'
import {
  Boxes,
  Home,
  Layers,
  Package,
  PackageCheck,
  PackageSearch,
  Palette,
  Scissors,
  ScrollText,
  Send,
  ShoppingCart,
  Tags,
  Users,
  Warehouse,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const documentNav = [
  { to: '/packing-notice', label: '表1 包裝通知單', icon: ScrollText },
  { to: '/purchase-order', label: '表2 訂購單', icon: ShoppingCart },
  { to: '/dye-request', label: '表3 打色通知單', icon: Palette },
  { to: '/dye-order', label: '表4 染整單', icon: Layers },
  { to: '/secondary-processing', label: '表5 二次加工單', icon: Scissors },
  { to: '/goods-receipt', label: '表6 入庫單', icon: PackageCheck },
  { to: '/fabric-label', label: '表7 布卷條碼標籤', icon: Tags },
  { to: '/shipping-order', label: '表8 出貨單', icon: Send },
]

const masterNav = [
  { to: '/masters/customers', label: '客戶主檔', icon: Users },
  { to: '/masters/products', label: '產品主檔', icon: Package },
  { to: '/masters/vendors', label: '廠商主檔', icon: Boxes },
  { to: '/masters/accounts', label: '帳戶主檔', icon: PackageSearch },
]

function NavItem({ to, label, icon: Icon }: { to: string; label: string; icon: typeof Home }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
          isActive ? 'bg-brand text-white' : 'text-ink-body hover:bg-muted',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

export function Sidebar({ className = '' }: { className?: string }) {
  return (
    <aside className={cn('hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex', className)}>
      <div className="flex h-16 items-center gap-2 border-b border-border px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand text-sm font-bold text-white">
          皇
        </div>
        <div>
          <div className="text-sm font-semibold text-ink">皇加布業 ERP</div>
          <div className="text-xs text-muted-foreground">進銷存模組 Phase 1</div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <div>
          <NavItem to="/" label="首頁總覽" icon={Home} />
          <NavItem to="/inventory" label="現貨/無現貨總覽" icon={Warehouse} />
        </div>

        <div>
          <div className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            單據流程
          </div>
          <div className="space-y-0.5">
            {documentNav.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
        </div>

        <div>
          <div className="px-3 pb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            主檔資料
          </div>
          <div className="space-y-0.5">
            {masterNav.map((item) => (
              <NavItem key={item.to} {...item} />
            ))}
          </div>
        </div>
      </nav>

      {/* 版本戳記：客戶回饋意見時可對照是哪一版，避免「上次不是長這樣」對不上 */}
      <div className="border-t border-border px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <div>原型展示版本</div>
        <div className="font-mono">{new Date(__BUILD_TIME__).toLocaleString('zh-TW', { hour12: false })}</div>
      </div>
    </aside>
  )
}

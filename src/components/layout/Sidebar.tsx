import { NavLink } from 'react-router-dom'
import {
  AlertTriangle,
  Boxes,
  Tags,
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
  Users,
  Warehouse,
  X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const documentNav = [
  { to: '/packing-notice', label: '表1 包裝通知單', icon: ScrollText },
  { to: '/purchase-order', label: '表2 訂購單', icon: ShoppingCart },
  { to: '/dye-request', label: '表3 打色通知單', icon: Palette },
  { to: '/dye-order', label: '表4 染整單', icon: Layers },
  { to: '/secondary-processing', label: '表5 二次加工單', icon: Scissors },
  { to: '/goods-receipt', label: '表6 入庫單', icon: PackageCheck },
  { to: '/shipping-order', label: '表8 出貨單', icon: Send },
  { to: '/abnormal-notice', label: '表9 異常通知單', icon: AlertTriangle },
]

interface NavEntry {
  to: string
  label: string
  icon: typeof Home
  /** 下一階層：從屬於上一層主檔的資料，縮排呈現 */
  children?: NavEntry[]
}

const masterNav: NavEntry[] = [
  { to: '/masters/customers', label: '客戶主檔', icon: Users },
  {
    to: '/masters/products',
    label: '產品主檔',
    icon: Package,
    // 布卷資料在資料層是獨立的第五張主檔（PRD 決策 61-1），但從屬於商品分支，
    // 故 UI 上列為產品主檔的下一階層：由商品點進去看該分支的布卷，也可直接進來跨商品查詢
    children: [{ to: '/fabric-label', label: '布卷資料', icon: Tags }],
  },
  { to: '/masters/vendors', label: '廠商主檔', icon: Boxes },
  { to: '/masters/accounts', label: '帳戶主檔', icon: PackageSearch },
]

function NavItem({ to, label, icon: Icon, nested = false }: { to: string; label: string; icon: typeof Home; nested?: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2.5 rounded-md py-2 font-medium transition-colors',
          // 下一階層以縮排＋左側細線表示從屬關係，字級略小
          nested ? 'ml-3 border-l border-border pl-4 pr-3 text-[13px]' : 'px-3 text-sm',
          isActive ? 'bg-brand text-white' : 'text-ink-body hover:bg-muted',
        )
      }
    >
      <Icon className={cn('shrink-0', nested ? 'h-3.5 w-3.5' : 'h-4 w-4')} />
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

/**
 * 側欄內容：桌機的固定側欄與手機的抽屜共用。
 * 手機抽屜點了連結要自動關閉，故以 onNavigate 回呼通知外層。
 */
function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex h-full flex-col" onClick={onNavigate}>
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
              <div key={item.to} className="space-y-0.5">
                <NavItem to={item.to} label={item.label} icon={item.icon} />
                {item.children?.map((child) => (
                  <NavItem key={child.to} to={child.to} label={child.label} icon={child.icon} nested />
                ))}
              </div>
            ))}
          </div>
        </div>
      </nav>

      {/* 版本戳記：客戶回饋意見時可對照是哪一版，避免「上次不是長這樣」對不上 */}
      <div className="border-t border-border px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
        <div>原型展示版本</div>
        <div className="font-mono">{new Date(__BUILD_TIME__).toLocaleString('zh-TW', { hour12: false })}</div>
      </div>
    </div>
  )
}

export function Sidebar({ className = '' }: { className?: string }) {
  return (
    <aside className={cn('hidden w-64 shrink-0 flex-col border-r border-border bg-surface md:flex', className)}>
      <SidebarContent />
    </aside>
  )
}

/**
 * 手機／小平板（< md）的導覽抽屜：該尺寸下固定側欄會吃掉大半畫面，故收成抽屜。
 * 不用 Dialog：導覽不是強制回應的對話，遮罩點一下即關，且要能保留頁面捲動位置。
 */
export function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <div className={cn('md:hidden print:hidden', !open && 'pointer-events-none')} aria-hidden={!open}>
      <div
        className={cn('fixed inset-0 z-40 bg-ink/40 transition-opacity', open ? 'opacity-100' : 'opacity-0')}
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 max-w-[85vw] border-r border-border bg-surface shadow-xl transition-transform duration-200',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="關閉導覽"
          className="absolute right-2 top-4 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-ink"
        >
          <X className="h-4 w-4" />
        </button>
        <SidebarContent onNavigate={onClose} />
      </aside>
    </div>
  )
}

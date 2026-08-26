import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Info,
  Layers,
  Palette,
  PackageCheck,
  Scissors,
  ScrollText,
  Send,
  ShoppingCart,
  Tags,
  type LucideIcon,
} from 'lucide-react'
import { api } from '@/mocks/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { effectivePurchaseOrderStatus } from '@/lib/workflow'

interface DocCardConfig<T> {
  to: string
  queryKey: string
  formCode: string
  title: string
  description: string
  icon: LucideIcon
  query: () => Promise<T[]>
  getStatus: (item: T) => string
}

function useCounts<T>(queryKey: string, query: () => Promise<T[]>, getStatus: (item: T) => string) {
  const { data = [] } = useQuery({ queryKey: [queryKey], queryFn: query })
  const byStatus = data.reduce<Record<string, number>>((acc, item) => {
    const s = getStatus(item)
    acc[s] = (acc[s] ?? 0) + 1
    return acc
  }, {})
  return { total: data.length, byStatus }
}

function DocCard<T>(config: DocCardConfig<T>) {
  const { total, byStatus } = useCounts(config.queryKey, config.query, config.getStatus)
  const Icon = config.icon

  return (
    <Link to={config.to}>
      <Card className="h-full transition-shadow hover:shadow-md">
        <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded bg-brand/10 px-1.5 py-0.5 text-[11px] font-semibold text-brand-dark">
                {config.formCode}
              </span>
            </div>
            <CardTitle className="mt-1.5 text-base">{config.title}</CardTitle>
          </div>
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand/10 text-brand-dark">
            <Icon className="h-5 w-5" />
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-muted-foreground">{config.description}</p>
          <div className="mt-3 text-2xl font-semibold text-ink">{total}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(byStatus).map(([status, count]) => (
              <StatusBadge key={status} status={status} label={`${status} ${count}`} />
            ))}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

export function HomePage() {
  return (
    <div>
      <div className="mb-6 rounded-xl bg-brand p-6 text-white">
        <div className="text-sm font-medium text-white/80">RORICA TEXTILE CO., LTD. 皇加布業</div>
        <h1 className="mt-1 text-2xl font-semibold">進銷存模組 Phase 1 — 流程總覽</h1>
        <p className="mt-2 max-w-2xl text-sm text-white/85">
          以「包裝通知單」為主單號貫穿起點，串接採購、打色委託、染整、二次加工、入庫、出貨八張單據，取代目前僅出貨通知的舊系統。
        </p>
      </div>

      {/*
        原型使用說明：客戶很容易把這個原型當成已上線的系統，
        故把「沒有後端／資料不共享／資料會重置」三件事直接寫在首頁，不能只寫在 README。
      */}
      <div className="mb-6 rounded-xl border border-warning/40 bg-warning/10 p-4">
        <div className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <div className="text-sm text-ink-body">
            <div className="font-semibold text-ink">這是流程原型（Prototype），不是已上線的系統</div>
            <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[13px]">
              <li>畫面上所有客戶、廠商、商品、單據皆為<strong>模擬資料</strong>，與實際營運資料無關。</li>
              <li>
                沒有後端資料庫，您建立或修改的單據<strong>只存在您自己的瀏覽器分頁</strong>——
                同事開同一個網址不會看到您建的單據，關閉分頁後也會回到預設展示資料。
              </li>
              <li>右上角「重置模擬資料」可隨時清除測試內容，回到初始狀態，請放心操作。</li>
              <li>尚未實作登入與權限控管、真實 OCR 辨識、稽核異動比對、編輯鎖定與排程通知，這些屬於後端階段。</li>
              <li>建議使用<strong>電腦瀏覽器</strong>操作，表單與明細表格較寬，手機版面會過於擁擠。</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        <DocCard
          to="/packing-notice"
          queryKey="packingNotices"
          formCode="表1"
          title="包裝通知單"
          description="流程起點：客戶訂單建立主單號，向下衍生各表"
          icon={ScrollText}
          query={api.packingNotices}
          getStatus={(item) => item.status}
        />
        <DocCard
          to="/purchase-order"
          queryKey="purchaseOrders"
          formCode="表2"
          title="訂購單"
          description="紗、布採購合併登打，簽回後續建入庫"
          icon={ShoppingCart}
          query={api.purchaseOrders}
          getStatus={effectivePurchaseOrderStatus}
        />
        <DocCard
          to="/dye-request"
          queryKey="dyeRequests"
          formCode="表3"
          title="打色通知單"
          description="無色卡時觸發，與表4染整單為平行關係"
          icon={Palette}
          query={api.dyeRequests}
          getStatus={(item) => item.status}
        />
        <DocCard
          to="/dye-order"
          queryKey="dyeOrders"
          formCode="表4"
          title="染整單"
          description="委外加工的庫存追蹤來源，確認大貨樣後觸發入庫"
          icon={Layers}
          query={api.dyeOrders}
          getStatus={(item) => item.status}
        />
        <DocCard
          to="/secondary-processing"
          queryKey="secondaryProcessingOrders"
          formCode="表5"
          title="二次加工單"
          description="表1指定加工方法的品項對外發包，明細與包裝設定唯讀帶入"
          icon={Scissors}
          query={api.secondaryProcessingOrders}
          getStatus={(item) => item.status}
        />
        <DocCard
          to="/goods-receipt"
          queryKey="goodsReceipts"
          formCode="表6"
          title="入庫單"
          description="OCR 辨識布卷或人工複核，三種觸發來源擇一"
          icon={PackageCheck}
          query={api.goodsReceipts}
          getStatus={(item) => item.status}
        />
        <DocCard
          to="/fabric-label"
          queryKey="fabricLabels"
          formCode="表7"
          title="布卷條碼標籤"
          description="入庫時並行產生，貼於布捲上，非獨立系統頁面"
          icon={Tags}
          query={api.fabricLabels}
          getStatus={(item) => item.status}
        />
        <DocCard
          to="/shipping-order"
          queryKey="shippingOrders"
          formCode="表8"
          title="出貨單／樣品單"
          description="有庫存路徑或無庫存待入庫路徑，確認後觸發拆庫存"
          icon={Send}
          query={api.shippingOrders}
          getStatus={(item) => item.status}
        />
      </div>
    </div>
  )
}

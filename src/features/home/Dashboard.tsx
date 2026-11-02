import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import dayjs from 'dayjs'
import { ArrowDown, ArrowUp, BarChart3, FlaskConical } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Input } from '@/components/ui/input'
import { api } from '@/mocks/api'
import { useCurrentAccount } from '@/lib/current-account-context'
import {
  abnormalTotals,
  demoShipmentLines,
  groupTotals,
  previousPeriod,
  shipmentLines,
  stockTotals,
  summarize,
  type DashboardDocs,
  type Period,
  type ShipmentLine,
  type Totals,
} from '@/lib/dashboard'
import { companyFxRates, formatMoney, formatPct, fromNtd, FX_NOTE, integerShares, type FxRates } from '@/lib/money'
import { YARD_TO_METER } from '@/lib/units'
import { PI_CURRENCIES, type PiCurrency } from '@/types'

/**
 * 首頁儀表板（決策171）。
 *
 * 銷量＝實際出貨；營收、成本一律換成 NTD 計算，再依右上角選的幣別顯示（換算過的金額附匯率提示）。
 * 權限沿用欄位可見性：看不到售價的不顯示營收／售價／毛利，看不到進價或加工費的不顯示成本／毛利。
 * 顯示規則：總金額 NTD 整數、外幣 2 位；每碼單價同；碼數整數；百分比整數（lib/money）。
 */
type Preset = 'month' | 'quarter' | 'year' | 'last12' | 'custom'
type Unit = 'Yard' | 'Meter'

const PRESETS: { key: Preset; label: string }[] = [
  { key: 'month', label: '本月' },
  { key: 'quarter', label: '本季' },
  { key: 'year', label: '今年' },
  { key: 'last12', label: '近 12 個月' },
  { key: 'custom', label: '自訂' },
]

const SLICE_COLORS = Array.from({ length: 8 }, (_, i) => `var(--viz-${i + 1})`)
const OTHER_COLOR = 'var(--viz-other)'

function periodOf(preset: Preset, customFrom: string, customTo: string): Period {
  const today = dayjs()
  switch (preset) {
    case 'month':
      return { from: today.startOf('month'), to: today.startOf('month').add(1, 'month') }
    case 'quarter': {
      const from = today.startOf('year').add(Math.floor(today.month() / 3) * 3, 'month')
      return { from, to: from.add(3, 'month') }
    }
    case 'year':
      return { from: today.startOf('year'), to: today.startOf('year').add(1, 'year') }
    case 'last12':
      return { from: today.startOf('month').subtract(11, 'month'), to: today.startOf('month').add(1, 'month') }
    case 'custom': {
      const from = dayjs(customFrom || today.startOf('year').format('YYYY-MM-DD'))
      const to = dayjs(customTo || today.format('YYYY-MM-DD')).add(1, 'day')
      return { from, to: to.isAfter(from) ? to : from.add(1, 'day') }
    }
  }
}

/** 各單據清單；看不到的單據 api 回傳空陣列 */
function useList<T>(key: string, fn: () => Promise<T[]>): T[] {
  return useQuery({ queryKey: [key], queryFn: fn }).data ?? []
}

// 篩選欄位一律白底：頁面背景是米色，用 bg-background 會和背景融在一起、容易被忽略
const selectClass = 'h-9 rounded-md border border-input bg-white px-2 text-sm text-ink shadow-xs'

export function Dashboard() {
  const perms = useCurrentAccount()
  const canPrice = perms.canSee('售價')
  const canCost = perms.canSee('進價') && perms.canSee('加工與委外費用')
  const canMargin = canPrice && canCost

  
  const shippingOrders = useList('shippingOrders', api.shippingOrders)
  const fabricLabels = useList('fabricLabels', api.fabricLabels)
  const goodsReceipts = useList('goodsReceipts', api.goodsReceipts)
  const purchaseOrders = useList('purchaseOrders', api.purchaseOrders)
  const dyeOrders = useList('dyeOrders', api.dyeOrders)
  const secondaryProcessingOrders = useList('secondaryProcessingOrders', api.secondaryProcessingOrders)
  const packingNotices = useList('packingNotices', api.packingNotices)
  const products = useList('products', api.products)
  const customers = useList('customers', api.customers)
  const abnormalNotices = useList('abnormalNotices', api.abnormalNotices)
  const { data: profile } = useQuery({ queryKey: ['companyProfile'], queryFn: api.companyProfile })
  const rates = useMemo(() => companyFxRates(profile), [profile])

  const [preset, setPreset] = useState<Preset>('year')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo, setCustomTo] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [productKey, setProductKey] = useState('')
  const [color, setColor] = useState('')
  const [currency, setCurrency] = useState<PiCurrency>('NTD')
  const [unit, setUnit] = useState<Unit>('Yard')
  const [demo, setDemo] = useState(false)

  const period = periodOf(preset, customFrom, customTo)
  const prev = previousPeriod(period)
  const trendEnd = period.to.subtract(1, 'day').startOf('month')
  const trendStart = trendEnd.subtract(11, 'month')

  // 一次算完「上一期～本期」與「近 12 個月趨勢」涵蓋的範圍，之後各區塊再各自篩
  const allLines = useMemo<ShipmentLine[]>(() => {
    if (demo) {
      const productList = [...new Map(products.map((p) => [p.productName, { key: p.id, name: p.productName }])).values()].slice(0, 14)
      return demoShipmentLines(
        productList.length > 0 ? productList : [{ key: 'demo-a', name: '示範產品 A' }, { key: 'demo-b', name: '示範產品 B' }],
        customers.length > 0 ? customers.map((c) => c.id) : ['示範客戶'],
        dayjs().startOf('month'),
      )
    }
    const docs: DashboardDocs = {
      shippingOrders,
      fabricLabels,
      goodsReceipts,
      purchaseOrders,
      dyeOrders,
      secondaryProcessingOrders,
      packingNotices,
      products,
      customers,
      abnormalNotices,
    }
    const from = prev.from.isBefore(trendStart) ? prev.from : trendStart
    return shipmentLines(docs, { from, to: period.to }, rates)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demo, shippingOrders, fabricLabels, goodsReceipts, purchaseOrders, dyeOrders, secondaryProcessingOrders, packingNotices, products, customers, abnormalNotices, rates, period.from.valueOf(), period.to.valueOf()])

  const filtered = allLines.filter(
    (l) =>
      (!customerId || l.customerId === customerId) &&
      (!productKey || l.productKey === productKey) &&
      (!color || l.color === color),
  )
  const inRange = (l: ShipmentLine, p: Period) => {
    const d = dayjs(l.shipDate)
    return !d.isBefore(p.from) && d.isBefore(p.to)
  }
  const current = filtered.filter((l) => inRange(l, period))
  const totals = summarize(current)
  const prevTotals = summarize(filtered.filter((l) => inRange(l, prev)))

  // ---- 顯示換算
  const converted = currency !== 'NTD' || totals.hasForeign
  const moneyTitle = converted ? `${FX_NOTE}（${currencyRateText(currency, rates, profile?.fxUpdatedAt)}）` : undefined
  const money = (ntd: number | undefined) => (ntd == null ? '-' : formatMoney(fromNtd(ntd, currency, rates), currency))
  const perUnit = (ntdPerYard: number | undefined) =>
    ntdPerYard == null || !Number.isFinite(ntdPerYard)
      ? '-'
      : formatMoney(fromNtd(unit === 'Meter' ? ntdPerYard / YARD_TO_METER : ntdPerYard, currency, rates), currency)
  const qty = (yard: number) =>
    `${Math.round(unit === 'Meter' ? yard * YARD_TO_METER : yard).toLocaleString('zh-TW')} ${unit === 'Meter' ? 'M' : 'Y'}`
  const unitLabel = unit === 'Meter' ? '米' : '碼'

  const avgPrice = totals.pricedYard > 0 ? totals.revenueNtd / totals.pricedYard : undefined
  const avgCost = totals.costedYard > 0 ? totals.costNtd / totals.costedYard : undefined
  const profit = totals.marginRevenueNtd > 0 ? totals.marginRevenueNtd - totals.marginCostNtd : undefined
  const margin = totals.marginRevenueNtd > 0 && profit != null ? profit / totals.marginRevenueNtd : undefined
  const prevAvgPrice = prevTotals.pricedYard > 0 ? prevTotals.revenueNtd / prevTotals.pricedYard : undefined
  const prevAvgCost = prevTotals.costedYard > 0 ? prevTotals.costNtd / prevTotals.costedYard : undefined
  const prevProfit = prevTotals.marginRevenueNtd > 0 ? prevTotals.marginRevenueNtd - prevTotals.marginCostNtd : undefined

  // ---- 庫存（目前快照，不受期間影響；選了產品時只看該產品）
  const productLine = allLines.find((l) => l.productKey === productKey)
  const stock = stockTotals(
    fabricLabels,
    (l) =>
      (!productKey || l.productId === productKey || l.productName === productLine?.productName) &&
      (!color || l.color === color),
  )
  const abnormal = abnormalTotals(abnormalNotices, period)
  const abnormalRate = totals.yard > 0 ? abnormal.abnormalYard / totals.yard : undefined

  // ---- 趨勢（近 12 個月）
  const months = Array.from({ length: 12 }, (_, i) => trendStart.add(i, 'month'))
  const monthly = groupTotals(filtered, (l) => dayjs(l.shipDate).format('YYYY-MM'))
  const trend = months.map((m) => {
    const t = monthly.get(m.format('YYYY-MM'))
    return {
      month: m.format('YY/MM'),
      qty: t ? (unit === 'Meter' ? t.yard * YARD_TO_METER : t.yard) : 0,
      revenue: t ? fromNtd(t.revenueNtd, currency, rates) : 0,
    }
  })

  // ---- 前 10 名（營收；看不到售價者改用碼數）
  const rankBy = (t: Totals) => (canPrice ? t.revenueNtd : t.yard)
  const byProduct = groupTotals(current, (l) => l.productKey)
  const byCustomer = groupTotals(current, (l) => l.customerId)
  const productName = (key: string) => allLines.find((l) => l.productKey === key)?.productName ?? key
  const customerName = (id: string) => customers.find((c) => c.id === id)?.shortName ?? id
  const productRanking = [...byProduct].map(([k, t]) => ({ name: productName(k), value: rankBy(t) })).sort((a, b) => b.value - a.value)
  const customerRanking = [...byCustomer].map(([k, t]) => ({ name: customerName(k), value: rankBy(t) })).sort((a, b) => b.value - a.value)
  const formatRankValue = (v: number) => (canPrice ? money(v) : qty(v))

  const customerOptions = [...new Set(allLines.map((l) => l.customerId))].map((id) => ({ id, name: customerName(id) }))
  const productOptions = [...new Map(allLines.map((l) => [l.productKey, l.productName])).entries()]
  // 顏色選項跟著產品走：選了產品只列該產品出過貨的顏色
  const colorOptions = [
    ...new Set(allLines.filter((l) => l.color && (!productKey || l.productKey === productKey)).map((l) => l.color)),
  ].sort((a, b) => a.localeCompare(b, 'zh-Hant'))

  const sparse = !demo && current.length < 5

  return (
    <section className="mb-6 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* 儀表板整體是一張卡片：標題與篩選列在上方，內容區塊用細框分隔、間距收緊 */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-5 w-5 text-brand-dark" />
          <h2 className="text-lg font-semibold text-ink">營運儀表板</h2>
          <span className="text-xs text-muted-foreground">
            {period.from.format('YYYY/MM/DD')}～{period.to.subtract(1, 'day').format('YYYY/MM/DD')}
          </span>
        </div>
        {/* 篩選列：同一列、在所有圖表上方 */}
        <div className="flex flex-wrap items-end gap-2">
          <select className={selectClass} value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="期間">
            {PRESETS.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </select>
          {preset === 'custom' && (
            <>
              <Input type="date" className="h-9 w-36 bg-white" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
              <span className="pb-2 text-xs text-muted-foreground">～</span>
              <Input type="date" className="h-9 w-36 bg-white" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
            </>
          )}
          <select className={selectClass} value={customerId} onChange={(e) => setCustomerId(e.target.value)} aria-label="客戶">
            <option value="">全部客戶</option>
            {customerOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className={selectClass}
            value={productKey}
            onChange={(e) => {
              setProductKey(e.target.value)
              // 換產品時清掉顏色：原本選的顏色在新產品底下可能不存在，留著會篩出空畫面
              setColor('')
            }}
            aria-label="產品"
          >
            <option value="">全部產品</option>
            {productOptions.map(([k, name]) => (
              <option key={k} value={k}>
                {name}
              </option>
            ))}
          </select>
          <select className={selectClass} value={color} onChange={(e) => setColor(e.target.value)} aria-label="顏色">
            <option value="">全部顏色</option>
            {colorOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select className={selectClass} value={unit} onChange={(e) => setUnit(e.target.value as Unit)} aria-label="單位">
            <option value="Yard">碼（Y）</option>
            <option value="Meter">米（M）</option>
          </select>
          {(canPrice || canCost) && (
            <select className={selectClass} value={currency} onChange={(e) => setCurrency(e.target.value as PiCurrency)} aria-label="顯示幣別">
              {PI_CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          )}
          <label className="flex h-9 items-center gap-1.5 rounded-md border border-input bg-white px-2 text-sm text-ink shadow-xs">
            <input type="checkbox" checked={demo} onChange={(e) => setDemo(e.target.checked)} />
            示範數據
          </label>
        </div>
      </div>

      <div className="space-y-3 p-4">
      {demo && (
        <div className="flex items-start gap-2 rounded-lg border border-accent-blue/30 bg-accent-blue/10 px-3 py-2 text-sm text-ink-body">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-accent-blue" />
          <span>
            目前顯示的是<strong>示範數據</strong>：以固定規則產生的近 12 個月出貨（出貨量、營收、成本、毛利、排名與產品明細），只用來檢視版面與算法，<strong>不影響任何單據</strong>；庫存與表9 仍為實際資料。關閉右上角「示範數據」即回到實際資料。
          </span>
        </div>
      )}
      {sparse && (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          這段期間已完成的出貨只有 {current.length} 筆，圖表會很空。可以調整期間，或勾選右上角「示範數據」看完整版面。
        </p>
      )}

      {/* 重點數字 */}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4 xl:grid-cols-7">
        <Kpi label="出貨量" value={qty(totals.yard)} delta={change(totals.yard, prevTotals.yard)} />
        {canPrice && (
          <Kpi label="營收" value={money(totals.revenueNtd)} title={moneyTitle} delta={change(totals.revenueNtd, prevTotals.revenueNtd)} />
        )}
        {canPrice && (
          <Kpi label={`平均售價／${unitLabel}`} value={perUnit(avgPrice)} title={moneyTitle} delta={change(avgPrice, prevAvgPrice)} />
        )}
        {canCost && (
          <Kpi
            label={`平均每${unitLabel}成本`}
            value={perUnit(avgCost)}
            title={currency !== 'NTD' ? moneyTitle : undefined}
            delta={change(avgCost, prevAvgCost)}
            invert
          />
        )}
        {canMargin && (
          <Kpi
            label="毛利（毛利率）"
            value={`${money(profit)}`}
            sub={`毛利率 ${formatPct(margin)}`}
            title={moneyTitle}
            delta={change(profit, prevProfit)}
          />
        )}
        <Kpi label="可用庫存" value={qty(stock.availableYard)} sub={`預留中 ${qty(stock.reservedYard)}`} />
        <Kpi label="表9 異常率" value={formatPct(abnormalRate)} sub={`異常 ${qty(abnormal.abnormalYard)}`} invert />
      </div>
      {canCost && totals.incompleteReceipts.size > 0 && (
        <p className="text-xs text-muted-foreground">
          有 {totals.incompleteReceipts.size} 批（或未填布卷的出貨）成本資料不完整，未計入平均成本與毛利。
        </p>
      )}

      {/* 趨勢：兩個量級不同的數字分成兩張圖，不做雙軸 */}
      <div className={`grid grid-cols-1 gap-3 ${canPrice ? 'lg:grid-cols-2' : ''}`}>
        <TrendChart title={`每月出貨量（${unit === 'Meter' ? 'M' : 'Y'}）`} data={trend} dataKey="qty" format={(v) => qty(unit === 'Meter' ? v / YARD_TO_METER : v)} />
        {canPrice && (
          <TrendChart
            title={`每月營收（${currency}）`}
            data={trend}
            dataKey="revenue"
            format={(v) => formatMoney(v, currency)}
            note={moneyTitle}
          />
        )}
      </div>

      {/* 前 10 名：圓餅（環狀）＋清單 */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <RankingPie
          title={canPrice ? '營收前 10 名產品' : '出貨量前 10 名產品'}
          ranking={productRanking}
          format={formatRankValue}
          note={canPrice ? moneyTitle : undefined}
        />
        <RankingPie
          title={canPrice ? '營收前 10 名客戶' : '出貨量前 10 名客戶'}
          ranking={customerRanking}
          format={formatRankValue}
          note={canPrice ? moneyTitle : undefined}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <StockBar stock={stock} qty={qty} />
        <div className="rounded-lg border border-border">
          <div className="px-3 pt-2.5 pb-1">
            <h3 className="text-sm font-semibold text-ink">表9 異常（期間內客訴）</h3>
          </div>
          <div className="grid grid-cols-3 gap-3 px-3 pb-3 text-sm">
            <Stat label="件數" value={`${abnormal.count} 件`} />
            <Stat label="退貨" value={qty(abnormal.returnYard)} />
            <Stat label="扣款金額" value={abnormal.hasDeductionAmount ? formatMoney(fromNtd(abnormal.deductionNtd, currency, rates), currency) : '-'} />
            <p className="col-span-3 text-xs text-muted-foreground">另列，不影響營收與毛利。</p>
          </div>
        </div>
      </div>

      <ProductTable
        lines={current}
        productName={productName}
        canPrice={canPrice}
        canCost={canCost}
        money={money}
        perUnit={perUnit}
        qty={qty}
        unitLabel={unitLabel}
        moneyTitle={moneyTitle}
        stockOf={(key) => {
          const name = productName(key)
          return stockTotals(fabricLabels, (l) => l.productId === key || l.productName === name).availableYard
        }}
        abnormalOf={(key) => {
          const name = productName(key)
          return abnormalNotices.filter((n) => {
            const d = dayjs(n.noticeDate)
            return n.kind === '客訴異常' && (n.productId === key || n.productName === name) && !d.isBefore(period.from) && d.isBefore(period.to)
          }).length
        }}
      />
      </div>
    </section>
  )
}

function currencyRateText(currency: PiCurrency, rates: FxRates, updatedAt?: string): string {
  const shown = currency === 'NTD' ? '外幣營收依公司資訊匯率換算成 NTD' : `1 ${currency} = ${rates[currency]} NTD`
  return updatedAt ? `${shown}，匯率 ${dayjs(updatedAt).format('YYYY/MM/DD')} 更新` : shown
}

/** 與上一期相比；上一期為 0 或算不出來時不顯示 */
function change(cur: number | undefined, prev: number | undefined): number | undefined {
  if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return undefined
  return (cur - prev) / Math.abs(prev)
}

function Kpi(props: { label: string; value: string; sub?: string; title?: string; delta?: number; invert?: boolean }) {
  const { label, value, sub, title, delta, invert } = props
  // 成本、異常率上升是壞事：箭頭方向照實際增減，顏色反過來
  const good = delta == null ? undefined : invert ? delta < 0 : delta > 0
  return (
    <div className="bg-card px-3 py-2.5">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div
          className={`mt-1 whitespace-nowrap text-lg font-semibold text-ink ${title ? 'cursor-help underline decoration-muted-foreground decoration-dotted underline-offset-4' : ''}`}
          title={title}
        >
          {value}
        </div>
        {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        {delta != null && (
          <div className={`mt-1 flex items-center gap-0.5 text-xs ${good ? 'text-success' : 'text-destructive'}`}>
            {delta >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {formatPct(Math.abs(delta))}
            <span className="ml-1 text-muted-foreground">較上一期</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold text-ink">{value}</div>
    </div>
  )
}

function TrendChart(props: {
  title: string
  data: { month: string; qty: number; revenue: number }[]
  dataKey: 'qty' | 'revenue'
  format: (v: number) => string
  note?: string
}) {
  const { title, data, dataKey, format, note } = props
  return (
    <div className="rounded-lg border border-border">
      <div className="px-3 pt-2.5">
        <h3 className="text-sm font-semibold text-ink" title={note}>
          {title}
          {note && <span className="ml-1 cursor-help text-xs font-normal text-muted-foreground">ⓘ</span>}
        </h3>
      </div>
      <div className="h-52 px-2 pb-2">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--viz-grid)" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: 'var(--viz-axis)' }} axisLine={false} tickLine={false} />
            <YAxis
              tick={{ fontSize: 11, fill: 'var(--viz-axis)' }}
              axisLine={false}
              tickLine={false}
              width={56}
              tickFormatter={(v: number) => compact(v)}
            />
            <Tooltip
              cursor={{ fill: 'var(--viz-grid)', opacity: 0.5 }}
              formatter={(v) => [format(Number(v)), dataKey === 'qty' ? '出貨量' : '營收']}
              itemStyle={{ color: 'var(--foreground, #0b0b0b)' }}
              labelFormatter={(l) => `20${l}`}
            />
            <Bar dataKey={dataKey} fill="var(--viz-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

/** 座標軸刻度：千、萬簡寫，不帶小數 */
function compact(v: number): string {
  if (Math.abs(v) >= 10000) return `${Math.round(v / 10000).toLocaleString('zh-TW')}萬`
  if (Math.abs(v) >= 1000) return `${Math.round(v / 1000).toLocaleString('zh-TW')}千`
  return Math.round(v).toLocaleString('zh-TW')
}

/**
 * 前 10 名的環狀圖。類別色只有 8 個（固定順序、不循環），故前 8 名各一色，第 9 名以後併成灰色「其他」；
 * 右側清單完整列出前 10 名的數值與比例，第 9、10 名標示在「其他」裡。比例為整數、合計 100%。
 */
function RankingPie(props: { title: string; ranking: { name: string; value: number }[]; format: (v: number) => string; note?: string }) {
  const { title, ranking, format, note } = props
  const total = ranking.reduce((s, r) => s + r.value, 0)
  const top = ranking.slice(0, 8)
  const restValue = ranking.slice(8).reduce((s, r) => s + r.value, 0)
  const slices = [...top.map((r, i) => ({ ...r, color: SLICE_COLORS[i] })), ...(restValue > 0 ? [{ name: '其他', value: restValue, color: OTHER_COLOR }] : [])]
  const shares = integerShares(slices.map((s) => s.value))
  return (
    <div className="rounded-lg border border-border">
      <div className="px-3 pt-2.5">
        <h3 className="text-sm font-semibold text-ink" title={note}>
          {title}
          {note && <span className="ml-1 cursor-help text-xs font-normal text-muted-foreground">ⓘ</span>}
        </h3>
      </div>
      <div className="px-3 pb-3">
        {total <= 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">這段期間沒有資料</p>
        ) : (
          <div className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[180px_1fr]">
            <div className="h-44">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="name" innerRadius="58%" outerRadius="95%" paddingAngle={1} stroke="var(--background, #fff)" strokeWidth={2}>
                    {slices.map((s) => (
                      <Cell key={s.name} fill={s.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    itemStyle={{ color: 'var(--foreground, #0b0b0b)' }}
                    formatter={(v, n) => [`${format(Number(v))}（${shares[slices.findIndex((s) => s.name === n)]}%）`, String(n)]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ol className="space-y-0.5 text-xs">
              {ranking.slice(0, 10).map((r, i) => (
                <li key={r.name} className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: i < 8 ? SLICE_COLORS[i] : OTHER_COLOR }} />
                  <span className="w-4 text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-body">{r.name}</span>
                  <span className="tabular-nums text-ink">{format(r.value)}</span>
                  <span className="w-10 text-right tabular-nums text-muted-foreground">
                    {i < 8 ? `${shares[i]}%` : formatPct(r.value / total)}
                  </span>
                </li>
              ))}
              {restValue > 0 && (
                <li className="flex items-center gap-2 border-t border-border pt-1 text-muted-foreground">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: OTHER_COLOR }} />
                  <span className="flex-1">其他（第 9 名以後，共 {ranking.length - 8} 項）</span>
                  <span className="tabular-nums">{format(restValue)}</span>
                  <span className="w-10 text-right tabular-nums">{shares[shares.length - 1]}%</span>
                </li>
              )}
            </ol>
          </div>
        )}
      </div>
    </div>
  )
}

function StockBar({ stock, qty }: { stock: { availableYard: number; reservedYard: number; defectYard: number }; qty: (y: number) => string }) {
  const parts = [
    { label: '可用', value: stock.availableYard, color: 'var(--viz-1)' },
    { label: '預留中', value: stock.reservedYard, color: 'var(--viz-2)' },
    { label: '瑕疵／報廢', value: stock.defectYard, color: 'var(--viz-other)' },
  ]
  const total = parts.reduce((s, p) => s + p.value, 0)
  const shares = integerShares(parts.map((p) => p.value))
  return (
    <div className="rounded-lg border border-border lg:col-span-2">
      <div className="px-3 pt-2.5 pb-1">
        <h3 className="text-sm font-semibold text-ink">庫存組成（目前）</h3>
      </div>
      <div className="space-y-2 px-3 pb-3">
        {/* 堆疊條：段與段之間留 2px 間隙 */}
        <div className="flex h-5 w-full gap-[2px] overflow-hidden rounded">
          {total > 0 &&
            parts.map((p) =>
              p.value > 0 ? (
                <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} title={`${p.label} ${qty(p.value)}`} />
              ) : null,
            )}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
          {parts.map((p, i) => (
            <span key={p.label} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />
              <span className="text-muted-foreground">{p.label}</span>
              <span className="font-medium text-ink">{qty(p.value)}</span>
              <span className="text-xs text-muted-foreground">{shares[i]}%</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}

type SortKey = 'name' | 'yard' | 'revenue' | 'price' | 'cost' | 'margin' | 'stock' | 'abnormal'

function ProductTable(props: {
  lines: ShipmentLine[]
  productName: (key: string) => string
  canPrice: boolean
  canCost: boolean
  money: (ntd: number | undefined) => string
  perUnit: (ntdPerYard: number | undefined) => string
  qty: (yard: number) => string
  unitLabel: string
  moneyTitle?: string
  stockOf: (key: string) => number
  abnormalOf: (key: string) => number
}) {
  const { lines, productName, canPrice, canCost, money, perUnit, qty, unitLabel, moneyTitle, stockOf, abnormalOf } = props
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: canPrice ? 'revenue' : 'yard', desc: true })
  const rows = [...groupTotals(lines, (l) => l.productKey)].map(([key, t]) => {
    const marginRev = t.marginRevenueNtd
    return {
      key,
      name: productName(key),
      t,
      yard: t.yard,
      revenue: t.revenueNtd,
      price: t.pricedYard > 0 ? t.revenueNtd / t.pricedYard : undefined,
      cost: t.costedYard > 0 ? t.costNtd / t.costedYard : undefined,
      margin: marginRev > 0 ? (marginRev - t.marginCostNtd) / marginRev : undefined,
      stock: stockOf(key),
      abnormal: abnormalOf(key),
    }
  })
  rows.sort((a, b) => {
    const av = a[sort.key]
    const bv = b[sort.key]
    const cmp = typeof av === 'string' ? av.localeCompare(String(bv)) : (Number(av ?? -Infinity) - Number(bv ?? -Infinity))
    return sort.desc ? -cmp : cmp
  })
  const head = (key: SortKey, label: string, right = true) => (
    <th
      className={`cursor-pointer whitespace-nowrap px-3 py-2 font-medium ${right ? 'text-right' : 'text-left'}`}
      onClick={() => setSort((s) => ({ key, desc: s.key === key ? !s.desc : true }))}
    >
      {label}
      {sort.key === key ? (sort.desc ? ' ▼' : ' ▲') : ''}
    </th>
  )
  const per = (part: number, t: Totals) => (t.costedYard > 0 ? part / t.costedYard : undefined)
  return (
    <div className="rounded-lg border border-border">
      <div className="px-3 pt-2.5 pb-1">
        <h3 className="text-sm font-semibold text-ink">產品明細</h3>
      </div>
      <div className="pb-1">
        {rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">這段期間沒有出貨</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[56rem] text-sm">
              <thead className="bg-muted text-xs text-muted-foreground">
                <tr>
                  {head('name', '產品', false)}
                  {head('yard', '銷量')}
                  {canPrice && head('revenue', '營收')}
                  {canPrice && head('price', `平均售價／${unitLabel}`)}
                  {canCost && head('cost', `每${unitLabel}成本`)}
                  {canCost && <th className="whitespace-nowrap px-3 py-2 text-right font-medium">胚布／染整／加工（成品直採）</th>}
                  {canPrice && canCost && head('margin', '毛利率')}
                  {head('stock', '可用庫存')}
                  {head('abnormal', '異常件數')}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="border-b border-border/60 last:border-0">
                    <td className="px-3 py-2 text-ink">{r.name}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{qty(r.yard)}</td>
                    {canPrice && (
                      <td className="px-3 py-2 text-right tabular-nums" title={moneyTitle}>
                        {money(r.revenue)}
                      </td>
                    )}
                    {canPrice && (
                      <td className="px-3 py-2 text-right tabular-nums" title={moneyTitle}>
                        {perUnit(r.price)}
                      </td>
                    )}
                    {canCost && <td className="px-3 py-2 text-right tabular-nums">{perUnit(r.cost)}</td>}
                    {canCost && (
                      <td className="px-3 py-2 text-right text-xs tabular-nums text-muted-foreground">
                        {r.t.costedYard > 0
                          ? r.t.costParts.finished > 0 && r.t.costParts.greige === 0
                            ? `（${perUnit(per(r.t.costParts.finished, r.t))}）`
                            : `${perUnit(per(r.t.costParts.greige, r.t))}／${perUnit(per(r.t.costParts.dye, r.t))}／${perUnit(per(r.t.costParts.secondary, r.t))}`
                          : '-'}
                      </td>
                    )}
                    {canPrice && canCost && <td className="px-3 py-2 text-right tabular-nums">{formatPct(r.margin)}</td>}
                    <td className="px-3 py-2 text-right tabular-nums">{qty(r.stock)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.abnormal}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

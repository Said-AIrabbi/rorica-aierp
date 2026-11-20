import dayjs from 'dayjs'
import type { FabricLabel, Product } from '@/types'

/**
 * 把 ERP 資料整理成Agents協作中心（public/four-module-console.html）讀的格式。
 *
 * 協作中心原本內建示意資料（SNAPSHOT、ERPNO、COLOR_SEED）；嵌在 ERP 裡時改讀這裡給的值，
 * 劇本與畫面邏輯一行不動。對照關係：
 *   - 型錄貨號（sku）＝ ERP 皇加品名（S75、KK98…），ERP 產品編號＝商品主檔的產品編號（S75 → 2-52）
 *   - 庫存快照＝在庫布卷；被表1 鎖住的（reservedFor）記為已預留，與現貨總覽同一把尺
 *   - 色彩資料庫種子＝商品主檔各色號已登記的 LAB；色樣編號就是 ERP 歷史色樣編號
 * 只讀，不回寫 ERP。
 */

export interface ConsoleRoll {
  sku: string
  color: string
  roll: string
  y: number
  reserved: boolean
}

export interface ConsoleBridge {
  snapshot: { asOf: string; time: string; items: Record<string, { name: string }>; rolls: ConsoleRoll[] }
  erpNo: Record<string, string>
  colorSeed: [string, string, string, [number, number, number], string][]
  bases: string[]
  targets: Record<string, { name: string; lab: [number, number, number] }>
  defaultBase: string
  defaultTarget: string
  /** 情境 1 的預設詢價：ERP 裡實際有可用現貨的品名＋顏色 */
  defaultInquiry: { sku: string; color: string; qty: number }
  /** ERP 色彩資料庫（PET 染色配方，tools/build-color-db.mjs 產生）；沒有這份檔時不帶，協作中心改用 colorSeed */
  colorDb?: ColorDbRecord[]
}

export interface ColorDbRecord {
  id: string
  zh: string
  en: string
  lab: [number, number, number]
  /** [染料代號, 用量 g]；模擬色彩沒有配方時為空 */
  dyes: [string, number][]
  /** 來源：歷史染色配方（去識別化）／模擬色彩資料 */
  src?: string
  /** 胚布材質（PET、NYLON…）*/
  base?: string
}

const YARD_PER_METER = 1 / 0.9144
const BASE_LIMIT = 12
/** 協作中心情境 1～5 劇本裡寫死的型錄貨號（3760 不在皇加產品表，對照不到） */
const SCRIPTED_SKUS = ['S75', '3760', '630-1GU', 'KK98', 'N120', '90125', 'WT-7012']
const r1 = (v: number) => Math.round(v * 10) / 10

/** 布款的短名：取產品特性的第一段（「軟垂緞布，飽和光澤」→「軟垂緞布」），沒有就用品名本身 */
function shortName(p: Product): string {
  return p.characteristics.split(/[，,:：]/)[0]?.trim() || p.productName
}

export function buildConsoleBridge(products: Product[], labels: FabricLabel[], now = dayjs()): ConsoleBridge {
  const rolls: ConsoleRoll[] = labels
    .filter((l) => l.status === '在庫')
    .map((l) => ({
      sku: l.productName,
      color: l.color,
      roll: l.rollCode,
      y: Number((l.unit === 'Meter' ? l.length * YARD_PER_METER : l.length).toFixed(2)),
      reserved: Boolean(l.reservedFor),
    }))

  // 同一品名有多個規格分支時（N120 的 60" 與 120"），對照表取第一支——協作中心以品名為鍵
  const byName = new Map<string, Product>()
  products.forEach((p) => {
    if (!byName.has(p.productName)) byName.set(p.productName, p)
  })

  const seen = new Set<string>()
  const colorSeed: ConsoleBridge['colorSeed'] = []
  products.forEach((p) =>
    p.colors.forEach((c) => {
      const lab = c.digital?.lab
      if (!lab || seen.has(c.sampleCode)) return
      seen.add(c.sampleCode)
      colorSeed.push([c.sampleCode, c.color, p.productName, [lab.l, lab.a, lab.b], '分光儀量測'])
    }),
  )

  const freeYards = (sku: string, color: string) =>
    rolls.filter((r) => r.sku === sku && r.color === color && !r.reserved).reduce((s, r) => s + r.y, 0)

  // 情境 6 的布款：有色樣者，色樣顏色有可用現貨的排前面；選單只列前 BASE_LIMIT 筆
  const baseStock = new Map<string, number>()
  colorSeed.forEach(([, color, sku]) => baseStock.set(sku, Math.max(baseStock.get(sku) ?? 0, freeYards(sku, color))))
  const bases = [...baseStock.keys()]
    .sort((a, b) => (baseStock.get(b) ?? 0) - (baseStock.get(a) ?? 0) || a.localeCompare(b))
    .slice(0, BASE_LIMIT)

  // 協作中心只列「有庫存」或「在情境 6 選單裡」的布款，免得 150 多筆主檔塞滿畫面；
  // 情境 1～5 寫死的品名（S75、KK98…）也帶上對照，查不到庫存時照實顯示需訂製
  const relevant = new Set([...rolls.map((r) => r.sku), ...bases, ...SCRIPTED_SKUS])
  const items: ConsoleBridge['snapshot']['items'] = {}
  const erpNo: Record<string, string> = {}
  relevant.forEach((name) => {
    const p = byName.get(name)
    if (!p) return
    items[name] = { name: shortName(p) }
    erpNo[name] = p.productCode
  })

  // 「沿用既有色號」路線的示範目標色：取有現貨的那一個色樣，Lab 微調到 ΔE00 1.0 以內
  const anchor = colorSeed
    .map((s) => ({ s, free: freeYards(s[2], s[1]) }))
    .sort((a, b) => b.free - a.free)[0]?.s
  const targets: ConsoleBridge['targets'] = {}
  if (anchor) {
    const [code, color, , [l, a, b]] = anchor
    targets.erp = { name: `貼近 ERP 色號「${color}」（${code}）`, lab: [r1(l + 0.3), r1(a - 0.2), r1(b + 0.3)] }
  }

  return {
    snapshot: { asOf: now.format('YYYY/MM/DD'), time: now.format('HH:mm'), items, rolls },
    erpNo,
    colorSeed,
    bases: bases.length ? bases : Object.keys(items).slice(0, 1),
    targets,
    defaultBase: anchor?.[2] ?? bases[0] ?? '',
    defaultTarget: anchor ? 'erp' : 'champ',
    defaultInquiry: (() => {
      const r = rolls.find((x) => !x.reserved) ?? rolls[0]
      return r ? { sku: r.sku, color: r.color, qty: 300 } : { sku: 'S75', color: 'CHAMPAGNE', qty: 300 }
    })(),
  }
}

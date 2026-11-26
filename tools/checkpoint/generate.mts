/**
 * 成果查核點的模擬資料產生器（決定性：固定亂數種子，重跑結果相同）。
 *
 *   npx tsx --tsconfig tsconfig.app.json tools/checkpoint/generate.mts
 *
 * 產出（全部是「輸入資料」，不是測試結果；測試紀錄與通過率要由系統實際執行產生）：
 *   checkpoint-data/            A1 訂單與欄位對應、A2 庫存與媒合標準答案、B1 色彩與配方、B2 測試題、C 系列測試輸入
 *   public/color-library/       ERP 與協作中心讀的色彩庫（去識別化真實配方＋模擬色彩）
 *   public/a2a/                 四個代理人的 Agent Card（JWS 簽章）與公開金鑰（服務發現用）
 *   checkpoint-data/.generated/ 要寫進 ERP 工作區的整包快照（種子資料＋新增庫存與 PI；不進 git）
 * 真實資料來源 public/private/color-db.json（不進 git）：色名含品牌／客戶的色卡名稱，一律改成依色相的編號名稱，
 * 只保留 Lab 與染料配方。
 */
import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'

const ROOT = 'E:/dev-data/antigravity/playground/RORICA-ERP'
const OUT = join(ROOT, 'checkpoint-data')
const SITE = 'https://rorica-aierp.vercel.app'
const TODAY = '2026-11-20'
const m = await import('file:///E:/dev-data/antigravity/playground/RORICA-ERP/src/mocks/data.ts')
const seed = m.buildSessionSnapshot() as any

// ---------------- 小工具 ----------------
let state = 20261120
const rnd = () => { state |= 0; state = (state + 0x6d2b79f5) | 0; let t = Math.imul(state ^ (state >>> 15), 1 | state); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
/** 2026-11-26 擴充（訂單 45、色彩 10,500、歷史色 30、任務 125、情境 3×15、端到端 120）：新增的部分用另一組亂數，
 *  原本的資料（報告已引用的範例）逐筆不變。 */
const withExtra = <T,>(salt: number, fn: () => T): T => { const saved = state; state = 20261126 + salt * 1000; try { return fn() } finally { state = saved } }
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1))
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)]
const shuffle = <T,>(xs: T[]) => { const a = [...xs]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]] } return a }
const pad = (n: number, w: number) => String(n).padStart(w, '0')
const r1 = (v: number) => Math.round(v * 10) / 10
const r3 = (v: number) => Math.round(v * 1000) / 1000
const clone = <T,>(o: T): T => JSON.parse(JSON.stringify(o))
const dayIso = (d: string, h = 10) => new Date(`${d}T${pad(h, 2)}:00:00+08:00`).toISOString()
const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 86400000).toISOString().slice(0, 10)
const YD_PER_M = 1 / 0.9144
function out(rel: string, data: unknown) {
  const p = join(rel.startsWith('public/') || rel.startsWith('tools/') ? ROOT : OUT, rel)
  mkdirSync(dirname(p), { recursive: true })
  writeFileSync(p, typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data, null, 1) + '\n')
}
const csv = (rows: (string | number | null | undefined)[][]) => '\uFEFF' + rows.map((r) => r.map((v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',')).join('\n') + '\n'
const MARK = '模擬資料（2026 成果查核點用，非真實交易）'

// ---------------- 色彩：Lab ↔ RGB、ΔE00 ----------------
type Lab = [number, number, number]
function rgb2lab([R, G, B]: number[]): Lab {
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const [r, g, b] = [lin(R), lin(G), lin(B)]
  const X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047, Y = r * 0.2126 + g * 0.7152 + b * 0.0722, Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116)
  return [r3(116 * f(Y) - 16), r3(500 * (f(X) - f(Y))), r3(200 * (f(Y) - f(Z)))]
}
function lab2rgb([L, a, b]: Lab): [number, number, number] {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200
  const inv = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27))
  const X = inv(fx) * 0.95047, Y = inv(fy), Z = inv(fz) * 1.08883
  const g = (c: number) => Math.max(0, Math.min(255, Math.round(255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055))))
  return [g(X * 3.2406 - Y * 1.5372 - Z * 0.4986), g(-X * 0.9689 + Y * 1.8758 + Z * 0.0415), g(X * 0.0557 - Y * 0.204 + Z * 1.057)]
}
const hex = (rgb: number[]) => '#' + rgb.map((c) => pad(c.toString(16), 2)).join('').toUpperCase()
function dE00(l1: Lab, l2: Lab): number {
  const [L1, a1, b1] = l1, [L2, a2, b2] = l2, rad = Math.PI / 180
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)))
  const ap1 = (1 + G) * a1, ap2 = (1 + G) * a2, Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2)
  const h = (b: number, a: number) => { const v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v }
  const hp1 = h(b1, ap1), hp2 = h(b2, ap2)
  const dL = L2 - L1, dC = Cp2 - Cp1
  let dh = hp2 - hp1; if (Cp1 * Cp2 === 0) dh = 0; else if (dh > 180) dh -= 360; else if (dh < -180) dh += 360
  const dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad)
  const Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2
  let hb = hp1 + hp2; if (Cp1 * Cp2 !== 0) { hb = Math.abs(hp1 - hp2) > 180 ? (hp1 + hp2 + (hp1 + hp2 < 360 ? 360 : -360)) / 2 : (hp1 + hp2) / 2 }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad)
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T
  const RT = -2 * Math.sqrt(Cpb ** 7 / (Cpb ** 7 + 25 ** 7)) * Math.sin(60 * Math.exp(-(((hb - 275) / 25) ** 2)) * rad)
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH))
}
/** 依 Lab 給色系名稱（去識別化後的色名） */
function family([L, a, b]: Lab): [string, string] {
  const C = Math.hypot(a, b), h = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
  if (C < 8) return L > 88 ? ['白', 'WHITE'] : L < 22 ? ['黑', 'BLACK'] : ['灰', 'GREY']
  if (h < 25 || h >= 345) return ['紅', 'RED']
  if (h < 60) return L < 45 ? ['棕', 'BROWN'] : ['橙', 'ORANGE']
  if (h < 100) return ['黃', 'YELLOW']
  if (h < 165) return ['綠', 'GREEN']
  if (h < 210) return ['青', 'CYAN']
  if (h < 270) return ['藍', 'BLUE']
  if (h < 320) return ['紫', 'PURPLE']
  return ['粉', 'PINK']
}

// ================= B1 色彩資料 ≥ 10,000、染色配方 ≥ 100 =================
const realDb = JSON.parse(readFileSync(join(ROOT, 'public/private/color-db.json'), 'utf8')) as { records: { id: string; lab: Lab; dyes: [string, number][] }[] }
interface Colour { id: string; zh: string; en: string; lab: Lab; rgb: [number, number, number]; hex: string; family: string; base: string; src: string; dyes: [string, number][] }
const colours: Colour[] = []
const famCount: Record<string, number> = {}
const named = (lab: Lab) => { const [zh, en] = family(lab); famCount[en] = (famCount[en] ?? 0) + 1; return { zh: `${zh} ${pad(famCount[en], 4)}`, en: `${en} ${pad(famCount[en], 4)}`, family: zh } }
realDb.records.forEach((r, i) => {
  const lab = r.lab.map(r3) as Lab, rgb = lab2rgb(lab)
  colours.push({ id: `HIS-${pad(i + 1, 4)}`, ...named(lab), lab, rgb, hex: hex(rgb), base: 'PET', src: '歷史染色配方（去識別化）', dyes: r.dyes })
})
const BASES_SIM = ['PET', 'NYLON', 'PET/SP', 'NY/SP']
let s = 0
while (colours.length < 10_000) {
  const rgb: [number, number, number] = [int(0, 255), int(0, 255), int(0, 255)]
  const lab = rgb2lab(rgb)
  colours.push({ id: `SIM-${pad(++s, 5)}`, ...named(lab), lab, rgb, hex: hex(rgb), base: pick(BASES_SIM), src: '模擬色彩資料', dyes: [] })
}
withExtra(1, () => {
  while (colours.length < 10_500) {
    const rgb: [number, number, number] = [int(0, 255), int(0, 255), int(0, 255)]
    const lab = rgb2lab(rgb)
    colours.push({ id: `SIM-${pad(++s, 5)}`, ...named(lab), lab, rgb, hex: hex(rgb), base: pick(BASES_SIM), src: '模擬色彩資料', dyes: [] })
  }
})
const recipes = colours.filter((c) => c.dyes.length).map((c, i) => ({
  recipe_id: `RCP-${pad(i + 1, 4)}`,
  colour_id: c.id,
  base: c.base,
  dyes: c.dyes.map(([code, g]) => ({ code, grams_per_kg: g })),
  measured_lab: c.lab,
  recorded_at: addDays('2024-01-02', int(0, 1000)),
  source: c.src,
}))
out('b1/colours.json', { note: MARK, count: colours.length, real_deidentified: realDb.records.length, simulated: colours.length - realDb.records.length, colours: colours.map(({ dyes, ...c }) => c) })
out('b1/colours.csv', csv([['id', 'name_zh', 'name_en', 'family', 'L', 'a', 'b', 'R', 'G', 'B', 'hex', 'base', 'source'], ...colours.map((c) => [c.id, c.zh, c.en, c.family, ...c.lab, ...c.rgb, c.hex, c.base, c.src])]))
out('b1/recipes.json', { note: '真實染色配方去識別化（色名改為色系編號；保留 Lab 與染料用量）', count: recipes.length, recipes })
out('public/color-library/colors.json', { source: '色彩庫：歷史染色配方（去識別化）＋模擬色彩資料', records: colours.map((c) => ({ id: c.id, zh: c.zh, en: c.en, lab: c.lab, dyes: c.dyes, src: c.src, base: c.base })) })

// ================= A2 庫存 ≥ 1,000 捲 =================
const seedPairs = new Set(seed.fabricLabels.map((l: any) => `${l.productName}|${l.color}`))
const vendors = seed.vendors.map((v: any) => v.id)
const productPairs: { p: any; color: string }[] = []
const seenPair = new Set<string>()
for (const p of seed.products) for (const c of p.colors ?? []) {
  const k = `${p.productName}|${c.color}`
  if (seedPairs.has(k) || seenPair.has(k)) continue // 種子資料已有的組合不動，協作中心劇本的現貨結果維持原樣
  seenPair.add(k); productPairs.push({ p, color: c.color })
}
const stockPairs = shuffle(productPairs).slice(0, 110)
const NEW_ROLLS = 1100
const perPair = stockPairs.map(() => int(5, 13))
let diff = NEW_ROLLS - perPair.reduce((a, b) => a + b, 0)
for (let i = 0; diff !== 0; i = (i + 1) % perPair.length) { const d = diff > 0 ? 1 : -1; if (perPair[i] + d >= 3) { perPair[i] += d; diff -= d } }
const receipts: any[] = [], labels: any[] = []
const grTpl = seed.goodsReceipts.find((g: any) => g.status === '已完成') ?? seed.goodsReceipts[0]
const lblTpl = seed.fabricLabels[0]
let rcpt = 0, rollSerial = 5_100_000
stockPairs.forEach(({ p, color }, pi) => {
  let left = perPair[pi]
  while (left > 0) {
    const n = Math.min(left, int(6, 20)); left -= n
    rcpt++
    const id = `GR-OPEN-${pad(rcpt, 4)}`, date = addDays('2026-05-04', int(0, 190))
    const batches = [`批${int(1, 30)} P${int(100, 399)}`, `批${int(1, 30)} P${int(100, 399)}`]
    const meterUnit = rnd() < 0.1
    const code = `T${++rollSerial}`
    const rolls = Array.from({ length: n }, (_, k) => { const y = int(22, 118); return { rollNo: String(k + 1), batchCode: k < Math.ceil(n * (0.5 + rnd() * 0.5)) ? batches[0] : batches[1], length: meterUnit ? r1(y / YD_PER_M) : y, meter: r1(y / YD_PER_M), weight: r1(y * (p.weightGY || 200) / 1000), ocrConfidence: '人工輸入', reviewed: true } })
    receipts.push({ ...clone(grTpl), id, parentId: 'OPENING-STOCK', source: '直採大貨-成品', relatedDocType: undefined, relatedDocId: undefined, status: '已完成', receiptDate: dayIso(date), operatorAccountId: 'ACC-004', vendorId: pick(vendors), vendorShipmentNo: `V-${int(100000, 999999)}`, vendorShipDate: dayIso(addDays(date, -1)), receiptAttachmentName: 'opening-stock.pdf', rolls, pledgedQty: rolls.reduce((a, r) => a + (meterUnit ? r.meter : r.length), 0), purpose: '銷貨用', withdrawals: undefined })
    rolls.forEach((r, k) => {
      const u = rnd()
      labels.push({ ...clone(lblTpl), id: `${id}-L${k + 1}`, receiptId: id, rollCode: `${code}-${pad(k + 1, 2)}`, productName: p.productName, productId: p.id, composition: p.material, color, width: p.width, widthSpec: p.widthSpec, batchCode: r.batchCode, length: r.length, unit: meterUnit ? 'Meter' : 'Yard', status: u < 0.93 ? '在庫' : u < 0.97 ? '已完成' : '瑕疵／報廢', reservedFor: undefined, shipments: undefined, defectedAt: undefined, defectNote: u >= 0.97 ? '布面瑕疵（模擬）' : undefined, lengthHistory: undefined, splitFromRollCode: undefined, mergedFromRollCodes: undefined, mergedIntoRollCode: undefined, lossLength: undefined, _date: date })
    })
  }
})
const allLabels = [...seed.fabricLabels, ...labels]
const yd = (l: any) => (l.unit === 'Meter' ? l.length * YD_PER_M : l.length)
out('a2/inventory.csv', csv([['roll_code', 'receipt_id', 'erp_product_name', 'product_id', 'composition', 'color', 'width_in', 'batch', 'length', 'unit', 'length_yd', 'status', 'reserved_for', 'source'],
  ...allLabels.map((l: any) => [l.rollCode, l.receiptId, l.productName, l.productId, l.composition, l.color, l.width, l.batchCode, l.length, l.unit, r1(yd(l)), l.status, l.reservedFor ?? '', labels.includes(l) ? '模擬（期初庫存）' : 'ERP 種子資料'])]))

// ================= A1 客戶訂單（外部格式）＋ PI 對應；A2 媒合標準答案 =================
const custName: Record<string, string> = {}
for (const d of [...seed.proformaInvoices, ...seed.packingNotices]) if (d.customerId && d.customerName) custName[d.customerId] = d.customerName
const free = (l: any) => l.status === '在庫' && !l.reservedFor
const stockOf = (name: string, color: string) => allLabels.filter((l: any) => l.productName === name && l.color === color && free(l))
const pairsByCustomer: Record<string, { p: any; color: string }[]> = {}
for (const sp of stockPairs) if (sp.p.customerId && custName[sp.p.customerId]) (pairsByCustomer[sp.p.customerId] ??= []).push(sp)
const custIds = Object.keys(pairsByCustomer)
const COLOR_EN: Record<string, string> = { 正黑: 'JET BLACK', 象牙白: 'IVORY', 珍珠白: 'PEARL WHITE', 奶油白: 'CREAM', 天空藍: 'SKY BLUE', 深卡其: 'DARK KHAKI', 丁香紫: 'LILAC', 鵝黃: 'LIGHT YELLOW', 銀灰: 'SILVER GREY' }
const PACK_EXT = ['ROLL', 'FIXED 50M ROLL', 'FOLD', 'TUBE ROLL'] as const
const PACK_MAP: Record<string, string> = { ROLL: '捲支', 'FIXED 50M ROLL': '定碼ROLL可接疋', FOLD: '板捲', 'TUBE ROLL': '原疋捲' }
const INCOTERMS = ['FOB', 'CIF', 'EXW', 'CFR'] as const
const PORTS_EXT: Record<string, string> = { 'KEELUNG, TW': 'KEELUNG', 'TAICHUNG, TW': 'TAICHUNG', 'KAOHSIUNG, TW': 'KAOHSIUNG' }
const DESTS = ['HO CHI MINH, VIETNAM', 'LOS ANGELES, USA', 'NEW YORK, USA', 'HAMBURG, GERMANY', 'DHAKA, BANGLADESH', 'PHNOM PENH, CAMBODIA']
const leadDays = (ord: string, req: string) => { const d = (Date.parse(req) - Date.parse(ord)) / 86400000; return [30, 45, 60, 90].reduce((b, x) => (Math.abs(x - d) < Math.abs(b - d) ? x : b), 60) }
const orders: any[] = [], pis: any[] = [], annotations: (string | number)[][] = [], matching: any[] = []
const piTpl = seed.proformaInvoices[0]
for (let o = 1; o <= 30; o++) makeOrder(o)
withExtra(2, () => { for (let o = 31; o <= 45; o++) makeOrder(o, 1) }) // 新增 15 筆，每筆 1 行：45 筆、90 行
function makeOrder(o: number, maxLines?: number) {
  const cid = custIds[(o - 1) % custIds.length]
  const pairs = shuffle(pairsByCustomer[cid]).slice(0, maxLines ?? int(1, Math.min(4, pairsByCustomer[cid].length)))
  const orderDate = addDays('2026-09-01', int(0, 75)), reqDate = addDays(orderDate, pick([30, 45, 60, 90]) + int(-5, 5))
  const uom = rnd() < 0.25 ? 'MTR' : 'YDS', currency = pick(['USD', 'USD', 'EUR', 'RMB'] as const)
  const shortOrder = o % 5 === 0 // 每 5 筆有一筆刻意超過現貨，測試「庫存不足」的判斷
  const lines = pairs.map(({ p, color }, k) => {
    const avail = stockOf(p.productName, color).reduce((a: number, l: any) => a + yd(l), 0)
    const wantYd = shortOrder && k === 0 ? Math.round(avail + int(80, 300)) : Math.max(20, Math.round(avail * (0.15 + rnd() * 0.5)))
    const qty = uom === 'MTR' ? Math.round(wantYd / YD_PER_M) : wantYd
    const itemCode = String(p.customerProductName ?? '').split('#')[1] || p.productName
    return { line_no: k + 1, buyer_item_code: itemCode, description: `${p.finishedSpec ?? p.material}`.slice(0, 60), colour: COLOR_EN[color] ? `${COLOR_EN[color]}` : color, colour_zh: color, qty, uom, unit_price: r3(2 + rnd() * 6), packing: pick(PACK_EXT), _p: p, _color: color }
  })
  const po = `PO-${pad(26000 + o * 7, 5)}`
  const order = { order_no: po, order_date: orderDate, buyer: { company: custName[cid], contact: `Buyer ${o}`, email: `buyer${o}@example.com` }, ship_from: pick(Object.keys(PORTS_EXT)), ship_to: pick(DESTS), incoterm: pick(INCOTERMS), payment_terms: pick(['T/T 30 DAYS', 'L/C AT SIGHT', 'T/T IN ADVANCE']), currency, requested_delivery: reqDate, lines: lines.map(({ _p, _color, colour_zh, ...l }) => l) }
  orders.push(order)
  const piId = `PI-20261120-${pad(100 + o, 3)}`
  const items = lines.map((l) => {
    const yard = l.uom === 'MTR' ? Math.round(l.qty * YD_PER_M) : l.qty
    return { id: `${piId}-L${l.line_no}`, poNo: po, roricaProductName: l._p.productName, productId: l._p.id, customerProductName: l._p.customerProductName ?? l.buyer_item_code, color: l.colour_zh, yard, meter: r1(yard / YD_PER_M), unitPrice: l.unit_price, packingMethod: PACK_MAP[l.packing], colorRatios: [], note: '' }
  })
  pis.push({ ...clone(piTpl), id: piId, status: '草稿', createdAt: dayIso(orderDate), quoteValidUntil: dayIso(addDays(orderDate, 14)), approvedAt: undefined, rejections: undefined, signedBackAt: undefined, signedBackFileName: undefined, convertedAt: undefined, voidedAt: undefined, voidReason: undefined, previousPiId: undefined, replacedByPiId: undefined, customerId: cid, customerName: custName[cid], contactIndex: 0, currency, tradeTerm: order.incoterm, portOfLoading: PORTS_EXT[order.ship_from], destination: order.ship_to, leadTimeDays: leadDays(orderDate, reqDate), paymentTerm: order.payment_terms, itemUnit: 'Yard', items, markings: [], packingNoticeIds: [], manualHandling: undefined })
  // 逐欄標註（A1）
  const A = (field: string, value: unknown, erp: string, erpVal: unknown, rule: string) => annotations.push([po, '', field, String(value), erp, String(erpVal), rule])
  A('order_no', po, 'PI.items[].poNo', po, '原樣帶入')
  A('order_date', orderDate, 'PI.createdAt', orderDate, '日期')
  A('buyer.company', order.buyer.company, 'PI.customerId / customerName', `${cid} / ${custName[cid]}`, '以客戶名稱比對客戶主檔')
  A('ship_from', order.ship_from, 'PI.portOfLoading', PORTS_EXT[order.ship_from], '港口對照表（PI_PORTS）')
  A('ship_to', order.ship_to, 'PI.destination', order.ship_to, '原樣帶入')
  A('incoterm', order.incoterm, 'PI.tradeTerm', order.incoterm, '貿易條件（PI_TRADE_TERMS）')
  A('payment_terms', order.payment_terms, 'PI.paymentTerm', order.payment_terms, '原樣帶入')
  A('currency', currency, 'PI.currency', currency, '幣別（PI_CURRENCIES）')
  A('requested_delivery', reqDate, 'PI.leadTimeDays', leadDays(orderDate, reqDate), '交期天數取最接近的 30/45/60/90')
  lines.forEach((l, k) => {
    const L = (field: string, value: unknown, erp: string, erpVal: unknown, rule: string) => annotations.push([po, l.line_no, field, String(value), erp, String(erpVal), rule])
    L('buyer_item_code', l.buyer_item_code, 'PI.items[].roricaProductName / productId', `${l._p.productName} / ${l._p.id}`, '以「客戶品名」比對商品主檔')
    L('buyer_item_code', l.buyer_item_code, 'PI.items[].customerProductName', items[k].customerProductName, '客戶名稱#客戶品名')
    L('colour', l.colour, 'PI.items[].color', l.colour_zh, '色名對照（英→中）')
    L('qty + uom', `${l.qty} ${l.uom}`, 'PI.items[].yard / meter', `${items[k].yard} / ${items[k].meter}`, l.uom === 'MTR' ? '公尺換算碼（÷0.9144）' : '碼數原樣，公尺＝碼×0.9144')
    L('unit_price', l.unit_price, 'PI.items[].unitPrice', l.unit_price, '原樣帶入')
    L('packing', l.packing, 'PI.items[].packingMethod', items[k].packingMethod, '包裝方式對照表（PACKING_METHODS）')
    L('line_no', l.line_no, 'PI.items[].id', items[k].id, '明細編號＝PI 單號-L＋行號')
  })
  A('order_date', orderDate, 'PI.quoteValidUntil', addDays(orderDate, 14), '報價有效期＝下單日＋14 天')
  // A2 媒合標準答案
  matching.push({ order_no: po, pi_id: piId, lines: items.map((it) => ({ line_no: Number(it.id.split('-L')[1]), erp_product_name: it.roricaProductName, color: it.color, qty_yd: it.yard, expected: allocate(it.roricaProductName, it.color, it.yard) })) })
}
/** 參考配貨規則：同品名、同色、在庫且未預留；能由單一批號湊足時，取「湊得足的批號中總量最小者」，批內依捲號順序取到夠；
 *  任何單一批號都不足時，依入庫日期由舊到新跨批取；全部加總仍不足時判定為「庫存不足」。 */
function allocate(name: string, color: string, need: number) {
  const pool = stockOf(name, color)
  const byBatch = new Map<string, any[]>()
  pool.forEach((l: any) => (byBatch.get(l.batchCode ?? '') ?? byBatch.set(l.batchCode ?? '', []).get(l.batchCode ?? ''))!.push(l))
  const total = (xs: any[]) => xs.reduce((a, l) => a + yd(l), 0)
  const take = (xs: any[]) => { const res: any[] = []; let got = 0; for (const l of xs) { if (got >= need) break; res.push(l); got += yd(l) } return res }
  const enough = [...byBatch.values()].filter((xs) => total(xs) >= need).sort((a, b) => total(a) - total(b))
  const chosen = enough.length ? take([...enough[0]].sort((a, b) => a.rollCode.localeCompare(b.rollCode))) : total(pool) >= need ? take([...pool].sort((a: any, b: any) => (a._date ?? '').localeCompare(b._date ?? '') || a.rollCode.localeCompare(b.rollCode))) : []
  if (!chosen.length) return { result: 'shortage', available_yd: r1(total(pool)), shortfall_yd: r1(need - total(pool)) }
  return { result: enough.length ? 'allocated_single_batch' : 'allocated_mixed_batch', rolls: chosen.map((l: any) => l.rollCode), allocated_yd: r1(total(chosen)) }
}
out('a1/customer-orders.json', { note: MARK, count: orders.length, orders })
out('a1/field-annotations.csv', csv([['order_no', 'line_no', 'source_field', 'source_value', 'erp_field', 'erp_value', 'rule'], ...annotations]))
out('a2/matching-orders.json', { note: `${MARK}；expected 為依參考配貨規則（a2/README）算出的標準答案`, count: matching.length, lines: matching.reduce((a, x) => a + x.lines.length, 0), orders: matching })

// ---------------- ERP 工作區快照（種子＋新增）----------------
const strip = (o: any) => JSON.parse(JSON.stringify(o, (k, v) => (k.startsWith('_') ? undefined : v)))
const snapshot = { ...seed, goodsReceipts: [...seed.goodsReceipts, ...strip(receipts)], fabricLabels: [...seed.fabricLabels, ...strip(labels)], proformaInvoices: [...seed.proformaInvoices, ...pis] }
out('.generated/erp-snapshot.json', snapshot)

// ================= B2 歷史色配對 20 題、噴印圖檔 20 張 =================
const withRecipe = colours.filter((c) => c.dyes.length)
const nearest = (lab: Lab, pool = colours) => pool.reduce((best, c) => { const d = dE00(lab, c.lab); return d < best.d ? { c, d } : best }, { c: pool[0], d: Infinity })
const historyCase = (i: number) => {
  const base = pick(withRecipe)
  const target: Lab = [r3(base.lab[0] + (rnd() - 0.5) * 1.2), r3(base.lab[1] + (rnd() - 0.5) * 1.2), r3(base.lab[2] + (rnd() - 0.5) * 1.2)]
  const n = nearest(target, withRecipe)
  return { case_id: `B2-H-${pad(i + 1, 2)}`, target_lab: target, expected_colour_id: n.c.id, expected_dE00: r3(n.d), pass_rule: '系統回傳的最接近色號＝expected_colour_id' }
}
const historyCases = Array.from({ length: 20 }, (_, i) => historyCase(i))
withExtra(3, () => { for (let i = 20; i < 30; i++) historyCases.push(historyCase(i)) })
out('b2/history-match-cases.json', { note: `${MARK}；目標色由歷史配方色加小幅擾動產生`, count: historyCases.length, cases: historyCases })
function png(w: number, h: number, px: (x: number, y: number) => number[]): Buffer {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const [r, g, b] = px(x, y); raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3) } }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }
  const chunk = (t: string, d: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]) }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}
const PATTERNS = ['stripes', 'checks', 'dots', 'waves', 'blocks'] as const
const printCases = Array.from({ length: 20 }, (_, i) => {
  const palette = Array.from({ length: int(3, 5) }, () => pick(colours.slice(0, 10_000)).rgb) // 原本 10,000 色時挑的顏色；標準答案仍對全部色彩庫計算
  const pat = PATTERNS[i % PATTERNS.length], W = 256
  const px = (x: number, y: number) => {
    const k = pat === 'stripes' ? Math.floor(x / 32) : pat === 'checks' ? Math.floor(x / 32) + Math.floor(y / 32) : pat === 'dots' ? (Math.hypot((x % 64) - 32, (y % 64) - 32) < 14 ? 1 + (Math.floor(x / 64) % (palette.length - 1)) : 0) : pat === 'waves' ? Math.floor((y + 20 * Math.sin(x / 18)) / 40) : Math.floor(x / 64) * 3 + Math.floor(y / 86)
    return palette[((k % palette.length) + palette.length) % palette.length]
  }
  const file = `b2/print-images/print-${pad(i + 1, 2)}.png`
  out(file, png(W, W, px))
  return { case_id: `B2-P-${pad(i + 1, 2)}`, image: file, pattern: pat, palette: palette.map((rgb) => { const lab = rgb2lab(rgb); const n = nearest(lab); return { rgb, hex: hex(rgb), lab, expected_colour_id: n.c.id, expected_dE00: r3(n.d) } }), pass_rule: '圖中每個顏色都配到 expected_colour_id（或 ΔE00 ≤ 1.0 的色號）' }
})
out('b2/print-match-cases.json', { note: `${MARK}；圖檔為程式產生的幾何印花，每張 3～5 色`, count: printCases.length, cases: printCases })

// ================= C1-2 Agent Card（JWS）、DataPart Schema =================
const AGENTS = [
  { key: 'order-intake', zh: '接單代理人', desc: 'Reads customer purchase orders, maps them to ERP proforma invoices and checks stock.', skills: [['map-order', 'Map a purchase order to an ERP PI', ['order', 'pi']], ['check-stock', 'Check free stock for order lines', ['inventory']]] },
  { key: 'production', zh: '生管代理人', desc: 'Plans production: allocates rolls, or routes a line to digital printing or dyeing.', skills: [['allocate-rolls', 'Allocate rolls to order lines', ['inventory', 'allocation']], ['route-line', 'Route a line: stock / print / dye', ['planning']]] },
  { key: 'color-control', zh: '色控代理人', desc: 'Matches colours to historical recipes and print palettes; returns ΔE00 and recipes.', skills: [['match-history-colour', 'Find the closest historical colour', ['colour', 'lab']], ['match-print-palette', 'Match a print image palette', ['print', 'colour']]] },
  { key: 'shipping', zh: '出貨代理人', desc: 'Builds shipping orders from allocated rolls and reports shipment status.', skills: [['create-shipment', 'Create a shipping order', ['shipping']], ['release-reservation', 'Release reserved rolls (compensation)', ['inventory', 'compensation']]] },
] as const
const keyFile = join(OUT, '.keys/a2a-signing-key.jwk.json')
let jwkPriv: any
if (existsSync(keyFile)) jwkPriv = JSON.parse(readFileSync(keyFile, 'utf8'))
else { const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' }); jwkPriv = privateKey.export({ format: 'jwk' }); mkdirSync(dirname(keyFile), { recursive: true }); writeFileSync(keyFile, JSON.stringify(jwkPriv)) }
const pubJwk = createPublicKey({ key: jwkPriv, format: 'jwk' }).export({ format: 'jwk' }) as any
const kid = createHash('sha256').update(JSON.stringify({ crv: pubJwk.crv, kty: pubJwk.kty, x: pubJwk.x, y: pubJwk.y })).digest('base64url').slice(0, 16)
const jcs = (v: any): string => (v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(jcs).join(',')}]` : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`)
const b64u = (s: string | Buffer) => Buffer.from(s).toString('base64url')
const cards = AGENTS.map((a) => {
  const card: any = {
    protocolVersion: '0.3.0', name: `RORICA ${a.key}`, description: `${a.zh}：${a.desc}`, url: `${SITE}/a2a/${a.key}`, preferredTransport: 'JSONRPC', version: '0.1.0',
    provider: { organization: 'RORICA ERP prototype', url: SITE },
    capabilities: { streaming: false, pushNotifications: false, stateTransitionHistory: true },
    defaultInputModes: ['application/json', 'text/plain'], defaultOutputModes: ['application/json'],
    securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } }, security: [{ bearer: [] }],
    skills: a.skills.map(([id, name, tags]) => ({ id, name, description: name, tags, inputModes: ['application/json'], outputModes: ['application/json'] })),
  }
  const protectedHeader = b64u(JSON.stringify({ alg: 'ES256', typ: 'JOSE', kid, jku: `${SITE}/a2a/jwks.json` }))
  const payload = b64u(jcs(card))
  const sig = sign('sha256', Buffer.from(`${protectedHeader}.${payload}`), { key: createPrivateKey({ key: jwkPriv, format: 'jwk' }), dsaEncoding: 'ieee-p1363' })
  card.signatures = [{ protected: protectedHeader, signature: sig.toString('base64url') }]
  out(`c1/agent-cards/${a.key}.json`, card)
  out(`public/a2a/${a.key}/.well-known/agent-card.json`, card)
  return card
})
out('public/a2a/jwks.json', { keys: [{ ...pubJwk, kid, use: 'sig', alg: 'ES256' }] })
out('c1/agent-cards/jwks.json', { keys: [{ ...pubJwk, kid, use: 'sig', alg: 'ES256' }] })
const registry = { note: '服務發現：各代理人的 Agent Card 位置（/.well-known/agent-card.json）與技能；名片簽章以 jwks_url 的公鑰驗證', jwks_url: `${SITE}/a2a/jwks.json`, agents: AGENTS.map((a) => ({ key: a.key, name: a.zh, card_url: `${SITE}/a2a/${a.key}/.well-known/agent-card.json`, skills: a.skills.map(([id]) => id) })) }
out('c1/agent-cards/registry.json', registry)
out('public/a2a/registry.json', registry) // 線上服務發現：${SITE}/a2a/registry.json
const S = (id: string, title: string, props: any, required: string[]) => ({ $schema: 'https://json-schema.org/draft/2020-12/schema', $id: `${SITE}/a2a/schemas/${id}.schema.json`, title, type: 'object', additionalProperties: false, required, properties: props })
const line = { type: 'object', additionalProperties: false, required: ['line_no', 'erp_product_name', 'color', 'qty_yd'], properties: { line_no: { type: 'integer', minimum: 1 }, erp_product_name: { type: 'string' }, product_id: { type: 'string' }, color: { type: 'string' }, qty_yd: { type: 'number', exclusiveMinimum: 0 }, target_lab: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 } } }
const schemas = [
  S('order-intake', '接單：訂單（接單代理人 → 生管代理人）', { kind: { const: 'order-intake' }, context_id: { type: 'string' }, order_no: { type: 'string' }, pi_id: { type: 'string' }, customer_id: { type: 'string' }, requested_delivery: { type: 'string', format: 'date' }, lines: { type: 'array', minItems: 1, items: line } }, ['kind', 'context_id', 'order_no', 'lines']),
  S('colour-request', '色控：配色請求與結果（生管代理人 ↔ 色控代理人）', { kind: { enum: ['colour-request', 'colour-result'] }, context_id: { type: 'string' }, line_no: { type: 'integer' }, mode: { enum: ['history', 'print'] }, target_lab: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 3 }, image_ref: { type: 'string' }, result: { type: 'object', properties: { colour_id: { type: 'string' }, dE00: { type: 'number', minimum: 0 }, recipe_id: { type: 'string' }, pass: { type: 'boolean' } } } }, ['kind', 'context_id', 'line_no', 'mode']),
  S('shipment', '出貨：出貨與預留（生管代理人 → 出貨代理人）', { kind: { enum: ['shipment-request', 'shipment-result', 'release-reservation'] }, context_id: { type: 'string' }, order_no: { type: 'string' }, rolls: { type: 'array', items: { type: 'object', required: ['roll_code', 'qty_yd'], properties: { roll_code: { type: 'string' }, qty_yd: { type: 'number' } } } }, status: { enum: ['reserved', 'shipped', 'released', 'failed'] }, error_code: { type: 'string' } }, ['kind', 'context_id', 'order_no']),
]
schemas.forEach((sc, i) => { const id = ['order-intake', 'colour-request', 'shipment'][i]; out(`c1/schemas/${id}.schema.json`, sc); out(`public/a2a/schemas/${id}.schema.json`, sc) })

// ================= C 系列測試輸入 =================
const inStockPairs = stockPairs.filter(({ p, color }) => stockOf(p.productName, color).reduce((a: number, l: any) => a + yd(l), 0) > 200)
const withLab = (c: Colour) => c.lab
const ctxOf = (n: number) => `ctx-ORD-${pad(n, 5)}`
const msgId = () => [8, 4, 4, 4, 12].map((n) => Array.from({ length: n }, () => '0123456789abcdef'[int(0, 15)]).join('')).join('-')
// C2-1：三類情境各 15（原本各 10；新增的各 5 筆排在各類之後）
const fieldS = (i: number) => { const { p, color } = inStockPairs[i % inStockPairs.length]; const avail = stockOf(p.productName, color).reduce((a: number, l: any) => a + yd(l), 0); return { case_id: `C2-1-S-${pad(i + 1, 2)}`, route: 'in_stock', erp_product_name: p.productName, color, qty_yd: Math.round(avail * 0.3), expected: { route: 'in_stock', allocation: allocate(p.productName, color, Math.round(avail * 0.3)) } } }
const fieldP = (i: number) => { const pc = printCases[i]; return { case_id: `C2-1-P-${pad(i + 1, 2)}`, route: 'print', base_fabric: 'PET 白胚（噴印用）', image: pc.image, qty_yd: int(60, 400), expected: { route: 'print', palette: pc.palette.map((x) => x.expected_colour_id) } } }
const fieldD = (i: number) => { const hc = historyCases[i + 10]; return { case_id: `C2-1-D-${pad(i + 1, 2)}`, route: 'dye', base_fabric: 'PET 胚布', target_lab: hc.target_lab, qty_yd: int(200, 1200), expected: { route: 'dye', colour_id: hc.expected_colour_id, recipe_id: recipes.find((r) => r.colour_id === hc.expected_colour_id)?.recipe_id ?? null } } }
const field0 = [
  ...Array.from({ length: 10 }, (_, i) => { const { p, color } = inStockPairs[i % inStockPairs.length]; const avail = stockOf(p.productName, color).reduce((a: number, l: any) => a + yd(l), 0); return { case_id: `C2-1-S-${pad(i + 1, 2)}`, route: 'in_stock', erp_product_name: p.productName, color, qty_yd: Math.round(avail * 0.3), expected: { route: 'in_stock', allocation: allocate(p.productName, color, Math.round(avail * 0.3)) } } }),
  ...Array.from({ length: 10 }, (_, i) => { const pc = printCases[i]; return { case_id: `C2-1-P-${pad(i + 1, 2)}`, route: 'print', base_fabric: 'PET 白胚（噴印用）', image: pc.image, qty_yd: int(60, 400), expected: { route: 'print', palette: pc.palette.map((x) => x.expected_colour_id) } } }),
  ...Array.from({ length: 10 }, (_, i) => { const hc = historyCases[i + 10]; return { case_id: `C2-1-D-${pad(i + 1, 2)}`, route: 'dye', base_fabric: 'PET 胚布', target_lab: hc.target_lab, qty_yd: int(200, 1200), expected: { route: 'dye', colour_id: hc.expected_colour_id, recipe_id: recipes.find((r) => r.colour_id === hc.expected_colour_id)?.recipe_id ?? null } } }),
]
const [fS, fP, fD] = withExtra(4, () => [
  [...field0.slice(0, 10), ...Array.from({ length: 5 }, (_, k) => fieldS(10 + k))],
  [...field0.slice(10, 20), ...Array.from({ length: 5 }, (_, k) => fieldP(10 + k))],
  [...field0.slice(20, 30), ...Array.from({ length: 5 }, (_, k) => fieldD(10 + k))],
])
const field = [...fS, ...fP, ...fD]
out('c2/field-scenarios.json', { note: `${MARK}；場域驗證前的演練輸入，正式驗證須在合作廠商現場進行`, count: field.length, cases: field })
// C1-1：100 筆兩模型交辦任務
const SKILL_FLOW = [['order-intake', 'production', 'allocate-rolls'], ['production', 'color-control', 'match-history-colour'], ['production', 'color-control', 'match-print-palette'], ['production', 'shipping', 'create-shipment'], ['order-intake', 'production', 'route-line']] as const
const task = (i: number) => {
  const [from, to, skill] = SKILL_FLOW[i % SKILL_FLOW.length]
  const input = skill === 'match-history-colour' ? { kind: 'colour-request', mode: 'history', line_no: 1, target_lab: historyCases[i < 100 ? i % 20 : 20 + (i % 10)].target_lab } : skill === 'match-print-palette' ? { kind: 'colour-request', mode: 'print', line_no: 1, image_ref: printCases[i % 20].image } : { kind: 'order-intake', order_no: orders[i < 100 ? i % 30 : 30 + (i % 15)].order_no, lines: matching[i < 100 ? i % 30 : 30 + (i % 15)].lines.map((l: any) => ({ line_no: l.line_no, erp_product_name: l.erp_product_name, color: l.color, qty_yd: l.qty_yd })) }
  return { task_no: i + 1, messageId: msgId(), contextId: ctxOf(1000 + i), from: { agent: from, model: i % 2 ? 'model-b' : 'model-a' }, to: { agent: to, model: i % 2 ? 'model-a' : 'model-b' }, skill, input: { ...input, context_id: ctxOf(1000 + i) }, expected_terminal_state: 'completed' }
}
const tasks = Array.from({ length: 100 }, (_, i) => task(i))
withExtra(5, () => { for (let i = 100; i < 125; i++) tasks.push(task(i)) }) // 125 筆：每種技能 25
out('c1/a2a-tasks.json', { note: `${MARK}；model-a／model-b 代表兩個不同的 AI 模型（實際採用哪兩個待確認）`, count: tasks.length, tasks })
// C2-3：120 筆端到端（原 100 筆＋有現貨 20 筆；有現貨不經色控）
const e2e = Array.from({ length: 120 }, (_, i) => {
  const route = i >= 100 ? 'in_stock' : i % 10 < 6 ? 'in_stock' : i % 10 < 8 ? 'print' : 'dye'
  const base = i >= 100 ? fS[(i - 100) % 15] : route === 'in_stock' ? fS[i % 10] : route === 'print' ? fP[i % 10] : fD[i % 10]
  return { order_no: `E2E-${pad(i + 1, 3)}`, contextId: ctxOf(i + 1), route, input: { ...base, case_id: undefined }, expected_stages: ['接單', '生管', '色控', '出貨'], expected_final: 'shipped' }
})
out('c2/e2e-orders.json', { note: `${MARK}；contextId 即訂單追溯索引`, count: e2e.length, orders: e2e })
// C2-2：50 項一致性測試定義
const T = (cat: string, title: string, steps: string, expected: string) => ({ cat, title, steps, expected })
const conf = [
  T('Agent Card', '四個代理人的 Agent Card 可由 /.well-known/agent-card.json 取得', 'GET 各代理人 card_url', 'HTTP 200，JSON 符合 AgentCard 欄位'),
  T('Agent Card', 'Agent Card 的 JWS 簽章驗證通過', '以 jwks.json 公鑰驗證 signatures[0]', '驗證成功'),
  T('Agent Card', '竄改 Agent Card 任一欄位後簽章驗證失敗', '改 description 後驗證', '驗證失敗'),
  T('Agent Card', 'Agent Card 的 kid 能在 jku 指向的 JWKS 找到', '比對 kid', '找到對應公鑰'),
  T('Agent Card', '服務發現：依技能找得到負責的代理人', '查 registry，找 skill=match-history-colour', '回傳 color-control'),
  T('訊息格式', 'message/send 回傳 Task 物件', '送合法 message', 'result.kind=task，含 id、contextId、status'),
  T('訊息格式', '缺少 messageId 的請求被拒絕', '送無 messageId 的 message', 'JSON-RPC -32602 Invalid params'),
  T('訊息格式', '非 JSON 的請求', '送無法解析的 body', 'JSON-RPC -32700 Parse error'),
  T('訊息格式', '不存在的方法', 'method=foo/bar', 'JSON-RPC -32601 Method not found'),
  T('訊息格式', '不支援的內容類型', 'part 為 image/tiff 給只收 JSON 的技能', '-32005 ContentTypeNotSupported'),
  ...['submitted→working', 'working→completed', 'working→input-required', 'input-required→working', 'working→failed', 'submitted→canceled', 'working→canceled', 'submitted→rejected'].map((t) => T('狀態轉換', `合法轉換 ${t}`, `觸發 ${t}`, '狀態依序記錄於 history，時間遞增')),
  ...['completed→working', 'failed→completed', 'canceled→working', 'rejected→working'].map((t) => T('狀態轉換', `終態不可再轉換 ${t}`, `對終態任務送新訊息`, '拒絕並回錯誤，狀態不變')),
  T('錯誤代碼', '查詢不存在的任務', 'tasks/get 不存在的 id', '-32001 TaskNotFound'),
  T('錯誤代碼', '取消已完成的任務', 'tasks/cancel completed 任務', '-32002 TaskNotCancelable'),
  T('錯誤代碼', '要求推播但代理人不支援', 'tasks/pushNotificationConfig/set', '-32003 PushNotificationNotSupported'),
  T('錯誤代碼', '呼叫未實作的操作', '不支援的 method 變體', '-32004 UnsupportedOperation'),
  T('錯誤代碼', '對方代理人回應格式錯誤', '模擬下游回非法 JSON', '-32006 InvalidAgentResponse'),
  T('錯誤代碼', '未帶憑證', '無 Authorization', 'HTTP 401'),
  T('錯誤代碼', '憑證過期', '過期 JWT', 'HTTP 401'),
  T('錯誤代碼', '內部錯誤', '模擬資料庫失敗', '-32603 Internal error，任務 failed 並記錄錯誤代碼'),
  T('錯誤代碼', 'DataPart 不符 Schema', 'order-intake 缺 lines', '-32602 Invalid params，附 Schema 錯誤位置'),
  T('錯誤代碼', '數量為 0', 'qty_yd=0', '-32602 Invalid params'),
  ...Array.from({ length: 6 }, (_, i) => T('冪等性', `同一 messageId 重送（情境 ${i + 1}：${['立即重送', '30 秒後重送', '任務完成後重送', '不同連線重送', '並行重送 2 次', '重送但 body 不同'][i]}）`, '以相同 messageId 再送', i === 5 ? '拒絕（同 id 不同內容）且不建新任務' : '回原任務，不建第二個任務')),
  ...Array.from({ length: 6 }, (_, i) => T('補償機制', `任務失敗時釋放預留庫存（${['出貨失敗', '色控失敗', '逾時', '人工取消', '下游代理人錯誤', '部分配貨後失敗'][i]}）`, '先預留布卷再讓任務失敗', '預留布卷全部釋放，release-reservation 紀錄完整')),
  ...['order-intake', 'colour-request', 'shipment'].flatMap((id) => [T('Schema', `${id} 合法範例通過驗證`, '以範例驗證', '通過'), T('Schema', `${id} 多餘欄位被拒`, '加未定義欄位', '不通過')]),
  T('追溯', '以 contextId 匯出完整軌跡', '查 contextId', '含四個代理人的所有訊息與狀態轉換'),
  T('追溯', '失敗任務留有錯誤代碼與狀態轉換', '查失敗任務', 'error_code 與 history 皆存在'),
]
out('c2/conformance-tests.json', { note: '介面一致性測試項目（測試定義，不是結果）', count: conf.length, tests: conf.map((t, i) => ({ id: `C2-2-${pad(i + 1, 2)}`, ...t })) })

// ================= 說明 =================
out('README.md', `# 成果查核點：模擬資料

產生方式：\`npx tsx --tsconfig tsconfig.app.json tools/checkpoint/generate.mts\`（固定亂數種子，重跑結果相同）。
產生日期：${TODAY}（2026-11-26 擴充：訂單 45、色彩 10,500、歷史色 30、任務 125、情境 3×15、端到端 120；原有資料逐筆不變）

**這裡全部是輸入資料，不是測試結果。** 各項的測試紀錄與通過率，要由系統實際執行這些輸入後產生。
除 B1 標示「去識別化」的部分外，皆為${MARK}。

| 查核點 | 檔案 | 數量 |
|---|---|---|
| A1 訂單欄位對應 | a1/customer-orders.json（外部訂單格式）、a1/field-mapping.md（規格）、a1/field-annotations.csv（逐欄標註）| ${orders.length} 筆訂單、${annotations.length} 筆標註 |
| A1 → ERP | ${pis.length} 筆訂單已轉成 ERP 的 PI（狀態「草稿」，編號 PI-20261120-101～${100 + pis.length}）| ${pis.length} 張 |
| A2 庫存 | a2/inventory.csv；已載入 ERP 工作區 | ${allLabels.length} 捲（新增 ${labels.length}、入庫單 ${receipts.length} 張）|
| A2 媒合 | a2/matching-orders.json（含參考配貨規則算出的標準答案）| ${matching.length} 筆訂單、${matching.reduce((a, x) => a + x.lines.length, 0)} 行 |
| B1 色彩 | b1/colours.json / .csv；ERP 讀 public/color-library/colors.json | ${colours.length} 筆（去識別化真實 ${realDb.records.length}、模擬 ${colours.length - realDb.records.length}）|
| B1 配方 | b1/recipes.json | ${recipes.length} 筆 |
| B2 歷史色配對 | b2/history-match-cases.json | ${historyCases.length} 題 |
| B2 噴印配色 | b2/print-images/*.png、b2/print-match-cases.json | ${printCases.length} 張 |
| C1-1 兩模型交辦 | c1/a2a-tasks.json | ${tasks.length} 筆 |
| C1-2 Agent Card | c1/agent-cards/*.json（JWS ES256 簽章）、jwks.json、registry.json；線上 ${SITE}/a2a/<agent>/.well-known/agent-card.json | 4 份 |
| C1-2 DataPart Schema | c1/schemas/*.schema.json | 3 份 |
| C2-1 場域情境 | c2/field-scenarios.json | 3 類 × ${fS.length} |
| C2-2 一致性測試 | c2/conformance-tests.json | ${conf.length} 項 |
| C2-3 端到端 | c2/e2e-orders.json（contextId 為追溯索引）| ${e2e.length} 筆 |

## 去識別化（B1）
真實來源為皇加的 PET 染色配方（不進 git）。原色名含品牌／客戶的色卡名稱，一律改為「色系＋編號」（例如「藍 0012」），
色號改為 HIS-0001 起；保留 Lab 與染料代號、用量。

## A2 參考配貨規則
同品名、同色、在庫且未預留的布卷；能由單一批號湊足時，取「湊得足的批號中總量最小者」，批內依捲號順序取到夠；
任何單一批號都不足時，依入庫日期由舊到新跨批取；全部加總仍不足時判定「庫存不足」（每 5 筆訂單有 1 筆刻意不足）。

## 簽章金鑰
Agent Card 以 ES256 簽章，公鑰在 jwks.json；私鑰只在本機 checkpoint-data/.keys/（不進 git）。驗證：\`node tools/checkpoint/verify-cards.mjs\`。
`)
out('a1/field-mapping.md', `# 客戶訂單 → ERP PI 欄位對應規格

${MARK}。客戶訂單格式見 customer-orders.json；逐欄標註見 field-annotations.csv。

| 客戶訂單欄位 | ERP PI 欄位 | 轉換規則 |
|---|---|---|
| order_no | items[].poNo | 原樣帶入 |
| order_date | createdAt | 日期 |
| buyer.company | customerId、customerName | 以客戶名稱比對客戶主檔 |
| ship_from | portOfLoading | 港口對照（KEELUNG／TAIPEI／TAICHUNG／KAOHSIUNG）|
| ship_to | destination | 原樣帶入 |
| incoterm | tradeTerm | 貿易條件（EXW、FOB、CFR、CIF…）|
| payment_terms | paymentTerm | 原樣帶入 |
| currency | currency | USD／RMB／NTD／EUR／HKD |
| requested_delivery | leadTimeDays | 與下單日相差天數，取最接近的 30／45／60／90 |
| lines[].buyer_item_code | items[].roricaProductName、productId、customerProductName | 以「客戶名稱#客戶品名」比對商品主檔 |
| lines[].colour | items[].color | 英文色名對照 ERP 中文色名 |
| lines[].qty＋uom | items[].yard、meter | YDS 原樣；MTR ÷ 0.9144 換碼；公尺＝碼 × 0.9144 |
| lines[].unit_price | items[].unitPrice | 原樣帶入 |
| lines[].packing | items[].packingMethod | ROLL→捲支、FIXED 50M ROLL→定碼ROLL可接疋、FOLD→板捲、TUBE ROLL→原疋捲 |
| lines[].line_no | items[].id | 明細編號＝PI 單號-L＋行號 |
| order_date | quoteValidUntil | 報價有效期＝下單日＋14 天 |
`)
console.log(JSON.stringify({ colours: colours.length, recipes: recipes.length, newRolls: labels.length, totalRolls: allLabels.length, inStock: allLabels.filter(free).length, receipts: receipts.length, orders: orders.length, pis: pis.length, annotations: annotations.length, matchingLines: matching.reduce((a, x) => a + x.lines.length, 0), shortage: matching.flatMap((x) => x.lines).filter((l: any) => l.expected.result === 'shortage').length, printCases: printCases.length, tasks: tasks.length, conf: conf.length, e2e: e2e.length, snapshotKB: Math.round(JSON.stringify(snapshot).length / 1024) }, null, 1))

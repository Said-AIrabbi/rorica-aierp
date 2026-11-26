// A2 媒合測試：30 筆訂單（75 行）交給 ERP 的配貨程式（表1 包裝通知單用的 availableFabricLabels＋allocateWholeRolls），
// 再以「規則判定」逐行檢查是否配對正確。判定用的可用布卷由 a2/inventory.csv 獨立計算，不經 ERP 程式。
//   npx tsx --tsconfig tsconfig.app.json tools/checkpoint/run-a2.mts
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { availableFabricLabels, allocateWholeRolls } from '../../src/lib/inventory'
import type { FabricLabel, StockReservation } from '../../src/types'

/** RFC 4180 CSV（欄位可含引號、逗號） */
function parseCsv(s: string): string[][] {
  const rows: string[][] = []; let row: string[] = [], cur = '', q = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (q) { if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') q = false; else cur += ch }
    else if (ch === '"') q = true
    else if (ch === ',') { row.push(cur); cur = '' }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && s[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x !== '')) rows.push(row); row = [] }
    else cur += ch
  }
  if (cur || row.length) { row.push(cur); rows.push(row) }
  return rows
}

async function main() {
  const lib = await import('file:///' + join(process.cwd(), 'tools/checkpoint/lib.mjs').replace(/\\/g, '/'))
  const { CP, readJson, writeOut, writeCsv, pct } = lib
  const snap = JSON.parse(readFileSync(join(CP, '.generated/erp-snapshot.json'), 'utf8'))
  const data = snap.data ?? snap
  const labels: FabricLabel[] = data.fabricLabels
  const baseReservations: StockReservation[] = data.stockReservations

  // 判定用的獨立資料：inventory.csv
  const csv = parseCsv(readFileSync(join(CP, 'a2/inventory.csv'), 'utf8').replace(/^﻿/, ''))
  const head = csv[0]
  const col = (n: string) => head.indexOf(n)
  const inv = csv.slice(1).map((r) => ({ roll: r[col('roll_code')], name: r[col('erp_product_name')], color: r[col('color')], yd: Number(r[col('length_yd')]), status: r[col('status')], reservedFor: r[col('reserved_for')] }))

  const orders = readJson('a2/matching-orders.json').orders as any[]
  const ranAt = new Date().toISOString()
  const lines: any[] = []
  for (const o of orders) {
    // 同一筆訂單內依行序配貨：前一行配走的布卷，後一行不能再用（模擬表1 逐行預留）
    const reservations: StockReservation[] = [...baseReservations]
    const usedInOrder = new Set<string>()
    for (const l of o.lines) {
      const t0 = performance.now()
      const available = availableFabricLabels(l.erp_product_name, l.color, labels, reservations)
      const chosen = allocateWholeRolls(l.qty_yd, available)
      const ms = performance.now() - t0
      if (chosen) {
        reservations.push({ id: `A2-${o.order_no}-${l.line_no}`, packingNoticeId: o.order_no, packingNoticeItemId: String(l.line_no), rollCodes: chosen.map((c) => c.rollCode), status: '預留中', createdAt: ranAt, expiresAt: new Date(Date.now() + 14 * 864e5).toISOString() } as unknown as StockReservation)
      }
      // ---- 規則判定（獨立計算）----
      const pool = inv.filter((r) => r.name === l.erp_product_name && r.color === l.color && r.status === '在庫' && !r.reservedFor && !usedInOrder.has(r.roll))
      const poolYd = pool.reduce((a, r) => a + r.yd, 0)
      const inPool = new Map(pool.map((r) => [r.roll, r]))
      const checks: Record<string, boolean> = {}
      let verdict: string
      if (poolYd >= l.qty_yd) {
        const rolls = chosen ?? []
        const yd = rolls.reduce((a, r) => a + (inPool.get(r.rollCode)?.yd ?? 0), 0)
        checks.has_result = !!chosen
        checks.same_product_colour_free = rolls.every((r) => inPool.has(r.rollCode))
        checks.no_duplicate = new Set(rolls.map((r) => r.rollCode)).size === rolls.length
        checks.covers_qty = yd >= l.qty_yd
        checks.no_extra_roll = rolls.length === 0 || yd - Math.min(...rolls.map((r) => inPool.get(r.rollCode)?.yd ?? 0)) < l.qty_yd
        verdict = 'allocated'
      } else {
        checks.reports_shortage = chosen === null
        verdict = 'shortage'
      }
      const pass = Object.values(checks).every(Boolean)
      ;(chosen ?? []).forEach((r) => usedInOrder.add(r.rollCode))
      lines.push({
        order_no: o.order_no, pi_id: o.pi_id, line_no: l.line_no, erp_product_name: l.erp_product_name, color: l.color, qty_yd: l.qty_yd,
        free_stock_yd: Math.round(poolYd * 10) / 10, expected_outcome: verdict, reference_answer: o.lines.find((x: any) => x.line_no === l.line_no).expected.result,
        erp_result: chosen ? 'allocated' : 'shortage', erp_rolls: (chosen ?? []).map((r) => r.rollCode), erp_allocated_yd: (chosen ?? []).reduce((a, r) => a + r.length, 0),
        checks, pass, ms: Math.round(ms * 100) / 100,
      })
    }
  }
  const byOrder = orders.map((o) => ({ order_no: o.order_no, pi_id: o.pi_id, lines: o.lines.length, pass: lines.filter((l) => l.order_no === o.order_no).every((l) => l.pass) }))
  const outcomeAgree = lines.filter((l) => (l.reference_answer === 'shortage') === (l.erp_result === 'shortage')).length
  const sameRolls = lines.filter((l) => { const ref = orders.find((o) => o.order_no === l.order_no).lines.find((x: any) => x.line_no === l.line_no).expected.rolls ?? []; return ref.length === l.erp_rolls.length && ref.every((r: string) => l.erp_rolls.includes(r)) }).length
  const summary = {
    ran_at: ranAt, method: 'ERP availableFabricLabels + allocateWholeRolls（表1 不接疋路徑）；規則判定', orders: orders.length, lines: lines.length,
    order_pass: byOrder.filter((o) => o.pass).length, order_accuracy: pct(byOrder.filter((o) => o.pass).length, orders.length),
    line_pass: lines.filter((l) => l.pass).length, line_accuracy: pct(lines.filter((l) => l.pass).length, lines.length),
    shortage_lines: lines.filter((l) => l.expected_outcome === 'shortage').length,
    agrees_with_reference_outcome: outcomeAgree, same_rolls_as_reference: sameRolls, threshold: 90,
  }
  writeOut('a2/matching-results.json', { ...summary, orders: byOrder, lines })
  writeCsv('a2/matching-results.csv', ['訂單', 'PI', '行', '品名', '顏色', '需求碼', '可用庫存碼', '應有結果', 'ERP 結果', 'ERP 配到布卷', 'ERP 配到碼', '檢查', '判定'],
    lines.map((l) => [l.order_no, l.pi_id, l.line_no, l.erp_product_name, l.color, l.qty_yd, l.free_stock_yd, l.expected_outcome === 'shortage' ? '庫存不足' : '可配貨', l.erp_result === 'shortage' ? '庫存不足' : '已配貨', l.erp_rolls.join(' '), l.erp_allocated_yd, Object.entries(l.checks).map(([k, v]) => `${k}:${v ? 'ok' : 'NG'}`).join(' '), l.pass ? 'PASS' : 'FAIL']))
  console.log(JSON.stringify(summary, null, 1))
  for (const l of lines.filter((x) => !x.pass)) console.log('FAIL', JSON.stringify(l))
}
main()

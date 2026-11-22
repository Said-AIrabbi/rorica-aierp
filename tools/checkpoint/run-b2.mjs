// B2 測試：①歷史色配對 20 題 ②噴印圖檔配色 20 張（另跑加雜訊版本檢驗穩定度）
//   node tools/checkpoint/run-b2.mjs
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CP, readJson, writeOut, writeCsv, ColourMatch, decodePng, r3, pct } from './lib.mjs'

const { nearest, matchPrint, dE00 } = ColourMatch
const DB = readJson('b1/colours.json').colours.map((c) => ({ id: c.id, lab: c.lab, name: c.zh }))
const ranAt = new Date().toISOString()

// ① 歷史色配對
const hist = readJson('b2/history-match-cases.json').cases.map((c) => {
  const t0 = performance.now(); const hit = nearest(c.target_lab, DB); const ms = performance.now() - t0
  return { case_id: c.case_id, target_lab: c.target_lab, expected_colour_id: c.expected_colour_id, returned_colour_id: hit.colour.id, returned_dE00: r3(hit.dE00), ms: Math.round(ms), pass: hit.colour.id === c.expected_colour_id }
})

// ② 噴印配色：每個標準答案顏色都要被找到，且配到標準答案色號或 ΔE00 ≤ 1.0 的色號；多偵測出的顏色另列
function judgePrint(c, img, label) {
  const t0 = performance.now(); const got = matchPrint(img.rgba, img.width, img.height, DB); const ms = performance.now() - t0
  const expected = [...new Map(c.palette.map((p) => [p.expected_colour_id, p])).values()]
  const used = new Set()
  const lines = expected.map((p) => {
    let best = null
    got.forEach((g, i) => { if (used.has(i)) return; const d = dE00(p.lab, g.lab); if (!best || d < best.d) best = { i, d, g } })
    if (best) used.add(best.i)
    const g = best?.g
    const ok = !!g && (g.colour_id === p.expected_colour_id || dE00(g.colour.lab, DB.find((x) => x.id === p.expected_colour_id).lab) <= 1.0)
    return { expected_colour_id: p.expected_colour_id, expected_hex: p.hex, detected_hex: g?.hex ?? null, detected_share: g ? r3(g.share) : null, matched_colour_id: g?.colour_id ?? null, matched_dE00: g ? r3(g.dE00) : null, ok }
  })
  const extra = got.filter((_, i) => !used.has(i)).map((g) => ({ hex: g.hex, share: r3(g.share), colour_id: g.colour_id }))
  return { case_id: c.case_id, variant: label, image: c.image, pattern: c.pattern, colours_expected: expected.length, colours_detected: got.length, lines, extra, ms: Math.round(ms), pass: lines.every((l) => l.ok) && extra.length === 0 }
}
// 可重現的雜訊：模擬掃描／JPEG 壓縮後的像素誤差（每通道 ±8）
function noisy(img, seed, amp = 8) {
  let s = seed >>> 0; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32)
  const out = Buffer.from(img.rgba)
  for (let i = 0; i < out.length; i += 4) for (let k = 0; k < 3; k++) out[i + k] = Math.max(0, Math.min(255, out[i + k] + Math.round((rnd() * 2 - 1) * amp)))
  return { ...img, rgba: out }
}
const printCases = readJson('b2/print-match-cases.json').cases
// 對照組（holdout）：演算法調整完成後才加入，種子不同、雜訊加大到 ±12，之後不再依它調參
const prints = [], printsNoisy = [], printsHoldout = []
for (const [n, c] of printCases.entries()) {
  const img = decodePng(readFileSync(join(CP, c.image)))
  prints.push(judgePrint(c, img, 'original'))
  printsNoisy.push(judgePrint(c, noisy(img, 20261122 + n), 'noise±8'))
  printsHoldout.push(judgePrint(c, noisy(img, 777000 + n * 13, 12), 'holdout noise±12'))
}

const sum = (arr) => ({ total: arr.length, passed: arr.filter((x) => x.pass).length, pass_rate: pct(arr.filter((x) => x.pass).length, arr.length) })
const summary = { ran_at: ranAt, colour_db: DB.length, history: sum(hist), print: sum(prints), print_noise: sum(printsNoisy), print_holdout: sum(printsHoldout), threshold: 90 }
writeOut('b2/history-results.json', { ...summary.history, ran_at: ranAt, cases: hist })
writeOut('b2/print-results.json', { ...summary.print, ran_at: ranAt, cases: prints })
writeOut('b2/print-results-noise.json', { ...summary.print_noise, ran_at: ranAt, cases: printsNoisy })
writeOut('b2/print-results-holdout.json', { ...summary.print_holdout, ran_at: ranAt, cases: printsHoldout })
writeOut('b2/summary.json', summary)
writeCsv('b2/history-results.csv', ['題號', '目標L', '目標a', '目標b', '標準答案', '系統回傳', 'ΔE00', '毫秒', '結果'], hist.map((h) => [h.case_id, ...h.target_lab, h.expected_colour_id, h.returned_colour_id, h.returned_dE00, h.ms, h.pass ? 'PASS' : 'FAIL']))
writeCsv('b2/print-results.csv', ['題號', '版本', '圖案', '標準答案色數', '偵測色數', '配對明細', '多偵測', '結果'], [...prints, ...printsNoisy, ...printsHoldout].map((p) => [p.case_id, p.variant, p.pattern, p.colours_expected, p.colours_detected, p.lines.map((l) => `${l.expected_colour_id}→${l.matched_colour_id}(ΔE ${l.matched_dE00})${l.ok ? '' : '✗'}`).join(' '), p.extra.map((e) => e.hex).join(' '), p.pass ? 'PASS' : 'FAIL']))
console.log(JSON.stringify(summary, null, 1))
for (const p of [...prints, ...printsNoisy, ...printsHoldout].filter((x) => !x.pass)) console.log('FAIL', p.case_id, p.variant, JSON.stringify(p.lines.filter((l) => !l.ok)), JSON.stringify(p.extra))
for (const h of hist.filter((x) => !x.pass)) console.log('FAIL', JSON.stringify(h))

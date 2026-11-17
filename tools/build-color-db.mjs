/**
 * 把 PET 染色配方檔（皇加提供，Big5、Tab 分隔）整理成 ERP 色彩資料庫，供 Agents協作中心的對色代理人查詢：
 * 先在這份配方庫找色差夠近的既有配方，找不到才請 ColorMind 預測。
 *
 * 不收進資料庫的列（直接略過，不修正）：
 *   - L* 超過 100（螢光色）或 a*、b* 超出 -128～127：ColorMind 也不收這種 Lab
 *   - 中文或英文色名空白
 *   - 染料欄位有問題：名稱黏在一起或不是染料代號（如「Y-CHF0.35Y-BR-DXF」「130*」「031R-HW3B」）、
 *     用量不是 0～5 g 的數字（如 20.850、-850.700）、染料數量與實際欄位對不上
 *
 * 執行：node tools/build-color-db.mjs [配方檔路徑]
 *   預設讀 tools/fake-colormind/data/pet-recipes.txt，寫到 public/private/color-db.json。
 * 兩個位置都已列入 .gitignore：配方含客戶品牌色名，本 repo 是公開的，不可進版控。
 * 部署環境沒有這份檔時，協作中心自動改用 ERP 色號當色彩資料庫。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = process.argv[2] || path.join(ROOT, 'tools', 'fake-colormind', 'data', 'pet-recipes.txt')
const OUT = path.join(ROOT, 'public', 'private', 'color-db.json')

const DYE_NAME = /^[A-Z][A-Z0-9]*(?:[-/][A-Z0-9]+)*$/
const MAX_DYE_G = 5

const text = new TextDecoder('big5').decode(readFileSync(SRC))
const lines = text.split(/\r?\n/).filter((l) => l.trim())
const skipped = { lab: 0, name: 0, dye: 0 }
const records = []

for (const line of lines.slice(1)) {
  const c = line.split('\t').map((s) => s.trim())
  const lab = [Number(c[17]), Number(c[18]), Number(c[19])]
  if (!lab.every((v) => c[17] !== '' && Number.isFinite(v)) || lab[0] < 0 || lab[0] > 100 || lab.slice(1).some((v) => v < -128 || v > 127)) {
    skipped.lab++
    continue
  }
  const [zh, en] = [c[0], c[1]]
  if (!zh || !en) {
    skipped.name++
    continue
  }
  const n = Number(c[2])
  const dyes = []
  let ok = Number.isInteger(n) && n >= 1 && n <= 7
  for (let i = 0; ok && i < 7; i++) {
    const name = c[3 + i * 2] ?? ''
    const g = c[4 + i * 2] ?? ''
    if (i < n) {
      const grams = Number(g)
      if (!DYE_NAME.test(name) || g === '' || !Number.isFinite(grams) || grams <= 0 || grams > MAX_DYE_G) ok = false
      else dyes.push([name, grams])
    } else if (name || g) {
      ok = false // 染料數量與實際欄位對不上
    }
  }
  if (!ok) {
    skipped.dye++
    continue
  }
  records.push({ id: `PET-${String(records.length + 1).padStart(4, '0')}`, zh, en, lab, dyes })
}

mkdirSync(path.dirname(OUT), { recursive: true })
writeFileSync(OUT, JSON.stringify({ source: 'PET 染色配方', records }))
console.log(`收錄 ${records.length} 筆；略過 L*／a*／b* 超出範圍 ${skipped.lab}、色名空白 ${skipped.name}、染料欄位有問題 ${skipped.dye}`)
console.log(`→ ${path.relative(ROOT, OUT)}`)

// 查核點測試共用：路徑、讀寫、PNG 解碼、CSV
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { inflateSync } from 'node:zlib'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

export const ROOT = fileURLToPath(new URL('../../', import.meta.url))
export const CP = join(ROOT, 'checkpoint-data')
export const RESULTS = join(CP, 'results')
export const readJson = (rel) => JSON.parse(readFileSync(join(CP, rel), 'utf8'))
export function writeOut(rel, data) {
  const f = join(RESULTS, rel); mkdirSync(dirname(f), { recursive: true })
  writeFileSync(f, typeof data === 'string' ? data : JSON.stringify(data, null, 1))
  return f
}
// public/ 屬 ESM 套件範圍，require 後由全域取（瀏覽器同樣掛在 window.ColourMatch）
createRequire(import.meta.url)(join(ROOT, 'public/colour-match.js'))
export const ColourMatch = globalThis.ColourMatch
export const r2 = (v) => Math.round(v * 100) / 100
export const r3 = (v) => Math.round(v * 1000) / 1000
export const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : 0)

/** 8-bit RGB／RGBA 非交錯 PNG → { width, height, rgba } */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  let p = 8, w = 0, h = 0, ct = 0, idat = []
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len)
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[12] !== 0) throw new Error('unsupported PNG'); ct = d[9] }
    else if (type === 'IDAT') idat.push(d)
    else if (type === 'IEND') break
    p += 12 + len
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0
  if (!bpp) throw new Error('unsupported colour type ' + ct)
  const raw = inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(w * h * 4), prev = Buffer.alloc(stride), cur = Buffer.alloc(stride)
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)]; raw.copy(cur, 0, y * (stride + 1) + 1, (y + 1) * (stride + 1))
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0
      const pr = () => { const q = a + b - c, pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c }
      cur[i] = (cur[i] + (f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? pr() : 0)) & 255
    }
    for (let x = 0; x < w; x++) { out[(y * w + x) * 4] = cur[x * bpp]; out[(y * w + x) * 4 + 1] = cur[x * bpp + 1]; out[(y * w + x) * 4 + 2] = cur[x * bpp + 2]; out[(y * w + x) * 4 + 3] = bpp === 4 ? cur[x * bpp + 3] : 255 }
    cur.copy(prev)
  }
  return { width: w, height: h, rgba: out }
}

export function csvLine(cells) { return cells.map((c) => { const s = String(c ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }).join(',') }
export function writeCsv(rel, head, rows) { return writeOut(rel, '﻿' + [head, ...rows].map(csvLine).join('\n') + '\n') }

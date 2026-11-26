/*
 * 配色共用模組：噴印圖檔配色（取主色 → 對色彩資料庫）與歷史色配對（給 Lab 找最接近色號）。
 * 瀏覽器（協作中心，<script src="colour-match.js">）與 Node（測試程式，require）共用同一份。
 * 色差一律 CIEDE2000；sRGB → Lab 用 D65。
 */
;(function (root) {
  'use strict'

  function rgb2lab(rgb) {
    var lin = function (c) { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4) }
    var r = lin(rgb[0]), g = lin(rgb[1]), b = lin(rgb[2])
    var X = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047
    var Y = r * 0.2126 + g * 0.7152 + b * 0.0722
    var Z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883
    var f = function (t) { return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116 }
    return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))]
  }

  function dE00(l1, l2) {
    var L1 = l1[0], a1 = l1[1], b1 = l1[2], L2 = l2[0], a2 = l2[1], b2 = l2[2], rad = Math.PI / 180
    var C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2
    var G = 0.5 * (1 - Math.sqrt(Math.pow(Cb, 7) / (Math.pow(Cb, 7) + Math.pow(25, 7))))
    var ap1 = (1 + G) * a1, ap2 = (1 + G) * a2, Cp1 = Math.hypot(ap1, b1), Cp2 = Math.hypot(ap2, b2)
    var h = function (b, a) { if (b === 0 && a === 0) return 0; var v = Math.atan2(b, a) / rad; return v < 0 ? v + 360 : v }
    var hp1 = h(b1, ap1), hp2 = h(b2, ap2)
    var dL = L2 - L1, dC = Cp2 - Cp1, dh = 0
    if (Cp1 * Cp2 !== 0) { dh = hp2 - hp1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360 }
    var dH = 2 * Math.sqrt(Cp1 * Cp2) * Math.sin((dh / 2) * rad)
    var Lb = (L1 + L2) / 2, Cpb = (Cp1 + Cp2) / 2, hb = hp1 + hp2
    if (Cp1 * Cp2 !== 0) hb = Math.abs(hp1 - hp2) > 180 ? (hp1 + hp2 + (hp1 + hp2 < 360 ? 360 : -360)) / 2 : (hp1 + hp2) / 2
    var T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad)
    var dTh = 30 * Math.exp(-Math.pow((hb - 275) / 25, 2)), RC = 2 * Math.sqrt(Math.pow(Cpb, 7) / (Math.pow(Cpb, 7) + Math.pow(25, 7)))
    var SL = 1 + (0.015 * Math.pow(Lb - 50, 2)) / Math.sqrt(20 + Math.pow(Lb - 50, 2)), SC = 1 + 0.045 * Cpb, SH = 1 + 0.015 * Cpb * T
    var RT = -Math.sin(2 * dTh * rad) * RC
    return Math.sqrt(Math.pow(dL / SL, 2) + Math.pow(dC / SC, 2) + Math.pow(dH / SH, 2) + RT * (dC / SC) * (dH / SH))
  }

  /** 色彩資料庫中最接近的 n 筆（db 每筆需有 id 與 lab） */
  function nearest(lab, db, n) {
    var best = []
    for (var i = 0; i < db.length; i++) {
      var d = dE00(lab, db[i].lab)
      if (best.length < (n || 1) || d < best[best.length - 1].dE00) {
        best.push({ colour: db[i], dE00: d })
        best.sort(function (p, q) { return p.dE00 - q.dE00 })
        if (best.length > (n || 1)) best.pop()
      }
    }
    return n ? best : best[0]
  }

  /**
   * 從 RGBA 像素取主色：
   * 1. 取樣點先做 3×3 中位數去雜訊（掃描、JPEG 壓縮的像素誤差），印花色塊內部不受影響；
   * 2. 每通道量化到 5 bit 做直方圖，每個桶記像素平均色；
   * 3. 由大到小合併 ΔE00 < mergeDE 的桶，得到初始顏色；
   * 4. 以面積 ≥ minShare 的顏色為中心，所有桶重新歸到最近的中心、重算平均色（重複數次）；
   * 5. 最後再合併過近的顏色，只留面積 ≥ minShare 者。代表色＝該顏色所有像素的平均。
   */
  function extractPalette(rgba, width, height, opts) {
    opts = opts || {}
    var mergeDE = opts.mergeDE == null ? 3 : opts.mergeDE
    var minShare = opts.minShare == null ? 0.01 : opts.minShare
    var maxColours = opts.maxColours || 12
    var denoise = opts.denoise !== false
    var step = Math.max(1, Math.floor(Math.sqrt((width * height) / 250000)))
    var bins = new Map(), total = 0, win = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    var med = function (x, y, ch) {
      var n = 0
      for (var dy = -1; dy <= 1; dy++) for (var dx = -1; dx <= 1; dx++) {
        var xx = Math.min(width - 1, Math.max(0, x + dx)), yy = Math.min(height - 1, Math.max(0, y + dy))
        win[n++] = rgba[(yy * width + xx) * 4 + ch]
      }
      return win.slice(0, n).sort(function (p, q) { return p - q })[n >> 1]
    }
    for (var y = 0; y < height; y += step) {
      for (var x = 0; x < width; x += step) {
        var i = (y * width + x) * 4
        if (rgba[i + 3] < 128) continue
        var r = denoise ? med(x, y, 0) : rgba[i], g = denoise ? med(x, y, 1) : rgba[i + 1], b = denoise ? med(x, y, 2) : rgba[i + 2]
        var k = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3)
        var e = bins.get(k)
        if (!e) { e = [0, 0, 0, 0]; bins.set(k, e) }
        e[0] += r; e[1] += g; e[2] += b; e[3]++; total++
      }
    }
    var cl = []
    bins.forEach(function (e) { var rgb = [e[0] / e[3], e[1] / e[3], e[2] / e[3]]; cl.push({ sum: [e[0], e[1], e[2]], n: e[3], lab: rgb2lab(rgb) }) })
    cl.sort(function (p, q) { return q.n - p.n })
    var centre = function (s, n) { return rgb2lab([s[0] / n, s[1] / n, s[2] / n]) }
    var merge = function (list) {
      var out = []
      for (var c = 0; c < list.length; c++) {
        var t = list[c], into = null
        for (var m = 0; m < out.length; m++) if (dE00(out[m].lab, t.lab) < mergeDE) { into = out[m]; break }
        if (!into) out.push({ sum: t.sum.slice(), n: t.n, lab: t.lab })
        else { into.sum[0] += t.sum[0]; into.sum[1] += t.sum[1]; into.sum[2] += t.sum[2]; into.n += t.n; into.lab = centre(into.sum, into.n) }
      }
      return out
    }
    var groups = merge(cl)
    for (var it = 0; it < 4; it++) {
      var centres = groups.filter(function (g) { return g.n / total >= minShare })
      if (!centres.length) break
      var acc = centres.map(function (c) { return { sum: [0, 0, 0], n: 0, lab: c.lab } })
      for (var j = 0; j < cl.length; j++) {
        var bi = 0, bd = Infinity
        for (var q = 0; q < centres.length; q++) { var d = dE00(centres[q].lab, cl[j].lab); if (d < bd) { bd = d; bi = q } }
        var a = acc[bi]; a.sum[0] += cl[j].sum[0]; a.sum[1] += cl[j].sum[1]; a.sum[2] += cl[j].sum[2]; a.n += cl[j].n
      }
      groups = acc.filter(function (a) { return a.n > 0 }).map(function (a) { return { sum: a.sum, n: a.n, lab: centre(a.sum, a.n) } })
    }
    groups.sort(function (p, q) { return q.n - p.n })
    groups = merge(groups)
    // 6. 衛星色塊：面積 < satShare 且與更大色塊 ΔE00 < satDE 者併入（低彩度色的雜訊雲在 CIEDE2000 下容易被拆成兩塊）
    var satShare = opts.satShare == null ? 0.1 : opts.satShare, satDE = opts.satDE == null ? 5 : opts.satDE
    for (var s = groups.length - 1; s > 0; s--) {
      var gs = groups[s]
      if (gs.n / total >= satShare) continue
      var to = -1, td = satDE
      for (var u = 0; u < s; u++) { var du = dE00(groups[u].lab, gs.lab); if (du < td) { td = du; to = u } }
      if (to < 0) continue
      var g0 = groups[to]; g0.sum[0] += gs.sum[0]; g0.sum[1] += gs.sum[1]; g0.sum[2] += gs.sum[2]; g0.n += gs.n; g0.lab = centre(g0.sum, g0.n)
      groups.splice(s, 1)
    }
    return groups
      .map(function (m) {
        var avg = [m.sum[0] / m.n, m.sum[1] / m.n, m.sum[2] / m.n]
        var shown = avg.map(Math.round)
        return { rgb: shown, hex: '#' + shown.map(function (v) { return ('0' + v.toString(16)).slice(-2) }).join('').toUpperCase(), lab: rgb2lab(avg), share: m.n / total }
      })
      .filter(function (p) { return p.share >= minShare })
      .sort(function (p, q) { return q.share - p.share })
      .slice(0, maxColours)
  }

  /** 噴印配色：圖檔主色逐一對色彩資料庫；ΔE00 ≤ tolerance 視為可直接用此色號 */
  function matchPrint(rgba, width, height, db, opts) {
    opts = opts || {}
    var tol = opts.tolerance == null ? 1.0 : opts.tolerance
    return extractPalette(rgba, width, height, opts).map(function (p) {
      var hit = nearest(p.lab, db)
      return { rgb: p.rgb, hex: p.hex, lab: p.lab, share: p.share, colour_id: hit.colour.id, colour: hit.colour, dE00: hit.dE00, usable: hit.dE00 <= tol }
    })
  }

  var api = { rgb2lab: rgb2lab, dE00: dE00, nearest: nearest, extractPalette: extractPalette, matchPrint: matchPrint }
  if (typeof module !== 'undefined' && module.exports) module.exports = api
  root.ColourMatch = api
})(typeof globalThis !== 'undefined' ? globalThis : this)

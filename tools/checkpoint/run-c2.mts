// C2：①52 項 A2A 介面一致性測試 ②100 筆端到端（接單→生管→色控→出貨）＋10 份追溯軌跡 ③30 筆場域情境預演
//   npx tsx --tsconfig tsconfig.app.json tools/checkpoint/run-c2.mts [conformance|e2e|rehearsal]
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { readFileSync } from 'node:fs'
import { request } from 'node:http'
import { startA2A } from '../a2a/serve.mts'
import { verifyCard, validateSchema } from '../a2a/core'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const lib = await import(pathToFileURL(join(ROOT, 'tools/checkpoint/lib.mjs')).href)
const { readJson, writeOut, writeCsv, pct, ColourMatch } = lib
const only = process.argv[2]
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const s = await startA2A({ testFaults: true, downstreamTimeoutMs: 1000 })
const ranAt = new Date().toISOString()
let seq = 0
const mid = (p = 'm') => `${p}-${Date.now().toString(36)}-${++seq}`

async function rpcRaw(agent: string, body: string, headers: Record<string, string> = { authorization: `Bearer ${s.token()}` }) {
  const r = await fetch(`${s.origin}/a2a/${agent}`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body })
  const text = await r.text(); let json: any = null; try { json = JSON.parse(text) } catch { /* 保留原文 */ }
  return { status: r.status, json, text }
}
const rpc = (agent: string, method: string, params: any, headers?: Record<string, string>) => rpcRaw(agent, JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, params }), headers)
function msg(skill: string, parts: any[], o: { messageId?: string; contextId?: string; taskId?: string; meta?: any; configuration?: any } = {}) {
  return { message: { kind: 'message', role: 'user', messageId: o.messageId ?? mid(), contextId: o.contextId, taskId: o.taskId, parts }, metadata: { skill, ...(o.meta ?? {}) }, ...(o.configuration ? { configuration: o.configuration } : {}) }
}
const data = (d: any) => ({ kind: 'data', data: d })
const stockLine = (n = 1, qty = 60) => ({ line_no: n, erp_product_name: '3258', color: '香檳金', qty_yd: qty })
const order = (ctx: string, lines: any[]) => ({ kind: 'order-intake', context_id: ctx, order_no: `PO-${ctx}`, lines })
const states = (t: any) => (t?.metadata?.transitions ?? []).map((x: any) => x.state)
const increasing = (t: any) => (t?.metadata?.transitions ?? []).every((x: any, i: number, a: any[]) => i === 0 || Date.parse(x.timestamp) > Date.parse(a[i - 1].timestamp))
const waitState = async (agent: string, id: string, want: string, ms = 3000) => { for (let i = 0; i < ms / 50; i++) { const g = await rpc(agent, 'tasks/get', { id }); if (g.json?.result?.status.state === want) return g.json.result; await sleep(50) } return (await rpc(agent, 'tasks/get', { id })).json?.result }

// ================================================================ ① 一致性測試
async function conformance() {
  const defs = readJson('c2/conformance-tests.json').tests as any[]
  const out: Record<string, { pass: boolean; evidence: any }> = {}
  const rec = (id: string, pass: boolean, evidence: any) => { out[id] = { pass: !!pass, evidence } }
  const AG = ['order-intake', 'production', 'color-control', 'shipping']
  const registry = await (await fetch(`${s.origin}/a2a/registry.json`)).json()
  const local = (u: string) => u.replace('https://rorica-aierp.vercel.app', s.origin)
  const cards: any = {}
  // 01–05 Agent Card
  const got = await Promise.all(registry.agents.map(async (a: any) => { const r = await fetch(local(a.card_url)); return [a.key, r.status, await r.json()] }))
  got.forEach(([k, , c]: any) => (cards[k] = c))
  rec('C2-2-01', got.every(([, st, c]: any) => st === 200 && c.protocolVersion && c.name && c.url && Array.isArray(c.skills) && c.capabilities), got.map(([k, st]: any) => `${k} HTTP ${st}`))
  const jku = JSON.parse(Buffer.from(cards.production.signatures[0].protected, 'base64url').toString()).jku
  const jwks = await (await fetch(local(jku))).json()
  rec('C2-2-02', AG.every((a) => verifyCard(cards[a], jwks)), AG.map((a) => `${a}: ${verifyCard(cards[a], jwks) ? 'valid' : 'INVALID'}`))
  rec('C2-2-03', AG.every((a) => !verifyCard({ ...cards[a], description: cards[a].description + '!' }, jwks)), 'description 改一字後全部驗證失敗')
  rec('C2-2-04', AG.every((a) => jwks.keys.some((k: any) => k.kid === JSON.parse(Buffer.from(cards[a].signatures[0].protected, 'base64url').toString()).kid)), `kid ${jwks.keys[0].kid} 於 ${jku}`)
  const owner = AG.find((a) => cards[a].skills.some((x: any) => x.id === 'match-history-colour'))
  rec('C2-2-05', owner === 'color-control', `match-history-colour → ${owner}`)
  // 06–10 訊息格式
  const r06 = await rpc('production', 'message/send', msg('allocate-rolls', [data(order('ctx-c06', [stockLine()]))], { contextId: 'ctx-c06' }))
  const t06 = r06.json?.result
  rec('C2-2-06', t06?.kind === 'task' && t06.id && t06.contextId === 'ctx-c06' && t06.status?.state, { id: t06?.id, state: t06?.status?.state })
  const p07 = msg('allocate-rolls', [data(order('ctx-c07', [stockLine()]))]); delete (p07.message as any).messageId
  const r07 = await rpc('production', 'message/send', p07)
  rec('C2-2-07', r07.json?.error?.code === -32602, r07.json?.error)
  const r08 = await rpcRaw('production', '{"jsonrpc":"2.0", this is not json')
  rec('C2-2-08', r08.json?.error?.code === -32700, r08.json?.error)
  const r09 = await rpc('production', 'foo/bar', {})
  rec('C2-2-09', r09.json?.error?.code === -32601, r09.json?.error)
  const r10 = await rpc('production', 'message/send', msg('allocate-rolls', [data(order('ctx-c10', [stockLine()])), { kind: 'file', file: { mimeType: 'image/tiff', uri: 'b2/print-images/print-01.png' } }]))
  rec('C2-2-10', r10.json?.error?.code === -32005, r10.json?.error)
  // 11–18 狀態轉換
  rec('C2-2-11', states(t06).slice(0, 2).join('→') === 'submitted→working' && increasing(t06), states(t06).join('→'))
  rec('C2-2-12', states(t06).slice(-2).join('→') === 'working→completed' && increasing(t06), states(t06).join('→'))
  const r13 = await rpc('production', 'message/send', msg('route-line', [data(order('ctx-c13', [stockLine()]))], { contextId: 'ctx-c13', meta: { require_confirmation: true } }))
  const t13 = r13.json?.result
  rec('C2-2-13', states(t13).join('→') === 'submitted→working→input-required' && increasing(t13), states(t13).join('→'))
  const r14 = await rpc('production', 'message/send', msg('route-line', [data({ confirm: true })], { contextId: 'ctx-c13', taskId: t13?.id }))
  const t14 = r14.json?.result
  rec('C2-2-14', states(t14).join('→') === 'submitted→working→input-required→working→completed' && increasing(t14), states(t14).join('→'))
  const r15 = await rpc('color-control', 'message/send', msg('match-history-colour', [data({ kind: 'colour-request', context_id: 'ctx-c15', line_no: 1, mode: 'history', target_lab: [50, 10, 10] })], { contextId: 'ctx-c15', meta: { test_fault: 'colour_fail' } }))
  const t15 = r15.json?.result
  rec('C2-2-15', states(t15).join('→') === 'submitted→working→failed' && increasing(t15) && t15.metadata.error_code === 'E_NO_COLOUR_MATCH', { states: states(t15).join('→'), error_code: t15?.metadata?.error_code })
  const r16 = await rpc('production', 'message/send', msg('allocate-rolls', [data(order('ctx-c16', [stockLine()]))], { contextId: 'ctx-c16', configuration: { blocking: false } }))
  const c16 = await rpc('production', 'tasks/cancel', { id: r16.json?.result?.id })
  await sleep(400)
  const t16 = (await rpc('production', 'tasks/get', { id: r16.json?.result?.id })).json?.result
  rec('C2-2-16', states(t16).join('→') === 'submitted→canceled' && increasing(t16) && c16.json?.result?.status.state === 'canceled', states(t16).join('→'))
  const r17 = await rpc('production', 'message/send', msg('route-line', [data(order('ctx-c17', [stockLine()]))], { contextId: 'ctx-c17', configuration: { blocking: false }, meta: { test_fault: 'slow' } }))
  await waitState('production', r17.json?.result?.id, 'working')
  await rpc('production', 'tasks/cancel', { id: r17.json?.result?.id })
  await sleep(1800)
  const t17 = (await rpc('production', 'tasks/get', { id: r17.json?.result?.id })).json?.result
  rec('C2-2-17', states(t17).join('→') === 'submitted→working→canceled' && increasing(t17), states(t17).join('→'))
  const r18 = await rpc('production', 'message/send', msg('create-shipment', [data(order('ctx-c18', [stockLine()]))], { contextId: 'ctx-c18' }))
  const t18 = r18.json?.result
  rec('C2-2-18', states(t18).join('→') === 'submitted→rejected' && increasing(t18), states(t18).join('→'))
  // 19–22 終態不可再轉換
  for (const [id, agent, t] of [['C2-2-19', 'production', t14], ['C2-2-20', 'color-control', t15], ['C2-2-21', 'production', t16], ['C2-2-22', 'production', t18]] as const) {
    const before = t?.status?.state
    const r = await rpc(agent, 'message/send', msg(t?.metadata?.skill || 'allocate-rolls', [data({ confirm: true })], { contextId: t?.contextId, taskId: t?.id }))
    const after = (await rpc(agent, 'tasks/get', { id: t?.id })).json?.result?.status.state
    rec(id, !!r.json?.error && after === before, { error: r.json?.error?.code, state: `${before} → ${after}` })
  }
  // 23–32 錯誤代碼
  const r23 = await rpc('production', 'tasks/get', { id: 'task-does-not-exist' })
  rec('C2-2-23', r23.json?.error?.code === -32001, r23.json?.error)
  const r24 = await rpc('production', 'tasks/cancel', { id: t06?.id })
  rec('C2-2-24', r24.json?.error?.code === -32002, r24.json?.error)
  const r25 = await rpc('production', 'tasks/pushNotificationConfig/set', { taskId: t06?.id, pushNotificationConfig: { url: 'https://example.invalid/hook' } })
  rec('C2-2-25', r25.json?.error?.code === -32003, r25.json?.error)
  const r26 = await rpc('production', 'message/stream', msg('allocate-rolls', [data(order('ctx-c26', [stockLine()]))]))
  rec('C2-2-26', r26.json?.error?.code === -32004, r26.json?.error)
  const r27 = await rpc('production', 'message/send', msg('route-line', [data(order('ctx-c27', [{ line_no: 1, erp_product_name: 'PET 胚布', color: '染色', qty_yd: 100, target_lab: [40, 10, -20] }]))], { contextId: 'ctx-c27', meta: { test_fault: 'bad_json' } }))
  const t27 = r27.json?.result
  rec('C2-2-27', t27?.status?.state === 'failed' && t27.metadata.error_code === -32006, { state: t27?.status?.state, error_code: t27?.metadata?.error_code })
  const r28 = await rpc('production', 'message/send', msg('allocate-rolls', [data(order('ctx-c28', [stockLine()]))]), {})
  rec('C2-2-28', r28.status === 401, `HTTP ${r28.status}`)
  const r29 = await rpc('production', 'message/send', msg('allocate-rolls', [data(order('ctx-c29', [stockLine()]))]), { authorization: `Bearer ${s.token('test-harness', -60)}` })
  rec('C2-2-29', r29.status === 401, `HTTP ${r29.status} ${r29.json?.error}`)
  const r30 = await rpc('production', 'message/send', msg('allocate-rolls', [data(order('ctx-c30', [stockLine()]))], { contextId: 'ctx-c30', meta: { test_fault: 'db_fail' } }))
  const t30 = (await rpc('production', 'tasks/get', { id: r30.json?.error?.data?.taskId })).json?.result
  rec('C2-2-30', r30.json?.error?.code === -32603 && t30?.status?.state === 'failed' && t30.metadata.error_code === -32603, { error: r30.json?.error?.code, task: t30?.status?.state, recorded: t30?.metadata?.error_code })
  const bad31 = order('ctx-c31', [stockLine()]) as any; delete bad31.lines
  const r31 = await rpc('production', 'message/send', msg('allocate-rolls', [data(bad31)]))
  rec('C2-2-31', r31.json?.error?.code === -32602 && (r31.json?.error?.data?.errors ?? []).some((e: string) => e.includes('$.lines')), r31.json?.error?.data?.errors)
  const r32 = await rpc('production', 'message/send', msg('allocate-rolls', [data(order('ctx-c32', [stockLine(1, 0)]))]))
  rec('C2-2-32', r32.json?.error?.code === -32602 && (r32.json?.error?.data?.errors ?? []).some((e: string) => e.includes('qty_yd')), r32.json?.error?.data?.errors)
  // 33–38 冪等性
  const idem = async (id: string, label: string, fn: (p: any) => Promise<any[]>) => {
    const p = msg('allocate-rolls', [data(order(`ctx-${id}`, [stockLine(1, 30)]))], { contextId: `ctx-${id}` })
    const before = s.a2a.taskCount()
    const results = await fn(p)
    const ids = new Set(results.map((r) => r?.json?.result?.id ?? r?.result?.id))
    rec(id, ids.size === 1 && !ids.has(undefined) && s.a2a.taskCount() - before === 1, { label, task_ids: [...ids], new_tasks: s.a2a.taskCount() - before })
  }
  await idem('C2-2-33', '立即重送', async (p) => { const a = await rpc('production', 'message/send', { ...p, configuration: { blocking: false } }); const b = await rpc('production', 'message/send', { ...p, configuration: { blocking: false } }); return [a, b] })
  await idem('C2-2-34', '30 秒後重送', async (p) => { const a = await rpc('production', 'message/send', p); await sleep(30000); const b = await rpc('production', 'message/send', p); return [a, b] })
  await idem('C2-2-35', '任務完成後重送', async (p) => { const a = await rpc('production', 'message/send', p); const st = a.json?.result?.status.state; const b = await rpc('production', 'message/send', p); return st === 'completed' ? [a, b] : [a, b, { result: { id: undefined } }] })
  await idem('C2-2-36', '不同連線重送', async (p) => {
    const a = await rpc('production', 'message/send', p)
    const body = JSON.stringify({ jsonrpc: '2.0', id: 'other-conn', method: 'message/send', params: p })
    const b = await new Promise<any>((res) => { const u = new URL(`${s.origin}/a2a/production`); const rq = request({ host: u.hostname, port: u.port, path: u.pathname, method: 'POST', agent: false, headers: { 'content-type': 'application/json', connection: 'close', authorization: `Bearer ${s.token('test-harness-2')}` } }, (rs) => { let t = ''; rs.on('data', (c) => (t += c)); rs.on('end', () => res({ json: JSON.parse(t) })) }); rq.end(body) })
    return [a, b]
  })
  await idem('C2-2-37', '並行重送 2 次', async (p) => Promise.all([rpc('production', 'message/send', p), rpc('production', 'message/send', p)]))
  {
    const p = msg('allocate-rolls', [data(order('ctx-c38', [stockLine(1, 30)]))], { contextId: 'ctx-c38' })
    const a = await rpc('production', 'message/send', p)
    const before = s.a2a.taskCount()
    const p2 = JSON.parse(JSON.stringify(p)); p2.message.parts[0].data.lines[0].qty_yd = 31
    const b = await rpc('production', 'message/send', p2)
    rec('C2-2-38', b.json?.error?.code === -32602 && s.a2a.taskCount() === before && !!a.json?.result?.id, { error: b.json?.error?.message, new_tasks: s.a2a.taskCount() - before })
  }
  // 39–44 補償機制：先預留布卷再讓任務失敗，預留須全部釋放，且出貨代理人留下 release 紀錄
  const comp = async (id: string, label: string, fault: string | null, lines: any[], cancel = false) => {
    const ctx = `ctx-${id}`
    s.a2a.inventory.reset()
    const p = msg('route-line', [data(order(ctx, lines))], { contextId: ctx, meta: { fulfil: true, ...(fault ? { test_fault: fault } : {}) }, ...(cancel ? { configuration: { blocking: false } } : {}) })
    const r = await rpc('production', 'message/send', p)
    let t = r.json?.result
    if (cancel) {
      for (let i = 0; i < 60 && !s.a2a.trace(ctx).some((e) => e.type === 'reservation'); i++) await sleep(50)
      await rpc('production', 'tasks/cancel', { id: t.id }); await sleep(1800)
      t = (await rpc('production', 'tasks/get', { id: t.id })).json?.result
    }
    const tr = s.a2a.trace(ctx)
    const reserved = tr.filter((e) => e.type === 'reservation').flatMap((e) => e.detail.rolls)
    const released = tr.filter((e) => e.type === 'release').flatMap((e) => e.detail.rolls)
    const releaseByShipping = tr.some((e) => e.type === 'release' && e.agent === 'shipping')
    const ok = reserved.length > 0 && ['failed', 'canceled'].includes(t?.status?.state) && s.a2a.inventory.reservedFor(ctx).length === 0 && reserved.every((x: string) => released.includes(x)) && releaseByShipping
    rec(id, ok, { label, state: t?.status?.state, error_code: t?.metadata?.error_code, reserved, released, still_reserved: s.a2a.inventory.reservedFor(ctx).length, release_by: tr.filter((e) => e.type === 'release').map((e) => e.agent) })
    return t
  }
  const failed39 = await comp('C2-2-39', '出貨失敗', 'ship_fail', [stockLine(1, 80)])
  await comp('C2-2-40', '色控失敗', 'colour_fail', [stockLine(1, 80), { line_no: 2, erp_product_name: 'PET 胚布', color: '染色', qty_yd: 100, target_lab: [40, 10, -20] }])
  await comp('C2-2-41', '逾時', 'timeout', [stockLine(1, 80)])
  await comp('C2-2-42', '人工取消', 'slow', [stockLine(1, 80)], true)
  await comp('C2-2-43', '下游代理人錯誤', 'downstream_error', [stockLine(1, 80)])
  await comp('C2-2-44', '部分配貨後失敗', 'partial_fail', [stockLine(1, 80), { line_no: 2, erp_product_name: '3005', color: '丁香紫', qty_yd: 50 }])
  // 45–50 Schema
  const sch = (n: string) => JSON.parse(readFileSync(join(ROOT, `public/a2a/schemas/${n}.schema.json`), 'utf8'))
  const ex: Record<string, any> = {
    'order-intake': order('ctx-s', [stockLine()]),
    'colour-request': { kind: 'colour-request', context_id: 'ctx-s', line_no: 1, mode: 'history', target_lab: [50, 1, 2] },
    shipment: { kind: 'shipment-request', context_id: 'ctx-s', order_no: 'PO-1', rolls: [{ roll_code: 'T1', qty_yd: 10 }] },
  }
  for (const [i, n] of ['order-intake', 'colour-request', 'shipment'].entries()) {
    const okErr = validateSchema(sch(n), ex[n]); const extra = validateSchema(sch(n), { ...ex[n], unexpected: 1 })
    rec(`C2-2-${45 + i * 2}`, okErr.length === 0, okErr.length ? okErr : '通過')
    rec(`C2-2-${46 + i * 2}`, extra.some((e) => e.includes('unexpected')), extra)
  }
  // 51–52 追溯
  s.a2a.inventory.reset()
  const ctx51 = 'ctx-c51'
  await rpc('order-intake', 'message/send', msg('map-order', [data(order(ctx51, [stockLine(1, 50), { line_no: 2, erp_product_name: 'PET 胚布', color: '染色', qty_yd: 100, target_lab: [40, 10, -20] }]))], { contextId: ctx51, meta: { fulfil: true } }))
  const tr51 = (await (await fetch(`${s.origin}/a2a/_trace/${ctx51}`)).json()).events
  const agents51 = new Set(tr51.map((e: any) => e.agent))
  rec('C2-2-51', AG.every((a) => agents51.has(a)) && tr51.some((e: any) => e.type === 'message-in') && tr51.some((e: any) => e.type === 'state'), { events: tr51.length, agents: [...agents51] })
  rec('C2-2-52', failed39?.metadata?.error_code && states(failed39).length >= 3, { error_code: failed39?.metadata?.error_code, transitions: states(failed39).join('→') })

  const list = defs.map((d) => ({ ...d, pass: out[d.id]?.pass ?? false, evidence: out[d.id]?.evidence ?? 'not run' }))
  const passed = list.filter((x) => x.pass).length
  const summary = { ran_at: ranAt, total: list.length, passed, pass_rate: pct(passed, list.length), threshold: 90 }
  writeOut('c2/conformance-results.json', { ...summary, tests: list })
  writeCsv('c2/conformance-results.csv', ['編號', '類別', '測試', '預期', '實際（證據）', '判定'], list.map((x) => [x.id, x.cat, x.title, x.expected, typeof x.evidence === 'string' ? x.evidence : JSON.stringify(x.evidence), x.pass ? 'PASS' : 'FAIL']))
  console.log('conformance', JSON.stringify(summary))
  for (const x of list.filter((y) => !y.pass)) console.log('FAIL', x.id, x.title, JSON.stringify(x.evidence))
}

// ================================================================ ②③ 端到端與場域預演（同一條流程）
const labels = (() => { const snap = JSON.parse(readFileSync(join(ROOT, 'checkpoint-data/.generated/erp-snapshot.json'), 'utf8')); return (snap.data ?? snap).fabricLabels as any[] })()
const ydOf = (l: any) => (l.unit === 'Meter' ? l.length / 0.9144 : l.length)
const DB = readJson('b1/colours.json').colours
function toOrder(id: string, ctx: string, inp: any) {
  if (inp.route === 'print') return { parts: [data(order(ctx, [{ line_no: 1, erp_product_name: inp.base_fabric, color: '噴印', qty_yd: inp.qty_yd }])), { kind: 'file', file: { mimeType: 'image/png', uri: inp.image, name: inp.image.split('/').pop() } }] }
  if (inp.route === 'dye') return { parts: [data(order(ctx, [{ line_no: 1, erp_product_name: inp.base_fabric, color: '染色', qty_yd: inp.qty_yd, target_lab: inp.target_lab }]))] }
  return { parts: [data(order(ctx, [{ line_no: 1, erp_product_name: inp.erp_product_name, color: inp.color, qty_yd: inp.qty_yd }]))] }
}
function judge(inp: any, expected: any, t: any) {
  const plan = t?.artifacts?.[0]?.parts?.[0]?.data?.plan
  const line = plan?.lines?.[0]
  const c: Record<string, boolean> = { completed: t?.status?.state === 'completed', route: line?.route === expected.route, shipped: plan?.shipment?.status === 'shipped' }
  if (expected.route === 'in_stock') {
    const rolls = (line?.rolls ?? []).map((r: any) => labels.find((l) => l.rollCode === r.roll_code))
    const yd = rolls.reduce((a: number, l: any) => a + (l ? ydOf(l) : 0), 0)
    c.rolls_match_item = rolls.length > 0 && rolls.every((l: any) => l && l.productName === inp.erp_product_name && l.color === inp.color && l.status === '在庫')
    c.covers_qty = yd >= inp.qty_yd - 0.01
  } else if (expected.route === 'print') {
    const got = line?.colour?.palette ?? []
    c.palette = expected.palette.every((id: string) => got.some((p: any) => p.colour_id === id || ColourMatch.dE00(DB.find((d: any) => d.id === p.colour_id).lab, DB.find((d: any) => d.id === id).lab) <= 1))
  } else {
    c.colour = line?.colour?.colour_id === expected.colour_id
    c.recipe = line?.colour?.recipe_id === expected.recipe_id
  }
  return c
}
async function pipeline(kind: 'e2e' | 'rehearsal') {
  const items = kind === 'e2e'
    ? (readJson('c2/e2e-orders.json').orders as any[]).map((x) => ({ id: x.order_no, ctx: x.contextId, inp: x.input, expected: x.input.expected, stages: x.expected_stages }))
    : (readJson('c2/field-scenarios.json').cases as any[]).map((x) => ({ id: x.case_id, ctx: `ctx-REH-${x.case_id}`, inp: x, expected: x.expected, stages: null }))
  const rows: any[] = []
  for (const it of items) {
    s.a2a.inventory.reset() // 每筆以期初庫存獨立執行（與標準答案的前提相同）
    const { parts } = toOrder(it.id, it.ctx, it.inp)
    const t0 = performance.now()
    const r = await rpc('order-intake', 'message/send', msg('map-order', parts, { contextId: it.ctx, messageId: `msg-${it.id}`, meta: { fulfil: true } }))
    const ms = Math.round(performance.now() - t0)
    const t = r.json?.result
    const checks = judge(it.inp, it.expected, t)
    const tr = s.a2a.trace(it.ctx)
    const stageOf: Record<string, string> = { 'order-intake': '接單', production: '生管', 'color-control': '色控', shipping: '出貨' }
    const stages = [...new Set(tr.filter((e) => e.type === 'message-in').map((e) => stageOf[e.agent]))]
    const failedTasks = tr.filter((e) => e.type === 'state' && e.detail.state === 'failed')
    rows.push({ id: it.id, contextId: it.ctx, route: it.expected.route, final_state: t?.status?.state ?? `error ${r.json?.error?.code}`, stages: stages.join('→'), events: tr.length, checks, pass: Object.values(checks).every(Boolean), error_code: t?.metadata?.error_code ?? r.json?.error?.code ?? null, failed_tasks_with_code: failedTasks.every((e) => e.detail.error_code != null), ms })
  }
  return rows
}
async function e2e() {
  const rows = await pipeline('e2e')
  const passed = rows.filter((r) => r.pass).length
  const failed = rows.filter((r) => !r.pass)
  const byRoute = Object.fromEntries(['in_stock', 'print', 'dye'].map((k) => { const x = rows.filter((r) => r.route === k); return [k, { total: x.length, passed: x.filter((r) => r.pass).length, rate: pct(x.filter((r) => r.pass).length, x.length) }] }))
  // 10 份追溯：各路線至少 3 份
  const pickCtx = [...rows.filter((r) => r.route === 'in_stock').slice(0, 4), ...rows.filter((r) => r.route === 'print').slice(0, 3), ...rows.filter((r) => r.route === 'dye').slice(0, 3)].map((r) => r.contextId)
  for (const ctx of pickCtx) writeOut(`c2/traces/${ctx}.json`, { contextId: ctx, exported_at: new Date().toISOString(), events: s.a2a.trace(ctx) })
  const summary = { ran_at: ranAt, total: rows.length, passed, success_rate: pct(passed, rows.length), by_route: byRoute, failed: failed.length, failed_with_error_code: failed.filter((r) => r.error_code != null).length, traces_exported: pickCtx.length, threshold: 90, isolation: '每筆訂單以期初庫存獨立執行' }
  writeOut('c2/e2e-results.json', { ...summary, orders: rows })
  writeCsv('c2/e2e-results.csv', ['訂單', 'contextId', '路線', '最終狀態', '經過階段', '事件數', '檢查', '錯誤代碼', '毫秒', '判定'], rows.map((r) => [r.id, r.contextId, r.route, r.final_state, r.stages, r.events, Object.entries(r.checks).map(([k, v]) => `${k}:${v ? 'ok' : 'NG'}`).join(' '), r.error_code ?? '', r.ms, r.pass ? 'PASS' : 'FAIL']))
  console.log('e2e', JSON.stringify(summary))
  for (const r of failed) console.log('FAIL', JSON.stringify(r))
}
async function rehearsal() {
  const rows = await pipeline('rehearsal')
  const byRoute = Object.fromEntries(['in_stock', 'print', 'dye'].map((k) => { const x = rows.filter((r) => r.route === k); return [k, { total: x.length, passed: x.filter((r) => r.pass).length, rate: pct(x.filter((r) => r.pass).length, x.length) }] }))
  const summary = { ran_at: ranAt, kind: '預演（本機模擬資料，非合作廠商現場驗證）', total: rows.length, passed: rows.filter((r) => r.pass).length, by_route: byRoute }
  writeOut('c2/field-rehearsal-results.json', { ...summary, cases: rows })
  writeCsv('c2/field-rehearsal-results.csv', ['情境', '路線', '最終狀態', '經過階段', '檢查', '判定'], rows.map((r) => [r.id, r.route, r.final_state, r.stages, Object.entries(r.checks).map(([k, v]) => `${k}:${v ? 'ok' : 'NG'}`).join(' '), r.pass ? 'PASS' : 'FAIL']))
  console.log('rehearsal', JSON.stringify(summary))
  for (const r of rows.filter((x) => !x.pass)) console.log('FAIL', JSON.stringify(r))
}

if (!only || only === 'conformance') await conformance()
if (!only || only === 'e2e') await e2e()
if (!only || only === 'rehearsal') await rehearsal()
await s.close(); process.exit(0)

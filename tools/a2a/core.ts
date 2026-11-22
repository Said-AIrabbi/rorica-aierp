/**
 * A2A（Agent2Agent，protocolVersion 0.3.0）後端核心：四個代理人——接單、生管、色控、出貨。
 *
 * - 傳輸：JSON-RPC 2.0 over HTTP；方法 message/send、tasks/get、tasks/cancel。
 * - 身分：呼叫端帶 ES256 簽的 JWT（Authorization: Bearer），以 JWKS 驗證；Agent Card 以 JWS 簽章，
 *   交辦前先由 registry 找到對方名片、驗章、確認對方有這個技能（服務發現）。
 * - 任務：submitted → working → completed／failed／canceled／rejected／input-required；終態不可再變；
 *   每次轉換記在 metadata.transitions（時間嚴格遞增）。
 * - 冪等：同一代理人收到同一 messageId——內容相同回原任務，內容不同拒絕；都不建新任務。
 * - 補償：生管已預留布卷後，下游（色控、出貨）失敗、逾時、被取消時，請出貨代理人釋放預留並留紀錄。
 * - 追溯：所有訊息與狀態轉換依 contextId 記錄。
 *
 * 代理人的判斷目前是規則運算（ERP 配貨函式、CIEDE2000 色彩比對），不呼叫 AI 模型；
 * 每個代理人的「模型」欄位先標 rule-based，日後換成實際模型時只改 skill 實作。
 * 庫存、任務、紀錄存在記憶體（本機測試用）；部署時需改接持久化存放。
 */
import { createHash, createPublicKey, sign as cSign, verify as cVerify, type KeyObject } from 'node:crypto'
import { availableFabricLabels, allocateWholeRolls } from '../../src/lib/inventory'
import type { FabricLabel, StockReservation } from '../../src/types'

// ---------------------------------------------------------------- 型別
export type TaskState = 'submitted' | 'working' | 'input-required' | 'completed' | 'canceled' | 'failed' | 'rejected'
const TERMINAL: TaskState[] = ['completed', 'canceled', 'failed', 'rejected']
type Part = { kind: 'text'; text: string } | { kind: 'data'; data: any } | { kind: 'file'; file: { mimeType?: string; uri?: string; name?: string } }
interface Message { kind: 'message'; role: 'user' | 'agent'; messageId: string; parts: Part[]; contextId?: string; taskId?: string; metadata?: any }
export interface Task {
  kind: 'task'; id: string; contextId: string
  status: { state: TaskState; timestamp: string; message?: Message }
  history: Message[]; artifacts: { artifactId: string; name?: string; parts: Part[] }[]
  metadata: { agent: string; skill: string; model: string; transitions: { state: TaskState; timestamp: string }[]; error_code?: number | string; error_message?: string }
}
export interface TraceEvent { ts: string; contextId: string; agent: string; type: 'message-in' | 'message-out' | 'state' | 'error' | 'reservation' | 'release' | 'shipment'; detail: any }
interface Img { width: number; height: number; rgba: Uint8Array }
export interface A2AOptions {
  publicOrigin: string; localOrigin: () => string
  cards: Record<string, any>; jwks: { keys: any[] }; registry: { agents: { key: string; card_url: string }[] }
  schemas: Record<string, any>
  labels: FabricLabel[]; reservations: StockReservation[]
  colourDb: { id: string; lab: number[]; zh?: string }[]; recipes: { recipe_id: string; colour_id: string; dyes: any[] }[]
  loadImage: (ref: string) => Img
  colour: { nearest: (lab: number[], db: any[]) => { colour: any; dE00: number }; matchPrint: (rgba: Uint8Array, w: number, h: number, db: any[]) => any[] }
  signingKey: KeyObject; kid: string
  testFaults?: boolean; downstreamTimeoutMs?: number
}
export class A2AError extends Error {
  code: number | string; data?: any
  constructor(code: number | string, message: string, data?: any) { super(message); this.code = code; this.data = data }
}
const ERR = { parse: -32700, invalidRequest: -32600, methodNotFound: -32601, invalidParams: -32602, internal: -32603, taskNotFound: -32001, taskNotCancelable: -32002, pushNotSupported: -32003, unsupported: -32004, contentType: -32005, invalidAgentResponse: -32006 }

// ---------------------------------------------------------------- 小工具
export const jcs = (v: any): string => (v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(jcs).join(',')}]` : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`)
const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url')
const sha = (s: string) => createHash('sha256').update(s).digest('hex')
let lastTs = 0
/** 嚴格遞增的時間戳（同一毫秒內多次轉換也有先後） */
export function now(): string { lastTs = Math.max(Date.now(), lastTs + 1); return new Date(lastTs).toISOString() }
const rid = (p: string) => `${p}-${createHash('sha1').update(String(Math.random()) + now()).digest('hex').slice(0, 12)}`
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const ydOf = (l: FabricLabel) => (l.unit === 'Meter' ? l.length / 0.9144 : l.length)

// ---------------------------------------------------------------- JWT（ES256）
export function signJwt(key: KeyObject, kid: string, claims: Record<string, any>): string {
  const h = b64u(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid })), p = b64u(JSON.stringify(claims))
  return `${h}.${p}.${b64u(cSign('sha256', Buffer.from(`${h}.${p}`), { key, dsaEncoding: 'ieee-p1363' }))}`
}
function verifyJwt(token: string, jwks: { keys: any[] }): { ok: boolean; why?: string; claims?: any } {
  const [h, p, s] = token.split('.')
  if (!h || !p || !s) return { ok: false, why: 'malformed' }
  let header: any, claims: any
  try { header = JSON.parse(Buffer.from(h, 'base64url').toString()); claims = JSON.parse(Buffer.from(p, 'base64url').toString()) } catch { return { ok: false, why: 'malformed' } }
  const jwk = jwks.keys.find((k) => k.kid === header.kid)
  if (!jwk || header.alg !== 'ES256') return { ok: false, why: 'unknown key' }
  const ok = cVerify('sha256', Buffer.from(`${h}.${p}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))
  if (!ok) return { ok: false, why: 'bad signature' }
  if (claims.aud !== 'rorica-a2a') return { ok: false, why: 'wrong audience' }
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= Date.now()) return { ok: false, why: 'expired' }
  return { ok: true, claims }
}
/** Agent Card 的 JWS（payload＝去掉 signatures 的 RFC 8785 正規化 JSON） */
export function verifyCard(card: any, jwks: { keys: any[] }): boolean {
  const { signatures, ...body } = card
  const sig = signatures?.[0]; if (!sig) return false
  const header = JSON.parse(Buffer.from(sig.protected, 'base64url').toString())
  const jwk = jwks.keys.find((k) => k.kid === header.kid); if (!jwk) return false
  return cVerify('sha256', Buffer.from(`${sig.protected}.${b64u(jcs(body))}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig.signature, 'base64url'))
}

// ---------------------------------------------------------------- JSON Schema（本專案三份 Schema 用到的子集）
export function validateSchema(schema: any, v: any, path = '$'): string[] {
  const errs: string[] = []
  if (schema.const !== undefined && v !== schema.const) errs.push(`${path}: must equal ${JSON.stringify(schema.const)}`)
  if (schema.enum && !schema.enum.includes(v)) errs.push(`${path}: must be one of ${schema.enum.join('|')}`)
  const t = schema.type
  if (t === 'object') {
    if (!v || typeof v !== 'object' || Array.isArray(v)) return [`${path}: must be object`]
    for (const r of schema.required ?? []) if (v[r] === undefined) errs.push(`${path}.${r}: required`)
    for (const [k, val] of Object.entries(v)) {
      const ps = schema.properties?.[k]
      if (!ps) { if (schema.additionalProperties === false) errs.push(`${path}.${k}: not allowed`); continue }
      errs.push(...validateSchema(ps, val, `${path}.${k}`))
    }
  } else if (t === 'array') {
    if (!Array.isArray(v)) return [`${path}: must be array`]
    if (schema.minItems != null && v.length < schema.minItems) errs.push(`${path}: at least ${schema.minItems} items`)
    if (schema.maxItems != null && v.length > schema.maxItems) errs.push(`${path}: at most ${schema.maxItems} items`)
    if (schema.items) v.forEach((x, i) => errs.push(...validateSchema(schema.items, x, `${path}[${i}]`)))
  } else if (t === 'string') {
    if (typeof v !== 'string') errs.push(`${path}: must be string`)
    else if (schema.format === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(v)) errs.push(`${path}: must be a date`)
  } else if (t === 'integer') {
    if (!Number.isInteger(v)) errs.push(`${path}: must be integer`)
  } else if (t === 'number') {
    if (typeof v !== 'number' || !Number.isFinite(v)) errs.push(`${path}: must be number`)
  }
  if (typeof v === 'number') {
    if (schema.minimum != null && v < schema.minimum) errs.push(`${path}: must be >= ${schema.minimum}`)
    if (schema.exclusiveMinimum != null && v <= schema.exclusiveMinimum) errs.push(`${path}: must be > ${schema.exclusiveMinimum}`)
  }
  return errs
}
const SCHEMA_OF: Record<string, string> = { 'order-intake': 'order-intake', 'colour-request': 'colour-request', 'colour-result': 'colour-request', 'shipment-request': 'shipment', 'shipment-result': 'shipment', 'release-reservation': 'shipment' }

// ---------------------------------------------------------------- 主體
export function createA2A(o: A2AOptions) {
  const tasks = new Map<string, Task>()
  const byMsg = new Map<string, { taskId: string; hash: string }>()
  const traces = new Map<string, TraceEvent[]>()
  const cancelFlags = new Set<string>()
  const discovered = new Map<string, any>()
  let labels: FabricLabel[] = o.labels.map((l) => ({ ...l }))
  let reservations: StockReservation[] = o.reservations.map((r) => ({ ...r }))
  const timeoutMs = o.downstreamTimeoutMs ?? 1000
  const MODEL = 'rule-based'

  const trace = (contextId: string, agent: string, type: TraceEvent['type'], detail: any) => {
    const e: TraceEvent = { ts: now(), contextId, agent, type, detail }
    if (!traces.has(contextId)) traces.set(contextId, [])
    traces.get(contextId)!.push(e)
  }
  const setState = (t: Task, state: TaskState, text?: string) => {
    const ts = now()
    t.status = { state, timestamp: ts, ...(text ? { message: { kind: 'message', role: 'agent', messageId: rid('m'), parts: [{ kind: 'text', text }], taskId: t.id, contextId: t.contextId } } : {}) }
    t.metadata.transitions.push({ state, timestamp: ts })
    trace(t.contextId, t.metadata.agent, 'state', { taskId: t.id, skill: t.metadata.skill, state, ...(t.metadata.error_code != null ? { error_code: t.metadata.error_code } : {}), ...(text ? { text } : {}) })
  }
  const snapshot = (t: Task): Task => JSON.parse(JSON.stringify(t, (k, v) => (k.startsWith('_') ? undefined : v)))

  // ---------- 庫存（用 ERP 的配貨函式）
  const inventory = {
    reset() { labels = o.labels.map((l) => ({ ...l })); reservations = o.reservations.map((r) => ({ ...r })) },
    free(name: string, color: string) { return availableFabricLabels(name, color, labels, reservations) },
    reserve(contextId: string, agent: string, line: any): { rolls: { roll_code: string; qty_yd: number }[]; yd: number } | null {
      const chosen = allocateWholeRolls(line.qty_yd, inventory.free(line.erp_product_name, line.color))
      if (!chosen) return null
      const r = { id: rid('RSV'), packingNoticeId: contextId, packingNoticeItemId: String(line.line_no), customerId: 'A2A', productName: line.erp_product_name, color: line.color, rollCodes: chosen.map((c) => c.rollCode), qty: line.qty_yd, unit: 'Yard', status: '預留中', createdAt: now(), expiresAt: new Date(Date.now() + 14 * 864e5).toISOString() } as unknown as StockReservation
      reservations.push(r)
      const rolls = chosen.map((c) => ({ roll_code: c.rollCode, qty_yd: Math.round(ydOf(c) * 10) / 10 }))
      trace(contextId, agent, 'reservation', { line_no: line.line_no, rolls: rolls.map((x) => x.roll_code), qty_yd: line.qty_yd })
      return { rolls, yd: rolls.reduce((a, x) => a + x.qty_yd, 0) }
    },
    reservedFor(contextId: string) { return reservations.filter((r) => r.packingNoticeId === contextId && r.status === '預留中') },
    release(contextId: string, agent: string, reason: string) {
      const rs = inventory.reservedFor(contextId)
      const at = now()
      rs.forEach((r) => { r.status = '已釋放' as any; r.releasedAt = at })
      const rolls = rs.flatMap((r) => r.rollCodes)
      trace(contextId, agent, 'release', { reason, rolls, reservations: rs.map((r) => r.id) })
      return rolls
    },
    ship(contextId: string, agent: string, rollCodes: string[]) {
      const rs = inventory.reservedFor(contextId)
      const reserved = new Set(rs.flatMap((r) => r.rollCodes))
      const bad = rollCodes.filter((c) => !reserved.has(c))
      if (bad.length) throw new A2AError('E_NOT_RESERVED', `rolls not reserved for ${contextId}: ${bad.join(',')}`)
      labels.forEach((l) => { if (rollCodes.includes(l.rollCode)) l.status = '已出貨' as any })
      rs.forEach((r) => { r.status = '已轉出貨' as any })
      return rollCodes
    },
  }

  // ---------- 服務發現與對外交辦
  const toLocal = (url: string) => url.replace(o.publicOrigin, o.localOrigin())
  async function discover(agentKey: string, skill: string) {
    const key = `${agentKey}|${skill}`
    if (discovered.has(key)) return discovered.get(key)
    const entry = o.registry.agents.find((a) => a.key === agentKey)
    if (!entry) throw new A2AError('E_DISCOVERY', `agent ${agentKey} not in registry`)
    const card = await (await fetch(toLocal(entry.card_url))).json()
    const header = JSON.parse(Buffer.from(card.signatures[0].protected, 'base64url').toString())
    const jwks = await (await fetch(toLocal(header.jku))).json()
    if (!verifyCard(card, jwks)) throw new A2AError('E_CARD_SIGNATURE', `agent card of ${agentKey} failed JWS verification`)
    if (!card.skills.some((s: any) => s.id === skill)) throw new A2AError('E_DISCOVERY', `${agentKey} does not offer ${skill}`)
    const found = { url: toLocal(card.url), card }
    discovered.set(key, found)
    return found
  }
  /** from 代理人以 A2A 交辦給 to 代理人；回傳對方的 Task（完成、失敗都回），協定或格式錯誤丟 A2AError */
  async function send(from: string, to: string, skill: string, parts: Part[], ctx: { contextId: string; messageId?: string; metadata?: any; timeoutMs?: number }): Promise<Task> {
    const target = await discover(to, skill)
    const message: Message = { kind: 'message', role: 'user', messageId: ctx.messageId ?? rid('msg'), contextId: ctx.contextId, parts }
    const body = { jsonrpc: '2.0', id: rid('rpc'), method: 'message/send', params: { message, metadata: { skill, ...(ctx.metadata ?? {}) } } }
    const token = signJwt(o.signingKey, o.kid, { iss: from, sub: from, aud: 'rorica-a2a', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 })
    trace(ctx.contextId, from, 'message-out', { to, skill, messageId: message.messageId })
    const ac = new AbortController(), timer = setTimeout(() => ac.abort(), ctx.timeoutMs ?? timeoutMs)
    let text: string
    try {
      const res = await fetch(target.url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body), signal: ac.signal })
      text = await res.text()
    } catch (e: any) {
      throw e?.name === 'AbortError' ? new A2AError('E_TIMEOUT', `${to} did not answer within ${ctx.timeoutMs ?? timeoutMs} ms`) : new A2AError('E_UNREACHABLE', String(e?.message ?? e))
    } finally { clearTimeout(timer) }
    let rpc: any
    try { rpc = JSON.parse(text) } catch { throw new A2AError(ERR.invalidAgentResponse, `${to} returned a non-JSON response`) }
    if (rpc.error) throw new A2AError(rpc.error.code, `${to}: ${rpc.error.message}`, rpc.error.data)
    const t = rpc.result
    if (!t || t.kind !== 'task' || !t.status?.state) throw new A2AError(ERR.invalidAgentResponse, `${to} returned something that is not a Task`)
    return t
  }
  const dataOf = (t: Task) => (t.artifacts?.[0]?.parts.find((p: any) => p.kind === 'data') as any)?.data

  // ---------- 技能
  type Ctx = { agent: string; task: Task; data: any[]; files: { mimeType?: string; uri?: string }[]; meta: any; fault?: string }
  type Outcome = { state: 'completed'; result: any } | { state: 'input-required'; text: string; result?: any }
  const fault = (c: Ctx, name: string) => o.testFaults && c.fault === name
  const first = (c: Ctx, kind?: string) => c.data.find((d) => !kind || d.kind === kind)

  async function production(c: Ctx, fulfil: boolean, confirmed: boolean): Promise<Outcome> {
    const order = first(c, 'order-intake')
    if (!order) throw new A2AError(ERR.invalidParams, 'order-intake data part required')
    const ctxId = c.task.contextId
    const lines: any[] = []
    try {
      for (const [idx, l] of order.lines.entries()) {
        if (cancelFlags.has(c.task.id)) throw new A2AError('E_CANCELED', 'canceled by caller')
        if (fault(c, 'partial_fail') && idx === 1) throw new A2AError('E_PARTIAL_ALLOCATION', `line ${l.line_no} could not be allocated after line 1 was reserved`)
        const isPrint = !!c.files.find((f) => f.uri) && l.color === '噴印'
        const isDye = Array.isArray(l.target_lab)
        if (!isPrint && !isDye) {
          const got = inventory.reserve(ctxId, c.agent, l)
          if (got) { lines.push({ line_no: l.line_no, route: 'in_stock', rolls: got.rolls, allocated_yd: Math.round(got.yd * 10) / 10 }); continue }
          lines.push({ line_no: l.line_no, route: 'purchase', note: 'no free stock; ERP raises a purchase order draft' }); continue
        }
        const req = isPrint
          ? { kind: 'colour-request', context_id: ctxId, line_no: l.line_no, mode: 'print', image_ref: c.files.find((f) => f.uri)!.uri }
          : { kind: 'colour-request', context_id: ctxId, line_no: l.line_no, mode: 'history', target_lab: l.target_lab }
        const t = await send(c.agent, 'color-control', isPrint ? 'match-print-palette' : 'match-history-colour', [{ kind: 'data', data: req }], { contextId: ctxId, metadata: c.fault ? { test_fault: c.fault } : undefined })
        if (t.status.state !== 'completed') throw new A2AError(t.metadata?.error_code ?? 'E_COLOUR', `color-control ended ${t.status.state}`)
        const res = dataOf(t)
        lines.push({ line_no: l.line_no, route: isPrint ? 'print' : 'dye', colour: isPrint ? { palette: res.palette } : res.result, qty_yd: l.qty_yd })
      }
      if (fault(c, 'slow')) { for (let i = 0; i < 15; i++) { await sleep(100); if (cancelFlags.has(c.task.id)) throw new A2AError('E_CANCELED', 'canceled by caller') } }
      if (c.meta?.require_confirmation && !confirmed) return { state: 'input-required', text: '請業務確認配貨與路線後回覆 {"confirm": true}', result: { kind: 'route-plan', context_id: ctxId, lines } }
      let shipment: any = null
      if (fulfil) {
        const rolls = lines.flatMap((l) => l.rolls ?? [])
        const lots = lines.filter((l) => l.route === 'print' || l.route === 'dye').map((l) => ({ roll_code: `${l.route.toUpperCase()}-${ctxId}-L${l.line_no}`, qty_yd: l.qty_yd }))
        const t = await send(c.agent, 'shipping', 'create-shipment', [{ kind: 'data', data: { kind: 'shipment-request', context_id: ctxId, order_no: order.order_no, rolls: [...rolls, ...lots] } }], { contextId: ctxId, metadata: c.fault ? { test_fault: c.fault } : undefined })
        if (cancelFlags.has(c.task.id)) throw new A2AError('E_CANCELED', 'canceled by caller')
        if (t.status.state !== 'completed') throw new A2AError(t.metadata?.error_code ?? 'E_SHIPMENT', `shipping ended ${t.status.state}`)
        shipment = dataOf(t)
      }
      return { state: 'completed', result: { kind: 'route-plan', context_id: ctxId, order_no: order.order_no, lines, shipment } }
    } catch (e) {
      // 補償：已預留的布卷一律請出貨代理人釋放
      if (inventory.reservedFor(ctxId).length) {
        try {
          await send(c.agent, 'shipping', 'release-reservation', [{ kind: 'data', data: { kind: 'release-reservation', context_id: ctxId, order_no: order.order_no, error_code: String((e as any).code ?? 'E_FAILED') } }], { contextId: ctxId })
        } catch { inventory.release(ctxId, c.agent, 'fallback: shipping unreachable') }
      }
      throw e
    }
  }

  const SKILLS: Record<string, Record<string, (c: Ctx, resume?: any) => Promise<Outcome>>> = {
    'order-intake': {
      'map-order': async (c) => {
        const order = first(c, 'order-intake')
        if (!order) throw new A2AError(ERR.invalidParams, 'order-intake data part required')
        // 接單 → 生管：把訂單與附件原樣交給生管排路線（fulfil=true 時一路到出貨）
        const t = await send(c.agent, 'production', 'route-line', [{ kind: 'data', data: order }, ...c.files.map((f) => ({ kind: 'file' as const, file: f }))], { contextId: c.task.contextId, metadata: { fulfil: !!c.meta?.fulfil, ...(c.fault ? { test_fault: c.fault } : {}) }, timeoutMs: 15000 })
        if (t.status.state !== 'completed') throw new A2AError(t.metadata?.error_code ?? 'E_PRODUCTION', `production ended ${t.status.state}`)
        return { state: 'completed', result: { kind: 'order-result', context_id: c.task.contextId, order_no: order.order_no, production_task: t.id, plan: dataOf(t) } }
      },
      'check-stock': async (c) => {
        const order = first(c, 'order-intake')
        return { state: 'completed', result: { kind: 'stock-check', lines: order.lines.map((l: any) => ({ line_no: l.line_no, free_yd: Math.round(inventory.free(l.erp_product_name, l.color).reduce((a, x) => a + ydOf(x), 0) * 10) / 10 })) } }
      },
    },
    production: {
      'allocate-rolls': async (c) => {
        const order = first(c, 'order-intake')
        const lines = order.lines.map((l: any) => { const got = inventory.reserve(c.task.contextId, c.agent, l); return got ? { line_no: l.line_no, result: 'allocated', rolls: got.rolls } : { line_no: l.line_no, result: 'shortage' } })
        return { state: 'completed', result: { kind: 'allocation', context_id: c.task.contextId, order_no: order.order_no, lines } }
      },
      'route-line': (c, resume) => production(c, !!c.meta?.fulfil, !!resume?.confirm),
    },
    'color-control': {
      'match-history-colour': async (c) => {
        if (fault(c, 'bad_json')) throw new BadJson()
        if (fault(c, 'colour_fail')) throw new A2AError('E_NO_COLOUR_MATCH', 'no usable colour within tolerance')
        const req = first(c, 'colour-request')
        if (!req?.target_lab) throw new A2AError(ERR.invalidParams, 'target_lab required')
        const hit = o.colour.nearest(req.target_lab, o.colourDb)
        const recipe = o.recipes.find((r) => r.colour_id === hit.colour.id)
        return { state: 'completed', result: { kind: 'colour-result', context_id: req.context_id, line_no: req.line_no, mode: 'history', result: { colour_id: hit.colour.id, dE00: Math.round(hit.dE00 * 1000) / 1000, ...(recipe ? { recipe_id: recipe.recipe_id } : {}), pass: hit.dE00 <= 1 } } }
      },
      'match-print-palette': async (c) => {
        if (fault(c, 'bad_json')) throw new BadJson()
        if (fault(c, 'colour_fail')) throw new A2AError('E_NO_COLOUR_MATCH', 'no usable colour within tolerance')
        const req = first(c, 'colour-request')
        const ref = req?.image_ref ?? c.files.find((f) => f.uri)?.uri
        if (!ref) throw new A2AError(ERR.invalidParams, 'image_ref required')
        const img = o.loadImage(ref)
        const pal = o.colour.matchPrint(img.rgba, img.width, img.height, o.colourDb)
        return { state: 'completed', result: { kind: 'colour-result', context_id: req?.context_id ?? c.task.contextId, line_no: req?.line_no ?? 1, mode: 'print', image_ref: ref, palette: pal.map((p: any) => ({ hex: p.hex, share: Math.round(p.share * 1000) / 1000, colour_id: p.colour_id, dE00: Math.round(p.dE00 * 1000) / 1000, usable: p.usable })) } }
      },
    },
    shipping: {
      'create-shipment': async (c) => {
        if (fault(c, 'timeout')) await sleep(timeoutMs * 3)
        if (fault(c, 'downstream_error')) throw new A2AError(ERR.internal, 'shipping database unavailable')
        if (fault(c, 'ship_fail')) throw new A2AError('E_SHIPMENT_FAILED', 'carrier booking rejected')
        const req = first(c, 'shipment-request')
        if (req) {
          const stock = (req.rolls ?? []).filter((r: any) => !/^(PRINT|DYE)-/.test(r.roll_code)).map((r: any) => r.roll_code)
          inventory.ship(req.context_id, c.agent, stock)
          const shipNo = `SHP-${req.order_no}-${createHash('sha1').update(req.context_id).digest('hex').slice(0, 6)}`
          trace(req.context_id, c.agent, 'shipment', { shipment_no: shipNo, rolls: req.rolls.map((r: any) => r.roll_code) })
          return { state: 'completed', result: { kind: 'shipment-result', context_id: req.context_id, order_no: req.order_no, rolls: req.rolls, status: 'shipped', shipment_no: shipNo } }
        }
        // 只給訂單（尚未配貨）：建立出貨單草稿，待生管配貨後出貨
        const order = first(c, 'order-intake')
        if (!order) throw new A2AError(ERR.invalidParams, 'shipment-request or order-intake data part required')
        return { state: 'completed', result: { kind: 'shipment-draft', context_id: order.context_id, order_no: order.order_no, lines: order.lines.map((l: any) => ({ line_no: l.line_no, qty_yd: l.qty_yd, status: 'awaiting-allocation' })) } }
      },
      'release-reservation': async (c) => {
        const req = first(c, 'release-reservation')
        if (!req) throw new A2AError(ERR.invalidParams, 'release-reservation data part required')
        const rolls = inventory.release(req.context_id, c.agent, req.error_code ?? 'requested')
        return { state: 'completed', result: { kind: 'release-reservation', context_id: req.context_id, order_no: req.order_no, rolls: rolls.map((r) => ({ roll_code: r, qty_yd: 0 })), status: 'released', error_code: req.error_code } }
      },
    },
  }
  class BadJson extends Error {}
  const ACCEPT: Record<string, string[]> = { 'match-print-palette': ['image/png'], 'route-line': ['image/png'], 'map-order': ['image/png'] }

  // ---------- 執行任務
  async function run(agent: string, t: Task, c: Ctx, resume?: any): Promise<void> {
    if (TERMINAL.includes(t.status.state)) return
    setState(t, 'working')
    try {
      const out = await SKILLS[agent][t.metadata.skill](c, resume)
      if (TERMINAL.includes(t.status.state)) return // 執行中被取消
      t.artifacts = out.result ? [{ artifactId: rid('art'), name: t.metadata.skill, parts: [{ kind: 'data', data: out.result }] }] : []
      setState(t, out.state, out.state === 'input-required' ? out.text : undefined)
    } catch (e: any) {
      if (e instanceof BadJson) { t.metadata.error_code = 'E_BAD_RESPONSE'; setState(t, 'failed', 'agent produced a malformed response'); throw e }
      if (TERMINAL.includes(t.status.state)) return
      t.metadata.error_code = e instanceof A2AError ? e.code : ERR.internal
      t.metadata.error_message = String(e?.message ?? e)
      trace(t.contextId, agent, 'error', { taskId: t.id, error_code: t.metadata.error_code, message: t.metadata.error_message })
      // 下游回的錯誤（含對方的 -32603）只讓本任務以 failed 結束並記錄代碼，不當成本代理人自己的 JSON-RPC 錯誤往上丟
      setState(t, e?.code === 'E_CANCELED' ? 'canceled' : 'failed', t.metadata.error_message)
    }
  }

  async function messageSend(agent: string, params: any, caller: string): Promise<any> {
    const m: Message = params?.message
    if (!m || typeof m !== 'object' || !Array.isArray(m.parts) || !m.parts.length) throw new A2AError(ERR.invalidParams, 'params.message with parts is required')
    if (typeof m.messageId !== 'string' || !m.messageId) throw new A2AError(ERR.invalidParams, 'message.messageId is required')
    const skill: string = params.metadata?.skill ?? m.metadata?.skill
    const fault = o.testFaults ? params.metadata?.test_fault : undefined
    // 冪等：同一代理人、同一 messageId
    const hash = sha(jcs({ m, metadata: params.metadata ?? null }))
    const key = `${agent}|${m.messageId}`
    const seen = byMsg.get(key)
    if (seen) {
      if (seen.hash !== hash) throw new A2AError(ERR.invalidParams, 'messageId already used with different content', { taskId: seen.taskId })
      const t = tasks.get(seen.taskId)!
      trace(t.contextId, agent, 'message-in', { duplicateOf: t.id, messageId: m.messageId, from: caller })
      return snapshot(t)
    }
    const data = m.parts.filter((p): p is Extract<Part, { kind: 'data' }> => p.kind === 'data').map((p) => p.data)
    const files = m.parts.filter((p): p is Extract<Part, { kind: 'file' }> => p.kind === 'file').map((p) => p.file)
    // 續作既有任務（input-required）
    if (m.taskId) {
      const t = tasks.get(m.taskId)
      if (!t) throw new A2AError(ERR.taskNotFound, `task ${m.taskId} not found`)
      if (TERMINAL.includes(t.status.state)) throw new A2AError(ERR.unsupported, `task ${t.id} is ${t.status.state} (terminal) and cannot accept messages`, { state: t.status.state })
      if (t.status.state !== 'input-required') throw new A2AError(ERR.unsupported, `task ${t.id} is ${t.status.state}, not waiting for input`)
      byMsg.set(key, { taskId: t.id, hash })
      t.history.push(m)
      trace(t.contextId, agent, 'message-in', { taskId: t.id, messageId: m.messageId, from: caller, resume: true })
      const orig = t.history[0]
      const c: Ctx = { agent, task: t, data: orig.parts.filter((p: any) => p.kind === 'data').map((p: any) => p.data), files: orig.parts.filter((p: any) => p.kind === 'file').map((p: any) => p.file), meta: (t as any)._meta, fault: (t as any)._fault }
      await run(agent, t, c, data[0] ?? {})
      return snapshot(t)
    }
    // 內容類型
    const accepts = ACCEPT[skill] ?? []
    const badFile = files.find((f) => !f.mimeType || !accepts.includes(f.mimeType))
    if (badFile) throw new A2AError(ERR.contentType, `content type ${badFile.mimeType ?? 'unknown'} is not supported by ${skill}`)
    // DataPart Schema
    for (const d of data) {
      const sch = o.schemas[SCHEMA_OF[d?.kind]]
      if (!sch) throw new A2AError(ERR.invalidParams, `unknown data kind ${d?.kind}`)
      const errs = validateSchema(sch, d)
      if (errs.length) throw new A2AError(ERR.invalidParams, 'DataPart does not match its schema', { schema: sch.$id, errors: errs })
    }
    const contextId = m.contextId ?? rid('ctx')
    const t: Task = { kind: 'task', id: rid('task'), contextId, status: { state: 'submitted', timestamp: '' }, history: [m], artifacts: [], metadata: { agent, skill: skill ?? '', model: MODEL, transitions: [] } }
    ;(t as any)._meta = params.metadata ?? {}; (t as any)._fault = fault
    tasks.set(t.id, t); byMsg.set(key, { taskId: t.id, hash })
    trace(contextId, agent, 'message-in', { taskId: t.id, messageId: m.messageId, from: caller, skill })
    setState(t, 'submitted')
    if (!skill || !SKILLS[agent][skill]) { setState(t, 'rejected', `${agent} does not offer skill ${skill}`); return snapshot(t) }
    if (fault === 'db_fail') {
      t.metadata.error_code = ERR.internal; t.metadata.error_message = 'simulated database failure'
      trace(contextId, agent, 'error', { taskId: t.id, error_code: ERR.internal })
      setState(t, 'failed', 'simulated database failure')
      throw new A2AError(ERR.internal, 'Internal error', { taskId: t.id })
    }
    const c: Ctx = { agent, task: t, data, files, meta: params.metadata ?? {}, fault }
    if (params.configuration?.blocking === false) {
      setTimeout(() => { run(agent, t, c).catch(() => {}) }, 300)
      return snapshot(t)
    }
    await run(agent, t, c)
    return snapshot(t)
  }

  // ---------- HTTP 入口
  async function handle(agent: string, req: { headers: Record<string, string | undefined>; body: string }): Promise<{ status: number; body: string; contentType?: string }> {
    const json = (status: number, v: any) => ({ status, body: JSON.stringify(v) })
    if (!SKILLS[agent]) return json(404, { error: 'unknown agent' })
    const auth = req.headers.authorization ?? ''
    if (!auth.startsWith('Bearer ')) return { ...json(401, { error: 'missing bearer token' }) }
    const v = verifyJwt(auth.slice(7), o.jwks)
    if (!v.ok) return json(401, { error: `invalid token: ${v.why}` })
    let rpc: any
    try { rpc = JSON.parse(req.body) } catch { return json(200, { jsonrpc: '2.0', id: null, error: { code: ERR.parse, message: 'Parse error' } }) }
    if (!rpc || rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') return json(200, { jsonrpc: '2.0', id: rpc?.id ?? null, error: { code: ERR.invalidRequest, message: 'Invalid Request' } })
    const ok = (result: any) => json(200, { jsonrpc: '2.0', id: rpc.id, result })
    const fail = (e: any) => json(200, { jsonrpc: '2.0', id: rpc.id, error: { code: e.code ?? ERR.internal, message: e.message, ...(e.data ? { data: e.data } : {}) } })
    try {
      switch (rpc.method) {
        case 'message/send': return ok(await messageSend(agent, rpc.params, v.claims.sub))
        case 'tasks/get': {
          const t = tasks.get(rpc.params?.id)
          if (!t || t.metadata.agent !== agent) throw new A2AError(ERR.taskNotFound, `task ${rpc.params?.id} not found`)
          return ok(snapshot(t))
        }
        case 'tasks/cancel': {
          const t = tasks.get(rpc.params?.id)
          if (!t || t.metadata.agent !== agent) throw new A2AError(ERR.taskNotFound, `task ${rpc.params?.id} not found`)
          if (TERMINAL.includes(t.status.state)) throw new A2AError(ERR.taskNotCancelable, `task ${t.id} is ${t.status.state}`)
          cancelFlags.add(t.id)
          t.metadata.error_code = 'E_CANCELED'
          setState(t, 'canceled', 'canceled by caller')
          // 被取消的任務若已預留布卷，立刻請出貨代理人釋放（不等執行中的步驟結束）
          if (inventory.reservedFor(t.contextId).length && agent === 'production') {
            const order = t.history[0].parts.map((p: any) => p.data).find((d: any) => d?.kind === 'order-intake')
            await send(agent, 'shipping', 'release-reservation', [{ kind: 'data', data: { kind: 'release-reservation', context_id: t.contextId, order_no: order?.order_no ?? '', error_code: 'E_CANCELED' } }], { contextId: t.contextId }).catch(() => inventory.release(t.contextId, agent, 'fallback'))
          }
          return ok(snapshot(t))
        }
        case 'tasks/pushNotificationConfig/set': case 'tasks/pushNotificationConfig/get': case 'tasks/pushNotificationConfig/list': case 'tasks/pushNotificationConfig/delete':
          throw new A2AError(ERR.pushNotSupported, 'Push notifications are not supported')
        case 'message/stream': case 'tasks/resubscribe': case 'agent/getAuthenticatedExtendedCard':
          throw new A2AError(ERR.unsupported, `${rpc.method} is not supported by this agent`)
        default: throw new A2AError(ERR.methodNotFound, 'Method not found')
      }
    } catch (e: any) {
      if (e instanceof BadJson) return { status: 200, body: '<html><body>502 upstream glitch</body></html>', contentType: 'text/html' }
      return fail(e)
    }
  }

  return {
    handle, send, discover, inventory,
    trace: (contextId: string) => traces.get(contextId) ?? [],
    contexts: () => [...traces.keys()],
    task: (id: string) => tasks.get(id),
    taskCount: () => tasks.size,
    agents: Object.keys(SKILLS),
    model: MODEL,
  }
}
export type A2A = ReturnType<typeof createA2A>

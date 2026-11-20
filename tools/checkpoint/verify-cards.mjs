// 驗證四份 Agent Card 的 JWS 簽章（ES256，payload＝去掉 signatures 後的 RFC 8785 正規化 JSON），並示範竄改後驗證失敗。
//   node tools/checkpoint/verify-cards.mjs            讀 checkpoint-data/c1/agent-cards
//   node tools/checkpoint/verify-cards.mjs --online   改從線上 /.well-known/agent-card.json 與 jku 取（服務發現）
import { createPublicKey, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const DIR = new URL('../../checkpoint-data/c1/agent-cards/', import.meta.url)
const online = process.argv.includes('--online')
const registry = JSON.parse(readFileSync(new URL('registry.json', DIR), 'utf8'))
const jcs = (v) => (v === null || typeof v !== 'object' ? JSON.stringify(v) : Array.isArray(v) ? `[${v.map(jcs).join(',')}]` : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`)

async function load(agent) {
  if (!online) return JSON.parse(readFileSync(new URL(`${agent.key}.json`, DIR), 'utf8'))
  const r = await fetch(agent.card_url)
  if (!r.ok) throw new Error(`${agent.card_url} → HTTP ${r.status}`)
  return r.json()
}
async function keys(jku) {
  if (!online) return JSON.parse(readFileSync(new URL('jwks.json', DIR), 'utf8')).keys
  return (await (await fetch(jku)).json()).keys
}
async function check(card) {
  const { signatures, ...body } = card
  const sig = signatures?.[0]
  if (!sig) return { ok: false, why: 'no signature' }
  const header = JSON.parse(Buffer.from(sig.protected, 'base64url').toString())
  const jwk = (await keys(header.jku)).find((k) => k.kid === header.kid)
  if (!jwk) return { ok: false, why: `kid ${header.kid} not found` }
  const signingInput = Buffer.from(`${sig.protected}.${Buffer.from(jcs(body)).toString('base64url')}`)
  const ok = verify('sha256', signingInput, { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(sig.signature, 'base64url'))
  return { ok, alg: header.alg, kid: header.kid }
}

let pass = 0
for (const agent of registry.agents) {
  const card = await load(agent)
  const good = await check(card)
  const tampered = await check({ ...card, description: card.description + ' (tampered)' })
  const both = good.ok && !tampered.ok
  if (both) pass++
  console.log(`${both ? 'PASS' : 'FAIL'}  ${agent.key.padEnd(14)} signature ${good.ok ? 'valid' : 'INVALID ' + (good.why ?? '')}; tampered copy ${tampered.ok ? 'ACCEPTED (bad)' : 'rejected'}; skills: ${card.skills.map((s) => s.id).join(', ')}`)
}
console.log(`${pass}/${registry.agents.length} agent cards verified${online ? ' (online discovery)' : ''}`)
process.exit(pass === registry.agents.length ? 0 : 1)

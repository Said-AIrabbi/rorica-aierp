// 本機 A2A 伺服器：四個代理人的 JSON-RPC 端點，加上 Agent Card、JWKS、registry、Schema 的靜態檔。
//   路徑與正式站相同（/a2a/<agent>、/a2a/<agent>/.well-known/agent-card.json、/a2a/jwks.json）；
//   名片與 registry 裡寫的是正式網址，交辦時改指本機。
//   單獨啟動：npx tsx --tsconfig tsconfig.app.json tools/a2a/serve.mts [port]
import { createServer, type Server } from 'node:http'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { createPrivateKey } from 'node:crypto'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createA2A, signJwt, type A2A } from './core'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const CP = join(ROOT, 'checkpoint-data')
const PUB = join(ROOT, 'public')
const PUBLIC_ORIGIN = 'https://rorica-aierp.vercel.app'
const AGENTS = ['order-intake', 'production', 'color-control', 'shipping']
const j = (f: string) => JSON.parse(readFileSync(f, 'utf8'))

export interface Running { origin: string; a2a: A2A; server: Server; token: (sub?: string, ttlSec?: number) => string; close: () => Promise<void> }

export async function startA2A(opts: { port?: number; testFaults?: boolean; downstreamTimeoutMs?: number } = {}): Promise<Running> {
  const lib = await import(pathToFileURL(join(ROOT, 'tools/checkpoint/lib.mjs')).href)
  const snap = j(join(CP, '.generated/erp-snapshot.json')); const data = snap.data ?? snap
  const jwks = j(join(PUB, 'a2a/jwks.json'))
  const keyFile = join(CP, '.keys/a2a-signing-key.jwk.json')
  if (!existsSync(keyFile)) throw new Error('signing key missing: checkpoint-data/.keys/a2a-signing-key.jwk.json')
  const signingKey = createPrivateKey({ key: j(keyFile), format: 'jwk' })
  const kid = jwks.keys[0].kid
  const cards = Object.fromEntries(AGENTS.map((a) => [a, j(join(PUB, `a2a/${a}/.well-known/agent-card.json`))]))
  const schemas = Object.fromEntries(['order-intake', 'colour-request', 'shipment'].map((s) => [s, j(join(PUB, `a2a/schemas/${s}.schema.json`))]))
  let origin = ''
  const a2a = createA2A({
    publicOrigin: PUBLIC_ORIGIN, localOrigin: () => origin,
    cards, jwks, registry: j(join(CP, 'c1/agent-cards/registry.json')), schemas,
    labels: data.fabricLabels, reservations: data.stockReservations,
    colourDb: j(join(CP, 'b1/colours.json')).colours.map((c: any) => ({ id: c.id, lab: c.lab, zh: c.zh })),
    recipes: j(join(CP, 'b1/recipes.json')).recipes,
    loadImage: (ref) => lib.decodePng(readFileSync(join(CP, ref.replace(/^\/+/, '')))),
    colour: lib.ColourMatch, signingKey, kid,
    testFaults: !!opts.testFaults, downstreamTimeoutMs: opts.downstreamTimeoutMs ?? 1000,
  })
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    const send = (status: number, body: string, type = 'application/json') => { res.writeHead(status, { 'content-type': type }); res.end(body) }
    try {
      if (req.method === 'GET') {
        const m = url.pathname.match(/^\/a2a\/([a-z-]+)\/\.well-known\/agent-card\.json$/)
        if (m && cards[m[1]]) return send(200, JSON.stringify(cards[m[1]]))
        if (url.pathname === '/a2a/jwks.json') return send(200, JSON.stringify(jwks))
        if (url.pathname === '/a2a/registry.json') return send(200, readFileSync(join(CP, 'c1/agent-cards/registry.json'), 'utf8'))
        const s = url.pathname.match(/^\/a2a\/schemas\/([a-z-]+\.schema\.json)$/)
        if (s && existsSync(join(PUB, 'a2a/schemas', s[1]))) return send(200, readFileSync(join(PUB, 'a2a/schemas', s[1]), 'utf8'))
        const t = url.pathname.match(/^\/a2a\/_trace\/(.+)$/)
        if (t) return send(200, JSON.stringify({ contextId: decodeURIComponent(t[1]), events: a2a.trace(decodeURIComponent(t[1])) }))
        return send(404, '{"error":"not found"}')
      }
      const m = url.pathname.match(/^\/a2a\/([a-z-]+)$/)
      if (req.method === 'POST' && m) {
        const chunks: Buffer[] = []; for await (const c of req) chunks.push(c as Buffer)
        const out = await a2a.handle(m[1], { headers: { authorization: req.headers.authorization }, body: Buffer.concat(chunks).toString('utf8') })
        return send(out.status, out.body, out.contentType)
      }
      send(404, '{"error":"not found"}')
    } catch (e: any) { send(500, JSON.stringify({ error: String(e?.message ?? e) })) }
  })
  await new Promise<void>((r) => server.listen(opts.port ?? 0, '127.0.0.1', () => r()))
  const addr = server.address() as any
  origin = `http://127.0.0.1:${addr.port}`
  const token = (sub = 'test-harness', ttlSec = 300) => signJwt(signingKey, kid, { iss: sub, sub, aud: 'rorica-a2a', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSec })
  return { origin, a2a, server, token, close: () => new Promise((r) => server.close(() => r())) }
}

if (process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('tools/a2a/serve.mts')) {
  startA2A({ port: Number(process.argv[2] ?? 8790) }).then((s) => console.log(`A2A agents on ${s.origin}/a2a/<agent>`))
}

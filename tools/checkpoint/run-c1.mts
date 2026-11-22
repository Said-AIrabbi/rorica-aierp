// C1-1：100 筆 A2A 交辦任務。發起代理人以自己的 A2A 用戶端（服務發現 → 驗名片 JWS → 帶 JWT 送 message/send）
// 交給接收代理人，接收代理人做完回傳 Task。成功＝回到發起端的 Task 為預期終態、含結果，且接收端確實建立並完成該任務。
//   npx tsx --tsconfig tsconfig.app.json tools/checkpoint/run-c1.mts
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { startA2A } from '../a2a/serve.mts'

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..', '..')
const lib = await import(pathToFileURL(join(ROOT, 'tools/checkpoint/lib.mjs')).href)
const { readJson, writeOut, writeCsv, pct } = lib
const s = await startA2A()
const tasks = readJson('c1/a2a-tasks.json').tasks as any[]
const ranAt = new Date().toISOString()
const rows: any[] = []
for (const t of tasks) {
  const t0 = performance.now()
  let res: any = null, err: any = null
  try { res = await s.a2a.send(t.from.agent, t.to.agent, t.skill, [{ kind: 'data', data: t.input }], { contextId: t.contextId, messageId: t.messageId }) } catch (e: any) { err = { code: e.code, message: e.message } }
  const ms = Math.round(performance.now() - t0)
  const remote = res ? s.a2a.task(res.id) : undefined
  const hasResult = !!res?.artifacts?.[0]?.parts?.length
  const ok = !!res && res.status.state === t.expected_terminal_state && hasResult && remote?.metadata.agent === t.to.agent && remote?.metadata.skill === t.skill
  const tr = s.a2a.trace(t.contextId)
  rows.push({
    task_no: t.task_no, messageId: t.messageId, contextId: t.contextId,
    from: t.from.agent, to: t.to.agent, skill: t.skill, model_label: `${t.from.model}→${t.to.model}`, runtime_model: s.a2a.model,
    remote_task_id: res?.id ?? null, final_state: res?.status.state ?? 'error', transitions: res?.metadata.transitions.map((x: any) => x.state).join('→') ?? '',
    result_kind: res?.artifacts?.[0]?.parts?.[0]?.data?.kind ?? null, error: err, ms,
    forwarded: tr.some((e) => e.type === 'message-out' && e.agent === t.from.agent), received: tr.some((e) => e.type === 'message-in' && e.agent === t.to.agent),
    pass: ok,
  })
}
const passed = rows.filter((r) => r.pass).length
const summary = { ran_at: ranAt, total: rows.length, passed, success_rate: pct(passed, rows.length), threshold: 90, runtime_model: s.a2a.model, note: '代理人目前為規則運算（rule-based），未呼叫 AI 模型；model-a／model-b 為資料中的標記' }
writeOut('c1/task-results.json', { ...summary, tasks: rows })
writeCsv('c1/task-results.csv', ['#', 'messageId', 'contextId', '發起', '接收', 'skill', '接收端任務', '狀態轉換', '結果類型', '毫秒', '判定'], rows.map((r) => [r.task_no, r.messageId, r.contextId, r.from, r.to, r.skill, r.remote_task_id, r.transitions, r.result_kind, r.ms, r.pass ? 'PASS' : 'FAIL']))
console.log(JSON.stringify(summary, null, 1))
for (const r of rows.filter((x) => !x.pass)) console.log('FAIL', JSON.stringify(r))
await s.close(); process.exit(0)

import { useState } from 'react'
import { LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { accounts } from '@/mocks/data'

/**
 * 登入頁。
 *
 * **這是原型的展示用登入，不是真的身分驗證**——密碼在前端明文比對，
 * 任何人開 devtools 都能繞過。它存在的目的只有一個：讓權限規格的三層控制
 * （側欄／按鈕／欄位）演得出來，換個帳號進來就看得到畫面跟著變。
 * 正式系統的帳密、雜湊與連線階段管理屬後端工作（docs/backend-infra-requirements.md）。
 */
export function LoginPage({ onSignIn }: { onSignIn: (code: string, password: string) => void }) {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      onSignIn(code, password)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-muted p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-brand text-lg font-bold text-white">
            皇
          </div>
          <div>
            <h1 className="text-lg font-semibold text-ink">皇加布業 ERP</h1>
            <p className="text-xs text-muted-foreground">進銷存模組 Phase 1</p>
          </div>
        </div>

        <form onSubmit={submit} className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-body">帳號</span>
              <input
                value={code}
                onChange={(e) => {
                  setCode(e.target.value)
                  setError(undefined)
                }}
                autoFocus
                autoComplete="username"
                placeholder="R001"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-ink-body">密碼</span>
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  setError(undefined)
                }}
                autoComplete="current-password"
                className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand"
              />
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <Button type="submit" className="mt-4 w-full bg-brand hover:bg-brand-dark">
            <LogIn className="mr-1.5 h-4 w-4" /> 登入
          </Button>
        </form>

        {/*
          測試帳號一覽：原型是給皇加試用的，藏起來只會讓人問「帳號是什麼」。
          正式系統當然不會有這一塊。
        */}
        <div className="mt-4 rounded-xl border border-border bg-surface p-4 text-xs">
          <p className="mb-2 font-medium text-ink-body">測試帳號（原型展示用，密碼皆為 0000）</p>
          <table className="w-full">
            <tbody>
              {accounts
                .filter((a) => a.status === '啟用')
                .map((a) => (
                  <tr key={a.id} className="border-t border-border/60 first:border-t-0">
                    <td className="py-1 pr-2">
                      <button
                        type="button"
                        className="font-mono text-brand hover:underline"
                        onClick={() => {
                          setCode(a.code)
                          setPassword('0000')
                          setError(undefined)
                        }}
                      >
                        {a.code}
                      </button>
                    </td>
                    <td className="py-1 pr-2 text-muted-foreground">{a.name}</td>
                    <td className="py-1 text-right text-muted-foreground">{a.roles.join('、')}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="mt-2 leading-relaxed text-muted-foreground">
            點帳號即可自動填入。不同角色登入後，左側選單、單據上的按鈕與金額欄位都會依權限規格改變。
          </p>
        </div>
      </div>
    </div>
  )
}

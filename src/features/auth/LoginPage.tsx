import { useState } from 'react'
import { KeyRound, LogIn } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { isSsoConfigured, startSso } from '@/lib/sso'

/**
 * 登入頁。
 *
 * **這是原型的展示用登入，不是真的身分驗證**——密碼在前端明文比對，
 * 任何人開 devtools 都能繞過。它存在的目的只有一個：讓權限規格的三層控制
 * （側欄／按鈕／欄位）演得出來，換個帳號進來就看得到畫面跟著變。
 * 正式系統的帳密、雜湊與連線階段管理屬後端工作（docs/backend-infra-requirements.md）。
 *
 * 頁面上不列任何帳號、密碼或帳號格式提示；連續輸錯的暫時鎖定在 mocks/session.ts 的 signIn 處理。
 * 設定了選布平台單一登入（VITE_ERP_SSO_PUBLIC_KEY）時，以它為主要登入方式，帳密收起來當備援。
 */
export function LoginPage({
  onSignIn,
  ssoError,
}: {
  onSignIn: (code: string, password: string) => void
  /** 選布平台單一登入失敗的原因（lib/sso.ts），顯示在單一登入按鈕下 */
  ssoError?: string
}) {
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  // 有設定單一登入時，帳密表單收起來當備援；沒設定就直接顯示表單
  const sso = isSsoConfigured()
  const [showPassword, setShowPassword] = useState(!sso)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    try {
      onSignIn(code, password)
    } catch (err) {
      setError((err as Error).message)
      // 輸錯即清空密碼，不讓錯誤的密碼留在畫面上
      setPassword('')
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

        {sso && (
          <div className="mb-3 rounded-xl border border-border bg-surface p-5 shadow-sm">
            <Button type="button" onClick={startSso} className="w-full bg-brand hover:bg-brand-dark">
              <KeyRound className="mr-1.5 h-4 w-4" /> 以選布平台帳號登入
            </Button>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              會先轉到選布平台；已在選布平台登入的內部人員會直接回到 ERP。
            </p>
            {ssoError && (
              <p className="mt-3 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                {ssoError}
              </p>
            )}
            {!showPassword && (
              <button
                type="button"
                onClick={() => setShowPassword(true)}
                className="mt-3 w-full text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                改用 ERP 帳號密碼登入
              </button>
            )}
          </div>
        )}

        {showPassword && (
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
        )}

        {/* 帳號與密碼一律另行提供，登入頁不列出任何帳號、密碼或帳號格式 */}
        <p className="mt-4 text-center text-xs text-muted-foreground">帳號密碼請洽系統管理員</p>
      </div>
    </div>
  )
}

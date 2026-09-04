import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { DeleteMasterButton } from '@/components/shared/DeleteMasterButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/mocks/api'
import { createAccount, deleteAccount, masterDefaults, updateAccount, type AccountInput } from '@/mocks/mutations'
import { ROLE_PERMISSION_MATRIX, type Account, type AccountRole } from '@/types'

const ACCOUNT_ROLES = Object.keys(ROLE_PERMISSION_MATRIX) as AccountRole[]

function toInput(account: Account): AccountInput {
  const { id: _id, ...rest } = account
  return rest
}

/** 新增時的空白表單：代碼先給下一個流水號當預設值，使用者可自行改寫 */
function emptyInput(): AccountInput {
  return {
    code: masterDefaults.accountCode(),
    name: '',
    password: '',
    mailbox: '',
    phone: '',
    roles: [],
    status: '啟用',
  }
}

export function AccountDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data = [] } = useQuery({ queryKey: ['accounts'], queryFn: api.accounts })
  // 新增與編輯共用同一份表單：路由 /masters/accounts/new 即為新增模式
  const isNew = id === 'new'
  const account = data.find((a) => a.id === id)
  const [draft, setDraft] = useState<AccountInput | null>(isNew ? emptyInput() : null)

  useEffect(() => {
    if (account) setDraft(toInput(account))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id])

  const mutation = useMutation({
    mutationFn: () => (isNew ? createAccount(draft!) : updateAccount(id!, draft!)),
    onSuccess: async (saved) => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(isNew ? `已建立帳號 ${saved.code} ${saved.name}` : `${saved.name} 帳號資料已更新`)
      if (isNew) navigate(`/masters/accounts/${saved.id}`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteAccount(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] })
      toast.success(`已刪除帳號 ${account?.name ?? id}`)
      navigate('/masters/accounts')
    },
    // 已在單據留下經手紀錄者由 mutation 層擋下，錯誤訊息原文顯示（含引用的單號）
    onError: (error: Error) => toast.error(error.message),
  })

  if ((!account && !isNew) || !draft) {
    return <div className="text-sm text-muted-foreground">找不到帳號資料</div>
  }

  const set = <K extends keyof AccountInput>(key: K, value: AccountInput[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  const dirty = isNew || (account ? JSON.stringify(draft) !== JSON.stringify(toInput(account)) : false)

  return (
    <div>
      <PageHeader
        title={isNew ? '新增帳號' : `${account!.code}　${account!.name}`}
        description="帳號主檔編輯視窗。系統編號為建檔時自動產生的主鍵，不可修改；角色為多選，欄位層級權限依角色矩陣決定。人員離職請改為「停用」，保留單據上的經手紀錄。"
        actions={
          <>
            <Button variant="outline" onClick={() => navigate('/masters/accounts')}>
              <ArrowLeft className="mr-1 h-4 w-4" />
              返回列表
            </Button>
            {!isNew && (
              <DeleteMasterButton
                label="帳號"
                name={`${account!.code} ${account!.name}`}
                pending={deleteMutation.isPending}
                onConfirm={() => deleteMutation.mutate()}
              />
            )}
            <Button onClick={() => mutation.mutate()} disabled={!dirty || mutation.isPending}>
              <Save className="mr-1 h-4 w-4" />
              {isNew ? '建立帳號' : '儲存帳號資料'}
            </Button>
          </>
        }
      />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>帳號資料</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1">
              <Label className="text-xs">系統編號（唯讀）</Label>
              <Input value={isNew ? '建立後自動產生' : account!.id} disabled />
              <p className="text-xs text-muted-foreground">建檔時自動編號，單據以此關聯</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">帳戶代碼</Label>
              <Input value={draft.code} onChange={(e) => set('code', e.target.value)} />
              <p className="text-xs text-muted-foreground">登入用代號，須全檔唯一</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">姓名</Label>
              <Input value={draft.name} onChange={(e) => set('name', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">密碼</Label>
              {/* 以 password 型別輸入，畫面不回顯明碼；模擬資料不含任何可用密碼 */}
              <Input
                type="password"
                value={draft.password}
                onChange={(e) => set('password', e.target.value)}
                placeholder={isNew ? '請設定初始密碼' : '如需變更請直接輸入新密碼'}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">信箱</Label>
              <Input value={draft.mailbox} onChange={(e) => set('mailbox', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">電話</Label>
              <Input value={draft.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">帳戶狀態</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={draft.status}
                onChange={(e) => set('status', e.target.value as Account['status'])}
              >
                <option value="啟用">啟用</option>
                <option value="停用">停用</option>
              </select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>角色（可複選）</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3">
              {ACCOUNT_ROLES.map((role) => (
                <label key={role} className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={draft.roles.includes(role)}
                    onChange={(e) =>
                      set('roles', e.target.checked ? [...draft.roles, role] : draft.roles.filter((r) => r !== role))
                    }
                  />
                  {role}
                </label>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              角色決定欄位層級權限（見帳號主檔列表下方的權限矩陣）；一人可兼多重角色，權限取聯集。
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, Check, Eye, Plus, Save, Star } from 'lucide-react'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { bankAccountScopeText } from '@/lib/company'
import { useCurrentAccount } from '@/lib/current-account-context'
import { formatDateTime } from '@/lib/dates'
import { api } from '@/mocks/api'
import {
  saveCompanyBankAccount,
  setCompanyBankAccountStatus,
  updateCompanyProfile,
  type CompanyBankAccountInput,
  type CompanyProfileInput,
} from '@/mocks/mutations'
import { PI_CURRENCIES, type CompanyBankAccount, type CompanyProfile, type PiCurrency } from '@/types'

/**
 * 系統設定／公司資訊（決策136）。
 *
 * 皇加自身的資料：公司抬頭（十張單據的列印抬頭都由此帶出）與收款帳戶（印在 PI 上）。
 * 只有一筆，故沒有列表、沒有新增、沒有刪除——這也是它不列為第六張主檔的原因。
 */
function toProfileInput(profile: CompanyProfile): CompanyProfileInput {
  return {
    name: profile.name,
    nameEn: profile.nameEn,
    taxId: profile.taxId,
    address: profile.address,
    addressEn: profile.addressEn ?? '',
    phone: profile.phone,
    fax: profile.fax ?? '',
  }
}

function emptyAccount(): CompanyBankAccountInput {
  return {
    bankName: '',
    bankNameEn: '',
    bankCode: '',
    swift: '',
    accountName: '',
    accountNo: '',
    bankAddress: '',
    currencies: [],
    note: '',
  }
}

function toAccountInput(account: CompanyBankAccount): CompanyBankAccountInput {
  const { status: _status, ...rest } = account
  return { ...rest, currencies: account.currencies ?? [] }
}

export function CompanyProfilePage() {
  const queryClient = useQueryClient()
  const { canMaintain } = useCurrentAccount()
  const editable = canMaintain('公司')
  const { data: profile } = useQuery({
    queryKey: ['companyProfile'],
    queryFn: api.companyProfile,
  })

  const [draft, setDraft] = useState<CompanyProfileInput | null>(null)
  const [editing, setEditing] = useState<CompanyBankAccountInput | null>(null)

  useEffect(() => {
    if (profile) setDraft(toProfileInput(profile))
  }, [profile])

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['companyProfile'] })

  const saveProfile = useMutation({
    mutationFn: () => updateCompanyProfile(draft!),
    onSuccess: async () => {
      await invalidate()
      toast.success('公司基本資料已更新')
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const saveAccount = useMutation({
    mutationFn: () => saveCompanyBankAccount(editing!),
    onSuccess: async (saved) => {
      await invalidate()
      setEditing(null)
      toast.success(`已儲存收款帳戶 ${saved.bankName}`)
    },
    onError: (error: Error) => toast.error(error.message),
  })

  const toggleStatus = useMutation({
    mutationFn: (vars: { id: string; status: CompanyBankAccount['status'] }) =>
      setCompanyBankAccountStatus(vars.id, vars.status),
    onSuccess: async (saved) => {
      await invalidate()
      toast.success(`${saved.bankName} 已${saved.status}`)
    },
    // 「至少保留一個啟用帳戶」的卡控訊息原文顯示給使用者
    onError: (error: Error) => toast.error(error.message),
  })

  if (!profile || !draft) return <div className="text-sm text-muted-foreground">載入中…</div>

  const set = <K extends keyof CompanyProfileInput>(key: K, value: CompanyProfileInput[K]) =>
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev))
  const dirty = JSON.stringify(draft) !== JSON.stringify(toProfileInput(profile))

  const setAccount = <K extends keyof CompanyBankAccountInput>(key: K, value: CompanyBankAccountInput[K]) =>
    setEditing((prev) => (prev ? { ...prev, [key]: value } : prev))

  const toggleCurrency = (currency: PiCurrency, checked: boolean) => {
    const current = editing?.currencies ?? []
    setAccount('currencies', checked ? [...current, currency] : current.filter((c) => c !== currency))
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="公司資訊"
        description="皇加自身的資料。公司抬頭為所有單據列印抬頭的來源；收款帳戶印在交給客戶的 PI 上，供客戶匯款。全系統僅此一筆，不可新增或刪除。"
        actions={
          editable ? (
            <Button onClick={() => saveProfile.mutate()} disabled={!dirty || saveProfile.isPending}>
              <Save className="mr-1 h-4 w-4" />
              儲存基本資料
            </Button>
          ) : undefined
        }
      />

      {/* 唯讀身分（如業務）看得到內容但不能改：收款帳戶本來就印在客戶手上那張紙上 */}
      {!editable && (
        <div className="flex items-start gap-2 rounded-lg border border-border bg-muted/50 p-3 text-sm text-ink-body">
          <Eye className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <span>
            公司資訊由<b>管理層、財務或管理員</b>維護，目前身分為唯讀。 收款帳戶仍完整顯示——它印在交給客戶的 PI
            上，是對外公開資訊。
          </span>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>公司抬頭</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">公司名稱</Label>
            <Input value={draft.name} onChange={(e) => set('name', e.target.value)} disabled={!editable} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">英文名稱</Label>
            <Input value={draft.nameEn} onChange={(e) => set('nameEn', e.target.value)} disabled={!editable} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">統一編號</Label>
            <Input value={draft.taxId} onChange={(e) => set('taxId', e.target.value)} disabled={!editable} />
            <p className="text-xs text-muted-foreground">對廠商單據上的買方統編由此帶出</p>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">地址</Label>
            <Input value={draft.address} onChange={(e) => set('address', e.target.value)} disabled={!editable} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">英文地址</Label>
            <Input
              value={draft.addressEn ?? ''}
              onChange={(e) => set('addressEn', e.target.value)}
              disabled={!editable}
            />
            <p className="text-xs text-muted-foreground">PI 為英文版面，留空則沿用中文地址</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">電話</Label>
            <Input value={draft.phone} onChange={(e) => set('phone', e.target.value)} disabled={!editable} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">傳真</Label>
            <Input value={draft.fax ?? ''} onChange={(e) => set('fax', e.target.value)} disabled={!editable} />
            <p className="text-xs text-muted-foreground">留空則列印抬頭不印 FAX 欄位</p>
          </div>
          <div className="space-y-1 lg:col-span-2">
            <Label className="text-xs">最後更新</Label>
            <Input value={`${formatDateTime(profile.updatedAt)}　${profile.updatedBy}`} disabled />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>收款帳戶</CardTitle>
          {editable && (
            <Button size="sm" variant="outline" onClick={() => setEditing(emptyAccount())}>
              <Plus className="mr-1 h-4 w-4" />
              新增帳戶
            </Button>
          )}
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            帳戶只能停用、不可刪除——已送出的 PI 必須永遠印得出客戶當初被告知的帳戶。停用者不再出現在新單的選項裡。
            同一幣別可以有多個帳戶（分散銀行），請在備註寫明用途，業務開單時才知道該挑哪一個。
          </p>
          {/* 停用者排在後面並灰顯：它仍要能被看到（舊單印的是它），但不該和啟用的混在一起 */}
          {[...profile.bankAccounts]
            .sort((a, b) => (a.status === b.status ? 0 : a.status === '啟用' ? -1 : 1))
            .map((account) => (
              <div
                key={account.id}
                className={`rounded-md border border-border p-3 ${account.status === '停用' ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink">{account.bankName}</span>
                  <span className="font-mono text-sm text-ink-body">{account.accountNo}</span>
                  <Badge variant="outline">{bankAccountScopeText(account)}</Badge>
                  {account.isDefaultForCurrency && (
                    <Badge variant="secondary">
                      <Star className="mr-1 h-3 w-3" />
                      幣別預設
                    </Badge>
                  )}
                  {account.isDefault && <Badge variant="secondary">全域預設</Badge>}
                  {account.status === '停用' && <Badge variant="outline">停用</Badge>}
                  <div className="ml-auto flex gap-2">
                    {editable && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => setEditing(toAccountInput(account))}>
                          編輯
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={toggleStatus.isPending}
                          onClick={() =>
                            toggleStatus.mutate({
                              id: account.id,
                              status: account.status === '啟用' ? '停用' : '啟用',
                            })
                          }
                        >
                          {account.status === '啟用' ? (
                            <>
                              <Ban className="mr-1 h-3.5 w-3.5" />
                              停用
                            </>
                          ) : (
                            <>
                              <Check className="mr-1 h-3.5 w-3.5" />
                              啟用
                            </>
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
                <div className="mt-1.5 grid grid-cols-1 gap-x-6 gap-y-0.5 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>戶名：{account.accountName}</div>
                  <div>
                    銀行代號：{account.bankCode || '-'}　SWIFT：
                    {account.swift || '-'}
                  </div>
                  {account.bankNameEn && <div>英文行名：{account.bankNameEn}</div>}
                  {account.bankAddress && <div>受款行地址：{account.bankAddress}</div>}
                  {account.note && <div className="text-ink-body">用途：{account.note}</div>}
                </div>
              </div>
            ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>異動紀錄</CardTitle>
        </CardHeader>
        <CardContent>
          {profile.changes.length === 0 ? (
            <p className="text-sm text-muted-foreground">尚無異動紀錄。</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {[...profile.changes].reverse().map((change, i) => (
                <li key={i} className="flex flex-wrap gap-x-3 text-ink-body">
                  <span className="font-mono text-xs text-muted-foreground">{formatDateTime(change.at)}</span>
                  <span className="font-medium">{change.actorName}</span>
                  <span>{change.summary}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            異動紀錄唯讀、不可刪除，且同時通知所有人——收款帳戶被改動時，每個人都該知道。
          </p>
        </CardContent>
      </Card>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? '編輯收款帳戶' : '新增收款帳戶'}</DialogTitle>
            <DialogDescription>
              此帳戶會印在 PI 的匯款資訊欄，供客戶匯款。英文行名與受款行地址供國外匯款使用，留空則不印。
            </DialogDescription>
          </DialogHeader>

          {editing && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">銀行名稱</Label>
                <Input value={editing.bankName} onChange={(e) => setAccount('bankName', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">英文行名</Label>
                <Input value={editing.bankNameEn ?? ''} onChange={(e) => setAccount('bankNameEn', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">銀行代號</Label>
                <Input value={editing.bankCode} onChange={(e) => setAccount('bankCode', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">SWIFT</Label>
                <Input value={editing.swift} onChange={(e) => setAccount('swift', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">戶名</Label>
                <Input value={editing.accountName} onChange={(e) => setAccount('accountName', e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">帳號</Label>
                <Input value={editing.accountNo} onChange={(e) => setAccount('accountNo', e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">受款行地址</Label>
                <Input value={editing.bankAddress ?? ''} onChange={(e) => setAccount('bankAddress', e.target.value)} />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">適用幣別（可複選，不選即全幣別通用）</Label>
                <div className="flex flex-wrap items-center gap-4 pt-1">
                  {PI_CURRENCIES.map((currency) => (
                    <label key={currency} className="flex items-center gap-1.5 text-sm">
                      <input
                        type="checkbox"
                        checked={(editing.currencies ?? []).includes(currency)}
                        onChange={(e) => toggleCurrency(currency, e.target.checked)}
                      />
                      {currency}
                    </label>
                  ))}
                </div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs">用途備註</Label>
                <Input
                  value={editing.note ?? ''}
                  onChange={(e) => setAccount('note', e.target.value)}
                  placeholder="如：歐洲與港澳客戶、大額匯款用"
                />
                <p className="text-xs text-muted-foreground">
                  顯示在 PI 的帳戶下拉選項裡。同一幣別有兩家銀行時，業務靠這一行判斷該挑哪一個
                </p>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.isDefaultForCurrency ?? false}
                    onChange={(e) => setAccount('isDefaultForCurrency', e.target.checked)}
                  />
                  設為上述幣別的預設帳戶
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={editing.isDefault ?? false}
                    onChange={(e) => setAccount('isDefault', e.target.checked)}
                  />
                  設為全域預設（幣別找不到對應帳戶時的退路）
                </label>
                <p className="text-xs text-muted-foreground">
                  同一幣別只會有一個預設；勾選本帳戶時，原本的預設會自動解除
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              取消
            </Button>
            <Button onClick={() => saveAccount.mutate()} disabled={saveAccount.isPending}>
              <Save className="mr-1 h-4 w-4" />
              儲存帳戶
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

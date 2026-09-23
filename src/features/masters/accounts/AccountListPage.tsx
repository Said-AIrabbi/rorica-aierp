import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { RoleMatrixPanel } from '@/features/settings/RoleMatrixPanel'
import { ExclusionsPanel } from '@/features/settings/ExclusionsPanel'
import { api } from '@/mocks/api'
import type { Account } from '@/types'

const TABS = ['accounts', 'roles', 'exclusions'] as const
type Tab = (typeof TABS)[number]

/**
 * 帳戶主檔：帳號清單與權限設定集中在同一處，分三個分頁。
 *   帳號清單 — 誰有帳號、掛哪些角色
 *   角色權限 — 每個角色看得到哪些單據、可做哪些動作、看得到哪些欄位群組
 *   個別排除 — 針對單一帳號收緊（排除永遠勝過角色聯集）
 * 角色權限與個別排除仍分成兩個分頁（權限規格第二章「為何分兩頁」）：放在同一張表上，
 * 取消勾選對單角色的人是禁止、對多角色的人卻無效，管理員會設了以為有效。
 * 分頁記在網址（?tab=roles），重新整理或分享連結都停在同一頁。
 */
export function AccountListPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab: Tab = TABS.includes(params.get('tab') as Tab) ? (params.get('tab') as Tab) : 'accounts'
  const { data = [], isLoading } = useQuery({ queryKey: ['accounts'], queryFn: api.accounts })

  const columns = useMemo<ColumnDef<Account, unknown>[]>(
    () => [
      { accessorKey: 'code', header: '帳戶代碼' },
      { accessorKey: 'name', header: '姓名' },
      // 密碼為帳號主檔必填欄位，列表一律遮蔽顯示，不呈現明碼
      { id: 'password', header: '密碼', cell: () => <span className="text-muted-foreground">********</span> },
      { accessorKey: 'mailbox', header: '信箱' },
      { accessorKey: 'phone', header: '電話' },
      {
        id: 'roles',
        header: '角色',
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1">
            {row.original.roles.map((r) => (
              <Badge key={r} variant="secondary">
                {r}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        id: 'status',
        header: '帳戶狀態',
        cell: ({ row }) => (
          <Badge
            variant={row.original.status === '啟用' ? 'default' : 'outline'}
            className={row.original.status === '啟用' ? 'bg-brand hover:bg-brand' : ''}
          >
            {row.original.status}
          </Badge>
        ),
      },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="帳戶主檔"
        description="帳號清單與權限設定。角色（業務／生管／倉管／財務／管理層／管理員）可多選，帳號的最終權限＝所有角色的聯集－個別排除。"
        actions={
          tab === 'accounts' && (
            <Button className="bg-brand hover:bg-brand-dark" onClick={() => navigate('/masters/accounts/new')}>
              <Plus className="mr-1 h-4 w-4" /> 新增帳號
            </Button>
          )
        }
      />

      <Tabs value={tab} onValueChange={(value) => setParams(value === 'accounts' ? {} : { tab: value })}>
        <TabsList className="mb-4">
          <TabsTrigger value="accounts">帳號清單</TabsTrigger>
          <TabsTrigger value="roles">角色權限</TabsTrigger>
          <TabsTrigger value="exclusions">個別排除</TabsTrigger>
        </TabsList>

        <TabsContent value="accounts">
          <DataTable
            columns={columns}
            data={data}
            searchPlaceholder="搜尋姓名、代碼..."
            onRowClick={(row) => navigate(`/masters/accounts/${row.id}`)}
            emptyText={isLoading ? '載入中...' : '目前沒有帳戶資料'}
          />
        </TabsContent>

        <TabsContent value="roles">
          <RoleMatrixPanel />
        </TabsContent>

        <TabsContent value="exclusions">
          <ExclusionsPanel />
        </TabsContent>
      </Tabs>
    </div>
  )
}

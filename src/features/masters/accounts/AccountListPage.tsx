import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { api } from '@/mocks/api'
import type { Account, PermissionField } from '@/types'
import { ROLE_PERMISSION_MATRIX } from '@/types'

const PERMISSION_FIELDS: PermissionField[] = ['訂單基本資訊', '售價', '進價', '客戶聯絡資訊', '帳號管理']

export function AccountListPage() {
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
          <Badge variant={row.original.status === '啟用' ? 'default' : 'outline'} className={row.original.status === '啟用' ? 'bg-brand hover:bg-brand' : ''}>
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
        description="角色（生管／業務／倉管／財務／管理層／管理員，多對多）搭配欄位層級權限矩陣，示範架構，細節待客戶逐一核對確認。"
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋姓名、代碼..."
        emptyText={isLoading ? '載入中...' : '目前沒有帳戶資料'}
      />

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-base">欄位層級權限矩陣（示範架構）</CardTitle>
        </CardHeader>
        <CardContent className="px-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>角色</TableHead>
                  {PERMISSION_FIELDS.map((field) => (
                    <TableHead key={field}>{field}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {(Object.keys(ROLE_PERMISSION_MATRIX) as Array<keyof typeof ROLE_PERMISSION_MATRIX>).map((role) => (
                  <TableRow key={role}>
                    <TableCell className="font-medium">{role}</TableCell>
                    {PERMISSION_FIELDS.map((field) => (
                      <TableCell key={field}>{ROLE_PERMISSION_MATRIX[role][field]}</TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

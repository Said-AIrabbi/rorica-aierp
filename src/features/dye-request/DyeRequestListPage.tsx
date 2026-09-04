import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { api } from '@/mocks/api'
import { getProduct, getVendor } from '@/mocks/data'
import { formatDate } from '@/lib/dates'
import type { DyeRequest } from '@/types'

export function DyeRequestListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['dyeRequests'], queryFn: api.dyeRequests })

  const columns = useMemo<ColumnDef<DyeRequest, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '單號' },
      { accessorKey: 'parentId', header: '包裝通知單' },
      { accessorKey: 'buyer', header: '買方' },
      {
        id: 'product',
        header: '皇加品名',
        accessorFn: (row) => getProduct(row.productId)?.productName ?? row.productId,
      },
      { id: 'colors', header: '顏色', accessorFn: (row) => row.colors.map((c) => c.color).join('、') },
      {
        id: 'vendor',
        header: '染整廠',
        accessorFn: (row) => getVendor(row.dyeVendorId)?.name ?? row.dyeVendorId,
      },
      {
        id: 'vendorCode',
        header: '廠商代碼',
        accessorFn: (row) => getVendor(row.dyeVendorId)?.code ?? '-',
      },
      { id: 'requestDate', header: '委託日', accessorFn: (row) => formatDate(row.requestDate) },
      {
        id: 'colorSampleConfirmedAt',
        header: '色卡確認日',
        accessorFn: (row) => formatDate(row.colorSampleConfirmedAt),
      },
      {
        id: 'status',
        header: '狀態',
        accessorFn: (row) => row.status,
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="打色通知單"
        formCode="表3"
        description="色卡（客戶＋皇加品名＋色號＋染整廠）全新配色時自動觸發，與表4染整單為平行關係、無先後卡控。"
        actions={
          <Button className="bg-brand hover:bg-brand-dark" onClick={() => navigate('/dye-request/new')}>
            ＋ 新增打色通知單
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋單號、顏色..."
        onRowClick={(row) => navigate(`/dye-request/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有打色通知單'}
      />
    </div>
  )
}

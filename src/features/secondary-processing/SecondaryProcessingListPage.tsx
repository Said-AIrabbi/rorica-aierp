import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { api } from '@/mocks/api'
import { getCustomer, getVendor } from '@/mocks/data'
import { formatDate } from '@/lib/dates'
import type { SecondaryProcessingOrder } from '@/types'

export function SecondaryProcessingListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({
    queryKey: ['secondaryProcessingOrders'],
    queryFn: api.secondaryProcessingOrders,
  })

  const columns = useMemo<ColumnDef<SecondaryProcessingOrder, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '單號' },
      { accessorKey: 'parentId', header: '包裝通知單' },
      {
        id: 'customer',
        header: '客戶',
        accessorFn: (row) => getCustomer(row.customerId)?.shortName ?? row.customerId,
      },
      {
        id: 'vendor',
        header: '加工廠',
        accessorFn: (row) => getVendor(row.vendorId)?.name ?? row.vendorId,
      },
      {
        id: 'vendorCode',
        header: '廠商代碼',
        accessorFn: (row) => getVendor(row.vendorId)?.code ?? '-',
      },
      {
        id: 'methods',
        header: '加工方法',
        accessorFn: (row) => Array.from(new Set(row.items.map((i) => i.processingMethod).filter(Boolean))).join('、') || '-',
      },
      { id: 'itemCount', header: '品項數', accessorFn: (row) => row.items.length },
      { id: 'createdAt', header: '建立日', accessorFn: (row) => formatDate(row.createdAt) },
      { id: 'dueDate', header: '交期', accessorFn: (row) => formatDate(row.dueDate) },
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
        title="二次加工單"
        formCode="表5"
        description="針對表1包裝通知單中已指定「加工方法」的品項對外發包；表4染整單結案時，需加工的品項會自動建立本單草稿（加工廠待生管補齊）。加工明細與包裝設定皆由表1帶入唯讀，僅加工單價為本單專屬可編輯欄位；同一張表1可依不同加工廠開立多張。"
        actions={
          <Button className="bg-brand hover:bg-brand-dark" onClick={() => navigate('/secondary-processing/new')}>
            ＋ 新增二次加工單
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋單號、包裝通知單、加工廠..."
        onRowClick={(row) => navigate(`/secondary-processing/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有二次加工單'}
      />
    </div>
  )
}

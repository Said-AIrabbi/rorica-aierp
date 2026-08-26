import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { api } from '@/mocks/api'
import { getCustomer } from '@/mocks/data'
import { formatDate } from '@/lib/dates'
import type { PackingNotice } from '@/types'

export function PackingNoticeListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['packingNotices'], queryFn: api.packingNotices })

  const columns = useMemo<ColumnDef<PackingNotice, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '單號' },
      {
        id: 'customer',
        header: '客戶',
        accessorFn: (row) => getCustomer(row.customerId)?.shortName ?? row.customerId,
      },
      { accessorKey: 'customerOrderNo', header: '客戶訂單號' },
      {
        id: 'items',
        header: '品項數',
        accessorFn: (row) => row.items.length,
      },
      {
        id: 'createdAt',
        header: '建立日',
        accessorFn: (row) => formatDate(row.createdAt),
      },
      {
        id: 'expectedDeliveryAt',
        header: '出貨日期',
        accessorFn: (row) => formatDate(row.expectedDeliveryAt),
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
        title="包裝通知單"
        formCode="表1"
        description="流程起點：客戶訂單建立主單號（ORD-YYYYMMDD-NNN），後續各表以此貫穿。"
        actions={
          <Button className="bg-brand hover:bg-brand-dark" onClick={() => navigate('/packing-notice/new')}>
            ＋ 新增包裝通知單
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋單號、客戶訂單號..."
        onRowClick={(row) => navigate(`/packing-notice/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有包裝通知單'}
      />
    </div>
  )
}

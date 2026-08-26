import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { api } from '@/mocks/api'
import { getCustomer } from '@/mocks/data'
import { formatDate } from '@/lib/dates'
import type { ShippingOrder } from '@/types'

export function ShippingOrderListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['shippingOrders'], queryFn: api.shippingOrders })

  const columns = useMemo<ColumnDef<ShippingOrder, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '單號' },
      { accessorKey: 'parentId', header: '包裝通知單' },
      {
        id: 'customer',
        header: '客戶',
        accessorFn: (row) => getCustomer(row.customerId)?.shortName ?? row.customerId,
      },
      {
        id: 'isSampleOrder',
        header: '類型',
        cell: ({ row }) =>
          row.original.isSampleOrder ? (
            <Badge variant="outline" className="border-accent-blue text-accent-blue">
              樣品單
            </Badge>
          ) : (
            <Badge variant="outline">一般出貨</Badge>
          ),
      },
      { id: 'itemCount', header: '品項數', accessorFn: (row) => row.items.length },
      { id: 'shipDate', header: '出貨日', accessorFn: (row) => formatDate(row.shipDate) },
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
        title="出貨單／樣品單"
        formCode="表8"
        description="有庫存路徑：直接由表1調撥；無庫存路徑：需等表6入庫單完成才可調撥。樣品出貨走一般出貨常規倉庫。"
        actions={
          <Button className="bg-brand hover:bg-brand-dark" onClick={() => navigate('/shipping-order/new')}>
            ＋ 新增出貨單
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋單號、客戶..."
        onRowClick={(row) => navigate(`/shipping-order/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有出貨單'}
      />
    </div>
  )
}

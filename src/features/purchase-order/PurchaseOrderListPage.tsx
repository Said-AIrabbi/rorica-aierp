import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { api } from '@/mocks/api'
import { getVendor } from '@/mocks/data'
import { formatDate } from '@/lib/dates'
import { effectivePurchaseOrderStatus } from '@/lib/workflow'
import type { PurchaseOrder } from '@/types'

export function PurchaseOrderListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['purchaseOrders'], queryFn: api.purchaseOrders })

  const columns = useMemo<ColumnDef<PurchaseOrder, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '單號' },
      { accessorKey: 'parentId', header: '包裝通知單' },
      { accessorKey: 'type', header: '類型' },
      {
        id: 'vendor',
        header: '廠商',
        accessorFn: (row) => getVendor(row.vendorId)?.name ?? row.vendorId,
      },
      {
        id: 'vendorCode',
        header: '廠商代碼',
        accessorFn: (row) => getVendor(row.vendorId)?.code ?? '-',
      },
      { id: 'itemCount', header: '品項數', accessorFn: (row) => row.items.length },
      { id: 'createdAt', header: '建立日', accessorFn: (row) => formatDate(row.createdAt) },
      { id: 'dueDate', header: '交期', accessorFn: (row) => formatDate(row.dueDate) },
      {
        id: 'status',
        header: '狀態',
        accessorFn: (row) => effectivePurchaseOrderStatus(row),
        cell: ({ getValue }) => <StatusBadge status={getValue<string>()} />,
      },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="訂購單"
        formCode="表2"
        description="成品／胚布分類登打；2日內未簽回自動標記為「已逾期」，效果視同已確認，不阻擋後續流程。"
        actions={
          <Button className="bg-brand hover:bg-brand-dark" onClick={() => navigate('/purchase-order/new')}>
            ＋ 新增訂購單
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋單號、包裝通知單..."
        onRowClick={(row) => navigate(`/purchase-order/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有訂購單'}
      />
    </div>
  )
}

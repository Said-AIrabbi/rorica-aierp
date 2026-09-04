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
import { formatNumber } from '@/lib/units'
import type { DyeOrder } from '@/types'

export function DyeOrderListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['dyeOrders'], queryFn: api.dyeOrders })

  const columns = useMemo<ColumnDef<DyeOrder, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '單號' },
      { accessorKey: 'parentId', header: '包裝通知單' },
      { accessorKey: 'productName', header: '品名' },
      {
        id: 'vendor',
        header: '委外加工廠',
        accessorFn: (row) => getVendor(row.vendorId)?.name ?? row.vendorId,
      },
      {
        id: 'vendorCode',
        header: '廠商代碼',
        accessorFn: (row) => getVendor(row.vendorId)?.code ?? '-',
      },
      { id: 'dueDate', header: '交期', accessorFn: (row) => formatDate(row.dueDate) },
      {
        id: 'largeSampleConfirmedAt',
        header: '大貨樣確認日',
        accessorFn: (row) => formatDate(row.largeSampleConfirmedAt),
      },
      {
        id: 'quantity',
        header: '待染/指染/成品',
        accessorFn: (row) => {
          const totals = row.items.reduce(
            (acc, item) => ({
              pendingDyeQty: acc.pendingDyeQty + item.pendingDyeQty,
              inDyeQty: acc.inDyeQty + item.inDyeQty,
              finishedQty: acc.finishedQty + item.finishedQty,
            }),
            { pendingDyeQty: 0, inDyeQty: 0, finishedQty: 0 },
          )
          return `${formatNumber(totals.pendingDyeQty, 0)}／${formatNumber(totals.inDyeQty, 0)}／${formatNumber(totals.finishedQty, 0)} ${row.unit}`
        },
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
        title="染整單"
        formCode="表4"
        description="無色卡時亦可直接起單；優化取消大貨樣、色卡確認等前置流程，委外加工廠可直接製作大貨樣。確認後，明細有指定加工方法者觸發表5二次加工單，其餘觸發表6入庫單。"
        actions={
          <Button className="bg-brand hover:bg-brand-dark" onClick={() => navigate('/dye-order/new')}>
            ＋ 新增染整單
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋單號、廠商..."
        onRowClick={(row) => navigate(`/dye-order/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有染整單'}
      />
    </div>
  )
}

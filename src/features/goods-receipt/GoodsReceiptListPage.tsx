import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/mocks/api'
import { getAccount } from '@/mocks/data'
import { formatDate } from '@/lib/dates'
import type { GoodsReceipt } from '@/types'

export function GoodsReceiptListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['goodsReceipts'], queryFn: api.goodsReceipts })

  const columns = useMemo<ColumnDef<GoodsReceipt, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '單號' },
      { accessorKey: 'parentId', header: '包裝通知單' },
      { accessorKey: 'source', header: '來源' },
      {
        // 關聯單據以實際單號記錄，委外加工路徑因此分得出是染單結案或二次加工單結案
        id: 'relatedDoc',
        header: '關聯單據',
        accessorFn: (row) => (row.relatedDocId ? `${row.relatedDocType}：${row.relatedDocId}` : '-'),
      },
      { id: 'rolls', header: '布卷數', accessorFn: (row) => row.rolls.length },
      {
        id: 'operator',
        header: '倉管人員',
        accessorFn: (row) => getAccount(row.operatorAccountId)?.name ?? row.operatorAccountId,
      },
      { id: 'receiptDate', header: '入庫日', accessorFn: (row) => formatDate(row.receiptDate) },
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
        title="入庫單"
        formCode="表6"
        description="OCR 辨識布卷或人工複核，三種觸發來源擇一：委外加工／直採大貨成品／直採大貨胚布。"
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋單號、包裝通知單..."
        onRowClick={(row) => navigate(`/goods-receipt/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有入庫單'}
      />
    </div>
  )
}

import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { api } from '@/mocks/api'
import { formatNumber, meterToYard, yardToMeter } from '@/lib/units'
import type { FabricLabel } from '@/types'

function dualUnitLength(length: number, unit: 'Yard' | 'Meter') {
  const yard = unit === 'Yard' ? length : meterToYard(length)
  const meter = unit === 'Meter' ? length : yardToMeter(length)
  return `${formatNumber(yard, 1)}yd／${formatNumber(meter, 1)}m`
}

export function FabricLabelListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['fabricLabels'], queryFn: api.fabricLabels })

  const columns = useMemo<ColumnDef<FabricLabel, unknown>[]>(
    () => [
      { accessorKey: 'rollCode', header: '布卷條碼（胚布編號-流水號）' },
      { accessorKey: 'receiptId', header: '入庫單' },
      { accessorKey: 'productName', header: '皇加品名' },
      { id: 'composition', header: '成分', accessorFn: (row) => row.composition ?? '-' },
      { accessorKey: 'color', header: '顏色' },
      { id: 'width', header: '幅寬', accessorFn: (row) => `${row.width}"` },
      { id: 'batchCode', header: '批', accessorFn: (row) => row.batchCode ?? '-' },
      { id: 'length', header: '長度（雙單位）', accessorFn: (row) => dualUnitLength(row.length, row.unit) },
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
        title="布卷條碼標籤"
        formCode="表7"
        description="每次沙布入庫時由表6並行產生，貼於布捲上。此頁僅為系統內部條碼追蹤紀錄，實體標籤格式非系統UI範圍。"
      />
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          非系統畫面：實際貼於布卷上的紙本標籤格式（品種名 / 顏色 / 幅寬 / 米數）不在系統UI範圍內，僅列印格式規則。此列表為系統內部追蹤紀錄。
        </span>
      </div>
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋條碼、入庫單..."
        onRowClick={(row) => navigate(`/fabric-label/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有布卷條碼紀錄'}
      />
    </div>
  )
}

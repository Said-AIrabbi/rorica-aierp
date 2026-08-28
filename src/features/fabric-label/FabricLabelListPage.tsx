import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { Info } from 'lucide-react'
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
      { id: 'productId', header: '產品編號', accessorFn: (row) => row.productId ?? '-' },
      { accessorKey: 'receiptId', header: '來源入庫單' },
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
        title="布卷資料主檔"
        formCode="主檔"
        description="倉庫裡實際存在的每一捲布，入庫確認時由表6並行產生。庫存查詢與接疋判斷實際查的就是這張主檔。"
      />
      <div className="mb-4 flex items-start gap-2 rounded-lg border border-brand/30 bg-brand/10 p-3 text-sm text-ink-body">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-dark" />
        <span>
          <strong>布卷資料主檔</strong>一列＝倉庫裡實際存在的那一捲布（庫存帳性質，入庫時自動產生）；
          <strong>商品資料主檔</strong>一列＝一個產品分支（型錄性質）。兩者關係為布卷參照商品，庫存比對只比對同一產品分支的布卷。
          點進任一捲可檢視長度異動紀錄、分割布卷，並列印貼附於布捲的實體標籤（表7 列印格式）。
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

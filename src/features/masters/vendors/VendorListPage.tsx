import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { api } from '@/mocks/api'
import type { Vendor } from '@/types'

export function VendorListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['vendors'], queryFn: api.vendors })

  const columns = useMemo<ColumnDef<Vendor, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '系統編號' },
      { accessorKey: 'code', header: '廠商代碼' },
      { accessorKey: 'name', header: '廠名（公司名稱）' },
      { id: 'types', header: '廠商類型（可複選）', accessorFn: (row) => row.types.join('、') },
      { accessorKey: 'siteCode', header: '廠點代號' },
      { accessorKey: 'address', header: '公司地址' },
      { accessorKey: 'contactPerson', header: '負責人/聯絡人' },
      { accessorKey: 'phone', header: '電話' },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="廠商主檔"
        description="點選任一列可開啟編輯視窗。系統編號為建檔時自動產生的主鍵，單據一律以此關聯；廠商代碼為對外代號，可由使用者隨時更新。成品供應商／胚布供應商／染整廠可複選；賣方與受託加工廠共用同一張主檔。"
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋廠名、代碼..."
        onRowClick={(row) => navigate(`/masters/vendors/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有廠商資料'}
      />
    </div>
  )
}

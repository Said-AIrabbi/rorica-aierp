import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/shared/PageHeader'
import { DataTable } from '@/components/shared/DataTable'
import { api } from '@/mocks/api'
import type { Customer } from '@/types'

export function CustomerListPage() {
  const navigate = useNavigate()
  const { data = [], isLoading } = useQuery({ queryKey: ['customers'], queryFn: api.customers })

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      { accessorKey: 'id', header: '系統編號' },
      { accessorKey: 'code', header: '客戶代碼' },
      { accessorKey: 'shortName', header: '客戶簡稱' },
      { accessorKey: 'fullNameCN', header: '公司名稱' },
      { accessorKey: 'personInCharge', header: '負責人' },
      { accessorKey: 'personInChargePhone', header: '負責人電話' },
      { accessorKey: 'contactPerson', header: '連絡人' },
      { accessorKey: 'contactPersonPhone', header: '連絡人電話' },
      { accessorKey: 'paymentTerms', header: '付款方式' },
      { id: 'leadTimeDays', header: '交期天數', accessorFn: (row) => `${row.leadTimeDays} 天` },
    ],
    [],
  )

  return (
    <div>
      <PageHeader
        title="客戶主檔"
        description="點選任一列可開啟編輯視窗。系統編號為建檔時自動產生的主鍵，單據一律以此關聯；客戶代碼為對外代號，可由使用者隨時更新，不影響既有單據。"
        actions={
          <Button className="bg-brand hover:bg-brand-dark" onClick={() => navigate('/masters/customers/new')}>
            <Plus className="mr-1 h-4 w-4" /> 新增客戶
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        searchPlaceholder="搜尋客戶簡稱、代碼..."
        onRowClick={(row) => navigate(`/masters/customers/${row.id}`)}
        emptyText={isLoading ? '載入中...' : '目前沒有客戶資料'}
      />
    </div>
  )
}

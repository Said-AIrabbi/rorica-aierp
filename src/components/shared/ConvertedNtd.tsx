import { useQuery } from '@tanstack/react-query'
import { api } from '@/mocks/api'
import { companyFxRates, formatMoney, FX_NOTE, toNtd } from '@/lib/money'
import { formatDate } from '@/lib/dates'
import type { PiCurrency } from '@/types'

/**
 * 外幣金額旁的新台幣參考值（決策172）：「≈ NT$ 38,500」，滑鼠移上去說明是依匯率換算。
 * 只用在系統畫面——列印給客戶的版本不印。原幣是 NTD 或金額算不出來（看不到售價）時不顯示。
 */
export function ConvertedNtd({ amount, currency }: { amount: number | undefined; currency: PiCurrency }) {
  const { data: profile } = useQuery({ queryKey: ['companyProfile'], queryFn: api.companyProfile })
  if (currency === 'NTD' || amount == null || Number.isNaN(amount)) return null
  const rates = companyFxRates(profile)
  const title = `${FX_NOTE}（1 ${currency} = ${rates[currency]} NTD${profile?.fxUpdatedAt ? `，${formatDate(profile.fxUpdatedAt)} 更新` : ''}）`
  return (
    <span
      className="ml-2 cursor-help border-b border-dotted border-muted-foreground text-xs font-normal text-muted-foreground"
      title={title}
    >
      ≈ {formatMoney(toNtd(amount, currency, rates), 'NTD')}
    </span>
  )
}

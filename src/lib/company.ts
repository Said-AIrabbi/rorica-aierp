import type { CompanyBankAccount, CompanyProfile, PiCurrency } from '@/types'

/**
 * 皇加收款帳戶的解析規則（決策137、138）。
 *
 * 多帳戶同時有兩個原因——**幣別分開**（USD 走外匯帳戶）與**分散銀行**（同一幣別分在兩家）。
 * 兩者並存的後果是「同一幣別可能有多個帳戶」，所以：
 *   ① 自動帶入只是預設值，不是限制；下拉一律列出全部啟用帳戶
 *   ② 幣別層與全域各有一個預設標記
 */

/** 啟用中的帳戶；停用者不出現在新單的選項裡，但舊單仍印得出來 */
export function activeBankAccounts(profile: CompanyProfile): CompanyBankAccount[] {
  return profile.bankAccounts.filter((a) => a.status === '啟用')
}

/** 該帳戶適用的幣別說明，顯示於選項與維護頁 */
export function bankAccountScopeText(account: CompanyBankAccount): string {
  return account.currencies && account.currencies.length > 0 ? account.currencies.join('、') : '全幣別通用'
}

export function bankAccountLabel(account: CompanyBankAccount): string {
  return `${account.bankName}　${account.accountNo}`
}

function appliesTo(account: CompanyBankAccount, currency: PiCurrency): boolean {
  return (account.currencies ?? []).includes(currency)
}

/**
 * 某幣別的預設帳戶。
 *
 * 解析順序刻意讓「該幣別的任一帳戶」優先於「全域預設」：
 * 同幣別有兩個帳戶而都沒標預設時，掉到全域預設會選中**另一個幣別**的帳戶，
 * 那比選錯銀行嚴重得多。
 */
export function defaultBankAccountFor(profile: CompanyProfile, currency: PiCurrency): CompanyBankAccount | undefined {
  const active = activeBankAccounts(profile)
  const matching = active.filter((a) => appliesTo(a, currency))
  return (
    matching.find((a) => a.isDefaultForCurrency) ??
    matching[0] ??
    active.find((a) => a.isDefault) ??
    // 全幣別通用的帳戶：沒標預設也比隨便挑一個有幣別限制的妥當
    active.find((a) => !a.currencies || a.currencies.length === 0) ??
    active[0]
  )
}

/**
 * 下拉的選項順序：該幣別的預設在最前，其次同幣別其他帳戶、全幣別通用，最後是標了別的幣別的。
 * 標了別的幣別者**仍然列出**——分散銀行的需求下，業務可能刻意要偏離預設。
 */
export function bankAccountOptions(profile: CompanyProfile, currency: PiCurrency): CompanyBankAccount[] {
  const preferred = defaultBankAccountFor(profile, currency)
  const rank = (a: CompanyBankAccount): number => {
    if (preferred && a.id === preferred.id) return 0
    if (appliesTo(a, currency)) return 1
    if (!a.currencies || a.currencies.length === 0) return 2
    return 3
  }
  return [...activeBankAccounts(profile)].sort((a, b) => rank(a) - rank(b))
}

/**
 * 一張 PI 實際使用的帳戶。三層回退（決策138）：
 *   ① 送簽時凍結的副本——已對外送出的單一律以此為準
 *   ② 草稿選定的 id——草稿還在改，顯示最新的主檔內容
 *   ③ 該幣別的預設帳戶——既有 PI 建立於本功能之前，兩個欄位都沒有
 *
 * 第三層不回頭補寫 snapshot：我們無從得知當時印的是哪一個帳戶，
 * 補寫等於把今天的帳戶偽造成當時的事實。
 */
export function resolvePiBankAccount(
  profile: CompanyProfile | undefined,
  pi: {
    currency: PiCurrency
    bankAccountId?: string
    bankAccountSnapshot?: CompanyBankAccount
  },
): CompanyBankAccount | undefined {
  if (pi.bankAccountSnapshot) return pi.bankAccountSnapshot
  if (!profile) return undefined
  if (pi.bankAccountId) {
    const found = profile.bankAccounts.find((a) => a.id === pi.bankAccountId)
    // 找不到（帳戶在舊快照裡被刪過）就往下走預設，不要讓列印開天窗
    if (found) return found
  }
  return defaultBankAccountFor(profile, pi.currency)
}

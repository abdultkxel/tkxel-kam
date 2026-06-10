import type { Account } from '@/types/account'

export function formatAccountDisplayId(account: Pick<Account, 'accountNumber' | 'displayId' | 'recordType'>): string | null {
  if (account.displayId) return account.displayId
  if (account.accountNumber) return `Account #${account.accountNumber}`
  if (account.recordType === 'onboarding_draft') return 'Draft account'
  return null
}

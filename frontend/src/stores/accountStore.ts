import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { accounts } from '@/data/mock'
import { Account, AccountStage, HealthScore } from '@/types/account'

interface AccountStore {
  accounts: Account[]
  accountsLoaded: boolean
  accountsLoading: boolean
  accountsError: string
  segmentTags: string[]
  setAccounts: (accounts: Account[]) => void
  setAccountsLoading: (loading: boolean) => void
  setAccountsError: (error: string) => void
  upsertAccount: (account: Account) => void
  setStage: (accountId: string, stage: AccountStage) => void
  setHealth: (accountId: string, health: HealthScore) => void
  importAccounts: (accounts: Account[]) => void
  assignOwner: (accountIds: string[], ownerId: string, ownerName: string) => void
  addTagToAccounts: (accountIds: string[], tag: string) => void
  addSegmentTag: (tag: string) => void
}

export const useAccountStore = create<AccountStore>()(
  persist(
    set => ({
      accounts,
      accountsLoaded: false,
      accountsLoading: false,
      accountsError: '',
      segmentTags: ['Strategic', 'Enterprise', 'Growth', 'APAC', 'Tier-1'],
      setAccounts: nextAccounts =>
        set(() => ({
          accounts: nextAccounts,
          accountsLoaded: true,
          accountsLoading: false,
          accountsError: '',
        })),
      setAccountsLoading: loading =>
        set(() => ({
          accountsLoading: loading,
        })),
      setAccountsError: error =>
        set(() => ({
          accountsError: error,
          accountsLoaded: true,
          accountsLoading: false,
        })),
      upsertAccount: account =>
        set(state => ({
          accounts: [account, ...state.accounts.filter(item => item.id !== account.id)],
          accountsLoaded: true,
        })),
      setStage: (accountId, stage) =>
        set(state => ({
          accounts: state.accounts.map(account => (account.id === accountId ? { ...account, stage } : account)),
        })),
      setHealth: (accountId, health) =>
        set(state => ({
          accounts: state.accounts.map(account => (account.id === accountId ? { ...account, health } : account)),
        })),
      importAccounts: imported =>
        set(state => ({
          accounts: [
            ...imported,
            ...state.accounts.filter(account => !imported.some(importedAccount => importedAccount.id === account.id)),
          ],
        })),
      assignOwner: (accountIds, ownerId, ownerName) =>
        set(state => ({
          accounts: state.accounts.map(account => (accountIds.includes(account.id) ? { ...account, ownerId, ownerName } : account)),
        })),
      addTagToAccounts: (accountIds, tag) =>
        set(state => ({
          accounts: state.accounts.map(account =>
            accountIds.includes(account.id) && !account.tags.includes(tag) ? { ...account, tags: [...account.tags, tag] } : account,
          ),
        })),
      addSegmentTag: tag =>
        set(state => ({
          segmentTags: state.segmentTags.includes(tag) ? state.segmentTags : [...state.segmentTags, tag],
        })),
    }),
    {
      name: 'kam-account-preferences',
      partialize: state => ({
        segmentTags: state.segmentTags,
      }),
    },
  ),
)

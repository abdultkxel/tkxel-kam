import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { nanoid } from 'nanoid'
import { accounts } from '@/data/mock'
import { Account, AccountStage, HealthScore, SavedAccountFilter } from '@/types/account'

interface AccountStore {
  accounts: Account[]
  segmentTags: string[]
  savedFilters: SavedAccountFilter[]
  setAccounts: (accounts: Account[]) => void
  upsertAccount: (account: Account) => void
  setStage: (accountId: string, stage: AccountStage) => void
  setHealth: (accountId: string, health: HealthScore) => void
  importAccounts: (accounts: Account[]) => void
  assignOwner: (accountIds: string[], ownerId: string, ownerName: string) => void
  addTagToAccounts: (accountIds: string[], tag: string) => void
  addSegmentTag: (tag: string) => void
  saveFilter: (filter: Omit<SavedAccountFilter, 'id'>) => void
  toggleFilterShared: (id: string) => void
}

export const useAccountStore = create<AccountStore>()(
  persist(
    set => ({
      accounts,
      segmentTags: ['Strategic', 'Enterprise', 'Growth', 'APAC', 'Tier-1'],
      savedFilters: [
        { id: 'view-risk', name: 'At-risk book', query: '', stage: '', risk: 'warning', segments: [], sort: 'name', direction: 'asc', layout: 'cards', creatorId: 'usr-001', shared: true },
      ],
      setAccounts: nextAccounts =>
        set(() => ({
          accounts: nextAccounts,
        })),
      upsertAccount: account =>
        set(state => ({
          accounts: [account, ...state.accounts.filter(item => item.id !== account.id)],
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
      saveFilter: filter =>
        set(state => ({
          savedFilters: [{ ...filter, id: nanoid() }, ...state.savedFilters],
        })),
      toggleFilterShared: id =>
        set(state => ({
          savedFilters: state.savedFilters.map(filter => (filter.id === id ? { ...filter, shared: !filter.shared } : filter)),
        })),
    }),
    {
      name: 'kam-account-preferences',
      partialize: state => ({
        savedFilters: state.savedFilters,
        segmentTags: state.segmentTags,
      }),
    },
  ),
)

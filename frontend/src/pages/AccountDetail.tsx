import { AlertTriangle, Building2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { Account360 } from '@/components/account/Account360'
import { EmptyState } from '@/components/ui/EmptyState'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { useAuth } from '@/contexts/AuthContext'
import { getAccountOverview } from '@/services/accountWorkspace'
import type { AccountOverviewView } from '@/services/accountWorkspace'
import { useAccountStore } from '@/stores/accountStore'
import { Account } from '@/types/account'

export function AccountDetail() {
  const { id } = useParams()
  const { token } = useAuth()
  const cachedAccount = useAccountStore(state => state.accounts.find(item => item.id === id))
  const upsertAccount = useAccountStore(state => state.upsertAccount)
  const [account, setAccount] = useState<Account | undefined>(cachedAccount)
  const [overview, setOverview] = useState<AccountOverviewView | undefined>()
  const [loading, setLoading] = useState(Boolean(id && token))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!id || !token) return
    let active = true
    setLoading(true)
    setError('')
    setOverview(undefined)
    getAccountOverview(token, id)
      .then(nextOverview => {
        if (!active) return
        const nextAccount = nextOverview.account
        setAccount(nextAccount)
        setOverview(nextOverview)
        upsertAccount(nextAccount)
      })
      .catch(err => {
        if (!active) return
        setError(err instanceof Error ? err.message : 'Unable to load account')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id, token, upsertAccount])

  if (!id) return <Navigate to="/accounts" replace />

  if (loading && !account) {
    return (
      <div>
        <PageHeader eyebrow="Accounts -> Account Overview" title="Loading account" description="Fetching the authorized Account Overview." />
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Skeleton className="h-72 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      </div>
    )
  }

  if (error && !account) {
    return <EmptyState icon={error.toLowerCase().includes('not found') ? Building2 : AlertTriangle} heading="Account could not be loaded" body={error} />
  }

  if (!account) return <Navigate to="/accounts" replace />

  return (
    <div>
      <PageHeader eyebrow="Accounts -> Account Overview" title={account.name} description="Overview, health, stage, opportunities, governance, notes, timeline, and documents in one workspace." />
      <Account360 account={account} overview={overview} />
    </div>
  )
}

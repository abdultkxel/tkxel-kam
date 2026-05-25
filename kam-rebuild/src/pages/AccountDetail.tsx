import { Navigate, useParams } from 'react-router-dom'
import { Account360 } from '@/components/account/Account360'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAccountStore } from '@/stores/accountStore'

export function AccountDetail() {
  const { id } = useParams()
  const account = useAccountStore(state => state.accounts.find(item => item.id === id))
  if (!account) return <Navigate to="/accounts" replace />

  return (
    <div>
      <PageHeader eyebrow="Accounts -> Account 360" title={account.name} description="Overview, health, stage, opportunities, governance, notes, timeline, and documents in one workspace." />
      <Account360 account={account} />
    </div>
  )
}

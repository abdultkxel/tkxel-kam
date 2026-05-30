import { AlertTriangle, ArrowLeft, Loader2, Pencil } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Engagement360View } from '@/components/account/Engagement360View'
import { EngagementFormDialog } from '@/components/account/EngagementFormDialog'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { useRole } from '@/hooks/useRole'
import { ApiError } from '@/services/api'
import { getEngagement } from '@/services/engagements'
import { useAccountStore } from '@/stores/accountStore'
import { useV3Store } from '@/stores/v3Store'

export function EngagementDetail() {
  const { id } = useParams()
  const user = useRole()
  const { token } = useAuth()
  const engagement = useV3Store(state => state.engagements.find(item => item.id === id))
  const upsertEngagement = useV3Store(state => state.upsertEngagement)
  const account = useAccountStore(state => state.accounts.find(item => item.id === engagement?.accountId))
  const [loading, setLoading] = useState(false)
  const [apiError, setApiError] = useState<string | null>(null)
  const canManage = ['account_manager', 'kam_head', 'admin', 'super_admin'].includes(user.role)

  useEffect(() => {
    if (!id || !token) return

    let active = true
    setLoading(true)
    setApiError(null)
    getEngagement(token, id)
      .then(record => {
        if (active) upsertEngagement(record)
      })
      .catch(error => {
        if (!active) return
        setApiError(error instanceof ApiError ? error.message : 'Unable to load engagement')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [id, token, upsertEngagement])

  if (!id) return <Navigate to="/accounts" replace />
  if (!engagement && loading) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Engagement 360" title="Loading engagement" description="Fetching the latest engagement profile from the API." />
        <section className="tk-card p-6">
          <div className="flex items-center gap-3 text-sm font-semibold text-ink-secondary">
            <Loader2 className="h-4 w-4 animate-spin text-brand-blue" />
            Loading Engagement 360
          </div>
        </section>
      </div>
    )
  }
  if (!engagement) {
    return (
      <div className="space-y-5">
        <PageHeader eyebrow="Engagement 360" title="Engagement not found" description={apiError ?? 'The engagement may be missing, archived, or unavailable with current permissions.'} />
        <section className="tk-card p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-1 h-5 w-5 text-brand-orange" />
            <div>
              <h2 className="text-base font-semibold text-ink">Unable to load engagement</h2>
              <p className="mt-1 text-sm text-ink-secondary">Check source loading, permissions, or return to the account workspace.</p>
              <Link className="tk-button-secondary mt-4" to="/accounts">
                <ArrowLeft className="h-4 w-4" />
                Accounts
              </Link>
            </div>
          </div>
        </section>
      </div>
    )
  }
  if (!account) return <Navigate to="/accounts" replace />

  return (
    <div>
      <PageHeader
        eyebrow="Engagement 360"
        title={engagement.name}
        description={`${account.name} | ${engagement.ownerName} | ${engagement.serviceLines.join(', ')}`}
        actions={(
          <div className="flex flex-wrap gap-2">
            <Link className="tk-button-secondary" to={`/accounts/${account.id}?tab=engagements`}>
              <ArrowLeft className="h-4 w-4" />
              Account
            </Link>
            {canManage ? (
              <EngagementFormDialog
                account={account}
                engagement={engagement}
                trigger={<button className="tk-button-primary"><Pencil className="h-4 w-4" />Edit</button>}
              />
            ) : null}
          </div>
        )}
      />
      <Engagement360View account={account} engagement={engagement} />
    </div>
  )
}

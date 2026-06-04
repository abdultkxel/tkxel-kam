import { FormEvent, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { RoleDashboard } from '@/components/dashboard/RoleDashboard'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardRead, getMyDashboard, refreshAmTaskSummary } from '@/services/notificationsReporting'

export function Dashboard() {
  const { token, user } = useAuth()
  const [dashboard, setDashboard] = useState<DashboardRead | null>(null)
  const [search, setSearch] = useState('')
  const [draftSearch, setDraftSearch] = useState('')
  const [risk, setRisk] = useState('')
  const [loading, setLoading] = useState(false)
  const [refreshingSummary, setRefreshingSummary] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    getMyDashboard(token, { search, risk, page_size: 10 })
      .then(result => {
        if (active) setDashboard(result)
      })
      .catch(err => {
        if (active) setError(err instanceof Error ? err.message : 'Dashboard could not be loaded')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [risk, search, token])

  const taskSummary = dashboard?.widgets.find(widget => widget.key === 'ai_task_summary')
  const canRefreshSummary = Boolean(taskSummary && !dashboard?.read_only && taskSummary.metadata.manual_refresh !== false)

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    setSearch(draftSearch)
  }

  async function refreshSummary() {
    if (!token || !canRefreshSummary) return
    setRefreshingSummary(true)
    try {
      const result = await refreshAmTaskSummary(token)
      setDashboard(current => current ? { ...current, widgets: current.widgets.map(widget => (widget.key === 'ai_task_summary' ? result.widget : widget)) } : current)
      toast.success('Task summary refreshed')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Task summary could not be refreshed')
    } finally {
      setRefreshingSummary(false)
    }
  }

  return (
    <RoleDashboard
      dashboard={dashboard}
      userName={user?.name ?? 'User'}
      userId={user?.id}
      token={token}
      draftSearch={draftSearch}
      risk={risk}
      loading={loading}
      error={error}
      refreshingSummary={refreshingSummary}
      canRefreshSummary={canRefreshSummary}
      onDraftSearchChange={setDraftSearch}
      onRiskChange={setRisk}
      onSearchSubmit={submitSearch}
      onRefreshSummary={() => void refreshSummary()}
    />
  )
}

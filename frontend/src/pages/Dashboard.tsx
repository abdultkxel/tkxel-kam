import { FormEvent, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { RoleDashboard } from '@/components/dashboard/RoleDashboard'
import { useAuth } from '@/contexts/AuthContext'
import { DashboardRead, getMyDashboard, refreshAmTaskSummary } from '@/services/notificationsReporting'

export function Dashboard() {
  const { token, user } = useAuth()
  const [params, setParams] = useSearchParams()
  const [dashboard, setDashboard] = useState<DashboardRead | null>(null)
  const [loading, setLoading] = useState(false)
  const [refreshingSummary, setRefreshingSummary] = useState(false)
  const [error, setError] = useState('')
  const search = params.get('search') ?? params.get('q') ?? ''
  const risk = params.get('risk') ?? ''
  const accountId = params.get('account_id') ?? ''
  const amId = params.get('am_id') ?? ''
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1)
  const [draftSearch, setDraftSearch] = useState(search)

  const dashboardRequest = useMemo(() => {
    const request: Record<string, string | number> = { page, page_size: 10 }
    if (search) request.search = search
    if (risk) request.risk = risk
    if (accountId) request.account_id = accountId
    if (amId) request.am_id = amId
    return request
  }, [accountId, amId, page, risk, search])

  useEffect(() => {
    setDraftSearch(search)
  }, [search])

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setError('')
    getMyDashboard(token, dashboardRequest)
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
  }, [dashboardRequest, token])

  const taskSummary = dashboard?.widgets.find(widget => widget.key === 'ai_task_summary')
  const canRefreshSummary = Boolean(taskSummary && !dashboard?.read_only && taskSummary.metadata.manual_refresh !== false)

  function submitSearch(event: FormEvent) {
    event.preventDefault()
    updateDashboardParam('search', draftSearch.trim())
  }

  function updateRisk(value: string) {
    updateDashboardParam('risk', value)
  }

  function updateAccountId(value: string) {
    updateDashboardParam('account_id', value)
  }

  function updateAmId(value: string) {
    updateDashboardParam('am_id', value)
  }

  function updatePage(nextPage: number) {
    const next = new URLSearchParams(params)
    next.set('page', String(Math.max(1, nextPage)))
    setParams(next, { replace: true })
  }

  function updateDashboardParam(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'page') next.set('page', '1')
    setParams(next, { replace: true })
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
      accountId={accountId}
      amId={amId}
      loading={loading}
      error={error}
      refreshingSummary={refreshingSummary}
      canRefreshSummary={canRefreshSummary}
      onDraftSearchChange={setDraftSearch}
      onRiskChange={updateRisk}
      onAccountChange={updateAccountId}
      onAmChange={updateAmId}
      onSearchSubmit={submitSearch}
      onPageChange={updatePage}
      onRefreshSummary={() => void refreshSummary()}
    />
  )
}

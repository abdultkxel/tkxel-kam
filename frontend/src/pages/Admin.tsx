import { Activity, AlertTriangle, ArrowRight, BellRing, PlugZap, ServerCog } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AllowedEmailDomainsPanel } from '@/components/admin/AllowedEmailDomainsPanel'
import { AdminContentPanel } from '@/components/admin/AdminContentPanel'
import { AdminAuditPanel } from '@/components/admin/AdminAuditPanel'
import { AdminFieldBuilderPanel } from '@/components/admin/AdminFieldBuilderPanel'
import { AdminGovernancePanel } from '@/components/admin/AdminGovernancePanel'
import { AdminNotificationsReportingPanel } from '@/components/admin/AdminNotificationsReportingPanel'
import { AdminOpportunityTypesPanel } from '@/components/admin/AdminOpportunityTypesPanel'
import { AdminRelationshipPlanningPanel } from '@/components/admin/AdminRelationshipPlanningPanel'
import { AdminRolesPanel } from '@/components/admin/AdminRolesPanel'
import { AdminUsersPanel } from '@/components/admin/AdminUsersPanel'
import { AlertRulesPanel } from '@/components/admin/AlertRulesPanel'
import { IntegrationsPanel } from '@/components/admin/IntegrationsPanel'
import { RetentionJobHistory } from '@/components/admin/RetentionJobHistory'
import { ScoringEngineBuilder } from '@/components/admin/ScoringEngineBuilder'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { getAlerts } from '@/services/alerts'
import { getAdminJobLogs, getAdminSystemHealth } from '@/services/adminAccess'
import type { AdminSystemHealth } from '@/services/adminAccess'
import { listIntegrations } from '@/services/integrations'
import type { IntegrationConnection } from '@/services/integrations'
import { cn } from '@/utils/cn'

const adminSections = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles' },
  { id: 'content', label: 'Content' },
  { id: 'governance', label: 'Governance' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'planning', label: 'Planning' },
  { id: 'fields', label: 'Field builder' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'alerts', label: 'Alert rules' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'settings', label: 'Settings' },
  { id: 'retention', label: 'Retention' },
  { id: 'audit', label: 'Audit log' },
]
const defaultAdminSection = 'users'
const adminSectionIds = new Set(adminSections.map(section => section.id))

const statusToneClass = {
  blue: 'bg-blue-tint-20 text-brand-blue',
  orange: 'bg-brand-orange/10 text-brand-orange',
  green: 'bg-rag-green/10 text-rag-green',
  red: 'bg-rag-red/10 text-rag-red',
  dark: 'bg-surface-tertiary text-brand-blue-dark',
}

interface AdminOpsSummary {
  systemHealth: AdminSystemHealth | null
  activeAlerts: number | null
  integrations: IntegrationConnection[] | null
  failedJobs: number | null
}

function statusLabel(status?: string) {
  if (!status) return '...'
  return status.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

function healthTone(status?: string): keyof typeof statusToneClass {
  if (status === 'healthy') return 'green'
  if (status === 'degraded') return 'orange'
  if (status) return 'red'
  return 'dark'
}

function hasIntegrationIssue(connection: IntegrationConnection) {
  return connection.status === 'error' || connection.failure_count > 0 || Boolean(connection.last_error)
}

function isVisibleAdminIntegration(connection: IntegrationConnection) {
  return connection.provider === 'google_calendar' || connection.provider === 'ai_llm_gateway'
}

export function Admin() {
  const { token } = useAuth()
  const [opsSummary, setOpsSummary] = useState<AdminOpsSummary>({
    systemHealth: null,
    activeAlerts: null,
    integrations: null,
    failedJobs: null,
  })
  const [searchParams, setSearchParams] = useSearchParams()
  const activeSection = searchParams.get('section') ?? ''
  const highlightedSection = activeSection && adminSectionIds.has(activeSection) ? activeSection : defaultAdminSection
  const integrations = opsSummary.integrations?.filter(isVisibleAdminIntegration) ?? null
  const integrationIssues = integrations?.filter(hasIntegrationIssue).length ?? null
  const connectedIntegrations = integrations?.filter(connection => connection.enabled && connection.status === 'connected').length ?? null
  const totalIntegrations = integrations?.length ?? null
  const systemWorkersFailed = opsSummary.systemHealth?.metrics.workers_failed ?? 0
  const statusItems = [
    {
      label: 'System health',
      value: statusLabel(opsSummary.systemHealth?.status),
      detail: opsSummary.systemHealth ? `${systemWorkersFailed} failed worker${systemWorkersFailed === 1 ? '' : 's'}` : 'Loading health',
      icon: Activity,
      tone: healthTone(opsSummary.systemHealth?.status),
      section: 'audit',
    },
    {
      label: 'Active alerts',
      value: opsSummary.activeAlerts === null ? '...' : String(opsSummary.activeAlerts),
      detail: opsSummary.activeAlerts === null ? 'Loading alerts' : opsSummary.activeAlerts ? 'Unresolved alert load' : 'No active alerts',
      icon: AlertTriangle,
      tone: opsSummary.activeAlerts === null ? 'dark' as const : opsSummary.activeAlerts ? 'orange' as const : 'green' as const,
      section: 'alerts',
    },
    {
      label: 'Integration health',
      value: integrations === null ? '...' : integrationIssues ? String(integrationIssues) : `${connectedIntegrations}/${totalIntegrations}`,
      detail: integrations === null ? 'Loading adapters' : integrationIssues ? 'Integration issue count' : 'Connected admin adapters',
      icon: PlugZap,
      tone: integrations === null ? 'dark' as const : integrationIssues ? 'red' as const : connectedIntegrations === totalIntegrations && totalIntegrations ? 'green' as const : 'orange' as const,
      section: 'integrations',
    },
    {
      label: 'Failed jobs',
      value: opsSummary.failedJobs === null ? '...' : String(opsSummary.failedJobs),
      detail: opsSummary.failedJobs === null ? 'Loading workers' : 'Recent worker failures',
      icon: ServerCog,
      tone: opsSummary.failedJobs === null ? 'dark' as const : opsSummary.failedJobs ? 'red' as const : 'green' as const,
      section: 'audit',
    },
  ]

  useEffect(() => {
    if (!token) return
    let active = true
    Promise.all([
      getAdminSystemHealth(token).catch(() => null),
      getAlerts(token, { status: 'active', page: 1, page_size: 1 }).catch(() => null),
      listIntegrations(token).catch(() => null),
      getAdminJobLogs(token, { status: 'failed', page: 1, page_size: 1 }).catch(() => null),
    ])
      .then(([systemHealth, activeAlerts, integrationList, failedJobs]) => {
        if (!active) return
        setOpsSummary({
          systemHealth,
          activeAlerts: activeAlerts?.total ?? null,
          integrations: integrationList,
          failedJobs: failedJobs?.total ?? null,
        })
      })
    return () => {
      active = false
    }
  }, [token])

  useEffect(() => {
    if (!activeSection || adminSectionIds.has(activeSection)) return
    const next = new URLSearchParams(searchParams)
    next.set('section', defaultAdminSection)
    setSearchParams(next, { replace: true })
  }, [activeSection, searchParams, setSearchParams])

  function chooseSection(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set('section', id)
    setSearchParams(next, { replace: true })
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Admin"
        description="Scoring, integrations, notification settings, retention, and audit controls."
        actions={(
          <>
            <button type="button" className="tk-button-secondary" onClick={() => chooseSection('settings')}>
              <BellRing className="h-4 w-4" />
              Notifications
            </button>
            <button type="button" className="tk-button-primary" onClick={() => chooseSection('integrations')}>
              <PlugZap className="h-4 w-4" />
              Integration health
            </button>
          </>
        )}
      />
      <AdminStatusStrip items={statusItems} onSelect={chooseSection} />
      <section className="sticky top-20 z-20 mb-4 rounded-lg border border-surface-border bg-white p-2 shadow-card">
        <div className="mb-2 flex items-center justify-between gap-3 px-2">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Admin sections</p>
          <p className="text-xs font-medium text-ink-secondary">{adminSections.length} areas</p>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Admin sections">
          {adminSections.map(section => (
            <button
              key={section.id}
              type="button"
              role="tab"
              aria-selected={highlightedSection === section.id}
              onClick={() => chooseSection(section.id)}
              className={cn(
                'min-h-[44px] shrink-0 rounded-md px-3 text-xs font-semibold uppercase tracking-wider transition-colors',
                highlightedSection === section.id
                  ? 'bg-brand-blue text-white'
                  : 'border border-surface-border bg-white text-ink-secondary hover:bg-surface-tertiary hover:text-ink',
              )}
            >
              {section.label}
            </button>
          ))}
        </div>
      </section>
      <div className="space-y-4">
        <div className="min-w-0 space-y-4">
          {highlightedSection === 'users' ? <AdminUsersPanel /> : null}
          {highlightedSection === 'roles' ? <AdminRolesPanel /> : null}
          {highlightedSection === 'content' ? <AdminContentPanel /> : null}
          {highlightedSection === 'governance' ? <AdminGovernancePanel /> : null}
          {highlightedSection === 'opportunities' ? <AdminOpportunityTypesPanel /> : null}
          {highlightedSection === 'planning' ? <AdminRelationshipPlanningPanel /> : null}
          {highlightedSection === 'fields' ? <AdminFieldBuilderPanel /> : null}
          {highlightedSection === 'scoring' ? (
            <div id="scoring" className="scroll-mt-24">
              <ScoringEngineBuilder />
            </div>
          ) : null}
          {highlightedSection === 'alerts' ? (
            <div id="alerts" className="scroll-mt-24">
              <AlertRulesPanel />
            </div>
          ) : null}
        </div>

        <aside className="min-w-0 space-y-4">
          {highlightedSection === 'integrations' ? (
            <div id="integrations" className="scroll-mt-24">
              <IntegrationsPanel />
            </div>
          ) : null}
          {highlightedSection === 'settings' ? (
            <div id="settings" className="scroll-mt-24">
              <div className="space-y-4">
                <AllowedEmailDomainsPanel />
                <AdminNotificationsReportingPanel />
              </div>
            </div>
          ) : null}
          {highlightedSection === 'retention' ? (
            <div id="retention" className="scroll-mt-24">
              <RetentionJobHistory />
            </div>
          ) : null}
          {highlightedSection === 'audit' ? (
            <AdminAuditPanel />
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function AdminStatusStrip({
  items,
  onSelect,
}: {
  items: { label: string; value: string; detail: string; icon: LucideIcon; tone: keyof typeof statusToneClass; section: string }[]
  onSelect: (section: string) => void
}) {
  return (
    <section className="tk-card mb-4 overflow-hidden">
      <div className="grid divide-y divide-surface-border md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        {items.map(item => (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelect(item.section)}
            className="group flex min-h-[96px] w-full items-center gap-3 p-4 text-left transition-colors hover:bg-surface-tertiary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand-blue"
            aria-label={`Open ${item.label} details`}
          >
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', statusToneClass[item.tone])}>
              <item.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wider text-ink-secondary">{item.label}</span>
              <span className="mt-1 block font-display text-2xl font-bold leading-none text-ink">{item.value}</span>
              <span className="mt-1 block truncate text-xs text-ink-secondary">{item.detail}</span>
            </span>
            <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-ink-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
          </button>
        ))}
      </div>
    </section>
  )
}

import * as Switch from '@radix-ui/react-switch'
import { BellRing, Download, PlugZap, Plus, Save, ShieldCheck, SlidersHorizontal } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { nanoid } from 'nanoid'
import { FormEvent, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { AllowedEmailDomainsPanel } from '@/components/admin/AllowedEmailDomainsPanel'
import { AdminCustomizationPanel } from '@/components/admin/AdminCustomizationPanel'
import { AdminContentPanel } from '@/components/admin/AdminContentPanel'
import { AdminFieldBuilderPanel } from '@/components/admin/AdminFieldBuilderPanel'
import { AdminGovernancePanel } from '@/components/admin/AdminGovernancePanel'
import { AdminOpportunityTypesPanel } from '@/components/admin/AdminOpportunityTypesPanel'
import { AdminRelationshipPlanningPanel } from '@/components/admin/AdminRelationshipPlanningPanel'
import { AdminRolesPanel } from '@/components/admin/AdminRolesPanel'
import { AdminUsersPanel } from '@/components/admin/AdminUsersPanel'
import { AlertRulesPanel } from '@/components/admin/AlertRulesPanel'
import { IntegrationsPanel } from '@/components/admin/IntegrationsPanel'
import { RetentionJobHistory } from '@/components/admin/RetentionJobHistory'
import { SensitivePolicyTable } from '@/components/admin/SensitivePolicyTable'
import { SegmentSettings } from '@/components/admin/SegmentSettings'
import { ScoringEngineBuilder } from '@/components/admin/ScoringEngineBuilder'
import { PageHeader } from '@/components/ui/PageHeader'
import { useAuth } from '@/contexts/AuthContext'
import { createTimelineEventType, getTimelineEventTypes, updateTimelineEventType } from '@/services/timeline'
import { useAlertStore } from '@/stores/alertStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { NotificationPreferenceMode, NotificationTrigger } from '@/types/notification'
import { TimelineEventType, TimelineModule } from '@/types/timeline'
import { cn } from '@/utils/cn'
import { formatDate } from '@/utils/formatters'

const modules: TimelineModule[] = ['kyc', 'scoring', 'stage', 'opportunity', 'activity', 'education', 'escalation', 'governance', 'approval', 'executive', 'ai', 'manual']
const eventTypes: TimelineEventType[] = ['account_setup', 'kyc_update', 'score_change', 'calculator_change', 'stage_change', 'opportunity_event', 'retention_event', 'client_education', 'escalation_event', 'governance_event', 'approval_event', 'executive_event', 'ai_event', 'manual_note']
const swatchClass: Record<string, string> = {
  'brand-blue': 'bg-brand-blue',
  'brand-blue-dark': 'bg-brand-blue-dark',
  'brand-orange': 'bg-brand-orange',
  'rag-green': 'bg-rag-green',
  'surface-border': 'bg-surface-border',
}

const adminSections = [
  { id: 'users', label: 'Users' },
  { id: 'roles', label: 'Roles' },
  { id: 'content', label: 'Content' },
  { id: 'governance', label: 'Governance' },
  { id: 'opportunities', label: 'Opportunities' },
  { id: 'planning', label: 'Planning' },
  { id: 'fields', label: 'Field builder' },
  { id: 'scoring', label: 'Scoring' },
  { id: 'customization', label: 'Customization' },
  { id: 'alerts', label: 'Alert rules' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'integrations', label: 'Integrations' },
  { id: 'settings', label: 'Settings' },
  { id: 'segments', label: 'Segments' },
  { id: 'policies', label: 'Policies' },
  { id: 'retention', label: 'Retention' },
  { id: 'audit', label: 'Audit log' },
]

const labels: Record<NotificationTrigger, string> = {
  timeline_mention: 'Timeline mention',
  timeline_comment: 'Timeline comment',
  escalation_assigned: 'Escalation assigned',
  account_stage_changed: 'Account stage changed',
  score_dropped_rag: 'Score dropped RAG',
  handover_requested: 'Handover requested',
  sensitive_access_request: 'Sensitive access request',
  integration_error: 'Integration error',
  retention_job_complete: 'Retention job complete',
  governance_overdue: 'Governance overdue',
}

const preferenceOptions: { value: NotificationPreferenceMode; label: string }[] = [
  { value: 'in_app', label: 'In-app only' },
  { value: 'in_app_email', label: 'In-app + Email' },
  { value: 'off', label: 'Off' },
]

const statusToneClass = {
  blue: 'bg-blue-tint-20 text-brand-blue',
  orange: 'bg-brand-orange/10 text-brand-orange',
  green: 'bg-rag-green/10 text-rag-green',
  dark: 'bg-surface-tertiary text-brand-blue-dark',
}

export function Admin() {
  const { token } = useAuth()
  const fallbackConfigs = useTimelineStore(state => state.eventTypes)
  const [serverConfigs, setServerConfigs] = useState(fallbackConfigs)
  const configs = serverConfigs.length ? serverConfigs : fallbackConfigs
  const upsert = useTimelineStore(state => state.upsertEventType)
  const fallbackToggle = useTimelineStore(state => state.toggleEventType)
  const updateRetention = useTimelineStore(state => state.updateRetention)
  const integrations = useIntegrationStore(state => state.configs)
  const alertRules = useAlertStore(state => state.rules)
  const preferences = useNotificationStore(state => state.preferences)
  const [searchParams, setSearchParams] = useSearchParams()
  const [name, setName] = useState('')
  const [eventType, setEventType] = useState<TimelineEventType>('manual_note')
  const [module, setModule] = useState<TimelineModule>('manual')
  const activeSection = searchParams.get('section') ?? ''
  const highlightedSection = activeSection || 'users'
  const activeTimelineTypes = configs.filter(config => config.active).length
  const connectedIntegrations = integrations.filter(config => config.status === 'connected').length
  const activeAlertRules = alertRules.filter(rule => rule.active).length
  const emailTriggers = preferences.filter(preference => preference.mode === 'in_app_email').length
  const statusItems = [
    {
      label: 'Timeline types',
      value: `${activeTimelineTypes}/${configs.length}`,
      detail: 'Active event taxonomy',
      icon: ShieldCheck,
      tone: 'blue' as const,
    },
    {
      label: 'Integrations',
      value: `${connectedIntegrations}/${integrations.length}`,
      detail: 'Connected adapters',
      icon: PlugZap,
      tone: connectedIntegrations ? 'green' as const : 'orange' as const,
    },
    {
      label: 'Alert rules',
      value: `${activeAlertRules}/${alertRules.length}`,
      detail: 'Risk rules enabled',
      icon: SlidersHorizontal,
      tone: 'orange' as const,
    },
    {
      label: 'Email triggers',
      value: String(emailTriggers),
      detail: 'Notifications with email',
      icon: BellRing,
      tone: 'dark' as const,
    },
  ]

  useEffect(() => {
    if (!token) return
    let active = true
    getTimelineEventTypes(token, 'all')
      .then(result => {
        if (active) setServerConfigs(result.items)
      })
      .catch(() => {
        if (active) setServerConfigs(fallbackConfigs)
      })
    return () => {
      active = false
    }
  }, [fallbackConfigs, token])

  function chooseSection(id: string) {
    const next = new URLSearchParams(searchParams)
    next.set('section', id)
    setSearchParams(next, { replace: true })
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) return
    if (token) {
      try {
        const created = await createTimelineEventType(token, {
          slug: slugify(name),
          name,
          module,
          category: module,
        })
        setServerConfigs(items => [created, ...items])
        setName('')
        toast.success('Timeline event type added')
        return
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Timeline event type could not be added')
        return
      }
    }
    upsert({
      id: nanoid(),
      name,
      eventType,
      module,
      colorToken: module === 'scoring' || module === 'escalation' ? 'brand-orange' : 'brand-blue',
      active: true,
      defaultVisibility: 'public',
      createdDate: new Date().toISOString(),
      retentionPolicy: 'keep',
    })
    setName('')
    toast.success('Timeline event type added')
  }

  function updateConfigDraft(id: string, updates: Partial<(typeof configs)[number]>) {
    setServerConfigs(items => items.map(item => (item.id === id ? { ...item, ...updates } : item)))
    if (!serverConfigs.length) {
      const config = configs.find(item => item.id === id)
      if (config) upsert({ ...config, ...updates })
    }
  }

  async function toggleConfig(id: string) {
    const config = configs.find(item => item.id === id)
    if (!config) return
    if (!token) {
      fallbackToggle(id)
      return
    }
    try {
      const updated = await updateTimelineEventType(token, id, { is_active: !config.active })
      setServerConfigs(items => items.map(item => (item.id === id ? updated : item)))
      toast.success('Timeline event type updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Timeline event type could not be updated')
    }
  }

  async function saveConfig(id: string) {
    const config = configs.find(item => item.id === id)
    if (!config || !token) {
      toast.success('Timeline event type saved')
      return
    }
    try {
      const updated = await updateTimelineEventType(token, id, { name: config.name, module: config.module })
      setServerConfigs(items => items.map(item => (item.id === id ? updated : item)))
      toast.success('Timeline event type saved')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Timeline event type could not be saved')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Administration"
        title="Admin"
        description="Scoring, timeline policies, integrations, notification settings, and audit controls."
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
      <AdminStatusStrip items={statusItems} />
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
          {highlightedSection === 'customization' ? (
            <div id="customization" className="scroll-mt-24">
              <AdminCustomizationPanel />
            </div>
          ) : null}
          {highlightedSection === 'alerts' ? (
            <div id="alerts" className="scroll-mt-24">
              <AlertRulesPanel />
            </div>
          ) : null}
          {highlightedSection === 'timeline' ? (
          <section id="timeline" className="tk-card scroll-mt-24 overflow-hidden">
            <div className="border-b border-surface-border p-5">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">FR-87 / FR-96</p>
              <h2 className="text-base font-semibold text-ink">Timeline Event Types</h2>
            </div>
            <form onSubmit={submit} className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 md:grid-cols-[minmax(220px,1fr)_180px_180px_auto]">
              <input value={name} onChange={event => setName(event.target.value)} className="tk-input" placeholder="Event type name" />
              <select value={eventType} onChange={event => setEventType(event.target.value as TimelineEventType)} className="tk-input">
                {eventTypes.map(item => <option key={item}>{item}</option>)}
              </select>
              <select value={module} onChange={event => setModule(event.target.value as TimelineModule)} className="tk-input">
                {modules.map(item => <option key={item}>{item}</option>)}
              </select>
              <button type="submit" className="tk-button-primary">
                <Plus className="h-4 w-4" />
                Add
              </button>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left text-sm">
                <thead className="border-b border-surface-border bg-surface-tertiary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Module</th>
                    <th className="px-4 py-3">Colour swatch</th>
                    <th className="px-4 py-3">Active</th>
                    <th className="px-4 py-3">Created date</th>
                    <th className="px-4 py-3">Retention</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {configs.map(config => (
                    <tr key={config.id} className="border-b border-surface-border last:border-b-0">
                      <td className="px-4 py-3">
                        <input className="tk-input" value={config.name} onChange={event => updateConfigDraft(config.id, { name: event.target.value })} />
                      </td>
                      <td className="px-4 py-3">
                        <select className="tk-input" value={config.module} onChange={event => updateConfigDraft(config.id, { module: event.target.value as TimelineModule })}>
                          {modules.map(item => <option key={item}>{item}</option>)}
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex h-5 w-5 rounded-full border border-surface-border ${swatchClass[config.colorToken] ?? 'bg-brand-blue'}`} />
                      </td>
                      <td className="px-4 py-3">
                        <Switch.Root checked={config.active} onCheckedChange={() => void toggleConfig(config.id)} className="relative min-h-[44px] w-11 rounded-full bg-transparent after:absolute after:left-0 after:top-1/2 after:h-6 after:w-11 after:-translate-y-1/2 after:rounded-full after:bg-surface-border data-[state=checked]:after:bg-brand-blue">
                          <Switch.Thumb className="absolute left-0 top-1/2 z-10 block h-5 w-5 translate-x-0.5 -translate-y-1/2 rounded-full bg-white transition-transform data-[state=checked]:translate-x-5" />
                        </Switch.Root>
                      </td>
                      <td className="px-4 py-3 text-ink-secondary">{formatDate(config.createdDate)}</td>
                      <td className="px-4 py-3">
                        <select
                          className="tk-input min-w-[190px]"
                          value={config.retentionPolicy === 'keep' ? 'keep' : `${config.retentionPolicy}:${config.retentionMonths ?? 36}`}
                          onChange={event => {
                            const [policy, months] = event.target.value.split(':')
                            updateRetention(config.id, policy as 'keep' | 'archive' | 'delete', months ? Number(months) : undefined)
                          }}
                        >
                          <option value="keep">Keep forever</option>
                          <option value="archive:24">Archive after 24 months</option>
                          <option value="archive:36">Archive after 36 months</option>
                          <option value="delete:24">Delete after 24 months</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <button type="button" className="tk-button-secondary" onClick={() => void saveConfig(config.id)}>
                          <Save className="h-4 w-4" />
                          Save
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
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
                <NotificationSettingsPanel />
              </div>
            </div>
          ) : null}
          {highlightedSection === 'segments' ? (
            <div id="segments" className="scroll-mt-24">
              <SegmentSettings />
            </div>
          ) : null}
          {highlightedSection === 'policies' ? (
            <div id="policies" className="scroll-mt-24">
              <SensitivePolicyTable />
            </div>
          ) : null}
          {highlightedSection === 'retention' ? (
            <div id="retention" className="scroll-mt-24">
              <RetentionJobHistory />
            </div>
          ) : null}
          {highlightedSection === 'audit' ? (
          <section id="audit" className="tk-card scroll-mt-24 p-5">
            <h3 className="text-base font-semibold text-ink">Audit Log</h3>
            <div className="mt-3 rounded-lg border border-surface-border p-3 text-sm text-ink-secondary">Timeline config reviewed by Admin.</div>
            <div className="mt-2 rounded-lg border border-surface-border p-3 text-sm text-ink-secondary">Sensitive entry access filter enabled.</div>
            <div className="mt-3 flex gap-2">
              <button className="tk-button-secondary">
                <Download className="h-4 w-4" />
                CSV
              </button>
            </div>
          </section>
          ) : null}
        </aside>
      </div>
    </div>
  )
}

function slugify(value: string) {
  const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return slug || `timeline_event_${Date.now()}`
}

function AdminStatusStrip({ items }: { items: { label: string; value: string; detail: string; icon: LucideIcon; tone: keyof typeof statusToneClass }[] }) {
  return (
    <section className="tk-card mb-4 overflow-hidden">
      <div className="grid divide-y divide-surface-border md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-4">
        {items.map(item => (
          <div key={item.label} className="flex min-h-[96px] items-center gap-3 p-4">
            <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-lg', statusToneClass[item.tone])}>
              <item.icon className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold uppercase tracking-wider text-ink-secondary">{item.label}</span>
              <span className="mt-1 block font-display text-2xl font-bold leading-none text-ink">{item.value}</span>
              <span className="mt-1 block truncate text-xs text-ink-secondary">{item.detail}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  )
}

function NotificationSettingsPanel() {
  const preferences = useNotificationStore(state => state.preferences)
  const updatePreference = useNotificationStore(state => state.updatePreference)
  const digest = useNotificationStore(state => state.digest)
  const setDigest = useNotificationStore(state => state.setDigest)

  return (
    <section className="tk-card overflow-hidden">
      <div className="border-b border-surface-border p-5">
        <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Settings</p>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink">
          <BellRing className="h-4 w-4 text-brand-blue" />
          Notification delivery
        </h2>
        <p className="mt-2 text-sm text-ink-secondary">Set in-app and email behavior for Admin, account, and timeline triggers.</p>
      </div>
      <div className="divide-y divide-surface-border">
        {preferences.map(preference => (
          <label key={preference.trigger} className="grid gap-3 p-4 sm:grid-cols-[1fr_190px] sm:items-center">
            <span className="min-w-0">
              <span className="block text-sm font-semibold text-ink">{labels[preference.trigger]}</span>
              <span className="block text-xs leading-5 text-ink-secondary">Controls in-app alerts and email delivery.</span>
            </span>
            <select className="tk-input" value={preference.mode} onChange={event => updatePreference(preference.trigger, event.target.value as NotificationPreferenceMode)}>
              {preferenceOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        ))}
      </div>
      <label className="grid gap-3 border-t border-surface-border bg-surface-tertiary p-4 sm:grid-cols-[1fr_190px] sm:items-center">
        <span>
          <span className="block text-sm font-semibold text-ink">Email digest</span>
          <span className="block text-xs leading-5 text-ink-secondary">Grouped cadence when email delivery is enabled.</span>
        </span>
        <select className="tk-input" value={digest} onChange={event => setDigest(event.target.value as typeof digest)}>
          <option value="immediate">Immediate</option>
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
        </select>
      </label>
    </section>
  )
}

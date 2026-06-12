import { ArrowRight, BriefcaseBusiness, GitBranch, Loader2, Plus, RefreshCw, ShieldCheck, Users } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { FieldError } from '@/components/form/FieldError'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import {
  createOpportunityStageConfig,
  createServiceCatalogItem,
  createStakeholderGapRule,
  createStakeholderRole,
  listAdminOpportunityStages,
  listAdminServiceCatalog,
  listOpportunityStageTransitions,
  listServiceAdjacencies,
  listStakeholderGapRules,
  listStakeholderRoles,
  replaceOpportunityStageTransitions,
  replaceServiceAdjacencies,
  updateOpportunityStageConfig,
  updateServiceCatalogItem,
  updateStakeholderGapRule,
  updateStakeholderRole,
} from '@/services/relationshipsPlanning'
import type { OpportunityStageConfig, OpportunityStageTransitionConfig, ServiceAdjacencyRule, ServiceCatalogItem, StakeholderGapRule, StakeholderRoleConfig } from '@/types/relationshipsPlanning'
import { apiFieldErrors, clearFieldError, FieldErrors } from '@/utils/formErrors'

const emptyService = { slug: '', name: '', category: '', tags: '' }
const emptyRole = { slug: '', name: '', description: '', displayOrder: '10' }
const emptyRule = {
  ruleKey: '',
  title: '',
  description: '',
  severity: 'warning',
  conditionJson: '{\n  "type": "missing_role",\n  "role": "executive_sponsor"\n}',
  displayOrder: '10',
}
const emptyStage = { slug: '', name: '', displayOrder: '10', isTerminal: false, requiresOutcomeReason: false }
const emptyAdjacency = { sourceServiceId: '', targetServiceId: '', relevanceScore: '75', rationale: '' }
const emptyTransition = { fromStage: '', toStage: '', requiresReason: false }
const servicePageSizeOptions = [10, 25, 50]

export function AdminRelationshipPlanningPanel() {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [services, setServices] = useState<ServiceCatalogItem[]>([])
  const [adjacencies, setAdjacencies] = useState<ServiceAdjacencyRule[]>([])
  const [roles, setRoles] = useState<StakeholderRoleConfig[]>([])
  const [gapRules, setGapRules] = useState<StakeholderGapRule[]>([])
  const [stages, setStages] = useState<OpportunityStageConfig[]>([])
  const [transitions, setTransitions] = useState<OpportunityStageTransitionConfig[]>([])
  const [serviceForm, setServiceForm] = useState(emptyService)
  const [roleForm, setRoleForm] = useState(emptyRole)
  const [ruleForm, setRuleForm] = useState(emptyRule)
  const [stageForm, setStageForm] = useState(emptyStage)
  const [adjacencyForm, setAdjacencyForm] = useState(emptyAdjacency)
  const [transitionForm, setTransitionForm] = useState(emptyTransition)
  const [servicePage, setServicePage] = useState(1)
  const [servicePageSize, setServicePageSize] = useState(10)

  const activeServices = useMemo(() => services.filter(item => item.isActive), [services])
  const activeStages = useMemo(() => stages.filter(item => item.isActive), [stages])
  const servicePages = Math.max(1, Math.ceil(services.length / servicePageSize))
  const serviceStartIndex = services.length ? (servicePage - 1) * servicePageSize : 0
  const serviceEndIndex = services.length ? Math.min(serviceStartIndex + servicePageSize, services.length) : 0
  const pagedServices = useMemo(() => services.slice(serviceStartIndex, serviceEndIndex), [serviceEndIndex, serviceStartIndex, services])

  useEffect(() => {
    if (!token) return
    void loadAll()
  }, [token])

  useEffect(() => {
    setServicePage(current => Math.min(Math.max(1, servicePages), current))
  }, [servicePages])

  async function loadAll() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [servicePage, adjacencyItems, rolePage, gapPage, stageItems, transitionItems] = await Promise.all([
        listAdminServiceCatalog(token),
        listServiceAdjacencies(token),
        listStakeholderRoles(token),
        listStakeholderGapRules(token),
        listAdminOpportunityStages(token),
        listOpportunityStageTransitions(token),
      ])
      setServices(servicePage.items)
      setAdjacencies(adjacencyItems)
      setRoles(rolePage.items)
      setGapRules(gapPage.items)
      setStages(stageItems)
      setTransitions(transitionItems)
      setAdjacencyForm(current => ({ ...current, sourceServiceId: current.sourceServiceId || servicePage.items[0]?.id || '', targetServiceId: current.targetServiceId || servicePage.items[1]?.id || '' }))
      setTransitionForm(current => ({ ...current, fromStage: current.fromStage || stageItems[0]?.name || '', toStage: current.toStage || stageItems[1]?.name || '' }))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Relationship planning settings could not load')
    } finally {
      setLoading(false)
    }
  }

  async function submitService(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('service', async () => {
      await createServiceCatalogItem(token, {
        slug: serviceForm.slug,
        name: serviceForm.name,
        category: serviceForm.category || undefined,
        tags: splitList(serviceForm.tags),
      })
      setServiceForm(emptyService)
      toast.success('Service saved')
      await loadAll()
    })
  }

  async function submitRole(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('role', async () => {
      await createStakeholderRole(token, {
        slug: roleForm.slug,
        name: roleForm.name,
        description: roleForm.description || null,
        displayOrder: Number(roleForm.displayOrder || 0),
      })
      setRoleForm(emptyRole)
      toast.success('Stakeholder role saved')
      await loadAll()
    }, { display_order: 'displayOrder' })
  }

  async function submitRule(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('rule', async () => {
      const conditionJson = parseJson(ruleForm.conditionJson, 'rule.conditionJson')
      await createStakeholderGapRule(token, {
        ruleKey: ruleForm.ruleKey,
        title: ruleForm.title,
        description: ruleForm.description,
        severity: ruleForm.severity,
        conditionJson,
        displayOrder: Number(ruleForm.displayOrder || 0),
      })
      setRuleForm(emptyRule)
      toast.success('Gap rule saved')
      await loadAll()
    }, { rule_key: 'ruleKey', condition_json: 'conditionJson', display_order: 'displayOrder' })
  }

  async function submitStage(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('stage', async () => {
      await createOpportunityStageConfig(token, {
        slug: stageForm.slug,
        name: stageForm.name,
        displayOrder: Number(stageForm.displayOrder || 0),
        isTerminal: stageForm.isTerminal,
        requiresOutcomeReason: stageForm.requiresOutcomeReason,
      })
      setStageForm(emptyStage)
      toast.success('Opportunity stage saved')
      await loadAll()
    }, { display_order: 'displayOrder', is_terminal: 'isTerminal', requires_outcome_reason: 'requiresOutcomeReason' })
  }

  async function submitAdjacency(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('adjacency', async () => {
      if (!adjacencyForm.sourceServiceId) throw fieldError('adjacency.sourceServiceId', 'Source service is required.')
      if (!adjacencyForm.targetServiceId) throw fieldError('adjacency.targetServiceId', 'Target service is required.')
      const nextRules = [
        ...adjacencies.map(item => ({ sourceServiceId: item.sourceServiceId, targetServiceId: item.targetServiceId, relevanceScore: item.relevanceScore, rationale: item.rationale, isActive: item.isActive })),
        {
          sourceServiceId: adjacencyForm.sourceServiceId,
          targetServiceId: adjacencyForm.targetServiceId,
          relevanceScore: Number(adjacencyForm.relevanceScore || 0),
          rationale: adjacencyForm.rationale,
          isActive: true,
        },
      ]
      await replaceServiceAdjacencies(token, nextRules)
      setAdjacencyForm(emptyAdjacency)
      toast.success('Adjacency saved')
      await loadAll()
    }, { 'rules.0.source_service_id': 'sourceServiceId', 'rules.0.target_service_id': 'targetServiceId', 'rules.0.relevance_score': 'relevanceScore' })
  }

  async function submitTransition(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('transition', async () => {
      if (!transitionForm.fromStage) throw fieldError('transition.fromStage', 'From stage is required.')
      if (!transitionForm.toStage) throw fieldError('transition.toStage', 'To stage is required.')
      const nextTransitions = [
        ...transitions.map(item => ({ fromStage: item.fromStage, toStage: item.toStage, isActive: item.isActive, requiresReason: item.requiresReason })),
        { fromStage: transitionForm.fromStage, toStage: transitionForm.toStage, isActive: true, requiresReason: transitionForm.requiresReason },
      ]
      await replaceOpportunityStageTransitions(token, nextTransitions)
      setTransitionForm(emptyTransition)
      toast.success('Transition saved')
      await loadAll()
    })
  }

  async function toggleService(item: ServiceCatalogItem) {
    if (!token) return
    await saveToggle(async () => updateServiceCatalogItem(token, item.id, { isActive: !item.isActive }), 'Service status updated')
  }

  async function toggleRole(item: StakeholderRoleConfig) {
    if (!token) return
    await saveToggle(async () => updateStakeholderRole(token, item.id, { isActive: !item.isActive }), 'Stakeholder role status updated')
  }

  async function toggleRule(item: StakeholderGapRule) {
    if (!token) return
    await saveToggle(async () => updateStakeholderGapRule(token, item.id, { isActive: !item.isActive }), 'Gap rule status updated')
  }

  async function toggleStage(item: OpportunityStageConfig) {
    if (!token) return
    await saveToggle(async () => updateOpportunityStageConfig(token, item.id, { isActive: !item.isActive }), 'Stage status updated')
  }

  async function saveToggle(action: () => Promise<unknown>, success: string) {
    setSaving(true)
    try {
      await action()
      toast.success(success)
      await loadAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Status could not be updated')
    } finally {
      setSaving(false)
    }
  }

  async function saveWithErrors(prefix: string, action: () => Promise<void>, aliases: Record<string, string> = {}) {
    setSaving(true)
    setFieldErrors(removePrefix(fieldErrors, prefix))
    try {
      await action()
    } catch (err) {
      if (err instanceof ApiError) {
        setFieldErrors(current => ({ ...removePrefix(current, prefix), ...prefixErrors(prefix, apiFieldErrors(err, aliases)) }))
        toast.error(err.message)
      } else if (err instanceof Error && err.name === 'FieldValidationError') {
        setFieldErrors(current => ({ ...removePrefix(current, prefix), [err.message.split('|')[0]]: err.message.split('|')[1] }))
      } else {
        toast.error(err instanceof Error ? err.message : 'Settings could not be saved')
      }
    } finally {
      setSaving(false)
    }
  }

  function parseJson(value: string, key: string) {
    try {
      const parsed = JSON.parse(value)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error()
      return parsed as Record<string, unknown>
    } catch {
      throw fieldError(key, 'Condition JSON must be a valid JSON object.')
    }
  }

  if (loading) {
    return (
      <section className="tk-card flex min-h-[240px] items-center justify-center gap-2 p-6 text-sm font-semibold text-ink-secondary">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading planning settings
      </section>
    )
  }

  if (error) {
    return (
      <section className="tk-card flex min-h-[240px] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-semibold text-rag-red">{error}</p>
        <button type="button" className="tk-button-secondary" onClick={loadAll}>
          <RefreshCw className="h-4 w-4" />
          Retry
        </button>
      </section>
    )
  }

  return (
    <div className="space-y-4">
      <ConfigCard icon={BriefcaseBusiness} eyebrow="Service catalog" title="Services">
        <form onSubmit={submitService} className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 border-b border-surface-border bg-surface-tertiary p-4">
          <TextInput label="Name" value={serviceForm.name} error={fieldErrors['service.name']} onChange={value => updateService('name', value)} />
          <TextInput label="Slug" value={serviceForm.slug} error={fieldErrors['service.slug']} onChange={value => updateService('slug', value)} />
          <TextInput label="Category" value={serviceForm.category} error={fieldErrors['service.category']} onChange={value => updateService('category', value)} />
          <TextInput label="Tags" value={serviceForm.tags} error={fieldErrors['service.tags']} onChange={value => updateService('tags', value)} />
          <SubmitButton saving={saving} label="Add" />
        </form>
        <div className="divide-y divide-surface-border">
          <div className="hidden bg-surface-secondary px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary xl:grid xl:grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.7fr)_minmax(180px,1fr)_80px_96px] xl:gap-4">
            <span>Service</span>
            <span>Category</span>
            <span>Tags</span>
            <span>Usage</span>
            <span>Status</span>
          </div>
          {pagedServices.map(item => (
            <div key={item.id} className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.7fr)_minmax(180px,1fr)_80px_96px] xl:items-center xl:gap-4">
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{item.name}</span>
                <span className="block break-words text-xs text-ink-secondary">{item.slug}</span>
              </span>
              <MetaField label="Category">{item.category || 'Uncategorized'}</MetaField>
              <MetaField label="Tags">{item.tags.join(', ') || 'None'}</MetaField>
              <MetaField label="Usage">{item.inUseCount}</MetaField>
              <span className="flex xl:justify-start"><StatusButton active={item.isActive} onClick={() => toggleService(item)} /></span>
            </div>
          ))}
          {!services.length ? <EmptyState icon={BriefcaseBusiness} heading="No services configured" body="Add the first service catalog item." className="py-8" /> : null}
        </div>
        {services.length ? (
          <ListPagination
            label="services"
            page={servicePage}
            pages={servicePages}
            pageSize={servicePageSize}
            pageSizeLabel="Services per page"
            pageSizeOptions={servicePageSizeOptions}
            start={serviceStartIndex + 1}
            end={serviceEndIndex}
            total={services.length}
            onPageSizeChange={value => {
              setServicePageSize(value)
              setServicePage(1)
            }}
            onPrevious={() => setServicePage(current => Math.max(1, current - 1))}
            onNext={() => setServicePage(current => Math.min(servicePages, current + 1))}
          />
        ) : null}
      </ConfigCard>

      <ConfigCard icon={ArrowRight} eyebrow="Service adjacency" title="Service adjacencies">
        <form onSubmit={submitAdjacency} className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3 border-b border-surface-border bg-surface-tertiary p-4">
          <SelectInput label="Source" value={adjacencyForm.sourceServiceId} error={fieldErrors['adjacency.sourceServiceId']} options={activeServices.map(item => ({ value: item.id, label: item.name }))} onChange={value => updateAdjacency('sourceServiceId', value)} />
          <SelectInput label="Target" value={adjacencyForm.targetServiceId} error={fieldErrors['adjacency.targetServiceId']} options={activeServices.map(item => ({ value: item.id, label: item.name }))} onChange={value => updateAdjacency('targetServiceId', value)} />
          <TextInput label="Score" type="number" value={adjacencyForm.relevanceScore} error={fieldErrors['adjacency.relevanceScore']} onChange={value => updateAdjacency('relevanceScore', value)} />
          <TextInput label="Rationale" value={adjacencyForm.rationale} error={fieldErrors['adjacency.rationale']} onChange={value => updateAdjacency('rationale', value)} />
          <SubmitButton saving={saving} label="Link" />
        </form>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 p-4">
          {adjacencies.map(item => (
            <div key={item.id} className="rounded-lg border border-surface-border p-3">
              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                <span>{item.sourceServiceName}</span>
                <ArrowRight className="h-4 w-4 text-brand-blue" />
                <span>{item.targetServiceName}</span>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">{item.rationale}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge label={`Score ${item.relevanceScore}`} />
                {!item.isActive ? <Badge label="Inactive" /> : null}
              </div>
            </div>
          ))}
          {!adjacencies.length ? <EmptyState icon={ArrowRight} heading="No adjacencies configured" body="No service pairs have been linked yet." className="py-8" /> : null}
        </div>
      </ConfigCard>

      <ConfigCard icon={Users} eyebrow="Stakeholder coverage" title="Roles and gap rules">
        <form onSubmit={submitRole} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 border-b border-surface-border bg-surface-tertiary p-4">
          <TextInput label="Name" value={roleForm.name} error={fieldErrors['role.name']} onChange={value => updateRole('name', value)} />
          <TextInput label="Slug" value={roleForm.slug} error={fieldErrors['role.slug']} onChange={value => updateRole('slug', value)} />
          <TextInput label="Order" type="number" value={roleForm.displayOrder} error={fieldErrors['role.displayOrder']} onChange={value => updateRole('displayOrder', value)} />
          <SubmitButton saving={saving} label="Add" />
        </form>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2 p-4">
          {roles.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border p-3">
              <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{item.name}</span><span className="block break-words text-xs text-ink-secondary">{item.slug} · {item.inUseCount} linked</span></span>
              <StatusButton active={item.isActive} onClick={() => toggleRole(item)} />
            </div>
          ))}
        </div>
        <form onSubmit={submitRule} className="grid gap-3 border-t border-surface-border p-4">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3">
            <TextInput label="Title" value={ruleForm.title} error={fieldErrors['rule.title']} onChange={value => updateRule('title', value)} />
            <TextInput label="Rule key" value={ruleForm.ruleKey} error={fieldErrors['rule.ruleKey']} onChange={value => updateRule('ruleKey', value)} />
            <SelectInput label="Severity" value={ruleForm.severity} error={fieldErrors['rule.severity']} options={[{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }]} onChange={value => updateRule('severity', value)} />
            <TextInput label="Order" type="number" value={ruleForm.displayOrder} error={fieldErrors['rule.displayOrder']} onChange={value => updateRule('displayOrder', value)} />
          </div>
          <TextInput label="Description" value={ruleForm.description} error={fieldErrors['rule.description']} onChange={value => updateRule('description', value)} />
          <TextArea label="Condition JSON" value={ruleForm.conditionJson} error={fieldErrors['rule.conditionJson']} onChange={value => updateRule('conditionJson', value)} />
          <SubmitButton saving={saving} label="Add rule" />
        </form>
        <div className="grid gap-2 border-t border-surface-border p-4">
          {gapRules.map(item => (
            <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-surface-border p-3 sm:flex-row sm:items-center sm:justify-between">
              <span className="min-w-0"><span className="block text-sm font-semibold text-ink">{item.title}</span><span className="block break-words text-xs text-ink-secondary">{item.ruleKey} · {item.severity}</span></span>
              <StatusButton active={item.isActive} onClick={() => toggleRule(item)} />
            </div>
          ))}
        </div>
      </ConfigCard>

      <ConfigCard icon={GitBranch} eyebrow="Opportunity workflow" title="Stages and transitions">
        <form onSubmit={submitStage} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 border-b border-surface-border bg-surface-tertiary p-4">
          <TextInput label="Name" value={stageForm.name} error={fieldErrors['stage.name']} onChange={value => updateStage('name', value)} />
          <TextInput label="Slug" value={stageForm.slug} error={fieldErrors['stage.slug']} onChange={value => updateStage('slug', value)} />
          <TextInput label="Order" type="number" value={stageForm.displayOrder} error={fieldErrors['stage.displayOrder']} onChange={value => updateStage('displayOrder', value)} />
          <CheckInput label="Terminal" checked={stageForm.isTerminal} onChange={value => updateStage('isTerminal', value)} />
          <CheckInput label="Outcome reason" checked={stageForm.requiresOutcomeReason} onChange={value => updateStage('requiresOutcomeReason', value)} />
          <SubmitButton saving={saving} label="Add" />
        </form>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3 p-4">
          {stages.map(item => (
            <div key={item.id} className="rounded-lg border border-surface-border p-3">
              <div className="flex items-start justify-between gap-3">
                <span><span className="block text-sm font-semibold text-ink">{item.name}</span><span className="block text-xs text-ink-secondary">{item.slug} · order {item.displayOrder}</span></span>
                <StatusButton active={item.isActive} onClick={() => toggleStage(item)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.isTerminal ? <Badge label="Terminal" /> : null}
                {item.requiresOutcomeReason ? <Badge label="Outcome reason" /> : null}
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={submitTransition} className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-3 border-t border-surface-border p-4">
          <SelectInput label="From" value={transitionForm.fromStage} error={fieldErrors['transition.fromStage']} options={activeStages.map(item => ({ value: item.name, label: item.name }))} onChange={value => updateTransition('fromStage', value)} />
          <SelectInput label="To" value={transitionForm.toStage} error={fieldErrors['transition.toStage']} options={activeStages.map(item => ({ value: item.name, label: item.name }))} onChange={value => updateTransition('toStage', value)} />
          <CheckInput label="Reason required" checked={transitionForm.requiresReason} onChange={value => updateTransition('requiresReason', value)} />
          <SubmitButton saving={saving} label="Link" />
        </form>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2 border-t border-surface-border p-4">
          {transitions.map(item => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border p-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">{item.fromStage}<ArrowRight className="h-4 w-4 text-brand-blue" />{item.toStage}</span>
              {item.requiresReason ? <Badge label="Reason" /> : null}
            </div>
          ))}
        </div>
      </ConfigCard>
    </div>
  )

  function updateService(field: keyof typeof serviceForm, value: string) {
    setServiceForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, `service.${field}`))
  }

  function updateRole(field: keyof typeof roleForm, value: string) {
    setRoleForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, `role.${field}`))
  }

  function updateRule(field: keyof typeof ruleForm, value: string) {
    setRuleForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, `rule.${field}`))
  }

  function updateStage(field: keyof typeof stageForm, value: string | boolean) {
    setStageForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, `stage.${field}`))
  }

  function updateAdjacency(field: keyof typeof adjacencyForm, value: string) {
    setAdjacencyForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, `adjacency.${field}`))
  }

  function updateTransition(field: keyof typeof transitionForm, value: string | boolean) {
    setTransitionForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, `transition.${field}`))
  }
}

function ConfigCard({ icon: Icon, eyebrow, title, children }: { icon: LucideIcon; eyebrow: string; title: string; children: ReactNode }) {
  return (
    <section className="tk-card overflow-hidden" aria-label={title}>
      <div className="flex items-center gap-3 border-b border-surface-border p-5">
        <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue"><Icon className="h-5 w-5" /></span>
        <div>
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{eyebrow}</p>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
        </div>
      </div>
      {children}
    </section>
  )
}

function TextInput({ label, value, error, onChange, type = 'text' }: { label: string; value: string; error?: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="tk-label text-xs">{label}</span>
      <input type={type} className="tk-input min-w-0" value={value} aria-invalid={Boolean(error)} onChange={event => onChange(event.target.value)} />
      <FieldError id={`${label.toLowerCase().replace(/\s+/g, '-')}-error`} message={error} />
    </label>
  )
}

function TextArea({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="tk-label text-xs">{label}</span>
      <textarea className="tk-input min-h-[120px] min-w-0 font-mono text-xs" value={value} aria-invalid={Boolean(error)} onChange={event => onChange(event.target.value)} />
      <FieldError id={`${label.toLowerCase().replace(/\s+/g, '-')}-error`} message={error} />
    </label>
  )
}

function SelectInput({ label, value, error, options, onChange }: { label: string; value: string; error?: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="tk-label text-xs">{label}</span>
      <select className="tk-input min-w-0" value={value} aria-invalid={Boolean(error)} onChange={event => onChange(event.target.value)}>
        <option value="">Select</option>
        {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      <FieldError id={`${label.toLowerCase().replace(/\s+/g, '-')}-error`} message={error} />
    </label>
  )
}

function CheckInput({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-[44px] items-end gap-2 pb-2 text-sm font-semibold text-ink">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
      {label}
    </label>
  )
}

function SubmitButton({ saving, label }: { saving: boolean; label: string }) {
  return (
    <button type="submit" className="tk-button-primary w-full justify-center self-end" disabled={saving}>
      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
      {label}
    </button>
  )
}

function StatusButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={active ? 'rounded-full bg-rag-green/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-rag-green' : 'rounded-full bg-surface-tertiary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary'} onClick={onClick}>
      {active ? 'Active' : 'Inactive'}
    </button>
  )
}

function Badge({ label }: { label: string }) {
  return <span className="rounded-full bg-blue-tint-20 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-blue">{label}</span>
}

function MetaField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="min-w-0 text-sm text-ink-secondary">
      <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-ink-secondary xl:hidden">{label}</span>
      <span className="block break-words">{children}</span>
    </span>
  )
}

function ListPagination({
  label,
  page,
  pages,
  pageSize,
  pageSizeLabel,
  pageSizeOptions,
  start,
  end,
  total,
  onPageSizeChange,
  onPrevious,
  onNext,
}: {
  label: string
  page: number
  pages: number
  pageSize: number
  pageSizeLabel: string
  pageSizeOptions: number[]
  start: number
  end: number
  total: number
  onPageSizeChange: (value: number) => void
  onPrevious: () => void
  onNext: () => void
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-surface-border bg-white px-4 py-3 text-sm text-ink-secondary sm:flex-row sm:items-center sm:justify-between">
      <span>
        Showing {start}-{end} of {total} {label}
      </span>
      <div className="flex flex-wrap items-center gap-2">
        <select className="tk-input min-h-[38px] w-[150px] py-1.5 text-sm" value={pageSize} onChange={event => onPageSizeChange(Number(event.target.value))} aria-label={pageSizeLabel}>
          {pageSizeOptions.map(option => <option key={option} value={option}>{option} per page</option>)}
        </select>
        <button type="button" className="tk-button-secondary min-h-[38px] px-3 py-1.5" onClick={onPrevious} disabled={page <= 1}>
          Previous
        </button>
        <span className="min-w-[72px] text-center text-xs font-semibold uppercase tracking-wider text-ink-secondary">
          {page} / {pages}
        </span>
        <button type="button" className="tk-button-secondary min-h-[38px] px-3 py-1.5" onClick={onNext} disabled={!pages || page >= pages}>
          Next
        </button>
      </div>
    </div>
  )
}

function splitList(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function prefixErrors(prefix: string, errors: FieldErrors) {
  return Object.fromEntries(Object.entries(errors).map(([field, message]) => [`${prefix}.${field}`, message]))
}

function removePrefix(errors: FieldErrors, prefix: string) {
  return Object.fromEntries(Object.entries(errors).filter(([field]) => !field.startsWith(`${prefix}.`)))
}

function fieldError(field: string, message: string) {
  const error = new Error(`${field}|${message}`)
  error.name = 'FieldValidationError'
  return error
}

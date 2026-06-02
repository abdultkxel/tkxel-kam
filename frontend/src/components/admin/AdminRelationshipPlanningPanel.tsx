import { ArrowLeft, ArrowRight, BriefcaseBusiness, GitBranch, Loader2, Pencil, Plus, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react'
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
const emptyServiceEdit = { slug: '', name: '', category: '', description: '', tags: '', displayOrder: '0' }
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

export function AdminRelationshipPlanningPanel() {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [services, setServices] = useState<ServiceCatalogItem[]>([])
  const [serviceTotal, setServiceTotal] = useState(0)
  const [servicePages, setServicePages] = useState(1)
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceCategory, setServiceCategory] = useState('')
  const [serviceActiveState, setServiceActiveState] = useState<'all' | 'active' | 'inactive'>('all')
  const [serviceSort, setServiceSort] = useState<'display_order' | 'name' | 'category' | 'updated_at'>('display_order')
  const [servicePage, setServicePage] = useState(1)
  const [editingServiceId, setEditingServiceId] = useState('')
  const [serviceEditForm, setServiceEditForm] = useState(emptyServiceEdit)
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

  const activeServices = useMemo(() => services.filter(item => item.isActive), [services])
  const activeStages = useMemo(() => stages.filter(item => item.isActive), [stages])

  useEffect(() => {
    if (!token) return
    void loadAll()
  }, [token, serviceActiveState, serviceCategory, servicePage, serviceSearch, serviceSort])

  async function loadAll() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [serviceCatalogPage, adjacencyItems, rolePage, gapPage, stageItems, transitionItems] = await Promise.all([
        listAdminServiceCatalog(token, { search: serviceSearch, category: serviceCategory, activeState: serviceActiveState, sort: serviceSort, page: servicePage, pageSize: 10 }),
        listServiceAdjacencies(token),
        listStakeholderRoles(token),
        listStakeholderGapRules(token),
        listAdminOpportunityStages(token),
        listOpportunityStageTransitions(token),
      ])
      setServices(serviceCatalogPage.items)
      setServiceTotal(serviceCatalogPage.total)
      setServicePages(serviceCatalogPage.pages || 1)
      setAdjacencies(adjacencyItems)
      setRoles(rolePage.items)
      setGapRules(gapPage.items)
      setStages(stageItems)
      setTransitions(transitionItems)
      setAdjacencyForm(current => ({ ...current, sourceServiceId: current.sourceServiceId || serviceCatalogPage.items[0]?.id || '', targetServiceId: current.targetServiceId || serviceCatalogPage.items[1]?.id || '' }))
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

  async function submitServiceEdit(event: FormEvent) {
    event.preventDefault()
    if (!token || !editingServiceId) return
    await saveWithErrors('serviceEdit', async () => {
      await updateServiceCatalogItem(token, editingServiceId, {
        slug: serviceEditForm.slug,
        name: serviceEditForm.name,
        category: serviceEditForm.category || null,
        description: serviceEditForm.description || null,
        tags: splitList(serviceEditForm.tags),
        displayOrder: Number(serviceEditForm.displayOrder || 0),
      })
      setEditingServiceId('')
      setServiceEditForm(emptyServiceEdit)
      toast.success('Service updated')
      await loadAll()
    }, { display_order: 'displayOrder' })
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
    const nextIndex = adjacencies.length
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
    }, adjacencyAliases(nextIndex))
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

  async function toggleAdjacency(item: ServiceAdjacencyRule) {
    if (!token) return
    await saveToggle(
      async () => replaceServiceAdjacencies(token, adjacencies.map(rule => ({ sourceServiceId: rule.sourceServiceId, targetServiceId: rule.targetServiceId, relevanceScore: rule.relevanceScore, rationale: rule.rationale, isActive: rule.id === item.id ? !rule.isActive : rule.isActive }))),
      'Adjacency status updated',
    )
  }

  function startEditingService(item: ServiceCatalogItem) {
    setEditingServiceId(item.id)
    setServiceEditForm({ slug: item.slug, name: item.name, category: item.category ?? '', description: item.description ?? '', tags: item.tags.join(', '), displayOrder: String(item.displayOrder) })
    setFieldErrors(current => removePrefix(current, 'serviceEdit'))
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
      <section className="grid gap-4 xl:grid-cols-2">
        <ConfigCard icon={BriefcaseBusiness} eyebrow="Service catalog" title="Services and adjacency">
          <div className="grid gap-3 border-b border-surface-border p-4 md:grid-cols-[minmax(160px,1fr)_minmax(140px,180px)_minmax(140px,180px)_minmax(140px,180px)]">
            <label className="grid gap-1">
              <span className="tk-label text-xs">Search</span>
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-secondary" />
                <input className="tk-input pl-9" value={serviceSearch} onChange={event => { setServiceSearch(event.target.value); setServicePage(1) }} />
              </span>
            </label>
            <TextInput label="Category filter" value={serviceCategory} onChange={value => { setServiceCategory(value); setServicePage(1) }} />
            <SelectInput label="State" value={serviceActiveState} options={[{ value: 'all', label: 'All' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} onChange={value => { setServiceActiveState(value as typeof serviceActiveState); setServicePage(1) }} />
            <SelectInput label="Sort" value={serviceSort} options={[{ value: 'display_order', label: 'Display order' }, { value: 'name', label: 'Name' }, { value: 'category', label: 'Category' }, { value: 'updated_at', label: 'Updated' }]} onChange={value => { setServiceSort(value as typeof serviceSort); setServicePage(1) }} />
          </div>
          <form onSubmit={submitService} className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 md:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_160px_180px_auto]">
            <TextInput label="Name" value={serviceForm.name} error={fieldErrors['service.name']} onChange={value => updateService('name', value)} />
            <TextInput label="Slug" value={serviceForm.slug} error={fieldErrors['service.slug']} onChange={value => updateService('slug', value)} />
            <TextInput label="Category" value={serviceForm.category} error={fieldErrors['service.category']} onChange={value => updateService('category', value)} />
            <TextInput label="Tags" value={serviceForm.tags} error={fieldErrors['service.tags']} onChange={value => updateService('tags', value)} />
            <SubmitButton saving={saving} label="Add" />
          </form>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-surface-border bg-surface-secondary text-xs font-semibold uppercase tracking-wider text-ink-secondary">
                <tr><th className="px-4 py-3">Service</th><th className="px-4 py-3">Category</th><th className="px-4 py-3">Tags</th><th className="px-4 py-3">Usage</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Actions</th></tr>
              </thead>
              <tbody>
                {services.map(item => (
                  <tr key={item.id} className="border-b border-surface-border last:border-b-0">
                    <td className="px-4 py-3"><span className="font-semibold text-ink">{item.name}</span><span className="block text-xs text-ink-secondary">{item.slug}</span></td>
                    <td className="px-4 py-3 text-ink-secondary">{item.category || 'Uncategorized'}</td>
                    <td className="px-4 py-3 text-ink-secondary">{item.tags.join(', ') || 'None'}</td>
                    <td className="px-4 py-3 text-ink-secondary">{item.inUseCount}</td>
                    <td className="px-4 py-3"><StatusButton active={item.isActive} onClick={() => toggleService(item)} /></td>
                    <td className="px-4 py-3">
                      <button type="button" className="tk-button-secondary px-3 py-2" onClick={() => startEditingService(item)}>
                        <Pencil className="h-4 w-4" />
                        Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!services.length ? <EmptyState icon={BriefcaseBusiness} heading="No services configured" body="Add the first service catalog item." className="py-8" /> : null}
          </div>
          {editingServiceId ? (
            <form onSubmit={submitServiceEdit} className="grid gap-3 border-t border-surface-border bg-surface-secondary p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink">Edit service</h3>
                <button type="button" className="tk-button-secondary px-3 py-2" onClick={() => { setEditingServiceId(''); setServiceEditForm(emptyServiceEdit) }}>
                  <X className="h-4 w-4" />
                  Cancel
                </button>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                <TextInput label="Name" value={serviceEditForm.name} error={fieldErrors['serviceEdit.name']} onChange={value => updateServiceEdit('name', value)} />
                <TextInput label="Slug" value={serviceEditForm.slug} error={fieldErrors['serviceEdit.slug']} onChange={value => updateServiceEdit('slug', value)} />
                <TextInput label="Category" value={serviceEditForm.category} error={fieldErrors['serviceEdit.category']} onChange={value => updateServiceEdit('category', value)} />
                <TextInput label="Tags" value={serviceEditForm.tags} error={fieldErrors['serviceEdit.tags']} onChange={value => updateServiceEdit('tags', value)} />
                <TextInput label="Order" type="number" value={serviceEditForm.displayOrder} error={fieldErrors['serviceEdit.displayOrder']} onChange={value => updateServiceEdit('displayOrder', value)} />
              </div>
              <TextArea label="Description" value={serviceEditForm.description} error={fieldErrors['serviceEdit.description']} onChange={value => updateServiceEdit('description', value)} />
              <SubmitButton saving={saving} label="Save changes" />
            </form>
          ) : null}
          <div className="flex flex-col gap-2 border-t border-surface-border p-4 text-sm text-ink-secondary sm:flex-row sm:items-center sm:justify-between">
            <span>{serviceTotal} services · page {servicePage} of {servicePages}</span>
            <span className="flex gap-2">
              <button type="button" className="tk-button-secondary px-3 py-2" disabled={servicePage <= 1} onClick={() => setServicePage(page => Math.max(1, page - 1))}>
                <ArrowLeft className="h-4 w-4" />
                Previous
              </button>
              <button type="button" className="tk-button-secondary px-3 py-2" disabled={servicePage >= servicePages} onClick={() => setServicePage(page => Math.min(servicePages, page + 1))}>
                <ArrowRight className="h-4 w-4" />
                Next
              </button>
            </span>
          </div>
          <form onSubmit={submitAdjacency} className="grid gap-3 border-t border-surface-border p-4 md:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_120px_minmax(180px,1fr)_auto]">
            <SelectInput label="Source" value={adjacencyForm.sourceServiceId} error={fieldErrors['adjacency.sourceServiceId']} options={activeServices.map(item => ({ value: item.id, label: item.name }))} onChange={value => updateAdjacency('sourceServiceId', value)} />
            <SelectInput label="Target" value={adjacencyForm.targetServiceId} error={fieldErrors['adjacency.targetServiceId']} options={activeServices.map(item => ({ value: item.id, label: item.name }))} onChange={value => updateAdjacency('targetServiceId', value)} />
            <TextInput label="Score" type="number" value={adjacencyForm.relevanceScore} error={fieldErrors['adjacency.relevanceScore']} onChange={value => updateAdjacency('relevanceScore', value)} />
            <TextInput label="Rationale" value={adjacencyForm.rationale} error={fieldErrors['adjacency.rationale']} onChange={value => updateAdjacency('rationale', value)} />
            <SubmitButton saving={saving} label="Link" />
          </form>
          <div className="grid gap-2 border-t border-surface-border p-4">
            {adjacencies.map(item => (
              <div key={item.id} className="flex flex-col gap-2 rounded-lg border border-surface-border p-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-sm font-semibold text-ink">{item.sourceServiceName}<ArrowRight className="mx-2 inline h-4 w-4 text-brand-blue" />{item.targetServiceName}</span>
                <span className="flex items-center gap-2">
                  <Badge label={`${item.relevanceScore}%`} />
                  <StatusButton active={item.isActive} onClick={() => toggleAdjacency(item)} />
                </span>
              </div>
            ))}
          </div>
        </ConfigCard>

        <ConfigCard icon={Users} eyebrow="Stakeholder coverage" title="Roles and gap rules">
          <form onSubmit={submitRole} className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 md:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_110px_auto]">
            <TextInput label="Name" value={roleForm.name} error={fieldErrors['role.name']} onChange={value => updateRole('name', value)} />
            <TextInput label="Slug" value={roleForm.slug} error={fieldErrors['role.slug']} onChange={value => updateRole('slug', value)} />
            <TextInput label="Order" type="number" value={roleForm.displayOrder} error={fieldErrors['role.displayOrder']} onChange={value => updateRole('displayOrder', value)} />
            <SubmitButton saving={saving} label="Add" />
          </form>
          <div className="grid gap-2 p-4 sm:grid-cols-2">
            {roles.map(item => (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border p-3">
                <span><span className="block text-sm font-semibold text-ink">{item.name}</span><span className="block text-xs text-ink-secondary">{item.slug} · {item.inUseCount} linked</span></span>
                <StatusButton active={item.isActive} onClick={() => toggleRole(item)} />
              </div>
            ))}
          </div>
          <form onSubmit={submitRule} className="grid gap-3 border-t border-surface-border p-4">
            <div className="grid gap-3 md:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_150px_110px]">
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
                <span><span className="block text-sm font-semibold text-ink">{item.title}</span><span className="block text-xs text-ink-secondary">{item.ruleKey} · {item.severity}</span></span>
                <StatusButton active={item.isActive} onClick={() => toggleRule(item)} />
              </div>
            ))}
          </div>
        </ConfigCard>
      </section>

      <ConfigCard icon={GitBranch} eyebrow="Opportunity workflow" title="Stages and transitions">
        <form onSubmit={submitStage} className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 md:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_110px_160px_170px_auto]">
          <TextInput label="Name" value={stageForm.name} error={fieldErrors['stage.name']} onChange={value => updateStage('name', value)} />
          <TextInput label="Slug" value={stageForm.slug} error={fieldErrors['stage.slug']} onChange={value => updateStage('slug', value)} />
          <TextInput label="Order" type="number" value={stageForm.displayOrder} error={fieldErrors['stage.displayOrder']} onChange={value => updateStage('displayOrder', value)} />
          <CheckInput label="Terminal" checked={stageForm.isTerminal} onChange={value => updateStage('isTerminal', value)} />
          <CheckInput label="Outcome reason" checked={stageForm.requiresOutcomeReason} onChange={value => updateStage('requiresOutcomeReason', value)} />
          <SubmitButton saving={saving} label="Add" />
        </form>
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
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
        <form onSubmit={submitTransition} className="grid gap-3 border-t border-surface-border p-4 md:grid-cols-[minmax(160px,1fr)_minmax(160px,1fr)_170px_auto]">
          <SelectInput label="From" value={transitionForm.fromStage} error={fieldErrors['transition.fromStage']} options={activeStages.map(item => ({ value: item.name, label: item.name }))} onChange={value => updateTransition('fromStage', value)} />
          <SelectInput label="To" value={transitionForm.toStage} error={fieldErrors['transition.toStage']} options={activeStages.map(item => ({ value: item.name, label: item.name }))} onChange={value => updateTransition('toStage', value)} />
          <CheckInput label="Reason required" checked={transitionForm.requiresReason} onChange={value => updateTransition('requiresReason', value)} />
          <SubmitButton saving={saving} label="Link" />
        </form>
        <div className="grid gap-2 border-t border-surface-border p-4 md:grid-cols-2 xl:grid-cols-3">
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

  function updateServiceEdit(field: keyof typeof serviceEditForm, value: string) {
    setServiceEditForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, `serviceEdit.${field}`))
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
    <section className="tk-card overflow-hidden">
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
    <label className="grid gap-1">
      <span className="tk-label text-xs">{label}</span>
      <input type={type} className="tk-input" value={value} aria-invalid={Boolean(error)} onChange={event => onChange(event.target.value)} />
      <FieldError id={`${label.toLowerCase().replace(/\s+/g, '-')}-error`} message={error} />
    </label>
  )
}

function TextArea({ label, value, error, onChange }: { label: string; value: string; error?: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="tk-label text-xs">{label}</span>
      <textarea className="tk-input min-h-[120px] font-mono text-xs" value={value} aria-invalid={Boolean(error)} onChange={event => onChange(event.target.value)} />
      <FieldError id={`${label.toLowerCase().replace(/\s+/g, '-')}-error`} message={error} />
    </label>
  )
}

function SelectInput({ label, value, error, options, onChange }: { label: string; value: string; error?: string; options: { value: string; label: string }[]; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="tk-label text-xs">{label}</span>
      <select className="tk-input" value={value} aria-invalid={Boolean(error)} onChange={event => onChange(event.target.value)}>
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
    <button type="submit" className="tk-button-primary self-end" disabled={saving}>
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

function splitList(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function prefixErrors(prefix: string, errors: FieldErrors) {
  return Object.fromEntries(Object.entries(errors).map(([field, message]) => [`${prefix}.${field}`, message]))
}

function removePrefix(errors: FieldErrors, prefix: string) {
  return Object.fromEntries(Object.entries(errors).filter(([field]) => !field.startsWith(`${prefix}.`)))
}

function adjacencyAliases(index: number) {
  return {
    [`rules.${index}.source_service_id`]: 'sourceServiceId',
    [`rules.${index}.target_service_id`]: 'targetServiceId',
    [`rules.${index}.relevance_score`]: 'relevanceScore',
    [`rules.${index}.rationale`]: 'rationale',
  }
}

function fieldError(field: string, message: string) {
  const error = new Error(`${field}|${message}`)
  error.name = 'FieldValidationError'
  return error
}

import * as Dialog from '@radix-ui/react-dialog'
import { ArrowRight, BriefcaseBusiness, Loader2, Package, Pencil, Plus, RefreshCw, Trash2, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { FormEvent, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/admin/ConfirmDialog'
import { FieldError } from '@/components/form/FieldError'
import { EmptyState } from '@/components/ui/EmptyState'
import { useAuth } from '@/contexts/AuthContext'
import { ApiError } from '@/services/api'
import {
  createServiceCatalogItem,
  createServiceGrowthBundle,
  createServiceGrowthRule,
  createStakeholderGapRule,
  createStakeholderRole,
  deleteStakeholderRole,
  listAdminServiceCatalog,
  listServiceGrowthBundles,
  listServiceGrowthRules,
  listStakeholderGapRules,
  listStakeholderRoles,
  updateServiceCatalogItem,
  updateServiceGrowthBundle,
  updateServiceGrowthRule,
  updateStakeholderGapRule,
  updateStakeholderRole,
} from '@/services/relationshipsPlanning'
import type { ServiceCatalogItem, ServiceGrowthBundle, ServiceGrowthRule, ServiceGrowthSelectorType, StakeholderGapRule, StakeholderRoleConfig } from '@/types/relationshipsPlanning'
import { apiFieldErrors, clearFieldError, FieldErrors } from '@/utils/formErrors'

type StakeholderGapConditionType = 'missing_role' | 'missing_any_role' | 'max_active_stakeholders' | 'missing_any_influence' | 'political_risk_present' | 'stale_interaction'

const emptyService = { slug: '', name: '', category: '', description: '', tags: [] as string[] }
const emptyRole = { slug: '', name: '', description: '', displayOrder: '10' }
const emptyRule = {
  ruleKey: '',
  title: '',
  description: '',
  severity: 'warning',
  conditionType: 'missing_role' as StakeholderGapConditionType,
  role: 'executive_sponsor',
  roles: ['executive_sponsor'] as string[],
  count: '1',
  influences: ['high', 'critical'] as string[],
  risk: 'high',
  days: '90',
  displayOrder: '10',
}
const emptyBundle = { slug: '', name: '', description: '', displayOrder: '10', serviceIds: [] as string[] }
const emptyGrowthRule = { sourceSelectorType: 'category' as ServiceGrowthSelectorType, sourceSelectorValue: '', targetSelectorType: 'category' as ServiceGrowthSelectorType, targetSelectorValue: '', baseFitScore: '75', priority: '10', rationaleTemplate: '' }
const servicePageSizeOptions = [10, 25, 50]
const rolePageSizeOptions = [12, 24, 50]
const rulePageSizeOptions = [10, 25, 50]

export function AdminRelationshipPlanningPanel() {
  const { token } = useAuth()
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deletingRole, setDeletingRole] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({})
  const [services, setServices] = useState<ServiceCatalogItem[]>([])
  const [bundles, setBundles] = useState<ServiceGrowthBundle[]>([])
  const [growthRules, setGrowthRules] = useState<ServiceGrowthRule[]>([])
  const [roles, setRoles] = useState<StakeholderRoleConfig[]>([])
  const [gapRules, setGapRules] = useState<StakeholderGapRule[]>([])
  const [serviceForm, setServiceForm] = useState(emptyService)
  const [serviceTagDraft, setServiceTagDraft] = useState('')
  const [editingServiceId, setEditingServiceId] = useState<string | null>(null)
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false)
  const [roleForm, setRoleForm] = useState(emptyRole)
  const [ruleForm, setRuleForm] = useState(emptyRule)
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [roleDialogOpen, setRoleDialogOpen] = useState(false)
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false)
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<StakeholderRoleConfig | null>(null)
  const [bundleForm, setBundleForm] = useState(emptyBundle)
  const [editingBundleId, setEditingBundleId] = useState<string | null>(null)
  const [bundleDialogOpen, setBundleDialogOpen] = useState(false)
  const [bundleServiceSearch, setBundleServiceSearch] = useState('')
  const [growthRuleForm, setGrowthRuleForm] = useState(emptyGrowthRule)
  const [growthRuleDialogOpen, setGrowthRuleDialogOpen] = useState(false)
  const [servicePage, setServicePage] = useState(1)
  const [servicePageSize, setServicePageSize] = useState(10)
  const [rolePage, setRolePage] = useState(1)
  const [rolePageSize, setRolePageSize] = useState(12)
  const [rulePage, setRulePage] = useState(1)
  const [rulePageSize, setRulePageSize] = useState(10)
  const [serviceSearch, setServiceSearch] = useState('')
  const [serviceCategory, setServiceCategory] = useState('')
  const [serviceStatus, setServiceStatus] = useState('all')
  const [bundleSearch, setBundleSearch] = useState('')
  const [bundleStatus, setBundleStatus] = useState('all')
  const [growthRuleSearch, setGrowthRuleSearch] = useState('')
  const [growthRuleStatus, setGrowthRuleStatus] = useState('all')
  const [growthRuleSourceType, setGrowthRuleSourceType] = useState('all')
  const [growthRuleTargetType, setGrowthRuleTargetType] = useState('all')
  const [roleSearch, setRoleSearch] = useState('')
  const [roleStatus, setRoleStatus] = useState('all')
  const [ruleSearch, setRuleSearch] = useState('')
  const [ruleStatus, setRuleStatus] = useState('all')
  const [ruleSeverity, setRuleSeverity] = useState('all')

  const activeServices = useMemo(() => services.filter(item => item.isActive), [services])
  const categories = useMemo(() => [...new Set(services.map(item => item.category).filter(Boolean) as string[])].sort((a, b) => a.localeCompare(b)), [services])
  const tags = useMemo(() => [...new Set(services.flatMap(item => item.tags))].sort((a, b) => a.localeCompare(b)), [services])
  const filteredServices = useMemo(() => {
    const term = serviceSearch.trim().toLowerCase()
    return services.filter(item => {
      const matchesSearch = !term || [item.name, item.slug, item.category ?? '', item.tags.join(' ')].some(value => value.toLowerCase().includes(term))
      const matchesCategory = !serviceCategory || item.category === serviceCategory
      const matchesStatus = !serviceStatus || serviceStatus === 'all' || (serviceStatus === 'active' ? item.isActive : !item.isActive)
      return matchesSearch && matchesCategory && matchesStatus
    })
  }, [serviceCategory, serviceSearch, serviceStatus, services])
  const filteredBundles = useMemo(() => {
    const term = bundleSearch.trim().toLowerCase()
    return bundles.filter(item => {
      const matchesSearch = !term || [item.name, item.slug, item.description ?? '', item.serviceNames.join(' ')].some(value => value.toLowerCase().includes(term))
      const matchesStatus = !bundleStatus || bundleStatus === 'all' || (bundleStatus === 'active' ? item.isActive : !item.isActive)
      return matchesSearch && matchesStatus
    })
  }, [bundleSearch, bundleStatus, bundles])
  const filteredGrowthRules = useMemo(() => {
    const term = growthRuleSearch.trim().toLowerCase()
    return growthRules.filter(item => {
      const matchesSearch = !term || [
        item.sourceSelectorLabel,
        item.targetSelectorLabel,
        item.rationaleTemplate,
        item.sourceSelectorType,
        item.targetSelectorType,
        String(item.baseFitScore),
        String(item.priority),
      ].some(value => value.toLowerCase().includes(term))
      const matchesStatus = !growthRuleStatus || growthRuleStatus === 'all' || (growthRuleStatus === 'active' ? item.isActive : !item.isActive)
      const matchesSourceType = growthRuleSourceType === 'all' || item.sourceSelectorType === growthRuleSourceType
      const matchesTargetType = growthRuleTargetType === 'all' || item.targetSelectorType === growthRuleTargetType
      return matchesSearch && matchesStatus && matchesSourceType && matchesTargetType
    })
  }, [growthRuleSearch, growthRuleSourceType, growthRuleStatus, growthRuleTargetType, growthRules])
  const filteredRoles = useMemo(() => {
    const term = roleSearch.trim().toLowerCase()
    return roles.filter(item => {
      const matchesSearch = !term || [item.name, item.slug, item.description ?? '', String(item.inUseCount), String(item.gapRuleUsageCount)].some(value => value.toLowerCase().includes(term))
      const matchesStatus = roleStatus === 'all' || (roleStatus === 'active' ? item.isActive : !item.isActive)
      return matchesSearch && matchesStatus
    })
  }, [roleSearch, roleStatus, roles])
  const filteredGapRules = useMemo(() => {
    const term = ruleSearch.trim().toLowerCase()
    return gapRules.filter(item => {
      const condition = conditionSummary(item.conditionJson, roles)
      const matchesSearch = !term || [item.title, item.ruleKey, item.description, item.severity, condition].some(value => value.toLowerCase().includes(term))
      const matchesStatus = ruleStatus === 'all' || (ruleStatus === 'active' ? item.isActive : !item.isActive)
      const matchesSeverity = ruleSeverity === 'all' || item.severity === ruleSeverity
      return matchesSearch && matchesStatus && matchesSeverity
    })
  }, [gapRules, roles, ruleSearch, ruleSeverity, ruleStatus])
  const servicePages = Math.max(1, Math.ceil(filteredServices.length / servicePageSize))
  const serviceStartIndex = filteredServices.length ? (servicePage - 1) * servicePageSize : 0
  const serviceEndIndex = filteredServices.length ? Math.min(serviceStartIndex + servicePageSize, filteredServices.length) : 0
  const pagedServices = useMemo(() => filteredServices.slice(serviceStartIndex, serviceEndIndex), [filteredServices, serviceEndIndex, serviceStartIndex])
  const rolePages = Math.max(1, Math.ceil(filteredRoles.length / rolePageSize))
  const roleStartIndex = filteredRoles.length ? (rolePage - 1) * rolePageSize : 0
  const roleEndIndex = filteredRoles.length ? Math.min(roleStartIndex + rolePageSize, filteredRoles.length) : 0
  const pagedRoles = useMemo(() => filteredRoles.slice(roleStartIndex, roleEndIndex), [filteredRoles, roleEndIndex, roleStartIndex])
  const rulePages = Math.max(1, Math.ceil(filteredGapRules.length / rulePageSize))
  const ruleStartIndex = filteredGapRules.length ? (rulePage - 1) * rulePageSize : 0
  const ruleEndIndex = filteredGapRules.length ? Math.min(ruleStartIndex + rulePageSize, filteredGapRules.length) : 0
  const pagedRules = useMemo(() => filteredGapRules.slice(ruleStartIndex, ruleEndIndex), [filteredGapRules, ruleEndIndex, ruleStartIndex])
  const nextServiceDisplayOrder = useMemo(() => Math.max(0, ...services.map(item => item.displayOrder)) + 10, [services])
  const nextBundleDisplayOrder = useMemo(() => Math.max(0, ...bundles.map(item => item.displayOrder)) + 10, [bundles])
  const nextRoleDisplayOrder = useMemo(() => Math.max(0, ...roles.map(item => item.displayOrder)) + 10, [roles])
  const nextRuleDisplayOrder = useMemo(() => Math.max(0, ...gapRules.map(item => item.displayOrder)) + 10, [gapRules])
  const roleConditionOptions = useMemo(() => roles.map(item => ({ value: item.slug, label: item.name })), [roles])

  useEffect(() => {
    if (!token) return
    void loadAll()
  }, [token])

  useEffect(() => {
    setServicePage(current => Math.min(Math.max(1, servicePages), current))
  }, [servicePages])

  useEffect(() => {
    setRolePage(current => Math.min(Math.max(1, rolePages), current))
  }, [rolePages])

  useEffect(() => {
    setRulePage(current => Math.min(Math.max(1, rulePages), current))
  }, [rulePages])

  useEffect(() => {
    setServicePage(1)
  }, [serviceCategory, serviceSearch, serviceStatus])

  useEffect(() => {
    setRolePage(1)
  }, [roleSearch, roleStatus])

  useEffect(() => {
    setRulePage(1)
  }, [ruleSearch, ruleSeverity, ruleStatus])

  async function loadAll() {
    if (!token) return
    setLoading(true)
    setError('')
    try {
      const [servicePage, bundleItems, growthRuleItems, rolePage, gapPage] = await Promise.all([
        listAdminServiceCatalog(token),
        listServiceGrowthBundles(token),
        listServiceGrowthRules(token),
        listStakeholderRoles(token),
        listStakeholderGapRules(token),
      ])
      setServices(servicePage.items)
      setBundles(bundleItems)
      setGrowthRules(growthRuleItems)
      setRoles(rolePage.items)
      setGapRules(gapPage.items)
      setGrowthRuleForm(current => ({ ...current, sourceSelectorValue: current.sourceSelectorValue || servicePage.items[0]?.category || servicePage.items[0]?.id || '', targetSelectorValue: current.targetSelectorValue || servicePage.items[1]?.category || servicePage.items[1]?.id || '' }))
      return { roles: rolePage.items, gapRules: gapPage.items }
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
      const servicePayload = {
        slug: serviceForm.slug,
        name: serviceForm.name,
        description: serviceForm.description || null,
        tags: serviceForm.tags,
      }
      if (editingServiceId) {
        await updateServiceCatalogItem(token, editingServiceId, { ...servicePayload, category: serviceForm.category || null })
      } else {
        await createServiceCatalogItem(token, { ...servicePayload, category: serviceForm.category || undefined, displayOrder: nextServiceDisplayOrder })
      }
      setServiceForm(emptyService)
      setEditingServiceId(null)
      setServiceDialogOpen(false)
      toast.success(editingServiceId ? 'Service updated' : 'Service saved')
      await loadAll()
    })
  }

  async function submitRole(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('role', async () => {
      const payload = {
        slug: roleForm.slug,
        name: roleForm.name,
        description: roleForm.description || null,
        displayOrder: Number(roleForm.displayOrder || 0),
      }
      const savedRole = editingRoleId
        ? await updateStakeholderRole(token, editingRoleId, payload)
        : await createStakeholderRole(token, payload)
      const wasEditing = Boolean(editingRoleId)
      setRoleForm(emptyRole)
      setEditingRoleId(null)
      setRoleDialogOpen(false)
      toast.success(wasEditing ? 'Stakeholder role updated' : 'Stakeholder role saved')
      const loaded = await loadAll()
      if (loaded) setRolePage(pageForItem(loaded.roles, savedRole.id, rolePageSize))
    }, { display_order: 'displayOrder' })
  }

  async function submitRule(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('rule', async () => {
      const conditionJson = buildRuleCondition(ruleForm)
      const payload = {
        ruleKey: ruleForm.ruleKey,
        title: ruleForm.title,
        description: ruleForm.description,
        severity: ruleForm.severity,
        conditionJson,
        displayOrder: Number(ruleForm.displayOrder || 0),
      }
      const savedRule = editingRuleId
        ? await updateStakeholderGapRule(token, editingRuleId, payload)
        : await createStakeholderGapRule(token, payload)
      const wasEditing = Boolean(editingRuleId)
      setRuleForm(emptyRule)
      setEditingRuleId(null)
      setRuleDialogOpen(false)
      toast.success(wasEditing ? 'Gap rule updated' : 'Gap rule saved')
      const loaded = await loadAll()
      if (loaded) setRulePage(pageForItem(loaded.gapRules, savedRule.id, rulePageSize))
    }, { rule_key: 'ruleKey', condition_json: 'conditionJson', display_order: 'displayOrder' })
  }

  async function submitBundle(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('bundle', async () => {
      if (!bundleForm.serviceIds.length) throw fieldError('bundle.serviceIds', 'Select at least one service.')
      const payload = {
        slug: bundleForm.slug,
        name: bundleForm.name,
        description: bundleForm.description || null,
        serviceIds: bundleForm.serviceIds,
      }
      if (editingBundleId) {
        await updateServiceGrowthBundle(token, editingBundleId, payload)
      } else {
        await createServiceGrowthBundle(token, { ...payload, displayOrder: nextBundleDisplayOrder })
      }
      setBundleForm(emptyBundle)
      setEditingBundleId(null)
      setBundleDialogOpen(false)
      setBundleServiceSearch('')
      toast.success(editingBundleId ? 'Bundle updated' : 'Bundle saved')
      await loadAll()
    }, { service_ids: 'serviceIds' })
  }

  async function submitGrowthRule(event: FormEvent) {
    event.preventDefault()
    if (!token) return
    await saveWithErrors('growthRule', async () => {
      if (!growthRuleForm.sourceSelectorValue) throw fieldError('growthRule.sourceSelectorValue', 'Source selector is required.')
      if (!growthRuleForm.targetSelectorValue) throw fieldError('growthRule.targetSelectorValue', 'Target selector is required.')
      await createServiceGrowthRule(token, {
        sourceSelectorType: growthRuleForm.sourceSelectorType,
        sourceSelectorValue: growthRuleForm.sourceSelectorValue,
        targetSelectorType: growthRuleForm.targetSelectorType,
        targetSelectorValue: growthRuleForm.targetSelectorValue,
        baseFitScore: Number(growthRuleForm.baseFitScore || 0),
        priority: Number(growthRuleForm.priority || 0),
        rationaleTemplate: growthRuleForm.rationaleTemplate,
      })
      setGrowthRuleForm(emptyGrowthRule)
      setGrowthRuleDialogOpen(false)
      toast.success('Growth rule saved')
      await loadAll()
    }, { source_selector_type: 'sourceSelectorType', source_selector_value: 'sourceSelectorValue', target_selector_type: 'targetSelectorType', target_selector_value: 'targetSelectorValue', base_fit_score: 'baseFitScore', rationale_template: 'rationaleTemplate' })
  }

  async function toggleService(item: ServiceCatalogItem) {
    if (!token) return
    await saveToggle(async () => updateServiceCatalogItem(token, item.id, { isActive: !item.isActive }), 'Service status updated')
  }

  function startEditingService(item: ServiceCatalogItem) {
    setEditingServiceId(item.id)
    setServiceForm({
      slug: item.slug,
      name: item.name,
      category: item.category || '',
      description: item.description || '',
      tags: item.tags,
    })
    setServiceTagDraft('')
    setFieldErrors(current => removePrefix(current, 'service'))
    setServiceDialogOpen(true)
  }

  function startAddingService() {
    setEditingServiceId(null)
    setServiceForm(emptyService)
    setServiceTagDraft('')
    setFieldErrors(current => removePrefix(current, 'service'))
    setServiceDialogOpen(true)
  }

  function cancelEditingService() {
    if (saving) return
    setEditingServiceId(null)
    setServiceForm(emptyService)
    setServiceTagDraft('')
    setFieldErrors(current => removePrefix(current, 'service'))
    setServiceDialogOpen(false)
  }

  function addServiceTag() {
    const nextTags = splitList(serviceTagDraft)
    if (!nextTags.length) return
    setServiceForm(current => {
      const existing = new Set(current.tags.map(tag => tag.toLowerCase()))
      const additions = nextTags.filter(tag => !existing.has(tag.toLowerCase()))
      return additions.length ? { ...current, tags: [...current.tags, ...additions] } : current
    })
    setServiceTagDraft('')
    setFieldErrors(current => clearFieldError(current, 'service.tags'))
  }

  function removeServiceTag(tag: string) {
    setServiceForm(current => ({ ...current, tags: current.tags.filter(item => item !== tag) }))
    setFieldErrors(current => clearFieldError(current, 'service.tags'))
  }

  async function toggleRole(item: StakeholderRoleConfig) {
    if (!token) return
    await saveToggle(async () => updateStakeholderRole(token, item.id, { isActive: !item.isActive }), 'Stakeholder role status updated')
  }

  async function confirmDeleteRole() {
    if (!token || !deleteRoleTarget) return
    setDeletingRole(true)
    try {
      await deleteStakeholderRole(token, deleteRoleTarget.id)
      toast.success('Stakeholder role deleted')
      setDeleteRoleTarget(null)
      await loadAll()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Stakeholder role could not be deleted')
    } finally {
      setDeletingRole(false)
    }
  }

  function startAddingRole() {
    setEditingRoleId(null)
    setRoleForm({ ...emptyRole, displayOrder: String(nextRoleDisplayOrder) })
    setFieldErrors(current => removePrefix(current, 'role'))
    setRoleDialogOpen(true)
  }

  function startEditingRole(item: StakeholderRoleConfig) {
    setEditingRoleId(item.id)
    setRoleForm({
      slug: item.slug,
      name: item.name,
      description: item.description || '',
      displayOrder: String(item.displayOrder ?? 0),
    })
    setFieldErrors(current => removePrefix(current, 'role'))
    setRoleDialogOpen(true)
  }

  function cancelEditingRole() {
    if (saving) return
    setEditingRoleId(null)
    setRoleForm(emptyRole)
    setFieldErrors(current => removePrefix(current, 'role'))
    setRoleDialogOpen(false)
  }

  async function toggleRule(item: StakeholderGapRule) {
    if (!token) return
    await saveToggle(async () => updateStakeholderGapRule(token, item.id, { isActive: !item.isActive }), 'Gap rule status updated')
  }

  function startAddingRule() {
    setEditingRuleId(null)
    setRuleForm(defaultRuleForm(String(nextRuleDisplayOrder), roles))
    setFieldErrors(current => removePrefix(current, 'rule'))
    setRuleDialogOpen(true)
  }

  function startEditingRule(item: StakeholderGapRule) {
    setEditingRuleId(item.id)
    setRuleForm({
      ruleKey: item.ruleKey,
      title: item.title,
      description: item.description,
      severity: item.severity,
      ...ruleConditionToForm(item.conditionJson, roles),
      displayOrder: String(item.displayOrder ?? 0),
    })
    setFieldErrors(current => removePrefix(current, 'rule'))
    setRuleDialogOpen(true)
  }

  function cancelEditingRule() {
    if (saving) return
    setEditingRuleId(null)
    setRuleForm(emptyRule)
    setFieldErrors(current => removePrefix(current, 'rule'))
    setRuleDialogOpen(false)
  }

  async function toggleBundle(item: ServiceGrowthBundle) {
    if (!token) return
    await saveToggle(async () => updateServiceGrowthBundle(token, item.id, { isActive: !item.isActive }), 'Bundle status updated')
  }

  function startAddingBundle() {
    setEditingBundleId(null)
    setBundleForm(emptyBundle)
    setBundleServiceSearch('')
    setFieldErrors(current => removePrefix(current, 'bundle'))
    setBundleDialogOpen(true)
  }

  function startEditingBundle(item: ServiceGrowthBundle) {
    setEditingBundleId(item.id)
    setBundleForm({
      slug: item.slug,
      name: item.name,
      description: item.description || '',
      displayOrder: String(item.displayOrder ?? 0),
      serviceIds: item.serviceIds,
    })
    setBundleServiceSearch('')
    setFieldErrors(current => removePrefix(current, 'bundle'))
    setBundleDialogOpen(true)
  }

  function cancelEditingBundle() {
    if (saving) return
    setEditingBundleId(null)
    setBundleForm(emptyBundle)
    setBundleServiceSearch('')
    setFieldErrors(current => removePrefix(current, 'bundle'))
    setBundleDialogOpen(false)
  }

  function toggleBundleService(serviceId: string) {
    setBundleForm(current => ({
      ...current,
      serviceIds: current.serviceIds.includes(serviceId)
        ? current.serviceIds.filter(id => id !== serviceId)
        : [...current.serviceIds, serviceId],
    }))
    setFieldErrors(current => clearFieldError(current, 'bundle.serviceIds'))
  }

  function removeBundleService(serviceId: string) {
    setBundleForm(current => ({ ...current, serviceIds: current.serviceIds.filter(id => id !== serviceId) }))
    setFieldErrors(current => clearFieldError(current, 'bundle.serviceIds'))
  }

  function startAddingGrowthRule() {
    setGrowthRuleForm(emptyGrowthRule)
    setFieldErrors(current => removePrefix(current, 'growthRule'))
    setGrowthRuleDialogOpen(true)
  }

  function cancelAddingGrowthRule() {
    if (saving) return
    setGrowthRuleForm(emptyGrowthRule)
    setFieldErrors(current => removePrefix(current, 'growthRule'))
    setGrowthRuleDialogOpen(false)
  }

  async function toggleGrowthRule(item: ServiceGrowthRule) {
    if (!token) return
    await saveToggle(async () => updateServiceGrowthRule(token, item.id, {
      sourceSelectorType: item.sourceSelectorType,
      sourceSelectorValue: item.sourceSelectorValue,
      targetSelectorType: item.targetSelectorType,
      targetSelectorValue: item.targetSelectorValue,
      baseFitScore: item.baseFitScore,
      priority: item.priority,
      rationaleTemplate: item.rationaleTemplate,
      isActive: !item.isActive,
    }), 'Growth rule status updated')
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
      <Dialog.Root open={serviceDialogOpen} onOpenChange={open => { if (!open) cancelEditingService() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-surface-border bg-white shadow-panel">
            <form onSubmit={submitService}>
              <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
                <div>
                  <Dialog.Title className="font-display text-2xl font-bold text-ink">{editingServiceId ? 'Edit service' : 'Add service'}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-ink-secondary">Service catalog item</Dialog.Description>
                </div>
                <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close service dialog" disabled={saving}>
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
              <div className="grid max-h-[calc(92vh-170px)] gap-4 overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput label="Name" placeholder="Product Engineering" value={serviceForm.name} error={fieldErrors['service.name']} onChange={value => updateService('name', value)} />
                  <TextInput label="Slug" placeholder="product_engineering" value={serviceForm.slug} error={fieldErrors['service.slug']} onChange={value => updateService('slug', value)} />
                </div>
                <TextInput label="Category" placeholder="Engineering" value={serviceForm.category} error={fieldErrors['service.category']} onChange={value => updateService('category', value)} />
                <TagEditor
                  tags={serviceForm.tags}
                  draft={serviceTagDraft}
                  error={fieldErrors['service.tags']}
                  onDraftChange={setServiceTagDraft}
                  onAdd={addServiceTag}
                  onRemove={removeServiceTag}
                />
                <TextArea label="Description" placeholder="Summarize the work this service covers, when it applies, and any useful delivery context." value={serviceForm.description} error={fieldErrors['service.description']} onChange={value => updateService('description', value)} monospace={false} rows={4} />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-surface-border bg-surface-tertiary p-4 sm:flex-row sm:justify-end">
                <button type="button" className="tk-button-secondary justify-center sm:w-auto" onClick={cancelEditingService} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="tk-button-primary justify-center sm:w-auto" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editingServiceId ? 'Save service' : 'Add service'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={bundleDialogOpen} onOpenChange={open => { if (!open) cancelEditingBundle() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-surface-border bg-white shadow-panel">
            <form onSubmit={submitBundle}>
              <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
                <div>
                  <Dialog.Title className="font-display text-2xl font-bold text-ink">{editingBundleId ? 'Edit bundle' : 'Add bundle'}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-ink-secondary">Reusable group for service growth rules</Dialog.Description>
                </div>
                <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close bundle dialog" disabled={saving}>
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
              <div className="grid max-h-[calc(92vh-170px)] gap-4 overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput label="Name" placeholder="Engineering Growth" value={bundleForm.name} error={fieldErrors['bundle.name']} onChange={value => updateBundle('name', value)} />
                  <TextInput label="Slug" placeholder="engineering_growth" value={bundleForm.slug} error={fieldErrors['bundle.slug']} onChange={value => updateBundle('slug', value)} />
                </div>
                <TextArea label="Description" placeholder="Describe when this bundle should be used and what services it groups together." value={bundleForm.description} error={fieldErrors['bundle.description']} onChange={value => updateBundle('description', value)} monospace={false} rows={4} />
                <BundleServiceSelector
                  services={activeServices}
                  selectedIds={bundleForm.serviceIds}
                  search={bundleServiceSearch}
                  error={fieldErrors['bundle.serviceIds']}
                  onSearchChange={setBundleServiceSearch}
                  onToggle={toggleBundleService}
                  onRemove={removeBundleService}
                />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-surface-border bg-surface-tertiary p-4 sm:flex-row sm:justify-end">
                <button type="button" className="tk-button-secondary justify-center sm:w-auto" onClick={cancelEditingBundle} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="tk-button-primary justify-center sm:w-auto" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editingBundleId ? 'Save bundle' : 'Add bundle'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={growthRuleDialogOpen} onOpenChange={open => { if (!open) cancelAddingGrowthRule() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(760px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-surface-border bg-white shadow-panel">
            <form onSubmit={submitGrowthRule}>
              <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
                <div>
                  <Dialog.Title className="font-display text-2xl font-bold text-ink">Add recommendation rule</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-ink-secondary">Service growth source and target</Dialog.Description>
                </div>
                <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close growth rule dialog" disabled={saving}>
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
              <div className="grid max-h-[calc(92vh-170px)] gap-4 overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <SelectInput label="Source type" value={growthRuleForm.sourceSelectorType} options={selectorTypeOptions} onChange={value => updateGrowthRule('sourceSelectorType', value as ServiceGrowthSelectorType)} />
                  <SelectInput label="Source" value={growthRuleForm.sourceSelectorValue} error={fieldErrors['growthRule.sourceSelectorValue']} options={selectorOptions(growthRuleForm.sourceSelectorType, activeServices, categories, tags, bundles)} onChange={value => updateGrowthRule('sourceSelectorValue', value)} />
                  <SelectInput label="Target type" value={growthRuleForm.targetSelectorType} options={selectorTypeOptions} onChange={value => updateGrowthRule('targetSelectorType', value as ServiceGrowthSelectorType)} />
                  <SelectInput label="Target" value={growthRuleForm.targetSelectorValue} error={fieldErrors['growthRule.targetSelectorValue']} options={selectorOptions(growthRuleForm.targetSelectorType, activeServices, categories, tags, bundles)} onChange={value => updateGrowthRule('targetSelectorValue', value)} />
                  <TextInput label="Base fit (%)" type="number" min={0} max={100} placeholder="75" value={growthRuleForm.baseFitScore} error={fieldErrors['growthRule.baseFitScore']} onChange={value => updateGrowthRule('baseFitScore', value)} />
                  <TextInput label="Priority" type="number" min={0} max={10000} placeholder="10" value={growthRuleForm.priority} error={fieldErrors['growthRule.priority']} onChange={value => updateGrowthRule('priority', value)} />
                </div>
                <TextArea label="Rationale" placeholder="{source_service} creates a path into {target_service} for {account_name}." value={growthRuleForm.rationaleTemplate} error={fieldErrors['growthRule.rationaleTemplate']} onChange={value => updateGrowthRule('rationaleTemplate', value)} monospace={false} rows={4} />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-surface-border bg-surface-tertiary p-4 sm:flex-row sm:justify-end">
                <button type="button" className="tk-button-secondary justify-center sm:w-auto" onClick={cancelAddingGrowthRule} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="tk-button-primary justify-center sm:w-auto" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  Add rule
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={roleDialogOpen} onOpenChange={open => { if (!open) cancelEditingRole() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(640px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-surface-border bg-white shadow-panel">
            <form onSubmit={submitRole}>
              <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
                <div>
                  <Dialog.Title className="font-display text-2xl font-bold text-ink">{editingRoleId ? 'Edit stakeholder role' : 'Add stakeholder role'}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-ink-secondary">Role taxonomy used by stakeholder records and coverage rules</Dialog.Description>
                </div>
                <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close stakeholder role dialog" disabled={saving}>
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
              <div className="grid max-h-[calc(92vh-170px)] gap-4 overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput label="Name" placeholder="Executive Sponsor" value={roleForm.name} error={fieldErrors['role.name']} onChange={value => updateRole('name', value)} />
                  <TextInput label="Slug" placeholder="executive_sponsor" value={roleForm.slug} error={fieldErrors['role.slug']} onChange={value => updateRole('slug', value)} />
                </div>
                <TextInput label="Order" type="number" placeholder="10" value={roleForm.displayOrder} error={fieldErrors['role.displayOrder']} onChange={value => updateRole('displayOrder', value)} />
                <TextArea label="Description" placeholder="Describe when this stakeholder role should be used." value={roleForm.description} error={fieldErrors['role.description']} onChange={value => updateRole('description', value)} monospace={false} rows={3} />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-surface-border bg-surface-tertiary p-4 sm:flex-row sm:justify-end">
                <button type="button" className="tk-button-secondary justify-center sm:w-auto" onClick={cancelEditingRole} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="tk-button-primary justify-center sm:w-auto" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editingRoleId ? 'Save role' : 'Add role'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root open={ruleDialogOpen} onOpenChange={open => { if (!open) cancelEditingRule() }}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-surface-border bg-white shadow-panel">
            <form onSubmit={submitRule}>
              <div className="flex items-start justify-between gap-4 border-b border-surface-border p-5">
                <div>
                  <Dialog.Title className="font-display text-2xl font-bold text-ink">{editingRuleId ? 'Edit gap rule' : 'Add gap rule'}</Dialog.Title>
                  <Dialog.Description className="mt-1 text-sm text-ink-secondary">Deterministic stakeholder coverage condition</Dialog.Description>
                </div>
                <Dialog.Close className="tk-icon-button shrink-0" aria-label="Close gap rule dialog" disabled={saving}>
                  <X className="h-5 w-5" />
                </Dialog.Close>
              </div>
              <div className="grid max-h-[calc(92vh-170px)] gap-4 overflow-y-auto p-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <TextInput label="Title" placeholder="Missing executive sponsor" value={ruleForm.title} error={fieldErrors['rule.title']} onChange={value => updateRule('title', value)} />
                  <TextInput label="Rule key" placeholder="missing_executive_sponsor" value={ruleForm.ruleKey} error={fieldErrors['rule.ruleKey']} onChange={value => updateRule('ruleKey', value)} />
                  <SelectInput label="Severity" value={ruleForm.severity} error={fieldErrors['rule.severity']} options={[{ value: 'info', label: 'Info' }, { value: 'warning', label: 'Warning' }, { value: 'critical', label: 'Critical' }]} onChange={value => updateRule('severity', value)} />
                  <TextInput label="Order" type="number" placeholder="10" value={ruleForm.displayOrder} error={fieldErrors['rule.displayOrder']} onChange={value => updateRule('displayOrder', value)} />
                </div>
                <TextArea label="Description" placeholder="Explain the coverage risk this rule flags." value={ruleForm.description} error={fieldErrors['rule.description']} onChange={value => updateRule('description', value)} monospace={false} rows={3} />
                <RuleConditionBuilder
                  form={ruleForm}
                  roleOptions={roleConditionOptions}
                  errors={fieldErrors}
                  onFieldChange={updateRule}
                  onToggleMulti={toggleRuleConditionValue}
                />
              </div>
              <div className="flex flex-col-reverse gap-2 border-t border-surface-border bg-surface-tertiary p-4 sm:flex-row sm:justify-end">
                <button type="button" className="tk-button-secondary justify-center sm:w-auto" onClick={cancelEditingRule} disabled={saving}>
                  Cancel
                </button>
                <button type="submit" className="tk-button-primary justify-center sm:w-auto" disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {editingRuleId ? 'Save rule' : 'Add rule'}
                </button>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <ConfigCard icon={BriefcaseBusiness} eyebrow="Service catalog" title="Services">
        <div className="grid gap-3 border-b border-surface-border p-4 lg:grid-cols-[minmax(220px,1fr)_minmax(180px,0.7fr)_minmax(180px,0.7fr)_auto] lg:items-end">
          <TextInput label="Search services" value={serviceSearch} onChange={setServiceSearch} />
          <SelectInput label="Category filter" value={serviceCategory} options={categories.map(item => ({ value: item, label: item }))} onChange={setServiceCategory} />
          <SelectInput label="Status filter" value={serviceStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]} onChange={setServiceStatus} />
          <button type="button" className="tk-button-primary h-11 justify-center lg:w-auto" onClick={startAddingService}>
            <Plus className="h-4 w-4" />
            Add service
          </button>
        </div>
        <div className="divide-y divide-surface-border">
          <div className="hidden bg-surface-secondary px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink-secondary xl:grid xl:grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.7fr)_minmax(180px,1fr)_80px_96px_96px] xl:gap-4">
            <span>Service</span>
            <span>Category</span>
            <span>Tags</span>
            <span>Usage</span>
            <span>Status</span>
            <span>Actions</span>
          </div>
          {pagedServices.map(item => (
            <div key={item.id} className="grid gap-3 px-4 py-3 xl:grid-cols-[minmax(180px,1.2fr)_minmax(120px,0.7fr)_minmax(180px,1fr)_80px_96px_96px] xl:items-center xl:gap-4">
              <span className="min-w-0">
                <span className="block font-semibold text-ink">{item.name}</span>
                <span className="block break-words text-xs text-ink-secondary">{item.slug}</span>
              </span>
              <MetaField label="Category">{item.category || 'Uncategorized'}</MetaField>
              <MetaField label="Tags">{item.tags.join(', ') || 'None'}</MetaField>
              <MetaField label="Usage">{item.inUseCount}</MetaField>
              <span className="flex xl:justify-start">
                <StatusButton active={item.isActive} onClick={() => toggleService(item)} ariaLabel={`${item.isActive ? 'Disable' : 'Enable'} ${item.name}`} />
              </span>
              <span className="flex xl:justify-start">
                <button type="button" className="tk-button-secondary h-9 px-3 text-xs" onClick={() => startEditingService(item)} aria-label={`Edit ${item.name}`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              </span>
            </div>
          ))}
          {!services.length ? <EmptyState icon={BriefcaseBusiness} heading="No services configured" body="Add the first service catalog item." className="py-8" /> : null}
          {services.length && !filteredServices.length ? <EmptyState icon={BriefcaseBusiness} heading="No matching services" body="Adjust the search or filters." className="py-8" /> : null}
        </div>
        {filteredServices.length ? (
          <ListPagination
            label="services"
            page={servicePage}
            pages={servicePages}
            pageSize={servicePageSize}
            pageSizeLabel="Services per page"
            pageSizeOptions={servicePageSizeOptions}
            start={serviceStartIndex + 1}
            end={serviceEndIndex}
            total={filteredServices.length}
            onPageSizeChange={value => {
              setServicePageSize(value)
              setServicePage(1)
            }}
            onPrevious={() => setServicePage(current => Math.max(1, current - 1))}
            onNext={() => setServicePage(current => Math.min(servicePages, current + 1))}
          />
        ) : null}
      </ConfigCard>

      <ConfigCard icon={Package} eyebrow="Service growth" title="Service bundles">
        <div className="flex flex-col gap-3 border-b border-surface-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-secondary">{filteredBundles.length} of {bundles.length} configured {bundles.length === 1 ? 'bundle' : 'bundles'}</p>
          <button type="button" className="tk-button-primary justify-center sm:w-auto" onClick={startAddingBundle}>
            <Plus className="h-4 w-4" />
            Add bundle
          </button>
        </div>
        <div className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 md:grid-cols-[minmax(220px,1fr)_minmax(180px,0.45fr)]">
          <TextInput label="Search bundles" value={bundleSearch} onChange={setBundleSearch} placeholder="Bundle, slug, service" />
          <SelectInput label="Bundle status" value={bundleStatus} options={statusFilterOptions} onChange={setBundleStatus} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3 p-4">
          {filteredBundles.map(item => (
            <div key={item.id} className="rounded-lg border border-surface-border p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{item.name}</span>
                  <span className="block break-words text-xs text-ink-secondary">{item.slug} · {item.serviceIds.length} {item.serviceIds.length === 1 ? 'service' : 'services'}</span>
                </span>
                <StatusButton active={item.isActive} onClick={() => toggleBundle(item)} ariaLabel={`${item.isActive ? 'Disable' : 'Enable'} ${item.name}`} />
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">{item.description || 'No description.'}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {item.serviceNames.map(name => <Badge key={name} label={name} />)}
              </div>
              <div className="mt-4 flex justify-end">
                <button type="button" className="tk-button-secondary h-9 px-3 text-xs" onClick={() => startEditingBundle(item)} aria-label={`Edit ${item.name}`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
              </div>
            </div>
          ))}
          {!bundles.length ? <EmptyState icon={Package} heading="No bundles configured" body="Create bundles to reuse service groups in growth rules." className="py-8" /> : null}
          {bundles.length && !filteredBundles.length ? <EmptyState icon={Package} heading="No matching bundles" body="Adjust the search or filters." className="py-8" /> : null}
        </div>
      </ConfigCard>

      <ConfigCard icon={ArrowRight} eyebrow="Growth engine" title="Growth recommendation rules">
        <div className="flex flex-col gap-3 border-b border-surface-border p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-ink-secondary">{filteredGrowthRules.length} of {growthRules.length} configured {growthRules.length === 1 ? 'rule' : 'rules'}</p>
          <button type="button" className="tk-button-primary justify-center sm:w-auto" onClick={startAddingGrowthRule}>
            <Plus className="h-4 w-4" />
            Add rule
          </button>
        </div>
        <div className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 lg:grid-cols-[minmax(220px,1fr)_minmax(160px,0.5fr)_minmax(160px,0.5fr)_minmax(160px,0.5fr)]">
          <TextInput label="Search rules" value={growthRuleSearch} onChange={setGrowthRuleSearch} placeholder="Source, target, rationale" />
          <SelectInput label="Rule status" value={growthRuleStatus} options={statusFilterOptions} onChange={setGrowthRuleStatus} />
          <SelectInput label="Source type filter" value={growthRuleSourceType} options={selectorTypeFilterOptions} onChange={setGrowthRuleSourceType} />
          <SelectInput label="Target type filter" value={growthRuleTargetType} options={selectorTypeFilterOptions} onChange={setGrowthRuleTargetType} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3 p-4">
          {filteredGrowthRules.map(item => (
            <div key={item.id} className="rounded-lg border border-surface-border p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    <span>{item.sourceSelectorLabel}</span>
                    <ArrowRight className="h-4 w-4 text-brand-blue" />
                    <span>{item.targetSelectorLabel}</span>
                  </div>
                  <p className="mt-2 text-sm leading-6 text-ink-secondary">{item.rationaleTemplate}</p>
                </div>
                <StatusButton active={item.isActive} onClick={() => toggleGrowthRule(item)} />
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Badge label={`Base fit ${item.baseFitScore}`} />
                <Badge label={`Priority ${item.priority}`} />
              </div>
            </div>
          ))}
          {!growthRules.length ? <EmptyState icon={ArrowRight} heading="No growth rules configured" body="Create a category, tag, bundle, or service rule to generate account recommendations." className="py-8" /> : null}
          {growthRules.length && !filteredGrowthRules.length ? <EmptyState icon={ArrowRight} heading="No matching rules" body="Adjust the search or filters." className="py-8" /> : null}
        </div>
      </ConfigCard>

      <ConfigCard icon={Users} eyebrow="Stakeholder coverage" title="Roles and gap rules">
        <div className="flex flex-col gap-3 border-b border-surface-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Stakeholder roles</h3>
            <p className="mt-1 text-sm text-ink-secondary">{filteredRoles.length} of {roles.length} configured {roles.length === 1 ? 'role' : 'roles'}</p>
          </div>
          <button type="button" className="tk-button-primary justify-center lg:w-auto" onClick={startAddingRole}>
            <Plus className="h-4 w-4" />
            Add role
          </button>
        </div>
        <div className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 md:grid-cols-[minmax(220px,1fr)_minmax(180px,0.45fr)]">
          <TextInput label="Search roles" value={roleSearch} onChange={setRoleSearch} placeholder="Role, slug, description" />
          <SelectInput label="Role status" value={roleStatus} options={statusFilterOptions} onChange={setRoleStatus} />
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3 p-4">
          {pagedRoles.map(item => (
            <div key={item.id} className="rounded-lg border border-surface-border p-3">
              <div className="flex items-start justify-between gap-3">
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{item.name}</span>
                  <span className="block break-words text-xs text-ink-secondary">{item.slug} · {item.inUseCount} linked · {item.gapRuleUsageCount} rules · order {item.displayOrder}</span>
                </span>
                <StatusButton active={item.isActive} onClick={() => toggleRole(item)} ariaLabel={`${item.isActive ? 'Disable' : 'Enable'} ${item.name}`} />
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">{item.description || 'No description.'}</p>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button type="button" className="tk-button-secondary h-9 px-3 text-xs" onClick={() => startEditingRole(item)} aria-label={`Edit ${item.name}`}>
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  type="button"
                  className="tk-button-secondary h-9 px-3 text-xs text-rag-red disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => setDeleteRoleTarget(item)}
                  disabled={item.inUseCount > 0 || item.gapRuleUsageCount > 0}
                  aria-label={`Delete ${item.name}`}
                  title={item.inUseCount > 0 || item.gapRuleUsageCount > 0 ? 'Deactivate this role or remove stakeholder and gap-rule references before deleting.' : `Delete ${item.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </div>
            </div>
          ))}
          {!roles.length ? <EmptyState icon={Users} heading="No stakeholder roles configured" body="Create roles before building stakeholder coverage rules." className="py-8" /> : null}
          {roles.length && !filteredRoles.length ? <EmptyState icon={Users} heading="No matching stakeholder roles" body="Adjust the search or status filter." className="py-8" /> : null}
        </div>
        {filteredRoles.length ? (
          <ListPagination
            label="roles"
            page={rolePage}
            pages={rolePages}
            pageSize={rolePageSize}
            pageSizeLabel="Roles per page"
            pageSizeOptions={rolePageSizeOptions}
            start={roleStartIndex + 1}
            end={roleEndIndex}
            total={filteredRoles.length}
            onPageSizeChange={value => {
              setRolePageSize(value)
              setRolePage(1)
            }}
            onPrevious={() => setRolePage(current => Math.max(1, current - 1))}
            onNext={() => setRolePage(current => Math.min(rolePages, current + 1))}
          />
        ) : null}
        <div className="flex flex-col gap-3 border-t border-surface-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-ink">Coverage gap rules</h3>
            <p className="mt-1 text-sm text-ink-secondary">{filteredGapRules.length} of {gapRules.length} configured {gapRules.length === 1 ? 'rule' : 'rules'}</p>
          </div>
          <button type="button" className="tk-button-primary justify-center lg:w-auto" onClick={startAddingRule}>
            <Plus className="h-4 w-4" />
            Add gap rule
          </button>
        </div>
        <div className="grid gap-3 border-b border-surface-border bg-surface-tertiary p-4 lg:grid-cols-[minmax(220px,1fr)_minmax(160px,0.45fr)_minmax(160px,0.45fr)]">
          <TextInput label="Search gap rules" value={ruleSearch} onChange={setRuleSearch} placeholder="Rule, key, description" />
          <SelectInput label="Rule status" value={ruleStatus} options={statusFilterOptions} onChange={setRuleStatus} />
          <SelectInput label="Severity" value={ruleSeverity} options={severityFilterOptions} onChange={setRuleSeverity} />
        </div>
        <div className="grid gap-3 p-4">
          {pagedRules.map(item => (
            <div key={item.id} className="rounded-lg border border-surface-border p-3">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{item.title}</span>
                  <span className="block break-words text-xs text-ink-secondary">{item.ruleKey} · order {item.displayOrder}</span>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge label={item.severity} />
                  <StatusButton active={item.isActive} onClick={() => toggleRule(item)} ariaLabel={`${item.isActive ? 'Disable' : 'Enable'} ${item.title}`} />
                  <button type="button" className="tk-button-secondary h-9 px-3 text-xs" onClick={() => startEditingRule(item)} aria-label={`Edit ${item.title}`}>
                    <Pencil className="h-4 w-4" />
                    Edit
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-ink-secondary">{item.description}</p>
              <p className="mt-3 rounded-lg bg-surface-secondary p-3 text-xs font-medium leading-5 text-ink-secondary">{conditionSummary(item.conditionJson, roles)}</p>
            </div>
          ))}
          {!gapRules.length ? <EmptyState icon={Users} heading="No gap rules configured" body="Create rules to flag missing or risky stakeholder coverage." className="py-8" /> : null}
          {gapRules.length && !filteredGapRules.length ? <EmptyState icon={Users} heading="No matching gap rules" body="Adjust the search, status, or severity filter." className="py-8" /> : null}
        </div>
        {filteredGapRules.length ? (
          <ListPagination
            label="rules"
            page={rulePage}
            pages={rulePages}
            pageSize={rulePageSize}
            pageSizeLabel="Rules per page"
            pageSizeOptions={rulePageSizeOptions}
            start={ruleStartIndex + 1}
            end={ruleEndIndex}
            total={filteredGapRules.length}
            onPageSizeChange={value => {
              setRulePageSize(value)
              setRulePage(1)
            }}
            onPrevious={() => setRulePage(current => Math.max(1, current - 1))}
            onNext={() => setRulePage(current => Math.min(rulePages, current + 1))}
          />
        ) : null}
      </ConfigCard>

      <ConfirmDialog
        open={Boolean(deleteRoleTarget)}
        title="Delete stakeholder role?"
        description={`Delete ${deleteRoleTarget?.name ?? 'this role'}? This is only available for roles with no stakeholder or gap-rule references.`}
        confirmLabel="Delete role"
        busyLabel="Deleting"
        isBusy={deletingRole}
        onOpenChange={value => {
          if (!deletingRole && !value) setDeleteRoleTarget(null)
        }}
        onConfirm={() => void confirmDeleteRole()}
      />
    </div>
  )

  function updateService(field: Exclude<keyof typeof serviceForm, 'tags'>, value: string) {
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

  function toggleRuleConditionValue(field: 'roles' | 'influences', value: string) {
    setRuleForm(current => {
      const currentValues = current[field]
      const nextValues = currentValues.includes(value)
        ? currentValues.filter(item => item !== value)
        : [...currentValues, value]
      return { ...current, [field]: nextValues }
    })
    setFieldErrors(current => clearFieldError(current, `rule.${field}`))
  }

  function updateBundle(field: keyof typeof bundleForm, value: string) {
    setBundleForm(current => ({ ...current, [field]: value }))
    setFieldErrors(current => clearFieldError(current, `bundle.${field}`))
  }

  function updateGrowthRule(field: keyof typeof growthRuleForm, value: string | ServiceGrowthSelectorType) {
    setGrowthRuleForm(current => {
      if (field === 'sourceSelectorType') return { ...current, sourceSelectorType: value as ServiceGrowthSelectorType, sourceSelectorValue: '' }
      if (field === 'targetSelectorType') return { ...current, targetSelectorType: value as ServiceGrowthSelectorType, targetSelectorValue: '' }
      return { ...current, [field]: value }
    })
    setFieldErrors(current => clearFieldError(current, `growthRule.${field}`))
  }

}

const selectorTypeOptions: { value: ServiceGrowthSelectorType; label: string }[] = [
  { value: 'category', label: 'Category' },
  { value: 'tag', label: 'Tag' },
  { value: 'bundle', label: 'Bundle' },
  { value: 'service', label: 'Service' },
]
const statusFilterOptions = [{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }]
const selectorTypeFilterOptions = [{ value: 'all', label: 'All types' }, ...selectorTypeOptions]
const severityFilterOptions = [
  { value: 'all', label: 'All severities' },
  { value: 'info', label: 'Info' },
  { value: 'warning', label: 'Warning' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
]
const conditionTypeOptions: { value: StakeholderGapConditionType; label: string }[] = [
  { value: 'missing_role', label: 'Missing role' },
  { value: 'missing_any_role', label: 'Missing any role' },
  { value: 'max_active_stakeholders', label: 'Maximum active stakeholders' },
  { value: 'missing_any_influence', label: 'Missing influence level' },
  { value: 'political_risk_present', label: 'Political risk present' },
  { value: 'stale_interaction', label: 'Stale interaction' },
]
const influenceOptions = ['low', 'medium', 'high', 'critical'].map(value => ({ value, label: titleize(value) }))
const politicalRiskOptions = ['unknown', 'low', 'medium', 'high'].map(value => ({ value, label: titleize(value) }))

function selectorOptions(type: ServiceGrowthSelectorType, services: ServiceCatalogItem[], categories: string[], tags: string[], bundles: ServiceGrowthBundle[]) {
  if (type === 'service') return services.map(item => ({ value: item.id, label: item.name }))
  if (type === 'category') return categories.map(item => ({ value: item, label: item }))
  if (type === 'tag') return tags.map(item => ({ value: item, label: item }))
  return bundles.filter(item => item.isActive).map(item => ({ value: item.id, label: item.name }))
}

function RuleConditionBuilder({
  form,
  roleOptions,
  errors,
  onFieldChange,
  onToggleMulti,
}: {
  form: typeof emptyRule
  roleOptions: { value: string; label: string }[]
  errors: FieldErrors
  onFieldChange: (field: keyof typeof emptyRule, value: string) => void
  onToggleMulti: (field: 'roles' | 'influences', value: string) => void
}) {
  const selectedType = conditionTypeOptions.some(option => option.value === form.conditionType) ? form.conditionType : 'missing_role'

  return (
    <section className="grid gap-4 rounded-lg border border-surface-border bg-surface-secondary p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectInput
          label="Condition"
          value={selectedType}
          error={errors['rule.conditionType']}
          options={conditionTypeOptions}
          onChange={value => onFieldChange('conditionType', value as StakeholderGapConditionType)}
        />
        {selectedType === 'missing_role' ? (
          <SelectInput label="Required role" value={form.role} error={errors['rule.role']} options={roleOptions} onChange={value => onFieldChange('role', value)} />
        ) : null}
        {selectedType === 'max_active_stakeholders' ? (
          <TextInput label="Maximum active stakeholders" type="number" min={0} placeholder="1" value={form.count} error={errors['rule.count']} onChange={value => onFieldChange('count', value)} />
        ) : null}
        {selectedType === 'political_risk_present' ? (
          <SelectInput label="Risk level" value={form.risk} error={errors['rule.risk']} options={politicalRiskOptions} onChange={value => onFieldChange('risk', value)} />
        ) : null}
        {selectedType === 'stale_interaction' ? (
          <TextInput label="Days without interaction" type="number" min={1} placeholder="90" value={form.days} error={errors['rule.days']} onChange={value => onFieldChange('days', value)} />
        ) : null}
      </div>
      {selectedType === 'missing_any_role' ? (
        <MultiOptionPicker
          legend="Required roles"
          values={form.roles}
          options={roleOptions}
          error={errors['rule.roles']}
          emptyText="Create stakeholder roles before configuring role coverage."
          onToggle={value => onToggleMulti('roles', value)}
        />
      ) : null}
      {selectedType === 'missing_any_influence' ? (
        <MultiOptionPicker
          legend="Required influence levels"
          values={form.influences}
          options={influenceOptions}
          error={errors['rule.influences']}
          onToggle={value => onToggleMulti('influences', value)}
        />
      ) : null}
      <p className="rounded-lg bg-white p-3 text-xs font-medium leading-5 text-ink-secondary">
        {conditionSummary(buildRuleConditionPreview(form), roleOptions)}
      </p>
    </section>
  )
}

function MultiOptionPicker({
  legend,
  values,
  options,
  error,
  emptyText = 'No options available.',
  onToggle,
}: {
  legend: string
  values: string[]
  options: { value: string; label: string }[]
  error?: string
  emptyText?: string
  onToggle: (value: string) => void
}) {
  return (
    <fieldset className="grid gap-2">
      <legend className="tk-label text-xs">{legend}</legend>
      {options.length ? (
        <div className="grid max-h-44 gap-2 overflow-y-auto rounded-lg border border-surface-border bg-white p-2 sm:grid-cols-2">
          {options.map(option => (
            <label key={option.value} className="flex min-h-[36px] cursor-pointer items-center gap-2 rounded-md px-2 text-sm font-medium text-ink hover:bg-surface-secondary">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand-blue"
                checked={values.includes(option.value)}
                onChange={() => onToggle(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      ) : (
        <p className="rounded-lg border border-surface-border bg-white p-3 text-sm text-ink-secondary">{emptyText}</p>
      )}
      <FieldError id={`${legend.toLowerCase().replace(/\s+/g, '-')}-error`} message={error} />
    </fieldset>
  )
}

function BundleServiceSelector({
  services,
  selectedIds,
  search,
  error,
  onSearchChange,
  onToggle,
  onRemove,
}: {
  services: ServiceCatalogItem[]
  selectedIds: string[]
  search: string
  error?: string
  onSearchChange: (value: string) => void
  onToggle: (serviceId: string) => void
  onRemove: (serviceId: string) => void
}) {
  const selectedServices = selectedIds.map(serviceId => services.find(service => service.id === serviceId)).filter(Boolean) as ServiceCatalogItem[]
  const term = search.trim().toLowerCase()
  const filteredServices = services.filter(service => {
    if (!term) return true
    return [service.name, service.slug, service.category ?? '', service.tags.join(' ')]
      .some(value => value.toLowerCase().includes(term))
  })

  return (
    <fieldset className="grid min-w-0 gap-3">
      <legend className="tk-label text-xs">Services in bundle</legend>
      <input
        className="tk-input"
        value={search}
        placeholder="Search by service, slug, category, or tag"
        aria-label="Search services for bundle"
        aria-invalid={Boolean(error)}
        aria-describedby={error ? 'bundle-service-ids-error' : undefined}
        onChange={event => onSearchChange(event.target.value)}
      />
      {selectedServices.length ? (
        <div className="flex flex-wrap gap-2">
          {selectedServices.map(service => (
            <span key={service.id} className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-blue-tint-20 px-3 text-xs font-semibold text-brand-blue">
              {service.name}
              <button type="button" className="rounded-full p-0.5 text-brand-blue hover:bg-brand-blue/10" onClick={() => onRemove(service.id)} aria-label={`Remove ${service.name}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="max-h-56 overflow-y-auto rounded-lg border border-surface-border bg-white">
        {filteredServices.map(service => {
          const checked = selectedIds.includes(service.id)
          const metadata = [service.category || 'Uncategorized', service.tags.join(', ') || service.slug].join(' · ')
          return (
            <label key={service.id} className="flex cursor-pointer items-start gap-3 border-b border-surface-border px-3 py-2 last:border-b-0 hover:bg-surface-secondary">
              <input
                type="checkbox"
                className="mt-1 h-4 w-4 accent-brand-blue"
                checked={checked}
                onChange={() => onToggle(service.id)}
              />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink">{service.name}</span>
                <span className="block break-words text-xs text-ink-secondary">{metadata}</span>
              </span>
            </label>
          )
        })}
        {!services.length ? <p className="p-3 text-sm text-ink-secondary">Create active services before building a bundle.</p> : null}
        {services.length && !filteredServices.length ? <p className="p-3 text-sm text-ink-secondary">No services match this search.</p> : null}
      </div>
      <FieldError id="bundle-service-ids-error" message={error} />
    </fieldset>
  )
}

function TagEditor({
  tags,
  draft,
  error,
  onDraftChange,
  onAdd,
  onRemove,
}: {
  tags: string[]
  draft: string
  error?: string
  onDraftChange: (value: string) => void
  onAdd: () => void
  onRemove: (tag: string) => void
}) {
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="tk-label text-xs">Tags</legend>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          className="tk-input min-w-0"
          value={draft}
          placeholder="qa, cloud, analytics"
          aria-label="Tag name"
          aria-invalid={Boolean(error)}
          onChange={event => onDraftChange(event.target.value)}
          onKeyDown={event => {
            if (event.key !== 'Enter') return
            event.preventDefault()
            onAdd()
          }}
        />
        <button type="button" className="tk-button-secondary shrink-0 justify-center sm:w-auto" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Add tag
        </button>
      </div>
      {tags.length ? (
        <div className="flex flex-wrap gap-2">
          {tags.map(tag => (
            <span key={tag} className="inline-flex min-h-[32px] items-center gap-1 rounded-full bg-blue-tint-20 px-3 text-xs font-semibold text-brand-blue">
              {tag}
              <button type="button" className="rounded-full p-0.5 text-brand-blue hover:bg-brand-blue/10" onClick={() => onRemove(tag)} aria-label={`Remove ${tag}`}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <FieldError id="service-tags-error" message={error} />
    </fieldset>
  )
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

function TextInput({
  label,
  value,
  error,
  onChange,
  type = 'text',
  placeholder,
  min,
  max,
  disabled = false,
  title,
}: {
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  min?: number
  max?: number
  disabled?: boolean
  title?: string
}) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="tk-label text-xs">{label}</span>
      <input type={type} className="tk-input min-w-0 disabled:cursor-not-allowed disabled:bg-surface-tertiary disabled:text-ink-secondary" value={value} placeholder={placeholder} min={min} max={max} aria-invalid={Boolean(error)} disabled={disabled} title={title} onChange={event => onChange(event.target.value)} />
      <FieldError id={`${label.toLowerCase().replace(/\s+/g, '-')}-error`} message={error} />
    </label>
  )
}

function TextArea({ label, value, error, onChange, placeholder, monospace = true, rows = 4 }: { label: string; value: string; error?: string; onChange: (value: string) => void; placeholder?: string; monospace?: boolean; rows?: number }) {
  return (
    <label className="grid min-w-0 gap-1">
      <span className="tk-label text-xs">{label}</span>
      <textarea className={`tk-input min-h-[120px] min-w-0 ${monospace ? 'font-mono text-xs' : 'text-sm leading-6'}`} rows={rows} value={value} placeholder={placeholder} aria-invalid={Boolean(error)} onChange={event => onChange(event.target.value)} />
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

function StatusButton({ active, onClick, ariaLabel, disabled = false }: { active: boolean; onClick: () => void; ariaLabel?: string; disabled?: boolean }) {
  return (
    <button type="button" className={active ? 'rounded-full bg-rag-green/10 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-rag-green disabled:cursor-not-allowed disabled:opacity-50' : 'rounded-full bg-surface-tertiary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-secondary disabled:cursor-not-allowed disabled:opacity-50'} onClick={onClick} aria-label={ariaLabel} title={ariaLabel} disabled={disabled}>
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

function pageForItem(items: { id: string }[], itemId: string, pageSize: number) {
  const index = items.findIndex(item => item.id === itemId)
  return index === -1 ? 1 : Math.floor(index / pageSize) + 1
}

function nextDisplayOrder(items: { displayOrder: number }[]) {
  return Math.max(0, ...items.map(item => item.displayOrder)) + 10
}

function defaultRuleForm(displayOrder = '10', roles: StakeholderRoleConfig[] = []) {
  const defaultRole = roles[0]?.slug || 'executive_sponsor'
  return {
    ...emptyRule,
    role: defaultRole,
    roles: [defaultRole],
    displayOrder,
  }
}

function ruleConditionToForm(condition: Record<string, unknown>, roles: StakeholderRoleConfig[]) {
  const defaultRole = roles[0]?.slug || 'executive_sponsor'
  const type = typeof condition.type === 'string' && conditionTypeOptions.some(option => option.value === condition.type)
    ? condition.type as StakeholderGapConditionType
    : 'missing_role'
  const conditionRoles = toStringList(condition.roles)
  const influences = toStringList(condition.influences)
  return {
    conditionType: type,
    role: typeof condition.role === 'string' ? condition.role : defaultRole,
    roles: conditionRoles.length ? conditionRoles : [defaultRole],
    count: String(typeof condition.count === 'number' || typeof condition.count === 'string' ? condition.count : 1),
    influences: influences.length ? influences : ['high', 'critical'],
    risk: typeof condition.risk === 'string' ? condition.risk : 'high',
    days: String(typeof condition.days === 'number' || typeof condition.days === 'string' ? condition.days : 90),
  }
}

function buildRuleCondition(form: typeof emptyRule) {
  if (form.conditionType === 'missing_role') {
    if (!form.role) throw fieldError('rule.role', 'Choose the stakeholder role this rule requires.')
    return { type: 'missing_role', role: form.role }
  }
  if (form.conditionType === 'missing_any_role') {
    if (!form.roles.length) throw fieldError('rule.roles', 'Choose at least one stakeholder role.')
    return { type: 'missing_any_role', roles: form.roles }
  }
  if (form.conditionType === 'max_active_stakeholders') {
    const count = Number(form.count)
    if (!Number.isInteger(count) || count < 0) throw fieldError('rule.count', 'Enter a whole number of stakeholders.')
    return { type: 'max_active_stakeholders', count }
  }
  if (form.conditionType === 'missing_any_influence') {
    if (!form.influences.length) throw fieldError('rule.influences', 'Choose at least one influence level.')
    return { type: 'missing_any_influence', influences: form.influences }
  }
  if (form.conditionType === 'political_risk_present') {
    if (!form.risk) throw fieldError('rule.risk', 'Choose the political risk level to detect.')
    return { type: 'political_risk_present', risk: form.risk }
  }
  if (form.conditionType === 'stale_interaction') {
    const days = Number(form.days)
    if (!Number.isInteger(days) || days < 1) throw fieldError('rule.days', 'Enter a whole number of days greater than zero.')
    return { type: 'stale_interaction', days }
  }
  throw fieldError('rule.conditionType', 'Choose a supported condition.')
}

function buildRuleConditionPreview(form: typeof emptyRule) {
  if (form.conditionType === 'missing_any_role') return { type: 'missing_any_role', roles: form.roles }
  if (form.conditionType === 'max_active_stakeholders') return { type: 'max_active_stakeholders', count: Number(form.count) || 0 }
  if (form.conditionType === 'missing_any_influence') return { type: 'missing_any_influence', influences: form.influences }
  if (form.conditionType === 'political_risk_present') return { type: 'political_risk_present', risk: form.risk || 'high' }
  if (form.conditionType === 'stale_interaction') return { type: 'stale_interaction', days: Number(form.days) || 90 }
  return { type: 'missing_role', role: form.role }
}

function conditionSummary(condition: Record<string, unknown>, roleSource: Array<StakeholderRoleConfig | { value: string; label: string }>) {
  if (condition.type === 'missing_role') {
    return `Flags accounts with no active ${optionLabel(roleSource, String(condition.role || 'selected role'))}.`
  }
  if (condition.type === 'missing_any_role') {
    const labels = toStringList(condition.roles).map(role => optionLabel(roleSource, role)).join(' or ')
    return `Flags accounts with none of these active roles: ${labels || 'selected roles'}.`
  }
  if (condition.type === 'max_active_stakeholders') {
    return `Flags accounts with ${Number(condition.count) || 0} or fewer active stakeholders.`
  }
  if (condition.type === 'missing_any_influence') {
    const labels = toStringList(condition.influences).map(titleize).join(' or ')
    return `Flags accounts with no active stakeholder at these influence levels: ${labels || 'selected levels'}.`
  }
  if (condition.type === 'political_risk_present') {
    return `Flags accounts with an active stakeholder marked ${titleize(String(condition.risk || 'high'))} political risk.`
  }
  if (condition.type === 'stale_interaction') {
    return `Flags accounts with no stakeholder interaction in the last ${Number(condition.days) || 90} days.`
  }
  return 'Unsupported condition type. Update this rule before saving.'
}

function optionLabel(source: Array<StakeholderRoleConfig | { value: string; label: string }>, value: string) {
  const match = source.find(item => ('slug' in item ? item.slug : item.value) === value)
  if (!match) return titleize(value)
  return 'name' in match ? match.name : match.label
}

function toStringList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && Boolean(item)) : []
}

function splitList(value: string) {
  return value.split(',').map(item => item.trim()).filter(Boolean)
}

function titleize(value: string) {
  return value.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase())
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

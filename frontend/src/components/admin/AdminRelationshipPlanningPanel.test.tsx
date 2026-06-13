import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminRelationshipPlanningPanel } from '@/components/admin/AdminRelationshipPlanningPanel'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const services = [
  {
    id: 'svc-product',
    slug: 'product_engineering',
    name: 'Product Engineering',
    category: 'Engineering',
    description: null,
    tags: ['web', 'mobile', 'platform'],
    is_active: true,
    display_order: 10,
    in_use_count: 1,
  },
  {
    id: 'svc-cloud',
    slug: 'cloud_devops',
    name: 'Cloud & DevOps',
    category: 'Engineering',
    description: null,
    tags: ['cloud', 'sre', 'infra'],
    is_active: true,
    display_order: 20,
    in_use_count: 8,
  },
]

function makeServices(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `svc-${index + 1}`,
    slug: `service_${index + 1}`,
    name: `Service ${index + 1}`,
    category: index % 2 ? 'Engineering' : 'Data',
    description: null,
    tags: [`tag-${index + 1}`],
    is_active: true,
    display_order: index + 1,
    in_use_count: index,
  }))
}

function makeRoles(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `role-${index + 1}`,
    slug: `role_${index + 1}`,
    name: `Role ${index + 1}`,
    description: `Role ${index + 1} description.`,
    is_active: true,
    display_order: (index + 1) * 10,
    in_use_count: index,
    gap_rule_usage_count: 0,
  }))
}

function makeGapRules(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    id: `gap-${index + 1}`,
    rule_key: `gap_rule_${index + 1}`,
    title: `Gap Rule ${index + 1}`,
    description: `Gap rule ${index + 1} description.`,
    severity: index % 2 ? 'critical' : 'warning',
    condition_json: { type: 'missing_role', role: `role_${index + 1}` },
    is_active: true,
    display_order: (index + 1) * 10,
  }))
}

interface BundleItem {
  id: string
  slug: string
  name: string
  description: string | null
  service_ids: string[]
  service_names: string[]
  is_active: boolean
  display_order: number
}

interface GrowthRuleItem {
  id: string
  source_selector_type: string
  source_selector_value: string
  source_selector_label: string
  target_selector_type: string
  target_selector_value: string
  target_selector_label: string
  base_fit_score: number
  priority: number
  rationale_template: string
  is_active: boolean
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function page<T>(items: T[]) {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 100,
    pages: items.length ? 1 : 0,
  }
}

function pageFromUrl<T>(url: string, items: T[]) {
  const parsedUrl = new URL(url)
  const currentPage = Number(parsedUrl.searchParams.get('page') ?? 1)
  const pageSize = Number(parsedUrl.searchParams.get('page_size') ?? 100)
  const total = items.length
  const pages = Math.ceil(total / pageSize)
  const start = (currentPage - 1) * pageSize
  return {
    items: items.slice(start, start + pageSize),
    total,
    page: currentPage,
    page_size: pageSize,
    pages,
  }
}

function setupFetch(serviceItems = services, config: { roleItems?: ReturnType<typeof makeRoles>; gapRuleItems?: ReturnType<typeof makeGapRules>; bundleItems?: BundleItem[]; growthRuleItems?: GrowthRuleItem[] } = {}) {
  const bundleItems = [...(config.bundleItems ?? [
    {
      id: 'bundle-1',
      slug: 'engineering_growth',
      name: 'Engineering Growth',
      description: 'Engineering growth bundle.',
      service_ids: [serviceItems[0]?.id ?? 'svc-product'],
      service_names: [serviceItems[0]?.name ?? 'Product Engineering'],
      is_active: true,
      display_order: 10,
    },
  ])]
  const growthRuleItems = [...(config.growthRuleItems ?? [
    {
      id: 'rule-1',
      source_selector_type: 'category',
      source_selector_value: 'Engineering',
      source_selector_label: 'Category: Engineering',
      target_selector_type: 'bundle',
      target_selector_value: 'bundle-1',
      target_selector_label: 'Engineering Growth',
      base_fit_score: 75,
      priority: 10,
      rationale_template: 'Uses delivery momentum.',
      is_active: true,
    },
  ])]
  const roleItems = [...(config.roleItems ?? [
    {
      id: 'role-1',
      slug: 'executive_sponsor',
      name: 'Executive Sponsor',
      description: null,
      is_active: true,
      display_order: 10,
      in_use_count: 2,
      gap_rule_usage_count: 1,
    },
  ])]
  const gapRuleItems = [...(config.gapRuleItems ?? [
    {
      id: 'gap-1',
      rule_key: 'missing_executive_sponsor',
      title: 'Missing executive sponsor',
      description: 'Executive coverage is missing.',
      severity: 'warning',
      condition_json: { type: 'missing_role', role: 'executive_sponsor' },
      is_active: true,
      display_order: 10,
    },
  ])]
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/api/admin/service-catalog') && method === 'POST') {
      return jsonResponse({ ...serviceItems[0], ...JSON.parse(String(init?.body)), id: 'svc-new' }, 201)
    }
    if (url.includes('/api/admin/service-catalog/') && method === 'PATCH') {
      return jsonResponse({ ...serviceItems[0], ...JSON.parse(String(init?.body)) })
    }
    if (url.includes('/api/admin/service-catalog')) return jsonResponse(page(serviceItems))
    if (url.includes('/api/admin/service-growth-bundles') && method === 'POST') {
      const payload = JSON.parse(String(init?.body))
      const serviceIds = payload.service_ids ?? [serviceItems[0]?.id ?? 'svc-product']
      const item = {
        id: 'bundle-new',
        slug: payload.slug,
        name: payload.name,
        description: payload.description ?? null,
        service_ids: serviceIds,
        service_names: serviceIds.map((serviceId: string) => serviceItems.find(service => service.id === serviceId)?.name ?? serviceId),
        is_active: payload.is_active ?? true,
        display_order: payload.display_order ?? 10,
      }
      bundleItems.push(item)
      bundleItems.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
      return jsonResponse(item, 201)
    }
    if (url.includes('/api/admin/service-growth-bundles/') && method === 'PATCH') {
      const bundleId = url.split('/').pop()
      const payload = JSON.parse(String(init?.body))
      const serviceIds = payload.service_ids ?? [serviceItems[0]?.id ?? 'svc-product']
      const index = bundleItems.findIndex(item => item.id === bundleId)
      const item = {
        ...(bundleItems[index] ?? bundleItems[0]),
        slug: payload.slug ?? 'engineering_growth',
        name: payload.name ?? 'Engineering Growth',
        description: payload.description ?? 'Engineering growth bundle.',
        service_ids: serviceIds,
        service_names: serviceIds.map((serviceId: string) => serviceItems.find(service => service.id === serviceId)?.name ?? serviceId),
        is_active: payload.is_active ?? true,
        display_order: 10,
      }
      if (index >= 0) bundleItems[index] = item
      return jsonResponse(item)
    }
    if (url.includes('/api/admin/service-growth-bundles')) {
      return jsonResponse(bundleItems)
    }
    if (url.includes('/api/admin/service-growth-rules') && method === 'POST') {
      const payload = JSON.parse(String(init?.body))
      const item = { id: 'rule-new', source_selector_label: 'Category: Engineering', target_selector_label: 'Engineering Growth', is_active: true, ...payload }
      growthRuleItems.push(item)
      return jsonResponse(item, 201)
    }
    if (url.includes('/api/admin/service-growth-rules')) {
      return jsonResponse(growthRuleItems)
    }
    if (url.includes('/api/admin/stakeholder-roles') && method === 'POST') {
      const payload = JSON.parse(String(init?.body))
      const item = { id: 'role-new', in_use_count: 0, gap_rule_usage_count: 0, is_active: true, ...payload }
      roleItems.push(item)
      roleItems.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
      return jsonResponse(item, 201)
    }
    if (url.includes('/api/admin/stakeholder-roles/') && method === 'DELETE') {
      const roleId = url.split('/').pop()
      const index = roleItems.findIndex(item => item.id === roleId)
      const item = roleItems[index]
      if (!item) return jsonResponse({ detail: 'Stakeholder role was not found' }, 404)
      if (item.in_use_count > 0 || item.gap_rule_usage_count > 0) {
        return jsonResponse({
          detail: {
            message: 'Stakeholder role cannot be deleted while it is in use.',
            stakeholder_count: item.in_use_count,
            gap_rule_usage_count: item.gap_rule_usage_count,
          },
        }, 409)
      }
      roleItems.splice(index, 1)
      return jsonResponse({ message: 'Stakeholder role deleted' })
    }
    if (url.includes('/api/admin/stakeholder-roles/') && method === 'PATCH') {
      const roleId = url.split('/').pop()
      const payload = JSON.parse(String(init?.body))
      const index = roleItems.findIndex(item => item.id === roleId)
      const item = { ...(roleItems[index] ?? roleItems[0]), ...payload }
      if (index >= 0) roleItems[index] = item
      return jsonResponse(item)
    }
    if (url.includes('/api/admin/stakeholder-roles')) {
      return jsonResponse(pageFromUrl(url, roleItems))
    }
    if (url.includes('/api/admin/stakeholder-gap-rules') && method === 'POST') {
      const payload = JSON.parse(String(init?.body))
      const item = { id: 'gap-new', is_active: true, ...payload }
      gapRuleItems.push(item)
      gapRuleItems.sort((a, b) => a.display_order - b.display_order || a.title.localeCompare(b.title))
      return jsonResponse(item, 201)
    }
    if (url.includes('/api/admin/stakeholder-gap-rules/') && method === 'PATCH') {
      const ruleId = url.split('/').pop()
      const payload = JSON.parse(String(init?.body))
      const index = gapRuleItems.findIndex(item => item.id === ruleId)
      const item = { ...(gapRuleItems[index] ?? gapRuleItems[0]), ...payload }
      if (index >= 0) gapRuleItems[index] = item
      return jsonResponse(item)
    }
    if (url.includes('/api/admin/stakeholder-gap-rules')) {
      return jsonResponse(pageFromUrl(url, gapRuleItems))
    }
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AdminRelationshipPlanningPanel', () => {
  it('renders service catalog, bundles, and growth rules as separate responsive sections', async () => {
    setupFetch()

    render(<AdminRelationshipPlanningPanel />)

    const servicesRegion = await screen.findByRole('region', { name: 'Services' })
    expect(within(servicesRegion).getByText('Product Engineering')).toBeInTheDocument()
    expect(within(servicesRegion).getByText('web, mobile, platform')).toBeInTheDocument()
    expect(within(servicesRegion).queryByRole('table')).not.toBeInTheDocument()

    const bundleRegion = screen.getByRole('region', { name: 'Service bundles' })
    expect(within(bundleRegion).getByText('Engineering Growth')).toBeInTheDocument()
    expect(within(bundleRegion).getByText('Engineering growth bundle.')).toBeInTheDocument()

    const rulesRegion = screen.getByRole('region', { name: 'Growth recommendation rules' })
    expect(within(rulesRegion).getByRole('button', { name: /add rule/i })).toBeInTheDocument()
    expect(within(rulesRegion).getByText('Uses delivery momentum.')).toBeInTheDocument()
    expect(within(rulesRegion).getByText('Base fit 75')).toBeInTheDocument()
  })

  it('filters service bundles and growth recommendation rules inside their own sections', async () => {
    setupFetch(services, {
      bundleItems: [
        {
          id: 'bundle-1',
          slug: 'engineering_growth',
          name: 'Engineering Growth',
          description: 'Engineering services for expansion.',
          service_ids: ['svc-product'],
          service_names: ['Product Engineering'],
          is_active: true,
          display_order: 10,
        },
        {
          id: 'bundle-2',
          slug: 'security_expansion',
          name: 'Security Expansion',
          description: 'Security services for regulated accounts.',
          service_ids: ['svc-cloud'],
          service_names: ['Cloud & DevOps'],
          is_active: false,
          display_order: 20,
        },
      ],
      growthRuleItems: [
        {
          id: 'rule-1',
          source_selector_type: 'category',
          source_selector_value: 'Engineering',
          source_selector_label: 'Category: Engineering',
          target_selector_type: 'bundle',
          target_selector_value: 'bundle-1',
          target_selector_label: 'Engineering Growth',
          base_fit_score: 75,
          priority: 10,
          rationale_template: 'Uses delivery momentum.',
          is_active: true,
        },
        {
          id: 'rule-2',
          source_selector_type: 'tag',
          source_selector_value: 'security',
          source_selector_label: 'Tag: security',
          target_selector_type: 'bundle',
          target_selector_value: 'bundle-2',
          target_selector_label: 'Security Expansion',
          base_fit_score: 85,
          priority: 30,
          rationale_template: 'Retention signal requires security coverage.',
          is_active: false,
        },
      ],
    })
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const bundleRegion = await screen.findByRole('region', { name: 'Service bundles' })
    expect(within(bundleRegion).getByText('2 of 2 configured bundles')).toBeInTheDocument()
    await user.type(within(bundleRegion).getByLabelText(/search bundles/i), 'security')
    expect(within(bundleRegion).getByText('Security Expansion')).toBeInTheDocument()
    expect(within(bundleRegion).queryByText('Engineering Growth')).not.toBeInTheDocument()
    await user.selectOptions(within(bundleRegion).getByLabelText(/bundle status/i), 'active')
    expect(within(bundleRegion).getByText('No matching bundles')).toBeInTheDocument()

    const rulesRegion = screen.getByRole('region', { name: 'Growth recommendation rules' })
    expect(within(rulesRegion).getByText('2 of 2 configured rules')).toBeInTheDocument()
    await user.selectOptions(within(rulesRegion).getByLabelText(/source type filter/i), 'tag')
    expect(within(rulesRegion).getByText('Retention signal requires security coverage.')).toBeInTheDocument()
    expect(within(rulesRegion).queryByText('Uses delivery momentum.')).not.toBeInTheDocument()
    await user.selectOptions(within(rulesRegion).getByLabelText(/rule status/i), 'active')
    expect(within(rulesRegion).getByText('No matching rules')).toBeInTheDocument()
  })

  it('keeps service creation scoped to the service catalog form', async () => {
    const fetchMock = setupFetch()
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const servicesRegion = await screen.findByRole('region', { name: 'Services' })
    await user.click(within(servicesRegion).getByRole('button', { name: /add service/i }))
    const dialog = screen.getByRole('dialog', { name: /add service/i })
    expect(within(dialog).getByPlaceholderText('Product Engineering')).toBeInTheDocument()
    expect(within(dialog).getByPlaceholderText('product_engineering')).toBeInTheDocument()
    expect(within(dialog).getByPlaceholderText('Engineering')).toBeInTheDocument()
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Security Engineering')
    await user.type(within(dialog).getByLabelText(/^slug$/i), 'security_engineering')
    await user.type(within(dialog).getByLabelText(/^category$/i), 'Security')
    await user.type(within(dialog).getByLabelText(/tag name/i), 'appsec')
    await user.click(within(dialog).getByRole('button', { name: /add tag/i }))
    await user.type(within(dialog).getByLabelText(/tag name/i), 'cloud')
    await user.click(within(dialog).getByRole('button', { name: /add tag/i }))
    await user.type(within(dialog).getByLabelText(/^description$/i), 'Application security support\nCloud risk review')
    expect(within(dialog).getByText('appsec')).toBeInTheDocument()
    expect(within(dialog).getByText('cloud')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /add service/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/service-catalog') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.slug === 'security_engineering'
        && payload.category === 'Security'
        && payload.tags.includes('appsec')
        && payload.tags.includes('cloud')
        && payload.description.includes('Cloud risk review')
        && payload.display_order === 30
    })).toBe(true))
  })

  it('edits and disables a service from the service row', async () => {
    const fetchMock = setupFetch()
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const servicesRegion = await screen.findByRole('region', { name: 'Services' })
    await user.click(within(servicesRegion).getByRole('button', { name: /edit product engineering/i }))
    const dialog = screen.getByRole('dialog', { name: /edit service/i })

    await user.clear(within(dialog).getByLabelText(/^name$/i))
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Product Studio')
    await user.click(within(dialog).getByRole('button', { name: /save service/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/service-catalog/svc-product') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      return payload.name === 'Product Studio' && !('display_order' in payload)
    })).toBe(true))

    await waitFor(() => expect(screen.queryByText(/loading planning settings/i)).not.toBeInTheDocument())
    const refreshedServicesRegion = screen.getByRole('region', { name: 'Services' })
    await user.click(within(refreshedServicesRegion).getByRole('button', { name: /disable product engineering/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/service-catalog/svc-product') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      return payload.is_active === false
    })).toBe(true))
  })

  it('adds, edits, and disables service bundles from the bundle dialog and listing', async () => {
    const fetchMock = setupFetch()
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const bundleRegion = await screen.findByRole('region', { name: 'Service bundles' })
    await user.click(within(bundleRegion).getByRole('button', { name: /add bundle/i }))
    const addDialog = screen.getByRole('dialog', { name: /add bundle/i })
    expect(within(addDialog).getByPlaceholderText('Engineering Growth')).toBeInTheDocument()
    expect(within(addDialog).getByPlaceholderText('engineering_growth')).toBeInTheDocument()
    await user.type(within(addDialog).getByLabelText(/^name$/i), 'Security Growth')
    await user.type(within(addDialog).getByLabelText(/^slug$/i), 'security_growth')
    await user.type(within(addDialog).getByLabelText(/^description$/i), 'Security services grouped for growth planning.')
    await user.type(within(addDialog).getByLabelText(/search services for bundle/i), 'platform')
    expect(within(addDialog).queryByRole('checkbox', { name: /cloud & devops/i })).not.toBeInTheDocument()
    const productCheckbox = within(addDialog).getByRole('checkbox', { name: /product engineering/i })
    await user.click(productCheckbox)
    expect(productCheckbox).toBeChecked()
    expect(within(addDialog).getByRole('button', { name: /remove product engineering/i })).toBeInTheDocument()
    await user.click(within(addDialog).getByRole('button', { name: /add bundle/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/service-growth-bundles') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.slug === 'security_growth'
        && payload.description === 'Security services grouped for growth planning.'
        && payload.service_ids.includes('svc-product')
        && payload.display_order === 20
    })).toBe(true))

    await waitFor(() => expect(screen.queryByText(/loading planning settings/i)).not.toBeInTheDocument())
    const refreshedBundleRegion = screen.getByRole('region', { name: 'Service bundles' })
    await user.click(within(refreshedBundleRegion).getByRole('button', { name: /edit engineering growth/i }))
    const editDialog = screen.getByRole('dialog', { name: /edit bundle/i })
    await user.type(within(editDialog).getByLabelText(/search services for bundle/i), 'cloud')
    const cloudCheckbox = within(editDialog).getByRole('checkbox', { name: /cloud & devops/i })
    await user.click(cloudCheckbox)
    expect(cloudCheckbox).toBeChecked()
    expect(within(editDialog).getByRole('button', { name: /remove cloud & devops/i })).toBeInTheDocument()
    await user.click(within(editDialog).getByRole('button', { name: /save bundle/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/service-growth-bundles/bundle-1') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      return payload.service_ids.includes('svc-product') && payload.service_ids.includes('svc-cloud') && !('display_order' in payload)
    })).toBe(true))

    await waitFor(() => expect(screen.queryByText(/loading planning settings/i)).not.toBeInTheDocument())
    const finalBundleRegion = screen.getByRole('region', { name: 'Service bundles' })
    await user.click(within(finalBundleRegion).getByRole('button', { name: /disable engineering growth/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/service-growth-bundles/bundle-1') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      return payload.is_active === false
    })).toBe(true))
  })

  it('adds growth recommendation rules from a dialog', async () => {
    const fetchMock = setupFetch()
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const rulesRegion = await screen.findByRole('region', { name: 'Growth recommendation rules' })
    await user.click(within(rulesRegion).getByRole('button', { name: /add rule/i }))
    const dialog = screen.getByRole('dialog', { name: /add recommendation rule/i })
    expect(within(dialog).getByLabelText(/base fit/i)).toHaveAttribute('max', '100')

    await user.selectOptions(within(dialog).getByLabelText(/^source type$/i), 'category')
    await user.selectOptions(within(dialog).getByLabelText(/^source$/i), 'Engineering')
    await user.selectOptions(within(dialog).getByLabelText(/^target type$/i), 'bundle')
    await user.selectOptions(within(dialog).getByLabelText(/^target$/i), 'bundle-1')
    await user.clear(within(dialog).getByLabelText(/base fit/i))
    await user.type(within(dialog).getByLabelText(/base fit/i), '82')
    await user.clear(within(dialog).getByLabelText(/^priority$/i))
    await user.type(within(dialog).getByLabelText(/^priority$/i), '30')
    await user.type(within(dialog).getByLabelText(/^rationale$/i), 'Engineering accounts often expand into this bundle.')
    await user.click(within(dialog).getByRole('button', { name: /add rule/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/service-growth-rules') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.source_selector_type === 'category'
        && payload.source_selector_value === 'Engineering'
        && payload.target_selector_type === 'bundle'
        && payload.target_selector_value === 'bundle-1'
        && payload.base_fit_score === 82
        && payload.priority === 30
        && payload.rationale_template === 'Engineering accounts often expand into this bundle.'
    })).toBe(true))
  })

  it('manages stakeholder roles from dialogs and paginates role cards', async () => {
    const fetchMock = setupFetch(services, { roleItems: makeRoles(14) })
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const coverageRegion = await screen.findByRole('region', { name: 'Roles and gap rules' })
    expect(within(coverageRegion).getByText('Role 1')).toBeInTheDocument()
    expect(within(coverageRegion).queryByText('Role 14')).not.toBeInTheDocument()
    expect(within(coverageRegion).getByText('Showing 1-12 of 14 roles')).toBeInTheDocument()

    await user.click(within(coverageRegion).getByRole('button', { name: /add role/i }))
    const addDialog = screen.getByRole('dialog', { name: /add stakeholder role/i })
    expect(within(addDialog).getByLabelText(/^order$/i)).toHaveValue(150)
    await user.type(within(addDialog).getByLabelText(/^name$/i), 'Innovation Sponsor')
    await user.type(within(addDialog).getByLabelText(/^slug$/i), 'innovation_sponsor')
    await user.type(within(addDialog).getByLabelText(/^description$/i), 'Owns innovation and strategic expansion coverage.')
    await user.click(within(addDialog).getByRole('button', { name: /add role/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/stakeholder-roles') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.slug === 'innovation_sponsor'
        && payload.description === 'Owns innovation and strategic expansion coverage.'
        && payload.display_order === 150
    })).toBe(true))

    await waitFor(() => expect(screen.queryByText(/loading planning settings/i)).not.toBeInTheDocument())
    const refreshedCoverageRegion = screen.getByRole('region', { name: 'Roles and gap rules' })
    expect(within(refreshedCoverageRegion).getByText('Innovation Sponsor')).toBeInTheDocument()
    expect(within(refreshedCoverageRegion).getByText('Showing 13-15 of 15 roles')).toBeInTheDocument()

    await user.selectOptions(within(refreshedCoverageRegion).getByLabelText(/roles per page/i), '24')
    expect(within(refreshedCoverageRegion).getByText('Showing 1-15 of 15 roles')).toBeInTheDocument()
    await user.click(within(refreshedCoverageRegion).getByRole('button', { name: 'Edit Role 1' }))
    const editDialog = screen.getByRole('dialog', { name: /edit stakeholder role/i })
    await user.clear(within(editDialog).getByLabelText(/^description$/i))
    await user.type(within(editDialog).getByLabelText(/^description$/i), 'Updated stakeholder role guidance.')
    await user.click(within(editDialog).getByRole('button', { name: /save role/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/stakeholder-roles/role-1') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      return payload.description === 'Updated stakeholder role guidance.'
    })).toBe(true))

    await waitFor(() => expect(screen.queryByText(/loading planning settings/i)).not.toBeInTheDocument())
    const finalCoverageRegion = screen.getByRole('region', { name: 'Roles and gap rules' })
    await user.click(within(finalCoverageRegion).getByRole('button', { name: 'Disable Role 1' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/stakeholder-roles/role-1') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      return payload.is_active === false
    })).toBe(true))
  })

  it('deletes unused stakeholder roles and blocks referenced roles in the role list', async () => {
    const fetchMock = setupFetch(services, {
      roleItems: [
        {
          id: 'role-unused',
          slug: 'obsolete_contact',
          name: 'Obsolete Contact',
          description: 'Legacy role no longer used.',
          is_active: true,
          display_order: 10,
          in_use_count: 0,
          gap_rule_usage_count: 0,
        },
        {
          id: 'role-stakeholder-used',
          slug: 'client_champion',
          name: 'Client Champion',
          description: 'Used by existing stakeholders.',
          is_active: true,
          display_order: 20,
          in_use_count: 3,
          gap_rule_usage_count: 0,
        },
        {
          id: 'role-rule-used',
          slug: 'innovation_sponsor',
          name: 'Innovation Sponsor',
          description: 'Used by a coverage rule.',
          is_active: true,
          display_order: 30,
          in_use_count: 0,
          gap_rule_usage_count: 1,
        },
      ],
    })
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const coverageRegion = await screen.findByRole('region', { name: 'Roles and gap rules' })
    expect(within(coverageRegion).getByRole('button', { name: 'Delete Client Champion' })).toBeDisabled()
    expect(within(coverageRegion).getByRole('button', { name: 'Delete Innovation Sponsor' })).toBeDisabled()

    await user.click(within(coverageRegion).getByRole('button', { name: 'Delete Obsolete Contact' }))
    const dialog = screen.getByRole('dialog', { name: /delete stakeholder role/i })
    await user.click(within(dialog).getByRole('button', { name: /delete role/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      return String(url).endsWith('/api/admin/stakeholder-roles/role-unused') && init?.method === 'DELETE'
    })).toBe(true))
    await waitFor(() => expect(within(screen.getByRole('region', { name: 'Roles and gap rules' })).queryByText('Obsolete Contact')).not.toBeInTheDocument())
  })

  it('filters stakeholder roles and gap rules inside the coverage section', async () => {
    setupFetch(services, {
      roleItems: [
        {
          id: 'role-client',
          slug: 'client_champion',
          name: 'Client Champion',
          description: 'Relationship champion.',
          is_active: true,
          display_order: 10,
          in_use_count: 1,
          gap_rule_usage_count: 0,
        },
        {
          id: 'role-technical',
          slug: 'technical_owner',
          name: 'Technical Owner',
          description: 'Owns technical decisions.',
          is_active: true,
          display_order: 20,
          in_use_count: 0,
          gap_rule_usage_count: 0,
        },
        {
          id: 'role-inactive',
          slug: 'legacy_sponsor',
          name: 'Legacy Sponsor',
          description: 'No longer used.',
          is_active: false,
          display_order: 30,
          in_use_count: 0,
          gap_rule_usage_count: 0,
        },
      ],
      gapRuleItems: [
        {
          id: 'gap-sponsor',
          rule_key: 'missing_client_champion',
          title: 'Missing client champion',
          description: 'Champion coverage is missing.',
          severity: 'warning',
          condition_json: { type: 'missing_role', role: 'client_champion' },
          is_active: true,
          display_order: 10,
        },
        {
          id: 'gap-stale',
          rule_key: 'stale_touch',
          title: 'Stale stakeholder touch',
          description: 'Stakeholder contact is stale.',
          severity: 'critical',
          condition_json: { type: 'stale_interaction', days: 45 },
          is_active: false,
          display_order: 20,
        },
      ],
    })
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const coverageRegion = await screen.findByRole('region', { name: 'Roles and gap rules' })
    await user.type(within(coverageRegion).getByLabelText(/^search roles$/i), 'technical')
    expect(within(coverageRegion).getByText('Technical Owner')).toBeInTheDocument()
    expect(within(coverageRegion).queryByText('Client Champion')).not.toBeInTheDocument()
    expect(within(coverageRegion).getByText('Showing 1-1 of 1 roles')).toBeInTheDocument()

    await user.clear(within(coverageRegion).getByLabelText(/^search roles$/i))
    await user.selectOptions(within(coverageRegion).getByLabelText(/^role status$/i), 'inactive')
    expect(within(coverageRegion).getByText('Legacy Sponsor')).toBeInTheDocument()
    expect(within(coverageRegion).queryByText('Technical Owner')).not.toBeInTheDocument()

    await user.type(within(coverageRegion).getByLabelText(/^search gap rules$/i), 'stale')
    expect(within(coverageRegion).getByText('Stale stakeholder touch')).toBeInTheDocument()
    expect(within(coverageRegion).queryByText('Missing client champion')).not.toBeInTheDocument()
    expect(within(coverageRegion).getByText('Showing 1-1 of 1 rules')).toBeInTheDocument()

    await user.selectOptions(within(coverageRegion).getByLabelText(/^rule status$/i), 'active')
    expect(within(coverageRegion).getByText('No matching gap rules')).toBeInTheDocument()
    await user.selectOptions(within(coverageRegion).getByLabelText(/^rule status$/i), 'all')
    await user.selectOptions(within(coverageRegion).getByLabelText(/^severity$/i), 'critical')
    expect(within(coverageRegion).getByText('Stale stakeholder touch')).toBeInTheDocument()
  })

  it('manages stakeholder gap rules from dialogs and paginates rule cards', async () => {
    const fetchMock = setupFetch(services, { gapRuleItems: makeGapRules(13) })
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const coverageRegion = await screen.findByRole('region', { name: 'Roles and gap rules' })
    expect(within(coverageRegion).getByText('Gap Rule 1')).toBeInTheDocument()
    expect(within(coverageRegion).queryByText('Gap Rule 13')).not.toBeInTheDocument()
    expect(within(coverageRegion).getByText('Showing 1-10 of 13 rules')).toBeInTheDocument()

    await user.click(within(coverageRegion).getByRole('button', { name: /add gap rule/i }))
    const addDialog = screen.getByRole('dialog', { name: /add gap rule/i })
    expect(within(addDialog).queryByLabelText(/condition json/i)).not.toBeInTheDocument()
    expect(within(addDialog).getByLabelText(/^condition$/i)).toHaveValue('missing_role')
    expect(within(addDialog).getByText(/flags accounts with no active executive sponsor/i)).toBeInTheDocument()
    expect(within(addDialog).getByLabelText(/^order$/i)).toHaveValue(140)
    await user.type(within(addDialog).getByLabelText(/^title$/i), 'Missing innovation sponsor')
    await user.type(within(addDialog).getByLabelText(/^rule key$/i), 'missing_innovation_sponsor')
    await user.selectOptions(within(addDialog).getByLabelText(/^severity$/i), 'critical')
    await user.type(within(addDialog).getByLabelText(/^description$/i), 'Innovation coverage is missing.')
    await user.click(within(addDialog).getByRole('button', { name: /add rule/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/stakeholder-gap-rules') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.rule_key === 'missing_innovation_sponsor'
        && payload.severity === 'critical'
        && payload.display_order === 140
        && payload.condition_json.role === 'executive_sponsor'
    })).toBe(true))

    await waitFor(() => expect(screen.queryByText(/loading planning settings/i)).not.toBeInTheDocument())
    const refreshedCoverageRegion = screen.getByRole('region', { name: 'Roles and gap rules' })
    expect(within(refreshedCoverageRegion).getByText('Missing innovation sponsor')).toBeInTheDocument()
    expect(within(refreshedCoverageRegion).getByText('Showing 11-14 of 14 rules')).toBeInTheDocument()

    await user.selectOptions(within(refreshedCoverageRegion).getByLabelText(/rules per page/i), '25')
    expect(within(refreshedCoverageRegion).getByText('Showing 1-14 of 14 rules')).toBeInTheDocument()
    await user.click(within(refreshedCoverageRegion).getByRole('button', { name: 'Edit Gap Rule 1' }))
    const editDialog = screen.getByRole('dialog', { name: /edit gap rule/i })
    expect(within(editDialog).getByLabelText(/^condition$/i)).toHaveValue('missing_role')
    await user.clear(within(editDialog).getByLabelText(/^title$/i))
    await user.type(within(editDialog).getByLabelText(/^title$/i), 'Updated gap rule')
    await user.click(within(editDialog).getByRole('button', { name: /save rule/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/stakeholder-gap-rules/gap-1') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      return payload.title === 'Updated gap rule' && payload.condition_json.role === 'role_1'
    })).toBe(true))

    await waitFor(() => expect(screen.queryByText(/loading planning settings/i)).not.toBeInTheDocument())
    const finalCoverageRegion = screen.getByRole('region', { name: 'Roles and gap rules' })
    await user.click(within(finalCoverageRegion).getByRole('button', { name: 'Disable Updated gap rule' }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/stakeholder-gap-rules/gap-1') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      return payload.is_active === false
    })).toBe(true))
  })

  it('builds non-role stakeholder gap rule conditions without raw JSON entry', async () => {
    const fetchMock = setupFetch(services)
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const coverageRegion = await screen.findByRole('region', { name: 'Roles and gap rules' })
    await user.click(within(coverageRegion).getByRole('button', { name: /add gap rule/i }))
    const addDialog = screen.getByRole('dialog', { name: /add gap rule/i })
    await user.type(within(addDialog).getByLabelText(/^title$/i), 'No recent stakeholder touch')
    await user.type(within(addDialog).getByLabelText(/^rule key$/i), 'no_recent_touch')
    await user.type(within(addDialog).getByLabelText(/^description$/i), 'Stakeholder engagement is stale.')
    await user.selectOptions(within(addDialog).getByLabelText(/^condition$/i), 'stale_interaction')
    await user.clear(within(addDialog).getByLabelText(/^days without interaction$/i))
    await user.type(within(addDialog).getByLabelText(/^days without interaction$/i), '45')
    expect(within(addDialog).getByText(/no stakeholder interaction in the last 45 days/i)).toBeInTheDocument()
    await user.click(within(addDialog).getByRole('button', { name: /add rule/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/stakeholder-gap-rules') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.rule_key === 'no_recent_touch'
        && payload.condition_json.type === 'stale_interaction'
        && payload.condition_json.days === 45
    })).toBe(true))
  })

  it('loads stakeholder coverage config beyond the first backend page', async () => {
    const fetchMock = setupFetch(services, { roleItems: makeRoles(101), gapRuleItems: makeGapRules(101) })
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const coverageRegion = await screen.findByRole('region', { name: 'Roles and gap rules' })

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/admin/stakeholder-roles') && String(call[0]).includes('page=2'))).toBe(true)
      expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/admin/stakeholder-gap-rules') && String(call[0]).includes('page=2'))).toBe(true)
    })

    await user.selectOptions(within(coverageRegion).getByLabelText(/roles per page/i), '50')
    const roleNextButton = within(coverageRegion).getAllByRole('button', { name: /^next$/i })[0]
    await user.click(roleNextButton)
    await user.click(roleNextButton)

    expect(within(coverageRegion).getByText('Role 101')).toBeInTheDocument()
  })

  it('paginates large service catalogs inside the services section', async () => {
    setupFetch(makeServices(16))
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const servicesRegion = await screen.findByRole('region', { name: 'Services' })
    expect(within(servicesRegion).getByText('Service 1')).toBeInTheDocument()
    expect(within(servicesRegion).queryByText('Service 16')).not.toBeInTheDocument()
    expect(within(servicesRegion).getByText('Showing 1-10 of 16 services')).toBeInTheDocument()

    await user.click(within(servicesRegion).getByRole('button', { name: /^next$/i }))

    expect(within(servicesRegion).getByText('Service 16')).toBeInTheDocument()
    expect(within(servicesRegion).queryByText('Service 1')).not.toBeInTheDocument()
    expect(within(servicesRegion).getByText('Showing 11-16 of 16 services')).toBeInTheDocument()

    await user.selectOptions(within(servicesRegion).getByLabelText(/services per page/i), '25')

    expect(within(servicesRegion).getByText('Showing 1-16 of 16 services')).toBeInTheDocument()
  })
})

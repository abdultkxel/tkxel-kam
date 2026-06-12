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

function setupFetch(serviceItems = services) {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/api/admin/service-catalog') && method === 'POST') {
      return jsonResponse({ ...serviceItems[0], ...JSON.parse(String(init?.body)), id: 'svc-new' }, 201)
    }
    if (url.includes('/api/admin/service-catalog')) return jsonResponse(page(serviceItems))
    if (url.includes('/api/admin/service-adjacencies')) {
      return jsonResponse([
        {
          id: 'adj-1',
          source_service_id: serviceItems[0]?.id ?? 'svc-product',
          source_service_name: serviceItems[0]?.name ?? 'Product Engineering',
          target_service_id: serviceItems[1]?.id ?? 'svc-cloud',
          target_service_name: serviceItems[1]?.name ?? 'Cloud & DevOps',
          relevance_score: 75,
          rationale: 'Uses delivery momentum.',
          is_active: true,
        },
      ])
    }
    if (url.includes('/api/admin/stakeholder-roles')) {
      return jsonResponse(page([
        {
          id: 'role-1',
          slug: 'executive_sponsor',
          name: 'Executive Sponsor',
          description: null,
          is_active: true,
          display_order: 10,
          in_use_count: 2,
        },
      ]))
    }
    if (url.includes('/api/admin/stakeholder-gap-rules')) {
      return jsonResponse(page([
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
      ]))
    }
    if (url.includes('/api/admin/opportunity-stages')) {
      return jsonResponse([
        {
          id: 'stage-1',
          slug: 'identified',
          name: 'Identified',
          is_terminal: false,
          requires_outcome_reason: false,
          is_active: true,
          display_order: 10,
        },
        {
          id: 'stage-2',
          slug: 'qualified',
          name: 'Qualified',
          is_terminal: false,
          requires_outcome_reason: false,
          is_active: true,
          display_order: 20,
        },
      ])
    }
    if (url.includes('/api/admin/opportunity-stage-transitions')) {
      return jsonResponse([
        {
          id: 'transition-1',
          from_stage: 'Identified',
          to_stage: 'Qualified',
          is_active: true,
          requires_reason: false,
        },
      ])
    }
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AdminRelationshipPlanningPanel', () => {
  it('renders service catalog and adjacency settings as separate responsive sections', async () => {
    setupFetch()

    render(<AdminRelationshipPlanningPanel />)

    const servicesRegion = await screen.findByRole('region', { name: 'Services' })
    expect(within(servicesRegion).getByText('Product Engineering')).toBeInTheDocument()
    expect(within(servicesRegion).getByText('web, mobile, platform')).toBeInTheDocument()
    expect(within(servicesRegion).queryByRole('table')).not.toBeInTheDocument()

    const adjacencyRegion = screen.getByRole('region', { name: 'Service adjacencies' })
    expect(within(adjacencyRegion).getByLabelText(/source/i)).toBeInTheDocument()
    expect(within(adjacencyRegion).getByText('Uses delivery momentum.')).toBeInTheDocument()
    expect(within(adjacencyRegion).getByText('Score 75')).toBeInTheDocument()
  })

  it('keeps service creation scoped to the service catalog form', async () => {
    const fetchMock = setupFetch()
    const user = userEvent.setup()

    render(<AdminRelationshipPlanningPanel />)

    const servicesRegion = await screen.findByRole('region', { name: 'Services' })
    await user.type(within(servicesRegion).getByLabelText(/^name$/i), 'Security Engineering')
    await user.type(within(servicesRegion).getByLabelText(/^slug$/i), 'security_engineering')
    await user.type(within(servicesRegion).getByLabelText(/^category$/i), 'Security')
    await user.type(within(servicesRegion).getByLabelText(/^tags$/i), 'appsec, cloud')
    await user.click(within(servicesRegion).getByRole('button', { name: /^add$/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/service-catalog') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.slug === 'security_engineering' && payload.category === 'Security' && payload.tags.length === 2
    })).toBe(true))
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

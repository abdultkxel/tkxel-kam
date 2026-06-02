import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScoringEngineBuilder } from '@/components/admin/ScoringEngineBuilder'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const metric = {
  id: 'metric-1',
  slug: 'relationship_health',
  name: 'Relationship Health',
  description: 'Relationship score',
  scope: 'account',
  weight: 17,
  thresholds: { red_max: 59, amber_min: 60, green_min: 75 },
  formula: { op: 'weighted_sum', scale: 3, items: [{ field: 'relationship.ceo', weight: 100 }] },
  freshness_rule: { stale_after_days: 30 },
  owner_role: 'kam_head',
  source: 'manual',
  effective_date: '2026-06-02T00:00:00Z',
  status: 'published',
  is_active: true,
  current_version: 2,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-02T00:00:00Z',
} as const

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function page<T>(items: T[], total = items.length) {
  return { items, total, page: 1, page_size: 8, pages: total ? 1 : 0 }
}

describe('ScoringEngineBuilder', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads metric CRUD surface, sends filters, validates, publishes, and shows versions', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/metrics/metric-1/versions')) {
        return jsonResponse(page([{ id: 'version-1', metric_id: metric.id, version: 2, config_json: metric, published_by_id: 'usr-admin', published_by_name: 'Admin User', published_at: '2026-06-02T00:00:00Z', created_at: '2026-06-02T00:00:00Z' }]))
      }
      if (url.includes('/api/admin/metrics/metric-1/validate') && init?.method === 'POST') {
        return jsonResponse({ valid: true, errors: [], warnings: [] })
      }
      if (url.includes('/api/admin/metrics/metric-1/publish') && init?.method === 'POST') {
        return jsonResponse({ id: 'version-2', metric_id: metric.id, version: 3, config_json: metric, published_by_id: 'usr-admin', published_by_name: 'Admin User', published_at: '2026-06-02T01:00:00Z', created_at: '2026-06-02T01:00:00Z' })
      }
      if (url.includes('/api/admin/metrics/metric-1') && init?.method === 'PATCH') {
        return jsonResponse({ ...metric, ...JSON.parse(String(init.body)), updated_at: '2026-06-02T01:00:00Z' })
      }
      if (url.includes('/api/admin/metrics')) return jsonResponse(page([metric]))
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<ScoringEngineBuilder />)

    await waitFor(() => expect(screen.getAllByText('Relationship Health').length).toBeGreaterThan(0))
    expect(await screen.findByText('Version 2')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/source filter/i), 'manual')
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('source=manual'))).toBe(true))

    await userEvent.click(screen.getByRole('button', { name: /validate/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/validate'))).toBe(true))

    await userEvent.click(screen.getByRole('button', { name: /^publish$/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/publish'))).toBe(true))

    await userEvent.click(screen.getByRole('button', { name: /off/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [, init] = call
      return init?.method === 'PATCH' && JSON.parse(String(init.body)).is_active === false
    })).toBe(true))
  })

  it('shows an empty metric state', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes('/api/admin/metrics')) return jsonResponse(page([]))
      return jsonResponse({})
    }))

    render(<ScoringEngineBuilder />)

    expect(await screen.findByText('No metrics match this view')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create metric/i })).toBeInTheDocument()
  })
})

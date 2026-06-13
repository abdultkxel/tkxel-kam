import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Escalations } from '@/pages/Escalations'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 'usr-1', name: 'Admin User', role: 'admin', email: 'admin@example.com', avatarInitials: 'AU' },
  }),
}))

const account = {
  id: 'account-1',
  name: 'Cafe Zupas',
  segment: 'Enterprise',
  lifecycle_status: 'Expansion Focus',
  risk_status: 'warning',
  commercial_value: 1260000,
  currency: 'USD',
  health: { overall: 68, relationship: 70, usage: 66, delivery: 65, commercial: 71 },
  updated_at: '2026-05-31T00:00:00Z',
  owners: [],
  governance_completeness: {},
}

const escalation = {
  id: 'esc-1',
  account_id: 'account-1',
  summary: 'Regional rollout governance slip',
  impact: 'Executive confidence is at risk.',
  severity: 'critical',
  priority: 'urgent',
  status: 'open',
  owner_id: 'usr-1',
  owner_name: 'Admin User',
  sla_due_at: '2026-06-01T00:00:00Z',
  watchlist: true,
  custom_field_values: { client_commitment: 'Daily executive updates' },
  created_by_name: 'Admin User',
  created_at: '2026-05-31T00:00:00Z',
  updated_at: '2026-05-31T00:00:00Z',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, page_size: 8, pages: items.length ? 1 : 0 }
}

describe('Escalations', () => {
  it('loads escalation cards, supports filters, and creates an escalation', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/custom-fields')) {
        return jsonResponse([
          {
            id: 'field-1',
            module: 'escalation_management',
            field_key: 'client_commitment',
            label: 'Client Commitment',
            field_type: 'text',
            options: [],
            validation_rules: {},
            is_required: false,
            is_sensitive: false,
            is_active: true,
            show_in_list: true,
            show_in_detail: true,
            sort_order: 1,
          },
        ])
      }
      if (url.includes('/api/accounts')) return jsonResponse({ ...page([account]), page_size: 100 })
      if (url.endsWith('/api/escalations') && init?.method === 'POST') return jsonResponse({ ...escalation, id: 'esc-2', summary: 'New escalation' }, 201)
      if (url.includes('/api/escalations')) return jsonResponse(page([escalation]))
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Escalations />
      </MemoryRouter>,
    )

    expect(screen.getByText(/Loading escalations/i)).toBeInTheDocument()
    expect(await screen.findByText('Regional rollout governance slip')).toBeInTheDocument()
    expect((await screen.findAllByText('Client Commitment')).length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Daily executive updates')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/Search summary/i), 'rollout')
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('search=rollout'))).toBe(true))

    await userEvent.type(screen.getByPlaceholderText('Escalation summary'), 'New escalation')
    await userEvent.type(screen.getByPlaceholderText('Business/client impact'), 'Client executive review is blocked.')
    await userEvent.click(screen.getByRole('button', { name: /create/i }))

    expect(await screen.findByText('New escalation')).toBeInTheDocument()
  })
})

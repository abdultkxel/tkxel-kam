import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Retention } from '@/pages/Retention'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 'usr-1', name: 'Admin User', role: 'admin', email: 'admin@example.com', avatarInitials: 'AU' },
  }),
}))

const renewal = {
  id: 'ren-1',
  account_id: 'account-1',
  account_name: 'Cafe Retention',
  engagement_id: 'eng-1',
  engagement_name: 'Regional support SOW',
  readiness_status: 'in_review',
  renewal_risk: 'warning',
  sow_end_date: '2026-08-10T00:00:00Z',
  renewal_date: '2026-08-10T00:00:00Z',
  notice_deadline: '2026-07-01T00:00:00Z',
  auto_renewal: true,
  commercial_exposure: 800000,
  currency: 'USD',
  confidence: 88,
  source_kind: 'sow',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, page_size: 10, pages: items.length ? 1 : 0 }
}

const report = {
  total_renewals: 1,
  critical_renewals: 0,
  warning_renewals: 1,
  healthy_renewals: 0,
  upcoming_notice_30: 1,
  upcoming_renewal_90: 1,
  total_commercial_exposure: 800000,
  open_retention_actions: 1,
  overdue_retention_actions: 0,
  signal_count: 1,
}

function retentionFetch(items = [renewal]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/retention/reports/portfolio')) return jsonResponse(report)
    if (url.includes('/api/retention/tasks')) return jsonResponse(page([{
      id: 'act-1',
      account_id: 'account-1',
      account_name: 'Cafe Retention',
      plan_id: 'plan-1',
      plan_title: 'Renewal save plan',
      title: 'Confirm executive sponsor',
      owner_id: 'usr-1',
      owner_name: 'Admin User',
      due_at: '2026-06-15T00:00:00Z',
      status: 'todo',
    }]))
    if (url.includes('/api/retention/signals')) return jsonResponse(page([{
      id: 'notice-eng-1',
      account_id: 'account-1',
      account_name: 'Cafe Retention',
      engagement_id: 'eng-1',
      engagement_name: 'Regional support SOW',
      signal_type: 'notice_window',
      severity: 'warning',
      headline: 'Renewal notice deadline is approaching',
      detail: 'Notice deadline is due soon.',
      reason_codes: ['notice_window'],
      evidence: ['2026-07-01T00:00:00Z'],
      due_at: '2026-07-01T00:00:00Z',
      source_record_route: '/accounts/account-1?tab=retention',
    }]))
    if (url.includes('/api/retention/calendar-items')) return jsonResponse([{
      id: 'notice-eng-1',
      account_id: 'account-1',
      account_name: 'Cafe Retention',
      title: 'Notice deadline: Regional support SOW',
      starts_at: '2026-07-01T00:00:00Z',
      item_type: 'notice_deadline',
      source_record_route: '/accounts/account-1?tab=retention',
      owner_name: 'Admin User',
      severity: 'warning',
    }])
    if (url.includes('/retention-plans')) return jsonResponse(page([]))
    if (url.includes('/api/retention/renewals')) return jsonResponse(page(items))
    return jsonResponse({})
  })
}

describe('Retention', () => {
  it('renders loading and empty states', async () => {
    vi.stubGlobal('fetch', retentionFetch([]))

    render(
      <MemoryRouter>
        <Retention />
      </MemoryRouter>,
    )

    expect(screen.getByRole('status', { name: /loading retention renewals/i })).toBeInTheDocument()
    expect(await screen.findByText(/No renewals found/i)).toBeInTheDocument()
  })

  it('sends search, filter, sort, and pagination query params', async () => {
    const fetchMock = retentionFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Retention />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Cafe Retention')).toBeInTheDocument()
    expect(screen.getByText('Confirm executive sponsor')).toBeInTheDocument()
    expect(screen.getByText('Renewal notice deadline is approaching')).toBeInTheDocument()
    expect(screen.getByText('Notice deadline: Regional support SOW')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText(/Account, engagement/i), 'Cafe')
    await userEvent.selectOptions(screen.getByLabelText('Risk'), 'critical')
    await userEvent.selectOptions(screen.getByLabelText('Sort'), 'commercial_exposure')
    await userEvent.click(screen.getByRole('button', { name: /apply/i }))

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(call => {
        const url = String(call[0])
        return url.includes('/api/retention/renewals') && url.includes('search=Cafe') && url.includes('renewal_risk=critical') && url.includes('sort=commercial_exposure')
      })).toBe(true)
    })
  })

  it('renders error state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Retention failed' }, 500)))

    render(
      <MemoryRouter>
        <Retention />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/Renewals could not be loaded/i)).toBeInTheDocument()
    expect(screen.getByText('Retention failed')).toBeInTheDocument()
  })
})

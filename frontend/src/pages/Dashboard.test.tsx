import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Dashboard } from '@/pages/Dashboard'

const authState = vi.hoisted(() => ({
  token: 'test-token',
  user: {
    id: 'usr-leader',
    name: 'Leadership Viewer',
    email: 'leader@tkxel.com',
    role: 'leadership_viewer',
    avatarInitials: 'LV',
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => authState,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function dashboard(overrides: Record<string, unknown> = {}) {
  return {
    dashboard: 'leadership',
    display_name: 'Leadership Dashboard',
    role_group: 'leadership',
    read_only: true,
    allowed_filters: ['search', 'risk'],
    generated_at: '2026-06-03T10:00:00Z',
    data_scope: 'executive',
    metadata: { commercial_values_masked: true },
    widgets: [
      {
        key: 'forecast_chart',
        title: 'Forecast chart',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'executive',
        primary_route: '/dashboard',
        value: {
          open_opportunities: 2,
          pipeline_value: 'Restricted',
          weighted_forecast: 'Restricted',
          series: [{ label: 'Qualified', value: 2, display_value: 'Restricted' }],
        },
        items: [],
        metadata: { masked: true },
        error: null,
      },
      {
        key: 'governance_calendar',
        title: 'Global / Governance Calendar',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'executive',
        primary_route: '/governance',
        value: { upcoming: 1, overdue: 0 },
        items: [],
        metadata: { read_only: true },
        error: null,
      },
    ],
    ...overrides,
  }
}

function calendarPage() {
  return {
    items: [
      {
        id: 'governance:evt-1',
        kind: 'governance',
        source_record_id: 'evt-1',
        source_record_type: 'governance_event',
        account_id: 'acc-1',
        account_name: 'Acme',
        owner_id: 'usr-leader',
        date: '2026-06-15T10:00:00Z',
        title: 'QBR - Acme',
        detail: 'Quarterly governance review.',
        status: 'scheduled',
        route: '/accounts/acc-1?tab=governance',
      },
    ],
    total: 1,
    page: 1,
    page_size: 100,
    pages: 1,
  }
}

function accountManagerDashboard() {
  return dashboard({
    dashboard: 'am_home',
    display_name: 'AM Home',
    role_group: 'account_manager',
    read_only: false,
    data_scope: 'assigned_accounts',
    metadata: {},
    widgets: [
      {
        key: 'summary',
        title: 'Manager attention summary',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'assigned_accounts',
        primary_route: '/dashboard',
        value: { my_accounts: 5, at_risk: 2, signals_critical_tasks: 4, upcoming_governance: 3 },
        items: [],
        metadata: {
          tiles: [
            { key: 'my_accounts', label: 'My Accounts', value: 5, route: '/accounts', detail: 'Assigned account portfolio.' },
            { key: 'at_risk', label: 'At risk', value: 2, route: '/accounts?risk=critical', detail: 'Warning and critical accounts.' },
            { key: 'signals_critical_tasks', label: 'Signals / Critical tasks', value: 4, route: '/tasks', detail: 'Signals and critical blockers.' },
            { key: 'upcoming_governance', label: 'Upcoming governance', value: 3, route: '/governance', detail: 'Scheduled governance reviews.' },
          ],
        },
        error: null,
      },
      {
        key: 'tasks',
        title: 'Tasks summary',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'assigned_accounts',
        primary_route: '/tasks',
        value: { open: 14, accounts_with_open_tasks: 5, in_progress: 6, assigned_to_me: 6, overdue: 3, due_this_week: 7 },
        items: [{ id: 'task-1', title: 'Follow up on blocker', account_id: 'acc-1', account_name: 'Acme', priority: 'critical', status: 'open', due_at: '2026-06-05T10:00:00Z', route: '/tasks?account_id=acc-1' }],
        metadata: { data_source: 'Task records filtered to: owner = AM or account in assigned list' },
        error: null,
      },
      {
        key: 'opportunities',
        title: 'Opportunities / pipeline',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'assigned_accounts',
        primary_route: '/opportunities',
        value: { open_opportunities: 9, pipeline_value: 840000, stalled: 2, series: [{ label: 'Qualified', value: 300000, display_value: 300000 }] },
        items: [{ id: 'opp-1', title: 'Platform expansion', account_id: 'acc-1', account_name: 'Acme', value: 300000, target_date: '2026-06-20T10:00:00Z', route: '/accounts/acc-1?tab=opportunities' }],
        metadata: { masked: false, stalled_after_days: 90 },
        error: null,
      },
      {
        key: 'account_portfolio',
        title: 'Account portfolio table',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'assigned_accounts',
        primary_route: '/accounts',
        value: null,
        items: [{ id: 'acc-1', account_id: 'acc-1', name: 'Acme', account_name: 'Acme', risk_status: 'warning', health_score: 68, segment: 'Growth', owner: 'Account Manager', next_governance_at: '2026-06-15T10:00:00Z', route: '/accounts/acc-1' }],
        metadata: {},
        error: null,
      },
      {
        key: 'forecast_chart',
        title: 'Forecast chart',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'assigned_accounts',
        primary_route: '/dashboard',
        value: { open_opportunities: 9, pipeline_value: 840000, weighted_forecast: 420000, series: [{ label: 'Qualified', value: 300000, display_value: 300000 }] },
        items: [],
        metadata: { masked: false },
        error: null,
      },
      {
        key: 'governance_calendar',
        title: 'Global / Governance Calendar',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'assigned_accounts',
        primary_route: '/governance',
        value: { upcoming: 1, overdue: 0 },
        items: [],
        metadata: { read_only: false },
        error: null,
      },
    ],
  })
}

describe('Dashboard', () => {
  beforeEach(() => {
    authState.user = {
      id: 'usr-leader',
      name: 'Leadership Viewer',
      email: 'leader@tkxel.com',
      role: 'leadership_viewer',
      avatarInitials: 'LV',
    }
  })

  it('loads the backend-selected role dashboard without dashboard switch buttons', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/governance-events/calendar')) return jsonResponse(calendarPage())
      if (url.includes('/api/dashboards/me')) return jsonResponse(dashboard())
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Leadership Dashboard')).toBeInTheDocument()
    expect(await screen.findByText('Global / Governance Calendar')).toBeInTheDocument()
    expect(screen.getAllByText('Restricted').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /am home/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /kam head portfolio/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /leadership/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh ai data/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Previous$/i })).not.toBeInTheDocument()
    expect(screen.queryByText(/^Page 1$/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Next$/i })).not.toBeInTheDocument()
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/governance-events/calendar'))).toBe(true))
  })

  it('renders the account manager task breakdown and pipeline without duplicate task panels', async () => {
    authState.user = {
      id: 'usr-am',
      name: 'Account Manager',
      email: 'am@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/governance-events/calendar')) return jsonResponse(calendarPage())
      if (url.includes('/api/dashboards/me')) return jsonResponse(accountManagerDashboard())
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await screen.findByText('AM Home')
    expect(screen.getByRole('link', { name: /my accounts/i })).toHaveAttribute('href', '/accounts')
    expect(screen.getByRole('link', { name: /at risk/i })).toHaveAttribute('href', '/accounts?risk=critical')
    expect(screen.getByText('Full task status breakdown across assigned accounts')).toBeInTheDocument()
    expect(screen.getByText('Task records filtered to: owner = AM or account in assigned list')).toBeInTheDocument()
    expect(screen.getByText('Task completion does NOT improve health scores; only underlying account data changes do.')).toBeInTheDocument()
    expect(screen.getByText('Active opportunities across assigned accounts')).toBeInTheDocument()
    expect(screen.getByText('Opportunity records filtered to assigned accounts; stage not Won/Lost')).toBeInTheDocument()
    expect(screen.getByText('Opportunity with no recorded update > 90 days surfaces as a signal')).toBeInTheDocument()
    expect(screen.queryByText('Stale KYC')).not.toBeInTheDocument()
    expect(screen.queryByText('Renewal focus')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh ai data/i })).not.toBeInTheDocument()
  })

  it('shows the no-widgets empty state without fetching calendar data', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/dashboards/me')) return jsonResponse(dashboard({ widgets: [], display_name: 'My Dashboard', dashboard: 'rbac_widgets', role_group: 'rbac' }))
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('No dashboard widgets are available for your role or account scope.')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/governance-events/calendar'))).toBe(false)
  })
})

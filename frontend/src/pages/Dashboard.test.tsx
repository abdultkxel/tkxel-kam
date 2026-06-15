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
        title: '6-Month Revenue Forecast',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'executive',
        primary_route: '/dashboard',
        value: {
          title: '6-Month Revenue Forecast',
          summary: 'Forecast calculated with the shared KAM AI logic. Commercial values are restricted for this role.',
          months: 6,
          confidence: 'medium',
          trend_label: 'stable',
          totals: {
            account_count: 2,
            active_sow_count: 1,
            open_opportunities: 2,
            at_risk_accounts: 1,
            contracted_baseline: 'Restricted',
            baseline_revenue: 'Restricted',
            pipeline_value: 'Restricted',
            weighted_opportunity: 'Restricted',
            growth_adjustment: 'Restricted',
            risk_adjustment: 'Restricted',
            forecast_revenue: 'Restricted',
          },
          points: [
            {
              month: 'Jul 2026',
              baseline_revenue: 'Restricted',
              weighted_opportunity: 'Restricted',
              growth_adjustment: 'Restricted',
              risk_adjustment: 'Restricted',
              forecast_revenue: 'Restricted',
            },
          ],
          missing_data: ['Acme: no active SOW baseline found; account commercial value is used as fallback.'],
          open_opportunities: 2,
          at_risk_accounts: 1,
          pipeline_value: 'Restricted',
          weighted_forecast: 'Restricted',
          series: [{ label: 'Jul 2026', value: 1, display_value: 'Restricted' }],
        },
        items: [],
        metadata: { masked: true, chart_type: 'line' },
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
        value: { my_accounts: 5, at_risk: 2, critical_actions: 4, open_tasks: 14 },
        items: [],
        metadata: {
          tiles: [
            { key: 'my_accounts', label: 'My Accounts', value: 5, route: '/accounts', detail: 'Assigned account portfolio.' },
            { key: 'at_risk', label: 'At risk', value: 2, route: '/accounts?risk=at_risk', detail: 'Warning and critical accounts.' },
            { key: 'critical_actions', label: 'Critical Actions', value: 4, route: '/dashboard#critical-actions', detail: 'Critical tasks and health drops.' },
            { key: 'open_tasks', label: 'Tasks', value: 14, route: '/tasks', detail: 'Tasks assigned to you.' },
          ],
        },
        error: null,
      },
      {
        key: 'critical_actions',
        title: 'Critical Actions',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'assigned_accounts',
        primary_route: '/dashboard#critical-actions',
        value: { total: 4, critical_tasks: 1, health_drops: 1, critical_accounts: 2 },
        items: [
          { id: 'task-critical-1', title: 'Resolve blocked renewal task', source_type: 'task', account_id: 'acc-1', account_name: 'Acme', priority: 'critical', status: 'blocked', due_at: '2026-06-05T10:00:00Z', route: '/tasks?account_id=acc-1' },
          { id: 'eng-1', title: 'Delivery Recovery SOW health dropped to critical', source_type: 'engagement_health', account_id: 'acc-1', account_name: 'Acme', delivery_health: 48, severity: 'critical', risk_reason: 'Delivery health is 48, below the critical threshold of 60', route: '/accounts/acc-1/engagements/eng-1' },
        ],
        metadata: { source_counts: { critical_tasks: 1, health_drops: 1, critical_accounts: 2 } },
        error: null,
      },
      {
        key: 'todays_tasks',
        title: "Today's Tasks",
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'assigned_accounts',
        primary_route: '/tasks?due=today',
        value: { due_today: 1, blocked: 0, overdue: 0 },
        items: [{ id: 'task-today-1', title: 'Today customer action', account_id: 'acc-1', account_name: 'Acme', priority: 'medium', status: 'open', due_at: '2026-06-03T12:00:00Z', route: '/tasks?account_id=acc-1' }],
        metadata: { total: 1 },
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
        metadata: { data_source: 'Showing tasks assigned to you only.' },
        error: null,
      },
      {
        key: 'opportunities',
        title: 'Opportunities & pipeline',
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
        title: '6-Month Revenue Forecast',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'assigned_accounts',
        primary_route: '/dashboard',
        value: { open_opportunities: 9, pipeline_value: 840000, weighted_forecast: 420000, series: [{ label: 'Qualified', value: 300000, display_value: 300000 }] },
        items: [],
        metadata: { masked: false, account_count: 5, account_filter_supported: true },
        error: null,
      },
      {
        key: 'onboarding_drafts',
        title: 'Onboarding drafts',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'assigned_accounts',
        primary_route: '/accounts/onboarding',
        value: { ready_for_review: 1 },
        items: [
          {
            id: 'draft-1',
            title: 'Draft Workspace',
            account_name: 'Draft Workspace',
            project_name: 'Draft customer launch',
            status: 'ready_for_review',
            owner: 'Account Manager',
            confidence: 82,
            created_at: '2026-06-03T10:00:00Z',
            route: '/accounts/onboarding?draft=draft-1',
          },
        ],
        metadata: { total: 1 },
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

function portfolioDashboard() {
  return dashboard({
    dashboard: 'kam_head_portfolio',
    display_name: 'KAM Head Portfolio',
    role_group: 'kam_head',
    read_only: false,
    data_scope: 'portfolio',
    metadata: {},
    widgets: [
      {
        key: 'summary',
        title: 'Portfolio attention summary',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'portfolio',
        primary_route: '/dashboard',
        value: { accounts: 12, at_risk_accounts: 3, critical_actions: 4, open_tasks: 6 },
        items: [],
        metadata: {},
        error: null,
      },
      {
        key: 'ai_task_summary',
        title: 'AI Task Summary',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'portfolio',
        primary_route: '/tasks',
        value: {
          headline: 'Portfolio work queue is active.',
          narrative: 'Open work is visible across the portfolio.',
          top_blockers: ['Review overdue blockers.'],
          recommended_focus: 'Start with overdue tasks.',
          source_counts: { tasks: 6, critical_tasks: 2 },
          refreshed_at: '2026-06-03T10:00:00Z',
        },
        items: [],
        metadata: { manual_refresh: true },
        error: null,
      },
      {
        key: 'opportunities',
        title: 'Opportunities / pipeline',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'portfolio',
        primary_route: '/opportunities',
        value: { open_opportunities: 8, pipeline_value: 640000, stalled: 1, series: [{ label: 'Qualified', value: 240000, display_value: 240000 }] },
        items: [],
        metadata: { masked: false, stalled_after_days: 90 },
        error: null,
      },
      {
        key: 'am_workload',
        title: 'AM workload',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'portfolio',
        primary_route: '/accounts',
        value: null,
        items: [{ owner_id: 'usr-am', owner: 'Account Manager', accounts: 2, status: 'accounts', route: '/accounts?am_id=usr-am' }],
        metadata: {},
        error: null,
      },
    ],
  })
}

function dashboardWithAccountListingWidget() {
  return dashboard({
    display_name: 'KAM Head Portfolio',
    dashboard: 'kam_head_portfolio',
    role_group: 'kam_head',
    read_only: false,
    data_scope: 'portfolio',
    metadata: {},
    widgets: [
      {
        key: 'account_portfolio',
        title: 'Account portfolio table',
        status: 'complete',
        generated_at: '2026-06-03T10:00:00Z',
        data_scope: 'portfolio',
        primary_route: '/accounts',
        value: null,
        items: [
          {
            id: 'acc-hidden',
            account_id: 'acc-hidden',
            name: 'Hidden Account Listing Row',
            account_name: 'Hidden Account Listing Row',
            risk_status: 'warning',
            health_score: 68,
            segment: 'Growth',
            owner: 'Account Manager',
            next_governance_at: '2026-06-15T10:00:00Z',
            route: '/accounts/acc-hidden',
          },
        ],
        metadata: { page: 1, page_size: 1, total: 1 },
        error: null,
      },
    ],
  })
}

function unmaskedForecastWidget() {
  return {
    key: 'forecast_chart',
    title: '6-Month Revenue Forecast',
    status: 'complete',
    generated_at: '2026-06-03T10:00:00Z',
    data_scope: 'portfolio',
    primary_route: '/dashboard',
    value: {
      title: '6-Month Revenue Forecast',
      summary: 'Forecast projects steady growth over the next six months.',
      months: 6,
      confidence: 'high',
      trend_label: 'positive',
      totals: {
        account_count: 2,
        active_sow_count: 2,
        open_opportunities: 3,
        at_risk_accounts: 1,
        contracted_baseline: 66000,
        baseline_revenue: 66000,
        pipeline_value: 120000,
        weighted_opportunity: 42000,
        growth_adjustment: 10500,
        risk_adjustment: 3000,
        forecast_revenue: 115500,
      },
      points: [
        { month: 'Jul 2026', baseline_revenue: 10000, weighted_opportunity: 2500, growth_adjustment: 600, risk_adjustment: 400, forecast_revenue: 12700 },
        { month: 'Aug 2026', baseline_revenue: 10500, weighted_opportunity: 3000, growth_adjustment: 700, risk_adjustment: 425, forecast_revenue: 13775 },
        { month: 'Sep 2026', baseline_revenue: 11000, weighted_opportunity: 3500, growth_adjustment: 850, risk_adjustment: 450, forecast_revenue: 14900 },
        { month: 'Oct 2026', baseline_revenue: 11500, weighted_opportunity: 4000, growth_adjustment: 1000, risk_adjustment: 475, forecast_revenue: 16025 },
        { month: 'Nov 2026', baseline_revenue: 12000, weighted_opportunity: 4500, growth_adjustment: 1150, risk_adjustment: 500, forecast_revenue: 17150 },
        { month: 'Dec 2026', baseline_revenue: 12500, weighted_opportunity: 5000, growth_adjustment: 1300, risk_adjustment: 525, forecast_revenue: 18275 },
      ],
      missing_data: [],
      open_opportunities: 3,
      at_risk_accounts: 1,
      pipeline_value: 120000,
      weighted_forecast: 42000,
      series: [],
    },
    items: [],
    metadata: { masked: false, chart_type: 'line' },
    error: null,
  }
}

function emptyForecastWidget() {
  return {
    key: 'forecast_chart',
    title: '6-Month Revenue Forecast',
    status: 'complete',
    generated_at: '2026-06-03T10:00:00Z',
    data_scope: 'assigned_accounts',
    primary_route: '/dashboard',
    value: {
      title: '6-Month Revenue Forecast',
      summary: 'No reliable forecast can be produced because no authorized revenue source records are available.',
      months: 6,
      scope: 'empty',
      confidence: 'not_available',
      trend_label: 'insufficient_data',
      totals: {
        account_count: 0,
        active_sow_count: 0,
        open_opportunities: 0,
        at_risk_accounts: 0,
        contracted_baseline: 0,
        baseline_revenue: 0,
        pipeline_value: 0,
        weighted_opportunity: 0,
        growth_adjustment: 0,
        risk_adjustment: 0,
        forecast_revenue: 0,
      },
      points: [
        { month: 'Jul 2026', baseline_revenue: 0, weighted_opportunity: 0, growth_adjustment: 0, risk_adjustment: 0, forecast_revenue: 0 },
        { month: 'Aug 2026', baseline_revenue: 0, weighted_opportunity: 0, growth_adjustment: 0, risk_adjustment: 0, forecast_revenue: 0 },
        { month: 'Sep 2026', baseline_revenue: 0, weighted_opportunity: 0, growth_adjustment: 0, risk_adjustment: 0, forecast_revenue: 0 },
        { month: 'Oct 2026', baseline_revenue: 0, weighted_opportunity: 0, growth_adjustment: 0, risk_adjustment: 0, forecast_revenue: 0 },
        { month: 'Nov 2026', baseline_revenue: 0, weighted_opportunity: 0, growth_adjustment: 0, risk_adjustment: 0, forecast_revenue: 0 },
        { month: 'Dec 2026', baseline_revenue: 0, weighted_opportunity: 0, growth_adjustment: 0, risk_adjustment: 0, forecast_revenue: 0 },
      ],
      missing_data: ['No authorized accounts are available in the forecast scope.'],
      open_opportunities: 0,
      at_risk_accounts: 0,
      pipeline_value: 0,
      weighted_forecast: 0,
      series: [],
    },
    items: [],
    metadata: { masked: false, chart_type: 'line' },
    error: null,
  }
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
    expect(await screen.findByText('6-Month Revenue Forecast')).toBeInTheDocument()
    expect(screen.getByText('Forecast calculated with the shared KAM AI logic. Commercial values are restricted for this role.')).toBeInTheDocument()
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

  it('scrolls to the governance calendar when the dashboard hash targets it', async () => {
    const scrollIntoView = vi.fn()
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView
    const requestAnimationFrameSpy = vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => window.setTimeout(() => callback(0), 0))
    const cancelAnimationFrameSpy = vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(id => window.clearTimeout(id))
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    try {
      const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/governance-events/calendar')) return jsonResponse(calendarPage())
        if (url.includes('/api/dashboards/me')) return jsonResponse(dashboard())
        return jsonResponse({})
      })
      vi.stubGlobal('fetch', fetchMock)

      render(
        <MemoryRouter initialEntries={['/dashboard#governance-calendar']}>
          <Dashboard />
        </MemoryRouter>,
      )

      expect(await screen.findByText('Global / Governance Calendar')).toBeInTheDocument()
      expect(document.getElementById('governance-calendar')).toBeInTheDocument()
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' }))
    } finally {
      requestAnimationFrameSpy.mockRestore()
      cancelAnimationFrameSpy.mockRestore()
      Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: originalScrollIntoView })
    }
  })

  it('renders the unmasked six-month forecast graph from backend points', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/dashboards/me')) {
        return jsonResponse(dashboard({
          metadata: { commercial_values_masked: false },
          widgets: [unmaskedForecastWidget()],
        }))
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('6-Month Revenue Forecast')).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Dashboard six-month forecast chart' })).toBeInTheDocument()
    expect(screen.getByText('Forecast projects steady growth over the next six months.')).toBeInTheDocument()
    expect(screen.getByText('Jul')).toBeInTheDocument()
    expect(screen.getByText('Dec')).toBeInTheDocument()
    expect(screen.queryByText('Commercial values masked')).not.toBeInTheDocument()
  })

  it('renders only the forecast warning note when no forecast data is available', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/dashboards/me')) {
        return jsonResponse(dashboard({
          display_name: 'AM Home',
          dashboard: 'am_home',
          role_group: 'account_manager',
          metadata: {},
          widgets: [emptyForecastWidget()],
        }))
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('heading', { name: 'Forecast outlook' })).toBeInTheDocument()
    expect(screen.getByText(/Next 6 months/)).toBeInTheDocument()
    expect(screen.getByText('Insufficient data')).toBeInTheDocument()
    expect(screen.getByText('Forecast notes')).toBeInTheDocument()
    expect(screen.getByText('No authorized accounts are available in the forecast scope.')).toBeInTheDocument()
    expect(screen.queryByText('6-Month Revenue Forecast')).not.toBeInTheDocument()
    expect(screen.queryByText('No reliable forecast can be produced because no authorized revenue source records are available.')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Dashboard six-month forecast chart' })).not.toBeInTheDocument()
    expect(screen.queryByText(/forecast revenue/i)).not.toBeInTheDocument()
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
    expect(screen.getByRole('link', { name: /at risk/i })).toHaveAttribute('href', '/accounts?risk=at_risk')
    expect(screen.getByRole('button', { name: /critical actions/i })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Critical Actions' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: "Today's Tasks" })).toBeInTheDocument()
    expect(screen.getByText('Delivery Recovery SOW health dropped to critical')).toBeInTheDocument()
    expect(screen.getByText('Today customer action')).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /^Open$/i }).map(link => link.getAttribute('href'))).toEqual(expect.arrayContaining(['/tasks?due=today']))
    expect(screen.getByText('Your task status breakdown')).toBeInTheDocument()
    expect(screen.getByText('Showing tasks assigned to you only.')).toBeInTheDocument()
    expect(screen.getByText('Task completion does NOT improve health scores; only underlying account data changes do.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open 14 assigned to you/i })).toHaveAttribute('href', '/tasks?status=open')
    expect(screen.getByRole('link', { name: /in progress 6 assigned to you/i })).toHaveAttribute('href', '/tasks?status=in_progress')
    expect(screen.getByRole('link', { name: /overdue 3 needs action today/i })).toHaveAttribute('href', '/tasks?due=overdue')
    expect(screen.getByRole('link', { name: /due this week 7 assigned to you/i })).toHaveAttribute('href', '/tasks?due=next7')
    expect(screen.getByText('Active opportunities across assigned accounts')).toBeInTheDocument()
    expect(screen.getByText('Opportunities & pipeline')).toBeInTheDocument()
    expect(screen.getByText('Opportunity records filtered to assigned accounts; stage not Won/Lost')).toBeInTheDocument()
    expect(screen.getByText('Opportunity with no recorded update > 90 days surfaces as a signal')).toBeInTheDocument()
    expect(screen.getByText('Open opps')).toBeInTheDocument()
    expect(screen.getByText('Total value')).toBeInTheDocument()
    expect(screen.getByText('Stalled')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open opps 9/i })).toHaveAttribute('href', '/opportunities?openOnly=true')
    expect(screen.getByRole('link', { name: /total value \$840/i })).toHaveAttribute('href', '/opportunities?openOnly=true')
    expect(screen.getByRole('link', { name: /stalled 2 >90 days no move/i })).toHaveAttribute('href', '/opportunities?stalled=true')
    expect(screen.getByText('Onboarding drafts')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Draft Workspace/i })).toHaveAttribute('href', '/accounts/onboarding?draft=draft-1')
    expect(screen.queryByText('Pipeline by stage')).not.toBeInTheDocument()
    expect(screen.queryByText('Stale KYC')).not.toBeInTheDocument()
    expect(screen.queryByText('Renewal focus')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh ai data/i })).not.toBeInTheDocument()
  })

  it('makes generic dashboard summary, task summary, and opportunity tiles clickable', async () => {
    authState.user = {
      id: 'usr-kam',
      name: 'KAM Head',
      email: 'kam@tkxel.com',
      role: 'kam_head',
      avatarInitials: 'KH',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/dashboards/me')) return jsonResponse(portfolioDashboard())
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await screen.findByText('KAM Head Portfolio')
    expect(screen.getByRole('link', { name: /accounts 12/i })).toHaveAttribute('href', '/accounts')
    expect(screen.getByRole('link', { name: /at risk accounts 3/i })).toHaveAttribute('href', '/accounts?risk=at_risk')
    expect(screen.getByRole('button', { name: /critical actions 4/i })).toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /tasks 6/i }).map(link => link.getAttribute('href'))).toContain('/tasks')
    expect(screen.getByRole('link', { name: /critical tasks 2/i })).toHaveAttribute('href', '/tasks?priority=critical')
    expect(screen.getByRole('link', { name: /open opps 8/i })).toHaveAttribute('href', '/opportunities?openOnly=true')
    expect(screen.getByRole('link', { name: /total value \$640/i })).toHaveAttribute('href', '/opportunities?openOnly=true')
    expect(screen.getByRole('link', { name: /stalled 1 >90 days no move/i })).toHaveAttribute('href', '/opportunities?stalled=true')
    expect(screen.getByRole('link', { name: /account manager 2 accounts/i })).toHaveAttribute('href', '/accounts?am_id=usr-am')
  })

  it('does not render dashboard account listing widgets', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input), 'http://localhost')
      if (url.pathname.endsWith('/api/dashboards/me')) {
        return jsonResponse(dashboardWithAccountListingWidget())
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('KAM Head Portfolio')).toBeInTheDocument()
    expect(screen.queryByText('Account portfolio table')).not.toBeInTheDocument()
    expect(screen.queryByText('Hidden Account Listing Row')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /next portfolio page/i })).not.toBeInTheDocument()
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

  it('renders dashboard loading and error states', async () => {
    const pendingFetch = vi.fn(() => new Promise<Response>(() => {}))
    vi.stubGlobal('fetch', pendingFetch)
    const { container, unmount } = render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    await waitFor(() => expect(container.querySelector('.animate-pulse-soft')).toBeInTheDocument())
    unmount()

    const failingFetch = vi.fn(async () => jsonResponse({ detail: 'Forecast dashboard could not be loaded' }, 500))
    vi.stubGlobal('fetch', failingFetch)
    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Forecast dashboard could not be loaded')).toBeInTheDocument()
  })
})

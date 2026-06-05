import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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
    expect(screen.getByText('Next 6 months')).toBeInTheDocument()
    expect(screen.getByText('Insufficient data')).toBeInTheDocument()
    expect(screen.getByText('Forecast notes')).toBeInTheDocument()
    expect(screen.getByText('No authorized accounts are available in the forecast scope.')).toBeInTheDocument()
    expect(screen.queryByText('6-Month Revenue Forecast')).not.toBeInTheDocument()
    expect(screen.queryByText('No reliable forecast can be produced because no authorized revenue source records are available.')).not.toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Dashboard six-month forecast chart' })).not.toBeInTheDocument()
    expect(screen.queryByText(/forecast revenue/i)).not.toBeInTheDocument()
  })

  it('refreshes the AM task summary only when the returned widget allows refresh', async () => {
    authState.user = {
      id: 'usr-am',
      name: 'Account Manager',
      email: 'am@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    }
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/dashboards/am-home/task-summary/refresh') && init?.method === 'POST') {
        return jsonResponse({
          widget: {
            key: 'ai_task_summary',
            title: 'AI Task Summary',
            status: 'complete',
            generated_at: '2026-06-03T10:01:00Z',
            data_scope: 'assigned_accounts',
            primary_route: '/tasks',
            value: {
              headline: 'Updated queue',
              narrative: 'One task needs attention.',
              top_blockers: [],
              recommended_focus: 'Review active work.',
              source_counts: { tasks: 1, signals: 0 },
              refreshed_at: '2026-06-03T10:01:00Z',
            },
            items: [],
            metadata: { manual_refresh: true },
            error: null,
          },
        })
      }
      if (url.includes('/api/dashboards/me')) {
        return jsonResponse(dashboard({
          dashboard: 'am_home',
          display_name: 'AM Home',
          role_group: 'account_manager',
          read_only: false,
          data_scope: 'assigned_accounts',
          widgets: [
            {
              key: 'ai_task_summary',
              title: 'AI Task Summary',
              status: 'complete',
              generated_at: '2026-06-03T10:00:00Z',
              data_scope: 'assigned_accounts',
              primary_route: '/tasks',
              value: {
                headline: 'Review active work',
                narrative: 'One task needs attention.',
                top_blockers: [],
                recommended_focus: 'Review active work.',
                source_counts: { tasks: 1, signals: 0 },
                refreshed_at: '2026-06-03T10:00:00Z',
              },
              items: [],
              metadata: { manual_refresh: true },
              error: null,
            },
          ],
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

    await screen.findByText('AM Home')
    await userEvent.click(screen.getByRole('button', { name: /refresh ai data/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/dashboards/am-home/task-summary/refresh'))).toBe(true))
    expect(await screen.findByText('Updated queue')).toBeInTheDocument()
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

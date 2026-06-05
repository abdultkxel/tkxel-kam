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
})

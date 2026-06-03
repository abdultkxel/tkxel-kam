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
    ],
    ...overrides,
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
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toContain('/api/dashboards/me')
      return jsonResponse(dashboard())
    }))

    render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Leadership Dashboard')).toBeInTheDocument()
    expect(screen.getAllByText('Restricted').length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: /am home/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /kam head portfolio/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /leadership/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh ai data/i })).not.toBeInTheDocument()
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
})

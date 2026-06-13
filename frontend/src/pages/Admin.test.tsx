import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Admin } from '@/pages/Admin'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const roles = [
  {
    id: 'role-1',
    slug: 'super_admin',
    name: 'Super Admin',
    description: 'Full access',
    is_system: true,
    permissions: [],
    created_at: '2026-05-29T00:00:00Z',
    updated_at: '2026-05-29T00:00:00Z',
  },
]

const integrations = [
  {
    id: 'int-google',
    provider: 'google_calendar',
    name: 'Google Calendar',
    enabled: true,
    status: 'connected',
    auth_type: 'oauth',
    settings_json: {},
    credential_status: { configured: true },
    scopes: [],
    last_test_status: 'success',
    failure_count: 0,
    last_synced_at: '2026-06-13T10:00:00Z',
    last_error: null,
    created_at: '2026-06-13T00:00:00Z',
    updated_at: '2026-06-13T00:00:00Z',
  },
  {
    id: 'int-ai',
    provider: 'ai_llm_gateway',
    name: 'AI/LLM Gateway',
    enabled: true,
    status: 'error',
    auth_type: 'api_key',
    settings_json: {},
    credential_status: { configured: false },
    scopes: [],
    last_test_status: 'failed',
    failure_count: 1,
    last_synced_at: null,
    last_error: 'Health check failed',
    created_at: '2026-06-13T00:00:00Z',
    updated_at: '2026-06-13T00:00:00Z',
  },
]

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function paginated<T>(items: T[]) {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 10,
    pages: items.length ? 1 : 0,
  }
}

describe('Admin', () => {
  function stubAdminFetch() {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/settings/allowed-email-domains')) return jsonResponse({ domains: ['tkxel.com'], domains_input: 'tkxel.com', duplicates_removed: false })
      if (url.includes('/api/admin/settings/security-alert-email')) return jsonResponse({ administration_email: 'admin@tkxel.com' })
      if (url.includes('/api/admin/system-health')) return jsonResponse({ status: 'healthy', generated_at: '2026-06-13T00:00:00Z', checks: [], metrics: { workers_failed: 0 } })
      if (url.includes('/api/alerts?')) return jsonResponse({ ...paginated([]), total: 2, pages: 1 })
      if (url.includes('/api/admin/audit-logs/export')) return jsonResponse({ filename: 'audit-logs.csv', rows: [], total: 0 })
      if (url.includes('/api/admin/audit-logs')) return jsonResponse(paginated([]))
      if (url.includes('/api/admin/job-logs')) return jsonResponse({ ...paginated([]), total: 1, pages: 1 })
      if (url.includes('/api/admin/error-logs')) return jsonResponse(paginated([]))
      if (url.includes('/api/admin/integrations/sync-logs')) return jsonResponse(paginated([]))
      if (url.includes('/api/admin/integrations/imported-items')) return jsonResponse(paginated([]))
      if (url.endsWith('/api/admin/integrations')) return jsonResponse(integrations)
      if (url.includes('/api/admin/notification-defaults')) return jsonResponse({ items: [] })
      if (url.includes('/api/admin/notification-scheduler/runs')) return jsonResponse(paginated([]))
      if (url.includes('/api/admin/sla-rules')) return jsonResponse(paginated([]))
      if (url.endsWith('/api/admin/alert-rules')) return jsonResponse([])
      if (url.includes('/api/admin/users')) return jsonResponse(paginated([]))
      if (url.includes('/api/admin/roles')) return jsonResponse(paginated(roles))
      if (url.endsWith('/api/admin/permissions')) return jsonResponse([])
      return jsonResponse({})
    }))
  }

  it('uses tabs so only the selected admin section is shown', async () => {
    stubAdminFetch()

    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Users Management')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('tab', { name: /^roles$/i }))

    expect(await screen.findByText('Roles Management')).toBeInTheDocument()
    expect(screen.queryByText('Users Management')).not.toBeInTheDocument()
    expect(screen.getByRole('tab', { name: /^roles$/i })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens detail sections from the admin status tiles', async () => {
    stubAdminFetch()
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <Admin />
      </MemoryRouter>,
    )

    expect(await screen.findByRole('button', { name: /open system health details/i })).toHaveTextContent('Healthy')
    expect(screen.getByRole('button', { name: /open active alerts details/i })).toHaveTextContent('2')
    expect(screen.getByRole('button', { name: /open integration health details/i })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: /open failed jobs details/i })).toHaveTextContent('1')
    expect(screen.queryByRole('button', { name: /open email triggers details/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /open integration health details/i }))
    expect(await screen.findByText(/external integrations/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /open active alerts details/i }))
    expect(await screen.findByRole('heading', { name: /^Alert Rules$/i })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /open system health details/i }))
    expect(await screen.findByText(/audit, jobs, and system health/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /open failed jobs details/i }))
    expect(await screen.findByText(/recent jobs/i)).toBeInTheDocument()
  })

  it('removes the Admin Timeline tab, status tile, and type editor', async () => {
    stubAdminFetch()

    render(
      <MemoryRouter initialEntries={['/admin?section=timeline']}>
        <Admin />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Users Management')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /^timeline$/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /open timeline types details/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Account timeline')).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/event type name/i)).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([input]) => String(input).includes('/api/admin/timeline-event-types'))).toBe(false)
  })

  it('removes the retired Admin Segments tab and falls back to Users', async () => {
    stubAdminFetch()

    render(
      <MemoryRouter initialEntries={['/admin?section=segments']}>
        <Admin />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Users Management')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /^segments$/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Add segment tag')).not.toBeInTheDocument()
    expect(screen.queryByText('Account Settings')).not.toBeInTheDocument()
  })

  it('removes the mock Admin Policies tab and falls back to Users', async () => {
    stubAdminFetch()

    render(
      <MemoryRouter initialEntries={['/admin?section=policies']}>
        <Admin />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Users Management')).toBeInTheDocument()
    expect(screen.queryByRole('tab', { name: /^policies$/i })).not.toBeInTheDocument()
    expect(screen.queryByText('Sensitive Entry Policies')).not.toBeInTheDocument()
    expect(screen.queryByText('Policy and access audit')).not.toBeInTheDocument()
    expect(screen.queryByText(/Ali Khan requested access/i)).not.toBeInTheDocument()
  })
})

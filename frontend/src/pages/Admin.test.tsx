import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Admin } from '@/pages/Admin'
import { useAccountStore } from '@/stores/accountStore'

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

const createdTimelineType = {
  id: 'cfg-manual',
  slug: 'manual_note',
  name: 'Testing',
  category: 'manual',
  module: 'manual',
  color_token: 'surface-border',
  display_order: 0,
  default_visibility: 'public',
  retention_policy_id: null,
  is_active: true,
  is_critical: false,
  critical_rule_json: {},
  created_at: '2026-06-11T00:00:00Z',
  updated_at: '2026-06-11T00:00:00Z',
}

describe('Admin', () => {
  function stubAdminFetch() {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/settings/allowed-email-domains')) return jsonResponse({ domains: ['tkxel.com'], domains_input: 'tkxel.com', duplicates_removed: false })
      if (url.endsWith('/api/admin/timeline-event-types') && init?.method === 'POST') return jsonResponse(createdTimelineType)
      if (url.includes('/api/admin/timeline-event-types')) return jsonResponse(paginated([]))
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

  it('explains timeline controls, shows an empty type editor, and links to the account timeline tab', async () => {
    stubAdminFetch()
    useAccountStore.setState({ accounts: [{ id: 'acct-1', name: 'Acme' }] as never })

    render(
      <MemoryRouter initialEntries={['/admin?section=timeline']}>
        <Admin />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Account timeline')).toBeInTheDocument()
    expect(screen.queryByText(/FR-87 \/ FR-96/i)).not.toBeInTheDocument()
    expect(screen.getByText(/Timeline is the account history layer/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open account timeline/i })).toHaveAttribute('href', '/accounts/acct-1?tab=timeline')
    expect(screen.getByPlaceholderText(/event type name/i)).toBeInTheDocument()
    expect(screen.getByText(/colour swatch/i)).toBeInTheDocument()
    expect(screen.getByText(/no timeline types configured yet/i)).toBeInTheDocument()
  })

  it('uses the selected event type slug when creating timeline types', async () => {
    stubAdminFetch()
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/admin?section=timeline']}>
        <Admin />
      </MemoryRouter>,
    )

    await screen.findByText('Account timeline')
    await user.type(screen.getByPlaceholderText(/event type name/i), 'Testing')
    await user.click(screen.getByRole('button', { name: /^add$/i }))

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/timeline-event-types'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          slug: 'manual_note',
          name: 'Testing',
          module: 'manual',
          category: 'manual',
        }),
      }),
    )
  })
})

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
  it('uses tabs so only the selected admin section is shown', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/admin/users')) return jsonResponse(paginated([]))
      if (url.includes('/api/admin/roles')) return jsonResponse(paginated(roles))
      if (url.endsWith('/api/admin/permissions')) return jsonResponse([])
      return jsonResponse({})
    }))

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
})

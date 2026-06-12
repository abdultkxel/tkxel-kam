import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminRolesPanel } from '@/components/admin/AdminRolesPanel'
import { toast } from 'sonner'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const permissions = [
  {
    id: 'perm-1',
    module: 'access_admin',
    action: 'manage_roles',
    key: 'access_admin:manage_roles',
    section_name: 'Access Administration',
    section_purpose: 'Controls users and roles.',
    action_label: 'Manage roles',
    description: 'Create, update, delete, or grant permissions to roles.',
    risk_level: 'critical',
    dependencies: ['access_admin:view_roles'],
    tags: ['admin'],
    display_order: 3604,
  },
  {
    id: 'perm-2',
    module: 'accounts',
    action: 'view_assigned',
    key: 'accounts:view_assigned',
    section_name: 'Accounts',
    section_purpose: 'Controls account visibility.',
    action_label: 'View assigned accounts',
    description: 'See assigned account records.',
    risk_level: 'low',
    dependencies: [],
    tags: ['scope:assigned'],
    display_order: 101,
  },
]

const roles = [
  {
    id: 'role-1',
    slug: 'super_admin',
    name: 'Super Admin',
    description: 'Full access',
    is_system: true,
    permissions: permissions.map(permission => ({ permission, allowed: true })),
    created_at: '2026-05-29T00:00:00Z',
    updated_at: '2026-05-29T00:00:00Z',
  },
  {
    id: 'role-2',
    slug: 'regional_director',
    name: 'Regional Director',
    description: 'Regional governance',
    is_system: false,
    permissions: [{ permission: permissions[1], allowed: true }],
    created_at: '2026-05-29T00:00:00Z',
    updated_at: '2026-05-29T00:00:00Z',
  },
]

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function paginated<T>(items: T[], page = 1, pageSize = 10) {
  return {
    items,
    total: items.length,
    page,
    page_size: pageSize,
    pages: items.length ? Math.ceil(items.length / pageSize) : 0,
  }
}

function setupFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/api/admin/roles') && method === 'GET') return jsonResponse(paginated(roles))
    if (url.endsWith('/api/admin/permissions') && method === 'GET') return jsonResponse(permissions)
    if (url.endsWith('/api/admin/roles') && method === 'POST') {
      return jsonResponse({ ...roles[1], slug: 'portfolio_viewer', name: 'Portfolio Viewer', permissions: [] }, 201)
    }
    if (url.endsWith('/api/admin/roles/portfolio_viewer/permissions') && method === 'PUT') {
      return jsonResponse({
        ...roles[1],
        slug: 'portfolio_viewer',
        name: 'Portfolio Viewer',
        permissions: permissions.slice(0, 2).map(permission => ({ permission, allowed: true })),
      })
    }
    if (url.endsWith('/api/admin/roles/regional_director') && method === 'DELETE') {
      return jsonResponse({ message: 'Role deleted successfully' })
    }
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AdminRolesPanel', () => {
  it('creates a role with permissions from the same form', async () => {
    const fetchMock = setupFetch()
    render(<AdminRolesPanel />)

    expect(await screen.findByText('Regional Director')).toBeInTheDocument()
    expect(screen.getByText('Super Admin')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /create role/i }))
    await userEvent.type(screen.getByLabelText(/slug/i), 'portfolio_viewer')
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Portfolio Viewer')
    await userEvent.click(screen.getByRole('button', { name: /portfolio admin/i }))
    await userEvent.click(screen.getByRole('button', { name: /save role/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/admin/roles/portfolio_viewer/permissions'))).toBe(true))
    const permissionCall = fetchMock.mock.calls.find(call => String(call[0]).endsWith('/api/admin/roles/portfolio_viewer/permissions'))
    expect(JSON.parse(String(permissionCall?.[1]?.body))).toEqual({
      permissions: [
        { module: 'access_admin', action: 'manage_roles', allowed: true },
        { module: 'accounts', action: 'view_assigned', allowed: true },
      ],
    })
    expect(toast.success).toHaveBeenCalledWith('Role created successfully')
  })

  it('confirms and deletes a custom role', async () => {
    const fetchMock = setupFetch()
    render(<AdminRolesPanel />)

    expect(await screen.findByText('Regional Director')).toBeInTheDocument()
    const regionalDirectorRow = screen.getByText('Regional Director').closest('tr') as HTMLElement
    await userEvent.click(within(regionalDirectorRow).getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /^delete$/i }).at(-1) as HTMLElement)

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/admin/roles/regional_director'))).toBe(true))
    expect(toast.success).toHaveBeenCalledWith('Role deleted successfully')
  })

  it('requests roles with search, type, and page size filters', async () => {
    const fetchMock = setupFetch()
    render(<AdminRolesPanel />)

    expect(await screen.findByText('Regional Director')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText(/search by slug, name, or description/i), 'regional')
    await userEvent.selectOptions(screen.getByLabelText(/filter roles by type/i), 'custom')
    await userEvent.selectOptions(screen.getByLabelText(/roles per page/i), '5')

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const url = String(call[0])
      return (
        url.includes('/api/admin/roles?') &&
        url.includes('search=regional') &&
        url.includes('type=custom') &&
        url.includes('page_size=5')
      )
    })).toBe(true))
  })
})

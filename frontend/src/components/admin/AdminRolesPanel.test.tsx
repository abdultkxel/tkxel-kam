import { render, screen, waitFor } from '@testing-library/react'
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
  { id: 'perm-1', module: 'admin_audit_security_rbac', action: 'configure', description: null },
  { id: 'perm-2', module: 'account_overview', action: 'view', description: null },
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

function setupFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.endsWith('/api/admin/roles') && method === 'GET') return jsonResponse(roles)
    if (url.endsWith('/api/admin/permissions') && method === 'GET') return jsonResponse(permissions)
    if (url.endsWith('/api/admin/roles') && method === 'POST') {
      return jsonResponse({ ...roles[1], slug: 'portfolio_viewer', name: 'Portfolio Viewer', permissions: [] }, 201)
    }
    if (url.endsWith('/api/admin/roles/portfolio_viewer/permissions') && method === 'PUT') {
      return jsonResponse({
        ...roles[1],
        slug: 'portfolio_viewer',
        name: 'Portfolio Viewer',
        permissions: [{ permission: permissions[1], allowed: true }],
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
    expect(screen.queryByText('Super Admin')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /create role/i }))
    await userEvent.type(screen.getByLabelText(/slug/i), 'portfolio_viewer')
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Portfolio Viewer')
    await userEvent.click(screen.getByRole('button', { name: /select all permissions/i }))
    await userEvent.click(screen.getByRole('button', { name: /save role/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/admin/roles/portfolio_viewer/permissions'))).toBe(true))
    const permissionCall = fetchMock.mock.calls.find(call => String(call[0]).endsWith('/api/admin/roles/portfolio_viewer/permissions'))
    expect(JSON.parse(String(permissionCall?.[1]?.body))).toEqual({
      permissions: [
        { module: 'admin_audit_security_rbac', action: 'configure', allowed: true },
        { module: 'account_overview', action: 'view', allowed: true },
      ],
    })
    expect(toast.success).toHaveBeenCalledWith('Role created successfully')
  })

  it('confirms and deletes a custom role', async () => {
    const fetchMock = setupFetch()
    render(<AdminRolesPanel />)

    expect(await screen.findByText('Regional Director')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: /^delete$/i }).at(-1) as HTMLElement)

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/admin/roles/regional_director'))).toBe(true))
    expect(toast.success).toHaveBeenCalledWith('Role deleted successfully')
  })
})

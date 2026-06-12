import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminUsersPanel } from '@/components/admin/AdminUsersPanel'
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
  {
    id: 'role-2',
    slug: 'account_manager',
    name: 'Account Manager / KAM',
    description: 'Account owner',
    is_system: true,
    permissions: [],
    created_at: '2026-05-29T00:00:00Z',
    updated_at: '2026-05-29T00:00:00Z',
  },
]

const users = [
  {
    id: 'usr-1',
    email: 'admin@tkxel.com',
    full_name: 'Root Admin',
    role: 'super_admin',
    title: 'Platform Owner',
    phone: null,
    avatar_initials: 'RA',
    is_active: true,
    created_at: '2026-05-29T00:00:00Z',
    updated_at: '2026-05-29T00:00:00Z',
  },
  {
    id: 'usr-2',
    email: 'user@tkxel.com',
    full_name: 'Managed User',
    role: 'account_manager',
    title: 'KAM',
    phone: null,
    avatar_initials: 'MU',
    is_active: true,
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
    if (url.includes('/api/admin/users') && method === 'GET') return jsonResponse(paginated(users))
    if (url.includes('/api/admin/roles') && method === 'GET') return jsonResponse(paginated(roles, 1, 100))
    if (url.endsWith('/api/admin/users') && method === 'POST') {
      return jsonResponse(
        {
          message: 'Validation failed',
          errors: [
            { field: 'email', message: 'Value is not a valid email address.' },
            { field: 'full_name', message: 'Full name must be at least 2 characters.' },
          ],
        },
        422,
      )
    }
    if (url.endsWith('/api/admin/users/usr-2') && method === 'DELETE') return jsonResponse({ message: 'User deleted successfully' })
    return jsonResponse({})
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('AdminUsersPanel', () => {
  it('shows backend validation errors in the create user dialog', async () => {
    setupFetch()
    render(<AdminUsersPanel />)

    expect(await screen.findByText('Managed User')).toBeInTheDocument()
    expect(screen.getByText('Root Admin')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
    expect(screen.getByRole('option', { name: /super admin.*protected/i })).toBeDisabled()
    await userEvent.type(screen.getByLabelText(/email/i), 'bad-email')
    await userEvent.type(screen.getByLabelText(/password/i), 'User@12345')
    await userEvent.type(screen.getByLabelText(/full name/i), 'A')
    await userEvent.click(screen.getByRole('button', { name: /save user/i }))

    expect(await screen.findByText('Value is not a valid email address.')).toBeInTheDocument()
    expect(screen.getByText('Full name must be at least 2 characters.')).toBeInTheDocument()
  })

  it('confirms and deletes a user with success feedback', async () => {
    const fetchMock = setupFetch()
    render(<AdminUsersPanel />)

    expect(await screen.findByText('Managed User')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /delete/i }))
    expect(screen.getByText(/this action cannot be undone/i)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/admin/users/usr-2'))).toBe(true))
    expect(toast.success).toHaveBeenCalledWith('User deleted successfully')
  })

  it('requests users with search, status, role, and page size filters', async () => {
    const fetchMock = setupFetch()
    render(<AdminUsersPanel />)

    expect(await screen.findByText('Managed User')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText(/search by email or name/i), 'managed')
    await userEvent.selectOptions(screen.getByLabelText(/filter users by status/i), 'active')
    await userEvent.selectOptions(screen.getByLabelText(/filter users by role/i), 'account_manager')
    await userEvent.selectOptions(screen.getByLabelText(/users per page/i), '5')

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const url = String(call[0])
      return (
        url.includes('/api/admin/users?') &&
        url.includes('search=managed') &&
        url.includes('status=active') &&
        url.includes('role=account_manager') &&
        url.includes('page_size=5')
      )
    })).toBe(true))
  })

  it('submits edited email and displays domain errors from the backend', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.includes('/api/admin/users') && method === 'GET') return jsonResponse(paginated(users))
      if (url.includes('/api/admin/roles') && method === 'GET') return jsonResponse(paginated(roles, 1, 100))
      if (url.endsWith('/api/admin/users/usr-2') && method === 'PATCH') {
        const body = JSON.parse(String(init?.body))
        expect(body.email).toBe('user@outside.com')
        return jsonResponse(
          {
            detail: {
              message: 'Validation failed',
              errors: [{ field: 'email', message: 'Email domain is not allowed. Use an approved company email domain.' }],
            },
          },
          422,
        )
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<AdminUsersPanel />)

    expect(await screen.findByText('Managed User')).toBeInTheDocument()
    const managedUserRow = screen.getByText('Managed User').closest('tr') as HTMLElement
    await userEvent.click(within(managedUserRow).getByRole('button', { name: /edit/i }))
    const emailInput = screen.getByLabelText(/email/i)
    expect(emailInput).toBeEnabled()
    await userEvent.clear(emailInput)
    await userEvent.type(emailInput, 'user@outside.com')
    await userEvent.click(screen.getByRole('button', { name: /save user/i }))

    expect(await screen.findByText('Email domain is not allowed. Use an approved company email domain.')).toBeInTheDocument()
  })
})

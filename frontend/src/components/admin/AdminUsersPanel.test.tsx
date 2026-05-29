import { render, screen, waitFor } from '@testing-library/react'
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
    email: 'admin@tkxelkam.com',
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
    email: 'user@tkxelkam.com',
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

function setupFetch() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.endsWith('/api/admin/users') && method === 'GET') return jsonResponse(users)
    if (url.endsWith('/api/admin/roles') && method === 'GET') return jsonResponse(roles)
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
    expect(screen.queryByText('Root Admin')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /create user/i }))
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
})

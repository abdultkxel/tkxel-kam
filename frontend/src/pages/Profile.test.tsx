import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/contexts/AuthContext'
import { Profile } from '@/pages/Profile'

const apiUser = {
  id: 'usr-1',
  email: 'admin@tkxel.com',
  full_name: 'KAM Super Admin',
  role: 'super_admin',
  title: 'Platform Owner',
  phone: null,
  avatar_initials: 'KA',
  is_active: true,
  created_at: '2026-05-29T00:00:00Z',
  updated_at: '2026-05-29T00:00:00Z',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Profile', () => {
  it('loads, updates profile fields, and changes password', async () => {
    localStorage.setItem('kam.auth.token', 'test-token')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/me')) return jsonResponse(apiUser)
      if (url.endsWith('/api/users/me') && init?.method === 'PATCH') {
        return jsonResponse({ ...apiUser, full_name: 'Updated Admin', title: 'Customer Success Lead', phone: '+1 555 0100' })
      }
      if (url.endsWith('/api/auth/change-password')) return jsonResponse({ message: 'Password updated successfully' })
      return jsonResponse({ message: 'ok' })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </AuthProvider>,
    )

    const nameInput = await screen.findByDisplayValue('KAM Super Admin')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'Updated Admin')
    await userEvent.clear(screen.getByLabelText(/title/i))
    await userEvent.type(screen.getByLabelText(/title/i), 'Customer Success Lead')
    await userEvent.type(screen.getByLabelText(/phone/i), '+1 555 0100')
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/users/me'), expect.objectContaining({ method: 'PATCH' })))

    await userEvent.type(screen.getByLabelText(/current password/i), 'Admin@12345')
    await userEvent.type(screen.getByLabelText(/new password/i), 'Changed@12345')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/auth/change-password'), expect.objectContaining({ method: 'POST' })))
  })

  it('displays backend validation errors at profile and password fields', async () => {
    localStorage.setItem('kam.auth.token', 'test-token')
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/auth/me')) return jsonResponse(apiUser)
      if (url.endsWith('/api/users/me') && init?.method === 'PATCH') {
        return jsonResponse(
          {
            message: 'Validation failed',
            errors: [
              { field: 'full_name', message: 'Full name must be at least 2 characters.' },
              { field: 'phone', message: 'Phone can contain only numbers and punctuation.' },
            ],
          },
          422,
        )
      }
      if (url.endsWith('/api/auth/change-password')) {
        return jsonResponse(
          {
            message: 'Validation failed',
            errors: [
              { field: 'current_password', message: 'Current password must be at least 8 characters.' },
              { field: 'new_password', message: 'New password must include at least one special character.' },
            ],
          },
          422,
        )
      }
      return jsonResponse({ message: 'ok' })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <MemoryRouter>
          <Profile />
        </MemoryRouter>
      </AuthProvider>,
    )

    const nameInput = await screen.findByDisplayValue('KAM Super Admin')
    await userEvent.clear(nameInput)
    await userEvent.type(nameInput, 'A')
    await userEvent.type(screen.getByLabelText(/phone/i), 'invalid-phone')
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }))

    expect(await screen.findByText('Full name must be at least 2 characters.')).toBeInTheDocument()
    expect(screen.getByText('Phone can contain only numbers and punctuation.')).toBeInTheDocument()
    expect(nameInput).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/phone/i)).toHaveAttribute('aria-invalid', 'true')

    await userEvent.type(screen.getByLabelText(/current password/i), 'short')
    await userEvent.type(screen.getByLabelText(/new password/i), 'NoSymbol123')
    await userEvent.click(screen.getByRole('button', { name: /update password/i }))

    expect(await screen.findByText('Current password must be at least 8 characters.')).toBeInTheDocument()
    expect(screen.getByText('New password must include at least one special character.')).toBeInTheDocument()
    expect(screen.getByLabelText(/current password/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute('aria-invalid', 'true')
  })
})

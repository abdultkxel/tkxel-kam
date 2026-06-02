import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/contexts/AuthContext'
import { Login } from '@/pages/Login'

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

describe('Login', () => {
  beforeEach(() => {
    localStorage.clear()
    vi.unstubAllGlobals()
  })

  it('authenticates and navigates to the protected workspace', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        access_token: 'test-token',
        token_type: 'bearer',
        user: apiUser,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={<div>Dashboard loaded</div>} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@tkxel.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Admin@12345')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Dashboard loaded')).toBeInTheDocument()
    await waitFor(() => expect(localStorage.getItem('kam.auth.token')).toBe('test-token'))
  })

  it('displays backend validation errors at matching fields', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          message: 'Validation failed',
          errors: [
            { field: 'email', message: 'Enter a valid work email address.' },
            { field: 'password', message: 'Password must include at least one special character.' },
          ],
        },
        422,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )

    await userEvent.type(screen.getByLabelText(/email/i), 'admin')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'password')
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText('Enter a valid work email address.')).toBeInTheDocument()
    expect(screen.getByText('Password must include at least one special character.')).toBeInTheDocument()
    expect(screen.getByLabelText(/email/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByDisplayValue('password')).toHaveAttribute('aria-invalid', 'true')
  })

  it('shows the domain-policy login error from the backend', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'This email domain is not allowed. Contact your administrator.' }, 403)))

    render(
      <AuthProvider>
        <MemoryRouter initialEntries={['/login']}>
          <Routes>
            <Route path="/login" element={<Login />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>,
    )

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@outside.com')
    await userEvent.type(screen.getByLabelText(/^password$/i), 'Admin@12345')
    await userEvent.click(screen.getByRole('button', { name: /^sign in$/i }))

    expect(await screen.findByText('This email domain is not allowed. Contact your administrator.')).toBeInTheDocument()
  })
})

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { AuthProvider } from '@/contexts/AuthContext'
import { ResetPassword } from '@/pages/ResetPassword'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('ResetPassword', () => {
  it('requests a reset token and submits a new password', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.endsWith('/api/auth/forgot-password')) {
        return jsonResponse({ message: 'If the account exists, a reset token has been generated.', reset_token: 'reset-token-1234567890' })
      }
      return jsonResponse({ message: 'Password has been reset successfully' })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <MemoryRouter>
          <ResetPassword />
        </MemoryRouter>
      </AuthProvider>,
    )

    await userEvent.type(screen.getByLabelText(/email/i), 'admin@tkxel.com')
    await userEvent.click(screen.getByRole('button', { name: /generate reset token/i }))

    expect(await screen.findByDisplayValue('reset-token-1234567890')).toBeInTheDocument()

    await userEvent.type(screen.getByLabelText(/new password/i), 'NewAdmin@12345')
    await userEvent.click(screen.getByRole('button', { name: /^reset password$/i }))

    expect(await screen.findByText(/password reset complete/i)).toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('displays backend validation errors at reset fields', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          message: 'Validation failed',
          errors: [
            { field: 'token', message: 'Reset token must be at least 20 characters.' },
            { field: 'new_password', message: 'New password must include at least one number.' },
          ],
        },
        422,
      ),
    )
    vi.stubGlobal('fetch', fetchMock)

    render(
      <AuthProvider>
        <MemoryRouter>
          <ResetPassword />
        </MemoryRouter>
      </AuthProvider>,
    )

    await userEvent.type(screen.getByLabelText(/reset token/i), 'short-token')
    await userEvent.type(screen.getByLabelText(/new password/i), 'NoNumbers!')
    await userEvent.click(screen.getByRole('button', { name: /^reset password$/i }))

    expect(await screen.findByText('Reset token must be at least 20 characters.')).toBeInTheDocument()
    expect(screen.getByText('New password must include at least one number.')).toBeInTheDocument()
    expect(screen.getByLabelText(/reset token/i)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/new password/i)).toHaveAttribute('aria-invalid', 'true')
  })
})

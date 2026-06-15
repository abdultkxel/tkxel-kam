import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AdminSecurityAlertEmailPanel } from '@/components/admin/AdminSecurityAlertEmailPanel'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('AdminSecurityAlertEmailPanel', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and saves the administration alert email from Settings', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/admin/settings/security-alert-email') && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ administration_email: 'alerts@tkxel.io' })
        return jsonResponse({
          administration_email: 'alerts@tkxel.io',
          updated_by_name: 'Admin User',
        })
      }
      return jsonResponse({ administration_email: 'admin@tkxel.com' })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminSecurityAlertEmailPanel />)

    const input = await screen.findByLabelText(/administration alert email/i)
    expect(input).toHaveValue('admin@tkxel.com')

    await userEvent.clear(input)
    await userEvent.type(input, 'alerts@tkxel.io')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => expect(input).toHaveValue('alerts@tkxel.io'))
    expect(screen.getByText('Updated by Admin User')).toBeInTheDocument()
  })

  it('shows backend validation beside the email field', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return jsonResponse(
          {
            detail: {
              message: 'Validation failed',
              errors: [{ field: 'administration_email', message: 'Enter a valid administration alert email.' }],
            },
          },
          422,
        )
      }
      return jsonResponse({ administration_email: 'admin@tkxel.com' })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminSecurityAlertEmailPanel />)

    const input = await screen.findByLabelText(/administration alert email/i)
    await userEvent.clear(input)
    await userEvent.type(input, 'bad-email')
    await userEvent.click(screen.getByRole('button', { name: /^save$/i }))

    expect(await screen.findByText('Enter a valid administration alert email.')).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })
})

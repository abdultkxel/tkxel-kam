import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AllowedEmailDomainsPanel } from '@/components/admin/AllowedEmailDomainsPanel'

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

describe('AllowedEmailDomainsPanel', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads and saves normalized allowed domains', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/admin/settings/allowed-email-domains') && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toEqual({ domains_input: ' TKXEL.COM, tkxel.io, TKXEL.com ' })
        return jsonResponse({
          domains: ['tkxel.com', 'tkxel.io'],
          domains_input: 'tkxel.com, tkxel.io',
          duplicates_removed: true,
        })
      }
      return jsonResponse({
        domains: ['tkxel.com'],
        domains_input: 'tkxel.com',
        duplicates_removed: false,
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AllowedEmailDomainsPanel />)

    const input = await screen.findByLabelText(/allowed domains/i)
    expect(input).toHaveValue('tkxel.com')

    await userEvent.clear(input)
    await userEvent.type(input, ' TKXEL.COM, tkxel.io, TKXEL.com ')
    await userEvent.click(screen.getByRole('button', { name: /save domains/i }))

    await waitFor(() => expect(input).toHaveValue('tkxel.com, tkxel.io'))
    expect(screen.getAllByText('tkxel.com, tkxel.io').length).toBeGreaterThan(0)
  })

  it('shows loading, empty, and validation error states', async () => {
    let resolveGet: (response: Response) => void = () => undefined
    const pendingGet = new Promise<Response>(resolve => {
      resolveGet = resolve
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return jsonResponse(
          {
            detail: {
              message: 'Validation failed',
              errors: [{ field: 'domains_input', message: 'Invalid email domain: *.tkxel.com. Enter domains like tkxel.com or camp1.tkxel.com.' }],
            },
          },
          422,
        )
      }
      return pendingGet
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AllowedEmailDomainsPanel />)

    expect(await screen.findByText('Loading allowed domains.')).toBeInTheDocument()
    resolveGet(jsonResponse({ domains: [], domains_input: '', duplicates_removed: false }))

    const input = await screen.findByLabelText(/allowed domains/i)
    expect(await screen.findByText('No allowed domains configured.')).toBeInTheDocument()

    await userEvent.type(input, '*.tkxel.com')
    await userEvent.click(screen.getByRole('button', { name: /save domains/i }))

    expect(await screen.findByText('Invalid email domain: *.tkxel.com. Enter domains like tkxel.com or camp1.tkxel.com.')).toBeInTheDocument()
  })
})

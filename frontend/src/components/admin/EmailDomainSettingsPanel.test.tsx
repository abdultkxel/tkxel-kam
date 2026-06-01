import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { EmailDomainSettingsPanel } from '@/components/admin/EmailDomainSettingsPanel'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

beforeAll(() => {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('EmailDomainSettingsPanel', () => {
  it('loads settings and previews normalized domains', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({
        raw_input: 'tkxel.com, tkxel.io',
        allowed_domains: ['tkxel.com', 'tkxel.io'],
        active: true,
        updated_by: 'Root Admin',
        updated_at: '2026-06-01T00:00:00Z',
      }),
    ))

    render(<EmailDomainSettingsPanel />)

    expect(screen.getByText(/loading email domain policy/i)).toBeInTheDocument()
    expect(await screen.findByDisplayValue('tkxel.com, tkxel.io')).toBeInTheDocument()
    expect(screen.getByText('tkxel.com')).toBeInTheDocument()
    expect(screen.getByText('tkxel.io')).toBeInTheDocument()
  })

  it('shows empty state and saves updated policy', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return jsonResponse({
          raw_input: 'tkxel.com, @TKXEL.io',
          allowed_domains: ['tkxel.com', 'tkxel.io'],
          active: true,
          updated_by: 'Root Admin',
          updated_at: '2026-06-01T00:00:00Z',
        })
      }
      return jsonResponse({ raw_input: '', allowed_domains: [], active: true, updated_by: null, updated_at: null })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EmailDomainSettingsPanel />)

    expect(await screen.findByText(/no domain restriction/i)).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText(/allowed parent domains/i), 'tkxel.com, @TKXEL.io')
    await userEvent.type(screen.getByLabelText(/reason/i), 'Set Tkxel policy')
    await userEvent.click(screen.getByRole('button', { name: /save policy/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/admin/settings/email-domains'), expect.objectContaining({ method: 'PATCH' })))
    expect(await screen.findByText('tkxel.io')).toBeInTheDocument()
  })

  it('renders backend field errors and preserves input', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PATCH') {
        return jsonResponse({ detail: { message: 'Validation failed', errors: [{ field: 'raw_input', message: 'Invalid domain entries: *.tkxel.com.' }] } }, 422)
      }
      return jsonResponse({ raw_input: 'tkxel.com', allowed_domains: ['tkxel.com'], active: true })
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<EmailDomainSettingsPanel />)

    const input = await screen.findByLabelText(/allowed parent domains/i)
    await userEvent.clear(input)
    await userEvent.type(input, '*.tkxel.com')
    await userEvent.click(screen.getByRole('button', { name: /save policy/i }))

    expect(await screen.findByText('Invalid domain entries: *.tkxel.com.')).toBeInTheDocument()
    expect(screen.getByDisplayValue('*.tkxel.com')).toBeInTheDocument()
  })

  it('shows failed load error with retry action', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Forbidden' }, 403)))

    render(<EmailDomainSettingsPanel />)

    expect(await screen.findByText('Forbidden')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /refresh/i })).toBeInTheDocument()
  })
})

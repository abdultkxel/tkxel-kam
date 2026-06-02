import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { IntegrationsPanel } from '@/components/admin/IntegrationsPanel'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function page<T>(items: T[], total = items.length) {
  return { items, total, page: 1, page_size: 10, pages: total ? 1 : 0 }
}

const integrations = [
  connection('google_calendar', 'Google Calendar', 'configuration_required'),
  connection('fathom', 'Fathom', 'configuration_required'),
  connection('csat', 'CSAT', 'connected', true),
  connection('ai_llm_gateway', 'AI/LLM Gateway', 'configuration_required'),
]

describe('IntegrationsPanel', () => {
  it('loads approved adapters from the API and triggers sync through the backend', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/admin/integrations')) return jsonResponse(integrations)
      if (url.includes('/api/admin/settings/security-alert-email')) return jsonResponse({ administration_email: 'admin@tkxel.com' })
      if (url.includes('/api/admin/integrations/imported-items')) return jsonResponse(page([], 0))
      if (url.includes('/api/admin/integrations/google_calendar/sync') && init?.method === 'POST') {
        return jsonResponse({ provider: 'google_calendar', status: 'connected', created: 1, updated: 0, skipped: 0, errors: 0, message: 'Synced.' })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<IntegrationsPanel />)

    expect(await screen.findByText('Google Calendar')).toBeInTheDocument()
    expect(screen.getByText('Fathom')).toBeInTheDocument()
    expect(screen.getByText('CSAT')).toBeInTheDocument()
    expect(screen.getByText('AI/LLM Gateway')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: /sync/i })[0])

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/admin/integrations/google_calendar/sync'), expect.objectContaining({ method: 'POST' }))
    })
  })
})

function connection(provider: string, name: string, status: string, configured = false) {
  return {
    id: provider,
    provider,
    name,
    enabled: configured,
    status,
    auth_type: provider === 'google_calendar' ? 'oauth2' : 'api_key',
    settings_json: {},
    credential_status: { configured, fields: [], masked: true },
    scopes: [],
    failure_count: 0,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  }
}

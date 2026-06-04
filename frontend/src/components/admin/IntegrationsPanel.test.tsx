import { render, screen, waitFor, within } from '@testing-library/react'
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
  it('loads approved adapters, hides Google inbound sync, and triggers sync for supported adapters', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/admin/integrations')) return jsonResponse(integrations)
      if (url.includes('/api/admin/settings/security-alert-email')) return jsonResponse({ administration_email: 'admin@tkxel.com' })
      if (url.includes('/api/admin/integrations/sync-logs')) return jsonResponse(page([], 0))
      if (url.includes('/api/admin/integrations/imported-items')) return jsonResponse(page([], 0))
      if (url.includes('/api/admin/integrations/fathom/sync') && init?.method === 'POST') {
        return jsonResponse({ provider: 'fathom', status: 'connected', created: 1, updated: 0, skipped: 0, errors: 0, message: 'Synced.' })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<IntegrationsPanel />)

    expect(await screen.findByText('Google Calendar')).toBeInTheDocument()
    expect(screen.getByText('Fathom')).toBeInTheDocument()
    expect(screen.getByText('CSAT')).toBeInTheDocument()
    expect(screen.getByText('AI/LLM Gateway')).toBeInTheDocument()
    const googleCard = screen.getByText('Google Calendar').closest('article')
    expect(googleCard).not.toBeNull()
    expect(within(googleCard as HTMLElement).queryByRole('button', { name: /sync/i })).not.toBeInTheDocument()

    await userEvent.click(within(screen.getByText('Fathom').closest('article') as HTMLElement).getByRole('button', { name: /sync/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/admin/integrations/fathom/sync'), expect.objectContaining({ method: 'POST' }))
    })

    const refreshedGoogleCard = (await screen.findByText('Google Calendar')).closest('article')
    expect(refreshedGoogleCard).not.toBeNull()
    await userEvent.click(within(refreshedGoogleCard as HTMLElement).getByRole('button', { name: /configure/i }))
    expect(screen.queryByLabelText(/Read Calendar ID/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Access token/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /connect google/i })).toBeInTheDocument()
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

import { render, screen } from '@testing-library/react'
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
  it('hides admin-owned adapter cards and the top-right sync refresh icon', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/admin/integrations')) return jsonResponse(integrations)
      if (url.includes('/api/admin/integrations/sync-logs')) return jsonResponse(page([], 0))
      if (url.includes('/api/admin/integrations/ai_llm_gateway/sync') && init?.method === 'POST') {
        return jsonResponse({ provider: 'ai_llm_gateway', status: 'connected', created: 1, updated: 0, skipped: 0, errors: 0, message: 'Synced.' })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<IntegrationsPanel />)

    expect(await screen.findByText('No admin-owned adapters')).toBeInTheDocument()
    expect(screen.getByText('No adapters shown')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /refresh integrations/i })).not.toBeInTheDocument()
    expect(screen.queryByTitle(/refresh integrations/i)).not.toBeInTheDocument()
    expect(screen.queryByText('Google Calendar')).not.toBeInTheDocument()
    expect(screen.queryByText('AI/LLM Gateway')).not.toBeInTheDocument()
    expect(screen.queryByText('Fathom')).not.toBeInTheDocument()
    expect(screen.queryByText('CSAT')).not.toBeInTheDocument()
    expect(screen.queryByText(/fathom meeting links/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/administration alert email/i)).not.toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/admin/settings/security-alert-email'), expect.anything())
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/admin/integrations/imported-items'), expect.anything())
    expect(fetchMock).not.toHaveBeenCalledWith(expect.stringContaining('/api/admin/integrations/ai_llm_gateway/sync'), expect.anything())
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

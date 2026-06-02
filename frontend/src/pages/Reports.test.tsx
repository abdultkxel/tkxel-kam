import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { Reports } from '@/pages/Reports'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 'usr-admin', name: 'Admin', email: 'admin@tkxel.com', role: 'admin', avatarInitials: 'AD' },
  }),
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

function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, page_size: 20, pages: items.length ? 1 : 0 }
}

const fields = [
  { data_source: 'accounts', field: 'name', label: 'Account', field_type: 'text', sortable: true, filterable: true, sensitive: false, custom_field: false },
  { data_source: 'accounts', field: 'risk_status', label: 'Risk', field_type: 'text', sortable: true, filterable: true, sensitive: false, custom_field: false },
  { data_source: 'accounts', field: 'health_overall', label: 'Health', field_type: 'number', sortable: true, filterable: true, sensitive: false, custom_field: false },
]

describe('Reports page', () => {
  it('previews and saves a permission-scoped report', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/reports/fields')) return jsonResponse({ data_sources: ['accounts'], fields })
      if (url.includes('/api/reports?') && !init?.method) return jsonResponse(page([]))
      if (url.endsWith('/api/reports/preview')) {
        expect(JSON.parse(String(init?.body))).toMatchObject({ data_source: 'accounts', fields: ['name', 'risk_status', 'health_overall'] })
        return jsonResponse({ rows: [{ name: 'Signal', risk_status: 'critical', health_overall: 42 }], columns: fields, total: 1, page: 1, page_size: 12, pages: 1, generated_at: '2026-06-02T00:00:00Z' })
      }
      if (url.endsWith('/api/reports') && init?.method === 'POST') {
        return jsonResponse({ id: 'report-1', name: 'Portfolio attention report', visibility: 'private', data_source: 'accounts', fields_json: ['name', 'risk_status', 'health_overall'], filters_json: {}, grouping_json: [], layout_json: {}, export_format: 'csv', updated_at: '2026-06-02T00:00:00Z' }, 201)
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<Reports />)

    expect(await screen.findByText('Report builder')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /preview/i }))
    expect(await screen.findByText('Signal')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /save/i }))
    await waitFor(() => expect(screen.getByText('Portfolio attention report')).toBeInTheDocument())
  })
})

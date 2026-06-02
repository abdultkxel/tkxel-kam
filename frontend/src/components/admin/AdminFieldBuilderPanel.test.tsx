import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminFieldBuilderPanel } from '@/components/admin/AdminFieldBuilderPanel'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

const modules = [
  { slug: 'account_overview', name: 'Account Overview' },
  { slug: 'opportunity_management', name: 'Growth and Opportunity Management' },
]

const field = {
  id: 'field-1',
  module: 'account_overview',
  field_key: 'customer_tier',
  label: 'Customer Tier',
  description: 'Tier configured by account leadership.',
  field_type: 'single_select',
  placeholder: null,
  help_text: null,
  options: ['Gold', 'Silver'],
  validation_rules: {},
  default_value: null,
  is_required: true,
  is_sensitive: false,
  is_active: true,
  show_in_list: true,
  show_in_detail: true,
  sort_order: 5,
  created_by_id: 'usr-admin',
  updated_by_id: 'usr-admin',
  created_at: '2026-05-30T00:00:00Z',
  updated_at: '2026-05-30T00:00:00Z',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function paginated(items: unknown[], page = 1, pageSize = 10, total = items.length) {
  return {
    items,
    total,
    page,
    page_size: pageSize,
    pages: total ? Math.ceil(total / pageSize) : 0,
  }
}

describe('AdminFieldBuilderPanel', () => {
  it('creates a custom field and renders it in the paginated listing', async () => {
    const savedFields = [] as typeof field[]
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/admin/custom-fields/modules')) return jsonResponse(modules)
      if (url.includes('/api/admin/custom-fields') && init?.method === 'POST') {
        const payload = JSON.parse(String(init.body))
        savedFields.push({ ...field, ...payload, id: 'field-1' })
        return jsonResponse(savedFields[0], 201)
      }
      if (url.includes('/api/admin/custom-fields')) return jsonResponse(paginated(savedFields))
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminFieldBuilderPanel />)

    expect(await screen.findByText('No custom fields match the current filters.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /create field/i }))
    await userEvent.type(screen.getByLabelText(/^Label$/i), 'Customer Tier')
    await userEvent.selectOptions(screen.getByLabelText(/field type/i), 'single_select')
    await userEvent.type(screen.getByLabelText(/options/i), 'Gold\nSilver')
    await userEvent.click(screen.getByLabelText(/required/i))
    await userEvent.click(screen.getByRole('button', { name: /save field/i }))

    expect(await screen.findByText('Customer Tier')).toBeInTheDocument()
    expect(screen.getByText('customer_tier')).toBeInTheDocument()
    expect(screen.getAllByText('Account Overview').length).toBeGreaterThan(0)
    expect(fetchMock.mock.calls.some(call => {
      const [, init] = call
      if (init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.field_key === 'customer_tier' && payload.options.length === 2 && payload.is_required === true
    })).toBe(true)
  })

  it('shows backend validation errors at matching form fields', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/admin/custom-fields/modules')) return jsonResponse(modules)
      if (url.includes('/api/admin/custom-fields') && init?.method === 'POST') {
        return jsonResponse({
          message: 'Validation failed',
          errors: [{ field: 'field_key', message: 'Field key must use snake_case lowercase letters, numbers, and underscores.' }],
        }, 422)
      }
      if (url.includes('/api/admin/custom-fields')) return jsonResponse(paginated([]))
      return jsonResponse({})
    }))

    render(<AdminFieldBuilderPanel />)

    await screen.findByText('No custom fields match the current filters.')
    await userEvent.click(screen.getByRole('button', { name: /create field/i }))
    await userEvent.type(screen.getByLabelText(/^Label$/i), 'Customer Tier')
    await userEvent.clear(screen.getByLabelText(/field key/i))
    await userEvent.type(screen.getByLabelText(/field key/i), 'Bad Key')
    await userEvent.click(screen.getByRole('button', { name: /save field/i }))

    expect(await screen.findByText('Field key must use snake_case lowercase letters, numbers, and underscores.')).toBeInTheDocument()
  })

  it('sends search, filters, sorting, and pagination to the API', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input))
      if (url.pathname.endsWith('/api/admin/custom-fields/modules')) return jsonResponse(modules)
      if (url.pathname.endsWith('/api/admin/custom-fields')) {
        const page = Number(url.searchParams.get('page') ?? '1')
        const pageSize = Number(url.searchParams.get('page_size') ?? '10')
        return jsonResponse(paginated([field], page, pageSize, 11))
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminFieldBuilderPanel />)

    expect(await screen.findByText('Customer Tier')).toBeInTheDocument()
    await userEvent.type(screen.getByPlaceholderText(/search label/i), 'tier')
    await userEvent.selectOptions(screen.getByLabelText(/filter fields by module/i), 'account_overview')
    await userEvent.selectOptions(screen.getByLabelText(/filter fields by type/i), 'single_select')
    await userEvent.selectOptions(screen.getByLabelText(/filter fields by status/i), 'active')
    await userEvent.selectOptions(screen.getByLabelText(/sort fields/i), 'label')
    await userEvent.selectOptions(screen.getByLabelText(/sort direction/i), 'desc')
    await userEvent.click(screen.getByRole('button', { name: /next/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const url = String(call[0])
      return (
        url.includes('/api/admin/custom-fields?') &&
        url.includes('search=tier') &&
        url.includes('module=account_overview') &&
        url.includes('field_type=single_select') &&
        url.includes('status=active') &&
        url.includes('sort=label') &&
        url.includes('direction=desc') &&
        url.includes('page=2')
      )
    })).toBe(true))
  })
})

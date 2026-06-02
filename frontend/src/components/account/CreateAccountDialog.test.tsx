import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { CreateAccountDialog } from '@/components/account/CreateAccountDialog'
import { toast } from 'sonner'

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

function apiDraft(status: 'ready_for_review' | 'approved' = 'ready_for_review') {
  return {
    id: 'draft-1',
    status,
    extraction_status: 'completed',
    account_name: 'Acme Corp',
    project_name: 'Customer intelligence',
    company_url: 'https://acme.example.com',
    lifecycle_status: 'Onboarding',
    segment: 'Growth',
    region: 'Global',
    commercial_value: 0,
    currency: 'USD',
    primary_owner_id: 'usr-am',
    primary_owner_name: 'Account Manager KAM',
    primary_owner_email: 'account.manager.user@tkxel.com',
    confidence: 82,
    missing_fields: [],
    conflicts: [],
    source_citation: 'Charter p1: source-backed intake.',
    created_by_name: 'Admin',
    approved_account_id: status === 'approved' ? 'acct-1' : null,
    created_at: '2026-05-30T00:00:00Z',
    updated_at: '2026-05-30T00:00:00Z',
    source_documents: [
      {
        id: 'doc-1',
        account_id: null,
        engagement_id: null,
        draft_id: 'draft-1',
        title: 'Acme Charter',
        source_type: 'project_charter',
        uploaded_by_name: 'Admin',
        extraction_status: 'completed',
        confidence: 82,
        pages: 1,
        is_sensitive: false,
        created_at: '2026-05-30T00:00:00Z',
        updated_at: '2026-05-30T00:00:00Z',
        citations: [{ id: 'cit-1', source_document_id: 'doc-1', label: 'Charter p1', page_number: 1, excerpt: 'Acme Corp' }],
      },
    ],
    engagement_drafts: [],
  }
}

const customFields = [
  {
    id: 'field-1',
    module: 'account_overview',
    field_key: 'customer_tier',
    label: 'Customer Tier',
    description: 'Tier from Admin Field Builder.',
    field_type: 'single_select',
    placeholder: null,
    help_text: null,
    options: ['Gold', 'Silver'],
    is_required: true,
    is_sensitive: false,
    show_in_list: true,
    show_in_detail: true,
    sort_order: 1,
  },
]

async function fillForm() {
  await userEvent.click(screen.getByRole('button', { name: /create account/i }))
  await userEvent.type(screen.getByLabelText(/name of account/i), 'Acme Corp')
  await userEvent.type(screen.getByLabelText(/name of project/i), 'Customer intelligence')
  await userEvent.type(screen.getByLabelText(/company url/i), 'https://acme.example.com')
}

describe('CreateAccountDialog', () => {
  it('creates an onboarding draft before navigating to onboarding review', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse([])
      if (url.endsWith('/api/onboarding/drafts') && method === 'POST') return jsonResponse(apiDraft())
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <Routes>
          <Route path="/accounts" element={<CreateAccountDialog />} />
          <Route path="/accounts/onboarding" element={<div>Onboarding review loaded</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }))

    expect(await screen.findByText('Onboarding review loaded')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/onboarding/drafts/draft-1/approve'))).toBe(false)
    expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/onboarding/drafts') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return (
        Array.isArray(payload.engagement_drafts) &&
        payload.engagement_drafts.length === 1 &&
        payload.engagement_drafts[0].name === 'Customer intelligence' &&
        payload.engagement_drafts[0].service_lines?.[0] === 'Account onboarding'
      )
    })).toBe(true)
    expect(toast.success).toHaveBeenCalledWith('Account draft created for onboarding review.')
  })

  it('shows backend validation errors at matching account fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse([])
        return jsonResponse(
          {
            detail: {
              message: 'Draft approval validation failed',
              errors: [
                { field: 'account_name', message: 'Account name is already in review.' },
                { field: 'project_name', message: 'Project name needs source evidence.' },
              ],
            },
          },
          422,
        )
      }),
    )

    render(
      <MemoryRouter>
        <CreateAccountDialog />
      </MemoryRouter>,
    )

    await fillForm()
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }))

    expect(await screen.findByText('Account name is already in review.')).toBeInTheDocument()
    expect(screen.getByText('Project name needs source evidence.')).toBeInTheDocument()
  })

  it('renders Field Builder fields and submits their values with account creation', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse(customFields)
      if (url.endsWith('/api/onboarding/drafts') && method === 'POST') return jsonResponse(apiDraft())
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/accounts']}>
        <Routes>
          <Route path="/accounts" element={<CreateAccountDialog />} />
          <Route path="/accounts/onboarding" element={<div>Onboarding review loaded</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await fillForm()
    expect(await screen.findByLabelText(/customer tier/i)).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText(/customer tier/i), 'Gold')
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }))

    await screen.findByText('Onboarding review loaded')
    expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/onboarding/drafts') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.custom_field_values?.customer_tier === 'Gold'
    })).toBe(true)
  })
})

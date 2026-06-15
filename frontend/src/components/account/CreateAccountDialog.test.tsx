import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CreateAccountDialog } from '@/components/account/CreateAccountDialog'
import { toast } from 'sonner'

const mockedAuth = vi.hoisted(() => ({
  user: {
    id: 'usr-admin',
    name: 'Admin User',
    email: 'admin@example.com',
    role: 'super_admin',
    avatarInitials: 'AU',
  },
  capabilities: {
    permission_keys: ['onboarding:create_draft', 'onboarding:assign_owner', 'source_documents:upload'],
    can_access_admin: true,
    can_view_portfolio: true,
    can_update_assigned_accounts: true,
    can_update_portfolio_accounts: true,
    can_assign_account_owners: true,
    can_approve_onboarding: true,
    can_view_sensitive_sources: true,
    can_manage_sensitive_sources: true,
    can_approve_kyc: true,
    can_moderate_timeline: true,
    can_export_reports: true,
    can_configure_playbooks: true,
    can_manage_tasks_portfolio: true,
  },
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token', user: mockedAuth.user, capabilities: mockedAuth.capabilities }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

vi.mock('@/components/ui/RichTextEditor', () => ({
  RichTextEditor: ({
    value,
    onChange,
    disabled,
    ariaLabel,
    placeholder,
  }: {
    value: string
    onChange: (value: string) => void
    disabled?: boolean
    ariaLabel?: string
    placeholder?: string
  }) => (
    <textarea
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={event => onChange(event.target.value)}
    />
  ),
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
    linkedin_url: 'https://www.linkedin.com/company/acme-corp',
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
        extracted_text: 'Page 1\nAcme Corp Statement of Work\nScope  includes customer intelligence modernization.\nRenewal Terms\nAuto renewal requires 90 days notice.',
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

function apiUploadExtraction() {
  return {
    account_name: 'Acme Corp',
    project_name: 'Customer intelligence',
    company_url: 'https://acme.example.com',
    linkedin_url: 'https://www.linkedin.com/company/acme-corp',
    confidence: 82,
    missing_fields: [],
    conflicts: [],
    source_citation: 'Acme_SOW.pdf: onboarding fields inferred from extracted document text.',
    source_file_names: ['Acme_SOW.pdf'],
    extraction_status: 'completed',
  }
}

function apiManagers() {
  return [
    {
      id: 'usr-am',
      email: 'account.manager.user@tkxel.com',
      full_name: 'Account Manager KAM',
      role: 'account_manager',
      title: 'Account Manager / KAM',
      avatar_initials: 'AM',
      primary_google_calendar_id: 'account.manager.user@tkxel.com',
      is_active: true,
      created_at: '2026-05-30T00:00:00Z',
      updated_at: '2026-05-30T00:00:00Z',
    },
  ]
}

const customFields = [
  {
    id: 'field-1',
    module: 'accounts',
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
  await userEvent.type(screen.getByLabelText(/linkedin url/i), 'https://www.linkedin.com/company/acme-corp')
  await userEvent.selectOptions(await screen.findByLabelText(/account manager/i), 'usr-am')
}

describe('CreateAccountDialog', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', { value: vi.fn(() => 'blob:preview'), configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: vi.fn(), configurable: true })
  })

  it('creates an onboarding draft before navigating to onboarding review', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse([])
      if (url.endsWith('/api/onboarding/account-managers') && method === 'GET') return jsonResponse(apiManagers())
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
        payload.engagement_drafts[0].service_lines?.[0] === 'Account onboarding' &&
        payload.primary_owner_id === 'usr-am' &&
        payload.linkedin_url === 'https://www.linkedin.com/company/acme-corp'
      )
    })).toBe(true)
    expect(toast.success).toHaveBeenCalledWith('Account draft created for onboarding review.')
  })

  it('uploads SOW files, auto-fills fields without showing the extraction preview, and opens onboarding', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse([])
      if (url.endsWith('/api/onboarding/account-managers') && method === 'GET') return jsonResponse(apiManagers())
      if (url.endsWith('/api/onboarding/uploads/extract') && method === 'POST') return jsonResponse(apiUploadExtraction())
      if (url.endsWith('/api/onboarding/drafts/upload') && method === 'POST') return jsonResponse(apiDraft())
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

    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    await userEvent.selectOptions(await screen.findByLabelText(/account manager/i), 'usr-am')
    await userEvent.upload(screen.getByLabelText(/upload sow or project charter/i), new File(['%PDF-1.4'], 'Acme_SOW.pdf', { type: 'application/pdf' }))

    expect(await screen.findByText('Details filled from the uploaded source.')).toBeInTheDocument()
    expect(screen.queryByText('SOW extraction preview')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Extracted document data')).not.toBeInTheDocument()
    expect(screen.getByLabelText(/name of account/i)).toHaveValue('Acme Corp')
    expect(screen.getByLabelText(/name of project/i)).toHaveValue('Customer intelligence')
    expect(screen.getByLabelText(/company url/i)).toHaveValue('https://acme.example.com')
    expect(screen.getByLabelText(/linkedin url/i)).toHaveValue('https://www.linkedin.com/company/acme-corp')
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/onboarding/uploads/extract'))).toBe(true)
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/onboarding/drafts/upload'))).toBe(false)

    await userEvent.click(screen.getByRole('button', { name: /create draft/i }))

    expect(await screen.findByText('Onboarding review loaded')).toBeInTheDocument()
    const uploadCall = fetchMock.mock.calls.find(call => String(call[0]).endsWith('/api/onboarding/drafts/upload'))
    expect(uploadCall).toBeTruthy()
    const uploadBody = uploadCall?.[1]?.body as FormData
    expect(uploadBody.get('account_name')).toBe('Acme Corp')
    expect(uploadBody.get('project_name')).toBe('Customer intelligence')
    expect(uploadBody.get('company_url')).toBe('https://acme.example.com')
    expect(uploadBody.get('linkedin_url')).toBe('https://www.linkedin.com/company/acme-corp')
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/onboarding/drafts/draft-1') && call[1]?.method === 'PATCH')).toBe(false)
  })

  it('requires a LinkedIn URL before creating the onboarding draft', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse([])
      if (url.endsWith('/api/onboarding/account-managers') && method === 'GET') return jsonResponse(apiManagers())
      if (url.endsWith('/api/onboarding/drafts') && method === 'POST') return jsonResponse(apiDraft())
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <CreateAccountDialog />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    await userEvent.type(screen.getByLabelText(/name of account/i), 'Acme Corp')
    await userEvent.type(screen.getByLabelText(/name of project/i), 'Customer intelligence')
    await userEvent.type(screen.getByLabelText(/company url/i), 'https://acme.example.com')
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }))

    expect(await screen.findByText('LinkedIn URL is required')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/onboarding/drafts'))).toBe(false)

    await userEvent.type(screen.getByLabelText(/linkedin url/i), 'https://acme.example.com')
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }))
    expect(await screen.findByText('Enter a valid LinkedIn URL')).toBeInTheDocument()
  })

  it('shows backend validation errors at matching account fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input)
        const method = init?.method ?? 'GET'
        if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse([])
        if (url.endsWith('/api/onboarding/account-managers') && method === 'GET') return jsonResponse(apiManagers())
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
      if (url.endsWith('/api/onboarding/account-managers') && method === 'GET') return jsonResponse(apiManagers())
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

  it('requires selecting an account manager from system users', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.endsWith('/api/accounts/custom-fields') && method === 'GET') return jsonResponse([])
      if (url.endsWith('/api/onboarding/account-managers') && method === 'GET') return jsonResponse(apiManagers())
      if (url.endsWith('/api/onboarding/drafts') && method === 'POST') return jsonResponse(apiDraft())
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <CreateAccountDialog />
      </MemoryRouter>,
    )

    await userEvent.click(screen.getByRole('button', { name: /create account/i }))
    await userEvent.type(screen.getByLabelText(/name of account/i), 'Acme Corp')
    await userEvent.type(screen.getByLabelText(/name of project/i), 'Customer intelligence')
    await userEvent.type(screen.getByLabelText(/company url/i), 'https://acme.example.com')
    await userEvent.type(screen.getByLabelText(/linkedin url/i), 'https://www.linkedin.com/company/acme-corp')
    await userEvent.click(screen.getByRole('button', { name: /create draft/i }))

    expect(await screen.findByText('Select an account manager')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      return String(url).endsWith('/api/onboarding/drafts') && init?.method === 'POST'
    })).toBe(false)
  })
})

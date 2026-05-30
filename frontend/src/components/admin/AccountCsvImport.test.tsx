import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AccountCsvImport } from '@/components/admin/AccountCsvImport'
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

const apiAccount = {
  id: 'acct-csv-1',
  name: 'CSV Cafe Zupas',
  project_name: 'Customer Success Workspace',
  company_url: 'https://cafezupas.example.com',
  segment: 'Enterprise',
  region: 'North America',
  lifecycle_status: 'Onboarding',
  risk_status: 'warning',
  commercial_value: 1260000,
  currency: 'USD',
  health: { overall: 45, relationship: 45, usage: 45, delivery: 45, commercial: 45 },
  next_governance_at: null,
  created_at: '2026-05-31T00:00:00Z',
  updated_at: '2026-05-31T00:00:00Z',
  primary_owner: {
    id: 'owner-1',
    user_id: 'usr-am',
    user_name: 'Account Manager KAM',
    user_email: 'account.manager.user@tkxelkam.com',
    ownership_role: 'primary_am',
  },
  owners: [],
  governance_completeness: { accountable_am: true, current_kyc: false, engagement_records: true, next_governance: false },
}

describe('AccountCsvImport', () => {
  it('posts mapped CSV rows to the backend import API and reports persisted accounts', async () => {
    const createObjectURL = vi.fn(() => 'blob:test')
    const revokeObjectURL = vi.fn()
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true })
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true })

    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.endsWith('/api/accounts/custom-fields')) return jsonResponse([])
      if (url.endsWith('/api/accounts/import-csv') && init?.method === 'POST') {
        return jsonResponse({
          created: 1,
          updated: 0,
          skipped: 0,
          failed: 0,
          total_rows: 1,
          results: [
            {
              row_number: 1,
              status: 'created',
              account_name: 'CSV Cafe Zupas',
              message: 'Account imported and stored in the account hierarchy.',
              account_id: 'acct-csv-1',
              draft_id: 'draft-csv-1',
              errors: [],
              account: apiAccount,
            },
          ],
        })
      }
      return jsonResponse([])
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AccountCsvImport />)

    const csv = [
      'account_name,project_name,company_url,arr,stage,owner_email,segment,region',
      'CSV Cafe Zupas,Customer Success Workspace,https://cafezupas.example.com,1260000,Onboarding,account.manager.user@tkxelkam.com,Enterprise,North America',
    ].join('\n')
    const input = document.querySelector<HTMLInputElement>('#account-csv-file')
    expect(input).not.toBeNull()
    await userEvent.upload(input!, new File([csv], 'accounts.csv', { type: 'text/csv' }))

    await screen.findByText('Field mapping')
    await userEvent.click(screen.getByRole('button', { name: /validate preview/i }))
    await userEvent.click(screen.getByRole('button', { name: /continue/i }))
    await userEvent.click(screen.getByRole('button', { name: /import accounts/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).endsWith('/api/accounts/import-csv'))).toBe(true))
    const importCall = fetchMock.mock.calls.find(call => String(call[0]).endsWith('/api/accounts/import-csv'))!
    const payload = JSON.parse(String(importCall[1]?.body))
    expect(payload.duplicate_mode).toBe('skip')
    expect(payload.source_file_name).toBe('accounts.csv')
    expect(payload.rows[0]).toMatchObject({
      account_name: 'CSV Cafe Zupas',
      project_name: 'Customer Success Workspace',
      owner_email: 'account.manager.user@tkxelkam.com',
      segment: 'Enterprise',
    })
    expect(payload.rows[0].arr).toBe(1260000)
    expect(await screen.findByText(/stored: 1/i)).toBeInTheDocument()
    expect(toast.success).toHaveBeenCalledWith('1 accounts stored in backend')
    anchorClick.mockRestore()
  })
})

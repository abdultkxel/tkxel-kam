import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { RetentionPanel } from '@/components/account/RetentionPanel'
import { Account } from '@/types/account'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: {
      id: 'usr-admin',
      name: 'KAM Super Admin',
      email: 'admin@tkxelkam.com',
      role: 'super_admin',
      avatarInitials: 'KA',
    },
  }),
}))

const account: Account = {
  id: 'acct-1',
  name: 'Atlas Health Platform',
  segment: 'Enterprise',
  tags: [],
  ownerId: 'usr-admin',
  ownerName: 'KAM Super Admin',
  ownerEmail: 'admin@tkxelkam.com',
  stage: 'Renewal',
  riskStatus: 'warning',
  arr: 640000,
  nextQbr: '2026-07-10T00:00:00Z',
  health: { overall: 63, relationship: 65, usage: 60, delivery: 70, commercial: 58 },
  stakeholders: [],
  risks: [],
}

const renewal = {
  account_id: 'acct-1',
  account_name: 'Atlas Health Platform',
  engagement_id: 'eng-1',
  engagement_name: 'Regional support SOW',
  owner_id: 'usr-admin',
  owner_name: 'KAM Super Admin',
  readiness_status: 'in_review',
  renewal_risk: 'warning',
  sow_start_date: '2026-01-01T00:00:00Z',
  sow_end_date: '2026-08-15T00:00:00Z',
  renewal_date: '2026-08-15T00:00:00Z',
  notice_deadline: '2026-07-01T00:00:00Z',
  notice_period_days: 45,
  auto_renewal: true,
  commercial_exposure: 640000,
  currency: 'USD',
  confidence: 82,
  source_kind: 'sow',
  source_title: 'Regional support SOW',
  source_citation: 'SOW p4.',
  manual_override_reason: null,
}

const retention = {
  id: 'ret-1',
  account_id: 'acct-1',
  readiness_status: 'in_review',
  renewal_risk: 'warning',
  owner_id: 'usr-admin',
  owner_name: 'KAM Super Admin',
  commercial_exposure: 640000,
  currency: 'USD',
  confidence: 82,
  source_kind: 'sow',
  source_title: 'Regional support SOW',
  source_citation: 'SOW p4.',
  manual_override_reason: null,
  notes: 'Renewal path needs executive confirmation.',
  days_to_nearest_notice: 29,
  days_to_nearest_renewal: 74,
  renewal_count: 1,
  high_risk_count: 0,
  renewals: [renewal],
}

const action = {
  id: 'action-1',
  plan_id: 'plan-1',
  title: 'Confirm executive sponsor',
  owner_id: 'usr-admin',
  owner_name: 'KAM Super Admin',
  due_at: '2026-06-15T00:00:00Z',
  status: 'todo',
  success_criteria: 'Sponsor confirmed.',
  source_recommendation_id: null,
  completed_at: null,
}

const plan = {
  id: 'plan-1',
  account_id: 'acct-1',
  engagement_id: 'eng-1',
  title: 'Existing renewal plan',
  plan_type: 'retention',
  status: 'active',
  risk_level: 'warning',
  owner_id: 'usr-admin',
  owner_name: 'KAM Super Admin',
  due_at: '2026-06-30T00:00:00Z',
  renewal_milestone_at: '2026-07-15T00:00:00Z',
  success_criteria: ['Notice path validated'],
  recommendation_context: null,
  timeline_history: [],
  custom_field_values: {},
  milestones: [],
  actions: [action],
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, page_size: 25, pages: items.length ? 1 : 0 }
}

function retentionPanelFetch() {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    if (url.includes('/api/custom-fields')) return jsonResponse([])
    if (url.includes('/api/accounts/acct-1/retention-recommendations')) {
      return jsonResponse({
        account_id: 'acct-1',
        inputs_available: true,
        missing_inputs: [],
        recommendations: [{
          id: 'rec-1',
          recommendation_type: 'notice_path',
          title: 'Confirm renewal owner',
          rationale: 'Notice deadline is close.',
          priority: 'high',
          source_context: 'SOW p4.',
          suggested_action: 'Confirm notice path',
          owner_id: 'usr-admin',
          owner_name: 'KAM Super Admin',
          due_at: '2026-06-20T00:00:00Z',
          confidence: 90,
          source_items: ['eng-1'],
          required_inputs_missing: [],
        }],
      })
    }
    if (url.includes('/api/accounts/acct-1/retention-plans') && method === 'POST') return jsonResponse({ ...plan, title: 'New retention plan' }, 201)
    if (url.includes('/api/accounts/acct-1/retention-plans')) return jsonResponse(page([plan]))
    if (url.includes('/api/retention-plans/plan-1/tasks') && method === 'POST') return jsonResponse({ ...action, id: 'action-2', title: 'Manual retention action' }, 201)
    if (url.includes('/api/retention-plans/plan-1') && method === 'PATCH') return jsonResponse(plan)
    if (url.includes('/api/retention-plan-actions/action-1') && method === 'PATCH') return jsonResponse({ ...action, status: 'cancelled' })
    if (url.includes('/api/engagements/eng-1/renewal') && method === 'PATCH') return jsonResponse(renewal)
    if (url.includes('/api/accounts/acct-1/retention') && method === 'PATCH') return jsonResponse(retention)
    if (url.includes('/api/accounts/acct-1/retention')) return jsonResponse(retention)
    return jsonResponse({})
  })
}

describe('RetentionPanel', () => {
  it('keeps retention CRUD in the account detail context', async () => {
    const fetchMock = retentionPanelFetch()
    vi.stubGlobal('fetch', fetchMock)

    render(<RetentionPanel account={account} />)

    expect(await screen.findByText('Account stability stage')).toBeInTheDocument()
    expect(screen.getAllByText('Existing renewal plan').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: /edit profile/i }))
    fireEvent.click(screen.getByRole('button', { name: /save account stability/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/accounts/acct-1/retention') && call[1]?.method === 'PATCH')).toBe(true))

    const planHeader = screen.getAllByText('Existing renewal plan')[0].closest('div')?.parentElement
    expect(planHeader).not.toBeNull()
    fireEvent.click(within(planHeader as HTMLElement).getByRole('button', { name: /^edit$/i }))
    const planTitleInput = screen.getAllByDisplayValue('Existing renewal plan').find(element => element.tagName === 'INPUT')
    expect(planTitleInput).toBeDefined()
    fireEvent.change(planTitleInput as HTMLElement, { target: { value: 'Updated renewal plan' } })
    fireEvent.click(screen.getByRole('button', { name: /save plan/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/retention-plans/plan-1') && call[1]?.method === 'PATCH')).toBe(true))

    const createPlanInput = await screen.findByDisplayValue('Retention readiness plan')
    fireEvent.change(createPlanInput, { target: { value: 'New retention plan' } })
    fireEvent.click(screen.getByRole('button', { name: /create plan/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/accounts/acct-1/retention-plans') && call[1]?.method === 'POST')).toBe(true))

    const actionTitleInput = screen.getAllByLabelText('Title').find(input => (input as HTMLInputElement).value === '')
    expect(actionTitleInput).toBeDefined()
    fireEvent.change(actionTitleInput as HTMLElement, { target: { value: 'Manual retention action' } })
    fireEvent.click(screen.getByRole('button', { name: /create action/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/retention-plans/plan-1/tasks') && call[1]?.method === 'POST')).toBe(true))

    const actionRow = screen.getByText('Confirm executive sponsor').closest('div')?.parentElement
    expect(actionRow).not.toBeNull()
    fireEvent.click(within(actionRow as HTMLElement).getByRole('button', { name: /remove/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/retention-plan-actions/action-1') && call[1]?.method === 'PATCH' && String(call[1]?.body).includes('cancelled'))).toBe(true))
  }, 10000)
})

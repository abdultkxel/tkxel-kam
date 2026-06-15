import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { GrowthWhitespacePanel, RetentionPlanPanel } from '@/components/account/RelationshipsPlanningGrowthRetention'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 'usr-owner', name: 'Account Owner', role: 'account_manager', email: 'owner@tkxel.com', avatarInitials: 'AO' },
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const account = {
  id: 'account-retention',
  name: 'Retention Customer',
  segment: 'Enterprise',
  tags: ['Enterprise'],
  ownerId: 'usr-owner',
  ownerName: 'Account Owner',
  stage: 'Renewal Focus',
  riskStatus: 'warning',
  arr: 620000,
  nextQbr: '2026-06-30T00:00:00Z',
  health: { overall: 64, relationship: 58, usage: 72, delivery: 52, commercial: 60 },
  stakeholders: [],
  risks: [],
}

const plan = {
  id: 'plan-1',
  account_id: account.id,
  engagement_id: null,
  plan_type: 'retention',
  status: 'active',
  title: 'Renewal stabilization plan',
  summary: 'Reduce renewal risk before notice deadline.',
  owner_id: 'usr-owner',
  owner_name: 'Account Owner',
  owner_email: 'owner@tkxel.com',
  renewal_milestone_at: null,
  success_criteria: ['Renewal risk reviewed'],
  source_context: 'manual',
  actions: [],
}

const recommendation = {
  id: 'rec-1',
  account_id: account.id,
  engagement_id: 'eng-1',
  title: 'Notice window approaching',
  rationale: 'Notice deadline is in 12 days.',
  severity: 'critical',
  recommended_action: 'Confirm renewal decision process and notice-window owner.',
  source_context: 'deterministic',
  status: 'recommended',
  created_task_id: null,
}

function serviceItem(index: number) {
  return {
    id: `svc-${index}`,
    slug: `service_${index}`,
    name: `Service ${index}`,
    category: index % 2 ? 'Engineering' : 'Data',
    description: null,
    tags: [`tag-${index}`],
    is_active: true,
    display_order: index,
    in_use_count: 0,
  }
}

function page<T>(items: T[], pageSize = 100) {
  return { items, total: items.length, page: 1, page_size: pageSize, pages: items.length ? 1 : 0 }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('RetentionPlanPanel', () => {
  it('requires selected recommendations and explicit confirmation before creating tasks', async () => {
    let postedPayload: Record<string, unknown> | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes(`/api/accounts/${account.id}/retention-plans`)) return jsonResponse(page([plan]))
      if (url.includes(`/api/accounts/${account.id}/retention-recommendations`)) return jsonResponse([recommendation])
      if (url.includes('/api/retention-plans/plan-1/tasks') && init?.method === 'POST') {
        postedPayload = JSON.parse(String(init.body))
        return jsonResponse([{ id: 'task-1', title: recommendation.recommended_action, source_type: 'retention_recommendation' }], 201)
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<RetentionPlanPanel account={account as any} />)

    expect(await screen.findAllByText('Renewal stabilization plan')).not.toHaveLength(0)
    await userEvent.click(screen.getByLabelText('Select Notice window approaching'))
    await userEvent.type(screen.getByLabelText('Task due date'), '2026-06-12')
    await userEvent.click(screen.getByLabelText('Confirm task creation'))
    await userEvent.click(screen.getByRole('button', { name: /create tasks/i }))

    await waitFor(() => expect(postedPayload).toBeDefined())
    expect(postedPayload).toMatchObject({
      recommendation_ids: ['rec-1'],
      owner_id: 'usr-owner',
      confirm: true,
    })
    expect(String(postedPayload?.due_at)).toContain('2026-06-12')
  })
})

describe('GrowthWhitespacePanel', () => {
  it('paginates service coverage, saves only changed rows, and explains account fit', async () => {
    const services = Array.from({ length: 14 }, (_, index) => serviceItem(index + 1))
    let patchPayload: Record<string, any> | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/service-catalog')) return jsonResponse(page(services))
      if (url.includes(`/api/accounts/${account.id}/whitespace`) && init?.method === 'PATCH') {
        patchPayload = JSON.parse(String(init.body))
        return jsonResponse([
          { id: 'ws-1', account_id: account.id, service_id: 'svc-1', service_name: 'Service 1', coverage_status: 'active', source: 'manual' },
          { id: 'ws-14', account_id: account.id, service_id: 'svc-14', service_name: 'Service 14', coverage_status: 'potential', source: 'manual' },
        ])
      }
      if (url.includes(`/api/accounts/${account.id}/whitespace`)) {
        return jsonResponse([{ id: 'ws-1', account_id: account.id, service_id: 'svc-1', service_name: 'Service 1', coverage_status: 'active', source: 'manual' }])
      }
      if (url.includes(`/api/accounts/${account.id}/service-recommendations`)) {
        return jsonResponse(page([
          {
            id: 'svc-rec-1',
            account_id: account.id,
            source_service_id: 'svc-1',
            source_service_name: 'Service 1',
            target_service_id: 'svc-14',
            target_service_name: 'Service 14',
            growth_rule_id: 'rule-1',
            base_fit_score: 75,
            relevance_score: 89,
            account_fit_score: 89,
            score_factors: [{ label: 'Expansion stage', value: 6, reason: 'Account is ready for expansion.' }],
            rationale: 'Service 1 creates a path into Service 14.',
            status: 'recommended',
            source_context: 'growth_rule',
            created_opportunity_id: null,
          },
        ]))
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<GrowthWhitespacePanel account={account as any} />)

    expect(await screen.findByText('Service coverage & growth recommendations')).toBeInTheDocument()
    expect(screen.getByText('Service 1')).toBeInTheDocument()
    expect(screen.queryByText('Service 13')).not.toBeInTheDocument()
    expect(screen.getByText('Showing 1-12 of 14 services')).toBeInTheDocument()
    expect(screen.getByText(/Base fit 75 .* Account fit 89/)).toBeInTheDocument()
    expect(screen.getByText('Fit 89%')).toBeInTheDocument()
    expect(screen.getByText('Account stage: Renewal Focus')).toBeInTheDocument()
    expect(screen.getByText('Source coverage: active')).toBeInTheDocument()
    expect(screen.queryByText('+6 Expansion stage')).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /^next$/i }))
    const service14Card = screen.getAllByText('Service 14').map(item => item.closest('label')).find(Boolean)
    expect(service14Card).not.toBeNull()
    await userEvent.selectOptions(within(service14Card as HTMLElement).getByRole('combobox'), 'potential')
    await userEvent.click(screen.getByRole('button', { name: /save coverage/i }))

    await waitFor(() => expect(patchPayload).toBeDefined())
    expect(patchPayload?.items).toEqual([{ service_id: 'svc-14', coverage_status: 'potential', notes: null, source: 'manual' }])
  })
})

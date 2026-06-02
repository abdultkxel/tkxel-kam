import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AdminRelationshipPlanningPanel } from '@/components/admin/AdminRelationshipPlanningPanel'
import { AccountPlanPanel, GrowthWhitespacePanel, RetentionPlanPanel } from '@/components/account/RelationshipsPlanningGrowthRetention'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 'usr-owner', name: 'Account Owner', role: 'account_manager', email: 'owner@tkxel.com', avatarInitials: 'AO' },
  }),
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

const accountPlanAction = {
  id: 'action-1',
  account_plan_id: 'plan-account',
  account_id: account.id,
  title: 'Confirm executive sponsor',
  owner_id: 'usr-owner',
  owner_name: 'Account Owner',
  owner_email: 'owner@tkxel.com',
  due_at: '2026-06-12T00:00:00Z',
  status: 'open',
  priority: 'high',
  success_criteria: ['Sponsor confirmed'],
  completed_at: null,
  completed_by_id: null,
  created_by_id: 'usr-owner',
  created_by_name: 'Account Owner',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

const accountPlan = {
  id: 'plan-account',
  account_id: account.id,
  retention_focus: 'Protect renewal through executive coverage.',
  growth_focus: 'Expand platform engineering into QA automation.',
  risks: ['Sponsor coverage is thin'],
  opportunities: 'Quality acceleration expansion.',
  commitments: ['Monthly steering review'],
  service_gaps: ['QA automation'],
  review_cadence: 'Monthly',
  next_review_at: '2026-06-30T00:00:00Z',
  status: 'active',
  created_by_id: 'usr-owner',
  created_by_name: 'Account Owner',
  updated_by_id: 'usr-owner',
  updated_by_name: 'Account Owner',
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-02T00:00:00Z',
  actions: [accountPlanAction],
}

const sourceService = {
  id: 'svc-source',
  slug: 'platform_engineering',
  name: 'Platform Engineering',
  category: 'Engineering',
  description: null,
  tags: ['platform'],
  is_active: true,
  display_order: 1,
  in_use_count: 1,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

const targetService = {
  id: 'svc-target',
  slug: 'quality_advisory',
  name: 'Quality Advisory',
  category: 'QA',
  description: null,
  tags: ['qa'],
  is_active: true,
  display_order: 2,
  in_use_count: 0,
  created_at: '2026-06-01T00:00:00Z',
  updated_at: '2026-06-01T00:00:00Z',
}

function page<T>(items: T[], pageSize = 100) {
  return { items, total: items.length, page: 1, page_size: pageSize, pages: items.length ? 1 : 0 }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AccountPlanPanel', () => {
  it('preserves existing actions and shows account plan history while saving a new action', async () => {
    let postedPayload: Record<string, any> | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes(`/api/accounts/${account.id}/plan/history`)) {
        return jsonResponse(page([{ id: 'version-1', account_plan_id: accountPlan.id, account_id: account.id, version: 1, snapshot_json: {}, change_summary: 'Initial relationship plan.', actor_id: 'usr-owner', actor_name: 'Account Owner', created_at: '2026-06-02T00:00:00Z' }], 10))
      }
      if (url.includes(`/api/accounts/${account.id}/plan`) && init?.method === 'PUT') {
        postedPayload = JSON.parse(String(init.body))
        return jsonResponse({ ...accountPlan, actions: postedPayload?.actions.map((item: Record<string, unknown>, index: number) => ({ ...accountPlanAction, id: `action-${index + 1}`, title: item.title, owner_id: item.owner_id, due_at: item.due_at, status: item.status, priority: item.priority, success_criteria: item.success_criteria })) })
      }
      if (url.includes(`/api/accounts/${account.id}/plan`)) return jsonResponse(accountPlan)
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AccountPlanPanel account={account as any} />)

    expect(await screen.findByDisplayValue('Protect renewal through executive coverage.')).toBeInTheDocument()
    expect(screen.getByText('Version 1')).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Next action'), 'Schedule growth workshop')
    await userEvent.type(screen.getByLabelText('Due date'), '2026-06-18')
    await userEvent.click(screen.getByRole('button', { name: /save plan/i }))

    await waitFor(() => expect(postedPayload).toBeDefined())
    expect(postedPayload?.actions).toHaveLength(2)
    expect(postedPayload?.actions?.[0]).toMatchObject({ title: 'Confirm executive sponsor' })
    expect(postedPayload?.actions?.[1]).toMatchObject({ title: 'Schedule growth workshop' })
    expect(postedPayload).toMatchObject({ opportunities: 'Quality acceleration expansion.', review_cadence: 'Monthly', status: 'active' })
  })
})

describe('GrowthWhitespacePanel', () => {
  it('requires explicit confirmation before creating an opportunity from a recommendation', async () => {
    let postedPayload: Record<string, unknown> | undefined
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/service-catalog')) return jsonResponse(page([sourceService, targetService]))
      if (url.includes(`/api/accounts/${account.id}/whitespace`)) return jsonResponse([])
      if (url.includes(`/api/accounts/${account.id}/service-recommendations/rec-service/opportunity`) && init?.method === 'POST') {
        postedPayload = JSON.parse(String(init.body))
        return jsonResponse({
          id: 'opp-1',
          account_id: account.id,
          account_name: account.name,
          engagement_id: 'eng-1',
          engagement_name: 'Modernization SOW',
          type_id: 'type-1',
          type_name: 'Cross-sell',
          type_slug: 'cross_sell',
          service_line: targetService.name,
          owner_id: 'usr-owner',
          owner_name: 'Account Owner',
          owner_email: 'owner@tkxel.com',
          name: 'Quality Advisory opportunity',
          value: 0,
          estimated_value: 0,
          currency: 'USD',
          stage: 'Identified',
          next_step: 'Validate adjacent service fit with client stakeholders.',
          target_date: '2026-07-01T00:00:00Z',
          close_date: '2026-07-01T00:00:00Z',
          source_context: 'service_recommendation',
          created_at: '2026-06-02T00:00:00Z',
          updated_at: '2026-06-02T00:00:00Z',
          stage_history: [],
          decisions: [],
          action_items: [],
        }, 201)
      }
      if (url.includes(`/api/accounts/${account.id}/service-recommendations`)) {
        return jsonResponse(page([{ id: 'rec-service', account_id: account.id, engagement_id: 'eng-1', source_service_id: sourceService.id, source_service_name: sourceService.name, target_service_id: targetService.id, target_service_name: targetService.name, relevance_score: 91, rationale: 'Active engineering work often benefits from quality advisory.', status: 'recommended', source_context: 'adjacency', created_opportunity_id: null }]))
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<GrowthWhitespacePanel account={account as any} engagements={[{ id: 'eng-1', accountId: account.id, accountName: account.name, name: 'Modernization SOW' } as any]} />)

    expect(await screen.findAllByText('Quality Advisory')).not.toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: /create opportunity/i }))
    expect(await screen.findByText('Confirm opportunity creation before continuing.')).toBeInTheDocument()
    expect(postedPayload).toBeUndefined()
    await userEvent.click(screen.getByLabelText('Confirm opportunity creation'))
    await userEvent.click(screen.getByRole('button', { name: /create opportunity/i }))

    await waitFor(() => expect(postedPayload).toBeDefined())
    expect(postedPayload).toMatchObject({ confirm: true, owner_id: 'usr-owner' })
  })
})

describe('AdminRelationshipPlanningPanel', () => {
  it('shows backend service catalog field errors beside service inputs', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/admin/service-catalog') && init?.method === 'POST') {
        return jsonResponse({ detail: { message: 'A service with this name already exists.', errors: [{ field: 'name', message: 'A service with this name already exists.' }] } }, 409)
      }
      if (url.includes('/api/admin/service-catalog')) return jsonResponse(page([sourceService], 10))
      if (url.includes('/api/admin/service-adjacencies')) return jsonResponse([])
      if (url.includes('/api/admin/stakeholder-roles')) return jsonResponse(page([]))
      if (url.includes('/api/admin/stakeholder-gap-rules')) return jsonResponse(page([]))
      if (url.includes('/api/admin/opportunity-stages')) return jsonResponse([])
      if (url.includes('/api/admin/opportunity-stage-transitions')) return jsonResponse([])
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<AdminRelationshipPlanningPanel />)

    expect(await screen.findAllByText('Platform Engineering')).not.toHaveLength(0)
    await userEvent.type(screen.getAllByLabelText('Name')[0], 'Platform Engineering')
    await userEvent.type(screen.getAllByLabelText('Slug')[0], 'platform_engineering_duplicate')
    await userEvent.click(screen.getAllByRole('button', { name: /^add$/i })[0])

    expect(await screen.findByText('A service with this name already exists.')).toBeInTheDocument()
  })
})

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

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { RetentionPlanPanel } from '@/components/account/RelationshipsPlanningGrowthRetention'

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

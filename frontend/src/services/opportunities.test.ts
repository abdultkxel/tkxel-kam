import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiRequest } from '@/services/api'
import {
  ApiOpportunity,
  addOpportunityActionItem,
  buildCreatePayload,
  buildUpdatePayload,
  listOpportunities,
  mapApiOpportunity,
} from '@/services/opportunities'

vi.mock('@/services/api', () => ({
  apiRequest: vi.fn(),
}))

const apiRequestMock = vi.mocked(apiRequest)

const apiOpportunity: ApiOpportunity = {
  id: 'opp-1',
  account_id: 'acc-1',
  account_name: 'Signal',
  engagement_id: null,
  engagement_name: null,
  type_id: 'type-1',
  type_name: 'Expansion',
  type_slug: 'expansion',
  service_line: 'Data Analytics',
  owner_id: 'usr-1',
  owner_name: 'Owner One',
  owner_email: 'owner@example.com',
  name: 'AI support expansion',
  value: 175000,
  estimated_value: 175000,
  currency: 'USD',
  stage: 'Qualified',
  next_step: 'Confirm sponsor priority.',
  target_date: '2026-06-30T12:00:00Z',
  close_date: '2026-06-30T12:00:00Z',
  source_context: 'manual',
  source_record_id: null,
  source_record_type: null,
  source_record_route: '/opportunities?opportunity=opp-1',
  outcome_reason: null,
  archived_at: null,
  archive_reason: null,
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-02T10:00:00Z',
  stage_history: [
    {
      id: 'hist-1',
      opportunity_id: 'opp-1',
      account_id: 'acc-1',
      engagement_id: null,
      before_stage: 'Identified',
      after_stage: 'Qualified',
      actor_id: 'usr-1',
      actor_name: 'Owner One',
      reason: 'Discovery complete.',
      timeline_entry_id: 'tl-1',
      created_at: '2026-06-02T10:00:00Z',
    },
  ],
  decisions: [
    {
      id: 'dec-1',
      opportunity_id: 'opp-1',
      decision_text: 'Proceed with pilot.',
      owner_id: null,
      owner_name: 'Client Sponsor',
      timeline_entry_id: 'tl-2',
      created_by_id: 'usr-1',
      created_by_name: 'Owner One',
      created_at: '2026-06-02T11:00:00Z',
    },
  ],
  action_items: [
    {
      id: 'act-1',
      opportunity_id: 'opp-1',
      title: 'Send proposal recap',
      owner_id: 'usr-1',
      owner_name: 'Owner One',
      owner_email: 'owner@example.com',
      due_at: '2026-06-07T12:00:00Z',
      due_date: '2026-06-07T12:00:00Z',
      status: 'open',
      priority: 'medium',
      notes: null,
      future_task_id: null,
      completed_at: null,
      completed_by_id: null,
      created_by_id: 'usr-1',
      created_by_name: 'Owner One',
      created_at: '2026-06-02T11:00:00Z',
      updated_at: '2026-06-02T11:00:00Z',
    },
  ],
}

describe('opportunities service mapping', () => {
  beforeEach(() => {
    apiRequestMock.mockReset()
  })

  it('maps opportunity detail records for board, list, and detail consumers', () => {
    const opportunity = mapApiOpportunity(apiOpportunity)

    expect(opportunity.accountId).toBe('acc-1')
    expect(opportunity.typeName).toBe('Expansion')
    expect(opportunity.estimatedValue).toBe(175000)
    expect(opportunity.closeDate).toBe('2026-06-30T12:00:00Z')
    expect(opportunity.stageHistory?.[0]?.afterStage).toBe('Qualified')
    expect(opportunity.decisions?.[0]?.decisionText).toBe('Proceed with pilot.')
    expect(opportunity.actionItems?.[0]?.title).toBe('Send proposal recap')
    expect(opportunity.actionItems?.[0]?.futureTaskId).toBeNull()
  })

  it('builds create payloads with snake_case opportunity and action item fields', () => {
    expect(buildCreatePayload({
      accountId: 'acc-1',
      typeId: 'type-1',
      ownerId: 'usr-1',
      name: 'AI support expansion',
      serviceLine: 'Data Analytics',
      value: 175000,
      currency: 'USD',
      stage: 'Identified',
      nextStep: 'Confirm sponsor priority.',
      targetDate: '2026-06-30T12:00:00Z',
      actionItems: [{ title: 'Send recap', dueDate: '2026-06-07T12:00:00Z', priority: 'medium', createTask: true }],
    })).toMatchObject({
      account_id: 'acc-1',
      type_id: 'type-1',
      owner_id: 'usr-1',
      service_line: 'Data Analytics',
      next_step: 'Confirm sponsor priority.',
      target_date: '2026-06-30T12:00:00Z',
      action_items: [{ title: 'Send recap', due_date: '2026-06-07T12:00:00Z', create_task: true }],
    })
  })

  it('builds update payloads with stage, engagement, source, and outcome fields for atomic detail saves', () => {
    expect(buildUpdatePayload({
      engagementId: 'eng-1',
      stage: 'Won',
      sourceContext: 'engagement',
      outcomeReason: 'Budget approved by sponsor.',
    })).toMatchObject({
      engagement_id: 'eng-1',
      stage: 'Won',
      source_context: 'engagement',
      outcome_reason: 'Budget approved by sponsor.',
    })
  })

  it('sends create_task false when the action item task checkbox is off', async () => {
    apiRequestMock.mockResolvedValue(apiOpportunity.action_items[0])

    await addOpportunityActionItem('test-token', 'opp-1', {
      title: 'Send recap',
      dueDate: '2026-06-07T12:00:00Z',
      createTask: false,
    })

    expect(apiRequestMock).toHaveBeenCalledWith('/api/opportunities/opp-1/action-items', expect.objectContaining({
      method: 'POST',
      token: 'test-token',
      body: JSON.stringify({ title: 'Send recap', due_date: '2026-06-07T12:00:00Z', create_task: false }),
    }))
  })

  it('sends dashboard open and stalled filters as API query params', async () => {
    apiRequestMock.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 25,
      pages: 0,
      totals: { open_count: 0, open_value: 0, won_value: 0, total_count: 0, total_value: 0, average_value: 0, stage_counts: {}, stage_values: {} },
    })

    await listOpportunities('test-token', { openOnly: true, stalled: true, stalledAfterDays: 90, page: 1, pageSize: 25 })

    expect(apiRequestMock).toHaveBeenCalledWith(
      '/api/opportunities?open_only=true&stalled=true&stalled_after_days=90&page=1&page_size=25',
      { token: 'test-token' },
    )
  })
})

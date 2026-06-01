import { describe, expect, it } from 'vitest'
import { ApiGovernanceEvent, buildCreatePayload, mapApiGovernanceEvent } from '@/services/governance'

const apiEvent: ApiGovernanceEvent = {
  id: 'gov-1',
  account_id: 'acc-1',
  account_name: 'Signal',
  engagement_id: null,
  engagement_name: null,
  owner_id: 'usr-1',
  owner_name: 'Owner One',
  owner_email: 'owner@example.com',
  governance_type: 'Monthly Review',
  scheduled_at: '2026-06-15T10:00:00Z',
  agenda: 'Review adoption, delivery, renewal, and decisions.',
  status: 'upcoming',
  source: 'manual',
  attendee_emails: ['Client.Owner@Example.com', 'client.owner@example.com', 'kam@example.com'],
  notes: [],
  decisions: [{ id: 'dec-1', event_id: 'gov-1', decision_text: 'Approve recovery cadence.', owner_id: null, owner_name: null, source: 'manual', created_at: '2026-06-15T11:00:00Z' }],
  action_items: [{ id: 'act-1', event_id: 'gov-1', title: 'Share next roadmap.', owner_id: null, owner_name: null, owner_email: null, due_date: '2026-06-20T17:00:00Z', status: 'open', source: 'manual', created_at: '2026-06-15T11:00:00Z', updated_at: '2026-06-15T11:00:00Z' }],
  generated_outputs: [],
  completed_at: null,
  created_at: '2026-06-01T10:00:00Z',
  updated_at: '2026-06-01T10:00:00Z',
}

describe('governance service mapping', () => {
  it('maps governance events into UI records with normalized attendee emails', () => {
    const event = mapApiGovernanceEvent(apiEvent)

    expect(event.type).toBe('Monthly Review')
    expect(event.attendeeEmails).toEqual(['client.owner@example.com', 'kam@example.com'])
    expect(event.attendees).toEqual(event.attendeeEmails)
    expect(event.actionItems).toEqual(['Share next roadmap.'])
    expect(event.decisions[0]?.decisionText).toBe('Approve recovery cadence.')
  })

  it('builds create payloads with snake_case fields and deduped emails', () => {
    expect(buildCreatePayload({
      accountId: 'acc-1',
      governanceType: 'QBR',
      scheduledAt: '2026-06-15T10:00:00Z',
      agenda: 'Quarterly review.',
      ownerId: 'usr-1',
      attendeeEmails: ['AM@Example.com', 'am@example.com', 'client@example.com'],
    })).toMatchObject({
      account_id: 'acc-1',
      governance_type: 'QBR',
      scheduled_at: '2026-06-15T10:00:00Z',
      attendee_emails: ['am@example.com', 'client@example.com'],
    })
  })
})

import { describe, expect, it } from 'vitest'
import { filterAndSortGovernanceEvents } from '@/utils/governanceFlow'
import { GovernanceEventRecord } from '@/types/governance'

const baseEvent: GovernanceEventRecord = {
  id: 'gov-base',
  accountId: 'acc-base',
  accountName: 'Base',
  ownerId: 'usr-base',
  ownerName: 'Base Owner',
  type: 'QBR',
  date: '2026-06-01T10:00:00Z',
  agenda: 'Base agenda',
  attendeeEmails: [],
  attendees: [],
  actionItemRecords: [],
  actionItems: [],
  notes: [],
  decisions: [],
  generatedOutputs: [],
  status: 'upcoming',
  createdAt: '2026-05-01T10:00:00Z',
  updatedAt: '2026-05-01T10:00:00Z',
}

describe('governance flow filters and sorting', () => {
  it('searches governance context and sorts event dates descending', () => {
    const rows = filterAndSortGovernanceEvents(
      [
        {
          ...baseEvent,
          id: 'gov-qbr',
          accountName: 'Signal',
          date: '2026-06-10T10:00:00Z',
          agenda: 'Roadmap and renewal checkpoint.',
          attendeeEmails: ['sponsor@signal.example'],
        },
        {
          ...baseEvent,
          id: 'gov-steerco',
          accountName: 'Cafe Zupas',
          type: 'SteerCo',
          date: '2026-06-20T10:00:00Z',
          agenda: 'Regional rollout recovery.',
          decisions: [{ id: 'dec-1', eventId: 'gov-steerco', decisionText: 'Recovery cadence approved.', ownerId: null, ownerName: null, source: 'manual', createdAt: '2026-06-20T11:00:00Z' }],
        },
        {
          ...baseEvent,
          id: 'gov-exec',
          accountName: 'Canvs',
          type: 'Executive Review',
          date: '2026-06-15T10:00:00Z',
          agenda: 'Sponsor reset.',
          status: 'overdue',
        },
      ],
      { search: 'recovery', status: 'all', governanceType: 'all' },
      'event_date',
      'desc',
    )

    expect(rows.map(row => row.id)).toEqual(['gov-steerco'])
  })

  it('filters by owner, mine-only, type, and status', () => {
    const rows = filterAndSortGovernanceEvents(
      [
        { ...baseEvent, id: 'gov-owned', ownerId: 'usr-1', type: 'Monthly Review', status: 'overdue', date: '2026-06-10T10:00:00Z' },
        { ...baseEvent, id: 'gov-other-owner', ownerId: 'usr-2', type: 'Monthly Review', status: 'overdue', date: '2026-06-11T10:00:00Z' },
        { ...baseEvent, id: 'gov-wrong-type', ownerId: 'usr-1', type: 'QBR', status: 'overdue', date: '2026-06-12T10:00:00Z' },
        { ...baseEvent, id: 'gov-completed', ownerId: 'usr-1', type: 'Monthly Review', status: 'completed', date: '2026-06-13T10:00:00Z' },
      ],
      { mineOnly: true, currentUserId: 'usr-1', governanceType: 'Monthly Review', status: 'overdue' },
      'event_date',
      'asc',
    )

    expect(rows.map(row => row.id)).toEqual(['gov-owned'])
  })

  it('filters by engagement, attendee, source, and date range', () => {
    const rows = filterAndSortGovernanceEvents(
      [
        {
          ...baseEvent,
          id: 'gov-match',
          engagementId: 'eng-1',
          attendeeEmails: ['sponsor@example.com'],
          source: 'manual',
          date: '2026-06-15T10:00:00Z',
        },
        {
          ...baseEvent,
          id: 'gov-wrong-attendee',
          engagementId: 'eng-1',
          attendeeEmails: ['client@example.com'],
          source: 'manual',
          date: '2026-06-15T10:00:00Z',
        },
        {
          ...baseEvent,
          id: 'gov-wrong-source',
          engagementId: 'eng-1',
          attendeeEmails: ['sponsor@example.com'],
          source: 'fathom',
          date: '2026-06-15T10:00:00Z',
        },
        {
          ...baseEvent,
          id: 'gov-outside-range',
          engagementId: 'eng-1',
          attendeeEmails: ['sponsor@example.com'],
          source: 'manual',
          date: '2026-07-01T10:00:00Z',
        },
      ],
      {
        engagementId: 'eng-1',
        attendee: 'sponsor',
        source: 'manual',
        dateFrom: '2026-06-01',
        dateTo: '2026-06-30',
      },
      'event_date',
      'asc',
    )

    expect(rows.map(row => row.id)).toEqual(['gov-match'])
  })
})

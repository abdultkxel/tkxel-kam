import { describe, expect, it } from 'vitest'
import { buildFathomResolvePayload, buildMeetingPayload, buildMeetingResolvePayload } from '@/services/meetingCapture'

describe('meeting capture service mapping', () => {
  it('builds create payloads for personal Fathom meeting artifacts', () => {
    expect(buildMeetingPayload({
      title: ' Executive QBR ',
      meetingUrl: ' https://fathom.video/share/qbr ',
      accountId: 'acc-1',
      linkedObjectType: 'governance_event',
      linkedObjectId: 'gov-1',
    })).toEqual({
      provider: 'fathom',
      title: 'Executive QBR',
      meeting_url: 'https://fathom.video/share/qbr',
      summary: undefined,
      action_items: [],
      occurred_at: null,
      scheduled_at: null,
      account_id: 'acc-1',
      engagement_id: null,
      linked_object_type: 'governance_event',
      linked_object_id: 'gov-1',
    })
  })

  it('builds on-demand Fathom resolve payloads', () => {
    expect(buildFathomResolvePayload({
      identifier: ' 123456789 ',
      accountId: 'acc-1',
      engagementId: 'eng-1',
      linkedObjectType: 'governance_event',
      linkedObjectId: 'gov-1',
    })).toEqual({
      identifier: '123456789',
      account_id: 'acc-1',
      engagement_id: 'eng-1',
      linked_object_type: 'governance_event',
      linked_object_id: 'gov-1',
    })
  })

  it('builds Fireflies meeting artifact and resolve payloads', () => {
    expect(buildMeetingPayload({
      provider: 'fireflies',
      title: ' Fireflies QBR ',
      meetingUrl: ' https://app.fireflies.ai/view/transcript-123 ',
      summary: ' Summary ',
      actionItems: ['Confirm action owner'],
    })).toEqual({
      provider: 'fireflies',
      title: 'Fireflies QBR',
      meeting_url: 'https://app.fireflies.ai/view/transcript-123',
      summary: 'Summary',
      action_items: ['Confirm action owner'],
      occurred_at: null,
      scheduled_at: null,
      account_id: null,
      engagement_id: null,
      linked_object_type: null,
      linked_object_id: null,
    })

    expect(buildMeetingResolvePayload({
      identifier: ' transcript-123 ',
      accountId: 'acc-1',
      linkedObjectType: 'governance_event',
      linkedObjectId: 'gov-1',
    })).toEqual({
      identifier: 'transcript-123',
      account_id: 'acc-1',
      engagement_id: null,
      linked_object_type: 'governance_event',
      linked_object_id: 'gov-1',
    })
  })
})

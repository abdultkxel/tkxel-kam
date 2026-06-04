import { describe, expect, it } from 'vitest'
import { buildMeetingPayload } from '@/services/meetingCapture'

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
})

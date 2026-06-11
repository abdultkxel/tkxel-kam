import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CompleteGovernanceEventDialog } from '@/components/governance/CompleteGovernanceEventDialog'
import type { GovernanceEventRecord } from '@/types/governance'

const completeEventMock = vi.hoisted(() => vi.fn())

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('@/stores/governanceStore', () => ({
  useGovernanceStore: (selector: (state: { completeEvent: typeof completeEventMock }) => unknown) => selector({ completeEvent: completeEventMock }),
}))

vi.mock('@/components/ui/RichTextEditor', () => ({
  RichTextEditor: ({ value, onChange, ariaLabel, placeholder }: { value: string; onChange: (value: string) => void; ariaLabel?: string; placeholder?: string }) => (
    <textarea aria-label={ariaLabel} placeholder={placeholder} value={value} onChange={event => onChange(event.target.value)} />
  ),
}))

const eventRecord: GovernanceEventRecord = {
  id: 'gov-1',
  accountId: 'acc-1',
  accountName: 'Signal Account',
  engagementId: 'eng-1',
  engagementName: 'Delivery',
  ownerId: 'usr-1',
  ownerName: 'Owner One',
  ownerEmail: 'owner@example.com',
  type: 'QBR',
  date: '2026-06-15T10:00:00Z',
  agenda: 'Review delivery health.',
  attendeeEmails: [],
  attendees: [],
  actionItemRecords: [],
  actionItems: [],
  notes: [],
  decisions: [],
  generatedOutputs: [],
  status: 'upcoming',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const disconnectedConnection = (provider: 'fathom' | 'fireflies') => ({
  id: null,
  provider,
  enabled: false,
  status: 'configuration_required',
  auth_type: 'api_key',
  credential_status: { configured: false, fields: [], masked: false },
  settings_json: {},
  last_synced_at: null,
  last_error: null,
})

const connectedConnection = (provider: 'fathom' | 'fireflies') => ({
  ...disconnectedConnection(provider),
  id: `conn-${provider}`,
  enabled: true,
  status: 'connected',
  credential_status: { configured: true, fields: ['api_key'], masked: true },
})

describe('CompleteGovernanceEventDialog', () => {
  beforeEach(() => {
    completeEventMock.mockReset()
  })

  it('resolves one Fathom meeting on demand and submits the meeting artifact', async () => {
    completeEventMock.mockResolvedValue({ ...eventRecord, status: 'completed' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/meeting-capture/fathom/connection')) return jsonResponse(connectedConnection('fathom'))
      if (url.includes('/api/meeting-capture/fireflies/connection')) return jsonResponse(disconnectedConnection('fireflies'))
      if (url.includes('/api/meeting-capture/fathom/resolve')) {
        expect(init?.method).toBe('POST')
        expect(init?.body).toBe(JSON.stringify({
          identifier: '123456789',
          account_id: 'acc-1',
          engagement_id: 'eng-1',
          linked_object_type: 'governance_event',
          linked_object_id: 'gov-1',
        }))
        return jsonResponse({
          id: 'meeting-1',
          owner_id: 'usr-1',
          provider: 'fathom',
          external_id: '123456789',
          title: 'Executive QBR recording',
          summary: '## Summary\nReviewed priorities and risk actions.',
          action_items: ['Send recap'],
          meeting_url: null,
          source_link: 'https://fathom.video/share/qbr',
          occurred_at: null,
          scheduled_at: null,
          account_id: 'acc-1',
          engagement_id: 'eng-1',
          linked_object_type: 'governance_event',
          linked_object_id: 'gov-1',
          status: 'ready',
          metadata_json: {},
          created_at: '2026-06-15T11:00:00Z',
          updated_at: '2026-06-15T11:00:00Z',
        })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CompleteGovernanceEventDialog event={eventRecord} />)

    await userEvent.click(screen.getByRole('button', { name: /complete event/i }))
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/meeting-capture/meetings'))).toBe(false)

    await userEvent.type(screen.getByPlaceholderText(/fathom recording id or share url/i), '123456789')
    await userEvent.click(screen.getByRole('button', { name: /fetch meeting/i }))

    expect(await screen.findByText('Executive QBR recording')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/Reviewed priorities and risk actions/i)).toBeInTheDocument()
    expect(screen.getByDisplayValue('Send recap')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('checkbox')[0])
    await userEvent.click(screen.getByRole('button', { name: /save completion/i }))

    await waitFor(() => expect(completeEventMock).toHaveBeenCalled())
    expect(completeEventMock).toHaveBeenCalledWith('test-token', 'gov-1', expect.objectContaining({ meetingArtifactId: 'meeting-1' }))
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/meeting-capture/meetings'))).toBe(false)
  })

  it('resolves one Fireflies transcript on demand and submits the meeting artifact', async () => {
    completeEventMock.mockResolvedValue({ ...eventRecord, status: 'completed' })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/meeting-capture/fathom/connection')) return jsonResponse(disconnectedConnection('fathom'))
      if (url.includes('/api/meeting-capture/fireflies/connection')) return jsonResponse(connectedConnection('fireflies'))
      if (url.includes('/api/meeting-capture/fireflies/resolve')) {
        expect(init?.method).toBe('POST')
        expect(init?.body).toBe(JSON.stringify({
          identifier: 'transcript-123',
          account_id: 'acc-1',
          engagement_id: 'eng-1',
          linked_object_type: 'governance_event',
          linked_object_id: 'gov-1',
        }))
        return jsonResponse({
          id: 'meeting-fireflies',
          owner_id: 'usr-1',
          provider: 'fireflies',
          external_id: 'transcript-123',
          title: 'Fireflies QBR transcript',
          summary: '## **Summary**\n[00:00 - 00:12] **Hassan** reviewed rollout risks and Fireflies follow-ups.',
          action_items: ['**Hassan**', '[00:20] Develop and share best practices/framework for managing AI as an intern', 'Discussion notes', '00:45'],
          meeting_url: 'https://meet.example.com/qbr',
          source_link: 'https://app.fireflies.ai/view/transcript-123',
          occurred_at: null,
          scheduled_at: null,
          account_id: 'acc-1',
          engagement_id: 'eng-1',
          linked_object_type: 'governance_event',
          linked_object_id: 'gov-1',
          status: 'ready',
          metadata_json: {},
          created_at: '2026-06-15T11:00:00Z',
          updated_at: '2026-06-15T11:00:00Z',
        })
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<CompleteGovernanceEventDialog event={eventRecord} />)

    await userEvent.click(screen.getByRole('button', { name: /complete event/i }))
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/meeting-capture/meetings'))).toBe(false)

    await userEvent.click(await screen.findByRole('button', { name: /fireflies/i }))
    await userEvent.type(screen.getByPlaceholderText(/fireflies transcript id or transcript url/i), 'transcript-123')
    await userEvent.click(screen.getByRole('button', { name: /fetch meeting/i }))

    expect(await screen.findByText('Fireflies QBR transcript')).toBeInTheDocument()
    expect(screen.getByDisplayValue(/Hassan reviewed rollout risks and Fireflies follow-ups/i)).toBeInTheDocument()
    expect(screen.queryByDisplayValue(/\*\*/)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue(/00:00/)).not.toBeInTheDocument()
    expect(screen.queryByDisplayValue('Hassan')).not.toBeInTheDocument()
    expect(screen.getByDisplayValue('Develop and share best practices/framework for managing AI as an intern')).toBeInTheDocument()
    expect(screen.queryByDisplayValue('Discussion notes')).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/include action item 1/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/create task for action item 1/i)).toBeChecked()

    await userEvent.click(screen.getByRole('button', { name: /save completion/i }))

    await waitFor(() => expect(completeEventMock).toHaveBeenCalled())
    expect(completeEventMock).toHaveBeenCalledWith('test-token', 'gov-1', expect.objectContaining({ meetingArtifactId: 'meeting-fireflies' }))
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/meeting-capture/meetings'))).toBe(false)
  })
})

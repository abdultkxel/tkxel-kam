import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TimelineFeed } from '@/components/timeline/TimelineFeed'
import { getAccountTimeline, getTimelineEventTypes } from '@/services/timeline'
import { TimelineEntry } from '@/types/timeline'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: {
      id: 'usr-admin',
      name: 'KAM Super Admin',
      email: 'admin@tkxel.com',
      role: 'super_admin',
      avatarInitials: 'KA',
    },
  }),
}))

vi.mock('@/services/timeline', () => ({
  getAccountTimeline: vi.fn(),
  getTimelineEventTypes: vi.fn(),
  getTimelineComments: vi.fn(),
  createTimelineComment: vi.fn(),
  updateTimelineComment: vi.fn(),
  deleteTimelineComment: vi.fn(),
  createTimelineNote: vi.fn(),
  runTimelineAiSearch: vi.fn(),
}))

const timelineEntry: TimelineEntry = {
  id: 'tl-1',
  accountId: 'acct-1',
  eventType: 'manual_note',
  module: 'manual',
  title: 'Kickoff completed',
  description: 'Customer kickoff notes were captured.',
  performedBy: 'usr-admin',
  performedByName: 'KAM Super Admin',
  timestamp: '2026-06-01T10:00:00Z',
  isSensitive: false,
  isSystemGenerated: false,
  isImmutable: false,
  tags: ['kickoff'],
  mentions: [],
  attachments: [],
}

describe('TimelineFeed', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getAccountTimeline).mockResolvedValue({
      items: [timelineEntry],
      total: 1,
      page: 1,
      page_size: 100,
      pages: 1,
    })
    vi.mocked(getTimelineEventTypes).mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 100,
      pages: 0,
    })
  })

  it('renders the timeline without the AI-powered search panel', async () => {
    render(
      <MemoryRouter initialEntries={['/accounts/acct-1?tab=timeline']}>
        <TimelineFeed accountId="acct-1" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Account history')).toBeInTheDocument()
    expect(await screen.findByText('Kickoff completed')).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/search title, description, owner, or tags/i)).toBeInTheDocument()
    expect(screen.queryByText(/AI-powered timeline search/i)).not.toBeInTheDocument()
    expect(screen.queryByPlaceholderText(/Ask timeline questions/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/Search documents/i)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Try in KAM AI/i })).not.toBeInTheDocument()
  })

  it('renders timeline cards in normal flow without fixed virtual row heights', async () => {
    vi.mocked(getAccountTimeline).mockResolvedValue({
      items: [
        {
          ...timelineEntry,
          id: 'tl-2',
          isSystemGenerated: true,
          isImmutable: true,
          beforeValue: { stage: 'discovery' },
          afterValue: { stage: 'delivery' },
        },
        timelineEntry,
      ],
      total: 2,
      page: 1,
      page_size: 100,
      pages: 1,
    })

    render(
      <MemoryRouter initialEntries={['/accounts/acct-1?tab=timeline']}>
        <TimelineFeed accountId="acct-1" />
      </MemoryRouter>,
    )

    const list = await screen.findByRole('list', { name: /account timeline events/i })
    const items = screen.getAllByRole('listitem')

    expect(list).toHaveClass('space-y-3')
    expect(items).toHaveLength(2)
    expect(items[0].getAttribute('style') ?? '').not.toContain('height')
    expect(screen.getByRole('button', { name: /what changed/i })).toBeInTheDocument()
  })
})

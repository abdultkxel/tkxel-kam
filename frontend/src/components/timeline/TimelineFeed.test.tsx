import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
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

vi.mock('react-window', async () => {
  const React = await import('react')
  type ListProps = {
    children: (props: { index: number; style: object; data: unknown }) => ReactNode
    itemCount: number
    itemData: unknown
  }
  const VariableSizeList = React.forwardRef<{ scrollToItem: () => void }, ListProps>(({ children, itemCount, itemData }, ref) => {
    React.useImperativeHandle(ref, () => ({ scrollToItem: () => undefined }))
    return (
      <div>
        {Array.from({ length: itemCount }).map((_, index) => (
          <div key={index}>{children({ index, style: {}, data: itemData })}</div>
        ))}
      </div>
    )
  })
  VariableSizeList.displayName = 'VariableSizeList'
  return { VariableSizeList }
})

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
})

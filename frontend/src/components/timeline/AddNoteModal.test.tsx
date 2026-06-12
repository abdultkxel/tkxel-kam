import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AddNoteModal } from '@/components/timeline/AddNoteModal'
import { createTimelineNote, getTimelineEventTypes } from '@/services/timeline'
import { TimelineEntry, TimelineEventTypeConfig } from '@/types/timeline'

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
  getTimelineEventTypes: vi.fn(),
  createTimelineNote: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal('ResizeObserver', ResizeObserverMock)

const customNoteType: TimelineEventTypeConfig = {
  id: 'cfg-manual',
  name: 'Testing',
  eventType: 'manual_note',
  module: 'manual',
  colorToken: 'surface-border',
  active: true,
  defaultVisibility: 'public',
  createdDate: '2026-06-02T00:00:00Z',
  retentionPolicy: 'keep',
}

const createdEntry: TimelineEntry = {
  id: 'tl-new',
  accountId: 'acct-1',
  eventType: 'manual_note',
  module: 'manual',
  title: 'Sponsor handoff',
  description: 'Reviewed sponsor transition with the account team.',
  performedBy: 'usr-admin',
  performedByName: 'KAM Super Admin',
  timestamp: '2026-06-11T10:00:00Z',
  isSensitive: false,
  isSystemGenerated: false,
  isImmutable: false,
}

function page<T>(items: T[]) {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 100,
    pages: items.length ? 1 : 0,
  }
}

function renderDialog(onAdded = vi.fn()) {
  return render(
    <MemoryRouter>
      <AddNoteModal accountId="acct-1" open onOpenChange={vi.fn()} onAdded={onAdded} />
    </MemoryRouter>,
  )
}

describe('AddNoteModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(getTimelineEventTypes).mockResolvedValue(page([customNoteType]))
    vi.mocked(createTimelineNote).mockResolvedValue(createdEntry)
  })

  it('renders a structured account event dialog', async () => {
    renderDialog()

    expect(await screen.findByRole('heading', { name: /add timeline event/i })).toBeInTheDocument()
    expect(screen.getByText(/Log a dated account update/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/event title/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/event type/i)).toBeInTheDocument()
    expect(screen.getByText(/event date/i)).toBeInTheDocument()
    expect(screen.getByText(/event details/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save event/i })).toBeEnabled()
  })

  it('submits the event title and description with the selected timeline type', async () => {
    const onAdded = vi.fn()
    const user = userEvent.setup()
    renderDialog(onAdded)

    await waitFor(() => expect(screen.getByRole('button', { name: /save event/i })).toBeEnabled())
    await user.type(screen.getByLabelText(/event title/i), 'Sponsor handoff')
    await user.type(screen.getByPlaceholderText(/write the account update/i), 'Reviewed sponsor transition with the account team.')
    await user.click(screen.getByRole('button', { name: /save event/i }))

    await waitFor(() => {
      expect(createTimelineNote).toHaveBeenCalledWith(
        'test-token',
        'acct-1',
        expect.objectContaining({
          event_type: 'manual_note',
          title: 'Sponsor handoff',
          description: 'Reviewed sponsor transition with the account team.',
        }),
      )
    })
    expect(onAdded).toHaveBeenCalledWith(createdEntry)
  })

  it('shows a setup state when no active timeline types exist', async () => {
    vi.mocked(getTimelineEventTypes).mockResolvedValue(page([]))

    renderDialog()

    expect(await screen.findByText(/no active timeline types/i)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /open timeline settings/i })).toHaveAttribute('href', '/admin?section=timeline')
    expect(screen.getByRole('button', { name: /save event/i })).toBeDisabled()
  })
})

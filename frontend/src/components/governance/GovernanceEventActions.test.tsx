import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GovernanceEventActions } from '@/components/governance/GovernanceEventActions'
import type { GovernanceEventRecord } from '@/types/governance'

const updateEventMock = vi.hoisted(() => vi.fn())
const deleteEventMock = vi.hoisted(() => vi.fn())
const toastSuccessMock = vi.hoisted(() => vi.fn())
const toastErrorMock = vi.hoisted(() => vi.fn())

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('@/stores/governanceStore', () => ({
  useGovernanceStore: (selector: (state: { updateEvent: typeof updateEventMock; deleteEvent: typeof deleteEventMock }) => unknown) => selector({
    updateEvent: updateEventMock,
    deleteEvent: deleteEventMock,
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: toastSuccessMock,
    error: toastErrorMock,
  },
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
  attendeeEmails: ['client@example.com'],
  attendees: ['client@example.com'],
  actionItemRecords: [],
  actionItems: [],
  notes: [],
  decisions: [],
  generatedOutputs: [],
  status: 'upcoming',
}

describe('GovernanceEventActions', () => {
  beforeEach(() => {
    updateEventMock.mockReset()
    deleteEventMock.mockReset()
    toastSuccessMock.mockReset()
    toastErrorMock.mockReset()
  })

  it('opens a populated edit flow and submits governance updates', async () => {
    updateEventMock.mockResolvedValue({ ...eventRecord, agenda: 'Updated governance agenda.' })
    render(<GovernanceEventActions event={eventRecord} />)

    await userEvent.click(screen.getByRole('button', { name: /edit qbr governance event/i }))
    expect(screen.getByDisplayValue('Review delivery health.')).toBeInTheDocument()

    await userEvent.clear(screen.getByLabelText(/agenda/i))
    await userEvent.type(screen.getByLabelText(/agenda/i), 'Updated governance agenda.')
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => expect(updateEventMock).toHaveBeenCalled())
    expect(updateEventMock).toHaveBeenCalledWith('test-token', 'gov-1', expect.objectContaining({
      governanceType: 'QBR',
      agenda: 'Updated governance agenda.',
      attendeeEmails: ['client@example.com'],
    }))
    expect(toastSuccessMock).toHaveBeenCalledWith('Governance event updated')
  })

  it('confirms governance deletion before calling the store', async () => {
    deleteEventMock.mockResolvedValue(undefined)
    render(<GovernanceEventActions event={eventRecord} />)

    await userEvent.click(screen.getByRole('button', { name: /delete qbr governance event/i }))
    expect(screen.getByRole('heading', { name: /delete governance event/i })).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /delete event/i }))

    await waitFor(() => expect(deleteEventMock).toHaveBeenCalledWith('test-token', 'gov-1'))
    expect(toastSuccessMock).toHaveBeenCalledWith('Governance event deleted')
  })
})

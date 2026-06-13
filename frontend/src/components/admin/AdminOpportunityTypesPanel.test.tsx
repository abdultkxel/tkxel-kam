import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AdminOpportunityTypesPanel } from '@/components/admin/AdminOpportunityTypesPanel'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

vi.mock('sonner', () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

const opportunityTypes = [
  {
    id: 'type-expansion',
    slug: 'expansion',
    name: 'Expansion',
    description: 'Grow an existing account.',
    is_active: true,
    display_order: 10,
    in_use_count: 3,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  },
  {
    id: 'type-rescue',
    slug: 'rescue_recovery',
    name: 'Rescue/Recovery',
    description: 'Recover a risky relationship.',
    is_active: false,
    display_order: 20,
    in_use_count: 1,
    created_at: '2026-06-01T00:00:00Z',
    updated_at: '2026-06-01T00:00:00Z',
  },
]

interface StageItem {
  id: string
  slug: string
  name: string
  is_terminal: boolean
  requires_outcome_reason: boolean
  is_active: boolean
  display_order: number
  in_use_count: number
}

interface TransitionItem {
  id: string
  from_stage: string
  to_stage: string
  is_active: boolean
  requires_reason: boolean
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

function page(items: typeof opportunityTypes) {
  return {
    items,
    total: items.length,
    page: 1,
    page_size: 100,
    pages: 1,
  }
}

describe('AdminOpportunityTypesPanel', () => {
  function stubOpportunityTypeFetch(config: { stageItems?: StageItem[]; transitionItems?: TransitionItem[] } = {}) {
    const stageItems = [...(config.stageItems ?? [
      {
        id: 'stage-1',
        slug: 'identified',
        name: 'Identified',
        is_terminal: false,
        requires_outcome_reason: false,
        is_active: true,
        display_order: 10,
        in_use_count: 1,
      },
      {
        id: 'stage-2',
        slug: 'qualified',
        name: 'Qualified',
        is_terminal: false,
        requires_outcome_reason: false,
        is_active: true,
        display_order: 20,
        in_use_count: 0,
      },
    ])]
    const transitionItems = [...(config.transitionItems ?? [
      {
        id: 'transition-1',
        from_stage: 'Identified',
        to_stage: 'Qualified',
        is_active: true,
        requires_reason: false,
      },
    ])]
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      const method = init?.method ?? 'GET'
      if (url.includes('/api/admin/opportunity-types/type-rescue') && init?.method === 'PATCH') {
        return jsonResponse({ ...opportunityTypes[1], is_active: true })
      }
      if (url.includes('/api/admin/opportunity-types')) {
        return jsonResponse(page(opportunityTypes))
      }
      if (url.includes('/api/admin/opportunity-stages') && method === 'POST') {
        const payload = JSON.parse(String(init?.body))
        const item = {
          id: 'stage-new',
          slug: payload.slug,
          name: payload.name,
          is_terminal: payload.is_terminal ?? false,
          requires_outcome_reason: payload.requires_outcome_reason ?? false,
          is_active: payload.is_active ?? true,
          display_order: payload.display_order ?? 0,
          in_use_count: 0,
        }
        stageItems.push(item)
        stageItems.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
        return jsonResponse(item)
      }
      if (url.includes('/api/admin/opportunity-stages/') && method === 'PATCH') {
        const stageId = url.split('/').pop()
        const payload = JSON.parse(String(init?.body))
        const index = stageItems.findIndex(item => item.id === stageId)
        const item = { ...(stageItems[index] ?? stageItems[0]), ...payload }
        if (index >= 0) stageItems[index] = item
        stageItems.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name))
        return jsonResponse(item)
      }
      if (url.includes('/api/admin/opportunity-stages')) {
        return jsonResponse(stageItems)
      }
      if (url.includes('/api/admin/opportunity-stage-transitions') && method === 'PUT') {
        const payload = JSON.parse(String(init?.body))
        transitionItems.splice(0, transitionItems.length, ...payload.transitions.map((item: Omit<TransitionItem, 'id'>, index: number) => ({
          id: `transition-${index + 1}`,
          ...item,
        })))
        return jsonResponse(transitionItems)
      }
      if (url.includes('/api/admin/opportunity-stage-transitions')) {
        return jsonResponse(transitionItems)
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)
    return fetchMock
  }

  it('shows an explicit edit action that loads the type into the form', async () => {
    stubOpportunityTypeFetch()
    const user = userEvent.setup()

    render(<AdminOpportunityTypesPanel />)

    await user.click(await screen.findByRole('button', { name: /edit expansion/i }))

    expect(screen.getByLabelText(/^name$/i)).toHaveValue('Expansion')
    expect(screen.getByLabelText(/^slug$/i)).toHaveValue('expansion')
    expect(screen.getByLabelText(/^display order$/i)).toHaveValue(10)
    expect(screen.getByLabelText(/^description$/i)).toHaveValue('Grow an existing account.')
    expect(screen.getByRole('checkbox', { name: /^active$/i })).toBeChecked()
  })

  it('shows a reactivate action for inactive types and patches them active', async () => {
    const fetchMock = stubOpportunityTypeFetch()
    const user = userEvent.setup()

    render(<AdminOpportunityTypesPanel />)

    await user.click(await screen.findByRole('button', { name: /reactivate rescue\/recovery/i }))

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/admin/opportunity-types/type-rescue'),
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ is_active: true }),
        }),
      )
    })
  })

  it('hosts opportunity workflow settings in the opportunities admin panel', async () => {
    stubOpportunityTypeFetch()

    render(<AdminOpportunityTypesPanel />)

    expect(await screen.findByRole('region', { name: 'Stages and transitions' })).toBeInTheDocument()
    expect(screen.getByText('Pipeline stages')).toBeInTheDocument()
    expect(screen.getByText('Stage transitions')).toBeInTheDocument()
  })

  it('blocks linked stage deactivation and adds a stage from the dialog with placement ordering', async () => {
    const fetchMock = stubOpportunityTypeFetch()
    const user = userEvent.setup()

    render(<AdminOpportunityTypesPanel />)

    const workflowRegion = await screen.findByRole('region', { name: 'Stages and transitions' })
    expect(within(workflowRegion).queryByLabelText(/^order$/i)).not.toBeInTheDocument()
    expect(within(workflowRegion).getByText('identified')).toBeInTheDocument()
    expect(within(workflowRegion).getByText(/order 10/i)).toBeInTheDocument()
    expect(within(workflowRegion).getByText('Locked while records use this stage')).toBeInTheDocument()
    expect(within(workflowRegion).getByRole('button', { name: /identified has linked opportunities/i })).toBeDisabled()

    await user.click(within(workflowRegion).getByRole('button', { name: /disable qualified/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/opportunity-stages/stage-2') || init?.method !== 'PATCH') return false
      const payload = JSON.parse(String(init.body))
      return payload.is_active === false
    })).toBe(true))

    await waitFor(() => expect(screen.getByRole('button', { name: /enable qualified/i })).toBeInTheDocument())
    const refreshedWorkflowRegion = screen.getByRole('region', { name: 'Stages and transitions' })
    await user.click(within(refreshedWorkflowRegion).getByRole('button', { name: /add stage/i }))
    const dialog = screen.getByRole('dialog', { name: /add stage/i })
    await user.type(within(dialog).getByLabelText(/^name$/i), 'Kickoff Review')
    await user.type(within(dialog).getByLabelText(/^slug$/i), 'kickoff_review')
    await user.selectOptions(within(dialog).getByLabelText(/^placement$/i), 'start')
    await user.click(within(dialog).getByRole('button', { name: /add stage/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/opportunity-stages') || init?.method !== 'POST') return false
      const payload = JSON.parse(String(init.body))
      return payload.slug === 'kickoff_review'
    })).toBe(true))

    await waitFor(() => {
      const stageUpdates = fetchMock.mock.calls
        .filter(call => String(call[0]).includes('/api/admin/opportunity-stages/') && call[1]?.method === 'PATCH')
        .map(call => ({ url: String(call[0]), payload: JSON.parse(String(call[1]?.body)) }))

      expect(stageUpdates.some(update => update.url.endsWith('/stage-new') && update.payload.display_order === 10)).toBe(true)
      expect(stageUpdates.some(update => update.url.endsWith('/stage-1') && update.payload.display_order === 20)).toBe(true)
      expect(stageUpdates.some(update => update.url.endsWith('/stage-2') && update.payload.display_order === 30)).toBe(true)
    })
  })

  it('reorders stages from the reorder dialog and normalizes display order', async () => {
    const fetchMock = stubOpportunityTypeFetch({
      stageItems: [
        {
          id: 'stage-1',
          slug: 'identified',
          name: 'Identified',
          is_terminal: false,
          requires_outcome_reason: false,
          is_active: true,
          display_order: 1,
          in_use_count: 1,
        },
        {
          id: 'stage-2',
          slug: 'qualified',
          name: 'Qualified',
          is_terminal: false,
          requires_outcome_reason: false,
          is_active: true,
          display_order: 2,
          in_use_count: 0,
        },
        {
          id: 'stage-3',
          slug: 'proposal_sent',
          name: 'Proposal Sent',
          is_terminal: false,
          requires_outcome_reason: false,
          is_active: true,
          display_order: 3,
          in_use_count: 0,
        },
      ],
    })
    const user = userEvent.setup()

    render(<AdminOpportunityTypesPanel />)

    const workflowRegion = await screen.findByRole('region', { name: 'Stages and transitions' })
    await user.click(within(workflowRegion).getByRole('button', { name: /reorder stages/i }))
    const dialog = screen.getByRole('dialog', { name: /reorder stages/i })
    await user.click(within(dialog).getByRole('button', { name: /move up proposal sent/i }))
    await user.click(within(dialog).getByRole('button', { name: /save order/i }))

    await waitFor(() => {
      const stageUpdates = fetchMock.mock.calls
        .filter(call => String(call[0]).includes('/api/admin/opportunity-stages/') && call[1]?.method === 'PATCH')
        .map(call => ({ url: String(call[0]), payload: JSON.parse(String(call[1]?.body)) }))

      expect(stageUpdates.some(update => update.url.endsWith('/stage-1') && update.payload.display_order === 10)).toBe(true)
      expect(stageUpdates.some(update => update.url.endsWith('/stage-3') && update.payload.display_order === 20)).toBe(true)
      expect(stageUpdates.some(update => update.url.endsWith('/stage-2') && update.payload.display_order === 30)).toBe(true)
    })
  })

  it('groups transitions by source stage and removes a transition through replace-all save', async () => {
    const fetchMock = stubOpportunityTypeFetch()
    const user = userEvent.setup()

    render(<AdminOpportunityTypesPanel />)

    const workflowRegion = await screen.findByRole('region', { name: 'Stages and transitions' })
    expect(within(workflowRegion).getByRole('button', { name: /remove transition identified to qualified/i })).toBeInTheDocument()

    await user.click(within(workflowRegion).getByRole('button', { name: /remove transition identified to qualified/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/opportunity-stage-transitions') || init?.method !== 'PUT') return false
      const payload = JSON.parse(String(init.body))
      return Array.isArray(payload.transitions) && payload.transitions.length === 0
    })).toBe(true))
  })

  it('adds a transition from a grouped row while excluding duplicate and self targets', async () => {
    const fetchMock = stubOpportunityTypeFetch({
      stageItems: [
        {
          id: 'stage-1',
          slug: 'identified',
          name: 'Identified',
          is_terminal: false,
          requires_outcome_reason: false,
          is_active: true,
          display_order: 10,
          in_use_count: 0,
        },
        {
          id: 'stage-2',
          slug: 'qualified',
          name: 'Qualified',
          is_terminal: false,
          requires_outcome_reason: false,
          is_active: true,
          display_order: 20,
          in_use_count: 0,
        },
        {
          id: 'stage-3',
          slug: 'proposal_sent',
          name: 'Proposal Sent',
          is_terminal: false,
          requires_outcome_reason: false,
          is_active: true,
          display_order: 30,
          in_use_count: 0,
        },
      ],
    })
    const user = userEvent.setup()

    render(<AdminOpportunityTypesPanel />)

    const workflowRegion = await screen.findByRole('region', { name: 'Stages and transitions' })
    await user.click(within(workflowRegion).getByRole('button', { name: /add transition from identified/i }))
    const dialog = screen.getByRole('dialog', { name: /add transition/i })
    const toStageSelect = within(dialog).getByLabelText(/to stage/i)
    expect(within(toStageSelect).queryByRole('option', { name: 'Identified' })).not.toBeInTheDocument()
    expect(within(toStageSelect).queryByRole('option', { name: 'Qualified' })).not.toBeInTheDocument()
    expect(within(toStageSelect).getByRole('option', { name: 'Proposal Sent' })).toBeInTheDocument()

    await user.click(within(dialog).getByLabelText(/reason required/i))
    await user.click(within(dialog).getByLabelText(/also allow reverse move/i))
    await user.click(within(dialog).getByRole('button', { name: /add transition/i }))

    await waitFor(() => expect(fetchMock.mock.calls.some(call => {
      const [url, init] = call
      if (!String(url).endsWith('/api/admin/opportunity-stage-transitions') || init?.method !== 'PUT') return false
      const payload = JSON.parse(String(init.body))
      return (
        payload.transitions.some((item: { from_stage: string; to_stage: string; requires_reason: boolean }) =>
          item.from_stage === 'Identified' && item.to_stage === 'Proposal Sent' && item.requires_reason,
        ) &&
        payload.transitions.some((item: { from_stage: string; to_stage: string; requires_reason: boolean }) =>
          item.from_stage === 'Proposal Sent' && item.to_stage === 'Identified' && item.requires_reason,
        )
      )
    })).toBe(true))
  })
})

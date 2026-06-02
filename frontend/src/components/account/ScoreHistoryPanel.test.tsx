import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ScoreHistoryPanel } from '@/components/account/ScoreHistoryPanel'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ token: 'test-token' }),
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function page(items: unknown[], pages = 1) {
  return { items, total: items.length, page: 1, page_size: 10, pages }
}

const snapshots = [
  {
    id: 'snap-2',
    account_id: 'acct-1',
    engagement_id: null,
    scope: 'account',
    overall: 72,
    rag_status: 'amber',
    drivers: [
      { key: 'relationship', label: 'Relationship', score: 68 },
      { key: 'resource', label: 'Resource', score: 75 },
    ],
    reason_codes: [],
    metric_version: 'account-scoring-v2',
    freshness_status: 'fresh',
    is_dirty: false,
    trend: 12,
    status: 'complete',
    source_context: {},
    calculated_by_name: 'Account Manager',
    calculated_at: '2026-06-02T10:00:00Z',
    created_at: '2026-06-02T10:00:00Z',
  },
  {
    id: 'snap-1',
    account_id: 'acct-1',
    engagement_id: null,
    scope: 'account',
    overall: 60,
    rag_status: 'amber',
    drivers: [
      { key: 'relationship', label: 'Relationship', score: 58 },
      { key: 'resource', label: 'Resource', score: 62 },
    ],
    reason_codes: [],
    metric_version: 'account-scoring-v1',
    freshness_status: 'stale',
    is_dirty: true,
    trend: 0,
    status: 'incomplete',
    source_context: {},
    calculated_by_name: 'System',
    calculated_at: '2026-05-20T10:00:00Z',
    created_at: '2026-05-20T10:00:00Z',
  },
]

describe('ScoreHistoryPanel', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('loads snapshots, sends filters, and compares two score versions', async () => {
    let resolveInitial: (response: Response) => void = () => undefined
    const pendingInitial = new Promise<Response>(resolve => {
      resolveInitial = resolve
    })
    let requests = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/accounts/acct-1/score-snapshots')) {
        requests += 1
        return requests === 1 ? pendingInitial : jsonResponse(page(snapshots, 2))
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <ScoreHistoryPanel accountId="acct-1" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Loading score snapshot history...')).toBeInTheDocument()
    resolveInitial(jsonResponse(page(snapshots, 2)))

    expect(await screen.findByText('account-scoring-v2')).toBeInTheDocument()
    expect(screen.getByText('Changed by Account Manager')).toBeInTheDocument()

    await userEvent.selectOptions(screen.getAllByRole('combobox')[0], 'red')
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('rag_status=red'))).toBe(true))

    await userEvent.type(screen.getByPlaceholderText('Metric slug'), 'relationship_health')
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('metric_slug=relationship_health'))).toBe(true))

    const compareButtons = screen.getAllByRole('button', { name: /compare/i })
    await userEvent.click(compareButtons[0])
    await userEvent.click(compareButtons[1])

    expect(await screen.findByText('Delta')).toBeInTheDocument()
    expect(screen.getByText(/^overall$/i)).toBeInTheDocument()
  })

  it('shows empty and error states for snapshot history', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(page([], 0)))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Snapshot API failed' }, 500))
    vi.stubGlobal('fetch', fetchMock)

    const { rerender } = render(
      <MemoryRouter>
        <ScoreHistoryPanel accountId="acct-empty" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('No score snapshots have been recorded yet.')).toBeInTheDocument()

    rerender(
      <MemoryRouter>
        <ScoreHistoryPanel accountId="acct-error" />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Snapshot API failed')).toBeInTheDocument()
  })
})

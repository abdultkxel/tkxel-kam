import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AttentionCenter } from '@/pages/AttentionCenter'
import { useAccountStore } from '@/stores/accountStore'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: {
      id: 'usr-am',
      name: 'Account Manager',
      email: 'account.manager.user@tkxel.com',
      role: 'account_manager',
      avatarInitials: 'AM',
    },
  }),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const account = {
  id: 'acct-1',
  name: 'Signals Workspace',
  segment: 'Growth',
  tags: [],
  ownerId: 'usr-am',
  ownerName: 'Account Manager',
  ownerEmail: 'account.manager.user@tkxel.com',
  stage: 'Active',
  riskStatus: 'warning',
  arr: 250000,
  nextQbr: '2026-06-30T00:00:00Z',
  health: { overall: 54, relationship: 48, usage: 64, delivery: 56, commercial: 61 },
  stakeholders: [],
  risks: [],
} as const

const signal = {
  id: 'sig-1',
  account_id: account.id,
  engagement_id: null,
  rule_id: 'rule-1',
  signal_type: 'weak_metric',
  severity: 'critical',
  status: 'new',
  owner_id: 'usr-am',
  owner_name: 'Account Manager',
  title: 'Signals Workspace health score requires attention',
  detail: 'Account health is below green threshold.',
  reason_codes: [{ code: 'weak_csat', label: 'CSAT is below red threshold' }],
  evidence_json: [{ type: 'score_snapshot', label: 'Latest health score', value: 54 }],
  citations_json: [],
  source_record_type: 'score_snapshot',
  source_record_id: 'score-1',
  source_record_route: `/accounts/${account.id}?tab=health`,
  confidence: 100,
  condition_key: `${account.id}:weak_metric`,
  due_at: '2026-06-03T12:00:00Z',
  created_at: '2026-06-01T12:00:00Z',
  updated_at: '2026-06-01T12:00:00Z',
} as const

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, page_size: 12, pages: items.length ? 1 : 0 }
}

describe('AttentionCenter', () => {
  beforeEach(() => {
    useAccountStore.setState({ accounts: [account] as never })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows loading state, sends filters, opens signal evidence, and updates lifecycle status', async () => {
    let resolveSignals: (response: Response) => void = () => undefined
    const pendingSignals = new Promise<Response>(resolve => {
      resolveSignals = resolve
    })
    let listRequests = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/signals/sig-1/status') && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toMatchObject({ status: 'reviewed' })
        return jsonResponse({ ...signal, status: 'reviewed', updated_at: '2026-06-02T12:00:00Z' })
      }
      if (url.includes('/api/signals/sig-1/evidence')) return jsonResponse({ signal_id: signal.id, evidence: signal.evidence_json, citations: [] })
      if (url.includes('/api/signals/sig-1/recommended-playbooks')) {
        return jsonResponse([
          {
            template: { id: 'tpl-1', name: 'Health Recovery', objective: 'Recover weak score drivers.' },
            rationale: 'Matched weak CSAT signal.',
            match_score: 95,
            matched_signal_types: ['weak_metric'],
            matched_metrics: ['csat'],
          },
        ])
      }
      if (url.includes('/api/attention-center')) {
        listRequests += 1
        return listRequests === 1 ? pendingSignals : jsonResponse(page([signal]))
      }
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <AttentionCenter />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/loading attention queue/i)).toBeInTheDocument()
    resolveSignals(jsonResponse(page([signal])))
    expect(await screen.findByText(signal.title)).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/search signal/i), 'health')
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('search=health'))).toBe(true))

    await userEvent.click(screen.getByText(signal.title))
    expect(await screen.findByText('Latest health score')).toBeInTheDocument()
    expect(await screen.findByText('Health Recovery')).toBeInTheDocument()

    await userEvent.click(screen.getAllByRole('button', { name: /review/i })[0])
    await waitFor(() => expect(screen.getAllByText('reviewed').length).toBeGreaterThan(0))
  })
})

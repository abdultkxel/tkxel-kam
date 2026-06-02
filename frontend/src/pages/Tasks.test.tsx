import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Tasks } from '@/pages/Tasks'
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

const task = {
  id: 'task-1',
  account_id: account.id,
  engagement_id: null,
  playbook_execution_id: 'exec-1',
  source_type: 'playbook',
  source_record_id: 'exec-1',
  source_record_route: '/tasks',
  title: 'Backend recovery task',
  description: 'Review weak score drivers.',
  owner_id: 'usr-am',
  owner_name: 'Account Manager',
  due_at: '2026-06-05T12:00:00Z',
  status: 'todo',
  priority: 'high',
  notes: null,
  evidence_json: [],
  outcome: null,
  skip_reason: null,
  completed_at: null,
  created_by_name: 'Account Manager',
  created_at: '2026-06-01T12:00:00Z',
  updated_at: '2026-06-01T12:00:00Z',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function page<T>(items: T[]) {
  return { items, total: items.length, page: 1, page_size: 100, pages: items.length ? 1 : 0 }
}

describe('Tasks page backend work queue', () => {
  beforeEach(() => {
    useAccountStore.setState({ accounts: [account] as never })
  })

  it('shows loading state, renders backend tasks and signals, and updates task status', async () => {
    let resolveTasks: (response: Response) => void = () => undefined
    const pendingTasks = new Promise<Response>(resolve => {
      resolveTasks = resolve
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/tasks/task-1') && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toMatchObject({ status: 'in_progress' })
        return jsonResponse({ ...task, status: 'in_progress', updated_at: '2026-06-02T12:00:00Z' })
      }
      if (url.includes('/api/tasks')) return pendingTasks
      if (url.includes('/api/attention-center')) {
        return jsonResponse(
          page([
            {
              id: 'sig-1',
              account_id: account.id,
              engagement_id: null,
              rule_id: 'rule-1',
              signal_type: 'weak_metric',
              severity: 'critical',
              status: 'new',
              owner_id: 'usr-am',
              owner_name: 'Account Manager',
              title: 'Backend weak signal',
              detail: 'Account health is below threshold.',
              reason_codes: [{ code: 'weak_health', label: 'Weak health score' }],
              evidence_json: [{ label: 'Health score', value: 54 }],
              citations_json: [],
              source_record_route: `/accounts/${account.id}?tab=health`,
              confidence: 100,
              due_at: '2026-06-04T12:00:00Z',
              created_at: '2026-06-01T12:00:00Z',
              updated_at: '2026-06-01T12:00:00Z',
            },
          ]),
        )
      }
      if (url.includes('/api/admin/playbook-templates')) {
        return jsonResponse(
          page([
            {
              id: 'tpl-1',
              slug: 'health_recovery',
              name: 'Health Recovery',
              objective: 'Recover weak health.',
              signal_types: ['weak_metric'],
              weak_metrics: ['health'],
              activities_json: [{ title: 'Review drivers', description: 'Review evidence.', priority: 'high', due_offset_days: 2 }],
              status: 'active',
              is_active: true,
              current_version: 1,
              updated_at: '2026-06-01T12:00:00Z',
            },
          ]),
        )
      }
      return jsonResponse(page([]))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Tasks />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/loading tasks, signals, and playbooks/i)).toBeInTheDocument()
    resolveTasks(jsonResponse(page([task])))
    expect(await screen.findByText('Backend recovery task')).toBeInTheDocument()
    expect(await screen.findByText('Backend weak signal')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: /mark in progress/i }))

    await waitFor(() => expect(screen.getByText('in progress')).toBeInTheDocument())
  })

  it('shows backend error state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ detail: 'Forbidden' }, 403)))

    render(
      <MemoryRouter>
        <Tasks />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Task data could not be loaded')).toBeInTheDocument()
    expect(screen.getByText('Forbidden')).toBeInTheDocument()
  })
})

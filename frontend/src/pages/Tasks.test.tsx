import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
  template_activity_id: 'activity-1',
  source_type: 'opportunity_action_item',
  source_record_id: 'exec-1',
  source_metric: 'health',
  title: 'Backend recovery task',
  description: 'Review weak score drivers.',
  owner_id: 'usr-am',
  owner_name: 'Account Manager',
  due_at: '2026-06-05T12:00:00Z',
  status: 'open',
  priority: 'high',
  notes: null,
  outcome: null,
  success_criteria: ['Recovery owner confirmed'],
  requires_evidence: true,
  skipped_reason: null,
  completed_at: null,
  evidence: [],
  created_at: '2026-06-01T12:00:00Z',
  updated_at: '2026-06-01T12:00:00Z',
}

const legacyTodoTask = {
  ...task,
  id: 'task-legacy-todo',
  title: 'Legacy todo dashboard task',
  status: 'todo',
  priority: 'critical',
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

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('shows loading state, renders backend tasks, sends filters, and updates task status', async () => {
    let resolveTasks: (response: Response) => void = () => undefined
    const pendingTasks = new Promise<Response>(resolve => {
      resolveTasks = resolve
    })
    let taskListRequests = 0
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/custom-fields')) return jsonResponse([])
      if (url.includes('/api/tasks/task-1') && init?.method === 'PATCH') {
        expect(JSON.parse(String(init.body))).toMatchObject({ status: 'in_progress' })
        return jsonResponse({ ...task, status: 'in_progress', updated_at: '2026-06-02T12:00:00Z' })
      }
      if (url.includes('/api/tasks')) {
        taskListRequests += 1
        return taskListRequests === 1 ? pendingTasks : jsonResponse(page([task]))
      }
      return jsonResponse(page([]))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter>
        <Tasks />
      </MemoryRouter>,
    )

    expect(await screen.findByText(/loading tasks/i)).toBeInTheDocument()
    resolveTasks(jsonResponse(page([task])))
    expect(await screen.findByText('Backend recovery task')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /kanban/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getAllByText('Open').length).toBeGreaterThan(0)
    expect(screen.getAllByText('Opportunity action').length).toBeGreaterThan(0)

    await userEvent.type(screen.getByPlaceholderText(/search title/i), 'recovery')
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('search=recovery'))).toBe(true))

    await userEvent.click(screen.getByRole('button', { name: /start/i }))

    await waitFor(() => expect(screen.getAllByText(/in progress/i).length).toBeGreaterThan(2))
  })

  it('applies dashboard tile query filters to the backend task request', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/custom-fields')) return jsonResponse([])
      if (url.includes('/api/tasks')) return jsonResponse(page([task]))
      return jsonResponse(page([]))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/tasks?status=in_progress&due=overdue&my_items=true&account_id=acct-1&view=list']}>
        <Tasks />
      </MemoryRouter>,
    )

    await screen.findByText('Backend recovery task')
    expect(screen.getByRole('button', { name: /list/i })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('option', { name: /opportunity action/i })).toHaveValue('opportunity_action_item')
    await waitFor(() => {
      const taskRequest = fetchMock.mock.calls.find(call => String(call[0]).includes('/api/tasks'))
      expect(String(taskRequest?.[0])).toContain('status=in_progress')
      expect(String(taskRequest?.[0])).toContain('my_items=true')
      expect(String(taskRequest?.[0])).toContain('account_id=acct-1')
      expect(String(taskRequest?.[0])).toContain('due_to=')
    })
  })

  it('renders legacy todo tasks as open work from dashboard open-task links', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/custom-fields')) return jsonResponse([])
      if (url.includes('/api/tasks')) return jsonResponse(page([legacyTodoTask]))
      return jsonResponse(page([]))
    })
    vi.stubGlobal('fetch', fetchMock)

    render(
      <MemoryRouter initialEntries={['/tasks?status=open']}>
        <Tasks />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Legacy todo dashboard task')).toBeInTheDocument()
    expect(screen.getByText('critical')).toBeInTheDocument()
    expect(screen.getAllByText('1 task').length).toBeGreaterThan(0)
    await waitFor(() => {
      const taskRequest = fetchMock.mock.calls.find(call => String(call[0]).includes('/api/tasks'))
      expect(String(taskRequest?.[0])).toContain('status=open')
    })
  })

  it('shows backend error state', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input)
        if (url.includes('/api/custom-fields')) return jsonResponse([])
        if (url.includes('/api/tasks')) return jsonResponse({ detail: 'Forbidden' }, 403)
        return jsonResponse({})
      }),
    )

    render(
      <MemoryRouter>
        <Tasks />
      </MemoryRouter>,
    )

    expect(await screen.findByText('Forbidden')).toBeInTheDocument()
  })
})

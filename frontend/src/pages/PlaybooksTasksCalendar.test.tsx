import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GovernancePanel } from '@/components/governance/GovernancePanel'
import { Playbook } from '@/pages/Playbook'
import { Tasks } from '@/pages/Tasks'
import { useAccountStore } from '@/stores/accountStore'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    token: 'test-token',
    user: { id: 'usr-admin', name: 'Admin User', role: 'admin', email: 'admin@example.com', avatarInitials: 'AU' },
  }),
}))

const account = {
  id: 'account-playbook',
  name: 'Playbook Customer',
  segment: 'Enterprise',
  tags: ['Enterprise'],
  ownerId: 'usr-admin',
  ownerName: 'Admin User',
  stage: 'Renewal Focus',
  riskStatus: 'warning',
  arr: 500000,
  nextQbr: '2026-06-30T00:00:00Z',
  health: { overall: 64, relationship: 58, usage: 72, delivery: 62, commercial: 60 },
  stakeholders: [],
  risks: [],
}

const template = {
  id: 'tpl-1',
  name: 'Renewal readiness recovery',
  objective: 'Recover renewal confidence before notice deadline.',
  description: 'Coordinate executive and commercial readiness.',
  signal_types: ['notice_window'],
  weak_metrics: ['commercial'],
  default_owner_rule: 'account_primary_am',
  due_date_rule: { basis: 'execution_date', offset_days: 7 },
  success_criteria: ['Renewal owner confirmed'],
  skip_rules: ['Client renewed'],
  version: 1,
  is_active: true,
  created_at: '2026-05-31T00:00:00Z',
  updated_at: '2026-05-31T00:00:00Z',
  activities: [
    {
      id: 'act-1',
      template_id: 'tpl-1',
      title: 'Confirm renewal owner',
      description: 'Identify the client-side renewal owner.',
      owner_rule: 'account_primary_am',
      due_offset_days: 3,
      priority: 'high',
      success_criteria: ['Owner identified'],
      skip_allowed: true,
      requires_evidence: true,
      sort_order: 0,
      created_at: '2026-05-31T00:00:00Z',
      updated_at: '2026-05-31T00:00:00Z',
    },
  ],
  custom_field_values: {},
}

const task = {
  id: 'task-1',
  account_id: 'account-playbook',
  engagement_id: null,
  playbook_execution_id: 'exec-1',
  source_type: 'playbook',
  source_record_id: 'signal-1',
  source_metric: 'commercial',
  title: 'Confirm renewal owner',
  description: 'Identify the client-side renewal owner.',
  owner_id: 'usr-admin',
  owner_name: 'Admin User',
  due_at: '2026-06-03T00:00:00Z',
  status: 'todo',
  priority: 'high',
  notes: '',
  outcome: '',
  success_criteria: ['Owner identified'],
  requires_evidence: true,
  skipped_reason: null,
  completed_at: null,
  evidence: [],
  created_at: '2026-05-31T00:00:00Z',
  updated_at: '2026-05-31T00:00:00Z',
}

function page<T>(items: T[], pageSize = 10) {
  return { items, total: items.length, page: 1, page_size: pageSize, pages: items.length ? 1 : 0 }
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

describe('playbooks, tasks, and calendar UI', () => {
  beforeEach(() => {
    useAccountStore.setState({ accounts: [account] as any })
  })

  it('loads playbook templates, sends recommendation filters, and executes a confirmed playbook', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/custom-fields')) return jsonResponse([])
      if (url.includes('/api/signals/') && url.includes('/recommended-playbooks')) return jsonResponse([{ template, rationale: 'Matched notice window.', match_score: 100, matched_signal_types: ['notice_window'], matched_metrics: ['commercial'] }])
      if (url.includes('/api/admin/playbook-templates')) return jsonResponse(page([template], 8))
      if (url.includes('/api/playbooks/tpl-1/execute') && init?.method === 'POST') return jsonResponse({ id: 'exec-1', template_id: 'tpl-1', template_name_snapshot: template.name, template_version_snapshot: 1, account_id: account.id, status: 'active', tasks: [task], created_at: '2026-05-31T00:00:00Z' }, 201)
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<Playbook />, { wrapper: MemoryRouter })

    expect(await screen.findByText('Renewal readiness recovery')).toBeInTheDocument()
    await userEvent.clear(screen.getByPlaceholderText('relationship_gap'))
    await userEvent.type(screen.getByPlaceholderText('relationship_gap'), 'notice_window')
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('signal_type=notice_window'))).toBe(true))

    await userEvent.click(screen.getAllByRole('button', { name: /execute/i })[0])
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/playbooks/tpl-1/execute') && call[1]?.method === 'POST')).toBe(true))
  })

  it('loads tasks, sends filters, and posts note evidence', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/custom-fields')) return jsonResponse([])
      if (url.includes('/api/tasks/task-1/evidence') && init?.method === 'POST') return jsonResponse({ id: 'ev-1', task_id: 'task-1', evidence_type: 'note', body: 'Evidence captured.', created_by_name: 'Admin User', created_at: '2026-05-31T00:00:00Z' }, 201)
      if (url.includes('/api/tasks')) return jsonResponse(page([task]))
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<Tasks />, { wrapper: MemoryRouter })

    expect(screen.getByText(/Loading tasks/i)).toBeInTheDocument()
    expect(await screen.findByText('Confirm renewal owner')).toBeInTheDocument()

    await userEvent.type(screen.getByPlaceholderText(/Search title/i), 'renewal')
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('search=renewal'))).toBe(true))

    await userEvent.type(screen.getByPlaceholderText('Evidence note'), 'Evidence captured.')
    await userEvent.click(screen.getByRole('button', { name: /add note evidence/i }))
    await waitFor(() => expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/tasks/task-1/evidence') && call[1]?.method === 'POST')).toBe(true))
  })

  it('loads unified calendar items from the backend calendar endpoint', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if (url.includes('/api/calendar/items')) {
        return jsonResponse(page([
          {
            id: 'task:task-1',
            kind: 'task',
            title: 'Confirm renewal owner',
            detail: 'Identify the client-side renewal owner.',
            account_id: account.id,
            account_name: account.name,
            owner_id: 'usr-admin',
            owner_name: 'Admin User',
            date: '2026-06-20T00:00:00Z',
            status: 'todo',
            priority: 'high',
            source_route: '/tasks',
            source_record_id: 'task-1',
            source_record_type: 'task',
          },
        ], 500))
      }
      if (url.includes('/api/governance-events')) return jsonResponse(page([]))
      return jsonResponse({})
    })
    vi.stubGlobal('fetch', fetchMock)

    render(<GovernancePanel />, { wrapper: MemoryRouter })

    expect(await screen.findByText('Confirm renewal owner')).toBeInTheDocument()
    expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/api/calendar/items'))).toBe(true)
  })
})

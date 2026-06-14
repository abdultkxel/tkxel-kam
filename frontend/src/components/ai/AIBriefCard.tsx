import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, Loader2, PencilLine, Sparkles, ThumbsDown, ThumbsUp } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '@/contexts/AuthContext'
import { useCapabilities } from '@/hooks/useCapabilities'
import { generateAISummary } from '@/services/aiSummary'
import { createTimelineNote } from '@/services/timeline'
import { Account } from '@/types/account'
import { GovernanceEventRecord } from '@/types/governance'
import { Opportunity } from '@/types/opportunity'
import { AISummary, SummaryType } from '@/types/aiSummary'
import { TimelineEntry } from '@/types/timeline'
import { UserRole } from '@/types/user'
import { cn } from '@/utils/cn'
import { formatRelative } from '@/utils/formatters'

const ONE_HOUR = 60 * 60 * 1000

function isFresh(summary?: AISummary) {
  return summary ? Date.now() - new Date(summary.generatedAt).getTime() < ONE_HOUR : false
}

function CitationLinks({ accountId, ids }: { accountId: string; ids: string[] }) {
  if (!ids.length) return null
  return (
    <span className="ml-1 inline-flex flex-wrap gap-1 align-middle">
      {ids.map(id => (
        <Link
          key={id}
          to={`/accounts/${accountId}?tab=timeline`}
          className="inline-flex rounded-full bg-blue-tint-20 px-2 py-0.5 text-[11px] font-semibold text-brand-blue hover:bg-brand-blue hover:text-white"
        >
          {id}
        </Link>
      ))}
    </span>
  )
}

export function AIBriefCard({
  account,
  entries,
  opportunities,
  governance,
  type = 'account_brief',
}: {
  account: Account
  entries: TimelineEntry[]
  opportunities: Opportunity[]
  governance: GovernanceEventRecord[]
  role: UserRole
  userId: string
  userName: string
  type?: SummaryType
}) {
  const { token } = useAuth()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState<AISummary | undefined>()
  const { capabilities } = useCapabilities()
  const privileged = capabilities.can_view_portfolio || capabilities.permission_keys.includes('ai:export')

  useEffect(() => {
    setSummary(undefined)
  }, [account.id, type])

  async function buildSummary(force = false) {
    if (!force && isFresh(summary)) return
    setLoading(true)
    try {
      const next = generateAISummary({ account, entries, opportunities, governance, type })
      setSummary(next)
    } finally {
      setLoading(false)
    }
  }

  function handleOpenChange(value: boolean) {
    setOpen(value)
    if (value) buildSummary(false)
  }

  function setFeedback(_: string, feedback: 'up' | 'down') {
    setSummary(current => current ? { ...current, feedback } : current)
  }

  async function editSummary() {
    const active = summary
    if (!active) return
    if (!token) {
      toast.error('You must be logged in to save AI brief edits')
      return
    }
    try {
      const entry = await createTimelineNote(token, account.id, {
        event_type: 'manual_note',
        title: 'Edited AI account brief',
        description: active.sections.map(section => `${section.title}: ${section.body}`).join('\n\n'),
        tags: ['ai-summary', 'quality-review'],
        mentions: [],
        attachments: [],
        is_sensitive: false,
      })
      setSummary({ ...active, editedNoteId: entry.id })
      toast.success('Edited summary saved as a linked timeline note')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Edited summary could not be saved')
    }
  }

  return (
    <Collapsible.Root open={open} onOpenChange={handleOpenChange} className="tk-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-surface-border p-5 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
            <Sparkles className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">AI Brief</p>
            <h3 className="text-base font-semibold text-ink">Account summary with cited timeline evidence</h3>
            <p className="mt-1 text-xs text-ink-secondary">
              {summary && isFresh(summary) ? `Cached ${formatRelative(summary.generatedAt)}` : 'One-click local synthesis, cached for 1 hour.'}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {open ? (
            <button className="tk-button-secondary" disabled={loading} onClick={() => buildSummary(true)}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              Refresh
            </button>
          ) : null}
          <Collapsible.Trigger className="tk-button-primary">
            {open ? 'Collapse' : 'Open AI brief'}
            <ChevronDown className={cn('h-4 w-4 transition-transform', open ? 'rotate-180' : '')} />
          </Collapsible.Trigger>
        </div>
      </div>

      <Collapsible.Content className="p-5">
        {loading ? (
          <div className="space-y-3">
            <div className="h-4 w-1/3 animate-pulse-soft rounded bg-surface-border" />
            <div className="h-4 w-full animate-pulse-soft rounded bg-surface-border" />
            <div className="h-4 w-5/6 animate-pulse-soft rounded bg-surface-border" />
          </div>
        ) : null}

        {summary && !loading ? (
          <div className="space-y-4">
            <div className="grid gap-3 lg:grid-cols-2">
              {summary.sections.map(section => (
                <article key={section.title} className="rounded-lg border border-surface-border bg-surface-tertiary p-4">
                  <h4 className="text-sm font-semibold text-ink">{section.title}</h4>
                  <p className="mt-2 text-sm leading-6 text-ink-secondary">
                    {section.body.replace(/\s*\[[^\]]+\]/g, '')}
                    <CitationLinks accountId={account.id} ids={section.citations} />
                  </p>
                </article>
              ))}
            </div>
            <div className="flex flex-col gap-3 rounded-lg border border-brand-blue/20 bg-blue-tint-20 p-4 md:flex-row md:items-center md:justify-between">
              <p className="text-xs font-medium text-ink-secondary">{summary.disclaimer}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  className={cn('tk-icon-button bg-white', summary.feedback === 'up' ? 'text-brand-blue' : '')}
                  onClick={() => setFeedback(summary.id, 'up')}
                  aria-label="Mark AI brief useful"
                >
                  <ThumbsUp className="h-4 w-4" />
                </button>
                <button
                  className={cn('tk-icon-button bg-white', summary.feedback === 'down' ? 'text-brand-orange' : '')}
                  onClick={() => setFeedback(summary.id, 'down')}
                  aria-label="Mark AI brief not useful"
                >
                  <ThumbsDown className="h-4 w-4" />
                </button>
                {privileged ? (
                  <button className="tk-button-secondary bg-white" onClick={editSummary}>
                    <PencilLine className="h-4 w-4" />
                    Edit summary
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        ) : null}
      </Collapsible.Content>
    </Collapsible.Root>
  )
}

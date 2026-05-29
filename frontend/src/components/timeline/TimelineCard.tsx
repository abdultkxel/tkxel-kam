import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, ExternalLink, Link as LinkIcon, Link2, Lock, MessageCircle, PenLine, Pencil, Send } from 'lucide-react'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { nanoid } from 'nanoid'
import { MentionText } from '@/components/collaboration/MentionText'
import { MentionTextarea } from '@/components/collaboration/MentionTextarea'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { useTimelineStore } from '@/stores/timelineStore'
import { TimelineEntry, MODULE_COLOURS } from '@/types/timeline'
import { cn } from '@/utils/cn'
import { emitTimelineEvent } from '@/utils/emitTimelineEvent'
import { formatRelative, titleize } from '@/utils/formatters'
import { extractMentionIds } from '@/utils/mentions'

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function Highlight({ text, query }: { text: string; query: string }): ReactNode {
  if (!query.trim()) return text
  const regex = new RegExp(`(${escapeRegExp(query.trim())})`, 'ig')
  return text.split(regex).map((part, index) =>
    part.toLowerCase() === query.trim().toLowerCase() ? (
      <mark key={`${part}-${index}`} className="rounded-sm bg-blue-tint-20 px-0.5 text-brand-blue">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

function diffRows(entry: TimelineEntry) {
  const before = entry.beforeValue ?? {}
  const after = entry.afterValue ?? {}
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]))
  return keys.map(key => ({ key, before: before[key], after: after[key], changed: String(before[key] ?? '') !== String(after[key] ?? '') }))
}

export function TimelineCard({ entry, searchQuery, flash = false }: { entry: TimelineEntry; searchQuery: string; flash?: boolean }) {
  const [expanded, setExpanded] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [commentText, setCommentText] = useState('')
  const user = useRole()
  const loggedSensitiveView = useRef(false)
  const addAccessAudit = useIntegrationStore(state => state.addAccessAudit)
  const accountName = useAccountStore(state => state.accounts.find(account => account.id === entry.accountId)?.name ?? 'Account')
  const allComments = useTimelineStore(state => state.comments)
  const addComment = useTimelineStore(state => state.addComment)
  const addNotification = useNotificationStore(state => state.addNotification)
  const comments = useMemo(
    () => allComments.filter(comment => comment.entryId === entry.id).sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
    [allComments, entry.id],
  )
  const rows = diffRows(entry)
  const canAnnotate = user.role === 'admin' && entry.isImmutable

  useEffect(() => {
    if (!entry.isSensitive || loggedSensitiveView.current) return
    loggedSensitiveView.current = true
    addAccessAudit({
      id: `audit-${entry.id}-${Date.now()}`,
      user: user.name,
      entryId: entry.id,
      timestamp: new Date().toISOString(),
      ip: '127.0.0.1',
      action: 'viewed',
    })
  }, [addAccessAudit, entry.id, entry.isSensitive, user.name])

  function annotate() {
    emitTimelineEvent({
      accountId: entry.accountId,
      eventType: 'manual_note',
      module: 'manual',
      title: `Annotation for ${entry.title}`,
      description: 'Admin annotation added to immutable event.',
      performedBy: user.id,
      performedByName: user.name,
      sourceRecordId: entry.id,
      sourceRecordType: 'timeline_entry',
      isSensitive: false,
      isSystemGenerated: false,
      isImmutable: false,
    })
    toast.success('Annotation added')
  }

  function submitComment() {
    const content = commentText.trim()
    if (!content) return
    const mentions = extractMentionIds(content)
    addComment({
      id: nanoid(),
      entryId: entry.id,
      authorId: user.id,
      authorName: user.name,
      content,
      timestamp: new Date().toISOString(),
      mentions,
    })
    if (entry.performedBy !== user.id) {
      addNotification({
        userId: entry.performedBy,
        trigger: 'timeline_comment',
        sentence: `${user.name} commented on your timeline note`,
        accountId: entry.accountId,
        accountName,
        contentPreview: content.replace(/@\{([^}]+)\}/g, '@mention').slice(0, 120),
        route: `/accounts/${entry.accountId}`,
      })
    }
    mentions.forEach(mentionedUserId => {
      addNotification({
        userId: mentionedUserId,
        trigger: 'timeline_mention',
        sentence: `${user.name} mentioned you in a timeline comment`,
        accountId: entry.accountId,
        accountName,
        contentPreview: content.replace(/@\{([^}]+)\}/g, '@mention').slice(0, 120),
        route: `/accounts/${entry.accountId}`,
      })
    })
    setCommentText('')
    setCommentsOpen(true)
    toast.success('Comment added')
  }

  return (
    <article
      className={cn(
        'tk-card border-l-[3px] p-4 transition-colors duration-300',
        MODULE_COLOURS[entry.module],
        entry.isSensitive ? 'border-brand-blue-dark/40' : '',
        flash ? 'ring-2 ring-brand-blue/30' : '',
      )}
    >
      <div className="flex items-start gap-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-brand-blue shadow-card">
          {entry.isSystemGenerated ? <LinkIcon className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider',
                entry.isSystemGenerated ? 'border-brand-blue/20 bg-brand-blue text-white' : 'border-surface-border bg-white text-ink-secondary',
              )}
            >
              {titleize(entry.eventType)}
            </span>
            {!entry.isSystemGenerated ? (
              <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-secondary">
                <PenLine className="h-3.5 w-3.5" />
                Added manually
              </span>
            ) : null}
            {entry.isSensitive ? <Lock className="ml-auto h-4 w-4 text-brand-blue-dark" /> : null}
          </div>
          <div className="mt-2 flex gap-3">
            <h3 className="min-w-0 flex-1 text-base font-semibold text-ink">
              <Highlight text={entry.title} query={searchQuery} />
            </h3>
            <time className="shrink-0 text-xs text-ink-secondary">{formatRelative(entry.timestamp)}</time>
          </div>
          <button className="mt-1 line-clamp-2 text-left text-sm leading-6 text-ink-secondary" onClick={() => setExpanded(value => !value)}>
            <MentionText text={entry.description} query={searchQuery} />
          </button>

          <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
            <span className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-tertiary text-[11px] font-bold text-brand-blue-dark">
                {entry.performedByName
                  .split(' ')
                  .map(part => part[0])
                  .join('')
                  .slice(0, 2)}
              </span>
              <Highlight text={entry.performedByName} query={searchQuery} />
            </span>
            {entry.sourceRecordRoute ? (
              <Link to={entry.sourceRecordRoute} className="inline-flex min-h-[44px] items-center gap-1 font-semibold text-brand-blue hover:text-brand-blue-dark">
                View {entry.sourceRecordType ?? 'record'}
                <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            ) : entry.sourceRecordId ? (
              <span className="text-ink-tertiary">Record archived</span>
            ) : null}
            {entry.isImmutable ? (
              <span className="inline-flex items-center gap-1 text-ink-secondary">
                <Link2 className="h-3.5 w-3.5" />
                Immutable
              </span>
            ) : (
              <span className="inline-flex gap-2">
                <button className="min-h-[44px] rounded-md px-2 font-semibold text-ink-secondary hover:bg-white">Edit</button>
                <button className="min-h-[44px] rounded-md px-2 font-semibold text-rag-red hover:bg-white">Delete</button>
              </span>
            )}
            {canAnnotate ? (
              <button className="min-h-[44px] rounded-md px-2 font-semibold text-brand-blue hover:bg-white" onClick={annotate}>
                Add annotation
              </button>
            ) : null}
            {!entry.isSystemGenerated ? (
              <button className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 font-semibold text-brand-blue hover:bg-white" onClick={() => setCommentsOpen(value => !value)}>
                <MessageCircle className="h-3.5 w-3.5" />
                {comments.length} comments
              </button>
            ) : null}
          </div>

          {rows.length ? (
            <Collapsible.Root className="mt-3" open={expanded} onOpenChange={setExpanded}>
              <Collapsible.Trigger className="inline-flex min-h-[44px] items-center gap-1 text-xs font-semibold text-brand-blue">
                What changed <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', expanded ? 'rotate-180' : '')} />
              </Collapsible.Trigger>
              <Collapsible.Content className="mt-2 overflow-hidden rounded-lg border border-surface-border bg-white">
                <table className="w-full text-left text-xs">
                  <thead className="bg-surface-tertiary text-ink-secondary">
                    <tr>
                      <th className="px-3 py-2 font-semibold uppercase tracking-wider">Field</th>
                      <th className="px-3 py-2 font-semibold uppercase tracking-wider">Before</th>
                      <th className="px-3 py-2 font-semibold uppercase tracking-wider">After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(row => (
                      <tr key={row.key} className="border-t border-surface-border">
                        <td className="px-3 py-2 font-medium text-ink">{titleize(row.key)}</td>
                        <td className={cn('px-3 py-2', row.changed ? 'font-semibold text-brand-orange' : 'text-ink-secondary')}>{String(row.before ?? '-')}</td>
                        <td className={cn('px-3 py-2', row.changed ? 'font-semibold text-brand-orange' : 'text-ink-secondary')}>{String(row.after ?? '-')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Collapsible.Content>
            </Collapsible.Root>
          ) : null}

          {!entry.isSystemGenerated && commentsOpen ? (
            <div className="mt-4 rounded-lg border border-surface-border bg-white p-3">
              <div className="space-y-3">
                {comments.length ? comments.map(comment => (
                  <div key={comment.id} className="rounded-lg bg-surface-tertiary p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="font-semibold text-ink">{comment.authorName}</span>
                      <span className="text-xs text-ink-secondary">{formatRelative(comment.timestamp)}</span>
                    </div>
                    <p className="leading-6 text-ink-secondary">
                      <MentionText text={comment.content} />
                    </p>
                  </div>
                )) : <p className="text-sm text-ink-secondary">No comments yet.</p>}
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                <MentionTextarea value={commentText} onChange={setCommentText} className="min-h-[80px]" placeholder="Add a comment with @mentions" />
                <button className="tk-button-primary self-end" onClick={submitComment}>
                  <Send className="h-4 w-4" />
                  Reply
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  )
}

import * as Collapsible from '@radix-ui/react-collapsible'
import { ChevronDown, ExternalLink, Link as LinkIcon, Link2, Loader2, Lock, MessageCircle, PenLine, Pencil, Send, Trash2 } from 'lucide-react'
import { ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { MentionText } from '@/components/collaboration/MentionText'
import { MentionTextarea } from '@/components/collaboration/MentionTextarea'
import { useAuth } from '@/contexts/AuthContext'
import { useCapabilities } from '@/hooks/useCapabilities'
import { useRole } from '@/hooks/useRole'
import { useAccountStore } from '@/stores/accountStore'
import { useIntegrationStore } from '@/stores/integrationStore'
import { useNotificationStore } from '@/stores/notificationStore'
import { createTimelineComment, deleteTimelineComment, getTimelineComments, updateTimelineComment } from '@/services/timeline'
import { TimelineComment, TimelineEntry, MODULE_COLOURS } from '@/types/timeline'
import { cn } from '@/utils/cn'
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
  const [comments, setComments] = useState<TimelineComment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentsError, setCommentsError] = useState('')
  const [editingCommentId, setEditingCommentId] = useState('')
  const [editingText, setEditingText] = useState('')
  const user = useRole()
  const { token } = useAuth()
  const { capabilities } = useCapabilities()
  const loggedSensitiveView = useRef(false)
  const addAccessAudit = useIntegrationStore(state => state.addAccessAudit)
  const accountName = useAccountStore(state => state.accounts.find(account => account.id === entry.accountId)?.name ?? 'Account')
  const addNotification = useNotificationStore(state => state.addNotification)
  const rows = diffRows(entry)
  const canAnnotate = capabilities.can_moderate_timeline && entry.isImmutable
  const canModerate = capabilities.can_moderate_timeline

  useEffect(() => {
    if (!commentsOpen || !token) return
    let active = true
    setCommentsLoading(true)
    setCommentsError('')
    getTimelineComments(token, entry.id)
      .then(result => {
        if (active) setComments(result.items)
      })
      .catch(err => {
        if (active) setCommentsError(err instanceof Error ? err.message : 'Comments could not be loaded')
      })
      .finally(() => {
        if (active) setCommentsLoading(false)
      })
    return () => {
      active = false
    }
  }, [commentsOpen, entry.id, token])

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
    setCommentsOpen(true)
    setCommentText(`Annotation for ${entry.title}: `)
  }

  async function submitComment() {
    const content = commentText.trim()
    if (!content) return
    if (!token) {
      setCommentsError('You must be logged in to comment.')
      return
    }
    const mentions = extractMentionIds(content)
    setCommentsError('')
    try {
      const comment = await createTimelineComment(token, entry.id, content, mentions)
      setComments(items => [...items, comment])
      if (entry.performedBy !== user.id) {
        addNotification({
          userId: entry.performedBy,
          trigger: 'timeline_comment',
          sentence: `${user.name} commented on your timeline note`,
          accountId: entry.accountId,
          accountName,
          contentPreview: 'A timeline comment was added. Open the account to view authorized details.',
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
          contentPreview: 'You were mentioned in a timeline comment. Open the account to view authorized details.',
          route: `/accounts/${entry.accountId}`,
        })
      })
      setCommentText('')
      setCommentsOpen(true)
      toast.success('Comment added')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Comment could not be saved'
      setCommentsError(message)
      toast.error(message)
    }
  }

  async function saveComment(comment: TimelineComment) {
    if (!token) return
    const body = editingText.trim()
    if (!body) return
    const mentions = extractMentionIds(body)
    try {
      const updated = await updateTimelineComment(token, entry.id, comment.id, body, mentions)
      setComments(items => items.map(item => (item.id === updated.id ? updated : item)))
      setEditingCommentId('')
      setEditingText('')
      toast.success('Comment updated')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Comment could not be updated')
    }
  }

  async function removeComment(comment: TimelineComment) {
    if (!token) return
    try {
      await deleteTimelineComment(token, entry.id, comment.id)
      setComments(items => items.filter(item => item.id !== comment.id))
      toast.success('Comment deleted')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Comment could not be deleted')
    }
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
            <button className="inline-flex min-h-[44px] items-center gap-1 rounded-md px-2 font-semibold text-brand-blue hover:bg-white" onClick={() => setCommentsOpen(value => !value)}>
              <MessageCircle className="h-3.5 w-3.5" />
              {comments.length} comments
            </button>
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

          {commentsOpen ? (
            <div className="mt-4 rounded-lg border border-surface-border bg-white p-3">
              <div className="space-y-3">
                {commentsLoading ? (
                  <div className="flex items-center gap-2 text-sm text-ink-secondary">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading comments
                  </div>
                ) : null}
                {commentsError ? <p className="rounded-md border border-rag-red/20 bg-rag-red/10 p-2 text-xs font-medium text-rag-red">{commentsError}</p> : null}
                {!commentsLoading && comments.length ? comments.map(comment => (
                  <div key={comment.id} className="rounded-lg bg-surface-tertiary p-3 text-sm">
                    <div className="mb-1 flex items-center justify-between gap-3">
                      <span className="font-semibold text-ink">{comment.authorName}</span>
                      <span className="flex items-center gap-2 text-xs text-ink-secondary">
                        {formatRelative(comment.timestamp)}
                        {comment.authorId === user.id || canModerate ? (
                          <>
                            <button className="font-semibold text-brand-blue" onClick={() => {
                              setEditingCommentId(comment.id)
                              setEditingText(comment.content)
                            }}>Edit</button>
                            <button className="font-semibold text-rag-red" onClick={() => void removeComment(comment)}>
                              <Trash2 className="inline h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : null}
                      </span>
                    </div>
                    {editingCommentId === comment.id ? (
                      <div className="space-y-2">
                        <MentionTextarea value={editingText} onChange={setEditingText} className="min-h-[80px]" />
                        <div className="flex justify-end gap-2">
                          <button className="tk-button-secondary" onClick={() => setEditingCommentId('')}>Cancel</button>
                          <button className="tk-button-primary" onClick={() => void saveComment(comment)}>Save</button>
                        </div>
                      </div>
                    ) : (
                      <p className="leading-6 text-ink-secondary">
                        <MentionText text={comment.content} />
                      </p>
                    )}
                  </div>
                )) : null}
                {!commentsLoading && !comments.length ? <p className="text-sm text-ink-secondary">No comments yet.</p> : null}
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

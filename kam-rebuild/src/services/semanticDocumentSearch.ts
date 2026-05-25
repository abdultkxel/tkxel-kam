import { TimelineEntry, UserRole, canViewTimelineEntry } from '@/types/timeline'

export interface SemanticDocumentChunk {
  id: string
  accountId: string
  entryId: string
  documentName: string
  pageNumber: number
  excerpt: string
  sourceLabel: string
  score: number
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .split(/\W+/)
    .map(token => token.trim())
    .filter(token => token.length > 2)
}

function scoreChunk(query: string, text: string) {
  const queryTokens = new Set(tokenize(query))
  if (!queryTokens.size) return 0
  const textTokens = tokenize(text)
  return textTokens.reduce((score, token) => score + (queryTokens.has(token) ? 1 : 0), 0) / queryTokens.size
}

function chunksForEntry(entry: TimelineEntry): SemanticDocumentChunk[] {
  const noteChunk: SemanticDocumentChunk[] =
    entry.eventType === 'manual_note' || entry.module === 'governance' || entry.module === 'kyc'
      ? [
          {
            id: `chunk-${entry.id}-note`,
            accountId: entry.accountId,
            entryId: entry.id,
            documentName: entry.module === 'governance' ? 'Governance meeting notes' : 'Timeline note',
            pageNumber: 1,
            excerpt: `${entry.title}. ${entry.description}`,
            sourceLabel: `Found in: ${entry.module === 'governance' ? 'Governance meeting notes' : 'Timeline note'}, page 1`,
            score: 0,
          },
        ]
      : []

  const attachmentChunks =
    entry.attachments?.map((attachment, index) => ({
      id: `chunk-${entry.id}-${index}`,
      accountId: entry.accountId,
      entryId: entry.id,
      documentName: attachment.name,
      pageNumber: 1,
      excerpt: `${entry.title}. ${entry.description}. Attached document ${attachment.name}.`,
      sourceLabel: `Found in: ${attachment.name}, page 1`,
      score: 0,
    })) ?? []

  return [...noteChunk, ...attachmentChunks]
}

export function searchDocumentChunks({
  accountId,
  query,
  role,
  userId,
  entries,
}: {
  accountId: string
  query: string
  role: UserRole
  userId: string
  entries: TimelineEntry[]
}): SemanticDocumentChunk[] {
  return entries
    .filter(entry => entry.accountId === accountId)
    .filter(entry => canViewTimelineEntry(entry, role, userId))
    .flatMap(chunksForEntry)
    .map(chunk => ({ ...chunk, score: scoreChunk(query, chunk.excerpt) }))
    .filter(chunk => chunk.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
}

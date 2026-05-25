import { ReactNode } from 'react'
import { displayMention } from '@/utils/mentions'

function highlightText(text: string, query?: string): ReactNode {
  if (!query?.trim()) return text
  const normalized = query.trim().toLowerCase()
  const parts = text.split(new RegExp(`(${normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig'))
  return parts.map((part, index) =>
    part.toLowerCase() === normalized ? (
      <mark key={`${part}-${index}`} className="rounded-sm bg-blue-tint-20 px-0.5 text-brand-blue">
        {part}
      </mark>
    ) : (
      part
    ),
  )
}

export function MentionText({ text, query }: { text: string; query?: string }) {
  const nodes: ReactNode[] = []
  const pattern = /@\{([^}]+)\}/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text))) {
    if (match.index > lastIndex) nodes.push(highlightText(text.slice(lastIndex, match.index), query))
    nodes.push(
      <span key={`${match[1]}-${match.index}`} className="inline-flex items-center rounded-full bg-blue-tint-20 px-2 py-0.5 text-xs font-semibold text-brand-blue">
        @{displayMention(match[1])}
      </span>,
    )
    lastIndex = pattern.lastIndex
  }

  if (lastIndex < text.length) nodes.push(highlightText(text.slice(lastIndex), query))
  return <>{nodes}</>
}

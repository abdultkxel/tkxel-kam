import { cn } from '@/utils/cn'
import { ReactNode } from 'react'

type Tone = 'green' | 'amber' | 'red'

const toneClass: Record<Tone, string> = {
  green: 'bg-rag-green/10 text-rag-green border-rag-green/20',
  amber: 'bg-brand-orange/10 text-brand-orange border-brand-orange/20',
  red: 'bg-rag-red/10 text-rag-red border-rag-red/20',
}

export function RAGBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', toneClass[tone], className)}>
      {children}
    </span>
  )
}

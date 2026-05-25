import { cn } from '@/utils/cn'

const toneClass = {
  green: 'bg-rag-green',
  amber: 'bg-brand-orange',
  red: 'bg-rag-red',
  blue: 'bg-brand-blue',
}

export function StatusDot({ tone = 'blue', className }: { tone?: keyof typeof toneClass; className?: string }) {
  return <span className={cn('h-2 w-2 rounded-full', toneClass[tone], className)} />
}

import type { AccountStage } from '@/types/account'
import { cn } from '@/utils/cn'

const accountStageSuccessClass = 'border-rag-green/20 bg-rag-green/10 text-rag-green'

export function accountStageBadgeClass(stage: AccountStage, defaultClassName: string) {
  return stage === 'Active' ? accountStageSuccessClass : defaultClassName
}

export function AccountStageBadge({
  stage,
  className,
  defaultClassName = 'border-surface-border text-ink-secondary',
}: {
  stage: AccountStage
  className?: string
  defaultClassName?: string
}) {
  return (
    <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider', accountStageBadgeClass(stage, defaultClassName), className)}>
      {stage}
    </span>
  )
}

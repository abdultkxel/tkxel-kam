import * as Tooltip from '@radix-ui/react-tooltip'
import { ExternalLink, PenLine } from 'lucide-react'
import { CSSProperties } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AccountStageBadge } from '@/components/account/AccountStageBadge'
import { RAGBadge } from '@/components/ui/RAGBadge'
import { Account } from '@/types/account'
import { cn } from '@/utils/cn'
import { formatCompactCurrency, formatDate } from '@/utils/formatters'

const tone = {
  healthy: 'green',
  warning: 'amber',
  critical: 'red',
} as const

function GhostAction({ label, icon: Icon, onClick }: { label: string; icon: typeof ExternalLink; onClick?: () => void }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button className="tk-icon-button bg-white" onClick={onClick} aria-label={label}>
          <Icon className="h-4 w-4" />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="z-50 rounded-md bg-ink px-2 py-1 text-xs text-white shadow-panel" sideOffset={6}>
          {label}
          <Tooltip.Arrow className="fill-ink" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  )
}

export function AccountCard({ account, className, style }: { account: Account; className?: string; style?: CSSProperties }) {
  const navigate = useNavigate()
  const detailPath = account.detailPath ?? `/accounts/${account.id}`
  const isDraft = account.recordType === 'onboarding_draft'
  const metricColumns = account.hasHealthScore ? 'sm:grid-cols-3' : 'sm:grid-cols-2'

  return (
    <Tooltip.Provider>
      <article style={style} className={cn('group relative tk-card p-5 transition-[border-color,box-shadow] hover:border-brand-blue/40 hover:shadow-panel', className)}>
        <div className="absolute right-3 top-3 flex items-center gap-1 opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
          <GhostAction label={isDraft ? 'Review draft' : 'View account'} icon={ExternalLink} onClick={() => navigate(detailPath)} />
          {!isDraft ? <GhostAction label="Add note" icon={PenLine} onClick={() => navigate(`/accounts/${account.id}?tab=notes&addNote=1`)} /> : null}
        </div>
        <div className="pr-20">
          <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">{account.segment}</p>
          <Link to={detailPath} className="mt-1 flex min-h-[44px] items-center rounded-md text-base font-semibold text-ink hover:text-brand-blue">
            {account.name}
          </Link>
          <p className="mt-1 text-xs text-ink-secondary">
            Owner: {account.ownerName}
            {account.ownerEmail ? <span className="block truncate">{account.ownerEmail}</span> : null}
          </p>
        </div>
        {!isDraft ? (
          <div className={cn('mt-5 grid grid-cols-1 gap-3', metricColumns)}>
            <div className="rounded-md bg-surface-secondary p-3">
              <p className="text-xs text-ink-secondary">ARR</p>
              <p className="font-display text-2xl font-bold text-ink">{formatCompactCurrency(account.arr)}</p>
            </div>
            {account.hasHealthScore ? (
              <div className="rounded-md bg-surface-secondary p-3">
                <p className="text-xs text-ink-secondary">Health</p>
                <p className="font-display text-2xl font-bold text-ink">{account.health.overall}</p>
              </div>
            ) : null}
            <div className="rounded-md bg-surface-secondary p-3">
              <p className="text-xs text-ink-secondary">Next QBR</p>
              <p className="text-sm font-semibold text-ink">{formatDate(account.nextQbr)}</p>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <RAGBadge tone={tone[account.riskStatus]}>{account.riskStatus}</RAGBadge>
          {isDraft ? <span className="rounded-full border border-brand-orange/30 bg-brand-orange/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-brand-orange">Draft</span> : null}
          <AccountStageBadge stage={account.stage} />
        </div>
      </article>
    </Tooltip.Provider>
  )
}

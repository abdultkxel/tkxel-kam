import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { AlertTriangle, CalendarClock, Filter, TrendingUp, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { AlertsOverview } from '@/components/alerts/AlertsOverview'
import { GovernanceDashboard } from '@/components/governance/GovernanceDashboard'
import { AnimatedNumber } from '@/components/ui/AnimatedNumber'
import { PageHeader } from '@/components/ui/PageHeader'
import { Skeleton } from '@/components/ui/Skeleton'
import { PortfolioAnalytics } from '@/pages/Analytics'
import { useAccountStore } from '@/stores/accountStore'
import { formatCompactCurrency } from '@/utils/formatters'
import { cn } from '@/utils/cn'

const healthTrend = [
  { month: 'Jan', score: 68 },
  { month: 'Feb', score: 71 },
  { month: 'Mar', score: 75 },
  { month: 'Apr', score: 73 },
  { month: 'May', score: 79 },
  { month: 'Jun', score: 82 },
]

function MetricCard({ title, value, format, icon: Icon, className }: { title: string; value: number; format?: (value: number) => string; icon: typeof Users; className?: string }) {
  return (
    <article className={cn('tk-card flex min-h-[172px] flex-col justify-between p-5', className)}>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-secondary">{title}</p>
          <AnimatedNumber value={value} format={format} className="mt-2 block font-display text-4xl font-bold text-ink" />
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-blue-tint-20 text-brand-blue">
          <Icon className="h-5 w-5" />
        </div>
      </div>
      <div className="mt-4 h-10 w-full overflow-hidden">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={healthTrend.slice(-6)}>
            <Area type="monotone" dataKey="score" stroke="currentColor" className="text-brand-blue" fill="currentColor" fillOpacity={0.2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </article>
  )
}

export function Dashboard() {
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('Priority')
  const accounts = useAccountStore(state => state.accounts)
  const atRiskArr = accounts.filter(item => item.riskStatus !== 'healthy').reduce((sum, item) => sum + item.arr, 0)
  const needsAttention = accounts.filter(item => item.riskStatus !== 'healthy').length
  const nextQbr = useMemo(() => accounts.filter(item => new Date(item.nextQbr) > new Date()).length, [accounts])

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 450)
    return () => window.clearTimeout(timer)
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        eyebrow="Portfolio command center"
        title="Dashboard"
        description="Content-first view of health, risk, analytics, upcoming governance, and account actions."
        actions={
          <a href="#alerts" className="tk-button-secondary">
            <Filter className="h-4 w-4" />
            Review filters
          </a>
        }
      />

      <div className="grid auto-rows-fr gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Accounts" value={accounts.length} icon={Users} />
        <MetricCard title="At-risk ARR" value={atRiskArr} format={formatCompactCurrency} icon={AlertTriangle} />
        <MetricCard title="Needs attention" value={needsAttention} icon={TrendingUp} />
        <MetricCard title="Next QBR" value={nextQbr} icon={CalendarClock} />
      </div>

      <AlertsOverview />

      <div className="mt-6 grid items-stretch gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="tk-card flex min-w-0 flex-col p-5">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-brand-blue">Portfolio health</p>
              <h2 className="text-base font-semibold text-ink">Health trend</h2>
            </div>
          </div>
          <div className="min-h-[260px] flex-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={healthTrend}>
                <defs>
                  <linearGradient id="healthFill" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="5%" stopColor="currentColor" className="text-brand-blue" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="currentColor" className="text-brand-blue" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="month" tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <YAxis tickLine={false} axisLine={false} tick={{ fill: 'currentColor' }} className="text-ink-secondary" />
                <Tooltip />
                <Area type="monotone" dataKey="score" stroke="currentColor" className="text-brand-blue" fill="url(#healthFill)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="tk-card flex min-w-0 flex-col p-5">
          <div className="mb-4 grid grid-cols-3 rounded-lg border border-surface-border bg-surface-tertiary p-1">
            {['Priority', 'Upcoming', 'Overdue'].map(item => (
              <button key={item} onClick={() => setTab(item)} className={cn('min-h-[44px] rounded-md px-3 text-sm font-semibold', tab === item ? 'bg-brand-blue text-white' : 'text-ink-secondary hover:bg-white')}>
                {item}
              </button>
            ))}
          </div>
          <div className="grid gap-3">
            {accounts.slice(0, 4).map(account => (
              <div key={account.id} className="min-h-[74px] rounded-lg border border-surface-border p-3">
                <p className="text-sm font-semibold text-ink">{account.name}</p>
                <p className="mt-1 text-xs text-ink-secondary">{tab} action: review {account.stage.toLowerCase()} motion with {account.ownerName}</p>
              </div>
            ))}
          </div>
        </section>
      </div>

      <GovernanceDashboard />

      <PortfolioAnalytics embedded />
    </div>
  )
}

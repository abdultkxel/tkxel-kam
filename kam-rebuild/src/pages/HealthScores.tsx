import { Radar, RadarChart, PolarAngleAxis, PolarGrid, ResponsiveContainer } from 'recharts'
import { PageHeader } from '@/components/ui/PageHeader'
import { Column, SortableTable } from '@/components/ui/SortableTable'
import { useAccountStore } from '@/stores/accountStore'
import { Account } from '@/types/account'

export function HealthScores() {
  const accounts = useAccountStore(state => state.accounts)
  const columns: Column<Account>[] = [
    { key: 'name', header: 'Account', sortable: true },
    { key: 'ownerName', header: 'AM', sortable: true },
    { key: 'stage', header: 'Stage', sortable: true },
    { key: 'riskStatus', header: 'Risk', sortable: true },
    { key: 'health', header: 'Score', sortable: false, render: account => <span className="font-semibold text-ink">{account.health.overall}</span> },
  ]
  const radarData = [
    { dimension: 'Relationship', score: Math.round(accounts.reduce((sum, account) => sum + account.health.relationship, 0) / accounts.length) },
    { dimension: 'Usage', score: Math.round(accounts.reduce((sum, account) => sum + account.health.usage, 0) / accounts.length) },
    { dimension: 'Delivery', score: Math.round(accounts.reduce((sum, account) => sum + account.health.delivery, 0) / accounts.length) },
    { dimension: 'Commercial', score: Math.round(accounts.reduce((sum, account) => sum + account.health.commercial, 0) / accounts.length) },
  ]

  return (
    <div>
      <PageHeader eyebrow="Portfolio scoring" title="Health Scores" description="Sortable portfolio score table with dimension comparison." />
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <SortableTable items={accounts} columns={columns} defaultSort={{ column: 'name', direction: 'asc' }} />
        <section className="tk-card p-5">
          <h2 className="mb-4 text-base font-semibold text-ink">Dimension comparison</h2>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dimension" />
                <Radar dataKey="score" stroke="currentColor" fill="currentColor" fillOpacity={0.25} className="text-brand-blue" />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  )
}

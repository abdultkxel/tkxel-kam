import { GovernancePanel } from '@/components/governance/GovernancePanel'
import { PageHeader } from '@/components/ui/PageHeader'

export function Governance() {
  return (
    <div>
      <PageHeader
        eyebrow="Governance cadence"
        title="Governance"
        description="QBRs, SteerCos, executive reviews, agendas, attendees, and action items."
      />
      <GovernancePanel />
    </div>
  )
}

import { useAuth, ROLE_LABELS } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { MOCK_ACCOUNTS } from "@/data/accounts";
import {
  getAMStats, getPortfolioStats, getHeatmapData, getSegmentSplit,
  getAlerts, getUpcomingGovernance, getOverdueActions,
  getPortfolioAverages, getAMPerformanceData, getRiskHeatmapData,
  getRenewalCalendar, getBillingForecast,
} from "@/data/dashboard";

import { SummaryRow } from "@/components/dashboard/SummaryRow";
import { HealthHeatmap } from "@/components/dashboard/HealthHeatmap";
import { SegmentDonut } from "@/components/dashboard/SegmentDonut";
import { AlertsPanel } from "@/components/dashboard/AlertsPanel";
import { GovernanceUpcoming } from "@/components/dashboard/GovernanceUpcoming";
import { OverdueTracker } from "@/components/dashboard/OverdueTracker";
import { PortfolioOverview } from "@/components/dashboard/PortfolioOverview";
import { AMPerformanceTable } from "@/components/dashboard/AMPerformanceTable";
import { RiskScatterPlot } from "@/components/dashboard/RiskScatterPlot";
import { RenewalCalendar } from "@/components/dashboard/RenewalCalendar";
import { BillingForecastChart } from "@/components/dashboard/BillingForecastTable";
import { ComparisonTable } from "@/components/dashboard/ComparisonTable";

export default function Dashboard() {
  const { user } = useAuth();
  if (!user) return null;

  const isAM = user.role === "am";
  const isLeadership = user.role === "leadership" || user.role === "admin";

  const accounts = isAM ? MOCK_ACCOUNTS.filter(a => a.amId === user.id) : MOCK_ACCOUNTS;
  const stats = isAM ? getAMStats(user.id) : getPortfolioStats();
  const heatmapData = getHeatmapData(accounts);
  const segmentData = getSegmentSplit(accounts);
  const alerts = getAlerts(accounts);
  const upcoming = getUpcomingGovernance();
  const overdue = getOverdueActions();

  return (
    <div className="space-y-6 max-w-[1400px]">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {isAM ? "My Dashboard" : "Portfolio Dashboard"}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Welcome back, {user.name} ·{" "}
          <Badge variant="secondary" className="text-xs bg-primary/10 text-primary border-0">
            {ROLE_LABELS[user.role]}
          </Badge>
        </p>
      </div>

      {/* Summary Row */}
      <SummaryRow {...stats} isAM={isAM} />

      {/* Row: Heatmap + Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <HealthHeatmap data={heatmapData} />
        </div>
        <div className="space-y-4">
          <SegmentDonut data={segmentData} />
          <AlertsPanel alerts={alerts} />
        </div>
      </div>

      {/* Governance + Overdue */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GovernanceUpcoming items={upcoming} />
        <OverdueTracker items={overdue} />
      </div>

      {/* Leadership-only sections */}
      {isLeadership && (
        <>
          <div className="border-t border-border pt-6 mt-2">
            <h2 className="text-lg font-semibold text-foreground mb-4">Portfolio Analytics</h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PortfolioOverview averages={getPortfolioAverages()} />
            <RiskScatterPlot data={getRiskHeatmapData()} />
          </div>

          <ComparisonTable data={heatmapData} />
          <AMPerformanceTable data={getAMPerformanceData()} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RenewalCalendar entries={getRenewalCalendar()} />
            <BillingForecastChart data={getBillingForecast()} />
          </div>
        </>
      )}
    </div>
  );
}

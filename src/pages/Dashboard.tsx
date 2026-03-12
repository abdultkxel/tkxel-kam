import { useMemo } from "react";
import { useAuth, ROLE_LABELS } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { MOCK_ACCOUNTS } from "@/data/accounts";
import {
  getSegmentSplit,
  getPortfolioAverages, getAMPerformanceData, getRiskHeatmapData,
  getRenewalCalendar, getBillingForecast, getDailyTasks, type DailyTask,
} from "@/data/dashboard";
import { useOpportunityDetail } from "@/contexts/OpportunityDetailContext";
import { useOpportunities } from "@/contexts/OpportunitiesContext";
import { MOCK_ACCOUNTS as ACCOUNTS_LIST } from "@/data/accounts";

import { SummaryRow } from "@/components/dashboard/SummaryRow";
import { ActionsPanel } from "@/components/dashboard/ActionsPanel";
import { PortfolioTable } from "@/components/dashboard/PortfolioTable";
import { SegmentDonut } from "@/components/dashboard/SegmentDonut";
import { ARRByRiskChart } from "@/components/dashboard/ARRByRiskChart";
import { MeetingsCalendar } from "@/components/dashboard/MeetingsCalendar";
import { DailyTasks } from "@/components/dashboard/DailyTasks";
import { PortfolioOverview } from "@/components/dashboard/PortfolioOverview";
import { AMPerformanceTable } from "@/components/dashboard/AMPerformanceTable";
import { RiskScatterPlot } from "@/components/dashboard/RiskScatterPlot";
import { RenewalCalendar } from "@/components/dashboard/RenewalCalendar";
import { BillingForecastChart } from "@/components/dashboard/BillingForecastTable";
import { ComparisonTable } from "@/components/dashboard/ComparisonTable";
import { PipelineWidget } from "@/components/dashboard/PipelineWidget";

export default function Dashboard() {
  const { user } = useAuth();
  const { tasks: oppTasks } = useOpportunityDetail();
  const { opportunities } = useOpportunities();

  const isAM = user?.role === "am";
  const isLeadership = user?.role === "leadership" || user?.role === "admin";
  const accounts = isAM ? MOCK_ACCOUNTS.filter(a => a.amId === user?.id) : MOCK_ACCOUNTS;
  const segmentData = getSegmentSplit(accounts);
  const baseTasks = getDailyTasks(isAM ? user?.id : undefined);




  // Merge opportunity tasks into daily tasks
  const dailyTasks = useMemo(() => {
    const today = "2026-03-12";
    const oppDailyTasks: DailyTask[] = oppTasks
      .filter(t => !t.completed && t.dueDate <= today)
      .map(t => {
        const opp = opportunities.find(o => o.id === t.opportunityId);
        const acc = opp ? ACCOUNTS_LIST.find(a => a.id === opp.accountId) : null;
        return {
          id: t.id,
          task: t.title,
          account: acc?.name || "",
          category: "opportunity" as const,
          priority: t.priority.toLowerCase() as DailyTask["priority"],
          dueDate: t.dueDate,
          completed: false,
          contextLabel: opp?.name,
        };
      });
    return [...baseTasks, ...oppDailyTasks];
  }, [baseTasks, oppTasks, opportunities]);

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

      {/* KPI Tiles */}
      <SummaryRow accounts={accounts} isAM={isAM} />

      {/* Actions + Today's Tasks + Pipeline */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <ActionsPanel accounts={accounts} />
        <DailyTasks tasks={dailyTasks} />
        <PipelineWidget />
      </div>

      {/* Portfolio Table + Sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2">
          <PortfolioTable accounts={accounts} />
        </div>
        <div className="space-y-4">
          <SegmentDonut data={segmentData} accounts={accounts} />
          <ARRByRiskChart accounts={accounts} />
        </div>
      </div>

      {/* Meetings Calendar */}
      <MeetingsCalendar />

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

          <ComparisonTable data={[]} />
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

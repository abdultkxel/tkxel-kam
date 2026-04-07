import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Zap, AlertCircle, FileWarning, Clock, CalendarClock, AlertTriangle, Shield, Presentation, TrendingUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Account } from "@/data/accounts";
import { MOCK_MEETINGS, getDueDateStatus } from "@/data/governance";
import { useOpportunities } from "@/contexts/OpportunitiesContext";
import { useOpportunityDetail } from "@/contexts/OpportunityDetailContext";
import { isOpenStage, formatCurrency } from "@/data/opportunities";

type TabKey = "priority" | "upcoming" | "overdue";

interface ActionRow {
  icon: React.ElementType;
  iconClass: string;
  bgClass: string;
  account: string;
  accountId: string;
  issue: string;
  actionLabel: string;
  badge?: string;
  badgeClass?: string;
}

// ── Derive priority actions ──
function derivePriority(accounts: Account[]): ActionRow[] {
  const rows: ActionRow[] = [];

  for (const a of accounts) {
    if (a.health.overall < 1.5) {
      rows.push({
        icon: AlertCircle, iconClass: "text-destructive", bgClass: "bg-destructive/10",
        account: a.name, accountId: a.id,
        issue: `Health score critical (${a.health.overall.toFixed(1)}/3.0)`,
        actionLabel: "Review Health", badge: "critical", badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
      });
    }
    const daysToEnd = Math.ceil((new Date(a.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (daysToEnd < 0) {
      rows.push({
        icon: FileWarning, iconClass: "text-destructive", bgClass: "bg-destructive/10",
        account: a.name, accountId: a.id,
        issue: `Contract expired ${Math.abs(daysToEnd)} days ago`,
        actionLabel: "Renew", badge: "critical", badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
      });
    } else if (daysToEnd <= 60) {
      rows.push({
        icon: FileWarning, iconClass: "text-rag-amber", bgClass: "bg-rag-amber/10",
        account: a.name, accountId: a.id,
        issue: `Contract expires in ${daysToEnd} days`,
        actionLabel: "Plan Renewal", badge: "high", badgeClass: "bg-rag-amber/10 text-rag-amber border-rag-amber/20",
      });
    }
  }

  for (const m of MOCK_MEETINGS) {
    for (const ai of m.actionItems) {
      if (ai.status !== "Complete" && getDueDateStatus(ai.dueDate) === "overdue") {
        rows.push({
          icon: Clock, iconClass: "text-destructive", bgClass: "bg-destructive/10",
          account: m.accountName || m.type, accountId: "",
          issue: `"${ai.task}" overdue (${ai.owner})`,
          actionLabel: "Resolve", badge: "critical", badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
        });
      }
    }
  }
  return rows.slice(0, 6);
}

// ── Derive upcoming actions ──
function deriveUpcoming(accounts: Account[]): ActionRow[] {
  const rows: ActionRow[] = [];
  const now = new Date();

  // Upcoming governance
  const upcoming = MOCK_MEETINGS
    .filter(m => m.status === "Planned" && new Date(m.scheduledDate) >= now)
    .sort((a, b) => new Date(a.scheduledDate).getTime() - new Date(b.scheduledDate).getTime());

  const typeIcons: Record<string, { icon: React.ElementType; cls: string; bg: string }> = {
    QBR: { icon: Presentation, cls: "text-primary", bg: "bg-primary/10" },
    SteerCo: { icon: Shield, cls: "text-info", bg: "bg-info/10" },
  };

  for (const m of upcoming) {
    const days = Math.ceil((new Date(m.scheduledDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    const tc = typeIcons[m.type] || typeIcons.QBR;
    rows.push({
      icon: tc.icon, iconClass: tc.cls, bgClass: tc.bg,
      account: m.accountName || m.type, accountId: m.accountId || "",
      issue: `${m.type}: ${m.agenda} — ${days}d remaining`,
      actionLabel: "Prepare",
      badge: m.type, badgeClass: "bg-muted text-muted-foreground border-border",
    });
  }

  // Upcoming renewals
  for (const a of accounts) {
    const days = Math.ceil((new Date(a.contractEnd).getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    if (days > 0 && days <= 120) {
      rows.push({
        icon: CalendarClock, iconClass: "text-rag-amber", bgClass: "bg-rag-amber/10",
        account: a.name, accountId: a.id,
        issue: `Contract renewal in ${days} days (${a.contractEnd})`,
        actionLabel: "View",
        badge: `${days}d`, badgeClass: days <= 60 ? "bg-rag-amber/10 text-rag-amber border-rag-amber/20" : "bg-muted text-muted-foreground border-border",
      });
    }
  }

  return rows.slice(0, 6);
}

// ── Derive overdue actions ──
function deriveOverdue(accounts: Account[]): ActionRow[] {
  const rows: ActionRow[] = [];

  for (const m of MOCK_MEETINGS) {
    for (const ai of m.actionItems) {
      if (ai.status !== "Complete" && getDueDateStatus(ai.dueDate) === "overdue") {
        const daysOver = Math.ceil((Date.now() - new Date(ai.dueDate).getTime()) / (1000 * 60 * 60 * 24));
        rows.push({
          icon: Clock, iconClass: "text-destructive", bgClass: "bg-destructive/10",
          account: m.accountName || m.type, accountId: m.accountId || "",
          issue: `"${ai.task}" — ${ai.owner} (${daysOver}d overdue)`,
          actionLabel: "Resolve",
          badge: `${daysOver}d late`, badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
        });
      }
    }
  }

  // Expired contracts
  for (const a of accounts) {
    const days = Math.ceil((new Date(a.contractEnd).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (days < 0) {
      rows.push({
        icon: FileWarning, iconClass: "text-destructive", bgClass: "bg-destructive/10",
        account: a.name, accountId: a.id,
        issue: `Contract expired ${Math.abs(days)} days ago`,
        actionLabel: "Renew",
        badge: "expired", badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
      });
    }
  }

  return rows.slice(0, 6);
}

const tabs: { key: TabKey; label: string; icon: React.ElementType }[] = [
  { key: "priority", label: "Priority", icon: Zap },
  { key: "upcoming", label: "Upcoming", icon: CalendarClock },
  { key: "overdue", label: "Overdue", icon: AlertTriangle },
];

export function ActionsPanel({ accounts }: { accounts: Account[] }) {
  const [activeTab, setActiveTab] = useState<TabKey>("priority");
  const navigate = useNavigate();
  const { opportunities } = useOpportunities();
  const { tasks: oppTasks } = useOpportunityDetail();
  const today = new Date("2026-03-12");

  // Derive opportunity-related actions
  const oppPriorityRows: ActionRow[] = [];
  const oppUpcomingRows: ActionRow[] = [];
  const oppOverdueRows: ActionRow[] = [];

  // High-value deals closing soon
  const openOpps = opportunities.filter(o => isOpenStage(o.stage));
  for (const opp of openOpps) {
    const daysToClose = Math.ceil((new Date(opp.targetClose).getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const acc = accounts.find(a => a.id === opp.accountId);
    if (daysToClose <= 30 && daysToClose >= 0) {
      oppPriorityRows.push({
        icon: TrendingUp, iconClass: "text-primary", bgClass: "bg-primary/10",
        account: acc?.name || opp.name, accountId: "",
        issue: `"${opp.name}" closes in ${daysToClose}d (${formatCurrency(opp.estimatedValue)})`,
        actionLabel: "View",
        badge: `${daysToClose}d`, badgeClass: daysToClose <= 14 ? "bg-rag-amber/10 text-rag-amber border-rag-amber/20" : "bg-muted text-muted-foreground border-border",
      });
      oppUpcomingRows.push({
        icon: TrendingUp, iconClass: "text-primary", bgClass: "bg-primary/10",
        account: acc?.name || opp.name, accountId: "",
        issue: `"${opp.name}" target close ${opp.targetClose}`,
        actionLabel: "View",
        badge: opp.stage, badgeClass: "bg-primary/10 text-primary border-primary/20",
      });
    } else if (daysToClose < 0) {
      oppOverdueRows.push({
        icon: TrendingUp, iconClass: "text-destructive", bgClass: "bg-destructive/10",
        account: acc?.name || opp.name, accountId: "",
        issue: `"${opp.name}" target close overdue by ${Math.abs(daysToClose)}d (${formatCurrency(opp.estimatedValue)})`,
        actionLabel: "Update",
        badge: "overdue", badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
      });
    }
  }

  // Overdue opportunity tasks
  for (const t of oppTasks) {
    if (!t.completed && new Date(t.dueDate) < today) {
      const opp = opportunities.find(o => o.id === t.opportunityId);
      const daysOver = Math.ceil((today.getTime() - new Date(t.dueDate).getTime()) / (1000 * 60 * 60 * 24));
      oppOverdueRows.push({
        icon: Clock, iconClass: "text-destructive", bgClass: "bg-destructive/10",
        account: opp?.name || "Opportunity", accountId: "",
        issue: `"${t.title}" — ${t.owner} (${daysOver}d overdue)`,
        actionLabel: "Resolve",
        badge: `${daysOver}d late`, badgeClass: "bg-destructive/10 text-destructive border-destructive/20",
      });
    }
  }

  const dataMap: Record<TabKey, ActionRow[]> = {
    priority: [...derivePriority(accounts), ...oppPriorityRows].slice(0, 8),
    upcoming: [...deriveUpcoming(accounts), ...oppUpcomingRows].slice(0, 8),
    overdue: [...deriveOverdue(accounts), ...oppOverdueRows].slice(0, 8),
  };

  const rows = dataMap[activeTab];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Actions</CardTitle>
          <div className="flex bg-muted rounded-lg p-0.5 gap-0.5">
            {tabs.map(tab => {
              const Icon = tab.icon;
              const count = dataMap[tab.key].length;
              const isActive = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                    isActive
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  {tab.label}
                  {count > 0 && (
                    <span className={`ml-0.5 text-[10px] font-semibold ${
                      isActive
                        ? tab.key === "overdue" ? "text-destructive" : tab.key === "priority" ? "text-rag-amber" : "text-primary"
                        : ""
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-[320px]">
          {rows.length === 0 ? (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-muted-foreground">
                {activeTab === "overdue" ? "No overdue actions 🎉" : activeTab === "upcoming" ? "No upcoming actions" : "No priority actions"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {rows.map((row, i) => {
                const Icon = row.icon;
                return (
                  <div key={i} className="flex items-center gap-3 px-6 py-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 ${row.bgClass}`}>
                      <Icon className={`h-4 w-4 ${row.iconClass}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground">{row.account}</p>
                      <p className="text-xs text-muted-foreground line-clamp-1">{row.issue}</p>
                    </div>
                    {row.badge && (
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${row.badgeClass}`}>
                        {row.badge}
                      </Badge>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs shrink-0"
                      onClick={() => {
                        if (row.accountId) navigate(`/accounts/${row.accountId}`);
                      }}
                    >
                      {row.actionLabel}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}

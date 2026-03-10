import { useParams, useNavigate } from "react-router-dom";
import { MOCK_ACCOUNTS, RAG_STYLES, getRagColor, type RiskStatus } from "@/data/accounts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users, FileText, Cpu, Calendar, Clock, Activity } from "lucide-react";
import { KycTab } from "@/components/kyc/KycTab";
import { StrategyTab } from "@/components/strategy/StrategyTab";

export default function AccountDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const account = MOCK_ACCOUNTS.find(a => a.id === id);

  if (!account) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Account not found.</p>
        <Button variant="ghost" onClick={() => navigate("/accounts")} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to Accounts
        </Button>
      </div>
    );
  }

  const overallRag = getRagColor(account.health.overall);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/accounts")} className="mt-0.5 flex-shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold text-foreground">{account.name}</h1>
            <Badge variant="secondary" className={`text-xs font-semibold uppercase tracking-wide ${account.segment === "Growth" ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
              {account.segment}
            </Badge>
            <RiskPill status={account.riskStatus} />
          </div>
          <div className="flex items-center gap-4 mt-1.5 text-sm text-muted-foreground flex-wrap">
            <span>AM: <span className="font-medium text-foreground">{account.amName}</span></span>
            <span>·</span>
            <span>{account.industry}</span>
            <span>·</span>
            <span>{account.arr} ARR</span>
            <span>·</span>
            <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Updated {account.lastUpdated}</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList className="bg-muted p-1 h-auto flex-wrap">
          <TabsTrigger value="overview" className="text-xs">Overview</TabsTrigger>
          <TabsTrigger value="kyc" className="text-xs">KYC</TabsTrigger>
          <TabsTrigger value="strategy" className="text-xs">Strategy & Plan</TabsTrigger>
          <TabsTrigger value="health" className="text-xs">Health Scores</TabsTrigger>
          <TabsTrigger value="governance" className="text-xs">Governance</TabsTrigger>
          <TabsTrigger value="financials" className="text-xs">Financials</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Health Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <HealthCard label="Overall Health" score={account.health.overall} icon={Activity} />
            <HealthCard label="Relationship" score={account.health.relationship} icon={Users} />
            <HealthCard label="Contract" score={account.health.contract} icon={FileText} />
            <HealthCard label="Resource" score={account.health.resource} icon={Cpu} />
          </div>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />
                <div className="space-y-6">
                  {account.activities.map((activity) => {
                    const typeColors: Record<string, string> = {
                      meeting: "bg-info",
                      review: "bg-primary",
                      escalation: "bg-rag-red",
                      update: "bg-rag-amber",
                      milestone: "bg-rag-green",
                    };
                    return (
                      <div key={activity.id} className="relative pl-8">
                        <div className={`absolute left-1.5 top-1 h-3 w-3 rounded-full border-2 border-background ${typeColors[activity.type] || "bg-muted-foreground"}`} />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-foreground">{activity.title}</span>
                            <Badge variant="outline" className="text-[10px] capitalize">{activity.type}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">{activity.description}</p>
                          <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                            <Calendar className="h-3 w-3" /> {activity.date}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* KYC Tab */}
        <TabsContent value="kyc">
          <KycTab account={account} />
        </TabsContent>

        {/* Strategy Tab */}
        <TabsContent value="strategy">
          <Card>
            <CardHeader><CardTitle className="text-base">Strategy & Plan</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="text-sm font-medium text-foreground mb-2">Account Strategy</h4>
                  <p className="text-sm text-muted-foreground">
                    {account.segment === "Growth"
                      ? "Focus on expansion through new service lines and deepening executive relationships. Target 20% ARR growth over next 12 months."
                      : "Priority on retention through service quality improvement and proactive risk management. Ensure smooth contract renewal."
                    }
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50">
                  <h4 className="text-sm font-medium text-foreground mb-2">Key Objectives</h4>
                  <ul className="space-y-2 text-sm text-muted-foreground">
                    <li className="flex items-start gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />Strengthen executive-level relationships</li>
                    <li className="flex items-start gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />Improve delivery predictability</li>
                    <li className="flex items-start gap-2"><span className="h-1.5 w-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />Identify expansion opportunities</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Health Scores Tab */}
        <TabsContent value="health" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DetailedHealthCard label="Relationship Health" score={account.health.relationship} factors={["Executive sponsor engagement", "Stakeholder mapping coverage", "NPS / CSAT scores", "Communication frequency"]} />
            <DetailedHealthCard label="Contract Health" score={account.health.contract} factors={["Contract compliance", "SLA adherence", "Change request management", "Renewal timeline"]} />
            <DetailedHealthCard label="Resource Health" score={account.health.resource} factors={["Team stability", "Skill coverage", "Bench availability", "Utilization rate"]} />
            <Card>
              <CardContent className="pt-6">
                <h4 className="text-sm font-medium text-foreground mb-3">Health Score Legend</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rag-green" /><span className="text-muted-foreground">2.0 – 3.0: Healthy</span></div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rag-amber" /><span className="text-muted-foreground">1.0 – 1.9: At Risk</span></div>
                  <div className="flex items-center gap-2"><span className="h-3 w-3 rounded-full bg-rag-red" /><span className="text-muted-foreground">0.0 – 0.9: Critical</span></div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Governance Tab */}
        <TabsContent value="governance">
          <Card>
            <CardHeader><CardTitle className="text-base">Governance & Reviews</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-3">
                {[
                  { type: "QBR", frequency: "Quarterly", next: "2026-04-15", status: "Scheduled" },
                  { type: "Executive Review", frequency: "Bi-annual", next: "2026-06-01", status: "Pending" },
                  { type: "Operational Sync", frequency: "Weekly", next: "2026-03-14", status: "Scheduled" },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.type}</p>
                      <p className="text-xs text-muted-foreground">{item.frequency} · Next: {item.next}</p>
                    </div>
                    <Badge variant="outline" className="text-xs">{item.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financials Tab */}
        <TabsContent value="financials">
          <Card>
            <CardHeader><CardTitle className="text-base">Financial Overview</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-foreground">{account.arr}</p>
                  <p className="text-xs text-muted-foreground mt-1">Annual Recurring Revenue</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-foreground">{account.contractStart}</p>
                  <p className="text-xs text-muted-foreground mt-1">Contract Start</p>
                </div>
                <div className="p-4 rounded-lg bg-muted/50 text-center">
                  <p className="text-2xl font-bold text-foreground">{account.contractEnd}</p>
                  <p className="text-xs text-muted-foreground mt-1">Contract End</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HealthCard({ label, score, icon: Icon }: { label: string; score: number; icon: React.ElementType }) {
  const rag = getRagColor(score);
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`text-3xl font-bold mt-1 ${RAG_STYLES[rag].text}`}>{score.toFixed(1)}</p>
            <div className="flex items-center gap-1.5 mt-2">
              <div className="h-1.5 w-24 rounded-full bg-border overflow-hidden">
                <div className={`h-full rounded-full ${RAG_STYLES[rag].dot}`} style={{ width: `${(score / 3) * 100}%` }} />
              </div>
              <span className="text-[10px] text-muted-foreground">/3</span>
            </div>
          </div>
          <div className={`h-12 w-12 rounded-xl ${RAG_STYLES[rag].bg} flex items-center justify-center`}>
            <Icon className={`h-6 w-6 ${RAG_STYLES[rag].text}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailedHealthCard({ label, score, factors }: { label: string; score: number; factors: string[] }) {
  const rag = getRagColor(score);
  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-foreground">{label}</h4>
          <span className={`text-xl font-bold ${RAG_STYLES[rag].text}`}>{score.toFixed(1)}</span>
        </div>
        <div className="h-2 rounded-full bg-border overflow-hidden">
          <div className={`h-full rounded-full ${RAG_STYLES[rag].dot}`} style={{ width: `${(score / 3) * 100}%` }} />
        </div>
        <div className="space-y-1.5 pt-1">
          {factors.map((f, i) => (
            <div key={i} className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${RAG_STYLES[rag].dot}`} />
              {f}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/50">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium text-foreground mt-0.5">{value}</p>
    </div>
  );
}

function RiskPill({ status }: { status: RiskStatus }) {
  const labels: Record<RiskStatus, string> = { green: "Green", amber: "Amber", red: "Red" };
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${RAG_STYLES[status].bg} ${RAG_STYLES[status].text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${RAG_STYLES[status].dot}`} />
      {labels[status]}
    </span>
  );
}

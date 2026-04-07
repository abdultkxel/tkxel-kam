import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { MOCK_ACCOUNTS, RAG_STYLES, getRagColor, type RiskStatus, type Segment, type Account } from "@/data/accounts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Users, TrendingUp, FileText, Cpu, Plus } from "lucide-react";
import { AddAccountWizard } from "@/components/onboarding/AddAccountWizard";

export default function Accounts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [segmentFilter, setSegmentFilter] = useState<string>("all");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const [wizardOpen, setWizardOpen] = useState(false);
  const [newAccounts, setNewAccounts] = useState<Account[]>([]);
  const [onboardingTasks, setOnboardingTasks] = useState<any[]>([]);

  // Check for draft
  const hasDraft = !!localStorage.getItem("kam-onboarding-draft");

  const accounts = useMemo(() => {
    const all = [...MOCK_ACCOUNTS, ...newAccounts];
    let list = user?.role === "am"
      ? all.filter(a => a.amId === user.id)
      : all;

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(a => a.name.toLowerCase().includes(q) || a.industry.toLowerCase().includes(q));
    }
    if (segmentFilter !== "all") {
      list = list.filter(a => a.segment === segmentFilter);
    }
    if (riskFilter !== "all") {
      list = list.filter(a => a.riskStatus === riskFilter);
    }
    return list;
  }, [user, search, segmentFilter, riskFilter, newAccounts]);

  const handleAccountCreated = (account: Account, tasks: any[]) => {
    setNewAccounts(prev => [...prev, account]);
    setOnboardingTasks(prev => [...prev, ...tasks]);
    setWizardOpen(false);
    navigate(`/accounts/${account.id}`);
  };

  if (!user) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Accounts</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {user.role === "am" ? "Your assigned accounts" : "All managed accounts"} · {accounts.length} accounts
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasDraft && (
            <Button variant="outline" size="sm" onClick={() => setWizardOpen(true)}
              className="border-dashed border-primary text-primary">
              Resume Draft
            </Button>
          )}
          <Button onClick={() => setWizardOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4 mr-1" /> Add Account
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search accounts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={segmentFilter} onValueChange={setSegmentFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Segment" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Segments</SelectItem>
            <SelectItem value="Growth">Growth</SelectItem>
            <SelectItem value="Retention">Retention</SelectItem>
          </SelectContent>
        </Select>
        <Select value={riskFilter} onValueChange={setRiskFilter}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Risk Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Risk</SelectItem>
            <SelectItem value="green">Green</SelectItem>
            <SelectItem value="amber">Amber</SelectItem>
            <SelectItem value="red">Red</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Account Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {accounts.map((account) => {
          const isOnboarding = account.onboardingStatus === "in_progress";

          if (isOnboarding) {
            return (
              <Card key={account.id}
                className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 border-dashed border-2 border-primary/30"
                onClick={() => navigate(`/accounts/${account.id}`)}>
                <CardContent className="p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground truncate">{account.name}</h3>
                      <p className="text-xs text-muted-foreground mt-0.5">{account.industry} · {account.arr} Revenue</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-700 border-blue-200 text-[10px] uppercase tracking-wide font-semibold">
                      Onboarding
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 text-blue-700">
                    <div className="text-sm font-medium">Onboarding In Progress</div>
                  </div>
                  <p className="text-xs text-muted-foreground">Complete the onboarding wizard to activate this account.</p>
                </CardContent>
              </Card>
            );
          }

          const overallRag = getRagColor(account.health.overall);
          const relRag = getRagColor(account.health.relationship);
          const conRag = getRagColor(account.health.contract);
          const resRag = getRagColor(account.health.resource);

          return (
            <Card
              key={account.id}
              className="cursor-pointer hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 border"
              onClick={() => navigate(`/accounts/${account.id}`)}
            >
              <CardContent className="p-5 space-y-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-foreground truncate">{account.name}</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">{account.industry} · {account.arr} Revenue</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                    <Badge
                      variant="secondary"
                      className={`text-[10px] uppercase tracking-wide font-semibold ${
                        account.segment === "Growth"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {account.segment}
                    </Badge>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                  <div className={`text-2xl font-bold ${RAG_STYLES[overallRag].text}`}>
                    {account.health.overall.toFixed(1)}
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-medium text-foreground">Overall Health</p>
                    <div className="flex items-center gap-1.5 mt-1">
                      <div className={`h-1.5 flex-1 rounded-full bg-border overflow-hidden`}>
                        <div
                          className={`h-full rounded-full ${RAG_STYLES[overallRag].dot}`}
                          style={{ width: `${(account.health.overall / 3) * 100}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">/3</span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <HealthDimension icon={Users} label="Relationship" score={account.health.relationship} rag={relRag} />
                  <HealthDimension icon={FileText} label="Contract" score={account.health.contract} rag={conRag} />
                  <HealthDimension icon={Cpu} label="Resource" score={account.health.resource} rag={resRag} />
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-border">
                  {user.role !== "am" && (
                    <span className="text-xs text-muted-foreground">{account.amName}</span>
                  )}
                  <RiskPill status={account.riskStatus} />
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {accounts.length === 0 && (
        <div className="text-center py-12">
          <p className="text-muted-foreground">No accounts match your filters.</p>
        </div>
      )}

      <AddAccountWizard open={wizardOpen} onClose={() => setWizardOpen(false)}
        onAccountCreated={handleAccountCreated} />
    </div>
  );
}

function HealthDimension({ icon: Icon, label, score, rag }: {
  icon: React.ElementType;
  label: string;
  score: number;
  rag: RiskStatus;
}) {
  return (
    <div className={`rounded-md p-2 text-center ${RAG_STYLES[rag].bg}`}>
      <Icon className={`h-3.5 w-3.5 mx-auto ${RAG_STYLES[rag].text}`} />
      <p className={`text-sm font-semibold mt-1 ${RAG_STYLES[rag].text}`}>{score.toFixed(1)}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
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

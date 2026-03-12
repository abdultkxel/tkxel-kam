import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, LayoutGrid, List, TrendingUp, Target, CalendarDays, Trophy, GripVertical, Pencil } from "lucide-react";
import { useOpportunities } from "@/contexts/OpportunitiesContext";
import { MOCK_ACCOUNTS, RAG_STYLES, type RiskStatus } from "@/data/accounts";
import {
  STAGE_ORDER, STAGE_COLORS, isOpenStage, getWeightedValue, formatCurrency,
  getAccountHealthRag, type Opportunity, type OpportunityStage,
} from "@/data/opportunities";
import { AddOpportunityDrawer } from "@/components/opportunities/AddOpportunityDrawer";
import { differenceInDays, format } from "date-fns";

export default function Opportunities() {
  const { opportunities, moveStage } = useOpportunities();
  const [view, setView] = useState<"pipeline" | "list">("pipeline");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editOpp, setEditOpp] = useState<Opportunity | null>(null);
  const [filterAccount, setFilterAccount] = useState("all");
  const [filterStage, setFilterStage] = useState("all");
  const [dragId, setDragId] = useState<string | null>(null);

  const today = new Date("2026-03-12");
  const qStart = new Date("2026-01-01");
  const qEnd = new Date("2026-03-31");

  const open = opportunities.filter(o => isOpenStage(o.stage));
  const won = opportunities.filter(o => o.stage === "Won");
  const lost = opportunities.filter(o => o.stage === "Lost");

  const totalPipeline = open.reduce((s, o) => s + o.estimatedValue, 0);
  const closingThisQ = open.filter(o => {
    const d = new Date(o.targetClose);
    return d >= qStart && d <= qEnd;
  });
  const closingQValue = closingThisQ.reduce((s, o) => s + o.estimatedValue, 0);
  const winRate = won.length + lost.length > 0 ? Math.round((won.length / (won.length + lost.length)) * 100) : 0;

  const filtered = useMemo(() => {
    return opportunities.filter(o => {
      if (filterAccount !== "all" && o.accountId !== filterAccount) return false;
      if (filterStage !== "all" && o.stage !== filterStage) return false;
      return true;
    });
  }, [opportunities, filterAccount, filterStage]);

  const handleDragStart = (id: string) => setDragId(id);
  const handleDrop = (stage: OpportunityStage) => {
    if (dragId) { moveStage(dragId, stage); setDragId(null); }
  };

  const getAccount = (id: string) => MOCK_ACCOUNTS.find(a => a.id === id);

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Opportunities</h1>
          <p className="text-sm text-muted-foreground mt-1">Upsell & cross-sell pipeline across all accounts</p>
        </div>
        <Button onClick={() => { setEditOpp(null); setDrawerOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Add Opportunity
        </Button>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile icon={TrendingUp} label="Total Pipeline" value={formatCurrency(totalPipeline)} sub={`${open.length} open opportunities`} />
        <KpiTile icon={Target} label="Open Opportunities" value={open.length.toString()} sub={STAGE_ORDER.filter(s => isOpenStage(s)).map(s => `${opportunities.filter(o => o.stage === s).length} ${s}`).join(" · ")} />
        <KpiTile icon={CalendarDays} label="Closing This Quarter" value={`${closingThisQ.length} · ${formatCurrency(closingQValue)}`} sub="Q1 2026" />
        <KpiTile icon={Trophy} label="Win Rate" value={`${winRate}%`} sub={`${won.length}W / ${lost.length}L`} />
      </div>

      {/* View Toggle + Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex bg-muted rounded-lg p-1">
          <Button variant={view === "pipeline" ? "secondary" : "ghost"} size="sm" onClick={() => setView("pipeline")}>
            <LayoutGrid className="h-4 w-4 mr-1" /> Pipeline
          </Button>
          <Button variant={view === "list" ? "secondary" : "ghost"} size="sm" onClick={() => setView("list")}>
            <List className="h-4 w-4 mr-1" /> List
          </Button>
        </div>
        <Select value={filterAccount} onValueChange={setFilterAccount}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Accounts" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Accounts</SelectItem>
            {MOCK_ACCOUNTS.map(a => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Stages" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            {STAGE_ORDER.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Pipeline Kanban */}
      {view === "pipeline" && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {STAGE_ORDER.map(stage => {
            const cards = filtered.filter(o => o.stage === stage);
            const stageTotal = cards.reduce((s, o) => s + o.estimatedValue, 0);
            return (
              <div
                key={stage}
                className="bg-muted/30 rounded-lg p-2 min-h-[300px]"
                onDragOver={e => e.preventDefault()}
                onDrop={() => handleDrop(stage)}
              >
                <div className="flex items-center justify-between mb-2 px-1">
                  <span className="text-xs font-semibold text-foreground">{stage}</span>
                  <Badge variant="secondary" className="text-[10px]">{cards.length} · {formatCurrency(stageTotal)}</Badge>
                </div>
                <div className="space-y-2">
                  {cards.map(opp => {
                    const acc = getAccount(opp.accountId);
                    const rag = getAccountHealthRag(opp.accountId);
                    const daysToClose = differenceInDays(new Date(opp.targetClose), today);
                    return (
                      <div
                        key={opp.id}
                        draggable
                        onDragStart={() => handleDragStart(opp.id)}
                        className="bg-card border rounded-lg p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start justify-between gap-1">
                          <div>
                            <p className="text-xs font-semibold text-foreground leading-tight">{acc?.name}</p>
                            <Badge variant="secondary" className="text-[9px] mt-0.5">{acc?.segment}</Badge>
                          </div>
                          <span className={`h-2 w-2 rounded-full flex-shrink-0 mt-1 ${RAG_STYLES[rag].dot}`} />
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-1.5">{opp.serviceLine}</p>
                        <p className="text-base font-bold text-foreground mt-1">{formatCurrency(opp.estimatedValue)}</p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-[10px] text-muted-foreground">{opp.owner.split(" ")[0]}</span>
                          <span className={`text-[10px] font-medium ${daysToClose < 0 ? "text-rag-red" : daysToClose < 30 ? "text-rag-amber" : "text-muted-foreground"}`}>
                            {daysToClose < 0 ? `${Math.abs(daysToClose)}d overdue` : `${daysToClose}d`}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1.5">
                          <Badge variant="outline" className="text-[9px]">{opp.confidence}</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List Table */}
      {view === "list" && (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Service Line</TableHead>
                  <TableHead className="text-right">Est. Value</TableHead>
                  <TableHead className="text-right">Weighted</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Close</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(opp => {
                  const acc = getAccount(opp.accountId);
                  return (
                    <TableRow key={opp.id}>
                      <TableCell className="font-medium text-sm">{opp.name}</TableCell>
                      <TableCell className="text-sm">{acc?.name}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{opp.type}</Badge></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{opp.serviceLine}</TableCell>
                      <TableCell className="text-right font-semibold">{formatCurrency(opp.estimatedValue)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{formatCurrency(getWeightedValue(opp))}</TableCell>
                      <TableCell><Badge className={`text-[10px] ${STAGE_COLORS[opp.stage]}`}>{opp.stage}</Badge></TableCell>
                      <TableCell className="text-sm">{opp.owner}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{opp.targetClose}</TableCell>
                      <TableCell><Badge variant="outline" className="text-[10px]">{opp.confidence}</Badge></TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setEditOpp(opp); setDrawerOpen(true); }}>
                          <Pencil className="h-3 w-3" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <AddOpportunityDrawer open={drawerOpen} onOpenChange={setDrawerOpen} editOpportunity={editOpp} />
    </div>
  );
}

function KpiTile({ icon: Icon, label, value, sub }: { icon: React.ElementType; label: string; value: string; sub: string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
            <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>
          </div>
          <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

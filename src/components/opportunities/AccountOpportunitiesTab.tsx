import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, Pencil, Trash2, ChevronDown, Sparkles, TrendingUp, Trophy, Layers } from "lucide-react";
import { useOpportunities } from "@/contexts/OpportunitiesContext";
import { type Account } from "@/data/accounts";
import {
  STAGE_COLORS, isOpenStage, formatCurrency, getWhitespaceSuggestions, getWeightedValue,
} from "@/data/opportunities";
import { MOCK_STRATEGY_DATA } from "@/data/strategy";
import { AddOpportunityDrawer } from "./AddOpportunityDrawer";

interface Props {
  account: Account;
}

export function AccountOpportunitiesTab({ account }: Props) {
  const { opportunities, deleteOpportunity } = useOpportunities();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editOpp, setEditOpp] = useState<any>(null);
  const [prefillService, setPrefillService] = useState<{ line: string; category: string } | null>(null);
  const [closedOpen, setClosedOpen] = useState(false);

  const accountOpps = opportunities.filter(o => o.accountId === account.id);
  const openOpps = accountOpps.filter(o => isOpenStage(o.stage));
  const wonOpps = accountOpps.filter(o => o.stage === "Won");
  const closedOpps = accountOpps.filter(o => o.stage === "Won" || o.stage === "Lost");

  const openPipeline = openOpps.reduce((s, o) => s + o.estimatedValue, 0);
  const wonValue = wonOpps.reduce((s, o) => s + o.estimatedValue, 0);

  const stratData = MOCK_STRATEGY_DATA[account.id];
  const activeServices = stratData ? stratData.services.filter(s => s.status === "Active").length : 0;
  const totalCategories = 7;

  const whitespace = getWhitespaceSuggestions(account.id);

  const handleConvert = (serviceName: string, category: string) => {
    setPrefillService({ line: serviceName, category });
    setEditOpp(null);
    setDrawerOpen(true);
  };

  const handleAdd = () => {
    setPrefillService(null);
    setEditOpp(null);
    setDrawerOpen(true);
  };

  const handleEdit = (opp: any) => {
    setPrefillService(null);
    setEditOpp(opp);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      {/* Summary Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Open Pipeline</p>
                <p className="text-2xl font-bold text-foreground mt-1">{formatCurrency(openPipeline)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{openOpps.length} opportunities</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <TrendingUp className="h-5 w-5 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Won This Year</p>
                <p className="text-2xl font-bold text-rag-green mt-1">{formatCurrency(wonValue)}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{wonOpps.length} won</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-rag-green/10 flex items-center justify-center">
                <Trophy className="h-5 w-5 text-rag-green" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Service Coverage</p>
                <p className="text-2xl font-bold text-foreground mt-1">{activeServices} of {totalCategories}</p>
                <p className="text-[11px] text-muted-foreground mt-1">categories engaged</p>
              </div>
              <div className="h-10 w-10 rounded-xl bg-info/10 flex items-center justify-center">
                <Layers className="h-5 w-5 text-info" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Active Opportunities */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Active Opportunities</CardTitle>
          <Button size="sm" onClick={handleAdd}><Plus className="h-4 w-4 mr-1" /> Add Opportunity</Button>
        </CardHeader>
        <CardContent className="p-0">
          {openOpps.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">No active opportunities. Use whitespace suggestions below or add one manually.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Service Line</TableHead>
                  <TableHead className="text-right">Est. Value</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Close</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openOpps.map(opp => (
                  <TableRow key={opp.id}>
                    <TableCell className="font-medium text-sm">{opp.name}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{opp.type}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{opp.serviceLine}</TableCell>
                    <TableCell className="text-right font-semibold">{formatCurrency(opp.estimatedValue)}</TableCell>
                    <TableCell><Badge className={`text-[10px] ${STAGE_COLORS[opp.stage]}`}>{opp.stage}</Badge></TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{opp.confidence}</Badge></TableCell>
                    <TableCell className="text-sm">{opp.owner}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{opp.targetClose}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleEdit(opp)}><Pencil className="h-3 w-3" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteOpportunity(opp.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Whitespace Suggestions */}
      {whitespace.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" /> Suggested from Service Mapping
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {whitespace.map(svc => (
                <div key={svc.id} className="border rounded-lg p-4 flex flex-col justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">{svc.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{svc.competency}</p>
                    <Badge variant="secondary" className="text-[10px] mt-2">Potential Opportunity</Badge>
                  </div>
                  <Button size="sm" variant="outline" className="mt-3 w-full" onClick={() => handleConvert(svc.name, svc.competency)}>
                    Convert to Opportunity
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Closed Opportunities */}
      {closedOpps.length > 0 && (
        <Collapsible open={closedOpen} onOpenChange={setClosedOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <CardHeader className="cursor-pointer flex flex-row items-center justify-between">
                <CardTitle className="text-base">Won / Lost History</CardTitle>
                <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${closedOpen ? "rotate-180" : ""}`} />
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                      <TableHead>Outcome</TableHead>
                      <TableHead>Close Date</TableHead>
                      <TableHead>Notes</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {closedOpps.map(opp => (
                      <TableRow key={opp.id}>
                        <TableCell className="font-medium text-sm">{opp.name}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px]">{opp.type}</Badge></TableCell>
                        <TableCell className="text-right font-semibold">{formatCurrency(opp.estimatedValue)}</TableCell>
                        <TableCell><Badge className={`text-[10px] ${STAGE_COLORS[opp.stage]}`}>{opp.stage}</Badge></TableCell>
                        <TableCell className="text-sm text-muted-foreground">{opp.targetClose}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">{opp.notes}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      )}

      <AddOpportunityDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        prefillAccountId={account.id}
        prefillServiceLine={prefillService?.line}
        prefillCategory={prefillService?.category}
        editOpportunity={editOpp}
      />
    </div>
  );
}

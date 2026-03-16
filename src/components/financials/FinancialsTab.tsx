import { useMemo } from "react";
import { Account, getRagColor, RAG_STYLES, type RiskStatus } from "@/data/accounts";
import { MOCK_FINANCIAL_DATA, getContractStatus, getRenewalActionDeadline, getArrNumeric, formatCurrency, type InvoiceStatus } from "@/data/financials";
import { MOCK_STRATEGY_DATA, SERVICE_CATALOG, createDefaultStrategy } from "@/data/strategy";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertTriangle, TrendingUp, TrendingDown, Calendar, DollarSign, FileText, Clock, Shield, ArrowUpRight, CheckCircle2 } from "lucide-react";
import { differenceInDays, differenceInMonths, addMonths, format } from "date-fns";

interface FinancialsTabProps {
  account: Account;
}

const TODAY = new Date("2026-03-12");

export function FinancialsTab({ account }: FinancialsTabProps) {
  const financial = MOCK_FINANCIAL_DATA[account.id];
  const arrValue = getArrNumeric(account.arr);
  const { status: contractStatus, daysToRenewal } = getContractStatus(account.contractEnd);
  const isExpired = contractStatus === "Expired";

  const contractYears = useMemo(() => {
    const start = new Date(account.contractStart);
    const end = new Date(account.contractEnd);
    return Math.max(1, Math.round(differenceInMonths(end, start) / 12));
  }, [account.contractStart, account.contractEnd]);

  const tcv = arrValue * contractYears;

  if (!financial) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">No financial data available.</CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      {isExpired && (
        <div className="rounded-lg bg-rag-red/10 border border-rag-red/30 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-rag-red flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-rag-red">Contract Expired — Renewal Required</p>
            <p className="text-xs text-rag-red/80">This contract expired {Math.abs(daysToRenewal)} days ago. Immediate action needed.</p>
          </div>
        </div>
      )}

      <ContractSnapshot
        account={account}
        arrValue={arrValue}
        tcv={tcv}
        contractStatus={contractStatus}
        daysToRenewal={daysToRenewal}
        terms={financial.terms}
      />
      <RevenueTimeline account={account} arrValue={arrValue} />
      <BillingPaymentStatus invoices={financial.invoices} />
      <SOWHistory sows={financial.sows} />
      <ExpansionOpportunities accountId={account.id} />
      <FinancialRiskCard account={account} daysToRenewal={daysToRenewal} contractStatus={contractStatus} invoices={financial.invoices} />
    </div>
  );
}

/* ─── 1. Contract Snapshot ─── */
function ContractSnapshot({ account, arrValue, tcv, contractStatus, daysToRenewal, terms }: {
  account: Account; arrValue: number; tcv: number; contractStatus: string; daysToRenewal: number;
  terms: { noticePeriodDays: number; rateEscalation: string; yoyGrowth: number };
}) {
  const renewalDeadline = getRenewalActionDeadline(account.contractEnd, terms.noticePeriodDays);
  const statusColor: Record<string, RiskStatus> = { "Active": "green", "Expiring Soon": "amber", "Expired": "red" };
  const renewalColor: RiskStatus = daysToRenewal > 90 ? "green" : daysToRenewal > 30 ? "amber" : "red";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
      <SnapshotTile
        label="Revenue"
        value={account.arr}
        sub={<span className={`flex items-center gap-1 text-xs ${terms.yoyGrowth >= 0 ? "text-rag-green" : "text-rag-red"}`}>
          {terms.yoyGrowth >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          {terms.yoyGrowth > 0 ? "+" : ""}{terms.yoyGrowth}% YoY
        </span>}
        icon={DollarSign}
      />
      <SnapshotTile label="Total Contract Value" value={formatCurrency(tcv)} sub={<span className="text-xs text-muted-foreground">{Math.round((new Date(account.contractEnd).getTime() - new Date(account.contractStart).getTime()) / (365.25 * 24 * 60 * 60 * 1000) * 10) / 10} yr contract</span>} icon={FileText} />
      <SnapshotTile
        label="Contract Status"
        value={<Badge className={`${RAG_STYLES[statusColor[contractStatus] || "green"].bg} ${RAG_STYLES[statusColor[contractStatus] || "green"].text} border-0 text-xs`}>{contractStatus}</Badge>}
        sub={<span className="text-xs text-muted-foreground">{daysToRenewal > 0 ? `${daysToRenewal} days remaining` : `${Math.abs(daysToRenewal)} days overdue`}</span>}
        icon={Shield}
      />
      <SnapshotTile
        label="Days to Renewal"
        value={<span className={RAG_STYLES[renewalColor].text}>{daysToRenewal > 0 ? daysToRenewal : daysToRenewal}</span>}
        sub={<span className="text-xs text-muted-foreground">{daysToRenewal > 0 ? "days remaining" : "days overdue"}</span>}
        icon={Clock}
        highlight={renewalColor}
      />
      <SnapshotTile
        label="Notice Period"
        value={`${terms.noticePeriodDays} days`}
        sub={<span className="text-xs text-muted-foreground">Deadline: {renewalDeadline}</span>}
        icon={Calendar}
      />
      <SnapshotTile
        label="Rate Escalation"
        value={terms.rateEscalation}
        sub={<span className="text-xs text-muted-foreground">Per contract terms</span>}
        icon={TrendingUp}
      />
    </div>
  );
}

function SnapshotTile({ label, value, sub, icon: Icon, highlight }: {
  label: string; value: React.ReactNode; sub?: React.ReactNode; icon: React.ElementType; highlight?: RiskStatus;
}) {
  return (
    <Card className={highlight ? `border-l-4 ${highlight === "red" ? "border-l-rag-red" : highlight === "amber" ? "border-l-rag-amber" : "border-l-rag-green"}` : ""}>
      <CardContent className="pt-5 pb-4 px-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <div className="text-xl font-bold text-foreground">{value}</div>
            {sub}
          </div>
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <Icon className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── 2. Revenue Timeline ─── */
function RevenueTimeline({ account, arrValue }: { account: Account; arrValue: number }) {
  const start = new Date(account.contractStart);
  const end = new Date(account.contractEnd);
  const totalDays = differenceInDays(end, start);
  const elapsed = differenceInDays(TODAY, start);
  const progressPct = Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
  const isExpired = TODAY > end;
  const overdueWidth = isExpired ? Math.min(20, (differenceInDays(TODAY, end) / totalDays) * 100) : 0;
  const renewalZoneStart = Math.max(0, ((totalDays - 90) / totalDays) * 100);

  // Generate quarterly markers
  const quarters: { label: string; pct: number }[] = [];
  let q = new Date(start);
  q = addMonths(q, 3 - ((q.getMonth()) % 3));
  while (q < end) {
    const pct = (differenceInDays(q, start) / totalDays) * 100;
    if (pct > 2 && pct < 98) quarters.push({ label: format(q, "QQQ yy"), pct });
    q = addMonths(q, 3);
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Revenue Timeline</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{account.contractStart}</span>
            <span>{account.contractEnd}</span>
          </div>
          <div className="relative h-10 rounded-lg bg-muted overflow-visible">
            {/* Renewal zone (last 90 days) */}
            <div
              className="absolute top-0 bottom-0 bg-rag-amber/15 rounded-r-lg border-l border-dashed border-rag-amber/40"
              style={{ left: `${renewalZoneStart}%`, right: "0%" }}
            />
            {/* Progress bar */}
            <div
              className="absolute top-0 bottom-0 left-0 bg-primary/20 rounded-l-lg"
              style={{ width: `${Math.min(progressPct, 100)}%` }}
            >
              <div className="absolute right-0 top-0 bottom-0 w-0.5 bg-primary" />
            </div>
            {/* Expired overlay */}
            {isExpired && (
              <div
                className="absolute top-0 bottom-0 bg-rag-red/20 border-l-2 border-rag-red rounded-r-lg flex items-center justify-center"
                style={{ left: "100%", width: `${overdueWidth}%` }}
              >
                <span className="text-[9px] font-bold text-rag-red whitespace-nowrap px-1">EXPIRED</span>
              </div>
            )}
            {/* Quarterly markers */}
            {quarters.map((q, i) => (
              <div key={i} className="absolute top-0 bottom-0 w-px bg-border" style={{ left: `${q.pct}%` }}>
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground whitespace-nowrap">{q.label}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-4 text-[10px] text-muted-foreground pt-1">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-primary/20" /> Contract Period</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rag-amber/15 border border-rag-amber/40" /> Renewal Zone (90d)</span>
            {isExpired && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rag-red/20" /> Expired</span>}
            <span className="ml-auto font-medium text-foreground">Quarterly ARR: {formatCurrency(arrValue / 4)}</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── 3. Billing & Payment Status ─── */
function BillingPaymentStatus({ invoices }: { invoices: typeof MOCK_FINANCIAL_DATA[string]["invoices"] }) {
  const totalBilled = invoices.reduce((s, i) => s + i.amount, 0);
  const totalCollected = invoices.filter(i => i.status === "Paid").reduce((s, i) => s + i.amount, 0);
  const outstanding = totalBilled - totalCollected;
  const statusIcon: Record<InvoiceStatus, React.ReactNode> = {
    Paid: <span className="flex items-center gap-1 text-rag-green"><CheckCircle2 className="h-3.5 w-3.5" /> Paid</span>,
    Pending: <span className="flex items-center gap-1 text-rag-amber">🟡 Pending</span>,
    Overdue: <span className="flex items-center gap-1 text-rag-red">🔴 Overdue</span>,
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Billing & Payment Status</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Period</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map(inv => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium text-xs">{inv.invoiceNumber}</TableCell>
                <TableCell className="text-xs">{inv.period}</TableCell>
                <TableCell className="text-right text-xs font-medium">{formatCurrency(inv.amount)}</TableCell>
                <TableCell className="text-xs">{inv.dueDate}</TableCell>
                <TableCell className="text-xs">{statusIcon[inv.status]}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-4 grid grid-cols-3 gap-4">
          <SummaryBox label="Total Billed YTD" value={formatCurrency(totalBilled)} />
          <SummaryBox label="Total Collected" value={formatCurrency(totalCollected)} color="green" />
          <SummaryBox label="Outstanding" value={formatCurrency(outstanding)} color={outstanding > 0 ? "amber" : "green"} />
        </div>
      </CardContent>
    </Card>
  );
}

function SummaryBox({ label, value, color }: { label: string; value: string; color?: string }) {
  const textClass = color === "green" ? "text-rag-green" : color === "amber" ? "text-rag-amber" : color === "red" ? "text-rag-red" : "text-foreground";
  return (
    <div className="p-3 rounded-lg bg-muted/50 text-center">
      <p className={`text-lg font-bold ${textClass}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

/* ─── 4. SOW / Amendment History ─── */
function SOWHistory({ sows }: { sows: typeof MOCK_FINANCIAL_DATA[string]["sows"] }) {
  const ltv = sows.reduce((s, sow) => s + sow.value, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">SOW / Amendment History</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reference</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead className="text-right">Value</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sows.map(sow => (
              <TableRow key={sow.id}>
                <TableCell className="font-medium text-xs font-mono">{sow.reference}</TableCell>
                <TableCell className="text-xs">{sow.description}</TableCell>
                <TableCell className="text-xs">{sow.startDate}</TableCell>
                <TableCell className="text-right text-xs font-medium">{formatCurrency(sow.value)}</TableCell>
                <TableCell>
                  <Badge variant={sow.status === "Active" ? "default" : "secondary"} className="text-[10px]">{sow.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="mt-4 pt-3 border-t flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Total Engagement Value (LTV)</span>
          <span className="text-lg font-bold text-foreground">{formatCurrency(ltv)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── 5. Expansion Opportunities ─── */
function ExpansionOpportunities({ accountId }: { accountId: string }) {
  const strategy = MOCK_STRATEGY_DATA[accountId];
  const services = strategy?.services ?? createDefaultStrategy("Growth").services;
  const opportunities = services.filter(s => s.status === "Opportunity");

  const estimatedValues: Record<string, number> = {
    "Mobile App Development": 180000,
    "Machine Learning": 250000,
    "Predictive Analytics": 200000,
    "Design Systems": 80000,
    "Digital Transformation": 300000,
  };

  const totalExpansion = opportunities.reduce((s, o) => s + (estimatedValues[o.name] || 120000), 0);

  if (opportunities.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-base">Expansion Opportunities</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No expansion opportunities identified in service mapping.</p></CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">Expansion Opportunities <ArrowUpRight className="h-4 w-4 text-rag-green" /></CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {opportunities.map(opp => {
            const val = estimatedValues[opp.name] || 120000;
            return (
              <div key={opp.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div>
                  <p className="text-sm font-medium text-foreground">{opp.name}</p>
                  <p className="text-xs text-muted-foreground">{opp.competency}</p>
                </div>
                <span className="text-sm font-bold text-rag-green">{formatCurrency(val)}/yr</span>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-3 border-t flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">Estimated Expansion ARR</span>
          <span className="text-lg font-bold text-rag-green">{formatCurrency(totalExpansion)}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/* ─── 6. Financial Risk Card ─── */
function FinancialRiskCard({ account, daysToRenewal, contractStatus, invoices }: {
  account: Account; daysToRenewal: number; contractStatus: string; invoices: typeof MOCK_FINANCIAL_DATA[string]["invoices"];
}) {
  const overdueCount = invoices.filter(i => i.status === "Overdue").length;
  const overdueAmount = invoices.filter(i => i.status === "Overdue").reduce((s, i) => s + i.amount, 0);
  const isExpired = contractStatus === "Expired";
  const contractHealthRag = getRagColor(account.health.contract);

  let verdict = "";
  let severity: RiskStatus = "green";

  if (isExpired) {
    severity = "red";
    verdict = `URGENT: Contract expired ${Math.abs(daysToRenewal)} days ago with ${account.arr} ARR at risk. ${overdueCount > 0 ? `${overdueCount} overdue invoice(s) totaling ${formatCurrency(overdueAmount)}.` : ""} Immediate renewal action required.`;
  } else if (daysToRenewal <= 30 || overdueCount > 0 || contractHealthRag === "red") {
    severity = "red";
    verdict = `High risk: ${daysToRenewal <= 30 ? `Only ${daysToRenewal} days to renewal.` : ""} ${overdueCount > 0 ? `${overdueCount} overdue payment(s).` : ""} Contract health is ${account.health.contract.toFixed(1)}/3. Escalate to leadership.`;
  } else if (daysToRenewal <= 90 || contractHealthRag === "amber") {
    severity = "amber";
    verdict = `Moderate risk: ${daysToRenewal} days until renewal. Contract health at ${account.health.contract.toFixed(1)}/3. Begin renewal conversations and address any open concerns.`;
  } else {
    verdict = `Low risk: Contract healthy at ${account.health.contract.toFixed(1)}/3 with ${daysToRenewal} days remaining. All payments current. Continue standard engagement cadence.`;
  }

  return (
    <Card className={`border-l-4 ${severity === "red" ? "border-l-rag-red" : severity === "amber" ? "border-l-rag-amber" : "border-l-rag-green"}`}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <AlertTriangle className={`h-4 w-4 ${RAG_STYLES[severity].text}`} />
          Financial Risk Assessment
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className={`text-sm ${severity === "red" ? "text-rag-red font-medium" : "text-foreground"}`}>{verdict}</p>
        <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
          <span>Contract Health: <strong className={RAG_STYLES[contractHealthRag].text}>{account.health.contract.toFixed(1)}</strong>/3</span>
          <span>·</span>
          <span>Days to Renewal: <strong className={RAG_STYLES[daysToRenewal > 90 ? "green" : daysToRenewal > 30 ? "amber" : "red"].text}>{daysToRenewal}</strong></span>
          <span>·</span>
          <span>Overdue Invoices: <strong className={overdueCount > 0 ? "text-rag-red" : "text-rag-green"}>{overdueCount}</strong></span>
        </div>
      </CardContent>
    </Card>
  );
}

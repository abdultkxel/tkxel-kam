import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/contexts/AuthContext";
import { MOCK_ACCOUNTS } from "@/data/accounts";
import { REPORT_CONFIGS, MOCK_RECENT_EXPORTS, type ReportType, type ExportFormat, type RecentExport } from "@/data/reports";
import { FileText, Download, FileSpreadsheet, File, Calendar, ChevronRight, Check } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const FORMAT_ICONS: Record<ExportFormat, typeof FileText> = {
  pdf: FileText,
  word: File,
  csv: FileSpreadsheet,
};

export default function Reports() {
  const { user } = useAuth();
  const [selectedType, setSelectedType] = useState<ReportType | null>(null);
  const [selectedAccounts, setSelectedAccounts] = useState<string[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<ExportFormat | null>(null);
  const [selectedSubOption, setSelectedSubOption] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [recentExports, setRecentExports] = useState<RecentExport[]>(MOCK_RECENT_EXPORTS);

  if (!user) return null;

  const isLeadership = user.role === "leadership" || user.role === "admin";
  const accounts = user.role === "am" ? MOCK_ACCOUNTS.filter(a => a.amId === user.id) : MOCK_ACCOUNTS;
  const availableConfigs = REPORT_CONFIGS.filter(r => !r.leadershipOnly || isLeadership);
  const activeConfig = availableConfigs.find(c => c.id === selectedType);

  const toggleAccount = (id: string) => {
    setSelectedAccounts(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  };

  const selectAllAccounts = () => {
    setSelectedAccounts(prev => prev.length === accounts.length ? [] : accounts.map(a => a.id));
  };

  const canGenerate = selectedType && selectedFormat &&
    (activeConfig?.id === "portfolio_summary" || selectedAccounts.length > 0) &&
    (!activeConfig?.hasDateRange || (dateFrom && dateTo));

  const handleGenerate = () => {
    if (!activeConfig || !selectedFormat) return;
    const acctNames = activeConfig.id === "portfolio_summary"
      ? ["All Accounts"]
      : selectedAccounts.map(id => accounts.find(a => a.id === id)?.name || id);
    const fileName = `${activeConfig.title.replace(/\s/g, "_")}_${acctNames[0].replace(/\s/g, "_")}_${format(new Date(), "yyyy-MM-dd")}.${selectedFormat}`;

    const newExport: RecentExport = {
      id: `exp-${Date.now()}`,
      reportType: activeConfig.id,
      reportTitle: activeConfig.title,
      accounts: acctNames,
      format: selectedFormat,
      generatedAt: new Date().toISOString(),
      generatedBy: user.name,
      fileName,
    };
    setRecentExports(prev => [newExport, ...prev]);
    toast.success(`Report generated: ${fileName}`);

    // Reset
    setSelectedType(null);
    setSelectedAccounts([]);
    setSelectedFormat(null);
    setSelectedSubOption("");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Reports & Export</h1>
        <p className="text-sm text-muted-foreground mt-1">Generate and download formatted reports</p>
      </div>

      {/* Report Builder */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Report Builder</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Step 1: Report Type */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">1. Select Report Type</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {availableConfigs.map(config => (
                <button
                  key={config.id}
                  onClick={() => {
                    setSelectedType(config.id);
                    setSelectedFormat(null);
                    setSelectedAccounts([]);
                    setSelectedSubOption(config.subOptions?.[0]?.value || "");
                  }}
                  className={`p-3 rounded-lg border text-left transition-all ${
                    selectedType === config.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:border-primary/30 hover:bg-muted/50"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-foreground">{config.title}</span>
                    {selectedType === config.id && <Check className="h-4 w-4 text-primary" />}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{config.description}</p>
                  {config.leadershipOnly && (
                    <Badge variant="secondary" className="mt-1.5 text-[10px]">Leadership Only</Badge>
                  )}
                </button>
              ))}
            </div>
          </div>

          {activeConfig && (
            <>
              <Separator />

              {/* Step 2: Account Selection (if applicable) */}
              {activeConfig.id !== "portfolio_summary" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      2. Select Account{activeConfig.multiAccount ? "(s)" : ""}
                    </Label>
                    {activeConfig.multiAccount && (
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={selectAllAccounts}>
                        {selectedAccounts.length === accounts.length ? "Deselect All" : "Select All"}
                      </Button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-40 overflow-y-auto">
                    {accounts.map(acct => (
                      <label
                        key={acct.id}
                        className={`flex items-center gap-2 p-2 rounded-md border cursor-pointer transition-colors ${
                          selectedAccounts.includes(acct.id)
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted/50"
                        }`}
                        onClick={() => {
                          if (!activeConfig.multiAccount) {
                            setSelectedAccounts([acct.id]);
                          } else {
                            toggleAccount(acct.id);
                          }
                        }}
                      >
                        <Checkbox
                          checked={selectedAccounts.includes(acct.id)}
                          className="pointer-events-none"
                        />
                        <span className="text-xs text-foreground truncate">{acct.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* Sub-options */}
              {activeConfig.subOptions && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Options</Label>
                  <Select value={selectedSubOption} onValueChange={setSelectedSubOption}>
                    <SelectTrigger className="w-60 h-9 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {activeConfig.subOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="text-xs">{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Date Range */}
              {activeConfig.hasDateRange && (
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Date Range</Label>
                  <div className="flex items-center gap-2">
                    <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-xs w-44" />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-xs w-44" />
                  </div>
                </div>
              )}

              <Separator />

              {/* Step 3: Format */}
              <div className="space-y-2">
                <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {activeConfig.id === "portfolio_summary" ? "2" : activeConfig.hasDateRange ? "4" : "3"}. Choose Format
                </Label>
                <div className="flex gap-2">
                  {activeConfig.formats.map(fmt => {
                    const Icon = FORMAT_ICONS[fmt];
                    return (
                      <button
                        key={fmt}
                        onClick={() => setSelectedFormat(fmt)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                          selectedFormat === fmt
                            ? "border-primary bg-primary/5 ring-1 ring-primary"
                            : "border-border hover:border-primary/30"
                        }`}
                      >
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        <span className="text-xs font-medium uppercase">{fmt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Generate */}
              <div className="flex items-center gap-3 pt-2">
                <Button onClick={handleGenerate} disabled={!canGenerate} className="gap-2">
                  <Download className="h-4 w-4" />
                  Generate & Download
                </Button>
                <span className="text-[11px] text-muted-foreground">
                  Report will include Tkxel branding header and generation date.
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Recent Exports */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Exports</CardTitle>
        </CardHeader>
        <CardContent>
          {recentExports.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No exports yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">File Name</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Accounts</TableHead>
                  <TableHead className="text-xs">Format</TableHead>
                  <TableHead className="text-xs">Generated</TableHead>
                  <TableHead className="text-xs">By</TableHead>
                  <TableHead className="text-xs w-10"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentExports.map(exp => {
                  const Icon = FORMAT_ICONS[exp.format];
                  return (
                    <TableRow key={exp.id}>
                      <TableCell className="text-xs font-medium">
                        <div className="flex items-center gap-2">
                          <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                          {exp.fileName}
                        </div>
                      </TableCell>
                      <TableCell><Badge variant="secondary" className="text-[10px]">{exp.reportTitle}</Badge></TableCell>
                      <TableCell className="text-xs text-muted-foreground">{exp.accounts.join(", ")}</TableCell>
                      <TableCell className="text-xs uppercase text-muted-foreground">{exp.format}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{format(new Date(exp.generatedAt), "MMM d, yyyy HH:mm")}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{exp.generatedBy}</TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toast.info("Re-downloading " + exp.fileName)}>
                          <Download className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

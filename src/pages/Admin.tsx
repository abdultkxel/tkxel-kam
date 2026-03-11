import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { MOCK_ACCOUNTS } from "@/data/accounts";
import { MOCK_USERS, MOCK_TEMPLATES, MOCK_AUDIT_LOG, type SystemUser, type TemplateFile, type AuditEntry } from "@/data/admin";
import {
  DEFAULT_RELATIONSHIP_CRITERIA, DEFAULT_CONTRACT_CRITERIA, DEFAULT_RESOURCE_CRITERIA,
  DEFAULT_CSAT_CRITERIA, DEFAULT_RISK_CRITERIA, type ScoringCriterion, type CsatCriterion,
} from "@/data/healthScoring";
import { WeightSettingsPanel } from "@/components/health/WeightSettingsPanel";
import { Users, Building2, Sliders, FileStack, BookOpen, ClipboardList, Plus, Search, Download, Upload, Pencil, UserX, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const ROLE_LABELS: Record<string, string> = { am: "Account Manager", leadership: "KAM Leadership", admin: "Admin" };

export default function Admin() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/dashboard" replace />;

  return (
    <div className="space-y-6 max-w-[1400px]">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Admin Panel</h1>
        <p className="text-sm text-muted-foreground mt-1">System configuration and management</p>
      </div>
      <Tabs defaultValue="users" className="space-y-4">
        <TabsList className="h-9">
          <TabsTrigger value="users" className="text-xs gap-1.5"><Users className="h-3.5 w-3.5" />Users</TabsTrigger>
          <TabsTrigger value="accounts" className="text-xs gap-1.5"><Building2 className="h-3.5 w-3.5" />Accounts</TabsTrigger>
          <TabsTrigger value="scoring" className="text-xs gap-1.5"><Sliders className="h-3.5 w-3.5" />Scoring</TabsTrigger>
          <TabsTrigger value="templates" className="text-xs gap-1.5"><FileStack className="h-3.5 w-3.5" />Templates</TabsTrigger>
          <TabsTrigger value="playbook" className="text-xs gap-1.5"><BookOpen className="h-3.5 w-3.5" />Playbook</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs gap-1.5"><ClipboardList className="h-3.5 w-3.5" />Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="users"><UserManagement /></TabsContent>
        <TabsContent value="accounts"><AccountManagement /></TabsContent>
        <TabsContent value="scoring"><ScoringConfiguration /></TabsContent>
        <TabsContent value="templates"><TemplateManagement /></TabsContent>
        <TabsContent value="playbook"><PlaybookManagement /></TabsContent>
        <TabsContent value="audit"><AuditLog /></TabsContent>
      </Tabs>
    </div>
  );
}

// ─── User Management ───

function UserManagement() {
  const [users, setUsers] = useState<SystemUser[]>(MOCK_USERS);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string>("all");

  const filtered = users.filter(u =>
    (u.name.toLowerCase().includes(search.toLowerCase()) || u.email.toLowerCase().includes(search.toLowerCase())) &&
    (roleFilter === "all" || u.role === roleFilter)
  );

  const toggleStatus = (id: string) => {
    setUsers(prev => prev.map(u => u.id === id ? { ...u, status: u.status === "active" ? "inactive" : "active" } : u));
    toast.success("User status updated");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">User Management</CardTitle>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add User</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Create New User</DialogTitle></DialogHeader>
              <div className="space-y-3">
                <div><Label className="text-xs">Full Name</Label><Input className="h-9 text-sm mt-1" /></div>
                <div><Label className="text-xs">Email</Label><Input type="email" className="h-9 text-sm mt-1" /></div>
                <div>
                  <Label className="text-xs">Role</Label>
                  <Select defaultValue="am">
                    <SelectTrigger className="h-9 text-xs mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="am" className="text-xs">Account Manager</SelectItem>
                      <SelectItem value="leadership" className="text-xs">KAM Leadership</SelectItem>
                      <SelectItem value="admin" className="text-xs">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button className="w-full" onClick={() => toast.success("User created")}>Create User</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search users..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 text-xs pl-8" />
          </div>
          <Select value={roleFilter} onValueChange={setRoleFilter}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Roles</SelectItem>
              <SelectItem value="am" className="text-xs">Account Manager</SelectItem>
              <SelectItem value="leadership" className="text-xs">Leadership</SelectItem>
              <SelectItem value="admin" className="text-xs">Admin</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Email</TableHead>
              <TableHead className="text-xs">Role</TableHead>
              <TableHead className="text-xs">Assigned Accounts</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map(u => (
              <TableRow key={u.id}>
                <TableCell className="text-xs font-medium">{u.name}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px]">{ROLE_LABELS[u.role]}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {u.assignedAccounts.length > 0
                    ? u.assignedAccounts.map(id => MOCK_ACCOUNTS.find(a => a.id === id)?.name).filter(Boolean).join(", ")
                    : "—"
                  }
                </TableCell>
                <TableCell>
                  <Badge variant={u.status === "active" ? "default" : "secondary"} className="text-[10px]">
                    {u.status}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => toggleStatus(u.id)}>
                      {u.status === "active" ? <UserX className="h-3 w-3" /> : <UserCheck className="h-3 w-3" />}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Account Management ───

function AccountManagement() {
  const [search, setSearch] = useState("");
  const accounts = MOCK_ACCOUNTS.filter(a => a.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Account Management</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 text-xs"><Upload className="h-3.5 w-3.5" />Bulk Import CSV</Button>
            <Dialog>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />New Account</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Create New Account</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div><Label className="text-xs">Account Name</Label><Input className="h-9 text-sm mt-1" /></div>
                  <div>
                    <Label className="text-xs">Segment</Label>
                    <Select defaultValue="Growth">
                      <SelectTrigger className="h-9 text-xs mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Growth" className="text-xs">Growth</SelectItem>
                        <SelectItem value="Retention" className="text-xs">Retention</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Assigned AM</Label>
                    <Select>
                      <SelectTrigger className="h-9 text-xs mt-1"><SelectValue placeholder="Select AM" /></SelectTrigger>
                      <SelectContent>
                        {MOCK_USERS.filter(u => u.role === "am" && u.status === "active").map(u => (
                          <SelectItem key={u.id} value={u.id} className="text-xs">{u.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label className="text-xs">Contract Start Date</Label><Input type="date" className="h-9 text-sm mt-1" /></div>
                  <Button className="w-full" onClick={() => toast.success("Account created")}>Create Account</Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input placeholder="Search accounts..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 text-xs pl-8" />
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Name</TableHead>
              <TableHead className="text-xs">Segment</TableHead>
              <TableHead className="text-xs">AM</TableHead>
              <TableHead className="text-xs">Industry</TableHead>
              <TableHead className="text-xs">ARR</TableHead>
              <TableHead className="text-xs">Contract End</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.map(a => (
              <TableRow key={a.id}>
                <TableCell className="text-xs font-medium">{a.name}</TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px]">{a.segment}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.amName}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.industry}</TableCell>
                <TableCell className="text-xs font-medium">{a.arr}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{a.contractEnd}</TableCell>
                <TableCell><Badge className="text-[10px]">Active</Badge></TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><UserX className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Scoring Configuration ───

function ScoringConfiguration() {
  const [relCriteria, setRelCriteria] = useState<ScoringCriterion[]>(DEFAULT_RELATIONSHIP_CRITERIA);
  const [conCriteria, setConCriteria] = useState<ScoringCriterion[]>(DEFAULT_CONTRACT_CRITERIA);
  const [resCriteria, setResCriteria] = useState<ScoringCriterion[]>(DEFAULT_RESOURCE_CRITERIA);
  const [csatCriteria, setCsatCriteria] = useState<CsatCriterion[]>(DEFAULT_CSAT_CRITERIA);
  const [riskCriteria, setRiskCriteria] = useState<ScoringCriterion[]>(DEFAULT_RISK_CRITERIA);

  const handleReset = () => {
    setRelCriteria(DEFAULT_RELATIONSHIP_CRITERIA);
    setConCriteria(DEFAULT_CONTRACT_CRITERIA);
    setResCriteria(DEFAULT_RESOURCE_CRITERIA);
    setCsatCriteria(DEFAULT_CSAT_CRITERIA);
    setRiskCriteria(DEFAULT_RISK_CRITERIA);
    toast.info("Weights reset to defaults");
  };

  const handleSave = () => {
    toast.success("Scoring configuration saved. Changes reflected immediately.");
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Scoring Configuration</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Edit weightages for each health scoring framework. Changes are reflected immediately.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="text-xs" onClick={handleReset}>Reset to Defaults</Button>
            <Button size="sm" className="text-xs" onClick={handleSave}>Save Changes</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <WeightSettingsPanel
          relCriteria={relCriteria} onRelChange={setRelCriteria}
          conCriteria={conCriteria} onConChange={setConCriteria}
          resCriteria={resCriteria} onResChange={setResCriteria}
          csatCriteria={csatCriteria} onCsatChange={setCsatCriteria}
          riskCriteria={riskCriteria} onRiskChange={setRiskCriteria}
        />
      </CardContent>
    </Card>
  );
}

// ─── Template Management ───

function TemplateManagement() {
  const [templates] = useState<TemplateFile[]>(MOCK_TEMPLATES);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Template Management</CardTitle>
          <Button size="sm" className="gap-1.5 text-xs"><Upload className="h-3.5 w-3.5" />Upload Template</Button>
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Template Name</TableHead>
              <TableHead className="text-xs">Type</TableHead>
              <TableHead className="text-xs">Version</TableHead>
              <TableHead className="text-xs">Uploaded</TableHead>
              <TableHead className="text-xs">By</TableHead>
              <TableHead className="text-xs">Size</TableHead>
              <TableHead className="text-xs w-20">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates.map(t => (
              <TableRow key={t.id}>
                <TableCell className="text-xs font-medium">{t.name}</TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px]">{t.type}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">v{t.version}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{format(new Date(t.uploadedAt), "MMM d, yyyy")}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.uploadedBy}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{t.fileSize}</TableCell>
                <TableCell>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Download className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7"><Pencil className="h-3 w-3" /></Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// ─── Playbook Management ───

function PlaybookManagement() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">Playbook Management</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Create, edit, and reorder playbook sections. Changes are live immediately.</p>
          </div>
          <Button size="sm" className="gap-1.5 text-xs"><Plus className="h-3.5 w-3.5" />Add Section</Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {["KAM Fundamentals", "Account Planning", "Governance Best Practices", "Health Scoring Guide", "Escalation Handling", "Growth Strategies"].map((s, i) => (
            <div key={i} className="flex items-center justify-between p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors">
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">{i + 1}</div>
                <span className="text-sm font-medium text-foreground">{s}</span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="text-xs h-7">Edit</Button>
                <Button variant="ghost" size="sm" className="text-xs h-7">Reorder</Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Audit Log ───

function AuditLog() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");
  const [userFilter, setUserFilter] = useState("all");
  const log = MOCK_AUDIT_LOG.filter(e =>
    (search === "" || e.recordName.toLowerCase().includes(search.toLowerCase()) || e.details.toLowerCase().includes(search.toLowerCase())) &&
    (actionFilter === "all" || e.action === actionFilter) &&
    (userFilter === "all" || e.userId === userFilter)
  );

  const uniqueActions = [...new Set(MOCK_AUDIT_LOG.map(e => e.action))];
  const uniqueUsers = [...new Map(MOCK_AUDIT_LOG.map(e => [e.userId, { id: e.userId, name: e.userName }])).values()];

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Audit Log</CardTitle>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={() => toast.success("Audit log exported to CSV")}>
            <Download className="h-3.5 w-3.5" />Export CSV
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search records..." value={search} onChange={e => setSearch(e.target.value)} className="h-9 text-xs pl-8" />
          </div>
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger className="w-40 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Users</SelectItem>
              {uniqueUsers.map(u => <SelectItem key={u.id} value={u.id} className="text-xs">{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-36 h-9 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Actions</SelectItem>
              {uniqueActions.map(a => <SelectItem key={a} value={a} className="text-xs">{a}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Timestamp</TableHead>
              <TableHead className="text-xs">User</TableHead>
              <TableHead className="text-xs">Action</TableHead>
              <TableHead className="text-xs">Record Type</TableHead>
              <TableHead className="text-xs">Record</TableHead>
              <TableHead className="text-xs">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {log.map(e => (
              <TableRow key={e.id}>
                <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{format(new Date(e.timestamp), "MMM d, HH:mm")}</TableCell>
                <TableCell className="text-xs font-medium">{e.userName}</TableCell>
                <TableCell><Badge variant="secondary" className="text-[10px]">{e.action}</Badge></TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.recordType}</TableCell>
                <TableCell className="text-xs font-medium">{e.recordName}</TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[250px] truncate">{e.details}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

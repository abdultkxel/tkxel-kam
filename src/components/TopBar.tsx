import { LogOut, Menu } from "lucide-react";
import { useAuth, ROLE_LABELS } from "@/contexts/AuthContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";

export function TopBar() {
  const { user, logout } = useAuth();

  if (!user) return null;

  return (
    <header className="h-14 border-b border-border bg-card flex items-center justify-between px-4 flex-shrink-0">
      <div className="flex items-center gap-2">
        <SidebarTrigger>
          <Menu className="h-5 w-5" />
        </SidebarTrigger>
      </div>
      <div className="flex items-center gap-3">
        <div className="text-right hidden sm:block">
          <p className="text-sm font-medium text-foreground leading-tight">{user.name}</p>
          <p className="text-xs text-muted-foreground">{user.email}</p>
        </div>
        <Badge variant="secondary" className="text-xs font-medium bg-primary/10 text-primary border-0">
          {ROLE_LABELS[user.role]}
        </Badge>
        <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
          <span className="text-primary-foreground text-xs font-semibold">
            {user.name.split(" ").map(n => n[0]).join("")}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={logout} className="text-muted-foreground hover:text-destructive">
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}

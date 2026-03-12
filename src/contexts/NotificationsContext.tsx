import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getAlerts, getOverdueActions, getUpcomingGovernance, AlertItem } from "@/data/dashboard";
import { getRenewalCalendar } from "@/data/dashboard";
import { MOCK_ACCOUNTS } from "@/data/accounts";
import { useAuth } from "@/contexts/AuthContext";

export type NotificationType = "health" | "contract" | "overdue" | "deadline" | "renewal";

export interface Notification {
  id: string;
  type: NotificationType;
  severity: "red" | "amber" | "info";
  account: string;
  message: string;
  read: boolean;
  createdAt: string;
}

interface NotificationsContextType {
  notifications: Notification[];
  unreadCount: number;
  markAsRead: (id: string) => void;
  markAllAsRead: () => void;
  clearAll: () => void;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

export function useNotifications() {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  useEffect(() => {
    if (!user) {
      setNotifications([]);
      return;
    }

    const accounts = user.role === "am"
      ? MOCK_ACCOUNTS.filter(a => a.amId === user.id)
      : MOCK_ACCOUNTS;

    const alerts = getAlerts(accounts);
    const overdueActions = getOverdueActions();
    const upcomingGov = getUpcomingGovernance();
    const renewals = getRenewalCalendar();
    const now = new Date();
    let idx = 0;

    const notifs: Notification[] = [];

    // Alert-based notifications
    for (const alert of alerts) {
      notifs.push({
        id: `notif-alert-${idx}`,
        type: alert.type,
        severity: alert.severity,
        account: alert.account,
        message: alert.message,
        read: false,
        createdAt: new Date(now.getTime() - idx * 1000 * 60 * 15).toISOString(),
      });
      idx++;
    }

    // Overdue action items
    for (const item of overdueActions) {
      notifs.push({
        id: `notif-overdue-${idx}`,
        type: "deadline",
        severity: "red",
        account: item.source,
        message: `Overdue: "${item.task}" — ${item.owner} (due ${item.dueDate})`,
        read: false,
        createdAt: new Date(now.getTime() - idx * 1000 * 60 * 15).toISOString(),
      });
      idx++;
    }

    // Upcoming governance deadlines
    for (const item of upcomingGov) {
      notifs.push({
        id: `notif-gov-${idx}`,
        type: "deadline",
        severity: "amber",
        account: item.type,
        message: `Upcoming: ${item.title} — ${item.date}`,
        read: false,
        createdAt: new Date(now.getTime() - idx * 1000 * 60 * 15).toISOString(),
      });
      idx++;
    }

    // Renewal deadlines
    for (const r of renewals.filter(r => r.status !== "normal")) {
      notifs.push({
        id: `notif-renewal-${idx}`,
        type: "renewal",
        severity: r.status === "overdue" ? "red" : "amber",
        account: r.account,
        message: r.daysRemaining < 0
          ? `Contract expired ${Math.abs(r.daysRemaining)} days ago`
          : `Contract renews in ${r.daysRemaining} days (${r.contractEnd})`,
        read: false,
        createdAt: new Date(now.getTime() - idx * 1000 * 60 * 15).toISOString(),
      });
      idx++;
    }

    setNotifications(notifs);
  }, [user]);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  };

  const clearAll = () => setNotifications([]);

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, clearAll }}>
      {children}
    </NotificationsContext.Provider>
  );
}

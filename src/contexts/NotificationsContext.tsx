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
    const now = new Date();

    const notifs: Notification[] = alerts.map((alert, i) => ({
      id: `notif-${i}-${Date.now()}`,
      type: alert.type,
      severity: alert.severity,
      account: alert.account,
      message: alert.message,
      read: false,
      createdAt: new Date(now.getTime() - i * 1000 * 60 * 15).toISOString(), // stagger by 15 min
    }));

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

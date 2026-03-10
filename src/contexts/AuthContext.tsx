import React, { createContext, useContext, useState, useCallback } from "react";

export type UserRole = "am" | "leadership" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  isAuthenticated: boolean;
}

const MOCK_USERS: Record<string, User & { password: string }> = {
  "am@tkxel.com": {
    id: "u1",
    name: "Sarah Mitchell",
    email: "am@tkxel.com",
    role: "am",
    password: "password",
  },
  "lead@tkxel.com": {
    id: "u2",
    name: "James Chen",
    email: "lead@tkxel.com",
    role: "leadership",
    password: "password",
  },
  "admin@tkxel.com": {
    id: "u3",
    name: "Alex Rivera",
    email: "admin@tkxel.com",
    role: "admin",
    password: "password",
  },
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem("kam_user");
    return saved ? JSON.parse(saved) : null;
  });

  const login = useCallback(async (email: string, password: string) => {
    const mockUser = MOCK_USERS[email.toLowerCase()];
    if (mockUser && mockUser.password === password) {
      const { password: _, ...userData } = mockUser;
      setUser(userData);
      localStorage.setItem("kam_user", JSON.stringify(userData));
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    setUser(null);
    localStorage.removeItem("kam_user");
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  am: "Account Manager",
  leadership: "KAM Leadership",
  admin: "Admin",
};

import { createContext, useContext, useState, type ReactNode } from "react";
import { MOCK_ACCOUNTS, type Account } from "@/data/accounts";

interface AccountsContextType {
  accounts: Account[];
  addAccount: (account: Account) => void;
}

const AccountsContext = createContext<AccountsContextType | null>(null);

export function AccountsProvider({ children }: { children: ReactNode }) {
  const [extraAccounts, setExtraAccounts] = useState<Account[]>([]);

  const accounts = [...MOCK_ACCOUNTS, ...extraAccounts];

  const addAccount = (account: Account) => {
    setExtraAccounts(prev => [...prev, account]);
  };

  return (
    <AccountsContext.Provider value={{ accounts, addAccount }}>
      {children}
    </AccountsContext.Provider>
  );
}

export function useAccounts() {
  const ctx = useContext(AccountsContext);
  if (!ctx) throw new Error("useAccounts must be used within AccountsProvider");
  return ctx;
}

import React, { createContext, useContext, useState, useCallback } from "react";
import { INITIAL_OPPORTUNITIES, type Opportunity, type OpportunityStage } from "@/data/opportunities";

interface OpportunitiesContextType {
  opportunities: Opportunity[];
  addOpportunity: (opp: Omit<Opportunity, "id" | "createdAt">) => void;
  updateOpportunity: (id: string, updates: Partial<Opportunity>) => void;
  deleteOpportunity: (id: string) => void;
  moveStage: (id: string, stage: OpportunityStage) => void;
}

const OpportunitiesContext = createContext<OpportunitiesContextType | undefined>(undefined);

export const OpportunitiesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [opportunities, setOpportunities] = useState<Opportunity[]>(INITIAL_OPPORTUNITIES);

  const addOpportunity = useCallback((opp: Omit<Opportunity, "id" | "createdAt">) => {
    const newOpp: Opportunity = {
      ...opp,
      id: `opp-${Date.now()}`,
      createdAt: new Date().toISOString().split("T")[0],
    };
    setOpportunities(prev => [...prev, newOpp]);
  }, []);

  const updateOpportunity = useCallback((id: string, updates: Partial<Opportunity>) => {
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  }, []);

  const deleteOpportunity = useCallback((id: string) => {
    setOpportunities(prev => prev.filter(o => o.id !== id));
  }, []);

  const moveStage = useCallback((id: string, stage: OpportunityStage) => {
    setOpportunities(prev => prev.map(o => o.id === id ? { ...o, stage } : o));
  }, []);

  return (
    <OpportunitiesContext.Provider value={{ opportunities, addOpportunity, updateOpportunity, deleteOpportunity, moveStage }}>
      {children}
    </OpportunitiesContext.Provider>
  );
};

export const useOpportunities = () => {
  const ctx = useContext(OpportunitiesContext);
  if (!ctx) throw new Error("useOpportunities must be used within OpportunitiesProvider");
  return ctx;
};

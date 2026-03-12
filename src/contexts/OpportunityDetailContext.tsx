import React, { createContext, useContext, useState, useCallback } from "react";
import {
  SEED_TASKS, SEED_ACTIVITIES, SEED_DOCUMENTS,
  type OppTask, type OppActivityEntry, type OppDocument,
} from "@/data/opportunityTasks";

interface OpportunityDetailContextType {
  tasks: OppTask[];
  activities: OppActivityEntry[];
  documents: OppDocument[];
  addTask: (task: Omit<OppTask, "id">) => void;
  updateTask: (id: string, updates: Partial<OppTask>) => void;
  toggleTask: (id: string) => void;
  deleteTask: (id: string) => void;
  addActivity: (entry: Omit<OppActivityEntry, "id">) => void;
  addDocument: (doc: Omit<OppDocument, "id">) => void;
  deleteDocument: (id: string) => void;
}

const OpportunityDetailContext = createContext<OpportunityDetailContextType | undefined>(undefined);

export const OpportunityDetailProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [tasks, setTasks] = useState<OppTask[]>(SEED_TASKS);
  const [activities, setActivities] = useState<OppActivityEntry[]>(SEED_ACTIVITIES);
  const [documents, setDocuments] = useState<OppDocument[]>(SEED_DOCUMENTS);

  const addTask = useCallback((task: Omit<OppTask, "id">) => {
    const newTask: OppTask = { ...task, id: `ot-${Date.now()}` };
    setTasks(prev => [...prev, newTask]);
  }, []);

  const updateTask = useCallback((id: string, updates: Partial<OppTask>) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  const toggleTask = useCallback((id: string) => {
    setTasks(prev => prev.map(t => {
      if (t.id !== id) return t;
      const completed = !t.completed;
      return { ...t, completed, completedAt: completed ? new Date().toISOString().split("T")[0] : undefined };
    }));
  }, []);

  const deleteTask = useCallback((id: string) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  }, []);

  const addActivity = useCallback((entry: Omit<OppActivityEntry, "id">) => {
    const newEntry: OppActivityEntry = { ...entry, id: `oa-${Date.now()}` };
    setActivities(prev => [...prev, newEntry]);
  }, []);

  const addDocument = useCallback((doc: Omit<OppDocument, "id">) => {
    const newDoc: OppDocument = { ...doc, id: `od-${Date.now()}` };
    setDocuments(prev => [...prev, newDoc]);
  }, []);

  const deleteDocument = useCallback((id: string) => {
    setDocuments(prev => prev.filter(d => d.id !== id));
  }, []);

  return (
    <OpportunityDetailContext.Provider value={{
      tasks, activities, documents,
      addTask, updateTask, toggleTask, deleteTask,
      addActivity, addDocument, deleteDocument,
    }}>
      {children}
    </OpportunityDetailContext.Provider>
  );
};

export const useOpportunityDetail = () => {
  const ctx = useContext(OpportunityDetailContext);
  if (!ctx) throw new Error("useOpportunityDetail must be used within OpportunityDetailProvider");
  return ctx;
};

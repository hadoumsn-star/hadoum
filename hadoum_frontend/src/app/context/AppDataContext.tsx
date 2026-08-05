import React, { createContext, useContext, useState } from 'react';

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface PendingActivity {
  id: number;
  title: string;
  type: string;
  class: string;
  educator: string;
  date: string;
  status: 'en attente' | 'validée' | 'refusée';
  motifRefus?: string;
}

export interface LeaveRequest {
  id: number;
  educator: string;
  type: 'congé' | 'absence';
  dateFrom: string;
  dateTo: string;
  motif: string;
  status: 'en attente' | 'validé' | 'refusé';
}

export interface FundRequest {
  id: number;
  montant: string;
  motif: string;
  requestedBy: string;
  date: string;
  status: 'en attente' | 'validé' | 'refusé';
  note?: string;
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface AppDataContextType {
  pendingActivities: PendingActivity[];
  addActivity: (a: Omit<PendingActivity, 'id' | 'status'>) => void;
  validateActivity: (id: number) => void;
  refuseActivity: (id: number, motif: string) => void;

  leaveRequests: LeaveRequest[];
  addLeaveRequest: (r: Omit<LeaveRequest, 'id' | 'status'>) => void;
  validateLeave: (id: number) => void;
  refuseLeave: (id: number) => void;

  fundRequests: FundRequest[];
  addFundRequest: (r: Omit<FundRequest, 'id' | 'status'>) => void;
  validateFund: (id: number, note: string) => void;
  refuseFund: (id: number, note: string) => void;
}

const AppDataContext = createContext<AppDataContextType | null>(null);

// ─── Initial demo data ─────────────────────────────────────────────────────────

const INIT_ACTIVITIES: PendingActivity[] = [
  { id: 1, title: 'Atelier poterie', type: 'artistique', class: 'Primaire 2A', educator: 'Karim M.', date: '20 Mai 2026', status: 'en attente' },
  { id: 2, title: 'Visite bibliothèque', type: 'culturelle', class: 'Primaire 1', educator: 'Zineb M.', date: '22 Mai 2026', status: 'en attente' },
];

const INIT_LEAVE: LeaveRequest[] = [
  { id: 1, educator: 'Karim Mansouri', type: 'congé', dateFrom: '20 Mai 2026', dateTo: '22 Mai 2026', motif: 'Congé annuel', status: 'en attente' },
];

const INIT_FUND: FundRequest[] = [];

// ─── Provider ────────────────────────────────────────────────────────────────

export function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [pendingActivities, setPendingActivities] = useState<PendingActivity[]>(INIT_ACTIVITIES);
  const [leaveRequests, setLeaveRequests]         = useState<LeaveRequest[]>(INIT_LEAVE);
  const [fundRequests, setFundRequests]           = useState<FundRequest[]>(INIT_FUND);

  const addActivity = (a: Omit<PendingActivity, 'id' | 'status'>) => {
    setPendingActivities(prev => [{ ...a, id: Date.now(), status: 'en attente' }, ...prev]);
  };
  const validateActivity = (id: number) =>
    setPendingActivities(prev => prev.map(a => a.id === id ? { ...a, status: 'validée' } : a));
  const refuseActivity = (id: number, motif: string) =>
    setPendingActivities(prev => prev.map(a => a.id === id ? { ...a, status: 'refusée', motifRefus: motif } : a));

  const addLeaveRequest = (r: Omit<LeaveRequest, 'id' | 'status'>) => {
    setLeaveRequests(prev => [{ ...r, id: Date.now(), status: 'en attente' }, ...prev]);
  };
  const validateLeave = (id: number) =>
    setLeaveRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'validé' } : r));
  const refuseLeave = (id: number) =>
    setLeaveRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'refusé' } : r));

  const addFundRequest = (r: Omit<FundRequest, 'id' | 'status'>) => {
    setFundRequests(prev => [{ ...r, id: Date.now(), status: 'en attente' }, ...prev]);
  };
  const validateFund = (id: number, note: string) =>
    setFundRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'validé', note } : r));
  const refuseFund = (id: number, note: string) =>
    setFundRequests(prev => prev.map(r => r.id === id ? { ...r, status: 'refusé', note } : r));

  return (
    <AppDataContext.Provider value={{
      pendingActivities, addActivity, validateActivity, refuseActivity,
      leaveRequests, addLeaveRequest, validateLeave, refuseLeave,
      fundRequests, addFundRequest, validateFund, refuseFund,
    }}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const ctx = useContext(AppDataContext);
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider');
  return ctx;
}
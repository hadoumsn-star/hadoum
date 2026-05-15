import React, { createContext, useContext, useState } from 'react';

export type UserRole = 'director' | 'educator' | 'supervisor' | 'board';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  title: string;
  email: string;
  initials: string;
}

interface AuthContextType {
  user: User | null;
  login: (role: UserRole) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

const DEMO_USERS: Record<UserRole, User> = {
  director: {
    id: '1',
    name: 'Amira Benali',
    role: 'director',
    roleLabel: 'Directrice',
    title: 'Direction générale',
    email: 'a.benali@hadoum.org',
    initials: 'AB',
  },
  educator: {
    id: '2',
    name: 'Karim Mansouri',
    role: 'educator',
    roleLabel: 'Éducateur',
    title: 'Classe Primaire 2',
    email: 'k.mansouri@hadoum.org',
    initials: 'KM',
  },
  supervisor: {
    id: '3',
    name: 'Nadia Hamidi',
    role: 'supervisor',
    roleLabel: 'Superviseure',
    title: 'Supervision & Contrôle',
    email: 'n.hamidi@hadoum.org',
    initials: 'NH',
  },
  board: {
    id: '4',
    name: 'Omar Zidane',
    role: 'board',
    roleLabel: "Conseil d'Administration",
    title: "Membre du Conseil",
    email: 'o.zidane@hadoum.org',
    initials: 'OZ',
  },
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  const login = (role: UserRole) => setUser(DEMO_USERS[role]);
  const logout = () => setUser(null);

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

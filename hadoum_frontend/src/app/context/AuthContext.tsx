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
  token: string | null;
  // Demo login — role string or email (frontend-only, no API call)
  login: (roleOrEmail: string) => void;
  // Real login — called after a successful POST /api/auth/login
  loginWithUser: (user: User, token: string) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

// Role-based demo users (used by demo login buttons)
const DEMO_USERS: Record<string, User> = {
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
  'a.benali@hadoum.org':   { id: '1', name: 'Amira Benali',  role: 'director',   roleLabel: 'Directrice',              title: 'Direction générale',      email: 'a.benali@hadoum.org',   initials: 'AB' },
  'k.mansouri@hadoum.org': { id: '2', name: 'Karim Mansouri', role: 'educator',   roleLabel: 'Éducateur',               title: 'Classe Primaire 2',        email: 'k.mansouri@hadoum.org', initials: 'KM' },
  'n.hamidi@hadoum.org':   { id: '3', name: 'Nadia Hamidi',  role: 'supervisor', roleLabel: 'Superviseure',             title: 'Supervision & Contrôle',   email: 'n.hamidi@hadoum.org',   initials: 'NH' },
  'o.zidane@hadoum.org':   { id: '4', name: 'Omar Zidane',   role: 'board',      roleLabel: "Conseil d'Administration", title: "Membre du Conseil",        email: 'o.zidane@hadoum.org',   initials: 'OZ' },
};

const USER_KEY  = 'hadoum-auth-user';
const TOKEN_KEY = 'hadoum-auth-token';

function readStorage<T>(key: string): T | null {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,  setUser]  = useState<User | null>(() => readStorage<User>(USER_KEY));
  const [token, setToken] = useState<string | null>(() => readStorage<string>(TOKEN_KEY));

  const persist = (u: User, t: string | null) => {
    setUser(u);
    setToken(t);
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(u));
      if (t) localStorage.setItem(TOKEN_KEY, JSON.stringify(t));
      else localStorage.removeItem(TOKEN_KEY);
    } catch {}
  };

  // Frontend-only demo login (role key or demo email)
  const login = (roleOrEmail: string) => {
    const u = DEMO_USERS[roleOrEmail];
    if (u) persist(u, null);
  };

  // Called after a successful API login
  const loginWithUser = (u: User, t: string) => persist(u, t);

  const logout = () => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(TOKEN_KEY);
    } catch {}
  };

  return (
    <AuthContext.Provider value={{ user, token, login, loginWithUser, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

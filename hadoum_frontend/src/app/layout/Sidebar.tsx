import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import {
  LayoutDashboard, Users, UsersRound, CalendarCheck,
  DollarSign, FileText, BookOpen, Activity,
  BarChart2, Download, AlertTriangle,
  MessageSquare, Building2,
} from 'lucide-react';
import { useAuth, UserRole } from '../context/AuthContext';
import { HadoumLogo } from '../components/HadoumLogo';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem { label: string; path: string; icon: React.ElementType; }
interface SidebarProps {
  onNavClick: () => void;
}

// ─── Navigation per role (flat — no "Tout voir") ──────────────────────────────

const NAV_BY_ROLE: Record<UserRole, { primary: NavItem[]; secondary: NavItem[] }> = {
  director: {
    // primary: [
    //   { label: "Vue d'ensemble",        path: '/app/dashboard',  icon: LayoutDashboard },
    //   { label: 'Voir les enfants',       path: '/app/children',   icon: Users },
    //   { label: 'Valider les présences',  path: '/app/attendance', icon: CalendarCheck },
    // ],
    // secondary: [
    //   { label: 'Mon équipe',             path: '/app/team',       icon: UsersRound },
    //   { label: 'Suivi des incidents',    path: '/app/incidents',  icon: AlertTriangle },
    //   { label: 'Suivre les finances',    path: '/app/finances',   icon: DollarSign },
    //   { label: 'Consulter les rapports', path: '/app/reports',    icon: FileText },
    // ],
     primary: [
      { label: 'Voir les enfants',       path: '/app/children',   icon: Users },
      { label: 'Mon équipe',             path: '/app/team',       icon: UsersRound },
      { label: 'Consulter les rapports', path: '/app/reports',    icon: FileText },
      // { label: 'Messagerie',             path: '/app/messages',   icon: MessageSquare },
    ],
    secondary: [
      { label: 'Suivi des incidents',    path: '/app/incidents',  icon: AlertTriangle },
      { label: 'Suivre les finances',    path: '/app/finances',   icon: DollarSign },
      { label: 'Administration & Locaux', path: '/app/administration', icon: Building2 },
    ]
  },
  educator: {
    primary: [
      { label: "Vue d'ensemble",         path: '/app/dashboard',  icon: LayoutDashboard },
      { label: 'Mes classes du jour',    path: '/app/classes',    icon: BookOpen },
      { label: 'Saisir les présences',   path: '/app/attendance', icon: CalendarCheck },
    ],
    secondary: [
      { label: 'Mes activités',          path: '/app/activities', icon: Activity },
      { label: 'Messagerie',             path: '/app/messages',   icon: MessageSquare },
    ],
  },
  supervisor: {
    primary: [
      { label: "Vue d'ensemble",         path: '/app/dashboard',   icon: LayoutDashboard },
    ],
    secondary: [
      { label: 'Suivi des incidents',    path: '/app/incidents',   icon: AlertTriangle },
      { label: 'Consulter les rapports', path: '/app/reports',     icon: FileText },
      { label: 'Suivre les finances',    path: '/app/finances',    icon: DollarSign },
      { label: 'Administration & Locaux', path: '/app/administration', icon: Building2 },
    ],
  },
  board: {
    primary: [
      { label: "Vue d'ensemble",         path: '/app/dashboard',  icon: LayoutDashboard },
      { label: 'Lire les indicateurs',   path: '/app/indicators', icon: BarChart2 },
      { label: 'Consulter les rapports', path: '/app/reports',    icon: FileText },
    ],
    secondary: [
      { label: 'Exporter les données',   path: '/app/exports',    icon: Download },
    ],
  },
};

// ─── Nav item (expanded & collapsed) ─────────────────────────────────────────

function NavItemRow({ item, isActive, onNavClick }: {
  item: NavItem; isActive: boolean; onNavClick: () => void;
}) {
  const Icon = item.icon;

  return (
    <li>
      <Link
        to={item.path}
        onClick={onNavClick}
        className="flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-100"
        style={{
          background: isActive ? '#EEF2F7' : 'transparent',
          color: isActive ? '#3E5A78' : '#374151',
          textDecoration: 'none',
        }}
      >
        <Icon size={17} style={{ color: isActive ? '#3E5A78' : '#6B7280', flexShrink: 0 }} />
        <span style={{ fontSize: 14, fontWeight: isActive ? 600 : 400, whiteSpace: 'nowrap' }}>
          {item.label}
        </span>
        {isActive && (
          <div className="ml-auto w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: '#3E5A78' }} />
        )}
      </Link>
    </li>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

export function Sidebar({ onNavClick }: SidebarProps) {
  const { user } = useAuth();
  const location = useLocation();

  if (!user) return null;

  const { primary, secondary } = NAV_BY_ROLE[user.role];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex flex-col h-full" style={{ background: '#FFFFFF' }}>

      {/* Logo */}
      <div
        className="flex items-center flex-shrink-0"
        style={{
          height: 64,
          borderBottom: '1px solid #E5E7EB',
          padding: '0 16px',
          overflow: 'hidden',
        }}
      >
        <HadoumLogo size="default" variant="full" />
      </div>

      {/* Role badge */}
      <div
        className="flex-shrink-0"
        style={{
          borderBottom: '1px solid #F3F4F6',
          padding: '10px 16px',
          display: 'flex',
        }}
      >
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg"
          style={{ background: '#F0F4F8' }}
        >
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#3E5A78' }} />
          <span style={{ color: '#3E5A78', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
            {user.roleLabel.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Navigation — flat list, divider between primary & secondary */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ padding: '12px' }}
      >
        {/* Primary items */}
        <ul className="space-y-0.5">
          {primary.map((item) => (
            <NavItemRow
              key={item.path}
              item={item}
              isActive={isActive(item.path)}
              onNavClick={onNavClick}
            />
          ))}
        </ul>

        {/* Divider + secondary items */}
        {secondary.length > 0 && (
          <>
            <div
              className="my-3"
              style={{ borderTop: '1px solid #F3F4F6' }}
            />
            <ul className="space-y-0.5">
              {secondary.map((item) => (
                <NavItemRow
                  key={item.path}
                  item={item}
                  isActive={isActive(item.path)}
                  onNavClick={onNavClick}
                />
              ))}
            </ul>
          </>
        )}
      </nav>
    </div>
  );
}
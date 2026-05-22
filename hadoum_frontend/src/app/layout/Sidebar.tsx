import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router';
import {
  LayoutDashboard, Users, UsersRound, CalendarCheck,
  DollarSign, FileText, BookOpen, Activity,
  BarChart2, Download, ChevronsLeft, ChevronsRight, AlertTriangle,
  MessageSquare,
} from 'lucide-react';
import { useAuth, UserRole } from '../context/AuthContext';
import { HadoumLogo } from '../components/HadoumLogo';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NavItem { label: string; path: string; icon: React.ElementType; }
interface SidebarProps {
  collapsed: boolean;
  onToggleCollapse: () => void;
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
      { label: 'Messagerie',             path: '/app/messages',   icon: MessageSquare },
    ],
    secondary: []
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

function NavItemRow({ item, isActive, collapsed, onNavClick }: {
  item: NavItem; isActive: boolean; collapsed: boolean; onNavClick: () => void;
}) {
  const Icon = item.icon;

  if (collapsed) {
    return (
      <li>
        <Link
          to={item.path}
          onClick={onNavClick}
          title={item.label}
          className="relative flex items-center justify-center rounded-lg mx-auto my-0.5 transition-all"
          style={{
            width: 40, height: 40,
            background: isActive ? '#EEF2F7' : 'transparent',
            textDecoration: 'none',
            display: 'flex',
          }}
        >
          {isActive && (
            <div
              className="absolute left-0 rounded-r-full"
              style={{ width: 3, height: 22, background: '#3E5A78', top: '50%', transform: 'translateY(-50%)' }}
            />
          )}
          <Icon size={18} style={{ color: isActive ? '#3E5A78' : '#6B7280' }} />
        </Link>
      </li>
    );
  }

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

export function Sidebar({ collapsed, onToggleCollapse, onNavClick }: SidebarProps) {
  const { user } = useAuth();
  const location = useLocation();

  // On mobile, sidebar is always full-width — collapse only applies on desktop
  // (handled by AppLayout which only sets collapsed width on lg+)

  if (!user) return null;

  const { primary, secondary } = NAV_BY_ROLE[user.role];
  const allItems = [...primary, ...secondary];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="flex flex-col h-full" style={{ background: '#FFFFFF' }}>

      {/* Logo */}
      <div
        className="flex items-center flex-shrink-0"
        style={{
          height: 64,
          borderBottom: '1px solid #E5E7EB',
          padding: collapsed ? '0' : '0 16px',
          justifyContent: collapsed ? 'center' : 'flex-start',
          overflow: 'hidden',
        }}
      >
        {collapsed
          ? <HadoumLogo size="small" variant="mark-only" />
          : <HadoumLogo size="default" variant="full" />
        }
      </div>

      {/* Role badge */}
      <div
        className="flex-shrink-0"
        style={{
          borderBottom: '1px solid #F3F4F6',
          padding: collapsed ? '10px 0' : '10px 16px',
          display: 'flex',
          justifyContent: collapsed ? 'center' : 'flex-start',
        }}
      >
        {collapsed ? (
          <div
            className="w-2 h-2 rounded-full"
            style={{ background: '#3E5A78' }}
            title={user.roleLabel}
          />
        ) : (
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: '#F0F4F8' }}
          >
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#3E5A78' }} />
            <span style={{ color: '#3E5A78', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
              {user.roleLabel.toUpperCase()}
            </span>
          </div>
        )}
      </div>

      {/* Navigation — flat list, divider between primary & secondary */}
      <nav
        className="flex-1 overflow-y-auto overflow-x-hidden"
        style={{ padding: collapsed ? '12px 8px' : '12px' }}
      >
        {/* Primary items */}
        <ul className="space-y-0.5">
          {primary.map((item) => (
            <NavItemRow
              key={item.path}
              item={item}
              isActive={isActive(item.path)}
              collapsed={collapsed}
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
                  collapsed={collapsed}
                  onNavClick={onNavClick}
                />
              ))}
            </ul>
          </>
        )}
      </nav>

      {/* Footer: collapse toggle + design system */}
      <div className="flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
        {/* Collapse button — desktop only */}
        <button
          onClick={onToggleCollapse}
          className="hidden lg:flex w-full items-center px-4 py-3 hover:bg-gray-50 transition-colors"
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            justifyContent: collapsed ? 'center' : 'flex-start',
          }}
          title={collapsed ? 'Développer le menu' : 'Réduire le menu'}
        >
          {collapsed
            ? <ChevronsRight size={16} style={{ color: '#9CA3AF' }} />
            : (
              <div className="flex items-center gap-2">
                <ChevronsLeft size={15} style={{ color: '#9CA3AF' }} />
                <span style={{ color: '#9CA3AF', fontSize: 12, fontWeight: 500 }}>Réduire</span>
              </div>
            )
          }
        </button>

        {/* Design system link — only when expanded */}
        {!collapsed && (
          <div className="px-4 pb-3">
            <a
              href="/design-system"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              style={{ textDecoration: 'none' }}
            >
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: '#D1D5DB' }} />
              <span style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 500 }}>Design System</span>
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
import { Menu, Bell, ChevronDown, LogOut, User, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { notificationsApi, type ApiNotification } from '../services/notifications.api';

interface TopbarProps {
  onMenuClick: () => void;
  pageTitle?: string;
  breadcrumb?: string[];
}

const ROLE_COLOR: Record<string, string> = {
  director:   '#3E5A78',
  educator:   '#065F46',
  supervisor: '#7C3AED',
  board:      '#92400E',
};

function useClickOutside(ref: React.RefObject<HTMLElement | null>, handler: () => void) {
  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (!ref.current || ref.current.contains(e.target as Node)) return;
      handler();
    };
    document.addEventListener('mousedown', listener);
    return () => document.removeEventListener('mousedown', listener);
  }, [ref, handler]);
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}j`;
}

// ─── Notification Panel ───────────────────────────────────────────────────────

function NotificationPanel({ notifications, onDismiss }: {
  notifications: ApiNotification[];
  onDismiss: (id: string) => void;
}) {
  const [index, setIndex] = useState(0);

  const safeIndex = Math.min(index, Math.max(0, notifications.length - 1));
  const current = notifications[safeIndex];

  const dismiss = (id: string) => {
    onDismiss(id);
    if (safeIndex >= notifications.length - 1 && safeIndex > 0) {
      setIndex(safeIndex - 1);
    }
  };

  if (notifications.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
        <Bell size={24} style={{ color: '#D1D5DB', marginBottom: 8 }} />
        <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune notification</p>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: '1px solid #F3F4F6' }}>
        <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>Notifications</p>
        <span style={{ color: '#9CA3AF', fontSize: 12 }}>{safeIndex + 1} / {notifications.length}</span>
      </div>

      {/* Current notification — full text, no truncation */}
      {current && (
        <div className="px-4 py-4">
          <div className="flex items-start gap-3">
            {!current.isRead && (
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: '#3E5A78' }} />
            )}
            {current.isRead && <div className="w-2 flex-shrink-0" />}
            <div className="flex-1">
              <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600, lineHeight: 1.5 }}>{current.title}</p>
              <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6, marginTop: 2 }}>{current.message}</p>
            </div>
            <button
              onClick={() => dismiss(current.id)}
              className="flex-shrink-0 p-1 rounded-md hover:bg-gray-100 ml-1"
              aria-label="Fermer cette notification"
            >
              <X size={14} style={{ color: '#9CA3AF' }} />
            </button>
          </div>
          <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 8, paddingLeft: 20 }}>Il y a {timeAgo(current.createdAt)}</p>
        </div>
      )}

      {/* Navigation chevrons */}
      {notifications.length > 1 && (
        <div className="flex items-center justify-between px-4 pb-3 pt-1" style={{ borderTop: '1px solid #F9F7F3' }}>
          <button
            onClick={() => setIndex(Math.max(0, safeIndex - 1))}
            disabled={safeIndex <= 0}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors"
            style={{ border: '1px solid #E5E7EB', background: '#FFFFFF', cursor: safeIndex <= 0 ? 'not-allowed' : 'pointer' }}
            aria-label="Notification précédente"
          >
            <ChevronLeft size={14} style={{ color: '#374151' }} />
          </button>

          {/* Dots */}
          <div className="flex items-center gap-1.5">
            {notifications.map((_, i) => (
              <button
                key={i}
                onClick={() => setIndex(i)}
                className="rounded-full transition-all"
                style={{
                  width: i === safeIndex ? 16 : 6,
                  height: 6,
                  background: i === safeIndex ? '#3E5A78' : '#D1D5DB',
                  border: 'none',
                  cursor: 'pointer',
                }}
              />
            ))}
          </div>

          <button
            onClick={() => setIndex(Math.min(notifications.length - 1, safeIndex + 1))}
            disabled={safeIndex >= notifications.length - 1}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg disabled:opacity-30 hover:bg-gray-50 transition-colors"
            style={{ border: '1px solid #E5E7EB', background: '#FFFFFF', cursor: safeIndex >= notifications.length - 1 ? 'not-allowed' : 'pointer' }}
            aria-label="Notification suivante"
          >
            <ChevronRight size={14} style={{ color: '#374151' }} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Topbar ───────────────────────────────────────────────────────────────────

export function Topbar({ onMenuClick, pageTitle = 'Tableau de bord', breadcrumb }: TopbarProps) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [notifOpen, setNotifOpen]     = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notifications, setNotifications] = useState<ApiNotification[]>([]);

  const notifRef   = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

  useClickOutside(notifRef,   () => setNotifOpen(false));
  useClickOutside(profileRef, () => setProfileOpen(false));

  const loadNotifications = () => {
    notificationsApi.list().then(setNotifications).catch(() => {});
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    if (notifOpen) loadNotifications();
  }, [notifOpen]);

  const roleColor = user ? ROLE_COLOR[user.role] : '#3E5A78';
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  const handleDismiss = (id: string) => {
    notificationsApi.markRead(id).catch(() => {});
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header
      className="flex items-center justify-between px-4 lg:px-6 flex-shrink-0"
      style={{
        height: 64,
        background: '#FFFFFF',
        borderBottom: '1px solid #E5E7EB',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        overflow: 'visible',
      }}
    >
      {/* Left: hamburger + title */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={onMenuClick}
          className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0"
          aria-label="Ouvrir le menu"
        >
          <Menu size={20} style={{ color: '#374151' }} />
        </button>
        <div className="min-w-0">
          {breadcrumb && breadcrumb.length > 0 && (
            <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 1 }}>
              {breadcrumb.join(' / ')}
            </p>
          )}
          <h1
            className="truncate"
            style={{ color: '#1A1A1A', fontSize: 17, fontWeight: 600 }}
          >
            {pageTitle}
          </h1>
        </div>
      </div>

      {/* Right: notifications + profile */}
      <div className="flex items-center gap-1.5 flex-shrink-0">

        {/* ── Notification bell ── */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => { setNotifOpen(!notifOpen); setProfileOpen(false); }}
            className="relative p-2 rounded-lg hover:bg-gray-50 transition-colors"
            aria-label="Notifications"
          >
            <Bell size={18} style={{ color: '#374151' }} />
            {unreadCount > 0 && (
              <span
                className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full"
                style={{ background: '#B91C1C' }}
              />
            )}
          </button>

          {notifOpen && (
            <>
              <style>{`
                .hadoum-notif-panel {
                  position: fixed;
                  top: 64px;
                  left: 0;
                  right: 0;
                  z-index: 50;
                  background: #FFFFFF;
                  border: 1px solid #E5E7EB;
                  border-radius: 0 0 12px 12px;
                  box-shadow: 0 10px 25px -5px rgba(0,0,0,0.12);
                }
                @media (min-width: 640px) {
                  .hadoum-notif-panel {
                    position: absolute;
                    top: calc(100% + 4px);
                    left: auto;
                    right: 0;
                    width: 320px;
                    border-radius: 12px;
                  }
                }
              `}</style>
              <div className="hadoum-notif-panel">
                <NotificationPanel notifications={notifications} onDismiss={handleDismiss} />
              </div>
            </>
          )}
        </div>

        {/* ── Profile dropdown ── */}
        {user && (
          <div className="relative" ref={profileRef}>
            <button
              onClick={() => { setProfileOpen(!profileOpen); setNotifOpen(false); }}
              className="flex items-center gap-2.5 pl-2 pr-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors"
              style={{ border: '1px solid #E5E7EB' }}
            >
              {/* Avatar */}
              <div
                className="flex items-center justify-center rounded-full flex-shrink-0"
                style={{
                  width: 30,
                  height: 30,
                  background: roleColor,
                  color: 'white',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                {user.initials}
              </div>
              <div className="hidden sm:block text-left">
                <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 500, lineHeight: 1.3 }}>
                  {user.name.split(' ')[0]}
                </p>
                <p style={{ color: '#9CA3AF', fontSize: 11, lineHeight: 1.3 }}>{user.roleLabel}</p>
              </div>
              <ChevronDown
                size={13}
                style={{
                  color: '#9CA3AF',
                  transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 150ms',
                }}
              />
            </button>

            {profileOpen && (
              <div
                className="absolute right-0 mt-2 rounded-xl shadow-lg"
                style={{
                  background: '#FFFFFF',
                  border: '1px solid #E5E7EB',
                  top: '100%',
                  width: 220,
                  maxWidth: 'calc(100vw - 1.5rem)',
                  zIndex: 50,
                }}
              >
                {/* User info */}
                <div className="px-4 py-3.5" style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center justify-center rounded-full flex-shrink-0"
                      style={{
                        width: 38,
                        height: 38,
                        background: roleColor,
                        color: 'white',
                        fontSize: 13,
                        fontWeight: 700,
                      }}
                    >
                      {user.initials}
                    </div>
                    <div className="min-w-0">
                      <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }} className="truncate">
                        {user.name}
                      </p>
                      <p style={{ color: '#6B7280', fontSize: 11 }} className="truncate">
                        {user.email}
                      </p>
                    </div>
                  </div>
                  <div
                    className="mt-2.5 px-2 py-1 rounded-md inline-flex items-center gap-1.5"
                    style={{ background: '#F0F4F8' }}
                  >
                    <div className="w-1.5 h-1.5 rounded-full" style={{ background: roleColor }} />
                    <span style={{ color: roleColor, fontSize: 11, fontWeight: 600 }}>
                      {user.roleLabel}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="py-1.5">
                  <button
                    onClick={() => { navigate('/app/profile'); setProfileOpen(false); }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
                  >
                    <User size={15} style={{ color: '#6B7280' }} />
                    <span style={{ color: '#374151', fontSize: 13 }}>Mon profil</span>
                  </button>
                </div>

                <div style={{ borderTop: '1px solid #F3F4F6' }}>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-red-50 transition-colors text-left"
                  >
                    <LogOut size={15} style={{ color: '#B91C1C' }} />
                    <span style={{ color: '#B91C1C', fontSize: 13, fontWeight: 500 }}>
                      Se déconnecter
                    </span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}

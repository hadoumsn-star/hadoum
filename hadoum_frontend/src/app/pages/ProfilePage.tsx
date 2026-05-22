import { useAuth } from '../context/AuthContext';
import { Mail, Briefcase, Shield, GraduationCap, Eye, Users } from 'lucide-react';

const ROLE_COLOR: Record<string, string> = {
  director:   '#3E5A78',
  educator:   '#065F46',
  supervisor: '#7C3AED',
  board:      '#92400E',
};

const ROLE_ICON: Record<string, React.ElementType> = {
  director:   Shield,
  educator:   GraduationCap,
  supervisor: Eye,
  board:      Users,
};

export function ProfilePage() {
  const { user } = useAuth();
  if (!user) return null;

  const color = ROLE_COLOR[user.role] ?? '#3E5A78';
  const RoleIcon = ROLE_ICON[user.role] ?? Shield;

  return (
    <div className="max-w-xl mx-auto px-4 py-10">

      {/* Avatar + name */}
      <div className="flex flex-col items-center text-center mb-8">
        <div
          className="flex items-center justify-center rounded-full mb-4"
          style={{ width: 80, height: 80, background: color, color: '#FFFFFF', fontSize: 26, fontWeight: 700 }}
        >
          {user.initials}
        </div>
        <h1 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 600, marginBottom: 4 }}>
          {user.name}
        </h1>
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full"
          style={{ background: `${color}15`, border: `1px solid ${color}30` }}
        >
          <RoleIcon size={13} style={{ color }} />
          <span style={{ color, fontSize: 12, fontWeight: 600 }}>{user.roleLabel}</span>
        </div>
      </div>

      {/* Info card */}
      <div
        className="rounded-2xl overflow-hidden"
        style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
      >
        <div className="px-5 py-4" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em' }}>
            INFORMATIONS DU COMPTE
          </p>
        </div>

        <div className="divide-y" style={{ borderColor: '#F3F4F6' }}>
          <Row icon={<Mail size={15} style={{ color: '#6B7280' }} />} label="Adresse e-mail" value={user.email} />
          <Row icon={<Briefcase size={15} style={{ color: '#6B7280' }} />} label="Poste" value={user.title} />
          <Row icon={<RoleIcon size={15} style={{ color: '#6B7280' }} />} label="Rôle" value={user.roleLabel} />
        </div>
      </div>

      {/* Demo notice */}
      <div
        className="mt-5 px-4 py-3 rounded-xl flex items-start gap-3"
        style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}
      >
        <div
          className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
          style={{ width: 28, height: 28, background: '#EEF2F7' }}
        >
          <Shield size={13} style={{ color: '#3E5A78' }} />
        </div>
        <p style={{ color: '#6B7280', fontSize: 12, lineHeight: 1.6 }}>
          La modification du profil sera disponible dans une prochaine version. Pour toute mise à jour,
          contactez l'administration Hadoum.
        </p>
      </div>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4">
      <div className="flex-shrink-0">{icon}</div>
      <div className="flex-1 min-w-0">
        <p style={{ color: '#9CA3AF', fontSize: 11, marginBottom: 1 }}>{label}</p>
        <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 500 }} className="truncate">{value}</p>
      </div>
    </div>
  );
}

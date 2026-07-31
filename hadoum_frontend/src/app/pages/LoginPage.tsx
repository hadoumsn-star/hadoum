import { useState } from 'react';
import { Navigate, Link } from 'react-router';
import { useAuth, UserRole, User } from '../context/AuthContext';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';
import { HadoumLogo } from '../components/HadoumLogo';
import {
  Shield,
  GraduationCap,
  Eye,
  EyeOff,
  Users,
  ArrowRight,
  Lock,
  Mail,
  CheckCircle2,
  ChevronDown,
} from 'lucide-react';

// Demo-only emails (frontend login, no API call)
const DEMO_EMAIL_TO_ROLE: Record<string, UserRole> = {
  'a.benali@hadoum.org':   'director',
  'k.mansouri@hadoum.org': 'educator',
  'n.hamidi@hadoum.org':   'supervisor',
  'o.zidane@hadoum.org':   'board',
};

const DEMO_PROFILES: {
  key: UserRole;
  label: string;
  description: string;
  icon: React.ElementType;
  email: string;
  color: string;
  bg: string;
}[] = [
  {
    key: 'director',
    label: 'Directrice',
    description: 'Pilotage global — équipes, enfants, finances, rapports',
    icon: Shield,
    email: 'a.benali@hadoum.org',
    color: '#3E5A78',
    bg: '#EEF2F7',
  },
  {
    key: 'educator',
    label: 'Éducateur',
    description: 'Classes, présences, activités, messagerie',
    icon: GraduationCap,
    email: 'k.mansouri@hadoum.org',
    color: '#065F46',
    bg: '#ECFDF5',
  },
  {
    key: 'supervisor',
    label: 'Superviseure',
    description: 'Validations, incidents, suivis, rapports',
    icon: Eye,
    email: 'n.hamidi@hadoum.org',
    color: '#7C3AED',
    bg: '#F5F3FF',
  },
  {
    key: 'board',
    label: "Conseil d'Administration",
    description: 'Indicateurs stratégiques, rapports, exports',
    icon: Users,
    email: 'o.zidane@hadoum.org',
    color: '#92400E',
    bg: '#FFFBEB',
  },
];

export function LoginPage() {
  const { login, loginWithUser, isAuthenticated, user } = useAuth();

  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]         = useState('');
  const [loading, setLoading]     = useState(false);
  const [demoOpen, setDemoOpen]   = useState(false);

  if (isAuthenticated) {
    return <Navigate to={user?.role === 'director' ? '/app/children' : '/app/dashboard'} replace />;
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) { setError('Veuillez saisir votre adresse e-mail.'); return; }
    if (!password)     { setError('Veuillez saisir votre mot de passe.'); return; }

    // Demo accounts → frontend-only, no API call
    const demoRole = DEMO_EMAIL_TO_ROLE[email.trim().toLowerCase()];
    if (demoRole) {
      setLoading(true);
      // isAuthenticated bascule à true ⇒ redirection gérée par le <Navigate> ci-dessus
      setTimeout(() => { login(demoRole); }, 400);
      return;
    }

    // Real credentials → call the backend
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? 'Identifiants incorrects.');
        setLoading(false);
        return;
      }

      const data: { token: string; user: User } = await res.json();
      loginWithUser(data.user, data.token);
      // isAuthenticated bascule à true ⇒ redirection gérée par le <Navigate> ci-dessus
    } catch {
      setError('Impossible de joindre le serveur. Vérifiez votre connexion.');
      setLoading(false);
    }
  };

  const handleDemoLogin = (demoEmail: string) => {
    const role = DEMO_EMAIL_TO_ROLE[demoEmail];
    if (!role) return;
    setLoading(true);
    setTimeout(() => { login(role); }, 400);
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#F9F7F3' }}>

      {/* ── Left branding panel (desktop) ── */}
      <div
        className="hidden lg:flex flex-col justify-between p-12"
        style={{ width: 400, background: '#1A1A1A', flexShrink: 0 }}
      >
        <div style={{ overflow: 'hidden', maxWidth: '100%' }}>
          <HadoumLogo size="xlarge" onDark={true} style={{ height: 200, width: 'auto' }} />
        </div>

        <div>
          <h2
            style={{
              color: '#FFFFFF',
              fontSize: 26,
              fontWeight: 400,
              lineHeight: 1.4,
              marginBottom: 14,
              fontFamily: 'Georgia, serif',
            }}
          >
            La maison de l'amour et de la miséricorde
          </h2>
          {/* <p style={{ color: '#9CA3AF', fontSize: 14, lineHeight: 1.7 }}>
            Hadoum est la plateforme de gestion de l'orphelinat. Chaque profil accède
            uniquement aux outils et informations nécessaires à sa mission.
          </p> */}
        </div>

        <p style={{ color: '#6B7280', fontSize: 12 }}>
          © 2026 Fondation Hadoum · Version 1.0
        </p>
      </div>

      {/* ── Right login panel ── */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 overflow-y-auto">

        {/* Mobile logo */}
        <div className="lg:hidden mb-8 flex justify-center">
          <HadoumLogo size="large" style={{ height: 160, width: 'auto' }} />
        </div>

        <div className="w-full max-w-md">

          {/* Header */}
          <div className="mb-8">
            <h1 style={{ color: '#1A1A1A', fontSize: 24, fontWeight: 600, marginBottom: 6 }}>
              Connexion
            </h1>
            <p style={{ color: '#374151', fontSize: 14 }}>
              Accédez à votre espace avec vos identifiants institutionnels
            </p>
          </div>

          {/* ── Real login form ── */}
          <form onSubmit={handleLogin} noValidate>
            <div className="space-y-4 mb-2">
              {/* Email */}
              <div>
                <label
                  htmlFor="email"
                  style={{ color: '#374151', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}
                >
                  Adresse e-mail professionnelle
                </label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                  <input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(''); }}
                    placeholder="prenom.nom@hadoum.org"
                    className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none transition-all"
                    style={{
                      background: '#FFFFFF',
                      border: `1.5px solid ${error ? '#B91C1C' : '#E5E7EB'}`,
                      color: '#1A1A1A',
                      fontSize: 14,
                    }}
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label
                  htmlFor="password"
                  style={{ color: '#374151', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}
                >
                  Mot de passe
                </label>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setError(''); }}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 rounded-lg outline-none"
                    style={{
                      background: '#FFFFFF',
                      border: `1.5px solid ${error ? '#B91C1C' : '#E5E7EB'}`,
                      color: '#1A1A1A',
                      fontSize: 14,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#9CA3AF' }}
                  >
                    {showPassword ? <Eye size={15} /> : <EyeOff size={15} />}
                  </button>
                </div>
              </div>
            </div>

            {/* Forgot password */}
            <div className="flex justify-end mb-5">
              <Link
                to="/forgot-password"
                style={{ color: '#3E5A78', fontSize: 12, fontWeight: 500 }}
              >
                Mot de passe oublié ?
              </Link>
            </div>

            {/* Error */}
            {error && (
              <div
                className="mb-4 px-4 py-3 rounded-lg"
                style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
              >
                <p style={{ color: '#B91C1C', fontSize: 13 }}>{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg transition-all"
              style={{
                background: loading ? '#6B8BA4' : '#3E5A78',
                color: '#FFFFFF',
                fontSize: 15,
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                border: 'none',
              }}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Connexion en cours…
                </>
              ) : (
                <>
                  Se connecter
                  <ArrowRight size={16} />
                </>
              )}
            </button>
          </form>

          {/* ── Demo access section ── */}
          <div className="mt-8">
            {/* <button
              type="button"
              onClick={() => setDemoOpen(!demoOpen)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors"
              style={{
                background: demoOpen ? '#EEF2F7' : '#F9F7F3',
                border: '1px solid #E5E7EB',
              }}
            >
              <span style={{ color: '#374151', fontSize: 13, fontWeight: 500 }}>
                🔍 Accès démonstration — Explorer sans identifiants
              </span>
              <ChevronDown
                size={15}
                style={{
                  color: '#9CA3AF',
                  transform: demoOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                  transition: 'transform 200ms',
                  flexShrink: 0,
                }}
              />
            </button> */}

            {/* {demoOpen && (
              <div
                className="mt-2 p-3 rounded-xl space-y-2"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
              >
                <p style={{ color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', marginBottom: 8 }}>
                  CHOISIR UN PROFIL POUR EXPLORER
                </p>
                {DEMO_PROFILES.map((profile) => {
                  const Icon = profile.icon;
                  return (
                    <button
                      key={profile.key}
                      type="button"
                      onClick={() => handleDemoLogin(profile.email)}
                      className="w-full flex items-start gap-3 p-3 rounded-xl text-left transition-all hover:shadow-sm"
                      style={{
                        background: profile.bg,
                        border: `1.5px solid transparent`,
                        cursor: 'pointer',
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.border = `1.5px solid ${profile.color}40`;
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLButtonElement).style.border = `1.5px solid transparent`;
                      }}
                    >
                      <div
                        className="flex items-center justify-center rounded-lg flex-shrink-0 mt-0.5"
                        style={{ width: 30, height: 30, background: '#FFFFFF' }}
                      >
                        <Icon size={15} style={{ color: profile.color }} />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>
                            {profile.label}
                          </p>
                          <CheckCircle2 size={12} style={{ color: profile.color }} />
                        </div>
                        <p style={{ color: '#6B7280', fontSize: 11, lineHeight: 1.4 }}>
                          {profile.description}
                        </p>
                      </div>
                      <ArrowRight
                        size={13}
                        className="flex-shrink-0 mt-1"
                        style={{ color: profile.color }}
                      />
                    </button>
                  );
                })}
              </div>
            )} */}
          </div>

        </div>
      </div>
    </div>
  );
}
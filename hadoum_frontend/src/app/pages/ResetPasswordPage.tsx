import { useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router';
import { HadoumLogo } from '../components/HadoumLogo';
import { Lock, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';

  const [password, setPassword]       = useState('');
  const [confirm, setConfirm]         = useState('');
  const [showPass, setShowPass]       = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);
  const [success, setSuccess]         = useState(false);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F9F7F3' }}>
        <div className="text-center max-w-md px-6">
          <p style={{ color: '#B91C1C', fontSize: 15, marginBottom: 16 }}>
            Lien de réinitialisation invalide ou manquant.
          </p>
          <Link to="/login" style={{ color: '#3E5A78', fontSize: 14, fontWeight: 500 }}>
            Retour à la connexion
          </Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Le mot de passe doit contenir au moins 8 caractères.');
      return;
    }
    if (password !== confirm) {
      setError('Les mots de passe ne correspondent pas.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.message ?? 'Lien invalide ou expiré.');
        return;
      }

      setSuccess(true);
      setTimeout(() => navigate('/login'), 3000);
    } catch {
      setError('Impossible de joindre le serveur. Vérifiez votre connexion.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#F9F7F3' }}>
      {/* Left branding panel */}
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
        </div>
        <p style={{ color: '#6B7280', fontSize: 12 }}>
          © 2026 Fondation Hadoum · Version 1.0
        </p>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12">
        <div className="lg:hidden mb-8 flex justify-center">
          <HadoumLogo size="large" style={{ height: 160, width: 'auto' }} />
        </div>

        <div className="w-full max-w-md">
          {success ? (
            <div className="text-center py-8">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
                style={{ background: '#ECFDF5' }}
              >
                <CheckCircle2 size={32} style={{ color: '#065F46' }} />
              </div>
              <h1 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
                Mot de passe réinitialisé
              </h1>
              <p style={{ color: '#374151', fontSize: 14 }}>
                Votre mot de passe a été mis à jour. Vous allez être redirigé vers la page de connexion…
              </p>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 style={{ color: '#1A1A1A', fontSize: 24, fontWeight: 600, marginBottom: 6 }}>
                  Nouveau mot de passe
                </h1>
                <p style={{ color: '#374151', fontSize: 14 }}>
                  Choisissez un mot de passe d'au moins 8 caractères.
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate>
                <div className="space-y-4 mb-6">
                  {/* Password */}
                  <div>
                    <label
                      htmlFor="password"
                      style={{ color: '#374151', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}
                    >
                      Nouveau mot de passe
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                      <input
                        id="password"
                        type={showPass ? 'text' : 'password'}
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
                        onClick={() => setShowPass(!showPass)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm */}
                  <div>
                    <label
                      htmlFor="confirm"
                      style={{ color: '#374151', fontSize: 13, fontWeight: 500, display: 'block', marginBottom: 6 }}
                    >
                      Confirmer le mot de passe
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                      <input
                        id="confirm"
                        type={showConfirm ? 'text' : 'password'}
                        value={confirm}
                        onChange={(e) => { setConfirm(e.target.value); setError(''); }}
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
                        onClick={() => setShowConfirm(!showConfirm)}
                        className="absolute right-3 top-1/2 -translate-y-1/2"
                        style={{ color: '#9CA3AF', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                      >
                        {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>

                {error && (
                  <div
                    className="mb-4 px-4 py-3 rounded-lg"
                    style={{ background: '#FEF2F2', border: '1px solid #FECACA' }}
                  >
                    <p style={{ color: '#B91C1C', fontSize: 13 }}>{error}</p>
                  </div>
                )}

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
                      Réinitialisation…
                    </>
                  ) : (
                    'Réinitialiser le mot de passe'
                  )}
                </button>

                <div className="mt-4 text-center">
                  <Link to="/login" style={{ color: '#6B7280', fontSize: 13 }}>
                    Retour à la connexion
                  </Link>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

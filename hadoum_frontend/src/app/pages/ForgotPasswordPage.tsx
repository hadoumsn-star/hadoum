import { useState } from 'react';
import { Link } from 'react-router';
import { HadoumLogo } from '../components/HadoumLogo';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3001/api';

export function ForgotPasswordPage() {
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent]       = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email.trim()) {
      setError('Veuillez saisir votre adresse e-mail.');
      return;
    }

    setLoading(true);
    try {
      await fetch(`${API_BASE}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setSent(true);
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
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 mb-8"
            style={{ color: '#6B7280', fontSize: 13 }}
          >
            <ArrowLeft size={14} />
            Retour à la connexion
          </Link>

          {sent ? (
            <div className="text-center py-8">
              <div
                className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-6"
                style={{ background: '#ECFDF5' }}
              >
                <CheckCircle2 size={32} style={{ color: '#065F46' }} />
              </div>
              <h1 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 600, marginBottom: 12 }}>
                Lien généré
              </h1>
              <p style={{ color: '#374151', fontSize: 14, lineHeight: 1.7 }}>
                Si cette adresse est enregistrée, un lien de réinitialisation a été transmis.
                Contactez votre administrateur si vous ne le recevez pas dans les prochaines minutes.
              </p>
              <Link
                to="/login"
                className="inline-block mt-8 px-6 py-2.5 rounded-lg"
                style={{
                  background: '#3E5A78',
                  color: '#FFFFFF',
                  fontSize: 14,
                  fontWeight: 600,
                  textDecoration: 'none',
                }}
              >
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <>
              <div className="mb-8">
                <h1 style={{ color: '#1A1A1A', fontSize: 24, fontWeight: 600, marginBottom: 6 }}>
                  Mot de passe oublié
                </h1>
                <p style={{ color: '#374151', fontSize: 14 }}>
                  Saisissez votre adresse e-mail institutionnelle. Un lien de réinitialisation vous sera transmis.
                </p>
              </div>

              <form onSubmit={handleSubmit} noValidate>
                <div className="mb-4">
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
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg outline-none"
                      style={{
                        background: '#FFFFFF',
                        border: `1.5px solid ${error ? '#B91C1C' : '#E5E7EB'}`,
                        color: '#1A1A1A',
                        fontSize: 14,
                      }}
                    />
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
                      Envoi en cours…
                    </>
                  ) : (
                    'Envoyer le lien'
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

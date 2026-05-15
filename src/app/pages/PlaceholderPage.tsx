import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
}

export function PlaceholderPage({ title }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6">
      <div
        className="flex items-center justify-center rounded-2xl mb-5"
        style={{ width: 64, height: 64, background: '#EEF2F7' }}
      >
        <Construction size={28} style={{ color: '#3E5A78' }} />
      </div>
      <h2 style={{ color: '#1A1A1A', fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
        {title}
      </h2>
      <p style={{ color: '#6B7280', fontSize: 14, textAlign: 'center', maxWidth: 340 }}>
        Cette section est en cours de développement et sera disponible prochainement.
      </p>
      <div
        className="mt-6 px-4 py-2 rounded-lg"
        style={{ background: '#EEF2F7' }}
      >
        <p style={{ color: '#3E5A78', fontSize: 12, fontWeight: 500 }}>
          Version 1.0 — Hadoum Platform
        </p>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { Download, FileText, Check, Loader2, Table2, BarChart2, Users } from 'lucide-react';

const EXPORTS = [
  { id: 1, title: 'Liste des enfants',           desc: 'Tous les dossiers enregistrés avec statuts',      icon: Users,    format: ['PDF', 'Excel'], color: '#3E5A78', bg: '#EEF2F7' },
  { id: 2, title: 'Rapport de présences',        desc: 'Présences par classe, période sélectionnable',    icon: Table2,   format: ['PDF', 'Excel'], color: '#065F46', bg: '#ECFDF5' },
  { id: 3, title: 'Synthèse budgétaire',         desc: 'Consommation par poste, recettes & dépenses',    icon: BarChart2,format: ['PDF'],           color: '#D97706', bg: '#FFFBEB' },
  { id: 4, title: 'Rapport mensuel complet',     desc: 'Rapport consolidé pour soumission au ministère', icon: FileText, format: ['PDF'],           color: '#7C3AED', bg: '#F5F3FF' },
  { id: 5, title: 'Fiche équipe pédagogique',    desc: 'Liste éducateurs, rôles, statuts de présence',   icon: Users,    format: ['PDF', 'Excel'], color: '#374151', bg: '#F3F4F6' },
  { id: 6, title: 'Indicateurs de gouvernance', desc: 'KPIs et tendances pour le Conseil',              icon: BarChart2,format: ['PDF'],           color: '#B91C1C', bg: '#FEF2F2' },
];

export function ExportsPage() {
  const [downloading, setDownloading] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);

  const handleDownload = (id: number, fmt: string) => {
    const key = `${id}-${fmt}`;
    setDownloading(key);
    setTimeout(() => {
      setDownloading(null);
      setDone(prev => [...prev, key]);
      setTimeout(() => setDone(prev => prev.filter(k => k !== key)), 3000);
    }, 1400);
  };

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1000 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Exports & Téléchargements</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>Générez et téléchargez les documents institutionnels</p>
      </div>

      <div
        className="flex items-start gap-3 px-4 py-3.5 rounded-xl"
        style={{ background: '#EEF2F7', border: '1px solid #BFCFDF' }}
      >
        <FileText size={15} style={{ color: '#3E5A78', flexShrink: 0, marginTop: 1 }} />
        <p style={{ color: '#374151', fontSize: 13 }}>
          Les exports sont générés en temps réel avec les données du jour.
          Les fichiers PDF sont au format A4, les fichiers Excel sont compatibles LibreOffice & Excel.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {EXPORTS.map((exp) => {
          const Icon = exp.icon;
          return (
            <div key={exp.id} className="rounded-xl p-5" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
              <div className="flex items-start gap-4">
                <div className="flex items-center justify-center rounded-xl flex-shrink-0" style={{ width: 40, height: 40, background: exp.bg }}>
                  <Icon size={18} style={{ color: exp.color }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{exp.title}</p>
                  <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2, lineHeight: 1.5 }}>{exp.desc}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid #F3F4F6' }}>
                {exp.format.map((fmt) => {
                  const key = `${exp.id}-${fmt}`;
                  const isDl = downloading === key;
                  const isDone = done.includes(key);
                  return (
                    <button
                      key={fmt}
                      onClick={() => handleDownload(exp.id, fmt)}
                      disabled={isDl}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg transition-all"
                      style={{
                        background: isDone ? '#ECFDF5' : '#EEF2F7',
                        color: isDone ? '#065F46' : '#3E5A78',
                        fontSize: 12, fontWeight: 600, border: 'none', cursor: isDl ? 'wait' : 'pointer',
                      }}
                    >
                      {isDl ? <Loader2 size={12} className="animate-spin" />
                        : isDone ? <Check size={12} />
                        : <Download size={12} />
                      }
                      {isDl ? 'Export…' : isDone ? `${fmt} ✓` : fmt}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

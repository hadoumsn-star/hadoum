import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, FileText, Eye } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  donorReportsApi, type ApiDonorReport, type ApiDonorReportStatus, type CreateDonorReportInput,
} from '../../services/donorReports.api';
import { PERIOD_TYPE_LABELS, REPORT_STATUS_LABELS, REPORT_STATUS_STYLE } from '../../config/donors.config';
import { DonorReportFormModal } from './DonorReportFormModal';
import { DonorReportDetailModal } from './DonorReportDetailModal';

type StatusFilter = ApiDonorReportStatus | 'all';

export function ReportsSection() {
  const { user } = useAuth();
  const isDirector = user?.role === 'director';

  const [reports, setReports] = useState<ApiDonorReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = () =>
    donorReportsApi.list({ status: statusFilter === 'all' ? undefined : statusFilter, pageSize: 100 })
      .then((res) => setReports(res.data))
      .catch(() => toast.error('Erreur lors du chargement des rapports.'));

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function handleCreate(data: CreateDonorReportInput) {
    const created = await donorReportsApi.create(data);
    setReports((prev) => [created, ...prev]);
    setShowCreate(false);
    toast.success('Rapport créé en brouillon.');
  }

  const STATUS_OPTIONS: StatusFilter[] = ['all', 'DRAFT', 'GENERATED', 'SENT'];

  return (
    <div className="space-y-4" data-testid="donor-section-reports">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 style={{ color: '#1A1A1A', fontSize: 18, fontWeight: 700 }}>Rapports</h3>
          <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>{reports.length} au total sur ce filtre</p>
        </div>
        {isDirector && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
            style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
            <Plus size={16} /> Nouveau rapport
          </button>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {STATUS_OPTIONS.map((s) => (
          <button key={s} onClick={() => setStatusFilter(s)} className="px-3 py-2 rounded-lg"
            style={{
              background: statusFilter === s ? '#3E5A78' : '#FFFFFF',
              color: statusFilter === s ? '#FFFFFF' : '#374151',
              fontSize: 13, fontWeight: 500,
              border: `1px solid ${statusFilter === s ? 'transparent' : '#E5E7EB'}`,
              cursor: 'pointer',
            }}>
            {s === 'all' ? 'Tous' : REPORT_STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {loading ? (
          <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Chargement…</p>
        ) : reports.length === 0 ? (
          <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <FileText size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
            <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun rapport dans cette catégorie</p>
          </div>
        ) : (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid #E5E7EB', background: '#FFFFFF' }}>
            {reports.map((r, i) => {
              const statusStyle = REPORT_STATUS_STYLE[r.status];
              return (
                <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 cursor-pointer hover:bg-gray-50"
                  style={{ borderTop: i === 0 ? 'none' : '1px solid #F3F4F6' }}
                  onClick={() => setDetailId(r.id)}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>
                        {REPORT_STATUS_LABELS[r.status].toUpperCase()}
                      </span>
                      <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{r.donorProfile.contact.fullName}</p>
                    </div>
                    <p style={{ color: '#9CA3AF', fontSize: 12 }}>
                      {PERIOD_TYPE_LABELS[r.periodType]} · Du {new Date(r.periodStart).toLocaleDateString('fr-FR')} au {new Date(r.periodEnd).toLocaleDateString('fr-FR')}
                      {r.generatedAt && ` · Généré le ${new Date(r.generatedAt).toLocaleDateString('fr-FR')}`}
                      {r.sentAt && ` · Envoyé le ${new Date(r.sentAt).toLocaleDateString('fr-FR')}`}
                    </p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); setDetailId(r.id); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
                    style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                    <Eye size={13} /> Voir
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showCreate && <DonorReportFormModal onSave={handleCreate} onClose={() => setShowCreate(false)} />}
      {detailId && (
        <DonorReportDetailModal
          reportId={detailId}
          isDirector={isDirector}
          onClose={() => setDetailId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}

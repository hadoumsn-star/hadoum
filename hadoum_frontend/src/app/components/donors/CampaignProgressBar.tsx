import type { ApiCampaign } from '../../services/campaigns.api';
import { formatXof } from '../../config/financeCategories.config';

// Purely a display component — collectedAmountXof/remainingAmountXof/
// progressPercentage always come straight from the backend (see
// ApiCampaign's own comment); this never recomputes them from Donation
// rows itself.
export function CampaignProgressBar({ campaign }: { campaign: ApiCampaign }) {
  const pct = campaign.progressPercentage ?? 0;
  const displayPct = Math.min(100, Math.max(0, pct));
  const overfunded = pct > 100;

  return (
    <div>
      <div className="flex items-end justify-between mb-1.5">
        <p style={{ color: '#1A1A1A', fontSize: 15, fontWeight: 700 }}>{formatXof(campaign.collectedAmountXof)}</p>
        <p style={{ color: '#9CA3AF', fontSize: 12 }}>sur {formatXof(campaign.targetAmountXof)}</p>
      </div>
      <div className="w-full rounded-full overflow-hidden" style={{ height: 8, background: '#F3F4F6' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${displayPct}%`, background: overfunded ? '#065F46' : '#3E5A78' }}
        />
      </div>
      <div className="flex items-center justify-between mt-1.5">
        <p style={{ color: overfunded ? '#065F46' : '#6B7280', fontSize: 12, fontWeight: overfunded ? 700 : 400 }}>
          {pct}% {overfunded ? '— objectif dépassé' : 'atteint'}
        </p>
        <p style={{ color: '#9CA3AF', fontSize: 12 }}>
          Reste {formatXof(campaign.remainingAmountXof)} · {campaign.donationsCount} don(s)
        </p>
      </div>
    </div>
  );
}

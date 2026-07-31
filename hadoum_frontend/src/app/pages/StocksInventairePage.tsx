import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext';
import {
  stockItemsApi,
  type ApiStockItem, type ApiStockItemDetail, type ApiStockCategory,
  type CreateStockItemInput,
} from '../services/stockItems.api';
import { type ApiStockMovement } from '../services/stockMovements.api';
import {
  inventoryAssetsApi,
  type ApiInventoryAsset, type ApiInventoryAssetDetail, type ApiAssetDisposalType,
  type CreateInventoryAssetInput,
} from '../services/inventoryAssets.api';
import type { ApiValidationRequest } from '../services/maintenanceTickets.api';
import {
  STOCK_CATEGORY_LABELS, STOCK_CATEGORY_OPTIONS, STOCK_UNIT_LABELS, STOCK_UNIT_OPTIONS,
  STOCK_MOVEMENT_TYPE_LABELS, STOCK_MOVEMENT_TYPE_STYLE, PENDING_STOCK_ACTION_LABELS, formatXof,
} from '../config/stockItems.config';
import {
  ASSET_CONDITION_LABELS, ASSET_CONDITION_OPTIONS, ASSET_STATUS_LABELS, ASSET_STATUS_STYLE,
  ASSET_DISPOSAL_TYPE_LABELS, ASSET_DISPOSAL_TYPE_OPTIONS, PENDING_ASSET_ACTION_LABELS,
} from '../config/inventoryAssets.config';
import { VALIDATION_STATUS_LABELS, VALIDATION_STATUS_STYLE } from '../config/validations.config';
import {
  Plus, X, Search, Eye, Pencil, Package, Archive, CheckCircle2,
  Upload, Paperclip, Trash2, Send, ShieldCheck, ShieldAlert, MessageSquareWarning,
  RefreshCw, Clock, AlertTriangle, ArrowDownCircle, ArrowUpCircle, Wrench,
  ClipboardList, Boxes, UserCog,
} from 'lucide-react';

const INPUT: React.CSSProperties = {
  width: '100%', padding: '8px 12px', borderRadius: 8,
  border: '1px solid #E5E7EB', background: '#FFFFFF',
  color: '#1A1A1A', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

const LABEL: React.CSSProperties = { color: '#374151', fontSize: 12, fontWeight: 500, display: 'block', marginBottom: 5 };
const SECTION_TITLE: React.CSSProperties = { color: '#9CA3AF', fontSize: 11, fontWeight: 600, letterSpacing: '0.05em', marginBottom: 8 };

// ─── Stock item badges ──────────────────────────────────────────────────────

function stockAlertBadges(i: ApiStockItem): { label: string; bg: string; color: string }[] {
  const badges: { label: string; bg: string; color: string }[] = [];
  if (!i.isActive) return badges;
  if (i.isOutOfStock) badges.push({ label: 'Rupture', bg: '#FEF2F2', color: '#B91C1C' });
  else if (i.isLowStock) badges.push({ label: 'Stock faible', bg: '#FFFBEB', color: '#D97706' });
  if (i.isExpired) badges.push({ label: 'Expiré', bg: '#FEF2F2', color: '#B91C1C' });
  else if (i.isExpiringSoon) badges.push({ label: 'Expire bientôt', bg: '#FFFBEB', color: '#D97706' });
  return badges;
}

function assetAlertBadges(a: ApiInventoryAsset): { label: string; bg: string; color: string }[] {
  const badges: { label: string; bg: string; color: string }[] = [];
  if (a.status === 'ARCHIVE') return badges;
  if (a.isInventoryCheckOverdue) badges.push({ label: 'Inventaire en retard', bg: '#FEF2F2', color: '#B91C1C' });
  else if (a.isInventoryCheckDue) badges.push({ label: 'Inventaire à prévoir', bg: '#FFFBEB', color: '#D97706' });
  if (a.isWarrantyExpiringSoon) badges.push({ label: 'Garantie bientôt expirée', bg: '#F5F3FF', color: '#7C3AED' });
  return badges;
}

// ─── Create / edit stock item modal ─────────────────────────────────────────

function StockItemModal({ initial, onSave, onClose }: {
  initial?: ApiStockItem;
  onSave: (data: CreateStockItemInput) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    reference: initial?.reference ?? '',
    barcode: initial?.barcode ?? '',
    category: initial?.category ?? ('AUTRE' as ApiStockCategory),
    description: initial?.description ?? '',
    unit: initial?.unit ?? 'UNITE',
    minimumQuantity: initial?.minimumQuantity != null ? String(initial.minimumQuantity) : '',
    maximumQuantity: initial?.maximumQuantity != null ? String(initial.maximumQuantity) : '',
    reorderQuantity: initial?.reorderQuantity != null ? String(initial.reorderQuantity) : '',
    unitCost: initial?.unitCost != null ? String(initial.unitCost) : '',
    storageLocation: initial?.storageLocation ?? '',
    supplierName: initial?.supplierName ?? '',
    batchNumber: initial?.batchNumber ?? '',
    expirationDate: initial?.expirationDate?.slice(0, 10) ?? '',
    isPerishable: initial?.isPerishable ?? false,
    notes: initial?.notes ?? '',
    initialQuantity: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  const canSave = form.name.trim().length > 0 && !saving;

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    onSave({
      name: form.name.trim(),
      reference: form.reference.trim() || undefined,
      barcode: form.barcode.trim() || undefined,
      category: form.category,
      description: form.description.trim() || undefined,
      unit: form.unit as CreateStockItemInput['unit'],
      minimumQuantity: form.minimumQuantity ? parseFloat(form.minimumQuantity) : undefined,
      maximumQuantity: form.maximumQuantity ? parseFloat(form.maximumQuantity) : undefined,
      reorderQuantity: form.reorderQuantity ? parseFloat(form.reorderQuantity) : undefined,
      unitCost: form.unitCost ? parseInt(form.unitCost, 10) : undefined,
      storageLocation: form.storageLocation.trim() || undefined,
      supplierName: form.supplierName.trim() || undefined,
      batchNumber: form.batchNumber.trim() || undefined,
      expirationDate: form.expirationDate || undefined,
      isPerishable: form.isPerishable,
      notes: form.notes.trim() || undefined,
      initialQuantity: !isEdit && form.initialQuantity ? parseFloat(form.initialQuantity) : undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{isEdit ? "Modifier l'article" : 'Nouvel article'}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={LABEL}>Article *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex : Riz local 25kg" style={INPUT} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Catégorie</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {STOCK_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{STOCK_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>Unité</label>
              <select value={form.unit} onChange={e => set('unit', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {STOCK_UNIT_OPTIONS.map(u => <option key={u} value={u}>{STOCK_UNIT_LABELS[u]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Référence</label>
              <input value={form.reference} onChange={e => set('reference', e.target.value)} placeholder="Ex : REF-001" style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Code-barres</label>
              <input value={form.barcode} onChange={e => set('barcode', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div>
            <label style={LABEL}>Description</label>
            <textarea value={form.description} onChange={e => set('description', e.target.value)}
              rows={2} placeholder="Décrivez l'article…" style={{ ...INPUT, resize: 'none' }} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label style={LABEL}>Seuil minimum</label>
              <input type="number" min={0} value={form.minimumQuantity} onChange={e => set('minimumQuantity', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Seuil maximum</label>
              <input type="number" min={0} value={form.maximumQuantity} onChange={e => set('maximumQuantity', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Quantité de réappro.</label>
              <input type="number" min={0} value={form.reorderQuantity} onChange={e => set('reorderQuantity', e.target.value)} style={INPUT} />
            </div>
          </div>
          {!isEdit && (
            <div>
              <label style={LABEL}>Quantité initiale (stock de départ)</label>
              <input type="number" min={0} value={form.initialQuantity} onChange={e => set('initialQuantity', e.target.value)} placeholder="0" style={INPUT} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Coût unitaire (FCFA)</label>
              <input type="number" min={0} value={form.unitCost} onChange={e => set('unitCost', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Emplacement</label>
              <input value={form.storageLocation} onChange={e => set('storageLocation', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Fournisseur</label>
              <input value={form.supplierName} onChange={e => set('supplierName', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>N° de lot</label>
              <input value={form.batchNumber} onChange={e => set('batchNumber', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 items-end">
            <div>
              <label style={LABEL}>Date d'expiration</label>
              <input type="date" value={form.expirationDate} onChange={e => set('expirationDate', e.target.value)} style={INPUT} />
            </div>
            <label className="flex items-center gap-2 pb-2" style={{ fontSize: 13, color: '#374151' }}>
              <input type="checkbox" checked={form.isPerishable} onChange={e => set('isPerishable', e.target.checked)} />
              Périssable
            </label>
          </div>
          <div>
            <label style={LABEL}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              rows={2} style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={handleSave} className="flex-1 py-2.5 rounded-lg"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Movement action modal (entry / exit / adjustment / transfer) ──────────

type MovementMode = 'entry' | 'exit' | 'adjustment' | 'transfer';

const MOVEMENT_TITLES: Record<MovementMode, string> = {
  entry: 'Entrée de stock',
  exit: 'Sortie de stock',
  adjustment: 'Ajustement de stock',
  transfer: 'Transfert de stock',
};

function MovementModal({ mode, item, onSubmit, onClose }: {
  mode: MovementMode;
  item: ApiStockItem;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [destination, setDestination] = useState('');
  const [lossType, setLossType] = useState<'' | 'PERTE' | 'CASSE' | 'PEREMPTION'>('');
  const [submitting, setSubmitting] = useState(false);

  const qty = parseFloat(quantity || '0');
  const isAdjustmentNegative = mode === 'adjustment' && quantity.startsWith('-');
  const willBeAfter = mode === 'entry' ? item.currentQuantity + (qty || 0)
    : mode === 'exit' ? item.currentQuantity - (qty || 0)
    : mode === 'adjustment' ? item.currentQuantity + (qty || 0)
    : item.currentQuantity;

  const largeExitThreshold = 50;
  const requiresValidationHint =
    (mode === 'exit' && qty > largeExitThreshold) ||
    (mode === 'adjustment' && qty < 0 && item.currentQuantity > 0 && Math.abs(qty) / item.currentQuantity * 100 > 20) ||
    (mode === 'adjustment' && !!lossType);

  const canSubmit = mode === 'transfer'
    ? destination.trim().length > 0
    : quantity !== '' && qty !== 0 && !submitting && (mode !== 'exit' || willBeAfter >= 0);

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      if (mode === 'entry') await onSubmit({ quantity: qty, reason: reason || undefined });
      if (mode === 'exit') await onSubmit({ quantity: qty, reason: reason || undefined, destination: destination || undefined });
      if (mode === 'adjustment') await onSubmit({ quantityDelta: qty, reason, lossType: lossType || undefined });
      if (mode === 'transfer') await onSubmit({ destination, reason: reason || undefined });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{MOVEMENT_TITLES[mode]}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {mode !== 'transfer' && (
            <div>
              <label style={LABEL}>{mode === 'adjustment' ? 'Quantité (négatif pour retirer)' : 'Quantité'} *</label>
              <input type="number" value={quantity} onChange={e => setQuantity(e.target.value)} style={INPUT} autoFocus />
            </div>
          )}
          {mode === 'adjustment' && (
            <div>
              <label style={LABEL}>Type de perte (optionnel)</label>
              <select value={lossType} onChange={e => setLossType(e.target.value as typeof lossType)} style={{ ...INPUT, cursor: 'pointer' }}>
                <option value="">Ajustement standard</option>
                <option value="PERTE">Perte</option>
                <option value="CASSE">Casse</option>
                <option value="PEREMPTION">Péremption</option>
              </select>
            </div>
          )}
          {mode === 'exit' && (
            <div>
              <label style={LABEL}>Destination</label>
              <input value={destination} onChange={e => setDestination(e.target.value)} style={INPUT} />
            </div>
          )}
          {mode === 'transfer' && (
            <div>
              <label style={LABEL}>Nouvel emplacement *</label>
              <input value={destination} onChange={e => setDestination(e.target.value)} style={INPUT} autoFocus />
            </div>
          )}
          <div>
            <label style={LABEL}>{mode === 'adjustment' ? 'Motif *' : 'Motif (optionnel)'}</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} style={{ ...INPUT, resize: 'none' }} />
          </div>
          {mode !== 'transfer' && (
            <div className="rounded-lg px-3 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
              <p style={{ fontSize: 12, color: '#6B7280' }}>Avant : {item.currentQuantity} {STOCK_UNIT_LABELS[item.unit]}</p>
              <p style={{ fontSize: 12, color: '#6B7280' }}>Après (estimé) : {isNaN(willBeAfter) ? '—' : willBeAfter} {STOCK_UNIT_LABELS[item.unit]}</p>
              {requiresValidationHint && (
                <p style={{ fontSize: 12, color: '#D97706', fontWeight: 600, marginTop: 4 }}>
                  ⚠ Cette opération nécessitera probablement une validation du superviseur.
                </p>
              )}
            </div>
          )}
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSubmit} onClick={handleSubmit} className="flex-1 py-2.5 rounded-lg"
            style={{ background: canSubmit ? '#3E5A78' : '#E5E7EB', color: canSubmit ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
            {submitting ? 'Envoi…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Validation decision modal (approve / reject / request-changes) ───────────

type DecisionAction = 'approve' | 'reject' | 'request-changes';

const DECISION_CFG: Record<DecisionAction, { title: string; commentRequired: boolean; confirmLabel: string; confirmColor: string }> = {
  approve:           { title: 'Approuver la demande',        commentRequired: false, confirmLabel: 'Approuver',              confirmColor: '#065F46' },
  reject:            { title: 'Refuser la demande',          commentRequired: true,  confirmLabel: 'Refuser',                confirmColor: '#B91C1C' },
  'request-changes': { title: 'Demander des modifications',  commentRequired: true,  confirmLabel: 'Demander des modifications', confirmColor: '#D97706' },
};

function ValidationDecisionModal({ action, onConfirm, onClose }: {
  action: DecisionAction;
  onConfirm: (comment: string) => void;
  onClose: () => void;
}) {
  const [comment, setComment] = useState('');
  const cfg = DECISION_CFG[action];
  const canConfirm = !cfg.commentRequired || comment.trim().length > 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{cfg.title}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5">
          <label style={LABEL}>Commentaire {cfg.commentRequired ? '*' : '(optionnel)'}</label>
          <textarea value={comment} onChange={e => setComment(e.target.value)}
            rows={3} placeholder="Expliquez votre décision…" style={{ ...INPUT, resize: 'none' }} autoFocus />
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canConfirm} onClick={() => canConfirm && onConfirm(comment.trim())} className="flex-1 py-2.5 rounded-lg"
            style={{ background: canConfirm ? cfg.confirmColor : '#E5E7EB', color: canConfirm ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canConfirm ? 'pointer' : 'not-allowed' }}>
            {cfg.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Stock item detail modal ────────────────────────────────────────────────

function StockItemDetailModal({ itemId, isDirector, isSupervisor, onClose, onEdit, onChanged }: {
  itemId: string;
  isDirector: boolean;
  isSupervisor: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ApiStockItemDetail | null>(null);
  const [history, setHistory] = useState<ApiValidationRequest[]>([]);
  const [movements, setMovements] = useState<ApiStockMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [movementMode, setMovementMode] = useState<MovementMode | null>(null);
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);

  const load = () => Promise.all([
    stockItemsApi.get(itemId),
    stockItemsApi.history(itemId),
    stockItemsApi.movements(itemId),
  ]).then(([d, h, m]) => { setDetail(d); setHistory(h); setMovements(m); })
    .catch(() => toast.error("Erreur lors du chargement de l'article."));

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await stockItemsApi.uploadDocument(itemId, file);
      await load();
      toast.success('Document ajouté.');
    } catch {
      toast.error("Erreur lors de l'envoi du document.");
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async (documentId: string) => {
    try {
      const { url } = await stockItemsApi.getDocumentUrl(itemId, documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le document.");
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await stockItemsApi.deleteDocument(itemId, documentId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  const handleArchive = async () => {
    if (!window.confirm('Archiver cet article ?')) return;
    try {
      const result = await stockItemsApi.archive(itemId);
      if (result.validationStatus === 'PENDING_VALIDATION') {
        toast.success('Stock restant : demande d\'archivage envoyée pour validation.');
      } else {
        toast.success('Article archivé.');
      }
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'archivage.");
    }
  };

  const handleMovement = async (payload: Record<string, unknown>) => {
    if (!movementMode) return;
    try {
      if (movementMode === 'entry') await stockItemsApi.createEntry(itemId, payload as never);
      if (movementMode === 'exit') await stockItemsApi.createExit(itemId, payload as never);
      if (movementMode === 'adjustment') await stockItemsApi.createAdjustment(itemId, payload as never);
      if (movementMode === 'transfer') await stockItemsApi.createTransfer(itemId, payload as never);
      toast.success('Mouvement enregistré.');
      setMovementMode(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement du mouvement.");
    }
  };

  const handleDecision = async (comment: string) => {
    if (!decisionAction) return;
    try {
      if (decisionAction === 'approve') await stockItemsApi.approve(itemId, comment || undefined);
      if (decisionAction === 'reject') await stockItemsApi.reject(itemId, comment);
      if (decisionAction === 'request-changes') await stockItemsApi.requestChanges(itemId, comment);
      toast.success('Décision enregistrée.');
      setDecisionAction(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement de la décision.");
    }
  };

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="rounded-2xl flex items-center justify-center" style={{ background: '#FFFFFF', width: 400, height: 300 }}>
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
        </div>
      </div>
    );
  }

  const isPendingValidation = detail.validationStatus === 'PENDING_VALIDATION';
  const badges = stockAlertBadges(detail);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>
                  {STOCK_CATEGORY_LABELS[detail.category].toUpperCase()}
                </span>
                {!detail.isActive && (
                  <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#9CA3AF', fontSize: 10, fontWeight: 700 }}>ARCHIVÉ</span>
                )}
                {detail.validationStatus && (
                  <span className="px-2 py-0.5 rounded-full"
                    style={{ background: VALIDATION_STATUS_STYLE[detail.validationStatus].bg, color: VALIDATION_STATUS_STYLE[detail.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                    {VALIDATION_STATUS_LABELS[detail.validationStatus].toUpperCase()}
                  </span>
                )}
                {badges.map(b => (
                  <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label.toUpperCase()}</span>
                ))}
              </div>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{detail.name}</h3>
              <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                {detail.currentQuantity} {STOCK_UNIT_LABELS[detail.unit]}
                {detail.storageLocation && ` · ${detail.storageLocation}`}
              </p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0">
              <X size={18} style={{ color: '#9CA3AF' }} />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <p style={SECTION_TITLE}>INFORMATIONS GÉNÉRALES</p>
              <p style={{ color: '#374151', fontSize: 13, lineHeight: 1.6 }}>{detail.description || '—'}</p>
              {detail.reference && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>Référence : {detail.reference}</p>}
              {detail.supplierName && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Fournisseur : {detail.supplierName}</p>}
              {detail.unitCost != null && (
                <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>
                  Coût unitaire : {formatXof(detail.unitCost)} · Valeur en stock : {detail.inventoryValue != null ? formatXof(detail.inventoryValue) : '—'}
                </p>
              )}
              {detail.createdBy && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>Créé par {detail.createdBy.name}</p>}
              {detail.notes && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>{detail.notes}</p>}
            </div>

            <div>
              <p style={SECTION_TITLE}>SEUILS ET EXPIRATION</p>
              <p style={{ color: '#6B7280', fontSize: 12 }}>Seuil minimum : {detail.minimumQuantity ?? '—'}</p>
              <p style={{ color: '#6B7280', fontSize: 12 }}>Seuil maximum : {detail.maximumQuantity ?? '—'}</p>
              {detail.expirationDate && <p style={{ color: '#6B7280', fontSize: 12 }}>Expiration : {new Date(detail.expirationDate).toLocaleDateString('fr-FR')}</p>}
              {detail.batchNumber && <p style={{ color: '#6B7280', fontSize: 12 }}>Lot : {detail.batchNumber}</p>}
            </div>

            <div>
              <p style={SECTION_TITLE}>VALIDATION</p>
              {detail.pendingValidationAction && (
                <p style={{ color: '#D97706', fontSize: 12, marginBottom: 8 }}>
                  Action demandée : {PENDING_STOCK_ACTION_LABELS[detail.pendingValidationAction] ?? detail.pendingValidationAction}
                </p>
              )}
              {history.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune validation en cours pour cet article.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="rounded-xl px-4 py-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[h.status].bg, color: VALIDATION_STATUS_STYLE[h.status].color, fontSize: 10, fontWeight: 700 }}>
                          {VALIDATION_STATUS_LABELS[h.status].toUpperCase()}
                        </span>
                        <span style={{ color: '#9CA3AF', fontSize: 11 }}>{new Date(h.reviewedAt ?? h.submittedAt).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <p style={{ color: '#374151', fontSize: 12 }}>
                        Soumis par {h.submittedBy.name}{h.reviewedBy && ` · Examiné par ${h.reviewedBy.name}`}
                      </p>
                      {h.comment && <p style={{ color: '#1A1A1A', fontSize: 13, marginTop: 4 }}>{h.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p style={SECTION_TITLE}>HISTORIQUE DES MOUVEMENTS</p>
              {movements.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucun mouvement enregistré.</p>
              ) : (
                <div className="space-y-2">
                  {movements.slice(0, 10).map(m => (
                    <div key={m.id} className="flex items-center justify-between rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-full" style={{ background: STOCK_MOVEMENT_TYPE_STYLE[m.type].bg, color: STOCK_MOVEMENT_TYPE_STYLE[m.type].color, fontSize: 10, fontWeight: 700 }}>
                          {STOCK_MOVEMENT_TYPE_LABELS[m.type]}
                        </span>
                        <span style={{ fontSize: 12, color: '#374151' }}>{m.quantity} {STOCK_UNIT_LABELS[detail.unit]}</span>
                      </div>
                      <span style={{ fontSize: 11, color: '#9CA3AF' }}>{new Date(m.movementDate).toLocaleDateString('fr-FR')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p style={SECTION_TITLE}>DOCUMENTS</p>
              {detail.documents.length > 0 && (
                <div className="space-y-2 mb-3">
                  {detail.documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <Paperclip size={13} style={{ color: '#6B7280', flexShrink: 0 }} />
                      <p className="flex-1 min-w-0" style={{ color: '#374151', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.label || 'Document'}</p>
                      <button onClick={() => handleViewDocument(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', flexShrink: 0 }}><Eye size={14} /></button>
                      {isDirector && <button onClick={() => handleDeleteDocument(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}><Trash2 size={14} /></button>}
                    </div>
                  ))}
                </div>
              )}
              {isDirector && (
                <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer" style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                  <Upload size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>{uploading ? 'Envoi en cours…' : 'Ajouter un document…'}</span>
                  <input type="file" className="hidden" disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                </label>
              )}
            </div>
          </div>

          {isDirector && detail.isActive && (
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                <Pencil size={13} /> Modifier
              </button>
              {isPendingValidation ? (
                <span className="px-3 py-2 rounded-lg" style={{ background: '#FFFBEB', color: '#D97706', fontSize: 13, fontWeight: 600 }}>En attente de validation</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setMovementMode('entry')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#065F46', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><ArrowDownCircle size={13} /> Entrée</button>
                  <button onClick={() => setMovementMode('exit')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#3E5A78', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><ArrowUpCircle size={13} /> Sortie</button>
                  <button onClick={() => setMovementMode('adjustment')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#D97706', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><RefreshCw size={13} /> Ajustement</button>
                  <button onClick={() => setMovementMode('transfer')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#7C3AED', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><UserCog size={13} /> Transférer</button>
                  <button onClick={handleArchive} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><Archive size={13} /> Archiver</button>
                </div>
              )}
            </div>
          )}
          {isSupervisor && isPendingValidation && (
            <div className="px-6 py-4 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={() => setDecisionAction('approve')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}><ShieldCheck size={13} /> Approuver</button>
              <button onClick={() => setDecisionAction('reject')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><ShieldAlert size={13} /> Refuser</button>
              <button onClick={() => setDecisionAction('request-changes')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#D97706', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><MessageSquareWarning size={13} /> Demander des modifications</button>
            </div>
          )}
        </div>
      </div>
      {movementMode && <MovementModal mode={movementMode} item={detail} onSubmit={handleMovement} onClose={() => setMovementMode(null)} />}
      {decisionAction && <ValidationDecisionModal action={decisionAction} onConfirm={handleDecision} onClose={() => setDecisionAction(null)} />}
    </>
  );
}

// ─── Create / edit asset modal ───────────────────────────────────────────────

function AssetModal({ initial, onSave, onClose }: {
  initial?: ApiInventoryAsset;
  onSave: (data: CreateInventoryAssetInput) => void;
  onClose: () => void;
}) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    assetCode: initial?.assetCode ?? '',
    serialNumber: initial?.serialNumber ?? '',
    category: initial?.category ?? ('EQUIPEMENT' as ApiStockCategory),
    brand: initial?.brand ?? '',
    model: initial?.model ?? '',
    acquisitionDate: initial?.acquisitionDate?.slice(0, 10) ?? '',
    acquisitionCost: initial?.acquisitionCost != null ? String(initial.acquisitionCost) : '',
    fundingSource: initial?.fundingSource ?? '',
    donorName: initial?.donorName ?? '',
    warrantyEndDate: initial?.warrantyEndDate?.slice(0, 10) ?? '',
    condition: initial?.condition ?? 'BON',
    nextInventoryDate: initial?.nextInventoryDate?.slice(0, 10) ?? '',
    notes: initial?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  const dateError = form.acquisitionDate && form.warrantyEndDate && form.warrantyEndDate < form.acquisitionDate
    ? "La date de fin de garantie ne peut pas précéder la date d'acquisition."
    : null;

  const canSave = form.name.trim().length > 0 && !dateError && !saving;

  const handleSave = () => {
    if (!canSave) return;
    setSaving(true);
    onSave({
      name: form.name.trim(),
      assetCode: form.assetCode.trim() || undefined,
      serialNumber: form.serialNumber.trim() || undefined,
      category: form.category,
      brand: form.brand.trim() || undefined,
      model: form.model.trim() || undefined,
      acquisitionDate: form.acquisitionDate || undefined,
      acquisitionCost: form.acquisitionCost ? parseInt(form.acquisitionCost, 10) : undefined,
      fundingSource: form.fundingSource.trim() || undefined,
      donorName: form.donorName.trim() || undefined,
      warrantyEndDate: form.warrantyEndDate || undefined,
      condition: form.condition as CreateInventoryAssetInput['condition'],
      nextInventoryDate: form.nextInventoryDate || undefined,
      notes: form.notes.trim() || undefined,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '92vh' }}>
        <div className="flex items-center justify-between px-6 py-5 flex-shrink-0" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{isEdit ? 'Modifier le bien' : 'Nouveau bien'}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          <div>
            <label style={LABEL}>Bien *</label>
            <input value={form.name} onChange={e => set('name', e.target.value)} placeholder="Ex : Ordinateur portable" style={INPUT} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Catégorie</label>
              <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {STOCK_CATEGORY_OPTIONS.map(c => <option key={c} value={c}>{STOCK_CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div>
              <label style={LABEL}>État</label>
              <select value={form.condition} onChange={e => set('condition', e.target.value)} style={{ ...INPUT, cursor: 'pointer' }}>
                {ASSET_CONDITION_OPTIONS.map(c => <option key={c} value={c}>{ASSET_CONDITION_LABELS[c]}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Code du bien</label>
              <input value={form.assetCode} onChange={e => set('assetCode', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Numéro de série</label>
              <input value={form.serialNumber} onChange={e => set('serialNumber', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Marque</label>
              <input value={form.brand} onChange={e => set('brand', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Modèle</label>
              <input value={form.model} onChange={e => set('model', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Date d'acquisition</label>
              <input type="date" value={form.acquisitionDate} onChange={e => set('acquisitionDate', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Coût d'acquisition (FCFA)</label>
              <input type="number" min={0} value={form.acquisitionCost} onChange={e => set('acquisitionCost', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Source de financement</label>
              <input value={form.fundingSource} onChange={e => set('fundingSource', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Donateur</label>
              <input value={form.donorName} onChange={e => set('donorName', e.target.value)} style={INPUT} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label style={LABEL}>Fin de garantie</label>
              <input type="date" value={form.warrantyEndDate} onChange={e => set('warrantyEndDate', e.target.value)} style={INPUT} />
            </div>
            <div>
              <label style={LABEL}>Prochain inventaire</label>
              <input type="date" value={form.nextInventoryDate} onChange={e => set('nextInventoryDate', e.target.value)} style={INPUT} />
            </div>
          </div>
          {dateError && <p style={{ color: '#B91C1C', fontSize: 11 }}>{dateError}</p>}
          <div>
            <label style={LABEL}>Notes</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4 flex-shrink-0" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSave} onClick={handleSave} className="flex-1 py-2.5 rounded-lg"
            style={{ background: canSave ? '#3E5A78' : '#E5E7EB', color: canSave ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            {saving ? 'Enregistrement…' : isEdit ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Asset action modal (assign / transfer / disposal / archive) ───────────

type AssetActionMode = 'assign' | 'transfer' | 'disposal' | 'archive';

function AssetActionModal({ mode, onSubmit, onClose }: {
  mode: AssetActionMode;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
  onClose: () => void;
}) {
  const [assignedTo, setAssignedTo] = useState('');
  const [reason, setReason] = useState('');
  const [disposalType, setDisposalType] = useState<ApiAssetDisposalType>('REFORME');
  const [submitting, setSubmitting] = useState(false);

  const titles: Record<AssetActionMode, string> = {
    assign: 'Affecter le bien',
    transfer: 'Transférer le bien',
    disposal: 'Signaler perte / casse / vol / réforme',
    archive: 'Demander l\'archivage',
  };

  const canSubmit = mode === 'assign' ? assignedTo.trim().length > 0
    : mode === 'disposal' ? reason.trim().length > 0
    : true;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    try {
      if (mode === 'assign') await onSubmit({ assignedTo: assignedTo.trim() });
      if (mode === 'transfer') await onSubmit({ assignedTo: assignedTo.trim() || undefined, reason: reason || undefined, comment: reason || undefined });
      if (mode === 'disposal') await onSubmit({ disposalType, reason: reason.trim() });
      if (mode === 'archive') await onSubmit({ comment: reason || undefined });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="w-full max-w-sm rounded-2xl overflow-hidden shadow-xl" style={{ background: '#FFFFFF' }}>
        <div className="flex items-center justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
          <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{titles[mode]}</h3>
          <button onClick={onClose}><X size={18} style={{ color: '#9CA3AF' }} /></button>
        </div>
        <div className="px-6 py-5 space-y-3">
          {(mode === 'assign' || mode === 'transfer') && (
            <div>
              <label style={LABEL}>{mode === 'assign' ? 'Affecté à *' : 'Nouvelle affectation'}</label>
              <input value={assignedTo} onChange={e => setAssignedTo(e.target.value)} style={INPUT} autoFocus />
            </div>
          )}
          {mode === 'disposal' && (
            <div>
              <label style={LABEL}>Type *</label>
              <select value={disposalType} onChange={e => setDisposalType(e.target.value as ApiAssetDisposalType)} style={{ ...INPUT, cursor: 'pointer' }}>
                {ASSET_DISPOSAL_TYPE_OPTIONS.map(t => <option key={t} value={t}>{ASSET_DISPOSAL_TYPE_LABELS[t]}</option>)}
              </select>
            </div>
          )}
          <div>
            <label style={LABEL}>{mode === 'disposal' ? 'Motif *' : 'Commentaire (optionnel)'}</label>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} style={{ ...INPUT, resize: 'none' }} />
          </div>
        </div>
        <div className="flex gap-2 px-6 py-4" style={{ borderTop: '1px solid #F3F4F6' }}>
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg"
            style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
            Annuler
          </button>
          <button disabled={!canSubmit || submitting} onClick={handleSubmit} className="flex-1 py-2.5 rounded-lg"
            style={{ background: canSubmit ? '#3E5A78' : '#E5E7EB', color: canSubmit ? '#FFFFFF' : '#9CA3AF', fontSize: 13, fontWeight: 600, border: 'none', cursor: canSubmit ? 'pointer' : 'not-allowed' }}>
            {submitting ? 'Envoi…' : 'Confirmer'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Asset detail modal ──────────────────────────────────────────────────────

function AssetDetailModal({ assetId, isDirector, isSupervisor, onClose, onEdit, onChanged }: {
  assetId: string;
  isDirector: boolean;
  isSupervisor: boolean;
  onClose: () => void;
  onEdit: () => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = useState<ApiInventoryAssetDetail | null>(null);
  const [history, setHistory] = useState<ApiValidationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [actionMode, setActionMode] = useState<AssetActionMode | null>(null);
  const [decisionAction, setDecisionAction] = useState<DecisionAction | null>(null);

  const load = () => Promise.all([
    inventoryAssetsApi.get(assetId),
    inventoryAssetsApi.history(assetId),
  ]).then(([d, h]) => { setDetail(d); setHistory(h); })
    .catch(() => toast.error('Erreur lors du chargement du bien.'));

  useEffect(() => {
    load().finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetId]);

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      await inventoryAssetsApi.uploadDocument(assetId, file);
      await load();
      toast.success('Document ajouté.');
    } catch {
      toast.error("Erreur lors de l'envoi du document.");
    } finally {
      setUploading(false);
    }
  };

  const handleViewDocument = async (documentId: string) => {
    try {
      const { url } = await inventoryAssetsApi.getDocumentUrl(assetId, documentId);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch {
      toast.error("Impossible d'ouvrir le document.");
    }
  };

  const handleDeleteDocument = async (documentId: string) => {
    if (!window.confirm('Supprimer ce document ?')) return;
    try {
      await inventoryAssetsApi.deleteDocument(assetId, documentId);
      await load();
    } catch {
      toast.error('Erreur lors de la suppression.');
    }
  };

  const handleAction = async (payload: Record<string, unknown>) => {
    if (!actionMode) return;
    try {
      if (actionMode === 'assign') await inventoryAssetsApi.assign(assetId, payload.assignedTo as string);
      if (actionMode === 'transfer') await inventoryAssetsApi.transfer(assetId, payload);
      if (actionMode === 'disposal') await inventoryAssetsApi.requestDisposal(assetId, payload.disposalType as ApiAssetDisposalType, payload.reason as string);
      if (actionMode === 'archive') await inventoryAssetsApi.requestArchive(assetId, payload.comment as string | undefined);
      toast.success('Opération enregistrée.');
      setActionMode(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'opération.");
    }
  };

  const handleDecision = async (comment: string) => {
    if (!decisionAction) return;
    try {
      if (decisionAction === 'approve') await inventoryAssetsApi.approve(assetId, comment || undefined);
      if (decisionAction === 'reject') await inventoryAssetsApi.reject(assetId, comment);
      if (decisionAction === 'request-changes') await inventoryAssetsApi.requestChanges(assetId, comment);
      toast.success('Décision enregistrée.');
      setDecisionAction(null);
      await load();
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de l'enregistrement de la décision.");
    }
  };

  if (loading || !detail) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.45)' }}>
        <div className="rounded-2xl flex items-center justify-center" style={{ background: '#FFFFFF', width: 400, height: 300 }}>
          <p style={{ color: '#9CA3AF', fontSize: 13 }}>Chargement…</p>
        </div>
      </div>
    );
  }

  const isPendingValidation = detail.validationStatus === 'PENDING_VALIDATION';
  const isArchived = detail.status === 'ARCHIVE';
  const badges = assetAlertBadges(detail);
  const statusStyle = ASSET_STATUS_STYLE[detail.status];

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.45)' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="w-full max-w-lg rounded-2xl overflow-hidden shadow-xl flex flex-col" style={{ background: '#FFFFFF', maxHeight: '90vh' }}>
          <div className="flex items-start justify-between px-6 py-5" style={{ borderBottom: '1px solid #F3F4F6' }}>
            <div className="flex-1 min-w-0 pr-3">
              <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>{STOCK_CATEGORY_LABELS[detail.category].toUpperCase()}</span>
                <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>{ASSET_STATUS_LABELS[detail.status].toUpperCase()}</span>
                {detail.validationStatus && (
                  <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[detail.validationStatus].bg, color: VALIDATION_STATUS_STYLE[detail.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                    {VALIDATION_STATUS_LABELS[detail.validationStatus].toUpperCase()}
                  </span>
                )}
                {badges.map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label.toUpperCase()}</span>)}
              </div>
              <h3 style={{ color: '#1A1A1A', fontSize: 16, fontWeight: 700 }}>{detail.name}</h3>
              <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>{[detail.brand, detail.model].filter(Boolean).join(' · ') || ASSET_CONDITION_LABELS[detail.condition]}</p>
            </div>
            <button onClick={onClose} className="p-1 rounded-md hover:bg-gray-100 flex-shrink-0"><X size={18} style={{ color: '#9CA3AF' }} /></button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            <div>
              <p style={SECTION_TITLE}>IDENTIFICATION</p>
              {detail.assetCode && <p style={{ color: '#6B7280', fontSize: 12 }}>Code : {detail.assetCode}</p>}
              {detail.serialNumber && <p style={{ color: '#6B7280', fontSize: 12 }}>N° de série : {detail.serialNumber}</p>}
              <p style={{ color: '#6B7280', fontSize: 12 }}>État : {ASSET_CONDITION_LABELS[detail.condition]}</p>
              {detail.assignedTo && <p style={{ color: '#6B7280', fontSize: 12 }}>Affecté à : {detail.assignedTo}</p>}
              {detail.space && <p style={{ color: '#6B7280', fontSize: 12 }}>Emplacement : {detail.space.name}</p>}
            </div>
            <div>
              <p style={SECTION_TITLE}>ACQUISITION ET GARANTIE</p>
              {detail.acquisitionDate && <p style={{ color: '#6B7280', fontSize: 12 }}>Acquis le : {new Date(detail.acquisitionDate).toLocaleDateString('fr-FR')}</p>}
              {detail.acquisitionCost != null && <p style={{ color: '#6B7280', fontSize: 12 }}>Coût : {formatXof(detail.acquisitionCost)}</p>}
              {detail.donorName && <p style={{ color: '#6B7280', fontSize: 12 }}>Donateur : {detail.donorName}</p>}
              {detail.warrantyEndDate && <p style={{ color: '#6B7280', fontSize: 12 }}>Garantie jusqu'au : {new Date(detail.warrantyEndDate).toLocaleDateString('fr-FR')}</p>}
              {detail.nextInventoryDate && <p style={{ color: '#6B7280', fontSize: 12 }}>Prochain inventaire : {new Date(detail.nextInventoryDate).toLocaleDateString('fr-FR')}</p>}
              {detail.notes && <p style={{ color: '#6B7280', fontSize: 12, marginTop: 4 }}>{detail.notes}</p>}
            </div>
            <div>
              <p style={SECTION_TITLE}>VALIDATION</p>
              {detail.pendingValidationAction && (
                <p style={{ color: '#D97706', fontSize: 12, marginBottom: 8 }}>
                  Action demandée : {PENDING_ASSET_ACTION_LABELS[detail.pendingValidationAction] ?? detail.pendingValidationAction}
                </p>
              )}
              {history.length === 0 ? (
                <p style={{ color: '#9CA3AF', fontSize: 13 }}>Aucune validation en cours pour ce bien.</p>
              ) : (
                <div className="space-y-2">
                  {history.map(h => (
                    <div key={h.id} className="rounded-xl px-4 py-3" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[h.status].bg, color: VALIDATION_STATUS_STYLE[h.status].color, fontSize: 10, fontWeight: 700 }}>
                          {VALIDATION_STATUS_LABELS[h.status].toUpperCase()}
                        </span>
                        <span style={{ color: '#9CA3AF', fontSize: 11 }}>{new Date(h.reviewedAt ?? h.submittedAt).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <p style={{ color: '#374151', fontSize: 12 }}>Soumis par {h.submittedBy.name}{h.reviewedBy && ` · Examiné par ${h.reviewedBy.name}`}</p>
                      {h.comment && <p style={{ color: '#1A1A1A', fontSize: 13, marginTop: 4 }}>{h.comment}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <p style={SECTION_TITLE}>DOCUMENTS</p>
              {detail.documents.length > 0 && (
                <div className="space-y-2 mb-3">
                  {detail.documents.map(doc => (
                    <div key={doc.id} className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5" style={{ background: '#F9F7F3', border: '1px solid #E5E7EB' }}>
                      <Paperclip size={13} style={{ color: '#6B7280', flexShrink: 0 }} />
                      <p className="flex-1 min-w-0" style={{ color: '#374151', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.label || 'Document'}</p>
                      <button onClick={() => handleViewDocument(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3E5A78', flexShrink: 0 }}><Eye size={14} /></button>
                      {isDirector && <button onClick={() => handleDeleteDocument(doc.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#B91C1C', flexShrink: 0 }}><Trash2 size={14} /></button>}
                    </div>
                  ))}
                </div>
              )}
              {isDirector && (
                <label className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer" style={{ border: '1px solid #E5E7EB', background: '#FAFAFA' }}>
                  <Upload size={14} style={{ color: '#9CA3AF', flexShrink: 0 }} />
                  <span style={{ flex: 1, color: '#6B7280', fontSize: 13 }}>{uploading ? 'Envoi en cours…' : 'Ajouter un document…'}</span>
                  <input type="file" className="hidden" disabled={uploading} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }} />
                </label>
              )}
            </div>
          </div>

          {isDirector && !isArchived && (
            <div className="px-6 py-4 flex flex-wrap items-center justify-between gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={onEdit} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#374151', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><Pencil size={13} /> Modifier</button>
              {isPendingValidation ? (
                <span className="px-3 py-2 rounded-lg" style={{ background: '#FFFBEB', color: '#D97706', fontSize: 13, fontWeight: 600 }}>En attente de validation</span>
              ) : (
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => setActionMode('assign')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#3E5A78', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><UserCog size={13} /> Affecter</button>
                  <button onClick={() => setActionMode('transfer')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#7C3AED', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><RefreshCw size={13} /> Transférer</button>
                  <button onClick={() => setActionMode('disposal')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><AlertTriangle size={13} /> Perte / casse / vol</button>
                  <button onClick={() => setActionMode('archive')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#6B7280', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><Archive size={13} /> Demander l'archivage</button>
                </div>
              )}
            </div>
          )}
          {isSupervisor && isPendingValidation && (
            <div className="px-6 py-4 flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid #F3F4F6', background: '#F9F7F3' }}>
              <button onClick={() => setDecisionAction('approve')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#065F46', color: '#FFFFFF', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer' }}><ShieldCheck size={13} /> Approuver</button>
              <button onClick={() => setDecisionAction('reject')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #FECACA', color: '#B91C1C', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><ShieldAlert size={13} /> Refuser</button>
              <button onClick={() => setDecisionAction('request-changes')} className="flex items-center gap-1.5 px-3 py-2 rounded-lg"
                style={{ background: '#FFFFFF', border: '1px solid #E5E7EB', color: '#D97706', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}><MessageSquareWarning size={13} /> Demander des modifications</button>
            </div>
          )}
        </div>
      </div>
      {actionMode && <AssetActionModal mode={actionMode} onSubmit={handleAction} onClose={() => setActionMode(null)} />}
      {decisionAction && <ValidationDecisionModal action={decisionAction} onConfirm={handleDecision} onClose={() => setDecisionAction(null)} />}
    </>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────

type MainTab = 'stocks' | 'mouvements' | 'inventaire' | 'alertes';

export function StocksInventairePage() {
  const { user } = useAuth();
  const isDirector = user?.role === 'director';
  const isSupervisor = user?.role === 'supervisor';

  const [tab, setTab] = useState<MainTab>('stocks');

  const [items, setItems] = useState<ApiStockItem[]>([]);
  const [assets, setAssets] = useState<ApiInventoryAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const [search, setSearch] = useState('');
  const [showCreateItem, setShowCreateItem] = useState(false);
  const [editItem, setEditItem] = useState<ApiStockItem | null>(null);
  const [detailItemId, setDetailItemId] = useState<string | null>(null);

  const [showCreateAsset, setShowCreateAsset] = useState(false);
  const [editAsset, setEditAsset] = useState<ApiInventoryAsset | null>(null);
  const [detailAssetId, setDetailAssetId] = useState<string | null>(null);

  const [movementItemId, setMovementItemId] = useState<string>('');
  const [selectedMovements, setSelectedMovements] = useState<ApiStockMovement[]>([]);
  const [movementsLoading, setMovementsLoading] = useState(false);

  const loadAll = () => Promise.all([stockItemsApi.list(), inventoryAssetsApi.list()])
    .then(([i, a]) => { setItems(i); setAssets(a); setError(false); })
    .catch(() => { setError(true); toast.error('Erreur de chargement des stocks et inventaire.'); });

  useEffect(() => {
    loadAll().finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'mouvements' || !movementItemId) { setSelectedMovements([]); return; }
    setMovementsLoading(true);
    stockItemsApi.movements(movementItemId)
      .then(setSelectedMovements)
      .catch(() => toast.error('Erreur de chargement des mouvements.'))
      .finally(() => setMovementsLoading(false));
  }, [tab, movementItemId]);

  const counters = {
    active: items.filter(i => i.isActive).length,
    lowStock: items.filter(i => i.isLowStock).length,
    outOfStock: items.filter(i => i.isOutOfStock).length,
    expiringSoon: items.filter(i => i.isExpiringSoon).length,
    expired: items.filter(i => i.isExpired).length,
    pendingValidation: items.filter(i => i.validationStatus === 'PENDING_VALIDATION').length
      + assets.filter(a => a.validationStatus === 'PENDING_VALIDATION').length,
    maintenance: assets.filter(a => a.status === 'EN_MAINTENANCE').length,
    inventoryDue: assets.filter(a => a.isInventoryCheckDue || a.isInventoryCheckOverdue).length,
  };

  const visibleItems = items.filter(i => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!i.name.toLowerCase().includes(q) && !(i.reference ?? '').toLowerCase().includes(q)
        && !(i.storageLocation ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const visibleAssets = assets.filter(a => {
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      if (!a.name.toLowerCase().includes(q) && !(a.assetCode ?? '').toLowerCase().includes(q)
        && !(a.serialNumber ?? '').toLowerCase().includes(q) && !(a.brand ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const alertItems = items.filter(i => i.isActive && (i.isOutOfStock || i.isLowStock || i.isExpired || i.isExpiringSoon));
  const alertAssets = assets.filter(a => a.status !== 'ARCHIVE' && (a.isInventoryCheckOverdue || a.isInventoryCheckDue || a.isWarrantyExpiringSoon));

  const handleCreateItem = async (data: CreateStockItemInput) => {
    try {
      const created = await stockItemsApi.create(data);
      setItems(prev => [created, ...prev]);
      setShowCreateItem(false);
      toast.success('Article créé.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la création de l'article.");
    }
  };

  const handleUpdateItem = async (data: CreateStockItemInput) => {
    if (!editItem) return;
    try {
      const updated = await stockItemsApi.update(editItem.id, data);
      setItems(prev => prev.map(i => i.id === updated.id ? updated : i));
      setEditItem(null);
      toast.success('Article modifié.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur lors de la modification de l'article.");
    }
  };

  const handleCreateAsset = async (data: CreateInventoryAssetInput) => {
    try {
      const created = await inventoryAssetsApi.create(data);
      setAssets(prev => [created, ...prev]);
      setShowCreateAsset(false);
      toast.success('Bien créé.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la création du bien.');
    }
  };

  const handleUpdateAsset = async (data: CreateInventoryAssetInput) => {
    if (!editAsset) return;
    try {
      const updated = await inventoryAssetsApi.update(editAsset.id, data);
      setAssets(prev => prev.map(a => a.id === updated.id ? updated : a));
      setEditAsset(null);
      toast.success('Bien modifié.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Erreur lors de la modification du bien.');
    }
  };

  const TABS: { key: MainTab; label: string; icon: React.ElementType }[] = [
    { key: 'stocks',     label: 'Stocks',      icon: Package },
    { key: 'mouvements', label: 'Mouvements',  icon: ClipboardList },
    { key: 'inventaire', label: 'Inventaire',  icon: Boxes },
    { key: 'alertes',    label: 'Alertes',     icon: AlertTriangle },
  ];

  return (
    <div className="px-4 md:px-6 py-6 space-y-5" style={{ maxWidth: 1100 }}>
      <div>
        <h2 style={{ color: '#1A1A1A', fontSize: 22, fontWeight: 700 }}>Stocks et inventaire</h2>
        <p style={{ color: '#6B7280', fontSize: 13, marginTop: 2 }}>
          Consommables, fournitures, mobilier et équipements de l'orphelinat.
        </p>
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {[
          { label: 'Articles actifs',        value: counters.active,            color: '#3E5A78', bg: '#EEF2F7', icon: Package },
          { label: 'Stock faible',           value: counters.lowStock,          color: '#D97706', bg: '#FFFBEB', icon: AlertTriangle },
          { label: 'Ruptures',               value: counters.outOfStock,        color: '#B91C1C', bg: '#FEF2F2', icon: AlertTriangle },
          { label: 'Expirent bientôt',       value: counters.expiringSoon,      color: '#D97706', bg: '#FFFBEB', icon: Clock },
          { label: 'Expirés',                value: counters.expired,           color: '#B91C1C', bg: '#FEF2F2', icon: AlertTriangle },
          { label: 'En attente de validation', value: counters.pendingValidation, color: '#7C3AED', bg: '#F5F3FF', icon: Send },
          { label: 'Biens en maintenance',   value: counters.maintenance,       color: '#D97706', bg: '#FFFBEB', icon: Wrench },
          { label: 'Inventaires en retard',  value: counters.inventoryDue,      color: '#B91C1C', bg: '#FEF2F2', icon: ClipboardList },
        ].map(kpi => (
          <div key={kpi.label} className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
            <div className="flex items-center justify-center rounded-lg mb-2" style={{ width: 32, height: 32, background: kpi.bg }}>
              <kpi.icon size={16} style={{ color: kpi.color }} />
            </div>
            <p style={{ color: '#1A1A1A', fontSize: 20, fontWeight: 700 }}>{kpi.value}</p>
            <p style={{ color: '#6B7280', fontSize: 12, marginTop: 2 }}>{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{
              background: tab === key ? '#3E5A78' : '#FFFFFF',
              color: tab === key ? '#FFFFFF' : '#374151',
              fontSize: 13, fontWeight: 500,
              border: `1px solid ${tab === key ? 'transparent' : '#E5E7EB'}`,
              cursor: 'pointer',
            }}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Chargement…</p>
      ) : error ? (
        <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #FECACA' }}>
          <AlertTriangle size={28} style={{ color: '#B91C1C', margin: '0 auto 8px' }} />
          <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Erreur lors du chargement</p>
        </div>
      ) : (
        <>
          {/* ─── Stocks tab ─── */}
          {tab === 'stocks' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un article…" style={{ ...INPUT, paddingLeft: 32 }} />
                </div>
                {isDirector && (
                  <button onClick={() => setShowCreateItem(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
                    style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                    <Plus size={16} /> Nouvel article
                  </button>
                )}
              </div>
              {visibleItems.length === 0 ? (
                <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                  <Package size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                  <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun article</p>
                </div>
              ) : visibleItems.map(item => {
                const badges = stockAlertBadges(item);
                return (
                  <div key={item.id} className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
                    style={{ background: '#FFFFFF', border: `1px solid ${item.isOutOfStock || item.isExpired ? '#FECACA' : '#E5E7EB'}` }}
                    onClick={() => setDetailItemId(item.id)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>{STOCK_CATEGORY_LABELS[item.category].toUpperCase()}</span>
                          {!item.isActive && <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#9CA3AF', fontSize: 10, fontWeight: 700 }}>ARCHIVÉ</span>}
                          {item.validationStatus && (
                            <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[item.validationStatus].bg, color: VALIDATION_STATUS_STYLE[item.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                              {VALIDATION_STATUS_LABELS[item.validationStatus].toUpperCase()}
                            </span>
                          )}
                          {badges.map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label.toUpperCase()}</span>)}
                        </div>
                        <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{item.name}</p>
                        <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                          {item.currentQuantity} {STOCK_UNIT_LABELS[item.unit]}
                          {item.minimumQuantity != null && ` · Seuil : ${item.minimumQuantity}`}
                          {item.storageLocation && ` · ${item.storageLocation}`}
                        </p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setDetailItemId(item.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
                        style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                        <Eye size={13} /> Voir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Mouvements tab ─── */}
          {tab === 'mouvements' && (
            <div className="space-y-3">
              <select value={movementItemId} onChange={e => setMovementItemId(e.target.value)} style={{ ...INPUT, width: 'auto', cursor: 'pointer' }}>
                <option value="">Sélectionner un article…</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              {!movementItemId ? (
                <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                  <ClipboardList size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                  <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Sélectionnez un article pour voir ses mouvements</p>
                </div>
              ) : movementsLoading ? (
                <p style={{ color: '#9CA3AF', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Chargement…</p>
              ) : selectedMovements.length === 0 ? (
                <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                  <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun mouvement pour cet article</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {selectedMovements.map(m => (
                    <div key={m.id} className="rounded-xl p-4" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="px-2 py-0.5 rounded-full" style={{ background: STOCK_MOVEMENT_TYPE_STYLE[m.type].bg, color: STOCK_MOVEMENT_TYPE_STYLE[m.type].color, fontSize: 10, fontWeight: 700 }}>
                          {STOCK_MOVEMENT_TYPE_LABELS[m.type].toUpperCase()}
                        </span>
                        <span style={{ color: '#9CA3AF', fontSize: 11 }}>{new Date(m.movementDate).toLocaleDateString('fr-FR')}</span>
                      </div>
                      <p style={{ color: '#374151', fontSize: 13 }}>
                        {m.quantityBefore} → {m.quantityAfter} ({m.quantity > 0 ? '±' : ''}{m.quantity})
                        {m.reason && ` · ${m.reason}`}
                      </p>
                      {m.performedBy && <p style={{ color: '#9CA3AF', fontSize: 11, marginTop: 2 }}>Par {m.performedBy.name}{m.approvedBy && ` · Approuvé par ${m.approvedBy.name}`}</p>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ─── Inventaire tab ─── */}
          {tab === 'inventaire' && (
            <div className="space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#9CA3AF' }} />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un bien…" style={{ ...INPUT, paddingLeft: 32 }} />
                </div>
                {isDirector && (
                  <button onClick={() => setShowCreateAsset(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-lg self-start"
                    style={{ background: '#3E5A78', color: '#FFFFFF', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                    <Plus size={16} /> Nouveau bien
                  </button>
                )}
              </div>
              {visibleAssets.length === 0 ? (
                <div className="py-12 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                  <Boxes size={28} style={{ color: '#9CA3AF', margin: '0 auto 8px' }} />
                  <p style={{ color: '#374151', fontSize: 14, fontWeight: 500 }}>Aucun bien</p>
                </div>
              ) : visibleAssets.map(asset => {
                const badges = assetAlertBadges(asset);
                const statusStyle = ASSET_STATUS_STYLE[asset.status];
                return (
                  <div key={asset.id} className="rounded-xl p-5 cursor-pointer hover:shadow-md transition-shadow"
                    style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}
                    onClick={() => setDetailAssetId(asset.id)}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-2">
                          <span className="px-2 py-0.5 rounded-full" style={{ background: '#F3F4F6', color: '#374151', fontSize: 10, fontWeight: 600 }}>{STOCK_CATEGORY_LABELS[asset.category].toUpperCase()}</span>
                          <span className="px-2 py-0.5 rounded-full" style={{ background: statusStyle.bg, color: statusStyle.color, fontSize: 10, fontWeight: 700 }}>{ASSET_STATUS_LABELS[asset.status].toUpperCase()}</span>
                          {asset.validationStatus && (
                            <span className="px-2 py-0.5 rounded-full" style={{ background: VALIDATION_STATUS_STYLE[asset.validationStatus].bg, color: VALIDATION_STATUS_STYLE[asset.validationStatus].color, fontSize: 10, fontWeight: 700 }}>
                              {VALIDATION_STATUS_LABELS[asset.validationStatus].toUpperCase()}
                            </span>
                          )}
                          {badges.map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label.toUpperCase()}</span>)}
                        </div>
                        <p style={{ color: '#1A1A1A', fontSize: 14, fontWeight: 600 }}>{asset.name}</p>
                        <p style={{ color: '#9CA3AF', fontSize: 12, marginTop: 2 }}>
                          {[asset.assetCode, asset.brand, asset.assignedTo].filter(Boolean).join(' · ') || '—'}
                        </p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); setDetailAssetId(asset.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg flex-shrink-0"
                        style={{ background: '#F3F4F6', color: '#374151', fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer' }}>
                        <Eye size={13} /> Voir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Alertes tab ─── */}
          {tab === 'alertes' && (
            <div className="space-y-5">
              <div>
                <p style={{ ...SECTION_TITLE, marginBottom: 10 }}>ARTICLES DE STOCK</p>
                {alertItems.length === 0 ? (
                  <div className="py-8 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                    <CheckCircle2 size={24} style={{ color: '#065F46', margin: '0 auto 6px' }} />
                    <p style={{ color: '#374151', fontSize: 13 }}>Aucune alerte de stock</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alertItems.map(item => (
                      <div key={item.id} className="flex items-center justify-between rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
                        style={{ background: '#FFFFFF', border: '1px solid #FECACA' }} onClick={() => setDetailItemId(item.id)}>
                        <div>
                          <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{item.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {stockAlertBadges(item).map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label}</span>)}
                          </div>
                        </div>
                        <Eye size={14} style={{ color: '#9CA3AF' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <p style={{ ...SECTION_TITLE, marginBottom: 10 }}>BIENS INVENTORIÉS</p>
                {alertAssets.length === 0 ? (
                  <div className="py-8 text-center rounded-xl" style={{ background: '#FFFFFF', border: '1px solid #E5E7EB' }}>
                    <CheckCircle2 size={24} style={{ color: '#065F46', margin: '0 auto 6px' }} />
                    <p style={{ color: '#374151', fontSize: 13 }}>Aucune alerte sur les biens</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {alertAssets.map(asset => (
                      <div key={asset.id} className="flex items-center justify-between rounded-xl p-4 cursor-pointer hover:shadow-md transition-shadow"
                        style={{ background: '#FFFFFF', border: '1px solid #FECACA' }} onClick={() => setDetailAssetId(asset.id)}>
                        <div>
                          <p style={{ color: '#1A1A1A', fontSize: 13, fontWeight: 600 }}>{asset.name}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {assetAlertBadges(asset).map(b => <span key={b.label} className="px-2 py-0.5 rounded-full" style={{ background: b.bg, color: b.color, fontSize: 10, fontWeight: 700 }}>{b.label}</span>)}
                          </div>
                        </div>
                        <Eye size={14} style={{ color: '#9CA3AF' }} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Modals */}
      {showCreateItem && <StockItemModal onSave={handleCreateItem} onClose={() => setShowCreateItem(false)} />}
      {editItem && <StockItemModal initial={editItem} onSave={handleUpdateItem} onClose={() => setEditItem(null)} />}
      {detailItemId && (
        <StockItemDetailModal
          itemId={detailItemId}
          isDirector={isDirector}
          isSupervisor={isSupervisor}
          onClose={() => setDetailItemId(null)}
          onEdit={() => { const target = items.find(i => i.id === detailItemId); if (target) setEditItem(target); setDetailItemId(null); }}
          onChanged={loadAll}
        />
      )}
      {showCreateAsset && <AssetModal onSave={handleCreateAsset} onClose={() => setShowCreateAsset(false)} />}
      {editAsset && <AssetModal initial={editAsset} onSave={handleUpdateAsset} onClose={() => setEditAsset(null)} />}
      {detailAssetId && (
        <AssetDetailModal
          assetId={detailAssetId}
          isDirector={isDirector}
          isSupervisor={isSupervisor}
          onClose={() => setDetailAssetId(null)}
          onEdit={() => { const target = assets.find(a => a.id === detailAssetId); if (target) setEditAsset(target); setDetailAssetId(null); }}
          onChanged={loadAll}
        />
      )}
    </div>
  );
}

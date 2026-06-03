import type { ApiDocumentType } from '../types/api.types';

export interface RequiredDoc {
  type: ApiDocumentType;
  label: string;
}

export const REQUIRED_DOCS: RequiredDoc[] = [
  { type: 'ACTE_NAISSANCE',              label: 'Acte de naissance' },
  { type: 'ACTE_DECES',                  label: 'Acte de décès parent(s)' },
  { type: 'PIECE_ID_TUTEUR',             label: "Pièce d'identité tuteur légal" },
  { type: 'ACCORD_AEMO',                 label: 'Accord AEMO' },
  { type: 'CARNET_SANTE',               label: 'Carnet de santé' },
  { type: 'CERTIFICAT_PEC',             label: 'Certificat de prise en charge' },
  { type: 'PHOTO',                       label: 'Photo' },
];

export const COMPLEMENTARY_DOCS: RequiredDoc[] = [
  { type: 'EVALUATION_PSYCHOMOTRICE', label: 'Évaluation psychomotrice' },
  { type: 'BILAN_PSYCHOLOGIQUE',    label: 'Bilan psychologique' },
  { type: 'BILAN_SANTE',              label: 'Bilan de santé' },
];

export const REQUIRED_TYPES = new Set(REQUIRED_DOCS.map(d => d.type));

export function isDossierComplet(presentTypes: ApiDocumentType[]): boolean {
  return REQUIRED_DOCS.every(d => presentTypes.includes(d.type));
}

export function isDossierEnrichi(presentTypes: ApiDocumentType[]): boolean {
  return COMPLEMENTARY_DOCS.every(d => presentTypes.includes(d.type));
}

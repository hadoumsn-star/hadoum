export const weeklyAttendanceData = [
  { day: 'Lun', presents: 78, absents: 9 },
  { day: 'Mar', presents: 82, absents: 5 },
  { day: 'Mer', presents: 71, absents: 16 },
  { day: 'Jeu', presents: 80, absents: 7 },
  { day: 'Ven', presents: 74, absents: 13 },
];

export const classDistributionData = [
  { classe: 'Maternelle', effectif: 15 },
  { classe: 'Primaire 1', effectif: 22 },
  { classe: 'Primaire 2', effectif: 19 },
  { classe: 'Primaire 3', effectif: 24 },
  { classe: 'Collège', effectif: 7 },
];

export const monthlyTrendData = [
  { mois: 'Sep', taux: 94 },
  { mois: 'Oct', taux: 91 },
  { mois: 'Nov', taux: 88 },
  { mois: 'Déc', taux: 85 },
  { mois: 'Jan', taux: 90 },
  { mois: 'Fév', taux: 93 },
  { mois: 'Mar', taux: 92 },
  { mois: 'Avr', taux: 89 },
  { mois: 'Mai', taux: 92 },
];

export const budgetData = [
  { categorie: 'Alimentation', consommé: 68, budget: 100 },
  { categorie: 'Éducation', consommé: 55, budget: 100 },
  { categorie: 'Médical', consommé: 42, budget: 100 },
  { categorie: 'Infrastructure', consommé: 30, budget: 100 },
  { categorie: 'Activités', consommé: 75, budget: 100 },
];

export const recentActivities = [
  {
    id: 1,
    action: 'Nouveau dossier créé',
    subject: 'Youssef M., 8 ans',
    user: 'Karim M.',
    time: 'Il y a 30 min',
    type: 'info' as const,
  },
  {
    id: 2,
    action: 'Présences validées',
    subject: 'Classe Primaire 2 — 19/19',
    user: 'Fatima B.',
    time: 'Il y a 1h',
    type: 'success' as const,
  },
  {
    id: 3,
    action: 'Rapport soumis',
    subject: 'Rapport mensuel Avril 2026',
    user: 'Nadia H.',
    time: 'Il y a 2h',
    type: 'info' as const,
  },
  {
    id: 4,
    action: 'Sortie approuvée',
    subject: 'Visite Musée — 15 Mai',
    user: 'Amira B.',
    time: 'Il y a 3h',
    type: 'success' as const,
  },
  {
    id: 5,
    action: 'Incident signalé',
    subject: 'Conflit cour de récréation',
    user: 'Karim M.',
    time: 'Il y a 4h',
    type: 'warning' as const,
  },
];

export const activeAlerts = [
  {
    id: 1,
    level: 'error' as const,
    title: 'Dossiers médicaux incomplets',
    description: '3 enfants ont des dossiers médicaux incomplets nécessitant une mise à jour urgente.',
    action: 'Voir les dossiers',
  },
  {
    id: 2,
    level: 'warning' as const,
    title: 'Rapport mensuel à soumettre',
    description: 'Le rapport mensuel de Mai 2026 est attendu par le Conseil. Échéance dans 2 jours.',
    action: 'Générer le rapport',
  },
  {
    id: 3,
    level: 'warning' as const,
    title: 'Absences simultanées d\'éducateurs',
    description: '2 éducateurs sont en congé la semaine du 10 Mai. Un remplacement est nécessaire.',
    action: 'Gérer le planning',
  },
];

export const priorityTasks = [
  { id: 1, task: 'Valider les présences du mois', dueDate: '03 Mai', status: 'urgent' as const },
  { id: 2, task: 'Mise à jour budget prévisionnel', dueDate: '05 Mai', status: 'normal' as const },
  { id: 3, task: 'Réunion équipe pédagogique', dueDate: '07 Mai', status: 'normal' as const },
  { id: 4, task: 'Révision des dossiers médicaux', dueDate: '10 Mai', status: 'urgent' as const },
  { id: 5, task: 'Soumission rapport trimestriel', dueDate: '15 Mai', status: 'normal' as const },
];

export const childrenSummary = [
  { id: 1, name: 'Amine Belarbi', age: 10, classe: 'Primaire 3', status: 'present' as const, dossier: 'complet' as const },
  { id: 2, name: 'Sara Ouali', age: 8, classe: 'Primaire 2', status: 'absent' as const, dossier: 'incomplet' as const },
  { id: 3, name: 'Youssef Meziane', age: 7, classe: 'Primaire 1', status: 'present' as const, dossier: 'complet' as const },
  { id: 4, name: 'Lina Benkirane', age: 5, classe: 'Maternelle', status: 'present' as const, dossier: 'complet' as const },
  { id: 5, name: 'Omar Rahmani', age: 13, classe: 'Collège', status: 'absent' as const, dossier: 'incomplet' as const },
];

// Educator data
export const myClasses = [
  { id: 1, name: 'Primaire 2A', students: 19, presentToday: 17, nextActivity: 'Lecture 14h00' },
  { id: 2, name: 'Primaire 2B', students: 21, presentToday: 20, nextActivity: 'Maths 15h30' },
  { id: 3, name: 'Soutien', students: 8, presentToday: 7, nextActivity: 'Français 16h00' },
];

export const todaySchedule = [
  { time: '08h00', activity: 'Accueil & Appel', class: 'Primaire 2A', status: 'done' as const },
  { time: '09h00', activity: 'Mathématiques', class: 'Primaire 2A', status: 'done' as const },
  { time: '10h30', activity: 'Français', class: 'Primaire 2B', status: 'done' as const },
  { time: '14h00', activity: 'Lecture', class: 'Primaire 2A', status: 'current' as const },
  { time: '15h30', activity: 'Sciences', class: 'Primaire 2B', status: 'upcoming' as const },
  { time: '16h30', activity: 'Activités', class: 'Soutien', status: 'upcoming' as const },
];

export const myStudents = [
  { id: 1, name: 'Amine Belarbi', class: 'Primaire 2A', present: true, note: 14.5 },
  { id: 2, name: 'Lina Ouali', class: 'Primaire 2A', present: true, note: 16.0 },
  { id: 3, name: 'Mehdi Zerari', class: 'Primaire 2A', present: false, note: 11.0 },
  { id: 4, name: 'Yasmine Bensalem', class: 'Primaire 2B', present: true, note: 17.5 },
  { id: 5, name: 'Riad Hamza', class: 'Primaire 2B', present: true, note: 13.0 },
];

// Supervisor data
export const pendingValidations = [
  { id: 1, type: 'Sortie scolaire', description: 'Visite musée — 15 élèves', submittedBy: 'Karim M.', date: '03 Mai', urgency: 'haute' as const },
  { id: 2, type: 'Dépense exceptionnelle', description: 'Matériel médical — 12 500 DA', submittedBy: 'Administration', date: '03 Mai', urgency: 'normale' as const },
  { id: 3, type: 'Absence éducateur', description: 'Rachid A. — 10 au 14 Mai', submittedBy: 'Rachid A.', date: '02 Mai', urgency: 'haute' as const },
  { id: 4, type: 'Rapport incident', description: 'Incident cour — Résolu', submittedBy: 'Fatima B.', date: '01 Mai', urgency: 'normale' as const },
  { id: 5, type: 'Activité hebdomadaire', description: 'Atelier peinture — 25 élèves', submittedBy: 'Zineb M.', date: '30 Avr', urgency: 'basse' as const },
];

export const openIncidents = [
  { id: 1, title: 'Conflit entre élèves', date: '02 Mai', class: 'Primaire 3', severity: 'moyen' as const, status: 'en cours' as const },
  { id: 2, title: 'Matériel endommagé', date: '28 Avr', class: 'Maternelle', severity: 'faible' as const, status: 'résolu' as const },
  { id: 3, title: 'Absence non justifiée répétée', date: '25 Avr', class: 'Collège', severity: 'élevé' as const, status: 'en cours' as const },
];

// Board data
export const boardReports = [
  { id: 1, title: 'Rapport mensuel — Avril 2026', date: '01 Mai 2026', status: 'disponible' as const, type: 'Mensuel' },
  { id: 2, title: 'Rapport trimestriel — T1 2026', date: '01 Avr 2026', status: 'disponible' as const, type: 'Trimestriel' },
  { id: 3, title: 'Rapport annuel 2025', date: '15 Jan 2026', status: 'disponible' as const, type: 'Annuel' },
  { id: 4, title: 'Audit financier 2025', date: '10 Fév 2026', status: 'disponible' as const, type: 'Financier' },
];

// ─── Full children dataset ──────────────────────────────────────────────────

export interface Child {
  id: number;
  apiId?: string;        // UUID from backend
  fileNumber?: string;   // HAD-XXXX
  firstName: string;
  lastName: string;
  dob: string;           // YYYY-MM-DD
  gender: 'M' | 'F';
  classe: 'Maternelle' | 'Primaire 1' | 'Primaire 2' | 'Primaire 3' | 'Collège';
  attendanceStatus: 'present' | 'absent';
  dossierStatus: 'complet' | 'à compléter' | 'partiel' | 'incomplet';
  tuteurName: string;
  tuteurPhone: string;
  admissionDate: string; // YYYY-MM-DD
  childStatus?: 'ORPHELIN_COMPLET' | 'ORPHELIN_PERE' | 'ORPHELIN_MERE' | 'DEMI_ORPHELIN' | 'ENFANT_EN_DIFFICULTE';
  // CRM exit fields
  exitStatus?: 'actif' | 'sorti';
  exitType?: 'temporaire' | 'définitive';
  exitDate?: string;
  exitReturnDate?: string;
  exitMotif?: string;
  exitResponsable?: string;
}

export const allChildrenData: Child[] = [
  { id: 1,  firstName: 'Amine',   lastName: 'Belarbi',   dob: '2015-03-12', gender: 'M', classe: 'Primaire 3', attendanceStatus: 'present', dossierStatus: 'complet',   tuteurName: 'Brahim Belarbi',  tuteurPhone: '0551 23 45 67', admissionDate: '2020-09-01' },
  { id: 2,  firstName: 'Sara',    lastName: 'Ouali',     dob: '2017-07-22', gender: 'F', classe: 'Primaire 2', attendanceStatus: 'absent',  dossierStatus: 'incomplet', tuteurName: 'Naïma Ouali',     tuteurPhone: '0661 34 56 78', admissionDate: '2022-01-15' },
  { id: 3,  firstName: 'Youssef', lastName: 'Meziane',   dob: '2018-01-15', gender: 'M', classe: 'Primaire 1', attendanceStatus: 'present', dossierStatus: 'complet',   tuteurName: 'Hassan Meziane',  tuteurPhone: '0770 45 67 89', admissionDate: '2023-09-05' },
  { id: 4,  firstName: 'Lina',    lastName: 'Benkirane', dob: '2020-05-08', gender: 'F', classe: 'Maternelle', attendanceStatus: 'present', dossierStatus: 'complet',   tuteurName: 'Saïda Benkirane', tuteurPhone: '0551 67 89 01', admissionDate: '2024-09-01' },
  { id: 5,  firstName: 'Omar',    lastName: 'Rahmani',   dob: '2012-11-30', gender: 'M', classe: 'Collège',    attendanceStatus: 'absent',  dossierStatus: 'incomplet', tuteurName: 'Rabah Rahmani',   tuteurPhone: '0661 89 01 23', admissionDate: '2019-09-01' },
  { id: 6,  firstName: 'Fatima',  lastName: 'Zerhouni',  dob: '2016-04-20', gender: 'F', classe: 'Primaire 2', attendanceStatus: 'present', dossierStatus: 'complet',   tuteurName: 'Ahmed Zerhouni',  tuteurPhone: '0770 01 23 45', admissionDate: '2021-09-01' },
  { id: 7,  firstName: 'Khalid',  lastName: 'Hamdi',     dob: '2014-08-03', gender: 'M', classe: 'Primaire 3', attendanceStatus: 'present', dossierStatus: 'incomplet', tuteurName: 'Fatima Hamdi',    tuteurPhone: '0551 12 34 56', admissionDate: '2019-09-01' },
  { id: 8,  firstName: 'Nour',    lastName: 'Bensalem',  dob: '2019-02-14', gender: 'F', classe: 'Primaire 1', attendanceStatus: 'present', dossierStatus: 'complet',   tuteurName: 'Karim Bensalem',  tuteurPhone: '0661 23 45 67', admissionDate: '2024-01-10' },
  { id: 9,  firstName: 'Adam',    lastName: 'Cherif',    dob: '2013-06-25', gender: 'M', classe: 'Collège',    attendanceStatus: 'present', dossierStatus: 'complet',   tuteurName: 'Lila Cherif',     tuteurPhone: '0770 34 56 78', admissionDate: '2020-09-01' },
  { id: 10, firstName: 'Imane',   lastName: 'Boudali',   dob: '2018-09-11', gender: 'F', classe: 'Primaire 1', attendanceStatus: 'absent',  dossierStatus: 'incomplet', tuteurName: 'Rachid Boudali',  tuteurPhone: '0551 45 67 89', admissionDate: '2023-09-01' },
  { id: 11, firstName: 'Reda',    lastName: 'Boudjemaa', dob: '2015-12-07', gender: 'M', classe: 'Primaire 2', attendanceStatus: 'present', dossierStatus: 'complet',   tuteurName: 'Zina Boudjemaa',  tuteurPhone: '0661 56 78 90', admissionDate: '2021-09-01' },
  { id: 12, firstName: 'Asma',    lastName: 'Khelil',    dob: '2019-11-18', gender: 'F', classe: 'Maternelle', attendanceStatus: 'present', dossierStatus: 'complet',   tuteurName: 'Nadia Khelil',    tuteurPhone: '0770 67 89 01', admissionDate: '2024-09-01' },
  { id: 13, firstName: 'Sofiane', lastName: 'Mebarki',   dob: '2016-07-30', gender: 'M', classe: 'Primaire 2', attendanceStatus: 'absent',  dossierStatus: 'incomplet', tuteurName: 'Mourad Mebarki',  tuteurPhone: '0551 78 90 12', admissionDate: '2021-09-01' },
  { id: 14, firstName: 'Rania',   lastName: 'Heddar',    dob: '2014-03-22', gender: 'F', classe: 'Primaire 3', attendanceStatus: 'present', dossierStatus: 'complet',   tuteurName: 'Amar Heddar',     tuteurPhone: '0661 89 01 23', admissionDate: '2019-09-01' },
  { id: 15, firstName: 'Ilyas',   lastName: 'Benali',    dob: '2020-08-15', gender: 'M', classe: 'Maternelle', attendanceStatus: 'present', dossierStatus: 'incomplet', tuteurName: 'Karima Benali',   tuteurPhone: '0770 90 12 34', admissionDate: '2025-01-06' },
];

// ─── Team / Staff ─────────────────────────────────────────────────────────────

export interface TeamMember {
  id: number; name: string; role: string;
  classes: string[]; status: 'present' | 'absent' | 'conge';
  phone: string; email: string; since: string; initials: string;
  scheduleJson?: string | null;
}

export const teamMembers: TeamMember[] = [
  { id: 1,  name: 'Karim Mansouri',   role: 'Éducateur',   classes: ['Primaire 2A','Primaire 2B'], status: 'present', phone: '0551 11 22 33', email: 'k.mansouri@hadoum.org',   since: '2019-09-01', initials: 'KM' },
  { id: 2,  name: 'Fatima Benmoussa', role: 'Éducatrice',  classes: ['Primaire 3'],                status: 'present', phone: '0661 22 33 44', email: 'f.benmoussa@hadoum.org',  since: '2020-01-15', initials: 'FB' },
  { id: 3,  name: 'Rachid Ammari',    role: 'Éducateur',   classes: ['Soutien','Collège'],         status: 'conge',   phone: '0770 33 44 55', email: 'r.ammari@hadoum.org',     since: '2021-09-01', initials: 'RA' },
  { id: 4,  name: 'Zineb Mokhtar',    role: 'Éducatrice',  classes: ['Maternelle','Primaire 1'],   status: 'present', phone: '0551 44 55 66', email: 'z.mokhtar@hadoum.org',    since: '2022-09-01', initials: 'ZM' },
  { id: 5,  name: 'Nadia Hamidi',     role: 'Éducatrice',  classes: ['Primaire 1','Primaire 2B'],  status: 'present', phone: '0661 55 66 77', email: 'n.hamidi@hadoum.org',      since: '2023-01-10', initials: 'NH' },
  { id: 6,  name: 'Younes Safi',      role: 'Auxiliaire',  classes: [],                            status: 'absent',  phone: '0770 66 77 88', email: 'y.safi@hadoum.org',        since: '2024-09-01', initials: 'YS' },
  { id: 7,  name: 'Amira Kaci',       role: 'Infirmière',  classes: [],                            status: 'present', phone: '0551 77 88 99', email: 'a.kaci@hadoum.org',        since: '2021-09-01', initials: 'AK' },
  { id: 8,  name: 'Mourad Benlahcen', role: 'Éducateur',   classes: ['Primaire 3','Soutien'],      status: 'present', phone: '0661 88 99 00', email: 'm.benlahcen@hadoum.org',  since: '2020-09-01', initials: 'MB' },
  { id: 9,  name: 'Samira Ouled',     role: 'Éducatrice',  classes: ['Maternelle'],                status: 'present', phone: '0770 99 00 11', email: 's.ouled@hadoum.org',       since: '2022-01-15', initials: 'SO' },
  { id: 10, name: 'Hassan Mekki',     role: 'Éducateur',   classes: ['Collège'],                   status: 'conge',   phone: '0770 22 33 44', email: 'h.mekki@hadoum.org',       since: '2019-09-01', initials: 'HM' },
  { id: 11, name: 'Leïla Bouzid',     role: 'Éducatrice',  classes: ['Primaire 2A'],               status: 'present', phone: '0661 11 22 33', email: 'l.bouzid@hadoum.org',      since: '2024-09-01', initials: 'LB' },
  { id: 12, name: 'Omar Ghouma',      role: 'Auxiliaire',  classes: [],                            status: 'present', phone: '0551 00 11 22', email: 'o.ghouma@hadoum.org',      since: '2023-09-01', initials: 'OG' },
];

// ─── Team Candidates & Former Members ─────────────────────────────────────────

export interface Candidat {
  id: number;
  nom: string;
  prenom: string;
  posteVise: string;
  dateCandidate: string;
  telephone: string;
  statut: 'nouveau' | 'présélectionné' | 'entretien fait';
  cvUploaded: boolean;
  cvKey?: string | null;
  typeCandidature?: string | null;
  disponibleDe?: string | null;
  notes?: string | null;
  contactInfo?: string | null;
}

export interface FormerMember {
  id: number;
  name: string;
  role: string;
  dateSortie: string;
  motifSortie: string;
  initials: string;
}

export const candidatesData: Candidat[] = [
  { id: 1, nom: 'Benyahia', prenom: 'Sonia',   posteVise: 'Éducatrice',         dateCandidate: '20 Avr 2026', telephone: '0551 10 20 30', statut: 'présélectionné',   cvUploaded: true  },
  { id: 2, nom: 'Rezaïg',   prenom: 'Tarek',   posteVise: 'Éducateur',           dateCandidate: '02 Mai 2026', telephone: '0661 30 40 50', statut: 'nouveau',           cvUploaded: true  },
  { id: 3, nom: 'Mezrag',   prenom: 'Lila',    posteVise: 'Infirmière',           dateCandidate: '28 Mar 2026', telephone: '0770 50 60 70', statut: 'entretien fait',    cvUploaded: true  },
  { id: 4, nom: 'Hamouche', prenom: 'Walid',   posteVise: 'Auxiliaire',           dateCandidate: '05 Mai 2026', telephone: '0551 70 80 90', statut: 'nouveau',           cvUploaded: false },
];

export const formerMembersData: FormerMember[] = [
  { id: 1, name: 'Dalila Benouareth', role: 'Éducatrice',  dateSortie: '31 Aoû 2024', motifSortie: 'Fin de contrat',        initials: 'DB' },
  { id: 2, name: 'Samir Kaci',        role: 'Auxiliaire',  dateSortie: '15 Déc 2023', motifSortie: 'Démission',             initials: 'SK' },
  { id: 3, name: 'Houria Slimane',    role: 'Éducatrice',  dateSortie: '01 Mar 2025', motifSortie: 'Départ à la retraite', initials: 'HS' },
];

// ─── Staff Attendance (for director dashboard widget) ─────────────────────────

export const staffAttendanceData = [
  { day: 'Lun', presents: 10, absents: 2 },
  { day: 'Mar', presents: 11, absents: 1 },
  { day: 'Mer', presents: 9,  absents: 3 },
  { day: 'Jeu', presents: 12, absents: 0 },
  { day: 'Ven', presents: 10, absents: 2 },
];

// ─── Finances ─────────────────────────────────────────────────────────────────

export interface Transaction {
  id: number; description: string; category: string;
  amount: number; date: string; type: 'depense' | 'recette';
}

export const recentTransactions: Transaction[] = [
  { id: 1, description: 'Fournitures scolaires',          category: 'Éducation',    amount: 15400,  date: '01 Mai 2026', type: 'depense' },
  { id: 2, description: 'Subvention ministérielle T1',    category: 'Recettes',     amount: 450000, date: '30 Avr 2026', type: 'recette' },
  { id: 3, description: 'Alimentation — livraison',       category: 'Alimentation', amount: 68000,  date: '28 Avr 2026', type: 'depense' },
  { id: 4, description: 'Matériel médical urgence',       category: 'Médical',      amount: 12500,  date: '25 Avr 2026', type: 'depense' },
  { id: 5, description: 'Don association partenaire',     category: 'Recettes',     amount: 50000,  date: '20 Avr 2026', type: 'recette' },
  { id: 6, description: 'Réparation infrastructure',      category: 'Infrastructure',amount: 8700,  date: '15 Avr 2026', type: 'depense' },
  { id: 7, description: 'Salaires éducateurs — Avril',    category: 'Personnel',    amount: 320000, date: '10 Avr 2026', type: 'depense' },
];

export const budgetCategories = [
  { id: 1, categorie: 'Alimentation',   budgetDA: 100000, consommeDA: 68000,  color: '#3E5A78' },
  { id: 2, categorie: 'Éducation',      budgetDA:  80000, consommeDA: 44000,  color: '#7C3AED' },
  { id: 3, categorie: 'Médical',        budgetDA:  60000, consommeDA: 25200,  color: '#065F46' },
  { id: 4, categorie: 'Infrastructure', budgetDA:  50000, consommeDA: 15000,  color: '#D97706' },
  { id: 5, categorie: 'Activités',      budgetDA:  30000, consommeDA: 22500,  color: '#B91C1C' },
  { id: 6, categorie: 'Personnel',      budgetDA: 400000, consommeDA: 320000, color: '#374151' },
];

// ─── Messages ─────────────────────────────────────────────────────────────────

export interface Message {
  id: number; from: string; fromRole: string;
  subject: string; preview: string; time: string;
  read: boolean; important: boolean;
}

export const inboxMessages: Message[] = [
  { id: 1, from: 'Amira Benali',    fromRole: 'Directrice',  subject: 'Rapport de présences — urgent',   preview: 'Merci de valider les présences d\'avril avant demain 18h.',                         time: '10h30',  read: false, important: true },
  { id: 2, from: 'Nadia Hamidi',    fromRole: 'Superviseure',subject: 'Incident cour de récréation',     preview: 'Une médiation a été organisée pour demain matin à 9h.',                           time: '09h15',  read: false, important: false },
  { id: 3, from: 'Zineb Mokhtar',   fromRole: 'Éducatrice',  subject: 'Dossier de Sara Ouali',           preview: 'Le tuteur de Sara a rappelé. Il passera compléter le dossier vendredi.',          time: 'Hier',   read: true,  important: false },
  { id: 4, from: 'Karim Mansouri',  fromRole: 'Éducateur',   subject: 'Sortie pédagogique — 15 Mai',     preview: 'Les autorisations parentales ont été récupérées pour 14 élèves sur 15.',           time: 'Hier',   read: true,  important: false },
  { id: 5, from: 'Administration',  fromRole: 'Système',     subject: 'Nouveau rapport disponible',      preview: 'Le rapport mensuel d\'Avril 2026 est maintenant disponible au téléchargement.',   time: '28 Avr', read: true,  important: false },
  { id: 6, from: 'Mourad Benlahcen',fromRole: 'Éducateur',   subject: 'Absence demain matin',            preview: 'Je serai absent demain pour raisons médicales. Remplacement nécessaire.',          time: '27 Avr', read: true,  important: true },
];

// ─── Activities ───────────────────────────────────────────────────────────────

export interface Activity {
  id: number; title: string;
  type: 'pédagogique' | 'culturelle' | 'sportive' | 'artistique';
  class: string; educator: string; date: string; time: string;
  status: 'planifiée' | 'en cours' | 'terminée' | 'annulée';
  participants: number;
}

export const activitiesData: Activity[] = [
  { id: 1, title: 'Sortie Musée National',      type: 'culturelle',   class: 'Primaire 3',  educator: 'Fatima B.',  date: '15 Mai 2026', time: '09h00', status: 'planifiée',  participants: 24 },
  { id: 2, title: 'Atelier peinture',           type: 'artistique',   class: 'Maternelle',  educator: 'Zineb M.',   date: '08 Mai 2026', time: '14h00', status: 'planifiée',  participants: 15 },
  { id: 3, title: 'Séance lecture collective',  type: 'pédagogique',  class: 'Primaire 2A', educator: 'Karim M.',   date: '03 Mai 2026', time: '14h00', status: 'en cours',   participants: 17 },
  { id: 4, title: 'Tournoi de football',        type: 'sportive',     class: 'Collège',     educator: 'Hassan M.',  date: '02 Mai 2026', time: '15h30', status: 'terminée',   participants: 12 },
  { id: 5, title: 'Atelier théâtre',            type: 'artistique',   class: 'Primaire 3',  educator: 'Fatima B.',  date: '28 Avr 2026', time: '10h00', status: 'terminée',   participants: 22 },
  { id: 6, title: 'Cours de soutien maths',     type: 'pédagogique',  class: 'Soutien',     educator: 'Karim M.',   date: '06 Mai 2026', time: '16h30', status: 'planifiée',  participants:  7 },
  { id: 7, title: 'Concours de dessin',         type: 'artistique',   class: 'Primaire 1',  educator: 'Zineb M.',   date: '10 Mai 2026', time: '10h00', status: 'planifiée',  participants: 22 },
];
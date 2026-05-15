# Hadoum Figma Make Guidelines v7

## 1. Objective
Créer une interface desktop web app élégante, claire, structurée, et directement exploitable pour Figma Make, destinée à une école avec plusieurs rôles utilisateurs.

## 2. Product context
Hadoum est une application de gestion scolaire pensée pour plusieurs profils. L’interface doit être professionnelle, simple à lire, orientée exploitation quotidienne et pilotage.

## 3. Main roles
L’application est **multi-rôles**. L’interface doit s’adapter au profil connecté.

### Director
- Accès complet.
- Vue de pilotage globale.
- Gestion des établissements, équipes, contenus, reporting, supervision.

### Educator
- Vue simplifiée et centrée sur les tâches quotidiennes.
- Accès aux classes, élèves, présences, notes, activités, messages.

### Supervisor
- Vue d’observation et de contrôle.
- Accès aux validations, rapports, incidents, suivis, alertes.

### Board of Directors
- Vue restreinte.
- Accès uniquement aux rapports, indicateurs, synthèses et exports.

## 4. Core UX principles
- Clarté avant densité.
- Hiérarchie visuelle forte.
- Peu de friction.
- Navigation simple et stable.
- Les écrans doivent être immédiatement compréhensibles.
- Chaque rôle doit voir uniquement ce qui lui est utile.

## 5. Global layout
- Application desktop first.
- Sidebar principale à gauche.
- Header supérieur avec contexte, recherche, notifications, profil.
- Zone de contenu principale avec cartes, tableaux, actions rapides.
- Structure modulaire et évolutive.

## 6. Navigation rules
- Le menu change selon le rôle connecté.
- Les entrées non pertinentes pour le rôle doivent être masquées.
- Le dashboard d’accueil doit refléter le profil utilisateur.
- Les CTA doivent être cohérents avec les permissions.
- Ne pas afficher de modules inutilisables pour le rôle actif.

## 7. Shared design language
- Style sobre, institutionnel, moderne.
- Interface premium mais accessible.
- Utilisation de cartes, tableaux, filtres, badges, stats, listes.
- Couleurs calmes et rassurantes.
- États visuels clairs pour succès, alerte, erreur, information.

## 8. Screen hierarchy
Priorité aux écrans suivants :
1. Login / role entry
2. Dashboard role-based
3. List views
4. Detail views
5. Forms
6. Reports
7. Settings

## 9. Dashboard expectations
Chaque dashboard doit afficher :
- Résumé principal.
- Actions rapides.
- Indicateurs clés.
- Bloc d’activité récente.
- Bloc d’alertes ou tâches prioritaires.
- Contenu spécifique au rôle.

## 10. Role-based content logic
- Director sees global KPI, team performance, operational overview.
- Educator sees classes, attendance, assignments, student follow-up.
- Supervisor sees monitoring, approvals, incidents, reporting.
- Board sees governance indicators, exports, consolidated reports.

## 11. UX quality rules
- Pas de surcharge.
- Pas de menus inutiles.
- Pas de jargon ambigu.
- Pas de duplication entre pages.
- Les priorités doivent être lisibles en 3 secondes.
- Chaque écran doit avoir une action principale claire.

## 12. Visual hierarchy
- Titre de page fort.
- Sous-titre ou contexte secondaire.
- Blocs séparés par niveau d’importance.
- Les statistiques importantes doivent ressortir visuellement.
- Les tableaux doivent être lisibles et aérés.

## 13. Component expectations
- Sidebar
- Topbar
- KPI cards
- Data tables
- Filters
- Tabs
- Badges
- Alerts
- Empty states
- Forms
- Modal dialogs
- Action buttons
- Profile menu
- Notification center

## 14. Empty states
- Chaque empty state doit être utile.
- Donner une explication.
- Proposer une action claire.
- Adapter le message au rôle et au contexte.

## 15. States and feedback
- Loading, empty, success, warning, error.
- États cohérents sur toute l’application.
- Feedback immédiat après action.
- Les statuts doivent être visibles sans effort.

## 16. Multi-role application behavior
- Hadoum is not a single-user dashboard.
- The UI must adapt to the logged-in role.
- Each user sees only the menus and screens allowed by their role.
- Onboarding and landing states must reflect the user profile and available actions.
- Director: full operational dashboard.
- Educator: simplified daily operations dashboard.
- Supervisor: read-oriented dashboard with validations and reports.
- Board of Directors: reports only.

## 17. Figma Make guidance
- Generate a clean, realistic, production-ready web app UI.
- Keep the interface consistent across roles.
- Prioritize readability and business clarity.
- Use realistic business data.
- Avoid decorative excess.
- Build for desktop first.

## 18. Final instruction
Design the application as a serious multi-role school management platform with a clear role-based experience, strong hierarchy, and clean operational UX.
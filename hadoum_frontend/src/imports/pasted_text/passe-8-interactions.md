PASSE 8 — Raccordement interactions + corrections flux ciblées

Passe de finalisation avant remise. Travaille dans l'ordre strict.
Rapport obligatoire en fin de passe.

---

1. DASHBOARD DIRECTEUR — interactions CTAs

a) CTA "Ajouter un enfant" dans les actions rapides du dashboard
Au clic : ouvrir directement la modale multi-étapes de création d'enfant.
Actuellement ça redirige vers /app/children. Corriger sans toucher à la navigation sidebar.

b) CTA "Saisir les présences" dans les actions rapides
Vérifier qu'il navigate vers /app/attendance. Si le onClick manque, l'ajouter.

c) "Voir toutes les notifications"
Supprimer la redirection vers /app/reports.
Remplacer par l'ouverture du panneau de notifications du topbar (la cloche).
Si ce n'est pas techniquement possible en un clic, navigate('/app/incidents') à la place.

---

2. FICHE ENFANT — onglet Sorties

a) Sortie permanente : masquer dynamiquement le champ "Date de retour prévue".
Ce champ ne doit apparaître que si le type de sortie sélectionné est "temporaire".
Pour "permanente" : masquer complètement le champ.

b) Champ "Nom du responsable" : remplacer le text field par une droplist
qui puise dans les contacts enregistrés dans l'onglet Famille du même enfant.
Si aucun contact famille n'est enregistré, afficher uniquement l'option
"Ajouter un contact" qui ouvre un mini-formulaire inline (nom + téléphone uniquement).

---

3. FICHE ENFANT — onglet Identité, upload documents

Dans la checklist des 8 documents requis (onglet Identité),
chaque document doit avoir un bouton "Joindre" à côté de la case à cocher.
Au clic sur "Joindre" : déclencher un input file simulé.
Quand un fichier est "sélectionné" (peu importe lequel) :
- la case se coche automatiquement
- une icône 📎 apparaît à droite du libellé du document
- le bouton "Joindre" se change en "Remplacer"
Si la case est déjà cochée manuellement, le bouton "Joindre" reste disponible
pour associer un fichier sans décocher.
Appliquer dans l'onglet Identité de la fiche CRM ET dans l'étape "Documents"
du formulaire multi-étapes de création.

---

4. PRÉSENCES — grille éducateur

Dans /app/attendance côté éducateur (role === 'educator'),
la grille affiche actuellement les membres de l'équipe.
Corriger : afficher les élèves des classes assignées à l'éducateur connecté,
pas les éducateurs.
Colonnes : Prénom + Nom, Classe, Présent (case à cocher).
Utiliser les données mock des 87 enfants filtrées par la classe de l'éducateur.

---

5. PRÉSENCES — checkbox désactivée selon statut

Dans /app/attendance côté directeur, la case "Présence confirmée" doit être
désactivée (grisée, cursor: not-allowed) pour les membres avec statut "Congé" ou "Absent".
Ces membres sont absents par défaut, la case ne doit pas être cochable.
Seuls les membres avec statut "Présent" ont une case active.

---

6. ÉQUIPE — corrections formulaires

a) Champ "Poste visé" dans la modale candidat (ajout ET édition) :
Remplacer le text field par une droplist avec les valeurs :
Éducateur, Dame de charge, Comptable, Infirmier/ère,
Community Manager, Direction, Autre.

b) Anciens membres : ajouter un bouton "Modifier" sur chaque ligne.
Au clic : modale d'édition avec champs Nom, Prénom, Poste,
Date de départ, Motif de départ.
Bouton "Enregistrer" met à jour la fiche localement.

---

7. SUPERVISEUR ET CA — corrections mineures

a) Superviseur — badge demandes : quand toutes les demandes sont traitées
(compteur = 0), masquer dynamiquement le badge rouge sur le dashboard.

b) CA — bloc budget : ajouter dans le dashboard CA un bloc "Budget"
en lecture seule avec 3 KPIs : Budget alloué, Budget consommé, Budget restant.
Même structure visuelle que le bloc superviseur. Pas d'interaction.

---

8. MESSAGERIE — restauration direction ↔ équipe

Restaurer le module messagerie supprimé en Passe 1.
Périmètre strict : direction ↔ membres de l'équipe uniquement.
Pas de messagerie entre membres entre eux.

Page /app/messages :
- Colonne gauche : liste des conversations (une par membre),
  avec nom, avatar, dernier message tronqué, badge non lus.
- Zone droite : fil de conversation avec bulles, champ de saisie, bouton envoyer.
- 3 conversations mock pré-chargées.

Accès :
- Directeur : peut écrire à tous les membres.
- Éducateur : peut écrire uniquement au directeur.
- Superviseur et CA : pas d'accès, pas d'entrée sidebar.

Ajouter "Messagerie" dans la sidebar directeur et éducateur uniquement.

---

9. MOBILE — tab bar rapports

Dans /app/reports sur mobile, le tab bar (Mensuel / Trimestriel / Annuel / etc.)
déborde. Corriger en rendant ce tab bar scrollable horizontalement :
overflow-x: auto, scroll-snap, whitespace-nowrap sur les items.
Vérifier que le bouton "Charger un rapport" reste dans le flux normal,
pas en position absolue.

---

RÈGLES GÉNÉRALES

- Ne pas toucher à : FinancesPage, IndicatorsPage, ExportsPage, DesignSystemPage.
- Tester desktop ET mobile pour chaque point.
- Rapport final : fichiers touchés, comportements avant/après, points non traités avec justification.
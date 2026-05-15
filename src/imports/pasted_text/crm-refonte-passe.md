PASSE 6 — Refonte fiche enfant CRM + module équipe + incidents + ajustements rôles

Passe structurelle importante. Travaille module par module dans l'ordre indiqué.
Rapport détaillé obligatoire en fin de passe.

---

1. FICHE ENFANT — refonte en CRM multi-onglets

La fiche enfant actuelle est un formulaire multi-étapes trop simple.
La repenser comme un profil complet avec onglets latéraux (desktop) ou tabs scrollables (mobile).

Onglets à créer :
- Identité : prénom, nom, date de naissance, genre, photo (upload simulé), numéro de dossier, date d'entrée, classe assignée, statut (actif / sorti temporairement / sorti définitivement)
- Famille : situation familiale (orphelin complet / demi-orphelin / enfant en difficulté), lieu de vie famille, date dernière visite, contacts famille, composition familiale
- Scolarité : niveau, établissement, résultats par matière, assiduité, observations enseignant
- Santé : groupe sanguin, allergies, vaccinations (tableau dates), traitements en cours, consultations
- Sorties : tableau avec type (temporaire / permanente), date départ, date retour prévue, motif, responsable de l'enfant pendant la sortie
- Activités : liste des activités de l'enfant (foot, karaté, etc.) avec description libre, goûts, traits de caractère

Photo obligatoire : ajouter un avatar placeholder avec bouton "Ajouter une photo" dans l'onglet Identité.

Suppression → désactivation :
Le bouton "Supprimer" dans la fiche doit s'appeler "Marquer comme sorti".
Au clic : modale de confirmation avec champs obligatoires : type de sortie (temporaire / définitive), date de départ, motif.
L'enfant passe en statut "Sorti" dans la liste avec badge grisé, il n'est pas supprimé.
Ajouter un filtre "Actifs / Sortis / Tous" dans la liste des enfants.

Dossier incomplet :
Ajouter dans l'onglet Identité une section "Documents requis" avec liste de cases à cocher :
Acte de naissance, Acte de décès parent(s), Pièce d'identité tuteur légal, Accord AEMO, Carnet de santé, Certificat de prise en charge, Autorisation gouvernementale, Photo.
Si au moins une case est décochée → badge "Dossier incomplet" rouge sur la fiche et dans la liste.

---

2. MODULE ÉQUIPE — refonte avec 3 statuts

La liste équipe actuelle n'a que les membres actifs.
Ajouter 3 onglets ou filtres en haut de la page /app/team :
- Équipe active : membres actuellement en poste
- Candidats : personnes en cours de recrutement ou dans la base candidats
- Anciens membres : personnes ayant quitté l'établissement

Pour chaque membre actif : nom, prénom, poste, couleur par fonction (éducateur = vert, dame de charge = bleu, comptable = orange, direction = violet), statut présence, date d'entrée.
Pour chaque candidat : nom, prénom, poste visé, date de candidature, statut (nouveau / présélectionné / entretien fait), CV uploadé (simulé).
Pour chaque ancien membre : nom, prénom, poste, date de départ, motif de départ.

Bouton "Marquer comme sorti" sur les membres actifs (même logique que les enfants).
Bouton "Ajouter un candidat" : formulaire simple nom, prénom, poste visé, téléphone, statut.
Bouton "Promouvoir dans l'équipe" sur les candidats présélectionnés → les passe en équipe active.

---

3. MODULE SUIVI INCIDENTS — refonte et renommage

Renommer "Suivi individuel" ou "Incidents" en "Suivi des incidents" dans la sidebar directeur et superviseur.

Workflow de traitement :
- N'importe quel utilisateur connecté (éducateur, directeur, superviseur) peut signaler un incident via un bouton "Signaler un incident" accessible depuis le dashboard.
- À la création : statut automatique "En cours", timestamp enregistré.
- Si aucune action dans les 24h : statut passe automatiquement à "En retard", badge rouge sur le dashboard directeur ET superviseur.
- Le directeur peut : ajouter une note (ce qui passe le statut à "Planifié"), puis marquer comme résolu.
- Le superviseur peut : signaler uniquement. Il ne peut pas changer les statuts.

Statuts : En cours (bleu) / Planifié (orange) / En retard (rouge) / Résolu (vert).
Chaque incident a : titre, type (médical / comportement / scolaire / logistique / autre), description, signalé par, date, historique des notes.

---

4. MODULE ACTIVITÉS ÉDUCATEUR — ajout validation directeur

Dans le dashboard éducateur, quand un éducateur crée une activité :
- La créer avec statut "En attente de validation".
- Elle apparaît dans le dashboard directeur dans une section "Activités à valider" (même pattern que les demandes en attente).
- Le directeur peut valider ou refuser (avec motif obligatoire si refus).
- Une fois validée, l'activité passe en statut "Validée" dans le dashboard éducateur.

---

5. ÉDUCATEUR — demandes de congé et absences

Ajouter dans le dashboard éducateur une section "Mes demandes" avec :
- Bouton "Demande de congé" : formulaire avec dates, motif, pièce jointe optionnelle (simulée).
- Bouton "Justifier une absence" : formulaire avec date, motif, certificat médical (upload simulé).
Ces demandes arrivent dans le dashboard directeur pour validation, même pattern que les activités.

---

6. RAPPORTS — clarification des rôles

Dans /app/reports :
- Directeur : peut charger et consulter des rapports. Bouton "Charger un rapport" visible.
- Superviseur : peut consulter et télécharger uniquement. Supprimer le bouton "Charger un rapport" pour ce rôle. Garder uniquement téléchargement.
- CA : peut consulter et télécharger uniquement. Même traitement que superviseur.

Ajouter un champ "Date du rapport" dans le formulaire "Charger un rapport" (date picker, obligatoire).

---

7. DASHBOARD SUPERVISEUR — vue économique

Ajouter dans le dashboard superviseur un bloc "Vue économique" avec :
- Budget alloué (fictif), Budget consommé, Budget restant — même style que les KPIs directeur.
- Bouton "Demander des fonds" (directeur uniquement) qui envoie une demande au superviseur — à implémenter aussi côté directeur.
Le superviseur peut valider ou refuser la demande de fonds avec note.

---

8. CORRECTIONS RÉSIDUELLES

a) Dashboard directeur — présences
Le widget "Présences aujourd'hui" doit afficher les présences/absences du personnel (éducateurs, dames de charge), pas des enfants. Les absences enfants sont exceptionnelles. Renommer le widget "Présences équipe aujourd'hui".

b) CA — rapports
Les tâches de type "Rapport mensuel à préparer" dans le dashboard CA doivent être supprimées. Le CA ne prépare pas de rapports, il consulte uniquement. Remplacer par "Rapport mensuel disponible" avec lien vers /app/reports.

c) Sidebar sticky bouton enfants
Corriger l'espace résiduel du bouton sticky "Ajouter un enfant" dans /app/children lors du scroll (padding compensatoire ou top ajusté).

---

RÈGLES GÉNÉRALES

- Ne pas modifier ce qui n'est pas listé.
- Tester desktop ET mobile pour chaque point.
- Rapport final : fichiers touchés, comportements avant/après, points non traités avec justification.
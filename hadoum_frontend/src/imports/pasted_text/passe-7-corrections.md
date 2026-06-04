PASSE 7 — Corrections post-audit visuel + améliorations équipe

Rapport détaillé obligatoire en fin de passe.

---

1. FICHE ENFANT — checklist documents dans le formulaire de création

Problème : la checklist des documents requis n'est accessible que depuis la fiche existante,
pas lors de la création. Le formulaire multi-étapes ne permet pas de tout remplir en une fois.

Corrections :
- Ajouter une étape "Documents" dans le formulaire multi-étapes de création d'un enfant.
  Cette étape arrive en avant-dernière position, juste avant le récapitulatif.
  Elle contient la checklist des 8 documents : Acte de naissance, Acte de décès parent(s),
  Pièce d'identité tuteur légal, Accord AEMO, Carnet de santé,
  Certificat de prise en charge, Photo.
- Chaque document a une case à cocher "Reçu" et un bouton d'upload simulé "Joindre".
- Cette même checklist doit rester accessible et modifiable dans l'onglet Identité
  de la fiche CRM une fois l'enfant créé.
- Le badge "Dossier incomplet" reste dérivé de la checklist dans les deux contextes.

---

2. ÉQUIPE — couleurs par fonction sur les cartes

Problème : la couleur de fonction est appliquée sur la photo/avatar avec les initiales.
Elle devrait être appliquée sur le fond de la carte entière.

Correction :
- Retirer la couleur de fond de l'avatar/initiales.
- Appliquer une couleur de fond subtile (opacity 8-10%) sur toute la carte membre,
  dérivée de la couleur de fonction.
- Bordure gauche de la carte (2px) dans la couleur de fonction pleine.
- Conserver les couleurs existantes : éducateur = vert, dame de charge = bleu,
  comptable = orange, direction = violet. Vérifier que chaque fonction a une couleur assignée,
  y compris les fonctions non encore définies (fallback = gris neutre).
- Appliquer sur les 3 onglets (Équipe active, Candidats, Anciens membres).

---

3. ÉQUIPE — bouton "Réintégrer" sur les anciens membres

Problème : il n'existe pas de moyen de réintégrer un ancien membre dans l'équipe active.

Correction :
- Ajouter un bouton "Réintégrer" sur chaque ligne des anciens membres.
- Au clic : modale de confirmation avec champs :
  Nouveau poste (pré-rempli avec l'ancien poste, modifiable),
  Date de réintégration (date picker, obligatoire),
  Note optionnelle.
- À la validation : le membre passe dans l'onglet "Équipe active" avec le statut "Présent"
  et une date d'entrée mise à jour. Il disparaît des anciens membres.

---

4. ÉQUIPE — ajout CV dans la fiche candidat

Problème : il n'est pas possible d'ajouter un CV en pièce jointe sur un candidat.

Correction :
- Dans la modale "Ajouter un candidat" et dans la modale d'édition d'un candidat existant,
  ajouter un champ upload "CV (PDF)" simulé.
- Afficher dans la liste des candidats une icône 📎 si un CV a été joint,
  grisée si aucun CV n'est présent.
- Au clic sur l'icône CV dans la liste : afficher un toast "Ouverture du CV en cours..."
  (simulation, 2 secondes).

---

5. PRÉSENCES ÉQUIPE — logique alerte directeur

Problème actuel : "Valider les présences" concerne les enfants.
Objectif : comparer le statut déclaré par chaque membre (présent / absent / congé)
avec une présence saisie manuellement, et alerter le directeur en cas d'écart.

Corrections :
- Dans /app/attendance, renommer la page "Présences équipe".
- Afficher la liste des membres de l'équipe active avec deux colonnes :
  "Statut déclaré" (présent / absent / congé — tiré du profil membre)
  et "Présence confirmée" (case à cocher manuelle, saisie par le directeur chaque matin).
- Si un membre a le statut "Présent" mais que la case "Présence confirmée" n'est pas cochée
  après 9h00 (simulé : après chargement de la page), afficher une alerte orange
  "Présence non confirmée" sur sa ligne.
- Si un membre a le statut "Absent" ou "Congé" mais que la case est cochée,
  afficher une alerte rouge "Incohérence de présence" sur sa ligne.
- Ces alertes remontent dans le dashboard directeur dans le widget
  "Présences équipe aujourd'hui" avec un badge rouge indiquant le nombre d'incohérences.

---

6. NOTIFICATIONS — refonte de l'affichage

Problème : les notifications s'affichent toujours avec le badge "+N" au lieu des flèches
de navigation. L'overlay n'est pas pleine largeur sur mobile.

Corrections à appliquer sur desktop ET mobile :
- Supprimer définitivement le badge "+N".
- Dans le panneau notifications (Topbar.tsx), afficher une notification à la fois.
- Ajouter des chevrons gauche/droite (←/→) pour naviguer entre les notifications.
  Style : 24px, couleur secondaire, discrets mais cliquables.
- Afficher un indicateur de position : "2 / 4" en texte xs entre les deux chevrons.
- Conserver la croix de fermeture individuelle sur chaque notification.
- Sur mobile : le panneau doit être fixed, left: 0, right: 0, pleine largeur,
  sans espace latéral. Tester sur 375px et 390px.
- Quand toutes les notifications sont fermées, le panneau se ferme automatiquement.

---

RÈGLES GÉNÉRALES

- Ne pas modifier ce qui n'est pas listé.
- Tester desktop ET mobile pour chaque point.
- Rapport final : fichiers touchés, comportements avant/après, points non traités avec justification.
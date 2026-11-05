# NEXT_SESSION — prompt et instructions pour la prochaine session

Copiez le bloc ci-dessous au début d'une nouvelle session Claude Code (une session par phase).

---

```
Projet Calque (dépôt 06quentin03-pixel/Calque), phase 7 : chantier et variantes.
Travaille uniquement sur la branche claude/layer-modification-prompt-feasibility-nw7oa4 :
fais un git fetch, puis un checkout de cette branche. Ne touche jamais à main (c'est moi qui fusionne,
sauf si je te demande explicitement de fusionner la demande de fusion).

Avant toute modification :
1. Lis CLAUDE.md, PROJECT_STATE.md, TECHNICAL_DECISIONS.md, NEXT_SESSION.md, ROADMAP.md, PROGRESS.md,
   CHANGELOG.md et docs/ARCHITECTURE.md, et respecte toutes les règles de CLAUDE.md.
2. Vérifie que la branche contient tout main (la demande n°5, phase 6, doit avoir été fusionnée).
   Si elle est en retard, remets-la au niveau de main avant de commencer.
3. Lance node --test tests/*.test.mjs : tout doit réussir (89/89 à la fin de la phase 6).
4. Vérifie l'état réel du code (js/stockage.js : IndexedDB, versions, migrations, format v8 ; js/historique.js :
   annuler/rétablir ; js/interaction.js : Apple Pencil ; js/documents.js et js/regles.js : dossier PDF et
   moteur de règles), puis dis-moi en quelques lignes où on en est.

Ensuite, fais la phase 7 de ROADMAP.md, dans l'ordre :
- mode chantier : plan simplifié lisible sur l'iPad, annotations au Pencil, photos localisées sur le plan
  (stockées dans IndexedDB, hors ligne, sans alourdir le plan ni l'annuler/rétablir), cases « posé »
  par appareil et par circuit, réserves (avec statut et date), historique ; export des réserves et de
  l'avancement dans le dossier PDF (moteur documentaire de la phase 6) ;
- variantes : économique, standard, haut de gamme…, avec comparaison (matériel, puissance, éclairage,
  contrôles du moteur de règles) et choix de la version principale, sans jamais perdre une variante.

Contraintes : celles de CLAUDE.md (données vérifiée/saisie/estimée, trois statuts, jamais de conformité globale
si tout n'est pas vérifié, extraits Legrand seuls, migration PLAN_VERSION/MIGRATIONS avec test et copie de
sécurité, CORE de sw.js + nouveau nom de cache, iPad paysage/portrait et Pencil, tests et captures hors du dépôt).
Les tableaux NF C 15-100 absents du guide Legrand fourni restent reportés en phase 8 : ne pas les redemander avant.
Les photos doivent rester sur l'iPad (aucun envoi en ligne) et figurer dans la sauvegarde complète.

À la fin de chaque étape : mets à jour PROJECT_STATE.md, PROGRESS.md, CHANGELOG.md, ROADMAP.md
(et TECHNICAL_DECISIONS.md si une décision est prise), commit explicite, push sur la branche.
À la fin de la phase : réécris NEXT_SESSION.md pour la phase 8, prépare une nouvelle demande de fusion
vers main et donne-moi la liste des tests à faire sur l'iPad : uniquement ce que tu ne peux pas tester
toi-même (Safari sur iPad, Pencil, appareil photo, clavier, appli installée, mode avion, lisibilité),
pas ce que tes tests automatiques vérifient déjà.
Explique-moi tout simplement, en français : je débute sur GitHub et j'utilise un iPad.
```

---

## À faire avant ou pendant la prochaine session
1. **Demande de fusion n°5 (phase 6)** : préparée le 5 novembre 2026, **à fusionner par l'utilisateur** dans `main`.
2. **Essais iPad de la phase 6** (par l'utilisateur), en paysage et en portrait — seulement ce que les tests automatiques ne couvrent pas :
   1. L'appli installée se met à jour (bandeau « nouvelle version », ou fermer et rouvrir) ; les plans existants sont là.
   2. Ouvrir un ancien plan, puis Menu › Historique des versions : une ligne « Copie de sécurité avant mise à jour du format (v7 → v8) » est visible.
   3. Menu › « Dossier PDF » : la fenêtre se lit bien en portrait ; remplir le cartouche au clavier de l'iPad (touche « OK ») ; toucher les chapitres au doigt et au Pencil.
   4. Écrire l'objet de l'indice, « Enregistrer l'indice A », puis « Préparer le PDF » sur votre plan le plus gros : temps d'attente acceptable ?
   5. « Partager… » : la feuille de partage de l'iPad s'ouvre ; enregistrer dans Fichiers, puis ouvrir le PDF dans Fichiers (ou Aperçu) : toutes les pages s'affichent, les accents sont justes, le texte est net en zoomant.
   6. Lisibilité du PDF sur l'écran de l'iPad : cartouche, plans (échelle 1:50 ou 1:100 indiquée), schéma unifilaire, tableaux, mentions « Estimée » et « Manquante ».
   7. Impression (si vous avez une imprimante AirPrint) : un plan imprimé à 100 % mesure juste à la règle (1 cm = 1 m au 1:100).
   8. Tableau électrique › onglet « Contrôle NF C 15-100 » : lecture en portrait, filtre « Non conformes / À vérifier / Conformes », dépliage de « Règle, source et données » au doigt, bouton « Voir » qui montre l'objet sur le plan.
   9. Mode avion : refaire les points 3 à 5 (préparation et enregistrement du PDF sans réseau).
3. **Essais iPad de la phase 4** : toujours à faire (outil Conduit › Gaine élec, passage entre étages, zone interdite, itinéraire proposé, onglet Cheminements, longueur de la fiche).
4. Essais iPad des phases 3 et 5 : **validés** par l'utilisateur le 5 novembre 2026.
5. **Extraits Legrand manquants** : **reportés à la toute fin (phase 8)**, décision de l'utilisateur du 4 novembre 2026
   (documents payants). Ne pas les redemander avant la phase 8. En attendant, ce qui n'est pas dans le guide « Points clés »
   (Iz, modes de pose, facteurs de correction, chutes de tension maximales, constantes ρ et λ, simultanéité, remplissage
   des conduits) reste « vérification nécessaire », sans valeur inventée. Aucun éclairement réglementaire n'est fourni non plus.
6. Phase 8 : rattacher les règles « de Calque » (`cq_…`, `js/regles.js`) aux pages des extraits Legrand, pour qu'elles puissent devenir « conformes ».
7. Décision à prendre plus tard : afficher en triphasé le bon disjoncteur d'abonné (aujourd'hui, celui du monophasé).

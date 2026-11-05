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
2. Vérifie que la branche contient tout main (la demande n°5, phase 6 et nouveau plan d'exemple, a été fusionnée le 5 novembre 2026).
   Si elle est en retard, remets-la au niveau de main avant de commencer.
3. Lance node --test tests/*.test.mjs : tout doit réussir (90/90 à la fin de la phase 6).
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
Toujours ajouter chaque nouvelle fonctionnalité au plan d'exemple (js/exemple.js, « Exemple : maison et atelier ») :
par exemple des annotations, des réserves, des cases « posé » et une ou deux variantes, avec des valeurs d'exemple
marquées comme telles (pas de photo inventée : une case « photo à prendre » suffit), et compléter tests/exemple.test.mjs.

À la fin de chaque étape : mets à jour PROJECT_STATE.md, PROGRESS.md, CHANGELOG.md, ROADMAP.md
(et TECHNICAL_DECISIONS.md si une décision est prise), commit explicite, push sur la branche.
À la fin de la phase : réécris NEXT_SESSION.md pour la phase 8, prépare une nouvelle demande de fusion
vers main et donne-moi la liste des tests à faire sur l'iPad : uniquement ce que tu ne peux pas tester
toi-même (Safari sur iPad, Pencil, appareil photo, clavier, appli installée, mode avion, lisibilité),
pas ce que tes tests automatiques vérifient déjà, en t'appuyant sur le plan d'exemple.
Explique-moi tout simplement, en français : je débute sur GitHub et j'utilise un iPad.
```

---

## À faire avant ou pendant la prochaine session
1. **Demande de fusion n°5 (phase 6 + nouveau plan d'exemple)** : **fusionnée** dans `main` le 5 novembre 2026, à la demande de l'utilisateur.
2. **Essais iPad de la phase 6 : validés** par l'utilisateur le 5 novembre 2026. Liste effectuée, en paysage et en portrait, sur le plan d'exemple (Menu › Ouvrir le plan d'exemple) — seulement ce que les tests automatiques ne couvrent pas :
   1. L'appli installée se met à jour (bandeau « nouvelle version », ou fermer et rouvrir) ; vos plans sont toujours là.
   2. Ouvrir un de vos anciens plans, puis Menu › Historique des versions : une ligne « Copie de sécurité avant mise à jour du format (v7 → v8) » est visible.
   3. Menu › Ouvrir le plan d'exemple : « Exemple : maison et atelier » s'ouvre ; déplacer et zoomer au doigt et au Pencil sur tout le plan : c'est fluide ? L'atelier est lisible (chemins de câbles, goulotte, réglettes, machines) ?
   4. Changer de niveau (« Étage ») : la mezzanine de bureaux est là ; le passage entre étages se touche et montre son jumeau.
   5. Vue 3D de l'exemple : tourner autour de l'atelier, option « Câbles », coupe horizontale : c'est fluide sur l'iPad ?
   6. Menu › Dossier PDF : la fenêtre se lit bien en portrait ; le cartouche est déjà rempli (client fictif, indice A) ; modifier un champ au clavier de l'iPad (touche « OK ») ; toucher les chapitres au doigt et au Pencil.
   7. « Enregistrer l'indice B » avec un objet, puis « Préparer le PDF » (environ 60 pages, dont une quarantaine pour le rapport de contrôle) : temps d'attente acceptable ?
   8. « Partager… » › Enregistrer dans Fichiers, puis ouvrir le PDF : toutes les pages s'affichent, accents justes, texte net en zoomant ; le cartouche montre l'indice B.
   9. Lisibilité du PDF sur l'iPad : plans (échelle indiquée), schéma unifilaire, tableaux, mentions « Estimée » et « Manquante », rapport de contrôle.
   10. Impression (si vous avez une imprimante AirPrint) : un plan imprimé à 100 % mesure juste à la règle (au 1:100, 1 cm = 1 m).
   11. Tableau électrique › onglet « Contrôle NF C 15-100 » : lecture en portrait, filtres, dépliage de « Règle, source et données » au doigt, bouton « Voir » qui montre l'objet sur le plan.
   12. Mode avion : refaire les points 3, 6 et 7 (préparation et enregistrement du PDF sans réseau).
3. Essais iPad des phases 3, 4, 5 et 6 : **validés** par l'utilisateur le 5 novembre 2026.
4. **Extraits Legrand manquants** : **reportés à la toute fin (phase 8)**, décision de l'utilisateur du 4 novembre 2026
   (documents payants). Ne pas les redemander avant la phase 8. En attendant, ce qui n'est pas dans le guide « Points clés »
   (Iz, modes de pose, facteurs de correction, chutes de tension maximales, constantes ρ et λ, simultanéité, remplissage
   des conduits) reste « vérification nécessaire », sans valeur inventée. Aucun éclairement réglementaire n'est fourni non plus.
5. Phase 8 : rattacher les règles « de Calque » (`cq_…`, `js/regles.js`) aux pages des extraits Legrand, pour qu'elles puissent devenir « conformes ».
6. Décision à prendre plus tard : afficher en triphasé le bon disjoncteur d'abonné (aujourd'hui, celui du monophasé ; visible dans l'exemple, installation triphasée 36 kVA).
7. Règle permanente (CLAUDE.md, n° 12) : chaque nouvelle fonctionnalité est ajoutée au plan d'exemple.

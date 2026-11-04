# NEXT_SESSION — prompt et instructions pour la prochaine session

Copiez le bloc ci-dessous au début d'une nouvelle session Claude Code (une session par phase).

---

```
Projet Calque (dépôt 06quentin03-pixel/Calque), phase 5 : éclairage et 3D avancée.
Travaille uniquement sur la branche claude/layer-modification-prompt-feasibility-nw7oa4 :
fais un git fetch, puis un checkout de cette branche. Ne touche jamais à main (c'est moi qui fusionne,
sauf si je te demande explicitement de fusionner la demande de fusion).

Avant toute modification :
1. Lis CLAUDE.md, PROJECT_STATE.md, TECHNICAL_DECISIONS.md, NEXT_SESSION.md, ROADMAP.md, PROGRESS.md,
   CHANGELOG.md et docs/ARCHITECTURE.md, et respecte toutes les règles de CLAUDE.md.
2. Vérifie que la branche contient tout main (la demande n°3, phase 4, doit avoir été fusionnée).
   Si elle est en retard, remets-la au niveau de main avant de commencer.
3. Lance node --test tests/*.test.mjs : tout doit réussir (68/68 à la fin de la phase 4).
4. Vérifie l'état réel du code (js/vue3d.js : maquette 3D et gaines ; js/cheminement.js : pose et hauteurs ;
   js/symboles.js : luminaires), puis dis-moi en quelques lignes où on en est.

Ensuite, fais la phase 5 de ROADMAP.md, dans l'ordre :
- concepteur d'éclairage par la méthode des lumens, présenté comme une estimation : 3 propositions,
  implantation modifiable ; aucune valeur d'éclairement réglementaire inventée (source obligatoire, sinon « saisie » ou « estimée ») ;
- lecture des fichiers IES/LDT (flux, puissance), sans bibliothèque externe, hors ligne ;
- 3D : câbles et chemins de câbles (en partant des gaines de la phase 4 : type, pose, verticales, passages entre étages),
  coupes, transparence, masquage, modification depuis la 3D.

Contraintes : celles de CLAUDE.md (données vérifiée/saisie/estimée, trois statuts, extraits Legrand seuls,
migration PLAN_VERSION/MIGRATIONS avec test et copie de sécurité, CORE de sw.js + nouveau nom de cache,
iPad paysage/portrait et Pencil, fluidité de la 3D sur iPad, tests et captures hors du dépôt).
Les tableaux NF C 15-100 absents du guide Legrand fourni restent reportés en phase 8 : ne pas les redemander avant.

À la fin de chaque étape : mets à jour PROJECT_STATE.md, PROGRESS.md, CHANGELOG.md, ROADMAP.md
(et TECHNICAL_DECISIONS.md si une décision est prise), commit explicite, push sur la branche.
À la fin de la phase : réécris NEXT_SESSION.md pour la phase 6, prépare une nouvelle demande de fusion
vers main et donne-moi la liste des tests à faire sur l'iPad : uniquement ce que tu ne peux pas tester
toi-même (Safari sur iPad, Pencil, clavier, appli installée, mode avion, lisibilité), pas ce que tes tests
automatiques vérifient déjà.
Explique-moi tout simplement, en français : je débute sur GitHub et j'utilise un iPad.
```

---

## À faire avant ou pendant la prochaine session
1. **Fusionner la demande n°3** (phase 4) dans `main`, si les essais ci-dessous vont bien.
2. **Essais iPad de la phase 4** (par l'utilisateur), en paysage et en portrait — seulement ce que les tests automatiques ne couvrent pas :
   1. L'appli installée se met à jour (bandeau « nouvelle version », ou fermer et rouvrir) ; les plans existants sont là.
   2. Ouvrir un ancien plan, puis Menu › Historique des versions : une ligne « Copie de sécurité avant mise à jour du format (v5 → v6) » est visible et se restaure.
   3. Outil Conduit › Gaine élec : les boutons ICTA / IRL / Goulotte / Chemin de câbles et les diamètres tiennent dans la barre, en portrait comme en paysage.
   4. Tracer une gaine au Pencil, puis dans l'inspecteur : type, pose, largeur et hauteur d'une goulotte au clavier de l'iPad (pavé numérique, touche « OK »).
   5. Poser un « Passage entre étages » (Électricité › Tableau & énergie), le relier à l'étage, « Voir l'autre côté ».
   6. Bouton « Zone interdite » : toucher les angles au Pencil ; le doigt déplace toujours le plan ; fermer en touchant le premier angle.
   7. Sur une prise pas encore raccordée : « Proposer un itinéraire » → l'aperçu orange est bien visible → « Créer la gaine » → déplacer un coude au Pencil.
   8. Vue 3D : une gaine « au sol » est en bas, une gaine « au plafond » en haut, avec les descentes vers les appareils.
   9. Tableau électrique › Cheminements : lisibilité ; faire défiler les tableaux au doigt en portrait ; saisir la réserve ; bouton « Voir » d'un conflit.
   10. Fiche de calcul : la longueur « mesurée sur le plan » s'affiche ; saisir le diamètre du câble au clavier.
   11. Mode avion : refaire les points 7 et 9.
3. **Essais iPad de la phase 3** (toujours à faire s'ils n'ont pas été faits) : voir l'historique de ce fichier dans GitHub (version de fin de phase 3) ou `PROGRESS.md`.
4. **Extraits Legrand manquants** : **reportés à la toute fin (phase 8)**, décision de l'utilisateur du 4 novembre 2026
   (documents payants). Ne pas les redemander avant la phase 8. En attendant, ce qui n'est pas dans le guide « Points clés »
   (Iz, modes de pose, facteurs de correction, chutes de tension maximales, constantes ρ et λ, simultanéité, remplissage
   des conduits) reste « vérification nécessaire », sans valeur inventée.
5. Décision à prendre plus tard : afficher en triphasé le bon disjoncteur d'abonné (aujourd'hui, celui du monophasé).

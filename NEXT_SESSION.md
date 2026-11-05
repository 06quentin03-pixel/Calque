# NEXT_SESSION — prompt et instructions pour la prochaine session

Copiez le bloc ci-dessous au début d'une nouvelle session Claude Code (une session par phase).

---

```
Projet Calque (dépôt 06quentin03-pixel/Calque), phase 6 : documents et moteur de règles.
Travaille uniquement sur la branche claude/layer-modification-prompt-feasibility-nw7oa4 :
fais un git fetch, puis un checkout de cette branche. Ne touche jamais à main (c'est moi qui fusionne,
sauf si je te demande explicitement de fusionner la demande de fusion).

Avant toute modification :
1. Lis CLAUDE.md, PROJECT_STATE.md, TECHNICAL_DECISIONS.md, NEXT_SESSION.md, ROADMAP.md, PROGRESS.md,
   CHANGELOG.md et docs/ARCHITECTURE.md, et respecte toutes les règles de CLAUDE.md.
2. Vérifie que la branche contient tout main (la demande n°4, phase 5, a été fusionnée le 5 novembre 2026).
   Si elle est en retard, remets-la au niveau de main avant de commencer.
3. Lance node --test tests/*.test.mjs : tout doit réussir (77/77 à la fin de la phase 5).
4. Vérifie l'état réel du code (js/export.js : PDF intégré ; js/tableau.js : schéma unifilaire ;
   js/metres.js et js/materiel.js : métrés et matériel ; js/calcul.js, js/fiche.js et js/normes.js :
   contrôles à trois statuts ; js/eclairage.js : études d'éclairage), puis dis-moi en quelques lignes où on en est.

Ensuite, fais la phase 6 de ROADMAP.md, dans l'ordre :
- moteur documentaire : plans techniques, schéma unifilaire, nomenclatures, métrés (cheminements, matériel),
  études d'éclairage, rapports, dossier complet en PDF avec cartouche et indice de révision ; en partant du PDF
  intégré existant (export.js), sans bibliothèque externe, hors ligne ;
- moteur de règles versionnées (JavaScript pur, sans accès à l'écran, testé avec Node) : édition, source et
  édition de la norme, trois statuts (conforme / non conforme / vérification nécessaire), données utilisées et
  manquantes ; il reprend les contrôles existants (nfcChecks, contrôles de calcul.js) sans en perdre aucun.

Contraintes : celles de CLAUDE.md (données vérifiée/saisie/estimée, trois statuts, jamais de conformité globale
si tout n'est pas vérifié, extraits Legrand seuls, migration PLAN_VERSION/MIGRATIONS avec test et copie de
sécurité, CORE de sw.js + nouveau nom de cache, iPad paysage/portrait et Pencil, tests et captures hors du dépôt).
Les tableaux NF C 15-100 absents du guide Legrand fourni restent reportés en phase 8 : ne pas les redemander avant.
Les documents produits doivent afficher clairement ce qui est « estimé » (longueurs, matériel, éclairage).

À la fin de chaque étape : mets à jour PROJECT_STATE.md, PROGRESS.md, CHANGELOG.md, ROADMAP.md
(et TECHNICAL_DECISIONS.md si une décision est prise), commit explicite, push sur la branche.
À la fin de la phase : réécris NEXT_SESSION.md pour la phase 7, prépare une nouvelle demande de fusion
vers main et donne-moi la liste des tests à faire sur l'iPad : uniquement ce que tu ne peux pas tester
toi-même (Safari sur iPad, Pencil, clavier, appli installée, mode avion, lisibilité), pas ce que tes tests
automatiques vérifient déjà.
Explique-moi tout simplement, en français : je débute sur GitHub et j'utilise un iPad.
```

---

## À faire avant ou pendant la prochaine session
1. **Demande de fusion n°4 (phase 5)** : **fusionnée** dans `main` le 5 novembre 2026, à la demande de l'utilisateur.
2. **Essais iPad de la phase 5** (par l'utilisateur), en paysage et en portrait — seulement ce que les tests automatiques ne couvrent pas :
   1. L'appli installée se met à jour (bandeau « nouvelle version », ou fermer et rouvrir) ; les plans existants sont là.
   2. Ouvrir un ancien plan, puis Menu › Historique des versions : une ligne « Copie de sécurité avant mise à jour du format (v6 → v7) » est visible et se restaure.
   3. Toucher une pièce › « Concevoir l'éclairage » : la fenêtre se lit bien ; saisir l'éclairement, le flux et la puissance au clavier de l'iPad (touche « OK ») ; les trois propositions et leur petit plan sont lisibles en portrait.
   4. « Implanter sur le plan », puis déplacer un luminaire au Pencil sur le plan : en rouvrant la fenêtre, « Implantation actuelle » a changé.
   5. « Importer un fichier IES / LDT » : l'app Fichiers s'ouvre ; choisir un vrai fichier .ies ou .ldt d'un fabricant (téléchargé sur son site) ; vérifier que le flux et la puissance correspondent à la fiche du fabricant, et que la courbe s'affiche.
   6. Vue 3D, option « Câbles » : les câbles se voient dans les gaines ; toucher un câble au doigt ouvre sa fiche.
   7. Vue 3D, « Coupe » : faire glisser le curseur au doigt et au Pencil ; c'est fluide sur votre plan le plus gros.
   8. Vue 3D, « Murs transparents » et « Masquer » / « Tout réafficher ».
   9. Vue 3D : toucher un plafonnier › « Déplacer » › le faire glisser au Pencil puis au doigt ; « Annuler » le remet en place.
   10. Vue 3D : modifier la pose d'une gaine et la hauteur d'une prise depuis la fiche 3D, au clavier de l'iPad.
   11. Mode avion : refaire les points 3, 5 (fichier déjà sur l'iPad) et 6.
3. **Essais iPad de la phase 4** : toujours à faire (liste de la session précédente : outil Conduit › Gaine élec, passage entre étages, zone interdite, itinéraire proposé, onglet Cheminements, longueur de la fiche).
4. Essais iPad de la phase 3 : **validés** par l'utilisateur le 5 novembre 2026.
5. **Extraits Legrand manquants** : **reportés à la toute fin (phase 8)**, décision de l'utilisateur du 4 novembre 2026
   (documents payants). Ne pas les redemander avant la phase 8. En attendant, ce qui n'est pas dans le guide « Points clés »
   (Iz, modes de pose, facteurs de correction, chutes de tension maximales, constantes ρ et λ, simultanéité, remplissage
   des conduits) reste « vérification nécessaire », sans valeur inventée. Aucun éclairement réglementaire n'est fourni non plus.
6. Décision à prendre plus tard : afficher en triphasé le bon disjoncteur d'abonné (aujourd'hui, celui du monophasé).

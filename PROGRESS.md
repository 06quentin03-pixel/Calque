# PROGRESS — état exact du développement

Dernière mise à jour : 4 novembre 2026 (phase 4 en cours, étape 1 terminée).

## Branche
- Nouvelle session par phase : consignes dans `NEXT_SESSION.md`, état dans `PROJECT_STATE.md`.
- Travail : `claude/layer-modification-prompt-feasibility-nw7oa4`.
- `main` (version utilisée au quotidien) : l'utilisateur a fusionné la demande n°1 (phases 0, 1a, 1b, 1c et phase 2). Il fusionne lui-même ; on ne modifie jamais `main` directement.
- Toute nouvelle fusion passe par une **nouvelle** demande de fusion (la n°1 est terminée).

## Phases terminées
- Phase 0 : audit.
- Phase 1a : protection des données.
- Phase 1c : performances et iPad.
- Phase 1b : architecture en modules natifs (accord de l'utilisateur donné le 4 novembre 2026).

## Tests réalisés (phase 1b)
Commande : `node --test tests/*.test.mjs`, **20/20 réussis** :
- `architecture.test.mjs` (6) : modules dans le cache hors ligne, modules sans écran utilisables par Node, événements (dont dans l'application : ouverture, modification, annuler, rétablir), redémarrage hors ligne, bandeau de mise à jour.
- `ipad.test.mjs` (7) et `stockage.test.mjs` (7) : inchangés et réussis sur le code découpé.

Contrôles complémentaires (scripts, hors dépôt) :
- Le contenu des modules a été comparé ligne à ligne au script d'origine. Seules différences : `ui` et `C` déplacés dans le noyau, et 30 réaffectations remplacées par `setP`/`setGEO`/`setRC`/`setDIMHIT`.
- Export PDF identique à l'octet près (21 993 octets) ; vues 3D et Tableau, catalogues, inspecteur et raccourcis clavier sans erreur.
- **Mise à jour simulée depuis la version actuelle de `main`** : l'ancien cache `calque-v3` est remplacé par `calque-v6`, le plan dessiné avec l'ancienne version est conservé, l'application marche ensuite hors ligne.

**Essais sur l'iPad de l'utilisateur : validés le 4 novembre 2026** (« tout marche »), selon la liste fournie :
- mise à jour et reprise des plans, hors ligne (mode avion) ;
- Apple Pencil (dessin, doigt qui déplace, paume, survol, réglage), fluidité, annuler/rétablir ;
- envoi par le menu de partage, sauvegarde complète, historique des versions, exports PDF et image ;
- barre du haut en paysage et en portrait.
- Reste à observer lors d'une prochaine mise à jour : le bandeau « nouvelle version disponible ».

## Phase 2 — dessin et bibliothèque (terminée, fusionnée dans `main`)
- ✅ Étape 1 : bibliothèque par domaines et sous-catégories (`js/bibliotheque.js`). 3 tests dans `tests/bibliotheque.test.mjs`. Captures vérifiées en 1180×820 et 820×1180.
- ✅ Étape 2 : bibliothèque technique générique, 110 articles, références de l'utilisateur, badge de fiabilité, format des plans v2 avec migration. 5 tests dans `tests/technique.test.mjs`. Tests : **28/28 réussis**.
  - Limite connue : les références saisies restent sur l'appareil ; un plan envoyé à quelqu'un d'autre garde le choix de l'article, mais pas votre référence.
- ✅ Étape 3 : composants personnalisés (`js/composants.js`), format des plans v3 avec migration. 4 tests dans `tests/composants.test.mjs`. Tests : **32/32 réussis**.
- ✅ Étape 4 : fond de plan (image ou PDF), format des plans v4 avec migration. 4 tests dans `tests/fond.test.mjs`. Tests : **36/36 réussis**.
  - Mesure (pire cas, photo de 10,8 Mo) : un réglage enregistré en 14 ms, dessin en 1,5 ms ; l'annulation ne recopie pas l'image.
  - Non vérifiable ici : lecture d'un PDF par Safari sur iPad (Chromium ne lit pas les PDF comme images ; le message d'explication est testé).
- ⏸ Étape 5 : import des catalogues fabricants. **Préparé** (`js/catalogue.js`, 4 tests dans `tests/catalogue.test.mjs`), vérifié aussi sur un .xlsx produit par un autre logiciel. Tests : **40/40 réussis**.
  - **Mis de côté par l'utilisateur** (4 novembre 2026). Le module reste dans le dépôt, inactif, pour une reprise éventuelle.

À vérifier sur l'iPad : ouvrir la bibliothèque au doigt et au Pencil, en paysage et en portrait.

## Phase 3 — électricité et calculs (terminée, à vérifier sur iPad)
- ✅ Étape 1 : moteur de calcul sans écran (`js/calcul.js`), emplacement des tableaux NF C 15-100 (`js/normes.js`), partie sans écran d'`electricite.js` sortie dans `js/elecdonnees.js`. 13 tests dans `tests/calcul.test.mjs`. Tests : **53/53 réussis**.
  - Contrôle de non-régression : circuits, différentiels, coffret et contrôles NF C 15-100 générés sur le plan d'exemple **identiques** avant et après (script hors dépôt).
  - Tous les tableaux NF C 15-100 sont « manquants » : en attente des extraits Legrand de l'utilisateur.
- ✅ Étape 2 : fiche de calcul d'un circuit (`js/fiche.js`), ouverte depuis l'inspecteur du plan et depuis le tableau ; réglage « Réseau » de l'installation ; format des plans v5 avec migration. 3 tests dans `tests/fiche.test.mjs`. Tests : **56/56 réussis**.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844 (fiche entièrement visible, boutons de 44 px).
- ✅ Étape 3 : onglet « Bilan » du tableau (bilan de puissance, coefficient ks, tableau des circuits, équilibrage des phases avec répartition proposée, liste des tableaux Legrand attendus). 1 test de plus dans `tests/fiche.test.mjs`. Tests : **57/57 réussis**.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844 ; correction du débordement horizontal de la barre d'onglets sur téléphone.
- ✅ Étape 4 : extrait Legrand « Points clés » (révision 23 août 2024) reçu ; 2 tableaux recopiés (sections/calibres par circuit et chauffage ; différentiels) et contrôles ajoutés ; sèche-linge et pompe à chaleur en type A. Fichiers `PROJECT_STATE.md`, `TECHNICAL_DECISIONS.md`, `NEXT_SESSION.md`. Tests : **59/59 réussis**.
- ⏸ Tableaux absents de l'extrait (Iz, modes de pose, facteurs de correction, chutes de tension maxi, ρ et λ, simultanéité) : **reportés en phase 8** par l'utilisateur le 4 novembre 2026 (documents payants). Les contrôles In ≤ Iz et chute de tension restent « vérification nécessaire » ; textes « à fournir » retirés de l'interface.

## Phase 4 — cheminements et métrés (en cours)
- ✅ Étape 1 : cheminements (types ICTA, IRL, goulotte, chemin de câbles ; pose sol / plafond / hauteur ; verticales ; autres circuits ; passages entre étages), module `js/cheminement.js`, format des plans v6 avec migration et copie de sécurité avant mise à jour du format. 3 tests dans `tests/cheminement.test.mjs`. Tests : **62/62 réussis**.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844 (pas de débordement ; choix du type en pastilles pour tenir dans l'inspecteur).

## Tâche en cours
- Phase 4, étape 2 : longueurs (géométrique, de cheminement, à commander) et longueur L de la fiche de calcul.

## Essais sur l'iPad (phase 2)
**Validés par l'utilisateur le 4 novembre 2026** (« tout marche ») : mise à jour et reprise des plans, bibliothèque au doigt et au Pencil, bibliothèque technique, composants personnalisés (mode avion compris), fond de plan (photo, image, PDF dans Safari, mise à l'échelle par 2 points), sauvegarde complète.

## Points d'attention
- Test `ipad.test.mjs` « rendu limité à la zone visible… » : **un échec intermittent** observé une fois (90 pixels différents sur la première vue) lors d'une suite complète, puis réussi 4 fois seul et à la suite complète suivante. Le rendu du plan n'a pas été modifié en phase 3 ; cause probable : chargement des polices. À surveiller.
- Un plan enregistré en v5 puis rouvert avec l'ancienne version de `main` affiche « vient d'une version plus récente » ; ses données restent dans le fichier.
- Format des plans passé de v1 à v5 (migrations testées). Un plan enregistré avec cette version, rouvert avec l'ancienne version de `main`, affiche « vient d'une version plus récente » ; les données restent dans le fichier.
- Un fond de plan alourdit le plan (environ 1 à 3 Mo pour un plan scanné) et chaque copie de l'historique des versions.

## Prochaine action prévue
- Phase 4 : cheminements et métrés (la longueur des câbles alimentera la fiche de calcul).

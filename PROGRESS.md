# PROGRESS — état exact du développement

Dernière mise à jour : 4 novembre 2026.

## Branche
- Travail : `claude/layer-modification-prompt-feasibility-nw7oa4`.
- `main` (version utilisée au quotidien) : **non modifiée**. L'utilisateur fusionne lui-même (procédure expliquée : Pull requests > New pull request > base main ← branche de travail > Merge).

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

À vérifier sur l'iPad (Safari et Apple Pencil réels indisponibles ici) :
- Phase 1b : démarrage après la mise à jour, puis hors ligne (mode avion).
- Phase 1c : dessin au Pencil, déplacement au doigt, paume, survol, fluidité d'un gros plan.
- Phase 1a : bouton « Envoyer… », reprise des plans existants.

## Phase 2 — dessin et bibliothèque (en cours)
- ✅ Étape 1 : bibliothèque par domaines et sous-catégories (`js/bibliotheque.js`). 3 tests dans `tests/bibliotheque.test.mjs`. Captures vérifiées en 1180×820 et 820×1180.
- ✅ Étape 2 : bibliothèque technique générique, 110 articles, références de l'utilisateur, badge de fiabilité, format des plans v2 avec migration. 5 tests dans `tests/technique.test.mjs`. Tests : **28/28 réussis**.
  - Limite connue : les références saisies restent sur l'appareil ; un plan envoyé à quelqu'un d'autre garde le choix de l'article, mais pas votre référence.
- ✅ Étape 3 : composants personnalisés (`js/composants.js`), format des plans v3 avec migration. 4 tests dans `tests/composants.test.mjs`. Tests : **32/32 réussis**.
- ✅ Étape 4 : fond de plan (image ou PDF), format des plans v4 avec migration. 4 tests dans `tests/fond.test.mjs`. Tests : **36/36 réussis**.
  - Mesure (pire cas, photo de 10,8 Mo) : un réglage enregistré en 14 ms, dessin en 1,5 ms ; l'annulation ne recopie pas l'image.
  - Non vérifiable ici : lecture d'un PDF par Safari sur iPad (Chromium ne lit pas les PDF comme images ; le message d'explication est testé).
- ⏸ Étape 5 : import des catalogues fabricants. **Préparé** (`js/catalogue.js`, 4 tests dans `tests/catalogue.test.mjs`), vérifié aussi sur un .xlsx produit par un autre logiciel. Tests : **40/40 réussis**.
  - En attente des fichiers de l'utilisateur : un extrait de catalogue (CSV, Excel ou FAB-DIS) par fabricant utilisé, pour régler les colonnes, choisir l'enregistrement selon le volume, puis faire l'écran d'import.

À vérifier sur l'iPad : ouvrir la bibliothèque au doigt et au Pencil, en paysage et en portrait.

## Tâche en cours
- Aucune. Phase 2 terminée, sauf l'import des catalogues (en attente des fichiers).

## À vérifier sur l'iPad (phase 2)
- Bibliothèque au doigt et au Pencil, paysage et portrait.
- Bibliothèque technique : saisie d'une référence, puis fermeture et réouverture de l'application.
- Composants : création, pose, mode avion.
- Fond de plan : photo prise avec l'iPad, image, et **PDF** (lecture par Safari non testable ici) ; mise à l'échelle par 2 points au Pencil.

## Points d'attention
- Format des plans passé de v1 à v4 (migrations testées). Un plan enregistré avec cette version, rouvert avec l'ancienne version de `main`, affiche « vient d'une version plus récente » ; les données restent dans le fichier.
- Un fond de plan alourdit le plan (environ 1 à 3 Mo pour un plan scanné) et chaque copie de l'historique des versions.

## Prochaine action prévue
- Fusion par l'utilisateur, essais sur iPad, puis réception des catalogues fabricants, ou phase 3 (moteur de calcul).

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
- ⬜ Étape 3 : composants personnalisés.
- ⬜ Étape 4 : fond de plan (image ou PDF).
- ⏸ Étape 5 : import des catalogues fabricants (préparation seulement, en attente des fichiers).

À vérifier sur l'iPad : ouvrir la bibliothèque au doigt et au Pencil, en paysage et en portrait.

## Tâche en cours
- Phase 2, étape 3 (composants personnalisés).

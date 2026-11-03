# PROGRESS — état exact du développement

Dernière mise à jour : 3 novembre 2026.

## Branche
- Travail : `claude/layer-modification-prompt-feasibility-nw7oa4`.
- `main` (version utilisée au quotidien) : **non modifiée**.

## Dernière tâche terminée
- Phase 0 : audit complet (`AUDIT.md`) et création des fichiers de suivi.
- Aucune ligne de code de l'application n'a encore été modifiée.

## Tests réalisés pendant l'audit
Les tests sont faits avec Chromium automatisé, aux formats iPad paysage, iPad portrait et téléphone.
- Chargement, vue Plan, vue 3D (WebGL 2), vue Tableau : OK, aucune erreur JavaScript.
- Dessin d'une pièce, enregistrement, rechargement : OK.
- **Stockage plein : le faux « Enregistré » est confirmé (bug critique).**
- Export PDF à l'échelle : fichier valide (A4 paysage, cartouche, légende).
- Export et réimport du fichier de plan : OK.
- Hors ligne : rechargement sans réseau OK, police comprise.
- Performances : maison exemple fluide ; plan 25 fois plus gros environ 3 fois plus lent (en environnement lent).

## Tâche en cours
- Aucune : en attente du feu vert de l'utilisateur.

## Prochaine action prévue
1. Phase 1a, protection des données : IndexedDB, vérification des écritures, copies de sécurité, historique, export par le menu de partage, migration du format.
2. Décision demandée à l'utilisateur pour la phase 1b : découper `index.html` en modules (voir le message de fin de phase 0).

## Décisions en attente
- Découpage en modules (phase 1b) : changement d'architecture profond, à valider par l'utilisateur.

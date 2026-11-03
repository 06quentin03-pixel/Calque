# PROGRESS — état exact du développement

Dernière mise à jour : 3 novembre 2026.

## Branche
- Travail : `claude/layer-modification-prompt-feasibility-nw7oa4`.
- `main` (version utilisée au quotidien) : **non modifiée**.
- ⚠️ Envoi sur GitHub bloqué : l'application Claude a l'accès en lecture au dépôt, mais pas en écriture (erreur 403 « Resource not accessible by integration »). Les commits sont locaux tant que l'accès n'est pas corrigé.

## Dernière tâche terminée
- Phase 1a, protection des données (voir CHANGELOG).

## Tests réalisés (phase 1a)
Commande : `node --test tests/*.test.mjs`, 7/7 réussis :
1. Reprise d'un plan de l'ancien stockage, avec la copie d'origine conservée et une copie de sécurité créée.
2. Enregistrement vérifié et rechargement.
3. Stockage plein : « Non enregistré » et alerte (le bug critique de l'audit est corrigé).
4. Envoi puis réimport d'un plan, sans écrasement.
5. Sauvegarde complète : un plan supprimé est restauré, sans doublon.
6. Historique : restauration d'une version, récupération d'un plan supprimé.
7. Copie abîmée détectée : la copie valide la plus récente est ouverte.

Non-régression vérifiée à la main (scripts) : vues Plan, 3D et Tableau sans erreur, export PDF valide, hors ligne OK.

Non testable ici, à vérifier sur l'iPad :
- le bouton « Envoyer… » (menu de partage) : Chromium sous Linux ne le propose pas, seul « Enregistrer » apparaît ;
- l'ouverture depuis l'écran d'accueil et la reprise des plans existants.

## Tâche en cours
- Aucune.

## Prochaine action prévue
- Phase 1b (découpage en modules) : **en attente de la validation de l'utilisateur**.
- Sinon, phase 1c (performances, Apple Pencil, barre du haut sur téléphone), qui ne demande pas de décision.

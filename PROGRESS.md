# PROGRESS — état exact du développement

Dernière mise à jour : 4 novembre 2026.

## Branche
- Travail : `claude/layer-modification-prompt-feasibility-nw7oa4`.
- `main` (version utilisée au quotidien) : **non modifiée**.

## Phases terminées
- Phase 0 : audit.
- Phase 1a : protection des données.
- Phase 1c : performances et iPad (voir CHANGELOG).

## Tests réalisés (phase 1c)
Commande : `node --test tests/*.test.mjs`, **14/14 réussis** (7 de la phase 1a, 7 nouveaux) :
1. Gros plan (25 logements) : le rendu limité à la zone visible donne exactement les mêmes pixels que le rendu complet, sur 4 vues.
2. Image mémorisée du plan : mêmes pixels avec et sans pendant le tracé d'un mur, puis après l'ajout et l'annulation.
3. Annuler/rétablir : restitution exacte ; une petite modification coûte moins de 10 % d'un état complet (avant : 100 %).
4. Annuler/rétablir sur un gros plan : retour exact à l'état de départ, puis rétablir.
5. Apple Pencil : activation au premier contact, le doigt déplace sans dessiner, la paume est ignorée, le survol n'ajoute rien, réglage dans Affichage.
6. Apple Pencil désactivé : le doigt dessine comme avant.
7. Barre du haut : aucun débordement à 390 px ; une seule ligne à 820 et 1 180 px.

Mesures (Chromium sans carte graphique, gros plan de 725 murs et 1 650 symboles) :
- Plan zoomé : 30 ms → 10 ms par image.
- Tracé d'un mur (déplacement du curseur) : 23 ms → 0,4 ms par image.
- Vue entière : inchangée (tout est visible, tout doit être dessiné).

Non-régression vérifiée par scripts : vues 3D et Tableau sans erreur, export PDF et PNG complets même avec le plan zoomé à l'écran.

À vérifier sur l'iPad (impossible ici, ni Safari ni Apple Pencil réel) :
- dessin au Pencil, déplacement au doigt, rejet de la paume ;
- aperçu au survol du Pencil (iPad M4 avec Pencil Pro) ;
- fluidité d'un gros plan ;
- et toujours de la phase 1a : bouton « Envoyer… », reprise des plans existants.
Limite connue : le double-toucher et la pression latérale (« squeeze ») du Pencil Pro ne sont pas accessibles aux applications web.

## Tâche en cours
- Aucune.

## Prochaine action prévue
- Phase 1b (découpage en modules) : **en attente de l'accord explicite de l'utilisateur** (changement profond de l'organisation du code).
- Ensuite : phase 2 (bibliothèque), puis 3 à 8 dans l'ordre de `ROADMAP.md`.

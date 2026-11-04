# ROADMAP — évolution de Calque

Ordre logique de développement. Chaque phase doit être validée (tests et absence de régression) avant la suivante.
Légende : ⬜ à faire · 🟨 en cours · ✅ terminé · ⏸ en attente d'une décision ou de données de l'utilisateur

## Phase 0 — Audit ✅
- ✅ Lecture du code, tests automatisés, état des lieux dans `AUDIT.md`.
- ✅ Fichiers de suivi : `CLAUDE.md`, `ROADMAP.md`, `PROGRESS.md`, `CHANGELOG.md`.

## Phase 1 — Fiabilisation et architecture
Dépend de : phase 0.

**1a. Protection des données** ✅ (testée automatiquement ; à vérifier sur iPad)
- ✅ Stockage des plans dans IndexedDB, avec reprise automatique des plans existants du `localStorage`, sans les effacer.
- ✅ Vérification de chaque écriture et alerte visible en cas d'échec (fin du faux « Enregistré »).
- ✅ Copies de sécurité automatiques et historique des versions, avec restauration. Plans supprimés récupérables.
- ✅ Envoi du plan par le menu de partage de l'iPad (fichier `.calque.json`) et import compatible avec les anciens `.json`.
- ✅ Sauvegarde complète de tous les plans dans un fichier, avec un import qui n'écrase jamais rien.
- ✅ Cadre de migration versionnée du format (`PLAN_VERSION`, `MIGRATIONS`) et contrôle d'intégrité à l'ouverture (empreinte et liens cassés).
- ✅ Demande de stockage persistant (`navigator.storage.persist`).
- Validation : 7 tests automatisés dans `tests/stockage.test.mjs`, tous réussis.

**1b. Architecture** ⏸ (décision de l'utilisateur requise : voir PROGRESS.md)
- ⬜ Découpage progressif de `index.html` en modules natifs : noyau/modèle, géométrie, électricité, rendu 2D, 3D, export, interface.
- ⬜ Modèle de données commun documenté, avec un système d'événements « le plan a changé ».
- ⬜ Mise à jour du Service Worker pour les nouveaux fichiers et affichage « nouvelle version disponible ».

**1c. Performances et iPad** ✅ (testée automatiquement ; à vérifier sur iPad)
- ✅ Rendu 2D limité à la zone visible, image mémorisée du plan pendant les aperçus (curseur, tracé de mur).
- ✅ Annuler/rétablir moins gourmand en mémoire (blocs partagés entre étapes).
- ✅ Apple Pencil : dessin au stylet, déplacement au doigt, paume ignorée, précision plus fine, aperçu au survol.
- ✅ Correction de la barre du haut sur téléphone (deux lignes).
- Validation : 7 tests automatisés dans `tests/ipad.test.mjs`, tous réussis.

## Phase 2 — Dessin et bibliothèque
Dépend de : 1a, 1b.
- ⬜ Bibliothèque organisée par catégories et sous-catégories (mobilier, équipements du bâtiment, électricité, tertiaire).
- ⬜ Bibliothèque technique générique, lisible sur chantier (« Disjoncteur 20 A courbe C »…), avec un champ référence fabricant optionnel et un badge de fiabilité.
- ⬜ Composants personnalisés.
- ⬜ Import de catalogues fabricants (CSV/Excel, FAB-DIS) ⏸ (fichiers à fournir par l'utilisateur).
- ⬜ Import de plans (image ou PDF en fond de calque).

## Phase 3 — Électricité et calculs
Dépend de : 1b (le moteur de calcul peut démarrer plus tôt, car il est indépendant).
- ⬜ Moteur de calcul pur et testé : intensités mono et triphasées, puissances P/Q/S, cos φ, chute de tension, section, protections, bilan de puissance, équilibrage des phases.
- ⬜ Fiche de calcul d'un circuit depuis le plan : hypothèses, formules, données manquantes, alertes.
- ⬜ Tableaux de données issus des extraits Legrand ⏸ (documents à fournir par l'utilisateur).

## Phase 4 — Cheminements et métrés
Dépend de : 3.
- ⬜ Cheminements (ICTA, IRL, goulottes, chemins de câbles), avec les verticales et les passages entre étages.
- ⬜ Longueurs géométriques, longueurs de cheminement et longueurs à commander, avec réserve.
- ⬜ Recherche d'itinéraire avec zones interdites et détection des conflits (portes, murs, réseaux).
- ⬜ Taux de remplissage des conduits, liste de matériel.

## Phase 5 — Éclairage et 3D avancée
Dépend de : 2, 4.
- ⬜ Concepteur d'éclairage par la méthode des lumens, **présenté comme une estimation** : 3 propositions, implantation modifiable.
- ⬜ Lecture des fichiers IES/LDT, pour le flux et la puissance.
- ⬜ 3D : câbles et chemins de câbles, coupes, transparence, masquage, modification depuis la 3D.

## Phase 6 — Documents et réglementation
Dépend de : 3, 4.
- ⬜ Moteur documentaire : plans techniques, schéma unifilaire, nomenclatures, métrés, rapports, dossier complet en PDF avec cartouche et indice de révision.
- ⬜ Moteur de règles versionnées : édition, source, trois statuts, données utilisées et manquantes. Il reprend les contrôles existants.

## Phase 7 — Chantier et variantes
Dépend de : 1a (stockage IndexedDB indispensable pour les photos).
- ⬜ Mode chantier : plan simplifié, annotations au Pencil, photos localisées, cases « posé », réserves, historique.
- ⬜ Variantes : économique, standard, haut de gamme…, avec comparaison et choix de la version principale.

## Phase 8 — Validation finale
- ⬜ Projets de référence, tests complets, vérification hors ligne, migrations et exports, optimisation iPad.

## Données à fournir par l'utilisateur (au moment voulu)
- Extraits NF C 15-100 de Legrand (PDF).
- Catalogues ou tarifs fabricants (CSV, Excel, FAB-DIS ou PDF).

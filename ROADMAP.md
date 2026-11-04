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

**1b. Architecture** ✅ (testée automatiquement ; à vérifier sur iPad)
- ✅ Découpage de `index.html` en 15 modules natifs dans `js/` (noyau, géométrie, murs, historique, symboles, rendu 2D, électricité, réseaux, interaction, tableau, interface, stockage, export, 3D, démarrage), sans changement de comportement.
- ✅ Modèle de données documenté (`docs/ARCHITECTURE.md`) et système d'événements « le plan a changé » (`js/evenements.js`).
- ✅ Service Worker : tous les modules en cache hors ligne ; avis « nouvelle version disponible » (`js/miseajour.js`).
- Validation : 6 tests dans `tests/architecture.test.mjs`, mise à jour depuis la version de `main` simulée (plans conservés, hors ligne OK).
- Suite prévue au fil des phases : extraire de `electricite.js` la partie sans écran (tables et contrôles) pour le moteur de calcul (phase 3) et le moteur de règles (phase 6).

**1c. Performances et iPad** ✅ (testée automatiquement ; à vérifier sur iPad)
- ✅ Rendu 2D limité à la zone visible, image mémorisée du plan pendant les aperçus (curseur, tracé de mur).
- ✅ Annuler/rétablir moins gourmand en mémoire (blocs partagés entre étapes).
- ✅ Apple Pencil : dessin au stylet, déplacement au doigt, paume ignorée, précision plus fine, aperçu au survol.
- ✅ Correction de la barre du haut sur téléphone (deux lignes).
- Validation : 7 tests automatisés dans `tests/ipad.test.mjs`, tous réussis.

## Phase 2 — Dessin et bibliothèque ✅ (fusionnée dans `main` ; import des catalogues mis de côté)
Dépend de : 1a, 1b.
- ✅ Bibliothèque organisée par catégories et sous-catégories (mobilier, équipements du bâtiment, électricité, tertiaire) : `js/bibliotheque.js`, 247 éléments rangés, rien supprimé (3 tests dans `tests/bibliotheque.test.mjs`).
- ✅ Bibliothèque technique générique, lisible sur chantier (« Disjoncteur 1P+N 20 A courbe C »…), avec un champ référence fabricant optionnel et un badge de fiabilité : 110 articles sans aucune référence inventée (`js/technique.js`), références de l’utilisateur enregistrées sur l’appareil (`js/mabiblio.js`), format des plans v2 (5 tests dans `tests/technique.test.mjs`).
- ✅ Composants personnalisés : créés par l’utilisateur à partir d’un modèle existant, enregistrés hors ligne, inclus dans les sauvegardes, copiés dans chaque plan qui les utilise (format v3). `js/composants.js`, 4 tests dans `tests/composants.test.mjs`.
- ⏸ Import de catalogues fabricants (CSV/Excel, FAB-DIS) : **mis de côté par l’utilisateur le 4 novembre 2026** (utilité jugée faible pour l’instant). Déjà préparé (lecture CSV et .xlsx sans bibliothèque, reconnaissance des colonnes, conversion en articles, 4 tests dans `tests/catalogue.test.mjs`). En attente des fichiers de l'utilisateur pour : colonnes FAB-DIS, enregistrement selon le volume, écran d'import.
- ✅ Import de plans (image ou PDF en fond de calque) : un fond par niveau, mise à l’échelle par 2 points ou par l’échelle d’impression du PDF, opacité, déplacement, rotation (format v4). `js/fond.js`, `js/fondcalc.js`, 4 tests dans `tests/fond.test.mjs`. PDF : première page, lue par Safari (à vérifier sur iPad).

## Phase 3 — Électricité et calculs 🟨
Dépend de : 1b (le moteur de calcul peut démarrer plus tôt, car il est indépendant).
- ✅ Moteur de calcul pur et testé (`js/calcul.js`, 13 tests dans `tests/calcul.test.mjs`) : intensités mono et triphasées, puissances P/Q/S, cos φ, chute de tension, protections (IB ≤ In ; In ≤ Iz en attente du tableau), bilan de puissance, équilibrage des phases. La section et le contrôle In ≤ Iz restent « vérification nécessaire » tant que les tableaux Legrand manquent.
- ✅ Partie sans écran d'`electricite.js` sortie dans `js/elecdonnees.js` (résultat du tableau et des contrôles inchangé).
- ✅ Emplacement des tableaux NF C 15-100 préparé (`js/normes.js`), tous « manquants ».
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

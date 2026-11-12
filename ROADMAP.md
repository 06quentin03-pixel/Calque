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

## Phase 3 — Électricité et calculs ✅ (fusionnée dans `main` ; essais iPad à faire ; une partie des tableaux Legrand en attente)
Dépend de : 1b (le moteur de calcul peut démarrer plus tôt, car il est indépendant).
- ✅ Moteur de calcul pur et testé (`js/calcul.js`, 13 tests dans `tests/calcul.test.mjs`) : intensités mono et triphasées, puissances P/Q/S, cos φ, chute de tension, protections (IB ≤ In ; In ≤ Iz en attente du tableau), bilan de puissance, équilibrage des phases. La section et le contrôle In ≤ Iz restent « vérification nécessaire » tant que les tableaux Legrand manquent.
- ✅ Partie sans écran d'`electricite.js` sortie dans `js/elecdonnees.js` (résultat du tableau et des contrôles inchangé).
- ✅ Emplacement des tableaux NF C 15-100 préparé (`js/normes.js`), tous « manquants ».
- ✅ Fiche de calcul d'un circuit depuis le plan et depuis le tableau : hypothèses, formules, données utilisées et manquantes, alertes, contrôles à 3 statuts (`js/fiche.js`, format v5, 3 tests dans `tests/fiche.test.mjs`).
- ✅ Bilan de puissance et équilibrage des phases dans l'onglet Tableau (onglet « Bilan »).
- ✅ Tableaux issus de l'extrait Legrand « Points clés » (révision 23 août 2024) : sections/calibres par circuit, chauffage, différentiels.
- ⏸ Tableaux absents de cet extrait (Iz, modes de pose, facteurs de correction, chutes de tension maxi, simultanéité) : **reportés en phase 8** (documents payants). Les contrôles concernés restent « vérification nécessaire » d'ici là.

## Phase 4 — Cheminements et métrés ✅ (fusionnée dans `main`, validée sur iPad)
Dépend de : 3.
- ✅ Cheminements (ICTA, IRL, goulottes, chemins de câbles), avec les verticales et les passages entre étages (`js/cheminement.js`, format v6, 3 tests dans `tests/cheminement.test.mjs`).
- ✅ Longueurs géométriques, longueurs de cheminement et longueurs à commander, avec réserve ; la longueur L de la fiche de calcul vient du plan (« estimée »), remplaçable par une saisie. Onglet « Cheminements » (`js/metres.js`).
- ✅ Recherche d'itinéraire avec zones interdites et détection des conflits (portes, fenêtres, murs, réseaux) : `js/itineraire.js`, `js/routeui.js`.
- ✅ Taux de remplissage des conduits (« vérification nécessaire » : règle non couverte par l'extrait Legrand, reportée en phase 8), liste de matériel estimée (`js/materiel.js`).
- Validation : 9 tests dans `tests/cheminement.test.mjs` ; 68/68 au total.

## Phase 5 — Éclairage et 3D avancée ✅ (fusionnée dans `main`, validée sur iPad)
Dépend de : 2, 4.
- ✅ Concepteur d'éclairage par la méthode des lumens, **présenté comme une estimation** : 3 propositions, implantation modifiable (`js/eclairage.js`, `js/eclairageui.js`, format v7, 4 tests dans `tests/eclairage.test.mjs`).
- ✅ Lecture des fichiers IES/LDT, pour le flux et la puissance (`js/photometrie.js`, sans bibliothèque, hors ligne ; 2 tests).
- ✅ 3D : câbles et chemins de câbles (dimensions, pose, verticales, passages entre étages), coupes, transparence, masquage, modification depuis la 3D (`js/vue3d.js`, 3 tests dans `tests/vue3d.test.mjs`).
- Validation : 77/77 tests.

## Phase 6 — Documents et réglementation ✅ (fusionnée dans `main`, validée sur iPad)
Dépend de : 3, 4.
- ✅ Moteur documentaire : plans techniques, schéma unifilaire, coffret, nomenclatures, bilan, métrés et matériel, études d'éclairage, dossier complet en PDF avec cartouche et indice de révision (`js/pdf.js`, `js/svgpdf.js`, `js/documents.js`, `js/dossierui.js`, format v8, 7 tests dans `tests/documents.test.mjs`).
- ✅ Moteur de règles versionnées : édition, source, trois statuts, données utilisées et manquantes ; il reprend tous les contrôles existants (`js/regles.js`, `js/reglesui.js`, rapport dans le dossier PDF, 5 tests dans `tests/regles.test.mjs`).
- ✅ Nouveau plan d'exemple « maison et atelier » (`js/exemple.js`), qui montre une fonction de chaque phase.
- Validation : 90/90 tests.

## Phase 7 — Chantier et variantes ✅ (à fusionner et à vérifier sur iPad)
Dépend de : 1a (stockage IndexedDB indispensable pour les photos).
- ✅ Mode chantier : onglet « Chantier » (plan simplifié), annotations au Pencil, photos localisées (IndexedDB, base à part, hors du plan et de l'annuler), cases « posé » par appareil et par circuit, réserves (statut, dates, échéance), historique ; chapitre « Suivi de chantier » du dossier PDF (photos comprises) ; photos dans la sauvegarde complète (`js/chantier.js`, `js/chantierui.js`, `js/photos.js`, format v9, 6 tests dans `tests/chantier.test.mjs`).
- ✅ Variantes : économique, standard, haut de gamme…, dans le plan (partie électrique propre à chaque variante, bâtiment commun), comparaison (appareils, puissance, éclairage, matériel, contrôles du moteur de règles), version principale, jamais de variante perdue ; chapitre « Comparaison des variantes » du dossier PDF (`js/variantes.js`, `js/variantesui.js`, format v10, 4 tests dans `tests/variantes.test.mjs`).
- Validation : 100/100 tests.

## Phase 8 — Validation finale
- 🟨 Projets de référence, tests complets, vérification hors ligne, migrations et exports, optimisation iPad : migrations v1 → v11 sans perte et exports sur un plan migré (`tests/migrations.test.mjs`), hors ligne avec les modules chargés à la demande (`tests/architecture.test.mjs`) — fait le 12 novembre 2026 ; gros dossier PDF (115 pages en 0,7 s) et sauvegarde de 150 photos (mémoire 239 → 10 Mo à l'écriture, 377 → 111 Mo à l'import) mesurés et optimisés ; reste : essais sur l'iPad.
- ⬜ Tableaux NF C 15-100 manquants (extraits Legrand payants, à fournir par l'utilisateur) : courants admissibles Iz, modes de pose, facteurs de correction, chutes de tension maximales, constantes ρ et λ, simultanéité, remplissage des conduits (emplacement `remplissage_conduits` prêt dans `js/normes.js`). Les recopier dans `js/normes.js` (avec tests), puis activer In ≤ Iz, la limite de chute de tension et le remplissage.
- ⬜ Rattacher les règles « de Calque » (`cq_…` dans `js/regles.js`) aux pages des extraits Legrand fournis, pour qu'elles puissent devenir « conformes » (changer leur version `v` et `REGLES_VERSION`).

## Mission « développement autonome » (9 – 17 novembre 2026) 🟨
Travail continu, sans validation par phase (demande de l'utilisateur du 9 novembre 2026). Branche `claude/ecstatic-sagan-juah82`.
- ✅ Export DXF (AutoCAD R12) par calques (`js/dxf.js`, 3 tests).
- ✅ Quantitatif complet (global, par pièce, par circuit), chiffrage (prix et temps saisis), export CSV, chapitre du dossier PDF, format v11 (`js/quantitatif.js`, `js/quantitatifui.js`, 5 tests).
- ✅ Disjoncteur d'abonné correct en triphasé.
- ✅ Sélection multiple (outil « Groupe ») : déplacer, tourner, dupliquer, copier vers un autre niveau, supprimer, hauteur et circuit (`js/multi.js`, 3 tests).
- ✅ Import d'un plan DXF en fond de plan à l'échelle exacte (`js/dxfimport.js`, 3 tests).
- ✅ Raccordement automatique des circuits par des gaines proposées (`raccorderCircuit`, 3 tests).
- ✅ Reconnaissance des murs, portes, fenêtres et noms de pièces d'un plan DXF (`js/dxfmurs.js`, 3 tests).
- ✅ Import d'une maquette IFC 2x3 / 4 dans un nouveau plan (`js/ifcimport.js`, `js/ifcui.js`, 5 tests).
- ✅ Assistant « Où en est mon projet ? » (`js/assistant.js`, `js/assistantui.js`, 2 tests).
- ✅ Équipement minimal d'une pièce ou d'un niveau, posé d'un geste (`js/equipement.js`, `js/equipementui.js`, 4 tests).
- ✅ Outil « Mesurer » (distance, surface, transformation en cotes) (`js/mesure.js`, 2 tests).
- ✅ Correction des gaines après « Régénérer depuis le plan » et après la suppression d'un circuit (3 tests).
- ✅ Relier les appareils sans circuit sans toucher aux circuits existants (`js/affectation.js`, 3 tests).
- ✅ Rappel de la sauvegarde complète (`js/sauvegarde.js`, `js/rappelui.js`, 3 tests).
- ✅ Accrochage aux traits d'un fond DXF (axes des murs pour Mur et Pièce) (`js/fondtraits.js`, 2 tests).
- ⬜ Suite envisagée, par ordre de valeur : (murs), routage automatique de tous les circuits, détection des murs sur un fond de plan.

## Données à fournir par l'utilisateur (au moment voulu)
- Extraits NF C 15-100 de Legrand : guide « Points clés » reçu ; les autres (payants) en phase 8.
- Catalogues ou tarifs fabricants (CSV, Excel, FAB-DIS ou PDF).

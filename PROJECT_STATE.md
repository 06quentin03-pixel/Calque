# PROJECT_STATE — état actuel du projet Calque

Mise à jour : 4 novembre 2026, fin de la phase 4.
À lire au début de chaque session avec `CLAUDE.md`, `TECHNICAL_DECISIONS.md` et `NEXT_SESSION.md`.
Le détail chronologique est dans `PROGRESS.md` et `CHANGELOG.md`, le plan d'ensemble dans `ROADMAP.md`.

## En une phrase
Calque est une application web hors ligne (PWA, iPad) pour dessiner des plans, implanter l'électricité, générer le tableau NF C 15-100, calculer les circuits et voir la maquette 3D.

## Avancement des phases
| Phase | Contenu | État |
|---|---|---|
| 0 | Audit (`AUDIT.md`) | ✅ terminé |
| 1a | Protection des données (IndexedDB, versions, sauvegarde complète) | ✅ fusionnée, validée sur iPad |
| 1b | Architecture en modules natifs (`js/`) | ✅ fusionnée, validée sur iPad |
| 1c | Performances et Apple Pencil | ✅ fusionnée, validée sur iPad |
| 2 | Bibliothèque, références, composants, fond de plan | ✅ fusionnée, validée sur iPad (import des catalogues mis de côté) |
| 3 | Moteur de calcul, fiche de calcul, bilan, équilibrage, tableaux Legrand | ✅ fusionnée dans `main` (demande n°2), essais iPad à faire |
| 4 | Cheminements et métrés | ✅ terminée, **demande de fusion n°3 à fusionner**, essais iPad à faire |
| 5 | Éclairage et 3D avancée | ⬜ prochaine phase |
| 6 | Documents et moteur de règles | ⬜ |
| 7 | Chantier et variantes | ⬜ |
| 8 | Validation finale | ⬜ |

## Ce qui marche aujourd'hui (phases 3 et 4)
- **Moteur de calcul** `js/calcul.js` (sans écran, testé avec Node) : intensité mono/tri, P/Q/S, cos φ, chute de tension, IB ≤ In, section/calibre, nombre de points, type de différentiel, calibre des différentiels (règle de l'amont / de l'aval), bilan de puissance, équilibrage des phases.
- **Fiche de calcul** d'un circuit (`js/fiche.js`), ouverte depuis l'inspecteur d'un symbole et depuis le tableau.
- **Onglet « Bilan »** du tableau : puissances, coefficient ks, circuits, équilibrage, interrupteurs différentiels, état des tableaux Legrand.
- **Format des plans v6** (phase 4 : type, pose et circuits des gaines, passages entre étages, zones interdites, réserve de câble).
- **Cheminements** `js/cheminement.js` (sans écran) : gaine ICTA, tube IRL, goulotte, chemin de câbles ; pose sol / plafond / hauteur ; verticales ; passages entre étages ; longueurs par circuit (vol d'oiseau, cheminement, à commander avec réserve). Onglet « Cheminements » du tableau (`js/metres.js`).
- **Longueur L de la fiche** : mesurée sur le plan (« estimée ») tant qu'aucune longueur n'est saisie.
- **Itinéraire et conflits** `js/itineraire.js` (sans écran) + `js/routeui.js` : zones interdites, proposition d'itinéraire, conflits (portes, fenêtres, murs, zones, VMC).
- **Remplissage et matériel** `js/materiel.js` (sans écran) : remplissage des cheminements (« vérification nécessaire »), liste de matériel estimée.

## Tableaux NF C 15-100 (`js/normes.js`)
Source fournie par l'utilisateur : Legrand, « NF C 15-100 — Révision 23 août 2024 — Points clés & solutions Legrand » (réf. MM224003).
| Tableau | État |
|---|---|
| Section et calibre par circuit du logement (+ chauffage) | ✅ recopié (p. 16-17, 24-29) |
| Interrupteurs différentiels (nombre, types, 8 circuits, calibre) | ✅ recopié (p. 12-15) |
| Courants admissibles Iz | ⏸ reporté en phase 8 |
| Modes de pose / méthodes de référence | ⏸ reporté en phase 8 |
| Facteurs de correction (température, groupement) | ⏸ reporté en phase 8 |
| Chutes de tension maximales | ⏸ reporté en phase 8 |
| Formule et constantes de chute de tension (ρ, λ) | ⏸ reporté en phase 8 (valeurs usuelles marquées « estimée » en attendant) |
| Coefficients de simultanéité | ⏸ reporté en phase 8 (ks saisissable en attendant) |
| Remplissage des conduits et goulottes | ⏸ reporté en phase 8 (remplissage toujours « vérification nécessaire ») |

Conséquence : les contrôles In ≤ Iz, chute de tension maximale et pouvoir de coupure restent « vérification nécessaire ». **Aucun circuit ne peut donc être « conforme » globalement** : c'est voulu.

**Décision de l'utilisateur (4 novembre 2026)** : les tableaux absents du guide sont **reportés à la toute fin (phase 8)**, car les documents sont payants. Ne pas les redemander avant.

## Tests
- `node --test tests/*.test.mjs` : **68/68 réussis** (fin de phase 4).
- Fichiers : `architecture`, `stockage`, `ipad`, `bibliotheque`, `technique`, `composants`, `fond`, `catalogue`, `calcul` (15 tests, valeurs calculées à la main), `fiche` (4 tests), `cheminement` (9 tests).
- Test instable connu : `ipad.test.mjs` « rendu limité à la zone visible… », un échec intermittent observé une fois (probablement le chargement des polices).

## Points ouverts
- Essais iPad des phases 3 et 4 : à faire par l'utilisateur (liste dans `NEXT_SESSION.md`).
- Exports PDF des métrés et de la liste de matériel : prévus avec le moteur documentaire (phase 6).
- Itinéraire proposé niveau par niveau (passer d'un étage à l'autre par un passage entre étages déjà raccordé).
- Import des catalogues fabricants : mis de côté par l'utilisateur (module `js/catalogue.js` prêt, inactif).
- Le disjoncteur d'abonné affiché en triphasé reste celui du monophasé (à reprendre).

## Branches
- `main` : version utilisée tous les jours (GitHub Pages).
- `claude/layer-modification-prompt-feasibility-nw7oa4` : branche de développement.

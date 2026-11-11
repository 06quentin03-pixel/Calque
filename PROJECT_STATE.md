# PROJECT_STATE — état actuel du projet Calque

Mise à jour : 9 novembre 2026, mission « développement autonome » (après la phase 7).
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
| 3 | Moteur de calcul, fiche de calcul, bilan, équilibrage, tableaux Legrand | ✅ fusionnée dans `main` (demande n°2), **validée sur iPad** (5 novembre 2026) |
| 4 | Cheminements et métrés | ✅ terminée, fusionnée dans `main` (demande n°3), **validée sur iPad** (5 novembre 2026) |
| 5 | Éclairage et 3D avancée | ✅ terminée, **fusionnée dans `main` (demande n°4, à la demande de l'utilisateur, 5 novembre 2026)**, **validée sur iPad** (5 novembre 2026) |
| 6 | Documents et moteur de règles | ✅ terminée, **fusionnée dans `main` (demande n°5, avec le nouveau plan d'exemple, à la demande de l'utilisateur)**, **validée sur iPad** (5 novembre 2026) |
| 7 | Chantier et variantes | ✅ terminée (demande de fusion n°6 à fusionner, essais iPad à faire) |
| 8 | Validation finale | ⬜ |
| — | Mission « développement autonome » (9 novembre 2026) : export DXF, quantitatif et chiffrage, correctifs | 🟨 en cours, branche `claude/ecstatic-sagan-juah82` |

## Ce qui marche aujourd'hui (phases 3 et 4)
- **Moteur de calcul** `js/calcul.js` (sans écran, testé avec Node) : intensité mono/tri, P/Q/S, cos φ, chute de tension, IB ≤ In, section/calibre, nombre de points, type de différentiel, calibre des différentiels (règle de l'amont / de l'aval), bilan de puissance, équilibrage des phases.
- **Fiche de calcul** d'un circuit (`js/fiche.js`), ouverte depuis l'inspecteur d'un symbole et depuis le tableau.
- **Onglet « Bilan »** du tableau : puissances, coefficient ks, circuits, équilibrage, interrupteurs différentiels, état des tableaux Legrand.
- **Format des plans v11** (`chiffrage` en v11 ; phase 7 : `variantes` en v10, `chantier` en v9) ; v8 (phase 6 : cartouche et indices de révision du dossier, `doc` ; v7 en phase 5 : photométries, études d'éclairage, photométrie d'un luminaire ; v6 en phase 4 : type, pose et circuits des gaines, passages entre étages, zones interdites, réserve de câble).
- **Cheminements** `js/cheminement.js` (sans écran) : gaine ICTA, tube IRL, goulotte, chemin de câbles ; pose sol / plafond / hauteur ; verticales ; passages entre étages ; longueurs par circuit (vol d'oiseau, cheminement, à commander avec réserve). Onglet « Cheminements » du tableau (`js/metres.js`).
- **Longueur L de la fiche** : mesurée sur le plan (« estimée ») tant qu'aucune longueur n'est saisie.
- **Itinéraire et conflits** `js/itineraire.js` (sans écran) + `js/routeui.js` : zones interdites, proposition d'itinéraire, conflits (portes, fenêtres, murs, zones, VMC).
- **Remplissage et matériel** `js/materiel.js` (sans écran) : remplissage des cheminements (« vérification nécessaire »), liste de matériel estimée.

## Phase 5 (terminée)
- **Concepteur d'éclairage** `js/eclairage.js` (sans écran) + `js/eclairageui.js` : inspecteur d'une pièce › « Concevoir l'éclairage ». Méthode des lumens + calcul point par point (composante directe), 3 propositions **estimées**, implantation en symboles ordinaires (modifiables), « implantation actuelle » recalculée. Aucun éclairement réglementaire : la valeur visée est saisie.
- **Photométrie** `js/photometrie.js` (sans écran) : lecture des fichiers IES et LDT (flux intégré « vérifié », puissance du fichier), courbe photométrique ; fichiers enregistrés dans le plan.
- **3D avancée** `js/vue3d.js` : goulottes et chemins de câbles à leurs dimensions et à leur pose, passages entre étages, câbles des circuits (option « Câbles »), coupes horizontale et verticales, murs transparents, masquage, modification depuis la fiche 3D (gaine, hauteur de pose, mur, meuble, suppression) et déplacement au doigt des symboles au plafond ou au sol.

## Plan d'exemple
- « Exemple : maison et atelier » (`js/exemple.js`) : maison + atelier industriel 40 × 20 m avec mezzanine ; une fonction de chaque phase. **Règle : chaque nouvelle fonctionnalité y est ajoutée** (CLAUDE.md, test `tests/exemple.test.mjs`).

## Phase 6 (terminée)
- **Moteur documentaire** (étape 1, terminée) : Menu › **Dossier PDF**. Un seul PDF avec un cartouche (projet, client, indice, date, page n / N) sur chaque page : page de garde (sommaire, révisions, lecture des statuts), plans techniques à l'échelle, schéma unifilaire et coffret vectoriels, nomenclatures, bilan, métrés et matériel, études d'éclairage. Valeurs estimées marquées « Estimée », valeurs manquantes « Manquante ». Indices de révision A, B, C… gardés dans le plan (format **v8**, champ `doc`).
  - Modules : `js/pdf.js`, `js/svgpdf.js`, `js/documents.js` (sans écran, testés avec Node), `js/dossierui.js` (écran).
- **Moteur de règles versionnées** (étape 2, terminée) : `js/regles.js` (sans écran) + onglet `js/reglesui.js`. 51 règles versionnées (« Calque-règles 2026.11 (1) »), chacune avec sa source, l'édition de la norme et son origine (extrait Legrand, règle générale, contrôle de Calque à rattacher, recommandation, point d'attention). Trois statuts, données utilisées et manquantes. Tous les contrôles existants sont repris (fiche de calcul, différentiels, remplissage, 49 contrôles de `nfcChecks`).
  - Une règle de Calque dont la source n'est pas rattachée à un extrait Legrand n'est jamais « conforme » : respectée → « vérification nécessaire (à confirmer) ».
  - Rapport aussi dans le dossier PDF (chapitre « Rapport de contrôle »).

## Phase 7 (terminée)
- **Mode chantier** (étape 1, terminée) : onglet « Chantier ». Cases « posé » (appareils, circuits), annotations au Pencil, réserves (statut de suivi, dates, échéance), photos localisées (IndexedDB `calque-photos`, hors du plan, dans la sauvegarde complète), historique ; chapitre « Suivi de chantier » du dossier PDF. Format **v9** (`chantier`).
  - Modules : `js/chantier.js` (sans écran), `js/chantierui.js`, `js/photos.js`.
- **Variantes** (étape 2, terminée) : Menu › Variantes. Partie électrique propre à chaque variante, bâtiment commun ; afficher, dupliquer, renommer, version principale, suppression protégée (copie dans l'historique) ; comparaison (appareils, puissance, éclairage, matériel, contrôles) ; chapitre du dossier PDF. Format **v10** (`variantes`).
  - Modules : `js/variantes.js` (sans écran), `js/variantesui.js`.

## Mission « développement autonome » (depuis le 9 novembre 2026)
- **Export DXF** `js/dxf.js` (sans écran) : contexte `DxfCtx` (hérite de `PdfCtx`) qui enregistre le dessin du moteur 2D, calques posés par `drawSceneIn` (`c.calque(nom)`), fichier R12 en Windows-1252. Écran : fenêtre d'export (`export.js`, `composeDXF`).
- **Quantitatif et chiffrage** `js/quantitatif.js` (sans écran) + `js/quantitatifui.js` (onglet « Quantitatif ») : lignes à clé stable (`app:<type>`, `art:<article>`, `comp:<composant>`, `disj:<calibre>:<mono|tri>`, `dd:<type>:<calibre>:<réseau>`, `dda`, `parafoudre`, `mat:<catégorie>|<désignation>`), par pièce et par circuit, prix et temps saisis (`plan.chiffrage`, format **v11**), « mes prix » sur l'appareil (`UL.prix`, `mabiblio.js`), CSV, chapitre du dossier PDF.
- **Sélection multiple** `js/multi.js` : outil `multi` (« Groupe », `EXT.tools`), sélection dans `ui.multi` (références `{ t, id }`), panneau du groupe par `EXT.inspVide` (chaîné avec celui du chantier), clavier par `toucheGroupe` (`demarrage.js`).
- **Import DXF** `js/dxfimport.js` (sans écran : `lireDxf`, `empriseDxf`, `uniteProbable`, `dessinerDxf`) ; écran dans `fond.js` (`importDxf`) : le DXF est dessiné en image JPEG (4096 px au plus) et devient un fond de plan ordinaire avec `s` exact et `cal: true` (aucun changement de format).
- **Disjoncteur d'abonné** : `agcpOf(kva, reseau)` et `KVA_PALIERS` dans `elecdonnees.js` (valeurs usuelles, « estimées »).

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
- `node --test tests/*.test.mjs` : **114/114 réussis** (9 novembre 2026).
- Fichiers : `architecture`, `stockage`, `ipad`, `bibliotheque`, `technique`, `composants`, `fond`, `catalogue`, `calcul` (15 tests, valeurs calculées à la main), `fiche` (4 tests), `cheminement` (9 tests), `eclairage` (6 tests, fichiers de synthèse dans `tests/synthese.mjs`), `vue3d` (3 tests), `documents` (7 tests), `regles` (5 tests), `exemple` (1 test), `chantier` (6 tests), `variantes` (4 tests), `dxf` (3 tests), `quantitatif` (5 tests), `multi` (3 tests), `dxfimport` (3 tests).
- Test parfois instable dans la suite complète : `ipad.test.mjs` « l'image mémorisée du plan donne le même résultat… » (image 0, 71 points d'écart sur l'aperçu d'un mur). Vu 3 fois sur 6 suites complètes le 9 novembre 2026, jamais lancé seul ni sous charge ; cause probable : la police d'écriture (chargée par internet) arrive ou non à temps dans l'une des deux pages comparées. Non lié aux modifications de la mission (même résultat avant). À fiabiliser : attendre `document.fonts.ready` dans `boot` des tests.

## Points ouverts
- Essais iPad de la phase 5 : **validés** par l'utilisateur le 5 novembre 2026 (« tout marche »), y compris un vrai fichier IES / LDT de fabricant. Essais iPad de la phase 4 : **validés** le 5 novembre 2026. Phase 3 validée sur iPad le 5 novembre 2026.
- 3D : un appareil mural ne se déplace pas depuis la 3D (sur le plan seulement) ; la coupe n'a pas de face de remplissage (les murs coupés paraissent creux).
- Itinéraire proposé niveau par niveau (passer d'un étage à l'autre par un passage entre étages déjà raccordé).
- Import des catalogues fabricants : mis de côté par l'utilisateur (module `js/catalogue.js` prêt, inactif).
- Import DXF : essayé avec des fichiers écrits par ezdxf (R12 et R2010) et par Calque, pas encore avec un vrai plan d'architecte (AutoCAD, ArchiCAD, Revit) : à essayer avec un fichier réel. DXF binaire et DWG non lus.
- Export DXF : non essayé dans AutoCAD lui-même (vérifié avec la bibliothèque ezdxf et un rendu) ; à ouvrir une fois dans le logiciel du destinataire.

## Branches
- `main` : version utilisée tous les jours (GitHub Pages).
- `claude/layer-modification-prompt-feasibility-nw7oa4` : branche de développement des phases 1 à 7 (fusionnée).
- `claude/ecstatic-sagan-juah82` : branche de la mission « développement autonome » (partie de `main` après la fusion n°6).

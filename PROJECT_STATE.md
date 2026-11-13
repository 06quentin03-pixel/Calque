# PROJECT_STATE — état actuel du projet Calque

Mise à jour : 13 novembre 2026, demandes sur les escaliers, terrasses, colonne du tableau, câbles et test des schémas (format v15).
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
| — | Mission « développement autonome » (9 novembre 2026) : export DXF, quantitatif, sélection multiple, imports DXF et IFC, raccordement automatique, assistant | 🟨 en cours, branche `claude/ecstatic-sagan-juah82` ; **demande de fusion n°7 fusionnée dans `main` le 12 novembre 2026** (essais iPad à faire) ; la suite continue sur la même branche, repartie de `main` |

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
- **Quantitatif et chiffrage** `js/quantitatif.js` (sans écran) + `js/quantitatifui.js` (onglet « Quantitatif ») : lignes à clé stable (`app:<type>`, `art:<article>`, `comp:<composant>`, `disj:<calibre>:<mono|tri>`, `dd:<type>:<calibre>:<réseau>`, `dda`, `parafoudre`, `mat:<catégorie>|<désignation>`), par pièce et par circuit, prix et temps saisis (`plan.chiffrage`, format **v11**), « mes prix » sur l'appareil (`UL.prix`, `mabiblio.js`), CSV, chapitre du dossier PDF. Saisie d'un prix : `commitLeger` (`interaction.js`) — étape d'annulation et enregistrement sans recalcul du plan ; l'onglet ne refait que les totaux (`valider`, `quantPatch(parent, q)`).
- **Sélection multiple** `js/multi.js` : outil `multi` (« Groupe », `EXT.tools`), sélection dans `ui.multi` (références `{ t, id }`), panneau du groupe par `EXT.inspVide` (chaîné avec celui du chantier), clavier par `toucheGroupe` (`demarrage.js`).
- **Import DXF** `js/dxfimport.js` (sans écran : `lireDxf`, `empriseDxf`, `uniteProbable`, `dessinerDxf`) ; écran dans `fond.js` (`importDxf`) : le DXF est dessiné en image JPEG (4096 px au plus) et devient un fond de plan ordinaire avec `s` exact et `cal: true` (aucun changement de format).
- **Accrochage au fond DXF** `js/fondtraits.js` : `EXT.snap` (appelé par `snapPoint` après les angles des murs), traits en pixels de l'image du fond dans IndexedDB `meta`/`fondtraits:<image>` (hors du plan, non sauvegardés : réimporter le DXF sur un autre appareil ; pas effacés quand le fond est retiré, pour qu'« Annuler » le retrouve).
- **Reconnaissance des murs** `js/dxfmurs.js` (sans écran : `reconnaitreMurs(segments, arcs)`, `segmentsDuDxf`) ; écran : `dxfMurs` dans `fond.js` (murs par `addWall`, ouvertures par `newOpening`, noms des pièces d'après les textes du DXF). Depuis le 13 novembre : reconnaissance dans le repère du fichier (`dxfMurs` déplace ensuite), axes regroupés par écart de 3 cm (indépendant de la position), porte au bout d'un mur contre un mur en travers si un arc est dessiné. Unité : `uniteProbable` écarte l'unité du fichier si elle donne moins de 2 m ou plus de 3 km (`douteuse`, `imperial`).
- **Import IFC** `js/ifcimport.js` (sans écran : lecteur STEP à la demande, repères `IfcLocalPlacement`, volumes `IfcExtrudedAreaSolid` y compris sous `IfcBooleanClippingResult` et `IfcMappedItem`, `lireIfc` → niveaux, murs, ouvertures, locaux en cm) ; écran `js/ifcui.js` (chargé à la demande depuis le menu) : nouveau plan par `openPlan` puis `addWall` / `newOpening`. Fichiers de référence écrits par IfcOpenShell : `tests/maison-ifc4.ifc`, `tests/maison-ifc2x3.ifc`. Depuis le 12 novembre : volumes en facettes (`facettes`, `boiteFacettes`, repris si `plein` entre 0,75 et 1,8), `pointsProduit` pour situer une menuiserie sans réservation, `regrouper` (morceaux superposés), locaux avec point intérieur et surface (`dedans`).
- **Équipement minimal** `js/equipement.js` (sans écran : `besoinsPiece` — seule définition des besoins par pièce, utilisée aussi par `nfcChecks` —, `manquants`, `equiperPiece`) + `js/equipementui.js` (sections des inspecteurs de la pièce et du niveau). Vide de moins de 1 m² au nom automatique (`estVide`, `VIDE_MAX`) : rien n'y est demandé, ni par l'équipement ni par les contrôles de pièce.
  Gros plan (100 logements, 600 appareils) : inspecteur du niveau 23 ms (compte rapide `aPoser`, sans positions) ; équiper tout le niveau 0,3 s.
- **Relier les appareils sans circuit** `js/affectation.js` (sans écran : `relierSansCircuit(plan, ctx)` → proposition ; `nbSansCircuit`) ; écran : `relierAppareils` dans `tableau.js`. À préférer à `generateFromPlan` sur un plan déjà travaillé : la régénération remplace tous les circuits (depuis le 12 novembre : copie de sécurité dans l'historique, `reporterCircuits` fait suivre gaines, cases « posé » et données des circuits identiques ; le graphe des gaines ignore les circuits disparus via `G.portes`).
- **Outil « Mesurer »** `js/mesure.js` (outil `mesure` dans `EXT.tools`, calcul `mesureCalc`) ; rien n'est enregistré dans le plan sauf « Transformer en cotes ».
- **Rappel de la sauvegarde complète** `js/sauvegarde.js` (sans écran : `etatSauvegarde`) + `js/rappelui.js` (date dans IndexedDB `meta`/`sauvegarde` et localStorage `calque.sauvegarde`, bandeau, libellé du menu) ; date enregistrée par `exportAll` quand le fichier est enregistré ou envoyé.
- Mesures sur gros projets (12 novembre 2026) : sauvegarde de 150 photos (219 Mo) : 10 Mo de mémoire au plus à l'écriture, 111 Mo à l'import ; dossier PDF de 100 logements : 115 pages en 0,7 s.
- **Assistant** `js/assistant.js` (sans écran : `avancement(plan, ctx)`) + `js/assistantui.js` (fenêtre, chargée à la demande depuis le menu).
- **Raccordement automatique** : `raccorderCircuit(plan, cid, opts)` dans `itineraire.js` (sans écran, ne modifie pas le plan) ; écran : `raccorderAuto` (`routeui.js`), `creerGaineElec` (`reseaux.js`), boutons dans `metres.js` et l'inspecteur.
- **Disjoncteur d'abonné** : `agcpOf(kva, reseau)` et `KVA_PALIERS` dans `elecdonnees.js` (valeurs usuelles, « estimées »).

## Module « Plans électriques » (13 novembre 2026, branche `claude/calque-electrical-plans-module-tbt1ea`)
Détail : `docs/MODULE_ELECTRIQUE.md`. **Fusionné dans `main` (demande n°11).** Format des plans **v13** (v13 : pose de gaine « cloison », symboles `derivation_mur` et `sortie_rad` ; `poseAHauteur`, `DERIVATIONS` et `tracerALongueur` dans `cheminement.js`).
- **Moteur de câblage** `js/cablage.js` (sans écran) : conducteurs de chaque tronçon de gaine par circuit (`cablagePlan`, mémorisé), désignations, longueurs, quantités (`quantitesConducteurs`, utilisées par `materiel.js` et `quantitatif.js`), contrôles (`controlesCablage`, repris par `regles.js`, règles `cb_…`).
- **Calques et vues** `js/calques.js` (sans écran) + `js/calquesui.js` : 12 calques, 8 vues prédéfinies, vues du plan ; visibilité intégrée à `elecVisible` / `ductVisible` / `linkVisible`, rendu (`rendu2d.js`), sélection (`hitTest`, outil Groupe).
- **Gestionnaire de circuits** `js/circuitsui.js` (sélections `{ t: 'circuits' }` et `{ t: 'circuit', id }` par `EXT.obj` / `EXT.insp`), filtre de plusieurs circuits `S.filt.circs` (`circsFiltre` dans `reseaux.js`).
- **Outil « Câbler »** et propositions de raccordement `js/cablerui.js` (outils `cabler` et `propose`, dessin `EXT.cablage`).
- **Nomenclature du tableau** `js/nomenclature.js` ; **export SVG** `js/svgexport.js` ; chapitre `plans_elec` du dossier.

## Onglet « Schémas » (13 novembre 2026)
Éditeur de schémas électriques indépendant du bâtiment, rangé dans le projet (`P.schemas`, format **v14**) : `js/schemasymboles.js`, `js/schema.js` (sans écran), `js/schemaui.js`. Folios A3 avec cartouche, 45 symboles, fils d'équerre, repères et numéros de fils automatiques, renvois croisés, nomenclature, borniers, liste des fils, contrôles, 4 modèles, import du tableau, exports PDF / SVG / DXF. Tests : `tests/schemas.test.mjs`.

## Demandes du 13 novembre 2026 (format v15, branche `claude/elegant-ritchie-zjivgm`)
- Trémie à la forme réelle de l'escalier (`stairZones` dans `symboles.js`, `tremieHoles` dans `vue3d.js`), réglage `tremie: 'aucune'` ; sol d'une pièce supprimé (`sol: 'vide'` sur l'étiquette).
- Terrasse et balcon d'un seul niveau (`ext` sur l'étiquette, `PIECES_EXT` / `estExterieure` dans `noyau.js`) : hors surface habitable et hors contrôles de pièces ; garde-corps de 100 cm.
- Colonne de passage du tableau (`colonneTableau`, `membresColonne`, `tailleColonne` dans `cheminement.js` ; passages `traversee` avec `col`, `tab`, `w`, `d`) : un seul nœud du réseau des gaines, relié directement au tableau ; créée en posant le tableau, suit le tableau (`syncDucts`).
- Conducteurs choisis gaine par gaine (`conds` de la gaine, `choixGaine`, `libelleTroncon`, anomalie `cb_cable_petit` dans `cablage.js`).
- Mode « Tester » des schémas : `js/simulation.js` (sans écran), dessin des contacts dans leur position (`dessinerSymbole(c, o, coul, etat)`), couleurs des potentiels (`SIM_COUL` dans `schema.js`). L'état du test n'est jamais enregistré dans le plan.
- Tests : `tests/demandes.test.mjs`.

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
- `node --test tests/*.test.mjs` : **175/175 réussis** (onglet Schémas : `schemas` (4 tests)) ; avant : **171/171 réussis** (13 novembre 2026, après les demandes sur les gaines : `gaines` (2 tests)) ; avant : 169/169 (13 novembre 2026, module « Plans électriques » : `cablage` (5 tests), `planselec` (7 tests), `exemple` (2 tests)).
- Fichiers : `architecture`, `stockage`, `ipad`, `bibliotheque`, `technique`, `composants`, `fond`, `catalogue`, `calcul` (15 tests, valeurs calculées à la main), `fiche` (4 tests), `cheminement` (9 tests), `eclairage` (6 tests, fichiers de synthèse dans `tests/synthese.mjs`), `vue3d` (3 tests), `documents` (7 tests), `regles` (5 tests), `exemple` (1 test), `chantier` (6 tests), `variantes` (4 tests), `dxf` (3 tests), `quantitatif` (6 tests), `multi` (4 tests), `dxfimport` (3 tests), `routage` (5 tests), `dxfmurs` (4 tests), `ifc` (7 tests), `assistant` (2 tests), `equipement` (4 tests), `sauvegarde` (5 tests), `affectation` (4 tests), `regeneration` (3 tests), `mesure` (2 tests), `migrations` (2 tests : v1 → v11 sans perte, v2 à v10), `fondtraits` (2 tests).
- Tests : les polices d'internet sont bloquées dans les tests (`tests/outils.mjs`) : le test d'image de `ipad.test.mjs` qui échouait de temps en temps (police arrivée en cours de test) est stable (3 suites complètes de suite sans échec, 11 novembre 2026).

## Points ouverts
- Essais iPad de la phase 5 : **validés** par l'utilisateur le 5 novembre 2026 (« tout marche »), y compris un vrai fichier IES / LDT de fabricant. Essais iPad de la phase 4 : **validés** le 5 novembre 2026. Phase 3 validée sur iPad le 5 novembre 2026.
- 3D : un appareil mural ne se déplace pas depuis la 3D (sur le plan seulement) ; la coupe n'a pas de face de remplissage (les murs coupés paraissent creux).
- Itinéraire proposé niveau par niveau (passer d'un étage à l'autre par un passage entre étages déjà raccordé).
- Import des catalogues fabricants : mis de côté par l'utilisateur (module `js/catalogue.js` prêt, inactif).
- Raccordement automatique : les gaines proposées peuvent longer un mur par l'extérieur ou se superposer entre circuits (une gaine par circuit) : à corriger à la main si besoin. Un cheminement commun existant (sans circuit attitré) est utilisé ; les gaines proposées ne sont pas regroupées entre elles.
- Reconnaissance des murs : validée sur des plans de synthèse (droits, tournés, avec du « bruit ») ; sur un vrai plan d'architecte le résultat dépendra du dessin (murs en hachures pleines, murs courbes, poteaux : non reconnus) : à essayer avec un fichier réel et à ajuster.
- Sauvegarde complète : écrite par morceaux (`photosEnParties`) et relue par morceaux (`js/lecture.js`, `lireSauvegarde`) : 225 Mo → 10 Mo de mémoire à l'écriture, 111 Mo à la lecture (au lieu de 239 et 377). Un « Envoyer le fichier du plan » d'un seul plan avec beaucoup de photos est encore écrit et lu d'un seul tenant (rare).
- Import IFC : validé sur des maquettes écrites par IfcOpenShell, sur une vraie maquette Allplan 2016 de l'utilisateur, et (12 novembre 2026) sur six maquettes publiques Revit 2011 / 2015 / 2021 et ArchiCAD 11 / 18 (fichiers hors du dépôt) : tous les murs droits lus, y compris ceux décrits en facettes ; portes et fenêtres sans réservation placées d'après leur volume (`deduite`) ; morceaux empilés regroupés (`fusions`) ; murs en hauteur écartés. Murs courbes ou en L d'un seul bloc non repris (comptés) ; murs non rectangulaires (pignons) repris par leur plus grande longueur. Maquette de construction très détaillée (peaux de mur séparées) : plan chargé, à nettoyer à la main.
- Import DXF : essayé avec des fichiers écrits par ezdxf et par Calque, et (13 novembre 2026) sur deux vrais plans publics (maison AutoCAD 2004 en pouces, bâtiment Ceco.NET en mètres) : unité invraisemblable du fichier écartée, murs principaux reconnus, noms des pièces repris du calque des textes. « Créer aussi les murs » reste une proposition : sur un vrai plan, les grandes pièces ouvertes, les portes sans arc et les menuiseries dessinées en traits multiples ne ferment pas toujours les pièces. Pas encore essayé sur un plan français (ArchiCAD, Revit, AutoCAD). DXF binaire et DWG non lus.
- Export DXF : non essayé dans AutoCAD lui-même (vérifié avec la bibliothèque ezdxf et un rendu) ; à ouvrir une fois dans le logiciel du destinataire.

## Branches
- `main` : version utilisée tous les jours (GitHub Pages).
- `claude/layer-modification-prompt-feasibility-nw7oa4` : branche de développement des phases 1 à 7 (fusionnée).
- `claude/ecstatic-sagan-juah82` : branche de la mission « développement autonome » (partie de `main` après la fusion n°6).
- `claude/calque-electrical-plans-module-tbt1ea` : module « Plans électriques » (partie de `main` après la fusion n°10), à fusionner après les essais iPad.

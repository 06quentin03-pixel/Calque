# Architecture de Calque

Mise à jour : 9 novembre 2026 (export DXF, quantitatif et chiffrage).

## Principe

- Application web hors ligne, sans bibliothèque externe ni outil de compilation.
- `index.html` contient la page (styles et structure) et charge un seul script : `js/main.js`.
- Le code est réparti en **modules JavaScript natifs** (`import` / `export`), compatibles avec Safari sur iPad et GitHub Pages.
- Chaque module déclare explicitement ce qu'il utilise des autres modules (lignes `import` en tête de fichier) et ce qu'il fournit (ligne `export` à la fin).
- La 2D, la 3D, le tableau et les exports lisent **le même plan** `P` : il n'y a jamais de seconde copie des données.

## Les modules (`js/`)

| Fichier | Rôle | Sans écran (Node) |
|---|---|---|
| `main.js` | Point d'entrée : charge les modules, démarre l'application | — |
| `noyau.js` | Utilitaires, vecteurs, formats, réglages `S`, plan courant `P`, index `IDX`, état de l'interface `ui`, couleurs `C` | oui |
| `geometrie.js` | Géométrie des murs : jonctions, détection des pièces (`geo(niveau)`) | oui |
| `mutations.js` | Ajout, découpe et fusion des murs ; repères des objets | oui |
| `historique.js` | Annuler / rétablir (blocs partagés entre étapes) | oui |
| `symboles.js` | Mobilier, escaliers, 176 symboles électriques, catalogues | oui |
| `bibliotheque.js` | Rangement de la bibliothèque : domaines, sous-catégories, recherche | oui |
| `technique.js` | Bibliothèque technique générique (articles, fiabilité, recherche, fusion des références) | oui |
| `catalogue.js` | Lecture des catalogues fabricants CSV et .xlsx, reconnaissance des colonnes (préparation, pas encore d'écran) | oui |
| `composants.js` | Composants personnalisés : contrôle, fusion, pose, copie dans le plan | oui |
| `fondcalc.js` | Fond de plan : échelle par 2 points, échelle PDF, rotation, lecture des longueurs | oui |
| `fond.js` | Fond de plan : import image/PDF, dessin sous les murs, outils « échelle » et « déplacer », réglages | non |
| `mabiblio.js` | Ce que l'utilisateur ajoute aux bibliothèques, enregistré sur l'appareil (IndexedDB `meta`/`biblio`) | non |
| `biblioui.js` | Fenêtre « Bibliothèque technique », saisie des références, section « Matériel » de l'inspecteur | non |
| `evenements.js` | Signaux entre modules (« le plan a changé ») | oui |
| `rendu2d.js` | Dessin du plan en 2D (canvas), zone visible | non |
| `elecdonnees.js` | Données électriques sans écran sorties de `electricite.js` : classement des symboles, types de circuits (`CK`), valeurs du contrôle (`SEC_MAX`…), puissance des symboles avec statut | oui |
| `normes.js` | Tableaux NF C 15-100 (extraits Legrand, source, édition, page, statut « manquante » ou « vérifiée » ; 2 recopiés), constantes estimées, règles citées | oui |
| `calcul.js` | Moteur de calcul : intensités mono/tri, P/Q/S, cos φ, chute de tension, contrôles à 3 statuts (section/calibre, points, type et calibre des différentiels…), fiche d'un circuit, bilan de puissance, équilibrage des phases | oui |
| `regles.js` | Moteur de règles versionnées : catalogue (identifiant, version, source, édition, origine, données), trois statuts, données utilisées et manquantes, rapport d'un plan (reprend les contrôles de `calcul.js`, `materiel.js` et de `nfcChecks`), jamais de conformité globale non vérifiée | oui |
| `reglesui.js` | Onglet « Contrôle NF C 15-100 » : rapport du plan, filtre, détail des règles, catalogue | non |
| `cheminement.js` | Cheminements : types (ICTA, IRL, goulotte, chemin de câbles), pose, hauteurs des symboles, verticales, longueur d'une gaine, passages entre étages, réseau des gaines (graphe), longueurs par circuit, réserve, nettoyage (migration) | oui |
| `itineraire.js` | Recherche d'itinéraire sur une grille du niveau, conflits des gaines (portes, fenêtres, murs, zones interdites, VMC) | oui |
| `routeui.js` | Zones interdites (outil, dessin, inspecteur), proposition d'itinéraire, sections « Cheminement » et « Conflits » | non |
| `materiel.js` | Remplissage des cheminements (« vérification nécessaire »), liste de matériel estimée | oui |
| `photometrie.js` | Photométries des luminaires : lecture des fichiers IES (LM-63, type C) et LDT (EULUMDAT), symétries, intensité I(C, γ) (interpolation), flux intégré, nettoyage | oui |
| `eclairage.js` | Concepteur d'éclairage : méthode des lumens, calcul point par point (composante directe), dispositions, trois propositions, implantation actuelle, nettoyage (migration) | oui |
| `eclairageui.js` | Fenêtre « Éclairage · pièce », section « Éclairage » de l'inspecteur d'une pièce, section « Photométrie » d'un luminaire, implantation | non |
| `metres.js` | Onglet « Cheminements » du Tableau électrique : longueurs par circuit, réserve, conflits, remplissage, matériel | non |
| `fiche.js` | Fiche de calcul d'un circuit (fenêtre ouverte depuis l'inspecteur du plan et le tableau), saisie des données de calcul avec leur statut | non |
| `electricite.js` | Circuits, génération du tableau, contrôles du plan `nfcChecks` (chacun avec l'identifiant `rid` de sa règle dans `regles.js`) (réexporte `elecdonnees.js`) | non |
| `reseaux.js` | Filtres d'affichage, conduits VMC et gaines, cotes modifiables | non |
| `interaction.js` | Vue, sélection, outils de dessin, aimantation, Apple Pencil | non |
| `tableau.js` | Onglet « Tableau électrique » : unifilaire, coffret | non |
| `interface.js` | Inspecteur, panneaux, niveaux, fenêtres | non |
| `stockage.js` | Enregistrement IndexedDB, versions, sauvegarde, import / export du fichier | non |
| `pdf.js` | Écriture d'un PDF sans bibliothèque : contexte canvas factice `PdfCtx`, polices Helvetica (WinAnsi), `buildPdf`, largeur d'un texte `textWidth` | oui |
| `svgpdf.js` | Relecture d'un SVG de Calque (schéma unifilaire, coffret) et dessin vectoriel sur un contexte canvas ou `PdfCtx` | oui |
| `documents.js` | Moteur documentaire : dossier PDF (page de garde, plans, schéma unifilaire, coffret, nomenclatures, bilan, métrés, éclairage, rapport de contrôle), cartouche et indice de révision, mentions « Estimée » / « Manquante », nettoyage de `doc` (migration v8) | oui |
| `dossierui.js` | Fenêtre « Dossier PDF » : chapitres, papier, cartouche, indices de révision, préparation et envoi du fichier | non |
| `export.js` | Export du plan : PDF à l'échelle, image PNG, partage ; plan d'un niveau dans une zone de page (`dessinerPlanZone`, pour le dossier) | non |
| `vue3d.js` | Maquette 3D (WebGL 2 écrit à la main) : gaines, goulottes et chemins de câbles à leurs dimensions et à leur pose, passages entre étages, câbles des circuits, coupes, murs transparents, masquage, modification depuis la fiche 3D | non |
| `chantier.js` | Suivi de chantier : cases « posé », avancement, réserves (numéros, statuts, dates), historique, simplification des traits, nettoyage (migration v9) | oui |
| `chantierui.js` | Onglet « Chantier » : plan simplifié, outils Posé / Annoter / Réserve / Photo, panneau « Suivi de chantier », inspecteurs des réserves, photos et annotations | non |
| `photos.js` | Images des photos du chantier dans IndexedDB (base `calque-photos`) : réduction JPEG, miniatures, sauvegarde en base64, images inutilisées | non |
| `variantes.js` | Variantes : partie électrique propre à chaque variante, création, copie, affichage, version principale, suppression protégée, nettoyage (migration v10), comparaison (appareils, puissance, éclairage, matériel, contrôles) | oui |
| `variantesui.js` | Fenêtre « Variantes », puce de la variante affichée, comparaison à l'écran | non |
| `assistant.js` | Étapes du projet déduites du plan (fait, à faire, à surveiller), sans jamais annoncer de conformité | oui |
| `assistantui.js` | Fenêtre « Où en est mon projet ? », boutons vers la bonne page | non |
| `equipement.js` | Besoins d'une pièce (seule définition, partagée avec le contrôle), équipement manquant, positions le long des murs | oui |
| `equipementui.js` | Sections « Équipement minimal » des inspecteurs de la pièce et du niveau | non |
| `sauvegarde.js` | Décision du rappel de sauvegarde complète (7 jours, report de 3 jours) | oui |
| `rappelui.js` | Date de la dernière sauvegarde complète, bandeau de rappel, libellé du menu | non |
| `affectation.js` | Relier les appareils sans circuit aux circuits existants (capacités, pièce, niveau), créer les circuits manquants, sans modifier l'existant | oui |
| `mesure.js` | Outil « Mesurer » : tronçons, total, surface, transformation en cotes | non |
| `dxf.js` | Export DXF R12 : contexte `DxfCtx` (hérite de `PdfCtx`) qui enregistre traits, cercles et textes par calque, `buildDxf` (unités mm/cm/m, Y vers le haut, Windows-1252) | oui |
| `dxfimport.js` | Lecture d'un DXF (LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, ELLIPSE, SPLINE, INSERT, TEXT, MTEXT), blocs développés, emprise sans les objets isolés, unité, dessin dans un canvas | oui |
| `dxfmurs.js` | Reconnaissance des murs dans les traits d'un plan : paires de traits parallèles → axe et épaisseur, angles fermés, ouvertures (porte, fenêtre, passage) | oui |
| `ifcimport.js` | Lecture d'une maquette IFC 2x3 / 4 (texte STEP) : unité, niveaux, murs (axe, épaisseur, hauteur), ouvertures, locaux | oui |
| `ifcui.js` | Import IFC : résumé de la maquette, création d'un nouveau plan | non |
| `lecture.js` | Lecture d'une sauvegarde complète par tranches : photos confiées par paquets, reste relu à la fin (mémoire faible) | oui |
| `fondtraits.js` | Accrochage aux traits d'un fond DXF (axes des murs, extrémités), index spatial, repère image ↔ plan | non |
| `quantitatif.js` | Quantitatif (appareillage, protections, matériel ; par pièce, par circuit), chiffrage (prix et temps saisis, total partiel), CSV, nettoyage de `chiffrage` (migration v11) | oui |
| `quantitatifui.js` | Onglet « Quantitatif » du Tableau électrique : saisie des prix sans reconstruire le tableau (`quantPatch`), « mes prix », export CSV | non |
| `multi.js` | Sélection multiple (outil « Groupe ») : rectangle, déplacement, rotation, copie (même niveau ou autre niveau), suppression, hauteur et circuit des appareils | non |
| `exemple.js` | Plan d'exemple « maison et atelier » : une fonction de chaque phase (règle du projet : toute nouvelle fonctionnalité y est ajoutée) | non |
| `demarrage.js` | Raccourcis clavier, démarrage | non |
| `miseajour.js` | Avis « nouvelle version disponible » | non |

« Sans écran » : le module se charge dans Node sans navigateur, ce qui permet de le tester avec `node --test`.
Les moteurs de calcul électrique (`calcul.js`), de règles (`regles.js`) et de documents (`documents.js`) sont écrits ainsi, en JavaScript pur.

### Règles pour modifier le code

1. **Variable partagée** : un module ne peut pas réaffecter une variable importée.
   - Il appelle la fonction de modification de son module d'origine : `setP(plan)`, `setGEO({})`, `setRC(contexte)`, `setDIMHIT([])`.
   - Lire une variable importée donne toujours sa valeur à jour.
2. **Code exécuté au chargement** : il ne doit utiliser que des modules déjà chargés. En pratique : le noyau et les modules sans écran.
   - Ce qui sert à plusieurs modules dès le chargement (comme `ui` ou `C`) va dans `noyau.js`.
3. **Nouveau fichier** : l'ajouter à la liste `CORE` de `sw.js` et changer le nom du cache. Un test le vérifie.
4. **Rendu 2D** : tout changement du plan appelle `requestRender()` sans argument. `requestRender(true)` est réservé aux changements de la seule couche du dessus (curseur, aperçu).
5. **Format des plans** : toute évolution ajoute une fonction `MIGRATIONS[n]` (dans `stockage.js`), incrémente `PLAN_VERSION` et ajoute un test.

7. **Outil, bandeau d'aide ou dessin ajouté par un module** : `EXT` (dans `noyau.js`) : `EXT.tools`, `EXT.hint`, `EXT.hintKey`, `EXT.under` (sous les murs), `EXT.overlay` (couche du dessus), `EXT.insp` (inspecteur d'un type d'objet, ex. `zone`) ; depuis la phase 7 : `EXT.top` (dessin au-dessus du plan), `EXT.hit` (sélection), `EXT.obj` et `EXT.del` (objet d'un type ajouté, suppression), `EXT.inspVide` (panneau sans sélection), `EXT.selectDown` (outil Sélection remplacé), `EXT.view` (changement de vue). Un outil `doigt: true` agit aussi au doigt en mode Apple Pencil.
6. **Domaine de bibliothèque ajouté par un module** : `LIB_EXTRA` (dans `bibliotheque.js`, pour être disponible dès le chargement).

## Événements (`evenements.js`)

```js
import { EV, on } from './evenements.js';
const stop = on(EV.PLAN_CHANGE, ({ cause }) => { /* recalculer… */ });
```

| Signal | Quand | Détail |
|---|---|---|
| `EV.PLAN_OUVERT` | Un plan vient d'être ouvert (démarrage, liste des plans, import, restauration) | `{ id }` |
| `EV.PLAN_CHANGE` | Le contenu du plan a changé | `{ cause }` : `modification`, `annuler`, `rétablir` ou `retour` (geste annulé) |

Une erreur dans un abonné est affichée dans la console sans bloquer l'application.

## Modèle de données : le plan `P`

Unités : **centimètres**. Axe Y vers le bas, comme à l'écran. Angles `rot` en degrés.
Chaque objet a un identifiant unique `id`. Les objets dessinés sur un étage ont un niveau `lv`.

| Champ | Contenu |
|---|---|
| `v` | Version du format (`PLAN_VERSION` dans `noyau.js`, actuellement 11) |
| `id`, `name` | Identifiant et nom du plan |
| `levels[]` | Niveaux : `id`, `name`, `elev` (altitude du sol fini), `h` (hauteur sous plafond), `slab` (épaisseur du plancher) |
| `nodes[]` | Angles des murs : `id`, `lv`, `x`, `y` |
| `walls[]` | Murs : `id`, `lv`, `a`, `b` (angles), `th` (épaisseur), `kind` (`mur` ou `cloison`), `h` (hauteur, facultative) |
| `openings[]` | Ouvertures : `id`, `wall`, `t` (position du milieu le long du mur depuis l'angle `a`), `w` (largeur), `kind` (`door`, `window`, `gap`, `closet`), `type`, `side`, `hinge`, `leaves`, `h`, `sill` (allège) |
| `items[]` | Mobilier et escaliers : `id`, `lv`, `k` (modèle), `type`, `name`, `x`, `y`, `w`, `d`, `rot`, `flip`, `label` (facultatif), `comp` (composant personnalisé, v3) |
| `elec[]` | Symboles électriques : `id`, `lv`, `type` (voir `symboles.js`), `x`, `y`, `rot`, `h` (hauteur de pose, ou `null`), `cid` (circuit), `art` (article de la bibliothèque technique, facultatif, v2), `comp` (composant personnalisé, v3), `mark` (marquage affiché, v3), `to` (passage entre étages `traversee` : son jumeau sur l'autre niveau, v6), `lum` (luminaire, v7 : `ph` photométrie du plan, `flux` en lm et `p` en W, données `{ v, st, src }`) |
| `rooms[]` | Étiquettes des pièces : `id`, `lv`, `name`, `x`, `y`, `tint` (couleur). Le contour de la pièce est calculé depuis les murs |
| `dims[]` | Cotes libres : `id`, `lv`, `ax`, `ay`, `bx`, `by` |
| `texts[]` | Textes : `id`, `lv`, `x`, `y`, `text`, `size` (`s`, `m`, `l`), `rot` |
| `circuits[]` | Circuits du tableau : `id`, `kind`, `name`, `cal` (calibre en A), `sec` (section en mm²), `rcd` (différentiel), `dda`, `ctrl`, `calc` (données de calcul, facultatif, v5 : `p` puissance en W, `cos`, `len` longueur en m, `dcab` diamètre extérieur du câble en mm (v6) — chacune `{ v, st, src }` ; `mat` `cu`/`al` ; `phase` `L1`/`L2`/`L3`/`tri`) |
| `rcds[]` | Interrupteurs différentiels : `id`, `type` (`AC`, `A`…), `cal` (calibre en A) |
| `links[]` | Liaisons commande → éclairage : `id`, `lv`, `a`, `b` (symboles) |
| `ducts[]` | Conduits : `id`, `lv`, `sys` (`vmc` ou `elec`), `mat`, `dia` (diamètre en mm), `a`, `b` (symboles aux extrémités), `pts[]`. Gaine électrique (v6, facultatifs) : `cid` (circuit principal), `cids[]` (autres circuits), `kind` (`icta`, `irl`, `goulotte`, `cdc`), `pose` (`sol`, `plafond`, `hauteur`), `z` (hauteur du parcours en cm, pose `hauteur`), `lw`, `lh` (largeur et hauteur en mm, goulotte et chemin de câbles) |
| `zones[]` | Zones interdites aux cheminements (v6) : `id`, `lv`, `pts[]` (contour), `name` |
| `photometries[]` | Photométries des luminaires (v7), lues dans des fichiers IES / LDT : `id`, `name`, `fab`, `file`, `fmt` (`ies`/`ldt`), `flux` et `p` (`{ v, st, src }`), `fluxLampes`, `C[]` et `G[]` (angles en degrés), `I[][]` (intensités en cd, une ligne par angle C) |
| `etudes[]` | Études d'éclairage par pièce (v7) : `id`, `lv`, `room` (étiquette de la pièce), `E` (éclairement visé, lx), `hu` (plan utile, cm), `mf`, `u` (données `{ v, st, src }`, facultatives), `hlum` (hauteur des luminaires, cm, facultative), `lums[]` (jusqu'à 3 : `type`, `ph`, `flux`, `p`), `ids[]` (luminaires posés par la dernière implantation) |
| `comps[]` | Copies des composants personnalisés utilisés par le plan (v3) : `id`, `kind` (`furn`/`elec`), `n`, `base` (modèle), `rang`, `w`, `d` ou `h`, `mark`, `tech` |
| `fonds[]` | Fonds de plan (v4), un par niveau : `id`, `lv`, `img` (clé dans `fondImg`), `name`, `wpx`, `hpx` (pixels), `s` (cm par pixel), `cx`, `cy` (centre), `rot`, `op` (opacité), `visible`, `cal` (échelle réglée), `pdfK`, `pdfE` (PDF) |
| `fondImg{}` | Images des fonds (v4), en `data:image/jpeg` |
| `doc` | Dossier PDF (v8) : `client`, `adresse`, `entreprise`, `auteur`, `affaire` (textes facultatifs du cartouche), `revisions[]` (`i` indice A, B…, `date` en ms, `objet`, `par`, `regles` version du moteur de règles) ; l'indice courant est la dernière révision |
| `chantier` | Suivi de chantier (v9) : `poses` (`app` : { id du symbole: date }, `circ` : { id du circuit: date }), `reserves[]` (`id`, `n`, `lv`, `x`, `y`, `titre`, `detail`, `statut` `ouverte`/`en_cours`/`levee`, `cree`, `maj`, `leve`, `echeance`, `ref` { t: `elec`, id }), `photos[]` (`id`, `lv`, `x`, `y`, `at`, `legende`, `aFaire`, `reserve`, `w`, `h` ; l'image est dans IndexedDB `calque-photos`, magasin `photos`, clé `id`), `notes[]` (annotations : `id`, `lv`, `pts` à plat en cm, `col`, `ep` en cm, `at`), `journal[]` (`at`, `k`, `txt`) |
| `variantes` | Variantes (v10, facultatif) : `active` (variante dans le plan), `principale`, `liste[]` (`id`, `nom`, `gamme` `eco`/`std`/`haut`/`autre`, `note`, `cree`, `maj`, `data` : `elec`, `circuits`, `rcds`, `links`, `ducts`, `etudes`, `install` des variantes non affichées ; `vide` si une variante a perdu ses données) |
| `chiffrage` | Chiffrage (v11) : `prix` { clé de ligne du quantitatif : `{ v, st, src }` } (prix unitaire HT), `temps` { clé : `{ v, st, src }` } (minutes de pose par unité), `tauxH` (€ HT / h) et `tva` (%) facultatifs ; tout est saisi par l'utilisateur |
| `install` | Installation : `kva` (puissance souscrite), `parafoudre`, `row` (modules par rangée du coffret), `reseau` (`mono`/`tri`, facultatif, v5), `ks` (coefficient de simultanéité `{ v, st, src }`, facultatif, v5), `reserve` (réserve de câble à commander en %, `{ v, st, src }`, facultatif, v6) |

Donnée de calcul `{ v, st, src }` : valeur, statut (`verifiee` — source obligatoire —, `saisie`, `estimee`) et origine. Une donnée absente n'est jamais remplacée : elle est signalée « manquante » dans la fiche de calcul.

Données dérivées, jamais enregistrées : `IDX` (index par identifiant), `GEO` (géométrie par niveau : polygones des murs, pièces, surfaces).
Elles sont recalculées par `touch()` après chaque modification.

## Bibliothèques de l'utilisateur (hors plan)

Enregistrées sur l'appareil dans IndexedDB (magasin `meta`, clé `biblio`) et dans `localStorage` (`calque.biblio`, secours) :
`{ refs: { [idArticle]: { ref, fab, fiab, source, note, at } }, comps: [composants], prix: { [clé de ligne]: { pu, tps, at } }, savedAt }`.
Elles sont ajoutées à la sauvegarde complète (champ `biblio`) ; l'import ne remplace jamais une donnée existante.

Date de la dernière sauvegarde complète (rappel) : IndexedDB `meta`, clé `sauvegarde` (`{ derniere, report }` en ms) et `localStorage` `calque.sauvegarde` ; la plus récente fait foi.
Fiabilité : `verifiee` (source obligatoire), `saisie`, `estimee`.

## Hors ligne et mises à jour

- `sw.js` (Service Worker) : « réseau d'abord ». La version en ligne est utilisée dès qu'il y a internet, sinon la copie locale.
- Tous les modules sont mis en cache dès l'installation.
- Quand une nouvelle version s'installe alors que l'application est ouverte, un bandeau propose « Recharger ». Le plan est enregistré avant le rechargement.

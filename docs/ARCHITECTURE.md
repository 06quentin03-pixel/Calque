# Architecture de Calque

Mise à jour : phase 3 (4 novembre 2026).

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
| `normes.js` | Emplacement des tableaux NF C 15-100 (extraits Legrand, source, édition, statut « manquante » ou « vérifiée »), constantes estimées, règles citées | oui |
| `calcul.js` | Moteur de calcul : intensités mono/tri, P/Q/S, cos φ, chute de tension, contrôles à 3 statuts, fiche d'un circuit, bilan de puissance, équilibrage des phases | oui |
| `electricite.js` | Circuits, génération du tableau, contrôle NF C 15-100 (réexporte `elecdonnees.js`) | non |
| `reseaux.js` | Filtres d'affichage, conduits VMC et gaines, cotes modifiables | non |
| `interaction.js` | Vue, sélection, outils de dessin, aimantation, Apple Pencil | non |
| `tableau.js` | Onglet « Tableau électrique » : unifilaire, coffret | non |
| `interface.js` | Inspecteur, panneaux, niveaux, fenêtres | non |
| `stockage.js` | Enregistrement IndexedDB, versions, sauvegarde, import / export du fichier | non |
| `export.js` | PDF intégré, image PNG, partage | non |
| `vue3d.js` | Maquette 3D (WebGL 2 écrit à la main) | non |
| `demarrage.js` | Plan d'exemple, raccourcis clavier, démarrage | non |
| `miseajour.js` | Avis « nouvelle version disponible » | non |

« Sans écran » : le module se charge dans Node sans navigateur, ce qui permet de le tester avec `node --test`.
Les futurs moteurs (calculs électriques, règles NF C 15-100) seront écrits ainsi, en JavaScript pur.

### Règles pour modifier le code

1. **Variable partagée** : un module ne peut pas réaffecter une variable importée.
   - Il appelle la fonction de modification de son module d'origine : `setP(plan)`, `setGEO({})`, `setRC(contexte)`, `setDIMHIT([])`.
   - Lire une variable importée donne toujours sa valeur à jour.
2. **Code exécuté au chargement** : il ne doit utiliser que des modules déjà chargés. En pratique : le noyau et les modules sans écran.
   - Ce qui sert à plusieurs modules dès le chargement (comme `ui` ou `C`) va dans `noyau.js`.
3. **Nouveau fichier** : l'ajouter à la liste `CORE` de `sw.js` et changer le nom du cache. Un test le vérifie.
4. **Rendu 2D** : tout changement du plan appelle `requestRender()` sans argument. `requestRender(true)` est réservé aux changements de la seule couche du dessus (curseur, aperçu).
5. **Format des plans** : toute évolution ajoute une fonction `MIGRATIONS[n]` (dans `stockage.js`), incrémente `PLAN_VERSION` et ajoute un test.

7. **Outil, bandeau d'aide ou dessin ajouté par un module** : `EXT` (dans `noyau.js`) : `EXT.tools`, `EXT.hint`, `EXT.hintKey`, `EXT.under` (sous les murs), `EXT.overlay` (couche du dessus).
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
| `v` | Version du format (`PLAN_VERSION` dans `noyau.js`, actuellement 4) |
| `id`, `name` | Identifiant et nom du plan |
| `levels[]` | Niveaux : `id`, `name`, `elev` (altitude du sol fini), `h` (hauteur sous plafond), `slab` (épaisseur du plancher) |
| `nodes[]` | Angles des murs : `id`, `lv`, `x`, `y` |
| `walls[]` | Murs : `id`, `lv`, `a`, `b` (angles), `th` (épaisseur), `kind` (`mur` ou `cloison`), `h` (hauteur, facultative) |
| `openings[]` | Ouvertures : `id`, `wall`, `t` (position du milieu le long du mur depuis l'angle `a`), `w` (largeur), `kind` (`door`, `window`, `gap`, `closet`), `type`, `side`, `hinge`, `leaves`, `h`, `sill` (allège) |
| `items[]` | Mobilier et escaliers : `id`, `lv`, `k` (modèle), `type`, `name`, `x`, `y`, `w`, `d`, `rot`, `flip`, `label` (facultatif), `comp` (composant personnalisé, v3) |
| `elec[]` | Symboles électriques : `id`, `lv`, `type` (voir `symboles.js`), `x`, `y`, `rot`, `h` (hauteur de pose, ou `null`), `cid` (circuit), `art` (article de la bibliothèque technique, facultatif, v2), `comp` (composant personnalisé, v3), `mark` (marquage affiché, v3) |
| `rooms[]` | Étiquettes des pièces : `id`, `lv`, `name`, `x`, `y`, `tint` (couleur). Le contour de la pièce est calculé depuis les murs |
| `dims[]` | Cotes libres : `id`, `lv`, `ax`, `ay`, `bx`, `by` |
| `texts[]` | Textes : `id`, `lv`, `x`, `y`, `text`, `size` (`s`, `m`, `l`), `rot` |
| `circuits[]` | Circuits du tableau : `id`, `kind`, `name`, `cal` (calibre en A), `sec` (section en mm²), `rcd` (différentiel), `dda`, `ctrl` |
| `rcds[]` | Interrupteurs différentiels : `id`, `type` (`AC`, `A`…), `cal` (calibre en A) |
| `links[]` | Liaisons commande → éclairage : `id`, `lv`, `a`, `b` (symboles) |
| `ducts[]` | Conduits : `id`, `lv`, `sys` (`vmc` ou `elec`), `mat`, `dia` (diamètre en mm), `a`, `b` (symboles aux extrémités), `pts[]` |
| `comps[]` | Copies des composants personnalisés utilisés par le plan (v3) : `id`, `kind` (`furn`/`elec`), `n`, `base` (modèle), `rang`, `w`, `d` ou `h`, `mark`, `tech` |
| `fonds[]` | Fonds de plan (v4), un par niveau : `id`, `lv`, `img` (clé dans `fondImg`), `name`, `wpx`, `hpx` (pixels), `s` (cm par pixel), `cx`, `cy` (centre), `rot`, `op` (opacité), `visible`, `cal` (échelle réglée), `pdfK`, `pdfE` (PDF) |
| `fondImg{}` | Images des fonds (v4), en `data:image/jpeg` |
| `install` | Installation : `kva` (puissance souscrite), `parafoudre`, `row` (modules par rangée du coffret) |

Données dérivées, jamais enregistrées : `IDX` (index par identifiant), `GEO` (géométrie par niveau : polygones des murs, pièces, surfaces).
Elles sont recalculées par `touch()` après chaque modification.

## Bibliothèques de l'utilisateur (hors plan)

Enregistrées sur l'appareil dans IndexedDB (magasin `meta`, clé `biblio`) et dans `localStorage` (`calque.biblio`, secours) :
`{ refs: { [idArticle]: { ref, fab, fiab, source, note, at } }, comps: [composants], savedAt }`.
Elles sont ajoutées à la sauvegarde complète (champ `biblio`) ; l'import ne remplace jamais une donnée existante.
Fiabilité : `verifiee` (source obligatoire), `saisie`, `estimee`.

## Hors ligne et mises à jour

- `sw.js` (Service Worker) : « réseau d'abord ». La version en ligne est utilisée dès qu'il y a internet, sinon la copie locale.
- Tous les modules sont mis en cache dès l'installation.
- Quand une nouvelle version s'installe alors que l'application est ouverte, un bandeau propose « Recharger ». Le plan est enregistré avant le rechargement.

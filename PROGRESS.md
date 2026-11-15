## 15 novembre 2026 (fin) — Panneau de droite en volets
- Sections du panneau repliables, choix retenus par sorte d'objet, Tout ouvrir / Tout fermer (`js/volets.js`).
- Tests : 215/215 (`ergonomie`, 7 tests).

## 15 novembre 2026 (suite) — Panneau de droite, explications, plancher et plafond sur mesure, cuisine en L
- Choix qui débordaient du panneau (capture de l'utilisateur) corrigés partout ; panneau plus large et plus lisible ; explications repliées derrière ⓘ ; plancher et plafond composés soi-même, Mes compositions ; meubles d'angle de cuisine.
- Défauts trouvés pendant les essais : meubles d'angle absents de la Bibliothèque (liste explicite), dernier pixel de l'écran non effacé avec une largeur non entière.
- Tests : 214/214 (`tests/ergonomie.test.mjs`, 6 tests).

## 15 novembre 2026 — Fiabilisation
- Bouton de suppression lisible, filet contre les plantages et journal des erreurs, contrôle complet des liens (Vérifier le plan), plans abîmés réparés à l'ouverture, suppressions sans trace, démarrage lent sans perte, calibres et sections manquants dits.
- Défauts trouvés par les nouveaux tests et corrigés : 13 sortes de plans abîmés qui ne s'ouvraient pas, 8 erreurs de dessin, plan illisible remplacé en silence par l'exemple, références orphelines après 4 sortes de suppressions, dessin perdu pendant un démarrage lent, « undefined A » dans le tableau, circuit sans calibre ignoré par le contrôle.
- Tests : 208/208 (`tests/fiabilite.test.mjs`, 12 tests).
## 14 novembre 2026 (soir) — Composition par tronçon, copier-coller d'une composition
- Choix « Ce tronçon / Tout le mur », tronçon seul par défaut ; « Copier la composition » / « Coller la composition » (`js/compositions.js`, `js/compositionsui.js`).
- Défaut corrigé au passage : un tronçon aligné de composition différente pouvait être tordu quand on élargissait son voisin vers un côté.
- Audit avant fusion : « Tout le mur » ne reste plus actif d'un mur à l'autre ; le panneau prévient quand un mur s'élargira des deux côtés malgré le sens choisi ; la composition copiée est revérifiée avant d'être collée.
- Vérifications : captures en 1180 × 820, 820 × 1180 et 390 × 844 (libellé raccourci pour le portrait). Tests : 197/197.

## 14 novembre 2026 (fin) — Onglet « Calculs »
- 21 calculs expliqués (formule, lettres, données, essai en direct), exemples calculés par les moteurs (`js/formules.js`, `js/calculsui.js`).
- Défaut trouvé pendant les essais : avec six onglets, le nom du plan devenait trop étroit en iPad portrait et paysage ; onglets resserrés.
- Tests : 195/195 (`tests/calculs.test.mjs`).

## 14 novembre 2026 (suite) — Déperditions, faux plafond, ajout d'un niveau, sens d'élargissement
- Déperditions des murs, pièces et niveaux (`js/thermique.js`, `js/thermiqueui.js`), couche choisie pour une gaine au plafond, grande fenêtre « Ajouter un niveau », élargissement d'un mur vers un côté (`changerEpaisseur`).
- Défaut corrigé : la fenêtre « Ajouter un niveau » ouverte depuis le panneau du niveau s'affichait écrasée au bas de l'écran.
- Format v17. Tests : 193/193 (`tests/thermique.test.mjs`).

## 14 novembre 2026 — Composition des murs, cloisons, planchers et plafonds
- Couches des murs et cloisons, plancher et plafond des niveaux, gaines logées dans la laine ou le vide technique, dessin des couches, surfaces des matériaux (`js/compositions.js`, `js/compositionsui.js`).
- Format v16 avec migration et copie de sécurité. Plan d'exemple complété (maison, atelier, plancher, plafonds, gaine dans la laine).
- Vérifications : captures en 1180 × 820, 820 × 1180 et 390 × 844 ; export SVG avec les couches.
- Tests : 190/190 (`tests/compositions.test.mjs`, 3 tests).

## 13 novembre 2026 — Demandes : escaliers, terrasses, colonne du tableau, câbles et fils, test des schémas
- Trémie en L ou en U à la forme de l'escalier, sol supprimé, terrasse et balcon d'un seul niveau (garde-corps), colonne de passage créée avec le tableau, conducteurs choisis gaine par gaine (fils ou câble), mode « Tester » des schémas (`js/simulation.js`).
- Format v15 avec migration et copie de sécurité. Plan d'exemple complété (escalier en L, balcon, vide sur entrée, colonne, choix des conducteurs).
- Défaut trouvé pendant les essais : export en double dans `vue3d.js` et `interaction.js` (l'application ne se chargeait plus), corrigé avant la fin de la session.
- Tests : 187/187 (`tests/demandes.test.mjs`, 12 tests).


## 13 novembre 2026 — Onglet « Schémas »
- Modules : `js/schemasymboles.js` (bibliothèque, sans écran), `js/schema.js` (moteur, sans écran), `js/schemaui.js` (écran).
- Vérifications : modèles sans court-circuit ni borne en l'air (test), auto-maintien et contact thermique reconnus, import du tableau d'un disjoncteur par circuit, dossier PDF de 15 pages sur le plan d'exemple, captures en 1180 × 820, 820 × 1180 et 390 × 844.
- Défauts trouvés et corrigés pendant les essais : renumérotation des modèles (deux bobines KM2), rattachement d'un contact auxiliaire à un contacteur, panneau qui masquait la feuille en portrait, nom du plan trop étroit avec le cinquième onglet.
- Tests : 175/175.

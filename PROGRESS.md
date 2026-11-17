## 17 novembre 2026 — Murs inclinés, toits, terrasses, piscine, chauffe-eau, KNX, ossature bois
- Murs inclinés et « Maison en A », masquer un mur en 3D ; toits (plat, 1, 2, 4 pans) avec panneaux solaires ; terrasses et sols sans murs ; piscine et ses volumes ; cinq types de chauffe-eau avec volume conseillé ; installation KNX (bus, adresses, contrôles, CSV) ; ossature bois à l'américaine (format v20).
- Nouveaux modules : `toits.js`, `toitsui.js`, `ecs.js`, `ecsui.js`, `knx.js`, `knxui.js`, `ossature.js`, `piscine.js`.
- Défauts trouvés pendant les essais : eau de la piscine cachée par la plage (la terrasse est maintenant percée) ; « Relier au bus » sans alimentation encore reliée ne reliait rien (départ pris sur l'alimentation) ; adresses de groupe proposées pour toutes les pièces de la maison (par défaut, seulement les pièces équipées KNX).
- Tests : voir CHANGELOG (`tests/exterieur.test.mjs`, 6 tests ; `exemple` +1).

## 16 novembre 2026 (soir) — Descente dans les murs, note de calcul du chauffage
- Gaines du plafond qui descendent dans la couche de passage du mur au-dessus de l'appareil (`descenteMur`, `itineraireEntre`), aussi en 3D.
- Note de calcul du chauffage pièce par pièce, export PDF, chapitre du dossier, relance (format v19) (`js/notechauffage.js`).
- Défauts trouvés pendant les essais : tableau de la note écrasé à hauteur nulle dans la fenêtre (corrigé) ; dans le plan d'exemple, boîtes raccordées avant la composition des murs (ordre corrigé).
- Tests : 234/234 (`tests/notechauffage.test.mjs`).

## 16 novembre 2026 (suite) — Câbles RJ45
- Câble RJ45 du coffret de communication à chaque prise RJ45 (`js/vdi.js`), depuis le panneau de la prise ou du coffret. Tests : 231/231. Fusionné dans `main` à la demande de l'utilisateur.

## 16 novembre 2026 — Câbles à tirer, raccordement en boîtes de dérivation
- « Équipement minimal » : hotte, sèche-serviettes, chauffe-eau, réfrigérateur, micro-ondes, chaudière du mobilier raccordés ; « Câbles à tirer » pour les appareils déjà posés.
- Raccordement automatique en boîtes de dérivation au plafond, gaines au plafond, descentes dans les cloisons (`js/boites.js`), au choix avec « De proche en proche ».
- Réponse écrite sur les études thermiques réglementaires (ROADMAP).
- Tests : 229/229 (`tests/boites.test.mjs`, 4 tests ; `exemple` complété).

## 15 novembre 2026 (soir) — Électroménager intégré, puissance conseillée des radiateurs
- Appareils logés dans les meubles (four sous la plaque, lave-vaisselle sous le plan de travail, micro-ondes en colonne…), sortie de câble radiateur et prises des appareils proposées, puissance conseillée d'un radiateur d'après la pièce (`js/integration.js`, `js/integrationui.js`, `puissanceConseillee`).
- Format v18. Défaut trouvé pendant les essais : glisser un meuble déjà choisi déplaçait l'appareil caché dessous au lieu du meuble ; corrigé (glisser = le meuble, toucher = l'appareil).
- Suite : « Local chauffé » au-dessus et au-dessous d'un niveau ; passages entre étages placés dans la couche de passage du mur, sinon en goulotte (`logementPassage`, `placerPassages`).
- Tests : 224/224 (`tests/integration.test.mjs`, 7 tests).

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

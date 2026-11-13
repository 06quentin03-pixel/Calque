# Module « Plans électriques » — audit et architecture d'intégration

Mise à jour : 13 novembre 2026 (branche `claude/calque-electrical-plans-module-tbt1ea`).

Ce document répond à la demande « module professionnel de plans de câblage électrique » : ce qui existait déjà
dans Calque, ce qui manquait, les risques, et la façon dont le module a été intégré **sans rien reconstruire**.

## 1. Ce que Calque savait déjà faire (réutilisé tel quel)

| Demande | Déjà présent | Module |
|---|---|---|
| Symboles électriques | 176 symboles vectoriels en 12 familles (prises, commandes, éclairage, communication, tableau, chauffage, VMC, moteurs, sécurité, accès, alarme…), orientables, avec hauteur de pose | `symboles.js` |
| Symboles personnalisés, bibliothèques | Composants personnalisés (marquage, référence), « mes références », bibliothèque technique | `composants.js`, `mabiblio.js`, `technique.js` |
| Circuits | Circuits du tableau (type, calibre, section, différentiel, DDA, commande), numérotation C1…, génération depuis le plan, « relier les appareils sans circuit » | `electricite.js`, `affectation.js` |
| Liaisons commandes → éclairage | Outil « Liaison » | `interaction.js` |
| Gaines, chemins de câbles | Gaines ICTA, IRL, goulottes, chemins de câbles ; pose sol / plafond / hauteur ; passages entre étages ; zones interdites | `cheminement.js`, `reseaux.js` |
| Longueurs | Réseau des gaines (graphe), longueur par circuit (verticales comprises), réserve de chantier | `cheminement.js` |
| Routage | Recherche d'itinéraire (murs, portes, zones interdites, VMC), raccordement automatique | `itineraire.js`, `routeui.js` |
| Tableau | Schéma unifilaire, coffret par rangées, bilan de puissance, équilibrage des phases | `tableau.js`, `calcul.js` |
| Calculs | Intensité, P/Q/S, chute de tension, contrôles à trois statuts, fiche de calcul | `calcul.js`, `fiche.js` |
| Règles | 51 règles versionnées avec source et édition, jamais de conformité globale non vérifiée | `regles.js` |
| Quantitatif | Appareillage, protections, matériel, par pièce et par circuit, prix saisis | `quantitatif.js` |
| Exports | Dossier PDF (plans, unifilaire, coffret, nomenclatures, bilan, métrés, quantitatif, contrôles), PDF à l'échelle, PNG, DXF ; import DXF et IFC | `documents.js`, `export.js`, `dxf.js` |
| Plusieurs niveaux, comparaison | Niveaux, passages entre étages ; variantes et leur comparaison | `variantes.js` |
| Équipements oubliés | Équipement minimal par pièce, contrôles de pièce | `equipement.js` |
| Annuler, sauvegarde | 150 étapes, IndexedDB + copie de secours | `historique.js`, `stockage.js` |

## 2. Ce qui manquait (développé par ce module)

1. **Moteur de câblage** (`js/cablage.js`, sans écran) : jusqu'ici, Calque comptait « phase, neutre, terre » par circuit,
   sans les navettes, les retours de lampe, les fils de commande ni le fil pilote. Le moteur reconstitue l'arbre du circuit
   le long des gaines et, pour chaque tronçon, les **conducteurs qui y passent** (fonction, nombre, désignation `3G1,5`),
   d'après des réseaux logiques (phase, neutre, terre, retour de chaque groupe d'éclairage, navettes des va-et-vient,
   commande des télérupteurs, fil pilote, montée/descente des volets). Valeurs **estimées** : schéma de câblage usuel,
   à adapter au schéma réel.
2. **Calques professionnels** (`js/calques.js`) : Architecture, Mobilier, Éclairage, Prises, Équipements spécialisés,
   Courants faibles, Tableau, Gaines, Chemins de câbles, Circuits (liaisons et câblage), Annotations, Cotations ;
   masquer, **verrouiller**, couleur, opacité, nom.
3. **Vues « Plans électriques »** : Architecture, Implantation, Câblage, Éclairage, Prises, Équipements spécialisés,
   Courants faibles, Synthèse, et vues enregistrées par l'utilisateur. Une même base de données (le plan `P`),
   aucune copie.
4. **Affichage d'un, de plusieurs ou de tous les circuits**, mise en évidence de l'arbre du circuit sélectionné.
5. **Gestionnaire de circuits** dans le plan (`js/circuitsui.js`) : liste, couleur, fonction, section, conducteur,
   protection (courbe), calibre, puissance, intensité, longueur, conducteurs, équipements raccordés.
6. **Outil « Câbler »** : relier deux équipements, dérivation sur une gaine existante, chaînage de plusieurs points ;
   chaque tracé est **proposé puis validé** par l'utilisateur. Le raccordement automatique devient lui aussi une
   proposition à valider.
7. **Contrôles de câblage** (erreur / avertissement / suggestion) intégrés au moteur de règles (« points d'attention de
   Calque », jamais présentés comme une conformité).
8. **Nomenclature du tableau** et **contrôles d'incohérence** circuit ↔ protection ↔ conducteur.
9. **Quantitatif relié au plan** (« Voir sur le plan » depuis chaque ligne) et conducteurs détaillés dans le matériel.
10. **Exports** : chapitre « Plans électriques » du dossier PDF (un plan par vue et par niveau, légende automatique
    des symboles, des circuits et des conducteurs), export **SVG** vectoriel du plan.
11. **Symboles redimensionnables** (taille par symbole).

## 3. Risques de régression identifiés et parades

| Risque | Parade |
|---|---|
| Plans existants | Format v12 avec migration `MIGRATIONS[11]` (nettoyage, rien de deviné) et copie de sécurité automatique ; test de migration. |
| Affichage existant (filtres, couches, export) | Les calques s'ajoutent aux filtres existants (familles, circuit) sans les remplacer ; sans réglage, tout reste visible comme avant. |
| Sélection | Un calque verrouillé n'est jamais verrouillé par défaut ; le verrouillage ne touche que la sélection (pas l'affichage). |
| Couleurs des circuits | Couleur automatique inchangée tant qu'aucune couleur n'est choisie. |
| Prix saisis du quantitatif | Les clés des lignes existantes sont conservées. |
| Performances iPad | Câblage calculé une fois par état du plan (cache par signature), dessiné seulement sur la zone visible ; rien n'est recalculé pendant un aperçu. |
| Export DXF | Les nouveaux dessins n'utilisent ni image ni dégradé (compatibles `DxfCtx`). |
| Règles | Les règles de câblage sont des « points d'attention de Calque » : elles ne rendent jamais un plan « conforme ». |

## 4. Architecture retenue

- **Sans écran (Node)** : `cablage.js` (conducteurs, contrôles), `calques.js` (définition des calques et des vues,
  appartenance d'un objet à un calque, nettoyage du format).
- **Écran** : `calquesui.js` (fenêtre « Calques et vues », pastille de la vue), `circuitsui.js` (gestionnaire de
  circuits, éditeur commun au plan et au tableau), `cablerui.js` (outil « Câbler », dessin du câblage, propositions de
  raccordement à valider), `svgexport.js` (contexte SVG).
- Les points d'extension existants sont utilisés (`EXT.tools`, `EXT.insp`, `EXT.top`, `EXT.overlay`, `EXT.hint`) :
  les moteurs existants ne sont pas réécrits.

## 5. Format v12

| Champ | Contenu |
|---|---|
| `calques` | `{ [idCalque]: { nom?, col?, op?, lock? } }` : personnalisation des calques (saisie) |
| `vues[]` | Vues enregistrées : `{ id, nom, off: [calques masqués], circs?: [circuits affichés] }` |
| `circuits[].col` | Couleur choisie (`#rrggbb`), sinon couleur automatique |
| `circuits[].courbe` | Courbe de déclenchement `B`, `C` ou `D` (saisie), facultative |
| `circuits[].cond` | Type de conducteur : `h07vu` (fils sous conduit), `r2v` (câble U-1000 R2V), `souple` (câble souple), facultatif |
| `elec[].sc` | Taille du symbole (0,5 à 3), facultative |

Réglages de l'appareil (hors plan) : `S.calq` (calques masqués), `S.vue` (vue courante), `S.filt.circs` (circuits affichés).

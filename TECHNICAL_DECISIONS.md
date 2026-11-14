
## 14 novembre 2026 — déperditions thermiques (format v17)
- **Méthode simplifiée** inspirée de la NF EN 12831 (parois U·A·ΔT·b, ponts thermiques ΔU forfaitaire, air 0,34·n·V·ΔT), Rsi/Rse conventionnels de l'EN ISO 6946. Présentée comme une aide au dimensionnement, jamais comme une étude réglementaire.
- **Valeurs estimées affichées comme telles** : λ des matériaux (ordres de grandeur, λ équivalent pour les blocs creux), coefficients b, 19 °C (22 °C en salle de bain), 0,5 vol/h, ΔU 0,1, Uw 1,5 / Ud 2,0. La température extérieure de base n'est **jamais** estimée : sans elle, résultat par degré (W/K) et statut « partiel ».
- Dimensions : longueur d'axe des murs × hauteur ; plancher et plafond à la surface de la pièce ; pertes entre pièces seulement si la voisine est plus froide ; terre-plein traité par un coefficient b (calcul EN ISO 13370 non fait).
- **Élargissement d'un mur** : le mur entier (tronçons alignés, même épaisseur, même composition) ; les angles bougent, les ouvertures des murs voisins sont recalées (`t`) pour rester en place ; le sens choisi est gardé pour la session seulement.

## 14 novembre 2026 — composition des murs (format v16)
- **Couches rangées sur le mur** (`w.couches`, du côté 1 = normale +n vers le côté 2) et sur le niveau (`L.sol`, `L.plafond`) ; aucune seconde copie : `w.th` est recalculé par `appliquerAuMur`, l'ancien champ reste la référence pour toute la géométrie (aucun moteur ne lit les couches pour dessiner les murs en 3D).
- **Épaisseurs proposées** : dimensions nominales courantes, marquées comme telles ; aucune donnée thermique ni référence de fabricant.
- **Logement des gaines** : contrôle géométrique (épaisseur de la couche ≥ diamètre) avec les statuts « place suffisante », « épaisseur insuffisante », « gaine noyée », « saignée à prévoir », « non vérifié » ; jamais « conforme ». Il n'est pas ajouté aux conflits des cheminements (les comptes existants restent inchangés).
- **Plafond** : informatif (plénum non ajouté aux hauteurs du niveau) ; le plancher donne `slab`.

## 13 novembre 2026 — onglet « Schémas »
- **Rangés dans le projet** (choix de l'utilisateur) : `P.schemas` profite de l'enregistrement, des versions, de la sauvegarde complète et d'« Annuler » ; aucune donnée du bâtiment n'y est liée (l'import du tableau crée une copie).
- **Millimètres sur un folio A3** ; bornes des symboles sur la grille de 5 mm : deux fils se relient quand leurs points coïncident (à 0,1 mm près) ou quand un bout de fil tombe sur un tronçon d'un autre fil (jonction dessinée) ; deux fils qui se croisent ne sont pas reliés. Un symbole relie seulement ses bornes aux bouts ou coudes des fils (jamais au milieu d'un tronçon) : sinon il serait court-circuité ; posé sur un fil, il le coupe entre ses bornes.
- **Tout est calculé, rien n'est stocké en double** : équipotentielles, numéros de fils (folio × 100 + rang, dans l'ordre des positions), numéros de contacts, renvois. Un numéro peut être imposé sur un fil ; une étiquette de potentiel nomme le fil et le relie à tous les fils de même nom.
- **Modèles** : une famille de repères dont un repère est déjà pris dans le projet est renumérotée en entier, dans l'ordre du modèle.
- **Dessin unique** (`dessinerFolio`) pour l'écran, le PDF (`PdfCtx`), le SVG (`SvgCtx`, unité mm) et le DXF (`DxfCtx` avec une échelle 0,1, écrit en mm).
- **Symboles « inspirés de la CEI 60617 »** : dessins simplifiés de Calque, présentés comme tels ; aucune référence de matériel n'est proposée (champ « référence » saisi).

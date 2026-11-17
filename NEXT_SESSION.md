# NEXT_SESSION — prompt et instructions pour la prochaine session

Mise à jour : 17 novembre 2026 (murs inclinés, toits et panneaux solaires, terrasses, piscine, chauffe-eau, KNX, ossature bois, branche `claude/jolly-heisenberg-lrjp4n`) ; avant : 16 novembre 2026 soir (descente dans les murs, note de calcul du chauffage, branche `claude/dazzling-babbage-7wt87f`) ; avant : câbles à tirer et boîtes de dérivation (fusionnés dans `main`) ; avant : électroménager intégré, branche `claude/sharp-thompson-n0tvun`.

Copiez le bloc ci-dessous au début d'une nouvelle session Claude Code.

---

```
Projet Calque (dépôt 06quentin03-pixel/Calque), suite du module « Plans électriques ».
Travaille sur la branche de développement indiquée par la session (git fetch, puis checkout). Ne modifie jamais main
toi-même : c'est moi qui fusionne.

Avant toute modification :
1. Lis CLAUDE.md, PROJECT_STATE.md, TECHNICAL_DECISIONS.md, NEXT_SESSION.md, ROADMAP.md, PROGRESS.md, CHANGELOG.md,
   docs/ARCHITECTURE.md et docs/MODULE_ELECTRIQUE.md, et respecte toutes les règles de CLAUDE.md.
2. Lance node --test tests/*.test.mjs : tout doit réussir (241/241 le 17 novembre 2026).
3. Demande-moi le résultat de mes essais sur l'iPad (liste ci-dessous) et corrige d'abord ce qui ne va pas.
   Demande-moi aussi de copier le Journal des erreurs (Menu › Journal des erreurs) s'il contient des incidents.

Ensuite, continue avec les pistes du ROADMAP (section « Module Plans électriques »), une à la fois, testée, avec le plan
d'exemple complété. Explique-moi tout simplement, en français : je débute sur GitHub et j'utilise un iPad.
```

---

## Pour essayer la branche sur l'iPad
La version publiée (GitHub Pages) est celle de `main`. Pour essayer le module dans l'appli de tous les jours, il faut
fusionner la branche dans `main` : sur github.com, onglet « Pull requests » › « New pull request » › base `main`,
compare `claude/calque-electrical-plans-module-tbt1ea` › « Create pull request » › « Merge pull request ».
Vos plans ne sont pas touchés : à la première ouverture, le format passe de v11 à v12 avec une copie de sécurité dans
Menu › Historique des versions (« Copie de sécurité avant mise à jour du format (v11 → v12) »).

## Essais du 17 novembre 2026 : murs inclinés, toits, terrasses, piscine, chauffe-eau, KNX, ossature bois
Pour l'essayer sur l'iPad : fusionner la branche dans `main` (github.com › Pull requests › New pull request › base `main`,
compare `claude/jolly-heisenberg-lrjp4n` › Create pull request › Merge pull request). Vos plans passent au format v20 à la
première ouverture, avec une copie de sécurité (Menu › Historique des versions, « v19 → v20 »).
Sur le plan d'exemple (Menu › Ouvrir le plan d'exemple), en paysage puis en portrait :
1. Niveau « Étage » : le toit de la maison (pointillés marron), les panneaux solaires sur le pan sud. Toucher le contour du
   toit : forme, pente, direction du faîtage, pans et leur orientation, « Panneaux solaires » (format, puissance d'un module).
   Vue 3D : toit, pignons, panneaux.
2. Rez-de-chaussée : la terrasse en bois devant la maison et la plage de la piscine (toucher l'intérieur). Toucher le bassin :
   volumes 0, 1, 2 en bleu, le projecteur 12 V signalé, « Poser le coffret de filtration ».
3. À gauche de la maison : l'abri de jardin en A. Toucher un mur › Inclinaison (33,7°), « Masquer en 3D », Ossature bois
   (entraxe 16 / 24 pouces, montants) ; zoomer : les montants sont dessinés dans le mur.
4. Toucher le vide du plan › Toits et terrasses › « Dessiner une terrasse » (toucher les angles) ; « Toit sur tout le niveau ».
5. Atelier › Sanitaires : toucher le chauffe-eau › Chauffe-eau : changer le type, le nombre de personnes, « Prendre le volume
   conseillé ». Vestiaires : le chauffe-eau instantané (débit, puissance, circuit triphasé).
6. Étage de l'atelier (mezzanine) : appareils KNX reliés par le bus (vert). Toucher le vide du plan › « Installation KNX » :
   lignes, contrôles, sorties d'actionneurs, adresses de groupe, « Exporter … (CSV) ». Toucher un appareil KNX › KNX.
7. Onglet Calculs : familles « Toit, ossature et énergie solaire », « Eau chaude sanitaire », « Domotique KNX ».
8. Dites-moi : vos catalogues KNX (fabricant, références, consommation sur le bus) à importer ; si vous voulez un mur de
   pignon triangulaire pour la maison en A ; si l'export CSV s'importe bien dans ETS.

## Essais de la descente dans les murs et de la note de calcul du chauffage (16 novembre 2026 soir)
Pour l'essayer sur l'iPad : fusionner la branche dans `main` (github.com › Pull requests › New pull request › base `main`,
compare `claude/dazzling-babbage-7wt87f` › Create pull request › Merge pull request). Vos plans passent au format v19 à la
première ouverture, avec une copie de sécurité (Menu › Historique des versions, « v18 → v19 »).
1. Plan d'exemple, séjour et chambre de la maison : zoomer sur une prise : la gaine arrive au plafond dans la laine de verre
   (jaune) du mur, juste au-dessus de la prise, puis rejoint la prise. Vue 3D : la descente est dans le mur.
2. « Tirer les câbles » dans la cuisine, puis « Valider » : même chose pour les nouvelles gaines.
3. Toucher le vide du plan (panneau du niveau) › Thermique › « Note de calcul du chauffage » : tableau des pièces, totaux,
   pièces à revoir ; changer la relance (10 → 20 W/m²) ; « Exporter la note en PDF » (Partager › Fichiers).
4. Menu › Dossier PDF : chapitre « Note de calcul du chauffage ».

## Essais des câbles à tirer et des boîtes de dérivation (16 novembre 2026, branche `claude/dazzling-babbage-7wt87f`)
Pour l'essayer sur l'iPad : fusionner la branche dans `main` (github.com › Pull requests › New pull request › base `main`,
compare `claude/dazzling-babbage-7wt87f` › Create pull request › Merge pull request). Le format des plans ne change pas (v18).
Sur le plan d'exemple (Menu › Ouvrir le plan d'exemple), en paysage puis en portrait :
1. Zoomer sur le séjour et la chambre de la maison : une boîte de dérivation au plafond de chaque pièce, les prises en partent.
2. Toucher la cuisine (nom de la pièce) › « Équipement minimal » : la prise de la hotte (1,80 m) est proposée ; plus bas,
   « Câbles à tirer » liste les appareils déjà posés qui attendent leur câble. Toucher « Tirer les câbles » : les gaines
   et les boîtes (carrés orange) sont proposées sur le plan ; « Valider » ; « Annuler » retire tout.
3. Salle de bain › « Équipement minimal » : la sortie de câble du sèche-serviettes est proposée ; « Poser l'équipement
   manquant », puis « Tirer les câbles ».
4. Tableau électrique › Cheminements › « Raccordement automatique » : choisir « De proche en proche » ou « Boîtes de
   dérivation (plafond et cloisons) », puis « Raccorder les … circuits incomplets ».
5. Onglet Calculs › « Position d'une boîte de dérivation ».
8. Câbles RJ45 : toucher une prise RJ45 › « Relier au coffret de communication » ; toucher le coffret de communication ›
   « Relier les prises RJ45 ». Les câbles sont en bleu-vert « RJ45 » sur le plan.
6. Dites-moi si les boîtes sont bien placées pour votre façon de câbler (au plafond de chaque pièce), et si vous préférez
   des boîtes murales ou des gaines horizontales dans les cloisons dans certains cas.
7. Études thermiques : dites-moi laquelle des deux pistes du ROADMAP (« Études thermiques ») vous intéresse.

## Essais de l'électroménager intégré et des radiateurs (15 novembre 2026 soir, branche `claude/sharp-thompson-n0tvun`)
Pour l'essayer sur l'iPad : fusionner la branche dans `main` (github.com › Pull requests › New pull request › base `main`,
compare `claude/sharp-thompson-n0tvun` › Create pull request › Merge pull request). Vos plans passent au format v18 à la
première ouverture, avec une copie de sécurité (Menu › Historique des versions, « v17 → v18 »). Sur le plan d'exemple :
1. Cuisine : le four est en pointillés « F » sous la plaque, le lave-vaisselle « LV » sous un plan de travail. Toucher la
   plaque › « Électroménager intégré » : le four est listé ; toucher une seconde fois la plaque au même endroit : le four.
2. Glisser la plaque : le four suit. Vue 3D : la porte du four est sous la plaque, le micro-ondes dans la colonne.
3. Toucher un meuble bas ou un plan de travail › « Électroménager intégré » › « + Lave-vaisselle » (ou un autre appareil).
4. Poser un four de la Bibliothèque près d'une plaque › son panneau › « Intégration » › « Intégrer dans « Plaque… » ».
5. Toucher la cuisine (nom de la pièce) › « Équipement minimal » : la prise du four est proposée ; « Poser l'équipement manquant ».
6. Séjour : le radiateur (meuble) a sa sortie de câble derrière lui ; toucher la sortie › « Puissance du chauffage » :
   puissance conseillée d'après la pièce, choix rapides 500 à 2 000 W, « Prendre … W ».
7. Poser un radiateur de la Bibliothèque (chercher « Radiateur ») dans une pièce › « Raccordement électrique » › « Poser : Sortie de
   câble radiateur » : elle est posée sur le mur derrière, avec la puissance conseillée.
8. Toucher le vide du plan (panneau du niveau) › Thermique : « Local chauffé » est proposé au-dessus et en dessous.
9. Local technique (atelier) : toucher le passage entre étages contre le mur de droite : « monte dans une goulotte » ;
   « Voir l'autre côté » : à l'étage, il est dans la laine de verre du doublage. Poser un passage contre un mur doublé :
   il se place dans le vide technique ou l'isolant ; « Position : Libre » le laisse où vous le posez.

## Essais des demandes du 15 novembre 2026 (même branche `claude/lucid-sagan-6h707m`)
Sur le plan d'exemple (Menu › Ouvrir le plan d'exemple), en paysage puis en portrait :
1. Toucher le vide du plan (panneau du niveau) › « Thermique » : les choix « Terre-plein, Vide sanitaire, Local non chauffé,
   Extérieur » et « Combles perdus, Local non chauffé, Toiture » passent à la ligne ; le panneau n'est plus coupé à gauche.
2. Le panneau de droite est plus large et plus lisible ; les longs textes gris finissent par ⓘ : le toucher ouvre l'explication.
3. Panneau du niveau › « Plancher, plafond et matériaux » › Plafond › « Composer moi-même » ; ajouter une couche ; taper un nom ;
   « Enregistrer dans mes compositions ». Sur un autre niveau : « Choisir une composition » › « Mes compositions » en tête.
5. Toucher un mur : le panneau montre les titres des sections ; toucher « Composition » l'ouvre ; toucher un autre mur :
   « Composition » est restée ouverte. « Tout ouvrir » / « Tout fermer » en haut du panneau.
4. Cuisine (rez-de-chaussée de la maison) : le meuble bas d'angle en L est dans le coin, le meuble haut d'angle au-dessus ;
   vue 3D ; Bibliothèque › Mobilier › Cuisine : meubles d'angle (bouton « Miroir » pour l'autre angle).

## Essais de la fiabilisation (15 novembre 2026, branche `claude/lucid-sagan-6h707m`)
Pour l'essayer sur l'iPad : fusionner la branche dans `main` (github.com › Pull requests › New pull request › base `main`,
compare `claude/lucid-sagan-6h707m` › Create pull request › Merge pull request). Le format des plans ne change pas (v17).
En paysage puis en portrait :
1. Toucher un mur › « Supprimer » : « Confirmer la suppression » est maintenant en blanc sur rouge, bien lisible.
2. Menu › **Journal des erreurs** › « Essayer le filet » : un bandeau « Essai du filet : un problème inattendu est survenu… »
   apparaît en haut ; « Détails » ouvre le journal ; « Copier le journal » ; « Effacer le journal » (toucher deux fois).
3. Menu › **Vérifier le plan** sur un de vos vrais plans : « Aucun lien cassé trouvé », ou la liste des problèmes avec
   « Réparer » (une copie de sécurité est gardée dans l'historique ; « Annuler » revient en arrière).
4. Supprimer un niveau qui a des réserves de chantier : elles sont gardées et rattachées au niveau affiché (message).
5. Si un jour quelque chose ne marche pas : Menu › Journal des erreurs › « Copier le journal », et le coller dans le message.
## Essais de la composition par tronçon (14 novembre 2026, branche `claude/wall-composition-per-room-877z62`)
Pour l'essayer sur l'iPad : fusionner la branche dans `main` (github.com › Pull requests › New pull request › base `main`,
compare `claude/wall-composition-per-room-877z62` › Create › Merge). Pas de changement de format : vos plans ne sont pas modifiés.
Sur le plan d'exemple :
1. Zoomer sur la salle de bain : ses cloisons ont la plaque hydrofuge (vert pâle « Plâtre H ») de son côté seulement.
2. Toucher une cloison faite de plusieurs tronçons alignés › Composition › « Ce tronçon » (choisi par défaut) : changer le
   matériau d'une plaque en « Plaque de plâtre hydrofuge » : seul le tronçon en surbrillance change. Annuler, puis « Tout le mur ».
3. « Copier la composition » sur un mur, toucher un autre mur › « Coller la composition : … ». « Inverser les côtés » si besoin.

## Essais de l'onglet « Calculs » (14 novembre 2026)
1. Toucher l'onglet **Calculs** (en haut, après Schémas) : lire une fiche (formule, lettres, données).
2. « Chute de tension » : passer la longueur à 40 m, la section à 1,5 mm², puis « Triphasé » : le résultat suit.
3. Rechercher « lux », puis toucher la famille « Thermique ».
4. Dites-moi si une explication n'est pas claire ou s'il manque un calcul.

## Essais de la suite du 14 novembre 2026 (format v17)
Sur le plan d'exemple, en paysage puis en portrait :
1. Toucher la Chambre (maison) › « Thermique (déperditions) » : environ 600 W, détail mur par mur, « Puissance posée suffisante » (radiateur de 1 000 W). Changer la température (puce 21 °C).
2. Toucher un mur extérieur de la maison › « Thermique » : U, résistance de chaque couche, déperdition vers l'extérieur. Dans la composition, remplacer le λ de la laine (ex. 0,032) : U baisse.
3. Toucher une fenêtre › « Coefficient Uw ».
4. Toucher le vide du plan › « Thermique » : température extérieure (−7 °C d'exemple : mettez celle de votre commune), sous le plancher / au-dessus du plafond, bilan du niveau.
5. Toucher une gaine posée « Plafond » au rez-de-chaussée › « Couche du plafond où passe la gaine » : Plénum ou Laine de verre.
6. Panneau du niveau › « Ajouter un niveau » : grande fenêtre ; essayer « Étage avec tous les murs », puis Annuler.
7. Toucher un mur extérieur › « Quand l'épaisseur change, le mur s'élargit » › « Vers extérieur », puis puce 30 cm : la face intérieure ne bouge pas, les murs voisins suivent. Annuler.

## Essais de la composition des murs (14 novembre 2026, branche `claude/loving-thompson-b92t8x`, format v16)
Pour l'essayer sur l'iPad : fusionner la branche dans `main` (github.com › Pull requests › New pull request › base `main`,
compare `claude/loving-thompson-b92t8x` › Create › Merge). Vos plans passent en v16 avec une copie de sécurité ; aucune
épaisseur de mur n'est modifiée. Sur le plan d'exemple (Menu › Ouvrir le plan d'exemple), en paysage puis en portrait :
1. Zoomer sur un mur de la maison : les couches sont dessinées (plaque, laine de verre jaune ondulée, brique, enduit).
2. Toucher un mur › « Composition » : changer l'épaisseur de la laine (puces 4,5 / 6 / 7,5…), monter ou descendre une couche,
   « Inverser les côtés » ; l'épaisseur du mur suit. Annuler.
3. Toucher une cloison › choisir « Brique de 10 enduite » ; « Appliquer aux … autres cloisons du niveau » (toucher deux fois).
4. « Utiliser pour les prochaines cloisons », puis outil Mur › Cloison : le bandeau affiche la composition ; tracer une cloison.
5. Local technique (atelier, en haut à gauche) : toucher la gaine dans le mur › « Logement dans les couches » : « Place
   suffisante … Laine de verre ». Tracer une autre gaine « Cloison » sur l'axe d'un mur › « Placer dans la couche de passage ».
6. Toucher le vide du plan (panneau du niveau) › « Plancher, plafond et matériaux » : plancher, faux plafond, surfaces estimées.
7. Menu Affichage › « Composition des murs (couches) » : les couches disparaissent et reviennent. Export PDF : couches visibles.

## Essais des demandes du 13 novembre 2026 (branche `claude/elegant-ritchie-zjivgm`, format v15)
Sur le plan d'exemple (Menu › Ouvrir le plan d'exemple), en paysage puis en portrait :
1. Vue 3D, niveau Étage : l'escalier en L de la maison ne découpe que ses marches dans le sol des combles ; le « Vide sur entrée » n'a pas de sol ; le balcon n'existe qu'à l'étage.
2. Plan, niveau Étage : toucher le Balcon › « Type de pièce » (terrasse, balcon), garde-corps ; la surface habitable ne le compte pas.
3. Plan, rez-de-chaussée : toucher le tableau › « Colonne de passage » (2 niveaux) ; déplacer le tableau : la colonne suit.
4. Pastille « Circuits » › un circuit de l'étage › « Conducteurs » : choisir « Fils » ou un câble pour chaque gaine ; le libellé sur le plan change.
5. Onglet Schémas › « Tester » : garder le doigt sur S2 (Marche), lâcher (auto-maintien), toucher S1, ouvrir Q1, déclencher F1 ; télérupteur et va-et-vient sur les autres folios.

## Essais de l'onglet « Schémas » (13 novembre 2026)
Sur le plan d'exemple (Menu › Ouvrir le plan d'exemple), onglet **Schémas**, en paysage puis en portrait :
1. Parcourir les folios (barre du haut) : démarrage direct, inverseur, télérupteur, va-et-vient, distribution ; zoomer à deux doigts.
2. Toucher la bobine KM1 : son panneau montre ses bornes (potentiels) et ses contacts avec leur position ; toucher un contact : « Appareil » ramène à la bobine.
3. « + Folio », puis **Symboles** › Commande › Bobine de contacteur : toucher la feuille au Pencil (KM… automatique) ; poser un contact à fermeture (il prend le même repère) ; **Fil** : toucher une borne orange puis une autre.
4. Déplacer un symbole au Pencil : les fils suivent. Annuler.
5. **Listes** : nomenclature, borniers, fils, contrôles. **Modèles** : ajouter « Démarrage direct » une seconde fois (repères renumérotés). **Depuis le tableau** : folios de distribution.
6. **Exporter** › Dossier PDF (Partager › Fichiers), puis SVG et DXF du folio ; ouvrir le PDF dans Fichiers.
7. En mode Apple Pencil : le doigt déplace la feuille, le stylet dessine.

## Essais des demandes sur les gaines (13 novembre 2026)
Sur le plan d'exemple : local technique (en haut à gauche de l'atelier), boîte de dérivation murale et gaine dans le mur
jusqu'à la sortie de câble radiateur.
1. Toucher une gaine › Pose › « Cloison » : hauteur du parcours, longueur totale avec les verticales.
2. Toucher une gaine dont un bout est libre › « Longueur horizontale du tracé » › taper 3,50 m (350) : le tracé s'allonge ; Annuler.
3. Menu Affichage (icône des couches) › « Gaines et chemins de câbles » : les gaines disparaissent et reviennent.
4. Bibliothèque › Électricité › Chauffage › « Sortie de câble radiateur » ; Tableau et énergie › « Boîte de dérivation murale » : poser au mur au Pencil, régler la hauteur et la puissance.

## Essais à faire sur l'iPad (ce que les tests automatiques ne couvrent pas)
Sur le plan d'exemple (Menu › Ouvrir le plan d'exemple), en paysage puis en portrait, au doigt et au Pencil :
1. **Pastille « Calques et vues »** (en haut à droite du plan) : choisir « Câblage », « Éclairage », « Implantation »,
   puis la vue enregistrée « Atelier : éclairage câblé ». Le plan change sans rien perdre ; « Synthèse » remet tout.
2. **Calques** : masquer « Mobilier » ; verrouiller « Architecture » puis essayer de toucher un mur (rien ne se
   sélectionne) ; changer la couleur des « Courants faibles » ; « Annuler » revient en arrière.
3. **Plan de câblage** : zoomer sur l'atelier ; sur les chemins de câbles, les petits traits obliques indiquent le
   nombre de conducteurs et les textes « C14 · 3G1,5 » la désignation. Dites-moi si c'est lisible ou trop chargé.
4. **Bouton « Circuits »** : toucher un circuit (ses appareils s'entourent, son tracé s'épaissit) ; « Afficher seul » ;
   cocher deux circuits ; changer la couleur, la courbe, le type de conducteur ; ouvrir le même circuit dans l'onglet
   Tableau électrique : les mêmes valeurs y sont.
5. **Outil « Câbler »** (barre de gauche) : toucher le tableau, puis une prise : un tracé orange est proposé ;
   « Créer la gaine » ; toucher une autre prise : elle rejoint le même circuit (dérivation). « Tracé direct » ;
   « Refuser » ; « Annuler ».
6. **Raccordement proposé** : Tableau électrique › Cheminements › « Raccorder les … circuits incomplets » : les gaines
   apparaissent en pointillés sur le plan ; « Refuser » ne change rien ; « Valider » les crée.
7. **Taille d'un symbole** : toucher un symbole › « Taille du symbole » › 150 %.
8. **Quantitatif** (Tableau électrique › Quantitatif) : bouton « Voir » d'une ligne de prises : elles sont entourées sur
   le plan. Lignes « Fil ou câble 1,5 mm² » : le détail compte maintenant navettes, retours et fil pilote.
9. **Coffret** (Tableau électrique › Coffret) : la « Nomenclature du tableau » sous le repérage des circuits.
10. **Contrôle NF C 15-100** : chaque ligne indique « Erreur », « Avertissement » ou « Suggestion » ; nouveau groupe
    « Câblage et cohérence ».
11. **Exports** : bouton Exporter › choisir « Câblage » dans « Plan » › PDF, puis SVG (Partager › Fichiers) ;
    Menu › Dossier PDF : chapitre « Plans électriques » (un plan par vue et par niveau, avec légende des circuits).
12. **Un de vos vrais plans** : il s'ouvre (copie de sécurité v11 → v12), la vue « Câblage » et le gestionnaire de
    circuits fonctionnent ; dites-moi si des constats de câblage vous paraissent faux.

## Toujours en attente de vous
- Extraits Legrand NF C 15-100 manquants (Iz, modes de pose, facteurs de correction, chutes de tension, simultanéité,
  remplissage) : sans eux, ces contrôles restent « vérification nécessaire » (voulu).
- Un vrai fichier DXF d'architecte et, si possible, une vraie maquette IFC, pour éprouver les imports.
- Votre avis sur le raccordement en boîtes de dérivation (16 novembre 2026) et sur les télérupteurs supposés au tableau.
- La température extérieure de base de votre commune, pour vos vrais plans (Thermique du niveau).

# CHANGELOG — historique des modifications

## 2026-11-05 — Nouveau plan d'exemple « maison et atelier »
- Essais iPad de la phase 4 **validés** par l'utilisateur.
- Le plan d'exemple (Menu › Ouvrir le plan d'exemple, et premier démarrage) devient **« Exemple : maison et atelier »** : la maison d'origine (inchangée) et un **atelier industriel de 40 × 20 m**. L'atelier comprend un hall de 625 m², une bande de locaux (local technique, vestiaires, sanitaires, bureau d'atelier) et une **mezzanine de bureaux** à l'étage (open space, salle de réunion).
- Il montre une fonction de chaque phase :
  - composants personnalisés (tour CN, fraiseuse, rayonnages, établis), articles de la bibliothèque technique, poteaux, escalier, porte sectionnelle, issue de secours ;
  - installation triphasée 36 kVA avec parafoudre, ks et réserve de câble saisis ; tableau divisionnaire alimenté depuis le tableau de la maison ; prises triphasées, arrêts d'urgence, BAES, bornes de recharge, projecteurs, contrôle d'accès, caméra, Wi-Fi ; données de calcul sur plusieurs circuits (phases L1/L2/L3 et triphasé) ;
  - 94 gaines : ICTA enterrée, chemins de câbles au plafond, goulotte à 1,10 m, IRL ; passage entre étages vers la mezzanine ; zone interdite (rayonnages) ; tout l'atelier est raccordé, donc ses longueurs, son remplissage et sa liste de matériel sont calculés ;
  - 4 études d'éclairage (atelier, bureau, open space, séjour) avec des réglettes et des dalles LED ;
  - cartouche du dossier PDF et indice A ; rapport de contrôle (plus de 400 contrôles).
- Les valeurs saisies dans l'exemple sont **fictives** et marquées comme telles (« valeur d'exemple de Calque ») : aucune donnée de fabricant, aucune valeur réglementaire.
- Nouveau module `js/exemple.js` (sorti de `demarrage.js`) ; nouveau test `tests/exemple.test.mjs`. Nouvelle règle du projet (CLAUDE.md) : chaque nouvelle fonctionnalité est ajoutée au plan d'exemple.
- Service Worker : cache `calque-v23`. Tests : 90/90.

## 2026-11-05 — Phase 6, étape 2 : moteur de règles versionnées (fin de la phase 6)
- Nouveau **moteur de règles** `js/regles.js` (sans écran, testé avec Node) : catalogue de **51 règles versionnées** (identifiant, version, groupe, source, édition de la norme, origine, données utilisées). Version du jeu de règles : « Calque-règles 2026.11 (1) ».
- Chaque résultat a l'un des **trois statuts** (conforme / non conforme / vérification nécessaire), avec le détail, l'objet concerné (circuit, différentiel, cheminement, symbole, pièce), les **données utilisées** (avec leur statut : vérifiée, saisie, estimée) et les **données manquantes** (dont les tableaux de la norme non fournis).
- **Tous les contrôles existants sont repris** : ceux du moteur de calcul (fiche de chaque circuit, interrupteurs différentiels, remplissage des cheminements) et les 49 contrôles de l'ancien onglet « Contrôle NF C 15-100 » (même message, même objet).
- Règle d'honnêteté : « conforme » n'est possible que pour une règle dont la source est vérifiée (extrait Legrand fourni, ou condition calculée comme IB ≤ In). Une règle de Calque dont la source n'est pas encore rattachée à un extrait est au mieux « vérification nécessaire » (« respecté d'après le contrôle de Calque, à confirmer ») ; un manquement reste « non conforme ». Les recommandations et points d'attention ne sont jamais « non conformes ».
- **Jamais de conformité globale** si tout n'est pas vérifié : l'avis du rapport le dit clairement. La pastille de l'onglet n'affiche plus de coche verte (nombre de non-conformités, sinon nombre de vérifications, en orange).
- Onglet **« Contrôle NF C 15-100 »** refait (`js/reglesui.js`) : trois compteurs, avis, filtre (Tous / Non conformes / À vérifier / Conformes), pour chaque contrôle le statut, le détail, « Règle, source et données » à déplier, bouton « Voir » ; catalogue des règles avec leur version.
- **Dossier PDF** : nouveau chapitre **« Rapport de contrôle »** (version du moteur, synthèse, avis, chaque contrôle avec sa règle, sa source, son édition, ses données). La version des règles est notée dans le cartouche et à chaque indice de révision.
- Service Worker : cache `calque-v22`.
- Nouveau fichier de tests `tests/regles.test.mjs` (5 tests). Tests : 89/89.

## 2026-11-05 — Phase 6, étape 1 : moteur documentaire (dossier PDF)
- Nouveau **Menu › Dossier PDF** : un seul fichier PDF qui regroupe la page de garde (sommaire, tableau des révisions, explication des statuts), les plans techniques (un niveau par page, à une échelle normalisée, avec légende), le schéma unifilaire et le coffret (vectoriels), les nomenclatures (circuits, différentiels, appareils par niveau, références de la bibliothèque technique avec leur fiabilité), le bilan de puissance, les métrés (longueurs, remplissage, matériel) et les études d'éclairage.
- **Cartouche sur chaque page** : projet, client et adresse, entreprise et auteur, n° d'affaire, titre de la page, échelle, **indice de révision**, date, page n / N.
- **Indices de révision** A, B, C… : « Enregistrer l'indice A » avec son objet. L'indice est gardé dans le plan, listé sur la page de garde, et une version de l'historique est enregistrée à chaque indice. Sans indice, le dossier est marqué « non diffusé » (aucun indice inventé).
- Ce qui est **estimé** (longueurs, matériel, éclairage, surfaces) est marqué « Estimée » ; une donnée **manquante** est écrite « Manquante » ; les chapitres des métrés et de l'éclairage commencent par un avertissement.
- Choix des chapitres, papier des plans et des schémas (A4 ou A3).
- Technique : le PDF est écrit sans bibliothèque et sans réseau. Le moteur d'écriture est sorti de `export.js` dans `js/pdf.js` (sans écran) ; `js/svgpdf.js` redessine les SVG du tableau en vectoriel ; `js/documents.js` (sans écran) fait la mise en page ; `js/dossierui.js` gère la fenêtre. `lignesCircuits` a été déplacé de `metres.js` vers `materiel.js` (sans écran).
- **Format des plans v8** : champ `doc` (cartouche et révisions). Migration v7 → v8 avec copie de sécurité dans l'historique ; rien n'est deviné.
- Service Worker : cache `calque-v21`, nouveaux fichiers dans `CORE`.
- Nouveau fichier de tests `tests/documents.test.mjs` (7 tests). Tests : 84/84.

## 2026-11-05 — Suivi
- Demande n°4 (phase 5) fusionnée dans `main` à la demande de l'utilisateur.
- Essais iPad de la phase 5 validés par l'utilisateur (« tout marche »).

## 2026-11-05 — Phase 5, étape 3 : 3D avancée (fin de la phase 5)
- **Chemins de câbles et goulottes** dessinés à leurs vraies dimensions (largeur × hauteur saisies) : goulotte en boîte rectangulaire, chemin de câbles en U ouvert (fond et rebords), gaines ICTA / IRL rondes à leur diamètre. Sans dimensions, dessin indicatif 60 × 40 mm, signalé dans la fiche.
- **Pose réelle** : chaque conduit est à la hauteur de sa pose (sol, plafond, hauteur donnée) ; descentes et remontées jusqu'aux appareils ; le réglage « par le plafond / par le sol » ne s'applique plus qu'aux gaines sans pose précisée. La fiche 3D d'une gaine affiche sa vraie pose, son type, sa taille et ses circuits.
- **Passages entre étages** : conduit vertical entre les deux symboles jumeaux, à travers le plancher.
- **Câbles** (option « Câbles ») : chemin réel de chaque circuit depuis le tableau, déduit des gaines (même calcul que les longueurs de l'onglet Cheminements), verticales et passages compris, un câble coloré par circuit, posé au fond des chemins de câbles et goulottes. Les gaines deviennent transparentes ; toucher un câble ouvre la fiche du circuit (points raccordés, longueurs, bouton « Fiche de calcul »).
- **Coupes** : horizontale (hauteur au-dessus du sol du niveau) ou verticale dans les deux sens, avec un curseur et « Inverser le côté » ; calculée par la carte graphique, sans reconstruire la maquette (fluide). La sélection au doigt ignore la partie coupée.
- **Murs transparents** : murs, cloisons, portes et fenêtres en transparence ; on touche ce qui est derrière.
- **Masquage** : bouton « Masquer » dans la fiche d'un objet, « Tout réafficher (n) » dans le panneau. Réglage de l'affichage seulement : le plan n'est jamais modifié.
- **Modification depuis la 3D** (fiche de l'objet touché), avec annuler / rétablir et enregistrement :
  - gaine : type, pose, hauteur du parcours, diamètre ou largeur × hauteur, suppression ;
  - symbole : hauteur de pose, suppression ; symbole au plafond ou au sol : **« Déplacer »** puis glisser au doigt ou au Pencil (un seul pas d'annulation par geste) ;
  - mur : hauteur ; meuble : hauteur et hauteur de pose, suppression.
- Téléphone : le panneau d'options s'efface pendant qu'une fiche est ouverte.
- Fluidité : reconstruction de la maquette du grand plan de test en 25 à 30 ms (avec ou sans câbles) ; pendant un déplacement, au plus une reconstruction toutes les 70 ms.
- Service Worker : cache `calque-v20`.
- Nouveau fichier de tests `tests/vue3d.test.mjs` (3 tests). Tests : 77/77.

## 2026-11-05 — Phase 5, étape 2 : lecture des fichiers IES et LDT
- `js/photometrie.js` lit, **sans bibliothèque et hors ligne**, les fichiers **IES** (IESNA LM-63, photométrie de type C ; plans 0°, 0–90°, 0–180°, 90–270°, 0–360° ; TILT=NONE ou INCLUDE) et **LDT** (EULUMDAT, les cinq symétries). La répartition est complétée par symétrie sur 360°.
  - **Flux du luminaire** : calculé en intégrant la répartition lue (lumière qui sort réellement du luminaire), « vérifiée », source = nom du fichier et fabricant. Le flux déclaré par le fichier (lampes × rendement) est affiché pour comparaison, avec une alerte au-delà de 5 % d'écart.
  - **Puissance** : celle indiquée par le fichier (« vérifiée »), sinon « non indiquée » (rien n'est deviné).
  - Fichier illisible, incomplet ou de type B / A : message clair, **rien n'est ajouté** au plan.
  - Texte en UTF-8 ou Windows-1252 (fichiers européens), reconnu automatiquement.
- Bouton **« Importer un fichier IES / LDT »** dans la fenêtre Éclairage (pour chaque luminaire étudié) et dans la section « Photométrie » d'un luminaire. Fiche du fichier : luminaire, fabricant, flux, puissance, efficacité (lm/W), **courbe photométrique** (C0–C180 et C90–C270).
- Le concepteur utilise la répartition du fichier (orientation du luminaire comprise) à la place de l'hypothèse lambertienne.
- Les fichiers sont enregistrés **dans le plan** (`photometries[]`) : disponibles hors ligne, envoyés avec le plan ; liste « Fichiers photométriques du plan » (retrait possible s'il n'est plus utilisé).
- Un luminaire relié à un fichier garde une copie du flux et de la puissance (statut et source) : le tableau et le bilan connaissent sa puissance.
- Tests : `tests/eclairage.test.mjs` passe à 6 tests (fichiers de synthèse `tests/synthese.mjs`, répartition au flux connu). Tests : 74/74.

## 2026-11-05 — Phase 5, étape 1 : concepteur d'éclairage (méthode des lumens, estimation)
- Nouveau module sans écran **`js/eclairage.js`** : méthode des lumens (E = N × Φ × U × MF / A), calcul point par point de la composante directe (éclairement minimal, uniformité Emin / Emoy), dispositions régulières jusqu'à 12 × 12, **trois propositions** distinctes (la plus économe, le moins de luminaires, la plus uniforme ; « autre disposition » à égalité).
  - **Aucune valeur d'éclairement réglementaire** : l'éclairement visé est toujours saisi (avec sa source si on veut). Sans lui, ou sans flux du luminaire : « données manquantes », aucune proposition.
  - Valeurs par défaut de Calque marquées « estimées » : plan utile 80 cm, facteur de maintenance 0,8. Facteur d'utilance : saisi (tableau du fabricant) ou, à défaut, calculé (part du flux qui arrive directement sur le plan utile, réflexions ignorées : estimation prudente).
  - Répartition lumineuse supposée lambertienne (« estimée ») tant qu'aucun fichier photométrique n'est associé.
- Nouveau module **`js/photometrie.js`** (sans écran) : intensité I(C, γ) d'une photométrie (interpolation), flux intégré, nettoyage. La lecture des fichiers IES / LDT arrive à l'étape 2.
- Fenêtre **« Éclairage · pièce »** (`js/eclairageui.js`), ouverte depuis l'inspecteur d'une pièce (section « Éclairage ») : objectif, jusqu'à 3 luminaires comparés, 3 propositions avec petit plan de la disposition, formule chiffrée, puissance totale et W/m², bouton **« Implanter sur le plan »**.
  - L'implantation pose des symboles normaux (déplaçables, supprimables, annulables) avec leur photométrie (`lum`) ; une nouvelle implantation remplace seulement les luminaires posés par l'étude. Circuit repris des autres luminaires de la pièce.
  - Section **« Implantation actuelle »** : recalculée à chaque modification du plan (luminaires déplacés, ajoutés, supprimés) ; « objectif atteint / non atteint (estimation) », jamais « conforme ».
- Inspecteur d'un luminaire : section **« Photométrie »** (flux et puissance avec leur fiabilité). La puissance du luminaire (`lum.p`) est reprise par le tableau et le bilan, avec son statut ; une puissance saisie sur le symbole reste prioritaire.
- **Format des plans v7** : `photometries[]`, `etudes[]`, `elec[].lum` ; migration v6 → v7 (listes vides, rien de deviné, valeurs invalides retirées) et copie de sécurité avant mise à jour.
- Service Worker : cache `calque-v19`, `js/eclairage.js`, `js/eclairageui.js`, `js/photometrie.js` ajoutés.
- Nouveau fichier de tests `tests/eclairage.test.mjs` (4 tests, valeurs calculées à la main). Anciens tests de migration rendus indépendants du numéro de version courant. Tests : 72/72.

## 2026-11-05 — Suivi
- Essais iPad de la phase 3 validés par l'utilisateur. Fusion de la demande n°3 (phase 4) demandée par l'utilisateur.

## 2026-11-04 — Phase 4, étape 4 : remplissage des cheminements et liste de matériel (fin de la phase 4)
- Nouveau module sans écran **`js/materiel.js`**.
- **Remplissage** de chaque gaine, goulotte ou chemin de câbles : circuits qui y passent (déclarés ou dont le cheminement l’emprunte, un câble par circuit), occupation de la section nominale si le diamètre extérieur de chaque câble et les dimensions du cheminement sont connus.
  - Statut **toujours « vérification nécessaire »** : le taux maximal admis n’est pas dans l’extrait Legrand fourni (tableau « Remplissage des conduits et goulottes » ajouté à `js/normes.js`, « manquant », reporté en phase 8). Source et édition affichées.
  - Données manquantes listées (type, diamètre ou dimensions, diamètre extérieur des câbles) : aucune valeur devinée.
- **Diamètre extérieur du câble** saisissable dans la fiche de calcul du circuit (`calc.dcab`, facultatif, avec sa fiabilité).
- **Liste de matériel (estimation)** dans l’onglet Cheminements : cheminements par type et taille (longueur verticales comprises + réserve), conducteurs par section (phase, neutre, terre ; navettes non comptées) pour les circuits entièrement raccordés, boîtes d’encastrement, boîtiers DCL, boîtes de dérivation, passages entre étages, traversées de murs et de cloisons. Toutes les quantités sont « estimées », sans référence fabricant.
- Remplissage aussi dans l’inspecteur d’une gaine.
- Service Worker : cache `calque-v18`, `js/materiel.js` ajouté.
- `tests/cheminement.test.mjs` : 9 tests. Tests : 68/68.

## 2026-11-04 — Phase 4, étape 3 : recherche d’itinéraire, zones interdites et conflits
- Nouveau module sans écran **`js/itineraire.js`** : recherche d’itinéraire sur une grille du niveau (quatre directions, virages limités), conflits d’une gaine et de tout le plan.
  - Les traversées de murs et de cloisons coûtent cher (chacune = un percement) ; les zones interdites sont infranchissables (avec une marge) ; les conduits de VMC sont évités ; pour une gaine posée « à une hauteur donnée », les portes sont infranchissables.
  - Aucun itinéraire possible → message, rien n’est inventé.
- **Zones interdites** (trémie, conduit de fumée, zone humide…) : outil depuis la barre de l’outil Conduit (gaine électrique) ou depuis l’inspecteur d’un symbole ; angles touchés au doigt ou au Pencil ; zone hachurée en rouge, sélectionnable (nom, suppression), enregistrée dans le plan (`zones[]`, format v6).
- **Proposer un itinéraire** : dans l’inspecteur d’un appareil relié à un circuit et pas encore raccordé. Départ : le point déjà raccordé au tableau le plus proche sur le même niveau (tableau, appareil du même circuit, passage entre étages, boîte de dérivation). Aperçu sur le plan, puis « Créer la gaine » (type et pose repris du dernier choix) ; la gaine reste modifiable et « Annuler » la retire.
- **Conflits** (points d’attention de Calque, pas des règles de la norme) : gaine qui coupe une porte ou une fenêtre (selon sa pose), passe dans une zone interdite, croise un conduit de VMC ; traversées de murs et de cloisons (percements à prévoir). Affichés dans l’inspecteur de la gaine et dans l’onglet Cheminements (avec « Voir »).
- La liste « Autres circuits » d’une gaine simple est repliée (toujours ouverte pour une goulotte ou un chemin de câbles).
- Toucher l’intérieur d’une zone interdite la sélectionne (le nom de la pièce reste prioritaire).
- Service Worker : cache `calque-v17`, `js/itineraire.js` et `js/routeui.js` ajoutés.
- `tests/cheminement.test.mjs` : 7 tests (dont une zone dessinée au doigt et un itinéraire créé depuis l’inspecteur).

## 2026-11-04 — Phase 4, étape 2 : longueurs des circuits et longueur L de la fiche de calcul
- **Réseau des gaines** (`js/cheminement.js`, sans écran) : tronçons, verticales jusqu’aux appareils, jonctions entre gaines (une extrémité libre posée sur une autre gaine s’y raccorde), passages entre étages (différence d’altitude entre les parcours des deux niveaux).
  - Un circuit n’emprunte que ses gaines et les gaines sans circuit ; il ne traverse pas l’appareil d’un autre circuit (seuls le tableau, les boîtes de dérivation, la GTL et les passages se traversent).
- **Trois longueurs par circuit**, depuis le tableau principal : à vol d’oiseau (comparaison), le long des gaines jusqu’au point le plus éloigné, et longueur de câble pour desservir tous les points ; **à commander** = câble + réserve, arrondi au mètre supérieur.
  - Réserve : 10 % par défaut (« estimée », valeur de Calque), modifiable (`install.reserve`).
- **Fiche de calcul** : sans longueur saisie, la longueur L vient du plan (« estimée », le long des gaines, verticales comprises, sans réserve) ; une saisie la remplace. Si le circuit n’est pas entièrement raccordé par les gaines, la longueur reste « manquante » (aucune valeur devinée) et la raison est donnée. Verticales non comptées (pose non précisée) : alerte « longueur probablement sous-estimée ».
- Nouvel onglet **Cheminements** dans Tableau électrique (`js/metres.js`) : circuits raccordés, câble à commander, réserve, tableau des longueurs par circuit avec accès à la fiche.
- Service Worker : cache `calque-v16`, `js/metres.js` ajouté.
- `tests/cheminement.test.mjs` : 5 tests (longueurs calculées à la main : 560 / 920 cm, 390 cm de verticales à travers un passage).

## 2026-11-04 — Phase 4, étape 1 : cheminements, verticales et passages entre étages
- Nouveau module sans écran **`js/cheminement.js`** : types de cheminement, pose, hauteurs des symboles, verticales, longueur d’une gaine, passages entre étages, nettoyage des données.
- **Type de cheminement** d’une gaine électrique : gaine ICTA, tube IRL, goulotte, chemin de câbles. Les gaines existantes restent « type non précisé » (rien de deviné) et gardent leur aspect.
  - Diamètres proposés selon le type (ICTA Ø16 à Ø40, IRL Ø16 à Ø50) ; goulotte et chemin de câbles : largeur × hauteur à saisir (aucune dimension par défaut).
  - Dessin 2D : ICTA et non précisé en tirets (comme avant), IRL en trait plein, goulotte en bande, chemin de câbles en échelle. Étiquette « IRL Ø20 », « Goulotte 60 × 40 mm ».
- **Pose** d’une gaine : dans le sol, au plafond ou à une hauteur donnée. Les **verticales** jusqu’à chaque appareil sont comptées (hauteur de pose du symbole) ; sans pose, elles sont signalées « non comptées ».
  - La 3D place la gaine à sa hauteur de pose (sinon, réglage « par le plafond / par le sol » comme avant).
- **Autres circuits** passant dans un cheminement (goulotte, chemin de câbles partagés).
- Le type et la pose choisis en dernier sont repris pour les gaines suivantes ; choix du type aussi dans la barre de l’outil Conduit.
- **Passage entre étages** : nouveau symbole (Électricité › Tableau & énergie). Dans l’inspecteur, on choisit le niveau à relier : un passage jumeau est créé au même endroit sur ce niveau.
- **Format des plans v6** (gaines : `kind`, `pose`, `z`, `lw`, `lh`, `cids` ; passage : `to` ; `zones[]` ; `install.reserve` ; `calc.dcab`). Migration v5 → v6 : rien n’est ajouté ni deviné, les valeurs invalides sont retirées.
- **Copie de sécurité avant mise à jour du format** : à l’ouverture d’un plan d’une version précédente, le plan d’origine est gardé dans l’historique des versions (« Copie de sécurité avant mise à jour du format (v5 → v6) »).
- Correction : l’étiquette d’une gaine sélectionnée sans diamètre n’affiche plus « Øundefined ».
- Service Worker : cache `calque-v15`, `js/cheminement.js` ajouté.
- Ajout de `tests/cheminement.test.mjs` (3 tests) ; `tests/bibliotheque.test.mjs` compte 177 symboles (un ajouté, aucun perdu).

## 2026-11-04 — Phase 3 : tableaux Legrand manquants reportés en phase 8
- Décision de l’utilisateur : les tableaux absents du guide « Points clés » (Iz, modes de pose, facteurs de correction, chutes de tension maximales, constantes, simultanéité) sont reportés à la toute fin (phase 8), car les documents sont payants.
- Interface : « extrait à fournir » remplacé par « non couvert par l’extrait Legrand fourni ». Les contrôles concernés restent « vérification nécessaire » (aucune valeur inventée).

## 2026-11-04 — Phase 3, étape 4 : tableaux Legrand et fichiers de passage entre sessions
- **Extrait Legrand reçu** (« NF C 15-100 — Révision 23 août 2024 — Points clés & solutions Legrand », réf. MM224003). Deux tableaux recopiés dans `js/normes.js`, avec source, édition et pages :
  - section mini / calibre maxi / nombre de points par circuit du logement, et tableau du chauffage (p. 16-17, 24-29) ;
  - interrupteurs différentiels : 2 au moins dont 1 de type A, 8 circuits maxi, types admis par appareil, calcul du calibre par la règle de l’amont ou de l’aval (p. 12-15).
- Nouveaux contrôles (3 statuts, source et édition affichées) : section et calibre du circuit, nombre de points ou de prises, type du différentiel du circuit (fiche de calcul) ; nombre de différentiels, lumières et prises sur 2 différentiels, 8 circuits maxi, calibre de chaque différentiel (onglet Bilan, section « Interrupteurs différentiels »).
- La règle de l’amont s’appuie sur le réglage estimé du disjoncteur d’abonné : elle donne au mieux « vérification nécessaire ».
- **Correction** : le sèche-linge et la pompe à chaleur demandent un différentiel de type A au moins (extrait p. 13). Le générateur du tableau les place désormais sous un type A et le contrôle du tableau le signale. Les plans existants ne changent pas tant qu’on ne régénère pas le tableau.
- Les valeurs du contrôle actuel de Calque (1,5 mm² → 16 A, 2,5 → 20, 4 → 25, 6 → 32, 8 points, 12/8/6 prises, chauffage 3 500/4 500/5 750/7 250 W) sont **confirmées** par l’extrait ; 10 mm² → 40 A et 16 mm² → 63 A ne sont pas couverts.
- Toujours absents de l’extrait : courants admissibles Iz, modes de pose, facteurs de correction, chutes de tension maximales, constantes de calcul, coefficients de simultanéité.
- Nouveaux fichiers de suivi : `PROJECT_STATE.md` (état du projet), `TECHNICAL_DECISIONS.md` (choix techniques), `NEXT_SESSION.md` (consignes pour la session suivante).
- Service Worker : cache `calque-v14`.
- `tests/calcul.test.mjs` : 15 tests (valeurs de l’extrait, dont l’exemple 20 + 8 + 5 = 33 A → 40 A).

## 2026-11-04 — Phase 3, étape 3 : bilan de puissance et équilibrage des phases
- Nouvel onglet **Bilan** dans Tableau électrique : puissance installée, puissance apparente et cos φ global, puissance appelée (avec le coefficient de simultanéité ks, s’il est saisi), puissance souscrite.
- Bilan **partiel** signalé quand des circuits n’ont pas de puissance ou de cos φ (les totaux sont alors des minimums). Aucun coefficient ks par défaut : le tableau Legrand des coefficients est attendu ; une valeur peut être saisie, avec sa fiabilité et son origine.
- Tableau des circuits : puissance (avec son badge), cos φ, S, IB, phase, statut et accès direct à la fiche de calcul.
- **Équilibrage** (installation triphasée) : intensité par phase, déséquilibre, répartition proposée (du plus fort au plus faible courant, sur la phase la moins chargée) et bouton « Appliquer la répartition proposée » (Annuler pour revenir). Circuits sans phase et sans intensité listés.
- Liste des 8 tableaux NF C 15-100 attendus, avec leur état (tous « manquants » pour l’instant).
- Barre d’onglets du tableau : défile sur elle-même sur un petit écran au lieu de décaler toute la page.
- Ajout d’un test dans `tests/fiche.test.mjs` (4 tests au total).

## 2026-11-04 — Phase 3, étape 2 : fiche de calcul d’un circuit
- **Fiche de calcul** : bouton « Fiche de calcul » dans l’inspecteur d’un symbole relié à un circuit (plan) et dans l’éditeur d’un circuit (onglet Tableau électrique), avec le statut du circuit à côté.
- La fiche affiche : le statut (conforme / non conforme / vérification nécessaire), les alertes (moteur de calcul et contrôle actuel du tableau, marqué « indicatif »), les données manquantes, les données du circuit à saisir, les résultats et les formules (avec les nombres utilisés), les contrôles avec leur source et l’édition, les données utilisées avec leur badge (vérifiée, saisie, estimée, manquante), les hypothèses et les tableaux NF C 15-100 manquants.
- Saisie : puissance prévue, cos φ (raccourcis 1 ; 0,95 ; 0,9 ; 0,85 ; 0,8), longueur du câble, métal, raccordement (phase L1, L2, L3 ou triphasé, en installation triphasée). Pour chaque valeur : fiabilité et origine. « Vérifiée » exige une origine.
- Sans saisie, la puissance est la somme des symboles reliés (puissance saisie dans l’inspecteur, ou valeur par défaut de Calque marquée « estimée »). Une prise n’a jamais de puissance devinée.
- Tableau › Arrivée et installation : réglage **Réseau** (monophasé 230 V / triphasé 400 V). Non précisé : le calcul retient le monophasé, marqué « estimé ». Le cartouche du schéma unifilaire indique « Triphasé 400 V » si choisi.
- La fiche suit les modifications, Annuler et Rétablir. Boutons de 44 px pour le doigt et le Pencil.
- **Format des plans v5** : `circuits[].calc` et `install.reseau`, `install.ks` (facultatifs). Migration v4 → v5 : rien n’est ajouté ni deviné, les valeurs invalides sont retirées.
- Service Worker : cache `calque-v13`.
- Ajout de `tests/fiche.test.mjs` (3 tests).

## 2026-11-04 — Phase 3, étape 1 : moteur de calcul électrique (sans écran)
- **`js/calcul.js`** (JavaScript pur, testable avec Node) : intensité d’emploi en monophasé `IB = P / (U0 × cos φ)` et en triphasé `IB = P / (√3 × U × cos φ)`, puissances P, Q, S et cos φ, chute de tension `ΔU = b (ρ L / S cos φ + λ L sin φ) IB` (b = 2 en mono, 1 en tri), bilan de puissance (`S = √(ΣP² + ΣQ²)`, coefficient de simultanéité facultatif), équilibrage des phases (déséquilibre et répartition proposée).
- **Données marquées** : chaque donnée porte un statut « vérifiée » (source obligatoire), « saisie » ou « estimée », et son origine. Une donnée absente est listée dans « données manquantes » et le résultat qui en dépend n’est pas calculé. Aucune puissance ni aucun cos φ n’est deviné pour une prise ; seule exception, signalée comme « estimée » : cos φ = 1 pour le chauffage et le chauffe-eau (charges résistives).
- **Trois statuts de contrôle** : conforme, non conforme, vérification nécessaire. Un circuit n’est jamais « conforme » tant qu’un de ses contrôles n’a pas pu être vérifié. Chaque contrôle cite sa source et l’édition de la norme.
- **`js/normes.js`** : emplacement des 8 tableaux de la NF C 15-100 attendus (courants admissibles, modes de pose, facteurs de correction, sections et calibres du logement, chutes de tension maximales, constantes de calcul, simultanéité, différentiels), avec source, édition et page à remplir. **Tous « manquants »** : les contrôles qui en dépendent restent « vérification nécessaire ».
- **`js/elecdonnees.js`** : partie sans écran sortie de `electricite.js` (classement des symboles, types de circuits, valeurs du contrôle actuel). `electricite.js` la réexporte : le tableau et les contrôles donnent exactement le même résultat qu’avant (comparaison automatique de l’ancienne et de la nouvelle version sur le plan d’exemple).
- Service Worker : cache `calque-v12`.
- Ajout de `tests/calcul.test.mjs` (13 tests, valeurs calculées à la main).

## 2026-11-04 — Phase 2, étape 5 : préparation de l’import des catalogues fabricants
- `js/catalogue.js` (sans écran) : lecture des fichiers **CSV** (UTF-8 ou Windows-1252, séparateur détecté, guillemets) et **Excel .xlsx** (sans bibliothèque externe), reconnaissance des colonnes usuelles (référence, désignation, marque, EAN, famille, unité, prix), conversion en articles.
- Aucune valeur inventée : une colonne vide reste absente ; doublons et lignes vides comptés ; un article sans référence est signalé.
- Fiabilité : « vérifiée » seulement si l’utilisateur confirme que le fichier vient du fabricant ou du distributeur (source = nom du fichier), sinon « saisie ».
- Pas encore d’écran d’import ni d’enregistrement : ils dépendent des fichiers réels (volume, colonnes FAB-DIS).
- Service Worker : cache `calque-v11`.
- Ajout de `tests/catalogue.test.mjs` (4 tests, avec des données de test évidentes « TEST-… »).

## 2026-11-04 — Phase 2, étape 4 : fond de plan (image ou PDF)
- **Importer un fond de plan** (menu … ou inspecteur du niveau) : photo, image (JPEG, PNG, HEIC sur iPad) ou PDF, placé sous le dessin du niveau courant, à 50 % de transparence.
- **Mise à l’échelle par 2 points** : touchez deux points d’une longueur connue (une cote, un mur), saisissez la longueur réelle (« 350 » ou « 3,50 m »). Le premier point reste en place.
- **PDF à l’échelle connue** : boutons 1:20, 1:50, 1:100, 1:200, 1:500 (si le PDF n’a été ni agrandi ni réduit).
- Réglages : **opacité** (curseur 10 à 100 %), déplacer (glisser au doigt ou au Pencil), tourner d’un quart de tour, masquer, remplacer, retirer (Annuler le rend).
- Le fond aide à dessiner : il n’apparaît **pas** dans les exports PDF et image. Il est enregistré dans le plan (fichier envoyé et sauvegarde complète compris).
- PDF : la première page est lue par Safari sur iPad. Un navigateur qui ne sait pas lire le PDF affiche une explication et ne modifie rien.
- Image réduite si besoin (côté le plus long : 4096 pixels), enregistrée en JPEG.
- **Format des plans v4** : `fonds[]` (réglages) et `fondImg{}` (images, à part pour que l’annulation ne recopie pas l’image à chaque réglage). Migration v3 → v4. Contrôle d’intégrité : « fond de plan sans image ».
- Points d’extension `EXT` (`noyau.js`) pour ajouter un outil, un bandeau d’aide ou un dessin sans modifier les moteurs.
- Service Worker : cache `calque-v10`.
- Ajout de `tests/fond.test.mjs` (4 tests).

## 2026-11-04 — Phase 2, étape 3 : composants personnalisés
- Nouveau domaine **Mes composants** dans la bibliothèque, avec le bouton « + Nouveau composant ».
- Un composant reprend le dessin d’un meuble ou d’un symbole existant, avec **vos** valeurs : nom, dimensions (meuble), hauteur de pose et **marquage** affiché sur le plan (symbole, 8 caractères), rangement, désignation technique, référence fabricant, fabricant, fiabilité et source (facultatifs).
- Sur le plan, il se comporte comme son modèle : circuits, tableau, contrôles, 3D et exports fonctionnent sans changement.
- Inspecteur : « Enregistrer comme composant » depuis un meuble ou un symbole déjà posé ; « Modifier le composant » (le plan ouvert suit la modification) ; « Ajouter à ma bibliothèque » pour un plan reçu d’un autre appareil.
- Marquage modifiable sur tout symbole électrique (inspecteur > Marquage).
- Enregistrés sur l’appareil (hors ligne) et inclus dans « Sauvegarder tous mes plans ». Import sans doublon ni écrasement (un composant différent de même identifiant est ajouté en copie « (importé) »).
- Supprimer un composant de la bibliothèque ne touche à aucun plan : **chaque plan garde une copie** des composants qu’il utilise.
- **Format des plans v3** : `comps[]` (copies), `comp` sur les meubles et symboles, `mark` sur les symboles. Migration v2 → v3.
- Service Worker : cache `calque-v9`.
- Ajout de `tests/composants.test.mjs` (4 tests).

## 2026-11-04 — Phase 2, étape 2 : bibliothèque technique générique
- **Bibliothèque technique** (menu … > Bibliothèque technique) : 110 articles génériques désignés comme sur le chantier : disjoncteurs (courbes B, C, D), interrupteurs et disjoncteurs différentiels, disjoncteurs de branchement, parafoudres, télérupteurs, contacteurs, appareillage, câbles R2V et conducteurs H07V, conduits ICTA/IRL/TPC, boîtes et coffrets.
- **Aucune référence fabricant n’est fournie par Calque.** Chaque article peut recevoir *votre* référence et le fabricant (facultatif), une source et une remarque.
- **Badge de fiabilité** sur chaque article : Vérifiée (source obligatoire), Saisie, Estimée. Les articles génériques sont « Saisie ».
- Recherche de chantier : abréviations (dj, id, ddr, tlr…), « 20a courbe c », « 3G2,5 ».
- Inspecteur d’un symbole électrique : section **Matériel** pour choisir l’article correspondant (ex. prise → « Prise de courant 2P+T 16 A ») et saisir sa référence.
- Les références sont enregistrées sur l’appareil (IndexedDB + copie de secours) et incluses dans « Sauvegarder tous mes plans ». À l’import, une référence déjà saisie n’est jamais remplacée.
- **Format des plans v2** : champ facultatif `art` sur les symboles électriques. Migration v1 → v2 (les anciens plans s’ouvrent sans changement). `PLAN_VERSION` est désormais défini dans `noyau.js`.
- Service Worker : cache `calque-v8`.
- Ajout de `tests/technique.test.mjs` (5 tests).

## 2026-11-04 — Phase 2, étape 1 : bibliothèque par catégories
- Les outils Mobilier, Escalier et Électricité ouvrent une seule **Bibliothèque** en quatre domaines : Mobilier, Équipements du bâtiment, Électricité, Tertiaire, chacun avec ses sous-catégories.
- Les 71 meubles et les 176 symboles sont tous conservés et rangés (`js/bibliotheque.js`). « Tertiaire » regroupe des éléments existants (postes de travail, salle de réunion, éclairage, courants faibles, sécurité incendie, contrôle d’accès, locaux techniques) sans nouveau dessin.
- La recherche porte sur toute la bibliothèque et affiche le chemin de chaque résultat (« Électricité › Tableau & énergie »).
- Pastilles plus grandes (38 et 34 px), sur plusieurs lignes, pour le doigt et le Pencil.
- Service Worker : cache `calque-v7`.
- Ajout de `tests/bibliotheque.test.mjs` (3 tests).

## 2026-11-03 — Phase 0 : audit
- Ajout de `AUDIT.md` : état des lieux complet de l'application.
- Ajout des fichiers de suivi `CLAUDE.md`, `ROADMAP.md`, `PROGRESS.md` et `CHANGELOG.md`.
- Aucune modification du code de l'application.

## 2026-11-03 — Phase 1a : protection des données
- **Correction du bug critique** : quand le stockage était plein, « Enregistré » s'affichait alors que rien n'était sauvegardé. Désormais, chaque écriture est vérifiée, et un échec affiche « Non enregistré » avec une alerte et un bouton « Exporter le plan ».
- Les plans sont enregistrés dans **IndexedDB**, qui offre bien plus d'espace. Les plans existants sont repris automatiquement au démarrage, et l'ancienne copie (`localStorage`) est conservée comme secours.
- **Historique des versions** (menu … > Historique des versions) : une copie à l'ouverture, une toutes les 10 minutes de travail, une avant chaque restauration et avant chaque suppression, avec 40 copies par plan. Boutons « Restaurer », « Copie » et « Enregistrer une version maintenant ».
- **Plans supprimés récupérables** (Mes plans > Plans supprimés récemment).
- **Envoyer le fichier du plan** : menu de partage de l'iPad (AirDrop, Mail, Fichiers) quand il est disponible, sinon enregistrement. Fichier `nom.calque.json` ; les anciens `.json` restent importables.
- **Sauvegarder tous mes plans** : un seul fichier pour tout retrouver. L'import ne remplace jamais un plan existant (doublon ignoré, sinon copie « (importé) »).
- Contrôle d'intégrité à l'ouverture (empreinte du contenu, liens cassés signalés sans rien modifier) et cadre de migration du format.
- Demande de stockage persistant au système, et espace utilisé affiché dans « Mes plans ».
- Enregistrement aussi à la fermeture de l'app (`pagehide`, plus fiable sur iPad).
- Service Worker : cache `calque-v4`.
- Ajout de `tests/stockage.test.mjs` (7 tests).

## 2026-11-04 — Phase 1c : performances et iPad
- **Gros plans plus fluides** : à l'écran, seuls les objets visibles sont dessinés (30 ms → 10 ms par image sur un plan de 25 logements zoomé). Les exports PDF et image contiennent toujours tout le plan.
- **Image mémorisée du plan** : pendant le tracé d'un mur ou d'une pièce, et au survol, seul l'aperçu est redessiné (23 ms → 0,4 ms par image). Elle n'est utilisée que pour les plans lourds.
- **Annuler/rétablir économe** : les parties du plan qui n'ont pas changé sont partagées entre les étapes au lieu d'être recopiées. Limite de 150 étapes, et désormais aussi de mémoire.
- **Apple Pencil** : le stylet dessine et le doigt déplace le plan (activé automatiquement au premier contact du stylet, réglable dans Affichage). La paume posée pendant le dessin est ignorée. La précision est plus fine au stylet. L'aperçu s'affiche au survol du stylet, sans toucher l'écran, sur les iPad compatibles.
- **Téléphone** : la barre du haut passe sur deux lignes et ne déborde plus.
- Service Worker : cache `calque-v5`.
- Ajout de `tests/ipad.test.mjs` (7 tests) et `tests/outils.mjs` (outils communs).
- `CLAUDE.md` corrigé (nom du cache, numéros de ligne).

## 2026-11-04 — Phase 1b : architecture en modules
- Le code (8 500 lignes) quitte `index.html` pour **15 modules JavaScript natifs** dans `js/`, un par moteur, chargés par `js/main.js`. Aucun changement de comportement : contenu vérifié ligne à ligne, export PDF identique à l'octet près.
- Système d'événements « le plan a changé » (`js/evenements.js`) : ouverture, modification, annuler, rétablir.
- Avis « nouvelle version disponible » avec bouton Recharger (le plan est enregistré d'abord) ; vérification des mises à jour au retour de l'application au premier plan.
- Service Worker : cache `calque-v6`, tous les modules disponibles hors ligne dès l'installation.
- Documentation de l'architecture et du modèle de données : `docs/ARCHITECTURE.md`.
- `package.json` (type module) pour tester les modules sans écran avec Node.
- Ajout de `tests/architecture.test.mjs` (6 tests). Mise à jour depuis l'ancienne version simulée : plans conservés.

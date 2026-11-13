# PROGRESS — état exact du développement

Dernière mise à jour : 5 novembre 2026 (phase 5 terminée, demande de fusion n°4 préparée).

## Branche
- Nouvelle session par phase : consignes dans `NEXT_SESSION.md`, état dans `PROJECT_STATE.md`.
- Travail : `claude/layer-modification-prompt-feasibility-nw7oa4`.
- `main` (version utilisée au quotidien) : l'utilisateur a fusionné la demande n°1 (phases 0, 1a, 1b, 1c et phase 2). Il fusionne lui-même ; on ne modifie jamais `main` directement.
- Toute nouvelle fusion passe par une **nouvelle** demande de fusion (la n°1 est terminée).

## Phases terminées
- Phase 0 : audit.
- Phase 1a : protection des données.
- Phase 1c : performances et iPad.
- Phase 1b : architecture en modules natifs (accord de l'utilisateur donné le 4 novembre 2026).

## Tests réalisés (phase 1b)
Commande : `node --test tests/*.test.mjs`, **20/20 réussis** :
- `architecture.test.mjs` (6) : modules dans le cache hors ligne, modules sans écran utilisables par Node, événements (dont dans l'application : ouverture, modification, annuler, rétablir), redémarrage hors ligne, bandeau de mise à jour.
- `ipad.test.mjs` (7) et `stockage.test.mjs` (7) : inchangés et réussis sur le code découpé.

Contrôles complémentaires (scripts, hors dépôt) :
- Le contenu des modules a été comparé ligne à ligne au script d'origine. Seules différences : `ui` et `C` déplacés dans le noyau, et 30 réaffectations remplacées par `setP`/`setGEO`/`setRC`/`setDIMHIT`.
- Export PDF identique à l'octet près (21 993 octets) ; vues 3D et Tableau, catalogues, inspecteur et raccourcis clavier sans erreur.
- **Mise à jour simulée depuis la version actuelle de `main`** : l'ancien cache `calque-v3` est remplacé par `calque-v6`, le plan dessiné avec l'ancienne version est conservé, l'application marche ensuite hors ligne.

**Essais sur l'iPad de l'utilisateur : validés le 4 novembre 2026** (« tout marche »), selon la liste fournie :
- mise à jour et reprise des plans, hors ligne (mode avion) ;
- Apple Pencil (dessin, doigt qui déplace, paume, survol, réglage), fluidité, annuler/rétablir ;
- envoi par le menu de partage, sauvegarde complète, historique des versions, exports PDF et image ;
- barre du haut en paysage et en portrait.
- Reste à observer lors d'une prochaine mise à jour : le bandeau « nouvelle version disponible ».

## Phase 2 — dessin et bibliothèque (terminée, fusionnée dans `main`)
- ✅ Étape 1 : bibliothèque par domaines et sous-catégories (`js/bibliotheque.js`). 3 tests dans `tests/bibliotheque.test.mjs`. Captures vérifiées en 1180×820 et 820×1180.
- ✅ Étape 2 : bibliothèque technique générique, 110 articles, références de l'utilisateur, badge de fiabilité, format des plans v2 avec migration. 5 tests dans `tests/technique.test.mjs`. Tests : **28/28 réussis**.
  - Limite connue : les références saisies restent sur l'appareil ; un plan envoyé à quelqu'un d'autre garde le choix de l'article, mais pas votre référence.
- ✅ Étape 3 : composants personnalisés (`js/composants.js`), format des plans v3 avec migration. 4 tests dans `tests/composants.test.mjs`. Tests : **32/32 réussis**.
- ✅ Étape 4 : fond de plan (image ou PDF), format des plans v4 avec migration. 4 tests dans `tests/fond.test.mjs`. Tests : **36/36 réussis**.
  - Mesure (pire cas, photo de 10,8 Mo) : un réglage enregistré en 14 ms, dessin en 1,5 ms ; l'annulation ne recopie pas l'image.
  - Non vérifiable ici : lecture d'un PDF par Safari sur iPad (Chromium ne lit pas les PDF comme images ; le message d'explication est testé).
- ⏸ Étape 5 : import des catalogues fabricants. **Préparé** (`js/catalogue.js`, 4 tests dans `tests/catalogue.test.mjs`), vérifié aussi sur un .xlsx produit par un autre logiciel. Tests : **40/40 réussis**.
  - **Mis de côté par l'utilisateur** (4 novembre 2026). Le module reste dans le dépôt, inactif, pour une reprise éventuelle.

À vérifier sur l'iPad : ouvrir la bibliothèque au doigt et au Pencil, en paysage et en portrait.

## Phase 3 — électricité et calculs (terminée, à vérifier sur iPad)
- ✅ Étape 1 : moteur de calcul sans écran (`js/calcul.js`), emplacement des tableaux NF C 15-100 (`js/normes.js`), partie sans écran d'`electricite.js` sortie dans `js/elecdonnees.js`. 13 tests dans `tests/calcul.test.mjs`. Tests : **53/53 réussis**.
  - Contrôle de non-régression : circuits, différentiels, coffret et contrôles NF C 15-100 générés sur le plan d'exemple **identiques** avant et après (script hors dépôt).
  - Tous les tableaux NF C 15-100 sont « manquants » : en attente des extraits Legrand de l'utilisateur.
- ✅ Étape 2 : fiche de calcul d'un circuit (`js/fiche.js`), ouverte depuis l'inspecteur du plan et depuis le tableau ; réglage « Réseau » de l'installation ; format des plans v5 avec migration. 3 tests dans `tests/fiche.test.mjs`. Tests : **56/56 réussis**.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844 (fiche entièrement visible, boutons de 44 px).
- ✅ Étape 3 : onglet « Bilan » du tableau (bilan de puissance, coefficient ks, tableau des circuits, équilibrage des phases avec répartition proposée, liste des tableaux Legrand attendus). 1 test de plus dans `tests/fiche.test.mjs`. Tests : **57/57 réussis**.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844 ; correction du débordement horizontal de la barre d'onglets sur téléphone.
- ✅ Étape 4 : extrait Legrand « Points clés » (révision 23 août 2024) reçu ; 2 tableaux recopiés (sections/calibres par circuit et chauffage ; différentiels) et contrôles ajoutés ; sèche-linge et pompe à chaleur en type A. Fichiers `PROJECT_STATE.md`, `TECHNICAL_DECISIONS.md`, `NEXT_SESSION.md`. Tests : **59/59 réussis**.
- ⏸ Tableaux absents de l'extrait (Iz, modes de pose, facteurs de correction, chutes de tension maxi, ρ et λ, simultanéité) : **reportés en phase 8** par l'utilisateur le 4 novembre 2026 (documents payants). Les contrôles In ≤ Iz et chute de tension restent « vérification nécessaire » ; textes « à fournir » retirés de l'interface.

## Phase 4 — cheminements et métrés (terminée, à fusionner et à vérifier sur iPad)
- ✅ Étape 1 : cheminements (types ICTA, IRL, goulotte, chemin de câbles ; pose sol / plafond / hauteur ; verticales ; autres circuits ; passages entre étages), module `js/cheminement.js`, format des plans v6 avec migration et copie de sécurité avant mise à jour du format. 3 tests dans `tests/cheminement.test.mjs`. Tests : **62/62 réussis**.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844 (pas de débordement ; choix du type en pastilles pour tenir dans l'inspecteur).

- ✅ Étape 2 : réseau des gaines, longueurs par circuit (vol d'oiseau, cheminement, câble, à commander avec réserve), longueur L de la fiche venue du plan, onglet « Cheminements » (`js/metres.js`). 2 tests de plus. Tests : **64/64 réussis**.
  - Mesure : réseau de 144 gaines construit en 43 ms (une fois, puis mémorisé), 21 circuits en 3 ms.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844.

- ✅ Étape 3 : recherche d'itinéraire (grille, percements comptés, zones interdites, portes selon la pose, VMC évitée), zones interdites (outil, sélection, nom), conflits dans l'inspecteur et l'onglet Cheminements (`js/itineraire.js`, `js/routeui.js`). 2 tests de plus. Tests : **66/66 réussis**.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844 (aperçu de l'itinéraire, gaine créée, liste des conflits).

- ✅ Étape 4 : remplissage des cheminements (toujours « vérification nécessaire »), diamètre extérieur du câble dans la fiche, liste de matériel estimée (`js/materiel.js`). 2 tests de plus. Tests : **68/68 réussis**.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844.

## Phase 5 — éclairage et 3D avancée (terminée, fusionnée dans `main`)
- Début de session : branche remise au niveau de `main` (avance simple sur la fusion n°3), 68/68 tests réussis.
- ✅ Étape 1 : concepteur d'éclairage par la méthode des lumens, présenté comme une estimation (`js/eclairage.js`, `js/eclairageui.js`, `js/photometrie.js` pour l'intensité), trois propositions, implantation modifiable, photométrie d'un luminaire dans l'inspecteur, format des plans v7 avec migration et copie de sécurité. 4 tests dans `tests/eclairage.test.mjs`. Tests : **72/72 réussis**.
  - Valeurs vérifiées à la main : 79,58 lx sous un luminaire lambertien de 1 000 lm à 2 m ; 19,89 lx à 2 m de distance horizontale ; formule des lumens sur une pièce de 20 m².
  - Captures vérifiées en 1180×820, 820×1180 et 390×844 (fenêtre lisible, pas de débordement, implantation et recalcul).

- ✅ Étape 2 : lecture des fichiers IES (LM-63, type C) et LDT (EULUMDAT, 5 symétries) sans bibliothèque, import dans la fenêtre Éclairage et dans l'inspecteur d'un luminaire, fiche du fichier et courbe photométrique, fichiers enregistrés dans le plan. 2 tests de plus (fichiers de synthèse au flux connu). Tests : **74/74 réussis**.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844 (fiche du fichier, courbe, fichier refusé).
  - Non vérifiable ici : choisir un vrai fichier .ies / .ldt dans l'app Fichiers de l'iPad (aucun fichier de fabricant n'est inclus dans le dépôt).

- ✅ Étape 3 : 3D avancée (`js/vue3d.js`) : goulottes et chemins de câbles à leurs dimensions, pose réelle, passages entre étages, câbles des circuits, coupes, murs transparents, masquage, modification depuis la fiche 3D et déplacement au doigt. 3 tests dans `tests/vue3d.test.mjs`. Tests : **77/77 réussis**.
  - Vérifié par le calcul : tronçons des câbles du plan d'essai (verticales, jonctions, passage de 250 à 270 cm), câble posé au fond du chemin de câbles.
  - Fluidité : reconstruction du grand plan de test en 25 à 30 ms ; la coupe ne reconstruit rien.
  - Captures vérifiées en 1180×820, 820×1180 et 390×844 (panneau, fiche modifiable, coupe, câbles, photo).
  - Le test instable connu (`ipad.test.mjs`, rendu limité à la zone visible) a échoué une fois dans une suite complète, puis réussi seul deux fois et à la suite complète suivante.

## Phase 6 — documents et moteur de règles (terminée, à fusionner et à vérifier sur iPad)
- ✅ Étape 1 : moteur documentaire. Dossier PDF avec cartouche et indice de révision (`js/pdf.js`, `js/svgpdf.js` et `js/documents.js`, tous les trois sans écran ; fenêtre `js/dossierui.js`). Format des plans v8 (`doc`). 7 tests dans `tests/documents.test.mjs`. Tests : **84/84 réussis**.
  - Vérifié dans Node : structure du PDF (table des objets), cartouche et indice sur chaque page, sommaire, révisions, mentions « Estimée » et « Manquante », schéma SVG redessiné en vectoriel.
  - Vérifié dans Chromium : la fenêtre en 1180×820, 820×1180 et 390×844 (sans défilement horizontal, boutons de 44 px), la saisie du cartouche au clavier, l'enregistrement d'un indice (dans le plan et dans l'historique), la préparation du PDF (12 pages pour le plan d'exemple).
  - Pages contrôlées à l'œil (images converties) : page de garde, plan au 1:100 avec légende, schéma unifilaire, nomenclatures, métrés, éclairage.

- ✅ Étape 2 : moteur de règles versionnées (`js/regles.js`, sans écran ; onglet `js/reglesui.js`). 51 règles versionnées, trois statuts, source, édition, données utilisées et manquantes ; tous les contrôles existants repris. 5 tests dans `tests/regles.test.mjs`. Tests : **89/89 réussis**.
  - Vérifié dans Node : même nombre de contrôles et mêmes statuts que le moteur de calcul ; aucune règle de Calque « conforme » ; jamais de conformité globale ; chaque contrôle de l'ancien `nfcChecks` porte une règle du catalogue (49 appels).
  - Vérifié dans Chromium (plan d'exemple) : chaque contrôle de l'ancien onglet est repris avec le même message ; les non-conformités restent « non conformes » ; affichage en 1180×820, 820×1180 et 390×844 sans défilement horizontal ; rapport dans le dossier PDF (28 pages pour le plan d'exemple).

## Plan d'exemple (après la phase 6)
- ✅ Nouveau plan d'exemple « maison et atelier » (`js/exemple.js`) : une fonction de chaque phase ; tout l'atelier est raccordé par les gaines. Test `tests/exemple.test.mjs`. Tests : **90/90 réussis**.
  - Vérifié : ouverture sans erreur, plan 2D, maquette 3D, onglet Contrôle (plus de 400 contrôles), dossier PDF complet (9 chapitres).

## Phase 7 — chantier et variantes (terminée, à fusionner et à vérifier sur iPad)
- ✅ Étape 1 : mode chantier (`js/chantier.js` sans écran, `js/chantierui.js`, `js/photos.js`). Format v9. 6 tests dans `tests/chantier.test.mjs`. Tests : **96/96 réussis**.
  - Vérifié dans Node : nettoyage (rien de deviné), avancement, réserves (numéros, statuts, dates de levée), historique, simplification des traits.
  - Vérifié dans Chromium : onglet Chantier en 1180×820, 820×1180 et 390×844 (sans défilement horizontal, boutons de 44 px) ; « posé » au doigt ; réserve ; annotation au stylet (événements « pen ») ; photo enregistrée dans IndexedDB (JPEG réduit + miniature), absente du plan et de l'annuler ; annuler/rétablir ; sauvegarde complète avec la photo, réimportée sur un autre « appareil » ; dossier PDF avec la photo intégrée.
  - Pages du chapitre « Suivi de chantier » contrôlées à l'œil (images converties).
- ✅ Étape 2 : variantes (`js/variantes.js` sans écran, `js/variantesui.js`). Format v10. 4 tests dans `tests/variantes.test.mjs`. Tests : **100/100 réussis**.
  - Vérifié dans Node : création, copie indépendante, affichage (la variante quittée garde ses données), refus de supprimer l'affichée et la principale, nettoyage sans perte.
  - Vérifié dans Chromium (plan d'exemple) : comparaison des 3 variantes (éclairement de l'atelier : haut de gamme > standard > économique), affichage depuis la fenêtre, annuler, texte des variantes réutilisé par l'annuler, suppression avec copie dans l'historique, chapitre du dossier PDF ; fenêtre en 1180×820 et 390×844 sans défilement horizontal.

## Tâche en cours
- Aucune : phase 7 terminée (chantier et variantes). **Demande de fusion n°6 à fusionner par l'utilisateur**, puis essais iPad (liste dans `NEXT_SESSION.md`). Prochaine session : phase 8.

## Essais sur l'iPad (phase 6 et plan d'exemple)
**Validés par l'utilisateur le 5 novembre 2026** (« on est tous bons pour les tests »).

## Essais sur l'iPad (phase 4)
**Validés par l'utilisateur le 5 novembre 2026.**

## Essais sur l'iPad (phase 3)
**Validés par l'utilisateur le 5 novembre 2026.**

## Essais sur l'iPad (phase 2)
**Validés par l'utilisateur le 4 novembre 2026** (« tout marche ») : mise à jour et reprise des plans, bibliothèque au doigt et au Pencil, bibliothèque technique, composants personnalisés (mode avion compris), fond de plan (photo, image, PDF dans Safari, mise à l'échelle par 2 points), sauvegarde complète.

## Points d'attention
- Test `ipad.test.mjs` « rendu limité à la zone visible… » : **un échec intermittent** observé une fois (90 pixels différents sur la première vue) lors d'une suite complète, puis réussi 4 fois seul et à la suite complète suivante. Le rendu du plan n'a pas été modifié en phase 3 ; cause probable : chargement des polices. À surveiller.
- Un plan enregistré en v5 puis rouvert avec l'ancienne version de `main` affiche « vient d'une version plus récente » ; ses données restent dans le fichier.
- Format des plans passé de v1 à v5 (migrations testées). Un plan enregistré avec cette version, rouvert avec l'ancienne version de `main`, affiche « vient d'une version plus récente » ; les données restent dans le fichier.
- Un fond de plan alourdit le plan (environ 1 à 3 Mo pour un plan scanné) et chaque copie de l'historique des versions.

## Prochaine action prévue
- Fusion de la phase 7 (demande n°6, par l'utilisateur), essais iPad de la phase 7, puis phase 8 : validation finale (extraits Legrand à demander).

## 9 novembre 2026 — Mission « développement autonome »
- Départ : `main` après la fusion n°6, 100/100 tests. Branche de travail `claude/ecstatic-sagan-juah82`.
- Export DXF : `js/dxf.js`, calques dans `drawSceneIn`, fenêtre d'export ; vérifié avec ezdxf (0 erreur) et un rendu image.
- Disjoncteur d'abonné triphasé corrigé (`agcpOf(kva, reseau)`), paliers proposés selon le réseau.
- Quantitatif et chiffrage : `js/quantitatif.js`, `js/quantitatifui.js`, format v11, « mes prix », CSV, chapitre PDF, plan d'exemple.
- Tests : 108/108 (deux tests d'image de `ipad.test.mjs` parfois instables dans la suite complète, réussis seuls).

## 11 novembre 2026 — Mission « développement autonome » (suite)
- Sélection multiple (outil « Groupe », `js/multi.js`).
- Import DXF en fond de plan à l'échelle (`js/dxfimport.js`) ; reconnaissance des murs, portes, fenêtres et noms de pièces (`js/dxfmurs.js`).
- Raccordement automatique des circuits (`raccorderCircuit`, `itineraire.js`).
- Import d'une maquette IFC 2x3 / 4 dans un nouveau plan (`js/ifcimport.js`, `js/ifcui.js`).
- Tests fiabilisés (polices d'internet bloquées) : 125/125, trois suites complètes de suite sans échec.
- `NEXT_SESSION.md` réécrit (consignes de reprise, essais iPad, fusion).

## 12 novembre 2026 — Mission (suite, après la fusion n°7)
- Équipement minimal d'une pièce ; relier les appareils sans circuit ; outil Mesurer ; rappel de sauvegarde ; sauvegarde et import par morceaux (iPad, photos) ; accrochage au fond DXF ; corrections (gaines après régénération, suppression d'un circuit, conseil risqué, barre d'outils, échelle des fonds DXF) ; migrations v1 → v11 vérifiées sans perte ; import IFC essayé sur la maquette Allplan de l'utilisateur.
- Tests : 152/152. Demande de fusion n°8 fusionnée à la demande de l'utilisateur.


## 12 novembre 2026 — Mission (suite, après la fusion n°9)
- Essais iPad des demandes n°7 à n°9 : « tout va bien » (réponse de l'utilisateur en début de session).
- Quantitatif : saisie légère (`commitLeger`), ≈ 35 ms → ≈ 1 ms par saisie sur 100 logements.
- Import IFC éprouvé sur six vraies maquettes Revit / ArchiCAD : murs en facettes, portes et fenêtres sans réservation, morceaux de mur empilés, murs en hauteur, nom des pièces.
- Tests : 155/155.

## 13 novembre 2026 — Import DXF essayé sur de vrais plans
- Unité du fichier écartée si invraisemblable (pouces / pieds proposés d'après les cotes), reconnaissance des murs indépendante du cadrage, porte au bout d'un mur, petits vides non équipés, fenêtre d'import corrigée.
- Tests : 156/156.

## 13 novembre 2026 — Module « Plans électriques »
- Branche : `claude/calque-electrical-plans-module-tbt1ea` (partie de `main` après la fusion n°10).
- Étapes : audit et architecture (`docs/MODULE_ELECTRIQUE.md`) → moteur de câblage → format v12 → calques et vues → rendu du câblage → gestionnaire de circuits → outil Câbler et propositions validées → règles de câblage, nomenclature du tableau → matériel et quantitatif reliés au plan → exports SVG et chapitre « Plans électriques » → plan d'exemple → tests et captures.
- Tests : 169/169 (`node --test tests/*.test.mjs`).
- Captures vérifiées : 1180 × 820, 820 × 1180, 390 × 844 (pastille, fenêtre des calques, gestionnaire de circuits, fenêtre d'export) ; barre d'outils entière sans défilement en 1180 × 820, 1024 × 768 et portrait.
- Mesures : câblage des 35 circuits du plan d'exemple en 40 ms (puis mémorisé) ; 12 pages de plans électriques du dossier en 0,2 s.
- À essayer sur l'iPad : voir `NEXT_SESSION.md`.

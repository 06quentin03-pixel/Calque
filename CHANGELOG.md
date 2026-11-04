# CHANGELOG — historique des modifications

## 2026-11-04 — Phase 3 : on s'en tient au guide Legrand fourni
- Décision de l’utilisateur : les tableaux absents du guide « Points clés » (Iz, modes de pose, facteurs de correction, chutes de tension maximales, constantes, simultanéité) ne seront pas demandés.
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

# CLAUDE.md — instructions permanentes pour le développement de Calque

À lire au début de **chaque** session, avant toute modification, avec `PROJECT_STATE.md` (état du projet), `TECHNICAL_DECISIONS.md` (choix techniques), `NEXT_SESSION.md` (consignes de la session), `ROADMAP.md` et `PROGRESS.md`.
Une session par phase : à la fin de chaque phase, mettre à jour ces trois fichiers et réécrire `NEXT_SESSION.md` pour la phase suivante.

## Le projet

Calque est une application web installable (PWA) de dessin de plans de bâtiment avec implantation électrique, tableau NF C 15-100 et maquette 3D.
L'objectif est d'en faire progressivement un outil professionnel de conception électrique (voir `ROADMAP.md`).
L'appareil principal de l'utilisateur est un **iPad Air M4 11 pouces avec Apple Pencil Pro**, utilisé en paysage et en portrait.

## Règles impératives de l'utilisateur

1. **Ne jamais modifier la branche `main`.** C'est la version que l'utilisateur utilise tous les jours, publiée par GitHub Pages.
   - Tout le travail se fait sur la branche de développement indiquée au début de la session (phases 1 à 7 : `claude/layer-modification-prompt-feasibility-nw7oa4` ; mission de novembre 2026 : `claude/ecstatic-sagan-juah82` ; module « Plans électriques » : `claude/calque-electrical-plans-module-tbt1ea` ; compositions des murs : `claude/loving-thompson-b92t8x`), partie de `main`.
   - L'utilisateur fusionne lui-même dans `main` quand il le décide. On lui explique comment.
2. Pas de force push, pas de réécriture d'historique, pas de création de dépôt.
3. Partir du code existant. Ne pas reconstruire de zéro, ne pas supprimer de fonctionnalité, ne pas remplacer un moteur qui fonctionne par une version simplifiée.
4. **Aucune fausse donnée** : pas de référence fabricant inventée, pas de résultat simulé présenté comme réel, pas de valeur manquante remplacée en silence.
   - Les données sont marquées « vérifiée », « saisie » ou « estimée ».
5. **Réglementation.** Ne jamais afficher de conformité globale si tout n'a pas été vérifié. Il y a trois statuts : conforme / non conforme / vérification nécessaire.
   - Chaque règle indique sa source et l'édition de la norme.
   - Source autorisée par l'utilisateur : les extraits NF C 15-100 publiés par Legrand. Le texte de la norme AFNOR n'est pas reproduit.
   - Extrait reçu : guide Legrand « NF C 15-100 — Révision 23 août 2024 — Points clés & solutions Legrand » (réf. MM224003). Tableaux recopiés dans `js/normes.js`.
6. Le hors ligne est prioritaire. Aucune dépendance cloud, aucun abonnement, aucun serveur obligatoire.
7. Compatibilité totale avec les plans existants. Toute évolution du format passe par une migration et une copie de sécurité.
8. Tester chaque modification. Ne pas déclarer terminé ce qui n'est que visible à l'écran.
9. **S'arrêter et demander** avant toute décision qui risque de détruire des données, de casser une fonction existante ou de changer profondément l'architecture sans retour possible.
   - Pour le reste, décider de façon autonome.
10. Langue : français, pour l'interface, les commentaires et les échanges. L'utilisateur débute sur GitHub : lui donner des explications simples et concrètes, adaptées à l'iPad.
11. Ne jamais demander de mot de passe, de jeton ou de clé.
12. **Plan d'exemple** : chaque nouvelle fonctionnalité est **toujours ajoutée au plan d'exemple** (`js/exemple.js`, Menu › Ouvrir le plan d'exemple), pour que l'utilisateur l'essaie tout de suite sur l'iPad.
   - Compléter aussi `tests/exemple.test.mjs`, qui vérifie que chaque fonction y figure.
   - Les valeurs du plan d'exemple sont des valeurs d'exemple marquées « saisie », avec leur origine : jamais présentées comme des données de fabricant ou des valeurs réglementaires.

## Architecture actuelle (détail et modèle de données : `docs/ARCHITECTURE.md`)

- Depuis la phase 1b, `index.html` ne contient plus que la page (styles et structure). Le code est réparti en **modules JavaScript natifs** dans `js/` (un fichier par moteur), chargés par `js/main.js`.
  - Un module ne réaffecte jamais une variable importée : il passe par `setP`, `setGEO`, `setRC` ou `setDIMHIT`.
  - Ce qui sert à plusieurs modules dès le chargement va dans `js/noyau.js`.
  - Événements entre modules : `js/evenements.js` (`EV.PLAN_CHANGE`, `EV.PLAN_OUVERT`).
  - `package.json` (`"type": "module"`) permet d'importer les modules sans écran dans Node.
- Pas de bibliothèque externe ni de compilation. 3D en WebGL 2 écrit à la main, PDF généré par un module intégré.
- Modèle de données : un plan est un objet JSON `P` (`levels, nodes, walls, openings, items, elec, rooms, dims, texts, circuits, rcds, links, ducts, install`).
  - Unités : centimètres, axe Y vers le bas. Chaque objet a un `id` unique et un niveau `lv`.
- La 2D et la 3D lisent le même `P` : il n'y a jamais de seconde copie des données.
- Sauvegarde (depuis la phase 1a) : **IndexedDB**, base `calque`, avec les magasins `plans` (liste), `data` (contenu), `versions` et `vdata` (historique), et `meta`.
  - `localStorage` (`calque.p.<id>`, `calque.idx`, `calque.cur`) reste une copie de secours « au mieux ». Il est relu à chaque démarrage (`syncFromLocal`) et n'est jamais effacé par la migration.
  - `saveNow()` n'affiche « Enregistré » que si une écriture a réussi. Sinon : « Non enregistré » et une alerte.
  - Format des plans : `PLAN_VERSION` (dans `noyau.js`, actuellement 17) + `MIGRATIONS[n]` (dans `stockage.js`, fonction `migratePlan`). **Toute évolution du format doit ajouter une migration et un test.**
  - Photos du chantier (phase 7) : base IndexedDB à part `calque-photos` (`js/photos.js`), jamais dans le plan ; incluses dans la sauvegarde complète.
  - Le code `window.claude` (enregistrement en ligne) est inactif sur GitHub Pages.
- `sw.js` : Service Worker « réseau d'abord » (cache : voir `CACHE` dans `sw.js`). Tous les fichiers de `js/` sont dans `CORE`.
  - **Penser à changer le nom du cache et la liste `CORE`** à chaque ajout de fichier (un test le vérifie).
  - Avis « nouvelle version disponible » : `js/miseajour.js`.

- Rendu 2D (depuis la phase 1c) :
  - `drawScene` ne dessine à l'écran que les objets de la zone visible (`VIEW`, marge de 160 px). Les exports PDF/PNG dessinent toujours tout.
  - `requestRender(true)` = seule la couche du dessus change (curseur, aperçu). Le plan est alors repris d'une image mémorisée (`SCENE`), utilisée seulement si le dessin du plan dépasse 4 ms. **Tout changement du plan doit appeler `requestRender()` sans argument.**
  - Diagnostic pour les tests : `?debug=nocull`, `?debug=cache`, `?debug=nocache`.
- Cheminements (depuis la phase 4) : les gaines électriques sont des `ducts` (`sys: 'elec'`) avec `kind`, `pose`, `cids` ; passages entre étages = symboles `traversee` jumeaux ; zones interdites `zones[]`.
  - Calculs sans écran : `cheminement.js` (réseau des gaines, longueurs), `itineraire.js` (itinéraire, conflits), `materiel.js` (remplissage, matériel). Écran : `routeui.js`, `metres.js` (onglet « Cheminements »).
  - La longueur L de la fiche vient du plan (« estimée ») tant qu'aucune longueur n'est saisie.
- Export DXF (`js/dxf.js`) : `DxfCtx` enregistre le dessin du moteur 2D ; `drawSceneIn` annonce le calque de chaque étape par `c.calque(nom)` (sans effet sur un vrai canvas). Tout nouveau dessin du plan doit rester compatible avec ce contexte (pas de `drawImage` indispensable, pas de dégradé).
- Quantitatif et chiffrage (`js/quantitatif.js`, `js/quantitatifui.js`) : aucun prix fourni par Calque ; total « partiel » tant qu'une ligne est sans prix.
- Annuler/rétablir : `packPlan`/`unpackPlan`, états découpés en blocs partagés entre étapes (150 étapes, environ 30 millions de caractères au maximum).
- Plans électriques (13 novembre 2026, `docs/MODULE_ELECTRIQUE.md`) : moteur de câblage `cablage.js` (sans écran), calques et vues `calques.js` (sans écran) + `calquesui.js`, gestionnaire de circuits `circuitsui.js`, outil « Câbler » et propositions de raccordement `cablerui.js`, nomenclature du tableau `nomenclature.js`, export SVG `svgexport.js`.
  - Tout objet du plan appartient à un calque (`calqueDeElec`, `calqueDeGaine`) ; un nouveau type d'objet doit être rangé dans un calque et respecter le verrouillage dans `hitTest` et l'outil Groupe.
  - Dessin du câblage : point d'extension `EXT.cablage` (au-dessus des gaines, sous les appareils).
- Schémas électriques (onglet « Schémas », format v14, `P.schemas`) : bibliothèque `schemasymboles.js` et moteur `schema.js` (sans écran : équipotentielles, repères, renvois, nomenclature, borniers, liste des fils, modèles, import du tableau, dessin d'un folio pour l'écran, le PDF, le SVG et le DXF), écran `schemaui.js`. Unités : millimètres sur un folio A3 ; bornes des symboles sur la grille de 5 mm (un test le vérifie).
- Composition des murs, cloisons, planchers et plafonds (format v16) : moteur `compositions.js` (sans écran : matériaux, compositions types, bandes d'un mur, logement et placement des gaines, surfaces), écran `compositionsui.js`. `w.th` = somme des couches (`appliquerAuMur`) ; dessin `drawCouches` (`rendu2d.js`, sans découpage, compatible PDF/SVG/DXF).
- Déperditions thermiques (format v17) : moteur `thermique.js` (sans écran : U des parois, déperditions d'un mur, d'une pièce, bilan d'un niveau ; méthode simplifiée, jamais présentée comme réglementaire), écran `thermiqueui.js`. Les pièces sont fournies par l'appelant (`geo(lv).rooms`).
- Épaisseur d'un mur : `changerEpaisseur` (`compositions.js`) élargit le mur entier (tronçons alignés) au centre ou vers un côté, en déplaçant ses angles.
- Apple Pencil : réglage `S.pencil`, activé au premier contact du stylet. Avec un outil de dessin, le doigt déplace le plan. La paume est ignorée pendant que le stylet est posé.

## Architecture cible

- Moteurs indépendants, sans outil de compilation : modules JavaScript natifs (`<script type="module">`), compatibles Safari iPadOS et GitHub Pages. **En place depuis la phase 1b.**
- Le moteur de calcul électrique et le moteur de règles sont du **JavaScript pur, sans accès au DOM**, testables avec Node (`node --test`).
- Le découpage est **progressif** : l'application doit fonctionner après chaque étape.

## Tester

- Serveur local : `python3 -m http.server 8765` à la racine du dépôt.
- Navigateur : Chromium est installé avec Playwright (`require('playwright')`). WebKit n'est pas disponible dans l'environnement cloud.
- Tests : `node --test tests/*.test.mjs` (Playwright + Chromium, serveur intégré au test). Outils communs et plan de test de grande taille : `tests/outils.mjs`.
- Tailles d'écran à vérifier : 1180×820 (iPad paysage), 820×1180 (iPad portrait), 390×844 (téléphone).
- Ne jamais laisser de fichiers de test (captures, etc.) dans le dépôt : utiliser le dossier temporaire de la session.
- Plan d'exemple : `tests/exemple.test.mjs` vérifie qu'il contient chaque fonction (à compléter à chaque phase).

## Fin de chaque étape

Mettre à jour `PROJECT_STATE.md`, `PROGRESS.md` et `CHANGELOG.md` (et `ROADMAP.md`, `TECHNICAL_DECISIONS.md` si besoin), faire un commit explicite, puis pousser sur la branche de développement.

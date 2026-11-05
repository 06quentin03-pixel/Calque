# CLAUDE.md — instructions permanentes pour le développement de Calque

À lire au début de **chaque** session, avant toute modification, avec `PROJECT_STATE.md` (état du projet), `TECHNICAL_DECISIONS.md` (choix techniques), `NEXT_SESSION.md` (consignes de la session), `ROADMAP.md` et `PROGRESS.md`.
Une session par phase : à la fin de chaque phase, mettre à jour ces trois fichiers et réécrire `NEXT_SESSION.md` pour la phase suivante.

## Le projet

Calque est une application web installable (PWA) de dessin de plans de bâtiment avec implantation électrique, tableau NF C 15-100 et maquette 3D.
L'objectif est d'en faire progressivement un outil professionnel de conception électrique (voir `ROADMAP.md`).
L'appareil principal de l'utilisateur est un **iPad Air M4 11 pouces avec Apple Pencil Pro**, utilisé en paysage et en portrait.

## Règles impératives de l'utilisateur

1. **Ne jamais modifier la branche `main`.** C'est la version que l'utilisateur utilise tous les jours, publiée par GitHub Pages.
   - Tout le travail se fait sur la branche de développement `claude/layer-modification-prompt-feasibility-nw7oa4`.
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
  - Format des plans : `PLAN_VERSION` (dans `noyau.js`, actuellement 6) + `MIGRATIONS[n]` (dans `stockage.js`, fonction `migratePlan`). **Toute évolution du format doit ajouter une migration et un test.**
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
- Annuler/rétablir : `packPlan`/`unpackPlan`, états découpés en blocs partagés entre étapes (150 étapes, environ 30 millions de caractères au maximum).
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

## Fin de chaque étape

Mettre à jour `PROJECT_STATE.md`, `PROGRESS.md` et `CHANGELOG.md` (et `ROADMAP.md`, `TECHNICAL_DECISIONS.md` si besoin), faire un commit explicite, puis pousser sur la branche de développement.

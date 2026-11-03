# CLAUDE.md — instructions permanentes pour le développement de Calque

À lire au début de **chaque** session, avant toute modification, avec `ROADMAP.md` et `PROGRESS.md`.

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
6. Le hors ligne est prioritaire. Aucune dépendance cloud, aucun abonnement, aucun serveur obligatoire.
7. Compatibilité totale avec les plans existants. Toute évolution du format passe par une migration et une copie de sécurité.
8. Tester chaque modification. Ne pas déclarer terminé ce qui n'est que visible à l'écran.
9. **S'arrêter et demander** avant toute décision qui risque de détruire des données, de casser une fonction existante ou de changer profondément l'architecture sans retour possible.
   - Pour le reste, décider de façon autonome.
10. Langue : français, pour l'interface, les commentaires et les échanges. L'utilisateur débute sur GitHub : lui donner des explications simples et concrètes, adaptées à l'iPad.
11. Ne jamais demander de mot de passe, de jeton ou de clé.

## Architecture actuelle (voir `AUDIT.md` pour le détail)

- `index.html` contient toute l'application (environ 590 Ko). Le CSS est aux lignes 7–368, le HTML aux lignes 369–454 et le JS aux lignes 455–8534, dans une seule fonction anonyme.
- Pas de bibliothèque externe ni de compilation. 3D en WebGL 2 écrit à la main, PDF généré par un module intégré.
- Modèle de données : un plan est un objet JSON `P` (`levels, nodes, walls, openings, items, elec, rooms, dims, texts, circuits, rcds, links, ducts, install`).
  - Unités : centimètres, axe Y vers le bas. Chaque objet a un `id` unique et un niveau `lv`.
- La 2D et la 3D lisent le même `P` : il n'y a jamais de seconde copie des données.
- Sauvegarde actuelle : `localStorage` (clés `calque.p.<id>`, `calque.idx`, `calque.cur`, `calque.settings`).
  - Le code `window.claude` (enregistrement en ligne) est inactif sur GitHub Pages.
- `sw.js` : Service Worker « réseau d'abord » (cache `calque-v3`).
  - **Penser à changer le nom du cache et la liste `CORE`** à chaque ajout de fichier.

## Architecture cible

- Moteurs indépendants, sans outil de compilation : modules JavaScript natifs (`<script type="module">`), compatibles Safari iPadOS et GitHub Pages.
- Le moteur de calcul électrique et le moteur de règles sont du **JavaScript pur, sans accès au DOM**, testables avec Node (`node --test`).
- Le découpage est **progressif** : l'application doit fonctionner après chaque étape.

## Tester

- Serveur local : `python3 -m http.server 8765` à la racine du dépôt.
- Navigateur : Chromium est installé avec Playwright (`require('playwright')`). WebKit n'est pas disponible dans l'environnement cloud.
- Tests unitaires : `node --test tests/` (dès que le dossier existe).
- Tailles d'écran à vérifier : 1180×820 (iPad paysage), 820×1180 (iPad portrait), 390×844 (téléphone).
- Ne jamais laisser de fichiers de test (captures, etc.) dans le dépôt : utiliser le dossier temporaire de la session.

## Fin de chaque étape

Mettre à jour `PROGRESS.md` et `CHANGELOG.md` (et `ROADMAP.md` si besoin), faire un commit explicite, puis pousser sur la branche de développement.

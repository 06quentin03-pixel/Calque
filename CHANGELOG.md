# CHANGELOG — historique des modifications

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

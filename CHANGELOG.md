# CHANGELOG — historique des modifications

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

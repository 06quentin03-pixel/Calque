# Audit de Calque — état des lieux (phase 0)

Date : 3 novembre 2026. Version auditée : branche `main` du dépôt (commit `81ccc70`).

Méthode : lecture du code par sections, puis tests automatisés dans un navigateur Chromium sans écran.
Les tailles d'écran testées sont l'iPad Air 11 pouces en paysage (1180 × 820) et en portrait (820 × 1180), et un téléphone (390 × 844).
**Limite importante** : ces tests ne remplacent pas un essai sur ton iPad. Safari, l'Apple Pencil et les performances réelles du M4 n'ont pas été vérifiés.

---

## 1. Organisation des fichiers

| Fichier | Taille | Rôle |
|---|---|---|
| `index.html` | 590 Ko, 8 535 lignes | **Toute l'application** : styles (lignes 7–368), interface (369–454), code JavaScript (455–8534) |
| `sw.js` | 1,5 Ko | Service Worker : fonctionnement hors ligne |
| `manifest.webmanifest` | 0,6 Ko | Installation sur l'écran d'accueil |
| `icon-192.png`, `icon-512.png`, `apple-touch-icon.png` | — | Icônes |
| `README.md` | 8 octets | Vide (juste le titre) |

- **Technologies** : HTML, CSS et JavaScript « purs ». Il n'y a aucune bibliothèque externe, aucun outil de compilation et aucun serveur.
- La 3D est écrite directement en WebGL 2. Le PDF est fabriqué par un petit générateur intégré.
- **Seule dépendance externe** : la police Google Fonts « Archivo ». Elle est mise en cache par le Service Worker et fonctionne hors ligne une fois chargée.
- **Hébergement** : le dépôt ne contient pas de dossier `.github`. La publication se fait donc très probablement par « GitHub Pages → Deploy from a branch → `main` ». À confirmer dans GitHub, Settings > Pages.

Le code est de **très bonne qualité** : il est cohérent, bien commenté en français et découpé en sections claires. Il n'y a aucune erreur JavaScript pendant les tests. C'est une base solide : il n'y a **aucune raison de repartir de zéro**.

## 2. Carte du code JavaScript (`index.html`)

Le code est enfermé dans une seule fonction. Il n'y a pas de modules, mais il y a des sections nettes.

| Lignes | Section | Rôle |
|---|---|---|
| 458–627 | Noyau | Vecteurs, formats, réglages, **modèle de données** (`P`, `IDX`) |
| 628–977 | Géométrie des murs | Jonctions, détection automatique des pièces, découpe et fusion de murs, aimantation |
| 984–1935 | Symboles | Mobilier (71 modèles), escaliers, **176 symboles électriques**, catalogue |
| 1936–2410 | Rendu 2D | Scène, ouvertures, cotes, textes |
| 2411–3013 | **Électricité** | Types de circuits, tableau, génération automatique depuis le plan, **contrôle NF C 15-100** |
| 3014–3706 | Filtres, conduits, VMC | Gaines et conduits VMC, débits (arrêté du 24 mars 1982), cotes modifiables |
| 3707–4821 | Interaction | Sélection, aimantation, annuler/rétablir, pointeurs, outils de dessin |
| 4822–5303 | Vue tableau | Schéma unifilaire, vue du coffret, onglet « Tableau électrique » |
| 5304–6403 | Interface | Inspecteur, panneaux, niveaux, fenêtres, **sauvegarde**, liste des plans |
| 6404–7089 | Export | Moteur PDF intégré, image PNG, PDF à l'échelle avec cartouche et légende, partage |
| 7090–8346 | **3D** | Triangulation, construction de la maquette, rendu WebGL 2, caméra, sélection, visite |
| 8349–8534 | Divers | Plan d'exemple, clavier, démarrage |

### Modèle de données actuel (un plan = un objet JSON)

```
{ v: 1, name, levels[], nodes[], walls[], openings[], items[] (mobilier), elec[] (symboles),
  rooms[], dims[], texts[], circuits[], rcds[] (différentiels), links[] (liaisons), ducts[], install{} }
```

- Chaque objet a un **identifiant unique** (`id`) et un niveau (`lv`). Les unités sont des centimètres.
- Les symboles électriques sont rattachés à un circuit par `cid`, et les circuits à un différentiel par `rcd`.
- **La 2D et la 3D partagent déjà le même modèle.** La 3D est reconstruite à partir de `P` et il n'existe pas de deuxième copie des données. C'est exactement ce que demande le cahier des charges.

## 3. Fonctionnalités vérifiées

✅ = testé et fonctionnel · ⚠️ = fonctionne avec des réserves · ❌ = absent

| Fonction | État | Détail |
|---|---|---|
| Dessin de murs, pièces, portes, fenêtres, ouvertures | ✅ | Pièces détectées automatiquement, surfaces calculées |
| Niveaux (étages, sous-sol) | ✅ | Plan d'exemple sur 2 niveaux |
| Mobilier | ✅ | 71 modèles en 6 catégories, redimensionnables et orientables |
| Symboles électriques | ✅ | 176 symboles (prises, commandes, éclairage, alarme, domotique, IRVE, PV…) |
| Liaisons commande → éclairage | ✅ | |
| Conduits VMC et gaines électriques | ✅ | Tracé, diamètres, débits VMC |
| Génération du tableau depuis le plan | ✅ | 16 circuits et 3 différentiels sur l'exemple |
| Schéma unifilaire, vue du coffret | ✅ | Export image et SVG |
| Contrôle NF C 15-100 | ⚠️ | Riche (nombre de circuits, socles, sections, différentiels, volumes de salle de bain, hauteurs…). **Mais** il fonctionne par règles codées en dur, sans référence d'article ni édition par règle, et il est limité au logement monophasé |
| Annuler / rétablir | ✅ | 150 étapes |
| Vue 3D (maquette et visite) | ✅ | Rendu propre, sélection d'objets, gaines au plafond ou au sol, photo |
| Export PDF à l'échelle | ✅ | A4/A3, 1:50 à 1:200, cartouche, légende. Fichier PDF valide vérifié |
| Export image PNG | ✅ | |
| Export / import du fichier du plan (.json) | ⚠️ | Fonctionne, mais l'export passe par un téléchargement et non par le menu de partage de l'iPad (voir bug n°3) |
| Hors ligne | ✅ | Rechargement sans réseau réussi, police comprise |
| Écran iPad paysage et portrait | ✅ | |
| Écran téléphone | ⚠️ | La barre du haut déborde (nom du plan et niveaux coupés) |
| Calculs électriques (Ib, chute de tension, Icc…) | ❌ | Les sections et calibres sont fixés par type de circuit, sans calcul |
| Métrés de câbles | ❌ | |
| Concepteur d'éclairage | ❌ | |
| Mode chantier, variantes | ❌ | |

## 4. Problèmes identifiés

### 🔴 Critique : perte silencieuse de données

**Bug n°1. Stockage plein = « Enregistré » affiché alors que rien n'est sauvegardé.**
- Où : `saveNow()`, vers la ligne 6290. La valeur renvoyée par `lsSet()` est ignorée.
- Test : j'ai rempli le stockage du navigateur puis modifié le plan. Le plan stocké est resté à l'ancienne version, alors que l'écran affichait « Enregistré sur cet appareil ».
- Risque réel : les plans sont dans le `localStorage`, limité à **environ 5 Mo sur Safari**, pour tous les plans réunis. Un plan simple fait environ 20 Ko et un gros plan environ 500 Ko. Le jour où la limite est atteinte, les modifications sont perdues sans avertissement.
- Correction prévue (phase 1) : passer à IndexedDB, qui offre beaucoup plus d'espace, vérifier chaque écriture, afficher une vraie alerte en cas d'échec, et garder des copies de sécurité.

### 🟠 Important

2. **Pas d'historique de versions ni de copie de sécurité.**
   - Chaque enregistrement écrase le précédent. Un plan abîmé (fausse manipulation après fermeture de l'application, fichier corrompu) ne peut pas être récupéré.
3. **L'export du fichier de plan sur iPad.**
   - « Exporter le fichier du plan » utilise un lien de téléchargement. Dans une application installée sur l'écran d'accueil d'iPad, ce mode est peu fiable selon les versions d'iPadOS.
   - Le menu de partage de l'iPad (AirDrop, Mail, Fichiers) est déjà utilisé pour les images et les PDF, mais pas pour le fichier du plan.
4. **Le format de fichier n'a pas de migration.**
   - Il y a un numéro de version (`v: 1`), mais aucune fonction de migration. C'est sans conséquence aujourd'hui, mais indispensable avant d'ajouter des données.
5. **L'import refuse les plans sans murs** (ligne 7080).
   - Un fichier sans tableau `walls` ou `nodes` est rejeté. C'est correct pour l'instant, mais à revoir avec le nouveau format.

### 🟡 Performances (à confirmer sur iPad)

6. **Rendu 2D complet à chaque image.**
   - Le dessin est bien redessiné **uniquement quand il change**, sans boucle permanente. C'est économe en batterie.
   - En revanche, tout le plan est redessiné à chaque zoom ou déplacement.
   - Mesure en environnement lent (processeur logiciel) : la maison exemple est fluide (60 images/s). Un plan 25 fois plus gros (725 murs, 1 650 symboles) est environ 3 fois plus lent.
   - Sur l'iPad Air M4, ce sera beaucoup plus rapide, mais il y a de la marge d'optimisation (ne dessiner que ce qui est visible, mettre en cache les couches fixes).
7. **Annuler/rétablir par copie complète du plan.**
   - Chaque modification recopie le plan entier, jusqu'à 150 fois. Pour un très gros plan, cela fait jusqu'à environ 75 Mo de mémoire, et la recopie complète a lieu à chaque geste.
8. **La 3D est économe.**
   - Elle ne calcule qu'à la demande et s'arrête quand rien ne bouge. ✅ Rien à changer.
9. **Service Worker « réseau d'abord » avec 5 s d'attente.**
   - Avec un réseau très faible sur un chantier, l'ouverture peut attendre jusqu'à 5 secondes avant d'utiliser la copie locale.

### 🟢 Mineur

10. Sur téléphone, la barre du haut déborde.
11. **L'Apple Pencil est traité comme un doigt.**
    - Il n'y a pas de distinction stylet / doigt : on pourrait dessiner au stylet et déplacer au doigt, et rejeter la paume.
    - La précision est la même pour les deux, alors que le stylet permettrait une tolérance plus fine.
12. **Code d'enregistrement « en ligne » inactif.**
    - L'application vient d'un environnement Claude (`window.claude`). Sur GitHub Pages, ce code ne s'active jamais : sans danger, mais inutile. À conserver pour l'instant (aucune suppression sans raison).
13. `README.md` est vide.

## 5. Ce que le code existant permet de réutiliser

- **Moteur géométrique** : solide (détection des pièces, jonctions de murs). Il servira directement au cheminement, aux métrés et à l'éclairage.
- **Modèle commun 2D/3D** : déjà en place. Il faut le documenter et le versionner, pas le refaire.
- **Électricité** : les tables `CK`, `ACCEPT`, `SEC_MAX` et la génération du tableau sont une bonne base. Le futur moteur de calcul complétera ces règles fixes par de vrais calculs.
- **Contrôle NF C 15-100** : à transformer progressivement en moteur de règles versionnées (références, éditions, statut « informations manquantes »), sans perdre les contrôles existants.
- **PDF** : le générateur intégré fonctionne. Il servira de base au moteur documentaire.

## 6. Conclusion

Calque est une application **fonctionnelle et bien construite**. Le principal danger immédiat est la **perte silencieuse de données** liée au stockage. C'est la première chose à corriger, avant toute nouvelle fonction.

Les autres priorités de la phase 1 : historique et copies de sécurité, export par le menu de partage, migration du format, puis début de la séparation en modules.

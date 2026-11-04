# TECHNICAL_DECISIONS — choix techniques et architecture de Calque

Ce fichier explique **pourquoi** le code est fait ainsi. Le détail des modules et du modèle de données est dans `docs/ARCHITECTURE.md`.
Ajouter une ligne à chaque décision importante (date, décision, raison).

## Principes permanents
1. **Hors ligne d'abord.** Aucun serveur, aucune dépendance cloud, aucun abonnement. Service Worker « réseau d'abord » (`sw.js`).
2. **Aucune bibliothèque externe, aucune compilation.** Modules JavaScript natifs (`<script type="module">`), compatibles Safari iPadOS et GitHub Pages. 3D en WebGL 2 et PDF écrits à la main.
3. **Un seul modèle de données `P`**, lu par la 2D, la 3D, le tableau, les exports et le calcul. Jamais de seconde copie.
4. **Compatibilité des plans.** Toute évolution du format passe par `PLAN_VERSION` (`noyau.js`) et `MIGRATIONS[n]` (`stockage.js`), avec un test. Une migration n'ajoute jamais de valeur devinée.
5. **Moteurs sans écran.** Le calcul et les règles sont en JavaScript pur (aucun accès au DOM), testables avec `node --test`.
6. **Découpage progressif.** L'application marche après chaque étape ; on ne remplace pas un moteur qui fonctionne.

## Décisions
| Date | Décision | Raison |
|---|---|---|
| 2026-11-03 | Stockage IndexedDB, `localStorage` gardé en secours | Espace bien plus grand, pas de perte des anciens plans |
| 2026-11-04 | Modules natifs dans `js/`, variables partagées modifiées par `setP`/`setGEO`/… | Un module ne peut pas réaffecter une variable importée |
| 2026-11-04 | Annuler/rétablir par blocs partagés (`packPlan`) | Mémoire limitée sur iPad |
| 2026-11-04 | Rendu 2D limité à la zone visible + image mémorisée | Fluidité des gros plans |
| 2026-11-04 | Fonds de plan dans `fondImg` séparé des réglages | L'annulation ne recopie pas l'image |
| 2026-11-04 (ph. 3) | `electricite.js` découpé : partie sans écran dans `elecdonnees.js`, réexportée | Le calcul a besoin des données sans dépendre de l'écran ; aucun autre module ne change |
| 2026-11-04 (ph. 3) | Chaque donnée de calcul est `{ v, st, src }` avec `st` = `verifiee` (source obligatoire), `saisie` ou `estimee` | Règle de l'utilisateur : aucune valeur devinée en silence |
| 2026-11-04 (ph. 3) | Une donnée absente → « données manquantes », pas de résultat | Ne jamais remplacer une valeur manquante |
| 2026-11-04 (ph. 3) | Trois statuts : `conforme`, `non_conforme`, `verification` ; statut global = le pire, et jamais « conforme » si un contrôle n'est pas vérifié | Règle de l'utilisateur |
| 2026-11-04 (ph. 3) | Tableaux NF C 15-100 dans `normes.js`, avec `statut`, `source`, `edition`, `page`, `donnees` ; utilisables seulement si `statut = 'verifiee'` | Seuls les extraits Legrand sont autorisés |
| 2026-11-04 (ph. 3) | Constantes ρ, λ, U0, U marquées « estimée » avec leur origine | Absentes de l'extrait fourni ; la chute de tension reste une estimation |
| 2026-11-04 (ph. 3) | Réglage du disjoncteur d'abonné (`agcpOf`) traité comme « estimé » : la règle de l'amont donne au mieux « vérification nécessaire » | Valeur de Calque, non donnée par l'extrait |
| 2026-11-04 (ph. 3) | Sèche-linge et pompe à chaleur passés en « type A requis » (`CK`) | Extrait Legrand p. 13 ; le générateur produisait un tableau non conforme |
| 2026-11-04 (ph. 3) | Le contrôle existant `nfcChecks` est conservé tel quel ; la fiche l'affiche comme « indicatif » | Ne pas casser l'existant ; il sera repris par le moteur de règles (phase 6) |
| 2026-11-04 (ph. 3) | cos φ = 1 « estimé » seulement pour le chauffage et le chauffe-eau ; aucune puissance par défaut pour les prises | Charges résistives ; ailleurs, ce serait deviner |
| 2026-11-04 (ph. 3) | Tableaux absents du guide Legrand « Points clés » reportés en phase 8 ; d'ici là « manquante » et contrôles « vérification nécessaire » | Décision de l'utilisateur (documents payants) ; aucune valeur inventée |
| 2026-11-04 (ph. 3) | Chute de tension calculée « toute la charge en bout de ligne », circuit seul | Calcul défavorable et simple ; l'amont s'ajoute |
| 2026-11-04 (ph. 4) | Les cheminements restent des `ducts` (`sys: 'elec'`) enrichis (`kind`, `pose`, `z`, `lw`, `lh`, `cids`), pas un nouvel objet | Partir des conduits existants : dessin, sélection, poignées, 3D et filtres déjà en place |
| 2026-11-04 (ph. 4) | Gaine existante : type et pose « non précisés » ; verticales « non comptées » tant que la pose manque | Aucune valeur devinée |
| 2026-11-04 (ph. 4) | Hauteur d'un symbole : sa hauteur de pose ; valeur par défaut de Calque marquée « estimée » ; symbole au plafond = hauteur du niveau | Les verticales doivent être tracées jusqu'à leur source |
| 2026-11-04 (ph. 4) | Passage entre étages = deux symboles `traversee` jumeaux (`to`), un par niveau | Les gaines s'y raccordent comme à tout symbole ; rien à changer dans la sélection ni dans l'enregistrement |
| 2026-11-04 (ph. 4) | Copie de sécurité dans l'historique avant toute mise à jour du format à l'ouverture | Règle 7 de CLAUDE.md : migration + copie de sécurité |
| 2026-11-04 (ph. 4) | Longueurs = plus courts chemins (Dijkstra) dans le réseau des gaines depuis le tableau principal ; un circuit n'emprunte que ses gaines ou les gaines sans circuit | Résultat reproductible et vérifiable à la main |
| 2026-11-04 (ph. 4) | L de la fiche = longueur jusqu'au point le plus éloigné, « estimée » ; seulement si **tous** les points du circuit sont raccordés | Une longueur partielle sous-estimerait la chute de tension : elle reste « manquante » |
| 2026-11-04 (ph. 4) | Réserve de câble 10 % par défaut, marquée « estimée » (valeur de Calque) | Usage courant ; modifiable, jamais présentée comme une règle |
| 2026-11-04 (ph. 4) | Réseau des gaines mémorisé par plan (signature des gaines, symboles et niveaux) | La fiche et le bilan le demandent pour chaque circuit |

## Conventions de code
- Unités du plan : centimètres, Y vers le bas. Calcul : W, var, VA, V, A, m, mm².
- Interface et commentaires en français.
- Tout changement du plan appelle `commit()` (annuler, enregistrement, événement `EV.PLAN_CHANGE`).
- Nouveau fichier dans `js/` : l'ajouter à `CORE` dans `sw.js` et changer le nom du cache (actuellement `calque-v16`).
- Boutons de 44 px minimum dans les nouvelles fenêtres (doigt et Pencil).
- Tests dans `tests/*.test.mjs` ; captures et fichiers temporaires hors du dépôt.

## Dépendances entre modules (calcul)
`noyau` ← `elecdonnees` ← `calcul` ← `normes`
`calcul` + `electricite` + `interface` ← `fiche` ← (`tableau`, `interface`)
`noyau` + `mutations` + `symboles` ← `cheminement` ← (`reseaux`, `vue3d`, `stockage`, `calcul`)

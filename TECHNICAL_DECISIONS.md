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
| 2026-11-04 (ph. 4) | Itinéraire : A* sur grille (cellule 5 cm ou plus, 60 000 cases au plus), 4 directions, coûts : virage 40, mur 300, cloison 80, abords VMC 4 | Tracés droits et orthogonaux comme sur chantier ; calcul rapide sur iPad |
| 2026-11-04 (ph. 4) | Conflits = points d'attention de Calque (« à revoir » / information), jamais « conforme » | Ce ne sont pas des règles de la norme |
| 2026-11-04 (ph. 4) | Inspecteur d'un type ajouté par un module : `EXT.insp` | Les zones interdites sont gérées par `routeui.js` sans alourdir `interface.js` |
| 2026-11-04 (ph. 4) | Remplissage : occupation calculée sur la section **nominale**, présentée comme « indicative », statut toujours « vérification nécessaire » | Diamètre intérieur réel et taux maximal inconnus (extrait non fourni) ; aucune conclusion de conformité |
| 2026-11-04 (ph. 4) | Matériel : un câble par circuit, phase + neutre + terre (5 conducteurs en triphasé), navettes non comptées ; toutes les quantités « estimées » | Hypothèses simples, écrites à côté des quantités |
| 2026-11-05 (ph. 5) | Éclairage : méthode des lumens + calcul point par point de la composante directe ; tout résultat est « estimé » | Simple, vérifiable à la main ; ne remplace pas une étude du fabricant |
| 2026-11-05 (ph. 5) | Aucun éclairement par défaut : l'éclairement visé est saisi, avec sa source facultative | Aucune valeur réglementaire n'est dans l'extrait Legrand fourni |
| 2026-11-05 (ph. 5) | Facteur d'utilance par défaut = part du flux qui atteint directement le plan utile (réflexions ignorées), « estimée » | Calculé, pas deviné, et prudent ; un U saisi (tableau du fabricant) le remplace |
| 2026-11-05 (ph. 5) | Plan utile 80 cm et facteur de maintenance 0,8 : valeurs de Calque « estimées », modifiables | Valeurs courantes, jamais présentées comme une règle |
| 2026-11-05 (ph. 5) | Sans fichier photométrique, répartition lambertienne (« estimée ») | Hypothèse classique d'un luminaire de plafond qui éclaire vers le bas |
| 2026-11-05 (ph. 5) | Trois propositions = trois critères écrits (puissance, nombre, uniformité), dispositions régulières ≤ 12 × 12, au plus deux fois le nombre minimal | Choix explicables et distincts ; calcul rapide sur iPad |
| 2026-11-05 (ph. 5) | Implantation = symboles ordinaires portant `lum` (copie du flux et de la puissance) ; l'étude garde leurs `ids` pour les remplacer | Modifiables comme tout symbole ; une nouvelle implantation n'efface jamais les luminaires posés à la main |
| 2026-11-05 (ph. 5) | Format v7 : `photometries[]` (répartition complète, dans le plan), `etudes[]`, `elec[].lum` | Le plan reste autonome hors ligne et partageable |
| 2026-11-05 (ph. 5) | Flux d'un fichier IES / LDT = intégrale de la répartition lue, « vérifiée » (source = fichier) ; flux déclaré affiché pour comparaison | C'est la lumière qui sort du luminaire ; le flux des lampes seules surestimerait |
| 2026-11-05 (ph. 5) | IES : type C seulement ; LDT : intensités converties avec le flux du premier jeu de lampes | Cas des luminaires d'intérieur ; usage courant des logiciels d'éclairage |
| 2026-11-05 (ph. 5) | Répartition enregistrée complétée sur 360° (au plus 200 000 valeurs), arrondie au centième de candela | Lecture simple et rapide ; taille raisonnable dans le plan |
| 2026-11-05 (ph. 5) | Sélecteur de fichiers sans filtre d'extension, contrôle après lecture | Sur iPad, un filtre `.ies` peut griser les fichiers dans l'app Fichiers |
| 2026-11-05 (ph. 5) | 3D : murs, cloisons et baies dans un lot à part (`G.w`) | Transparence et sélection « à travers » sans reconstruire la maquette |
| 2026-11-05 (ph. 5) | Coupe = plan de découpe dans les shaders (rendu, ombres, sélection) | Curseur fluide sur iPad : aucune reconstruction pendant le réglage |
| 2026-11-05 (ph. 5) | Câbles 3D = tronçons de `cheminCircuit` (même calcul que les longueurs) | Une seule source : ce qui est dessiné est ce qui est compté |
| 2026-11-05 (ph. 5) | Objets masqués et coupe = réglages de la vue (`S.v3`, par plan), jamais dans le plan | Aucune donnée du plan n'est modifiée ni perdue par l'affichage |
| 2026-11-05 (ph. 5) | Goulotte ou chemin de câbles sans dimensions : dessin indicatif 60 × 40 mm, signalé | Montrer le conduit sans inventer de donnée (rien n'est enregistré) |
| 2026-11-05 (ph. 5) | Déplacement 3D : seulement les symboles au plafond ou au sol ; un seul `commit()` à la fin du geste, reconstruction limitée à une toutes les 70 ms | Un appareil mural se place le long du mur sur le plan ; un geste = une annulation |
| 2026-11-05 (ph. 6) | Moteur d'écriture PDF sorti de `export.js` dans `js/pdf.js` (sans écran), réexporté par `export.js` | Le même moteur sert à l'export du plan et au dossier ; testable dans Node |
| 2026-11-05 (ph. 6) | Pages de texte mesurées avec les largeurs Helvetica (`textWidth`, option `helv` de `PdfCtx`) | Même mise en page dans Node et sur l'iPad, quelle que soit la police de l'écran |
| 2026-11-05 (ph. 6) | Schéma unifilaire et coffret : SVG de `tableau.js` relu et redessiné (`svgpdf.js`), pas d'image | Vectoriel, net à l'impression, sans bibliothèque ; un élément inconnu est compté, jamais inventé |
| 2026-11-05 (ph. 6) | Cartouche et numéros de page écrits à la fin de la composition | Le nombre de pages et le sommaire sont connus seulement à la fin |
| 2026-11-05 (ph. 6) | Format v8 : `doc` = cartouche + `revisions[]` (indice, date, objet, auteur) ; indice A, B… Z, AA ; une version de l'historique à chaque indice | Le dossier diffusé reste retrouvable ; sans indice, « non diffusé » |
| 2026-11-05 (ph. 6) | Ce qui demande l'écran (dessin du plan, SVG, contour des pièces, références) est passé en options à `documents.js` | Le moteur documentaire reste sans écran ; sans ces options, le chapitre le dit au lieu d'inventer |

| 2026-11-05 (ph. 6) | Moteur de règles `regles.js` sans écran ; les contrôles qui demandent la géométrie (nfcChecks) lui sont transmis par l'écran avec l'identifiant de leur règle (`rid`) | Rien n'est réécrit ni perdu ; le moteur reste testable dans Node |
| 2026-11-05 (ph. 6) | Versions : `v` par règle + `REGLES_VERSION` du jeu de règles, notée dans le rapport, le cartouche et chaque indice de révision | On sait avec quelles règles un dossier a été établi |
| 2026-11-05 (ph. 6) | « Conforme » seulement pour une règle à source vérifiée (extrait Legrand fourni, ou condition calculée IB ≤ In déjà validée en phase 3) ; règle de Calque respectée → « vérification nécessaire » (« à confirmer ») ; manquement → « non conforme » | Pas d'affirmation de conformité sans source ; un problème détecté reste signalé |
| 2026-11-05 (ph. 6) | Recommandations (parafoudre, GTL, DDA, RJ45) et points d'attention (VMC, symbole sans circuit…) : jamais « non conformes » | Ce ne sont pas des exigences vérifiées |
| 2026-11-05 (ph. 6) | Contrôles Legrand du moteur de calcul et anciens contrôles de Calque gardés côte à côte (lien `voir` entre eux) | Leur logique diffère légèrement (ex. type A ou F) : aucune fusion qui changerait un résultat |
| 2026-11-05 (ph. 6) | Pastille de l'onglet : plus de coche verte sans conformité globale | Une coche ferait croire à une installation conforme |

## Conventions de code
- Unités du plan : centimètres, Y vers le bas. Calcul : W, var, VA, V, A, m, mm².
- Interface et commentaires en français.
- Tout changement du plan appelle `commit()` (annuler, enregistrement, événement `EV.PLAN_CHANGE`).
- Nouveau fichier dans `js/` : l'ajouter à `CORE` dans `sw.js` et changer le nom du cache (actuellement `calque-v22`).
- Boutons de 44 px minimum dans les nouvelles fenêtres (doigt et Pencil).
- Tests dans `tests/*.test.mjs` ; captures et fichiers temporaires hors du dépôt.

## Dépendances entre modules (calcul)
`noyau` ← `elecdonnees` ← `calcul` ← `normes`
`calcul` + `electricite` + `interface` ← `fiche` ← (`tableau`, `interface`)
`noyau` + `mutations` + `symboles` ← `cheminement` ← (`reseaux`, `vue3d`, `stockage`, `calcul`)
`cheminement` ← `itineraire` ← `materiel` ← (`metres`, `reseaux`) ; `routeui` (écran) utilise `itineraire` et `cheminement`
`calcul` + `normes` + `materiel` ← `regles` ← `reglesui` (écran, avec `electricite`) ← (`tableau`, `dossierui`)
`pdf` + `svgpdf` + `calcul` + `materiel` + `eclairage` + `regles` ← `documents` ← `dossierui` (écran, avec `export`, `tableau`) ; `stockage` (migration v8) utilise `documents`
`noyau` + `photometrie` ← `eclairage` ← `eclairageui` (écran, avec `fiche`) ← `interface` ; `stockage` (migration v7) utilise `eclairage` et `photometrie`

# NEXT_SESSION — prompt et instructions pour la prochaine session

Copiez le bloc ci-dessous au début d'une nouvelle session Claude Code (une session par phase).

---

```
Projet Calque (dépôt 06quentin03-pixel/Calque), phase 4 : cheminements et métrés.
Travaille uniquement sur la branche claude/layer-modification-prompt-feasibility-nw7oa4 :
fais un git fetch, puis un checkout de cette branche. Ne touche jamais à main (c'est moi qui fusionne,
sauf si je te demande explicitement de fusionner la demande de fusion).

Avant toute modification :
1. Lis CLAUDE.md, PROJECT_STATE.md, TECHNICAL_DECISIONS.md, NEXT_SESSION.md, ROADMAP.md, PROGRESS.md,
   CHANGELOG.md et docs/ARCHITECTURE.md, et respecte toutes les règles de CLAUDE.md.
2. Vérifie que la branche contient tout main (la demande n°2, phase 3, a été fusionnée).
   Si elle est en retard, remets-la au niveau de main avant de commencer.
3. Lance node --test tests/*.test.mjs : tout doit réussir (59/59 à la fin de la phase 3).
4. Vérifie l'état réel du code (js/reseaux.js : conduits ; js/calcul.js : longueur des câbles ;
   js/fiche.js), puis dis-moi en quelques lignes où on en est.

Ensuite, fais la phase 4 de ROADMAP.md, dans l'ordre :
- cheminements (ICTA, IRL, goulottes, chemins de câbles), verticales et passages entre étages,
  en partant des conduits existants (P.ducts) ;
- longueurs géométriques, longueurs de cheminement et longueurs à commander (avec réserve),
  qui alimentent la longueur L de la fiche de calcul (donnée « estimée » depuis le plan, remplaçable par une saisie) ;
- recherche d'itinéraire avec zones interdites et conflits (portes, murs, réseaux) ;
- taux de remplissage des conduits et liste de matériel.

Contraintes : celles de CLAUDE.md (données vérifiée/saisie/estimée, trois statuts, extraits Legrand seuls,
migration PLAN_VERSION/MIGRATIONS avec test, CORE de sw.js + nouveau nom de cache, iPad paysage/portrait
et Pencil, tests et captures hors du dépôt). Les taux de remplissage des conduits sont une règle de la
NF C 15-100 : sans extrait Legrand, ils restent « vérification nécessaire ».

À la fin de chaque étape : mets à jour PROJECT_STATE.md, PROGRESS.md, CHANGELOG.md, ROADMAP.md
(et TECHNICAL_DECISIONS.md si une décision est prise), commit explicite, push sur la branche.
À la fin de la phase : réécris NEXT_SESSION.md pour la phase 5, prépare une nouvelle demande de fusion
vers main et donne-moi la liste des tests à faire sur l'iPad.
Explique-moi tout simplement, en français : je débute sur GitHub et j'utilise un iPad.
```

---

## À faire avant ou pendant la prochaine session
1. **Essais iPad de la phase 3** (par l'utilisateur), en paysage et en portrait :
   1. L'appli se met à jour, les plans existants sont là, le mode avion fonctionne.
   2. Tableau électrique : arrivée, circuits, schéma et contrôle NF C 15-100 inchangés.
   3. Plan : toucher un radiateur ou une prise relié à un circuit → « Fiche de calcul ».
   4. Saisir puissance, cos φ et longueur au doigt et au Pencil ; l'intensité et la chute de tension s'affichent.
   5. Marquer une valeur « Vérifiée » sans origine → refus ; avec une origine → accepté.
   6. Fiche ouverte → « Annuler » défait la dernière saisie.
   7. Tableau › un circuit › « Fiche de calcul ».
   8. Arrivée et installation › Réseau → « Triphasé 400 V » ; choisir une phase dans une fiche.
   9. Onglet « Bilan » : saisir un ks, « Appliquer la répartition proposée », puis « Annuler ».
   10. Onglet « Bilan » › Interrupteurs différentiels : les contrôles et la source Legrand s'affichent.
   11. « Régénérer depuis le plan » sur un plan avec sèche-linge : il passe sous un différentiel de type A.
   12. Fermer et rouvrir l'appli : les saisies sont conservées.
2. **Extraits Legrand encore manquants** (à fournir quand vous les avez) : un document Legrand qui contient
   - les courants admissibles des câbles (Iz) selon la section, l'isolant et le mode de pose ;
   - les modes de pose et leur méthode de référence ;
   - les facteurs de correction (température ambiante, groupement de circuits) ;
   - les chutes de tension maximales admises (éclairage / autres usages) et les constantes de calcul (ρ, λ) ;
   - les coefficients de simultanéité ;
   - pour la phase 4 : les taux de remplissage des conduits.
   Le guide « Points clés » déjà fourni ne les contient pas ; ils se trouvent en général dans les guides techniques
   Legrand de dimensionnement des canalisations (à confirmer sur legrand.fr).
3. Décision à prendre plus tard : afficher en triphasé le bon disjoncteur d'abonné (aujourd'hui, celui du monophasé).

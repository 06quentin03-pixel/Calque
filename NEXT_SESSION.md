# NEXT_SESSION — prompt et instructions pour la prochaine session

Mise à jour : 11 novembre 2026 (mission « développement autonome », en cours jusqu'au 17 novembre 2026).

Copiez le bloc ci-dessous au début d'une nouvelle session Claude Code.

---

```
Projet Calque (dépôt 06quentin03-pixel/Calque), mission « développement autonome » (jusqu'au 17 novembre 2026).
Travaille sur la branche claude/ecstatic-sagan-juah82 (git fetch, puis checkout). Ne touche jamais à main :
c'est moi qui fusionne.

Avant toute modification :
1. Lis CLAUDE.md, PROJECT_STATE.md, TECHNICAL_DECISIONS.md, NEXT_SESSION.md, ROADMAP.md, PROGRESS.md,
   CHANGELOG.md et docs/ARCHITECTURE.md, et respecte toutes les règles de CLAUDE.md.
2. Lance node --test tests/*.test.mjs : tout doit réussir (133/133 le 12 novembre 2026).

Ensuite, continue le cycle : analyser, développer, tester, corriger, passer à la suite, sans me demander de valider
chaque étape. Priorités : 1) bugs et sécurité des données, 2) amélioration de l'existant, 3) fonctions manquantes.
Suite envisagée (voir ROADMAP.md, section « Mission ») : accrochage aux traits d'un fond DXF ; tableaux
NF C 15-100 manquants quand je fournirai les extraits Legrand (ne rien inventer d'ici là).

Contraintes : celles de CLAUDE.md (données vérifiée/saisie/estimée, trois statuts, jamais de conformité globale si
tout n'est pas vérifié, extraits Legrand seuls, migration PLAN_VERSION/MIGRATIONS avec test et copie de sécurité,
CORE de sw.js + nouveau nom de cache, iPad paysage/portrait et Pencil, tests et captures hors du dépôt, plan d'exemple
complété à chaque fonction). À la fin de chaque étape : PROJECT_STATE.md, PROGRESS.md, CHANGELOG.md, commit, push.
Explique-moi tout simplement, en français : je débute sur GitHub et j'utilise un iPad.
```

---

## Demande de fusion n°7
https://github.com/06quentin03-pixel/Calque/pull/7 : **fusionnée dans `main` le 12 novembre 2026** par l'utilisateur.
Essais iPad à faire plus tard (l'utilisateur n'a pas l'iPad sous la main le 12 novembre). La branche
`claude/ecstatic-sagan-juah82` est repartie de `main` après la fusion ; le travail suivant (équipement minimal…)
passera par une nouvelle demande de fusion (n°8). L'utilisateur enverra plus tard, depuis son iPad, une vraie maquette IFC pour éprouver
l'import (et si possible un vrai DXF d'architecte) : à essayer en priorité dès réception, et corriger ce qui manque.

## Pour essayer la branche sur l'iPad
La version publiée (GitHub Pages) est celle de `main`. Pour avoir les nouveautés dans l'appli de tous les jours, il faut
fusionner la branche `claude/ecstatic-sagan-juah82` dans `main` : sur github.com, onglet « Pull requests » ›
« New pull request » › base `main`, compare `claude/ecstatic-sagan-juah82` › « Create pull request » › « Merge ».
(La demande n°7 est fusionnée : ses nouveautés sont déjà dans `main`. Le travail suivant passera par la demande n°8.) Vos plans ne sont pas touchés : le format passe
de v10 à v11 avec une copie de sécurité dans l'historique des versions.

## Essais à faire sur l'iPad (ce que les tests automatiques ne couvrent pas)
Sur le plan d'exemple (Menu › Ouvrir le plan d'exemple), en paysage et en portrait :
1. **Export DXF** : bouton Exporter › « DXF (AutoCAD) » › Partager ou Enregistrer dans Fichiers ; si possible, ouvrir le
   fichier dans un logiciel de DAO (AutoCAD, DraftSight, LibreCAD…) : calques séparés, bonnes dimensions, accents.
2. **Quantitatif** (Tableau électrique › Quantitatif) : saisir des prix au clavier de l'iPad en passant d'une ligne à
   l'autre (le curseur doit rester dans le champ touché) ; vues « Par pièce » et « Par circuit » ; « Tableur (CSV) » ›
   ouvrir dans Numbers.
3. **Outil Groupe** : tracer un rectangle au doigt, puis au Pencil (en mode Pencil, le doigt déplace la vue) ; faire
   glisser le groupe ; « Actions… » en portrait ; copier vers l'étage ; Annuler.
4. **Import d'un vrai plan DXF d'architecte** (Menu › Importer un fond de plan) : unité proposée et dimensions
   annoncées ; retirer des calques ; avec « Créer aussi les murs » : regarder ce qui est bien reconnu et ce qui ne l'est
   pas (m'envoyer le fichier ou une capture si le résultat est mauvais : c'est le point le moins éprouvé).
5. **Import d'une vraie maquette IFC** (Menu › Importer une maquette IFC), si vous en avez une (export Revit ou
   ArchiCAD) : niveaux, murs, portes et fenêtres ; me signaler ce qui manque.
6. **Raccordement automatique** (Tableau électrique › Cheminements › « Raccorder les circuits incomplets ») sur un de
   vos plans : durée, lisibilité des gaines proposées, puis Annuler.
7. **Disjoncteur d'abonné en triphasé** : Tableau › Arrivée et installation : 36 kVA triphasé affiche « 30/60 A
   tétrapolaire réglé à 60 A par phase » (valeur estimée : à comparer avec votre contrat).
8. **Équipement minimal** : toucher le local technique du plan d'exemple › « Poser l'équipement manquant » ; sur un plan vide de quelques pièces nommées : inspecteur du niveau › « Équiper toutes les pièces » ; regarder si les positions conviennent à un électricien.
9. **Assistant** (Menu › Assistant : où en est mon projet ?) : lisible en portrait, chaque bouton mène à la bonne page.
10. Mise à jour de l'appli installée (bandeau « nouvelle version ») ; un ancien plan s'ouvre, Menu › Historique des
   versions montre « Copie de sécurité avant mise à jour du format (v10 → v11) ».

## Toujours en attente de vous
- Extraits Legrand NF C 15-100 manquants (Iz, modes de pose, facteurs de correction, chutes de tension, simultanéité,
  remplissage) : sans eux, ces contrôles restent « vérification nécessaire » (voulu).
- Un vrai fichier DXF d'architecte et, si possible, une vraie maquette IFC, pour éprouver les imports.

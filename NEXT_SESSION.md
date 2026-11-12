# NEXT_SESSION — prompt et instructions pour la prochaine session

Mise à jour : 12 novembre 2026 (mission « développement autonome », en cours jusqu'au 17 novembre 2026).

Copiez le bloc ci-dessous au début d'une nouvelle session Claude Code.

---

```
Projet Calque (dépôt 06quentin03-pixel/Calque), suite de la mission « développement autonome ».
Les demandes de fusion n°7, n°8 et n°9 sont fusionnées dans main : pars de main, sur la branche de développement
indiquée par la session (git fetch, puis checkout). Ne modifie jamais main toi-même : c'est moi qui fusionne
(sauf si je te demande explicitement de fusionner une demande de fusion).

Avant toute modification :
1. Lis CLAUDE.md, PROJECT_STATE.md, TECHNICAL_DECISIONS.md, NEXT_SESSION.md, ROADMAP.md, PROGRESS.md,
   CHANGELOG.md et docs/ARCHITECTURE.md, et respecte toutes les règles de CLAUDE.md.
2. Lance node --test tests/*.test.mjs : tout doit réussir (155/155 le 12 novembre 2026).
3. Demande-moi le résultat de mes essais sur l'iPad (liste ci-dessous) et corrige d'abord ce qui ne va pas.

Ensuite, continue le cycle : analyser, développer, tester, corriger, passer à la suite, sans me demander de valider
chaque étape. Priorités : 1) bugs et sécurité des données, 2) amélioration de l'existant, 3) fonctions manquantes.
Pistes (ROADMAP.md, section « Mission ») : essais sur de vrais fichiers DXF d'architecte ; itinéraire des gaines
d'un étage à l'autre ; tableaux NF C 15-100 manquants quand je fournirai les extraits Legrand (ne rien inventer
d'ici là).

Contraintes : celles de CLAUDE.md (données vérifiée/saisie/estimée, trois statuts, jamais de conformité globale si
tout n'est pas vérifié, extraits Legrand seuls, migration PLAN_VERSION/MIGRATIONS avec test et copie de sécurité,
CORE de sw.js + nouveau nom de cache, iPad paysage/portrait et Pencil, tests et captures hors du dépôt, plan d'exemple
complété à chaque fonction, fichiers de l'utilisateur jamais ajoutés au dépôt). À la fin de chaque étape :
PROJECT_STATE.md, PROGRESS.md, CHANGELOG.md, commit, push. Explique-moi tout simplement, en français :
je débute sur GitHub et j'utilise un iPad.
```

---

## Demandes de fusion
- n°7 (export DXF, quantitatif, Groupe, imports DXF et IFC, raccordement automatique, assistant) : fusionnée le 12 novembre 2026.
- n°8 (équipement minimal, relier les appareils sans circuit, Mesurer, rappel et sauvegardes par morceaux, accrochage
  au fond DXF, corrections des gaines après régénération, migrations vérifiées, import IFC essayé sur la maquette
  Allplan de l'utilisateur) : fusionnée le 12 novembre 2026, à la demande de l'utilisateur.
- Essais iPad des demandes n°7 et n°8 faits par l'utilisateur le 12 novembre 2026 : « tout va bien » ; deux défauts signalés et corrigés le jour même (bouton « Actions… » de l'outil Groupe, choix de la puissance souscrite jusqu'à 36 kVA). L'utilisateur n'a pas de vrai plan DXF d'architecte : l'import DXF et la reconnaissance des murs restent essayés sur des fichiers de synthèse seulement.
- La maquette IFC de l'utilisateur (« BERT_A.ifc ») a été essayée mais n'est pas dans le dépôt (données personnelles) :
  la lui redemander si besoin.

- n°9 (bouton « Actions… » du Groupe, puissance souscrite) : fusionnée le 12 novembre 2026 ; essais iPad : « tout va bien ».
- Travail suivant (saisie des prix plus rapide, import IFC Revit / ArchiCAD) : sur la branche `claude/beautiful-sagan-pd72qi`, pas encore fusionné.

## Pour essayer la branche sur l'iPad
La version publiée (GitHub Pages) est celle de `main`. Pour avoir les nouveautés dans l'appli de tous les jours, il faut
fusionner la branche de développement de la session (`claude/beautiful-sagan-pd72qi`) dans `main` : sur github.com, onglet « Pull requests » ›
« New pull request » › base `main`, compare `claude/beautiful-sagan-pd72qi` › « Create pull request » › « Merge ».
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
4 bis. Avec un DXF importé en fond (sans « Créer aussi les murs ») : outil Mur au Pencil, toucher près des coins des murs du dessin : le repère carré apparaît et le mur se place sur l'axe.
5. **Import de votre maquette IFC** (Menu › Importer une maquette IFC › BERT_A.ifc) : 3 niveaux, pièces nommées (SÉJOUR, CHAMBRE 1…), portes et fenêtres ; regarder aussi la 3D ; me signaler ce qui manque ou est faux.
6. **Raccordement automatique** (Tableau électrique › Cheminements › « Raccorder les circuits incomplets ») sur un de
   vos plans : durée, lisibilité des gaines proposées, puis Annuler.
7. **Disjoncteur d'abonné en triphasé** : Tableau › Arrivée et installation : 36 kVA triphasé affiche « 30/60 A
   tétrapolaire réglé à 60 A par phase » (valeur estimée : à comparer avec votre contrat).
8. **Équipement minimal** : toucher le local technique du plan d'exemple › « Poser l'équipement manquant » ; sur un plan vide de quelques pièces nommées : inspecteur du niveau › « Équiper toutes les pièces » ; regarder si les positions conviennent à un électricien.
9. **Relier les appareils sans circuit** : après « Équiper la pièce » sur le local technique, bouton « Relier les appareils sans circuit (1) » juste dessous (ou dans l'onglet Tableau électrique) : la prise rejoint un circuit de prises, aucun autre circuit ne change.
10. **Outil Mesurer** (touche U ou bouton « Mesurer ») : au Pencil, toucher les angles d'une pièce, puis le premier point : surface affichée ; « Transformer en cotes ». En paysage, tous les outils de la barre de gauche sont visibles sans la faire défiler.
11. **Rappel de sauvegarde** : à la première ouverture après la mise à jour, un bandeau en bas propose « Sauvegarder maintenant » ; la sauvegarde enregistrée dans Fichiers fait disparaître le rappel, et le menu affiche « faite aujourd'hui ».
12. **Assistant** (Menu › Assistant : où en est mon projet ?) : lisible en portrait, chaque bouton mène à la bonne page.
13. Mise à jour de l'appli installée (bandeau « nouvelle version ») ; un ancien plan s'ouvre, Menu › Historique des
   versions montre « Copie de sécurité avant mise à jour du format (v10 → v11) ».

14. **Quantitatif sur un gros plan** : saisir plusieurs prix à la suite : la saisie doit être immédiate, les totaux à jour, « Annuler » revient d'une saisie.
15. **Import IFC** d'une maquette Revit ou ArchiCAD si vous en avez une : le résumé annonce les portes et fenêtres « placées d'après leur position » et les murs regroupés ; vérifier les pièces et leurs noms.

## Toujours en attente de vous
- Extraits Legrand NF C 15-100 manquants (Iz, modes de pose, facteurs de correction, chutes de tension, simultanéité,
  remplissage) : sans eux, ces contrôles restent « vérification nécessaire » (voulu).
- Un vrai fichier DXF d'architecte et, si possible, une vraie maquette IFC, pour éprouver les imports.

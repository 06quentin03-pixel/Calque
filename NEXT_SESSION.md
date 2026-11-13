# NEXT_SESSION — prompt et instructions pour la prochaine session

Mise à jour : 13 novembre 2026 (onglet « Schémas » et demandes sur les gaines, branche `claude/calque-electrical-plans-module-tbt1ea`, après la fusion n°11).

Copiez le bloc ci-dessous au début d'une nouvelle session Claude Code.

---

```
Projet Calque (dépôt 06quentin03-pixel/Calque), suite du module « Plans électriques ».
Travaille sur la branche de développement indiquée par la session (git fetch, puis checkout). Ne modifie jamais main
toi-même : c'est moi qui fusionne.

Avant toute modification :
1. Lis CLAUDE.md, PROJECT_STATE.md, TECHNICAL_DECISIONS.md, NEXT_SESSION.md, ROADMAP.md, PROGRESS.md, CHANGELOG.md,
   docs/ARCHITECTURE.md et docs/MODULE_ELECTRIQUE.md, et respecte toutes les règles de CLAUDE.md.
2. Lance node --test tests/*.test.mjs : tout doit réussir (175/175 le 13 novembre 2026).
3. Demande-moi le résultat de mes essais sur l'iPad (liste ci-dessous) et corrige d'abord ce qui ne va pas.

Ensuite, continue avec les pistes du ROADMAP (section « Module Plans électriques »), une à la fois, testée, avec le plan
d'exemple complété. Explique-moi tout simplement, en français : je débute sur GitHub et j'utilise un iPad.
```

---

## Pour essayer la branche sur l'iPad
La version publiée (GitHub Pages) est celle de `main`. Pour essayer le module dans l'appli de tous les jours, il faut
fusionner la branche dans `main` : sur github.com, onglet « Pull requests » › « New pull request » › base `main`,
compare `claude/calque-electrical-plans-module-tbt1ea` › « Create pull request » › « Merge pull request ».
Vos plans ne sont pas touchés : à la première ouverture, le format passe de v11 à v12 avec une copie de sécurité dans
Menu › Historique des versions (« Copie de sécurité avant mise à jour du format (v11 → v12) »).

## Essais de l'onglet « Schémas » (13 novembre 2026)
Sur le plan d'exemple (Menu › Ouvrir le plan d'exemple), onglet **Schémas**, en paysage puis en portrait :
1. Parcourir les folios (barre du haut) : démarrage direct, inverseur, télérupteur, va-et-vient, distribution ; zoomer à deux doigts.
2. Toucher la bobine KM1 : son panneau montre ses bornes (potentiels) et ses contacts avec leur position ; toucher un contact : « Appareil » ramène à la bobine.
3. « + Folio », puis **Symboles** › Commande › Bobine de contacteur : toucher la feuille au Pencil (KM… automatique) ; poser un contact à fermeture (il prend le même repère) ; **Fil** : toucher une borne orange puis une autre.
4. Déplacer un symbole au Pencil : les fils suivent. Annuler.
5. **Listes** : nomenclature, borniers, fils, contrôles. **Modèles** : ajouter « Démarrage direct » une seconde fois (repères renumérotés). **Depuis le tableau** : folios de distribution.
6. **Exporter** › Dossier PDF (Partager › Fichiers), puis SVG et DXF du folio ; ouvrir le PDF dans Fichiers.
7. En mode Apple Pencil : le doigt déplace la feuille, le stylet dessine.

## Essais des demandes sur les gaines (13 novembre 2026)
Sur le plan d'exemple : local technique (en haut à gauche de l'atelier), boîte de dérivation murale et gaine dans le mur
jusqu'à la sortie de câble radiateur.
1. Toucher une gaine › Pose › « Cloison » : hauteur du parcours, longueur totale avec les verticales.
2. Toucher une gaine dont un bout est libre › « Longueur horizontale du tracé » › taper 3,50 m (350) : le tracé s'allonge ; Annuler.
3. Menu Affichage (icône des couches) › « Gaines et chemins de câbles » : les gaines disparaissent et reviennent.
4. Bibliothèque › Électricité › Chauffage › « Sortie de câble radiateur » ; Tableau et énergie › « Boîte de dérivation murale » : poser au mur au Pencil, régler la hauteur et la puissance.

## Essais à faire sur l'iPad (ce que les tests automatiques ne couvrent pas)
Sur le plan d'exemple (Menu › Ouvrir le plan d'exemple), en paysage puis en portrait, au doigt et au Pencil :
1. **Pastille « Calques et vues »** (en haut à droite du plan) : choisir « Câblage », « Éclairage », « Implantation »,
   puis la vue enregistrée « Atelier : éclairage câblé ». Le plan change sans rien perdre ; « Synthèse » remet tout.
2. **Calques** : masquer « Mobilier » ; verrouiller « Architecture » puis essayer de toucher un mur (rien ne se
   sélectionne) ; changer la couleur des « Courants faibles » ; « Annuler » revient en arrière.
3. **Plan de câblage** : zoomer sur l'atelier ; sur les chemins de câbles, les petits traits obliques indiquent le
   nombre de conducteurs et les textes « C14 · 3G1,5 » la désignation. Dites-moi si c'est lisible ou trop chargé.
4. **Bouton « Circuits »** : toucher un circuit (ses appareils s'entourent, son tracé s'épaissit) ; « Afficher seul » ;
   cocher deux circuits ; changer la couleur, la courbe, le type de conducteur ; ouvrir le même circuit dans l'onglet
   Tableau électrique : les mêmes valeurs y sont.
5. **Outil « Câbler »** (barre de gauche) : toucher le tableau, puis une prise : un tracé orange est proposé ;
   « Créer la gaine » ; toucher une autre prise : elle rejoint le même circuit (dérivation). « Tracé direct » ;
   « Refuser » ; « Annuler ».
6. **Raccordement proposé** : Tableau électrique › Cheminements › « Raccorder les … circuits incomplets » : les gaines
   apparaissent en pointillés sur le plan ; « Refuser » ne change rien ; « Valider » les crée.
7. **Taille d'un symbole** : toucher un symbole › « Taille du symbole » › 150 %.
8. **Quantitatif** (Tableau électrique › Quantitatif) : bouton « Voir » d'une ligne de prises : elles sont entourées sur
   le plan. Lignes « Fil ou câble 1,5 mm² » : le détail compte maintenant navettes, retours et fil pilote.
9. **Coffret** (Tableau électrique › Coffret) : la « Nomenclature du tableau » sous le repérage des circuits.
10. **Contrôle NF C 15-100** : chaque ligne indique « Erreur », « Avertissement » ou « Suggestion » ; nouveau groupe
    « Câblage et cohérence ».
11. **Exports** : bouton Exporter › choisir « Câblage » dans « Plan » › PDF, puis SVG (Partager › Fichiers) ;
    Menu › Dossier PDF : chapitre « Plans électriques » (un plan par vue et par niveau, avec légende des circuits).
12. **Un de vos vrais plans** : il s'ouvre (copie de sécurité v11 → v12), la vue « Câblage » et le gestionnaire de
    circuits fonctionnent ; dites-moi si des constats de câblage vous paraissent faux.

## Toujours en attente de vous
- Extraits Legrand NF C 15-100 manquants (Iz, modes de pose, facteurs de correction, chutes de tension, simultanéité,
  remplissage) : sans eux, ces contrôles restent « vérification nécessaire » (voulu).
- Un vrai fichier DXF d'architecte et, si possible, une vraie maquette IFC, pour éprouver les imports.
- Votre avis sur le schéma de câblage supposé (câblage en étoile depuis le tableau en suivant les gaines, télérupteurs
  au tableau) : si vous câblez en boîtes de dérivation, le moteur peut être complété.

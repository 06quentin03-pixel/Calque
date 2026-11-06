# NEXT_SESSION — prompt et instructions pour la prochaine session

Copiez le bloc ci-dessous au début d'une nouvelle session Claude Code (une session par phase).

---

```
Projet Calque (dépôt 06quentin03-pixel/Calque), phase 8 : validation finale.
Travaille uniquement sur la branche claude/layer-modification-prompt-feasibility-nw7oa4 :
fais un git fetch, puis un checkout de cette branche. Ne touche jamais à main (c'est moi qui fusionne,
sauf si je te demande explicitement de fusionner la demande de fusion).

Avant toute modification :
1. Lis CLAUDE.md, PROJECT_STATE.md, TECHNICAL_DECISIONS.md, NEXT_SESSION.md, ROADMAP.md, PROGRESS.md,
   CHANGELOG.md et docs/ARCHITECTURE.md, et respecte toutes les règles de CLAUDE.md.
2. Vérifie que la branche contient tout main (la demande n°6, phase 7 chantier et variantes, doit avoir été fusionnée).
   Si elle est en retard, remets-la au niveau de main avant de commencer.
3. Lance node --test tests/*.test.mjs : tout doit réussir (100/100 à la fin de la phase 7).
4. Vérifie l'état réel du code (js/stockage.js : IndexedDB, migrations, format v10 ; js/photos.js : base calque-photos ;
   js/chantier.js et js/variantes.js ; js/documents.js et js/regles.js), puis dis-moi en quelques lignes où on en est.

Ensuite, fais la phase 8 de ROADMAP.md :
- demande-moi d'abord les extraits Legrand NF C 15-100 manquants (courants admissibles Iz, modes de pose,
  facteurs de correction, chutes de tension maximales, constantes ρ et λ, simultanéité, remplissage des conduits) ;
  recopie-les dans js/normes.js avec leur page et leur édition, avec des tests, puis active In ≤ Iz, la limite
  de chute de tension et le remplissage ; rattache les règles « de Calque » (cq_…) aux pages des extraits fournis
  (nouvelle version des règles) ; sans extrait fourni, rien ne change (« vérification nécessaire ») ;
- projets de référence, tests complets, vérification hors ligne, migrations (v1 → v10) et exports,
  optimisation iPad (gros plans, photos nombreuses, dossier PDF long) ;
- décision en attente : disjoncteur d'abonné en triphasé.

Contraintes : celles de CLAUDE.md (données vérifiée/saisie/estimée, trois statuts, jamais de conformité globale
si tout n'est pas vérifié, extraits Legrand seuls, migration PLAN_VERSION/MIGRATIONS avec test et copie de
sécurité, CORE de sw.js + nouveau nom de cache, iPad paysage/portrait et Pencil, tests et captures hors du dépôt).
Toujours ajouter chaque nouvelle fonctionnalité au plan d'exemple (js/exemple.js) et compléter tests/exemple.test.mjs.

À la fin de chaque étape : mets à jour PROJECT_STATE.md, PROGRESS.md, CHANGELOG.md, ROADMAP.md
(et TECHNICAL_DECISIONS.md si une décision est prise), commit explicite, push sur la branche.
À la fin de la phase : prépare une nouvelle demande de fusion vers main et donne-moi la liste des tests à faire
sur l'iPad (seulement ce que tu ne peux pas tester toi-même), en t'appuyant sur le plan d'exemple.
Explique-moi tout simplement, en français : je débute sur GitHub et j'utilise un iPad.
```

---

## À faire avant ou pendant la prochaine session
1. **Demande de fusion n°6 (phase 7 : chantier et variantes)** : préparée le 6 novembre 2026, **à fusionner par l'utilisateur**.
2. **Essais iPad de la phase 7 : à faire** après la fusion, en paysage et en portrait, sur le plan d'exemple
   (Menu › Ouvrir le plan d'exemple) — seulement ce que les tests automatiques ne couvrent pas :
   1. L'appli installée se met à jour (bandeau « nouvelle version », ou fermer et rouvrir) ; vos plans sont toujours là. Ouvrir un ancien plan, puis Menu › Historique des versions : une ligne « Copie de sécurité avant mise à jour du format (v8 → v10) » est visible.
   2. Onglet **Chantier** : le plan simplifié est lisible sur l'iPad (pastilles « posé » vertes, réserves numérotées, appareil photo orange « à prendre ») ; zoom et déplacement au doigt fluides. Revenir à l'onglet Plan : mobilier, grille et cotes réapparaissent.
   3. Outil **Posé** : toucher des appareils au doigt, puis au Pencil : la pastille passe au vert ; le panneau « Suivi » (bouton à gauche) compte juste.
   4. Outil **Annoter** : écrire au **Pencil** (le trait suit bien la pointe, sans retard gênant) ; le doigt déplace le plan pendant ce temps ; la paume posée ne trace rien ; la gomme efface ; Annuler retire le dernier trait.
   5. Outil **Réserve** : toucher un appareil, taper le titre au **clavier de l'iPad** (touche « OK »), une description, changer le statut, choisir une échéance (le sélecteur de date de l'iPad s'ouvre).
   6. Outil **Photo** : « Prendre ou choisir une photo » → l'**appareil photo** de l'iPad s'ouvre (ou la photothèque) ; la photo apparaît sur le plan, dans le bon sens ; la toucher puis « Agrandir ». Sur la réserve n° 1, remplacer la « photo à prendre » par une vraie photo.
   7. **Mode avion** : refaire les points 3, 5 et 6 (photo comprise), fermer l'appli, la rouvrir : tout est encore là.
   8. Menu › **Sauvegarder tous mes plans** › Enregistrer dans Fichiers : la taille du fichier tient compte des photos. (Facultatif : l'importer sur un autre appareil.)
   9. Panneau Suivi › **Dossier PDF du chantier** › Préparer › Partager › Enregistrer dans Fichiers : ouvrir le PDF ; avancement, tableau des réserves, plan annoté (réserves, photos, annotations), **photos nettes et dans le bon sens**, historique.
   10. Menu › **Variantes** : lecture en portrait ; « Afficher » la variante Économique (la puce « Économique » en haut à gauche, les climatiseurs disparaissent du plan et de la 3D) ; revenir à « Standard » ; « Choisir comme principale » ; renommer une variante au clavier ; la comparaison se lit bien (défilement de côté en portrait si besoin).
   11. Dossier PDF avec le chapitre « Comparaison des variantes » : lisible sur l'iPad ; la variante est écrite sur la page de garde et le cartouche.
3. **Extraits Legrand manquants** : **reportés à la phase 8** (décision de l'utilisateur du 4 novembre 2026, documents payants). À demander au début de la phase 8.
4. Phase 8 : rattacher les règles « de Calque » (`cq_…`, `js/regles.js`) aux pages des extraits Legrand.
5. Décision à prendre : afficher en triphasé le bon disjoncteur d'abonné (aujourd'hui, celui du monophasé ; visible dans l'exemple, installation triphasée 36 kVA).
6. Règle permanente (CLAUDE.md, n° 12) : chaque nouvelle fonctionnalité est ajoutée au plan d'exemple.

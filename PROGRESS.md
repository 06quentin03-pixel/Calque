## 13 novembre 2026 — Demandes : escaliers, terrasses, colonne du tableau, câbles et fils, test des schémas
- Trémie en L ou en U à la forme de l'escalier, sol supprimé, terrasse et balcon d'un seul niveau (garde-corps), colonne de passage créée avec le tableau, conducteurs choisis gaine par gaine (fils ou câble), mode « Tester » des schémas (`js/simulation.js`).
- Format v15 avec migration et copie de sécurité. Plan d'exemple complété (escalier en L, balcon, vide sur entrée, colonne, choix des conducteurs).
- Défaut trouvé pendant les essais : export en double dans `vue3d.js` et `interaction.js` (l'application ne se chargeait plus), corrigé avant la fin de la session.
- Tests : 187/187 (`tests/demandes.test.mjs`, 12 tests).


## 13 novembre 2026 — Onglet « Schémas »
- Modules : `js/schemasymboles.js` (bibliothèque, sans écran), `js/schema.js` (moteur, sans écran), `js/schemaui.js` (écran).
- Vérifications : modèles sans court-circuit ni borne en l'air (test), auto-maintien et contact thermique reconnus, import du tableau d'un disjoncteur par circuit, dossier PDF de 15 pages sur le plan d'exemple, captures en 1180 × 820, 820 × 1180 et 390 × 844.
- Défauts trouvés et corrigés pendant les essais : renumérotation des modèles (deux bobines KM2), rattachement d'un contact auxiliaire à un contacteur, panneau qui masquait la feuille en portrait, nom du plan trop étroit avec le cinquième onglet.
- Tests : 175/175.

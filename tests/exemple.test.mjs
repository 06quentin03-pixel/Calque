// Plan d'exemple : il doit montrer chaque fonction de Calque (règle du projet, voir CLAUDE.md).
// À compléter à chaque nouvelle fonctionnalité. Lancer :  node --test tests/exemple.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, wait } from './outils.mjs';

test('plan d’exemple : toutes les fonctions y sont (phases 1 à 7, DXF, quantitatif), l’atelier est entièrement raccordé', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), CH = await import('./js/cheminement.js'), U = await import('./js/reglesui.js'), M = await import('./js/materiel.js');
    const D = await import('./js/documents.js'), Ui = await import('./js/dossierui.js'), I = await import('./js/itineraire.js');
    const P = N.P;
    const non = [];
    for (const c of P.circuits) for (const id of CH.cheminCircuit(P, c.id).nonAtteints) { const e = P.elec.find((q) => q.id === id); if (e.x > 1100) non.push(e.type); }
    const o = Ui.optionsDossier({ chap: D.CHAPITRES.map((c) => c.id), fmt: 'A4', fmtSch: 'A4' });
    const dos = await D.dossierPDF(P, o);
    const rap = U.rapportDuPlan();
    return {
      name: P.name, v: P.v, levels: P.levels.length,
      rooms: P.rooms.map((x) => x.name), opening: [...new Set(P.openings.map((x) => x.kind))],
      comps: P.comps.length, compUsed: P.items.filter((x) => x.comp).length, art: P.elec.filter((e) => e.art).length,
      types: [...new Set(P.elec.map((e) => e.type))], links: P.links.length,
      circuits: P.circuits.length, rcds: P.rcds.length, calc: P.circuits.filter((c) => c.calc).length, tri: P.circuits.filter((c) => c.calc && c.calc.phase === 'tri').length,
      install: P.install,
      kinds: [...new Set(P.ducts.filter((d) => d.sys === 'elec').map((d) => d.kind))], poses: [...new Set(P.ducts.filter((d) => d.sys === 'elec').map((d) => d.pose))],
      vmc: P.ducts.filter((d) => d.sys === 'vmc').length, twins: P.elec.filter((e) => e.type === 'traversee' && e.to).length, zones: P.zones.length,
      conflits: I.conflitsPlan(P).length, materiel: M.listeMateriel(P).lignes.length,
      etudes: P.etudes.filter((e) => e.E && e.lums.length).length, lum: P.elec.filter((e) => e.lum).length,
      doc: P.doc, non, pages: dos.pages, chap: dos.chapitres.length,
      rap: { total: rap.synthese.total, global: rap.global, cq: rap.resultats.filter((x) => x.id.startsWith('cq_')).length },
      chiff: P.chiffrage, qt: await (async () => { const Q = await import('./js/quantitatif.js'), QU = await import('./js/quantitatifui.js'); const q = QU.quantitatifDuPlan(), c = Q.chiffrer(q, P.chiffrage); return { n: q.lignes.length, cats: [...new Set(q.lignes.map((l) => l.cat))], pieces: q.parPiece.map((g) => g.piece), circ: q.parCircuit.length, chiffrees: c.chiffrees, complet: c.complet, ht: c.totalHT, ttc: c.totalTTC, mo: c.mainOeuvre }; })(),
      dxf: (await import('./js/export.js')).composeDXF({ lv: 'all', dims: true, names: true, areas: true, furn: true, elec: true, unit: 'cm' }).bilan,
      groupe: (await import('./js/multi.js')).dansRect({ a: { x: -1e6, y: -1e6 }, b: { x: 1e6, y: 1e6 } }).reduce((m, r) => { m[r.t] = (m[r.t] || 0) + 1; return m; }, {}),
      relu: await (async () => { const E = await import('./js/export.js'), I = await import('./js/dxfimport.js'); const R = I.lireDxf(E.composeDXF({ lv: 'all', dims: true, names: true, areas: true, furn: true, elec: true, unit: 'cm' }).texte); const em = I.empriseDxf(R, null); return { unite: R.unite, traits: R.traits.length, textes: R.textes.length, larg: em.x1 - em.x0 }; })(),
      auto: await (async () => { const It = await import('./js/itineraire.js'); const q = JSON.parse(JSON.stringify(P)); q.ducts = q.ducts.filter((d) => d.sys !== 'elec'); const c = q.circuits.find((x) => q.elec.filter((e) => e.cid === x.id && e.lv === 'L0').length >= 4); const r = It.raccorderCircuit(q, c.id, {}); return { gaines: r.gaines.length, echecs: r.echecs.length, points: q.elec.filter((e) => e.cid === c.id).length }; })(),
      assistant: await (async () => { const a = (await import('./js/assistantui.js')).avancementDuPlan(); return { n: a.etapes.length, faites: a.faites, suivante: a.suivante, etats: Object.fromEntries(a.etapes.map((e) => [e.id, e.etat])) }; })(),
      equip: await (async () => { const G = await import('./js/geometrie.js'), E = await import('./js/equipement.js'); const m = []; for (const L of P.levels) for (const r of G.geo(L.id).rooms) if (r.label && E.equiperPiece(P, { lv: L.id, nom: r.label.name, poly: r.poly, loop: r.loop, aire: r.area / 1e4 }).poses.length) m.push(r.label.name); return m; })(),
      chapQt: dos.chapitres.some((c) => c.id === 'quantitatif'),
      ch: P.chantier, chap7: dos.chapitres.some((c) => c.id === 'chantier'),
      va: P.variantes && { n: P.variantes.liste.length, gammes: P.variantes.liste.map((e) => e.gamme), principale: P.variantes.principale === P.variantes.active, data: P.variantes.liste.filter((e) => e.data).length }, chapVar: dos.chapitres.some((c) => c.id === 'variantes'),
    };
  });
  assert.equal(r.name, 'Exemple : maison et atelier');
  assert.equal(r.v, 11);
  // dessin (phase 1-2) : 2 niveaux, pièces nommées, portes, fenêtres, ouvertures
  assert.equal(r.levels, 2);
  for (const n of ['Séjour', 'Atelier', 'Local technique', 'Bureau d’atelier', 'Open space', 'Salle de réunion']) assert.ok(r.rooms.includes(n), n);
  for (const k of ['door', 'window', 'gap']) assert.ok(r.opening.includes(k), k);
  // bibliothèque (phase 2) : composants personnalisés posés, articles de la bibliothèque technique
  assert.ok(r.comps >= 3 && r.compUsed >= 6); assert.ok(r.art >= 5);
  // électricité (phase 3) : triphasé, ks, réserve, données de calcul, liaisons
  for (const t of ['tableau', 'tab_div', 'pc_tri', 'reglette', 'dalle_led', 'borne_ve', 'baes', 'arret_urg', 'traversee']) assert.ok(r.types.includes(t), t);
  assert.equal(r.install.reseau, 'tri'); assert.equal(r.install.ks.st, 'saisie'); assert.equal(r.install.reserve.st, 'saisie');
  assert.ok(r.circuits >= 30 && r.rcds >= 4 && r.calc >= 5 && r.tri >= 3 && r.links >= 20);
  // cheminements (phase 4) : tous les types et toutes les poses, passage entre étages, zone interdite, conflits, matériel
  for (const k of ['icta', 'irl', 'goulotte', 'cdc']) assert.ok(r.kinds.includes(k), k);
  for (const p of ['sol', 'plafond', 'hauteur']) assert.ok(r.poses.includes(p), p);
  assert.ok(r.vmc >= 4); assert.equal(r.twins, 2); assert.ok(r.zones >= 1); assert.ok(r.conflits >= 1); assert.ok(r.materiel >= 4);
  assert.deepEqual(r.non, [], 'chaque symbole de l’atelier est raccordé au tableau par les gaines');
  // éclairage (phase 5) : études avec éclairement visé et luminaires dont le flux est saisi
  assert.ok(r.etudes >= 3 && r.lum >= 20);
  // documents et règles (phase 6) : cartouche, indice A, dossier complet, rapport
  assert.equal(r.doc.revisions[0].i, 'A'); assert.ok(r.doc.client && r.doc.affaire);
  assert.equal(r.chap, 12); assert.ok(r.pages >= 25, `${r.pages} pages`);
  assert.ok(r.rap.total > 300 && r.rap.cq > 50); assert.notEqual(r.rap.global, 'conforme');
  // chantier (phase 7) : cases « posé » (appareils et circuits), réserves aux trois statuts avec échéance, photos à prendre
  // (aucune photo inventée), annotations, historique ; chapitre « Suivi de chantier » du dossier
  assert.ok(Object.keys(r.ch.poses.app).length >= 20 && Object.keys(r.ch.poses.circ).length >= 3);
  for (const st of ['ouverte', 'en_cours', 'levee']) assert.ok(r.ch.reserves.some((x) => x.statut === st), st);
  assert.ok(r.ch.reserves.some((x) => x.echeance) && r.ch.reserves.every((x) => /^Exemple/.test(x.titre)));
  assert.ok(r.ch.photos.length >= 2 && r.ch.photos.every((f) => f.aFaire), 'photos à prendre seulement');
  assert.ok(r.ch.notes.length >= 2 && r.ch.journal.length >= 5); assert.ok(r.chap7);
  // variantes (phase 7) : standard (principale, affichée), économique, haut de gamme ; chapitre de comparaison
  assert.equal(r.va.n, 3); assert.deepEqual(r.va.gammes, ['std', 'eco', 'haut']); assert.ok(r.va.principale); assert.equal(r.va.data, 2); assert.ok(r.chapVar);
  // outil « Groupe » : tous les types d'objets sélectionnables sont présents sur le niveau affiché
  for (const t of ['elec', 'item', 'duct', 'wall']) assert.ok(r.groupe[t] > 3, 'groupe ' + t);
  // export DXF : chaque calque du fichier est rempli par le plan d'exemple
  for (const n of ['PIECES', 'ESCALIERS', 'MOBILIER', 'MURS', 'OUVERTURES', 'ELEC_CHEMINEMENTS', 'ELEC_LIAISONS', 'ELEC_APPAREILS', 'COTES', 'TEXTES']) assert.ok(r.dxf.calques[n] > 0, 'DXF ' + n);
  // raccordement automatique : sur une copie de l'exemple sans ses gaines, un circuit est entièrement raccordé par des gaines proposées
  assert.ok(r.auto.gaines >= r.auto.points && r.auto.echecs === 0, JSON.stringify(r.auto));
  // assistant : le plan d'exemple montre des étapes faites, à faire et à surveiller (réserves ouvertes, chiffrage partiel)
  assert.ok(r.assistant.n >= 9 && r.assistant.faites >= 4 && r.assistant.suivante); assert.equal(r.assistant.etats.chiffrage, 'afaire'); assert.equal(r.assistant.etats.chantier, 'attention');
  // équipement minimal : une pièce de l'exemple (le local technique) montre ce qui manque, à poser depuis son inspecteur
  assert.deepEqual(r.equip, ['Local technique']);
  // import DXF : le fichier exporté du plan d'exemple se relit (unité centimètres, même emprise à quelques cm près)
  assert.equal(r.relu.unite, 5); assert.ok(r.relu.traits > 1000 && r.relu.textes > 100 && r.relu.larg > 7000 && r.relu.larg < 8500, JSON.stringify(r.relu));
  // quantitatif et chiffrage : toutes les catégories, par pièce et par circuit ; prix d'exemple fictifs « saisie » avec origine,
  // total partiel (des lignes restent non chiffrées) ; disjoncteur d'abonné triphasé
  for (const c of ['Appareillage', 'Protections', 'Cheminements', 'Conducteurs', 'Boîtes']) assert.ok(r.qt.cats.includes(c), c);
  assert.ok(r.qt.pieces.includes('Atelier') && r.qt.pieces.includes('Séjour') && r.qt.circ === r.circuits);
  assert.ok(Object.values(r.chiff.prix).every((x) => x.st === 'saisie' && /fictive/.test(x.src)));
  assert.ok(r.qt.chiffrees === Object.keys(r.chiff.prix).length && r.qt.chiffrees >= 10 && r.qt.complet === false && r.qt.ht > 0 && r.qt.ttc > r.qt.ht && r.qt.mo > 0); assert.ok(r.chapQt);
  assert.deepEqual(errors, []);
  await ctx.close();
});

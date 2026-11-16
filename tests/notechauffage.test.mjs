// Demande du 16 novembre 2026 : vraie note de calcul du chauffage (pièce par pièce, relance, export PDF, format v19).
// Lancer :  node --test tests/notechauffage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { noteChauffage, nettoyerV19, puissancePiece } from '../js/notechauffage.js';
import { deperditionsPiece } from '../js/thermique.js';
import { fresh, boot, wait, seedPlan, idb } from './outils.mjs';

/* une pièce de 5 × 4 m entourée de murs extérieurs (géométrie donnée comme celle de l'écran) */
function plan(o) {
  const n = [[0, 0], [500, 0], [500, 400], [0, 400]].map(([x, y], i) => ({ id: 'n' + i, lv: 'L0', x, y }));
  const lbl = { id: 'r1', lv: 'L0', name: 'Chambre', x: 250, y: 200 };
  const p = { v: 19, id: 'pN', name: 'Note', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20, dessous: 'terreplein', dessus: 'combles' }], nodes: n,
    walls: n.map((a, i) => ({ id: 'w' + i, lv: 'L0', a: a.id, b: n[(i + 1) % 4].id, th: 20, kind: 'mur', couches: [{ m: 'plaque', e: 1.3 }, { m: 'laine_verre', e: 10 }, { m: 'parpaing', e: 8.7 }] })),
    openings: [], items: [], rooms: [lbl], elec: [{ id: 'rad', lv: 'L0', type: 'rad_elec', x: 250, y: 10, rot: 0, h: 20, p: 1000 }], dims: [], texts: [], circuits: [], rcds: [], links: [], ducts: [],
    install: Object.assign({ kva: 9, text: { v: -7, st: 'saisie', src: 'Test' } }, o || {}) };
  const loop = [{ x: 10, y: 10 }, { x: 490, y: 10 }, { x: 490, y: 390 }, { x: 10, y: 390 }];
  const r = { label: lbl, loop, poly: loop, holes: [], area: 480 * 380 };
  return { p, r, toutes: new Map([['L0', [r]]]) };
}

test('note de calcul : Φ pièce = parois + ponts + air + relance, comparaison avec le chauffage posé, jamais « conforme »', () => {
  const { p, r, toutes } = plan();
  const N0 = noteChauffage(p, toutes), a = N0.niveaux[0].pieces[0];
  assert.equal(N0.nPieces, 1); assert.equal(a.phiRH, null, 'relance non saisie : non comptée');
  assert.ok(N0.estimees.some((x) => /Relance non comptée/.test(x)));
  assert.ok(Math.abs(a.total - (a.phiT + a.phiPt + a.phiV)) < 1e-6);
  /* relance saisie : S × f_RH ajouté, partout (panneau de la pièce compris) */
  p.install.frh = { v: 10, st: 'saisie', src: 'Test' };
  const N = noteChauffage(p, toutes), b = N.niveaux[0].pieces[0];
  assert.ok(Math.abs(b.phiRH - b.S * 10) < 1e-6); assert.ok(Math.abs(b.total - a.total - b.S * 10) < 1e-6);
  assert.equal(deperditionsPiece(p, r, { toutes, pieces: toutes.get('L0') }).total, b.total);
  assert.equal(b.verdict, b.total <= 1000 ? 'suffisant' : 'insuffisant'); assert.equal(N.total, b.total); assert.equal(N.pose, 1000);
  assert.notEqual(N.statut, 'verifiee'); assert.match(N.avertissement, /pas une étude thermique réglementaire/);
  /* sans chauffage : à revoir ; sans température extérieure : non calculable, partiel */
  p.elec = []; const N2 = noteChauffage(p, toutes); assert.equal(N2.niveaux[0].pieces[0].verdict, 'sans'); assert.equal(N2.aRevoir.length, 1);
  delete p.install.text; const N3 = noteChauffage(p, toutes); assert.equal(N3.niveaux[0].pieces[0].verdict, 'incalculable'); assert.equal(N3.total, null); assert.equal(N3.statut, 'partiel');
  /* fiche de l'onglet Calculs */
  assert.deepEqual(puissancePiece({ phiT: 100, phiPt: 10, phiV: 20, S: 10, frh: 5 }), { phiRH: 50, total: 180 });
  /* nettoyage v19 */
  assert.deepEqual(nettoyerV19({ install: { frh: { v: 12, st: 'saisie' } } }).install.frh, { v: 12, st: 'saisie' });
  assert.equal('frh' in nettoyerV19({ install: { frh: { v: -3 } } }).install, false);
  assert.equal('frh' in nettoyerV19({ install: { frh: 'x' } }).install, false);
});

test('écran : migration v18 → v19, « Note de calcul du chauffage » (relance saisie, tableau, export PDF), chapitre du dossier ; plan d’exemple', async () => {
  const { ctx, page, errors } = await fresh();
  const { p } = plan(); p.v = 18; p.install.frh = { v: 'mauvais' };
  await seedPlan(ctx, p); await boot(page);
  const m = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { v: N.P.v, frh: 'frh' in N.P.install }; });
  assert.equal(m.v, 19); assert.equal(m.frh, false, 'valeur invalide retirée');
  assert.ok((await idb(page, 'versions')).some((w) => /\(v18 → v19\)/.test(w.why)), 'copie de sécurité');
  /* plan d'exemple : panneau du niveau › Note de calcul du chauffage */
  await page.evaluate(async () => { const S = await import('./js/stockage.js'); await S.openSample(); });
  await wait(page, 600);
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); N.ui.lv = 'L0'; N.ui.sel = null; N.ui.inspOpen = true; (await import('./js/interaction.js')).refreshUI(); });
  await wait(page, 300);
  await page.click('#ouvrirNote'); await wait(page, 300);
  const txt = await page.textContent('#modal');
  assert.match(txt, /Note de calcul du chauffage/); assert.match(txt, /pas une étude thermique réglementaire/);
  const n = await page.locator('#noteTable tbody tr').count(); assert.ok(n >= 8, `${n} pièces chauffées`);
  assert.match(await page.textContent('#noteTable'), /Chambre/);
  /* relance d'exemple 10 W/m², puis 20 : la note est recalculée */
  const tot = async () => page.evaluate(async () => { const N = await import('./js/noyau.js'), G = await import('./js/geometrie.js'), C = await import('./js/notechauffage.js'); return C.noteChauffage(N.P, new Map(N.P.levels.map((l) => [l.id, G.geo(l.id).rooms]))).total; });
  const t10 = await tot();
  await page.fill('#modal #f-frh', '20'); await page.press('#modal #f-frh', 'Enter'); await wait(page, 400);
  const t20 = await tot(); assert.ok(t20 > t10, `relance ${t10} → ${t20}`);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.install.frh.v), 20);
  /* export PDF de la note */
  const pdf = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), G = await import('./js/geometrie.js'), C = await import('./js/notechauffage.js'), D = await import('./js/documents.js');
    const note = C.noteChauffage(N.P, new Map(N.P.levels.map((l) => [l.id, G.geo(l.id).rooms])));
    const r = await D.dossierPDF(N.P, { chapitres: ['thermique'], noteChauffage: note, compress: false });
    const t = await r.blob.text();
    return { pages: r.pages, chap: r.chapitres.map((c) => c.id), size: r.blob.size, debut: t.slice(0, 5) };
  });
  assert.equal(pdf.debut, '%PDF-'); assert.ok(pdf.pages >= 2); assert.deepEqual(pdf.chap, ['thermique']);
  assert.ok(await page.evaluate(async () => (await import('./js/documents.js')).CHAPITRES.some((c) => c.id === 'thermique')));
  assert.deepEqual(errors, []);
  await ctx.close();
});

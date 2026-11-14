// Demandes de l'utilisateur (13 novembre 2026) : gaine encastrée dans la cloison, interrupteur « Gaines » de l'affichage,
// sortie de câble radiateur, boîte de dérivation murale, longueur d'une gaine modifiable ; migration v12 → v13.
// Lancer :  node --test tests/gaines.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fresh, boot, seedPlan, wait, ROOT } from './outils.mjs';

const imp = (f) => import(path.join(ROOT, 'js', f));

test('sans écran : tracé à une longueur donnée, pose « dans la cloison », boîte murale traversée, sortie radiateur', async () => {
  const CH = await imp('cheminement.js'), I = await imp('itineraire.js'), C = await imp('cablage.js'), D = await imp('elecdonnees.js'), K = await imp('calques.js');
  const L = (pts) => CH.longueurPolyligne(pts);
  /* longueur : prolongement du dernier tronçon, raccourci au-delà d'un coude, ou depuis le départ */
  const pts = [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }];
  assert.deepEqual(CH.tracerALongueur(pts, 650), [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 350 }]);
  assert.deepEqual(CH.tracerALongueur(pts, 250), [{ x: 0, y: 0 }, { x: 250, y: 0 }], 'le coude disparaît');
  const dep = CH.tracerALongueur(pts, 400, true);
  assert.deepEqual(dep, [{ x: 100, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 200 }], 'le bout d’arrivée ne bouge pas');
  assert.equal(L(dep), 400);
  assert.equal(CH.tracerALongueur(pts, 0), null); assert.equal(CH.tracerALongueur([{ x: 0, y: 0 }], 10), null);
  /* pose « dans la cloison » : parcours à la hauteur saisie, verticales comptées ; hauteur retirée sur une autre pose */
  assert.equal(CH.POSES.cloison.court, 'Cloison');
  assert.equal(CH.hauteurParcours({ levels: [{ id: 'L0', h: 250 }] }, { sys: 'elec', lv: 'L0', pose: 'cloison', z: 30 }), 30);
  assert.deepEqual(CH.nettoyerGaine({ sys: 'elec', pose: 'sol', z: 30 }), { sys: 'elec', pose: 'sol' });
  assert.deepEqual(CH.nettoyerGaine({ sys: 'elec', pose: 'cloison', z: 30 }), { sys: 'elec', pose: 'cloison', z: 30 });
  /* plan : deux pièces séparées par une cloison x = 400 ; tableau au mur x = 0 ; boîte murale et sortie radiateur */
  const n = (id, x, y) => ({ id, lv: 'L0', x, y });
  const plan = { levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250 }],
    nodes: [n('a', 0, 0), n('b', 800, 0), n('c', 800, 500), n('d', 0, 500), n('e', 400, 0), n('f', 400, 500)],
    walls: [['a', 'e', 20, 'mur'], ['e', 'b', 20, 'mur'], ['b', 'c', 20, 'mur'], ['c', 'f', 20, 'mur'], ['f', 'd', 20, 'mur'], ['d', 'a', 20, 'mur'], ['e', 'f', 7, 'cloison']].map(([a, b, th, kind], i) => ({ id: 'w' + i, lv: 'L0', a, b, th, kind })),
    openings: [], zones: [],
    elec: [{ id: 'T', lv: 'L0', type: 'tableau', x: 15, y: 250, rot: 270, h: 130 }, { id: 'dm', lv: 'L0', type: 'derivation_mur', x: 390, y: 100, rot: 90, h: 220 },
      { id: 'sr', lv: 'L0', type: 'sortie_rad', x: 390, y: 400, rot: 90, h: 20, p: 1500, cid: 'c1' }, { id: 'fp', lv: 'L0', type: 'prog_fp', x: 50, y: 50, rot: 0 }],
    circuits: [{ id: 'c1', kind: 'chauffage', name: 'Chauffage', cal: 20, sec: 2.5 }], links: [], rcds: [], install: {},
    ducts: [{ id: 'g1', lv: 'L0', sys: 'elec', kind: 'icta', pose: 'plafond', a: 'T', b: 'dm', pts: [{ x: 15, y: 250 }, { x: 15, y: 100 }, { x: 390, y: 100 }] },
      { id: 'g2', lv: 'L0', sys: 'elec', kind: 'icta', pose: 'cloison', z: 20, a: 'dm', b: 'sr', pts: [{ x: 400, y: 100 }, { x: 400, y: 400 }] }] };
  /* la boîte murale est un point de passage : le circuit la traverse jusqu'à la sortie */
  const ch = CH.cheminCircuit(plan, 'c1');
  assert.equal(ch.complet, true); assert.ok(ch.ducts.includes('g2'));
  const lg = CH.longueurGaine(plan, plan.ducts[1]);
  assert.equal(lg.verts.find((v) => v.bout === 'a').h, 200, 'descente de la boîte (220 cm) jusqu’au parcours dans la cloison (20 cm)');
  assert.equal(lg.verts.find((v) => v.bout === 'b').h, 0);
  /* gaine encastrée : pas de traversée signalée ; un tronçon hors des murs est signalé */
  assert.deepEqual(I.conflitsGaine(plan, plan.ducts[1]), []);
  const hors = { id: 'g3', lv: 'L0', sys: 'elec', pose: 'cloison', z: 20, pts: [{ x: 100, y: 250 }, { x: 300, y: 250 }] };
  assert.ok(I.conflitsGaine(plan, hors).some((x) => x.kind === 'hors_cloison'));
  /* sortie radiateur : circuit de chauffage, puissance comptée, fil pilote avec un programmateur posé */
  assert.equal(D.defaultKindFor('sortie_rad'), 'chauffage'); assert.ok(D.accepts('chauffage', 'sortie_rad'));
  assert.equal(D.elecPower(plan.elec[2]), 1500);
  const cab = C.cablageCircuit(plan, plan.circuits[0]);
  assert.equal(cab.troncons.find((t) => t.duct === 'g2' && t.kind === 'h').des, '4G2,5');
  assert.equal(K.calqueDeType('sortie_rad'), 'specialises'); assert.equal(K.calqueDeType('derivation_mur'), 'tableau');
  assert.equal(D.defaultKindFor('derivation_mur'), null, 'la boîte n’a pas de circuit propre');
});

/* plan v12 avec une gaine libre au bout et une gaine raccordée aux deux bouts */
function planV12() {
  const n = (id, x, y) => ({ id, lv: 'L0', x, y });
  return { v: 12, id: 'pG', name: 'Gaines', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }],
    nodes: [n('n1', 0, 0), n('n2', 800, 0), n('n3', 800, 500), n('n4', 0, 500)],
    walls: [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n1']].map(([a, b], i) => ({ id: 'w' + i, lv: 'L0', a, b, th: 20, kind: 'mur' })), openings: [], items: [],
    elec: [{ id: 'T', lv: 'L0', type: 'tableau', x: 20, y: 250, rot: 270, h: 130 }, { id: 'p1', lv: 'L0', type: 'pc', x: 400, y: 20, rot: 0, h: 30, cid: 'c1' }],
    rooms: [{ id: 'r', lv: 'L0', name: 'Séjour', x: 400, y: 250 }], dims: [], texts: [],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5 }], rcds: [], links: [],
    ducts: [{ id: 'g1', lv: 'L0', sys: 'elec', kind: 'icta', pose: 'sol', a: 'T', b: null, pts: [{ x: 32.6, y: 250 }, { x: 200, y: 250 }, { x: 200, y: 400 }] },
      { id: 'g2', lv: 'L0', sys: 'elec', kind: 'icta', pose: 'sol', a: 'T', b: 'p1', pts: [{ x: 32.6, y: 250 }, { x: 400, y: 32.6 }] }],
    install: { kva: 9 }, doc: { revisions: [] }, calques: {}, vues: [] };
}

test('écran : longueur de la gaine, pose « Cloison », interrupteur « Gaines », migration v12 → v13', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, planV12()); await boot(page);
  const r0 = await page.evaluate(async () => (await import('./js/noyau.js')).P.v);
  assert.equal(r0, 16);
  const vers = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open('calque'); q.onsuccess = () => { const t = q.result.transaction('versions').objectStore('versions').getAll(); t.onsuccess = () => res(t.result.map((x) => x.why)); }; }));
  assert.ok(vers.some((w) => /\(v12 → v16\)/.test(w)), 'copie de sécurité avant mise à jour du format');
  const sel = (id) => page.evaluate(async (id) => { const N = await import('./js/noyau.js'), F = await import('./js/interface.js'); N.ui.sel = { t: 'duct', id }; N.ui.inspOpen = true; F.renderInspector(); }, id);
  /* gaine libre au bout : 167,4 + 150 = 317,4 cm → 500 cm, le dernier tronçon s'allonge */
  await sel('g1'); await wait(page, 150);
  await page.fill('#f-dlen', '500'); await page.press('#f-dlen', 'Enter'); await wait(page, 250);
  let r = await page.evaluate(async () => { const N = await import('./js/noyau.js'), CH = await import('./js/cheminement.js'), H = await import('./js/historique.js'); const d = N.P.ducts[0]; return { pts: d.pts, L: CH.longueurPolyligne(CH.pointsGaine(N.P, d)), undo: H.H.u.length }; });
  assert.ok(Math.abs(r.L - 500) < 0.2, String(r.L)); assert.equal(r.pts.length, 3); assert.equal(r.pts[2].x, 200); assert.equal(r.undo, 1);
  await page.click('#btnUndo'); await wait(page, 150);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.ducts[0].pts[2].y), 400, 'Annuler rétablit le tracé');
  /* gaine raccordée aux deux bouts : pas de champ, explication */
  await sel('g2'); await wait(page, 150);
  assert.equal(await page.locator('#f-dlen').count(), 0);
  assert.match(await page.$eval('#insp', (e) => e.textContent), /Les deux bouts sont raccordés/);
  /* pose « Cloison » : hauteur du parcours demandée */
  await page.click('#insp .seg >> text=Cloison'); await wait(page, 150);
  r = await page.evaluate(async () => { const d = (await import('./js/noyau.js')).P.ducts[1]; return { pose: d.pose, z: d.z }; });
  assert.equal(r.pose, 'cloison'); assert.ok(Number.isFinite(r.z));
  assert.equal(await page.locator('#f-dz').count(), 1);
  /* interrupteur « Gaines et chemins de câbles » du menu Affichage */
  await page.click('#btnView'); await wait(page, 150);
  await page.click('#viewPop >> text=Gaines et chemins de câbles'); await wait(page, 150);
  r = await page.evaluate(async () => { const N = await import('./js/noyau.js'), Rz = await import('./js/reseaux.js'); return { vis: N.P.ducts.map((d) => Rz.ductVisible(d)), sel: N.ui.sel, aria: document.querySelector('#viewPop [role=switch][aria-checked="false"]')?.textContent }; });
  assert.deepEqual(r.vis, [false, false]); assert.equal(r.sel, null, 'gaine sélectionnée désélectionnée'); assert.match(r.aria, /Gaines/);
  await page.click('#viewPop >> text=Gaines et chemins de câbles'); await wait(page, 150);
  assert.deepEqual(await page.evaluate(async () => { const N = await import('./js/noyau.js'), Rz = await import('./js/reseaux.js'); return N.P.ducts.map((d) => Rz.ductVisible(d)); }), [true, true]);
  /* gaines masquées puis outil Conduit : elles réapparaissent */
  await page.click('#viewPop >> text=Gaines et chemins de câbles'); await page.keyboard.press('Escape'); await page.evaluate(() => { for (const p of document.querySelectorAll('.pop')) p.hidden = true; });
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), F = await import('./js/interface.js'); N.S.ductSys = 'elec'; F.setTool('duct'); });
  assert.equal(await page.evaluate(async () => (await import('./js/reseaux.js')).ductVisible((await import('./js/noyau.js')).P.ducts[0])), true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

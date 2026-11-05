// Tests de la phase 5, étape 3 : 3D avancée (câbles et chemins de câbles, passages entre étages, coupes,
// transparence, masquage, modification depuis la 3D). Lancer :  node --test tests/vue3d.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, wait, boot, seedPlan, storedPlan } from './outils.mjs';

/* plan d'essai : deux niveaux, chemin de câbles, goulotte, gaines ICTA et IRL, passage entre étages, deux circuits */
function plan3d(id) {
  const N = (nid, lv, x, y) => ({ id: nid, lv, x, y });
  const walls = (lv, p) => [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']].map(([a, b], i) => ({ id: p + 'w' + i, lv, a: p + a, b: p + b, th: 20, kind: 'mur' }));
  return { v: 7, id, name: 'Essai 3D', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }, { id: 'L1', name: 'Étage', elev: 270, h: 250, slab: 20 }],
    nodes: [N('0a', 'L0', 0, 0), N('0b', 'L0', 600, 0), N('0c', 'L0', 600, 400), N('0d', 'L0', 0, 400), N('1a', 'L1', 0, 0), N('1b', 'L1', 600, 0), N('1c', 'L1', 600, 400), N('1d', 'L1', 0, 400)],
    walls: [...walls('L0', '0'), ...walls('L1', '1')], openings: [], items: [{ id: 'it1', lv: 'L0', k: 'table', type: 'table', name: 'Table', x: 200, y: 300, w: 120, d: 80, rot: 0 }],
    dims: [], texts: [], links: [], comps: [], fonds: [], fondImg: {}, zones: [], etudes: [], photometries: [],
    rooms: [{ id: 'r0', lv: 'L0', name: 'Atelier', x: 300, y: 200 }, { id: 'r1', lv: 'L1', name: 'Chambre', x: 300, y: 200 }],
    elec: [
      { id: 't', lv: 'L0', type: 'tableau', x: 10, y: 200, rot: 90, h: 130 },
      { id: 'p1', lv: 'L0', type: 'pc', x: 590, y: 100, rot: -90, h: 30, cid: 'c1' },
      { id: 'p2', lv: 'L0', type: 'pc', x: 590, y: 300, rot: -90, h: 30, cid: 'c1' },
      { id: 'l1', lv: 'L0', type: 'pl', x: 300, y: 200, rot: 0, h: null, cid: 'c2' },
      { id: 'x0', lv: 'L0', type: 'traversee', x: 100, y: 350, rot: 0, h: null, to: 'x1' },
      { id: 'x1', lv: 'L1', type: 'traversee', x: 100, y: 350, rot: 0, h: null, to: 'x0' },
      { id: 'l2', lv: 'L1', type: 'pl', x: 300, y: 200, rot: 0, h: null, cid: 'c2' },
    ],
    ducts: [
      { id: 'g1', lv: 'L0', sys: 'elec', kind: 'cdc', lw: 100, lh: 50, pose: 'plafond', a: 't', pts: [{ x: 10, y: 200 }, { x: 300, y: 200 }, { x: 560, y: 200 }], cids: ['c1', 'c2'] },
      { id: 'g2', lv: 'L0', sys: 'elec', kind: 'goulotte', lw: 60, lh: 40, pose: 'hauteur', z: 30, b: 'p1', pts: [{ x: 560, y: 200 }, { x: 560, y: 100 }, { x: 590, y: 100 }], cid: 'c1' },
      { id: 'g3', lv: 'L0', sys: 'elec', kind: 'icta', dia: 20, pose: 'sol', b: 'p2', pts: [{ x: 560, y: 200 }, { x: 590, y: 300 }], cid: 'c1' },
      { id: 'g4', lv: 'L0', sys: 'elec', kind: 'icta', dia: 20, pose: 'plafond', b: 'l1', pts: [{ x: 300, y: 200 }, { x: 300, y: 200.5 }], cid: 'c2' },
      { id: 'g5', lv: 'L0', sys: 'elec', kind: 'irl', dia: 25, pose: 'plafond', b: 'x0', pts: [{ x: 300, y: 200 }, { x: 100, y: 350 }], cid: 'c2' },
      { id: 'g6', lv: 'L1', sys: 'elec', kind: 'icta', dia: 20, pose: 'sol', a: 'x1', b: 'l2', pts: [{ x: 100, y: 350 }, { x: 300, y: 200 }], cid: 'c2' },
    ],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises atelier', cal: 20, sec: 2.5, rcd: 'r1', dda: false, ctrl: null }, { id: 'c2', kind: 'eclairage', name: 'Éclairage', cal: 10, sec: 1.5, rcd: 'r1', dda: false, ctrl: null }],
    rcds: [{ id: 'r1', type: 'A', cal: 40 }], install: { kva: 9, parafoudre: false, row: 13 } };
}
async function ouvrir3D(opts = {}) {
  const f = await fresh(opts);
  await seedPlan(f.ctx, plan3d('p3D'));
  await boot(f.page);
  await f.page.evaluate(async () => {
    const T = await import('./js/tableau.js'); const V = await import('./js/vue3d.js');
    Object.assign(V.v3o(), { cables: false, xray: false, cut: 'none', above: false, panel: true, hid: {} });
    T.setView('3d'); V.render3Panel(); V.v3Rebuild(true);
    V.camTo({ T: [300, 140, 200], D: 900, th: Math.PI / 2 + 0.9, ph: 0.95 });
  });
  await wait(f.page, 400);
  return f;
}
/* point du plan (x, y, hauteur Y) → position à l'écran (coordonnées de la page) */
const ecran = (page, X, Y, Z) => page.evaluate(async ([X, Y, Z]) => {
  const V = await import('./js/vue3d.js'); const VP = V.camVP(V.R3.w, V.R3.h), q = V.m4xv(VP, X, Y, Z, 1), r = V.R3.cv.getBoundingClientRect();
  return { x: r.left + (q[0] / q[3] * 0.5 + 0.5) * V.R3.w, y: r.top + (1 - (q[1] / q[3] * 0.5 + 0.5)) * V.R3.h, cx: (q[0] / q[3] * 0.5 + 0.5) * V.R3.w, cy: (1 - (q[1] / q[3] * 0.5 + 0.5)) * V.R3.h };
}, [X, Y, Z]);
/* objet touché à une position de l'écran (tampon de sélection) */
const touche = (page, p) => page.evaluate(async ([cx, cy]) => { const V = await import('./js/vue3d.js'); const id = V.r3Pick(cx, cy, V.camVP(V.R3.w, V.R3.h)); const r = V.V3.G.picks[id]; return r ? r.t + ':' + r.id : null; }, [p.cx, p.cy]);

test('3D : chemins de câbles, goulotte, gaines, passage entre étages, câbles des circuits', async () => {
  const { ctx, page, errors } = await ouvrir3D();
  const r = await page.evaluate(async () => {
    const V = await import('./js/vue3d.js'); const N = await import('./js/noyau.js'); const o = V.v3o();
    const D = (id) => N.IDX.ducts.get(id);
    const G = V.V3.G, refs = G.picks.filter(Boolean).map((p) => p.t + ':' + p.id);
    const out = { refs, wallsInW: G.w.T.length > 0, sTri: G.s.T.length };
    o.cables = true; V.v3Rebuild(true);
    out.cables = V.V3.G.picks.filter((p) => p && p.t === 'circuit').map((p) => p.id).sort();
    out.gTri = V.V3.G.g.T.length;
    o.cables = false; V.v3Rebuild(true);
    /* hauteur du parcours : la pose de la gaine, pas le réglage de la vue */
    o.route = 'sol';
    out.y = { cdc: V.ductY3(D('g1'), 0, 250, 2.5, o), goul: V.ductY3(D('g2'), 0, 250, 2, o), sol: V.ductY3(D('g3'), 0, 250, 1, o) };
    out.info = V.v3RefInfo({ t: 'duct', id: 'g1', lv: 'L0' });
    out.cab = V.v3RefInfo({ t: 'circuit', id: 'c2', lv: 'L0' });
    o.route = 'plafond';
    return out;
  });
  for (const id of ['duct:g1', 'duct:g2', 'duct:g3', 'duct:g5', 'elec:x0']) assert.ok(r.refs.includes(id), `${id} dessiné et sélectionnable`);
  assert.ok(r.wallsInW, 'murs dans leur propre lot (transparence)');
  assert.deepEqual(r.cables, ['c1', 'c2'], 'un câble par circuit raccordé');
  assert.ok(r.gTri > 0, 'câbles affichés : gaines transparentes');
  assert.deepEqual(r.y, { cdc: 250 - 2.5 - 1.5, goul: 30, sol: 2 }, 'plafond, hauteur donnée, sol');
  assert.match(JSON.stringify(r.info.rows), /Chemin de câbles|100 × 50 mm/);
  assert.match(JSON.stringify(r.info.rows), /Au plafond/, 'pose réelle affichée');
  assert.match(r.cab.title, /Éclairage/); assert.match(JSON.stringify(r.cab.rows), /2 sur 2/);
  /* toucher un câble ouvre la fiche du circuit */
  await page.evaluate(async () => { const V = await import('./js/vue3d.js'); V.v3o().cables = true; V.v3o().xray = true; V.v3Rebuild(true); V.v3Req(); });
  await wait(page, 300);
  const p = await ecran(page, 150, 250 - 1.5 - 5 + 0.9, 200 - 0.9); // câble C1, au fond du chemin de câbles (50 mm de haut)
  const hit = await touche(page, p);
  assert.ok(hit && /^circuit:/.test(hit), 'câble sélectionnable : ' + hit);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('3D : coupe, murs transparents et masquage (affichage seulement, le plan ne change pas)', async () => {
  const { ctx, page, errors } = await ouvrir3D();
  const avant = JSON.stringify(await storedPlan(page, 'p3D'));
  /* coupe horizontale : le chemin de câbles (au plafond) disparaît sous 100 cm, revient au-dessus */
  const pc = await ecran(page, 450, 247, 200);
  assert.equal(await touche(page, pc), 'duct:g1');
  const planes = await page.evaluate(async () => {
    const V = await import('./js/vue3d.js'); const o = V.v3o(), out = {};
    o.cut = 'h'; o.cutH = 100; out.h = V.clipPlane3();
    o.cut = 'x'; o.cutX = 0.5; o.cutFlip = false; out.x = V.clipPlane3();
    o.cut = 'none'; out.none = V.clipPlane3();
    o.cut = 'h'; o.cutH = 100; V.render3Panel(); return out;
  });
  assert.deepEqual(planes.h, [0, 1, 0, -100]);
  assert.equal(planes.x[0], 1); assert.equal(planes.none, null);
  assert.notEqual(await touche(page, pc), 'duct:g1', 'coupé');
  /* le curseur de la coupe est dans le panneau, et il agit sans reconstruire la maquette */
  assert.equal(await page.locator('#v3-cut').count(), 1);
  /* le curseur agit sur l'affichage seulement : la maquette n'est pas reconstruite */
  await page.evaluate(async () => { (await import('./js/vue3d.js')).V3.G.marque = 1; });
  await page.locator('#v3-cut').fill('290'); await wait(page, 100);
  assert.equal(await touche(page, pc), 'duct:g1', 'coupe relevée au-dessus du plafond : le chemin de câbles réapparaît');
  assert.equal(await page.evaluate(async () => (await import('./js/vue3d.js')).V3.G.marque), 1, 'pas de reconstruction');
  await page.evaluate(async () => { const V = await import('./js/vue3d.js'); V.v3o().cut = 'none'; V.render3Panel(); });
  /* murs transparents : on touche ce qui est derrière */
  const pw = await ecran(page, 0, 125, 300); // milieu du mur ouest
  const wHit = await touche(page, pw);
  assert.match(wHit, /^wall:/);
  await page.click('#v3-xray'); await wait(page, 150);
  assert.ok(!/^wall:/.test(await touche(page, pw) || ''), 'mur transparent : non sélectionnable');
  await page.click('#v3-xray'); await wait(page, 150);
  /* masquer un objet depuis sa fiche, puis tout réafficher */
  await page.evaluate(async () => { const V = await import('./js/vue3d.js'); V.v3Select(V.V3.G.picks.findIndex((p) => p && p.id === 'g1')); });
  await page.click('#v3info button:has-text("Masquer")'); await wait(page, 200);
  assert.ok(!await page.evaluate(async () => (await import('./js/vue3d.js')).V3.G.picks.some((p) => p && p.id === 'g1')), 'masqué');
  assert.match(await page.textContent('#v3panel'), /Tout réafficher \(1\)/);
  await page.click('#v3panel button:has-text("Tout réafficher")'); await wait(page, 200);
  assert.ok(await page.evaluate(async () => (await import('./js/vue3d.js')).V3.G.picks.some((p) => p && p.id === 'g1')), 'réaffiché');
  await wait(page, 1200);
  assert.equal(JSON.stringify(await storedPlan(page, 'p3D')), avant, 'le plan enregistré n’a pas changé');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('3D : modification depuis la fiche (gaine, hauteur de pose, mur, objet) et déplacement d’un symbole, annulable', async () => {
  const { ctx, page, errors } = await ouvrir3D({ viewport: { width: 820, height: 1180 } });
  const sel = (id) => page.evaluate(async (id) => { const V = await import('./js/vue3d.js'); V.v3Select(V.V3.G.picks.findIndex((p) => p && p.id === id)); }, id);
  /* gaine : type, pose, dimensions */
  await sel('g3'); await wait(page, 100);
  await page.click('#v3info .chip:has-text("Goulotte")'); await wait(page, 150);
  await page.click('#v3info .seg button:has-text("Hauteur")'); await wait(page, 150);
  await page.fill('#v3-dz', '45'); await page.press('#v3-dz', 'Enter'); await wait(page, 150);
  await page.fill('#v3-dlw', '40'); await page.press('#v3-dlw', 'Enter'); await wait(page, 150);
  await page.fill('#v3-dlh', '25'); await page.press('#v3-dlh', 'Enter'); await wait(page, 150);
  let g3 = await page.evaluate(async () => (await import('./js/noyau.js')).P.ducts.find((d) => d.id === 'g3'));
  assert.deepEqual([g3.kind, g3.pose, g3.z, g3.lw, g3.lh, 'dia' in g3], ['goulotte', 'hauteur', 45, 40, 25, false]);
  assert.match(await page.textContent('#v3info'), /40 × 25 mm/, 'fiche mise à jour');
  /* prise : hauteur de pose */
  await sel('p1'); await wait(page, 100);
  await page.fill('#v3-eh', '110'); await page.press('#v3-eh', 'Enter'); await wait(page, 150);
  /* mur : hauteur ; meuble : hauteur et pose */
  await sel('0w0'); await wait(page, 100);
  await page.fill('#v3-wh', '220'); await page.press('#v3-wh', 'Enter'); await wait(page, 150);
  await sel('it1'); await wait(page, 100);
  await page.fill('#v3-izb', '10'); await page.press('#v3-izb', 'Enter'); await wait(page, 150);
  let P = await page.evaluate(async () => (await import('./js/noyau.js')).P);
  assert.equal(P.elec.find((e) => e.id === 'p1').h, 110);
  assert.equal(P.walls.find((w) => w.id === '0w0').h, 220);
  assert.equal(P.items.find((i) => i.id === 'it1').zb, 10);
  /* déplacer le plafonnier au doigt : un seul pas d'annulation */
  await sel('l1'); await wait(page, 100);
  await page.click('#v3info button:has-text("Déplacer")'); await wait(page, 100);
  const nH = await page.evaluate(async () => (await import('./js/historique.js')).H.u.length);
  const a = await ecran(page, 300, 250, 200), b = await ecran(page, 420, 250, 120);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up();
  await wait(page, 200);
  const l1 = await page.evaluate(async () => (await import('./js/noyau.js')).P.elec.find((e) => e.id === 'l1'));
  assert.ok(Math.abs(l1.x - 420) <= 2 && Math.abs(l1.y - 120) <= 2, `déplacé : ${l1.x}, ${l1.y}`);
  assert.equal(await page.evaluate(async () => (await import('./js/historique.js')).H.u.length), nH + 1, 'un seul pas d’annulation');
  await page.click('#v3info button:has-text("Terminer")'); await wait(page, 100);
  /* enregistré, puis tout annuler */
  await wait(page, 1200);
  const st = await storedPlan(page, 'p3D');
  assert.equal(st.elec.find((e) => e.id === 'l1').x, l1.x);
  await page.evaluate(async () => { const I = await import('./js/interaction.js'); for (let i = 0; i < 9; i++) I.undo(); });
  await wait(page, 200);
  P = await page.evaluate(async () => (await import('./js/noyau.js')).P);
  assert.deepEqual([P.elec.find((e) => e.id === 'l1').x, P.elec.find((e) => e.id === 'p1').h, P.ducts.find((d) => d.id === 'g3').kind], [300, 30, 'icta'], 'annulé');
  assert.deepEqual(errors, []);
  await ctx.close();
});

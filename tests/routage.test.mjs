// Raccordement automatique des circuits (gaines proposées) : moteur sans écran (itineraire.js) et écran.
// Lancer :  node --test tests/routage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raccorderCircuit } from '../js/itineraire.js';
import { cheminCircuit } from '../js/cheminement.js';
import { fresh, boot, seedPlan, wait } from './outils.mjs';

/* deux niveaux de 6 × 4 m ; tableau et 3 prises au rez-de-chaussée, 2 prises à l'étage, un passage entre étages */
function plan(sansPassage) {
  const nodes = [], walls = [];
  for (const lv of ['L0', 'L1']) {
    const n = [[0, 0], [600, 0], [600, 400], [0, 400]].map(([x, y], i) => ({ id: lv + 'n' + i, lv, x, y })); nodes.push(...n);
    for (let i = 0; i < 4; i++) walls.push({ id: lv + 'w' + i, lv, a: n[i].id, b: n[(i + 1) % 4].id, th: 20, kind: 'mur' });
  }
  const e = (id, lv, type, x, y, cid, o) => Object.assign({ id, lv, type, x, y, rot: 0, h: 30, cid: cid || null }, o || {});
  return {
    v: 11, id: 'pR', name: 'Routage', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }, { id: 'L1', name: 'Étage', elev: 270, h: 250, slab: 20 }],
    nodes, walls, openings: [], items: [], rooms: [], dims: [], texts: [], links: [], ducts: [], comps: [],
    zones: [{ id: 'z1', lv: 'L0', pts: [{ x: 250, y: 100 }, { x: 350, y: 100 }, { x: 350, y: 300 }, { x: 250, y: 300 }] }],
    elec: [e('T', 'L0', 'tableau', 50, 200), e('p1', 'L0', 'pc', 150, 200, 'c1'), e('p2', 'L0', 'pc', 450, 200, 'c1'), e('p3', 'L0', 'pc', 550, 350, 'c1'),
      e('q1', 'L1', 'pc', 300, 100, 'c1'), e('q2', 'L1', 'pc', 500, 300, 'c1'), e('x1', 'L0', 'pl', 300, 50, 'c2'),
      ...(sansPassage ? [] : [e('tr0', 'L0', 'traversee', 100, 350, null, { to: 'tr1' }), e('tr1', 'L1', 'traversee', 100, 350, null, { to: 'tr0' })])],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 16, sec: 1.5, rcd: 'r1' }, { id: 'c2', kind: 'eclairage', name: 'Éclairage', cal: 10, sec: 1.5, rcd: 'r1' }],
    rcds: [{ id: 'r1', type: 'A', cal: 40 }], install: { kva: 9 }, doc: { revisions: [] },
  };
}
const dansZone = (p) => p.x > 251 && p.x < 349 && p.y > 101 && p.y < 299;

test('raccordement automatique : de proche en proche, zone interdite évitée, étage par le passage, plan non modifié', () => {
  const p = plan(), avant = JSON.stringify(p);
  const r = raccorderCircuit(p, 'c1', { pose: 'plafond', kind: 'icta' });
  assert.equal(JSON.stringify(p), avant, 'le plan n’est pas modifié');
  assert.deepEqual(r.echecs, []);
  /* 3 prises au RDC, le passage, 2 prises à l'étage = 6 gaines */
  assert.equal(r.gaines.length, 6);
  assert.deepEqual(r.gaines.map((g) => [g.a, g.b]), [['T', 'p1'], ['p1', 'p2'], ['p2', 'p3'], ['T', 'tr0'], ['tr1', 'q1'], ['q1', 'q2']], 'chaque point part du point raccordé le plus proche');
  assert.ok(r.gaines.every((g) => g.cid === 'c1' && g.kind === 'icta' && g.pose === 'plafond' && g.sys === 'elec'));
  /* tronçons droits (horizontaux ou verticaux, hors raccord aux extrémités) et aucun point dans la zone interdite */
  for (const g of r.gaines.filter((x) => x.lv === 'L0')) { // la zone est au rez-de-chaussée
    for (const q of g.pts) assert.ok(!dansZone(q), `gaine ${g.a} → ${g.b} dans la zone`);
    for (let k = 1; k < g.pts.length; k++) { const a = g.pts[k - 1], b = g.pts[k]; for (let t = 0.1; t < 1; t += 0.1) assert.ok(!dansZone({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t })); }
  }
  /* la gaine p1 → p2 contourne la zone : plus longue que la ligne droite (300 cm) */
  assert.ok(r.gaines[1].len > 420, `contournement : ${r.gaines[1].len}`);
  /* une fois les gaines posées, le circuit est complet et un second passage ne propose plus rien */
  p.ducts.push(...r.gaines.map((g, i) => Object.assign({}, g, { id: 'g' + i, dia: 20 })));
  const ch = cheminCircuit(p, 'c1'); assert.equal(ch.complet, true); assert.ok(ch.Lmax > 0);
  const r2 = raccorderCircuit(p, 'c1', {}); assert.equal(r2.gaines.length, 0); assert.equal(r2.deja, 5);
});

test('raccordement automatique : sans passage entre étages, les points de l’étage sont signalés, rien n’est inventé', () => {
  const r = raccorderCircuit(plan(true), 'c1', {});
  assert.equal(r.gaines.length, 3);
  assert.deepEqual(r.echecs.map((e) => e.id).sort(), ['q1', 'q2']); assert.match(r.echecs[0].raison, /passage entre étages/);
  const p = plan(); p.elec = p.elec.filter((e) => e.type !== 'tableau');
  const r0 = raccorderCircuit(p, 'c1', {}); assert.equal(r0.gaines.length, 0); assert.match(r0.raison, /tableau/);
});

test('onglet Cheminements : « Raccorder les circuits incomplets » crée les gaines en une seule étape d’annulation', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, plan()); await boot(page);
  await page.click('text=Tableau électrique'); await page.click('#evBar >> text=Cheminements');
  assert.match(await page.$eval('#autoTous', (e) => e.textContent), /Raccorder les 2 circuits incomplets/);
  await page.click('#autoTous');
  await page.waitForFunction(async () => (await import('./js/noyau.js')).P.ducts.length >= 7, null, { timeout: 20000 });
  await wait(page, 300);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), CH = await import('./js/cheminement.js'), H = await import('./js/historique.js');
    return { n: N.P.ducts.length, complets: N.P.circuits.map((c) => CH.cheminCircuit(N.P, c.id).complet), ids: N.P.ducts.every((d) => /^k/.test(d.id) && d.dia > 0 && d.sys === 'elec'), undo: H.H.u.length, toast: document.getElementById('toast').textContent };
  });
  assert.equal(r.n, 7); assert.deepEqual(r.complets, [true, true]); assert.ok(r.ids); assert.equal(r.undo, 1);
  assert.match(r.toast, /7 gaines proposées/);
  assert.equal(await page.locator('#autoTous').count(), 0, 'plus rien à raccorder');
  await page.click('#btnUndo'); await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.ducts.length), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('raccordement automatique : un chemin de câbles commun déjà relié au tableau sert de départ (piquage au plus près)', () => {
  const p = plan(true); p.zones = [];
  /* chemin de câbles sans circuit attitré, du tableau le long du mur du haut (y = 60) */
  p.ducts.push({ id: 'cdc', lv: 'L0', sys: 'elec', kind: 'cdc', lw: 200, lh: 60, a: 'T', b: null, pts: [{ x: 50, y: 200 }, { x: 50, y: 60 }, { x: 560, y: 60 }] });
  const r = raccorderCircuit(p, 'c2', {}); // le point lumineux x1 (300, 50) est à 10 cm du chemin de câbles
  assert.equal(r.gaines.length, 1); assert.equal(r.gaines[0].a, null); assert.equal(r.gaines[0].b, 'x1');
  assert.deepEqual(r.gaines[0].pts[0], { x: 300, y: 60 }); assert.ok(r.gaines[0].len < 15, 'piquage court : ' + r.gaines[0].len);
  p.ducts.push(Object.assign({}, r.gaines[0], { id: 'g1', dia: 20 }));
  assert.equal(cheminCircuit(p, 'c2').complet, true, 'le circuit rejoint le tableau par le chemin de câbles');
  /* les prises du circuit c1 : p3 (550, 350) est plus près de p2 que du chemin de câbles → de proche en proche */
  const r1 = raccorderCircuit(p, 'c1', {});
  assert.deepEqual(r1.echecs.map((e) => e.id).sort(), ['q1', 'q2']); assert.equal(r1.gaines.length, 3);
});

test('graphe des gaines : un bout libre qui touche le sommet d’une gaine d’un autre circuit ET le milieu d’un chemin de câbles est relié aux deux', () => {
  const p = plan(true); p.zones = [];
  p.ducts.push({ id: 'cdc', lv: 'L0', sys: 'elec', kind: 'cdc', a: 'T', b: null, pts: [{ x: 50, y: 200 }, { x: 50, y: 60 }, { x: 560, y: 60 }] });
  /* gaine d'un autre circuit (c1) dont un sommet est exactement au point de piquage (300, 60) */
  p.ducts.push({ id: 'autre', lv: 'L0', sys: 'elec', cid: 'c1', a: null, b: 'p2', pts: [{ x: 300, y: 60 }, { x: 450, y: 200 }] });
  /* piquage du point lumineux x1 (circuit c2) au même endroit */
  p.ducts.push({ id: 'piq', lv: 'L0', sys: 'elec', cid: 'c2', a: null, b: 'x1', pts: [{ x: 300, y: 60 }, { x: 300, y: 50 }] });
  assert.equal(cheminCircuit(p, 'c2').complet, true, 'c2 rejoint le tableau par le chemin de câbles, malgré la gaine de c1 au même point');
  assert.ok(cheminCircuit(p, 'c1').points.find((x) => x.id === 'p2').dist > 0, 'c1 aussi');
});

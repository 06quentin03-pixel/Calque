// Demande du 16 novembre 2026 : câbles à tirer depuis « Équipement minimal » pour les appareils déjà posés (sèche-serviettes,
// hotte…) et raccordement automatique en boîtes de dérivation, par les plafonds et les cloisons.
// Lancer :  node --test tests/boites.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placerBoite, raccorderEnBoites } from '../js/boites.js';
import { cheminCircuit } from '../js/cheminement.js';
import { cablesATirer, equiperPiece } from '../js/equipement.js';
import { fresh, boot, wait } from './outils.mjs';

/* deux niveaux de 6 × 4 m (une pièce chacun) ; tableau, 3 prises au rez-de-chaussée, 2 à l'étage, un passage entre étages */
const SALLE = [{ x: 10, y: 10 }, { x: 590, y: 10 }, { x: 590, y: 390 }, { x: 10, y: 390 }];
function plan() {
  const nodes = [], walls = [];
  for (const lv of ['L0', 'L1']) {
    const n = [[0, 0], [600, 0], [600, 400], [0, 400]].map(([x, y], i) => ({ id: lv + 'n' + i, lv, x, y })); nodes.push(...n);
    for (let i = 0; i < 4; i++) walls.push({ id: lv + 'w' + i, lv, a: n[i].id, b: n[(i + 1) % 4].id, th: 20, kind: 'mur' });
  }
  const e = (id, lv, type, x, y, cid, o) => Object.assign({ id, lv, type, x, y, rot: 0, h: 30, cid: cid || null }, o || {});
  return {
    v: 18, id: 'pB', name: 'Boîtes', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }, { id: 'L1', name: 'Étage', elev: 270, h: 250, slab: 20 }],
    nodes, walls, openings: [], items: [], rooms: [], dims: [], texts: [], links: [], ducts: [], zones: [], comps: [],
    elec: [e('T', 'L0', 'tableau', 50, 200), e('p1', 'L0', 'pc', 150, 20, 'c1'), e('p2', 'L0', 'pc', 450, 20, 'c1'), e('p3', 'L0', 'pc', 550, 350, 'c1'),
      e('q1', 'L1', 'pc', 300, 20, 'c1'), e('q2', 'L1', 'pc', 500, 380, 'c1', { rot: 180 }), e('x1', 'L0', 'pc20', 300, 380, 'c2', { rot: 180 }),
      e('tr0', 'L0', 'traversee', 100, 350, null, { to: 'tr1' }), e('tr1', 'L1', 'traversee', 100, 350, null, { to: 'tr0' })],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5, rcd: 'r1' }, { id: 'c2', kind: 'specialise', name: 'Spécialisé', cal: 20, sec: 2.5, rcd: 'r1' }],
    rcds: [{ id: 'r1', type: 'A', cal: 40 }], install: { kva: 9 },
  };
}
const pieces = () => [{ nom: 'Salle', poly: SALLE }];
/* crée les boîtes et les gaines proposées dans le plan (comme « Valider ») */
function appliquer(p, r) {
  const ids = new Map(r.boites.map((b, i) => [b.id, 'B' + p.elec.length + '_' + i]));
  p.elec.push(...r.boites.map((b) => ({ id: ids.get(b.id), lv: b.lv, type: b.type, x: b.x, y: b.y, rot: 0, h: null })));
  p.ducts.push(...r.gaines.map((g, i) => Object.assign({}, g, { id: 'g' + p.ducts.length + '_' + i, a: ids.get(g.a) || g.a, b: ids.get(g.b) || g.b })));
}

test('boîtes de dérivation : une boîte au plafond par pièce, de boîte en boîte depuis le tableau, jamais d’appareil à appareil, plan non modifié', () => {
  const p = plan(), avant = JSON.stringify(p);
  const r = raccorderEnBoites(p, 'c1', { pieces, kind: 'icta' });
  assert.equal(JSON.stringify(p), avant, 'le plan n’est pas modifié');
  assert.deepEqual(r.echecs, []);
  assert.equal(r.boites.length, 2, 'une boîte par niveau (une pièce chacun)');
  assert.deepEqual(r.boites.map((b) => [b.lv, b.type, b.h, b.n]), [['L0', 'derivation', null, 3], ['L1', 'derivation', null, 2]]);
  for (const b of r.boites) { assert.ok(b.x >= 40 && b.x <= 560 && b.y >= 40 && b.y <= 360, 'à 30 cm au moins des murs'); }
  /* toutes les gaines au plafond, du circuit, en ICTA */
  assert.ok(r.gaines.every((g) => g.pose === 'plafond' && g.cid === 'c1' && g.kind === 'icta' && g.sys === 'elec' && g.len > 0));
  /* chaque appareil part de sa boîte ; les boîtes partent du tableau ou d'un passage */
  const boites = new Set(r.boites.map((b) => b.id));
  for (const id of ['p1', 'p2', 'p3', 'q1', 'q2']) { const g = r.gaines.find((x) => x.b === id); assert.ok(g && boites.has(g.a), id + ' relié à sa boîte'); }
  assert.ok(r.gaines.every((g) => boites.has(g.a) || ['T', 'tr1'].includes(g.a)), 'aucune gaine d’appareil à appareil');
  assert.ok(r.gaines.some((g) => g.a === 'T' && g.b === 'tr0'), 'l’étage est desservi par le passage');
  /* une fois créées, le circuit est complet ; un second passage ne propose plus rien */
  appliquer(p, r);
  assert.equal(cheminCircuit(p, 'c1').complet, true);
  const r2 = raccorderEnBoites(p, 'c1', { pieces });
  assert.equal(r2.gaines.length, 0); assert.equal(r2.boites.length, 0); assert.equal(r2.deja, 5);
  /* circuit d'un seul appareil : directement depuis le tableau, sans boîte */
  const r3 = raccorderEnBoites(p, 'c2', { pieces });
  assert.equal(r3.boites.length, 0); assert.deepEqual(r3.gaines.map((g) => [g.a, g.b, g.pose]), [['T', 'x1', 'plafond']]);
});

test('boîtes de dérivation : boîte libre déjà posée reprise, boîte d’un autre circuit laissée ; position calculée', () => {
  const p = plan();
  p.elec.push({ id: 'BX', lv: 'L0', type: 'derivation', x: 300, y: 200, rot: 0, h: null });
  const r = raccorderEnBoites(p, 'c1', { pieces });
  assert.deepEqual(r.reprises, ['BX']); assert.equal(r.boites.filter((b) => b.lv === 'L0').length, 0, 'pas de nouvelle boîte au rez-de-chaussée');
  assert.ok(['p1', 'p2', 'p3'].every((id) => r.gaines.some((g) => g.a === 'BX' && g.b === id)));
  /* la même boîte, déjà utilisée par un autre circuit : une nouvelle boîte est proposée */
  const q = plan();
  q.elec.push({ id: 'BX', lv: 'L0', type: 'derivation', x: 300, y: 200, rot: 0, h: null });
  q.ducts.push({ id: 'd0', lv: 'L0', sys: 'elec', pts: [{ x: 50, y: 200 }, { x: 300, y: 200 }], a: 'T', b: 'BX', cid: 'c2', pose: 'plafond' });
  const r2 = raccorderEnBoites(q, 'c1', { pieces });
  assert.deepEqual(r2.reprises, []); assert.equal(r2.boites.filter((b) => b.lv === 'L0').length, 1);
  /* position : là où la somme des longueurs (tronçons droits) est la plus courte, à 30 cm des murs, à l'écart des symboles */
  const poly = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
  assert.deepEqual(placerBoite(poly, [{ x: 200, y: 150 }, { x: 200, y: 150 }], [], []), { x: 200, y: 150 });
  const b = placerBoite(poly, [{ x: 60, y: 5 }, { x: 340, y: 5 }, { x: 5, y: 250 }], [], []);
  assert.equal(b.y, 35); assert.ok(b.x >= 55 && b.x <= 65);
  const b2 = placerBoite(poly, [{ x: 200, y: 150 }], [{ x: 200, y: 150 }], []);
  assert.ok(Math.hypot(b2.x - 200, b2.y - 150) >= 25, 'pas sur un autre symbole');
  assert.equal(placerBoite([{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }], [{ x: 4, y: 4 }], [], []), null, 'pièce trop petite');
});

test('équipement minimal : hotte, sèche-serviettes et chauffe-eau du mobilier raccordés ; câbles à tirer des appareils posés', () => {
  const p = plan();
  p.items.push({ id: 'h', lv: 'L0', type: 'hotte', x: 300, y: 35, w: 60, d: 50, rot: 0 }, { id: 'pq', lv: 'L0', type: 'plaque', x: 300, y: 36, w: 60, d: 52, rot: 0 },
    { id: 's', lv: 'L0', type: 'seche_serv', x: 585, y: 200, w: 50, d: 10, rot: 90 }, { id: 'ce', lv: 'L0', type: 'chauffe_eau', x: 80, y: 330, w: 55, d: 55, rot: 0 });
  p.elec = p.elec.filter((e) => e.id !== 'x1');
  const piece = { lv: 'L0', nom: 'Buanderie', poly: SALLE, loop: SALLE, aire: 23 };
  const prop = equiperPiece(p, piece);
  const de = (pour) => prop.poses.find((x) => x.pour === pour);
  assert.equal(de('h').type, 'pc_hotte'); assert.equal(de('h').h, 180); assert.ok(de('h').y < 15, 'contre le mur, au-dessus de la plaque');
  assert.equal(de('s').type, 'sortie_rad'); assert.ok(de('s').x > 580);
  assert.deepEqual([de('ce').type, de('ce').x, de('ce').y], ['ce_elec', 80, 330]);
  /* un appareil déjà raccordé n'est plus proposé */
  p.elec.push({ id: 'ph', lv: 'L0', type: 'pc_hotte', x: 320, y: 10, rot: 0, h: 180 });
  assert.equal(equiperPiece(p, piece).poses.filter((x) => x.pour === 'h').length, 0);
  /* câbles à tirer : la prise de hotte (sans circuit), les prises du circuit c1 (pas encore reliées au tableau) ;
     ni le tableau, ni le passage, ni une prise de communication */
  p.elec.push({ id: 'rj', lv: 'L0', type: 'rj45', x: 200, y: 380, rot: 180, h: 30 });
  const c = cablesATirer(p, piece);
  assert.deepEqual(c.map((x) => [x.id, x.etat]).sort(), [['p1', 'gaine'], ['p2', 'gaine'], ['p3', 'gaine'], ['ph', 'circuit']]);
  appliquer(p, raccorderEnBoites(p, 'c1', { pieces }));
  assert.deepEqual(cablesATirer(p, piece).map((x) => x.id), ['ph']);
});

test('écran : « Tirer les câbles » depuis Équipement minimal (boîtes proposées, Valider, une étape d’annulation), choix du mode dans Cheminements ; plan d’exemple', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => { const S = await import('./js/stockage.js'); await S.openSample(); });
  await wait(page, 600);
  /* plan d'exemple : le circuit des prises de la chambre et du séjour est raccordé en boîtes ; la hotte et le sèche-serviettes attendent */
  const ex = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), C = await import('./js/cheminement.js'), E = await import('./js/equipement.js'), G = await import('./js/geometrie.js');
    const P = N.P, bx = P.elec.filter((e) => e.type === 'derivation' && e.lv === 'L0' && e.x < 1000);
    const cid = (P.elec.find((e) => e.type === 'pc' && Math.abs(e.x - 563.5) < 1 && Math.abs(e.y - 55) < 1) || {}).cid;
    const piece = (nom) => { const r = G.geo('L0').rooms.find((q) => q.label && q.label.name === nom); return { lv: 'L0', nom, poly: r.poly, loop: r.loop, aire: r.area / 1e4 }; };
    const types = (nom) => E.equiperPiece(P, piece(nom)).manque.map((m) => m.type);
    return { boites: bx.length, complet: C.cheminCircuit(P, cid).complet, plafond: P.ducts.filter((d) => d.cid === cid).every((d) => d.pose === 'plafond'), cuisine: types('Cuisine'), sdb: types('Salle de bain'), cables: E.cablesATirer(P, piece('Cuisine')).length };
  });
  assert.ok(ex.boites >= 2, 'boîtes de dérivation dans la maison'); assert.ok(ex.complet); assert.ok(ex.plafond);
  assert.ok(ex.cuisine.includes('pc_hotte'), 'prise de la hotte proposée'); assert.ok(ex.sdb.includes('sortie_rad'), 'sortie du sèche-serviettes proposée');
  assert.ok(ex.cables > 0, 'câbles à tirer dans la cuisine');
  /* panneau de la cuisine : « Câbles à tirer » */
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); const lbl = N.P.rooms.find((r) => r.name === 'Cuisine' && r.lv === 'L0'); N.ui.lv = 'L0'; N.ui.sel = { t: 'room', id: lbl.id }; N.ui.inspOpen = true; (await import('./js/interface.js')).renderInspector(); });
  assert.match(await page.textContent('#insp'), /Câbles à tirer.*Tirer les câbles \(\d+\)/s);
  const avant = await page.evaluate(async () => { const N = await import('./js/noyau.js'), H = await import('./js/historique.js'); return { d: N.P.ducts.length, b: N.P.elec.filter((e) => e.type === 'derivation').length, u: H.H.u.length }; });
  await page.click('#tirerCables'); await page.waitForSelector('#propValider', { timeout: 30000 }); await wait(page, 200);
  const prop = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const p = N.ui.propRacc; return p && { tool: N.ui.tool, g: p.gaines.length, b: p.boites.length, mode: p.mode, plafond: p.gaines.every((g) => g.pose === 'plafond'), d: N.P.ducts.length }; });
  assert.ok(prop, 'gaines proposées'); assert.equal(prop.tool, 'propose'); assert.equal(prop.mode, 'boites');
  assert.ok(prop.g > 0 && prop.b > 0); assert.ok(prop.plafond); assert.equal(prop.d, avant.d, 'rien n’est créé avant « Valider »');
  assert.match(await page.textContent('#hint'), /boîtes? de dérivation au plafond/);
  await page.click('#propValider'); await wait(page, 400);
  const apres = await page.evaluate(async () => { const N = await import('./js/noyau.js'), H = await import('./js/historique.js'); return { d: N.P.ducts.length, b: N.P.elec.filter((e) => e.type === 'derivation').length, u: H.H.u.length, toast: document.getElementById('toast').textContent }; });
  assert.equal(apres.d, avant.d + prop.g); assert.equal(apres.b, avant.b + prop.b);
  assert.match(apres.toast, /boîtes? de dérivation/);
  await page.click('#btnUndo'); await wait(page, 300);
  const annule = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { d: N.P.ducts.length, b: N.P.elec.filter((e) => e.type === 'derivation').length }; });
  assert.equal(annule.b, avant.b, 'Annuler retire les boîtes'); assert.equal(annule.d, avant.d, 'et les gaines');
  /* onglet Cheminements : choix du mode, mémorisé */
  await page.click('.vtab[data-view="elec"]'); await wait(page, 300);
  await page.locator('#evBar button', { hasText: 'Cheminements' }).click(); await wait(page, 300);
  assert.equal(await page.locator('#raccMode button[aria-pressed="true"]').innerText(), 'Boîtes de dérivation (plafond et cloisons)');
  await page.locator('#raccMode button', { hasText: 'De proche en proche' }).click(); await wait(page, 200);
  assert.equal(await page.locator('#raccMode button[aria-pressed="true"]').innerText(), 'De proche en proche');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('calque.settings')).raccMode), 'proche');
  assert.deepEqual(errors, []);
  await ctx.close();
});

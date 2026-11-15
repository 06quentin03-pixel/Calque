// Demande du 16 novembre 2026 : câble RJ45 qu'on peut relier aux prises RJ45 (depuis le coffret de communication).
// Lancer :  node --test tests/rj45.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cablesRJ45, liensRJ45, longueurRJ45, prisesSansCable, sourceRJ45 } from '../js/vdi.js';
import { cheminCircuit, estLienRJ45, indexElec } from '../js/cheminement.js';
import { raccorderCircuit } from '../js/itineraire.js';
import { fresh, boot, wait } from './outils.mjs';

function plan() {
  const n = [[0, 0], [600, 0], [600, 400], [0, 400]].map(([x, y], i) => ({ id: 'n' + i, lv: 'L0', x, y }));
  const e = (id, type, x, y, cid, o) => Object.assign({ id, lv: 'L0', type, x, y, rot: 0, h: 30, cid: cid || null }, o || {});
  return { v: 18, levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250 }], nodes: n, walls: n.map((a, i) => ({ id: 'w' + i, lv: 'L0', a: a.id, b: n[(i + 1) % 4].id, th: 20, kind: 'mur' })),
    openings: [], items: [], rooms: [], links: [], ducts: [], zones: [],
    elec: [e('T', 'tableau', 50, 200), e('com', 'com', 15, 300, 'cc', { h: 130, rot: 270 }), e('r1', 'rj45', 300, 15), e('r2', 'rj45_2', 585, 200, null, { rot: 90 }), e('p1', 'pc', 450, 15, 'c1')],
    circuits: [{ id: 'c1', kind: 'prises' }, { id: 'cc', kind: 'communication' }], rcds: [] };
}

test('câbles RJ45 : un câble par prise depuis le coffret, au plafond, reconnus par leurs bouts, jamais utilisés par le courant fort', () => {
  const p = plan(), avant = JSON.stringify(p);
  assert.equal(sourceRJ45(p, 'L0', p.elec[2]).id, 'com');
  assert.deepEqual(prisesSansCable(p, 'L0').map((e) => e.id), ['r1', 'r2']);
  const r = cablesRJ45(p, p.elec[1], prisesSansCable(p, 'L0'));
  assert.equal(JSON.stringify(p), avant, 'plan non modifié');
  assert.deepEqual(r.cables.map((g) => [g.a, g.b, g.pose, g.kind]), [['com', 'r1', 'plafond', 'icta'], ['com', 'r2', 'plafond', 'icta']]);
  p.ducts.push(...r.cables.map((g, i) => Object.assign({ id: 'rj' + i, dia: 20 }, g)));
  const E = indexElec(p);
  assert.ok(p.ducts.every((d) => estLienRJ45(d, E)));
  assert.deepEqual(prisesSansCable(p, 'L0'), []); assert.equal(liensRJ45(p, p.elec[2]).length, 1);
  const L = longueurRJ45(p); assert.equal(L.n, 2); assert.ok(L.cm > 400, 'verticales comprises');
  /* les câbles RJ45 ne servent pas de chemin au circuit des prises */
  assert.equal(cheminCircuit(p, 'c1').complet, false);
  const rc = raccorderCircuit(p, 'c1', {}); assert.deepEqual(rc.gaines.map((g) => [g.a, g.b]), [['T', 'p1']]);
});

test('écran : « Relier au coffret de communication » depuis une prise RJ45, puis toutes les prises depuis le coffret ; plan d’exemple', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => { const S = await import('./js/stockage.js'); await S.openSample(); });
  await wait(page, 600);
  const ex = await page.evaluate(async () => { const N = await import('./js/noyau.js'), V = await import('./js/vdi.js'); return { L: V.longueurRJ45(N.P).n, sans: V.prisesSansCable(N.P, 'L1').length }; });
  assert.equal(ex.L, 2, 'les deux prises RJ45 de la maison sont reliées dans le plan d’exemple');
  /* nouvelle prise RJ45 dans la maison : la relier depuis son panneau */
  const id = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), I = await import('./js/interaction.js');
    const e = { id: N.uid('e'), lv: 'L0', type: 'rj45', x: 150, y: 10, rot: 0, h: 30 }; N.P.elec.push(e); N.IDX.elec.set(e.id, e); I.commit();
    N.ui.lv = 'L0'; N.ui.sel = { t: 'elec', id: e.id }; N.ui.inspOpen = true; I.refreshUI(); return e.id;
  });
  await wait(page, 300);
  await page.click('#relierRJ45'); await wait(page, 400);
  const r = await page.evaluate(async (id) => { const N = await import('./js/noyau.js'), V = await import('./js/vdi.js'); const e = N.P.elec.find((x) => x.id === id); return { n: V.liensRJ45(N.P, e).length, insp: document.getElementById('insp').textContent, toast: document.getElementById('toast').textContent }; }, id);
  assert.equal(r.n, 1); assert.match(r.toast, /1 câble RJ45 tiré/); assert.match(r.insp, /Reliée au coffret par un câble de/);
  await page.click('#btnUndo'); await wait(page, 300);
  assert.equal(await page.evaluate(async (id) => { const N = await import('./js/noyau.js'), V = await import('./js/vdi.js'); return V.liensRJ45(N.P, N.P.elec.find((x) => x.id === id)).length; }, id), 0);
  /* depuis le coffret : « Relier les prises RJ45 (1) » */
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); const c = N.P.elec.find((e) => e.lv === 'L0' && e.type === 'com' && e.x < 1000); N.ui.sel = { t: 'elec', id: c.id }; N.ui.inspOpen = true; (await import('./js/interaction.js')).refreshUI(); });
  await wait(page, 300);
  assert.match(await page.textContent('#relierRJ45'), /Relier les prises RJ45 \(\d+\)/);
  await page.click('#relierRJ45'); await wait(page, 400);
  assert.match(await page.textContent('#toast'), /câbles? RJ45 tirés?/);
  /* matériel : ligne du câble RJ45 */
  assert.ok(await page.evaluate(async () => { const N = await import('./js/noyau.js'), M = await import('./js/materiel.js'); return M.listeMateriel(N.P).lignes.some((l) => /Câble réseau RJ45/.test(l.des) && l.qte > 0); }));
  assert.deepEqual(errors, []);
  await ctx.close();
});

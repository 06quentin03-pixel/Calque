// Équipement minimal d'une pièce (js/equipement.js, sans écran) et pose depuis l'inspecteur (js/equipementui.js).
// Lancer :  node --test tests/equipement.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { besoinsPiece, equiperPiece, manquants } from '../js/equipement.js';
import { fresh, boot, wait } from './outils.mjs';

test('besoins d’une pièce : une seule définition, celle du contrôle de Calque', () => {
  const b = (n, a) => { const x = besoinsPiece(n, a); return [x.socles, x.plan, x.cuisson, x.lumiereObligatoire]; };
  assert.deepEqual(b('Séjour', 20), [5, 0, false, true]); assert.deepEqual(b('Salon', 25.6), [7, 0, false, true]); assert.deepEqual(b('Séjour', 40), [7, 0, false, true]);
  assert.deepEqual(b('Chambre 2', 12), [3, 0, false, true]); assert.deepEqual(b('Cuisine', 12), [6, 4, true, true]); assert.deepEqual(b('Cuisine', 3.5), [3, 0, true, true]);
  assert.deepEqual(b('Salle de bain', 6), [1, 0, false, true]); assert.deepEqual(b('WC', 6), [0, 0, false, true]); assert.deepEqual(b('Couloir', 5), [1, 0, false, true]);
  assert.deepEqual(b('Dégagement', 3), [0, 0, false, true]); assert.deepEqual(b('Dressing', 6), [1, 0, false, false]);
  /* ce qui manque, en tenant compte de ce qui est posé (une prise double compte pour 2 socles) */
  const m = (n, a, els) => manquants(n, a, els).map((x) => [x.type, x.n]);
  assert.deepEqual(m('Cuisine', 12, []), [['pc_pt', 4], ['pc', 2], ['pc32', 1], ['pl', 1], ['int_s', 1]]);
  assert.deepEqual(m('Cuisine', 12, [{ type: 'pc_pt' }, { type: 'pc2' }, { type: 'pc32' }, { type: 'spot' }]), [['pc_pt', 3]]);
  assert.deepEqual(m('Séjour', 30, [{ type: 'pc3' }, { type: 'pc2' }, { type: 'pl' }]), [['pc', 2]]);
  assert.deepEqual(m('Dressing', 3, []), []);
});

/* pièce 6 × 4,5 m (murs de 20 cm), porte au milieu du mur du haut, fenêtre au milieu du mur de droite, baignoire en bas à gauche */
function piece(nom, extra) {
  const nodes = [['a', 0, 0], ['b', 600, 0], ['c', 600, 450], ['d', 0, 450]].map(([id, x, y]) => ({ id, lv: 'L0', x, y }));
  const walls = [['w1', 'a', 'b'], ['w2', 'b', 'c'], ['w3', 'c', 'd'], ['w4', 'd', 'a']].map(([id, a, b]) => ({ id, lv: 'L0', a, b, th: 20 }));
  const plan = Object.assign({ nodes, walls, openings: [{ id: 'o1', wall: 'w1', t: 300, w: 90, kind: 'door' }, { id: 'o2', wall: 'w2', t: 225, w: 120, kind: 'window' }], items: [], elec: [] }, extra || {});
  const poly = [{ x: 10, y: 10 }, { x: 590, y: 10 }, { x: 590, y: 440 }, { x: 10, y: 440 }];
  return { plan, piece: { lv: 'L0', nom, poly, loop: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 450 }, { x: 0, y: 450 }], aire: 26.1 } };
}
test('positions : le long des murs, orientées vers la pièce, hors portes et fenêtres, réparties, commande près de la porte', () => {
  const { plan, piece: p } = piece('Séjour');
  const r = equiperPiece(plan, p);
  assert.deepEqual(r.poses.map((x) => x.type), ['pl', 'int_s', 'pc', 'pc', 'pc', 'pc', 'pc', 'pc', 'pc']); // 26,1 m² → 7 socles
  assert.deepEqual(r.liens, [[1, 0]], 'la commande est reliée au point lumineux');
  const pcs = r.poses.filter((x) => x.type === 'pc');
  for (const q of r.poses.filter((x) => x.type !== 'pl')) {
    const surMur = q.y === 10 || q.y === 440 || q.x === 10 || q.x === 590; assert.ok(surMur, `sur une face : ${q.x}, ${q.y}`);
    const rot = q.y === 10 ? 0 : q.y === 440 ? 180 : q.x === 10 ? 270 : 90; assert.equal(q.rot, rot, 'tournée vers l’intérieur');
    assert.ok(!(q.y === 10 && q.x >= 245 && q.x <= 355), 'pas devant la porte'); assert.ok(!(q.x === 590 && q.y >= 155 && q.y <= 295), 'pas devant la fenêtre');
    for (const c of [[10, 10], [590, 10], [590, 440], [10, 440]]) assert.ok(Math.hypot(q.x - c[0], q.y - c[1]) >= 25, 'pas dans un angle');
  }
  for (let i = 0; i < pcs.length; i++) for (let j = i + 1; j < pcs.length; j++) assert.ok(Math.hypot(pcs[i].x - pcs[j].x, pcs[i].y - pcs[j].y) >= 60, 'prises réparties');
  const sw = r.poses[1]; assert.equal(sw.y, 10); assert.ok(Math.abs(sw.x - 235) <= 5 || Math.abs(sw.x - 365) <= 5, `interrupteur à 20 cm du tableau de la porte : ${sw.x}`);
  assert.deepEqual([r.poses[0].x, r.poses[0].y, r.poses[0].h], [300, 225, null], 'point lumineux au centre');
  assert.equal(pcs[0].h, 30); assert.equal(sw.h, 110);
});
test('salle de bain et cuisine : volumes de la baignoire, aplomb de l’évier et de la plaque, plan de travail, sortie 32 A près de la plaque', () => {
  const sdb = piece('Salle de bain', { items: [{ id: 'b', lv: 'L0', type: 'baignoire', x: 95, y: 400, w: 170, d: 75, rot: 0 }] });
  /* tout le mur du bas et le bas du mur de gauche sont dans la zone des 60 cm : la prise est ailleurs */
  const r1 = equiperPiece(sdb.plan, sdb.piece), pc = r1.poses.find((x) => x.type === 'pc');
  const dx = Math.max(0, Math.abs(pc.x - 95) - 85), dy = Math.max(0, Math.abs(pc.y - 400) - 37.5); assert.ok(Math.hypot(dx, dy) >= 65, `à ${Math.round(Math.hypot(dx, dy))} cm de la baignoire`);
  /* cuisine : plan de travail, évier et plaque contre le mur de gauche (dos au mur, tournés vers la pièce : rot 270) */
  const cu = piece('Cuisine', { items: [
    { id: 'pt', lv: 'L0', type: 'plan_travail', x: 40, y: 225, w: 320, d: 60, rot: 270 },
    { id: 'ev', lv: 'L0', type: 'evier1', x: 40, y: 150, w: 80, d: 50, rot: 270 }, { id: 'pq', lv: 'L0', type: 'plaque', x: 40, y: 300, w: 60, d: 52, rot: 270 }] });
  const r2 = equiperPiece(cu.plan, cu.piece);
  const pt = r2.poses.filter((x) => x.type === 'pc_pt'); assert.equal(pt.length, 4);
  for (const q of pt) { assert.equal(q.x, 10, 'au-dessus du plan de travail'); assert.ok(q.y >= 70 && q.y <= 380); assert.ok(!(q.y > 105 && q.y < 195), 'pas au-dessus de l’évier'); assert.ok(!(q.y > 265 && q.y < 335), 'pas au-dessus de la plaque'); }
  const s32 = r2.poses.find((x) => x.type === 'pc32'); assert.equal(s32.x, 10); assert.ok(Math.abs(s32.y - 300) <= 60 && !(s32.y > 265 && s32.y < 335), `sortie 32 A à côté de la plaque : y = ${s32.y}`);
  assert.equal(r2.poses.filter((x) => x.type === 'pc').length, 2); assert.deepEqual(r2.impossible, []);
});

test('écran : « Équiper toutes les pièces du niveau », contrôles des pièces au vert, une seule étape d’annulation ; plan d’exemple', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  /* plan d'exemple : le local technique manque d'une prise ; la section de la pièce la pose */
  const ex = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), El = await import('./js/electricite.js');
    const lbl = N.P.rooms.find((r) => r.name === 'Local technique'); N.ui.sel = { t: 'room', id: lbl.id }; N.ui.inspOpen = true; (await import('./js/interface.js')).renderInspector();
    const err = () => El.nfcChecks().filter((c) => c.rid === 'cq_socles_piece' && c.sev === 'err' && /Local technique/.test(c.msg)).length;
    return { avant: err(), txt: document.getElementById('insp').textContent };
  });
  assert.equal(ex.avant, 1); assert.match(ex.txt, /Équipement minimal.*1 × Prise de courant 16 A.*Poser l’équipement manquant \(1\)/s);
  await page.click('#insp >> text=Poser l’équipement manquant (1)'); await wait(page, 300);
  assert.equal(await page.evaluate(async () => (await import('./js/electricite.js')).nfcChecks().filter((c) => c.rid === 'cq_socles_piece' && c.sev === 'err').length), 0);
  /* maison vide de 4 pièces */
  await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'), H = await import('./js/historique.js'), M = await import('./js/mutations.js'), G = await import('./js/geometrie.js');
    N.setP(N.normalizePlan(N.blankPlan('Maison à équiper'))); N.touch(); H.historyReset();
    const W = (a, b, th) => M.addWall('L0', a, b, { th: th || 20, kind: th ? 'cloison' : 'mur' });
    W({ x: 0, y: 0 }, { x: 1000, y: 0 }); W({ x: 1000, y: 0 }, { x: 1000, y: 800 }); W({ x: 1000, y: 800 }, { x: 0, y: 800 }); W({ x: 0, y: 800 }, { x: 0, y: 0 });
    W({ x: 600, y: 0 }, { x: 600, y: 800 }, 7); W({ x: 600, y: 400 }, { x: 1000, y: 400 }, 7); W({ x: 0, y: 450 }, { x: 600, y: 450 }, 7);
    N.touch(); G.syncRooms();
    const g = G.geo('L0'), nom = (x, y, n) => { g.rooms.find((q) => N.inPoly({ x, y }, q.loop)).label.name = n; };
    nom(300, 200, 'Séjour'); nom(800, 200, 'Cuisine'); nom(800, 600, 'Chambre'); nom(300, 600, 'Salle de bain');
    const wg = [...g.walls.values()].find((w) => { const p = N.projSeg({ x: 600, y: 200 }, w.A, w.B); return p.d < 10 && p.t > 0 && p.t < 1; });
    I.newOpening('door', wg, N.projSeg({ x: 600, y: 200 }, wg.A, wg.B).t * wg.L, 1);
    N.P.items.push({ id: 'pt', lv: 'L0', k: 'plan_travail', type: 'plan_travail', name: 'Plan', x: 970, y: 200, w: 300, d: 60, rot: 90 }, { id: 'pq', lv: 'L0', k: 'plaque', type: 'plaque', name: 'Plaque', x: 970, y: 280, w: 60, d: 52, rot: 90 }, { id: 'bg', lv: 'L0', k: 'baignoire', type: 'baignoire', name: 'Bain', x: 100, y: 720, w: 170, d: 75, rot: 0 });
    N.touch(); I.commit(); N.ui.sel = null; N.ui.inspOpen = true; I.refreshUI();
  });
  const u0 = await page.evaluate(async () => (await import('./js/historique.js')).H.u.length);
  await page.click('#insp >> text=Équiper toutes les pièces du niveau'); await wait(page, 300);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), El = await import('./js/electricite.js'), H = await import('./js/historique.js');
    const rids = ['cq_socles_piece', 'cq_cuisine_pt', 'cq_cuisine_32', 'cq_eclairage_piece', 'cq_sdb_volumes', 'cq_cuisine_evier', 'cq_h_prises', 'cq_h_commandes', 'cq_h_pc32'];
    return { n: N.P.elec.length, liens: N.P.links.length, undo: H.H.u.length, err: El.nfcChecks().filter((c) => rids.includes(c.rid) && c.sev !== 'ok').map((c) => c.msg), ok: El.nfcChecks().filter((c) => c.rid === 'cq_socles_piece' && c.sev === 'ok').length, toast: document.getElementById('toast').textContent };
  });
  assert.equal(r.undo, u0 + 1, 'une seule étape'); assert.deepEqual(r.err, []); assert.equal(r.ok, 4);
  assert.equal(r.liens, 4); assert.ok(r.n >= 7 + 6 + 1 + 3 + 1 + 8, `${r.n} appareils`); assert.match(r.toast, /appareils posés dans 4 pièces.*Relier les appareils sans circuit/);
  assert.equal(await page.locator('#insp >> text=Équiper toutes les pièces du niveau').count(), 0, 'plus rien à poser');
  await page.click('#btnUndo'); await wait(page, 200);
  assert.deepEqual(await page.evaluate(async () => { const P = (await import('./js/noyau.js')).P; return [P.elec.length, P.links.length]; }), [0, 0]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

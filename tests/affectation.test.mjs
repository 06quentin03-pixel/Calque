// « Relier les appareils sans circuit » (js/affectation.js) : les circuits existants ne changent jamais.
// Lancer :  node --test tests/affectation.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nbSansCircuit, relierSansCircuit } from '../js/affectation.js';
import { fresh, boot, wait } from './outils.mjs';

const ROOMS = { sejour: { id: 'r1', nom: 'Séjour' }, chambre: { id: 'r2', nom: 'Chambre' }, cuisine: { id: 'r3', nom: 'Cuisine' }, haut: { id: 'r4', nom: 'Bureau' } };
function plan() {
  const elec = [], e = (id, type, lv, x, y, cid, piece) => { elec.push({ id, lv, type, x, y, rot: 0, h: 30, cid: cid || null, piece }); };
  for (let i = 0; i < 11; i++) e('s' + i, 'pc', 'L0', 50 + i * 40, 100, 'c1', 'sejour'); // 11 socles sur 12
  for (let i = 0; i < 7; i++) e('l' + i, 'pl', 'L0', 50 + i * 60, 300, 'c2', i < 3 ? 'sejour' : 'chambre'); // 7 points sur 8
  e('n1', 'pc', 'L0', 500, 100, null, 'sejour'); e('n2', 'pc', 'L0', 520, 100, null, 'sejour'); // le 1er rejoint c1, le 2e : nouveau circuit
  e('n3', 'pl', 'L0', 400, 320, null, 'chambre'); // rejoint c2 (8 points)
  e('n4', 'pl', 'L0', 700, 700, null, 'cuisine'); e('n5', 'int_s', 'L0', 650, 690, null, 'cuisine'); // nouveau circuit d'éclairage, l'interrupteur suit
  e('n6', 'pc_pt', 'L0', 700, 650, null, 'cuisine'); e('n7', 'pc32', 'L0', 720, 650, null, 'cuisine'); e('n8', 'borne_ve', 'L0', 900, 900, null, null);
  e('n9', 'pc', 'L1', 50, 100, null, 'haut'); e('n10', 'daaf', 'L0', 10, 10, null, null); e('n11', 'pc', 'L0', 760, 680, null, 'cuisine');
  return {
    elec, links: [{ id: 'k1', lv: 'L0', a: 'n5', b: 'n4' }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises séjour', cal: 20, sec: 2.5, rcd: 'r1', dda: false, calc: { p: { v: 3000, st: 'saisie' }, len: { v: 18, st: 'saisie' } } },
      { id: 'c2', kind: 'eclairage', name: 'Éclairage jour', cal: 16, sec: 1.5, rcd: 'r1', dda: false },
      ...Array.from({ length: 5 }, (_, i) => ({ id: 'x' + i, kind: 'autre', name: 'Autre ' + i, cal: 16, sec: 1.5, rcd: 'r1' })),
      { id: 'y0', kind: 'lave_linge', name: 'Lave-linge', cal: 20, sec: 2.5, rcd: 'rA' }, { id: 'y1', kind: 'four', name: 'Four', cal: 20, sec: 2.5, rcd: 'rA' }],
    rcds: [{ id: 'r1', type: 'AC', cal: 63 }, { id: 'rA', type: 'A', cal: 40 }],
  };
}
const ctx = { piece: (e) => (e.piece ? ROOMS[e.piece] : null) };

test('relier : circuits existants complétés jusqu’au maximum, puis circuits créés ; rien d’existant ne change', () => {
  const p = plan(), avant = JSON.stringify({ c: p.circuits, r: p.rcds, e: p.elec.filter((e) => e.cid) });
  assert.equal(nbSansCircuit(p), 10, 'le détecteur de fumée n’a pas de circuit (normal)');
  const r = relierSansCircuit(p, ctx);
  assert.equal(JSON.stringify({ c: p.circuits, r: p.rcds, e: p.elec.filter((e) => e.cid) }), avant, 'plan non modifié (proposition seulement)');
  const a = Object.fromEntries(r.affectations.map((x) => [x.id, x.cid])), nouv = Object.fromEntries(r.circuits.map((c) => [c.id, c]));
  assert.equal(a.n1, 'c1', '12e socle : le circuit existant de la pièce'); assert.equal(a.n3, 'c2', '8e point d’éclairage');
  const k = (id) => nouv[a[id]] && [nouv[a[id]].kind, nouv[a[id]].name, nouv[a[id]].rcd];
  assert.deepEqual(k('n2'), ['prises', 'Prises de courant séjour', 'rA'], 'c1 est plein (12 socles) : nouveau circuit, différentiel le moins chargé');
  assert.deepEqual(k('n4'), ['eclairage', 'Éclairage cuisine', 'rA']); assert.equal(a.n5, a.n4, 'l’interrupteur suit le point lumineux qu’il commande');
  assert.equal(nouv[a.n6].kind, 'prises_cuisine'); assert.equal(a.n11, a.n6, 'prises de la cuisine sur le même circuit');
  assert.deepEqual(k('n7'), ['cuisson', 'Plaque de cuisson', 'rA'], 'plaque : type A obligatoire');
  assert.equal(nouv[a.n8].kind, 'irve'); assert.equal(r.rcds.length, 1); assert.equal(nouv[a.n8].rcd, r.rcds[0].id); assert.equal(r.rcds[0].type, 'A');
  assert.equal(nouv[a.n9].kind, 'prises', 'autre niveau : pas sur le circuit du rez-de-chaussée'); assert.notEqual(a.n9, a.n2);
  assert.equal(a.n10, undefined); assert.deepEqual(r.restants, []);
  /* 8 circuits au plus par différentiel : r1 (AC) en avait déjà 7 et ne reçoit aucun circuit de cuisson (type A exigé) */
  const parRcd = {}; for (const c of [...p.circuits, ...r.circuits]) parRcd[c.rcd] = (parRcd[c.rcd] || 0) + 1;
  assert.ok(Object.values(parRcd).every((n) => n <= 8), JSON.stringify(parRcd));
});

test('relier : sans différentiel libre, le circuit créé n’en a aucun (le contrôle le signale) ; plan sans orphelin : rien', () => {
  const p = plan(); p.rcds = [{ id: 'r1', type: 'AC', cal: 63 }]; for (const c of p.circuits) c.rcd = 'r1'; // 9 circuits : r1 est plein
  const r = relierSansCircuit(p, ctx);
  assert.ok(r.circuits.filter((c) => c.kind !== 'irve').every((c) => c.rcd === null));
  const q = plan(); for (const e of q.elec) if (e.type !== 'daaf') e.cid = 'c1';
  assert.deepEqual(relierSansCircuit(q, ctx), { affectations: [], circuits: [], rcds: [], restants: [], existants: 9 });
});

test('écran : plan d’exemple, prise posée par « Équiper », reliée au circuit existant sans rien changer d’autre ; une étape d’annulation', async () => {
  const { ctx: c, page, errors } = await fresh();
  await boot(page);
  const avant = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), U = await import('./js/equipementui.js');
    U.equiperUne(N.P.rooms.find((r) => r.name === 'Local technique'));
    return { circuits: JSON.stringify(N.P.circuits), rcds: JSON.stringify(N.P.rcds) };
  });
  await page.click('text=Tableau électrique');
  const bouton = page.locator('.ev-actions >> text=/Relier les appareils sans circuit \\(\\d+\\)/');
  assert.ok(await bouton.isVisible());
  const u0 = await page.evaluate(async () => (await import('./js/historique.js')).H.u.length);
  await bouton.click(); await wait(page, 300);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), H = await import('./js/historique.js'), El = await import('./js/electricite.js'), A = await import('./js/affectation.js');
    const pc = N.P.elec.filter((e) => e.type === 'pc' && e.lv === 'L0').pop();
    return { circuits: JSON.stringify(N.P.circuits), rcds: JSON.stringify(N.P.rcds), cid: pc.cid, kind: (N.P.circuits.find((c) => c.id === pc.cid) || {}).kind, sans: A.nbSansCircuit(N.P), undo: H.H.u.length, toast: document.getElementById('toast').textContent, chk: El.nfcChecks().filter((x) => x.rid === 'cq_sans_circuit').length };
  });
  assert.equal(r.circuits, avant.circuits, 'aucun circuit modifié ni créé (la prise rejoint un circuit de prises existant)');
  assert.equal(r.rcds, avant.rcds); assert.equal(r.kind, 'prises'); assert.equal(r.sans, 0); assert.equal(r.chk, 0); assert.equal(r.undo, u0 + 1);
  assert.match(r.toast, /1 appareil relié à des circuits existants\. Les circuits existants n’ont pas changé\./);
  assert.equal(await bouton.count(), 0);
  await page.click('#btnUndo'); await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/affectation.js')).nbSansCircuit((await import('./js/noyau.js')).P)), 1);
  assert.deepEqual(errors, []);
  await c.close();
});

test('section de la pièce : après « Poser l’équipement manquant », « Relier les appareils sans circuit » sur place', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); N.ui.sel = { t: 'room', id: N.P.rooms.find((r) => r.name === 'Local technique').id }; N.ui.inspOpen = true; (await import('./js/interface.js')).renderInspector(); });
  await page.click('#insp >> text=Poser l’équipement manquant (1)'); await wait(page, 300);
  await page.click('#insp >> text=Relier les appareils sans circuit (1)'); await wait(page, 300);
  const r = await page.evaluate(async () => { const N = await import('./js/noyau.js'), A = await import('./js/affectation.js'); return { sans: A.nbSansCircuit(N.P), txt: document.getElementById('insp').textContent }; });
  assert.equal(r.sans, 0); assert.ok(!/Relier les appareils sans circuit/.test(r.txt)); assert.match(r.txt, /Équipement minimal.*Présent/s);
  assert.deepEqual(errors, []);
  await ctx.close();
});


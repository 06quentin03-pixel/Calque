// « Régénérer depuis le plan » et suppression d'un circuit : les gaines, les cases « posé » du chantier et les données
// saisies suivent ; copie de sécurité dans l'historique ; une gaine d'un circuit disparu reste utilisable.
// Lancer :  node --test tests/regeneration.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cheminCircuit } from '../js/cheminement.js';
import { fresh, boot, wait } from './outils.mjs';

test('longueurs : une gaine rattachée à un circuit qui n’existe plus redevient commune', () => {
  const e = (id, type, x, y, cid) => ({ id, lv: 'L0', type, x, y, rot: 0, h: 30, cid });
  const p = { levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250 }], elec: [e('T', 'tableau', 0, 0), e('p1', 'pc', 300, 0, 'c1')],
    ducts: [{ id: 'g', lv: 'L0', sys: 'elec', cid: 'ancien', a: 'T', b: 'p1', pts: [{ x: 0, y: 0 }, { x: 300, y: 0 }] }],
    circuits: [{ id: 'c1', kind: 'prises' }] };
  assert.equal(cheminCircuit(p, 'c1').complet, true);
  p.circuits.push({ id: 'ancien', kind: 'prises' }); // le circuit existe : la gaine lui est réservée
  assert.equal(cheminCircuit(p, 'c1').complet, false);
});

test('régénération : copie de sécurité, circuits inchangés gardent nom et données, gaines et cases « posé » suivent', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  /* le plan d'exemple, ouvert comme un plan ordinaire (enregistré), avec des gaines rattachées à leurs circuits */
  const avant = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), St = await import('./js/stockage.js'), Ex = await import('./js/exemple.js'), R = await import('./js/routeui.js'), CH = await import('./js/cheminement.js');
    St.openPlan(Ex.samplePlan(), 'pReg', { quiet: true }); await St.saveNow();
    await R.raccorderAuto(N.P.circuits.map((c) => c.id));
    const c = N.P.circuits.find((x) => x.kind === 'chauffe_eau'); c.name = 'Ballon garage (renommé)'; c.calc = Object.assign({}, c.calc, { len: { v: 23, st: 'saisie', src: 'mesuré sur place' } });
    const I = await import('./js/interaction.js'); I.commit();
    return { complets: N.P.circuits.filter((x) => CH.cheminCircuit(N.P, x.id).complet).length, poses: Object.keys(N.P.chantier.poses.circ).length, n: N.P.circuits.length,
      membres: N.P.elec.filter((e) => e.cid === c.id).map((e) => e.id).sort() };
  });
  assert.equal(avant.complets, avant.n);
  await page.click('text=Tableau électrique');
  const b = page.locator('.ev-actions >> text=Régénérer depuis le plan'); await b.click();
  await page.locator('.ev-actions >> text=Remplacer tous les circuits ?').click(); await wait(page, 500);
  const r = await page.evaluate(async (m) => {
    const N = await import('./js/noyau.js'), CH = await import('./js/cheminement.js'), St = await import('./js/stockage.js');
    const ids = new Set(N.P.circuits.map((c) => c.id));
    const ce = N.P.circuits.find((c) => JSON.stringify(N.P.elec.filter((e) => e.cid === c.id).map((e) => e.id).sort()) === JSON.stringify(m));
    return { complets: N.P.circuits.filter((x) => CH.cheminCircuit(N.P, x.id).complet).length, n: N.P.circuits.length,
      orphelines: N.P.ducts.filter((d) => [d.cid, ...(d.cids || [])].some((x) => x && !ids.has(x))).length,
      poses: Object.keys(N.P.chantier.poses.circ).filter((k) => ids.has(k)).length, nomCe: ce && ce.name, lenCe: ce && ce.calc && ce.calc.len,
      versions: (await St.versionsOf('pReg')).map((v) => v.why), toast: document.getElementById('toast').textContent };
  }, avant.membres);
  assert.equal(r.n, avant.n); assert.equal(r.complets, avant.complets, 'les circuits restent raccordés par leurs gaines'); assert.equal(r.orphelines, 0);
  assert.equal(r.poses, avant.poses, 'les cases « posé » des circuits suivent');
  assert.equal(r.nomCe, 'Ballon garage (renommé)'); assert.deepEqual(r.lenCe, { v: 23, st: 'saisie', src: 'mesuré sur place' });
  assert.ok(r.versions.some((w) => /avant « Régénérer depuis le plan »/.test(w)), r.versions.join(' | '));
  assert.match(r.toast, /Tableau régénéré : \d+ circuits, dont \d+ inchangés \(nom et données saisies gardés\)/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('supprimer un circuit : ses gaines redeviennent communes, sa case « posé » est retirée', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const id = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), R = await import('./js/routeui.js'), T = await import('./js/tableau.js');
    const c = N.P.circuits.find((x) => x.kind === 'chauffe_eau'); await R.raccorderAuto([c.id]);
    N.P.chantier.poses.circ[c.id] = Date.now();
    T.setView('elec'); N.ui.evSel = { t: 'circuit', id: c.id }; T.renderElecView();
    return c.id;
  });
  assert.ok(await page.evaluate(async (id) => (await import('./js/noyau.js')).P.ducts.some((d) => d.cid === id), id));
  await page.locator('.ev-edit >> text=Supprimer').click(); await wait(page, 300);
  const r = await page.evaluate(async (id) => { const P = (await import('./js/noyau.js')).P; return { gaines: P.ducts.filter((d) => d.cid === id || (d.cids || []).includes(id)).length, pose: id in P.chantier.poses.circ, existe: P.circuits.some((c) => c.id === id) }; }, id);
  assert.deepEqual(r, { gaines: 0, pose: false, existe: false });
  assert.deepEqual(errors, []);
  await ctx.close();
});

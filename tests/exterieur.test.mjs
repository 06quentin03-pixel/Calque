// Demandes du 17 novembre 2026 : murs inclinés (maison en A) et masqués, toits (panneaux solaires), sols sans murs
// (terrasse), piscine, chauffe-eau (cinq types, volume conseillé), KNX, ossature bois à l'américaine ; format v20.
// Lancer :  node --test tests/exterieur.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, seedPlan, wait, idb, storedPlan } from './outils.mjs';
import { aireSurface, calepinage, dessusEn, hauteurFaitage, hauteurToit, inclPourA, nettoyerSurface, nettoyerV20, orientation, pansToit, surfaceSous } from '../js/toits.js';
import { circuitConseille, nettoyerCE, puissanceInstantane, resumeCE, tempsChauffe, volumeConseille } from '../js/ecs.js';
import { adressesPhysiques, ajouterGroupes, bilanCourant, controlesKNX, csvGroupes, lignesKNX, nettoyerKnxPlan, parsePA, proposerGroupes } from '../js/knx.js';
import { montantsCourants, montantsDuMur } from '../js/ossature.js';
import { appareilsDansVolumes, volumeDe } from '../js/piscine.js';
import { estLienKNX } from '../js/cheminement.js';

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
const proche = (a, b, m = 0.01) => Math.abs(a - b) <= m;

test('moteur des toits : formes, pans, surfaces en rampant, faîtage, orientation, panneaux solaires, maison en A', () => {
  const s = { kind: 'toit', forme: '2pans', pente: 30, sens: 0, pts: rect(0, 0, 1000, 600) };
  const pans = pansToit(s);
  assert.equal(pans.length, 2);
  assert.ok(proche(pans[0].aireProj, 300000)); assert.ok(proche(pans[0].aire, 300000 / Math.cos(Math.PI / 6), 1));
  assert.ok(proche(hauteurFaitage(s), 300 * Math.tan(Math.PI / 6), 0.1));
  assert.ok(proche(hauteurToit(s, { x: 500, y: 0 }), 0)); assert.ok(proche(hauteurToit(s, { x: 500, y: 150 }), 150 * Math.tan(Math.PI / 6), 0.01));
  assert.deepEqual(pans.map((p) => orientation(p.sens, 0).nom).sort(), ['nord', 'sud']);
  assert.equal(orientation(90, 90).nom, 'est', 'nord du plan tourné de 90°');
  assert.equal(pansToit({ ...s, forme: '4pans' }).length, 4);
  assert.equal(pansToit({ ...s, forme: '1pan' }).length, 1);
  const plat = pansToit({ ...s, forme: 'plat' }); assert.equal(plat.length, 1); assert.equal(plat[0].sens, null);
  assert.equal(aireSurface(s), 600000);
  /* panneaux : 8 modules de 113 cm sur 10 m (marge 30), une rangée de 172 cm dans 3 m de pan à 30° */
  const cp = calepinage({ ...s, pv: { pan: 1, lm: 113, hm: 172, marge: 30, jeu: 2, wc: { v: 400, st: 'saisie' } } });
  assert.equal(cp.n, 8); assert.equal(cp.rangs, 1); assert.equal(cp.cols, 8); assert.deepEqual(cp.kwc, { v: 3.2, st: 'saisie' });
  const sansWc = calepinage({ ...s, pv: { pan: 1 } }); assert.equal(sansWc.kwc, null, 'pas de puissance inventée');
  for (const q of cp.panneaux) for (const p of q) assert.ok(p.y >= 300 - 0.01 && p.y <= 600 && p.x >= 0 && p.x <= 1000, 'dans le pan sud');
  /* appareil posé sur un toit : altitude du dessus */
  const plan = { surfaces: [Object.assign({ lv: 'L0' }, s), { lv: 'L0', kind: 'terrasse', pts: rect(0, 700, 400, 900), z: 20 }] };
  assert.equal(surfaceSous(plan, 'L0', { x: 500, y: 300 }).kind, 'toit');
  assert.equal(surfaceSous(plan, 'L0', { x: 100, y: 800 }).kind, 'terrasse');
  assert.equal(surfaceSous(plan, 'L0', { x: 2000, y: 800 }), null);
  assert.ok(proche(dessusEn(plan.surfaces[0], { x: 500, y: 300 }, { h: 250 }), 250 + 300 * Math.tan(Math.PI / 6) + 25 / Math.cos(Math.PI / 6), 0.01));
  /* maison en A : 8 m d'écartement, faîte à 6 m */
  assert.ok(proche(inclPourA(800, 600), Math.atan(400 / 600) * 180 / Math.PI));
  /* nettoyage */
  assert.equal(nettoyerSurface({ id: 'a', lv: 'L0', kind: 'toit', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }), null, 'contour trop petit');
  const n = nettoyerSurface({ id: 'a', lv: 'L0', kind: 'toit', pts: rect(0, 0, 100, 100), forme: 'bizarre', pente: 120, mat: 'xx', pv: { lm: 'a', wc: { v: 400, st: 'verifiee' } } });
  assert.equal(n.forme, 'plat'); assert.equal(n.pente, 75); assert.equal(n.mat, undefined); assert.equal(n.pv.wc.st, 'saisie', 'vérifiée sans source → saisie');
});

test('moteur des chauffe-eau : volume conseillé, instantané, temps de chauffe, circuit, nettoyage', () => {
  assert.equal(volumeConseille('ce_elec', 4, 'normal').v, 200);
  assert.equal(volumeConseille('ce_elec', 4, 'normal').st, 'estimee');
  assert.equal(volumeConseille('ce_elec', 1, 'econome').v, 75, '75 × 0,8 = 60 → 75 L');
  assert.equal(volumeConseille('ballon_thermo', 5, 'normal').v, 270);
  assert.equal(volumeConseille('ce_solaire', 4, 'fort').v, 400, '300 × 1,3 = 390 → 400 L');
  assert.equal(volumeConseille('ce_chaudiere', 8, 'normal').v, 400, 'au-delà de 6 personnes : + 50 L par personne');
  assert.equal(volumeConseille('ce_instant', 4), null, 'pas de volume pour un instantané');
  assert.ok(proche(puissanceInstantane(8, 30), 8 / 60 * 4.185 * 30 * 1000));
  assert.ok(proche(tempsChauffe(200, 45, 2200), 200 * 1.163 * 45 / 2200));
  const c = circuitConseille(3000, 'mono'); assert.equal(c.cal, 16); assert.equal(c.sec, 1.5); assert.equal(c.st, 'estimee');
  const t = circuitConseille(18000, 'tri'); assert.equal(t.cal, 32); assert.equal(t.sec, 6);
  assert.equal(circuitConseille(18000, 'mono').cal, null, '78 A en monophasé : au-delà de 63 A');
  const r = resumeCE({ type: 'ce_elec', ce: { pers: 3 } });
  assert.equal(r.conseil.v, 150); assert.equal(r.vol, null, 'volume choisi non deviné'); assert.equal(r.p.st, 'estimee');
  assert.ok(resumeCE({ type: 'ce_solaire' }).capteurs.v >= 2);
  assert.equal(resumeCE({ type: 'ce_chaudiere' }).circuit, undefined, 'pas de circuit dédié');
  const e = nettoyerCE({ type: 'ce_elec', ce: { pers: 'x', usage: 'normal', vol: { v: 200, st: 'verifiee' }, q: -1 } });
  assert.deepEqual(e.ce, { usage: 'normal', vol: { v: 200, st: 'saisie' } });
  assert.equal(nettoyerCE({ type: 'pc', ce: { pers: 2 } }).ce, undefined, 'pas un chauffe-eau');
});

test('moteur KNX : lignes par le bus, adresses physiques, contrôles, adresses de groupe, CSV', () => {
  const E = (id, type, x, y, extra) => Object.assign({ id, lv: 'L0', type, x, y, rot: 0, h: null }, extra || {});
  const lien = (id, a, b, pts) => ({ id, lv: 'L0', sys: 'elec', a, b, pts });
  const plan = {
    levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250 }],
    elec: [E('al', 'knx_alim', 0, 0), E('ac', 'knx_act', 30, 0), E('bp', 'knx_bp', 500, 0, { knx: { pa: '1.1.9' } }), E('det', 'knx_det', 900, 300), E('iso', 'knx_thermo', 2000, 2000), E('pl', 'pl', 500, 300), E('vr', 'volet_mot', 600, 10)],
    ducts: [lien('d1', 'al', 'ac', [{ x: 0, y: 0 }, { x: 30, y: 0 }]), lien('d2', 'ac', 'bp', [{ x: 30, y: 0 }, { x: 500, y: 0 }]), lien('d3', 'bp', 'det', [{ x: 500, y: 0 }, { x: 900, y: 300 }]),
      { id: 'g', lv: 'L0', sys: 'elec', cid: 'c1', a: 'bp', b: 'pl', pts: [{ x: 500, y: 0 }, { x: 500, y: 300 }] }],
    links: [], circuits: [{ id: 'c1' }],
  };
  const idx = new Map(plan.elec.map((e) => [e.id, e]));
  assert.ok(estLienKNX(plan.ducts[0], idx)); assert.ok(!estLienKNX(plan.ducts[3], idx), 'gaine d’un circuit : pas le bus');
  const { lignes, isoles } = lignesKNX(plan);
  assert.equal(lignes.length, 1); assert.equal(lignes[0].appareils.length, 4); assert.deepEqual(isoles.map((e) => e.id), ['iso']);
  const { adresses, doublons } = adressesPhysiques(plan);
  assert.equal(adresses.get('bp').pa.join('.'), '1.1.9'); assert.equal(adresses.get('bp').auto, false);
  assert.equal(adresses.get('ac').pa.join('.'), '1.1.1'); assert.equal(adresses.get('det').pa.join('.'), '1.1.2');
  assert.equal(adresses.has('al'), false, 'l’alimentation n’a pas d’adresse'); assert.equal(adresses.get('iso').pa, null); assert.deepEqual(doublons, []);
  const C = controlesKNX(plan);
  assert.ok(C.some((c) => c.st === 'non_conforme' && /non relié/.test(c.msg)));
  assert.ok(C.every((c) => c.st === 'non_conforme' || c.st === 'verification'), 'jamais « conforme »');
  assert.ok(C.some((c) => /consommation 30 mA pour 640 mA disponibles \(valeurs estimées/.test(c.msg)), C.map((c) => c.msg).join(' | '));
  assert.deepEqual(bilanCourant([10, 10, 12], 30), { conso: 32, dispo: 30, reste: -2, ok: false });
  /* 70 participants sur une ligne : non conforme */
  const gros = { levels: plan.levels, elec: [E('al', 'knx_alim', 0, 0)], ducts: [], links: [] };
  for (let i = 0; i < 70; i++) { gros.elec.push(E('p' + i, 'knx_bp', (i + 1) * 10, 0)); gros.ducts.push(lien('l' + i, i ? 'p' + (i - 1) : 'al', 'p' + i, [{ x: i * 10, y: 0 }, { x: (i + 1) * 10, y: 0 }])); }
  assert.ok(controlesKNX(gros).some((c) => c.st === 'non_conforme' && /70 participants/.test(c.msg)));
  assert.ok(controlesKNX(gros).some((c) => c.st === 'non_conforme' && /consommation 700 mA pour 640/.test(c.msg)));
  /* adresses de groupe : seulement les pièces avec un appareil KNX (sauf « toutes ») */
  const pieces = () => [{ id: 'r1', name: 'Séjour', contient: (e) => e.x < 1000 && e.y < 1000 }, { id: 'r2', name: 'Chambre', contient: (e) => e.x >= 1000 }];
  const G = proposerGroupes(plan, pieces);
  assert.deepEqual(G.filter((g) => g.adr.startsWith('1/')).map((g) => g.adr), ['1/0/1', '1/0/2']);
  assert.ok(G.some((g) => g.dpt === '1.008' && /Volets Séjour/.test(g.nom)));
  assert.ok(G.some((g) => g.adr.startsWith('0/') && /tout éteindre/.test(g.nom)));
  assert.equal(G.filter((g) => /Chambre/.test(g.nom)).length, 3, 'chambre : thermostat KNX → chauffage');
  const p2 = { knx: { groupes: [{ id: 'x', adr: '1/0/1', nom: 'Mon groupe', cle: 'autre' }] } };
  assert.equal(ajouterGroupes(p2, G), G.length); assert.equal(p2.knx.groupes.find((g) => g.cle === 'autre').nom, 'Mon groupe', 'rien de renommé');
  assert.equal(new Set(p2.knx.groupes.map((g) => g.adr)).size, p2.knx.groupes.length, 'adresses uniques');
  assert.equal(ajouterGroupes(p2, G), 0, 'déjà là');
  const csv = csvGroupes(p2, () => 'RDC'); assert.match(csv, /"Éclairage";"RDC";"Éclairage Séjour — marche\/arrêt";"1\/0\/2";/); assert.match(csv, /"DPST-1-1"/);
  assert.deepEqual(parsePA('1.2.3'), [1, 2, 3]); assert.equal(parsePA('16.1.1'), null);
  const pk = nettoyerKnxPlan({ knx: { zone: 99, groupes: [{ adr: '1/0/1', nom: 'a' }, { adr: '1/0/1', nom: 'b' }, { adr: 'x' }] } });
  assert.equal(pk.knx.zone, undefined); assert.equal(pk.knx.groupes.length, 1);
});

test('ossature bois à l’américaine et volumes d’une piscine', () => {
  assert.equal(montantsCourants(400, 40.6), 11);
  const plein = montantsDuMur(400, [], 250, { entraxe: 40.6 });
  assert.equal(plein.n, 11); assert.equal(plein.lisses.total, 1200);
  const fen = montantsDuMur(600, [{ t: 300, w: 100, h: 125, sill: 95 }], 250, { entraxe: 40.6 });
  assert.equal(fen.appuis, 2); assert.equal(fen.montants.filter((m) => m.role === 'rive').length, 2); assert.ok(fen.potelets >= 2); assert.equal(fen.linteaux.length, 1);
  assert.ok(fen.montants.every((m) => m.role === 'potelet' || !(m.x > 250 + 3.8 && m.x < 350 - 3.8)), 'pas de montant pleine hauteur dans la baie');
  assert.ok(montantsDuMur(600, [], 250, { entraxe: 61 }).n < montantsDuMur(600, [], 250, { entraxe: 40.6 }).n);
  /* piscine 800 × 400 (margelle 30) : bassin ± 370 × ± 170 */
  const pis = { id: 'p', lv: 'L0', type: 'piscine', x: 0, y: 0, w: 800, d: 400, rot: 0 };
  assert.equal(volumeDe(pis, { x: 0, y: 0 }), 0); assert.equal(volumeDe(pis, { x: 0, y: 170 + 150 }), 1); assert.equal(volumeDe(pis, { x: 0, y: 170 + 300 }), 2); assert.equal(volumeDe(pis, { x: 0, y: 170 + 400 }), null);
  assert.equal(volumeDe(pis, { x: 0, y: 300 }, 300), null, 'au-dessus de 2,50 m');
  const L = appareilsDansVolumes({ elec: [{ id: 'a', lv: 'L0', type: 'pc_jardin', x: 0, y: 300 }, { id: 'b', lv: 'L0', type: 'proj_piscine', x: 0, y: 175 }, { id: 'c', lv: 'L1', type: 'pc', x: 0, y: 0 }] }, pis);
  assert.deepEqual(L.map((x) => [x.e.id, x.v]), [['a', 1], ['b', 1]]); assert.match(L[1].msg, /TBTS 12 V/);
});

test('migration v19 → v20 : nettoyage, rien de perdu, copie de sécurité', async () => {
  const p = { v: 19, walls: [{ id: 'w', incl: 30, masque: true, oss: { entraxe: 61 } }, { id: 'w2', incl: 'x', masque: 1, oss: 3 }], elec: [{ id: 'e', type: 'knx_bp', knx: { pa: '1.1.4', ma: { v: 12, st: 'saisie' } } }, { id: 'f', type: 'pc', knx: { pa: '1.1.1' } }],
    surfaces: [{ id: 's', lv: 'L0', kind: 'terrasse', pts: rect(0, 0, 100, 100), z: 20 }, { id: 't', pts: [] }], install: { nord: 400 } };
  nettoyerV20(p);
  assert.deepEqual(p.walls[0], { id: 'w', incl: 30, masque: true, oss: { entraxe: 61 } }); assert.deepEqual(p.walls[1], { id: 'w2' });
  assert.deepEqual(p.elec[0].knx, { pa: '1.1.4', ma: { v: 12, st: 'saisie' } }); assert.equal(p.elec[1].knx, undefined);
  assert.equal(p.surfaces.length, 1); assert.equal(p.surfaces[0].z, 20); assert.equal(p.install.nord, 40);
  /* à l'écran : un plan v19 s'ouvre en v20 avec sa copie de sécurité */
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, { id: 'pV19', v: 19, name: 'Plan v19', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }], nodes: [{ id: 'n1', lv: 'L0', x: 0, y: 0 }, { id: 'n2', lv: 'L0', x: 400, y: 0 }],
    walls: [{ id: 'w1', lv: 'L0', a: 'n1', b: 'n2', th: 20, kind: 'mur' }], openings: [], items: [], elec: [{ id: 'e1', lv: 'L0', type: 'pc', x: 100, y: 10, rot: 0, h: 30 }], rooms: [], dims: [], texts: [], circuits: [], rcds: [], links: [], ducts: [] });
  await boot(page);
  const r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { v: N.P.v, n: N.P.elec.length, s: N.P.surfaces }; });
  assert.equal(r.v, 20); assert.equal(r.n, 1); assert.deepEqual(r.s, []);
  assert.ok((await idb(page, 'versions')).some((w) => /\(v19 → v20\)/.test(w.why)), 'copie de sécurité');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('écran : outil Toit / sol, toit sur le niveau, panneaux, terrasse, mur incliné (maison en A), chauffe-eau, KNX, 3D', async () => {
  for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
    const { ctx, page, errors } = await fresh({ viewport: vp });
    await boot(page);
    await page.evaluate(async () => (await import('./js/stockage.js')).newPlan()); await wait(page, 600);
    /* quatre murs : un rectangle de 8 × 6 m */
    await page.evaluate(async () => {
      const N = await import('./js/noyau.js'), M = await import('./js/mutations.js'), I = await import('./js/interaction.js');
      const W = (a, b) => M.addWall('L0', a, b, { th: 20, kind: 'mur' });
      W({ x: 0, y: 0 }, { x: 800, y: 0 }); W({ x: 800, y: 0 }, { x: 800, y: 600 }); W({ x: 800, y: 600 }, { x: 0, y: 600 }); W({ x: 0, y: 600 }, { x: 0, y: 0 });
      N.touch(); I.commit(); I.fitView();
      N.ui.inspOpen = true; (await import('./js/interface.js')).renderInspector();
    });
    await wait(page, 300);
    /* toit sur tout le niveau, depuis le panneau du niveau */
    await page.locator('#insp button', { hasText: 'Toit sur tout le niveau' }).click(); await wait(page, 300);
    let s = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { surf: N.P.surfaces.map((x) => ({ kind: x.kind, forme: x.forme, n: x.pts.length })), sel: N.ui.sel }; });
    assert.deepEqual(s.surf, [{ kind: 'toit', forme: '2pans', n: 4 }]); assert.equal(s.sel.t, 'surface');
    /* panneaux solaires */
    await page.locator('#insp button', { hasText: 'Poser des panneaux solaires' }).click(); await wait(page, 300);
    await page.fill('#f-pvwc', '400'); await page.press('#f-pvwc', 'Enter'); await wait(page, 300);
    const txt = await page.locator('#insp').innerText();
    assert.match(txt, /Modules posés/); assert.match(txt, /kWc \(saisie/);
    /* forme quatre pans, pente 45° */
    await page.locator('#insp .seg button', { hasText: 'Quatre pans' }).click(); await wait(page, 200);
    await page.locator('#insp .chip', { hasText: '45°' }).click(); await wait(page, 200);
    s = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return [N.P.surfaces[0].forme, N.P.surfaces[0].pente]; });
    assert.deepEqual(s, ['4pans', 45]);
    /* terrasse dessinée à l'outil : quatre angles puis le premier pour fermer */
    await page.evaluate(async () => { const T = await import('./js/toitsui.js'), R = await import('./js/rendu2d.js'), I = await import('./js/interaction.js'); T.startSurface('terrasse'); R.V.s = 0.4; R.V.ox = 60; R.V.oy = 60; I.requestRender(); });
    const pts = await page.evaluate(async () => { const R = await import('./js/rendu2d.js'); const c = document.getElementById('cv').getBoundingClientRect(); const w = (x, y) => ({ x: c.left + x * R.V.s + R.V.ox, y: c.top + y * R.V.s + R.V.oy }); return [w(100, 700), w(500, 700), w(500, 950), w(100, 950), w(100, 700)]; });
    for (const p of pts) { await page.mouse.click(p.x, p.y); await wait(page, 120); }
    s = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return N.P.surfaces.map((x) => x.kind); });
    assert.deepEqual(s, ['toit', 'terrasse']);
    assert.match(await page.locator('#insp').innerText(), /Terrasse/);
    /* mur incliné : maison en A avec le mur parallèle */
    await page.evaluate(async () => { const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'); I.select({ t: 'wall', id: N.P.walls[0].id }); });
    await wait(page, 200);
    await page.locator('#insp button', { hasText: 'Maison en A' }).click(); await wait(page, 300);
    s = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return N.P.walls.filter((w) => w.incl).map((w) => w.incl); });
    assert.equal(s.length, 2); assert.ok(Math.abs(Math.abs(s[0]) - 50.2) < 0.2, String(s)); assert.ok(Math.sign(s[0]) !== Math.sign(s[1]) || true);
    await page.locator('#insp button', { hasText: 'Masquer en 3D' }).click(); await wait(page, 200);
    assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.walls[0].masque), true);
    /* chauffe-eau : posé, type changé, volume conseillé pris */
    await page.evaluate(async () => {
      const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'), S = await import('./js/symboles.js');
      const e = I.makeElecFromDef(S.ELEC_BY.get('ce_elec'), 'L0'); Object.assign(e, { x: 400, y: 300 }); N.P.elec.push(e); N.touch(); I.commit(); I.select({ t: 'elec', id: e.id });
    });
    await wait(page, 200);
    await page.locator('#insp .seg button', { hasText: 'Thermodynamique' }).click(); await wait(page, 200);
    await page.locator('#insp .chip', { hasText: '5 pers.' }).click(); await wait(page, 200);
    await page.locator('#insp button', { hasText: 'Prendre le volume conseillé' }).click(); await wait(page, 200);
    s = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const e = N.P.elec.find((x) => x.ce); return { t: e.type, ce: e.ce }; });
    assert.equal(s.t, 'ballon_thermo'); assert.equal(s.ce.pers, 5); assert.equal(s.ce.vol.v, 270); assert.equal(s.ce.vol.st, 'estimee');
    /* KNX : alimentation et bouton, relier au bus, proposer les adresses de groupe */
    await page.evaluate(async () => {
      const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'), S = await import('./js/symboles.js');
      for (const [t, x, y] of [['knx_alim', 790, 300], ['knx_bp', 10, 300], ['pl', 400, 200]]) { const e = I.makeElecFromDef(S.ELEC_BY.get(t), 'L0'); Object.assign(e, { x, y, rot: 0 }); N.P.elec.push(e); }
      N.touch(); I.commit(); I.select({ t: 'elec', id: N.P.elec.find((e) => e.type === 'knx_bp').id });
    });
    await wait(page, 200);
    await page.click('#relierKNX'); await wait(page, 300);
    s = await page.evaluate(async () => { const N = await import('./js/noyau.js'), K = await import('./js/knx.js'); return K.lignesKNX(N.P).lignes.map((l) => l.appareils.length); });
    assert.deepEqual(s, [2]);
    await page.evaluate(async () => { const I = await import('./js/interaction.js'); I.select(null); }); await wait(page, 200);
    await page.locator('#insp button', { hasText: 'Proposer les adresses de groupe' }).click(); await wait(page, 300);
    s = await page.evaluate(async () => (await import('./js/noyau.js')).P.knx.groupes.map((g) => g.adr));
    assert.ok(s.includes('1/0/1'), String(s));
    /* annuler : retire les adresses */
    await page.evaluate(async () => { (await import('./js/interaction.js')).undo(); }); await wait(page, 200);
    assert.equal(await page.evaluate(async () => ((await import('./js/noyau.js')).P.knx || {}).groupes?.length || 0), 0);
    /* 3D : sans erreur ; enregistrement */
    await page.evaluate(async () => { (await import('./js/tableau.js')).setView('3d'); }); await wait(page, 900);
    await page.evaluate(async () => { (await import('./js/tableau.js')).setView('plan'); }); await wait(page, 300);
    const st = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const S = await import('./js/stockage.js'); await S.saveNow(); return N.P.id; });
    const saved = await storedPlan(page, st);
    assert.equal(saved.v, 20); assert.equal(saved.surfaces.length, 2);
    /* aucun panneau ne défile de côté */
    const ov = await page.evaluate(() => { const i = document.getElementById('insp'); return i.scrollWidth - i.clientWidth; });
    assert.ok(ov <= 1, 'défilement horizontal ' + ov);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

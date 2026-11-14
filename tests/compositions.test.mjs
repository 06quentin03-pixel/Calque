// Demande de l'utilisateur (14 novembre 2026) : composition des murs, cloisons, planchers et plafonds couche par couche
// (plaque de plâtre, laine de verre, parpaing, brique…) et gaines logées dans la laine ou le vide technique ; migration v15 → v17.
// Lancer :  node --test tests/compositions.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fresh, boot, seedPlan, storedPlan, wait, ROOT } from './outils.mjs';

const imp = (f) => import(path.join(ROOT, 'js', f));
const n = (id, x, y) => ({ id, lv: 'L0', x, y });

/* pièce 8 × 5 m : murs de 20 cm (sens horaire : la pièce est du côté 1 de chaque mur), cloison x = 400 */
function plan(v) {
  return { v: v || 16, id: 'pC', name: 'Compositions', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }],
    nodes: [n('a', 0, 0), n('b', 800, 0), n('c', 800, 500), n('d', 0, 500), n('e', 400, 0), n('f', 400, 500)],
    walls: [['a', 'e', 20, 'mur'], ['e', 'b', 20, 'mur'], ['b', 'c', 20, 'mur'], ['c', 'f', 20, 'mur'], ['f', 'd', 20, 'mur'], ['d', 'a', 20, 'mur'], ['e', 'f', 7, 'cloison']]
      .map(([a, b, th, kind], i) => ({ id: 'w' + i, lv: 'L0', a, b, th, kind })),
    openings: [{ id: 'o1', wall: 'w2', kind: 'window', t: 250, w: 100, h: 100, sill: 100 }], items: [], elec: [], rooms: [], dims: [], texts: [], circuits: [], rcds: [], links: [],
    ducts: [{ id: 'g1', lv: 'L0', sys: 'elec', kind: 'icta', pose: 'cloison', z: 30, dia: 20, pts: [{ x: 100, y: 0 }, { x: 300, y: 0 }] }],
    install: { kva: 9 }, doc: { revisions: [] }, calques: {}, vues: [] };
}

test('sans écran : épaisseur, couches d’un mur, logement des gaines, placement dans la laine, surfaces, nettoyage', async () => {
  const K = await imp('compositions.js');
  /* compositions types : épaisseurs cohérentes, matériaux connus, chaque usage représenté */
  for (const c of K.COMPOSITIONS) { assert.ok(c.couches.every((x) => K.MATERIAUX[x.m]), c.id); assert.ok(K.epaisseur(c.couches) > 0); }
  for (const u of ['mur', 'cloison', 'sol', 'plafond']) assert.ok(K.COMPOSITIONS.some((c) => c.usage === u), u);
  assert.equal(K.epaisseur(K.COMPO_BY.get('cl72').couches), 7.3);
  assert.equal(K.epaisseur(K.COMPO_BY.get('mp20o').couches), 37.25);
  /* application : l'épaisseur du mur devient celle des couches ; ordre côté 1 → côté 2 */
  const p = plan(), w = p.walls[0];
  K.appliquerAuMur(w, K.COMPO_BY.get('mp20o').couches, 'Parpaing 20');
  assert.equal(w.th, 37.25); assert.equal(w.cn, 'Parpaing 20'); assert.equal(w.couches[0].m, 'plaque');
  const B = K.bandes(w);
  assert.equal(B.length, 5); assert.equal(B[0].o1, 37.25 / 2); assert.ok(Math.abs(B[4].o0 + 37.25 / 2) < 1e-9);
  assert.equal(K.coucheA(w, 37.25 / 2 - 1.25 - 1).c.m, 'vide_tech');
  assert.equal(K.coucheA(w, 0).c.m, 'parpaing');
  assert.deepEqual(K.couchesOrientees(K.COMPO_BY.get('clbp5'), true).map((c) => c.m), ['enduit_platre', 'brique_platriere', 'enduit_platre']);
  assert.equal(K.couchesOrientees(K.COMPO_BY.get('mp20o'), true)[0].m, 'enduit_ext', 'extérieur du côté 1 : couches inversées');
  /* passage : vide technique 4,5 cm et laine 10 cm ; un doublage collé (PSE) n'en a pas */
  assert.deepEqual(K.couchesPassage(w.couches).map((x) => [x.c.m, x.dmax]), [['vide_tech', 45], ['laine_verre', 100]]);
  assert.equal(K.resumePassage(K.COMPO_BY.get('mp20c').couches).ok, false);
  /* logement d'une gaine : sur l'axe (parpaing) → saignée ; mur sans composition → non vérifié */
  assert.deepEqual(K.logementGaine(p, p.ducts[0]).map((x) => x.statut), ['saignee']);
  p.ducts[0].pts = [{ x: 500, y: 0 }, { x: 700, y: 0 }];
  assert.deepEqual(K.logementGaine(p, p.ducts[0]).map((x) => x.statut), ['inconnu']);
  /* placement dans la couche de passage : laine de verre (la plus proche de l'axe), gaine à son milieu */
  p.ducts[0].pts = [{ x: 100, y: 0 }, { x: 200, y: 0 }, { x: 300, y: 0 }];
  assert.equal(K.placerDansCouche(p, p.ducts[0]), 2);
  const v = (37.25 / 2 - 1.25 - 4.5 - 5); // milieu de la laine (côté 1 = +y pour le mur a → e)
  assert.deepEqual(p.ducts[0].pts.map((q) => q.y), [Math.round(v * 10) / 10, Math.round(v * 10) / 10, Math.round(v * 10) / 10]);
  const l = K.logementGaine(p, p.ducts[0]);
  assert.equal(l.length, 1); assert.equal(l[0].statut, 'ok'); assert.match(l[0].msg, /Laine de verre/);
  /* gaine trop grosse pour la couche : épaisseur insuffisante */
  K.appliquerAuMur(w, K.COMPO_BY.get('cl72').couches); p.ducts[0].pts = [{ x: 100, y: 0 }, { x: 300, y: 0 }]; p.ducts[0].dia = 63;
  assert.deepEqual(K.logementGaine(p, p.ducts[0]).map((x) => x.statut), ['insuffisant']);
  /* angle entre deux murs : le coude se place à l'intersection des deux couches décalées */
  const q = plan(); K.appliquerAuMur(q.walls[5], K.COMPO_BY.get('mp20o').couches); K.appliquerAuMur(q.walls[0], K.COMPO_BY.get('mp20o').couches);
  q.ducts[0].pts = [{ x: 0, y: 200 }, { x: 0, y: 0 }, { x: 200, y: 0 }];
  K.placerDansCouche(q, q.ducts[0]);
  const vv = Math.round(v * 10) / 10;
  assert.deepEqual(q.ducts[0].pts, [{ x: vv, y: 200 }, { x: vv, y: vv }, { x: 200, y: vv }]);
  /* plancher et plafond : gaine noyée dans la chape, gaine dans le plénum */
  const L = q.levels[0];
  K.appliquerAuNiveau(L, 'sol', K.COMPO_BY.get('sdal').couches, 'Dalle');
  assert.equal(L.slab, 24, 'épaisseur du plancher = somme des couches');
  K.appliquerAuNiveau(L, 'plafond', K.COMPO_BY.get('pfp').couches);
  assert.equal(L.slab, 24, 'le plafond ne change pas l’épaisseur du plancher');
  assert.equal(K.logementGaine(q, { sys: 'elec', lv: 'L0', pose: 'sol', dia: 20, pts: [] })[0].statut, 'noyee');
  assert.equal(K.logementGaine(q, { sys: 'elec', lv: 'L0', pose: 'plafond', dia: 20, pts: [] })[0].statut, 'ok');
  assert.equal(K.logementGaine(q, { sys: 'elec', lv: 'L0', pose: 'plafond', dia: 125, pts: [] })[0].statut, 'insuffisant');
  assert.deepEqual(K.logementGaine(q, { sys: 'elec', lv: 'L0', pose: 'hauteur', z: 30, pts: [] }), []);
  /* surfaces estimées : mur de 4 m × 2,5 m ; fenêtre de 1 m × 1 m déduite du mur w2 */
  const r = plan(); K.appliquerAuMur(r.walls[2], [{ m: 'brique', e: 20 }]); K.appliquerAuMur(r.walls[0], [{ m: 'brique', e: 20 }]);
  const s = K.surfacesMateriaux(r, 'L0', 0);
  assert.deepEqual(s.map((x) => [x.m, x.m2]), [['brique', 21.5]]); // 4 × 2,5 + 5 × 2,5 − 1
  /* nettoyage : matériau inconnu, épaisseur absurde, nom libre de « autre » gardé, composition vide retirée */
  const m = { walls: [{ id: 'x', th: 3, couches: [{ m: 'plaque', e: 1.25 }, { m: 'inconnu', e: 3 }, { m: 'autre', n: ' Liège ', e: 4 }, { m: 'brique', e: -2 }], cn: 'X' }, { id: 'y', th: 7, couches: [], cn: 'Y' }],
    levels: [{ id: 'L0', sol: { couches: [{ m: 'dalle', e: 12 }], cn: 'D' }, plafond: { couches: 'non' } }] };
  K.nettoyerV16(m);
  assert.deepEqual(m.walls[0], { id: 'x', th: 5.25, couches: [{ m: 'plaque', e: 1.25 }, { m: 'autre', e: 4, n: 'Liège' }], cn: 'X' });
  assert.deepEqual(m.walls[1], { id: 'y', th: 7 }, 'rien de deviné');
  assert.deepEqual(m.levels[0], { id: 'L0', sol: { couches: [{ m: 'dalle', e: 12 }], cn: 'D' } });
});

test('écran : migration v15 → v17, composition d’un mur et du niveau, dessin des couches, gaine placée dans la laine', async () => {
  const { ctx, page, errors } = await fresh();
  const p0 = plan(15); p0.walls[0].couches = [{ m: 'bidon', e: 3 }]; // valeur invalide : retirée à la migration
  await seedPlan(ctx, p0); await boot(page);
  let r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { v: N.P.v, c: N.P.walls[0].couches || null, th: N.P.walls.map((w) => w.th) }; });
  assert.equal(r.v, 17); assert.equal(r.c, null); assert.deepEqual(r.th, [20, 20, 20, 20, 20, 20, 7], 'épaisseurs inchangées');
  const vers = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open('calque'); q.onsuccess = () => { const t = q.result.transaction('versions').objectStore('versions').getAll(); t.onsuccess = () => res(t.result.map((x) => x.why)); }; }));
  assert.ok(vers.some((w) => /\(v15 → v17\)/.test(w)), 'copie de sécurité');
  /* inspecteur du mur w0 : composition type « Parpaing de 20 + doublage sur ossature » */
  const sel = (t, id) => page.evaluate(async ([t, id]) => { const N = await import('./js/noyau.js'), F = await import('./js/interface.js'); N.ui.sel = id ? { t, id } : null; N.ui.inspOpen = true; F.renderInspector(); }, [t, id]);
  await sel('wall', 'w0'); await wait(page, 150);
  await page.locator('#insp .li', { hasText: 'Parpaing de 20 + doublage sur ossature' }).click(); await wait(page, 200);
  r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const w = N.P.walls[0]; return { th: w.th, m: w.couches.map((c) => c.m), cn: w.cn }; });
  assert.equal(r.th, 37.25); assert.deepEqual(r.m, ['plaque', 'vide_tech', 'laine_verre', 'parpaing', 'enduit_ext'], 'pièce du côté 1 : doublage côté pièce'); assert.match(r.cn, /Parpaing de 20/);
  assert.match(await page.locator('#insp').innerText(), /Passage des gaines[\s\S]*Ø45[\s\S]*Ø100/);
  /* épaisseur d'une couche : laine de verre 10 → 7,5 ; l'épaisseur du mur suit */
  await page.fill('#f-cm-e2', '7,5'); await page.press('#f-cm-e2', 'Enter'); await wait(page, 200);
  r = await page.evaluate(async () => (await import('./js/noyau.js')).P.walls[0].th);
  assert.equal(r, 34.75);
  /* annuler revient à 37,25 */
  await page.evaluate(async () => (await import('./js/interaction.js')).undo()); await wait(page, 150);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.walls[0].th), 37.25);
  /* « Appliquer aux autres murs du niveau » : les 5 autres murs reçoivent la composition, toujours doublage côté pièce */
  await sel('wall', 'w0'); await wait(page, 150);
  const app = await page.locator('#insp button', { hasText: /Appliquer aux 5 autres murs/ }).elementHandle();
  await app.click(); await app.click(); await wait(page, 200);
  r = await page.evaluate(async () => (await import('./js/noyau.js')).P.walls.filter((w) => w.kind === 'mur').map((w) => w.couches && w.couches[0].m));
  assert.deepEqual(r, ['plaque', 'plaque', 'plaque', 'plaque', 'plaque', 'plaque']);
  /* gaine « dans la cloison » sur l'axe du mur : saignée, puis « Placer dans la couche de passage » → laine de verre */
  await sel('duct', 'g1'); await wait(page, 150);
  assert.match(await page.locator('#insp').innerText(), /Saignée à prévoir/);
  await page.locator('#insp button', { hasText: 'Placer dans la couche de passage' }).click(); await wait(page, 200);
  assert.match(await page.locator('#insp').innerText(), /Place suffisante[\s\S]*Laine de verre/);
  /* niveau : plancher et plafond, surfaces des matériaux */
  await sel(null, null); await wait(page, 150);
  await page.locator('#insp .compo-niv', { hasText: 'Plancher' }).locator('button', { hasText: 'Choisir une composition' }).click(); await wait(page, 150);
  await page.locator('#insp .li', { hasText: 'Poutrelles et hourdis' }).click(); await wait(page, 200);
  r = await page.evaluate(async () => { const L = (await import('./js/noyau.js')).P.levels[0]; return { slab: L.slab, sol: L.sol.couches.map((c) => c.m) }; });
  assert.equal(r.slab, 30); assert.deepEqual(r.sol, ['carrelage', 'chape', 'ravoirage', 'compression', 'hourdis']);
  assert.match(await page.locator('#insp').innerText(), /Surfaces des matériaux[\s\S]*Parpaing[\s\S]*m²/);
  /* dessin : couches visibles (pixels colorés de la laine) ; interrupteur de l'affichage */
  const jaune = () => page.evaluate(async () => {
    const R = await import('./js/rendu2d.js'), I = await import('./js/interaction.js');
    R.V.s = 3; R.V.ox = 200 - 200 * 3; R.V.oy = 300 - 0 * 3; I.requestRender(); await new Promise((r) => setTimeout(r, 200));
    const c = document.querySelector('canvas'), x = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let k = 0;
    for (let i = 0; i < x.length; i += 4) if (x[i] > 220 && x[i + 1] > 190 && x[i + 1] < 225 && x[i + 2] < 140) k++;
    return k;
  });
  assert.ok(await jaune() > 500, 'laine de verre dessinée');
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); N.S.layers.compo = false; });
  assert.ok(await jaune() < 50, 'couches masquées');
  /* enregistrement : la composition est dans le plan enregistré */
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); N.S.layers.compo = true; await (await import('./js/stockage.js')).saveNow(); });
  const sp = await storedPlan(page, 'pC');
  const txt = JSON.stringify(sp);
  assert.ok(/"couches"/.test(txt) && /laine_verre/.test(txt), 'composition enregistrée');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('écran : prochains murs tracés avec la composition choisie, copie vers un autre niveau', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, plan()); await boot(page);
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), F = await import('./js/interface.js'); N.ui.sel = { t: 'wall', id: 'w6' }; N.ui.inspOpen = true; F.renderInspector(); });
  await wait(page, 150);
  await page.locator('#insp .li', { hasText: 'Cloison 72/48' }).click(); await wait(page, 150);
  await page.locator('#insp button', { hasText: 'Utiliser pour les prochaines cloisons' }).click(); await wait(page, 150);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), I = await import('./js/interaction.js');
    N.ui.wallKind = 'cloison';
    const pr = I.wallProps ? I.wallProps() : null;
    return { pr, s: N.S.compo && N.S.compo.cloison && N.S.compo.cloison.couches.length };
  });
  assert.equal(r.s, 3);
  if (r.pr) { assert.equal(r.pr.th, 7.3); assert.equal(r.pr.couches.length, 3); }
  /* bandeau de l'outil Mur : composition affichée à la place de l'épaisseur */
  await page.evaluate(async () => { (await import('./js/interface.js')).setTool('wall'); }); await wait(page, 150);
  assert.match(await page.locator('#hint').innerText(), /Composition : Cloison 72\/48/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

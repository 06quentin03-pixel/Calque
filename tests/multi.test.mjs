// Sélection multiple (outil « Groupe », js/multi.js) : rectangle, toucher, déplacer, tourner, dupliquer,
// copier vers un autre niveau, supprimer, hauteur et circuit des appareils ; une étape d'annulation par action.
// Lancer :  node --test tests/multi.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, seedPlan, canvasBox, wait } from './outils.mjs';

function plan() {
  const lv = [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }, { id: 'L1', name: 'Étage', elev: 270, h: 250, slab: 20 }];
  const nodes = [['a', 0, 0], ['b', 400, 0], ['c', 400, 300], ['d', 0, 300]].map(([id, x, y]) => ({ id, lv: 'L0', x, y }));
  const walls = [['w1', 'a', 'b'], ['w2', 'b', 'c'], ['w3', 'c', 'd'], ['w4', 'd', 'a']].map(([id, a, b]) => ({ id, lv: 'L0', a, b, th: 20, kind: 'mur' }));
  return {
    v: 11, id: 'pM', name: 'Plan groupe', levels: lv, nodes, walls,
    openings: [{ id: 'o1', wall: 'w1', t: 200, w: 90, kind: 'door', side: 1 }],
    items: [{ id: 'i1', lv: 'L0', k: 'table', type: 'table', name: 'Table', x: 200, y: 150, w: 120, d: 80, rot: 0 }],
    elec: [{ id: 'e1', lv: 'L0', type: 'pc', x: 100, y: 100, rot: 0, h: 30, cid: 'c1' }, { id: 'e2', lv: 'L0', type: 'pc', x: 300, y: 100, rot: 0, h: 110, cid: null },
      { id: 'e3', lv: 'L0', type: 'pl', x: 200, y: 200, rot: 0, h: null, cid: null }, { id: 'e4', lv: 'L0', type: 'pc', x: 900, y: 100, rot: 0, h: 30, cid: null }],
    rooms: [{ id: 'r1', lv: 'L0', name: 'Séjour', x: 200, y: 250, tint: 2 }], dims: [{ id: 'd1', lv: 'L0', ax: 50, ay: 50, bx: 150, by: 50 }],
    texts: [{ id: 't1', lv: 'L0', x: 320, y: 240, text: 'Note', size: 'm', rot: 0 }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 16, sec: 1.5, rcd: 'r1' }, { id: 'c2', kind: 'eclairage', name: 'Éclairage', cal: 10, sec: 1.5, rcd: 'r1' }],
    rcds: [{ id: 'r1', type: 'A', cal: 40 }], links: [], ducts: [{ id: 'g1', lv: 'L0', sys: 'elec', kind: 'icta', dia: 20, a: 'e1', b: 'e2', pts: [{ x: 100, y: 100 }, { x: 300, y: 100 }] }],
    install: { kva: 9, parafoudre: false, row: 13 }, doc: { revisions: [] },
  };
}
const etat = (page) => page.evaluate(async () => {
  const N = await import('./js/noyau.js'), H = await import('./js/historique.js'), P = N.P;
  const by = (l) => Object.fromEntries(l.map((o) => [o.id, o]));
  return { multi: (N.ui.multi || []).map((r) => r.t + ':' + r.id).sort(), elec: by(P.elec), items: by(P.items), nodes: by(P.nodes), texts: by(P.texts), dims: by(P.dims), ducts: by(P.ducts), rooms: P.rooms.map((r) => [r.lv, r.name, r.x, r.y]),
    n: { elec: P.elec.length, items: P.items.length, walls: P.walls.length, op: P.openings.length, texts: P.texts.length, dims: P.dims.length, ducts: P.ducts.length, links: P.links.length }, undo: H.H.u.length, tool: N.ui.tool };
});
const aEcran = (page, x, y) => page.evaluate(async ([x, y]) => { const R = await import('./js/rendu2d.js'); const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.x + x * R.V.s + R.V.ox, y: r.y + y * R.V.s + R.V.oy }; }, [x, y]);
async function rectangle(page, x0, y0, x1, y1) {
  const a = await aEcran(page, x0, y0), b = await aEcran(page, x1, y1);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 3 }); await page.mouse.move(b.x, b.y, { steps: 3 }); await page.mouse.up(); await wait(page, 150);
}

test('groupe : rectangle, toucher pour retirer, déplacer au doigt et d’une distance exacte, une seule étape d’annulation', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, plan()); await boot(page);
  await page.click('.tool[data-tool="multi"]');
  await rectangle(page, -60, -60, 460, 360);
  let s = await etat(page);
  assert.deepEqual(s.multi, ['dim:d1', 'duct:g1', 'elec:e1', 'elec:e2', 'elec:e3', 'item:i1', 'text:t1', 'wall:w1', 'wall:w2', 'wall:w3', 'wall:w4'], 'tout ce qui est entièrement dans le rectangle, pas e4');
  assert.match(await page.$eval('#hint', (e) => e.textContent), /3 appareils, 1 meuble, 1 texte, 1 cote, 1 conduit, 4 murs/);
  assert.match(await page.$eval('#insp', (e) => e.textContent), /Groupe/);
  /* paysage : panneau toujours visible, pas de bouton « Actions », le bandeau l'indique */
  assert.ok(await page.getByRole('button', { name: 'Tourner de 90°' }).isVisible());
  assert.equal(await page.locator('#hint >> text=/Actions du groupe/').count(), 0);
  assert.match(await page.$eval('#hint', (e) => e.textContent), /actions dans le panneau de droite/);
  /* toucher un objet du groupe le retire, le retoucher le remet */
  const pt = await aEcran(page, 200, 200);
  await page.mouse.click(pt.x, pt.y); await wait(page, 100); assert.ok(!(await etat(page)).multi.includes('elec:e3'));
  await page.mouse.click(pt.x, pt.y); await wait(page, 100); assert.ok((await etat(page)).multi.includes('elec:e3'));
  /* glisser un objet du groupe : tout suit, murs et nom de la pièce compris */
  const u0 = (await etat(page)).undo;
  const a = await aEcran(page, 100, 100), b = await aEcran(page, 600, 300);
  await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await page.mouse.move(b.x, b.y, { steps: 4 }); await page.mouse.up(); await wait(page, 200);
  s = await etat(page);
  const dx = s.elec.e1.x - 100, dy = s.elec.e1.y - 100;
  assert.ok(Math.abs(dx - 500) <= 10 && Math.abs(dy - 200) <= 10, `déplacement ${dx}, ${dy}`);
  assert.deepEqual([s.elec.e2.x, s.elec.e3.y, s.items.i1.x, s.texts.t1.x, s.nodes.a.x, s.nodes.c.y, s.dims.d1.bx], [300 + dx, 200 + dy, 200 + dx, 320 + dx, dx, 300 + dy, 150 + dx]);
  assert.deepEqual(s.ducts.g1.pts.map((p) => p.x), [100 + dx, 300 + dx]);
  assert.deepEqual(s.rooms, [['L0', 'Séjour', 200 + dx, 250 + dy]], 'la pièce garde son nom');
  assert.equal(s.elec.e4.x, 900); assert.equal(s.undo, u0 + 1);
  await page.click('#btnUndo'); await wait(page, 200);
  s = await etat(page); assert.equal(s.elec.e1.x, 100); assert.equal(s.nodes.a.x, 0); assert.equal(s.multi.length, 11, 'le groupe reste sélectionné après Annuler');
  /* distance exacte */
  await page.fill('#f-mdx', '-25'); await page.keyboard.press('Enter'); await page.fill('#f-mdy', '12,5'); await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Déplacer', exact: true }).click(); await wait(page, 200);
  s = await etat(page); assert.deepEqual([s.elec.e1.x, s.elec.e1.y, s.nodes.b.x, s.nodes.b.y], [75, 112.5, 375, 12.5]);
  /* clavier : flèches, Échap vide le groupe puis quitte l'outil */
  await page.click('#btnUndo'); await wait(page, 150);
  await page.locator('#cv').focus(); await page.keyboard.press('Shift+ArrowRight'); await wait(page, 150);
  assert.equal((await etat(page)).elec.e1.x, 110);
  await page.keyboard.press('Escape'); await wait(page, 100); s = await etat(page); assert.equal(s.multi.length, 0); assert.equal(s.tool, 'multi');
  await page.keyboard.press('Escape'); await wait(page, 100); assert.equal((await etat(page)).tool, 'select');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('groupe : tourner, dupliquer, copier vers un autre niveau, supprimer ; hauteur et circuit des appareils', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, plan()); await boot(page);
  await page.click('.tool[data-tool="multi"]');
  await rectangle(page, -60, -60, 460, 360);
  /* tourner de 90° autour du centre (200, 150) : (100,100) → (250, 50) ; le nom de la pièce suit */
  await page.getByRole('button', { name: 'Tourner de 90°' }).click(); await wait(page, 200);
  let s = await etat(page);
  assert.deepEqual([s.elec.e1.x, s.elec.e1.y, s.elec.e1.rot, s.nodes.a.x, s.nodes.a.y, s.items.i1.rot], [250, 50, 90, 350, -50, 90]);
  assert.equal(s.rooms[0][1], 'Séjour'); assert.equal(s.n.op, 1);
  await page.click('#btnUndo'); await wait(page, 200);
  /* hauteur de pose et circuit (les appareils incompatibles sont laissés tels quels) */
  await page.fill('#f-mh', '120'); await page.keyboard.press('Enter'); await wait(page, 150);
  s = await etat(page); assert.deepEqual([s.elec.e1.h, s.elec.e2.h, s.elec.e3.h, s.elec.e4.h], [120, 120, 120, 30]);
  await page.selectOption('#f-mcirc', 'c1'); await wait(page, 150);
  s = await etat(page); assert.deepEqual([s.elec.e1.cid, s.elec.e2.cid, s.elec.e3.cid], ['c1', 'c1', null], 'le point lumineux ne va pas sur un circuit de prises');
  /* copier vers l'étage, au même endroit : murs, porte, appareils, conduit raccordé aux copies, nom de la pièce */
  await page.locator('#insp .chip', { hasText: 'Étage' }).click(); await wait(page, 250);
  s = await etat(page);
  assert.deepEqual(s.n, { elec: 7, items: 2, walls: 8, op: 2, texts: 2, dims: 2, ducts: 2, links: 0 });
  const copies = Object.values(s.elec).filter((e) => e.lv === 'L1');
  assert.deepEqual(copies.map((e) => [e.x, e.y]).sort(), [[100, 100], [200, 200], [300, 100]].sort());
  const g2 = Object.values(s.ducts).find((d) => d.lv === 'L1'); assert.ok(copies.some((e) => e.id === g2.a) && copies.some((e) => e.id === g2.b), 'conduit raccordé aux appareils copiés');
  assert.ok(s.rooms.some((r) => r[0] === 'L1' && r[1] === 'Séjour'), 'nom de la pièce copié');
  assert.equal(s.multi.length, 11, 'la sélection reste sur le niveau affiché');
  await page.click('#btnUndo'); await wait(page, 200); assert.equal((await etat(page)).n.walls, 4);
  /* dupliquer ici : copies décalées, sélectionnées à la place des originaux */
  await page.getByRole('button', { name: 'Dupliquer ici' }).click(); await wait(page, 250);
  s = await etat(page); assert.equal(s.n.elec, 7); assert.equal(s.n.walls >= 8, true); assert.ok(!s.multi.includes('elec:e1') && s.multi.filter((k) => k.startsWith('elec:')).length === 3);
  await page.click('#btnUndo'); await wait(page, 200);
  /* supprimer : confirmation, puis Annuler fait tout revenir */
  await rectangle(page, -60, -60, 460, 360);
  await page.locator('#insp >> text=/Supprimer les 11 objets/').click(); await page.locator('#insp >> text=Confirmer la suppression').click(); await wait(page, 250);
  s = await etat(page); assert.deepEqual(s.n, { elec: 1, items: 0, walls: 0, op: 0, texts: 0, dims: 0, ducts: 0, links: 0 });
  await page.click('#btnUndo'); await wait(page, 200);
  s = await etat(page); assert.deepEqual(s.n, { elec: 4, items: 1, walls: 4, op: 1, texts: 1, dims: 1, ducts: 1, links: 0 }); assert.equal(s.rooms[0][1], 'Séjour');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('groupe sur iPad : rectangle au doigt, panneau en portrait par « Actions… »', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 820, height: 1180 }, touch: true });
  await seedPlan(ctx, plan()); await boot(page);
  await page.click('.tool[data-tool="multi"]');
  const a = await aEcran(page, -60, -60), b = await aEcran(page, 460, 360);
  const cdp = await ctx.newCDPSession(page);
  const t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  await t('touchStart', a.x, a.y); for (let i = 1; i <= 6; i++) await t('touchMove', a.x + (b.x - a.x) * i / 6, a.y + (b.y - a.y) * i / 6); await t('touchEnd');
  await wait(page, 250);
  const s = await etat(page); assert.equal(s.multi.length, 11);
  /* portrait : le panneau des actions s'ouvre par le bouton du bandeau, et se referme */
  assert.equal(await page.getByRole('button', { name: 'Tourner de 90°' }).isVisible(), false);
  await page.locator('#hint >> text=Actions du groupe').click(); await wait(page, 200);
  assert.ok(await page.getByRole('button', { name: 'Tourner de 90°' }).isVisible());
  await page.locator('#hint >> text=Fermer les actions').click(); await wait(page, 200);
  assert.equal(await page.getByRole('button', { name: 'Tourner de 90°' }).isVisible(), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('puissance souscrite : tous les paliers visibles sans défilement (triphasé jusqu’à 36 kVA), paysage et portrait', async () => {
  for (const viewport of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
    const { ctx, page, errors } = await fresh({ viewport });
    await boot(page); // plan d'exemple : triphasé 36 kVA
    await page.click('.vtab[data-view="elec"]'); await wait(page, 300);
    await page.click('.ev-inst'); await wait(page, 300);
    const r = await page.evaluate(() => {
      const sec = [...document.querySelectorAll('.ev-edit .sec')].find((s) => /Puissance souscrite/.test(s.textContent));
      const box = sec.getBoundingClientRect(), boutons = [...sec.querySelectorAll('button')];
      return { n: boutons.map((b) => b.textContent), choisi: boutons.filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.textContent), dedans: boutons.every((b) => { const q = b.getBoundingClientRect(); return q.left >= box.left - 1 && q.right <= box.right + 1; }) };
    });
    assert.deepEqual(r.n, ['6 kVA', '9 kVA', '12 kVA', '15 kVA', '18 kVA', '24 kVA', '30 kVA', '36 kVA'], `${viewport.width}`);
    assert.deepEqual(r.choisi, ['36 kVA']); assert.ok(r.dedans, `tous visibles sans défiler (${viewport.width} × ${viewport.height})`);
    await page.locator('.ev-edit button:has-text("24 kVA")').click(); await wait(page, 200);
    assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.install.kva), 24);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

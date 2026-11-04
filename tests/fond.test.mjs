// Tests de la phase 2 : fond de plan (image ou PDF) : import, mise à l'échelle, transparence, migration v3 → v4.
// Lancer depuis la racine du dépôt :  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, fresh, wait, boot, seedPlan, storedPlan } from './outils.mjs';

const FC = await import(path.join(ROOT, 'js', 'fondcalc.js'));

test('fond de plan : calculs d’échelle, de rotation et de longueur', () => {
  const f = { wpx: 1200, hpx: 800, s: 0.5, cx: 0, cy: 0, rot: 0 };
  /* deux points à 250 cm l'un de l'autre sur le plan, longueur réelle 500 cm : l'image double, A reste en place */
  const A = { x: -100, y: 0 }, B = { x: 150, y: 0 };
  const n = FC.calibrate(f, A, B, 500);
  assert.equal(n.s, 1); assert.equal(n.cal, true);
  assert.deepEqual([n.cx, n.cy], [100, 0], 'le point A ne bouge pas');
  assert.equal(FC.calibrate(f, A, A, 500), null, 'points confondus refusés');
  assert.deepEqual(FC.fondSize(n), { w: 1200, h: 800 });
  assert.deepEqual(FC.fondSize(FC.rotate90(n, 1)), { w: 800, h: 1200 });
  assert.equal(FC.rotate90(FC.rotate90(n, -1), 1).rot, 0);
  /* PDF imprimé au 1:100, rendu à 4 pixels par point : 1 pt = 0,03528 cm × 100 */
  assert.ok(Math.abs(FC.pdfScale(100, 4) - (2.54 / 72) * 100 / 4) < 1e-12);
  for (const [t, v] of [['350', 350], ['3,50 m', 350], ['3.5m', 350], ['35 mm', 3.5], ['12,5 cm', 12.5], ['', null], ['abc', null], ['-3', null]]) assert.equal(FC.parseLength(t), v, t);
  assert.deepEqual(FC.renderSize(8000, 2000, 4096, 1), { w: 4096, h: 1024, k: 0.512 });
  assert.equal(FC.renderSize(600, 800, 4096, 4).k, 4, 'un PDF est rendu plus fin');
});

/* image d'un plan de test dessinée dans la page : cadre de 1000 px de large, trait épais */
async function planImage(page) {
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 800;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 1200, 800);
    x.strokeStyle = '#000'; x.lineWidth = 24; x.strokeRect(100, 100, 1000, 600);
    return c.toDataURL('image/png').split(',')[1];
  });
  return { name: 'plan-existant.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') };
}
const fond = (page) => page.evaluate(async () => { const { P } = await import('./js/noyau.js'); return P.fonds[0] ? Object.assign({}, P.fonds[0], { imgLen: (P.fondImg[P.fonds[0].img] || '').length }) : null; });
const toScreen = (page, p) => page.evaluate(async (p) => { const { V } = await import('./js/rendu2d.js'); const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.x + V.ox + p.x * V.s, y: r.y + V.oy + p.y * V.s }; }, p);
/* point de l'image (pixels) → point du plan (cm) */
const imgToWorld = (f, px, py) => ({ x: f.cx + (px - f.wpx / 2) * f.s, y: f.cy + (py - f.hpx / 2) * f.s });

test('fond de plan dans l’application : import, échelle par 2 points, opacité, retrait et annulation', async () => {
  for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
    const { ctx, page, errors } = await fresh({ viewport: vp, touch: true });
    await boot(page);
    await page.evaluate(async () => (await import('./js/stockage.js')).newPlan()); await wait(page, 600);
    await page.evaluate(async () => { const { ui } = await import('./js/noyau.js'); (await import('./js/interface.js')).setTool('select'); ui.inspOpen = true; (await import('./js/interface.js')).renderInspector(); });
    await wait(page, 200);
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('button:has-text("Importer un fond de plan")')]);
    await chooser.setFiles(await planImage(page)); await wait(page, 800);
    assert.match(await page.textContent('#modal'), /Fond de plan importé/);
    let f = await fond(page);
    assert.deepEqual([f.wpx, f.hpx, f.op, f.cal, f.name], [1200, 800, 0.5, false, 'plan-existant.png']);
    assert.ok(f.imgLen > 1000, 'image enregistrée dans le plan');
    /* le fond est dessiné : le cadre noir apparaît en gris (50 %) sous le dessin */
    const pix = async (p) => { const s = await toScreen(page, p); return page.evaluate(({ x, y }) => { const cv = document.getElementById('cv'), r = cv.getBoundingClientRect(), k = cv.width / r.width; return Array.from(cv.getContext('2d').getImageData(Math.round((x - r.x) * k), Math.round((y - r.y) * k), 1, 1).data); }, s); };
    const onLine = await pix(imgToWorld(f, 600, 100)), inside = await pix(imgToWorld(f, 600, 400));
    assert.ok(onLine[0] < 170 && onLine[0] > 60, 'trait du fond visible à 50 % : ' + onLine);
    assert.ok(inside[0] > 200, 'intérieur clair : ' + inside);
    /* mise à l'échelle : les deux coins du cadre sont à 10 m l'un de l'autre */
    await page.click('#modal button:has-text("Mettre à l’échelle par 2 points")'); await wait(page, 200);
    assert.match(await page.textContent('#hint'), /premier point/);
    const A = imgToWorld(f, 100, 100), B = imgToWorld(f, 1100, 100);
    const sa = await toScreen(page, A), sb = await toScreen(page, B);
    await page.mouse.click(sa.x, sa.y); await wait(page, 150);
    assert.match(await page.textContent('#hint'), /second point/);
    await page.mouse.click(sb.x, sb.y); await wait(page, 200);
    await page.fill('#f-caldist', '10 m'); await page.click('#modal button:has-text("Appliquer")'); await wait(page, 300);
    f = await fond(page);
    assert.ok(Math.abs(f.s - 1) < 0.02, '1 pixel = 1 cm (à la précision du toucher près) : ' + f.s);
    assert.equal(f.cal, true);
    const A2 = imgToWorld(f, 100, 100);
    assert.ok(Math.hypot(A2.x - A.x, A2.y - A.y) < 3, 'le premier point reste en place');
    /* opacité */
    await page.evaluate(() => { const r = document.getElementById('f-fondop'); r.value = '30'; r.dispatchEvent(new Event('input')); r.dispatchEvent(new Event('change')); });
    await wait(page, 1400);
    const id = await page.evaluate(async () => (await import('./js/noyau.js')).P.id);
    const st = await storedPlan(page, id);
    assert.ok(st.v >= 4);
    assert.equal(st.fonds[0].op, 0.3);
    assert.ok(st.fondImg[st.fonds[0].img].startsWith('data:image/jpeg'));
    /* le fond n'est pas exporté : le module de dessin l'ignore pour les exports */
    const drawn = await page.evaluate(async () => {
      const { EXT, P } = await import('./js/noyau.js'); let n = 0;
      const c = { drawImage: () => n++, translate() {}, rotate() {}, set globalAlpha(v) {}, set imageSmoothingEnabled(v) {}, set imageSmoothingQuality(v) {} };
      for (const f of EXT.under) { f(c, P.fonds[0].lv, { export: true }); }
      const a = n; for (const f of EXT.under) f(c, P.fonds[0].lv, {}); return [a, n];
    });
    assert.deepEqual(drawn, [0, 1], 'dessiné à l’écran, jamais dans un export');
    /* retrait puis annulation */
    await page.evaluate(async () => { const { ui } = await import('./js/noyau.js'); ui.sel = null; ui.inspOpen = true; (await import('./js/interface.js')).renderInspector(); });
    const rm = page.locator('button:has-text("Retirer")'); await rm.click(); await page.locator('button:has-text("Confirmer ?")').click(); await wait(page, 200);
    assert.equal(await fond(page), null);
    await page.evaluate(async () => (await import('./js/interaction.js')).undo()); await wait(page, 200);
    assert.equal((await fond(page)).op, 0.3, 'Annuler rend le fond');
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('PDF illisible par le navigateur : explication claire, rien n’est modifié', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const n0 = await page.evaluate(async () => (await import('./js/noyau.js')).P.fonds.length);
  /* Chromium (environnement de test) n'affiche pas un PDF comme image ; Safari sur iPad le fait */
  const ok = await page.evaluate(async () => {
    const pdf = new File(['%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF'], 'plan.pdf', { type: 'application/pdf' });
    return (await import('./js/fond.js')).importFond(pdf);
  });
  await wait(page, 200);
  assert.equal(ok, false, 'Chromium refuse le PDF');
  assert.match(await page.textContent('#modal'), /première page est importée/);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.fonds.length), n0, 'plan inchangé');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('migration v3 → v4 : ancien plan sans fond ouvert sans changement, fond conservé après redémarrage', async () => {
  const plan = { v: 3, id: 'pV3', name: 'Plan v3', levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }],
    nodes: [], walls: [], openings: [], items: [], elec: [{ id: 'e1', lv: 'L0', type: 'pc_ip', x: 0, y: 0, rot: 0, h: 30, comp: 'cp1', mark: 'IP' }],
    rooms: [], dims: [], texts: [], links: [], ducts: [], circuits: [], rcds: [], install: { kva: 9, parafoudre: false, row: 13 },
    comps: [{ id: 'cp1', kind: 'elec', n: 'Prise IP', base: 'pc_ip', rang: 'electricite', desc: '', at: 1, h: 30, mark: 'IP' }] };
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, plan);
  await boot(page);
  const m = await page.evaluate((p) => import('./js/stockage.js').then((S) => S.migratePlan(JSON.parse(JSON.stringify(p)))), plan);
  assert.equal(m.from, 3); assert.ok(m.plan.v >= 4);
  assert.deepEqual([m.plan.fonds, m.plan.fondImg], [[], {}]);
  assert.deepEqual(m.plan.comps, plan.comps, 'données v3 conservées'); assert.equal(m.plan.elec[0].mark, 'IP');
  const bad = await page.evaluate((p) => import('./js/stockage.js').then((S) => S.migratePlan(Object.assign(JSON.parse(JSON.stringify(p)), { fonds: [{ lv: 'L0' }, null] })).plan.fonds), plan);
  assert.deepEqual(bad, [], 'fond invalide retiré');
  /* un fond ajouté reste après redémarrage */
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 40; c.height = 20;
    const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
    await (await import('./js/fond.js')).importFond(new File([blob], 'petit.png', { type: 'image/png' }));
  });
  await page.evaluate(async () => (await import('./js/interface.js')).closeModal());
  await wait(page, 1400);
  await page.reload(); await wait(page, 1200);
  const f = await fond(page);
  assert.equal(f.name, 'petit.png'); assert.ok(f.imgLen > 100);
  assert.doesNotMatch(await page.textContent('#toast'), /À vérifier/, 'aucun problème d’intégrité');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Outil « Mesurer » (js/mesure.js) : longueurs, total, surface ; rien n'est ajouté au plan, sauf « Transformer en cotes ».
// Lancer :  node --test tests/mesure.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, wait } from './outils.mjs';

test('mesurer : tronçons, total, contour fermé et surface ; le plan ne change pas ; transformer en cotes', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const calc = await page.evaluate(async () => {
    const { mesureCalc } = await import('./js/mesure.js');
    const r = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }];
    return [mesureCalc(r, false), mesureCalc(r, true), mesureCalc(r.slice(0, 2), true)];
  });
  assert.deepEqual(calc[0], { troncons: [400, 300, 400], total: 1100, aire: null });
  assert.deepEqual(calc[1], { troncons: [400, 300, 400, 300], total: 1400, aire: 120000 });
  assert.deepEqual(calc[2], { troncons: [400], total: 400, aire: null });
  /* plan vide ; mesure à la souris d'un rectangle de 4 m × 3 m */
  const u0 = await page.evaluate(async () => { const N = await import('./js/noyau.js'), St = await import('./js/stockage.js'), H = await import('./js/historique.js'), R = await import('./js/rendu2d.js'), I = await import('./js/interaction.js');
    St.openPlan(N.blankPlan('Mesure'), 'pM', { quiet: true }); R.V.s = 1; R.V.ox = 100; R.V.oy = 300; I.requestRender(); return { u: H.H.u.length, plan: JSON.stringify(N.P) }; });
  await page.keyboard.press('u');
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).ui.tool), 'mesure');
  const b = await page.$eval('#cv', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  const clic = async (x, y) => { await page.mouse.click(b.x + 100 + x, b.y + 300 + y); await wait(page, 80); }; // sous le bandeau d'aide
  await clic(0, 0); await clic(400, 0);
  assert.match(await page.$eval('#mesureMsg', (e) => e.textContent), /^Total 4(,00)? m$|^Total 400 cm$/);
  await clic(400, 300); await clic(0, 300);
  assert.match(await page.$eval('#mesureMsg', (e) => e.textContent.replace(/\s/g, ' ')), /^Total 11(,00)? m \(3 tronçons\)$/);
  await clic(1, 1); // le premier point : contour fermé
  assert.match(await page.$eval('#mesureMsg', (e) => e.textContent.replace(/\s/g, ' ')), /^Total 14(,00)? m \(4 tronçons\) · surface 12,00 m²$/);
  const pendant = await page.evaluate(async () => { const N = await import('./js/noyau.js'), H = await import('./js/historique.js'); return { u: H.H.u.length, plan: JSON.stringify(N.P) }; });
  assert.equal(pendant.u, u0.u); assert.equal(pendant.plan, u0.plan, 'mesurer ne modifie pas le plan');
  /* transformer en cotes : 4 cotes, une étape d'annulation */
  await page.click('#hint >> text=Transformer en cotes'); await wait(page, 200);
  const r = await page.evaluate(async () => { const N = await import('./js/noyau.js'), H = await import('./js/historique.js'); return { dims: N.P.dims.map((d) => Math.round(Math.hypot(d.bx - d.ax, d.by - d.ay))), u: H.H.u.length }; });
  assert.deepEqual(r.dims, [400, 300, 400, 300]); assert.equal(r.u, u0.u + 1);
  /* Échap : retour à la sélection */
  await page.keyboard.press('Escape'); assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).ui.tool), 'select');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('barre d’outils : tous les outils visibles sans défilement sur iPad (paysage 1180 × 820, 1024 × 768, portrait)', async () => {
  for (const viewport of [{ width: 1180, height: 820 }, { width: 1024, height: 768 }, { width: 820, height: 1180 }]) {
    const { ctx, page, errors } = await fresh({ viewport });
    await boot(page);
    const r = await page.$eval('#toolbar', (e) => ({ deborde: e.scrollHeight > e.clientHeight + 1, n: e.querySelectorAll('.tool').length, mesure: !!e.querySelector('[data-tool="mesure"]') }));
    assert.deepEqual(r, { deborde: false, n: 15, mesure: true }, `${viewport.width} × ${viewport.height}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

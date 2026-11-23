// Confort sur ordinateur (23 novembre 2026, demande de l'utilisateur) : barres de défilement du plan, menu du clic droit,
// clic droit + glisser, molette « faire défiler », raccourcis + − 0 ? Ctrl S, panneau de droite redimensionnable.
// Lancer :  node --test tests/pc.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, wait } from './outils.mjs';

async function exemple(page) {
  await page.evaluate(async () => { const St = await import('./js/stockage.js'), E = await import('./js/exemple.js'); St.openPlan(E.samplePlan(), 'pPC', { quiet: true, example: true }); });
  await wait(page, 300);
}
const vue = (page) => page.evaluate(async () => { const R = await import('./js/rendu2d.js'); return { s: R.V.s, ox: R.V.ox, oy: R.V.oy }; });

test('calcul des barres : taille et position du curseur', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 1366, height: 768 } });
  await boot(page);
  const r = await page.evaluate(async () => {
    const M = await import('./js/pc.js');
    return {
      centre: M.calculBarre(0, 100, 0, 100, 200),      // contenu = vue : marge d'une demi-vue de chaque côté
      gauche: M.calculBarre(-50, 50, 0, 100, 200),     // vue au bord gauche de l'étendue
      vide: M.calculBarre(0, 100, null, null, 200),    // sans contenu : la barre est pleine
    };
  });
  assert.equal(r.centre.ew, 200); assert.equal(r.centre.taille, 100); assert.equal(r.centre.pos, 50);
  assert.equal(r.gauche.pos, 0);
  assert.equal(r.vide.plein, true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('barres de défilement : glisser le curseur déplace le plan, cliquer dans la barre avance d’une page', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 1366, height: 768 } });
  await boot(page);
  await exemple(page);
  assert.equal(await page.evaluate(() => document.getElementById('stage').classList.contains('barres')), true, 'barres affichées avec une souris');
  const th = await page.locator('.sbar.h .sthumb').boundingBox();
  const v0 = await vue(page);
  await page.mouse.move(th.x + th.width / 2, th.y + 4); await page.mouse.down();
  await page.mouse.move(th.x + th.width / 2 + 120, th.y + 4, { steps: 6 }); await page.mouse.up();
  await wait(page, 100);
  const v1 = await vue(page), th1 = await page.locator('.sbar.h .sthumb').boundingBox();
  assert.ok(v1.ox < v0.ox - 50, 'le plan part à gauche quand le curseur va à droite');
  assert.ok(Math.abs(th1.x - th.x - 120) < 3, 'le curseur suit la souris : ' + (th1.x - th.x));
  assert.equal(v1.s, v0.s, 'pas de zoom');
  /* clic dans la barre verticale, sous le curseur : une page vers le bas */
  const bv = await page.locator('.sbar.v').boundingBox(), tv = await page.locator('.sbar.v .sthumb').boundingBox();
  const yClic = tv.y + tv.height + 8 < bv.y + bv.height ? tv.y + tv.height + 6 : tv.y - 6;
  await page.mouse.click(bv.x + 6, yClic); await wait(page, 100);
  const v2 = await vue(page);
  assert.notEqual(v2.oy, v1.oy, 'une page de défilement');
  /* réglage « Jamais » : barres masquées */
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'); N.S.barres = 'non'; I.requestRender(); });
  await wait(page, 100);
  assert.equal(await page.evaluate(() => document.getElementById('stage').classList.contains('barres')), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('clic droit : menu de l’objet et de la vue ; clic droit + glisser déplace le plan sans menu', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 1366, height: 768 } });
  await boot(page);
  await exemple(page);
  /* un appareil électrique du niveau, à l'écran */
  const sp = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), R = await import('./js/rendu2d.js');
    const r = document.getElementById('cv').getBoundingClientRect();
    const dedans = (x) => { const sx = x.x * R.V.s + R.V.ox, sy = x.y * R.V.s + R.V.oy; return sx > 80 && sy > 80 && sx < r.width - 80 && sy < r.height - 80; };
    const e = N.P.elec.find((x) => x.lv === N.ui.lv && dedans(x) && !N.P.elec.some((y) => y !== x && y.lv === x.lv && Math.hypot(y.x - x.x, y.y - x.y) < 60));
    return { x: r.left + e.x * R.V.s + R.V.ox, y: r.top + e.y * R.V.s + R.V.oy, id: e.id };
  });
  await page.mouse.click(sp.x, sp.y, { button: 'right' }); await wait(page, 150);
  const txt = await page.locator('.ctxmenu').innerText();
  assert.match(txt, /Supprimer/); assert.match(txt, /Dupliquer/); assert.match(txt, /Recadrer le plan/);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).ui.sel?.t), 'elec', 'l’objet sous la souris est sélectionné');
  const n0 = await page.evaluate(async () => (await import('./js/noyau.js')).P.elec.length);
  await page.locator('.ctxmenu button', { hasText: 'Dupliquer' }).click(); await wait(page, 150);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.elec.length), n0 + 1, 'dupliqué');
  assert.equal(await page.locator('.ctxmenu').count(), 0, 'menu fermé après le choix');
  /* clic droit + glisser : déplacement, pas de menu */
  const v0 = await vue(page);
  await page.mouse.move(500, 400); await page.mouse.down({ button: 'right' });
  await page.mouse.move(600, 440, { steps: 6 }); await page.mouse.up({ button: 'right' });
  await wait(page, 100);
  const v1 = await vue(page);
  assert.ok(Math.abs(v1.ox - v0.ox - 100) < 2 && Math.abs(v1.oy - v0.oy - 40) < 2, 'plan déplacé de (100, 40)');
  assert.equal(await page.locator('.ctxmenu').count(), 0);
  /* Échap ferme le menu */
  await page.mouse.click(500, 300, { button: 'right' }); await wait(page, 100);
  assert.equal(await page.locator('.ctxmenu').count(), 1);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.ctxmenu').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('molette « Faire défiler » et raccourcis + − 0', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 1366, height: 768 } });
  await boot(page);
  await exemple(page);
  await page.mouse.move(500, 400);
  let v0 = await vue(page);
  await page.mouse.wheel(0, 100); await wait(page, 100);
  let v1 = await vue(page);
  assert.ok(v1.s < v0.s, 'par défaut, la molette zoome (comme avant)');
  await page.evaluate(async () => { (await import('./js/noyau.js')).S.molette = 'defiler'; });
  v0 = await vue(page);
  await page.mouse.wheel(0, 100); await wait(page, 100);
  v1 = await vue(page);
  assert.equal(v1.s, v0.s); assert.ok(v1.oy < v0.oy, 'réglage « Faire défiler » : le plan monte');
  await page.locator('#cv').focus();
  await page.keyboard.press('+'); await wait(page, 60);
  assert.ok((await vue(page)).s > v1.s, '+ zoome');
  await page.keyboard.press('-'); await page.keyboard.press('-'); await wait(page, 60);
  assert.ok((await vue(page)).s < v1.s, '− dézoome');
  await page.keyboard.press('0'); await wait(page, 60);
  await page.keyboard.press('?'); await wait(page, 100);
  assert.match(await page.locator('#modal').innerText(), /À la souris/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('panneau de droite : glisser son bord l’élargit (réglage gardé), double-clic : largeur d’origine', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 1366, height: 768 } });
  await boot(page);
  const larg = () => page.evaluate(() => Math.round(document.getElementById('insp').getBoundingClientRect().width));
  const w0 = await larg();
  const pg = await page.locator('.insp-poignee').boundingBox();
  assert.ok(pg, 'poignée visible sur grand écran');
  await page.mouse.move(pg.x + 4, pg.y + 300); await page.mouse.down();
  await page.mouse.move(pg.x - 120, pg.y + 300, { steps: 6 }); await page.mouse.up();
  const w1 = await larg();
  assert.ok(Math.abs(w1 - w0 - 124) < 4, `panneau élargi : ${w0} → ${w1}`);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('calque.settings')).largeurPanneau), w1);
  await page.locator('.insp-poignee').dblclick();
  assert.equal(await larg(), w0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('iPad (1180 × 820, écran tactile) : poignée présente en paysage, rien en portrait', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 820, height: 1180 }, touch: true });
  await boot(page);
  assert.equal(await page.locator('.insp-poignee').isVisible(), false, 'pas de poignée quand le panneau flotte');
  assert.deepEqual(errors, []);
  await ctx.close();
});

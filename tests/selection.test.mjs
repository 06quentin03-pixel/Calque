// Outil Sélection « toucher 2 fois pour choisir » et plan allégé (24 novembre 2026).
// Lancer :  node --test tests/selection.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, wait, canvasBox } from './outils.mjs';

/* ouvre le plan d'exemple et renvoie la position à l'écran d'une prise du rez-de-chaussée, loin des autres symboles */
async function ouvrirExemple(page) {
  await page.evaluate(async () => { await (await import('./js/stockage.js')).openSample(); });
  await wait(page, 900);
  await page.keyboard.press('Escape');
  return page.evaluate(async () => {
    const N = await import('./js/noyau.js'), R = await import('./js/rendu2d.js'), I = await import('./js/interaction.js');
    N.ui.sel = null;
    /* vue rapprochée : les symboles sont bien séparés */
    R.V.s = 1.2;
    const e = N.P.elec.find((x) => x.lv === N.ui.lv && x.type === 'pc' && N.P.elec.every((y) => y === x || y.lv !== x.lv || Math.hypot(y.x - x.x, y.y - x.y) > 60));
    R.V.ox = 500 - e.x * R.V.s; R.V.oy = 380 - e.y * R.V.s; I.requestRender();
    return { id: e.id, x: e.x, y: e.y };
  });
}
const etat = (page, id) => page.evaluate(async (id) => {
  const N = await import('./js/noyau.js'), R = await import('./js/rendu2d.js');
  const e = N.P.elec.find((x) => x.id === id);
  return { sel: N.ui.sel, x: e.x, y: e.y, ox: R.V.ox, oy: R.V.oy };
}, id);
const ecran = (page, p) => page.evaluate(async (p) => { const R = await import('./js/rendu2d.js'); return { x: p.x * R.V.s + R.V.ox, y: p.y * R.V.s + R.V.oy }; }, p);

test('souris : un clic ne choisit pas, glisser déplace le plan, un double-clic choisit, ensuite glisser déplace l’objet', async () => {
  const { ctx, page, errors } = await fresh({ selection: true });
  await boot(page);
  const e = await ouvrirExemple(page);
  const box = await canvasBox(page);
  let s = await ecran(page, e);
  // un clic : rien n'est choisi
  await page.mouse.click(box.x + s.x, box.y + s.y); await wait(page, 600);
  let r = await etat(page, e.id);
  assert.equal(r.sel, null, 'un seul clic ne choisit pas l’objet');
  // glisser depuis l'objet : le plan bouge, pas l'objet
  await page.mouse.move(box.x + s.x, box.y + s.y); await page.mouse.down();
  await page.mouse.move(box.x + s.x + 60, box.y + s.y + 30, { steps: 6 }); await page.mouse.up(); await wait(page, 200);
  const r2 = await etat(page, e.id);
  assert.equal(r2.x, e.x); assert.equal(r2.y, e.y);
  assert.ok(Math.abs(r2.ox - r.ox - 60) < 2 && Math.abs(r2.oy - r.oy - 30) < 2, 'la vue s’est déplacée');
  assert.equal(r2.sel, null);
  // double-clic : l'objet est choisi
  s = await ecran(page, e);
  await page.mouse.dblclick(box.x + s.x, box.y + s.y); await wait(page, 200);
  r = await etat(page, e.id);
  assert.deepEqual(r.sel, { t: 'elec', id: e.id });
  // choisi : glisser le déplace
  await page.mouse.move(box.x + s.x, box.y + s.y); await page.mouse.down();
  await page.mouse.move(box.x + s.x + 50, box.y + s.y, { steps: 6 }); await page.mouse.up(); await wait(page, 200);
  r = await etat(page, e.id);
  assert.ok(Math.abs(r.x - e.x) > 10, 'l’objet choisi suit la souris');
  // clic dans le vide : plus rien n'est choisi
  await page.mouse.click(box.x + 30, box.y + box.h - 120); await wait(page, 150);
  assert.equal((await etat(page, e.id)).sel, null);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('iPad (doigt) : un toucher ne choisit pas, deux touchers rapprochés choisissent ; réglage « Toucher 1 fois » comme avant', async () => {
  const { ctx, page, errors } = await fresh({ selection: true, touch: true, mobile: false });
  await boot(page);
  const e = await ouvrirExemple(page);
  const box = await canvasBox(page);
  const s = await ecran(page, e);
  await page.touchscreen.tap(box.x + s.x, box.y + s.y); await wait(page, 700);
  assert.equal((await etat(page, e.id)).sel, null, 'un seul toucher ne choisit pas');
  await page.touchscreen.tap(box.x + s.x, box.y + s.y); await wait(page, 120);
  await page.touchscreen.tap(box.x + s.x, box.y + s.y); await wait(page, 200);
  assert.deepEqual((await etat(page, e.id)).sel, { t: 'elec', id: e.id }, 'deux touchers choisissent');
  // l'astuce est affichée au plus 3 fois
  const n = await page.evaluate(async () => (await import('./js/noyau.js')).S.astuceSel);
  assert.ok(n >= 1 && n <= 3);
  // réglage dans Affichage : « Toucher 1 fois »
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); N.S.selection = 'simple'; N.ui.sel = null; });
  await page.touchscreen.tap(box.x + s.x, box.y + s.y); await wait(page, 200);
  assert.deepEqual((await etat(page, e.id)).sel, { t: 'elec', id: e.id }, 'réglage « Toucher 1 fois » : un toucher choisit');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('réglages dans Affichage et aide : « Choisir un objet » et « Plan allégé »', async () => {
  const { ctx, page, errors } = await fresh({ selection: true });
  await boot(page);
  await page.evaluate(async () => { (await import('./js/interface.js')).renderViewPop(); });
  const txt = await page.$eval('#viewPop', (e) => e.textContent);
  assert.match(txt, /Choisir un objet/); assert.match(txt, /Toucher 2 fois/); assert.match(txt, /Plan allégé/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('plan allégé : vue éloignée du plan d’exemple, noms des pièces sans chevauchement, symboles plus petits, exports inchangés', async () => {
  const { ctx, page, errors } = await fresh({ selection: true });
  await boot(page);
  await ouvrirExemple(page);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), R = await import('./js/rendu2d.js'), I = await import('./js/interaction.js'), Sy = await import('./js/symboles.js');
    I.fitView(); R.setRC(I.SCR); Object.assign(I.SCR, { s: R.V.s, ox: R.V.ox, oy: R.V.oy, px: 1 / R.V.s }); R.drawScene(N.ui.lv);
    const loin = R.dernieresEtiquettes(), sLoin = R.V.s;
    const tailleLoin = Sy.elecSize({ px: 1 / sLoin, ecran: true }), tailleExport = Sy.elecSize({ px: 1 / sLoin });
    const prochePx = Sy.elecSize({ px: 1 / 1.5, ecran: true }) * 1.5;
    N.S.lisible = false; R.drawScene(N.ui.lv); const sans = R.dernieresEtiquettes(); N.S.lisible = true;
    return { loin, sans, sLoin, tailleLoin: tailleLoin * sLoin, tailleExport: tailleExport * sLoin, prochePx };
  });
  // vue d'ensemble : chaque texte réservé a sa place, aucun ne chevauche un autre
  const b = r.loin.boites;
  for (let i = 0; i < b.length; i++) for (let j = i + 1; j < b.length; j++) {
    const o = b[i], q = b[j];
    assert.ok(!(o.x0 < q.x1 - 0.01 && o.x1 > q.x0 + 0.01 && o.y0 < q.y1 - 0.01 && o.y1 > q.y0 + 0.01), 'deux textes se chevauchent');
  }
  assert.ok(r.loin.noms > 0 && r.loin.noms <= r.loin.pieces);
  assert.equal(r.sans, null, 'réglage désactivé : tout est dessiné comme avant');
  // symboles : plus petits en vue éloignée à l'écran, jamais sous 12 px ; exports inchangés (20 px minimum)
  assert.ok(r.sLoin < 0.5);
  assert.ok(r.tailleLoin >= 11.99 && r.tailleLoin < 20, `taille à l’écran ${r.tailleLoin}`);
  assert.ok(Math.abs(r.tailleExport - 20) < 0.01 || r.tailleExport > 20);
  assert.ok(r.prochePx >= 30 * 1.5 - 0.01, 'vue rapprochée : taille réelle (30 cm)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

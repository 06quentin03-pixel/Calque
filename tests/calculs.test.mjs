// Demande de l'utilisateur (14 novembre 2026) : onglet « Calculs » qui explique chaque calcul de Calque et sa formule.
// Lancer :  node --test tests/calculs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fresh, boot, wait, ROOT } from './outils.mjs';

const imp = (f) => import(path.join(ROOT, 'js', f));

test('sans écran : chaque fiche est complète et son exemple vient des moteurs de Calque', async () => {
  const F = await imp('formules.js'), C = await imp('calcul.js'), N = await imp('normes.js'), T = await imp('thermique.js');
  assert.ok(F.FORMULES.length >= 20);
  const ids = new Set();
  for (const x of F.FORMULES) {
    assert.ok(!ids.has(x.id), 'identifiant unique ' + x.id); ids.add(x.id);
    assert.ok(F.FAMILLES.some((f) => f.id === x.fam), x.id + ' : famille');
    for (const k of ['titre', 'but', 'formule', 'donnees']) assert.ok(typeof x[k] === 'string' && x[k].length > 10, `${x.id} : ${k}`);
    assert.ok(x.vars.length >= 1 && x.vars.every((v) => v.length === 3), x.id + ' : lettres');
    const r = F.calculer(x);
    assert.ok(!r.erreur, x.id + ' : ' + r.erreur);
    assert.ok((r.res && r.res.length) || (r.etapes && r.etapes.length), x.id + ' : résultat');
    for (const [, v] of r.res || []) assert.ok(!/NaN|undefined|—/.test(v), `${x.id} : ${v}`);
  }
  for (const f of F.FAMILLES) assert.ok(F.FORMULES.some((x) => x.fam === f.id), 'famille vide : ' + f.id);
  const fiche = (id) => F.FORMULES.find((x) => x.id === id);
  /* l'exemple affiché est celui du moteur */
  assert.deepEqual(F.calculer(fiche('ib_mono')).res, [['IB', '16 A']]);
  const ib = C.courantMono(3680, 230, 1), cu = C.chuteTension({ b: 2, rho: N.CONSTANTES.rho_cu.v, L: 20, S: 2.5, cos: 1, lambda: N.CONSTANTES.lambda.v, I: ib, U0: 230 });
  assert.equal(F.calculer(fiche('chute')).res[1][1], new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(cu.pct) + ' %');
  const u = T.uParoi([{ m: 'laine_verre', e: 10, l: T.LAMBDA.laine_verre.l }, { m: 'parpaing', e: 20 }], 'h', 'ext');
  assert.equal(F.calculer(fiche('u')).res[1][1], new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 3 }).format(u.u) + ' W/m²·K');
  /* valeurs saisies : le résultat change ; valeur hors limites : message, pas de calcul */
  assert.deepEqual(F.calculer(fiche('ib_mono'), { P: 2300 }).res, [['IB', '10 A']]);
  assert.match(F.calculer(fiche('ib_mono'), { cos: 0 }).erreur, /cos φ/);
  assert.deepEqual(F.calculer(fiche('ib_in'), { P: 6000, In: 20 }).res[0][1], 'Non conforme : le disjoncteur déclencherait');
});

test('écran : onglet « Calculs » (fiches, essai, recherche, familles), en paysage et sur téléphone', async () => {
  for (const vp of [{ width: 1180, height: 820 }, { width: 390, height: 844 }]) {
    const { ctx, page, errors } = await fresh({ viewport: vp });
    await boot(page);
    await page.evaluate(async () => { const S = await import('./js/stockage.js'); await S.openSample(); });
    await wait(page, 500);
    await page.click('.vtab[data-view="calculs"]'); await wait(page, 300);
    const n = await page.evaluate(async () => (await import('./js/formules.js')).FORMULES.length);
    assert.equal(await page.locator('#calculsView article.cf').count(), n);
    assert.equal(await page.locator('#main').isVisible(), false);
    assert.equal(await page.locator('#levels').isVisible(), false);
    /* essayer : 2 300 W → 10 A */
    await page.fill('#cf-ib_mono-P', '2300'); await wait(page, 100);
    assert.match(await page.locator('#cf-ib_mono .cf-res').innerText(), /10 A/);
    await page.locator('#cf-ib_mono button', { hasText: 'Revenir à l’exemple' }).click(); await wait(page, 100);
    assert.match(await page.locator('#cf-ib_mono .cf-res').innerText(), /16 A/);
    /* choix à boutons : triphasé */
    await page.locator('#cf-chute .seg button', { hasText: 'Triphasé' }).click(); await wait(page, 100);
    assert.match(await page.locator('#cf-chute .cf-etapes').innerText(), /ΔU = 1 ×/);
    /* recherche et familles */
    await page.fill('#cf-q', 'lumens'); await wait(page, 150);
    assert.equal(await page.locator('#calculsView article.cf').count(), 1);
    await page.fill('#cf-q', ''); await wait(page, 150);
    await page.locator('#calculsView .chip', { hasText: 'Thermique (déperditions)' }).click(); await wait(page, 150);
    assert.equal(await page.locator('#calculsView article.cf').count(), await page.evaluate(async () => (await import('./js/formules.js')).FORMULES.filter((x) => x.fam === 'thermique').length));
    /* pas de défilement horizontal de la page */
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    /* retour au plan */
    await page.click('.vtab[data-view="plan"]'); await wait(page, 200);
    assert.equal(await page.locator('#calculsView').isVisible(), false); assert.equal(await page.locator('#main').isVisible(), true);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

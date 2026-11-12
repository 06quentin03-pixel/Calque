// Rappel de la sauvegarde complète : décision sans écran (js/sauvegarde.js) et bandeau (js/rappelui.js).
// Lancer :  node --test tests/sauvegarde.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JOUR, etatSauvegarde, libelleDerniere } from '../js/sauvegarde.js';
import { fresh, boot, seedPlan, wait } from './outils.mjs';

test('rappel : jamais sauvegardé, sauvegarde récente, ancienne, reportée ; rien à sauvegarder', () => {
  const now = 1_800_000_000_000, p = (j) => ({ savedAt: now - j * JOUR });
  let e = etatSauvegarde({ derniere: 0, report: 0, plans: [p(0.1), p(3)], maintenant: now });
  assert.deepEqual([e.rappel, e.modifies, e.jamais], [true, 2, true]); assert.match(e.texte, /^Aucune sauvegarde complète : 2 plans ne sont enregistrés que sur cet appareil\.$/);
  assert.equal(etatSauvegarde({ derniere: 0, report: 0, plans: [], maintenant: now }).rappel, false, 'aucun plan : pas de rappel');
  /* sauvegarde de 3 jours, plans modifiés depuis : trop tôt pour rappeler */
  assert.equal(etatSauvegarde({ derniere: now - 3 * JOUR, report: 0, plans: [p(1)], maintenant: now }).rappel, false);
  /* sauvegarde de 8 jours, 1 plan modifié depuis, 1 non */
  e = etatSauvegarde({ derniere: now - 8 * JOUR, report: 0, plans: [p(1), p(20)], maintenant: now });
  assert.deepEqual([e.rappel, e.modifies, e.age], [true, 1, 8]); assert.match(e.texte, /il y a 8 jours : 1 plan modifié depuis/);
  /* ancienne, mais rien n'a changé depuis : pas de rappel */
  assert.equal(etatSauvegarde({ derniere: now - 30 * JOUR, report: 0, plans: [p(40)], maintenant: now }).rappel, false);
  /* « Plus tard » : reporté */
  assert.equal(etatSauvegarde({ derniere: 0, report: now + JOUR, plans: [p(1)], maintenant: now }).rappel, false);
  assert.equal(etatSauvegarde({ derniere: 0, report: now - 1, plans: [p(1)], maintenant: now }).rappel, true);
  assert.deepEqual([libelleDerniere(0, now), libelleDerniere(now - 3600e3, now), libelleDerniere(now - 1.5 * JOUR, now), libelleDerniere(now - 9 * JOUR, now)], ['jamais faite', 'faite aujourd’hui', 'faite hier', 'il y a 9 jours']);
});

test('bandeau : « Plus tard », puis sauvegarde complète enregistrée ; date gardée, menu à jour, nouveau rappel 8 jours après', async () => {
  const { ctx, page, errors } = await fresh({ rappel: true });
  await seedPlan(ctx, { v: 11, id: 'pS', name: 'Plan à sauvegarder', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }], nodes: [], walls: [], openings: [], items: [], elec: [], rooms: [], dims: [], texts: [], circuits: [], rcds: [], links: [], ducts: [], install: { kva: 9 }, doc: { revisions: [] } });
  await boot(page);
  await page.evaluate(async () => { await (await import('./js/stockage.js')).saveNow(); });
  const verifier = () => page.evaluate(async () => { const R = await import('./js/rappelui.js'), X = await import('./js/export.js'); const e = await R.verifierSauvegarde(X.exportAll); return e && e.rappel; });
  assert.equal(await verifier(), true);
  assert.match(await page.$eval('#sauvBar', (e) => e.textContent), /Aucune sauvegarde complète : 1 plan n’est enregistré que sur cet appareil\. Gardez une copie dans Fichiers\./);
  await page.click('#sauvBar >> text=Plus tard'); assert.equal(await page.$('#sauvBar'), null);
  assert.equal(await verifier(), false, 'reporté de 3 jours');
  assert.ok(JSON.parse(await page.evaluate(() => localStorage.getItem('calque.sauvegarde'))).report > Date.now() + 2.9 * 864e5);
  /* menu : « jamais faite », puis sauvegarde complète enregistrée */
  await page.click('#btnMenu'); assert.ok(await page.locator('#menuPop >> text=Sauvegarder tous mes plans (jamais faite)').isVisible());
  await page.click('#menuPop >> text=Sauvegarder tous mes plans');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal >> text=Enregistrer')]);
  assert.match(dl.suggestedFilename(), /^calque-sauvegarde-.*\.calque\.json$/);
  await wait(page, 200);
  const st = await page.evaluate(async () => { const N = await import('./js/stockage.js'); const r = await N.DB.get('meta', 'sauvegarde'); return { idb: r && r.v, ls: JSON.parse(localStorage.getItem('calque.sauvegarde')) }; });
  assert.ok(Date.now() - st.idb.derniere < 60e3 && st.idb.report === 0 && st.ls.derniere === st.idb.derniere, 'date enregistrée dans IndexedDB et localStorage');
  await page.click('#btnMenu'); assert.ok(await page.locator('#menuPop >> text=Sauvegarder tous mes plans (faite aujourd’hui)').isVisible()); await page.keyboard.press('Escape');
  assert.equal(await verifier(), false);
  /* 8 jours plus tard, le plan a changé depuis : nouveau rappel */
  await page.evaluate(async () => {
    const v = { derniere: Date.now() - 8 * 864e5, report: 0 }; localStorage.setItem('calque.sauvegarde', JSON.stringify(v));
    const S = await import('./js/stockage.js'); await S.DB.tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put({ k: 'sauvegarde', v }); });
    const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'); N.P.name = 'Plan modifié'; I.commit(); await S.saveNow();
  });
  assert.equal(await verifier(), true); assert.match(await page.$eval('#sauvBar', (e) => e.textContent), /il y a 8 jours : 1 plan modifié depuis/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('bandeau seulement dans la vue Plan, et jamais pendant les autres tests', async () => {
  const { ctx, page, errors } = await fresh({ rappel: true });
  await seedPlan(ctx, { v: 11, id: 'pS2', name: 'Plan', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }], nodes: [], walls: [], openings: [], items: [], elec: [], rooms: [], dims: [], texts: [], circuits: [], rcds: [], links: [], ducts: [], install: { kva: 9 }, doc: { revisions: [] } });
  await boot(page);
  await page.evaluate(async () => { await (await import('./js/stockage.js')).saveNow(); });
  await page.click('text=Tableau électrique');
  const r = await page.evaluate(async () => { const R = await import('./js/rappelui.js'); return R.verifierSauvegarde(() => { }); });
  assert.equal(r, null); assert.equal(await page.$('#sauvBar'), null, 'pas de bandeau sur le tableau');
  /* les autres tests : rappel reporté par tests/outils.mjs */
  const autre = await fresh(); await boot(autre.page);
  assert.ok(JSON.parse(await autre.page.evaluate(() => localStorage.getItem('calque.sauvegarde'))).report > Date.now());
  await autre.ctx.close();
  assert.deepEqual(errors, []);
  await ctx.close();
});


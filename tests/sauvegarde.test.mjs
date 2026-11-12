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


test('sauvegarde complète assemblée par morceaux : JSON valide, mêmes photos qu’avant, plusieurs photos', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), St = await import('./js/stockage.js'), Ph = await import('./js/photos.js');
    St.openPlan(N.blankPlan('Trois photos'), 'p3', { quiet: true });
    const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200; const c = cv.getContext('2d');
    for (let i = 0; i < 3; i++) { c.fillStyle = ['#c33', '#3c3', '#33c'][i]; c.fillRect(0, 0, 320, 200); const b = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9)); await Ph.enregistrerPhoto('f' + i, 'p3', new File([b], 'p.jpg', { type: 'image/jpeg' })); N.P.chantier.photos.push({ id: 'f' + i, lv: 'L0', x: 0, y: 0, at: 1 }); }
    await St.saveNow();
  });
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.evaluate(async () => { (await import('./js/export.js')).exportAll(); }); await page.waitForSelector('#modal >> text=Enregistrer'); await page.click('#modal >> text=Enregistrer'); })()]);
  const fs = await import('node:fs');
  const o = JSON.parse(fs.readFileSync(await dl.path(), 'utf8'));
  const attendu = await page.evaluate(async () => (await import('./js/photos.js')).exporterPhotos());
  assert.equal(o.format, 'calque-backup'); assert.equal(o.plans.length, 1); assert.ok(o.biblio);
  assert.deepEqual(o.photos.map((x) => x.id).sort(), ['f0', 'f1', 'f2']);
  assert.deepEqual(o.photos, attendu, 'photos identiques à l’ancienne méthode');
  assert.match(await page.$eval('#toast', (e) => e.textContent), /enregistré/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('import d’une sauvegarde complète lue par morceaux : plans et photos retrouvés sur un autre appareil ; fichier abîmé refusé', async () => {
  const { lireSauvegarde } = await import('../js/lecture.js');
  /* lecteur seul (Node) : tranches minuscules, textes piégeux, même résultat que JSON.parse */
  const o = { format: 'calque-backup', version: 1, plans: [{ id: 'p', plan: { name: 'Séjour « x » \\ "y" 😀', chantier: { photos: [{ id: 'photos":[' }] } } }], biblio: {}, photos: [{ id: 'a', data: 'QUJD' }, { id: 'b', data: 'REVG', m: [{ k: 1 }] }] };
  const lots = []; const r = await lireSauvegarde(new Blob([JSON.stringify(o)]), async (l) => { lots.push(...l); }, { tranche: 5 });
  assert.deepEqual(r.tete, Object.assign({}, o, { photos: [] })); assert.deepEqual(lots, o.photos); assert.equal(r.photos, 2);
  await assert.rejects(lireSauvegarde(new Blob([JSON.stringify(o).slice(0, -5)]), async () => { }));
  /* appareil A : 3 photos, sauvegarde ; appareil B : import */
  const A = await fresh(); await boot(A.page);
  await A.page.evaluate(async () => {
    const N = await import('./js/noyau.js'), St = await import('./js/stockage.js'), Ph = await import('./js/photos.js');
    St.openPlan(N.blankPlan('Plan avec photos'), 'pA', { quiet: true });
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 120; const c = cv.getContext('2d');
    for (let i = 0; i < 3; i++) { c.fillStyle = ['#c33', '#3c3', '#33c'][i]; c.fillRect(0, 0, 200, 120); const b = await new Promise((r) => cv.toBlob(r, 'image/jpeg', 0.9)); await Ph.enregistrerPhoto('g' + i, 'pA', new File([b], 'p.jpg', { type: 'image/jpeg' })); N.P.chantier.photos.push({ id: 'g' + i, lv: 'L0', x: 0, y: 0, at: 1 }); }
    await St.saveNow();
  });
  const [dl] = await Promise.all([A.page.waitForEvent('download'), (async () => { await A.page.evaluate(async () => { (await import('./js/export.js')).exportAll(); }); await A.page.waitForSelector('#modal >> text=Enregistrer'); await A.page.click('#modal >> text=Enregistrer'); })()]);
  const fichier = await dl.path(); const fs = await import('node:fs'), contenu = fs.readFileSync(fichier);
  await A.ctx.close();
  const B = await fresh(); await boot(B.page);
  await B.page.setInputFiles('#fileIn', { name: 'sauvegarde.calque.json', mimeType: 'application/json', buffer: contenu });
  await B.page.waitForFunction(() => /Sauvegarde importée/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
  const res = await B.page.evaluate(async () => { const St = await import('./js/stockage.js'), Ph = await import('./js/photos.js'); const l = await St.listProjects(); const ph = []; for (const id of ['g0', 'g1', 'g2']) { const r = await Ph.lirePhoto(id); ph.push(r && r.w); } return { plans: l.map((x) => x.name), ph, toast: document.getElementById('toast').textContent }; });
  assert.ok(res.plans.includes('Plan avec photos')); assert.deepEqual(res.ph, [200, 200, 200]); assert.match(res.toast, /3 photos ajoutées.*1 plan ajouté/);
  /* fichier tronqué : refusé, aucun plan ajouté */
  await B.page.setInputFiles('#fileIn', { name: 'abime.calque.json', mimeType: 'application/json', buffer: contenu.subarray(0, contenu.length - 50) });
  await B.page.waitForFunction(() => /illisible/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
  assert.deepEqual(B.errors, []);
  await B.ctx.close();
});


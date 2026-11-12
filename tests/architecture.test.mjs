// Tests de la phase 1b : modules natifs, événements du plan, hors ligne, avis de mise à jour.
// Lancer depuis la racine du dépôt :  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, env, fresh, wait, boot } from './outils.mjs';

test('chaque module de js/ est mis en cache par le Service Worker (hors ligne)', () => {
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const core = sw.slice(sw.indexOf('const CORE'), sw.indexOf('];', sw.indexOf('const CORE')));
  for (const f of fs.readdirSync(path.join(ROOT, 'js')).filter((n) => n.endsWith('.js'))) assert.ok(core.includes(`'./js/${f}'`), `${f} dans CORE`);
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(html.includes('<script type="module" src="js/main.js"></script>'), 'index.html charge le module d’entrée');
  assert.ok(!/<script>\s*\(\(\) => \{/.test(html), 'plus de gros script intégré dans index.html');
});

test('modules sans accès à l’écran : utilisables directement par Node', async () => {
  for (const m of ['noyau', 'geometrie', 'mutations', 'historique', 'symboles', 'evenements', 'elecdonnees', 'normes', 'calcul']) await import(path.join(ROOT, 'js', m + '.js'));
  const N = await import(path.join(ROOT, 'js', 'noyau.js'));
  assert.equal(N.polyArea([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }]), 120000);
  assert.ok(N.inPoly({ x: 10, y: 10 }, [{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 20 }, { x: 0, y: 20 }]));
  const p = N.normalizePlan({ name: 'x', walls: 'abîmé' });
  assert.deepEqual(p.walls, [], 'liste abîmée remplacée par une liste vide');
});

test('événements : abonnement, désabonnement, erreur d’un abonné sans conséquence', async () => {
  const E = await import(path.join(ROOT, 'js', 'evenements.js'));
  const recu = [];
  const stop = E.on(E.EV.PLAN_CHANGE, (d) => recu.push(d.cause));
  E.on(E.EV.PLAN_CHANGE, () => { throw new Error('abonné défaillant (erreur attendue dans ce test)'); });
  const err = console.error; console.error = () => { };
  try { E.emit(E.EV.PLAN_CHANGE, { cause: 'modification' }); stop(); E.emit(E.EV.PLAN_CHANGE, { cause: 'annuler' }); } finally { console.error = err; }
  assert.deepEqual(recu, ['modification']);
});

test('événements du plan dans l’application : ouverture, modification, annuler, rétablir', async () => {
  const { ctx, page, errors } = await fresh();
  await page.addInitScript(() => {
    window.__ev = [];
    import('/js/evenements.js').then((E) => { E.on(E.EV.PLAN_CHANGE, (d) => window.__ev.push(d.cause)); E.on(E.EV.PLAN_OUVERT, () => window.__ev.push('ouvert')); });
  });
  await boot(page);
  await page.click('#btnMenu'); await page.click('#menuPop button:has-text("Nouveau plan")'); await wait(page);
  const b = await page.$eval('#cv', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await page.click('.tool[data-tool="room"]');
  await page.mouse.move(b.x + 200, b.y + 200); await page.mouse.down(); await page.mouse.move(b.x + 380, b.y + 340, { steps: 6 }); await page.mouse.up(); await wait(page, 300);
  await page.click('#btnUndo'); await page.click('#btnRedo'); await wait(page, 200);
  const ev = await page.evaluate(() => window.__ev);
  assert.deepEqual(ev.slice(-4), ['ouvert', 'modification', 'annuler', 'rétablir']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('hors ligne : l’application redémarre sans réseau grâce au Service Worker', async () => {
  const ctx = await env.browser.newContext({ viewport: { width: 1180, height: 820 } });
  const page = await ctx.newPage(); const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(env.base);
  await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active) && !!navigator.serviceWorker.controller; }, null, { timeout: 15000 }).catch(() => page.reload());
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  await page.waitForFunction(async () => { const c = await caches.open((await caches.keys())[0]); return (await c.keys()).some((r) => r.url.endsWith('/js/vue3d.js')); }, null, { timeout: 15000 });
  await ctx.setOffline(true);
  await page.reload(); await page.waitForFunction(() => document.getElementById('projName').textContent.length > 0, null, { timeout: 15000 });
  await wait(page, 800);
  assert.equal(await page.textContent('#projName'), 'Exemple : maison et atelier');
  await page.click('.vtab[data-view="3d"]'); await wait(page, 800);
  /* modules chargés à la demande (menu) : servis par le cache, sans réseau */
  await page.click('.vtab[data-view="plan"]'); await wait(page, 300);
  await page.click('#btnMenu'); await page.click('#menuPop >> text=Assistant : où en est mon projet ?');
  await page.waitForSelector('.as-etape', { timeout: 10000 });
  await page.keyboard.press('Escape');
  const hl = await page.evaluate(async () => { const m = await import('./js/ifcui.js'); const i = await import('./js/ifcimport.js'); return typeof m.importIfc === 'function' && typeof i.lireIfc === 'function'; });
  assert.ok(hl, 'import IFC disponible hors ligne');
  /* outils récents : Groupe, Mesurer, quantitatif, équipement */
  await page.keyboard.press('u'); assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).ui.tool), 'mesure');
  await page.click('.vtab[data-view="elec"]'); await page.click('#evBar >> text=Quantitatif'); await page.waitForSelector('#qtRoot');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('avis « nouvelle version disponible » : bandeau avec Recharger et Plus tard', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(() => import('/js/miseajour.js').then((m) => m.showUpdate()));
  await page.waitForSelector('#updBar');
  assert.match(await page.textContent('#updBar'), /nouvelle version/);
  assert.equal(await page.locator('#updBar button').count(), 2);
  await page.click('#updBar button:has-text("Plus tard")');
  assert.equal(await page.locator('#updBar').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

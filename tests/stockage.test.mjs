// Tests de l'enregistrement des plans (phase 1a).
// Lancer depuis la racine du dépôt :  node --test tests/
// Nécessite Playwright avec Chromium (préinstallé dans l'environnement de développement).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
let server, base, browser;

before(async () => {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}/index.html`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

async function fresh() {
  const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, acceptDownloads: true, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}
const wait = (page, ms = 400) => page.waitForTimeout(ms);
async function boot(page) { await page.goto(base); await page.waitForFunction(() => document.getElementById('projName').textContent.length > 0); await wait(page, 600); }
async function menu(page, label) { await page.click('#btnMenu'); await page.click(`#menuPop button:has-text("${label}")`); await wait(page); }
async function drawRoom(page, x, y, w = 180, hgt = 140) {
  await page.click('.tool[data-tool="room"]');
  const b = await page.$eval('#cv', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await page.mouse.move(b.x + x, b.y + y); await page.mouse.down();
  await page.mouse.move(b.x + x + w, b.y + y + hgt, { steps: 8 }); await page.mouse.up();
  await wait(page, 1400); // délai d'enregistrement automatique (900 ms)
}
const saveText = (page) => page.textContent('#saveTxt');
/* lecture directe de la base IndexedDB */
function idb(page, store, key) {
  return page.evaluate(([store, key]) => new Promise((res, rej) => {
    const r = indexedDB.open('calque');
    r.onsuccess = () => { const t = r.result.transaction(store).objectStore(store); const q = key == null ? t.getAll() : t.get(key); q.onsuccess = () => { res(q.result); r.result.close(); }; q.onerror = () => rej(q.error); };
    r.onerror = () => rej(r.error);
  }), [store, key ?? null]);
}
const curId = (page) => page.evaluate(() => localStorage.getItem('calque.cur'));
async function newPlanWithRoom(page) { await menu(page, 'Nouveau plan'); await drawRoom(page, 200, 200); return curId(page); }

test('un plan de l’ancien stockage (localStorage) est repris sans être effacé', async () => {
  const { ctx, page, errors } = await fresh();
  const old = { v: 1, name: 'Ancien plan', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }],
    nodes: [{ id: 'n1', lv: 'L0', x: 0, y: 0 }, { id: 'n2', lv: 'L0', x: 400, y: 0 }], walls: [{ id: 'w1', lv: 'L0', a: 'n1', b: 'n2', th: 20 }],
    openings: [], items: [], elec: [], rooms: [], dims: [], texts: [], circuits: [], rcds: [], links: [], ducts: [], install: { kva: 9, parafoudre: false, row: 13 }, id: 'pOLD1' };
  await page.addInitScript((o) => {
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem('calque.p.pOLD1', JSON.stringify(o));
      localStorage.setItem('calque.idx', JSON.stringify([{ id: 'pOLD1', name: 'Ancien plan', savedAt: 1700000000000 }]));
      localStorage.setItem('calque.cur', 'pOLD1');
      sessionStorage.setItem('seeded', '1');
    }
  }, old);
  await boot(page);
  assert.equal(await page.textContent('#projName'), 'Ancien plan');
  const meta = await idb(page, 'plans', 'pOLD1');
  assert.ok(meta, 'le plan doit être copié dans IndexedDB');
  const data = await idb(page, 'data', 'pOLD1');
  assert.equal(JSON.parse(data.json).walls.length, 1);
  assert.ok(await page.evaluate(() => localStorage.getItem('calque.p.pOLD1')), 'la copie localStorage doit rester intacte');
  const vers = await idb(page, 'versions');
  assert.ok(vers.some((v) => v.pid === 'pOLD1' && /Copie de sécurité/.test(v.why)), 'une copie de sécurité doit être créée');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('l’enregistrement est vérifié et survit au rechargement', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const id = await newPlanWithRoom(page);
  assert.equal(await saveText(page), 'Enregistré sur cet appareil');
  const data = await idb(page, 'data', id);
  assert.equal(JSON.parse(data.json).walls.length, 4);
  await page.reload(); await boot(page);
  assert.equal(await curId(page), id);
  assert.equal(await page.textContent('#projName'), 'Nouveau plan');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('stockage plein : « Non enregistré » et alerte, jamais un faux « Enregistré »', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await newPlanWithRoom(page);
  // simule un appareil plein : IndexedDB refuse l'écriture et localStorage est saturé
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...a) { if (this.name === 'data') throw new DOMException('plein', 'QuotaExceededError'); return put.apply(this, a); };
    Storage.prototype.setItem = function () { throw new DOMException('plein', 'QuotaExceededError'); };
  });
  await drawRoom(page, 500, 200);
  assert.equal(await saveText(page), 'Non enregistré');
  assert.equal(await page.$eval('#modal', (m) => !m.hidden), true);
  assert.match(await page.textContent('#modal'), /Enregistrement impossible/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('envoyer puis réimporter un plan donne le même plan', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await newPlanWithRoom(page);
  await menu(page, 'Envoyer le fichier du plan');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal button:has-text("Enregistrer")')]);
  assert.match(dl.suggestedFilename(), /\.calque\.json$/);
  const file = path.join(os.tmpdir(), 'calque-test-' + Date.now() + '.calque.json');
  await dl.saveAs(file);
  const exported = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(exported.format, 'calque-plan');
  const before = await curId(page);
  await page.setInputFiles('#fileIn', file); await wait(page, 1500);
  const after = await curId(page);
  assert.notEqual(after, before, 'l’import crée un nouveau plan, sans écraser');
  assert.equal(JSON.parse((await idb(page, 'data', after)).json).walls.length, 4);
  assert.ok(await idb(page, 'data', before), 'le plan d’origine existe toujours');
  fs.unlinkSync(file);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('sauvegarde complète : restauration après suppression, sans doublon ni écrasement', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const a = await newPlanWithRoom(page);
  const b = await newPlanWithRoom(page);
  await menu(page, 'Sauvegarder tous mes plans');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal button:has-text("Enregistrer")')]);
  const file = path.join(os.tmpdir(), 'calque-backup-' + Date.now() + '.calque.json');
  await dl.saveAs(file);
  const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(bk.format, 'calque-backup');
  assert.deepEqual(bk.plans.map((p) => p.id).sort(), [a, b].sort());
  // suppression du plan a depuis « Mes plans »
  await page.click('#btnProj'); await wait(page);
  const del = page.locator('#modal .proj-li', { hasNotText: 'Ouvert' }).locator('button.danger').first();
  await del.click(); await del.click(); await wait(page, 800);
  assert.equal(await idb(page, 'plans', a), undefined);
  await page.click('#modal button[aria-label="Fermer"]');
  // réimport : le plan a revient, le plan b (identique) n'est pas dupliqué
  await page.setInputFiles('#fileIn', file); await wait(page, 1500);
  assert.match(await page.textContent('#toast'), /1 plan ajouté.*1 déjà à jour/);
  const ids = (await idb(page, 'plans')).map((p) => p.id).sort();
  assert.deepEqual(ids, [a, b].sort());
  fs.unlinkSync(file);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('historique : restaurer une version, et récupérer un plan supprimé', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const id = await newPlanWithRoom(page);
  await menu(page, 'Historique des versions');
  await page.click('#modal button:has-text("Enregistrer une version maintenant")'); await wait(page, 600);
  await page.click('#modal button[aria-label="Fermer"]');
  await drawRoom(page, 500, 200);
  assert.equal(JSON.parse((await idb(page, 'data', id)).json).walls.length, 8);
  await menu(page, 'Historique des versions');
  const row = page.locator('#modal .proj-li', { hasText: 'Manuelle' }).first();
  await row.locator('button:has-text("Restaurer")').click();
  await row.locator('button:has-text("Confirmer")').click();
  await wait(page, 1500);
  assert.equal(await curId(page), id, 'la restauration garde le même plan');
  assert.equal(JSON.parse((await idb(page, 'data', id)).json).walls.length, 4);
  assert.ok((await idb(page, 'versions')).some((v) => v.pid === id && v.why === 'Avant restauration'));
  // suppression puis récupération
  await page.click('#btnProj'); await wait(page);
  const del = page.locator('#modal .proj-li[aria-current="true"] button.danger');
  await del.click(); await del.click(); await wait(page, 1000);
  await wait(page, 600); // la liste « Mes plans » se réaffiche d’elle-même après la suppression
  assert.match(await page.textContent('#modal'), /Plans supprimés récemment/);
  await page.click('#modal button:has-text("Récupérer")'); await wait(page, 1500);
  assert.equal(await curId(page), id);
  assert.equal(JSON.parse((await idb(page, 'data', id)).json).walls.length, 4);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('une copie abîmée est détectée : la copie valide la plus récente est ouverte', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const id = await newPlanWithRoom(page);
  // abîme le contenu dans IndexedDB et supprime la copie de secours localStorage
  await page.evaluate((id) => new Promise((res) => {
    const r = indexedDB.open('calque');
    r.onsuccess = () => { const t = r.result.transaction('data', 'readwrite'); t.objectStore('data').put({ id, json: '{"cassé' }); t.oncomplete = () => { r.result.close(); res(); }; };
  }), id);
  await page.evaluate((id) => localStorage.removeItem('calque.p.' + id), id);
  await page.reload(); await boot(page);
  assert.equal(await curId(page), id);
  assert.match(await page.textContent('#toast'), /abîmée/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Outils communs aux tests : serveur local, navigateur Chromium, plan de test de grande taille.
import { before, after } from 'node:test';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png' };
export const env = { base: '', browser: null };
let server;

before(async () => {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  env.base = `http://127.0.0.1:${server.address().port}/index.html`;
  env.browser = await chromium.launch();
});
after(async () => { await env.browser?.close(); server?.close(); });

export async function fresh(opts = {}) {
  const ctx = await env.browser.newContext({ viewport: opts.viewport || { width: 1180, height: 820 }, acceptDownloads: true, serviceWorkers: 'block', hasTouch: !!opts.touch, isMobile: !!opts.mobile });
  /* polices d'internet bloquées : rendu identique d'une page à l'autre (sinon la police arrive parfois en cours de test) */
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page, errors };
}
export const wait = (page, ms = 400) => page.waitForTimeout(ms);
export async function boot(page, query = '') {
  await page.goto(env.base + query);
  await page.waitForFunction(() => document.getElementById('projName').textContent.length > 0);
  await wait(page, 600);
}
/* place un plan dans l'ancien stockage avant le démarrage : l'application le reprend et l'ouvre */
export async function seedPlan(ctx, plan) {
  await ctx.addInitScript((o) => {
    if (!localStorage.getItem('calque.p.' + o.id)) {
      localStorage.setItem('calque.p.' + o.id, JSON.stringify(o));
      localStorage.setItem('calque.idx', JSON.stringify([{ id: o.id, name: o.name, savedAt: 1 }]));
      localStorage.setItem('calque.cur', o.id);
    }
  }, plan);
}
/* lecture directe de la base IndexedDB */
export function idb(page, store, key) {
  return page.evaluate(([store, key]) => new Promise((res, rej) => {
    const r = indexedDB.open('calque');
    r.onsuccess = () => { const t = r.result.transaction(store).objectStore(store); const q = key == null ? t.getAll() : t.get(key); q.onsuccess = () => { res(q.result); r.result.close(); }; q.onerror = () => rej(q.error); };
    r.onerror = () => rej(r.error);
  }), [store, key ?? null]);
}
/* contenu enregistré d'un plan (IndexedDB, magasin « data ») */
export async function storedPlan(page, id) {
  const r = await idb(page, 'data', id);
  if (!r) return null;
  const j = typeof r === 'string' ? r : r.json || r.plan || r;
  return typeof j === 'string' ? JSON.parse(j) : j;
}
export async function canvasBox(page) {
  return page.$eval('#cv', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
}

/* plan de test : une grille de n × n logements (murs, cloisons, porte, fenêtre, mobilier,
   symboles électriques, liaison, conduit, cote, texte), pour vérifier le rendu des gros plans */
export function bigPlan(n = 5, id = 'pBIG') {
  const P = { v: 1, id, name: 'Gros plan de test', levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }],
    nodes: [], walls: [], openings: [], items: [], elec: [], rooms: [], dims: [], texts: [],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 16, sec: 1.5, rcd: 'r1', dda: false, ctrl: null }],
    rcds: [{ id: 'r1', type: 'AC', cal: 40 }], links: [], ducts: [], install: { kva: 9, parafoudre: false, row: 13 } };
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const k = `_${i}_${j}`, x = i * 900, y = j * 800;
    const N = (nm, px, py) => { P.nodes.push({ id: nm + k, lv: 'L0', x: x + px, y: y + py }); return nm + k; };
    const a = N('a', 0, 0), b = N('b', 600, 0), c = N('c', 600, 500), d = N('d', 0, 500), e = N('e', 300, 0), f = N('f', 300, 500);
    const W = (nm, p, q, th, kind) => P.walls.push({ id: nm + k, lv: 'L0', a: p, b: q, th, kind });
    W('w1', a, e, 20, 'mur'); W('w2', e, b, 20, 'mur'); W('w3', b, c, 20, 'mur'); W('w4', c, f, 20, 'mur'); W('w5', f, d, 20, 'mur'); W('w6', d, a, 20, 'mur'); W('w7', e, f, 7, 'cloison');
    P.openings.push({ id: 'o1' + k, wall: 'w5' + k, t: 150, side: 1, w: 90, kind: 'door', type: 'interieure', leaves: 1, hinge: 0, h: 215, sill: 0 });
    P.openings.push({ id: 'o2' + k, wall: 'w1' + k, t: 150, side: 1, w: 120, kind: 'window', h: 125, sill: 95 });
    P.rooms.push({ id: 'r1' + k, lv: 'L0', name: 'Séjour', x: x + 150, y: y + 250, tint: 1 });
    P.rooms.push({ id: 'r2' + k, lv: 'L0', name: 'Chambre', x: x + 450, y: y + 250 });
    P.items.push({ id: 'i1' + k, lv: 'L0', k: 'tv', type: 'meuble_tv', name: 'Meuble TV', x: x + 32.5, y: y + 220, w: 180, d: 45, rot: 270, flip: false });
    for (let m = 0; m < 6; m++) P.elec.push({ id: `e${m}` + k, lv: 'L0', type: m % 2 ? 'pc' : 'pl', x: x + 60 + m * 90, y: y + (m % 2 ? 11 : 300), rot: 0, h: null, cid: 'c1' });
    P.links.push({ id: 'l1' + k, lv: 'L0', a: 'e1' + k, b: 'e0' + k });
    P.ducts.push({ id: 'k1' + k, lv: 'L0', sys: 'elec', mat: 'icta', a: null, b: null, dia: 20, pts: [{ x: x + 40, y: y + 40 }, { x: x + 560, y: y + 40 }, { x: x + 560, y: y + 460 }] });
    P.dims.push({ id: 'd1' + k, lv: 'L0', ax: x, ay: y + 560, bx: x + 600, by: y + 560 });
    P.texts.push({ id: 't1' + k, lv: 'L0', x: x + 300, y: y - 60, text: 'Logement ' + i + '-' + j, size: 'm', rot: 0 });
  }
  return P;
}

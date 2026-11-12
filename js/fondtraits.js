/* Calque — module « fondtraits » : accrochage aux traits d'un plan DXF importé en fond de plan.
   À l'import, fond.js transmet les traits du dessin (extrémités) et les axes des murs reconnus (dxfmurs.js) en
   coordonnées de l'image du fond (pixels) : ils suivent donc le fond quand on le déplace, le tourne ou change son
   échelle. Ils sont gardés sur l'appareil (IndexedDB, magasin « meta », clé « fondtraits:<image> »), hors du plan :
   sur un autre appareil, ou si l'enregistrement a échoué, le fond s'affiche sans accrochage (rien d'autre ne change).
   Outils Mur et Pièce : accrochage aux AXES des murs (un plan d'architecte dessine les faces ; s'accrocher à un coin de
   face décalerait le mur d'une demi-épaisseur). Autres outils (cote, mesure, conduit…) : extrémités des traits aussi.
   Module JavaScript natif (aucune compilation). */
import { DEG, EXT, P, ui } from './noyau.js';
import { DB } from './stockage.js';

const CELLULE = 64; // pixels de l'image
const CACHE = new Map(); // clé de l'image → index, null (absent), ou promesse en cours

/* index spatial : points [x, y…] et segments [x0, y0, x1, y1…] rangés par cellules */
function indexer(d) {
  const pts = new Map(), segs = new Map();
  const ajoute = (m, cx, cy, i) => { const k = cx + ',' + cy; let l = m.get(k); if (!l) m.set(k, (l = [])); l.push(i); };
  const P2 = d.points || [], A = d.axes || [];
  for (let i = 0; i < P2.length; i += 2) ajoute(pts, Math.floor(P2[i] / CELLULE), Math.floor(P2[i + 1] / CELLULE), i);
  for (let i = 0; i < A.length; i += 4) {
    const x0 = Math.floor(Math.min(A[i], A[i + 2]) / CELLULE), x1 = Math.floor(Math.max(A[i], A[i + 2]) / CELLULE);
    const y0 = Math.floor(Math.min(A[i + 1], A[i + 3]) / CELLULE), y1 = Math.floor(Math.max(A[i + 1], A[i + 3]) / CELLULE);
    if ((x1 - x0 + 1) * (y1 - y0 + 1) > 4000) continue; // segment démesuré : ignoré
    for (let cx = x0; cx <= x1; cx++) for (let cy = y0; cy <= y1; cy++) ajoute(segs, cx, cy, i);
  }
  return { points: P2, axes: A, pts, segs };
}
/* enregistre les traits d'une image de fond ; points et axes en pixels de l'image */
async function enregistrerTraits(img, points, axes) {
  const d = { points: Float32Array.from(points), axes: Float32Array.from(axes) };
  CACHE.set(img, indexer(d));
  if (DB.ok) { try { await DB.tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put({ k: 'fondtraits:' + img, v: d }); }); return true; } catch (e) { } }
  return false;
}
function charger(img) {
  if (CACHE.has(img)) { const v = CACHE.get(img); return v && !v.then ? v : null; }
  if (!DB.ok) { CACHE.set(img, null); return null; }
  const pr = DB.get('meta', 'fondtraits:' + img).then((r) => { CACHE.set(img, r && r.v ? indexer(r.v) : null); }, () => CACHE.set(img, null));
  CACHE.set(img, pr);
  return null;
}
/* repère du fond : monde (cm) ↔ pixels de l'image */
function versImage(f, p) {
  const a = -(f.rot || 0) * DEG, dx = p.x - f.cx, dy = p.y - f.cy;
  return { x: (dx * Math.cos(a) - dy * Math.sin(a)) / f.s + f.wpx / 2, y: (dx * Math.sin(a) + dy * Math.cos(a)) / f.s + f.hpx / 2 };
}
function versMonde(f, x, y) {
  const a = (f.rot || 0) * DEG, lx = (x - f.wpx / 2) * f.s, ly = (y - f.hpx / 2) * f.s;
  return { x: f.cx + lx * Math.cos(a) - ly * Math.sin(a), y: f.cy + lx * Math.sin(a) + ly * Math.cos(a) };
}
/* point accroché le plus proche (monde), ou null ; axesSeuls : outils Mur et Pièce */
function accrocher(f, I, p, tol, axesSeuls) {
  const q = versImage(f, p), t = tol / f.s, c0x = Math.floor((q.x - t) / CELLULE), c1x = Math.floor((q.x + t) / CELLULE), c0y = Math.floor((q.y - t) / CELLULE), c1y = Math.floor((q.y + t) / CELLULE);
  if ((c1x - c0x + 1) * (c1y - c0y + 1) > 900) return null; // vue très éloignée : pas d'accrochage
  let best = null, bd = t;
  const A = I.axes;
  /* 1. extrémités : des axes (tous les outils), des traits (sauf Mur et Pièce) */
  for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) {
    const k = cx + ',' + cy;
    for (const i of I.segs.get(k) || []) for (const j of [i, i + 2]) { const d = Math.hypot(A[j] - q.x, A[j + 1] - q.y); if (d < bd) { bd = d; best = { x: A[j], y: A[j + 1], kind: 'fond' }; } }
    if (!axesSeuls) for (const i of I.pts.get(k) || []) { const d = Math.hypot(I.points[i] - q.x, I.points[i + 1] - q.y); if (d < bd) { bd = d; best = { x: I.points[i], y: I.points[i + 1], kind: 'fond' }; } }
  }
  if (!best) {
    /* 2. sur un axe de mur (projection), plus près encore */
    bd = t * 0.6;
    for (let cx = c0x; cx <= c1x; cx++) for (let cy = c0y; cy <= c1y; cy++) for (const i of I.segs.get(cx + ',' + cy) || []) {
      const ax = A[i], ay = A[i + 1], bx = A[i + 2], by = A[i + 3], L2 = (bx - ax) ** 2 + (by - ay) ** 2; if (!L2) continue;
      const u = Math.max(0, Math.min(1, ((q.x - ax) * (bx - ax) + (q.y - ay) * (by - ay)) / L2));
      const x = ax + u * (bx - ax), y = ay + u * (by - ay), d = Math.hypot(x - q.x, y - q.y);
      if (d < bd) { bd = d; best = { x, y, kind: 'fondAxe' }; }
    }
  }
  if (!best) return null;
  const w = versMonde(f, best.x, best.y);
  return { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10, kind: best.kind, guides: [] };
}
/* branché dans snapPoint (interaction.js) */
EXT.snap.push((p, tol) => {
  const f = (P.fonds || []).find((x) => x.lv === ui.lv); if (!f || f.visible === false || !(f.s > 0)) return null;
  const I = charger(f.img); if (!I) return null;
  return accrocher(f, I, p, tol, ui.tool === 'wall' || ui.tool === 'room');
});

/* état pour l'inspecteur : true (actif), false (absent sur cet appareil), null (lecture en cours) */
function etatTraits(img) { const v = CACHE.get(img); if (v === undefined) { charger(img); return null; } return v && v.then ? null : !!v; }

export { accrocher, enregistrerTraits, etatTraits, indexer, versImage, versMonde };

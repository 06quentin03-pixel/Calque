/* Calque — module « itineraire » : recherche d'un itinéraire de gaine sur un niveau et détection des conflits
   (portes, fenêtres, murs, zones interdites, conduits de VMC). JavaScript pur, sans accès à l'écran : testable avec Node.
   Les conflits sont des points d'attention de Calque, pas des règles de la norme : ils ne disent jamais « conforme ». */
import { isNum } from './noyau.js';
import { hauteurParcours, isElecDuct, pointsGaine } from './cheminement.js';

/* ---------------- géométrie du niveau ---------------- */
function obstacles(plan, lv) {
  const nodes = new Map((plan.nodes || []).map((n) => [n.id, n]));
  const walls = [];
  for (const w of plan.walls || []) {
    if (w.lv !== lv) continue;
    const A = nodes.get(w.a), B = nodes.get(w.b); if (!A || !B) continue;
    const L = Math.hypot(B.x - A.x, B.y - A.y); if (L < 1) continue;
    walls.push({ w, A, B, L, d: { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, th: isNum(w.th) ? w.th : 20, ops: [] });
  }
  const byId = new Map(walls.map((x) => [x.w.id, x]));
  for (const o of plan.openings || []) { const W = byId.get(o.wall); if (W && isNum(o.t) && isNum(o.w)) W.ops.push(o); }
  const zones = (plan.zones || []).filter((z) => z.lv === lv && Array.isArray(z.pts) && z.pts.length >= 3);
  const vmc = (plan.ducts || []).filter((d) => d.lv === lv && d.sys === 'vmc' && Array.isArray(d.pts)).map((d) => ({ d, pts: pointsGaine(plan, d) }));
  return { walls, zones, vmc };
}
function inPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
/* intersection de deux segments : paramètre t sur [p, q] ou null */
function inter(p, q, a, b) {
  const r = { x: q.x - p.x, y: q.y - p.y }, s = { x: b.x - a.x, y: b.y - a.y };
  const den = r.x * s.y - r.y * s.x; if (Math.abs(den) < 1e-9) return null;
  const t = ((a.x - p.x) * s.y - (a.y - p.y) * s.x) / den, u = ((a.x - p.x) * r.y - (a.y - p.y) * r.x) / den;
  return t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6 ? { t, u } : null;
}
function distSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}
/* ouverture d'un mur à une position (cm depuis l'angle a) */
const openingAt = (W, s) => W.ops.find((o) => s >= o.t - o.w / 2 && s <= o.t + o.w / 2) || null;
const OUV_NOM = { door: 'porte', window: 'fenêtre', gap: 'passage', closet: 'placard' };

/* ---------------- conflits d'une gaine ----------------
   { sev: 'warn' (à revoir) | 'info', kind: 'porte' | 'fenetre' | 'mur' | 'cloison' | 'zone' | 'reseau', msg, p } */
function conflitsGaine(plan, d, O) {
  if (!isElecDuct(d)) return [];
  O = O || obstacles(plan, d.lv);
  const pts = pointsGaine(plan, d), zr = hauteurParcours(plan, d), out = [];
  const add = (sev, kind, msg, p) => out.push({ sev, kind, msg, p: { x: Math.round(p.x), y: Math.round(p.y) } });
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i - 1], q = pts[i];
    for (const W of O.walls) {
      const x = inter(p, q, W.A, W.B); if (!x) continue;
      const at = { x: p.x + x.t * (q.x - p.x), y: p.y + x.t * (q.y - p.y) };
      const o = openingAt(W, x.u * W.L);
      if (o && (o.kind === 'door' || o.kind === 'gap')) {
        const top = isNum(o.h) ? o.h : 215;
        if (d.pose === 'hauteur') { if (zr < top) add('warn', 'porte', `La gaine coupe le passage de la ${OUV_NOM[o.kind]} (posée à ${Math.round(zr)} cm, sous le haut de l’ouverture à ${Math.round(top)} cm).`, at); }
        else if (!d.pose) add('info', 'porte', `La gaine passe par une ${OUV_NOM[o.kind]} : précisez sa pose (sol ou plafond) pour vérifier qu’elle ne gêne pas le passage.`, at);
      } else if (o && o.kind === 'window') {
        const s0 = isNum(o.sill) ? o.sill : 90, s1 = s0 + (isNum(o.h) ? o.h : 125);
        if (d.pose === 'hauteur' && zr >= s0 && zr <= s1) add('warn', 'fenetre', `La gaine traverse la fenêtre (posée à ${Math.round(zr)} cm, fenêtre de ${Math.round(s0)} à ${Math.round(s1)} cm).`, at);
        else add('info', W.w.kind === 'cloison' ? 'cloison' : 'mur', `Traversée de mur sous ou au-dessus d’une fenêtre : percement à prévoir.`, at);
      } else if (W.w.kind === 'cloison') add('info', 'cloison', 'Traversée de cloison : percement à prévoir.', at);
      else add('info', 'mur', 'Traversée de mur : percement ou réservation à prévoir (vérifiez s’il est porteur).', at);
    }
    for (const z of O.zones) {
      let hit = inPoly(p, z.pts) || inPoly(q, z.pts) ? p : null;
      for (let k = 0; !hit && k < z.pts.length; k++) { const x = inter(p, q, z.pts[k], z.pts[(k + 1) % z.pts.length]); if (x) hit = { x: p.x + x.t * (q.x - p.x), y: p.y + x.t * (q.y - p.y) }; }
      if (hit) add('warn', 'zone', `La gaine passe dans la zone interdite${z.name ? ' « ' + z.name + ' »' : ''}.`, hit);
    }
    for (const v of O.vmc) for (let k = 1; k < v.pts.length; k++) {
      const x = inter(p, q, v.pts[k - 1], v.pts[k]); if (!x) continue;
      add('info', 'reseau', `Croisement avec un conduit de VMC Ø${v.d.dia || ''} : vérifiez la place disponible${d.pose === 'plafond' ? ' dans le plafond' : ''}.`, { x: p.x + x.t * (q.x - p.x), y: p.y + x.t * (q.y - p.y) });
    }
  }
  return out;
}
function conflitsPlan(plan) {
  const cache = new Map(), out = [];
  for (const d of plan.ducts || []) {
    if (!isElecDuct(d)) continue;
    if (!cache.has(d.lv)) cache.set(d.lv, obstacles(plan, d.lv));
    for (const c of conflitsGaine(plan, d, cache.get(d.lv))) out.push({ ...c, duct: d.id, lv: d.lv });
  }
  return out;
}

/* ---------------- recherche d'itinéraire ----------------
   Grille sur le niveau, quatre directions, coût = longueur + virages + traversées de murs ; les zones interdites
   sont infranchissables, les portes aussi pour une pose « à une hauteur donnée ». Résultat : { pts, len, murs, cloisons } ou null. */
const COUT = { virage: 40, mur: 300, cloison: 80, vmc: 4 };
class Tas {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(k, v) { const a = this.a; a.push([k, v]); let i = a.length - 1; while (i > 0) { const j = (i - 1) >> 1; if (a[j][0] <= a[i][0]) break; [a[i], a[j]] = [a[j], a[i]]; i = j; } }
  pop() {
    const a = this.a, top = a[0], last = a.pop();
    if (a.length) { a[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < a.length && a[l][0] < a[m][0]) m = l; if (r < a.length && a[r][0] < a[m][0]) m = r; if (m === i) break; [a[i], a[m]] = [a[m], a[i]]; i = m; } }
    return top;
  }
}
function chercherItineraire(plan, lv, from, to, opts = {}) {
  const O = obstacles(plan, lv), pose = opts.pose || null;
  /* emprise de la grille */
  let x0 = Math.min(from.x, to.x), y0 = Math.min(from.y, to.y), x1 = Math.max(from.x, to.x), y1 = Math.max(from.y, to.y);
  for (const W of O.walls) { x0 = Math.min(x0, W.A.x, W.B.x); y0 = Math.min(y0, W.A.y, W.B.y); x1 = Math.max(x1, W.A.x, W.B.x); y1 = Math.max(y1, W.A.y, W.B.y); }
  x0 -= 80; y0 -= 80; x1 += 80; y1 += 80;
  const area = (x1 - x0) * (y1 - y0);
  const cs = Math.max(opts.cell || 5, Math.ceil(Math.sqrt(area / 60000)));
  const nx = Math.ceil((x1 - x0) / cs) + 1, ny = Math.ceil((y1 - y0) / cs) + 1, N = nx * ny;
  const cx = (i) => x0 + i * cs, cy = (j) => y0 + j * cs;
  const extra = new Float32Array(N); // coût ajouté pour entrer dans la case (Infinity = interdite)
  const kindAt = new Uint8Array(N); // 1 mur, 2 cloison (pour compter les traversées)
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = { x: cx(i), y: cy(j) }, k = j * nx + i;
    for (const z of O.zones) {
      let bad = inPoly(p, z.pts);
      for (let m = 0; !bad && m < z.pts.length; m++) bad = distSeg(p, z.pts[m], z.pts[(m + 1) % z.pts.length]) < cs * 0.75 + 3; // marge autour de la zone
      if (bad) { extra[k] = Infinity; break; }
    }
    if (extra[k] === Infinity) continue;
    for (const W of O.walls) {
      const u = (p.x - W.A.x) * W.d.x + (p.y - W.A.y) * W.d.y, v = -(p.x - W.A.x) * W.d.y + (p.y - W.A.y) * W.d.x;
      if (u < -W.th / 2 || u > W.L + W.th / 2 || Math.abs(v) > W.th / 2 + cs * 0.5) continue;
      const o = openingAt(W, u);
      if (o && (o.kind === 'door' || o.kind === 'gap')) { if (pose === 'hauteur') { extra[k] = Infinity; break; } continue; }
      const c = W.w.kind === 'cloison' ? COUT.cloison : COUT.mur;
      if (c > extra[k]) { extra[k] = c; kindAt[k] = W.w.kind === 'cloison' ? 2 : 1; }
    }
    if (extra[k] === 0) for (const v of O.vmc) { for (let m = 1; m < v.pts.length; m++) if (distSeg(p, v.pts[m - 1], v.pts[m]) <= (v.d.dia || 125) / 20 + cs) { extra[k] = COUT.vmc; break; } if (extra[k]) break; }
  }
  const cell = (p) => ({ i: Math.max(0, Math.min(nx - 1, Math.round((p.x - x0) / cs))), j: Math.max(0, Math.min(ny - 1, Math.round((p.y - y0) / cs))) });
  const s = cell(from), g = cell(to), sk = s.j * nx + s.i, gk = g.j * nx + g.i;
  extra[sk] = 0; extra[gk] = 0;
  /* A* sur (case, direction) : la direction permet de compter les virages */
  const DIRS = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const best = new Float32Array(N * 5).fill(Infinity), prev = new Int32Array(N * 5).fill(-1);
  const H = (k) => (Math.abs((k % nx) - g.i) + Math.abs(Math.floor(k / nx) - g.j)) * cs;
  const tas = new Tas();
  const st0 = sk * 5 + 4; best[st0] = 0; tas.push(H(sk), st0);
  let fin = -1, iter = 0;
  while (tas.size && iter++ < 4e6) {
    const [f, st] = tas.pop(); const k = Math.floor(st / 5), dir = st % 5, gc = best[st];
    if (f - H(k) > gc + 1e-3) continue;
    if (k === gk) { fin = st; break; }
    const i = k % nx, j = Math.floor(k / nx);
    for (let dd = 0; dd < 4; dd++) {
      const ii = i + DIRS[dd][0], jj = j + DIRS[dd][1];
      if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
      const kk = jj * nx + ii, ex = extra[kk]; if (ex === Infinity) continue;
      if (dir !== 4 && (dd + 2) % 4 === dir) continue; // pas de demi-tour
      const nc = gc + cs + ex + (dir !== 4 && dir !== dd ? COUT.virage : 0), ns = kk * 5 + dd;
      if (nc < best[ns]) { best[ns] = nc; prev[ns] = st; tas.push(nc + H(kk), ns); }
    }
  }
  if (fin < 0) return null;
  const cells = []; for (let st = fin; st >= 0; st = prev[st]) cells.push(Math.floor(st / 5));
  cells.reverse();
  /* traversées de murs : entrées dans une suite de cases de mur */
  let murs = 0, cloisons = 0;
  for (let m = 1; m < cells.length; m++) { const a = kindAt[cells[m]], b = kindAt[cells[m - 1]]; if (a && a !== b) { if (a === 1) murs++; else cloisons++; } }
  /* coins seulement */
  const raw = cells.map((k) => ({ x: cx(k % nx), y: cy(Math.floor(k / nx)) }));
  const corners = [];
  for (let m = 1; m < raw.length - 1; m++) {
    const a = raw[m - 1], b = raw[m], c = raw[m + 1];
    if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) !== 0) corners.push(b);
  }
  const pts = [{ x: from.x, y: from.y }, ...corners, { x: to.x, y: to.y }];
  /* recale le premier et le dernier coin sur l'axe du point exact pour garder des tronçons droits */
  if (corners.length) {
    const c0 = pts[1], c1 = pts[pts.length - 2];
    if (Math.abs(c0.x - from.x) < Math.abs(c0.y - from.y)) c0.x = from.x; else c0.y = from.y;
    if (Math.abs(c1.x - to.x) < Math.abs(c1.y - to.y)) c1.x = to.x; else c1.y = to.y;
  }
  const clean = [];
  for (const p of pts) if (!clean.length || Math.hypot(p.x - clean[clean.length - 1].x, p.y - clean[clean.length - 1].y) > 0.5) clean.push({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 });
  let len = 0; for (let m = 1; m < clean.length; m++) len += Math.hypot(clean[m].x - clean[m - 1].x, clean[m].y - clean[m - 1].y);
  return { pts: clean, len, murs, cloisons, cellule: cs };
}

export { COUT, chercherItineraire, conflitsGaine, conflitsPlan, inPoly, obstacles };

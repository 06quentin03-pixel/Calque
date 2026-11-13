/* Calque — module « itineraire » : recherche d'un itinéraire de gaine sur un niveau et détection des conflits
   (portes, fenêtres, murs, zones interdites, conduits de VMC). JavaScript pur, sans accès à l'écran : testable avec Node.
   Les conflits sont des points d'attention de Calque, pas des règles de la norme : ils ne disent jamais « conforme ». */
import { isNum } from './noyau.js';
import { DERIVATIONS, poseAHauteur, TRAVERSEE, ancrage, cheminCircuit, circuitsDe, grapheGaines, hauteurParcours, isElecDuct, plusCourts, pointsGaine, tableauDu } from './cheminement.js';

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
  const gaines = (plan.ducts || []).filter((d) => d.lv === lv && isElecDuct(d) && Array.isArray(d.pts) && d.pts.length >= 2).map((d) => ({ d, pts: pointsGaine(plan, d) }));
  return { walls, zones, vmc, gaines };
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
    if (d.pose === 'cloison') {
      const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
      const dedans = O.walls.some((W) => { const u = (m.x - W.A.x) * W.d.x + (m.y - W.A.y) * W.d.y, v = -(m.x - W.A.x) * W.d.y + (m.y - W.A.y) * W.d.x; return u >= -W.th / 2 && u <= W.L + W.th / 2 && Math.abs(v) <= W.th / 2 + 30; }); // 30 cm : point de raccordement d'un appareil mural, devant le mur
      if (!dedans && Math.hypot(q.x - p.x, q.y - p.y) > 5) add('info', 'hors_cloison', 'Pose « dans la cloison » : ce tronçon n’est pas dans l’épaisseur d’un mur ou d’une cloison (vérifiez le tracé ou la pose).', m);
    }
    for (const W of O.walls) {
      const x = inter(p, q, W.A, W.B); if (!x) continue;
      const at = { x: p.x + x.t * (q.x - p.x), y: p.y + x.t * (q.y - p.y) };
      if (d.pose === 'cloison' && (x.u * W.L <= W.th / 2 + 3 || x.u * W.L >= W.L - W.th / 2 - 3)) continue; // angle de cloison : pas un percement
      const o = openingAt(W, x.u * W.L);
      if (o && (o.kind === 'door' || o.kind === 'gap')) {
        const top = isNum(o.h) ? o.h : 215;
        if (poseAHauteur(d.pose)) { if (zr < top) add('warn', 'porte', `La gaine coupe le passage de la ${OUV_NOM[o.kind]} (posée à ${Math.round(zr)} cm, sous le haut de l’ouverture à ${Math.round(top)} cm).`, at); }
        else if (!d.pose) add('info', 'porte', `La gaine passe par une ${OUV_NOM[o.kind]} : précisez sa pose (sol ou plafond) pour vérifier qu’elle ne gêne pas le passage.`, at);
      } else if (o && o.kind === 'window') {
        const s0 = isNum(o.sill) ? o.sill : 90, s1 = s0 + (isNum(o.h) ? o.h : 125);
        if (poseAHauteur(d.pose) && zr >= s0 && zr <= s1) add('warn', 'fenetre', `La gaine traverse la fenêtre (posée à ${Math.round(zr)} cm, fenêtre de ${Math.round(s0)} à ${Math.round(s1)} cm).`, at);
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
/* croise : entrée sur une gaine électrique existante (évite les croisements inutiles entre gaines) */
const COUT = { virage: 40, mur: 300, cloison: 80, vmc: 4, croise: 50 };
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
  const surG = new Uint8Array(N); // case sur une gaine électrique existante
  const eviter = opts.eviterGaines !== false && O.gaines.length;
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
      if (o && (o.kind === 'door' || o.kind === 'gap')) { if (poseAHauteur(pose)) { extra[k] = Infinity; break; } continue; }
      const c = W.w.kind === 'cloison' ? COUT.cloison : COUT.mur;
      if (c > extra[k]) { extra[k] = c; kindAt[k] = W.w.kind === 'cloison' ? 2 : 1; }
    }
    if (extra[k] === 0) for (const v of O.vmc) { for (let m = 1; m < v.pts.length; m++) if (distSeg(p, v.pts[m - 1], v.pts[m]) <= (v.d.dia || 125) / 20 + cs) { extra[k] = COUT.vmc; break; } if (extra[k]) break; }
  }
  const cell = (p) => ({ i: Math.max(0, Math.min(nx - 1, Math.round((p.x - x0) / cs))), j: Math.max(0, Math.min(ny - 1, Math.round((p.y - y0) / cs))) });
  /* gaines existantes tracées sur la grille (pas d'un demi-pas de grille) */
  if (eviter) for (const G of O.gaines) for (let m = 1; m < G.pts.length; m++) {
    const A = G.pts[m - 1], B = G.pts[m], L = Math.hypot(B.x - A.x, B.y - A.y), n = Math.max(1, Math.ceil(L / (cs / 2)));
    for (let q = 0; q <= n; q++) { const c = cell({ x: A.x + (B.x - A.x) * q / n, y: A.y + (B.y - A.y) * q / n }); const k = c.j * nx + c.i; if (extra[k] !== Infinity) surG[k] = 1; }
  }
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
      const nc = gc + cs + ex + (dir !== 4 && dir !== dd ? COUT.virage : 0) + (surG[kk] && !surG[k] ? COUT.croise : 0), ns = kk * 5 + dd;
      if (nc < best[ns]) { best[ns] = nc; prev[ns] = st; tas.push(nc + H(kk), ns); }
    }
  }
  if (fin < 0) return null;
  const cells = []; for (let st = fin; st >= 0; st = prev[st]) cells.push(Math.floor(st / 5));
  cells.reverse();
  /* traversées de murs : entrées dans une suite de cases de mur */
  let murs = 0, cloisons = 0, croisements = 0;
  for (let m = 1; m < cells.length; m++) { const a = kindAt[cells[m]], b = kindAt[cells[m - 1]]; if (a && a !== b) { if (a === 1) murs++; else cloisons++; } if (surG[cells[m]] && !surG[cells[m - 1]] && m < cells.length - 1) croisements++; }
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
  return { pts: clean, len, murs, cloisons, croisements, cellule: cs };
}

/* ---------------- raccordement automatique d'un circuit ----------------
   Relie au tableau, par des gaines proposées, tous les points d'un circuit qui ne le sont pas encore.
   À chaque tour, le point non raccordé le plus proche d'un point déjà raccordé du même niveau (tableau, point du même
   circuit, boîte de dérivation, passage entre étages) est relié à celui-ci par chercherItineraire : les prises se
   suivent donc de proche en proche. Le plan n'est pas modifié : renvoie { gaines: [{ lv, pts, a, b, cid, len }],
   echecs: [{ id, raison }], deja (points déjà raccordés) } ; l'appelant crée les gaines. */
function raccorderCircuit(plan, cid, opts = {}) {
  const out = { cid, gaines: [], echecs: [], deja: 0 };
  const T = tableauDu(plan);
  if (!T) { out.raison = 'Posez d’abord le tableau électrique sur le plan.'; return out; }
  const tmp = Object.assign({}, plan, { ducts: (plan.ducts || []).slice() });
  const byId = new Map((plan.elec || []).map((e) => [e.id, e]));
  const rates = new Set(); let n = 0;
  out.deja = cheminCircuit(tmp, cid).atteints;
  for (let tour = 0; tour < 400; tour++) {
    const ch = cheminCircuit(tmp, cid);
    const reste = ch.nonAtteints.filter((id) => !rates.has(id)).map((id) => byId.get(id)).filter(Boolean);
    if (!reste.length) break;
    const G = grapheGaines(tmp), sp = G.nodes.has('e:' + T.id) ? plusCourts(G, 'e:' + T.id, cid) : { D: new Map() };
    /* un passage entre étages dont le jumeau est raccordé est lui aussi un point de départ, sur son niveau */
    const relies = (plan.elec || []).filter((x) => x.id === T.id || (sp.D.has('e:' + x.id) && (x.cid === cid || x.type === TRAVERSEE || DERIVATIONS.has(x.type))) || (x.type === TRAVERSEE && x.to && sp.D.has('e:' + x.to)));
    const troncs = tmp.ducts.filter((d) => isElecDuct(d) && !String(d.id).startsWith('~auto') && !circuitsDe(d).length && sp.D.has(`v:${d.id}:0`)).map((d) => ({ d, pts: pointsGaine(tmp, d) }));
    let best = null;
    for (const e of reste) {
      const a = ancrage(e);
      for (const x of relies) { if (x.lv !== e.lv || x.id === e.id) continue; const b = ancrage(x), d = Math.hypot(a.x - b.x, a.y - b.y); if (!best || d < best.d) best = { e, from: x, d }; }
      /* cheminement commun (goulotte, chemin de câbles… sans circuit attitré) déjà relié au tableau : on s'y pique au plus près */
      for (const t of troncs) {
        if (t.d.lv !== e.lv) continue;
        for (let m = 1; m < t.pts.length; m++) {
          const A = t.pts[m - 1], B = t.pts[m], L2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2; if (!L2) continue;
          const u = Math.max(0, Math.min(1, ((a.x - A.x) * (B.x - A.x) + (a.y - A.y) * (B.y - A.y)) / L2));
          const q = { x: A.x + u * (B.x - A.x), y: A.y + u * (B.y - A.y) }, d = Math.hypot(a.x - q.x, a.y - q.y);
          if (!best || d < best.d - 1e-6) best = { e, pique: q, d };
        }
      }
    }
    /* aucun point raccordé sur le niveau des points restants : on raccorde d'abord un passage entre étages qui y mène */
    if (!best) {
      const niveaux = new Set(reste.map((e) => e.lv));
      for (const x of plan.elec || []) {
        if (x.type !== TRAVERSEE || !x.to || rates.has(x.id) || sp.D.has('e:' + x.id)) continue;
        const j = byId.get(x.to); if (!j || !niveaux.has(j.lv)) continue;
        const a = ancrage(x);
        for (const r of relies) { if (r.lv !== x.lv || r.id === x.id) continue; const b = ancrage(r), d = Math.hypot(a.x - b.x, a.y - b.y); if (!best || d < best.d) best = { e: x, from: r, d }; }
      }
    }
    if (!best) { for (const e of reste) { rates.add(e.id); out.echecs.push({ id: e.id, raison: 'Aucun point de ce niveau n’est raccordé au tableau (posez un passage entre étages et raccordez-le).' }); } break; }
    const dep = best.pique ? { x: Math.round(best.pique.x * 10) / 10, y: Math.round(best.pique.y * 10) / 10 } : ancrage(best.from);
    const res = chercherItineraire(tmp, best.e.lv, dep, ancrage(best.e), { pose: opts.pose || null });
    if (!res) { rates.add(best.e.id); out.echecs.push({ id: best.e.id, raison: 'Aucun itinéraire : une zone interdite ou des portes bloquent le passage.' }); continue; }
    const g = { id: '~auto' + (n++), lv: best.e.lv, sys: 'elec', pts: res.pts, a: best.pique ? null : best.from.id, b: best.e.id, cid, len: res.len };
    if (best.pique) { g.pts[0] = dep; g.pique = true; }
    if (opts.kind) g.kind = opts.kind;
    if (opts.pose) { g.pose = opts.pose; if (poseAHauteur(opts.pose) && isNum(opts.z)) g.z = opts.z; }
    tmp.ducts.push(g); out.gaines.push(g);
  }
  return out;
}

export { raccorderCircuit };
export { COUT, chercherItineraire, conflitsGaine, conflitsPlan, inPoly, obstacles };

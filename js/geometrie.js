/* Calque — module « geometrie » : géométrie des murs : jonctions, détection des pièces.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { GEO, IDX, P, inPoly, labelPoint, lineX, polyArea, polyPerim, uid, vadd, vang, vdist, vdot, vmid, vmul, vnorm,
  vperp, vsub } from './noyau.js';

/* ============================================================
   GÉOMÉTRIE DES MURS : jonctions propres + détection des pièces
   ============================================================ */
function geo(lv) { return GEO[lv] || (GEO[lv] = computeLevel(lv)); }

function computeLevel(lv) {
  const nodes = new Map();
  for (const n of P.nodes) if (n.lv === lv) nodes.set(n.id, n);
  const W = new Map();
  const inc = new Map();
  const pushInc = (id, h) => { let a = inc.get(id); if (!a) inc.set(id, (a = [])); a.push(h); };
  for (const w of P.walls) {
    if (w.lv !== lv || w.a === w.b) continue;
    const A = nodes.get(w.a), B = nodes.get(w.b);
    if (!A || !B) continue;
    const L = vdist(A, B);
    if (L < 0.5) continue;
    const d = vnorm(vsub(B, A));
    const g = { w, A, B, L, d, n: vperp(d), th: Math.max(1, w.th || 10), ang: vang(d) };
    const h0 = { g, from: w.a, to: w.b, dir: d, ang: vang(d), P: null, N: null, cap: false };
    const nd = vmul(d, -1);
    const h1 = { g, from: w.b, to: w.a, dir: nd, ang: vang(nd), P: null, N: null, cap: false };
    h0.twin = h1; h1.twin = h0; g.h0 = h0; g.h1 = h1;
    W.set(w.id, g);
    pushInc(w.a, h0); pushInc(w.b, h1);
  }
  // coins de jonction
  const hubs = [];
  for (const [nid, list] of inc) {
    const O = nodes.get(nid);
    list.sort((a, b) => a.ang - b.ang);
    const k = list.length;
    if (k === 1) {
      const h = list[0], n = vperp(h.dir), t = h.g.th / 2;
      h.P = vadd(O, vmul(n, t)); h.N = vsub(O, vmul(n, t)); h.cap = true;
      continue;
    }
    for (let i = 0; i < k; i++) {
      const e = list[i], f = list[(i + 1) % k];
      const ne = vperp(e.dir), nf = vperp(f.dir);
      const te = e.g.th / 2, tf = f.g.th / 2;
      const pe = vadd(O, vmul(ne, te)), pf = vsub(O, vmul(nf, tf));
      let da = f.ang - e.ang; if (i === k - 1) da += 2 * Math.PI;
      let pt = lineX(pe, e.dir, pf, f.dir);
      const lim = 4 * Math.max(te, tf);
      if (!pt || vdist(pt, O) > lim) {
        if (!pt || Math.abs(da - Math.PI) < 0.35) pt = vmid(pe, pf);
        else pt = vadd(O, vmul(vnorm(vsub(pt, O)), lim));
      }
      e.P = pt; f.N = pt;
    }
    if (k >= 3) hubs.push({ pts: list.map((h) => h.P), mur: list.some((h) => h.g.w.kind !== 'cloison') });
  }
  // polygones des murs + dégagements utiles (pour borner les ouvertures)
  for (const g of W.values()) {
    const { h0, h1, A, d, L } = g;
    g.poly = [h0.P, h1.N, h1.P, h0.N];
    g.faceP = [h0.P, h1.N]; // côté +n
    g.faceN = [h1.P, h0.N]; // côté -n
    const pr = (p) => vdot(vsub(p, A), d);
    g.clear0 = h0.cap ? 0 : Math.max(0, pr(h0.P), pr(h0.N));
    g.clear1 = h1.cap ? L : Math.min(L, pr(h1.P), pr(h1.N));
    if (g.clear1 < g.clear0) { const m = (g.clear0 + g.clear1) / 2; g.clear0 = g.clear1 = m; }
  }
  // faces (parcours du graphe planaire)
  const faces = [];
  const visited = new Set();
  for (const g of W.values()) for (const h of [g.h0, g.h1]) {
    if (visited.has(h)) continue;
    const loop = [], poly = [], hes = [];
    let cur = h, guard = 0;
    do {
      visited.add(cur); hes.push(cur);
      const list = inc.get(cur.to);
      const r = cur.twin;
      const idx = list.indexOf(r);
      const e = list[(idx - 1 + list.length) % list.length];
      poly.push(r.N);
      if (e.P !== r.N) poly.push(e.P);
      loop.push(nodes.get(cur.to));
      cur = e;
    } while (cur !== h && ++guard < 20000);
    faces.push({ hes, loop, poly, aLoop: polyArea(loop), aPoly: polyArea(poly) });
  }
  // composantes connexes
  const comp = new Map();
  const find = (x) => { while (comp.get(x) !== x) { comp.set(x, comp.get(comp.get(x))); x = comp.get(x); } return x; };
  for (const id of inc.keys()) comp.set(id, id);
  for (const g of W.values()) { const a = find(g.w.a), b = find(g.w.b); if (a !== b) comp.set(a, b); }
  // Les faces bornées ont une aire signée positive (voir test de calibration)
  const rooms = [], outers = [];
  for (const f of faces) {
    f.comp = find(f.hes[0].from);
    if (f.aLoop > 1 && f.aPoly > 1000) rooms.push(f);
    else if (f.aPoly < 0) outers.push(f);
  }
  for (const r of rooms) { r.holes = []; r.area = r.aPoly; r.perim = polyPerim(r.poly); }
  for (const o of outers) {
    let best = null;
    for (const r of rooms) {
      if (r.comp === o.comp) continue;
      if (!inPoly(o.loop[0] || o.poly[0], r.loop)) continue;
      if (!best || r.aLoop < best.aLoop) best = r;
    }
    if (best) { best.holes.push(o.poly); best.area -= Math.abs(o.aPoly); }
  }
  // association des étiquettes (sans mutation)
  const labels = P.rooms.filter((r) => r.lv === lv);
  const used = new Set();
  for (const r of rooms) {
    r.label = labels.find((l) => !used.has(l) && inPoly(l, r.loop)) || null;
    if (r.label) used.add(r.label);
  }
  return { lv, nodes, walls: W, inc, rooms, outers, hubs };
}

function syncRooms() {
  const keep = new Set();
  for (const L of P.levels) {
    const g = geo(L.id);
    for (const r of g.rooms) {
      if (!r.label) {
        const pt = labelPoint(r.poly);
        r.label = { id: uid('r'), lv: L.id, name: nextRoomName(), x: Math.round(pt.x), y: Math.round(pt.y) };
        P.rooms.push(r.label);
      }
      keep.add(r.label.id);
    }
  }
  const before = P.rooms.length;
  P.rooms = P.rooms.filter((r) => keep.has(r.id));
  if (before !== P.rooms.length || true) { IDX.rooms.clear(); for (const r of P.rooms) IDX.rooms.set(r.id, r); }
}
function nextRoomName() {
  let n = 1;
  const names = new Set(P.rooms.map((r) => r.name));
  while (names.has('Pièce ' + n)) n++;
  return 'Pièce ' + n;
}
function roomOfLabel(lbl) {
  const g = geo(lbl.lv);
  return g.rooms.find((r) => r.label === lbl) || null;
}

export { computeLevel, geo, nextRoomName, roomOfLabel, syncRooms };

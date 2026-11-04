/* Calque — module « mutations » : modifications des murs : ajout, découpe, fusion.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { DEG, IDX, P, clamp, nodeOf, projSeg, segX, setGEO, touch, uid, vdist, vdot, vlen, vmul, vnorm, vsub } from './noyau.js';
import { geo } from './geometrie.js';

/* ============================================================
   MUTATIONS DES MURS
   ============================================================ */
function addNode(lv, x, y) {
  const n = { id: uid('n'), lv, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  P.nodes.push(n); IDX.nodes.set(n.id, n); setGEO({});
  return n;
}
function wallsAt(nodeId) { return P.walls.filter((w) => w.a === nodeId || w.b === nodeId); }
function findNodeNear(lv, p, tol, exclude) {
  let best = null, bd = tol;
  for (const n of P.nodes) {
    if (n.lv !== lv || n.id === exclude) continue;
    const d = vdist(n, p);
    if (d <= bd) { bd = d; best = n; }
  }
  return best;
}
function findWallNear(lv, p, tol, excludeNode) {
  let best = null, bd = tol;
  for (const w of P.walls) {
    if (w.lv !== lv) continue;
    if (excludeNode && (w.a === excludeNode || w.b === excludeNode)) continue;
    const A = nodeOf(w.a), B = nodeOf(w.b);
    if (!A || !B) continue;
    const pr = projSeg(p, A, B);
    if (pr.t <= 0.001 || pr.t >= 0.999) continue;
    if (pr.d <= bd) { bd = pr.d; best = { w, pt: pr.pt, t: pr.t, d: pr.d }; }
  }
  return best;
}
function newWall(lv, a, b, props) {
  if (a === b) return null;
  if (P.walls.some((w) => w.lv === lv && ((w.a === a && w.b === b) || (w.a === b && w.b === a)))) return null;
  const w = { id: uid('w'), lv, a, b, th: props.th, kind: props.kind || 'mur' };
  if (props.h) w.h = props.h;
  P.walls.push(w); IDX.walls.set(w.id, w); setGEO({});
  return w;
}
/* coupe un mur en un point (projeté) : renvoie l'id du nouveau nœud */
function splitWall(w, p) {
  const A = nodeOf(w.a), B = nodeOf(w.b);
  const pr = projSeg(p, A, B);
  const n = addNode(w.lv, pr.pt.x, pr.pt.y);
  const L = vdist(A, B), cut = pr.tc * L;
  const w2 = { id: uid('w'), lv: w.lv, a: n.id, b: w.b, th: w.th, kind: w.kind };
  if (w.h) w2.h = w.h;
  w.b = n.id;
  P.walls.push(w2); IDX.walls.set(w2.id, w2);
  for (const o of P.openings) if (o.wall === w.id && o.t > cut) { o.wall = w2.id; o.t -= cut; }
  setGEO({});
  return n.id;
}
function resolvePoint(lv, p) {
  if (p.node && nodeOf(p.node)) return p.node;
  const n = findNodeNear(lv, p, 0.6);
  if (n) return n.id;
  const hit = findWallNear(lv, p, 0.6);
  if (hit) return splitWall(hit.w, hit.pt);
  return addNode(lv, p.x, p.y).id;
}
/* ajoute un mur de pa à pb en coupant tout ce qu'il croise */
function addWall(lv, pa, pb, props) {
  const na = resolvePoint(lv, pa);
  const nb = resolvePoint(lv, pb);
  if (na === nb) return [];
  const A = nodeOf(na), B = nodeOf(nb);
  const splits = [];
  for (const w of P.walls.slice()) {
    if (w.lv !== lv || w.a === na || w.b === na || w.a === nb || w.b === nb) continue;
    const C = nodeOf(w.a), D = nodeOf(w.b);
    const r = segX(A, B, C, D);
    if (r && r.t > 1e-3 && r.t < 1 - 1e-3 && r.u > 1e-3 && r.u < 1 - 1e-3) splits.push({ t: r.t, wall: w, pt: r.pt });
  }
  for (const n of P.nodes) {
    if (n.lv !== lv || n.id === na || n.id === nb) continue;
    const pr = projSeg(n, A, B);
    if (pr.d < 0.6 && pr.t > 1e-3 && pr.t < 1 - 1e-3) splits.push({ t: pr.t, node: n.id });
  }
  splits.sort((a, b) => a.t - b.t);
  const out = [];
  let prev = na;
  for (const s of splits) {
    const nid = s.node || splitWall(s.wall, s.pt);
    if (nid !== prev) { const w = newWall(lv, prev, nid, props); if (w) out.push(w); prev = nid; }
  }
  const w = newWall(lv, prev, nb, props); if (w) out.push(w);
  return out;
}
function deleteWall(id) {
  const w = IDX.walls.get(id); if (!w) return;
  P.walls = P.walls.filter((x) => x.id !== id);
  P.openings = P.openings.filter((o) => o.wall !== id);
  touch();
  for (const nid of [w.a, w.b]) cleanupNode(nid);
  touch();
}
function cleanupNode(nid) {
  const ws = wallsAt(nid);
  if (ws.length === 0) { P.nodes = P.nodes.filter((n) => n.id !== nid); return; }
  if (ws.length === 2) mergeAtNode(nid, true);
}
/* fusionne deux murs reliés par un nœud de degré 2 */
function mergeAtNode(nid, onlyCollinear) {
  const ws = wallsAt(nid);
  if (ws.length !== 2) return false;
  let [w1, w2] = ws;
  const O = nodeOf(nid);
  const o1 = w1.a === nid ? w1.b : w1.a, o2 = w2.a === nid ? w2.b : w2.a;
  if (o1 === o2) return false;
  const X = nodeOf(o1), Y = nodeOf(o2);
  if (onlyCollinear) {
    if (w1.kind !== w2.kind || Math.abs((w1.th || 0) - (w2.th || 0)) > 0.1) return false;
    const a = vnorm(vsub(O, X)), b = vnorm(vsub(Y, O));
    if (vdot(a, b) < 0.9999) return false;
  }
  // orienter w1 : X -> O, w2 : O -> Y
  const L1 = vdist(X, O);
  const flip = (w) => { const L = vdist(nodeOf(w.a), nodeOf(w.b)); const t = w.a; w.a = w.b; w.b = t; for (const o of P.openings) if (o.wall === w.id) { o.t = L - o.t; o.hinge = o.hinge ? 0 : 1; o.side = -(o.side || 1); } };
  if (w1.b !== nid) flip(w1);
  if (w2.a !== nid) flip(w2);
  const straight = onlyCollinear || vdot(vnorm(vsub(O, X)), vnorm(vsub(Y, O))) > 0.9999;
  for (const o of P.openings) if (o.wall === w2.id) {
    if (straight) { o.wall = w1.id; o.t += L1; }
  }
  P.openings = P.openings.filter((o) => o.wall !== w2.id);
  if (!straight) P.openings = P.openings.filter((o) => o.wall !== w1.id);
  w1.b = o2;
  P.walls = P.walls.filter((w) => w.id !== w2.id);
  P.nodes = P.nodes.filter((n) => n.id !== nid);
  touch();
  return true;
}
function deleteNode(nid) {
  const ws = wallsAt(nid);
  if (ws.length === 2 && mergeAtNode(nid, false)) return;
  for (const w of ws) { P.walls = P.walls.filter((x) => x.id !== w.id); P.openings = P.openings.filter((o) => o.wall !== w.id); }
  P.nodes = P.nodes.filter((n) => n.id !== nid);
  touch();
  for (const w of ws) { const o = w.a === nid ? w.b : w.a; if (IDX.nodes.has(o)) cleanupNode(o); }
  touch();
}
/* fusion de deux nœuds (dépôt d'un angle sur un autre) */
function mergeNodes(keepId, dropId) {
  if (keepId === dropId) return;
  for (const w of P.walls) { if (w.a === dropId) w.a = keepId; if (w.b === dropId) w.b = keepId; }
  P.walls = P.walls.filter((w) => w.a !== w.b);
  const seen = new Set();
  P.walls = P.walls.filter((w) => {
    const k = w.lv + ':' + [w.a, w.b].sort().join('|');
    if (seen.has(k)) { P.openings = P.openings.filter((o) => o.wall !== w.id); return false; }
    seen.add(k); return true;
  });
  P.nodes = P.nodes.filter((n) => n.id !== dropId);
  touch();
}
function wallLength(w) { return vdist(nodeOf(w.a), nodeOf(w.b)); }
function clampOpening(o) {
  const w = IDX.walls.get(o.wall); if (!w) return;
  const g = geo(w.lv).walls.get(w.id);
  const L = g ? g.L : wallLength(w);
  const c0 = g ? g.clear0 : 0, c1 = g ? g.clear1 : L;
  const span = c1 - c0;
  if (o.w > span) o.t = (c0 + c1) / 2;
  else o.t = clamp(o.t, c0 + o.w / 2, c1 - o.w / 2);
}

/* ============================================================
   OBJETS : repères locaux
   ============================================================ */
function itemToWorld(it, lx, ly) {
  const a = (it.rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a);
  return { x: it.x + lx * c - ly * s, y: it.y + lx * s + ly * c };
}
function itemToLocal(it, p) {
  const a = (it.rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a);
  const dx = p.x - it.x, dy = p.y - it.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}
function normDeg(a) { a = a % 360; if (a < 0) a += 360; return Math.round(a * 10) / 10; }

/* faces de murs utilisables par l'aimant */
function wallFaces(lv) {
  const out = [];
  for (const g of geo(lv).walls.values()) {
    out.push({ a: g.faceP[0], b: g.faceP[1], n: g.n, g });
    out.push({ a: g.faceN[0], b: g.faceN[1], n: vmul(g.n, -1), g });
  }
  return out;
}
/* trouve la face de mur la plus proche du côté du point p */
function nearestFace(lv, p, maxDist) {
  let best = null;
  for (const f of wallFaces(lv)) {
    const ab = vsub(f.b, f.a), L = vlen(ab);
    if (L < 1) continue;
    const u = vmul(ab, 1 / L);
    const s = vdot(vsub(p, f.a), u);
    if (s < -5 || s > L + 5) continue;
    const dn = vdot(vsub(p, f.a), f.n);
    if (dn < -2 || dn > maxDist) continue;
    if (!best || dn < best.dn) best = { f, s, dn, u, L };
  }
  return best;
}

export { addNode, addWall, clampOpening, cleanupNode, deleteNode, deleteWall, findNodeNear, findWallNear, itemToLocal,
  itemToWorld, mergeAtNode, mergeNodes, nearestFace, newWall, normDeg, resolvePoint, splitWall, wallFaces, wallLength,
  wallsAt };

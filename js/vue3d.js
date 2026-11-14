/* Calque — module « vue3d » : vue 3D : moteur WebGL 2 intégré.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { $, C, DEG, IDX, NF1, P, S, estExterieure, touch, bboxOf, clamp, climbHeight, distToEdges, fmtArea, fmtLenU, inPoly, labelPoint,
  levelAbove, levelBelow, levelOf, levelsSorted, nodeOf, saveSettings, ui, vadd, vdist, vlen, vmid, vmul, vnorm, vperp,
  vsub } from './noyau.js';
import { geo, roomOfLabel } from './geometrie.js';
import { itemToWorld, wallLength } from './mutations.js';
import { H } from './historique.js';
import { ELEC_BY, furnDef, isStair, stairInfo, stairModel, stairZones } from './symboles.js';
import { FONT_LABEL, FONT_UI, V, closetLeafHinges, closetPlane } from './rendu2d.js';
import { LIGHTS, circById, circNumbers, circuitColor, circuitLabel, cleanLinks, isDarkTheme, roomAt, roomName } from './electricite.js';
import { ductLen, ductPts, ductVisible, elecVisible } from './reseaux.js';
import { POSES, TYPES_CHEMIN, TRAVERSEE, cheminCircuit, circuitsDe, grapheGaines, hauteurParcours, jumelle, kindOf, nomChemin, tailleChemin } from './cheminement.js';
import { openFiche } from './fiche.js';
import { OPENING_NAMES, SCR, commit, openingModels, refreshUI, requestRender, wallHeightOf } from './interaction.js';
import { goToRef, setView } from './tableau.js';
import { ICON, btn, btns, fmtIn, h, ico, kv, numField, openingSizeText, sec, segCtl, toast } from './interface.js';
import { aCouches, courtCouche } from './compositions.js';
import { slug } from './stockage.js';
import { openFileModal, parseColor } from './export.js';

/* ============================================================
   CALQUE — vue 3D : moteur WebGL2 intégré (aucune bibliothèque)
   La maquette est entièrement déduite du plan 2D : rien n'est
   à redessiner. Repère 3D : X = x du plan, Y = hauteur, Z = y du plan
   (unités : cm).
   ============================================================ */

/* ---------------- triangulation de polygones avec trous (méthode « earcut ») ---------------- */
const earcut = (() => {
  class N { constructor(i, x, y) { this.i = i; this.x = x; this.y = y; this.prev = null; this.next = null; this.steiner = false; } }
  function earcut(data, holes) {
    const hasH = holes && holes.length, outerLen = hasH ? holes[0] * 2 : data.length;
    let outer = linked(data, 0, outerLen, true);
    const tri = [];
    if (!outer || outer.next === outer.prev) return tri;
    if (hasH) outer = elimHoles(data, holes, outer);
    run(outer, tri, 0);
    return tri;
  }
  function linked(data, start, end, cw) {
    let last;
    if (cw === (sArea(data, start, end) > 0)) for (let i = start; i < end; i += 2) last = ins(i, data[i], data[i + 1], last);
    else for (let i = end - 2; i >= start; i -= 2) last = ins(i, data[i], data[i + 1], last);
    if (last && eq(last, last.next)) { rm(last); last = last.next; }
    return last;
  }
  function filt(start, end) {
    if (!start) return start; if (!end) end = start;
    let p = start, again;
    do {
      again = false;
      if (!p.steiner && (eq(p, p.next) || ar(p.prev, p, p.next) === 0)) { rm(p); p = end = p.prev; if (p === p.next) break; again = true; }
      else p = p.next;
    } while (again || p !== end);
    return end;
  }
  function run(ear, tri, pass) {
    if (!ear) return;
    let stop = ear;
    while (ear.prev !== ear.next) {
      const prev = ear.prev, next = ear.next;
      if (isEar(ear)) { tri.push(prev.i / 2, ear.i / 2, next.i / 2); rm(ear); ear = next.next; stop = next.next; continue; }
      ear = next;
      if (ear === stop) {
        if (!pass) run(filt(ear), tri, 1);
        else if (pass === 1) { ear = cure(filt(ear), tri); run(ear, tri, 2); }
        else if (pass === 2) split(ear, tri);
        break;
      }
    }
  }
  function isEar(ear) {
    const a = ear.prev, b = ear, c = ear.next;
    if (ar(a, b, c) >= 0) return false;
    const x0 = Math.min(a.x, b.x, c.x), y0 = Math.min(a.y, b.y, c.y), x1 = Math.max(a.x, b.x, c.x), y1 = Math.max(a.y, b.y, c.y);
    let p = c.next;
    while (p !== a) {
      if (p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1 && pit(a.x, a.y, b.x, b.y, c.x, c.y, p.x, p.y) && ar(p.prev, p, p.next) >= 0) return false;
      p = p.next;
    }
    return true;
  }
  function cure(start, tri) {
    let p = start;
    do {
      const a = p.prev, b = p.next.next;
      if (!eq(a, b) && inter(a, p, p.next, b) && locIn(a, b) && locIn(b, a)) { tri.push(a.i / 2, p.i / 2, b.i / 2); rm(p); rm(p.next); p = start = b; }
      p = p.next;
    } while (p !== start);
    return filt(p);
  }
  function split(start, tri) {
    let a = start;
    do {
      let b = a.next.next;
      while (b !== a.prev) {
        if (a.i !== b.i && validDiag(a, b)) {
          let c = splitPoly(a, b);
          a = filt(a, a.next); c = filt(c, c.next);
          run(a, tri, 0); run(c, tri, 0); return;
        }
        b = b.next;
      }
      a = a.next;
    } while (a !== start);
  }
  function elimHoles(data, holes, outer) {
    const q = [];
    for (let i = 0; i < holes.length; i++) {
      const s = holes[i] * 2, e = i < holes.length - 1 ? holes[i + 1] * 2 : data.length;
      const list = linked(data, s, e, false);
      if (!list) continue;
      if (list === list.next) list.steiner = true;
      q.push(leftmost(list));
    }
    q.sort((a, b) => a.x - b.x);
    for (const h of q) outer = elimHole(h, outer);
    return outer;
  }
  function elimHole(hole, outer) {
    const br = bridge(hole, outer); if (!br) return outer;
    const brr = splitPoly(br, hole);
    filt(brr, brr.next);
    return filt(br, br.next);
  }
  function bridge(hole, outer) {
    let p = outer, qx = -Infinity, m;
    const hx = hole.x, hy = hole.y;
    do {
      if (hy <= p.y && hy >= p.next.y && p.next.y !== p.y) {
        const x = p.x + (hy - p.y) * (p.next.x - p.x) / (p.next.y - p.y);
        if (x <= hx && x > qx) { qx = x; m = p.x < p.next.x ? p : p.next; if (x === hx) return m; }
      }
      p = p.next;
    } while (p !== outer);
    if (!m) return null;
    const stop = m, mx = m.x, my = m.y; let tanMin = Infinity;
    p = m;
    do {
      if (hx >= p.x && p.x >= mx && hx !== p.x && pit(hy < my ? hx : qx, hy, mx, my, hy < my ? qx : hx, hy, p.x, p.y)) {
        const tan = Math.abs(hy - p.y) / (hx - p.x);
        if (locIn(p, hole) && (tan < tanMin || (tan === tanMin && (p.x > m.x || (p.x === m.x && ar(m.prev, m, p.prev) < 0 && ar(p.next, m, m.next) < 0))))) { m = p; tanMin = tan; }
      }
      p = p.next;
    } while (p !== stop);
    return m;
  }
  function leftmost(s) { let p = s, l = s; do { if (p.x < l.x || (p.x === l.x && p.y < l.y)) l = p; p = p.next; } while (p !== s); return l; }
  function pit(ax, ay, bx, by, cx, cy, px, py) { return (cx - px) * (ay - py) >= (ax - px) * (cy - py) && (ax - px) * (by - py) >= (bx - px) * (ay - py) && (bx - px) * (cy - py) >= (cx - px) * (by - py); }
  function validDiag(a, b) {
    return a.next.i !== b.i && a.prev.i !== b.i && !interPoly(a, b) &&
      ((locIn(a, b) && locIn(b, a) && midIn(a, b) && (ar(a.prev, a, b.prev) || ar(a, b.prev, b))) || (eq(a, b) && ar(a.prev, a, a.next) > 0 && ar(b.prev, b, b.next) > 0));
  }
  function ar(p, q, r) { return (q.y - p.y) * (r.x - q.x) - (q.x - p.x) * (r.y - q.y); }
  function eq(a, b) { return a.x === b.x && a.y === b.y; }
  function sg(v) { return v > 0 ? 1 : v < 0 ? -1 : 0; }
  function onSeg(p, q, r) { return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y); }
  function inter(p1, q1, p2, q2) {
    const o1 = sg(ar(p1, q1, p2)), o2 = sg(ar(p1, q1, q2)), o3 = sg(ar(p2, q2, p1)), o4 = sg(ar(p2, q2, q1));
    if (o1 !== o2 && o3 !== o4) return true;
    return (o1 === 0 && onSeg(p1, p2, q1)) || (o2 === 0 && onSeg(p1, q2, q1)) || (o3 === 0 && onSeg(p2, p1, q2)) || (o4 === 0 && onSeg(p2, q1, q2));
  }
  function interPoly(a, b) { let p = a; do { if (p.i !== a.i && p.next.i !== a.i && p.i !== b.i && p.next.i !== b.i && inter(p, p.next, a, b)) return true; p = p.next; } while (p !== a); return false; }
  function locIn(a, b) { return ar(a.prev, a, a.next) < 0 ? ar(a, b, a.next) >= 0 && ar(a, a.prev, b) >= 0 : ar(a, b, a.prev) < 0 || ar(a, a.next, b) < 0; }
  function midIn(a, b) {
    let p = a, inside = false; const px = (a.x + b.x) / 2, py = (a.y + b.y) / 2;
    do { if (((p.y > py) !== (p.next.y > py)) && p.next.y !== p.y && px < (p.next.x - p.x) * (py - p.y) / (p.next.y - p.y) + p.x) inside = !inside; p = p.next; } while (p !== a);
    return inside;
  }
  function splitPoly(a, b) {
    const a2 = new N(a.i, a.x, a.y), b2 = new N(b.i, b.x, b.y), an = a.next, bp = b.prev;
    a.next = b; b.prev = a; a2.next = an; an.prev = a2; b2.next = a2; a2.prev = b2; bp.next = b2; b2.prev = bp;
    return b2;
  }
  function ins(i, x, y, last) { const p = new N(i, x, y); if (!last) { p.prev = p; p.next = p; } else { p.next = last.next; p.prev = last; last.next.prev = p; last.next = p; } return p; }
  function rm(p) { p.next.prev = p.prev; p.prev.next = p.next; }
  function sArea(d, s, e) { let sum = 0; for (let i = s, j = e - 2; i < e; i += 2) { sum += (d[j] - d[i]) * (d[i + 1] + d[j + 1]); j = i; } return sum; }
  return earcut;
})();

/* ---------------- matrices 4×4 (colonnes, comme WebGL) ---------------- */
function m4mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; }
function m4persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), nf = 1 / (n - f); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]); }
function m4ortho(l, r, b, t, n, f) { const lr = 1 / (l - r), bt = 1 / (b - t), nf = 1 / (n - f); return new Float32Array([-2 * lr, 0, 0, 0, 0, -2 * bt, 0, 0, 0, 0, 2 * nf, 0, (l + r) * lr, (t + b) * bt, (f + n) * nf, 1]); }
function m4look(e, c, up) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz) || 1; zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx; l = Math.hypot(xx, xy, xz) || 1; xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  return new Float32Array([xx, yx, zx, 0, xy, yy, zy, 0, xz, yz, zz, 0, -(xx * e[0] + xy * e[1] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
}
function m4inv(m) {
  const a00 = m[0], a01 = m[1], a02 = m[2], a03 = m[3], a10 = m[4], a11 = m[5], a12 = m[6], a13 = m[7], a20 = m[8], a21 = m[9], a22 = m[10], a23 = m[11], a30 = m[12], a31 = m[13], a32 = m[14], a33 = m[15];
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06; if (!det) return null; det = 1 / det;
  return new Float32Array([
    (a11 * b11 - a12 * b10 + a13 * b09) * det, (a02 * b10 - a01 * b11 - a03 * b09) * det, (a31 * b05 - a32 * b04 + a33 * b03) * det, (a22 * b04 - a21 * b05 - a23 * b03) * det,
    (a12 * b08 - a10 * b11 - a13 * b07) * det, (a00 * b11 - a02 * b08 + a03 * b07) * det, (a32 * b02 - a30 * b05 - a33 * b01) * det, (a20 * b05 - a22 * b02 + a23 * b01) * det,
    (a10 * b10 - a11 * b08 + a13 * b06) * det, (a01 * b08 - a00 * b10 - a03 * b06) * det, (a30 * b04 - a31 * b02 + a33 * b00) * det, (a21 * b02 - a20 * b04 - a23 * b00) * det,
    (a11 * b07 - a10 * b09 - a12 * b06) * det, (a00 * b09 - a01 * b07 + a02 * b06) * det, (a31 * b01 - a30 * b03 - a32 * b00) * det, (a20 * b03 - a21 * b01 + a22 * b00) * det]);
}
function m4xv(m, x, y, z, w) { return [m[0] * x + m[4] * y + m[8] * z + m[12] * w, m[1] * x + m[5] * y + m[9] * z + m[13] * w, m[2] * x + m[6] * y + m[10] * z + m[14] * w, m[3] * x + m[7] * y + m[11] * z + m[15] * w]; }

/* ---------------- tampons de géométrie et primitives ---------------- */
class GB {
  constructor() { this.P = []; this.N = []; this.C = []; this.I = []; this.T = []; this.E = []; this.nv = 0; }
  v(x, y, z, nx, ny, nz, c, id) { this.P.push(x, y, z); this.N.push(nx, ny, nz); this.C.push(c[0], c[1], c[2], c[3] || 0); this.I.push(id & 255, (id >> 8) & 255, (id >> 16) & 255, 255); return this.nv++; }
  t(a, b, c) { this.T.push(a, b, c); }
  e(a, b) { this.E.push(a, b); }
}
function ringArea(r) { let a = 0; for (let i = 0; i < r.length; i++) { const p = r[i], q = r[(i + 1) % r.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }
function cleanRing(r) {
  const out = [];
  for (const p of r) { if (!p || !isFinite(p.x) || !isFinite(p.y)) continue; const l = out[out.length - 1]; if (!l || Math.abs(l.x - p.x) > 0.01 || Math.abs(l.y - p.y) > 0.01) out.push(p); }
  while (out.length > 2 && Math.abs(out[0].x - out[out.length - 1].x) < 0.01 && Math.abs(out[0].y - out[out.length - 1].y) < 0.01) out.pop();
  return out;
}
function isConvex(r) {
  let s = 0;
  for (let i = 0; i < r.length; i++) {
    const a = r[i], b = r[(i + 1) % r.length], c = r[(i + 2) % r.length];
    const cr = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(cr) < 1e-9) continue;
    if (!s) s = Math.sign(cr); else if (Math.sign(cr) !== s) return false;
  }
  return true;
}
/* solide extrudé verticalement : anneaux [extérieur, trous…] entre y0 et y1 */
function solid3(gb, rings, y0, y1, col, id, o) {
  o = o || {};
  if (!(y1 - y0 > 0.05)) return;
  const R = [];
  for (let k = 0; k < rings.length; k++) {
    let p = cleanRing(rings[k]); if (p.length < 3) continue;
    const a = ringArea(p); if (Math.abs(a) < 0.5) continue;
    if (k === 0 && !R.length) { if (a < 0) p = p.slice().reverse(); R.push(p); }
    else if (R.length) { if (a > 0) p = p.slice().reverse(); R.push(p); }
  }
  if (!R.length) return;
  const flat = [], holes = [];
  R.forEach((r, k) => { if (k) holes.push(flat.length / 2); for (const p of r) flat.push(p.x, p.y); });
  let tri;
  if (R.length === 1 && isConvex(R[0])) { tri = []; for (let i = 1; i < R[0].length - 1; i++) tri.push(0, i, i + 1); }
  else tri = earcut(flat, holes.length ? holes : null);
  const top = o.top || col, bot = o.bot || col, side = o.side || col, nV = flat.length / 2, ed = o.edges !== false;
  if (!o.noTop) { const b = gb.nv; for (let i = 0; i < nV; i++) gb.v(flat[2 * i], y1, flat[2 * i + 1], 0, 1, 0, top, id); for (let i = 0; i < tri.length; i += 3) gb.t(b + tri[i], b + tri[i + 1], b + tri[i + 2]); }
  if (!o.noBot) { const b = gb.nv; for (let i = 0; i < nV; i++) gb.v(flat[2 * i], y0, flat[2 * i + 1], 0, -1, 0, bot, id); for (let i = 0; i < tri.length; i += 3) gb.t(b + tri[i], b + tri[i + 2], b + tri[i + 1]); }
  for (const r of R) {
    const n = r.length;
    for (let i = 0; i < n; i++) {
      const p = r[i], q = r[(i + 1) % n], dx = q.x - p.x, dy = q.y - p.y, L = Math.hypot(dx, dy); if (L < 1e-6) continue;
      const nx = dy / L, nz = -dx / L, b = gb.nv;
      gb.v(p.x, y0, p.y, nx, 0, nz, side, id); gb.v(q.x, y0, q.y, nx, 0, nz, side, id); gb.v(q.x, y1, q.y, nx, 0, nz, side, id); gb.v(p.x, y1, p.y, nx, 0, nz, side, id);
      gb.t(b, b + 1, b + 2); gb.t(b, b + 2, b + 3);
      if (ed) {
        gb.e(b, b + 1); gb.e(b + 3, b + 2);
        const pp = r[(i - 1 + n) % n], ex = p.x - pp.x, ey = p.y - pp.y, L1 = Math.hypot(ex, ey);
        if (L1 > 1e-6 && (ex * dx + ey * dy) / (L1 * L) < 0.9) gb.e(b, b + 3);
      }
    }
  }
}
function circlePts(c, r, seg) { const o = []; for (let i = 0; i < seg; i++) { const t = (i / seg) * Math.PI * 2; o.push({ x: c.x + Math.cos(t) * r, y: c.y + Math.sin(t) * r }); } return o; }
function tube3(gb, a, b, r, col, id, seg) {
  seg = seg || 10;
  const ax = b[0] - a[0], ay = b[1] - a[1], az = b[2] - a[2], L = Math.hypot(ax, ay, az); if (L < 0.01) return;
  const dx = ax / L, dy = ay / L, dz = az / L;
  let ux, uy, uz; if (Math.abs(dy) < 0.9) { ux = -dz; uy = 0; uz = dx; } else { ux = 0; uy = dz; uz = -dy; }
  const ul = Math.hypot(ux, uy, uz); ux /= ul; uy /= ul; uz /= ul;
  const vx = dy * uz - dz * uy, vy = dz * ux - dx * uz, vz = dx * uy - dy * ux, b0 = gb.nv;
  for (let i = 0; i <= seg; i++) {
    const t = (i / seg) * Math.PI * 2, c = Math.cos(t), s = Math.sin(t), nx = ux * c + vx * s, ny = uy * c + vy * s, nz = uz * c + vz * s;
    gb.v(a[0] + nx * r, a[1] + ny * r, a[2] + nz * r, nx, ny, nz, col, id); gb.v(b[0] + nx * r, b[1] + ny * r, b[2] + nz * r, nx, ny, nz, col, id);
  }
  for (let i = 0; i < seg; i++) { const k = b0 + i * 2; gb.t(k, k + 1, k + 3); gb.t(k, k + 3, k + 2); }
}
function sphere3(gb, c, r, col, id, seg) {
  seg = seg || 12; const rows = Math.max(4, seg >> 1), b0 = gb.nv;
  for (let i = 0; i <= rows; i++) { const ph = (i / rows) * Math.PI; for (let j = 0; j <= seg; j++) { const th = (j / seg) * Math.PI * 2, nx = Math.sin(ph) * Math.cos(th), ny = Math.cos(ph), nz = Math.sin(ph) * Math.sin(th); gb.v(c[0] + nx * r, c[1] + ny * r, c[2] + nz * r, nx, ny, nz, col, id); } }
  for (let i = 0; i < rows; i++) for (let j = 0; j < seg; j++) { const a = b0 + i * (seg + 1) + j, b = a + seg + 1; gb.t(a, b, a + 1); gb.t(a + 1, b, b + 1); }
}
/* découpe Sutherland–Hodgman : garde la partie où f(p) ≥ 0 */
function clipHalf(pts, f) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n], fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if ((fa >= 0) !== (fb >= 0)) { const t = fa / (fa - fb); out.push({ u: a.u + (b.u - a.u) * t, v: a.v + (b.v - a.v) * t, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }); }
  }
  return out;
}
/* intersection d'un polygone quelconque avec un polygone convexe */
function clipConvex(subj, clip) {
  let out = subj.map((p) => ({ x: p.x, y: p.y }));
  const s = ringArea(clip) > 0 ? 1 : -1;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    out = clipHalf(out, (p) => s * ((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)));
  }
  return out;
}
function shrinkRing(r, d) { const c = { x: 0, y: 0 }; for (const p of r) { c.x += p.x / r.length; c.y += p.y / r.length; } return r.map((p) => { const v = vsub(p, c), l = vlen(v) || 1; return vadd(c, vmul(v, Math.max(0, l - d) / l)); }); }
const hexRGB = (s) => { const c = parseColor(s); return [Math.round(c[0] * 255), Math.round(c[1] * 255), Math.round(c[2] * 255)]; };
const mixRGB = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] || 0];
const glowC = (c) => [c[0], c[1], c[2], 220];

/* ---------------- couleurs de la maquette ---------------- */
const K3 = {
  wall: [239, 237, 231], wallCap: [52, 57, 62], part: [247, 246, 242], partCap: [126, 134, 140],
  floor: [228, 219, 203], slabSide: [208, 203, 193], ceil: [250, 250, 248], terrasse: [196, 188, 172],
  white: [249, 249, 246], white2: [236, 236, 232], wood: [203, 170, 128], woodDk: [160, 124, 88], dark: [70, 75, 81], black: [40, 43, 47],
  steel: [200, 205, 209], fabric: [139, 154, 166], fabric2: [176, 188, 196], stone: [214, 209, 199], water: [168, 206, 224], tile: [214, 218, 220],
  leaf: [104, 152, 96], pot: [180, 124, 90], doorLeaf: [244, 241, 234], doorEntry: [88, 94, 102], frame: [253, 253, 251], glass: [170, 208, 226],
  stair: [206, 176, 134], stairSide: [222, 218, 210], vmc: [70, 168, 162], gaine: [124, 99, 210], light: [255, 220, 140],
};
const TINT3 = [null, [214, 165, 80], [96, 160, 104], [80, 146, 214], [222, 110, 132], [146, 114, 214], [84, 96, 108]];
const CAT3 = { prises: [35, 86, 196], appareils: [194, 65, 12], commandes: [21, 128, 61], eclairage: [230, 170, 40], comm: [124, 58, 237], tableau: [96, 104, 112], confort: [185, 28, 28], ventilation: [11, 140, 136], moteurs: [161, 98, 7], securite: [190, 24, 93], acces: [14, 116, 144], alarme: [77, 124, 15] };

/* ---------------- mobilier : volumes simplifiés ----------------
   Repère local : x = largeur (−w/2…w/2), y = profondeur (−d/2 = dos, côté mur ;
   +d/2 = façade), z = hauteur en cm au-dessus de la pose, pour la hauteur par défaut h. */
function kBase(X, w, d, top) {
  X.box(-w / 2, -d / 2, w / 2, d / 2 - 6, 0, 10, K3.dark);
  X.box(-w / 2, -d / 2, w / 2, d / 2, 10, 86, K3.white);
  if (top !== false) X.box(-w / 2, -d / 2, w / 2, d / 2 + 1.5, 86, 89.5, K3.stone);
}
function sofa(X, w, d, sd) {
  const bk = Math.min(22, d * 0.24), arm = Math.min(18, w * 0.12), dd = sd || d;
  X.box(-w / 2, -d / 2, w / 2, -d / 2 + dd, 4, 22, K3.fabric);
  X.box(-w / 2 + arm, -d / 2 + bk, w / 2 - arm, -d / 2 + dd, 22, 44, K3.fabric2);
  X.box(-w / 2, -d / 2, w / 2, -d / 2 + bk, 22, 82, K3.fabric);
  X.box(-w / 2, -d / 2 + bk - 3, -w / 2 + arm, -d / 2 + dd, 22, 62, K3.fabric);
  X.box(w / 2 - arm, -d / 2 + bk - 3, w / 2, -d / 2 + dd, 22, 62, K3.fabric);
}
function legs4(X, w, d, z1, s, ins, col) { const a = w / 2 - ins - s, b = d / 2 - ins - s; for (const [x, y] of [[-a, -b], [a, -b], [a, b], [-a, b]]) X.box(x - s / 2, y - s / 2, x + s / 2, y + s / 2, 0, z1, col || K3.woodDk); }
function tap3(X, x, y, z) { X.cyl(x, y, 1.6, z, z + 22, K3.steel, 10); X.box(x - 1.2, y, x + 1.2, y + 14, z + 19, z + 22, K3.steel); }
const F3 = {
  meuble_bas: { h: 90, f: (X, w, d) => { kBase(X, w, d); X.box(-w * 0.18, d / 2, w * 0.18, d / 2 + 1.5, 79, 81, K3.steel); } },
  meuble_haut: { h: 70, z: 145, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 70, K3.white); X.box(-w * 0.18, d / 2, w * 0.18, d / 2 + 1.5, 4, 6, K3.steel); } },
  colonne: { h: 215, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2 - 6, 0, 10, K3.dark); X.box(-w / 2, -d / 2, w / 2, d / 2, 10, 215, K3.white); X.box(-w * 0.18, d / 2, w * 0.18, d / 2 + 1.5, 120, 122, K3.steel); } },
  plan_travail: { h: 90, f: (X, w, d) => X.box(-w / 2, -d / 2, w / 2, d / 2, 86.5, 90, K3.stone) },
  evier1: { h: 90, f: (X, w, d) => { kBase(X, w, d); X.box(-w * 0.32, -d * 0.28, w * 0.32, d * 0.32, 89.3, 90.3, K3.steel); tap3(X, 0, -d / 2 + 5, 90); } },
  evier2: { h: 90, f: (X, w, d) => { kBase(X, w, d); X.box(-w * 0.44, -d * 0.28, -w * 0.03, d * 0.32, 89.3, 90.3, K3.steel); X.box(w * 0.03, -d * 0.28, w * 0.44, d * 0.32, 89.3, 90.3, K3.steel); tap3(X, 0, -d / 2 + 5, 90); } },
  evier_eg: { h: 90, f: (X, w, d) => { kBase(X, w, d); X.box(-w * 0.44, -d * 0.28, 0, d * 0.32, 89.3, 90.3, K3.steel); X.box(w * 0.04, -d * 0.28, w * 0.44, d * 0.32, 89.3, 89.9, K3.white2); tap3(X, -w * 0.22, -d / 2 + 5, 90); } },
  plaque: { h: 90, f: (X, w, d) => { kBase(X, w, d); X.box(-w * 0.45, -d * 0.42, w * 0.45, d * 0.42, 89.3, 90.1, K3.black); } },
  plaque90: { h: 90, f: (X, w, d) => { kBase(X, w, d); X.box(-w * 0.46, -d * 0.42, w * 0.46, d * 0.42, 89.3, 90.1, K3.black); } },
  four: { h: 86, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2 - 6, 0, 10, K3.dark); X.box(-w / 2, -d / 2, w / 2, d / 2, 10, 86, K3.white); X.box(-w * 0.43, d / 2, w * 0.43, d / 2 + 1, 18, 72, K3.black); } },
  lave_vaisselle: { h: 85, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 85, K3.steel); X.box(-w * 0.3, d / 2, w * 0.3, d / 2 + 1.5, 76, 78, K3.dark); } },
  frigo: { h: 185, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 185, K3.white); X.box(-w / 2 + 1, d / 2, w / 2 - 1, d / 2 + 0.6, 118, 119.5, K3.dark); X.box(w * 0.36, d / 2, w * 0.42, d / 2 + 2.5, 130, 160, K3.steel); X.box(w * 0.36, d / 2, w * 0.42, d / 2 + 2.5, 85, 110, K3.steel); } },
  frigo_us: { h: 180, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 180, K3.steel); X.box(-0.6, d / 2, 0.6, d / 2 + 0.6, 2, 178, K3.dark); X.box(-5, d / 2, -3, d / 2 + 3, 70, 150, K3.white2); X.box(3, d / 2, 5, d / 2 + 3, 70, 150, K3.white2); } },
  congelateur: { h: 85, f: (X, w, d) => X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 85, K3.white) },
  micro_ondes: { h: 30, z: 90, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 30, K3.dark); X.box(-w * 0.42, d / 2, w * 0.15, d / 2 + 0.6, 5, 25, K3.black); } },
  hotte: { h: 14, z: 155, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 14, K3.steel); X.box(-w * 0.17, -d / 2, w * 0.17, -d / 2 + d * 0.45, 14, Math.max(15, X.toCeil()), K3.steel); } },
  ilot: { h: 90, f: (X, w, d) => { X.box(-w / 2 + 3, -d / 2 + 3, w / 2 - 3, d / 2 - 3, 0, 10, K3.dark); X.box(-w / 2 + 3, -d / 2 + 3, w / 2 - 3, d / 2 - 3, 10, 86, K3.white); X.box(-w / 2, -d / 2, w / 2, d / 2, 86, 90, K3.stone); } },
  table_rect: { h: 75, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 71, 75, K3.wood); legs4(X, w, d, 71, 5, 3); } },
  table_ronde: { h: 75, f: (X, w, d) => { X.cyl(0, 0, Math.min(w, d) / 2, 71, 75, K3.wood, 32); X.cyl(0, 0, 5, 3, 71, K3.woodDk, 12); X.cyl(0, 0, Math.min(w, d) * 0.22, 0, 3, K3.woodDk, 20); } },
  chaise: { h: 88, f: (X, w, d) => { legs4(X, w, d, 44, 3, 2); X.box(-w / 2 + 1, -d / 2 + 2, w / 2 - 1, d / 2 - 1, 43, 47, K3.wood); X.box(-w / 2 + 2, -d / 2 + 1, w / 2 - 2, -d / 2 + 4, 47, 88, K3.wood); } },
  canape: { h: 82, f: (X, w, d) => sofa(X, w, d) },
  fauteuil: { h: 82, f: (X, w, d) => sofa(X, w, d) },
  canape_angle: { h: 82, f: (X, w, d) => {
    const sd = Math.min(100, d * 0.55), cw = Math.min(100, w * 0.42), bk = 22, arm = 18;
    X.poly([[-w / 2, -d / 2], [w / 2, -d / 2], [w / 2, -d / 2 + sd], [-w / 2 + cw, -d / 2 + sd], [-w / 2 + cw, d / 2], [-w / 2, d / 2]], 4, 22, K3.fabric);
    X.poly([[-w / 2 + bk, -d / 2 + bk], [w / 2 - arm, -d / 2 + bk], [w / 2 - arm, -d / 2 + sd], [-w / 2 + cw, -d / 2 + sd], [-w / 2 + cw, d / 2], [-w / 2 + bk, d / 2]], 22, 44, K3.fabric2);
    X.box(-w / 2, -d / 2, w / 2, -d / 2 + bk, 22, 82, K3.fabric); X.box(-w / 2, -d / 2 + bk, -w / 2 + bk, d / 2, 22, 82, K3.fabric);
    X.box(w / 2 - arm, -d / 2 + bk - 3, w / 2, -d / 2 + sd, 22, 62, K3.fabric);
  } },
  table_basse: { h: 40, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 36, 40, K3.wood); legs4(X, w, d, 36, 4, 3); } },
  meuble_tv: { h: 50, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 5, 50, K3.wood); X.box(-w * 0.3, -d / 2 + 4, w * 0.3, -d / 2 + 8, 50, 50 + w * 0.3 * 0.56 * 2, K3.black); } },
  bibliotheque: { h: 200, f: (X, w, d) => { X.box(-w / 2, -d / 2, -w / 2 + 2, d / 2, 0, 200, K3.wood); X.box(w / 2 - 2, -d / 2, w / 2, d / 2, 0, 200, K3.wood); X.box(-w / 2, -d / 2, w / 2, -d / 2 + 1.5, 0, 200, K3.woodDk); for (let z = 0; z <= 198; z += 39.6) X.box(-w / 2 + 2, -d / 2, w / 2 - 2, d / 2, z, z + 2, K3.wood); } },
  poele: { h: 100, f: (X, w, d) => { X.cyl(0, 0, Math.min(w, d) * 0.45, 0, 100, K3.black, 24); X.cyl(0, -d * 0.1, 7, 100, Math.max(101, X.toCeil()), K3.black, 14); } },
  cheminee: { h: 110, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 8, K3.stone); X.box(-w / 2, -d / 2, w / 2, -d / 2 + d * 0.62, 8, 110, K3.stone); X.box(-w * 0.32, -d / 2 + d * 0.62, w * 0.32, -d / 2 + d * 0.64, 22, 78, K3.black); X.box(-w * 0.34, -d / 2, w * 0.34, -d / 2 + d * 0.5, 110, Math.max(111, X.toCeil()), K3.white); } },
  tapis: { h: 1, f: (X, w, d) => X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 1, [196, 182, 160]) },
  plante: { h: 110, f: (X, w, d) => { const r = Math.min(w, d) / 2; X.cyl(0, 0, r * 0.5, 0, 34, K3.pot, 18); X.sph(0, 0, 74, r * 0.95, K3.leaf); } },
  lit: { h: 100, f: (X, w, d) => {
    X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 30, K3.wood); X.box(-w / 2 + 2, -d / 2 + 5, w / 2 - 2, d / 2 - 2, 30, 50, K3.white);
    X.box(-w / 2 + 1, -d / 2 + 48, w / 2 - 1, d / 2 - 1, 48, 55, K3.fabric2); X.box(-w / 2, -d / 2, w / 2, -d / 2 + 5, 0, 100, K3.woodDk);
    if (w >= 120) { X.box(-w / 2 + 8, -d / 2 + 9, -3, -d / 2 + 40, 50, 59, K3.white2); X.box(3, -d / 2 + 9, w / 2 - 8, -d / 2 + 40, 50, 59, K3.white2); }
    else X.box(-w / 2 + 8, -d / 2 + 9, w / 2 - 8, -d / 2 + 40, 50, 59, K3.white2);
  } },
  lit_superpose: { h: 170, f: (X, w, d) => { legs4(X, w, d, 170, 5, 0); for (const z of [22, 125]) { X.box(-w / 2, -d / 2, w / 2, d / 2, z, z + 10, K3.wood); X.box(-w / 2 + 3, -d / 2 + 3, w / 2 - 3, d / 2 - 3, z + 10, z + 26, K3.white); } } },
  lit_bebe: { h: 90, f: (X, w, d) => { legs4(X, w, d, 90, 4, 0); X.box(-w / 2, -d / 2, w / 2, d / 2, 30, 40, K3.white2); X.box(-w / 2 + 2, -d / 2 + 2, w / 2 - 2, d / 2 - 2, 40, 50, K3.white); for (const y of [-d / 2, d / 2 - 3]) X.box(-w / 2, y, w / 2, y + 3, 85, 90, K3.white2); } },
  chevet: { h: 50, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 50, K3.wood); X.box(-w * 0.3, d / 2, w * 0.3, d / 2 + 1, 38, 40, K3.woodDk); } },
  armoire: { h: 200, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 200, K3.white2); X.box(-0.4, d / 2, 0.4, d / 2 + 0.5, 2, 198, K3.dark); X.box(-4, d / 2, -2.5, d / 2 + 2.5, 90, 120, K3.steel); X.box(2.5, d / 2, 4, d / 2 + 2.5, 90, 120, K3.steel); } },
  dressing: { h: 220, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, -d / 2 + 2, 0, 220, K3.white2); for (const x of [-w / 2, -1, w / 2 - 2]) X.box(x, -d / 2, x + 2, d / 2, 0, 220, K3.white2); X.box(-w / 2, -d / 2, w / 2, d / 2, 218, 220, K3.white2); X.box(-w / 2, -d / 2, w / 2, d / 2, 30, 32, K3.white2); X.cyl(-w / 4, 0, 1.2, 175, 177.5, K3.steel, 8); } },
  placard: { h: 250, f: (X, w, d) => { const top = Math.max(150, X.toCeil()); X.box(-w / 2, -d / 2, w / 2, d / 2 - 6, 0, top, K3.white2); X.box(-w / 2, d / 2 - 6, 1, d / 2 - 3, 1, top - 1, K3.white); X.box(-1, d / 2 - 3, w / 2, d / 2, 1, top - 1, K3.white); } },
  commode: { h: 85, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 85, K3.wood); for (const z of [26, 52]) X.box(-w / 2 + 1, d / 2, w / 2 - 1, d / 2 + 0.5, z, z + 1, K3.woodDk); } },
  bureau: { h: 75, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 72, 75, K3.wood); X.box(-w / 2, -d / 2, -w / 2 + 3, d / 2, 0, 72, K3.white2); X.box(w / 2 - 3, -d / 2, w / 2, d / 2, 0, 72, K3.white2); } },
  chaise_bureau: { h: 100, f: (X, w, d) => { const r = Math.min(w, d) / 2; X.cyl(0, 0, r * 0.9, 2, 6, K3.black, 18); X.cyl(0, 0, 2.5, 6, 44, K3.steel, 10); X.box(-r * 0.8, -r * 0.8, r * 0.8, r * 0.8, 44, 51, K3.dark); X.box(-r * 0.7, -r * 0.85, r * 0.7, -r * 0.65, 56, 100, K3.dark); } },
  baignoire: { h: 58, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 58, K3.white); X.box(-w / 2 + 7, -d / 2 + 7, w / 2 - 7, d / 2 - 7, 57.6, 58.5, K3.water); } },
  baignoire_ilot: { h: 60, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 60, K3.white); X.box(-w / 2 + 6, -d / 2 + 6, w / 2 - 6, d / 2 - 6, 59.6, 60.5, K3.water); } },
  douche: { h: 200, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 5, K3.white); X.glass(-w / 2, d / 2 - 1, w / 2, d / 2, 5, 200); X.glass(w / 2 - 1, -d / 2, w / 2, d / 2 - 1, 5, 200); X.cyl(-w / 2 + 6, -d / 2 + 4, 1.2, 5, 195, K3.steel, 8); } },
  douche_ita: { h: 200, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 1, K3.tile); X.glass(-w / 2, d / 2 - 1, w * 0.1, d / 2, 1, 200); X.cyl(-w / 2 + 6, -d / 2 + 4, 1.2, 1, 195, K3.steel, 8); } },
  lavabo: { h: 88, f: (X, w, d) => { X.cyl(0, -d / 2 + 14, 7, 0, 78, K3.white, 14); X.box(-w / 2, -d / 2, w / 2, d / 2, 78, 88, K3.white); X.box(-w * 0.35, -d * 0.28, w * 0.35, d * 0.34, 87.6, 88.5, K3.water); tap3(X, 0, -d / 2 + 4, 88); } },
  vasque2: { h: 88, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2 - 2, 20, 80, K3.wood); X.box(-w / 2, -d / 2, w / 2, d / 2, 80, 85, K3.white); for (const x of [-w / 4, w / 4]) { X.box(x - w * 0.16, -d * 0.25, x + w * 0.16, d * 0.32, 85, 88, K3.white); tap3(X, x, -d / 2 + 4, 85); } } },
  wc: { h: 80, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, -d / 2 + 18, 0, 80, K3.white); X.cyl(0, d / 2 - w * 0.42, w * 0.42, 0, 40, K3.white, 20); X.box(-w * 0.32, -d / 2 + 18, w * 0.32, d / 2 - w * 0.42, 0, 40, K3.white); } },
  wc_susp: { h: 112, f: (X, w, d) => { X.box(-w / 2 - 6, -d / 2, w / 2 + 6, -d / 2 + 14, 0, 112, K3.white2); X.box(-9, -d / 2 + 14, 9, -d / 2 + 14.6, 95, 108, K3.steel); X.box(-w * 0.42, -d / 2 + 14, w * 0.42, d / 2, 28, 42, K3.white); } },
  lave_mains: { h: 85, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 76, 85, K3.white); tap3(X, 0, -d / 2 + 3, 85); } },
  bidet: { h: 40, f: (X, w, d) => { X.box(-w * 0.4, -d / 2, w * 0.4, d / 2 - w * 0.4, 0, 40, K3.white); X.cyl(0, d / 2 - w * 0.4, w * 0.4, 0, 40, K3.white, 18); } },
  seche_serv: { h: 110, z: 60, f: (X, w, d) => { X.box(-w / 2, -d / 2, -w / 2 + 3, d / 2, 0, 110, K3.white); X.box(w / 2 - 3, -d / 2, w / 2, d / 2, 0, 110, K3.white); for (let z = 6; z < 106; z += 8) X.box(-w / 2 + 3, -d / 2 + 2, w / 2 - 3, d / 2 - 2, z, z + 2.4, K3.white); } },
  lave_linge: { h: 85, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 85, K3.white); X.box(-w * 0.24, d / 2, w * 0.24, d / 2 + 1.5, 18, 62, K3.dark); } },
  seche_linge: { h: 85, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 85, K3.white); X.box(-w * 0.24, d / 2, w * 0.24, d / 2 + 1.5, 18, 62, K3.dark); } },
  chauffe_eau: { h: 140, z: 60, f: (X, w, d) => X.cyl(0, 0, Math.min(w, d) / 2, 0, 140, K3.white, 24) },
  radiateur: { h: 60, z: 15, f: (X, w, d) => X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 60, K3.white) },
  chaudiere: { h: 75, z: 110, f: (X, w, d) => { X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 75, K3.white); X.box(-w * 0.3, d / 2, w * 0.3, d / 2 + 0.6, 50, 60, K3.dark); } },
  poteau: { h: 250, f: (X, w, d) => X.box(-w / 2, -d / 2, w / 2, d / 2, 0, Math.max(100, X.toCeil()), K3.stone) },
  voiture: { h: 145, f: (X, w, d) => {
    for (const [x, y] of [[-w / 2, -d * 0.32], [w / 2 - 22, -d * 0.32], [-w / 2, d * 0.32], [w / 2 - 22, d * 0.32]]) X.box(x, y - 33, x + 22, y + 33, 0, 66, K3.black);
    X.box(-w / 2 + 2, -d / 2, w / 2 - 2, d / 2, 30, 90, [76, 104, 140]); X.box(-w / 2 + 10, -d * 0.28, w / 2 - 10, d * 0.2, 90, 142, [120, 144, 170]);
  } },
  bloc: { h: 90, f: (X, w, d) => X.box(-w / 2, -d / 2, w / 2, d / 2, 0, 90, K3.white2) },
};
const f3Def = (it) => F3[it.type] || F3.bloc;
function itemHeight3(it) { const f = f3Def(it); return { h: it.ht || f.h, z: it.zb != null ? it.zb : f.z || 0 }; }

/* ---------------- électricité : tailles des appareils (l × h × épaisseur, cm) ---------------- */
const EL3 = {
  pc2: [15, 8, 1.4], pc3: [22, 8, 1.4], pc4: [29, 8, 1.4], int_d: [8, 8, 1.4], int_triple: [8, 8, 1.4], vv_double: [15, 8, 1.4],
  tableau: [60, 75, 12], tab_div: [45, 55, 10], db: [22, 30, 10], compteur: [25, 35, 12], com: [36, 46, 9], gtl: [25, 0, 12], ccpi: [20, 25, 10],
  coffret_ext: [35, 45, 15], coffret_piscine: [35, 45, 15], baie: [55, 60, 40], nvr: [36, 6, 25], box: [22, 4, 15], onduleur: [40, 50, 15], batterie: [60, 80, 20],
  rad_elec: [70, 50, 9], seche_serv_e: [50, 100, 8], clim: [80, 28, 20], volet_mot: [100, 18, 18], store: [300, 18, 22], baes: [35, 12, 8],
  applique: [14, 14, 12], hublot: [26, 26, 10], applique_ext: [14, 20, 14], projecteur: [22, 16, 14], proj_det: [22, 16, 14], miroir: [50, 6, 8], eclairage_placard: [30, 4, 4], balise_marche: [10, 6, 2], veilleuse: [7, 7, 2],
  pac: [80, 62, 30], borne_ve: [30, 45, 15], extracteur: [18, 18, 6], camera: [8, 8, 16], sirene: [15, 15, 6], sirene_ext: [22, 28, 8], centrale: [30, 30, 9], transmetteur: [18, 12, 5],
  entree_air: [35, 4, 4], interphone: [12, 20, 4], platine: [12, 25, 4], clavier: [12, 14, 3], thermostat: [9, 9, 2.5], domo: [18, 12, 2], parabole: [60, 60, 30], sonde_ext: [6, 10, 4], capteur_vent: [10, 10, 10],
  det_ir: [7, 11, 5], det_pres: [8, 8, 5], det_ouv: [3, 8, 2], det_bris: [5, 5, 2], det_co: [12, 12, 4], det_gaz: [10, 10, 4], ev_gaz: [10, 10, 10], arret_urg: [8, 8, 6], declencheur: [9, 9, 5], serrure: [6, 14, 4], gache: [3, 12, 2], digicode: [9, 12, 3], badge: [8, 12, 3], barriere_ir: [5, 30, 5],
  chaudiere_e: [8, 8, 1.4], sortie: [8, 8, 1.4], les: [6, 6, 2],
};

/* ---------------- construction de la maquette ---------------- */
const V3DEF = { mode: 'orbit', above: false, furn: true, elec: true, ducts: true, labels: true, shadows: true, walls: 'full', route: 'plafond', panel: true,
  cables: false, xray: false, cut: 'none', cutH: 120, cutX: 0.5, cutZ: 0.5, cutFlip: false, hid: {} };
function v3o() { if (!S.v3 || typeof S.v3 !== 'object') S.v3 = {}; for (const k in V3DEF) if (!(k in S.v3)) S.v3[k] = k === 'hid' ? {} : V3DEF[k]; if (!S.v3.hid || typeof S.v3.hid !== 'object') S.v3.hid = {}; return S.v3; }
/* objets masqués dans la vue 3D (réglage de l'affichage, par plan : le plan lui-même n'est jamais modifié) */
function v3Hidden() { const o = v3o(), l = o.hid[P.id]; return new Set(Array.isArray(l) ? l : []); }
function v3SetHidden(set) { const o = v3o(); if (set.size) o.hid[P.id] = [...set].slice(-500); else delete o.hid[P.id]; saveSettings(); }
/* emprise d'un escalier dans le monde : contour réel (en L, en U…) et morceaux convexes (voir stairZones) */
function stairFootprint(it) {
  const z = stairZones(it), W = (p) => itemToWorld(it, p.x, p.y);
  return { contour: z.contour.map(W), parts: z.parts.map((q) => q.map(W)) };
}
/* deux segments se coupent-ils (intérieur strict) ? */
function segCross(a, b, c, d) {
  const o = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  return ((d1 > 1e-6 && d2 < -1e-6) || (d1 < -1e-6 && d2 > 1e-6)) && ((d3 > 1e-6 && d4 < -1e-6) || (d3 < -1e-6 && d4 > 1e-6));
}
/* trous à découper dans le sol d'une pièce pour les escaliers donnés (escaliers sans trémie exclus par l'appelant) :
   contour exact quand l'escalier est entièrement dans la pièce, sinon chaque morceau convexe découpé par la pièce */
function tremieHoles(r, foots) {
  const out = [];
  for (const fp of foots) {
    const c = fp.contour, poly = r.poly;
    const dedans = c.every((p) => inPoly(p, poly) && distToEdges(p, poly) > 1)
      && !c.some((p, i) => { const q = c[(i + 1) % c.length]; return poly.some((u, j) => segCross(p, q, u, poly[(j + 1) % poly.length])); });
    if (dedans) { out.push(c); continue; }
    for (const part of fp.parts) { const ix = cleanRing(clipConvex(poly, part)); if (ix.length >= 3 && Math.abs(ringArea(ix)) > 200) out.push(shrinkRing(ix, 0.6)); }
  }
  return out;
}
/* l'escalier découpe-t-il le sol de l'étage du dessus ? (réglage « trémie » de l'escalier, format v15) */
const avecTremie = (it) => it.tremie !== 'aucune';
function floorCol3(r) {
  const base = estExterieure(r.label) ? K3.terrasse : K3.floor, t = r.label && r.label.tint;
  return t && TINT3[t] ? mixRGB(base, TINT3[t], 0.3) : base;
}
/* la pièce est-elle sous un vide de l'étage du dessus (pièce « sol supprimé ») ? alors pas de plafond (visite) */
function videAuDessus(r, above) {
  if (!above) return false;
  const c = labelPoint(r.poly);
  return geo(above.id).rooms.some((q) => q.label && q.label.sol === 'vide' && inPoly(c, q.poly));
}
function elecAccent(e, def) {
  if (e.cid && S.layers.circ !== false) { const c = circuitColor(e.cid, true); if (c) return hexRGB(c); }
  return CAT3[def.cat] || [96, 104, 112];
}

function build3D() {
  const o = v3o(), visit = o.mode === 'visit';
  const G = { s: new GB(), g: new GB(), w: new GB(), picks: [null], labels: [], bb: { x0: Infinity, z0: Infinity, x1: -Infinity, z1: -Infinity, y0: Infinity, y1: -Infinity } };
  const pick = (ref) => { G.picks.push(ref); return G.picks.length - 1; };
  const grow = (x, y, z) => { const b = G.bb; if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (z < b.z0) b.z0 = z; if (z > b.z1) b.z1 = z; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; };
  const Ls = levelsSorted(), cur = levelOf(ui.lv) || Ls[0];
  const vis = Ls.filter((l) => visit || o.above || l.elev <= cur.elev + 0.01);
  const hid = v3Hidden();
  const GW = Object.assign(Object.create(G), { s: G.w }); // murs et baies : lot à part (transparence)
  let groundY = Infinity;
  for (const lv of vis) {
    const E = lv.elev, Hh = lv.h || 250, below = levelBelow(lv.id);
    const tb = below ? clamp(E - (below.elev + (below.h || 250)), 1, 200) : clamp(lv.slab || 20, 1, 100);
    const g = geo(lv.id);
    const cut = !visit && o.walls === 'low' ? 100 : 0;
    const top = cut ? E + Math.min(Hh, cut) : E + Hh;
    groundY = Math.min(groundY, E - tb);
    for (const n of g.nodes.values()) { grow(n.x, E - tb, n.y); grow(n.x, E + Hh, n.y); }
    // murs, avec les baies découpées
    const opsBy = new Map();
    for (const op of P.openings) { if (!g.walls.has(op.wall)) continue; let a = opsBy.get(op.wall); if (!a) opsBy.set(op.wall, (a = [])); a.push(op); }
    const wTop = (wg) => { const hh = wg.w.h || Hh; return cut ? E + Math.min(hh, cut) : E + hh; };
    for (const wg of g.walls.values()) {
      if (hid.has(wg.w.id)) continue;
      const cl = wg.w.kind === 'cloison';
      wall3(G.w, wg, E - tb, wTop(wg), E, opsBy.get(wg.w.id) || [], cl ? K3.part : K3.wall, cl ? K3.partCap : K3.wallCap, pick({ t: 'wall', id: wg.w.id, lv: lv.id }));
    }
    for (const hb of g.hubs) solid3(G.w, [hb.pts], E - tb, top, hb.mur ? K3.wall : K3.part, 0, { top: hb.mur ? K3.wallCap : K3.partCap });
    // sols (dalle), trémies au-dessus des escaliers du niveau inférieur
    const tremies = below ? P.items.filter((it) => it.lv === below.id && isStair(it.type) && avecTremie(it)).map(stairFootprint) : [];
    const ownStairs = P.items.filter((it) => it.lv === lv.id && isStair(it.type) && avecTremie(it)).map(stairFootprint);
    const above = levelAbove(lv.id);
    for (const r of g.rooms) {
      if (r.label && hid.has(r.label.id)) continue;
      const fc = floorCol3(r);
      /* pièce « sol supprimé » (trémie dessinée, vide sur double hauteur) : pas de dalle */
      if (!(r.label && r.label.sol === 'vide')) solid3(G.s, [r.poly, ...r.holes, ...tremieHoles(r, tremies)], E - tb, E, fc, r.label ? pick({ t: 'room', id: r.label.id, lv: lv.id }) : 0, { top: fc, bot: K3.ceil, side: K3.slabSide });
      /* plafond (visite) : aucun sur une terrasse ou un balcon, ni sous un vide de l'étage du dessus */
      if (visit && !estExterieure(r.label) && !videAuDessus(r, above)) solid3(G.s, [r.poly, ...r.holes, ...tremieHoles(r, ownStairs)], E + Hh - 0.8, E + Hh, K3.ceil, 0, { edges: false });
      if (r.label && o.labels) {
        // points candidats sur le sol de la pièce : l'étiquette se pose sur une partie visible
        const c0 = labelPoint(r.poly), bb = bboxOf(r.poly), pts = [];
        for (let i = 1; i < 6; i++) for (let j = 1; j < 6; j++) { const q = { x: bb.x0 + ((bb.x1 - bb.x0) * i) / 6, y: bb.y0 + ((bb.y1 - bb.y0) * j) / 6 }; if (inPoly(q, r.poly) && distToEdges(q, r.poly) > 25) pts.push(q); }
        pts.sort((a, b) => vdist(a, c0) - vdist(b, c0));
        const cand = [r.label, c0, ...pts.slice(0, 14)].map((q) => [q.x, E + 4, q.y]);
        G.labels.push({ pts: cand, p: cand[0], name: r.label.name, area: fmtArea(r.area), lv: lv.id, rid: r.label.id });
      }
    }
    // portes et fenêtres
    for (const op of P.openings) { const wg = g.walls.get(op.wall); if (wg && !hid.has(op.id) && !hid.has(op.wall)) opening3(GW, wg, op, E, wTop(wg), pick({ t: 'opening', id: op.id, lv: lv.id })); }
    // escaliers et mobilier
    for (const it of P.items) {
      if (it.lv !== lv.id || hid.has(it.id)) continue;
      if (isStair(it.type)) { stair3(G, it, E, pick({ t: 'item', id: it.id, lv: lv.id })); continue; }
      if (!o.furn) continue;
      furn3(G, it, E, Hh, pick({ t: 'item', id: it.id, lv: lv.id }));
    }
    if (o.elec) for (const e of P.elec) if (e.lv === lv.id && elecVisible(e) && !hid.has(e.id)) elec3(G, e, E, Hh, pick({ t: 'elec', id: e.id, lv: lv.id }));
    if (o.ducts) for (const d of P.ducts) if (d.lv === lv.id && ductVisible(d) && !hid.has(d.id)) duct3(G, d, E, Hh, pick({ t: 'duct', id: d.id, lv: lv.id }), o);
  }
  const visIds = new Set(vis.map((l) => l.id));
  if (o.ducts) passages3(G, visIds, hid, pick, o);
  if (o.ducts && o.cables) cables3(G, visIds, pick, o);
  // terrain
  if (isFinite(G.bb.x0)) {
    const b = G.bb, m = Math.max(400, Math.max(b.x1 - b.x0, b.z1 - b.z0) * 0.8);
    const gc = isDarkTheme() ? [44, 49, 54] : [226, 230, 223];
    solid3(G.s, [[{ x: b.x0 - m, y: b.z0 - m }, { x: b.x1 + m, y: b.z0 - m }, { x: b.x1 + m, y: b.z1 + m }, { x: b.x0 - m, y: b.z1 + m }]], groundY - 3, groundY - 1, gc, 0, { edges: false });
    G.groundY = groundY - 1;
  }
  return G;
}

function wall3(gb, wg, z0, z1, E, ops, col, cap, id) {
  const { A, d, n } = wg;
  const loc = wg.poly.map((p) => ({ u: (p.x - A.x) * d.x + (p.y - A.y) * d.y, v: (p.x - A.x) * n.x + (p.y - A.y) * n.y }));
  const toW = (pp) => pp.map((p) => ({ x: A.x + d.x * p.u + n.x * p.v, y: A.y + d.y * p.u + n.y * p.v }));
  const piece = (u0, u1, y0, y1) => {
    if (y1 - y0 < 0.2 || u1 - u0 < 0.05) return;
    const pts = toW(clipHalf(clipHalf(loc, (p) => p.u - u0), (p) => u1 - p.u));
    if (pts.length >= 3) solid3(gb, [pts], y0, y1, col, id, { top: y1 >= z1 - 0.01 ? cap : col });
  };
  const hs = ops.map((o) => { const y0 = E + (o.sill || 0); return { a: o.t - o.w / 2, b: o.t + o.w / 2, y0, y1: o.full ? 1e9 : y0 + (o.h || 200) }; }).sort((p, q) => p.a - q.a);
  let cur = -1e9;
  for (const hh of hs) {
    const a = Math.max(hh.a, cur), b = hh.b; if (b <= a) continue;
    piece(cur, a, z0, z1);
    piece(a, b, z0, Math.min(hh.y0, z1));
    piece(a, b, Math.max(hh.y1, z0), z1);
    cur = b;
  }
  piece(cur, 1e9, z0, z1);
}

function opening3(G, wg, o, E, top, id) {
  const th = wg.th, h2 = th / 2, { A, d, n } = wg;
  const P2 = (u, v) => ({ x: A.x + d.x * u + n.x * v, y: A.y + d.y * u + n.y * v });
  const box = (gb, u0, v0, u1, v1, y0, y1, col, oo) => { y1 = Math.min(y1, top); if (y1 - y0 < 0.2) return; solid3(gb, [[P2(u0, v0), P2(u1, v0), P2(u1, v1), P2(u0, v1)]], y0, y1, col, id, oo); };
  const x0 = o.t - o.w / 2, x1 = o.t + o.w / 2, y0 = E + (o.sill || 0), y1 = o.full ? top : y0 + (o.h || 200), s = o.side || 1, W = x1 - x0;
  if (o.kind === 'gap') {
    // ouverture libre : seul le passe-plat reçoit une tablette
    if ((o.sill || 0) > 20) box(G.s, x0 - 2, -h2 - 3, x1 + 2, h2 + 3, y0 - 3, y0, K3.wood);
    return;
  }
  if (o.kind === 'closet') { closet3(G, o, box, x0, x1, E, Math.min(y1, top), h2, s); return; }
  if (o.kind === 'window') {
    const fw = 5, fd = Math.min(7, th * 0.7);
    box(G.s, x0, -fd / 2, x0 + fw, fd / 2, y0, y1, K3.frame); box(G.s, x1 - fw, -fd / 2, x1, fd / 2, y0, y1, K3.frame);
    box(G.s, x0 + fw, -fd / 2, x1 - fw, fd / 2, y0, y0 + fw, K3.frame); box(G.s, x0 + fw, -fd / 2, x1 - fw, fd / 2, y1 - fw, y1, K3.frame);
    const slide = o.type === 'coulissant' || o.type === 'baie';
    const nl = o.type === 'soufflet' ? 1 : Math.max(slide ? 2 : 1, clamp(o.leaves || 1, 1, 4));
    for (let i = 1; i < nl; i++) { const xm = x0 + (W * i) / nl; box(G.s, xm - 3, -fd / 2, xm + 3, fd / 2, y0 + fw, y1 - fw, K3.frame); }
    box(G.g, x0 + fw, -0.6, x1 - fw, 0.6, y0 + fw, y1 - fw, K3.glass, { edges: false });
    if ((o.sill || 0) > 20) box(G.s, x0 - 3, -h2 - 4, x1 + 3, -h2 + 1, y0 - 4, y0, K3.stone);
    return;
  }
  const t = o.type || 'battante', fw = 4, fd = th + 2;
  box(G.s, x0 - fw, -fd / 2, x0, fd / 2, E, y1, K3.frame); box(G.s, x1, -fd / 2, x1 + fw, fd / 2, E, y1, K3.frame); box(G.s, x0 - fw, -fd / 2, x1 + fw, fd / 2, y1, y1 + fw, K3.frame);
  const leafCol = t === 'entree' ? K3.doorEntry : t === 'garage' ? K3.steel : K3.doorLeaf, lt = t === 'entree' ? 6 : 4, hy = y1 - 1;
  if (t === 'battante' || t === 'entree' || t === 'vaetvient') {
    const leaf = (hx, dir, L) => {
      const ua = dir > 0 ? hx : hx - lt, ub = dir > 0 ? hx + lt : hx;
      box(G.s, ua, s * h2, ub, s * (h2 + L), E + 0.5, hy, leafCol);
      const hv = s * (h2 + L - 7), hu = dir > 0 ? ub : ua;
      box(G.s, hu - (dir > 0 ? 0 : 3), hv - 1, hu + (dir > 0 ? 3 : 0), hv + 1, E + 102, E + 106, K3.steel);
    };
    if ((o.leaves || 1) >= 2) { leaf(x0, 1, W / 2); leaf(x1, -1, W / 2); }
    else leaf(o.hinge ? x1 : x0, o.hinge ? -1 : 1, W);
  } else if (t === 'coulissante') {
    const nn = clamp(o.leaves || 1, 1, 4), lw = W / nn;
    for (let i = 0; i < nn; i++) { const off = 1.5 + (i % 2) * 4; box(G.s, x0 + lw * i - 2, s * (h2 + off), x0 + lw * (i + 1) + 2, s * (h2 + off + 3), E + 0.5, hy, leafCol); }
    box(G.s, x0 - (nn === 1 && !o.hinge ? W : 0), s * h2, x1 + (nn === 1 && o.hinge ? W : 0), s * (h2 + 9), y1 + fw, y1 + fw + 4, K3.steel);
  } else if (t === 'pliante') {
    const nn = clamp(o.leaves || 4, 2, 6), lw = W / nn, dep = Math.min(lw * 0.7, 30);
    for (let i = 0; i < nn; i++) {
      const pa = P2(x0 + lw * i, s * (h2 + (i % 2 ? dep : 0))), pb = P2(x0 + lw * (i + 1), s * (h2 + ((i + 1) % 2 ? dep : 0)));
      const dv = vnorm(vsub(pb, pa)), nn2 = vmul(vperp(dv), 1.2);
      solid3(G.s, [[vadd(pa, nn2), vadd(pb, nn2), vsub(pb, nn2), vsub(pa, nn2)]], E + 0.5, Math.min(hy, top), leafCol, id);
    }
  } else if (t === 'garage') box(G.s, x0, -2, x1, 2, E, y1, leafCol);
}

/* portes de placard fermées, dans la façade côté pièce, avec poignées */
function closet3(G, o, box, x0, x1, E, yt, h2, s) {
  const W = x1 - x0, type = o.type || 'coulissante', col = K3.doorLeaf, hz0 = E + 95, hz1 = E + 135;
  if (yt - E < 5) return;
  if (type === 'coulissante') {
    const n = clamp(o.leaves || 2, 2, 4), lw = W / n, vc = closetPlane(o, h2), r = Math.min(2, Math.max(0.9, h2 * 0.5)), tl = Math.min(2.2, Math.max(1, h2 * 0.55));
    const rail = Math.max(r + tl / 2 + 0.6, 2.5);
    box(G.s, x0, vc - rail, x1, vc + rail, yt - 5, yt, K3.steel);
    box(G.s, x0, vc - rail, x1, vc + rail, E, E + 1.2, K3.steel);
    for (let i = 0; i < n; i++) {
      const off = vc + (i % 2 ? r : -r);
      const a = x0 + lw * i - (i > 0 ? 2.5 : 0), b = x0 + lw * (i + 1) + (i < n - 1 ? 2.5 : 0);
      box(G.s, a, off - tl / 2, b, off + tl / 2, E + 1.2, yt - 5, col);
      // poignée cuvette côté pièce, près du bord qui va vers le centre
      const ex = a + (b - a) / 2 < x0 + W / 2 ? b - 6 : a + 4, fv = off + s * tl / 2;
      box(G.s, ex, Math.min(fv, fv + s * 0.8), ex + 2, Math.max(fv, fv + s * 0.8), hz0, hz1, K3.steel);
    }
    return;
  }
  const n = type === 'pliante' ? ((o.leaves || 2) >= 4 ? 4 : 2) : clamp(o.leaves || 1, 1, 4), lw = W / n;
  const va = s * Math.max(0, h2 - 2.2), vb = s * h2, vlo = Math.min(va, vb), vhi = Math.max(va, vb);
  const hinges = type === 'battante' ? closetLeafHinges(o) : null;
  for (let i = 0; i < n; i++) {
    const a = x0 + lw * i + 0.25, b = x0 + lw * (i + 1) - 0.25;
    box(G.s, a, vlo, b, vhi, E + 1, yt - 1, col);
    let kx = null;
    if (hinges) kx = hinges[i] ? b - 5 : a + 3;
    else if (n === 4 ? (i === 1 || i === 2) : i === (o.hinge ? 0 : 1)) kx = n === 4 ? (i === 1 ? b - 5 : a + 3) : (o.hinge ? a + 3 : b - 5);
    if (kx != null) box(G.s, kx, Math.min(vb, vb + s * 2.5), kx + 2, Math.max(vb, vb + s * 2.5), hz0 + 5, hz1 - 5, K3.steel);
  }
}

function stair3(G, it, E, id) {
  const m = stairModel(it), H = climbHeight(it.lv), n = Math.max(3, Math.round(it.n || 15)), rise = H / n;
  const W = (p) => itemToWorld(it, it.flip ? -p.x : p.x, p.y);
  const helix = it.type === 'esc_helice';
  m.steps.forEach((st, i) => { const yt = E + (i + 1) * rise; solid3(G.s, [st.map(W)], helix ? yt - 5 : E, yt, K3.stair, id, { side: helix ? K3.stair : K3.stairSide }); });
  if (m.landing && it.type === 'esc_quart') {
    const e = clamp(it.e || 90, 40, Math.min(it.w, it.d) - 20), l1 = it.d - e, l2 = it.w - e;
    const n1 = Math.max(1, Math.round((n * l1) / (l1 + l2)));
    solid3(G.s, [m.landing.map(W)], E, E + n1 * rise, K3.stair, id, { side: K3.stairSide });
  }
  if (helix) solid3(G.s, [circlePts(W({ x: 0, y: 0 }), Math.max(3, m.pole || 8), 18)], E, E + H + 95, K3.steel, id);
}

function furn3(G, it, E, Lh, id) {
  const f = f3Def(it), hz = itemHeight3(it), k = hz.h / f.h, Z = E + hz.z;
  const W = (x, y) => itemToWorld(it, it.flip ? -x : x, y);
  const X = {
    box(x0, y0, x1, y1, z0, z1, col) { solid3(G.s, [[W(x0, y0), W(x1, y0), W(x1, y1), W(x0, y1)]], Z + z0 * k, Z + z1 * k, col, id); },
    glass(x0, y0, x1, y1, z0, z1) { solid3(G.g, [[W(x0, y0), W(x1, y0), W(x1, y1), W(x0, y1)]], Z + z0 * k, Z + z1 * k, K3.glass, id, { edges: false }); },
    poly(pts, z0, z1, col) { solid3(G.s, [pts.map(([x, y]) => W(x, y))], Z + z0 * k, Z + z1 * k, col, id); },
    cyl(x, y, r, z0, z1, col, seg) { solid3(G.s, [circlePts(W(x, y), r, seg || 20)], Z + z0 * k, Z + z1 * k, col, id); },
    sph(x, y, z, r, col) { const p = W(x, y); sphere3(G.s, [p.x, Z + z * k, p.y], r, col, id, 14); },
    toCeil() { return (E + Lh - Z) / k; },
  };
  f.f(X, it.w, it.d, it);
}

function elec3(G, e, E, Lh, id) {
  const def = ELEC_BY.get(e.type); if (!def) return;
  const t = e.type, acc = elecAccent(e, def), isL = LIGHTS.has(t);
  const a = (e.rot || 0) * DEG, ca = Math.cos(a), sa = Math.sin(a);
  const Wp = (lx, ly) => ({ x: e.x + lx * ca - ly * sa, y: e.y + lx * sa + ly * ca });
  const box = (x0, y0, x1, y1, z0, z1, col, gb) => solid3(gb || G.s, [[Wp(x0, y0), Wp(x1, y0), Wp(x1, y1), Wp(x0, y1)]], z0, z1, col, id);
  const cyl = (lx, ly, r, z0, z1, col, seg) => solid3(G.s, [circlePts(Wp(lx, ly), r, seg || 18)], z0, z1, col, id);
  const glow = glowC(K3.light);
  if (def.floor) {
    const z = E;
    if (t === 'pc_sol' || t === 'encastre_sol' || t === 'det_fuite' || t === 'terre') { box(-6, -6, 6, 6, z, z + 1.5, t === 'encastre_sol' ? glow : K3.steel); box(-3, -3, 3, 3, z + 1.5, z + 1.9, acc); }
    else if (t === 'borne_ext' || t === 'pc_jardin' || t === 'spot_jardin') { box(-7, -7, 7, 7, z, z + (t === 'spot_jardin' ? 25 : 60), K3.dark); box(-7, -7, 7, 7, z + (t === 'spot_jardin' ? 25 : 60), z + (t === 'spot_jardin' ? 32 : 66), t === 'pc_jardin' ? acc : glow); }
    else if (t === 'ballon_thermo') cyl(0, 30, 30, z, z + 180, K3.white, 24);
    else if (t === 'pompe') cyl(0, 0, 15, z, z + 30, acc, 16);
    else if (t === 'plancher') box(-30, -30, 30, 30, z + 0.2, z + 0.6, mixRGB(acc, [255, 255, 255], 0.5));
    else { const s = { groupe: [70, 50, 55], portail: [30, 20, 30], moteur: [40, 30, 30] }[t] || [16, 16, 10]; box(-s[0] / 2, -s[1] / 2, s[0] / 2, s[1] / 2, z, z + s[2], K3.dark); box(-s[0] / 4, s[1] / 2, s[0] / 4, s[1] / 2 + 0.5, z + s[2] * 0.6, z + s[2] * 0.8, acc); }
    return;
  }
  if (!def.wall && e.h == null) {
    const zc = E + Lh;
    switch (t) {
      case 'pl': cyl(0, 0, 5, zc - 2, zc, K3.white, 14); cyl(0, 0, 0.4, zc - 14, zc - 2, K3.dark, 6); sphere3(G.s, [e.x, zc - 19, e.y], 5.5, glow, id, 12); break;
      case 'plafonnier': cyl(0, 0, 18, zc - 7, zc, glow, 28); break;
      case 'suspension': cyl(0, 0, 5, zc - 2, zc, K3.white, 14); cyl(0, 0, 0.4, zc - 60, zc - 2, K3.dark, 6); cyl(0, 0, 17, zc - 76, zc - 60, glow, 24); break;
      case 'spot': case 'spot_orient': cyl(0, 0, 4.5, zc - (t === 'spot' ? 1 : 6), zc, glow, 14); break;
      case 'reglette': box(-60, -4, 60, 4, zc - 5, zc, glow); break;
      case 'led': box(-50, -1, 50, 1, zc - 1, zc, glow); break;
      case 'dalle_led': box(-30, -30, 30, 30, zc - 2, zc, glow); break;
      case 'rail_spot': box(-50, -1.5, 50, 1.5, zc - 3, zc, K3.dark); for (const x of [-35, 0, 35]) cyl(x, 0, 3, zc - 11, zc - 3, glow, 10); break;
      case 'daaf': case 'det_plaf': case 'det_chaleur': cyl(0, 0, 6, zc - 4, zc, K3.white, 18); cyl(0, 0, 1.6, zc - 4.4, zc - 4, acc, 8); break;
      case 'vmc': case 'vmc_insuff': cyl(0, 0, 9, zc - 2.5, zc, [214, 218, 220], 20); cyl(0, 0, 4, zc - 3, zc - 2.5, K3.dark, 14); break;
      case 'ventilo': cyl(0, 0, 8, zc - 22, zc, K3.white2, 16); for (let i = 0; i < 4; i++) { const b = i * Math.PI / 2, c = Math.cos(b), s2 = Math.sin(b); const p0 = { x: e.x + c * 8, y: e.y + s2 * 8 }, p1 = { x: e.x + c * 62, y: e.y + s2 * 62 }, nn = vmul({ x: -s2, y: c }, 6); solid3(G.s, [[vadd(p0, nn), vadd(p1, nn), vsub(p1, nn), vsub(p0, nn)]], zc - 21, zc - 19.5, K3.wood, id); } break;
      case 'camera_dome': sphere3(G.s, [e.x, zc - 3, e.y], 7, K3.white2, id, 12); break;
      case 'hp': cyl(0, 0, 10, zc - 1.5, zc, K3.white2, 20); break;
      case 'wifi': cyl(0, 0, 9, zc - 3, zc, K3.white, 18); cyl(0, 0, 2, zc - 3.3, zc - 3, acc, 8); break;
      case 'ce_elec': cyl(0, 0, 28, E, E + 150, K3.white, 24); break;
      case 'vmc_groupe': box(-23, -23, 23, 23, zc - 25, zc, [214, 218, 220]); break;
      case 'vmc_df': box(-40, -30, 40, 30, zc - 30, zc, [214, 218, 220]); break;
      case 'garage_mot': box(-15, -10, 15, 10, zc - 12, zc, K3.dark); box(-2, -150, 2, 0, zc - 4, zc, K3.steel); break;
      case 'int_tirette': box(-4, -4, 4, 4, zc - 3, zc, K3.white); cyl(0, 0, 0.3, zc - 60, zc - 3, K3.dark, 6); break;
      default: box(-10, -10, 10, 10, zc - 6, zc, K3.white2); box(-5, -5, 5, 5, zc - 6.4, zc - 6, acc);
    }
    return;
  }
  // appareils muraux : (e.x, e.y) est sur la face du mur, y local vers la pièce
  const sz = EL3[t] || [8, 8, 1.4];
  let w = sz[0], hh = sz[1], dp = sz[2];
  let zc = E + (e.h != null ? e.h : def.h != null ? def.h : 110);
  if (t === 'gtl' || def.fullH) { hh = Lh - 2; zc = E + Lh / 2; }
  if (t === 'rad_elec') zc += hh / 2 + 5;
  if (t === 'seche_serv_e') zc += hh / 2;
  if (t === 'pac') zc = E + hh / 2;
  const z0 = zc - hh / 2, z1 = zc + hh / 2;
  const glowing = isL && t !== 'balise_marche' ? glow : null;
  box(-w / 2, 0, w / 2, dp, z0, z1, glowing || K3.white);
  if (!glowing) {
    const iw = Math.max(2, Math.min(w - 2.5, w * 0.7)), ih = Math.max(2, Math.min(hh - 2.5, hh * 0.7));
    box(-iw / 2, dp, iw / 2, dp + 0.5, zc - ih / 2, zc + ih / 2, acc);
  } else box(-w / 2 - 0.5, -0.1, w / 2 + 0.5, 1, z0 - 0.5, z1 + 0.5, acc);
}

/* boîte horizontale le long d'un tronçon (goulotte, chemin de câbles) : empreinte rectangulaire extrudée en hauteur */
function segBox3(gb, a, b, w, y0, y1, col, id, ext) {
  const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy); if (L < 0.01) return;
  const ux = dx / L, uy = dy / L, nx = -uy * w / 2, ny = ux * w / 2, e = ext || 0;
  const A = { x: a.x - ux * e, y: a.y - uy * e }, B = { x: b.x + ux * e, y: b.y + uy * e };
  solid3(gb, [[{ x: A.x + nx, y: A.y + ny }, { x: B.x + nx, y: B.y + ny }, { x: B.x - nx, y: B.y - ny }, { x: A.x - nx, y: A.y - ny }]], y0, y1, col, id);
}
/* hauteur (altitude) du parcours d'un conduit dans la vue 3D : sa pose si elle est précisée, sinon le réglage de la vue */
function ductY3(d, E, Lh, half, o) {
  const zr = hauteurParcours(P, d);
  return zr != null ? clamp(E + zr, E + half + 1, E + Lh - half - 1.5) : d.sys === 'vmc' || o.route !== 'sol' ? E + Lh - half - 1.5 : E + half + 1;
}
const K3GOUL = [240, 240, 236];
function duct3(G, d, E, Lh, id, o) {
  const pts = ductPts(d); if (pts.length < 2) return;
  const k = d.sys === 'elec' ? kindOf(d) : null, rect = k === 'goulotte' || k === 'cdc';
  const r = Math.max(0.8, (d.dia || (d.sys === 'vmc' ? 125 : 20)) / 20);
  /* goulotte et chemin de câbles : dimensions saisies (mm → cm) ; sans dimensions, dessin indicatif 60 × 40 mm */
  const wR = rect ? (d.lw > 0 ? d.lw : 60) / 10 : 0, hR = rect ? (d.lh > 0 ? d.lh : 40) / 10 : 0;
  const half = rect ? hR / 2 : r, side = rect ? wR / 2 : r;
  const y = ductY3(d, E, Lh, half, o);
  const gb = o.cables && d.sys === 'elec' ? G.g : G.s; // câbles affichés : gaines transparentes
  const col = d.sys === 'vmc' ? K3.vmc : k === 'goulotte' ? K3GOUL : k === 'cdc' ? K3.steel : (d.cid && hexRGB(circuitColor(d.cid, true) || '#7C63D2')) || K3.gaine;
  const P3 = pts.map((p) => [p.x, y, p.y]);
  const drops = [];
  for (const [eid, idx] of [[d.a, 0], [d.b, P3.length - 1]]) {
    const e = eid && IDX.elec.get(eid); if (!e) continue; const def = ELEC_BY.get(e.type); if (!def) continue;
    if (e.type === TRAVERSEE || def.fullH) continue; // le passage et la GTL sont traversés : pas de descente
    if (def.wall) { const f = itemToWorld(e, 0, side + 1); P3[idx] = [f.x, y, f.y]; drops.push([P3[idx], E + (e.h != null ? e.h : def.h || 110)]); }
    else if (def.floor) drops.push([P3[idx], E + 2]);
    else if (d.pose === 'sol' || d.pose === 'hauteur' || d.pose === 'cloison') drops.push([P3[idx], E + Lh - 1]); // appareil au plafond, gaine plus bas : remontée
  }
  if (rect) {
    for (let i = 1; i < P3.length; i++) {
      const a = { x: P3[i - 1][0], y: P3[i - 1][2] }, b = { x: P3[i][0], y: P3[i][2] };
      if (k === 'goulotte') segBox3(gb, a, b, wR, y - half, y + half, col, id, wR / 2);
      else { // chemin de câbles : fond et deux rebords (tôle de 4 mm)
        segBox3(gb, a, b, wR, y - half, y - half + 0.4, col, id, wR / 2);
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * (wR / 2 - 0.2), ny = dx / L * (wR / 2 - 0.2);
        for (const s2 of [1, -1]) segBox3(gb, { x: a.x + nx * s2, y: a.y + ny * s2 }, { x: b.x + nx * s2, y: b.y + ny * s2 }, 0.4, y - half, y + half, col, id, wR / 2);
      }
    }
    // descentes : goulotte le long du mur ; depuis un chemin de câbles, une gaine
    for (const [p, yd] of drops) {
      if (Math.abs(yd - y) < 1) continue;
      if (k === 'goulotte') solid3(gb, [circlePts({ x: p[0], y: p[2] }, Math.min(wR, hR) / 2, 4)], Math.min(yd, y), Math.max(yd, y), col, id);
      else tube3(gb, [p[0], yd, p[2]], p, 1, K3.gaine, id);
    }
    return;
  }
  for (let i = 1; i < P3.length; i++) tube3(gb, P3[i - 1], P3[i], r, col, id);
  for (let i = 1; i < P3.length - 1; i++) sphere3(gb, P3[i], r, col, id, 10);
  for (const [p, yd] of drops) { if (Math.abs(yd - y) < 1) continue; tube3(gb, [p[0], yd, p[2]], p, r, col, id); sphere3(gb, p, r, col, id, 10); }
}
/* passages entre étages : conduit vertical entre les deux symboles jumeaux, à travers le plancher */
function passages3(G, visIds, hid, pick, o) {
  const done = new Set();
  /* colonnes de passage : gaine technique de la taille du tableau, du plancher du niveau le plus bas au plafond du plus haut visible */
  const cols = new Map();
  for (const e of P.elec) if (e.type === TRAVERSEE && e.col && !hid.has(e.id) && visIds.has(e.lv)) { if (!cols.has(e.col)) cols.set(e.col, []); cols.get(e.col).push(e); }
  for (const m of cols.values()) {
    for (const e of m) done.add(e.id);
    const Ls = m.map((e) => [e, levelOf(e.lv)]).filter((x) => x[1]).sort((a, b) => a[1].elev - b[1].elev); if (!Ls.length) continue;
    const e0 = Ls[0][0], y0 = Ls[0][1].elev + 1, top = Ls[Ls.length - 1][1], y1 = top.elev + (top.h || 250) - 1;
    const w = e0.w || 30, d = e0.d || 20, pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => itemToWorld(e0, (a * w) / 2, (b * d) / 2));
    solid3(G.w, [pts], y0, y1, mixRGB(K3.gaine, [255, 255, 255], 0.55), pick({ t: 'elec', id: e0.id, lv: e0.lv }), { top: K3.gaine });
  }
  for (const e of P.elec) {
    if (e.type !== TRAVERSEE || done.has(e.id) || hid.has(e.id)) continue;
    const t = jumelle(P, e, IDX.elec); if (!t) continue;
    done.add(e.id); done.add(t.id);
    const La = levelOf(e.lv), Lb = levelOf(t.lv); if (!La || !Lb) continue;
    const [lo, hi] = La.elev <= Lb.elev ? [[e, La], [t, Lb]] : [[t, Lb], [e, La]];
    if (!visIds.has(lo[0].lv)) continue;
    const yAt = (sym, L, def) => { const d = P.ducts.find((x) => x.sys === 'elec' && (x.a === sym.id || x.b === sym.id)); return d ? ductY3(d, L.elev, L.h || 250, 1, o) : def; };
    const y0 = yAt(lo[0], lo[1], lo[1].elev + (lo[1].h || 250) - 2);
    const y1 = visIds.has(hi[0].lv) ? yAt(hi[0], hi[1], hi[1].elev + 2) : hi[1].elev; // étage du dessus caché : jusqu'au plancher
    if (y1 - y0 < 1) continue;
    const id = pick({ t: 'elec', id: lo[0].id, lv: lo[0].lv });
    const gb = o.cables ? G.g : G.s;
    tube3(gb, [lo[0].x, y0, lo[0].y], [lo[0].x, y1, lo[0].y], 2.2, K3.gaine, id, 12);
    sphere3(gb, [lo[0].x, y0, lo[0].y], 2.2, K3.gaine, id, 10); sphere3(gb, [lo[0].x, y1, lo[0].y], 2.2, K3.gaine, id, 10);
  }
}
/* altitude d'un câble dans un conduit dessiné : au fond d'un chemin de câbles ou d'une goulotte, au centre d'une gaine */
function ductCableY3(d, L, o) {
  const k = kindOf(d), rect = k === 'goulotte' || k === 'cdc';
  const half = rect ? (d.lh > 0 ? d.lh : 40) / 20 : Math.max(0.8, (d.dia || 20) / 20);
  const y = ductY3(d, L.elev, L.h || 250, half, o);
  return rect ? y - half + 0.9 : y;
}
/* câbles : chemin réel de chaque circuit dans le réseau des gaines (depuis le tableau), avec les verticales et les passages */
function cables3(G, visIds, pick, o) {
  const N = grapheGaines(P).nodes;
  let k = 0;
  for (const c of P.circuits) {
    const ch = cheminCircuit(P, c.id); if (!ch.edges.length) continue;
    const col = hexRGB(circuitColor(c.id, true) || '#7C63D2');
    const off = { x: ((k % 5) - 2) * 0.9, z: ((Math.floor(k / 5) % 3) - 1) * 0.9 }; k++;
    const id = pick({ t: 'circuit', id: c.id, lv: ui.lv });
    const pos = (nid, other) => {
      const n = N.get(nid); if (!n) return null;
      const L = levelOf(n.lv); if (!L) return null;
      let Y = n.Z;
      const d = n.duct && IDX.ducts.get(n.duct);
      if (d) Y = ductCableY3(d, L, o); // dans le conduit tel qu'il est dessiné
      if (Y == null && other) { const m = N.get(other); if (m && m.Z != null && m.lv === n.lv) Y = m.Z; }
      if (Y == null) Y = L.elev + (o.route !== 'sol' ? (L.h || 250) - 3 : 3);
      return [n.x + off.x, Y, n.y + off.z, n.lv];
    };
    for (const ed of ch.edges) {
      const a = pos(ed.a, ed.b), b = pos(ed.b, ed.a); if (!a || !b) continue;
      if (!visIds.has(a[3]) && !visIds.has(b[3])) continue;
      if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.5) continue;
      tube3(G.s, a, b, 0.45, col, id, 6);
    }
  }
}

/* ---------------- rendu WebGL2 ---------------- */
const VS_MAIN = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNrm; layout(location=2) in vec4 aCol; layout(location=3) in vec4 aPid;
uniform mat4 uVP; uniform mat4 uLVP;
out vec3 vN; out vec4 vC; out vec4 vL; flat out vec4 vP; out vec3 vW;
void main() { vN = aNrm; vC = aCol; vP = aPid; vW = aPos; vL = uLVP * vec4(aPos, 1.0); gl_Position = uVP * vec4(aPos, 1.0); }`;
const FS_MAIN = `#version 300 es
precision highp float; precision highp sampler2DShadow;
in vec3 vN; in vec4 vC; in vec4 vL; flat in vec4 vP; in vec3 vW;
uniform vec4 uClip; uniform float uClipOn;
uniform vec3 uLdir; uniform sampler2DShadow uSh; uniform float uShOn; uniform float uAlpha; uniform vec4 uOver; uniform vec4 uSel; uniform vec3 uAcc; uniform float uVisit;
out vec4 o;
float shadowAt() {
  vec3 p = vL.xyz / vL.w * 0.5 + 0.5;
  if (p.x <= 0.0 || p.x >= 1.0 || p.y <= 0.0 || p.y >= 1.0 || p.z >= 1.0) return 1.0;
  vec2 t = 1.0 / vec2(textureSize(uSh, 0)); float s = 0.0;
  for (int i = -1; i <= 1; i++) for (int j = -1; j <= 1; j++) s += texture(uSh, vec3(p.xy + vec2(float(i), float(j)) * t * 1.2, p.z - 0.0012));
  return s / 9.0;
}
void main() {
  if (uClipOn > 0.5 && dot(uClip.xyz, vW) + uClip.w > 0.0) discard;
  if (uOver.a > 0.0) { o = uOver; return; }
  vec3 n = normalize(vN);
  float dif = max(dot(n, uLdir), 0.0);
  float sh = (uShOn > 0.5 && dif > 0.0) ? shadowAt() : 1.0;
  vec3 amb = mix(vec3(0.62, 0.61, 0.60) + uVisit * vec3(0.24), vec3(0.71, 0.73, 0.76) + uVisit * vec3(0.06), 0.5 + 0.5 * n.y);
  vec3 base = vC.rgb;
  vec3 col = base * (amb + vec3(1.0, 0.97, 0.92) * dif * 0.36 * mix(0.25, 1.0, sh));
  col = mix(col, base * 1.05, vC.a);
  if (uSel.a > 0.5 && all(lessThan(abs(vP.rgb - uSel.rgb), vec3(0.5 / 255.0)))) col = mix(col, uAcc, 0.5);
  o = vec4(col, uAlpha);
}`;
const VS_SH = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uLVP; out vec3 vW; void main() { vW = aPos; gl_Position = uLVP * vec4(aPos, 1.0); }`;
const FS_SH = `#version 300 es
precision highp float; in vec3 vW; uniform vec4 uClip; uniform float uClipOn; void main() { if (uClipOn > 0.5 && dot(uClip.xyz, vW) + uClip.w > 0.0) discard; }`;
const FS_PICK = `#version 300 es
precision highp float; flat in vec4 vP; in vec3 vW; uniform vec4 uClip; uniform float uClipOn; out vec4 o;
void main() { if (uClipOn > 0.5 && dot(uClip.xyz, vW) + uClip.w > 0.0) discard; o = vP; }`;

const R3 = { gl: null, cv: null, ok: false, P: {}, B: {}, shTex: null, shFbo: null, shSize: 2048, shDirty: true, pk: null, w: 0, h: 0, dpr: 1 };
function glProgram(gl, vs, fs) {
  const mk = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
  return { p, u };
}
function r3Init(cv) {
  if (R3.ok) return true;
  let gl = null;
  try { gl = cv.getContext('webgl2', { antialias: true, alpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance' }); } catch (e) { gl = null; }
  if (!gl) return false;
  try {
    R3.P.main = glProgram(gl, VS_MAIN, FS_MAIN);
    R3.P.sh = glProgram(gl, VS_SH, FS_SH);
    R3.P.pick = glProgram(gl, VS_MAIN, FS_PICK);
  } catch (e) { console.error(e); return false; }
  const S0 = R3.shSize, tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, S0, S0, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const fb = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, tex, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  R3.shOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  Object.assign(R3, { gl, cv, ok: true, shTex: tex, shFbo: fb });
  cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); R3.ok = false; R3.lost = true; });
  return true;
}
function r3Batch(gb) {
  const gl = R3.gl;
  const buf = (target, data) => { const b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; };
  const bp = buf(gl.ARRAY_BUFFER, new Float32Array(gb.P)), bn = buf(gl.ARRAY_BUFFER, new Float32Array(gb.N)), bc = buf(gl.ARRAY_BUFFER, new Uint8Array(gb.C)), bi = buf(gl.ARRAY_BUFFER, new Uint8Array(gb.I));
  const mkVao = (ebo) => {
    const v = gl.createVertexArray(); gl.bindVertexArray(v);
    gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bc); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bi); gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.UNSIGNED_BYTE, true, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo); gl.bindVertexArray(null); return v;
  };
  const et = buf(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(gb.T)), ee = buf(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(gb.E));
  return { vt: mkVao(et), ve: mkVao(ee), nt: gb.T.length, ne: gb.E.length, bufs: [bp, bn, bc, bi, et, ee] };
}
function r3Free(b) { if (!b) return; const gl = R3.gl; gl.deleteVertexArray(b.vt); gl.deleteVertexArray(b.ve); for (const x of b.bufs) gl.deleteBuffer(x); }
function r3Upload(G) {
  r3Free(R3.B.s); r3Free(R3.B.g); r3Free(R3.B.w);
  R3.B = { s: r3Batch(G.s), g: r3Batch(G.g), w: r3Batch(G.w) };
  R3.shDirty = true;
}
function r3Resize() {
  const cv = R3.cv, r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  R3.w = r.width; R3.h = r.height; R3.dpr = dpr;
}
const LDIR = (() => { const v = [-0.45, 0.8, 0.5], l = Math.hypot(...v); return v.map((x) => x / l); })();
function lightMatrix(bb) {
  const c = [(bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2, (bb.z0 + bb.z1) / 2];
  const R = Math.max(200, Math.hypot(bb.x1 - bb.x0, bb.y1 - bb.y0, bb.z1 - bb.z0) / 2) * 1.05;
  const eye = [c[0] + LDIR[0] * R * 2, c[1] + LDIR[1] * R * 2, c[2] + LDIR[2] * R * 2];
  return m4mul(m4ortho(-R, R, -R, R, R * 0.2, R * 4), m4look(eye, c, [0, 1, 0]));
}
/* plan de coupe (réglage de la vue) : [nx, ny, nz, d] ; est retiré ce qui vérifie n·p + d > 0 */
function clipPlane3() {
  const o = v3o(), b = V3.G && V3.G.bbView;
  if (o.mode === 'visit' || o.cut === 'none' || !b || !isFinite(b.x0)) return null;
  if (o.cut === 'h') { const L = curLevel3(); return [0, 1, 0, -(L.elev + clamp(o.cutH, 10, 2000))]; }
  const sg = o.cutFlip ? -1 : 1;
  if (o.cut === 'x') { const X = b.x0 + (b.x1 - b.x0) * clamp(o.cutX, 0, 1); return [sg, 0, 0, -sg * X]; }
  if (o.cut === 'z') { const Z = b.z0 + (b.z1 - b.z0) * clamp(o.cutZ, 0, 1); return [0, 0, sg, -sg * Z]; }
  return null;
}
function setClip3(gl, prog) { const c = clipPlane3(); gl.uniform1f(prog.u.uClipOn, c ? 1 : 0); gl.uniform4f(prog.u.uClip, ...(c || [0, 0, 0, 0])); }
function r3Draw(VP, opts, target) {
  const gl = R3.gl; if (!gl || !R3.B.s) return;
  const xr = !!v3o().xray && v3o().mode !== 'visit', Wb = R3.B.w;
  const bg = isDarkTheme() ? [0.09, 0.1, 0.11] : [0.905, 0.918, 0.902];
  const LVP = lightMatrix(V3.bbShadow || V3.G.bb);
  gl.enable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE);
  if (opts.shadows && R3.shOk && R3.shDirty) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, R3.shFbo); gl.viewport(0, 0, R3.shSize, R3.shSize);
    gl.clear(gl.DEPTH_BUFFER_BIT); gl.useProgram(R3.P.sh.p); gl.uniformMatrix4fv(R3.P.sh.u.uLVP, false, LVP); setClip3(gl, R3.P.sh);
    gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 3);
    gl.bindVertexArray(R3.B.s.vt); gl.drawElements(gl.TRIANGLES, R3.B.s.nt, gl.UNSIGNED_INT, 0);
    if (!xr && Wb && Wb.nt) { gl.bindVertexArray(Wb.vt); gl.drawElements(gl.TRIANGLES, Wb.nt, gl.UNSIGNED_INT, 0); }
    gl.disable(gl.POLYGON_OFFSET_FILL);
    R3.shDirty = false;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
  gl.viewport(0, 0, target ? target.w : R3.cv.width, target ? target.h : R3.cv.height);
  gl.clearColor(bg[0], bg[1], bg[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  const M = R3.P.main; gl.useProgram(M.p);
  gl.uniformMatrix4fv(M.u.uVP, false, VP); gl.uniformMatrix4fv(M.u.uLVP, false, LVP);
  gl.uniform3fv(M.u.uLdir, LDIR); gl.uniform1f(M.u.uShOn, opts.shadows && R3.shOk ? 1 : 0);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, R3.shTex); gl.uniform1i(M.u.uSh, 0);
  const sel = V3.sel || 0;
  gl.uniform4f(M.u.uSel, (sel & 255) / 255, ((sel >> 8) & 255) / 255, ((sel >> 16) & 255) / 255, sel ? 1 : 0);
  const acc = hexRGB(C.accent || '#D24F1A'); gl.uniform3f(M.u.uAcc, acc[0] / 255, acc[1] / 255, acc[2] / 255);
  gl.uniform1f(M.u.uAlpha, 1); gl.uniform4f(M.u.uOver, 0, 0, 0, 0); gl.uniform1f(M.u.uVisit, v3o().mode === 'visit' ? 1 : 0);
  setClip3(gl, M);
  gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(1, 1);
  gl.bindVertexArray(R3.B.s.vt); gl.drawElements(gl.TRIANGLES, R3.B.s.nt, gl.UNSIGNED_INT, 0);
  if (!xr && Wb && Wb.nt) { gl.bindVertexArray(Wb.vt); gl.drawElements(gl.TRIANGLES, Wb.nt, gl.UNSIGNED_INT, 0); }
  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
  const ea = isDarkTheme() ? 0.45 : 0.3;
  if (R3.B.s.ne) { gl.uniform4f(M.u.uOver, 0.11, 0.13, 0.15, ea); gl.bindVertexArray(R3.B.s.ve); gl.drawElements(gl.LINES, R3.B.s.ne, gl.UNSIGNED_INT, 0); }
  if (Wb && Wb.ne) { gl.uniform4f(M.u.uOver, 0.11, 0.13, 0.15, xr ? ea * 0.5 : ea); gl.bindVertexArray(Wb.ve); gl.drawElements(gl.LINES, Wb.ne, gl.UNSIGNED_INT, 0); }
  if (R3.B.g.nt) { gl.uniform4f(M.u.uOver, 0, 0, 0, 0); gl.uniform1f(M.u.uAlpha, 0.32); gl.bindVertexArray(R3.B.g.vt); gl.drawElements(gl.TRIANGLES, R3.B.g.nt, gl.UNSIGNED_INT, 0); }
  if (xr && Wb && Wb.nt) { gl.uniform4f(M.u.uOver, 0, 0, 0, 0); gl.uniform1f(M.u.uAlpha, 0.16); gl.bindVertexArray(Wb.vt); gl.drawElements(gl.TRIANGLES, Wb.nt, gl.UNSIGNED_INT, 0); }
  gl.depthMask(true); gl.disable(gl.BLEND); gl.bindVertexArray(null);
}
function r3Pick(cx, cy, VP, all) {
  const gl = R3.gl; if (!gl || !R3.B.s) return 0;
  const W = R3.cv.width, H = R3.cv.height;
  if (!R3.pk || R3.pk.w !== W || R3.pk.h !== H) {
    if (R3.pk) { gl.deleteFramebuffer(R3.pk.fb); gl.deleteRenderbuffer(R3.pk.c); gl.deleteRenderbuffer(R3.pk.d); }
    const fb = gl.createFramebuffer(), c = gl.createRenderbuffer(), d = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, c); gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, W, H);
    gl.bindRenderbuffer(gl.RENDERBUFFER, d); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d);
    R3.pk = { fb, c, d, w: W, h: H };
  }
  const px = clamp(Math.round(cx * R3.dpr), 0, W - 1), py = clamp(Math.round((R3.h - cy) * R3.dpr), 0, H - 1);
  gl.bindFramebuffer(gl.FRAMEBUFFER, R3.pk.fb); gl.viewport(0, 0, W, H);
  if (!all) { gl.enable(gl.SCISSOR_TEST); gl.scissor(px, py, 1, 1); }
  gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST); gl.useProgram(R3.P.pick.p); gl.uniformMatrix4fv(R3.P.pick.u.uVP, false, VP); setClip3(gl, R3.P.pick);
  gl.bindVertexArray(R3.B.s.vt); gl.drawElements(gl.TRIANGLES, R3.B.s.nt, gl.UNSIGNED_INT, 0);
  const Wb = R3.B.w; if (Wb && Wb.nt && !(v3o().xray && v3o().mode !== 'visit')) { gl.bindVertexArray(Wb.vt); gl.drawElements(gl.TRIANGLES, Wb.nt, gl.UNSIGNED_INT, 0); }
  if (all) {
    const one = new Uint8Array(4);
    const read = (x, y) => { gl.bindFramebuffer(gl.FRAMEBUFFER, R3.pk.fb); gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, one); return one[3] ? one[0] | (one[1] << 8) | (one[2] << 16) : 0; };
    gl.bindVertexArray(null);
    return read;
  }
  const out = new Uint8Array(4); gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, out);
  gl.disable(gl.SCISSOR_TEST); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.bindVertexArray(null);
  return out[3] ? out[0] | (out[1] << 8) | (out[2] << 16) : 0;
}

/* ---------------- caméra ---------------- */
const CAM = { T: [500, 100, 400], D: 1500, th: Math.PI / 2 - 0.5, ph: 0.9, eye: [0, 160, 0], yaw: -Math.PI / 2, pitch: -0.08 };
function camEye() {
  if (v3o().mode === 'visit') return CAM.eye.slice();
  return [CAM.T[0] + CAM.D * Math.sin(CAM.ph) * Math.cos(CAM.th), CAM.T[1] + CAM.D * Math.cos(CAM.ph), CAM.T[2] + CAM.D * Math.sin(CAM.ph) * Math.sin(CAM.th)];
}
function camVP(w, h) {
  const visit = v3o().mode === 'visit', asp = Math.max(0.2, w / Math.max(1, h));
  if (visit) {
    const e = CAM.eye, f = [Math.cos(CAM.pitch) * Math.cos(CAM.yaw), Math.sin(CAM.pitch), Math.cos(CAM.pitch) * Math.sin(CAM.yaw)];
    return m4mul(m4persp(68 * DEG, asp, 4, 60000), m4look(e, [e[0] + f[0], e[1] + f[1], e[2] + f[2]], [0, 1, 0]));
  }
  const e = camEye();
  return m4mul(m4persp(40 * DEG, asp, Math.max(2, CAM.D / 400), CAM.D * 8 + 20000), m4look(e, CAM.T, [0, 1, 0]));
}
function camRay(cx, cy) {
  const inv = m4inv(camVP(R3.w, R3.h)); if (!inv) return null;
  const x = (2 * cx) / R3.w - 1, y = 1 - (2 * cy) / R3.h;
  const a = m4xv(inv, x, y, -1, 1), b = m4xv(inv, x, y, 1, 1);
  const p0 = [a[0] / a[3], a[1] / a[3], a[2] / a[3]], p1 = [b[0] / b[3], b[1] / b[3], b[2] / b[3]];
  return { o: p0, d: [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]] };
}
function rayAtY(ray, Y) { if (!ray || Math.abs(ray.d[1]) < 1e-9) return null; const t = (Y - ray.o[1]) / ray.d[1]; if (t <= 0) return null; return [ray.o[0] + ray.d[0] * t, Y, ray.o[2] + ray.d[2] * t]; }
function curLevel3() { return levelOf(ui.lv) || levelsSorted()[0]; }
function fitCam3(animate) {
  const b = V3.G && V3.G.bbView; if (!b || !isFinite(b.x0)) return;
  const T = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 * 0.6 + b.y0 * 0.4, (b.z0 + b.z1) / 2];
  const R = Math.max(250, Math.hypot(b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0) / 2);
  const side = v3o().panel && R3.w > 760 ? 290 : 0;
  const asp = Math.max(0.4, (R3.w - side) / Math.max(1, R3.h)), fov = 40 * DEG;
  const D = (R / Math.sin(fov / 2)) * (asp < 1 ? 1 / asp : 1) * 1.12;
  const th = Math.PI / 2 - 0.42, ph = 0.72;
  // décale la cible pour centrer la maquette dans la zone libre (à gauche du panneau)
  const upp = (2 * D * Math.tan(fov / 2)) / Math.max(1, R3.h), sh = (side / 2) * upp;
  T[0] += Math.sin(th) * sh; T[2] += -Math.cos(th) * sh;
  camTo({ T, D, th, ph }, animate);
}
function camTo(tgt, animate) {
  if (!animate) { Object.assign(CAM, tgt); v3Req(); return; }
  const from = { T: CAM.T.slice(), D: CAM.D, th: CAM.th, ph: CAM.ph, eye: CAM.eye.slice(), yaw: CAM.yaw, pitch: CAM.pitch }, t0 = performance.now(), dur = 520;
  let dth = (tgt.th != null ? tgt.th : from.th) - from.th; while (dth > Math.PI) dth -= 2 * Math.PI; while (dth < -Math.PI) dth += 2 * Math.PI;
  V3.anim = (now) => {
    const k = clamp((now - t0) / dur, 0, 1), e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    const L = (a, b) => (b == null ? a : a + (b - a) * e);
    if (tgt.T) CAM.T = from.T.map((v, i) => L(v, tgt.T[i]));
    if (tgt.eye) CAM.eye = from.eye.map((v, i) => L(v, tgt.eye[i]));
    CAM.D = L(from.D, tgt.D); CAM.th = from.th + dth * e; CAM.ph = L(from.ph, tgt.ph); CAM.yaw = L(from.yaw, tgt.yaw); CAM.pitch = L(from.pitch, tgt.pitch);
    return k < 1;
  };
  v3Req();
}

/* ---------------- état de la vue 3D ---------------- */
const V3 = { G: null, key: '', sel: 0, raf: 0, anim: null, joy: null, keys: new Set(), lastT: 0, labelEls: [], inited: false, failed: false, needFit: true };
function v3Key() { const o = v3o(); return [H.cur && H.cur.size, ui.lv, o.mode, o.above, o.furn, o.elec, o.ducts, o.labels, o.walls, o.route, o.cables, JSON.stringify(o.hid[P.id] || []), S.layers.circ, JSON.stringify(S.filt), isDarkTheme()].join('|'); }
function v3Rebuild(force) {
  if (!R3.ok) return;
  const key = v3Key();
  if (!force && V3.G && key === V3.key && V3.snap === H.cur) return;
  const prevLv = V3.lv;
  V3.key = key; V3.snap = H.cur; V3.lv = ui.lv;
  const G = build3D();
  const b = G.bb;
  G.bbView = Object.assign({}, b);
  V3.G = G; V3.bbShadow = b;
  const empty = !isFinite(b.x0);
  if (P.id !== V3.planId || (V3.wasEmpty && !empty)) V3.needFit = true;
  V3.planId = P.id; V3.wasEmpty = empty;
  $('#v3empty').hidden = !empty;
  r3Upload(G);
  v3Labels();
  if (V3.selRef) { const i = G.picks.findIndex((p) => p && p.t === V3.selRef.t && p.id === V3.selRef.id); V3.sel = i > 0 ? i : 0; if (!V3.sel) v3Select(0); }
  else V3.sel = 0;
  if (v3o().mode === 'visit' && prevLv !== ui.lv) { const L = curLevel3(); CAM.eye[1] = L.elev + 160; }
  if (V3.needFit) { V3.needFit = false; if (v3o().mode === 'visit') v3VisitStart(); else fitCam3(false); }
  v3Req();
}
function v3Req() { if (!V3.raf && ui.view === '3d') V3.raf = requestAnimationFrame(v3Frame); }
function v3Frame(now) {
  V3.raf = 0;
  if (ui.view !== '3d' || !R3.ok) return;
  const dt = Math.min(0.1, (now - (V3.lastT || now)) / 1000); V3.lastT = now;
  let again = false;
  if (V3.anim) { if (!V3.anim(now)) V3.anim = null; again = true; }
  if (v3o().mode === 'visit' && (V3.joy || V3.keys.size)) { v3Walk(dt); again = true; }
  r3Resize();
  const VP = camVP(R3.w, R3.h);
  r3Draw(VP, { shadows: v3o().shadows && v3o().mode !== 'visit' });
  v3PlaceLabels(VP);
  clearTimeout(V3.occT);
  if (again) v3Req(); else { V3.lastT = 0; V3.occT = setTimeout(v3Occlusion, 140); }
}
/* masque les étiquettes cachées par un mur (lecture du tampon de sélection) */
function v3Occlusion() {
  if (ui.view !== '3d' || !R3.ok || !V3.G || !V3.G.labels.length || !v3o().labels) return;
  const VP = camVP(R3.w, R3.h), read = r3Pick(0, 0, VP, true), W = R3.cv.width, H = R3.cv.height;
  V3.G.labels.forEach((l, i) => {
    const el = V3.labelEls[i]; if (!el) return;
    let found = null;
    for (const c of l.pts) {
      const q = m4xv(VP, c[0], c[1], c[2], 1); if (q[3] <= 0) continue;
      const px = Math.round((q[0] / q[3] * 0.5 + 0.5) * W), py = Math.round((q[1] / q[3] * 0.5 + 0.5) * H);
      if (px < 0 || py < 0 || px >= W || py >= H) continue;
      const ref = V3.G.picks[read(px, py)];
      if (!ref || (ref.lv === l.lv && ref.t !== 'wall' && ref.t !== 'opening' && (ref.t !== 'room' || ref.id === l.rid))) { found = c; break; }
    }
    if (found) l.p = found;
    el.classList.toggle('occ', !found);
  });
  v3PlaceLabels(VP);
  R3.gl.bindFramebuffer(R3.gl.FRAMEBUFFER, null);
}
function v3Walk(dt) {
  let fx = 0, fz = 0;
  if (V3.joy) { fz = -V3.joy.y; fx = V3.joy.x; }
  const k = V3.keys;
  if (k.has('arrowup') || k.has('w') || k.has('z')) fz += 1;
  if (k.has('arrowdown') || k.has('s')) fz -= 1;
  if (k.has('d')) fx += 1;
  if (k.has('q') || k.has('a')) fx -= 1;
  if (k.has('arrowleft')) CAM.yaw -= 1.8 * dt;
  if (k.has('arrowright')) CAM.yaw += 1.8 * dt;
  const sp = 170 * dt, cy = Math.cos(CAM.yaw), sy = Math.sin(CAM.yaw);
  CAM.eye[0] += (cy * fz - sy * fx) * sp; CAM.eye[2] += (sy * fz + cy * fx) * sp;
}
function v3VisitStart() {
  const L = curLevel3(), g = geo(L.id);
  let best = null; for (const r of g.rooms) if (!best || r.area > best.area) best = r;
  let p = best ? (best.label || labelPoint(best.poly)) : { x: (V3.G.bb.x0 + V3.G.bb.x1) / 2, y: (V3.G.bb.z0 + V3.G.bb.z1) / 2 };
  if (best) { const b = bboxOf(best.poly); for (const t of [0.88, 0.78, 0.68]) { const q = { x: p.x, y: b.y0 + (b.y1 - b.y0) * t }; if (inPoly(q, best.poly)) { p = q; break; } } }
  CAM.eye = [p.x, L.elev + 160, p.y]; CAM.yaw = -Math.PI / 2; CAM.pitch = -0.12;
  v3Req();
}

/* ---------------- étiquettes des pièces ---------------- */
function v3Labels() {
  const box = $('#v3labels'); if (!box) return;
  V3.labelEls = (V3.G.labels || []).map((l) => h('div', { class: 'v3-lab occ' }, h('b', null, l.name), h('span', null, l.area)));
  box.replaceChildren(...V3.labelEls);
}
function v3PlaceLabels(VP) {
  const L = V3.G ? V3.G.labels : []; if (!L.length) return;
  const cur = curLevel3(), visit = v3o().mode === 'visit';
  L.forEach((l, i) => {
    const el = V3.labelEls[i]; if (!el) return;
    const q = m4xv(VP, l.p[0], l.p[1], l.p[2], 1);
    const lvl = levelOf(l.lv), show = q[3] > 1 && (visit ? lvl && lvl.id === cur.id : !lvl || lvl.elev >= cur.elev - 0.01 || v3o().above);
    if (!show) { el.style.display = 'none'; return; }
    const x = (q[0] / q[3] * 0.5 + 0.5) * R3.w, y = (1 - (q[1] / q[3] * 0.5 + 0.5)) * R3.h;
    if (x < -80 || y < -40 || x > R3.w + 80 || y > R3.h + 40) { el.style.display = 'none'; return; }
    el.style.display = ''; el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -50%)`;
  });
}

/* ---------------- sélection et fiche ---------------- */
function v3RefInfo(ref) {
  if (!ref) return null;
  const L = levelOf(ref.lv), lvName = L ? L.name : '';
  if (ref.t === 'elec') {
    const e = IDX.elec.get(ref.id); if (!e) return null; const def = ELEC_BY.get(e.type) || {};
    const pose = def.floor ? 'au sol' : (!def.wall && e.h == null) ? 'au plafond' : def.fullH || e.type === 'gtl' ? 'du sol au plafond' : `${fmtLenU(e.h != null ? e.h : def.h || 0)} (axe)`;
    const c = e.cid && circById(e.cid);
    return { title: def.n || 'Symbole électrique', rows: [['Hauteur de pose', pose], c ? ['Circuit', circuitLabel(c)] : null, ['Pièce', roomName(roomAt(e))], ['Niveau', lvName]] };
  }
  if (ref.t === 'item') {
    const it = IDX.items.get(ref.id); if (!it) return null; const def = furnDef(it);
    if (isStair(it.type)) { const si = stairInfo(it); return { title: it.name || (def && def.n) || 'Escalier', rows: [['Marches', `${si.n} × ${NF1.format(si.h)} cm`], ['Hauteur à monter', fmtLenU(si.H)], ['Confort', si.label], ['Niveau', lvName]] }; }
    const hz = itemHeight3(it);
    return { title: it.label || it.name || (def && def.n) || 'Objet', rows: [['Dimensions', `${fmtIn(it.w)} × ${fmtIn(it.d)} × ${fmtIn(hz.h)} cm`], ['Posé à', hz.z ? fmtLenU(hz.z) + ' du sol' : 'au sol'], ['Niveau', lvName]], note: null };
  }
  if (ref.t === 'opening') {
    const o = IDX.openings.get(ref.id); if (!o) return null;
    const m = openingModels(o).find((x) => x.v === o.type);
    return { title: OPENING_NAMES[o.kind] || 'Porte', rows: [['Modèle', m ? m.n : '—'], o.kind === 'closet' ? ['Portes', String(o.leaves || 1)] : null, ['Largeur × hauteur', openingSizeText(o)], o.kind === 'window' || (o.kind === 'gap' && (o.sill || 0) > 0) ? ['Allège', fmtLenU(o.sill || 0)] : null, ['Niveau', lvName]] };
  }
  if (ref.t === 'wall') {
    const w = IDX.walls.get(ref.id); if (!w) return null;
    return { title: w.kind === 'cloison' ? 'Cloison' : 'Mur porteur', rows: [['Longueur', fmtLenU(wallLength(w))], ['Épaisseur', `${fmtIn(w.th || 10)} cm`], ['Hauteur', fmtLenU(wallHeightOf(w))],
      aCouches(w) ? ['Composition', w.couches.map((c) => `${courtCouche(c)} ${fmtIn(c.e)}`).join(' · ')] : null, ['Niveau', lvName]].filter(Boolean) };
  }
  if (ref.t === 'room') {
    const lb = IDX.rooms.get(ref.id); if (!lb) return null; const r = roomOfLabel(lb);
    return { title: lb.name, rows: [['Surface', r ? fmtArea(r.area) : '—'], ['Hauteur sous plafond', fmtLenU(L ? L.h || 250 : 250)], ['Niveau', lvName]] };
  }
  if (ref.t === 'duct') {
    const d = IDX.ducts.get(ref.id); if (!d) return null;
    if (d.sys === 'vmc') return { title: 'Conduit de VMC', rows: [['Longueur', fmtLenU(ductLen(d))], ['Diamètre', `Ø${d.dia || '—'}`], ['Passage', 'au plafond'], ['Niveau', lvName]] };
    const k = kindOf(d), rect = k === 'goulotte' || k === 'cdc', nums = circNumbers();
    const cs = circuitsDe(d).map((cid) => circById(cid)).filter(Boolean);
    return { title: nomChemin(d), rows: [['Longueur (horizontale)', fmtLenU(ductLen(d))],
      ['Taille', tailleChemin(d) || (rect ? 'non indiquée (dessin indicatif 60 × 40 mm)' : '—')],
      ['Pose', d.pose && POSES[d.pose] ? POSES[d.pose].n + ((d.pose === 'hauteur' || d.pose === 'cloison') && d.z != null ? ` (${fmtLenU(d.z)})` : '') : `non précisée (affichée ${v3o().route !== 'sol' ? 'au plafond' : 'au sol'})`],
      cs.length ? ['Circuits', cs.map((c) => `${nums.get(c.id) || '?'} · ${c.name}`).join(', ')] : null, ['Niveau', lvName]] };
  }
  if (ref.t === 'circuit') {
    const c = circById(ref.id); if (!c) return null;
    const ch = cheminCircuit(P, c.id);
    return { title: `Câble · ${circNumbers().get(c.id) || '?'} ${c.name}`, rows: [['Points raccordés', `${ch.atteints} sur ${ch.points.length}`], ch.arbre != null ? ['Câble posé (sans réserve)', fmtLenU(ch.arbre)] : null, ch.Lmax != null ? ['Jusqu’au point le plus éloigné', fmtLenU(ch.Lmax)] : null, ch.inconnues ? ['Verticales non comptées', String(ch.inconnues)] : null],
      note: 'Tracé déduit des gaines du plan, depuis le tableau. Longueurs estimées : voir l’onglet Cheminements.' };
  }
  return null;
}
function v3Select(id) {
  if ((id || 0) !== V3.sel) V3.move = null;
  V3.sel = id || 0;
  const ref = V3.sel && V3.G ? V3.G.picks[V3.sel] : null;
  V3.selRef = ref ? { t: ref.t, id: ref.id } : null;
  const box = $('#v3info'); if (!box) return;
  const info = v3RefInfo(ref);
  if (!info) { box.hidden = true; v3Req(); return; }
  const ae = document.activeElement, focusId = box.contains(ae) ? ae.id : null;
  box.replaceChildren(...[
    h('div', { class: 'v3-ih' }, h('b', null, info.title), h('button', { class: 'ib', type: 'button', 'aria-label': 'Fermer', html: ICON.x, onclick: () => v3Select(0) })),
    h('div', { class: 'v3-ib' },
      kv(info.rows.filter(Boolean)),
      info.note ? h('p', { class: 'note' }, info.note) : null,
      ...v3Edit(ref)),
    btns(ref.t !== 'circuit' ? btn('Voir sur le plan', () => showOnPlan(ref), 'sm pri') : btn('Fiche de calcul', () => openFiche(ref.id), 'sm pri', 'info'),
      ref.t === 'item' || ref.t === 'elec' ? btn('Centrer', () => v3FocusRef(ref), 'sm', 'center') : null,
      ref.t !== 'circuit' ? btn('Masquer', () => v3Hide(ref), 'sm') : null)].filter(Boolean));
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
  box.hidden = false;
  v3Req();
}
/* ---------------- modification depuis la 3D ----------------
   Chaque changement passe par commit() : annuler, enregistrement, 2D et 3D mises à jour. */
function v3Edit(ref) {
  const out = [];
  if (ref.t === 'elec') {
    const e = IDX.elec.get(ref.id); if (!e) return out; const def = ELEC_BY.get(e.type) || {};
    const fixe = e.type === TRAVERSEE || def.floor || def.fullH || (!def.wall && e.h == null);
    if (!fixe) out.push(numField('Hauteur de pose (axe)', e.h != null ? e.h : def.h || 0, 'cm', (v) => { e.h = v; commit(); }, { id: 'v3-eh', min: 0, max: 600 }));
    if (!def.wall) out.push(V3.move === e.id
      ? h('div', { class: 'v3-move' }, h('span', { class: 'note' }, 'Faites glisser un doigt ou le Pencil sur la maquette pour déplacer le symbole.'), btn('Terminer', () => { V3.move = null; v3Select(V3.sel); }, 'sm pri'))
      : btns(btn('Déplacer', () => { V3.move = e.id; v3Select(V3.sel); }, 'sm', 'swap')));
    else out.push(h('p', { class: 'note' }, 'Appareil mural : déplacez-le le long du mur sur le plan.'));
    out.push(btns(btn('Supprimer', () => { P.elec = P.elec.filter((x) => x.id !== e.id); touch(); cleanLinks(); V3.move = null; v3Select(0); commit(); }, 'sm danger', 'del')));
  } else if (ref.t === 'duct') {
    const d = IDX.ducts.get(ref.id); if (!d || d.sys !== 'elec') return out;
    const k = kindOf(d);
    out.push(h('div', { class: 'chips' }, Object.keys(TYPES_CHEMIN).map((t) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(k === t), onclick: () => {
      d.kind = t; if (TYPES_CHEMIN[t].forme === 'rect') delete d.dia; else { delete d.lw; delete d.lh; if (!d.dia) d.dia = 20; } commit(); } }, TYPES_CHEMIN[t].court))));
    out.push(segCtl(Object.keys(POSES).map((v) => ({ v, n: POSES[v].court })), d.pose || null, (v) => { d.pose = v; if ((v === 'hauteur' || v === 'cloison') && d.z == null) d.z = 30; if (v !== 'hauteur') delete d.z; commit(); }));
    if (d.pose === 'hauteur' || d.pose === 'cloison') out.push(numField('Hauteur du parcours', d.z, 'cm', (v) => { d.z = v; commit(); }, { id: 'v3-dz', min: 0, max: 600 }));
    if (k && TYPES_CHEMIN[k].forme === 'rect') out.push(h('div', { class: 'row' }, numField('Largeur', d.lw, 'mm', (v) => { d.lw = v; commit(); }, { id: 'v3-dlw', min: 5, max: 1000 }), numField('Hauteur', d.lh, 'mm', (v) => { d.lh = v; commit(); }, { id: 'v3-dlh', min: 5, max: 500 })));
    else if (k) out.push(h('div', { class: 'chips' }, TYPES_CHEMIN[k].dias.map((v) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(d.dia === v), onclick: () => { d.dia = v; commit(); } }, 'Ø' + v))));
    out.push(btns(btn('Supprimer', () => { P.ducts = P.ducts.filter((x) => x.id !== d.id); touch(); v3Select(0); commit(); }, 'sm danger', 'del')));
  } else if (ref.t === 'wall') {
    const w = IDX.walls.get(ref.id); if (!w) return out;
    out.push(numField('Hauteur du mur', wallHeightOf(w), 'cm', (v) => { const L = levelOf(w.lv); if (L && Math.abs(v - (L.h || 250)) < 0.01) delete w.h; else w.h = v; commit(); }, { id: 'v3-wh', min: 20, max: 1500 }));
  } else if (ref.t === 'item') {
    const it = IDX.items.get(ref.id); if (!it || isStair(it.type)) return out;
    const hz = itemHeight3(it);
    out.push(h('div', { class: 'row' }, numField('Hauteur', hz.h, 'cm', (v) => { it.ht = v; commit(); }, { id: 'v3-iht', min: 1, max: 600 }), numField('Posé à', hz.z, 'cm', (v) => { it.zb = v; commit(); }, { id: 'v3-izb', min: 0, max: 500 })));
    out.push(btns(btn('Supprimer', () => { P.items = P.items.filter((x) => x.id !== it.id); touch(); v3Select(0); commit(); }, 'sm danger', 'del')));
  }
  return out;
}
/* masquage : réglage de la vue, le plan n'est pas modifié */
function v3Hide(ref) { const s = v3Hidden(); s.add(ref.id); v3SetHidden(s); v3Select(0); render3Panel(); v3Rebuild(); v3Req(); }
function v3ShowAll() { v3SetHidden(new Set()); render3Panel(); v3Rebuild(); v3Req(); }
function refPoint(ref) {
  if (ref.t === 'elec') { const e = IDX.elec.get(ref.id); return e && { x: e.x, y: e.y }; }
  if (ref.t === 'item') { const it = IDX.items.get(ref.id); return it && { x: it.x, y: it.y }; }
  if (ref.t === 'wall') { const w = IDX.walls.get(ref.id); return w && vmid(nodeOf(w.a), nodeOf(w.b)); }
  if (ref.t === 'opening') { const o = IDX.openings.get(ref.id), w = o && IDX.walls.get(o.wall), g = w && geo(w.lv).walls.get(w.id); return g && vadd(g.A, vmul(g.d, o.t)); }
  if (ref.t === 'room') { const lb = IDX.rooms.get(ref.id); return lb && { x: lb.x, y: lb.y }; }
  if (ref.t === 'duct') { const d = IDX.ducts.get(ref.id); return d && ductPts(d)[Math.floor(ductPts(d).length / 2)]; }
  return null;
}
function v3FocusRef(ref) {
  const p = refPoint(ref); if (!p) return; const L = levelOf(ref.lv) || curLevel3();
  if (v3o().mode === 'visit') { const dx = p.x - CAM.eye[0], dz = p.y - CAM.eye[2]; camTo({ yaw: Math.atan2(dz, dx), pitch: -0.15 }, true); return; }
  camTo({ T: [p.x, L.elev + 90, p.y], D: Math.min(CAM.D, 520) }, true);
}
function showOnPlan(ref) {
  if (!ref) return;
  if (ref.t === 'elec' || ref.t === 'duct' || ref.t === 'room' || ref.t === 'opening') { goToRef(ref); return; }
  setView('plan');
  ui.lv = ref.lv; ui.sel = { t: ref.t, id: ref.id }; ui.inspOpen = true; ui.hl = null;
  refreshUI();
  const p = refPoint(ref);
  if (p) requestAnimationFrame(() => { V.s = Math.max(V.s, 0.9); V.ox = SCR.w / 2 - p.x * V.s; V.oy = SCR.h / 2 - p.y * V.s; requestRender(); });
}

/* ---------------- gestes ---------------- */
const PT3 = new Map(); let G3 = null, lastTap3 = 0, lastTapPos3 = null;
function v3Pos(e) { const r = R3.cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function v3Down(e) {
  if (!R3.ok) return;
  R3.cv.setPointerCapture(e.pointerId);
  const p = v3Pos(e); PT3.set(e.pointerId, p);
  if (PT3.size === 1) G3 = { kind: V3.move && IDX.elec.get(V3.move) && v3o().mode !== 'visit' ? 'move' : 'one', x0: p.x, y0: p.y, lx: p.x, ly: p.y, t0: performance.now(), moved: false, pan: e.button === 2 || e.button === 1 || e.shiftKey || e.ctrlKey || e.metaKey };
  else if (PT3.size === 2) { const [a, b] = [...PT3.values()]; G3 = { kind: 'two', d: Math.hypot(a.x - b.x, a.y - b.y), m: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, moved: true }; }
  V3.anim = null;
}
function v3Move(e) {
  if (!PT3.has(e.pointerId) || !G3) return;
  const p = v3Pos(e); PT3.set(e.pointerId, p);
  const visit = v3o().mode === 'visit';
  if (G3.kind === 'move') {
    if (!G3.moved && Math.hypot(p.x - G3.x0, p.y - G3.y0) > 4) G3.moved = true;
    if (!G3.moved) return;
    const e = IDX.elec.get(V3.move), L = e && levelOf(e.lv), def = e && ELEC_BY.get(e.type); if (!e || !L || !def) return;
    const hit = rayAtY(camRay(p.x, p.y), def.floor ? L.elev : L.elev + (L.h || 250)); if (!hit) return;
    e.x = Math.round(hit[0]); e.y = Math.round(hit[2]);
    const now = performance.now(); // reconstruction limitée pendant le geste (fluidité)
    if (!V3.moveT || now - V3.moveT > 70) { V3.moveT = now; v3Rebuild(true); }
    v3Req(); return;
  }
  if (G3.kind === 'one') {
    const dx = p.x - G3.lx, dy = p.y - G3.ly; G3.lx = p.x; G3.ly = p.y;
    if (!G3.moved && Math.hypot(p.x - G3.x0, p.y - G3.y0) > 6) G3.moved = true;
    if (!G3.moved) return;
    if (visit) { CAM.yaw -= dx * 0.0055; CAM.pitch = clamp(CAM.pitch + dy * 0.0055, -1.35, 1.35); }
    else if (G3.pan) v3Pan(dx, dy);
    else { CAM.th += dx * 0.0085; CAM.ph = clamp(CAM.ph - dy * 0.0075, 0.06, 1.5); }
    v3Req();
  } else if (G3.kind === 'two' && PT3.size >= 2) {
    const [a, b] = [...PT3.values()], d = Math.hypot(a.x - b.x, a.y - b.y), m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const r = d / Math.max(1, G3.d);
    if (visit) { const step = (r - 1) * 260, cy = Math.cos(CAM.yaw), sy = Math.sin(CAM.yaw); CAM.eye[0] += cy * step; CAM.eye[2] += sy * step; v3Strafe(m.x - G3.m.x); }
    else { CAM.D = clamp(CAM.D / r, 60, 40000); v3Pan(m.x - G3.m.x, m.y - G3.m.y); }
    G3.d = d; G3.m = m; v3Req();
  }
}
function v3Up(e) {
  if (!PT3.has(e.pointerId)) return;
  PT3.delete(e.pointerId);
  if (G3 && G3.kind === 'move') { const moved = G3.moved; G3 = null; if (moved) commit(); else if (e.type === 'pointerup') v3Tap(v3Pos(e)); return; }
  if (G3 && G3.kind === 'one' && !G3.moved && performance.now() - G3.t0 < 450 && e.type === 'pointerup') v3Tap(v3Pos(e));
  if (PT3.size === 1) { const p = [...PT3.values()][0]; G3 = { kind: 'one', x0: p.x, y0: p.y, lx: p.x, ly: p.y, t0: 0, moved: true }; }
  else if (!PT3.size) G3 = null;
}
function v3Pan(dx, dy) {
  const e = camEye(), f = vnorm({ x: CAM.T[0] - e[0], y: CAM.T[2] - e[2] }), r = { x: -f.y, y: f.x };
  const upp = (2 * CAM.D * Math.tan(20 * DEG)) / Math.max(1, R3.h), ky = 1 / Math.max(0.35, Math.cos(CAM.ph) + 0.35);
  CAM.T[0] += (-r.x * dx + f.x * dy * ky) * upp; CAM.T[2] += (-r.y * dx + f.y * dy * ky) * upp;
}
function v3Strafe(dx) { const cy = Math.cos(CAM.yaw), sy = Math.sin(CAM.yaw), k = -dx * 1.2; CAM.eye[0] += -sy * k; CAM.eye[2] += cy * k; }
function v3Wheel(e) {
  e.preventDefault(); if (!R3.ok) return;
  if (v3o().mode === 'visit') { const step = -e.deltaY * 0.6, cy = Math.cos(CAM.yaw), sy = Math.sin(CAM.yaw); CAM.eye[0] += cy * step; CAM.eye[2] += sy * step; }
  else CAM.D = clamp(CAM.D * Math.exp(e.deltaY * 0.0012), 60, 40000);
  v3Req();
}
function v3Tap(p) {
  const VP = camVP(R3.w, R3.h), id = r3Pick(p.x, p.y, VP), ref = V3.G && V3.G.picks[id];
  const now = performance.now(), dbl = now - lastTap3 < 340 && lastTapPos3 && Math.hypot(p.x - lastTapPos3.x, p.y - lastTapPos3.y) < 24;
  lastTap3 = now; lastTapPos3 = p;
  const L = curLevel3();
  if (v3o().mode === 'visit') {
    if (!ref || ref.t === 'room') {
      const hit = rayAtY(camRay(p.x, p.y), ref ? levelOf(ref.lv).elev : L.elev);
      if (hit && Math.hypot(hit[0] - CAM.eye[0], hit[2] - CAM.eye[2]) < 4000) { camTo({ eye: [hit[0], (ref ? levelOf(ref.lv).elev : L.elev) + 160, hit[2]] }, true); v3Select(0); return; }
    }
    v3Select(id); return;
  }
  if (dbl) {
    const hit = rayAtY(camRay(p.x, p.y), ref ? (levelOf(ref.lv) || L).elev : L.elev);
    if (hit) camTo({ T: [hit[0], hit[1] + 60, hit[2]], D: Math.max(250, CAM.D * 0.55) }, true);
    return;
  }
  v3Select(ref ? id : 0);
}
function v3JoyBind(el) {
  const knob = el.firstChild; let pid = null;
  const set = (e) => { const r = el.getBoundingClientRect(), R = r.width / 2; let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; } V3.joy = { x, y }; knob.style.transform = `translate(${x * R * 0.55}px, ${y * R * 0.55}px)`; v3Req(); };
  el.addEventListener('pointerdown', (e) => { pid = e.pointerId; el.setPointerCapture(pid); set(e); e.stopPropagation(); });
  el.addEventListener('pointermove', (e) => { if (e.pointerId === pid) set(e); });
  const end = (e) => { if (e.pointerId !== pid) return; pid = null; V3.joy = null; knob.style.transform = ''; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
}

/* ---------------- photo de la vue ---------------- */
async function photo3D() {
  if (!R3.ok || !V3.G) return;
  const gl = R3.gl, maxS = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), 4096);
  const k = Math.min(3, maxS / Math.max(R3.w, R3.h)), W = Math.round(R3.w * k), H = Math.round(R3.h * k);
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0);
  const mk = (ms) => { const fb = gl.createFramebuffer(), c = gl.createRenderbuffer(), d = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, c); if (ms) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, W, H); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.RGBA8, W, H); gl.bindRenderbuffer(gl.RENDERBUFFER, d); if (ms) gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, W, H); else gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H); gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, c); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, d); return { fb, c, d, w: W, h: H }; };
  const A = mk(samples > 0), B = samples > 0 ? mk(false) : A;
  const sel = V3.sel; V3.sel = 0;
  const VP = camVP(R3.w, R3.h);
  r3Draw(VP, { shadows: v3o().shadows && v3o().mode !== 'visit' }, A);
  V3.sel = sel;
  if (B !== A) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, A.fb); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, B.fb); gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST); }
  gl.bindFramebuffer(gl.FRAMEBUFFER, B.fb);
  const px = new Uint8Array(W * H * 4); gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  for (const f of new Set([A, B])) { gl.deleteFramebuffer(f.fb); gl.deleteRenderbuffer(f.c); gl.deleteRenderbuffer(f.d); }
  const side = v3o().panel && R3.w > 760 && v3o().mode !== 'visit' ? Math.round(290 * k) : 0;
  const cvs = document.createElement('canvas'); cvs.width = W - side; cvs.height = H;
  const c2 = cvs.getContext('2d'), img = c2.createImageData(W, H), row = W * 4;
  for (let y = 0; y < H; y++) img.data.set(px.subarray((H - 1 - y) * row, (H - y) * row), y * row);
  c2.putImageData(img, 0, 0);
  // étiquettes des pièces visibles
  if (v3o().labels) {
    c2.textAlign = 'center'; c2.textBaseline = 'middle';
    V3.labelEls.forEach((el, i) => {
      if (el.style.display === 'none' || el.classList.contains('occ')) return; const l = V3.G.labels[i]; const q = m4xv(VP, l.p[0], l.p[1], l.p[2], 1); if (q[3] <= 1) return;
      const x = (q[0] / q[3] * 0.5 + 0.5) * W, y = (1 - (q[1] / q[3] * 0.5 + 0.5)) * H;
      c2.font = `650 ${12 * k}px ${FONT_UI}`; const w1 = c2.measureText(l.name).width; c2.font = `500 ${11 * k}px ${FONT_LABEL}`; const w2 = c2.measureText(l.area).width;
      const bw = Math.max(w1, w2) + 14 * k, bh = 32 * k;
      c2.fillStyle = 'rgba(255,255,255,0.86)'; c2.beginPath(); c2.roundRect ? c2.roundRect(x - bw / 2, y - bh / 2, bw, bh, 6 * k) : c2.rect(x - bw / 2, y - bh / 2, bw, bh); c2.fill();
      c2.fillStyle = '#1D2125'; c2.font = `650 ${12 * k}px ${FONT_UI}`; c2.fillText(l.name, x, y - 7 * k);
      c2.fillStyle = '#5C656C'; c2.font = `500 ${11 * k}px ${FONT_LABEL}`; c2.fillText(l.area, x, y + 8 * k);
    });
  }
  const blob = await new Promise((r) => cvs.toBlob(r, 'image/png'));
  cvs.width = cvs.height = 0;
  if (!blob) { toast('Impossible de créer la photo.'); return; }
  openFileModal('Photo de la vue 3D', new File([blob], `${slug(P.name)}-3d.png`, { type: 'image/png' }), 'Collez la photo dans PowerPoint ou Keynote, ou partagez-la.');
  v3Req();
}

/* ---------------- panneau d'options ---------------- */
function render3Panel() {
  const o = v3o(), panel = $('#v3panel'); if (!panel) return;
  const set = (k, v) => { o[k] = v; saveSettings(); render3Panel(); if (k === 'mode') { V3.needFit = true; v3Select(0); } v3Rebuild(); v3Req(); };
  const chip = (label, k) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!o[k]), onclick: () => set(k, !o[k]) }, label);
  const visit = o.mode === 'visit';
  $('#v3joy').hidden = !visit;
  const hasAbove = !!levelAbove(ui.lv);
  panel.classList.toggle('min', !o.panel);
  if (!o.panel) { panel.replaceChildren(h('button', { type: 'button', class: 'v3-open', onclick: () => set('panel', true) }, ico('filter'), 'Options 3D')); return; }
  panel.replaceChildren(...[
    h('div', { class: 'v3-ph' }, h('b', null, 'Vue 3D'), h('button', { class: 'ib', type: 'button', 'aria-label': 'Réduire', title: 'Réduire', html: ICON.x, onclick: () => set('panel', false) })),
    segCtl([{ v: 'orbit', n: 'Maquette' }, { v: 'visit', n: 'Visite' }], o.mode, (v) => set('mode', v)),
    h('p', { class: 'note' }, visit ? 'Glissez pour regarder autour, touchez le sol pour vous y rendre, ou utilisez le joystick.' : 'Un doigt : tourner. Deux doigts : zoomer et déplacer. Double-toucher : s’approcher. Toucher un objet : sa fiche.'),
    sec('Afficher', h('div', { class: 'chips' }, chip('Mobilier', 'furn'), chip('Électricité', 'elec'), chip('Conduits', 'ducts'), o.ducts ? chip('Câbles', 'cables') : null, chip('Noms des pièces', 'labels'), !visit ? chip('Ombres', 'shadows') : null, !visit && hasAbove ? chip('Étages au-dessus', 'above') : null),
      o.cables && o.ducts ? h('p', { class: 'note' }, 'Câbles déduits des gaines, depuis le tableau. Gaines transparentes : touchez un câble pour voir son circuit.') : null),
    !visit ? sec('Murs', segCtl([{ v: 'full', n: 'Hauteur réelle' }, { v: 'low', n: 'Coupés à 1 m' }], o.walls, (v) => set('walls', v)),
      h('div', { class: 'chips' }, h('button', { type: 'button', class: 'chip', id: 'v3-xray', 'aria-pressed': String(!!o.xray), onclick: () => { o.xray = !o.xray; saveSettings(); R3.shDirty = true; render3Panel(); v3Req(); } }, 'Murs transparents'))) : null,
    !visit ? cutSection(o) : null,
    o.ducts ? sec('Gaines sans pose précisée', segCtl([{ v: 'plafond', n: 'Par le plafond' }, { v: 'sol', n: 'Par le sol' }], o.route, (v) => set('route', v))) : null,
    v3Hidden().size ? sec('Objets masqués', btns(btn(`Tout réafficher (${v3Hidden().size})`, v3ShowAll, 'sm'))) : null,
    btns(btn('Recentrer', () => { if (visit) v3VisitStart(); else fitCam3(true); }, 'sm', 'center'), !visit ? btn('Vue de dessus', () => camTo({ ph: 0.06 }, true), 'sm', 'house') : null, btn('Photo', photo3D, 'sm pri', 'img')),
  ].filter(Boolean));
}

/* coupe : horizontale (au-dessus d'une hauteur) ou verticale (le long de X ou de Y du plan) ; seul l'affichage change */
function cutSection(o) {
  const L = curLevel3(), Hh = L.h || 250;
  const upd = () => { saveSettings(); R3.shDirty = true; v3Req(); };
  const kids = [h('div', { class: 'chips' }, [{ v: 'none', n: 'Aucune' }, { v: 'h', n: 'Horizontale' }, { v: 'x', n: 'Verticale ↔' }, { v: 'z', n: 'Verticale ↕' }].map((c) =>
    h('button', { type: 'button', class: 'chip', 'data-cut': c.v, 'aria-pressed': String(o.cut === c.v), onclick: () => { o.cut = c.v; upd(); render3Panel(); } }, c.n)))];
  if (o.cut !== 'none') {
    const key = o.cut === 'h' ? 'cutH' : o.cut === 'x' ? 'cutX' : 'cutZ';
    const [mn, mx, st] = o.cut === 'h' ? [10, Hh + 40, 1] : [0, 1, 0.005];
    const lab = h('span', { class: 'v3-cutv' });
    const show = () => { lab.textContent = o.cut === 'h' ? `${fmtIn(o.cutH)} cm au-dessus du sol` : `${Math.round(o[key] * 100)} %`; };
    const r = h('input', { type: 'range', id: 'v3-cut', min: String(mn), max: String(mx), step: String(st), value: String(clamp(o[key], mn, mx)), 'aria-label': 'Position de la coupe' });
    r.addEventListener('input', () => { o[key] = Number(r.value); show(); R3.shDirty = true; v3Req(); });
    r.addEventListener('change', upd);
    show();
    kids.push(h('div', { class: 'v3-cut' }, r, lab));
    if (o.cut !== 'h') kids.push(btns(btn('Inverser le côté', () => { o.cutFlip = !o.cutFlip; upd(); }, 'sm', 'swap')));
  }
  return sec('Coupe', ...kids);
}

/* ---------------- entrée / sortie de l'onglet ---------------- */
function v3Show() {
  const cv3 = $('#cv3');
  if (!V3.inited) {
    V3.inited = true;
    if (!r3Init(cv3)) { V3.failed = true; $('#v3msg').hidden = false; return; }
    cv3.addEventListener('pointerdown', v3Down); cv3.addEventListener('pointermove', v3Move);
    cv3.addEventListener('pointerup', v3Up); cv3.addEventListener('pointercancel', v3Up);
    cv3.addEventListener('wheel', v3Wheel, { passive: false });
    cv3.addEventListener('contextmenu', (e) => e.preventDefault());
    v3JoyBind($('#v3joy'));
    new ResizeObserver(() => v3Req()).observe($('#view3d'));
  }
  if (V3.failed) return;
  render3Panel();
  r3Resize();
  v3Rebuild();
  v3Req();
}
function v3Refresh() {
  if (ui.view !== '3d' || V3.failed || !R3.ok) return;
  render3Panel();
  v3Rebuild();
  if (V3.sel) v3Select(V3.sel);
}
function v3Key3(e) {
  const k = e.key.toLowerCase();
  if (k === 'escape') { V3.move = null; v3Select(0); return true; }
  if (v3o().mode === 'visit' && ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', 'z', 'q'].includes(k)) {
    if (e.type === 'keydown') V3.keys.add(k); else V3.keys.delete(k);
    e.preventDefault(); v3Req(); return true;
  }
  return false;
}

export { tremieHoles };
export { CAM, CAT3, EL3, F3, FS_MAIN, FS_PICK, FS_SH, G3, GB, K3, LDIR, PT3, R3, TINT3, V3, V3DEF, VS_MAIN, VS_SH,
  build3D, camEye, camRay, camTo, camVP, circlePts, cleanRing, clipConvex, clipHalf, closet3, curLevel3, duct3, earcut,
  elec3, elecAccent, f3Def, fitCam3, floorCol3, furn3, glProgram, glowC, hexRGB, isConvex, itemHeight3, kBase,
  lastTap3, lastTapPos3, legs4, lightMatrix, m4inv, m4look, m4mul, m4ortho, m4persp, m4xv, mixRGB, opening3, photo3D,
  r3Batch, r3Draw, r3Free, r3Init, r3Pick, r3Resize, r3Upload, rayAtY, refPoint, render3Panel, ringArea, showOnPlan,
  shrinkRing, sofa, solid3, sphere3, stair3, stairFootprint, tap3, tube3, v3Down, v3FocusRef, v3Frame, v3JoyBind,
  v3Edit, v3Hidden, v3Hide, v3ShowAll, clipPlane3, cables3, passages3, segBox3, cutSection, ductY3, ductCableY3, v3Key, v3Key3, v3Labels, v3Move, v3Occlusion, v3Pan, v3PlaceLabels, v3Pos, v3Rebuild, v3RefInfo, v3Refresh, v3Req,
  v3Select, v3Show, v3Strafe, v3Tap, v3Up, v3VisitStart, v3Walk, v3Wheel, v3o, wall3 };

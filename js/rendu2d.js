/* Calque — module « rendu2d » : rendu 2D du plan (canvas).
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { C, DEG, IDX, P, S, bboxOf, clamp, fmtArea, fmtLen, inPoly, labelPoint, levelAbove, levelBelow, ui, vadd,
  vdist, vlen, vmid, vmul, vnorm, vperp, vsub } from './noyau.js';
import { geo } from './geometrie.js';
import { itemToWorld } from './mutations.js';
import { ELEC_BY, S_ELEC, _rr, drawElec, drawItem, elecSize, isStair } from './symboles.js';
import { circuitColor } from './electricite.js';
import { DIMHIT, drawDuctLabels, drawDucts, elecVisible, linkVisible, setDIMHIT } from './reseaux.js';
import { SCR } from './interaction.js';
import { mkPath } from './export.js';

/* ============================================================
   CALQUE — rendu canvas
   ============================================================ */
const FONT_UI = '"Archivo", system-ui, -apple-system, "Segoe UI", sans-serif';
const FONT_LABEL = '"Archivo Narrow", "Arial Narrow", "Roboto Condensed", system-ui, sans-serif';
function readColors() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['paper', 'room', 'ink', 'ink2', 'wall', 'part', 'fill', 'tone', 'grid', 'gridMajor', 'accent', 'accentSoft', 'elec', 'ghost', 't1', 't2', 't3', 't4', 't5', 't6', 'vmc', 'gaine']) {
    C[k] = cs.getPropertyValue('--c-' + k).trim() || '#888';
  }
}
const V = { s: 0.6, ox: 0, oy: 0 };
let RC = null;
function K_() {
  return { px: RC.px, ink: RC.C.ink, ink2: RC.C.ink2, fill: RC.C.fill, tone: RC.C.tone, wall: RC.C.wall, bg: RC.C.room, elec: RC.C.elec, font: FONT_LABEL };
}
const TS = (v) => v * (RC.ts || 1);
function setWorld() { RC.ctx.setTransform(RC.dpr * RC.s, 0, 0, RC.dpr * RC.s, RC.dpr * RC.ox, RC.dpr * RC.oy); }
function setScreen() { RC.ctx.setTransform(RC.dpr, 0, 0, RC.dpr, 0, 0); }
/* zone visible (repère du plan), avec une marge en pixels d'écran : à l'écran, seuls les objets qui la touchent
   sont dessinés. Elle vaut null pour les exports (PDF, image), qui dessinent toujours tout. */
let VIEW = null;
const VIEW_MARGIN = 160;
/* diagnostic pour les tests automatiques uniquement : ?debug=nocull (tout dessiner), nocache / cache (image mémorisée jamais / toujours) */
const DEBUG = (() => { try { return (new URLSearchParams(location.search).get('debug') || '').split(','); } catch (e) { return []; } })();
function viewRect() {
  const s = RC.s, m = VIEW_MARGIN / s;
  return { x0: -RC.ox / s - m, y0: -RC.oy / s - m, x1: (RC.w - RC.ox) / s + m, y1: (RC.h - RC.oy) / s + m };
}
const inView = (x, y, r) => !VIEW || (x + r >= VIEW.x0 && x - r <= VIEW.x1 && y + r >= VIEW.y0 && y - r <= VIEW.y1);
const bbInView = (b) => !VIEW || (b.x1 >= VIEW.x0 && b.x0 <= VIEW.x1 && b.y1 >= VIEW.y0 && b.y0 <= VIEW.y1);
/* boîte englobante mémorisée sur l'objet de géométrie (recalculé à chaque modification du plan) */
function bbOf(o, pts) { return o._bb || (o._bb = bboxOf(pts)); }
const wallInView = (wg) => !VIEW || bbInView(bbOf(wg, wg.poly));
function w2s(p) { return { x: p.x * RC.s + RC.ox, y: p.y * RC.s + RC.oy }; }
function pathPoly(c, pts) { if (!pts.length) return; c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); c.closePath(); }
function arcShort(c, cx, cy, r, a0, a1) {
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d <= -Math.PI) d += 2 * Math.PI;
  c.arc(cx, cy, r, a0, a0 + d, d < 0);
}
const TINTS = ['', 't1', 't2', 't3', 't4', 't5', 't6'];
const TINT_NAMES = ['Aucune', 'Sable', 'Sauge', 'Ciel', 'Rose', 'Lavande', 'Ardoise'];

/* ---------------- scène ---------------- */
function drawScene(lv, opts) {
  opts = opts || {};
  VIEW = opts.export || RC !== SCR || DEBUG.includes('nocull') ? null : viewRect();
  try { drawSceneIn(lv, opts); } finally { VIEW = null; }
}
function drawSceneIn(lv, opts) {
  const c = RC.ctx, Cc = RC.C;
  setScreen();
  c.fillStyle = Cc.paper; c.fillRect(0, 0, RC.w, RC.h);
  setWorld();
  const g = geo(lv);
  const K = K_();
  const below = levelBelow(lv);
  // pièces
  for (const r of g.rooms) {
    if (VIEW && !bbInView(bbOf(r, r.poly))) continue;
    c.beginPath(); pathPoly(c, r.poly); for (const h of r.holes) pathPoly(c, h);
    const tint = r.label && r.label.tint ? Cc[TINTS[r.label.tint]] : null;
    c.fillStyle = Cc.room; c.fill('evenodd');
    if (tint) { c.fillStyle = tint; c.fill('evenodd'); }
  }
  if (S.layers.grid && !opts.export) drawGrid();
  setWorld();
  if (below && S.layers.ghost && !opts.export) drawGhost(below.id);
  // trémies des escaliers du niveau inférieur
  if (below) for (const it of P.items) if (it.lv === below.id && isStair(it.type) && itemInView(it)) drawItem(c, it, K, 'upper');
  // mobilier
  if (opts.export ? opts.furn !== false : S.layers.furn) {
    for (const it of P.items) if (it.lv === lv && isStair(it.type) && itemInView(it)) drawItem(c, it, K, levelAbove(lv) ? 'lower' : 'full');
    for (const it of P.items) if (it.lv === lv && !isStair(it.type) && itemInView(it)) drawItem(c, it, K);
  } else {
    for (const it of P.items) if (it.lv === lv && isStair(it.type) && itemInView(it)) drawItem(c, it, K, levelAbove(lv) ? 'lower' : 'full');
  }
  drawWalls(g);
  drawOpenings(g);
  if (S.layers.elec) {
    drawDucts(lv, opts);
    if (S.layers.links !== false) drawLinks(lv, opts);
    for (const e of P.elec) {
      if (e.lv !== lv || !elecVisible(e)) continue;
      if (VIEW && !inView(e.x, e.y, elecSize(K) * 1.6)) continue;
      let K2 = K;
      if (S.layers.circ !== false && e.cid) { const col = circuitColor(e.cid, !!opts.export); if (col) K2 = Object.assign({}, K, { elec: col }); }
      if (!opts.export && ui.hl && e.cid === ui.hl) drawHalo(e);
      drawElec(c, e, K2);
    }
  }
  if (!opts.export || opts.dims !== false) drawDims(lv);
  setScreen();
  const occ = roomLabelRects(g);
  if (RC === SCR) setDIMHIT([]);
  if (S.layers.dims) drawWallDims(g, occ);
  drawRoomLabels(g);
  if (S.layers.elec) drawDuctLabels(lv, opts);
  drawTexts(lv);
  if (!opts.export || opts.dims !== false) drawDimLabels(lv);
}

const itemInView = (it) => !VIEW || inView(it.x, it.y, 0.5 * Math.hypot(it.w || 0, it.d || 0) + 10);
function linkAnchorRC(e) {
  const def = ELEC_BY.get(e.type); const u = Math.max(S_ELEC, 20 * RC.px);
  return def && def.wall ? itemToWorld(e, 0, 0.42 * u) : { x: e.x, y: e.y };
}
function drawLinks(lv, opts) {
  const c = RC.ctx, px = RC.px;
  for (const l of P.links) {
    if (l.lv !== lv || !linkVisible(l)) continue;
    const a = IDX.elec.get(l.a), b = IDX.elec.get(l.b); if (!a || !b) continue;
    const pa = linkAnchorRC(a), pb = linkAnchorRC(b);
    const d = vsub(pb, pa), L = vlen(d); if (L < 1) continue;
    const n = vperp(vmul(d, 1 / L)), bow = Math.min(L * 0.2, 140);
    if (VIEW && !inView((pa.x + pb.x) / 2, (pa.y + pb.y) / 2, L / 2 + bow + 10)) continue;
    const ctl = vadd(vmid(pa, pb), vmul(n, bow));
    const col = (S.layers.circ !== false && (a.cid || b.cid) && circuitColor(a.cid || b.cid, !!opts.export)) || RC.C.elec;
    const hi = !opts.export && ui.sel && ui.sel.t === 'elec' && (ui.sel.id === l.a || ui.sel.id === l.b);
    c.save(); c.strokeStyle = col; c.lineWidth = (hi ? 2.4 : 1.25) * px; c.setLineDash([6 * px, 4 * px]); c.globalAlpha = hi ? 1 : 0.8; c.lineCap = 'round';
    c.beginPath(); c.moveTo(pa.x, pa.y); c.quadraticCurveTo(ctl.x, ctl.y, pb.x, pb.y); c.stroke();
    c.setLineDash([]); c.fillStyle = col;
    for (const p of [pa, pb]) { c.beginPath(); c.arc(p.x, p.y, 2.2 * px, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
}
function drawHalo(e) {
  const c = RC.ctx, px = RC.px, p = linkAnchorRC(e), r = Math.max(S_ELEC * 0.8, 17 * px);
  c.save(); c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2); c.fillStyle = RC.C.accentSoft; c.fill(); c.lineWidth = 2 * px; c.strokeStyle = RC.C.accent; c.stroke(); c.restore();
}
function drawGrid() {
  const c = RC.ctx, s = RC.s;
  const seq = [5, 10, 50, 100, 500, 1000, 5000];
  let minor = seq.find((v) => v * s >= 11) || 5000;
  let major = minor < 100 ? 100 : minor * 5;
  if (minor === 50) major = 100;
  setScreen();
  const x0 = -RC.ox / s, y0 = -RC.oy / s, x1 = (RC.w - RC.ox) / s, y1 = (RC.h - RC.oy) / s;
  const line = (step, color, lw) => {
    c.beginPath();
    for (let x = Math.floor(x0 / step) * step; x <= x1; x += step) { const sx = Math.round(x * s + RC.ox) + 0.5; c.moveTo(sx, 0); c.lineTo(sx, RC.h); }
    for (let y = Math.floor(y0 / step) * step; y <= y1; y += step) { const sy = Math.round(y * s + RC.oy) + 0.5; c.moveTo(0, sy); c.lineTo(RC.w, sy); }
    c.strokeStyle = color; c.lineWidth = lw; c.stroke();
  };
  if (major / minor > 1.01) line(minor, RC.C.grid, 1);
  line(major, RC.C.gridMajor, 1);
}

function drawGhost(lv) {
  const c = RC.ctx, g = geo(lv);
  c.save(); c.globalAlpha = 0.9;
  c.beginPath();
  for (const wg of g.walls.values()) if (wallInView(wg)) pathPoly(c, wg.poly);
  c.fillStyle = RC.C.ghost; c.fill();
  c.restore();
}

function drawWalls(g) {
  const c = RC.ctx, px = RC.px;
  const pm = mkPath(c), pc = mkPath(c);
  for (const wg of g.walls.values()) {
    if (!wallInView(wg)) continue;
    const p = wg.w.kind === 'cloison' ? pc : pm;
    const q = wg.poly; p.moveTo(q[0].x, q[0].y); for (let i = 1; i < 4; i++) p.lineTo(q[i].x, q[i].y); p.closePath();
  }
  for (const hb of g.hubs) { if (VIEW && !bbInView(bbOf(hb, hb.pts))) continue; const p = hb.mur ? pm : pc; p.moveTo(hb.pts[0].x, hb.pts[0].y); for (let i = 1; i < hb.pts.length; i++) p.lineTo(hb.pts[i].x, hb.pts[i].y); p.closePath(); }
  c.fillStyle = RC.C.wall; c.fill(pm);
  c.fillStyle = RC.C.part; c.fill(pc);
  c.beginPath();
  for (const wg of g.walls.values()) {
    if (!wallInView(wg)) continue;
    const { h0, h1 } = wg;
    c.moveTo(h0.P.x, h0.P.y); c.lineTo(h1.N.x, h1.N.y);
    c.moveTo(h1.P.x, h1.P.y); c.lineTo(h0.N.x, h0.N.y);
    if (h0.cap) { c.moveTo(h0.N.x, h0.N.y); c.lineTo(h0.P.x, h0.P.y); }
    if (h1.cap) { c.moveTo(h1.N.x, h1.N.y); c.lineTo(h1.P.x, h1.P.y); }
  }
  c.strokeStyle = RC.C.ink; c.lineWidth = 1.2 * px; c.lineJoin = 'miter'; c.stroke();
}

function drawOpenings(g) {
  const c = RC.ctx, px = RC.px;
  for (const o of P.openings) {
    const wg = g.walls.get(o.wall); if (!wg) continue;
    if (VIEW) { const b = bbOf(wg, wg.poly), m = o.w || 0; if (!bbInView({ x0: b.x0 - m, y0: b.y0 - m, x1: b.x1 + m, y1: b.y1 + m })) continue; }
    c.save();
    c.translate(wg.A.x, wg.A.y); c.rotate(wg.ang);
    const h2 = wg.th / 2, x0 = o.t - o.w / 2, x1 = o.t + o.w / 2;
    c.fillStyle = RC.C.paper;
    c.fillRect(x0, -h2 - 0.9 * px, o.w, wg.th + 1.8 * px);
    c.strokeStyle = RC.C.ink; c.lineWidth = 1.2 * px; c.lineCap = 'butt';
    c.beginPath(); c.moveTo(x0, -h2); c.lineTo(x0, h2); c.moveTo(x1, -h2); c.lineTo(x1, h2); c.stroke();
    if (o.kind === 'window') drawWindowSym(c, o, x0, x1, h2, px);
    else if (o.kind === 'gap') drawGapSym(c, o, x0, x1, h2, px);
    else if (o.kind === 'closet') drawClosetSym(c, o, x0, x1, h2, px);
    else drawDoorSym(c, o, x0, x1, h2, px);
    c.restore();
  }
}
/* ouverture libre : allège éventuelle (muret sous la baie) et linteau en traits interrompus (au-dessus du plan de coupe) */
function drawGapSym(c, o, x0, x1, h2, px) {
  const W = x1 - x0;
  c.save();
  if ((o.sill || 0) > 0.5) {
    c.beginPath(); c.rect(x0, -h2, W, 2 * h2);
    c.fillStyle = RC.C.tone; c.fill(); c.lineWidth = 0.9 * px; c.strokeStyle = RC.C.ink; c.stroke();
  }
  if (!o.full) {
    c.lineWidth = 0.8 * px; c.strokeStyle = RC.C.ink2; c.setLineDash([5 * px, 3 * px]);
    const e = (o.sill || 0) > 0.5 ? 2.5 * px : 0;
    c.beginPath(); c.moveTo(x0, -h2 - e); c.lineTo(x1, -h2 - e); c.moveTo(x0, h2 + e); c.lineTo(x1, h2 + e); c.stroke();
  }
  c.restore();
}
/* portes de placard : les vantaux restent dans l'épaisseur de la façade, côté pièce */
function closetPlane(o, h2) { return (o.side || 1) * Math.max(0, h2 - 4); }
function closetLeafHinges(o) {
  const n = clamp(o.leaves || 1, 1, 4), out = [];
  for (let i = 0; i < n; i++) out.push(n === 1 ? !o.hinge : (n % 2 && o.hinge ? i % 2 === 1 : i % 2 === 0));
  return out;
}
function drawClosetSym(c, o, x0, x1, h2, px) {
  const s = o.side || 1, W = x1 - x0, type = o.type || 'coulissante';
  c.save();
  if (type === 'coulissante') {
    const n = clamp(o.leaves || 2, 2, 4), lw = W / n, vc = closetPlane(o, h2);
    const r = Math.min(2, Math.max(0.9, h2 * 0.5)), tl = Math.min(2.2, Math.max(1, h2 * 0.55));
    for (let i = 0; i < n; i++) {
      const off = vc + (i % 2 ? r : -r);
      const a = x0 + lw * i - (i > 0 ? 2.5 : 0), b = x0 + lw * (i + 1) + (i < n - 1 ? 2.5 : 0);
      c.beginPath(); c.rect(a, off - tl / 2, b - a, tl); c.fillStyle = RC.C.fill; c.fill(); c.lineWidth = 1 * px; c.strokeStyle = RC.C.ink; c.stroke();
    }
    const ay = s * (h2 + 9);
    arrowAlong(c, x0 + W * 0.3, x0 + W * 0.45, ay, px, 1);
    arrowAlong(c, x1 - W * 0.3, x1 - W * 0.45, ay, px, -1);
  } else if (type === 'battante') {
    const hs = closetLeafHinges(o), n = hs.length, lw = W / n, fy = s * h2;
    for (let i = 0; i < n; i++) {
      const a = x0 + lw * i, b = a + lw, hx = hs[i] ? a : b, ox = hs[i] ? b : a;
      leafRect(c, hx, fy, s, lw, hs[i] ? 1 : -1, px);
      swing(c, hx, fy, s, lw, ox, px, false);
    }
  } else if (type === 'pliante') {
    const n = (o.leaves || 2) >= 4 ? 4 : 2, lw = W / n, fy = s * h2;
    const ca = Math.cos(38 * DEG), sa = Math.sin(38 * DEG);
    const pairs = n === 4 ? [[x0, 1], [x1, -1]] : [[o.hinge ? x1 : x0, o.hinge ? -1 : 1]];
    c.lineWidth = 1.6 * px; c.strokeStyle = RC.C.ink; c.lineJoin = 'round';
    for (const [hx, dir] of pairs) {
      c.beginPath(); c.moveTo(hx, fy); c.lineTo(hx + dir * lw * ca, fy + s * lw * sa); c.lineTo(hx + dir * 2 * lw * ca, fy); c.stroke();
    }
    c.lineWidth = 0.8 * px; c.strokeStyle = RC.C.ink2; c.setLineDash([4 * px, 3 * px]);
    c.beginPath(); c.moveTo(x0, fy); c.lineTo(x1, fy); c.stroke();
  }
  c.restore();
}
function leafRect(c, hx, fy, s, L, dir, px) {
  const t = Math.max(3.5, 2.2 * px);
  c.beginPath(); c.rect(dir > 0 ? hx : hx - t, Math.min(fy, fy + s * L), t, L);
  c.fillStyle = RC.C.fill; c.fill(); c.lineWidth = 1.1 * px; c.strokeStyle = RC.C.ink; c.stroke();
}
function swing(c, hx, fy, s, L, ox, px, dashed) {
  c.save();
  c.lineWidth = 0.8 * px; c.strokeStyle = RC.C.ink2;
  if (dashed) c.setLineDash([4 * px, 3 * px]);
  c.beginPath();
  const a0 = s > 0 ? Math.PI / 2 : -Math.PI / 2, a1 = ox > hx ? 0 : Math.PI;
  c.moveTo(hx, fy + s * L);
  arcShort(c, hx, fy, L, a0, a1);
  c.stroke(); c.restore();
}
function drawDoorSym(c, o, x0, x1, h2, px) {
  const s = o.side || 1, fy = s * h2, W = x1 - x0;
  const type = o.type || 'battante';
  if (type === 'battante' || type === 'entree' || type === 'vaetvient') {
    const sides = type === 'vaetvient' ? [s, -s] : [s];
    for (const ss of sides) {
      const f = ss * h2, dashed = ss !== s;
      if ((o.leaves || 1) >= 2) {
        const L = W / 2;
        if (!dashed) { leafRect(c, x0, f, ss, L, 1, px); leafRect(c, x1, f, ss, L, -1, px); }
        swing(c, x0, f, ss, L, x0 + L, px, dashed); swing(c, x1, f, ss, L, x1 - L, px, dashed);
      } else {
        const hx = o.hinge ? x1 : x0, ox = o.hinge ? x0 : x1;
        if (!dashed) leafRect(c, hx, f, ss, W, ox > hx ? 1 : -1, px);
        swing(c, hx, f, ss, W, ox, px, dashed);
      }
    }
    if (type === 'entree') { c.save(); c.lineWidth = 2 * px; c.beginPath(); c.moveTo(x0, -fy); c.lineTo(x1, -fy); c.stroke(); c.restore(); }
  } else if (type === 'coulissante') {
    const n = clamp(o.leaves || 1, 1, 4), lw = W / n;
    c.save(); c.lineWidth = 0.8 * px; c.strokeStyle = RC.C.ink2; c.setLineDash([4 * px, 3 * px]);
    const ext = n === 1 ? W : 0;
    c.beginPath(); c.moveTo(o.hinge ? x0 : x0 - ext, fy + s * 1); c.lineTo(o.hinge ? x1 + ext : x1, fy + s * 1); c.stroke(); c.restore();
    for (let i = 0; i < n; i++) {
      const off = 1.5 + (i % 2) * 4;
      const a = x0 + lw * i - 2, b = x0 + lw * (i + 1) + 2;
      c.beginPath(); c.rect(a, fy + s * off, b - a, s * 3.2);
      c.fillStyle = RC.C.fill; c.fill(); c.lineWidth = 1.1 * px; c.strokeStyle = RC.C.ink; c.stroke();
    }
    arrowAlong(c, o.hinge ? x1 - W * 0.25 : x0 + W * 0.25, o.hinge ? x1 - W * 0.05 + 0.0001 : x0 + W * 0.05, fy + s * 12, px, o.hinge ? 1 : -1);
  } else if (type === 'galandage') {
    const n = (o.leaves || 1) >= 2 ? 2 : 1;
    const pockets = n === 2 ? [[x0 - W / 2, x0], [x1, x1 + W / 2]] : (o.hinge ? [[x0 - W, x0]] : [[x1, x1 + W]]);
    c.save(); c.strokeStyle = RC.C.paper; c.lineWidth = 2 * px; c.setLineDash([5 * px, 3 * px]);
    c.beginPath(); for (const [a, b] of pockets) { c.moveTo(a + 3, 0); c.lineTo(b, 0); } c.stroke(); c.restore();
    c.beginPath();
    if (n === 2) { c.rect(x0, -1.6, W * 0.18, 3.2); c.rect(x1 - W * 0.18, -1.6, W * 0.18, 3.2); }
    else if (o.hinge) c.rect(x0, -1.6, W * 0.3, 3.2); else c.rect(x1 - W * 0.3, -1.6, W * 0.3, 3.2);
    c.fillStyle = RC.C.fill; c.fill(); c.lineWidth = 1.1 * px; c.strokeStyle = RC.C.ink; c.stroke();
  } else if (type === 'pliante') {
    const n = clamp(o.leaves || 4, 2, 6), lw = W / n, dep = Math.min(lw * 0.7, 30);
    c.save(); c.lineWidth = 1.4 * px; c.beginPath(); c.moveTo(x0, fy);
    for (let i = 1; i <= n; i++) c.lineTo(x0 + lw * i, fy + (i % 2 ? s * dep : 0));
    c.stroke(); c.restore();
  } else if (type === 'garage') {
    c.save(); c.lineWidth = 2 * px; c.beginPath(); c.moveTo(x0, fy); c.lineTo(x1, fy); c.stroke();
    c.lineWidth = 0.8 * px; c.strokeStyle = RC.C.ink2; c.setLineDash([6 * px, 4 * px]);
    const dep = Math.min(Math.max(W, 200), 300);
    c.beginPath(); c.moveTo(x0 + 4, fy); c.lineTo(x0 + 4, fy + s * dep); c.moveTo(x1 - 4, fy); c.lineTo(x1 - 4, fy + s * dep); c.moveTo(x0 + 4, fy + s * dep); c.lineTo(x1 - 4, fy + s * dep); c.stroke();
    c.restore();
  }
}
function arrowAlong(c, xa, xb, y, px, dir) {
  c.save(); c.strokeStyle = RC.C.ink2; c.fillStyle = RC.C.ink2; c.lineWidth = 0.9 * px;
  c.beginPath(); c.moveTo(xa, y); c.lineTo(xb, y); c.stroke();
  const h = 6 * px;
  c.beginPath(); c.moveTo(xb, y); c.lineTo(xb - dir * h, y - h * 0.5); c.lineTo(xb - dir * h, y + h * 0.5); c.closePath(); c.fill();
  c.restore();
}
function drawWindowSym(c, o, x0, x1, h2, px) {
  const s = o.side || 1, W = x1 - x0;
  const type = o.type || 'battant';
  c.save();
  c.lineWidth = 0.9 * px; c.strokeStyle = RC.C.ink;
  c.beginPath(); c.moveTo(x0, -h2); c.lineTo(x1, -h2); c.moveTo(x0, h2); c.lineTo(x1, h2); c.stroke();
  const n = type === 'soufflet' ? 1 : clamp(o.leaves || 1, 1, 4);
  const gy = Math.min(1.8, h2 * 0.5);
  if (type === 'coulissant' || type === 'baie') {
    const nn = Math.max(2, n), lw = W / nn;
    for (let i = 0; i < nn; i++) {
      const off = (i % 2 ? 1 : -1) * Math.min(2.6, h2 * 0.5);
      const a = x0 + lw * i - (i > 0 ? 3 : 0), b = x0 + lw * (i + 1) + (i < nn - 1 ? 3 : 0);
      c.beginPath(); c.rect(a, off - 1.3, b - a, 2.6); c.fillStyle = RC.C.fill; c.fill(); c.lineWidth = 1 * px; c.stroke();
    }
    arrowAlong(c, x0 + W * 0.3, x0 + W * 0.45, s * (h2 + 8), px, 1);
    arrowAlong(c, x1 - W * 0.3, x1 - W * 0.45, s * (h2 + 8), px, -1);
    c.restore(); return;
  }
  c.beginPath(); c.rect(x0, -gy, W, gy * 2); c.fillStyle = RC.C.fill; c.fill(); c.lineWidth = 1 * px; c.stroke();
  if (n > 1) { c.beginPath(); for (let i = 1; i < n; i++) { const x = x0 + (W / n) * i; c.moveTo(x, -gy); c.lineTo(x, gy); } c.stroke(); }
  if (type === 'battant' || type === 'oscillo' || type === 'pfenetre') {
    const lw = W / n;
    for (let i = 0; i < n; i++) {
      const a = x0 + lw * i, b = a + lw, cx = (a + b) / 2;
      let hingeLeft;
      if (n === 1) hingeLeft = !o.hinge;
      else if (Math.abs(cx - (x0 + W / 2)) < 0.01) hingeLeft = !o.hinge;
      else hingeLeft = cx < x0 + W / 2;
      const hx = hingeLeft ? a : b, ox = hingeLeft ? b : a;
      c.beginPath(); c.moveTo(hx, s * gy); c.lineTo(hx, s * (gy + lw)); c.lineWidth = 1.1 * px; c.strokeStyle = RC.C.ink; c.stroke();
      swing(c, hx, s * gy, s, lw, ox, px, false);
    }
  }
  if (type === 'oscillo' || type === 'soufflet') {
    c.save(); c.setLineDash([4 * px, 3 * px]); c.lineWidth = 0.8 * px; c.strokeStyle = RC.C.ink2;
    c.beginPath(); c.moveTo(x0, s * h2); c.lineTo(x0 + W / 2, s * (h2 + Math.min(W * 0.22, 26))); c.lineTo(x1, s * h2); c.stroke(); c.restore();
  }
  c.restore();
}

/* ---------------- cotes & textes ---------------- */
function textHalo(c, str, x, y) {
  c.lineWidth = TS(3.2); c.strokeStyle = RC.C.halo || RC.C.paper; c.lineJoin = 'round'; c.strokeText(str, x, y); c.fillText(str, x, y);
}
function roomLabelRects(g) {
  const out = [];
  if (!S.layers.names && !S.layers.areas) return out;
  const c = RC.ctx;
  for (const r of g.rooms) {
    if (VIEW && !bbInView(bbOf(r, r.poly))) continue;
    const p = r.label ? w2s(r.label) : w2s(labelPoint(r.poly));
    c.font = `650 ${TS(13)}px ${FONT_UI}`;
    const w1 = r.label && S.layers.names ? c.measureText(r.label.name).width : 0;
    c.font = `500 ${TS(11.5)}px ${FONT_LABEL}`;
    const w2 = S.layers.areas ? c.measureText(fmtArea(r.area)).width : 0;
    const hw = Math.max(w1, w2) / 2 + 3, hh = TS(w1 && w2 ? 18 : 9) + 2;
    out.push({ x0: p.x - hw, y0: p.y - hh, x1: p.x + hw, y1: p.y + hh });
  }
  return out;
}
const rectHit = (a, b) => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
function drawWallDims(g, occ) {
  occ = occ || [];
  const c = RC.ctx;
  c.font = `500 ${TS(11)}px ${FONT_LABEL}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillStyle = RC.C.ink2;
  const roomsLoops = g.rooms.map((r) => r.loop);
  for (const wg of g.walls.values()) {
    if (!wallInView(wg)) continue;
    const items = [];
    if (S.dimMode === 'axe') {
      const mid = vmid(wg.A, wg.B);
      const test = vadd(mid, vmul(wg.n, wg.th / 2 + 15));
      const sideP = !roomsLoops.some((L) => inPoly(test, L));
      const nrm = sideP ? wg.n : vmul(wg.n, -1);
      items.push({ a: wg.A, b: wg.B, L: wg.L, n: nrm, off: wg.th / 2, sgn: 0 });
    } else if (S.dimMode === 'faces') {
      const [p0, p1] = wg.faceP, [q0, q1] = wg.faceN;
      items.push({ a: p0, b: p1, L: vdist(p0, p1), n: wg.n, off: 0, sgn: 1 });
      items.push({ a: q0, b: q1, L: vdist(q0, q1), n: vmul(wg.n, -1), off: 0, sgn: -1 });
    }
    for (const it of items) {
      const sa = w2s(it.a), sb = w2s(it.b);
      const sl = vdist(sa, sb);
      const str = fmtLen(it.L);
      const tw = c.measureText(str).width;
      if (sl < tw + TS(14) || it.L < 1) continue;
      const m = vmid(sa, sb);
      const off = it.off * RC.s + TS(9);
      const p = { x: m.x + it.n.x * off, y: m.y + it.n.y * off };
      let ang = Math.atan2(sb.y - sa.y, sb.x - sa.x);
      if (ang > Math.PI / 2 + 0.01) ang -= Math.PI; else if (ang < -Math.PI / 2 + 0.01) ang += Math.PI;
      const ca = Math.abs(Math.cos(ang)), sn = Math.abs(Math.sin(ang));
      const bw = (tw / 2) * ca + TS(6) * sn, bh = (tw / 2) * sn + TS(6) * ca;
      const box = { x0: p.x - bw, y0: p.y - bh, x1: p.x + bw, y1: p.y + bh };
      if (occ.some((o) => rectHit(o, box))) continue;
      occ.push(box);
      if (RC === SCR) DIMHIT.push({ box, wid: wg.w.id, sgn: it.sgn });
      const editing = RC === SCR && ui.dimEdit && ui.dimEdit.wid === wg.w.id && ui.dimEdit.sgn === it.sgn;
      if (editing) { c.save(); c.fillStyle = RC.C.accentSoft; c.strokeStyle = RC.C.accent; c.lineWidth = 1.5; c.beginPath(); _rr(c, box.x0 - 3, box.y0 - 2, box.x1 - box.x0 + 6, box.y1 - box.y0 + 4, 5); c.fill(); c.stroke(); c.restore(); }
      c.save(); c.translate(p.x, p.y); c.rotate(ang); textHalo(c, str, 0, 0); c.restore();
    }
  }
}
function drawRoomLabels(g) {
  if (!S.layers.names && !S.layers.areas) return;
  const c = RC.ctx;
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const r of g.rooms) {
    if (VIEW && !bbInView(bbOf(r, r.poly))) continue;
    const lbl = r.label;
    const p = lbl ? w2s(lbl) : w2s(labelPoint(r.poly));
    const showName = S.layers.names && lbl;
    const area = fmtArea(r.area);
    c.fillStyle = RC.C.ink;
    if (showName) {
      c.font = `650 ${TS(13)}px ${FONT_UI}`;
      textHalo(c, lbl.name, p.x, p.y - (S.layers.areas ? TS(8) : 0));
    }
    if (S.layers.areas) {
      c.font = `500 ${TS(11.5)}px ${FONT_LABEL}`; c.fillStyle = RC.C.ink2;
      textHalo(c, area, p.x, p.y + (showName ? TS(9) : 0));
    }
  }
}
const dimInView = (d) => !VIEW || bbInView({ x0: Math.min(d.ax, d.bx), y0: Math.min(d.ay, d.by), x1: Math.max(d.ax, d.bx), y1: Math.max(d.ay, d.by) });
function drawDims(lv) {
  const c = RC.ctx, px = RC.px;
  c.save(); c.strokeStyle = RC.C.ink; c.lineWidth = 0.9 * px;
  for (const d of P.dims) {
    if (d.lv !== lv || !dimInView(d)) continue;
    const a = { x: d.ax, y: d.ay }, b = { x: d.bx, y: d.by };
    const u = vnorm(vsub(b, a)), n = vperp(u), t = 5 * px;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y);
    for (const p of [a, b]) { c.moveTo(p.x - (u.x + n.x) * t, p.y - (u.y + n.y) * t); c.lineTo(p.x + (u.x + n.x) * t, p.y + (u.y + n.y) * t); c.moveTo(p.x - n.x * t * 1.6, p.y - n.y * t * 1.6); c.lineTo(p.x + n.x * t * 1.6, p.y + n.y * t * 1.6); }
    c.stroke();
  }
  c.restore();
}
function drawDimLabels(lv) {
  const c = RC.ctx;
  c.font = `600 ${TS(11.5)}px ${FONT_LABEL}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = RC.C.ink;
  for (const d of P.dims) {
    if (d.lv !== lv || !dimInView(d)) continue;
    const a = w2s({ x: d.ax, y: d.ay }), b = w2s({ x: d.bx, y: d.by });
    const L = vdist({ x: d.ax, y: d.ay }, { x: d.bx, y: d.by });
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (ang > Math.PI / 2 + 0.01) ang -= Math.PI; else if (ang < -Math.PI / 2 + 0.01) ang += Math.PI;
    const m = vmid(a, b);
    c.save(); c.translate(m.x, m.y); c.rotate(ang); textHalo(c, fmtLen(L), 0, -TS(9)); c.restore();
  }
}
const TEXT_SIZES = { s: 16, m: 24, l: 38 };
function drawTexts(lv) {
  const c = RC.ctx;
  for (const t of P.texts) {
    if (t.lv !== lv) continue;
    if (VIEW && !inView(t.x, t.y, ((t.text || ' ').length * 0.7 + 1) * Math.max(9 / RC.s, TEXT_SIZES[t.size] || 24))) continue;
    const p = w2s(t);
    const fs = Math.max(9, (TEXT_SIZES[t.size] || 24) * RC.s);
    c.save(); c.translate(p.x, p.y); c.rotate((t.rot || 0) * DEG);
    c.font = `600 ${fs}px ${FONT_UI}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = RC.C.ink;
    textHalo(c, t.text || ' ', 0, 0);
    c.restore();
  }
}
function textBox(t) {
  const fs = TEXT_SIZES[t.size] || 24;
  const c = RC.ctx; c.save(); c.font = `600 ${Math.max(9, fs * RC.s)}px ${FONT_UI}`;
  const w = c.measureText(t.text || ' ').width / RC.s; c.restore();
  const h = Math.max(9 / RC.s, fs) * 1.2;
  return { w: w + 8 / RC.s, h };
}
/* modification depuis un autre module (une variable importée ne peut pas être réaffectée directement) */
function setRC(v) { RC = v; }

export { DEBUG, FONT_LABEL, FONT_UI, K_, RC, TEXT_SIZES, TINTS, TINT_NAMES, TS, V, VIEW, VIEW_MARGIN, arcShort,
  arrowAlong, bbInView, bbOf, closetLeafHinges, closetPlane, dimInView, drawClosetSym, drawDimLabels, drawDims,
  drawDoorSym, drawGapSym, drawGhost, drawGrid, drawHalo, drawLinks, drawOpenings, drawRoomLabels, drawScene,
  drawSceneIn, drawTexts, drawWallDims, drawWalls, drawWindowSym, inView, itemInView, leafRect, linkAnchorRC, pathPoly,
  readColors, rectHit, roomLabelRects, setRC, setScreen, setWorld, swing, textBox, textHalo, viewRect, w2s, wallInView };

/* Calque — module « interaction » : interaction : vue, sélection, outils, aimantation, Apple Pencil.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { $, C, DEG, EXT, IDX, isNum, NF0, P, S, bboxOf, clamp, fmtArea, fmtLen, fmtLenU, inPoly, levelOf, levelsSorted, lineX,
  nodeOf, projSeg, saveSettings, setGEO, setP, snapTo, touch, ui, uid, vadd, vdir, vdist, vdot, vlen, vmid, vmul,
  vnorm, vperp, vsub } from './noyau.js';
import { geo, roomOfLabel, syncRooms } from './geometrie.js';
import { addWall, clampOpening, findNodeNear, findWallNear, itemToLocal, itemToWorld, mergeNodes, nearestFace, normDeg,
  splitWall, wallsAt } from './mutations.js';
import { H, historyTrim, packPlan, samePack, unpackPlan } from './historique.js';
import { EV, emit } from './evenements.js';
import { ELEC_BY, _rr, drawElec, drawItem, elecBox, furnDef, isStair } from './symboles.js';
import { DEBUG, FONT_LABEL, K_, V, drawScene, pathPoly, setRC, setScreen, setWorld, textBox, w2s } from './rendu2d.js';
import { CMDS, LINK_TARGETS, linkAnchor, toggleLink } from './electricite.js';
import { closeDimEdit, dimHitAt, drawDuctDraft, ductAt, ductHandleDrag, ductHandles, ductLen, ductPts, ductTap,
  elecVisible, openDimEdit, snapDuctPoint, syncDucts, updateFilterUI } from './reseaux.js';
import { renderElecView } from './tableau.js';
import { closePops, fmtIn, parseNum, renderInspector, renderLevels, setTool, toast, updateHint, wallMovingEnds } from './interface.js';
import { scheduleSave } from './stockage.js';
import { v3Refresh } from './vue3d.js';
import { applyComp, upsertPlanComp } from './composants.js';
import { tailleChemin } from './cheminement.js';

/* ============================================================
   CALQUE — interaction : vue, sélection, outils, aimantation
   ============================================================ */
const cv = $('#cv');
const ctx = cv.getContext('2d');
const SCR = { ctx, w: 300, h: 300, dpr: 1, s: 1, ox: 0, oy: 0, px: 1, C };
const keys = { space: false, shift: false };

function resizeCanvas() {
  const r = cv.getBoundingClientRect();
  if (r.width < 10 || r.height < 10) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
  const first = SCR.w === 300 && SCR.h === 300;
  if (!first && r.width > 10 && r.height > 10) { V.ox += (r.width - SCR.w) / 2; V.oy += (r.height - SCR.h) / 2; }
  if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
  SCR.w = r.width; SCR.h = r.height; SCR.dpr = dpr;
  if (first && r.width > 10 && P) fitView();
  requestRender();
}
let rafId = 0;
/* requestRender(true) : seule la couche du dessus change (curseur, aperçu d'un mur en cours, survol).
   Le plan lui-même est alors repris d'une image mémorisée, sans être redessiné. Tout autre appel redessine le plan. */
let sceneDirty = true;
function requestRender(overlayOnly) {
  if (!overlayOnly) sceneDirty = true;
  if (!rafId) rafId = requestAnimationFrame(() => { rafId = 0; render(); });
}
/* image mémorisée du plan (couches fixes) : utilisée seulement quand le dessin du plan est coûteux (gros plans) */
const SCENE = { cv: null, key: '', slow: false };
const SCENE_SLOW_MS = 4;
function render() {
  if (!P) return;
  SCR.s = V.s; SCR.ox = V.ox; SCR.oy = V.oy; SCR.px = 1 / V.s; SCR.C = C;
  setRC(SCR);
  const key = [V.s, V.ox, V.oy, SCR.w, SCR.h, SCR.dpr, cv.width, cv.height, ui.lv].join('|');
  const reuse = !sceneDirty && SCENE.cv && SCENE.key === key;
  sceneDirty = false;
  ctx.save();
  if (reuse) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(SCENE.cv, 0, 0); }
  else {
    const t0 = performance.now();
    drawScene(ui.lv);
    SCENE.slow = DEBUG.includes('cache') || (!DEBUG.includes('nocache') && performance.now() - t0 > SCENE_SLOW_MS);
    if (SCENE.slow) {
      if (!SCENE.cv) SCENE.cv = document.createElement('canvas');
      if (SCENE.cv.width !== cv.width || SCENE.cv.height !== cv.height) { SCENE.cv.width = cv.width; SCENE.cv.height = cv.height; }
      const sc = SCENE.cv.getContext('2d'); sc.setTransform(1, 0, 0, 1, 0, 0); sc.clearRect(0, 0, cv.width, cv.height); sc.drawImage(cv, 0, 0);
      SCENE.key = key;
    } else if (SCENE.cv) { SCENE.cv.width = SCENE.cv.height = 0; SCENE.cv = null; SCENE.key = ''; } // petit plan : pas de mémoire utilisée
  }
  drawOverlay();
  ctx.restore();
  updateStatus();
}
function screenToWorld(x, y) { return { x: (x - V.ox) / V.s, y: (y - V.oy) / V.s }; }
function zoomAt(sx, sy, f) {
  const s2 = clamp(V.s * f, 0.04, 14);
  const w = screenToWorld(sx, sy);
  V.s = s2; V.ox = sx - w.x * s2; V.oy = sy - w.y * s2;
  requestRender();
}
function contentBBox(lv, all) {
  const pts = [];
  for (const n of P.nodes) if (all || n.lv === lv) pts.push(n);
  for (const it of P.items) if (all || it.lv === lv) { pts.push({ x: it.x - it.w / 2, y: it.y - it.d / 2 }, { x: it.x + it.w / 2, y: it.y + it.d / 2 }); }
  for (const e of P.elec) if (all || e.lv === lv) pts.push(e);
  for (const d of P.ducts) if (all || d.lv === lv) pts.push(...d.pts);
  if (!pts.length) return null;
  return bboxOf(pts);
}
function fitView() {
  const bb = contentBBox(ui.lv) || contentBBox(ui.lv, true);
  const W = SCR.w, Hh = SCR.h;
  if (!bb) { V.s = 0.7; V.ox = W / 2; V.oy = Hh / 2; requestRender(); return; }
  const pad = Math.min(70, W * 0.08);
  const topPad = $('#hint').hidden ? pad : pad + 40;
  const bw = Math.max(100, bb.x1 - bb.x0), bh = Math.max(100, bb.y1 - bb.y0);
  V.s = clamp(Math.min((W - 2 * pad) / bw, (Hh - topPad - pad) / bh), 0.05, 6);
  V.ox = (W - bw * V.s) / 2 - bb.x0 * V.s;
  V.oy = topPad + (Hh - topPad - pad - bh * V.s) / 2 - bb.y0 * V.s;
  requestRender();
}
/* tolérances en pixels d'écran : la souris et l'Apple Pencil sont précis, le doigt beaucoup moins */
const hitTol = () => (ui.pointerType === 'mouse' ? 7 : ui.pointerType === 'pen' ? 9 : 15);
const TAP = () => (ui.pointerType === 'mouse' ? 4 : ui.pointerType === 'pen' ? 5 : 10);

/* ---------------- test de sélection ---------------- */
function K_screen() { return { px: 1 / V.s }; }
function handlesOf(sel) {
  const out = [];
  if (!sel) return out;
  const px = 1 / V.s;
  if (sel.t === 'item') {
    const it = IDX.items.get(sel.id); if (!it) return out;
    out.push({ kind: 'rot', p: itemToWorld(it, 0, -it.d / 2 - 30 * px), id: it.id });
    out.push({ kind: 'rw', p: itemToWorld(it, it.w / 2, 0), id: it.id });
    out.push({ kind: 'rd', p: itemToWorld(it, 0, it.d / 2), id: it.id });
  } else if (sel.t === 'wall') {
    const w = IDX.walls.get(sel.id); if (!w) return out;
    out.push({ kind: 'node', p: nodeOf(w.a), id: w.a });
    out.push({ kind: 'node', p: nodeOf(w.b), id: w.b });
  } else if (sel.t === 'dim') {
    const d = IDX.dims.get(sel.id); if (!d) return out;
    out.push({ kind: 'dimA', p: { x: d.ax, y: d.ay }, id: d.id });
    out.push({ kind: 'dimB', p: { x: d.bx, y: d.by }, id: d.id });
  } else if (sel.t === 'duct') {
    const d = IDX.ducts.get(sel.id); if (!d) return out;
    return ductHandles(d);
  } else if (sel.t === 'elec' || sel.t === 'text') {
    const o = sel.t === 'elec' ? IDX.elec.get(sel.id) : IDX.texts.get(sel.id); if (!o) return out;
    if (sel.t === 'text') out.push({ kind: 'rot', p: { x: o.x, y: o.y - textBox(o).h / 2 - 26 * px }, id: o.id, text: true });
  }
  return out;
}
function hitTest(p, tolPx) {
  const tol = tolPx / V.s, lv = ui.lv, g = geo(lv), K = K_screen();
  for (const h of handlesOf(ui.sel)) if (vdist(h.p, p) <= tol * (h.kind === 'dmid' ? 1 : 1.3) + 3 / V.s) return { t: 'handle', kind: h.kind, id: h.id, text: h.text, idx: h.idx };
  if (S.layers.elec) for (let i = P.elec.length - 1; i >= 0; i--) {
    const e = P.elec[i]; if (e.lv !== lv || !elecVisible(e)) continue;
    const l = itemToLocal(e, p), b = elecBox(e, K), m = tol * 0.4;
    if (l.x >= b.x0 - m && l.x <= b.x1 + m && l.y >= b.y0 - m && l.y <= b.y1 + m) return { t: 'elec', id: e.id };
  }
  setRC(SCR);
  for (let i = P.texts.length - 1; i >= 0; i--) {
    const t = P.texts[i]; if (t.lv !== lv) continue;
    const bx = textBox(t), l = itemToLocal(t, p);
    if (Math.abs(l.x) <= bx.w / 2 + tol * 0.3 && Math.abs(l.y) <= bx.h / 2 + tol * 0.3) return { t: 'text', id: t.id };
  }
  for (const d of P.dims) {
    if (d.lv !== lv) continue;
    if (projSeg(p, { x: d.ax, y: d.ay }, { x: d.bx, y: d.by }).d <= tol) return { t: 'dim', id: d.id };
  }
  for (const o of P.openings) {
    const wg = g.walls.get(o.wall); if (!wg) continue;
    const u = vdot(vsub(p, wg.A), wg.d), v = vdot(vsub(p, wg.A), wg.n);
    if (u >= o.t - o.w / 2 - tol * 0.3 && u <= o.t + o.w / 2 + tol * 0.3 && Math.abs(v) <= wg.th / 2 + tol * 0.6) return { t: 'opening', id: o.id };
  }
  let bn = null, bd = Math.max(tol, 9 / V.s);
  for (const n of P.nodes) { if (n.lv !== lv) continue; const dd = vdist(n, p); if (dd <= bd) { bd = dd; bn = n; } }
  if (bn && wallsAt(bn.id).length) return { t: 'node', id: bn.id };
  const dk = ductAt(p, tol); if (dk) return { t: 'duct', id: dk };
  for (const wg of g.walls.values()) {
    const pr = projSeg(p, wg.A, wg.B);
    if (pr.t >= 0 && pr.t <= 1 && pr.d <= wg.th / 2 + tol * 0.35) return { t: 'wall', id: wg.w.id };
  }
  for (let i = P.items.length - 1; i >= 0; i--) {
    const it = P.items[i]; if (it.lv !== lv) continue;
    if (!S.layers.furn && !isStair(it.type)) continue;
    const l = itemToLocal(it, p);
    if (Math.abs(l.x) <= it.w / 2 + tol * 0.2 && Math.abs(l.y) <= it.d / 2 + tol * 0.2) return { t: 'item', id: it.id };
  }
  for (const o of P.openings) {
    if (o.kind !== 'door') continue;
    const wg = g.walls.get(o.wall); if (!wg) continue;
    const s = o.side || 1, x0 = o.t - o.w / 2, x1 = o.t + o.w / 2;
    const u = vdot(vsub(p, wg.A), wg.d), v = vdot(vsub(p, wg.A), wg.n) * s;
    if (u >= x0 && u <= x1 && v >= wg.th / 2 && v <= wg.th / 2 + o.w * 0.95) {
      const hx = o.hinge ? x1 : x0;
      if (Math.hypot(u - hx, v - wg.th / 2) <= o.w) return { t: 'opening', id: o.id };
    }
  }
  if (S.layers.names || S.layers.areas) for (const r of g.rooms) {
    if (!r.label) continue;
    const sp = { x: r.label.x * V.s + V.ox, y: r.label.y * V.s + V.oy }, ps = { x: p.x * V.s + V.ox, y: p.y * V.s + V.oy };
    const hw = Math.max(34, (r.label.name || '').length * 4.2 + 8);
    if (Math.abs(ps.x - sp.x) <= hw && Math.abs(ps.y - sp.y) <= 18) return { t: 'label', id: r.label.id };
  }
  for (const r of g.rooms) if (r.label && inPoly(p, r.loop) && !r.holes.some((h) => inPoly(p, h))) return { t: 'room', id: r.label.id };
  return null;
}

/* ---------------- aimantation ---------------- */
function snapPoint(p, o) {
  o = o || {};
  const lv = ui.lv, tol = 12 / V.s;
  const n = findNodeNear(lv, p, tol, o.exclude);
  if (n) return { x: n.x, y: n.y, node: n.id, kind: 'node', guides: [] };
  if (o.corners) {
    let best = null, bd = tol;
    for (const wg of geo(lv).walls.values()) for (const q of wg.poly) { const d = vdist(q, p); if (d < bd) { bd = d; best = q; } }
    if (best) return { x: best.x, y: best.y, kind: 'corner', guides: [] };
  }
  let q, snappedAng = null;
  if (o.from) {
    const v = vsub(p, o.from);
    let L = vlen(v), a = Math.atan2(v.y, v.x);
    if (S.ortho && L > 0.5) {
      const st = 15 * DEG, aa = Math.round(a / st) * st;
      const is45 = Math.abs(Math.round(aa / (45 * DEG)) * 45 * DEG - aa) < 1e-6;
      if (Math.abs(a - aa) < (is45 ? 7 : 3) * DEG) { a = aa; snappedAng = a; }
    }
    L = snapTo(L, S.grid);
    q = vadd(o.from, vmul(vdir(a), L));
  } else q = { x: snapTo(p.x, S.grid), y: snapTo(p.y, S.grid) };
  const wh = findWallNear(lv, p, tol, o.exclude);
  if (wh) {
    if (snappedAng !== null && o.from) {
      const A = nodeOf(wh.w.a), B = nodeOf(wh.w.b);
      const X = lineX(o.from, vdir(snappedAng), A, vsub(B, A));
      if (X && vdist(X, p) < tol * 1.6) { const pr = projSeg(X, A, B); if (pr.t > 0 && pr.t < 1) return { x: X.x, y: X.y, onWall: wh.w.id, kind: 'wall', guides: [] }; }
    }
    return { x: wh.pt.x, y: wh.pt.y, onWall: wh.w.id, kind: 'wall', guides: [] };
  }
  const guides = [];
  const tolA = 8 / V.s;
  const canX = snappedAng === null || Math.abs(Math.sin(snappedAng)) < 1e-6;
  const canY = snappedAng === null || Math.abs(Math.cos(snappedAng)) < 1e-6;
  let gx = null, gy = null;
  for (const m of P.nodes) {
    if (m.lv !== lv || m.id === o.exclude) continue;
    if (o.from && vdist(m, o.from) < 0.5) continue;
    const dx = Math.abs(q.x - m.x), dy = Math.abs(q.y - m.y);
    if (canX && dx < tolA && (!gx || dx < gx.d)) gx = { v: m.x, d: dx, n: m };
    if (canY && dy < tolA && (!gy || dy < gy.d)) gy = { v: m.y, d: dy, n: m };
  }
  if (gx) { q.x = gx.v; guides.push(gx.n); }
  if (gy) { q.y = gy.v; guides.push(gy.n); }
  return { x: q.x, y: q.y, kind: guides.length ? 'align' : 'free', guides };
}
/* plaque un meuble contre le mur le plus proche */
function magnetItem(it, c) {
  const reach = Math.max(28, 18 / V.s);
  const nf = nearestFace(it.lv, c, it.d / 2 + reach);
  if (!nf) return null;
  const m = nf.f.n;
  const s = clamp(nf.s, 0, nf.L);
  let along = s;
  const tolE = Math.max(14, 12 / V.s);
  // coller aux extrémités de la face (angles)
  if (Math.abs(along - it.w / 2) < tolE) along = it.w / 2;
  else if (Math.abs(along + it.w / 2 - nf.L) < tolE) along = nf.L - it.w / 2;
  // coller aux meubles voisins alignés sur le même mur
  const rot = normDeg(Math.atan2(-m.x, m.y) / DEG);
  for (const o of P.items) {
    if (o === it || o.lv !== it.lv || Math.abs(normDeg(o.rot || 0) - rot) > 0.5 && Math.abs(Math.abs(normDeg(o.rot || 0) - rot) - 360) > 0.5) continue;
    const os = vdot(vsub(o, nf.f.a), nf.u);
    const od = vdot(vsub(o, nf.f.a), m);
    if (Math.abs(od - o.d / 2) > 2) continue;
    const e1 = os - o.w / 2, e2 = os + o.w / 2;
    if (Math.abs(along - it.w / 2 - e2) < tolE) along = e2 + it.w / 2;
    else if (Math.abs(along + it.w / 2 - e1) < tolE) along = e1 - it.w / 2;
  }
  const foot = vadd(nf.f.a, vmul(nf.u, along));
  const ctr = vadd(foot, vmul(m, it.d / 2));
  return { x: ctr.x, y: ctr.y, rot };
}
function magnetElec(e, c) {
  const reach = Math.max(30, 22 / V.s);
  const nf = nearestFace(e.lv, c, reach);
  if (!nf) return null;
  const m = nf.f.n;
  const foot = vadd(nf.f.a, vmul(nf.u, clamp(nf.s, 0, nf.L)));
  return { x: foot.x, y: foot.y, rot: normDeg(Math.atan2(-m.x, m.y) / DEG) };
}
function gridSnapItem(it, c) {
  const r = normDeg(it.rot || 0);
  if (Math.abs(r % 90) > 0.01) return { x: snapTo(c.x, S.grid), y: snapTo(c.y, S.grid) };
  const sw = Math.abs(r - 90) < 1 || Math.abs(r - 270) < 1;
  const hx = (sw ? it.d : it.w) / 2, hy = (sw ? it.w : it.d) / 2;
  return { x: snapTo(c.x - hx, S.grid) + hx, y: snapTo(c.y - hy, S.grid) + hy };
}
function placeItemAt(it, c, def) {
  if (def && def.mag && S.magnet) {
    const m = magnetItem(it, c);
    if (m) { it.x = m.x; it.y = m.y; it.rot = m.rot; return true; }
  }
  const g = gridSnapItem(it, c); it.x = g.x; it.y = g.y;
  return false;
}
function placeElecAt(e, c) {
  const def = ELEC_BY.get(e.type);
  if (def && def.wall && S.magnet) { const m = magnetElec(e, c); if (m) { e.x = m.x; e.y = m.y; e.rot = m.rot; return true; } }
  e.x = snapTo(c.x, Math.min(S.grid, 5)); e.y = snapTo(c.y, Math.min(S.grid, 5));
  return false;
}

/* ---------------- sélection ---------------- */
function select(h) {
  let sel = null;
  if (h) {
    if (h.t === 'label') sel = { t: 'room', id: h.id };
    else sel = { t: h.t, id: h.id };
  }
  const changed = JSON.stringify(sel) !== JSON.stringify(ui.sel);
  ui.sel = sel;
  if (sel) ui.inspOpen = true;
  if (changed) renderInspector();
  requestRender();
}
function selObj(sel) {
  sel = sel || ui.sel; if (!sel) return null;
  const map = { wall: IDX.walls, node: IDX.nodes, opening: IDX.openings, item: IDX.items, elec: IDX.elec, room: IDX.rooms, dim: IDX.dims, text: IDX.texts, duct: IDX.ducts };
  return map[sel.t] ? map[sel.t].get(sel.id) || null : null;
}
function validateSel() {
  if (ui.sel && !selObj()) ui.sel = null;
  if (ui.sel && ui.sel.t === 'room') { const l = selObj(); if (!l || l.lv !== ui.lv || !roomOfLabel(l)) ui.sel = null; }
}

/* ---------------- historique ---------------- */
function commit() {
  syncRooms();
  syncDucts();
  const pk = packPlan(P, H.cur);
  if (samePack(pk, H.cur)) { refreshUI(); return; }
  H.u.push(H.cur); H.r.length = 0; H.cur = pk;
  historyTrim();
  scheduleSave();
  refreshUI();
  emit(EV.PLAN_CHANGE, { cause: 'modification' });
}
function revert() { setP(unpackPlan(H.cur)); touch(); refreshUI(); emit(EV.PLAN_CHANGE, { cause: 'retour' }); }
function undo() {
  if (!H.u.length) return;
  H.r.push(H.cur); H.cur = H.u.pop();
  setP(unpackPlan(H.cur)); touch();
  if (ui.chain) undoChainStep();
  if (!IDX.levels.has(ui.lv)) ui.lv = levelsSorted()[0].id;
  scheduleSave(); refreshUI();
  emit(EV.PLAN_CHANGE, { cause: 'annuler' });
}
function redo() {
  if (!H.r.length) return;
  H.u.push(H.cur); H.cur = H.r.pop();
  setP(unpackPlan(H.cur)); touch();
  if (ui.chain) finishChain();
  if (!IDX.levels.has(ui.lv)) ui.lv = levelsSorted()[0].id;
  scheduleSave(); refreshUI();
  emit(EV.PLAN_CHANGE, { cause: 'rétablir' });
}
function refreshUI() {
  validateSel();
  renderLevels(); renderInspector(); updateUndo(); updateHint(); updateFilterUI();
  if (ui.view === 'elec') renderElecView();
  if (ui.view === '3d') v3Refresh();
  $('#projName').textContent = P.name || 'Plan sans nom';
  requestRender();
}
function updateUndo() { $('#btnUndo').disabled = !H.u.length; $('#btnRedo').disabled = !H.r.length; }

/* ---------------- pointeurs ---------------- */
const ptrs = new Map();
let gest = null, drag = null, ignoreUntilUp = false, downState = null;
let lastTap = { t: 0, x: 0, y: 0, key: '' };
function evPos(e) { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
function isDoubleTap(sp, key) {
  const now = performance.now();
  const ok = now - lastTap.t < 380 && Math.hypot(sp.x - lastTap.x, sp.y - lastTap.y) < 24 && lastTap.key === key;
  lastTap = { t: ok ? 0 : now, x: sp.x, y: sp.y, key };
  return ok;
}
cv.addEventListener('contextmenu', (e) => e.preventDefault());
/* Apple Pencil : un stylet posé = la main repose sur l'écran ; les contacts du doigt (paume) sont ignorés */
let penDown = 0;
const pencilMode = () => !!S.pencil;
function pencilFirstUse() {
  if (S.pencilSeen) return;
  S.pencilSeen = true; S.pencil = true; saveSettings();
  toast('Apple Pencil détecté : le stylet dessine, le doigt déplace le plan. Réglage dans Affichage (icône des calques).');
}
cv.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'pen') {
    pencilFirstUse();
    penDown = e.pointerId;
    // la paume s'est posée avant le stylet : on annule ce qu'elle avait commencé
    if (pencilMode() && ptrs.size) {
      for (const id of [...ptrs.keys()]) { ptrs.delete(id); try { cv.releasePointerCapture(id); } catch (err) { } }
      if (drag) { if (drag.cancel) drag.cancel(); drag = null; }
      if (downState && (JSON.stringify(ui.sel) !== JSON.stringify(downState.sel) || ui.inspOpen !== downState.insp)) { ui.sel = downState.sel; ui.inspOpen = downState.insp; renderInspector(); }
      gest = null; ignoreUntilUp = false;
    }
  } else if (e.pointerType === 'touch' && pencilMode() && penDown) return; // paume pendant le dessin au stylet
  ui.pointerType = e.pointerType || 'mouse';
  closePops();
  closeDimEdit();
  const sp = evPos(e);
  ptrs.set(e.pointerId, sp);
  try { cv.setPointerCapture(e.pointerId); } catch (err) { }
  if (ptrs.size === 2) {
    if (drag) { if (drag.cancel) drag.cancel(); drag = null; }
    if (downState && (JSON.stringify(ui.sel) !== JSON.stringify(downState.sel) || ui.inspOpen !== downState.insp)) { ui.sel = downState.sel; ui.inspOpen = downState.insp; renderInspector(); }
    const [a, b] = [...ptrs.values()];
    gest = { d0: vdist(a, b) || 1, s0: V.s, m0: vmid(a, b), ox0: V.ox, oy0: V.oy };
    ignoreUntilUp = true; return;
  }
  if (ptrs.size > 2) return;
  if (e.button === 1 || (e.button === 0 && keys.space)) { drag = panDrag(sp, null); return; }
  if (e.button === 2) return;
  ignoreUntilUp = false;
  if (e.pointerType === 'mouse') cv.focus({ preventScroll: true });
  // mode Apple Pencil : avec un outil de dessin, un doigt déplace le plan au lieu de dessiner
  if (e.pointerType === 'touch' && pencilMode() && ui.tool !== 'select') { drag = panDrag(sp, null); return; }
  const wp = screenToWorld(sp.x, sp.y);
  const T = TOOLS[ui.tool] || EXT.tools[ui.tool] || TOOLS.select;
  downState = { sel: ui.sel, insp: ui.inspOpen };
  drag = T.down(wp, sp, e) || null;
  requestRender();
});
cv.addEventListener('pointermove', (e) => {
  const sp = evPos(e);
  if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, sp);
  if (gest && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()];
    const d = vdist(a, b), m = vmid(a, b);
    const s2 = clamp((gest.s0 * d) / gest.d0, 0.04, 14);
    const w = { x: (gest.m0.x - gest.ox0) / gest.s0, y: (gest.m0.y - gest.oy0) / gest.s0 };
    V.s = s2; V.ox = m.x - w.x * s2; V.oy = m.y - w.y * s2;
    requestRender(); return;
  }
  const wp = screenToWorld(sp.x, sp.y);
  // survol : souris, ou Apple Pencil approché de l'écran sans le toucher (iPad compatible avec le survol)
  const hovering = e.pointerType === 'mouse' || (e.pointerType === 'pen' && !ptrs.has(e.pointerId) && !e.buttons);
  if (drag && ptrs.has(e.pointerId)) ui.mouse = e.pointerType === 'mouse' ? wp : null;
  else if (!drag) ui.mouse = hovering ? wp : null;
  if (drag) { if (ptrs.has(e.pointerId) && drag.move) { drag.move(wp, sp, e); requestRender(!!drag.overlay); } return; }
  if (hovering && !ignoreUntilUp) { if (e.pointerType === 'pen') ui.pointerType = 'pen'; const T = TOOLS[ui.tool] || EXT.tools[ui.tool]; if (T && T.hover) T.hover(wp, sp, e); requestRender(true); }
});
function ptrEnd(e) {
  if (e.pointerId === penDown) penDown = 0;
  const had = ptrs.has(e.pointerId);
  ptrs.delete(e.pointerId);
  if (gest) { if (ptrs.size < 2) gest = null; if (ptrs.size === 0) ignoreUntilUp = false; return; }
  if (ignoreUntilUp) { if (ptrs.size === 0) ignoreUntilUp = false; return; }
  if (!had) return;
  if (drag) {
    const d = drag; drag = null;
    const sp = evPos(e);
    if (e.type === 'pointercancel') { if (d.cancel) d.cancel(); }
    else if (d.up) d.up(screenToWorld(sp.x, sp.y), sp, e);
    requestRender();
  }
}
cv.addEventListener('pointerup', ptrEnd);
cv.addEventListener('pointercancel', ptrEnd);
cv.addEventListener('pointerleave', (e) => { if ((e.pointerType === 'mouse' || e.pointerType === 'pen') && !drag && !ptrs.size) { ui.mouse = null; ui.ghost = null; if (!ui.chain) ui.cursor = null; ui.hover = null; requestRender(); } });
cv.addEventListener('wheel', (e) => {
  e.preventDefault();
  const sp = evPos(e);
  if (e.ctrlKey || e.metaKey) { zoomAt(sp.x, sp.y, Math.exp(-e.deltaY * 0.012)); return; }
  const mouseWheel = e.deltaMode === 1 || (e.deltaX === 0 && Math.abs(e.deltaY) >= 50 && Number.isInteger(e.deltaY));
  if (mouseWheel) zoomAt(sp.x, sp.y, Math.exp(-Math.sign(e.deltaY) * Math.min(Math.abs(e.deltaY), 120) * (e.deltaMode === 1 ? 0.06 : 0.0018)));
  else { V.ox -= e.deltaX; V.oy -= e.deltaY; requestRender(); }
}, { passive: false });

function panDrag(sp0, onTap) {
  const ox0 = V.ox, oy0 = V.oy; let moved = false;
  return {
    move(wp, sp) { if (!moved && vdist(sp, sp0) < TAP()) return; moved = true; V.ox = ox0 + sp.x - sp0.x; V.oy = oy0 + sp.y - sp0.y; cv.style.cursor = 'grabbing'; },
    up(wp, sp) { cv.style.cursor = ''; if (!moved && onTap) onTap(wp, sp); },
    cancel() { cv.style.cursor = ''; },
  };
}

/* déplacement d'un élément sélectionné */
function moveDrag(h, wp0, sp0) {
  let moved = false;
  const lv = ui.lv;
  const obj = selObj({ t: h.t === 'label' ? 'room' : h.t, id: h.id });
  if (!obj) return null;
  const base = JSON.parse(JSON.stringify(obj));
  let nodeBase = null, extra = null;
  if (h.t === 'wall') { nodeBase = { a: { ...nodeOf(obj.a) }, b: { ...nodeOf(obj.b) } }; }
  return {
    move(wp, sp) {
      if (!moved && vdist(sp, sp0) < TAP()) return;
      moved = true;
      const dv = vsub(wp, wp0);
      if (h.t === 'item') {
        const def = furnDef(obj);
        obj.rot = base.rot;
        placeItemAt(obj, { x: base.x + dv.x, y: base.y + dv.y }, def);
      } else if (h.t === 'elec') {
        obj.rot = base.rot;
        placeElecAt(obj, { x: base.x + dv.x, y: base.y + dv.y });
      } else if (h.t === 'text' || h.t === 'label') {
        obj.x = Math.round(base.x + dv.x); obj.y = Math.round(base.y + dv.y);
      } else if (h.t === 'duct') {
        const ddx = snapTo(dv.x, S.grid), ddy = snapTo(dv.y, S.grid);
        obj.pts = base.pts.map((q) => ({ x: q.x + ddx, y: q.y + ddy }));
      } else if (h.t === 'dim') {
        const ddx = snapTo(dv.x, S.grid), ddy = snapTo(dv.y, S.grid);
        obj.ax = base.ax + ddx; obj.ay = base.ay + ddy; obj.bx = base.bx + ddx; obj.by = base.by + ddy;
      } else if (h.t === 'opening') {
        const g = geo(lv);
        let wg = g.walls.get(obj.wall);
        if (wg) {
          const dn = Math.abs(vdot(vsub(wp, wg.A), wg.n));
          const pr = projSeg(wp, wg.A, wg.B);
          if (dn > wg.th / 2 + 40 / V.s || pr.t < -0.05 || pr.t > 1.05) {
            let best = null;
            for (const g2 of g.walls.values()) { const p2 = projSeg(wp, g2.A, g2.B); if (p2.t > 0 && p2.t < 1 && p2.d < g2.th / 2 + 16 / V.s && (!best || p2.d < best.d)) best = { g2, d: p2.d }; }
            if (best && best.g2 !== wg) {
              wg = best.g2; obj.wall = wg.w.id;
              const sgn = Math.sign(vdot(vsub(wp, wg.A), wg.n)) || 1;
              if (obj.kind === 'door' || obj.kind === 'closet' || obj.kind === 'gap') obj.side = sgn; else obj.side = interiorSide(wg, wg.L / 2) || sgn;
            }
          }
          const t = vdot(vsub(wp, wg.A), wg.d) + (base.wall === obj.wall ? base.t - vdot(vsub(wp0, wg.A), wg.d) : 0);
          obj.t = wg.clear0 + snapTo(t - obj.w / 2 - wg.clear0, S.grid) + obj.w / 2;
          clampOpening(obj);
        }
      } else if (h.t === 'wall') {
        const A = nodeOf(obj.a), B = nodeOf(obj.b);
        const n = vperp(vnorm(vsub(nodeBase.b, nodeBase.a)));
        const off = snapTo(vdot(dv, n), S.grid);
        A.x = nodeBase.a.x + n.x * off; A.y = nodeBase.a.y + n.y * off;
        B.x = nodeBase.b.x + n.x * off; B.y = nodeBase.b.y + n.y * off;
        setGEO({});
        extra = off;
      } else if (h.t === 'node') {
        const target = { x: base.x + dv.x, y: base.y + dv.y };
        const sp2 = snapPoint(target, { exclude: obj.id });
        obj.x = sp2.x; obj.y = sp2.y;
        ui.cursor = sp2; extra = sp2;
        setGEO({});
      }
    },
    up(wp, sp) {
      if (!moved) { onTapSelected(h, sp); return; }
      if (h.t === 'node' && extra) {
        if (extra.node && extra.node !== obj.id) mergeNodes(extra.node, obj.id);
        else if (extra.onWall) { const w = IDX.walls.get(extra.onWall); if (w && w.a !== obj.id && w.b !== obj.id) { const nid = splitWall(w, obj); mergeNodes(nid, obj.id); } }
        ui.cursor = null;
        for (const o of P.openings) clampOpening(o);
      }
      if (h.t === 'wall') { for (const o of P.openings) clampOpening(o); }
      if (h.t === 'node' && !IDX.nodes.has(h.id)) ui.sel = null;
      commit();
    },
    cancel() { ui.cursor = null; revert(); },
  };
}
function onTapSelected(h, sp) {
  if (isDoubleTap(sp, h.t + h.id)) {
    if (h.t === 'label' || h.t === 'room') focusField('f-name');
    if (h.t === 'text') focusField('f-text');
  }
}
function focusField(id) {
  ui.inspOpen = true; renderInspector();
  const el = document.getElementById(id);
  if (el) { el.focus(); if (el.select) el.select(); }
}
/* poignées : rotation, redimensionnement, extrémités */
function handleDrag(h, wp0, sp0) {
  if (h.kind === 'dpt' || h.kind === 'dmid') return ductHandleDrag(h, wp0, sp0);
  const obj = h.kind === 'node' ? nodeOf(h.id) : h.kind.startsWith('dim') ? IDX.dims.get(h.id) : (h.text ? IDX.texts.get(h.id) : IDX.items.get(h.id));
  if (!obj) return null;
  if (h.kind === 'node') return moveDrag({ t: 'node', id: h.id }, wp0, sp0);
  const base = JSON.parse(JSON.stringify(obj));
  let moved = false;
  return {
    move(wp, sp) {
      if (!moved && vdist(sp, sp0) < TAP()) return;
      moved = true;
      if (h.kind === 'rot') {
        let a = Math.atan2(wp.y - obj.y, wp.x - obj.x) / DEG + 90;
        a = keys.shift || !S.ortho ? Math.round(a) : Math.round(a / 15) * 15;
        obj.rot = normDeg(a);
      } else if (h.kind === 'rw' || h.kind === 'rd') {
        const it = obj;
        const tmp = { x: base.x, y: base.y, rot: base.rot };
        const l = itemToLocal(tmp, wp);
        const a = (base.rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a);
        if (h.kind === 'rw') {
          const nw = clamp(snapTo(l.x + base.w / 2, S.grid), 5, 3000);
          const dl = (nw - base.w) / 2;
          it.w = nw; it.x = base.x + c * dl; it.y = base.y + s * dl;
          if (it.type === 'table_ronde' || it.type === 'esc_helice') { it.d = nw; }
        } else {
          const nd = clamp(snapTo(l.y + base.d / 2, S.grid), 5, 3000);
          const dl = (nd - base.d) / 2;
          it.d = nd; it.x = base.x - s * dl; it.y = base.y + c * dl;
          if (it.type === 'table_ronde' || it.type === 'esc_helice') { it.w = nd; }
        }
      } else if (h.kind === 'dimA' || h.kind === 'dimB') {
        const other = h.kind === 'dimA' ? { x: base.bx, y: base.by } : { x: base.ax, y: base.ay };
        const p = snapPoint(wp, { corners: true, from: other });
        if (h.kind === 'dimA') { obj.ax = p.x; obj.ay = p.y; } else { obj.bx = p.x; obj.by = p.y; }
      }
    },
    up() { if (moved) commit(); },
    cancel() { revert(); },
  };
}

/* ---------------- outils ---------------- */
const TOOLS = {};
TOOLS.select = {
  down(wp, sp) {
    const h = hitTest(wp, hitTol());
    if (S.layers.dims && (!h || !['handle', 'elec', 'text', 'duct', 'opening'].includes(h.t))) {
      const dh = dimHitAt(sp);
      if (dh) return panDrag(sp, () => openDimEdit(dh));
    }
    if (!h) return panDrag(sp, () => { select(null); ui.inspOpen = false; renderInspector(); if (ui.hl) { ui.hl = null; updateHint(); } });
    if (h.t === 'room') return panDrag(sp, (w, s2) => { select(h); onTapSelected(h, s2); });
    if (h.t === 'handle') return handleDrag(h, wp, sp);
    select(h);
    return moveDrag(h, wp, sp);
  },
  hover(wp, sp) {
    const h = hitTest(wp, 6);
    const dh = S.layers.dims && (!h || !['handle', 'elec', 'text', 'duct', 'opening'].includes(h.t)) && sp ? dimHitAt(sp) : null;
    ui.hover = h && h.t !== 'room' && !dh ? h : null;
    cv.style.cursor = dh ? 'text' : h ? (h.t === 'handle' ? 'grab' : h.t === 'room' ? 'default' : 'move') : 'default';
  },
};
TOOLS.wall = {
  down(wp) {
    ui.cursor = wallCursor(wp);
    return {
      overlay: true, // le plan ne change pas pendant le geste : seul l'aperçu bouge
      move(wp2) { ui.cursor = wallCursor(wp2); },
      up(wp2, sp2) { const pt = ui.cursor || wallCursor(wp2); wallClick(pt, sp2); },
      cancel() { },
    };
  },
  hover(wp) { ui.cursor = wallCursor(wp); cv.style.cursor = 'crosshair'; },
};
/* longueur saisie dans le bandeau : elle s'impose au prochain mur, la direction vient du doigt */
function wallLenLock() { const L = parseNum(ui.wallLenTxt); return L > 0 && L <= 100000 ? L : 0; }
function lockedWallPoint(wp) {
  const a0 = ui.chain && ui.chain.last, L = wallLenLock();
  if (!a0 || !L) return null;
  const v = vsub(wp, a0); if (vlen(v) < 0.5) return null;
  let a = Math.atan2(v.y, v.x);
  if (S.ortho) {
    const st = 15 * DEG, aa = Math.round(a / st) * st;
    const is45 = Math.abs(Math.round(aa / (45 * DEG)) * 45 * DEG - aa) < 1e-6;
    if (Math.abs(a - aa) < (is45 ? 10 : 4) * DEG) a = aa;
  }
  const p = vadd(a0, vmul(vdir(a), L));
  const n = findNodeNear(ui.lv, p, 0.6);
  return n ? { x: n.x, y: n.y, node: n.id, kind: 'node', guides: [], locked: true } : { x: p.x, y: p.y, kind: 'free', guides: [], locked: true };
}
function wallCursor(wp) {
  const from = ui.chain && ui.chain.last;
  return (from && wallLenLock() && lockedWallPoint(wp)) || snapPoint(wp, { from });
}
function wallHintMsg() {
  const L = wallLenLock();
  if (!ui.chain) return L ? `Touchez le point de départ, puis la direction : le mur fera ${fmtIn(L)} cm.` : 'Touchez le point de départ. La longueur peut être saisie avant.';
  if (L) return `Touchez dans la direction du mur : il fera ${fmtIn(L)} cm.`;
  return ui.chain.stack.length ? 'Touchez l’angle suivant, ou saisissez une longueur. Retouchez le départ pour fermer.' : 'Touchez le deuxième angle, ou saisissez une longueur.';
}
function refreshWallMsg() { const m = $('#hMsg'); if (m) m.textContent = wallHintMsg(); }
function clearWallLen() { ui.wallLenTxt = ''; const el = $('#hLen'); if (el) el.value = ''; refreshWallMsg(); }
function wallHeightSetting() { const v = parseNum(ui.wallHTxt); return v >= 10 && v <= 3000 ? v : 0; }
function wallProps() {
  const pr = { th: ui.wallKind === 'cloison' ? S.thCloison : S.thMur, kind: ui.wallKind };
  const hh = wallHeightSetting(); if (hh) pr.h = hh;
  return pr;
}
function wallClick(pt, sp) {
  const dbl = sp ? isDoubleTap(sp, 'wall') : false;
  if (!ui.chain) {
    ui.chain = { start: { x: pt.x, y: pt.y, node: pt.node }, last: { x: pt.x, y: pt.y, node: pt.node }, stack: [], startNode: pt.node || null };
    updateHint(); return;
  }
  const last = ui.chain.last;
  if (vdist(last, pt) < 1) { if (dbl || ui.chain.stack.length) finishChain(); return; }
  const ws = addWall(ui.lv, last, pt, wallProps());
  if (!ws.length) { toast('Ce mur existe déjà.'); return; }
  const endId = ws[ws.length - 1].b;
  if (!ui.chain.startNode) ui.chain.startNode = ws[0].a;
  ui.chain.stack.push({ ...ui.chain.last, node: ui.chain.last.node || ws[0].a });
  const E = nodeOf(endId);
  const closed = endId === ui.chain.startNode;
  ui.chain.last = { x: E.x, y: E.y, node: endId };
  if (pt.locked) clearWallLen();
  commit();
  if (closed || dbl) finishChain();
  else refreshWallMsg();
}
function undoChainStep() {
  if (!ui.chain) return;
  if (ui.chain.stack.length) {
    const prev = ui.chain.stack.pop();
    ui.chain.last = prev;
    if (prev.node && !IDX.nodes.has(prev.node)) ui.chain.last.node = null;
    if (!ui.chain.stack.length && ui.chain.startNode && !IDX.nodes.has(ui.chain.startNode)) ui.chain.startNode = null;
  } else finishChain();
}
function finishChain() { ui.chain = null; ui.cursor = null; updateHint(); requestRender(); }
function wallByLength(dir) {
  const L = wallLenLock();
  if (!(L > 0)) { toast('Indiquez d’abord une longueur en cm.'); $('#hLen') && $('#hLen').focus(); return; }
  if (!ui.chain) { toast('Touchez d’abord le point de départ du mur, la longueur sera gardée.'); return; }
  let d = dir;
  if (!d) {
    if (ui.cursor && vdist(ui.cursor, ui.chain.last) > 1) d = vnorm(vsub(ui.cursor, ui.chain.last));
    else d = { x: 1, y: 0 };
  }
  const p = vadd(ui.chain.last, vmul(d, L));
  const n = findNodeNear(ui.lv, p, 0.6);
  wallClick(n ? { x: n.x, y: n.y, node: n.id, locked: true } : { x: p.x, y: p.y, locked: true });
}
TOOLS.room = {
  down(wp) {
    const a = snapPoint(wp);
    ui.roomDraft = { a, b: a };
    return {
      overlay: true,
      move(wp2) { ui.roomDraft.b = snapPoint(wp2); },
      up() {
        const { a, b } = ui.roomDraft; ui.roomDraft = null;
        if (Math.abs(b.x - a.x) >= 30 && Math.abs(b.y - a.y) >= 30) { makeRect(a, b); return; }
        const L = parseNum($('#hRw') && $('#hRw').value), l = parseNum($('#hRh') && $('#hRh').value);
        if (L > 0 && l > 0) {
          const th = wallProps().th;
          makeRect({ x: a.x, y: a.y }, { x: a.x + L + th, y: a.y + l + th });
        } else toast('Faites glisser d’un angle à l’angle opposé, ou saisissez les dimensions puis touchez le plan.');
      },
      cancel() { ui.roomDraft = null; },
    };
  },
  hover(wp) { ui.cursor = snapPoint(wp); cv.style.cursor = 'crosshair'; },
};
function makeRect(a, b) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
  const pr = wallProps();
  const pts = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }];
  for (let i = 0; i < 4; i++) addWall(ui.lv, pts[i], pts[(i + 1) % 4], pr);
  commit();
  toast('Pièce créée : ' + fmtLen(x1 - x0 - pr.th, 'cm') + ' × ' + fmtLen(y1 - y0 - pr.th, 'cm') + ' cm intérieur');
}
const DOOR_MODELS = [
  { v: 'battante', n: 'Battante', leaves: [1, 2] },
  { v: 'entree', n: 'Porte d’entrée', leaves: [1, 2] },
  { v: 'vaetvient', n: 'Va-et-vient', leaves: [1, 2] },
  { v: 'coulissante', n: 'Coulissante en applique', leaves: [1, 2, 3, 4] },
  { v: 'galandage', n: 'À galandage', leaves: [1, 2] },
  { v: 'pliante', n: 'Pliante (accordéon)', leaves: [2, 3, 4, 6] },
  { v: 'garage', n: 'Porte de garage', leaves: null },
];
const WIN_MODELS = [
  { v: 'battant', n: 'Battant', leaves: [1, 2, 3, 4] },
  { v: 'oscillo', n: 'Oscillo-battant', leaves: [1, 2, 3, 4] },
  { v: 'coulissant', n: 'Coulissant', leaves: [2, 3, 4] },
  { v: 'fixe', n: 'Fixe', leaves: [1, 2, 3, 4] },
  { v: 'soufflet', n: 'À soufflet', leaves: null },
  { v: 'pfenetre', n: 'Porte-fenêtre', leaves: [1, 2] },
  { v: 'baie', n: 'Baie vitrée coulissante', leaves: [2, 3, 4] },
];
/* ouverture libre : un trou dans le mur, sans menuiserie */
const GAP_MODELS = [
  { v: 'passage', n: 'Passage (baie libre)', leaves: null },
  { v: 'toute', n: 'Toute hauteur (jusqu’au plafond)', leaves: null },
  { v: 'passeplat', n: 'Passe-plat', leaves: null },
];
/* portes de placard : posées dans la façade du placard (cloison ou mur) */
const CLOSET_MODELS = [
  { v: 'coulissante', n: 'Coulissantes sur rail', leaves: [2, 3, 4] },
  { v: 'battante', n: 'Battantes', leaves: [1, 2, 3, 4] },
  { v: 'pliante', n: 'Pliantes', leaves: [2, 4] },
];
const OPENING_MODELS = { door: DOOR_MODELS, window: WIN_MODELS, gap: GAP_MODELS, closet: CLOSET_MODELS };
const OPENING_NAMES = { door: 'Porte', window: 'Fenêtre', gap: 'Ouverture', closet: 'Porte de placard' };
const OPENING_ART = { door: 'la porte', window: 'la fenêtre', gap: 'l’ouverture', closet: 'la porte de placard' };
function openingModels(o) { return OPENING_MODELS[o.kind] || DOOR_MODELS; }
/* hauteur du mur porteur de l'ouverture (hauteur propre du mur, sinon hauteur sous plafond du niveau) */
function wallHeightOf(w) { const L = w && levelOf(w.lv); return (w && w.h) || (L && L.h) || 250; }
/* hauteur réelle d'une ouverture : « jusqu'au plafond » suit la hauteur du mur */
function openingHeight(o) {
  if (o.full) { const w = IDX.walls.get(o.wall); return Math.max(1, wallHeightOf(w) - (o.sill || 0)); }
  return o.h || 200;
}
function interiorSide(wg, t) {
  const mid = vadd(wg.A, vmul(wg.d, t));
  const rooms = geo(wg.w.lv).rooms;
  const inP = rooms.some((r) => inPoly(vadd(mid, vmul(wg.n, wg.th / 2 + 20)), r.loop));
  const inN = rooms.some((r) => inPoly(vsub(mid, vmul(wg.n, wg.th / 2 + 20)), r.loop));
  if (inP && !inN) return 1;
  if (inN && !inP) return -1;
  return 0;
}
function newOpening(kind, wg, t, side) {
  const base = { id: uid('o'), wall: wg.w.id, t, side: side || 1 };
  const o = kind === 'window' ? Object.assign(base, { w: 120, kind: 'window', type: 'battant', leaves: 2, hinge: 0, h: 125, sill: 95 })
    : kind === 'gap' ? Object.assign(base, { w: 90, kind: 'gap', type: 'passage', h: 210, sill: 0, full: false })
    : kind === 'closet' ? Object.assign(base, { w: 160, kind: 'closet', type: 'coulissante', leaves: 2, hinge: 0, h: 250, sill: 0, full: true })
    : Object.assign(base, { w: 83, kind: 'door', type: 'battante', leaves: 1, hinge: 0, h: 204, sill: 0 });
  if (kind === 'window') o.side = interiorSide(wg, t) || side || 1;
  else if (wg.L < o.w + 37) o.w = Math.max(kind === 'door' ? 50 : 30, Math.floor(wg.L - 20));
  P.openings.push(o); IDX.openings.set(o.id, o);
  clampOpening(o);
  return o;
}
function openingTool(kindOf) {
  const K = () => (typeof kindOf === 'function' ? kindOf() : kindOf);
  return {
    down() { return { up(wp) {
      const kind = K();
      const g = geo(ui.lv);
      let best = null;
      for (const wg of g.walls.values()) {
        const pr = projSeg(wp, wg.A, wg.B);
        if (pr.t > 0 && pr.t < 1 && pr.d <= wg.th / 2 + 16 / V.s && (!best || pr.d < best.d)) best = { wg, d: pr.d, t: pr.t * wg.L };
      }
      if (!best) { toast(`Touchez un mur pour y placer ${OPENING_ART[kind] || 'l’ouverture'}.`); return; }
      const side = Math.sign(vdot(vsub(wp, best.wg.A), best.wg.n)) || 1;
      const o = newOpening(kind, best.wg, best.t, side);
      setTool('select');
      ui.sel = { t: 'opening', id: o.id }; ui.inspOpen = true;
      commit();
    } }; },
    hover() { cv.style.cursor = 'copy'; },
  };
}
TOOLS.door = openingTool(() => (ui.doorKind === 'closet' ? 'closet' : 'door'));
TOOLS.window = openingTool('window');
TOOLS.gap = openingTool('gap');
TOOLS.place = {
  down(wp, sp) {
    let moved = false;
    return {
      move(wp2, sp2) { if (vdist(sp2, sp) > TAP()) moved = true; if (moved) { ui.ghost = null; } else ui.ghost = wp2; },
      up(wp2) { if (moved) return; placeFromCatalog(wp2); },
      cancel() { },
    };
  },
  hover(wp) { ui.ghost = wp; cv.style.cursor = 'copy'; },
};
function makeItemFromDef(def, lv) {
  const it = { id: uid('i'), lv, k: def.k, type: def.t, name: def.n, x: 0, y: 0, w: def.w, d: def.d, rot: 0, flip: false };
  if (def.seats) it.seats = def.seats;
  if (isStair(def.t)) { it.n = def.n_ || 15; if (def.e) it.e = def.e; if (def.turn) it.turn = def.turn; }
  return it;
}
function makeElecFromDef(def, lv) { return { id: uid('e'), lv, type: def.t, x: 0, y: 0, rot: 0, h: def.h, circuit: '' }; }
function placeFromCatalog(wp) {
  const pl = ui.place; if (!pl) return;
  if (pl.kind === 'elec') {
    const e = makeElecFromDef(pl.def, ui.lv);
    if (pl.comp) { applyComp(e, pl.comp); upsertPlanComp(P, pl.comp); }
    placeElecAt(e, wp);
    P.elec.push(e); IDX.elec.set(e.id, e);
    ui.sel = { t: 'elec', id: e.id };
    commit();
  } else {
    const it = makeItemFromDef(pl.def, ui.lv);
    if (pl.comp) { applyComp(it, pl.comp); upsertPlanComp(P, pl.comp); }
    placeItemAt(it, wp, pl.def);
    if (isStair(it.type) && !pl.def.mag) { const g = gridSnapItem(it, wp); it.x = g.x; it.y = g.y; }
    P.items.push(it); IDX.items.set(it.id, it);
    setTool('select');
    ui.sel = { t: 'item', id: it.id }; ui.inspOpen = true;
    commit();
  }
}
TOOLS.link = {
  down(wp, sp) {
    let moved = false; const ox0 = V.ox, oy0 = V.oy;
    return {
      move(wp2, sp2) { if (!moved && vdist(sp2, sp) < TAP()) return; moved = true; V.ox = ox0 + sp2.x - sp.x; V.oy = oy0 + sp2.y - sp.y; },
      up(wp2) { if (!moved) linkTap(wp2); },
      cancel() { },
    };
  },
  hover(wp) { ui.ghost = wp; const h = hitTest(wp, 7); ui.hover = h && h.t === 'elec' ? h : null; cv.style.cursor = ui.hover ? 'pointer' : 'default'; },
};
function linkTap(wp) {
  const h = hitTest(wp, hitTol());
  if (!h || h.t !== 'elec') {
    if (ui.linkSrc) { ui.linkSrc = null; updateHint(); requestRender(); }
    else toast('Touchez un interrupteur, puis les éclairages qu\u2019il commande.');
    return;
  }
  const e = IDX.elec.get(h.id);
  if (CMDS.has(e.type)) { ui.linkSrc = e.id; ui.sel = { t: 'elec', id: e.id }; renderInspector(); updateHint(); requestRender(); return; }
  if (LINK_TARGETS.has(e.type)) {
    if (!ui.linkSrc || !IDX.elec.get(ui.linkSrc)) { toast('Touchez d\u2019abord l\u2019interrupteur ou la commande.'); return; }
    const added = toggleLink(ui.linkSrc, e.id);
    commit();
    toast(added ? 'Liaison ajoutée.' : 'Liaison retirée.');
    return;
  }
  toast('Seuls les interrupteurs, boutons-poussoirs et détecteurs se relient à des éclairages.');
}
TOOLS.dim = {
  down(wp) {
    const a = snapPoint(wp, { corners: true });
    ui.dimDraft = { a, b: a };
    return {
      move(wp2) { ui.dimDraft.b = snapPoint(wp2, { corners: true, from: a }); },
      up() {
        const { a: A, b: B } = ui.dimDraft; ui.dimDraft = null;
        if (vdist(A, B) < 5) { toast('Faites glisser d’un point à un autre pour coter.'); return; }
        const d = { id: uid('d'), lv: ui.lv, ax: A.x, ay: A.y, bx: B.x, by: B.y };
        P.dims.push(d); IDX.dims.set(d.id, d);
        commit();
      },
      cancel() { ui.dimDraft = null; },
    };
  },
  hover(wp) { ui.cursor = snapPoint(wp, { corners: true }); cv.style.cursor = 'crosshair'; },
};
TOOLS.text = {
  down() { return { up(wp) {
    const t = { id: uid('t'), lv: ui.lv, x: Math.round(wp.x), y: Math.round(wp.y), text: 'Texte', size: 'm', rot: 0 };
    P.texts.push(t); IDX.texts.set(t.id, t);
    setTool('select'); ui.sel = { t: 'text', id: t.id }; ui.inspOpen = true;
    commit();
    focusField('f-text');
  } }; },
  hover() { cv.style.cursor = 'text'; },
};
TOOLS.duct = {
  down(wp, sp) {
    let moved = false; const ox0 = V.ox, oy0 = V.oy;
    return {
      move(wp2, sp2) { if (!moved && vdist(sp2, sp) < TAP()) return; moved = true; V.ox = ox0 + sp2.x - sp.x; V.oy = oy0 + sp2.y - sp.y; },
      up(wp2) { if (!moved) ductTap(wp2); },
      cancel() { },
    };
  },
  hover(wp) { const dr = ui.duct; ui.cursor = snapDuctPoint(wp, { from: dr && dr.pts.length ? dr.pts[dr.pts.length - 1] : null, sys: dr ? dr.sys : null }); cv.style.cursor = 'crosshair'; },
};

/* ---------------- calque de surimpression ---------------- */
function drawOverlay() {
  const c = ctx, px = 1 / V.s;
  setWorld();
  c.lineJoin = 'round'; c.lineCap = 'round';
  if (ui.hover && ui.tool === 'select' && !drag && !(ui.sel && ui.hover.id === ui.sel.id)) drawSelShape(ui.hover, true);
  if (ui.sel) drawSelShape(ui.sel, false);
  for (const f of EXT.overlay) { c.save(); try { f(c, px); } finally { c.restore(); } setWorld(); }
  // aperçu d'un mur en cours
  if (ui.tool === 'wall' && ui.cursor) {
    const cur = ui.cursor;
    if (ui.chain) {
      const a = ui.chain.last, L = vdist(a, cur);
      if (L > 0.5) {
        const d = vnorm(vsub(cur, a)), n = vperp(d), th = wallProps().th / 2;
        c.beginPath(); pathPoly(c, [vadd(a, vmul(n, th)), vadd(cur, vmul(n, th)), vsub(cur, vmul(n, th)), vsub(a, vmul(n, th))]);
        c.fillStyle = C.accentSoft; c.fill(); c.strokeStyle = C.accent; c.lineWidth = 1.4 * px; c.setLineDash([5 * px, 4 * px]); c.stroke(); c.setLineDash([]);
        setScreen();
        const m = w2s(vmid(a, cur));
        let ang = Math.atan2(d.y, d.x) / DEG; let disp = Math.round(-ang); if (disp < 0) disp += 360; if (disp >= 360 || Object.is(disp, -0)) disp = 0;
        tag(m.x, m.y - 18, fmtLenU(L) + '  ·  ' + NF0.format(disp) + '°' + (cur.locked ? '  ·  longueur saisie' : ''));
        setWorld();
      }
      c.beginPath(); c.arc(ui.chain.start.x, ui.chain.start.y, 5 * px, 0, Math.PI * 2); c.strokeStyle = C.accent; c.lineWidth = 1.5 * px; c.stroke();
    }
    drawSnapMarker(cur);
  }
  if ((ui.tool === 'room' || ui.tool === 'dim') && ui.cursor && !ui.roomDraft && !ui.dimDraft && ui.mouse) drawSnapMarker(ui.cursor);
  if (ui.roomDraft) {
    const { a, b } = ui.roomDraft;
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const th = wallProps().th;
    c.beginPath(); c.rect(x0 - th / 2, y0 - th / 2, x1 - x0 + th, y1 - y0 + th); c.rect(x0 + th / 2, y0 + th / 2, Math.max(0, x1 - x0 - th), Math.max(0, y1 - y0 - th));
    c.fillStyle = C.accentSoft; c.fill('evenodd');
    c.strokeStyle = C.accent; c.lineWidth = 1.2 * px; c.setLineDash([5 * px, 4 * px]); c.strokeRect(x0, y0, x1 - x0, y1 - y0); c.setLineDash([]);
    if (x1 - x0 > 1 && y1 - y0 > 1) {
      setScreen();
      const m = w2s({ x: (x0 + x1) / 2, y: (y0 + y1) / 2 });
      tag(m.x, m.y, fmtLen(Math.max(0, x1 - x0 - th), 'cm') + ' × ' + fmtLen(Math.max(0, y1 - y0 - th), 'cm') + ' cm intérieur');
      setWorld();
    }
    drawSnapMarker(b);
  }
  if (ui.dimDraft) {
    const { a, b } = ui.dimDraft;
    c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.strokeStyle = C.accent; c.lineWidth = 1.4 * px; c.stroke();
    setScreen(); const m = w2s(vmid(a, b)); tag(m.x, m.y - 16, fmtLenU(vdist(a, b))); setWorld();
    drawSnapMarker(b);
  }
  // liaisons en cours
  if (ui.tool === 'link') {
    const src = ui.linkSrc && IDX.elec.get(ui.linkSrc);
    if (src) {
      const pa = linkAnchor(src);
      c.save(); c.strokeStyle = C.accent; c.lineWidth = 2 * px;
      c.beginPath(); c.arc(pa.x, pa.y, 15 * px, 0, Math.PI * 2); c.stroke();
      for (const l of P.links) if (l.a === src.id || l.b === src.id) { const o = IDX.elec.get(l.a === src.id ? l.b : l.a); if (o) { const pb = linkAnchor(o); c.beginPath(); c.arc(pb.x, pb.y, 13 * px, 0, Math.PI * 2); c.lineWidth = 1.4 * px; c.stroke(); } }
      if (ui.mouse && ui.ghost) { c.setLineDash([5 * px, 4 * px]); c.beginPath(); c.moveTo(pa.x, pa.y); c.lineTo(ui.ghost.x, ui.ghost.y); c.stroke(); }
      c.restore();
    }
    if (ui.hover && ui.hover.t === 'elec') { const o = IDX.elec.get(ui.hover.id); if (o) { const p = linkAnchor(o); c.save(); c.strokeStyle = C.accent; c.globalAlpha = 0.6; c.lineWidth = 1.5 * px; c.beginPath(); c.arc(p.x, p.y, 13 * px, 0, Math.PI * 2); c.stroke(); c.restore(); } }
  }
  if (ui.tool === 'duct') drawDuctDraft();
  // fantôme de placement (souris)
  if (ui.tool === 'place' && ui.ghost && ui.place && ui.mouse) {
    c.save(); c.globalAlpha = 0.55;
    const K = K_();
    if (ui.place.kind === 'elec') { const e = makeElecFromDef(ui.place.def, ui.lv); placeElecAt(e, ui.ghost); drawElec(c, e, K); }
    else { const it = makeItemFromDef(ui.place.def, ui.lv); placeItemAt(it, ui.ghost, ui.place.def); drawItem(c, it, K); }
    c.restore();
  }
}
function tag(x, y, str) {
  const c = ctx;
  c.font = `650 12px ${FONT_LABEL}`;
  const w = c.measureText(str).width + 14;
  c.fillStyle = C.accent;
  c.beginPath(); _rr(c, x - w / 2, y - 11, w, 22, 6); c.fill();
  c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(str, x, y + 0.5);
}
function drawSnapMarker(p) {
  const c = ctx, px = 1 / V.s;
  if (p.guides && p.guides.length) {
    c.save(); c.strokeStyle = C.accent; c.lineWidth = 0.9 * px; c.setLineDash([3 * px, 3 * px]); c.globalAlpha = 0.8;
    c.beginPath(); for (const g of p.guides) { c.moveTo(g.x, g.y); c.lineTo(p.x, p.y); } c.stroke(); c.restore();
  }
  c.save(); c.strokeStyle = C.accent; c.fillStyle = C.accent; c.lineWidth = 1.5 * px;
  const r = 6 * px;
  if (p.kind === 'node' || p.kind === 'corner') { c.beginPath(); c.rect(p.x - r, p.y - r, 2 * r, 2 * r); c.stroke(); }
  else if (p.kind === 'wall') { c.beginPath(); c.moveTo(p.x - r, p.y - r); c.lineTo(p.x + r, p.y + r); c.moveTo(p.x + r, p.y - r); c.lineTo(p.x - r, p.y + r); c.stroke(); }
  else { c.beginPath(); c.arc(p.x, p.y, r * 0.7, 0, Math.PI * 2); c.stroke(); }
  c.beginPath(); c.arc(p.x, p.y, 1.8 * px, 0, Math.PI * 2); c.fill();
  c.restore();
}
function handleDot(p, square) {
  const c = ctx, px = 1 / V.s, r = (ui.pointerType === 'mouse' ? 5.5 : 8) * px;
  c.beginPath();
  if (square) c.rect(p.x - r, p.y - r, 2 * r, 2 * r); else c.arc(p.x, p.y, r, 0, Math.PI * 2);
  c.fillStyle = C.room; c.fill(); c.lineWidth = 1.8 * px; c.strokeStyle = C.accent; c.stroke();
}
function drawSelShape(sel, hover) {
  const c = ctx, px = 1 / V.s, lv = ui.lv, g = geo(lv);
  c.save();
  c.strokeStyle = C.accent; c.lineWidth = (hover ? 1.2 : 2) * px;
  if (hover) c.globalAlpha = 0.6;
  if (sel.t === 'wall') {
    const wg = g.walls.get(sel.id);
    if (wg) {
      c.beginPath(); pathPoly(c, wg.poly); c.fillStyle = C.accentSoft; c.fill(); c.stroke();
      if (!hover) { handleDot(wg.A); handleDot(wg.B); drawWallTags(wg); }
    }
  } else if (sel.t === 'node') {
    const n = nodeOf(sel.id); if (n) { handleDot(n, true); }
  } else if (sel.t === 'opening') {
    const o = IDX.openings.get(sel.id), wg = o && g.walls.get(o.wall);
    if (wg) {
      c.save(); c.translate(wg.A.x, wg.A.y); c.rotate(wg.ang);
      const h2 = wg.th / 2 + 3 * px;
      c.beginPath(); c.rect(o.t - o.w / 2, -h2, o.w, 2 * h2); c.fillStyle = C.accentSoft; c.fill(); c.stroke();
      c.restore();
      if (!hover) {
        const s = -(o.side || 1);
        const off = s * (wg.th / 2) ;
        const P0 = (u) => vadd(vadd(wg.A, vmul(wg.d, u)), vmul(wg.n, off));
        const a = o.t - o.w / 2, b = o.t + o.w / 2;
        const dir = vmul(wg.n, s);
        if (a - wg.clear0 > 0.5) coteLine(P0(wg.clear0), P0(a), dir, 22);
        coteLine(P0(a), P0(b), dir, 22, true);
        if (wg.clear1 - b > 0.5) coteLine(P0(b), P0(wg.clear1), dir, 22);
      }
    }
  } else if (sel.t === 'item') {
    const it = IDX.items.get(sel.id);
    if (it) {
      c.save(); c.translate(it.x, it.y); c.rotate((it.rot || 0) * DEG);
      c.setLineDash([5 * px, 3 * px]);
      c.strokeRect(-it.w / 2 - 3 * px, -it.d / 2 - 3 * px, it.w + 6 * px, it.d + 6 * px);
      c.setLineDash([]);
      if (!hover) { c.beginPath(); c.moveTo(0, -it.d / 2 - 3 * px); c.lineTo(0, -it.d / 2 - 30 * px); c.lineWidth = 1.2 * px; c.stroke(); }
      c.restore();
      if (!hover) for (const h of handlesOf(sel)) handleDot(h.p, h.kind !== 'rot');
    }
  } else if (sel.t === 'elec') {
    const e = IDX.elec.get(sel.id);
    if (e) {
      const b = elecBox(e, K_screen());
      c.save(); c.translate(e.x, e.y); c.rotate((e.rot || 0) * DEG); c.setLineDash([4 * px, 3 * px]);
      c.strokeRect(b.x0 - 3 * px, b.y0 - 3 * px, b.x1 - b.x0 + 6 * px, b.y1 - b.y0 + 6 * px); c.restore();
    }
  } else if (sel.t === 'duct') {
    const d = IDX.ducts.get(sel.id);
    if (d) {
      const pts = ductPts(d);
      c.save(); c.globalAlpha = hover ? 0.3 : 0.45; c.lineJoin = 'round'; c.lineCap = 'round';
      c.lineWidth = (d.sys === 'vmc' ? (d.dia || 125) / 10 : (d.kind === 'goulotte' || d.kind === 'cdc') && isNum(d.lw) ? d.lw / 10 : 0) + 7 * px;
      c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); c.stroke(); c.restore();
      if (!hover) {
        for (const hd of ductHandles(d)) {
          if (hd.kind === 'dmid') { c.beginPath(); c.arc(hd.p.x, hd.p.y, (ui.pointerType === 'mouse' ? 3.5 : 5) * px, 0, Math.PI * 2); c.fillStyle = C.accent; c.fill(); }
          else handleDot(hd.p);
        }
        let bi = 1, bl = -1; for (let i = 1; i < pts.length; i++) { const L = vdist(pts[i - 1], pts[i]); if (L > bl) { bl = L; bi = i; } }
        setScreen(); const m = w2s(vmid(pts[bi - 1], pts[bi])); tag(m.x, m.y - 24, fmtLenU(ductLen(d)) + (d.sys === 'vmc' || isNum(d.dia) ? ' · Ø' + d.dia : tailleChemin(d) ? ' · ' + tailleChemin(d) : '')); setWorld();
      }
    }
  } else if (sel.t === 'room') {
    const lbl = IDX.rooms.get(sel.id), r = lbl && g.rooms.find((x) => x.label === lbl);
    if (r) { c.beginPath(); pathPoly(c, r.poly); for (const h of r.holes) pathPoly(c, h); c.fillStyle = C.accentSoft; c.fill('evenodd'); c.stroke(); }
  } else if (sel.t === 'dim') {
    const d = IDX.dims.get(sel.id);
    if (d) { c.beginPath(); c.moveTo(d.ax, d.ay); c.lineTo(d.bx, d.by); c.lineWidth = 3 * px; c.stroke(); if (!hover) { handleDot({ x: d.ax, y: d.ay }); handleDot({ x: d.bx, y: d.by }); } }
  } else if (sel.t === 'text') {
    const t = IDX.texts.get(sel.id);
    if (t) {
      setRC(SCR); const b = textBox(t);
      c.save(); c.translate(t.x, t.y); c.rotate((t.rot || 0) * DEG); c.setLineDash([4 * px, 3 * px]);
      c.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h); c.restore();
      if (!hover) for (const h of handlesOf(sel)) handleDot(h.p);
    }
  }
  c.restore();
}
/* repères du mur sélectionné : faces 1 / 2 (pastilles) et extrémités A / B
   (pleine = extrémité qui bouge quand on change une longueur) */
function drawWallTags(wg) {
  const c = ctx;
  setScreen();
  c.save();
  c.font = `700 11px ${FONT_LABEL}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const [f, n, k] of [[wg.faceP, wg.n, '1'], [wg.faceN, vmul(wg.n, -1), '2']]) {
    const a = w2s(f[0]), b = w2s(f[1]);
    if (vdist(a, b) < 20) continue;
    const m = vmid(a, b), p = { x: m.x + n.x * 30, y: m.y + n.y * 30 };
    c.beginPath(); c.arc(p.x, p.y, 9.5, 0, Math.PI * 2); c.fillStyle = C.accent; c.fill();
    c.fillStyle = '#fff'; c.fillText(k, p.x, p.y + 0.5);
  }
  const mov = wallMovingEnds(wg.w);
  for (const [id, P0, dir, k] of [[wg.w.a, wg.A, vmul(wg.d, -1), 'A'], [wg.w.b, wg.B, wg.d, 'B']]) {
    const s = w2s(P0), p = { x: s.x + dir.x * 24 + wg.n.x * 14, y: s.y + dir.y * 24 + wg.n.y * 14 };
    const on = mov.includes(id);
    c.beginPath(); _rr(c, p.x - 8.5, p.y - 8.5, 17, 17, 4);
    if (on) { c.fillStyle = C.accent; c.fill(); c.fillStyle = '#fff'; }
    else { c.fillStyle = C.room; c.fill(); c.lineWidth = 1.5; c.strokeStyle = C.accent; c.stroke(); c.fillStyle = C.accent; }
    c.fillText(k, p.x, p.y + 0.5);
  }
  c.restore();
  setWorld();
}
function coteLine(a, b, dir, offPx, main) {
  const c = ctx, px = 1 / V.s;
  const off = vmul(dir, offPx * px);
  const A = vadd(a, off), B = vadd(b, off);
  c.save(); c.strokeStyle = C.accent; c.lineWidth = 1 * px; c.globalAlpha = 1;
  c.beginPath(); c.moveTo(a.x + dir.x * 4 * px, a.y + dir.y * 4 * px); c.lineTo(A.x + dir.x * 4 * px, A.y + dir.y * 4 * px);
  c.moveTo(b.x + dir.x * 4 * px, b.y + dir.y * 4 * px); c.lineTo(B.x + dir.x * 4 * px, B.y + dir.y * 4 * px);
  c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
  const u = vnorm(vsub(B, A)), t = 4 * px;
  c.beginPath(); for (const p of [A, B]) { c.moveTo(p.x - (u.x + dir.x) * t, p.y - (u.y + dir.y) * t); c.lineTo(p.x + (u.x + dir.x) * t, p.y + (u.y + dir.y) * t); } c.stroke();
  c.restore();
  setScreen();
  const m = w2s(vmid(A, B)), dd = vdist(a, b);
  const sa = w2s(A), sb = w2s(B);
  if (vdist(sa, sb) > 26) {
    let ang = Math.atan2(sb.y - sa.y, sb.x - sa.x);
    if (ang > Math.PI / 2 + 0.01) ang -= Math.PI; else if (ang < -Math.PI / 2 + 0.01) ang += Math.PI;
    c.save(); c.translate(m.x + dir.x * 9, m.y + dir.y * 9); c.rotate(ang);
    c.font = `${main ? 700 : 600} 11.5px ${FONT_LABEL}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = C.accent;
    c.lineWidth = 3; c.strokeStyle = C.paper; c.strokeText(fmtLen(dd, 'cm'), 0, 0); c.fillText(fmtLen(dd, 'cm'), 0, 0);
    c.restore();
  }
  setWorld();
}

/* ---------------- barre d'état ---------------- */
function updateStatus() {
  const cand = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];
  let L = cand.find((v) => v * V.s >= 50) || 5000;
  $('#sbBar').style.width = Math.round(L * V.s) + 'px';
  $('#sbLabel').textContent = L >= 100 ? NF0.format(L / 100) + ' m' : L + ' cm';
  const xy = $('#xy');
  if (ui.mouse) xy.textContent = 'x ' + fmtLen(ui.mouse.x) + '  y ' + fmtLen(ui.mouse.y); else xy.textContent = '';
  const g = geo(ui.lv);
  const tot = g.rooms.reduce((s, r) => s + r.area, 0);
  $('#lvArea').textContent = g.rooms.length ? 'Σ ' + fmtArea(tot) : '';
}

export { CLOSET_MODELS, DOOR_MODELS, GAP_MODELS, K_screen, OPENING_ART, OPENING_MODELS, OPENING_NAMES, SCENE,
  SCENE_SLOW_MS, SCR, TAP, TOOLS, WIN_MODELS, clearWallLen, commit, contentBBox, coteLine, ctx, cv, downState, drag,
  drawOverlay, drawSelShape, drawSnapMarker, drawWallTags, evPos, finishChain, fitView, focusField, gest, gridSnapItem,
  handleDot, handleDrag, handlesOf, hitTest, hitTol, ignoreUntilUp, interiorSide, isDoubleTap, keys, lastTap, linkTap,
  lockedWallPoint, magnetElec, magnetItem, makeElecFromDef, makeItemFromDef, makeRect, moveDrag, newOpening,
  onTapSelected, openingHeight, openingModels, openingTool, panDrag, penDown, pencilFirstUse, pencilMode, placeElecAt,
  placeFromCatalog, placeItemAt, ptrEnd, ptrs, rafId, redo, refreshUI, refreshWallMsg, render, requestRender,
  resizeCanvas, revert, sceneDirty, screenToWorld, selObj, select, snapPoint, tag, undo, undoChainStep, updateStatus,
  updateUndo, validateSel, wallByLength, wallClick, wallCursor, wallHeightOf, wallHeightSetting, wallHintMsg,
  wallLenLock, wallProps, zoomAt };

/* Calque — module « reseaux » : réseaux : filtres, conduits VMC et gaines, cotes modifiables.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { $, C, IDX, NF2, P, S, bboxOf, clamp, fmtLenU, inPoly, isNum, projSeg, saveSettings, snapTo, ui, uid, vadd,
  vang, vdir, vdist, vlen, vmid, vmul, vperp, vsub } from './noyau.js';
import { geo } from './geometrie.js';
import { itemToLocal, itemToWorld } from './mutations.js';
import { ELEC_BY, ELEC_CATS, S_ELEC, elecBox } from './symboles.js';
import { FONT_LABEL, RC, TS, V, VIEW, bbInView, setScreen, setWorld, textHalo, w2s } from './rendu2d.js';
import { circById, circNumbers, circuitColor, roomAt } from './electricite.js';
import { K_screen, TAP, commit, ctx, drawSnapMarker, handleDot, hitTol, isDoubleTap, keys, requestRender, revert, tag } from './interaction.js';
import { goToRef } from './tableau.js';
import { ICON, body, btn, btns, chipRow, closePops, deleteSel, faceLen, fmtIn, h, inspHead, kv, numField, parseNum,
  renderInspector, sec, segCtl, setTool, setWallFace, setWallLength, showPop, toast, toggleRow, updateHint,
  wallSideName } from './interface.js';
import { v3Refresh } from './vue3d.js';

/* ============================================================
   CALQUE — réseaux : filtres d'affichage, conduits (VMC et gaines
   électriques), ventilation, cotes modifiables sur le plan
   ============================================================ */
const fold = (str) => String(str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/* ---------------- filtres d'affichage ---------------- */
const FAMS = () => [...ELEC_CATS.map((c) => ({ id: c.id, name: c.name })), { id: 'gaines', name: 'Gaines électriques' }];
const famOn = (id) => !S.filt.off.includes(id);
function filtCirc() { const id = S.filt.circ; return id && P && circById(id) ? id : null; }
function filterActive() { return S.filt.off.length > 0 || !!filtCirc(); }
function elecVisible(e) {
  if (!S.layers.elec) return false;
  const def = ELEC_BY.get(e.type);
  if (def && !famOn(def.cat)) return false;
  const fc = filtCirc();
  if (fc && e.cid !== fc) return false;
  return true;
}
function ductVisible(d) {
  if (!S.layers.elec) return false;
  const fc = filtCirc();
  if (d.sys === 'vmc') {
    if (!famOn('ventilation')) return false;
    if (fc) { const c = circById(fc); return !!c && c.kind === 'vmc'; }
    return true;
  }
  if (!famOn('gaines')) return false;
  return !(fc && d.cid !== fc);
}
function linkVisible(l) { const a = IDX.elec.get(l.a), b = IDX.elec.get(l.b); return !!a && !!b && elecVisible(a) && elecVisible(b); }
const PRESETS = [
  { id: 'all', n: 'Tout', on: null },
  { id: 'prises', n: 'Prises', on: ['prises', 'appareils'] },
  { id: 'eclairage', n: 'Éclairage', on: ['eclairage', 'commandes'], links: true },
  { id: 'vmc', n: 'VMC', on: ['ventilation'] },
  { id: 'gaines', n: 'Gaines', on: ['gaines', 'tableau'] },
  { id: 'chauffage', n: 'Chauffage', on: ['confort'] },
  { id: 'faibles', n: 'Courants faibles', on: ['comm', 'acces', 'alarme'] },
  { id: 'none', n: 'Murs seuls', on: [] },
];
function presetMatch(p) {
  if (filtCirc() || !S.layers.elec) return false;
  const off = new Set(S.filt.off);
  if (!p.on) return off.size === 0;
  return FAMS().every((f) => off.has(f.id) === !p.on.includes(f.id));
}
function applyPreset(p) {
  S.filt.circ = null;
  S.filt.off = p.on ? FAMS().map((f) => f.id).filter((id) => !p.on.includes(id)) : [];
  S.layers.links = !p.on || !!p.links;
  S.layers.elec = true;
  afterFilter();
}
function afterFilter() {
  saveSettings();
  const s = ui.sel;
  if (s && ((s.t === 'elec' && IDX.elec.get(s.id) && !elecVisible(IDX.elec.get(s.id))) || (s.t === 'duct' && IDX.ducts.get(s.id) && !ductVisible(IDX.ducts.get(s.id))))) { ui.sel = null; renderInspector(); }
  updateFilterUI(); requestRender();
  if (ui.view === '3d') v3Refresh();
}
function resetFilters() { S.filt = { off: [], circ: null }; S.layers.elec = true; afterFilter(); }
function filterSummary() {
  const parts = [];
  const fc = filtCirc();
  if (fc) parts.push(`circuit ${circNumbers().get(fc)} · ${circById(fc).name}`);
  if (S.filt.off.length) {
    const p = PRESETS.find((x) => x.on && FAMS().every((f) => S.filt.off.includes(f.id) === !x.on.includes(f.id)));
    const vis = FAMS().filter((f) => famOn(f.id));
    parts.push(p ? p.n : !vis.length ? 'aucun symbole' : vis.length <= 3 ? vis.map((f) => f.name).join(', ') : `${S.filt.off.length} famille${S.filt.off.length > 1 ? 's' : ''} masquée${S.filt.off.length > 1 ? 's' : ''}`);
  }
  return parts.join(' · ');
}
function updateFilterUI() {
  const on = filterActive();
  const b = $('#btnFilter'); if (b) b.classList.toggle('on', on);
  const pill = $('#fpill'); if (!pill) return;
  if (!on || ui.view === 'elec') { pill.hidden = true; }
  else {
    pill.hidden = false;
    pill.replaceChildren(
      h('button', { type: 'button', class: 'fp-main', onclick: () => openFilterPop($('#btnFilter')) }, h('span', { class: 'fp-ic', html: ICON.filter }), h('span', null, 'Filtre :'), h('b', null, filterSummary())),
      h('button', { type: 'button', class: 'fp-x', onclick: resetFilters }, 'Tout afficher'));
  }
  if (!$('#filterPop').hidden) renderFilterPop();
}
function famCount(id) {
  if (id === 'gaines') return P.ducts.filter((d) => d.lv === ui.lv && d.sys === 'elec').length;
  let n = P.elec.filter((e) => e.lv === ui.lv && (ELEC_BY.get(e.type) || {}).cat === id).length;
  if (id === 'ventilation') n += P.ducts.filter((d) => d.lv === ui.lv && d.sys === 'vmc').length;
  return n;
}
function renderFilterPop() {
  const pop = $('#filterPop');
  const nums = circNumbers();
  const csel = h('select', { class: 'txt', 'aria-label': 'Circuit affiché' }, h('option', { value: '' }, 'Tous les circuits'),
    P.circuits.map((c) => h('option', { value: c.id, selected: c.id === S.filt.circ }, `${nums.get(c.id)} · ${c.name}`)));
  csel.addEventListener('change', () => { S.filt.circ = csel.value || null; S.layers.elec = true; afterFilter(); });
  const famRow = (f) => {
    const n = famCount(f.id);
    const b = h('button', { type: 'button', role: 'switch', 'aria-checked': String(S.layers.elec && famOn(f.id)) }, h('span', null, f.name), h('small', { class: 'fcount' }, n ? String(n) : ''), h('span', { class: 'sw', 'aria-hidden': 'true' }));
    b.addEventListener('click', () => {
      const off = new Set(S.filt.off);
      if (!S.layers.elec) { S.layers.elec = true; S.filt.off = FAMS().map((x) => x.id).filter((id) => id !== f.id); }
      else { if (off.has(f.id)) off.delete(f.id); else off.add(f.id); S.filt.off = [...off]; }
      afterFilter(); renderFilterPop();
    });
    return b;
  };
  pop.replaceChildren(h('div', { class: 'menu' },
    h('h4', null, 'Afficher seulement'),
    h('div', { class: 'chips', style: 'padding:2px 8px 6px' }, PRESETS.map((p) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(presetMatch(p)), onclick: () => { applyPreset(p); renderFilterPop(); } }, p.n))),
    h('h4', null, 'Familles sur ce niveau'),
    FAMS().map(famRow),
    toggleRow('Liaisons interrupteurs → éclairages', () => S.layers.links !== false, (v) => (S.layers.links = v)),
    h('h4', null, 'Circuit du tableau'),
    h('div', { style: 'padding:0 8px 8px' }, P.circuits.length ? csel : h('p', { class: 'note' }, 'Générez le tableau (onglet Tableau électrique) pour filtrer par circuit.')),
    h('h4', null, 'Plan'),
    toggleRow('Mobilier', () => S.layers.furn, (v) => (S.layers.furn = v)),
    h('p', { class: 'note', style: 'padding:6px 10px 8px' }, 'Les éléments masqués ne se sélectionnent pas. L’export en image suit le filtre.')));
}
function openFilterPop(anchor) {
  const pop = $('#filterPop');
  if (!pop.hidden) { closePops(); return; }
  renderFilterPop(); showPop(pop, anchor || $('#btnFilter'));
}

/* ---------------- conduits : modèle ---------------- */
const DUCT_DIAS = { vmc: [80, 125, 160, 200], elec: [16, 20, 25, 32] };
const VENT_GROUPS = new Set(['vmc_groupe', 'vmc_df']);
const VENT_DUCT_ONLY = new Set(['vmc', 'vmc_insuff', 'sortie_toit', 'prise_air_neuf', 'plenum']);
function ductAnchor(e) { const def = ELEC_BY.get(e.type); return def && def.wall ? itemToWorld(e, 0, 0.42 * S_ELEC) : { x: e.x, y: e.y }; }
function ductPts(d) {
  const pts = d.pts.map((p) => ({ x: p.x, y: p.y }));
  if (d.a) { const e = IDX.elec.get(d.a); if (e) pts[0] = ductAnchor(e); }
  if (d.b) { const e = IDX.elec.get(d.b); if (e) pts[pts.length - 1] = ductAnchor(e); }
  return pts;
}
function ductLen(d) { const p = ductPts(d); let s = 0; for (let i = 1; i < p.length; i++) s += vdist(p[i - 1], p[i]); return s; }
/* garde les extrémités enregistrées collées aux symboles (appelé à chaque validation) */
function syncDucts() {
  for (const d of P.ducts) {
    for (const [k, i] of [['a', 0], ['b', d.pts.length - 1]]) {
      if (!d[k]) continue;
      const e = IDX.elec.get(d[k]);
      if (!e || e.lv !== d.lv) { d[k] = null; continue; }
      const p = ductAnchor(e); d.pts[i] = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
    }
  }
}
function elecRoom(e) {
  const p = ductAnchor(e), g = geo(e.lv);
  for (const r of g.rooms) if (inPoly(p, r.loop) && !r.holes.some((hh) => inPoly(p, hh))) return r;
  return roomAt(e);
}
function ductEndName(id) {
  const e = id && IDX.elec.get(id);
  if (!e) return 'Point libre';
  const def = ELEC_BY.get(e.type), r = elecRoom(e);
  return (def ? def.n : 'Symbole') + (r && r.label ? ' · ' + r.label.name : '');
}
function ductColor(d, exp) {
  if (d.sys === 'vmc') return RC.C.vmc;
  if (S.layers.circ !== false && d.cid) { const c = circuitColor(d.cid, exp); if (c) return c; }
  return RC.C.gaine;
}
/* sens de l'air : +1 de a vers b, -1 de b vers a */
function ductFlow(d) {
  if (d.sys !== 'vmc') return 0;
  const t = (id) => { const e = id && IDX.elec.get(id); return e ? e.type : null; };
  const ta = t(d.a), tb = t(d.b);
  const src = new Set(['vmc', 'extracteur', 'prise_air_neuf']), dst = new Set(['vmc_insuff', 'sortie_toit']);
  if (src.has(ta) || dst.has(tb)) return 1;
  if (src.has(tb) || dst.has(ta)) return -1;
  return 0;
}
function gaineDia(c) { return ({ 1.5: 16, 2.5: 20, 4: 20, 6: 25, 10: 32, 16: 32 })[c && c.sec] || 20; }
function autoDuctDia(d) {
  const ends = [d.a, d.b].map((id) => id && IDX.elec.get(id)).filter(Boolean);
  if (d.sys === 'elec') {
    const e = ends.find((x) => x.cid && circById(x.cid));
    return e ? gaineDia(circById(e.cid)) : 20;
  }
  const ty = ends.map((e) => e.type);
  if (ty.some((t) => t === 'sortie_toit' || t === 'prise_air_neuf')) return 160;
  const b = ends.find((e) => e.type === 'vmc' || e.type === 'vmc_insuff' || e.type === 'extracteur');
  if (b) return boucheDia(b);
  if (ty.includes('plenum')) return 160;
  return 125;
}
function reverseDuct(d) { d.pts.reverse(); const a = d.a; d.a = d.b; d.b = a; commit(); }

/* ---------------- conduits : rendu ---------------- */
function ductPath(c, pts) { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); }
function drawDucts(lv, opts) {
  const c = RC.ctx, px = RC.px;
  for (const d of P.ducts) {
    if (d.lv !== lv || !ductVisible(d)) continue;
    const pts = ductPts(d); if (pts.length < 2) continue;
    if (VIEW && !bbInView(bboxOf(pts))) continue;
    const col = ductColor(d, !!opts.export);
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    if (d.sys === 'vmc') {
      const w = Math.max((d.dia || 125) / 10, 4.5 * px), inner = Math.max(w - 2.2 * px, w * 0.45);
      ductPath(c, pts); c.strokeStyle = col; c.lineWidth = w + 1.2 * px; c.stroke();
      ductPath(c, pts); c.strokeStyle = RC.C.room; c.lineWidth = inner; c.stroke();
      ductPath(c, pts); c.strokeStyle = col; c.globalAlpha = 0.2; c.stroke(); c.globalAlpha = 1;
      if (d.mat === 'souple' || !d.mat) { ductPath(c, pts); c.setLineDash([1.2 * px, 3.2 * px]); c.lineWidth = Math.min(inner * 0.8, 2.4 * px + inner * 0.3); c.globalAlpha = 0.5; c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
      const fl = ductFlow(d);
      if (fl) for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], L = vdist(a, b);
        if (L * RC.s < 48) continue;
        const u = vmul(vsub(b, a), fl / L), n = vperp(u), m = vmid(a, b), s = Math.max(Math.min(inner * 0.55, 7 * px), 3 * px);
        c.beginPath(); c.moveTo(m.x - u.x * s + n.x * s, m.y - u.y * s + n.y * s); c.lineTo(m.x + u.x * s * 0.6, m.y + u.y * s * 0.6); c.lineTo(m.x - u.x * s - n.x * s, m.y - u.y * s - n.y * s);
        c.strokeStyle = col; c.lineWidth = 1.6 * px; c.stroke();
      }
    } else {
      ductPath(c, pts); c.strokeStyle = col; c.lineWidth = Math.max(2 * px, ((d.dia || 20) / 10) * 0.7); c.setLineDash([10 * px, 3 * px, 2.5 * px, 3 * px]); c.stroke(); c.setLineDash([]);
    }
    c.fillStyle = col;
    if (!d.a || !IDX.elec.get(d.a)) { c.beginPath(); c.arc(pts[0].x, pts[0].y, 3 * px, 0, Math.PI * 2); c.fill(); }
    if (!d.b || !IDX.elec.get(d.b)) { const p = pts[pts.length - 1]; c.beginPath(); c.arc(p.x, p.y, 3 * px, 0, Math.PI * 2); c.fill(); }
    c.restore();
  }
}
/* diamètre écrit le long du plus grand tronçon (repère écran) */
function drawDuctLabels(lv, opts) {
  const c = RC.ctx;
  c.save(); c.font = `700 ${TS(10.5)}px ${FONT_LABEL}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const d of P.ducts) {
    if (d.lv !== lv || !ductVisible(d)) continue;
    const pts = ductPts(d); let bi = -1, bl = 0;
    if (VIEW && pts.length && !bbInView(bboxOf(pts))) continue;
    for (let i = 1; i < pts.length; i++) { const L = vdist(pts[i - 1], pts[i]) * RC.s; if (L > bl) { bl = L; bi = i; } }
    if (bi < 0 || bl < 90) continue;
    const a = w2s(pts[bi - 1]), b = w2s(pts[bi]);
    let ang = Math.atan2(b.y - a.y, b.x - a.x);
    if (ang > Math.PI / 2 + 0.01) ang -= Math.PI; else if (ang < -Math.PI / 2 + 0.01) ang += Math.PI;
    const m = vmid(a, b), n = { x: -Math.sin(ang), y: Math.cos(ang) };
    const off = (d.sys === 'vmc' ? ((d.dia || 125) / 20) * RC.s : 1) + TS(8);
    const str = 'Ø' + (d.dia || '');
    c.save(); c.translate(m.x - n.x * off + (vdist(a, b) > 160 ? (b.x - a.x) * 0.22 : 0), m.y - n.y * off + (vdist(a, b) > 160 ? (b.y - a.y) * 0.22 : 0)); c.rotate(ang);
    c.fillStyle = ductColor(d, !!opts.export); textHalo(c, str, 0, 0); c.restore();
  }
  c.restore();
}

/* ---------------- conduits : sélection et aimantation ---------------- */
function ductAt(p, tol) {
  let best = null, bd = Infinity;
  for (let k = P.ducts.length - 1; k >= 0; k--) {
    const d = P.ducts[k];
    if (d.lv !== ui.lv || !ductVisible(d)) continue;
    const pts = ductPts(d), half = d.sys === 'vmc' ? (d.dia || 125) / 20 : 1.5;
    for (let i = 1; i < pts.length; i++) {
      const dd = projSeg(p, pts[i - 1], pts[i]).d - half;
      if (dd <= tol * 0.6 && dd < bd) { bd = dd; best = d.id; }
    }
  }
  return best;
}
/* symboles auxquels un conduit peut se raccorder : VMC → ventilation, gaine → tout sauf les bouches */
function ductCanAttach(sys, e) {
  if (!sys) return true;
  if (e.type === 'entree_air') return false;
  const cat = (ELEC_BY.get(e.type) || {}).cat;
  return sys === 'vmc' ? cat === 'ventilation' : !VENT_DUCT_ONLY.has(e.type);
}
function elecAt(p, tolPx, sys) {
  const tol = tolPx / V.s, K = K_screen();
  for (let i = P.elec.length - 1; i >= 0; i--) {
    const e = P.elec[i]; if (e.lv !== ui.lv || !elecVisible(e) || !ductCanAttach(sys, e)) continue;
    const l = itemToLocal(e, p), b = elecBox(e, K), m = tol * 0.4;
    if (l.x >= b.x0 - m && l.x <= b.x1 + m && l.y >= b.y0 - m && l.y <= b.y1 + m) return e;
  }
  return null;
}
function snapDuctPoint(p, o) {
  o = o || {};
  const lv = ui.lv;
  let best = null, bd = 16 / V.s;
  if (!o.noElec) {
    for (const e of P.elec) {
      if (e.lv !== lv || !elecVisible(e) || !ductCanAttach(o.sys, e)) continue;
      const a = ductAnchor(e), d = vdist(a, p);
      if (d < bd) { bd = d; best = { x: a.x, y: a.y, elec: e.id, kind: 'elec' }; }
    }
    if (!best) { const e = elecAt(p, hitTol(), o.sys); if (e) { const a = ductAnchor(e); best = { x: a.x, y: a.y, elec: e.id, kind: 'elec' }; } }
    if (best) return best;
  }
  bd = 12 / V.s;
  for (const d of P.ducts) {
    if (d.lv !== lv || d.id === o.exclude || !ductVisible(d) || (o.sys && d.sys !== o.sys)) continue;
    for (const q of ductPts(d)) { const dd = vdist(q, p); if (dd < bd) { bd = dd; best = { x: q.x, y: q.y, kind: 'node' }; } }
  }
  if (best) return best;
  bd = 10 / V.s;
  for (const d of P.ducts) {
    if (d.lv !== lv || d.id === o.exclude || !ductVisible(d) || (o.sys && d.sys !== o.sys)) continue;
    const pts = ductPts(d);
    for (let i = 1; i < pts.length; i++) { const pr = projSeg(p, pts[i - 1], pts[i]); if (pr.d < bd) { bd = pr.d; best = { x: pr.pt.x, y: pr.pt.y, kind: 'wall' }; } }
  }
  if (best) return best;
  let q = { x: snapTo(p.x, S.grid), y: snapTo(p.y, S.grid) };
  if (o.from && S.ortho && !keys.shift) {
    const v = vsub(p, o.from), L = vlen(v);
    if (L > 1) {
      const a = Math.round(vang(v) / (Math.PI / 4)) * (Math.PI / 4);
      const Ls = Math.max(S.grid, snapTo(L * Math.cos(vang(v) - a), S.grid));
      q = vadd(o.from, vmul(vdir(a), Ls));
      q = { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10 };
    }
  }
  return { x: q.x, y: q.y, kind: 'free' };
}
function ductHandles(d) {
  const out = [], pts = ductPts(d);
  pts.forEach((p, i) => out.push({ kind: 'dpt', p, id: d.id, idx: i }));
  for (let i = 1; i < pts.length; i++) if (vdist(pts[i - 1], pts[i]) * V.s > 44) out.push({ kind: 'dmid', p: vmid(pts[i - 1], pts[i]), id: d.id, idx: i - 1 });
  return out;
}
function ductHandleDrag(h, wp0, sp0) {
  const d = IDX.ducts.get(h.id); if (!d) return null;
  let idx = h.idx, moved = false, snap = null;
  const isEnd = () => idx === 0 || idx === d.pts.length - 1;
  return {
    move(wp, sp) {
      if (!moved && vdist(sp, sp0) < TAP()) return;
      if (!moved && h.kind === 'dmid') { const pts = ductPts(d); d.pts.splice(idx + 1, 0, vmid(pts[idx], pts[idx + 1])); idx += 1; }
      moved = true;
      const pts = ductPts(d);
      const nb = idx > 0 ? pts[idx - 1] : pts[idx + 1];
      snap = snapDuctPoint(wp, { exclude: d.id, from: nb, noElec: !isEnd(), sys: d.sys });
      d.pts[idx] = { x: snap.x, y: snap.y };
      if (idx === 0) d.a = null; else if (idx === d.pts.length - 1) d.b = null;
      ui.cursor = snap;
    },
    up(wp, sp) {
      ui.cursor = null;
      if (!moved) {
        if (h.kind === 'dpt' && !isEnd() && isDoubleTap(sp, 'dpt' + d.id + ':' + idx)) { d.pts.splice(idx, 1); commit(); toast('Coude retiré.'); }
        return;
      }
      if (isEnd() && snap && snap.elec) d[idx === 0 ? 'a' : 'b'] = snap.elec;
      commit();
    },
    cancel() { ui.cursor = null; revert(); },
  };
}

/* ---------------- outil Conduit ---------------- */
function ductHintMsg() {
  const dr = ui.duct, sys = dr ? dr.sys : S.ductSys;
  if (!dr) return sys === 'vmc' ? 'Touchez le groupe VMC, une bouche ou un point de départ.' : 'Touchez le tableau, une boîte de dérivation ou un symbole.';
  return 'Touchez pour chaque coude, puis touchez le symbole d’arrivée. Retouchez le dernier point pour finir dans le vide.';
}
function startDuctFrom(e, sys) {
  setTool('duct');
  S.ductSys = sys; saveSettings();
  ui.duct = { sys, pts: [ductAnchor(e)], a: e.id, b: null };
  updateHint(); requestRender();
}
function ductTap(wp) {
  const dr = ui.duct;
  const last = dr && dr.pts.length ? dr.pts[dr.pts.length - 1] : null;
  const pt = snapDuctPoint(wp, { from: last, sys: dr ? dr.sys : null });
  if (!dr) {
    let sys = S.ductSys;
    if (pt.elec) {
      const e = IDX.elec.get(pt.elec), def = ELEC_BY.get(e.type);
      if (VENT_DUCT_ONLY.has(e.type)) sys = 'vmc';
      else if (def && def.cat !== 'ventilation') sys = 'elec';
      if (sys !== S.ductSys) { S.ductSys = sys; saveSettings(); toast(sys === 'vmc' ? 'Conduit de VMC depuis ' + def.n.toLowerCase() + '.' : 'Gaine électrique depuis ' + def.n.toLowerCase() + '.'); }
    }
    ui.duct = { sys, pts: [{ x: pt.x, y: pt.y }], a: pt.elec || null, b: null };
    updateHint(); requestRender(); return;
  }
  if (pt.elec && !(pt.elec === dr.a && dr.pts.length === 1)) { dr.pts.push({ x: pt.x, y: pt.y }); dr.b = pt.elec; finishDuct(); return; }
  if (pt.elec) return;
  if (vdist(last, pt) * V.s < (ui.pointerType === 'mouse' ? 8 : 16)) { if (dr.pts.length >= 2) finishDuct(); return; }
  dr.pts.push({ x: pt.x, y: pt.y });
  updateHint(); requestRender();
}
function finishDuct() {
  const dr = ui.duct; ui.duct = null;
  const pts = [];
  if (dr) for (const p of dr.pts) if (!pts.length || vdist(pts[pts.length - 1], p) > 0.5) pts.push({ x: p.x, y: p.y });
  if (!dr || pts.length < 2) { updateHint(); requestRender(); return null; }
  const d = { id: uid('k'), lv: ui.lv, sys: dr.sys, pts, a: dr.a || null, b: dr.b || null };
  if (d.sys === 'elec') {
    const ends = [d.b, d.a].map((id) => id && IDX.elec.get(id)).filter(Boolean);
    const pick = ends.find((e) => e.cid && !['tableau', 'tab_div', 'derivation', 'gtl'].includes(e.type)) || ends.find((e) => e.cid);
    if (pick) d.cid = pick.cid;
  } else d.mat = 'souple';
  d.dia = ui.ductDia || autoDuctDia(d);
  if (ui.ductDia) d.diaSet = 1;
  P.ducts.push(d); IDX.ducts.set(d.id, d);
  commit();
  toast(`${d.sys === 'vmc' ? 'Conduit Ø' + d.dia : 'Gaine Ø' + d.dia} de ${fmtLenU(ductLen(d))} ajouté${d.sys === 'vmc' ? '' : 'e'}.`);
  updateHint();
  return d;
}
function drawDuctDraft() {
  const c = ctx, px = 1 / V.s, dr = ui.duct;
  if (dr) {
    const pts = dr.pts.map((p) => ({ x: p.x, y: p.y }));
    if (dr.a && IDX.elec.get(dr.a)) pts[0] = ductAnchor(IDX.elec.get(dr.a));
    const col = dr.sys === 'vmc' ? C.vmc : C.gaine;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = col; c.globalAlpha = 0.7;
    c.lineWidth = dr.sys === 'vmc' ? Math.max((ui.ductDia || 125) / 10, 4 * px) : 2.4 * px;
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y);
    if (ui.cursor && ui.mouse) c.lineTo(ui.cursor.x, ui.cursor.y);
    c.stroke(); c.globalAlpha = 1; c.restore();
    for (const p of pts) handleDot(p);
    let L = 0; for (let i = 1; i < pts.length; i++) L += vdist(pts[i - 1], pts[i]);
    if (ui.cursor && ui.mouse) L += vdist(pts[pts.length - 1], ui.cursor);
    if (L > 1) { setScreen(); const s = w2s(ui.cursor && ui.mouse ? ui.cursor : pts[pts.length - 1]); tag(s.x, s.y - 22, fmtLenU(L)); setWorld(); }
  }
  if (ui.cursor && ui.mouse) {
    if (ui.cursor.elec) { c.save(); c.strokeStyle = C.accent; c.lineWidth = 2 * px; c.beginPath(); c.arc(ui.cursor.x, ui.cursor.y, 14 * px, 0, Math.PI * 2); c.stroke(); c.restore(); }
    else drawSnapMarker(ui.cursor);
  }
}

/* ---------------- ventilation (VMC) ---------------- */
/* Débits : arrêté du 24 mars 1982 modifié (débits extraits en pointe) */
function roomKindName(name) {
  const n = fold(name);
  if (/cuisine|kitchenette/.test(n)) return 'cuisine';
  if (/salle (de bains?|d.eau)|\bsdb\b|douche/.test(n)) return 'sdb';
  if (/\bwc\b|toilette/.test(n)) return 'wc';
  if (/cellier|buanderie|lingerie/.test(n)) return 'cellier';
  if (/sejour|salon|chambre|bureau|salle a manger|living|mezzanine|piece de vie|salle de jeux|bibliotheque/.test(n)) return 'principale';
  return 'autre';
}
function ventRooms() { const out = []; for (const L of P.levels) for (const r of geo(L.id).rooms) if (r.label) out.push({ r, lv: L.id, kind: roomKindName(r.label.name) }); return out; }
function ventCounts() { const R = ventRooms(); return { nPP: R.filter((x) => x.kind === 'principale').length, nWC: R.filter((x) => x.kind === 'wc').length }; }
const KITCHEN_Q = [75, 90, 105, 120, 135];
function ventNeed(kind, cnt) {
  const i = clamp(cnt.nPP || 1, 1, 5) - 1;
  if (kind === 'cuisine') return KITCHEN_Q[i];
  if (kind === 'sdb') return cnt.nPP >= 3 ? 30 : 15;
  if (kind === 'wc') return cnt.nWC <= 1 && cnt.nPP >= 4 ? 30 : 15;
  return 15;
}
function boucheDebit(e) {
  if (isNum(e.q) && e.q > 0) return e.q;
  const r = elecRoom(e), name = r && r.label ? r.label.name : '';
  if (e.type === 'entree_air') return /s[ée]jour|salon/i.test(name) ? 45 : 30;
  if (e.type === 'vmc_insuff') return /s[ée]jour|salon/i.test(name) ? 60 : 30;
  if (e.type === 'extracteur') return 30;
  return ventNeed(roomKindName(name), ventCounts());
}
function boucheDia(e) {
  if (isNum(e.dia) && e.dia > 0) return e.dia;
  if (e.type === 'vmc') { const r = elecRoom(e); return r && r.label && roomKindName(r.label.name) === 'cuisine' ? 125 : 80; }
  if (e.type === 'extracteur') return 100;
  if (e.type === 'vmc_insuff') return 80;
  return 160;
}
function vmcGraph() {
  const par = new Map();
  const f = (x) => { if (!par.has(x)) par.set(x, x); while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  const u = (a, b) => { const ra = f(a), rb = f(b); if (ra !== rb) par.set(ra, rb); };
  const ducts = P.ducts.filter((d) => d.sys === 'vmc');
  const vents = P.elec.filter((e) => (ELEC_BY.get(e.type) || {}).cat === 'ventilation');
  const geoms = new Map(ducts.map((d) => [d.id, ductPts(d)]));
  for (const d of ducts) {
    const k = 'd:' + d.id; f(k);
    if (d.a && IDX.elec.has(d.a)) u(k, 'e:' + d.a);
    if (d.b && IDX.elec.has(d.b)) u(k, 'e:' + d.b);
    const pts = geoms.get(d.id);
    for (const end of [pts[0], pts[pts.length - 1]]) {
      for (const e of vents) if (e.lv === d.lv && vdist(ductAnchor(e), end) < 25) u(k, 'e:' + e.id);
      for (const d2 of ducts) {
        if (d2 === d || d2.lv !== d.lv) continue;
        const p2 = geoms.get(d2.id);
        for (let i = 1; i < p2.length; i++) if (projSeg(end, p2[i - 1], p2[i]).d < 4) { u(k, 'd:' + d2.id); break; }
      }
    }
  }
  return f;
}
const VMC_MODE_NOTE = {
  auto: 'Débits constants : bouches et entrées d’air autoréglables.',
  hygroA: 'Bouches hygroréglables (le débit suit l’humidité), entrées d’air autoréglables.',
  hygroB: 'Bouches et entrées d’air hygroréglables : la plus économe en chauffage.',
};
function vmcChecks() {
  const out = [];
  const add = (sev, msg, ref) => out.push({ sev, msg, ref });
  const vents = P.elec.filter((e) => (ELEC_BY.get(e.type) || {}).cat === 'ventilation');
  const groups = vents.filter((e) => VENT_GROUPS.has(e.type));
  if (!groups.length && !vents.some((e) => e.type !== 'extracteur') && !P.ducts.some((d) => d.sys === 'vmc')) return out;
  const df = groups.some((e) => e.type === 'vmc_df');
  const cnt = ventCounts(), rooms = ventRooms(), find = vmcGraph();
  const nm = (e) => { const d = ELEC_BY.get(e.type), r = elecRoom(e); return (d ? d.n : '') + (r && r.label ? ' (' + r.label.name + ')' : ''); };
  if (!groups.length) add('err', 'Aucun groupe VMC sur le plan : ajoutez un groupe simple flux ou double flux (catalogue Électricité, onglet Ventilation).', null);
  const roots = new Set(groups.map((g) => find('e:' + g.id)));
  const linked = (e) => roots.has(find('e:' + e.id));
  const inRoom = (x, types) => vents.filter((e) => e.lv === x.lv && types.includes(e.type) && inPoly(ductAnchor(e), x.r.loop));
  const pp = cnt.nPP > 1 ? 's' : '';
  for (const x of rooms) {
    const name = x.r.label.name, ref = { t: 'room', id: x.r.label.id, lv: x.lv };
    if (['cuisine', 'sdb', 'wc', 'cellier'].includes(x.kind)) {
      const b = inRoom(x, ['vmc']);
      if (!b.length) {
        if (x.kind === 'cellier') add('info', `${name} : une bouche d’extraction est conseillée.`, ref);
        else add('err', `${name} : pas de bouche d’extraction (obligatoire dans chaque pièce de service).`, ref);
      } else {
        const need = ventNeed(x.kind, cnt), q = b.reduce((s, e) => s + boucheDebit(e), 0);
        if (q < need) add('warn', `${name} : ${q} m³/h extraits en pointe, ${need} m³/h attendus pour ${cnt.nPP || 1} pièce${pp} principale${pp}.`, { t: 'elec', id: b[0].id });
        else add('ok', `${name} : ${q} m³/h extraits (${need} attendus).`, { t: 'elec', id: b[0].id });
        if (x.kind === 'cuisine' && b.some((e) => boucheDia(e) < 125)) add('warn', `${name} : la bouche de cuisine se raccorde en Ø125.`, { t: 'elec', id: b[0].id });
      }
      const ea = inRoom(x, ['entree_air']);
      if (ea.length) add('warn', `${name} : entrée d’air dans une pièce de service. L’air neuf doit entrer par les pièces principales.`, { t: 'elec', id: ea[0].id });
    } else if (x.kind === 'principale') {
      const ea = inRoom(x, ['entree_air']), ins = inRoom(x, ['vmc_insuff']);
      if (df) {
        if (!ins.length) add('err', `${name} : pas de bouche d’insufflation (double flux).`, ref);
        else add('ok', `${name} : ${ins.reduce((s, e) => s + boucheDebit(e), 0)} m³/h insufflés.`, { t: 'elec', id: ins[0].id });
        if (ea.length) add('warn', `${name} : entrée d’air inutile en double flux (elle court-circuite l’échangeur).`, { t: 'elec', id: ea[0].id });
      } else if (groups.length) {
        if (!ea.length) add('err', `${name} : pas d’entrée d’air (obligatoire dans chaque pièce principale en simple flux).`, ref);
        else add('ok', `${name} : ${ea.length} entrée${ea.length > 1 ? 's' : ''} d’air (${ea.reduce((s, e) => s + boucheDebit(e), 0)} m³/h).`, { t: 'elec', id: ea[0].id });
      }
      const bx = inRoom(x, ['vmc']);
      if (bx.length) add('warn', `${name} : bouche d’extraction dans une pièce principale. On extrait dans les pièces de service.`, { t: 'elec', id: bx[0].id });
    }
  }
  if (groups.length) {
    for (const e of vents.filter((v) => v.type === 'vmc' || v.type === 'vmc_insuff' || v.type === 'plenum')) if (!linked(e)) add('err', `${nm(e)} pas raccordée au groupe : tracez un conduit avec l’outil Conduit.`, { t: 'elec', id: e.id });
    for (const g of groups) {
      const root = find('e:' + g.id);
      if (!vents.some((v) => v.type === 'sortie_toit' && find('e:' + v.id) === root)) add('warn', `${nm(g)} : rejet non raccordé. Reliez le groupe à une sortie de toit (Ø160).`, { t: 'elec', id: g.id });
      if (g.type === 'vmc_df' && !vents.some((v) => v.type === 'prise_air_neuf' && find('e:' + v.id) === root)) add('warn', `${nm(g)} : reliez le groupe à une prise d’air neuf.`, { t: 'elec', id: g.id });
      if (!g.cid && P.circuits.length) add('info', `${nm(g)} : pas encore relié au circuit VMC du tableau (disjoncteur 2 A).`, { t: 'elec', id: g.id });
    }
    const q = vents.filter((v) => v.type === 'vmc' && linked(v)).reduce((s, e) => s + boucheDebit(e), 0);
    if (q) add('info', `Débit total extrait en pointe : ${q} m³/h.`, null);
    if (!df) add('info', 'Détalonnez les portes intérieures (1 à 2 cm) pour que l’air passe des pièces principales vers les pièces de service.', null);
  }
  for (const d of P.ducts.filter((x) => x.sys === 'vmc' && (x.mat || 'souple') === 'souple')) {
    const L = ductLen(d);
    if (L > 600) add('info', `Conduit souple de ${fmtLenU(L)} : sur une telle longueur, un conduit semi-rigide ou rigide limite les pertes de charge.`, { t: 'duct', id: d.id, lv: d.lv });
  }
  const rank = { err: 0, warn: 1, info: 2, ok: 3 };
  out.sort((a, b) => rank[a.sev] - rank[b.sev]);
  return out;
}

/* ---------------- inspecteur : ventilation et conduits ---------------- */
function vchkList(checks, max) {
  return h('div', { class: 'list' }, checks.slice(0, max).map((c) => h(c.ref ? 'button' : 'div', { type: c.ref ? 'button' : null, class: 'li vchk', onclick: c.ref ? () => goToRef(c.ref) : null },
    h('span', { class: 'ev-dot ' + (c.sev === 'err' ? 'err' : c.sev === 'warn' ? 'warnd' : c.sev === 'ok' ? 'ok' : 'idle') }), h('span', null, c.msg), h('span'))));
}
function ventGroupSection(e) {
  const df = e.type === 'vmc_df';
  const f = vmcGraph(), root = f('e:' + e.id);
  const bouches = P.elec.filter((x) => x.type === 'vmc' || x.type === 'vmc_insuff');
  const linked = bouches.filter((x) => f('e:' + x.id) === root);
  const qx = linked.filter((x) => x.type === 'vmc').reduce((s, x) => s + boucheDebit(x), 0);
  const qi = linked.filter((x) => x.type === 'vmc_insuff').reduce((s, x) => s + boucheDebit(x), 0);
  const len = P.ducts.filter((d) => d.sys === 'vmc' && f('d:' + d.id) === root).reduce((s, d) => s + ductLen(d), 0);
  const checks = vmcChecks().filter((c) => c.sev !== 'ok');
  return [
    df ? null : sec('Type de VMC', segCtl([{ v: 'auto', n: 'Autoréglable' }, { v: 'hygroA', n: 'Hygro A' }, { v: 'hygroB', n: 'Hygro B' }], e.mode || 'auto', (v) => { e.mode = v; commit(); }),
      h('p', { class: 'note' }, VMC_MODE_NOTE[e.mode || 'auto'])),
    sec('Réseau de ventilation',
      kv([['Bouches raccordées', `${linked.length} / ${bouches.length}`], ['Débit extrait en pointe', qx + ' m³/h'], df ? ['Débit insufflé', qi + ' m³/h'] : null, ['Conduits raccordés', len ? fmtLenU(len) : '—']]),
      btns(btn('Conduit depuis le groupe', () => startDuctFrom(e, 'vmc'), 'sm', 'duct'), btn('Gaine d’alimentation', () => startDuctFrom(e, 'elec'), 'sm', 'duct')),
      h('p', { class: 'note' }, 'Placez le groupe sur le même niveau que les bouches qu’il dessert (dans les combles, au-dessus du plafond).')),
    sec('Vérification VMC', checks.length ? vchkList(checks, 8) : h('p', { class: 'note' }, 'Aucun problème détecté.'),
      checks.length > 8 ? h('p', { class: 'note' }, `Et ${checks.length - 8} autre${checks.length - 8 > 1 ? 's' : ''} point${checks.length - 8 > 1 ? 's' : ''} dans Tableau électrique › Contrôle.`) : null),
  ];
}
function ventSection(e) {
  const def = ELEC_BY.get(e.type); if (!def || def.cat !== 'ventilation') return null;
  if (VENT_GROUPS.has(e.type)) return ventGroupSection(e);
  const r = elecRoom(e), name = r && r.label ? r.label.name : 'Hors pièce';
  const kind = r && r.label ? roomKindName(r.label.name) : 'autre';
  const parts = [];
  if (['vmc', 'vmc_insuff', 'entree_air', 'extracteur'].includes(e.type)) {
    const q = boucheDebit(e);
    const chips = e.type === 'entree_air' ? [15, 22, 30, 45] : e.type === 'vmc_insuff' ? [15, 30, 45, 60, 90] : [15, 30, 45, 75, 90, 105, 120, 135];
    parts.push(kv([['Pièce', name], ['Type de pièce', { cuisine: 'Cuisine', sdb: 'Salle de bain / d’eau', wc: 'WC', cellier: 'Cellier / buanderie', principale: 'Pièce principale', autre: 'Non reconnu (renommez la pièce)' }[kind]],
      e.type === 'vmc' && ['cuisine', 'sdb', 'wc', 'cellier'].includes(kind) ? ['Débit attendu en pointe', ventNeed(kind, ventCounts()) + ' m³/h'] : null]));
    parts.push(numField(e.type === 'entree_air' ? 'Module de l’entrée d’air' : 'Débit en pointe', q, 'm³/h', (v) => { e.q = v; commit(); }, { id: 'f-vq', min: 5, max: 1000 }),
      chipRow(chips, q, (v) => { e.q = v; commit(); }));
    if (!isNum(e.q)) parts.push(h('p', { class: 'note' }, 'Valeur proposée d’après le nom de la pièce et le nombre de pièces principales du logement.'));
  }
  if (e.type === 'entree_air') parts.push(h('p', { class: 'note' }, 'En simple flux, l’air neuf entre par les pièces principales (séjour, chambres, bureau) et ressort par les bouches des pièces de service.'));
  else {
    parts.push(h('div', { class: 'fld' }, h('span', null, 'Diamètre de raccordement'), chipRow([80, 100, 125, 160], boucheDia(e), (v) => { e.dia = v; commit(); }, (v) => 'Ø' + v)));
    const groups = P.elec.filter((g) => VENT_GROUPS.has(g.type));
    if (groups.length && e.type !== 'extracteur') {
      const f = vmcGraph(), ok = groups.some((g) => f('e:' + g.id) === f('e:' + e.id));
      parts.push(h('div', null, h('span', { class: 'pill ' + (ok ? 'ok' : 'bad') }, ok ? 'Raccordée au groupe VMC' : 'Pas encore raccordée au groupe')));
    }
    if (e.type !== 'extracteur') parts.push(btns(btn('Tracer un conduit d’ici', () => startDuctFrom(e, 'vmc'), 'sm', 'duct')));
  }
  return sec('Ventilation', ...parts);
}
function inspDuct(d) {
  const vmc = d.sys === 'vmc';
  const pts = ductPts(d), L = ductLen(d), nums = circNumbers();
  let circ = null;
  if (!vmc) {
    const sel = h('select', { class: 'txt', id: 'f-dcirc', 'aria-label': 'Circuit' }, h('option', { value: '' }, 'Aucun circuit'),
      P.circuits.map((c) => h('option', { value: c.id, selected: c.id === d.cid }, `${nums.get(c.id)} · ${c.name}`)));
    sel.addEventListener('change', () => {
      if (sel.value) { d.cid = sel.value; if (!d.diaSet) d.dia = gaineDia(circById(sel.value)); } else delete d.cid;
      commit();
    });
    const c = d.cid && circById(d.cid);
    circ = sec('Circuit', sel, c ? h('p', { class: 'note' }, `${c.cal} A · ${String(c.sec).replace('.', ',')} mm² : gaine ICTA Ø${gaineDia(c)} conseillée.`)
      : h('p', { class: 'note' }, P.circuits.length ? 'Le circuit donne sa couleur à la gaine et permet de la filtrer.' : 'Générez le tableau pour rattacher la gaine à un circuit.'));
  }
  return [
    inspHead(vmc ? 'Conduit de VMC' : 'Gaine électrique', `${fmtLenU(L)} · Ø${d.dia} mm`),
    body(
      kv([['Départ', ductEndName(d.a)], ['Arrivée', ductEndName(d.b)], ['Longueur', fmtLenU(L)], ['Coudes', String(Math.max(0, pts.length - 2))]]),
      sec('Diamètre', chipRow(DUCT_DIAS[d.sys], d.dia, (v) => { d.dia = v; d.diaSet = 1; commit(); }, (v) => 'Ø' + v),
        h('p', { class: 'note' }, vmc ? 'Ø80 : salle de bain, WC, cellier · Ø125 : cuisine · Ø160 : rejet, air neuf et collecteur.' : 'Gaine ICTA : Ø16 pour du 1,5 mm², Ø20 pour du 2,5 mm², Ø25 pour du 6 mm², Ø32 pour du 10 mm².')),
      vmc ? sec('Type de conduit', segCtl([{ v: 'souple', n: 'Souple isolé' }, { v: 'semi', n: 'Semi-rigide' }, { v: 'rigide', n: 'Rigide' }], d.mat || 'souple', (v) => { d.mat = v; commit(); }),
        h('p', { class: 'note' }, (d.mat || 'souple') === 'souple' ? 'Gardez le conduit souple bien tendu, sans écrasement ni coude serré, et le plus court possible.' : 'Moins de pertes de charge qu’un conduit souple, à isoler s’il traverse des combles froids.')) : circ,
      h('p', { class: 'note' }, 'Faites glisser un point rond pour déplacer un coude, ou un petit point au milieu d’un tronçon pour en ajouter un. Double-touchez un coude pour le retirer.'),
      sec(null, btns(btn('Inverser le sens', () => reverseDuct(d), '', 'swap'), btn('Supprimer', deleteSel, 'danger', 'del'))),
    ),
  ];
}
function networkSummary() {
  const ducts = P.ducts.filter((d) => d.lv === ui.lv);
  const lv = ducts.filter((d) => d.sys === 'vmc').reduce((s, d) => s + ductLen(d), 0);
  const le = ducts.filter((d) => d.sys === 'elec').reduce((s, d) => s + ductLen(d), 0);
  const groups = P.elec.filter((e) => VENT_GROUPS.has(e.type));
  const checks = vmcChecks();
  const bad = checks.filter((c) => c.sev === 'err' || c.sev === 'warn').length;
  if (!ducts.length && !checks.length) return null;
  const byDia = new Map();
  for (const d of ducts) { const k = (d.sys === 'vmc' ? 'Conduit VMC' : 'Gaine') + ' Ø' + d.dia; byDia.set(k, (byDia.get(k) || 0) + ductLen(d)); }
  return sec('Réseaux',
    kv([lv ? ['Conduits de VMC', fmtLenU(lv)] : null, le ? ['Gaines électriques', fmtLenU(le)] : null,
      ...[...byDia.entries()].sort().map(([k, v]) => [h('span', { style: 'padding-left:10px' }, k), fmtLenU(v)]),
      checks.length ? ['Vérification VMC', bad ? `${bad} point${bad > 1 ? 's' : ''} à revoir` : 'conforme'] : null]),
    groups.length && checks.length ? btns(btn('Voir la VMC', () => { const g = groups.find((x) => x.lv === ui.lv) || groups[0]; goToRef({ t: 'elec', id: g.id }); }, 'sm')) : null);
}

/* ---------------- cotes de murs modifiables sur le plan ---------------- */
let DIMHIT = [];
function dimHitAt(sp) {
  const m = ui.pointerType === 'mouse' ? 2 : 7;
  for (let i = DIMHIT.length - 1; i >= 0; i--) {
    const d = DIMHIT[i];
    if (sp.x >= d.box.x0 - m && sp.x <= d.box.x1 + m && sp.y >= d.box.y0 - m && sp.y <= d.box.y1 + m) return d;
  }
  return null;
}
function closeDimEdit() { const b = $('#dimEdit'); if (b && !b.hidden) { b.hidden = true; ui.dimEdit = null; requestRender(); } }
function openDimEdit(dh) {
  const w = IDX.walls.get(dh.wid); if (!w) return;
  const g = geo(w.lv).walls.get(w.id); if (!g) return;
  ui.sel = { t: 'wall', id: w.id }; ui.inspOpen = true; ui.dimEdit = dh; renderInspector(); requestRender();
  const box = $('#dimEdit');
  const inM = S.unit === 'm';
  const cur = dh.sgn ? faceLen(g, dh.sgn) : g.L;
  const input = h('input', { type: 'text', inputmode: 'decimal', value: inM ? NF2.format(cur / 100) : fmtIn(cur), 'aria-label': 'Nouvelle longueur', autocomplete: 'off', enterkeyhint: 'done' });
  const apply = () => {
    const v = parseNum(input.value);
    const cm = inM ? v * 100 : v;
    if (!isNum(v) || cm < 1 || cm > 100000) { toast('Saisissez une longueur.'); input.focus(); return; }
    closeDimEdit();
    if (dh.sgn) setWallFace(w, dh.sgn, cm); else setWallLength(w, cm);
  };
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } else if (e.key === 'Escape') { e.preventDefault(); closeDimEdit(); } });
  const ends = [{ v: 'auto', n: 'Auto' }, { v: 'a', n: 'Bout A' }, { v: 'b', n: 'Bout B' }, { v: 'mid', n: 'Les deux' }];
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': 'Extrémité qui bouge' });
  const drawSeg = () => seg.replaceChildren(...ends.map((o) => h('button', { type: 'button', 'aria-pressed': String((S.wallEnd || 'auto') === o.v), onclick: () => { S.wallEnd = o.v; saveSettings(); drawSeg(); requestRender(); renderInspector(); } }, o.n)));
  drawSeg();
  const side = dh.sgn ? `Face côté ${dh.sgn > 0 ? 1 : 2} · ${wallSideName(g, dh.sgn)}` : 'Longueur dans l’axe';
  box.replaceChildren(
    h('div', { class: 'de-head' }, h('b', null, side), h('button', { type: 'button', class: 'de-x', 'aria-label': 'Fermer', html: ICON.x, onclick: closeDimEdit })),
    h('div', { class: 'de-row' }, h('div', { class: 'inp' }, input, h('em', null, inM ? 'm' : 'cm')), h('button', { type: 'button', class: 'btn pri', onclick: apply }, 'Appliquer')),
    h('div', { class: 'de-ends' }, h('span', null, 'Extrémité qui bouge'), seg));
  box.hidden = false;
  const st = $('#stage').getBoundingClientRect();
  const bw = box.offsetWidth, bh = box.offsetHeight;
  const cx = (dh.box.x0 + dh.box.x1) / 2;
  let top = dh.box.y1 + 10;
  if (top + bh > st.height - 8) top = dh.box.y0 - bh - 10;
  box.style.left = clamp(cx - bw / 2, 8, Math.max(8, st.width - bw - 8)) + 'px';
  box.style.top = clamp(top, 8, Math.max(8, st.height - bh - 8)) + 'px';
  try { input.focus({ preventScroll: true }); input.select(); } catch (err) { }
}
/* modification depuis un autre module (une variable importée ne peut pas être réaffectée directement) */
function setDIMHIT(v) { DIMHIT = v; }

export { DIMHIT, DUCT_DIAS, FAMS, KITCHEN_Q, PRESETS, VENT_DUCT_ONLY, VENT_GROUPS, VMC_MODE_NOTE, afterFilter,
  applyPreset, autoDuctDia, boucheDebit, boucheDia, closeDimEdit, dimHitAt, drawDuctDraft, drawDuctLabels, drawDucts,
  ductAnchor, ductAt, ductCanAttach, ductColor, ductEndName, ductFlow, ductHandleDrag, ductHandles, ductHintMsg,
  ductLen, ductPath, ductPts, ductTap, ductVisible, elecAt, elecRoom, elecVisible, famCount, famOn, filtCirc,
  filterActive, filterSummary, finishDuct, fold, gaineDia, inspDuct, linkVisible, networkSummary, openDimEdit,
  openFilterPop, presetMatch, renderFilterPop, resetFilters, reverseDuct, roomKindName, setDIMHIT, snapDuctPoint,
  startDuctFrom, syncDucts, updateFilterUI, vchkList, ventCounts, ventGroupSection, ventNeed, ventRooms, ventSection,
  vmcChecks, vmcGraph };

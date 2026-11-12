/* Calque — module « mesure » : outil « Mesurer » (distance et surface, sans rien ajouter au plan).
   Toucher des points (accrochés aux angles, aux murs et à la grille comme le tracé des murs) : chaque tronçon et le
   total s'affichent ; si le contour est fermé (toucher le premier point), la surface aussi. « Transformer en cotes »
   enregistre les tronçons comme des cotes du plan. Les calculs (longueurs, surface) sont dans mesureCalc, sans écran.
   Module JavaScript natif (aucune compilation). */
import { EXT, IDX, P, fmtArea, fmtLenU, ui, uid } from './noyau.js';
import { V } from './rendu2d.js';
import { commit, cv, drawSnapMarker, requestRender, snapPoint } from './interaction.js';
import { btn, h, setTool, toast, updateHint } from './interface.js';

/* ---------- calculs (sans écran) ---------- */
function mesureCalc(pts, ferme) {
  const n = pts.length, troncons = [];
  for (let i = 1; i < n; i++) troncons.push(Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y));
  if (ferme && n >= 3) troncons.push(Math.hypot(pts[0].x - pts[n - 1].x, pts[0].y - pts[n - 1].y));
  let aire = null;
  if (ferme && n >= 3) { let s = 0; for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; s += a.x * b.y - b.x * a.y; } aire = Math.abs(s) / 2; }
  return { troncons, total: troncons.reduce((s, x) => s + x, 0), aire };
}

/* ---------- outil ---------- */
const M = { pts: [], ferme: false, cur: null };
function vider() { M.pts = []; M.ferme = false; M.cur = null; updateHint(); requestRender(true); }
function enCotes() {
  if (M.pts.length < 2) return;
  const n = M.pts.length, segs = [];
  for (let i = 1; i < n; i++) segs.push([M.pts[i - 1], M.pts[i]]);
  if (M.ferme && n >= 3) segs.push([M.pts[n - 1], M.pts[0]]);
  for (const [a, b] of segs) { if (Math.hypot(b.x - a.x, b.y - a.y) < 1) continue; const d = { id: uid('d'), lv: ui.lv, ax: a.x, ay: a.y, bx: b.x, by: b.y }; P.dims.push(d); IDX.dims.set(d.id, d); }
  commit(); toast(`${segs.length} cote${segs.length > 1 ? 's ajoutées' : ' ajoutée'} au plan.`); vider();
}
EXT.tools.mesure = {
  down(wp, sp) {
    let moved = false;
    return {
      move(w2, s2) { if (Math.hypot(s2.x - sp.x, s2.y - sp.y) > 10) moved = true; },
      up(w2) {
        if (moved) return;
        if (M.ferme) { M.pts = []; M.ferme = false; } // nouvelle mesure
        const last = M.pts[M.pts.length - 1];
        const p = snapPoint(w2, { corners: true, from: last || undefined });
        const q = { x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 };
        const first = M.pts[0];
        if (first && M.pts.length >= 3 && Math.hypot(q.x - first.x, q.y - first.y) * V.s < 22) M.ferme = true;
        else if (!last || Math.hypot(q.x - last.x, q.y - last.y) > 0.5) M.pts.push(q);
        updateHint(); requestRender(true);
      },
    };
  },
  hover(wp) { const last = M.pts[M.pts.length - 1]; M.cur = M.ferme ? null : snapPoint(wp, { corners: true, from: last || undefined }); cv.style.cursor = 'crosshair'; },
};
EXT.hintKey.push(() => (ui.tool === 'mesure' ? 'u' + M.pts.length + (M.ferme ? 'f' : '') : ''));
EXT.hint.mesure = () => {
  const r = mesureCalc(M.pts, M.ferme);
  const msg = !M.pts.length ? 'Touchez le point de départ, puis les points suivants. Touchez le premier point pour fermer et obtenir la surface.'
    : M.pts.length === 1 ? 'Touchez le point suivant.'
      : `Total ${fmtLenU(r.total)}${r.troncons.length > 1 ? ` (${r.troncons.length} tronçons)` : ''}${r.aire != null ? ` · surface ${fmtArea(r.aire)}` : ''}`;
  return [h('b', null, 'Mesurer'), h('span', { class: 'msg', id: 'mesureMsg' }, msg),
    M.pts.length && !M.ferme ? btn('Retirer le dernier point', () => { M.pts.pop(); updateHint(); requestRender(true); }, 'sm') : null,
    M.pts.length >= 2 ? btn('Transformer en cotes', enCotes, 'sm') : null,
    M.pts.length ? btn('Effacer', vider, 'sm') : null,
    btn('Terminer', () => { vider(); setTool('select'); }, 'pri sm')];
};
EXT.overlay.push((c, px) => {
  if (ui.tool !== 'mesure') { if (M.pts.length) { M.pts = []; M.ferme = false; } return; }
  const pts = M.pts.slice(); if (!M.ferme && M.cur && ui.mouse && pts.length) pts.push(M.cur);
  if (M.cur && ui.mouse && !M.ferme) drawSnapMarker(M.cur);
  if (!pts.length) return;
  const COUL = '#0E7C86';
  c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
  if (M.ferme && pts.length >= 3) { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) c.lineTo(p.x, p.y); c.closePath(); c.fillStyle = 'rgba(14,124,134,0.10)'; c.fill(); }
  c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) c.lineTo(p.x, p.y); if (M.ferme) c.closePath();
  c.setLineDash([7 * px, 4 * px]); c.strokeStyle = COUL; c.lineWidth = 2 * px; c.stroke(); c.setLineDash([]);
  c.fillStyle = COUL; for (const p of M.pts) { c.beginPath(); c.arc(p.x, p.y, 3.5 * px, 0, Math.PI * 2); c.fill(); }
  /* longueur de chaque tronçon, au milieu, lisible dans tous les sens */
  const segs = []; for (let i = 1; i < pts.length; i++) segs.push([pts[i - 1], pts[i]]); if (M.ferme && pts.length >= 3) segs.push([pts[pts.length - 1], pts[0]]);
  c.font = `600 ${12 * px}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const [a, b] of segs) {
    const L = Math.hypot(b.x - a.x, b.y - a.y); if (L * V.s < 30) continue;
    let ang = Math.atan2(b.y - a.y, b.x - a.x); if (ang > Math.PI / 2) ang -= Math.PI; if (ang < -Math.PI / 2) ang += Math.PI;
    c.save(); c.translate((a.x + b.x) / 2, (a.y + b.y) / 2); c.rotate(ang);
    const t = fmtLenU(L), w = c.measureText(t).width + 8 * px;
    c.fillStyle = 'rgba(255,255,255,0.92)'; c.fillRect(-w / 2, -16 * px, w, 14 * px); c.fillStyle = COUL; c.fillText(t, 0, -9 * px); c.restore();
  }
  c.restore();
});

export { M as MESURE, mesureCalc };

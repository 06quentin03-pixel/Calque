/* Calque — module « symboles » : symboles : mobilier, escaliers, électricité, catalogues.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { DEG, S, clamp, climbHeight, vadd, vdist, vlen, vmid, vmul, vnorm, vperp, vsub } from './noyau.js';
import { normDeg } from './mutations.js';

/* ============================================================
   CALQUE — symboles : mobilier, escaliers, électricité, catalogues
   Chaque objet se dessine dans son repère local (cm), centré,
   dos (côté mur) vers -y, façade vers +y.
   ============================================================ */

function _r(c, x, y, w, h) { c.beginPath(); c.rect(x, y, w, h); }
function _rr(c, x, y, w, h, r) {
  c.beginPath();
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
  c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function _ln(c, x1, y1, x2, y2) { c.moveTo(x1, y1); c.lineTo(x2, y2); }
function _circ(c, x, y, r) { c.beginPath(); c.arc(x, y, Math.max(0.01, r), 0, Math.PI * 2); }
function _ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2); }
function _fs(c, fill) { if (fill) { c.fillStyle = fill; c.fill(); } c.stroke(); }
function _dash(c, K, a, b) { c.setLineDash([a * K.px, b * K.px]); }
function _nodash(c) { c.setLineDash([]); }
function _txt(c, K, str, x, y, size, opts) {
  if (size / K.px < 5.5) return;
  c.save();
  c.translate(x, y);
  if (K.flipText) c.rotate(Math.PI);
  c.font = `${(opts && opts.weight) || 600} ${size}px ${K.font}`;
  c.fillStyle = (opts && opts.color) || K.ink2;
  c.textAlign = (opts && opts.align) || 'center';
  c.textBaseline = 'middle';
  c.fillText(str, 0, 0);
  c.restore();
}

/* ---------------- mobilier ---------------- */
function basin(c, K, x, y, w, h, r) { _rr(c, x, y, w, h, r); _fs(c, K.fill); }
const DR = {
  meuble_bas(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); c.beginPath(); _ln(c, -w / 2, d / 2 - 4, w / 2, d / 2 - 4); c.stroke(); },
  meuble_haut(c, w, d, K) { _dash(c, K, 5, 4); _r(c, -w / 2, -d / 2, w, d); c.stroke(); c.beginPath(); _ln(c, -w / 2, -d / 2, w / 2, d / 2); _ln(c, w / 2, -d / 2, -w / 2, d / 2); c.stroke(); _nodash(c); },
  colonne(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); c.beginPath(); _ln(c, -w / 2, -d / 2, w / 2, d / 2); _ln(c, w / 2, -d / 2, -w / 2, d / 2); c.stroke(); },
  plan_travail(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.tone); },
  evier1(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.tone);
    const bw = Math.min(w - 14, 52), bd = d - 20;
    basin(c, K, -bw / 2, -d / 2 + 12, bw, bd, 6);
    _circ(c, 0, -d / 2 + 12 + bd / 2, 2.4); c.stroke();
    _circ(c, 0, -d / 2 + 6, 2.2); _fs(c, K.fill);
  },
  evier2(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.tone);
    const bw = (w - 18) / 2, bd = d - 20;
    for (const x of [-w / 2 + 7, 2]) { basin(c, K, x, -d / 2 + 12, bw - 2, bd, 6); _circ(c, x + (bw - 2) / 2, -d / 2 + 12 + bd / 2, 2.4); c.stroke(); }
    _circ(c, 0, -d / 2 + 6, 2.2); _fs(c, K.fill);
  },
  evier_eg(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.tone);
    const bw = Math.min(46, w / 2 - 8), bd = d - 20;
    basin(c, K, -w / 2 + 7, -d / 2 + 12, bw, bd, 6);
    _circ(c, -w / 2 + 7 + bw / 2, -d / 2 + 12 + bd / 2, 2.4); c.stroke();
    c.beginPath();
    for (let x = -w / 2 + bw + 16; x < w / 2 - 6; x += 5) _ln(c, x, -d / 2 + 14, x, d / 2 - 10);
    c.stroke();
    _circ(c, -w / 2 + 7 + bw / 2, -d / 2 + 6, 2.2); _fs(c, K.fill);
  },
  plaque(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.tone);
    const m = Math.min(w, d);
    const pos = [[-1, -1, 0.17], [1, -1, 0.13], [-1, 1, 0.13], [1, 1, 0.17]];
    for (const [sx, sy, r] of pos) { _circ(c, (sx * w) / 4.2, (sy * d) / 4.2, m * r); _fs(c, K.fill); _circ(c, (sx * w) / 4.2, (sy * d) / 4.2, m * r * 0.55); c.stroke(); }
  },
  plaque90(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.tone);
    const m = Math.min(w, d);
    for (const [x, y, r] of [[-w / 3, -d / 4.2, 0.13], [-w / 3, d / 4.2, 0.15], [w / 3, -d / 4.2, 0.15], [w / 3, d / 4.2, 0.13], [0, 0, 0.2]]) { _circ(c, x, y, m * r); _fs(c, K.fill); }
  },
  four(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); _r(c, -w / 2 + 6, -d / 2 + 6, w - 12, d - 16); c.stroke(); _txt(c, K, 'F', 0, -2, Math.min(w, d) * 0.3); },
  lave_vaisselle(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); _txt(c, K, 'LV', 0, 0, Math.min(w, d) * 0.28); },
  frigo(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); c.beginPath(); _ln(c, -w / 2, d / 2 - 6, w / 2, d / 2 - 6); c.stroke(); _txt(c, K, 'R', 0, -3, Math.min(w, d) * 0.3); },
  frigo_us(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); c.beginPath(); _ln(c, -w / 2, d / 2 - 6, w / 2, d / 2 - 6); _ln(c, -w * 0.1, d / 2 - 6, -w * 0.1, d / 2); c.stroke(); _txt(c, K, 'R', 0, -3, Math.min(w, d) * 0.28); },
  congelateur(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); _txt(c, K, 'C', 0, 0, Math.min(w, d) * 0.3); },
  micro_ondes(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); _r(c, -w / 2 + 4, -d / 2 + 4, w * 0.62, d - 8); c.stroke(); _txt(c, K, 'MO', w * 0.33, 0, Math.min(w, d) * 0.2); },
  hotte(c, w, d, K) { _dash(c, K, 5, 4); _r(c, -w / 2, -d / 2, w, d); c.stroke(); _r(c, -w * 0.18, -d / 2, w * 0.36, d * 0.4); c.stroke(); _nodash(c); },
  ilot(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.tone); _dash(c, K, 4, 3); c.beginPath(); _ln(c, -w / 2, d / 2 - 25, w / 2, d / 2 - 25); c.stroke(); _nodash(c); },
  lave_linge(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); const m = Math.min(w, d); _circ(c, 0, 2, m * 0.32); c.stroke(); _txt(c, K, 'LL', 0, 2, m * 0.18); },
  seche_linge(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); const m = Math.min(w, d); _circ(c, 0, 2, m * 0.32); c.stroke(); _txt(c, K, 'SL', 0, 2, m * 0.18); },
  table_rect(c, w, d, K) {
    const cw = 44, cd = 42;
    const chair = (x, y, rot) => { c.save(); c.translate(x, y); c.rotate(rot); DR.chaise(c, cw, cd, K); c.restore(); };
    const n = Math.max(1, Math.floor((w - 10) / 62));
    for (let i = 0; i < n; i++) { const x = -w / 2 + (w / n) * (i + 0.5); chair(x, -d / 2 - cd / 2 + 12, 0); chair(x, d / 2 + cd / 2 - 12, Math.PI); }
    if (d >= 75 && w >= 150) { chair(-w / 2 - cd / 2 + 12, 0, -Math.PI / 2); chair(w / 2 + cd / 2 - 12, 0, Math.PI / 2); }
    _rr(c, -w / 2, -d / 2, w, d, 3); _fs(c, K.fill);
  },
  table_ronde(c, w, d, K) {
    const R = w / 2, n = Math.max(2, Math.round((Math.PI * w) / 68));
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2; c.save(); c.translate(Math.cos(a) * (R + 9), Math.sin(a) * (R + 9)); c.rotate(a - Math.PI / 2); DR.chaise(c, 44, 42, K); c.restore(); }
    _circ(c, 0, 0, R); _fs(c, K.fill);
  },
  chaise(c, w, d, K) { _rr(c, -w / 2, -d / 2 + 6, w, d - 6, 5); _fs(c, K.fill); _rr(c, -w / 2, -d / 2, w, 8, 3); _fs(c, K.fill); },
  canape(c, w, d, K, it) {
    const bk = Math.min(22, d * 0.24), arm = Math.min(18, w * 0.12);
    _rr(c, -w / 2, -d / 2, w, d, 6); _fs(c, K.fill);
    _rr(c, -w / 2, -d / 2, w, bk, 5); _fs(c, K.fill);
    _rr(c, -w / 2, -d / 2 + bk - 3, arm, d - bk + 3, 4); _fs(c, K.fill);
    _rr(c, w / 2 - arm, -d / 2 + bk - 3, arm, d - bk + 3, 4); _fs(c, K.fill);
    const seats = (it && it.seats) || Math.max(1, Math.round((w - 2 * arm) / 62));
    const sw = (w - 2 * arm) / seats;
    c.beginPath();
    for (let i = 1; i < seats; i++) _ln(c, -w / 2 + arm + sw * i, -d / 2 + bk, -w / 2 + arm + sw * i, d / 2 - 4);
    c.stroke();
  },
  canape_angle(c, w, d, K) {
    const sd = Math.min(100, d * 0.55), cw = Math.min(100, w * 0.42), bk = 22, arm = 18;
    c.beginPath();
    c.moveTo(-w / 2, -d / 2); c.lineTo(w / 2, -d / 2); c.lineTo(w / 2, -d / 2 + sd); c.lineTo(-w / 2 + cw, -d / 2 + sd);
    c.lineTo(-w / 2 + cw, d / 2); c.lineTo(-w / 2, d / 2); c.closePath(); _fs(c, K.fill);
    _rr(c, -w / 2, -d / 2, w, bk, 5); _fs(c, K.fill);
    _rr(c, -w / 2, -d / 2, bk, d, 5); _fs(c, K.fill);
    _rr(c, w / 2 - arm, -d / 2 + bk - 3, arm, sd - bk + 3, 4); _fs(c, K.fill);
    const seats = Math.max(1, Math.round((w - cw - arm) / 62));
    const x0 = -w / 2 + cw, sw = (w - cw - arm) / seats;
    c.beginPath();
    _ln(c, x0, -d / 2 + bk, x0, -d / 2 + sd);
    for (let i = 1; i < seats; i++) _ln(c, x0 + sw * i, -d / 2 + bk, x0 + sw * i, -d / 2 + sd - 4);
    _ln(c, -w / 2 + bk, -d / 2 + sd, -w / 2 + cw, -d / 2 + sd);
    c.stroke();
  },
  fauteuil(c, w, d, K) { DR.canape(c, w, d, K, { seats: 1 }); },
  table_basse(c, w, d, K) { _rr(c, -w / 2, -d / 2, w, d, 6); _fs(c, K.fill); _rr(c, -w / 2 + 5, -d / 2 + 5, w - 10, d - 10, 3); c.stroke(); },
  meuble_tv(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); _rr(c, -w * 0.33, -d / 2 + 6, w * 0.66, 5, 2); _fs(c, K.tone); c.beginPath(); _ln(c, -8, -d / 2 + 11, 8, -d / 2 + 11); c.stroke(); },
  bibliotheque(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); const n = Math.max(1, Math.round(w / 40)); c.beginPath(); for (let i = 1; i < n; i++) _ln(c, -w / 2 + (w / n) * i, -d / 2, -w / 2 + (w / n) * i, d / 2); _ln(c, -w / 2, d / 2 - 3, w / 2, d / 2 - 3); c.stroke(); },
  lit(c, w, d, K) {
    _rr(c, -w / 2, -d / 2, w, d, 3); _fs(c, K.fill);
    _rr(c, -w / 2, -d / 2, w, 7, 2); _fs(c, K.tone);
    const n = w >= 115 ? 2 : 1, gap = 6, pw = (w - 16 - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) { _rr(c, -w / 2 + 8 + i * (pw + gap), -d / 2 + 11, pw, 22, 6); _fs(c, K.fill); }
    const y = -d / 2 + 42;
    c.beginPath(); _ln(c, -w / 2, y, w / 2, y); c.stroke();
    c.beginPath(); c.moveTo(w / 2, y); c.lineTo(w / 2 - Math.min(34, w * 0.3), y); c.lineTo(w / 2, y + Math.min(34, w * 0.3)); c.closePath(); _fs(c, K.tone);
  },
  lit_superpose(c, w, d, K) { DR.lit(c, w, d, K); _dash(c, K, 5, 4); c.beginPath(); _ln(c, -w / 2, -d / 2, w / 2, d / 2); _ln(c, w / 2, -d / 2, -w / 2, d / 2); c.stroke(); _nodash(c); },
  lit_bebe(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); _r(c, -w / 2 + 4, -d / 2 + 4, w - 8, d - 8); c.stroke(); c.beginPath(); for (let y = -d / 2 + 10; y < d / 2 - 6; y += 8) { _ln(c, -w / 2, y, -w / 2 + 4, y); _ln(c, w / 2 - 4, y, w / 2, y); } c.stroke(); },
  chevet(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); _circ(c, 0, -2, Math.min(w, d) * 0.22); c.stroke(); },
  armoire(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill);
    c.beginPath(); _ln(c, -w / 2, d / 2 - 3, w / 2, d / 2 - 3); c.stroke();
    c.beginPath(); _ln(c, -w / 2 + 4, -2, w / 2 - 4, -2); c.stroke();
    c.beginPath(); for (let x = -w / 2 + 10; x < w / 2 - 6; x += 9) _ln(c, x - 3, -d * 0.3, x + 3, d * 0.24); c.stroke();
  },
  dressing(c, w, d, K) {
    c.beginPath(); c.moveTo(-w / 2, d / 2); c.lineTo(-w / 2, -d / 2); c.lineTo(w / 2, -d / 2); c.lineTo(w / 2, d / 2); _fs(c, null);
    _dash(c, K, 5, 4); c.beginPath(); _ln(c, -w / 2, d / 2, w / 2, d / 2); c.stroke(); _nodash(c);
    c.beginPath(); _ln(c, -w / 2 + 4, -2, w / 2 - 4, -2); c.stroke();
    c.beginPath(); for (let x = -w / 2 + 10; x < w / 2 - 6; x += 9) _ln(c, x - 3, -d * 0.3, x + 3, d * 0.24); c.stroke();
  },
  placard(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill);
    c.beginPath(); _ln(c, -w / 2, d / 2 - 3, 6, d / 2 - 3); _ln(c, -6, d / 2 - 8, w / 2, d / 2 - 8); c.stroke();
    _dash(c, K, 4, 3); c.beginPath(); _ln(c, -w / 2 + 4, -4, w / 2 - 4, -4); c.stroke(); _nodash(c);
  },
  commode(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); c.beginPath(); _ln(c, -w / 2, d / 2 - 4, w / 2, d / 2 - 4); c.stroke(); },
  bureau(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); _rr(c, -w * 0.2, -d / 2 + 6, w * 0.4, 4, 2); _fs(c, K.tone); },
  chaise_bureau(c, w, d, K) { _circ(c, 0, 4, Math.min(w, d) * 0.4); _fs(c, K.fill); _rr(c, -w * 0.36, -d / 2, w * 0.72, 9, 4); _fs(c, K.fill); },
  baignoire(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill);
    _rr(c, -w / 2 + 6, -d / 2 + 6, w - 12, d - 12, Math.min(22, d / 2 - 6)); c.stroke();
    _circ(c, -w / 2 + 20, 0, 3); c.stroke();
    _r(c, -w / 2 + 1, -6, 4, 12); c.stroke();
  },
  baignoire_ilot(c, w, d, K) { _ell(c, 0, 0, w / 2, d / 2); _fs(c, K.fill); _ell(c, 0, 0, w / 2 - 7, d / 2 - 7); c.stroke(); _circ(c, -w / 2 + 22, 0, 3); c.stroke(); },
  douche(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill);
    c.beginPath(); _ln(c, -w / 2, -d / 2, w / 2, d / 2); _ln(c, w / 2, -d / 2, -w / 2, d / 2); c.stroke();
    _circ(c, 0, 0, 4); _fs(c, K.fill);
  },
  douche_ita(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.tone);
    _dash(c, K, 4, 4); c.beginPath(); _ln(c, -w / 2, d / 2, w / 2 - 10, -d / 2 + 12); _ln(c, w / 2, d / 2, -w / 2 + 10, -d / 2 + 12); c.stroke(); _nodash(c);
    c.save(); c.lineWidth = 3 * K.px; c.beginPath(); _ln(c, -w / 2 + 10, -d / 2 + 10, w / 2 - 10, -d / 2 + 10); c.stroke(); c.restore();
  },
  lavabo(c, w, d, K) {
    c.beginPath(); c.moveTo(-w / 2, -d / 2); c.lineTo(w / 2, -d / 2); c.lineTo(w / 2, -d / 2 + d * 0.3);
    c.bezierCurveTo(w / 2, d / 2 + 2, -w / 2, d / 2 + 2, -w / 2, -d / 2 + d * 0.3); c.closePath(); _fs(c, K.fill);
    _ell(c, 0, d * 0.04, w * 0.34, d * 0.3); c.stroke();
    _circ(c, 0, -d / 2 + 6, 2.2); _fs(c, K.fill);
  },
  vasque2(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill);
    for (const sx of [-1, 1]) { _ell(c, (sx * w) / 4, 3, Math.min(w / 4 - 7, 22), d * 0.3); c.stroke(); _circ(c, (sx * w) / 4, -d / 2 + 6, 2.2); c.stroke(); }
  },
  wc(c, w, d, K) {
    _rr(c, -w / 2, -d / 2, w, 18, 3); _fs(c, K.fill);
    const by = -d / 2 + 18 + (d - 18) / 2 - 1, ry = (d - 18) / 2 + 1;
    _ell(c, 0, by, w * 0.42, ry); _fs(c, K.fill);
    _ell(c, 0, by + 2, w * 0.29, ry * 0.68); c.stroke();
  },
  wc_susp(c, w, d, K) {
    _dash(c, K, 4, 3); _r(c, -w / 2 - 6, -d / 2 - 2, w + 12, 14); c.stroke(); _nodash(c);
    const by = -d / 2 + 12 + (d - 12) / 2, ry = (d - 12) / 2;
    _ell(c, 0, by, w * 0.44, ry); _fs(c, K.fill);
    _ell(c, 0, by + 2, w * 0.3, ry * 0.68); c.stroke();
  },
  lave_mains(c, w, d, K) { _rr(c, -w / 2, -d / 2, w, d, Math.min(w, d) * 0.45); _fs(c, K.fill); _ell(c, 0, 2, w * 0.3, d * 0.28); c.stroke(); },
  bidet(c, w, d, K) { _ell(c, 0, 0, w / 2, d / 2); _fs(c, K.fill); _ell(c, 0, 3, w * 0.3, d * 0.3); c.stroke(); _circ(c, 0, -d / 2 + 7, 2.2); c.stroke(); },
  seche_serv(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); c.beginPath(); for (let x = -w / 2 + 6; x < w / 2 - 2; x += 6) _ln(c, x, -d / 2, x, d / 2); c.stroke(); },
  chauffe_eau(c, w, d, K) { _circ(c, 0, 0, Math.min(w, d) / 2); _fs(c, K.fill); _circ(c, 0, 0, Math.min(w, d) / 2 - 4); c.stroke(); _txt(c, K, 'CE', 0, 0, Math.min(w, d) * 0.24); },
  chaudiere(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); _circ(c, 0, -d / 2 + 8, 5); c.stroke(); _txt(c, K, 'CH', 0, 4, Math.min(w, d) * 0.3); },
  radiateur(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); c.beginPath(); for (let x = -w / 2 + 5; x < w / 2 - 1; x += 5) _ln(c, x, -d / 2, x, d / 2); c.stroke(); },
  poele(c, w, d, K) { const R = Math.min(w, d) / 2; _circ(c, 0, 0, R); _fs(c, K.fill); _circ(c, 0, 0, R * 0.7); c.stroke(); _circ(c, 0, -R * 0.45, R * 0.24); _fs(c, K.tone); },
  cheminee(c, w, d, K) {
    _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill);
    c.beginPath(); c.moveTo(-w / 2 + 12, -d / 2 + 6); c.lineTo(w / 2 - 12, -d / 2 + 6); c.lineTo(w / 2 - 22, d / 2 - 6); c.lineTo(-w / 2 + 22, d / 2 - 6); c.closePath(); _fs(c, K.tone);
  },
  voiture(c, w, d, K) {
    c.beginPath();
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) { c.rect(sx < 0 ? -w / 2 - 4 : w / 2 - 18, sy * d * 0.3 - 18, 22, 36); }
    _fs(c, K.tone);
    _rr(c, -w / 2, -d / 2, w, d, w * 0.32); _fs(c, K.fill);
    _rr(c, -w / 2 + 14, -d / 2 + d * 0.25, w - 28, d * 0.5, 18); c.stroke();
    c.beginPath(); _ln(c, -w / 2 + 16, -d / 2 + d * 0.34, w / 2 - 16, -d / 2 + d * 0.34); _ln(c, -w / 2 + 16, d / 2 - d * 0.3, w / 2 - 16, d / 2 - d * 0.3); c.stroke();
  },
  plante(c, w, d, K) {
    const R = Math.min(w, d) / 2;
    for (let i = 0; i < 7; i++) { c.save(); c.rotate((i / 7) * Math.PI * 2); _ell(c, R * 0.5, 0, R * 0.5, R * 0.2); _fs(c, K.fill); c.restore(); }
    _circ(c, 0, 0, R * 0.18); _fs(c, K.tone);
  },
  poteau(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.wall); },
  tapis(c, w, d, K) { _dash(c, K, 3, 3); _rr(c, -w / 2, -d / 2, w, d, 4); c.stroke(); _rr(c, -w / 2 + 6, -d / 2 + 6, w - 12, d - 12, 3); c.stroke(); _nodash(c); },
  bloc(c, w, d, K) { _r(c, -w / 2, -d / 2, w, d); _fs(c, K.fill); },
};

/* ---------------- escaliers ---------------- */
function rectSteps(x0, x1, yStart, yEnd, n, out) {
  const g = (yEnd - yStart) / n;
  for (let i = 0; i < n; i++) {
    const a = yStart + g * i, b = yStart + g * (i + 1);
    out.push([{ x: x0, y: a }, { x: x1, y: a }, { x: x1, y: b }, { x: x0, y: b }]);
  }
}
function rectStepsX(xStart, xEnd, y0, y1, n, out) {
  const g = (xEnd - xStart) / n;
  for (let i = 0; i < n; i++) {
    const a = xStart + g * i, b = xStart + g * (i + 1);
    out.push([{ x: a, y: y0 }, { x: a, y: y1 }, { x: b, y: y1 }, { x: b, y: y0 }]);
  }
}
function stairModel(it) {
  const w = it.w, d = it.d, n = Math.max(3, Math.round(it.n || 15));
  const steps = [];
  let path = [];
  let landing = null;
  if (it.type === 'esc_droit') {
    rectSteps(-w / 2, w / 2, d / 2, -d / 2, n, steps);
    path = [{ x: 0, y: d / 2 - d / n / 2 }, { x: 0, y: -d / 2 + d / n / 2 }];
  } else if (it.type === 'esc_quart') {
    const e = clamp(it.e || 90, 40, Math.min(w, d) - 20);
    const l1 = d - e, l2 = w - e;
    const nw = n >= 8 ? 3 : 0;
    const nr = n - nw;
    let n1 = Math.max(1, Math.round((nr * l1) / (l1 + l2)));
    let n2 = Math.max(1, nr - n1);
    rectSteps(w / 2 - e, w / 2, d / 2, -d / 2 + e, n1, steps);
    const I = { x: w / 2 - e, y: -d / 2 + e };
    if (nw) {
      const p30 = { x: w / 2, y: -d / 2 + e - e * Math.tan(30 * DEG) };
      const p60 = { x: w / 2 - e + e / Math.tan(60 * DEG), y: -d / 2 };
      steps.push([I, { x: w / 2, y: -d / 2 + e }, p30]);
      steps.push([I, p30, { x: w / 2, y: -d / 2 }, p60]);
      steps.push([I, p60, { x: w / 2 - e, y: -d / 2 }]);
    } else {
      landing = [{ x: w / 2 - e, y: -d / 2 }, { x: w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 + e }, I];
    }
    rectStepsX(w / 2 - e, -w / 2, -d / 2 + e, -d / 2, n2, steps);
    const g1 = l1 / n1, g2 = l2 / n2;
    path = [{ x: w / 2 - e / 2, y: d / 2 - g1 / 2 }, { x: w / 2 - e / 2, y: -d / 2 + e / 2 }, { x: -w / 2 + g2 / 2, y: -d / 2 + e / 2 }];
  } else if (it.type === 'esc_demi') {
    const e = clamp(it.e || 90, 40, w / 2 - 2);
    const l = d - e;
    const n1 = Math.ceil(n / 2), n2 = Math.max(1, n - n1);
    rectSteps(w / 2 - e, w / 2, d / 2, -d / 2 + e, n1, steps);
    landing = [{ x: -w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 }, { x: w / 2, y: -d / 2 + e }, { x: -w / 2, y: -d / 2 + e }];
    steps.push(landing);
    rectSteps(-w / 2 + e, -w / 2, -d / 2 + e, d / 2, n2, steps);
    path = [{ x: w / 2 - e / 2, y: d / 2 - l / n1 / 2 }, { x: w / 2 - e / 2, y: -d / 2 + e / 2 }, { x: -w / 2 + e / 2, y: -d / 2 + e / 2 }, { x: -w / 2 + e / 2, y: d / 2 - l / n2 / 2 }];
    // les marches du 2e volée sont orientées dans l'autre sens : on corrige l'ordre des sommets
    for (let i = steps.length - n2; i < steps.length; i++) { const s = steps[i]; steps[i] = [s[1], s[0], s[3], s[2]]; }
  } else if (it.type === 'esc_helice') {
    const R = Math.min(w, d) / 2, r0 = Math.min(9, R * 0.15);
    const turn = clamp(it.turn || 300, 90, 360) * DEG;
    const a0 = Math.PI / 2;
    const da = turn / n;
    for (let i = 0; i < n; i++) {
      const a = a0 + da * i, b = a0 + da * (i + 1);
      const poly = [{ x: Math.cos(a) * r0, y: Math.sin(a) * r0 }, { x: Math.cos(a) * R, y: Math.sin(a) * R }];
      const k = Math.max(2, Math.ceil((b - a) / (8 * DEG)));
      for (let j = 1; j <= k; j++) { const t = a + ((b - a) * j) / k; poly.push({ x: Math.cos(t) * R, y: Math.sin(t) * R }); }
      poly.push({ x: Math.cos(b) * r0, y: Math.sin(b) * r0 });
      steps.push(poly);
    }
    const rm = r0 + (R - r0) * 0.58;
    const m = Math.max(6, Math.ceil(turn / (6 * DEG)));
    for (let j = 0; j <= m; j++) { const t = a0 + da / 2 + ((turn - da) * j) / m; path.push({ x: Math.cos(t) * rm, y: Math.sin(t) * rm }); }
    return { steps, path, landing, pole: r0 };
  }
  return { steps, path, landing };
}
function stairInfo(it) {
  const H = climbHeight(it.lv);
  const n = Math.max(3, Math.round(it.n || 15));
  const m = stairModel(it);
  let L = 0; for (let i = 1; i < m.path.length; i++) L += vdist(m.path[i - 1], m.path[i]);
  const h = H / n;
  const g = L / Math.max(1, n - 1);
  const b = 2 * h + g;
  let verdict = 'ok', label = 'Confortable';
  if (b < 58 || b > 66 || h > 21) { verdict = 'bad'; label = h > 21 ? 'Trop raide' : 'Inconfortable'; }
  else if (b < 60 || b > 64 || h > 19) { verdict = 'warn'; label = 'Acceptable'; }
  return { H, n, h, g, b, verdict, label };
}
function drawStair(c, it, K, mode) {
  // mode : 'lower' (niveau de départ, avec coupe) | 'upper' (vu depuis l'étage) | 'full'
  const m = stairModel(it);
  const n = m.steps.length;
  const cut = mode === 'lower' ? Math.max(1, Math.ceil(n * 0.58)) : n;
  for (let i = 0; i < n; i++) {
    const s = m.steps[i];
    c.beginPath(); c.moveTo(s[0].x, s[0].y); for (let j = 1; j < s.length; j++) c.lineTo(s[j].x, s[j].y); c.closePath();
    if (mode === 'upper') { c.save(); c.strokeStyle = K.ink2; c.globalAlpha = 0.8; c.stroke(); c.restore(); continue; }
    if (i < cut) _fs(c, s === m.landing ? K.tone : K.fill);
    else { c.save(); _dash(c, K, 4, 3); c.strokeStyle = K.ink2; c.stroke(); c.restore(); }
  }
  if (m.pole) { _circ(c, 0, 0, m.pole); _fs(c, K.tone); }
  // ligne de foulée
  const pth = m.path;
  if (pth.length >= 2) {
    let endIdx = pth.length - 1;
    let pts = pth;
    if (mode === 'lower') {
      // couper la ligne de foulée au niveau de la coupe
      let total = 0; const seg = [];
      for (let i = 1; i < pth.length; i++) { const l = vdist(pth[i - 1], pth[i]); seg.push(l); total += l; }
      let target = total * (cut / n) - 4, acc = 0; pts = [pth[0]];
      for (let i = 1; i < pth.length; i++) {
        if (acc + seg[i - 1] >= target) { const t = (target - acc) / seg[i - 1]; pts.push({ x: pth[i - 1].x + (pth[i].x - pth[i - 1].x) * t, y: pth[i - 1].y + (pth[i].y - pth[i - 1].y) * t }); break; }
        acc += seg[i - 1]; pts.push(pth[i]);
      }
      endIdx = pts.length - 1;
    }
    c.save();
    c.strokeStyle = mode === 'upper' ? K.ink2 : K.ink;
    c.lineWidth = 1.1 * K.px;
    c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i].x, pts[i].y); c.stroke();
    const st = mode === 'upper' ? pts[endIdx] : pts[0];
    _circ(c, st.x, st.y, 3.2 * K.px * 1.4); c.fillStyle = c.strokeStyle; c.fill();
    const a = mode === 'upper' ? pts[1] : pts[endIdx - 1 >= 0 ? endIdx - 1 : 0], b = mode === 'upper' ? pts[0] : pts[endIdx];
    const dv = vnorm(vsub(b, a)), nv = vperp(dv), hl = 10 * K.px;
    c.beginPath(); c.moveTo(b.x, b.y); c.lineTo(b.x - dv.x * hl + nv.x * hl * 0.5, b.y - dv.y * hl + nv.y * hl * 0.5);
    c.lineTo(b.x - dv.x * hl - nv.x * hl * 0.5, b.y - dv.y * hl - nv.y * hl * 0.5); c.closePath(); c.fill();
    c.restore();
  }
  // trait de coupe
  if (mode === 'lower' && cut < n) {
    const s = m.steps[cut];
    const a = s[0], b = s[1];
    const mid = vmid(a, b), dv = vsub(b, a), nv = vnorm(vperp(dv));
    const z = Math.min(8, vlen(dv) * 0.08);
    c.save(); c.lineWidth = 1.3 * K.px; c.strokeStyle = K.ink;
    c.beginPath();
    const ext = vmul(vnorm(dv), 6);
    c.moveTo(a.x - ext.x, a.y - ext.y);
    const p1 = vadd(vadd(a, vmul(dv, 0.44)), vmul(nv, 0)), p2 = vadd(vadd(a, vmul(dv, 0.48)), vmul(nv, z)), p3 = vadd(vadd(a, vmul(dv, 0.52)), vmul(nv, -z)), p4 = vadd(a, vmul(dv, 0.56));
    c.lineTo(p1.x, p1.y); c.lineTo(p2.x, p2.y); c.lineTo(p3.x, p3.y); c.lineTo(p4.x, p4.y); c.lineTo(b.x + ext.x, b.y + ext.y);
    c.stroke(); c.restore();
    void mid;
  }
  if (mode === 'upper') {
    c.save(); _dash(c, K, 6, 4); c.strokeStyle = K.ink2;
    if (it.type === 'esc_helice') { _circ(c, 0, 0, Math.min(it.w, it.d) / 2 + 3); c.stroke(); }
    else { _r(c, -it.w / 2 - 3, -it.d / 2 - 3, it.w + 6, it.d + 6); c.stroke(); }
    c.restore();
  }
}

/* ---------------- électricité ----------------
   Repère : taille 1 = S_ELEC cm. Symboles muraux : mur à y = 0,
   la pièce vers +y. Symboles de plafond : centrés.               */
const S_ELEC = 30;
function _ePrise(c, K, opts) {
  opts = opts || {};
  c.beginPath();
  _ln(c, 0, 0, 0, 0.3);
  _ln(c, -0.32, 0.3, 0.32, 0.3);
  c.moveTo(0.32, 0.3); c.arc(0, 0.3, 0.32, 0, Math.PI);
  if (opts.fill) { c.save(); c.fillStyle = K.elec; c.fill(); c.restore(); }
  else { c.save(); c.fillStyle = K.bg; c.fill(); c.restore(); }
  if (opts.earth !== false) _ln(c, 0, 0.62, 0, 0.8);
  c.stroke();
}
function _eLabel(c, K, s, x, y, size, align) {
  if ((size * K.unit) / K.px < 5.5) return;
  c.save(); c.translate(x, y); if (K.flipText) c.rotate(Math.PI);
  c.scale(1 / K.unit, 1 / K.unit);
  c.font = `700 ${size * K.unit}px ${K.font}`; c.fillStyle = K.elec; c.textAlign = align || 'center'; c.textBaseline = 'middle';
  c.fillText(s, 0, 0); c.restore();
}
function _eSwitchBase(c, K) { c.beginPath(); _ln(c, 0, 0, 0, 0.28); c.stroke(); _circ(c, 0, 0.4, 0.12); _fs(c, K.bg); }
function _eLever(c, K, dx, dy, tickSign, r0) {
  const l = Math.hypot(dx, dy); dx /= l; dy /= l;
  const cx = 0, cy = 0.4, s0 = r0 || 0.12;
  const ex = cx + dx * 0.5, ey = cy + dy * 0.5;
  const tx = dy * tickSign, ty = -dx * tickSign;
  c.beginPath(); _ln(c, cx + dx * s0, cy + dy * s0, ex, ey); _ln(c, ex, ey, ex + tx * 0.14, ey + ty * 0.14); c.stroke();
}
function _eCross(c, x, y, r) { const k = r * 0.707; c.beginPath(); _ln(c, x - k, y - k, x + k, y + k); _ln(c, x + k, y - k, x - k, y + k); c.stroke(); }
function _eBox(c, K, x, y, w, h) { _r(c, x, y, w, h); _fs(c, K.bg); }
function _eFill(c, K) { c.fillStyle = K.elec; c.fill(); }
function _eStem(c, y1) { c.beginPath(); _ln(c, 0, 0, 0, y1); c.stroke(); }
/* prise de communication : demi-cercle sans terre + sigle */
function _eCom(c, K, s, size) { _ePrise(c, K, { earth: false }); _eLabel(c, K, s, 0, 0.45, size || 0.2); }
function _eMotor(c, K, x, y, r) { _circ(c, x, y, r); _fs(c, K.bg); _eLabel(c, K, 'M', x, y + 0.01, r * 1.1); }
function _eFan(c, x, y, r, n) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    c.beginPath(); c.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.45, r * 0.18, a, 0, Math.PI * 2); c.stroke();
  }
}
/* boîtier rond au mur avec sigle (détecteurs) */
function _eRoundTag(c, K, s, size) { _eStem(c, 0.14); _circ(c, 0, 0.42, 0.28); _fs(c, K.bg); _eLabel(c, K, s, 0, 0.43, size); }

const ELEC_CATS = [
  { id: 'prises', name: 'Prises' },
  { id: 'appareils', name: 'Électroménager' },
  { id: 'commandes', name: 'Commandes' },
  { id: 'eclairage', name: 'Éclairage' },
  { id: 'comm', name: 'Communication' },
  { id: 'tableau', name: 'Tableau & énergie' },
  { id: 'confort', name: 'Chauffage' },
  { id: 'ventilation', name: 'Ventilation (VMC)' },
  { id: 'moteurs', name: 'Moteurs & domotique' },
  { id: 'securite', name: 'Sécurité' },
  { id: 'acces', name: 'Accès & interphonie' },
  { id: 'alarme', name: 'Alarme & vidéo' },
];
const ELEC = [
  // prises
  { t: 'pc', cat: 'prises', n: 'Prise de courant 16 A', desc: 'Prise 2P+T 16 A, usage courant.', wall: 1, h: 30, draw(c, K) { _ePrise(c, K); } },
  { t: 'pc2', cat: 'prises', n: 'Prise double 16 A', desc: 'Bloc de deux prises 2P+T 16 A (compte pour 2 socles).', wall: 1, h: 30, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0, 0, 0.3); _ln(c, -0.46, 0.3, 0.46, 0.3);
    for (const x of [-0.22, 0.22]) { c.moveTo(x + 0.2, 0.3); c.arc(x, 0.3, 0.2, 0, Math.PI); }
    c.save(); c.fillStyle = K.bg; c.fill(); c.restore();
    _ln(c, -0.22, 0.5, -0.22, 0.64); _ln(c, 0.22, 0.5, 0.22, 0.64); c.stroke(); } },
  { t: 'pc3', cat: 'prises', n: 'Prise triple 16 A', desc: 'Bloc de trois prises 2P+T 16 A.', wall: 1, h: 30, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0, 0, 0.3); _ln(c, -0.48, 0.3, 0.48, 0.3);
    for (const x of [-0.31, 0, 0.31]) { c.moveTo(x + 0.15, 0.3); c.arc(x, 0.3, 0.15, 0, Math.PI); }
    c.save(); c.fillStyle = K.bg; c.fill(); c.restore();
    for (const x of [-0.31, 0, 0.31]) _ln(c, x, 0.45, x, 0.58); c.stroke(); } },
  { t: 'pc_pt', cat: 'prises', n: 'Prise plan de travail', desc: 'Prise 16 A au-dessus du plan de travail (cuisine).', wall: 1, h: 110, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'PT', 0.42, 0.55, 0.26, 'left'); } },
  { t: 'pc20', cat: 'prises', n: 'Prise spécialisée 20 A', desc: 'Circuit dédié 20 A : lave-linge, lave-vaisselle, four, sèche-linge.', wall: 1, h: 30, draw(c, K) { _ePrise(c, K); _eLabel(c, K, '20A', 0.42, 0.55, 0.26, 'left'); } },
  { t: 'pc32', cat: 'prises', n: 'Sortie 32 A (cuisson)', desc: 'Sortie de câble ou prise 32 A pour plaque de cuisson.', wall: 1, h: 20, draw(c, K) { _ePrise(c, K, { fill: true }); _eLabel(c, K, '32A', 0.42, 0.55, 0.26, 'left'); } },
  { t: 'pc_cmd', cat: 'prises', n: 'Prise commandée', desc: 'Prise 16 A pilotée par un interrupteur.', wall: 1, h: 30, draw(c, K) { _ePrise(c, K); c.beginPath(); _ln(c, -0.16, 0.06, 0.16, 0.22); c.stroke(); } },
  { t: 'pc_ip', cat: 'prises', n: 'Prise étanche (IP44)', desc: 'Prise protégée contre les projections : extérieur, salle de bain hors volumes.', wall: 1, h: 30, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'IP', 0.42, 0.55, 0.26, 'left'); } },
  { t: 'pc_usb', cat: 'prises', n: 'Prise USB', desc: 'Prise avec chargeur USB intégré.', wall: 1, h: 30, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'USB', 0.42, 0.55, 0.24, 'left'); } },
  { t: 'rj45', cat: 'comm', n: 'Prise RJ45', desc: 'Prise de communication (réseau, internet, téléphone).', wall: 1, h: 30, draw(c, K) { _ePrise(c, K, { earth: false }); _eLabel(c, K, 'RJ', 0, 0.45, 0.2); } },
  { t: 'tv', cat: 'comm', n: 'Prise TV', desc: 'Prise coaxiale télévision (antenne ou satellite).', wall: 1, h: 30, draw(c, K) { _ePrise(c, K, { earth: false }); _eLabel(c, K, 'TV', 0, 0.45, 0.2); } },
  // commandes
  { t: 'int_s', cat: 'commandes', n: 'Interrupteur simple allumage', desc: 'Commande un point lumineux depuis un seul endroit.', wall: 1, h: 110, draw(c, K) { _eSwitchBase(c, K); _eLever(c, K, 0.55, 0.835, 1); } },
  { t: 'int_d', cat: 'commandes', n: 'Interrupteur double allumage', desc: 'Commande deux circuits d’éclairage séparés.', wall: 1, h: 110, draw(c, K) { _eSwitchBase(c, K); _eLever(c, K, 0.55, 0.835, 1); _eLever(c, K, -0.55, 0.835, -1); } },
  { t: 'int_vv', cat: 'commandes', n: 'Interrupteur va-et-vient', desc: 'Commande un même éclairage depuis deux endroits (couloir, escalier).', wall: 1, h: 110, draw(c, K) { _eSwitchBase(c, K); _eLever(c, K, 0.8, 0.6, 1); _eLever(c, K, -0.8, -0.6, 1); } },
  { t: 'bp', cat: 'commandes', n: 'Bouton-poussoir', desc: 'Commande un télérupteur ou une minuterie (3 points de commande et plus).', wall: 1, h: 110, draw(c, K) { _eSwitchBase(c, K); _circ(c, 0, 0.4, 0.05); c.fillStyle = K.elec; c.fill(); } },
  { t: 'var', cat: 'commandes', n: 'Variateur', desc: 'Interrupteur qui règle l’intensité lumineuse.', wall: 1, h: 110, draw(c, K) { _eSwitchBase(c, K); _eLever(c, K, 0.55, 0.835, 1); c.beginPath(); _ln(c, -0.26, 0.66, 0.22, 0.18); c.stroke(); c.beginPath(); c.moveTo(0.22, 0.18); c.lineTo(0.1, 0.2); c.lineTo(0.2, 0.3); c.closePath(); c.fillStyle = K.elec; c.fill(); } },
  { t: 'det_pres', cat: 'commandes', n: 'Détecteur de présence', desc: 'Allume automatiquement l’éclairage au passage.', wall: 1, h: 220, draw(c, K) { c.beginPath(); c.moveTo(0.28, 0); c.arc(0, 0, 0.28, 0, Math.PI); _fs(c, K.bg); c.beginPath(); c.arc(0, 0, 0.42, 0.35 * Math.PI, 0.65 * Math.PI); c.stroke(); c.beginPath(); c.arc(0, 0, 0.56, 0.38 * Math.PI, 0.62 * Math.PI); c.stroke(); } },
  { t: 'cmd_vr', cat: 'commandes', n: 'Commande de volet roulant', desc: 'Inverseur montée / descente pour volet roulant électrique.', wall: 1, h: 110, draw(c, K) { _eBox(c, K, -0.2, 0.08, 0.4, 0.56); c.beginPath(); c.moveTo(0, 0.16); c.lineTo(0.11, 0.32); c.lineTo(-0.11, 0.32); c.closePath(); c.moveTo(0, 0.56); c.lineTo(0.11, 0.4); c.lineTo(-0.11, 0.4); c.closePath(); c.fillStyle = K.elec; c.fill(); } },
  { t: 'thermostat', cat: 'commandes', n: 'Thermostat d’ambiance', desc: 'Régule le chauffage de la pièce ou du logement.', wall: 1, h: 150, draw(c, K) { c.beginPath(); _ln(c, 0, 0, 0, 0.16); c.stroke(); _circ(c, 0, 0.42, 0.26); _fs(c, K.bg); _eLabel(c, K, 'T°', 0, 0.43, 0.22); } },
  // éclairage
  { t: 'pl', cat: 'eclairage', n: 'Point lumineux au plafond', desc: 'Point de centre (DCL) pour plafonnier ou suspension.', wall: 0, h: null, draw(c, K) { _circ(c, 0, 0, 0.3); _fs(c, K.bg); _eCross(c, 0, 0, 0.3); } },
  { t: 'applique', cat: 'eclairage', n: 'Applique murale', desc: 'Point lumineux fixé au mur (DCL en applique).', wall: 1, h: 180, draw(c, K) { c.beginPath(); _ln(c, 0, 0, 0, 0.18); c.stroke(); _circ(c, 0, 0.42, 0.24); _fs(c, K.bg); _eCross(c, 0, 0.42, 0.24); } },
  { t: 'spot', cat: 'eclairage', n: 'Spot encastré', desc: 'Spot encastré au plafond, souvent sur le même circuit que d’autres spots.', wall: 0, h: null, draw(c, K) { _circ(c, 0, 0, 0.17); _fs(c, K.bg); _eCross(c, 0, 0, 0.17); _circ(c, 0, 0, 0.05); c.fillStyle = K.elec; c.fill(); } },
  { t: 'reglette', cat: 'eclairage', n: 'Réglette / tube LED', desc: 'Luminaire linéaire (garage, cellier, sous meubles hauts).', wall: 0, h: null, draw(c, K) { _eBox(c, K, -0.6, -0.08, 1.2, 0.16); c.beginPath(); _ln(c, -0.6, -0.18, -0.6, 0.18); _ln(c, 0.6, -0.18, 0.6, 0.18); c.stroke(); } },
  { t: 'led', cat: 'eclairage', n: 'Ruban LED', desc: 'Éclairage d’appoint ou décoratif sur transformateur.', wall: 0, h: null, draw(c, K) { c.save(); c.setLineDash([0.08, 0.06]); c.beginPath(); _ln(c, -0.7, 0, 0.7, 0); c.stroke(); c.restore(); _eLabel(c, K, 'LED', 0, -0.2, 0.2); } },
  { t: 'hublot', cat: 'eclairage', n: 'Hublot / éclairage extérieur', desc: 'Luminaire étanche (extérieur, cave, garage).', wall: 1, h: 200, draw(c, K) { c.beginPath(); _ln(c, 0, 0, 0, 0.14); c.stroke(); _circ(c, 0, 0.42, 0.28); _fs(c, K.bg); _circ(c, 0, 0.42, 0.19); c.stroke(); _eCross(c, 0, 0.42, 0.19); } },
  // tableau & réseaux
  { t: 'tableau', cat: 'tableau', n: 'Tableau électrique', desc: 'Tableau de répartition : disjoncteurs divisionnaires et interrupteurs différentiels.', wall: 1, h: 130, draw(c, K) { _eBox(c, K, -0.7, 0, 1.4, 0.44); c.beginPath(); c.moveTo(-0.7, 0); c.lineTo(0.7, 0.44); c.lineTo(-0.7, 0.44); c.closePath(); c.fillStyle = K.elec; c.fill(); } },
  { t: 'db', cat: 'tableau', n: 'Disjoncteur de branchement', desc: 'Disjoncteur général (AGCP) en tête d’installation.', wall: 1, h: 130, draw(c, K) { _eBox(c, K, -0.36, 0, 0.72, 0.44); _eLabel(c, K, 'DB', 0, 0.23, 0.22); } },
  { t: 'compteur', cat: 'tableau', n: 'Compteur électrique', desc: 'Compteur du distributeur (Linky).', wall: 1, h: 130, draw(c, K) { _eBox(c, K, -0.4, 0, 0.8, 0.44); _eLabel(c, K, 'kWh', 0, 0.23, 0.2); } },
  { t: 'com', cat: 'comm', n: 'Coffret de communication', desc: 'Tableau de communication : box internet, répartiteur RJ45 et TV.', wall: 1, h: 130, draw(c, K) { _eBox(c, K, -0.5, 0, 1, 0.44); _eLabel(c, K, 'COM', 0, 0.23, 0.2); } },
  { t: 'derivation', cat: 'tableau', n: 'Boîte de dérivation', desc: 'Boîte de connexion des conducteurs.', wall: 0, h: null, draw(c, K) { _eBox(c, K, -0.13, -0.13, 0.26, 0.26); _circ(c, 0, 0, 0.05); c.fillStyle = K.elec; c.fill(); } },
  { t: 'derivation_mur', cat: 'tableau', n: 'Boîte de dérivation murale', desc: 'Boîte de connexion des conducteurs fixée au mur (hauteur de pose réglable).', wall: 1, h: 220, draw(c, K) { c.beginPath(); _ln(c, 0, 0, 0, 0.06); c.stroke(); _eBox(c, K, -0.13, 0.06, 0.26, 0.26); _circ(c, 0, 0.19, 0.05); c.fillStyle = K.elec; c.fill(); } },
  { t: 'sortie', cat: 'tableau', n: 'Sortie de câble', desc: 'Attente de câble pour un appareil raccordé en direct (hotte, chauffe-eau, volet).', wall: 1, h: 200, draw(c, K) { c.beginPath(); _ln(c, 0, 0, 0, 0.26); c.stroke(); _circ(c, 0, 0.4, 0.14); _fs(c, K.bg); c.beginPath(); _ln(c, 0.1, 0.5, 0.34, 0.74); c.stroke(); c.beginPath(); c.moveTo(0.38, 0.78); c.lineTo(0.22, 0.74); c.lineTo(0.34, 0.62); c.closePath(); c.fillStyle = K.elec; c.fill(); } },
  { t: 'borne_ve', cat: 'tableau', n: 'Borne de recharge véhicule', desc: 'Point de recharge pour véhicule électrique (IRVE).', wall: 1, h: 120, draw(c, K) { _eBox(c, K, -0.3, 0, 0.6, 0.56); c.beginPath(); c.moveTo(0.05, 0.08); c.lineTo(-0.12, 0.3); c.lineTo(0.02, 0.3); c.lineTo(-0.05, 0.5); c.lineTo(0.13, 0.24); c.lineTo(-0.01, 0.24); c.closePath(); c.fillStyle = K.elec; c.fill(); } },
  // chauffage & sécurité
  { t: 'daaf', cat: 'securite', n: 'Détecteur de fumée (DAAF)', desc: 'Détecteur avertisseur autonome de fumée, obligatoire dans chaque logement.', wall: 0, h: null, draw(c, K) { _circ(c, 0, 0, 0.3); _fs(c, K.bg); c.beginPath(); for (const x of [-0.12, 0, 0.12]) { c.moveTo(x, 0.16); c.quadraticCurveTo(x + 0.07, 0.06, x, -0.02); c.quadraticCurveTo(x - 0.07, -0.1, x, -0.18); } c.stroke(); } },
  { t: 'vmc', cat: 'ventilation', n: 'Bouche d’extraction VMC', desc: 'Bouche d’extraction de la ventilation mécanique : cuisine (Ø125), salle de bain, WC, cellier (Ø80).', wall: 0, h: null, draw(c, K) { _circ(c, 0, 0, 0.3); _fs(c, K.bg); _circ(c, 0, 0, 0.1); c.stroke(); c.beginPath(); for (let i = 0; i < 4; i++) { const a = (i + 0.5) * Math.PI / 2; _ln(c, Math.cos(a) * 0.1, Math.sin(a) * 0.1, Math.cos(a) * 0.3, Math.sin(a) * 0.3); } c.stroke(); } },
  { t: 'rad_elec', cat: 'confort', n: 'Radiateur électrique', desc: 'Convecteur, panneau rayonnant ou radiateur à inertie (fil pilote).', wall: 1, h: 20, draw(c, K) { _eBox(c, K, -0.62, 0.04, 1.24, 0.28); c.beginPath(); c.moveTo(-0.52, 0.18); for (let i = 0; i < 8; i++) c.lineTo(-0.52 + (i + 0.5) * 0.13, i % 2 ? 0.26 : 0.1); c.lineTo(0.52, 0.18); c.stroke(); } },
  { t: 'sortie_rad', cat: 'confort', n: 'Sortie de câble radiateur', desc: 'Attente de câble pour un radiateur raccordé en direct (phase, neutre, terre et fil pilote). Indiquez la puissance du radiateur.', wall: 1, h: 20, draw(c, K) { c.beginPath(); _ln(c, 0, 0, 0, 0.22); c.stroke(); _circ(c, 0, 0.36, 0.14); _fs(c, K.bg); c.beginPath(); c.moveTo(-0.1, 0.36); for (let i = 0; i < 4; i++) c.lineTo(-0.1 + (i + 0.5) * 0.05, i % 2 ? 0.42 : 0.3); c.lineTo(0.1, 0.36); c.stroke(); } },
  { t: 'seche_serv_e', cat: 'confort', n: 'Sèche-serviettes électrique', desc: 'Radiateur sèche-serviettes de salle de bain.', wall: 1, h: 60, draw(c, K) { _eBox(c, K, -0.32, 0.04, 0.64, 0.26); c.beginPath(); for (const x of [-0.16, 0, 0.16]) _ln(c, x, 0.04, x, 0.3); c.stroke(); } },
  { t: 'ce_elec', cat: 'confort', n: 'Chauffe-eau électrique', desc: 'Ballon d’eau chaude raccordé sur circuit dédié 20 A avec contacteur.', wall: 0, h: null, draw(c, K) { _circ(c, 0, 0, 0.32); _fs(c, K.bg); _eLabel(c, K, 'CE', 0, 0.01, 0.24); } },
  { t: 'sonnette', cat: 'acces', n: 'Sonnette / carillon', desc: 'Carillon d’entrée et son bouton.', wall: 1, h: 150, draw(c, K) { c.beginPath(); _ln(c, 0, 0, 0, 0.3); c.stroke(); c.beginPath(); c.moveTo(-0.24, 0.56); c.arc(0, 0.56, 0.24, Math.PI, 0); c.closePath(); _fs(c, K.bg); _circ(c, 0, 0.64, 0.05); c.fillStyle = K.elec; c.fill(); } },
  { t: 'interphone', cat: 'acces', n: 'Interphone / visiophone', desc: 'Poste intérieur relié à la platine de rue.', wall: 1, h: 150, draw(c, K) { _eBox(c, K, -0.25, 0, 0.5, 0.5); _r(c, -0.16, 0.08, 0.32, 0.18); c.stroke(); _circ(c, 0, 0.37, 0.06); c.stroke(); } },
  // alarme & vidéo
  { t: 'centrale', cat: 'alarme', n: 'Centrale d’alarme', desc: 'Unité centrale du système d’alarme.', wall: 1, h: 160, draw(c, K) { _eBox(c, K, -0.36, 0, 0.72, 0.46); _eLabel(c, K, 'CA', 0, 0.24, 0.22); } },
  { t: 'clavier', cat: 'alarme', n: 'Clavier d’alarme', desc: 'Clavier de mise en marche et d’arrêt.', wall: 1, h: 150, draw(c, K) { _eBox(c, K, -0.25, 0, 0.5, 0.5); c.fillStyle = K.elec; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { _circ(c, -0.12 + i * 0.12, 0.13 + j * 0.12, 0.03); c.fill(); } } },
  { t: 'det_ir', cat: 'alarme', n: 'Détecteur de mouvement', desc: 'Détecteur infrarouge passif (IRP) de l’alarme.', wall: 1, h: 220, draw(c, K) { c.beginPath(); c.moveTo(0.22, 0); c.arc(0, 0, 0.22, 0, Math.PI); c.closePath(); c.fillStyle = K.elec; c.fill(); c.beginPath(); c.arc(0, 0, 0.38, 0.3 * Math.PI, 0.7 * Math.PI); c.stroke(); c.beginPath(); c.arc(0, 0, 0.54, 0.34 * Math.PI, 0.66 * Math.PI); c.stroke(); } },
  { t: 'det_ouv', cat: 'alarme', n: 'Détecteur d’ouverture', desc: 'Contact magnétique sur porte ou fenêtre.', wall: 1, h: 200, draw(c, K) { _eBox(c, K, -0.32, 0.06, 0.26, 0.16); _r(c, 0.06, 0.06, 0.26, 0.16); c.fillStyle = K.elec; c.fill(); c.stroke(); } },
  { t: 'sirene', cat: 'alarme', n: 'Sirène intérieure', desc: 'Sirène d’alarme intérieure.', wall: 1, h: 220, draw(c, K) { c.beginPath(); c.moveTo(-0.12, 0.04); c.lineTo(0.12, 0.04); c.lineTo(0.3, 0.5); c.lineTo(-0.3, 0.5); c.closePath(); _fs(c, K.bg); } },
  { t: 'sirene_ext', cat: 'alarme', n: 'Sirène extérieure à flash', desc: 'Sirène extérieure avec flash lumineux.', wall: 1, h: 250, draw(c, K) { c.beginPath(); c.moveTo(-0.12, 0.04); c.lineTo(0.12, 0.04); c.lineTo(0.3, 0.5); c.lineTo(-0.3, 0.5); c.closePath(); c.fillStyle = K.elec; c.fill(); c.stroke(); c.beginPath(); _ln(c, -0.4, 0.62, -0.5, 0.72); _ln(c, 0, 0.62, 0, 0.78); _ln(c, 0.4, 0.62, 0.5, 0.72); c.stroke(); } },
  { t: 'camera', cat: 'alarme', n: 'Caméra', desc: 'Caméra de vidéosurveillance (IP ou analogique).', wall: 1, h: 250, draw(c, K) { c.beginPath(); _ln(c, 0, 0, 0, 0.12); c.stroke(); _eBox(c, K, -0.16, 0.12, 0.32, 0.3); c.beginPath(); c.moveTo(-0.12, 0.42); c.lineTo(0.12, 0.42); c.lineTo(0.24, 0.62); c.lineTo(-0.24, 0.62); c.closePath(); _fs(c, K.bg); } },
  /* ---- prises (suite) ---- */
  { t: 'pc4', cat: 'prises', n: 'Prise quadruple 16 A', desc: 'Bloc de quatre prises 2P+T 16 A (compte pour 4 socles).', wall: 1, h: 30, bw: 0.64, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0, 0, 0.3); _ln(c, -0.6, 0.3, 0.6, 0.3);
    for (const x of [-0.45, -0.15, 0.15, 0.45]) { c.moveTo(x + 0.14, 0.3); c.arc(x, 0.3, 0.14, 0, Math.PI); }
    c.save(); c.fillStyle = K.bg; c.fill(); c.restore();
    for (const x of [-0.45, -0.15, 0.15, 0.45]) _ln(c, x, 0.44, x, 0.56); c.stroke(); } },
  { t: 'pc_hotte', cat: 'prises', n: 'Prise de hotte', desc: 'Prise 16 A posée à 1,80 m pour la hotte : la seule prise admise au-dessus de la plaque de cuisson.', wall: 1, h: 180, side: 1, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'H', 0.42, 0.55, 0.26, 'left'); } },
  { t: 'pc_rasoir', cat: 'prises', n: 'Prise rasoir', desc: 'Prise à transformateur de séparation, admise dans le volume 2 de la salle de bain.', wall: 1, h: 110, side: 1, draw(c, K) { _ePrise(c, K, { earth: false }); _circ(c, 0.5, 0.5, 0.1); c.stroke(); _circ(c, 0.66, 0.5, 0.1); c.stroke(); } },
  { t: 'pc_sol', cat: 'prises', n: 'Prise de sol', desc: 'Boîtier de sol avec prise 16 A, pour un îlot ou un bureau au milieu d’une pièce.', wall: 0, h: null, floor: 1, draw(c, K) {
    _eBox(c, K, -0.3, -0.3, 0.6, 0.6);
    c.beginPath(); _ln(c, 0, -0.22, 0, -0.1); _ln(c, -0.18, -0.1, 0.18, -0.1); c.moveTo(0.18, -0.1); c.arc(0, -0.1, 0.18, 0, Math.PI); _ln(c, 0, 0.08, 0, 0.2); c.stroke(); } },
  { t: 'pc_2p', cat: 'prises', n: 'Prise 2P sans terre', desc: 'Prise sans contact de terre : interdite en installation neuve.', wall: 1, h: 30, side: 1, draw(c, K) { _ePrise(c, K, { earth: false }); _eLabel(c, K, '2P', 0.42, 0.55, 0.24, 'left'); } },
  { t: 'pc_tri', cat: 'prises', n: 'Prise triphasée 3P+N+T', desc: 'Prise 400 V pour une machine triphasée (atelier). Nécessite un abonnement triphasé.', wall: 1, h: 30, side: 1, draw(c, K) { _ePrise(c, K); _eLabel(c, K, '3~', 0.42, 0.55, 0.26, 'left'); } },
  { t: 'prise_ve', cat: 'prises', n: 'Prise renforcée véhicule', desc: 'Prise 16 A renforcée sur circuit dédié, pour la recharge lente d’un véhicule électrique.', wall: 1, h: 100, side: 1, draw(c, K) { _ePrise(c, K, { fill: true }); _eLabel(c, K, 'VE', 0.42, 0.55, 0.26, 'left'); } },
  /* ---- communication ---- */
  { t: 'rj45_2', cat: 'comm', n: 'Prise RJ45 double', desc: 'Deux prises réseau dans le même boîtier.', wall: 1, h: 30, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0, 0, 0.3); _ln(c, -0.46, 0.3, 0.46, 0.3);
    for (const x of [-0.22, 0.22]) { c.moveTo(x + 0.2, 0.3); c.arc(x, 0.3, 0.2, 0, Math.PI); }
    c.save(); c.fillStyle = K.bg; c.fill(); c.restore(); c.stroke();
    _eLabel(c, K, 'RJ', -0.22, 0.4, 0.13); _eLabel(c, K, 'RJ', 0.22, 0.4, 0.13); } },
  { t: 'sat', cat: 'comm', n: 'Prise satellite', desc: 'Prise coaxiale reliée à la parabole (TV-SAT).', wall: 1, h: 30, draw(c, K) { _eCom(c, K, 'SAT', 0.15); } },
  { t: 'fibre', cat: 'comm', n: 'Prise fibre optique (PTO)', desc: 'Point de terminaison optique, où arrive la fibre de l’opérateur, près de la box.', wall: 1, h: 30, draw(c, K) { _eCom(c, K, 'FO'); } },
  { t: 'tel', cat: 'comm', n: 'Prise téléphone', desc: 'Conjoncteur téléphonique en T ou prise RJ11.', wall: 1, h: 30, draw(c, K) { _eCom(c, K, 'T', 0.22); } },
  { t: 'hdmi', cat: 'comm', n: 'Prise HDMI / multimédia', desc: 'Plastron multimédia : HDMI, USB, audio.', wall: 1, h: 30, draw(c, K) { _eCom(c, K, 'HD', 0.18); } },
  { t: 'hp', cat: 'comm', n: 'Haut-parleur', desc: 'Enceinte encastrée au plafond ou prise haut-parleur.', wall: 0, h: null, draw(c, K) {
    _eBox(c, K, -0.24, -0.12, 0.14, 0.24); c.beginPath(); c.moveTo(-0.1, -0.12); c.lineTo(0.16, -0.3); c.lineTo(0.16, 0.3); c.lineTo(-0.1, 0.12); c.closePath(); _fs(c, K.bg); } },
  { t: 'wifi', cat: 'comm', n: 'Point d’accès Wi-Fi', desc: 'Borne Wi-Fi au plafond ou au mur, alimentée par le câble réseau (PoE).', wall: 0, h: null, draw(c, K) {
    _circ(c, 0, 0.14, 0.06); _eFill(c, K);
    for (const r of [0.2, 0.34]) { c.beginPath(); c.arc(0, 0.14, r, 1.22 * Math.PI, 1.78 * Math.PI); c.stroke(); } } },
  /* ---- commandes (suite) ---- */
  { t: 'int_bip', cat: 'commandes', n: 'Interrupteur bipolaire', desc: 'Coupe la phase et le neutre en même temps (appareil fixe, extérieur).', wall: 1, h: 110, draw(c, K) {
    _eSwitchBase(c, K); _eLever(c, K, 0.55, 0.835, 1);
    const l = Math.hypot(0.55, 0.835), dx = 0.55 / l, dy = 0.835 / l, x = dx * 0.37, y = 0.4 + dy * 0.37;
    c.beginPath(); _ln(c, x, y, x + dy * 0.14, y - dx * 0.14); c.stroke(); } },
  { t: 'int_voy', cat: 'commandes', n: 'Interrupteur à voyant', desc: 'Interrupteur avec témoin lumineux, utile quand l’éclairage commandé n’est pas visible (cave, extérieur, combles).', wall: 1, h: 110, draw(c, K) {
    _eStem(c, 0.24); _circ(c, 0, 0.4, 0.16); _fs(c, K.bg); _eCross(c, 0, 0.4, 0.16); _eLever(c, K, 0.55, 0.835, 1, 0.16); } },
  { t: 'permut', cat: 'commandes', n: 'Permutateur', desc: 'Point de commande intermédiaire entre deux va-et-vient : le même éclairage se commande depuis 3 endroits ou plus.', wall: 1, h: 110, draw(c, K) {
    _eSwitchBase(c, K); _eLever(c, K, 0.8, 0.6, 1); _eLever(c, K, -0.8, -0.6, 1); _eLever(c, K, -0.8, 0.6, -1); _eLever(c, K, 0.8, -0.6, -1); } },
  { t: 'bp_voy', cat: 'commandes', n: 'Bouton-poussoir lumineux', desc: 'Bouton-poussoir avec voyant, repérable dans le noir (couloir, escalier sur minuterie).', wall: 1, h: 110, draw(c, K) {
    _eStem(c, 0.2); _circ(c, 0, 0.4, 0.2); _fs(c, K.bg); _eCross(c, 0, 0.4, 0.2); _circ(c, 0, 0.4, 0.06); _eFill(c, K); } },
  { t: 'int_radio', cat: 'commandes', n: 'Interrupteur sans fil', desc: 'Commande radio à pile ou autonome, avec un récepteur près du point lumineux.', wall: 1, h: 110, draw(c, K) {
    _eSwitchBase(c, K); _eLever(c, K, 0.55, 0.835, 1);
    for (const r of [0.22, 0.34]) { c.beginPath(); c.arc(0, 0.4, r, 0.8 * Math.PI, 1.12 * Math.PI); c.stroke(); } } },
  { t: 'int_ip', cat: 'commandes', n: 'Interrupteur étanche', desc: 'Interrupteur protégé contre les projections d’eau (extérieur, garage, cave).', wall: 1, h: 110, draw(c, K) {
    _eSwitchBase(c, K); _eLever(c, K, 0.55, 0.835, 1); _eLabel(c, K, 'IP', -0.2, 0.52, 0.22, 'right'); } },
  { t: 'det_plaf', cat: 'commandes', n: 'Détecteur de présence plafond', desc: 'Détecteur 360° posé au plafond : allume selon la présence et la luminosité.', wall: 0, h: null, draw(c, K) {
    _circ(c, 0, 0, 0.3); _fs(c, K.bg);
    c.beginPath(); c.moveTo(-0.15, 0.06); c.arc(0, 0.06, 0.15, Math.PI, 0); c.closePath(); _eFill(c, K);
    for (const [a, b] of [[1.1, 1.4], [1.6, 1.9]]) { c.beginPath(); c.arc(0, 0, 0.4, a * Math.PI, b * Math.PI); c.stroke(); } } },
  { t: 'int_crep', cat: 'commandes', n: 'Interrupteur crépusculaire', desc: 'Cellule qui allume l’éclairage extérieur à la tombée de la nuit.', wall: 1, h: 220, draw(c, K) {
    _eStem(c, 0.22); _circ(c, 0, 0.42, 0.2); _fs(c, K.bg);
    c.beginPath(); c.moveTo(0, 0.22); c.arc(0, 0.42, 0.2, -Math.PI / 2, Math.PI / 2, true); c.closePath(); _eFill(c, K);
    c.beginPath(); for (const a of [-0.45, 0, 0.45]) _ln(c, 0.27 * Math.cos(a), 0.42 + 0.27 * Math.sin(a), 0.4 * Math.cos(a), 0.42 + 0.4 * Math.sin(a)); c.stroke(); } },
  { t: 'horloge', cat: 'commandes', n: 'Interrupteur horaire', desc: 'Programmateur qui commande un circuit à heures fixes (éclairage extérieur, pompe).', wall: 1, h: 130, draw(c, K) {
    _eStem(c, 0.2); _circ(c, 0, 0.42, 0.22); _fs(c, K.bg); c.beginPath(); _ln(c, 0, 0.42, 0, 0.28); _ln(c, 0, 0.42, 0.11, 0.49); c.stroke(); } },
  { t: 'cmd_vr_c', cat: 'commandes', n: 'Commande centralisée des volets', desc: 'Commande générale ou programmable qui pilote tous les volets roulants.', wall: 1, h: 110, draw(c, K) {
    _eBox(c, K, -0.32, 0.08, 0.64, 0.56); c.fillStyle = K.elec;
    for (const x of [-0.13, 0.13]) { c.beginPath(); c.moveTo(x, 0.16); c.lineTo(x + 0.1, 0.31); c.lineTo(x - 0.1, 0.31); c.closePath(); c.moveTo(x, 0.56); c.lineTo(x + 0.1, 0.41); c.lineTo(x - 0.1, 0.41); c.closePath(); c.fill(); } } },
  { t: 'bouton_scen', cat: 'commandes', n: 'Bouton de scénario', desc: 'Commande domotique : un appui lance un scénario (tout éteindre, départ, nuit).', wall: 1, h: 110, draw(c, K) {
    _eBox(c, K, -0.25, 0.04, 0.5, 0.5); c.fillStyle = K.elec;
    for (const [x, y] of [[-0.1, 0.19], [0.1, 0.19], [-0.1, 0.39], [0.1, 0.39]]) { _r(c, x - 0.06, y - 0.06, 0.12, 0.12); c.fill(); } } },
  /* ---- éclairage (suite) ---- */
  { t: 'projecteur', cat: 'eclairage', n: 'Projecteur', desc: 'Projecteur orientable pour façade, jardin ou atelier.', wall: 1, h: 250, draw(c, K) {
    _eStem(c, 0.14); _circ(c, 0, 0.32, 0.18); _fs(c, K.bg); _eCross(c, 0, 0.32, 0.18);
    c.beginPath(); _ln(c, -0.12, 0.48, -0.3, 0.8); _ln(c, 0.12, 0.48, 0.3, 0.8); c.stroke(); } },
  { t: 'proj_det', cat: 'eclairage', n: 'Projecteur à détecteur', desc: 'Projecteur extérieur qui s’allume au passage.', wall: 1, h: 250, draw(c, K) {
    _eStem(c, 0.14); _circ(c, 0, 0.32, 0.18); _fs(c, K.bg); _eCross(c, 0, 0.32, 0.18);
    c.beginPath(); _ln(c, -0.12, 0.48, -0.3, 0.8); _ln(c, 0.12, 0.48, 0.3, 0.8); c.stroke();
    c.beginPath(); c.moveTo(-0.3, 0); c.arc(-0.44, 0, 0.14, 0, Math.PI); c.closePath(); _eFill(c, K);
    c.beginPath(); c.arc(-0.44, 0, 0.25, 0.3 * Math.PI, 0.7 * Math.PI); c.stroke(); } },
  { t: 'borne_ext', cat: 'eclairage', n: 'Borne / balise extérieure', desc: 'Borne ou balise d’éclairage pour une allée ou un jardin.', wall: 0, h: null, floor: 1, draw(c, K) {
    _r(c, -0.26, -0.26, 0.52, 0.52); _fs(c, K.bg); _circ(c, 0, 0, 0.16); _fs(c, K.bg); _eCross(c, 0, 0, 0.16); } },
  { t: 'dalle_led', cat: 'eclairage', n: 'Dalle LED', desc: 'Panneau lumineux 60 × 60 encastré ou en saillie.', wall: 0, h: null, bw: 0.42, draw(c, K) {
    _eBox(c, K, -0.36, -0.36, 0.72, 0.72); _r(c, -0.26, -0.26, 0.52, 0.52); c.stroke(); _eCross(c, 0, 0, 0.36); } },
  { t: 'rail_spot', cat: 'eclairage', n: 'Rail de spots', desc: 'Rail électrifié avec plusieurs spots orientables.', wall: 0, h: null, bw: 0.76, draw(c, K) {
    c.save(); c.lineWidth *= 2.2; c.beginPath(); _ln(c, -0.72, 0, 0.72, 0); c.stroke(); c.restore();
    for (const x of [-0.45, 0, 0.45]) { _circ(c, x, 0.16, 0.12); _fs(c, K.bg); _eCross(c, x, 0.16, 0.12); } } },
  { t: 'miroir', cat: 'eclairage', n: 'Éclairage de miroir', desc: 'Applique ou réglette au-dessus du miroir de la salle de bain.', wall: 1, h: 190, bw: 0.6, draw(c, K) {
    _eStem(c, 0.1); _eBox(c, K, -0.56, 0.1, 1.12, 0.2); for (const x of [-0.34, 0, 0.34]) _eCross(c, x, 0.2, 0.1); } },
  { t: 'veilleuse', cat: 'eclairage', n: 'Veilleuse / balisage', desc: 'Petit point lumineux encastré (escalier, couloir, chambre d’enfant).', wall: 1, h: 30, draw(c, K) {
    _eStem(c, 0.22); _circ(c, 0, 0.36, 0.14); _fs(c, K.bg); c.beginPath(); c.moveTo(-0.14, 0.36); c.arc(0, 0.36, 0.14, Math.PI, 0, true); c.closePath(); _eFill(c, K); } },
  /* ---- tableau & énergie (suite) ---- */
  { t: 'tab_div', cat: 'tableau', n: 'Tableau divisionnaire', desc: 'Tableau secondaire alimenté depuis le tableau principal (garage, atelier, dépendance).', wall: 1, h: 130, bw: 0.72, draw(c, K) {
    _eBox(c, K, -0.7, 0, 1.4, 0.44);
    c.save(); c.beginPath(); c.moveTo(-0.7, 0); c.lineTo(0.7, 0.44); c.lineTo(-0.7, 0.44); c.closePath(); c.clip();
    c.beginPath(); for (let x = -1; x < 0.8; x += 0.13) _ln(c, x, 0.44, x + 0.3, 0); c.stroke(); c.restore();
    c.beginPath(); _ln(c, -0.7, 0, 0.7, 0.44); c.stroke(); } },
  { t: 'ccpi', cat: 'tableau', n: 'Coffret de coupure (CCPI)', desc: 'Coffret en limite de propriété où le réseau du distributeur arrive (coupe-circuit principal).', wall: 1, h: 100, draw(c, K) { _eBox(c, K, -0.42, 0, 0.84, 0.44); _eLabel(c, K, 'CCPI', 0, 0.23, 0.18); } },
  { t: 'gtl', cat: 'tableau', n: 'Gaine technique logement (GTL)', desc: 'Regroupe le tableau électrique et le coffret de communication, du sol au plafond. Obligatoire en logement neuf.', wall: 1, h: null, fullH: 1, bw: 0.64, draw(c, K) { _eBox(c, K, -0.6, 0, 1.2, 0.3); _eLabel(c, K, 'GTL', 0, 0.16, 0.18); } },
  { t: 'traversee', cat: 'tableau', n: 'Passage entre étages', desc: 'Traversée de plancher (fourreau, trémie) : relie les gaines d’un niveau à celles d’un autre niveau.', wall: 0, h: null, draw(c, K) {
    _circ(c, 0, 0, 0.26); _fs(c, K.bg); c.beginPath(); _ln(c, 0, -0.17, 0, 0.17); c.stroke();
    c.beginPath(); c.moveTo(0, -0.2); c.lineTo(-0.09, -0.08); c.lineTo(0.09, -0.08); c.closePath(); c.moveTo(0, 0.2); c.lineTo(-0.09, 0.08); c.lineTo(0.09, 0.08); c.closePath(); c.fillStyle = K.elec; c.fill(); } },
  { t: 'terre', cat: 'tableau', n: 'Prise de terre', desc: 'Piquet ou boucle à fond de fouille, relié à la barrette de terre du tableau.', wall: 0, h: null, floor: 1, draw(c, K) {
    c.beginPath(); _ln(c, 0, -0.3, 0, 0); _ln(c, -0.3, 0, 0.3, 0); _ln(c, -0.19, 0.11, 0.19, 0.11); _ln(c, -0.08, 0.22, 0.08, 0.22); c.stroke(); } },
  { t: 'les', cat: 'tableau', n: 'Liaison équipotentielle', desc: 'Relie à la terre les éléments métalliques (canalisations, huisseries, baignoire métallique).', wall: 1, h: 30, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0, 0, 0.3); _ln(c, -0.24, 0.3, 0.24, 0.3); _ln(c, -0.15, 0.4, 0.15, 0.4); _ln(c, -0.06, 0.5, 0.06, 0.5); c.stroke(); _eLabel(c, K, 'LES', 0.3, 0.16, 0.18, 'left'); } },
  { t: 'onduleur', cat: 'tableau', n: 'Onduleur photovoltaïque', desc: 'Convertit le courant continu des panneaux solaires en 230 V, sur circuit dédié.', wall: 1, h: 150, draw(c, K) {
    _eBox(c, K, -0.28, 0.04, 0.56, 0.56);
    c.beginPath(); _ln(c, -0.28, 0.6, 0.28, 0.04); _ln(c, -0.2, 0.16, -0.04, 0.16); _ln(c, -0.2, 0.22, -0.04, 0.22);
    c.moveTo(0.04, 0.46); c.quadraticCurveTo(0.085, 0.38, 0.13, 0.46); c.quadraticCurveTo(0.175, 0.54, 0.22, 0.46); c.stroke(); } },
  { t: 'panneau_pv', cat: 'tableau', n: 'Panneaux photovoltaïques', desc: 'Champ de modules solaires (toiture, carport, au sol).', wall: 0, h: null, bw: 0.62, draw(c, K) {
    _eBox(c, K, -0.6, -0.32, 1.2, 0.64); c.beginPath(); for (const x of [-0.2, 0.2]) _ln(c, x, -0.32, x, 0.32); _ln(c, -0.6, 0, 0.6, 0); c.stroke(); } },
  { t: 'batterie', cat: 'tableau', n: 'Batterie de stockage', desc: 'Stockage d’énergie (solaire ou secours), avec sa propre protection.', wall: 1, h: 30, draw(c, K) {
    _eBox(c, K, -0.32, 0.04, 0.64, 0.44); _eStem(c, 0); c.beginPath(); _ln(c, -0.06, 0.13, -0.06, 0.39); c.stroke();
    c.save(); c.lineWidth *= 2.4; c.beginPath(); _ln(c, 0.07, 0.19, 0.07, 0.33); c.stroke(); c.restore();
    _eLabel(c, K, '+', -0.19, 0.26, 0.17); _eLabel(c, K, '−', 0.2, 0.26, 0.17); } },
  { t: 'groupe', cat: 'tableau', n: 'Groupe électrogène', desc: 'Source de secours, à raccorder par un inverseur de source.', wall: 0, h: null, floor: 1, draw(c, K) {
    _circ(c, 0, 0, 0.3); _fs(c, K.bg); _eLabel(c, K, 'G', 0, -0.06, 0.24);
    c.beginPath(); c.moveTo(-0.11, 0.14); c.quadraticCurveTo(-0.055, 0.06, 0, 0.14); c.quadraticCurveTo(0.055, 0.22, 0.11, 0.14); c.stroke(); } },
  { t: 'inverseur', cat: 'tableau', n: 'Inverseur de source', desc: 'Bascule entre le réseau et une source de secours (groupe, batterie) sans jamais les coupler.', wall: 1, h: 130, draw(c, K) {
    _eBox(c, K, -0.36, 0, 0.72, 0.52);
    c.beginPath(); _ln(c, -0.18, 0.08, -0.18, 0.18); _ln(c, 0.18, 0.08, 0.18, 0.18); _ln(c, 0, 0.44, 0, 0.34); _ln(c, 0, 0.34, -0.17, 0.2); c.stroke();
    _circ(c, 0.18, 0.19, 0.03); _eFill(c, K); } },
  { t: 'transfo', cat: 'tableau', n: 'Transformateur TBTS', desc: 'Abaisse la tension en 12 ou 24 V pour un éclairage ou un équipement très basse tension.', wall: 0, h: null, draw(c, K) {
    _circ(c, -0.1, 0, 0.18); _fs(c, K.bg); _circ(c, 0.1, 0, 0.18); c.stroke(); } },
  /* ---- chauffage & ventilation (suite) ---- */
  { t: 'plancher', cat: 'confort', n: 'Plancher chauffant électrique', desc: 'Câble ou trame chauffante dans la dalle, piloté par thermostat.', wall: 0, h: null, floor: 1, bw: 0.64, draw(c, K) {
    c.save(); c.setLineDash([0.07, 0.05]); _r(c, -0.6, -0.34, 1.2, 0.68); c.stroke(); c.restore();
    c.beginPath(); let y = -0.22; c.moveTo(-0.48, y);
    for (let i = 0; i < 5; i++) { const x = -0.48 + i * 0.24; c.lineTo(x, y); y = -y; c.lineTo(x, y); if (i < 4) c.lineTo(x + 0.24, y); }
    c.stroke(); } },
  { t: 'pac', cat: 'confort', n: 'Pompe à chaleur (unité extérieure)', desc: 'Groupe extérieur de pompe à chaleur sur circuit dédié (différentiel type F conseillé).', wall: 1, h: 30, bw: 0.55, draw(c, K) {
    _eBox(c, K, -0.5, 0.04, 1, 0.5); _circ(c, -0.2, 0.29, 0.17); c.stroke(); _eFan(c, -0.2, 0.29, 0.15, 3); _eLabel(c, K, 'PAC', 0.22, 0.3, 0.17); } },
  { t: 'clim', cat: 'confort', n: 'Climatiseur (unité intérieure)', desc: 'Split mural de climatisation ou de pompe à chaleur air/air.', wall: 1, h: 220, bw: 0.6, draw(c, K) {
    _eBox(c, K, -0.56, 0.04, 1.12, 0.26); _eLabel(c, K, 'CLIM', 0, 0.17, 0.15);
    c.beginPath(); for (const x of [-0.3, 0, 0.3]) { _ln(c, x, 0.4, x, 0.62); _ln(c, x - 0.06, 0.55, x, 0.62); _ln(c, x + 0.06, 0.55, x, 0.62); } c.stroke(); } },
  { t: 'vmc_groupe', cat: 'ventilation', n: 'Groupe VMC simple flux', desc: 'Caisson moteur de la ventilation (combles, cellier), sur son circuit protégé à 2 A.', wall: 0, h: null, draw(c, K) {
    _eBox(c, K, -0.34, -0.34, 0.68, 0.68); _circ(c, 0, 0, 0.24); c.stroke(); _eFan(c, 0, 0, 0.21, 3); } },
  { t: 'extracteur', cat: 'ventilation', n: 'Aérateur / extracteur', desc: 'Ventilateur ponctuel (WC, salle d’eau), souvent commandé avec l’éclairage.', wall: 1, h: 200, draw(c, K) {
    _eStem(c, 0.14); _circ(c, 0, 0.4, 0.26); _fs(c, K.bg); _eFan(c, 0, 0.4, 0.22, 3); } },
  { t: 'ventilo', cat: 'confort', n: 'Ventilateur de plafond', desc: 'Ventilateur suspendu au plafond, avec ou sans luminaire.', wall: 0, h: null, draw(c, K) {
    _eFan(c, 0, 0, 0.38, 4); _circ(c, 0, 0, 0.07); _fs(c, K.bg); } },
  { t: 'chaudiere_e', cat: 'confort', n: 'Chaudière (raccordement)', desc: 'Alimentation électrique d’une chaudière gaz, fioul ou granulés, sur circuit dédié.', wall: 1, h: 150, draw(c, K) {
    _eBox(c, K, -0.3, 0.04, 0.6, 0.56);
    c.beginPath(); c.moveTo(0, 0.14); c.quadraticCurveTo(0.17, 0.32, 0.09, 0.5); c.quadraticCurveTo(0, 0.42, -0.09, 0.5); c.quadraticCurveTo(-0.17, 0.32, 0, 0.14); c.closePath(); _eFill(c, K); } },
  /* ---- moteurs & domotique ---- */
  { t: 'volet_mot', cat: 'moteurs', n: 'Volet roulant motorisé', desc: 'Moteur tubulaire du volet roulant, piloté par sa commande.', wall: 1, h: 230, bw: 0.6, draw(c, K) {
    _eBox(c, K, -0.56, 0.04, 1.12, 0.3); c.beginPath(); _ln(c, -0.5, 0.14, 0.18, 0.14); _ln(c, -0.5, 0.24, 0.18, 0.24); c.stroke(); _eMotor(c, K, 0.38, 0.19, 0.12); } },
  { t: 'portail', cat: 'moteurs', n: 'Motorisation de portail', desc: 'Moteur de portail battant ou coulissant, avec ses photocellules.', wall: 0, h: null, floor: 1, draw(c, K) {
    c.beginPath(); _ln(c, -0.4, 0.2, 0.4, 0.2); for (const x of [-0.3, -0.1, 0.1, 0.3]) _ln(c, x, 0.2, x, 0.36); c.stroke(); _eMotor(c, K, 0, -0.1, 0.19); } },
  { t: 'garage_mot', cat: 'moteurs', n: 'Motorisation de porte de garage', desc: 'Moteur de porte sectionnelle ou basculante, fixé au plafond du garage.', wall: 0, h: null, draw(c, K) {
    _eBox(c, K, -0.36, -0.28, 0.72, 0.5); _eMotor(c, K, 0, -0.03, 0.16); c.beginPath(); _ln(c, -0.3, 0.34, 0.3, 0.34); c.stroke(); } },
  { t: 'store', cat: 'moteurs', n: 'Store banne motorisé', desc: 'Store extérieur à moteur (un capteur de vent est conseillé).', wall: 1, h: 250, bw: 0.62, draw(c, K) {
    c.beginPath(); c.moveTo(-0.5, 0.04); c.lineTo(0.5, 0.04); c.lineTo(0.6, 0.6); c.lineTo(-0.6, 0.6); c.closePath(); _fs(c, K.bg);
    c.beginPath(); for (const x of [-0.2, 0.05, 0.3]) _ln(c, x * 0.95, 0.04, x * 1.15, 0.6); c.stroke(); _eMotor(c, K, -0.32, 0.22, 0.11); } },
  { t: 'pompe', cat: 'moteurs', n: 'Pompe', desc: 'Pompe de relevage, de puits, de piscine ou de récupération d’eau.', wall: 0, h: null, floor: 1, draw(c, K) {
    _circ(c, 0, 0, 0.28); _fs(c, K.bg); c.beginPath(); c.moveTo(-0.15, -0.22); c.lineTo(0.28, 0); c.lineTo(-0.15, 0.22); c.stroke(); } },
  { t: 'moteur', cat: 'moteurs', n: 'Moteur / machine fixe', desc: 'Moteur ou machine fixe : compresseur, scie, tour d’atelier.', wall: 0, h: null, floor: 1, draw(c, K) { _eMotor(c, K, 0, 0, 0.3); } },
  { t: 'domo', cat: 'moteurs', n: 'Box ou écran domotique', desc: 'Centrale domotique ou écran de commande de la maison connectée.', wall: 1, h: 150, draw(c, K) {
    _eBox(c, K, -0.3, 0.02, 0.6, 0.46); _r(c, -0.22, 0.09, 0.44, 0.24); c.stroke(); _circ(c, 0, 0.4, 0.035); _eFill(c, K); } },
  /* ---- sécurité ---- */
  { t: 'det_co', cat: 'securite', n: 'Détecteur de monoxyde de carbone', desc: 'Alarme autonome près d’un appareil à combustion (chaudière, poêle, cheminée).', wall: 1, h: 150, draw(c, K) { _eRoundTag(c, K, 'CO', 0.2); } },
  { t: 'det_gaz', cat: 'securite', n: 'Détecteur de gaz', desc: 'Détecte une fuite de gaz : en hauteur pour le gaz naturel, près du sol pour le propane.', wall: 1, h: 200, draw(c, K) { _eRoundTag(c, K, 'GAZ', 0.15); } },
  { t: 'det_fuite', cat: 'securite', n: 'Détecteur de fuite d’eau', desc: 'Sonde posée au sol près du chauffe-eau, du lave-linge ou d’une pompe.', wall: 0, h: null, floor: 1, draw(c, K) {
    _circ(c, 0, 0, 0.3); _fs(c, K.bg);
    c.beginPath(); c.moveTo(0, -0.19); c.bezierCurveTo(0.05, -0.09, 0.13, -0.03, 0.13, 0.05); c.arc(0, 0.05, 0.13, 0, Math.PI); c.bezierCurveTo(-0.13, -0.03, -0.05, -0.09, 0, -0.19); c.closePath(); _eFill(c, K); } },
  { t: 'baes', cat: 'securite', n: 'Bloc de secours (BAES)', desc: 'Bloc autonome d’éclairage de sécurité : s’allume en cas de coupure de courant.', wall: 1, h: 220, bw: 0.45, draw(c, K) {
    _eBox(c, K, -0.4, 0.04, 0.8, 0.36); _circ(c, -0.18, 0.22, 0.12); c.stroke(); _eCross(c, -0.18, 0.22, 0.12);
    c.beginPath(); c.moveTo(0.06, 0.4); c.lineTo(0.4, 0.04); c.lineTo(0.4, 0.4); c.closePath(); _eFill(c, K); } },
  { t: 'arret_urg', cat: 'securite', n: 'Arrêt d’urgence', desc: 'Bouton coup de poing qui coupe l’alimentation des machines (atelier, garage).', wall: 1, h: 130, draw(c, K) {
    _eBox(c, K, -0.26, 0.02, 0.52, 0.52); _circ(c, 0, 0.28, 0.17); _eFill(c, K); _circ(c, 0, 0.28, 0.07); c.fillStyle = K.bg; c.fill(); } },
  /* ---- accès & interphonie ---- */
  { t: 'platine', cat: 'acces', n: 'Platine de rue', desc: 'Portier extérieur : bouton d’appel, micro, haut-parleur et parfois caméra.', wall: 1, h: 150, draw(c, K) {
    _eBox(c, K, -0.24, 0, 0.48, 0.62); c.beginPath(); for (const y of [0.12, 0.18, 0.24]) _ln(c, -0.12, y, 0.12, y); c.stroke(); _circ(c, 0, 0.45, 0.08); c.stroke(); } },
  { t: 'gache', cat: 'acces', n: 'Gâche électrique', desc: 'Déverrouille le portillon ou la porte depuis l’interphone.', wall: 1, h: 100, draw(c, K) {
    _eBox(c, K, -0.12, 0.02, 0.24, 0.5); c.beginPath(); c.moveTo(0.04, 0.1); c.lineTo(-0.06, 0.28); c.lineTo(0.04, 0.28); c.lineTo(-0.04, 0.44); c.stroke(); } },
  { t: 'digicode', cat: 'acces', n: 'Digicode', desc: 'Clavier à code pour ouvrir un accès.', wall: 1, h: 140, draw(c, K) {
    _eBox(c, K, -0.24, 0, 0.48, 0.6); c.fillStyle = K.elec; for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) { _circ(c, -0.12 + i * 0.12, 0.11 + j * 0.12, 0.028); c.fill(); } } },
  { t: 'badge', cat: 'acces', n: 'Lecteur de badge', desc: 'Ouverture par badge ou carte sans contact.', wall: 1, h: 140, draw(c, K) {
    _eBox(c, K, -0.22, 0, 0.44, 0.56); for (const r of [0.08, 0.15, 0.22]) { c.beginPath(); c.arc(-0.1, 0.28, r, -0.6, 0.6); c.stroke(); } } },
  /* ---- alarme & vidéo (suite) ---- */
  { t: 'det_bris', cat: 'alarme', n: 'Détecteur de bris de vitre', desc: 'Détecteur acoustique ou de chocs sur les vitrages.', wall: 1, h: 200, draw(c, K) {
    _eBox(c, K, -0.24, 0.04, 0.48, 0.36); c.beginPath(); c.moveTo(-0.16, 0.22); c.lineTo(-0.06, 0.12); c.lineTo(0.02, 0.3); c.lineTo(0.1, 0.12); c.lineTo(0.17, 0.22); c.stroke(); } },
  { t: 'transmetteur', cat: 'alarme', n: 'Transmetteur téléphonique', desc: 'Prévient par appel ou SMS en cas d’intrusion (GSM ou IP).', wall: 1, h: 160, draw(c, K) { _eBox(c, K, -0.3, 0.06, 0.6, 0.4); _eLabel(c, K, 'TT', 0, 0.26, 0.18); } },
  { t: 'camera_dome', cat: 'alarme', n: 'Caméra dôme', desc: 'Caméra au plafond, discrète et orientable.', wall: 0, h: null, draw(c, K) {
    _circ(c, 0, 0, 0.3); _fs(c, K.bg); _circ(c, 0, 0, 0.16); _eFill(c, K); _circ(c, 0, 0, 0.05); c.fillStyle = K.bg; c.fill(); } },
  { t: 'nvr', cat: 'alarme', n: 'Enregistreur vidéo (NVR)', desc: 'Enregistre les images des caméras, souvent placé dans le coffret de communication.', wall: 1, h: 30, draw(c, K) { _eBox(c, K, -0.4, 0.04, 0.8, 0.32); _eLabel(c, K, 'NVR', 0, 0.2, 0.16); } },
  /* ---- électroménager : sorties dédiées ---- */
  { t: 'pc_ll', cat: 'appareils', n: 'Prise lave-linge', desc: 'Prise 16 A sur circuit spécialisé 20 A (2,5 mm²), sous différentiel 30 mA de type A.', wall: 1, h: 30, side: 1, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'LL', 0.42, 0.55, 0.24, 'left'); } },
  { t: 'pc_lv', cat: 'appareils', n: 'Prise lave-vaisselle', desc: 'Prise 16 A sur circuit spécialisé 20 A (2,5 mm²), sous le plan de travail à côté de l’appareil.', wall: 1, h: 30, side: 1, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'LV', 0.42, 0.55, 0.24, 'left'); } },
  { t: 'pc_sl', cat: 'appareils', n: 'Prise sèche-linge', desc: 'Prise 16 A sur circuit spécialisé 20 A (2,5 mm²).', wall: 1, h: 30, side: 1, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'SL', 0.42, 0.55, 0.24, 'left'); } },
  { t: 'pc_four', cat: 'appareils', n: 'Prise four', desc: 'Prise 16 A sur circuit spécialisé 20 A, derrière ou à côté de la colonne du four.', wall: 1, h: 30, side: 1, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'F', 0.42, 0.55, 0.26, 'left'); } },
  { t: 'pc_cg', cat: 'appareils', n: 'Prise congélateur', desc: 'Prise sur circuit spécialisé, idéalement sous un différentiel à immunité renforcée (Hpi / Si) pour éviter les coupures intempestives.', wall: 1, h: 30, side: 1, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'CG', 0.42, 0.55, 0.24, 'left'); } },
  { t: 'pc_frigo', cat: 'appareils', n: 'Prise réfrigérateur', desc: 'Prise 16 A derrière le réfrigérateur, sur le circuit des prises de la cuisine.', wall: 1, h: 30, side: 1, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'FR', 0.42, 0.55, 0.24, 'left'); } },
  { t: 'pc_mo', cat: 'appareils', n: 'Prise micro-ondes', desc: 'Prise 16 A pour le micro-ondes, souvent en hauteur dans une colonne ou au-dessus du plan de travail.', wall: 1, h: 110, side: 1, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'MO', 0.42, 0.55, 0.22, 'left'); } },
  /* ---- prises (suite) ---- */
  { t: 'pc_inter', cat: 'prises', n: 'Prise avec interrupteur', desc: 'Prise 16 A avec un interrupteur de coupure intégré.', wall: 1, h: 30, side: 1, draw(c, K) { _ePrise(c, K); c.beginPath(); _ln(c, 0.36, 0.34, 0.6, 0.12); c.stroke(); _circ(c, 0.36, 0.34, 0.05); _eFill(c, K); } },
  { t: 'pc_escam', cat: 'prises', n: 'Bloc prises escamotable', desc: 'Bloc de 3 prises encastré dans le plan de travail ou un îlot, qui sort à la demande.', wall: 1, h: 90, bw: 0.5, draw(c, K) {
    _eBox(c, K, -0.42, 0.06, 0.84, 0.3);
    c.beginPath(); for (const x of [-0.24, 0, 0.24]) { c.moveTo(x + 0.09, 0.15); c.arc(x, 0.15, 0.09, 0, Math.PI); } c.stroke();
    c.beginPath(); _ln(c, 0, 0.42, 0, 0.6); c.moveTo(-0.08, 0.5); c.lineTo(0, 0.42); c.lineTo(0.08, 0.5); c.stroke(); } },
  { t: 'pc_jardin', cat: 'prises', n: 'Borne prise de jardin', desc: 'Prise étanche sur borne extérieure, protégée par un différentiel 30 mA.', wall: 0, h: null, floor: 1, draw(c, K) {
    _eBox(c, K, -0.24, -0.3, 0.48, 0.6);
    c.beginPath(); _ln(c, -0.16, 0, 0.16, 0); c.moveTo(0.16, 0); c.arc(0, 0, 0.16, 0, Math.PI); c.stroke();
    c.beginPath(); _ln(c, 0, 0.17, 0, 0.24); c.stroke(); _eLabel(c, K, 'IP', 0, -0.16, 0.14); } },
  /* ---- commandes (suite) ---- */
  { t: 'int_triple', cat: 'commandes', n: 'Interrupteur triple allumage', desc: 'Trois touches pour commander trois éclairages séparés.', wall: 1, h: 110, draw(c, K) { _eSwitchBase(c, K); _eLever(c, K, 0.55, 0.835, 1); _eLever(c, K, -0.55, 0.835, -1); _eLever(c, K, 0, 1, 1); } },
  { t: 'vv_double', cat: 'commandes', n: 'Double va-et-vient', desc: 'Deux va-et-vient dans le même boîtier : deux éclairages commandés chacun de deux endroits.', wall: 1, h: 110, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0, 0, 0.14); _ln(c, -0.24, 0.14, 0.24, 0.14); _ln(c, -0.24, 0.14, -0.24, 0.3); _ln(c, 0.24, 0.14, 0.24, 0.3); c.stroke();
    for (const x of [-0.24, 0.24]) {
      _circ(c, x, 0.4, 0.09); _fs(c, K.bg);
      c.beginPath(); _ln(c, x + 0.07, 0.45, x + 0.26, 0.6); _ln(c, x + 0.26, 0.6, x + 0.33, 0.51); _ln(c, x - 0.07, 0.45, x - 0.26, 0.6); _ln(c, x - 0.26, 0.6, x - 0.33, 0.51); c.stroke();
    } } },
  { t: 'int_tempo', cat: 'commandes', n: 'Interrupteur temporisé', desc: 'Éteint l’éclairage tout seul après un délai réglable (cave, garage, local technique).', wall: 1, h: 110, draw(c, K) {
    _eSwitchBase(c, K); _eLever(c, K, 0.55, 0.835, 1);
    _circ(c, -0.36, 0.64, 0.13); c.stroke(); c.beginPath(); _ln(c, -0.36, 0.64, -0.36, 0.55); _ln(c, -0.36, 0.64, -0.29, 0.64); c.stroke(); } },
  { t: 'int_cle', cat: 'commandes', n: 'Interrupteur à clé', desc: 'Commande réservée aux personnes qui ont la clé (portail, éclairage extérieur, local technique).', wall: 1, h: 110, draw(c, K) {
    _eSwitchBase(c, K); _eLever(c, K, 0.55, 0.835, 1);
    _circ(c, -0.38, 0.56, 0.07); c.stroke(); c.beginPath(); _ln(c, -0.38, 0.63, -0.38, 0.82); _ln(c, -0.38, 0.72, -0.31, 0.72); _ln(c, -0.38, 0.79, -0.31, 0.79); c.stroke(); } },
  { t: 'int_tirette', cat: 'commandes', n: 'Interrupteur à tirette', desc: 'Interrupteur au plafond actionné par un cordon isolant.', wall: 0, h: null, draw(c, K) {
    _circ(c, 0, 0, 0.14); _fs(c, K.bg); c.beginPath(); _ln(c, 0, 0.14, 0, 0.48); c.stroke(); _circ(c, 0, 0.53, 0.05); _eFill(c, K); } },
  /* ---- éclairage (suite) ---- */
  { t: 'suspension', cat: 'eclairage', n: 'Suspension / lustre', desc: 'Luminaire suspendu au point de centre (DCL), au-dessus d’une table ou d’un îlot.', wall: 0, h: null, draw(c, K) {
    _circ(c, 0, 0, 0.42); c.save(); c.setLineDash([0.07, 0.05]); c.stroke(); c.restore();
    _circ(c, 0, 0, 0.28); _fs(c, K.bg); _eCross(c, 0, 0, 0.28); } },
  { t: 'plafonnier', cat: 'eclairage', n: 'Plafonnier', desc: 'Luminaire fixé à plat contre le plafond.', wall: 0, h: null, draw(c, K) {
    _rr(c, -0.32, -0.32, 0.64, 0.64, 0.1); _fs(c, K.bg); _circ(c, 0, 0, 0.22); c.stroke(); _eCross(c, 0, 0, 0.22); } },
  { t: 'spot_orient', cat: 'eclairage', n: 'Spot orientable', desc: 'Spot en saillie au plafond, orientable vers un mur, un tableau ou un plan de travail.', wall: 0, h: null, draw(c, K) {
    _circ(c, 0, 0, 0.17); _fs(c, K.bg); _eCross(c, 0, 0, 0.17);
    c.beginPath(); _ln(c, 0.13, 0.13, 0.3, 0.3); c.stroke(); c.beginPath(); c.moveTo(0.36, 0.36); c.lineTo(0.18, 0.33); c.lineTo(0.33, 0.18); c.closePath(); _eFill(c, K); } },
  { t: 'encastre_sol', cat: 'eclairage', n: 'Encastré de sol', desc: 'Spot encastré dans le sol ou la terrasse (IP67), pour baliser un passage ou éclairer une façade.', wall: 0, h: null, floor: 1, draw(c, K) {
    _eBox(c, K, -0.24, -0.24, 0.48, 0.48); _circ(c, 0, 0, 0.15); c.stroke(); _eCross(c, 0, 0, 0.15); } },
  { t: 'balise_marche', cat: 'eclairage', n: 'Éclairage de marche', desc: 'Petit spot encastré dans le mur de l’escalier, à hauteur des marches.', wall: 1, h: 30, draw(c, K) {
    _eStem(c, 0.1); _eBox(c, K, -0.2, 0.1, 0.4, 0.2); c.beginPath(); for (const x of [-0.12, 0, 0.12]) _ln(c, x, 0.36, x * 1.5, 0.54); c.stroke(); } },
  { t: 'applique_ext', cat: 'eclairage', n: 'Applique extérieure', desc: 'Applique étanche (IP44 au moins) au-dessus d’une porte ou sur la façade.', wall: 1, h: 200, side: 1, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0, 0, 0.18); c.stroke(); _circ(c, 0, 0.42, 0.24); _fs(c, K.bg); _eCross(c, 0, 0.42, 0.24); _eLabel(c, K, 'IP', 0.36, 0.66, 0.18, 'left'); } },
  { t: 'eclairage_placard', cat: 'eclairage', n: 'Éclairage de placard', desc: 'Réglette ou spot à détecteur qui s’allume à l’ouverture du placard ou du dressing.', wall: 1, h: 200, draw(c, K) {
    _eStem(c, 0.1); _eBox(c, K, -0.36, 0.1, 0.72, 0.14);
    c.beginPath(); c.arc(0, 0.24, 0.2, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke(); c.beginPath(); c.arc(0, 0.24, 0.33, 0.3 * Math.PI, 0.7 * Math.PI); c.stroke(); } },
  { t: 'spot_jardin', cat: 'eclairage', n: 'Spot de jardin sur piquet', desc: 'Projecteur planté dans un massif, souvent en très basse tension sur transformateur.', wall: 0, h: null, floor: 1, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0.16, 0, 0.24); c.stroke();
    c.beginPath(); c.moveTo(-0.12, 0.24); c.lineTo(0.12, 0.24); c.lineTo(0, 0.4); c.closePath(); _eFill(c, K);
    _circ(c, 0, 0, 0.16); _fs(c, K.bg); _eCross(c, 0, 0, 0.16); } },
  /* ---- communication (suite) ---- */
  { t: 'rj45_tv', cat: 'comm', n: 'Prise RJ45 + TV', desc: 'Plastron double : une prise réseau et une prise TV côte à côte.', wall: 1, h: 30, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0, 0, 0.3); _ln(c, -0.46, 0.3, 0.46, 0.3);
    for (const x of [-0.22, 0.22]) { c.moveTo(x + 0.2, 0.3); c.arc(x, 0.3, 0.2, 0, Math.PI); }
    c.save(); c.fillStyle = K.bg; c.fill(); c.restore(); c.stroke();
    _eLabel(c, K, 'RJ', -0.22, 0.4, 0.13); _eLabel(c, K, 'TV', 0.22, 0.4, 0.13); } },
  { t: 'antenne', cat: 'comm', n: 'Antenne TV (râteau)', desc: 'Antenne de réception de la TNT, en toiture ou dans les combles.', wall: 0, h: null, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0.34, 0, -0.34); _ln(c, -0.3, -0.24, 0.3, -0.24); _ln(c, -0.22, -0.08, 0.22, -0.08); _ln(c, -0.14, 0.08, 0.14, 0.08); c.stroke(); } },
  { t: 'parabole', cat: 'comm', n: 'Parabole', desc: 'Antenne satellite et sa tête de réception (LNB), fixée en façade ou en toiture.', wall: 1, h: 250, draw(c, K) {
    _eStem(c, 0.18); c.beginPath(); c.ellipse(0, 0.4, 0.32, 0.12, 0, 0, Math.PI * 2); _fs(c, K.bg);
    c.beginPath(); _ln(c, 0, 0.4, 0, 0.72); c.stroke(); _circ(c, 0, 0.75, 0.045); _eFill(c, K); } },
  { t: 'box', cat: 'comm', n: 'Box internet', desc: 'Box de l’opérateur, près de la prise fibre ou téléphone, dans le coffret de communication.', wall: 1, h: 30, draw(c, K) {
    _eBox(c, K, -0.34, 0.06, 0.68, 0.3); c.fillStyle = K.elec; for (const x of [-0.2, -0.08, 0.04]) { _circ(c, x, 0.21, 0.03); c.fill(); }
    c.beginPath(); c.arc(0.2, 0.28, 0.09, 1.2 * Math.PI, 1.8 * Math.PI); c.stroke(); } },
  { t: 'baie', cat: 'comm', n: 'Baie de brassage / switch', desc: 'Répartiteur réseau : panneau de brassage RJ45 et switch qui alimente toutes les prises réseau.', wall: 1, h: 150, bw: 0.45, draw(c, K) {
    _eBox(c, K, -0.4, 0.04, 0.8, 0.44); c.fillStyle = K.elec; for (let i = 0; i < 6; i++) { c.fillRect(-0.31 + i * 0.105, 0.13, 0.065, 0.07); c.fillRect(-0.31 + i * 0.105, 0.29, 0.065, 0.07); } } },
  { t: 'repart_tv', cat: 'comm', n: 'Répartiteur TV', desc: 'Répartit le signal de l’antenne vers toutes les prises TV du logement.', wall: 1, h: 130, draw(c, K) {
    _eBox(c, K, -0.26, 0.06, 0.52, 0.36); c.beginPath(); _ln(c, -0.15, 0.24, 0.13, 0.13); _ln(c, -0.15, 0.24, 0.13, 0.24); _ln(c, -0.15, 0.24, 0.13, 0.35); c.stroke(); } },
  /* ---- tableau & énergie (suite) ---- */
  { t: 'telerupteur', cat: 'tableau', n: 'Télérupteur', desc: 'Module du tableau piloté par des boutons-poussoirs, pour 3 points de commande et plus.', wall: 1, h: 130, draw(c, K) { _eBox(c, K, -0.3, 0.04, 0.6, 0.44); _eLabel(c, K, 'TL', 0, 0.26, 0.22); } },
  { t: 'minuterie', cat: 'tableau', n: 'Minuterie', desc: 'Module du tableau qui éteint l’éclairage après un délai (cage d’escalier, couloir).', wall: 1, h: 130, draw(c, K) {
    _eBox(c, K, -0.3, 0.04, 0.6, 0.44); _circ(c, 0, 0.26, 0.13); c.stroke(); c.beginPath(); _ln(c, 0, 0.26, 0, 0.17); _ln(c, 0, 0.26, 0.08, 0.26); c.stroke(); } },
  { t: 'contacteur_hc', cat: 'tableau', n: 'Contacteur heures creuses', desc: 'Commute le chauffe-eau sur le signal heures creuses du compteur.', wall: 1, h: 130, draw(c, K) { _eBox(c, K, -0.3, 0.04, 0.6, 0.44); _eLabel(c, K, 'HC', 0, 0.26, 0.22); } },
  { t: 'parafoudre', cat: 'tableau', n: 'Parafoudre', desc: 'Protège l’installation des surtensions dues à la foudre, en tête du tableau.', wall: 1, h: 130, draw(c, K) {
    _eBox(c, K, -0.26, 0.04, 0.52, 0.48); c.beginPath(); c.moveTo(0.07, 0.1); c.lineTo(-0.08, 0.29); c.lineTo(0.05, 0.29); c.lineTo(-0.06, 0.46); c.stroke(); } },
  { t: 'delesteur', cat: 'tableau', n: 'Délesteur', desc: 'Coupe un moment le chauffage pour ne pas dépasser la puissance de l’abonnement.', wall: 1, h: 130, draw(c, K) { _eBox(c, K, -0.3, 0.04, 0.6, 0.44); _eLabel(c, K, 'DL', 0, 0.26, 0.22); } },
  { t: 'gest_energie', cat: 'tableau', n: 'Gestionnaire d’énergie', desc: 'Pilote le chauffage par zones et affiche les consommations du logement.', wall: 1, h: 150, draw(c, K) {
    _eBox(c, K, -0.32, 0.04, 0.64, 0.46); c.beginPath(); c.moveTo(-0.2, 0.4); c.lineTo(-0.08, 0.25); c.lineTo(0.03, 0.33); c.lineTo(0.2, 0.13); c.stroke(); } },
  { t: 'sous_compteur', cat: 'tableau', n: 'Compteur divisionnaire', desc: 'Sous-compteur qui mesure la consommation d’un circuit, d’une dépendance ou d’un logement.', wall: 1, h: 130, draw(c, K) {
    _eBox(c, K, -0.32, 0.04, 0.64, 0.42); _r(c, -0.24, 0.11, 0.48, 0.2); c.stroke(); _eLabel(c, K, 'kWh', 0, 0.21, 0.14); } },
  { t: 'coffret_ext', cat: 'tableau', n: 'Coffret extérieur', desc: 'Petit tableau étanche pour le jardin, un abri ou le garage, alimenté depuis le tableau principal.', wall: 1, h: 130, bw: 0.45, draw(c, K) {
    _eBox(c, K, -0.4, 0, 0.8, 0.44); c.beginPath(); _ln(c, -0.4, 0, 0.4, 0.44); c.stroke(); _eLabel(c, K, 'IP', 0.18, 0.13, 0.14); } },
  { t: 'coffret_piscine', cat: 'tableau', n: 'Coffret piscine', desc: 'Coffret de filtration : horloge, protection de la pompe et de l’éclairage de la piscine.', wall: 1, h: 130, bw: 0.45, draw(c, K) {
    _eBox(c, K, -0.4, 0, 0.8, 0.44); c.beginPath(); for (const y of [0.16, 0.29]) { c.moveTo(-0.28, y); c.quadraticCurveTo(-0.14, y - 0.07, 0, y); c.quadraticCurveTo(0.14, y + 0.07, 0.28, y); } c.stroke(); } },
  /* ---- chauffage (suite) ---- */
  { t: 'ballon_thermo', cat: 'confort', n: 'Ballon thermodynamique', desc: 'Chauffe-eau avec pompe à chaleur intégrée, sur circuit dédié 20 A.', wall: 0, h: null, floor: 1, draw(c, K) { _circ(c, 0, 0, 0.32); _fs(c, K.bg); _eLabel(c, K, 'CET', 0, 0.01, 0.17); } },
  { t: 'soufflant_sdb', cat: 'confort', n: 'Radiateur soufflant salle de bain', desc: 'Chauffage d’appoint soufflant, posé hors des volumes 0 à 2 de la salle de bain.', wall: 1, h: 180, draw(c, K) { _eBox(c, K, -0.36, 0.04, 0.72, 0.3); _eFan(c, 0, 0.19, 0.11, 3); } },
  { t: 'poele_granules', cat: 'confort', n: 'Poêle à granulés (prise)', desc: 'Prise pour l’allumage et le ventilateur du poêle, de préférence sur un circuit dédié.', wall: 1, h: 30, side: 1, draw(c, K) { _ePrise(c, K); _eLabel(c, K, 'PG', 0.42, 0.55, 0.24, 'left'); } },
  { t: 'pac_int', cat: 'confort', n: 'Module hydraulique PAC', desc: 'Unité intérieure d’une pompe à chaleur air-eau, avec ou sans ballon intégré.', wall: 1, h: 150, draw(c, K) { _eBox(c, K, -0.32, 0.04, 0.64, 0.52); _eLabel(c, K, 'PAC', 0, 0.3, 0.18); } },
  { t: 'sonde_ext', cat: 'confort', n: 'Sonde de température extérieure', desc: 'Sonde de régulation du chauffage, sur une façade nord à l’abri du soleil.', wall: 1, h: 250, draw(c, K) { _eRoundTag(c, K, 'θe', 0.18); } },
  { t: 'prog_fp', cat: 'confort', n: 'Programmateur fil pilote', desc: 'Envoie aux radiateurs les ordres confort, éco ou hors-gel par le fil pilote.', wall: 1, h: 150, draw(c, K) { _eBox(c, K, -0.3, 0.04, 0.6, 0.44); _eLabel(c, K, 'FP', 0, 0.26, 0.22); } },
  /* ---- ventilation (VMC) ---- */
  { t: 'vmc_df', cat: 'ventilation', n: 'Groupe VMC double flux', desc: 'Extrait l’air des pièces humides et souffle dans les pièces principales de l’air neuf réchauffé par un échangeur.', wall: 0, h: null, bw: 0.62, draw(c, K) {
    _eBox(c, K, -0.56, -0.32, 1.12, 0.64);
    c.beginPath(); c.moveTo(0, -0.3); c.lineTo(0.2, 0); c.lineTo(0, 0.3); c.lineTo(-0.2, 0); c.closePath(); c.stroke();
    c.beginPath(); _ln(c, -0.2, 0, 0.2, 0); _ln(c, 0, -0.3, 0, 0.3); c.stroke();
    _eFan(c, -0.38, 0, 0.12, 3); _eFan(c, 0.38, 0, 0.12, 3); } },
  { t: 'vmc_insuff', cat: 'ventilation', n: 'Bouche d’insufflation', desc: 'Souffle l’air neuf réchauffé dans une pièce principale (VMC double flux).', wall: 0, h: null, draw(c, K) {
    _circ(c, 0, 0, 0.3); _fs(c, K.bg); _circ(c, 0, 0, 0.09); _eFill(c, K);
    c.beginPath(); for (let i = 0; i < 4; i++) { const a = (i + 0.5) * Math.PI / 2, cx = Math.cos(a), sx = Math.sin(a); _ln(c, cx * 0.13, sx * 0.13, cx * 0.27, sx * 0.27); _ln(c, cx * 0.27, sx * 0.27, cx * 0.27 - (cx - sx) * 0.06, sx * 0.27 - (sx + cx) * 0.06); _ln(c, cx * 0.27, sx * 0.27, cx * 0.27 - (cx + sx) * 0.06, sx * 0.27 - (sx - cx) * 0.06); } c.stroke(); } },
  { t: 'entree_air', cat: 'ventilation', n: 'Entrée d’air', desc: 'Grille d’arrivée d’air neuf en haut de la fenêtre ou en traversée de mur, dans chaque pièce principale (VMC simple flux).', wall: 1, h: 210, bw: 0.45, draw(c, K) {
    _eBox(c, K, -0.4, 0.04, 0.8, 0.16); c.beginPath(); for (const x of [-0.24, -0.08, 0.08, 0.24]) _ln(c, x, 0.04, x, 0.2); c.stroke();
    c.beginPath(); _ln(c, 0, 0.26, 0, 0.52); c.moveTo(-0.08, 0.44); c.lineTo(0, 0.53); c.lineTo(0.08, 0.44); c.stroke(); } },
  { t: 'sortie_toit', cat: 'ventilation', n: 'Sortie de toit (rejet)', desc: 'Rejette l’air vicié à l’extérieur au-dessus de la toiture, en Ø160 en général.', wall: 0, h: null, draw(c, K) {
    _circ(c, 0, 0, 0.36); c.stroke(); _circ(c, 0, 0, 0.26); _fs(c, K.bg);
    c.beginPath(); _ln(c, 0, 0.14, 0, -0.15); c.moveTo(-0.09, -0.06); c.lineTo(0, -0.16); c.lineTo(0.09, -0.06); c.stroke(); } },
  { t: 'prise_air_neuf', cat: 'ventilation', n: 'Prise d’air neuf', desc: 'Aspire l’air extérieur pour la VMC double flux, loin du rejet et des sources de pollution.', wall: 1, h: 250, draw(c, K) {
    _eStem(c, 0.1); _eBox(c, K, -0.3, 0.1, 0.6, 0.3); c.beginPath(); for (const y of [0.17, 0.25, 0.33]) _ln(c, -0.22, y, 0.22, y); c.stroke();
    c.beginPath(); _ln(c, 0, 0.46, 0, 0.7); c.moveTo(-0.08, 0.62); c.lineTo(0, 0.71); c.lineTo(0.08, 0.62); c.stroke(); } },
  { t: 'plenum', cat: 'ventilation', n: 'Plénum / caisson de répartition', desc: 'Boîte de distribution d’où partent plusieurs conduits vers les bouches.', wall: 0, h: null, draw(c, K) {
    _eBox(c, K, -0.3, -0.2, 0.6, 0.4); c.beginPath(); for (const x of [-0.16, 0, 0.16]) { c.moveTo(x + 0.055, 0.2); c.arc(x, 0.2, 0.055, 0, Math.PI); } c.stroke(); _eLabel(c, K, 'P', 0, -0.02, 0.2); } },
  /* ---- moteurs (suite) ---- */
  { t: 'velux_mot', cat: 'moteurs', n: 'Fenêtre de toit motorisée', desc: 'Ouvrant ou volet de fenêtre de toit à moteur, souvent avec capteur de pluie.', wall: 0, h: null, draw(c, K) {
    _eBox(c, K, -0.36, -0.26, 0.72, 0.52); _r(c, -0.26, -0.16, 0.52, 0.32); c.stroke(); _eMotor(c, K, 0.3, 0.22, 0.12); } },
  { t: 'volet_bat', cat: 'moteurs', n: 'Volet battant motorisé', desc: 'Motorisation de volets battants à bras articulés, sur le circuit des volets.', wall: 1, h: 200, draw(c, K) {
    c.beginPath(); _ln(c, -0.46, 0.04, -0.14, 0.5); _ln(c, 0.46, 0.04, 0.14, 0.5); c.stroke(); _eMotor(c, K, 0, 0.24, 0.12); } },
  { t: 'arrosage', cat: 'moteurs', n: 'Arrosage automatique', desc: 'Programmateur et électrovannes d’arrosage, en très basse tension sur transformateur.', wall: 1, h: 120, draw(c, K) {
    _eBox(c, K, -0.28, 0.04, 0.56, 0.42);
    c.beginPath(); c.moveTo(0, 0.11); c.bezierCurveTo(0.05, 0.19, 0.11, 0.24, 0.11, 0.3); c.arc(0, 0.3, 0.11, 0, Math.PI); c.bezierCurveTo(-0.11, 0.24, -0.05, 0.19, 0, 0.11); c.closePath(); _eFill(c, K); } },
  { t: 'pergola', cat: 'moteurs', n: 'Pergola bioclimatique', desc: 'Lames orientables motorisées, souvent avec un éclairage LED intégré.', wall: 0, h: null, bw: 0.62, draw(c, K) {
    _eBox(c, K, -0.6, -0.4, 1.2, 0.8); c.beginPath(); for (let i = 1; i < 6; i++) _ln(c, -0.6 + i * 0.2, -0.4, -0.6 + i * 0.2, 0.4); c.stroke(); _eMotor(c, K, 0.46, 0.27, 0.11); } },
  { t: 'capteur_vent', cat: 'moteurs', n: 'Capteur vent et soleil', desc: 'Remonte le store ou ferme les lames quand le vent est trop fort.', wall: 1, h: 250, draw(c, K) {
    _eStem(c, 0.12); _circ(c, 0, 0.36, 0.12); _fs(c, K.bg);
    c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; _ln(c, Math.cos(a) * 0.17, 0.36 + Math.sin(a) * 0.17, Math.cos(a) * 0.25, 0.36 + Math.sin(a) * 0.25); } c.stroke(); } },
  /* ---- sécurité (suite) ---- */
  { t: 'det_chaleur', cat: 'securite', n: 'Détecteur de chaleur', desc: 'Réagit à une montée rapide de la température, là où un détecteur de fumée se déclencherait à tort (cuisine, garage).', wall: 0, h: null, draw(c, K) { _circ(c, 0, 0, 0.3); _fs(c, K.bg); _eLabel(c, K, '°C', 0, 0.01, 0.22); } },
  { t: 'declencheur', cat: 'securite', n: 'Déclencheur manuel', desc: 'Boîtier « bris de glace » qui déclenche l’alarme incendie.', wall: 1, h: 130, draw(c, K) {
    _eBox(c, K, -0.26, 0.02, 0.52, 0.52); _r(c, -0.15, 0.13, 0.3, 0.3); c.stroke(); _circ(c, 0, 0.28, 0.06); _eFill(c, K); } },
  { t: 'ev_gaz', cat: 'securite', n: 'Électrovanne de coupure gaz', desc: 'Coupe l’arrivée de gaz sur ordre du détecteur de gaz.', wall: 1, h: 30, draw(c, K) {
    c.beginPath(); _ln(c, 0, 0, 0, 0.38); c.stroke();
    c.beginPath(); c.moveTo(-0.26, 0.26); c.lineTo(0.26, 0.5); c.lineTo(0.26, 0.26); c.lineTo(-0.26, 0.5); c.closePath(); _fs(c, K.bg); } },
  /* ---- accès & alarme (suite) ---- */
  { t: 'serrure', cat: 'acces', n: 'Serrure connectée', desc: 'Serrure motorisée qui se déverrouille par badge, code ou téléphone.', wall: 1, h: 100, draw(c, K) {
    _eBox(c, K, -0.18, 0.02, 0.36, 0.56); _circ(c, 0, 0.22, 0.07); c.stroke(); c.beginPath(); _ln(c, 0, 0.29, 0, 0.44); c.stroke(); } },
  { t: 'barriere_ir', cat: 'alarme', n: 'Barrière infrarouge', desc: 'Faisceaux infrarouges qui protègent un passage ou le périmètre extérieur.', wall: 1, h: 100, draw(c, K) {
    _eBox(c, K, -0.12, 0.02, 0.24, 0.38); c.save(); c.setLineDash([0.06, 0.05]); c.beginPath(); _ln(c, 0, 0.42, 0, 0.8); _ln(c, -0.08, 0.42, -0.22, 0.78); _ln(c, 0.08, 0.42, 0.22, 0.78); c.stroke(); c.restore(); } },
];
/* range les symboles par catégorie (légende et catalogue dans le même ordre) */
{ const ci = (d) => ELEC_CATS.findIndex((x) => x.id === d.cat); ELEC.sort((a, b) => ci(a) - ci(b)); }
const ELEC_BY = new Map(ELEC.map((e) => [e.t, e]));
function elecSize(K) { return Math.max(S_ELEC, 20 * K.px); }
/* taille d'un symbole (format v12) : 0,5 à 3, 1 par défaut */
const tailleSym = (e) => (e && typeof e.sc === 'number' && e.sc >= 0.5 && e.sc <= 3 ? e.sc : 1);
function drawElec(c, e, K) {
  const def = ELEC_BY.get(e.type); if (!def) return;
  const u = elecSize(K) * tailleSym(e);
  c.save();
  c.translate(e.x, e.y); c.rotate((e.rot || 0) * DEG);
  c.scale(u, u);
  const K2 = Object.assign({}, K, { px: K.px / u, unit: u });
  c.lineWidth = 1.3 * K2.px; c.strokeStyle = K.elec; c.lineJoin = 'round'; c.lineCap = 'round';
  K2.flipText = needsFlip(e.rot);
  def.draw(c, K2);
  c.restore();
}
/* marquage d'un composant personnalisé (« IP55 », « 20A »…), écrit à l'écart du symbole, toujours lisible */
function drawElecMark(c, e, K) {
  if (!e.mark) return;
  const def = ELEC_BY.get(e.type), u = elecSize(K) * tailleSym(e);
  c.save();
  c.translate(e.x, e.y); c.rotate((e.rot || 0) * DEG);
  c.translate(0, (def && def.wall ? 1.08 : 0.72) * u);
  if (needsFlip(e.rot)) c.rotate(Math.PI);
  const size = Math.max(0.3 * u, 9 * K.px);
  c.font = `700 ${size}px ${K.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineJoin = 'round'; c.lineWidth = 3 * K.px; c.strokeStyle = K.bg; c.strokeText(e.mark, 0, 0);
  c.fillStyle = K.elec; c.fillText(e.mark, 0, 0);
  c.restore();
}
function elecBox(e, K) {
  const def = ELEC_BY.get(e.type); const u = elecSize(K) * tailleSym(e);
  if (!def) return { x0: -u / 2, y0: -u / 2, x1: u / 2, y1: u / 2 };
  const wide = ['tableau', 'reglette', 'led', 'rad_elec', 'com'].includes(e.type);
  const hw = (def.bw || (wide ? 0.72 : 0.5)) * u;
  return def.wall ? { x0: -hw, y0: -0.05 * u, x1: hw, y1: 0.85 * u } : { x0: -hw, y0: -0.4 * u, x1: hw, y1: 0.4 * u };
}
function needsFlip(rot) { const r = normDeg(rot || 0); return r > 90.5 && r <= 270.5; }

/* ---------------- catalogue de mobilier ---------------- */
const FURN_CATS = [
  { id: 'cuisine', name: 'Cuisine' },
  { id: 'sejour', name: 'Séjour' },
  { id: 'chambre', name: 'Chambre' },
  { id: 'sdb', name: 'Salle de bain' },
  { id: 'divers', name: 'Divers' },
  { id: 'escaliers', name: 'Escaliers' },
];
const FURN = [
  { k: 'mb60', cat: 'cuisine', t: 'meuble_bas', n: 'Meuble bas 60', w: 60, d: 60, mag: 1 },
  { k: 'mb40', cat: 'cuisine', t: 'meuble_bas', n: 'Meuble bas 40', w: 40, d: 60, mag: 1 },
  { k: 'mb80', cat: 'cuisine', t: 'meuble_bas', n: 'Meuble bas 80', w: 80, d: 60, mag: 1 },
  { k: 'mh60', cat: 'cuisine', t: 'meuble_haut', n: 'Meuble haut 60', w: 60, d: 35, mag: 1 },
  { k: 'col', cat: 'cuisine', t: 'colonne', n: 'Colonne', w: 60, d: 60, mag: 1 },
  { k: 'pt', cat: 'cuisine', t: 'plan_travail', n: 'Plan de travail', w: 200, d: 65, mag: 1 },
  { k: 'ev1', cat: 'cuisine', t: 'evier1', n: 'Évier 1 bac', w: 80, d: 60, mag: 1 },
  { k: 'ev2', cat: 'cuisine', t: 'evier2', n: 'Évier 2 bacs', w: 120, d: 60, mag: 1 },
  { k: 'eveg', cat: 'cuisine', t: 'evier_eg', n: 'Évier + égouttoir', w: 100, d: 60, mag: 1 },
  { k: 'pl60', cat: 'cuisine', t: 'plaque', n: 'Plaque de cuisson 60', w: 60, d: 60, mag: 1 },
  { k: 'pl90', cat: 'cuisine', t: 'plaque90', n: 'Plaque de cuisson 90', w: 90, d: 60, mag: 1 },
  { k: 'four', cat: 'cuisine', t: 'four', n: 'Four', w: 60, d: 60, mag: 1 },
  { k: 'lv', cat: 'cuisine', t: 'lave_vaisselle', n: 'Lave-vaisselle', w: 60, d: 60, mag: 1 },
  { k: 'frigo', cat: 'cuisine', t: 'frigo', n: 'Réfrigérateur', w: 60, d: 65, mag: 1 },
  { k: 'frigous', cat: 'cuisine', t: 'frigo_us', n: 'Réfrigérateur américain', w: 90, d: 75, mag: 1 },
  { k: 'congel', cat: 'cuisine', t: 'congelateur', n: 'Congélateur', w: 60, d: 65, mag: 1 },
  { k: 'mo', cat: 'cuisine', t: 'micro_ondes', n: 'Micro-ondes', w: 50, d: 40, mag: 1 },
  { k: 'hotte', cat: 'cuisine', t: 'hotte', n: 'Hotte', w: 60, d: 50, mag: 1 },
  { k: 'ilot', cat: 'cuisine', t: 'ilot', n: 'Îlot central', w: 180, d: 90, mag: 0 },
  { k: 'tab4', cat: 'cuisine', t: 'table_rect', n: 'Table 4 personnes', w: 120, d: 80, mag: 0 },
  { k: 'canape2', cat: 'sejour', t: 'canape', n: 'Canapé 2 places', w: 160, d: 90, mag: 1, seats: 2 },
  { k: 'canape3', cat: 'sejour', t: 'canape', n: 'Canapé 3 places', w: 210, d: 95, mag: 1, seats: 3 },
  { k: 'canapeA', cat: 'sejour', t: 'canape_angle', n: 'Canapé d’angle', w: 260, d: 190, mag: 1 },
  { k: 'fauteuil', cat: 'sejour', t: 'fauteuil', n: 'Fauteuil', w: 80, d: 82, mag: 0 },
  { k: 'tbasse', cat: 'sejour', t: 'table_basse', n: 'Table basse', w: 110, d: 60, mag: 0 },
  { k: 'tv', cat: 'sejour', t: 'meuble_tv', n: 'Meuble TV', w: 180, d: 45, mag: 1 },
  { k: 'biblio', cat: 'sejour', t: 'bibliotheque', n: 'Bibliothèque', w: 120, d: 35, mag: 1 },
  { k: 'tab6', cat: 'sejour', t: 'table_rect', n: 'Table 6 personnes', w: 180, d: 90, mag: 0 },
  { k: 'tabR', cat: 'sejour', t: 'table_ronde', n: 'Table ronde', w: 120, d: 120, mag: 0 },
  { k: 'chaise', cat: 'sejour', t: 'chaise', n: 'Chaise', w: 45, d: 50, mag: 0 },
  { k: 'poele', cat: 'sejour', t: 'poele', n: 'Poêle', w: 55, d: 55, mag: 0 },
  { k: 'chem', cat: 'sejour', t: 'cheminee', n: 'Cheminée', w: 120, d: 60, mag: 1 },
  { k: 'tapis', cat: 'sejour', t: 'tapis', n: 'Tapis', w: 200, d: 140, mag: 0 },
  { k: 'plante', cat: 'sejour', t: 'plante', n: 'Plante', w: 50, d: 50, mag: 0 },
  { k: 'lit90', cat: 'chambre', t: 'lit', n: 'Lit 90 × 190', w: 90, d: 190, mag: 1 },
  { k: 'lit140', cat: 'chambre', t: 'lit', n: 'Lit 140 × 190', w: 140, d: 190, mag: 1 },
  { k: 'lit160', cat: 'chambre', t: 'lit', n: 'Lit 160 × 200', w: 160, d: 200, mag: 1 },
  { k: 'lit180', cat: 'chambre', t: 'lit', n: 'Lit 180 × 200', w: 180, d: 200, mag: 1 },
  { k: 'litsup', cat: 'chambre', t: 'lit_superpose', n: 'Lits superposés', w: 90, d: 190, mag: 1 },
  { k: 'litbb', cat: 'chambre', t: 'lit_bebe', n: 'Lit bébé', w: 60, d: 120, mag: 1 },
  { k: 'chevet', cat: 'chambre', t: 'chevet', n: 'Table de chevet', w: 45, d: 40, mag: 1 },
  { k: 'armoire', cat: 'chambre', t: 'armoire', n: 'Armoire', w: 120, d: 60, mag: 1 },
  { k: 'dressing', cat: 'chambre', t: 'dressing', n: 'Dressing', w: 200, d: 60, mag: 1 },
  { k: 'placard', cat: 'chambre', t: 'placard', n: 'Placard coulissant', w: 160, d: 62, mag: 1 },
  { k: 'commode', cat: 'chambre', t: 'commode', n: 'Commode', w: 100, d: 50, mag: 1 },
  { k: 'bureau', cat: 'chambre', t: 'bureau', n: 'Bureau', w: 120, d: 60, mag: 1 },
  { k: 'chbur', cat: 'chambre', t: 'chaise_bureau', n: 'Chaise de bureau', w: 60, d: 60, mag: 0 },
  { k: 'bain', cat: 'sdb', t: 'baignoire', n: 'Baignoire', w: 170, d: 75, mag: 1 },
  { k: 'bainilot', cat: 'sdb', t: 'baignoire_ilot', n: 'Baignoire îlot', w: 170, d: 80, mag: 0 },
  { k: 'dou90', cat: 'sdb', t: 'douche', n: 'Douche 90 × 90', w: 90, d: 90, mag: 1 },
  { k: 'dou120', cat: 'sdb', t: 'douche', n: 'Douche 120 × 80', w: 120, d: 80, mag: 1 },
  { k: 'douita', cat: 'sdb', t: 'douche_ita', n: 'Douche à l’italienne', w: 140, d: 90, mag: 1 },
  { k: 'lavabo', cat: 'sdb', t: 'lavabo', n: 'Lavabo', w: 60, d: 48, mag: 1 },
  { k: 'vasque2', cat: 'sdb', t: 'vasque2', n: 'Double vasque', w: 120, d: 50, mag: 1 },
  { k: 'wc', cat: 'sdb', t: 'wc', n: 'WC', w: 40, d: 68, mag: 1 },
  { k: 'wcs', cat: 'sdb', t: 'wc_susp', n: 'WC suspendu', w: 37, d: 55, mag: 1 },
  { k: 'lm', cat: 'sdb', t: 'lave_mains', n: 'Lave-mains', w: 40, d: 25, mag: 1 },
  { k: 'bidet', cat: 'sdb', t: 'bidet', n: 'Bidet', w: 38, d: 55, mag: 1 },
  { k: 'sserv', cat: 'sdb', t: 'seche_serv', n: 'Sèche-serviettes', w: 50, d: 10, mag: 1 },
  { k: 'll', cat: 'sdb', t: 'lave_linge', n: 'Lave-linge', w: 60, d: 60, mag: 1 },
  { k: 'sl', cat: 'sdb', t: 'seche_linge', n: 'Sèche-linge', w: 60, d: 60, mag: 1 },
  { k: 'ce', cat: 'sdb', t: 'chauffe_eau', n: 'Chauffe-eau', w: 55, d: 55, mag: 1 },
  { k: 'rad', cat: 'divers', t: 'radiateur', n: 'Radiateur', w: 80, d: 10, mag: 1 },
  { k: 'chaud', cat: 'divers', t: 'chaudiere', n: 'Chaudière', w: 45, d: 35, mag: 1 },
  { k: 'poteau', cat: 'divers', t: 'poteau', n: 'Poteau', w: 20, d: 20, mag: 0 },
  { k: 'voiture', cat: 'divers', t: 'voiture', n: 'Voiture', w: 180, d: 450, mag: 0 },
  { k: 'bloc', cat: 'divers', t: 'bloc', n: 'Bloc libre', w: 100, d: 60, mag: 1 },
  { k: 'escD', cat: 'escaliers', t: 'esc_droit', n: 'Escalier droit', w: 90, d: 360, n_: 16, mag: 0 },
  { k: 'escQ', cat: 'escaliers', t: 'esc_quart', n: 'Escalier quart tournant', w: 200, d: 320, n_: 16, e: 90, mag: 0 },
  { k: 'escU', cat: 'escaliers', t: 'esc_demi', n: 'Escalier demi-tournant', w: 200, d: 280, n_: 16, e: 90, mag: 0 },
  { k: 'escH', cat: 'escaliers', t: 'esc_helice', n: 'Escalier hélicoïdal', w: 160, d: 160, n_: 14, turn: 330, mag: 0 },
];
const FURN_BY = new Map(FURN.map((f) => [f.k, f]));
const isStair = (t) => t && t.startsWith('esc_');
function furnDef(it) { return FURN_BY.get(it.k) || FURN.find((f) => f.t === it.type) || null; }

function drawItem(c, it, K, mode) {
  c.save();
  c.translate(it.x, it.y);
  c.rotate((it.rot || 0) * DEG);
  if (it.flip) c.scale(-1, 1);
  c.lineWidth = 1 * K.px; c.strokeStyle = K.ink; c.lineJoin = 'round'; c.lineCap = 'round';
  const K2 = Object.assign({}, K, { flipText: needsFlip(it.rot) });
  if (isStair(it.type)) drawStair(c, it, K2, mode || 'lower');
  else { const f = DR[it.type] || DR.bloc; f(c, it.w, it.d, K2, it); }
  c.restore();
  if (it.label && S.layers.names) drawItemLabel(c, it, K);
}
function drawItemLabel(c, it, K) {
  const size = 11 * K.px;
  c.save(); c.translate(it.x, it.y);
  let a = (it.rot || 0) * DEG; if (needsFlip(it.rot)) a += Math.PI;
  c.rotate(a);
  c.font = `600 ${size}px ${K.font}`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.lineWidth = 3 * K.px; c.strokeStyle = K.bg; c.strokeText(it.label, 0, 0);
  c.fillStyle = K.ink; c.fillText(it.label, 0, 0);
  c.restore();
}

export { tailleSym };
export { DR, ELEC, ELEC_BY, ELEC_CATS, FURN, FURN_BY, FURN_CATS, S_ELEC, _circ, _dash, _eBox, _eCom, _eCross, _eFan,
  _eFill, _eLabel, _eLever, _eMotor, _ePrise, _eRoundTag, _eStem, _eSwitchBase, _ell, _fs, _ln, _nodash, _r, _rr, _txt,
  basin, drawElec, drawElecMark, drawItem, drawItemLabel, drawStair, elecBox, elecSize, furnDef, isStair, needsFlip, rectSteps,
  rectStepsX, stairInfo, stairModel };

/* Calque — module « export » : export : PDF intégré, image PNG, partage.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { $, $$, NF1, NFc, P, S, clamp, fmtArea, fmtLenU, levelOf, levelsSorted, saveSettings, ui, uid } from './noyau.js';
import { geo } from './geometrie.js';
import { snapshot } from './historique.js';
import { ELEC } from './symboles.js';
import { FONT_LABEL, FONT_UI, RC, drawScene, setRC, setScreen } from './rendu2d.js';
import { ductLen, ductVisible, elecVisible } from './reseaux.js';
import { contentBBox, requestRender } from './interaction.js';
import { btn, btns, closeModal, h, openModal, sec, segCtl, toast } from './interface.js';
import { LIGHT, addVersion, getDownloads, listProjects, loadProject, lsSet, migratePlan, notifySaveFail, openPlan,
  openProjects, saveBlobLocal, saveNow, scheduleSave, slug, writePlanLocal } from './stockage.js';
import { photo3D } from './vue3d.js';
import { exportUserLib, importUserLib } from './mabiblio.js';

/* ============================================================
   CALQUE — export du plan : image PNG (copier, partager) et PDF
   vectoriel à l'échelle. Le PDF est écrit directement, sans
   bibliothèque : un contexte « canvas » factice enregistre le
   dessin du plan et le traduit en instructions PDF.
   ============================================================ */

/* ---------------- PDF : polices standard (Helvetica, codage WinAnsi) ---------------- */
const HELV = { r: [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,0,556,0,222,556,333,1000,556,556,333,1000,667,333,1000,0,611,0,0,222,222,333,333,350,556,1000,333,1000,500,333,944,0,500,500,278,333,556,556,556,556,260,556,333,737,370,556,584,333,737,333,400,584,333,333,333,556,537,278,333,333,365,556,834,834,834,611,667,667,667,667,667,667,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,500,556,556,556,556,278,278,278,278,556,556,556,556,556,556,556,584,611,556,556,556,556,500,556,500], b: [278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,0,556,0,278,556,500,1000,556,556,333,1000,667,333,1000,0,611,0,0,278,278,500,500,350,556,1000,333,1000,556,333,944,0,500,556,278,333,556,556,556,556,280,556,333,737,370,556,584,333,737,333,400,584,333,333,333,611,556,278,333,333,365,556,834,834,834,611,722,722,722,722,722,722,1000,722,667,667,667,667,278,278,278,278,722,722,778,778,778,778,778,584,778,722,722,722,722,667,667,611,556,556,556,556,556,556,889,556,556,556,556,556,278,278,278,278,611,611,611,611,611,611,611,584,611,611,611,611,611,556,611,556] };
const WINANSI = new Map([[338,140],[339,156],[352,138],[353,154],[376,159],[381,142],[382,158],[402,131],[710,136],[732,152],[8211,150],[8212,151],[8216,145],[8217,146],[8218,130],[8220,147],[8221,148],[8222,132],[8224,134],[8225,135],[8226,149],[8230,133],[8240,137],[8249,139],[8250,155],[8364,128],[8482,153]]);
function winAnsiBytes(str) {
  const out = [];
  for (const ch of String(str)) {
    let cp = ch.codePointAt(0);
    if (cp === 0x202F || cp === 0x2009 || cp === 0x2007 || cp === 0x200A) cp = 0xA0; // espaces fines (séparateur de milliers)
    else if (cp === 0x2212) cp = 0x2D;
    if (cp < 0x80) out.push(cp >= 32 ? cp : 32);
    else if (cp >= 0xA0 && cp <= 0xFF) out.push(cp);
    else if (WINANSI.has(cp)) out.push(WINANSI.get(cp));
    else out.push(63);
  }
  return out;
}
function helvWidth(bytes, bold) { const t = bold ? HELV.b : HELV.r; let w = 0; for (const b of bytes) w += t[b - 32] || 556; return w / 1000; }
function pdfStr(bytes) {
  let s = '(';
  for (const b of bytes) {
    if (b === 40 || b === 41 || b === 92) s += '\\' + String.fromCharCode(b);
    else if (b < 32 || b > 126) s += '\\' + b.toString(8).padStart(3, '0');
    else s += String.fromCharCode(b);
  }
  return s + ')';
}
const pn = (v) => { const r = Math.round(v * 100) / 100; return r === 0 ? '0' : String(r); };
const pn4 = (v) => { const r = Math.round(v * 10000) / 10000; return r === 0 ? '0' : String(r); };
const pn3 = (v) => { const r = Math.round(v * 1000) / 1000; return r === 0 ? '0' : String(r); };
const COLCACHE = new Map();
function parseColor(s) {
  if (typeof s !== 'string') return [0, 0, 0, 1];
  let c = COLCACHE.get(s); if (c) return c;
  const t = s.trim().toLowerCase(); let m;
  if (t === 'transparent') c = [0, 0, 0, 0];
  else if (t[0] === '#') {
    let hx = t.slice(1); if (hx.length === 3 || hx.length === 4) hx = [...hx].map((x) => x + x).join('');
    const n = parseInt(hx.slice(0, 6), 16);
    c = [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255, hx.length === 8 ? parseInt(hx.slice(6), 16) / 255 : 1];
  } else if ((m = t.match(/^rgba?\(([^)]+)\)/))) {
    const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat);
    c = [p[0] / 255, p[1] / 255, p[2] / 255, p.length > 3 ? p[3] : 1];
  } else c = { white: [1, 1, 1, 1], black: [0, 0, 0, 1] }[t] || [0, 0, 0, 1];
  COLCACHE.set(s, c); return c;
}
function parseFont(f) {
  const m = /([\d.]+)px/.exec(f); const w = /(^|\s)(\d{3})(\s|$)/.exec(f);
  const weight = w ? +w[2] : /bold/.test(f) ? 700 : 400;
  return { size: m ? parseFloat(m[1]) : 10, bold: weight >= 600 };
}
let MC = null;
function pdfMeasure() { if (!MC) MC = document.createElement('canvas').getContext('2d'); return MC; }
const BASECACHE = new Map();
function baselineOffset(font, base) {
  if (!base || base === 'alphabetic') return 0;
  const k = font + '|' + base; if (BASECACHE.has(k)) return BASECACHE.get(k);
  const mc = pdfMeasure(); mc.font = font;
  mc.textBaseline = 'alphabetic'; const a = mc.measureText('H').actualBoundingBoxAscent;
  mc.textBaseline = base; const b = mc.measureText('H').actualBoundingBoxAscent;
  mc.textBaseline = 'alphabetic';
  let v = a - b; if (!isFinite(v)) v = base === 'middle' ? parseFont(font).size * 0.32 : 0;
  BASECACHE.set(k, v); return v;
}

/* Chemin enregistré (remplace Path2D quand on dessine vers le PDF) */
class PdfPath {
  constructor() { this.o = []; }
  moveTo(x, y) { this.o.push(0, x, y); }
  lineTo(x, y) { this.o.push(1, x, y); }
  closePath() { this.o.push(2); }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
}
const mkPath = (c) => (c && c.isPdf ? new PdfPath() : new Path2D());

/* Contexte canvas factice : même API que CanvasRenderingContext2D pour ce que Calque utilise */
class PdfCtx {
  constructor(W, H) {
    this.isPdf = true; this.W = W; this.H = H;
    this.out = ['1 0 0 -1 0 ' + pn(H) + ' cm'];
    this.gsAlpha = new Map(); this.st = []; this.ps = {}; this.pst = [];
    this.m = [1, 0, 0, 1, 0, 0];
    this.fillStyle = '#000'; this.strokeStyle = '#000'; this.lineWidth = 1; this.lineCap = 'butt'; this.lineJoin = 'miter'; this.miterLimit = 10;
    this.globalAlpha = 1; this.font = '10px sans-serif'; this.textAlign = 'start'; this.textBaseline = 'alphabetic'; this.dash = []; this.lineDashOffset = 0;
    this.path = []; this.cx = null; this.cy = null; this.sx = 0; this.sy = 0;
  }
  save() {
    this.st.push([this.m.slice(), this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.globalAlpha, this.font, this.textAlign, this.textBaseline, this.dash.slice(), this.miterLimit]);
    this.pst.push(Object.assign({}, this.ps)); this.out.push('q');
  }
  restore() {
    const s = this.st.pop(); if (!s) return;
    [this.m, this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.globalAlpha, this.font, this.textAlign, this.textBaseline, this.dash, this.miterLimit] = s;
    this.ps = this.pst.pop(); this.out.push('Q');
  }
  _mul(a, b, c, d, e, f) { const m = this.m; this.m = [m[0] * a + m[2] * b, m[1] * a + m[3] * b, m[0] * c + m[2] * d, m[1] * c + m[3] * d, m[0] * e + m[2] * f + m[4], m[1] * e + m[3] * f + m[5]]; }
  translate(x, y) { this._mul(1, 0, 0, 1, x, y); }
  rotate(a) { const c = Math.cos(a), s = Math.sin(a); this._mul(c, s, -s, c, 0, 0); }
  scale(x, y) { this._mul(x, 0, 0, y, 0, 0); }
  transform(a, b, c, d, e, f) { this._mul(a, b, c, d, e, f); }
  setTransform(a, b, c, d, e, f) { this.m = a && typeof a === 'object' ? [a.a, a.b, a.c, a.d, a.e, a.f] : [a, b, c, d, e, f]; }
  resetTransform() { this.m = [1, 0, 0, 1, 0, 0]; }
  _tx(x, y) { const m = this.m; return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]; }
  _scale() { const m = this.m; return Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1; }
  beginPath() { this.path = []; this.cx = null; }
  moveTo(x, y) { const [X, Y] = this._tx(x, y); this.path.push('M', X, Y); this.cx = this.sx = X; this.cy = this.sy = Y; }
  _lineDev(X, Y) { if (this.cx == null) { this.path.push('M', X, Y); this.sx = X; this.sy = Y; } else this.path.push('L', X, Y); this.cx = X; this.cy = Y; }
  lineTo(x, y) { const [X, Y] = this._tx(x, y); this._lineDev(X, Y); }
  closePath() { if (this.path.length) { this.path.push('Z'); this.cx = this.sx; this.cy = this.sy; } }
  rect(x, y, w, h) { this.moveTo(x, y); this.lineTo(x + w, y); this.lineTo(x + w, y + h); this.lineTo(x, y + h); this.closePath(); }
  bezierCurveTo(a, b, c, d, x, y) {
    if (this.cx == null) this.moveTo(a, b);
    const p1 = this._tx(a, b), p2 = this._tx(c, d), p = this._tx(x, y);
    this.path.push('C', p1[0], p1[1], p2[0], p2[1], p[0], p[1]); this.cx = p[0]; this.cy = p[1];
  }
  quadraticCurveTo(qx, qy, x, y) {
    if (this.cx == null) this.moveTo(qx, qy);
    const [QX, QY] = this._tx(qx, qy), [X, Y] = this._tx(x, y), x0 = this.cx, y0 = this.cy;
    this.path.push('C', x0 + 2 / 3 * (QX - x0), y0 + 2 / 3 * (QY - y0), X + 2 / 3 * (QX - X), Y + 2 / 3 * (QY - Y), X, Y); this.cx = X; this.cy = Y;
  }
  ellipse(x, y, rx, ry, rot, a0, a1, ccw) {
    const T = Math.PI * 2; let sw = a1 - a0;
    if (!ccw) { if (sw >= T) sw = T; else { sw %= T; if (sw < 0) sw += T; } }
    else if (-sw >= T) sw = -T; else { sw %= T; if (sw > 0) sw -= T; }
    const cr = Math.cos(rot || 0), sr = Math.sin(rot || 0);
    const pt = (t) => { const ex = rx * Math.cos(t), ey = ry * Math.sin(t); return [x + ex * cr - ey * sr, y + ex * sr + ey * cr]; };
    const der = (t) => { const ex = -rx * Math.sin(t), ey = ry * Math.cos(t); return [ex * cr - ey * sr, ex * sr + ey * cr]; };
    const p0 = pt(a0), d0 = this._tx(p0[0], p0[1]); this._lineDev(d0[0], d0[1]);
    if (Math.abs(sw) < 1e-9) return;
    const n = Math.max(1, Math.ceil(Math.abs(sw) / (Math.PI / 2) - 1e-9)), da = sw / n, k = 4 / 3 * Math.tan(da / 4);
    let t = a0;
    for (let i = 0; i < n; i++) {
      const t2 = t + da, pA = pt(t), dA = der(t), pB = pt(t2), dB = der(t2);
      const c1 = this._tx(pA[0] + k * dA[0], pA[1] + k * dA[1]), c2 = this._tx(pB[0] - k * dB[0], pB[1] - k * dB[1]), e = this._tx(pB[0], pB[1]);
      this.path.push('C', c1[0], c1[1], c2[0], c2[1], e[0], e[1]); this.cx = e[0]; this.cy = e[1]; t = t2;
    }
  }
  arc(x, y, r, a0, a1, ccw) { this.ellipse(x, y, r, r, 0, a0, a1, ccw); }
  arcTo(x1, y1, x2, y2, r) {
    if (this.cx == null) { this.moveTo(x1, y1); return; }
    const m = this.m, det = m[0] * m[3] - m[1] * m[2]; if (!det) return;
    const dx = this.cx - m[4], dy = this.cy - m[5];
    const x0 = (m[3] * dx - m[2] * dy) / det, y0 = (-m[1] * dx + m[0] * dy) / det;
    const v1x = x0 - x1, v1y = y0 - y1, v2x = x2 - x1, v2y = y2 - y1;
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-9 || l2 < 1e-9 || r <= 0 || Math.abs(v1x * v2y - v1y * v2x) < 1e-9 * l1 * l2) { this.lineTo(x1, y1); return; }
    const u1x = v1x / l1, u1y = v1y / l1, u2x = v2x / l2, u2y = v2y / l2;
    const ang = Math.acos(clamp(u1x * u2x + u1y * u2y, -1, 1));
    const dist = r / Math.tan(ang / 2), cd = r / Math.sin(ang / 2);
    const t1x = x1 + u1x * dist, t1y = y1 + u1y * dist, t2x = x1 + u2x * dist, t2y = y1 + u2y * dist;
    const bx = u1x + u2x, by = u1y + u2y, bl = Math.hypot(bx, by) || 1;
    const ccx = x1 + bx / bl * cd, ccy = y1 + by / bl * cd;
    const s = Math.atan2(t1y - ccy, t1x - ccx), e = Math.atan2(t2y - ccy, t2x - ccx);
    let d = e - s; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    this.lineTo(t1x, t1y);
    this.ellipse(ccx, ccy, r, r, 0, s, s + d, d < 0);
  }
  _pathFrom(p) {
    if (!p || !p.o) return this.path;
    const L = [], o = p.o;
    for (let i = 0; i < o.length;) {
      if (o[i] === 2) { L.push('Z'); i += 1; continue; }
      const q = this._tx(o[i + 1], o[i + 2]); L.push(o[i] === 0 ? 'M' : 'L', q[0], q[1]); i += 3;
    }
    return L;
  }
  _emit(P) {
    const o = [];
    for (let i = 0; i < P.length;) {
      const k = P[i];
      if (k === 'M' || k === 'L') { o.push(pn(P[i + 1]) + ' ' + pn(P[i + 2]) + (k === 'M' ? ' m' : ' l')); i += 3; }
      else if (k === 'C') { o.push(`${pn(P[i + 1])} ${pn(P[i + 2])} ${pn(P[i + 3])} ${pn(P[i + 4])} ${pn(P[i + 5])} ${pn(P[i + 6])} c`); i += 7; }
      else { o.push('h'); i += 1; }
    }
    this.out.push(o.join('\n'));
  }
  _alpha(kind, a) {
    a = Math.round(clamp(a, 0, 1) * 100) / 100;
    if (this.ps[kind] === a) return;
    const key = kind + a; let nm = this.gsAlpha.get(key);
    if (!nm) { nm = 'G' + this.gsAlpha.size; this.gsAlpha.set(key, nm); }
    this.out.push('/' + nm + ' gs'); this.ps[kind] = a;
  }
  _color(op, c) { const s = pn3(c[0]) + ' ' + pn3(c[1]) + ' ' + pn3(c[2]) + ' ' + op; if (this.ps[op] !== s) { this.out.push(s); this.ps[op] = s; } }
  _strokeState() {
    const sc = this._scale();
    const w = pn(Math.max(0.02, this.lineWidth * sc)); if (this.ps.w !== w) { this.out.push(w + ' w'); this.ps.w = w; }
    const J = { butt: 0, round: 1, square: 2 }[this.lineCap] || 0; if (this.ps.J !== J) { this.out.push(J + ' J'); this.ps.J = J; }
    const j = { miter: 0, round: 1, bevel: 2 }[this.lineJoin] || 0; if (this.ps.j !== j) { this.out.push(j + ' j'); this.ps.j = j; }
    const d = '[' + this.dash.map((v) => pn(v * sc)).join(' ') + '] 0 d'; if (this.ps.d !== d) { this.out.push(d); this.ps.d = d; }
  }
  fill(a, b) {
    const p = a && typeof a === 'object' ? a : null, rule = p ? b : a;
    const list = this._pathFrom(p); if (!list.length) return;
    const c = parseColor(this.fillStyle), al = c[3] * this.globalAlpha; if (al < 0.004) return;
    this._alpha('ca', al); this._color('rg', c); this._emit(list); this.out.push(rule === 'evenodd' ? 'f*' : 'f');
  }
  stroke(p) {
    const list = this._pathFrom(p); if (!list.length) return;
    const c = parseColor(this.strokeStyle), al = c[3] * this.globalAlpha; if (al < 0.004) return;
    this._alpha('CA', al); this._color('RG', c); this._strokeState(); this._emit(list); this.out.push('S');
  }
  clip(a, b) {
    const p = a && typeof a === 'object' ? a : null, rule = p ? b : a;
    const list = this._pathFrom(p); if (!list.length) return;
    this._emit(list); this.out.push(rule === 'evenodd' ? 'W* n' : 'W n');
  }
  _withTemp(fn) { const sv = [this.path, this.cx, this.cy, this.sx, this.sy]; this.beginPath(); fn(); [this.path, this.cx, this.cy, this.sx, this.sy] = sv; }
  fillRect(x, y, w, h) { this._withTemp(() => { this.rect(x, y, w, h); this.fill(); }); }
  strokeRect(x, y, w, h) { this._withTemp(() => { this.rect(x, y, w, h); this.stroke(); }); }
  clearRect() { }
  drawImage() { }
  setLineDash(a) { this.dash = Array.isArray(a) ? a.filter((v) => isFinite(v) && v >= 0) : []; if (this.dash.length % 2) this.dash = this.dash.concat(this.dash); }
  getLineDash() { return this.dash.slice(); }
  measureText(s) { const mc = pdfMeasure(); mc.font = this.font; return mc.measureText(s); }
  fillText(s, x, y) { this._text(s, x, y, false); }
  strokeText(s, x, y) { this._text(s, x, y, true); }
  _text(str, x, y, stroke) {
    str = String(str == null ? '' : str); if (!str.trim()) return;
    const col = parseColor(stroke ? this.strokeStyle : this.fillStyle), al = col[3] * this.globalAlpha; if (al < 0.004) return;
    const f = parseFont(this.font), mc = pdfMeasure(); mc.font = this.font;
    const W = mc.measureText(str).width, bytes = winAnsiBytes(str), hw = helvWidth(bytes, f.bold) * f.size;
    const ta = this.textAlign, dx = ta === 'center' ? -W / 2 : ta === 'right' || ta === 'end' ? -W : 0;
    const X = x + dx, Y = y + baselineOffset(this.font, this.textBaseline), m = this.m;
    const tm = [m[0], m[1], -m[2], -m[3], m[0] * X + m[2] * Y + m[4], m[1] * X + m[3] * Y + m[5]];
    if (stroke) { this._alpha('CA', al); this._color('RG', col); this._strokeState(); }
    else { this._alpha('ca', al); this._color('rg', col); }
    const tz = hw > 0 ? clamp(100 * W / hw, 30, 220) : 100;
    this.out.push(`BT /${f.bold ? 'F2' : 'F1'} ${pn(f.size)} Tf ${pn(tz)} Tz ${stroke ? 1 : 0} Tr ${tm.map(pn4).join(' ')} Tm ${pdfStr(bytes)} Tj ET`);
  }
}

/* Assemblage du fichier PDF */
async function deflateBytes(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    const cs = new CompressionStream('deflate');
    const done = new Response(cs.readable).arrayBuffer();
    const w = cs.writable.getWriter(); await w.write(bytes); await w.close();
    return new Uint8Array(await done);
  } catch (e) { return null; }
}
function pdfText16(s) { let hx = '<FEFF'; for (let i = 0; i < s.length; i++) hx += s.charCodeAt(i).toString(16).padStart(4, '0').toUpperCase(); return hx + '>'; }
async function buildPdf(pages, title) {
  const enc = new TextEncoder();
  const objs = [];
  const add = (o) => { objs.push(o); return objs.length; };
  add(null); add(null); // 1 catalogue, 2 pages
  const F1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const F2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const d = new Date(), z2 = (v) => String(v).padStart(2, '0');
  const INFO = add(`<< /Title ${pdfText16(title || 'Plan')} /Creator (Calque) /Producer (Calque) /CreationDate (D:${d.getFullYear()}${z2(d.getMonth() + 1)}${z2(d.getDate())}${z2(d.getHours())}${z2(d.getMinutes())}${z2(d.getSeconds())}) >>`);
  const kids = [];
  for (const pg of pages) {
    const raw = enc.encode(pg.ctx.out.join('\n'));
    const z = await deflateBytes(raw);
    const cid = add({ dict: z ? '/Filter /FlateDecode' : '', data: z || raw });
    let gs = '';
    for (const [key, nm] of pg.ctx.gsAlpha) gs += `/${nm} << /Type /ExtGState /${key.slice(0, 2)} ${key.slice(2)} >> `;
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pn(pg.W)} ${pn(pg.H)}] /Resources << /Font << /F1 ${F1} 0 R /F2 ${F2} 0 R >>${gs ? ' /ExtGState << ' + gs + '>>' : ''} >> /Contents ${cid} 0 R >>`));
  }
  objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
  objs[1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
  const chunks = [], offs = []; let off = 0;
  const put = (u) => { chunks.push(u); off += u.length; };
  const puts = (s) => put(enc.encode(s));
  puts('%PDF-1.4\n%âãÏÓ\n');
  objs.forEach((o, i) => {
    offs.push(off);
    puts(`${i + 1} 0 obj\n`);
    if (typeof o === 'string') puts(o);
    else { puts(`<< /Length ${o.data.length} ${o.dict} >>\nstream\n`); put(o.data); puts('\nendstream'); }
    puts('\nendobj\n');
  });
  const xref = off;
  puts(`xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join(''));
  puts(`trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${INFO} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(chunks, { type: 'application/pdf' });
}

/* ---------------- export : réglages et contenu ---------------- */
const EXP_DEF = { fmt: 'png', lv: '', dims: true, names: true, areas: true, furn: true, elec: true, legend: true, title: true, bg: 'white', q: 'std', paper: 'A4', orient: 'auto', scale: 'auto' };
function expOpts() {
  if (!S.exp || typeof S.exp !== 'object') S.exp = {};
  for (const k in EXP_DEF) if (!(k in S.exp)) S.exp[k] = EXP_DEF[k];
  return S.exp;
}
function expLevels(o) {
  if (o.lv === 'all') return levelsSorted().filter((l) => contentBBox(l.id));
  const l = levelOf(o.lv) || levelOf(ui.lv);
  return l && contentBBox(l.id) ? [l] : [];
}
function unionBB(list) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const x of list) if (x) { b.x0 = Math.min(b.x0, x.x0); b.y0 = Math.min(b.y0, x.y0); b.x1 = Math.max(b.x1, x.x1); b.y1 = Math.max(b.y1, x.y1); }
  return b;
}
function withExportLayers(o, fn) {
  const L = S.layers, save = Object.assign({}, L), dm = S.dimMode;
  L.ghost = false; L.grid = false; L.names = !!o.names; L.areas = !!o.areas; L.elec = !!o.elec; L.furn = !!o.furn;
  L.dims = !!o.dims;
  try { return fn(); } finally { Object.assign(L, save); S.dimMode = dm; }
}
function legendItems(ids) {
  const set = new Set(ids);
  const elecs = P.elec.filter((e) => set.has(e.lv) && elecVisible(e));
  const types = ELEC.filter((d) => elecs.some((e) => e.type === d.t)).map((d) => ({ d, n: elecs.filter((e) => e.type === d.t).length }));
  const ducts = [['vmc', 'Conduit de VMC'], ['elec', 'Gaine électrique']]
    .map(([sys, n]) => ({ sys, n, L: P.ducts.filter((d) => set.has(d.lv) && d.sys === sys && ductVisible(d)).reduce((a, d) => a + ductLen(d), 0) }))
    .filter((x) => x.L > 0);
  return { types, ducts, rows: types.length + ducts.length };
}
/* une ligne de légende : symbole, nom, quantité (unités de l'écran courant) */
function drawLegendRow(c, row, x, y, w, rh, bg) {
  const u = rh * 0.62, fs = Math.max(5, rh * 0.36);
  if (row.d) {
    const d = row.d;
    c.save(); c.translate(x + u * 0.75, d.wall ? y + rh * 0.5 - u * 0.42 : y + rh * 0.5); c.scale(u, u);
    c.lineWidth = 1.5 / 26; c.strokeStyle = LIGHT.elec; c.lineJoin = 'round'; c.lineCap = 'round';
    d.draw(c, { px: 1 / 26, unit: u, ink: LIGHT.ink, ink2: LIGHT.ink2, bg, elec: LIGHT.elec, font: FONT_LABEL });
    c.restore();
  } else {
    const yy = y + rh * 0.5;
    c.save(); c.lineCap = 'round';
    if (row.sys === 'vmc') { c.strokeStyle = LIGHT.vmc; c.lineWidth = rh * 0.26; c.beginPath(); c.moveTo(x + u * 0.1, yy); c.lineTo(x + u * 1.4, yy); c.stroke(); c.strokeStyle = '#FFFFFF'; c.lineWidth = rh * 0.15; c.stroke(); }
    else { c.strokeStyle = LIGHT.gaine; c.lineWidth = Math.max(0.6, rh * 0.07); c.setLineDash([rh * 0.3, rh * 0.1, rh * 0.07, rh * 0.1]); c.beginPath(); c.moveTo(x + u * 0.1, yy); c.lineTo(x + u * 1.4, yy); c.stroke(); }
    c.restore();
  }
  c.textBaseline = 'middle';
  c.fillStyle = LIGHT.ink; c.textAlign = 'left'; c.font = `500 ${fs}px ${FONT_UI}`;
  const qty = row.d ? '× ' + row.n : fmtLenU(row.L);
  c.save(); c.font = `700 ${fs}px ${FONT_LABEL}`; const qw = c.measureText(qty).width; c.restore();
  let name = row.d ? row.d.n : row.n; const maxW = w - u * 1.9 - qw - fs;
  if (c.measureText(name).width > maxW) { while (name.length > 4 && c.measureText(name + '…').width > maxW) name = name.slice(0, -1); name += '…'; }
  c.fillText(name, x + u * 1.9, y + rh * 0.5);
  c.textAlign = 'right'; c.font = `700 ${fs}px ${FONT_LABEL}`; c.fillText(qty, x + w, y + rh * 0.5);
  c.textAlign = 'left';
}
function scaleBarLen(s, minPx, maxPx) {
  for (const L of [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (L * s >= minPx && L * s <= maxPx) return L;
  return 100;
}
function drawScaleBar(c, x, y, s, L, fs) {
  const w = L * s, hh = Math.max(2, fs * 0.38);
  c.save(); c.lineWidth = Math.max(0.5, fs * 0.08); c.strokeStyle = LIGHT.ink;
  for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#FFFFFF' : LIGHT.ink; c.fillRect(x + (w / 4) * i, y, w / 4, hh); }
  c.strokeRect(x, y, w, hh);
  c.fillStyle = LIGHT.ink; c.font = `600 ${fs}px ${FONT_LABEL}`; c.textBaseline = 'alphabetic';
  c.textAlign = 'left'; c.fillText('0', x, y - fs * 0.35);
  c.textAlign = 'right'; c.fillText(fmtReal(L), x + w, y - fs * 0.35);
  c.restore();
}
const fmtReal = (cm) => (cm >= 100 ? NFc.format(cm / 100) + ' m' : NFc.format(cm) + ' cm');
const fmtDate = () => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date());
function levelsArea(lvs) { let s = 0; for (const L of lvs) for (const r of geo(L.id).rooms) s += r.area; return s; }

/* ---------------- image PNG ---------------- */
function composePNG(o, maxPx) {
  const lvs = expLevels(o); if (!lvs.length) return null;
  const ids = lvs.map((l) => l.id), U = unionBB(lvs.map((l) => contentBBox(l.id)));
  const pad = 70, Wcm = U.x1 - U.x0 + pad * 2, Hcm = U.y1 - U.y0 + pad * 2;
  const n = lvs.length, gap = 40;
  const leg = o.elec && o.legend ? legendItems(ids) : { types: [], ducts: [], rows: 0 };
  const legW = leg.rows ? 330 : 0, head = o.title ? 92 : 16, sub = n > 1 ? 34 : 0;
  const availW = Math.max(900, 1600 - legW), availH = 1100;
  const s = clamp(Math.min((availW - gap * (n - 1)) / (Wcm * n), availH / Hcm), 0.12, 2.4);
  const pw = Wcm * s, ph = Hcm * s;
  const cssW = Math.ceil(16 + pw * n + gap * (n - 1) + 16 + legW), cssH = Math.ceil(Math.max(head + sub + ph + 16, leg.rows * 38 + 120));
  let z = (o.q === 'hd' ? 4400 : 2400) / cssW;
  if (cssW * cssH * z * z > 15e6) z = Math.sqrt(15e6 / (cssW * cssH));
  if (maxPx) z = Math.min(z, maxPx / Math.max(cssW, cssH));
  z = clamp(z, 0.2, 6);
  const cvs = document.createElement('canvas'); cvs.width = Math.max(1, Math.round(cssW * z)); cvs.height = Math.max(1, Math.round(cssH * z));
  const c = cvs.getContext('2d');
  const transp = o.bg === 'transparent';
  const Cx = Object.assign({}, LIGHT, transp ? { paper: 'rgba(0,0,0,0)', halo: '#FFFFFF' } : {});
  if (!transp) { c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, cvs.width, cvs.height); }
  const prevRC = RC;
  try {
    withExportLayers(o, () => {
      lvs.forEach((L, i) => {
        const x0 = 16 + i * (pw + gap), y0 = head + sub;
        setRC({ ctx: c, w: cssW, h: cssH, dpr: z, s, ox: x0 + (pad - U.x0) * s, oy: y0 + (pad - U.y0) * s, px: 1 / s, C: Cx, ts: 1 });
        c.save(); setScreen(); c.beginPath(); c.rect(x0, y0, pw, ph); c.clip();
        drawScene(L.id, { export: true, furn: o.furn, dims: o.dims });
        c.restore();
        if (n > 1) { setScreen(); c.fillStyle = LIGHT.ink; c.font = `700 17px ${FONT_UI}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(L.name, x0 + 4, head + 22); }
      });
      setRC({ ctx: c, w: cssW, h: cssH, dpr: z, s, ox: 0, oy: 0, px: 1 / s, C: Cx, ts: 1 });
      setScreen();
      const planW = cssW - legW;
      if (o.title) {
        c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.fillStyle = LIGHT.ink;
        c.font = `700 26px ${FONT_UI}`; c.fillText(P.name || 'Plan', 24, 44);
        c.font = `500 15px ${FONT_UI}`; c.fillStyle = LIGHT.ink2;
        c.fillText(`${lvs.map((l) => l.name).join(' · ')} · ${fmtArea(levelsArea(lvs))} au sol · ${fmtDate()}`, 24, 70);
        const L = scaleBarLen(s, 70, 220);
        drawScaleBar(c, planW - 32 - L * s, 60, s, L, 13);
      }
      if (leg.rows) {
        const x0 = planW;
        if (!transp) { c.fillStyle = '#F4F5F2'; c.fillRect(x0, 0, legW, cssH); }
        c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = LIGHT.ink; c.font = `700 17px ${FONT_UI}`;
        c.fillText('Légende électrique', x0 + 24, 44);
        let y = 72;
        for (const r of leg.types) { drawLegendRow(c, r, x0 + 22, y, legW - 46, 38, transp ? '#FFFFFF' : '#F4F5F2'); y += 38; }
        for (const r of leg.ducts) { drawLegendRow(c, r, x0 + 22, y, legW - 46, 38, '#F4F5F2'); y += 38; }
      }
    });
  } finally { setRC(prevRC); }
  return { cvs, lvs };
}

/* ---------------- PDF à l'échelle ---------------- */
const PAPERS = { A4: [595.28, 841.89], A3: [841.89, 1190.55] };
const SCALES = [20, 25, 50, 100, 200, 500, 1000];
const PT_CM = 72 / 2.54;
function pdfLayout(o) {
  const lvs = expLevels(o); if (!lvs.length) return null;
  const ids = lvs.map((l) => l.id), U = unionBB(lvs.map((l) => contentBBox(l.id)));
  const padCm = 55, Wcm = U.x1 - U.x0 + padCm * 2, Hcm = U.y1 - U.y0 + padCm * 2;
  const leg = o.elec && o.legend ? legendItems(ids) : { types: [], ducts: [], rows: 0 };
  const hasSide = o.title || leg.rows > 0;
  const [pw, ph] = PAPERS[o.paper] || PAPERS.A4;
  const mk = (land) => {
    const W = land ? ph : pw, H = land ? pw : ph, M = 22;
    const frame = { x: M, y: M, w: W - 2 * M, h: H - 2 * M };
    let plan, side = null;
    if (!hasSide) plan = { x: frame.x + 8, y: frame.y + 8, w: frame.w - 16, h: frame.h - 16 };
    else if (land) { const sw = o.paper === 'A3' ? 200 : 170; side = { x: frame.x + frame.w - sw, y: frame.y, w: sw, h: frame.h }; plan = { x: frame.x + 8, y: frame.y + 8, w: frame.w - sw - 16, h: frame.h - 16 }; }
    else { const sh = leg.rows ? (o.paper === 'A3' ? 190 : 160) : 86; side = { x: frame.x, y: frame.y + frame.h - sh, w: frame.w, h: sh }; plan = { x: frame.x + 8, y: frame.y + 8, w: frame.w - 16, h: frame.h - sh - 16 }; }
    return { W, H, frame, plan, side, land, fit: Math.min(plan.w / Wcm, plan.h / Hcm) };
  };
  let page;
  if (o.orient === 'portrait') page = mk(false);
  else if (o.orient === 'landscape') page = mk(true);
  else { const a = mk(true), b = mk(false); page = b.fit > a.fit * 1.04 ? b : a; }
  const fitsAt = (N) => Wcm * PT_CM / N <= page.plan.w + 0.01 && Hcm * PT_CM / N <= page.plan.h + 0.01;
  let N, fitted = false;
  if (o.scale === 'auto') { N = SCALES.find(fitsAt); if (!N) { fitted = true; N = PT_CM / page.fit; } }
  else N = +o.scale || 100;
  const k = fitted ? page.fit : PT_CM / N;
  return { lvs, ids, U, leg, page, N, k, fitted, fits: fitted || fitsAt(N) };
}
function drawPdfPage(c, lay, L, idx, dpr) {
  const { page, k } = lay, { frame, plan, side } = page, o = expOpts();
  const prevRC = RC;
  try {
    setRC({ ctx: c, w: page.W, h: page.H, dpr, s: k, ox: 0, oy: 0, px: 0.62 / k, C: LIGHT, ts: 0.62 });
    setScreen(); c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, page.W, page.H);
    RC.ox = plan.x + plan.w / 2 - ((lay.U.x0 + lay.U.x1) / 2) * k;
    RC.oy = plan.y + plan.h / 2 - ((lay.U.y0 + lay.U.y1) / 2) * k;
    withExportLayers(o, () => {
      c.save(); setScreen(); c.beginPath(); c.rect(plan.x, plan.y, plan.w, plan.h); c.clip();
      drawScene(L.id, { export: true, furn: o.furn, dims: o.dims });
      c.restore();
    });
    setScreen();
    c.strokeStyle = LIGHT.ink; c.lineWidth = 0.9; c.setLineDash([]); c.strokeRect(frame.x, frame.y, frame.w, frame.h);
    if (!side) return;
    c.lineWidth = 0.6; c.beginPath();
    if (page.land) { c.moveTo(side.x, side.y); c.lineTo(side.x, side.y + side.h); } else { c.moveTo(side.x, side.y); c.lineTo(side.x + side.w, side.y); }
    c.stroke();
    // cartouche
    const cw = page.land ? side.w : Math.min(196, side.w * 0.4);
    const ch = o.title ? 142 : 0;
    const cx = page.land ? side.x : side.x + side.w - cw, cy = page.land ? side.y + side.h - ch : side.y;
    if (o.title) {
      if (!page.land) { c.beginPath(); c.moveTo(cx, side.y); c.lineTo(cx, side.y + side.h); c.stroke(); }
      else { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + cw, cy); c.stroke(); }
      const x = cx + 10, w = cw - 20; let y = cy + 18;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = LIGHT.ink;
      c.font = `700 11px ${FONT_UI}`; let t = P.name || 'Plan';
      while (t.length > 4 && c.measureText(t).width > w) t = t.slice(0, -2) + '…';
      c.fillText(t, x, y); y += 13;
      c.font = `600 9px ${FONT_UI}`; c.fillStyle = LIGHT.ink2; c.fillText(L.name, x, y); y += 9;
      const rows = [
        ['Échelle', lay.fitted ? 'ajustée à la page' : '1:' + lay.N],
        ['Format', `${o.paper} ${page.land ? 'paysage' : 'portrait'}`],
        ['Surface', fmtArea(levelsArea([L]))],
        ['Date', fmtDate()],
        ['Page', `${idx + 1} / ${lay.lvs.length}`],
      ];
      c.font = `500 7.5px ${FONT_UI}`;
      for (const [a, b] of rows) {
        y += 11.5; c.fillStyle = LIGHT.ink2; c.textAlign = 'left'; c.fillText(a, x, y);
        c.fillStyle = LIGHT.ink; c.textAlign = 'right'; c.font = `600 7.5px ${FONT_UI}`; c.fillText(b, x + w, y); c.font = `500 7.5px ${FONT_UI}`;
      }
      if (!lay.fitted) { const Lb = scaleBarLen(k, 40, w * 0.8); drawScaleBar(c, x, y + 16, k, Lb, 6.5); }
      c.textAlign = 'right'; c.fillStyle = LIGHT.ink2; c.font = `700 6px ${FONT_UI}`; c.fillText('CALQUE', x + w, cy + ch - 6);
      c.textAlign = 'left';
    }
    // légende (symboles du niveau de cette page)
    const legL = lay.lvs.length > 1 ? legendItems([L.id]) : lay.leg;
    if (lay.leg.rows && legL.rows) {
      const lx = page.land ? side.x + 10 : side.x + 10, ly = side.y + 10;
      const lw = page.land ? side.w - 20 : side.w - (o.title ? cw : 0) - 20;
      const lh = page.land ? side.h - ch - 20 : side.h - 20;
      c.fillStyle = LIGHT.ink2; c.font = `700 6.5px ${FONT_UI}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillText('LÉGENDE', lx, ly + 6);
      const all = [...legL.types, ...legL.ducts];
      const avail = lh - 14;
      let rh = 13, cols = 1;
      if (page.land) rh = clamp(avail / all.length, 8, 13);
      else { cols = Math.max(1, Math.floor(lw / 150)); rh = clamp(avail / Math.ceil(all.length / cols), 8, 13); }
      const perCol = Math.max(1, Math.floor(avail / rh)), colW = lw / cols;
      all.slice(0, perCol * cols).forEach((r, i) => {
        const col = Math.floor(i / perCol), row = i % perCol;
        drawLegendRow(c, r, lx + col * colW, ly + 12 + row * rh, colW - (cols > 1 ? 10 : 0), rh, '#FFFFFF');
      });
      if (all.length > perCol * cols) { c.fillStyle = LIGHT.ink2; c.font = `500 6px ${FONT_UI}`; c.fillText(`+ ${all.length - perCol * cols} autres symboles`, lx, ly + 12 + perCol * rh + 6); }
    }
  } finally { setRC(prevRC); }
}
async function composePDF(o) {
  const lay = pdfLayout(o); if (!lay) return null;
  const pages = lay.lvs.map((L, i) => { const ctx = new PdfCtx(lay.page.W, lay.page.H); drawPdfPage(ctx, lay, L, i, 1); return { W: lay.page.W, H: lay.page.H, ctx }; });
  return buildPdf(pages, P.name || 'Plan');
}

/* ---------------- livrer un fichier : copier, partager, enregistrer ---------------- */
const CAN_SHARE_FILES = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.png', { type: 'image/png' })] })); } catch (e) { return false; } })();
async function saveFile(file) {
  const dl = await getDownloads();
  if (dl) { try { await dl.save({ filename: file.name, data: file }); return true; } catch (e) { if (e && e.code === 'declined') return true; } }
  return saveBlobLocal(file, file.name);
}
async function shareFile(file) {
  if (CAN_SHARE_FILES) {
    try { await navigator.share({ files: [file], title: file.name }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  return (await saveFile(file)) ? 'saved' : 'fail';
}
function copyImageBlob(blobOrPromise) {
  try {
    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') return Promise.reject(new Error('clipboard'));
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOrPromise })]);
  } catch (e) { return Promise.reject(e); }
}
function afterShare(r, saved) {
  if (r === 'shared') toast('Fichier partagé.');
  else if (r === 'saved') toast(saved || 'Fichier enregistré.');
  else if (r === 'fail') toast('Impossible d’enregistrer le fichier ici.');
}
function fileActions(getFile, isImage, getBlobForCopy) {
  const out = [];
  if (isImage) out.push(btn('Copier l’image', () => {
    const b = getBlobForCopy();
    if (!b) { toast('Image en préparation…'); return; }
    copyImageBlob(b).then(() => toast('Image copiée : collez-la dans PowerPoint ou Keynote.'), () => toast('Copie impossible ici : utilisez « Partager » ou « Enregistrer ».'));
  }, 'pri exp-act', 'dup'));
  if (CAN_SHARE_FILES) out.push(btn('Partager…', async () => { const f = getFile(); if (!f) { toast('Fichier en préparation…'); return; } afterShare(await shareFile(f)); }, (isImage ? '' : 'pri ') + 'exp-act', 'up'));
  out.push(btn('Enregistrer', async () => { const f = getFile(); if (!f) { toast('Fichier en préparation…'); return; } afterShare((await saveFile(f)) ? 'saved' : 'fail'); }, (!isImage && !CAN_SHARE_FILES ? 'pri ' : '') + 'exp-act', 'down'));
  return out;
}
/* petite fenêtre pour une image déjà prête (tableau électrique, photo 3D) */
function openFileModal(title, file, note) {
  const isImg = /^image\//.test(file.type);
  const url = isImg ? URL.createObjectURL(file) : null;
  const prev = isImg ? h('div', { class: 'exp-prev' }, h('img', { src: url, alt: 'Aperçu' })) : null;
  openModal(title, prev, note ? h('p', { class: 'note' }, note) : null, btns(...fileActions(() => file, isImg && file.type === 'image/png', () => file)));
  $('#modal').classList.add('wide');
  if (url) setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/* ---------------- fenêtre d'export du plan ---------------- */
const EXS = { gen: 0, file: null, blob: null, timer: 0 };
function openExport() {
  if (ui.view === '3d' && typeof photo3D === 'function') { photo3D(); return; }
  if (!P.levels.some((l) => contentBBox(l.id))) { toast('Le plan est vide : dessinez d’abord quelques murs.'); return; }
  const o = expOpts();
  if (o.lv !== 'all' || P.levels.length < 2) o.lv = ui.lv;
  if (!contentBBox(o.lv) && o.lv !== 'all') o.lv = (levelsSorted().find((l) => contentBBox(l.id)) || {}).id || ui.lv;
  openModal('Exporter le plan');
  $('#modal').classList.add('wide');
  renderExport();
}
function expChip(label, on, onclick) { return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!on), onclick }, label); }
function renderExport() {
  const o = expOpts(), m = $('#modal'), body = m.querySelector('.mbody'); if (!body) return;
  const set = (k, v) => { o[k] = v; saveSettings(); renderExport(); };
  const tog = (k) => () => set(k, !o[k]);
  const lvChips = P.levels.length > 1
    ? [...levelsSorted().map((l) => expChip(l.name, o.lv === l.id, () => set('lv', l.id))), expChip(o.fmt === 'pdf' ? 'Tous (1 page par niveau)' : 'Tous côte à côte', o.lv === 'all', () => set('lv', 'all'))]
    : null;
  const lay = o.fmt === 'pdf' ? pdfLayout(o) : null;
  let note;
  if (o.fmt === 'png') note = 'Collez l’image directement dans PowerPoint, Keynote ou Google Slides. « Partager » l’envoie aussi vers Photos, Fichiers ou AirDrop.';
  else if (lay && !lay.fits) note = h('span', { style: 'color:var(--bad)' }, `Au 1:${lay.N}, le plan dépasse du ${o.paper} : choisissez un format plus grand ou une échelle plus petite.`);
  else if (lay && lay.fitted) note = 'Le plan est trop grand pour une échelle normalisée sur ce format : il est réduit pour tenir sur la page (ne pas mesurer à la règle).';
  else if (lay) note = `Échelle 1:${lay.N} : imprimez à 100 % (taille réelle), 1 cm sur le papier = ${fmtReal(lay.N)} en vrai.${o.lv === 'all' && lay.lvs.length > 1 ? ' Les niveaux ont le même cadrage : ils se superposent page à page.' : ''}`;
  const prevBox = $('#expPrev') || h('div', { class: 'exp-prev', id: 'expPrev' }, h('canvas', { id: 'expCv' }));
  prevBox.classList.toggle('chk', o.fmt === 'png' && o.bg === 'transparent');
  body.replaceChildren(...[
    segCtl([{ v: 'png', n: 'Image PNG' }, { v: 'pdf', n: 'PDF à l’échelle' }], o.fmt, (v) => set('fmt', v)),
    prevBox,
    lvChips ? sec('Niveau', h('div', { class: 'chips' }, lvChips)) : null,
    sec('Contenu', h('div', { class: 'chips' },
      expChip('Cotes', o.dims, tog('dims')), expChip('Noms des pièces', o.names, tog('names')), expChip('Surfaces', o.areas, tog('areas')),
      expChip('Mobilier', o.furn, tog('furn')), expChip('Électricité', o.elec, tog('elec')),
      o.elec ? expChip('Légende', o.legend, tog('legend')) : null, expChip(o.fmt === 'pdf' ? 'Cartouche' : 'Titre et échelle', o.title, tog('title')))),
    o.fmt === 'png'
      ? h('div', { class: 'row' },
        sec('Fond', segCtl([{ v: 'white', n: 'Blanc' }, { v: 'transparent', n: 'Transparent' }], o.bg, (v) => set('bg', v))),
        sec('Qualité', segCtl([{ v: 'std', n: 'Standard' }, { v: 'hd', n: 'Haute' }], o.q, (v) => set('q', v))))
      : [h('div', { class: 'row' },
        sec('Papier', segCtl([{ v: 'A4', n: 'A4' }, { v: 'A3', n: 'A3' }], o.paper, (v) => set('paper', v))),
        sec('Orientation', segCtl([{ v: 'auto', n: 'Auto' }, { v: 'portrait', n: 'Portrait' }, { v: 'landscape', n: 'Paysage' }], o.orient, (v) => set('orient', v)))),
      sec('Échelle', segCtl([{ v: 'auto', n: lay && o.scale === 'auto' ? (lay.fitted ? 'Ajustée' : `Auto (1:${lay.N})`) : 'Auto' }, { v: '50', n: '1:50' }, { v: '100', n: '1:100' }, { v: '200', n: '1:200' }], String(o.scale), (v) => set('scale', v)))],
    h('p', { class: 'note' }, note),
    h('div', { class: 'btns exp-btns' }, fileActions(() => EXS.file, o.fmt === 'png', () => EXS.blob || EXS.blobP)),
  ].flat().filter(Boolean));
  scheduleExport();
}
function scheduleExport() {
  const g = ++EXS.gen; EXS.file = null; EXS.blob = null; EXS.blobP = null;
  for (const b of $$('.exp-act')) b.disabled = true;
  clearTimeout(EXS.timer);
  EXS.timer = setTimeout(() => runExport(g), 60);
}
async function runExport(g) {
  const o = expOpts(), cv2 = $('#expCv'); if (!cv2 || g !== EXS.gen) return;
  const base = `${slug(P.name)}-${o.lv === 'all' ? 'niveaux' : slug((levelOf(o.lv) || {}).name)}`;
  const box = cv2.parentElement, bw = Math.max(200, box.clientWidth - 2), bh = 280;
  try {
    if (o.fmt === 'png') {
      let res; EXS.blobP = new Promise((r) => (res = r));
      const out = composePNG(o); if (!out) return;
      const ar = out.cvs.width / out.cvs.height, w = Math.min(bw, bh * ar), hgt = w / ar, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv2.width = Math.round(w * dpr); cv2.height = Math.round(hgt * dpr); cv2.style.width = w + 'px'; cv2.style.height = hgt + 'px';
      const pc = cv2.getContext('2d'); pc.clearRect(0, 0, cv2.width, cv2.height); pc.imageSmoothingQuality = 'high'; pc.drawImage(out.cvs, 0, 0, cv2.width, cv2.height);
      const blob = await new Promise((r) => out.cvs.toBlob(r, 'image/png'));
      out.cvs.width = out.cvs.height = 0;
      res(blob);
      if (g !== EXS.gen || !blob) return;
      EXS.blob = blob; EXS.file = new File([blob], base + '.png', { type: 'image/png' });
    } else {
      const lay = pdfLayout(o); if (!lay) return;
      const ar = lay.page.W / lay.page.H, w = Math.min(bw, bh * ar), hgt = w / ar, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv2.width = Math.round(w * dpr); cv2.height = Math.round(hgt * dpr); cv2.style.width = w + 'px'; cv2.style.height = hgt + 'px';
      drawPdfPage(cv2.getContext('2d'), lay, lay.lvs[0], 0, (w * dpr) / lay.page.W);
      await new Promise((r) => setTimeout(r, 0));
      if (g !== EXS.gen) return;
      const blob = await composePDF(o);
      if (g !== EXS.gen || !blob) return;
      EXS.file = new File([blob], base + '.pdf', { type: 'application/pdf' });
    }
    for (const b of $$('.exp-act')) b.disabled = false;
  } catch (err) { console.error(err); toast('Impossible de préparer l’export.'); }
  finally { requestRender(); }
}

/* fichier prêt à envoyer : le menu de partage de l'iPad (AirDrop, Mail, Messages, Fichiers) si possible, sinon téléchargement */
function shareableFile(data, name) {
  for (const type of ['application/json', 'text/plain']) {
    const f = new File([data], name, { type });
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) return { file: f, share: true }; } catch (e) { }
  }
  return { file: new File([data], name, { type: 'application/json' }), share: false };
}
function deliverFile(title, data, name, note) {
  const { file, share } = shareableFile(data, name);
  const copyBox = () => {
    const ta = h('textarea', { class: 'txt', style: 'height:160px;padding:8px;font-family:var(--f-num);font-size:12px', readonly: true }, data);
    openModal(title, h('p', { class: 'note' }, 'Copiez ce texte et collez-le dans un fichier .json pour le conserver.'), ta,
      btns(btn('Copier', () => { navigator.clipboard && navigator.clipboard.writeText(data).then(() => toast('Copié.'), () => { ta.select(); toast('Sélectionné : copiez avec Ctrl+C.'); }); }, 'pri')));
  };
  openModal(title,
    h('p', null, h('b', null, name), ' · ', NF1.format(data.length / 1024), ' Ko'),
    h('p', { class: 'note' }, note),
    btns(
      share ? btn('Envoyer…', async () => {
        try { await navigator.share({ files: [file], title: name }); closeModal(); toast('Fichier envoyé.'); }
        catch (e) { if (!(e && e.name === 'AbortError')) toast('Partage impossible : utilisez « Enregistrer ».'); }
      }, 'pri', 'up') : null,
      btn('Enregistrer', async () => { if (await saveFile(file)) { closeModal(); toast('Fichier enregistré.'); } else copyBox(); }, share ? '' : 'pri', 'down')));
}
function exportJSON() {
  const data = JSON.stringify(Object.assign({ format: 'calque-plan', version: 1 }, P));
  deliverFile('Envoyer le plan', data, `${slug(P.name)}.calque.json`,
    'Ce fichier contient tout le plan (murs, mobilier, électricité, tableau). Il se rouvre dans Calque sur n’importe quel appareil : menu … > Importer un fichier.');
}
/* sauvegarde complète : tous les plans de l'appareil dans un seul fichier */
async function exportAll() {
  await saveNow();
  const list = (await listProjects()).filter((p) => !(ui.isExample && P && p.id === P.id));
  const plans = [];
  for (const p of list) {
    const r = P && p.id === P.id ? { plan: JSON.parse(snapshot()), savedAt: ui.savedAt } : await loadProject(p.id);
    if (r) plans.push({ id: p.id, name: p.name, savedAt: r.savedAt || p.savedAt || 0, plan: r.plan });
  }
  if (!plans.length) { toast('Aucun plan enregistré à sauvegarder.'); return; }
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  /* « biblio » : références fabricant et composants personnalisés de l'appareil (ajouté en phase 2 ; ignoré par les anciennes versions) */
  const data = JSON.stringify({ format: 'calque-backup', version: 1, createdAt: d.getTime(), plans, biblio: exportUserLib() });
  deliverFile('Sauvegarder tous mes plans', data, `calque-sauvegarde-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.calque.json`,
    `${plans.length} plan${plans.length > 1 ? 's' : ''}. Gardez ce fichier dans Fichiers (iCloud Drive) ou envoyez-le par mail : il permet de tout retrouver, même sur un autre iPad. À l’import, aucun plan existant n’est écrasé.`);
}
const isPlanObj = (o) => o && typeof o === 'object' && Array.isArray(o.walls) && Array.isArray(o.nodes);
/* import d'une sauvegarde complète : n'écrase jamais un plan existant */
async function importBackup(o) {
  await saveNow();
  const have = new Map((await listProjects()).map((p) => [p.id, p]));
  let added = 0, same = 0, copies = 0;
  for (const x of o.plans) {
    if (!x || !isPlanObj(x.plan)) continue;
    const plan = migratePlan(x.plan).plan; delete plan.format; delete plan.version; delete plan.id;
    const json = JSON.stringify(plan);
    let id = typeof x.id === 'string' && x.id ? x.id : uid('p');
    if (have.has(id)) {
      const r = await loadProject(id);
      if (r) { const cur = Object.assign({}, r.plan); delete cur.id; if (JSON.stringify(cur) === json) { same++; continue; } }
      id = uid('p'); plan.name = (plan.name || 'Plan') + ' (importé)'; copies++;
    } else added++;
    const res = await writePlanLocal(id, plan.name || 'Plan', x.savedAt || Date.now(), JSON.stringify(plan));
    if (!res.idb && !res.ls) { notifySaveFail(); break; }
    await addVersion(id, plan.name || 'Plan', JSON.stringify(plan), 'Importé d’une sauvegarde');
  }
  if (P) lsSet('calque.cur', P.id);
  const parts = [];
  const lib = o.biblio ? await importUserLib(o.biblio) : null;
  if (lib && lib.refs.added) parts.push(`${lib.refs.added} référence${lib.refs.added > 1 ? 's' : ''} fabricant ajoutée${lib.refs.added > 1 ? 's' : ''}`);
  if (lib && lib.refs.kept) parts.push(`${lib.refs.kept} référence${lib.refs.kept > 1 ? 's' : ''} différente${lib.refs.kept > 1 ? 's' : ''} ignorée${lib.refs.kept > 1 ? 's' : ''} (la vôtre est gardée)`);
  if (lib && !lib.ok) parts.push('bibliothèque non enregistrée (stockage indisponible)');
  if (added) parts.push(`${added} plan${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}`);
  if (copies) parts.push(`${copies} en copie (un plan du même nom existait déjà et n’a pas été modifié)`);
  if (same) parts.push(`${same} déjà à jour`);
  toast(parts.length ? 'Sauvegarde importée : ' + parts.join(', ') + '.' : 'Aucun plan dans cette sauvegarde.');
  openProjects();
}
$('#fileIn').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  let o;
  try { o = JSON.parse(await f.text()); } catch (err) { toast('Ce fichier n’est pas un plan Calque valide.'); return; }
  try {
    if (o && o.format === 'calque-backup' && Array.isArray(o.plans)) { await importBackup(o); return; }
    if (!isPlanObj(o)) throw new Error('format');
    delete o.format; delete o.version; delete o.id;
    await saveNow();
    openPlan(o, uid('p'));
    scheduleSave();
    toast(`« ${P.name} » importé.`);
  } catch (err) { toast('Ce fichier n’est pas un plan Calque valide.'); }
});

export { BASECACHE, CAN_SHARE_FILES, COLCACHE, EXP_DEF, EXS, HELV, MC, PAPERS, PT_CM, PdfCtx, PdfPath, SCALES, WINANSI,
  afterShare, baselineOffset, buildPdf, composePDF, composePNG, copyImageBlob, deflateBytes, deliverFile,
  drawLegendRow, drawPdfPage, drawScaleBar, expChip, expLevels, expOpts, exportAll, exportJSON, fileActions, fmtDate,
  fmtReal, helvWidth, importBackup, isPlanObj, legendItems, levelsArea, mkPath, openExport, openFileModal, parseColor,
  parseFont, pdfLayout, pdfMeasure, pdfStr, pdfText16, pn, pn3, pn4, renderExport, runExport, saveFile, scaleBarLen,
  scheduleExport, shareFile, shareableFile, unionBB, winAnsiBytes, withExportLayers };

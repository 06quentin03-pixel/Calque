/* Calque — module « pdf » : écriture d'un fichier PDF sans bibliothèque.
   SANS ÉCRAN (testable avec Node) : sorti de export.js en phase 6 pour servir aussi au moteur documentaire.
   Un contexte « canvas » factice (PdfCtx) enregistre le dessin et le traduit en instructions PDF ;
   buildPdf assemble les pages. Polices standard Helvetica / Helvetica-Bold, codage WinAnsi. */
import { clamp } from './noyau.js';

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
/* mesure du texte : canvas du navigateur ; sans écran (Node), largeurs Helvetica */
const HELV_MC = { font: '10px sans-serif', textBaseline: 'alphabetic', measureText(s) { const f = parseFont(this.font); return { width: helvWidth(winAnsiBytes(s), f.bold) * f.size, actualBoundingBoxAscent: NaN }; } };
function pdfMeasure(helv) {
  if (helv) return HELV_MC;
  if (!MC) MC = typeof document !== 'undefined' && document.createElement ? document.createElement('canvas').getContext('2d') : HELV_MC;
  return MC;
}
/* largeur d'un texte en Helvetica (points) : sert à la mise en page des documents, identique dans Node et sur l'iPad */
function textWidth(str, size, bold) { return helvWidth(winAnsiBytes(String(str == null ? '' : str)), !!bold) * size; }
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
  constructor(W, H, opts) {
    this.isPdf = true; this.W = W; this.H = H; this.helv = !!(opts && opts.helv);
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
  /* image JPEG seulement : { jpeg: Uint8Array (octets du fichier JPEG), w, h } ; tout autre image est ignorée (comme avant) */
  drawImage(img, x, y, w, h) {
    if (!img || !(img.jpeg instanceof Uint8Array) || !(img.w > 0) || !(img.h > 0)) return;
    if (w == null) { w = img.w; h = img.h; }
    if (!this.images) this.images = new Map();
    let nm = this.images.get(img); if (!nm) { nm = 'Im' + (this.images.size + 1); this.images.set(img, nm); }
    this._alpha('ca', this.globalAlpha);
    const m = this.m, A = [w, 0, 0, -h, x, y + h];
    const M = [m[0] * A[0] + m[2] * A[1], m[1] * A[0] + m[3] * A[1], m[0] * A[2] + m[2] * A[3], m[1] * A[2] + m[3] * A[3], m[0] * A[4] + m[2] * A[5] + m[4], m[1] * A[4] + m[3] * A[5] + m[5]];
    this.out.push(`q ${M.map(pn4).join(' ')} cm /${nm} Do Q`);
  }
  setLineDash(a) { this.dash = Array.isArray(a) ? a.filter((v) => isFinite(v) && v >= 0) : []; if (this.dash.length % 2) this.dash = this.dash.concat(this.dash); }
  getLineDash() { return this.dash.slice(); }
  measureText(s) { const mc = pdfMeasure(this.helv); mc.font = this.font; return mc.measureText(s); }
  fillText(s, x, y) { this._text(s, x, y, false); }
  strokeText(s, x, y) { this._text(s, x, y, true); }
  _text(str, x, y, stroke) {
    str = String(str == null ? '' : str); if (!str.trim()) return;
    const col = parseColor(stroke ? this.strokeStyle : this.fillStyle), al = col[3] * this.globalAlpha; if (al < 0.004) return;
    const f = parseFont(this.font), mc = pdfMeasure(this.helv); mc.font = this.font;
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
async function buildPdf(pages, title, opts) {
  const compress = !(opts && opts.compress === false);
  const enc = new TextEncoder();
  const objs = [];
  const add = (o) => { objs.push(o); return objs.length; };
  add(null); add(null); // 1 catalogue, 2 pages
  const F1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const F2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const d = new Date(), z2 = (v) => String(v).padStart(2, '0');
  const INFO = add(`<< /Title ${pdfText16(title || 'Plan')} /Creator (Calque) /Producer (Calque) /CreationDate (D:${d.getFullYear()}${z2(d.getMonth() + 1)}${z2(d.getDate())}${z2(d.getHours())}${z2(d.getMinutes())}${z2(d.getSeconds())}) >>`);
  const kids = [], imgObjs = new Map();
  for (const pg of pages) {
    const raw = enc.encode(pg.ctx.out.join('\n'));
    const z = compress ? await deflateBytes(raw) : null;
    const cid = add({ dict: z ? '/Filter /FlateDecode' : '', data: z || raw });
    let gs = '';
    for (const [key, nm] of pg.ctx.gsAlpha) gs += `/${nm} << /Type /ExtGState /${key.slice(0, 2)} ${key.slice(2)} >> `;
    /* images JPEG (photos du chantier) : un objet par image, partagé entre les pages */
    let xo = '';
    if (pg.ctx.images) for (const [img, nm] of pg.ctx.images) {
      let id = imgObjs.get(img);
      if (!id) { id = add({ dict: `/Type /XObject /Subtype /Image /Width ${Math.round(img.w)} /Height ${Math.round(img.h)} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode`, data: img.jpeg }); imgObjs.set(img, id); }
      xo += `/${nm} ${id} 0 R `;
    }
    kids.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pn(pg.W)} ${pn(pg.H)}] /Resources << /Font << /F1 ${F1} 0 R /F2 ${F2} 0 R >>${gs ? ' /ExtGState << ' + gs + '>>' : ''}${xo ? ' /XObject << ' + xo + '>>' : ''} >> /Contents ${cid} 0 R >>`));
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

export { BASECACHE, COLCACHE, HELV, MC, PdfCtx, PdfPath, WINANSI, baselineOffset, buildPdf, deflateBytes, helvWidth, mkPath,
  parseColor, parseFont, pdfMeasure, pdfStr, pdfText16, pn, pn3, pn4, textWidth, winAnsiBytes };

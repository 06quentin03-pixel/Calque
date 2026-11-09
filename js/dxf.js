/* Calque — module « dxf » : écriture d'un fichier DXF (AutoCAD, format R12 en texte) sans bibliothèque.
   SANS ÉCRAN (testable avec Node). Le plan n'est jamais modifié.
   Principe : comme pour le PDF, un contexte « canvas » factice (DxfCtx) enregistre le dessin du plan fait par le
   moteur de rendu 2D ; il le traduit en traits (LINE, POLYLINE), cercles (CIRCLE) et textes (TEXT), rangés par
   calques (MURS, OUVERTURES, ELEC_APPAREILS…). Le dessin exporté est donc exactement celui de l'écran.
   Format R12 (AC1009) : le plus simple et le plus largement relu (AutoCAD, DraftSight, LibreCAD, QCAD, ArchiCAD, Revit).
   Coordonnées : celles du plan (centimètres, axe Y vers le bas), converties à l'écriture dans l'unité demandée,
   axe Y vers le haut. */
import { PdfCtx, WINANSI, parseColor, parseFont } from './pdf.js';

/* calques du fichier : nom → couleur AutoCAD (ACI) */
const DXF_CALQUES = {
  PIECES: 8, ESCALIERS: 40, MOBILIER: 30, MURS: 7, OUVERTURES: 4, ELEC_CHEMINEMENTS: 6, ELEC_LIAISONS: 3, ELEC_APPAREILS: 5,
  COTES: 1, TEXTES: 7, DIVERS: 9, CHANTIER: 2,
};
const DXF_UNITES = { mm: { k: 10, n: 'millimètres' }, cm: { k: 1, n: 'centimètres' }, m: { k: 0.01, n: 'mètres' } };

const r3 = (v) => { const r = Math.round(v * 1000) / 1000; return r === 0 ? '0' : String(r); };
/* texte DXF : le fichier est écrit en Windows-1252 (page de codes ANSI_1252, déclarée dans l'en-tête) : les lettres
   accentuées du français y sont ; tout autre caractère est écrit \U+XXXX */
function dxfTexte(s) {
  let o = '';
  for (const ch of String(s == null ? '' : s)) {
    let cp = ch.codePointAt(0);
    if (cp === 0x202F || cp === 0xA0 || cp === 0x2009) cp = 32;
    if (cp < 32) o += ' ';
    else if (cp < 127 || (cp >= 0xA1 && cp <= 0xFF) || WINANSI.has(cp)) o += String.fromCharCode(cp);
    else if (cp <= 0xFFFF) o += '\\U+' + cp.toString(16).toUpperCase().padStart(4, '0');
    else o += '?';
  }
  return o;
}
/* octets du fichier (Windows-1252) */
function dxfOctets(texte) {
  const u = new Uint8Array(texte.length);
  for (let i = 0; i < texte.length; i++) { const cp = texte.charCodeAt(i); u[i] = cp < 0x80 || (cp >= 0xA0 && cp <= 0xFF) ? cp : WINANSI.get(cp) || 63; }
  return u;
}
const nomCalque = (s) => (String(s || 'DIVERS').toUpperCase().replace(/[^A-Z0-9_]/g, '_').slice(0, 31) || 'DIVERS');

/* Contexte canvas factice : hérite de PdfCtx (transformations, chemins, courbes), enregistre des entités au lieu d'écrire un PDF */
class DxfCtx extends PdfCtx {
  constructor() {
    super(1, 1, { helv: true });
    this.ent = []; this.layer = null; this.vu = new Set(); this._circ = null; this._clip = false; this.dx = 0; this.dy = 0;
  }
  /* calque courant (appelé par drawSceneIn à chaque étape du dessin) ; null = rien n'est enregistré */
  calque(n) { this.layer = n ? nomCalque(n) : null; }
  beginPath() { super.beginPath(); this._circ = null; }
  arc(x, y, r, a0, a1, ccw) {
    const vide = this.path.length === 0;
    super.arc(x, y, r, a0, a1, ccw);
    const m = this.m, uni = Math.abs(Math.hypot(m[0], m[1]) - Math.hypot(m[2], m[3])) < 1e-6 * (1 + Math.hypot(m[0], m[1]));
    if (vide && uni && Math.abs(a1 - a0) >= Math.PI * 2 - 1e-6) { const c = this._tx(x, y); this._circ = { n: this.path.length, x: c[0], y: c[1], r: Math.abs(r) * this._scale() }; }
    else this._circ = null;
  }
  /* chemin → suites de points (courbes découpées en segments) */
  _polys(L) {
    const out = []; let cur = null, x0 = 0, y0 = 0;
    const fin = () => { if (cur && cur.p.length >= 4) out.push(cur); cur = null; };
    for (let i = 0; i < L.length;) {
      const k = L[i];
      if (k === 'M') { fin(); cur = { p: [L[i + 1], L[i + 2]], f: false }; x0 = L[i + 1]; y0 = L[i + 2]; i += 3; }
      else if (k === 'L') { if (!cur) cur = { p: [x0, y0], f: false }; cur.p.push(L[i + 1], L[i + 2]); x0 = L[i + 1]; y0 = L[i + 2]; i += 3; }
      else if (k === 'C') {
        if (!cur) cur = { p: [x0, y0], f: false };
        const [ax, ay, bx, by, ex, ey] = [L[i + 1], L[i + 2], L[i + 3], L[i + 4], L[i + 5], L[i + 6]];
        const len = Math.hypot(ax - x0, ay - y0) + Math.hypot(bx - ax, by - ay) + Math.hypot(ex - bx, ey - by);
        const n = Math.max(3, Math.min(24, Math.ceil(len / 5) + 2));
        for (let j = 1; j <= n; j++) {
          const t = j / n, u = 1 - t;
          cur.p.push(u * u * u * x0 + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * ex, u * u * u * y0 + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * ey);
        }
        x0 = ex; y0 = ey; i += 7;
      } else { if (cur) { cur.f = true; x0 = cur.p[0]; y0 = cur.p[1]; } fin(); i += 1; }
    }
    fin();
    return out;
  }
  _trace(p, plein) {
    if (!this.layer || this._clip) return;
    const style = plein ? this.fillStyle : this.strokeStyle;
    const c = parseColor(style), al = c[3] * this.globalAlpha;
    if (al < 0.05) return;
    /* aplat blanc ou presque (fond du papier, masque sous un symbole) : rien à tracer */
    if (plein && c[0] > 0.93 && c[1] > 0.93 && c[2] > 0.93 && this.layer !== 'PIECES') return;
    const tirets = !plein && this.dash.length > 0;
    if (!p && this._circ && (this.path.length === this._circ.n || this.path.length === this._circ.n + 1)) {
      const q = this._circ, cle = `${this.layer}|C|${r3(q.x)}|${r3(q.y)}|${r3(q.r)}`;
      if (!this.vu.has(cle)) { this.vu.add(cle); this.ent.push({ t: 'C', l: this.layer, x: q.x + this.dx, y: q.y + this.dy, r: q.r, d: tirets }); }
      return;
    }
    for (const pl of this._polys(this._pathFrom(p))) {
      const pts = pl.p;
      /* un contour rempli est toujours fermé */
      let f = pl.f || plein;
      if (f && pts.length >= 6 && Math.abs(pts[0] - pts[pts.length - 2]) < 1e-6 && Math.abs(pts[1] - pts[pts.length - 1]) < 1e-6) pts.length -= 2;
      if (pts.length < 4) continue;
      if (pts.length === 4) f = false;
      let lg = 0; for (let i = 2; i < pts.length; i += 2) lg += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]);
      if (lg < 1e-4) continue;
      const cle = this.layer + '|' + (f ? 'F' : 'O') + '|' + pts.map(r3).join(',');
      if (this.vu.has(cle)) continue; // même contour déjà tracé (remplissage puis trait)
      this.vu.add(cle);
      const q = new Array(pts.length);
      for (let i = 0; i < pts.length; i += 2) { q[i] = pts[i] + this.dx; q[i + 1] = pts[i + 1] + this.dy; }
      this.ent.push({ t: 'P', l: this.layer, p: q, f, d: tirets });
    }
  }
  fill(a) { this._trace(a && typeof a === 'object' ? a : null, true); }
  stroke(p) { this._trace(p && p.o ? p : null, false); }
  clip() { this._clip = true; } // hachures découpées (zone interdite) : non reprises, le contour suffit
  drawImage() { }
  save() { this.st.push([this.m.slice(), this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.globalAlpha, this.font, this.textAlign, this.textBaseline, this.dash.slice(), this.miterLimit, this._clip]); }
  restore() {
    const s = this.st.pop(); if (!s) return;
    [this.m, this.fillStyle, this.strokeStyle, this.lineWidth, this.lineCap, this.lineJoin, this.globalAlpha, this.font, this.textAlign, this.textBaseline, this.dash, this.miterLimit, this._clip] = s;
  }
  strokeText() { } // halo blanc autour des textes : inutile dans un DXF
  fillText(str, x, y) {
    str = String(str == null ? '' : str).trim(); if (!str || !this.layer) return;
    const col = parseColor(this.fillStyle); if (col[3] * this.globalAlpha < 0.05 || (col[0] > 0.93 && col[1] > 0.93 && col[2] > 0.93)) return;
    const f = parseFont(this.font), m = this.m, p = this._tx(x, y);
    const ta = this.textAlign, tb = this.textBaseline;
    this.ent.push({
      t: 'T', l: this.layer, x: p[0] + this.dx, y: p[1] + this.dy, s: str,
      h: f.size * Math.hypot(m[2], m[3]) * 0.72, // hauteur DXF = hauteur des capitales
      a: Math.atan2(m[1], m[0]),
      ah: ta === 'center' ? 1 : ta === 'right' || ta === 'end' ? 2 : 0,
      av: tb === 'middle' ? 2 : tb === 'top' || tb === 'hanging' ? 3 : tb === 'bottom' || tb === 'ideographic' ? 1 : 0,
    });
  }
}

/* Assemblage du fichier. ents : entités enregistrées (centimètres, Y vers le bas). opts : { unite: 'mm'|'cm'|'m', calques } */
function buildDxf(ents, opts) {
  const U = DXF_UNITES[(opts && opts.unite) || 'cm'] || DXF_UNITES.cm, k = U.k;
  const X = (v) => r3(v * k), Y = (v) => r3(-v * k);
  const cal = Object.assign({}, DXF_CALQUES, (opts && opts.calques) || {});
  const used = [...new Set(ents.map((e) => e.l))];
  for (const l of used) if (!(l in cal)) cal[l] = 7;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const vu = (x, y) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; };
  for (const e of ents) {
    if (e.t === 'P') for (let i = 0; i < e.p.length; i += 2) vu(e.p[i] * k, -e.p[i + 1] * k);
    else if (e.t === 'C') { vu((e.x - e.r) * k, -(e.y + e.r) * k); vu((e.x + e.r) * k, -(e.y - e.r) * k); }
    else vu(e.x * k, -e.y * k);
  }
  if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 1; }
  const o = [];
  const g = (code, val) => { o.push(String(code), String(val)); };
  g(0, 'SECTION'); g(2, 'HEADER');
  g(9, '$ACADVER'); g(1, 'AC1009');
  g(9, '$DWGCODEPAGE'); g(3, 'ANSI_1252');
  g(9, '$INSBASE'); g(10, 0); g(20, 0); g(30, 0);
  g(9, '$EXTMIN'); g(10, r3(x0)); g(20, r3(y0)); g(30, 0);
  g(9, '$EXTMAX'); g(10, r3(x1)); g(20, r3(y1)); g(30, 0);
  g(9, '$LTSCALE'); g(40, 1);
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'TABLES');
  g(0, 'TABLE'); g(2, 'LTYPE'); g(70, 2);
  g(0, 'LTYPE'); g(2, 'CONTINUOUS'); g(70, 0); g(3, 'Solid line'); g(72, 65); g(73, 0); g(40, 0);
  g(0, 'LTYPE'); g(2, 'DASHED'); g(70, 0); g(3, '__ __ __ __'); g(72, 65); g(73, 2); g(40, r3(15 * k)); g(49, r3(10 * k)); g(49, r3(-5 * k));
  g(0, 'ENDTAB');
  const noms = Object.keys(cal);
  g(0, 'TABLE'); g(2, 'LAYER'); g(70, noms.length + 1);
  g(0, 'LAYER'); g(2, '0'); g(70, 0); g(62, 7); g(6, 'CONTINUOUS');
  for (const n of noms) { g(0, 'LAYER'); g(2, n); g(70, 0); g(62, cal[n]); g(6, 'CONTINUOUS'); }
  g(0, 'ENDTAB');
  g(0, 'ENDSEC');
  g(0, 'SECTION'); g(2, 'ENTITIES');
  for (const e of ents) {
    if (e.t === 'P') {
      if (e.p.length === 4) {
        g(0, 'LINE'); g(8, e.l); if (e.d) g(6, 'DASHED');
        g(10, X(e.p[0])); g(20, Y(e.p[1])); g(11, X(e.p[2])); g(21, Y(e.p[3]));
      } else {
        g(0, 'POLYLINE'); g(8, e.l); if (e.d) g(6, 'DASHED'); g(66, 1); g(70, e.f ? 1 : 0);
        for (let i = 0; i < e.p.length; i += 2) { g(0, 'VERTEX'); g(8, e.l); g(10, X(e.p[i])); g(20, Y(e.p[i + 1])); }
        g(0, 'SEQEND'); g(8, e.l);
      }
    } else if (e.t === 'C') {
      g(0, 'CIRCLE'); g(8, e.l); if (e.d) g(6, 'DASHED'); g(10, X(e.x)); g(20, Y(e.y)); g(40, r3(e.r * k));
    } else if (e.t === 'T') {
      g(0, 'TEXT'); g(8, e.l); g(10, X(e.x)); g(20, Y(e.y)); g(40, r3(Math.max(e.h * k, 1e-3))); g(1, dxfTexte(e.s));
      const deg = -e.a * 180 / Math.PI; if (Math.abs(deg) > 1e-3) g(50, r3(((deg % 360) + 360) % 360));
      if (e.ah || e.av) { g(72, e.ah); g(11, X(e.x)); g(21, Y(e.y)); if (e.av) g(73, e.av); }
    }
  }
  g(0, 'ENDSEC'); g(0, 'EOF');
  return o.join('\r\n') + '\r\n';
}

/* décompte des entités d'un dessin enregistré (affichage et tests) */
function dxfBilan(ents) {
  const par = {}; let traits = 0, cercles = 0, textes = 0;
  for (const e of ents) { par[e.l] = (par[e.l] || 0) + 1; if (e.t === 'P') traits++; else if (e.t === 'C') cercles++; else textes++; }
  return { total: ents.length, traits, cercles, textes, calques: par };
}

export { DXF_CALQUES, DXF_UNITES, DxfCtx, buildDxf, dxfBilan, dxfOctets, dxfTexte };

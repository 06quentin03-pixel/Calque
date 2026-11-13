/* Calque — module « svgexport » : export SVG vectoriel du plan.
   Comme l'export DXF : le moteur 2D redessine le plan dans un contexte canvas factice qui enregistre chaque trait,
   remplissage et texte (hérite de PdfCtx : transformations, chemins, courbes), puis écrit un fichier SVG.
   Aucune image ni dégradé : le dessin reste vectoriel, en vraie grandeur (1 unité = 1 cm du plan).
   Sans écran (testable avec Node). */
import { PdfCtx, parseColor, parseFont } from './pdf.js';

const r2 = (v) => { const r = Math.round(v * 100) / 100; return r === 0 ? '0' : String(r); };
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const rgb = (c) => `rgb(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)})`;

class SvgCtx extends PdfCtx {
  constructor() {
    super(1, 1, { helv: true });
    this.el = []; this.nclip = 0; this.ouverts = 0; this.layer = null; this.groupe = null;
  }
  /* calque courant (annoncé par drawSceneIn) : chaque élément porte le nom de son calque (attribut class), comme dans le DXF */
  calque(n) { this.groupe = n ? String(n).toUpperCase().replace(/[^A-Z0-9_]/g, '_') : null; }
  get _cl() { return this.groupe ? ` class="${this.groupe}"` : ''; }
  save() { super.save(); this.st[this.st.length - 1].push(this.ouverts); this.ouverts = 0; }
  restore() {
    const s = this.st[this.st.length - 1]; if (!s) return;
    const ouv = this.ouverts; for (let i = 0; i < ouv; i++) this.el.push('</g>');
    const prec = s[s.length - 1];
    super.restore();
    this.ouverts = typeof prec === 'number' ? prec : 0;
  }
  _d(L) {
    const o = [];
    for (let i = 0; i < L.length;) {
      const k = L[i];
      if (k === 'M' || k === 'L') { o.push(k + r2(L[i + 1]) + ' ' + r2(L[i + 2])); i += 3; }
      else if (k === 'C') { o.push(`C${r2(L[i + 1])} ${r2(L[i + 2])} ${r2(L[i + 3])} ${r2(L[i + 4])} ${r2(L[i + 5])} ${r2(L[i + 6])}`); i += 7; }
      else { o.push('Z'); i += 1; }
    }
    return o.join('');
  }
  fill(a, b) {
    const p = a && typeof a === 'object' ? a : null, rule = p ? b : a;
    const L = this._pathFrom(p); if (!L.length) return;
    const c = parseColor(this.fillStyle), al = c[3] * this.globalAlpha; if (al < 0.004) return;
    this.el.push(`<path${this._cl} d="${this._d(L)}" fill="${rgb(c)}"${al < 1 ? ` fill-opacity="${r2(al)}"` : ''}${rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}/>`);
  }
  stroke(p) {
    const L = this._pathFrom(p && p.o ? p : null); if (!L.length) return;
    const c = parseColor(this.strokeStyle), al = c[3] * this.globalAlpha; if (al < 0.004) return;
    const sc = this._scale(), w = Math.max(0.02, this.lineWidth * sc);
    const dash = this.dash.length ? ` stroke-dasharray="${this.dash.map((v) => r2(v * sc)).join(' ')}"` : '';
    this.el.push(`<path${this._cl} d="${this._d(L)}" fill="none" stroke="${rgb(c)}" stroke-width="${r2(w)}"${al < 1 ? ` stroke-opacity="${r2(al)}"` : ''} stroke-linecap="${this.lineCap}" stroke-linejoin="${this.lineJoin}"${dash}/>`);
  }
  clip(a, b) {
    const p = a && typeof a === 'object' ? a : null, rule = p ? b : a;
    const L = this._pathFrom(p); if (!L.length) return;
    const id = 'c' + (++this.nclip);
    this.el.push(`<clipPath id="${id}"><path d="${this._d(L)}"${rule === 'evenodd' ? ' clip-rule="evenodd"' : ''}/></clipPath><g clip-path="url(#${id})">`);
    this.ouverts++;
  }
  drawImage() { } // pas d'image : export vectoriel
  _texte(s, x, y, contour) {
    s = String(s == null ? '' : s); if (!s.trim()) return;
    const col = parseColor(contour ? this.strokeStyle : this.fillStyle), al = col[3] * this.globalAlpha; if (al < 0.004) return;
    const f = parseFont(this.font), m = this.m;
    const ta = this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' || this.textAlign === 'end' ? 'end' : 'start';
    const tb = this.textBaseline === 'middle' ? 'central' : this.textBaseline === 'top' || this.textBaseline === 'hanging' ? 'hanging' : this.textBaseline === 'bottom' || this.textBaseline === 'ideographic' ? 'text-after-edge' : 'alphabetic';
    const peint = contour ? `fill="none" stroke="${rgb(col)}" stroke-width="${r2(this.lineWidth)}" stroke-linejoin="round"` : `fill="${rgb(col)}"`;
    this.el.push(`<text${this._cl} transform="matrix(${m.map(r2).join(' ')})" x="${r2(x)}" y="${r2(y)}" font-family="Helvetica, Arial, sans-serif" font-size="${r2(f.size)}"${f.bold ? ' font-weight="bold"' : ''} text-anchor="${ta}" dominant-baseline="${tb}" ${peint}${al < 1 ? ` opacity="${r2(al)}"` : ''}>${esc(s)}</text>`);
  }
  fillText(s, x, y) { this._texte(s, x, y, false); }
  strokeText(s, x, y) { this._texte(s, x, y, true); }
  /* fichier SVG : viewBox en centimètres du plan ; taille d'impression au 1:100 (1 m du plan = 1 cm) ; titre facultatif */
  /* unite : 'cm' (plan : impression au 1:100) ou 'mm' (schéma : vraie grandeur) */
  svg(box, titre, unite) {
    const out = this.el.slice();
    /* groupes de découpe encore ouverts (dessin interrompu) */
    const reste = this.ouverts + this.st.reduce((s, x) => s + (typeof x[x.length - 1] === 'number' ? x[x.length - 1] : 0), 0);
    for (let i = 0; i < reste; i++) out.push('</g>');
    const W = box.x1 - box.x0, H = box.y1 - box.y0;
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r2(box.x0)} ${r2(box.y0)} ${r2(W)} ${r2(H)}" width="${r2(unite === 'mm' ? W : W / 10)}mm" height="${r2(unite === 'mm' ? H : H / 10)}mm">\n${titre ? `<title>${esc(titre)}</title>\n` : ''}<rect x="${r2(box.x0)}" y="${r2(box.y0)}" width="${r2(W)}" height="${r2(H)}" fill="#ffffff"/>\n${out.join('\n')}\n</svg>\n`;
  }
}

export { SvgCtx };

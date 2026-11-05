/* Calque — module « svgpdf » : dessin d'un SVG de Calque sur un contexte canvas (ou PdfCtx).
   SANS ÉCRAN (testable avec Node). Sert au moteur documentaire : le schéma unifilaire et le coffret,
   produits en SVG par tableau.js, sont redessinés en vectoriel dans le PDF (aucune image, aucune bibliothèque).

   Sous-ensemble lu (celui que produit tableau.js) : <svg viewBox>, <g>, <rect>, <line>, <circle>, <ellipse>,
   <path> (commandes M L H V Z, absolues et relatives), <text> (avec transform="rotate(a x y)").
   Styles : fill, stroke, stroke-width, stroke-dasharray, font-size, font-weight, text-anchor (attribut ou style).
   Un élément inconnu est ignoré et compté dans `ignores` (rien n'est inventé). */

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
function decode(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] != null ? ENT[e.toLowerCase()] : m;
  });
}
function attrs(s) {
  const a = {}; const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)')/g; let m;
  while ((m = re.exec(s))) a[m[1]] = decode(m[3] != null ? m[3] : m[4]);
  if (a.style) for (const part of a.style.split(';')) { const i = part.indexOf(':'); if (i > 0) { const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim(); if (k && !(k in a && k !== 'style')) a[k] = v; } }
  return a;
}
const num = (v, d = 0) => { const x = parseFloat(v); return Number.isFinite(x) ? x : d; };

/* analyse : liste plate d'éléments à dessiner */
function lireSVG(svg) {
  const out = { W: 0, H: 0, els: [], ignores: 0 };
  const root = /<svg\b([^>]*)>/i.exec(svg);
  if (root) {
    const a = attrs(root[1]);
    const vb = (a.viewBox || '').split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb.every(Number.isFinite)) { out.W = vb[2]; out.H = vb[3]; out.vx = vb[0]; out.vy = vb[1]; }
    else { out.W = num(a.width); out.H = num(a.height); out.vx = 0; out.vy = 0; }
  }
  const re = /<(\/?)([a-zA-Z]+)\b([^>]*?)(\/?)>|([^<]+)/g; let m, txt = null;
  const stack = [{}];
  while ((m = re.exec(svg))) {
    if (m[5] != null) { if (txt) txt.text += decode(m[5]); continue; }
    const close = m[1] === '/', tag = m[2].toLowerCase(), selfClose = m[4] === '/';
    if (tag === 'svg') continue;
    if (close) {
      if (tag === 'g' && stack.length > 1) stack.pop();
      if (tag === 'text' && txt) { out.els.push(txt); txt = null; }
      continue;
    }
    const a = Object.assign({}, stack[stack.length - 1], attrs(m[3]));
    if (tag === 'g') { if (!selfClose) stack.push(styleHerite(a)); continue; }
    if (tag === 'text') { txt = { tag, a, text: '' }; if (selfClose) { out.els.push(txt); txt = null; } continue; }
    if (tag === 'tspan') continue;
    if (['rect', 'line', 'circle', 'ellipse', 'path'].includes(tag)) out.els.push({ tag, a });
    else out.ignores++;
  }
  return out;
}
/* seuls les styles se transmettent d'un groupe à ses enfants */
function styleHerite(a) {
  const o = {};
  for (const k of ['fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'font-size', 'font-weight', 'text-anchor']) if (k in a) o[k] = a[k];
  return o;
}

/* chemin SVG → appels moveTo / lineTo / closePath */
function tracerChemin(c, d) {
  const tok = String(d).match(/[MLHVZmlhvz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [];
  let i = 0, cmd = '', x = 0, y = 0, x0 = 0, y0 = 0;
  const n = () => parseFloat(tok[i++]);
  while (i < tok.length) {
    if (/[a-z]/i.test(tok[i])) cmd = tok[i++];
    if (!cmd) { i++; continue; }
    const rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
    if (C === 'Z') { c.closePath(); x = x0; y = y0; cmd = ''; continue; }
    if (C === 'M' || C === 'L') {
      const a = n(), b = n(); if (!Number.isFinite(a) || !Number.isFinite(b)) break;
      x = rel ? x + a : a; y = rel ? y + b : b;
      if (C === 'M') { c.moveTo(x, y); x0 = x; y0 = y; cmd = rel ? 'l' : 'L'; } else c.lineTo(x, y);
    } else if (C === 'H') { const a = n(); if (!Number.isFinite(a)) break; x = rel ? x + a : a; c.lineTo(x, y); }
    else if (C === 'V') { const a = n(); if (!Number.isFinite(a)) break; y = rel ? y + a : a; c.lineTo(x, y); }
  }
}
const couleur = (v) => (v == null || v === 'none' || v === 'transparent' ? null : v);

/* dessine le SVG dans la zone { x, y, w, h } du contexte, en gardant les proportions. Renvoie l'échelle utilisée. */
function dessinerSVG(c, svg, zone, opts) {
  const o = opts || {}, doc = typeof svg === 'string' ? lireSVG(svg) : svg;
  if (!doc.W || !doc.H) return { k: 0, ignores: doc.ignores };
  const k = Math.min(zone.w / doc.W, zone.h / doc.H);
  const ox = zone.x + (zone.w - doc.W * k) / 2, oy = zone.y + (o.haut ? 0 : (zone.h - doc.H * k) / 2);
  const serre = o.serre || 1; // texte resserré (la police du schéma est étroite)
  c.save(); c.translate(ox, oy); c.scale(k, k); c.translate(-(doc.vx || 0), -(doc.vy || 0));
  for (const el of doc.els) {
    const a = el.a, fill = couleur(a.fill === undefined ? (el.tag === 'text' || el.tag === 'path' || el.tag === 'rect' || el.tag === 'circle' || el.tag === 'ellipse' ? '#000' : null) : a.fill);
    const stroke = couleur(a.stroke);
    c.lineWidth = num(a['stroke-width'], 1);
    const dash = a['stroke-dasharray'] && a['stroke-dasharray'] !== 'none' ? a['stroke-dasharray'].split(/[\s,]+/).map(Number).filter(Number.isFinite) : [];
    c.setLineDash(dash);
    const paint = () => { if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.stroke(); } };
    if (el.tag === 'rect') {
      c.beginPath(); c.rect(num(a.x), num(a.y), num(a.width), num(a.height)); paint();
    } else if (el.tag === 'line') {
      if (!stroke) continue;
      c.beginPath(); c.moveTo(num(a.x1), num(a.y1)); c.lineTo(num(a.x2), num(a.y2)); c.strokeStyle = stroke; c.stroke();
    } else if (el.tag === 'circle' || el.tag === 'ellipse') {
      const rx = el.tag === 'circle' ? num(a.r) : num(a.rx), ry = el.tag === 'circle' ? num(a.r) : num(a.ry);
      if (rx <= 0 || ry <= 0) continue;
      c.beginPath(); c.ellipse(num(a.cx), num(a.cy), rx, ry, 0, 0, Math.PI * 2); c.closePath(); paint();
    } else if (el.tag === 'path') {
      c.beginPath(); tracerChemin(c, a.d || ''); paint();
    } else if (el.tag === 'text') {
      const s = el.text.replace(/\s+/g, ' ').trim(); if (!s || !fill) continue;
      const size = num(a['font-size'], 12), w = /bold|[6-9]00/.test(a['font-weight'] || '') ? 700 : 500;
      c.save(); c.translate(num(a.x), num(a.y));
      const rot = /rotate\(\s*(-?[\d.]+)/.exec(a.transform || ''); if (rot) c.rotate((parseFloat(rot[1]) * Math.PI) / 180);
      c.scale(serre, 1);
      c.font = `${w} ${size}px Helvetica, Arial, sans-serif`; c.fillStyle = fill; c.textBaseline = 'alphabetic';
      const an = a['text-anchor']; c.textAlign = an === 'middle' ? 'center' : an === 'end' ? 'right' : 'left';
      c.fillText(s, 0, 0); c.restore();
    }
  }
  c.setLineDash([]);
  c.restore();
  return { k, ignores: doc.ignores, W: doc.W, H: doc.H };
}

export { decode, dessinerSVG, lireSVG, tracerChemin };

/* Calque — module « dxfimport » : lecture d'un fichier DXF (plan d'architecte) sans bibliothèque.
   JavaScript pur, sans accès à l'écran : testable avec Node.
   Le fichier est relu en traits (suites de points) et en textes, dans l'unité du fichier ; les blocs (INSERT) sont
   développés, les arcs, cercles, ellipses et splines sont découpés en segments.
   Entités lues : LINE, LWPOLYLINE, POLYLINE, CIRCLE, ARC, ELLIPSE, SPLINE, INSERT, TEXT, MTEXT, SOLID/3DFACE (contour).
   Ce qui n'est pas lu (hachures, cotes, images, objets 3D) est compté dans `ignores`, jamais inventé.
   Le DWG (format fermé) n'est pas lisible : il faut l'enregistrer en DXF depuis le logiciel d'origine. */

const UNITES = { 1: { n: 'pouces', cm: 2.54 }, 2: { n: 'pieds', cm: 30.48 }, 4: { n: 'millimètres', cm: 0.1 }, 5: { n: 'centimètres', cm: 1 }, 6: { n: 'mètres', cm: 100 } };
const MAX_POINTS = 1500000; // au-delà, le dessin est tronqué (signalé) : mémoire de l'iPad
const D2R = Math.PI / 180;

/* texte du fichier : UTF-8 (DXF 2007 et plus) si valide, sinon Windows-1252 (versions antérieures) */
function decoderDxf(octets) {
  const u = octets instanceof Uint8Array ? octets : new Uint8Array(octets);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(u); } catch (e) { /* pas de l'UTF-8 */ }
  try { return new TextDecoder('windows-1252').decode(u); } catch (e) { return new TextDecoder('latin1').decode(u); }
}
const estDwg = (octets) => { const u = new Uint8Array(octets.buffer ? octets.buffer : octets, 0, Math.min(6, octets.byteLength)); return String.fromCharCode(...u).startsWith('AC10'); };
function texteDxf(s) {
  return String(s || '').replace(/\\U\+([0-9A-Fa-f]{4})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/%%[cC]/g, 'Ø').replace(/%%[dD]/g, '°').replace(/%%[pP]/g, '±').replace(/%%[uUoO]/g, '');
}
/* MTEXT : retire les codes de mise en forme */
function texteM(s) {
  return texteDxf(s).replace(/\\P/g, ' ').replace(/\\[ACFHQTWfacqhtw][^;]*;/g, '').replace(/\\[LlOoKk]/g, '').replace(/\\S([^;]*);/g, '$1').replace(/[{}]/g, '').replace(/\\~/g, ' ').replace(/\\\\/g, '\\').trim();
}

/* paires (code, valeur) → sections */
function lirePaires(texte) {
  const l = texte.split(/\r\n|\r|\n/), p = [];
  for (let i = 0; i + 1 < l.length; i += 2) { const c = parseInt(l[i], 10); if (Number.isNaN(c)) { i--; continue; } p.push(c, l[i + 1]); }
  return p;
}
/* une entité : { type, g: Map code → [valeurs] dans l'ordre, v: sommets (POLYLINE) } */
function lireEntites(p, i, fin) {
  const out = []; let cur = null, poly = null;
  for (; i < p.length; i += 2) {
    const c = p[i], v = p[i + 1].trim();
    if (c === 0) {
      if (fin.includes(v)) break;
      cur = { type: v, c: [], x: [] };
      if (v === 'VERTEX' && poly) poly.v.push(cur);
      else if (v === 'SEQEND') poly = null;
      else { out.push(cur); poly = v === 'POLYLINE' ? Object.assign(cur, { v: [] }) : null; }
    } else if (cur) { cur.c.push(c); cur.x.push(p[i + 1]); }
  }
  return { ents: out, i };
}
const num = (e, code, d) => { const k = e.c.indexOf(code); if (k < 0) return d; const v = parseFloat(e.x[k]); return Number.isFinite(v) ? v : d; };
const str = (e, code, d) => { const k = e.c.indexOf(code); return k < 0 ? d : e.x[k].trim(); };
const tous = (e, code) => { const o = []; for (let k = 0; k < e.c.length; k++) if (e.c[k] === code) o.push(parseFloat(e.x[k])); return o; };

/* arc défini par un renflement (bulge) entre deux sommets */
function renflement(out, x0, y0, x1, y1, b) {
  const d = Math.hypot(x1 - x0, y1 - y0);
  if (!(Math.abs(b) > 1e-9) || d < 1e-12) { out.push(x1, y1); return; }
  const ang = 4 * Math.atan(b), r = d / (2 * Math.sin(Math.abs(ang) / 2));
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, hh = Math.sqrt(Math.max(0, r * r - d * d / 4)) * (Math.abs(b) > 1 ? -1 : 1) * Math.sign(b);
  const cx = mx - hh * (y1 - y0) / d, cy = my + hh * (x1 - x0) / d;
  const a0 = Math.atan2(y0 - cy, x0 - cx), n = Math.max(2, Math.ceil(Math.abs(ang) / (Math.PI / 16)));
  for (let k = 1; k <= n; k++) { const a = a0 + ang * k / n; out.push(cx + r * Math.cos(a), cy + r * Math.sin(a)); }
  out[out.length - 2] = x1; out[out.length - 1] = y1;
}
function arcPts(cx, cy, rx, ry, rot, a0, a1) {
  let sw = a1 - a0; while (sw <= 1e-12) sw += Math.PI * 2;
  const n = Math.max(4, Math.ceil(sw / (Math.PI / 24))), o = [], cr = Math.cos(rot), sr = Math.sin(rot);
  for (let k = 0; k <= n; k++) { const a = a0 + sw * k / n, ex = rx * Math.cos(a), ey = ry * Math.sin(a); o.push(cx + ex * cr - ey * sr, cy + ex * sr + ey * cr); }
  return o;
}

/* Lecture complète. Renvoie { traits: [{ l, p: [x, y…], f }], textes: [{ l, x, y, h, a, s }], calques: Map nom → { n, masque },
   unite (code $INSUNITS ou null), ignores: { type: nombre }, tronque, version } — coordonnées du fichier, axe Y vers le haut. */
function lireDxf(texte) {
  const p = lirePaires(texte);
  const R = { traits: [], textes: [], calques: new Map(), unite: null, ignores: {}, tronque: false, version: null, points: 0 };
  const blocs = new Map(); let ents = [];
  for (let i = 0; i < p.length; i += 2) {
    /* fichier écrit par Calque : l'unité est notée en commentaire (le format R12 n'a pas d'unité) */
    if (p[i] === 999) { const m = /^CALQUE unite=(mm|cm|m)$/.exec(p[i + 1].trim()); if (m) R.unite = { mm: 4, cm: 5, m: 6 }[m[1]]; continue; }
    if (!(p[i] === 0 && p[i + 1].trim() === 'SECTION')) continue;
    const nom = (p[i + 3] || '').trim(); i += 4;
    if (nom === 'HEADER') {
      for (; i < p.length && !(p[i] === 0 && p[i + 1].trim() === 'ENDSEC'); i += 2) {
        if (p[i] !== 9) continue;
        const v = p[i + 1].trim();
        if (v === '$INSUNITS') { const u = parseInt(p[i + 3], 10); if (UNITES[u]) R.unite = u; }
        else if (v === '$ACADVER') R.version = (p[i + 3] || '').trim();
      }
    } else if (nom === 'TABLES') {
      for (; i < p.length && !(p[i] === 0 && p[i + 1].trim() === 'ENDSEC'); i += 2) {
        if (!(p[i] === 0 && p[i + 1].trim() === 'LAYER')) continue;
        let n = null, fl = 0, col = 7, j = i + 2;
        for (; j < p.length && p[j] !== 0; j += 2) { if (p[j] === 2) n = p[j + 1].trim(); else if (p[j] === 70) fl = parseInt(p[j + 1], 10) || 0; else if (p[j] === 62) col = parseInt(p[j + 1], 10) || 7; }
        if (n != null) R.calques.set(n, { n: 0, masque: !!(fl & 1) || col < 0 });
        i = j - 2;
      }
    } else if (nom === 'BLOCKS') {
      for (; i < p.length && !(p[i] === 0 && p[i + 1].trim() === 'ENDSEC'); i += 2) {
        if (!(p[i] === 0 && p[i + 1].trim() === 'BLOCK')) continue;
        const b = { nom: '', bx: 0, by: 0, ents: [] }; let j = i + 2;
        for (; j < p.length && p[j] !== 0; j += 2) { if (p[j] === 2) b.nom = p[j + 1].trim(); else if (p[j] === 10) b.bx = parseFloat(p[j + 1]) || 0; else if (p[j] === 20) b.by = parseFloat(p[j + 1]) || 0; }
        const r = lireEntites(p, j, ['ENDBLK', 'ENDSEC']); b.ents = r.ents; i = r.i - 2;
        if (b.nom) blocs.set(b.nom, b);
      }
    } else if (nom === 'ENTITIES') { const r = lireEntites(p, i, ['ENDSEC']); ents = r.ents; i = r.i; }
    else for (; i < p.length && !(p[i] === 0 && p[i + 1].trim() === 'ENDSEC'); i += 2);
  }
  const calque = (n) => { let c = R.calques.get(n); if (!c) R.calques.set(n, (c = { n: 0, masque: false })); return c; };
  const trait = (l, pts, f, m, plus) => {
    if (pts.length < 4 || R.tronque) return;
    if (R.points + pts.length / 2 > MAX_POINTS) { R.tronque = true; return; }
    const q = new Array(pts.length);
    for (let k = 0; k < pts.length; k += 2) { q[k] = m[0] * pts[k] + m[2] * pts[k + 1] + m[4]; q[k + 1] = m[1] * pts[k] + m[3] * pts[k + 1] + m[5]; }
    for (const v of q) if (!Number.isFinite(v)) return;
    const tr = { l, p: q, f: !!f };
    /* arc de cercle : centre et rayon gardés (débattement d'une porte) ; autres courbes signalées */
    if (plus && plus.arc) tr.arc = { x: m[0] * plus.arc[0] + m[2] * plus.arc[1] + m[4], y: m[1] * plus.arc[0] + m[3] * plus.arc[1] + m[5], r: plus.arc[2] * Math.hypot(m[0], m[1]) };
    else if (plus && plus.courbe) tr.courbe = true;
    R.traits.push(tr); R.points += q.length / 2; calque(l).n++;
  };
  const mul = (m, a) => [m[0] * a[0] + m[2] * a[1], m[1] * a[0] + m[3] * a[1], m[0] * a[2] + m[2] * a[3], m[1] * a[2] + m[3] * a[3], m[0] * a[4] + m[2] * a[5] + m[4], m[1] * a[4] + m[3] * a[5] + m[5]];
  function poser(list, m, calqueParent, prof) {
    for (const e of list) {
      if (R.tronque) return;
      if (num(e, 67, 0) === 1) continue; // espace papier (mise en page) : pas le plan
      let l = str(e, 8, '0'); if (l === '0' && calqueParent) l = calqueParent; // calque 0 d'un bloc : celui de l'insertion
      const mir = num(e, 230, 1) < 0 ? -1 : 1; // objet « retourné » (extrusion vers le bas) : axe X inversé
      const mm = mir < 0 ? mul(m, [-1, 0, 0, 1, 0, 0]) : m;
      const t = e.type;
      if (t === 'LINE') trait(l, [num(e, 10, 0), num(e, 20, 0), num(e, 11, 0), num(e, 21, 0)], false, m);
      else if (t === 'LWPOLYLINE') {
        const xs = [], ys = [], bs = [];
        for (let k = 0; k < e.c.length; k++) { const c = e.c[k]; if (c === 10) { xs.push(parseFloat(e.x[k])); bs.push(0); } else if (c === 20) ys.push(parseFloat(e.x[k])); else if (c === 42 && bs.length) bs[bs.length - 1] = parseFloat(e.x[k]) || 0; }
        const n = Math.min(xs.length, ys.length); if (n < 2) continue;
        const f = (num(e, 70, 0) & 1) === 1, o = [xs[0], ys[0]];
        for (let k = 1; k < n; k++) renflement(o, xs[k - 1], ys[k - 1], xs[k], ys[k], bs[k - 1]);
        if (f) renflement(o, xs[n - 1], ys[n - 1], xs[0], ys[0], bs[n - 1]);
        trait(l, o, false, mm);
      } else if (t === 'POLYLINE') {
        const fl = num(e, 70, 0); if (fl & 64) { R.ignores.POLYFACE = (R.ignores.POLYFACE || 0) + 1; continue; }
        const vs = (e.v || []).filter((v) => !(num(v, 70, 0) & 128 && !(num(v, 70, 0) & 64))); if (vs.length < 2) continue;
        const X = vs.map((v) => num(v, 10, 0)), Y = vs.map((v) => num(v, 20, 0)), B = vs.map((v) => num(v, 42, 0)), o = [X[0], Y[0]];
        for (let k = 1; k < vs.length; k++) renflement(o, X[k - 1], Y[k - 1], X[k], Y[k], B[k - 1]);
        if (fl & 1) renflement(o, X[vs.length - 1], Y[vs.length - 1], X[0], Y[0], B[vs.length - 1]);
        trait(l, o, false, mm);
      } else if (t === 'CIRCLE') { const r = num(e, 40, 0); if (r > 0) trait(l, arcPts(num(e, 10, 0), num(e, 20, 0), r, r, 0, 0, Math.PI * 2), true, mm, { courbe: true }); }
      else if (t === 'ARC') { const r = num(e, 40, 0); if (r > 0) trait(l, arcPts(num(e, 10, 0), num(e, 20, 0), r, r, 0, num(e, 50, 0) * D2R, num(e, 51, 360) * D2R), false, mm, { arc: [num(e, 10, 0), num(e, 20, 0), r] }); }
      else if (t === 'ELLIPSE') {
        const ax = num(e, 11, 0), ay = num(e, 21, 0), a = Math.hypot(ax, ay), k = num(e, 40, 1); if (!(a > 0)) continue;
        trait(l, arcPts(num(e, 10, 0), num(e, 20, 0), a, a * k, Math.atan2(ay, ax), num(e, 41, 0), num(e, 42, Math.PI * 2)), false, mm, { courbe: true });
      } else if (t === 'SPLINE') {
        let X = tous(e, 11), Y = tous(e, 21); if (X.length < 2) { X = tous(e, 10); Y = tous(e, 20); }
        const n = Math.min(X.length, Y.length); if (n < 2) continue;
        const o = []; for (let k = 0; k < n; k++) o.push(X[k], Y[k]);
        if (num(e, 70, 0) & 1) o.push(X[0], Y[0]);
        trait(l, o, false, m, { courbe: true });
      } else if (t === 'SOLID' || t === '3DFACE' || t === 'TRACE') {
        const o = [num(e, 10, 0), num(e, 20, 0), num(e, 11, 0), num(e, 21, 0), num(e, 13, num(e, 12, 0)), num(e, 23, num(e, 22, 0)), num(e, 12, 0), num(e, 22, 0), num(e, 10, 0), num(e, 20, 0)];
        trait(l, o, false, m);
      } else if (t === 'INSERT') {
        const b = blocs.get(str(e, 2, '')); if (!b || prof >= 6) { if (!b) R.ignores['INSERT (bloc absent)'] = (R.ignores['INSERT (bloc absent)'] || 0) + 1; continue; }
        const a = num(e, 50, 0) * D2R, sx = num(e, 41, 1) || 1, sy = num(e, 42, 1) || 1, co = Math.cos(a), si = Math.sin(a);
        const nx = Math.max(1, Math.min(50, num(e, 70, 1))), ny = Math.max(1, Math.min(50, num(e, 71, 1))), ex = num(e, 44, 0), ey = num(e, 45, 0);
        for (let ix = 0; ix < nx; ix++) for (let iy = 0; iy < ny; iy++) {
          const tx = num(e, 10, 0) + (ix * ex) * co - (iy * ey) * si, ty = num(e, 20, 0) + (ix * ex) * si + (iy * ey) * co;
          const loc = [co * sx, si * sx, -si * sy, co * sy, tx - (co * sx * b.bx - si * sy * b.by), ty - (si * sx * b.bx + co * sy * b.by)];
          poser(b.ents, mul(mm, loc), l, prof + 1);
        }
      } else if (t === 'TEXT' || t === 'MTEXT' || t === 'ATTRIB') {
        const s = t === 'MTEXT' ? texteM(e.c.map((c, k) => (c === 3 ? e.x[k] : '')).join('') + str(e, 1, '')) : texteDxf(str(e, 1, '')).trim();
        const h = num(e, 40, 0); if (!s || !(h > 0)) continue;
        /* TEXT aligné : le point d'alignement (11, 21) remplace le point d'insertion */
        const al = t !== 'MTEXT' && (num(e, 72, 0) || num(e, 73, 0)) && e.c.includes(11);
        const x = al ? num(e, 11, 0) : num(e, 10, 0), y = al ? num(e, 21, 0) : num(e, 20, 0);
        const rot = t === 'MTEXT' && e.c.includes(11) ? Math.atan2(num(e, 21, 0), num(e, 11, 1)) : num(e, 50, 0) * D2R;
        const X = mm[0] * x + mm[2] * y + mm[4], Y = mm[1] * x + mm[3] * y + mm[5], k = Math.hypot(mm[2], mm[3]);
        if (!Number.isFinite(X) || !Number.isFinite(Y)) continue;
        const ah = t === 'MTEXT' ? [0, 1, 2][(num(e, 71, 1) - 1) % 3] : num(e, 72, 0) === 1 || num(e, 72, 0) === 4 ? 1 : num(e, 72, 0) === 2 ? 2 : 0;
        R.textes.push({ l, x: X, y: Y, h: h * k, a: rot + Math.atan2(mm[1], mm[0]), s: s.slice(0, 200), ah, haut: t === 'MTEXT' && num(e, 71, 1) <= 3 });
        calque(l).n++;
      } else if (t !== 'ATTDEF' && t !== 'VIEWPORT' && t !== 'POINT') R.ignores[t] = (R.ignores[t] || 0) + 1;
    }
  }
  poser(ents, [1, 0, 0, 1, 0, 0], null, 0);
  return R;
}

/* emprise des calques choisis. Les objets isolés très loin du dessin (emprise totale plus de 4 fois plus grande que
   le cœur du dessin) sont écartés et `isoles` vaut true. */
function empriseDxf(R, calques) {
  const ok = (l) => !calques || calques.has(l);
  /* chaque trait : son cadre, son centre et sa longueur (le poids : un objet isolé pèse peu face au dessin) */
  const T = []; let total = 0;
  const full = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity };
  for (const t of R.traits) {
    if (!ok(t.l)) continue;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, L = 0; const p = t.p;
    for (let k = 0; k < p.length; k += 2) { const x = p[k], y = p[k + 1]; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (k) L += Math.hypot(x - p[k - 2], y - p[k - 1]); }
    T.push({ x0, x1, y0, y1, cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, L }); total += L;
    if (x0 < full.x0) full.x0 = x0; if (x1 > full.x1) full.x1 = x1; if (y0 < full.y0) full.y0 = y0; if (y1 > full.y1) full.y1 = y1;
  }
  if (!T.length) return null;
  if (!(total > 0)) return Object.assign(full, { isoles: false });
  /* cœur du dessin : entre 2 % et 98 % de la longueur dessinée, sur chaque axe */
  const coeur = (c, a, b) => {
    const o = T.slice().sort((u, v) => u[c] - v[c]); let s = 0, lo = null, hi = null;
    for (const t of o) { s += t.L; if (lo == null && s >= 0.02 * total) lo = t[a]; if (hi == null && s >= 0.98 * total) { hi = t[b]; break; } }
    return [lo, hi == null ? o[o.length - 1][b] : hi];
  };
  const [cx0, cx1] = coeur('cx', 'x0', 'x1'), [cy0, cy1] = coeur('cy', 'y0', 'y1');
  const rw = Math.max(cx1 - cx0, 1e-9), rh = Math.max(cy1 - cy0, 1e-9), w = full.x1 - full.x0, h = full.y1 - full.y0;
  if (w > 4 * rw || h > 4 * rh) {
    /* on garde tout ce dont le centre est dans le cœur élargi d'une fois sa taille de chaque côté */
    const m = Math.max(rw, rh), z = { x0: cx0 - m, x1: cx1 + m, y0: cy0 - m, y1: cy1 + m };
    const o = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, isoles: true };
    for (const t of T) { if (t.cx < z.x0 || t.cx > z.x1 || t.cy < z.y0 || t.cy > z.y1) continue; if (t.x0 < o.x0) o.x0 = t.x0; if (t.x1 > o.x1) o.x1 = t.x1; if (t.y0 < o.y0) o.y0 = t.y0; if (t.y1 > o.y1) o.y1 = t.y1; }
    if (o.x1 > o.x0 && o.y1 > o.y0) return o;
  }
  return Object.assign(full, { isoles: false });
}
/* unité probable quand le fichier ne la dit pas : d'après la taille du dessin (un bâtiment mesure de 3 à 300 m) */
function uniteProbable(R, emprise) {
  if (R.unite && UNITES[R.unite]) return { u: R.unite, sure: true };
  const d = emprise ? Math.max(emprise.x1 - emprise.x0, emprise.y1 - emprise.y0) : 0;
  return { u: d >= 5000 ? 4 : d >= 300 ? 5 : 6, sure: false };
}
/* dessine les traits et les textes dans un contexte canvas : zone { x0, y0, x1, y1 } du fichier → rectangle w × h pixels */
function dessinerDxf(c, R, emprise, w, h, opts) {
  const o = opts || {}, calques = o.calques || null, ok = (l) => !calques || calques.has(l);
  const k = Math.min(w / (emprise.x1 - emprise.x0), h / (emprise.y1 - emprise.y0));
  const X = (x) => (x - emprise.x0) * k, Y = (y) => h - (y - emprise.y0) * k;
  c.strokeStyle = o.couleur || '#1D2125'; c.fillStyle = o.couleur || '#1D2125'; c.lineWidth = o.trait || 1.2; c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); let n = 0;
  for (const t of R.traits) {
    if (!ok(t.l)) continue;
    const p = t.p; c.moveTo(X(p[0]), Y(p[1]));
    for (let i = 2; i < p.length; i += 2) c.lineTo(X(p[i]), Y(p[i + 1]));
    if (t.f) c.closePath();
    if (++n % 4000 === 0) { c.stroke(); c.beginPath(); }
  }
  c.stroke();
  if (o.textes !== false) for (const t of R.textes) {
    if (!ok(t.l)) continue;
    const px = t.h * k; if (px < 3.5 || px > 400) continue;
    c.save(); c.translate(X(t.x), Y(t.y)); c.rotate(-t.a);
    c.font = `${px * 1.25}px sans-serif`; c.textAlign = ['left', 'center', 'right'][t.ah || 0]; c.textBaseline = t.haut ? 'top' : 'alphabetic';
    c.fillText(t.s, 0, 0); c.restore();
  }
  return k;
}

export { UNITES, decoderDxf, dessinerDxf, empriseDxf, estDwg, lireDxf, texteM, uniteProbable };

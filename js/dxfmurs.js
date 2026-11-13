/* Calque — module « dxfmurs » : reconnaissance des murs dans les traits d'un plan (DXF d'architecte).
   JavaScript pur, sans accès à l'écran : testable avec Node.
   Principe : sur un plan d'architecte, un mur est dessiné par ses deux faces, deux traits parallèles séparés par son
   épaisseur. On cherche ces paires, on en tire l'axe et l'épaisseur du mur, on réunit les morceaux alignés, on ferme
   les angles, et les interruptions d'un mur (50 cm à 3 m) deviennent des ouvertures proposées : porte si un arc de
   débattement s'y trouve, fenêtre si des traits de menuiserie sont dessinés dans l'épaisseur, passage libre sinon.
   C'est une PROPOSITION à vérifier : rien n'est certain, l'appelant l'annonce comme telle.
   Unités : centimètres (les coordonnées sont celles que l'appelant fournit). */

const DEG = Math.PI / 180;
const DEFAUT = { emin: 4, emax: 50, lmin: 12, pmin: 30, ouvMin: 50, ouvMax: 300 };

/* segments [{ x0, y0, x1, y1 }], arcs [{ x, y, r }] → { murs: [{ a: { x, y }, b: { x, y }, th, kind }],
   ouvertures: [{ x, y, w, kind: 'door' | 'window' | 'gap' }], faces (traits utilisés), segments (traits examinés) } */
function reconnaitreMurs(segments, arcs, options) {
  const o = Object.assign({}, DEFAUT, options || {});
  /* 1. traits utiles, en coordonnées « direction, distance à l'origine, intervalle » */
  const S = [];
  for (const s of segments) {
    const dx = s.x1 - s.x0, dy = s.y1 - s.y0, L = Math.hypot(dx, dy);
    if (!(L >= o.lmin)) continue;
    let th = Math.atan2(dy, dx); if (th < 0) th += Math.PI; if (th >= Math.PI - 1e-9) th -= Math.PI; if (th < 0) th = 0;
    /* angle arrondi au demi-degré : les traits presque parallèles d'un même mur ont exactement la même direction */
    const q = Math.round(th / (0.5 * DEG)) % 360, a = q * 0.5 * DEG, ux = Math.cos(a), uy = Math.sin(a);
    const t0 = s.x0 * ux + s.y0 * uy, t1 = s.x1 * ux + s.y1 * uy;
    S.push({ q, ux, uy, rho: -((s.x0 + s.x1) / 2) * uy + ((s.y0 + s.y1) / 2) * ux, t0: Math.min(t0, t1), t1: Math.max(t0, t1), pris: [] });
  }
  const fam = new Map(); for (const s of S) { let l = fam.get(s.q); if (!l) fam.set(s.q, (l = [])); l.push(s); }
  /* 2. paires de faces : mêmes direction, écart = épaisseur, recouvrement suffisant ; les plus fines d'abord,
        et un trait n'est la face que d'un seul mur sur une même portion */
  const cands = [];
  for (const l of fam.values()) {
    l.sort((a, b) => a.rho - b.rho);
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const e = l[j].rho - l[i].rho; if (e > o.emax) break; if (e < o.emin) continue;
      const a = Math.max(l[i].t0, l[j].t0), b = Math.min(l[i].t1, l[j].t1);
      if (b - a >= Math.max(o.lmin, 0.15 * Math.min(l[i].t1 - l[i].t0, l[j].t1 - l[j].t0))) cands.push({ i: l[i], j: l[j], e, a, b });
    }
  }
  cands.sort((x, y) => x.e - y.e || (y.b - y.a) - (x.b - x.a));
  const libre = (s, a, b) => { let r = [[a, b]]; for (const [p, q] of s.pris) { const n = []; for (const [u, v] of r) { if (q <= u || p >= v) n.push([u, v]); else { if (p > u) n.push([u, p]); if (q < v) n.push([q, v]); } } r = n; } return r; };
  const P = []; // pièces de mur : { q, ux, uy, rho, t0, t1, th }
  for (const c of cands) {
    for (const [u, v] of libre(c.i, c.a, c.b)) for (const [a, b] of libre(c.j, u, v)) {
      if (b - a < o.pmin) continue; // trop court : souvent le tableau d'une porte face à un mur voisin
      c.i.pris.push([a, b]); c.j.pris.push([a, b]);
      P.push({ q: c.i.q, ux: c.i.ux, uy: c.i.uy, rho: (c.i.rho + c.j.rho) / 2, t0: a, t1: b, th: c.e });
    }
  }
  const faces = S.filter((s) => s.pris.length).length;
  /* menuiserie d'une fenêtre : paire de traits fins, dans l'épaisseur d'un mur plus épais, entre deux de ses morceaux */
  const menuis = [];
  for (const p of P) {
    let avant = false, apres = false;
    for (const x of P) {
      if (x === p || x.q !== p.q || x.th < p.th + 4 || Math.abs(x.rho - p.rho) > x.th / 2) continue;
      if (Math.abs(x.t1 - p.t0) <= 6) avant = true;
      if (Math.abs(x.t0 - p.t1) <= 6) apres = true;
    }
    if (avant && apres) { p.menuiserie = true; menuis.push(p); }
  }
  /* 3. morceaux alignés réunis ; les interruptions de 50 cm à 3 m deviennent des ouvertures */
  /* morceaux d'une même direction regroupés par axe : triés par distance à l'origine, un nouvel axe commence quand
     l'écart dépasse 3 cm (le résultat ne dépend pas de la position du dessin dans le repère) */
  const groupes = [];
  const parQ = new Map(); for (const p of P) { if (p.menuiserie) continue; let l = parQ.get(p.q); if (!l) parQ.set(p.q, (l = [])); l.push(p); }
  for (const l of parQ.values()) {
    l.sort((a, b) => a.rho - b.rho);
    let g = null;
    for (const p of l) { if (!g || p.rho - g[g.length - 1].rho > 3) groupes.push((g = [])); g.push(p); }
  }
  const murs = [], trous = [];
  for (const l of groupes) {
    l.sort((a, b) => a.t0 - b.t0);
    let cur = null;
    for (const p of l) {
      if (cur && Math.abs(p.th - cur.th) <= 4 && p.t0 - cur.t1 <= o.ouvMax) {
        const g = p.t0 - cur.t1;
        if (g <= 20) { cur.t1 = Math.max(cur.t1, p.t1); continue; }
        if (g >= o.ouvMin) { trous.push({ m: cur, t0: cur.t1, t1: p.t0 }); cur.t1 = Math.max(cur.t1, p.t1); continue; }
      }
      cur = { q: p.q, ux: p.ux, uy: p.uy, rho: p.rho, t0: p.t0, t1: p.t1, th: p.th }; murs.push(cur);
    }
  }
  /* 4. angles : le bout d'un mur qui s'arrête près de l'axe d'un autre mur est prolongé jusqu'à cet axe */
  const pt = (m, t) => ({ x: m.ux * t - m.uy * m.rho, y: m.uy * t + m.ux * m.rho });
  for (const m of murs) for (const bout of ['t0', 't1']) {
    let best = null;
    for (const w of murs) {
      if (w === m) continue;
      const det = m.ux * w.uy - m.uy * w.ux; if (Math.abs(det) < 0.34) continue; // moins de 20° : pas un angle
      /* intersection des deux axes, en abscisse sur m et sur w */
      const O1 = pt(m, 0), O2 = pt(w, 0), dx = O2.x - O1.x, dy = O2.y - O1.y;
      const tm = (dx * w.uy - dy * w.ux) / det, tw = (dx * m.uy - dy * m.ux) / det;
      const marge = w.th / 2 + m.th / 2 + 6;
      if (tw < w.t0 - marge || tw > w.t1 + marge) continue;
      const d = Math.abs(tm - m[bout]); if (d > w.th / 2 + 12) continue;
      if (!best || d < best.d) best = { d, tm };
    }
    if (best) m[bout + 'n'] = best.tm;
  }
  for (const m of murs) { if (m.t0n != null) m.t0 = m.t0n; if (m.t1n != null) m.t1 = m.t1n; }
  /* porte au bout d'un mur, contre un mur en travers (cas fréquent : porte près d'un angle) : le mur s'arrête à une
     largeur de porte de l'axe de l'autre mur, et un arc de débattement de ce rayon est dessiné là. Le mur est prolongé
     jusqu'à cet axe et l'interruption devient une porte. Sans arc, rien n'est prolongé (pas deviné). */
  const arcPorte = (A, B, w, th) => (arcs || []).some((a) => (Math.abs(a.r - w) <= Math.max(8, 0.18 * w) || Math.abs(2 * a.r - w) <= Math.max(8, 0.18 * w))
    && Math.min(Math.hypot(a.x - A.x, a.y - A.y), Math.hypot(a.x - B.x, a.y - B.y)) <= th / 2 + 15);
  for (const m of murs) for (const bout of ['t0', 't1']) {
    if (m[bout + 'n'] != null) continue;
    const sens = bout === 't1' ? 1 : -1; let best = null;
    for (const w of murs) {
      if (w === m) continue;
      const det = m.ux * w.uy - m.uy * w.ux; if (Math.abs(det) < 0.7) continue; // à peu près en travers
      const O1 = pt(m, 0), O2 = pt(w, 0), dx = O2.x - O1.x, dy = O2.y - O1.y;
      const tm = (dx * w.uy - dy * w.ux) / det, tw = (dx * m.uy - dy * m.ux) / det;
      if (tw < w.t0 - m.th / 2 || tw > w.t1 + m.th / 2) continue;
      const face = tm - sens * w.th / 2 / Math.abs(det), larg = (face - m[bout]) * sens;
      if (larg < o.ouvMin || larg > 140) continue; // une porte, pas un passage
      if (!best || larg < best.larg) best = { tm, face, larg, th: w.th };
    }
    if (!best || !arcPorte(pt(m, m[bout]), pt(m, best.face), best.larg, m.th)) continue;
    trous.push(sens > 0 ? { m, t0: m.t1, t1: best.face, porte: true } : { m, t0: best.face, t1: m.t0, porte: true });
    m[bout] = best.tm;
  }
  /* 5. nature des ouvertures */
  const ouvertures = [];
  for (const g of trous) {
    const m = g.m, w = g.t1 - g.t0, c = pt(m, (g.t0 + g.t1) / 2), A = pt(m, g.t0), B = pt(m, g.t1);
    let kind = g.porte ? 'door' : 'gap';
    if (!g.porte) for (const a of arcs || []) {
      if (Math.abs(a.r - w) > Math.max(8, 0.18 * w) && Math.abs(2 * a.r - w) > Math.max(8, 0.18 * w)) continue;
      const d = Math.min(Math.hypot(a.x - A.x, a.y - A.y), Math.hypot(a.x - B.x, a.y - B.y));
      if (d <= m.th / 2 + 15) { kind = 'door'; break; }
    }
    if (kind === 'gap') {
      /* traits de menuiserie : parallèles au mur, dans son épaisseur, sur l'interruption, et non utilisés comme faces */
      const l = fam.get(m.q) || [];
      let n = 0; for (const s of l) if (Math.abs(s.rho - m.rho) <= m.th / 2 + 1 && Math.min(s.t1, g.t1) - Math.max(s.t0, g.t0) >= 0.6 * w) n++;
      for (const s of menuis) if (s.q === m.q && Math.abs(s.rho - m.rho) <= m.th / 2 + 1 && Math.min(s.t1, g.t1) - Math.max(s.t0, g.t0) >= 0.6 * w) n++;
      if (n >= 1) kind = 'window';
    }
    ouvertures.push({ x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, w: Math.round(w), kind });
  }
  const out = [];
  for (const m of murs) {
    if (m.t1 - m.t0 < o.lmin) continue;
    const a = pt(m, m.t0), b = pt(m, m.t1), r = (v) => Math.round(v * 10) / 10;
    out.push({ a: { x: r(a.x), y: r(a.y) }, b: { x: r(b.x), y: r(b.y) }, th: Math.max(5, Math.round(m.th)), kind: m.th < 12 ? 'cloison' : 'mur' });
  }
  return { murs: out, ouvertures, faces, segments: S.length };
}

/* traits lus dans un DXF (dxfimport.js) → segments et arcs en centimètres, axe Y vers le bas.
   f(X, Y) → { x, y } place un point du fichier sur le plan ; k : centimètres par unité du fichier */
function segmentsDuDxf(R, calques, f, k) {
  const segments = [], arcs = [];
  for (const t of R.traits) {
    if (calques && !calques.has(t.l)) continue;
    if (t.arc) { const c = f(t.arc.x, t.arc.y); arcs.push({ x: c.x, y: c.y, r: t.arc.r * k }); continue; }
    if (t.courbe) continue; // cercles, ellipses, splines : pas des faces de mur
    const p = t.p;
    for (let i = 2; i < p.length; i += 2) { const a = f(p[i - 2], p[i - 1]), b = f(p[i], p[i + 1]); segments.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y }); }
  }
  return { segments, arcs };
}

export { reconnaitreMurs, segmentsDuDxf };

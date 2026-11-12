/* Calque — module « ifcimport » : lecture d'une maquette numérique IFC (BIM) sans bibliothèque.
   JavaScript pur, sans accès à l'écran : testable avec Node.
   Formats : IFC 2x3 et IFC 4 en texte (« .ifc », codage STEP ISO 10303-21). Les fichiers compressés (.ifczip) et
   XML (.ifcxml) ne sont pas lus.
   Ce qui est repris : les niveaux (IfcBuildingStorey, nom et altitude), les murs (IfcWall… : axe, longueur, épaisseur
   et hauteur tirés du volume extrudé), les portes, fenêtres et réservations (IfcOpeningElement, IfcDoor, IfcWindow :
   position sur le mur, largeur, hauteur, allège), le nom des locaux (IfcSpace).
   Ce qui n'est pas repris (dalles, poteaux, toitures, escaliers, mobilier, réseaux…) est compté dans `ignores`.
   Un mur dont la géométrie n'est pas un volume extrudé vertical est compté dans `illisibles`, jamais inventé.
   Sortie en centimètres, axe Y vers le bas (repère de Calque), décalée pour que le bâtiment commence en (0, 0). */

/* ---------- lecture du texte STEP ---------- */
function texteStep(s) {
  return s.replace(/''/g, '\'')
    .replace(/\\X2\\((?:[0-9A-Fa-f]{4})+)\\X0\\/g, (m, h) => h.match(/.{4}/g).map((c) => String.fromCharCode(parseInt(c, 16))).join(''))
    .replace(/\\X4\\((?:[0-9A-Fa-f]{8})+)\\X0\\/g, (m, h) => h.match(/.{8}/g).map((c) => String.fromCodePoint(parseInt(c, 16))).join(''))
    .replace(/\\X\\([0-9A-Fa-f]{2})/g, (m, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\S\\(.)/g, (m, c) => String.fromCharCode(c.charCodeAt(0) + 128)).replace(/\\\\/g, '\\');
}
/* arguments d'une entité : nombres, textes, { ref }, { enum }, listes, null ($ ou *), { type, v } (valeur typée) */
function lireArgs(src) {
  let i = 0; const n = src.length;
  function val() {
    while (i < n && /\s/.test(src[i])) i++;
    const c = src[i];
    if (c === '(') { i++; const l = []; for (;;) { while (i < n && /\s/.test(src[i])) i++; if (src[i] === ')') { i++; return l; } l.push(val()); while (i < n && /\s/.test(src[i])) i++; if (src[i] === ',') i++; else if (src[i] !== ')') { if (i >= n) return l; } } }
    if (c === '\'') { let j = i + 1, s = ''; for (;;) { const k = src.indexOf('\'', j); if (k < 0) { i = n; return texteStep(s + src.slice(j)); } if (src[k + 1] === '\'') { s += src.slice(j, k + 2); j = k + 2; continue; } s += src.slice(j, k); i = k + 1; return texteStep(s); } }
    if (c === '#') { let j = i + 1; while (j < n && src.charCodeAt(j) >= 48 && src.charCodeAt(j) <= 57) j++; const r = { ref: +src.slice(i + 1, j) }; i = j; return r; }
    if (c === '$' || c === '*') { i++; return null; }
    if (c === '.') { const k = src.indexOf('.', i + 1); const e = src.slice(i + 1, k); i = k + 1; return e === 'T' ? true : e === 'F' ? false : { enum: e }; }
    let j = i; while (j < n && !/[,()]/.test(src[j])) j++;
    const tok = src.slice(i, j).trim();
    if (src[j] === '(' && /^[A-Za-z_]/.test(tok)) { i = j; const a = val(); return { type: tok.toUpperCase(), v: a[0] }; }
    i = j; const x = parseFloat(tok); return Number.isFinite(x) ? x : tok || null;
  }
  const out = []; while (i < n) { out.push(val()); while (i < n && /\s/.test(src[i])) i++; if (src[i] === ',') i++; else break; }
  return out;
}
/* index du fichier : id → { t (type), s (arguments bruts) } ; les arguments ne sont analysés qu'à la demande */
function indexer(texte) {
  const E = new Map(), parType = new Map();
  const d0 = texte.indexOf('DATA;'); if (d0 < 0) return { E, parType, schema: null };
  const sm = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/.exec(texte.slice(0, d0));
  const re = /#(\d+)\s*=\s*([A-Za-z0-9_]+)\s*\(/g; re.lastIndex = d0;
  let m;
  while ((m = re.exec(texte))) {
    /* fin de l'instruction : « ); » hors d'un texte entre apostrophes */
    let i = re.lastIndex, prof = 1, q = false;
    for (; i < texte.length; i++) { const c = texte.charCodeAt(i); if (c === 39) q = !q; else if (!q) { if (c === 40) prof++; else if (c === 41) { if (--prof === 0) break; } } }
    const id = +m[1], t = m[2].toUpperCase();
    E.set(id, { t, s: texte.slice(re.lastIndex, i), a: null });
    let l = parType.get(t); if (!l) parType.set(t, (l = [])); l.push(id);
    re.lastIndex = i + 1;
  }
  return { E, parType, schema: sm ? sm[1].toUpperCase() : null };
}

/* ---------- géométrie ---------- */
const ID = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]; // axes X, Y, Z puis origine
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function mulM(A, B) { // A ∘ B : B d'abord
  const o = new Array(12);
  for (let k = 0; k < 3; k++) { const bx = B[k * 3], by = B[k * 3 + 1], bz = B[k * 3 + 2]; o[k * 3] = A[0] * bx + A[3] * by + A[6] * bz; o[k * 3 + 1] = A[1] * bx + A[4] * by + A[7] * bz; o[k * 3 + 2] = A[2] * bx + A[5] * by + A[8] * bz; }
  const p = pt(A, [B[9], B[10], B[11]]); o[9] = p[0]; o[10] = p[1]; o[11] = p[2];
  return o;
}
function pt(M, p) { const x = p[0], y = p[1], z = p[2] || 0; return [M[0] * x + M[3] * y + M[6] * z + M[9], M[1] * x + M[4] * y + M[7] * z + M[10], M[2] * x + M[5] * y + M[8] * z + M[11]]; }
const vec = (M, p) => { const x = p[0], y = p[1], z = p[2] || 0; return [M[0] * x + M[3] * y + M[6] * z, M[1] * x + M[4] * y + M[7] * z, M[2] * x + M[5] * y + M[8] * z]; };

/* Lecture complète. Renvoie { schema, unite: { cm, nom }, projet, niveaux, murs, ouvertures, espaces, ignores, illisibles, alertes } */
function lireIfc(texte) {
  const { E, parType, schema } = indexer(texte);
  const R = { schema, unite: { cm: 100, nom: 'mètres' }, projet: '', niveaux: [], murs: [], ouvertures: [], espaces: [], ignores: {}, illisibles: 0, alertes: [] };
  if (!E.size) { R.alertes.push('Fichier IFC illisible (section DATA absente).'); return R; }
  const A = (id) => { const e = E.get(id); if (!e) return null; return e.a || (e.a = lireArgs(e.s)); };
  const T = (id) => (E.get(id) || {}).t;
  const ref = (v) => (v && typeof v === 'object' && 'ref' in v ? v.ref : null);
  const nombre = (v) => (typeof v === 'number' ? v : v && typeof v === 'object' && typeof v.v === 'number' ? v.v : null);
  const ids = (...types) => types.flatMap((t) => parType.get(t) || []);
  /* unité de longueur */
  for (const id of ids('IFCUNITASSIGNMENT')) for (const u of A(id)[0] || []) {
    const uid = ref(u), a = A(uid); if (!a) continue;
    if (T(uid) === 'IFCSIUNIT' && a[1] && a[1].enum === 'LENGTHUNIT') { const p = a[2] && a[2].enum; R.unite = p === 'MILLI' ? { cm: 0.1, nom: 'millimètres' } : p === 'CENTI' ? { cm: 1, nom: 'centimètres' } : p === 'DECI' ? { cm: 10, nom: 'décimètres' } : { cm: 100, nom: 'mètres' }; }
    else if (T(uid) === 'IFCCONVERSIONBASEDUNIT' && a[1] && a[1].enum === 'LENGTHUNIT') { const n = String(a[2] || '').toUpperCase(); if (/FOOT|FEET|PIED/.test(n)) R.unite = { cm: 30.48, nom: 'pieds' }; else if (/INCH|POUCE/.test(n)) R.unite = { cm: 2.54, nom: 'pouces' }; }
  }
  const k = R.unite.cm;
  const proj = ids('IFCPROJECT')[0]; if (proj) R.projet = String(A(proj)[5] || A(proj)[2] || '');
  /* repères */
  const point = (id) => { const a = A(id); return a && Array.isArray(a[0]) ? a[0].map((v) => +v || 0) : [0, 0, 0]; };
  const dir = (id) => { const a = id && A(id); return a && Array.isArray(a[0]) ? a[0].map((v) => +v || 0) : null; };
  function repere(id) { // IfcAxis2Placement3D / 2D
    const a = id && A(id); if (!a) return ID;
    const o = point(ref(a[0]));
    if (T(id) === 'IFCAXIS2PLACEMENT2D') { const d = dir(ref(a[1])) || [1, 0]; const x = norm([d[0], d[1], 0]); return [x[0], x[1], 0, -x[1], x[0], 0, 0, 0, 1, o[0], o[1], 0]; }
    const z = norm(dir(ref(a[1])) || [0, 0, 1]); let x = dir(ref(a[2])) || [1, 0, 0];
    const d = x[0] * z[0] + x[1] * z[1] + (x[2] || 0) * z[2]; x = norm([x[0] - d * z[0], x[1] - d * z[1], (x[2] || 0) - d * z[2]]);
    const y = cross(z, x);
    return [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2], o[0], o[1], o[2] || 0];
  }
  const PL = new Map();
  function placement(id, prof = 0) { // IfcLocalPlacement → repère dans le monde
    if (!id) return ID; if (PL.has(id)) return PL.get(id);
    const a = A(id); let M = ID;
    if (a && T(id) === 'IFCLOCALPLACEMENT') { const loc = repere(ref(a[1])); M = prof < 60 && ref(a[0]) ? mulM(placement(ref(a[0]), prof + 1), loc) : loc; }
    PL.set(id, M); return M;
  }
  /* contour d'un profil (2D) */
  function contour(id) {
    const a = id && A(id), t = T(id); if (!a) return null;
    if (t === 'IFCRECTANGLEPROFILEDEF' || t === 'IFCROUNDEDRECTANGLEPROFILEDEF') { const M = repere(ref(a[2])), x = nombre(a[3]) / 2, y = nombre(a[4]) / 2; if (!(x > 0 && y > 0)) return null; return [[-x, -y], [x, -y], [x, y], [-x, y]].map((p) => pt(M, p)); }
    if (t === 'IFCARBITRARYCLOSEDPROFILEDEF' || t === 'IFCARBITRARYPROFILEDEFWITHVOIDS') return courbe(ref(a[2]));
    return null;
  }
  function courbe(id) {
    const a = id && A(id), t = T(id); if (!a) return null;
    if (t === 'IFCPOLYLINE') return (a[0] || []).map((p) => point(ref(p)));
    if (t === 'IFCINDEXEDPOLYCURVE') { const l = A(ref(a[0])); return l && Array.isArray(l[0]) ? l[0].map((p) => p.map((v) => +v || 0)) : null; }
    if (t === 'IFCCOMPOSITECURVE') { const o = []; for (const s of a[0] || []) { const sa = A(ref(s)); const c = sa && courbe(ref(sa[2])); if (c) o.push(...c); } return o.length >= 3 ? o : null; }
    return null;
  }
  /* premier volume extrudé d'une représentation : { pts (monde), dz (direction d'extrusion, monde), depth, z } */
  function volume(itemId, M, prof = 0) {
    const a = itemId && A(itemId), t = T(itemId); if (!a || prof > 8) return null;
    if (t === 'IFCEXTRUDEDAREASOLID') {
      const c = contour(ref(a[0])); if (!c || c.length < 3) return null;
      const W = mulM(M, repere(ref(a[1]))), d = vec(W, dir(ref(a[2])) || [0, 0, 1]);
      return { pts: c.map((p) => pt(W, [p[0], p[1], 0])), dz: norm(d), depth: nombre(a[3]) || 0 };
    }
    if (t === 'IFCBOOLEANCLIPPINGRESULT' || t === 'IFCBOOLEANRESULT') return volume(ref(a[1]), M, prof + 1);
    if (t === 'IFCMAPPEDITEM') {
      const src = A(ref(a[0])), op = A(ref(a[1])); if (!src) return null;
      let W = M;
      if (op) { const o = point(ref(op[2])); const x = norm(dir(ref(op[0])) || [1, 0, 0]), y0 = dir(ref(op[1])) || [0, 1, 0], z = norm(cross(x, y0)), y = cross(z, x); W = mulM(M, [x[0], x[1], x[2], y[0], y[1], y[2], z[0], z[1], z[2], o[0], o[1], o[2] || 0]); }
      W = mulM(W, repere(ref(src[0])));
      return dansRep(ref(src[1]), W, prof + 1);
    }
    return null;
  }
  function dansRep(repId, M, prof = 0) { const a = repId && A(repId); if (!a) return null; for (const it of a[3] || []) { const v = volume(ref(it), M, prof); if (v) return v; } return null; }
  function volumeProduit(id) {
    const a = A(id); if (!a) return null;
    const M = placement(ref(a[5])), shape = A(ref(a[6])); if (!shape) return null;
    const reps = (shape[2] || []).map(ref).filter(Boolean);
    /* la représentation « Body » d'abord */
    reps.sort((x, y) => ((A(x) || [])[1] === 'Body' ? 0 : 1) - ((A(y) || [])[1] === 'Body' ? 0 : 1));
    for (const r of reps) { const ra = A(r); if (ra && (ra[1] === 'Axis' || ra[1] === 'FootPrint' || ra[1] === 'Box')) continue; const v = dansRep(r, M); if (v) return v; }
    return null;
  }
  /* emprise au sol d'un volume vertical : axe (le long du plus grand côté), longueur, épaisseur */
  function emprise(v) {
    if (!v || Math.abs(v.dz[2]) < 0.7) return null;
    const p = v.pts; let best = 0, ux = 1, uy = 0;
    for (let i = 0; i < p.length; i++) { const q = p[(i + 1) % p.length], dx = q[0] - p[i][0], dy = q[1] - p[i][1], l = Math.hypot(dx, dy); if (l > best) { best = l; ux = dx / l; uy = dy / l; } }
    if (!(best > 0)) return null;
    let t0 = Infinity, t1 = -Infinity, n0 = Infinity, n1 = -Infinity, z = Infinity;
    for (const q of p) { const t = q[0] * ux + q[1] * uy, n = -q[0] * uy + q[1] * ux; if (t < t0) t0 = t; if (t > t1) t1 = t; if (n < n0) n0 = n; if (n > n1) n1 = n; if (q[2] < z) z = q[2]; }
    const nm = (n0 + n1) / 2, P2 = (t) => ({ x: ux * t - uy * nm, y: uy * t + ux * nm });
    return { a: P2(t0), b: P2(t1), L: t1 - t0, th: n1 - n0, z: v.dz[2] < 0 ? z - v.depth : z, h: v.depth * Math.abs(v.dz[2]), ux, uy, rect: p.length <= 5 };
  }
  /* niveaux */
  const stId = ids('IFCBUILDINGSTOREY');
  const niveaux = stId.map((id) => { const a = A(id), M = placement(ref(a[5])); const e = nombre(a[9]); return { id, nom: String(a[2] || a[7] || 'Niveau'), elev: (e != null ? e : M[11]) * k, zMonde: M[11] * k }; }).sort((x, y) => x.elev - y.elev);
  const contenu = new Map();
  for (const id of ids('IFCRELCONTAINEDINSPATIALSTRUCTURE')) { const a = A(id), st = ref(a[5]); for (const e of a[4] || []) contenu.set(ref(e), st); }
  for (const id of ids('IFCRELAGGREGATES', 'IFCRELDECOMPOSES')) { const a = A(id), parent = ref(a[4]); if (T(parent) !== 'IFCBUILDINGSTOREY') continue; for (const e of a[5] || []) contenu.set(ref(e), parent); }
  const niveauDe = (id, zcm) => {
    const st = contenu.get(id); if (st && T(st) === 'IFCBUILDINGSTOREY') return st;
    let best = null; for (const n of niveaux) if (n.zMonde <= zcm + 30) best = n; return best ? best.id : niveaux.length ? niveaux[0].id : null;
  };
  /* murs */
  const mursParId = new Map();
  for (const id of ids('IFCWALL', 'IFCWALLSTANDARDCASE', 'IFCWALLELEMENTEDCASE')) {
    const e = emprise(volumeProduit(id));
    if (!e || !(e.L * k >= 5) || !(e.th * k >= 1)) { R.illisibles++; continue; }
    const m = { id, niveau: niveauDe(id, e.z * k), nom: String(A(id)[2] || ''), a: { x: e.a.x * k, y: -e.a.y * k }, b: { x: e.b.x * k, y: -e.b.y * k }, th: e.th * k, h: e.h * k, z: e.z * k, approx: !e.rect };
    if (m.th > 0.6 * e.L * k && m.th > 60) { R.illisibles++; continue; } // volume massif, pas un mur
    mursParId.set(id, m); R.murs.push(m);
  }
  /* ouvertures : réservation dans un mur, éventuellement remplie par une porte ou une fenêtre */
  const remplie = new Map();
  for (const id of ids('IFCRELFILLSELEMENT')) { const a = A(id); remplie.set(ref(a[4]), ref(a[5])); }
  for (const id of ids('IFCRELVOIDSELEMENT')) {
    const a = A(id), m = mursParId.get(ref(a[4])), op = ref(a[5]); if (!m || !op) continue;
    const fill = remplie.get(op), ft = fill ? T(fill) : null, fa = fill ? A(fill) : null;
    const v = volumeProduit(op), ux = m.b.x - m.a.x, uy = m.b.y - m.a.y, L = Math.hypot(ux, uy) || 1;
    let c = null, w = null, hh = null, z = null;
    if (v) {
      let t0 = Infinity, t1 = -Infinity, zmin = Infinity;
      for (const q of v.pts) { const t = ((q[0] * k - m.a.x) * ux + (-q[1] * k - m.a.y) * uy) / L; if (t < t0) t0 = t; if (t > t1) t1 = t; if (q[2] < zmin) zmin = q[2]; }
      c = (t0 + t1) / 2; w = t1 - t0; hh = v.depth * k; z = (v.dz[2] < 0 ? zmin - v.depth : zmin) * k;
    } else { const M = placement(ref(A(op)[5])); c = ((M[9] * k - m.a.x) * ux + (-M[10] * k - m.a.y) * uy) / L; z = M[11] * k; }
    const kind = ft === 'IFCDOOR' || ft === 'IFCDOORSTANDARDCASE' ? 'door' : ft === 'IFCWINDOW' || ft === 'IFCWINDOWSTANDARDCASE' ? 'window' : 'gap';
    if (fa && kind !== 'gap') { const ow = nombre(fa[9]), oh = nombre(fa[8]); if (ow > 0) w = ow * k; if (oh > 0) hh = oh * k; }
    if (!(w > 5) || c == null) continue;
    const st = niveaux.find((n) => n.id === m.niveau);
    R.ouvertures.push({ mur: m.id, niveau: m.niveau, x: m.a.x + (ux / L) * c, y: m.a.y + (uy / L) * c, w, h: hh, sill: st && z != null ? Math.max(0, z - st.zMonde) : null, kind, nom: fa ? String(fa[2] || '') : '' });
  }
  /* locaux : nom et point à l'intérieur (centre du volume, sinon origine) */
  for (const id of ids('IFCSPACE')) {
    const a = A(id), nom = String(a[7] || a[2] || '').trim(); if (!nom) continue;
    const v = volumeProduit(id), M = placement(ref(a[5])); let x = M[9], y = M[10];
    if (v && v.pts.length) { x = v.pts.reduce((s, p) => s + p[0], 0) / v.pts.length; y = v.pts.reduce((s, p) => s + p[1], 0) / v.pts.length; }
    R.espaces.push({ niveau: niveauDe(id, M[11] * k), nom: nom.slice(0, 40), x: x * k, y: -y * k });
  }
  /* ce qui n'est pas repris */
  const NOMS = { IFCSLAB: 'dalles', IFCCOLUMN: 'poteaux', IFCBEAM: 'poutres', IFCROOF: 'toitures', IFCSTAIR: 'escaliers', IFCSTAIRFLIGHT: 'volées d’escalier', IFCRAILING: 'garde-corps', IFCCURTAINWALL: 'murs-rideaux', IFCFURNISHINGELEMENT: 'mobilier', IFCFURNITURE: 'mobilier', IFCCOVERING: 'revêtements', IFCBUILDINGELEMENTPROXY: 'objets génériques', IFCFLOWTERMINAL: 'terminaux de réseaux', IFCFLOWSEGMENT: 'tronçons de réseaux', IFCPLATE: 'panneaux', IFCMEMBER: 'profilés', IFCFOOTING: 'fondations', IFCELECTRICAPPLIANCE: 'appareils électriques', IFCLIGHTFIXTURE: 'luminaires', IFCOUTLET: 'prises', IFCSWITCHINGDEVICE: 'interrupteurs', IFCSANITARYTERMINAL: 'sanitaires' };
  for (const [t, n] of Object.entries(NOMS)) { const c = (parType.get(t) || []).length; if (c) R.ignores[n] = (R.ignores[n] || 0) + c; }
  const sans = (parType.get('IFCDOOR') || []).length + (parType.get('IFCWINDOW') || []).length - R.ouvertures.filter((o) => o.kind !== 'gap').length;
  if (sans > 0) R.ignores['portes ou fenêtres sans réservation dans un mur'] = sans;
  /* décalage commun à tous les niveaux : le bâtiment commence en (0, 0) */
  let x0 = Infinity, y0 = Infinity;
  for (const m of R.murs) { x0 = Math.min(x0, m.a.x, m.b.x); y0 = Math.min(y0, m.a.y, m.b.y); }
  if (isFinite(x0)) { for (const m of R.murs) { m.a.x -= x0; m.b.x -= x0; m.a.y -= y0; m.b.y -= y0; } for (const o of [...R.ouvertures, ...R.espaces]) { o.x -= x0; o.y -= y0; } }
  /* hauteur des niveaux : hauteur la plus fréquente des murs ; épaisseur de plancher : écart avec le niveau suivant */
  R.niveaux = niveaux.map((n, i) => {
    const hs = R.murs.filter((m) => m.niveau === n.id).map((m) => Math.round(m.h)).filter((h) => h > 50).sort((a, b) => a - b);
    const h = hs.length ? hs[Math.floor(hs.length / 2)] : null, suiv = niveaux[i + 1];
    const ecart = suiv ? suiv.elev - n.elev : null;
    let dalle = null; if (h != null && ecart != null && ecart - h >= 3 && ecart - h <= 100) dalle = Math.round(ecart - h);
    return { id: n.id, nom: n.nom, elev: Math.round(n.elev * 10) / 10, h, dalle, murs: R.murs.filter((m) => m.niveau === n.id).length };
  });
  if (!R.niveaux.length && R.murs.length) { R.niveaux = [{ id: 0, nom: 'Niveau', elev: 0, h: null, dalle: null, murs: R.murs.length }]; for (const m of R.murs) m.niveau = 0; for (const o of [...R.ouvertures, ...R.espaces]) o.niveau = 0; }
  fermerAngles(R.murs);
  const r1 = (v) => Math.round(v * 10) / 10;
  for (const m of R.murs) { m.a.x = r1(m.a.x); m.a.y = r1(m.a.y); m.b.x = r1(m.b.x); m.b.y = r1(m.b.y); m.th = Math.max(5, Math.round(m.th)); }
  return R;
}
/* le bout d'un mur qui s'arrête contre la face d'un autre mur du même niveau est prolongé jusqu'à son axe */
function fermerAngles(murs) {
  const par = new Map(); for (const m of murs) { let l = par.get(m.niveau); if (!l) par.set(m.niveau, (l = [])); l.push(m); }
  for (const l of par.values()) {
    const neuf = [];
    for (const m of l) for (const bout of ['a', 'b']) {
      const E = m[bout], O = bout === 'a' ? m.b : m.a, dx = E.x - O.x, dy = E.y - O.y, Lm = Math.hypot(dx, dy); if (!(Lm > 0)) continue;
      let best = null;
      for (const w of l) {
        if (w === m) continue;
        const wx = w.b.x - w.a.x, wy = w.b.y - w.a.y, Lw = Math.hypot(wx, wy); if (!(Lw > 0)) continue;
        const det = (dx / Lm) * (wy / Lw) - (dy / Lm) * (wx / Lw); if (Math.abs(det) < 0.34) continue;
        /* intersection des deux axes */
        const ex = w.a.x - O.x, ey = w.a.y - O.y;
        const tm = (ex * (wy / Lw) - ey * (wx / Lw)) / det, tw = (ex * (dy / Lm) - ey * (dx / Lm)) / det;
        const marge = w.th / 2 + m.th / 2 + 6;
        if (tw < -marge || tw > Lw + marge) continue;
        const d = Math.abs(tm - Lm); if (d > w.th / 2 + 12) continue;
        if (!best || d < best.d) best = { d, x: O.x + (dx / Lm) * tm, y: O.y + (dy / Lm) * tm };
      }
      if (best) neuf.push([m, bout, best]);
    }
    for (const [m, bout, p] of neuf) { m[bout].x = p.x; m[bout].y = p.y; }
  }
}

export { fermerAngles, lireArgs, lireIfc, texteStep };

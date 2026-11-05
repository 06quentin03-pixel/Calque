/* Calque — module « éclairage » : concepteur d'éclairage par la méthode des lumens, présenté comme une ESTIMATION.
   JavaScript pur, sans accès à l'écran : testable avec Node. Les fonctions ne modifient jamais le plan reçu.

   Méthode (écrite à côté de chaque résultat) :
   - méthode des lumens : E moyen = N × Φ × U × MF / A
       N luminaires de flux Φ (lm), facteur d'utilance U, facteur de maintenance MF, surface A (m²) ;
   - U « saisi » (tableau d'utilance du fabricant, qui tient compte des réflexions) ou, à défaut, U « estimé » :
     part du flux qui arrive DIRECTEMENT sur le plan utile, calculée point par point (réflexions des murs et du
     plafond ignorées : estimation prudente) ;
   - calcul point par point (composante directe) : E = I(C, γ) × cos γ / d² sur une grille du plan utile,
     d'où l'éclairement minimal et l'uniformité Emin / Emoy ;
   - répartition de l'intensité : celle du fichier photométrique (IES / LDT) s'il y en a un, sinon une répartition
     supposée lambertienne I(γ) = Φ / π × cos γ (luminaire qui éclaire vers le bas), marquée « estimée ».

   AUCUNE valeur d'éclairement réglementaire n'est fournie : l'éclairement visé est toujours saisi par l'utilisateur
   (avec sa source s'il le souhaite). Unités : cm dans le plan, m, lm, lx et W dans les résultats. */
import { bboxOf, inPoly, isNum } from './noyau.js';
import { intensitePhotometrie } from './photometrie.js';

/* luminaires que le concepteur sait implanter : symboles posés au plafond, qui éclairent vers le bas.
   hBas : écart estimé entre le plafond et le centre lumineux (suspension), en cm (valeur de Calque, « estimée »). */
const TYPES_ECL = {
  spot: { n: 'Spot encastré' },
  dalle_led: { n: 'Dalle LED' },
  plafonnier: { n: 'Plafonnier' },
  pl: { n: 'Point lumineux (DCL)' },
  suspension: { n: 'Suspension', hBas: 70 },
  spot_orient: { n: 'Spot orientable' },
  reglette: { n: 'Réglette / tube LED' },
  rail_spot: { n: 'Rail de spots' },
};
const TYPES_ECL_IDS = Object.keys(TYPES_ECL);
/* valeurs par défaut de Calque (« estimées », jamais présentées comme une règle) */
const MF_DEFAUT = { v: 0.8, st: 'estimee', src: 'Valeur courante retenue par Calque (local propre, entretien régulier), à adapter' };
const HU_DEFAUT = { v: 80, st: 'estimee', src: 'Hauteur courante d’un plan de travail, valeur de Calque' };
const MAX_COTE = 12; // dispositions étudiées : jusqu'à 12 × 12 luminaires
const LIB = { verifiee: 'Vérifiée', saisie: 'Saisie', estimee: 'Estimée' };

const isDonnee = (d) => !!d && typeof d === 'object' && isNum(d.v);
const r1 = (x) => Math.round(x * 10) / 10;

/* ---------------- intensité d'un luminaire ---------------- */
/* répartition lambertienne : I(γ) = Φ/π cos γ (flux total Φ émis dans le demi-espace inférieur) */
function intensiteLambert(flux) { const I0 = flux / Math.PI; return (C, g) => (g < 90 ? I0 * Math.cos((g * Math.PI) / 180) : 0); }
/* fonction I(C, γ) en candelas d'un luminaire { flux, ph } : fichier photométrique s'il y en a un, sinon lambertien */
function fonctionIntensite(lum) {
  if (lum && lum.ph && Array.isArray(lum.ph.I)) return (C, g) => intensitePhotometrie(lum.ph, C, g);
  return intensiteLambert(lum.flux);
}

/* ---------------- calcul point par point (composante directe) ----------------
   lums : [{ x, y, z (cm, hauteur du centre lumineux au-dessus du sol), rot (degrés), I(C, γ) }]
   pts : [{ x, y }] points du plan utile, à la hauteur zPlan (cm). Résultat : éclairements en lux. */
function eclairementsDirects(lums, pts, zPlan) {
  const out = new Float64Array(pts.length);
  for (const L of lums) {
    const h = (L.z - zPlan) / 100; if (!(h > 0)) continue;
    const a = ((L.rot || 0) * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a);
    for (let i = 0; i < pts.length; i++) {
      const dx = (pts[i].x - L.x) / 100, dy = (pts[i].y - L.y) / 100;
      const r2 = dx * dx + dy * dy, d2 = r2 + h * h, d = Math.sqrt(d2);
      const g = (Math.acos(h / d) * 180) / Math.PI;
      // angle C dans le repère du luminaire : C0 le long de son axe x local, C90 le long de son axe y local
      const lx = dx * ca + dy * sa, ly = -dx * sa + dy * ca;
      let C = r2 > 1e-12 ? (Math.atan2(ly, lx) * 180) / Math.PI : 0; if (C < 0) C += 360;
      out[i] += (L.I(C, g) * (h / d)) / d2;
    }
  }
  return out;
}

/* ---------------- géométrie de la pièce ---------------- */
const dansPiece = (p, poly, holes) => inPoly(p, poly) && !(holes || []).some((hp) => inPoly(p, hp));
/* grille de calcul : centres de cases d'environ `pas` cm (au plus ~ 900 points), à l'intérieur de la pièce */
function grilleCalcul(poly, holes, pas) {
  const b = bboxOf(poly), W = b.x1 - b.x0, Hh = b.y1 - b.y0;
  let s = pas || Math.max(10, Math.min(50, Math.min(W, Hh) / 10));
  while ((W / s) * (Hh / s) > 900) s *= 1.25;
  const nx = Math.max(1, Math.round(W / s)), ny = Math.max(1, Math.round(Hh / s)), pts = [];
  for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
    const p = { x: b.x0 + ((i + 0.5) * W) / nx, y: b.y0 + ((j + 0.5) * Hh) / ny };
    if (dansPiece(p, poly, holes)) pts.push(p);
  }
  return pts;
}
/* disposition régulière r rangées × c colonnes : centres des cases du rectangle englobant, gardés dans la pièce */
function disposition(poly, holes, r, c) {
  const b = bboxOf(poly), W = b.x1 - b.x0, Hh = b.y1 - b.y0, pts = [];
  for (let i = 0; i < c; i++) for (let j = 0; j < r; j++) {
    const p = { x: Math.round(b.x0 + ((i + 0.5) * W) / c), y: Math.round(b.y0 + ((j + 0.5) * Hh) / r) };
    if (dansPiece(p, poly, holes)) pts.push(p);
  }
  return { pts, sx: W / c, sy: Hh / r };
}

/* ---------------- résultats d'une implantation ----------------
   en : entrées (voir entreesEtude) ; pos : positions des luminaires [{ x, y, rot? }] ; lum : luminaire utilisé */
function resultatImplantation(en, pos, lum) {
  const n = pos.length, A = en.A;
  const I = fonctionIntensite(lum);
  const lums = pos.map((p) => ({ x: p.x, y: p.y, z: en.zLum, rot: p.rot || 0, I }));
  const Ed = eclairementsDirects(lums, en.pts, en.hu.v);
  let s = 0, mn = Infinity; for (const v of Ed) { s += v; if (v < mn) mn = v; }
  const EdMoy = en.pts.length ? s / en.pts.length : 0, EdMin = en.pts.length ? mn : 0;
  const flux = lum.flux;
  // utilance directe : part du flux des luminaires qui arrive directement sur le plan utile de la pièce
  const Ud = n && flux > 0 ? (EdMoy * A) / (n * flux) : 0;
  const U = en.u ? en.u : { v: Ud, st: 'estimee', src: 'Composante directe calculée point par point (réflexions ignorées)' };
  const mf = en.mf.v;
  const Emoy = (n * flux * U.v * mf) / A;
  const Emin = EdMin * mf;
  const P = lum.p ? n * lum.p.v : null;
  return { n, Emoy, Emin, U0: EdMoy > 0 ? EdMin / EdMoy : 0, U, Ud, P, Wm2: P != null ? P / A : null, ok: Emoy >= en.E.v - 1e-9 };
}

/* ---------------- entrées d'une étude ----------------
   etude : { E, hu, mf, u (données { v, st, src }), hlum (cm, facultatif), lums: [{ type, flux, p, ph }] }
   piece : { poly, holes, area (cm²) } ; L : niveau (h = hauteur sous plafond, cm).
   Rien n'est deviné : une donnée manquante est listée et aucune proposition n'est calculée. */
function entreesEtude(etude, piece, L, photometries) {
  const et = etude || {}, manq = [];
  const A = piece && piece.area > 0 ? piece.area / 10000 : null;
  if (!A) manq.push({ nom: 'Pièce', pourquoi: 'La pièce doit être fermée par des murs.' });
  const E = isDonnee(et.E) && et.E.v > 0 ? et.E : null;
  if (!E) manq.push({ nom: 'Éclairement moyen visé', pourquoi: 'À saisir (en lux), d’après votre cahier des charges ou un document de référence : Calque ne fournit aucune valeur réglementaire.' });
  const hu = isDonnee(et.hu) ? et.hu : HU_DEFAUT, mf = isDonnee(et.mf) && et.mf.v > 0 && et.mf.v <= 1 ? et.mf : MF_DEFAUT;
  const u = isDonnee(et.u) && et.u.v > 0 && et.u.v <= 1.5 ? et.u : null;
  const Hsp = L && isNum(L.h) && L.h > 0 ? L.h : 250;
  const phs = new Map((photometries || []).map((p) => [p.id, p]));
  const lums = [];
  (et.lums || []).forEach((l, i) => {
    if (!l || !TYPES_ECL[l.type]) return;
    const ph = l.ph ? phs.get(l.ph) || null : null;
    const flux = ph && isDonnee(ph.flux) ? ph.flux : isDonnee(l.flux) && l.flux.v > 0 ? l.flux : null;
    const p = ph && isDonnee(ph.p) && ph.p.v > 0 ? ph.p : isDonnee(l.p) && l.p.v > 0 ? l.p : null;
    const nom = `Luminaire ${i + 1} (${TYPES_ECL[l.type].n})`;
    if (!flux) { manq.push({ nom: `${nom} : flux lumineux`, pourquoi: 'À saisir depuis la fiche du fabricant, ou à lire dans un fichier IES / LDT.' }); return; }
    lums.push({ i, type: l.type, flux: flux.v, fluxD: flux, p, ph, rep: ph ? { st: ph.flux.st, src: 'Répartition du fichier ' + (ph.file || 'photométrique') } : { st: 'estimee', src: 'Répartition supposée lambertienne (luminaire qui éclaire vers le bas)' } });
  });
  if (!(et.lums || []).length) manq.push({ nom: 'Luminaire', pourquoi: 'Choisissez au moins un type de luminaire et indiquez son flux.' });
  const hBas = (t) => (TYPES_ECL[t] && TYPES_ECL[t].hBas) || 0;
  const zLumOf = (t) => (isNum(et.hlum) && et.hlum > 0 ? et.hlum : Hsp - hBas(t));
  if (A && hu.v >= Math.min(...((et.lums || []).map((l) => zLumOf(l && l.type)).concat([Hsp]))))
    manq.push({ nom: 'Hauteur du plan utile', pourquoi: 'Elle doit être plus basse que les luminaires.' });
  const pts = A ? grilleCalcul(piece.poly, piece.holes) : [];
  return { A, E, hu, mf, u, Hsp, lums, zLumOf, pts, poly: piece && piece.poly, holes: piece && piece.holes, manquantes: manq };
}

/* ---------------- propositions ----------------
   Toutes les dispositions régulières jusqu'à 12 × 12, pour chaque luminaire ; on garde celles qui atteignent
   l'éclairement visé, puis 3 propositions distinctes selon des critères écrits en clair. */
const CRITERES = [
  { id: 'puissance', n: 'La plus économe', pq: 'Puissance totale la plus faible', key: (c) => [c.P, c.n, -c.U0], need: (c) => c.P != null },
  { id: 'nombre', n: 'Le moins de luminaires', pq: 'Nombre de luminaires le plus faible', key: (c) => [c.n, -c.U0, c.P == null ? 0 : c.P] },
  { id: 'uniformite', n: 'La plus uniforme', pq: 'Meilleure uniformité (Emin / Emoy), sans dépasser deux fois le nombre minimal de luminaires', key: (c) => [-r1(c.U0 * 100), c.n] },
  { id: 'compromis', n: 'Autre disposition', pq: 'Disposition suivante en nombre de luminaires', key: (c) => [c.n, c.rows * 100 + c.cols] },
];
const cmpKey = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] < b[i] ? -1 : 1; return 0; };
function candidats(en) {
  const out = [];
  if (!en.A || !en.E || en.manquantes.some((m) => m.nom === 'Hauteur du plan utile')) return out;
  const b = bboxOf(en.poly), W = b.x1 - b.x0, Hh = b.y1 - b.y0;
  for (const lum of en.lums) {
    const enL = Object.assign({}, en, { zLum: en.zLumOf(lum.type) });
    for (let r = 1; r <= MAX_COTE; r++) for (let c = 1; c <= MAX_COTE; c++) {
      const sx = W / c, sy = Hh / r, ratio = sx / sy;
      if (r > 1 && c > 1 && (ratio < 0.5 || ratio > 2)) continue; // dispositions trop étirées
      if (r === 1 && c > 1 && sx > Hh * 2.2) continue;
      if (c === 1 && r > 1 && sy > W * 2.2) continue;
      const d = disposition(en.poly, en.holes, r, c); if (!d.pts.length) continue;
      const res = resultatImplantation(enL, d.pts, lum);
      out.push(Object.assign(res, { lum: lum.i, type: lum.type, rows: r, cols: c, sx: d.sx, sy: d.sy, pos: d.pts, zLum: enL.zLum }));
    }
  }
  return out;
}
function propositions(etude, piece, L, photometries) {
  const en = entreesEtude(etude, piece, L, photometries);
  const all = candidats(en), ok = all.filter((c) => c.ok);
  const res = { en, props: [], aucun: false };
  if (en.manquantes.length || !all.length) return res;
  if (!ok.length) { res.aucun = true; return res; }
  const minN = Math.min(...ok.map((c) => c.n));
  const pool = ok.filter((c) => c.n <= 2 * minN);
  const pris = new Set(), cle = (c) => `${c.lum}|${c.rows}|${c.cols}`;
  for (const k of CRITERES) {
    if (res.props.length >= 3) break;
    const l = pool.filter((c) => !k.need || k.need(c)); if (!l.length || (k.need && l.length < pool.length)) continue;
    l.sort((a, b) => cmpKey(k.key(a), k.key(b)));
    const c = l.find((x) => !pris.has(cle(x))); if (!c) continue;
    pris.add(cle(c));
    // à égalité avec une proposition déjà retenue sur ce critère : c'est seulement une autre disposition
    const egal = res.props.some((p) => k.key(p)[0] === k.key(c)[0]);
    res.props.push(Object.assign({ critere: k.id, titre: egal ? 'Autre disposition' : k.n, pourquoi: egal ? 'Même résultat sur ce critère, disposition différente' : k.pq }, c));
  }
  return res;
}

/* ---------------- implantation actuelle ----------------
   luminaires du plan posés dans la pièce et dont le flux est connu (photométrie du symbole) */
function lumDuSymbole(e, photometries) {
  const l = e && e.lum; if (!l || typeof l !== 'object') return null;
  const ph = l.ph ? (photometries || []).find((p) => p.id === l.ph) || null : null;
  const flux = ph && isDonnee(ph.flux) ? ph.flux : isDonnee(l.flux) && l.flux.v > 0 ? l.flux : null;
  const p = ph && isDonnee(ph.p) && ph.p.v > 0 ? ph.p : isDonnee(l.p) && l.p.v > 0 ? l.p : null;
  return flux ? { flux: flux.v, fluxD: flux, p, ph } : null;
}
function implantationActuelle(etude, piece, L, symboles, photometries) {
  const en = entreesEtude(Object.assign({}, etude, { lums: [] }), piece, L, photometries);
  en.manquantes = en.manquantes.filter((m) => m.nom !== 'Luminaire');
  const dedans = (symboles || []).filter((e) => TYPES_ECL[e.type] && piece && dansPiece(e, piece.poly, piece.holes));
  const sans = dedans.filter((e) => !lumDuSymbole(e, photometries));
  const avec = dedans.filter((e) => lumDuSymbole(e, photometries));
  const out = { en, n: dedans.length, sansFlux: sans.length, res: null };
  if (!en.A || !avec.length || en.manquantes.some((m) => m.nom === 'Hauteur du plan utile')) return out;
  // somme des contributions de chaque luminaire (types et flux différents possibles)
  const zOf = (e) => en.zLumOf(e.type);
  const lums = avec.map((e) => { const l = lumDuSymbole(e, photometries); return { x: e.x, y: e.y, z: zOf(e), rot: e.rot || 0, I: fonctionIntensite(l), l }; });
  const Ed = eclairementsDirects(lums, en.pts, en.hu.v);
  let s = 0, mn = Infinity; for (const v of Ed) { s += v; if (v < mn) mn = v; }
  const EdMoy = en.pts.length ? s / en.pts.length : 0, EdMin = en.pts.length ? mn : 0;
  const fluxTot = lums.reduce((t, x) => t + x.l.flux, 0);
  const Ud = fluxTot > 0 ? (EdMoy * en.A) / fluxTot : 0;
  const U = en.u ? en.u : { v: Ud, st: 'estimee', src: 'Composante directe calculée point par point (réflexions ignorées)' };
  const Emoy = (fluxTot * U.v * en.mf.v) / en.A;
  const pw = lums.every((x) => x.l.p) ? lums.reduce((t, x) => t + x.l.p.v, 0) : null;
  out.res = { n: avec.length, fluxTot, Emoy, Emin: EdMin * en.mf.v, U0: EdMoy > 0 ? EdMin / EdMoy : 0, U, Ud, P: pw, Wm2: pw != null ? pw / en.A : null, ok: en.E ? Emoy >= en.E.v - 1e-9 : null };
  return out;
}

/* ---------------- nettoyage (migration et import) ---------------- */
function cleanD(d, ok) {
  if (!d || typeof d !== 'object' || !isNum(d.v) || (ok && !ok(d.v))) return null;
  const src = typeof d.src === 'string' ? d.src.trim() : '';
  let st = ['verifiee', 'saisie', 'estimee'].includes(d.st) ? d.st : 'saisie';
  if (st === 'verifiee' && !src) st = 'saisie';
  return src ? { v: d.v, st, src } : { v: d.v, st };
}
/* photométrie d'un symbole : { ph (photométrie du plan), flux, p (données) } */
function nettoyerLum(l) {
  if (!l || typeof l !== 'object' || Array.isArray(l)) return null;
  const o = {};
  if (typeof l.ph === 'string' && l.ph) o.ph = l.ph;
  const flux = cleanD(l.flux, (v) => v > 0 && v < 1e7), p = cleanD(l.p, (v) => v > 0 && v < 1e6);
  if (flux) o.flux = flux; if (p) o.p = p;
  return Object.keys(o).length ? o : null;
}
/* étude d'éclairage d'une pièce */
function nettoyerEtude(e) {
  if (!e || typeof e !== 'object' || typeof e.id !== 'string' || typeof e.room !== 'string') return null;
  const o = { id: e.id, lv: typeof e.lv === 'string' ? e.lv : undefined, room: e.room };
  if (!o.lv) delete o.lv;
  const E = cleanD(e.E, (v) => v > 0 && v < 1e6), hu = cleanD(e.hu, (v) => v >= 0 && v < 1000), mf = cleanD(e.mf, (v) => v > 0 && v <= 1), u = cleanD(e.u, (v) => v > 0 && v <= 1.5);
  if (E) o.E = E; if (hu) o.hu = hu; if (mf) o.mf = mf; if (u) o.u = u;
  if (isNum(e.hlum) && e.hlum > 0 && e.hlum < 2000) o.hlum = e.hlum;
  o.lums = (Array.isArray(e.lums) ? e.lums : []).filter((l) => l && TYPES_ECL[l.type]).slice(0, 3).map((l) => Object.assign({ type: l.type }, nettoyerLum(l) || {}));
  if (Array.isArray(e.ids)) o.ids = e.ids.filter((x) => typeof x === 'string');
  return o;
}

export { CRITERES, HU_DEFAUT, LIB, MAX_COTE, MF_DEFAUT, TYPES_ECL, TYPES_ECL_IDS, candidats, dansPiece, disposition, eclairementsDirects,
  entreesEtude, fonctionIntensite, grilleCalcul, implantationActuelle, intensiteLambert, lumDuSymbole, nettoyerEtude, nettoyerLum,
  propositions, resultatImplantation };

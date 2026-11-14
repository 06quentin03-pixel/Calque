/* Calque — module « thermique » : déperditions thermiques des parois et des pièces, pour aider au dimensionnement du
   chauffage. JavaScript pur, sans accès à l'écran : testable avec Node.

   Méthode (simplifiée, inspirée de la NF EN 12831 ; ce n'est PAS une étude thermique réglementaire RE2020 / RT) :
     U = 1 / (Rsi + Σ e/λ + Rse)                       résistances superficielles conventionnelles (EN ISO 6946)
     paroi       Φ = U × A × ΔT × b                       ΔT = Ti − Te (extérieur, local non chauffé) ou Ti − Tvoisine
     ponts       Φ = ΔUpt × A(enveloppe) × ΔT × b           majoration forfaitaire des ponts thermiques
     air         Φ = 0,34 × n × V × ΔT                      n : renouvellement d'air (vol/h), V : volume de la pièce
   Toutes les données ont un statut : « saisie » (sur le plan), « estimée » (valeur courante proposée par Calque, à
   remplacer par la fiche du fabricant ou la valeur de votre étude) ; une donnée manquante n'est jamais remplacée en
   silence : le résultat est alors « partiel » et dit ce qui manque.

   Données du plan (format v17) :
     install.text   température extérieure de base { v, st, src } (°C) — à prendre pour votre commune (zone, altitude)
     install.dupt   majoration des ponts thermiques ΔU { v, st, src } (W/m²·K)
     pièce          ti (°C), nc (true : non chauffée), ach (renouvellement d'air, vol/h)
     niveau         dessous ('terreplein' | 'vide_sanitaire' | 'non_chauffe' | 'exterieur'), dessus ('combles' |
                    'non_chauffe' | 'toiture'), bsol / bplaf (coefficient b saisi) ; utilisés là où aucune pièce
                    chauffée n'est au-dessus ou au-dessous
     ouverture      uw (W/m²·K)
     couche         l (λ, W/m·K) ou r (R, m²·K/W) saisis */
import { isNum } from './noyau.js';
import { MATERIAUX, aCouches, compoNiveau, nomCouche } from './compositions.js';

const EST = 'Valeur courante estimée par Calque (ordre de grandeur usuel), à remplacer par la fiche du fabricant';
/* conductivité λ (W/m·K) ou résistance R (m²·K/W, lames d'air et vides, quelle que soit l'épaisseur) — estimées */
const LAMBDA = {
  plaque: { l: 0.25 }, plaque_h: { l: 0.25 }, enduit_platre: { l: 0.57 }, enduit_ext: { l: 1.0 }, lambris: { l: 0.13 },
  laine_verre: { l: 0.035 }, laine_roche: { l: 0.036 }, fibre_bois: { l: 0.04 }, pse: { l: 0.035 }, pu: { l: 0.023 },
  vide_tech: { r: 0.17 }, plenum: { r: 0.16 }, lame_air: { r: 0.17 },
  parpaing: { l: 0.95, eq: 1 }, brique: { l: 0.5, eq: 1 }, brique_platriere: { l: 0.5, eq: 1 }, brique_pleine: { l: 0.8 }, beton: { l: 2.3 },
  beton_cell: { l: 0.11 }, carreau_platre: { l: 0.4 }, pierre: { l: 1.7 }, ossature_bois: { l: 0.13 },
  carrelage: { l: 1.3 }, parquet: { l: 0.15 }, chape: { l: 1.4 }, chape_fluide: { l: 1.2 }, ravoirage: { l: 1.0 },
  dalle: { l: 2.3 }, compression: { l: 2.3 }, hourdis: { l: 1.33, eq: 1 }, plancher_bois: { l: 0.13 },
};
/* résistances superficielles conventionnelles (EN ISO 6946) : flux horizontal (mur), montant (plafond), descendant (plancher) */
const RS = { h: { si: 0.13, se: 0.04 }, up: { si: 0.10, se: 0.04 }, down: { si: 0.17, se: 0.04 } };
const SRC_RS = 'Résistances superficielles conventionnelles (EN ISO 6946)';
/* autre côté d'une paroi : coefficient b (part de l'écart de température) — estimé */
const COTES = {
  exterieur: { n: 'Extérieur', b: 1, se: true },
  toiture: { n: 'Toiture (sous rampants)', b: 1, se: true },
  combles: { n: 'Combles perdus', b: 0.9, se: false },
  non_chauffe: { n: 'Local non chauffé (garage, cellier…)', b: 0.5, se: false },
  vide_sanitaire: { n: 'Vide sanitaire', b: 0.8, se: false },
  terreplein: { n: 'Terre-plein (sol)', b: 0.5, se: false, sol: true },
};
const SRC_B = 'Coefficient b estimé par Calque (ordre de grandeur usuel), à adapter à votre bâtiment';
const DEF = {
  ti: { v: 19, st: 'estimee', src: 'Température intérieure de calcul usuelle (19 °C), à adapter' },
  tiSdb: { v: 22, st: 'estimee', src: 'Température usuelle d’une salle de bain (22 °C), à adapter' },
  ach: { v: 0.5, st: 'estimee', src: 'Renouvellement d’air usuel (0,5 vol/h), à adapter à la ventilation (VMC)' },
  dupt: { v: 0.1, st: 'estimee', src: 'Majoration forfaitaire courante des ponts thermiques (0,1 W/m²·K), à adapter' },
  uFen: { v: 1.5, st: 'estimee', src: 'Uw estimé d’une fenêtre double vitrage récente, à remplacer par la valeur du fabricant' },
  uPorte: { v: 2.0, st: 'estimee', src: 'Ud estimé d’une porte, à remplacer par la valeur du fabricant' },
};
const r3 = (v) => Math.round(v * 1000) / 1000;
const d = (v, st, src) => ({ v, st, src });
const estSdb = (lbl) => !!(lbl && /salle\s+(de\s+bain|d.eau)|douche/i.test(lbl.name || ''));

/* ---------------- paroi ---------------- */
/* résistance d'une couche : { r, st, src } ou null (manquante) */
function rCouche(c) {
  if (isNum(c.r)) return d(c.r, 'saisie', 'Résistance saisie');
  if (isNum(c.l)) return d(c.e / 100 / c.l, 'saisie', 'λ saisi');
  const t = LAMBDA[c.m]; if (!t) return null;
  if (isNum(t.r)) return d(t.r, 'estimee', EST + ' (lame d’air ou vide)');
  return d(c.e / 100 / t.l, 'estimee', EST + (t.eq ? ' (λ équivalent du bloc)' : ''));
}
/* U d'une composition. sens : 'h' | 'up' | 'down' ; cote : 'ext' (Rse), 'int' (Rsi des deux côtés), 'sol' (pas de Rse) */
function uParoi(couches, sens, cote) {
  if (!couches || !couches.length) return { u: null, manque: ['composition non renseignée'], couches: [] };
  const rs = RS[sens || 'h'], lignes = [], manque = [];
  let R = rs.si, est = false;
  for (const c of couches) {
    const x = rCouche(c);
    if (!x) { manque.push(`λ de « ${nomCouche(c)} »`); lignes.push({ c, r: null }); continue; }
    if (x.st === 'estimee') est = true;
    R += x.v; lignes.push({ c, r: r3(x.v), st: x.st, src: x.src, l: isNum(c.l) ? c.l : (LAMBDA[c.m] || {}).l });
  }
  const rse = cote === 'ext' ? rs.se : cote === 'sol' ? 0 : rs.si;
  R += rse;
  if (manque.length) return { u: null, manque, couches: lignes, rsi: rs.si, rse };
  return { u: r3(1 / R), R: r3(R), st: est ? 'estimee' : 'saisie', couches: lignes, rsi: rs.si, rse, src: SRC_RS };
}

/* ---------------- données ---------------- */
const lire = (x, def) => (x && isNum(x.v) ? x : def);
function tExt(plan) { const t = plan.install && plan.install.text; return t && isNum(t.v) ? t : null; }
function tInt(lbl) { if (lbl && isNum(lbl.ti)) return d(lbl.ti, 'saisie', 'Température saisie pour la pièce'); return estSdb(lbl) ? DEF.tiSdb : DEF.ti; }
function ach(lbl) { return lbl && isNum(lbl.ach) ? d(lbl.ach, 'saisie', 'Renouvellement d’air saisi') : DEF.ach; }
function dupt(plan) { return lire(plan.install && plan.install.dupt, DEF.dupt); }
function uOuverture(o) {
  if (isNum(o.uw)) return d(o.uw, 'saisie', 'U saisi');
  if (o.kind === 'window') return DEF.uFen;
  if (o.kind === 'door') return DEF.uPorte;
  return null; // passage libre, placard : pas une paroi
}
function surfOuverture(o, hm) {
  const w = isNum(o.w) ? o.w : 0;
  const hh = o.full ? hm : Math.min(hm, isNum(o.h) ? o.h : o.kind === 'window' ? 125 : 215);
  return (w * hh) / 1e4;
}
/* côté choisi pour un niveau : { cle, b, st, src } */
function coteNiveau(plan, L, k) {
  const lv = (plan.levels || []).slice().sort((a, b) => a.elev - b.elev), i = lv.findIndex((x) => x.id === L.id);
  const champ = k === 'sol' ? 'dessous' : 'dessus', bch = k === 'sol' ? 'bsol' : 'bplaf';
  let cle = L[champ], st = 'saisie';
  if (!COTES[cle]) { cle = k === 'sol' ? (i <= 0 ? 'terreplein' : 'non_chauffe') : (i === lv.length - 1 ? 'combles' : 'non_chauffe'); st = 'estimee'; }
  const b = isNum(L[bch]) ? d(L[bch], 'saisie', 'Coefficient b saisi') : COTES[cle].se ? d(1, 'saisie', 'Paroi donnant sur l’extérieur : b = 1') : d(COTES[cle].b, 'estimee', SRC_B);
  return { cle, n: COTES[cle].n, b, st, src: st === 'estimee' ? 'Côté non précisé : déduit de la position du niveau' : 'Saisi' };
}

/* ---------------- pièces ----------------
   pieces : pièces d'un niveau, fournies par l'appelant (géométrie de l'écran) : [{ label, loop, holes, area (cm²), poly }] ;
   toutes : Map lv → pièces (pour les niveaux du dessus et du dessous). */
function inPoly(p, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) c = !c; }
  return c;
}
const dans = (p, r) => inPoly(p, r.loop) && !(r.holes || []).some((h) => inPoly(p, h));
const pieceEn = (pieces, p) => (pieces || []).find((r) => dans(p, r)) || null;
const chauffee = (r) => !!(r && r.label && !r.label.nc && !r.label.ext && r.label.sol !== 'vide');
function mursDe(plan, lv) {
  const nodes = new Map((plan.nodes || []).map((n) => [n.id, n])), out = [];
  for (const w of plan.walls || []) {
    if (w.lv !== lv) continue;
    const A = nodes.get(w.a), B = nodes.get(w.b); if (!A || !B) continue;
    const L = Math.hypot(B.x - A.x, B.y - A.y); if (L < 1) continue;
    const dd = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
    out.push({ w, A, B, L, d: dd, n: { x: -dd.y, y: dd.x }, th: isNum(w.th) && w.th > 0 ? w.th : 20 });
  }
  return out;
}
/* pièce de chaque côté d'un mur (milieu, 15 cm devant chaque face) */
function cotesDuMur(W, pieces) {
  const m = { x: (W.A.x + W.B.x) / 2, y: (W.A.y + W.B.y) / 2 }, o = W.th / 2 + 15;
  return { 1: pieceEn(pieces, { x: m.x + W.n.x * o, y: m.y + W.n.y * o }), [-1]: pieceEn(pieces, { x: m.x - W.n.x * o, y: m.y - W.n.y * o }) };
}
/* déperditions d'un mur vues depuis le côté s (1 ou -1) : parois (mur net et ouvertures) */
function paroisMur(plan, W, s, ctx) {
  const L = (plan.levels || []).find((x) => x.id === W.w.lv) || {}, hm = isNum(W.w.h) ? W.w.h : isNum(L.h) ? L.h : 250;
  const cotes = cotesDuMur(W, ctx.pieces), ici = cotes[s], la = cotes[-s];
  const ti = tInt(ici && ici.label), te = ctx.te;
  /* autre côté */
  let autre, dT = null, b = d(1, 'saisie', 'Extérieur');
  if (!la) { autre = { n: 'Extérieur', ext: true }; if (te) dT = ti.v - te.v; }
  else if (!chauffee(la)) { autre = { n: (la.label ? la.label.name : 'Pièce') + ' (non chauffée)', ext: false }; b = d(COTES.non_chauffe.b, 'estimee', SRC_B); if (te) dT = ti.v - te.v; }
  else { const tj = tInt(la.label); autre = { n: la.label.name, ext: false, t: tj }; dT = ti.v - tj.v; b = d(1, 'saisie', 'Pièce voisine'); }
  const ops = (plan.openings || []).filter((o) => o.wall === W.w.id);
  const Aop = ops.reduce((t, o) => t + (uOuverture(o) ? surfOuverture(o, hm) : 0), 0);
  const Abrut = (W.L * hm) / 1e4, A = Math.max(0, Abrut - Aop);
  /* le mur est vu depuis le côté s : couches dans l'ordre de la pièce vers l'autre côté (le U ne dépend pas de l'ordre) */
  const U = uParoi(aCouches(W.w) ? W.w.couches : null, 'h', autre.ext ? 'ext' : 'int');
  const items = [{ quoi: W.w.kind === 'cloison' ? 'Cloison' : 'Mur', A, U, wall: W.w.id }];
  for (const o of ops) { const u = uOuverture(o); if (u) items.push({ quoi: o.kind === 'window' ? 'Fenêtre' : 'Porte', A: surfOuverture(o, hm), U: { u: u.v, st: u.st, src: u.src }, opening: o.id }); }
  return { ici, la, autre, ti, dT, b, items, env: !la || !chauffee(la) };
}
/* résultat d'une liste de parois : H (W/K) et Φ (W) */
function totaliser(items, dT, b) {
  let H = 0; const manque = [];
  for (const it of items) {
    if (it.U.u == null) { manque.push(`${it.quoi} : ${(it.U.manque || ['U manquant']).join(', ')}`); it.H = null; continue; }
    it.H = it.U.u * it.A * b.v; H += it.H;
    it.phi = dT != null ? it.H * dT : null;
  }
  return { H, phi: dT != null ? H * dT : null, manque };
}
/* déperditions d'une pièce */
function deperditionsPiece(plan, r, ctx) {
  ctx = Object.assign({ te: tExt(plan) }, ctx);
  const lbl = r.label, L = (plan.levels || []).find((x) => x.id === (lbl && lbl.lv)) || {}, te = ctx.te;
  const ti = tInt(lbl), hm = isNum(L.h) ? L.h : 250;
  const S = r.area / 1e4, V = S * hm / 100;
  const lignes = [], manque = [], estim = new Set();
  let Aenv = 0;
  const marque = (x) => { if (x && x.st === 'estimee') estim.add(x.src); };
  marque(ti);
  if (!te) manque.push('température extérieure de base');
  /* murs */
  for (const W of mursDe(plan, lbl.lv)) {
    const c = cotesDuMur(W, ctx.pieces);
    for (const s of [1, -1]) {
      if (c[s] !== r) continue;
      const pm = paroisMur(plan, W, s, ctx);
      if (pm.dT != null && pm.dT <= 0 && !pm.autre.ext) continue; // pièce voisine aussi chaude : pas de perte
      const t = totaliser(pm.items, pm.dT, pm.b);
      for (const it of pm.items) { marque(it.U); lignes.push({ quoi: it.quoi, vers: pm.autre.n, A: it.A, u: it.U.u, b: pm.b.v, dT: pm.dT, H: it.H, phi: it.phi, wall: W.w.id, opening: it.opening }); }
      marque(pm.b); manque.push(...t.manque);
      if (pm.env) Aenv += pm.items.reduce((x, it) => x + it.A, 0) * pm.b.v;
    }
  }
  /* plancher et plafond */
  const niveaux = (plan.levels || []).slice().sort((a, b) => a.elev - b.elev), i = niveaux.findIndex((x) => x.id === L.id);
  const pt = r.label ? { x: r.label.x, y: r.label.y } : r.loop[0];
  for (const k of ['sol', 'plafond']) {
    const voisin = k === 'sol' ? niveaux[i - 1] : niveaux[i + 1];
    const rv = voisin ? pieceEn(ctx.toutes && ctx.toutes.get(voisin.id), pt) : null;
    let vers, b, dT = te ? ti.v - te.v : null, cote = 'int';
    if (rv && chauffee(rv)) { const tj = tInt(rv.label); dT = ti.v - tj.v; if (dT <= 0) continue; vers = rv.label.name; b = d(1, 'saisie', 'Pièce voisine'); }
    else if (rv) { vers = rv.label.name + ' (non chauffée)'; b = d(COTES.non_chauffe.b, 'estimee', SRC_B); }
    else { const c = coteNiveau(plan, L, k); vers = c.n; b = c.b; cote = COTES[c.cle].sol ? 'sol' : COTES[c.cle].se ? 'ext' : 'int'; if (c.st === 'estimee') estim.add(`${k === 'sol' ? 'Dessous' : 'Dessus'} du niveau non précisé : ${c.n} supposé`); }
    const cp = compoNiveau(L, k);
    const U = uParoi(cp ? cp.couches : null, k === 'sol' ? 'down' : 'up', cote);
    const it = { quoi: k === 'sol' ? 'Plancher' : 'Plafond', A: S, U };
    const t = totaliser([it], dT, b);
    marque(U); marque(b);
    manque.push(...t.manque);
    lignes.push({ quoi: it.quoi, vers, A: S, u: U.u, b: b.v, dT, H: it.H, phi: it.phi });
    if (!rv || !chauffee(rv)) Aenv += S * b.v;
  }
  /* ponts thermiques et air */
  const pt_ = dupt(plan); marque(pt_);
  const Hpt = pt_.v * Aenv;
  const n = ach(lbl); marque(n);
  const Hv = 0.34 * n.v * V;
  const Ht = lignes.reduce((x, l) => x + (l.H || 0), 0);
  const dT = te ? ti.v - te.v : null;
  const phiT = te ? lignes.reduce((x, l) => x + (l.phi || 0), 0) : null;
  const phiPt = dT != null ? Hpt * dT : null, phiV = dT != null ? Hv * dT : null;
  const total = dT != null ? phiT + phiPt + phiV : null;
  return { piece: lbl, ti, te, dT, S, V, lignes, Ht, Hpt, Hv, H: Ht + Hpt + Hv, phiT, phiPt, phiV, total, parM2: total != null && S > 0 ? total / S : null,
    manque: [...new Set(manque)], estimees: [...estim], statut: manque.length ? 'partiel' : estim.size ? 'estimee' : 'saisie', dupt: pt_, ach: n };
}
/* chauffage posé dans la pièce (symboles de chauffage du niveau situés dans la pièce) */
const CHAUFFAGE = ['rad_elec', 'sortie_rad', 'seche_serv_e', 'plancher', 'soufflant_sdb'];
const DEFAUT_P = { rad_elec: 1500, seche_serv_e: 500, plancher: 1000, soufflant_sdb: 2000 };
function chauffagePose(plan, r) {
  const l = (plan.elec || []).filter((e) => e.lv === r.label.lv && CHAUFFAGE.includes(e.type) && dans(e, r));
  let p = 0, saisi = true;
  for (const e of l) { if (isNum(e.p)) p += e.p; else if (DEFAUT_P[e.type]) { p += DEFAUT_P[e.type]; saisi = false; } else saisi = false; }
  return { n: l.length, p, saisi };
}
/* bilan d'un niveau (ou du plan) */
function bilanThermique(plan, lv, ctx) {
  const pieces = (ctx.toutes.get(lv) || []).filter((r) => r.label && chauffee(r));
  const lignes = pieces.map((r) => Object.assign(deperditionsPiece(plan, r, Object.assign({}, ctx, { pieces: ctx.toutes.get(lv) })), { pose: chauffagePose(plan, r) }));
  const total = lignes.every((x) => x.total != null) ? lignes.reduce((t, x) => t + x.total, 0) : null;
  return { lignes, total, partiel: lignes.some((x) => x.statut === 'partiel') };
}
/* fiche thermique d'un mur : U et déperditions de chaque côté */
function ficheMur(plan, w, ctx) {
  ctx = Object.assign({ te: tExt(plan) }, ctx);
  const W = mursDe(plan, w.lv).find((x) => x.w.id === w.id); if (!W) return null;
  const c = cotesDuMur(W, ctx.pieces);
  const vues = [];
  for (const s of [1, -1]) {
    const r = c[s]; if (!r || !chauffee(r)) continue;
    const pm = paroisMur(plan, W, s, ctx);
    if (pm.dT != null && pm.dT <= 0 && !pm.autre.ext) { vues.push({ s, depuis: r.label.name, vers: pm.autre.n, nul: true }); continue; }
    const t = totaliser(pm.items, pm.dT, pm.b);
    vues.push({ s, depuis: r.label.name, ti: pm.ti, vers: pm.autre.n, dT: pm.dT, b: pm.b, items: pm.items, H: t.H, phi: t.phi, manque: t.manque });
  }
  const ext = !c[1] || !c[-1];
  return { U: uParoi(aCouches(w) ? w.couches : null, 'h', ext ? 'ext' : 'int'), ext, vues };
}

/* ---------------- nettoyage (migration v17) ---------------- */
function donnee(x, ok) {
  if (!x || typeof x !== 'object' || !isNum(x.v) || (ok && !ok(x.v))) return null;
  const st = ['saisie', 'estimee', 'verifiee'].includes(x.st) ? x.st : 'saisie', src = typeof x.src === 'string' ? x.src.slice(0, 200) : '';
  return src ? { v: x.v, st: st === 'verifiee' && !src ? 'saisie' : st, src } : { v: x.v, st: st === 'verifiee' ? 'saisie' : st };
}
function nettoyerV17(p, nettoyerCouches) {
  const i = p.install;
  if (i && typeof i === 'object') for (const [k, ok] of [['text', (v) => v >= -60 && v <= 40], ['dupt', (v) => v >= 0 && v <= 2]]) {
    if (!(k in i)) continue; const x = donnee(i[k], ok); if (x) i[k] = x; else delete i[k];
  }
  for (const r of Array.isArray(p.rooms) ? p.rooms : []) {
    if (!r || typeof r !== 'object') continue;
    if ('ti' in r && !(isNum(r.ti) && r.ti >= 0 && r.ti <= 40)) delete r.ti;
    if ('nc' in r && r.nc !== true) delete r.nc;
    if ('ach' in r && !(isNum(r.ach) && r.ach >= 0 && r.ach <= 50)) delete r.ach;
  }
  for (const L of Array.isArray(p.levels) ? p.levels : []) {
    if (!L || typeof L !== 'object') continue;
    if ('dessous' in L && !['terreplein', 'vide_sanitaire', 'non_chauffe', 'exterieur'].includes(L.dessous)) delete L.dessous;
    if ('dessus' in L && !['combles', 'non_chauffe', 'toiture'].includes(L.dessus)) delete L.dessus;
    for (const k of ['bsol', 'bplaf']) if (k in L && !(isNum(L[k]) && L[k] >= 0 && L[k] <= 1)) delete L[k];
    for (const k of ['sol', 'plafond']) if (L[k] && typeof L[k] === 'object') { const c = nettoyerCouches(L[k].couches); if (c) L[k].couches = c; else delete L[k]; }
  }
  for (const w of Array.isArray(p.walls) ? p.walls : []) if (w && 'couches' in w) { const c = nettoyerCouches(w.couches); if (c) w.couches = c; else { delete w.couches; delete w.cn; } }
  for (const o of Array.isArray(p.openings) ? p.openings : []) if (o && 'uw' in o && !(isNum(o.uw) && o.uw > 0 && o.uw <= 10)) delete o.uw;
  const gaines = (l) => { for (const g of Array.isArray(l) ? l : []) if (g && 'couche' in g && !(typeof g.couche === 'string' && MATERIAUX[g.couche] && (g.pose === 'sol' || g.pose === 'plafond'))) delete g.couche; };
  gaines(p.ducts);
  const v = p.variantes && Array.isArray(p.variantes.liste) ? p.variantes.liste : [];
  for (const x of v) if (x && x.data) gaines(x.data.ducts);
  return p;
}

export { COTES, DEF, LAMBDA, RS, SRC_RS, bilanThermique, chauffagePose, cotesDuMur, coteNiveau, deperditionsPiece, ficheMur, nettoyerV17, rCouche, tExt, tInt, uOuverture, uParoi };

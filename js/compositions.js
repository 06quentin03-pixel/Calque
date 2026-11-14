/* Calque — module « compositions » : composition des murs, des cloisons, des planchers (sol) et des plafonds,
   couche par couche (plaque de plâtre, laine de verre, parpaing, brique…), et logement des gaines électriques
   dans ces couches. JavaScript pur, sans accès à l'écran : testable avec Node.

   Données (format v16) :
     mur ou cloison  w.couches = [{ m, e, n? }]  du côté 1 (normale +n du mur) vers le côté 2 ; w.cn = nom de la composition
                     L'épaisseur du mur w.th vaut alors la somme des couches (tenue à jour par appliquerAuMur).
     niveau          L.sol = { couches, cn }      plancher du niveau, du dessus (revêtement) vers le dessous
                     L.plafond = { couches, cn }  plafond du niveau, du dessus (plénum, isolant) vers le dessous (parement)
   m : matériau de MATERIAUX (ou 'autre' avec son nom n) ; e : épaisseur en cm.

   Les épaisseurs proposées sont des dimensions nominales courantes du commerce, données comme aide à la saisie :
   ce ne sont ni des références de fabricant ni des valeurs réglementaires (à vérifier sur le matériel choisi).
   Le logement d'une gaine est un contrôle géométrique de Calque (épaisseur de la couche ≥ diamètre de la gaine) :
   il ne dit rien de la conformité à la norme. */
import { isNum } from './noyau.js';
import { isElecDuct, pointsGaine } from './cheminement.js';
import { ELEC_BY } from './symboles.js';

const ORIGINE = 'Épaisseur nominale courante du commerce, proposée par Calque (à vérifier sur le matériel choisi)';

/* passage : 'libre' = la gaine se loge dans la couche (isolant souple, vide technique, plénum) ;
   'noyee' = gaine noyée à la coulée (dalle, chape, dalle de compression) ; absent = saignée ou rainure nécessaire */
const MATERIAUX = {
  /* parements */
  plaque: { n: 'Plaque de plâtre (BA13…)', court: 'Plâtre', cat: 'parement', eps: [1, 1.25, 1.5, 1.8, 2.5], coul: '#ECE7DC', usage: ['mur', 'cloison', 'plafond'] },
  plaque_h: { n: 'Plaque de plâtre hydrofuge', court: 'Plâtre H', cat: 'parement', eps: [1.25, 1.5, 1.8], coul: '#CFE3D3', usage: ['mur', 'cloison', 'plafond'] },
  enduit_platre: { n: 'Enduit plâtre', court: 'Enduit', cat: 'parement', eps: [0.5, 1, 1.5], coul: '#F2EEE6', usage: ['mur', 'cloison', 'plafond'] },
  enduit_ext: { n: 'Enduit extérieur (mortier)', court: 'Enduit ext.', cat: 'parement', eps: [1, 1.5, 2], coul: '#D9CBB4', usage: ['mur'] },
  lambris: { n: 'Lambris ou bardage bois', court: 'Bois', cat: 'parement', eps: [1, 1.2, 1.5, 2.2], coul: '#C9A16E', usage: ['mur', 'cloison', 'plafond'] },
  /* isolants et vides */
  laine_verre: { n: 'Laine de verre', court: 'Laine de verre', cat: 'isolant', eps: [4.5, 6, 7.5, 10, 12, 14.5, 20, 30], passage: 'libre', coul: '#F1D46B', usage: ['mur', 'cloison', 'plafond', 'sol'] },
  laine_roche: { n: 'Laine de roche', court: 'Laine de roche', cat: 'isolant', eps: [4, 6, 8, 10, 12, 14, 20], passage: 'libre', coul: '#D8B98A', usage: ['mur', 'cloison', 'plafond', 'sol'] },
  fibre_bois: { n: 'Fibre de bois', court: 'Fibre de bois', cat: 'isolant', eps: [4, 6, 8, 10, 12, 14.5, 20], passage: 'libre', coul: '#B7915F', usage: ['mur', 'cloison', 'plafond'] },
  pse: { n: 'Polystyrène expansé (PSE)', court: 'PSE', cat: 'isolant', eps: [2, 4, 6, 8, 10, 12, 14, 16], coul: '#E4EBF2', usage: ['mur', 'sol', 'plafond'] },
  pu: { n: 'Polyuréthane (PU)', court: 'PU', cat: 'isolant', eps: [3, 4, 6, 8, 10, 12], coul: '#F3E2B8', usage: ['mur', 'sol', 'plafond'] },
  vide_tech: { n: 'Vide technique (ossature, fourrures)', court: 'Vide technique', cat: 'vide', eps: [2.7, 4.5, 4.8, 7, 9], passage: 'libre', coul: null, usage: ['mur', 'cloison'] },
  plenum: { n: 'Plénum (vide du faux plafond)', court: 'Plénum', cat: 'vide', eps: [5, 10, 15, 20, 30, 50], passage: 'libre', coul: null, usage: ['plafond'] },
  lame_air: { n: 'Lame d’air', court: 'Lame d’air', cat: 'vide', eps: [1, 2, 3, 4], coul: null, usage: ['mur'] },
  /* structures */
  parpaing: { n: 'Parpaing (bloc béton creux)', court: 'Parpaing', cat: 'structure', eps: [5, 7.5, 10, 15, 20, 25, 27.5], coul: '#9DA2A6', usage: ['mur', 'cloison'] },
  brique: { n: 'Brique creuse (terre cuite)', court: 'Brique', cat: 'structure', eps: [5, 7.5, 10, 15, 20, 25, 30, 37.5], coul: '#C97B5A', usage: ['mur', 'cloison'] },
  brique_platriere: { n: 'Brique plâtrière', court: 'Brique plâtrière', cat: 'structure', eps: [3.5, 5, 7, 10], coul: '#D4957A', usage: ['cloison'] },
  brique_pleine: { n: 'Brique pleine', court: 'Brique pleine', cat: 'structure', eps: [5.5, 11, 22], coul: '#B5603F', usage: ['mur', 'cloison'] },
  beton: { n: 'Béton banché (voile)', court: 'Béton', cat: 'structure', eps: [15, 16, 18, 20, 25], coul: '#8E959B', usage: ['mur'] },
  beton_cell: { n: 'Béton cellulaire', court: 'Béton cellulaire', cat: 'structure', eps: [5, 7, 10, 15, 20, 25, 30, 36.5], coul: '#D7DADC', usage: ['mur', 'cloison'] },
  carreau_platre: { n: 'Carreau de plâtre', court: 'Carreau de plâtre', cat: 'structure', eps: [5, 7, 10], coul: '#E5E0D6', usage: ['cloison'] },
  pierre: { n: 'Pierre', court: 'Pierre', cat: 'structure', eps: [20, 30, 40, 50, 60], coul: '#A79C8B', usage: ['mur'] },
  ossature_bois: { n: 'Ossature bois (montants)', court: 'Ossature bois', cat: 'structure', eps: [4.5, 9, 12, 14.5, 20], passage: 'libre', coul: '#C59A63', usage: ['mur', 'cloison'] },
  /* planchers */
  carrelage: { n: 'Carrelage (avec colle)', court: 'Carrelage', cat: 'revetement', eps: [1, 1.5, 2], coul: '#D9D2C5', usage: ['sol'] },
  parquet: { n: 'Parquet ou sol souple', court: 'Parquet', cat: 'revetement', eps: [0.5, 1, 1.4, 2.2], coul: '#C9A16E', usage: ['sol'] },
  chape: { n: 'Chape (mortier)', court: 'Chape', cat: 'chape', eps: [4, 5, 6, 7], passage: 'noyee', coul: '#BDB6AA', usage: ['sol'] },
  chape_fluide: { n: 'Chape fluide (anhydrite)', court: 'Chape fluide', cat: 'chape', eps: [3, 4, 5, 6], passage: 'noyee', coul: '#CDC6B5', usage: ['sol'] },
  ravoirage: { n: 'Ravoirage (couche de passage des gaines)', court: 'Ravoirage', cat: 'chape', eps: [3, 4, 5, 6, 8], passage: 'noyee', coul: '#B0A796', usage: ['sol'] },
  dalle: { n: 'Dalle béton armé', court: 'Dalle', cat: 'structure', eps: [10, 12, 15, 18, 20, 25], passage: 'noyee', coul: '#8E959B', usage: ['sol'] },
  compression: { n: 'Dalle de compression', court: 'Compression', cat: 'structure', eps: [4, 5, 6], passage: 'noyee', coul: '#8E959B', usage: ['sol'] },
  hourdis: { n: 'Poutrelles et hourdis', court: 'Hourdis', cat: 'structure', eps: [12, 16, 20, 25], coul: '#A9AEB2', usage: ['sol'] },
  plancher_bois: { n: 'Plancher bois (solives et panneau)', court: 'Plancher bois', cat: 'structure', eps: [2.2, 15, 20, 22], coul: '#C59A63', usage: ['sol', 'plafond'] },
  autre: { n: 'Autre matériau', court: 'Autre', cat: 'structure', eps: [], coul: '#B9B4AA', usage: ['mur', 'cloison', 'sol', 'plafond'] },
};
const CATS = { parement: 'Parement', isolant: 'Isolant', vide: 'Vide', structure: 'Structure', revetement: 'Revêtement', chape: 'Chape' };

const c_ = (m, e) => ({ m, e });
/* compositions types : couches du côté de la pièce (intérieur) vers l'extérieur pour un mur ; du dessus vers le dessous
   pour un sol ou un plafond. Épaisseurs nominales courantes (ORIGINE) : à adapter au projet. */
const COMPOSITIONS = [
  { id: 'cl72', usage: 'cloison', n: 'Cloison 72/48 (plaque + laine de verre + plaque)', couches: [c_('plaque', 1.25), c_('laine_verre', 4.8), c_('plaque', 1.25)] },
  { id: 'cl98', usage: 'cloison', n: 'Cloison 98/48 (deux plaques de chaque côté)', couches: [c_('plaque', 1.25), c_('plaque', 1.25), c_('laine_verre', 4.8), c_('plaque', 1.25), c_('plaque', 1.25)] },
  { id: 'cl95', usage: 'cloison', n: 'Cloison 95/70 (rails de 70)', couches: [c_('plaque', 1.25), c_('laine_verre', 7), c_('plaque', 1.25)] },
  { id: 'clbp5', usage: 'cloison', n: 'Brique plâtrière de 5 enduite', couches: [c_('enduit_platre', 1), c_('brique_platriere', 5), c_('enduit_platre', 1)] },
  { id: 'clb10', usage: 'cloison', n: 'Brique de 10 enduite', couches: [c_('enduit_platre', 1), c_('brique', 10), c_('enduit_platre', 1)] },
  { id: 'clcp7', usage: 'cloison', n: 'Carreau de plâtre de 7', couches: [c_('carreau_platre', 7)] },
  { id: 'clp10', usage: 'cloison', n: 'Parpaing de 10 enduit', couches: [c_('enduit_platre', 1), c_('parpaing', 10), c_('enduit_platre', 1)] },
  { id: 'mp20o', usage: 'mur', n: 'Parpaing de 20 + doublage sur ossature (laine de verre 10)', couches: [c_('plaque', 1.25), c_('vide_tech', 4.5), c_('laine_verre', 10), c_('parpaing', 20), c_('enduit_ext', 1.5)] },
  { id: 'mp20c', usage: 'mur', n: 'Parpaing de 20 + doublage collé (PSE 10 + plaque)', couches: [c_('plaque', 1), c_('pse', 10), c_('parpaing', 20), c_('enduit_ext', 1.5)] },
  { id: 'mp15o', usage: 'mur', n: 'Parpaing de 15 + doublage sur ossature (laine de verre 10)', couches: [c_('plaque', 1.25), c_('vide_tech', 4.5), c_('laine_verre', 10), c_('parpaing', 15), c_('enduit_ext', 1.5)] },
  { id: 'mb20o', usage: 'mur', n: 'Brique de 20 + doublage sur ossature (laine de verre 10)', couches: [c_('plaque', 1.25), c_('vide_tech', 4.5), c_('laine_verre', 10), c_('brique', 20), c_('enduit_ext', 1.5)] },
  { id: 'mb30', usage: 'mur', n: 'Brique de 30 (sans doublage) enduite', couches: [c_('enduit_platre', 1), c_('brique', 30), c_('enduit_ext', 1.5)] },
  { id: 'mbc30', usage: 'mur', n: 'Béton cellulaire de 30 enduit', couches: [c_('enduit_platre', 1), c_('beton_cell', 30), c_('enduit_ext', 1.5)] },
  { id: 'mbe18', usage: 'mur', n: 'Béton banché de 18 + doublage collé (PSE 10 + plaque)', couches: [c_('plaque', 1), c_('pse', 10), c_('beton', 18)] },
  { id: 'mob', usage: 'mur', n: 'Ossature bois (montants 14,5 garnis de laine)', couches: [c_('plaque', 1.25), c_('vide_tech', 4.5), c_('laine_verre', 14.5), c_('lambris', 2.2)] },
  { id: 'mpint', usage: 'mur', n: 'Refend en parpaing de 20 enduit', couches: [c_('enduit_platre', 1), c_('parpaing', 20), c_('enduit_platre', 1)] },
  { id: 'sdal', usage: 'sol', n: 'Dalle sur terre-plein isolée (carrelage, chape, PU, dalle)', couches: [c_('carrelage', 1), c_('chape', 5), c_('pu', 6), c_('dalle', 12)] },
  { id: 'shour', usage: 'sol', n: 'Poutrelles et hourdis (carrelage, chape, ravoirage, compression)', couches: [c_('carrelage', 1), c_('chape', 5), c_('ravoirage', 4), c_('compression', 4), c_('hourdis', 16)] },
  { id: 'sbois', usage: 'sol', n: 'Plancher bois (parquet sur solives)', couches: [c_('parquet', 1.4), c_('plancher_bois', 2.2), c_('laine_verre', 10), c_('plancher_bois', 15)] },
  { id: 'pfp', usage: 'plafond', n: 'Faux plafond plaque sur fourrures (plénum 10)', couches: [c_('plenum', 10), c_('plaque', 1.25)] },
  { id: 'pfpl', usage: 'plafond', n: 'Faux plafond avec laine de verre (plénum 10, laine 10, plaque)', couches: [c_('plenum', 10), c_('laine_verre', 10), c_('plaque', 1.25)] },
  { id: 'pcomb', usage: 'plafond', n: 'Plafond sous combles (laine de verre 30 sur plaque)', couches: [c_('laine_verre', 30), c_('vide_tech', 2.7), c_('plaque', 1.25)] },
  { id: 'pdal', usage: 'plafond', n: 'Plafond enduit sous dalle', couches: [c_('enduit_platre', 1)] },
];
const COMPO_BY = new Map(COMPOSITIONS.map((c) => [c.id, c]));

/* ---------------- lecture ---------------- */
const r2 = (v) => Math.round(v * 100) / 100;
const matDe = (c) => MATERIAUX[c && c.m] || MATERIAUX.autre;
const nomCouche = (c) => (c && c.m === 'autre' && c.n ? c.n : matDe(c).n);
const courtCouche = (c) => (c && c.m === 'autre' && c.n ? c.n : matDe(c).court);
function epaisseur(couches) { return Array.isArray(couches) ? r2(couches.reduce((s, c) => s + (isNum(c.e) ? c.e : 0), 0)) : 0; }
const aCouches = (o) => !!(o && Array.isArray(o.couches) && o.couches.length);
const clone = (couches) => couches.map((c) => Object.assign({ m: c.m, e: c.e }, c.m === 'autre' && c.n ? { n: c.n } : {}, isNum(c.l) ? { l: c.l } : isNum(c.r) ? { r: c.r } : {}));
/* composition d'un niveau : 'sol' (plancher) ou 'plafond' */
const compoNiveau = (L, k) => (L && L[k] && aCouches(L[k]) ? L[k] : null);

/* bandes d'un mur : pour chaque couche, décalages par rapport à l'axe (o1 côté 1, o0 vers le côté 2), en cm */
function bandes(w) {
  if (!aCouches(w)) return [];
  const th = isNum(w.th) && w.th > 0 ? w.th : epaisseur(w.couches);
  const k = th / (epaisseur(w.couches) || th); // si l'épaisseur saisie diffère, les couches sont mises à l'échelle
  let o = th / 2; const out = [];
  w.couches.forEach((c, i) => { const e = c.e * k; out.push({ i, c, o1: o, o0: o - e, e: c.e }); o -= e; });
  return out;
}
/* couche traversée à un décalage v de l'axe (côté 1 positif) */
function coucheA(w, v) { const B = bandes(w); return B.find((b) => v <= b.o1 + 1e-6 && v >= b.o0 - 1e-6) || null; }
/* couches où une gaine peut passer, avec le plus grand diamètre logé (mm) */
function couchesPassage(couches) {
  return (couches || []).map((c, i) => ({ i, c, passage: matDe(c).passage || null, dmax: Math.floor(c.e * 10 + 1e-6) })).filter((x) => x.passage);
}
function resumePassage(couches) {
  const l = couchesPassage(couches);
  if (!aCouches({ couches })) return null;
  if (!l.length) return { ok: false, txt: 'Aucune couche de passage : une saignée (ou une rainure) est nécessaire pour encastrer une gaine.' };
  return { ok: true, txt: l.map((x) => `${courtCouche(x.c)} ${fmt(x.c.e)} cm (${x.passage === 'noyee' ? 'gaine noyée à la coulée' : 'gaine jusqu’à Ø' + x.dmax})`).join(' · ') };
}
const fmt = (v) => String(r2(v)).replace('.', ',');

/* ---------------- logement des gaines ---------------- */
function diametreGaine(d) { return isNum(d.dia) ? d.dia : isNum(d.lh) ? d.lh : null; }
function mursDuNiveau(plan, lv) {
  const nodes = new Map((plan.nodes || []).map((n) => [n.id, n])), out = [];
  for (const w of plan.walls || []) {
    if (w.lv !== lv) continue;
    const A = nodes.get(w.a), B = nodes.get(w.b); if (!A || !B) continue;
    const L = Math.hypot(B.x - A.x, B.y - A.y); if (L < 1) continue;
    const d = { x: (B.x - A.x) / L, y: (B.y - A.y) / L };
    out.push({ w, A, B, L, d, n: { x: -d.y, y: d.x }, th: isNum(w.th) && w.th > 0 ? w.th : 20 });
  }
  return out;
}
const local = (W, p) => ({ u: (p.x - W.A.x) * W.d.x + (p.y - W.A.y) * W.d.y, v: (p.x - W.A.x) * W.n.x + (p.y - W.A.y) * W.n.y });
/* mur dans l'épaisseur duquel passe le tronçon [p, q] (parallèle à son axe), ou null */
function murDuTroncon(M, p, q) {
  const L = Math.hypot(q.x - p.x, q.y - p.y); if (L < 5) return null;
  const m = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 };
  let best = null;
  for (const W of M) {
    const par = Math.abs(((q.x - p.x) * W.d.y - (q.y - p.y) * W.d.x) / L); if (par > 0.05) continue;
    const a = local(W, m); if (a.u < -W.th / 2 || a.u > W.L + W.th / 2 || Math.abs(a.v) > W.th / 2 + 0.5) continue;
    if (!best || Math.abs(a.v) < Math.abs(best.v)) best = { W, v: a.v };
  }
  return best;
}
/* statut d'une gaine dans une composition : { statut, msg, couche }
   'ok' (place suffisante), 'insuffisant' (couche de passage trop fine), 'noyee', 'saignee', 'inconnu' (non renseignée) */
function statutDans(couche, dia, quoi) {
  if (!couche) return { statut: 'inconnu', msg: `Composition ${quoi} non renseignée : logement de la gaine non vérifié.` };
  const m = matDe(couche.c || couche), nom = courtCouche(couche.c || couche), e = (couche.c || couche).e;
  const D = dia != null ? `Ø${dia}` : 'de diamètre inconnu';
  if (m.passage === 'noyee') return { statut: 'noyee', msg: `Gaine ${D} noyée dans « ${nom} » (${fmt(e)} cm) : enrobage à vérifier à la coulée.` };
  if (m.passage === 'libre') {
    if (dia == null || dia <= e * 10 + 1e-6) return { statut: 'ok', msg: `Gaine ${D} logée dans « ${nom} » (${fmt(e)} cm) : place suffisante (contrôle géométrique de Calque).` };
    return { statut: 'insuffisant', msg: `Gaine ${D} dans « ${nom} » de ${fmt(e)} cm : épaisseur insuffisante (${Math.floor(e * 10)} mm).` };
  }
  return { statut: 'saignee', msg: `Gaine ${D} dans « ${nom} » : saignée ou rainure à prévoir (pas de couche de passage à cet endroit).` };
}
/* logement d'une gaine électrique selon sa pose : liste de { statut, msg, wall? } (vide si la pose ne s'y prête pas) */
function logementGaine(plan, d) {
  if (!isElecDuct(d)) return [];
  const dia = diametreGaine(d), L = (plan.levels || []).find((l) => l.id === d.lv) || null;
  if (d.pose === 'sol' || d.pose === 'plafond') {
    const k = d.pose === 'sol' ? 'sol' : 'plafond', cp = compoNiveau(L, k);
    const quoi = d.pose === 'sol' ? 'du plancher' : 'du plafond';
    if (!cp) return [statutDans(null, dia, quoi)];
    const P = couchesPassage(cp.couches);
    /* couche choisie sur la gaine (d.couche, format v17), sinon la plus favorable : logée d'abord, puis noyée */
    const choisie = d.couche ? P.find((x) => x.c.m === d.couche) : null;
    const best = choisie || P.find((x) => x.passage === 'libre' && (dia == null || dia <= x.dmax)) || P.find((x) => x.passage === 'noyee') || P[0];
    return [best ? statutDans(best, dia, quoi) : statutDans({ c: cp.couches[0] }, dia, quoi)].map((s) => Object.assign(s, { niveau: k }));
  }
  if (d.pose !== 'cloison') return [];
  const M = mursDuNiveau(plan, d.lv), pts = pointsGaine(plan, d), vus = new Map();
  for (let i = 1; i < pts.length; i++) {
    const t = murDuTroncon(M, pts[i - 1], pts[i]); if (!t) continue;
    const ici = local(t.W, { x: (pts[i - 1].x + pts[i].x) / 2, y: (pts[i - 1].y + pts[i].y) / 2 });
    const s = aCouches(t.W.w) ? statutDans(coucheA(t.W.w, ici.v), dia, '') : statutDans(null, dia, t.W.w.kind === 'cloison' ? 'de la cloison' : 'du mur');
    const cle = t.W.w.id + '|' + s.statut + '|' + s.msg;
    if (!vus.has(cle)) vus.set(cle, Object.assign(s, { wall: t.W.w.id, seg: i - 1 }));
  }
  return [...vus.values()];
}
/* décalage (par rapport à l'axe) du milieu de la meilleure couche de passage d'un mur pour une gaine, ou null */
function decalagePassage(w, dia, v) {
  const B = bandes(w).filter((b) => matDe(b.c).passage === 'libre');
  if (!B.length) return null;
  const ok = B.filter((b) => dia == null || dia <= b.e * 10 + 1e-6), l = ok.length ? ok : B;
  l.sort((a, b) => Math.abs((a.o0 + a.o1) / 2 - v) - Math.abs((b.o0 + b.o1) / 2 - v));
  return (l[0].o0 + l[0].o1) / 2;
}
/* déplace les points d'une gaine « dans la cloison » dans la couche de passage de chaque mur suivi.
   Modifie d.pts (les extrémités raccordées à un symbole restent recollées au symbole). Renvoie le nombre de tronçons placés. */
function placerDansCouche(plan, d) {
  if (!isElecDuct(d) || d.pose !== 'cloison' || !Array.isArray(d.pts)) return 0;
  const M = mursDuNiveau(plan, d.lv), pts = pointsGaine(plan, d), dia = diametreGaine(d);
  const lignes = pts.map(() => []); let n = 0;
  for (let i = 1; i < pts.length; i++) {
    const t = murDuTroncon(M, pts[i - 1], pts[i]); if (!t) continue;
    const vt = decalagePassage(t.W.w, dia, t.v); if (vt == null) continue;
    /* droite décalée : point de l'axe + n * vt, direction de l'axe */
    const Ln = { o: { x: t.W.A.x + t.W.n.x * vt, y: t.W.A.y + t.W.n.y * vt }, d: t.W.d, n: t.W.n };
    lignes[i - 1].push(Ln); lignes[i].push(Ln); n++;
  }
  const fixe = (i) => (i === 0 && d.a) || (i === pts.length - 1 && d.b);
  for (let i = 0; i < pts.length; i++) {
    const l = lignes[i]; if (!l.length || fixe(i)) continue;
    const p = d.pts[i];
    let q;
    const croise = l.length > 1 && Math.abs(l[0].d.x * l[1].d.y - l[0].d.y * l[1].d.x) > 0.05;
    if (croise) { // angle entre deux murs : intersection des deux droites décalées
      const a = l[0], b = l[1], den = a.d.x * b.d.y - a.d.y * b.d.x;
      const s = ((b.o.x - a.o.x) * b.d.y - (b.o.y - a.o.y) * b.d.x) / den;
      q = { x: a.o.x + a.d.x * s, y: a.o.y + a.d.y * s };
    } else { const a = l[0], v = (p.x - a.o.x) * a.n.x + (p.y - a.o.y) * a.n.y; q = { x: p.x - a.n.x * v, y: p.y - a.n.y * v }; }
    p.x = Math.round(q.x * 10) / 10; p.y = Math.round(q.y * 10) / 10;
  }
  return n;
}

/* ---------------- modification ---------------- */
function appliquerAuMur(w, couches, nom) {
  if (!couches || !couches.length) { delete w.couches; delete w.cn; return w; }
  w.couches = clone(couches); w.th = epaisseur(w.couches);
  if (nom) w.cn = String(nom).slice(0, 80); else delete w.cn;
  return w;
}
function appliquerAuNiveau(L, k, couches, nom) {
  if (!couches || !couches.length) { delete L[k]; return L; }
  L[k] = Object.assign({ couches: clone(couches) }, nom ? { cn: String(nom).slice(0, 80) } : {});
  if (k === 'sol') L.slab = epaisseur(L[k].couches);
  return L;
}
/* composition type, couches du côté 1 vers le côté 2 : inversée si la pièce est du côté 2 (exterieurCote1) */
function couchesOrientees(compo, exterieurCote1) { const l = clone(compo.couches); return exterieurCote1 ? l.reverse() : l; }

/* ---------------- épaisseur d'un mur, élargi dans un sens choisi ----------------
   sens : 'centre' (les deux faces bougent), 'c1' (la face du côté 2 reste en place, le mur grandit vers le côté 1),
   'c2' (la face du côté 1 reste en place). Le mur entier est traité : tronçons alignés et reliés de même épaisseur et de
   même composition. Ses angles sont déplacés : les murs adjacents s'allongent ou raccourcissent pour suivre ; les
   ouvertures de ces murs gardent leur place ; les appareils muraux posés sur une face qui bouge la suivent.
   couches (facultatif) : nouvelle composition (null = la retirer, undefined = inchangée). Renvoie les murs modifiés. */
function changerEpaisseur(plan, w, th, sens, couches, nom) {
  const nodes = new Map((plan.nodes || []).map((n) => [n.id, n]));
  const A = nodes.get(w.a), B = nodes.get(w.b); if (!A || !B) return [];
  const L = Math.hypot(B.x - A.x, B.y - A.y); if (L < 0.5) return [];
  const d = { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, n = { x: -d.y, y: d.x };
  const cle = (x) => JSON.stringify(x.couches || null);
  const dirDe = (x) => { const a = nodes.get(x.a), b = nodes.get(x.b); if (!a || !b) return null; const l = Math.hypot(b.x - a.x, b.y - a.y); return l < 0.5 ? null : { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
  const aligne = (x) => { const e = dirDe(x); if (!e || Math.abs(e.x * d.y - e.y * d.x) > 0.01) return false; const a = nodes.get(x.a); return Math.abs((a.x - A.x) * n.x + (a.y - A.y) * n.y) < 0.5; };
  /* tronçons du même mur (alignés, reliés, même épaisseur, même composition) */
  const lv = (plan.walls || []).filter((x) => x.lv === w.lv);
  const chaine = new Set([w]); let pile = [w];
  while (pile.length) {
    const x = pile.pop();
    for (const y of lv) if (!chaine.has(y) && (y.a === x.a || y.a === x.b || y.b === x.a || y.b === x.b) && Math.abs((y.th || 0) - (w.th || 0)) < 0.01 && cle(y) === cle(w) && y.kind === w.kind && aligne(y)) { chaine.add(y); pile.push(y); }
  }
  const ancien = w.th || 10;
  const futur = couches === undefined ? th : couches ? epaisseur(couches) : th;
  const D = futur - ancien;
  const dec = sens === 'c1' ? D / 2 : sens === 'c2' ? -D / 2 : 0; // déplacement de l'axe le long de +n
  const f1 = sens === 'c1' ? D : sens === 'c2' ? 0 : D / 2, f2 = sens === 'c2' ? D : sens === 'c1' ? 0 : D / 2; // déplacement des faces vers l'extérieur du mur
  /* appareils muraux sur une face qui bouge (avant de déplacer les angles) */
  const muraux = [];
  if (f1 || f2) for (const x of chaine) {
    const a = nodes.get(x.a), b = nodes.get(x.b), e = dirDe(x); if (!e) continue;
    const m = { x: -e.y, y: e.x }, sg = m.x * n.x + m.y * n.y > 0 ? 1 : -1, l = Math.hypot(b.x - a.x, b.y - a.y);
    for (const el of plan.elec || []) {
      if (el.lv !== w.lv || muraux.includes(el)) continue;
      const def = ELEC_BY.get(el.type); if (!def || !def.wall) continue;
      const u = (el.x - a.x) * e.x + (el.y - a.y) * e.y, v = ((el.x - a.x) * m.x + (el.y - a.y) * m.y) * sg; // v > 0 : côté 1 du mur w
      if (u < -1 || u > l + 1 || Math.abs(v) < ancien / 2 - 3 || Math.abs(v) > ancien / 2 + 6) continue;
      const k = v > 0 ? f1 : -f2;
      if (k) { el.x = Math.round((el.x + n.x * k) * 10) / 10; el.y = Math.round((el.y + n.y * k) * 10) / 10; muraux.push(el); }
    }
  }
  if (dec) {
    const ids = new Set(); for (const x of chaine) { ids.add(x.a); ids.add(x.b); }
    const mv = { x: n.x * dec, y: n.y * dec };
    /* ouvertures des murs voisins dont le départ (angle a) bouge : gardent leur place */
    const ch = new Set(chaine);
    for (const x of lv) {
      if (ch.has(x) || !ids.has(x.a)) continue;
      const e = dirDe(x); if (!e) continue;
      const s = mv.x * e.x + mv.y * e.y;
      for (const o of plan.openings || []) if (o.wall === x.id && isNum(o.t)) o.t = Math.round((o.t - s) * 10) / 10;
    }
    for (const id of ids) { const p = nodes.get(id); p.x = Math.round((p.x + mv.x) * 10) / 10; p.y = Math.round((p.y + mv.y) * 10) / 10; }
  }
  for (const x of chaine) {
    if (couches !== undefined) appliquerAuMur(x, couches, nom);
    if (!couches) x.th = Math.round(futur * 100) / 100;
  }
  return [...chaine];
}

/* ---------------- quantités (estimation) ---------------- */
/* surfaces par matériau d'un niveau, en m² : murs (longueur d'axe × hauteur, ouvertures déduites) ; plancher et plafond
   (surface des pièces, fournie par l'appelant). Estimation de Calque : jonctions et retours non comptés. */
function surfacesMateriaux(plan, lv, airePieces) {
  const L = (plan.levels || []).find((l) => l.id === lv) || {}, out = new Map();
  const add = (c, m2, ou) => { const k = (c.m === 'autre' && c.n ? 'autre:' + c.n : c.m) + '|' + fmt(c.e); const o = out.get(k) || { m: c.m, n: nomCouche(c), e: c.e, m2: 0, ou: new Set() }; o.m2 += m2; o.ou.add(ou); out.set(k, o); };
  const ops = new Map(); for (const o of plan.openings || []) { const l = ops.get(o.wall) || []; l.push(o); ops.set(o.wall, l); }
  for (const W of mursDuNiveau(plan, lv)) {
    if (!aCouches(W.w)) continue;
    const hm = isNum(W.w.h) ? W.w.h : isNum(L.h) ? L.h : 250;
    let s = W.L * hm;
    for (const o of ops.get(W.w.id) || []) s -= (isNum(o.w) ? o.w : 0) * (o.full ? hm : Math.min(hm, isNum(o.h) ? o.h : o.kind === 'window' ? 125 : 215));
    for (const c of W.w.couches) add(c, Math.max(0, s) / 1e4, W.w.kind === 'cloison' ? 'cloisons' : 'murs');
  }
  if (isNum(airePieces) && airePieces > 0) for (const k of ['sol', 'plafond']) { const cp = compoNiveau(L, k); if (cp) for (const c of cp.couches) add(c, airePieces, k === 'sol' ? 'plancher' : 'plafond'); }
  return [...out.values()].map((o) => Object.assign(o, { m2: Math.round(o.m2 * 10) / 10, ou: [...o.ou].join(', ') })).sort((a, b) => b.m2 - a.m2);
}

/* ---------------- nettoyage (migration, import) ---------------- */
function nettoyerCouches(a) {
  if (!Array.isArray(a)) return null;
  const l = [];
  for (const c of a.slice(0, 16)) {
    if (!c || typeof c !== 'object' || !MATERIAUX[c.m] || !(isNum(c.e) && c.e >= 0.1 && c.e <= 200)) continue;
    const o = { m: c.m, e: r2(c.e) };
    if (c.m === 'autre' && typeof c.n === 'string' && c.n.trim()) o.n = c.n.trim().slice(0, 60);
    /* v17 : conductivité λ (W/m·K) ou résistance R (m²·K/W) saisies (fiche du fabricant) */
    if (isNum(c.l) && c.l > 0.001 && c.l <= 400) o.l = c.l;
    else if (isNum(c.r) && c.r > 0 && c.r <= 50) o.r = c.r;
    l.push(o);
  }
  return l.length ? l : null;
}
function nettoyerMurV16(w) {
  if (!w || typeof w !== 'object') return w;
  if ('couches' in w) { const l = nettoyerCouches(w.couches); if (l) { w.couches = l; w.th = epaisseur(l); } else delete w.couches; }
  if ('cn' in w && !(typeof w.cn === 'string' && w.cn.trim() && w.couches)) delete w.cn;
  return w;
}
function nettoyerNiveauV16(L) {
  if (!L || typeof L !== 'object') return L;
  for (const k of ['sol', 'plafond']) {
    if (!(k in L)) continue;
    const o = L[k], l = o && typeof o === 'object' ? nettoyerCouches(o.couches) : null;
    if (!l) { delete L[k]; continue; }
    L[k] = Object.assign({ couches: l }, typeof o.cn === 'string' && o.cn.trim() ? { cn: o.cn.trim().slice(0, 80) } : {});
  }
  return L;
}
function nettoyerV16(p) {
  for (const w of Array.isArray(p.walls) ? p.walls : []) nettoyerMurV16(w);
  for (const L of Array.isArray(p.levels) ? p.levels : []) nettoyerNiveauV16(L);
  return p;
}

export { changerEpaisseur };
export { CATS, COMPOSITIONS, COMPO_BY, MATERIAUX, ORIGINE, aCouches, appliquerAuMur, appliquerAuNiveau, bandes, clone as copierCouches, compoNiveau,
  coucheA, couchesOrientees, couchesPassage, courtCouche, decalagePassage, epaisseur, logementGaine, matDe, nettoyerCouches, nettoyerMurV16,
  nettoyerNiveauV16, nettoyerV16, nomCouche, placerDansCouche, resumePassage, statutDans, surfacesMateriaux };

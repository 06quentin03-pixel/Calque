/* Calque — module « cheminement » : cheminements des câbles (gaines ICTA, tubes IRL, goulottes, chemins de câbles),
   verticales, passages entre étages, longueurs. JavaScript pur, sans accès à l'écran : testable avec Node.
   Toutes les fonctions reçoivent le plan en paramètre et ne le modifient jamais.
   Unités : centimètres dans le plan (Y vers le bas), mètres dans les résultats destinés au calcul. */
import { isNum } from './noyau.js';
import { itemToWorld } from './mutations.js';
import { ELEC_BY, S_ELEC } from './symboles.js';

/* ---------------- types de cheminements ----------------
   Données de Calque (dimensions usuelles proposées au choix) : aucune référence fabricant, aucune valeur de la norme. */
const TYPES_CHEMIN = {
  icta: { n: 'Gaine ICTA', court: 'ICTA', forme: 'rond', dias: [16, 20, 25, 32, 40], note: 'Gaine annelée souple, encastrée dans les cloisons, les dalles ou les faux plafonds.' },
  irl: { n: 'Tube IRL', court: 'IRL', forme: 'rond', dias: [16, 20, 25, 32, 40, 50], note: 'Tube rigide lisse, posé en apparent (garage, cave, local technique).' },
  goulotte: { n: 'Goulotte', court: 'Goulotte', forme: 'rect', note: 'Moulure ou goulotte fixée au mur, en apparent. Indiquez sa largeur et sa hauteur.' },
  cdc: { n: 'Chemin de câbles', court: 'Chemin de câbles', forme: 'rect', note: 'Dalle ou fil de câbles, pour regrouper plusieurs circuits (faux plafond, sous-sol, tertiaire).' },
};
const KINDS = Object.keys(TYPES_CHEMIN);
/* hauteur du parcours horizontal d'une gaine */
const POSES = {
  sol: { n: 'Dans le sol', court: 'Sol', note: 'Dans la dalle ou le plancher : la gaine remonte jusqu’à chaque appareil.' },
  plafond: { n: 'Au plafond', court: 'Plafond', note: 'Dans le faux plafond ou les combles : la gaine redescend jusqu’à chaque appareil.' },
  hauteur: { n: 'À une hauteur donnée', court: 'Hauteur', note: 'En apparent ou en plinthe, à la hauteur indiquée au-dessus du sol fini.' },
};
const POSE_IDS = Object.keys(POSES);
const RESERVE_DEFAUT = { v: 10, st: 'estimee', src: 'Valeur par défaut de Calque : chutes, raccordements et lovage dans les boîtes' };
/* symboles « passage » : le câble les traverse sans s'y raccorder (pas de hauteur propre) */
const TRAVERSEE = 'traversee';

/* ---------------- lecture d'une gaine ---------------- */
const isElecDuct = (d) => !!d && d.sys === 'elec';
const kindOf = (d) => (d && KINDS.includes(d.kind) ? d.kind : null);
function typeChemin(d) { const k = kindOf(d); return k ? TYPES_CHEMIN[k] : null; }
function nomChemin(d) {
  if (!d) return '';
  if (d.sys === 'vmc') return 'Conduit de VMC';
  const t = typeChemin(d);
  return t ? t.n : 'Gaine électrique (type non précisé)';
}
/* dimension lisible : « Ø20 » ou « 60 × 40 mm » */
function tailleChemin(d) {
  const t = typeChemin(d);
  if (t && t.forme === 'rect') return isNum(d.lw) && isNum(d.lh) ? `${d.lw} × ${d.lh} mm` : 'dimensions à indiquer';
  return isNum(d.dia) ? 'Ø' + d.dia : '';
}
/* section intérieure utile nominale en mm² (rond : π d²/4 sur le diamètre nominal ; rectangle : l × h) ou null */
function sectionNominale(d) {
  const t = typeChemin(d);
  if (t && t.forme === 'rect') return isNum(d.lw) && isNum(d.lh) && d.lw > 0 && d.lh > 0 ? d.lw * d.lh : null;
  return isNum(d.dia) && d.dia > 0 ? (Math.PI * d.dia * d.dia) / 4 : null;
}
/* circuits portés par une gaine : le circuit principal (couleur) puis les autres */
function circuitsDe(d) {
  const out = [];
  if (d && d.cid) out.push(d.cid);
  if (d && Array.isArray(d.cids)) for (const c of d.cids) if (c && !out.includes(c)) out.push(c);
  return out;
}

/* ---------------- niveaux et hauteurs ---------------- */
function niveau(plan, lv) { return (plan.levels || []).find((l) => l.id === lv) || null; }
const hauteurNiveau = (L) => (L && isNum(L.h) && L.h > 0 ? L.h : 250);
const altNiveau = (L) => (L && isNum(L.elev) ? L.elev : 0);
/* point de raccordement d'un symbole (même règle que l'affichage : un peu devant le mur pour un symbole mural) */
function ancrage(e) { const def = ELEC_BY.get(e.type); return def && def.wall ? itemToWorld(e, 0, 0.42 * S_ELEC) : { x: e.x, y: e.y }; }
/* hauteur du point de raccordement d'un symbole au-dessus du sol fini de son niveau.
   { z, st, src } ; { libre: true } pour un symbole que le câble traverse (passage, GTL du sol au plafond) */
function hauteurSymbole(plan, e) {
  const def = ELEC_BY.get(e.type);
  if (!def) return null;
  if (e.type === TRAVERSEE || def.fullH) return { libre: true };
  const L = niveau(plan, e.lv);
  if (def.floor) return { z: 0, st: 'estimee', src: 'Symbole posé au sol' };
  if (isNum(e.h)) return { z: e.h, st: isNum(def.h) && e.h === def.h ? 'estimee' : 'saisie', src: isNum(def.h) && e.h === def.h ? 'Hauteur de pose par défaut de Calque' : 'Hauteur de pose du symbole' };
  if (!def.wall) return { z: hauteurNiveau(L), st: 'estimee', src: 'Symbole au plafond' };
  if (isNum(def.h)) return { z: def.h, st: 'estimee', src: 'Hauteur de pose par défaut de Calque' };
  return null;
}
/* hauteur du parcours horizontal d'une gaine au-dessus du sol fini, ou null si la pose n'est pas précisée */
function hauteurParcours(plan, d) {
  if (!isElecDuct(d)) return null;
  if (d.pose === 'sol') return 0;
  if (d.pose === 'plafond') return hauteurNiveau(niveau(plan, d.lv));
  if (d.pose === 'hauteur' && isNum(d.z)) return d.z;
  return null;
}
/* index des symboles par identifiant (on peut passer celui de l'application pour éviter de le reconstruire) */
function indexElec(plan, idx) { if (idx) return idx; const m = new Map(); for (const e of plan.elec || []) m.set(e.id, e); return m; }
/* points d'une gaine, extrémités recollées aux symboles raccordés (même niveau) */
function pointsGaine(plan, d, idx) {
  const E = indexElec(plan, idx);
  const pts = (d.pts || []).map((p) => ({ x: p.x, y: p.y }));
  for (const [k, i] of [['a', 0], ['b', pts.length - 1]]) {
    const e = d[k] && E.get(d[k]);
    if (e && e.lv === d.lv) pts[i] = ancrage(e);
  }
  return pts;
}
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function longueurPolyligne(pts) { let s = 0; for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i]); return s; }
/* longueur d'une gaine : horizontale + verticales aux symboles raccordés (cm).
   inconnu : nombre de verticales non comptées (pose de la gaine ou hauteur du symbole non connue) */
function longueurGaine(plan, d, idx) {
  const E = indexElec(plan, idx);
  const horiz = longueurPolyligne(pointsGaine(plan, d, E));
  const zr = hauteurParcours(plan, d);
  const verts = [];
  let inconnu = 0;
  if (isElecDuct(d)) for (const k of ['a', 'b']) {
    const e = d[k] && E.get(d[k]);
    if (!e || e.lv !== d.lv) continue;
    const hs = hauteurSymbole(plan, e);
    if (hs && hs.libre) continue;
    if (!hs || zr == null) { inconnu++; continue; }
    verts.push({ bout: k, h: Math.abs(hs.z - zr), st: hs.st });
  }
  const vert = verts.reduce((s, v) => s + v.h, 0);
  return { horiz, vert, verts, total: horiz + vert, inconnu };
}

/* ---------------- passages entre étages ----------------
   Un passage est un symbole « traversee » posé sur chaque niveau ; les deux se désignent l'un l'autre par `to`. */
function jumelle(plan, e, idx) {
  if (!e || e.type !== TRAVERSEE || !e.to) return null;
  const t = indexElec(plan, idx).get(e.to);
  return t && t.type === TRAVERSEE && t.to === e.id && t.lv !== e.lv ? t : null;
}

/* ---------------- nettoyage (migration et import) ---------------- */
/* champs v6 d'une gaine électrique : kind, pose, z (cm), lw / lh (mm), cids. Valeur invalide → retirée (rien de deviné). */
function nettoyerGaine(d) {
  if (!d || typeof d !== 'object') return d;
  if ('kind' in d && !KINDS.includes(d.kind)) delete d.kind;
  if ('pose' in d && !POSE_IDS.includes(d.pose)) delete d.pose;
  if ('z' in d && !(isNum(d.z) && d.z >= 0 && d.z <= 2000)) delete d.z;
  for (const k of ['lw', 'lh']) if (k in d && !(isNum(d[k]) && d[k] > 0 && d[k] <= 2000)) delete d[k];
  if ('cids' in d) {
    const l = Array.isArray(d.cids) ? [...new Set(d.cids.filter((x) => typeof x === 'string' && x && x !== d.cid))] : [];
    if (l.length) d.cids = l; else delete d.cids;
  }
  if (d.sys !== 'elec') for (const k of ['kind', 'pose', 'z', 'lw', 'lh', 'cids']) delete d[k];
  return d;
}
/* zone interdite : { id, lv, pts: [{ x, y }] (3 points au moins), name } ; null si invalide */
function nettoyerZone(z) {
  if (!z || typeof z !== 'object' || typeof z.id !== 'string' || typeof z.lv !== 'string' || !Array.isArray(z.pts)) return null;
  const pts = z.pts.filter((p) => p && isNum(p.x) && isNum(p.y)).map((p) => ({ x: p.x, y: p.y }));
  if (pts.length < 3) return null;
  const o = { id: z.id, lv: z.lv, pts };
  if (typeof z.name === 'string' && z.name.trim()) o.name = z.name.trim().slice(0, 60);
  return o;
}

export { KINDS, POSES, POSE_IDS, RESERVE_DEFAUT, TRAVERSEE, TYPES_CHEMIN, altNiveau, ancrage, circuitsDe, hauteurNiveau,
  hauteurParcours, hauteurSymbole, indexElec, isElecDuct, jumelle, kindOf, longueurGaine, longueurPolyligne, niveau,
  nettoyerGaine, nettoyerZone, nomChemin, pointsGaine, sectionNominale, tailleChemin, typeChemin };

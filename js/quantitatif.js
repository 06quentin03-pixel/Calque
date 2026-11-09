/* Calque — module « quantitatif » : quantitatif complet du plan et chiffrage (devis estimatif).
   JavaScript pur, sans accès à l'écran : testable avec Node. Le plan n'est jamais modifié par les calculs.
   - Quantitatif : appareillage compté sur le plan (par niveau, par pièce, par circuit), protections du tableau,
     puis cheminements, conducteurs, boîtes et percements repris de materiel.js (quantités estimées).
   - Chiffrage : prix unitaires hors taxes et temps de pose SAISIS par l'utilisateur (aucun prix n'est fourni par
     Calque, aucun prix n'est deviné). Une ligne sans prix reste « non chiffrée » et le total est alors « partiel ».
   - `plan.chiffrage` (format v11) : { prix: { [clé]: { v, st, src } }, temps: { [clé]: { v, st, src } } (minutes par unité),
     tauxH: { v, st, src } (€ HT par heure), tva: { v, st, src } (%) } — tout est facultatif. */
import { distToEdges, inPoly, isNum } from './noyau.js';
import { ELEC_BY } from './symboles.js';
import { ART_BY } from './technique.js';
import { CK } from './elecdonnees.js';
import { TRAVERSEE } from './cheminement.js';
import { conducteurs, lignesCircuits, listeMateriel } from './materiel.js';

const HORS_PIECE = 'Hors pièce';
/* symboles comptés ailleurs (boîtes, percements) : pas dans l'appareillage */
const HORS_APPAREILLAGE = new Set([TRAVERSEE, 'derivation']);

/* ---------- nettoyage (migration v10 → v11, ouverture d'un plan) : rien n'est deviné ---------- */
function donnee(d, ok) {
  if (!d || typeof d !== 'object' || !isNum(d.v) || !ok(d.v)) return null;
  const src = typeof d.src === 'string' ? d.src.trim().slice(0, 200) : '';
  let st = ['verifiee', 'saisie', 'estimee'].includes(d.st) ? d.st : 'saisie';
  if (st === 'verifiee' && !src) st = 'saisie';
  return src ? { v: d.v, st, src } : { v: d.v, st };
}
function nettoyerChiffrage(c) {
  const out = { prix: {}, temps: {} };
  if (!c || typeof c !== 'object' || Array.isArray(c)) return out;
  for (const [k, ok] of [['prix', (v) => v >= 0 && v < 1e7], ['temps', (v) => v >= 0 && v < 1e5]]) {
    const src = c[k];
    if (src && typeof src === 'object' && !Array.isArray(src)) for (const [cle, d] of Object.entries(src)) { const x = donnee(d, ok); if (x && cle.length <= 200) out[k][cle] = x; }
  }
  const t = donnee(c.tauxH, (v) => v >= 0 && v < 1e4); if (t) out.tauxH = t;
  const tva = donnee(c.tva, (v) => v >= 0 && v <= 100); if (tva) out.tva = tva;
  return out;
}

/* ---------- pièce d'un point : dans le contour, sinon la plus proche à moins de 45 cm (appareil posé sur un mur) ---------- */
function pieceDe(pieces, lv, pt) {
  const rs = (pieces && pieces[lv]) || [];
  for (const r of rs) if (inPoly(pt, r.poly) && !(r.holes || []).some((h) => inPoly(pt, h))) return r.nom || 'Pièce sans nom';
  let best = null, bd = 45;
  for (const r of rs) { const d = distToEdges(pt, r.poly); if (d < bd) { bd = d; best = r; } }
  return best ? best.nom || 'Pièce sans nom' : HORS_PIECE;
}

/* désignation et clé d'un symbole : article de la bibliothèque technique, composant personnalisé, ou symbole */
function designer(plan, e, comps) {
  if (e.art && ART_BY.has(e.art)) return { cle: 'art:' + e.art, des: ART_BY.get(e.art).n, art: e.art };
  if (e.comp && comps.has(e.comp)) return { cle: 'comp:' + e.comp, des: comps.get(e.comp).n || 'Composant' };
  const d = ELEC_BY.get(e.type);
  return { cle: 'app:' + e.type, des: d ? d.n : String(e.type) };
}
function reperes(plan) {
  const m = new Map(); let i = 1;
  for (const r of plan.rcds || []) for (const c of (plan.circuits || []).filter((x) => x.rcd === r.id)) m.set(c.id, 'C' + i++);
  for (const c of plan.circuits || []) if (!m.has(c.id)) m.set(c.id, 'C' + i++);
  return m;
}
const tri = (a, b) => a.des.localeCompare(b.des, 'fr', { numeric: true });

/* Quantitatif du plan. opts.pieces : { [niveau]: [{ nom, poly, holes }] } (contours calculés par la géométrie).
   Renvoie { lignes, parPiece, parCircuit, reserve, sansLongueur, vertInconnues }.
   Ligne : { cle, cat, des, qte, unite, st, note, art } — st : 'saisie' (compté sur le plan ou lu dans le tableau), 'estimee' (mesuré + réserve). */
function quantitatif(plan, opts) {
  const pieces = (opts && opts.pieces) || null;
  const comps = new Map((plan.comps || []).map((c) => [c.id, c]));
  const lvNom = new Map((plan.levels || []).map((l) => [l.id, l.name]));
  const lignes = [], par = new Map();
  const piecesMap = new Map(), circMap = new Map();
  const ajoute = (map, k, init, d, n) => {
    let g = map.get(k); if (!g) map.set(k, (g = init()));
    let l = g.m.get(d.cle); if (!l) g.m.set(d.cle, (l = { cle: d.cle, des: d.des, qte: 0, unite: 'u' }));
    l.qte += n;
  };
  /* appareillage */
  for (const e of plan.elec || []) {
    if (!e || HORS_APPAREILLAGE.has(e.type)) continue;
    const d = designer(plan, e, comps);
    let l = par.get(d.cle);
    if (!l) { par.set(d.cle, (l = { cle: d.cle, cat: 'Appareillage', des: d.des, qte: 0, unite: 'u', st: 'saisie', note: '', niveaux: new Map() })); if (d.art) l.art = d.art; lignes.push(l); }
    l.qte++; l.niveaux.set(e.lv, (l.niveaux.get(e.lv) || 0) + 1);
    const piece = pieces ? pieceDe(pieces, e.lv, e) : null;
    if (pieces) ajoute(piecesMap, e.lv + '|' + piece, () => ({ lv: e.lv, niveau: lvNom.get(e.lv) || '', piece, m: new Map() }), d, 1);
    if (e.cid) ajoute(circMap, e.cid, () => ({ id: e.cid, m: new Map() }), d, 1);
  }
  for (const l of lignes) { if (l.niveaux.size > 1) l.note = [...l.niveaux.entries()].map(([lv, n]) => `${n} ${lvNom.get(lv) || ''}`.trim()).join(', '); delete l.niveaux; }
  lignes.sort(tri);
  /* protections du tableau */
  const prot = new Map();
  const P = (cle, des, note) => { let l = prot.get(cle); if (!l) prot.set(cle, (l = { cle, cat: 'Protections', des, qte: 0, unite: 'u', st: 'saisie', note })); l.qte++; return l; };
  const inst = plan.install || {};
  const circuits = plan.circuits || [];
  const protCirc = (c) => {
    const out = [];
    if (isNum(c.cal)) { const t = c.calc && c.calc.phase === 'tri'; out.push({ cle: `disj:${c.cal}:${t ? 'tri' : 'mono'}`, des: `Disjoncteur divisionnaire ${c.cal} A ${t ? '3P+N' : '1P+N'}` }); }
    if (c.dda) out.push({ cle: 'dda', des: 'Détecteur d’arc (DDA)' });
    return out;
  };
  for (const c of circuits) for (const d of protCirc(c)) P(d.cle, d.des, 'un par circuit du tableau');
  for (const r of plan.rcds || []) if (isNum(r.cal)) P(`dd:${r.type}:${r.cal}:${inst.reseau === 'tri' ? 'tri' : 'mono'}`, `Interrupteur différentiel 30 mA type ${r.type} ${r.cal} A${inst.reseau === 'tri' ? ' tétrapolaire' : ''}`, 'lu dans le tableau');
  if (inst.parafoudre) P('parafoudre', 'Parafoudre', 'option de l’installation');
  const lp = [...prot.values()].sort(tri);
  /* cheminements, conducteurs, boîtes, percements (estimés, voir materiel.js) */
  const M = listeMateriel(plan);
  const lm = M.lignes.map((l) => ({ cle: `mat:${l.cat}|${l.des}`, cat: l.cat, des: l.des, qte: l.qte, unite: l.unite, st: l.st, note: l.note }));
  /* par circuit : protection + appareils + câble à commander */
  const nums = reperes(plan), lc = new Map(lignesCircuits(plan).map((x) => [x.c.id, x]));
  const parCircuit = circuits.map((c) => {
    const g = circMap.get(c.id), ls = [];
    for (const d of protCirc(c)) ls.push({ cle: d.cle, des: d.des, qte: 1, unite: 'u' });
    if (g) ls.push(...[...g.m.values()].sort(tri));
    const x = lc.get(c.id);
    if (x && x.ch.complet && x.cmd != null) { const k = conducteurs(plan, c); ls.push({ cle: `mat:Conducteurs|${isNum(c.sec) ? `Fil ou câble ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(c.sec)} mm²` : 'Section non indiquée'}`, des: `Conducteurs ${isNum(c.sec) ? String(c.sec).replace('.', ',') + ' mm²' : '(section non indiquée)'} (${k.txt})`, qte: x.cmd * k.n, unite: 'm', st: 'estimee' }); }
    return { id: c.id, repere: nums.get(c.id), nom: c.name, type: (CK[c.kind] || { n: 'Autre' }).n, lignes: ls, cableConnu: !!(x && x.ch.complet && x.cmd != null) };
  });
  const ordre = new Map((plan.levels || []).map((l, i) => [l.id, i]));
  const parPiece = [...piecesMap.values()].map((g) => ({ lv: g.lv, niveau: g.niveau, piece: g.piece, lignes: [...g.m.values()].sort(tri) }))
    .sort((a, b) => (ordre.get(a.lv) - ordre.get(b.lv)) || (a.piece === HORS_PIECE) - (b.piece === HORS_PIECE) || a.piece.localeCompare(b.piece, 'fr', { numeric: true }));
  return { lignes: [...lignes, ...lp, ...lm], parPiece, parCircuit, reserve: M.reserve, sansLongueur: M.sansLongueur, vertInconnues: M.vertInconnues };
}

/* ---------- chiffrage : prix et temps saisis seulement ---------- */
const arr2 = (v) => Math.round(v * 100) / 100;
function chiffrer(q, chiffrage) {
  const c = nettoyerChiffrage(chiffrage);
  let fourn = 0, minutes = 0, sansPrix = 0, avecTemps = 0;
  const lignes = q.lignes.map((l) => {
    const pu = c.prix[l.cle] || null, t = c.temps[l.cle] || null;
    const total = pu ? arr2(pu.v * l.qte) : null, tps = t ? t.v * l.qte : null;
    if (total != null) fourn += total; else sansPrix++;
    if (tps != null) { minutes += tps; avecTemps++; }
    return Object.assign({}, l, { pu, total, temps: t, minutes: tps });
  });
  fourn = arr2(fourn);
  const heures = minutes / 60;
  const mo = c.tauxH && avecTemps ? arr2(heures * c.tauxH.v) : null;
  const ht = arr2(fourn + (mo || 0));
  const complet = lignes.length > 0 && sansPrix === 0;
  return {
    lignes, fournitures: fourn, heures, mainOeuvre: mo, tauxH: c.tauxH || null, lignesAvecTemps: avecTemps,
    totalHT: ht, sansPrix, chiffrees: lignes.length - sansPrix, complet,
    tva: c.tva || null, montantTVA: c.tva ? arr2(ht * c.tva.v / 100) : null, totalTTC: c.tva ? arr2(ht * (1 + c.tva.v / 100)) : null,
  };
}
/* total d'un groupe (pièce ou circuit) : somme des lignes chiffrées, et nombre de lignes sans prix */
function totalGroupe(lignes, chiffrage) {
  const prix = (chiffrage && chiffrage.prix) || {};
  let t = 0, sans = 0;
  for (const l of lignes) { const p = prix[l.cle]; if (p && isNum(p.v)) t += p.v * l.qte; else sans++; }
  return { total: arr2(t), sansPrix: sans };
}

/* ---------- export CSV (tableur) : séparateur « ; », virgule décimale, UTF-8 avec BOM pour Excel ---------- */
const LIB_ST = { verifiee: 'Vérifiée', saisie: 'Saisie', estimee: 'Estimée' };
function csvCell(v) {
  if (v == null) return '';
  let s = typeof v === 'number' ? String(Math.round(v * 1000) / 1000).replace('.', ',') : String(v);
  if (/^[=+\-@\t\r]/.test(s) && typeof v !== 'number') s = "'" + s; // jamais interprété comme une formule par le tableur
  return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function csvQuantitatif(q, ch, opts) {
  const ref = (opts && opts.referenceDe) || (() => null);
  const L = [];
  const row = (...c) => L.push(c.map(csvCell).join(';'));
  if (opts && opts.titre) { row(opts.titre); row(''); }
  row('Catégorie', 'Désignation', 'Fabricant', 'Référence', 'Quantité', 'Unité', 'Fiabilité de la quantité', 'Prix unitaire HT', 'Total HT', 'Temps de pose unitaire (min)', 'Détail');
  for (const l of ch.lignes) {
    const r = l.art ? ref(l.art) : null;
    row(l.cat, l.des, r ? r.fab : '', r ? r.ref : '', l.qte, l.unite, LIB_ST[l.st] || '', l.pu ? l.pu.v : '', l.total != null ? l.total : '', l.temps ? l.temps.v : '', l.note || '');
  }
  row('');
  row(ch.complet ? 'Total fournitures HT' : `Total fournitures HT PARTIEL (${ch.sansPrix} ligne${ch.sansPrix > 1 ? 's' : ''} sans prix)`, '', '', '', '', '', '', '', ch.fournitures);
  if (ch.mainOeuvre != null) row(`Main-d’œuvre HT (${String(Math.round(ch.heures * 10) / 10).replace('.', ',')} h, ${ch.lignesAvecTemps} ligne${ch.lignesAvecTemps > 1 ? 's' : ''} avec un temps de pose)`, '', '', '', '', '', '', '', ch.mainOeuvre);
  row(ch.complet ? 'Total HT' : 'Total HT PARTIEL', '', '', '', '', '', '', '', ch.totalHT);
  if (ch.tva) { row(`TVA ${String(ch.tva.v).replace('.', ',')} %`, '', '', '', '', '', '', '', ch.montantTVA); row(ch.complet ? 'Total TTC' : 'Total TTC PARTIEL', '', '', '', '', '', '', '', ch.totalTTC); }
  if (q.parPiece.length) {
    row(''); row('QUANTITÉS PAR PIÈCE'); row('Niveau', 'Pièce', 'Désignation', 'Quantité', 'Unité');
    for (const g of q.parPiece) for (const l of g.lignes) row(g.niveau, g.piece, l.des, l.qte, l.unite);
  }
  if (q.parCircuit.length) {
    row(''); row('QUANTITÉS PAR CIRCUIT'); row('Repère', 'Circuit', 'Désignation', 'Quantité', 'Unité');
    for (const g of q.parCircuit) for (const l of g.lignes) row(g.repere, g.nom, l.des, l.qte, l.unite);
  }
  row(''); row('Quantités « Estimée » : mesurées sur le plan avec la réserve, à vérifier avant commande. Prix et temps de pose : saisis par l’utilisateur.');
  return '﻿' + L.join('\r\n') + '\r\n';
}

export { HORS_PIECE, chiffrer, csvQuantitatif, nettoyerChiffrage, pieceDe, quantitatif, totalGroupe };

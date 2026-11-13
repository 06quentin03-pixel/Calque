/* Calque — module « schema » : moteur des schémas électriques (onglet « Schémas »). Sans écran (testable avec Node).
   Les schémas sont rangés dans le plan (`P.schemas`, format v14) mais indépendants du bâtiment : folios, symboles, fils,
   textes. Ce module calcule ce qui s'en déduit — rien n'est enregistré en double :
   - équipotentielles (fils reliés entre eux et aux bornes des symboles), numéros de fils / noms de potentiels ;
   - repères des appareils (Q1, KM1…), numéros des bornes des contacts (13-14, 21-22…) ;
   - renvois croisés (bobine ↔ contacts, renvois de folio) en « folio.colonne » ;
   - nomenclature, borniers, liste des fils (de borne à borne) ;
   - point de départ créé depuis le tableau électrique du plan, modèles de schémas usuels.
   Unités : millimètres sur une feuille A3 paysage (420 × 297). */
import { SYM_BY, boiteDe, bornesDe, dessinerSymbole } from './schemasymboles.js';

/* ---------------- feuille (folio) ---------------- */
const FEUILLE = { W: 420, H: 297, M: 10, BANDE: 6, CART: 30, NCOL: 10, GRILLE: 5 };
const ZONE = { x0: FEUILLE.M, y0: FEUILLE.M + FEUILLE.BANDE, x1: FEUILLE.W - FEUILLE.M, y1: FEUILLE.H - FEUILLE.M - FEUILLE.CART };
const LCOL = (ZONE.x1 - ZONE.x0) / FEUILLE.NCOL;
const TYPES_FOLIO = { developpe: 'Schéma développé', distribution: 'Distribution', bornier: 'Bornier et armoire', principe: 'Schéma de principe', libre: 'Schéma' };
const colonne = (x) => Math.max(1, Math.min(FEUILLE.NCOL, Math.floor((x - ZONE.x0) / LCOL) + 1));
const position = (fi, x) => `${fi + 1}.${colonne(x)}`;
const id = (p) => p + Math.random().toString(36).slice(2, 9);
const r1 = (v) => Math.round(v * 10) / 10;

function schemasDe(plan) {
  if (!plan.schemas || typeof plan.schemas !== 'object' || Array.isArray(plan.schemas)) plan.schemas = { folios: [] };
  if (!Array.isArray(plan.schemas.folios)) plan.schemas.folios = [];
  return plan.schemas;
}
function nouveauFolio(titre, type) { return { id: id('f'), titre: titre || 'Nouveau folio', type: TYPES_FOLIO[type] ? type : 'libre', syms: [], fils: [], textes: [] }; }

/* ---------------- repères ---------------- */
const numRep = (rep, pre) => { const m = String(rep || '').match(/^([A-Z]+)(\d+)$/); return m && m[1] === pre ? +m[2] : 0; };
function prochainRepere(sch, pre) {
  if (!pre) return '';
  let n = 0; for (const f of sch.folios) for (const s of f.syms) n = Math.max(n, numRep(s.rep, pre));
  return pre + (n + 1);
}
/* repère d'un nouveau symbole : un contact prend le repère de la dernière bobine (ou thermique) de sa famille */
function repereNouveau(sch, t, dernier) {
  const d = SYM_BY.get(t); if (!d || !d.pre) return '';
  if (d.role === 'contact') {
    /* familles d'appareils auxquelles ce contact peut appartenir : un contact auxiliaire (KA) va sur toute bobine */
    const fam = FAMILLES[d.pre] || [d.pre];
    if (dernier && fam.includes(dernier.pre)) return dernier.rep;
    const app = appareils(sch); const cands = [...app.values()].filter((a) => fam.includes(a.pre) && (a.bobines.length || a.autres.length));
    if (cands.length) return cands[cands.length - 1].rep;
  }
  if (d.role === 'borne') { // borne : même bornier que la précédente, numéro suivant
    const b = []; for (const f of sch.folios) for (const s of f.syms) if (s.t === 'borne') b.push(s);
    return b.length ? b[b.length - 1].rep : 'X1';
  }
  return prochainRepere(sch, d.pre);
}
function prochainNumBorne(sch, rep) { let n = 0; for (const f of sch.folios) for (const s of f.syms) if (s.t === 'borne' && s.rep === rep) n = Math.max(n, parseInt(s.num, 10) || 0); return String(n + 1); }

const FAMILLES = { KA: ['KM', 'KA', 'KT', 'KL'], KT: ['KT'], KM: ['KM'], F: ['F'] };
/* ---------------- appareils : bobines, contacts, renvois croisés ---------------- */
function appareils(sch) {
  const m = new Map();
  sch.folios.forEach((f, fi) => {
    for (const s of f.syms) {
      const d = SYM_BY.get(s.t); if (!d || !s.rep || d.role === 'borne' || d.role === 'pot' || d.role === 'renvoi') continue;
      if (!m.has(s.rep)) m.set(s.rep, { rep: s.rep, pre: d.pre, bobines: [], contacts: [], autres: [], principal: null });
      const a = m.get(s.rep), e = { fi, f, s, d, pos: position(fi, s.x) };
      if (d.role === 'bobine') a.bobines.push(e); else if (d.role === 'contact') a.contacts.push(e); else a.autres.push(e);
    }
  });
  for (const a of m.values()) {
    const tri = (x, y) => x.fi - y.fi || x.s.x - y.s.x || x.s.y - y.s.y;
    a.contacts.sort(tri);
    a.principal = a.bobines[0] || a.autres.find((e) => e.d.t !== 'contact_th') || a.autres[0] || a.contacts[0] || null;
    /* numéros des bornes des contacts auxiliaires : 13-14, 21-22, 33-34… ; pôles de puissance : 1-2, 3-4, 5-6 */
    let k = 0;
    for (const e of a.contacts) {
      if (e.d.num) { e.num = e.d.num; continue; }
      if (e.d.type === 'P') { e.num = null; continue; }
      k++; e.num = e.d.type === 'NF' ? [`${k}1`, `${k}2`] : [`${k}3`, `${k}4`];
    }
  }
  return m;
}
/* noms affichés des bornes d'un symbole posé */
function nomsBornes(sym, app) {
  const d = SYM_BY.get(sym.t); if (!d) return [];
  if (d.role === 'contact' && sym.rep && app) { const a = app.get(sym.rep); const e = a && a.contacts.find((x) => x.s === sym); if (e && e.num) return e.num; }
  return d.bornes.map((b) => b.n);
}

/* ---------------- équipotentielles ---------------- */
function surSegment(p, a, b) {
  const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; if (L2 < 1e-9) return false;
  const t = ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2;
  if (t <= 1e-6 || t >= 1 - 1e-6) return false;
  return Math.hypot(a.x + t * (b.x - a.x) - p.x, a.y + t * (b.y - a.y) - p.y) < 0.05;
}
/* { nets: [{ id, nom, auto, fils: [fid…], membres: [{ fi, sym, borne }], folios: [fi…] }], parFil, parBorne } */
function equipotentielles(sch) {
  const par = new Map();
  const find = (k) => { let r = k; while (par.get(r) !== r) r = par.get(r); let x = k; while (par.get(x) !== r) { const n = par.get(x); par.set(x, r); x = n; } return r; };
  const add = (k) => { if (!par.has(k)) par.set(k, k); return k; };
  const uni = (a, b) => { add(a); add(b); const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); };
  const cle = (fi, p) => `${fi}|${Math.round(p.x * 10)}|${Math.round(p.y * 10)}`;
  const filsKeys = new Map(), bornes = [];
  sch.folios.forEach((f, fi) => {
    for (const w of f.fils) {
      if (!Array.isArray(w.pts) || w.pts.length < 2) continue;
      const ks = w.pts.map((p) => add(cle(fi, p)));
      for (let i = 1; i < ks.length; i++) uni(ks[i - 1], ks[i]);
      filsKeys.set(w.id, { fi, k: ks[0] });
    }
    /* jonctions : bout d'un fil posé sur un tronçon d'un autre fil */
    for (const w of f.fils) for (const p of [w.pts[0], w.pts[w.pts.length - 1]]) for (const v of f.fils) {
      if (v === w) continue;
      for (let i = 1; i < v.pts.length; i++) if (surSegment(p, v.pts[i - 1], v.pts[i])) { uni(cle(fi, p), cle(fi, v.pts[0])); break; }
    }
    for (const s of f.syms) {
      const d = SYM_BY.get(s.t); if (!d) continue;
      const bs = bornesDe(s);
      bs.forEach((b, i) => { const k = add(cle(fi, b)); bornes.push({ fi, sym: s, borne: i, k }); });
      if (d.role === 'borne' && bs.length === 2) uni(cle(fi, bs[0]), cle(fi, bs[1])); // borne traversante
      if ((d.role === 'pot' || d.role === 'renvoi') && s.num) uni(cle(fi, bs[0]), 'pot:' + String(s.num).trim());
    }
  });
  const groupes = new Map();
  const g = (k) => { const r = find(k); if (!groupes.has(r)) groupes.set(r, { fils: [], membres: [], pots: new Set(), folios: new Set(), nums: [] }); return groupes.get(r); };
  sch.folios.forEach((f, fi) => { for (const w of f.fils) { const fk = filsKeys.get(w.id); if (!fk) continue; const G = g(fk.k); G.fils.push(w.id); G.folios.add(fi); if (w.num) G.nums.push(String(w.num)); } });
  for (const b of bornes) { const G = g(b.k); G.membres.push(b); G.folios.add(b.fi); const d = SYM_BY.get(b.sym.t); if ((d.role === 'pot' || d.role === 'renvoi') && b.sym.num) G.pots.add(String(b.sym.num).trim()); }
  const nets = [...groupes.values()].filter((G) => G.fils.length);
  /* noms : potentiel nommé, sinon numéro imposé sur un fil, sinon numéro automatique par folio (301, 302…) */
  const parFolio = new Map();
  const premierPoint = (G) => { let best = null; for (const fid of G.fils) for (const f of sch.folios) { const w = f.fils.find((x) => x.id === fid); if (w) for (const p of w.pts) if (!best || p.x < best.x - 0.01 || (Math.abs(p.x - best.x) < 0.01 && p.y < best.y)) best = p; } return best || { x: 0, y: 0 }; };
  nets.sort((a, b) => Math.min(...a.folios) - Math.min(...b.folios) || premierPoint(a).x - premierPoint(b).x || premierPoint(a).y - premierPoint(b).y);
  const out = [], parFil = new Map(), parBorne = new Map();
  for (const G of nets) {
    let nom, auto = false;
    if (G.pots.size) nom = [...G.pots].sort()[0];
    else if (G.nums.length) nom = G.nums.sort()[0];
    else { const fi = Math.min(...G.folios); const k = (parFolio.get(fi) || 0) + 1; parFolio.set(fi, k); nom = String((fi + 1) * 100 + k); auto = true; }
    const n = { id: 'n' + out.length, nom, auto, fils: G.fils, membres: G.membres, folios: [...G.folios].sort((a, b) => a - b) };
    out.push(n);
    for (const fid of G.fils) parFil.set(fid, n);
    for (const m of G.membres) parBorne.set(`${m.sym.id}:${m.borne}`, n);
  }
  return { nets: out, parFil, parBorne };
}

/* ---------------- nomenclature, borniers, liste des fils ---------------- */
function nomenclature(sch) {
  const app = appareils(sch), lignes = [];
  for (const a of [...app.values()].sort((x, y) => x.rep.localeCompare(y.rep, 'fr', { numeric: true }))) {
    const p = a.principal; if (!p) continue;
    const des = (a.bobines[0] || a.autres[0] || a.contacts[0]).s.des || '';
    const ref = [...a.bobines, ...a.autres, ...a.contacts].map((e) => e.s.ref).find(Boolean) || '';
    const aux = a.contacts.filter((e) => e.d.type !== 'P');
    const comp = [];
    if (a.bobines.length) comp.push(a.bobines[0].d.n);
    for (const e of a.autres) comp.push(e.d.n);
    const pp = a.contacts.filter((e) => e.d.type === 'P'); if (pp.length) comp.push(`${pp.reduce((s, e) => s + (e.d.pp || 1), 0)} pôles de puissance`);
    if (aux.length) comp.push(`${aux.filter((e) => e.d.type === 'NO').length} NO + ${aux.filter((e) => e.d.type === 'NF').length} NF`);
    const orphelin = !a.bobines.length && !a.autres.length; // contacts sans appareil dessiné
    lignes.push({ rep: a.rep, appareil: a.bobines.length ? a.bobines[0].d.n.replace(/^Bobine de /, '').replace(/^\w/, (x) => x.toUpperCase()) : p.d.n, des, ref, composition: comp.join(', '),
      positions: [...new Set([...a.bobines, ...a.autres, ...a.contacts].map((e) => e.pos))], orphelin });
  }
  /* quantités par type d'appareil */
  const parType = new Map(); for (const l of lignes) parType.set(l.appareil, (parType.get(l.appareil) || 0) + 1);
  return { lignes, quantites: [...parType.entries()].map(([appareil, n]) => ({ appareil, n })).sort((a, b) => a.appareil.localeCompare(b.appareil, 'fr')) };
}
function borniers(sch, eq) {
  eq = eq || equipotentielles(sch);
  const m = new Map();
  sch.folios.forEach((f, fi) => { for (const s of f.syms) if (s.t === 'borne') {
    const rep = s.rep || 'X?'; if (!m.has(rep)) m.set(rep, []);
    const nh = eq.parBorne.get(`${s.id}:0`), nb = eq.parBorne.get(`${s.id}:1`);
    m.get(rep).push({ num: s.num || '?', potentiel: (nh || nb) ? (nh || nb).nom : '—', des: s.des || '', pos: position(fi, s.x) });
  } });
  return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }))
    .map(([rep, l]) => ({ rep, bornes: l.sort((a, b) => String(a.num).localeCompare(String(b.num), 'fr', { numeric: true })) }));
}
function listeFils(sch, eq) {
  eq = eq || equipotentielles(sch);
  const app = appareils(sch);
  return eq.nets.map((n) => {
    const pts = [];
    for (const m of n.membres) {
      const d = SYM_BY.get(m.sym.t); if (!d || d.role === 'pot' || d.role === 'renvoi') continue;
      const noms = nomsBornes(m.sym, app);
      pts.push(d.role === 'borne' ? `${m.sym.rep || 'X?'}:${m.sym.num || '?'}` : `${m.sym.rep || d.n}:${noms[m.borne] || m.borne + 1}`);
    }
    return { nom: n.nom, auto: n.auto, folios: n.folios.map((fi) => fi + 1), connexions: [...new Set(pts)] };
  });
}
/* renvois de folio de même nom : positions des autres */
function renvois(sch) {
  const m = new Map();
  sch.folios.forEach((f, fi) => { for (const s of f.syms) if (s.t === 'renvoi' && s.num) { const k = String(s.num).trim(); if (!m.has(k)) m.set(k, []); m.get(k).push({ s, pos: position(fi, s.x) }); } });
  return m;
}

/* ---------------- contrôles du schéma (constats, pas de conformité) ---------------- */
function controlesSchema(sch) {
  const out = [], app = appareils(sch), eq = equipotentielles(sch);
  for (const a of app.values()) {
    if (a.contacts.length && !a.bobines.length && !a.autres.length) out.push({ niveau: 'avertissement', msg: `${a.rep} : contact(s) sans bobine ni appareil dessiné (renvoi impossible).`, rep: a.rep });
    if (a.bobines.length > 1) out.push({ niveau: 'erreur', msg: `${a.rep} : ${a.bobines.length} bobines portent le même repère.`, rep: a.rep });
  }
  /* bornes non raccordées (sauf potentiels et renvois) */
  sch.folios.forEach((f, fi) => { for (const s of f.syms) { const d = SYM_BY.get(s.t); if (!d || d.role === 'pot' || d.role === 'renvoi') continue;
    const libres = d.bornes.filter((b, i) => !eq.parBorne.has(`${s.id}:${i}`)).length;
    if (libres && libres === d.bornes.length) out.push({ niveau: 'suggestion', msg: `${s.rep || d.n} (folio ${fi + 1}) n’est relié à aucun fil.`, rep: s.rep, sym: s.id, fi });
  } });
  /* bornier : numéro en double */
  for (const b of borniers(sch, eq)) { const vu = new Set(); for (const x of b.bornes) { if (vu.has(x.num)) out.push({ niveau: 'erreur', msg: `Bornier ${b.rep} : borne ${x.num} en double.`, rep: b.rep }); vu.add(x.num); } }
  /* renvoi sans correspondant */
  for (const [k, l] of renvois(sch)) if (l.length < 2) out.push({ niveau: 'avertissement', msg: `Renvoi « ${k} » sans renvoi de même nom sur un autre folio.` });
  return out;
}

/* ---------------- fils : outils ---------------- */
/* tracé orthogonal entre deux points : en L (vertical puis horizontal, ou l'inverse) */
function enL(a, b, horizontalDabord) {
  if (Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01) return [a, b];
  return horizontalDabord ? [a, { x: b.x, y: a.y }, b] : [a, { x: a.x, y: b.y }, b];
}
function simplifier(pts) {
  const o = [];
  for (const p of pts) { const q = { x: r1(p.x), y: r1(p.y) }; if (o.length && Math.abs(o[o.length - 1].x - q.x) < 0.01 && Math.abs(o[o.length - 1].y - q.y) < 0.01) continue; o.push(q); }
  for (let i = o.length - 2; i >= 1; i--) { const a = o[i - 1], b = o[i], c = o[i + 1]; if (Math.abs((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x)) < 0.01) o.splice(i, 1); }
  return o;
}
/* symbole posé sur un fil : le fil est coupé entre les bornes du symbole (insertion dans le fil) */
function insererSurFil(f, sym) {
  const bs = bornesDe(sym); if (bs.length < 2) return false;
  let fait = false;
  for (const w of f.fils.slice()) for (let i = 1; i < w.pts.length; i++) {
    const a = w.pts[i - 1], b = w.pts[i];
    const sur = bs.filter((p) => surSegment(p, a, b) || (Math.hypot(p.x - a.x, p.y - a.y) < 0.05) || (Math.hypot(p.x - b.x, p.y - b.y) < 0.05));
    if (sur.length < 2) continue;
    const t = (p) => ((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / ((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    sur.sort((p, q) => t(p) - t(q));
    const p0 = sur[0], p1 = sur[sur.length - 1];
    const avant = simplifier([...w.pts.slice(0, i), p0]), apres = simplifier([p1, ...w.pts.slice(i)]);
    f.fils.splice(f.fils.indexOf(w), 1);
    if (avant.length >= 2 && Math.hypot(avant[0].x - p0.x, avant[0].y - p0.y) > 0.05) f.fils.push(Object.assign({}, w, { pts: avant }));
    if (apres.length >= 2 && Math.hypot(apres[apres.length - 1].x - p1.x, apres[apres.length - 1].y - p1.y) > 0.05) f.fils.push(Object.assign({}, w, { id: id('w'), pts: apres }));
    fait = true; break;
  }
  return fait;
}

/* ---------------- constructeur (modèles et import) ---------------- */
function constructeur(f) {
  const S = (t, x, y, o) => { const s = Object.assign({ id: id('s'), t, x, y, rot: 0 }, o || {}); f.syms.push(s); return s; };
  const W = (...pts) => { const w = { id: id('w'), pts: simplifier(pts.map(([x, y]) => ({ x, y }))) }; if (w.pts.length >= 2) f.fils.push(w); return w; };
  const TX = (s, x, y, o) => { const t = Object.assign({ id: id('t'), x, y, s, taille: 3 }, o || {}); f.textes.push(t); return t; };
  return { S, W, TX };
}
/* potentiels en haut (flèche vers le haut) et en bas (vers le bas) */
const POT_H = 270, POT_B = 90;

const MODELES = [
  { id: 'demarrage', n: 'Démarrage direct d’un moteur triphasé', type: 'developpe', d: 'Puissance (sectionneur, contacteur, relais thermique, bornier, moteur) et commande (marche, arrêt, auto-maintien, voyant).',
    faire(f) {
      const { S, W, TX } = constructeur(f);
      TX('PUISSANCE', 95, 24, { taille: 3.5, gras: true }); TX('COMMANDE', 250, 24, { taille: 3.5, gras: true });
      for (const [x, n] of [[40, 'L1'], [50, 'L2'], [60, 'L3']]) { S('pot', x, 35, { rot: POT_H, num: n }); W([x, 35], [x, 45]); }
      S('sectfus3', 40, 55, { rep: 'Q1', des: 'Sectionneur porte-fusibles' });
      for (const x of [40, 50, 60]) W([x, 65], [x, 75]);
      S('km3', 40, 85, { rep: 'KM1' });
      for (const x of [40, 50, 60]) W([x, 95], [x, 105]);
      S('relth3', 40, 115, { rep: 'F1', des: 'Relais thermique' });
      for (const [x, n] of [[40, '1'], [50, '2'], [60, '3']]) S('borne', x, 130, { rep: 'X1', num: n });
      for (const x of [40, 50, 60]) W([x, 135], [x, 140]);
      S('moteur3', 40, 150, { rep: 'M1', des: 'Moteur' });
      S('pot', 200, 35, { rot: POT_H, num: 'L' }); W([200, 35], [200, 40]);
      S('fusible', 200, 50, { rep: 'F2', des: 'Protection du circuit de commande' }); W([200, 60], [200, 70]);
      S('contact_th', 200, 80, { rep: 'F1' }); W([200, 90], [200, 100]);
      S('bp_nf', 200, 110, { rep: 'S1', des: 'Arrêt' }); W([200, 120], [200, 130]);
      S('bp_no', 200, 140, { rep: 'S2', des: 'Marche' }); W([200, 150], [200, 160]);
      S('bobine_km', 200, 170, { rep: 'KM1', des: 'Contacteur moteur' }); W([200, 180], [200, 195]);
      S('pot', 200, 195, { rot: POT_B, num: 'N' });
      S('contact_no', 230, 140, { rep: 'KM1' }); W([200, 125], [230, 125], [230, 130]); W([230, 150], [230, 155], [200, 155]);
      S('voyant', 260, 170, { rep: 'H1', des: 'Marche' }); W([230, 155], [260, 155], [260, 160]); W([260, 180], [260, 188], [200, 188]);
    } },
  { id: 'inversion', n: 'Inverseur de sens de marche', type: 'developpe', d: 'Deux contacteurs avec verrouillage électrique (contacts NF croisés), boutons avant / arrière / arrêt.',
    faire(f) {
      const { S, W, TX } = constructeur(f);
      TX('PUISSANCE', 130, 24, { taille: 3.5, gras: true }); TX('COMMANDE', 290, 24, { taille: 3.5, gras: true });
      for (const [x, n] of [[40, 'L1'], [50, 'L2'], [60, 'L3']]) { S('pot', x, 35, { rot: POT_H, num: n }); W([x, 35], [x, 45]); }
      S('disjmot', 40, 55, { rep: 'Q1', des: 'Disjoncteur moteur' });
      /* départs vers KM1 (droit) et KM2 (inversion de L1 et L3), chaque phase à sa hauteur : aucun fil superposé */
      W([40, 65], [40, 90]); W([50, 65], [50, 90]); W([60, 65], [60, 90]);
      W([40, 70], [90, 70], [90, 90]); W([50, 75], [100, 75], [100, 90]); W([60, 80], [110, 80], [110, 90]);
      S('km3', 40, 100, { rep: 'KM1', des: 'Avant' }); S('km3', 90, 100, { rep: 'KM2', des: 'Arrière' });
      W([40, 110], [40, 140]); W([50, 110], [50, 140]); W([60, 110], [60, 140]);
      W([90, 110], [90, 120], [60, 120]); W([100, 110], [100, 125], [50, 125]); W([110, 110], [110, 130], [40, 130]);
      S('moteur3', 40, 150, { rep: 'M1', des: 'Moteur' });
      S('pot', 220, 35, { rot: POT_H, num: 'L' }); W([220, 35], [220, 40]);
      S('fusible', 220, 50, { rep: 'F2' }); W([220, 60], [220, 70]);
      S('bp_nf', 220, 80, { rep: 'S1', des: 'Arrêt' }); W([220, 90], [220, 100]); W([220, 95], [280, 95], [280, 100]);
      S('bp_no', 220, 110, { rep: 'S2', des: 'Avant' }); S('bp_no', 280, 110, { rep: 'S3', des: 'Arrière' });
      S('contact_no', 250, 110, { rep: 'KM1' }); W([220, 98], [250, 98], [250, 100]); W([250, 120], [250, 125], [220, 125]);
      S('contact_no', 310, 110, { rep: 'KM2' }); W([280, 98], [310, 98], [310, 100]); W([310, 120], [310, 125], [280, 125]);
      W([220, 120], [220, 130]); W([280, 120], [280, 130]);
      S('contact_nf', 220, 140, { rep: 'KM2' }); S('contact_nf', 280, 140, { rep: 'KM1' });
      W([220, 150], [220, 160]); W([280, 150], [280, 160]);
      S('bobine_km', 220, 170, { rep: 'KM1', des: 'Avant' }); S('bobine_km', 280, 170, { rep: 'KM2', des: 'Arrière' });
      W([220, 180], [220, 195]); W([280, 180], [280, 188], [220, 188]);
      S('pot', 220, 195, { rot: POT_B, num: 'N' });
    } },
  { id: 'telerupteur', n: 'Télérupteur et boutons-poussoirs', type: 'principe', d: 'Éclairage commandé par plusieurs boutons-poussoirs.',
    faire(f) {
      const { S, W } = constructeur(f);
      S('pot', 60, 35, { rot: POT_H, num: 'L' }); W([60, 35], [60, 40]);
      S('disj1', 60, 50, { rep: 'Q1', des: 'Éclairage 10 A' }); W([60, 60], [60, 80]); W([60, 70], [90, 70], [90, 80]);
      S('bp_no', 60, 90, { rep: 'S1', des: 'Entrée' }); S('bp_no', 90, 90, { rep: 'S2', des: 'Couloir' });
      W([60, 100], [60, 120]); W([90, 100], [90, 110], [60, 110]);
      S('bobine_tl', 60, 130, { rep: 'KL1', des: 'Télérupteur' }); W([60, 140], [60, 155]); S('pot', 60, 155, { rot: POT_B, num: 'N' });
      S('pot', 160, 35, { rot: POT_H, num: 'L' }); W([160, 35], [160, 80]);
      S('contact_no', 160, 90, { rep: 'KL1' }); W([160, 100], [160, 120]);
      S('lampe', 160, 130, { rep: 'E1', des: 'Éclairage' }); W([160, 140], [160, 155]); S('pot', 160, 155, { rot: POT_B, num: 'N' });
    } },
  { id: 'vaetvient', n: 'Va-et-vient', type: 'principe', d: 'Un point lumineux commandé de deux endroits.',
    faire(f) {
      const { S, W } = constructeur(f);
      S('pot', 60, 35, { rot: POT_H, num: 'L' }); W([60, 35], [60, 40]);
      S('disj1', 60, 50, { rep: 'Q1', des: 'Éclairage 10 A' }); W([60, 60], [60, 70]);
      S('vv', 60, 80, { rot: 180, rep: 'S1' }); W([55, 90], [55, 120]); W([65, 90], [65, 120]);
      S('vv', 60, 130, { rep: 'S2' }); W([60, 140], [60, 150]);
      S('lampe', 60, 160, { rep: 'E1', des: 'Éclairage' }); W([60, 170], [60, 180]); S('pot', 60, 180, { rot: POT_B, num: 'N' });
    } },
];
function appliquerModele(sch, mid) {
  const m = MODELES.find((x) => x.id === mid); if (!m) return null;
  const f = nouveauFolio(m.n, m.type); m.faire(f);
  /* repères déjà pris dans le projet : renumérotés vers un numéro libre, sans reprendre un repère que le modèle garde */
  const pris = new Set(); for (const g of sch.folios) for (const x of g.syms) if (x.rep && x.t !== 'borne') pris.add(x.rep);
  const origines = [...new Set(f.syms.filter((x) => x.rep && x.t !== 'borne').map((x) => x.rep))];
  /* une famille (KM, S, Q…) dont un repère est déjà pris est renumérotée en entier, dans l'ordre du modèle */
  const pre = (r) => (r.match(/^[A-Z]+/) || [''])[0];
  const familles = new Set(origines.filter((r) => pris.has(r)).map(pre));
  const occupes = new Set([...pris, ...origines.filter((r) => !familles.has(pre(r)))]);
  const ren = new Map();
  for (const r of origines) {
    if (!familles.has(pre(r))) { ren.set(r, r); continue; }
    let n = 1; while (occupes.has(pre(r) + n)) n++;
    ren.set(r, pre(r) + n); occupes.add(pre(r) + n);
  }
  for (const x of f.syms) if (x.rep && x.t !== 'borne') x.rep = ren.get(x.rep);
  const bx = sch.folios.some((g) => g.syms.some((x) => x.t === 'borne' && x.rep === 'X1'));
  if (bx) { const nr = prochainRepere({ folios: sch.folios.map((g) => ({ syms: g.syms.filter((x) => x.t === 'borne') })) }, 'X'); for (const s of f.syms) if (s.t === 'borne') s.rep = nr; }
  sch.folios.push(f);
  return f;
}

/* ---------------- point de départ depuis le tableau électrique du plan ----------------
   Schéma multifilaire (phase, neutre) : interrupteurs différentiels, puis un disjoncteur 1P+N par circuit, avec la
   désignation, le calibre et la section du tableau. Deux différentiels par folio. Copie modifiable : le tableau du plan
   n'est pas lié ensuite (une nouvelle importation crée de nouveaux folios). */
function depuisTableau(sch, plan, libelles) {
  const L = libelles || {};
  const nums = L.reperes || new Map((plan.circuits || []).map((c, i) => [c.id, 'C' + (i + 1)]));
  const rn = new Map((plan.rcds || []).map((r, i) => [r.id, 'ID' + (i + 1)]));
  const groupes = (plan.rcds || []).map((r) => ({ r, cs: (plan.circuits || []).filter((c) => c.rcd === r.id) }));
  const sans = (plan.circuits || []).filter((c) => !(plan.rcds || []).some((r) => r.id === c.rcd));
  if (sans.length) groupes.push({ r: null, cs: sans });
  const morceaux = []; for (const g of groupes) for (let i = 0; i < Math.max(1, g.cs.length); i += 8) morceaux.push({ r: g.r, cs: g.cs.slice(i, i + 8), suite: i > 0 });
  const crees = [];
  let q = 0; for (const f of sch.folios) for (const s of f.syms) q = Math.max(q, numRep(s.rep, 'Q'));
  for (let k = 0; k < morceaux.length; k += 2) {
    const f = nouveauFolio(`Distribution — tableau ${Math.floor(k / 2) + 1}`, 'distribution');
    const { S, W, TX } = constructeur(f);
    if (k === 0 && L.arrivee) TX(L.arrivee, 20, 24, { taille: 3, align: 'left' });
    morceaux.slice(k, k + 2).forEach((m, j) => {
      const x0 = 25 + j * 195;
      S('pot', x0, 38, { rot: POT_H, num: 'L' }); S('pot', x0 + 10, 38, { rot: POT_H, num: 'N' });
      let yb = 38;
      if (m.r) {
        W([x0, 38], [x0, 50]); W([x0 + 10, 38], [x0 + 10, 50]);
        S('id2', x0, 60, { rep: 'Q' + (++q), des: `${rn.get(m.r.id)} · 30 mA type ${m.r.type} · ${m.r.cal} A${m.suite ? ' (suite)' : ''}` });
        yb = 70;
      }
      const n = Math.max(1, m.cs.length), xl = x0 + (n - 1) * 20;
      W([x0, yb], [x0, 80], [xl, 80]); W([x0 + 10, yb], [x0 + 10, 85], [xl + 10, 85]);
      m.cs.forEach((c, i) => {
        const x = x0 + i * 20;
        if (i > 0) W([x, 80], [x, 90]); else W([x, 80], [x, 90]);
        W([x + 10, 85], [x + 10, 90]);
        S('disj2', x, 100, { rep: 'Q' + (++q), des: `${nums.get(c.id) || ''} · ${c.cal || '?'} A`.trim() });
        W([x, 110], [x, 125]); W([x + 10, 110], [x + 10, 125]);
        TX(`${nums.get(c.id) || ''} ${c.name || ''}`.trim(), x + 5, 132, { taille: 2.4, rot: 270, align: 'left' });
        TX(`${c.sec ? String(c.sec).replace('.', ',') + ' mm²' : 'section ?'}`, x + 5, 127, { taille: 2, align: 'center' });
      });
      if (!m.cs.length) TX('Aucun circuit', x0 + 5, 100, { taille: 2.5 });
    });
    sch.folios.push(f); crees.push(f);
  }
  return crees;
}

/* ---------------- dessin d'un folio (écran, PDF, SVG, DXF) ----------------
   c : contexte canvas en millimètres. o : { cartouche: { projet, client, date, indice }, couleurs, sel: Set d'ids, exporter } */
const COUL = { ink: '#1D2125', ink2: '#5C656C', ink3: '#8A939A', fil: '#1D2125', sel: '#D24F1A', cadre: '#1D2125', fond: '#FFFFFF', jonction: '#1D2125', pot: '#2356C4' };
function dessinerFolio(c, sch, fi, o) {
  o = o || {};
  const K = Object.assign({}, COUL, o.couleurs || {});
  const f = sch.folios[fi]; if (!f) return;
  const app = o.app || appareils(sch), eq = o.eq || equipotentielles(sch), rv = renvois(sch);
  const cal = (n) => { if (c.calque) c.calque(n); };
  const T = (s, x, y, taille, gras, align, coul, base) => { c.font = `${gras ? 'bold ' : ''}${taille}px Helvetica, Arial, sans-serif`; c.textAlign = align || 'left'; c.textBaseline = base || 'middle'; c.fillStyle = coul || K.ink; c.fillText(s, x, y); };
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
  /* feuille, cadre, colonnes, cartouche */
  cal('SCH_CADRE');
  if (!o.exporter) { c.fillStyle = K.fond; c.fillRect(0, 0, FEUILLE.W, FEUILLE.H); }
  c.strokeStyle = K.cadre; c.lineWidth = 0.5; c.strokeRect(FEUILLE.M, FEUILLE.M, FEUILLE.W - 2 * FEUILLE.M, FEUILLE.H - 2 * FEUILLE.M);
  c.lineWidth = 0.25;
  c.beginPath(); c.moveTo(ZONE.x0, ZONE.y0); c.lineTo(ZONE.x1, ZONE.y0); c.stroke();
  for (let i = 1; i < FEUILLE.NCOL; i++) { const x = ZONE.x0 + i * LCOL; c.beginPath(); c.moveTo(x, FEUILLE.M); c.lineTo(x, ZONE.y0); c.stroke(); }
  for (let i = 0; i < FEUILLE.NCOL; i++) T(String(i + 1), ZONE.x0 + (i + 0.5) * LCOL, FEUILLE.M + FEUILLE.BANDE / 2, 3, true, 'center');
  const cy = ZONE.y1, ca = o.cartouche || {};
  c.lineWidth = 0.5; c.beginPath(); c.moveTo(FEUILLE.M, cy); c.lineTo(FEUILLE.W - FEUILLE.M, cy); c.stroke();
  c.lineWidth = 0.25;
  const colsC = [FEUILLE.M, 70, 190, 300, 360, FEUILLE.W - FEUILLE.M];
  for (const x of colsC.slice(1, -1)) { c.beginPath(); c.moveTo(x, cy); c.lineTo(x, FEUILLE.H - FEUILLE.M); c.stroke(); }
  T('CALQUE', 14, cy + 7, 4, true); T('Schéma électrique', 14, cy + 14, 2.6, false, 'left', K.ink2);
  T(ca.projet || 'Projet', 74, cy + 8, 3.6, true); T(ca.client || '', 74, cy + 16, 2.6, false, 'left', K.ink2); T(ca.affaire || '', 74, cy + 22, 2.4, false, 'left', K.ink2);
  T(f.titre || '', 194, cy + 8, 3.6, true); T(TYPES_FOLIO[f.type] || '', 194, cy + 16, 2.6, false, 'left', K.ink2);
  T('Date', 304, cy + 7, 2.4, false, 'left', K.ink2); T(ca.date || '', 304, cy + 14, 2.8); T('Indice ' + (ca.indice || '—'), 304, cy + 22, 2.6);
  T('Folio', 364, cy + 7, 2.4, false, 'left', K.ink2); T(`${fi + 1} / ${sch.folios.length}`, 364, cy + 17, 6, true);
  /* fils */
  cal('SCH_FILS');
  c.lineWidth = 0.35; c.strokeStyle = K.fil;
  for (const w of f.fils) {
    if (w.pts.length < 2) continue;
    c.strokeStyle = o.sel && o.sel.has(w.id) ? K.sel : K.fil; c.lineWidth = o.sel && o.sel.has(w.id) ? 0.7 : 0.35;
    c.beginPath(); c.moveTo(w.pts[0].x, w.pts[0].y); for (const p of w.pts.slice(1)) c.lineTo(p.x, p.y); c.stroke();
  }
  /* points de jonction : bout de fil sur un autre fil, ou point commun à trois fils ou plus */
  cal('SCH_JONCTIONS');
  const compte = new Map(), cleP = (p) => `${Math.round(p.x * 10)}|${Math.round(p.y * 10)}`;
  for (const w of f.fils) w.pts.forEach((p, i) => { const k = cleP(p); compte.set(k, (compte.get(k) || 0) + (i === 0 || i === w.pts.length - 1 ? 1 : 2)); });
  c.fillStyle = K.jonction;
  const dot = (p) => { c.beginPath(); c.arc(p.x, p.y, 0.7, 0, Math.PI * 2); c.fill(); };
  for (const w of f.fils) for (const p of [w.pts[0], w.pts[w.pts.length - 1]]) {
    if ((compte.get(cleP(p)) || 0) >= 3) { dot(p); continue; }
    if (f.fils.some((v) => v !== w && v.pts.some((q, i) => i > 0 && surSegment(p, v.pts[i - 1], q)))) dot(p);
  }
  /* numéros de fils (sur le plus long tronçon de chaque fil) */
  cal('SCH_NUMEROS');
  for (const w of f.fils) {
    const n = eq.parFil.get(w.id); if (!n) continue;
    let bi = 1, bl = -1; for (let i = 1; i < w.pts.length; i++) { const l = Math.hypot(w.pts[i].x - w.pts[i - 1].x, w.pts[i].y - w.pts[i - 1].y); if (l > bl) { bl = l; bi = i; } }
    if (bl < 6) continue;
    const a = w.pts[bi - 1], b = w.pts[bi], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    c.save(); c.translate(m.x, m.y); if (Math.abs(a.x - b.x) < 0.01) c.rotate(-Math.PI / 2);
    T(n.nom, 0, -1.2, 2, false, 'center', n.auto ? K.ink2 : K.pot, 'bottom'); c.restore();
  }
  /* symboles et leurs repères */
  cal('SCH_SYMBOLES');
  for (const s of f.syms) dessinerSymbole(c, s, o.sel && o.sel.has(s.id) ? K.sel : K.ink);
  cal('SCH_REPERES');
  for (const s of f.syms) {
    const d = SYM_BY.get(s.t); if (!d) continue;
    const bx = boiteDe(s);
    if (d.role === 'pot' || d.role === 'renvoi') {
      /* nom dans l'étiquette (le long de l'étiquette, toujours lisible) */
      const r = ((s.rot || 0) % 360 + 360) % 360, verti = r === 90 || r === 270;
      const cx = (bx.x0 + bx.x1) / 2, cyy = (bx.y0 + bx.y1) / 2;
      c.save(); c.translate(cx, cyy); if (verti) c.rotate(-Math.PI / 2); T(s.num || '?', 0, 0, 2.4, true, 'center', K.pot); c.restore();
      if (d.role === 'renvoi' && s.num) { const autres = (rv.get(String(s.num).trim()) || []).filter((x) => x.s !== s).map((x) => x.pos); T(autres.length ? '→ ' + autres.join(', ') : '→ ?', bx.x1 + 1, cyy, 2.2, false, 'left', autres.length ? K.ink : K.sel); }
      continue;
    }
    if (d.role === 'borne') { T(`${s.rep || 'X?'}:${s.num || '?'}`, bx.x1 + 0.8, s.y, 2.2, true); continue; }
    let y = bx.y0 + 2;
    if (s.rep) { T(s.rep, bx.x1 + 1.2, y, 2.8, true); y += 3.3; }
    if (s.des) { for (const l of String(s.des).split('\n').slice(0, 2)) { T(l.length > 34 ? l.slice(0, 33) + '…' : l, bx.x1 + 1.2, y, 2.1, false, 'left', K.ink2); y += 2.8; } }
    /* renvoi croisé d'un contact vers sa bobine */
    if (d.role === 'contact' && s.rep) { const a = app.get(s.rep); const b = a && (a.bobines[0] || a.autres[0]); if (b && b.s !== s) { T(`(${b.pos})`, bx.x1 + 1.2, y, 2.1, false, 'left', K.pot); y += 2.8; } }
    /* noms des bornes */
    const noms = nomsBornes(s, app), bs = bornesDe(s), ccx = (bx.x0 + bx.x1) / 2, ccy = (bx.y0 + bx.y1) / 2;
    if (!['pot', 'renvoi', 'borne'].includes(d.role) && d.t !== 'terre') bs.forEach((b, i) => {
      const nm = noms[i]; if (!nm) return;
      const haut = b.y < ccy - 0.1, bas = b.y > ccy + 0.1;
      if (haut || bas) T(nm, b.x - 0.8, b.y + (haut ? 2.4 : -2.4), 1.7, false, 'right', K.ink3);
      else T(nm, b.x + (b.x < ccx ? 2 : -2), b.y - 1.5, 1.7, false, b.x < ccx ? 'left' : 'right', K.ink3);
    });
    /* tableau des contacts sous une bobine : bornes et position */
    if (d.role === 'bobine' && s.rep) {
      const a = app.get(s.rep), cs = a ? a.contacts : [];
      /* à gauche de la bobine, hors du fil qui la traverse */
      let yy = s.y - Math.min(cs.length, 8) * 1.25 + 1.25;
      for (const e of cs.slice(0, 8)) {
        const lib = e.d.type === 'P' ? `${e.d.pp || ''} pôles` : `${e.num ? e.num.join('-') : ''} ${e.d.type}`;
        T(`${lib}  ${e.pos}`, bx.x0 - 1.5, yy, 1.9, false, 'right', K.pot); yy += 2.5;
      }
    }
  }
  /* textes libres */
  cal('SCH_TEXTES');
  for (const t of f.textes) {
    c.save(); c.translate(t.x, t.y); if (t.rot) c.rotate((-t.rot * Math.PI) / 180);
    T(t.s, 0, 0, t.taille || 3, !!t.gras, t.align || 'center', o.sel && o.sel.has(t.id) ? K.sel : K.ink); c.restore();
  }
  c.restore();
}

/* ---------------- nettoyage (migration v14, import) ---------------- */
const num = (v) => typeof v === 'number' && Number.isFinite(v);
const txt = (v, n) => (typeof v === 'string' ? v.replace(/[\u0000-\u0009\u000b-\u001f]/g, ' ').slice(0, n || 80) : '');
function nettoyerSchemas(s) {
  const out = { folios: [] };
  if (!s || typeof s !== 'object' || !Array.isArray(s.folios)) return out;
  for (const f of s.folios.slice(0, 200)) {
    if (!f || typeof f !== 'object' || typeof f.id !== 'string') continue;
    const g = { id: f.id, titre: txt(f.titre, 80) || 'Folio', type: TYPES_FOLIO[f.type] ? f.type : 'libre', syms: [], fils: [], textes: [] };
    for (const x of Array.isArray(f.syms) ? f.syms : []) {
      if (!x || typeof x.id !== 'string' || !SYM_BY.has(x.t) || !num(x.x) || !num(x.y)) continue;
      const y = { id: x.id, t: x.t, x: x.x, y: x.y, rot: [0, 90, 180, 270].includes(x.rot) ? x.rot : 0 };
      if (x.mir === true) y.mir = true;
      for (const k of ['rep', 'num', 'ref']) if (txt(x[k], 30)) y[k] = txt(x[k], 30);
      if (txt(x.des, 120)) y.des = txt(x.des, 120);
      g.syms.push(y);
    }
    for (const w of Array.isArray(f.fils) ? f.fils : []) {
      if (!w || typeof w.id !== 'string' || !Array.isArray(w.pts)) continue;
      const pts = w.pts.filter((p) => p && num(p.x) && num(p.y)).map((p) => ({ x: p.x, y: p.y }));
      if (pts.length < 2) continue;
      const v = { id: w.id, pts }; if (txt(w.num, 20)) v.num = txt(w.num, 20);
      g.fils.push(v);
    }
    for (const t of Array.isArray(f.textes) ? f.textes : []) {
      if (!t || typeof t.id !== 'string' || !num(t.x) || !num(t.y) || !txt(t.s, 200)) continue;
      const u = { id: t.id, x: t.x, y: t.y, s: txt(t.s, 200), taille: num(t.taille) && t.taille >= 1.5 && t.taille <= 20 ? t.taille : 3 };
      if ([90, 180, 270].includes(t.rot)) u.rot = t.rot;
      if (t.gras === true) u.gras = true;
      if (['left', 'center', 'right'].includes(t.align)) u.align = t.align;
      g.textes.push(u);
    }
    out.folios.push(g);
  }
  return out;
}

export { FAMILLES };
export { COUL, FEUILLE, LCOL, MODELES, TYPES_FOLIO, ZONE, appareils, appliquerModele, borniers, colonne, controlesSchema, depuisTableau, dessinerFolio, enL,
  equipotentielles, insererSurFil, listeFils, nettoyerSchemas, nomenclature, nomsBornes, nouveauFolio, position, prochainNumBorne, prochainRepere,
  renvois, repereNouveau, schemasDe, simplifier, surSegment };

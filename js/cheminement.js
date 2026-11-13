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
  cloison: { n: 'Encastrée dans la cloison', court: 'Cloison', note: 'Dans l’épaisseur d’un mur ou d’une cloison, à la hauteur indiquée : la gaine suit la cloison sans la traverser (les angles de mur ne comptent pas comme des percements).' },
};
/* poses dont le parcours horizontal est à une hauteur saisie (z, en cm au-dessus du sol fini) */
const poseAHauteur = (pose) => pose === 'hauteur' || pose === 'cloison';
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
  if (poseAHauteur(d.pose) && isNum(d.z)) return d.z;
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

/* ---------------- réseau des cheminements (graphe) ----------------
   Nœuds : sommets des gaines électriques (à la hauteur de leur parcours), symboles raccordés (à leur hauteur de pose),
   points de jonction. Arêtes : tronçons horizontaux, verticales (gaine ↔ symbole), jonctions entre gaines,
   passages entre étages (différence d'altitude entre les parcours des deux niveaux). Distances en cm. */
const TOL_JONCTION = 3; // cm : une extrémité libre à moins de 3 cm d'une autre gaine s'y raccorde
/* symboles que le câble d'un autre circuit peut traverser (boîte, passage, gaine technique, tableau) */
/* boîtes de dérivation (au plafond ou murale) : points de connexion, sans circuit propre */
const DERIVATIONS = new Set(['derivation', 'derivation_mur']);
const PASSIFS = new Set(['tableau', 'tab_div', ...DERIVATIONS, 'gtl', TRAVERSEE]);
const GCACHE = new WeakMap();
function signature(plan) {
  return JSON.stringify([(plan.circuits || []).map((c) => c.id), (plan.ducts || []).filter(isElecDuct), (plan.elec || []).map((e) => [e.id, e.lv, e.type, e.x, e.y, e.rot, e.h, e.to, e.cid]), (plan.levels || []).map((l) => [l.id, l.elev, l.h])]);
}
function grapheGaines(plan) {
  const sig = signature(plan), hit = GCACHE.get(plan);
  if (hit && hit.sig === sig) return hit.G;
  const E = indexElec(plan);
  const nodes = new Map(), adj = new Map(), edges = [];
  const node = (id, o) => { if (!nodes.has(id)) { nodes.set(id, o); adj.set(id, []); } return id; };
  const edge = (a, b, h, v, o = {}) => { const e = { id: edges.length, a, b, h, v, duct: o.duct || null, inc: o.inc || 0, kind: o.kind || 'h' }; edges.push(e); adj.get(a).push(e); adj.get(b).push(e); return e; };
  const hubs = new Map(); // passages et GTL : extrémités de gaines reliées entre elles
  const vertsByLv = new Map(); // pour les jonctions
  const ducts = (plan.ducts || []).filter((d) => isElecDuct(d) && Array.isArray(d.pts) && d.pts.length >= 2);
  for (const d of ducts) {
    const L = niveau(plan, d.lv), base = altNiveau(L), zr = hauteurParcours(plan, d);
    const Z = zr == null ? null : base + zr;
    const pts = pointsGaine(plan, d, E);
    const ids = pts.map((p, k) => node(`v:${d.id}:${k}`, { lv: d.lv, x: p.x, y: p.y, Z, duct: d.id }));
    for (let k = 1; k < ids.length; k++) edge(ids[k - 1], ids[k], dist(pts[k - 1], pts[k]), 0, { duct: d.id });
    if (!vertsByLv.has(d.lv)) vertsByLv.set(d.lv, []);
    const lst = vertsByLv.get(d.lv);
    pts.forEach((p, k) => lst.push({ id: ids[k], d, k, p, Z, end: k === 0 || k === pts.length - 1 }));
    for (const [key, k] of [['a', 0], ['b', pts.length - 1]]) {
      const e = d[key] && E.get(d[key]);
      if (!e || e.lv !== d.lv) continue;
      const hs = hauteurSymbole(plan, e);
      const se = node('e:' + e.id, { lv: e.lv, x: pts[k].x, y: pts[k].y, Z: hs && !hs.libre ? base + hs.z : null, sym: e.id });
      if (hs && hs.libre) {
        const tw = jumelle(plan, e, E);
        const hk = tw ? [e.id, tw.id].sort().join('|') : e.id;
        if (!hubs.has(hk)) hubs.set(hk, []);
        hubs.get(hk).push({ id: ids[k], Z, p: pts[k] });
        edge(ids[k], se, 0, 0, { kind: 'sym' });
      } else if (!hs || Z == null) edge(ids[k], se, 0, 0, { kind: 'vert', inc: 1 });
      else edge(ids[k], se, 0, Math.abs(base + hs.z - Z), { kind: 'vert' });
    }
  }
  /* passages : chaque extrémité raccordée est reliée aux autres (verticale = différence d'altitude des parcours) */
  for (const l of hubs.values()) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
    const u = l[i], w = l[j];
    if (u.Z == null || w.Z == null) edge(u.id, w.id, dist(u.p, w.p), 0, { kind: 'pass', inc: 1 });
    else edge(u.id, w.id, dist(u.p, w.p), Math.abs(u.Z - w.Z), { kind: 'pass' });
  }
  /* jonctions : extrémité libre posée sur un sommet ou un tronçon d'une autre gaine du même niveau */
  for (const lst of vertsByLv.values()) {
    for (const u of lst) {
      if (!u.end || (u.k === 0 ? u.d.a : u.d.b)) continue;
      const vz = (w) => (u.Z == null || w == null ? { v: 0, inc: 1 } : { v: Math.abs(u.Z - w), inc: 0 });
      /* un bout libre peut toucher plusieurs gaines (le sommet de l'une, le milieu d'une autre) : toutes sont reliées,
         car elles ne servent pas forcément aux mêmes circuits */
      const jointes = new Set();
      for (const w of lst) {
        if (w.d === u.d || dist(u.p, w.p) > TOL_JONCTION) continue;
        const z = vz(w.Z); edge(u.id, w.id, dist(u.p, w.p), z.v, { kind: 'jonction', inc: z.inc }); jointes.add(w.d);
      }
      for (const d of ducts) {
        if (d === u.d || d.lv !== u.d.lv || jointes.has(d)) continue;
        let joint = false;
        const pts = pointsGaine(plan, d, E);
        for (let k = 1; k < pts.length; k++) {
          const A = pts[k - 1], B = pts[k], L2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2; if (!L2) continue;
          const t = ((u.p.x - A.x) * (B.x - A.x) + (u.p.y - A.y) * (B.y - A.y)) / L2;
          if (t <= 0 || t >= 1) continue;
          const q = { x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) };
          if (dist(q, u.p) > TOL_JONCTION) continue;
          const Zd = hauteurParcours(plan, d) == null ? null : altNiveau(niveau(plan, d.lv)) + hauteurParcours(plan, d);
          const sid = node(`j:${u.id}:${d.id}:${k}`, { lv: d.lv, x: q.x, y: q.y, Z: Zd, duct: d.id });
          edge(`v:${d.id}:${k - 1}`, sid, dist(A, q), 0, { duct: d.id });
          edge(sid, `v:${d.id}:${k}`, dist(q, B), 0, { duct: d.id });
          const z = vz(Zd); edge(u.id, sid, dist(u.p, q), z.v, { kind: 'jonction', inc: z.inc });
          joint = true; break;
        }
      }
    }
  }
  /* circuits portés par chaque gaine, sans ceux qui n'existent plus (circuit supprimé, tableau régénéré) :
     une gaine dont tous les circuits ont disparu redevient utilisable par tous */
  const valides = new Set((plan.circuits || []).map((c) => c.id));
  const portes = new Map(ducts.map((d) => [d.id, circuitsDe(d).filter((id) => valides.has(id))]));
  const G = { nodes, adj, edges, ducts: new Map(ducts.map((d) => [d.id, d])), portes, E };
  GCACHE.set(plan, { sig, G });
  return G;
}
/* une gaine peut servir au circuit si elle le porte, ou si elle n'est rattachée à aucun circuit */
function gainePourCircuit(d, cid) { const l = circuitsDe(d); return !l.length || l.includes(cid); }
/* plus courts chemins depuis un nœud (Dijkstra), en ne passant que par les gaines et symboles permis au circuit */
function plusCourts(G, src, cid) {
  const D = new Map([[src, 0]]), prev = new Map(), done = new Set();
  const Q = [[0, src]];
  const passable = (id) => {
    if (!id.startsWith('e:')) return true;
    const e = G.E.get(id.slice(2));
    return !!e && (e.cid === cid || PASSIFS.has(e.type));
  };
  while (Q.length) {
    let bi = 0; for (let i = 1; i < Q.length; i++) if (Q[i][0] < Q[bi][0]) bi = i;
    const [du, u] = Q.splice(bi, 1)[0];
    if (done.has(u)) continue; done.add(u);
    if (u !== src && !passable(u)) continue; // on peut y arriver, pas en repartir
    for (const e of G.adj.get(u) || []) {
      if (e.duct && cid) { const l = G.portes ? G.portes.get(e.duct) : circuitsDe(G.ducts.get(e.duct)); if (l && l.length && !l.includes(cid)) continue; }
      const w = e.a === u ? e.b : e.a, nd = du + e.h + e.v;
      if (nd < (D.has(w) ? D.get(w) : Infinity) - 1e-9) { D.set(w, nd); prev.set(w, e); Q.push([nd, w]); }
    }
  }
  return { D, prev };
}
function tableauDu(plan) { return (plan.elec || []).find((e) => e.type === 'tableau') || null; }
function point3(plan, e) { const a = ancrage(e), hs = hauteurSymbole(plan, e), L = niveau(plan, e.lv); return { x: a.x, y: a.y, Z: altNiveau(L) + (hs && !hs.libre ? hs.z : 0) }; }
/* longueurs d'un circuit, depuis le tableau principal, en suivant les gaines :
   - geo : distance à vol d'oiseau (en ligne droite dans l'espace) jusqu'au point le plus éloigné, pour comparaison ;
   - Lmax : longueur de cheminement jusqu'au point le plus éloigné (verticales comprises) — sert à la chute de tension ;
   - arbre : longueur totale de câble pour desservir tous les points (réunion des chemins) ;
   - complet : tous les points du circuit sont atteints par les gaines. Distances en cm. */
function cheminCircuit(plan, cid) {
  const T = tableauDu(plan);
  const pts = (plan.elec || []).filter((e) => e.cid === cid && e.type !== TRAVERSEE);
  const out = { cid, tableau: T ? T.id : null, points: [], atteints: 0, nonAtteints: [], Lmax: null, Lgeo: null, arbre: null, horiz: 0, vert: 0, inconnues: 0, ducts: [], edges: [], complet: false, raison: null };
  if (!T) { out.raison = 'Aucun tableau électrique sur le plan.'; return out; }
  if (!pts.length) { out.raison = 'Aucun symbole n’est relié à ce circuit.'; return out; }
  const G = grapheGaines(plan);
  const src = 'e:' + T.id;
  const sp = G.nodes.has(src) ? plusCourts(G, src, cid) : { D: new Map(), prev: new Map() };
  const P0 = point3(plan, T), used = new Map();
  let geoMax = 0;
  for (const e of pts) {
    const q = point3(plan, e), g = Math.hypot(q.x - P0.x, q.y - P0.y, q.Z - P0.Z);
    geoMax = Math.max(geoMax, g);
    const id = 'e:' + e.id, d = sp.D.has(id) ? sp.D.get(id) : null;
    out.points.push({ id: e.id, type: e.type, lv: e.lv, dist: d, geo: g });
    if (d == null) { out.nonAtteints.push(e.id); continue; }
    out.atteints++;
    for (let n = id; n !== src;) { const ed = sp.prev.get(n); used.set(ed.id, ed); n = ed.a === n ? ed.b : ed.a; }
  }
  out.Lgeo = geoMax;
  const reach = out.points.filter((x) => x.dist != null);
  if (reach.length) out.Lmax = Math.max(...reach.map((x) => x.dist));
  if (used.size) {
    const es = [...used.values()];
    out.horiz = es.reduce((s, e) => s + e.h, 0); out.vert = es.reduce((s, e) => s + e.v, 0);
    out.arbre = out.horiz + out.vert; out.inconnues = es.reduce((s, e) => s + e.inc, 0);
    out.ducts = [...new Set(es.map((e) => e.duct).filter(Boolean))];
    out.edges = es;
  }
  out.complet = !out.nonAtteints.length;
  if (!out.complet) out.raison = out.atteints ? `${out.nonAtteints.length} point${out.nonAtteints.length > 1 ? 's' : ''} sur ${pts.length} non raccordé${out.nonAtteints.length > 1 ? 's' : ''} au tableau par les gaines.` : 'Aucun point du circuit n’est raccordé au tableau par les gaines.';
  return out;
}
/* réserve de câble à commander, en % : celle de l'installation, sinon la valeur par défaut de Calque (« estimée ») */
function reserveDe(plan) {
  const r = plan && plan.install && plan.install.reserve;
  return r && isNum(r.v) && r.v >= 0 && r.v <= 100 ? r : RESERVE_DEFAUT;
}
/* longueur à commander (m, arrondie au mètre supérieur) pour une longueur de câble en cm */
function aCommander(cm, reserve) { return cm == null ? null : Math.ceil((cm / 100) * (1 + reserve.v / 100) - 1e-9); }
/* longueur L pour la fiche de calcul (m) : donnée « estimée » depuis le plan, ou null avec la raison */
function longueurDuPlan(plan, cid) {
  const ch = cheminCircuit(plan, cid);
  if (!ch.complet || !(ch.Lmax > 0)) return { L: null, ch };
  const n = ch.points.length;
  let src = `Cheminement du plan : tableau → point le plus éloigné (${n} point${n > 1 ? 's' : ''}, verticales comprises)`;
  if (ch.inconnues) src += ` ; ${ch.inconnues} verticale${ch.inconnues > 1 ? 's' : ''} non comptée${ch.inconnues > 1 ? 's' : ''} (pose non précisée)`;
  return { L: { v: Math.round(ch.Lmax) / 100, st: 'estimee', src }, ch };
}

/* ---------------- longueur d'un tracé saisie ----------------
   Nouveaux points d'une polyligne de longueur L (cm), en gardant le bout de départ : le dernier tronçon s'allonge dans
   son prolongement, ou le tracé est raccourci en retirant ce qui dépasse (coudes compris). depuisFin : on garde le bout
   d'arrivée et c'est le départ qui bouge. Renvoie null si le tracé n'a pas de longueur ou si L n'est pas valide. */
function tracerALongueur(pts, L, depuisFin) {
  if (!Array.isArray(pts) || pts.length < 2 || !(L > 0)) return null;
  const P0 = depuisFin ? pts.slice().reverse() : pts.slice();
  const out = [{ x: P0[0].x, y: P0[0].y }];
  let reste = L;
  for (let i = 1; i < P0.length; i++) {
    const a = P0[i - 1], b = P0[i], l = dist(a, b);
    if (l < 1e-9) continue;
    const dernier = i === P0.length - 1;
    if (reste <= l + 1e-9 || dernier) {
      const k = reste / l; // > 1 sur le dernier tronçon : prolongement
      out.push({ x: Math.round((a.x + (b.x - a.x) * k) * 10) / 10, y: Math.round((a.y + (b.y - a.y) * k) * 10) / 10 });
      reste = 0; break;
    }
    out.push({ x: b.x, y: b.y }); reste -= l;
  }
  if (out.length < 2 || longueurPolyligne(out) < 0.5) return null;
  return depuisFin ? out.reverse() : out;
}

/* ---------------- nettoyage (migration et import) ---------------- */
/* champs v6 d'une gaine électrique : kind, pose, z (cm), lw / lh (mm), cids. Valeur invalide → retirée (rien de deviné). */
function nettoyerGaine(d) {
  if (!d || typeof d !== 'object') return d;
  if ('kind' in d && !KINDS.includes(d.kind)) delete d.kind;
  if ('pose' in d && !POSE_IDS.includes(d.pose)) delete d.pose;
  if ('z' in d && !(isNum(d.z) && d.z >= 0 && d.z <= 2000)) delete d.z;
  if ('z' in d && !poseAHauteur(d.pose)) delete d.z; // hauteur seulement pour une pose « à une hauteur » ou « dans la cloison »
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

export { DERIVATIONS, poseAHauteur, tracerALongueur };
export { KINDS, PASSIFS, aCommander, cheminCircuit, grapheGaines, gainePourCircuit, longueurDuPlan, plusCourts, reserveDe, tableauDu, POSES, POSE_IDS, RESERVE_DEFAUT, TRAVERSEE, TYPES_CHEMIN, altNiveau, ancrage, circuitsDe, hauteurNiveau,
  hauteurParcours, hauteurSymbole, indexElec, isElecDuct, jumelle, kindOf, longueurGaine, longueurPolyligne, niveau,
  nettoyerGaine, nettoyerZone, nomChemin, pointsGaine, sectionNominale, tailleChemin, typeChemin };

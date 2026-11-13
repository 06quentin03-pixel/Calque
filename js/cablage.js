/* Calque — module « cablage » : moteur de câblage. JavaScript pur, sans accès à l'écran : testable avec Node.
   Le plan n'est jamais modifié.

   Pour chaque circuit, le moteur reprend l'arbre des cheminements (tableau → chaque point, le long des gaines :
   cheminement.js) et reconstitue les CONDUCTEURS qui passent dans chaque tronçon, d'après des « réseaux logiques » :
   - phase, neutre et terre de l'alimentation ;
   - retour de lampe de chaque groupe d'éclairage (commande → luminaires reliés par l'outil Liaison) ;
   - navettes entre deux va-et-vient (et permutateurs) ;
   - fil de commande des télérupteurs (boutons-poussoirs → tableau) ;
   - fil pilote du chauffage (si un programmateur ou un gestionnaire d'énergie est posé) ;
   - montée et descente des volets roulants (commande la plus proche).
   Un conducteur d'un réseau passe dans un tronçon quand le réseau a des extrémités des deux côtés du tronçon.

   Tout ce qui sort de ce module est ESTIMÉ (schéma de câblage usuel, câblage en étoile depuis le tableau en suivant
   les gaines) : à adapter au schéma réel. Ce n'est ni une note de calcul ni une validation réglementaire. */
import { isNum } from './noyau.js';
import { cheminCircuit, circuitsDe, grapheGaines, isElecDuct, kindOf, plusCourts, tableauDu, TRAVERSEE } from './cheminement.js';
import { CMDS, LIGHTS, LIGHT_ACC, LINK_TARGETS } from './elecdonnees.js';

/* ---------------- fonctions des conducteurs ----------------
   Couleurs : neutre bleu clair et conducteur de protection vert/jaune (règle générale d'identification) ;
   les autres couleurs sont des usages courants proposés par Calque, pas des exigences. */
const FONCTIONS = {
  L: { n: 'Phase', abr: 'Ph', col: '#8B4513', coul: 'marron, rouge ou noir', ordre: 1 },
  L1: { n: 'Phase L1', abr: 'L1', col: '#8B4513', coul: 'marron', ordre: 1 },
  L2: { n: 'Phase L2', abr: 'L2', col: '#1D1D1D', coul: 'noir', ordre: 2 },
  L3: { n: 'Phase L3', abr: 'L3', col: '#7A7A7A', coul: 'gris', ordre: 3 },
  N: { n: 'Neutre', abr: 'N', col: '#4F9BE0', coul: 'bleu clair', ordre: 4 },
  PE: { n: 'Protection (terre)', abr: 'PE', col: '#3FA34D', coul: 'vert/jaune', ordre: 5 },
  R: { n: 'Retour de lampe', abr: 'R', col: '#E07B1F', coul: 'orange ou violet (usage)', ordre: 6 },
  NAV: { n: 'Navette', abr: 'Nav', col: '#8E44AD', coul: 'violet ou orange (usage)', ordre: 7 },
  CMD: { n: 'Commande du télérupteur', abr: 'Cde', col: '#C0392B', coul: 'au choix (hors bleu et vert/jaune)', ordre: 8 },
  FP: { n: 'Fil pilote', abr: 'FP', col: '#222222', coul: 'noir ou gris (usage)', ordre: 9 },
  M: { n: 'Montée (volet)', abr: 'M', col: '#555555', coul: 'au choix (hors bleu et vert/jaune)', ordre: 10 },
  D: { n: 'Descente (volet)', abr: 'D', col: '#555555', coul: 'au choix (hors bleu et vert/jaune)', ordre: 11 },
};
/* types de conducteurs proposés pour un circuit (champ `cond`, format v12) */
const CONDUCTEURS = {
  h07vu: { n: 'Fils H07V-U / H07V-R sous conduit', court: 'H07V-U', fils: true },
  r2v: { n: 'Câble U-1000 R2V', court: 'R2V', fils: false },
  souple: { n: 'Câble souple H07RN-F', court: 'H07RN-F', fils: false },
};
const COND_IDS = Object.keys(CONDUCTEURS);

/* familles de commandes */
const VV = new Set(['int_vv', 'vv_double']);
const PERMUT = new Set(['permut']);
const BP = new Set(['bp', 'bp_voy', 'bouton_scen']);
const DETECT = new Set(['det_pres', 'det_plaf', 'int_crep']);
const MULTI = { int_d: 2, vv_double: 2, int_triple: 3 };
const RADIATEURS = new Set(['rad_elec', 'seche_serv_e', 'soufflant_sdb']);
const MOTEURS_VOLET = new Set(['volet_mot', 'velux_mot', 'volet_bat']);
const CMD_VOLET = new Set(['cmd_vr']);
const TRI_TYPES = new Set(['pc_tri']);

const fmtSec = (s) => (isNum(s) ? String(s).replace('.', ',') : '?');
const ROOT = '#T'; // extrémité « tableau »

/* le circuit est-il en triphasé ? (donnée de calcul ou appareil triphasé relié) */
function estTri(plan, c) {
  if (c.calc && c.calc.phase === 'tri') return true;
  return (plan.elec || []).some((e) => e.cid === c.id && TRI_TYPES.has(e.type));
}

/* ---------------- réseaux logiques d'un circuit ----------------
   Renvoie { reseaux: [{ fn, ends: Set(ids ou ROOT), groupe }], notes: [], anomalies: [] }.
   Les anomalies sont des constats de conception (pas des règles de la norme). */
function reseauxCircuit(plan, c) {
  const membres = (plan.elec || []).filter((e) => e.cid === c.id && e.type !== TRAVERSEE && e.type !== 'derivation');
  const R = [], notes = [], anomalies = [];
  const net = (fn, ends, groupe) => { const s = new Set(ends); if (s.size >= 2) R.push({ fn, ends: s, groupe: groupe || null }); };
  const ids = (l) => l.map((e) => e.id);
  const anom = (id, niveau, msg, refs) => anomalies.push({ id, niveau, msg, refs: refs || [] });
  if (!membres.length) return { reseaux: R, notes, anomalies };

  if (c.kind === 'eclairage') {
    const parId = new Map(membres.map((e) => [e.id, e]));
    const cmds = membres.filter((e) => CMDS.has(e.type));
    const lums = membres.filter((e) => LINK_TARGETS.has(e.type));
    const fixes = membres.filter((e) => !CMDS.has(e.type) && !LINK_TARGETS.has(e.type)); // BAES, prise rasoir… alimentés en permanence
    /* liaisons du circuit ; une liaison vers un autre circuit est signalée (une fois par appareil) */
    const adj = new Map(membres.map((e) => [e.id, []]));
    const ailleurs = new Set(); // éclairages commandés depuis un autre circuit (contacteur, relais)
    const mixtes = new Set();
    for (const l of plan.links || []) {
      const a = parId.get(l.a), b = parId.get(l.b);
      if (a && b) { adj.get(a.id).push(b.id); adj.get(b.id).push(a.id); continue; }
      const ici = a || b, autre = (plan.elec || []).find((e) => e.id === (a ? l.b : l.a));
      if (ici && autre && autre.cid && autre.cid !== c.id) { mixtes.add(ici.id); if (LINK_TARGETS.has(ici.type)) ailleurs.add(ici.id); }
    }
    if (mixtes.size) anom('cb_autre_circuit', 'avertissement', `${mixtes.size} appareil${mixtes.size > 1 ? 's sont reliés' : ' est relié'} à une commande ou à un éclairage d’un autre circuit : la commande doit couper la phase du circuit qui alimente l’éclairage, sauf par un contacteur ou un relais.`, [...mixtes]);
    /* groupes : composantes connexes commande ↔ luminaires */
    const vu = new Set(), groupes = [];
    for (const e of membres) {
      if (vu.has(e.id) || !(CMDS.has(e.type) || LINK_TARGETS.has(e.type))) continue;
      const pile = [e.id], g = []; vu.add(e.id);
      while (pile.length) { const id = pile.pop(); g.push(parId.get(id)); for (const w of adj.get(id) || []) if (!vu.has(w)) { vu.add(w); pile.push(w); } }
      groupes.push(g);
    }
    const phase = [ROOT], neutre = [ROOT], terre = [ROOT];
    for (const e of lums) { neutre.push(e.id); terre.push(e.id); }
    for (const e of fixes) { phase.push(e.id); neutre.push(e.id); terre.push(e.id); }
    let gi = 0;
    for (const g of groupes) {
      gi++;
      const K = g.filter((e) => CMDS.has(e.type)), L = g.filter((e) => LINK_TARGETS.has(e.type));
      if (!K.length) { // luminaire sans commande : alimenté directement (phase)
        for (const l of L) phase.push(l.id);
        if (L.every((l) => ailleurs.has(l.id))) continue;
        anom('cb_lum_sans_cmd', 'avertissement', `${L.length > 1 ? `${L.length} éclairages ne sont` : 'Un éclairage n’est'} commandé${L.length > 1 ? 's' : ''} par aucun interrupteur : reliez-${L.length > 1 ? 'les' : 'le'} à une commande (outil Liaison), sinon ${L.length > 1 ? 'ils restent' : 'il reste'} allumé${L.length > 1 ? 's' : ''} en permanence.`, ids(L));
        continue;
      }
      if (!L.length) {
        for (const k of K) phase.push(k.id);
        anom('cb_cmd_seule', 'avertissement', `${K.length > 1 ? `${K.length} commandes ne commandent` : 'Une commande ne commande'} aucun éclairage : reliez-${K.length > 1 ? 'les' : 'la'} avec l’outil Liaison.`, ids(K));
        continue;
      }
      for (const d of K) if (DETECT.has(d.type)) neutre.push(d.id); // détecteur : alimenté en phase et neutre
      const bps = K.filter((k) => BP.has(k.type)), vvs = K.filter((k) => VV.has(k.type)), perms = K.filter((k) => PERMUT.has(k.type));
      if (bps.length) {
        /* boutons-poussoirs : télérupteur au tableau (phase vers les poussoirs, fil de commande retour, retour de lampe depuis le tableau) */
        if (c.ctrl !== 'telerupteur') anom('cb_bp', 'suggestion', 'Des boutons-poussoirs commandent cet éclairage : choisissez « Télérupteur » comme commande du circuit (le télérupteur est compté au tableau).', ids(bps));
        for (const k of K) phase.push(k.id);
        net('CMD', [ROOT, ...ids(K)], gi);
        net('R', [ROOT, ...ids(L)], gi);
        notes.push(`Groupe ${gi} : télérupteur au tableau, ${K.length} bouton${K.length > 1 ? 's' : ''}-poussoir${K.length > 1 ? 's' : ''}.`);
        continue;
      }
      if (vvs.length >= 2) {
        const [A, B] = vvs;
        phase.push(A.id);
        const chaine = [A, ...perms, B];
        for (let i = 1; i < chaine.length; i++) { net('NAV', [chaine[i - 1].id, chaine[i].id], gi); net('NAV', [chaine[i - 1].id, chaine[i].id], gi); }
        net('R', [B.id, ...ids(L)], gi);
        if (vvs.length > 2) anom('cb_vv', 'avertissement', `${vvs.length} va-et-vient commandent les mêmes éclairages : au-delà de deux points de commande, utilisez des permutateurs ou un télérupteur.`, ids(vvs));
        for (const k of K) if (!VV.has(k.type) && !PERMUT.has(k.type)) { phase.push(k.id); net('R', [k.id, ...ids(L)], gi); }
        continue;
      }
      if (vvs.length === 1 && K.length === 1) anom('cb_vv', 'avertissement', 'Un va-et-vient est seul : il lui faut un second va-et-vient relié aux mêmes éclairages (ou utilisez un interrupteur simple).', ids(vvs));
      if (perms.length) anom('cb_vv', 'avertissement', 'Un permutateur n’a de sens qu’entre deux va-et-vient reliés aux mêmes éclairages.', ids(perms));
      /* commandes simples (et double allumage : éclairages répartis entre les touches) */
      for (const k of K) {
        phase.push(k.id);
        const nb = Math.min(MULTI[k.type] || 1, L.length);
        if (nb <= 1) { net('R', [k.id, ...ids(L)], gi); continue; }
        const part = Array.from({ length: nb }, () => []);
        L.forEach((l, i) => part[i % nb].push(l.id));
        for (const p of part) net('R', [k.id, ...p], gi);
        notes.push(`Groupe ${gi} : ${nb} allumages, éclairages répartis entre les touches (à adapter).`);
      }
    }
    net('L', phase); net('N', neutre); net('PE', terre);
    return { reseaux: R, notes, anomalies: fusionner(anomalies) };
  }

  /* autres circuits : alimentation de chaque point */
  const tri = estTri(plan, c);
  const pts = membres.slice();
  let alim = pts;
  if (c.kind === 'volets' || pts.some((e) => CMD_VOLET.has(e.type))) {
    const moteurs = pts.filter((e) => MOTEURS_VOLET.has(e.type)), cmds = pts.filter((e) => CMD_VOLET.has(e.type));
    const d2 = (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
    const commandes = new Set();
    for (const m of moteurs) {
      const k = cmds.filter((x) => x.lv === m.lv).sort((a, b) => d2(a, m) - d2(b, m))[0];
      if (!k) continue;
      commandes.add(k.id);
      net('M', [k.id, m.id]); net('D', [k.id, m.id]);
    }
    if (moteurs.length && cmds.length) notes.push('Volets : chaque moteur est rattaché à la commande la plus proche du même niveau (à adapter).');
    /* commande : phase seulement ; moteur commandé : neutre et terre ; moteur sans commande (radio) : alimenté directement */
    const L = [ROOT], N = [ROOT], PE = [ROOT];
    for (const e of pts) {
      if (CMD_VOLET.has(e.type)) { L.push(e.id); continue; }
      const commande = MOTEURS_VOLET.has(e.type) && [...commandes].some((k) => R.some((r) => r.fn === 'M' && r.ends.has(k) && r.ends.has(e.id)));
      if (!commande) L.push(e.id);
      N.push(e.id); PE.push(e.id);
    }
    net('L', L); net('N', N); net('PE', PE);
    alim = null;
  }
  if (alim) {
    const tout = [ROOT, ...ids(alim)];
    if (tri) { net('L1', tout); net('L2', tout); net('L3', tout); } else net('L', tout);
    net('N', tout); net('PE', tout);
  }
  if (c.kind === 'chauffage') {
    const rad = pts.filter((e) => RADIATEURS.has(e.type));
    const pilote = (plan.elec || []).some((e) => e.type === 'prog_fp' || e.type === 'gest_energie');
    if (rad.length && pilote) { net('FP', [ROOT, ...ids(rad)]); notes.push('Fil pilote compté : un programmateur ou un gestionnaire d’énergie est posé sur le plan.'); }
  }
  if (tri) notes.push('Circuit triphasé : trois phases, neutre et terre (neutre à retirer si les appareils n’en ont pas besoin).');
  return { reseaux: R, notes, anomalies };
}

/* anomalies du même type dans un circuit : une seule ligne, appareils réunis */
const MSG_FUSION = {
  cb_lum_sans_cmd: (n) => `${n > 1 ? `${n} éclairages ne sont` : 'Un éclairage n’est'} commandé${n > 1 ? 's' : ''} par aucun interrupteur : reliez-${n > 1 ? 'les' : 'le'} à une commande (outil Liaison), sinon ${n > 1 ? 'ils restent' : 'il reste'} allumé${n > 1 ? 's' : ''} en permanence.`,
  cb_cmd_seule: (n) => `${n > 1 ? `${n} commandes ne commandent` : 'Une commande ne commande'} aucun éclairage : reliez-${n > 1 ? 'les' : 'la'} avec l’outil Liaison.`,
};
function fusionner(liste) {
  const out = [], par = new Map();
  for (const a of liste) {
    const k = a.id + '|' + a.msg;
    const f = MSG_FUSION[a.id] ? a.id : k;
    if (!par.has(f)) { const x = Object.assign({}, a, { refs: (a.refs || []).slice() }); par.set(f, x); out.push(x); continue; }
    const x = par.get(f); for (const r of a.refs || []) if (!x.refs.includes(r)) x.refs.push(r);
    if (MSG_FUSION[a.id]) x.msg = MSG_FUSION[a.id](x.refs.length);
  }
  return out;
}

/* ---------------- arbre du circuit le long des gaines ---------------- */
function arbre(plan, cid) {
  const T = tableauDu(plan);
  if (!T) return null;
  const G = grapheGaines(plan), src = 'e:' + T.id;
  if (!G.nodes.has(src)) return { G, src, prev: new Map(), D: new Map() };
  const sp = plusCourts(G, src, cid);
  return { G, src, prev: sp.prev, D: sp.D };
}

/* type de conducteur d'un tronçon : celui du circuit, sinon déduit du cheminement (estimation) */
function condTroncon(c, d) {
  if (c.cond && CONDUCTEURS[c.cond]) return { id: c.cond, st: 'saisie' };
  const k = d ? kindOf(d) : null;
  if (k === 'cdc') return { id: 'r2v', st: 'estimee' };
  if (k === 'icta' || k === 'irl' || k === 'goulotte') return { id: 'h07vu', st: 'estimee' };
  return { id: null, st: 'estimee' }; // type de cheminement non précisé : « fil ou câble » (rien de deviné)
}

/* désignation d'un ensemble de conducteurs : « 3G2,5 » (avec terre) ou « 2 × 1,5 » */
function designation(compo, sec) {
  const n = compo.reduce((s, x) => s + x.n, 0);
  const pe = compo.some((x) => x.fn === 'PE');
  return pe ? `${n}G${fmtSec(sec)}` : `${n} × ${fmtSec(sec)}`;
}
const ordreFn = (a, b) => (FONCTIONS[a.fn] ? FONCTIONS[a.fn].ordre : 99) - (FONCTIONS[b.fn] ? FONCTIONS[b.fn].ordre : 99);
function libelleCompo(compo) { return compo.map((x) => `${x.n > 1 ? x.n + ' ' : ''}${FONCTIONS[x.fn] ? FONCTIONS[x.fn].abr : x.fn}`).join(' + '); }

/* ---------------- câblage d'un circuit ----------------
   Renvoie :
   { cid, sec, tableau, complet, nonAtteints, troncons: [{ edge, a, b, lv, duct, h, v, compo: [{ fn, n }], n, des, cond }],
     maxConducteurs, desPrincipale, longueurs: { [fn]: cm de conducteur }, cables: { [désignation]: cm }, notes, anomalies, st: 'estimee' } */
function cablageCircuit(plan, c) {
  const out = { cid: c.id, sec: isNum(c.sec) ? c.sec : null, tableau: null, complet: false, nonAtteints: [], troncons: [], maxConducteurs: 0,
    desPrincipale: null, longueurs: {}, cables: {}, fils: {}, notes: [], anomalies: [], st: 'estimee' };
  const { reseaux, notes, anomalies } = reseauxCircuit(plan, c);
  out.notes = notes; out.anomalies = anomalies;
  const ch = cheminCircuit(plan, c.id);
  out.tableau = ch.tableau; out.complet = ch.complet; out.nonAtteints = ch.nonAtteints.slice();
  if (ch.nonAtteints.length && ch.tableau) anomalies.push({ id: 'cb_raccord', niveau: 'avertissement', msg: `${ch.nonAtteints.length} point${ch.nonAtteints.length > 1 ? 's' : ''} du circuit ne ${ch.nonAtteints.length > 1 ? 'sont' : 'est'} pas raccordé${ch.nonAtteints.length > 1 ? 's' : ''} au tableau par les gaines : conducteurs et longueurs incomplets.`, refs: ch.nonAtteints.slice() });
  const A = arbre(plan, c.id);
  if (!A || !A.prev.size) { out.desPrincipale = reseaux.length ? designation(compoDe(reseaux.map((r) => r.fn)), out.sec) : null; return out; }
  /* points atteints et chemin de chacun jusqu'au tableau : ensemble des points en aval de chaque arête */
  const aval = new Map(), aretes = new Map();
  for (const p of ch.points) {
    if (p.dist == null) continue;
    for (let n = 'e:' + p.id; n !== A.src;) {
      const ed = A.prev.get(n); if (!ed) break;
      aretes.set(ed.id, ed);
      if (!aval.has(ed.id)) aval.set(ed.id, new Set());
      aval.get(ed.id).add(p.id);
      n = ed.a === n ? ed.b : ed.a;
    }
  }
  const atteint = new Set(ch.points.filter((p) => p.dist != null).map((p) => p.id));
  for (const [eid, ed] of aretes) {
    const S = aval.get(eid);
    const fns = [];
    for (const r of reseaux) {
      let dedans = false, dehors = false;
      for (const x of r.ends) {
        if (x === ROOT) { dehors = true; continue; }
        if (!atteint.has(x)) continue; // extrémité non raccordée : ce conducteur n'est pas compté
        if (S.has(x)) dedans = true; else dehors = true;
        if (dedans && dehors) break;
      }
      if (dedans && dehors) fns.push(r.fn);
    }
    if (!fns.length) continue;
    const compo = compoDe(fns);
    const n = compo.reduce((s, x) => s + x.n, 0);
    const na = A.G.nodes.get(ed.a), nb = A.G.nodes.get(ed.b);
    /* verticale ou jonction : même conducteur que la gaine voisine */
    const did = ed.duct || (na && na.duct) || (nb && nb.duct) || null;
    const d = did ? A.G.ducts.get(did) : null;
    const cond = condTroncon(c, d);
    const tr = { edge: eid, a: na ? { x: na.x, y: na.y } : null, b: nb ? { x: nb.x, y: nb.y } : null, lv: na ? na.lv : null, duct: ed.duct || null, kind: ed.kind,
      h: ed.h, v: ed.v, compo, n, des: designation(compo, out.sec), cond: cond.id, condSt: cond.st };
    out.troncons.push(tr);
    out.maxConducteurs = Math.max(out.maxConducteurs, n);
    const L = ed.h + ed.v;
    for (const x of compo) out.longueurs[x.fn] = (out.longueurs[x.fn] || 0) + L * x.n;
    if (!cond.id || CONDUCTEURS[cond.id].fils) { for (const x of compo) out.fils[x.fn] = (out.fils[x.fn] || 0) + L * x.n; }
    else { const k = `${CONDUCTEURS[cond.id].court} ${tr.des}`; out.cables[k] = (out.cables[k] || 0) + L; }
    if (cond.id === 'h07vu' && d && kindOf(d) === 'cdc' && c.cond === 'h07vu')
      anomalies.push({ id: 'cb_fils_cdc', niveau: 'erreur', msg: 'Fils isolés (H07V-U) sur un chemin de câbles : un câble à gaine (par exemple U-1000 R2V) est attendu hors conduit.', refs: [], duct: d.id });
  }
  /* désignation principale : celle du tronçon qui part du tableau (le plus fréquent en longueur sinon) */
  const parDes = new Map();
  for (const t of out.troncons) parDes.set(t.des, (parDes.get(t.des) || 0) + t.h + t.v);
  const depart = out.troncons.find((t) => { const ed = aretes.get(t.edge); return ed && (ed.a === A.src || ed.b === A.src); });
  out.desPrincipale = depart ? depart.des : [...parDes.entries()].sort((a, b) => b[1] - a[1]).map((x) => x[0])[0] || null;
  /* une seule anomalie « fils sur chemin de câbles » par circuit */
  const vus = new Set(); out.anomalies = anomalies.filter((a) => { const k = a.id + (a.refs || []).join(','); if (vus.has(k)) return false; vus.add(k); return true; });
  return out;
}
function compoDe(fns) {
  const m = new Map(); for (const f of fns) m.set(f, (m.get(f) || 0) + 1);
  return [...m.entries()].map(([fn, n]) => ({ fn, n })).sort(ordreFn);
}

/* ---------------- câblage de tout le plan (mémorisé) ---------------- */
const CACHE = new WeakMap();
function signatureCablage(plan) {
  return JSON.stringify([(plan.circuits || []).map((c) => [c.id, c.kind, c.sec, c.cond, c.ctrl, c.calc && c.calc.phase]), (plan.ducts || []).filter(isElecDuct),
    (plan.elec || []).map((e) => [e.id, e.lv, e.type, e.x, e.y, e.rot, e.h, e.to, e.cid]), (plan.links || []).map((l) => [l.a, l.b]), (plan.levels || []).map((l) => [l.id, l.elev, l.h])]);
}
/* { circuits: Map cid → câblage, parArete: Map edge → [{ cid, compo, n, des }], parGaine: Map duct → { n, circuits } } */
function cablagePlan(plan) {
  const sig = signatureCablage(plan), hit = CACHE.get(plan);
  if (hit && hit.sig === sig) return hit.R;
  const circuits = new Map(), parArete = new Map(), parGaine = new Map();
  for (const c of plan.circuits || []) {
    const cab = cablageCircuit(plan, c);
    circuits.set(c.id, cab);
    for (const t of cab.troncons) {
      if (!parArete.has(t.edge)) parArete.set(t.edge, { a: t.a, b: t.b, lv: t.lv, duct: t.duct, kind: t.kind, h: t.h, liste: [] });
      parArete.get(t.edge).liste.push({ cid: c.id, compo: t.compo, n: t.n, des: t.des, cond: t.cond });
      if (t.duct) {
        const g = parGaine.get(t.duct) || { max: 0, circuits: new Set() };
        g.circuits.add(c.id); parGaine.set(t.duct, g);
      }
    }
  }
  for (const a of parArete.values()) { const n = a.liste.reduce((s, x) => s + x.n, 0); a.n = n; if (a.duct) { const g = parGaine.get(a.duct); g.max = Math.max(g.max, n); } }
  const R = { circuits, parArete, parGaine };
  CACHE.set(plan, { sig, R });
  return R;
}

/* ---------------- quantités de conducteurs (m, avec réserve) ----------------
   lignes : fils par section et par fonction (couleur), câbles par désignation. Seuls les circuits entièrement raccordés
   sont comptés ; les autres sont listés dans `incomplets`. */
function quantitesConducteurs(plan, reserve) {
  const k = 1 + ((reserve && isNum(reserve.v) ? reserve.v : 0) / 100);
  const fils = new Map(), cables = new Map(), incomplets = [];
  const R = cablagePlan(plan);
  for (const c of plan.circuits || []) {
    const cab = R.circuits.get(c.id);
    if (!cab || !cab.troncons.length) { if (cab && (plan.elec || []).some((e) => e.cid === c.id)) incomplets.push(c.id); continue; }
    if (!cab.complet) incomplets.push(c.id);
    const sec = isNum(c.sec) ? c.sec : null;
    for (const [fn, cm] of Object.entries(cab.fils)) {
      const key = `${sec}|${fn}`; const g = fils.get(key) || { sec, fn, cm: 0, circuits: new Set() };
      g.cm += cm; g.circuits.add(c.id); fils.set(key, g);
    }
    for (const [des, cm] of Object.entries(cab.cables)) {
      const g = cables.get(des) || { des, cm: 0, circuits: new Set() };
      g.cm += cm; g.circuits.add(c.id); cables.set(des, g);
    }
  }
  const m = (cm) => Math.ceil((cm / 100) * k - 1e-9);
  return {
    fils: [...fils.values()].sort((a, b) => (a.sec || 0) - (b.sec || 0) || ordreFn(a, b)).map((g) => ({ sec: g.sec, fn: g.fn, m: m(g.cm), cm: g.cm, circuits: [...g.circuits] })),
    cables: [...cables.values()].sort((a, b) => a.des.localeCompare(b.des, 'fr', { numeric: true })).map((g) => ({ des: g.des, m: m(g.cm), cm: g.cm, circuits: [...g.circuits] })),
    incomplets, st: 'estimee',
  };
}

/* ---------------- contrôles ----------------
   Constats de conception, classés « erreur », « avertissement » ou « suggestion ». Ce ne sont pas des validations
   réglementaires : le moteur de règles les présente comme des points d'attention de Calque. */
const NIVEAUX = { erreur: { n: 'Erreur', rang: 0 }, avertissement: { n: 'Avertissement', rang: 1 }, suggestion: { n: 'Suggestion', rang: 2 } };
function controlesCablage(plan, opts) {
  const o = opts || {};
  const R = cablagePlan(plan), out = [];
  const reseau = plan.install && plan.install.reseau === 'tri' ? 'tri' : 'mono';
  for (const c of plan.circuits || []) {
    const cab = R.circuits.get(c.id); if (!cab) continue;
    for (const a of cab.anomalies) out.push(Object.assign({ cid: c.id }, a));
    /* cohérence circuit ↔ tableau */
    if (estTri(plan, c) && reseau !== 'tri') out.push({ cid: c.id, id: 'cb_tab_tri', niveau: 'erreur', msg: 'Appareil ou circuit triphasé alors que l’installation est réglée en monophasé (Tableau › Arrivée et installation).', refs: [] });
    if (c.courbe === 'D' && ['eclairage', 'prises', 'prises_cuisine'].includes(c.kind)) out.push({ cid: c.id, id: 'cb_tab_courbe', niveau: 'avertissement', msg: 'Courbe D sur un circuit d’éclairage ou de prises : courbe inhabituelle (réservée aux forts appels de courant), à justifier.', refs: [] });
    if (c.cond === 'souple' && ['eclairage', 'prises', 'prises_cuisine'].includes(c.kind)) out.push({ cid: c.id, id: 'cb_tab_cond', niveau: 'suggestion', msg: 'Câble souple choisi pour un circuit fixe : vérifiez que c’est voulu (rallonge, appareil mobile).', refs: [] });
  }
  /* commandes et éclairages sans circuit mais reliés : à signaler une fois */
  if (o.sansCircuit !== false) {
    const sans = (plan.elec || []).filter((e) => !e.cid && (LIGHTS.has(e.type) || CMDS.has(e.type)) && (plan.links || []).some((l) => l.a === e.id || l.b === e.id));
    if (sans.length) out.push({ cid: null, id: 'cb_lum_sans_cmd', niveau: 'suggestion', msg: `${sans.length} commande${sans.length > 1 ? 's' : ''} ou éclairage${sans.length > 1 ? 's' : ''} relié${sans.length > 1 ? 's' : ''} sans circuit : rattachez-les à un circuit pour compter leurs conducteurs.`, refs: sans.map((e) => e.id) });
  }
  out.sort((a, b) => NIVEAUX[a.niveau].rang - NIVEAUX[b.niveau].rang);
  return out;
}

/* ---------------- résumé lisible d'un circuit ---------------- */
function resumeCircuit(plan, c) {
  const cab = cablagePlan(plan).circuits.get(c.id);
  if (!cab) return null;
  const des = [...new Set(cab.troncons.map((t) => t.des))].sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
  const total = Object.values(cab.longueurs).reduce((s, v) => s + v, 0);
  return { des, principale: cab.desPrincipale, max: cab.maxConducteurs, conducteursCm: total, complet: cab.complet, nonAtteints: cab.nonAtteints.length, notes: cab.notes };
}

/* ---------------- nettoyage (migration v12) ---------------- */
const COURBES = ['B', 'C', 'D'];
function nettoyerCircuitV12(c) {
  if (!c || typeof c !== 'object') return c;
  if ('col' in c && !(typeof c.col === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.col))) delete c.col;
  if ('courbe' in c && !COURBES.includes(c.courbe)) delete c.courbe;
  if ('cond' in c && !COND_IDS.includes(c.cond)) delete c.cond;
  return c;
}

export { COND_IDS, CONDUCTEURS, COURBES, FONCTIONS, NIVEAUX, ROOT, cablageCircuit, cablagePlan, circuitsDe, compoDe, controlesCablage, designation, estTri,
  libelleCompo, nettoyerCircuitV12, quantitesConducteurs, reseauxCircuit, resumeCircuit };

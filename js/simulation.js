/* Calque — module « simulation » : mode « Tester » de l'onglet Schémas. JavaScript pur, sans écran (testable avec Node).
   Le schéma n'est jamais modifié : on lui applique un ÉTAT (boutons appuyés, interrupteurs, protections ouvertes,
   relais thermiques déclenchés, mémoire des télérupteurs) et le module calcule ce qui est sous tension.

   Principe (logique de contacts, sans calcul de courant) :
   - les étiquettes de potentiel sont les sources : L, L1, L2, L3 (phases ; L est pris comme L1), N (neutre),
     24V, 12V, +… (continu +), 0V, − (continu −), PE (terre) ;
   - chaque contact fermé, pôle de protection fermé, borne, compteur, relie ses deux bornes ;
   - un récepteur (bobine, lampe, voyant, moteur, sonnerie…) fonctionne quand ses bornes reçoivent deux potentiels
     différents (phase et neutre, deux phases, + et −) ;
   - les contacts suivent leur bobine (repère commun) : on recommence jusqu'à ce que plus rien ne change ;
   - télérupteur : change d'état à chaque impulsion ; minuterie : s'allume à l'impulsion, s'éteint à « fin de
     temporisation » ; relais temporisés : la temporisation n'est pas simulée (passage immédiat, signalé).
   C'est une AIDE À LA COMPRÉHENSION du schéma dessiné, pas une validation : aucun calcul électrique, aucune règle. */
import { SYM_BY } from './schemasymboles.js';
import { appareils, equipotentielles } from './schema.js';

/* ---------------- familles de symboles ---------------- */
const POUSSOIRS = new Set(['bp_no', 'bp_nf']); // reviennent au repos quand on les lâche
const MANUELS = new Set(['inter', 'fdc', 'au', 'vv', 'detecteur']); // gardent leur position
const PROTECTIONS = new Set(['disj1', 'disj2', 'disj3', 'disj4', 'disjmot', 'id2', 'id4', 'sect3', 'sectfus3', 'fusible']);
const CHARGES = new Set(['bobine_km', 'bobine_ka', 'bobine_kt', 'bobine_tl', 'minuterie', 'lampe', 'voyant', 'sonnerie', 'chauffage', 'moteur1', 'moteur3', 'prise', 'alim', 'transfo']);
const IMPULSION = new Set(['bobine_tl', 'minuterie']); // contacts mémorisés
const NON_SIMULES = new Set(['api_e4', 'api_s4', 'variateur', 'parafoudre']);
/* libellés des états, pour le panneau */
const LIB_CHARGE = { bobine_km: ['enclenché', 'au repos'], bobine_ka: ['enclenché', 'au repos'], bobine_kt: ['enclenché', 'au repos'], bobine_tl: ['bobine alimentée', 'bobine au repos'],
  minuterie: ['bobine alimentée', 'bobine au repos'], lampe: ['allumée', 'éteinte'], voyant: ['allumé', 'éteint'], sonnerie: ['sonne', 'silencieuse'], chauffage: ['chauffe', 'arrêté'],
  moteur1: ['tourne', 'arrêté'], moteur3: ['tourne', 'arrêté'], prise: ['sous tension', 'hors tension'], alim: ['alimentée', 'hors tension'], transfo: ['alimenté', 'hors tension'] };

/* ---------------- potentiels ---------------- */
/* jeton de source d'après le nom d'une étiquette de potentiel (null : nom inconnu, pas une source) */
function sourceDe(nom) {
  const n = String(nom || '').trim().toUpperCase().replace(/\s+/g, '').replace('−', '-');
  if (n === 'L' || n === 'L1' || n === 'PH') return 'L1';
  if (n === 'L2' || n === 'L3') return n;
  if (n === 'N') return 'N';
  if (n === 'PE') return 'PE';
  if (/^\+?\d+([.,]\d+)?V(DC|CC|=)?$/.test(n) && !/^0([.,]0+)?V/.test(n) || n === '+') return 'DC+';
  if (/^0V(DC|CC|=)?$/.test(n) || n === '-' || n === 'M' || n === '0') return 'DC-';
  return null;
}
const PHASES = new Set(['L1', 'L2', 'L3']);
/* deux ensembles de jetons donnent-ils une tension ? */
function tension(a, b) {
  for (const x of a) for (const y of b) {
    if (x === y) continue;
    if (PHASES.has(x) && (y === 'N' || PHASES.has(y))) return true;
    if (PHASES.has(y) && x === 'N') return true;
    if ((x === 'DC+' && y === 'DC-') || (x === 'DC-' && y === 'DC+')) return true;
    const mx = /^T([+-]):(.*)$/.exec(x), my = /^T([+-]):(.*)$/.exec(y);
    if (mx && my && mx[2] === my[2] && mx[1] !== my[1]) return true;
  }
  return false;
}
/* un même point qui reçoit deux potentiels différents : court-circuit */
function court(t) {
  const l = [...t].filter((x) => x !== 'PE');
  for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) if (tension([l[i]], [l[j]])) return true;
  return false;
}
/* état d'affichage d'un point : 'court', 'phase', 'neutre', 'dc+', 'dc-', 'terre' ou null (hors tension) */
function etatPoint(t) {
  if (!t || !t.size) return null;
  if (court(t)) return 'court';
  if ([...t].some((x) => PHASES.has(x) || /^T\+/.test(x))) return 'phase';
  if (t.has('DC+')) return 'dc+';
  if (t.has('N') || [...t].some((x) => /^T-/.test(x))) return 'neutre';
  if (t.has('DC-')) return 'dc-';
  if (t.has('PE')) return 'terre';
  return null;
}

/* ---------------- état ---------------- */
function etatInitial() { return { man: {}, mem: {}, prec: [] }; }
/* action d'un symbole touché en mode test : renvoie le nouvel état (l'ancien n'est pas modifié) ou null */
function actionner(sch, etat, sym, appui) {
  const d = SYM_BY.get(sym.t); if (!d) return null;
  const e = { man: Object.assign({}, etat.man), mem: Object.assign({}, etat.mem), prec: etat.prec.slice() };
  if (POUSSOIRS.has(sym.t)) { if (appui) e.man[sym.id] = true; else delete e.man[sym.id]; return e; }
  if (MANUELS.has(sym.t) || PROTECTIONS.has(sym.t)) { if (e.man[sym.id]) delete e.man[sym.id]; else e.man[sym.id] = true; return e; }
  /* relais thermique (ou son contact 95-96) : déclenché / réarmé, pour tout l'appareil */
  if ((sym.t === 'relth3' || sym.t === 'contact_th') && sym.rep) { const k = 'F:' + sym.rep; if (e.man[k]) delete e.man[k]; else e.man[k] = true; return e; }
  return null;
}
/* le symbole réagit-il au toucher en mode test ? */
function actionnable(sym) { return POUSSOIRS.has(sym.t) || MANUELS.has(sym.t) || PROTECTIONS.has(sym.t) || ((sym.t === 'relth3' || sym.t === 'contact_th') && !!sym.rep); }
/* fin de temporisation : minuteries éteintes (état renvoyé) */
function finTempo(sch, etat) {
  const app = appareils(sch), e = { man: Object.assign({}, etat.man), mem: Object.assign({}, etat.mem), prec: etat.prec.slice() };
  for (const [rep, a] of app) if (a.bobines.some((b) => b.d.t === 'minuterie')) delete e.mem[rep];
  return e;
}

/* ---------------- calcul ---------------- */
/* paires de bornes reliées par un symbole dans l'état courant (indices de bornes) */
function liaisons(s, d, ctx) {
  const t = s.t, man = ctx.etat.man, paires = [];
  const poles = () => { for (let i = 0; i + 1 < d.bornes.length; i += 2) paires.push([i, i + 1]); };
  if (PROTECTIONS.has(t)) { if (!man[s.id]) poles(); return paires; }
  if (t === 'bp_no' || t === 'inter' || t === 'fdc') { if (man[s.id]) paires.push([0, 1]); return paires; }
  if (t === 'bp_nf' || t === 'au') { if (!man[s.id]) paires.push([0, 1]); return paires; }
  if (t === 'vv') { paires.push([0, man[s.id] ? 2 : 1]); return paires; }
  if (t === 'detecteur') { if (man[s.id]) paires.push([0, 2]); return paires; } // sortie S reliée au + quand il détecte
  if (t === 'relth3' || t === 'compteur') { poles(); return paires; }
  if (d.role === 'contact') {
    const ferme = contactFerme(s, d, ctx);
    if (ferme) poles();
    return paires;
  }
  return paires;
}
/* position d'un contact : NO fermé si l'appareil travaille, NF fermé au repos ; contact du thermique : NF sauf déclenché */
function contactFerme(s, d, ctx) {
  if (!s.rep) return d.type === 'NF';
  if (d.t === 'contact_th') return !ctx.etat.man['F:' + s.rep];
  const travail = ctx.travail(s.rep);
  return d.type === 'NF' ? !travail : travail;
}
/* un tour de calcul : réunit les points reliés, propage les sources, trouve les récepteurs alimentés */
function tour(sch, eq, ctx, alimOn) {
  const par = new Map();
  const find = (k) => { while (par.get(k) !== k) { par.set(k, par.get(par.get(k))); k = par.get(k); } return k; };
  for (const n of eq.nets) par.set(n.id, n.id);
  const netDe = (s, i) => { const n = eq.parBorne.get(`${s.id}:${i}`); return n ? n.id : null; };
  const uni = (a, b) => { if (a == null || b == null) return; const ra = find(a), rb = find(b); if (ra !== rb) par.set(ra, rb); };
  for (const x of ctx.syms) for (const [i, j] of liaisons(x.s, x.d, ctx)) uni(netDe(x.s, i), netDe(x.s, j));
  /* sources : étiquettes de potentiel, puis sorties des alimentations et transformateurs alimentés */
  const jetons = new Map();
  const ajoute = (nid, tk) => { if (nid == null) return; const r = find(nid); if (!jetons.has(r)) jetons.set(r, new Set()); jetons.get(r).add(tk); };
  for (const n of eq.nets) for (const m of n.membres) { const d = SYM_BY.get(m.sym.t); if (d && d.role === 'pot') { const tk = sourceDe(m.sym.num); if (tk) ajoute(n.id, tk); } }
  for (const x of ctx.syms) {
    if (!alimOn.has(x.s.id)) continue;
    if (x.s.t === 'alim') { ajoute(netDe(x.s, 2), 'DC+'); ajoute(netDe(x.s, 3), 'DC-'); }
    if (x.s.t === 'transfo') { ajoute(netDe(x.s, 2), 'T+:' + x.s.id); ajoute(netDe(x.s, 3), 'T-:' + x.s.id); }
  }
  const tk = (s, i) => { const n = netDe(s, i); return (n != null && jetons.get(find(n))) || new Set(); };
  /* récepteurs */
  const on = new Map();
  for (const x of ctx.syms) {
    if (!CHARGES.has(x.s.t)) continue;
    let marche;
    if (x.s.t === 'moteur3') { const a = tk(x.s, 0), b = tk(x.s, 1), c = tk(x.s, 2); marche = tension(a, b) && tension(b, c) && tension(a, c); }
    else if (x.s.t === 'alim' || x.s.t === 'transfo') marche = tension(tk(x.s, 0), tk(x.s, 1));
    else marche = tension(tk(x.s, 0), tk(x.s, 1));
    on.set(x.s.id, !!marche);
  }
  return { find, jetons, on };
}
/* calcule l'état du schéma ; etat : { man, mem, prec } (voir actionner). Renvoie
   { parFil: Map(fil → état), parNet, charges: [{ s, fi, rep, d, on, lib }], travail: Set(repères), contacts: Map(sym → { ferme, pos }),
     alertes: [{ niveau, msg }], etat (état suivant, à garder pour l'action suivante), instable } */
function simuler(sch, etat) {
  etat = etat || etatInitial();
  const eq = equipotentielles(sch), app = appareils(sch);
  const syms = [];
  sch.folios.forEach((f, fi) => { for (const s of f.syms) { const d = SYM_BY.get(s.t); if (d) syms.push({ s, d, fi }); } });
  /* type de chaque appareil à bobine : contacteur (suit la bobine) ou à impulsion (mémoire) */
  const typeApp = new Map();
  for (const [rep, a] of app) { const b = a.bobines[0]; if (b) typeApp.set(rep, IMPULSION.has(b.d.t) ? 'impulsion' : 'bobine'); }
  const mem = Object.assign({}, etat.mem);
  let bob = new Set(etat.prec || []), alimOn = new Set();
  const ctx = { etat, syms, travail: (rep) => (typeApp.get(rep) === 'impulsion' ? !!mem[rep] : bob.has(rep)) };
  let R = null, instable = false;
  const converger = () => {
    for (let k = 0; ; k++) {
      R = tour(sch, eq, ctx, alimOn);
      const nb = new Set(), na = new Set();
      for (const x of syms) if (R.on.get(x.s.id)) { if (x.d.role === 'bobine' && x.s.rep) nb.add(x.s.rep); if (x.s.t === 'alim' || x.s.t === 'transfo') na.add(x.s.id); }
      const pareil = nb.size === bob.size && [...nb].every((r) => bob.has(r)) && na.size === alimOn.size && [...na].every((r) => alimOn.has(r));
      bob = nb; alimOn = na;
      if (pareil) break;
      if (k >= 40) { instable = true; break; }
    }
  };
  converger();
  /* impulsions : télérupteur qui change d'état, minuterie qui s'allume, au front montant de la bobine */
  const avant = new Set(etat.prec || []);
  let change = false;
  for (const rep of bob) {
    if (typeApp.get(rep) !== 'impulsion' || avant.has(rep)) continue;
    const b = app.get(rep).bobines[0];
    if (b.d.t === 'bobine_tl') { if (mem[rep]) delete mem[rep]; else mem[rep] = true; }
    else mem[rep] = true;
    change = true;
  }
  if (change) converger();
  /* résultats */
  const parNet = new Map();
  for (const n of eq.nets) parNet.set(n.id, etatPoint(R.jetons.get(R.find(n.id))));
  const parFil = new Map();
  for (const n of eq.nets) for (const fid of n.fils) parFil.set(fid, parNet.get(n.id));
  const contacts = new Map();
  for (const x of syms) {
    if (x.d.role === 'contact') contacts.set(x.s.id, { ferme: contactFerme(x.s, x.d, ctx) });
    else if (PROTECTIONS.has(x.s.t)) contacts.set(x.s.id, { ferme: !etat.man[x.s.id] });
    else if (x.s.t === 'bp_no' || x.s.t === 'inter' || x.s.t === 'fdc') contacts.set(x.s.id, { ferme: !!etat.man[x.s.id] });
    else if (x.s.t === 'bp_nf' || x.s.t === 'au') contacts.set(x.s.id, { ferme: !etat.man[x.s.id] });
    else if (x.s.t === 'vv') contacts.set(x.s.id, { pos: etat.man[x.s.id] ? 2 : 1 });
    else if (x.s.t === 'detecteur') contacts.set(x.s.id, { ferme: !!etat.man[x.s.id] });
    else if (x.s.t === 'relth3') contacts.set(x.s.id, { declenche: !!(x.s.rep && etat.man['F:' + x.s.rep]) });
  }
  const charges = syms.filter((x) => CHARGES.has(x.s.t)).map((x) => {
    const on = !!R.on.get(x.s.id), l = LIB_CHARGE[x.s.t] || ['en marche', 'arrêté'];
    let lib = on ? l[0] : l[1];
    if (IMPULSION.has(x.s.t) && x.s.rep) lib += mem[x.s.rep] ? ' · contacts au travail' : ' · contacts au repos';
    return { s: x.s, d: x.d, fi: x.fi, rep: x.s.rep || '', on, lib };
  });
  const alertes = [];
  const courts = [...parNet.values()].filter((v) => v === 'court').length;
  if (courts) alertes.push({ niveau: 'erreur', msg: `Court-circuit : ${courts} fil${courts > 1 ? 's relient' : ' relie'} deux potentiels différents (phase et neutre, deux phases, + et −). Vérifiez le schéma.` });
  if (instable) alertes.push({ niveau: 'erreur', msg: 'Le schéma ne se stabilise pas (un relais se coupe lui-même, par exemple) : fonctionnement en battement.' });
  const sansBobine = new Set(); for (const x of syms) if (x.d.role === 'contact' && x.s.rep && x.d.t !== 'contact_th' && !typeApp.has(x.s.rep)) sansBobine.add(x.s.rep);
  if (sansBobine.size) alertes.push({ niveau: 'avertissement', msg: `Contact${sansBobine.size > 1 ? 's' : ''} sans bobine (${[...sansBobine].join(', ')}) : toujours au repos.` });
  if (syms.some((x) => x.s.t === 'bobine_kt' || x.s.t === 'contact_tno' || x.s.t === 'contact_tnf')) alertes.push({ niveau: 'info', msg: 'Relais temporisés : la temporisation n’est pas simulée, les contacts changent tout de suite.' });
  const ns = [...new Set(syms.filter((x) => NON_SIMULES.has(x.s.t)).map((x) => x.d.n))];
  if (ns.length) alertes.push({ niveau: 'info', msg: `Non simulé : ${ns.join(', ')}.` });
  if (!eq.nets.some((n) => n.membres.some((m) => m.sym.t === 'pot' && sourceDe(m.sym.num)))) alertes.push({ niveau: 'avertissement', msg: 'Aucune source : posez des étiquettes de potentiel (L, N, L1, 24V…) en haut et en bas du schéma.' });
  return { parFil, parNet, charges, travail: new Set([...bob].filter((r) => typeApp.get(r) !== 'impulsion').concat(Object.keys(mem).filter((r) => mem[r]))), contacts, alertes,
    etat: { man: etat.man, mem, prec: [...bob] }, instable };
}

export { CHARGES, POUSSOIRS, PROTECTIONS, actionnable, actionner, etatInitial, etatPoint, finTempo, simuler, sourceDe, tension };

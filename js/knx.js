/* Calque — module « knx » : installation domotique KNX (bus TP, paire torsadée). JavaScript pur, sans accès à l'écran.
   - Lignes : le bus est dessiné par des gaines sans circuit entre deux appareils KNX (estLienKNX, cheminement.js) ;
     une ligne = un ensemble d'appareils reliés entre eux par le bus.
   - Adresses physiques zone.ligne.participant (coupleur : x.y.0), automatiques ou saisies (e.knx.pa).
   - Contrôles de topologie (règles générales du bus KNX TP, à vérifier dans la documentation KNX et la notice du matériel).
   - Adresses de groupe à trois niveaux (fonction / niveau / commande) proposées d'après le plan : éclairage, volets,
     chauffage, météo. Le plan n'est modifié que par les fonctions dont le nom le dit (ajouterGroupes).
   - Besoins en sorties d'actionneurs (comptage d'après le plan, aucune référence de fabricant).

   Données (format v20) :
     symbole KNX   e.knx = { pa ('1.1.5', saisie), ma { v, st, src } (courant consommé sur le bus, mA),
                             alim { v, st, src } (courant disponible d'une alimentation, mA) }
     plan          P.knx = { zone (numéro de zone, 1 par défaut), groupes: [{ id, adr ('1/0/3'), nom, dpt, cle, lv, room }] }

   Aucune valeur n'est présentée comme une donnée de fabricant : la consommation par défaut est « estimée ». */
import { isNum } from './noyau.js';
import { ancrage, estKNX, estLienKNX, indexElec, longueurGaine } from './cheminement.js';
import { itineraireEntre } from './itineraire.js';

const SRC_TOPO = 'Règle générale du bus KNX TP (documentation de l’association KNX) : à vérifier dans la notice du matériel ; ce n’est pas une règle de la NF C 15-100';
const MA_DEF = { v: 10, st: 'estimee', src: 'Consommation courante d’un appareil KNX sur le bus (ordre de grandeur), à remplacer par la notice' };
const ALIM_DEF = { v: 640, st: 'estimee', src: 'Courant courant d’une alimentation de ligne (160, 320, 640 ou 1280 mA selon le modèle), à remplacer par la notice' };
const ALIM_CHOIX = [160, 320, 640, 1280];
const LIMITES = { participants: 64, cable: 100000, alimPart: 35000, partPart: 70000, alims: 2 }; // cm
/* types de points de données usuels (DPT KNX) */
const DPT = { '1.001': 'Commutation (marche/arrêt)', '1.005': 'Alarme', '1.007': 'Pas (arrêt, lamelles)', '1.008': 'Montée / descente', '3.007': 'Variation relative',
  '5.001': 'Pourcentage (0 à 100 %)', '9.001': 'Température (°C)', '9.004': 'Luminosité (lux)', '9.005': 'Vitesse du vent (m/s)', '13.010': 'Énergie active (Wh)' };
const PRINCIPAUX = { 0: 'Central et scènes', 1: 'Éclairage', 2: 'Volets et stores', 3: 'Chauffage', 4: 'Météo et mesures' };
/* rôle des appareils KNX */
const ROLE = { knx_alim: 'alim', knx_coupleur: 'coupleur', knx_ip: 'systeme', knx_act: 'actionneur', knx_var: 'actionneur', knx_store: 'actionneur', knx_chauf: 'actionneur',
  knx_entree: 'capteur', knx_dali: 'actionneur', knx_compteur: 'capteur', knx_bp: 'capteur', knx_det: 'capteur', knx_thermo: 'capteur', knx_ecran: 'capteur', knx_meteo: 'capteur' };
/* charges commandées : symboles du plan → type de sortie d'actionneur */
const LUMIERES = new Set(['pl', 'applique', 'spot', 'reglette', 'led', 'hublot', 'projecteur', 'proj_det', 'borne_ext', 'dalle_led', 'rail_spot', 'miroir', 'suspension', 'plafonnier', 'spot_orient', 'encastre_sol', 'balise_marche', 'applique_ext', 'eclairage_placard', 'spot_jardin']);
const VOLETS = new Set(['volet_mot', 'velux_mot', 'volet_bat', 'store', 'pergola']);
const CHAUFFAGE = new Set(['rad_elec', 'sortie_rad', 'seche_serv_e', 'plancher', 'soufflant_sdb']);
const VARIATEURS = new Set(['var']);

const parsePA = (s) => { const m = /^\s*(\d{1,2})\.(\d{1,2})\.(\d{1,3})\s*$/.exec(String(s || '')); if (!m) return null; const a = +m[1], b = +m[2], c = +m[3]; return a <= 15 && b <= 15 && c <= 255 ? [a, b, c] : null; };
const maDe = (e) => (e.knx && e.knx.ma && isNum(e.knx.ma.v) ? e.knx.ma : ROLE[e.type] === 'alim' ? { v: 0, st: 'estimee' } : MA_DEF);
const alimDe = (e) => (e.knx && e.knx.alim && isNum(e.knx.alim.v) ? e.knx.alim : ALIM_DEF);

/* ---------------- lignes (composantes reliées par le bus) ---------------- */
function lignesKNX(plan) {
  const E = indexElec(plan), dev = (plan.elec || []).filter((e) => estKNX(e.type));
  const par = new Map(dev.map((e) => [e.id, e.id]));
  const f = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
  const liens = (plan.ducts || []).filter((d) => estLienKNX(d, E));
  const adj = new Map(dev.map((e) => [e.id, []]));
  for (const d of liens) {
    if (!par.has(d.a) || !par.has(d.b)) continue;
    par.set(f(d.a), f(d.b));
    const L = longueurGaine(plan, d, E).total;
    adj.get(d.a).push({ to: d.b, L, d }); adj.get(d.b).push({ to: d.a, L, d });
  }
  const groupes = new Map();
  for (const e of dev) { const r = f(e.id); if (!groupes.has(r)) groupes.set(r, []); groupes.get(r).push(e); }
  const lignes = [], isoles = [];
  for (const g of groupes.values()) {
    if (g.length === 1 && !adj.get(g[0].id).length) { isoles.push(g[0]); continue; }
    const ids = new Set(g.map((e) => e.id));
    const cable = liens.filter((d) => ids.has(d.a)).reduce((s, d) => s + longueurGaine(plan, d, E).total, 0);
    lignes.push({ appareils: g, cable, adj, nLiens: liens.filter((d) => ids.has(d.a)).length });
  }
  /* ordre stable : la ligne qui contient le premier appareil du plan d'abord ; numéros 1, 2, 3… */
  const rang = new Map((plan.elec || []).map((e, i) => [e.id, i]));
  lignes.sort((a, b) => Math.min(...a.appareils.map((e) => rang.get(e.id))) - Math.min(...b.appareils.map((e) => rang.get(e.id))));
  lignes.forEach((l, i) => { l.n = i + 1; });
  return { lignes, isoles, liens };
}
/* distances le long du bus depuis un appareil (cm) */
function distancesBus(adj, depart) {
  const D = new Map([[depart, 0]]), todo = [depart];
  while (todo.length) {
    todo.sort((a, b) => D.get(a) - D.get(b)); const u = todo.shift();
    for (const { to, L } of adj.get(u) || []) { const nd = D.get(u) + L; if (!D.has(to) || nd < D.get(to) - 1e-9) { D.set(to, nd); todo.push(to); } }
  }
  return D;
}

/* ---------------- adresses physiques ---------------- */
function adressesPhysiques(plan) {
  const zone = plan.knx && isNum(plan.knx.zone) ? plan.knx.zone : 1;
  const { lignes, isoles } = lignesKNX(plan), out = new Map(), vues = new Map(), doublons = [];
  const noter = (e, pa, auto) => { out.set(e.id, { pa, auto }); const k = pa.join('.'); if (vues.has(k)) doublons.push([vues.get(k), e.id, k]); else vues.set(k, e.id); };
  const pris = new Set();
  for (const e of plan.elec || []) if (estKNX(e.type) && e.knx && parsePA(e.knx.pa)) { noter(e, parsePA(e.knx.pa), false); pris.add(e.id); }
  const occupees = new Set([...vues.keys()]);
  const suivant = (z, l, n0) => { let n = n0; while (occupees.has(`${z}.${l}.${n}`)) n++; return n; };
  for (const L of lignes) {
    let n = 1;
    for (const e of L.appareils) {
      if (pris.has(e.id) || ROLE[e.type] === 'alim') continue;
      if (ROLE[e.type] === 'coupleur') { const k = `${zone}.${L.n}.0`; if (!occupees.has(k)) { occupees.add(k); noter(e, [zone, L.n, 0], true); continue; } }
      n = suivant(zone, L.n, n); occupees.add(`${zone}.${L.n}.${n}`); noter(e, [zone, L.n, n], true); n++;
    }
  }
  for (const e of isoles) if (!pris.has(e.id) && ROLE[e.type] !== 'alim') out.set(e.id, { pa: null, auto: true });
  return { adresses: out, doublons };
}

/* ---------------- bilan de courant d'une ligne ---------------- */
/* Σ consommations des participants (mA) comparée au courant des alimentations (mA) */
function bilanCourant(consos, dispo) { const conso = (consos || []).reduce((s, x) => s + (isNum(x) ? x : 0), 0); return { conso, dispo, reste: dispo - conso, ok: conso <= dispo }; }

/* ---------------- contrôles de topologie ---------------- */
/* statut : 'non_conforme' (limite dépassée) | 'verification' (limite respectée, données ou règle à vérifier) */
function controlesKNX(plan) {
  const { lignes, isoles } = lignesKNX(plan), res = [];
  const add = (st, ligne, msg, donnees) => res.push({ st, ligne, msg, src: SRC_TOPO, donnees: donnees || null });
  for (const L of lignes) {
    const parts = L.appareils.filter((e) => ROLE[e.type] !== 'alim'), alims = L.appareils.filter((e) => ROLE[e.type] === 'alim');
    const nom = `Ligne ${L.n}`;
    if (parts.length > LIMITES.participants) add('non_conforme', L.n, `${nom} : ${parts.length} participants, plus de ${LIMITES.participants} sur un segment (ajouter un répéteur ou une ligne).`);
    else add('verification', L.n, `${nom} : ${parts.length} participant${parts.length > 1 ? 's' : ''} (${LIMITES.participants} au plus par segment).`);
    if (L.cable > LIMITES.cable) add('non_conforme', L.n, `${nom} : ${Math.round(L.cable / 100)} m de câble bus, plus de 1 000 m.`);
    else add('verification', L.n, `${nom} : ${Math.round(L.cable / 100)} m de câble bus dessiné (1 000 m au plus ; verticales estimées).`);
    if (!alims.length) add('non_conforme', L.n, `${nom} : aucune alimentation de ligne reliée au bus.`);
    else if (alims.length > LIMITES.alims) add('non_conforme', L.n, `${nom} : ${alims.length} alimentations, plus de ${LIMITES.alims} sur un segment.`);
    if (alims.length) {
      const { dispo, conso } = bilanCourant(parts.map((e) => maDe(e).v), alims.reduce((s, a) => s + alimDe(a).v, 0));
      const est = alims.some((a) => alimDe(a).st === 'estimee') || parts.some((e) => maDe(e).st === 'estimee');
      add(conso > dispo ? 'non_conforme' : 'verification', L.n, `${nom} : consommation ${conso} mA pour ${dispo} mA disponibles${est ? ' (valeurs estimées : saisissez celles des notices)' : ''}.`, { conso, dispo, estime: est });
      /* distances alimentation → participant (350 m) et entre participants (700 m), le long du bus */
      let maxAP = 0, maxPP = 0;
      for (const a of alims) { const D = distancesBus(L.adj, a.id); for (const e of parts) if (D.has(e.id)) maxAP = Math.max(maxAP, D.get(e.id)); }
      for (const e of parts) { const D = distancesBus(L.adj, e.id); for (const f of parts) if (D.has(f.id)) maxPP = Math.max(maxPP, D.get(f.id)); }
      add(maxAP > LIMITES.alimPart ? 'non_conforme' : 'verification', L.n, `${nom} : ${Math.round(maxAP / 100)} m au plus entre l’alimentation et un participant (350 m au plus).`);
      add(maxPP > LIMITES.partPart ? 'non_conforme' : 'verification', L.n, `${nom} : ${Math.round(maxPP / 100)} m au plus entre deux participants (700 m au plus).`);
    }
  }
  if (isoles.length) add('non_conforme', null, `${isoles.length} appareil${isoles.length > 1 ? 's' : ''} KNX non relié${isoles.length > 1 ? 's' : ''} au bus (« Relier au bus » dans son panneau).`);
  const { doublons } = adressesPhysiques(plan);
  for (const [, , k] of doublons) add('non_conforme', null, `Adresse physique ${k} donnée à deux appareils.`);
  return res;
}

/* ---------------- besoins en sorties d'actionneurs ---------------- */
function besoinsSorties(plan, pieceDe) {
  const piece = pieceDe || ((e) => e.lv);
  const groupesLum = new Set(), out = { commutation: 0, variation: 0, volets: 0, chauffage: 0 };
  const varPieces = new Set((plan.elec || []).filter((e) => VARIATEURS.has(e.type)).map((e) => e.lv + '|' + piece(e)));
  /* éclairage : un départ par pièce et par commande (liaisons du plan), sinon par pièce */
  const lie = new Map(); for (const l of plan.links || []) { lie.set(l.b, l.a); lie.set(l.a, l.a); }
  for (const e of plan.elec || []) {
    if (LUMIERES.has(e.type)) { const k = e.lv + '|' + piece(e) + '|' + (lie.get(e.id) || ''); if (!groupesLum.has(k)) { groupesLum.add(k); if (varPieces.has(e.lv + '|' + piece(e))) out.variation++; else out.commutation++; } }
    else if (VOLETS.has(e.type)) out.volets++;
    else if (CHAUFFAGE.has(e.type)) out.chauffage++;
  }
  /* modules usuels de 4, 8 ou 16 sorties (aucune référence) */
  const modules = (n, tailles) => { if (!n) return []; const t = tailles.find((x) => x >= n) || tailles[tailles.length - 1]; const k = Math.ceil(n / t); return [{ n: k, sorties: t }]; };
  out.suggestion = { commutation: modules(out.commutation, [4, 8, 12, 16]), variation: modules(out.variation, [1, 2, 4]), volets: modules(out.volets, [4, 8]), chauffage: modules(out.chauffage, [4, 6, 8, 12]) };
  return out;
}

/* ---------------- adresses de groupe ---------------- */
/* propositions d'après le plan : [{ cle, adr, nom, dpt, lv, room }] ; pieces(lv) → [{ id, name, contient(e) }] fourni par l'appelant ;
   opts.toutes : toutes les pièces (sinon seulement celles où un appareil KNX est posé) */
function proposerGroupes(plan, pieces, opts) {
  const toutes = !!(opts && opts.toutes); // false : seulement les pièces où un appareil KNX est posé
  const L = (plan.levels || []).slice().sort((a, b) => a.elev - b.elev), out = [];
  const sous = new Map(); // compteur de sous-groupes par « principal/médian »
  const add = (p, m, cle, nom, dpt, lv, room) => { const k = p + '/' + m; const s = (sous.get(k) || 0) + 1; sous.set(k, s); out.push({ cle, adr: `${p}/${m}/${s}`, nom, dpt, lv, room }); };
  L.forEach((lv, iLv) => {
    const P2 = pieces(lv.id) || [], E = (plan.elec || []).filter((e) => e.lv === lv.id);
    for (const r of P2) {
      const dans = E.filter((e) => r.contient(e));
      if (!toutes && !dans.some((e) => estKNX(e.type))) continue;
      if (dans.some((e) => LUMIERES.has(e.type))) {
        add(1, iLv, `lum:${lv.id}:${r.id}`, `Éclairage ${r.name} — marche/arrêt`, '1.001', lv.id, r.id);
        add(1, iLv, `lumE:${lv.id}:${r.id}`, `Éclairage ${r.name} — état`, '1.001', lv.id, r.id);
        if (dans.some((e) => VARIATEURS.has(e.type))) { add(1, iLv, `var:${lv.id}:${r.id}`, `Éclairage ${r.name} — variation`, '3.007', lv.id, r.id); add(1, iLv, `val:${lv.id}:${r.id}`, `Éclairage ${r.name} — valeur`, '5.001', lv.id, r.id); }
      }
      if (dans.some((e) => VOLETS.has(e.type))) {
        add(2, iLv, `vol:${lv.id}:${r.id}`, `Volets ${r.name} — montée/descente`, '1.008', lv.id, r.id);
        add(2, iLv, `stop:${lv.id}:${r.id}`, `Volets ${r.name} — arrêt`, '1.007', lv.id, r.id);
        add(2, iLv, `pos:${lv.id}:${r.id}`, `Volets ${r.name} — position`, '5.001', lv.id, r.id);
      }
      if (dans.some((e) => CHAUFFAGE.has(e.type) || e.type === 'knx_thermo' || e.type === 'thermostat')) {
        add(3, iLv, `tmes:${lv.id}:${r.id}`, `Chauffage ${r.name} — température mesurée`, '9.001', lv.id, r.id);
        add(3, iLv, `tcon:${lv.id}:${r.id}`, `Chauffage ${r.name} — consigne`, '9.001', lv.id, r.id);
        add(3, iLv, `tcmd:${lv.id}:${r.id}`, `Chauffage ${r.name} — commande`, '5.001', lv.id, r.id);
      }
    }
  });
  if ((plan.elec || []).some((e) => e.type === 'knx_meteo')) {
    add(4, 0, 'met:vent', 'Météo — vitesse du vent', '9.005'); add(4, 0, 'met:pluie', 'Météo — pluie', '1.005');
    add(4, 0, 'met:lux', 'Météo — luminosité', '9.004'); add(4, 0, 'met:temp', 'Météo — température extérieure', '9.001');
  }
  if ((plan.elec || []).some((e) => e.type === 'knx_compteur')) add(4, 1, 'cpt:1', 'Compteur — énergie active', '13.010');
  if (out.some((g) => g.cle.startsWith('lum:'))) add(0, 0, 'central:lum', 'Central — tout éteindre', '1.001');
  if (out.some((g) => g.cle.startsWith('vol:'))) add(0, 0, 'central:vol', 'Central — tous les volets', '1.008');
  return out;
}
/* ajoute au plan les groupes proposés qui n'y sont pas encore (même clé) ; ne supprime ni ne renomme rien.
   Les adresses déjà prises sont évitées. Renvoie le nombre de groupes ajoutés. */
function ajouterGroupes(plan, propositions, uid) {
  if (!plan.knx || typeof plan.knx !== 'object') plan.knx = {};
  if (!Array.isArray(plan.knx.groupes)) plan.knx.groupes = [];
  const G = plan.knx.groupes, cles = new Set(G.map((g) => g.cle)), prises = new Set(G.map((g) => g.adr));
  let n = 0;
  for (const p of propositions) {
    if (cles.has(p.cle)) continue;
    let [a, b, c] = p.adr.split('/').map(Number);
    while (prises.has(`${a}/${b}/${c}`)) c++;
    const g = Object.assign({ id: uid ? uid('g') : 'g' + (G.length + 1) }, p, { adr: `${a}/${b}/${c}` });
    G.push(g); prises.add(g.adr); cles.add(g.cle); n++;
  }
  G.sort((x, y) => cmpAdr(x.adr, y.adr));
  return n;
}
const cmpAdr = (x, y) => { const a = x.split('/').map(Number), b = y.split('/').map(Number); return a[0] - b[0] || a[1] - b[1] || a[2] - b[2]; };

/* ---------------- relier au bus (proposition, le plan n'est pas modifié) ----------------
   Arbre de proximité : chaque appareil non relié est raccordé à l'appareil déjà relié le plus proche (ou à
   l'alimentation), par une gaine au plafond puis une descente dans le mur. Renvoie { cables: [{ lv, sys, pts, a, b, len, kind, pose }], echecs } */
function cablesBus(plan, lv, seulement) {
  const tmp = Object.assign({}, plan, { ducts: (plan.ducts || []).slice() }), out = { cables: [], echecs: [] };
  const dev = (plan.elec || []).filter((e) => e.lv === lv && estKNX(e.type));
  const { lignes } = lignesKNX(plan), relies = new Set();
  for (const L of lignes) for (const e of L.appareils) relies.add(e.id);
  let a_relier = dev.filter((e) => !relies.has(e.id) && (!seulement || seulement.includes(e.id)));
  const dans = dev.filter((e) => relies.has(e.id));
  if (!dans.length && a_relier.length) {
    /* aucun bus encore : on part de l'alimentation (ou, pour un seul appareil, du plus proche des autres) */
    const libres = dev.filter((e) => !relies.has(e.id));
    const depart = libres.find((e) => ROLE[e.type] === 'alim' && !a_relier.includes(e)) || a_relier.find((e) => ROLE[e.type] === 'alim')
      || (seulement ? libres.filter((e) => !a_relier.includes(e)).sort((p, q) => Math.hypot(p.x - a_relier[0].x, p.y - a_relier[0].y) - Math.hypot(q.x - a_relier[0].x, q.y - a_relier[0].y))[0] : null) || a_relier[0];
    dans.push(depart); a_relier = a_relier.filter((e) => e !== depart);
  }
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  while (a_relier.length) {
    let best = null;
    for (const e of a_relier) for (const f of dans) { const d = d2(e, f); if (!best || d < best.d) best = { e, f, d }; }
    a_relier = a_relier.filter((x) => x !== best.e);
    const r = itineraireEntre(tmp, lv, best.f, ancrage(best.f), best.e, ancrage(best.e), { pose: 'plafond' });
    if (!r) { out.echecs.push(best.e.id); continue; }
    const g = { lv, sys: 'elec', pts: r.pts, a: best.f.id, b: best.e.id, len: r.len, kind: 'icta', pose: 'plafond' };
    tmp.ducts.push(Object.assign({ id: '~knx' + out.cables.length }, g)); out.cables.push(g); dans.push(best.e);
  }
  return out;
}

/* ---------------- exports CSV ---------------- */
const q = (s) => '"' + String(s == null ? '' : s).replace(/"/g, '""') + '"';
/* adresses de groupe à trois niveaux (point-virgule, guillemets) : à vérifier à l'import dans l'outil de programmation */
function csvGroupes(plan, nomNiveau) {
  const G = (plan.knx && plan.knx.groupes) || [];
  const lignes = [['Groupe principal', 'Groupe médian', 'Sous-groupe', 'Adresse', 'Nom', 'DPT'].map(q).join(';')];
  for (const g of G) { const [a, b] = g.adr.split('/'); lignes.push([PRINCIPAUX[a] || 'Groupe ' + a, nomNiveau ? nomNiveau(+b) : 'Médian ' + b, g.nom, g.adr, g.nom, g.dpt ? 'DPST-' + g.dpt.replace('.', '-').replace(/-0*(\d)/, '-$1') : ''].map(q).join(';')); }
  return lignes.join('\r\n') + '\r\n';
}
function csvParticipants(plan, nomType, pieceDe) {
  const { adresses } = adressesPhysiques(plan), { lignes } = lignesKNX(plan), ligneDe = new Map();
  for (const L of lignes) for (const e of L.appareils) ligneDe.set(e.id, L.n);
  const out = [['Adresse physique', 'Appareil', 'Ligne', 'Pièce', 'Consommation bus (mA)', 'Statut'].map(q).join(';')];
  for (const e of plan.elec || []) {
    if (!estKNX(e.type)) continue;
    const a = adresses.get(e.id), m = maDe(e);
    out.push([a && a.pa ? a.pa.join('.') : (ROLE[e.type] === 'alim' ? '(alimentation)' : '(non relié)'), nomType ? nomType(e.type) : e.type, ligneDe.get(e.id) || '', pieceDe ? pieceDe(e) : '', m.v, m.st].map(q).join(';'));
  }
  return out.join('\r\n') + '\r\n';
}

/* ---------------- nettoyage (migration v20, ouverture d'un plan) ---------------- */
function nettoyerDonnee(d, max) {
  if (!d || typeof d !== 'object' || !isNum(d.v) || d.v < 0 || d.v > max) return null;
  const st = ['verifiee', 'saisie', 'estimee'].includes(d.st) && (d.st !== 'verifiee' || d.src) ? d.st : 'saisie';
  return Object.assign({ v: d.v, st }, d.src ? { src: String(d.src).slice(0, 300) } : {});
}
function nettoyerKnxElec(e) {
  if (!e || typeof e !== 'object' || !('knx' in e)) return e;
  const k = e.knx; if (!estKNX(e.type) || !k || typeof k !== 'object' || Array.isArray(k)) { delete e.knx; return e; }
  const o = {};
  if (parsePA(k.pa)) o.pa = parsePA(k.pa).join('.');
  const ma = nettoyerDonnee(k.ma, 1000), al = nettoyerDonnee(k.alim, 5000);
  if (ma) o.ma = ma; if (al && e.type === 'knx_alim') o.alim = al;
  if (Object.keys(o).length) e.knx = o; else delete e.knx;
  return e;
}
function nettoyerKnxPlan(p) {
  if (!('knx' in p)) return p;
  const k = p.knx; if (!k || typeof k !== 'object' || Array.isArray(k)) { delete p.knx; return p; }
  const o = {};
  if (isNum(k.zone) && k.zone >= 0 && k.zone <= 15) o.zone = Math.round(k.zone);
  const vus = new Set();
  o.groupes = (Array.isArray(k.groupes) ? k.groupes : []).filter((g) => g && typeof g === 'object' && /^\d{1,2}\/\d{1,2}\/\d{1,3}$/.test(g.adr) && !vus.has(g.adr) && vus.add(g.adr))
    .map((g) => Object.assign({ id: typeof g.id === 'string' && g.id ? g.id : 'g' + g.adr.replace(/\//g, '_'), adr: g.adr, nom: typeof g.nom === 'string' ? g.nom.slice(0, 120) : g.adr },
      DPT[g.dpt] || /^\d{1,3}\.\d{3}$/.test(g.dpt || '') ? { dpt: g.dpt } : {}, typeof g.cle === 'string' ? { cle: g.cle } : {}, typeof g.lv === 'string' ? { lv: g.lv } : {}, typeof g.room === 'string' ? { room: g.room } : {}));
  p.knx = o;
  return p;
}

export { bilanCourant, cablesBus };
export { ALIM_CHOIX, ALIM_DEF, DPT, LIMITES, MA_DEF, PRINCIPAUX, ROLE, SRC_TOPO, adressesPhysiques, ajouterGroupes, alimDe, besoinsSorties, cmpAdr, controlesKNX,
  csvGroupes, csvParticipants, distancesBus, lignesKNX, maDe, nettoyerKnxElec, nettoyerKnxPlan, parsePA, proposerGroupes };

/* Calque — module « affectation » : relier aux circuits les appareils qui n'en ont pas, SANS toucher aux circuits
   existants (contrairement à « Régénérer depuis le plan », qui remplace tout le tableau).
   JavaScript pur, sans accès à l'écran : testable avec Node. Le plan n'est pas modifié : renvoie une proposition.

   Règles (les mêmes que la génération du tableau) :
   - éclairage, prises, prises de la cuisine, chauffage : l'appareil rejoint un circuit existant du même type et du même
     niveau, de préférence dans la même pièce, puis le plus proche, sans dépasser le maximum du circuit
     (8 points d'éclairage ; 12 socles en 2,5 mm², 8 en 1,5 mm², 6 en cuisine ; 3 500 W en 16 A, 4 500 W en 20 A) ;
     sinon un circuit est créé ;
   - commandes et accessoires d'éclairage : le circuit du point lumineux qu'ils commandent, ou de la même pièce ;
   - appareils à circuit dédié (plaque, lave-linge, four, borne…) : un circuit chacun ;
   - VMC, volets, motorisations, communication, alarme, sonnette : le circuit existant de ce type, sinon un nouveau.
   Un circuit créé est rattaché à un interrupteur différentiel existant de type admis (tableau de l'extrait Legrand,
   p. 13) qui protège moins de 8 circuits, le moins chargé ; s'il n'y en a pas, à aucun (le contrôle le signale),
   sauf la borne de recharge, qui reçoit son propre différentiel (comme à la génération). */
import { uid } from './noyau.js';
import { ACCESS, ALARM, CK, CMDS, DEDIC, LIGHTS, LIGHT_ACC, NO_CIRCUIT, SOCKETS, SPOTLIKE, accepts, defaultKindFor, elecPower } from './elecdonnees.js';
import { ELEC_BY } from './symboles.js';
import { TABLES } from './normes.js';

const PARTAGES = new Set(['eclairage', 'prises', 'prises_cuisine', 'chauffage']);
const GROUPES = new Set(['vmc', 'volets', 'motorisation', 'communication', 'alarme', 'sonnette']);
const typesAdmis = () => { const t = TABLES.find((x) => x.id === 'differentiels_logement'); return (t && t.statut === 'verifiee' && t.donnees && t.donnees.types) || {}; };
const sansCircuit = (e) => !NO_CIRCUIT.has(e.type) && !e.cid && !(ALARM.has(e.type) && e.type !== 'centrale');

/* capacité d'un circuit partagé : { n (actuel), max } dans l'unité du circuit */
function charge(c, membres) {
  const k = CK[c.kind] || {};
  if (k.unit === 'pt') return { n: membres.filter((e) => LIGHTS.has(e.type)).length, max: 8, poids: (e) => (LIGHTS.has(e.type) ? 1 : 0) }; // spots comptés 1 chacun (prudent)
  if (k.unit === 'socle') return { n: membres.reduce((s, e) => s + (e.type === 'com' ? 2 : SOCKETS[e.type] || 0), 0), max: c.kind === 'prises_cuisine' ? 6 : c.sec >= 2.5 ? 12 : 8, poids: (e) => (e.type === 'com' ? 2 : SOCKETS[e.type] || 0) };
  if (k.unit === 'W') return { n: membres.reduce((s, e) => s + elecPower(e), 0), max: c.cal >= 20 ? 4500 : 3500, poids: (e) => elecPower(e) };
  return { n: membres.length, max: 1, poids: () => 1 };
}

/* plan ; ctx.piece(e) → { id, nom } de la pièce du symbole (ou null). Renvoie { affectations: [{ id, cid }],
   circuits: [nouveaux circuits], rcds: [nouveaux différentiels], restants: [ids non reliés], existants: n } */
function relierSansCircuit(plan, ctx) {
  const piece = (ctx && ctx.piece) || (() => null);
  const elec = plan.elec || [], circuits = (plan.circuits || []).slice(), rcds = (plan.rcds || []).slice();
  const out = { affectations: [], circuits: [], rcds: [], restants: [], existants: circuits.length };
  const cid = new Map(elec.filter((e) => e.cid).map((e) => [e.id, e.cid])); // état courant (avec les affectations faites)
  const membres = (c) => elec.filter((e) => cid.get(e.id) === c.id);
  const parId = new Map(elec.map((e) => [e.id, e]));
  const nbParRcd = new Map(); for (const c of circuits) if (c.rcd) nbParRcd.set(c.rcd, (nbParRcd.get(c.rcd) || 0) + 1);
  const admis = typesAdmis();
  const rcdPour = (kind) => {
    if (CK[kind] && CK[kind].ownRcd) { const r = { id: uid('d'), type: 'A', cal: 40 }; rcds.push(r); out.rcds.push(r); return r.id; }
    const ok = admis[kind];
    const c = rcds.filter((r) => (nbParRcd.get(r.id) || 0) < 8 && (!ok || ok.includes(r.type)));
    c.sort((a, b) => (nbParRcd.get(a.id) || 0) - (nbParRcd.get(b.id) || 0));
    return c.length ? c[0].id : null;
  };
  const creer = (kind, nom, extra) => {
    const k = CK[kind] || CK.autre;
    const c = Object.assign({ id: uid('c'), kind, name: nom, cal: k.cal, sec: k.sec, rcd: null, dda: false, ctrl: k.ctrl || null }, extra || {});
    c.rcd = rcdPour(kind); if (c.rcd) nbParRcd.set(c.rcd, (nbParRcd.get(c.rcd) || 0) + 1);
    circuits.push(c); out.circuits.push(c); return c;
  };
  const relier = (e, c) => { cid.set(e.id, c.id); out.affectations.push({ id: e.id, cid: c.id }); };
  const d2 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const cuisine = (p) => p && /cuisine/i.test(p.nom || '');
  const kindDe = (e) => { const p = piece(e); if (e.type in SOCKETS && (cuisine(p) || e.type === 'pc_pt' || e.type === 'pc_escam')) return 'prises_cuisine'; return defaultKindFor(e.type); };

  const orphelins = elec.filter(sansCircuit);
  const rang = (e) => (LIGHTS.has(e.type) ? 0 : e.type in SOCKETS ? 1 : CMDS.has(e.type) || LIGHT_ACC.has(e.type) ? 3 : 2);
  orphelins.sort((a, b) => rang(a) - rang(b));
  for (const e of orphelins) {
    const p = piece(e), kind = kindDe(e);
    if (!kind) { out.restants.push(e.id); continue; }
    /* commandes et accessoires : suivent l'éclairage qu'ils commandent, ou celui de la pièce */
    if (CMDS.has(e.type) || (LIGHT_ACC.has(e.type) && e.type !== 'pc_rasoir')) {
      const lie = (plan.links || []).filter((l) => l.a === e.id || l.b === e.id).map((l) => parId.get(l.a === e.id ? l.b : l.a)).find((x) => x && cid.get(x.id));
      const meme = lie || elec.find((x) => LIGHTS.has(x.type) && cid.get(x.id) && x.lv === e.lv && p && piece(x) && piece(x).id === p.id);
      const c = meme ? circuits.find((q) => q.id === cid.get(meme.id)) : circuits.find((q) => q.kind === 'eclairage' && membres(q).some((x) => x.lv === e.lv));
      if (c) relier(e, c); else out.restants.push(e.id);
      continue;
    }
    if (PARTAGES.has(kind)) {
      let best = null;
      for (const c of circuits) {
        if (c.kind !== kind || !accepts(c.kind, e.type)) continue;
        const m = membres(c); if (m.length && !m.some((x) => x.lv === e.lv)) continue; // un circuit partagé reste sur son niveau
        const ch = charge(c, m); if (ch.n + ch.poids(e) > ch.max) continue;
        const memePiece = p && m.some((x) => piece(x) && piece(x).id === p.id);
        const dist = m.length ? Math.min(...m.map((x) => d2(x, e))) : 5000;
        const score = (memePiece ? 0 : 1e6) + dist;
        if (!best || score < best.score) best = { c, score };
      }
      if (best) { relier(e, best.c); continue; }
      const nom = `${CK[kind].n}${p && p.nom ? ' ' + p.nom.toLowerCase() : ''}`;
      const c = creer(kind, nom, kind === 'prises' && p && /chambre/i.test(p.nom) ? { dda: true } : kind === 'chauffage' && elecPower(e) > 3500 ? { cal: 20, sec: 2.5 } : null);
      relier(e, c); continue;
    }
    if (GROUPES.has(kind)) {
      const c = circuits.find((q) => q.kind === kind) || creer(kind, CK[kind].n);
      relier(e, c); continue;
    }
    /* circuit dédié : un par appareil */
    const nom = kind === 'cuisson' ? 'Plaque de cuisson' : e.type in DEDIC && CK[kind] ? CK[kind].n : (ELEC_BY.get(e.type) || {}).n || (CK[kind] || CK.autre).n;
    relier(e, creer(CK[kind] ? kind : 'autre', nom));
  }
  return out;
}
/* nombre d'appareils sans circuit (même définition que le contrôle « cq_sans_circuit ») */
const nbSansCircuit = (plan) => (plan.elec || []).filter(sansCircuit).length;

export { nbSansCircuit, relierSansCircuit, sansCircuit };

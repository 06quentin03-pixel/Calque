/* Calque — module « electricite » : électricité : circuits, tableau, contrôle NF C 15-100.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { C, IDX, NF0, NF1, P, inPoly, isNum, levelsSorted, uid, vadd, vdist, vmul, vsub } from './noyau.js';
import { geo } from './geometrie.js';
import { itemToLocal, itemToWorld } from './mutations.js';
import { ELEC_BY, S_ELEC } from './symboles.js';
import { V } from './rendu2d.js';
import { vmcChecks } from './reseaux.js';
import { interiorSide } from './interaction.js';
import { ACCEPT, ACCESS, ALARM, AUTONOMOUS, CALS, CK, CMDS, CMDS_FREE_H, COMM_OUTLETS, DEDIC, HEAT_MAX, KIND_ORDER,
  LIGHTS, LIGHT_ACC, LINK_TARGETS, NO_CIRCUIT, SECS, SEC_MAX, SOCKETS, SPEC, SPOTLIKE, accepts, agcpLabel, agcpOf, circLoad,
  defaultInstall, defaultKindFor, elecPower, isSpecOutlet } from './elecdonnees.js';

/* ============================================================
   CALQUE — électricité : circuits, tableau, conformité
   Références : NF C 15-100 (révision 2024, obligatoire pour les
   permis déposés à partir du 1er septembre 2025), installation
   monophasée 230 V d'un logement.
   ============================================================ */
const CIRC_COLORS = ['#2356C4', '#C2410C', '#15803D', '#7C3AED', '#B91C1C', '#0E7490', '#A16207', '#BE185D', '#4D7C0F', '#1E40AF', '#9A3412', '#047857', '#6D28D9', '#0369A1'];
const CIRC_COLORS_DK = ['#7FA8FF', '#FF9A5C', '#5FD08A', '#B794FF', '#FF7A7A', '#4FD1E8', '#E8C054', '#FF79B8', '#A3D65A', '#8FB4FF', '#FFB07A', '#4ADEB0', '#C9A6FF', '#62C4FF'];
function isDarkTheme() { const c = C.paper || '#fff'; const m = c.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i); if (!m) return false; return (parseInt(m[1], 16) + parseInt(m[2], 16) + parseInt(m[3], 16)) / 3 < 100; }
function circuitColor(cid, forceLight) {
  const i = P.circuits.findIndex((c) => c.id === cid);
  if (i < 0) return null;
  const pal = !forceLight && isDarkTheme() ? CIRC_COLORS_DK : CIRC_COLORS;
  return pal[i % pal.length];
}

/* ---------------- accès & comptage ---------------- */
const circById = (id) => P.circuits.find((c) => c.id === id) || null;
const rcdById = (id) => P.rcds.find((r) => r.id === id) || null;
function circMembers(cid) { return P.elec.filter((e) => e.cid === cid); }
function roomAt(e) {
  const g = geo(e.lv);
  for (const r of g.rooms) if (inPoly(e, r.loop)) return r;
  return null;
}
function roomName(r) { return r && r.label ? r.label.name : 'Extérieur'; }
function circStats(c) {
  const ms = circMembers(c.id);
  const k = CK[c.kind] || CK.autre;
  let count = 0, max = null, unit = k.unit;
  if (unit === 'pt') {
    const byRoom = new Map();
    for (const e of ms) {
      if (!LIGHTS.has(e.type)) continue;
      if (SPOTLIKE.has(e.type)) { const r = roomAt(e); const key = e.lv + ':' + (r && r.label ? r.label.id : 'ext'); byRoom.set(key, (byRoom.get(key) || 0) + elecPower(e)); }
      else count++;
    }
    for (const va of byRoom.values()) count += Math.max(1, Math.ceil(va / 300));
    max = 8;
  } else if (unit === 'socle') {
    for (const e of ms) count += e.type === 'com' ? 2 : SOCKETS[e.type] || 0;
    max = c.kind === 'prises_cuisine' ? 6 : c.sec >= 2.5 ? 12 : 8;
  } else if (unit === 'W') {
    for (const e of ms) count += elecPower(e);
    max = HEAT_MAX[c.cal] || null;
  } else if (unit === 'app') {
    count = ms.filter((e) => !CMDS.has(e.type)).length;
    max = 1;
  }
  return { ms, count, max, unit, over: max != null && count > max };
}
function fmtCount(st) {
  if (st.unit === 'pt') return `${st.count} / ${st.max} point${st.max > 1 ? 's' : ''}`;
  if (st.unit === 'socle') return `${st.count} / ${st.max} socles`;
  if (st.unit === 'W') return `${NF0.format(st.count)} / ${st.max ? NF0.format(st.max) : '—'} W`;
  if (st.unit === 'app') return st.count ? `${st.count} appareil${st.count > 1 ? 's' : ''}` : 'aucun appareil relié';
  const n = st.ms.length; return n ? `${n} symbole${n > 1 ? 's' : ''}` : 'aucun symbole relié';
}
function rcdCircuits(rid) { return P.circuits.filter((c) => c.rcd === rid); }
function rcdLoad(rid) { return rcdCircuits(rid).reduce((s, c) => s + circLoad(c), 0); }
function circNumbers() {
  const m = new Map(); let i = 1;
  for (const r of P.rcds) for (const c of rcdCircuits(r.id)) m.set(c.id, 'C' + i++);
  for (const c of P.circuits) if (!m.has(c.id)) m.set(c.id, 'C' + i++);
  return m;
}
function rcdNumbers() { const m = new Map(); P.rcds.forEach((r, i) => m.set(r.id, 'ID' + (i + 1))); return m; }
function orderCircuits() {
  const ro = new Map(P.rcds.map((r, i) => [r.id, i]));
  P.circuits.sort((a, b) => (ro.has(a.rcd) ? ro.get(a.rcd) : 99) - (ro.has(b.rcd) ? ro.get(b.rcd) : 99) || KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind));
}
function circuitLabel(c, nums) { nums = nums || circNumbers(); return `${nums.get(c.id) || '?'} · ${c.name}`; }

/* ---------------- liaisons ---------------- */
function linkAnchor(e) {
  const def = ELEC_BY.get(e.type); const u = Math.max(S_ELEC, 20 / V.s);
  return def && def.wall ? itemToWorld(e, 0, 0.42 * u) : { x: e.x, y: e.y };
}
function toggleLink(a, b) {
  const i = P.links.findIndex((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
  if (i >= 0) { P.links.splice(i, 1); return false; }
  const ea = IDX.elec.get(a), eb = IDX.elec.get(b);
  P.links.push({ id: uid('k'), lv: ea.lv, a, b });
  if (ea && eb) {
    const ca = ea.cid && circById(ea.cid), cb = eb.cid && circById(eb.cid);
    if (cb && !ca && cb.kind === 'eclairage') ea.cid = cb.id;
    else if (ca && !cb && ca.kind === 'eclairage' && accepts('eclairage', eb.type)) eb.cid = ca.id;
  }
  return true;
}
function cleanLinks() { P.links = P.links.filter((l) => IDX.elec.has(l.a) && IDX.elec.has(l.b)); }

/* ---------------- génération depuis le plan ---------------- */
function nearItem(e, types, maxD) {
  let best = null, bd = maxD;
  for (const it of P.items) {
    if (it.lv !== e.lv || !types.includes(it.type)) continue;
    const l = itemToLocal(it, e);
    const dx = Math.max(0, Math.abs(l.x) - it.w / 2), dy = Math.max(0, Math.abs(l.y) - it.d / 2);
    const d = Math.hypot(dx, dy);
    if (d <= bd) { bd = d; best = it; }
  }
  return best;
}
function packUnits(units, max) {
  // units : [{n, label, list}] dans l'ordre ; regroupe sans dépasser max, en équilibrant
  const total = units.reduce((s, u) => s + u.n, 0);
  if (!total) return [];
  const nC = Math.max(1, Math.ceil(total / max));
  const target = total / nC;
  const out = []; let cur = null;
  for (const u of units) {
    if (u.n > max) { // pièce trop grosse : on la découpe
      let rest = u.list.slice(), restN = u.n;
      while (restN > 0) {
        const take = []; let n = 0;
        while (rest.length && n + u.w(rest[0]) <= max) { n += u.w(rest[0]); take.push(rest.shift()); }
        if (!take.length) take.push(rest.shift()), n = 1;
        out.push({ n, labels: [u.label], list: take }); restN -= n;
      }
      cur = null; continue;
    }
    if (!cur || cur.n + u.n > max || (cur.n >= target * 0.95 && out.length < nC)) { cur = { n: 0, labels: [], list: [] }; out.push(cur); }
    cur.n += u.n; if (!cur.labels.includes(u.label)) cur.labels.push(u.label); cur.list.push(...u.list);
  }
  return out;
}
function namesOf(labels, prefix, lvName) {
  const L = [...new Set(labels.filter(Boolean))].map((s) => s.toLowerCase());
  if (!L.length) return prefix;
  if (L.length <= 3) return prefix + ' ' + L.join(', ');
  return prefix + ' ' + L.slice(0, 2).join(', ') + ' et ' + (L.length - 2) + ' autres';
}
function generateFromPlan() {
  const circs = [];
  const mk = (kind, name, extra) => { const k = CK[kind]; const c = Object.assign({ id: uid('c'), kind, name, cal: k.cal, sec: k.sec, rcd: null, dda: false, ctrl: k.ctrl || null }, extra || {}); circs.push(c); return c; };
  for (const e of P.elec) delete e.cid;
  const levels = levelsSorted();
  const roomOrder = (r) => (r ? (r.label ? r.label.y * 0.001 + r.label.x * 0.000001 : 0) : 1e9);
  const mainRooms = new Set();
  for (const lv of levels) {
    const lvName = lv.name;
    const syms = P.elec.filter((e) => e.lv === lv.id).map((e) => ({ e, r: roomAt(e) }));
    const byRoom = (list, wfn) => {
      const m = new Map();
      for (const x of list) { const key = x.r && x.r.label ? x.r.label.id : 'ext'; if (!m.has(key)) m.set(key, { r: x.r, list: [] }); m.get(key).list.push(x.e); }
      return [...m.values()].sort((a, b) => roomOrder(a.r) - roomOrder(b.r)).map((g) => ({ label: roomName(g.r), list: g.list, w: wfn, n: g.list.reduce((s, e) => s + wfn(e), 0), r: g.r }));
    };
    for (const x of syms) if (x.r && x.r.label && /s[ée]jour|chambre|salon|bureau/i.test(x.r.label.name)) mainRooms.add(x.r.label.id);
    // éclairage
    const lights = syms.filter((x) => LIGHTS.has(x.e.type));
    const lu = byRoom(lights, () => 1).map((u) => {
      const spots = u.list.filter((e) => SPOTLIKE.has(e.type));
      const va = spots.reduce((s, e) => s + elecPower(e), 0);
      u.n = u.list.length - spots.length + (spots.length ? Math.max(1, Math.ceil(va / 300)) : 0);
      return u;
    });
    let packs = packUnits(lu, 8);
    if (packs.length === 1 && lu.length >= 2 && mainRooms.size >= 2) {
      const half = Math.ceil(lu.length / 2);
      packs = [lu.slice(0, half), lu.slice(half)].map((g) => ({ n: g.reduce((s, u) => s + u.n, 0), labels: g.map((u) => u.label), list: g.flatMap((u) => u.list) }));
    }
    for (const p of packs) { const c = mk('eclairage', namesOf(p.labels, 'Éclairage', lvName)); for (const e of p.list) e.cid = c.id; }
    // prises
    const isKitchen = (x) => x.r && x.r.label && /cuisine/i.test(x.r.label.name);
    const sk = syms.filter((x) => x.e.type in SOCKETS);
    const kitchen = sk.filter((x) => isKitchen(x) || x.e.type === 'pc_pt' || x.e.type === 'pc_escam');
    const overflow = [];
    if (kitchen.length) {
      const ku = byRoom(kitchen, (e) => SOCKETS[e.type]);
      const kp = packUnits(ku, 6);
      kp.forEach((p, i) => { const c = mk('prises_cuisine', 'Prises cuisine' + (kp.length > 1 ? ' ' + (i + 1) : '') + (levels.length > 1 && lv.elev !== 0 ? ' (' + lvName + ')' : '')); for (const e of p.list) e.cid = c.id; });
    }
    const general = sk.filter((x) => !kitchen.includes(x)).concat(overflow);
    const gp = packUnits(byRoom(general, (e) => SOCKETS[e.type]), 12);
    for (const p of gp) {
      const c = mk('prises', namesOf(p.labels, 'Prises', lvName));
      if (p.labels.some((l) => /chambre/i.test(l))) c.dda = true;
      for (const e of p.list) e.cid = c.id;
    }
    // spécialisés 20 A : chaque prise est associée à l'appareil le plus proche, un appareil par prise
    const APP = ['lave_linge', 'seche_linge', 'lave_vaisselle', 'four', 'colonne', 'congelateur', 'frigo', 'frigo_us', 'micro_ondes', 'hotte'];
    const map = { lave_linge: 'lave_linge', seche_linge: 'seche_linge', lave_vaisselle: 'lave_vaisselle', four: 'four', colonne: 'four', congelateur: 'congelateur', hotte: 'hotte' };
    const p20 = syms.filter((s) => s.e.type === 'pc20');
    const pairs = [];
    for (const x of p20) for (const it of P.items) {
      if (it.lv !== lv.id || !APP.includes(it.type)) continue;
      const l = itemToLocal(it, x.e); const d = Math.hypot(Math.max(0, Math.abs(l.x) - it.w / 2), Math.max(0, Math.abs(l.y) - it.d / 2));
      if (d <= 160) pairs.push({ x, it, d });
    }
    pairs.sort((a, b) => a.d - b.d);
    const takenX = new Set(), takenI = new Set(), match = new Map();
    for (const pr of pairs) { if (takenX.has(pr.x) || takenI.has(pr.it)) continue; takenX.add(pr.x); takenI.add(pr.it); match.set(pr.x, pr.it); }
    for (const x of p20) {
      const it = match.get(x);
      const kind = it ? map[it.type] || 'specialise' : 'specialise';
      const nm = it ? (map[it.type] ? CK[map[it.type]].n : it.name || 'Circuit spécialisé') : 'Circuit spécialisé ' + roomName(x.r).toLowerCase();
      const c = mk(kind, nm); x.e.cid = c.id;
    }
    for (const x of syms.filter((s) => s.e.type === 'pc32')) { const c = mk('cuisson', 'Plaque de cuisson'); x.e.cid = c.id; }
    for (const x of syms.filter((s) => s.e.type in DEDIC)) { const k = DEDIC[x.e.type]; const c = mk(k, k === 'specialise' ? (ELEC_BY.get(x.e.type) || {}).n || CK[k].n : CK[k].n); x.e.cid = c.id; }
    for (const x of syms.filter((s) => s.e.type === 'sortie' || s.e.type === 'ce_elec' || s.e.type === 'ballon_thermo')) {
      if (x.e.type === 'ce_elec' || x.e.type === 'ballon_thermo' || nearItem(x.e, ['chauffe_eau'], 160)) { const c = mk('chauffe_eau', 'Chauffe-eau'); x.e.cid = c.id; }
      else if (nearItem(x.e, ['hotte'], 120)) { const c = mk('hotte', 'Hotte'); x.e.cid = c.id; }
      else { const c = mk('autre', 'Sortie de câble ' + roomName(x.r).toLowerCase()); x.e.cid = c.id; }
    }
    for (const x of syms.filter((s) => s.e.type === 'pc_tri')) { const c = mk('autre', 'Prise triphasée ' + roomName(x.r).toLowerCase(), { cal: 20, sec: 2.5 }); x.e.cid = c.id; }
    // chauffage : 4 500 W maxi par circuit (2,5 mm² / 20 A), 3 500 W en 1,5 mm² / 16 A
    const heat = syms.filter((x) => x.e.type === 'rad_elec' || x.e.type === 'seche_serv_e' || x.e.type === 'plancher' || x.e.type === 'soufflant_sdb');
    if (heat.length) {
      const hu = byRoom(heat, (e) => elecPower(e));
      const packsH = []; let cur = null;
      for (const u of hu) { if (!cur || cur.n + u.n > 4500) { cur = { n: 0, labels: [], list: [] }; packsH.push(cur); } cur.n += u.n; cur.labels.push(u.label); cur.list.push(...u.list); }
      for (const p of packsH) { const small = p.n <= 3500; const c = mk('chauffage', namesOf(p.labels, 'Chauffage', lvName), { cal: small ? 16 : 20, sec: small ? 1.5 : 2.5 }); for (const e of p.list) e.cid = c.id; }
      const th = syms.filter((x) => x.e.type === 'thermostat'); for (const x of th) { const c = circs.find((cc) => cc.kind === 'chauffage'); if (c) x.e.cid = c.id; }
    }
  }
  const all = P.elec;
  const vm = all.filter((e) => e.type === 'vmc' || e.type === 'vmc_groupe' || e.type === 'vmc_df'); if (vm.length) { const c = mk('vmc', 'VMC'); for (const e of vm) e.cid = c.id; }
  const vr = all.filter((e) => e.type === 'cmd_vr' || e.type === 'cmd_vr_c' || e.type === 'volet_mot' || e.type === 'velux_mot' || e.type === 'volet_bat'); if (vr.length) { const c = mk('volets', 'Volets roulants'); for (const e of vr) e.cid = c.id; }
  const mot = all.filter((e) => e.type === 'portail' || e.type === 'garage_mot' || e.type === 'store' || e.type === 'arrosage' || e.type === 'pergola'); if (mot.length) { const c = mk('motorisation', 'Motorisations'); for (const e of mot) e.cid = c.id; }
  for (const e of all.filter((x) => x.type === 'pac' || x.type === 'clim' || x.type === 'pac_int')) { const c = mk('pac', e.type === 'clim' ? 'Climatisation' : e.type === 'pac_int' ? 'Module hydraulique PAC' : 'Pompe à chaleur'); e.cid = c.id; }
  for (const e of all.filter((x) => x.type === 'borne_ve')) { const c = mk('irve', 'Borne de recharge véhicule'); e.cid = c.id; }
  for (const e of all.filter((x) => x.type === 'prise_ve')) { const c = mk('irve', 'Prise renforcée véhicule', { cal: 20, sec: 2.5 }); e.cid = c.id; }
  const com = all.filter((e) => e.type === 'com' || e.type === 'domo'); if (com.length) { const c = mk('communication', 'Coffret de communication'); for (const e of com) e.cid = c.id; }
  if (all.some((e) => e.type === 'centrale')) { const c = mk('alarme', 'Alarme'); for (const e of all.filter((x) => ALARM.has(x.type))) e.cid = c.id; }
  const so = all.filter((e) => ACCESS.has(e.type)); if (so.length) { const c = mk('sonnette', 'Sonnette / interphone'); for (const e of so) e.cid = c.id; }
  // appareils fixes sur leur propre circuit
  const OWN = { pompe: ['Pompe', 20, 2.5], moteur: ['Moteur / machine', 20, 2.5], chaudiere_e: ['Chaudière', 16, 1.5], tab_div: ['Tableau divisionnaire', 32, 6], onduleur: ['Onduleur photovoltaïque', 20, 2.5], coffret_ext: ['Coffret extérieur', 32, 6], coffret_piscine: ['Coffret piscine', 20, 2.5] };
  for (const e of all.filter((x) => OWN[x.type])) { const [n, cal, sec] = OWN[e.type]; const c = mk('autre', n, { cal, sec }); e.cid = c.id; }
  // accessoires (BAES, aérateur, ventilateur, transformateur, prise rasoir) : sur l'éclairage de la pièce
  for (const e of all.filter((x) => LIGHT_ACC.has(x.type))) {
    const r = roomAt(e);
    const pool = (e.type === 'pc_rasoir' ? all.filter((x) => x.type in SOCKETS && x.cid) : []).concat(all.filter((x) => LIGHTS.has(x.type) && x.cid));
    const same = r && pool.find((x) => x.lv === e.lv && roomAt(x) === r);
    if (same) { e.cid = same.cid; continue; }
    const any = circs.find((c) => c.kind === 'eclairage' && all.some((x) => x.cid === c.id && x.lv === e.lv)) || circs.find((c) => c.kind === 'eclairage');
    if (any) e.cid = any.id; else { const c = mk('autre', (ELEC_BY.get(e.type) || {}).n || 'Autre circuit'); e.cid = c.id; }
  }
  // commandes : rattachées au circuit des éclairages qu'elles commandent
  for (const e of all.filter((x) => CMDS.has(x.type))) {
    const linked = P.links.filter((l) => l.a === e.id || l.b === e.id).map((l) => IDX.elec.get(l.a === e.id ? l.b : l.a)).filter((x) => x && x.cid);
    if (linked.length) { e.cid = linked[0].cid; continue; }
    const r = roomAt(e);
    const same = all.find((x) => LIGHTS.has(x.type) && x.cid && x.lv === e.lv && r && roomAt(x) === r);
    if (same) e.cid = same.cid;
    else { const any = circs.find((c) => c.kind === 'eclairage'); if (any) e.cid = any.id; }
  }
  // télérupteur dès qu'un éclairage est commandé par bouton-poussoir
  for (const c of circs.filter((x) => x.kind === 'eclairage')) if (all.some((e) => e.cid === c.id && e.type === 'bp')) c.ctrl = 'telerupteur';
  P.circuits = circs;
  assignRcds();
  if (!P.install) P.install = defaultInstall();
}
function assignRcds() {
  const circs = P.circuits;
  const R = [];
  const mkR = (type, extra) => { const r = Object.assign({ id: uid('d'), type, cal: 40 }, extra || {}); R.push(r); return r; };
  for (const c of circs) c.rcd = null;
  const irve = circs.filter((c) => CK[c.kind] && CK[c.kind].ownRcd);
  const needA = circs.filter((c) => CK[c.kind] && CK[c.kind].typeA && !CK[c.kind].ownRcd);
  const others = circs.filter((c) => !(CK[c.kind] && CK[c.kind].typeA));
  const load = (list) => list.reduce((s, c) => s + circLoad(c), 0);
  // type A : cuisson, lave-linge
  let aGroups = [];
  if (needA.length) {
    let cur = []; aGroups.push(cur);
    for (const c of needA) { if (cur.length >= 8 || load(cur) + circLoad(c) > 63) { cur = []; aGroups.push(cur); } cur.push(c); }
  }
  // type AC : le reste, réparti pour rester à 40 A quand c'est possible
  // deux façons d'être conforme : calibre ≥ réglage de l'AGCP (63 A), ou calibre ≥ somme pondérée (40 A)
  const agcp = agcpOf((P.install || defaultInstall()).kva)[1];
  let nAC = Math.max(others.length ? 1 : 0, Math.ceil(others.length / 8), Math.ceil(load(others) / 40));
  const n63 = Math.max(others.length ? 1 : 0, Math.ceil(others.length / 8));
  if (agcp <= 63 && n63 < nAC) nAC = n63;
  if (nAC + aGroups.length < 2) nAC = 2 - aGroups.length;
  const acs = Array.from({ length: nAC }, () => []);
  const pick = (c, prefer) => {
    let best = -1;
    for (let i = 0; i < acs.length; i++) {
      if (acs[i].length >= 8) continue;
      if (best < 0) { best = i; continue; }
      const a = load(acs[i]) + circLoad(c), b = load(acs[best]) + circLoad(c);
      if (prefer != null && i === prefer && acs[i].length < 8) { best = i; break; }
      if (a < b - 0.01 || (Math.abs(a - b) < 0.01 && acs[i].length < acs[best].length)) best = i;
    }
    if (best < 0) { acs.push([]); best = acs.length - 1; }
    acs[best].push(c);
  };
  const byKind = (k) => others.filter((c) => c.kind === k);
  let rr = 0;
  for (const c of byKind('eclairage')) pick(c, rr++ % acs.length);
  for (const c of byKind('prises')) pick(c, rr++ % acs.length);
  const rest = others.filter((c) => c.kind !== 'eclairage' && c.kind !== 'prises').sort((a, b) => circLoad(b) - circLoad(a));
  for (const c of rest) pick(c, null);
  const used = acs.filter((g) => g.length);
  for (const g of used) { const r = mkR('AC'); for (const c of g) c.rcd = r.id; }
  for (const g of aGroups) { const r = mkR('A'); for (const c of g) c.rcd = r.id; }
  for (const c of irve) { const r = mkR('A', { own: true }); c.rcd = r.id; }
  // au moins 2 différentiels pour l'éclairage et les prises réunis
  const lp = circs.filter((c) => c.kind === 'eclairage' || c.kind === 'prises');
  const hosts = new Set(lp.map((c) => c.rcd));
  if (lp.length >= 2 && hosts.size < 2) {
    const target = R.find((r) => !r.own && !hosts.has(r.id) && rcdCircuitsIn(circs, r.id).length < 8);
    const mover = lp.find((c) => c.kind === 'eclairage') || lp[0];
    if (target) mover.rcd = target.id;
  }
  // calibres : 40 A si la somme le permet, sinon 63 A
  for (const r of R) { const l = rcdCircuitsIn(circs, r.id).reduce((s, c) => s + circLoad(c), 0); r.cal = l <= 40 ? 40 : 63; }
  P.rcds = R;
  orderCircuits();
}
function rcdCircuitsIn(circs, rid) { return circs.filter((c) => c.rcd === rid); }

/* ---------------- organisation du tableau ---------------- */
function panelLayout() {
  const inst = P.install || defaultInstall();
  const rowMods = inst.row || 13;
  const nums = circNumbers(), rn = rcdNumbers();
  const blocks = [];
  if (inst.parafoudre) blocks.push([{ k: 'pf', w: 2 }]);
  for (const r of P.rcds) {
    const b = [{ k: 'id', w: 2, r, label: rn.get(r.id) }];
    for (const c of rcdCircuits(r.id)) {
      b.push({ k: 'cb', w: 1, c, label: nums.get(c.id) });
      if (c.dda) b.push({ k: 'dda', w: 1, c });
      if (c.ctrl === 'contacteur') b.push({ k: 'km', w: 1, c });
      if (c.ctrl === 'telerupteur') b.push({ k: 'tl', w: 1, c });
      if (c.ctrl === 'minuterie') b.push({ k: 'mn', w: 1, c });
    }
    blocks.push(b);
  }
  const orphans = P.circuits.filter((c) => !rcdById(c.rcd));
  if (orphans.length) blocks.push(orphans.map((c) => ({ k: 'cb', w: 1, c, label: nums.get(c.id), orphan: true })));
  const rows = [];
  let cur = null;
  for (const b of blocks) {
    const bw = b.reduce((s, m) => s + m.w, 0);
    if (!cur || (bw <= rowMods && cur.used + bw > rowMods) || (bw <= rowMods && cur.used > 0 && b[0].k === 'id')) { cur = { mods: [], used: 0 }; rows.push(cur); }
    for (const m of b) { if (cur.used + m.w > rowMods) { cur = { mods: [], used: 0 }; rows.push(cur); } cur.mods.push(m); cur.used += m.w; }
  }
  let used = rows.reduce((s, r) => s + r.used, 0);
  while (rows.length * rowMods - used < Math.ceil(rows.length * rowMods * 0.2) || !rows.length) rows.push({ mods: [], used: 0 });
  const total = rows.length * rowMods;
  return { rows, rowMods, used, total, free: total - used, reserve: (total - used) / total };
}

/* ---------------- contrôle NF C 15-100 ---------------- */
function nfcChecks() {
  const out = [];
  const add = (sev, group, msg, ref, rule) => out.push({ sev, group, msg, ref, rule });
  const nums = circNumbers(), rn = rcdNumbers();
  const G1 = 'Tableau et protections', G2 = 'Circuits', G3 = 'Pièces', G4 = 'Hauteurs de pose';
  const circs = P.circuits, rcds = P.rcds;
  const inst = P.install || defaultInstall();
  if (!circs.length) { add('err', G1, 'Aucun circuit : générez le tableau à partir du plan ou ajoutez des circuits.', null); }
  // différentiels
  const nonOwn = rcds;
  if (circs.length) {
    if (nonOwn.length < 2) add('err', G1, `${nonOwn.length} interrupteur différentiel 30 mA : il en faut au moins 2.`, null, 'Au moins 2 dispositifs différentiels 30 mA par logement.');
    else add('ok', G1, `${nonOwn.length} interrupteurs différentiels 30 mA.`, null);
    if (!rcds.some((r) => r.type === 'A' || r.type === 'F') && circs.length) add('err', G1, 'Aucun différentiel de type A : obligatoire pour la plaque de cuisson et le lave-linge.', null);
  }
  for (const r of rcds) {
    const cs = rcdCircuits(r.id), l = rcdLoad(r.id), nm = rn.get(r.id);
    const ref = { t: 'rcd', id: r.id };
    if (cs.length > 8) add('err', G1, `${nm} protège ${cs.length} circuits : 8 au maximum.`, ref);
    if (!cs.length) add('warn', G1, `${nm} ne protège aucun circuit.`, ref);
    const agcp = agcpOf(inst.kva)[1];
    if (r.cal < l && r.cal < agcp) add('err', G1, `${nm} ${r.cal} A : la somme des protections en aval vaut ${NF1.format(l)} A et l'AGCP est réglé à ${agcp} A. Passez à ${l <= 63 ? '63 A' : 'deux différentiels'}.`, ref, 'Calibre ≥ réglage de l’AGCP, ou ≥ chauffage + chauffe-eau + IRVE + 50 % des autres circuits.');
    else if (cs.length) add('ok', G1, `${nm} ${r.cal} A type ${r.type} : charge calculée ${NF1.format(l)} A, ${cs.length} circuit${cs.length > 1 ? 's' : ''}.`, ref);
    if (r.own && cs.some((c) => c.kind !== 'irve')) add('err', G1, `${nm} est réservé à la borne de recharge : il ne doit protéger aucun autre circuit.`, ref);
  }
  for (const c of circs) {
    const k = CK[c.kind] || CK.autre, r = rcdById(c.rcd), ref = { t: 'circuit', id: c.id }, nm = nums.get(c.id);
    if (!r) { add('err', G1, `${nm} ${c.name} n'est protégé par aucun différentiel 30 mA.`, ref); continue; }
    if (k.typeA && r.type === 'AC') add('err', G1, `${nm} ${c.name} doit être sous un différentiel de type A (ou F), pas AC.`, ref, 'Type A obligatoire : plaque de cuisson, lave-linge, borne de recharge.');
    if (k.ownRcd && rcdCircuits(r.id).length > 1) add('err', G1, `${nm} ${c.name} : la borne doit avoir son propre différentiel 30 mA.`, ref);
  }
  const lp = circs.filter((c) => c.kind === 'eclairage' || c.kind === 'prises');
  if (lp.length >= 2) {
    const hosts = new Set(lp.map((c) => c.rcd).filter(Boolean));
    if (hosts.size < 2) add('err', G1, 'Les circuits d’éclairage et de prises sont tous sous le même différentiel : répartissez-les sur au moins 2.', null);
    else add('ok', G1, 'Éclairage et prises répartis sur plusieurs différentiels.', null);
  }
  if (circs.length) {
    const lay = panelLayout();
    if (lay.reserve < 0.2) add('err', G1, `Réserve de ${Math.round(lay.reserve * 100)} % : il faut au moins 20 % de modules libres.`, null);
    else add('ok', G1, `Réserve de ${Math.round(lay.reserve * 100)} % (${lay.free} modules libres sur ${lay.total}).`, null);
  }
  add(inst.parafoudre ? 'ok' : 'info', G1, inst.parafoudre ? 'Parafoudre prévu en tête du tableau (In ≥ 5 kA).' : 'Pas de parafoudre : il est obligatoire si le bâtiment a un paratonnerre et dans certaines zones exposées à la foudre.', null);
  // circuits
  const nLight = circs.filter((c) => c.kind === 'eclairage').length;
  for (const c of circs) {
    const st = circStats(c), ref = { t: 'circuit', id: c.id }, nm = nums.get(c.id);
    const smax = SEC_MAX[c.sec];
    if (smax && c.cal > smax) add('err', G2, `${nm} ${c.name} : ${c.sec} mm² n'admet pas plus de ${smax} A (disjoncteur de ${c.cal} A).`, ref);
    if (c.kind === 'eclairage' && c.cal > 16) add('err', G2, `${nm} ${c.name} : un circuit d'éclairage est protégé à 16 A au plus.`, ref);
    if (st.over) {
      const why = st.unit === 'pt' ? '8 points lumineux maximum par circuit (spots : 1 point par tranche de 300 VA).'
        : st.unit === 'socle' ? (c.kind === 'prises_cuisine' ? '6 socles maximum sur le circuit dédié de la cuisine.' : c.sec >= 2.5 ? '12 socles maximum en 2,5 mm² / 20 A.' : '8 socles maximum en 1,5 mm² / 16 A.')
        : st.unit === 'W' ? `${NF0.format(st.max)} W maximum pour un disjoncteur de ${c.cal} A.` : 'Un seul appareil par circuit spécialisé.';
      add('err', G2, `${nm} ${c.name} : ${fmtCount(st)}. ${why}`, ref);
    } else if (st.ms.length) add('ok', G2, `${nm} ${c.name} : ${fmtCount(st)}.`, ref);
    else add('info', G2, `${nm} ${c.name} : aucun symbole du plan n'y est relié.`, ref);
    if (c.kind === 'prises_cuisine') {
      const out2 = st.ms.filter((e) => { const r = roomAt(e); return !(r && r.label && /cuisine/i.test(r.label.name)); });
      if (out2.length) add('warn', G2, `${nm} ${c.name} alimente ${out2.length} prise${out2.length > 1 ? 's' : ''} hors de la cuisine : ce circuit doit lui être dédié.`, ref);
    }
    for (const e of st.ms) if (!accepts(c.kind, e.type)) { const d = ELEC_BY.get(e.type); add('warn', G2, `${d ? d.n : e.type} relié à ${nm} ${c.name}, qui n'est pas un circuit adapté.`, { t: 'elec', id: e.id }); }
  }
  const lightsOnPlan = P.elec.filter((e) => LIGHTS.has(e.type));
  const orphans = P.elec.filter((e) => !NO_CIRCUIT.has(e.type) && !e.cid && !(ALARM.has(e.type) && e.type !== 'centrale'));
  if (orphans.length) add('warn', G2, `${orphans.length} symbole${orphans.length > 1 ? 's' : ''} du plan sans circuit (${[...new Set(orphans.map((e) => (ELEC_BY.get(e.type) || {}).n))].slice(0, 3).join(', ')}${orphans.length > 3 ? '…' : ''}).`, { t: 'elec', id: orphans[0].id });
  const mainRooms = [];
  for (const L of P.levels) for (const r of geo(L.id).rooms) if (r.label && /s[ée]jour|chambre|salon/i.test(r.label.name)) mainRooms.push(r);
  if (mainRooms.length >= 2 && lightsOnPlan.length && nLight < 2) add('err', G2, `${nLight} circuit d'éclairage : il en faut au moins 2 quand le logement a 2 pièces principales ou plus.`, null);
  const nSpec = circs.filter((c) => CK[c.kind] && CK[c.kind].spec).length;
  if (circs.length) {
    if (nSpec < 3) add('err', G2, `${nSpec} circuit${nSpec > 1 ? 's' : ''} spécialisé${nSpec > 1 ? 's' : ''} (lave-linge, lave-vaisselle, sèche-linge, four, congélateur) : il en faut au moins 3.`, null);
    else add('ok', G2, `${nSpec} circuits spécialisés.`, null);
    const hasKitchen = P.rooms.some((r) => /cuisine/i.test(r.name));
    if (hasKitchen && !circs.some((c) => c.kind === 'cuisson')) add('err', G2, 'Pas de circuit de cuisson : une sortie 32 A en 6 mm² est obligatoire dans la cuisine.', null);
  }
  for (const c of circs.filter((x) => x.kind === 'prises' && !x.dda)) {
    if (circStats(c).ms.some((e) => { const r = roomAt(e); return r && r.label && /chambre/i.test(r.label.name); })) add('info', G2, `${nums.get(c.id)} ${c.name} dessert une chambre : un détecteur d'arc (DDA) est recommandé.`, { t: 'circuit', id: c.id });
  }
  if (!P.elec.some((e) => e.type === 'daaf')) add('err', G3, 'Aucun détecteur de fumée (DAAF) : au moins un par logement est obligatoire.', null);
  for (const e of P.elec.filter((x) => x.type === 'pc_2p')) add('err', G3, 'Prise sans terre : interdite en installation neuve, chaque prise doit avoir son contact de terre.', { t: 'elec', id: e.id });
  if (P.elec.some((e) => e.type === 'tableau') && !P.elec.some((e) => e.type === 'gtl')) add('info', G1, 'Pas de GTL sur le plan : en logement neuf, le tableau et le coffret de communication se placent dans une gaine technique logement.', null);
  // pièces
  for (const L of P.levels) {
    const g = geo(L.id);
    const els = P.elec.filter((e) => e.lv === L.id);
    for (const r of g.rooms) {
      if (!r.label) continue;
      const name = r.label.name, area = r.area / 10000, ref = { t: 'room', id: r.label.id, lv: L.id };
      const inside = els.filter((e) => inPoly(e, r.loop));
      const socles = inside.reduce((s, e) => s + (SOCKETS[e.type] || 0), 0);
      const pt = inside.filter((e) => e.type === 'pc_pt').length;
      const lights = inside.filter((e) => LIGHTS.has(e.type)).length;
      let need = 0, why = '';
      if (/s[ée]jour|salon/i.test(name)) { need = area <= 28 ? Math.max(5, Math.ceil(area / 4)) : 7; why = area <= 28 ? '1 socle par tranche de 4 m², 5 au minimum' : '7 au minimum au-delà de 28 m²'; }
      else if (/chambre/i.test(name)) { need = 3; why = '3 au minimum'; }
      else if (/cuisine/i.test(name)) { need = area <= 4 ? 3 : 6; why = area <= 4 ? '3 si 4 m² ou moins' : '6 dont 4 au-dessus du plan de travail'; }
      else if (/salle (de bain|d.eau)|sdb/i.test(name)) { need = 1; why = '1 hors volumes'; }
      else if (!/wc|toilette/i.test(name) && area > 4) { need = 1; why = '1 dans toute pièce de plus de 4 m² (hors WC)'; }
      if (need) {
        if (socles < need) add('err', G3, `${name} : ${socles} socle${socles > 1 ? 's' : ''} de prise, ${need} requis (${why}).`, ref);
        else add('ok', G3, `${name} : ${socles} socles de prise (${need} requis).`, ref);
      }
      if (/cuisine/i.test(name) && area > 4 && pt < 4) add('err', G3, `${name} : ${pt} prise${pt > 1 ? 's' : ''} au-dessus du plan de travail, 4 requises.`, ref);
      if (/cuisine/i.test(name) && !inside.some((e) => e.type === 'pc32')) add('err', G3, `${name} : pas de sortie 32 A pour la plaque de cuisson.`, ref);
      if (!lights) add(/dressing|placard|cellier/i.test(name) ? 'warn' : 'err', G3, `${name} : aucun point d'éclairage.`, ref);
      if (/s[ée]jour|chambre|salon/i.test(name) && !inside.some((e) => e.type === 'rj45' || e.type === 'rj45_2')) add('info', G3, `${name} : une prise RJ45 est conseillée dans chaque pièce principale.`, ref);
      // salle de bain : volume 2 (0,60 m autour de la baignoire ou de la douche)
      if (/salle (de bain|d.eau)|sdb/i.test(name) || P.items.some((it) => it.lv === L.id && /baignoire|douche/.test(it.type) && inPoly(it, r.loop))) {
        const wet = P.items.filter((it) => it.lv === L.id && /^(baignoire|baignoire_ilot|douche|douche_ita)$/.test(it.type));
        for (const e of inside.filter((x) => x.type in SOCKETS || isSpecOutlet(x.type))) {
          for (const it of wet) {
            const l = itemToLocal(it, e);
            const dx = Math.max(0, Math.abs(l.x) - it.w / 2), dy = Math.max(0, Math.abs(l.y) - it.d / 2);
            if (Math.hypot(dx, dy) < 60) { add('err', G3, `${name} : prise à moins de 60 cm de ${it.type.startsWith('douche') ? 'la douche' : 'la baignoire'} (volumes 1 et 2 interdits).`, { t: 'elec', id: e.id }); break; }
          }
        }
      }
      if (/cuisine/i.test(name)) {
        const hot = P.items.filter((it) => it.lv === L.id && /^(evier1|evier2|evier_eg|plaque|plaque90)$/.test(it.type));
        for (const e of inside.filter((x) => x.type in SOCKETS || isSpecOutlet(x.type))) {
          if ((e.h || 0) >= 180) continue;
          for (const it of hot) {
            const l = itemToLocal(it, e);
            if (Math.abs(l.x) <= it.w / 2 && l.y <= -it.d / 2 + 12 && l.y >= -it.d / 2 - 25) { add('err', G3, `${name} : prise au-dessus ${/evier/.test(it.type) ? 'de l’évier' : 'de la plaque'} (interdit, sauf prise de hotte à 1,80 m).`, { t: 'elec', id: e.id }); break; }
          }
        }
      }
    }
    // prise de courant à côté de chaque prise TV / RJ45
    for (const e of els.filter((x) => COMM_OUTLETS.has(x.type))) {
      const ok = els.some((x) => x.type in SOCKETS && vdist(x, e) <= 100);
      if (!ok) add('warn', G3, `${(ELEC_BY.get(e.type) || {}).n} sans prise de courant à moins d'un mètre (1 socle à côté de chaque prise de communication).`, { t: 'elec', id: e.id });
    }
    // éclairage extérieur au-dessus de chaque accès
    for (const o of P.openings.filter((x) => x.kind === 'door')) {
      const wg = g.walls.get(o.wall); if (!wg) continue;
      const side = interiorSide(wg, o.t); if (!side) continue;
      const mid = vadd(wg.A, vmul(wg.d, o.t));
      const outPt = vsub(mid, vmul(wg.n, side * (wg.th / 2 + 20)));
      const ok = els.some((x) => LIGHTS.has(x.type) && vdist(x, outPt) <= 180 && !g.rooms.some((r) => inPoly(x, r.loop)));
      if (!ok) add('warn', G3, `Accès extérieur sans point d'éclairage au-dessus (${L.name}).`, { t: 'opening', id: o.id, lv: L.id });
    }
  }
  // hauteurs
  for (const e of P.elec) {
    const d = ELEC_BY.get(e.type); if (!d) continue;
    const h = e.h, ref = { t: 'elec', id: e.id };
    if (h == null) continue;
    if ((CMDS.has(e.type) && !CMDS_FREE_H.has(e.type)) || e.type === 'cmd_vr' || e.type === 'cmd_vr_c') { if (h < 90 || h > 130) add('err', G4, `${d.n} à ${h} cm : les commandes se placent entre 90 et 130 cm du sol fini.`, ref); }
    else if (e.type === 'pc32') { if (h < 12 || h > 130) add('err', G4, `${d.n} à ${h} cm : entre 12 et 130 cm (axe).`, ref); }
    else if (e.type in SOCKETS || isSpecOutlet(e.type)) {
      if (h < 5) add('err', G4, `${d.n} à ${h} cm : l'axe doit être à 5 cm au moins du sol fini.`, ref);
      else if (h > 130 && e.type !== 'pc_pt' && h < 175) add('warn', G4, `${d.n} à ${h} cm : 130 cm au plus, sauf au-dessus d'un plan de travail ou pour la hotte (1,80 m).`, ref);
    } else if (e.type === 'tableau' || e.type === 'tab_div') { if (h < 90 || h > 180) add('err', G4, `Tableau à ${h} cm : ses organes de manœuvre doivent être entre 0,90 m et 1,80 m environ.`, ref); }
  }
  const G5 = 'Ventilation (VMC)';
  for (const v of vmcChecks()) add(v.sev, G5, v.msg, v.ref);
  const rank = { err: 0, warn: 1, info: 2, ok: 3 };
  out.sort((a, b) => [G1, G2, G3, G4, G5].indexOf(a.group) - [G1, G2, G3, G4, G5].indexOf(b.group) || rank[a.sev] - rank[b.sev]);
  return out;
}

export { ACCEPT, ACCESS, ALARM, AUTONOMOUS, CALS, CIRC_COLORS, CIRC_COLORS_DK, CK, CMDS, CMDS_FREE_H, COMM_OUTLETS,
  DEDIC, HEAT_MAX, KIND_ORDER, LIGHTS, LIGHT_ACC, LINK_TARGETS, NO_CIRCUIT, SECS, SEC_MAX, SOCKETS, SPEC, SPOTLIKE,
  accepts, agcpLabel, agcpOf, assignRcds, circById, circLoad, circMembers, circNumbers, circStats, circuitColor,
  circuitLabel, cleanLinks, defaultInstall, defaultKindFor, elecPower, fmtCount, generateFromPlan, isDarkTheme,
  isSpecOutlet, linkAnchor, namesOf, nearItem, nfcChecks, orderCircuits, packUnits, panelLayout, rcdById, rcdCircuits,
  rcdCircuitsIn, rcdLoad, rcdNumbers, roomAt, roomName, toggleLink };

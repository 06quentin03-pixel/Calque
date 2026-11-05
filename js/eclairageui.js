/* Calque — module « éclairage (écran) » : fenêtre « Éclairage de la pièce » (concepteur par la méthode des lumens,
   présenté comme une estimation), section « Éclairage » de l'inspecteur d'une pièce et section « Photométrie » de
   l'inspecteur d'un luminaire. Les calculs sont dans eclairage.js (sans écran). Module JavaScript natif. */
import { $, IDX, P, levelOf, touch, uid } from './noyau.js';
import { roomOfLabel } from './geometrie.js';
import { ELEC_BY } from './symboles.js';
import { LIGHTS, cleanLinks } from './electricite.js';
import { HU_DEFAUT, LIB, MF_DEFAUT, TYPES_ECL, TYPES_ECL_IDS, dansPiece, implantationActuelle, lumDuSymbole, propositions } from './eclairage.js';
import { badgeDonnee, champDonnee } from './fiche.js';
import { fmt } from './calcul.js';
import { ICON, btn, btns, closeModal, h, kv, sec, segCtl, toast } from './interface.js';
import { commit, makeElecFromDef } from './interaction.js';
import { EV, on } from './evenements.js';

const EC = { room: null };
const min1 = (t) => (t ? t[0].toLowerCase() + t.slice(1) : '');

/* ---------------- données de l'étude (P.etudes, format v7) ---------------- */
function etudeDe(lbl, create) {
  if (!Array.isArray(P.etudes)) P.etudes = [];
  let et = P.etudes.find((x) => x.room === lbl.id);
  if (!et && create) { et = { id: uid('ec'), lv: lbl.lv, room: lbl.id, lums: [] }; P.etudes.push(et); }
  if (et && !Array.isArray(et.lums)) et.lums = [];
  return et || null;
}
const photometries = () => (Array.isArray(P.photometries) ? P.photometries : []);
const pieceDe = (lbl) => { const r = roomOfLabel(lbl); return r ? { poly: r.poly, holes: r.holes || [], area: r.area } : null; };
const symbolesDe = (lbl) => P.elec.filter((e) => e.lv === lbl.lv);

/* ---------------- petit plan de la pièce avec les luminaires (SVG) ---------------- */
function apercu(poly, pts, sel) {
  if (!poly || !poly.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of poly) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
  const W = x1 - x0 || 1, Hh = y1 - y0 || 1, k = Math.min(220 / W, 150 / Hh), m = 6;
  const X = (x) => (m + (x - x0) * k).toFixed(1), Y = (y) => (m + (y - y0) * k).toFixed(1);
  const w = Math.round(W * k + 2 * m), hh = Math.round(Hh * k + 2 * m);
  const d = poly.map((p, i) => (i ? 'L' : 'M') + X(p.x) + ' ' + Y(p.y)).join(' ') + 'Z';
  const dots = pts.map((p) => `<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="4.5" class="ec-lum"/>`).join('');
  return h('div', { class: 'ec-ap' + (sel ? ' on' : ''), html: `<svg viewBox="0 0 ${w} ${hh}" width="${w}" height="${hh}" role="img" aria-label="Disposition des luminaires"><path d="${d}" class="ec-room"/>${dots}</svg>` });
}

/* ---------------- résultat (proposition ou implantation actuelle) ---------------- */
function lignesResultat(r, en) {
  const formule = `E = N × Φ × U × MF / A = ${r.n} × ${fmt(r.fluxU != null ? r.fluxU : 0, 0)} lm × ${fmt(r.U.v, 2)} × ${fmt(en.mf.v, 2)} / ${fmt(en.A, 1)} m²`;
  return [
    h('div', { class: 'ec-big' }, h('b', null, fmt(r.Emoy, 0) + ' lx'), h('span', null, 'éclairement moyen estimé'), badgeDonnee('estimee')),
    kv([
      ['Luminaires', String(r.n)],
      ['Éclairement minimal (direct)', fmt(r.Emin, 0) + ' lx'],
      ['Uniformité Emin / Emoy', fmt(r.U0, 2)],
      ['Puissance totale', r.P != null ? `${fmt(r.P, 0)} W · ${fmt(r.Wm2, 1)} W/m²` : 'inconnue (puissance du luminaire manquante)'],
      ['Facteur d’utilance U', `${fmt(r.U.v, 2)} (${LIB[r.U.st].toLowerCase()})`],
    ]),
    h('p', { class: 'note ec-f' }, formule),
  ];
}

/* ---------------- fenêtre ---------------- */
function corps(lbl) {
  const r = roomOfLabel(lbl), L = levelOf(lbl.lv);
  if (!r) return [h('p', { class: 'note' }, 'La pièce n’est plus fermée par des murs.')];
  const et = etudeDe(lbl, false) || { lums: [] };
  const box = (create) => (create ? etudeDe(lbl, true) : etudeDe(lbl, false));
  const piece = pieceDe(lbl);
  const parts = [];
  parts.push(h('div', { class: 'ec-warn' }, h('b', null, 'Estimation'), ' — méthode des lumens et calcul point par point simplifié. Ce n’est pas une étude d’éclairage du fabricant : à confirmer avant commande.'));
  /* objectif */
  parts.push(sec('Objectif',
    champDonnee(box, 'E', 'Éclairement moyen visé', 'lx', { id: 'ec-E', min: 1, max: 100000, chips: [100, 150, 200, 300, 500, 750], note: et.E ? null : 'Calque ne propose aucune valeur réglementaire : saisissez l’éclairement visé et, si possible, sa source (cahier des charges, norme ou guide que vous possédez).' }),
    champDonnee(box, 'hu', 'Hauteur du plan utile', 'cm', { id: 'ec-hu', min: 0, max: 500, note: et.hu ? null : `Sans saisie : ${fmt(HU_DEFAUT.v, 0)} cm (estimée : ${min1(HU_DEFAUT.src)}).` }),
    champDonnee(box, 'mf', 'Facteur de maintenance MF', '', { id: 'ec-mf', min: 0.1, max: 1, chips: [0.9, 0.8, 0.7, 0.6], note: et.mf ? null : `Sans saisie : ${fmt(MF_DEFAUT.v, 2)} (estimé : ${min1(MF_DEFAUT.src)}).` }),
    champDonnee(box, 'u', 'Facteur d’utilance U (facultatif)', '', { id: 'ec-u', min: 0.05, max: 1.5, note: et.u ? 'Valeur saisie : elle remplace le calcul direct de Calque.' : 'Sans saisie, Calque calcule la part du flux qui arrive directement sur le plan utile (réflexions des murs et du plafond ignorées : estimation prudente). Si vous avez le tableau d’utilance du fabricant, saisissez sa valeur.' }),
    kv([['Surface', fmt(r.area / 10000, 2) + ' m²'], ['Hauteur sous plafond', fmt(L ? L.h || 250 : 250, 0) + ' cm']])));
  /* luminaires */
  const lumBox = (i) => (create) => { const e = create ? etudeDe(lbl, true) : etudeDe(lbl, false); return e && e.lums[i] ? e.lums[i] : null; };
  const lumParts = et.lums.map((l, i) => h('div', { class: 'ec-lumdef' },
    h('div', { class: 'ec-lh' }, h('b', null, `Luminaire ${i + 1}`), btn('Retirer', () => { const e = etudeDe(lbl, true); e.lums.splice(i, 1); commit(); }, 'sm', 'del')),
    h('div', { class: 'chips' }, TYPES_ECL_IDS.map((t) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(l.type === t), onclick: () => { l.type = t; commit(); } }, TYPES_ECL[t].n))),
    photometrieChoix(l),
    l.ph ? null : champDonnee(lumBox(i), 'flux', 'Flux lumineux du luminaire', 'lm', { id: `ec-flux${i}`, min: 1, max: 1e6, note: l.flux ? null : 'Flux sortant du luminaire (pas celui de la lampe seule), relevé sur la fiche du fabricant.' }),
    l.ph ? null : champDonnee(lumBox(i), 'p', 'Puissance du luminaire', 'W', { id: `ec-p${i}`, min: 0.1, max: 1e5, note: l.p ? null : 'Facultatif : sert au bilan de puissance de l’éclairage.' })));
  parts.push(sec('Luminaires étudiés', ...lumParts,
    et.lums.length < 3 ? btns(btn(et.lums.length ? 'Comparer avec un autre luminaire' : 'Choisir un luminaire', () => { const e = etudeDe(lbl, true); e.lums.push({ type: e.lums.length ? e.lums[e.lums.length - 1].type : 'spot' }); commit(); }, 'sm', 'plus')) : null,
    h('p', { class: 'note' }, 'Jusqu’à trois luminaires : les propositions sont choisies parmi toutes leurs dispositions régulières.')));
  /* propositions */
  const pr = propositions(et, piece, L, photometries());
  if (pr.en.manquantes.length) parts.push(sec('Données manquantes', h('ul', { class: 'fi-manq' }, pr.en.manquantes.map((m) => h('li', null, h('b', null, m.nom), ' — ', m.pourquoi)))));
  else if (pr.aucun) parts.push(sec('Propositions', h('p', { class: 'note' }, 'Aucune disposition régulière (jusqu’à 12 × 12 luminaires) n’atteint l’éclairement visé : choisissez un luminaire plus puissant ou vérifiez les données.')));
  else parts.push(sec('Trois propositions (estimations)', h('div', { class: 'ec-props' }, pr.props.map((p, k) => {
    const lum = pr.en.lums.find((x) => x.i === p.lum);
    const ld = et.lums[p.lum];
    return h('div', { class: 'ec-prop', 'data-k': String(k) },
      h('div', { class: 'ec-ph' }, h('b', null, `${k + 1}. ${p.titre}`), h('span', { class: 'note' }, p.pourquoi)),
      apercu(piece.poly, p.pos),
      h('p', { class: 'ec-sub' }, `${TYPES_ECL[p.type].n} · ${p.rows > 1 && p.cols > 1 ? `${p.cols} × ${p.rows}` : `${p.n} en ligne`} · entraxe ${fmt(p.sx / 100, 2)} × ${fmt(p.sy / 100, 2)} m`),
      ...lignesResultat(Object.assign({ fluxU: lum.flux }, p), pr.en),
      h('p', { class: 'note' }, `Flux : ${LIB[lum.fluxD.st].toLowerCase()}${lum.fluxD.src ? ' (' + lum.fluxD.src + ')' : ''}. ${lum.rep.src} (${LIB[lum.rep.st].toLowerCase()}).`),
      btns(btn('Implanter sur le plan', () => implanter(lbl, p, ld), 'sm pri', 'plus')));
  }))));
  /* implantation actuelle */
  const ia = implantationActuelle(et, piece, L, symbolesDe(lbl), photometries());
  const actu = [];
  if (!ia.n) actu.push(h('p', { class: 'note' }, 'Aucun luminaire de plafond dans la pièce pour l’instant.'));
  else {
    if (ia.sansFlux) actu.push(h('p', { class: 'note' }, `${ia.sansFlux} luminaire${ia.sansFlux > 1 ? 's' : ''} sans flux connu, non compté${ia.sansFlux > 1 ? 's' : ''} : indiquez le flux dans le panneau du luminaire (section « Photométrie »).`));
    if (ia.res) {
      actu.push(...lignesResultat(Object.assign({ fluxU: ia.res.fluxTot / ia.res.n }, ia.res), ia.en));
      if (ia.en.E) actu.push(h('p', { class: 'ec-atteint ' + (ia.res.ok ? 'ok' : 'ko') }, ia.res.ok ? `Objectif de ${fmt(ia.en.E.v, 0)} lx atteint (estimation).` : `Objectif de ${fmt(ia.en.E.v, 0)} lx non atteint (estimation).`));
    }
  }
  actu.push(h('p', { class: 'note' }, 'Déplacez, ajoutez ou supprimez les luminaires sur le plan : ce résultat est recalculé.'));
  parts.push(sec('Implantation actuelle', ...actu));
  return parts;
}

/* luminaire : photométrie importée (étape 2) ou saisie directe */
function photometrieChoix(l) {
  const list = photometries();
  if (!list.length) return null;
  const sel = h('select', { class: 'txt', 'aria-label': 'Fichier photométrique' }, h('option', { value: '' }, 'Saisir le flux et la puissance'),
    list.map((p) => h('option', { value: p.id, selected: p.id === l.ph }, `${p.name}${p.fab ? ' · ' + p.fab : ''} (${fmt(p.flux.v, 0)} lm)`)));
  sel.addEventListener('change', () => { if (sel.value) l.ph = sel.value; else delete l.ph; commit(); });
  return h('label', { class: 'fld' }, h('span', null, 'Données du luminaire'), sel);
}

function renderEclairage(first) {
  const lbl = EC.room && IDX.rooms.get(EC.room);
  const m = $('#modal');
  if (!lbl) { if (m.querySelector('.eclairage')) closeModal(); EC.room = null; return; }
  const old = m.querySelector('.mbody');
  const scroll = !first && old ? old.scrollTop : 0;
  const ae = document.activeElement, focusId = !first && ae && m.contains(ae) ? ae.id : null;
  const body = h('div', { class: 'mbody fiche eclairage' }, ...corps(lbl));
  m.replaceChildren(h('div', { class: 'pop-head' }, h('h2', null, 'Éclairage · ', lbl.name),
    h('button', { class: 'ib', type: 'button', 'aria-label': 'Fermer', html: ICON.x, onclick: () => { EC.room = null; closeModal(); } })), body);
  m.classList.add('wide');
  m.hidden = false; $('#scrim').hidden = false;
  for (const p of document.querySelectorAll('.pop')) p.hidden = true;
  body.scrollTop = scroll;
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
}
function openEclairage(roomId) {
  if (!IDX.rooms.get(roomId)) { toast('Pièce introuvable.'); return; }
  EC.room = roomId; renderEclairage(true);
}
on(EV.PLAN_CHANGE, () => { if (EC.room && !$('#modal').hidden && $('#modal').querySelector('.eclairage')) renderEclairage(false); });

/* ---------------- implantation d'une proposition ----------------
   Les luminaires posés par une implantation précédente de cette étude sont remplacés ; les autres sont conservés.
   Chaque luminaire garde sa photométrie (flux et puissance, avec leur statut) dans `lum`. */
function implanter(lbl, prop, ld) {
  const et = etudeDe(lbl, true), piece = pieceDe(lbl);
  const anciens = new Set(et.ids || []);
  const avant = P.elec.length;
  P.elec = P.elec.filter((e) => !anciens.has(e.id));
  const retires = avant - P.elec.length;
  // circuit : celui des autres luminaires de la pièce, s'ils en ont un
  const cnt = new Map();
  for (const e of P.elec) if (e.lv === lbl.lv && e.cid && LIGHTS.has(e.type) && piece && dansPiece(e, piece.poly, piece.holes)) cnt.set(e.cid, (cnt.get(e.cid) || 0) + 1);
  const cid = [...cnt.entries()].sort((a, b) => b[1] - a[1])[0];
  const def = ELEC_BY.get(prop.type);
  const lin = prop.type === 'reglette' || prop.type === 'rail_spot';
  const rot = lin && prop.sy > prop.sx ? 90 : 0;
  const ids = [];
  for (const p of prop.pos) {
    const e = makeElecFromDef(def, lbl.lv);
    Object.assign(e, { x: p.x, y: p.y, rot, h: null });
    if (cid) e.cid = cid[0];
    const lum = {};
    if (ld && ld.ph) lum.ph = ld.ph;
    if (ld && ld.flux) lum.flux = Object.assign({}, ld.flux);
    if (ld && ld.p) lum.p = Object.assign({}, ld.p);
    if (Object.keys(lum).length) e.lum = lum;
    P.elec.push(e); ids.push(e.id);
  }
  et.ids = ids;
  touch(); cleanLinks();
  commit();
  toast(`${ids.length} luminaire${ids.length > 1 ? 's' : ''} posé${ids.length > 1 ? 's' : ''}${retires ? ` (${retires} de l’implantation précédente retiré${retires > 1 ? 's' : ''})` : ''}. Vous pouvez les déplacer sur le plan.`);
}

/* ---------------- inspecteur d'une pièce : section « Éclairage » ---------------- */
function eclairageSection(lbl) {
  const et = etudeDe(lbl, false);
  const ia = et ? implantationActuelle(et, pieceDe(lbl), levelOf(lbl.lv), symbolesDe(lbl), photometries()) : null;
  return sec('Éclairage',
    et && et.E && ia && ia.res ? kv([['Visé', fmt(et.E.v, 0) + ' lx'], ['Estimé', fmt(ia.res.Emoy, 0) + ' lx']]) : null,
    btns(btn('Concevoir l’éclairage', () => openEclairage(lbl.id), 'sm', 'info')),
    h('p', { class: 'note' }, 'Méthode des lumens : trois propositions estimées, implantables puis modifiables sur le plan.'));
}

/* ---------------- inspecteur d'un luminaire : section « Photométrie » ---------------- */
function lumSection(e) {
  if (!LIGHTS.has(e.type)) return null;
  const box = (create) => (create ? (e.lum || (e.lum = {})) : e.lum || null);
  const clean = () => { if (e.lum && !Object.keys(e.lum).length) delete e.lum; };
  const list = photometries();
  const ph = e.lum && e.lum.ph ? list.find((p) => p.id === e.lum.ph) : null;
  const kids = [];
  if (list.length) {
    const sel = h('select', { class: 'txt', id: 'f-eph', 'aria-label': 'Fichier photométrique' }, h('option', { value: '' }, 'Aucun fichier (saisie)'),
      list.map((p) => h('option', { value: p.id, selected: ph && p.id === ph.id }, `${p.name} (${fmt(p.flux.v, 0)} lm)`)));
    sel.addEventListener('change', () => { if (sel.value) box(true).ph = sel.value; else if (e.lum) { delete e.lum.ph; clean(); } commit(); });
    kids.push(h('label', { class: 'fld' }, h('span', null, 'Fichier photométrique'), sel));
  }
  if (ph) kids.push(kv([['Flux', `${fmt(ph.flux.v, 0)} lm`], ['Puissance', ph.p ? `${fmt(ph.p.v, 1)} W` : 'non indiquée'], ['Fichier', ph.file || '—']]));
  else {
    kids.push(champDonnee(box, 'flux', 'Flux lumineux', 'lm', { id: 'f-elflux', min: 1, max: 1e6, note: e.lum && e.lum.flux ? null : 'Facultatif : sert au calcul d’éclairement de la pièce.' }, clean));
    kids.push(champDonnee(box, 'p', 'Puissance du luminaire', 'W', { id: 'f-elp', min: 0.1, max: 1e5 }, clean));
  }
  const l = lumDuSymbole(e, list);
  if (!l && TYPES_ECL[e.type]) kids.push(h('p', { class: 'note' }, 'Sans flux connu, ce luminaire n’est pas compté dans l’éclairement de la pièce.'));
  return sec('Photométrie', ...kids);
}

export { EC, apercu, eclairageSection, etudeDe, implanter, lumSection, openEclairage, renderEclairage };

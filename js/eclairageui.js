/* Calque — module « éclairage (écran) » : fenêtre « Éclairage de la pièce » (concepteur par la méthode des lumens,
   présenté comme une estimation), section « Éclairage » de l'inspecteur d'une pièce et section « Photométrie » de
   l'inspecteur d'un luminaire. Les calculs sont dans eclairage.js (sans écran). Module JavaScript natif. */
import { $, IDX, P, levelOf, touch, uid } from './noyau.js';
import { roomOfLabel } from './geometrie.js';
import { ELEC_BY } from './symboles.js';
import { LIGHTS, cleanLinks } from './electricite.js';
import { HU_DEFAUT, LIB, MF_DEFAUT, TYPES_ECL, TYPES_ECL_IDS, dansPiece, implantationActuelle, lumDuSymbole, propositions } from './eclairage.js';
import { badgeDonnee, champDonnee } from './fiche.js';
import { intensitePhotometrie, lireFichierPhotometrique } from './photometrie.js';
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

/* ---------------- fichiers photométriques (IES / LDT) ---------------- */
/* texte d'un fichier : UTF-8 si possible, sinon Windows-1252 (fichiers européens courants) */
async function texteDe(file) {
  const buf = await file.arrayBuffer();
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { return new TextDecoder('windows-1252').decode(buf); }
}
/* ouvre le sélecteur de fichiers (Fichiers de l'iPad) ; `fait(id)` reçoit la photométrie ajoutée au plan */
function importerPhotometrie(fait) {
  const inp = h('input', { type: 'file', style: 'display:none' });
  inp.addEventListener('change', async () => {
    const f = inp.files && inp.files[0]; inp.remove(); if (!f) return;
    if (f.size > 5e6) { toast('Fichier trop lourd pour un fichier photométrique.'); return; }
    let r;
    try { r = lireFichierPhotometrique(await texteDe(f), f.name); } catch (e) { r = { erreur: 'Lecture impossible : ' + e.message }; }
    if (r.erreur) { toast(r.erreur + ' Rien n’a été ajouté.'); return; }
    if (!Array.isArray(P.photometries)) P.photometries = [];
    // même fichier déjà importé : on le réutilise
    const deja = P.photometries.find((x) => x.file === r.file && x.flux.v === r.flux.v && x.C.length === r.C.length && x.G.length === r.G.length);
    const ph = deja || Object.assign({ id: uid('ph') }, r);
    if (!deja) P.photometries.push(ph);
    fait(ph.id);
    commit();
    toast(`« ${ph.name} » : ${fmt(ph.flux.v, 0)} lm${ph.p ? `, ${fmt(ph.p.v, 1)} W` : ''}.`);
  });
  document.body.append(inp);
  inp.click();
}
/* courbe photométrique : plans C0–C180 (trait plein) et C90–C270 (tirets), 0° vers le bas */
function courbe(ph) {
  let mx = 0; for (const r of ph.I) for (const v of r) if (v > mx) mx = v;
  if (!(mx > 0)) return null;
  const R = 62, cx = 75, cy = 75;
  const trace = (c1, c2) => {
    const pts = [];
    for (let g = 0; g <= 180; g += 2.5) { const r = (intensitePhotometrie(ph, c1, g) / mx) * R, a = (g * Math.PI) / 180; pts.push([cx + r * Math.sin(a), cy + r * Math.cos(a)]); }
    for (let g = 180; g >= 0; g -= 2.5) { const r = (intensitePhotometrie(ph, c2, g) / mx) * R, a = (g * Math.PI) / 180; pts.push([cx - r * Math.sin(a), cy + r * Math.cos(a)]); }
    return 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('L') + 'Z';
  };
  const cercles = [0.5, 1].map((k) => `<circle cx="${cx}" cy="${cy}" r="${R * k}" class="ec-grid"/>`).join('');
  return h('div', { class: 'ec-polar', html: `<svg viewBox="0 0 150 150" width="150" height="150" role="img" aria-label="Courbe photométrique">${cercles}<path d="M${cx} ${cy - R}V${cy + R}M${cx - R} ${cy}H${cx + R}" class="ec-grid"/><path d="${trace(90, 270)}" class="ec-c90"/><path d="${trace(0, 180)}" class="ec-c0"/></svg>` },
    h('small', null, `Max. ${fmt(mx, 0)} cd · trait plein C0–C180, tirets C90–C270`));
}
function fichePhotometrie(ph) {
  const ecart = ph.fluxLampes ? Math.abs(ph.fluxLampes - ph.flux.v) / ph.fluxLampes : 0;
  return h('div', { class: 'ec-phot' },
    h('div', null, kv([
      ['Luminaire', ph.name || '—'],
      ph.fab ? ['Fabricant', ph.fab] : null,
      ['Fichier', `${ph.file || '—'} (${ph.fmt.toUpperCase()})`],
      ['Flux du luminaire', h('span', null, `${fmt(ph.flux.v, 0)} lm `, badgeDonnee(ph.flux.st))],
      ph.fluxLampes ? ['Flux déclaré par le fichier', `${fmt(ph.fluxLampes, 0)} lm`] : null,
      ['Puissance', ph.p ? h('span', null, `${fmt(ph.p.v, 1)} W `, badgeDonnee(ph.p.st)) : 'non indiquée par le fichier'],
      ph.p ? ['Efficacité', `${fmt(ph.flux.v / ph.p.v, 0)} lm/W`] : null,
      ['Mesures', `${ph.C.length} plan${ph.C.length > 1 ? 's' : ''} C × ${ph.G.length} angles γ`],
    ].filter(Boolean)),
    h('p', { class: 'note' }, 'Flux calculé en intégrant la répartition lue dans le fichier.' + (ecart > 0.05 ? ` Écart de ${fmt(ecart * 100, 0)} % avec le flux déclaré : vérifiez le fichier.` : ''))),
    courbe(ph));
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
  /* fichiers du plan */
  if (photometries().length) parts.push(sec('Fichiers photométriques du plan', h('div', { class: 'ec-files' }, photometries().map((p) => {
    const n = P.elec.filter((e) => e.lum && e.lum.ph === p.id).length + (P.etudes || []).reduce((t, x) => t + (x.lums || []).filter((l) => l.ph === p.id).length, 0);
    return h('div', { class: 'ec-file' }, h('span', null, h('b', null, p.name), ` · ${fmt(p.flux.v, 0)} lm${p.p ? ' · ' + fmt(p.p.v, 1) + ' W' : ''} · ${p.file}`),
      n ? h('small', null, `utilisé ${n} fois`) : btn('Retirer', () => { P.photometries = P.photometries.filter((x) => x.id !== p.id); commit(); }, 'sm', 'del'));
  })), h('p', { class: 'note' }, 'Les fichiers sont enregistrés dans le plan : ils restent disponibles hors ligne et sont envoyés avec le plan.')));
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

/* luminaire étudié : fichier photométrique (IES / LDT) ou saisie directe du flux et de la puissance */
function photometrieChoix(l) {
  const list = photometries(), ph = l.ph ? list.find((p) => p.id === l.ph) : null;
  const kids = [];
  if (list.length) {
    const sel = h('select', { class: 'txt', 'aria-label': 'Données du luminaire' }, h('option', { value: '' }, 'Saisir le flux et la puissance'),
      list.map((p) => h('option', { value: p.id, selected: p.id === l.ph }, `${p.name}${p.fab ? ' · ' + p.fab : ''} (${fmt(p.flux.v, 0)} lm)`)));
    sel.addEventListener('change', () => { if (sel.value) l.ph = sel.value; else delete l.ph; commit(); });
    kids.push(h('label', { class: 'fld' }, h('span', null, 'Données du luminaire'), sel));
  }
  kids.push(btns(btn('Importer un fichier IES / LDT', () => importerPhotometrie((id) => { l.ph = id; }), 'sm', 'up')));
  if (ph) kids.push(fichePhotometrie(ph));
  return kids;
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

/* photométrie d'un symbole reprise d'un fichier : copie du flux et de la puissance (avec leur statut et leur source),
   pour que le tableau et le bilan connaissent la puissance sans relire le fichier */
function lierFichier(lum, ph) {
  lum.ph = ph.id; lum.flux = Object.assign({}, ph.flux);
  if (ph.p) lum.p = Object.assign({}, ph.p); else if (lum.p && /^Fichier /.test(lum.p.src || '')) delete lum.p;
  return lum;
}
function delierFichier(lum) {
  delete lum.ph;
  for (const k of ['flux', 'p']) if (lum[k] && /^Fichier /.test(lum[k].src || '')) delete lum[k];
}

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
    const lum = {}, ph = ld && ld.ph ? photometries().find((x) => x.id === ld.ph) : null;
    if (ph) lierFichier(lum, ph);
    else {
      if (ld && ld.flux) lum.flux = Object.assign({}, ld.flux);
      if (ld && ld.p) lum.p = Object.assign({}, ld.p);
    }
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
    sel.addEventListener('change', () => { const p = list.find((x) => x.id === sel.value); if (p) lierFichier(box(true), p); else if (e.lum) { delierFichier(e.lum); clean(); } commit(); });
    kids.push(h('label', { class: 'fld' }, h('span', null, 'Fichier photométrique'), sel));
  }
  kids.push(btns(btn('Importer un fichier IES / LDT', () => importerPhotometrie((id) => { lierFichier(box(true), photometries().find((x) => x.id === id)); }), 'sm', 'up')));
  if (ph) kids.push(fichePhotometrie(ph));
  else {
    kids.push(champDonnee(box, 'flux', 'Flux lumineux', 'lm', { id: 'f-elflux', min: 1, max: 1e6, note: e.lum && e.lum.flux ? null : 'Facultatif : sert au calcul d’éclairement de la pièce.' }, clean));
    kids.push(champDonnee(box, 'p', 'Puissance du luminaire', 'W', { id: 'f-elp', min: 0.1, max: 1e5 }, clean));
  }
  const l = lumDuSymbole(e, list);
  if (!l && TYPES_ECL[e.type]) kids.push(h('p', { class: 'note' }, 'Sans flux connu, ce luminaire n’est pas compté dans l’éclairement de la pièce.'));
  return sec('Photométrie', ...kids);
}

export { EC, apercu, courbe, eclairageSection, etudeDe, fichePhotometrie, implanter, importerPhotometrie, lierFichier, lumSection, openEclairage, renderEclairage };

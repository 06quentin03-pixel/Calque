/* Calque — module « circuitsui » : gestionnaire de circuits dans le plan.
   Panneau de droite (inspecteur) :
   - liste de tous les circuits, rangés par interrupteur différentiel : numéro, couleur, désignation, protection,
     section, désignation des conducteurs, longueur, points, constats de câblage ;
   - cases « afficher » : un, plusieurs ou tous les circuits sur le plan ;
   - un circuit touché est sélectionné : ses équipements et son arbre de câblage sont mis en évidence, et toutes ses
     propriétés se modifient ici (désignation, couleur, fonction, protection, calibre, section, conducteur,
     différentiel, commande), avec les valeurs calculées (puissance, intensité, longueur, conducteurs).
   Toute valeur calculée est « estimée » ; les contrôles de câblage sont des constats de Calque, pas une validation
   réglementaire. Le tableau électrique (onglet) reste lié : c'est le même circuit, aucune copie. */
import { EXT, IDX, NF0, NF1, P, S, bboxOf, clamp, saveSettings, ui, uid } from './noyau.js';
import { CALS, CIRC_COLORS, CK, KIND_ORDER, SECS, SEC_MAX, circById, circMembers, circNumbers, circStats, circuitColor, fmtCount, orderCircuits,
  rcdCircuits, rcdNumbers } from './electricite.js';
import { ELEC_BY } from './symboles.js';
import { afterFilter, circsFiltre } from './reseaux.js';
import { SCR, commit, refreshUI, requestRender } from './interaction.js';
import { V } from './rendu2d.js';
import { body, btn, btns, chipRow, h, inspHead, kv, renderInspector, sec, segCtl, textField, toast, updateHint } from './interface.js';
import { ficheButton } from './fiche.js';
import { entreesDuPlan, ficheCircuit, fmt } from './calcul.js';
import { CONDUCTEURS, COURBES, FONCTIONS, NB_CABLE, NIVEAUX, cablagePlan, choixGaine, controlesCablage, libelleCompo, resumeCircuit } from './cablage.js';
import { aCommander, cheminCircuit, nomChemin, reserveDe } from './cheminement.js';
import { demarrerCablage, proposerRaccordement } from './cablerui.js';
import { majPastille } from './calquesui.js';

const CTRL_LABEL = { contacteur: 'Contacteur heures creuses', telerupteur: 'Télérupteur', minuterie: 'Minuterie' };
const m = (cm) => (cm == null ? '—' : fmt(cm / 100, 1) + ' m');
const LIB_ST = { verifiee: 'vérifiée', saisie: 'saisie', estimee: 'estimée' };

/* ---------------- ouverture ---------------- */
function ouvrirGestionnaire() {
  if (ui.view && ui.view !== 'plan') import('./tableau.js').then((t) => { t.setView('plan'); afficherListe(); });
  else afficherListe();
}
function afficherListe() { ui.sel = { t: 'circuits', id: '*' }; ui.inspOpen = true; ui.hl = null; renderInspector(); updateHint(); requestRender(); majPastille(); }
function selectionner(cid, cadrer) {
  const c = circById(cid); if (!c) return;
  ui.sel = { t: 'circuit', id: cid }; ui.inspOpen = true; ui.hl = cid; ui.hlIds = null;
  const ms = circMembers(cid);
  if (cadrer && ms.length) {
    const cnt = new Map(); for (const e of ms) cnt.set(e.lv, (cnt.get(e.lv) || 0) + 1);
    if (!cnt.has(ui.lv)) { ui.lv = [...cnt].sort((a, b) => b[1] - a[1])[0][0]; refreshUI(); }
    cadrerSur(ms.filter((e) => e.lv === ui.lv));
  }
  renderInspector(); updateHint(); requestRender(); majPastille();
}
function cadrerSur(pts) {
  if (!pts.length) return;
  requestAnimationFrame(() => {
    const bb = bboxOf(pts), pad = 110;
    const bw = Math.max(300, bb.x1 - bb.x0), bh = Math.max(300, bb.y1 - bb.y0);
    V.s = clamp(Math.min((SCR.w - 2 * pad) / bw, (SCR.h - 2 * pad) / bh), 0.05, 3);
    V.ox = SCR.w / 2 - ((bb.x0 + bb.x1) / 2) * V.s; V.oy = SCR.h / 2 - ((bb.y0 + bb.y1) / 2) * V.s;
    requestRender();
  });
}
/* affichage d'un ou plusieurs circuits sur le plan (réglage de l'appareil) */
function affiches() { const s = circsFiltre(); return s ? new Set(s) : null; }
function setAffiches(set) {
  S.filt.circ = null;
  S.filt.circs = set && set.size && set.size < P.circuits.length ? [...set] : [];
  S.vue = null; S.layers.elec = true;
  afterFilter(); saveSettings(); renderInspector(); majPastille();
}
function basculerAffichage(cid) {
  const cur = affiches() || new Set();
  const tous = !affiches();
  if (tous) { setAffiches(new Set([cid])); return; }
  if (cur.has(cid)) cur.delete(cid); else cur.add(cid);
  setAffiches(cur);
}

/* ---------------- liste des circuits ---------------- */
function niveauxDe(ctl, cid) {
  const n = { erreur: 0, avertissement: 0, suggestion: 0 };
  for (const x of ctl) if (x.cid === cid) n[x.niveau]++;
  return n;
}
function tags(n) {
  return [n.erreur ? h('span', { class: 'ci-tag err', title: `${n.erreur} erreur${n.erreur > 1 ? 's' : ''}` }, `✕ ${n.erreur}`) : null,
    n.avertissement ? h('span', { class: 'ci-tag warn', title: `${n.avertissement} avertissement${n.avertissement > 1 ? 's' : ''}` }, `! ${n.avertissement}`) : null,
    n.suggestion ? h('span', { class: 'ci-tag sug', title: `${n.suggestion} suggestion${n.suggestion > 1 ? 's' : ''}` }, `i ${n.suggestion}`) : null].filter(Boolean);
}
function ligneCircuit(c, nums, ctl, aff) {
  const r = resumeCircuit(P, c), st = circStats(c);
  const vis = !aff || aff.has(c.id);
  const sous = [`${c.courbe ? c.courbe : ''}${c.cal} A`, `${String(c.sec).replace('.', ',')} mm²`, r && r.principale, fmtCount(st)].filter(Boolean).join(' · ');
  const chk = h('button', { type: 'button', class: 'ci-chk', role: 'checkbox', 'aria-checked': String(vis), 'aria-label': `Afficher le circuit ${nums.get(c.id)} sur le plan`, onclick: () => basculerAffichage(c.id) }, h('i'));
  return h('div', { class: 'ci-li', 'data-cid': c.id, 'aria-current': String(ui.hl === c.id) },
    chk, h('span', { class: 'ev-num', style: `--cc:${circuitColor(c.id)}` }, nums.get(c.id)),
    h('button', { type: 'button', class: 'ci-txt', onclick: () => selectionner(c.id, true) }, h('b', null, c.name), h('small', null, sous)),
    h('span', { class: 'ci-cols' }, tags(niveauxDe(ctl, c.id))));
}
function inspCircuits() {
  const nums = circNumbers(), rn = rcdNumbers(), aff = affiches();
  const ctl = controlesCablage(P);
  const groupes = [...P.rcds.map((r) => ({ titre: `${rn.get(r.id)} · ${r.cal} A · type ${r.type}`, l: rcdCircuits(r.id) })), { titre: 'Sans différentiel', l: P.circuits.filter((c) => !c.rcd || !P.rcds.some((r) => r.id === c.rcd)) }].filter((g) => g.l.length);
  const tot = { erreur: 0, avertissement: 0, suggestion: 0 }; for (const x of ctl) tot[x.niveau]++;
  return [
    inspHead('Circuits', `${P.circuits.length} circuit${P.circuits.length > 1 ? 's' : ''} · ${P.rcds.length} différentiel${P.rcds.length > 1 ? 's' : ''}${aff ? ` · ${aff.size} affiché${aff.size > 1 ? 's' : ''}` : ''}`),
    body(
      P.circuits.length ? null : h('p', { class: 'note' }, 'Aucun circuit : générez le tableau (onglet Tableau électrique › Régénérer depuis le plan), ou choisissez « + Nouveau circuit » dans un symbole.'),
      P.circuits.length ? sec('Affichage', btns(btn('Tout afficher', () => setAffiches(null), 'sm' + (aff ? ' pri' : ''))),
        h('p', { class: 'note' }, 'Cochez les circuits à montrer sur le plan. Touchez un circuit pour le mettre en évidence et modifier ses propriétés.')) : null,
      groupes.map((g) => sec(g.titre, h('div', { class: 'ci-list' }, g.l.map((c) => ligneCircuit(c, nums, ctl, aff))))),
      ctl.length ? sec('Contrôles du câblage',
        h('p', { class: 'note' }, `${tot.erreur} erreur${tot.erreur > 1 ? 's' : ''}, ${tot.avertissement} avertissement${tot.avertissement > 1 ? 's' : ''}, ${tot.suggestion} suggestion${tot.suggestion > 1 ? 's' : ''}. Constats de Calque (schéma de câblage usuel), pas une validation réglementaire.`),
        h('div', { class: 'ev-list' }, ctl.slice(0, 40).map((x) => ligneControle(x, nums)))) : null,
      sec(null, btns(btn('+ Nouveau circuit', nouveauCircuit, 'sm'), btn('Câbler', () => demarrerCablage(null), 'sm', 'duct'))),
    ),
  ];
}
function ligneControle(x, nums) {
  return h('button', { type: 'button', class: 'ev-chk ' + (x.niveau === 'erreur' ? 'err' : x.niveau === 'avertissement' ? 'warn' : 'info'), style: 'text-align:left;width:100%;border:0;background:transparent',
    onclick: () => { if (x.cid) selectionner(x.cid, true); if (x.refs && x.refs.length) montrer(x.refs); } },
  h('span', { class: 'ic' }, x.niveau === 'erreur' ? '!' : x.niveau === 'avertissement' ? '!' : 'i'),
  h('span', { class: 'tx' }, h('span', { class: 'ci-niv ' + x.niveau }, NIVEAUX[x.niveau].n), x.cid ? `${nums.get(x.cid)} · ` : '', x.msg));
}
/* met en évidence des appareils (halo) et cadre la vue sur eux */
function montrer(ids) {
  const els = ids.map((id) => IDX.elec.get(id)).filter(Boolean);
  if (!els.length) return;
  ui.hlIds = new Set(els.map((e) => e.id));
  if (!els.some((e) => e.lv === ui.lv)) { ui.lv = els[0].lv; refreshUI(); }
  cadrerSur(els.filter((e) => e.lv === ui.lv));
  requestRender();
}
function nouveauCircuit() {
  const k = CK.autre;
  const c = { id: uid('c'), kind: 'autre', name: 'Nouveau circuit', cal: k.cal, sec: k.sec, rcd: null, dda: false, ctrl: null };
  P.circuits.push(c); orderCircuits(); commit();
  selectionner(c.id, false);
}

/* ---------------- éditeur d'un circuit ---------------- */
/* pastilles pour des valeurs texte (chipRow compare des nombres) */
function chipsTxt(vals, cur, onPick, fmt) {
  return h('div', { class: 'chips' }, vals.map((v) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(v === cur), onclick: () => onPick(v) }, fmt ? fmt(v) : String(v))));
}
/* champs ajoutés au format v12 (couleur, courbe, conducteur) : partagés avec l'éditeur de l'onglet Tableau */
function champsV12(c) {
  const col = c.col || null;
  return [
    sec('Couleur', h('div', { class: 'cq-cols' },
      h('button', { type: 'button', class: 'cq-col auto', 'aria-pressed': String(!col), title: 'Couleur automatique', onclick: () => { delete c.col; commit(); } }, 'Auto'),
      CIRC_COLORS.slice(0, 10).map((p) => h('button', { type: 'button', class: 'cq-col', style: `background:${p}`, 'aria-pressed': String(col === p), 'aria-label': 'Couleur ' + p, onclick: () => { c.col = p; commit(); } })))),
    sec('Courbe de la protection', chipsTxt(['', ...COURBES], c.courbe || '', (v) => { if (v) c.courbe = v; else delete c.courbe; commit(); }, (v) => (v ? 'Courbe ' + v : 'Non précisée'))),
    sec('Type de conducteur', chipsTxt(['', 'h07vu', 'r2v', 'souple'], c.cond || '', (v) => { if (v) c.cond = v; else delete c.cond; commit(); }, (v) => ({ '': 'Selon la gaine', h07vu: 'Fils H07V-U', r2v: 'Câble R2V', souple: 'Câble souple' })[v]),
      h('p', { class: 'note' }, c.cond ? CONDUCTEURS[c.cond].n + ' (saisi).' : 'Non précisé : fils sous conduit dans les gaines et goulottes, câble à gaine sur chemin de câbles (estimation).')),
  ];
}
function valeursCalculees(c) {
  const en = entreesDuPlan(P, c), f = ficheCircuit(en), r = f.resultats;
  const ch = cheminCircuit(P, c.id), res = reserveDe(P);
  const Pw = en.P, IB = r.IB;
  const st = (d) => (d && d.st ? ` (${LIB_ST[d.st] || d.st})` : '');
  return kv([
    ['Puissance', Pw && Number.isFinite(Pw.v) ? `${NF0.format(Pw.v)} W${st(Pw)}` : 'manquante (à saisir dans la fiche de calcul)'],
    ['Intensité d’emploi', IB && Number.isFinite(IB.v) ? `${NF1.format(IB.v)} A${st(IB)}` : 'non calculée (puissance ou cos φ manquants)'],
    ['Longueur jusqu’au point le plus loin', ch.Lmax != null ? `${m(ch.Lmax)} (estimée)` : ch.raison || '—'],
    ['Longueur de câble (arbre)', ch.arbre != null ? `${m(ch.arbre)} · à commander ${aCommander(ch.arbre, res)} m (réserve ${NF0.format(res.v)} %)` : '—'],
  ]);
}
function conducteursSection(c) {
  const cab = cablagePlan(P).circuits.get(c.id);
  if (!cab || !cab.troncons.length) return sec('Conducteurs', h('p', { class: 'note' }, cab && cab.nonAtteints.length ? 'Les points du circuit ne sont pas encore raccordés au tableau par les gaines : tracez-les avec « Câbler » ou « Proposer le raccordement ».' : 'Aucun tronçon de câble : reliez des appareils à ce circuit.'));
  const des = [...new Set(cab.troncons.map((t) => t.des))];
  const lignes = Object.entries(cab.longueurs).sort((a, b) => (FONCTIONS[a[0]] || {}).ordre - (FONCTIONS[b[0]] || {}).ordre);
  const parDes = new Map(); for (const t of cab.troncons) { const k = t.des + ' · ' + libelleCompo(t.compo); parDes.set(k, (parDes.get(k) || 0) + t.h + t.v); }
  return sec('Conducteurs (estimés)',
    h('p', { class: 'note' }, `Au départ du tableau : ${cab.desPrincipale || '—'} ; jusqu’à ${cab.maxConducteurs} conducteurs dans un tronçon.${cab.complet ? '' : ' Circuit incomplet : longueurs partielles.'}`),
    h('table', { class: 'ci-cond' }, [...parDes.entries()].sort((a, b) => b[1] - a[1]).map(([k, cm]) => h('tr', null, h('td', null, k), h('td', null, m(cm))))),
    h('table', { class: 'ci-cond', style: 'margin-top:6px' }, lignes.map(([fn, cm]) => h('tr', null, h('td', null, h('i', { class: 'ci-fil', style: `background:${FONCTIONS[fn].col}` }), `${FONCTIONS[fn].n} (${FONCTIONS[fn].coul})`), h('td', null, m(cm))))),
    cab.notes.length ? h('p', { class: 'note' }, cab.notes.join(' ')) : null,
    h('p', { class: 'note' }, `Schéma de câblage usuel en suivant les gaines (${des.join(', ')}) : estimation à adapter au schéma réel.`),
    choixParGaine(c, cab));
}
/* choix des conducteurs gaine par gaine (format v15) : fils isolés (seulement les conducteurs utiles, sans câble 3G ou
   5G imposé), câble à la taille juste, ou câble d'un nombre de conducteurs choisi (avec réserve) */
function choixParGaine(c, cab) {
  const parGaine = new Map();
  for (const t of cab.troncons) {
    if (!t.duct) continue;
    const g = parGaine.get(t.duct) || { n: 0, cm: 0, compo: t.compo, libelle: t.libelle, des: t.des };
    if (t.n > g.n) { g.n = t.n; g.compo = t.compo; g.libelle = t.libelle; g.des = t.des; }
    g.cm += t.h + t.v; parGaine.set(t.duct, g);
  }
  if (!parGaine.size) return null;
  const rows = [...parGaine.entries()].map(([did, g]) => {
    const d = IDX.ducts.get(did); if (!d) return null;
    const cur = choixGaine(d, c.id), val = cur ? cur.t + (cur.n ? ':' + cur.n : '') : '';
    const opts = [['', 'Automatique (' + (c.cond && CONDUCTEURS[c.cond] ? CONDUCTEURS[c.cond].court : 'selon la gaine') + ')'], ['h07vu', `Fils H07V-U : ${g.n} fil${g.n > 1 ? 's' : ''}`], ['r2v', `Câble R2V à la taille juste (${g.des})`]];
    for (const n of NB_CABLE) if (n > g.n) opts.push(['r2v:' + n, `Câble R2V ${n} conducteurs (${n - g.n} de réserve)`]);
    if (cur && cur.n && cur.n < g.n) opts.push([val, `Câble R2V ${cur.n} conducteurs (trop petit)`]);
    opts.push(['souple', 'Câble souple H07RN-F']);
    const sel = h('select', { class: 'txt', 'data-gaine': did, 'aria-label': 'Conducteurs dans ' + nomChemin(d) }, opts.map(([v, n]) => h('option', { value: v, selected: v === val }, n)));
    sel.addEventListener('change', () => {
      const v = sel.value, conds = Object.assign({}, d.conds || {});
      if (!v) delete conds[c.id]; else { const [t, n] = v.split(':'); conds[c.id] = n ? { t, n: +n } : { t }; }
      if (Object.keys(conds).length) d.conds = conds; else delete d.conds;
      commit();
    });
    return h('div', { class: 'ci-gaine' }, h('div', null, h('b', null, nomChemin(d)), h('small', null, ` · ${m(g.cm)} · ${libelleCompo(g.compo)} · posé : ${g.libelle}`)), sel);
  }).filter(Boolean);
  return h('div', { class: 'ci-gaines' }, h('p', { class: 'note' }, 'Choisissez ce qui passe dans chaque gaine. « Fils » : seulement les conducteurs utiles (pas de 3G ou de 5G imposé). Un câble trop petit est signalé.'), ...rows);
}
function equipementsSection(c) {
  const ms = circMembers(c.id);
  const par = new Map(); for (const e of ms) { if (!par.has(e.type)) par.set(e.type, []); par.get(e.type).push(e.id); }
  if (!ms.length) return sec('Équipements raccordés', h('p', { class: 'note' }, 'Aucun : dans le plan, sélectionnez un symbole et choisissez ce circuit, ou utilisez « Câbler » depuis un point du circuit.'));
  return sec(`Équipements raccordés (${ms.length})`, h('div', { class: 'list' }, [...par].map(([t, ids]) => {
    const d = ELEC_BY.get(t);
    return h('button', { type: 'button', class: 'li', style: 'width:100%;border:0;background:transparent;text-align:left', onclick: () => montrer(ids) }, h('span', null, d ? d.n : t), h('span', { class: 'v' }, '× ' + ids.length));
  })));
}
function inspCircuit(c) {
  const nums = circNumbers(), rn = rcdNumbers(), k = CK[c.kind] || CK.autre;
  const aff = affiches();
  const typeSel = h('select', { class: 'txt', id: 'ci-kind', 'aria-label': 'Fonction du circuit' }, KIND_ORDER.map((key) => h('option', { value: key, selected: key === c.kind }, CK[key].n)));
  typeSel.addEventListener('change', () => { const nk = CK[typeSel.value]; c.kind = typeSel.value; c.cal = nk.cal; c.sec = nk.sec; c.ctrl = nk.ctrl || null; if (c.name === k.n || c.name === 'Nouveau circuit') c.name = nk.n; commit(); });
  const rcdSel = h('select', { class: 'txt', id: 'ci-rcd', 'aria-label': 'Interrupteur différentiel' }, h('option', { value: '' }, 'Aucun'), P.rcds.map((r) => h('option', { value: r.id, selected: r.id === c.rcd }, `${rn.get(r.id)} · ${r.cal} A · type ${r.type} (${rcdCircuits(r.id).length}/8)`)));
  rcdSel.addEventListener('change', () => { c.rcd = rcdSel.value || null; orderCircuits(); commit(); });
  const ctrlSel = h('select', { class: 'txt', id: 'ci-ctrl', 'aria-label': 'Commande' }, h('option', { value: '' }, 'Aucune'), Object.entries(CTRL_LABEL).map(([v, n]) => h('option', { value: v, selected: v === c.ctrl }, n)));
  ctrlSel.addEventListener('change', () => { c.ctrl = ctrlSel.value || null; commit(); });
  const smax = SEC_MAX[c.sec];
  const ctl = controlesCablage(P).filter((x) => x.cid === c.id);
  const seul = aff && aff.size === 1 && aff.has(c.id);
  const ch = cheminCircuit(P, c.id);
  return [
    inspHead(`${nums.get(c.id)} · ${c.name}`, k.n),
    body(
      sec('Sur le plan', btns(
        btn(seul ? 'Tout afficher' : 'Afficher seul', () => setAffiches(seul ? null : new Set([c.id])), 'sm' + (seul ? '' : ' pri')),
        aff && !seul ? btn(aff.has(c.id) ? 'Retirer de l’affichage' : 'Ajouter à l’affichage', () => basculerAffichage(c.id), 'sm') : null,
        btn('Cadrer', () => selectionner(c.id, true), 'sm'),
        btn('Tous les circuits', afficherListe, 'sm'))),
      sec('Désignation', textField(null, c.name, (v) => { c.name = v.trim() || k.n; commit(); }, { id: 'ci-name', ph: 'Nom du circuit' })),
      sec('Fonction', typeSel),
      champsV12(c)[0],
      sec('Protection : calibre', chipRow(CALS, c.cal, (v) => { c.cal = v; commit(); }, (v) => v + ' A')),
      champsV12(c)[1],
      sec('Section des conducteurs', chipRow(SECS, c.sec, (v) => { c.sec = v; commit(); }, (v) => String(v).replace('.', ',') + ' mm²'),
        smax && c.cal > smax ? h('p', { class: 'note', style: 'color:var(--bad)' }, `${String(c.sec).replace('.', ',')} mm² n’admet pas plus de ${smax} A (contrôle du tableau de Calque).`) : null),
      champsV12(c)[2],
      sec('Différentiel et commande', rcdSel, ctrlSel),
      sec('Valeurs calculées', valeursCalculees(c), ficheButton(c)),
      conducteursSection(c),
      equipementsSection(c),
      ctl.length ? sec('Contrôles du câblage', h('div', { class: 'ev-list' }, ctl.map((x) => ligneControle(x, nums))), h('p', { class: 'note' }, 'Constats de Calque : à vérifier, ce n’est pas une validation réglementaire.')) : null,
      sec('Câblage', btns(
        ch.tableau && !ch.complet && ch.points.length ? btn(`Proposer le raccordement (${ch.nonAtteints.length})`, () => proposerRaccordement([c.id]), 'sm pri') : null,
        btn('Câbler', () => demarrerCablage(null), 'sm', 'duct'),
        btn('Voir dans le tableau', () => { import('./tableau.js').then((t) => { ui.evSel = { t: 'circuit', id: c.id }; t.setView('elec'); }); }, 'sm'))),
    ),
  ];
}

/* ---------------- branchement dans l'inspecteur ---------------- */
/* champs v12 et résumé du câblage dans l'éditeur de circuit de l'onglet Tableau (sans import croisé) */
EXT.champsCircuit = (c) => {
  const r = resumeCircuit(P, c);
  return [...champsV12(c), r && r.principale ? sec('Câblage (estimé)', h('p', { class: 'note' }, `Au départ : ${r.principale} ; jusqu’à ${r.max} conducteurs par tronçon${r.complet ? '' : ' (circuit incomplet)'}.`), btns(btn('Gérer sur le plan', () => import('./tableau.js').then((t) => { t.setView('plan'); selectionner(c.id, true); }), 'sm'))) : null];
};
EXT.obj.circuits = () => (P ? { id: '*' } : null);
EXT.obj.circuit = (id) => circById(id);
EXT.insp.circuits = inspCircuits;
EXT.insp.circuit = inspCircuit;
EXT.del.circuits = () => false;
EXT.del.circuit = () => { toast('Pour supprimer un circuit : onglet Tableau électrique, circuit, « Supprimer ».'); return false; };

export { affiches, champsV12, inspCircuit, inspCircuits, montrer, ouvrirGestionnaire, selectionner, setAffiches };

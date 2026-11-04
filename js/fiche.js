/* Calque — module « fiche de calcul » : fenêtre de calcul d'un circuit, ouverte depuis le plan (inspecteur d'un
   symbole) et depuis l'onglet Tableau électrique. Affiche les hypothèses, les formules, les données utilisées
   (avec leur statut), les données manquantes, les alertes et les contrôles à trois statuts.
   Les calculs eux-mêmes sont dans calcul.js (sans écran). Module JavaScript natif (aucune compilation). */
import { $, P } from './noyau.js';
import { CONF, LIB_STATUT, bilanDuPlan, controlesDifferentiels, entreesDuPlan, equilibrageDuPlan, ficheCircuit, fmt, puissanceCircuit } from './calcul.js';
import { TABLES, tableDisponible } from './normes.js';
import { circById, circNumbers, circuitColor, nfcChecks, rcdNumbers } from './electricite.js';
import { ICON, btn, btns, closeModal, h, numField, sec, segCtl, textField, toast } from './interface.js';
import { commit } from './interaction.js';
import { EV, on } from './evenements.js';

const FI = { cid: null };
const STATUT_OPTS = [{ v: 'saisie', n: 'Saisie' }, { v: 'verifiee', n: 'Vérifiée' }, { v: 'estimee', n: 'Estimée' }];
const ICON_SEV = { err: '✕', warn: '!', info: 'i', bad: '✕' };

function pillStatut(st) { return h('span', { class: 'stat st-' + st }, CONF[st] || CONF.verification); }
function badgeDonnee(st) { return st ? h('span', { class: 'badge b-' + st }, LIB_STATUT[st]) : h('span', { class: 'badge b-manq' }, 'Manquante'); }
/* statut d'un circuit (pour le tableau et l'inspecteur) */
function statutCircuit(c) { return ficheCircuit(entreesDuPlan(P, c)).statut; }

/* ---- données de calcul enregistrées dans le circuit (c.calc, format v5) ---- */
const calcOf = (c) => c.calc || (c.calc = {});
function tidy(c) { if (c.calc && !Object.keys(c.calc).length) delete c.calc; }
/* champ d'une donnée numérique : valeur, statut (saisie / vérifiée / estimée), origine, effacer.
   box(true) renvoie l'objet qui porte la donnée (créé au besoin), box(false) l'objet existant ou null ; clean() range après effacement */
function champDonnee(box, key, label, unit, o, clean) {
  const cur = box(false), d = cur && cur[key];
  const setV = (v) => { box(true)[key] = Object.assign({ v, st: d ? d.st : 'saisie' }, d && d.src ? { src: d.src } : {}); commit(); };
  const kids = [numField(label, d ? d.v : null, unit, setV, { id: 'fi-' + key, min: o.min, max: o.max })];
  if (o.chips) kids.push(h('div', { class: 'chips' }, o.chips.map((v) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!d && Math.abs(d.v - v) < 1e-9), onclick: () => setV(v) }, fmt(v, 3)))));
  if (d) {
    kids.push(h('div', { class: 'fi-st' }, h('span', { class: 'fi-lab' }, 'Fiabilité'), segCtl(STATUT_OPTS, d.st, (st) => {
      if (st === 'verifiee' && !d.src) { toast('Indiquez d’abord l’origine de la valeur (notice, plaque, mesure…).'); const f = document.getElementById('fi-' + key + '-src'); if (f) f.focus(); return; }
      d.st = st; commit();
    })));
    kids.push(textField(null, d.src, (v) => { v = v.trim(); if (v) d.src = v; else { delete d.src; if (d.st === 'verifiee') d.st = 'saisie'; } commit(); }, { id: 'fi-' + key + '-src', ph: 'Origine : notice, plaque signalétique, mesure…' }));
    kids.push(btns(btn('Effacer', () => { delete box(true)[key]; if (clean) clean(); commit(); }, 'sm', 'del')));
  }
  if (o.note) kids.push(h('p', { class: 'note' }, o.note));
  return h('div', { class: 'fi-champ' }, ...kids);
}
const calcBox = (c) => (create) => (create ? calcOf(c) : c.calc || null);

/* ---- contenu de la fiche ---- */
function ficheBody(c) {
  const en = entreesDuPlan(P, c), f = ficheCircuit(en);
  const reseau = en.reseau;
  const parts = [];
  // statut
  parts.push(h('div', { class: 'fi-top' }, pillStatut(f.statut),
    h('span', { class: 'note' }, f.statut === 'verification' ? 'Au moins un contrôle n’a pas pu être vérifié.' : f.statut === 'non_conforme' ? 'Au moins un contrôle n’est pas respecté.' : 'Tous les contrôles sont vérifiés.')));
  // alertes (moteur + contrôle actuel du tableau)
  const calque = nfcChecks().filter((x) => x.sev !== 'ok' && x.ref && ((x.ref.t === 'circuit' && x.ref.id === c.id) || (x.ref.t === 'elec' && (P.elec.find((e) => e.id === x.ref.id) || {}).cid === c.id)));
  if (f.alertes.length || calque.length) parts.push(sec('Alertes', h('div', { class: 'ev-list' },
    f.alertes.map((a) => h('div', { class: 'ev-chk ' + (a.niveau === 'bad' ? 'err' : 'info') }, h('span', { class: 'ic' }, ICON_SEV[a.niveau] || 'i'), h('span', { class: 'tx' }, a.texte))),
    calque.map((x) => h('div', { class: 'ev-chk ' + x.sev }, h('span', { class: 'ic' }, ICON_SEV[x.sev] || 'i'), h('span', { class: 'tx' }, x.msg, h('small', null, 'Contrôle actuel du tableau de Calque (indicatif, source à confirmer)')))))));
  // données manquantes
  if (f.manquantes.length) parts.push(sec('Données manquantes', h('ul', { class: 'fi-manq' }, f.manquantes.map((m) => h('li', null, h('b', null, m.nom), ' — ', m.pourquoi)))));
  // saisie
  const pw = puissanceCircuit(P, Object.assign({}, c, { calc: Object.assign({}, c.calc, { p: undefined }) }));
  const pNote = c.calc && c.calc.p
    ? (pw.P ? `Remplace la somme des symboles reliés (${fmt(pw.P.v, 0)} W, ${LIB_STATUT[pw.P.st].toLowerCase()}).` : 'Puissance du circuit (les symboles reliés n’ont pas tous une puissance connue).')
    : (pw.P ? `Sans saisie : somme des symboles reliés, ${fmt(pw.P.v, 0)} W (${LIB_STATUT[pw.P.st].toLowerCase()}).` : (pw.detail.raison || ''));
  const cosNote = c.calc && c.calc.cos ? null : en.cos ? `Sans saisie : cos φ = ${fmt(en.cos.v, 3)} (${LIB_STATUT[en.cos.st].toLowerCase()} : ${en.cos.src.toLowerCase()}).` : 'Aucune valeur par défaut : 1 pour une charge résistive (radiateur, résistance), voir la notice pour les autres appareils.';
  const k = c.calc || {};
  const phaseOpts = [{ v: null, n: 'Non précisé' }, { v: 'L1', n: 'L1' }, { v: 'L2', n: 'L2' }, { v: 'L3', n: 'L3' }, { v: 'tri', n: 'Triphasé' }];
  parts.push(sec('Données du circuit',
    champDonnee(calcBox(c), 'p', 'Puissance prévue', 'W', { min: 1, max: 1e6, note: pNote }, () => tidy(c)),
    champDonnee(calcBox(c), 'cos', 'Facteur de puissance cos φ', '', { min: 0.01, max: 1, chips: [1, 0.95, 0.9, 0.85, 0.8], note: cosNote }, () => tidy(c)),
    champDonnee(calcBox(c), 'len', 'Longueur du câble (tableau → point le plus éloigné)', 'm', { min: 0.1, max: 10000, note: k.len ? null : 'Mesurez ou estimez la longueur réelle du câble. Le calcul depuis les cheminements viendra à la phase 4.' }, () => tidy(c)),
    h('div', { class: 'fi-champ' }, h('span', { class: 'fi-lab' }, 'Métal des conducteurs'),
      segCtl([{ v: null, n: 'Non précisé' }, { v: 'cu', n: 'Cuivre' }, { v: 'al', n: 'Aluminium' }], k.mat || null, (v) => { if (v) calcOf(c).mat = v; else if (c.calc) delete c.calc.mat; tidy(c); commit(); }),
      k.mat ? null : h('p', { class: 'note' }, 'Non précisé : cuivre retenu (estimé).')),
    h('div', { class: 'fi-champ' }, h('span', { class: 'fi-lab' }, 'Raccordement'),
      reseau.v !== 'tri' && !k.phase ? null : segCtl(phaseOpts, k.phase || null, (v) => { if (v) calcOf(c).phase = v; else if (c.calc) delete c.calc.phase; tidy(c); commit(); }),
      h('p', { class: 'note' }, reseau.v === 'tri' ? 'Installation triphasée : choisissez la phase du circuit (équilibrage) ou « Triphasé » pour un appareil sur les trois phases.'
        : `Installation ${reseau.st === 'estimee' ? 'monophasée (non précisé, estimé)' : 'monophasée'} : réglage dans Tableau électrique › Arrivée et installation.`)),
    h('p', { class: 'note' }, `Calibre ${c.cal} A et section ${String(c.sec).replace('.', ',')} mm² : modifiables dans l’onglet Tableau électrique.`)));
  // résultats et formules
  const r = f.resultats;
  if (f.formules.length) parts.push(sec('Résultats et formules',
    h('dl', { class: 'kv' }, [['Intensité d’emploi IB', r.IB, 'A', 2], ['Puissance apparente S', r.S, 'VA', 0], ['Puissance réactive Q', r.Q, 'var', 0], ['Chute de tension ΔU', r.dU, 'V', 2], ['Chute de tension ΔU %', r.dUpct, '%', 2]]
      .filter((x) => x[1]).map(([n, x, u, dd]) => [h('dt', null, n), h('dd', null, `${fmt(x.v, dd)} ${u} `, badgeDonnee(x.st))])),
    h('div', { class: 'fi-formules' }, f.formules.map((x) => h('div', { class: 'fi-f' }, h('b', null, x.nom), h('code', null, x.expr), h('code', { class: 'appli' }, x.appli), h('span', { class: 'res' }, `= ${fmt(x.res, 3)} ${x.unite}`))))));
  else parts.push(sec('Résultats et formules', h('p', { class: 'note' }, 'Aucun résultat : complétez les données manquantes ci-dessus.')));
  // contrôles
  parts.push(sec('Contrôles', h('div', { class: 'fi-ctl' }, f.controles.map((x) => h('div', { class: 'fi-c' },
    h('div', { class: 'fi-ch' }, h('b', null, x.nom), pillStatut(x.statut)),
    x.detail ? h('span', null, x.detail) : null,
    h('small', null, `Source : ${x.source} · Édition : ${x.edition}`))))));
  // données utilisées
  parts.push(sec('Données utilisées', h('table', { class: 'fi-tab' }, h('tbody', null, f.donnees.map((x) => h('tr', null,
    h('td', null, x.nom), h('td', { class: 'n' }, x.aff != null ? `${x.aff}${x.unite ? ' ' + x.unite : ''}` : '—'), h('td', null, badgeDonnee(x.st)), h('td', { class: 'src' }, x.src || '')))))));
  // hypothèses
  parts.push(sec('Hypothèses', h('ul', { class: 'fi-hyp' }, f.hypotheses.map((t) => h('li', null, t)))));
  // tableaux manquants
  const manq = [...new Set(f.controles.flatMap((x) => x.tablesManquantes || []))];
  if (manq.length) parts.push(sec('Tableaux NF C 15-100 manquants', h('p', { class: 'note' }, 'Ils seront recopiés depuis les extraits Legrand. Tant qu’ils manquent, les contrôles qui en dépendent restent « vérification nécessaire ».'),
    h('ul', { class: 'fi-hyp' }, manq.map((t) => h('li', null, t)))));
  parts.push(h('p', { class: 'note' }, 'Calcul indicatif établi avec Calque. Il ne remplace pas l’étude d’un professionnel.'));
  return parts;
}

/* ---- fenêtre ---- */
function renderFiche(first) {
  const c = circById(FI.cid);
  const m = $('#modal');
  if (!c) { if (m.querySelector('.fiche')) closeModal(); FI.cid = null; return; }
  const old = m.querySelector('.mbody');
  const scroll = !first && old ? old.scrollTop : 0;
  const ae = document.activeElement, focusId = !first && ae && m.contains(ae) ? ae.id : null;
  const num = circNumbers().get(c.id) || '?';
  const body = h('div', { class: 'mbody fiche' }, ...ficheBody(c));
  m.replaceChildren(h('div', { class: 'pop-head' },
    h('h2', null, h('span', { class: 'ev-num', style: `--cc:${circuitColor(c.id) || 'var(--elec)'}` }, num), ' Fiche de calcul · ', c.name),
    h('button', { class: 'ib', type: 'button', 'aria-label': 'Fermer', html: ICON.x, onclick: () => { FI.cid = null; closeModal(); } })), body);
  m.classList.add('wide');
  m.hidden = false; $('#scrim').hidden = false;
  for (const p of document.querySelectorAll('.pop')) p.hidden = true;
  body.scrollTop = scroll;
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
}
function openFiche(cid) {
  if (!circById(cid)) { toast('Circuit introuvable.'); return; }
  FI.cid = cid; renderFiche(true);
}
/* la fiche suit le plan : modification, annuler, rétablir */
on(EV.PLAN_CHANGE, () => { if (FI.cid && !$('#modal').hidden && $('#modal').querySelector('.fiche')) renderFiche(false); });

/* bouton « Fiche de calcul » avec le statut du circuit (inspecteur du plan, éditeur du tableau) */
function ficheButton(c) {
  const st = statutCircuit(c);
  return h('div', { class: 'fi-btn' }, btn('Fiche de calcul', () => openFiche(c.id), 'sm', 'info'), pillStatut(st));
}
/* ---- onglet « Bilan et phases » du Tableau électrique ---- */
function bilanView() {
  const inst = P.install || (P.install = {});
  const b = bilanDuPlan(P), eq = equilibrageDuPlan(P, b);
  const nums = circNumbers();
  const kW = (w) => (w == null ? '—' : fmt(w / 1000, 2) + ' kW'), kVA = (w) => (w == null ? '—' : fmt(w / 1000, 2) + ' kVA');
  const box = (n, v, sub) => h('div', { class: 'ev-sumbox bi-box' }, h('b', null, v), h('span', null, n), sub ? h('small', null, sub) : null);
  const parts = [];
  parts.push(h('div', { class: 'ev-sum bi-sum' },
    box('Puissance installée', kW(b.Pinstallee), b.complet ? null : 'partielle (minimum)'),
    box('Puissance apparente', kVA(b.Sinstallee), b.Sinstallee == null ? 'incomplète' : `cos φ ${fmt(b.cos, 2)}`),
    box('Puissance appelée', b.ks ? kW(b.Pappelee) : '—', b.ks ? `ks = ${fmt(b.ks.v, 2)} (${LIB_STATUT[b.ks.st].toLowerCase()})` : 'ks manquant'),
    box('Puissance souscrite', b.souscrite ? kVA(b.souscrite.v) : '—', b.reseau.v === 'tri' ? 'triphasé' : 'monophasé' + (b.reseau.st === 'estimee' ? ' (estimé)' : ''))));
  parts.push(h('p', { class: 'note' }, 'Bilan indicatif : somme des puissances des circuits, S = √(ΣP² + ΣQ²). La puissance appelée applique le coefficient de simultanéité ks, s’il est indiqué. Il ne remplace pas l’étude d’un professionnel.'));
  if (b.alertes.length) parts.push(h('div', { class: 'ev-list' }, b.alertes.map((a) => h('div', { class: 'ev-chk ' + (a.niveau === 'bad' ? 'err' : 'info') }, h('span', { class: 'ic' }, ICON_SEV[a.niveau] || 'i'), h('span', { class: 'tx' }, a.texte)))));
  if (b.manquantes.length) parts.push(h('section', null, h('h3', null, 'Données manquantes'), h('ul', { class: 'fi-manq' }, b.manquantes.map((m) => h('li', null, h('b', null, m.nom), ' — ', m.pourquoi)))));
  const ksBox = (create) => (create ? (P.install || (P.install = {})) : P.install || null);
  parts.push(h('section', null, h('h3', null, 'Coefficient de simultanéité'),
    champDonnee(ksBox, 'ks', 'ks (entre 0 et 1)', '', { min: 0.01, max: 1, note: tableDisponible('simultaneite') ? null : 'Aucune valeur par défaut : le tableau des coefficients (extrait Legrand) n’a pas encore été fourni. Saisissez une valeur si vous la connaissez.' })));
  // circuits
  parts.push(h('section', null, h('h3', null, 'Circuits'), h('div', { class: 'ev-table bi-table' }, h('table', null,
    h('thead', null, h('tr', null, ['Repère', 'Désignation', 'P', 'cos φ', 'S', 'IB', 'Phase', 'Statut', ''].map((t) => h('th', null, t)))),
    h('tbody', null, b.lignes.map((l) => h('tr', null,
      h('td', null, h('span', { class: 'ev-num', style: `--cc:${circuitColor(l.id) || 'var(--elec)'}` }, nums.get(l.id))),
      h('td', null, l.nom),
      h('td', { class: 'n' }, l.P != null ? [fmt(l.P, 0) + ' W ', badgeDonnee(l.Pst)] : badgeDonnee(null)),
      h('td', { class: 'n' }, l.cos != null ? fmt(l.cos, 2) : '—'),
      h('td', { class: 'n' }, l.S != null ? fmt(l.S, 0) + ' VA' : '—'),
      h('td', { class: 'n' }, l.IB != null ? fmt(l.IB, 2) + ' A' : '—'),
      h('td', null, l.phase ? (l.phase === 'tri' ? 'Tri' : l.phase) + (l.phaseSt === 'estimee' ? ' (estimé)' : '') : '—'),
      h('td', null, pillStatut(l.statut)),
      h('td', null, btn('Fiche', () => openFiche(l.id), 'sm')))))))));
  // équilibrage
  const ph = h('section', null, h('h3', null, 'Équilibrage des phases'));
  if (!eq.applicable) ph.append(h('p', { class: 'note' }, b.reseau.st === 'estimee' ? 'Réseau non précisé (monophasé retenu) : choisissez « Triphasé 400 V » dans Arrivée et installation pour répartir les circuits sur les trois phases.' : 'Installation monophasée : pas d’équilibrage à faire.'));
  else {
    const max = Math.max(eq.L1, eq.L2, eq.L3, eq.proposition.L1, eq.proposition.L2, eq.proposition.L3, 1);
    const bars = (e) => h('div', { class: 'bi-bars' }, ['L1', 'L2', 'L3'].map((p) => h('div', { class: 'bi-bar' }, h('span', null, p), h('i', { style: `width:${Math.round(e[p] / max * 100)}%` }), h('b', null, fmt(e[p], 1) + ' A'))));
    ph.append(h('p', { class: 'note' }, 'Somme des intensités d’emploi par phase. Un circuit triphasé compte sur les trois phases. Déséquilibre = (I max − I moyen) / I moyen.'),
      h('div', { class: 'bi-eq' }, h('div', null, h('b', null, 'Répartition actuelle'), bars(eq), h('p', { class: 'note' }, eq.moyenne > 0 ? `Déséquilibre ${fmt(eq.desequilibre, 1)} %` : 'Aucun circuit réparti pour le moment.')),
        h('div', null, h('b', null, 'Répartition proposée'), bars(eq.proposition), h('p', { class: 'note' }, `Déséquilibre ${fmt(eq.proposition.desequilibre, 1)} %`))));
    if (eq.sansPhase.length) ph.append(h('p', { class: 'note', style: 'color:var(--bad)' }, `Sans phase : ${eq.sansPhase.join(', ')}.`));
    if (eq.sansI.length) ph.append(h('p', { class: 'note' }, `Non comptés (intensité inconnue) : ${eq.sansI.join(', ')}.`));
    const n = Object.keys(eq.proposition.phases).length;
    if (n) ph.append(btns(btn('Appliquer la répartition proposée', () => {
      for (const [id, p] of Object.entries(eq.proposition.phases)) { const c = circById(id); if (c && !(c.calc && c.calc.phase === 'tri')) calcOf(c).phase = p; }
      commit(); toast(`${n} circuit${n > 1 ? 's' : ''} réparti${n > 1 ? 's' : ''} sur les phases. « Annuler » pour revenir.`);
    }, 'pri sm')));
  }
  parts.push(ph);
  // interrupteurs différentiels (extrait Legrand)
  const dd = controlesDifferentiels(P), rn = rcdNumbers();
  const ctlBox = (x) => h('div', { class: 'fi-c' }, h('div', { class: 'fi-ch' }, h('b', null, x.nom), pillStatut(x.statut)), h('span', null, x.detail), h('small', null, `Source : ${x.source} · Édition : ${x.edition}`));
  parts.push(h('section', { class: 'fiche' }, h('h3', null, 'Interrupteurs différentiels'),
    h('div', { class: 'fi-ctl' }, dd.global.map(ctlBox),
      dd.rcds.map((r) => h('div', { class: 'fi-c' }, h('div', { class: 'fi-ch' }, h('b', null, `${rn.get(r.id)} · ${r.cal} A · type ${r.type} · ${r.n} circuit${r.n > 1 ? 's' : ''}`), pillStatut(r.statut)),
        r.controles.map((x) => h('span', null, `${x.nom} : ${CONF[x.statut].toLowerCase()}. ${x.detail}`)),
        h('small', null, `Source : ${r.controles[0].source.replace(/, p\. .*$/, '')} · Édition : ${r.controles[0].edition}`)))),
    h('p', { class: 'note' }, 'Le contrôle actuel du tableau (onglet Contrôle) compte aussi la pompe à chaleur et la borne de recharge à 100 % : il est plus prudent que la règle de l’extrait.')));
  // tableaux NF C 15-100
  parts.push(h('section', null, h('h3', null, 'Tableaux NF C 15-100 (extraits Legrand)'),
    h('p', { class: 'note' }, 'Tant qu’un tableau manque, les contrôles qui en dépendent restent « vérification nécessaire ».'),
    h('div', { class: 'ev-list' }, TABLES.map((t) => h('div', { class: 'ev-chk ' + (tableDisponible(t.id) ? 'ok' : 'warn') }, h('span', { class: 'ic' }, tableDisponible(t.id) ? '✓' : '!'),
      h('span', { class: 'tx' }, h('b', null, t.titre), t.contenu, h('small', null, tableDisponible(t.id) ? `Recopié de : ${t.source} · Édition : ${t.edition}${t.page ? ' · ' + t.page : ''}` : 'Manquant : extrait à fournir')))))));
  return h('div', { class: 'ev-checks bilan' }, ...parts);
}

export { FI, bilanView, badgeDonnee, ficheBody, ficheButton, openFiche, pillStatut, renderFiche, statutCircuit };

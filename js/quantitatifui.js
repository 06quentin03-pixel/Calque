/* Calque — module « quantitatif (écran) » : onglet « Quantitatif » du Tableau électrique.
   Quantités du plan (global, par pièce, par circuit), saisie des prix unitaires HT et des temps de pose, totaux,
   export pour tableur (CSV). Les calculs sont dans quantitatif.js (sans écran).
   Aucun prix n'est fourni par Calque : une ligne sans prix reste « non chiffrée », le total est alors « partiel ». */
import { P, ui } from './noyau.js';
import { geo } from './geometrie.js';
import { commit, commitLeger } from './interaction.js';
import { btn, btns, h, parseNum, segCtl, toast } from './interface.js';
import { badgeDonnee } from './fiche.js';
import { articleView } from './technique.js';
import { UL, setPrix } from './mabiblio.js';
import { openFileModal } from './export.js';
import { slug } from './stockage.js';
import { chiffrer, csvQuantitatif, quantitatif, totalGroupe } from './quantitatif.js';

const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const nb = (v, d = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(v);
const enSaisie = (v) => (v == null ? '' : String(Math.round(v * 100) / 100).replace('.', ','));

/* contours des pièces de chaque niveau, pour ranger les appareils par pièce */
function piecesDuPlan() {
  const out = {};
  for (const L of P.levels) out[L.id] = geo(L.id).rooms.map((r) => ({ nom: r.label ? r.label.name : '', poly: r.poly, holes: r.holes }));
  return out;
}
const quantitatifDuPlan = () => quantitatif(P, { pieces: piecesDuPlan() });
const referenceDe = (art) => { const v = articleView(art, UL.refs); return v && v.ref ? { ref: v.ref, fab: v.fab, fiab: v.fiab } : null; };
const chiff = () => P.chiffrage || (P.chiffrage = { prix: {}, temps: {} });

/* saisie d'un prix ou d'un temps : '' efface ; la valeur est aussi gardée dans « mes prix » (sur l'appareil) */
function saisir(champ, cle, input) {
  const box = chiff()[champ] || (chiff()[champ] = {}), txt = input.value.trim();
  if (txt === '') { if (!box[cle]) return; delete box[cle]; valider(); return; }
  const v = parseNum(txt);
  if (!Number.isFinite(v) || v < 0 || v >= (champ === 'prix' ? 1e7 : 1e5)) { toast('Saisissez un nombre positif.'); input.value = enSaisie(box[cle] ? box[cle].v : null); return; }
  if (box[cle] && Math.abs(box[cle].v - v) < 1e-9) return;
  box[cle] = { v, st: 'saisie' };
  setPrix(cle, champ === 'prix' ? 'pu' : 'tps', v);
  valider();
}
/* une saisie ne change que le chiffrage : les quantités affichées restent justes, seuls les totaux sont recalculés
   (sur un très gros plan, tout recalculer et redessiner à chaque prix rendait la saisie lente). Si le tableau affiché
   n'est plus le bon, on revient à la modification ordinaire. */
function valider() {
  const e = ETAT, parent = e && e.root.parentElement;
  if (!e || !e.root.isConnected || !parent || e.mode !== 'global') { commit(); return; }
  commitLeger(() => { if (!quantPatch(parent, e.q)) { const sc = parent.scrollTop; parent.replaceChildren(quantView()); parent.scrollTop = sc; } });
}
function saisirParam(k, input, max) {
  const c = chiff(), txt = input.value.trim();
  if (txt === '') { if (c[k]) { delete c[k]; valider(); } return; }
  const v = parseNum(txt);
  if (!Number.isFinite(v) || v < 0 || v > max) { toast(`Saisissez une valeur entre 0 et ${max}.`); input.value = enSaisie(c[k] ? c[k].v : null); return; }
  c[k] = { v, st: 'saisie' }; valider();
}
const champ = (attrs) => { const i = h('input', Object.assign({ class: 'num qt-in', type: 'text', inputmode: 'decimal', autocomplete: 'off', enterkeyhint: 'done' }, attrs)); i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); i.blur(); } }); return i; };

function boites(ch) {
  const box = (n, v, sub, cls) => h('div', { class: 'ev-sumbox bi-box' + (cls ? ' ' + cls : '') }, h('b', null, v), h('span', null, n), sub ? h('small', null, sub) : null);
  const partiel = ch.complet ? null : `partiel : ${ch.sansPrix} ligne${ch.sansPrix > 1 ? 's' : ''} sans prix`;
  return [
    box('Lignes chiffrées', `${ch.chiffrees} / ${ch.lignes.length}`, ch.complet ? 'toutes les lignes ont un prix' : 'saisissez les prix unitaires HT'),
    box('Fournitures HT', ch.chiffrees ? eur.format(ch.fournitures) : '—', ch.chiffrees ? partiel : null),
    box('Main-d’œuvre HT', ch.mainOeuvre != null ? eur.format(ch.mainOeuvre) : '—', ch.mainOeuvre != null ? `${nb(ch.heures, 1)} h × ${nb(ch.tauxH.v, 2)} €/h` : ch.lignesAvecTemps ? `${nb(ch.heures, 1)} h · taux horaire manquant` : 'temps de pose et taux horaire à saisir'),
    box(ch.tva ? 'Total TTC' : 'Total HT', ch.chiffrees || ch.mainOeuvre != null ? eur.format(ch.tva ? ch.totalTTC : ch.totalHT) : '—', [ch.tva ? `HT ${eur.format(ch.totalHT)} · TVA ${nb(ch.tva.v, 1)} %` : 'TVA non saisie', ch.complet ? null : 'total partiel'].filter(Boolean).join(' · ')),
  ];
}

/* mes prix enregistrés sur l'appareil pour des lignes encore sans prix dans ce plan */
function reprises(ch) {
  const out = [];
  for (const l of ch.lignes) { const m = UL.prix && UL.prix[l.cle]; if (!m) continue; if ((m.pu != null && !l.pu) || (m.tps != null && !l.temps)) out.push([l, m]); }
  return out;
}
function reprendre(ch) {
  const c = chiff(); let n = 0;
  for (const [l, m] of reprises(ch)) {
    if (m.pu != null && !l.pu) { c.prix[l.cle] = { v: m.pu, st: 'saisie', src: 'Mes prix (saisi dans un autre plan)' }; n++; }
    if (m.tps != null && !l.temps) { c.temps[l.cle] = { v: m.tps, st: 'saisie', src: 'Mes prix (saisi dans un autre plan)' }; n++; }
  }
  if (n) { commit(); toast(`${n} valeur${n > 1 ? 's reprises' : ' reprise'} de vos prix enregistrés.`); }
}

function exporterCSV() {
  const q = quantitatifDuPlan(), ch = chiffrer(q, P.chiffrage);
  const csv = csvQuantitatif(q, ch, { referenceDe, titre: `Quantitatif — ${P.name || 'Plan'}` });
  const file = new File([csv], `${slug(P.name)}-quantitatif.csv`, { type: 'text/csv' });
  openFileModal('Quantitatif pour tableur', file, `${file.name} · s’ouvre dans Numbers, Excel ou LibreOffice (séparateur point-virgule). Contient le quantitatif chiffré, les quantités par pièce et par circuit.`);
}

function tableGlobale(ch, refs) {
  const rows = []; let cat = null;
  for (const l of ch.lignes) {
    if (l.cat !== cat) { cat = l.cat; rows.push(h('tr', { class: 'qt-cat' }, h('th', { colspan: '6' }, cat))); }
    const r = l.art ? referenceDe(l.art) : null;
    const tot = h('td', { class: 'n qt-tot' }, l.total != null ? eur.format(l.total) : h('span', { class: 'badge b-manq' }, 'Non chiffré'));
    const pu = champ({ value: enSaisie(l.pu ? l.pu.v : null), 'aria-label': `Prix unitaire HT : ${l.des}`, placeholder: '€', 'data-k': 'prix|' + l.cle });
    pu.addEventListener('change', () => saisir('prix', l.cle, pu));
    const tp = champ({ value: enSaisie(l.temps ? l.temps.v : null), 'aria-label': `Temps de pose en minutes : ${l.des}`, placeholder: 'min', 'data-k': 'temps|' + l.cle });
    tp.addEventListener('change', () => saisir('temps', l.cle, tp));
    refs.set(l.cle, { tot, pu, tp });
    rows.push(h('tr', { 'data-cle': l.cle },
      h('td', null, l.des, r ? h('small', { class: 'note', style: 'display:block' }, [r.fab, r.ref].filter(Boolean).join(' ')) : null, l.note ? h('small', { class: 'note', style: 'display:block' }, l.note) : null),
      h('td', { class: 'n' }, h('b', null, `${nb(l.qte)} ${l.unite}`)),
      h('td', null, l.st === 'estimee' ? badgeDonnee('estimee') : h('span', { class: 'badge b-saisie' }, 'Comptée')),
      h('td', { class: 'n' }, pu), tot, h('td', { class: 'n' }, tp)));
  }
  return h('div', { class: 'ev-table bi-table qt-table' }, h('table', null,
    h('thead', null, h('tr', null, ['Désignation', 'Quantité', 'Fiabilité', 'Prix unitaire HT (€)', 'Total HT', 'Pose (min / unité)'].map((t) => h('th', null, t)))),
    h('tbody', null, rows)));
}
function tableGroupes(groupes, titre, sousTitre) {
  if (!groupes.length) return h('p', { class: 'note' }, 'Rien à afficher pour le moment.');
  return h('div', { class: 'qt-groupes' }, groupes.map((g) => {
    const t = totalGroupe(g.lignes, P.chiffrage);
    return h('section', { class: 'qt-groupe' },
      h('h3', null, titre(g), h('small', null, sousTitre(g, t))),
      g.lignes.length ? h('div', { class: 'ev-table bi-table' }, h('table', null, h('tbody', null, g.lignes.map((l) => {
        const p = P.chiffrage && P.chiffrage.prix[l.cle];
        return h('tr', null, h('td', null, l.des), h('td', { class: 'n' }, h('b', null, `${nb(l.qte)} ${l.unite}`)), h('td', { class: 'n' }, p ? eur.format(Math.round(p.v * l.qte * 100) / 100) : h('span', { class: 'badge b-manq' }, 'Non chiffré')));
      })))) : h('p', { class: 'note' }, 'Aucun appareil.'));
  }));
}
const sousTotal = (t, n) => `${n} ligne${n > 1 ? 's' : ''}${t.total || !t.sansPrix ? ' · ' + eur.format(t.total) + ' HT' + (t.sansPrix ? ` (partiel, ${t.sansPrix} sans prix)` : '') : ''}`;

let ETAT = null; // dernier affichage : pour mettre les totaux à jour sans reconstruire le tableau (la saisie garde le curseur)

function quantView() {
  const mode = ui.qtTab || 'global';
  const q = quantitatifDuPlan(), ch = chiffrer(q, P.chiffrage);
  const refs = new Map();
  const sum = h('div', { class: 'ev-sum bi-sum' }, ...boites(ch));
  const rep = reprises(ch);
  const tauxIn = champ({ value: enSaisie(ch.tauxH ? ch.tauxH.v : null), 'aria-label': 'Taux horaire de main-d’œuvre HT', placeholder: '€ / h', id: 'qtTaux' });
  tauxIn.addEventListener('change', () => saisirParam('tauxH', tauxIn, 9999));
  const tvaIn = champ({ value: enSaisie(ch.tva ? ch.tva.v : null), 'aria-label': 'Taux de TVA', placeholder: '%', id: 'qtTva' });
  tvaIn.addEventListener('change', () => saisirParam('tva', tvaIn, 100));
  let corps;
  if (!q.lignes.length) corps = h('p', { class: 'note' }, 'Rien à compter pour le moment : posez des appareils sur le plan, puis générez le tableau.');
  else if (mode === 'piece') corps = tableGroupes(q.parPiece, (g) => `${g.piece} `, (g, t) => `${g.niveau} · ${sousTotal(t, g.lignes.length)}`);
  else if (mode === 'circuit') corps = tableGroupes(q.parCircuit, (g) => `${g.repere} · ${g.nom} `, (g, t) => `${g.type} · ${sousTotal(t, g.lignes.length)}${g.cableConnu ? '' : ' · câble non compté (circuit pas entièrement raccordé par les gaines)'}`);
  else corps = tableGlobale(ch, refs);
  const root = h('div', { class: 'ev-checks bilan metres quant', id: 'qtRoot' },
    sum,
    h('div', { class: 'qt-bar' },
      segCtl([{ v: 'global', n: 'Global' }, { v: 'piece', n: 'Par pièce' }, { v: 'circuit', n: 'Par circuit' }], mode, (v) => { ui.qtTab = v; ETAT = null; const r = document.getElementById('qtRoot'); if (r && r.parentElement) { const p = r.parentElement; p.replaceChildren(quantView()); p.scrollTop = 0; } }),
      btns(rep.length ? btn(`Reprendre mes prix (${rep.length})`, () => reprendre(chiffrer(quantitatifDuPlan(), P.chiffrage)), 'sm') : null, btn('Tableur (CSV)', exporterCSV, 'sm', 'down'))),
    h('p', { class: 'note' }, mode === 'global'
      ? `Appareils comptés sur le plan, protections lues dans le tableau, cheminements et conducteurs mesurés avec ${nb(q.reserve.v)} % de réserve (estimés). Les prix et les temps de pose sont les vôtres : Calque n’en fournit aucun. Ils sont gardés dans ce plan et mémorisés sur cet appareil pour vos prochains plans.`
      : mode === 'piece' ? 'Appareils de chaque pièce (un appareil posé sur un mur est rangé dans la pièce la plus proche). Les prix se saisissent dans la vue « Global ».'
        : 'Protection, appareils et conducteurs de chaque circuit. Les prix se saisissent dans la vue « Global ».'),
    corps,
    q.sansLongueur.length && mode !== 'piece' ? h('p', { class: 'note', style: 'color:var(--bad)' }, `Conducteurs non comptés (circuits pas entièrement raccordés par les gaines) : ${q.sansLongueur.join(', ')}.`) : null,
    h('section', { class: 'qt-params' }, h('h3', null, 'Main-d’œuvre et TVA'),
      h('div', { class: 'qt-param' }, h('label', { for: 'qtTaux' }, 'Taux horaire HT'), tauxIn, h('span', null, '€ / h')),
      h('div', { class: 'qt-param' }, h('label', { for: 'qtTva' }, 'TVA'), tvaIn, h('span', null, '%')),
      h('p', { class: 'note' }, 'Valeurs saisies par vous (aucun taux par défaut). Sans TVA saisie, seul le total hors taxes est affiché. Document estimatif : ce n’est pas un devis contractuel.')));
  ETAT = { root, sum, refs, mode, q, sig: signature(q, mode), nrep: rep.length };
  return root;
}
const signature = (q, mode) => mode + '|' + q.lignes.map((l) => l.cle + ':' + l.qte).join(',');

/* après une saisie : met à jour les totaux en place si le tableau affiché est encore le bon ; renvoie false sinon */
function quantPatch(parent, qConnu) {
  const e = ETAT;
  if (!e || e.mode !== 'global' || (ui.qtTab || 'global') !== 'global' || e.root.parentElement !== parent) return false;
  const q = qConnu || quantitatifDuPlan(), ch = chiffrer(q, P.chiffrage);
  if (signature(q, 'global') !== e.sig || reprises(ch).length !== e.nrep) return false;
  e.q = q;
  e.sum.replaceChildren(...boites(ch));
  for (const l of ch.lignes) {
    const r = e.refs.get(l.cle); if (!r) return false;
    r.tot.replaceChildren(l.total != null ? eur.format(l.total) : h('span', { class: 'badge b-manq' }, 'Non chiffré'));
    if (document.activeElement !== r.pu) r.pu.value = enSaisie(l.pu ? l.pu.v : null);
    if (document.activeElement !== r.tp) r.tp.value = enSaisie(l.temps ? l.temps.v : null);
  }
  for (const [id, d] of [['qtTaux', ch.tauxH], ['qtTva', ch.tva]]) { const i = document.getElementById(id); if (i && document.activeElement !== i) i.value = enSaisie(d ? d.v : null); }
  return true;
}

export { piecesDuPlan, quantPatch, quantView, quantitatifDuPlan, referenceDe };

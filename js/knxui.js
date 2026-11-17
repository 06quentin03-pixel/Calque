/* Calque — module « knxui » : écran de l'installation KNX. Section « KNX » du panneau d'un appareil KNX (ligne, adresse
   physique, consommation, relier au bus) et section « Installation KNX » du panneau du niveau (lignes, contrôles,
   sorties d'actionneurs, adresses de groupe, exports CSV). Les calculs sont dans knx.js (sans écran). */
import { P, S, inPoly, isNum, levelsSorted, uid } from './noyau.js';
import { geo } from './geometrie.js';
import { ELEC_BY } from './symboles.js';
import { commit, requestRender, select } from './interaction.js';
import { btn, btns, chipRow, h, kv, numField, sec, textField, toast } from './interface.js';
import { creerGaineElec, famOn } from './reseaux.js';
import { roomAt, roomName } from './electricite.js';
import { estKNX } from './cheminement.js';
import { ALIM_CHOIX, DPT, PRINCIPAUX, ROLE, adressesPhysiques, ajouterGroupes, alimDe, besoinsSorties, cablesBus, controlesKNX, csvGroupes, csvParticipants,
  lignesKNX, maDe, parsePA, proposerGroupes } from './knx.js';
import { openFileModal } from './export.js';

const ST = { verifiee: 'vérifiée', saisie: 'saisie', estimee: 'estimée' };
const KX = (e) => { if (!e.knx || typeof e.knx !== 'object') e.knx = {}; return e.knx; };
const piecesDe = (lv) => geo(lv).rooms.filter((r) => r.label).map((r) => ({ id: r.label.id, name: r.label.name, contient: (e) => inPoly(e, r.loop) }));

function relierBus(lv, ids) {
  const r = cablesBus(P, lv, ids);
  for (const g of r.cables) { const d = creerGaineElec(g); d.dia = 16; }
  if (r.cables.length) { if (!famOn('gaines')) S.filt.off = S.filt.off.filter((x) => x !== 'gaines'); S.layers.elec = true; commit(); requestRender(); }
  const m = Math.round(r.cables.reduce((s, g) => s + g.len, 0) / 100);
  toast(r.cables.length ? `${r.cables.length} câble${r.cables.length > 1 ? 's' : ''} bus KNX tiré${r.cables.length > 1 ? 's' : ''} (${m} m à l’horizontale)${r.echecs.length ? `, ${r.echecs.length} sans itinéraire` : ''}. « Annuler » les retire.`
    : 'Rien à relier : posez au moins deux appareils KNX sur ce niveau (dont l’alimentation de ligne).');
}

/* panneau d'un appareil KNX */
function knxSection(e) {
  if (!estKNX(e.type)) return null;
  const { lignes } = lignesKNX(P), L = lignes.find((l) => l.appareils.some((x) => x.id === e.id));
  const { adresses } = adressesPhysiques(P), a = adresses.get(e.id), role = ROLE[e.type];
  const parts = [];
  parts.push(kv([['Ligne', L ? `ligne ${L.n} (${L.appareils.length} appareils, ${Math.round(L.cable / 100)} m de bus)` : 'non relié au bus'],
    role !== 'alim' ? ['Adresse physique', a && a.pa ? a.pa.join('.') + (a.auto ? ' (automatique)' : ' (saisie)') : '—'] : null]));
  if (role !== 'alim') parts.push(textField('Adresse physique saisie (zone.ligne.appareil)', e.knx && e.knx.pa, (v) => {
    v = v.trim(); if (!v) { if (e.knx) delete e.knx.pa; commit(); return; }
    const pa = parsePA(v); if (!pa) { toast('Adresse physique : trois nombres séparés par des points, ex. 1.1.12.'); commit(); return; }
    KX(e).pa = pa.join('.'); commit();
  }, { id: 'f-knxpa', ph: 'vide = automatique' }));
  if (role === 'alim') {
    const al = alimDe(e);
    parts.push(numField('Courant disponible (notice)', al.v, 'mA', (v) => { KX(e).alim = { v, st: 'saisie' }; commit(); }, { id: 'f-knxalim', min: 1, max: 5000 }),
      chipRow(ALIM_CHOIX, al.v, (v) => { KX(e).alim = { v, st: 'saisie' }; commit(); }, (v) => v + ' mA'),
      h('p', { class: 'note' }, `Valeur ${ST[al.st]}${al.src ? ' : ' + al.src : ''}.`));
  } else {
    const m = maDe(e);
    parts.push(numField('Consommation sur le bus (notice)', m.v, 'mA', (v) => { KX(e).ma = { v, st: 'saisie' }; commit(); }, { id: 'f-knxma', min: 0, max: 1000 }),
      h('p', { class: 'note' }, `Valeur ${ST[m.st]}${m.src ? ' : ' + m.src : ''}.`));
  }
  const b = btn(L ? 'Relier les autres appareils KNX du niveau' : 'Relier au bus', () => relierBus(e.lv, L ? null : [e.id]), 'pri sm', 'duct'); b.id = 'relierKNX';
  parts.push(btns(b), h('p', { class: 'note' }, 'Le bus KNX (paire torsadée) est dessiné comme une gaine sans circuit, en vert : chaque appareil est relié au plus proche déjà relié. Le câble bus passe dans sa propre gaine, séparé du courant fort ou avec l’isolement prévu par sa notice.'));
  return sec('KNX', ...parts);
}

/* panneau du niveau : installation KNX (si au moins un appareil KNX) */
function knxNiveauSection() {
  const dev = P.elec.filter((e) => estKNX(e.type)); if (!dev.length) return null;
  const { lignes, isoles } = lignesKNX(P), C = controlesKNX(P), B = besoinsSorties(P, (e) => { const r = roomAt(e); return r && r.label ? r.label.id : ''; });
  const G = (P.knx && P.knx.groupes) || [];
  const sorties = [['Commutation (éclairage)', B.commutation, B.suggestion.commutation], ['Variation', B.variation, B.suggestion.variation], ['Volets et stores', B.volets, B.suggestion.volets], ['Chauffage', B.chauffage, B.suggestion.chauffage]]
    .filter(([, n]) => n).map(([nom, n, sg]) => [nom, `${n} sortie${n > 1 ? 's' : ''}${sg[0] ? ` → ${sg[0].n} module${sg[0].n > 1 ? 's' : ''} de ${sg[0].sorties} sorties` : ''}`]);
  const nc = C.filter((c) => c.st === 'non_conforme').length;
  return sec('Installation KNX',
    kv([['Appareils KNX', String(dev.length)], ['Lignes', String(lignes.length) + (isoles.length ? ` (+ ${isoles.length} non relié${isoles.length > 1 ? 's' : ''})` : '')], ['Adresses de groupe', String(G.length)]]),
    h('div', { class: 'ev-list' }, C.map((c) => h('div', { class: 'ev-chk ' + (c.st === 'non_conforme' ? 'err' : 'warn') }, h('span', { class: 'ic' }, c.st === 'non_conforme' ? '✕' : '?'),
      h('span', { class: 'tx' }, (c.st === 'non_conforme' ? 'Non conforme — ' : 'Vérification nécessaire — ') + c.msg)))),
    h('p', { class: 'note' }, (nc ? `${nc} point${nc > 1 ? 's' : ''} non conforme${nc > 1 ? 's' : ''}. ` : '') + 'Source : règles générales du bus KNX TP (64 participants par segment, 1 000 m de câble, 350 m de l’alimentation, 700 m entre participants), à vérifier dans la documentation KNX et les notices. Jamais de conformité globale.'),
    btns(btn(`Relier au bus (${isoles.length})`, () => { const lv = (isoles[0] || dev[0]).lv; relierBus(lv, null); }, 'sm', 'duct')),
    sorties.length ? kv(sorties) : null,
    sorties.length ? h('p', { class: 'note' }, 'Sorties d’actionneurs comptées d’après le plan (une sortie par groupe d’éclairage commandé, par volet, par radiateur) ; modules usuels sans référence de fabricant, à choisir dans un catalogue.') : null,
    numField('Zone KNX', P.knx && isNum(P.knx.zone) ? P.knx.zone : 1, '', (v) => { if (!P.knx) P.knx = { groupes: [] }; P.knx.zone = Math.round(v); commit(); }, { id: 'f-knxzone', min: 0, max: 15 }),
    btns(btn('Proposer les adresses de groupe', () => proposer(false), 'pri sm'), btn('… pour toutes les pièces', () => proposer(true), 'sm'), G.length ? btn('Exporter les adresses de groupe (CSV)', () => exporter('groupes'), 'sm') : null, btn('Exporter les participants (CSV)', () => exporter('participants'), 'sm')),
    G.length ? h('div', { class: 'list knx-ga' }, G.slice(0, 200).map((g) => h('div', { class: 'li', title: DPT[g.dpt] || '' }, h('span', { class: 'v', style: 'font-variant-numeric:tabular-nums;min-width:4.5em' }, g.adr), h('span', null, g.nom), h('span', { class: 'v' }, g.dpt || '')))) : null,
    G.length ? h('p', { class: 'note' }, 'Groupes principaux : ' + Object.entries(PRINCIPAUX).map(([k, v]) => `${k} ${v.toLowerCase()}`).join(', ') + ' ; groupe médian = niveau. Fichier CSV à trois niveaux, à vérifier à l’import dans le logiciel de programmation (ETS).') : null,
    G.length ? btns(btn('Retirer toutes les adresses de groupe', () => { P.knx.groupes = []; commit(); toast('Adresses de groupe retirées. « Annuler » les remet.'); }, 'danger sm')) : null);
}
function proposer(toutes) {
  const n = ajouterGroupes(P, proposerGroupes(P, piecesDe, { toutes }), uid);
  commit(); toast(n ? `${n} adresse${n > 1 ? 's' : ''} de groupe ajoutée${n > 1 ? 's' : ''} (éclairage, volets, chauffage, météo${toutes ? ', toutes les pièces' : ', pièces équipées d’un appareil KNX'}). Les adresses existantes sont gardées.` : 'Toutes les adresses proposées existent déjà.');
}
function exporter(quoi) {
  const L = levelsSorted();
  const txt = quoi === 'groupes' ? csvGroupes(P, (i) => (L[i] ? L[i].name : 'Médian ' + i))
    : csvParticipants(P, (t) => (ELEC_BY.get(t) || {}).n || t, (e) => roomName(roomAt(e)));
  const nom = `${(P.name || 'plan').replace(/[^\w\- ]+/g, '').trim() || 'plan'} - KNX ${quoi === 'groupes' ? 'adresses de groupe' : 'participants'}.csv`;
  const file = new File(['\ufeff' + txt], nom, { type: 'text/csv;charset=utf-8' });
  openFileModal(quoi === 'groupes' ? 'Adresses de groupe KNX' : 'Participants KNX', file, `${nom} · s’ouvre dans Numbers, Excel ou LibreOffice (séparateur point-virgule).`);
}

export { knxNiveauSection, knxSection, relierBus };

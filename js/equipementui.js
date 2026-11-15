/* Calque — module « equipementui » : section « Équipement minimal » de l'inspecteur d'une pièce et du niveau.
   Pose, en une seule étape d'« Annuler », les prises, la sortie 32 A, le point lumineux et sa commande qui manquent
   d'après les règles de contrôle de Calque (calculs dans equipement.js, sans écran). Les symboles posés ne sont reliés
   à aucun circuit : « Relier les appareils sans circuit » (onglet Tableau électrique, affectation.js) les rattache
   sans modifier les circuits existants. */
import { IDX, P, horsHabitation, ui, uid } from './noyau.js';
import { geo, roomOfLabel } from './geometrie.js';
import { commit } from './interaction.js';
import { btn, btns, h, sec, toast } from './interface.js';
import { ELEC_BY } from './symboles.js';
import { aPoser, cablesATirer, equiperPiece } from './equipement.js';
import { nbSansCircuit, relierSansCircuit } from './affectation.js';
import { relierAppareils } from './tableau.js';
import { circById, generateFromPlan, roomAt } from './electricite.js';
import { tableauDu } from './cheminement.js';

const NOTE = 'D’après les règles de contrôle de Calque (nombre de socles par pièce, prises du plan de travail, sortie 32 A, point d’éclairage), pas encore rattachées à un extrait Legrand : proposition à vérifier. Les positions évitent portes, fenêtres, angles, volumes de la salle de bain, évier et plaque.';
const pieceDe = (r) => ({ lv: r.label.lv, nom: r.label.name, poly: r.poly, loop: r.loop, aire: r.area / 10000, ext: horsHabitation(r.label) });
const nomType = (t) => (ELEC_BY.get(t) || {}).n || t;

/* crée les symboles proposés (sans enregistrer l'étape) ; renvoie le nombre de symboles posés */
function poser(lv, prop) {
  const ids = prop.poses.map((p) => { const e = { id: uid('e'), lv, type: p.type, x: p.x, y: p.y, rot: p.rot, h: p.h }; P.elec.push(e); IDX.elec.set(e.id, e); return e.id; });
  for (const [i, j] of prop.liens) P.links.push({ id: uid('k'), lv, a: ids[i], b: ids[j] });
  return ids.length;
}
function message(n, impossibles, pieces) {
  if (!n && !impossibles) return 'Rien à ajouter : l’équipement minimal est déjà présent.';
  return `${n} appareil${n > 1 ? 's posés' : ' posé'}${pieces > 1 ? ` dans ${pieces} pièces` : ''}${impossibles ? ` ; ${impossibles} sans place libre le long des murs` : ''}. Vérifiez les positions, puis « Relier les appareils sans circuit » (ici ou dans le Tableau électrique) : ils rejoignent les circuits sans modifier ceux qui existent.`;
}
function equiperUne(lbl) {
  const r = roomOfLabel(lbl); if (!r) return;
  const prop = equiperPiece(P, pieceDe(r)), n = poser(lbl.lv, prop);
  if (n) commit();
  toast(message(n, prop.impossible.reduce((s, x) => s + x.n, 0), 1));
}
function equiperNiveau(lv) {
  let n = 0, imp = 0, pieces = 0;
  for (const r of geo(lv).rooms) {
    if (!r.label) continue;
    const prop = equiperPiece(P, pieceDe(r)); // recalculé pièce par pièce : les prises posées comptent pour la suivante
    const k = poser(lv, prop); if (k) pieces++;
    n += k; imp += prop.impossible.reduce((s, x) => s + x.n, 0);
  }
  if (n) commit();
  toast(message(n, imp, pieces));
}

/* ---------------- câbles à tirer (demande du 16 novembre 2026) ----------------
   Pour les appareils déjà posés (sèche-serviettes, prise de hotte, radiateur…) : les rattacher à un circuit s'il leur en
   manque un (une étape d'« Annuler »), puis PROPOSER les gaines de leurs circuits sur le plan (boîtes de dérivation au
   plafond et descentes dans les cloisons, ou de proche en proche selon le réglage de l'onglet Cheminements) : rien n'est
   tracé avant « Valider ». */
async function tirerCables(ids) {
  if (!tableauDu(P)) { toast('Posez d’abord le tableau électrique sur le plan : les câbles partent de lui.'); return; }
  const voulus = new Set(ids), sel = ids.map((id) => IDX.elec.get(id)).filter(Boolean);
  let msg = '';
  if (sel.some((e) => !e.cid || !circById(e.cid))) {
    if (!P.circuits.length) { generateFromPlan(); msg = `${P.circuits.length} circuits créés depuis le plan. `; }
    else {
      /* seuls les appareils demandés sont rattachés ; les circuits existants ne changent pas */
      const r = relierSansCircuit(Object.assign({}, P, { elec: P.elec.filter((e) => (e.cid && circById(e.cid)) || voulus.has(e.id)) }), { piece: (e) => { const q = roomAt(e); return q && q.label ? { id: q.label.id, nom: q.label.name } : null; } });
      for (const a of r.affectations) { const e = IDX.elec.get(a.id); if (e) e.cid = a.cid; }
      P.circuits.push(...r.circuits); P.rcds.push(...r.rcds);
      const k = r.circuits.length;
      if (r.affectations.length) msg = `${r.affectations.length} appareil${r.affectations.length > 1 ? 's rattachés' : ' rattaché'} à un circuit${k ? ` (${k} circuit${k > 1 ? 's créés' : ' créé'})` : ''}. `;
    }
    if (msg) commit();
  }
  const cids = [...new Set(sel.map((e) => e.cid).filter((c) => c && circById(c)))];
  if (!cids.length) { toast(msg + 'Aucun circuit ne convient à ces appareils : rattachez-les dans le Tableau électrique.'); return; }
  const { proposerRaccordement } = await import('./cablerui.js');
  const prop = await proposerRaccordement(cids);
  if (msg && prop && prop.gaines.length) toast(msg + 'Les gaines proposées sont sur le plan : « Valider » ou « Refuser ».');
}
const ETAT = { circuit: 'sans circuit', gaine: 'pas encore relié au tableau' };
function cablesBloc(liste) {
  if (!liste.length) return null;
  const parType = new Map();
  for (const x of liste) { const k = x.type + '|' + x.etat; parType.set(k, (parType.get(k) || 0) + 1); }
  const b = btn(`Tirer les câbles (${liste.length})`, () => tirerCables(liste.map((x) => x.id)), 'sm', 'duct'); b.id = 'tirerCables';
  return [h('h4', { class: 'eq-titre' }, 'Câbles à tirer'),
    h('ul', { class: 'eq-liste' }, [...parType].map(([k, n]) => { const [t, etat] = k.split('|'); return h('li', null, h('b', null, `${n} × ${nomType(t)}`), h('small', null, ' — ' + ETAT[etat])); })),
    btns(b),
    h('p', { class: 'note' }, 'Appareils déjà posés qui attendent leur câble. Ils sont rattachés à un circuit s’il leur en manque un, puis les gaines de leurs circuits sont proposées sur le plan (réglage dans Tableau électrique › Cheminements : boîtes de dérivation au plafond et descentes dans les cloisons, ou de proche en proche). Rien n’est tracé avant « Valider ».')];
}

/* section de l'inspecteur d'une pièce */
function equipementSection(lbl) {
  const r = roomOfLabel(lbl); if (!r) return null;
  const prop = equiperPiece(P, pieceDe(r));
  /* appareils posés mais pas encore sur un circuit (quand le tableau existe) : les relier sans toucher aux circuits */
  const sans = P.circuits.length ? nbSansCircuit(P) : 0;
  const relier = sans ? btns(btn(`Relier les appareils sans circuit (${sans})`, relierAppareils, 'sm', 'plus')) : null;
  const cables = cablesBloc(cablesATirer(P, pieceDe(r)));
  if (!prop.manque.length) return sec('Équipement minimal', h('p', { class: 'note' }, 'Présent d’après les règles de contrôle de Calque (à confirmer : règles pas encore rattachées à un extrait Legrand).'), relier, cables);
  const n = prop.poses.length;
  return sec('Équipement minimal',
    h('ul', { class: 'eq-liste' }, prop.manque.map((m) => h('li', null, h('b', null, `${m.n} × ${nomType(m.type)}`), h('small', null, ' — ' + m.pourquoi)))),
    btns(btn(n ? `Poser l’équipement manquant (${n})` : 'Aucune place libre trouvée', () => equiperUne(lbl), n ? 'pri sm' : 'sm')),
    relier,
    h('p', { class: 'note' }, NOTE),
    cables);
}
/* section de l'inspecteur du niveau : toutes les pièces d'un coup */
function equipementNiveauSection(lv) {
  let n = 0, pieces = 0;
  const cache = new Map(), cables = [];
  for (const r of geo(lv).rooms) {
    if (!r.label) continue;
    const k = aPoser(P, pieceDe(r)); if (k) { n += k; pieces++; } // rapide : sans les positions
    cables.push(...cablesATirer(P, pieceDe(r), cache));
  }
  if (!n && !cables.length) return null;
  return sec('Équipement minimal',
    n ? h('p', { class: 'note' }, `${pieces} pièce${pieces > 1 ? 's' : ''} de ce niveau n’${pieces > 1 ? 'ont' : 'a'} pas l’équipement minimal (environ ${n} appareil${n > 1 ? 's' : ''} à poser).`) : null,
    n ? btns(btn('Équiper toutes les pièces du niveau', () => equiperNiveau(lv), 'sm')) : null,
    n ? h('p', { class: 'note' }, NOTE) : null,
    cablesBloc(cables));
}

export { equipementNiveauSection, equipementSection, equiperNiveau, equiperUne, tirerCables };

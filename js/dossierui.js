/* Calque — module « dossierui » : fenêtre « Dossier PDF » (moteur documentaire, écran).
   Le contenu et la mise en page sont dans documents.js (sans écran) ; ce module fournit ce qui demande l'écran
   (dessin des plans, SVG du tableau, contour des pièces, références de la bibliothèque, contrôles du plan),
   gère le cartouche et les indices de révision (P.doc, format v8), puis livre le fichier (partager, enregistrer).
   Module JavaScript natif (aucune compilation). */
import { $, P, S, levelsSorted, saveSettings } from './noyau.js';
import { roomOfLabel } from './geometrie.js';
import { snapshot } from './historique.js';
import { commit } from './interaction.js';
import { btn, btns, h, openModal, sec, segCtl, toast } from './interface.js';
import { addVersion, slug } from './stockage.js';
import { dessinerPlanZone, fileActions } from './export.js';
import { PRINT_COL, panelSVG, uniSVG } from './tableau.js';
import { articleView } from './technique.js';
import { UL } from './mabiblio.js';
import { CHAMPS_DOC, CHAPITRES, dossierPDF, indiceCourant, indiceSuivant, nettoyerDoc } from './documents.js';

const LIB_CHAMP = { client: 'Client / maître d’ouvrage', adresse: 'Adresse du chantier', entreprise: 'Entreprise', auteur: 'Établi par', affaire: 'N° d’affaire' };
const DS = { gen: 0, file: null, busy: false };
/* chapitres proposés (le rapport de contrôle arrive avec le moteur de règles) */
const CHAP_UI = CHAPITRES.filter((c) => c.id !== 'controles');

function reglages() {
  if (!S.dossier || typeof S.dossier !== 'object') S.dossier = {};
  const d = S.dossier;
  if (!Array.isArray(d.chap)) d.chap = CHAP_UI.map((c) => c.id);
  d.chap = d.chap.filter((id) => CHAP_UI.some((c) => c.id === id));
  if (!['A4', 'A3'].includes(d.fmt)) d.fmt = 'A4';
  if (!['A4', 'A3'].includes(d.fmtSch)) d.fmtSch = 'A4';
  return d;
}
function docDuPlan(create) {
  if (!P.doc || typeof P.doc !== 'object') { if (!create) return nettoyerDoc(null); P.doc = nettoyerDoc(null); }
  return P.doc;
}

/* options fournies au moteur documentaire */
function optionsDossier(d) {
  const has = P.circuits.length || P.rcds.length;
  return {
    chapitres: d.chap, formatPlans: d.fmt, formatSchemas: d.fmtSch,
    niveaux: levelsSorted().map((l) => l.id),
    dessinerPlan: (c, zone, L) => dessinerPlanZone(c, zone, L),
    svgUnifilaire: has ? uniSVG(PRINT_COL, null).svg : null,
    svgCoffret: has ? panelSVG(PRINT_COL, null).svg : null,
    pieceDe: (lbl) => { const r = roomOfLabel(lbl); return r ? { poly: r.poly, holes: r.holes || [], area: r.area } : null; },
    referenceDe: (e) => { if (!e.art) return null; const v = articleView(e.art, UL.refs); return v && v.ref ? { ref: v.ref, fab: v.fab, fiab: v.fiab } : null; },
  };
}

function openDossier() {
  DS.file = null;
  openModal('Dossier PDF');
  $('#modal').classList.add('wide');
  renderDossier();
}
function renderDossier() {
  const m = $('#modal'), body = m && m.querySelector('.mbody'); if (!body) return;
  const d = reglages(), doc = docDuPlan(false), cur = indiceCourant(doc);
  const set = (k, v) => { d[k] = v; saveSettings(); DS.file = null; renderDossier(); };
  const tog = (id) => () => set('chap', d.chap.includes(id) ? d.chap.filter((x) => x !== id) : CHAP_UI.map((c) => c.id).filter((x) => x === id || d.chap.includes(x)));
  const champ = (k) => {
    const i = h('input', { class: 'txt', id: 'f-doc-' + k, type: 'text', value: doc[k] || '', 'aria-label': LIB_CHAMP[k], autocomplete: 'off', enterkeyhint: 'done' });
    i.addEventListener('change', () => {
      const D = docDuPlan(true), v = i.value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 200);
      if ((D[k] || '') === v) return;
      if (v) D[k] = v; else delete D[k];
      DS.file = null; commit(); majActions();
    });
    i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); });
    return h('label', { class: 'fld' }, h('span', null, LIB_CHAMP[k]), i);
  };
  const objet = h('input', { class: 'txt', id: 'f-doc-objet', type: 'text', placeholder: 'ex. Première diffusion, modification de la cuisine…', 'aria-label': 'Objet de la révision', autocomplete: 'off', enterkeyhint: 'done' });
  const suivant = indiceSuivant(doc);
  body.replaceChildren(...[
    h('p', { class: 'note' }, 'Un seul fichier PDF avec un cartouche sur chaque page (projet, indice, date, page). Les valeurs estimées par Calque (longueurs, matériel, éclairage) y sont marquées « Estimée » ; les valeurs manquantes sont écrites « Manquante ».'),
    sec('Contenu', h('div', { class: 'chips dos-chips' }, CHAP_UI.map((c) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(d.chap.includes(c.id)), onclick: tog(c.id) }, c.n)))),
    h('div', { class: 'row' },
      sec('Papier des plans', segCtl([{ v: 'A4', n: 'A4' }, { v: 'A3', n: 'A3' }], d.fmt, (v) => set('fmt', v))),
      sec('Papier des schémas', segCtl([{ v: 'A4', n: 'A4' }, { v: 'A3', n: 'A3' }], d.fmtSch, (v) => set('fmtSch', v)))),
    sec('Cartouche', h('div', { class: 'doc-grid' }, CHAMPS_DOC.map(champ))),
    sec('Indice de révision',
      h('p', null, cur ? [h('b', null, `Indice actuel : ${cur.i}`), ` du ${new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(cur.date))}${cur.objet ? ' — ' + cur.objet : ''}`] : h('span', { class: 'note' }, 'Aucun indice : le dossier sera marqué « non diffusé ».')),
      h('label', { class: 'fld' }, h('span', null, `Objet de l’indice ${suivant}`), objet),
      btns(btn(`Enregistrer l’indice ${suivant}`, () => nouvelIndice(suivant, objet.value), 'sm', 'plus')),
      (doc.revisions || []).length > 1 ? h('small', { class: 'note' }, 'Indices précédents : ' + doc.revisions.slice(0, -1).map((r) => r.i).join(', ') + ' (listés sur la page de garde).') : null),
    h('p', { class: 'note', id: 'dosState' }, ''),
    h('div', { class: 'btns exp-btns' }, btn('Préparer le PDF', preparer, 'pri', 'img'), ...fileActions(() => DS.file, false)),
  ]);
  majActions();
}
function majActions() {
  const ready = !!DS.file;
  for (const b of document.querySelectorAll('#modal .exp-act')) b.disabled = !ready;
  const st = $('#dosState'); if (st) st.textContent = DS.busy ? 'Préparation du dossier…' : ready ? `Prêt : ${DS.file.name} (${DS.pages} pages). Touchez « Partager… » ou « Enregistrer ».` : 'Touchez « Préparer le PDF ».';
}
async function nouvelIndice(i, objet) {
  const D = docDuPlan(true);
  D.revisions.push({ i, date: Date.now(), objet: String(objet || '').trim().slice(0, 300), ...(D.auteur ? { par: D.auteur } : {}) });
  commit();
  /* une version de l'historique garde le plan tel qu'il était à cet indice */
  addVersion(P.id, P.name || 'Plan', snapshot(), `Indice ${i} du dossier`).catch(() => { });
  toast(`Indice ${i} enregistré.`);
  DS.file = null; renderDossier();
}
async function preparer() {
  if (DS.busy) return;
  const d = reglages();
  if (!d.chap.length) { toast('Choisissez au moins un chapitre.'); return; }
  const g = ++DS.gen; DS.busy = true; DS.file = null; majActions();
  try {
    await new Promise((r) => setTimeout(r, 30));
    const res = await dossierPDF(P, optionsDossier(d));
    if (g !== DS.gen) return;
    const ind = res.info.indice ? '-ind' + res.info.indice.i : '';
    DS.file = new File([res.blob], `${slug(P.name)}-dossier${ind}.pdf`, { type: 'application/pdf' });
    DS.pages = res.pages;
  } catch (e) { console.error(e); toast('Impossible de préparer le dossier.'); }
  finally { if (g === DS.gen) { DS.busy = false; majActions(); } }
}

export { DS, openDossier, optionsDossier, preparer, renderDossier };

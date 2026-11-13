/* Calque — module « calquesui » : écran des calques et des vues « Plans électriques ».
   - Pastille en haut à droite du plan : vue affichée (Synthèse, Implantation, Câblage, Éclairage…) et accès au
     gestionnaire de circuits.
   - Fenêtre « Calques et vues » : plans électriques prédéfinis, vues enregistrées dans le plan, calques (afficher,
     verrouiller, couleur, opacité, nom).
   Ce qui est affiché est un réglage de l'appareil ; la personnalisation des calques et les vues enregistrées vont dans
   le plan (format v12) et passent par « Annuler ». */
import { $, EXT, P, S, saveSettings, ui, uid } from './noyau.js';
import { CALQUES, CALQUE_BY, VUES, appliquerVue, calqueVerrouille, calqueVisible, couleurCalque, etatVue, nomCalque, persoCalque,
  setCalqueVisible, vueCourante, vueParId, vuesDuPlan } from './calques.js';
import { afterFilter, circsFiltre, openFilterPop } from './reseaux.js';
import { commit, requestRender } from './interaction.js';
import { closePops, h, renderInspector, showPop, toast } from './interface.js';
import { EV, on } from './evenements.js';

/* palette proposée pour les calques (même esprit que les couleurs des circuits) */
const PALETTE = ['#2356C4', '#C2410C', '#15803D', '#7C3AED', '#B91C1C', '#0E7490', '#A16207', '#BE185D', '#374151'];

/* ---------------- pastille de la vue ---------------- */
const barre = h('div', { class: 'pe-bar', id: 'peBar' });
const bVue = h('button', { type: 'button', class: 'pe-vue', id: 'btnVue', title: 'Plans électriques : vues et calques', onclick: () => ouvrirCalques(bVue) });
const bCirc = h('button', { type: 'button', class: 'pe-circ', id: 'btnCircuits', title: 'Gestionnaire de circuits', onclick: () => { import('./circuitsui.js').then((m) => m.ouvrirGestionnaire()); } }, 'Circuits');
barre.append(bVue, bCirc);
{ const st = document.getElementById('stage'); if (st) st.append(barre); }
function majPastille() {
  if (!P) return;
  const v = vueCourante();
  const vv = v ? vueParId(v) : null;
  const masques = CALQUES.filter((c) => !calqueVisible(c.id)).length, verr = CALQUES.filter((c) => calqueVerrouille(c.id)).length;
  bVue.replaceChildren(h('span', { class: 'pe-ic', 'aria-hidden': 'true', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5z"/><path d="M3 12.5l9 5 9-5"/><path d="M3 17l9 5 9-5"/></svg>' }),
    h('span', { class: 'pe-lib' }, vv ? vv.n : masques ? `${masques} calque${masques > 1 ? 's' : ''} masqué${masques > 1 ? 's' : ''}` : 'Tous les calques'),
    ...(verr ? [h('span', { class: 'pe-lock', title: `${verr} calque${verr > 1 ? 's' : ''} verrouillé${verr > 1 ? 's' : ''}` }, '🔒')] : []));
  bVue.setAttribute('aria-label', `Plan affiché : ${vv ? vv.n : 'personnalisé'}. Ouvrir les calques et les vues.`);
  const fc = circsFiltre();
  bCirc.textContent = fc ? `Circuits (${fc.size})` : 'Circuits';
  bCirc.classList.toggle('on', !!fc || ui.sel && (ui.sel.t === 'circuit' || ui.sel.t === 'circuits'));
  barre.hidden = ui.view === 'chantier';
}
on(EV.PLAN_OUVERT, majPastille);
on(EV.PLAN_CHANGE, majPastille);
EXT.view.push(() => majPastille());
EXT.apresFiltre = () => majPastille();

/* ---------------- fenêtre « Calques et vues » ---------------- */
let pop = null;
function lePop() {
  if (!pop) { pop = h('div', { class: 'pop', id: 'calqPop', hidden: true, role: 'dialog', 'aria-label': 'Calques et vues' }); document.body.append(pop); }
  return pop;
}
const ouvert = new Set(); // calques dont le réglage détaillé est déplié
function apres() { afterFilter(); majPastille(); renderCalques(); }
function choisirVue(id) {
  if (!appliquerVue(id)) return;
  saveSettings(); afterFilter(); majPastille(); renderCalques();
  const v = vueParId(id); toast(`Plan affiché : ${v.n}.`);
}
function perso(id) {
  if (!P.calques || typeof P.calques !== 'object') P.calques = {};
  if (!P.calques[id]) P.calques[id] = {};
  return P.calques[id];
}
function majPerso(id, k, v) {
  const o = perso(id);
  if (v == null || v === false || v === '' || (k === 'op' && v >= 1)) delete o[k]; else o[k] = v;
  if (!Object.keys(o).length) delete P.calques[id];
  commit(); majPastille(); renderCalques(); requestRender();
}
function ligneCalque(c) {
  const vis = calqueVisible(c.id), lock = calqueVerrouille(c.id), col = couleurCalque(c.id), o = persoCalque(c.id);
  const det = ouvert.has(c.id);
  const oeil = h('button', { type: 'button', class: 'cq-b', role: 'switch', 'aria-checked': String(vis), 'aria-label': `${vis ? 'Masquer' : 'Afficher'} le calque ${nomCalque(c.id)}`, title: vis ? 'Masquer' : 'Afficher',
    onclick: () => { setCalqueVisible(c.id, !vis); apres(); } }, h('span', { class: 'sw', 'aria-hidden': 'true' }));
  const cad = h('button', { type: 'button', class: 'cq-b cq-lock' + (lock ? ' on' : ''), 'aria-pressed': String(lock), 'aria-label': `${lock ? 'Déverrouiller' : 'Verrouiller'} le calque ${nomCalque(c.id)}`, title: lock ? 'Verrouillé : ses objets ne se sélectionnent pas' : 'Verrouiller',
    onclick: () => { majPerso(c.id, 'lock', !lock); if (!lock && ui.sel) { ui.sel = null; renderInspector(); } toast(!lock ? `Calque « ${nomCalque(c.id)} » verrouillé : ses objets ne se sélectionnent plus.` : `Calque « ${nomCalque(c.id)} » déverrouillé.`); } },
  h('span', { 'aria-hidden': 'true', html: lock ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/></svg>' }));
  const nom = h('button', { type: 'button', class: 'cq-nom', 'aria-expanded': String(det), onclick: () => { if (det) ouvert.delete(c.id); else ouvert.add(c.id); renderCalques(); } },
    h('i', { class: 'cq-pt', style: col ? `background:${col}` : '' }), h('span', null, nomCalque(c.id)), o.op ? h('small', null, Math.round(o.op * 100) + ' %') : null);
  const ligne = h('div', { class: 'cq-li' + (vis ? '' : ' off'), 'data-calque': c.id }, nom, cad, oeil);
  if (!det) return ligne;
  const champNom = h('input', { class: 'txt', type: 'text', value: o.nom || '', placeholder: c.n, 'aria-label': 'Nom du calque', maxlength: 40, enterkeyhint: 'done' });
  champNom.addEventListener('change', () => majPerso(c.id, 'nom', champNom.value.trim().slice(0, 40)));
  const couleurs = c.couleur === false ? null : h('div', { class: 'cq-cols' },
    h('button', { type: 'button', class: 'cq-col auto', 'aria-pressed': String(!col), title: 'Couleur d’origine', onclick: () => majPerso(c.id, 'col', null) }, 'Auto'),
    PALETTE.map((p) => h('button', { type: 'button', class: 'cq-col', style: `background:${p}`, 'aria-pressed': String(col === p), 'aria-label': 'Couleur ' + p, onclick: () => majPerso(c.id, 'col', p) })));
  const opac = h('div', { class: 'seg' }, [1, 0.7, 0.4].map((v) => h('button', { type: 'button', 'aria-pressed': String((o.op || 1) === v), onclick: () => majPerso(c.id, 'op', v) }, Math.round(v * 100) + ' %')));
  return h('div', { class: 'cq-det' }, ligne,
    h('div', { class: 'cq-reg' }, h('p', { class: 'note' }, c.d), champNom, couleurs ? h('label', { class: 'cq-lab' }, 'Couleur', couleurs) : null,
      h('label', { class: 'cq-lab' }, 'Opacité', opac),
      c.couleur !== false && c.elec ? h('p', { class: 'note' }, 'La couleur du calque s’applique aux symboles sans circuit, ou quand les couleurs des circuits sont masquées.') : null));
}
function renderCalques() {
  const p = lePop(); if (p.hidden) return;
  const cur = vueCourante();
  const perso = vuesDuPlan();
  const chips = [...VUES.map((v) => h('button', { type: 'button', class: 'chip pe-chip', 'aria-pressed': String(cur === v.id), title: v.d, onclick: () => choisirVue(v.id) }, v.n)),
    ...perso.map((v) => h('span', { class: 'pe-perso' }, h('button', { type: 'button', class: 'chip pe-chip', 'aria-pressed': String(cur === v.id), onclick: () => choisirVue(v.id) }, v.nom),
      h('button', { type: 'button', class: 'pe-x', 'aria-label': `Supprimer la vue ${v.nom}`, title: 'Supprimer cette vue', onclick: () => { P.vues = P.vues.filter((x) => x.id !== v.id); if (S.vue === v.id) S.vue = null; commit(); toast(`Vue « ${v.nom} » supprimée (Annuler la rétablit).`); renderCalques(); majPastille(); } }, '×')))];
  const vd = cur ? vueParId(cur) : null;
  const fc = circsFiltre();
  p.replaceChildren(h('div', { class: 'menu pe-menu' },
    h('h4', null, 'Plans électriques'),
    h('div', { class: 'chips', style: 'padding:2px 8px 4px' }, chips),
    h('p', { class: 'note', style: 'padding:0 10px 6px' }, vd ? vd.d : 'Affichage personnalisé : enregistrez-le pour le retrouver d’un geste.'),
    saisieVue ? (() => {
      const f = h('input', { class: 'txt', id: 'f-vue-nom', type: 'text', value: `Ma vue ${vuesDuPlan().length + 1}`, maxlength: 40, 'aria-label': 'Nom de la vue', enterkeyhint: 'done' });
      f.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') validerVue(f.value); if (ev.key === 'Escape') { saisieVue = false; renderCalques(); } });
      return h('div', { class: 'btns', style: 'padding:0 8px 6px' }, f, h('button', { type: 'button', class: 'btn sm pri', onclick: () => validerVue(f.value) }, 'Enregistrer'), h('button', { type: 'button', class: 'btn sm', onclick: () => { saisieVue = false; renderCalques(); } }, 'Annuler'));
    })() : null,
    h('div', { class: 'btns', style: 'padding:0 8px 6px' },
      saisieVue ? null : h('button', { type: 'button', class: 'btn sm', onclick: enregistrerVue }, 'Enregistrer cette vue'),
      h('button', { type: 'button', class: 'btn sm', onclick: () => { closePops(); openFilterPop($('#btnFilter')); } }, 'Filtres par famille')),
    h('h4', null, 'Calques'),
    h('div', { class: 'cq-list' }, CALQUES.map(ligneCalque)),
    h('h4', null, 'Circuits affichés'),
    h('div', { class: 'btns', style: 'padding:0 8px 8px' },
      h('span', { class: 'note', style: 'flex:1' }, fc ? `${fc.size} circuit${fc.size > 1 ? 's' : ''} affiché${fc.size > 1 ? 's' : ''}` : 'Tous les circuits'),
      fc ? h('button', { type: 'button', class: 'btn sm', onclick: () => { S.filt.circ = null; S.filt.circs = []; apres(); } }, 'Tout afficher') : null,
      h('button', { type: 'button', class: 'btn sm pri', onclick: () => { closePops(); import('./circuitsui.js').then((m) => m.ouvrirGestionnaire()); } }, 'Choisir…')),
    h('p', { class: 'note', style: 'padding:4px 10px 10px' }, 'Un calque masqué ou verrouillé ne se sélectionne pas. Les exports (image, PDF, DXF, SVG) suivent la vue choisie.')));
}
let saisieVue = false; // champ « nom de la vue » affiché
function enregistrerVue() { saisieVue = true; renderCalques(); const f = document.getElementById('f-vue-nom'); if (f) { f.focus(); f.select(); } }
function validerVue(nom) {
  saisieVue = false;
  const n = (vuesDuPlan().length + 1);
  const e = etatVue();
  const v = Object.assign({ id: uid('vu'), nom: String(nom).trim().slice(0, 40) || `Ma vue ${n}` }, e);
  if (!v.fade || !v.fade.length) delete v.fade;
  if (v.circ !== false) delete v.circ;
  if (!v.circs) delete v.circs;
  if (!Array.isArray(P.vues)) P.vues = [];
  P.vues.push(v); S.vue = v.id; saveSettings();
  commit(); toast(`Vue « ${v.nom} » enregistrée dans le plan.`); renderCalques(); majPastille();
}
function ouvrirCalques(anchor) {
  const p = lePop();
  if (!p.hidden) { closePops(); return; }
  p.hidden = false; renderCalques(); showPop(p, anchor || bVue);
}
/* fermeture au toucher hors de la fenêtre (la pastille rouvre ou ferme elle-même) */
document.addEventListener('pointerdown', (e) => { if (pop && !pop.hidden && !pop.contains(e.target) && !e.target.closest('#peBar')) pop.hidden = true; }, true);
on(EV.PLAN_CHANGE, () => { if (pop && !pop.hidden) renderCalques(); });

export { CALQUE_BY, choisirVue, majPastille, ouvrirCalques, renderCalques };

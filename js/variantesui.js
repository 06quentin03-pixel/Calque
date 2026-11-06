/* Calque — module « variantesui » : fenêtre « Variantes » (écran), phase 7, étape 2.
   Créer, afficher, renommer, dupliquer, supprimer les variantes ; choisir la version principale ; comparer
   (matériel, puissance, éclairage, contrôles du moteur de règles). Les opérations sont dans variantes.js (sans écran).
   Module JavaScript natif (aucune compilation). */
import { $, P, setGEO, setP, touch, ui } from './noyau.js';
import { roomOfLabel } from './geometrie.js';
import { snapshot } from './historique.js';
import { commit } from './interaction.js';
import { btn, btns, closeModal, confirmBtn, h, openModal, sec, segCtl, toast } from './interface.js';
import { addVersion } from './stockage.js';
import { rapportDuPlan } from './reglesui.js';
import { EV, on } from './evenements.js';
import { GAMMES, GAMME_BY, basculer, choisirPrincipale, comparer, dupliquer, initialiser, modifier, nomVariante, supprimer, variantesDe } from './variantes.js';

const fmtN = (v) => (v == null ? '—' : new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v));
const ST = { calcul: 'calcul de Calque', saisie: 'valeurs saisies', estimee: 'estimée' };

/* rapport du moteur de règles pour le plan d'une variante (le plan courant est remis aussitôt) */
function rapportPour(plan) {
  if (plan === P) return rapportDuPlan();
  const orig = P;
  try { setP(plan); touch(); setGEO({}); return rapportDuPlan(); }
  finally { setP(orig); touch(); setGEO({}); }
}
const pieceDe = (lbl) => { const r = roomOfLabel(lbl); return r ? { poly: r.poly, holes: r.holes || [], area: r.area } : null; };
function comparaison() { return comparer(P, { pieceDe, rapport: rapportPour }); }

function openVariantes() {
  openModal('Variantes');
  $('#modal').classList.add('wide');
  renderVariantes();
}
function renderVariantes(cmp) {
  const m = $('#modal'), body = m && m.querySelector('.mbody'); if (!body) return;
  const v = variantesDe(P);
  const kids = [h('p', { class: 'note' }, 'Une variante est une autre version de l’électricité du même bâtiment (économique, standard, haut de gamme…). Murs, pièces, mobilier, photométries et suivi de chantier sont communs ; symboles, circuits, tableau, gaines, études d’éclairage et installation sont propres à chaque variante. Le plan, la 3D, le tableau et le dossier PDF montrent la variante affichée.')];
  if (!v) {
    const nom = h('input', { class: 'txt', id: 'f-var-nom0', type: 'text', value: 'Standard', 'aria-label': 'Nom de la variante actuelle', enterkeyhint: 'done' });
    let gamme = 'std';
    kids.push(sec('Commencer', h('label', { class: 'fld' }, h('span', null, 'Nom de la version actuelle'), nom),
      segCtl(GAMMES.map((g) => ({ v: g.v, n: g.n })), gamme, (x) => { gamme = x; }),
      btns(btn('Créer les variantes', () => { initialiser(P, { nom: nom.value, gamme }); commit(); toast('La version actuelle est la variante principale.'); renderVariantes(); }, 'pri', 'plus'))));
    body.replaceChildren(...kids); return;
  }
  const ligne = (e) => {
    const nom = h('input', { class: 'txt', id: 'f-var-' + e.id, type: 'text', value: e.nom, 'aria-label': 'Nom de la variante', enterkeyhint: 'done' });
    nom.addEventListener('change', () => { if (modifier(P, e.id, { nom: nom.value })) { commit(); renderVariantes(); } });
    nom.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') nom.blur(); });
    const gam = h('select', { class: 'txt', 'aria-label': 'Gamme' }, GAMMES.map((g) => h('option', { value: g.v, selected: g.v === e.gamme }, g.n)));
    gam.addEventListener('change', () => { if (modifier(P, e.id, { gamme: gam.value })) { commit(); renderVariantes(); } });
    return h('div', { class: 'var-li', 'data-variante': e.id, 'aria-current': String(e.id === v.active) },
      h('div', { class: 'var-tags' }, e.id === v.principale ? h('span', { class: 'var-tag pri' }, '★ Principale') : null, e.id === v.active ? h('span', { class: 'var-tag' }, 'Affichée') : null,
        e.vide ? h('span', { class: 'var-tag bad' }, 'Sans données') : null),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, h('span', null, 'Nom'), nom), h('label', { class: 'fld' }, h('span', null, 'Gamme'), gam)),
      btns(
        e.id !== v.active && !e.vide ? btn('Afficher', () => afficher(e.id), 'pri sm') : null,
        e.id !== v.principale ? btn('Choisir comme principale', () => { choisirPrincipale(P, e.id); commit(); toast(`« ${e.nom} » est la version principale.`); renderVariantes(); }, 'sm') : null,
        btn('Dupliquer', () => { const n = dupliquer(P, { source: e.id, nom: e.nom + ' (copie)' }); if (n) { commit(); toast('Variante dupliquée.'); renderVariantes(); } }, 'sm', 'dup'),
        e.id !== v.active && e.id !== v.principale ? confirmBtn('Supprimer', 'Confirmer ?', () => supprimerVariante(e)) : null));
  };
  const nomN = h('input', { class: 'txt', id: 'f-var-nouv', type: 'text', placeholder: 'ex. Économique', 'aria-label': 'Nom de la nouvelle variante', enterkeyhint: 'done' });
  let gN = 'eco';
  kids.push(sec(`Variantes (${v.liste.length})`, ...v.liste.map(ligne)),
    sec('Nouvelle variante (copie de la variante affichée)', h('label', { class: 'fld' }, h('span', null, 'Nom'), nomN),
      segCtl(GAMMES.map((g) => ({ v: g.v, n: g.n })), gN, (x) => { gN = x; }),
      btns(btn('Créer la variante', () => {
        const e = dupliquer(P, { nom: nomN.value || (GAMME_BY.get(gN) || {}).n, gamme: gN }); if (!e) return;
        commit(); toast(`Variante « ${e.nom} » créée. Touchez « Afficher » pour la modifier.`); renderVariantes();
      }, 'sm', 'plus'))),
    h('p', { class: 'note' }, 'Une variante n’est jamais perdue : la variante affichée et la principale ne peuvent pas être supprimées, et une copie du plan est gardée dans l’historique des versions avant toute suppression.'));
  if (v.liste.length > 1) {
    const box = h('div', { id: 'varCmp' }, cmp ? tableComparaison(cmp) : h('p', { class: 'note' }, 'Comparaison en cours…'));
    kids.push(sec('Comparaison', box));
    if (!cmp) setTimeout(() => { if (!box.isConnected) return; try { box.replaceChildren(tableComparaison(comparaison())); } catch (err) { console.error(err); box.replaceChildren(h('p', { class: 'note' }, 'Comparaison impossible.')); } }, 30);
  }
  body.replaceChildren(...kids);
}
function tableComparaison(c) {
  const groupes = [...new Set(c.lignes.map((l) => l.groupe))];
  return h('div', null,
    h('div', { class: 'ev-table var-cmp' }, h('table', null,
      h('thead', null, h('tr', null, h('th', null, ''), c.cols.map((k) => h('th', { class: 'n' }, k.nom, k.principale ? ' ★' : '', k.active ? h('small', { style: 'display:block' }, 'affichée') : null)))),
      h('tbody', null, groupes.map((g) => [h('tr', { class: 'grp' }, h('td', { colspan: String(c.cols.length + 1) }, g)),
        c.lignes.filter((l) => l.groupe === g).map((l) => {
          const diff = l.vals.some((x) => x !== l.vals[0]);
          return h('tr', { class: diff ? 'diff' : '' }, h('td', null, l.nom, l.st ? h('small', { class: 'note', style: 'display:block' }, ST[l.st] || l.st) : null), l.vals.map((x) => h('td', { class: 'n' }, fmtN(x))));
        })])))),
    h('p', { class: 'note' }, 'Quantités de matériel et éclairements : estimations de Calque (à vérifier). Contrôles : nombre de contrôles du moteur de règles par statut ; aucune variante n’est déclarée conforme globalement tant que tout n’est pas vérifié. Les lignes qui diffèrent sont surlignées.'));
}
function afficher(id) {
  const v = variantesDe(P); const e = v && v.liste.find((x) => x.id === id);
  if (!e || !basculer(P, id)) { toast('Cette variante ne peut pas être affichée.'); return; }
  touch(); ui.sel = null; commit();
  toast(`Variante « ${e.nom} » affichée.`); renderVariantes(); majPuce();
}
async function supprimerVariante(e) {
  const ok = await addVersion(P.id, P.name || 'Plan', snapshot(), `Avant suppression de la variante « ${e.nom} »`);
  if (!ok && !ui.isExample) { toast('Copie de sécurité impossible : la variante n’est pas supprimée.'); return; }
  if (!supprimer(P, e.id)) return;
  commit(); toast(`Variante « ${e.nom} » supprimée (une copie est gardée dans l’historique des versions).`); renderVariantes();
}

/* puce « Variante » dans la barre du haut */
const puce = h('button', { type: 'button', class: 'var-puce', id: 'btnVar', hidden: true, title: 'Variantes du projet', onclick: openVariantes });
{ const st = document.getElementById('stage'); if (st) st.append(puce); } // en haut à gauche du plan
function majPuce() {
  const v = P && variantesDe(P);
  puce.hidden = !v;
  if (!v) return;
  const e = v.liste.find((x) => x.id === v.active);
  puce.textContent = (e.id === v.principale ? '★ ' : '') + nomVariante(e);
  puce.setAttribute('aria-label', `Variante affichée : ${e.nom}${e.id === v.principale ? ' (principale)' : ''}. Ouvrir les variantes.`);
}
on(EV.PLAN_OUVERT, majPuce);
on(EV.PLAN_CHANGE, majPuce);

export { afficher, comparaison, majPuce, openVariantes, rapportPour, renderVariantes, supprimerVariante };

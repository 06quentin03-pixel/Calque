/* Calque — module « reglesui » : onglet « Contrôle NF C 15-100 » du tableau électrique (écran).
   Les règles et leur évaluation sont dans regles.js (sans écran). Ce module fournit les contrôles qui demandent
   la géométrie du plan (nfcChecks, electricite.js) et affiche le rapport : trois statuts, source et édition de
   chaque règle, données utilisées et manquantes. Module JavaScript natif (aucune compilation). */
import { P, ui } from './noyau.js';
import { circNumbers, nfcChecks } from './electricite.js';
import { btn, h } from './interface.js';
import { pillStatut } from './fiche.js';
import { CATALOGUE, REFERENTIELS, REGLES_VERSION, evaluerPlan } from './regles.js';

/* rapport du plan courant */
function rapportDuPlan() { return evaluerPlan(P, { calque: nfcChecks(), reperes: circNumbers() }); }

const FILTRES = [{ v: 'tous', n: 'Tous' }, { v: 'non_conforme', n: 'Non conformes' }, { v: 'verification', n: 'À vérifier' }, { v: 'conforme', n: 'Conformes' }];
const CONSTAT = { respecte: '', a_revoir: 'à revoir', conseil: 'recommandation', indetermine: '', non_respecte: '' };
if (!ui.rgFiltre) ui.rgFiltre = 'tous';

/* vue du rapport ; goTo(ref) ouvre l'objet sur le plan */
function rapportView(rap, goTo, rerender) {
  const s = rap.synthese;
  const box = (cls, n, lab, sub) => h('div', { class: 'ev-sumbox ' + cls }, h('b', null, String(n)), h('span', null, lab), sub ? h('small', { class: 'note' }, sub) : null);
  const liste = rap.resultats.filter((r) => ui.rgFiltre === 'tous' || r.statut === ui.rgFiltre);
  const groupes = [...new Set(liste.map((r) => r.groupe))];
  const ligne = (r) => {
    const cls = r.statut === 'non_conforme' ? 'err' : r.statut === 'conforme' ? 'ok' : r.constat === 'conseil' ? 'info' : 'warn';
    const det = h('details', { class: 'rg-det' }, h('summary', null, 'Règle, source et données'),
      h('dl', { class: 'rg-dl' },
        h('dt', null, 'Règle'), h('dd', null, `${r.nom} — ${r.id}, version ${r.v}`),
        h('dt', null, 'Origine'), h('dd', null, r.referentiel),
        h('dt', null, 'Source'), h('dd', null, r.source),
        h('dt', null, 'Édition'), h('dd', null, r.edition),
        h('dt', null, 'Données utilisées'), h('dd', null, r.utilisees.length ? r.utilisees.join(' ; ') : '—'),
        h('dt', null, 'Données manquantes'), h('dd', { class: r.manquantes.length ? 'rg-manq' : '' }, r.manquantes.length ? r.manquantes.join(' ; ') : 'aucune')));
    return h('div', { class: 'ev-chk rg-chk ' + cls, 'data-regle': r.id, 'data-statut': r.statut },
      h('span', { class: 'tx' }, h('span', { class: 'rg-st' }, pillStatut(r.statut)), h('span', null, r.objet ? h('b', null, r.objet + ' · ') : null, r.detail),
        CONSTAT[r.constat] ? h('small', null, CONSTAT[r.constat]) : null, det),
      r.ref && goTo ? btn('Voir', () => goTo(r.ref), 'sm') : h('span'));
  };
  return h('div', { class: 'ev-checks rg' },
    h('div', { class: 'ev-sum' },
      box('err', s.non_conforme, 'non conforme' + (s.non_conforme > 1 ? 's' : '')),
      box('warn', s.verification, 'vérification nécessaire', s.respectesNonVerifies ? `dont ${s.respectesNonVerifies} respecté${s.respectesNonVerifies > 1 ? 's' : ''} d’après Calque, à confirmer` : null),
      box('okb', s.conforme, 'conforme' + (s.conforme > 1 ? 's' : ''), 'règles à source vérifiée')),
    h('p', { class: 'rg-avis ' + rap.global }, h('b', null, rap.global === 'conforme' ? 'Conforme. ' : rap.global === 'non_conforme' ? 'Non conforme. ' : 'Vérification nécessaire. '), rap.avis),
    h('p', { class: 'note' }, `Moteur de règles : ${rap.version}. Chaque contrôle indique sa règle, sa source et l’édition de la norme. Tableaux NF C 15-100 utilisés : extraits Legrand fournis uniquement.`),
    h('div', { class: 'seg rg-filtre', role: 'group' }, FILTRES.map((f) => h('button', { type: 'button', 'aria-pressed': String(ui.rgFiltre === f.v), onclick: () => { ui.rgFiltre = f.v; if (rerender) rerender(); } },
      f.n + (f.v === 'tous' ? '' : ` (${s[f.v]})`)))),
    groupes.map((g) => h('section', null, h('h3', null, g), h('div', { class: 'ev-list' }, liste.filter((r) => r.groupe === g).map(ligne)))),
    !liste.length ? h('p', { class: 'note' }, 'Aucun contrôle dans ce filtre.') : null,
    rap.tablesManquantes.length ? h('section', null, h('h3', null, 'Tableaux de la norme non fournis'),
      h('p', { class: 'note' }, 'Les contrôles qui en dépendent restent « vérification nécessaire » (extraits Legrand reportés en phase 8) : ' + rap.tablesManquantes.join(' ; ') + '.')) : null,
    catalogueView());
}
/* catalogue versionné des règles */
function catalogueView() {
  return h('details', { class: 'rg-cat' }, h('summary', null, `Catalogue des règles (${CATALOGUE.length}) — ${REGLES_VERSION}`),
    h('div', { class: 'ev-table' }, h('table', null,
      h('thead', null, h('tr', null, ['Règle', 'Version', 'Origine', 'Source', 'Édition'].map((t) => h('th', null, t)))),
      h('tbody', null, CATALOGUE.map((r) => h('tr', null, h('td', null, r.nom, h('small', { class: 'note', style: 'display:block' }, r.id)), h('td', { class: 'n' }, 'v' + r.v),
        h('td', null, REFERENTIELS[r.ref].n), h('td', null, h('small', null, r.source)), h('td', null, h('small', null, r.edition))))))));
}
/* pastille de l'onglet : nombre de non-conformités, sinon nombre de vérifications (jamais de coche sans conformité globale) */
function pastille(rap) {
  const s = rap.synthese;
  if (s.non_conforme) return { t: String(s.non_conforme), cls: 'err', err: true };
  if (rap.global === 'conforme') return { t: '✓', cls: '', err: false };
  return { t: String(s.verification), cls: 'ver', err: false };
}

export { catalogueView, pastille, rapportDuPlan, rapportView };

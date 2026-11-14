/* Calque — module « calculsui » : onglet « Calculs ». Explique chaque calcul de Calque (à quoi il sert, la formule,
   le sens des lettres, d'où viennent les données) et permet de l'essayer avec ses propres valeurs.
   Catalogue et calculs dans formules.js (sans écran) : les résultats viennent des moteurs de Calque eux-mêmes. */
import { $, EXT } from './noyau.js';
import { h } from './interface.js';
import { FAMILLES, FORMULES, STATUT_NOTE, calculer, valeursExemple } from './formules.js';

const CU = { fam: null, q: '', vals: new Map() }; // famille affichée (null : toutes), recherche, valeurs saisies par fiche
const num = (s) => { const v = parseFloat(String(s).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(v) ? v : NaN; };
const aff = (v) => String(v).replace('.', ',');
const sansAccent = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function resultat(F, box) {
  const r = calculer(F, CU.vals.get(F.id));
  if (r.erreur) { box.replaceChildren(h('p', { class: 'note', style: 'color:var(--bad)' }, r.erreur)); return; }
  box.replaceChildren(
    r.etapes && r.etapes.length ? h('div', { class: 'cf-etapes' }, r.etapes.map((t) => h('div', null, t))) : null,
    r.res && r.res.length ? h('div', { class: 'cf-res' }, r.res.map(([k, v]) => h('div', null, h('span', null, k), h('b', null, v)))) : null);
}
function entree(F, e, maj) {
  const cur = () => { const v = CU.vals.get(F.id); return v && e.k in v ? v[e.k] : e.v; };
  const set = (v) => { const o = Object.assign({}, CU.vals.get(F.id) || {}); o[e.k] = v; CU.vals.set(F.id, o); maj(); };
  if (e.choix && typeof e.choix[0] === 'object') {
    const box = h('div', { class: 'seg', role: 'group', 'aria-label': e.n });
    const peindre = () => { for (const b of box.children) b.setAttribute('aria-pressed', String(Number(b.dataset.v) === cur())); };
    for (const c of e.choix) box.append(h('button', { type: 'button', 'data-v': String(c.v), onclick: () => { set(c.v); peindre(); } }, c.n));
    peindre();
    return h('div', { class: 'fld' }, h('span', null, e.n), box);
  }
  const inp = h('input', { class: 'num', type: 'text', inputmode: 'decimal', value: aff(cur()), 'aria-label': e.n, id: `cf-${F.id}-${e.k}`, autocomplete: 'off', enterkeyhint: 'done' });
  inp.addEventListener('input', () => set(num(inp.value)));
  inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); inp.blur(); } });
  const champ = h('label', { class: 'fld' }, h('span', null, e.n), h('div', { class: 'inp' }, inp, e.u ? h('em', null, e.u) : null));
  if (!e.choix) return champ;
  return h('div', null, champ, h('div', { class: 'chips' }, e.choix.map((c) => h('button', { type: 'button', class: 'chip', onclick: () => { inp.value = aff(c); set(c); } }, aff(c) + (e.u ? ' ' + e.u : '')))));
}
function fiche(F) {
  const fam = FAMILLES.find((x) => x.id === F.fam);
  const box = h('div', { class: 'cf-out', 'aria-live': 'polite' });
  const maj = () => resultat(F, box);
  maj();
  const extra = F.extra ? F.extra() : null;
  return h('article', { class: 'cf', id: 'cf-' + F.id },
    h('h3', null, F.titre),
    h('p', { class: 'cf-but' }, F.but),
    h('div', { class: 'cf-formule' }, F.formule),
    h('details', { class: 'cf-lettres', open: true }, h('summary', null, 'Ce que veut dire chaque lettre'),
      h('dl', null, F.vars.map(([s, sens, u]) => [h('dt', null, s), h('dd', null, sens + (u ? ` — ${u}` : ''))]))),
    F.e.length ? h('div', { class: 'cf-essai' }, h('h4', null, 'Essayer avec vos valeurs'), h('div', { class: 'cf-champs' }, F.e.map((e) => entree(F, e, maj))),
      h('button', { type: 'button', class: 'btn sm', onclick: () => { CU.vals.delete(F.id); rendre(); } }, 'Revenir à l’exemple')) : h('h4', null, 'Extrait du tableau utilisé'),
    box,
    extra ? h('p', { class: 'note' }, extra) : null,
    h('p', { class: 'note' }, h('b', null, 'Données : '), F.donnees),
    h('p', { class: 'note' }, h('b', null, 'Où dans Calque : '), fam ? fam.ou : ''));
}
function rendre() {
  const root = $('#calculsView'); if (!root) return;
  const q = sansAccent(CU.q.trim());
  const liste = FORMULES.filter((F) => (!CU.fam || F.fam === CU.fam) && (!q || sansAccent([F.titre, F.but, F.formule, ...F.vars.flat()].join(' ')).includes(q)));
  const rech = h('input', { class: 'txt', type: 'search', placeholder: 'Rechercher un calcul (chute de tension, lux, U…)', value: CU.q, 'aria-label': 'Rechercher un calcul', id: 'cf-q' });
  rech.addEventListener('input', () => { CU.q = rech.value; rendre(); const r = $('#cf-q'); if (r) { r.focus(); r.setSelectionRange(r.value.length, r.value.length); } });
  const scroll = root.querySelector('.cf-page') ? root.querySelector('.cf-page').scrollTop : 0;
  root.replaceChildren(h('div', { class: 'cf-page' },
    h('div', { class: 'cf-tete' },
      h('h2', null, 'Les calculs de Calque'),
      h('p', null, `Voici les ${FORMULES.length} calculs que fait l’application, expliqués simplement. Les exemples sont calculés par les moteurs de Calque eux-mêmes : changez une valeur pour voir le résultat changer. Ces exemples n’utilisent pas votre plan.`),
      h('p', { class: 'note' }, STATUT_NOTE),
      rech,
      h('div', { class: 'chips' }, h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!CU.fam), onclick: () => { CU.fam = null; rendre(); } }, 'Tous'),
        FAMILLES.map((x) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(CU.fam === x.id), onclick: () => { CU.fam = x.id; rendre(); } }, x.n)))),
    FAMILLES.filter((x) => liste.some((F) => F.fam === x.id)).map((x) => h('section', { class: 'cf-fam' }, h('h2', null, x.n), h('div', { class: 'cf-grille' }, liste.filter((F) => F.fam === x.id).map(fiche)))),
    liste.length ? null : h('p', { class: 'note' }, 'Aucun calcul ne correspond à cette recherche.')));
  const pg = root.querySelector('.cf-page'); if (pg) pg.scrollTop = scroll;
}
EXT.view.push((v) => { const el = $('#calculsView'); if (!el) return; el.hidden = v !== 'calculs'; if (v === 'calculs') rendre(); });

export { rendre as rendreCalculs };

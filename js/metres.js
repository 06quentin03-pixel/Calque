/* Calque — module « métrés » : onglet « Cheminements » du Tableau électrique.
   Longueurs de chaque circuit (à vol d'oiseau, le long des gaines, à commander avec la réserve).
   Les calculs sont dans cheminement.js (sans écran). Module JavaScript natif (aucune compilation). */
import { P } from './noyau.js';
import { aCommander, cheminCircuit, reserveDe } from './cheminement.js';
import { LIB_STATUT, fmt } from './calcul.js';
import { circNumbers, circuitColor } from './electricite.js';
import { btn, h } from './interface.js';
import { badgeDonnee, champDonnee, openFiche } from './fiche.js';

const m = (cm, d = 1) => (cm == null ? '—' : fmt(cm / 100, d) + ' m');

/* longueurs de tous les circuits */
function lignesCircuits(plan) {
  const res = reserveDe(plan);
  return (plan.circuits || []).map((c) => {
    const ch = cheminCircuit(plan, c.id);
    const L = c.calc && c.calc.len;
    return { c, ch, cmd: ch.arbre != null ? aCommander(ch.arbre, res) : null, Lfiche: L || (ch.complet && ch.Lmax > 0 ? { v: Math.round(ch.Lmax) / 100, st: 'estimee' } : null) };
  });
}

function longueursSection(lignes) {
  const nums = circNumbers();
  const res = reserveDe(P);
  const resBox = (create) => (create ? (P.install || (P.install = {})) : P.install || null);
  const raccordes = lignes.filter((l) => l.ch.complet).length;
  const totalCmd = lignes.filter((l) => l.ch.complet).reduce((s, l) => s + (l.cmd || 0), 0);
  const partiels = lignes.filter((l) => !l.ch.complet && l.ch.atteints).length;
  const box = (n, v, sub) => h('div', { class: 'ev-sumbox bi-box' }, h('b', null, v), h('span', null, n), sub ? h('small', null, sub) : null);
  return [
    h('div', { class: 'ev-sum bi-sum' },
      box('Circuits raccordés par les gaines', `${raccordes} / ${lignes.length}`, raccordes < lignes.length ? 'les autres : longueur à saisir ou gaines à tracer' : null),
      box('Câble à commander', totalCmd ? fmt(totalCmd, 0) + ' m' : '—', `circuits raccordés seulement · réserve ${fmt(res.v, 0)} % (${LIB_STATUT[res.st].toLowerCase()})${partiels ? ` · ${partiels} circuit${partiels > 1 ? 's' : ''} incomplet${partiels > 1 ? 's' : ''} non compté${partiels > 1 ? 's' : ''}` : ''}`)),
    h('p', { class: 'note' }, 'Longueurs mesurées sur le plan depuis le tableau principal, le long des gaines (verticales jusqu’aux appareils et passages entre étages compris). Vol d’oiseau : distance en ligne droite jusqu’au point le plus éloigné, pour comparaison. Câble : longueur pour desservir tous les points du circuit. À commander : câble + réserve, arrondi au mètre supérieur. Ces longueurs sont des estimations.'),
    h('section', null, h('h3', null, 'Réserve de câble'),
      champDonnee(resBox, 'reserve', 'Réserve ajoutée à la longueur de câble', '%', { min: 0, max: 100, note: P.install && P.install.reserve ? null : `Sans saisie : ${fmt(res.v, 0)} %, estimée (${res.src}).` })),
    h('section', null, h('h3', null, 'Longueurs par circuit'), h('div', { class: 'ev-table bi-table' }, h('table', null,
      h('thead', null, h('tr', null, ['Repère', 'Désignation', 'Points raccordés', 'Vol d’oiseau', 'Point le plus éloigné', 'Câble', 'À commander', 'L de la fiche', ''].map((t) => h('th', null, t)))),
      h('tbody', null, lignes.map((l) => h('tr', { 'data-cid': l.c.id },
        h('td', null, h('span', { class: 'ev-num', style: `--cc:${circuitColor(l.c.id) || 'var(--elec)'}` }, nums.get(l.c.id))),
        h('td', null, l.c.name, l.ch.raison ? h('small', { class: 'note', style: 'display:block' }, l.ch.raison) : null,
          l.ch.inconnues ? h('small', { class: 'note', style: 'display:block;color:var(--bad)' }, `${l.ch.inconnues} verticale${l.ch.inconnues > 1 ? 's' : ''} non comptée${l.ch.inconnues > 1 ? 's' : ''} (pose de gaine non précisée)`) : null),
        h('td', { class: 'n' }, l.ch.points.length ? `${l.ch.atteints} / ${l.ch.points.length}` : '—'),
        h('td', { class: 'n' }, m(l.ch.Lgeo)),
        h('td', { class: 'n' }, l.ch.complet ? m(l.ch.Lmax) : '—'),
        h('td', { class: 'n' }, m(l.ch.arbre)),
        h('td', { class: 'n' }, l.cmd != null ? fmt(l.cmd, 0) + ' m' : '—'),
        h('td', { class: 'n' }, l.Lfiche ? [fmt(l.Lfiche.v, 1) + ' m ', badgeDonnee(l.Lfiche.st)] : badgeDonnee(null)),
        h('td', null, btn('Fiche', () => openFiche(l.c.id), 'sm')))))))),
  ];
}

function metresView() {
  const parts = [];
  if (!P.circuits.length) parts.push(h('p', { class: 'note' }, 'Générez d’abord le tableau (onglet Schéma unifilaire) : les longueurs sont calculées par circuit.'));
  else parts.push(...longueursSection(lignesCircuits(P)));
  return h('div', { class: 'ev-checks bilan metres' }, ...parts);
}

export { lignesCircuits, metresView };

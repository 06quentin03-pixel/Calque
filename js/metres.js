/* Calque — module « métrés » : onglet « Cheminements » du Tableau électrique.
   Longueurs de chaque circuit (à vol d'oiseau, le long des gaines, à commander avec la réserve).
   Les calculs sont dans cheminement.js (sans écran). Module JavaScript natif (aucune compilation). */
import { P } from './noyau.js';
import { reserveDe } from './cheminement.js';
import { LIB_STATUT, fmt } from './calcul.js';
import { circNumbers, circuitColor } from './electricite.js';
import { btn, h } from './interface.js';
import { conflitsPlan } from './itineraire.js';
import { goToRef } from './tableau.js';
import { badgeDonnee, champDonnee, openFiche, pillStatut } from './fiche.js';
import { lignesCircuits, listeMateriel, remplissageGaines } from './materiel.js';
import { messageAuto, raccorderAuto } from './routeui.js';
import { toast } from './interface.js';
import { tableauDu } from './cheminement.js';

const m = (cm, d = 1) => (cm == null ? '—' : fmt(cm / 100, d) + ' m');

function longueursSection(lignes) {
  const nums = circNumbers();
  const res = reserveDe(P);
  const resBox = (create) => (create ? (P.install || (P.install = {})) : P.install || null);
  const raccordes = lignes.filter((l) => l.ch.complet).length;
  const totalCmd = lignes.filter((l) => l.ch.complet).reduce((s, l) => s + (l.cmd || 0), 0);
  const partiels = lignes.filter((l) => !l.ch.complet && l.ch.atteints).length;
  const box = (n, v, sub) => h('div', { class: 'ev-sumbox bi-box' }, h('b', null, v), h('span', null, n), sub ? h('small', null, sub) : null);
  /* raccordement automatique des circuits incomplets (gaines proposées, à vérifier) */
  const aFaire = lignes.filter((l) => !l.ch.complet && l.ch.points.length).map((l) => l.c.id);
  const lancer = async (cids, bouton) => {
    const txt = bouton.textContent; bouton.disabled = true;
    /* propositions affichées sur le plan : rien n'est créé avant « Valider » */
    const { proposerRaccordement } = await import('./cablerui.js');
    await proposerRaccordement(cids, (i, n) => { bouton.textContent = `Recherche… ${i + 1} / ${n}`; });
    bouton.textContent = txt; bouton.disabled = false;
  };
  const auto = aFaire.length && tableauDu(P) ? h('section', null, h('h3', null, 'Raccordement automatique'),
    h('p', { class: 'note' }, `${aFaire.length} circuit${aFaire.length > 1 ? 's ne sont' : ' n’est'} pas entièrement raccordé${aFaire.length > 1 ? 's' : ''} au tableau. Calque peut proposer les gaines manquantes : chaque point est relié au point déjà raccordé le plus proche, en évitant les zones interdites, avec le type et la pose de gaine choisis en dernier. Les gaines proposées s’affichent sur le plan : rien n’est créé avant « Valider » ; « Annuler » les retire ensuite toutes.`),
    h('div', { class: 'btns' }, (() => { const b = btn(`Raccorder les ${aFaire.length} circuits incomplets`, () => lancer(aFaire, b), 'pri'); b.id = 'autoTous'; return b; })())) : null;
  return [
    auto,
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
        h('td', null, h('div', { class: 'btns' }, !l.ch.complet && l.ch.points.length && tableauDu(P) ? (() => { const b = btn('Raccorder', () => lancer([l.c.id], b), 'sm'); return b; })() : null, btn('Fiche', () => openFiche(l.c.id), 'sm'))))))))),
  ];
}

/* conflits de toutes les gaines électriques du plan */
function conflitsSectionPlan() {
  const cs = conflitsPlan(P), lv = new Map(P.levels.map((l) => [l.id, l.name]));
  const warn = cs.filter((c) => c.sev === 'warn'), info = cs.filter((c) => c.sev !== 'warn');
  const perc = info.filter((c) => c.kind === 'mur' || c.kind === 'cloison').length;
  const item = (c) => h('div', { class: 'ev-chk ' + (c.sev === 'warn' ? 'warn' : 'info') }, h('span', { class: 'ic' }, c.sev === 'warn' ? '!' : 'i'),
    h('span', { class: 'tx' }, c.msg, h('small', null, lv.get(c.lv) || '')), btn('Voir', () => goToRef({ t: 'duct', id: c.duct }), 'sm'));
  return h('section', null, h('h3', null, 'Conflits des cheminements'),
    h('p', { class: 'note' }, cs.length ? `${warn.length} point${warn.length > 1 ? 's' : ''} à revoir, ${perc} traversée${perc > 1 ? 's' : ''} de mur ou de cloison (percements à prévoir). Points d’attention de Calque, pas des règles de la norme.` : 'Aucun conflit détecté avec les portes, fenêtres, zones interdites et conduits de VMC.'),
    cs.length ? h('div', { class: 'ev-list' }, [...warn, ...info.filter((c) => c.kind !== 'mur' && c.kind !== 'cloison')].map(item)) : null);
}

/* taux de remplissage : toujours « vérification nécessaire » (règle non couverte par l'extrait Legrand fourni) */
function remplissageSection() {
  const rs = remplissageGaines(P), nums = circNumbers(), lv = new Map(P.levels.map((l) => [l.id, l.name]));
  const R = rs[0] && rs[0].controle;
  return h('section', null, h('h3', null, 'Remplissage des cheminements'),
    h('p', { class: 'note' }, 'Un câble par circuit est compté dans chaque cheminement emprunté. L’occupation est calculée seulement si le diamètre extérieur de chaque câble (fiche de calcul du circuit) et les dimensions du cheminement sont indiqués. Le taux maximal admis n’est pas couvert par l’extrait Legrand fourni : statut « vérification nécessaire ».'),
    h('div', { class: 'ev-table bi-table' }, h('table', null,
      h('thead', null, h('tr', null, ['Cheminement', 'Niveau', 'Circuits', 'Occupation', 'Statut', ''].map((t) => h('th', null, t)))),
      h('tbody', null, rs.map((r) => h('tr', { 'data-duct': r.id },
        h('td', null, r.nom + (r.taille ? ' · ' + r.taille : ''), r.taux == null && r.n ? h('small', { class: 'note', style: 'display:block' }, 'Manque : ' + r.manquantes.join(' ; ')) : null),
        h('td', null, lv.get(r.lv) || ''),
        h('td', null, r.n ? r.circuits.map((id) => nums.get(id)).join(', ') : '—'),
        h('td', { class: 'n' }, r.taux != null ? [fmt(r.taux, 1) + ' % ', badgeDonnee('estimee')] : '—'),
        h('td', null, pillStatut(r.controle.statut)),
        h('td', null, btn('Voir', () => goToRef({ t: 'duct', id: r.id }), 'sm'))))))),
    R ? h('small', { class: 'note' }, `Règle : ${R.nom}. Source : ${R.source} · Édition : ${R.edition}.`) : null);
}
/* liste de matériel estimée */
function materielSection() {
  const L = listeMateriel(P);
  return h('section', null, h('h3', null, 'Liste de matériel (estimation)'),
    h('p', { class: 'note' }, `Quantités mesurées sur le plan, réserve de ${fmt(L.reserve.v, 0)} % comprise, arrondies à l’unité supérieure. Aucune référence fabricant : à vérifier avant commande.`),
    L.lignes.length ? h('div', { class: 'ev-table bi-table' }, h('table', null,
      h('thead', null, h('tr', null, ['Catégorie', 'Désignation', 'Quantité', 'Fiabilité', 'Détail'].map((t) => h('th', null, t)))),
      h('tbody', null, L.lignes.map((l) => h('tr', null, h('td', null, l.cat), h('td', null, l.des), h('td', { class: 'n' }, `${fmt(l.qte, 0)} ${l.unite}`), h('td', null, badgeDonnee(l.st)), h('td', null, h('small', null, l.note)))))))
      : h('p', { class: 'note' }, 'Rien à compter pour le moment : tracez les gaines des circuits.'),
    L.sansLongueur.length ? h('p', { class: 'note', style: 'color:var(--bad)' }, `Conducteurs non comptés (circuits pas entièrement raccordés par les gaines) : ${L.sansLongueur.join(', ')}.`) : null,
    L.vertInconnues ? h('p', { class: 'note', style: 'color:var(--bad)' }, `${L.vertInconnues} verticale${L.vertInconnues > 1 ? 's' : ''} non comptée${L.vertInconnues > 1 ? 's' : ''} (pose de gaine non précisée) : longueurs sous-estimées.`) : null);
}

function metresView() {
  const parts = [];
  if (!P.circuits.length) parts.push(h('p', { class: 'note' }, 'Générez d’abord le tableau (onglet Schéma unifilaire) : les longueurs sont calculées par circuit.'));
  else parts.push(...longueursSection(lignesCircuits(P)));
  if ((P.ducts || []).some((d) => d.sys === 'elec')) parts.push(conflitsSectionPlan(), remplissageSection());
  if (P.circuits.length || (P.ducts || []).some((d) => d.sys === 'elec')) parts.push(materielSection());
  return h('div', { class: 'ev-checks bilan metres' }, ...parts);
}

export { lignesCircuits, metresView };

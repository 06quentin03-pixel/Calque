// Moteur de câblage (js/cablage.js, sans écran) : conducteurs par tronçon (phase, neutre, terre, retours, navettes,
// commande des télérupteurs, fil pilote, volets), désignations, quantités, contrôles. Valeurs vérifiées à la main.
// Lancer :  node --test tests/cablage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/cablage.js';
import { longueurPolyligne, pointsGaine } from '../js/cheminement.js';

const L0 = { id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 };
const T = { id: 'T', lv: 'L0', type: 'tableau', x: 0, y: 0, rot: 0, h: 130 };
const g = (id, a, b, pts, o = {}) => Object.assign({ id, lv: 'L0', sys: 'elec', kind: 'icta', pose: 'plafond', a, b, pts }, o);
const e = (id, type, x, y, cid, o = {}) => Object.assign({ id, lv: 'L0', type, x, y, rot: 0, h: null, cid }, o);
function plan(o) { return Object.assign({ levels: [L0], walls: [], nodes: [], items: [], elec: [T], links: [], circuits: [], ducts: [], rcds: [], install: {} }, o); }
/* tronçon horizontal (le long d'une gaine) */
const tr = (cab, duct) => cab.troncons.filter((t) => t.duct === duct && t.kind === 'h');
const fns = (t) => t.compo.map((x) => (x.n > 1 ? x.n + x.fn : x.fn)).join('+');

test('interrupteur simple : 3G1,5 du tableau au plafonnier, phase et retour vers l’interrupteur', () => {
  const p = plan({
    elec: [T, e('pl', 'pl', 300, 200, 'c1'), e('i', 'int_s', 300, 0, 'c1', { h: 110 })],
    links: [{ id: 'k', lv: 'L0', a: 'i', b: 'pl' }],
    circuits: [{ id: 'c1', kind: 'eclairage', name: 'Éclairage', cal: 16, sec: 1.5 }],
    ducts: [g('g1', 'T', 'pl', [{ x: 0, y: 0 }, { x: 300, y: 200 }]), g('g2', 'pl', 'i', [{ x: 300, y: 200 }, { x: 300, y: 0 }])],
  });
  const cab = C.cablageCircuit(p, p.circuits[0]);
  assert.equal(cab.complet, true);
  assert.equal(fns(tr(cab, 'g1')[0]), 'L+N+PE'); assert.equal(tr(cab, 'g1')[0].des, '3G1,5');
  assert.equal(fns(tr(cab, 'g2')[0]), 'L+R'); assert.equal(tr(cab, 'g2')[0].des, '2 × 1,5');
  assert.equal(cab.desPrincipale, '3G1,5'); assert.equal(cab.maxConducteurs, 3);
  assert.deepEqual(cab.anomalies, []);
  /* longueur de conducteur : longueur de g1 (recollée au point de raccordement du tableau) + verticale du tableau
     (plafond 250 → tableau 130 : 120 cm) ; g2 : 200 cm (l'interrupteur est sur l'axe) */
  const g1 = longueurPolyligne(pointsGaine(p, p.ducts[0]));
  assert.ok(Math.abs(g1 - Math.hypot(300, 200)) < 15);
  assert.ok(Math.abs(cab.longueurs.N - (g1 + 120)) < 0.01, 'neutre : gaine + verticale du tableau');
  /* phase : tableau → plafonnier → interrupteur (verticale de 140 cm : 250 − 110) */
  assert.ok(Math.abs(cab.longueurs.L - (g1 + 120 + longueurPolyligne(pointsGaine(p, p.ducts[1])) + 140)) < 0.01);
  assert.equal(cab.st, 'estimee');
});

test('va-et-vient : navettes entre les deux commandes, va-et-vient seul signalé', () => {
  const p = plan({
    elec: [T, e('pl', 'pl', 600, 200, 'c1'), e('a', 'int_vv', 500, 0, 'c1', { h: 110 }), e('b', 'int_vv', 700, 0, 'c1', { h: 110 })],
    links: [{ id: 'k1', lv: 'L0', a: 'a', b: 'pl' }, { id: 'k2', lv: 'L0', a: 'b', b: 'pl' }],
    circuits: [{ id: 'c1', kind: 'eclairage', name: 'Couloir', cal: 16, sec: 1.5 }],
    ducts: [g('g1', 'T', 'pl', [{ x: 0, y: 0 }, { x: 600, y: 200 }]), g('ga', 'pl', 'a', [{ x: 600, y: 200 }, { x: 500, y: 0 }]), g('gb', 'pl', 'b', [{ x: 600, y: 200 }, { x: 700, y: 0 }])],
  });
  const cab = C.cablageCircuit(p, p.circuits[0]);
  const ga = fns(tr(cab, 'ga')[0]), gb = fns(tr(cab, 'gb')[0]);
  /* l'un reçoit la phase, l'autre renvoie le retour de lampe ; les deux navettes passent par la boîte du plafonnier */
  assert.deepEqual([ga, gb].sort(), ['L+2NAV', 'R+2NAV']);
  assert.equal(fns(tr(cab, 'g1')[0]), 'L+N+PE');
  assert.deepEqual(cab.anomalies, []);
  /* un seul va-et-vient : signalé */
  const q = JSON.parse(JSON.stringify(p)); q.elec = q.elec.filter((x) => x.id !== 'b'); q.links = q.links.filter((l) => l.a !== 'b'); q.ducts = q.ducts.filter((d) => d.id !== 'gb');
  const c2 = C.cablageCircuit(q, q.circuits[0]);
  assert.ok(c2.anomalies.some((a) => a.id === 'cb_vv' && a.niveau === 'avertissement'));
});

test('boutons-poussoirs et télérupteur au tableau : fil de commande et retour depuis le tableau', () => {
  const p = plan({
    elec: [T, e('pl', 'pl', 300, 200, 'c1'), e('b1', 'bp', 300, 0, 'c1', { h: 110 })],
    links: [{ id: 'k', lv: 'L0', a: 'b1', b: 'pl' }],
    circuits: [{ id: 'c1', kind: 'eclairage', name: 'Escalier', cal: 16, sec: 1.5, ctrl: 'telerupteur' }],
    ducts: [g('g1', 'T', 'pl', [{ x: 0, y: 0 }, { x: 300, y: 200 }]), g('g2', 'pl', 'b1', [{ x: 300, y: 200 }, { x: 300, y: 0 }])],
  });
  const cab = C.cablageCircuit(p, p.circuits[0]);
  /* tableau → boîte : phase (poussoir), neutre, terre, retour de lampe (télérupteur), fil de commande */
  assert.equal(fns(tr(cab, 'g1')[0]), 'L+N+PE+R+CMD'); assert.equal(tr(cab, 'g1')[0].des, '5G1,5');
  assert.equal(fns(tr(cab, 'g2')[0]), 'L+CMD');
  assert.deepEqual(cab.anomalies, []);
  /* sans télérupteur réglé sur le circuit : suggestion */
  p.circuits[0].ctrl = null;
  assert.ok(C.cablageCircuit(p, p.circuits[0]).anomalies.some((a) => a.id === 'cb_bp' && a.niveau === 'suggestion'));
});

test('prises, triphasé, fil pilote, volets roulants', () => {
  const p = plan({
    elec: [T, e('p1', 'pc', 300, 0, 'c1', { h: 30 }), e('p2', 'pc', 600, 0, 'c1', { h: 30 }), e('t1', 'pc_tri', 0, 300, 'c2', { h: 30 }),
      e('r1', 'rad_elec', 300, 400, 'c3', { h: 20 }), e('fp', 'prog_fp', 50, 50),
      e('v1', 'cmd_vr', 400, 400, 'c4', { h: 110 }), e('m1', 'volet_mot', 400, 600, 'c4', { h: 220 })],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5 }, { id: 'c2', kind: 'specialise', name: 'Tri', cal: 20, sec: 2.5 },
      { id: 'c3', kind: 'chauffage', name: 'Chauffage', cal: 20, sec: 2.5 }, { id: 'c4', kind: 'volets', name: 'Volets', cal: 16, sec: 1.5 }],
    ducts: [g('g1', 'T', 'p1', [{ x: 0, y: 0 }, { x: 300, y: 0 }], { pose: 'sol' }), g('g2', 'p1', 'p2', [{ x: 300, y: 0 }, { x: 600, y: 0 }], { pose: 'sol' }),
      g('g3', 'T', 't1', [{ x: 0, y: 0 }, { x: 0, y: 300 }], { pose: 'sol' }), g('g4', 'T', 'r1', [{ x: 0, y: 0 }, { x: 300, y: 400 }], { pose: 'sol' }),
      g('g5', 'T', 'v1', [{ x: 0, y: 0 }, { x: 400, y: 400 }]), g('g6', 'v1', 'm1', [{ x: 400, y: 400 }, { x: 400, y: 600 }])],
    install: { reseau: 'tri' },
  });
  const R = C.cablagePlan(p);
  const c1 = R.circuits.get('c1'), c2 = R.circuits.get('c2'), c3 = R.circuits.get('c3'), c4 = R.circuits.get('c4');
  assert.equal(tr(c1, 'g1')[0].des, '3G2,5'); assert.equal(tr(c1, 'g2')[0].des, '3G2,5');
  assert.equal(fns(tr(c2, 'g3')[0]), 'L1+L2+L3+N+PE'); assert.equal(tr(c2, 'g3')[0].des, '5G2,5');
  assert.equal(fns(tr(c3, 'g4')[0]), 'L+N+PE+FP'); assert.equal(tr(c3, 'g4')[0].des, '4G2,5');
  /* volet : phase jusqu'à la commande ; neutre et terre jusqu'au moteur ; montée et descente de la commande au moteur */
  assert.equal(fns(tr(c4, 'g5')[0]), 'L+N+PE'); assert.equal(fns(tr(c4, 'g6')[0]), 'N+PE+M+D'); assert.equal(tr(c4, 'g6')[0].des, '4G1,5');
  /* triphasé sur une installation monophasée : erreur ; en triphasé : rien */
  assert.ok(!C.controlesCablage(p).some((x) => x.id === 'cb_tab_tri'));
  p.install.reseau = 'mono';
  assert.ok(C.controlesCablage(p).some((x) => x.id === 'cb_tab_tri' && x.niveau === 'erreur' && x.cid === 'c2'));
});

test('gaine partagée, quantités avec réserve, câble ou fils, points non raccordés, nettoyage v12', () => {
  const p = plan({
    elec: [T, e('p1', 'pc', 400, 0, 'c1', { h: 30 }), e('l1', 'pl', 400, 100, 'c2'), e('i1', 'int_s', 400, 50, 'c2', { h: 110 }), e('x', 'pc', 900, 900, 'c1', { h: 30 })],
    links: [{ id: 'k', lv: 'L0', a: 'i1', b: 'l1' }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5, cond: 'r2v' }, { id: 'c2', kind: 'eclairage', name: 'Éclairage', cal: 16, sec: 1.5 }],
    ducts: [g('tronc', 'T', null, [{ x: 0, y: 0 }, { x: 400, y: 0 }], { kind: 'cdc', pose: 'hauteur', z: 230, lw: 100, lh: 50 }),
      g('d1', null, 'p1', [{ x: 400, y: 0 }, { x: 400, y: 0.5 }], { pose: 'hauteur', z: 230 }), g('d2', null, 'l1', [{ x: 400, y: 0 }, { x: 400, y: 100 }], { pose: 'hauteur', z: 230 }),
      g('d3', 'l1', 'i1', [{ x: 400, y: 100 }, { x: 400, y: 50 }])],
  });
  const R = C.cablagePlan(p);
  assert.equal(R.parGaine.get('tronc').circuits.size, 2, 'deux circuits dans le chemin de câbles');
  assert.equal(R.parGaine.get('tronc').max, 6, '3G2,5 + 3G1,5 sur le chemin de câbles');
  const c1 = R.circuits.get('c1');
  assert.equal(c1.complet, false); assert.deepEqual(c1.nonAtteints, ['x']);
  assert.ok(c1.anomalies.some((a) => a.id === 'cb_raccord'));
  /* c1 en câble R2V : compté en mètres de câble 3G2,5 ; c2 sur chemin de câbles sans type choisi : câble estimé */
  const q = C.quantitesConducteurs(p, { v: 10 });
  const cab = q.cables.find((x) => x.des === 'R2V 3G2,5');
  assert.ok(cab && cab.circuits.includes('c1'));
  assert.equal(cab.m, Math.ceil((cab.cm / 100) * 1.1 - 1e-9));
  assert.ok(q.incomplets.includes('c1'));
  assert.equal(C.cablagePlan(p), R, 'résultat mémorisé tant que le plan ne change pas');
  p.elec.find((x) => x.id === 'p1').x = 401;
  assert.notEqual(C.cablagePlan(p), R, 'recalculé après une modification');
  /* fils H07V-U choisis sur un chemin de câbles : erreur */
  p.circuits[1].cond = 'h07vu';
  assert.ok(C.controlesCablage(p).some((x) => x.id === 'cb_fils_cdc' && x.niveau === 'erreur'));
  /* nettoyage du format v12 : valeurs invalides retirées, valeurs valides gardées */
  assert.deepEqual(C.nettoyerCircuitV12({ id: 'a', col: 'rouge', courbe: 'Z', cond: 'cuivre' }), { id: 'a' });
  assert.deepEqual(C.nettoyerCircuitV12({ id: 'a', col: '#AA0011', courbe: 'C', cond: 'r2v' }), { id: 'a', col: '#AA0011', courbe: 'C', cond: 'r2v' });
});

// Tests de la phase 3 : moteur de calcul électrique (sans écran), avec des valeurs calculées à la main.
// Lancer depuis la racine du dépôt :  node --test tests/calcul.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const K = await import(path.join(ROOT, 'js', 'calcul.js'));
const N = await import(path.join(ROOT, 'js', 'normes.js'));
const D = await import(path.join(ROOT, 'js', 'elecdonnees.js'));

/* égalité à 1e-6 près en relatif (valeurs calculées à la main, arrondies dans les commentaires) */
const near = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} au lieu de ${b}`);

test('intensités : monophasé I = P / (U0 cos φ), triphasé I = P / (√3 U cos φ)', () => {
  near(K.courantMono(2300, 230, 1), 10, '2 300 W, 230 V, cos 1 → 10 A');
  near(K.courantMono(2000, 230, 0.8), 2000 / 184, '2 000 W, cos 0,8 → 2000 / 184 = 10,8696 A');
  near(K.courantTri(10000, 400, 0.8), 18.042195912175807, '10 kW, 400 V, cos 0,8 → 10000 / 554,256 = 18,0422 A');
  near(K.courantTri(6928.203230275509, 400, 1), 10, '√3 × 400 × 10 = 6 928,2 W → 10 A');
  assert.ok(Number.isNaN(K.courantMono(1000, 230, 0)), 'cos φ = 0 refusé');
  assert.ok(Number.isNaN(K.courantMono(1000, 230, 1.2)), 'cos φ > 1 refusé');
  assert.ok(Number.isNaN(K.courantMono(-5, 230, 1)), 'puissance négative refusée');
  assert.ok(Number.isNaN(K.courantTri(1000, 0, 1)), 'tension nulle refusée');
});

test('puissances P, Q, S et cos φ', () => {
  const p = K.puissances(2000, 0.8);
  near(p.S, 2500, 'S = 2000 / 0,8'); near(p.Q, 1500, 'Q = 2500 × 0,6'); near(p.sin, 0.6, 'sin φ'); near(p.tan, 0.75, 'tan φ');
  const r = K.puissances(3000, 1);
  near(r.S, 3000, 'charge résistive : S = P'); near(r.Q, 0, 'charge résistive : Q = 0');
  near(K.apparenteMono(230, 10), 2300, 'S = 230 × 10');
  near(K.apparenteTri(400, 10), 6928.203230275509, 'S = √3 × 400 × 10');
  near(K.cosPhi(2000, 2500), 0.8, 'cos φ = P / S');
  near(K.cosPhiPQ(3000, 4000), 0.6, 'cos φ = 3000 / 5000');
  assert.ok(Number.isNaN(K.cosPhi(3000, 2000)), 'P > S refusé');
  assert.equal(K.puissances(1000, 0), null);
});

test('chute de tension ΔU = b (ρ L / S cos φ + λ L sin φ) IB', () => {
  /* mono, 20 m, 2,5 mm², cos 1, 16 A : 2 × (0,0225 × 20 / 2,5) × 16 = 5,76 V ; 5,76 / 230 = 2,5043 % */
  let r = K.chuteTension({ b: 2, rho: 0.0225, L: 20, S: 2.5, cos: 1, lambda: 0.00008, I: 16, U0: 230 });
  near(r.dU, 5.76, 'ΔU mono cos 1'); near(r.pct, 576 / 230, 'ΔU % mono cos 1');
  /* mono, cos 0,8 : 2 × (0,18 × 0,8 + 0,00008 × 20 × 0,6) × 16 = 2 × 0,14496 × 16 = 4,63872 V */
  r = K.chuteTension({ b: 2, rho: 0.0225, L: 20, S: 2.5, cos: 0.8, lambda: 0.00008, I: 16, U0: 230 });
  near(r.dU, 4.63872, 'ΔU mono cos 0,8');
  /* tri, 50 m, 6 mm², cos 0,8, 18,0422 A : 1 × (0,1875 × 0,8 + 0,00008 × 50 × 0,6) × 18,0422 = 0,1524 × 18,0422 = 2,74963 V */
  r = K.chuteTension({ b: 1, rho: 0.0225, L: 50, S: 6, cos: 0.8, lambda: 0.00008, I: 18.042195912175807, U0: 230 });
  near(r.dU, 0.1524 * 18.042195912175807, 'ΔU tri'); near(r.pct, 100 * 0.1524 * 18.042195912175807 / 230, 'ΔU % tri');
  assert.equal(K.chuteTension({ b: 2, rho: 0.0225, L: 20, S: 0, cos: 1, lambda: 0, I: 1, U0: 230 }), null, 'section nulle refusée');
  assert.equal(K.chuteTension({ b: 2, rho: 0.0225, L: undefined, S: 2.5, cos: 1, lambda: 0, I: 1, U0: 230 }), null, 'longueur absente : pas de résultat');
});

test('bilan de puissance : S = √(ΣP² + ΣQ²), coefficient de simultanéité facultatif', () => {
  const b = K.bilanPuissance([{ P: 3000, Q: 0 }, { P: 4000, Q: 3000 }]);
  near(b.P, 7000, 'ΣP'); near(b.Q, 3000, 'ΣQ'); near(b.S, Math.sqrt(58e6), 'S = √(7000² + 3000²) = 7 615,77 VA');
  near(b.cos, 7000 / Math.sqrt(58e6), 'cos φ global = 0,91915');
  assert.equal(b.Pappelee, null, 'sans ks : pas de puissance appelée');
  const k = K.bilanPuissance([{ P: 3000, Q: 0 }, { P: 4000, Q: 3000 }], 0.5);
  near(k.Pappelee, 3500, 'ks 0,5'); near(k.Sappelee, Math.sqrt(58e6) / 2, 'S appelée');
});

test('équilibrage des phases et répartition proposée', () => {
  const e = K.equilibrage({ L1: 20, L2: 10, L3: 15 });
  near(e.moyenne, 15, 'moyenne'); near(e.ecart, 10, 'écart'); near(e.desequilibre, 100 / 3, '(20 − 15) / 15 = 33,3 %');
  near(K.equilibrage({ L1: 10, L2: 10, L3: 10 }).desequilibre, 0, 'équilibré');
  /* 10, 8, 6, 5, 3 A : 10 → L1, 8 → L2, 6 → L3, 5 → L3 (11), 3 → L2 (11) */
  const r = K.repartirPhases([{ id: 'a', I: 10 }, { id: 'b', I: 8 }, { id: 'c', I: 6 }, { id: 'd', I: 5 }, { id: 'e', I: 3 }]);
  assert.deepEqual(r.phases, { a: 'L1', b: 'L2', c: 'L3', d: 'L3', e: 'L2' });
  assert.deepEqual(r.charges, { L1: 10, L2: 11, L3: 11 });
});

test('données marquées : « vérifiée » exige une source, valeur absente = null', () => {
  assert.deepEqual(K.donnee(1000, 'verifiee', 'Plaque signalétique'), { v: 1000, st: 'verifiee', src: 'Plaque signalétique' });
  assert.equal(K.donnee(1000, 'verifiee', '  ').st, 'saisie', 'sans source → saisie');
  assert.equal(K.donnee(1000, 'n’importe quoi').st, 'saisie');
  assert.equal(K.lireDonnee(1200).st, 'saisie', 'nombre seul = saisie');
  assert.equal(K.lireDonnee(null), null); assert.equal(K.lireDonnee({ v: NaN }), null);
  assert.equal(K.lireDonnee({ v: -3, st: 'saisie' }, (v) => v > 0), null, 'valeur hors limites refusée');
  assert.equal(K.statutDe({ st: 'verifiee' }, { st: 'saisie' }), 'saisie');
  assert.equal(K.statutDe({ st: 'saisie' }, { st: 'estimee' }), 'estimee');
});

test('tableaux NF C 15-100 : emplacements prêts, tous manquants tant que l’extrait Legrand n’est pas fourni', () => {
  assert.ok(N.TABLES.length >= 6);
  for (const t of N.TABLES) {
    assert.ok(t.id && t.titre && t.contenu && t.format && t.sert.length, t.id);
    assert.equal(t.statut, 'manquante', `${t.id} manquant`);
    assert.equal(t.donnees, null, `${t.id} sans données inventées`);
    assert.equal(N.tableDisponible(t.id), false);
  }
  assert.equal(N.tablesManquantes().length, N.TABLES.length);
  for (const [id, r] of Object.entries(N.REGLES)) assert.ok(r.nom && r.source && r.edition, `règle ${id} : nom, source, édition`);
  for (const [id, c] of Object.entries(N.CONSTANTES)) assert.ok(c.st === 'estimee' && c.src, `constante ${id} marquée estimée avec son origine`);
});

/* entrée de fiche écrite à la main */
const d = (v, st = 'saisie', src = 'test') => ({ v, st, src });
function chauffage3000() {
  return { nom: 'Chauffage', kind: 'chauffage', reseau: d('mono'), phase: null, P: d(3000), cos: d(1, 'estimee'), L: d(20), sec: d(2.5), In: d(20), mat: d('cu'), secMaxCalque: 20 };
}

test('fiche de calcul : formules, résultats, jamais « conforme » tant que les tableaux manquent', () => {
  const f = K.ficheCircuit(chauffage3000());
  /* IB = 3000 / 230 = 13,0435 A ; ΔU = 2 × 0,0225 × 20 / 2,5 × 13,0435 = 4,69565 V = 2,0416 % */
  near(f.resultats.IB.v, 3000 / 230, 'IB'); assert.equal(f.resultats.IB.st, 'estimee', 'cos φ estimé → IB estimée');
  near(f.resultats.dU.v, 0.36 * 3000 / 230, 'ΔU'); near(f.resultats.dUpct.v, 100 * 0.36 * 3000 / 230 / 230, 'ΔU %');
  assert.deepEqual(f.manquantes, []);
  const ctl = Object.fromEntries(f.controles.map((c) => [c.id, c]));
  assert.equal(ctl.ib_in.statut, 'conforme');
  for (const id of ['in_iz', 'sec_logement', 'chute_tension', 'pdc']) assert.equal(ctl[id].statut, 'verification', id);
  assert.ok(ctl.in_iz.tablesManquantes.length >= 1);
  assert.equal(f.statut, 'verification', 'pas de conformité globale');
  for (const c of f.controles) { assert.ok(['conforme', 'non_conforme', 'verification'].includes(c.statut)); assert.ok(c.source && c.edition, c.id); }
  assert.ok(f.formules.some((x) => x.expr === 'IB = P / (U0 × cos φ)'));
  assert.ok(f.hypotheses.length >= 3);
  for (const x of f.donnees.filter((x) => x.v != null)) assert.ok(['verifiee', 'saisie', 'estimee'].includes(x.st), x.nom);
});

test('fiche de calcul : IB > In → non conforme ; donnée absente → signalée, rien de calculé', () => {
  const e = chauffage3000(); e.P = d(5000); e.In = d(16); e.secMaxCalque = 16; e.sec = d(1.5);
  const f = K.ficheCircuit(e);
  assert.equal(f.controles.find((c) => c.id === 'ib_in').statut, 'non_conforme');
  assert.equal(f.statut, 'non_conforme');
  assert.ok(f.alertes.some((a) => a.niveau === 'bad'));
  const g = K.ficheCircuit({ ...chauffage3000(), P: null, L: null, cos: null, kind: 'prises' });
  assert.deepEqual(g.manquantes.map((m) => m.nom).sort(), ['Facteur de puissance cos φ', 'Longueur du câble L', 'Puissance active P'].sort());
  assert.equal(g.resultats.IB, undefined); assert.equal(g.resultats.dU, undefined);
  assert.equal(g.controles.find((c) => c.id === 'ib_in').statut, 'verification');
  /* calibre supérieur à la valeur actuelle de Calque : alerte, mais statut « vérification nécessaire » (source non vérifiée) */
  const h = K.ficheCircuit({ ...chauffage3000(), In: d(32), secMaxCalque: 20 });
  assert.equal(h.controles.find((c) => c.id === 'sec_logement').statut, 'verification');
  assert.ok(h.alertes.some((a) => a.niveau === 'bad' && /contrôle actuel de Calque/.test(a.texte)));
});

test('fiche de calcul en triphasé : IB, ΔU avec b = 1', () => {
  const f = K.ficheCircuit({ nom: 'Moteur', kind: 'autre', reseau: d('tri'), phase: d('tri'), P: d(10000), cos: d(0.8), L: d(50), sec: d(6), In: d(25), mat: d('cu') });
  near(f.resultats.IB.v, 18.042195912175807, 'IB tri');
  near(f.resultats.dU.v, 0.1524 * 18.042195912175807, 'ΔU tri');
  near(f.resultats.Q.v, 7500, 'Q = 12 500 × 0,6');
  /* triphasé sur une installation monophasée : alerte, pas de calcul */
  const g = K.ficheCircuit({ nom: 'Moteur', kind: 'autre', reseau: d('mono'), phase: d('tri'), P: d(10000), cos: d(0.8), L: d(50), sec: d(6), In: d(25) });
  assert.equal(g.resultats.IB, undefined); assert.ok(g.alertes.some((a) => a.niveau === 'bad'));
});

/* petit plan (objet seul, sans écran) */
function planTest(reseau) {
  return {
    install: { kva: 9, parafoudre: false, row: 13, ...(reseau ? { reseau } : {}) },
    elec: [
      { id: 'e1', type: 'rad_elec', cid: 'ch', p: 1000 }, { id: 'e2', type: 'rad_elec', cid: 'ch' },
      { id: 'e3', type: 'pc', cid: 'pr' }, { id: 'e4', type: 'pc', cid: 'pr' }, { id: 'e5', type: 'int_s', cid: 'ch' },
      { id: 'e6', type: 'pc_tri', cid: 'tri' },
    ],
    circuits: [
      { id: 'ch', kind: 'chauffage', name: 'Chauffage', cal: 20, sec: 2.5 },
      { id: 'pr', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5 },
      { id: 'cu', kind: 'cuisson', name: 'Cuisson', cal: 32, sec: 6, calc: { p: { v: 4600, st: 'verifiee', src: 'Notice de la plaque' }, cos: { v: 1, st: 'saisie' }, len: { v: 8, st: 'saisie' }, phase: 'L1' } },
      { id: 'tri', kind: 'autre', name: 'Prise triphasée', cal: 20, sec: 2.5, calc: { p: { v: 10000, st: 'saisie' }, cos: { v: 0.8, st: 'saisie' } } },
    ],
  };
}

test('lecture du plan : puissance des symboles (saisie / estimée), données absentes signalées, plan inchangé', () => {
  const p = planTest(); const avant = JSON.stringify(p);
  const ch = K.entreesDuPlan(p, p.circuits[0]);
  assert.equal(ch.P.v, 2500, '1 000 W saisis + 1 500 W par défaut (la commande ne compte pas)');
  assert.equal(ch.P.st, 'estimee'); assert.equal(ch.Pdetail.estimees, 1);
  assert.equal(ch.cos.st, 'estimee', 'chauffage : cos φ 1 estimé');
  assert.equal(ch.reseau.st, 'estimee', 'réseau non précisé → monophasé estimé');
  const pr = K.entreesDuPlan(p, p.circuits[1]);
  assert.equal(pr.P, null); assert.match(pr.Pdetail.raison, /2 symboles sur 2 sans puissance/);
  assert.equal(pr.cos, null, 'prises : cos φ jamais deviné');
  const cu = K.entreesDuPlan(p, p.circuits[2]);
  assert.deepEqual(cu.P, { v: 4600, st: 'verifiee', src: 'Notice de la plaque' });
  assert.equal(cu.phase.v, 'L1');
  assert.equal(K.entreesDuPlan(p, p.circuits[3]).phase.st, 'estimee', 'prise triphasée → raccordement triphasé estimé');
  const f = K.ficheDuPlan(p, p.circuits[2]); near(f.resultats.IB.v, 20, 'cuisson 4 600 W / 230 V = 20 A');
  assert.equal(JSON.stringify(p), avant, 'le moteur ne modifie pas le plan');
});

test('bilan et équilibrage d’un plan triphasé', () => {
  const p = planTest('tri');
  p.circuits.push({ id: 'l2', kind: 'chauffe_eau', name: 'Chauffe-eau', cal: 20, sec: 2.5, calc: { p: { v: 2300, st: 'saisie' }, phase: 'L2' } });
  p.circuits.push({ id: 'l3', kind: 'specialise', name: 'Four', cal: 20, sec: 2.5, calc: { p: { v: 3450, st: 'saisie' }, cos: { v: 1, st: 'saisie' }, phase: 'L3' } });
  const b = K.bilanDuPlan(p);
  /* P connues : chauffage 2 500 + cuisson 4 600 + tri 10 000 + chauffe-eau 2 300 + four 3 450 = 22 850 W ; prises inconnues */
  near(b.Pinstallee, 22850, 'puissance installée (partielle)');
  assert.equal(b.complet, false); assert.equal(b.Sinstallee, null, 'bilan partiel : pas de S totale');
  assert.ok(b.manquantes.some((m) => m.nom === 'Puissance'));
  assert.ok(b.manquantes.some((m) => /simultanéité/.test(m.nom)));
  const e = K.equilibrageDuPlan(p, b);
  assert.equal(e.applicable, true);
  /* tri 18,0422 A sur chaque phase ; L1 + 20 (cuisson) ; L2 + 10 (chauffe-eau) ; L3 + 15 (four) ; chauffage sans phase */
  const t = 18.042195912175807;
  near(e.L1, t + 20, 'L1'); near(e.L2, t + 10, 'L2'); near(e.L3, t + 15, 'L3');
  near(e.desequilibre, 5 / (t + 15) * 100, '(I max − I moyen) / I moyen');
  assert.deepEqual(e.sansPhase, ['Chauffage']); assert.deepEqual(e.sansI, ['Prises']);
  /* proposition (base t sur chaque phase) : 20 (cuisson) → L1, 15 (four) → L2, 13,04 (chauffage) → L3, puis 10 (chauffe-eau) → L3, la moins chargée */
  assert.equal(e.proposition.phases.cu, 'L1'); assert.equal(e.proposition.phases.l3, 'L2'); assert.equal(e.proposition.phases.ch, 'L3'); assert.equal(e.proposition.phases.l2, 'L3');
});

test('données électriques sorties de electricite.js : chargées sans écran, valeurs inchangées', () => {
  assert.equal(D.SEC_MAX[2.5], 20); assert.equal(D.CK.cuisson.cal, 32); assert.equal(D.elecPower({ type: 'rad_elec' }), 1500);
  assert.equal(D.elecPower({ type: 'rad_elec', p: 750 }), 750); assert.equal(D.elecPower({ type: 'pc' }), 0);
  assert.equal(D.defaultKindFor('pc32'), 'cuisson'); assert.equal(D.accepts('eclairage', 'spot'), true);
  assert.deepEqual(D.agcpOf(9), [15, 45]); assert.equal(D.circLoad({ kind: 'chauffage', cal: 20 }), 20); assert.equal(D.circLoad({ kind: 'prises', cal: 20 }), 10);
  assert.equal(D.puissanceSymbole({ type: 'pc' }), null, 'prise : aucune puissance devinée');
});

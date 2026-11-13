// Demandes du 13 novembre 2026 (format v15) : trémie à la forme réelle de l'escalier, sol supprimé, terrasse ou balcon
// d'un seul niveau, colonne de passage du tableau entre les étages, choix des conducteurs gaine par gaine (fils ou
// câble), mode « Tester » des schémas (simulation des contacts). Valeurs vérifiées à la main.
// Lancer :  node --test tests/demandes.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stairZones } from '../js/symboles.js';
import * as CH from '../js/cheminement.js';
import { raccorderCircuit } from '../js/itineraire.js';
import * as C from '../js/cablage.js';
import { besoinsPiece } from '../js/equipement.js';
import * as SC from '../js/schema.js';
import * as SIM from '../js/simulation.js';
import { fresh, boot, wait, seedPlan } from './outils.mjs';

const aire = (pts) => { let s = 0; for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length]; s += a.x * b.y - b.x * a.y; } return Math.abs(s) / 2; };

/* ---------------- escaliers ---------------- */
test('escalier : emprise réelle (droit, en L, en U, hélicoïdal), miroir', () => {
  const d = stairZones({ type: 'esc_droit', w: 90, d: 360 });
  assert.equal(aire(d.contour), 90 * 360);
  /* quart tournant 200 × 360, emmarchement 90 : volée de 90 × 360 + retour de 110 × 90 */
  const q = stairZones({ type: 'esc_quart', w: 200, d: 360, e: 90 });
  assert.equal(aire(q.contour), 200 * 360 - 110 * 270, 'L : le reste du rectangle n’est pas découpé');
  assert.equal(q.parts.reduce((s, p) => s + aire(p), 0), aire(q.contour), 'morceaux convexes = contour');
  const qm = stairZones({ type: 'esc_quart', w: 200, d: 360, e: 90, flip: true });
  assert.ok(qm.contour.every((p, i) => Math.abs(p.x + q.contour[i].x) < 1e-9 && p.y === q.contour[i].y), 'miroir');
  /* demi-tournant 200 × 280, emmarchement 90 : deux volées de 90 × 190 + palier de 200 × 90 ; le jour (20 cm) reste */
  const u = stairZones({ type: 'esc_demi', w: 200, d: 280, e: 90 });
  assert.equal(aire(u.contour), 2 * 90 * 190 + 200 * 90);
  const hx = stairZones({ type: 'esc_helice', w: 160, d: 160 });
  assert.ok(Math.abs(aire(hx.contour) - Math.PI * 80 * 80) < 0.03 * Math.PI * 80 * 80);
});

/* ---------------- pièces extérieures ---------------- */
test('terrasse ou balcon : aucun besoin de pièce d’habitation', () => {
  assert.equal(besoinsPiece('Terrasse', 20).socles, 1, 'sans le réglage, une pièce de 20 m² demande un socle');
  const b = besoinsPiece('Terrasse', 20, true);
  assert.equal(b.socles, 0); assert.equal(b.vide, true); assert.equal(b.exterieure, true); assert.equal(b.lumiereObligatoire, false);
});

/* ---------------- colonne de passage ---------------- */
const L0 = { id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }, L1 = { id: 'L1', name: 'Étage', elev: 270, h: 250, slab: 20 }, L2 = { id: 'L2', name: 'Combles', elev: 540, h: 230, slab: 20 };
const T = { id: 'T', lv: 'L0', type: 'tableau', x: 0, y: 0, rot: 0, h: 130 };
const e = (id, lv, type, x, y, cid, o = {}) => Object.assign({ id, lv, type, x, y, rot: 0, h: null, cid }, o);
const g = (id, lv, a, b, pts, o = {}) => Object.assign({ id, lv, sys: 'elec', kind: 'icta', pose: 'plafond', a, b, pts }, o);
const plan = (o) => Object.assign({ levels: [L0, L1, L2], walls: [], nodes: [], items: [], elec: [T], links: [], circuits: [], ducts: [], rcds: [], zones: [], install: { row: 13 } }, o);

test('colonne de passage : un passage par niveau à l’aplomb du tableau, taille estimée, sans modifier le plan', () => {
  const p = plan(); let n = 0;
  const r = CH.colonneTableau(p, T, () => 'c' + n++);
  assert.equal(r.membres.length, 3); assert.equal(r.nouveaux.length, 3); assert.equal(p.elec.length, 1, 'plan non modifié');
  for (const m of r.membres) { assert.equal(m.type, 'traversee'); assert.equal(m.col, r.col); assert.equal(m.tab, 'T'); }
  assert.deepEqual(new Set(r.membres.map((m) => m.lv)), new Set(['L0', 'L1', 'L2']));
  assert.equal(r.membres[0].w, Math.round(13 * 1.8 + 7)); assert.equal(r.membres[0].d, 20);
  assert.equal(CH.tailleColonne(p).st, 'estimee');
  /* le tableau est mural : la colonne est posée devant lui (point de raccordement), au même endroit sur chaque niveau */
  const a = CH.ancrage(T); assert.ok(r.membres.every((m) => Math.abs(m.x - a.x) < 0.1 && Math.abs(m.y - a.y) < 0.1));
  /* deuxième appel après ajout : rien de nouveau */
  p.elec.push(...r.nouveaux);
  const r2 = CH.colonneTableau(p, T, () => 'x'); assert.equal(r2.nouveaux.length, 0); assert.equal(r2.membres.length, 3);
});

test('colonne de passage : les gaines raccordées à la colonne, à n’importe quel étage, rejoignent le tableau', () => {
  const cols = CH.colonneTableau(plan(), T, ((n) => () => 'm' + n++)(0)).nouveaux; // m0 (L0), m1 (L1), m2 (L2)
  const p = plan({
    elec: [T, ...cols, e('pc1', 'L1', 'pc', 400, 0, 'c1', { h: 30 }), e('pc2', 'L2', 'pc', 0, 300, 'c1', { h: 30 })],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises étages', cal: 16, sec: 2.5 }],
    ducts: [g('d1', 'L1', 'm1', 'pc1', [{ x: 0, y: 0 }, { x: 400, y: 0 }]), g('d2', 'L2', 'm2', 'pc2', [{ x: 0, y: 0 }, { x: 0, y: 300 }])],
  });
  const ch = CH.cheminCircuit(p, 'c1');
  assert.equal(ch.complet, true, 'aucune gaine au rez-de-chaussée : la colonne relie directement le tableau');
  /* longueur jusqu'à pc2 : du tableau (130 cm) au plafond des combles (540 + 230 = 770) : 640 cm de montée,
     puis 300 cm à l'horizontale et 200 cm de descente (230 − 30) ; distance horizontale tableau → colonne comprise */
  const dx = Math.hypot(CH.ancrage(T).x - T.x, CH.ancrage(T).y - T.y);
  assert.ok(Math.abs(ch.Lmax - (640 + dx + 300 + 200)) < 1, `Lmax = ${ch.Lmax}`);
  /* sans le lien `tab`, la colonne ne touche plus le tableau : circuit incomplet */
  const q = JSON.parse(JSON.stringify(p)); for (const x of q.elec) delete x.tab;
  assert.equal(CH.cheminCircuit(q, 'c1').complet, false);
});

test('raccordement automatique : un point de l’étage part de la colonne du tableau, pas d’un autre passage', () => {
  const cols = CH.colonneTableau(plan(), T, ((n) => () => 'm' + n++)(0)).nouveaux;
  const p = plan({
    elec: [T, ...cols, e('pc1', 'L1', 'pc', 500, 200, 'c1', { h: 30 }),
      /* un autre passage, loin du tableau (garage) : il n'est pas raccordé, il n'est donc pas pris */
      e('tg0', 'L0', 'traversee', 900, 900, null, { to: 'tg1' }), e('tg1', 'L1', 'traversee', 900, 900, null, { to: 'tg0' })],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 16, sec: 2.5 }],
  });
  const r = raccorderCircuit(p, 'c1', { pose: 'plafond' });
  assert.equal(r.echecs.length, 0);
  assert.equal(r.gaines.length, 1); assert.equal(r.gaines[0].a, 'm1', 'départ : colonne de l’étage');
  const q = Object.assign({}, p, { ducts: r.gaines }); assert.equal(CH.cheminCircuit(q, 'c1').complet, true);
});

/* ---------------- conducteurs choisis par gaine ---------------- */
const L0s = { id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 };
const p1 = (conds2) => ({
  levels: [L0s], walls: [], nodes: [], items: [], links: [{ id: 'k', lv: 'L0', a: 'i', b: 'pl' }], rcds: [], install: {},
  elec: [T, e('pl', 'L0', 'pl', 300, 200, 'c1'), e('i', 'L0', 'int_s', 300, 0, 'c1', { h: 110 })],
  circuits: [{ id: 'c1', kind: 'eclairage', name: 'Éclairage', cal: 16, sec: 1.5 }],
  ducts: [g('g1', 'L0', 'T', 'pl', [{ x: 0, y: 0 }, { x: 300, y: 200 }], conds2 ? { conds: conds2.g1 } : {}), g('g2', 'L0', 'pl', 'i', [{ x: 300, y: 200 }, { x: 300, y: 0 }], conds2 ? { conds: conds2.g2 } : {})],
});
const trs = (cab, d) => cab.troncons.filter((t) => t.duct === d && t.kind === 'h')[0];
test('conducteurs : fils H07V-U (seulement ceux qui servent), câble à la taille juste, câble choisi avec réserve, câble trop petit', () => {
  let p = p1({ g1: { c1: { t: 'h07vu' } }, g2: { c1: { t: 'r2v', n: 5 } } });
  let cab = C.cablageCircuit(p, p.circuits[0]);
  assert.equal(trs(cab, 'g1').libelle, '3 fils H07V-U 1,5 mm²'); assert.equal(trs(cab, 'g1').condSt, 'saisie'); assert.equal(trs(cab, 'g1').condGaine, true);
  assert.equal(trs(cab, 'g2').des, '2 × 1,5', 'conducteurs nécessaires : phase et retour');
  assert.equal(trs(cab, 'g2').desCable, '5 × 1,5'); assert.equal(trs(cab, 'g2').reserve, 3); assert.equal(trs(cab, 'g2').libelle, 'R2V 5 × 1,5');
  assert.ok(Object.keys(cab.cables).includes('R2V 5 × 1,5'), 'compté comme câble de 5 conducteurs');
  assert.ok(cab.fils.N > 0 && !cab.fils.R, 'fils : seulement ceux de g1 (le retour est dans le câble de g2)');
  assert.deepEqual(cab.anomalies, []);
  /* câble trop petit : erreur */
  p = p1({ g1: { c1: { t: 'r2v', n: 2 } } });
  cab = C.cablageCircuit(p, p.circuits[0]);
  assert.ok(cab.anomalies.some((a) => a.id === 'cb_cable_petit' && a.niveau === 'erreur'));
  /* sans choix : comportement d'avant (désignation, fils estimés sous ICTA) */
  cab = C.cablageCircuit(p1(), p1().circuits[0]);
  assert.equal(trs(cab, 'g1').des, '3G1,5'); assert.equal(trs(cab, 'g1').condSt, 'estimee'); assert.equal(trs(cab, 'g1').libelle, '3 fils H07V-U 1,5 mm²');
  /* choix fait pour un autre circuit : sans effet */
  cab = C.cablageCircuit(p1({ g1: { autre: { t: 'r2v' } } }), p1().circuits[0]); assert.equal(trs(cab, 'g1').condGaine, false);
  /* nettoyage (migration v15) */
  const d = { sys: 'elec', conds: { c1: { t: 'r2v', n: 5 }, c2: { t: 'h07vu', n: 4 }, c3: { t: 'cuivre' }, c4: { t: 'r2v', n: 99 }, c5: null } };
  C.nettoyerConds(d); assert.deepEqual(d.conds, { c1: { t: 'r2v', n: 5 }, c2: { t: 'h07vu' }, c4: { t: 'r2v' } });
  const v = { sys: 'vmc', conds: { c1: { t: 'r2v' } } }; C.nettoyerConds(v); assert.equal('conds' in v, false);
});

/* ---------------- simulation des schémas ---------------- */
const modele = (...ids) => { const s = { folios: [] }; for (const m of ids) SC.appliquerModele(s, m); return s; };
const sym = (sch, rep, t) => { for (const f of sch.folios) { const s = f.syms.find((x) => x.rep === rep && (!t || x.t === t)); if (s) return s; } return null; };
const marche = (r) => r.charges.filter((c) => c.on).map((c) => c.rep).sort().join(',');
function pilote(sch) {
  let R = SIM.simuler(sch, SIM.etatInitial());
  const o = {
    get r() { return R; },
    appui(rep, t) { R = SIM.simuler(sch, SIM.actionner(sch, R.etat, sym(sch, rep, t), true)); return o; },
    lache(rep, t) { R = SIM.simuler(sch, SIM.actionner(sch, R.etat, sym(sch, rep, t), false)); return o; },
    impulsion(rep, t) { return o.appui(rep, t).lache(rep, t); },
    bascule(rep, t) { return o.appui(rep, t); },
  };
  return o;
}
test('simulation : sources, tension entre deux potentiels, court-circuit', () => {
  assert.equal(SIM.sourceDe('L'), 'L1'); assert.equal(SIM.sourceDe('L3'), 'L3'); assert.equal(SIM.sourceDe(' n '), 'N');
  assert.equal(SIM.sourceDe('24V'), 'DC+'); assert.equal(SIM.sourceDe('+24 V'), 'DC+'); assert.equal(SIM.sourceDe('0V'), 'DC-'); assert.equal(SIM.sourceDe('PE'), 'PE'); assert.equal(SIM.sourceDe('X'), null);
  assert.equal(SIM.tension(new Set(['L1']), new Set(['N'])), true); assert.equal(SIM.tension(new Set(['L1']), new Set(['L2'])), true);
  assert.equal(SIM.tension(new Set(['L1']), new Set(['L1'])), false); assert.equal(SIM.tension(new Set(['L1']), new Set(['PE'])), false);
  assert.equal(SIM.etatPoint(new Set(['L1', 'N'])), 'court'); assert.equal(SIM.etatPoint(new Set(['N'])), 'neutre'); assert.equal(SIM.etatPoint(new Set()), null);
  /* un fil qui relie directement L et N : court-circuit signalé */
  const s = { folios: [SC.nouveauFolio('Court', 'libre')] };
  s.folios[0].syms.push({ id: 'a', t: 'pot', x: 50, y: 50, rot: 270, num: 'L' }, { id: 'b', t: 'pot', x: 50, y: 100, rot: 90, num: 'N' });
  s.folios[0].fils.push({ id: 'w', pts: [{ x: 50, y: 50 }, { x: 50, y: 100 }] });
  const r = SIM.simuler(s, SIM.etatInitial());
  assert.equal(r.parFil.get('w'), 'court'); assert.ok(r.alertes.some((a) => a.niveau === 'erreur' && /Court-circuit/.test(a.msg)));
  assert.ok(SIM.simuler({ folios: [SC.nouveauFolio()] }).alertes.some((a) => /Aucune source/.test(a.msg)));
});
test('simulation : démarrage direct (auto-maintien, arrêt, relais thermique, protection)', () => {
  const sch = modele('demarrage'), p = pilote(sch);
  assert.equal(marche(p.r), '', 'au repos');
  assert.equal(p.r.parFil.size > 0 && [...p.r.parFil.values()].includes('phase'), true, 'phases présentes en amont');
  p.appui('S2');
  assert.equal(marche(p.r), 'H1,KM1,M1', 'Marche : contacteur, voyant, moteur');
  const km = sch.folios[0].syms.find((x) => x.rep === 'KM1' && x.t === 'contact_no');
  assert.equal(p.r.contacts.get(km.id).ferme, true, 'contact d’auto-maintien fermé');
  p.lache('S2'); assert.equal(marche(p.r), 'H1,KM1,M1', 'auto-maintien');
  p.impulsion('S1'); assert.equal(marche(p.r), '', 'Arrêt');
  p.impulsion('S2'); assert.equal(marche(p.r), 'H1,KM1,M1');
  p.bascule('F1', 'relth3'); assert.equal(marche(p.r), '', 'relais thermique déclenché : 95-96 ouvert');
  assert.equal(p.r.contacts.get(sym(sch, 'F1', 'contact_th').id).ferme, false);
  p.impulsion('S2'); assert.equal(marche(p.r), '', 'pas de redémarrage tant que le thermique n’est pas réarmé');
  p.bascule('F1', 'relth3').impulsion('S2'); assert.equal(marche(p.r), 'H1,KM1,M1');
  p.bascule('Q1'); assert.equal(marche(p.r), 'H1,KM1', 'sectionneur ouvert : le moteur s’arrête, la commande reste alimentée');
});
test('simulation : inverseur (verrouillage), télérupteur (impulsions), va-et-vient', () => {
  const sch = modele('inversion'), p = pilote(sch);
  p.impulsion('S2'); assert.equal(marche(p.r), 'KM1,M1', 'avant');
  p.impulsion('S3'); assert.equal(marche(p.r), 'KM1,M1', 'arrière refusé : verrouillage par le NF de KM1');
  p.impulsion('S1').impulsion('S3'); assert.equal(marche(p.r), 'KM2,M1', 'arrêt puis arrière');
  const t = modele('telerupteur'), q = pilote(t);
  q.appui('S1'); assert.equal(marche(q.r), 'E1,KL1', 'bobine alimentée, lampe allumée');
  q.lache('S1'); assert.equal(marche(q.r), 'E1', 'reste allumée (mémoire)');
  q.impulsion('S2'); assert.equal(marche(q.r), '', 'autre bouton : éteint');
  q.impulsion('S1'); assert.equal(marche(q.r), 'E1');
  q.bascule('Q1').impulsion('S1'); assert.equal(marche(q.r), 'E1', 'protection ouverte : la commande ne passe plus');
  const v = modele('vaetvient'), w = pilote(v);
  const e0 = marche(w.r);
  w.bascule('S1'); const e1 = marche(w.r); w.bascule('S2'); const e2 = marche(w.r); w.bascule('S1'); const e3 = marche(w.r);
  assert.notEqual(e0, e1); assert.notEqual(e1, e2); assert.notEqual(e2, e3); assert.equal(e0, e2, 'chaque commande inverse l’état');
  assert.ok([e0, e1].includes('E1'));
});

/* ---------------- écran ---------------- */
const planV14 = () => ({
  v: 14, id: 'pV14', name: 'Avant v15', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }, { id: 'L1', name: 'Étage', elev: 270, h: 250, slab: 20 }],
  nodes: [], walls: [], openings: [], dims: [], texts: [], links: [], circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 16, sec: 2.5 }], rcds: [], install: { kva: 9 }, doc: { revisions: [] }, calques: {}, vues: [], schemas: { folios: [] },
  items: [{ id: 'i1', lv: 'L0', type: 'esc_quart', x: 300, y: 300, w: 200, d: 320, rot: 0, tremie: 'aucune' }, { id: 'i2', lv: 'L0', type: 'esc_droit', x: 600, y: 300, w: 90, d: 360, rot: 0, tremie: 'rien' }],
  rooms: [{ id: 'r1', lv: 'L1', name: 'Terrasse', x: 0, y: 0, ext: 'terrasse', sol: 'plein' }, { id: 'r2', lv: 'L1', name: 'X', x: 0, y: 0, ext: 'jardin', sol: 'vide' }],
  elec: [{ id: 'T', lv: 'L0', type: 'tableau', x: 0, y: 0, rot: 0, h: 130, col: 'zz' }, { id: 'm0', lv: 'L0', type: 'traversee', x: 0, y: 10, rot: 0, h: null, col: 'cT', tab: 'T', w: 30, d: 999 }],
  ducts: [{ id: 'd1', lv: 'L0', sys: 'elec', pts: [{ x: 0, y: 0 }, { x: 100, y: 0 }], conds: { c1: { t: 'r2v', n: 5 }, c2: { t: '??' } } }],
});
test('écran : migration v14 → v15 (copie de sécurité, champs invalides retirés, rien de deviné)', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, planV14()); await boot(page);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'); const P = N.P;
    const vers = await new Promise((res) => { const q = indexedDB.open('calque'); q.onsuccess = () => { const t = q.result.transaction('versions').objectStore('versions').getAll(); t.onsuccess = () => res(t.result.map((x) => x.why)); }; });
    return { v: P.v, items: P.items.map((x) => x.tremie || null), rooms: P.rooms.map((x) => [x.ext || null, x.sol || null]), elec: P.elec.map((x) => [x.col || null, x.tab || null, x.w || null, x.d || null]), conds: P.ducts[0].conds, vers };
  });
  assert.equal(r.v, 15);
  assert.ok(r.vers.some((w) => /\(v14 → v15\)/.test(w)), 'copie de sécurité');
  assert.deepEqual(r.items, ['aucune', null]);
  assert.deepEqual(r.rooms, [['terrasse', null], [null, 'vide']]);
  assert.deepEqual(r.elec, [[null, null, null, null], ['cT', 'T', 30, null]]);
  assert.deepEqual(r.conds, { c1: { t: 'r2v', n: 5 } });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('écran : trémie en L, sol supprimé, terrasse (panneau, surfaces, 3D), colonne posée avec le tableau, choix des conducteurs', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 1180, height: 820 } });
  await boot(page);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), M = await import('./js/mutations.js'), G = await import('./js/geometrie.js'), V = await import('./js/vue3d.js'), I = await import('./js/interaction.js'), F = await import('./js/interface.js');
    const S = await import('./js/stockage.js'), Sy = await import('./js/symboles.js');
    N.setP(N.blankPlan('Essai v15')); N.P.levels.push({ id: 'L1', name: 'Étage', elev: 270, h: 250, slab: 20 }); N.touch();
    const W = (lv, pts, o) => { for (let i = 0; i < pts.length; i++) M.addWall(lv, pts[i], pts[(i + 1) % pts.length], o || { th: 20, kind: 'mur' }); };
    const R = [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 600 }, { x: 0, y: 600 }];
    W('L0', R); W('L1', R);
    /* terrasse de l'étage : au-delà de la façade, rien au rez-de-chaussée */
    for (const [a, b] of [[{ x: 600, y: 0 }, { x: 900, y: 0 }], [{ x: 900, y: 0 }, { x: 900, y: 300 }], [{ x: 900, y: 300 }, { x: 600, y: 300 }]]) M.addWall('L1', a, b, { th: 10, kind: 'mur' });
    N.touch(); G.syncRooms();
    /* escalier en L au rez-de-chaussée : trémie à l'étage */
    const st = I.makeItemFromDef(Sy.FURN_BY.get('escQ'), 'L0'); Object.assign(st, { x: 300, y: 300, w: 200, d: 360, e: 90 }); N.P.items.push(st); N.touch();
    const salle = G.geo('L1').rooms.find((x) => N.inPoly({ x: 300, y: 300 }, x.loop));
    const trous = V.tremieHoles(salle, [V.stairFootprint(st)]);
    const aireTrous = trous.reduce((s, t) => s + Math.abs(N.polyArea(t)), 0);
    /* panneau de la pièce de l'étage (terrasse) */
    N.ui.lv = 'L1';
    const ter = G.geo('L1').rooms.find((x) => N.inPoly({ x: 750, y: 150 }, x.loop));
    N.ui.sel = { t: 'room', id: ter.label.id }; N.ui.inspOpen = true; F.renderInspector();
    const avant = document.getElementById('lvArea').textContent;
    return { aireTrous, rect: 200 * 360, nTrous: trous.length, terId: ter.label.id, avant, n3d: V.build3D ? 1 : 0 };
  });
  assert.equal(r.nTrous, 1, 'escalier entièrement dans la pièce : un seul trou, à la forme de l’escalier');
  assert.ok(Math.abs(r.aireTrous - (200 * 360 - 110 * 270)) < 1, `trémie ${r.aireTrous} au lieu du rectangle ${r.rect}`);
  await page.click('#insp >> text=Terrasse'); await wait(page, 200);
  const t = await page.evaluate(async (id) => { const N = await import('./js/noyau.js'); return { ext: N.IDX.rooms.get(id).ext, name: N.IDX.rooms.get(id).name, area: document.getElementById('lvArea').textContent }; }, r.terId);
  assert.equal(t.ext, 'terrasse'); assert.equal(t.name, 'Terrasse');
  assert.ok(t.area !== r.avant, 'surface du niveau sans la terrasse');
  await page.click('#insp >> text=Murs du pourtour en garde-corps (100 cm)'); await wait(page, 200);
  const gc = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return N.P.walls.filter((w) => w.lv === 'L1' && w.h === 100).length; });
  assert.equal(gc, 3, 'les trois murs de la terrasse, pas la façade');
  await page.click('#insp >> text=Supprimé (trémie, vide)'); await wait(page, 200);
  const sol = await page.evaluate(async (id) => (await import('./js/noyau.js')).IDX.rooms.get(id).sol, r.terId);
  assert.equal(sol, 'vide');
  /* vue 3D construite sans erreur (trémie, terrasse, sol supprimé), en visite aussi */
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), V = await import('./js/vue3d.js'); N.S.v3 = Object.assign(N.S.v3 || {}, { mode: 'visit' }); V.build3D(); N.S.v3.mode = 'orbit'; V.build3D(); });
  /* tableau posé depuis la bibliothèque sur un plan à deux niveaux : colonne créée d'office */
  const c = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), Sy = await import('./js/symboles.js'), I = await import('./js/interaction.js'), F = await import('./js/interface.js');
    N.ui.lv = 'L0'; N.ui.place = { kind: 'elec', def: Sy.ELEC_BY.get('tableau') }; I.placeFromCatalog({ x: 20, y: 300 });
    const T = N.P.elec.find((e) => e.type === 'tableau');
    const m = N.P.elec.filter((e) => e.type === 'traversee' && e.tab === T.id);
    F.renderInspector();
    return { n: m.length, lv: m.map((x) => x.lv).sort(), sec: document.getElementById('insp').textContent.includes('Colonne de passage') };
  });
  assert.equal(c.n, 2); assert.deepEqual(c.lv, ['L0', 'L1']); assert.ok(c.sec, 'section dans le panneau du tableau');
  await page.click('#insp >> text=Retirer la colonne'); await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.elec.filter((e) => e.type === 'traversee').length), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('écran : plan d’exemple, choix des conducteurs dans le gestionnaire de circuits, mode Tester des schémas (iPad)', async () => {
  for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
    const { ctx, page, errors } = await fresh({ viewport: vp });
    await boot(page);
    /* gestionnaire de circuits : choix « fils » dans une gaine */
    const cid = await page.evaluate(async () => {
      const N = await import('./js/noyau.js'), CU = await import('./js/circuitsui.js');
      const d = N.P.ducts.find((x) => x.conds); const cid = Object.keys(d.conds)[0];
      if (CU.selectionner) CU.selectionner(cid, false);
      return cid;
    });
    const sel = await page.$('select[data-gaine]');
    if (sel) {
      const did = await sel.getAttribute('data-gaine');
      await sel.selectOption('r2v'); await wait(page, 200);
      const v = await page.evaluate(async ([did, cid]) => (await import('./js/noyau.js')).IDX.ducts.get(did).conds[cid], [did, cid]);
      assert.deepEqual(v, { t: 'r2v' });
    }
    /* onglet Schémas : mode Tester sur le folio « Démarrage direct » */
    await page.click('.vtab[data-view=schema]'); await wait(page, 400);
    await page.click('#schTester'); await wait(page, 300);
    assert.equal(await page.isVisible('#schHint'), true);
    const pos = await page.evaluate(async () => {
      const U = await import('./js/schemaui.js'), N = await import('./js/noyau.js');
      const f = N.P.schemas.folios[0], s = f.syms.find((x) => x.rep === 'S2'), V = U.ETAT_SCHEMA.V, r = document.getElementById('schCv').getBoundingClientRect();
      return { x: r.left + V.ox + s.x * V.s - 3 * V.s, y: r.top + V.oy + s.y * V.s };
    });
    await page.mouse.move(pos.x, pos.y); await page.mouse.down(); await wait(page, 250);
    const pendant = await page.evaluate(async () => { const U = await import('./js/schemaui.js'); return U.ETAT_SCHEMA.simR.charges.filter((c) => c.on).map((c) => c.rep).sort().join(','); });
    await page.mouse.up(); await wait(page, 250);
    const apres = await page.evaluate(async () => { const U = await import('./js/schemaui.js'); return { on: U.ETAT_SCHEMA.simR.charges.filter((c) => c.on).map((c) => c.rep).sort().join(','), insp: document.getElementById('schInsp').textContent, ow: document.documentElement.scrollWidth <= window.innerWidth + 1 }; });
    assert.ok(pendant.includes('KM1'), `appui sur Marche : ${pendant}`);
    assert.ok(apres.on.includes('KM1'), 'auto-maintien après avoir lâché');
    assert.ok(apres.insp.includes('Mode test') && apres.insp.includes('enclenché'));
    assert.ok(apres.ow, 'pas de défilement horizontal');
    await page.click('#schInsp >> text=Quitter le test'); await wait(page, 200);
    assert.equal(await page.evaluate(async () => (await import('./js/schemaui.js')).ETAT_SCHEMA.test), false);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

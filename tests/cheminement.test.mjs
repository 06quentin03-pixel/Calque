// Tests de la phase 4 : cheminements (types, pose, verticales, passages entre étages), format des plans v6.
// Lancer depuis la racine du dépôt :  node --test tests/cheminement.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, fresh, wait, boot, seedPlan, storedPlan, idb } from './outils.mjs';

const CH = await import(path.join(ROOT, 'js', 'cheminement.js'));

/* plan au format v5 (fin de la phase 3) : deux niveaux, un tableau, deux prises, une gaine, des champs v6 invalides */
function planV5(id) {
  return { v: 5, id, name: 'Plan v5', levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }, { id: 'L1', name: 'Étage', elev: 270, h: 250, slab: 20 }],
    nodes: [], walls: [], openings: [], items: [], rooms: [], dims: [], texts: [], links: [], comps: [], fonds: [], fondImg: {},
    elec: [{ id: 't', lv: 'L0', type: 'tableau', x: 100, y: 100, rot: 0, h: 130 },
      { id: 'p1', lv: 'L0', type: 'pc', x: 500, y: 100, rot: 0, h: 30, cid: 'c1' },
      { id: 'p2', lv: 'L0', type: 'pc', x: 500, y: 400, rot: 0, h: 30, cid: 'c1', to: 'x' }],
    ducts: [{ id: 'g1', lv: 'L0', sys: 'elec', dia: 20, a: 't', b: 'p1', cid: 'c1', pts: [{ x: 100, y: 100 }, { x: 500, y: 100 }], kind: 'cuivre', pose: 'mur', cids: ['c1', 3] },
      { id: 'v1', lv: 'L0', sys: 'vmc', dia: 125, mat: 'souple', pts: [{ x: 0, y: 0 }, { x: 0, y: 300 }], kind: 'icta' }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5, rcd: 'r1', dda: false, ctrl: null, calc: { dcab: { v: -2 }, len: { v: 8, st: 'saisie' } } }],
    rcds: [{ id: 'r1', type: 'A', cal: 40 }], install: { kva: 9, parafoudre: false, row: 13, reserve: { v: 250 } } };
}

test('cheminement (sans écran) : hauteurs, verticales, pose non précisée, passages, nettoyage', () => {
  const p = planV5('n');
  const g = p.ducts[0];
  /* sans pose : longueur horizontale seule, verticales signalées « non comptées » */
  let L = CH.longueurGaine(p, g);
  assert.equal(L.horiz, CH.longueurGaine(p, g).horiz);
  assert.equal(L.vert, 0); assert.equal(L.inconnu, 2, 'deux verticales non comptées');
  /* pose au sol : remonte au tableau (130 cm) et à la prise (30 cm) */
  g.pose = 'sol'; L = CH.longueurGaine(p, g);
  assert.equal(L.inconnu, 0); assert.equal(L.vert, 160);
  assert.ok(Math.abs(L.total - (L.horiz + 160)) < 1e-9);
  /* au plafond (250 cm) : 120 + 220 */
  g.pose = 'plafond'; assert.equal(CH.longueurGaine(p, g).vert, 340);
  /* à une hauteur donnée */
  g.pose = 'hauteur'; g.z = 30; assert.equal(CH.longueurGaine(p, g).vert, 100);
  /* hauteurs des symboles : valeur par défaut « estimée », plafond, sol, passage sans hauteur */
  assert.deepEqual(CH.hauteurSymbole(p, p.elec[1]).st, 'estimee');
  assert.equal(CH.hauteurSymbole(p, { ...p.elec[1], h: 45 }).st, 'saisie');
  assert.equal(CH.hauteurSymbole(p, { id: 'l', lv: 'L1', type: 'pl', h: null }).z, 250);
  assert.equal(CH.hauteurSymbole(p, { id: 's', lv: 'L0', type: 'pc_sol', h: null }).z, 0);
  assert.ok(CH.hauteurSymbole(p, { id: 'w', lv: 'L0', type: 'traversee', h: null }).libre);
  /* passages jumeaux : chacun désigne l'autre, sur deux niveaux différents */
  const a = { id: 'ta', lv: 'L0', type: 'traversee', x: 0, y: 0, to: 'tb' }, b = { id: 'tb', lv: 'L1', type: 'traversee', x: 0, y: 0, to: 'ta' };
  const pp = { ...p, elec: [...p.elec, a, b] };
  assert.equal(CH.jumelle(pp, a).id, 'tb');
  assert.equal(CH.jumelle({ ...pp, elec: [a] }, a), null, 'jumeau supprimé');
  /* tailles et sections nominales */
  assert.equal(CH.tailleChemin({ sys: 'elec', kind: 'goulotte', lw: 60, lh: 40 }), '60 × 40 mm');
  assert.equal(CH.sectionNominale({ sys: 'elec', kind: 'goulotte', lw: 60, lh: 40 }), 2400);
  assert.equal(CH.sectionNominale({ sys: 'elec', kind: 'goulotte' }), null, 'dimensions inconnues : pas de section devinée');
  assert.ok(Math.abs(CH.sectionNominale({ sys: 'elec', kind: 'icta', dia: 20 }) - Math.PI * 100) < 1e-9);
  assert.equal(CH.nomChemin({ sys: 'elec' }), 'Gaine électrique (type non précisé)');
  /* nettoyage */
  const n = CH.nettoyerGaine({ sys: 'elec', cid: 'c1', kind: 'xx', pose: 'mur', z: -3, lw: 'a', cids: ['c1', 'c2', 'c2', 4] });
  assert.deepEqual(n, { sys: 'elec', cid: 'c1', cids: ['c2'] });
  assert.equal(CH.nettoyerZone({ id: 'z', lv: 'L0', pts: [{ x: 0, y: 0 }, { x: 1, y: 0 }] }), null);
});

test('migration v5 → v6 : rien de deviné, valeurs invalides retirées, copie de sécurité avant mise à jour', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, planV5('pC5'));
  await boot(page);
  const m = await page.evaluate(async (p) => {
    const S = await import('./js/stockage.js');
    const a = S.migratePlan(JSON.parse(JSON.stringify(p)));
    const b = S.migratePlan(JSON.parse(JSON.stringify(a.plan)));
    return { ver: S.PLAN_VERSION, has: Object.keys(S.MIGRATIONS).map(Number), a, b };
  }, planV5('x'));
  assert.equal(m.ver, 6);
  for (let v = 1; v < m.ver; v++) assert.ok(m.has.includes(v), `migration ${v} → ${v + 1}`);
  const q = m.a.plan;
  assert.equal(m.a.from, 5); assert.equal(q.v, 6);
  assert.deepEqual(q.ducts[0], { id: 'g1', lv: 'L0', sys: 'elec', dia: 20, a: 't', b: 'p1', cid: 'c1', pts: [{ x: 100, y: 100 }, { x: 500, y: 100 }] }, 'type et pose invalides retirés, aucun ajouté');
  assert.ok(!('kind' in q.ducts[1]), 'conduit de VMC : pas de type de gaine');
  assert.ok(!('to' in q.elec[2]), 'un symbole qui n’est pas un passage ne garde pas « to »');
  assert.deepEqual(q.zones, []);
  assert.deepEqual(q.circuits[0].calc, { len: { v: 8, st: 'saisie' } });
  assert.ok(!('reserve' in q.install), 'réserve invalide retirée, aucune réserve ajoutée');
  assert.deepEqual(m.b.plan, q, 'migration sans effet sur un plan à jour');
  /* le plan ouvert est passé en v6, et la version v5 d'origine est gardée dans l'historique */
  await wait(page, 800);
  const vers = await idb(page, 'versions');
  const v = vers.find((x) => x.pid === 'pC5' && /avant mise à jour du format \(v5 → v6\)/.test(x.why));
  assert.ok(v, 'copie de sécurité avant mise à jour du format');
  const vd = await idb(page, 'vdata', v.k);
  assert.equal(JSON.parse(vd.json).v, 5, 'la copie est le plan d’origine, en v5');
  assert.equal(JSON.parse(vd.json).ducts[0].kind, 'cuivre', 'copie intacte (avant nettoyage)');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('inspecteur : type, pose et longueurs d’une gaine ; passage entre étages relié et annulable', async () => {
  const { ctx, page, errors } = await fresh({ touch: true });
  const p = planV5('pC6'); p.ducts[0].kind = undefined; delete p.ducts[0].kind; delete p.ducts[0].pose; delete p.ducts[0].cids;
  await seedPlan(ctx, p);
  await boot(page);
  const sel = (t, id) => page.evaluate(async ([t, id]) => { const I = await import('./js/interaction.js'); I.select({ t, id }); }, [t, id]);
  await sel('duct', 'g1'); await wait(page, 300);
  const insp = () => page.textContent('#insp');
  assert.match(await insp(), /Gaine électrique \(type non précisé\)/);
  assert.match(await insp(), /2 verticales non comptées/);
  await page.click('#insp .sec:has(h3:has-text("Type de cheminement")) .chip:has-text("IRL")'); await wait(page, 200);
  await page.click('#insp .sec:has(h3:has-text("Pose")) button:has-text("Sol")'); await wait(page, 300);
  let t = await insp();
  assert.match(t, /Tube IRL/);
  assert.match(t, /1,3 m \+ 0,3 m|1,30 m \+ 0,30 m/, 'verticales : tableau 130 cm, prise 30 cm');
  assert.ok(!/non comptée/.test(t));
  /* goulotte : dimensions à saisir, pas de diamètre */
  await page.click('#insp .sec:has(h3:has-text("Type de cheminement")) .chip:has-text("Goulotte")'); await wait(page, 200);
  assert.match(await insp(), /Dimensions non indiquées/);
  await page.fill('#f-dlw', '60'); await page.press('#f-dlw', 'Enter'); await wait(page, 150);
  await page.fill('#f-dlh', '40'); await page.press('#f-dlh', 'Enter'); await wait(page, 1400);
  let st = await storedPlan(page, 'pC6');
  const g = st.ducts.find((d) => d.id === 'g1');
  assert.equal(g.kind, 'goulotte'); assert.equal(g.pose, 'sol'); assert.equal(g.lw, 60); assert.equal(g.lh, 40); assert.ok(!('dia' in g));
  assert.equal(st.v, 6);
  /* la prochaine gaine reprend le dernier type et la dernière pose choisis */
  const S = await page.evaluate(() => JSON.parse(localStorage.getItem('calque.settings')));
  assert.equal(S.ductKind, 'goulotte'); assert.equal(S.ductPose, 'sol');
  /* passage entre étages : un symbole sur le rez-de-chaussée, relié à l'étage */
  await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), I = await import('./js/interaction.js');
    N.P.elec.push({ id: 'tr', lv: 'L0', type: 'traversee', x: 300, y: 300, rot: 0, h: null }); N.touch(); I.commit(); I.select({ t: 'elec', id: 'tr' });
  });
  await wait(page, 300);
  assert.match(await insp(), /Choisissez le niveau à relier/);
  await page.click('#insp .sec:has(h3:has-text("Passage entre étages")) button:has-text("Étage")'); await wait(page, 300);
  assert.match(await insp(), /Relié à « Étage »/);
  const tw = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const a = N.IDX.elec.get('tr'); const b = N.IDX.elec.get(a.to); return b && { lv: b.lv, to: b.to, x: b.x, y: b.y, type: b.type }; });
  assert.deepEqual(tw, { lv: 'L1', to: 'tr', x: 300, y: 300, type: 'traversee' });
  await page.evaluate(async () => (await import('./js/interaction.js')).undo()); await wait(page, 300);
  const after = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { to: N.IDX.elec.get('tr').to, n: N.P.elec.filter((e) => e.type === 'traversee').length }; });
  assert.deepEqual(after, { to: undefined, n: 1 }, 'annuler retire le jumeau et la liaison');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* plan de calcul des longueurs : tableau (130 cm), deux prises du circuit c1 (30 cm) en chaîne dans le sol,
   un passage vers l'étage, un point lumineux au plafond de l'étage (circuit c2) */
function planLongueurs() {
  return { v: 6, levels: [{ id: 'L0', elev: 0, h: 250 }, { id: 'L1', elev: 270, h: 250 }],
    elec: [{ id: 't', lv: 'L0', type: 'tableau', x: 100, y: 100, rot: 0, h: 130 },
      { id: 'p1', lv: 'L0', type: 'pc', x: 500, y: 100, rot: 0, h: 30, cid: 'c1' }, { id: 'p2', lv: 'L0', type: 'pc', x: 500, y: 400, rot: 0, h: 30, cid: 'c1' },
      { id: 'ta', lv: 'L0', type: 'traversee', x: 100, y: 400, to: 'tb' }, { id: 'tb', lv: 'L1', type: 'traversee', x: 100, y: 400, to: 'ta' },
      { id: 'l1', lv: 'L1', type: 'pl', x: 300, y: 400, h: null, cid: 'c2' }],
    ducts: [{ id: 'g1', lv: 'L0', sys: 'elec', pose: 'sol', a: 't', b: 'p1', cid: 'c1', pts: [{ x: 100, y: 100 }, { x: 500, y: 100 }] },
      { id: 'g2', lv: 'L0', sys: 'elec', pose: 'sol', a: 'p1', b: 'p2', cid: 'c1', pts: [{ x: 500, y: 100 }, { x: 500, y: 400 }] },
      { id: 'g3', lv: 'L0', sys: 'elec', pose: 'plafond', a: 't', b: 'ta', pts: [{ x: 100, y: 100 }, { x: 100, y: 400 }] },
      { id: 'g4', lv: 'L1', sys: 'elec', pose: 'sol', a: 'tb', b: 'l1', pts: [{ x: 100, y: 400 }, { x: 300, y: 400 }] }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5 }, { id: 'c2', kind: 'eclairage', name: 'Éclairage étage', cal: 16, sec: 1.5 }], install: {} };
}

test('longueurs (sans écran) : verticales, chaîne de prises, passage entre étages, circuits séparés, réserve', async () => {
  const p = planLongueurs();
  /* c1 : 130 (descente du tableau) + 400 + 30 (remontée) = 560 jusqu'à p1 ; puis 30 + 300 + 30 → 920 jusqu'à p2 */
  let r = CH.cheminCircuit(p, 'c1');
  assert.ok(r.complet); assert.deepEqual(r.points.map((x) => x.dist), [560, 920]);
  assert.equal(r.Lmax, 920); assert.equal(r.arbre, 920); assert.equal(r.vert, 220); assert.equal(r.inconnues, 0);
  assert.deepEqual(r.ducts.sort(), ['g1', 'g2']);
  assert.ok(Math.abs(r.Lgeo - Math.hypot(400, 300 + 12.6, 100) ) < 15, 'vol d’oiseau jusqu’à p2 (ordre de grandeur)');
  /* c2 : gaines sans circuit (utilisables par tous) ; plafond du rez (250) → sol de l'étage (270) : 20 cm de traversée ;
     120 (tableau → plafond) + 20 + 250 (remontée au plafond de l'étage) = 390 cm de verticales */
  r = CH.cheminCircuit(p, 'c2');
  assert.ok(r.complet); assert.equal(Math.round(r.vert), 390);
  assert.equal(Math.round(r.Lmax), Math.round(r.horiz + r.vert));
  /* une gaine réservée à un autre circuit n'est pas empruntée */
  const q = planLongueurs(); q.ducts[2].cid = 'c1';
  r = CH.cheminCircuit(q, 'c2');
  assert.ok(!r.complet); assert.match(r.raison, /Aucun point du circuit/);
  /* on ne traverse pas la prise d'un autre circuit : p1 et p2 passent au circuit c3, c1 n'a plus de point */
  const q2 = planLongueurs(); q2.elec[1].cid = 'c3'; q2.elec[2].cid = 'c1'; q2.ducts[0].cid = null; q2.ducts[1].cid = null;
  r = CH.cheminCircuit(q2, 'c1');
  assert.ok(!r.complet, 'la prise d’un autre circuit n’est pas un point de passage');
  /* pose non précisée : verticales non comptées, signalées */
  const q3 = planLongueurs(); delete q3.ducts[0].pose;
  r = CH.cheminCircuit(q3, 'c1');
  assert.ok(r.complet); assert.equal(r.inconnues, 2); assert.equal(r.points[0].dist, 400);
  /* jonction : une gaine qui part d'un point libre posé sur une autre gaine s'y raccorde */
  const q4 = planLongueurs(); q4.elec.push({ id: 'p3', lv: 'L0', type: 'pc', x: 300, y: 300, rot: 0, h: 30, cid: 'c1' });
  q4.ducts.push({ id: 'g5', lv: 'L0', sys: 'elec', pose: 'sol', a: null, b: 'p3', cid: 'c1', pts: [{ x: 101, y: 300 }, { x: 300, y: 300 }] });
  r = CH.cheminCircuit(q4, 'c1');
  assert.ok(r.complet, 'p3 atteinte par la jonction sur la gaine g3 (sans circuit)');
  /* jonction plafond (g3) → sol (g5) : une verticale de 250 cm au point de jonction */
  assert.ok(r.edges.some((e) => e.kind === 'jonction' && Math.abs(e.v - 250) < 1e-9));
  /* réserve : 10 % par défaut, « estimée » ; longueur à commander arrondie au mètre supérieur */
  assert.equal(CH.reserveDe(p).st, 'estimee'); assert.equal(CH.reserveDe(p).v, 10);
  assert.equal(CH.aCommander(920, CH.reserveDe(p)), 11);
  assert.equal(CH.aCommander(920, { v: 0 }), 10);
  assert.equal(CH.reserveDe({ install: { reserve: { v: 15, st: 'saisie' } } }).v, 15);
  /* longueur L pour la fiche de calcul : estimée depuis le plan, remplacée par une saisie */
  const K = await import(path.join(ROOT, 'js', 'calcul.js'));
  let en = K.entreesDuPlan(p, p.circuits[0]);
  assert.deepEqual([en.L.v, en.L.st], [9.2, 'estimee']); assert.match(en.L.src, /Cheminement du plan/);
  const f = K.ficheCircuit({ ...en, P: { v: 3680, st: 'saisie' }, cos: { v: 1, st: 'saisie' } });
  assert.ok(f.hypotheses.some((x) => /mesurée sur le plan/.test(x)));
  p.circuits[0].calc = { len: { v: 15, st: 'saisie' } };
  en = K.entreesDuPlan(p, p.circuits[0]);
  assert.deepEqual([en.L.v, en.L.st], [15, 'saisie'], 'la saisie remplace la longueur du plan');
  assert.equal(en.Lplan.v, 9.2);
  const q5 = planLongueurs(); q5.ducts = [];
  en = K.entreesDuPlan(q5, q5.circuits[0]);
  assert.equal(en.L, null, 'sans gaines : aucune longueur devinée');
});

test('onglet Cheminements et fiche : longueurs du plan, réserve saisie et enregistrée', async () => {
  const { ctx, page, errors } = await fresh({ touch: true });
  const p = Object.assign(planLongueurs(), { id: 'pC7', name: 'Plan longueurs', nodes: [], walls: [], openings: [], items: [], rooms: [], dims: [], texts: [], links: [], comps: [], fonds: [], fondImg: {}, zones: [],
    rcds: [{ id: 'r1', type: 'A', cal: 40 }] });
  p.levels = p.levels.map((l, i) => ({ ...l, name: i ? 'Étage' : 'Rez-de-chaussée', slab: 20 })); p.circuits.forEach((c) => { c.rcd = 'r1'; });
  await seedPlan(ctx, p);
  await boot(page);
  await page.click('.vtab[data-view="elec"]'); await wait(page, 300);
  await page.click('#evBar button:has-text("Cheminements")'); await wait(page, 300);
  const row = (cid) => page.textContent(`#evCanvas tr[data-cid="${cid}"]`);
  const r1 = await row('c1');
  assert.match(r1, /2 \/ 2/); assert.match(r1, /9,2 m/); assert.match(r1, /11 m/); assert.match(r1, /Estimée/);
  assert.match(await page.textContent('#evCanvas'), /2 \/ 2/);
  await page.fill('#fi-reserve', '20'); await page.press('#fi-reserve', 'Enter'); await wait(page, 300);
  assert.match(await row('c1'), /12 m/, '9,2 m + 20 % = 11,04 → 12 m');
  await page.locator('#evCanvas tr[data-cid="c1"] .btn:has-text("Fiche")').click(); await wait(page, 300);
  const t = await page.textContent('#modal');
  assert.match(t, /Sans saisie, la longueur mesurée sur le plan est utilisée : 9,2 m/);
  assert.match(t, /Chute de tension/);
  await wait(page, 1200);
  const st = await storedPlan(page, 'pC7');
  assert.deepEqual(st.install.reserve, { v: 20, st: 'saisie' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* deux pièces de 3 m × 4 m séparées par une cloison avec une porte (y de 155 à 245) */
function planPieces(extra = {}) {
  const N = [['a', 0, 0], ['b', 600, 0], ['c', 600, 400], ['d', 0, 400], ['e', 300, 0], ['f', 300, 400]].map(([id, x, y]) => ({ id, lv: 'L0', x, y }));
  const W = [['a', 'b', 'mur', 20], ['b', 'c', 'mur', 20], ['c', 'd', 'mur', 20], ['d', 'a', 'mur', 20], ['e', 'f', 'cloison', 7]].map(([a, b, kind, th], i) => ({ id: 'w' + i, lv: 'L0', a, b, kind, th }));
  return Object.assign({ v: 6, levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }], nodes: N, walls: W,
    openings: [{ id: 'o', wall: 'w4', t: 200, w: 90, kind: 'door', type: 'interieure', side: 1, hinge: 0, leaves: 1, h: 215, sill: 0 }],
    elec: [], ducts: [], zones: [], items: [], rooms: [], dims: [], texts: [], links: [], comps: [], fonds: [], fondImg: {}, circuits: [], rcds: [], install: {} }, extra);
}

test('itinéraire et conflits (sans écran) : murs, porte, zone interdite, VMC', async () => {
  const I = await import(path.join(ROOT, 'js', 'itineraire.js'));
  const p = planPieces();
  /* au sol : traverse la cloison (moins long que le détour par la porte) */
  let r = I.chercherItineraire(p, 'L0', { x: 50, y: 50 }, { x: 550, y: 50 }, { pose: 'sol' });
  assert.ok(r); assert.equal(r.cloisons, 1); assert.equal(r.murs, 0); assert.equal(Math.round(r.len), 500);
  /* zone interdite entre les deux points : contournée, et la gaine obtenue ne la traverse pas */
  p.zones = [{ id: 'z', lv: 'L0', name: 'Trémie', pts: [{ x: 100, y: 10 }, { x: 200, y: 10 }, { x: 200, y: 330 }, { x: 100, y: 330 }] }];
  r = I.chercherItineraire(p, 'L0', { x: 50, y: 50 }, { x: 550, y: 50 }, { pose: 'sol' });
  assert.ok(r && r.pts.length > 2, 'détour');
  const d = { id: 'g', lv: 'L0', sys: 'elec', pose: 'sol', pts: r.pts };
  assert.ok(!I.conflitsGaine(p, d).some((c) => c.kind === 'zone'), 'la zone est évitée');
  /* point d'arrivée enfermé dans une zone : aucun itinéraire (rien d'inventé) */
  p.zones.push({ id: 'z2', lv: 'L0', pts: [{ x: 480, y: 15 }, { x: 590, y: 15 }, { x: 590, y: 120 }, { x: 480, y: 120 }] });
  assert.equal(I.chercherItineraire(p, 'L0', { x: 50, y: 50 }, { x: 550, y: 50 }, { pose: 'sol' }), null);
  /* conflits d'une gaine droite à 30 cm du sol (plinthe) : porte coupée, zone traversée, cloison */
  const p2 = planPieces({ zones: [{ id: 'z', lv: 'L0', pts: [{ x: 100, y: 150 }, { x: 200, y: 150 }, { x: 200, y: 250 }, { x: 100, y: 250 }] }],
    ducts: [{ id: 'v', lv: 'L0', sys: 'vmc', dia: 125, pts: [{ x: 450, y: 50 }, { x: 450, y: 350 }] }] });
  const g = { id: 'g', lv: 'L0', sys: 'elec', pose: 'hauteur', z: 30, pts: [{ x: 50, y: 200 }, { x: 550, y: 200 }] };
  const kinds = (x) => I.conflitsGaine(p2, x).map((c) => c.kind + ':' + c.sev).sort();
  assert.deepEqual(kinds(g), ['porte:warn', 'reseau:info', 'zone:warn']);
  g.pose = 'sol'; delete g.z;
  assert.deepEqual(kinds(g), ['reseau:info', 'zone:warn'], 'au sol, la porte n’est pas gênée');
  delete g.pose;
  assert.deepEqual(kinds(g), ['porte:info', 'reseau:info', 'zone:warn'], 'pose non précisée : à vérifier');
  g.pts = [{ x: 50, y: 50 }, { x: 550, y: 50 }]; g.pose = 'sol';
  assert.deepEqual(kinds(g), ['cloison:info'], 'traversée de cloison signalée');
  /* à une hauteur donnée, la porte est infranchissable : le chemin traverse la cloison ailleurs */
  r = I.chercherItineraire(planPieces(), 'L0', { x: 50, y: 200 }, { x: 550, y: 200 }, { pose: 'hauteur' });
  assert.ok(r); assert.ok(!I.conflitsGaine(planPieces(), { id: 'h', lv: 'L0', sys: 'elec', pose: 'hauteur', z: 30, pts: r.pts }).some((c) => c.kind === 'porte'));
});

test('plan : zone interdite dessinée au doigt, itinéraire proposé puis créé, longueur dans la fiche', async () => {
  const { ctx, page, errors } = await fresh({ touch: true });
  const p = planPieces({ id: 'pC8', name: 'Plan itinéraire',
    elec: [{ id: 't', lv: 'L0', type: 'tableau', x: 40, y: 10, rot: 0, h: 130 }, { id: 'p1', lv: 'L0', type: 'pc', x: 560, y: 10, rot: 0, h: 30, cid: 'c1' }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5, rcd: 'r1', dda: false, ctrl: null }], rcds: [{ id: 'r1', type: 'A', cal: 40 }] });
  await seedPlan(ctx, p);
  await boot(page);
  const tapW = async (x, y) => {
    const s = await page.evaluate(async ([x, y]) => { const R = await import('./js/rendu2d.js'); const r = document.getElementById('cv').getBoundingClientRect(); const q = R.w2s({ x, y }); return { x: q.x + r.left, y: q.y + r.top }; }, [x, y]);
    await page.touchscreen.tap(s.x, s.y); await wait(page, 120);
  };
  /* zone interdite : outil depuis la barre de l'outil Conduit (gaine électrique) */
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); N.S.ductSys = 'elec'; (await import('./js/interface.js')).setTool('duct'); });
  await wait(page, 200);
  await page.click('#hint button:has-text("Zone interdite")'); await wait(page, 200);
  for (const [x, y] of [[100, 15], [200, 15], [200, 330], [100, 330]]) await tapW(x, y);
  await page.click('#hint button:has-text("Terminer")'); await wait(page, 300);
  assert.match(await page.textContent('#insp'), /Zone interdite/);
  let z = await page.evaluate(async () => (await import('./js/noyau.js')).P.zones);
  assert.equal(z.length, 1); assert.equal(z[0].pts.length, 4);
  /* sélection de la zone en la touchant, puis nom */
  await page.evaluate(async () => (await import('./js/interaction.js')).select(null)); await wait(page, 100);
  await tapW(120, 310); // loin du nom de la pièce (prioritaire)
  assert.match(await page.textContent('#insp'), /Les itinéraires proposés évitent cette zone/);
  await page.fill('#f-zname', 'Trémie'); await page.press('#f-zname', 'Enter'); await wait(page, 200);
  /* itinéraire depuis l'inspecteur de la prise */
  await page.evaluate(async () => (await import('./js/interaction.js')).select({ t: 'elec', id: 'p1' })); await wait(page, 300);
  assert.match(await page.textContent('#insp'), /Pas encore raccordé au tableau/);
  await page.click('#insp button:has-text("Proposer un itinéraire")'); await wait(page, 300);
  assert.match(await page.textContent('#hint'), /Itinéraire proposé/);
  await page.click('#hint button:has-text("Créer la gaine")'); await wait(page, 400);
  const g = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const d = N.P.ducts[N.P.ducts.length - 1]; return { a: d.a, b: d.b, cid: d.cid, sys: d.sys, n: d.pts.length, pts: d.pts }; });
  assert.deepEqual([g.a, g.b, g.cid, g.sys], ['t', 'p1', 'c1', 'elec']);
  assert.ok(g.n > 2, 'la gaine contourne la zone');
  const I = await import(path.join(ROOT, 'js', 'itineraire.js'));
  const st0 = await page.evaluate(async () => JSON.parse(JSON.stringify((await import('./js/noyau.js')).P)));
  assert.ok(!I.conflitsGaine(st0, st0.ducts[st0.ducts.length - 1]).some((c) => c.kind === 'zone'));
  assert.match(await page.textContent('#insp'), /Conflits/);
  /* le circuit est raccordé : la fiche reçoit une longueur estimée */
  const L = await page.evaluate(async () => { const K = await import('./js/calcul.js'), N = await import('./js/noyau.js'); return K.entreesDuPlan(N.P, N.P.circuits[0]).L; });
  assert.equal(L.st, 'estimee'); assert.ok(L.v > 5);
  await wait(page, 1200);
  const st = await storedPlan(page, 'pC8');
  assert.equal(st.zones[0].name, 'Trémie');
  /* annuler : la gaine disparaît, la zone reste */
  await page.evaluate(async () => (await import('./js/interaction.js')).undo()); await wait(page, 200);
  z = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { d: N.P.ducts.length, z: N.P.zones.length }; });
  assert.deepEqual(z, { d: 0, z: 1 });
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('remplissage et liste de matériel (sans écran) : toujours « vérification nécessaire », rien de deviné', async () => {
  const M = await import(path.join(ROOT, 'js', 'materiel.js'));
  const N = await import(path.join(ROOT, 'js', 'normes.js'));
  const p = planLongueurs();
  let r = M.remplissageGaines(p);
  const g1 = r.find((x) => x.id === 'g1'), g3 = r.find((x) => x.id === 'g3');
  assert.deepEqual(g1.circuits, ['c1']); assert.deepEqual(g3.circuits, ['c2'], 'gaine sans circuit empruntée par c2');
  assert.equal(g1.taux, null, 'type, diamètre et câble inconnus : pas de taux');
  assert.ok(g1.manquantes.some((m) => /type/.test(m)) && g1.manquantes.some((m) => /diamètre extérieur du câble/.test(m)));
  assert.equal(g1.controle.statut, 'verification');
  assert.ok(!N.tableDisponible('remplissage_conduits'), 'tableau de remplissage non couvert par l’extrait Legrand');
  assert.match(g1.controle.source, /NF C 15-100/);
  /* données saisies : ICTA Ø20, câble Ø7 → 49 / 400 = 12,25 % de la section nominale, statut inchangé */
  p.ducts[0].kind = 'icta'; p.ducts[0].dia = 20; p.circuits[0].calc = { dcab: { v: 7, st: 'saisie' } };
  r = M.remplissageGaines(p).find((x) => x.id === 'g1');
  assert.ok(Math.abs(r.taux - 12.25) < 1e-9); assert.equal(r.controle.statut, 'verification');
  /* goulotte sans dimensions : pas de taux */
  p.ducts[0].kind = 'goulotte'; delete p.ducts[0].dia;
  r = M.remplissageGaines(p).find((x) => x.id === 'g1');
  assert.equal(r.taux, null); assert.ok(r.manquantes.some((m) => /largeur et hauteur/.test(m)));
  /* liste de matériel : conducteurs = câble à commander × 3 (phase, neutre, terre) */
  const q = planLongueurs();
  const L = M.listeMateriel(q);
  const lg = (des) => L.lignes.find((l) => l.des === des);
  assert.equal(lg('Fil ou câble 2,5 mm²').qte, 33, '9,20 m + 10 % → 11 m × 3');
  assert.equal(lg('Fil ou câble 1,5 mm²').qte, 3 * Math.ceil(CH.cheminCircuit(q, 'c2').arbre / 100 * 1.1 - 1e-9));
  assert.equal(lg('Boîtes d’encastrement (appareils muraux)').qte, 2);
  assert.equal(lg('Boîtiers DCL de plafond').qte, 1);
  assert.equal(lg('Passages entre étages').qte, 2);
  assert.ok(L.lignes.every((l) => l.st === 'estimee'), 'quantités « estimées »');
  assert.ok(L.lignes.some((l) => l.cat === 'Cheminements' && /type non précisé/.test(l.des)));
  /* un circuit incomplet n'est pas compté dans les conducteurs, et il est signalé */
  q.ducts.splice(2, 1);
  const L2 = M.listeMateriel(q);
  assert.ok(!L2.lignes.some((l) => l.des === 'Fil ou câble 1,5 mm²')); assert.deepEqual(L2.sansLongueur, ['Éclairage étage']);
});

test('onglet Cheminements : remplissage, matériel ; diamètre du câble saisi dans la fiche', async () => {
  const { ctx, page, errors } = await fresh({ touch: true });
  const p = Object.assign(planLongueurs(), { id: 'pC9', name: 'Plan matériel', nodes: [], walls: [], openings: [], items: [], rooms: [], dims: [], texts: [], links: [], comps: [], fonds: [], fondImg: {}, zones: [],
    rcds: [{ id: 'r1', type: 'A', cal: 40 }] });
  p.levels = p.levels.map((l, i) => ({ ...l, name: i ? 'Étage' : 'Rez-de-chaussée', slab: 20 })); p.circuits.forEach((c) => { c.rcd = 'r1'; });
  p.ducts[0].kind = 'icta'; p.ducts[0].dia = 20;
  await seedPlan(ctx, p);
  await boot(page);
  await page.click('.vtab[data-view="elec"]'); await wait(page, 300);
  await page.click('#evBar button:has-text("Cheminements")'); await wait(page, 300);
  const txt = () => page.textContent('#evCanvas');
  assert.match(await txt(), /Remplissage des cheminements/);
  assert.match(await page.textContent('#evCanvas tr[data-duct="g1"]'), /Vérification nécessaire/);
  assert.match(await page.textContent('#evCanvas tr[data-duct="g1"]'), /diamètre extérieur du câble/);
  assert.match(await txt(), /Liste de matériel/); assert.match(await txt(), /Fil ou câble 2,5 mm²/); assert.match(await txt(), /33 m/);
  /* diamètre extérieur saisi dans la fiche du circuit c1 */
  await page.locator('#evCanvas tr[data-cid="c1"] .btn:has-text("Fiche")').click(); await wait(page, 300);
  await page.fill('#fi-dcab', '7'); await page.press('#fi-dcab', 'Enter'); await wait(page, 300);
  await page.evaluate(async () => (await import('./js/interface.js')).closeModal()); await wait(page, 300);
  const row = await page.textContent('#evCanvas tr[data-duct="g1"]');
  assert.match(row, /12,[23] %/); assert.match(row, /Vérification nécessaire/, 'jamais « conforme »');
  await wait(page, 1200);
  const st = await storedPlan(page, 'pC9');
  assert.deepEqual(st.circuits.find((c) => c.id === 'c1').calc.dcab, { v: 7, st: 'saisie' });
  assert.deepEqual(errors, []);
  await ctx.close();
});

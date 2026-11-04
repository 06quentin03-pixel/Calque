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

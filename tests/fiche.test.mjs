// Tests de la phase 3, étape 2 : fiche de calcul d'un circuit (plan et tableau), format des plans v5.
// Lancer depuis la racine du dépôt :  node --test tests/fiche.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, wait, boot, seedPlan, storedPlan } from './outils.mjs';

/* plan au format v4 (fin de la phase 2) : un radiateur, deux prises, un circuit avec des données de calcul invalides */
function planV4(id) {
  return { v: 4, id, name: 'Plan v4', levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }],
    nodes: [], walls: [], openings: [], items: [], rooms: [], dims: [], texts: [], links: [], ducts: [], comps: [], fonds: [], fondImg: {},
    elec: [{ id: 'e1', lv: 'L0', type: 'rad_elec', x: 100, y: 100, rot: 0, h: 20, cid: 'c1', p: 2000 },
      { id: 'e2', lv: 'L0', type: 'pc', x: 300, y: 100, rot: 0, h: 30, cid: 'c2' }, { id: 'e3', lv: 'L0', type: 'pc', x: 400, y: 100, rot: 0, h: 30, cid: 'c2' }],
    circuits: [{ id: 'c1', kind: 'chauffage', name: 'Chauffage', cal: 20, sec: 2.5, rcd: 'r1', dda: false, ctrl: null },
      { id: 'c2', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5, rcd: 'r1', dda: false, ctrl: null,
        calc: { p: { v: -4 }, cos: { v: 1.5, st: 'saisie' }, len: { v: 12, st: 'verifiee' }, mat: 'or', phase: 'L7' } }],
    rcds: [{ id: 'r1', type: 'AC', cal: 40 }, { id: 'r2', type: 'A', cal: 40 }], install: { kva: 9, parafoudre: false, row: 13, reseau: 'bi', ks: { v: 3 } } };
}

test('migration v4 → v5 : rien d’ajouté ni deviné, valeurs invalides retirées, données électriques réexportées', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const m = await page.evaluate(async (p) => {
    const S = await import('./js/stockage.js');
    const a = S.migratePlan(JSON.parse(JSON.stringify(p)));
    const b = S.migratePlan(JSON.parse(JSON.stringify(a.plan)));
    const E = await import('./js/electricite.js'), D = await import('./js/elecdonnees.js');
    const same = ['CK', 'SEC_MAX', 'LIGHTS', 'SOCKETS', 'accepts', 'defaultKindFor', 'elecPower', 'agcpOf', 'circLoad'].every((k) => E[k] === D[k]);
    return { ver: S.PLAN_VERSION, has: Object.keys(S.MIGRATIONS).map(Number), a, b, same };
  }, planV4('x'));
  assert.equal(m.ver, 5);
  for (let v = 1; v < m.ver; v++) assert.ok(m.has.includes(v), `migration ${v} → ${v + 1}`);
  assert.equal(m.a.from, 4); assert.equal(m.a.plan.v, 5);
  assert.ok(!('calc' in m.a.plan.circuits[0]), 'aucune donnée de calcul ajoutée');
  assert.deepEqual(m.a.plan.circuits[1].calc, { len: { v: 12, st: 'saisie' } }, 'seule la longueur valide reste ; « vérifiée » sans source → saisie');
  assert.ok(!('reseau' in m.a.plan.install) && !('ks' in m.a.plan.install), 'réseau et ks invalides retirés');
  assert.equal(m.a.plan.install.kva, 9);
  assert.deepEqual(m.b.plan, m.a.plan, 'migration sans effet sur un plan à jour');
  assert.ok(m.same, 'electricite.js réexporte les mêmes objets que elecdonnees.js');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('fiche de calcul depuis le tableau : saisie, résultats, statut, enregistrement, annuler', async () => {
  const { ctx, page, errors } = await fresh({ touch: true });
  await seedPlan(ctx, planV4('pF4'));
  await boot(page);
  assert.equal(await page.textContent('#projName'), 'Plan v4');
  await page.click('.vtab[data-view="elec"]'); await wait(page, 300);
  await page.click('#evSide [data-key="circuit:c2"]'); await wait(page, 200);
  await page.click('#evSide .fi-btn .btn'); await wait(page, 300);
  const txt = () => page.textContent('#modal');
  assert.match(await txt(), /Fiche de calcul/);
  assert.match(await txt(), /Vérification nécessaire/);
  assert.match(await txt(), /Puissance active P/, 'puissance manquante signalée (prises : aucune valeur devinée)');
  assert.match(await txt(), /2 symboles sur 2 sans puissance/);
  /* saisie : 3 680 W, cos φ 1, 15 m → IB = 16 A ; ΔU = 2 × 0,0225 × 15 / 2,5 × 16 = 4,32 V = 1,88 % */
  await page.fill('#fi-p', '3680'); await page.press('#fi-p', 'Enter'); await wait(page, 200);
  await page.click('#modal .fi-champ .chip:has-text("1")'); await wait(page, 200);
  await page.fill('#fi-len', '15'); await page.press('#fi-len', 'Enter'); await wait(page, 300);
  const t = await txt();
  assert.match(t, /16 A/); assert.match(t, /4,32 V/); assert.match(t, /1,88 %/);
  assert.match(t, /IB = 3 ?680 \/ \(230 × 1\)/);
  assert.ok(!/Données manquantes/.test(t), 'plus de donnée manquante');
  assert.equal(await page.locator('#modal .fi-top .stat').textContent(), 'Vérification nécessaire', 'jamais « conforme » globalement');
  assert.match(t, /Courants admissibles des conducteurs/, 'tableau Legrand manquant indiqué');
  /* « vérifiée » sans origine refusée, puis acceptée avec une origine */
  await page.locator('#modal .fi-champ').first().locator('.seg button:has-text("Vérifiée")').click(); await wait(page, 200);
  assert.match(await page.textContent('#toast'), /origine/);
  await page.fill('#fi-p-src', 'Notice de test'); await page.press('#fi-p-src', 'Enter'); await wait(page, 200);
  await page.locator('#modal .fi-champ').first().locator('.seg button:has-text("Vérifiée")').click(); await wait(page, 1400);
  const st = await storedPlan(page, 'pF4');
  assert.equal(st.v, 5);
  assert.deepEqual(st.circuits.find((c) => c.id === 'c2').calc, { len: { v: 15, st: 'saisie' }, p: { v: 3680, st: 'verifiee', src: 'Notice de test' }, cos: { v: 1, st: 'saisie' } });
  const fiab = () => page.locator('#modal .fi-champ').first().locator('.seg button[aria-pressed="true"]').textContent();
  assert.equal(await fiab(), 'Vérifiée');
  /* annuler : la fiche suit (retour à « Saisie ») */
  await page.evaluate(async () => (await import('./js/interaction.js')).undo()); await wait(page, 200);
  assert.equal(await fiab(), 'Saisie');
  assert.equal(await page.isVisible('#modal .fiche'), true, 'fiche toujours ouverte après annuler');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('fiche de calcul depuis le plan, en triphasé, sur iPad portrait', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 820, height: 1180 }, touch: true });
  const p = planV4('pF5'); p.install.reseau = 'tri'; delete p.install.ks;
  await seedPlan(ctx, p);
  await boot(page);
  await page.evaluate(async () => { const I = await import('./js/interaction.js'); const { ui } = await import('./js/noyau.js'); I.select({ t: 'elec', id: 'e1' }); ui.inspOpen = true; (await import('./js/interface.js')).renderInspector(); });
  await wait(page, 200);
  const b = page.locator('.fi-btn .btn').first();
  assert.equal(await b.isVisible(), true, 'bouton « Fiche de calcul » dans l’inspecteur du symbole');
  const box = await b.boundingBox(); assert.ok(box.height >= 44, 'bouton assez grand pour le doigt');
  await b.click(); await wait(page, 300);
  const t = await page.textContent('#modal');
  assert.match(t, /Chauffage/);
  /* radiateur 2 000 W saisi, cos φ 1 estimé : IB = 2 000 / 230 = 8,70 A */
  assert.match(t, /8,7 A|8,7\d A/);
  assert.match(t, /Phase de raccordement/, 'en triphasé, la phase manquante est signalée');
  await page.click('#modal .seg button:has-text("L2")'); await wait(page, 1400);
  const st = await storedPlan(page, 'pF5');
  assert.equal(st.circuits.find((c) => c.id === 'c1').calc.phase, 'L2');
  assert.equal(st.install.reseau, 'tri');
  const mb = await page.$eval('#modal', (m) => { const r = m.getBoundingClientRect(); return { l: r.left, r: r.right, w: innerWidth }; });
  assert.ok(mb.l >= 0 && mb.r <= mb.w, 'fiche entièrement visible en portrait');
  await page.click('#modal .pop-head .ib'); await wait(page, 200);
  assert.equal(await page.isVisible('#modal'), false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('bilan de puissance et équilibrage des phases dans l’onglet Tableau', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 820, height: 1180 }, touch: true });
  const p = planV4('pB5'); p.install.reseau = 'tri'; delete p.install.ks;
  /* chauffage : radiateur 2 000 W (IB 8,70 A) ; prises 3 680 W cos 1 (16 A) ; cuisson 6 900 W cos 1 (30 A) */
  p.circuits[1].calc = { p: { v: 3680, st: 'saisie' }, cos: { v: 1, st: 'saisie' } };
  p.circuits.push({ id: 'c3', kind: 'cuisson', name: 'Cuisson', cal: 32, sec: 6, rcd: 'r2', dda: false, ctrl: null, calc: { p: { v: 6900, st: 'saisie' }, cos: { v: 1, st: 'saisie' } } });
  await seedPlan(ctx, p);
  await boot(page);
  await page.click('.vtab[data-view="elec"]'); await wait(page, 300);
  await page.click('#evBar button:has-text("Bilan")'); await wait(page, 300);
  const txt = () => page.textContent('#evCanvas');
  let t = await txt();
  assert.match(t, /12,58 kW/, 'puissance installée 2 000 + 3 680 + 6 900 = 12 580 W');
  assert.match(t, /ks manquant/); assert.match(t, /Coefficient de simultanéité ks/);
  assert.match(t, /Aucun circuit réparti/);
  assert.match(t, /Courants admissibles des conducteurs/, 'liste des tableaux Legrand attendus');
  /* ks saisi : puissance appelée 0,5 × 12 580 = 6,29 kW */
  await page.fill('#fi-ks', '0,5'); await page.press('#fi-ks', 'Enter'); await wait(page, 300);
  assert.match(await txt(), /6,29 kW/);
  /* répartition proposée : 30 A → L1, 16 A → L2, 8,70 A → L3 */
  await page.click('#evCanvas button:has-text("Appliquer la répartition proposée")'); await wait(page, 1400);
  const st = await storedPlan(page, 'pB5');
  assert.deepEqual(st.circuits.map((c) => c.calc && c.calc.phase), ['L3', 'L2', 'L1']);
  assert.deepEqual(st.install.ks, { v: 0.5, st: 'saisie' });
  t = await txt();
  /* I moyen = (30 + 16 + 8,6957) / 3 = 18,2319 A ; (30 − 18,2319) / 18,2319 = 64,55 % → « 64,5 % » */
  assert.match(t, /Déséquilibre 64,5 %/);
  /* Annuler : retour aux circuits sans phase */
  await page.evaluate(async () => (await import('./js/interaction.js')).undo()); await wait(page, 300);
  assert.match(await txt(), /Aucun circuit réparti/);
  const w = await page.$eval('.ev-work', (e) => e.scrollWidth - e.clientWidth);
  assert.ok(w <= 1, 'pas de débordement horizontal en portrait');
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Tests de la phase 2 : bibliothèque technique générique, références fabricant, badge de fiabilité, migration v1 → v2.
// Lancer depuis la racine du dépôt :  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, fresh, wait, boot, seedPlan, storedPlan, idb } from './outils.mjs';

const T = await import(path.join(ROOT, 'js', 'technique.js'));
const SY = await import(path.join(ROOT, 'js', 'symboles.js'));

test('articles génériques : désignations lisibles, aucune référence ni fabricant inventés', () => {
  assert.ok(T.ARTICLES.length >= 100);
  assert.equal(new Set(T.ARTICLES.map((a) => a.id)).size, T.ARTICLES.length, 'identifiants uniques');
  const MARQUES = /legrand|schneider|hager|abb|siemens|eaton|arnould|niko|debflex|nexans|ingelec|planet|sarlam|aric/i;
  for (const a of T.ARTICLES) {
    assert.ok(!('ref' in a) && !('fab' in a) && !('prix' in a), `${a.id} sans référence, fabricant ni prix`);
    assert.ok(!MARQUES.test(a.n), `${a.n} sans nom de marque`);
    assert.ok(T.FAM_BY.has(a.fam), a.id);
    for (const t of a.elec) assert.ok(SY.ELEC_BY.has(t), `${a.id} → symbole ${t} existe`);
    const v = T.articleView(a.id, {});
    assert.equal(v.fiab, 'saisie'); assert.equal(v.ref, ''); assert.equal(v.source, T.GENERIC_SOURCE);
  }
  assert.ok(T.ART_BY.has('dj-1pn-c20'));
  assert.equal(T.ART_BY.get('dj-1pn-c20').n, 'Disjoncteur 1P+N 20 A courbe C');
  assert.equal(T.ART_BY.get('id-2p-40-30-a').n, 'Interrupteur différentiel 2P 40 A 30 mA type A');
  assert.equal(T.ART_BY.get('r2v-3g25').n, 'Câble U-1000 R2V 3G2,5 mm²');
});

test('recherche de chantier : abréviations, mots courts exacts, virgule décimale', () => {
  const n = (q) => T.searchArticles(q, {}).map((v) => v.id);
  assert.deepEqual(n('dj 20 courbe c').sort(), ['dj-1pn-c20', 'dj-3pn-c20'].sort());
  assert.ok(n('20a courbe c').includes('dj-1pn-c20'));
  assert.ok(!n('courbe c').includes('dj-1pn-b20'), '« courbe c » ne trouve pas la courbe B');
  assert.deepEqual(n('r2v 3g2,5'), ['r2v-3g25']);
  assert.deepEqual(n('icta 20'), ['icta-20']);
  assert.ok(n('id 40 type a').includes('id-2p-40-30-a'));
  /* la référence saisie par l'utilisateur est cherchable */
  assert.deepEqual(T.searchArticles('XYZ-TEST-42', { 'dj-1pn-c20': { ref: 'XYZ-TEST-42' } }).map((v) => v.id), ['dj-1pn-c20']);
});

test('badge de fiabilité : « vérifiée » exige une source ; la fusion n’écrase jamais une référence', () => {
  assert.equal(T.cleanRef({ ref: 'A1', fiab: 'verifiee' }).fiab, 'saisie', 'sans source → saisie');
  assert.equal(T.cleanRef({ ref: 'A1', fiab: 'verifiee', source: 'Fiche p. 3' }).fiab, 'verifiee');
  assert.equal(T.cleanRef({ ref: 'A1', fiab: 'n’importe quoi' }).fiab, 'saisie');
  assert.equal(T.cleanRef({}), null, 'rien à garder');
  const mine = { 'dj-1pn-c20': { ref: 'MIENNE', fiab: 'saisie' } };
  const r = T.mergeRefs(mine, { 'dj-1pn-c20': { ref: 'AUTRE' }, 'dj-1pn-c16': { ref: 'NOUVELLE' }, 'article-inconnu': { ref: 'X' } });
  assert.equal(r.refs['dj-1pn-c20'].ref, 'MIENNE', 'référence existante gardée');
  assert.equal(r.refs['dj-1pn-c16'].ref, 'NOUVELLE');
  assert.ok(!('article-inconnu' in r.refs));
  assert.deepEqual([r.added, r.kept, r.same], [1, 1, 0]);
});

/* plan au format v1 (avant la phase 2) avec un symbole électrique */
function planV1(id) {
  return { v: 1, id, name: 'Plan v1', levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }],
    nodes: [], walls: [], openings: [], items: [], rooms: [], dims: [], texts: [], links: [], ducts: [],
    elec: [{ id: 'e1', lv: 'L0', type: 'pc', x: 100, y: 100, rot: 0, h: 30, cid: 'c1' }, { id: 'e2', lv: 'L0', type: 'pc', x: 200, y: 100, rot: 0, h: 30, art: 42 }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 16, sec: 1.5, rcd: 'r1', dda: false, ctrl: null }],
    rcds: [{ id: 'r1', type: 'AC', cal: 40 }], install: { kva: 9, parafoudre: false, row: 13 } };
}

test('migration v1 → v2 : ancien plan ouvert sans perte, article choisi dans l’inspecteur et enregistré', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, planV1('pV1'));
  await boot(page);
  const m = await page.evaluate(async (p) => {
    const S = await import('./js/stockage.js');
    const a = S.migratePlan(JSON.parse(JSON.stringify(p)));
    const b = S.migratePlan(JSON.parse(JSON.stringify(a.plan)));
    return { ver: S.PLAN_VERSION, has: Object.keys(S.MIGRATIONS).map(Number), a, b };
  }, planV1('x'));
  assert.equal(m.ver, 2);
  for (let v = 1; v < m.ver; v++) assert.ok(m.has.includes(v), `migration ${v} → ${v + 1} présente`);
  assert.equal(m.a.from, 1); assert.equal(m.a.plan.v, 2);
  assert.ok(!('art' in m.a.plan.elec[1]), 'valeur invalide retirée');
  assert.deepEqual(m.a.plan.elec[0], planV1('x').elec[0], 'symbole valide inchangé');
  assert.deepEqual(m.b.plan, m.a.plan, 'migration sans effet sur un plan déjà à jour');
  /* dans l'application : le plan v1 est ouvert, ses données conservées */
  assert.equal(await page.textContent('#projName'), 'Plan v1');
  await page.evaluate(async () => { const I = await import('./js/interaction.js'); const { ui } = await import('./js/noyau.js'); I.select({ t: 'elec', id: 'e1' }); ui.inspOpen = true; (await import('./js/interface.js')).renderInspector(); });
  await wait(page, 200);
  const opts = await page.$$eval('#f-eart option', (a) => a.map((o) => o.textContent));
  assert.ok(opts.includes('Prise de courant 2P+T 16 A'), opts.join(' | '));
  await page.selectOption('#f-eart', 'pc-2pt-16'); await wait(page, 1400);
  const st = await storedPlan(page, 'pV1');
  assert.equal(st.v, 2);
  assert.equal(st.elec.find((e) => e.id === 'e1').art, 'pc-2pt-16');
  assert.equal(st.elec.find((e) => e.id === 'e1').cid, 'c1', 'circuit conservé');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('référence fabricant : saisie, badge, conservée après redémarrage et dans la sauvegarde complète', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 820, height: 1180 }, touch: true });
  await seedPlan(ctx, planV1('pREF'));
  await boot(page);
  const openLib = async () => { await page.click('#btnMenu'); await page.click('#menuPop button:has-text("Bibliothèque technique")'); await wait(page, 200); };
  await openLib();
  await page.fill('#modal input[type=search]', 'dj 20 courbe c'); await wait(page, 100);
  await page.click('#modal .art-li[data-art="dj-1pn-c20"] .btn'); await wait(page, 100);
  await page.fill('#f-aref', 'REF-SAISIE-TEST');
  await page.click('#modal .seg button:has-text("Vérifiée")');
  await page.click('#modal button:has-text("Enregistrer")'); await wait(page, 200);
  assert.match(await page.textContent('#modal'), /Indiquez la source/, 'vérifiée sans source refusée');
  await page.fill('#f-asrc', 'Document de test');
  await page.click('#modal button:has-text("Enregistrer")'); await wait(page, 400);
  /* retour à la liste : badge « Vérifiée » et référence affichée */
  const li = page.locator('#modal .art-li[data-art="dj-1pn-c20"]');
  assert.equal(await li.locator('.badge').textContent(), 'Vérifiée');
  assert.match(await li.textContent(), /REF-SAISIE-TEST/);
  const meta = await idb(page, 'meta', 'biblio');
  assert.equal(meta.v.refs['dj-1pn-c20'].ref, 'REF-SAISIE-TEST');
  /* après redémarrage */
  await page.reload(); await wait(page, 1200);
  await openLib();
  await page.fill('#modal input[type=search]', 'REF-SAISIE-TEST'); await wait(page, 100);
  assert.equal(await page.locator('#modal .art-li').count(), 1);
  await page.click('#modal button[aria-label="Fermer"]');
  /* sauvegarde complète : la bibliothèque y figure ; à l'import, la référence en place n'est pas écrasée */
  await page.click('#btnMenu'); await page.click('#menuPop button:has-text("Sauvegarder tous mes plans")'); await wait(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal button:has-text("Enregistrer")')]);
  const file = path.join(os.tmpdir(), 'calque-biblio-' + Date.now() + '.calque.json');
  await dl.saveAs(file);
  const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(bk.biblio.refs['dj-1pn-c20'].ref, 'REF-SAISIE-TEST');
  bk.biblio.refs['dj-1pn-c20'].ref = 'AUTRE-VALEUR';
  bk.biblio.refs['dj-1pn-c16'] = { ref: 'REF-AJOUTEE', fiab: 'saisie' };
  fs.writeFileSync(file, JSON.stringify(bk));
  await page.setInputFiles('#fileIn', file); await wait(page, 1500);
  const toast = await page.textContent('#toast');
  assert.match(toast, /1 référence fabricant ajoutée/); assert.match(toast, /la vôtre est gardée/);
  const meta2 = await idb(page, 'meta', 'biblio');
  assert.equal(meta2.v.refs['dj-1pn-c20'].ref, 'REF-SAISIE-TEST');
  assert.equal(meta2.v.refs['dj-1pn-c16'].ref, 'REF-AJOUTEE');
  fs.unlinkSync(file);
  assert.deepEqual(errors, []);
  await ctx.close();
});

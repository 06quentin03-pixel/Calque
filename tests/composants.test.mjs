// Tests de la phase 2 : composants personnalisés (création, pose, enregistrement hors ligne, sauvegardes, migration v2 → v3).
// Lancer depuis la racine du dépôt :  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT, fresh, wait, boot, seedPlan, storedPlan, idb, canvasBox } from './outils.mjs';

const CP = await import(path.join(ROOT, 'js', 'composants.js'));

test('composants : contrôle des données, fusion sans écrasement', () => {
  assert.equal(CP.cleanComp({ id: 'a', kind: 'furn', n: '', base: 'bloc' }), null, 'nom obligatoire');
  assert.equal(CP.cleanComp({ id: 'a', kind: 'furn', n: 'X', base: 'inconnu' }), null, 'modèle existant obligatoire');
  assert.equal(CP.cleanComp({ id: 'a', kind: 'furn', n: 'X', base: 'escD' }), null, 'pas d’escalier');
  const f = CP.cleanComp({ id: 'a', kind: 'furn', n: 'Meuble vasque', base: 'bloc', w: 80, d: 50 });
  assert.deepEqual([f.w, f.d, f.rang], [80, 50, 'mobilier']);
  const e = CP.cleanComp({ id: 'b', kind: 'elec', n: 'Prise IP55', base: 'pc_ip', mark: 'IP55 SAILLIE', tech: { ref: 'R1', fiab: 'verifiee' } });
  assert.equal(e.mark, 'IP55 SAI', 'marquage limité à 8 caractères');
  assert.equal(e.h, 30, 'hauteur du modèle par défaut');
  assert.equal(e.tech.fiab, 'saisie', '« vérifiée » sans source refusée');
  /* fusion : même identifiant, contenu différent → copie ; identique → rien ; réimport de la copie → rien */
  let ids = 0; const newId = () => 'nouveau' + ++ids;
  const r1 = CP.mergeComps([f], [Object.assign({}, f, { w: 90 }), e], newId);
  assert.deepEqual([r1.added, r1.copies, r1.same], [1, 1, 0]);
  assert.equal(r1.comps.find((c) => c.id === 'a').w, 80, 'composant existant inchangé');
  assert.equal(r1.comps.find((c) => c.id === 'nouveau1').n, 'Meuble vasque (importé)');
  const r2 = CP.mergeComps(r1.comps, [Object.assign({}, f, { w: 90 }), e, f], newId);
  assert.deepEqual([r2.added, r2.copies, r2.same], [0, 0, 3], 'deuxième import sans doublon');
  /* pose : l'objet garde le type du modèle */
  const o = CP.applyComp({ type: 'pc_ip', h: 30 }, e);
  assert.deepEqual([o.type, o.comp, o.mark], ['pc_ip', 'b', 'IP55 SAI']);
  const p = { items: [], elec: [o], comps: [] };
  CP.upsertPlanComp(p, e); CP.upsertPlanComp(p, e);
  assert.equal(p.comps.length, 1);
  CP.upsertPlanComp(p, f);
  assert.deepEqual(CP.unusedPlanComps(p).map((c) => c.id), ['a']);
});

async function newComp(page, fill) {
  await page.click('.tool[data-tool="furn"]'); await wait(page, 100);
  await page.click('#catalog .tabs.dom .tab:has-text("Mes composants")'); await wait(page, 100);
  await page.click('#catalog .card-add'); await wait(page, 150);
  await fill(); await page.click('#modal button:has-text("Enregistrer")'); await wait(page, 500);
}
const pickBase = (page, v) => page.evaluate((v) => { const s = document.querySelector('#f-cbase'); s.value = v; s.dispatchEvent(new Event('change')); }, v);

test('composants dans l’application : création, pose, enregistrement hors ligne, modification', async () => {
  const { ctx, page, errors } = await fresh({ touch: true });
  await boot(page);
  await page.evaluate(async () => (await import('./js/stockage.js')).newPlan()); await wait(page, 600);
  /* meuble : bloc libre 80 × 50 nommé */
  await newComp(page, async () => { await page.fill('#f-cname', 'Meuble vasque 80'); await pickBase(page, 'bloc'); await page.fill('#f-cw', '80'); await page.fill('#f-cd', '50'); });
  /* symbole : prise étanche avec marquage et désignation technique */
  await page.click('.tool[data-tool="furn"]'); await wait(page, 100);
  await page.click('#catalog .card-add'); await wait(page, 150);
  await page.click('#modal .seg button:has-text("Symbole électrique")'); await wait(page, 100);
  await page.fill('#f-cname', 'Prise étanche saillie'); await pickBase(page, 'pc_ip');
  await page.fill('#f-cmark', 'IP55'); await page.fill('#f-cdesig', 'Prise 2P+T 16 A IP55 saillie');
  await page.click('#modal button:has-text("Enregistrer")'); await wait(page, 500);
  const meta = await idb(page, 'meta', 'biblio');
  assert.deepEqual(meta.v.comps.map((c) => c.n).sort(), ['Meuble vasque 80', 'Prise étanche saillie']);
  /* pose des deux composants */
  const cards = await page.$$eval('#catalog .card[data-key]', (a) => a.map((e) => e.textContent));
  assert.equal(cards.length, 2, cards.join(' | '));
  const b = await canvasBox(page);
  await page.click('#catalog .card:has-text("Meuble vasque 80")'); await wait(page, 100);
  await page.mouse.click(b.x + b.w * 0.4, b.y + b.h * 0.4); await wait(page, 200);
  await page.click('.tool[data-tool="elec"]'); await wait(page, 100);
  await page.click('#catalog .tabs.dom .tab:has-text("Mes composants")'); await wait(page, 100);
  await page.click('#catalog .card:has-text("Prise étanche saillie")'); await wait(page, 100);
  await page.mouse.click(b.x + b.w * 0.6, b.y + b.h * 0.6); await wait(page, 1400);
  const id = await page.evaluate(async () => (await import('./js/noyau.js')).P.id);
  const st = await storedPlan(page, id);
  assert.ok(st.v >= 3);
  const it = st.items.at(-1), el = st.elec.at(-1);
  assert.deepEqual([it.k, it.w, it.d, it.name, it.label], ['bloc', 80, 50, 'Meuble vasque 80', 'Meuble vasque 80']);
  assert.deepEqual([el.type, el.mark], ['pc_ip', 'IP55']);
  assert.ok(it.comp && el.comp);
  assert.equal(st.comps.length, 2, 'le plan garde une copie de ses composants');
  /* modification du composant dans la bibliothèque : le plan ouvert suit */
  await page.evaluate(async () => { const I = await import('./js/interaction.js'); const { P, ui } = await import('./js/noyau.js'); I.select({ t: 'elec', id: P.elec.at(-1).id }); ui.inspOpen = true; (await import('./js/interface.js')).renderInspector(); });
  await wait(page, 200);
  assert.equal(await page.textContent('.insp-head h2'), 'Prise étanche saillie');
  await page.click('button:has-text("Modifier le composant")'); await wait(page, 150);
  await page.fill('#f-cmark', 'IP66'); await page.click('#modal button:has-text("Enregistrer")'); await wait(page, 1400);
  assert.equal((await storedPlan(page, id)).elec.at(-1).mark, 'IP66');
  /* redémarrage sans réseau : la bibliothèque est toujours là */
  await page.reload(); await wait(page, 1200);
  await ctx.setOffline(true);
  await page.click('.tool[data-tool="furn"]'); await wait(page, 100);
  await page.click('#catalog .tabs.dom .tab:has-text("Mes composants")'); await wait(page, 100);
  assert.equal(await page.locator('#catalog .card[data-key]').count(), 2);
  await ctx.setOffline(false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('composants : inclus dans la sauvegarde complète, retrouvés sur un autre appareil, sans doublon', async () => {
  const A = await fresh();
  await boot(A.page);
  await A.page.evaluate(async () => (await import('./js/stockage.js')).newPlan()); await wait(A.page, 600);
  await newComp(A.page, async () => { await A.page.fill('#f-cname', 'Colonne technique'); await pickBase(A.page, 'col'); });
  await A.page.click('#catalog .card:has-text("Colonne technique")');
  const b = await canvasBox(A.page); await A.page.mouse.click(b.x + b.w / 2, b.y + b.h / 2); await wait(A.page, 1400);
  await A.page.click('#btnMenu'); await A.page.click('#menuPop button:has-text("Sauvegarder tous mes plans")'); await wait(A.page);
  const [dl] = await Promise.all([A.page.waitForEvent('download'), A.page.click('#modal button:has-text("Enregistrer")')]);
  const file = path.join(os.tmpdir(), 'calque-comps-' + Date.now() + '.calque.json');
  await dl.saveAs(file);
  const bk = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(bk.biblio.comps.length, 1);
  assert.equal(bk.plans[0].plan.comps[0].n, 'Colonne technique');
  assert.deepEqual(A.errors, []);
  await A.ctx.close();
  /* « autre iPad » : nouveau navigateur vide */
  const B = await fresh();
  await boot(B.page);
  await B.page.setInputFiles('#fileIn', file); await wait(B.page, 1500);
  assert.match(await B.page.textContent('#toast'), /1 composant personnalisé ajouté/);
  await B.page.click('#modal button[aria-label="Fermer"]').catch(() => {});
  await B.page.setInputFiles('#fileIn', file); await wait(B.page, 1500);
  assert.doesNotMatch(await B.page.textContent('#toast'), /composant/, 'deuxième import : aucun doublon');
  assert.equal((await idb(B.page, 'meta', 'biblio')).v.comps.length, 1);
  assert.deepEqual(B.errors, []);
  await B.ctx.close();
  fs.unlinkSync(file);
});

test('migration v2 → v3 et plan reçu avec un composant absent de la bibliothèque', async () => {
  const comp = { id: 'cpX', kind: 'elec', n: 'Prise de chantier', base: 'pc_ip', rang: 'electricite', desc: '', at: 1, h: 30, mark: 'CH' };
  const plan = { v: 2, id: 'pV2', name: 'Plan v2', levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }],
    nodes: [], walls: [], openings: [], items: [{ id: 'i1', lv: 'L0', k: 'bloc', type: 'bloc', name: 'Bloc', x: 0, y: 0, w: 100, d: 60, rot: 0, flip: false, comp: 7 }],
    elec: [{ id: 'e1', lv: 'L0', type: 'pc', x: 100, y: 100, rot: 0, h: 30, art: 'pc-2pt-16' }], rooms: [], dims: [], texts: [], links: [], ducts: [],
    circuits: [], rcds: [], install: { kva: 9, parafoudre: false, row: 13 } };
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, plan);
  await boot(page);
  const m = await page.evaluate((p) => import('./js/stockage.js').then((S) => S.migratePlan(JSON.parse(JSON.stringify(p)))), plan);
  assert.equal(m.from, 2); assert.ok(m.plan.v >= 3);
  assert.deepEqual(m.plan.comps, []);
  assert.ok(!('comp' in m.plan.items[0]), 'valeur invalide retirée');
  assert.equal(m.plan.elec[0].art, 'pc-2pt-16', 'champ de la v2 conservé');
  /* plan venant d'un autre appareil : composant dans le plan, pas dans la bibliothèque */
  await page.evaluate(async (c) => {
    const { P } = await import('./js/noyau.js'); const I = await import('./js/interaction.js');
    P.comps.push(c); Object.assign(P.elec[0], { comp: c.id, mark: 'CH', type: 'pc_ip' }); I.commit();
    I.select({ t: 'elec', id: 'e1' }); (await import('./js/noyau.js')).ui.inspOpen = true; (await import('./js/interface.js')).renderInspector();
  }, comp);
  await wait(page, 200);
  assert.equal(await page.textContent('.insp-head h2'), 'Prise de chantier');
  await page.click('button:has-text("Ajouter à ma bibliothèque")'); await wait(page, 400);
  assert.equal((await idb(page, 'meta', 'biblio')).v.comps[0].n, 'Prise de chantier');
  assert.ok(await page.locator('button:has-text("Modifier le composant")').count());
  assert.deepEqual(errors, []);
  await ctx.close();
});

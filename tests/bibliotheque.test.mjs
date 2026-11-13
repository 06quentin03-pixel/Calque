// Tests de la phase 2 : bibliothèque par domaines et sous-catégories.
// Lancer depuis la racine du dépôt :  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, fresh, wait, boot, canvasBox } from './outils.mjs';

const B = await import(path.join(ROOT, 'js', 'bibliotheque.js'));
const SY = await import(path.join(ROOT, 'js', 'symboles.js'));

test('bibliothèque : les 71 meubles et les 179 symboles sont tous rangés, rien n’est perdu', () => {
  assert.equal(SY.FURN.length, 71, 'catalogue de mobilier intact');
  assert.equal(SY.ELEC.length, 179, 'catalogue électrique intact (176 + passage entre étages, phase 4 + boîte de dérivation murale et sortie de câble radiateur, novembre 2026)');
  const all = B.allEntries();
  assert.equal(all.length, 250);
  for (const f of SY.FURN) assert.ok(all.some((x) => x.src === 'furn' && x.key === f.k), `meuble ${f.k} rangé`);
  for (const e of SY.ELEC) assert.ok(all.some((x) => x.src === 'elec' && x.key === e.t), `symbole ${e.t} rangé`);
  /* chaque élément a un emplacement principal hors « Tertiaire » */
  for (const x of all) assert.notEqual(x.dom, 'tertiaire', `${x.key} a un rangement principal`);
});

test('bibliothèque : quatre domaines, sous-catégories valides, références existantes', () => {
  assert.deepEqual(B.DOMAINES.map((d) => d.name), ['Mobilier', 'Équipements du bâtiment', 'Électricité', 'Tertiaire']);
  const ids = new Set();
  for (const d of B.DOMAINES) {
    assert.ok(d.subs.length > 0, d.id);
    for (const s of d.subs) {
      assert.ok(!ids.has(s.id), 'identifiant unique ' + s.id); ids.add(s.id);
      for (const k of s.furn || []) assert.ok(SY.FURN_BY.has(k), `${s.id} : meuble ${k} existe`);
      for (const t of s.elec || []) assert.ok(SY.ELEC_BY.has(t), `${s.id} : symbole ${t} existe`);
      assert.ok(B.entriesOf(s).length > 0, `${s.id} n’est pas vide`);
    }
  }
  /* les catégories électriques d'origine (utilisées par les filtres) restent toutes présentes */
  for (const c of SY.ELEC_CATS) assert.ok(ids.has('e_' + c.id), c.id);
  assert.equal(B.pathOf('e_prises'), 'Électricité › Prises');
  assert.equal(B.homeOf('furn', 'bureau'), 'm_chambre');
  assert.ok(B.searchEntries('DETECTEUR fumee').some((x) => x.key === 'daaf'), 'recherche sans accents ni majuscules');
  assert.deepEqual(B.searchEntries('zzz introuvable'), []);
});

test('bibliothèque dans l’application : domaines, recherche, pose d’un élément « Tertiaire »', async () => {
  for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }]) {
    const { ctx, page, errors } = await fresh({ viewport: vp, touch: true });
    await boot(page);
    await page.click('.tool[data-tool="elec"]'); await wait(page, 200);
    assert.equal(await page.textContent('#catalog .tabs.dom [aria-pressed="true"]'), 'Électricité');
    assert.equal(await page.textContent('#catalog .tabs.subs [aria-pressed="true"]'), 'Prises');
    assert.equal(await page.locator('#catalog .card').count(), SY.ELEC.filter((e) => e.cat === 'prises').length);
    /* boutons assez grands pour le doigt et le Pencil */
    const hb = await page.$eval('#catalog .tabs.dom .tab', (e) => e.getBoundingClientRect().height);
    assert.ok(hb >= 36, 'pastille de domaine ≥ 36 px');
    /* Tertiaire › Postes de travail › Bureau : posé sur le plan */
    await page.click('#catalog .tabs.dom .tab:has-text("Tertiaire")'); await wait(page, 100);
    assert.equal(await page.textContent('#catalog .tabs.subs [aria-pressed="true"]'), 'Postes de travail');
    const n0 = await page.evaluate(async () => (await import('./js/noyau.js')).P.items.length);
    await page.click('#catalog .card[data-key="furn:bureau"]'); await wait(page, 100);
    const b = await canvasBox(page);
    await page.mouse.click(b.x + b.w * 0.3, b.y + b.h * 0.15); await wait(page, 200);
    const last = await page.evaluate(async () => { const { P } = await import('./js/noyau.js'); return { n: P.items.length, k: P.items.at(-1).k }; });
    assert.equal(last.n, n0 + 1); assert.equal(last.k, 'bureau');
    /* recherche dans toute la bibliothèque, avec le chemin de chaque résultat */
    await page.click('.tool[data-tool="furn"]'); await wait(page, 100);
    await page.fill('#catalog input[type=search]', 'disjoncteur'); await wait(page, 100);
    const res = await page.$$eval('#catalog .card small', (a) => a.map((e) => e.textContent));
    assert.ok(res.length >= 1 && res.every((t) => t.startsWith('Électricité › ')), res.join(' | '));
    /* l'outil Escalier ouvre directement les escaliers */
    await page.fill('#catalog input[type=search]', '');
    await page.click('.tool[data-tool="stairs"]'); await wait(page, 100);
    assert.equal(await page.textContent('#catalog .tabs.subs [aria-pressed="true"]'), 'Escaliers');
    assert.equal(await page.locator('#catalog .card').count(), 4);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

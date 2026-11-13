// Quantitatif et chiffrage : module sans écran js/quantitatif.js, migration v10 → v11, onglet « Quantitatif ».
// Lancer :  node --test tests/quantitatif.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HORS_PIECE, chiffrer, csvQuantitatif, nettoyerChiffrage, pieceDe, quantitatif, totalGroupe } from '../js/quantitatif.js';
import { fresh, boot, seedPlan, storedPlan, wait, bigPlan } from './outils.mjs';

const carre = (x, y, c) => [{ x, y }, { x: x + c, y }, { x: x + c, y: y + c }, { x, y: y + c }];
const PIECES = { L0: [{ nom: 'Séjour', poly: carre(0, 0, 400), holes: [] }, { nom: 'Cuisine', poly: carre(420, 0, 300), holes: [] }] };
function plan() {
  return {
    levels: [{ id: 'L0', name: 'RDC' }], comps: [], ducts: [], nodes: [], walls: [], openings: [], zones: [],
    elec: [
      { id: 'e1', lv: 'L0', type: 'pc', x: 100, y: 100, cid: 'c1' }, { id: 'e2', lv: 'L0', type: 'pc', x: 200, y: 100, cid: 'c1' },
      { id: 'e3', lv: 'L0', type: 'pc', x: 410, y: 100, cid: 'c1' }, // sur la cloison entre les deux pièces : la plus proche
      { id: 'e4', lv: 'L0', type: 'pc', x: 500, y: 100, cid: 'c2', art: 'pc-16-2pt' }, // article de la bibliothèque technique (s'il existe)
      { id: 'e5', lv: 'L0', type: 'inter', x: 2000, y: 2000 }, // hors de toute pièce
      { id: 'e6', lv: 'L0', type: 'traversee', x: 50, y: 50 }, // compté ailleurs
    ],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises séjour', cal: 16, sec: 1.5, rcd: 'r1' }, { id: 'c2', kind: 'prises', name: 'Prises cuisine', cal: 20, sec: 2.5, rcd: 'r1', dda: true, calc: { phase: 'tri' } }],
    rcds: [{ id: 'r1', type: 'A', cal: 40 }], install: { kva: 9, parafoudre: true },
  };
}

test('quantitatif : appareillage par pièce et par circuit, protections lues dans le tableau', () => {
  const p = plan(), avant = JSON.stringify(p);
  const q = quantitatif(p, { pieces: PIECES });
  assert.equal(JSON.stringify(p), avant, 'le plan n’est pas modifié');
  const L = new Map(q.lignes.map((l) => [l.cle, l]));
  const pcs = q.lignes.filter((l) => l.cat === 'Appareillage' && /^Prise/.test(l.des)).reduce((s, l) => s + l.qte, 0);
  assert.equal(pcs, 4); assert.equal(L.get('app:inter').qte, 1); assert.ok(!L.has('app:traversee'));
  assert.equal(L.get('disj:16:mono').qte, 1); assert.match(L.get('disj:16:mono').des, /16 A 1P\+N/);
  assert.equal(L.get('disj:20:tri').qte, 1); assert.match(L.get('disj:20:tri').des, /3P\+N/);
  assert.equal(L.get('dda').qte, 1); assert.equal(L.get('dd:A:40:mono').qte, 1); assert.equal(L.get('parafoudre').qte, 1);
  assert.ok(q.lignes.every((l) => l.st === 'saisie' || l.st === 'estimee'));
  /* par pièce : la prise sur la cloison (x = 410) est à 10 cm des deux pièces → la première trouvée la plus proche */
  const sej = q.parPiece.find((g) => g.piece === 'Séjour'), cui = q.parPiece.find((g) => g.piece === 'Cuisine'), hors = q.parPiece.find((g) => g.piece === HORS_PIECE);
  const n = (g) => g.lignes.reduce((s, l) => s + l.qte, 0);
  assert.equal(n(sej) + n(cui), 4); assert.ok(n(sej) >= 2 && n(cui) >= 1); assert.equal(n(hors), 1);
  assert.equal(q.parPiece[q.parPiece.length - 1].piece, HORS_PIECE, '« Hors pièce » en dernier');
  assert.equal(pieceDe(PIECES, 'L0', { x: 405, y: 50 }), 'Séjour'); assert.equal(pieceDe(PIECES, 'L0', { x: 900, y: 900 }), HORS_PIECE);
  /* par circuit : disjoncteur + appareils ; câble non compté (pas de gaines) */
  const c1 = q.parCircuit[0];
  assert.equal(c1.repere, 'C1'); assert.equal(c1.cableConnu, false);
  assert.deepEqual(c1.lignes.map((l) => [l.cle, l.qte]), [['disj:16:mono', 1], ['app:pc', 3]]);
  assert.ok(q.parCircuit[1].lignes.some((l) => l.cle === 'dda'));
});

test('chiffrage : prix saisis seulement, total partiel tant qu’une ligne est sans prix, main-d’œuvre et TVA', () => {
  const q = quantitatif(plan(), { pieces: PIECES });
  let ch = chiffrer(q, null);
  assert.equal(ch.chiffrees, 0); assert.equal(ch.complet, false); assert.equal(ch.fournitures, 0); assert.equal(ch.mainOeuvre, null); assert.equal(ch.totalTTC, null);
  const c = { prix: { 'app:pc': { v: 8.5, st: 'saisie' }, 'disj:16:mono': { v: 9, st: 'saisie' } }, temps: { 'app:pc': { v: 20, st: 'saisie' } }, tauxH: { v: 45, st: 'saisie' }, tva: { v: 20, st: 'saisie' } };
  ch = chiffrer(q, c);
  const pc = ch.lignes.find((l) => l.cle === 'app:pc');
  assert.equal(pc.total, 8.5 * pc.qte); assert.equal(ch.fournitures, 8.5 * pc.qte + 9);
  assert.equal(ch.heures, 20 * pc.qte / 60); assert.equal(ch.mainOeuvre, 45 * pc.qte / 3);
  assert.equal(ch.totalHT, ch.fournitures + ch.mainOeuvre); assert.equal(ch.totalTTC, Math.round(ch.totalHT * 1.2 * 100) / 100);
  assert.equal(ch.complet, false); assert.equal(ch.sansPrix, q.lignes.length - 2);
  /* tout chiffré → complet */
  const tout = { prix: Object.fromEntries(q.lignes.map((l) => [l.cle, { v: 1, st: 'saisie' }])) };
  ch = chiffrer(q, tout); assert.equal(ch.complet, true); assert.equal(ch.fournitures, q.lignes.reduce((s, l) => s + l.qte, 0)); assert.equal(ch.totalTTC, null, 'sans TVA saisie : pas de TTC');
  assert.deepEqual(totalGroupe(q.parCircuit[0].lignes, c), { total: 9 + 8.5 * 3, sansPrix: 0 });
  /* nettoyage : valeurs invalides retirées, « vérifiée » sans source → « saisie », rien d'inventé */
  const n = nettoyerChiffrage({ prix: { a: { v: -1 }, b: { v: 'x' }, c: { v: 3, st: 'verifiee' }, d: { v: 4, st: 'verifiee', src: 'Tarif 2026 p. 12' } }, temps: 'non', tva: { v: 150 }, tauxH: { v: 50 } });
  assert.deepEqual(n, { prix: { c: { v: 3, st: 'saisie' }, d: { v: 4, st: 'verifiee', src: 'Tarif 2026 p. 12' } }, temps: {}, tauxH: { v: 50, st: 'saisie' } });
  assert.deepEqual(nettoyerChiffrage(undefined), { prix: {}, temps: {} });
});

test('export tableur : CSV avec point-virgule, virgule décimale, totaux « partiel », cellules protégées', () => {
  const p = plan(); p.circuits[0].name = '=SOMME(A1) ; "test"';
  const q = quantitatif(p, { pieces: PIECES });
  const ch = chiffrer(q, { prix: { 'app:pc': { v: 8.5, st: 'saisie' } }, tva: { v: 20, st: 'saisie' } });
  const csv = csvQuantitatif(q, ch, { titre: 'Quantitatif — Test' });
  assert.equal(csv.charCodeAt(0), 0xFEFF);
  const l = csv.slice(1).split('\r\n');
  assert.equal(l[0], 'Quantitatif — Test');
  assert.match(l[2], /^Catégorie;Désignation;Fabricant;Référence;Quantité;Unité/);
  const pc = l.find((x) => /^Appareillage;Prise/.test(x) && /;8,5;/.test(x)); assert.ok(pc, 'ligne chiffrée avec virgule décimale');
  assert.ok(l.some((x) => /^Total fournitures HT PARTIEL \(\d+ lignes sans prix\)/.test(x)));
  assert.ok(l.some((x) => /^Total TTC PARTIEL/.test(x)));
  assert.ok(l.includes('QUANTITÉS PAR PIÈCE') && l.includes('QUANTITÉS PAR CIRCUIT'));
  assert.ok(csv.includes(`C1;"'=SOMME(A1) ; ""test""";`), 'formule neutralisée et guillemets doublés');
});

test('migration v10 → v11 : chiffrage vide, copie de sécurité ; onglet Quantitatif : saisie, totaux, annuler, enregistrement, CSV', async () => {
  const { ctx, page, errors } = await fresh();
  const p = plan();
  await seedPlan(ctx, Object.assign(p, { v: 10, id: 'pQ10', name: 'Plan v10', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }], items: [], rooms: [], dims: [], texts: [], links: [], doc: { revisions: [] } }));
  await boot(page);
  const m = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), St = await import('./js/stockage.js');
    await new Promise((res) => setTimeout(res, 300));
    return { v: N.P.v, ch: N.P.chiffrage, n: N.P.elec.length, why: (await St.versionsOf(N.P.id)).map((x) => x.why) };
  });
  assert.equal(m.v, 12); assert.deepEqual(m.ch, { prix: {}, temps: {} }); assert.equal(m.n, 6, 'rien de perdu');
  assert.ok(m.why.some((w) => /v10 → v12/.test(w)), m.why.join(' | '));
  await page.click('text=Tableau électrique'); await page.click('#evBar >> text=Quantitatif');
  const prix = page.locator('.qt-table input[data-k="prix|app:pc"]');
  await prix.fill('8,5');
  await page.locator('.qt-table input[data-k="prix|app:inter"]').click(); // passer au champ suivant : la saisie est validée, le curseur reste dans le nouveau champ
  await page.keyboard.type('7'); 
  assert.equal(await page.evaluate(() => document.activeElement.getAttribute('data-k')), 'prix|app:inter', 'le tableau n’est pas reconstruit pendant la saisie');
  await page.keyboard.press('Enter');
  await page.fill('#qtTva', '20'); await page.keyboard.press('Enter');
  await wait(page, 200);
  const boxes = await page.$$eval('#qtRoot .ev-sumbox', (e) => e.map((x) => x.textContent.replace(/\s/g, ' ')));
  assert.match(boxes[0], /^2 \/ \d+/); assert.match(boxes[1], /^41,00 €.*partiel/); assert.match(boxes[3], /^49,20 €Total TTC.*total partiel/);
  assert.equal((await page.locator('tr[data-cle="app:pc"] .qt-tot').textContent()).replace(/\s/g, ' '), '34,00 €');
  /* valeur invalide refusée, effacer retire le prix */
  await prix.fill('abc'); await page.keyboard.press('Enter'); assert.equal(await prix.inputValue(), '8,5');
  /* annuler revient sur la dernière saisie (TVA) */
  await page.click('#btnUndo'); await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.chiffrage.tva), undefined);
  /* vues par pièce et par circuit */
  await page.click('#qtRoot >> text=Par circuit'); assert.ok(await page.locator('.qt-groupe').count() >= 2);
  await page.click('#qtRoot >> text=Par pièce'); assert.ok(await page.locator('.qt-groupe').count() >= 1);
  /* enregistré dans le plan, mémorisé dans « mes prix » */
  await page.evaluate(async () => { await (await import('./js/stockage.js')).saveNow(); });
  const st = await storedPlan(page, 'pQ10');
  assert.deepEqual(st.chiffrage.prix, { 'app:pc': { v: 8.5, st: 'saisie' }, 'app:inter': { v: 7, st: 'saisie' } });
  assert.deepEqual(await page.evaluate(async () => { const u = (await import('./js/mabiblio.js')).UL.prix; return [u['app:pc'].pu, u['app:inter'].pu]; }), [8.5, 7]);
  /* export CSV */
  await page.click('#qtRoot >> text=Tableur (CSV)');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal >> text=Enregistrer')]);
  assert.match(dl.suggestedFilename(), /quantitatif\.csv$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('mes prix : repris dans un autre plan seulement à la demande', async () => {
  const { ctx, page, errors } = await fresh();
  await ctx.addInitScript(() => { if (!localStorage.getItem('calque.biblio')) localStorage.setItem('calque.biblio', JSON.stringify({ refs: {}, comps: [], prix: { 'app:pc': { pu: 9.9, tps: 12, at: 1 } }, savedAt: 5 })); });
  await seedPlan(ctx, Object.assign(plan(), { v: 11, id: 'pQ11', name: 'Autre plan', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }], items: [], rooms: [], dims: [], texts: [], links: [], doc: { revisions: [] } }));
  await boot(page);
  await page.click('text=Tableau électrique'); await page.click('#evBar >> text=Quantitatif');
  assert.equal(await page.locator('.qt-table input[data-k="prix|app:pc"]').inputValue(), '', 'aucun prix appliqué sans demande');
  await page.click('#qtRoot >> text=Reprendre mes prix (1)'); await wait(page, 200);
  assert.equal(await page.locator('.qt-table input[data-k="prix|app:pc"]').inputValue(), '9,9');
  assert.equal(await page.locator('.qt-table input[data-k="temps|app:pc"]').inputValue(), '12');
  const c = await page.evaluate(async () => (await import('./js/noyau.js')).P.chiffrage.prix['app:pc']);
  assert.equal(c.st, 'saisie'); assert.match(c.src, /Mes prix/);
  assert.equal(await page.locator('#qtRoot >> text=Reprendre mes prix').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('très gros plan : la saisie d’un prix ne recalcule que les totaux (annuler et enregistrement gardés)', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, bigPlan(10, 'pQBIG'));
  await boot(page);
  await page.click('text=Tableau électrique'); await page.click('#evBar >> text=Quantitatif');
  await wait(page, 300);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), E = await import('./js/evenements.js');
    const evts = []; E.on(E.EV.PLAN_CHANGE, (d) => evts.push(d));
    const inp = document.querySelector('.qt-table input[data-k="prix|app:pc"]');
    const a = performance.now();
    for (let i = 1; i <= 10; i++) { inp.value = String(i); inp.dispatchEvent(new Event('change')); }
    const ms = performance.now() - a;
    return { ms, n: N.P.elec.length, evts, prix: N.P.chiffrage.prix['app:pc'], tot: document.querySelector('tr[data-cle="app:pc"] .qt-tot').textContent.replace(/\s/g, ' '),
      boite: document.querySelector('#qtRoot .ev-sumbox').textContent, undo: document.getElementById('btnUndo').disabled };
  });
  assert.equal(r.n, 600);
  assert.deepEqual(r.prix, { v: 10, st: 'saisie' });
  assert.equal(r.tot, '3 000,00 €', '300 prises × 10 €');
  assert.match(r.boite, /^1 \/ \d+/);
  assert.equal(r.undo, false, 'chaque saisie est une étape d’annulation');
  assert.equal(r.evts.length, 10); assert.ok(r.evts.every((d) => d.cause === 'modification' && d.leger === true));
  assert.ok(r.ms < 150, `10 saisies en ${Math.round(r.ms)} ms (≈ 350 ms quand tout était recalculé)`);
  /* annuler : l'étape précédente revient, à l'écran aussi */
  await page.click('#btnUndo'); await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.chiffrage.prix['app:pc'].v), 9);
  assert.equal(await page.locator('.qt-table input[data-k="prix|app:pc"]').inputValue(), '9');
  assert.equal((await page.locator('tr[data-cle="app:pc"] .qt-tot').textContent()).replace(/\s/g, ' '), '2 700,00 €');
  /* une modification du plan faite ailleurs est bien reprise au retour dans l'onglet */
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'); N.P.elec.pop(); I.commit(); });
  await page.locator('.qt-table input[data-k="prix|app:pc"]').fill('2'); await page.keyboard.press('Enter'); await wait(page, 100);
  assert.equal((await page.locator('tr[data-cle="app:pc"] .qt-tot').textContent()).replace(/\s/g, ' '), '598,00 €', '299 prises × 2 €');
  await page.evaluate(async () => { await (await import('./js/stockage.js')).saveNow(); });
  assert.deepEqual((await storedPlan(page, 'pQBIG')).chiffrage.prix, { 'app:pc': { v: 2, st: 'saisie' } });
  assert.deepEqual(errors, []);
  await ctx.close();
});

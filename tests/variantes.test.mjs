// Phase 7, étape 2 : variantes (économique, standard, haut de gamme…), comparaison, version principale.
// Lancer :  node --test tests/variantes.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, wait, seedPlan } from './outils.mjs';
import { basculer, choisirPrincipale, dupliquer, initialiser, nettoyerVariantes, planDe, supprimer, modifier, comparer } from '../js/variantes.js';

const base = () => ({ levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250 }], walls: [{ id: 'w' }], rooms: [], etudes: [], photometries: [], install: { kva: 9 },
  elec: [{ id: 'e1', lv: 'L0', type: 'pc', x: 0, y: 0, cid: 'c1' }], circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 16, sec: 1.5 }], rcds: [], links: [], ducts: [] });

test('variantes (sans écran) : création, copie, affichage, principale, aucune perte', () => {
  const p = base();
  const v0 = initialiser(p, { nom: 'Standard', gamme: 'std', at: 1 });
  assert.equal(v0.liste.length, 1); assert.equal(v0.active, v0.principale); assert.equal(v0.liste[0].data, undefined, 'la variante affichée est dans le plan');
  const eco = dupliquer(p, { nom: 'Économique', gamme: 'eco', at: 2 });
  assert.notEqual(p.variantes, v0, 'nouvel objet à chaque opération (jamais modifié sur place)');
  assert.deepEqual(eco.data.elec, p.elec); assert.notEqual(eco.data.elec, p.elec, 'copie indépendante');
  assert.equal(eco.data.walls, undefined, 'les murs sont communs');
  // la variante économique perd une prise
  eco.data.elec = [];
  const avant = p.variantes;
  assert.equal(basculer(p, eco.id, 3), true);
  assert.notEqual(p.variantes, avant);
  assert.equal(p.elec.length, 0); assert.equal(p.variantes.active, eco.id);
  const std = p.variantes.liste.find((e) => e.nom === 'Standard');
  assert.equal(std.data.elec.length, 1, 'la variante quittée est rangée avec ses données');
  assert.equal(p.walls.length, 1, 'partie commune inchangée');
  // planDe : plan complet d'une autre variante
  assert.equal(planDe(p, std.id).elec.length, 1); assert.equal(planDe(p, std.id).walls, p.walls); assert.equal(planDe(p, eco.id), p);
  // suppression refusée pour la variante affichée et la principale
  assert.equal(supprimer(p, eco.id), null); assert.equal(supprimer(p, std.id), null);
  assert.equal(choisirPrincipale(p, eco.id), true);
  assert.equal(supprimer(p, std.id).nom, 'Standard'); assert.equal(p.variantes.liste.length, 1);
  assert.equal(modifier(p, eco.id, { nom: '  ', gamme: 'zzz' }), true); assert.equal(p.variantes.liste[0].nom, 'Économique', 'nom vide refusé');
  // retour : on revient sur la variante supprimée ? non ; mais aucune donnée de la variante affichée n'est perdue
  assert.equal(p.elec.length, 0);
});

test('variantes : nettoyage (migration v9 → v10) sans jamais jeter de variante', () => {
  assert.equal(nettoyerVariantes(null), null);
  assert.equal(nettoyerVariantes({ liste: [] }), null);
  // deux variantes avec données, aucune « affichée » : la partie du plan devient une variante de plus
  const v = nettoyerVariantes({ active: 'x', principale: 'b', liste: [{ id: 'a', nom: 'A', data: { elec: [{ id: 1 }] } }, { id: 'b', nom: 'B', gamme: 'eco', data: { elec: [] } }] });
  assert.equal(v.liste.length, 3); assert.equal(v.principale, 'b');
  assert.ok(v.liste.find((e) => e.id === v.active && !e.data));
  assert.equal(v.liste[0].data.elec.length, 1); assert.deepEqual(v.liste[0].data.circuits, []);
  // variante inactive sans données : gardée et signalée
  const w = nettoyerVariantes({ active: 'a', liste: [{ id: 'a', nom: 'A' }, { id: 'b', nom: 'B' }] });
  assert.equal(w.liste.length, 2); assert.equal(w.liste[1].vide, true); assert.equal(w.principale, 'a');
  assert.equal(basculer({ variantes: w, elec: [] }, 'b'), false, 'une variante sans données ne s’affiche pas');
});

test('migration v9 → v10 : sans variantes, rien d’ajouté ; copie de sécurité', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, { v: 9, id: 'pV9', name: 'Plan v9', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }], nodes: [], walls: [], openings: [], items: [], elec: [], rooms: [], dims: [], texts: [], circuits: [], rcds: [], links: [], ducts: [], install: { kva: 9 }, doc: { revisions: [] } });
  await boot(page);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), St = await import('./js/stockage.js');
    await new Promise((res) => setTimeout(res, 300));
    return { v: N.P.v, has: 'variantes' in N.P, why: (await St.versionsOf(N.P.id)).map((x) => x.why) };
  });
  assert.equal(r.v, 17); assert.equal(r.has, false);
  assert.ok(r.why.some((w) => /v9 → v17/.test(w)));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('variantes dans l’application : afficher, annuler, comparer, supprimer (copie gardée), dossier PDF', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => { (await import('./js/variantesui.js')).openVariantes(); });
  await page.waitForSelector('#varCmp table', { timeout: 20000 });
  // comparaison : 3 colonnes, matériel, puissance, éclairage, contrôles ; jamais « conforme » globalement
  const c = await page.evaluate(async () => {
    const V = await import('./js/variantesui.js'); const k = V.comparaison();
    return { cols: k.cols.map((x) => x.nom), groupes: [...new Set(k.lignes.map((l) => l.groupe))], globaux: k.globaux,
      atelier: k.lignes.find((l) => /Atelier : éclairement/.test(l.nom)).vals, app: k.lignes.find((l) => l.nom === 'Appareils (symboles)').vals };
  });
  assert.deepEqual(c.cols, ['Standard', 'Économique', 'Haut de gamme']);
  for (const g of ['Appareils et tableau', 'Puissance', 'Éclairage', 'Matériel (estimation)', 'Contrôles NF C 15-100']) assert.ok(c.groupes.includes(g), g);
  assert.ok(c.globaux.every((x) => x !== 'conforme'));
  assert.ok(c.atelier[2] > c.atelier[0] && c.atelier[0] > c.atelier[1], 'éclairement : haut de gamme > standard > économique');
  assert.ok(c.app[1] < c.app[0]);
  const P0 = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { n: N.P.elec.length, walls: N.P.walls.length }; });
  // afficher « Économique » depuis la fenêtre
  await page.click('.var-li:has(input[value="Économique"]) .btn:has-text("Afficher")'); await wait(page, 300);
  let s = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const v = N.P.variantes; return { n: N.P.elec.length, walls: N.P.walls.length, active: v.liste.find((e) => e.id === v.active).nom, puce: document.getElementById('btnVar').textContent, nb: v.liste.length }; });
  assert.equal(s.active, 'Économique'); assert.equal(s.n, c.app[1]); assert.equal(s.walls, P0.walls); assert.equal(s.puce, 'Économique'); assert.equal(s.nb, 3);
  // l'annuler/rétablir réutilise le texte des variantes (pas recopié à chaque étape)
  const reuse = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'), H = await import('./js/historique.js');
    N.P.texts.push({ id: 'tz', lv: 'L0', x: 0, y: 0, text: 'x', size: 'm', rot: 0 }); N.touch(); I.commit();
    return { fresh: H.H.cur.fresh, taille: JSON.stringify(N.P.variantes).length };
  });
  assert.ok(reuse.taille > 50000 && reuse.fresh < 5000, `seuls les blocs modifiés sont nouveaux (${reuse.fresh} caractères)`);
  await page.click('#modal .x, #modal [aria-label="Fermer"]').catch(() => {});
  await page.click('#btnUndo'); await wait(page, 100); await page.click('#btnUndo'); await wait(page, 300);
  s = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const v = N.P.variantes; return { n: N.P.elec.length, active: v.liste.find((e) => e.id === v.active).nom, nb: v.liste.length }; });
  assert.deepEqual(s, { n: P0.n, active: 'Standard', nb: 3 }, 'annuler revient à la variante standard, sans perdre de variante');
  // dossier PDF : chapitre « Comparaison des variantes », variante dans le cartouche
  const pdf = await page.evaluate(async () => {
    const Ui = await import('./js/dossierui.js'), D = await import('./js/documents.js'), N = await import('./js/noyau.js'), V = await import('./js/variantesui.js');
    const o = Ui.optionsDossier({ chap: ['garde', 'variantes'], fmt: 'A4', fmtSch: 'A4' }); o.comparaison = V.comparaison();
    const d = D.composerDossier(N.P, o);
    const txt = d.pages.map((p) => p.ctx.out.join('\n')).join('\n');
    return { chap: d.chapitres.map((x) => x.id), info: d.info.variante, haut: txt.includes('Haut de gamme') };
  });
  assert.deepEqual(pdf.chap, ['garde', 'variantes']); assert.equal(pdf.info, 'Standard (version principale)'); assert.ok(pdf.haut);
  // supprimer une variante : copie gardée dans l'historique (plan enregistré)
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'); N.P.name = 'Projet à variantes'; I.commit(); });
  await wait(page, 1200);
  await page.evaluate(async () => { (await import('./js/variantesui.js')).openVariantes(); });
  await wait(page, 300);
  const del = await page.$('.var-li:has(input[value="Haut de gamme"]) .btn.danger');
  await del.click(); await wait(page, 100); await del.click(); await wait(page, 800);
  const fin = await page.evaluate(async () => { const N = await import('./js/noyau.js'), St = await import('./js/stockage.js'); return { nb: N.P.variantes.liste.length, why: (await St.versionsOf(N.P.id)).map((x) => x.why) }; });
  assert.equal(fin.nb, 2); assert.ok(fin.why.some((w) => /Avant suppression de la variante « Haut de gamme »/.test(w)), fin.why.join(' | '));
  assert.deepEqual(errors, []);
  await ctx.close();
});

// Tests de la phase 5 : concepteur d'éclairage (méthode des lumens, estimation), photométrie, format des plans v7.
// Lancer depuis la racine du dépôt :  node --test tests/eclairage.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, fresh, wait, boot, seedPlan, storedPlan, idb } from './outils.mjs';

const EC = await import(path.join(ROOT, 'js', 'eclairage.js'));
const PH = await import(path.join(ROOT, 'js', 'photometrie.js'));
const near = (a, b, msg, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${msg} : ${a} ≠ ${b}`);

/* pièce rectangulaire 4 m × 5 m, hauteur sous plafond 2,50 m */
const RECT = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 500 }, { x: 0, y: 500 }];
const PIECE = { poly: RECT, holes: [], area: 400 * 500 };
const NIV = { h: 250 };

test('éclairage (sans écran) : point par point, méthode des lumens, données manquantes, trois propositions', () => {
  /* luminaire lambertien de 1 000 lm, 2 m au-dessus du point : E = Φ / (π h²) = 79,577 lx (calcul à la main) */
  const I = EC.intensiteLambert(1000);
  near(EC.eclairementsDirects([{ x: 0, y: 0, z: 280, I }], [{ x: 0, y: 0 }], 80)[0], 1000 / (Math.PI * 4), 'E sous le luminaire');
  /* à 2 m de distance horizontale, h = 2 m : E = I0 h² / d⁴ = (1000/π) × 4 / 64 = 19,894 lx */
  near(EC.eclairementsDirects([{ x: 0, y: 0, z: 280, I }], [{ x: 200, y: 0 }], 80)[0], (1000 / Math.PI) * 4 / 64, 'E à 2 m');
  /* rien n'est émis vers le haut */
  assert.equal(EC.eclairementsDirects([{ x: 0, y: 0, z: 50, I }], [{ x: 0, y: 0 }], 80)[0], 0);

  /* données manquantes : aucun éclairement par défaut, aucun flux par défaut */
  let r = EC.propositions({}, PIECE, NIV, []);
  assert.deepEqual(r.props, []);
  assert.ok(r.en.manquantes.some((m) => /Éclairement moyen visé/.test(m.nom)), 'éclairement visé à saisir');
  assert.ok(r.en.manquantes.some((m) => /Luminaire/.test(m.nom)));
  r = EC.propositions({ E: { v: 300, st: 'saisie' }, lums: [{ type: 'spot' }] }, PIECE, NIV, []);
  assert.deepEqual(r.props, []); assert.ok(r.en.manquantes.some((m) => /flux lumineux/.test(m.nom)), 'flux à saisir');
  /* valeurs par défaut de Calque : marquées « estimées » */
  assert.equal(r.en.mf.st, 'estimee'); assert.equal(r.en.mf.v, 0.8);
  assert.equal(r.en.hu.st, 'estimee'); assert.equal(r.en.hu.v, 80);

  /* trois propositions distinctes, toutes au-dessus de l'éclairement visé */
  const et = { E: { v: 300, st: 'saisie' }, lums: [{ type: 'dalle_led', flux: { v: 3600, st: 'saisie' }, p: { v: 36, st: 'saisie' } }, { type: 'spot', flux: { v: 450, st: 'saisie' }, p: { v: 6, st: 'saisie' } }] };
  r = EC.propositions(et, PIECE, NIV, []);
  assert.equal(r.props.length, 3);
  assert.equal(new Set(r.props.map((p) => `${p.lum}|${p.rows}|${p.cols}`)).size, 3, 'propositions distinctes');
  for (const p of r.props) {
    assert.ok(p.Emoy >= 300, 'éclairement visé atteint');
    assert.equal(p.U.st, 'estimee', 'utilance calculée = estimée');
    /* méthode des lumens : E = N Φ U MF / A, A = 20 m² */
    const flux = et.lums[p.lum].flux.v;
    near(p.Emoy, (p.n * flux * p.U.v * 0.8) / 20, 'formule des lumens');
    assert.ok(p.U0 > 0 && p.U0 <= 1);
    assert.equal(p.P, p.n * et.lums[p.lum].p.v, 'puissance totale');
    assert.ok(p.pos.every((q) => q.x > 0 && q.x < 400 && q.y > 0 && q.y < 500), 'luminaires dans la pièce');
  }
  assert.equal(r.props[0].critere, 'puissance');
  const minP = Math.min(...EC.candidats(r.en).filter((c) => c.ok).map((c) => c.P));
  assert.equal(r.props[0].P, minP, 'la plus économe');
  /* utilance saisie (tableau du fabricant) : elle remplace le calcul direct */
  const r2 = EC.propositions({ ...et, u: { v: 0.5, st: 'saisie', src: 'Tableau d’utilance' } }, PIECE, NIV, []);
  for (const p of r2.props) { assert.equal(p.U.v, 0.5); near(p.Emoy, (p.n * et.lums[p.lum].flux.v * 0.5 * 0.8) / 20, 'U saisi'); }
  /* objectif impossible : message, rien d'inventé */
  const r3 = EC.propositions({ E: { v: 100000, st: 'saisie' }, lums: [{ type: 'spot', flux: { v: 100, st: 'saisie' } }] }, PIECE, NIV, []);
  assert.equal(r3.aucun, true); assert.deepEqual(r3.props, []);
  /* puissance inconnue : pas de critère « la plus économe » */
  const r4 = EC.propositions({ E: { v: 200, st: 'saisie' }, lums: [{ type: 'spot', flux: { v: 450, st: 'saisie' } }] }, PIECE, NIV, []);
  assert.ok(r4.props.length >= 2 && r4.props.every((p) => p.critere !== 'puissance' && p.P === null));

  /* implantation actuelle : luminaires de plafond de la pièce dont le flux est connu */
  const sym = [
    { id: 'a', lv: 'L0', type: 'dalle_led', x: 200, y: 125, lum: { flux: { v: 3600, st: 'saisie' } } },
    { id: 'b', lv: 'L0', type: 'dalle_led', x: 200, y: 375, lum: { flux: { v: 3600, st: 'saisie' } } },
    { id: 'c', lv: 'L0', type: 'spot', x: 100, y: 100 }, // flux inconnu
    { id: 'd', lv: 'L0', type: 'dalle_led', x: 900, y: 100, lum: { flux: { v: 3600, st: 'saisie' } } }, // hors de la pièce
  ];
  const ia = EC.implantationActuelle({ E: { v: 300, st: 'saisie' } }, PIECE, NIV, sym, []);
  assert.equal(ia.n, 3); assert.equal(ia.sansFlux, 1); assert.equal(ia.res.n, 2);
  near(ia.res.Emoy, (7200 * ia.res.U.v * 0.8) / 20, 'implantation actuelle');
  const ref = EC.resultatImplantation(Object.assign({}, ia.en, { E: { v: 300 }, zLum: 250 }), [{ x: 200, y: 125 }, { x: 200, y: 375 }], { flux: 3600 });
  near(ia.res.Emoy, ref.Emoy, 'même calcul que pour une proposition');

  /* nettoyage */
  assert.equal(EC.nettoyerLum({ flux: { v: -1 }, p: { v: 5, st: 'verifiee' } }).p.st, 'saisie', '« vérifiée » sans source → saisie');
  assert.equal(EC.nettoyerLum({ flux: 'x' }), null);
  const n = EC.nettoyerEtude({ id: 'e', room: 'r', lv: 'L0', E: { v: 0 }, mf: { v: 2 }, lums: [{ type: 'xx' }, { type: 'spot', flux: { v: 400 } }], ids: ['a', 3] });
  assert.deepEqual(n, { id: 'e', lv: 'L0', room: 'r', lums: [{ type: 'spot', flux: { v: 400, st: 'saisie' } }], ids: ['a'] });
});

/* plan au format v6 (fin de la phase 4) : une pièce 4 × 5 m, un tableau ; champs v7 invalides pour la migration */
function planV6(id, extra) {
  const N = (nid, x, y) => ({ id: nid, lv: 'L0', x, y });
  return Object.assign({ v: 6, id, name: 'Plan v6', levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }],
    nodes: [N('n1', 0, 0), N('n2', 400, 0), N('n3', 400, 500), N('n4', 0, 500)],
    walls: [['w1', 'n1', 'n2'], ['w2', 'n2', 'n3'], ['w3', 'n3', 'n4'], ['w4', 'n4', 'n1']].map(([wid, a, b]) => ({ id: wid, lv: 'L0', a, b, th: 20, kind: 'mur' })),
    openings: [], items: [], rooms: [{ id: 'r1', lv: 'L0', name: 'Bureau', x: 200, y: 250 }], dims: [], texts: [], links: [], comps: [], fonds: [], fondImg: {}, zones: [],
    elec: [{ id: 't', lv: 'L0', type: 'tableau', x: 20, y: 250, rot: 90, h: 130 }],
    ducts: [], circuits: [], rcds: [], install: { kva: 9, parafoudre: false, row: 13 } }, extra || {});
}

test('migration v6 → v7 : listes vides, rien de deviné, valeurs invalides retirées, copie de sécurité', async () => {
  const { ctx, page, errors } = await fresh();
  const bad = planV6('pE6', {
    photometries: [{ id: 'ph1', name: 'Spot', C: [0], G: [0, 90], I: [[100, 0]], flux: { v: 314, st: 'verifiee', src: 'test.ies' } }, { id: 'ph2', C: [0], G: [0, 90], I: [[1]], flux: { v: 10 } }],
    etudes: [{ id: 'e1', lv: 'L0', room: 'r1', E: { v: -5 }, lums: [{ type: 'spot', ph: 'absent' }] }, { room: 'x' }],
  });
  bad.elec.push({ id: 'l1', lv: 'L0', type: 'spot', x: 200, y: 250, rot: 0, h: null, lum: { flux: { v: 'a' }, ph: 'ph1' } }, { id: 'l2', lv: 'L0', type: 'spot', x: 100, y: 250, rot: 0, h: null, lum: 3 });
  await seedPlan(ctx, planV6('pE6'));
  await boot(page);
  const m = await page.evaluate(async ([a, b]) => {
    const S = await import('./js/stockage.js');
    const x = S.migratePlan(JSON.parse(JSON.stringify(a)));
    const y = S.migratePlan(JSON.parse(JSON.stringify(b)));
    const z = S.migratePlan(JSON.parse(JSON.stringify(y.plan)));
    return { ver: S.PLAN_VERSION, has: Object.keys(S.MIGRATIONS).map(Number), x, y, z };
  }, [planV6('a'), bad]);
  assert.equal(m.ver, 7);
  for (let v = 1; v < m.ver; v++) assert.ok(m.has.includes(v), `migration ${v} → ${v + 1}`);
  /* plan v6 normal : listes vides, aucun flux ni éclairement ajouté */
  assert.equal(m.x.from, 6); assert.equal(m.x.plan.v, 7);
  assert.deepEqual(m.x.plan.photometries, []); assert.deepEqual(m.x.plan.etudes, []);
  assert.ok(m.x.plan.elec.every((e) => !('lum' in e)));
  /* valeurs invalides retirées */
  const q = m.y.plan;
  assert.deepEqual(q.photometries.map((p) => p.id), ['ph1'], 'photométrie incohérente retirée');
  assert.equal(q.photometries[0].flux.st, 'verifiee');
  assert.deepEqual(q.etudes, [{ id: 'e1', lv: 'L0', room: 'r1', lums: [{ type: 'spot' }] }], 'éclairement invalide et photométrie absente retirés');
  assert.deepEqual(q.elec.find((e) => e.id === 'l1').lum, { ph: 'ph1' });
  assert.ok(!('lum' in q.elec.find((e) => e.id === 'l2')));
  assert.deepEqual(m.z.plan, q, 'migration sans effet sur un plan à jour');
  /* le plan ouvert est passé en v7 ; la version v6 d'origine est gardée dans l'historique */
  await wait(page, 800);
  const vers = await idb(page, 'versions');
  const v = vers.find((x) => x.pid === 'pE6' && /avant mise à jour du format \(v6 → v7\)/.test(x.why));
  assert.ok(v, 'copie de sécurité avant mise à jour du format');
  assert.equal(JSON.parse((await idb(page, 'vdata', v.k)).json).v, 6, 'la copie est le plan d’origine, en v6');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('concepteur dans l’application : saisie, trois propositions, implantation modifiable, annuler', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, planV6('pE7'));
  await boot(page);
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); const I = await import('./js/interaction.js'); N.ui.sel = { t: 'room', id: 'r1' }; N.ui.inspOpen = true; I.refreshUI(); });
  await wait(page, 200);
  await page.click('button:has-text("Concevoir l’éclairage")'); await wait(page, 200);
  assert.match(await page.textContent('#modal'), /Estimation/);
  assert.match(await page.textContent('#modal'), /Données manquantes/);
  assert.equal(await page.locator('.ec-prop').count(), 0, 'pas de proposition sans données');
  await page.fill('#ec-E', '300'); await page.press('#ec-E', 'Enter'); await wait(page, 150);
  await page.click('button:has-text("Choisir un luminaire")'); await wait(page, 150);
  await page.locator('.ec-lumdef .chip:has-text("Dalle LED")').click(); await wait(page, 150);
  await page.fill('#ec-flux0', '3600'); await page.press('#ec-flux0', 'Enter'); await wait(page, 150);
  await page.fill('#ec-p0', '36'); await page.press('#ec-p0', 'Enter'); await wait(page, 200);
  assert.equal(await page.locator('.ec-prop').count(), 3, 'trois propositions');
  assert.equal(await page.locator('.ec-prop .badge.b-estimee').count(), 3, 'toutes marquées « estimée »');
  const n1 = await page.evaluate(async () => (await import('./js/noyau.js')).P.elec.length);
  await page.locator('.ec-prop').first().locator('button:has-text("Implanter")').click(); await wait(page, 1400);
  const st = await storedPlan(page, 'pE7');
  assert.equal(st.v, 7);
  const lums = st.elec.filter((e) => e.type === 'dalle_led');
  assert.ok(lums.length >= 2, 'luminaires posés');
  assert.deepEqual(lums[0].lum, { flux: { v: 3600, st: 'saisie' }, p: { v: 36, st: 'saisie' } });
  assert.equal(st.etudes[0].room, 'r1'); assert.deepEqual(st.etudes[0].ids.sort(), lums.map((e) => e.id).sort());
  assert.match(await page.textContent('.ec-atteint'), /atteint/);
  /* l'implantation est modifiable : déplacer un luminaire change le résultat */
  const avant = await page.textContent('.eclairage .sec:last-child .ec-big b');
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); const I = await import('./js/interaction.js'); const e = N.P.elec.find((x) => x.type === 'dalle_led'); e.x = 30; e.y = 30; I.commit(); });
  await wait(page, 200);
  assert.notEqual(await page.textContent('.eclairage .sec:last-child .ec-big b'), avant, 'résultat recalculé');
  /* nouvelle implantation : remplace seulement les luminaires de l'étude */
  await page.locator('.ec-prop').nth(1).locator('button:has-text("Implanter")').click(); await wait(page, 300);
  const p2 = await page.evaluate(async () => (await import('./js/noyau.js')).P);
  assert.ok(p2.elec.some((e) => e.id === 't'), 'le tableau est conservé');
  assert.deepEqual(p2.elec.filter((e) => e.type === 'dalle_led').map((e) => e.id).sort(), p2.etudes[0].ids.slice().sort());
  /* annuler trois fois (implantation, déplacement, nouvelle implantation) : retour au plan sans luminaire */
  await page.evaluate(async () => { const I = await import('./js/interaction.js'); I.undo(); I.undo(); I.undo(); });
  await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.elec.length), n1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('puissance d’un luminaire : photométrie du symbole, avec son statut', async () => {
  const D = await import(path.join(ROOT, 'js', 'elecdonnees.js'));
  assert.deepEqual(D.puissanceSymbole({ type: 'dalle_led' }), null, 'aucune puissance devinée');
  assert.deepEqual(D.puissanceSymbole({ type: 'dalle_led', lum: { p: { v: 36, st: 'verifiee', src: 'x.ies' } } }), { v: 36, st: 'verifiee', src: 'x.ies' });
  assert.equal(D.puissanceSymbole({ type: 'spot', p: 7, lum: { p: { v: 36, st: 'saisie' } } }).v, 7, 'la puissance saisie sur le symbole reste prioritaire');
  assert.equal(D.elecPower({ type: 'spot', lum: { p: { v: 4, st: 'saisie' } } }), 4);
  assert.equal(D.elecPower({ type: 'spot' }), 10, 'valeur par défaut inchangée');
  /* flux d'une répartition tabulée */
  const G = []; for (let g = 0; g <= 90; g += 1) G.push(g);
  near(PH.fluxIntegre({ C: [0], G, I: [G.map((g) => (1000 / Math.PI) * Math.cos((g * Math.PI) / 180))] }), 1000, 'flux lambertien intégré', 1e-3);
});

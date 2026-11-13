// Onglet « Schémas » : éditeur de schémas électriques indépendant du bâtiment (js/schemasymboles.js, js/schema.js,
// js/schemaui.js). Moteur sans écran (équipotentielles, repères, renvois, nomenclature, borniers, liste des fils,
// modèles, import du tableau, nettoyage v14) ; écran (poser, relier, déplacer, annuler, listes, exports, iPad).
// Lancer :  node --test tests/schemas.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fresh, boot, seedPlan, wait, ROOT } from './outils.mjs';

const imp = (f) => import(path.join(ROOT, 'js', f));

test('sans écran : symboles, modèles sans court-circuit, potentiels, repères, renvois, listes, import du tableau, nettoyage', async () => {
  const Y = await imp('schemasymboles.js'), S = await imp('schema.js'), D = await imp('dxf.js'), V = await imp('svgexport.js');
  assert.ok(Y.SYMBOLES.length >= 45);
  for (const s of Y.SYMBOLES) for (const b of s.bornes) assert.ok(b.x % 5 === 0 && b.y % 5 === 0, `${s.t} : borne ${b.n} sur la grille de 5 mm`);
  /* rotation : la borne du haut d'un contact tourné d'un quart de tour passe à droite */
  assert.deepEqual(Y.bornesDe({ t: 'contact_no', x: 100, y: 50, rot: 90 }).map((b) => [b.x, b.y]), [[110, 50], [90, 50]]);
  /* modèles : aucune liaison entre deux potentiels différents, aucune borne en l'air */
  for (const m of S.MODELES) {
    const sch = { folios: [] }; S.appliquerModele(sch, m.id);
    const eq = S.equipotentielles(sch);
    for (const n of eq.nets) { const pots = new Set(n.membres.filter((x) => Y.SYM_BY.get(x.sym.t).role === 'pot').map((x) => x.sym.num)); assert.ok(pots.size <= 1, `${m.id} : court-circuit ${[...pots]}`); }
    for (const s of sch.folios[0].syms) Y.SYM_BY.get(s.t).bornes.forEach((b, i) => assert.ok(eq.parBorne.has(`${s.id}:${i}`), `${m.id} : ${s.rep || s.t}:${b.n} raccordée`));
    assert.deepEqual(S.controlesSchema(sch).filter((x) => x.niveau === 'erreur'), [], m.id);
  }
  /* démarrage direct : auto-maintien (S2:14, KM1:A1, KM1:14), numéros de contacts, renvois, bornier, nomenclature */
  const sch = { folios: [] }; S.appliquerModele(sch, 'demarrage');
  const fils = S.listeFils(sch);
  assert.ok(fils.some((f) => ['S2:14', 'KM1:A1', 'KM1:14', 'H1:X1'].every((c) => f.connexions.includes(c))), 'auto-maintien');
  assert.ok(fils.some((f) => f.nom === 'N' && f.connexions.includes('KM1:A2')));
  assert.ok(fils.some((f) => f.connexions.includes('F1:96') && f.connexions.includes('S1:11')), 'contact thermique 95-96 en série');
  const app = S.appareils(sch), km = app.get('KM1');
  assert.equal(km.bobines.length, 1); assert.equal(km.contacts.length, 2);
  assert.deepEqual(km.contacts.find((e) => e.d.type === 'NO').num, ['13', '14']);
  assert.match(km.bobines[0].pos, /^1\.\d+$/);
  const nom = S.nomenclature(sch);
  assert.deepEqual(nom.lignes.map((l) => l.rep), ['F1', 'F2', 'H1', 'KM1', 'M1', 'Q1', 'S1', 'S2']);
  assert.match(nom.lignes.find((l) => l.rep === 'KM1').composition, /3 pôles de puissance, 1 NO \+ 0 NF/);
  assert.deepEqual(S.borniers(sch)[0].bornes.map((b) => b.num), ['1', '2', '3']);
  /* repères automatiques : contact → repère de la dernière bobine ; borne → numéro suivant ; nouvel appareil → numéro libre */
  assert.equal(S.repereNouveau(sch, 'contact_no', { pre: 'KM', rep: 'KM1' }), 'KM1');
  assert.equal(S.repereNouveau(sch, 'bobine_km'), 'KM2'); assert.equal(S.repereNouveau(sch, 'bp_no'), 'S3');
  assert.equal(S.repereNouveau(sch, 'borne'), 'X1'); assert.equal(S.prochainNumBorne(sch, 'X1'), '4');
  /* deuxième modèle : repères renumérotés (pas de mélange de KM1) */
  S.appliquerModele(sch, 'demarrage');
  assert.ok(sch.folios[1].syms.some((s) => s.rep === 'KM2') && !sch.folios[1].syms.some((s) => s.rep === 'KM1'));
  assert.ok(sch.folios[1].syms.filter((s) => s.t === 'borne').every((s) => s.rep === 'X2'));
  /* potentiels et renvois d'un folio à l'autre */
  const f1 = S.nouveauFolio('A'), f2 = S.nouveauFolio('B'), s2 = { folios: [f1, f2] };
  f1.syms.push({ id: 'r1', t: 'renvoi', x: 100, y: 50, rot: 0, num: 'R1' }, { id: 'k1', t: 'contact_no', x: 50, y: 60, rot: 0, rep: 'KA1' });
  f1.fils.push({ id: 'w1', pts: [{ x: 50, y: 50 }, { x: 100, y: 50 }] });
  f2.syms.push({ id: 'r2', t: 'renvoi', x: 20, y: 50, rot: 0, num: 'R1' }, { id: 'b1', t: 'bobine_ka', x: 60, y: 60, rot: 0, rep: 'KA1' });
  f2.fils.push({ id: 'w2', pts: [{ x: 20, y: 50 }, { x: 60, y: 50 }] });
  const eq2 = S.equipotentielles(s2);
  assert.equal(eq2.parFil.get('w1'), eq2.parFil.get('w2'), 'renvoi R1 : même fil sur les deux folios');
  assert.equal(eq2.parFil.get('w1').nom, 'R1');
  assert.equal(S.renvois(s2).get('R1').length, 2);
  assert.equal(S.appareils(s2).get('KA1').bobines[0].pos, '2.2', 'renvoi croisé vers le folio 2, colonne 2');
  /* insertion d'un symbole dans un fil : le fil est coupé entre ses bornes */
  const f3 = S.nouveauFolio('C'); f3.fils.push({ id: 'w', pts: [{ x: 100, y: 30 }, { x: 100, y: 130 }] });
  const k = { id: 'c', t: 'contact_no', x: 100, y: 80, rot: 0 }; f3.syms.push(k);
  assert.equal(S.insererSurFil(f3, k), true);
  assert.deepEqual(f3.fils.map((w) => w.pts.map((p) => p.y)).sort(), [[30, 70], [90, 130]]);
  /* contrôles : deux bobines de même repère, renvoi seul */
  const f4 = S.nouveauFolio('D'); f4.syms.push({ id: 'a', t: 'bobine_km', x: 50, y: 50, rot: 0, rep: 'KM9' }, { id: 'b', t: 'bobine_km', x: 90, y: 50, rot: 0, rep: 'KM9' }, { id: 'c', t: 'renvoi', x: 120, y: 50, rot: 0, num: 'Z9' });
  const ctl = S.controlesSchema({ folios: [f4] });
  assert.ok(ctl.some((x) => x.niveau === 'erreur' && /KM9/.test(x.msg))); assert.ok(ctl.some((x) => /Z9/.test(x.msg)));
  /* import du tableau : un différentiel, deux circuits, un circuit sans différentiel */
  const plan = { circuits: [{ id: 'a', name: 'Éclairage', cal: 16, sec: 1.5, rcd: 'r' }, { id: 'b', name: 'Prises', cal: 20, sec: 2.5, rcd: 'r' }, { id: 'c', name: 'Four', cal: 20, sec: 2.5 }], rcds: [{ id: 'r', type: 'A', cal: 40 }] };
  const s5 = { folios: [] }; const crees = S.depuisTableau(s5, plan, {});
  assert.equal(crees.length, 1);
  const types = crees[0].syms.map((s) => s.t);
  assert.equal(types.filter((t) => t === 'disj2').length, 3); assert.equal(types.filter((t) => t === 'id2').length, 1);
  const eq5 = S.equipotentielles(s5);
  for (const s of crees[0].syms.filter((x) => x.t === 'disj2' || x.t === 'id2')) for (const i of [0, 1]) assert.ok(eq5.parBorne.has(`${s.id}:${i}`), 'arrivée raccordée');
  assert.ok(crees[0].syms.some((s) => /C1 · 16 A/.test(s.des || '')));
  /* dessin sans écran (DXF, SVG) */
  const dx = new D.DxfCtx(); dx.scale(0.1, 0.1); S.dessinerFolio(dx, sch, 0, { exporter: true });
  const calques = new Set(dx.ent.map((e) => e.l)); for (const c of ['SCH_CADRE', 'SCH_FILS', 'SCH_SYMBOLES', 'SCH_REPERES']) assert.ok(calques.has(c), c);
  const sv = new V.SvgCtx(); S.dessinerFolio(sv, sch, 0, { exporter: true }); assert.match(sv.svg({ x0: 0, y0: 0, x1: 420, y1: 297 }, 'x', 'mm'), /width="420mm"/);
  /* nettoyage du format v14 */
  const n = S.nettoyerSchemas({ folios: [{ id: 'f', titre: 'T', type: 'zzz', syms: [{ id: 's', t: 'inconnu', x: 1, y: 1 }, { id: 's2', t: 'bp_no', x: 5, y: 5, rot: 45, rep: 'S1' }], fils: [{ id: 'w', pts: [{ x: 1, y: 1 }] }, { id: 'w2', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }], textes: [{ id: 't', x: 0, y: 0, s: '' }] }, null] });
  assert.deepEqual(n, { folios: [{ id: 'f', titre: 'T', type: 'libre', syms: [{ id: 's2', t: 'bp_no', x: 5, y: 5, rot: 0, rep: 'S1' }], fils: [{ id: 'w2', pts: [{ x: 0, y: 0 }, { x: 5, y: 0 }] }], textes: [] }] });
  assert.deepEqual(S.nettoyerSchemas(undefined), { folios: [] });
});

const versEcran = (page, x, y) => page.evaluate(([x, y]) => import('./js/schemaui.js').then((U) => { const v = U.ETAT_SCHEMA.V, r = document.getElementById('schCv').getBoundingClientRect(); return { x: r.left + v.ox + x * v.s, y: r.top + v.oy + y * v.s }; }), [x, y]);
const etat = (page) => page.evaluate(async () => { const N = await import('./js/noyau.js'), H = await import('./js/historique.js'); return { sch: JSON.parse(JSON.stringify(N.P.schemas)), undo: H.H.u.length, v: N.P.v }; });

test('écran : onglet Schémas, folio vide, bibliothèque, pose avec repère, fil entre deux bornes, déplacement, annuler', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, { v: 13, id: 'pS', name: 'Schémas', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }], nodes: [], walls: [], openings: [], items: [], elec: [], rooms: [], dims: [], texts: [], circuits: [], rcds: [], links: [], ducts: [], install: { kva: 9 }, doc: { revisions: [] }, calques: {}, vues: [] });
  await boot(page);
  let e = await etat(page); assert.equal(e.v, 14); assert.deepEqual(e.sch, { folios: [] });
  await page.click('.vtab[data-view=schema]'); await wait(page, 300);
  assert.equal(await page.isVisible('#schemaView'), true); assert.equal(await page.isVisible('#main'), false);
  await page.click('#schInsp >> text=Folio vide'); await wait(page, 300);
  /* bobine KM1 puis contact (repère KM1 repris), posés au Pencil (souris dans le test) sur la grille */
  await page.click('[data-stool="sym"]'); await wait(page, 200);
  await page.click('#schLib .tab:has-text("Commande")'); await page.click('#schLib [data-sym="bobine_km"]'); await wait(page, 150);
  let p = await versEcran(page, 100, 100); await page.mouse.click(p.x, p.y); await wait(page, 200);
  await page.click('[data-stool="sym"]'); await page.click('#schLib [data-sym="contact_no"]');
  p = await versEcran(page, 150, 60); await page.mouse.click(p.x, p.y); await wait(page, 200);
  await page.keyboard.press('Escape'); await wait(page, 100);
  e = await etat(page);
  assert.deepEqual(e.sch.folios[0].syms.map((s) => [s.t, s.rep, s.x, s.y]), [['bobine_km', 'KM1', 100, 100], ['contact_no', 'KM1', 150, 60]]);
  /* fil : borne 2 du contact (150, 70) → borne A1 de la bobine (100, 90) : fin automatique sur la borne */
  await page.click('[data-stool="fil"]');
  p = await versEcran(page, 150, 70.6); await page.mouse.click(p.x, p.y); await wait(page, 100);
  p = await versEcran(page, 100.5, 90); await page.mouse.click(p.x, p.y); await wait(page, 200);
  e = await etat(page);
  assert.equal(e.sch.folios[0].fils.length, 1);
  const w = e.sch.folios[0].fils[0].pts; assert.deepEqual([w[0], w[w.length - 1]], [{ x: 150, y: 70 }, { x: 100, y: 90 }]);
  assert.ok(w.every((q, i) => i === 0 || q.x === w[i - 1].x || q.y === w[i - 1].y), 'fil d’équerre');
  const net = await page.evaluate(async () => { const N = await import('./js/noyau.js'), S = await import('./js/schema.js'); return S.listeFils(N.P.schemas)[0].connexions; });
  assert.deepEqual(net.sort(), ['KM1:14', 'KM1:A1']);
  /* déplacer la bobine : le bout du fil suit */
  await page.click('[data-stool="select"]');
  p = await versEcran(page, 100, 100); const q = await versEcran(page, 100, 120);
  await page.mouse.move(p.x, p.y); await page.mouse.down(); await page.mouse.move((p.x + q.x) / 2, (p.y + q.y) / 2, { steps: 4 }); await page.mouse.move(q.x, q.y, { steps: 4 }); await page.mouse.up(); await wait(page, 200);
  e = await etat(page);
  assert.deepEqual([e.sch.folios[0].syms[0].x, e.sch.folios[0].syms[0].y], [100, 120]);
  const w2 = e.sch.folios[0].fils[0].pts; assert.deepEqual(w2[w2.length - 1], { x: 100, y: 110 }, 'le fil suit la borne A1');
  /* panneau : repère et désignation ; annuler */
  await page.fill('#sch-sdes', 'Pompe'); await page.press('#sch-sdes', 'Enter'); await wait(page, 150);
  assert.equal((await etat(page)).sch.folios[0].syms[0].des, 'Pompe');
  const avant = (await etat(page)).undo;
  await page.click('#btnUndo'); await wait(page, 200);
  assert.equal((await etat(page)).sch.folios[0].syms[0].des, undefined); assert.equal((await etat(page)).undo, avant - 1);
  /* listes et exports */
  await page.click('#schBar >> text=Listes'); await wait(page, 200);
  assert.match(await page.$eval('#modal', (m) => m.textContent), /KM1.*Contacteur/);
  await page.keyboard.press('Escape'); await page.evaluate(async () => (await import('./js/interface.js')).closeModal());
  await page.click('#schBar >> text=Exporter'); await page.click('#modal >> text=Dossier PDF');
  await page.waitForSelector('#modal .exp-act', { timeout: 15000 });
  assert.match(await page.$eval('#modal', (m) => m.textContent), /\.pdf prêt/);
  const pdf = await page.evaluate(async () => { const U = await import('./js/schemaui.js'); const r = await U.dossierPdf(); return { pages: r.pages, taille: r.blob.size }; });
  assert.equal(pdf.pages, 3, 'folio + nomenclature + liste des fils'); assert.ok(pdf.taille > 2000);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('écran : modèles, import du tableau du plan, folios, clavier, Apple Pencil (le doigt déplace la feuille)', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => { const S = await import('./js/stockage.js'); await S.openSample(); });
  await wait(page, 800);
  await page.click('.vtab[data-view=schema]'); await wait(page, 300);
  const n0 = await page.evaluate(async () => (await import('./js/noyau.js')).P.schemas.folios.length);
  const d0 = await page.evaluate(async () => (await import('./js/noyau.js')).P.schemas.folios.filter((x) => x.type === 'distribution').reduce((s, x) => s + x.syms.filter((y) => y.t === 'disj2').length, 0));
  await page.click('#schBar >> text=Modèles'); await page.click('#modal .proj-li:has-text("Va-et-vient") >> text=Ajouter'); await wait(page, 250);
  await page.click('#schBar >> text=Depuis le tableau'); await wait(page, 300);
  const r = await page.evaluate(async () => { const N = await import('./js/noyau.js'), S = await import('./js/schema.js'); const f = N.P.schemas.folios; return { n: f.length, titres: f.map((x) => x.titre), disj: f.filter((x) => x.type === 'distribution').reduce((s, x) => s + x.syms.filter((y) => y.t === 'disj2').length, 0), circuits: N.P.circuits.length, ctl: S.controlesSchema(N.P.schemas).filter((x) => x.niveau === 'erreur').length }; });
  assert.ok(r.n >= n0 + 2); assert.ok(r.titres.includes('Va-et-vient'));
  assert.equal(r.disj - d0, r.circuits, 'un disjoncteur par circuit du tableau');
  assert.equal(r.ctl, 0, 'aucune erreur de schéma (repères renumérotés)');
  /* clavier : R tourne la sélection, Suppr la retire, Annuler la rend */
  await page.evaluate(async () => { const U = await import('./js/schemaui.js'), N = await import('./js/noyau.js'); const i = N.P.schemas.folios.findIndex((f) => f.titre === 'Va-et-vient'); U.allerFolio(i, N.P.schemas.folios[i].syms.find((s) => s.t === 'lampe').id); });
  await page.focus('#schCv'); await page.keyboard.press('r'); await wait(page, 100);
  const rot = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return N.P.schemas.folios.find((f) => f.titre === 'Va-et-vient').syms.find((s) => s.t === 'lampe').rot; });
  assert.equal(rot, 90);
  await page.keyboard.press('Delete'); await wait(page, 100);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.schemas.folios.find((f) => f.titre === 'Va-et-vient').syms.some((s) => s.t === 'lampe')), false);
  await page.click('#btnUndo'); await wait(page, 150);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.schemas.folios.find((f) => f.titre === 'Va-et-vient').syms.some((s) => s.t === 'lampe')), true);
  /* mode Apple Pencil : un glissé du doigt déplace la feuille sans rien modifier */
  await page.evaluate(async () => { const N = await import('./js/noyau.js'); N.S.pencil = true; N.S.pencilSeen = true; });
  const avant = await page.evaluate(async () => { const U = await import('./js/schemaui.js'); return Object.assign({}, U.ETAT_SCHEMA.V); });
  const box = await page.$eval('#schCv', (c) => { const b = c.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
  await page.dispatchEvent('#schCv', 'pointerdown', { pointerId: 7, pointerType: 'touch', clientX: box.x, clientY: box.y, button: 0, isPrimary: true });
  for (const k of [10, 30, 60]) await page.dispatchEvent('#schCv', 'pointermove', { pointerId: 7, pointerType: 'touch', clientX: box.x + k, clientY: box.y + k / 2, isPrimary: true });
  await page.dispatchEvent('#schCv', 'pointerup', { pointerId: 7, pointerType: 'touch', clientX: box.x + 60, clientY: box.y + 30, isPrimary: true });
  const apres = await page.evaluate(async () => { const U = await import('./js/schemaui.js'); return Object.assign({}, U.ETAT_SCHEMA.V); });
  assert.ok(Math.abs(apres.ox - avant.ox - 60) < 1 && Math.abs(apres.oy - avant.oy - 30) < 1, 'feuille déplacée');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('iPad paysage et portrait, téléphone : onglet Schémas sans débordement, outils et folios accessibles', async () => {
  for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    const { ctx, page, errors } = await fresh({ viewport: vp, touch: vp.width < 500, mobile: vp.width < 500 });
    await boot(page);
    await page.evaluate(async () => { const S = await import('./js/stockage.js'); await S.openSample(); });
    await wait(page, 600);
    await page.click('.vtab[data-view=schema]'); await wait(page, 400);
    const r = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth, d = (id) => { const b = document.getElementById(id).getBoundingClientRect(); return { x0: b.left, x1: b.right, w: b.width, h: b.height }; };
      return { vw, page: document.documentElement.scrollWidth, cv: d('schCv'), tools: d('schTools'), tabs: [...document.querySelectorAll('.vtab')].map((b) => b.getBoundingClientRect().right), bar: document.getElementById('schBar').scrollWidth <= document.getElementById('schBar').clientWidth + 1 };
    });
    assert.ok(r.page <= r.vw + 1, `pas de défilement horizontal ${vp.width}`);
    assert.ok(r.cv.w > 200 && r.cv.h > 200, `feuille visible ${vp.width}`);
    assert.ok(r.tabs.every((x) => x <= r.vw + 1), `onglet Schémas visible ${vp.width}`);
    assert.ok(r.bar, `barre des folios ${vp.width}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

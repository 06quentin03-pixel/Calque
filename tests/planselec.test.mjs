// Module « Plans électriques » : calques et vues, verrouillage, gestionnaire de circuits, outil Câbler (proposé puis
// validé), migration v11 → v12, nomenclature du tableau, exports SVG et chapitre « Plans électriques » du dossier,
// tailles d'écran de l'iPad et du téléphone.
// Lancer :  node --test tests/planselec.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fresh, boot, seedPlan, wait, ROOT } from './outils.mjs';

/* petit plan v11 : une pièce, un tableau, deux prises (l'une sans circuit), un interrupteur et un plafonnier */
function planV11(extra) {
  const n = (id, x, y) => ({ id, lv: 'L0', x, y });
  return Object.assign({
    v: 11, id: 'pPE', name: 'Plans électriques', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }],
    nodes: [n('n1', 0, 0), n('n2', 800, 0), n('n3', 800, 500), n('n4', 0, 500)],
    walls: [['n1', 'n2'], ['n2', 'n3'], ['n3', 'n4'], ['n4', 'n1']].map(([a, b], i) => ({ id: 'w' + i, lv: 'L0', a, b, th: 20, kind: 'mur' })), openings: [], items: [],
    elec: [{ id: 'T', lv: 'L0', type: 'tableau', x: 20, y: 250, rot: 270, h: 130 }, { id: 'p1', lv: 'L0', type: 'pc', x: 400, y: 20, rot: 0, h: 30, cid: 'c1' },
      { id: 'p2', lv: 'L0', type: 'pc', x: 700, y: 20, rot: 0, h: 30 }, { id: 'i1', lv: 'L0', type: 'int_s', x: 780, y: 300, rot: 90, h: 110, cid: 'c2' },
      { id: 'l1', lv: 'L0', type: 'pl', x: 400, y: 300, rot: 0, h: null, cid: 'c2' }],
    rooms: [{ id: 'r', lv: 'L0', name: 'Séjour', x: 400, y: 250 }], dims: [], texts: [{ id: 't1', lv: 'L0', x: 400, y: 450, text: 'Note', size: 'm', rot: 0 }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5, rcd: 'r1' }, { id: 'c2', kind: 'eclairage', name: 'Éclairage', cal: 16, sec: 1.5, rcd: 'r1' }],
    rcds: [{ id: 'r1', type: 'A', cal: 40 }], links: [{ id: 'k1', lv: 'L0', a: 'i1', b: 'l1' }], ducts: [], install: { kva: 9 }, doc: { revisions: [] },
  }, extra || {});
}
const ecran = (page, id) => page.evaluate(async (id) => {
  const N = await import('./js/noyau.js'), R = await import('./js/rendu2d.js'), C = await import('./js/cheminement.js');
  const e = N.P.elec.find((x) => x.id === id); const a = C.ancrage(e); const r = document.getElementById('cv').getBoundingClientRect();
  return { x: r.left + a.x * R.V.s + R.V.ox, y: r.top + a.y * R.V.s + R.V.oy };
}, id);

test('calques et vues (sans écran) : appartenance, vues, retour à l’affichage, nettoyage du format v12', async () => {
  const K = await import(path.join(ROOT, 'js', 'calques.js'));
  const N = await import(path.join(ROOT, 'js', 'noyau.js'));
  assert.equal(K.CALQUES.length, 12);
  for (const [t, c] of [['pc', 'prises'], ['pc32', 'specialises'], ['pl', 'eclairage'], ['int_vv', 'eclairage'], ['cmd_vr', 'specialises'], ['rj45', 'faibles'], ['camera', 'faibles'], ['tableau', 'tableau'], ['derivation', 'tableau'], ['rad_elec', 'specialises'], ['borne_ve', 'specialises']]) assert.equal(K.calqueDeType(t), c, t);
  assert.equal(K.calqueDeGaine({ sys: 'elec', kind: 'cdc' }), 'chemins'); assert.equal(K.calqueDeGaine({ sys: 'elec', kind: 'icta' }), 'gaines'); assert.equal(K.calqueDeGaine({ sys: 'elec' }), 'gaines');
  /* une vue est appliquée puis l'affichage d'origine revient (exports) */
  const avant = JSON.stringify({ l: N.S.layers, c: N.S.calq || [] });
  const vu = K.avecVue('implantation', () => ({ gaines: K.calqueVisible('gaines'), prises: K.calqueVisible('prises'), circuits: K.calqueVisible('circuits'), vue: N.S.vue }));
  assert.deepEqual(vu, { gaines: false, prises: true, circuits: false, vue: 'implantation' });
  assert.equal(JSON.stringify({ l: N.S.layers, c: N.S.calq || [] }), avant, 'affichage rétabli');
  K.appliquerVue('cablage');
  assert.ok(K.calqueVisible('circuits') && K.calqueVisible('chemins') && !K.calqueVisible('mobilier'));
  assert.equal(K.opaciteCalque('archi'), 0.4, 'architecture estompée dans le plan de câblage');
  K.setCalqueVisible('gaines', false); assert.equal(K.vueCourante(), null, 'affichage modifié : plus la vue d’origine');
  K.appliquerVue('synthese'); assert.ok(K.CALQUES.every((c) => K.calqueVisible(c.id)));
  /* nettoyage : rien d'inventé, valeurs invalides retirées */
  assert.deepEqual(K.nettoyerCalques({ archi: { col: '#123456', op: 0.5, lock: true, nom: '  Murs  ' }, prises: { col: 'rouge', op: 7 }, inconnu: { lock: true } }), { archi: { op: 0.5, lock: true, nom: 'Murs' } });
  assert.deepEqual(K.nettoyerVues([{ id: 'v1', nom: 'Ma vue', off: ['prises', 'xx'], circs: ['c1', 3] }, { id: 'cablage', nom: 'collision' }, null]), [{ id: 'v1', nom: 'Ma vue', off: ['prises'], circs: ['c1'] }]);
});

test('migration v11 → v12 : copie de sécurité, valeurs invalides retirées, rien de perdu', async () => {
  const { ctx, page, errors } = await fresh();
  const p = planV11({ calques: { archi: { lock: 'oui' }, prises: { col: '#AA0000' } }, vues: 'aucune' });
  p.circuits[0].col = 'rouge'; p.circuits[1].courbe = 'C'; p.circuits[1].cond = 'r2v'; p.elec[1].sc = 9; p.elec[3].sc = 1.5;
  await seedPlan(ctx, p); await boot(page);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js');
    return { v: N.P.v, calques: N.P.calques, vues: N.P.vues, c0: N.P.circuits[0], c1: N.P.circuits[1], sc: N.P.elec.map((e) => e.sc ?? null), n: N.P.elec.length, texts: N.P.texts.length };
  });
  assert.equal(r.v, 15);
  assert.deepEqual(r.calques, { prises: { col: '#AA0000' } }); assert.deepEqual(r.vues, []);
  assert.ok(!('col' in r.c0)); assert.equal(r.c1.courbe, 'C'); assert.equal(r.c1.cond, 'r2v');
  assert.deepEqual(r.sc, [null, null, null, 1.5, null]); assert.equal(r.n, 5); assert.equal(r.texts, 1);
  const vers = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open('calque'); q.onsuccess = () => { const t = q.result.transaction('versions').objectStore('versions').getAll(); t.onsuccess = () => res(t.result.map((x) => x.why)); }; }));
  assert.ok(vers.some((w) => /\(v11 → v15\)/.test(w)), vers.join(' | '));
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('vues et calques à l’écran : pastille, plan de câblage, verrouillage de l’architecture, calque masqué', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, planV11()); await boot(page);
  assert.match(await page.$eval('#btnVue', (e) => e.textContent), /Tous les calques/);
  await page.click('#btnVue'); await wait(page, 200);
  assert.equal(await page.locator('#calqPop .cq-li').count(), 12);
  await page.click('#calqPop >> text=Câblage'); await wait(page, 200);
  assert.match(await page.$eval('#btnVue', (e) => e.textContent), /Câblage/);
  /* verrouiller l'architecture : un mur ne se sélectionne plus ; une étape d'annulation */
  await page.click('#calqPop [data-calque="archi"] .cq-lock'); await wait(page, 200);
  const cv = await page.$eval('#cv', (e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top }; });
  const mur = await page.evaluate(async () => { const R = await import('./js/rendu2d.js'); return { x: 400 * R.V.s + R.V.ox, y: 0 * R.V.s + R.V.oy }; });
  await page.keyboard.press('Escape'); await page.mouse.click(5, 400); await wait(page, 100);
  await page.mouse.click(cv.x + mur.x, cv.y + mur.y); await wait(page, 200);
  let s = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { sel: N.ui.sel, lock: N.P.calques.archi }; });
  assert.ok(!s.sel || s.sel.t !== 'wall', 'mur verrouillé non sélectionné'); assert.deepEqual(s.lock, { lock: true });
  await page.click('#btnUndo'); await wait(page, 200);
  await page.mouse.click(cv.x + mur.x, cv.y + mur.y); await wait(page, 200);
  s = await page.evaluate(async () => (await import('./js/noyau.js')).ui.sel);
  assert.equal(s && s.t, 'wall', 'déverrouillé par Annuler : sélectionnable');
  /* calque Prises masqué : la prise n'est plus visible ni sélectionnable */
  const v = await page.evaluate(async () => { const K = await import('./js/calques.js'), Rz = await import('./js/reseaux.js'), N = await import('./js/noyau.js'); K.setCalqueVisible('prises', false); Rz.afterFilter(); const p = N.P.elec.find((e) => e.id === 'p1'); return { vis: Rz.elecVisible(p), pastille: document.getElementById('btnVue').textContent }; });
  assert.equal(v.vis, false); assert.match(v.pastille, /calque.*masqué/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('gestionnaire de circuits : liste, sélection mise en évidence, couleur, affichage de plusieurs circuits, tableau lié', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, planV11()); await boot(page);
  await page.click('#btnCircuits'); await wait(page, 200);
  assert.equal(await page.locator('#insp .ci-li').count(), 2);
  await page.click('#insp .ci-li[data-cid="c2"] .ci-txt'); await wait(page, 200);
  let r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { hl: N.ui.hl, sel: N.ui.sel, head: document.querySelector('#insp h2, #insp .insp-head')?.textContent }; });
  assert.equal(r.hl, 'c2'); assert.deepEqual(r.sel, { t: 'circuit', id: 'c2' });
  /* couleur choisie : enregistrée dans le circuit, utilisée sur le plan et dans le tableau ; Annuler la retire */
  await page.click('#insp .cq-col[aria-label="Couleur #7C3AED"]'); await wait(page, 200);
  r = await page.evaluate(async () => { const N = await import('./js/noyau.js'), E = await import('./js/electricite.js'); return { col: N.P.circuits[1].col, aff: E.circuitColor('c2') }; });
  assert.deepEqual(r, { col: '#7C3AED', aff: '#7C3AED' });
  await page.click('#insp >> text=Courbe C'); await page.click('#insp >> text=Câble R2V'); await wait(page, 200);
  assert.deepEqual(await page.evaluate(async () => { const c = (await import('./js/noyau.js')).P.circuits[1]; return [c.courbe, c.cond]; }), ['C', 'r2v']);
  await page.click('#btnUndo'); await page.click('#btnUndo'); await page.click('#btnUndo'); await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.circuits[1].col), undefined);
  /* affichage : seul ce circuit, puis les deux */
  await page.click('#insp >> text=Afficher seul'); await wait(page, 150);
  r = await page.evaluate(async () => { const Rz = await import('./js/reseaux.js'), N = await import('./js/noyau.js'); return { f: [...(Rz.circsFiltre() || [])], p1: Rz.elecVisible(N.P.elec.find((e) => e.id === 'p1')) }; });
  assert.deepEqual(r, { f: ['c2'], p1: false });
  await page.click('#insp >> text=Tous les circuits'); await wait(page, 150);
  await page.click('#insp .ci-li[data-cid="c1"] .ci-chk'); await wait(page, 150);
  /* les deux circuits cochés = tous les circuits du plan : plus aucun filtre */
  r = await page.evaluate(async () => { const Rz = await import('./js/reseaux.js'), N = await import('./js/noyau.js'); return { f: Rz.circsFiltre(), p1: Rz.elecVisible(N.P.elec.find((e) => e.id === 'p1')) }; });
  assert.deepEqual(r, { f: null, p1: true });
  /* le même circuit dans l'onglet Tableau : champs couleur, courbe, conducteur */
  await page.click('text=Tableau électrique'); await wait(page, 200);
  await page.click('#evSide >> text=Éclairage'); await wait(page, 200);
  assert.ok(await page.locator('#elecView >> text=Courbe de la protection').count() >= 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('outil Câbler : tracé proposé, rien de créé sans validation, dérivation qui rejoint le circuit, conducteurs comptés', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, planV11()); await boot(page);
  await page.click('.tool[data-tool=cabler]');
  let p = await ecran(page, 'T'); await page.mouse.click(p.x, p.y); await wait(page, 150);
  p = await ecran(page, 'p1'); await page.mouse.click(p.x, p.y); await wait(page, 300);
  assert.match(await page.$eval('#hint', (e) => e.textContent), /Tracé proposé.*Circuit C1/);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.ducts.length), 0, 'proposition seulement');
  await page.click('#hint >> text=Refuser'); await wait(page, 100);
  p = await ecran(page, 'p1'); await page.mouse.click(p.x, p.y); await wait(page, 300);
  await page.click('#hint >> text=Créer la gaine'); await wait(page, 200);
  /* enchaînement : la prise sans circuit rejoint C1 (dérivation) */
  p = await ecran(page, 'p2'); await page.mouse.click(p.x, p.y); await wait(page, 300);
  assert.match(await page.$eval('#hint', (e) => e.textContent), /rejoindra le circuit C1/);
  await page.click('#hint >> text=Tracé direct'); await wait(page, 200);
  await page.click('#hint >> text=Créer la gaine'); await wait(page, 200);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), C = await import('./js/cablage.js'), H = await import('./js/historique.js');
    return { d: N.P.ducts.map((d) => [d.a, d.b, d.cid]), p2: N.P.elec.find((e) => e.id === 'p2').cid, des: C.cablageCircuit(N.P, N.P.circuits[0]).desPrincipale, complet: C.cablageCircuit(N.P, N.P.circuits[0]).complet, undo: H.H.u.length };
  });
  assert.deepEqual(r.d, [['T', 'p1', 'c1'], ['p1', 'p2', 'c1']]); assert.equal(r.p2, 'c1'); assert.equal(r.des, '3G2,5'); assert.equal(r.complet, true); assert.equal(r.undo, 2);
  await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('exports : SVG vectoriel par calques, plan de câblage du dossier, nomenclature du tableau, symbole agrandi', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => { const S = await import('./js/stockage.js'); await S.openSample(); });
  await wait(page, 800);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), E = await import('./js/export.js'), K = await import('./js/calques.js'), D = await import('./js/documents.js'), Ui = await import('./js/dossierui.js');
    const El = await import('./js/electricite.js'), No = await import('./js/nomenclature.js'), Sy = await import('./js/symboles.js');
    const o = { lv: 'all', dims: true, names: true, areas: true, furn: true, elec: true, vue: 'cablage' };
    const svg = K.avecVue('cablage', () => E.composeSVG(o));
    const doc = new DOMParser().parseFromString(svg.texte, 'image/svg+xml');
    const classes = new Set([...doc.querySelectorAll('[class]')].map((x) => x.getAttribute('class')));
    const dos = await D.dossierPDF(N.P, Ui.optionsDossier({ chap: ['plans_elec'], fmt: 'A4', fmtSch: 'A4' }));
    const nt = No.nomenclatureTableau(N.P, El.circNumbers(), El.rcdNumbers(), El.panelLayout());
    const td = N.P.elec.find((e) => e.type === 'tab_div'), b1 = Sy.elecBox(td, { px: 1 }), b0 = Sy.elecBox(Object.assign({}, td, { sc: 1 }), { px: 1 });
    return { err: !!doc.querySelector('parsererror'), titre: doc.querySelector('title').textContent, classes: [...classes], n: svg.n,
      pages: dos.pages, chap: dos.chapitres.map((c) => c.id), groupes: [...new Set(nt.lignes.map((l) => l.groupe))], dd: nt.lignes.filter((l) => l.groupe === 'Protection différentielle').reduce((s, l) => s + l.qte, 0), nrcd: N.P.rcds.length,
      courbes: nt.lignes.filter((l) => / courbe [CD]/.test(l.des)).length, ratio: (b1.x1 - b1.x0) / (b0.x1 - b0.x0), vue: N.S.vue };
  });
  assert.equal(r.err, false, 'SVG bien formé'); assert.match(r.titre, /plan câblage/);
  for (const c of ['MURS', 'ELEC_APPAREILS', 'ELEC_CHEMINEMENTS', 'ELEC_CABLAGE']) assert.ok(r.classes.includes(c), c);
  assert.ok(r.n > 500);
  assert.deepEqual(r.chap, ['plans_elec']); assert.ok(r.pages >= 8, `${r.pages} pages`);
  for (const g of ['Arrivée', 'Protection différentielle', 'Disjoncteurs divisionnaires', 'Options des circuits', 'Coffret']) assert.ok(r.groupes.includes(g), g);
  assert.equal(r.dd, r.nrcd, 'chaque différentiel compté une fois'); assert.ok(r.courbes >= 2);
  assert.ok(Math.abs(r.ratio - 1.5) < 1e-9, 'symbole à 150 %');
  assert.equal(r.vue, null, 'affichage de l’écran inchangé après l’export');
  /* fenêtre d'export : format SVG et choix du plan */
  await page.click('#btnExport'); await wait(page, 300);
  await page.click('#modal >> text=SVG'); await page.click('#modal .chip:has-text("Câblage")'); await wait(page, 1500);
  assert.equal(await page.locator('.exp-act:not([disabled])').count() > 0, true);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('iPad paysage et portrait, téléphone : pastille, fenêtre des calques et gestionnaire de circuits sans débordement', async () => {
  for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
    const { ctx, page, errors } = await fresh({ viewport: vp, touch: vp.width < 500, mobile: vp.width < 500 });
    await seedPlan(ctx, planV11()); await boot(page);
    const bar = await page.$eval('#peBar', (e) => { const r = e.getBoundingClientRect(); return { x0: r.left, x1: r.right, y1: r.bottom, w: document.documentElement.clientWidth, h: document.documentElement.clientHeight }; });
    assert.ok(bar.x0 >= 0 && bar.x1 <= bar.w && bar.y1 <= bar.h, `pastille visible ${vp.width}`);
    await page.click('#btnVue'); await wait(page, 250);
    const pop = await page.$eval('#calqPop', (e) => { const r = e.getBoundingClientRect(); return { x0: r.left, x1: r.right, sw: e.scrollWidth, cw: e.clientWidth }; });
    assert.ok(pop.x0 >= 0 && pop.x1 <= vp.width + 1, `fenêtre dans l’écran ${vp.width}`); assert.ok(pop.sw <= pop.cw + 1, 'pas de défilement horizontal');
    const tailles = await page.$$eval('#calqPop .cq-b', (l) => l.map((b) => b.getBoundingClientRect().height));
    assert.ok(tailles.every((t) => t >= 40), 'boutons assez grands pour le doigt');
    await page.keyboard.press('Escape'); await page.evaluate(() => { for (const p of document.querySelectorAll('.pop')) p.hidden = true; document.getElementById('scrim').hidden = true; });
    await page.evaluate(async () => (await import('./js/circuitsui.js')).ouvrirGestionnaire()); await wait(page, 250);
    const ins = await page.$eval('#insp', (e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    assert.ok(ins.sw <= ins.cw + 1, `inspecteur sans débordement ${vp.width}`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

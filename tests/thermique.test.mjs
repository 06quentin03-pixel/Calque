// Demandes de l'utilisateur (14 novembre 2026, suite) : déperditions thermiques des murs et des pièces, gaine dans la laine
// de verre du faux plafond, fenêtre « Ajouter un niveau » agrandie, élargissement d'un mur dans un sens choisi ; migration v16 → v17.
// Lancer :  node --test tests/thermique.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { fresh, boot, seedPlan, wait, ROOT } from './outils.mjs';

const imp = (f) => import(path.join(ROOT, 'js', f));
const n = (id, x, y) => ({ id, lv: 'L0', x, y });
const near = (a, b, msg, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${msg} : ${a} ≠ ${b}`);

/* pièce de 4 × 4 m (axes), murs de 20 cm composés de 10 cm de laine (λ saisi 0,035) et 10 cm de béton (λ saisi 2) */
function plan(v) {
  const couches = [{ m: 'laine_verre', e: 10, l: 0.035 }, { m: 'beton', e: 10, l: 2 }];
  return { v: v || 17, id: 'pT', name: 'Thermique', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20, dessous: 'exterieur', dessus: 'toiture',
    sol: { couches: [{ m: 'dalle', e: 20, l: 2 }] }, plafond: { couches: [{ m: 'laine_verre', e: 20, l: 0.04 }] } }],
    nodes: [n('a', 0, 0), n('b', 400, 0), n('c', 400, 400), n('d', 0, 400)],
    walls: [['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']].map(([a, b], i) => ({ id: 'w' + i, lv: 'L0', a, b, th: 20, kind: 'mur', couches: couches.map((c) => Object.assign({}, c)) })),
    openings: [{ id: 'o1', wall: 'w0', kind: 'window', t: 200, w: 100, h: 100, sill: 100, uw: 1.2 }], items: [],
    elec: [{ id: 'r1', lv: 'L0', type: 'rad_elec', x: 200, y: 380, rot: 180, h: 20, p: 1000 }],
    rooms: [{ id: 'R', lv: 'L0', name: 'Chambre', x: 200, y: 200, ti: 20, ach: 0.5 }], dims: [], texts: [], circuits: [], rcds: [], links: [], ducts: [],
    install: { kva: 9, text: { v: -5, st: 'saisie' }, dupt: { v: 0, st: 'saisie' } }, doc: { revisions: [] }, calques: {}, vues: [] };
}
const piece = (p) => ({ label: p.rooms[0], loop: [{ x: 10, y: 10 }, { x: 390, y: 10 }, { x: 390, y: 390 }, { x: 10, y: 390 }], holes: [], area: 380 * 380 });

test('sans écran : U d’une paroi, déperditions d’une pièce, chauffage posé, valeurs manquantes, nettoyage v17', async () => {
  const T = await imp('thermique.js');
  /* U = 1 / (Rsi + e/λ + Rse) : 0,13 + 0,10/0,035 + 0,10/2 + 0,04 */
  const R = 0.13 + 0.1 / 0.035 + 0.05 + 0.04;
  const u = T.uParoi([{ m: 'laine_verre', e: 10, l: 0.035 }, { m: 'beton', e: 10, l: 2 }], 'h', 'ext');
  near(u.u, Math.round(1000 / R) / 1000, 'U'); assert.equal(u.st, 'saisie');
  assert.equal(T.uParoi([{ m: 'laine_verre', e: 10 }], 'h', 'ext').st, 'estimee', 'λ du tableau : estimé');
  const m = T.uParoi([{ m: 'autre', n: 'Liège', e: 4 }], 'h', 'ext');
  assert.equal(m.u, null); assert.match(m.manque[0], /Liège/);
  assert.equal(T.uParoi(null, 'h', 'ext').u, null, 'composition non renseignée : U manquant');
  /* vers un local non chauffé : Rsi des deux côtés */
  near(T.uParoi([{ m: 'beton', e: 20, l: 2 }], 'h', 'int').u, Math.round(1000 / (0.13 + 0.1 + 0.13)) / 1000, 'U intérieur');
  /* pièce : 4 murs (4 m × 2,5 m chacun, fenêtre 1 m² déduite), plancher et plafond 14,44 m², air 0,5 vol/h ; ΔT = 25 K */
  const p = plan(), ctx = { pieces: [piece(p)], toutes: new Map([['L0', [piece(p)]]]) };
  const D = T.deperditionsPiece(p, ctx.pieces[0], ctx);
  const Um = Math.round(1000 / R) / 1000, Us = Math.round(1000 / (0.17 + 0.1 + 0.04)) / 1000, Up = Math.round(1000 / (0.10 + 5 + 0.04)) / 1000;
  const Ht = Um * (40 - 1) + 1.2 * 1 + Us * 14.44 + Up * 14.44, Hv = 0.34 * 0.5 * 14.44 * 2.5;
  near(D.Ht, Ht, 'H parois', 1e-6); near(D.Hv, Hv, 'H air', 1e-9); assert.equal(D.Hpt, 0);
  near(D.total, (Ht + Hv) * 25, 'déperdition totale', 1e-6);
  assert.equal(D.statut, 'saisie'); assert.deepEqual(D.manque, []);
  assert.equal(D.lignes.filter((l) => l.quoi === 'Fenêtre').length, 1);
  assert.deepEqual(T.chauffagePose(p, ctx.pieces[0]), { n: 1, p: 1000, saisi: true });
  /* sans température extérieure : résultat par degré, partiel ; sans température de pièce : 19 °C estimé */
  delete p.install.text; delete p.rooms[0].ti;
  const D2 = T.deperditionsPiece(p, ctx.pieces[0], ctx);
  assert.equal(D2.total, null); assert.equal(D2.statut, 'partiel'); assert.ok(D2.manque.includes('température extérieure de base'));
  assert.equal(D2.ti.v, 19); assert.equal(D2.ti.st, 'estimee');
  /* fiche d'un mur : vue depuis la pièce vers l'extérieur */
  const p3 = plan(), F = T.ficheMur(p3, p3.walls[0], { pieces: [piece(p3)], toutes: new Map([['L0', [piece(p3)]]]) });
  assert.equal(F.ext, true); assert.equal(F.vues.length, 1); assert.equal(F.vues[0].vers, 'Extérieur'); near(F.vues[0].dT, 25, 'ΔT');
  near(F.vues[0].phi, (Um * 9 + 1.2) * 25, 'déperdition du mur', 1e-6);
  /* nettoyage v17 : valeurs invalides retirées, valides gardées, rien de deviné */
  const C = await imp('compositions.js');
  const q = { install: { text: { v: -99 }, dupt: { v: 0.05, st: 'saisie' } }, rooms: [{ ti: 99, nc: 'oui', ach: 0.6 }], levels: [{ id: 'L0', dessous: 'lune', dessus: 'combles', bsol: 3 }],
    walls: [{ couches: [{ m: 'laine_verre', e: 10, l: 0.032 }, { m: 'parpaing', e: 20, r: 0.23 }, { m: 'plaque', e: 1.25, l: -1 }] }],
    openings: [{ uw: 1.1 }, { uw: 0 }], ducts: [{ pose: 'plafond', couche: 'laine_verre' }, { pose: 'cloison', couche: 'laine_verre' }, { pose: 'sol', couche: 'xyz' }] };
  T.nettoyerV17(q, C.nettoyerCouches);
  assert.deepEqual(q.install, { dupt: { v: 0.05, st: 'saisie' } });
  assert.deepEqual(q.rooms[0], { ach: 0.6 });
  assert.deepEqual(q.levels[0], { id: 'L0', dessus: 'combles' });
  assert.deepEqual(q.walls[0].couches, [{ m: 'laine_verre', e: 10, l: 0.032 }, { m: 'parpaing', e: 20, r: 0.23 }, { m: 'plaque', e: 1.25 }]);
  assert.deepEqual(q.openings, [{ uw: 1.1 }, {}]);
  assert.deepEqual(q.ducts, [{ pose: 'plafond', couche: 'laine_verre' }, { pose: 'cloison' }, { pose: 'sol' }]);
});

test('sans écran : élargir un mur vers un côté (murs adjacents, ouvertures, appareils muraux), gaine dans une couche choisie', async () => {
  const C = await imp('compositions.js');
  /* mur du haut en deux tronçons a → e → b, cloison e → f avec une porte, prise sur la face intérieure du mur du haut */
  const mk = () => ({ levels: [{ id: 'L0', h: 250 }], nodes: [n('a', 0, 0), n('e', 400, 0), n('b', 800, 0), n('c', 800, 500), n('d', 0, 500), n('f', 400, 500)],
    walls: [['a', 'e'], ['e', 'b'], ['b', 'c'], ['c', 'f'], ['f', 'd'], ['d', 'a']].map(([a, b], i) => ({ id: 'w' + i, lv: 'L0', a, b, th: 20, kind: 'mur' })).concat([{ id: 'cl', lv: 'L0', a: 'e', b: 'f', th: 7, kind: 'cloison' }]),
    openings: [{ id: 'o', wall: 'cl', kind: 'door', t: 200, w: 80 }], elec: [{ id: 'p', lv: 'L0', type: 'pc', x: 200, y: 10 }] });
  /* vers le côté 2 (extérieur, −y) : la face intérieure (y = 10) ne bouge pas */
  let p = mk();
  const l = C.changerEpaisseur(p, p.walls[0], 30, 'c2');
  assert.deepEqual(l.map((w) => w.id).sort(), ['w0', 'w1'], 'les deux tronçons alignés du même mur');
  assert.deepEqual(['a', 'e', 'b'].map((id) => p.nodes.find((x) => x.id === id).y), [-5, -5, -5]);
  assert.equal(p.walls[0].th, 30); assert.equal(p.walls[1].th, 30);
  assert.equal(p.walls[0].th / 2 + p.nodes[0].y, 10, 'face intérieure à y = 10');
  assert.equal(p.openings[0].t, 205, 'la porte de la cloison garde sa place (la cloison s’allonge vers le haut)');
  assert.deepEqual([p.elec[0].x, p.elec[0].y], [200, 10], 'prise sur la face fixe : immobile');
  /* vers le côté 1 (intérieur) : la face extérieure ne bouge pas, la prise suit la face intérieure */
  p = mk(); C.changerEpaisseur(p, p.walls[0], 30, 'c1');
  assert.deepEqual(['a', 'e', 'b'].map((id) => p.nodes.find((x) => x.id === id).y), [5, 5, 5]);
  assert.deepEqual([p.elec[0].x, p.elec[0].y], [200, 20]); assert.equal(p.openings[0].t, 195);
  /* des deux côtés : rien ne bouge sauf l'épaisseur */
  p = mk(); C.changerEpaisseur(p, p.walls[2], 40, 'centre');
  assert.equal(p.walls[2].th, 40); assert.equal(p.walls[0].th, 20); assert.deepEqual(p.nodes.find((x) => x.id === 'b'), n('b', 800, 0));
  /* avec une composition : l'épaisseur devient celle des couches, dans le sens choisi */
  p = mk(); C.changerEpaisseur(p, p.walls[2], null, 'c1', C.COMPO_BY.get('mp20o').couches, 'Parpaing');
  assert.equal(p.walls[2].th, 37.25); assert.equal(p.walls[2].cn, 'Parpaing');
  near(p.nodes.find((x) => x.id === 'b').x, 800 - 8.6, 'mur de droite (b → c, côté 1 = −x) élargi vers l’intérieur', 0.051);
  /* gaine au plafond : couche choisie (laine de verre) plutôt que le plénum */
  const q = { levels: [{ id: 'L0', h: 250, plafond: { couches: C.COMPO_BY.get('pfpl').couches } }], walls: [], nodes: [] };
  const g = { sys: 'elec', lv: 'L0', pose: 'plafond', dia: 20, pts: [] };
  assert.match(C.logementGaine(q, g)[0].msg, /Plénum/);
  g.couche = 'laine_verre';
  const r = C.logementGaine(q, g)[0];
  assert.equal(r.statut, 'ok'); assert.match(r.msg, /Laine de verre/);
});

test('écran : fenêtre « Ajouter un niveau », sens d’élargissement, panneaux thermiques, migration v16 → v17', async () => {
  const { ctx, page, errors } = await fresh();
  const p0 = plan(16); delete p0.install.text; p0.rooms[0].ti = 99; // valeur invalide : retirée
  await seedPlan(ctx, p0); await boot(page);
  let r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { v: N.P.v, ti: N.P.rooms[0].ti, l: N.P.walls[0].couches[0].l }; });
  assert.deepEqual(r, { v: 17, ti: undefined, l: 0.035 });
  const vers = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open('calque'); q.onsuccess = () => { const t = q.result.transaction('versions').objectStore('versions').getAll(); t.onsuccess = () => res(t.result.map((x) => x.why)); }; }));
  assert.ok(vers.some((w) => /\(v16 → v17\)/.test(w)), 'copie de sécurité');
  const sel = (t, id) => page.evaluate(async ([t, id]) => { const N = await import('./js/noyau.js'), F = await import('./js/interface.js'); N.ui.sel = id ? { t, id } : null; N.ui.inspOpen = true; F.renderInspector(); }, [t, id]);
  /* pièce : section thermique ; température extérieure saisie par une puce */
  await sel('room', 'R'); await wait(page, 150);
  let txt = await page.locator('#insp').innerText();
  assert.match(txt, /THERMIQUE|Thermique/); assert.match(txt, /température extérieure manquante|Manque : température extérieure/);
  await page.locator('#insp .chip', { hasText: '-7 °C' }).first().click(); await wait(page, 200);
  txt = await page.locator('#insp').innerText();
  assert.match(txt, /\d[\d\s ]* W\b/); assert.match(txt, /Puissance à couvrir/);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.install.text.v), -7);
  /* mur : U et déperdition */
  await sel('wall', 'w0'); await wait(page, 150);
  txt = await page.locator('#insp').innerText();
  assert.match(txt, /Coefficient U[\s\S]*W\/m²·K/); assert.match(txt, /Depuis Chambre/);
  /* sens d'élargissement : vers l'extérieur, la face intérieure du mur du haut reste à y = 10 */
  await page.locator('#insp .seg button', { hasText: 'Vers extérieur' }).click(); await wait(page, 150);
  await page.locator('#insp .compo-th').first().waitFor();
  await page.fill('#f-cm-e0', '15'); await page.press('#f-cm-e0', 'Enter'); await wait(page, 200);
  r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const w = N.P.walls[0], a = N.P.nodes.find((x) => x.id === w.a); return { th: w.th, face: a.y + w.th / 2 }; });
  assert.equal(r.th, 25); assert.equal(r.face, 10);
  /* λ saisi d'une couche : remplacé, puis « Revenir à la valeur estimée » */
  await page.fill('#f-cm-l0', '0,032'); await page.press('#f-cm-l0', 'Enter'); await wait(page, 150);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.walls[0].couches[0].l), 0.032);
  /* ajouter un niveau : grande fenêtre ; « Étage avec tous les murs » */
  await sel(null, null); await wait(page, 150);
  await page.locator('#insp button', { hasText: 'Ajouter un niveau' }).click(); await wait(page, 200);
  const box = await page.locator('#modal').boundingBox();
  assert.ok(box && box.width >= 500 && box.height >= 300, 'fenêtre lisible : ' + JSON.stringify(box));
  await page.locator('#modal .choix-niv', { hasText: 'Étage avec tous les murs' }).click(); await wait(page, 200);
  r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { n: N.P.levels.length, w: N.P.walls.filter((w) => w.lv === N.ui.lv).length, c: N.P.walls.filter((w) => w.lv === N.ui.lv && w.couches).length }; });
  assert.deepEqual(r, { n: 2, w: 4, c: 4 });
  /* niveau : bilan thermique */
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), F = await import('./js/interface.js'); F.switchLevel('L0'); });
  await sel(null, null); await wait(page, 150);
  assert.match(await page.locator('#insp').innerText(), /Bilan des pièces chauffées[\s\S]*Chambre[\s\S]*Total du niveau/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

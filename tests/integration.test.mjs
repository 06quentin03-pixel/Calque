// Électroménager intégré dans les meubles (format v18, demande du 15 novembre 2026), puissance conseillée d'un radiateur
// d'après la pièce, sortie de câble proposée pour les radiateurs et prises des appareils dans « Équipement minimal ».
// Lancer :  node --test tests/integration.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, seedPlan, wait, canvasBox, idb } from './outils.mjs';
import { accepte, coulisser, creuxDe, hotesPossibles, integrer, liberer, morceaux, nettoyerV18, nouvelIntegre, synchroniserIntegres } from '../js/integration.js';
import { arrondiConseil } from '../js/thermique.js';
import { FORMULES, calculer } from '../js/formules.js';

const meuble = (id, type, x, y, w, d, rot = 0, o = {}) => Object.assign({ id, lv: 'L0', type, x, y, w, d, rot }, o);
const proche = (a, b, m = 1e-6) => Math.abs(a - b) <= m;

test('moteur : intégrer, suivre le meuble (déplacement, rotation, miroir), coulisser, sortir, meuble supprimé', () => {
  const plaque = meuble('h', 'plaque', 100, 100, 60, 60, 0);
  const four = meuble('f', 'four', 400, 400, 60, 60, 90);
  const P = { items: [plaque, four] };
  assert.ok(accepte(plaque, 'four')); assert.ok(!accepte(plaque, 'lave_linge')); assert.ok(!accepte(four, 'four'));
  assert.deepEqual(hotesPossibles(P, four).map((x) => x.id), [], 'trop loin');
  four.x = 110; four.y = 90;
  assert.deepEqual(hotesPossibles(P, four).map((x) => x.id), ['h']);
  assert.ok(integrer(P, four, plaque));
  assert.equal(four.dans, 'h'); assert.equal(four.ox, 0, 'même largeur : centré'); assert.equal(four.rot, 0); assert.equal(four.x, 100); assert.equal(four.y, 100);
  assert.equal(four.zb, undefined, 'posé au sol sous la plaque');
  /* le meuble bouge, tourne, passe en miroir : l'appareil suit */
  plaque.x = 300; plaque.rot = 90; synchroniserIntegres(P);
  assert.equal(four.x, 300); assert.equal(four.rot, 90);
  /* boucle impossible : la plaque ne peut pas aller dans son four */
  assert.ok(!integrer(P, plaque, four));
  /* plan de travail de 200 : un lave-vaisselle coulisse le long du plan, dos contre le mur (plan plus profond) */
  const pt = meuble('p', 'plan_travail', 0, 0, 200, 65, 0), lv = meuble('l', 'lave_vaisselle', 50, 0, 60, 60);
  P.items.push(pt, lv);
  assert.ok(integrer(P, lv, pt)); assert.equal(lv.ox, 50); assert.ok(proche(lv.y, -2.5), 'dos aligné : ' + lv.y);
  assert.ok(coulisser(lv, pt, { x: 500, y: 0 }) === false, 'tiré loin : il sort');
  assert.ok(coulisser(lv, pt, { x: 120, y: 3 })); assert.equal(lv.ox, 70, 'reste dans la largeur du plan');
  pt.flip = true; synchroniserIntegres(P); assert.equal(lv.x, -70); assert.equal(lv.flip, true);
  /* réfrigérateur sous un plan : hauteur réduite à la place libre */
  const fr = meuble('r', 'frigo', -50, 0, 60, 65); P.items.push(fr);
  assert.ok(integrer(P, fr, pt)); assert.equal(fr.ht, 85);
  /* un nouvel appareil se range à côté de ceux déjà intégrés */
  const n = nouvelIntegre(P, pt, { k: 'll', t: 'lave_linge', n: 'Lave-linge', w: 60, d: 60 }, 'n1');
  assert.equal(n.dans, 'p'); assert.ok(!P.items.filter((x) => x.dans === 'p' && x !== n).some((x) => Math.abs(x.ox - n.ox) < 60), 'pas superposé');
  /* meuble supprimé : ses appareils restent sur place, libres */
  P.items = P.items.filter((x) => x !== pt);
  const x0 = lv.x;
  assert.equal(synchroniserIntegres(P), 3); assert.equal(lv.dans, undefined); assert.equal(lv.ox, undefined); assert.equal(lv.x, x0);
  liberer(four); assert.equal(four.dans, undefined);
});

test('moteur : creux de la maquette 3D, nettoyage v17 → v18, plaque dans un plan de travail', () => {
  const col = meuble('c', 'colonne', 0, 0, 60, 60), mo = meuble('m', 'micro_ondes', 0, 0, 50, 40);
  const P = { items: [col, mo] };
  integrer(P, mo, col);
  assert.equal(mo.zb, 142); assert.ok(proche(mo.y, 10), 'façade alignée sur la colonne : ' + mo.y);
  const hz = (it) => ({ h: it.type === 'colonne' ? 215 : 30, z: it.zb || 0 });
  assert.deepEqual(creuxDe(P, col, hz), [{ x0: -25, x1: 25, z0: 142, z1: 172 }]);
  /* corps de la colonne découpé autour du micro-ondes : aucun morceau ne touche le creux, toute la surface restante est couverte */
  const m = morceaux(-30, 30, 10, 215, [{ x0: -25, x1: 25, z0: 142, z1: 172 }]);
  const aire = m.reduce((s, [a, b, c, d]) => s + (b - a) * (d - c), 0);
  assert.ok(proche(aire, 60 * 205 - 50 * 30, 1e-6), String(aire));
  assert.ok(m.every(([a, b, c, d]) => !(a < 25 && b > -25 && c < 172 && d > 142)));
  assert.deepEqual(morceaux(0, 10, 0, 5, []), [[0, 10, 0, 5]]);
  /* plaque dans un plan de travail, four sous la plaque : la chaîne suit le plan */
  const pt = meuble('p', 'plan_travail', 0, 0, 200, 65), pl = meuble('pl', 'plaque', 30, 0, 60, 60), f = meuble('f', 'four', 30, 0, 60, 60);
  const Q = { items: [pt, pl, f] };
  assert.ok(integrer(Q, pl, pt)); assert.ok(integrer(Q, f, pl));
  pt.x = 1000; synchroniserIntegres(Q);
  assert.equal(pl.x, 1030); assert.equal(f.x, 1030);
  /* migration : champs invalides retirés, rien d'autre ne change */
  const p = nettoyerV18({ items: [{ id: 'a', dans: 3, ox: 2 }, { id: 'b', dans: 'x', ox: 'n' }, { id: 'c', ox: 4 }, { id: 'd', dans: 'h', ox: 5, w: 60 }] });
  assert.deepEqual(p.items, [{ id: 'a' }, { id: 'b', dans: 'x', ox: 0 }, { id: 'c' }, { id: 'd', dans: 'h', ox: 5, w: 60 }]);
});

test('puissance conseillée : arrondi aux 250 W supérieurs, fiche de l’onglet Calculs calculée par le moteur', () => {
  assert.equal(arrondiConseil(620, 0), 750); assert.equal(arrondiConseil(750, 0), 750); assert.equal(arrondiConseil(1180, 500), 750);
  assert.equal(arrondiConseil(400, 1000), 0); assert.equal(arrondiConseil(1001, 0), 1250);
  const F = FORMULES.find((x) => x.id === 'radiateur');
  assert.ok(F, 'fiche « Puissance conseillée d’un radiateur »');
  assert.deepEqual(calculer(F).res, [['P conseillée', '750 W']]);
  assert.deepEqual(calculer(F, { phi: 300, autres: 500 }).res, [['P conseillée', '0 W']]);
});

/* petit plan : une cuisine de 4 × 3 m (température extérieure saisie) avec un radiateur du mobilier, un four, un lave-vaisselle */
function planCuisine(v = 18) {
  const n = (id, x, y) => ({ id, lv: 'L0', x, y });
  return {
    v, id: 'pInt', name: 'Cuisine intégrée',
    levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }],
    nodes: [n('a', 0, 0), n('b', 400, 0), n('c', 400, 300), n('d', 0, 300)],
    walls: [{ id: 'w1', lv: 'L0', a: 'a', b: 'b', th: 20, kind: 'mur' }, { id: 'w2', lv: 'L0', a: 'b', b: 'c', th: 20, kind: 'mur' }, { id: 'w3', lv: 'L0', a: 'c', b: 'd', th: 20, kind: 'mur' }, { id: 'w4', lv: 'L0', a: 'd', b: 'a', th: 20, kind: 'mur' }],
    openings: [{ id: 'o1', wall: 'w3', t: 300, w: 90, kind: 'door', type: 'battante', side: 1, hinge: 0, leaves: 1, h: 204, sill: 0 }],
    items: [{ id: 'pt', lv: 'L0', k: 'pt', type: 'plan_travail', name: 'Plan de travail', x: 110, y: 42.5, w: 200, d: 65, rot: 0 },
      { id: 'pl', lv: 'L0', k: 'pl60', type: 'plaque', name: 'Plaque de cuisson 60', x: 300, y: 40, w: 60, d: 60, rot: 0 },
      { id: 'lv', lv: 'L0', k: 'lv', type: 'lave_vaisselle', name: 'Lave-vaisselle', x: 60, y: 40, w: 60, d: 60, rot: 0 },
      { id: 'rad', lv: 'L0', k: 'rad', type: 'radiateur', name: 'Radiateur', x: 15, y: 180, w: 80, d: 10, rot: 270 }],
    elec: [], rooms: [{ id: 'r1', lv: 'L0', name: 'Cuisine', x: 200, y: 180 }], dims: [], texts: [], circuits: [], rcds: [], links: [], ducts: [],
    install: { kva: 9, text: { v: -7, st: 'saisie', src: 'Test' } },
  };
}

test('écran : migration v17 → v18, ajouter un four sous la plaque, toucher le meuble puis l’appareil, déplacer le meuble, annuler', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, planCuisine(17));
  await boot(page);
  const m = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { v: N.P.v, n: N.P.items.length }; });
  assert.equal(m.v, 18); assert.equal(m.n, 4, 'rien de perdu');
  const vers = await idb(page, 'versions');
  assert.ok(vers.some((w) => /\(v17 → v18\)/.test(w.why)), 'copie de sécurité');
  /* plaque choisie : « Électroménager intégré » › Four */
  await page.evaluate(async () => { const I = await import('./js/interaction.js'); I.select({ t: 'item', id: 'pl' }); });
  await wait(page, 200);
  await page.click('#insp button:not(.volet-tete):text-is("Four")');
  await wait(page, 300);
  let r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const f = N.P.items.find((x) => x.type === 'four'); return f && { dans: f.dans, x: f.x, y: f.y, rot: f.rot }; });
  assert.deepEqual(r, { dans: 'pl', x: 300, y: 40, rot: 0 });
  assert.match(await page.textContent('#insp'), /Four/);
  /* toucher la plaque sur le plan : la plaque ; un second toucher : le four caché dessous */
  const box = await canvasBox(page);
  const ecran = await page.evaluate(async () => { const R = await import('./js/rendu2d.js'); const I = await import('./js/interaction.js'); I.select(null); return { x: 300 * R.V.s + R.V.ox, y: 40 * R.V.s + R.V.oy }; });
  await page.mouse.click(box.x + ecran.x, box.y + ecran.y); await wait(page, 450);
  let sel = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return N.ui.sel && N.P.items.find((x) => x.id === N.ui.sel.id).type; });
  assert.equal(sel, 'plaque');
  await page.mouse.click(box.x + ecran.x, box.y + ecran.y); await wait(page, 450);
  sel = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return N.ui.sel && N.P.items.find((x) => x.id === N.ui.sel.id).type; });
  assert.equal(sel, 'four');
  assert.match(await page.textContent('#insp'), /Intégré dans/);
  /* glisser la plaque : le four suit pendant le geste et après */
  await page.evaluate(async () => { const I = await import('./js/interaction.js'); I.select({ t: 'item', id: 'pl' }); });
  const s = await page.evaluate(async () => { const R = await import('./js/rendu2d.js'); return R.V.s; });
  await page.mouse.move(box.x + ecran.x, box.y + ecran.y); await page.mouse.down();
  for (let k = 1; k <= 6; k++) await page.mouse.move(box.x + ecran.x - k * 5 * s, box.y + ecran.y + k * 15 * s);
  const pendant = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const p = N.P.items.find((x) => x.id === 'pl'), f = N.P.items.find((x) => x.type === 'four'); return [p.x, p.y, f.x, f.y]; });
  await page.mouse.up(); await wait(page, 300);
  assert.equal(pendant[2], pendant[0]); assert.equal(pendant[3], pendant[1]);
  r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const p = N.P.items.find((x) => x.id === 'pl'), f = N.P.items.find((x) => x.type === 'four'); return { p: [p.x, p.y, p.rot], f: [f.x, f.y, f.rot] }; });
  assert.notDeepEqual(r.p, [300, 40, 0], 'la plaque a bougé');
  assert.deepEqual(r.f, r.p, 'le four suit');
  /* annuler revient en arrière (plaque et four ensemble) ; le plan enregistré garde le lien */
  await page.click('#btnUndo'); await wait(page, 300);
  r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const f = N.P.items.find((x) => x.type === 'four'); return [f.x, f.y, f.dans]; });
  assert.deepEqual(r, [300, 40, 'pl']);
  /* lave-vaisselle posé sous le plan de travail : « Intégrer dans « Plan de travail » » */
  await page.evaluate(async () => { const I = await import('./js/interaction.js'); I.select({ t: 'item', id: 'lv' }); });
  await wait(page, 200);
  await page.click('#insp button:has-text("Intégrer dans « Plan de travail »")'); await wait(page, 300);
  r = await page.evaluate(async () => { const N = await import('./js/noyau.js'); const l = N.P.items.find((x) => x.id === 'lv'); return [l.dans, l.ox, l.y]; });
  assert.deepEqual(r, ['pt', -50, 40]);
  /* 3D sans erreur avec les appareils intégrés */
  await page.evaluate(async () => (await import('./js/tableau.js')).setView('3d'));
  await wait(page, 800);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('écran : sortie de câble proposée pour le radiateur, prises du four et du lave-vaisselle, puissance conseillée', async () => {
  const { ctx, page, errors } = await fresh();
  const p = planCuisine(); p.items.push({ id: 'f', lv: 'L0', k: 'four', type: 'four', name: 'Four', x: 300, y: 40, w: 60, d: 60, rot: 0, dans: 'pl', ox: 0 });
  await seedPlan(ctx, p);
  await boot(page);
  /* « Équipement minimal » de la pièce : sortie de câble du radiateur, prises du four et du lave-vaisselle, sortie 32 A */
  const prop = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), G = await import('./js/geometrie.js'), E = await import('./js/equipement.js');
    const r = G.geo('L0').rooms.find((x) => x.label);
    const out = E.equiperPiece(N.P, { lv: 'L0', nom: r.label.name, poly: r.poly, loop: r.loop, aire: r.area / 10000 });
    return out.poses.filter((x) => x.pour).map((x) => [x.type, x.pour, Math.round(x.x), Math.round(x.y)]).sort();
  });
  assert.deepEqual(prop.map((x) => x.slice(0, 2)), [['pc32', 'pl'], ['pc_four', 'f'], ['pc_lv', 'lv'], ['sortie_rad', 'rad']]);
  const sr = prop.find((x) => x[0] === 'sortie_rad');
  assert.equal(sr[2], 10, 'sur la face du mur, derrière le radiateur'); assert.ok(Math.abs(sr[3] - 180) <= 5);
  /* radiateur du mobilier : « Raccordement électrique » › Poser la sortie de câble, de la puissance conseillée */
  await page.evaluate(async () => { const I = await import('./js/interaction.js'); I.select({ t: 'item', id: 'rad' }); });
  await wait(page, 200);
  const txt = await page.textContent('#insp');
  assert.match(txt, /Puissance conseillée/); assert.match(txt, /Déperditions de la pièce/);
  await page.click('#insp button:has-text("Poser : Sortie de câble radiateur")'); await wait(page, 300);
  const e = await page.evaluate(async () => { const N = await import('./js/noyau.js'), G = await import('./js/geometrie.js'), T = await import('./js/thermique.js');
    const s = N.P.elec.find((x) => x.type === 'sortie_rad'); const toutes = new Map(N.P.levels.map((l) => [l.id, G.geo(l.id).rooms])); const r = toutes.get('L0').find((x) => x.label);
    const D = T.deperditionsPiece(N.P, r, { toutes, te: T.tExt(N.P), pieces: toutes.get('L0') });
    return { p: s && s.p, total: D.total, sel: N.ui.sel && N.ui.sel.t }; });
  assert.ok(e.total > 0); assert.equal(e.p, Math.ceil(e.total / 250) * 250, 'puissance conseillée : déperditions arrondies aux 250 W supérieurs');
  assert.equal(e.sel, 'elec');
  /* panneau du symbole : choix rapides de puissance, conseil et « Prendre » */
  const t2 = await page.textContent('#insp');
  assert.match(t2, /Puissance du chauffage/); assert.match(t2, /Puissance suffisante/);
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), X = await import('./js/interaction.js'); N.P.elec.find((x) => x.type === 'sortie_rad').p = 100; X.commit(); });
  await wait(page, 200);
  assert.match(await page.textContent('#insp'), /Il manque/);
  await page.click(`#insp button:has-text("Prendre")`); await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.elec.find((x) => x.type === 'sortie_rad').p), e.p);
  /* le radiateur est raccordé : plus proposé ; le meuble supprimé libère le four sur place, contrôle du plan sans lien cassé */
  const fin = await page.evaluate(async () => { const N = await import('./js/noyau.js'), G = await import('./js/geometrie.js'), E = await import('./js/equipement.js'), I = await import('./js/integrite.js'), X = await import('./js/interaction.js');
    const r = G.geo('L0').rooms.find((x) => x.label); const els = N.P.elec;
    const a = E.appareilsARaccorder(N.P, { lv: 'L0', loop: r.loop, poly: r.poly }, els).map((x) => x.pour).sort();
    N.P.items = N.P.items.filter((x) => x.id !== 'pl'); N.touch(); X.commit();
    const f = N.P.items.find((x) => x.id === 'f');
    const casse = JSON.parse(JSON.stringify(N.P)); casse.items.push({ id: 'z', lv: 'L0', type: 'four', x: 0, y: 0, w: 60, d: 60, dans: 'absent', ox: 0 });
    return { a, f: [f.dans, f.x], ctl: I.controlerPlan(N.P).length, casse: I.controlerPlan(casse).map((x) => x.code) }; });
  assert.deepEqual(fin.a, ['f', 'lv', 'pl']);
  assert.deepEqual(fin.f, [undefined, 300]); assert.equal(fin.ctl, 0); assert.deepEqual(fin.casse, ['integre-meuble']);
  assert.deepEqual(errors, []);
  await ctx.close();
});

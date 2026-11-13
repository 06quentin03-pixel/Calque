// Reconnaissance des murs d'un plan DXF (traits doubles → murs, portes, fenêtres) : moteur sans écran et import complet.
// Lancer :  node --test tests/dxfmurs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { reconnaitreMurs, segmentsDuDxf } from '../js/dxfmurs.js';
import { lireDxf } from '../js/dxfimport.js';
import { fresh, boot, wait } from './outils.mjs';

/* maison 8 × 6 m : murs de 20 cm, cloison de 7 cm au milieu avec une porte de 80 (arc de débattement),
   fenêtre de 120 dans le mur du haut (tableaux et deux traits de menuiserie) — en centimètres, axe Y vers le bas */
function planEssai() {
  const S = [], A = []; const L = (x0, y0, x1, y1) => S.push({ x0, y0, x1, y1 });
  L(0, 0, 300, 0); L(420, 0, 800, 0); L(800, 0, 800, 600); L(800, 600, 0, 600); L(0, 600, 0, 0);
  L(20, 20, 300, 20); L(420, 20, 396.5, 20); L(403.5, 20, 780, 20);
  L(780, 20, 780, 580); L(780, 580, 403.5, 580); L(396.5, 580, 20, 580); L(20, 580, 20, 20);
  L(300, 0, 300, 20); L(420, 0, 420, 20); L(300, 8, 420, 8); L(300, 12, 420, 12);
  L(396.5, 20, 396.5, 200); L(403.5, 20, 403.5, 200); L(396.5, 280, 396.5, 580); L(403.5, 280, 403.5, 580);
  L(396.5, 200, 403.5, 200); L(396.5, 280, 403.5, 280); L(403.5, 200, 483.5, 200);
  A.push({ x: 403.5, y: 200, r: 80 });
  return { S, A };
}
/* le même plan en fichier DXF, en millimètres, axe Y vers le haut, avec un meuble (cercle) et un texte */
function dxfEssai() {
  const { S, A } = planEssai(), l = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES'];
  for (const s of S) l.push('0', 'LINE', '8', 'MURS', '10', s.x0 * 10, '20', -s.y0 * 10, '11', s.x1 * 10, '21', -s.y1 * 10);
  for (const a of A) l.push('0', 'ARC', '8', 'PORTES', '10', a.x * 10, '20', -a.y * 10, '40', a.r * 10, '50', 270, '51', 360);
  l.push('0', 'CIRCLE', '8', 'MOBILIER', '10', 2000, '20', -3000, '40', 400, '0', 'TEXT', '8', 'TEXTES', '10', 1000, '20', -1000, '40', 200, '1', 'Sejour', '0', 'ENDSEC', '0', 'EOF');
  return l.join('\r\n') + '\r\n';
}

test('reconnaissance : murs avec leur épaisseur, angles fermés, porte (arc), fenêtre (menuiserie), cloison', () => {
  const { S, A } = planEssai();
  const r = reconnaitreMurs(S, A);
  const cle = (m) => [m.a.x, m.a.y, m.b.x, m.b.y, m.th, m.kind].join(' ');
  assert.deepEqual(r.murs.map(cle).sort(), ['10 10 10 590 20 mur', '10 10 790 10 20 mur', '10 590 790 590 20 mur', '400 10 400 590 7 cloison', '790 10 790 590 20 mur'].sort(),
    'axes des murs, prolongés jusqu’aux axes voisins (angles et jonction de la cloison)');
  assert.deepEqual(r.ouvertures.slice().sort((a, b) => a.x - b.x), [{ x: 360, y: 10, w: 120, kind: 'window' }, { x: 400, y: 240, w: 80, kind: 'door' }]);
  /* sans l'arc : la même interruption est un passage libre ; sans menuiserie : idem pour la fenêtre */
  const r2 = reconnaitreMurs(S.filter((s) => !(s.y0 === s.y1 && (s.y0 === 8 || s.y0 === 12))), []);
  assert.deepEqual(r2.ouvertures.map((o) => o.kind).sort(), ['gap', 'gap']);
  /* plan tourné de 30° : même résultat (mêmes longueurs et épaisseurs) */
  const c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6), rot = (x, y) => ({ x: x * c - y * s, y: x * s + y * c });
  const r3 = reconnaitreMurs(S.map((q) => { const a = rot(q.x0, q.y0), b = rot(q.x1, q.y1); return { x0: a.x, y0: a.y, x1: b.x, y1: b.y }; }), A.map((a) => Object.assign(rot(a.x, a.y), { r: a.r })));
  assert.deepEqual(r3.murs.map((m) => [Math.round(Math.hypot(m.b.x - m.a.x, m.b.y - m.a.y)), m.th]).sort(), [[580, 20], [580, 20], [580, 7], [780, 20], [780, 20]].sort());
  assert.deepEqual(r3.ouvertures.map((o) => [o.kind, o.w]).sort(), [['door', 80], ['window', 120]]);
  /* traits simples (pas de traits doubles) : aucun mur inventé */
  assert.deepEqual(reconnaitreMurs([{ x0: 0, y0: 0, x1: 500, y1: 0 }, { x0: 0, y0: 300, x1: 500, y1: 300 }, { x0: 0, y0: 0, x1: 0, y1: 300 }], []).murs, []);
  /* tableau d'une porte face à un mur voisin : pas de faux mur de 20 cm */
  const r4 = reconnaitreMurs([{ x0: 0, y0: 0, x1: 400, y1: 0 }, { x0: 0, y0: 20, x1: 400, y1: 20 }, { x0: 10, y0: 30, x1: 10, y1: 50 }, { x0: 0, y0: 0, x1: 0, y1: 20 }], []);
  assert.equal(r4.murs.length, 1);
});

test('porte au bout d’un mur contre un mur en travers (près d’un angle) ; résultat indépendant de la position du dessin', () => {
  /* mur de 20 cm en haut (y 0 → 20), mur de 20 cm à gauche (x 0 → 20), cloison de 7 cm (y 196,5 → 203,5) qui s'arrête
     à 80 cm de la face du mur de gauche, arc de débattement de 80 cm au bout de la cloison */
  const essai = (dx, dy, arc) => {
    const S = [], L = (x0, y0, x1, y1) => S.push({ x0: x0 + dx, y0: y0 + dy, x1: x1 + dx, y1: y1 + dy });
    L(0, 0, 600, 0); L(20, 20, 600, 20); L(0, 0, 0, 400); L(20, 20, 20, 400); L(100, 196.5, 400, 196.5); L(100, 203.5, 400, 203.5);
    return reconnaitreMurs(S, arc ? [{ x: 100 + dx, y: 203.5 + dy, r: 80 }] : []);
  };
  const r = essai(0, 0, true), cl = r.murs.find((m) => m.th === 7);
  assert.deepEqual([Math.min(cl.a.x, cl.b.x), Math.max(cl.a.x, cl.b.x), cl.a.y], [10, 400, 200], 'cloison prolongée jusqu’à l’axe du mur de gauche');
  assert.deepEqual(r.ouvertures, [{ x: 60, y: 200, w: 80, kind: 'door' }]);
  /* sans arc : rien n'est deviné */
  const s = essai(0, 0, false), c2 = s.murs.find((m) => m.th === 7);
  assert.equal(Math.min(c2.a.x, c2.b.x), 100); assert.deepEqual(s.ouvertures, []);
  /* même dessin déplacé : même résultat, déplacé */
  const t = essai(12345.6, -9876.5, true), dep = (m) => [m.a.x - 12345.6, m.a.y + 9876.5, m.b.x - 12345.6, m.b.y + 9876.5, m.th].map((v) => Math.round(v));
  const tel = (m) => [m.a.x, m.a.y, m.b.x, m.b.y, m.th].map((v) => Math.round(v));
  assert.deepEqual(t.murs.map(dep), r.murs.map(tel));
  assert.equal(t.ouvertures.length, 1); assert.equal(t.ouvertures[0].kind, 'door');
});

test('du fichier DXF aux segments : unité, axe Y retourné, arcs gardés, courbes et calques écartés', () => {
  const R = lireDxf(dxfEssai());
  assert.equal(R.unite, 4); assert.equal(R.traits.filter((t) => t.arc).length, 1); assert.equal(R.traits.filter((t) => t.courbe).length, 1);
  const { segments, arcs } = segmentsDuDxf(R, new Set(['MURS', 'PORTES']), (X, Y) => ({ x: X * 0.1, y: -Y * 0.1 }), 0.1);
  assert.equal(segments.length, 23); assert.deepEqual(arcs.map((a) => [Math.round(a.x * 10) / 10, Math.round(a.y), Math.round(a.r)]), [[403.5, 200, 80]]);
  const r = reconnaitreMurs(segments, arcs);
  assert.equal(r.murs.length, 5); assert.deepEqual(r.ouvertures.map((o) => o.kind).sort(), ['door', 'window']);
});

test('import DXF avec « Créer aussi les murs » : murs, porte, fenêtre et pièces dans le plan, une seule étape d’annulation', async () => {
  const { ctx, page, errors } = await fresh();
  await ctx.addInitScript(() => { localStorage.setItem('calque.cur', ''); });
  await boot(page);
  /* plan vide */
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'), H = await import('./js/historique.js'); N.setP(N.normalizePlan(N.blankPlan('Depuis un DXF'))); N.touch(); H.historyReset(); I.refreshUI(); });
  await page.evaluate(async (txt) => { const F = await import('./js/fond.js'); await F.importFond(new File([txt], 'maison.dxf')); }, dxfEssai());
  await page.waitForSelector('#dxfMursChip');
  await page.click('#dxfCalques >> text=MOBILIER'); // le calque des textes est gardé : il donne le nom des pièces
  await page.click('#dxfMursChip'); assert.equal(await page.getAttribute('#dxfMursChip', 'aria-pressed'), 'true');
  await page.click('#modal >> text=Importer comme fond de plan'); await wait(page, 500);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), G = await import('./js/geometrie.js'), H = await import('./js/historique.js'), P = N.P;
    const g = G.geo(N.ui.lv), f = P.fonds[0];
    return { murs: P.walls.map((w) => [w.th, w.kind]), op: P.openings.map((o) => [o.kind, o.w]).sort(), pieces: g.rooms.map((r) => Math.round(r.area / 1000) / 10).sort(), noms: g.rooms.map((r) => r.label.name).sort(), fond: !!f && f.cal, undo: H.H.u.length, toast: document.getElementById('toast').textContent,
      larg: Math.round(Math.max(...P.nodes.map((n) => n.x)) - Math.min(...P.nodes.map((n) => n.x))) };
  });
  assert.ok(r.fond); assert.equal(r.undo, 1);
  assert.equal(r.murs.filter((m) => m[1] === 'mur').length >= 4, true); assert.ok(r.murs.some((m) => m[0] === 7 && m[1] === 'cloison'));
  assert.deepEqual(r.op, [['door', 80], ['window', 120]]);
  assert.equal(r.larg, 780, 'échelle exacte : 7,80 m entre les axes des murs extérieurs');
  /* deux pièces : 3,765 × 5,60 m ≈ 21,1 m² chacune (cloison de 7 cm au milieu) */
  assert.deepEqual(r.pieces, [21.1, 21.1]);
  assert.equal(r.noms.length, 2); assert.match(r.noms[0], /^Pièce \d+$/); assert.equal(r.noms[1], 'Sejour', 'la pièce où le dessin écrit « Sejour » prend ce nom ; l’autre garde son nom par défaut');
  assert.match(r.toast, /murs et 2 ouvertures proposés.*1 portes, 1 fenêtres.*à vérifier/);
  await page.click('#btnUndo'); await wait(page, 200);
  assert.deepEqual(await page.evaluate(async () => { const P = (await import('./js/noyau.js')).P; return [P.walls.length, P.openings.length, P.fonds.length]; }), [0, 0, 0]);
  assert.deepEqual(errors, []);
  await ctx.close();
});

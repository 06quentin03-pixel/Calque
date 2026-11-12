// Accrochage aux traits d'un plan DXF importé en fond (js/fondtraits.js) : axes des murs pour les outils Mur et Pièce,
// extrémités des traits pour les autres ; suit le fond déplacé, tourné ou remis à l'échelle.
// Lancer :  node --test tests/fondtraits.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, wait } from './outils.mjs';

/* maison 8 × 6 m dessinée par les faces de murs de 20 cm (en mm, comme un plan d'architecte) */
function dxfMaison() {
  const L = [], seg = (x0, y0, x1, y1) => L.push('0', 'LINE', '8', 'MURS', '10', x0 * 10, '20', -y0 * 10, '11', x1 * 10, '21', -y1 * 10);
  seg(0, 0, 800, 0); seg(800, 0, 800, 600); seg(800, 600, 0, 600); seg(0, 600, 0, 0);
  seg(20, 20, 780, 20); seg(780, 20, 780, 580); seg(780, 580, 20, 580); seg(20, 580, 20, 20);
  return ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '4', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES', ...L, '0', 'ENDSEC', '0', 'EOF'].join('\r\n') + '\r\n';
}

test('accrochage au fond DXF : axes pour les murs (pas les faces), extrémités pour la cote ; suit le fond déplacé et tourné', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), St = await import('./js/stockage.js'), R = await import('./js/rendu2d.js'); St.openPlan(N.blankPlan('Fond'), 'pF', { quiet: true }); R.V.s = 1; R.V.ox = 0; R.V.oy = 0; });
  await page.evaluate(async (txt) => { const F = await import('./js/fond.js'); await F.importFond(new File([txt], 'maison.dxf')); }, dxfMaison());
  await page.waitForSelector('#modal >> text=Importer comme fond de plan'); await page.click('#modal >> text=Importer comme fond de plan');
  await wait(page, 600);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'), FT = await import('./js/fondtraits.js'), R = await import('./js/rendu2d.js');
    const f = N.P.fonds[0];
    /* coin extérieur du dessin et coin de l'axe, en coordonnées du plan : centre du fond = centre du dessin (400, 300) */
    const coin = (x, y) => ({ x: f.cx + (x - 400), y: f.cy + (y - 300) });
    R.V.s = 1; // tolérance : 12 cm
    const snap = (tool, p) => { N.ui.tool = tool; const q = I.snapPoint(p, { corners: true }); return { x: Math.round(q.x * 10) / 10, y: Math.round(q.y * 10) / 10, kind: q.kind }; };
    const a = coin(0, 0), ax = coin(10, 10), out = {};
    out.murCoinExt = snap('wall', { x: a.x + 3, y: a.y + 4 });   // près du coin extérieur : l'axe (10,10) est à moins de 12 cm
    out.murMilieu = snap('wall', { x: f.cx + 5, y: ax.y + 4 });  // près de l'axe du mur du haut : projection sur l'axe
    out.coteCoin = snap('dim', { x: a.x + 3, y: a.y + 4 });      // cote : extrémité du trait (coin extérieur)
    out.attendu = { axe: { x: ax.x, y: ax.y }, coin: { x: a.x, y: a.y } };
    /* fond déplacé de 100 cm et tourné de 90° : l'accrochage suit */
    f.cx += 100; f.rot = 90; const b = { x: f.cx + 300 - 10, y: f.cy - 400 + 10 }; // axe (10,10) tourné de 90° autour du centre
    out.tourne = snap('wall', { x: b.x + 2, y: b.y - 3 }); out.attTourne = b;
    out.persiste = !!(await (await import('./js/stockage.js')).DB.get('meta', 'fondtraits:' + f.img));
    return out;
  });
  /* le dessin est centré sur l'image à 0,5 mm près (image arrondie au pixel) : tolérance de 1,5 mm */
  const pres = (q, x, y, kind, msg) => assert.ok(Math.abs(q.x - x) <= 0.15 && Math.abs(q.y - y) <= 0.15 && q.kind === kind, `${msg} : ${JSON.stringify(q)} au lieu de ${x}, ${y}, ${kind}`);
  pres(r.murCoinExt, r.attendu.axe.x, r.attendu.axe.y, 'fond', 'mur : coin de l’axe, pas de la face');
  pres(r.murMilieu, r.murMilieu.x, r.attendu.axe.y, 'fondAxe', 'mur : projection sur l’axe du mur du haut'); assert.ok(Math.abs(r.murMilieu.x - (r.attendu.axe.x + 395)) <= 0.15);
  pres(r.coteCoin, r.attendu.coin.x, r.attendu.coin.y, 'fond', 'cote : extrémité du trait');
  assert.ok(Math.abs(r.tourne.x - r.attTourne.x) <= 0.25 && Math.abs(r.tourne.y - r.attTourne.y) <= 0.25 && r.tourne.kind === 'fond', JSON.stringify(r.tourne) + ' ' + JSON.stringify(r.attTourne));
  assert.ok(r.persiste, 'traits enregistrés sur l’appareil');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('tracer les murs sur un fond DXF en visant à peu près les coins : murs exactement sur les axes, pièce de 7,60 × 5,60 m', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), St = await import('./js/stockage.js'); St.openPlan(N.blankPlan('Fond'), 'pF2', { quiet: true }); });
  await page.evaluate(async (txt) => { const F = await import('./js/fond.js'); await F.importFond(new File([txt], 'maison.dxf')); }, dxfMaison());
  await page.waitForSelector('#modal >> text=Importer comme fond de plan'); await page.click('#modal >> text=Importer comme fond de plan');
  await wait(page, 600);
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), R = await import('./js/rendu2d.js'), I = await import('./js/interaction.js'); const f = N.P.fonds[0]; R.V.s = 0.5; R.V.ox = 150 - (f.cx - 400) * 0.5; R.V.oy = 250 - (f.cy - 300) * 0.5; I.requestRender(); });
  await page.click('.tool[data-tool="wall"]');
  const b = await page.$eval('#cv', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  /* écran (vue à 0,5) : le coin (0,0) du dessin est en (150, 250) ; on vise à 6-8 cm près des coins EXTÉRIEURS */
  for (const [x, y] of [[0, 0], [800, 0], [800, 600], [0, 600], [0, 0]]) { await page.mouse.click(b.x + 150 + x / 2 + (x ? -3 : 3), b.y + 250 + y / 2 + (y ? -4 : 4)); await wait(page, 120); }
  await page.keyboard.press('Escape'); await wait(page, 200);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), G = await import('./js/geometrie.js'), f = N.P.fonds[0];
    return { murs: N.P.walls.length, pts: N.P.nodes.map((n) => [Math.round(n.x - f.cx + 400), Math.round(n.y - f.cy + 300)]).sort((a, b) => a[0] - b[0] || a[1] - b[1]), aires: G.geo(N.ui.lv).rooms.map((q) => Math.round(q.area / 100) / 100) };
  });
  assert.equal(r.murs, 4);
  assert.deepEqual(r.pts, [[10, 10], [10, 590], [790, 10], [790, 590]], 'angles des murs sur les axes du dessin');
  assert.deepEqual(r.aires, [42.56], 'pièce intérieure de 7,60 × 5,60 m');
  assert.deepEqual(errors, []);
  await ctx.close();
});

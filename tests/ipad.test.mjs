// Tests de la phase 1c : rendu des gros plans, annuler/rétablir, Apple Pencil, barre du haut sur téléphone.
// Lancer depuis la racine du dépôt :  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, fresh, wait, boot, seedPlan, storedPlan, canvasBox, bigPlan } from './outils.mjs';

/* pixels du plan (canevas 2D), lus dans la page */
async function canvasPixels(page) {
  return page.evaluate(() => {
    const cv = document.getElementById('cv'), d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    let s = ''; for (let i = 0; i < d.length; i += 0x8000) s += String.fromCharCode.apply(null, d.subarray(i, i + 0x8000));
    return btoa(s);
  });
}
function diffCount(a, b) {
  const A = Buffer.from(a, 'base64'), B = Buffer.from(b, 'base64');
  if (A.length !== B.length) return Infinity;
  let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 24) n++;
  return n;
}
const nonPaper = (a) => { const A = Buffer.from(a, 'base64'); const r = A[0], g = A[1], b = A[2]; let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - r) + Math.abs(A[i + 1] - g) + Math.abs(A[i + 2] - b) > 60) n++; return n; };

/* même suite de vues dans deux pages : l'une normale, l'autre avec un réglage de diagnostic */
async function viewsOf(query) {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, bigPlan(5));
  await boot(page, query);
  const shots = [];
  await page.click('#zFit'); await wait(page, 200); shots.push(await canvasPixels(page));
  for (let i = 0; i < 6; i++) await page.click('#zIn');
  await wait(page, 200); shots.push(await canvasPixels(page));
  const b = await canvasBox(page);
  await page.mouse.move(b.x + b.w / 2, b.y + b.h / 2);
  await page.mouse.wheel(1300, 900); await wait(page, 200); shots.push(await canvasPixels(page)); // bord du plan
  await page.mouse.wheel(-377, -211); await wait(page, 200); shots.push(await canvasPixels(page)); // objets coupés par le bord de l'écran
  await ctx.close();
  return { shots, errors };
}

test('gros plan : le rendu limité à la zone visible est identique au rendu complet', async () => {
  const a = await viewsOf(''), b = await viewsOf('?debug=nocull');
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
  for (let i = 0; i < a.shots.length; i++) {
    assert.ok(nonPaper(a.shots[i]) > 2000, `vue ${i} : le plan est bien dessiné`);
    assert.equal(diffCount(a.shots[i], b.shots[i]), 0, `vue ${i} : aucun pixel différent`);
  }
});

test('gros plan : l’image mémorisée du plan donne le même résultat pendant le tracé d’un mur', async () => {
  async function run(query) {
    const { ctx, page, errors } = await fresh();
    await seedPlan(ctx, bigPlan(4));
    await boot(page, query);
    const b = await canvasBox(page);
    await page.click('.tool[data-tool="wall"]');
    const shots = [];
    await page.mouse.click(b.x + 300, b.y + 300); await wait(page, 200);
    for (let i = 0; i < 10; i++) await page.mouse.move(b.x + 320 + i * 17, b.y + 305 + i * 3);
    await wait(page, 200); shots.push(await canvasPixels(page)); // aperçu du mur au-dessus de l'image mémorisée
    await page.mouse.click(b.x + 500, b.y + 300); await wait(page, 300);
    await page.mouse.move(b.x + 520, b.y + 420); await wait(page, 200); shots.push(await canvasPixels(page)); // le nouveau mur apparaît
    await page.keyboard.press('Escape'); await wait(page, 200);
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z'); await wait(page, 300); shots.push(await canvasPixels(page));
    await ctx.close();
    return { shots, errors };
  }
  const a = await run('?debug=cache'), b = await run('?debug=nocache');
  assert.deepEqual(a.errors, []); assert.deepEqual(b.errors, []);
  for (let i = 0; i < a.shots.length; i++) assert.equal(diffCount(a.shots[i], b.shots[i]), 0, `image ${i} identique`);
  assert.ok(diffCount(a.shots[0], a.shots[1]) > 50, 'le mur ajouté est visible');
});

test('annuler/rétablir : les blocs inchangés sont partagés entre les étapes', async () => {
  const lib = await import(path.join(ROOT, 'js', 'historique.js')); // module sans accès à l'écran : utilisable par Node
  const P = bigPlan(6);
  const s0 = lib.packPlan(P, null);
  assert.deepEqual(lib.unpackPlan(s0), JSON.parse(JSON.stringify(P)), 'le plan est restitué à l’identique');
  assert.ok(lib.samePack(lib.packPlan(P, s0), s0), 'sans modification, pas de nouvelle étape');
  P.elec[100].x += 10;
  const s1 = lib.packPlan(P, s0);
  assert.ok(!lib.samePack(s1, s0));
  assert.ok(s1.fresh < s1.size / 10, `une petite modification coûte moins de 10 % d’un état complet (${s1.fresh} caractères sur ${s1.size})`);
  assert.equal(lib.unpackPlan(s1).elec[100].x, P.elec[100].x);
  assert.equal(lib.unpackPlan(s0).elec[100].x, P.elec[100].x - 10, 'l’état précédent est intact');
});

test('annuler/rétablir sur un gros plan : retour exact à l’état de départ', async () => {
  const { ctx, page, errors } = await fresh();
  await seedPlan(ctx, bigPlan(4, 'pUNDO'));
  await boot(page); await wait(page, 600);
  const start = await storedPlan(page, 'pUNDO');
  const b = await canvasBox(page);
  await page.click('.tool[data-tool="room"]');
  for (const [x, y] of [[150, 150], [400, 420]]) {
    await page.mouse.move(b.x + x, b.y + y); await page.mouse.down();
    await page.mouse.move(b.x + x + 120, b.y + y + 100, { steps: 6 }); await page.mouse.up(); await wait(page, 200);
  }
  await wait(page, 1300);
  const edited = await storedPlan(page, 'pUNDO');
  assert.ok(edited.walls.length >= start.walls.length + 8, 'deux pièces ajoutées (des murs existants peuvent être coupés)');
  await page.click('#btnUndo'); await page.click('#btnUndo'); await wait(page, 1400);
  const undone = await storedPlan(page, 'pUNDO');
  for (const k of ['nodes', 'walls', 'openings', 'items', 'elec', 'rooms', 'links', 'ducts', 'dims', 'texts']) assert.deepEqual(undone[k], start[k], `${k} identiques après annulation`);
  await page.click('#btnRedo'); await page.click('#btnRedo'); await wait(page, 1400);
  const redone = await storedPlan(page, 'pUNDO');
  assert.deepEqual(redone.walls, edited.walls, 'rétablir redonne les deux pièces');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* événements de pointeur simulés : stylet (pen) ou doigt (touch) */
function ptr(page, type, kind, id, x, y) {
  return page.evaluate(([type, kind, id, x, y]) => {
    const cv = document.getElementById('cv'), r = cv.getBoundingClientRect();
    const down = type === 'pointerdown' || type === 'pointermove' && kind !== 'hover';
    cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: id, pointerType: kind === 'hover' ? 'pen' : kind, isPrimary: true,
      clientX: r.left + x, clientY: r.top + y, button: type === 'pointermove' ? -1 : 0, buttons: down && type !== 'pointerup' ? 1 : 0, pressure: down ? 0.5 : 0 }));
  }, [type, kind, id, x, y]);
}
const hintText = (page) => page.evaluate(() => (document.getElementById('hint') || {}).textContent || '');

test('Apple Pencil : le stylet dessine, le doigt déplace le plan, la paume est ignorée', async () => {
  const { ctx, page, errors } = await fresh({ touch: true });
  await boot(page);
  await page.click('#btnMenu'); await page.click('#menuPop button:has-text("Nouveau plan")'); await wait(page);
  const id = await page.evaluate(() => localStorage.getItem('calque.cur'));
  await page.click('.tool[data-tool="wall"]'); await wait(page, 200);
  // premier contact du stylet : le mode Apple Pencil s'active
  await ptr(page, 'pointerdown', 'pen', 11, 200, 200); await ptr(page, 'pointerup', 'pen', 11, 200, 200); await wait(page, 200);
  const st = JSON.parse(await page.evaluate(() => localStorage.getItem('calque.settings')));
  assert.equal(st.pencil, true, 'mode Apple Pencil activé au premier usage du stylet');
  assert.match(await hintText(page), /deuxième angle/, 'le stylet a posé le point de départ');
  // le doigt fait glisser le plan, sans dessiner
  const before = await canvasPixels(page);
  await ptr(page, 'pointerdown', 'touch', 21, 400, 300);
  for (let i = 1; i <= 6; i++) await ptr(page, 'pointermove', 'touch', 21, 400 + i * 15, 300 + i * 10);
  await ptr(page, 'pointerup', 'touch', 21, 490, 360); await wait(page, 300);
  assert.match(await hintText(page), /deuxième angle/, 'le doigt n’a pas dessiné');
  assert.ok(diffCount(before, await canvasPixels(page)) > 20, 'le plan a bougé sous le doigt');
  // le stylet dessine pendant que la paume touche l'écran : la paume est ignorée
  await ptr(page, 'pointerdown', 'pen', 12, 500, 380);
  await ptr(page, 'pointerdown', 'touch', 22, 650, 600); await ptr(page, 'pointermove', 'touch', 22, 700, 650); await ptr(page, 'pointerup', 'touch', 22, 700, 650);
  await ptr(page, 'pointerup', 'pen', 12, 500, 380); await wait(page, 1400);
  const plan = await storedPlan(page, id);
  assert.equal(plan.walls.length, 1, 'un mur tracé au stylet, rien par le doigt ni la paume');
  // survol du stylet (sans toucher) : aperçu du mur suivant, sans rien ajouter
  await ptr(page, 'pointermove', 'hover', 12, 560, 250); await wait(page, 200);
  assert.equal((await storedPlan(page, id)).walls.length, 1);
  // le réglage est visible et modifiable dans Affichage
  await page.keyboard.press('Escape');
  await page.click('#btnView');
  const sw = page.locator('#viewPop button[role="switch"]:has-text("Le stylet dessine")');
  assert.equal(await sw.getAttribute('aria-checked'), 'true');
  await sw.click();
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('calque.settings'))).pencil, false);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('Apple Pencil désactivé : le doigt dessine toujours comme avant', async () => {
  const { ctx, page, errors } = await fresh({ touch: true });
  await ctx.addInitScript(() => localStorage.setItem('calque.settings', JSON.stringify({ pencil: false, pencilSeen: true })));
  await boot(page);
  await page.click('#btnMenu'); await page.click('#menuPop button:has-text("Nouveau plan")'); await wait(page);
  const id = await page.evaluate(() => localStorage.getItem('calque.cur'));
  await page.click('.tool[data-tool="wall"]'); await wait(page, 200);
  await ptr(page, 'pointerdown', 'touch', 31, 200, 200); await ptr(page, 'pointerup', 'touch', 31, 200, 200); await wait(page, 100);
  await ptr(page, 'pointerdown', 'touch', 32, 450, 200); await ptr(page, 'pointerup', 'touch', 32, 450, 200); await wait(page, 1400);
  assert.equal((await storedPlan(page, id)).walls.length, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('barre du haut : rien ne déborde sur téléphone, une seule ligne sur iPad', async () => {
  for (const [w, h] of [[390, 844], [820, 1180], [1180, 820]]) {
    const { ctx, page, errors } = await fresh({ viewport: { width: w, height: h }, touch: w < 1000, mobile: w < 500 });
    await boot(page);
    const r = await page.evaluate(() => {
      const bar = document.querySelector('.topbar'), out = [];
      for (const el of bar.children) { const q = el.getBoundingClientRect(); if (q.width && (q.left < -0.5 || q.right > innerWidth + 0.5)) out.push(el.id || el.className); }
      return { sw: document.documentElement.scrollWidth, out, hBar: bar.getBoundingClientRect().height, nameW: document.getElementById('btnProj').getBoundingClientRect().width };
    });
    assert.equal(r.sw, w, `${w} px : pas de défilement horizontal`);
    assert.deepEqual(r.out, [], `${w} px : aucun bouton hors de l’écran`);
    assert.ok(r.nameW > 90, `${w} px : le nom du plan reste lisible`);
    if (w >= 820) assert.ok(r.hBar < 50, `${w} px : barre sur une seule ligne`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

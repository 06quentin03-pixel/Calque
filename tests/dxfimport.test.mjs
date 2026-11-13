// Import d'un plan DXF en fond de plan : lecteur sans écran js/dxfimport.js, puis import dans l'application.
// Lancer :  node --test tests/dxfimport.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decoderDxf, empriseDxf, estDwg, lireDxf, texteM, uniteProbable } from '../js/dxfimport.js';
import { DxfCtx, buildDxf, dxfOctets } from '../js/dxf.js';
import { fresh, boot, wait } from './outils.mjs';

const dxf = (...paires) => paires.map((v) => String(v)).join('\r\n') + '\r\n';
/* plan d'architecte de test, en millimètres : pièce 8 × 6 m, cloison, arc de porte, cercle, bloc tourné et agrandi,
   textes, calque gelé, hachure (non reprise), objet isolé à 900 m */
const ARCHI = dxf(
  0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1024', 9, '$INSUNITS', 70, 4, 0, 'ENDSEC',
  0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 0, 'LAYER', 2, 'MURS', 70, 0, 62, 7, 0, 'LAYER', 2, 'MOBILIER', 70, 0, 62, 3, 0, 'LAYER', 2, 'GELE', 70, 1, 62, 1, 0, 'ENDTAB', 0, 'ENDSEC',
  0, 'SECTION', 2, 'BLOCKS', 0, 'BLOCK', 8, '0', 2, 'CHAISE', 70, 0, 10, 100, 20, 0, 0, 'LINE', 8, '0', 10, 100, 20, 0, 11, 600, 21, 0, 0, 'ENDBLK', 0, 'ENDSEC',
  0, 'SECTION', 2, 'ENTITIES',
  0, 'LWPOLYLINE', 8, 'MURS', 90, 4, 70, 1, 10, 0, 20, 0, 10, 8000, 20, 0, 10, 8000, 20, 6000, 10, 0, 20, 6000,
  0, 'LWPOLYLINE', 8, 'MURS', 90, 2, 70, 0, 10, 1000, 20, 1000, 42, 1, 10, 3000, 20, 1000,
  0, 'LINE', 8, 'MURS', 10, 0, 20, 3000, 11, 8000, 21, 3000,
  0, 'ARC', 8, 'MURS', 10, 4000, 20, 3000, 40, 900, 50, 0, 51, 90,
  0, 'CIRCLE', 8, 'MOBILIER', 10, 6000, 20, 4500, 40, 500,
  0, 'INSERT', 8, 'MOBILIER', 2, 'CHAISE', 10, 2000, 20, 2000, 41, 2, 42, 2, 50, 90,
  0, 'TEXT', 8, 'MURS', 10, 1000, 20, 5000, 40, 250, 1, 'S\\U+00E9jour',
  0, 'MTEXT', 8, 'MURS', 10, 5000, 20, 5000, 40, 200, 71, 1, 1, '{\\fArial|b0;Cuisine}\\P12 m²',
  0, 'LINE', 8, 'GELE', 10, 0, 20, 0, 11, 100, 21, 100,
  0, 'LINE', 8, 'MURS', 10, 900000, 20, 900000, 11, 900100, 21, 900000,
  0, 'LINE', 8, 'MURS', 67, 1, 10, 0, 20, 0, 11, 5, 21, 5,
  0, 'HATCH', 8, 'MURS', 10, 0, 20, 0,
  0, 'ENDSEC', 0, 'EOF');

test('lecture d’un DXF : polylignes, renflement, arc, cercle, bloc développé, textes, calques, unité, objets non repris', () => {
  const R = lireDxf(ARCHI);
  assert.equal(R.version, 'AC1024'); assert.equal(R.unite, 4);
  assert.deepEqual([...R.calques.entries()].map(([n, c]) => [n, c.n, c.masque]), [['MURS', 7, false], ['MOBILIER', 2, false], ['GELE', 1, true]]);
  assert.deepEqual(R.ignores, { HATCH: 1 });
  const murs = R.traits.filter((t) => t.l === 'MURS');
  assert.deepEqual(murs[0].p, [0, 0, 8000, 0, 8000, 6000, 0, 6000, 0, 0], 'polyligne fermée');
  /* renflement 1 = demi-cercle de (1000,1000) à (3000,1000), centre (2000,1000), passant par le bas (sens direct) */
  const dc = murs[1].p; assert.ok(dc.length > 20);
  for (let i = 0; i < dc.length; i += 2) assert.ok(Math.abs(Math.hypot(dc[i] - 2000, dc[i + 1] - 1000) - 1000) < 1e-6);
  assert.ok(Math.min(...dc.filter((v, i) => i % 2)) < 1 && Math.max(...dc.filter((v, i) => i % 2)) < 1000.001, 'le demi-cercle passe par y = 0');
  /* arc de 0° à 90° */
  const arc = murs[3].p; assert.deepEqual([arc[0], arc[1]].map(Math.round), [4900, 3000]); assert.deepEqual(arc.slice(-2).map(Math.round), [4000, 3900]);
  /* bloc : base (100,0), échelle 2, tourné de 90°, inséré en (2000,2000) ; son calque 0 prend celui de l'insertion */
  const mob = R.traits.filter((t) => t.l === 'MOBILIER');
  assert.equal(mob[0].f, true, 'cercle fermé'); assert.deepEqual(mob[1].p.map(Math.round), [2000, 2000, 2000, 3000]);
  assert.deepEqual(R.textes.map((t) => [t.s, t.h]), [['Séjour', 250], ['Cuisine 12 m²', 200]]);
  assert.equal(texteM('\\A1;{\\H0.7x;\\C1;R+1} %%c20'), 'R+1 Ø20');
  /* emprise : calque gelé écarté, objet isolé à 900 m écarté et signalé */
  const cal = new Set(['MURS', 'MOBILIER']), em = empriseDxf(R, cal);
  assert.deepEqual([em.x0, em.y0, em.x1, em.y1, em.isoles], [0, 0, 8000, 6000, true]);
  assert.equal(empriseDxf(R, new Set(['RIEN'])), null);
  assert.deepEqual(uniteProbable(R, em), { u: 4, sure: true });
  assert.deepEqual(uniteProbable({ unite: null }, { x0: 0, x1: 12, y0: 0, y1: 9 }), { u: 6, sure: false }, '12 unités : des mètres, à vérifier');
  assert.deepEqual(uniteProbable({ unite: null }, { x0: 0, x1: 1200, y0: 0, y1: 900 }), { u: 5, sure: false });
  /* unité du fichier invraisemblable (vrai plan américain : dessiné en pouces, annoncé en millimètres → 87 cm de large) :
     écartée ; les cotes en pieds et pouces écrites dans le dessin font proposer les pouces, à vérifier */
  const us = { unite: 4, textes: ["13'8 x 14'", "11'6 x 13'", "5' x 8'1", 'BEDROOM'].map((s) => ({ s })) };
  assert.deepEqual(uniteProbable(us, { x0: 0, x1: 866, y0: 0, y1: 572 }), { u: 1, sure: false, douteuse: 4, imperial: true });
  assert.deepEqual(uniteProbable({ unite: 4, textes: [] }, { x0: 0, x1: 866, y0: 0, y1: 572 }), { u: 5, sure: false, douteuse: 4 }, 'sans cotes en pieds : d’après la taille');
  assert.deepEqual(uniteProbable({ unite: 4, textes: [] }, { x0: 0, x1: 22000, y0: 0, y1: 14000 }), { u: 4, sure: true }, 'unité du fichier vraisemblable : gardée');
  assert.deepEqual(uniteProbable({ unite: 4, textes: [] }, { x0: 0, x1: 4e6, y0: 0, y1: 2e6 }), { u: 4, sure: true }, 'rien de mieux à proposer : celle du fichier');
});

test('codage et aller-retour : Windows-1252 relu, DWG reconnu, un DXF écrit par Calque est relu avec son unité', () => {
  assert.equal(decoderDxf(new Uint8Array([0x63, 0x61, 0x66, 0xE9])), 'café'); // é en Windows-1252
  assert.equal(decoderDxf(new TextEncoder().encode('café €')), 'café €');
  assert.equal(estDwg(new TextEncoder().encode('AC1027\0\0')), true); assert.equal(estDwg(new TextEncoder().encode('  0\nSECTION')), false);
  const c = new DxfCtx(); c.calque('MURS'); c.strokeStyle = '#000';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(400, 0); c.lineTo(400, 300); c.closePath(); c.stroke();
  c.beginPath(); c.arc(100, 100, 50, 0, Math.PI * 2); c.stroke();
  c.calque('TEXTES'); c.fillStyle = '#000'; c.font = '20px x'; c.fillText('Séjour œ', 10, 20);
  const R = lireDxf(decoderDxf(dxfOctets(buildDxf(c.ent, { unite: 'm' }))));
  assert.equal(R.unite, 6, 'unité notée par Calque');
  assert.deepEqual(R.traits[0].p, [0, 0, 4, 0, 4, -3, 0, 0]); assert.equal(R.traits[1].f, true);
  assert.deepEqual(R.textes.map((t) => t.s), ['Séjour œ']);
});

test('import d’un DXF dans l’application : unité, calques, fond à l’échelle exacte, annuler ; DWG refusé avec explication', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => { const I = await import('./js/interface.js'); document.querySelector('.tool[data-tool="select"]').click(); });
  const r0 = await page.evaluate(async () => (await import('./js/noyau.js')).P.fonds.length);
  await page.evaluate(async (txt) => { const F = await import('./js/fond.js'); await F.importFond(new File([txt], 'maison.dxf', { type: 'application/dxf' })); }, ARCHI);
  await page.waitForSelector('#modal >> text=Importer un plan DXF');
  assert.match(await page.$eval('#dxfTaille', (e) => e.textContent.replace(/\s/g, ' ')), /8 m sur 6 m\. Unité indiquée par le fichier\..*objets isolés/);
  assert.deepEqual(await page.$$eval('#dxfCalques .chip', (e) => e.map((x) => [x.textContent, x.getAttribute('aria-pressed')])), [['MURS', 'true'], ['MOBILIER', 'true'], ['GELE', 'false']]);
  /* autre unité : la taille annoncée change ; retirer un calque */
  await page.click('#modal >> text=Centimètres'); assert.match(await page.$eval('#dxfTaille', (e) => e.textContent.replace(/\s/g, ' ')), /80 m sur 60 m.*à vérifier/);
  await page.click('#modal >> text=Millimètres'); await page.click('#dxfCalques >> text=MOBILIER');
  assert.ok(await page.$('#dxfPrev canvas'));
  await page.click('#modal >> text=Importer comme fond de plan'); await wait(page, 400);
  const f = await page.evaluate(async () => { const { P, ui } = await import('./js/noyau.js'); const f = P.fonds.find((x) => x.lv === ui.lv); return Object.assign({}, f, { img: (P.fondImg[f.img] || '').slice(0, 22), n: P.fonds.length }); });
  assert.equal(f.n, r0 + 1); assert.equal(f.name, 'maison.dxf'); assert.equal(f.cal, true); assert.equal(f.img, 'data:image/jpeg;base64');
  /* échelle exacte : l'image couvre 8 m × 6 m plus 2 % de marge de chaque côté (8,32 m × 6,32 m) */
  assert.ok(Math.abs(f.wpx * f.s - 832) < 1 && Math.abs(f.hpx * f.s - 632) < 1, `${f.wpx * f.s} × ${f.hpx * f.s} cm`);
  assert.equal(Math.max(f.wpx, f.hpx), 4096);
  await page.click('#btnUndo'); await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.fonds.length), r0);
  /* DWG : refusé, avec la marche à suivre */
  await page.evaluate(async () => { const F = await import('./js/fond.js'); await F.importFond(new File(['AC1032xxxxxxxx'], 'plan.dwg')); });
  assert.match(await page.$eval('#modal', (e) => e.textContent), /DWG.*Enregistrer sous › DXF/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

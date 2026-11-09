// Export DXF (AutoCAD R12) : module sans écran js/dxf.js + export du plan d'exemple dans le navigateur.
// Lancer :  node --test tests/dxf.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DxfCtx, buildDxf, dxfBilan, dxfOctets, dxfTexte } from '../js/dxf.js';
import { fresh, boot } from './outils.mjs';

/* relecture minimale d'un DXF : paires (code, valeur) → entités de la section ENTITIES */
function lire(texte) {
  const l = texte.split('\r\n'); if (l[l.length - 1] === '') l.pop();
  assert.equal(l.length % 2, 0, 'le fichier est une suite de paires code / valeur');
  const paires = []; for (let i = 0; i < l.length; i += 2) { assert.match(l[i], /^\d+$/); paires.push([+l[i], l[i + 1]]); }
  assert.deepEqual(paires[paires.length - 1], [0, 'EOF']);
  const ents = []; let dans = false, cur = null;
  for (let i = 0; i < paires.length; i++) {
    const [c, v] = paires[i];
    if (c === 2 && v === 'ENTITIES' && paires[i - 1][1] === 'SECTION') { dans = true; continue; }
    if (!dans) continue;
    if (c === 0) { if (v === 'ENDSEC') break; cur = { type: v, g: {} }; ents.push(cur); } else if (cur) (cur.g[c] = cur.g[c] || []).push(v);
  }
  const calques = []; for (let i = 0; i < paires.length; i++) if (paires[i][0] === 0 && paires[i][1] === 'LAYER') calques.push(paires[i + 1][1]);
  return { paires, ents, calques };
}

test('dxf : traits, contour fermé, cercle, texte, calques, unités et axe Y vers le haut', () => {
  const c = new DxfCtx();
  c.fillRect(0, 0, 10, 10); // avant tout calque : ignoré (fond du papier)
  c.calque('MURS');
  c.strokeStyle = '#000'; c.fillStyle = '#252A2F';
  c.beginPath(); c.moveTo(0, 0); c.lineTo(400, 0); c.lineTo(400, 300); c.lineTo(0, 300); c.closePath(); c.fill(); c.stroke(); // rempli puis tracé : un seul contour
  c.calque('ELEC_APPAREILS');
  c.save(); c.translate(100, 50); c.scale(2, 2);
  c.beginPath(); c.arc(0, 0, 10, 0, Math.PI * 2); c.stroke(); // cercle de rayon 20 en (100, 50)
  c.setLineDash([4, 2]); c.beginPath(); c.moveTo(0, 0); c.lineTo(30, 0); c.stroke(); // trait en tirets de (100,50) à (160,50)
  c.restore();
  c.fillStyle = '#FFFFFF'; c.beginPath(); c.rect(5, 5, 2, 2); c.fill(); // masque blanc : ignoré
  c.calque('TEXTES'); c.fillStyle = '#1D2125'; c.font = '700 20px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.strokeText('halo', 200, 150); c.fillText('Séjour 20 m² Ω œuf €', 200, 150);
  const b = dxfBilan(c.ent);
  assert.deepEqual({ total: b.total, traits: b.traits, cercles: b.cercles, textes: b.textes }, { total: 4, traits: 2, cercles: 1, textes: 1 });
  const r = lire(buildDxf(c.ent, { unite: 'mm' }));
  assert.ok(['MURS', 'OUVERTURES', 'ELEC_APPAREILS', 'COTES', 'TEXTES'].every((n) => r.calques.includes(n)));
  const types = r.ents.map((e) => e.type);
  assert.deepEqual(types, ['POLYLINE', 'VERTEX', 'VERTEX', 'VERTEX', 'VERTEX', 'SEQEND', 'CIRCLE', 'LINE', 'TEXT']);
  const pl = r.ents[0]; assert.equal(pl.g[8][0], 'MURS'); assert.equal(pl.g[70][0], '1');
  assert.deepEqual(r.ents.slice(1, 5).map((v) => [+v.g[10][0], +v.g[20][0]]), [[0, 0], [4000, 0], [4000, -3000], [0, -3000]]); // mm, Y inversé
  const ci = r.ents[6]; assert.deepEqual([+ci.g[10][0], +ci.g[20][0], +ci.g[40][0]], [1000, -500, 200]);
  const li = r.ents[7]; assert.deepEqual([+li.g[10][0], +li.g[20][0], +li.g[11][0], +li.g[21][0], li.g[6][0]], [1000, -500, 1600, -500, 'DASHED']);
  const tx = r.ents[8]; assert.equal(tx.g[1][0], 'Séjour 20 m² \\U+03A9 œuf €'); assert.equal(tx.g[72][0], '1'); assert.equal(tx.g[73][0], '2');
  assert.equal(+tx.g[40][0], 144); // 20 px × 0,72 × 10 (mm)
  /* octets : Windows-1252 (é = E9, œ = 9C, € = 80), fins de ligne CR LF */
  const o = dxfOctets(dxfTexte('éœ€'));
  assert.deepEqual([...o], [0xE9, 0x9C, 0x80]);
  /* mètres */
  const m = lire(buildDxf(c.ent, { unite: 'm' }));
  assert.deepEqual([+m.ents[2].g[10][0], +m.ents[3].g[20][0]], [4, -3]);
});

test('dxf : courbes découpées en segments, texte tourné, contenu découpé ignoré', () => {
  const c = new DxfCtx(); c.calque('OUVERTURES'); c.strokeStyle = '#000';
  c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, 90, 0, Math.PI / 2); c.stroke(); // quart de cercle (porte)
  const p = c.ent[0].p, n = p.length / 2;
  assert.ok(n > 8, 'arc découpé en segments');
  for (let i = 1; i < n; i++) assert.ok(Math.abs(Math.hypot(p[2 * i], p[2 * i + 1]) - 90) < 0.05, 'les points restent sur l’arc');
  assert.ok(Math.abs(p[2 * n - 2]) < 1e-6 && Math.abs(p[2 * n - 1] - 90) < 1e-6);
  c.save(); c.translate(50, 50); c.rotate(-Math.PI / 2); c.font = '10px x'; c.fillStyle = '#000'; c.fillText('cote', 0, 0); c.restore();
  const r = lire(buildDxf(c.ent));
  const t = r.ents.find((e) => e.type === 'TEXT'); assert.equal(+t.g[50][0], 90); // tourné de 90° dans le sens direct (Y vers le haut)
  c.save(); c.beginPath(); c.rect(0, 0, 10, 10); c.clip(); c.beginPath(); c.moveTo(0, 0); c.lineTo(50, 50); c.stroke(); c.restore();
  assert.equal(c.ent.length, 2);
  c.beginPath(); c.moveTo(0, 0); c.lineTo(50, 50); c.stroke(); assert.equal(c.ent.length, 3);
});

test('dxf : export du plan d’exemple (murs, ouvertures, appareils, cheminements, cotes, pièces) et fenêtre d’export', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const r = await page.evaluate(async () => {
    const E = await import('./js/export.js'), N = await import('./js/noyau.js');
    const avant = JSON.stringify(N.P), couches = JSON.stringify(N.S.layers);
    const o = Object.assign({}, N.S.exp || {}, { lv: 'all', dims: true, names: true, areas: true, furn: true, elec: true, unit: 'cm' });
    const d = E.composeDXF(o);
    const sansElec = E.composeDXF(Object.assign({}, o, { elec: false, furn: false }));
    return { texte: d.texte, bilan: d.bilan, sansElec: sansElec.bilan.calques, intact: avant === JSON.stringify(N.P) && couches === JSON.stringify(N.S.layers), murs: N.P.walls.length, niveaux: d.lvs.length };
  });
  assert.ok(r.intact, 'le plan et les réglages ne sont pas modifiés');
  assert.equal(r.niveaux, 2);
  const d = lire(r.texte);
  for (const n of ['PIECES', 'ESCALIERS', 'MOBILIER', 'MURS', 'OUVERTURES', 'ELEC_CHEMINEMENTS', 'ELEC_LIAISONS', 'ELEC_APPAREILS', 'COTES', 'TEXTES']) assert.ok(r.bilan.calques[n] > 0, 'calque ' + n);
  assert.ok(!r.sansElec.ELEC_APPAREILS && !r.sansElec.MOBILIER && r.sansElec.MURS > 0, 'les options de contenu sont respectées');
  const textes = d.ents.filter((e) => e.type === 'TEXT').map((e) => e.g[1][0]);
  for (const t of ['Séjour', 'Atelier', 'Rez-de-chaussée', 'Étage']) assert.ok(textes.includes(t), 'texte ' + t);
  /* toutes les coordonnées sont des nombres finis */
  for (const e of d.ents) for (const k of [10, 20, 11, 21, 40]) for (const v of e.g[k] || []) assert.ok(Number.isFinite(+v), `${e.type} ${k} = ${v}`);
  /* fenêtre d'export : le fichier .dxf est proposé */
  await page.click('#btnExport'); await page.click('text=DXF (AutoCAD)');
  await page.waitForFunction(() => /objets/.test((document.getElementById('expDxfInfo') || {}).textContent || ''));
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.exp-btns >> text=Enregistrer')]);
  assert.match(dl.suggestedFilename(), /\.dxf$/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

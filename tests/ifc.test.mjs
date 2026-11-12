// Import d'une maquette IFC (BIM) : lecteur sans écran js/ifcimport.js, puis création du plan dans l'application.
// Les fichiers tests/maison-ifc4.ifc et tests/maison-ifc2x3.ifc ont été écrits par la bibliothèque IfcOpenShell
// (maison 8 × 6 m sur deux niveaux, murs de 20 cm, cloison de 7 cm, une porte de 90 et une fenêtre de 120 au rez-de-chaussée).
// Lancer :  node --test tests/ifc.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { lireArgs, lireIfc, texteStep } from '../js/ifcimport.js';
import { ROOT, fresh, boot, wait } from './outils.mjs';

const lire = (f) => fs.readFileSync(path.join(ROOT, 'tests', f), 'utf8');

test('texte STEP : arguments, listes, références, valeurs typées, accents', () => {
  assert.deepEqual(lireArgs("'a''b',$,#12,(1.,2.5E1,(#3,#4)),.T.,.ELEMENT.,IFCLENGTHMEASURE(0.2),*"), ['a\'b', null, { ref: 12 }, [1, 25, [{ ref: 3 }, { ref: 4 }]], true, { enum: 'ELEMENT' }, { type: 'IFCLENGTHMEASURE', v: 0.2 }, null]);
  assert.equal(texteStep('Rez-de-chauss\\X2\\00E9\\X0\\e'), 'Rez-de-chaussée'); assert.equal(texteStep('\\X\\C9tage'), 'Étage'); assert.equal(texteStep('caf\\S\\i'), 'café');
  assert.deepEqual(lireArgs("'texte (avec) des ; parenthèses',(),'fin'"), ['texte (avec) des ; parenthèses', [], 'fin']);
});

for (const [f, schema, unite] of [['maison-ifc4.ifc', 'IFC4', 'millimètres'], ['maison-ifc2x3.ifc', 'IFC2X3', 'mètres']]) {
  test(`lecture ${schema} (${unite}) : niveaux, murs par leur axe, épaisseurs, porte, fenêtre, local`, () => {
    const R = lireIfc(lire(f));
    assert.equal(R.schema, schema); assert.equal(R.unite.nom, unite); assert.equal(R.projet, 'Maison test');
    assert.deepEqual(R.niveaux.map((n) => [n.nom, n.elev, n.h, n.dalle, n.murs]), [['Rez-de-chaussée', 0, 250, 30, 5], ['Étage', 280, 250, null, 5]]);
    /* axes en centimètres, Y vers le bas, bâtiment calé en (0,0), angles fermés (les bouts rejoignent l'axe du mur voisin) */
    const rdc = R.murs.filter((m) => m.niveau === R.niveaux[0].id);
    assert.deepEqual(rdc.map((m) => [m.nom, m.a.x, m.a.y, m.b.x, m.b.y, m.th, Math.round(m.h)]), [
      ['Mur sud', 10, 590, 790, 590, 20, 250], ['Mur est', 790, 590, 790, 10, 20, 250], ['Mur nord', 790, 10, 10, 10, 20, 250],
      ['Mur ouest', 10, 10, 10, 590, 20, 250], ['Cloison', 396.5, 590, 396.5, 10, 7, 250]]);
    assert.deepEqual(R.ouvertures.map((o) => [o.kind, Math.round(o.x), Math.round(o.y), Math.round(o.w), Math.round(o.h), Math.round(o.sill)]), [['door', 397, 335, 90, 210, 0], ['window', 360, 590, 120, 125, 95]]);
    assert.deepEqual(R.espaces.map((e) => [e.nom, e.x, e.y]), [['Séjour', 200, 300], ['Séjour', 200, 300]]);
    assert.equal(R.illisibles, 0);
  });
}

test('niveau sans mur ni local (fondations, comme « Semelle » d’Allplan) : non repris, signalé', () => {
  const t = lire('maison-ifc4.ifc').replace(/\nENDSEC;\s*END-ISO-10303-21;\s*$/, "\n#99990=IFCBUILDINGSTOREY('semelle',$,'Semelle',$,$,$,$,$,$,-300.);\nENDSEC;\nEND-ISO-10303-21;\n");
  const R = lireIfc(t);
  assert.deepEqual(R.niveaux.map((n) => n.nom), ['Rez-de-chaussée', 'Étage']);
  assert.equal(R.ignores['niveaux sans mur (Semelle)'], 1);
});

test('fichiers non lisibles : rien n’est inventé', () => {
  assert.equal(lireIfc('pas un fichier IFC').murs.length, 0); assert.match(lireIfc('x').alertes[0], /illisible/);
  /* un mur sans volume extrudé est compté comme non repris */
  const t = "ISO-10303-21;\nDATA;\n#1=IFCWALL('g',$,'M',$,$,$,$,$,$);\n#2=IFCSLAB('h',$,'D',$,$,$,$,$,$);\nENDSEC;\n";
  const R = lireIfc(t); assert.equal(R.murs.length, 0); assert.equal(R.illisibles, 1); assert.deepEqual(R.ignores, { dalles: 1 });
});

test('import IFC dans l’application : nouveau plan avec 2 niveaux, murs, porte, fenêtre, pièces nommées ; l’ancien plan est gardé', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.evaluate(async () => { const N = await import('./js/noyau.js'), St = await import('./js/stockage.js'); St.openPlan(N.blankPlan('Mon plan en cours'), 'pAvant', { quiet: true }); await St.saveNow(); });
  await page.evaluate(async (txt) => { const U = await import('./js/ifcui.js'); await U.importIfc(new File([txt], 'maison.ifc')); }, lire('maison-ifc4.ifc'));
  assert.match(await page.$eval('#modal', (e) => e.textContent), /IFC4 · unité : millimètres.*Rez-de-chaussée \(5 murs\), Étage \(5 murs\).*Murs10.*Portes1.*Fenêtres1/s);
  await page.click('#modal >> text=Créer le plan');
  await page.waitForFunction(async () => (await import('./js/noyau.js')).P.walls.length > 0);
  await wait(page, 500);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), G = await import('./js/geometrie.js'), St = await import('./js/stockage.js'), P = N.P;
    await St.saveNow();
    return { nom: P.name, v: P.v, id: P.id, niveaux: P.levels.map((l) => [l.name, l.elev, l.h, l.slab]), murs: P.levels.map((l) => P.walls.filter((w) => w.lv === l.id).length),
      ep: [...new Set(P.walls.map((w) => w.th + ' ' + w.kind))].sort(), op: P.openings.map((o) => [o.kind, o.w, o.h, o.sill]),
      pieces: P.levels.map((l) => G.geo(l.id).rooms.map((x) => [x.label.name, Math.round(x.area / 1000) / 10]).sort()), plans: (await St.listProjects()).map((x) => x.name).sort(), toast: document.getElementById('toast').textContent };
  });
  assert.equal(r.nom, 'Maison test'); assert.equal(r.v, 11); assert.notEqual(r.id, 'pAvant');
  assert.deepEqual(r.niveaux, [['Rez-de-chaussée', 0, 250, 30], ['Étage', 280, 250, 20]]);
  assert.ok(r.murs[0] >= 5 && r.murs[1] >= 5); assert.deepEqual(r.ep, ['20 mur', '7 cloison']);
  assert.deepEqual(r.op, [['door', 90, 210, 0], ['window', 120, 125, 95]]);
  /* deux pièces par niveau (cloison au milieu) : 3,73 × 5,60 ≈ 20,9 m² et 3,80 × 5,60 ≈ 21,3 m² ; le local « Séjour » nomme la sienne */
  assert.deepEqual(r.pieces[0].map((x) => x[1]).sort(), [20.9, 21.3]); assert.ok(r.pieces[0].some((x) => x[0] === 'Séjour') && r.pieces[1].some((x) => x[0] === 'Séjour'));
  assert.ok(r.plans.includes('Mon plan en cours') && r.plans.includes('Maison test'), 'les deux plans existent : ' + r.plans.join(', '));
  assert.match(r.toast, /2 niveaux, \d+ murs, 2 ouvertures, 2 pièces nommées/);
  /* fichier compressé : refusé avec la marche à suivre */
  await page.evaluate(async () => { const U = await import('./js/ifcui.js'); await U.importIfc(new File(['PK'], 'maquette.ifczip')); });
  assert.match(await page.$eval('#modal', (e) => e.textContent), /exportez en « IFC 2x3 » ou « IFC 4 »/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

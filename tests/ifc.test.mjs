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

/* maquette de synthèse écrite à la main, à la façon de Revit (IFC4) et d'ArchiCAD récent : murs en facettes, mur en
   deux morceaux empilés, porte et fenêtre sans réservation (unité : mètres, repères à l'origine) */
function ifcFacettes() {
  const L = []; let n = 100;
  const add = (txt) => { L.push(`#${++n}=${txt};`); return n; };
  const pt = (p) => add(`IFCCARTESIANPOINT((${p.map((v) => v.toFixed(3)).join(',')}))`);
  /* prisme vertical de base `poly` (sens quelconque), de z0 à z1, en IfcFacetedBrep */
  const brep = (poly, z0, z1) => {
    const b = poly.map(([x, y]) => pt([x, y, z0])), t = poly.map(([x, y]) => pt([x, y, z1])), faces = [];
    const face = (ids) => { const l = add(`IFCPOLYLOOP((${ids.map((i) => '#' + i).join(',')}))`), o = add(`IFCFACEOUTERBOUND(#${l},.T.)`); faces.push(add(`IFCFACE((#${o}))`)); };
    face([...b].reverse()); face(t);
    for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; face([b[i], b[j], t[j], t[i]]); }
    const sh = add(`IFCCLOSEDSHELL((${faces.map((i) => '#' + i).join(',')}))`);
    return add(`IFCFACETEDBREP(#${sh})`);
  };
  const forme = (items, type = 'Brep') => { const r = add(`IFCSHAPEREPRESENTATION($,'Body','${type}',(${items.map((i) => '#' + i).join(',')}))`); return add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${r}))`); };
  const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const niv = add("IFCBUILDINGSTOREY('n',$,'Rez-de-chauss\\X2\\00E9\\X0\\e',$,$,$,$,$,.ELEMENT.,0.)");
  const els = [];
  /* mur nord en deux peaux de facettes dans la même représentation (5 m × 0,20 m, h 2,50 m) */
  els.push(add(`IFCWALL('a',$,'Nord',$,$,$,#${forme([brep(rect(0, 0, 5, 0.12), 0, 2.5), brep(rect(0, 0.12, 5, 0.2), 0, 2.5)])},$)`));
  /* même mur, morceau du dessus (2,50 → 3,00 m) en volume extrudé : un seul mur de 3 m attendu */
  const o = pt([2.5, 0.1, 2.5]), ax = add(`IFCAXIS2PLACEMENT3D(#${o},$,$)`), pr = add('IFCRECTANGLEPROFILEDEF(.AREA.,$,$,5.,0.2)'), dz = add('IFCDIRECTION((0.,0.,1.))');
  els.push(add(`IFCWALLSTANDARDCASE('b',$,'Nord haut',$,$,$,#${forme([add(`IFCEXTRUDEDAREASOLID(#${pr},#${ax},#${dz},0.5)`)], 'SweptSolid')},$)`));
  /* mur ouest tourné de 90° (0,20 × 4 m) */
  els.push(add(`IFCWALL('c',$,'Ouest',$,$,$,#${forme([brep(rect(0, 0, 0.2, 4), 0, 2.5)])},$)`));
  /* mur en L d'un seul bloc : pas un mur droit, non repris */
  els.push(add(`IFCWALL('d',$,'En L',$,$,$,#${forme([brep([[8, 0], [12, 0], [12, 4], [11.8, 4], [11.8, 0.2], [8, 0.2]], 0, 2.5)])},$)`));
  /* porte de 0,90 × 2,10 m dans le mur nord, sans réservation ; fenêtre de 1,20 m à 0,95 m du sol dans le mur ouest ; fenêtre de toit hors de tout mur */
  els.push(add(`IFCDOOR('e',$,'Porte',$,$,$,#${forme([brep(rect(2, 0.05, 2.9, 0.15), 0, 2.1)])},$,2.1,0.9)`));
  els.push(add(`IFCWINDOW('f',$,'Fen\\X2\\00EA\\X0\\tre',$,$,$,#${forme([brep(rect(0.04, 1.4, 0.16, 2.6), 0.95, 2.2)])},$,$,$)`));
  els.push(add(`IFCWINDOW('g',$,'Toit',$,$,$,#${forme([brep(rect(2, 2, 3, 3), 2.6, 2.7)])},$,$,$)`));
  add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('r',$,$,$,(${els.map((i) => '#' + i).join(',')}),#${niv})`);
  return "ISO-10303-21;\nHEADER;\nFILE_SCHEMA(('IFC4'));\nENDSEC;\nDATA;\n" + L.join('\n') + '\nENDSEC;\nEND-ISO-10303-21;\n';
}
test('murs en facettes (Revit IFC4, ArchiCAD), morceaux empilés regroupés, porte et fenêtre sans réservation placées ; mur en L non deviné', () => {
  const R = lireIfc(ifcFacettes());
  assert.equal(R.schema, 'IFC4'); assert.equal(R.illisibles, 1, 'le mur en L n’est pas repris'); assert.equal(R.fusions, 1);
  assert.deepEqual(R.murs.map((m) => [m.nom, m.th, Math.round(m.h), Math.round(m.z)]), [['Nord', 20, 300, 0], ['Ouest', 20, 250, 0]]);
  const [nord, ouest] = R.murs;
  /* axes : chaque mur s'arrête sur l'axe de l'autre (angle fermé) : nord de x = 0,10 à 5,00 m, ouest de y = 0,10 à 4,00 m */
  assert.equal(Math.round(Math.abs(nord.a.x - nord.b.x)), 490);
  assert.ok(Math.abs(Math.abs(nord.a.y - nord.b.y)) < 0.01 && Math.abs(ouest.a.x - ouest.b.x) < 0.01);
  assert.equal(Math.round(Math.abs(ouest.a.y - ouest.b.y)), 390, 'du milieu du mur nord (y = 0,10) au bout (y = 4,00)');
  assert.equal(nord.approx, true, 'mur en facettes : à vérifier');
  /* ouvertures déduites de leur volume */
  assert.deepEqual(R.ouvertures.map((o) => [o.kind, o.mur === nord.id ? 'nord' : 'ouest', Math.round(o.w), Math.round(o.h), Math.round(o.sill), o.deduite]),
    [['door', 'nord', 90, 210, 0, true], ['window', 'ouest', 120, 125, 95, true]]);
  const porte = R.ouvertures[0], x0 = Math.min(nord.a.x, nord.b.x);
  assert.equal(Math.round(porte.x - x0), 235, 'milieu de la porte à 2,45 m de l’angle, soit 2,35 m de l’axe du mur ouest'); assert.ok(Math.abs(porte.y - nord.a.y) < 0.01);
  assert.equal(R.ignores['portes ou fenêtres sans réservation dans un mur'], 1, 'la fenêtre de toit n’est pas placée');
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

// Migrations de bout en bout (phase 8) : un plan v1 complet s'ouvre en version actuelle sans rien perdre, avec sa copie
// de sécurité ; calculs et exports fonctionnent sur le plan migré ; aller-retour par le fichier du plan ;
// un plan de chaque version intermédiaire (v2 à v10) s'ouvre aussi.
// Lancer :  node --test tests/migrations.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fresh, boot, seedPlan, wait } from './outils.mjs';

/* plan tel que l'enregistrait la première version de Calque (format v1, avant la phase 2) */
function planV1() {
  const n = (id, x, y) => ({ id, lv: 'L0', x, y });
  return {
    v: 1, id: 'pV1', name: 'Maison ancienne (v1)',
    levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }, { id: 'L1', name: 'Combles', elev: 270, h: 240, slab: 20 }],
    nodes: [n('a', 0, 0), n('b', 800, 0), n('c', 800, 600), n('d', 0, 600), n('e', 450, 0), n('f', 450, 600)],
    walls: [{ id: 'w1', lv: 'L0', a: 'a', b: 'e', th: 20, kind: 'mur' }, { id: 'w2', lv: 'L0', a: 'e', b: 'b', th: 20, kind: 'mur' }, { id: 'w3', lv: 'L0', a: 'b', b: 'c', th: 20, kind: 'mur' },
      { id: 'w4', lv: 'L0', a: 'c', b: 'f', th: 20, kind: 'mur' }, { id: 'w5', lv: 'L0', a: 'f', b: 'd', th: 20, kind: 'mur' }, { id: 'w6', lv: 'L0', a: 'd', b: 'a', th: 20, kind: 'mur' },
      { id: 'w7', lv: 'L0', a: 'e', b: 'f', th: 7, kind: 'cloison' }],
    openings: [{ id: 'o1', wall: 'w1', t: 200, w: 90, kind: 'door', type: 'battante', side: 1, hinge: 0, leaves: 1, h: 204, sill: 0 },
      { id: 'o2', wall: 'w3', t: 300, w: 120, kind: 'window', type: 'battant', side: 1, hinge: 0, leaves: 2, h: 125, sill: 95 },
      { id: 'o3', wall: 'w7', t: 300, w: 83, kind: 'door', type: 'battante', side: -1, hinge: 1, leaves: 1, h: 204, sill: 0 }],
    items: [{ id: 'i1', lv: 'L0', k: 'canape3', type: 'canape3', name: 'Canapé', x: 200, y: 450, w: 210, d: 90, rot: 0 }, { id: 'i2', lv: 'L0', k: 'lit140', type: 'lit140', name: 'Lit', x: 620, y: 300, w: 140, d: 200, rot: 90, flip: true }],
    elec: [{ id: 'e1', lv: 'L0', type: 'pc', x: 100, y: 10, rot: 0, h: 30, cid: 'c1' }, { id: 'e2', lv: 'L0', type: 'pc2', x: 300, y: 590, rot: 180, h: 30, cid: 'c1' },
      { id: 'e3', lv: 'L0', type: 'pl', x: 225, y: 300, rot: 0, h: null, cid: 'c2' }, { id: 'e4', lv: 'L0', type: 'int_s', x: 150, y: 10, rot: 0, h: 110, cid: 'c2' },
      { id: 'e5', lv: 'L0', type: 'tableau', x: 10, y: 300, rot: 270, h: 130 }, { id: 'e6', lv: 'L0', type: 'vmc', x: 700, y: 500, rot: 0, h: null, cid: 'c3' }],
    rooms: [{ id: 'r1', lv: 'L0', name: 'Séjour', x: 225, y: 300, tint: 1 }, { id: 'r2', lv: 'L0', name: 'Chambre', x: 625, y: 300 }],
    dims: [{ id: 'd1', lv: 'L0', ax: 0, ay: -60, bx: 800, by: -60 }],
    texts: [{ id: 't1', lv: 'L0', x: 400, y: 650, text: 'Façade sud — accès', size: 'm', rot: 0 }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises séjour', cal: 20, sec: 2.5, rcd: 'r1', dda: false, ctrl: null },
      { id: 'c2', kind: 'eclairage', name: 'Éclairage', cal: 16, sec: 1.5, rcd: 'r1', dda: false, ctrl: null },
      { id: 'c3', kind: 'vmc', name: 'VMC', cal: 2, sec: 1.5, rcd: 'r2', dda: false, ctrl: null }],
    rcds: [{ id: 'r1', type: 'AC', cal: 40 }, { id: 'r2', type: 'A', cal: 40 }],
    links: [{ id: 'k1', lv: 'L0', a: 'e4', b: 'e3' }],
    ducts: [{ id: 'g1', lv: 'L0', sys: 'vmc', mat: 'souple', dia: 80, a: 'e6', b: null, pts: [{ x: 700, y: 500 }, { x: 700, y: 300 }] },
      { id: 'g2', lv: 'L0', sys: 'elec', mat: 'icta', dia: 20, a: 'e5', b: 'e1', pts: [{ x: 10, y: 300 }, { x: 10, y: 10 }, { x: 100, y: 10 }] }],
    install: { kva: 9, parafoudre: false, row: 13 },
  };
}
/* chaque champ de l'original est retrouvé à l'identique (les migrations peuvent ajouter des champs, jamais en perdre) */
function retrouve(orig, plan) {
  const manques = [];
  for (const [k, v] of Object.entries(orig)) {
    if (k === 'v' || k === 'id') continue;
    if (Array.isArray(v)) {
      for (const o of v) {
        const q = (plan[k] || []).find((x) => x.id === o.id);
        if (!q) { manques.push(`${k}/${o.id} absent`); continue; }
        for (const [f, val] of Object.entries(o)) if (JSON.stringify(q[f]) !== JSON.stringify(val)) manques.push(`${k}/${o.id}.${f} : ${JSON.stringify(val)} → ${JSON.stringify(q[f])}`);
      }
    } else if (v && typeof v === 'object') { for (const [f, val] of Object.entries(v)) if (JSON.stringify((plan[k] || {})[f]) !== JSON.stringify(val)) manques.push(`${k}.${f}`); }
    else if (plan[k] !== v) manques.push(k);
  }
  return manques;
}

test('plan v1 → version actuelle : rien de perdu, copie de sécurité exacte, calculs et exports sur le plan migré', async () => {
  const { ctx, page, errors } = await fresh();
  const orig = planV1();
  await seedPlan(ctx, orig); // ancien stockage (localStorage), comme avant la phase 1a
  await boot(page);
  await wait(page, 500);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), St = await import('./js/stockage.js');
    await St.saveNow();
    const vs = await St.versionsOf('pV1'), copie = vs.find((v) => /avant mise à jour du format/.test(v.why));
    return { plan: JSON.parse(JSON.stringify(N.P)), ver: N.PLAN_VERSION, why: copie && copie.why, copie: copie ? await St.versionJson(copie.k) : null, problemes: St.planProblems(N.P) };
  });
  assert.equal(r.plan.v, r.ver); assert.equal(r.plan.id, 'pV1');
  assert.deepEqual(retrouve(orig, r.plan), [], 'aucune donnée perdue ni modifiée');
  assert.deepEqual(r.problemes, []);
  /* champs ajoutés par les migrations : vides, rien n'est deviné */
  assert.deepEqual(r.plan.chiffrage, { prix: {}, temps: {} }); assert.deepEqual(r.plan.doc, { revisions: [] }); assert.deepEqual(r.plan.chantier.reserves, []);
  assert.equal(r.plan.variantes, undefined); assert.ok(r.plan.elec.every((e) => !('art' in e) && !('lum' in e)));
  /* copie de sécurité : le plan exactement tel qu'il était */
  assert.equal(r.why, `Copie de sécurité avant mise à jour du format (v1 → v${r.ver})`);
  assert.deepEqual(JSON.parse(r.copie), orig);
  /* calculs, contrôles et exports sur le plan migré : aucune erreur */
  const x = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), P = N.P, out = {};
    const El = await import('./js/electricite.js'), K = await import('./js/calcul.js'), CH = await import('./js/cheminement.js');
    out.checks = El.nfcChecks().length; out.bilan = K.bilanDuPlan(P).lignes.length; out.chemin = CH.cheminCircuit(P, 'c1').points.find((q) => q.id === 'e1').dist > 0; // la prise reliée par la gaine v1 est atteinte
    out.regles = (await import('./js/reglesui.js')).rapportDuPlan().synthese.total;
    const Q = await import('./js/quantitatif.js'), QU = await import('./js/quantitatifui.js'); out.quant = Q.chiffrer(QU.quantitatifDuPlan(), P.chiffrage).lignes.length;
    out.dxf = (await import('./js/export.js')).composeDXF({ lv: 'all', dims: true, names: true, areas: true, furn: true, elec: true, unit: 'cm' }).bilan.total;
    const X = await import('./js/export.js'); out.pdf = (await X.composePDF(Object.assign({}, X.expOpts(), { fmt: 'pdf', lv: 'all' }))).size;
    const D = await import('./js/documents.js'), Ui = await import('./js/dossierui.js');
    const dos = await D.dossierPDF(P, Ui.optionsDossier({ chap: D.CHAPITRES.map((c) => c.id), fmt: 'A4', fmtSch: 'A4' })); out.dossier = dos.pages;
    out.assistant = (await import('./js/assistantui.js')).avancementDuPlan().etapes.length;
    out.equip = (await import('./js/equipement.js')).besoinsPiece('Séjour', 20).socles;
    return out;
  });
  assert.ok(x.checks > 10 && x.bilan === 3 && x.chemin === true && x.regles > 20 && x.quant > 5 && x.dxf > 50 && x.pdf > 1000 && x.dossier >= 10 && x.assistant >= 8, JSON.stringify(x));
  /* aller-retour par le fichier du plan : « Envoyer le plan » puis « Importer un fichier » */
  await page.click('#btnMenu'); await page.click('#menuPop >> text=Envoyer le fichier du plan');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('#modal >> text=Enregistrer')]);
  const texte = fs.readFileSync(await dl.path(), 'utf8');
  await page.setInputFiles('#fileIn', { name: 'maison.calque.json', mimeType: 'application/json', buffer: Buffer.from(texte) });
  await wait(page, 600);
  const re = await page.evaluate(async () => JSON.parse(JSON.stringify((await import('./js/noyau.js')).P)));
  assert.notEqual(re.id, 'pV1', 'importé comme un nouveau plan');
  assert.deepEqual(retrouve(orig, re), [], 'le fichier exporté contient tout le plan');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('plans v2 à v10 : chacun s’ouvre en version actuelle, avec sa copie de sécurité et sans lien cassé', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const r = await page.evaluate(async (base) => {
    const N = await import('./js/noyau.js'), St = await import('./js/stockage.js'), out = [];
    for (let v = 2; v <= 10; v++) {
      const p = JSON.parse(JSON.stringify(base)); p.v = v; p.id = 'pv' + v; p.name = 'Plan v' + v;
      if (v >= 5) p.circuits[0].calc = { p: { v: 3000, st: 'saisie' }, len: { v: 12, st: 'saisie' } };
      if (v >= 9) p.chantier = { poses: { app: { e1: 1 }, circ: {} }, reserves: [], photos: [], notes: [], journal: [] };
      if (v >= 10) p.variantes = { active: 'a', principale: 'a', liste: [{ id: 'a', nom: 'Standard', gamme: 'std', cree: 1, maj: 1 }] };
      St.openPlan(p, p.id); await St.saveNow();
      const vs = await St.versionsOf(p.id);
      out.push({ v, apres: N.P.v, copie: vs.some((x) => x.why === `Copie de sécurité avant mise à jour du format (v${v} → v${N.PLAN_VERSION})`), problemes: St.planProblems(N.P), calc: N.P.circuits[0].calc || null, pose: N.P.chantier.poses.app.e1 || null, variante: N.P.variantes ? N.P.variantes.liste.length : 0 });
    }
    return { out, ver: N.PLAN_VERSION };
  }, planV1());
  for (const x of r.out) {
    assert.equal(x.apres, r.ver, `v${x.v}`); assert.ok(x.copie, `copie v${x.v}`); assert.deepEqual(x.problemes, [], `v${x.v}`);
    if (x.v >= 5) assert.deepEqual(x.calc, { p: { v: 3000, st: 'saisie' }, len: { v: 12, st: 'saisie' } }, `données de calcul gardées (v${x.v})`);
    if (x.v >= 9) assert.equal(x.pose, 1, `chantier gardé (v${x.v})`);
    if (x.v >= 10) assert.equal(x.variante, 1, `variantes gardées (v${x.v})`);
  }
  assert.deepEqual(errors, []);
  await ctx.close();
});

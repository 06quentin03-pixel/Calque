// Tests de la phase 6 : moteur de règles versionnées (sans écran), reprise de tous les contrôles existants.
// Lancer depuis la racine du dépôt :  node --test tests/regles.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, fresh, wait, boot } from './outils.mjs';

const R = await import(path.join(ROOT, 'js', 'regles.js'));
const K = await import(path.join(ROOT, 'js', 'calcul.js'));
const N = await import(path.join(ROOT, 'js', 'normes.js'));
const M = await import(path.join(ROOT, 'js', 'materiel.js'));

const STATUTS = ['conforme', 'non_conforme', 'verification'];
function planTest() {
  return { v: 8, levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250 }], rooms: [],
    elec: [{ id: 't', lv: 'L0', type: 'tableau', x: 20, y: 250, rot: 90, h: 130 }, { id: 'a', lv: 'L0', type: 'pc', x: 380, y: 250, rot: 270, h: 30, cid: 'c1' }],
    ducts: [{ id: 'g1', lv: 'L0', sys: 'elec', a: 't', b: 'a', pts: [{ x: 20, y: 250 }, { x: 380, y: 250 }], kind: 'icta', dia: 20, pose: 'sol', cid: 'c1' }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 20, sec: 2.5, rcd: 'd1' },
      { id: 'c2', kind: 'eclairage', name: 'Éclairage', cal: 16, sec: 1.5, rcd: 'd1', calc: { p: { v: 300, st: 'saisie' }, cos: { v: 1, st: 'saisie' }, len: { v: 20, st: 'saisie' } } },
      { id: 'c3', kind: 'chauffage', name: 'Chauffage', cal: 16, sec: 1.5, rcd: 'd2', calc: { p: { v: 5000, st: 'saisie' }, cos: { v: 1, st: 'saisie' } } }],
    rcds: [{ id: 'd1', type: 'A', cal: 40 }, { id: 'd2', type: 'AC', cal: 40 }], install: { kva: 9 } };
}

test('catalogue versionné : chaque règle a une version, une source et une édition ; toutes les règles de calcul y sont', () => {
  assert.match(R.REGLES_VERSION, /\d{4}\.\d{2}/);
  const ids = R.CATALOGUE.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length, 'identifiants uniques');
  for (const r of R.CATALOGUE) {
    assert.ok(Number.isInteger(r.v) && r.v >= 1, `${r.id} : version`);
    assert.ok(r.source && r.source.length > 5, `${r.id} : source`);
    assert.ok(r.edition && r.edition.length >= 1, `${r.id} : édition`);
    assert.ok(R.REFERENTIELS[r.ref], `${r.id} : origine`);
    assert.ok(Array.isArray(r.donnees), `${r.id} : données utilisées`);
    if (r.voir) assert.ok(R.regle(r.voir), `${r.id} : règle liée ${r.voir}`);
  }
  for (const id of Object.keys(N.REGLES)) assert.ok(R.regle(id), `règle de calcul ${id} reprise`);
  // origine « extrait Legrand » seulement pour les règles dont la source est l'extrait fourni (édition 2024)
  for (const r of R.CATALOGUE.filter((x) => x.ref === 'legrand')) { assert.ok(r.source.startsWith(N.SRC_GUIDE)); assert.equal(r.edition, N.ED_2024); }
  assert.equal(R.regle('in_iz').ref, 'norme'); assert.equal(R.regle('sec_logement').ref, 'legrand'); assert.equal(R.regle('cq_daaf').ref, 'calque');
});

test('trois statuts : une règle de Calque sans source vérifiée n’est jamais « conforme »', () => {
  const a = R.resultat('cq_daaf', 'conforme', 'DAAF présent.');
  assert.equal(a.statut, 'verification'); assert.equal(a.constat, 'respecte'); assert.match(a.detail, /à confirmer/);
  const b = R.resultat('cq_daaf', 'non_conforme', 'Aucun DAAF.');
  assert.equal(b.statut, 'non_conforme');
  const c = R.resultat('dd_circuits', 'conforme', '3 circuits sur 8.');
  assert.equal(c.statut, 'conforme', 'règle de l’extrait Legrand : conforme possible');
  assert.equal(c.source, N.REGLES.dd_circuits.source); assert.equal(c.edition, N.ED_2024); assert.equal(c.v, 1);
  assert.equal(R.resultat('dd_circuits', 'ok?', 'x').statut, 'verification', 'statut inconnu → vérification nécessaire');
  assert.throws(() => R.resultat('inexistante', 'conforme', ''), /inconnue/);
  // anciens niveaux du contrôle du tableau
  const conv = (sev, rid) => R.depuisControleCalque({ sev, group: 'g', msg: 'm', ref: null, rid });
  assert.equal(conv('err', 'cq_terre').statut, 'non_conforme');
  assert.equal(conv('ok', 'cq_terre').statut, 'verification');
  assert.equal(conv('warn', 'cq_prise_com').constat, 'a_revoir');
  assert.equal(conv('info', 'cq_rj45').constat, 'conseil');
  assert.equal(conv('err', 'cq_dd_vide').statut, 'verification', 'point d’attention : jamais « non conforme »');
  // jamais de conformité globale si tout n'est pas vérifié
  const ok = R.rapport([c, c]);
  assert.equal(ok.global, 'conforme');
  const pas = R.rapport([c, a]);
  assert.equal(pas.global, 'verification'); assert.match(pas.avis, /Aucune conformité globale/);
  assert.equal(R.rapport([]).global, 'verification', 'rapport vide : rien de conforme');
  assert.equal(R.rapport([c, b, a]).global, 'non_conforme');
});

test('évaluation d’un plan : aucun contrôle du moteur de calcul perdu, données utilisées et manquantes', () => {
  const p = planTest();
  const rap = R.evaluerPlan(p, { reperes: new Map([['c1', 'C1'], ['c2', 'C2'], ['c3', 'C3']]) });
  // même nombre de contrôles que calcul.js + materiel.js
  const dd = K.controlesDifferentiels(p);
  const nCalc = dd.global.length + dd.rcds.reduce((s, r) => s + r.controles.length, 0) + p.circuits.reduce((s, c) => s + K.ficheDuPlan(p, c).controles.length, 0)
    + M.remplissageGaines(p).filter((g) => g.n).length;
  assert.equal(rap.resultats.length, nCalc, 'tous les contrôles repris');
  // mêmes statuts que la fiche de calcul (règles de l'extrait et générales)
  for (const c of p.circuits) for (const k of K.ficheDuPlan(p, c).controles) {
    const r = rap.resultats.find((x) => x.id === k.id && x.ref && x.ref.id === c.id);
    assert.ok(r, `${k.id} de ${c.name}`); assert.equal(r.statut, k.statut, `${k.id} de ${c.name} : même statut`);
  }
  for (const r of rap.resultats) {
    assert.ok(STATUTS.includes(r.statut)); assert.ok(r.source && r.edition && r.v >= 1);
    assert.ok(Array.isArray(r.utilisees) && Array.isArray(r.manquantes));
  }
  const ib2 = rap.resultats.find((x) => x.id === 'ib_in' && x.objet === 'C2 Éclairage');
  assert.equal(ib2.statut, 'conforme');
  assert.ok(ib2.utilisees.some((u) => /^Puissance active P = 300 W \(saisie\)$/.test(u)), 'données utilisées avec leur statut');
  const ib1 = rap.resultats.find((x) => x.id === 'ib_in' && x.objet === 'C1 Prises');
  assert.deepEqual(ib1.manquantes, ['Puissance active P', 'Facteur de puissance cos φ'], 'données manquantes');
  const iz = rap.resultats.find((x) => x.id === 'in_iz');
  assert.equal(iz.statut, 'verification'); assert.ok(iz.manquantes.some((m) => /Tableau non fourni : Courants admissibles/.test(m)));
  // chauffage 5 000 W en 1,5 mm² / 16 A : non conforme (extrait Legrand p. 28-29)
  const ch = rap.resultats.find((x) => x.id === 'sec_logement' && x.objet === 'C3 Chauffage');
  assert.equal(ch.statut, 'non_conforme');
  // différentiel AC pour un chauffage : admis ; nombre de différentiels : conforme (2 dont 1 type A)
  assert.equal(rap.resultats.find((x) => x.id === 'dd_nombre').statut, 'conforme');
  // remplissage : toujours vérification nécessaire, tableau non fourni
  const rp = rap.resultats.find((x) => x.id === 'remplissage');
  assert.equal(rp.statut, 'verification'); assert.ok(rp.manquantes.some((m) => /Remplissage des conduits/.test(m)));
  // jamais de conformité globale (In ≤ Iz non vérifiable sans les tableaux reportés en phase 8)
  assert.notEqual(rap.global, 'conforme');
  assert.ok(rap.tablesManquantes.includes(N.TABLE_BY.get('iz').titre));
  assert.equal(rap.synthese.total, rap.synthese.conforme + rap.synthese.non_conforme + rap.synthese.verification);
  assert.equal(rap.version, R.REGLES_VERSION);
});

test('ancien contrôle du tableau (nfcChecks) : chaque contrôle porte une règle du catalogue', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'electricite.js'), 'utf8');
  const corps = src.slice(src.indexOf('function nfcChecks'), src.indexOf('\n}\n', src.indexOf('function nfcChecks')));
  const appels = [...corps.matchAll(/addR\('([a-z0-9_]+)'/g)].map((m) => m[1]);
  assert.ok(appels.length >= 49, `${appels.length} contrôles`);
  const sansDef = corps.split('\n').filter((l) => !/const addR? = /.test(l)).join('\n');
  assert.equal((sansDef.match(/[^R]\badd\(/g) || []).length, 0, 'aucun contrôle sans règle');
  for (const id of new Set(appels)) assert.ok(R.regle(id) && id.startsWith('cq_'), `règle ${id} au catalogue`);
  for (const r of R.CALQUE) assert.ok(appels.includes(r.id), `règle ${r.id} utilisée`);
});

test('onglet « Contrôle NF C 15-100 » et dossier : rapport complet, rien de perdu, jamais de conformité globale', async () => {
  const { ctx, page, errors } = await fresh({ viewport: { width: 820, height: 1180 } });
  await boot(page);
  const r = await page.evaluate(async () => {
    const E = await import('./js/electricite.js'), I = await import('./js/interaction.js'), Nn = await import('./js/noyau.js'), T = await import('./js/tableau.js'), U = await import('./js/reglesui.js');
    if (!Nn.P.circuits.length) { E.generateFromPlan(); I.commit(); }
    const old = E.nfcChecks(), rap = U.rapportDuPlan();
    T.setView('elec'); Nn.ui.evTab = 'check'; T.renderEvMain();
    const cq = rap.resultats.filter((x) => x.id.startsWith('cq_'));
    return { nOld: old.length, nCq: cq.length, msgs: old.every((c) => cq.some((x) => x.detail.startsWith(c.msg))), sansRid: old.filter((c) => !c.rid).length,
      errOld: old.filter((c) => c.sev === 'err').length, nc: cq.filter((x) => x.statut === 'non_conforme').length, attOld: old.filter((c) => c.sev === 'err' && /^cq_(vmc|dd_vide|circuit_adapte|sans_circuit)$/.test(c.rid)).length,
      global: rap.global, total: rap.synthese.total, version: rap.version };
  });
  assert.equal(r.nCq, r.nOld, 'chaque contrôle de l’ancien onglet est repris');
  assert.ok(r.msgs, 'mêmes messages'); assert.equal(r.sansRid, 0);
  assert.equal(r.nc, r.errOld - r.attOld, 'les non-conformités de l’ancien contrôle restent « non conformes »');
  assert.notEqual(r.global, 'conforme');
  await wait(page, 300);
  assert.equal(await page.locator('.rg-chk').count(), r.total, 'tous les contrôles affichés');
  const badge = await page.locator('.ev-count').textContent();
  assert.notEqual(badge, '✓', 'pas de coche sans conformité globale');
  assert.ok(await page.locator('.rg-avis', { hasText: 'Aucune conformité globale' }).count());
  assert.ok(await page.locator('.note', { hasText: r.version }).count(), 'version du moteur affichée');
  // détail d'une règle : source, édition, données
  await page.locator('.rg-chk[data-regle="sec_logement"] summary').first().click();
  const det = await page.locator('.rg-chk[data-regle="sec_logement"] .rg-dl').first().textContent();
  assert.match(det, /Source.*Legrand/); assert.match(det, /Édition.*2024/); assert.match(det, /Données utilisées/);
  // filtre
  await page.click('.rg-filtre button:has-text("À vérifier")'); await wait(page, 200);
  const sts = await page.$$eval('.rg-chk', (l) => [...new Set(l.map((x) => x.dataset.statut))]);
  assert.deepEqual(sts, ['verification']);
  // pas de défilement horizontal en portrait
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  // le dossier PDF contient le rapport
  const d = await page.evaluate(async () => {
    const D = await import('./js/documents.js'), Ui = await import('./js/dossierui.js'), Nn = await import('./js/noyau.js');
    const o = Ui.optionsDossier({ chap: ['controles'], fmt: 'A4', fmtSch: 'A4' }); o.compress = false;
    const res = await D.dossierPDF(Nn.P, o);
    const txt = new TextDecoder('latin1').decode(new Uint8Array(await res.blob.arrayBuffer()));
    return { pages: res.pages, chap: res.chapitres.map((c) => c.id), rapport: !!o.rapport, a: txt.includes('(Rapport de contr\\364le) Tj'), v: txt.includes('Calque-r\\350gles'), conf: /\(Installation conforme/.test(txt) };
  });
  assert.ok(d.rapport); assert.deepEqual(d.chap, ['controles']); assert.ok(d.pages >= 3, `${d.pages} pages`);
  assert.ok(d.a && d.v, 'titre et version des règles dans le PDF'); assert.ok(!d.conf);
  assert.deepEqual(errors, []);
  await ctx.close();
});

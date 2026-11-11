// Assistant « Où en est mon projet ? » : étapes déduites du plan (js/assistant.js, sans écran) et fenêtre.
// Lancer :  node --test tests/assistant.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { avancement } from '../js/assistant.js';
import { fresh, boot, wait } from './outils.mjs';

const vide = () => ({ levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250 }], nodes: [], walls: [], openings: [], elec: [], circuits: [], rcds: [], ducts: [], fonds: [], comps: [], install: { kva: 9 }, doc: { revisions: [] }, chantier: { reserves: [] } });
const etats = (a) => Object.fromEntries(a.etapes.map((e) => [e.id, e.etat]));

test('assistant : plan vide, puis chaque étape dans l’ordre ; rien n’est annoncé conforme', () => {
  let p = vide(), a = avancement(p, { pieces: { L0: [] } });
  assert.deepEqual(etats(a), { murs: 'afaire', elec: 'attente', tableau: 'attente', controles: 'attente', calcul: 'attente', chemins: 'attente', chiffrage: 'attente', dossier: 'attente' });
  assert.equal(a.suivante, 'murs'); assert.equal(a.faites, 0); assert.equal(a.total, 8);
  /* murs et pièce sans nom, fond sans échelle */
  p.nodes = [{ id: 'a', lv: 'L0', x: 0, y: 0 }, { id: 'b', lv: 'L0', x: 400, y: 0 }]; p.walls = [{ id: 'w', lv: 'L0', a: 'a', b: 'b', th: 20 }];
  p.fonds = [{ id: 'f', lv: 'L0', cal: false }];
  a = avancement(p, { pieces: { L0: [{ nom: 'Pièce 1' }] } });
  assert.equal(etats(a).murs, 'attention'); assert.match(a.etapes[0].detail, /1 pièce sans nom/); assert.equal(etats(a).fond, 'attention'); assert.equal(etats(a).elec, 'afaire');
  /* appareils sans tableau */
  p.fonds = []; p.elec = [{ id: 'e1', lv: 'L0', type: 'pc', x: 100, y: 10 }, { id: 'e2', lv: 'L0', type: 'pc', x: 300, y: 10 }];
  a = avancement(p, { pieces: { L0: [{ nom: 'Séjour' }] } });
  assert.deepEqual([etats(a).murs, etats(a).elec, etats(a).tableau, a.suivante], ['fait', 'attention', 'afaire', 'elec']);
  /* tableau posé, circuits générés, un appareil sans circuit */
  p.elec.push({ id: 'T', lv: 'L0', type: 'tableau', x: 20, y: 10 }); p.elec[0].cid = 'c1';
  p.circuits = [{ id: 'c1', kind: 'prises', name: 'Prises', cal: 16, sec: 1.5, rcd: 'r1' }]; p.rcds = [{ id: 'r1', type: 'A', cal: 40 }];
  a = avancement(p, { pieces: { L0: [{ nom: 'Séjour' }] }, rapport: { non_conforme: 2, verification: 5 } });
  assert.deepEqual(etats(a), { murs: 'fait', elec: 'fait', tableau: 'attention', controles: 'attention', calcul: 'afaire', chemins: 'afaire', chiffrage: 'afaire', dossier: 'afaire' });
  assert.match(a.etapes.find((e) => e.id === 'tableau').detail, /1 appareil sans circuit/);
  assert.match(a.etapes.find((e) => e.id === 'controles').detail, /2 points non conformes à corriger, 5 à vérifier/);
  /* sans point non conforme : jamais « conforme », seulement « reste à vérifier » */
  a = avancement(p, { pieces: {}, rapport: { non_conforme: 0, verification: 7 } });
  const ct = a.etapes.find((e) => e.id === 'controles'); assert.equal(ct.etat, 'fait'); assert.match(ct.detail, /ce n’est pas une conformité globale/); assert.ok(!/\bconforme\b(?! )/.test(ct.detail.replace('non conforme', '')));
  /* tout complété : gaines, données, prix, dossier */
  p.elec[1].cid = 'c1';
  p.ducts = [{ id: 'g1', lv: 'L0', sys: 'elec', a: 'T', b: 'e1', cid: 'c1', pts: [{ x: 20, y: 10 }, { x: 100, y: 10 }] }, { id: 'g2', lv: 'L0', sys: 'elec', a: 'e1', b: 'e2', cid: 'c1', pts: [{ x: 100, y: 10 }, { x: 300, y: 10 }] }];
  p.circuits[0].calc = { p: { v: 2000, st: 'saisie' } }; p.install.ks = { v: 0.7, st: 'saisie' }; p.install.reseau = 'mono';
  p.doc = { client: 'Client', revisions: [{ i: 'A' }] };
  a = avancement(p, { pieces: { L0: [{ nom: 'Séjour' }] }, rapport: { non_conforme: 0, verification: 3 } });
  assert.deepEqual([etats(a).calcul, etats(a).chemins, etats(a).dossier, etats(a).chiffrage, a.suivante], ['fait', 'fait', 'fait', 'afaire', 'chiffrage']);
  const q = a.etapes.find((e) => e.id === 'chiffrage'); assert.match(q.detail, /^0 ligne chiffrée sur \d+ : le total est partiel/);
  p.chantier.reserves = [{ statut: 'ouverte' }, { statut: 'levee' }];
  assert.equal(etats(avancement(p, {})).chantier, 'attention');
});

test('fenêtre de l’assistant sur le plan d’exemple : étapes, étape à faire maintenant, bouton vers la bonne page', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.click('#btnMenu'); await page.click('text=Assistant : où en est mon projet ?');
  await page.waitForSelector('.as-etape');
  const e = await page.$$eval('.as-etape', (l) => l.map((x) => [x.dataset.id, x.dataset.etat, x.classList.contains('as-suivante')]));
  const m = Object.fromEntries(e.map((x) => [x[0], x[1]]));
  /* plan d'exemple : bâtiment, appareils et tableau faits ; chiffrage partiel (prix d'exemple) ; réserves ouvertes */
  assert.equal(m.murs, 'fait'); assert.equal(m.elec, 'fait'); assert.equal(m.chiffrage, 'afaire'); assert.equal(m.chantier, 'attention'); assert.equal(m.dossier, 'fait');
  assert.equal(e.filter((x) => x[2]).length, 1, 'une seule étape « à faire maintenant »');
  assert.match(await page.$eval('#modal', (x) => x.textContent), /étapes? sur 8 terminées?/);
  await page.locator('.as-etape[data-id="chiffrage"] .btn').click(); await wait(page, 300);
  assert.ok(await page.locator('#qtRoot').isVisible(), 'le bouton ouvre l’onglet Quantitatif');
  assert.deepEqual(errors, []);
  await ctx.close();
});

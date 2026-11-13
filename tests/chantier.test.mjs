// Phase 7, étape 1 : mode chantier (cases « posé », réserves, annotations, photos, historique, dossier PDF).
// Lancer :  node --test tests/chantier.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, wait, seedPlan, canvasBox, storedPlan, idb } from './outils.mjs';
import { avancement, changerStatut, marquerPose, nettoyerChantier, nouvelleReserve, resumeReserves, simplifierTrait, distanceTrait, chantierVide } from '../js/chantier.js';
import { composerDossier, dossierPDF } from '../js/documents.js';

test('chantier (sans écran) : nettoyage sans rien deviner, avancement, réserves, historique, traits', () => {
  // nettoyage : valeurs invalides retirées, aucune valeur inventée
  const c = nettoyerChantier({ poses: { app: { e1: 5, e2: 'x', e3: -1 }, circ: { c1: 7 } },
    reserves: [{ id: 'r1', lv: 'L0', x: 1, y: 2, titre: 'A', statut: 'bizarre' }, { id: 'r2', lv: 'L0', x: 'a', y: 2 }, { id: 'r3', n: 4, lv: 'L0', x: 0, y: 0, statut: 'levee', leve: 9 }],
    photos: [{ id: 'p1', lv: 'L0', x: 0, y: 0, aFaire: true }, { id: 'p2', lv: 'L0', x: 0 }],
    notes: [{ id: 'n1', lv: 'L0', pts: [0, 0, 10, 10, 5], col: 'rouge' }, { id: 'n2', lv: 'L0', pts: [1] }],
    journal: [{ at: 3, txt: 'ok' }, { at: 0, txt: 'non' }] });
  assert.deepEqual(c.poses, { app: { e1: 5 }, circ: { c1: 7 } });
  assert.equal(c.reserves.length, 2); assert.equal(c.reserves[0].statut, 'ouverte'); assert.equal(c.reserves[0].n, 5, 'numéro manquant : suite des numéros existants');
  assert.equal(c.reserves[0].cree, undefined, 'aucune date inventée');
  assert.equal(c.photos.length, 1); assert.equal(c.notes.length, 1); assert.deepEqual(c.notes[0].pts, [0, 0, 10, 10]);
  assert.equal(c.journal.length, 1);
  assert.deepEqual(nettoyerChantier(null), chantierVide());
  // avancement et historique
  const plan = { levels: [{ id: 'L0', name: 'RDC' }], elec: [{ id: 'a', lv: 'L0', cid: 'c1' }, { id: 'b', lv: 'L0', cid: 'c1' }, { id: 'c', lv: 'L0' }], circuits: [{ id: 'c1', name: 'Prises' }] };
  marquerPose(plan, 'app', 'a', true, 100, 'Prise');
  marquerPose(plan, 'app', 'a', true, 200); // déjà posé : rien ne change
  marquerPose(plan, 'circ', 'c1', true, 300, 'C1');
  let av = avancement(plan);
  assert.deepEqual(av.app, { n: 3, poses: 1, pct: 33 }); assert.deepEqual(av.circ, { n: 1, poses: 1, pct: 100 });
  assert.deepEqual(av.parCircuit[0], { id: 'c1', nom: 'Prises', rep: null, n: 2, poses: 1, pct: 50, circuitPose: 300 });
  assert.equal(av.sansCircuit.n, 1);
  assert.equal(plan.chantier.journal.length, 2);
  marquerPose(plan, 'app', 'a', false, 400); assert.equal(avancement(plan).app.poses, 0);
  // réserves : numéro, statut, dates
  const r = nouvelleReserve(plan, { lv: 'L0', x: 10, y: 20 }, { at: 1000, titre: 'Fixation' });
  assert.equal(r.n, 1); assert.equal(r.statut, 'ouverte'); assert.equal(r.cree, 1000);
  assert.equal(changerStatut(plan, r, 'levee', 2000), true); assert.equal(r.leve, 2000);
  assert.equal(changerStatut(plan, r, 'en_cours', 3000), true); assert.equal(r.leve, undefined, 'réserve rouverte : plus de date de levée');
  const r2 = nouvelleReserve(plan, { lv: 'L0', x: 0, y: 0 }, { at: 1000 }); r2.echeance = 1500;
  assert.equal(r2.n, 2);
  assert.deepEqual(resumeReserves(plan, 5000), { total: 2, ouverte: 1, en_cours: 1, levee: 0, enRetard: 1 });
  assert.ok(plan.chantier.journal.some((j) => /Réserve n° 1 : levée/.test(j.txt)));
  // traits : simplification et distance
  const pts = []; for (let i = 0; i <= 100; i++) pts.push(i, 0.01 * Math.sin(i));
  const sp = simplifierTrait(pts, 0.5); assert.equal(sp.length, 4); assert.equal(sp[2], 100);
  assert.equal(simplifierTrait([0, 0, 50, 40, 100, 0], 0.5).length, 6, 'un coin est gardé');
  assert.ok(distanceTrait({ pts: [0, 0, 100, 0] }, { x: 50, y: 3 }) === 3);
});

test('migration v8 → v9 (puis v11) : chantier vide, copie de sécurité dans l’historique', async () => {
  const { ctx, page, errors } = await fresh();
  const old = { v: 8, id: 'pV8', name: 'Plan v8', levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250, slab: 20 }], nodes: [], walls: [], openings: [], items: [], elec: [], rooms: [], dims: [], texts: [], circuits: [], rcds: [], links: [], ducts: [], install: { kva: 9 }, doc: { revisions: [] } };
  await seedPlan(ctx, old);
  await boot(page);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), St = await import('./js/stockage.js');
    await new Promise((res) => setTimeout(res, 300));
    const vs = await St.versionsOf(N.P.id);
    return { v: N.P.v, ch: N.P.chantier, why: vs.map((x) => x.why) };
  });
  assert.equal(r.v, 13); // format actuel
  assert.deepEqual(r.ch, { poses: { app: {}, circ: {} }, reserves: [], photos: [], notes: [], journal: [] });
  assert.ok(r.why.some((w) => /v8 → v13/.test(w)), r.why.join(' | '));
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* petite image PNG (fabriquée dans la page) */
async function pngDepuisPage(page) {
  const b64 = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 640; c.height = 480; const x = c.getContext('2d'); x.fillStyle = '#3a7'; x.fillRect(0, 0, 640, 480); x.fillStyle = '#fff'; x.fillRect(100, 100, 200, 120); return c.toDataURL('image/png').split(',')[1]; });
  return Buffer.from(b64, 'base64');
}

for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`mode chantier ${vp.width}×${vp.height} : plan simplifié, outils visibles, sans défilement horizontal`, async () => {
    const { ctx, page, errors } = await fresh({ viewport: vp, touch: vp.width < 1000 });
    await boot(page);
    await page.click('.vtab[data-view="chantier"]'); await wait(page, 400);
    const r = await page.evaluate(() => ({
      tb: getComputedStyle(document.getElementById('toolbarCh')).display, tp: getComputedStyle(document.getElementById('toolbar')).display,
      sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth,
      small: [...document.querySelectorAll('#toolbarCh .tool')].filter((b) => { const q = b.getBoundingClientRect(); return q.width && (q.height < 44 && q.width < 44); }).length,
    }));
    assert.notEqual(r.tb, 'none'); assert.equal(r.tp, 'none');
    assert.ok(r.sw <= r.cw + 1, `défilement horizontal ${r.sw} > ${r.cw}`);
    assert.equal(r.small, 0, 'boutons d’au moins 44 px');
    // retour au plan : réglages d'affichage du plan intacts
    await page.click('.vtab[data-view="plan"]'); await wait(page, 200);
    const lay = await page.evaluate(async () => { const N = await import('./js/noyau.js'); return { furn: N.S.layers.furn, grid: N.S.layers.grid, saved: JSON.parse(localStorage.getItem('calque.settings') || '{}').layers }; });
    assert.equal(lay.furn, true); assert.equal(lay.grid, true);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('mode chantier : posé au doigt, réserve, annotation au stylet, photo dans IndexedDB hors du plan et de l’annuler, sauvegarde complète', async () => {
  const { ctx, page, errors } = await fresh({ touch: true });
  await boot(page);
  await page.evaluate(async () => { const S = await import('./js/stockage.js'); await S.newPlan(); });
  // petit plan : un mur et une prise sur un circuit
  await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), I = await import('./js/interaction.js'), M = await import('./js/mutations.js');
    M.addWall('L0', { x: 0, y: 0 }, { x: 600, y: 0 }, { th: 20, kind: 'mur' });
    N.P.circuits.push({ id: 'c1', kind: 'prises', name: 'Prises', cal: 16, sec: 1.5, rcd: null });
    N.P.elec.push({ id: 'e1', lv: 'L0', type: 'pc', x: 300, y: 200, rot: 0, h: 30, cid: 'c1' });
    N.touch(); I.commit(); I.fitView();
  });
  await page.click('.vtab[data-view="chantier"]'); await wait(page, 400);
  const box = await canvasBox(page);
  const toScreen = (p) => page.evaluate(async (p) => { const R = await import('./js/rendu2d.js'); return { x: p.x * R.V.s + R.V.ox, y: p.y * R.V.s + R.V.oy }; }, p);
  // 1. outil « Posé » : un toucher sur la prise
  await page.click('.tool[data-tool="ch_pose"]');
  let s = await toScreen({ x: 300, y: 200 });
  await page.touchscreen.tap(box.x + s.x, box.y + s.y); await wait(page, 300);
  let P = await page.evaluate(async () => (await import('./js/noyau.js')).P.chantier);
  assert.ok(P.poses.app.e1 > 0, 'prise cochée « posé »');
  assert.ok(P.journal.some((j) => /posé/.test(j.txt)));
  // 2. réserve sur la prise
  await page.click('.tool[data-tool="ch_res"]');
  await page.touchscreen.tap(box.x + s.x, box.y + s.y); await wait(page, 300);
  await page.fill('#f-rs-titre', 'Prise de travers'); await page.press('#f-rs-titre', 'Enter'); await wait(page, 200);
  await page.click('.insp .seg button:has-text("Levée")'); await wait(page, 200);
  P = await page.evaluate(async () => (await import('./js/noyau.js')).P.chantier);
  assert.equal(P.reserves.length, 1); assert.equal(P.reserves[0].titre, 'Prise de travers'); assert.equal(P.reserves[0].statut, 'levee');
  assert.deepEqual(P.reserves[0].ref, { t: 'elec', id: 'e1' }); assert.ok(P.reserves[0].leve >= P.reserves[0].cree);
  // 3. annotation au stylet (événements « pen »)
  await page.click('.tool[data-tool="ch_note"]');
  const a = await toScreen({ x: 100, y: 300 });
  await page.evaluate(({ a, box }) => {
    const cv = document.getElementById('cv');
    const ev = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { pointerId: 7, pointerType: 'pen', clientX: box.x + x, clientY: box.y + y, buttons: type === 'pointerup' ? 0 : 1, bubbles: true }));
    ev('pointerdown', a.x, a.y);
    for (let i = 1; i <= 30; i++) ev('pointermove', a.x + i * 4, a.y + Math.sin(i / 3) * 20);
    ev('pointerup', a.x + 120, a.y);
  }, { a, box });
  await wait(page, 300);
  P = await page.evaluate(async () => (await import('./js/noyau.js')).P.chantier);
  assert.equal(P.notes.length, 1); assert.ok(P.notes[0].pts.length >= 4 && P.notes[0].pts.length < 64, 'trait simplifié');
  // 4. photo : enregistrée dans IndexedDB (base calque-photos), pas dans le plan
  await page.evaluate(async () => { const C = await import('./js/chantierui.js'); C.fenetrePhoto({ lv: 'L0', x: 450, y: 250 }); });
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#modal .btn:has-text("Prendre ou choisir une photo")')]);
  await chooser.setFiles({ name: 'chantier.png', mimeType: 'image/png', buffer: await pngDepuisPage(page) });
  await page.waitForFunction(async () => (await import('./js/noyau.js')).P.chantier.photos.length === 1);
  await wait(page, 1300);
  const ph = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), H = await import('./js/historique.js'), F = await import('./js/photos.js');
    const f = N.P.chantier.photos[0], rec = await F.lirePhoto(f.id);
    return { f, rec: rec && { w: rec.w, h: rec.h, type: rec.blob.type, thumb: !!rec.thumb, pid: rec.pid }, planLen: JSON.stringify(N.P).length,
      histMax: Math.max(...H.H.u.map((x) => x.size)), id: N.P.id };
  });
  assert.equal(ph.rec.type, 'image/jpeg'); assert.equal(ph.rec.w, 640); assert.ok(ph.rec.thumb); assert.equal(ph.rec.pid, ph.id);
  assert.ok(ph.planLen < 20000, `plan léger (${ph.planLen} caractères)`);
  assert.ok(ph.histMax < 20000, 'l’annuler / rétablir ne recopie pas l’image');
  const stored = await storedPlan(page, ph.id);
  assert.equal(stored.chantier.photos[0].id, ph.f.id); assert.ok(!JSON.stringify(stored).includes('data:image'));
  // 5. annuler retire la photo du plan, rétablir la remet : l'image est toujours là
  await page.click('#btnUndo'); await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.chantier.photos.length), 0);
  await page.click('#btnRedo'); await wait(page, 200);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.chantier.photos.length), 1);
  // 6. sauvegarde complète : la photo est dedans ; import sur un autre appareil
  const [dl] = await Promise.all([page.waitForEvent('download'), (async () => { await page.evaluate(async () => { const E = await import('./js/export.js'); E.exportAll(); }); await wait(page, 800); await page.click('#modal .btn:has-text("Enregistrer")'); })()]);
  const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path');
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'calque-')), 'sauvegarde.calque.json');
  await dl.saveAs(file);
  const backup = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(backup.photos.length, 1); assert.equal(backup.photos[0].id, ph.f.id); assert.ok(backup.photos[0].data.length > 100);
  // 7. dossier PDF : chapitre « Suivi de chantier » avec la photo (image JPEG dans le PDF)
  const pdf = await page.evaluate(async () => {
    const Ui = await import('./js/dossierui.js'), D = await import('./js/documents.js'), N = await import('./js/noyau.js');
    const o = Ui.optionsDossier({ chap: ['chantier'], fmt: 'A4', fmtSch: 'A4' }); o.photos = await Ui.photosPourDossier(); o.compress = false;
    const r = await D.dossierPDF(N.P, o);
    const txt = new TextDecoder('latin1').decode(new Uint8Array(await r.blob.arrayBuffer()));
    return { pages: r.pages, dct: (txt.match(/\/DCTDecode/g) || []).length, res: txt.includes('Prise de travers'), plan: txt.includes('Plan de chantier'), photos: o.photos.size };
  });
  assert.equal(pdf.photos, 1); assert.equal(pdf.dct, 1, 'photo intégrée au PDF'); assert.ok(pdf.res && pdf.plan);
  await ctx.close();
  // autre appareil : import de la sauvegarde → plan et photo retrouvés
  const B = await fresh();
  await boot(B.page);
  await B.page.setInputFiles('#fileIn', file); await wait(B.page, 1500);
  const got = await B.page.evaluate(async (id) => { const F = await import('./js/photos.js'); const r = await F.lirePhoto(id); return r && r.w; }, ph.f.id);
  assert.equal(got, 640);
  assert.deepEqual(errors, []); assert.deepEqual(B.errors, []);
  await B.ctx.close();
});

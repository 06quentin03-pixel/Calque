// Fiabilisation (15 novembre 2026) : lisibilité, filet contre les plantages, contrôle du plan, résistance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, wait } from './outils.mjs';

/* contraste WCAG entre deux couleurs « rgb(r, g, b) » */
function contraste(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test('bouton « Confirmer la suppression » lisible (contraste ≥ 4,5) en thème clair et sombre', async () => {
  for (const theme of ['light', 'dark']) {
    const { ctx, page, errors } = await fresh();
    await boot(page);
    const r = await page.evaluate(async (theme) => {
      document.documentElement.dataset.theme = theme;
      const m = await import('./js/interface.js');
      let fait = 0;
      const b = m.confirmBtn('Supprimer', 'Confirmer la suppression', () => { fait++; });
      document.body.appendChild(b);
      const avant = getComputedStyle(b).color;
      b.click();
      const cs = getComputedStyle(b);
      const res = { avant, texte: b.textContent, fond: cs.backgroundColor, couleur: cs.color, faitApres1: fait };
      b.click();
      res.faitApres2 = fait;
      return res;
    }, theme);
    assert.match(r.texte, /Confirmer la suppression/);
    assert.equal(r.faitApres1, 0, 'le premier toucher ne supprime pas');
    assert.equal(r.faitApres2, 1, 'le second toucher supprime');
    const c = contraste(r.fond, r.couleur);
    assert.ok(c >= 4.5, `${theme} : contraste ${c.toFixed(2)} (${r.couleur} sur ${r.fond})`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

test('filet : une erreur dans un geste est notée au journal, signalée par un bandeau, le plan continue de marcher', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  /* erreur réelle, non attrapée, dans un gestionnaire d'événement */
  await page.evaluate(() => { const b = document.createElement('button'); b.id = 'boom'; b.onclick = () => { null.x; }; document.body.append(b); });
  await page.click('#boom');
  await page.waitForSelector('#incBar');
  const bandeau = await page.textContent('#incBar');
  assert.match(bandeau, /problème inattendu/);
  assert.doesNotMatch(bandeau, /Essai/);
  assert.match(bandeau, /Enregistrement : « Exemple non enregistré »/, 'état réel (le plan d’exemple n’est jamais enregistré)');
  /* une promesse rejetée sans traitement est notée aussi ; la même erreur répétée est comptée, pas recopiée */
  await page.evaluate(() => { Promise.reject(new Error('rejet de test')); });
  await page.click('#boom'); await page.click('#boom');
  await wait(page, 300);
  const j = await page.evaluate(() => JSON.parse(localStorage.getItem('calque.incidents')));
  const typeErr = j.filter((i) => /null/.test(i.msg));
  assert.equal(typeErr.length, 1); assert.ok(typeErr[0].n >= 2, 'répétition comptée');
  assert.ok(j.some((i) => i.origine === 'promesse' && /rejet de test/.test(i.msg)));
  assert.equal(typeErr[0].ctx.vue, 'plan'); assert.ok(typeErr[0].ctx.format >= 17);
  /* le journal : menu, détail, copie, essai, effacement */
  await page.click('#incBar button:has-text("Détails")');
  await page.waitForSelector('#modal:not([hidden]) .journal');
  assert.equal(await page.locator('#modal .jr').count(), 2);
  const texte = await page.evaluate(async () => (await import('./js/journalui.js')).journalTexte());
  assert.match(texte, /2 incidents/); assert.match(texte, /tâche en arrière-plan/);
  await page.click('#modal button:has-text("Essayer le filet")');
  await page.waitForSelector('#incBar');
  assert.match(await page.textContent('#incBar'), /Essai du filet/);
  const j2 = await page.evaluate(() => JSON.parse(localStorage.getItem('calque.incidents')));
  assert.ok(j2[j2.length - 1].essai);
  await page.evaluate(async () => (await import('./js/journalui.js')).ouvrirJournal());
  await page.click('#modal button:has-text("Effacer le journal")');
  await page.click('#modal button:has-text("Confirmer l’effacement")');
  assert.equal(await page.evaluate(() => localStorage.getItem('calque.incidents')), null);
  /* l'application marche toujours : les onglets répondent, sans nouvelle erreur */
  await page.keyboard.press('Escape');
  const nErr = errors.length;
  await page.click('[data-view="elec"]'); await wait(page, 400);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).ui.view), 'elec');
  await page.click('[data-view="plan"]'); await wait(page, 400);
  assert.equal(errors.length, nErr);
  assert.equal(errors.length >= 1, true, 'les erreurs volontaires sont bien des erreurs de page');
  await ctx.close();
});

test('démarrage : un plan qui ne peut pas s’ouvrir est signalé (et non remplacé en silence par le plan d’exemple), sans être modifié', async () => {
  const { ctx, page } = await fresh();
  /* panne provoquée pour le test : l'ouverture d'un plan nommé « Piège » échoue (les plans abîmés réels sont réparés, voir plus bas) */
  await ctx.route(/\/js\/noyau\.js$/, async (route) => {
    const r = await route.fetch(); const src = await r.text();
    await route.fulfill({ response: r, body: src.replace('function normalizePlan(p, notes = []) {', "function normalizePlan(p, notes = []) { if (p && p.name === 'Piège') throw new Error('panne provoquée par le test');") });
  });
  const plan = { id: 'pPIEGE', name: 'Piège', v: 17, levels: [{ id: 'L0', name: 'RDC', elev: 0, h: 250 }], nodes: [], walls: [] };
  await ctx.addInitScript((o) => { if (!localStorage.getItem('calque.p.pPIEGE')) { localStorage.setItem('calque.p.pPIEGE', JSON.stringify(o)); localStorage.setItem('calque.idx', JSON.stringify([{ id: 'pPIEGE', name: o.name, savedAt: 1 }])); localStorage.setItem('calque.cur', 'pPIEGE'); } }, plan);
  await boot(page);
  await page.waitForSelector('#modal:not([hidden])');
  assert.match(await page.textContent('#modal h2'), /n’a pas pu s’ouvrir/);
  assert.match(await page.textContent('#modal'), /« Piège »/);
  const j = await page.evaluate(() => JSON.parse(localStorage.getItem('calque.incidents') || '[]'));
  assert.ok(j.some((i) => i.origine === 'demarrage' && /panne provoquée/.test(i.msg)));
  await wait(page, 1500);
  assert.deepEqual(JSON.parse(await page.evaluate(() => localStorage.getItem('calque.p.pPIEGE'))), plan, 'plan enregistré intact');
  assert.equal(await page.evaluate(() => localStorage.getItem('calque.cur')), 'pPIEGE', 'le plan reste le plan courant');
  await ctx.close();
});

test('plans abîmés : chaque liste et chaque champ abîmé du plan d’exemple s’ouvre et se dessine sans erreur ; réparations dites, copie de sécurité', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const res = await page.evaluate(async () => {
    window.__E = []; addEventListener('error', (e) => window.__E.push(e.message));
    const St = await import('./js/stockage.js'); const R = await import('./js/interaction.js'); const E = await import('./js/exemple.js');
    const base = () => JSON.parse(JSON.stringify(E.samplePlan()));
    const image = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const out = [];
    const essai = async (nom, p) => {
      try { St.openPlan(p, 'pX', { quiet: true, example: true }); R.requestRender(); await image(); }
      catch (e) { out.push(nom + ' : ' + e.message); }
      if (window.__E.length) { out.push('dessin ' + nom + ' : ' + window.__E.join(' | ')); window.__E = []; }
    };
    const valeurs = { null: null, chaine: 'abîmé', nombre: 42, objet: {}, listeNull: [null], listeChaine: ['x'] };
    for (const k of Object.keys(base())) for (const [vn, v] of Object.entries(valeurs)) { const p = base(); p[k] = v; await essai(`${k}=${vn}`, p); }
    for (const k of Object.keys(base())) {
      const p0 = base(); if (!Array.isArray(p0[k]) || !p0[k].length) continue;
      for (const f of Object.keys(p0[k][0])) for (const [vn, v] of Object.entries({ null: null, chaine: 'abîmé', absent: undefined })) {
        const p = base(); p[k] = p[k].map((o) => { const c = { ...o }; if (v === undefined) delete c[f]; else c[f] = v; return c; });
        await essai(`${k}[].${f}=${vn}`, p);
      }
    }
    /* un plan réel (non exemple) abîmé : réparation dite, copie de sécurité d'origine dans l'historique */
    const p = base(); p.walls.push(null); p.rooms[0].name = null; p.zones.push({ id: 'zz', lv: 'L0', pts: 'abîmé' });
    const avant = JSON.stringify(p);
    St.openPlan(p, 'pREP');
    await new Promise((r) => setTimeout(r, 500));
    const modal = document.getElementById('modal').textContent;
    const vs = await St.versionsOf('pREP');
    const copie = vs.find((v) => /avant réparation/.test(v.why));
    const json = copie && await St.versionJson(copie.k);
    const X = await import('./js/export.js');
    const dxf = X.composeDXF({ lv: 'all', dims: true, names: true, areas: true, furn: true, elec: true, unit: 'cm' }).bilan.total;
    const pdf = (await X.composePDF(Object.assign({}, X.expOpts(), { fmt: 'pdf', lv: 'all' }))).size;
    return { out, modal, copie: !!copie, exacte: json === avant, dxf, pdf };
  });
  assert.deepEqual(res.out, []);
  assert.match(res.modal, /Plan réparé à l’ouverture/);
  assert.match(res.modal, /1 élément vide ou illisible retiré \(murs\)/);
  assert.match(res.modal, /1 pièce sans nom/);
  assert.match(res.modal, /1 zone interdite sans contour retirée/);
  assert.ok(res.copie, 'copie de sécurité');
  assert.ok(res.exacte, 'copie identique au plan d’origine');
  assert.ok(res.dxf > 100 && res.pdf > 10000, 'exports du plan réparé');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('contrôle des liens : moteur sans écran (Node), réparation sûre, rien deviné', async () => {
  const I = await import('../js/integrite.js');
  const p = {
    levels: [{ id: 'L0', elev: 0 }], nodes: [{ id: 'n1', lv: 'L0', x: 0, y: 0 }, { id: 'n2', lv: 'L0', x: 100, y: 0 }],
    walls: [{ id: 'w1', lv: 'L0', a: 'n1', b: 'n2', th: 20 }, { id: 'w2', lv: 'L0', a: 'n1', b: 'nX', th: 20 }],
    openings: [{ id: 'o1', wall: 'w2' }, { id: 'o2', wall: 'w1' }],
    elec: [{ id: 'e1', lv: 'L0', x: 0, y: 0, cid: 'cX', to: 'eX' }, { id: 'e2', lv: 'L0', x: 5, y: 5 }, { id: 'e3', lv: 'L0', x: NaN, y: 0 }],
    circuits: [{ id: 'c1', rcd: 'rX' }], rcds: [], links: [{ id: 'l1', a: 'e1', b: 'eY' }],
    ducts: [{ id: 'd1', lv: 'L0', a: 'eZ', b: 'e2', cid: 'cX', cids: ['c1', 'cY'], pts: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
    vues: [{ id: 'v1', circs: ['c1', 'cX'] }], chantier: { poses: { app: { e1: 1, eX: 2 }, circ: { cX: 3 } }, reserves: [{ id: 'r1', lv: 'L0', ref: { t: 'elec', id: 'eX' } }] },
  };
  const avant = JSON.stringify(p);
  const pb = I.controlerPlan(p);
  assert.equal(JSON.stringify(p), avant, 'le contrôle ne modifie rien');
  const codes = Object.fromEntries(pb.map((x) => [x.code, x.n]));
  for (const c of ['mur-angle', 'symbole-circuit', 'circuit-differentiel', 'liaison-symbole', 'gaine-circuit', 'gaine-bout', 'traversee-jumeau', 'reserve-appareil', 'pose-orpheline', 'vue-circuit', 'coordonnees']) assert.ok(codes[c], c);
  assert.equal(pb.find((x) => x.code === 'coordonnees').rep, null, 'une position manquante n’est pas inventée');
  const fait = I.reparerPlan(p);
  assert.ok(fait.length >= 10);
  assert.deepEqual(I.controlerPlan(p).map((x) => x.code), ['coordonnees'], 'reste : à corriger à la main');
  assert.deepEqual(p.walls.map((w) => w.id), ['w1']); assert.deepEqual(p.openings.map((o) => o.id), ['o2'], 'ouverture du mur retiré aussi');
  assert.equal(p.elec[0].cid, undefined); assert.equal(p.elec[0].to, undefined); assert.equal(p.elec.length, 3, 'aucun symbole effacé');
  assert.deepEqual(p.ducts[0].cids, ['c1']); assert.equal(p.ducts[0].a, null); assert.equal(p.ducts[0].b, 'e2');
  assert.deepEqual(p.vues[0].circs, ['c1']); assert.deepEqual(p.chantier.poses, { app: { e1: 1 }, circ: {} });
  assert.equal(p.chantier.reserves.length, 1, 'réserve gardée'); assert.equal(p.chantier.reserves[0].ref, undefined);
});

test('suppressions : aucun lien orphelin après la suppression d’un symbole, d’un niveau ou d’un circuit ; écran « Vérifier le plan »', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const r = await page.evaluate(async () => {
    const I = await import('./js/integrite.js'); const N = await import('./js/noyau.js'); const St = await import('./js/stockage.js');
    const UI = await import('./js/interface.js'); const E = await import('./js/exemple.js');
    const ouvrir = () => St.openPlan(E.samplePlan(), 'pO', { quiet: true, example: true });
    ouvrir();
    const out = { exemple: I.controlerPlan(N.P).map((x) => x.msg), apres: [] };
    /* symboles reliés au suivi de chantier, à un passage entre étages ou à une réserve */
    const ch = N.P.chantier;
    const cibles = N.P.elec.map((e, i) => ({ e, i })).filter(({ e }) => e.to || ch.poses.app[e.id] || ch.reserves.some((x) => x.ref && x.ref.id === e.id)).map((x) => x.i);
    out.cibles = cibles.length;
    for (const i of cibles) { ouvrir(); const e = N.P.elec[i]; N.ui.lv = e.lv; N.ui.sel = { t: 'elec', id: e.id }; UI.deleteSel(); out.apres.push(...I.controlerPlan(N.P).map((x) => 'symbole : ' + x.msg)); }
    for (let i = 0; i < N.P.levels.length; i++) { ouvrir(); const avant = N.P.chantier.reserves.length + N.P.chantier.photos.length + N.P.chantier.notes.length; UI.deleteLevel(N.P.levels[i].id); out.apres.push(...I.controlerPlan(N.P).map((x) => 'niveau : ' + x.msg)); out.chantierGarde = (out.chantierGarde ?? true) && N.P.chantier.reserves.length + N.P.chantier.photos.length + N.P.chantier.notes.length === avant; }
    ouvrir();
    St.ouvrirVerification();
    out.modal = document.getElementById('modal').textContent;
    UI.closeModal();
    /* vrai plan avec un symbole relié à un circuit disparu : « Réparer » garde une copie et s'annule */
    const p = E.samplePlan(); p.elec[0].cid = 'cDISPARU';
    St.openPlan(p, 'pREP2', { quiet: true });
    St.ouvrirVerification();
    out.modal2 = document.getElementById('modal').textContent;
    [...document.querySelectorAll('#modal button')].find((b) => /Réparer/.test(b.textContent)).click();
    await new Promise((r) => setTimeout(r, 600));
    out.apresRep = I.controlerPlan(N.P).length;
    out.copie = (await St.versionsOf('pREP2')).some((v) => /avant réparation des liens/.test(v.why));
    const H = await import('./js/interaction.js'); H.undo();
    out.apresAnnuler = N.P.elec[0].cid;
    return out;
  });
  assert.deepEqual(r.exemple, [], 'plan d’exemple sans lien cassé');
  assert.ok(r.cibles >= 3, 'symboles testés : ' + r.cibles);
  assert.deepEqual(r.apres, []);
  assert.ok(r.chantierGarde, 'le suivi de chantier d’un niveau supprimé est gardé');
  assert.match(r.modal, /Aucun lien cassé trouvé/); assert.match(r.modal, /ne dit rien de la conformité/);
  assert.match(r.modal2, /1 symbole relié à un circuit manquant/); assert.match(r.modal2, /Réparer \(1\)/);
  assert.equal(r.apresRep, 0); assert.ok(r.copie, 'copie de sécurité'); assert.equal(r.apresAnnuler, 'cDISPARU', 'Annuler revient avant la réparation');
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('annuler / rétablir : 120 modifications au hasard, tout annuler puis tout rétablir redonne exactement chaque état ; liens toujours intacts', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'); const St = await import('./js/stockage.js'); const E = await import('./js/exemple.js');
    const UI = await import('./js/interface.js'); const X = await import('./js/interaction.js'); const M = await import('./js/mutations.js');
    const Hi = await import('./js/historique.js'); const I = await import('./js/integrite.js');
    St.openPlan(E.samplePlan(), 'pUNDO', { quiet: true });
    /* hasard reproductible */
    let g = 12345; const rnd = () => { g = (g * 1103515245 + 12345) % 2147483648; return g / 2147483648; };
    const pick = (a) => a[Math.floor(rnd() * a.length)];
    const surNiveau = (k) => N.P[k].filter((o) => o.lv === N.ui.lv);
    const sel = (t, k) => { const a = surNiveau(k); if (!a.length) return false; N.ui.sel = { t, id: pick(a).id }; return true; };
    const actions = [
      ['mur', () => { const x = rnd() * 2000, y = rnd() * 1500; M.addWall(N.ui.lv, { x, y }, { x: x + 100 + rnd() * 300, y: y + (rnd() < 0.5 ? 0 : 200) }, { th: 10, kind: 'cloison' }); X.commit(); }],
      ['déplacer symbole', () => { if (sel('elec', 'elec')) UI.nudgeSel(10, -5); }],
      ['tourner meuble', () => { if (sel('item', 'items')) UI.rotateSel(15); }],
      ['supprimer mur', () => { if (sel('wall', 'walls')) UI.deleteSel(); }],
      ['supprimer symbole', () => { if (sel('elec', 'elec')) UI.deleteSel(); }],
      ['dupliquer symbole', () => { if (sel('elec', 'elec')) UI.duplicateSel(); }],
      ['dupliquer meuble', () => { if (sel('item', 'items')) UI.duplicateSel(); }],
      ['calibre', () => { const c = pick(N.P.circuits); if (c) { c.cal = pick([10, 16, 20, 32]); X.commit(); } }],
      ['déplacer angle', () => { if (sel('node', 'nodes')) UI.nudgeSel(20, 0); }],
      ['supprimer gaine', () => { if (sel('duct', 'ducts')) UI.deleteSel(); }],
      ['changer de niveau', () => { N.ui.lv = pick(N.P.levels).id; }],
      ['ajouter un niveau', () => { if (rnd() < 0.3) UI.addLevel('empty'); }],
    ];
    const etats = [Hi.snapshot()], faits = [], liens = [];
    for (let i = 0; i < 120; i++) {
      const [nom, fn] = pick(actions);
      const avant = Hi.H.u.length;
      fn(); N.ui.sel = null;
      if (Hi.H.u.length !== avant || Hi.snapshot() !== etats[etats.length - 1]) { etats.push(Hi.snapshot()); faits.push(nom); }
      const pb = I.controlerPlan(N.P); if (pb.length) liens.push(nom + ' : ' + pb.map((x) => x.msg).join(', '));
    }
    const n = etats.length - 1;
    const ecarts = [];
    for (let k = n - 1; k >= 0; k--) { X.undo(); if (Hi.snapshot() !== etats[k]) ecarts.push('annuler vers ' + k + ' (après « ' + faits[k] + ' »)'); }
    const debut = Hi.snapshot() === etats[0];
    for (let k = 1; k <= n; k++) { X.redo(); if (Hi.snapshot() !== etats[k]) ecarts.push('rétablir vers ' + k); }
    return { n, ecarts: ecarts.slice(0, 5), debut, fin: Hi.snapshot() === etats[n], liens: liens.slice(0, 5), sortes: [...new Set(faits)].length };
  });
  assert.ok(r.n >= 60, 'modifications enregistrées : ' + r.n);
  assert.ok(r.sortes >= 8, 'sortes de modifications : ' + r.sortes);
  assert.deepEqual(r.ecarts, []);
  assert.ok(r.debut && r.fin);
  assert.deepEqual(r.liens, [], 'aucun lien cassé pendant les modifications');
  assert.deepEqual(errors, []);
  await ctx.close();
});

/* outils de dessin (comme tests/stockage.test.mjs) */
async function menu(page, label) { await page.click('#btnMenu'); await page.click(`#menuPop button:has-text("${label}")`); await wait(page, 300); }
async function drawRoom(page, x, y, w = 180, hgt = 140) {
  await page.click('.tool[data-tool="room"]');
  const b = await page.$eval('#cv', (e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y }; });
  await page.mouse.move(b.x + x, b.y + y); await page.mouse.down();
  await page.mouse.move(b.x + x + w, b.y + y + hgt, { steps: 8 }); await page.mouse.up();
  await wait(page, 1400);
}
for (const [cas, panne] of [
  ['absente (navigateur sans IndexedDB)', () => { Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true }); }],
  ['qui refuse de s’ouvrir', () => { IDBFactory.prototype.open = function () { throw new DOMException('refus', 'SecurityError'); }; }],
  ['qui ne répond jamais', () => { IDBFactory.prototype.open = function () { return {}; }; }],
]) test(`base IndexedDB ${cas} : Calque démarre, enregistre dans la copie de secours et retrouve le plan au rechargement`, async () => {
  const { ctx, page, errors } = await fresh();
  await ctx.addInitScript(panne);
  await boot(page);
  await menu(page, 'Nouveau plan');
  await drawRoom(page, 200, 200);
  const etat = await page.textContent('#saveTxt');
  assert.match(etat, /Enregistré/, etat);
  const id = await page.evaluate(() => localStorage.getItem('calque.cur'));
  assert.equal(JSON.parse(await page.evaluate((id) => localStorage.getItem('calque.p.' + id), id)).walls.length, 4);
  await page.reload(); await boot(page);
  assert.equal(await page.evaluate(() => localStorage.getItem('calque.cur')), id);
  assert.equal(await page.evaluate(async () => (await import('./js/noyau.js')).P.walls.length), 4);
  assert.deepEqual(errors, []);
  assert.equal(await page.evaluate(() => localStorage.getItem('calque.incidents')), null, 'aucun incident');
  await ctx.close();
});

test('démarrage lent (base qui tarde à répondre) : « Ouverture… » et écran inactif jusqu’à l’ouverture du plan, jamais un faux « Enregistré »', async () => {
  const { ctx, page, errors } = await fresh();
  await ctx.addInitScript(() => { IDBFactory.prototype.open = function () { return {}; }; });
  await page.goto((await import('./outils.mjs')).env.base);
  await wait(page, 800);
  assert.equal(await page.evaluate(() => document.body.dataset.demarrage), '1');
  assert.equal(await page.textContent('#saveTxt'), 'Ouverture…');
  assert.equal(await page.$eval('#cv', (e) => getComputedStyle(e.parentElement).pointerEvents === 'none' || getComputedStyle(e).pointerEvents === 'none'), true);
  await page.waitForFunction(() => !document.body.dataset.demarrage, null, { timeout: 8000 });
  assert.doesNotMatch(await page.textContent('#saveTxt'), /Ouverture/);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('valeurs extrêmes : aucun « NaN », « Infinity » ni « undefined » dans les fiches de calcul, les panneaux et le tableau électrique', async () => {
  const I = await import('../js/formules.js');
  const MAUVAIS = /\bNaN\b|Infinity|∞|undefined|\[object Object\]/;
  /* 1. les 29 fiches de l'onglet Calculs, à leurs bornes */
  const fiches = [];
  for (const fi of I.FORMULES) {
    const ex = I.valeursExemple(fi);
    const cas = [];
    for (const e of fi.e) for (const v of [e.min, e.max, 0, 1e-9]) if (v != null) cas.push({ ...ex, [e.k]: v });
    for (const bord of ['min', 'max']) { const o = { ...ex }; for (const e of fi.e) if (e[bord] != null) o[e.k] = e[bord]; cas.push(o); }
    for (const c of cas) { const t = JSON.stringify(I.calculer(fi, c)); if (MAUVAIS.test(t)) fiches.push(fi.id + ' ' + JSON.stringify(c)); }
  }
  assert.deepEqual(fiches, []);
  /* 2. le plan d'exemple poussé aux extrêmes, parcouru panneau par panneau */
  const { ctx, page, errors } = await fresh();
  await boot(page);
  const r = await page.evaluate(async (src) => {
    const MAUVAIS = new RegExp(src);
    const N = await import('./js/noyau.js'); const St = await import('./js/stockage.js'); const E = await import('./js/exemple.js');
    const UI = await import('./js/interface.js'); const T = await import('./js/tableau.js'); const Fi = await import('./js/fiche.js');
    const p = E.samplePlan();
    const d = (v) => ({ v, st: 'saisie', src: 'essai de valeurs extrêmes' });
    p.circuits.forEach((c, i) => {
      const k = i % 4;
      if (k === 0) c.calc = { p: d(0), len: d(0), cos: d(0) };
      if (k === 1) { c.calc = { p: d(1e6), len: d(1e4), cos: d(1) }; c.cal = 0; }
      if (k === 2) { delete c.sec; delete c.cal; c.calc = {}; }
      if (k === 3) c.calc = { p: d(-5), len: d(-1) };
    });
    p.levels[0].h = 0; if (p.levels[1]) p.levels[1].slab = 0;
    p.walls.slice(0, 3).forEach((w) => { w.couches = [{ m: 'laine_verre', e: 0 }]; w.th = 0.01; });
    p.install.kva = 0;
    St.openPlan(p, 'pEXT', { quiet: true, example: true });
    const vus = [];
    const scan = (ou) => { const t = document.body.innerText + [...document.querySelectorAll('svg text')].map((x) => x.textContent).join(' '); const m = t.match(new RegExp('[^]{0,120}(' + src + ')[^]{0,60}')); if (m) vus.push(ou + ' : ' + m[0].replace(/\s+/g, ' ')); };
    const attendre = () => new Promise((res) => setTimeout(res, 30));
    /* panneaux du plan */
    for (const [t, k] of [['wall', 'walls'], ['room', 'rooms'], ['elec', 'elec'], ['duct', 'ducts'], ['opening', 'openings']]) {
      for (const o of N.P[k].slice(0, 25)) { N.ui.lv = o.lv || N.ui.lv; N.ui.sel = { t, id: o.id }; N.ui.inspOpen = true; UI.renderInspector(); for (const b of document.querySelectorAll('#insp details:not([open])')) b.open = true; await attendre(); scan(t + ' ' + o.id); }
    }
    N.ui.sel = null; UI.renderInspector(); await attendre(); scan('panneau du niveau');
    /* tableau électrique : chaque onglet, puis la fiche de chaque circuit */
    T.setView('elec');
    for (const tab of ['uni', 'panel', 'check', 'calc', 'quant', 'chem']) { N.ui.evTab = tab; T.renderEvMain(); await attendre(); scan('onglet ' + tab); }
    for (const c of N.P.circuits) { Fi.openFiche(c.id); await attendre(); scan('fiche ' + c.name); UI.closeModal(); }
    T.setView('plan');
    /* exports PDF et DXF du plan aux valeurs extrêmes */
    const X = await import('./js/export.js');
    const exports = {};
    try { exports.dxf = X.composeDXF({ lv: 'all', dims: true, names: true, areas: true, furn: true, elec: true, unit: 'cm' }).bilan.total; } catch (e) { exports.dxf = 'ERREUR ' + e.message; }
    try { exports.pdf = (await X.composePDF(Object.assign({}, X.expOpts(), { fmt: 'pdf', lv: 'all' }))).size; } catch (e) { exports.pdf = 'ERREUR ' + e.message; }
    /* contrôle NF C 15-100 : un circuit sans calibre ni section n'est jamais « conforme » pour cette règle */
    const R = await import('./js/reglesui.js').catch(() => null);
    const rap = R && R.rapportDuPlan ? R.rapportDuPlan() : null;
    const sansCal = N.P.circuits.filter((c) => !Number.isFinite(c.cal)).map((c) => c.id);
    const lignes = rap ? (rap.resultats || rap.lignes || []).filter((x) => x.id === 'cq_sec_cal' && x.ref && sansCal.includes(x.ref.id)) : [];
    return { exports, vus: vus.slice(0, 15), sansCal: sansCal.length, lignes: lignes.map((x) => x.statut), rapOk: !!rap };
  }, MAUVAIS.source);
  assert.deepEqual(r.vus, []);
  assert.ok(r.exports.dxf > 100 && r.exports.pdf > 10000, JSON.stringify(r.exports));
  assert.ok(r.rapOk, 'rapport du contrôle');
  assert.ok(r.sansCal >= 1 && r.lignes.length === r.sansCal, JSON.stringify(r));
  assert.ok(r.lignes.every((st) => st === 'verification'), 'vérification nécessaire, jamais conforme');
  assert.deepEqual(errors, []);
  await ctx.close();
});

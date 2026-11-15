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
    return { out, modal, copie: !!copie, exacte: json === avant };
  });
  assert.deepEqual(res.out, []);
  assert.match(res.modal, /Plan réparé à l’ouverture/);
  assert.match(res.modal, /1 élément vide ou illisible retiré \(murs\)/);
  assert.match(res.modal, /1 pièce sans nom/);
  assert.match(res.modal, /1 zone interdite sans contour retirée/);
  assert.ok(res.copie, 'copie de sécurité');
  assert.ok(res.exacte, 'copie identique au plan d’origine');
  assert.deepEqual(errors, []);
  await ctx.close();
});

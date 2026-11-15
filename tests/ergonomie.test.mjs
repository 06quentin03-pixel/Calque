// Ergonomie (15 novembre 2026, demandes de l'utilisateur) : panneau de droite sans débordement et plus lisible,
// explications repliées (ⓘ), plancher et plafond composés soi-même, « Mes compositions », meubles d'angle de cuisine.
// Lancer :  node --test tests/ergonomie.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, wait } from './outils.mjs';

/* ouvre le plan d'exemple (sans l'enregistrer) */
async function exemple(page) {
  await page.evaluate(async () => { const St = await import('./js/stockage.js'), E = await import('./js/exemple.js'); St.openPlan(E.samplePlan(), 'pERG', { quiet: true, example: true }); });
}

for (const vp of [{ width: 1180, height: 820 }, { width: 820, height: 1180 }, { width: 390, height: 844 }]) {
  test(`panneau de droite (${vp.width} × ${vp.height}) : aucun panneau ne déborde sur le côté (choix « Local non chauffé / Toiture »…)`, async () => {
    const { ctx, page, errors } = await fresh({ viewport: vp });
    await boot(page);
    await exemple(page);
    const r = await page.evaluate(async () => {
      const N = await import('./js/noyau.js'), UI = await import('./js/interface.js');
      const insp = document.getElementById('insp'), out = [];
      const verif = (ou) => {
        for (const d of insp.querySelectorAll('details')) d.open = true;
        if (insp.scrollWidth > insp.clientWidth + 1) out.push(ou);
      };
      for (const l of N.P.levels) {
        N.ui.lv = l.id; N.ui.sel = null; N.ui.inspOpen = true; UI.renderInspector();
        /* sections repliées du niveau (Thermique, Plancher et plafond) ouvertes */
        for (const b of [...insp.querySelectorAll('button')].filter((x) => /^(Thermique|Plancher, plafond)/.test(x.textContent.trim()))) b.click();
        await new Promise((res) => setTimeout(res, 30)); verif('niveau ' + l.name);
      }
      for (const [t, k] of [['wall', 'walls'], ['room', 'rooms'], ['elec', 'elec'], ['duct', 'ducts'], ['opening', 'openings'], ['item', 'items']]) {
        for (const o of N.P[k]) { N.ui.lv = o.lv || N.ui.lv; N.ui.sel = { t, id: o.id }; N.ui.inspOpen = true; UI.renderInspector(); verif(t + ' ' + o.id); }
      }
      return { out: out.slice(0, 10), largeur: insp.getBoundingClientRect().width };
    });
    assert.deepEqual(r.out, []);
    if (vp.width === 1180) assert.ok(r.largeur >= 320, 'panneau élargi en iPad paysage : ' + r.largeur);
    if (vp.width === 820) assert.ok(r.largeur >= 320, 'panneau élargi en iPad portrait : ' + r.largeur);
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

test('explications : les longs textes du panneau sont repliés (première phrase + ⓘ), ⓘ ouvre l’explication complète ; les textes courts restent entiers', async () => {
  const A = await import('../js/aide.js');
  assert.equal(A.premierePhrase('Méthode simplifiée de Calque : aide au dimensionnement du chauffage, pas une étude réglementaire.'), 'Méthode simplifiée de Calque…');
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await exemple(page);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), UI = await import('./js/interface.js');
    N.ui.sel = null; N.ui.inspOpen = true; UI.renderInspector();
    await new Promise((res) => setTimeout(res, 50));
    const insp = document.getElementById('insp');
    const notes = [...insp.querySelectorAll('p.note')];
    const longues = notes.filter((p) => p.querySelector('.aide-i'));
    const courtes = notes.filter((p) => !p.querySelector('.aide-i'));
    return {
      longues: longues.length,
      complet: longues.every((p) => p.querySelector('.aide-complet').textContent.length > 110),
      visible: longues.every((p) => p.querySelector('.aide-court').getBoundingClientRect().height > 0 && p.querySelector('.aide-complet').hidden),
      courtesEntieres: courtes.every((p) => p.textContent.trim().length <= 110),
      texte: longues[0] && longues[0].querySelector('.aide-complet').textContent,
    };
  });
  assert.ok(r.longues >= 1, 'textes repliés : ' + r.longues);
  assert.ok(r.complet && r.visible && r.courtesEntieres);
  await page.locator('#insp .aide-i').first().click();
  await page.waitForSelector('.aide-pop');
  assert.equal((await page.textContent('.aide-pop .aide-c')).trim(), r.texte.trim(), 'explication complète, sans rien perdre');
  await page.click('.aide-pop .aide-x');
  assert.equal(await page.locator('.aide-pop').count(), 0);
  /* toucher ailleurs ferme aussi la fenêtre */
  await page.locator('#insp .aide-i').first().click();
  await page.waitForSelector('.aide-pop');
  await page.mouse.click(400, 400);
  assert.equal(await page.locator('.aide-pop').count(), 0);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('plancher et plafond : « Composer moi-même », nom, « Mes compositions » réutilisable sur un autre niveau ; Annuler', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await page.click('#btnMenu'); await page.click('#menuPop button:has-text("Nouveau plan")'); await wait(page, 300);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), UI = await import('./js/interface.js'), X = await import('./js/interaction.js');
    const insp = document.getElementById('insp');
    const clic = (re, i = 0) => { const b = [...insp.querySelectorAll('button')].filter((x) => re.test(x.textContent.trim()))[i]; if (!b) throw new Error('bouton ' + re); b.click(); };
    const attendre = () => new Promise((res) => setTimeout(res, 40));
    N.ui.sel = null; N.ui.inspOpen = true; UI.renderInspector(); await attendre();
    const ouvrir = async () => { const b = [...insp.querySelectorAll('button')].find((x) => /^Plancher, plafond/.test(x.textContent.trim())); if (b) { b.click(); await attendre(); } };
    await ouvrir();
    clic(/^Composer moi-même$/, 1); await attendre(); // plafond
    const L0 = N.P.levels[0];
    const apresComposer = JSON.parse(JSON.stringify(L0.plafond || null));
    /* nom de la composition */
    const nom = insp.querySelector('#f-plafond-nom');
    nom.value = 'Plafond acoustique du séjour'; nom.dispatchEvent(new Event('change')); await attendre();
    /* ajouter une couche, puis enregistrer dans Mes compositions */
    await ouvrir();
    clic(/^Ajouter une couche$/, 0); await attendre();
    clic(/^Enregistrer dans mes compositions$/, 0); await attendre();
    const mes = JSON.parse(JSON.stringify(N.S.mesCompos || []));
    /* un autre niveau : la composition est proposée en tête, et s'applique */
    UI.addLevel('empty'); await attendre();
    N.ui.sel = null; UI.renderInspector(); await attendre(); await ouvrir();
    clic(/^Choisir une composition$/, 1); await attendre();
    const titres = [...insp.querySelectorAll('h4')].map((x) => x.textContent);
    const choix = [...insp.querySelectorAll('.compo-pick')].find((b) => /Plafond acoustique du séjour/.test(b.textContent));
    choix.click(); await attendre();
    const L1 = N.P.levels.find((l) => l.id === N.ui.lv);
    const res = { apresComposer, nomL0: L0.plafond && L0.plafond.cn, couchesL0: L0.plafond && L0.plafond.couches.length, mes, titres, L1: JSON.parse(JSON.stringify(L1.plafond || null)) };
    X.undo();
    res.annule = !(N.P.levels.find((l) => l.id === L1.id) || {}).plafond;
    return res;
  });
  assert.deepEqual(r.apresComposer, { couches: [{ m: 'plaque', e: 1.25 }] });
  assert.equal(r.nomL0, 'Plafond acoustique du séjour');
  assert.equal(r.couchesL0, 2);
  assert.equal(r.mes.length, 1); assert.equal(r.mes[0].usage, 'plafond'); assert.equal(r.mes[0].couches.length, 2);
  assert.ok(r.titres.includes('Mes compositions'));
  assert.equal(r.L1.cn, 'Plafond acoustique du séjour'); assert.equal(r.L1.couches.length, 2);
  assert.ok(r.annule, 'Annuler retire la composition appliquée');
  /* gardée sur l'appareil (réglages) */
  assert.equal(JSON.parse(await page.evaluate(() => localStorage.getItem('calque.settings'))).mesCompos.length, 1);
  assert.deepEqual(errors, []);
  await ctx.close();
});

test('cuisine en L : meubles d’angle (bas en L, haut en L, plan de travail d’angle, angle aveugle) en 2D, en 3D et dans les exports', async () => {
  const { ctx, page, errors } = await fresh();
  await boot(page);
  await exemple(page);
  const r = await page.evaluate(async () => {
    const N = await import('./js/noyau.js'), Sy = await import('./js/symboles.js'), X = await import('./js/export.js');
    const modeles = ['mba90', 'mba100', 'mbaa', 'mha60', 'pta'].map((k) => Sy.FURN_BY.get(k)).map((d) => d && { n: d.n, t: d.t, cat: d.cat });
    /* forme en L dessinée : le coin intérieur (côté pièce) reste vide, le coin contre les murs est plein */
    const cv = document.createElement('canvas'); cv.width = 200; cv.height = 200; const c = cv.getContext('2d');
    c.translate(100, 100);
    Sy.drawItem(c, { type: 'meuble_angle', x: 0, y: 0, w: 90, d: 90, rot: 0 }, { px: 1, ink: '#000', fill: '#f00', tone: '#0f0', bg: '#fff' });
    const px = (x, y) => [...c.getImageData(100 + x, 100 + y, 1, 1).data];
    const forme = { coinMur: px(-40, -25), brasFond: px(30, -40), brasCote: px(-40, 30), coinPiece: px(30, 30) };
    const cuisine = N.P.items.filter((it) => /^(meuble_angle|meuble_haut_angle)$/.test(it.type)).map((it) => it.type);
    const dxf = X.composeDXF({ lv: 'all', dims: true, names: true, areas: true, furn: true, elec: true, unit: 'cm' }).bilan.total;
    return { modeles, forme, cuisine, dxf, dbg: JSON.stringify(forme) };
  });
  assert.ok(r.modeles.every((m) => m && m.cat === 'cuisine'), JSON.stringify(r.modeles));
  assert.deepEqual(r.modeles.map((m) => m.t), ['meuble_angle', 'meuble_angle', 'meuble_bas', 'meuble_haut_angle', 'plan_angle']);
  const rouge = (p) => p[3] > 200 && p[0] > 200 && p[1] < 60;
  assert.ok(rouge(r.forme.coinMur) && rouge(r.forme.brasFond) && rouge(r.forme.brasCote), 'L plein le long des murs ' + r.dbg);
  assert.equal(r.forme.coinPiece[3], 0, 'coin côté pièce vide (forme en L)');
  assert.deepEqual(r.cuisine.sort(), ['meuble_angle', 'meuble_haut_angle'], 'plan d’exemple : angle de la cuisine en L');
  assert.ok(r.dxf > 100);
  /* vue 3D construite sans erreur avec les meubles d'angle */
  await page.click('[data-view="3d"]'); await wait(page, 1200);
  await page.click('[data-view="plan"]'); await wait(page, 300);
  assert.deepEqual(errors, []);
  await ctx.close();
});

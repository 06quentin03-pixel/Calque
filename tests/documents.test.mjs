// Tests de la phase 6 : moteur documentaire (dossier PDF avec cartouche et indice de révision), format des plans v8.
// Lancer depuis la racine du dépôt :  node --test tests/documents.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ROOT, fresh, wait, boot, seedPlan, storedPlan, idb } from './outils.mjs';

const PDF = await import(path.join(ROOT, 'js', 'pdf.js'));
const SVG = await import(path.join(ROOT, 'js', 'svgpdf.js'));
const D = await import(path.join(ROOT, 'js', 'documents.js'));

/* ---------- lecture d'un PDF non compressé : textes affichés (Tj), décodés depuis WinAnsi ---------- */
const WIN = new Map([[128, '€'], [146, '’'], [150, '–'], [151, '—'], [133, '…'], [156, 'œ']]);
function textesPDF(bytes) {
  const s = Buffer.from(bytes).toString('latin1'), out = [];
  const re = /\(((?:\\.|[^\\)])*)\) Tj/g; let m;
  while ((m = re.exec(s))) {
    out.push(m[1].replace(/\\([0-7]{3}|.)/g, (x, e) => { if (e.length === 3) { const c = parseInt(e, 8); return WIN.get(c) || String.fromCharCode(c); } return e; }));
  }
  return out;
}
/* structure : en-tête, table des objets (xref) cohérente, nombre de pages */
function structurePDF(bytes) {
  const s = Buffer.from(bytes).toString('latin1');
  assert.ok(s.startsWith('%PDF-1.4'), 'en-tête PDF');
  assert.ok(s.trimEnd().endsWith('%%EOF'), 'fin de fichier');
  const sx = +/startxref\n(\d+)/.exec(s)[1];
  assert.equal(s.slice(sx, sx + 4), 'xref', 'startxref pointe sur la table');
  const n = +/xref\n0 (\d+)/.exec(s)[1];
  const offs = s.slice(sx).split('\n').slice(3, 2 + n).map((l) => +l.slice(0, 10));
  offs.forEach((o, i) => assert.equal(s.slice(o, o + String(i + 1).length + 6), `${i + 1} 0 obj`, `objet ${i + 1} à sa place`));
  return { pages: +/\/Count (\d+)/.exec(s)[1] };
}

/* plan de test : une pièce 4 × 5 m, un tableau, 2 circuits, une gaine, une étude d'éclairage */
const N = (id, x, y) => ({ id, lv: 'L0', x, y });
function planTest(extra) {
  return Object.assign({ v: 8, id: 'pDoc', name: 'Maison Martin', levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }],
    nodes: [N('n1', 0, 0), N('n2', 400, 0), N('n3', 400, 500), N('n4', 0, 500)],
    walls: [['w1', 'n1', 'n2'], ['w2', 'n2', 'n3'], ['w3', 'n3', 'n4'], ['w4', 'n4', 'n1']].map(([id, a, b]) => ({ id, lv: 'L0', a, b, th: 20, kind: 'mur' })),
    openings: [], items: [], rooms: [{ id: 'r1', lv: 'L0', name: 'Séjour', x: 200, y: 250 }], dims: [], texts: [], links: [], comps: [], fonds: [], fondImg: {}, zones: [], photometries: [],
    etudes: [{ id: 'e1', lv: 'L0', room: 'r1', E: { v: 300, st: 'saisie' }, lums: [{ type: 'dalle_led', flux: { v: 3600, st: 'saisie' }, p: { v: 36, st: 'saisie' } }] }],
    elec: [{ id: 't', lv: 'L0', type: 'tableau', x: 20, y: 250, rot: 90, h: 130 },
      { id: 'a', lv: 'L0', type: 'pc', x: 380, y: 250, rot: 270, h: 30, cid: 'c1' },
      { id: 'b', lv: 'L0', type: 'pl', x: 200, y: 250, rot: 0, h: null, cid: 'c2' }],
    ducts: [{ id: 'g1', lv: 'L0', sys: 'elec', a: 't', b: 'a', pts: [{ x: 20, y: 250 }, { x: 380, y: 250 }], kind: 'icta', dia: 20, pose: 'sol', cid: 'c1' }],
    circuits: [{ id: 'c1', kind: 'prises', name: 'Prises séjour', cal: 20, sec: 2.5, rcd: 'd1' },
      { id: 'c2', kind: 'eclairage', name: 'Éclairage séjour', cal: 16, sec: 1.5, rcd: 'd1', calc: { p: { v: 300, st: 'saisie' }, cos: { v: 1, st: 'saisie' } } }],
    rcds: [{ id: 'd1', type: 'A', cal: 40 }], install: { kva: 9, parafoudre: false, row: 13 },
    doc: { client: 'Mme Martin', adresse: '3 rue des Tilleuls', revisions: [{ i: 'A', date: Date.UTC(2026, 9, 1), objet: 'Première diffusion' }, { i: 'B', date: Date.UTC(2026, 10, 5), objet: 'Ajout de l’éclairage' }] } }, extra || {});
}
const pieceDe = () => ({ poly: [{ x: 10, y: 10 }, { x: 390, y: 10 }, { x: 390, y: 490 }, { x: 10, y: 490 }], holes: [], area: 380 * 480 });

test('pdf.js et svgpdf.js sans écran : mesure Helvetica, coupure, lecture et dessin d’un SVG', () => {
  // Helvetica : « H » = 722 / 1000 em
  assert.equal(PDF.textWidth('H', 10, false), 7.22);
  assert.ok(PDF.textWidth('Éé', 10, true) > 0, 'accents codés en WinAnsi');
  const l = D.couper('un deux trois quatre cinq six sept huit', 10, false, 60);
  assert.ok(l.length > 1 && l.every((x) => PDF.textWidth(x, 10, false) <= 60), 'lignes coupées à la largeur');
  const svg = '<svg viewBox="0 0 200 100"><g style="stroke:#000"><line x1="0" y1="0" x2="200" y2="100"/></g><rect x="1" y="1" width="10" height="10" style="fill:none;stroke:#C00"/>' +
    '<path d="M10 10 l5 0 L20 20 z" style="fill:#000"/><circle cx="50" cy="50" r="3" style="fill:#000"/><text x="5" y="90" style="fill:#000;font-size:9px;text-anchor:middle">R &amp; D</text><foreignObject/></svg>';
  const doc = SVG.lireSVG(svg);
  assert.equal(doc.W, 200); assert.equal(doc.H, 100);
  assert.deepEqual(doc.els.map((e) => e.tag), ['line', 'rect', 'path', 'circle', 'text']);
  assert.equal(doc.els[0].a.stroke, '#000', 'style hérité du groupe');
  assert.equal(doc.els[4].text, 'R & D');
  assert.equal(doc.ignores, 1, 'élément inconnu compté, pas inventé');
  const c = new PDF.PdfCtx(400, 300, { helv: true });
  const r = SVG.dessinerSVG(c, svg, { x: 0, y: 0, w: 400, h: 300 });
  assert.equal(r.k, 2, 'échelle : 400 / 200');
  const out = c.out.join('\n');
  assert.match(out, /\(R & D\) Tj/); assert.match(out, / S\n|\nS$|\bS\b/);
});

test('cartouche : indices A, B… Z, AA ; nettoyage des informations du dossier', () => {
  assert.equal(D.indiceSuivant({ revisions: [] }), 'A');
  assert.equal(D.indiceSuivant({ revisions: [{ i: 'A' }] }), 'B');
  assert.equal(D.indiceSuivant({ revisions: [{ i: 'Z' }] }), 'AA');
  assert.equal(D.indiceSuivant({ revisions: [{ i: 'AZ' }] }), 'BA');
  assert.deepEqual(D.nettoyerDoc(null), { revisions: [] });
  assert.deepEqual(D.nettoyerDoc({ client: '  Mme X ', adresse: 3, revisions: [{ i: 'A', date: 5, objet: 'ok' }, { i: '', date: 1 }, { i: 'B' }, 'x'], pirate: 1 }),
    { client: 'Mme X', revisions: [{ i: 'A', date: 5, objet: 'ok' }] }, 'champs invalides retirés, rien d’ajouté');
  const p = planTest();
  assert.deepEqual([...D.reperes(p).entries()], [['c1', 'C1'], ['c2', 'C2']]);
});

test('dossier PDF complet (sans écran) : chapitres, sommaire, cartouche avec indice, estimé et manquant affichés', async () => {
  const p = planTest();
  const svg = '<svg viewBox="0 0 300 100"><line x1="0" y1="50" x2="300" y2="50" style="stroke:#000"/><text x="10" y="20" style="fill:#000;font-size:10px">Schéma test</text></svg>';
  const res = await D.dossierPDF(p, { pieceDe, svgUnifilaire: svg, compress: false, date: Date.UTC(2026, 10, 5) });
  const bytes = new Uint8Array(await res.blob.arrayBuffer());
  const st = structurePDF(bytes);
  assert.equal(st.pages, res.pages);
  assert.deepEqual(res.chapitres.map((c) => c.id), ['garde', 'plans', 'plans_elec', 'unifilaire', 'coffret', 'nomenclature', 'bilan', 'metres', 'quantitatif', 'eclairage', 'controles', 'chantier', 'variantes']);
  assert.ok(res.chapitres.every((c, i, a) => i === 0 || c.page > a[i - 1].page), 'pages croissantes');
  const T = textesPDF(bytes), all = T.join('\n');
  // cartouche sur chaque page : indice courant B, page n / N
  for (let i = 1; i <= res.pages; i++) assert.ok(T.includes(`${i} / ${res.pages}`), `numéro de la page ${i}`);
  assert.ok(T.filter((t) => t === 'Indice').length >= res.pages, 'cartouche sur chaque page');
  assert.ok(T.filter((t) => t === 'B').length >= res.pages, 'indice B sur chaque page');
  assert.ok(all.includes('Maison Martin') && all.includes('Mme Martin · 3 rue des Tilleuls'));
  assert.ok(all.includes('Ajout de l’éclairage') && all.includes('Première diffusion'), 'tableau des révisions');
  // sommaire : chaque chapitre avec son numéro de page
  for (const c of res.chapitres) assert.ok(T.includes(c.n), `sommaire : ${c.n}`);
  // schéma unifilaire redessiné (vectoriel) ; sans dessin du plan, le chapitre le dit
  assert.ok(T.includes('Schéma test'));
  assert.ok(all.includes('Plans non disponibles'), 'plan non dessiné : signalé, pas inventé');
  assert.ok(all.includes('Pas encore de tableau') || T.includes('Coffret électrique (implantation des appareils)'));
  // nomenclature
  assert.ok(T.includes('Prises séjour') && T.includes('ID1') && T.includes('2,5 mm²'));
  // estimé : métrés, matériel, éclairage ; manquant : puissance des prises
  const nEst = T.filter((t) => t === 'Estimée').length;
  assert.ok(nEst >= 8, `valeurs estimées marquées (${nEst})`);
  assert.ok(all.includes('ESTIMÉES'), 'avertissement des métrés');
  assert.ok(all.includes('Résultats ESTIMÉS'), 'avertissement de l’éclairage');
  assert.ok(T.includes('Manquante'), 'valeur manquante écrite « Manquante »');
  assert.ok(T.some((t) => /^\d+(,\d)? m$/.test(t)), 'longueur mesurée sur le plan');
  assert.ok(all.includes('Propositions de Calque (estimations) :'), 'propositions de l’étude d’éclairage');
  assert.ok(all.includes('Implantation actuelle : 1 luminaire dans la pièce, dont 1 sans flux connu'), 'luminaire sans flux : non compté, signalé');
  // pas de conformité globale sans rapport
  assert.ok(!all.includes('Installation conforme'));
  // choix des chapitres
  const r2 = await D.dossierPDF(p, { chapitres: ['metres'], compress: false });
  assert.equal(r2.pages, 1); assert.deepEqual(r2.chapitres.map((c) => c.id), ['metres']);
  // dossier non diffusé : aucun indice inventé
  const r3 = await D.dossierPDF(planTest({ doc: { revisions: [] } }), { chapitres: ['garde'], compress: false });
  const T3 = textesPDF(new Uint8Array(await r3.blob.arrayBuffer()));
  assert.ok(T3.includes('— (non diffusé)'));
});

test('migration v7 → v8 : informations du dossier vides, copie de sécurité', async () => {
  const { ctx, page, errors } = await fresh();
  const v7 = planTest({ v: 7, id: 'pD7', name: 'Plan v7' }); delete v7.doc;
  const bad = planTest({ v: 7, id: 'x', doc: { client: 12, revisions: [{ i: 'A' }, { i: 'B', date: 10, objet: 'ok' }] } });
  await seedPlan(ctx, v7);
  await boot(page);
  const m = await page.evaluate(async ([a, b]) => {
    const S = await import('./js/stockage.js');
    const x = S.migratePlan(JSON.parse(JSON.stringify(a))), y = S.migratePlan(JSON.parse(JSON.stringify(b)));
    const z = S.migratePlan(JSON.parse(JSON.stringify(y.plan)));
    return { ver: S.PLAN_VERSION, has: Object.keys(S.MIGRATIONS).map(Number), x, y, z };
  }, [v7, bad]);
  assert.equal(m.ver, 15); // format actuel
  for (let v = 1; v < m.ver; v++) assert.ok(m.has.includes(v), `migration ${v} → ${v + 1}`);
  assert.equal(m.x.from, 7); assert.equal(m.x.plan.v, 15);
  assert.deepEqual(m.x.plan.doc, { revisions: [] }, 'aucun indice inventé');
  assert.deepEqual(m.y.plan.doc, { revisions: [{ i: 'B', date: 10, objet: 'ok' }] }, 'valeurs invalides retirées');
  assert.deepEqual(m.z.plan, m.y.plan, 'migration sans effet sur un plan à jour');
  await wait(page, 800);
  const vers = await idb(page, 'versions');
  const v = vers.find((x) => x.pid === 'pD7' && /avant mise à jour du format \(v7 → v15\)/.test(x.why));
  assert.ok(v, 'copie de sécurité avant mise à jour du format');
  assert.equal(JSON.parse((await idb(page, 'vdata', v.k)).json).v, 7, 'la copie est le plan d’origine');
  const cur = await page.evaluate(async () => { const P = (await import('./js/noyau.js')).P; return { v: P.v, n: P.circuits.length, doc: P.doc }; });
  assert.equal(cur.v, 15); assert.equal(cur.n, 2, 'rien de perdu'); assert.deepEqual(cur.doc, { revisions: [] });
  assert.deepEqual(errors, []);
  await ctx.close();
});

for (const [nom, vp] of [['iPad paysage', { width: 1180, height: 820 }], ['iPad portrait', { width: 820, height: 1180 }], ['téléphone', { width: 390, height: 844 }]]) {
  test(`fenêtre « Dossier PDF » (${nom}) : cartouche, indice, préparation du PDF`, async () => {
    const { ctx, page, errors } = await fresh({ viewport: vp, touch: true });
    await seedPlan(ctx, planTest({ id: 'pDU', doc: { revisions: [] } }));
    await boot(page);
    await page.click('#btnMenu, [aria-label="Menu"]').catch(() => {});
    const viaMenu = await page.locator('button:has-text("Dossier PDF")').count();
    if (viaMenu) await page.locator('button:has-text("Dossier PDF")').first().click();
    else await page.evaluate(async () => (await import('./js/dossierui.js')).openDossier());
    await wait(page, 300);
    assert.equal(await page.locator('#modal h2', { hasText: 'Dossier PDF' }).count(), 1);
    // rien ne dépasse en largeur
    const ov = await page.$eval('#modal', (m) => ({ sw: m.scrollWidth, cw: m.clientWidth, r: m.getBoundingClientRect().right }));
    assert.ok(ov.sw <= ov.cw + 1 && ov.r <= vp.width + 1, 'pas de défilement horizontal');
    // boutons des chapitres assez grands pour le doigt et le Pencil
    const hb = await page.$$eval('.dos-chips .chip', (l) => Math.min(...l.map((b) => b.getBoundingClientRect().height)));
    assert.ok(hb >= 44, `boutons de 44 px (${hb})`);
    // cartouche saisi au clavier, enregistré dans le plan
    await page.fill('#f-doc-client', 'Mme Martin'); await page.press('#f-doc-client', 'Enter'); await wait(page, 200);
    await page.fill('#f-doc-objet', 'Première diffusion');
    await page.click('button:has-text("Enregistrer l’indice A")'); await wait(page, 900);
    const doc = await page.evaluate(async () => (await import('./js/noyau.js')).P.doc);
    assert.equal(doc.client, 'Mme Martin');
    assert.equal(doc.revisions.length, 1); assert.equal(doc.revisions[0].i, 'A'); assert.equal(doc.revisions[0].objet, 'Première diffusion');
    assert.ok(await page.locator('button:has-text("Enregistrer l’indice B")').count(), 'indice suivant proposé');
    const vers = await idb(page, 'versions');
    assert.ok(vers.some((x) => x.pid === 'pDU' && x.why === 'Indice A du dossier'), 'version de l’historique à l’indice A');
    // préparation : le PDF est prêt, les boutons d'envoi s'activent
    assert.ok(await page.locator('#modal .exp-act').first().isDisabled());
    await page.click('button:has-text("Préparer le PDF")');
    let f = null;
    for (let i = 0; i < 60 && !f; i++) { await wait(page, 250); f = await page.evaluate(async () => { const d = (await import('./js/dossierui.js')).DS; return d.file ? { name: d.file.name, size: d.file.size, pages: d.pages, head: await d.file.slice(0, 8).text() } : null; }); }
    assert.ok(f, 'PDF préparé');
    assert.equal(f.name, 'maison-martin-dossier-indA.pdf');
    assert.equal(f.head, '%PDF-1.4'); assert.ok(f.pages >= 8 && f.size > 5000);
    assert.ok(await page.locator('#modal .exp-act').first().isEnabled());
    const st = await storedPlan(page, 'pDU');
    assert.equal(st.doc.revisions[0].i, 'A', 'indice enregistré dans le plan');
    assert.deepEqual(errors, []);
    await ctx.close();
  });
}

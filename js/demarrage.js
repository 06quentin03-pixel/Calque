/* Calque — module « demarrage » : plan d’exemple, clavier, démarrage.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { $, $$, P, blankPlan, inPoly, loadSettings, projSeg, setP, touch, ui, uid, vdot, vsub } from './noyau.js';
import { geo, syncRooms } from './geometrie.js';
import { addWall, clampOpening } from './mutations.js';
import { H } from './historique.js';
import { ELEC_BY, FURN_BY } from './symboles.js';
import { readColors } from './rendu2d.js';
import { generateFromPlan } from './electricite.js';
import { closeDimEdit, finishDuct, openFilterPop } from './reseaux.js';
import { SCR, finishChain, fitView, keys, makeElecFromDef, makeItemFromDef, newOpening, redo, requestRender,
  resizeCanvas, select, undo, zoomAt } from './interaction.js';
import { renderEvMain, setView } from './tableau.js';
import { ICON, closeModal, closePops, copyWalls, deleteSel, duplicateSel, h, nudgeSel, renderInspector, renderMenuPop,
  renderViewPop, rotateSel, setTool, showPop, toast, updateHint } from './interface.js';
import { DB, Store, askPersist, getDownloads, listProjects, loadProject, lsGet, openPlan, openProjects, saveNow,
  setSave, syncFromLocal } from './stockage.js';
import { openExport } from './export.js';
import { V3, v3Key3, v3Refresh } from './vue3d.js';

/* ---------------- plan d'exemple ---------------- */
function samplePlan() {
  setP(blankPlan('Exemple de maison'));
  P.levels = [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }, { id: 'L1', name: 'Étage', elev: 270, h: 240, slab: 20 }];
  touch();
  const M = { th: 20, kind: 'mur' }, CL = { th: 7, kind: 'cloison' };
  const W = (x1, y1, x2, y2, pr) => addWall('L0', { x: x1, y: y1 }, { x: x2, y: y2 }, pr);
  W(0, 0, 1000, 0, M); W(1000, 0, 1000, 800, M); W(1000, 800, 0, 800, M); W(0, 800, 0, 0, M);
  W(560, 0, 560, 800, CL); W(0, 450, 560, 450, CL); W(330, 450, 330, 800, CL);
  W(560, 380, 1000, 380, CL); W(700, 380, 700, 800, CL); W(700, 620, 1000, 620, CL); W(830, 620, 830, 800, CL);
  touch();
  const op = (x, y, kind, props, toward) => {
    const g = geo('L0'); let best = null;
    for (const wg of g.walls.values()) { const pr = projSeg({ x, y }, wg.A, wg.B); if (pr.t > 0 && pr.t < 1 && pr.d < 12 && (!best || pr.d < best.d)) best = { wg, d: pr.d, t: pr.t * wg.L }; }
    if (!best) return;
    const side = toward ? Math.sign(vdot(vsub(toward, best.wg.A), best.wg.n)) || 1 : 1;
    const o = newOpening(kind, best.wg, best.t, side);
    Object.assign(o, props);
    if (toward && kind === 'door') o.side = side;
    clampOpening(o);
  };
  op(445, 800, 'door', { type: 'entree', w: 90, h: 215 }, { x: 445, y: 700 });
  op(445, 450, 'door', { w: 83 }, { x: 445, y: 550 });
  op(230, 450, 'door', { type: 'coulissante', w: 93, leaves: 1, hinge: 1 }, { x: 230, y: 520 });
  op(560, 620, 'door', { w: 83 }, { x: 630, y: 620 });
  op(630, 380, 'door', { w: 83, hinge: 1 }, { x: 630, y: 300 });
  op(700, 500, 'door', { w: 83 }, { x: 800, y: 500 });
  op(700, 710, 'door', { w: 73 }, { x: 760, y: 710 });
  op(915, 620, 'door', { w: 73, hinge: 1 }, { x: 915, y: 700 });
  op(280, 0, 'window', { type: 'baie', w: 240, h: 215, sill: 0, leaves: 2 });
  op(0, 625, 'window', { w: 100, h: 115, sill: 105, leaves: 2 });
  op(165, 800, 'window', { w: 80, h: 115, sill: 105, leaves: 1 });
  op(780, 0, 'window', { w: 140, leaves: 2 });
  op(1000, 190, 'window', { w: 80, leaves: 1 });
  op(1000, 500, 'window', { type: 'oscillo', w: 60, h: 75, sill: 145, leaves: 1 });
  const it = (k, x, y, rot, extra) => { const d = FURN_BY.get(k); const o = makeItemFromDef(d, 'L0'); Object.assign(o, { x, y, rot }, extra || {}); P.items.push(o); };
  it('tv', 32.5, 220, 270); it('canape3', 290, 210, 90); it('tbasse', 150, 210, 90); it('tab4', 395, 380, 0); it('plante', 60, 60, 0);
  it('escD', 511.5, 220, 0, { n: 16 });
  it('frigo', 42.5, 483.5, 270); it('col', 40, 543.5, 270); it('ev1', 40, 613.5, 270); it('lv', 40, 683.5, 270);
  it('mb60', 40, 760, 180); it('pl60', 100, 760, 180); it('mb60', 160, 760, 180); it('mb60', 220, 760, 180); it('hotte', 100, 765, 180);
  it('placard', 364.5, 520, 270, { w: 120 });
  it('lit160', 663.5, 190, 270); it('chevet', 583.5, 87.5, 270); it('chevet', 583.5, 292.5, 270); it('armoire', 960, 290, 90);
  it('bain', 905, 579, 180); it('vasque2', 790, 408.5, 0); it('dou90', 945, 428.5, 0); it('sserv', 708.5, 580, 270);
  it('wc', 765, 756, 180); it('lm', 814, 680, 90);
  it('ll', 870, 760, 180); it('sl', 930, 760, 180); it('ce', 962.5, 680, 90);
  const el = (t, x, y, rot, extra) => { const d = ELEC_BY.get(t); const o = makeElecFromDef(d, 'L0'); Object.assign(o, { x, y, rot }, extra || {}); P.elec.push(o); return o; };
  el('pl', 200, 290, 0, { circuit: 'C1 éclairage séjour' }); el('int_vv', 500, 446.5, 180, { circuit: 'C1' }); el('int_vv', 300, 446.5, 180, { circuit: 'C1' });
  el('pc2', 10, 130, 270, { circuit: 'C5 prises séjour' }); el('tv', 10, 262, 270); el('pc2', 10, 320, 270); el('rj45', 10, 378, 270); el('pc', 60, 10, 0, { circuit: 'C5' }); el('pc', 440, 10, 0, { circuit: 'C5' }); el('pc', 150, 446.5, 180, { circuit: 'C5' });
  el('det_ir', 10, 425, 270, { h: 220 });
  el('pl', 170, 620, 0, { circuit: 'C2 éclairage cuisine' }); el('int_s', 300, 453.5, 0, { circuit: 'C2' }); el('vmc', 280, 500, 0);
  el('pc32', 90, 790, 180, { circuit: 'C10 plaque' }); el('pc_pt', 160, 790, 180, { circuit: 'C6 prises cuisine' }); el('pc_pt', 230, 790, 180, { circuit: 'C6' });
  el('pc20', 10, 683.5, 270, { circuit: 'C11 lave-vaisselle' }); el('pc', 10, 483.5, 270, { circuit: 'C6' });
  el('pl', 445, 640, 0, { circuit: 'C3 éclairage entrée' }); el('int_s', 505, 790, 180, { circuit: 'C3' }); el('tableau', 333.5, 700, 270); el('com', 333.5, 640, 270);
  el('clavier', 556.5, 760, 90); el('hublot', 400, 810, 0, { circuit: 'C3' });
  el('pl', 630, 560, 0, { circuit: 'C3' }); el('daaf', 630, 450, 0); el('int_vv', 563.5, 680, 270, { circuit: 'C3' });
  el('pl', 800, 200, 0, { circuit: 'C4 éclairage nuit' }); el('int_s', 690, 376.5, 180, { circuit: 'C4' });
  el('pc', 563.5, 55, 270, { circuit: 'C7 prises chambre' }); el('pc', 563.5, 325, 270, { circuit: 'C7' }); el('pc', 990, 120, 90, { circuit: 'C7' }); el('rad_elec', 780, 10, 0, { circuit: 'C12 chauffage' });
  el('applique', 790, 383.5, 0, { circuit: 'C4' }); el('pc_ip', 745, 383.5, 0, { circuit: 'C8 salle de bain' }); el('pl', 915, 505, 0, { circuit: 'C4' }); el('vmc', 750, 425, 0);
  el('pl', 765, 702, 0, { circuit: 'C4' }); el('vmc', 805, 645, 0);
  el('pc20', 870, 790, 180, { circuit: 'C13 lave-linge' }); el('pc20', 930, 790, 180, { circuit: 'C14 sèche-linge' }); el('sortie', 990, 630, 90, { circuit: 'C9 chauffe-eau' }); el('pl', 935, 735, 0, { circuit: 'C4' });
  el('pc_pt', 40, 790, 180); el('pc_pt', 10, 722, 270); el('pc', 300, 790, 180);
  el('rj45', 990, 160, 90); el('pc', 556.5, 500, 90); el('pc', 696.5, 420, 90); el('centrale', 333.5, 760, 270);
  const S_ = {}; for (const [k, t, x, y, r] of [['sdb', 'int_d', 703.5, 437, 270], ['wc', 'int_s', 696.5, 660, 90], ['bua', 'int_s', 865, 623.5, 0]]) S_[k] = el(t, x, y, r);
  const vmcG = el('vmc_groupe', 635, 650, 0), vmcR = el('sortie_toit', 635, 600, 0);
  el('entree_air', 230, 10, 0); el('entree_air', 330, 10, 0); el('entree_air', 780, 10, 0);
  const el1 = (t, x, y, rot) => { const o = el(t, x, y, rot); o.lv = 'L1'; return o; };
  const plE = el1('pl', 500, 330, 0), plE2 = el1('pl', 780, 560, 0), swE = el1('int_vv', 10, 470, 270);
  el1('pc', 10, 160, 270); el1('pc', 990, 300, 90); el1('pc', 600, 790, 180); el1('daaf', 640, 430, 0);
  for (const e of P.elec) delete e.circuit;
  touch();
  P.links.push({ id: uid('k'), lv: 'L1', a: swE.id, b: plE.id }, { id: uid('k'), lv: 'L1', a: swE.id, b: plE2.id });
  const at = (t, x, y) => P.elec.find((e) => e.type === t && Math.abs(e.x - x) < 0.6 && Math.abs(e.y - y) < 0.6);
  const lk = (a, b) => { if (a && b) P.links.push({ id: uid('k'), lv: 'L0', a: a.id, b: b.id }); };
  lk(at('int_vv', 500, 446.5), at('pl', 200, 290)); lk(at('int_vv', 300, 446.5), at('pl', 200, 290));
  lk(at('int_s', 300, 453.5), at('pl', 170, 620));
  lk(at('int_s', 505, 790), at('pl', 445, 640)); lk(at('int_s', 505, 790), at('hublot', 400, 810));
  lk(at('int_vv', 563.5, 680), at('pl', 630, 560));
  lk(at('int_s', 690, 376.5), at('pl', 800, 200));
  lk(S_.sdb, at('applique', 790, 383.5)); lk(S_.sdb, at('pl', 915, 505));
  lk(S_.wc, at('pl', 765, 702)); lk(S_.bua, at('pl', 935, 735));
  const vk = (a, b2, mid, dia) => { if (a && b2) P.ducts.push({ id: uid('k'), lv: 'L0', sys: 'vmc', mat: 'souple', a: a.id, b: b2.id, dia, pts: [{ x: a.x, y: a.y }, ...mid, { x: b2.x, y: b2.y }] }); };
  vk(vmcG, at('vmc', 280, 500), [{ x: 600, y: 650 }, { x: 600, y: 500 }], 125);
  vk(vmcG, at('vmc', 750, 425), [{ x: 665, y: 650 }, { x: 665, y: 425 }], 80);
  vk(vmcG, at('vmc', 805, 645), [{ x: 635, y: 700 }, { x: 805, y: 700 }], 80);
  vk(vmcG, vmcR, [], 160);
  copyWalls('L0', 'L1');
  syncRooms();
  const name = (x, y, n, lv) => { const g = geo(lv || 'L0'); const r = g.rooms.find((q) => inPoly({ x, y }, q.loop)); if (r && r.label) { r.label.name = n; r.label.x = x; r.label.y = y; } };
  name(150, 395, 'Séjour'); name(175, 560, 'Cuisine'); name(445, 600, 'Entrée'); name(630, 520, 'Dégagement');
  name(860, 150, 'Chambre'); name(790, 505, 'Salle de bain'); name(765, 650, 'WC'); name(880, 690, 'Buanderie');
  name(760, 250, 'Combles aménageables', 'L1');
  const lab = P.rooms.find((r) => r.name === 'Séjour'); if (lab) lab.tint = 1;
  const lab2 = P.rooms.find((r) => r.name === 'Salle de bain'); if (lab2) lab2.tint = 3;
  touch();
  generateFromPlan();
  return JSON.parse(JSON.stringify(P));
}

/* ---------------- clavier ---------------- */
window.addEventListener('keydown', (e) => {
  if (e.key === 'Shift') keys.shift = true;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') { if (e.key === 'Escape') e.target.blur(); return; }
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (ui.view === '3d') {
    if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && k === 'y') { e.preventDefault(); redo(); return; }
    if (!mod) v3Key3(e);
    return;
  }
  if (mod && k === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
  if (mod && k === 'y') { e.preventDefault(); redo(); return; }
  if (mod && k === 'd') { e.preventDefault(); duplicateSel(); return; }
  if (mod) return;
  if (k === ' ') { keys.space = true; e.preventDefault(); return; }
  if (k === 'escape') { closePops(); closeDimEdit(); if (ui.duct) { ui.duct = null; updateHint(); requestRender(); return; } if (ui.chain) finishChain(); else if (ui.tool !== 'select') setTool('select'); else select(null); return; }
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); return; }
  if (k === 'enter' && ui.chain) { finishChain(); return; }
  if (k === 'enter' && ui.duct) { finishDuct(); return; }
  const step = e.shiftKey ? 10 : 1;
  if (k === 'arrowleft') { e.preventDefault(); nudgeSel(-step, 0); return; }
  if (k === 'arrowright') { e.preventDefault(); nudgeSel(step, 0); return; }
  if (k === 'arrowup') { e.preventDefault(); nudgeSel(0, -step); return; }
  if (k === 'arrowdown') { e.preventDefault(); nudgeSel(0, step); return; }
  const map = { v: 'select', m: 'wall', p: 'room', o: 'door', f: 'window', b: 'gap', c: 'dim', t: 'text', l: 'link', g: 'duct' };
  if (map[k]) { setTool(map[k]); return; }
  if (k === 'r') rotateSel(90);
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') keys.space = false; if (e.key === 'Shift') keys.shift = false; if (ui.view === '3d') v3Key3(e); });
window.addEventListener('blur', () => { keys.space = false; keys.shift = false; V3.keys.clear(); });

/* ---------------- démarrage ---------------- */
function bindUI() {
  for (const b of $$('.tool')) b.addEventListener('click', () => setTool(b.dataset.tool));
  $('#btnUndo').addEventListener('click', undo);
  $('#btnRedo').addEventListener('click', redo);
  $('#btnFilter').addEventListener('click', (e) => openFilterPop(e.currentTarget));
  $('#btnView').addEventListener('click', (e) => { const p = $('#viewPop'); if (!p.hidden) { closePops(); return; } renderViewPop(); showPop(p, e.currentTarget); });
  $('#btnMenu').addEventListener('click', (e) => { const p = $('#menuPop'); if (!p.hidden) { closePops(); return; } renderMenuPop(); showPop(p, e.currentTarget); });
  $('#btnProj').addEventListener('click', openProjects);
  $('#btnExport').addEventListener('click', openExport);
  for (const b of $$('.vtab')) b.addEventListener('click', () => setView(b.dataset.view));
  window.addEventListener('resize', () => { if (ui.view === 'elec') renderEvMain(); });
  $('#zIn').addEventListener('click', () => zoomAt(SCR.w / 2, SCR.h / 2, 1.25));
  $('#zOut').addEventListener('click', () => zoomAt(SCR.w / 2, SCR.h / 2, 0.8));
  $('#zFit').addEventListener('click', fitView);
  const info = h('button', { class: 'ib info', type: 'button', 'aria-label': 'Niveau et légende', title: 'Niveau et légende', html: ICON.info, onclick: () => { ui.inspOpen = !ui.inspOpen || !!ui.sel; ui.sel = null; renderInspector(); requestRender(); } });
  $('.zoom').prepend(info);
  const onTheme = () => { readColors(); requestRender(); renderInspector(); if (ui.view === '3d') v3Refresh(); };
  try { window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', onTheme); } catch (e) { }
  new MutationObserver(onTheme).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
  new ResizeObserver(resizeCanvas).observe($('#stage'));
  window.addEventListener('resize', () => { closePops(); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => requestRender());
  window.addEventListener('beforeunload', () => { if (Store.timer) saveNow(); });
  window.addEventListener('pagehide', () => { if (Store.timer) saveNow(); }); // iPad : plus fiable que beforeunload
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && Store.timer) saveNow(); });
}
async function boot() {
  loadSettings();
  readColors();
  bindUI();
  /* stockage principal IndexedDB ; reprise des plans de l'ancien stockage (localStorage, laissé intact) */
  if (typeof indexedDB !== 'undefined' && await DB.open()) { await syncFromLocal(); askPersist(); }
  let curId = lsGet('calque.cur');
  if (!curId) { const list = await listProjects(); if (list.length) curId = list[0].id; }
  let ok = false;
  if (curId) {
    const r = await loadProject(curId);
    if (r) { try { openPlan(r.plan, curId, { savedAt: r.savedAt }); ok = true; if (r.damaged) toast('La dernière copie du plan était abîmée : la copie valide la plus récente a été ouverte.'); } catch (e) { } }
  }
  if (!ok) openPlan(samplePlan(), uid('p'), { example: true });
  resizeCanvas();
  { const vw = lsGet('calque.view'); if (vw === 'elec' || vw === '3d') setView(vw); }
  getDownloads();
  const cloud = await Store.init();
  if (!cloud) { if (!ui.isExample) setSave('local'); return; }
  try {
    await Store.refresh();
    const list = [...Store.cache.values()].sort((a, b) => b.savedAt - a.savedAt);
    const mine = Store.cache.get(P.id);
    const untouched = H.u.length === 0;
    if (mine && untouched && mine.savedAt > (ui.savedAt || 0) && mine.json) openPlan(JSON.parse(mine.json), mine.id, { savedAt: mine.savedAt });
    else if (!mine && ui.isExample && untouched && list.length && list[0].json) openPlan(JSON.parse(list[0].json), list[0].id, { savedAt: list[0].savedAt });
    else if (!mine && !ui.isExample) saveNow();
    else if (!ui.isExample) setSave('ok');
  } catch (e) { if (!ui.isExample) setSave('local'); }
}

export { bindUI, boot, samplePlan };

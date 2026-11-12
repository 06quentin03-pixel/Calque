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
import { lireEtat, verifierSauvegarde } from './rappelui.js';
import { toucheGroupe } from './multi.js';
import { renderEvMain, setView } from './tableau.js';
import { loadUserLib } from './mabiblio.js';
import { ICON, closeModal, closePops, copyWalls, deleteSel, duplicateSel, h, nudgeSel, renderInspector, renderMenuPop,
  renderViewPop, rotateSel, setTool, showPop, toast, updateHint } from './interface.js';
import { DB, Store, askPersist, getDownloads, listProjects, loadProject, lsGet, openPlan, openProjects, saveNow,
  setSave, syncFromLocal } from './stockage.js';
import { exportAll, openExport } from './export.js';
import { samplePlan } from './exemple.js';
import { V3, v3Key3, v3Refresh } from './vue3d.js';

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
  if (toucheGroupe(e, k)) return;
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
  const map = { v: 'select', m: 'wall', p: 'room', o: 'door', f: 'window', b: 'gap', c: 'dim', t: 'text', l: 'link', g: 'duct', u: 'mesure' };
  if (map[k]) { setTool(map[k]); return; }
  if (k === 'r') rotateSel(90);
});
window.addEventListener('keyup', (e) => { if (e.key === ' ') keys.space = false; if (e.key === 'Shift') keys.shift = false; if (ui.view === '3d') v3Key3(e); });
window.addEventListener('blur', () => { keys.space = false; keys.shift = false; V3.keys.clear(); });

/* ---------------- démarrage ---------------- */
function bindUI() {
  for (const b of $$('.tool[data-tool]')) b.addEventListener('click', () => setTool(b.dataset.tool));
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
  await loadUserLib(); // références fabricant et composants personnalisés de l'appareil
  await lireEtat().catch(() => { }); // date de la dernière sauvegarde complète (menu)
  let curId = lsGet('calque.cur');
  if (!curId) { const list = await listProjects(); if (list.length) curId = list[0].id; }
  let ok = false;
  if (curId) {
    const r = await loadProject(curId);
    if (r) { try { openPlan(r.plan, curId, { savedAt: r.savedAt }); ok = true; if (r.damaged) toast('La dernière copie du plan était abîmée : la copie valide la plus récente a été ouverte.'); } catch (e) { } }
  }
  if (!ok) openPlan(samplePlan(), uid('p'), { example: true });
  resizeCanvas();
  { const vw = lsGet('calque.view'); if (vw === 'elec' || vw === '3d' || vw === 'chantier') setView(vw); }
  getDownloads();
  /* rappel de la sauvegarde complète, quelques secondes après l'ouverture (jamais pendant le chargement) */
  setTimeout(() => { verifierSauvegarde(exportAll).catch(() => { }); }, 5000);
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

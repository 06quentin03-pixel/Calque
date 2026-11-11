/* Calque — module « interface » : interface : inspecteur, panneaux, niveaux, fenêtres.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { $, $$, C, DEG, EXT, IDX, NF1, P, S, clamp, fmtArea, fmtLen, fmtLenU, inPoly, isNum, labelPoint, levelAbove,
  levelOf, levelsSorted, nodeOf, saveSettings, setGEO, touch, ui, uid, vadd, vdir, vdist, vdot, vlen, vmid, vmul,
  vnorm, vsub } from './noyau.js';
import { geo, roomOfLabel } from './geometrie.js';
import { clampOpening, deleteNode, deleteWall, itemToWorld, mergeAtNode, normDeg, splitWall, wallsAt } from './mutations.js';
import { ELEC, ELEC_BY, ELEC_CATS, drawItem, furnDef, isStair, stairInfo } from './symboles.js';
import { FONT_LABEL, TINTS, TINT_NAMES } from './rendu2d.js';
import { DOMAINES, LIB_EXTRA, allEntries, entriesOf, pathOf, searchEntries } from './bibliotheque.js';
import { AUTONOMOUS, CK, CMDS, SOCKETS, SPOTLIKE, accepts, circById, circNumbers, circStats, circuitColor, cleanLinks,
  defaultKindFor, elecPower, fmtCount, orderCircuits, rcdCircuits, roomAt } from './electricite.js';
import { DUCT_DIAS, afterFilter, closeDimEdit, ductHintMsg, ductPts, ductVisible, finishDuct, fold, inspDuct,
  networkSummary, startDuctFrom, traverseeSection, ventSection } from './reseaux.js';
import { CLOSET_MODELS, DOOR_MODELS, GAP_MODELS, WIN_MODELS, commit, cv, lockedWallPoint, makeItemFromDef, newOpening,
  openingHeight, openingModels, refreshUI, refreshWallMsg, requestRender, selObj, select, undo, wallByLength,
  wallHeightSetting, wallHintMsg, wallLenLock, wallProps } from './interaction.js';
import { setView } from './tableau.js';
import { newPlan, openProjects, openSample, openVersions } from './stockage.js';
import { exportAll, exportJSON, openExport } from './export.js';
import { openDossier } from './dossierui.js';
import { openVariantes } from './variantesui.js';
import { f3Def, itemHeight3 } from './vue3d.js';
import { compSection, materielSection, openTechLib } from './biblioui.js';
import { ficheButton } from './fiche.js';
import { fondSection, pickFond } from './fond.js';
import { TYPES_CHEMIN } from './cheminement.js';
import { itineraireSection, startZone } from './routeui.js';
import { eclairageSection, lumSection } from './eclairageui.js';

/* ============================================================
   CALQUE — interface : inspecteur, catalogues, niveaux,
   sauvegarde, export, exemple, démarrage
   ============================================================ */
function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat(3)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
function parseNum(v) { if (v == null) return NaN; const s = String(v).replace(/\s/g, '').replace(',', '.'); return s === '' ? NaN : parseFloat(s); }
function fmtIn(v) { return isNum(v) ? String(Math.round(v * 10) / 10).replace('.', ',') : ''; }
let toastT = 0;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 2600); }
const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>',
  x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  rotL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v5h5"/><path d="M4.5 9A8 8 0 1 1 6 17"/></svg>',
  rotR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4v5h-5"/><path d="M19.5 9A8 8 0 1 0 18 17"/></svg>',
  flip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7L3 17h6zM15 7l6 10h-6z"/></svg>',
  dup: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5z"/><path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6M9 10.5h6"/></svg>',
  folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 6.5A1.5 1.5 0 0 1 4.5 5H9l2 2.5h8.5A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M4 20l1-5L16 4l4 4L9 19z"/><path d="M13.5 6.5l4 4"/></svg>',
  img: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 16l5-5 4 4 3-3 6 6"/><circle cx="15.5" cy="8.5" r="1.5"/></svg>',
  down: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M4 20h16"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V4M7 9l5-5 5 5M4 20h16"/></svg>',
  house: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9H3z"/><path d="M10 20v-6h4v6"/></svg>',
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.5v.01"/></svg>',
  split: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h7M14 12h7M12 6v12"/></svg>',
  center: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 12h4M17 12h4M7 8v8h10V8z"/></svg>',
  swap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/></svg>',
  door: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 20V5M5 5a15 15 0 0 1 14 15M2 20h20"/></svg>',
  win: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="9" width="18" height="6"/><path d="M12 9v6"/></svg>',
  gap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M1 12h6M17 12h6" stroke-width="4"/><path d="M7 8.5v7M17 8.5v7"/><path d="M7 10h10M7 14h10" stroke-width="1.3" stroke-dasharray="1.8 1.6"/></svg>',
  closet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M1 12h3M20 12h3" stroke-width="4"/><path d="M4 10.5h9M11 13.5h9"/><path d="M6 17.5h4M14 17.5h4M8.5 16l-2.5 1.5 2.5 1.5M15.5 16l2.5 1.5-2.5 1.5" stroke-width="1.3"/></svg>',
  info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.01"/></svg>',
  filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M3.5 5h17l-6.5 7.5V19l-4 1.5v-8z"/></svg>',
  duct: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18h6V8h10"/><path d="M4 15h3V5h13" opacity=".55"/></svg>',
};
const ico = (k) => { const s = document.createElement('span'); s.innerHTML = ICON[k]; s.style.display = 'contents'; return s; };

/* ---------------- champs ---------------- */
function numField(label, value, unit, onSet, o = {}) {
  const id = o.id || 'f-' + label.normalize('NFD').replace(/[^\w]+/g, '').toLowerCase();
  const input = h('input', { class: 'num', id, type: 'text', inputmode: 'decimal', value: fmtIn(value), 'aria-label': label, autocomplete: 'off', enterkeyhint: 'done' });
  input.addEventListener('change', () => {
    const v = parseNum(input.value);
    if (!isNum(v) || (o.min != null && v < o.min) || (o.max != null && v > o.max)) {
      toast(o.err || (o.min != null ? `Saisissez une valeur entre ${o.min} et ${o.max}.` : 'Saisissez un nombre.'));
      input.value = fmtIn(value); return;
    }
    onSet(v);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  input.addEventListener('focus', () => setTimeout(() => { try { input.select(); } catch (e) { } }, 0));
  return h('label', { class: 'fld' }, label ? h('span', null, label) : null, h('div', { class: 'inp' }, input, unit ? h('em', null, unit) : null));
}
function textField(label, value, onSet, o = {}) {
  const input = h('input', { class: 'txt', id: o.id, type: 'text', value: value || '', placeholder: o.ph || '', 'aria-label': label || o.ph || '', autocomplete: 'off', enterkeyhint: 'done' });
  if (o.live) input.addEventListener('input', () => o.live(input.value));
  input.addEventListener('change', () => onSet(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); input.blur(); } });
  return h('label', { class: 'fld' }, label ? h('span', null, label) : null, input);
}
function segCtl(opts, cur, onPick) {
  return h('div', { class: 'seg', role: 'group' }, opts.map((o) => h('button', { type: 'button', 'aria-pressed': String(o.v === cur), onclick: () => onPick(o.v) }, o.n)));
}
function chipRow(vals, cur, onPick, fmt) {
  return h('div', { class: 'chips' }, vals.map((v) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(Math.abs(v - cur) < 0.01), onclick: () => onPick(v) }, fmt ? fmt(v) : String(v))));
}
function sec(title, ...kids) { return h('div', { class: 'sec' }, title ? h('h3', null, title) : null, ...kids); }
function kv(pairs) { return h('dl', { class: 'kv' }, pairs.filter(Boolean).map(([k, v]) => [h('dt', null, k), h('dd', null, v)])); }
function btn(label, onclick, cls, icon) { return h('button', { type: 'button', class: 'btn ' + (cls || ''), onclick }, icon ? ico(icon) : null, label); }
function btns(...b) { return h('div', { class: 'btns' }, ...b); }
function row(...k) { return h('div', { class: 'row' }, ...k); }
function inspHead(title, sub) {
  return h('div', { class: 'insp-head' }, h('div', { style: 'min-width:0' }, h('h2', null, title), sub ? h('p', null, sub) : null),
    h('button', { class: 'x', type: 'button', 'aria-label': 'Fermer le panneau', html: ICON.x, onclick: () => { ui.inspOpen = false; select(null); renderInspector(); } }));
}
function body(...k) { return h('div', { class: 'insp-body' }, ...k); }
function confirmBtn(label, confirmLabel, action) {
  const b = btn(label, () => {
    if (b.dataset.armed) { action(); return; }
    b.dataset.armed = '1'; b.lastChild.textContent = confirmLabel; b.classList.add('pri');
    setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.lastChild.textContent = label; b.classList.remove('pri'); } }, 3500);
  }, 'danger', 'del');
  return b;
}

/* ---------------- inspecteur ---------------- */
function renderInspector() {
  const box = $('#insp'); if (!P) return;
  const ae = document.activeElement;
  const focusId = ae && box.contains(ae) ? ae.id : null;
  const o = selObj();
  let parts;
  try {
    if (!ui.sel || !o) parts = (EXT.inspVide && EXT.inspVide()) || inspLevel();
    else parts = { wall: inspWall, node: inspNode, opening: inspOpening, item: inspItem, elec: inspElec, room: inspRoom, dim: inspDim, text: inspText, duct: inspDuct, ...EXT.insp }[ui.sel.t](o);
  } catch (err) { console.error(err); parts = inspLevel(); }
  box.replaceChildren(...parts.filter(Boolean));
  box.classList.toggle('closed', !(ui.inspOpen || ui.sel));
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
}
/* extrémité(s) déplacée(s) quand on change la longueur d'un mur */
function wallMovingEnds(w) {
  const m = S.wallEnd || 'auto';
  if (m === 'mid') return [w.a, w.b];
  if (m === 'a') return [w.a];
  if (m === 'b') return [w.b];
  return [wallsAt(w.a).length < wallsAt(w.b).length ? w.a : w.b];
}
/* allonge le mur de delta à l'extrémité endId ; les murs d'équerre reliés à cette
   extrémité (et ceux alignés avec eux) suivent, pour garder les angles droits */
function stretchEnd(w, endId, delta) {
  if (Math.abs(delta) < 1e-6) return;
  const fixId = endId === w.a ? w.b : w.a;
  const E = nodeOf(endId), F = nodeOf(fixId);
  const d = vnorm(vsub(E, F)), base = vdot(E, d);
  let set = new Set([endId]);
  const queue = [endId];
  while (queue.length) {
    const id = queue.shift(), N = nodeOf(id);
    for (const x of P.walls) {
      if (x.id === w.id || x.lv !== w.lv || (x.a !== id && x.b !== id)) continue;
      const oid = x.a === id ? x.b : x.a;
      if (set.has(oid)) continue;
      const O = nodeOf(oid); if (!O) continue;
      const u = vsub(O, N), L = vlen(u);
      if (L < 0.5 || Math.abs(vdot(u, d)) / L > 0.01 || Math.abs(vdot(O, d) - base) > 0.5) continue;
      set.add(oid); queue.push(oid);
    }
  }
  if (set.has(fixId)) set = new Set([endId]);
  for (const id of set) { const n = nodeOf(id); n.x = Math.round((n.x + d.x * delta) * 10) / 10; n.y = Math.round((n.y + d.y * delta) * 10) / 10; }
  setGEO({});
}
function applyWallLength(w, L) {
  const cur = vdist(nodeOf(w.a), nodeOf(w.b));
  const delta = Math.max(1, L) - cur;
  const ends = wallMovingEnds(w);
  for (const id of ends) stretchEnd(w, id, delta / ends.length);
}
function setWallLength(w, L) {
  applyWallLength(w, L);
  setGEO({}); for (const o of P.openings) clampOpening(o);
  commit();
}
function faceLen(g, sgn) { const f = sgn > 0 ? g.faceP : g.faceN; return vdist(f[0], f[1]); }
/* longueur d'une face (côté 1 = +n, côté 2 = -n) : les jonctions changent avec la
   longueur, d'où quelques itérations */
function setWallFace(w, sgn, target) {
  for (let i = 0; i < 8; i++) {
    const g = geo(w.lv).walls.get(w.id); if (!g) break;
    const diff = target - faceLen(g, sgn);
    if (Math.abs(diff) < 0.05) break;
    applyWallLength(w, g.L + diff);
  }
  setGEO({}); for (const o of P.openings) clampOpening(o);
  commit();
  const g = geo(w.lv).walls.get(w.id);
  if (g && Math.abs(faceLen(g, sgn) - target) > 0.5) toast('Cette face ne peut pas atteindre exactement ' + fmtIn(target) + ' cm avec ces jonctions.');
}
function wallSideName(g, sgn) {
  const p = vadd(vmid(g.A, g.B), vmul(g.n, sgn * (g.th / 2 + 15)));
  const r = geo(g.w.lv).rooms.find((x) => inPoly(p, x.loop) && !x.holes.some((hh) => inPoly(p, hh)));
  return r ? (r.label ? r.label.name : 'pièce') : 'extérieur';
}
function setWallAngle(w, deg) {
  const A = nodeOf(w.a), B = nodeOf(w.b), L = vdist(A, B);
  const moveA = wallsAt(w.a).length < wallsAt(w.b).length;
  const d = vdir(-deg * DEG);
  if (moveA) { A.x = B.x - d.x * L; A.y = B.y - d.y * L; } else { B.x = A.x + d.x * L; B.y = A.y + d.y * L; }
  for (const n of [A, B]) { n.x = Math.round(n.x * 10) / 10; n.y = Math.round(n.y * 10) / 10; }
  setGEO({}); for (const o of P.openings) clampOpening(o);
  commit();
}
function wallAngleDisp(wg) { let a = Math.round(-wg.ang / DEG * 10) / 10; if (a < 0) a += 360; if (a >= 360) a -= 360; return a; }
function addOpeningOnWall(w, kind) {
  const wg = geo(w.lv).walls.get(w.id); if (!wg) return;
  const o = newOpening(kind, wg, wg.L / 2, 1);
  ui.sel = { t: 'opening', id: o.id };
  commit();
}
function inspWall(w) {
  const g = geo(ui.lv).walls.get(w.id); if (!g) return inspLevel();
  const lvl = levelOf(w.lv);
  const nOpen = P.openings.filter((o) => o.wall === w.id).length;
  return [
    inspHead(w.kind === 'cloison' ? 'Cloison' : 'Mur porteur', `${fmtLenU(g.L)} · épaisseur ${fmtIn(w.th)} cm${nOpen ? ' · ' + nOpen + ' ouverture' + (nOpen > 1 ? 's' : '') : ''}`),
    body(
      sec('Type', segCtl([{ v: 'mur', n: 'Mur porteur' }, { v: 'cloison', n: 'Cloison' }], w.kind, (v) => {
        if (v === w.kind) return;
        if (v === 'cloison' && Math.abs(w.th - S.thMur) < 0.01) w.th = S.thCloison;
        else if (v === 'mur' && Math.abs(w.th - S.thCloison) < 0.01) w.th = S.thMur;
        w.kind = v; setGEO({}); for (const o of P.openings) clampOpening(o); commit();
      })),
      sec('Dimensions',
        row(numField('Longueur (axe)', g.L, 'cm', (v) => setWallLength(w, v), { id: 'f-len', min: 1, max: 100000 }),
          numField('Orientation', wallAngleDisp(g), '°', (v) => setWallAngle(w, v), { id: 'f-ang', min: -360, max: 360 })),
        row(numField('Face côté 1', faceLen(g, 1), 'cm', (v) => setWallFace(w, 1, v), { id: 'f-face1', min: 1, max: 100000 }),
          numField('Face côté 2', faceLen(g, -1), 'cm', (v) => setWallFace(w, -1, v), { id: 'f-face2', min: 1, max: 100000 })),
        h('p', { class: 'note' }, `Côté 1 : ${wallSideName(g, 1)} · côté 2 : ${wallSideName(g, -1)}. Les repères 1, 2, A et B sont affichés sur le plan. Touchez une cote sur le plan pour la saisir directement.`),
        h('div', { class: 'fld' }, h('span', null, 'Extrémité déplacée quand une longueur change'),
          segCtl([{ v: 'auto', n: 'Auto' }, { v: 'a', n: 'Bout A' }, { v: 'b', n: 'Bout B' }, { v: 'mid', n: 'Les deux' }], S.wallEnd || 'auto', (v) => { S.wallEnd = v; saveSettings(); renderInspector(); requestRender(); })),
        h('p', { class: 'note' }, 'Les murs d’équerre reliés à l’extrémité suivent, pour garder les angles droits.')),
      sec('Épaisseur',
        numField('Épaisseur', w.th, 'cm', (v) => { w.th = v; setGEO({}); for (const o of P.openings) clampOpening(o); commit(); }, { id: 'f-th', min: 1, max: 200 }),
        chipRow([5, 7, 10, 15, 20, 25, 30, 40], w.th, (v) => { w.th = v; setGEO({}); for (const o of P.openings) clampOpening(o); commit(); }, (v) => v + ' cm')),
      sec('Hauteur', numField('Hauteur du mur', w.h || lvl.h, 'cm', (v) => { w.h = v; commit(); }, { id: 'f-wh', min: 10, max: 3000 })),
      sec('Ouvertures', btns(btn('Porte', () => addOpeningOnWall(w, 'door'), '', 'door'), btn('Fenêtre', () => addOpeningOnWall(w, 'window'), '', 'win'),
        btn('Ouverture libre', () => addOpeningOnWall(w, 'gap'), '', 'gap'), btn('Porte de placard', () => addOpeningOnWall(w, 'closet'), '', 'closet'))),
      sec(null, btns(btn('Couper en deux', () => { const id = splitWall(w, vmid(nodeOf(w.a), nodeOf(w.b))); ui.sel = { t: 'node', id }; commit(); }, '', 'split'), btn('Supprimer', deleteSel, 'danger', 'del'))),
    ),
  ];
}
function inspNode(n) {
  const deg = wallsAt(n.id).length;
  return [
    inspHead('Angle de murs', `${deg} mur${deg > 1 ? 's' : ''} relié${deg > 1 ? 's' : ''}`),
    body(
      sec('Position', row(
        numField('X', n.x, 'cm', (v) => { n.x = v; setGEO({}); for (const o of P.openings) clampOpening(o); commit(); }, { id: 'f-nx' }),
        numField('Y', n.y, 'cm', (v) => { n.y = v; setGEO({}); for (const o of P.openings) clampOpening(o); commit(); }, { id: 'f-ny' }))),
      h('p', { class: 'note' }, 'Faites glisser ce point pour déformer les murs qui y sont reliés. Déposé sur un autre angle, il s’y fusionne.'),
      sec(null, btns(btn(deg === 2 ? 'Supprimer le point (fusionner les murs)' : 'Supprimer le point et ses murs', deleteSel, 'danger', 'del'))),
    ),
  ];
}
function setOpeningModel(o, v) {
  const models = openingModels(o);
  const m = models.find((x) => x.v === v); if (!m) return;
  const prev = o.type; o.type = v;
  if (o.kind === 'gap') {
    if (v === 'toute') { o.full = true; o.sill = 0; }
    else if (v === 'passage') { o.full = false; o.sill = 0; if (prev !== 'passage') o.h = 210; }
    else if (v === 'passeplat') { o.full = false; o.sill = 90; o.h = 60; if (o.w > 200) o.w = 120; }
    clampOpening(o); commit(); return;
  }
  if (o.kind === 'closet') {
    if (m.leaves && !m.leaves.includes(o.leaves)) o.leaves = v === 'pliante' ? (o.w >= 140 ? 4 : 2) : 2;
    clampOpening(o); commit(); return;
  }
  if (m.leaves && !m.leaves.includes(o.leaves)) o.leaves = v === 'pliante' ? 4 : m.leaves[0];
  if (v === 'pfenetre') { o.sill = 0; o.h = 215; if (o.w < 80) o.w = 120; }
  else if (v === 'baie') { o.sill = 0; o.h = 215; o.w = Math.max(o.w, 180); }
  else if (v === 'garage') { o.w = Math.max(o.w, 240); o.h = 200; }
  else if (v === 'entree') { o.w = Math.max(o.w, 90); o.h = 215; }
  else if (o.kind === 'window' && (prev === 'pfenetre' || prev === 'baie')) { o.sill = 95; o.h = 125; }
  clampOpening(o); commit();
}
function openingPositionSec(o, wg) {
  const d0 = o.t - o.w / 2 - wg.clear0, d1 = wg.clear1 - (o.t + o.w / 2);
  return sec('Position sur le mur',
    row(numField('Depuis le début', d0, 'cm', (v) => { o.t = wg.clear0 + v + o.w / 2; clampOpening(o); commit(); }, { id: 'f-d0', min: 0, max: 100000 }),
      numField('Jusqu’à la fin', d1, 'cm', (v) => { o.t = wg.clear1 - v - o.w / 2; clampOpening(o); commit(); }, { id: 'f-d1', min: 0, max: 100000 })),
    btns(btn('Centrer sur le mur', () => { o.t = (wg.clear0 + wg.clear1) / 2; clampOpening(o); commit(); }, 'sm', 'center')));
}
function openingModelSelect(o, models, m) {
  const sel = h('select', { class: 'txt', id: 'f-model', 'aria-label': 'Modèle' }, models.map((x) => h('option', { value: x.v, selected: x.v === m.v }, x.n)));
  sel.addEventListener('change', () => setOpeningModel(o, sel.value));
  return sel;
}
function openingSizeText(o) { return `${fmtIn(o.w)} × ${fmtIn(openingHeight(o))} cm${o.full ? ' (jusqu’au plafond)' : ''}`; }
function inspGap(o, wg) {
  const models = GAP_MODELS, m = models.find((x) => x.v === o.type) || models[0];
  const setH = (v) => { o.full = false; if (o.type === 'toute') o.type = 'passage'; o.h = v; commit(); };
  return [
    inspHead('Ouverture', `${m.n} · ${openingSizeText(o)}`),
    body(
      sec('Modèle', openingModelSelect(o, models, m)),
      sec('Dimensions',
        row(numField('Largeur', o.w, 'cm', (v) => { o.w = v; clampOpening(o); commit(); }, { id: 'f-ow', min: 10, max: 2000 }),
          numField(o.full ? 'Hauteur (jusqu’au plafond)' : 'Hauteur', openingHeight(o), 'cm', setH, { id: 'f-oh', min: 10, max: 600 })),
        chipRow(o.type === 'passeplat' ? [60, 80, 100, 120, 150] : [70, 80, 90, 100, 120, 140, 160, 200, 240], o.w, (v) => { o.w = v; clampOpening(o); commit(); }),
        numField('Hauteur du bas (allège)', o.sill || 0, 'cm', (v) => { o.sill = v; if (o.type === 'passage' && v > 0) o.type = 'passeplat'; else if (o.type === 'passeplat' && v === 0) o.type = 'passage'; commit(); }, { id: 'f-sill', min: 0, max: 400 }),
        h('p', { class: 'note' }, o.full ? 'L’ouverture monte jusqu’au plafond : pas de linteau.' : 'Sur le plan, les traits interrompus montrent le linteau au-dessus de l’ouverture.' + ((o.sill || 0) > 0 ? ' La partie grisée est le muret sous l’ouverture.' : ''))),
      openingPositionSec(o, wg),
      sec(null, btns(btn('Dupliquer', duplicateSel, '', 'dup'), btn('Supprimer', deleteSel, 'danger', 'del'))),
    ),
  ];
}
function inspCloset(o, wg) {
  const models = CLOSET_MODELS, m = models.find((x) => x.v === o.type) || models[0];
  const hasHinge = (o.type === 'battante' && (o.leaves || 1) % 2 === 1) || (o.type === 'pliante' && (o.leaves || 2) < 4);
  return [
    inspHead('Porte de placard', `${m.n} · ${o.leaves || 1} porte${(o.leaves || 1) > 1 ? 's' : ''} · ${openingSizeText(o)}`),
    body(
      sec('Modèle', openingModelSelect(o, models, m)),
      sec('Nombre de portes', segCtl(m.leaves.map((n) => ({ v: n, n: String(n) })), o.leaves || 1, (v) => { o.leaves = v; commit(); })),
      sec('Largeur totale',
        numField('Largeur', o.w, 'cm', (v) => { o.w = v; clampOpening(o); commit(); }, { id: 'f-ow', min: 30, max: 2000 }),
        chipRow([60, 80, 100, 120, 150, 160, 180, 200, 240, 300], o.w, (v) => { o.w = v; clampOpening(o); commit(); })),
      sec('Hauteur',
        segCtl([{ v: true, n: 'Jusqu’au plafond' }, { v: false, n: 'Hauteur fixe' }], !!o.full, (v) => { if (!v && o.full) o.h = Math.round(openingHeight(o)); o.full = v; commit(); }),
        o.full ? kv([['Hauteur des portes', fmtIn(openingHeight(o)) + ' cm']])
          : [numField('Hauteur', o.h, 'cm', (v) => { o.h = v; commit(); }, { id: 'f-oh', min: 30, max: 600 }), chipRow([200, 220, 240, 250], o.h, (v) => { o.h = v; commit(); })]),
      openingPositionSec(o, wg),
      sec('Sens', btns(
        hasHinge ? btn('Inverser les charnières', () => { o.hinge = o.hinge ? 0 : 1; commit(); }, 'sm', 'swap') : null,
        btn('Changer de côté', () => { o.side = -(o.side || 1); commit(); }, 'sm', 'flip')),
        h('p', { class: 'note' }, 'Placez les portes dans la façade du placard (cloison ou mur), du côté de la pièce.')),
      sec(null, btns(btn('Dupliquer', duplicateSel, '', 'dup'), btn('Supprimer', deleteSel, 'danger', 'del'))),
    ),
  ];
}
function inspOpening(o) {
  const wg = geo(ui.lv).walls.get(o.wall); if (!wg) return inspLevel();
  if (o.kind === 'gap') return inspGap(o, wg);
  if (o.kind === 'closet') return inspCloset(o, wg);
  const isDoor = o.kind === 'door';
  const models = isDoor ? DOOR_MODELS : WIN_MODELS;
  const m = models.find((x) => x.v === o.type) || models[0];
  const sel = openingModelSelect(o, models, m);
  const widths = isDoor ? (o.type === 'garage' ? [240, 250, 300, 400] : [63, 73, 83, 93, 140, 160]) : (o.type === 'baie' ? [180, 210, 240, 300] : [45, 60, 80, 100, 120, 140, 180]);
  const hasHinge = (isDoor && o.type !== 'garage' && o.type !== 'pliante' && !((o.leaves || 1) >= 2 && o.type !== 'coulissante')) || (!isDoor && ['battant', 'oscillo', 'pfenetre'].includes(o.type) && (o.leaves || 1) % 2 === 1);
  return [
    inspHead(isDoor ? 'Porte' : 'Fenêtre', `${m.n} · ${fmtIn(o.w)} × ${fmtIn(o.h)} cm`),
    body(
      sec('Modèle', sel),
      m.leaves ? sec(isDoor ? (o.type === 'pliante' ? 'Nombre de panneaux' : 'Nombre de vantaux') : 'Nombre d’ouvrants',
        segCtl(m.leaves.map((n) => ({ v: n, n: String(n) })), o.leaves || 1, (v) => { o.leaves = v; commit(); })) : null,
      sec('Dimensions',
        row(numField(isDoor ? 'Largeur' : 'Largeur', o.w, 'cm', (v) => { o.w = v; clampOpening(o); commit(); }, { id: 'f-ow', min: 20, max: 2000 }),
          numField('Hauteur', o.h, 'cm', (v) => { o.h = v; commit(); }, { id: 'f-oh', min: 20, max: 600 })),
        chipRow(widths, o.w, (v) => { o.w = v; clampOpening(o); commit(); }),
        !isDoor ? numField('Allège (hauteur d’appui)', o.sill || 0, 'cm', (v) => { o.sill = v; commit(); }, { id: 'f-sill', min: 0, max: 400 }) : null),
      openingPositionSec(o, wg),
      sec('Sens d’ouverture', btns(
        hasHinge ? btn(isDoor ? 'Inverser la charnière' : 'Inverser le côté des paumelles', () => { o.hinge = o.hinge ? 0 : 1; commit(); }, 'sm', 'swap') : null,
        btn(isDoor ? 'Ouvrir de l’autre côté' : 'Changer de côté', () => { o.side = -(o.side || 1); commit(); }, 'sm', 'flip'))),
      sec(null, btns(btn('Dupliquer', duplicateSel, '', 'dup'), btn('Supprimer', deleteSel, 'danger', 'del'))),
    ),
  ];
}
function inspItem(it) {
  const def = furnDef(it);
  const stair = isStair(it.type);
  const round = it.type === 'table_ronde' || it.type === 'esc_helice';
  const setDim = (k) => (v) => { if (round) { it.w = v; it.d = v; } else it[k] = v; commit(); };
  const parts = [];
  if (stair) {
    const info = stairInfo(it);
    const pill = h('span', { class: 'pill ' + info.verdict }, info.label);
    parts.push(sec('Escalier',
      row(numField('Nombre de marches', it.n || 15, '', (v) => { it.n = Math.round(v); commit(); }, { id: 'f-sn', min: 3, max: 40 }),
        it.type === 'esc_helice' ? numField('Rotation totale', it.turn || 300, '°', (v) => { it.turn = v; commit(); }, { id: 'f-st', min: 90, max: 360 })
          : (it.type === 'esc_quart' || it.type === 'esc_demi') ? numField('Emmarchement', it.e || 90, 'cm', (v) => { it.e = v; commit(); }, { id: 'f-se', min: 50, max: 200 }) : null),
      kv([['Hauteur à monter', fmtIn(info.H) + ' cm'], ['Hauteur de marche', NF1.format(info.h) + ' cm'], ['Giron moyen', NF1.format(info.g) + ' cm'], ['Blondel 2h + g', NF1.format(info.b) + ' cm']]),
      h('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, pill, h('span', { class: 'note' }, 'Confort idéal entre 60 et 64 cm.')),
      levelAbove(it.lv) ? h('p', { class: 'note' }, `Arrive au niveau « ${levelAbove(it.lv).name} », où la trémie s’affiche automatiquement.`) : h('p', { class: 'note' }, 'Ajoutez un étage au-dessus pour voir la trémie et calculer la hauteur exacte.')));
  }
  parts.push(sec('Dimensions', round
    ? numField('Diamètre', it.w, 'cm', setDim('w'), { id: 'f-iw', min: 10, max: 3000 })
    : row(numField(stair ? 'Largeur' : 'Largeur', it.w, 'cm', setDim('w'), { id: 'f-iw', min: 5, max: 3000 }),
      numField(stair ? 'Longueur' : 'Profondeur', it.d, 'cm', setDim('d'), { id: 'f-id', min: 5, max: 3000 }))));
  parts.push(sec('Orientation',
    numField('Rotation', it.rot || 0, '°', (v) => { it.rot = normDeg(v); commit(); }, { id: 'f-rot' }),
    btns(btn('90°', () => rotateSel(-90), 'sm', 'rotL'), btn('90°', () => rotateSel(90), 'sm', 'rotR'), btn('Miroir', () => { it.flip = !it.flip; commit(); }, 'sm', 'flip'))));
  if (!stair) {
    const f3 = f3Def(it), hz = itemHeight3(it);
    parts.push(sec('Hauteur (vue 3D)',
      row(numField('Hauteur', hz.h, 'cm', (v) => { it.ht = v; commit(); }, { id: 'f-iht', min: 1, max: 600 }),
        numField('Posé à', hz.z, 'cm', (v) => { it.zb = v; commit(); }, { id: 'f-izb', min: 0, max: 500 })),
      it.ht != null || it.zb != null ? btns(btn('Hauteurs par défaut', () => { delete it.ht; delete it.zb; commit(); }, 'sm', 'rotL')) : h('p', { class: 'note' }, `Par défaut : ${fmtIn(f3.h)} cm de haut${f3.z ? `, posé à ${fmtIn(f3.z)} cm du sol` : ''}.`)));
  }
  parts.push(compSection(it, 'item'));
  parts.push(sec('Étiquette', textField(null, it.label, (v) => { it.label = v.trim(); commit(); }, { id: 'f-ilabel', ph: 'Texte affiché sur le plan (facultatif)', live: (v) => { it.label = v; requestRender(); } })));
  parts.push(sec(null, btns(btn('Dupliquer', duplicateSel, '', 'dup'), btn('Supprimer', deleteSel, 'danger', 'del'))));
  return [inspHead(it.name || (def && def.n) || 'Objet', `${fmtIn(it.w)} × ${fmtIn(it.d)} cm`), body(...parts)];
}
function inspElec(e) {
  const def = ELEC_BY.get(e.type); if (!def) return inspLevel();
  const cat = ELEC_CATS.find((c) => c.id === def.cat);
  const sel = h('select', { class: 'txt', id: 'f-etype', 'aria-label': 'Symbole' }, ELEC.filter((x) => x.cat === def.cat).map((x) => h('option', { value: x.t, selected: x.t === e.type }, x.n)));
  sel.addEventListener('change', () => {
    const nd = ELEC_BY.get(sel.value); if (!nd) return;
    if (e.h === def.h) e.h = nd.h;
    e.type = nd.t;
    delete e.comp; // autre symbole : ce n'est plus le composant personnalisé (le marquage reste modifiable)
    commit();
  });
  const fixedPose = e.type === 'traversee' ? 'Traverse le plancher' : def.floor ? 'Au sol' : def.fullH ? 'Du sol au plafond' : !def.wall && e.h == null ? 'Au plafond' : null;
  return [
    inspHead((e.comp && ((P.comps || []).find((c) => c.id === e.comp) || {}).n) || def.n, cat ? cat.name : 'Électricité'),
    body(
      h('p', { class: 'note' }, def.desc),
      sec('Symbole', sel),
      circuitSection(e),
      traverseeSection(e),
      itineraireSection(e),
      materielSection(e),
      sec('Marquage', textField(null, e.mark, (v) => { v = v.trim().slice(0, 8); if (v) e.mark = v; else delete e.mark; commit(); }, { id: 'f-emark', ph: 'Texte court affiché près du symbole (facultatif)' })),
      compSection(e, 'elec'),
      ventSection(e),
      lumSection(e),
      CMDS.has(e.type) ? linksSection(e) : null,
      sec('Pose',
        fixedPose ? kv([['Hauteur de pose', fixedPose]]) : numField('Hauteur de pose (axe)', e.h != null ? e.h : def.h || 0, 'cm', (v) => { e.h = v; commit(); }, { id: 'f-eh', min: 0, max: 600 }),
        ['rad_elec', 'seche_serv_e', 'spot', 'led', 'rail_spot', 'plancher', 'soufflant_sdb'].includes(e.type) ? numField(SPOTLIKE.has(e.type) ? 'Puissance (spots : 1 point par 300 VA)' : 'Puissance', elecPower(e), SPOTLIKE.has(e.type) ? 'VA' : 'W', (v) => { e.p = v; commit(); }, { id: 'f-ep', min: 1, max: 10000 }) : null),
      sec('Orientation', btns(btn('90°', () => rotateSel(-90), 'sm', 'rotL'), btn('90°', () => rotateSel(90), 'sm', 'rotR'))),
      def.cat !== 'ventilation' ? sec('Gaine', btns(btn('Tracer une gaine d’ici', () => startDuctFrom(e, 'elec'), 'sm', 'duct')), ductsOf(e).length ? h('p', { class: 'note' }, `${ductsOf(e).length} conduit${ductsOf(e).length > 1 ? 's' : ''} raccordé${ductsOf(e).length > 1 ? 's' : ''} à ce symbole.`) : null) : null,
      sec(null, btns(btn('Dupliquer', duplicateSel, '', 'dup'), btn('Supprimer', deleteSel, 'danger', 'del'))),
    ),
  ];
}
function ductsOf(e) { return P.ducts.filter((d) => d.a === e.id || d.b === e.id); }
function circuitSection(e) {
  const kind = defaultKindFor(e.type);
  if (!kind) return sec('Circuit', h('p', { class: 'note' }, AUTONOMOUS.has(e.type) ? 'Détecteur autonome à pile : il n\u2019est pas raccordé au tableau.' : 'Ce symbole n\u2019est pas raccordé à un circuit du tableau.'));
  const nums = circNumbers();
  const comp = P.circuits.filter((c) => accepts(c.kind, e.type));
  const other = P.circuits.filter((c) => !accepts(c.kind, e.type));
  const sel = h('select', { class: 'txt', id: 'f-circuit', 'aria-label': 'Circuit' },
    h('option', { value: '' }, 'Aucun circuit'),
    comp.map((c) => h('option', { value: c.id, selected: c.id === e.cid }, `${nums.get(c.id)} · ${c.name} (${fmtCount(circStats(c))})`)),
    other.length ? h('optgroup', { label: 'Autres circuits' }, other.map((c) => h('option', { value: c.id, selected: c.id === e.cid }, `${nums.get(c.id)} · ${c.name}`))) : null,
    h('option', { value: '__new' }, '+ Nouveau circuit'));
  sel.addEventListener('change', () => {
    if (sel.value === '__new') { const c = newCircuitFor(e); e.cid = c.id; toast(`Circuit « ${c.name} » créé.`); }
    else if (sel.value) e.cid = sel.value; else delete e.cid;
    commit();
  });
  const c = e.cid && circById(e.cid);
  const st = c && circStats(c);
  if (c) return sec('Circuit', sel,
    h('div', { style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, h('span', { class: 'ev-num', style: `--cc:${circuitColor(c.id)}` }, nums.get(c.id)), h('span', { class: 'pill ' + (st.over ? 'bad' : 'ok') }, fmtCount(st)),
      btn('Voir dans le tableau', () => { ui.evSel = { t: 'circuit', id: c.id }; setView('elec'); }, 'sm')),
    ficheButton(c));
  return sec('Circuit', sel,
    h('p', { class: 'note' }, P.circuits.length ? 'Choisissez le circuit qui alimente ce symbole.' : 'Générez le tableau dans l\u2019onglet Tableau électrique, ou créez un circuit ici.'));
}
function linksSection(e) {
  const n = P.links.filter((l) => l.a === e.id || l.b === e.id).length;
  return sec('Liaisons', h('p', { class: 'note' }, n ? `Commande ${n} point${n > 1 ? 's' : ''} d\u2019éclairage.` : 'Ne commande encore aucun éclairage.'),
    btns(btn(n ? 'Modifier les liaisons' : 'Relier à des éclairages', () => { setTool('link'); ui.linkSrc = e.id; ui.sel = { t: 'elec', id: e.id }; updateHint(); requestRender(); }, 'sm', 'swap')));
}
function newCircuitFor(e) {
  const kind = defaultKindFor(e.type) || 'autre', k = CK[kind];
  const r = roomAt(e);
  const name = k.n + (r && r.label && (kind === 'eclairage' || kind === 'prises') ? ' ' + r.label.name.toLowerCase() : '');
  const rc = P.rcds.find((x) => !x.own && (!k.typeA || x.type !== 'AC') && rcdCircuits(x.id).length < 8) || null;
  const c = { id: uid('c'), kind, name, cal: k.cal, sec: k.sec, rcd: rc ? rc.id : null, dda: false, ctrl: k.ctrl || null };
  P.circuits.push(c); orderCircuits();
  return c;
}
const ROOM_NAMES = ['Séjour', 'Cuisine', 'Chambre', 'Salle de bain', 'Salle d’eau', 'WC', 'Entrée', 'Dégagement', 'Bureau', 'Salle à manger', 'Cellier', 'Buanderie', 'Dressing', 'Garage', 'Cave', 'Véranda'];
function inspRoom(lbl) {
  const r = roomOfLabel(lbl); if (!r) return inspLevel();
  const lvl = levelOf(lbl.lv);
  return [
    inspHead(lbl.name, 'Pièce · ' + fmtArea(r.area)),
    body(
      sec('Nom', textField(null, lbl.name, (v) => { lbl.name = v.trim() || 'Pièce'; commit(); }, { id: 'f-name', ph: 'Nom de la pièce', live: (v) => { lbl.name = v; requestRender(); } }),
        h('div', { class: 'chips' }, ROOM_NAMES.map((n) => h('button', { type: 'button', class: 'chip', style: 'font-family:var(--f-ui)', onclick: () => { lbl.name = uniqueRoomName(n, lbl); commit(); } }, n)))),
      sec('Mesures',
        h('div', { class: 'ro', style: 'font-size:28px;font-weight:700;letter-spacing:-.01em' }, fmtArea(r.area)),
        kv([['Périmètre intérieur', fmtLenU(r.perim)], ['Hauteur sous plafond', fmtIn(lvl.h) + ' cm'], ['Volume', NF1.format((r.area / 10000) * (lvl.h / 100)) + ' m³']])),
      sec('Couleur de fond', h('div', { class: 'tints' }, TINTS.map((k, i) => h('button', {
        type: 'button', class: i ? '' : 'none', 'aria-label': TINT_NAMES[i], title: TINT_NAMES[i], 'aria-pressed': String((lbl.tint || 0) === i),
        style: `background:${i ? 'linear-gradient(' + C[k] + ',' + C[k] + '),var(--c-room)' : 'var(--c-room)'}`,
        onclick: () => { lbl.tint = i; commit(); },
      })))),
      eclairageSection(lbl),
      sec(null, btns(btn('Recentrer l’étiquette', () => { const p = labelPoint(r.poly); lbl.x = Math.round(p.x); lbl.y = Math.round(p.y); commit(); }, 'sm', 'center'))),
      h('p', { class: 'note' }, 'La pièce est détectée à partir des murs qui la ferment. Touchez deux fois son nom sur le plan pour le modifier, ou faites-le glisser.'),
    ),
  ];
}
function uniqueRoomName(n, self) {
  const used = new Set(P.rooms.filter((r) => r !== self).map((r) => r.name));
  if (!used.has(n)) return n;
  if (n === 'Chambre') { let i = 1; while (used.has('Chambre ' + i)) i++; return 'Chambre ' + i; }
  let i = 2; while (used.has(n + ' ' + i)) i++; return n + ' ' + i;
}
function inspDim(d) {
  const L = vdist({ x: d.ax, y: d.ay }, { x: d.bx, y: d.by });
  return [inspHead('Cote', fmtLenU(L)), body(
    sec('Mesure', h('div', { class: 'ro', style: 'font-size:26px;font-weight:700' }, fmtLen(L, 'cm') + ' cm')),
    h('p', { class: 'note' }, 'Faites glisser les extrémités : elles se collent aux angles des murs.'),
    sec(null, btns(btn('Supprimer', deleteSel, 'danger', 'del'))))];
}
function inspText(t) {
  return [inspHead('Texte', t.text), body(
    sec('Contenu', textField(null, t.text, (v) => { t.text = v || 'Texte'; commit(); }, { id: 'f-text', live: (v) => { t.text = v; requestRender(); } })),
    sec('Taille', segCtl([{ v: 's', n: 'Petit' }, { v: 'm', n: 'Moyen' }, { v: 'l', n: 'Grand' }], t.size || 'm', (v) => { t.size = v; commit(); })),
    sec('Orientation', numField('Rotation', t.rot || 0, '°', (v) => { t.rot = normDeg(v); commit(); }, { id: 'f-trot' }), btns(btn('90°', () => rotateSel(-90), 'sm', 'rotL'), btn('90°', () => rotateSel(90), 'sm', 'rotR'))),
    sec(null, btns(btn('Dupliquer', duplicateSel, '', 'dup'), btn('Supprimer', deleteSel, 'danger', 'del'))))];
}
function elecThumb(def, size) {
  const cvs = h('canvas', { width: size * 2, height: size * 2, 'aria-hidden': 'true' });
  const c = cvs.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0);
  const wide = def.bw ? def.bw > 0.6 : ['tableau', 'reglette', 'led', 'rad_elec', 'com'].includes(def.t);
  const side = !!def.side || ['pc_pt', 'pc20', 'pc32', 'pc_ip', 'pc_usb'].includes(def.t);
  const u = size * (wide ? 0.62 : side ? 0.6 : 0.74);
  c.translate(size / 2 - (side ? u * 0.3 : 0), def.wall ? size / 2 - u * 0.4 : size / 2);
  c.scale(u, u);
  const K = { px: 1 / u, unit: u, ink: C.ink, ink2: C.ink2, bg: C.room, elec: C.elec, font: FONT_LABEL };
  c.lineWidth = 1.5 / u; c.strokeStyle = C.elec; c.lineJoin = 'round'; c.lineCap = 'round';
  if (def.wall) { c.save(); c.strokeStyle = C.ink2; c.lineWidth = 2.4 / u; c.beginPath(); c.moveTo(-0.62, -0.04); c.lineTo(0.62, -0.04); c.stroke(); c.restore(); }
  def.draw(c, K);
  return cvs;
}
function inspLevel() {
  const lvl = levelOf(ui.lv), g = geo(ui.lv);
  const tot = g.rooms.reduce((s, r) => s + r.area, 0);
  const elecs = P.elec.filter((e) => e.lv === ui.lv);
  const counts = new Map();
  for (const e of elecs) counts.set(e.type, (counts.get(e.type) || 0) + 1);
  const socles = elecs.reduce((s, e) => s + (SOCKETS[e.type] || 0), 0);
  const lights = elecs.filter((e) => ELEC_BY.get(e.type) && ELEC_BY.get(e.type).cat === 'eclairage').length;
  const empty = !P.walls.some((w) => w.lv === ui.lv);
  const parts = [
    sec('Niveau',
      textField('Nom', lvl.name, (v) => { lvl.name = v.trim() || lvl.name; commit(); }, { id: 'f-lvname' }),
      row(numField('Hauteur sous plafond', lvl.h, 'cm', (v) => { lvl.h = v; commit(); }, { id: 'f-lvh', min: 100, max: 1000 }),
        numField('Épaisseur plancher', lvl.slab, 'cm', (v) => { lvl.slab = v; commit(); }, { id: 'f-lvs', min: 0, max: 100 })),
      numField('Altitude du sol fini', lvl.elev, 'cm', (v) => { lvl.elev = v; commit(); }, { id: 'f-lve', min: -5000, max: 10000 })),
    fondSection(),
  ];
  if (empty) parts.push(sec('Pour commencer', h('div', { class: 'empty-help' },
    h('span', null, 'Avec l’outil ', h('b', null, 'Pièce'), ', faites glisser un rectangle : quatre murs sont créés d’un coup.'),
    h('span', null, 'Avec l’outil ', h('b', null, 'Mur'), ', touchez chaque angle, ou tapez une longueur et une direction pour une cote exacte.'),
    h('span', null, 'Pincez pour zoomer, glissez à deux doigts ou sur le vide pour déplacer la vue.'))));
  if (g.rooms.length) parts.push(sec('Pièces', h('div', { class: 'list' },
    g.rooms.slice().sort((a, b) => (a.label ? a.label.name : '').localeCompare(b.label ? b.label.name : '', 'fr', { numeric: true })).map((r) => h('button', { type: 'button', class: 'li', onclick: () => select({ t: 'room', id: r.label.id }) },
      h('span', { class: 'sw', style: `background:${r.label && r.label.tint ? 'linear-gradient(' + C[TINTS[r.label.tint]] + ',' + C[TINTS[r.label.tint]] + '),var(--c-room)' : 'var(--c-room)'}` }),
      h('span', null, r.label ? r.label.name : 'Pièce'), h('span', { class: 'v' }, fmtArea(r.area)))),
    h('div', { class: 'li tot' }, h('span'), h('span', null, 'Surface totale'), h('span', { class: 'v' }, fmtArea(tot))))));
  if (counts.size) parts.push(sec('Légende électrique', h('div', { class: 'list' },
    ELEC.filter((d) => counts.has(d.t)).map((d) => h('div', { class: 'li', title: d.desc }, elecThumb(d, 28), h('span', null, d.n), h('span', { class: 'v' }, '× ' + counts.get(d.t))))),
  kv([socles ? ['Socles de prise 16 A', String(socles)] : null, lights ? ['Points d’éclairage', String(lights)] : null, ['Symboles au total', String(elecs.length)]])));
  parts.push(networkSummary());
  parts.push(sec('Niveau', btns(P.levels.length > 1 ? confirmBtn('Supprimer ce niveau', 'Confirmer la suppression', () => deleteLevel(ui.lv)) : null,
    btn('Ajouter un niveau', (e) => openLevelPop(e.currentTarget), '', 'plus'))));
  return [inspHead(lvl.name, `Niveau · sol à ${lvl.elev >= 0 ? '+' : ''}${fmtLenU(lvl.elev)}`), body(...parts)];
}

/* ---------------- actions sur la sélection ---------------- */
function deleteSel() {
  const s = ui.sel; if (!s) return;
  if (s.t === 'wall') deleteWall(s.id);
  else if (s.t === 'node') deleteNode(s.id);
  else if (s.t === 'room') { toast('Une pièce est définie par ses murs : supprimez un mur pour la retirer.'); return; }
  else if (EXT.del[s.t]) { if (EXT.del[s.t](s.id) === false) return; }
  else {
    const key = { opening: 'openings', item: 'items', elec: 'elec', dim: 'dims', text: 'texts', duct: 'ducts', zone: 'zones' }[s.t];
    P[key] = P[key].filter((o) => o.id !== s.id); touch();
    if (s.t === 'elec') cleanLinks();
  }
  ui.sel = null;
  commit();
}
function duplicateSel() {
  const s = ui.sel, o = selObj(); if (!s || !o) return;
  const c = JSON.parse(JSON.stringify(o)); c.id = uid(s.t[0]);
  if (s.t === 'opening') {
    const wg = geo(ui.lv).walls.get(o.wall);
    c.t = o.t + o.w + 30; if (wg && c.t + c.w / 2 > wg.clear1) c.t = o.t - o.w - 30;
    P.openings.push(c); touch(); clampOpening(c);
  } else if (s.t === 'item' || s.t === 'elec') {
    const it = o;
    const step = s.t === 'item' ? it.w : 40;
    const p = itemToWorld({ x: it.x, y: it.y, rot: it.rot || 0 }, step, 0);
    c.x = p.x; c.y = p.y;
    (s.t === 'item' ? P.items : P.elec).push(c);
  } else if (s.t === 'text') { c.x += 40; c.y += 40; P.texts.push(c); }
  else if (s.t === 'duct') { c.pts = ductPts(o).map((q) => ({ x: q.x + 40, y: q.y + 40 })); c.a = null; c.b = null; P.ducts.push(c); }
  else return;
  touch();
  ui.sel = { t: s.t, id: c.id };
  commit();
}
function rotateSel(d) {
  const s = ui.sel, o = selObj(); if (!s || !o || !['item', 'elec', 'text'].includes(s.t)) return;
  o.rot = normDeg((o.rot || 0) + d);
  commit();
}
function nudgeSel(dx, dy) {
  const s = ui.sel, o = selObj(); if (!s || !o) return;
  if (['item', 'elec', 'text'].includes(s.t)) { o.x += dx; o.y += dy; }
  else if (s.t === 'room') { o.x += dx; o.y += dy; }
  else if (s.t === 'node') { o.x += dx; o.y += dy; setGEO({}); }
  else if (s.t === 'opening') { const wg = geo(ui.lv).walls.get(o.wall); if (wg) { o.t += vdot({ x: dx, y: dy }, wg.d); clampOpening(o); } }
  else if (s.t === 'dim') { o.ax += dx; o.bx += dx; o.ay += dy; o.by += dy; }
  else if (s.t === 'duct') { for (const q of o.pts) { q.x += dx; q.y += dy; } }
  else if (s.t === 'wall') { for (const id of [o.a, o.b]) { const n = nodeOf(id); n.x += dx; n.y += dy; } setGEO({}); }
  commit();
}

/* ---------------- outils, bandeau d'aide ---------------- */
function setTool(t) {
  if (t === 'furn' || t === 'stairs' || t === 'elec') { openCatalog(t); return; }
  closeDimEdit();
  if (ui.duct) { if (ui.duct.pts.length >= 2) finishDuct(); ui.duct = null; }
  if (t === 'duct' && !S.layers.elec) { S.layers.elec = true; saveSettings(); }
  if (t === 'duct' && !ductVisible({ sys: S.ductSys })) { const fam = S.ductSys === 'vmc' ? 'ventilation' : 'gaines'; S.filt.off = S.filt.off.filter((x) => x !== fam); if (S.ductSys === 'elec') S.filt.circ = null; afterFilter(); }
  ui.tool = t;
  if (t !== 'place') ui.place = null;
  ui.linkSrc = null;
  if (t === 'link' && !S.layers.elec) { S.layers.elec = true; saveSettings(); }
  if (t !== 'select' && t !== 'place' && (ui.sel || ui.inspOpen)) { ui.sel = null; if (window.matchMedia('(max-width: 1099px)').matches) ui.inspOpen = false; renderInspector(); }
  ui.chain = null; ui.cursor = null; ui.roomDraft = null; ui.dimDraft = null; ui.ghost = null;
  if (t !== 'wall') ui.wallLenTxt = '';
  for (const b of $$('.tool')) b.setAttribute('aria-pressed', String(b.dataset.tool === t || (t === 'place' && ui.place && b.dataset.tool === ui.place.from)));
  cv.style.cursor = '';
  updateHint(); requestRender();
}
let hintKey = '';
function updateHint() {
  const el = $('#hint');
  const t = ui.tool;
  const key = [t, ui.wallKind, ui.doorKind, !!ui.chain, ui.chain && ui.chain.stack.length > 0, ui.place && ui.place.def.t, S.thMur, S.thCloison, ui.hl, ui.linkSrc, ui.hl && circById(ui.hl) && circById(ui.hl).name, ui.duct ? ui.duct.pts.length + ui.duct.sys : '', S.ductSys, S.ductKind, ui.ductDia, ...EXT.hintKey.map((f) => f())].join('|');
  if (key === hintKey && !el.hidden === (t !== 'select')) return;
  hintKey = key;
  if (t === 'select') {
    const hc = ui.hl && circById(ui.hl);
    if (!hc) { el.hidden = true; return; }
    el.hidden = false;
    const st = circStats(hc);
    el.replaceChildren(h('span', { class: 'ev-num', style: `--cc:${circuitColor(hc.id)}` }, circNumbers().get(hc.id)), h('b', null, hc.name), h('span', { class: 'msg' }, `${hc.cal} A · ${String(hc.sec).replace('.', ',')} mm² · ${fmtCount(st)}`),
      btn('Retour au tableau', () => { ui.hl = null; ui.evSel = { t: 'circuit', id: hc.id }; setView('elec'); }, 'sm'), btn('Fermer', () => { ui.hl = null; updateHint(); requestRender(); }, 'pri sm'));
    return;
  }
  el.hidden = false;
  const done = btn('Terminer', () => setTool('select'), 'pri sm');
  const kindSeg = segCtl([{ v: 'mur', n: 'Mur' }, { v: 'cloison', n: 'Cloison' }], ui.wallKind, (v) => { ui.wallKind = v; updateHint(); requestRender(); });
  // épaisseur du mur ou de la cloison en cours, modifiable avant de tracer
  const thIn = h('input', { class: 'txt', id: 'hTh', type: 'text', inputmode: 'decimal', value: fmtIn(wallProps().th), 'aria-label': 'Épaisseur en cm', autocomplete: 'off', enterkeyhint: 'done', style: 'width:52px' });
  thIn.addEventListener('change', () => {
    const v = parseNum(thIn.value);
    if (!(v >= 1 && v <= 200)) { toast('Saisissez une épaisseur entre 1 et 200 cm.'); thIn.value = fmtIn(wallProps().th); return; }
    if (ui.wallKind === 'cloison') S.thCloison = v; else S.thMur = v;
    saveSettings(); updateHint(); requestRender();
  });
  thIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); thIn.blur(); } });
  const thGrp = h('span', { class: 'grp' }, h('span', { class: 'msg' }, 'Épaisseur'), thIn, h('span', { class: 'msg' }, 'cm'));
  let kids = [];
  if (t === 'wall') {
    const len = h('input', { class: 'txt', id: 'hLen', type: 'text', inputmode: 'decimal', placeholder: 'Longueur', value: ui.wallLenTxt || '', 'aria-label': 'Longueur du mur en cm, dans l’axe', autocomplete: 'off', enterkeyhint: 'go', style: 'width:84px' });
    len.addEventListener('input', () => {
      ui.wallLenTxt = len.value; refreshWallMsg();
      if (ui.chain && ui.cursor) { const q = wallLenLock() ? lockedWallPoint(ui.cursor) : null; if (q) ui.cursor = q; }
      requestRender();
    });
    len.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); wallByLength(null); } });
    const hIn = h('input', { class: 'txt', id: 'hWh', type: 'text', inputmode: 'decimal', placeholder: fmtIn((levelOf(ui.lv) || {}).h || 250), value: ui.wallHTxt || '', 'aria-label': 'Hauteur des murs en cm (vide : hauteur sous plafond du niveau)', autocomplete: 'off', enterkeyhint: 'done', style: 'width:60px' });
    hIn.addEventListener('input', () => { ui.wallHTxt = hIn.value; });
    hIn.addEventListener('change', () => { if (hIn.value.trim() && !wallHeightSetting()) { toast('Hauteur entre 10 et 3000 cm, ou laissez vide pour la hauteur du niveau.'); hIn.value = ui.wallHTxt = ''; } });
    hIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); hIn.blur(); } });
    const dirBtn = (lbl, d, title) => h('button', { type: 'button', title, 'aria-label': title, onclick: () => wallByLength(d) }, lbl);
    kids = [
      h('b', null, 'Mur'),
      h('span', { class: 'msg', id: 'hMsg' }, wallHintMsg()),
      kindSeg, thGrp,
      h('span', { class: 'grp' }, h('span', { class: 'msg' }, 'Longueur'), len, h('span', { class: 'msg' }, 'cm'),
        h('span', { class: 'dirs' }, dirBtn('←', { x: -1, y: 0 }, 'Vers la gauche'), dirBtn('↑', { x: 0, y: -1 }, 'Vers le haut'), dirBtn('↓', { x: 0, y: 1 }, 'Vers le bas'), dirBtn('→', { x: 1, y: 0 }, 'Vers la droite'))),
      h('span', { class: 'grp' }, h('span', { class: 'msg' }, 'Hauteur'), hIn, h('span', { class: 'msg' }, 'cm')),
      ui.chain && ui.chain.stack.length ? btn('Retirer le dernier', () => undo(), 'sm') : null,
      done,
    ];
  } else if (t === 'room') {
    const a = h('input', { class: 'txt', id: 'hRw', type: 'text', inputmode: 'decimal', placeholder: 'Long.', 'aria-label': 'Longueur intérieure en cm', autocomplete: 'off', style: 'width:64px' });
    const b = h('input', { class: 'txt', id: 'hRh', type: 'text', inputmode: 'decimal', placeholder: 'Larg.', 'aria-label': 'Largeur intérieure en cm', autocomplete: 'off', style: 'width:64px' });
    kids = [h('b', null, 'Pièce'), h('span', { class: 'msg' }, 'Faites glisser d’un angle à l’autre.'), kindSeg, thGrp,
      h('span', { class: 'grp' }, h('span', { class: 'msg' }, 'ou'), a, h('span', { class: 'msg' }, '×'), b, h('span', { class: 'msg' }, 'cm, puis touchez le coin haut gauche')), done];
  } else if (t === 'door') {
    const cl = ui.doorKind === 'closet';
    kids = [h('b', null, cl ? 'Porte de placard' : 'Porte'),
      segCtl([{ v: 'door', n: 'Porte' }, { v: 'closet', n: 'Placard' }], cl ? 'closet' : 'door', (v) => { ui.doorKind = v; updateHint(); }),
      h('span', { class: 'msg' }, cl ? 'Touchez la façade du placard, du côté de la pièce.' : 'Touchez un mur, du côté où la porte doit s’ouvrir.'), btn('Annuler', () => setTool('select'), 'sm')];
  } else if (t === 'window') {
    kids = [h('b', null, 'Fenêtre'), h('span', { class: 'msg' }, 'Touchez un mur. L’ouverture se fait vers l’intérieur.'), btn('Annuler', () => setTool('select'), 'sm')];
  } else if (t === 'gap') {
    kids = [h('b', null, 'Ouverture'), h('span', { class: 'msg' }, 'Touchez un mur pour y percer une ouverture, puis réglez sa largeur et sa hauteur.'), btn('Annuler', () => setTool('select'), 'sm')];
  } else if (t === 'place' && ui.place) {
    const elec = ui.place.kind === 'elec';
    kids = [h('b', null, (ui.place.comp && ui.place.comp.n) || ui.place.def.n), h('span', { class: 'msg' }, elec ? (ui.place.def.wall ? 'Touchez près d’un mur pour poser le symbole. Continuez pour en poser d’autres.' : 'Touchez le plan pour poser le symbole. Continuez pour en poser d’autres.') : 'Touchez le plan pour le placer.'),
      btn('Changer', () => openCatalog(ui.place.from), 'sm'), elec ? done : btn('Annuler', () => setTool('select'), 'sm')];
  } else if (t === 'link') {
    const src = ui.linkSrc && IDX.elec.get(ui.linkSrc);
    kids = [h('b', null, 'Liaison'), h('span', { class: 'msg' }, src ? `${(ELEC_BY.get(src.type) || {}).n} : touchez les éclairages qu\u2019il commande (retouchez pour retirer).` : 'Touchez un interrupteur, un bouton-poussoir ou un détecteur.'), done];
  } else if (t === 'duct') {
    const dr = ui.duct, sys = dr ? dr.sys : S.ductSys;
    const dias = DUCT_DIAS[sys];
    kids = [h('b', null, 'Conduit'),
      segCtl([{ v: 'vmc', n: 'VMC' }, { v: 'elec', n: 'Gaine élec' }], sys, (v) => { S.ductSys = v; ui.ductDia = null; if (ui.duct) ui.duct.sys = v; saveSettings(); if (!ductVisible({ sys: v })) { S.filt.off = S.filt.off.filter((x) => x !== (v === 'vmc' ? 'ventilation' : 'gaines')); if (v === 'elec') S.filt.circ = null; afterFilter(); } updateHint(); requestRender(); }),
      sys === 'elec' ? segCtl(Object.keys(TYPES_CHEMIN).map((k) => ({ v: k, n: TYPES_CHEMIN[k].court })), S.ductKind, (v) => { S.ductKind = S.ductKind === v ? null : v; saveSettings(); updateHint(); }) : null,
      sys === 'elec' && S.ductKind && TYPES_CHEMIN[S.ductKind].forme === 'rect' ? null : segCtl([{ v: 0, n: 'Ø auto' }, ...dias.map((v) => ({ v, n: 'Ø' + v }))], ui.ductDia && dias.includes(ui.ductDia) ? ui.ductDia : 0, (v) => { ui.ductDia = v || null; updateHint(); requestRender(); }),
      h('span', { class: 'msg' }, ductHintMsg()),
      dr && dr.pts.length > 1 ? btn('Retirer le dernier point', () => { dr.pts.pop(); updateHint(); requestRender(); }, 'sm') : null,
      dr ? btn('Annuler le tracé', () => { ui.duct = null; updateHint(); requestRender(); }, 'sm') : null,
      sys === 'elec' && !dr ? btn('Zone interdite', startZone, 'sm') : null,
      done];
  } else if (t === 'dim') {
    kids = [h('b', null, 'Cote'), h('span', { class: 'msg' }, 'Faites glisser d’un point à un autre. Les angles des murs aimantent.'), done];
  } else if (t === 'text') {
    kids = [h('b', null, 'Texte'), h('span', { class: 'msg' }, 'Touchez le plan pour ajouter un texte.'), btn('Annuler', () => setTool('select'), 'sm')];
  } else if (EXT.hint[t]) kids = EXT.hint[t]();
  el.replaceChildren(...kids.filter(Boolean));
}

/* ---------------- panneaux flottants ---------------- */
const isNarrow = () => window.matchMedia('(max-width: 760px)').matches;
function closePops() { for (const p of $$('.pop')) p.hidden = true; $('#scrim').hidden = !!$('#modal').hidden; }
function showPop(pop, anchor, mode) {
  for (const p of $$('.pop')) if (p !== pop) p.hidden = true;
  pop.hidden = false;
  pop.classList.toggle('sheet', isNarrow());
  pop.style.left = pop.style.right = pop.style.top = pop.style.bottom = pop.style.width = '';
  if (isNarrow()) { $('#scrim').hidden = false; return; }
  const r = anchor.getBoundingClientRect();
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  if (mode === 'side') {
    const tb = $('#toolbar').getBoundingClientRect();
    const w = Math.min(560, vw - tb.right - 32);
    pop.style.left = tb.right + 10 + 'px'; pop.style.top = tb.top + 'px'; pop.style.width = w + 'px';
    pop.style.maxHeight = Math.min(vh - tb.top - 16, 680) + 'px';
  } else {
    pop.style.top = r.bottom + 6 + 'px';
    const pw = Math.min(320, vw - 32);
    pop.style.width = pw + 'px';
    pop.style.left = clamp(r.right - pw, 16, vw - pw - 16) + 'px';
    pop.style.maxHeight = vh - r.bottom - 20 + 'px';
  }
}
document.addEventListener('pointerdown', (e) => {
  const open = $$('.pop').filter((p) => !p.hidden);
  if (!open.length) return;
  if (open.some((p) => p.contains(e.target))) return;
  if (e.target.closest('#btnView, #btnMenu, #btnFilter, #fpill, .lvl.add, .tool, .hint')) return;
  closePops();
}, true);
$('#scrim').addEventListener('click', () => { if (!$('#modal').hidden) closeModal(); closePops(); });

/* ---------------- bibliothèque : domaines › sous-catégories › éléments ----------------
   Les outils « Mobilier », « Escaliers » et « Électricité » ouvrent la même bibliothèque, chacun à son dernier emplacement.
   La recherche porte sur toute la bibliothèque. D'autres modules peuvent ajouter un domaine (LIB_EXTRA). */
ui.libSub = {};      // dernier emplacement ouvert par outil
ui.libDomSub = {};   // dernière sous-catégorie ouverte dans chaque domaine
ui.libQ = '';
const LIB_DEFAULT = { furn: 'm_cuisine', stairs: 'b_escaliers', elec: 'e_prises' };
function libDomains() { return [...DOMAINES, ...LIB_EXTRA.map((x) => x.dom)]; }
function libEntries(subId) {
  for (const x of LIB_EXTRA) if (x.dom.subs.some((s) => s.id === subId)) return x.entries(subId);
  return entriesOf(subId);
}
function libSubPath(subId) {
  for (const d of libDomains()) { const s = d.subs.find((z) => z.id === subId); if (s) return { dom: d, sub: s }; }
  return null;
}
function libAll() { return [...allEntries(), ...LIB_EXTRA.flatMap((x) => x.all())]; }
function openCatalog(kind) {
  const pop = $('#catalog');
  ui.libKind = kind;
  let subId = ui.libSub[kind] || LIB_DEFAULT[kind] || 'm_cuisine';
  if (!libSubPath(subId)) subId = LIB_DEFAULT[kind] || 'm_cuisine';
  let q = ui.libQ || '';
  const grid = h('div', { class: 'grid-cat' });
  const doms = h('div', { class: 'tabs dom', role: 'tablist', 'aria-label': 'Domaines' });
  const subs = h('div', { class: 'tabs subs', role: 'tablist', 'aria-label': 'Sous-catégories' });
  const note = h('p', { class: 'note', style: 'padding:0 16px 8px' });
  const card = (x, showPath) => {
    const d = x.def, elec = x.src === 'elec';
    const thumb = x.thumb ? x.thumb() : elec ? elecThumb(d, 64) : furnThumb(d);
    const info = showPath ? (x.path || pathOf(x.sub)) : x.info ? x.info : elec ? null : isStair(d.t) ? `${d.w} × ${d.d} · ${d.n_} marches` : `${d.w} × ${d.d} cm`;
    return h('button', { type: 'button', class: 'card', title: x.title || (elec ? d.desc : d.n), 'data-key': x.src + ':' + x.key, onclick: () => {
      ui.place = Object.assign({ kind: x.src, def: d, from: kind }, x.place || {});
      closePops(); setTool('place');
    } }, thumb, h('span', null, x.name || d.n), info ? h('small', null, info) : null);
  };
  const draw = () => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    const here = libSubPath(subId);
    doms.replaceChildren(...libDomains().map((d) => h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(!words.length && d.id === here.dom.id), 'aria-pressed': String(!words.length && d.id === here.dom.id), onclick: () => {
      subId = ui.libDomSub[d.id] || d.subs[0].id; ui.libSub[kind] = subId; q = ''; ui.libQ = ''; search.value = ''; draw(); grid.scrollTop = 0;
    } }, d.name)));
    subs.hidden = !!words.length;
    subs.replaceChildren(...here.dom.subs.map((s) => h('button', { type: 'button', class: 'tab', role: 'tab', 'aria-selected': String(s.id === subId), 'aria-pressed': String(s.id === subId), onclick: () => {
      subId = s.id; ui.libSub[kind] = subId; ui.libDomSub[here.dom.id] = subId; draw(); grid.scrollTop = 0;
    } }, s.name)));
    let items;
    if (words.length) {
      items = searchEntries(q, libAll());
      grid.replaceChildren(...(items.length ? items.map((x) => card(x, true)) : [h('p', { class: 'note', style: 'grid-column:1/-1;padding:8px 4px' }, 'Aucun résultat pour « ' + q + ' ».')]));
    } else {
      items = libEntries(subId);
      const ex = LIB_EXTRA.find((x) => x.dom.id === here.dom.id);
      grid.replaceChildren(...items.map((x) => card(x, false)), ...(ex && ex.after ? [ex.after(subId)].flat().filter(Boolean) : []));
    }
    const ex = LIB_EXTRA.find((x) => x.dom.id === here.dom.id);
    const msg = words.length ? `${items.length} résultat${items.length > 1 ? 's' : ''} dans toute la bibliothèque.`
      : ex && ex.note ? ex.note(subId)
      : here.dom.id === 'electricite' || here.dom.id === 'tertiaire' ? 'Choisissez un élément puis touchez le plan. Les symboles muraux se collent au mur le plus proche. Les conduits de VMC et les gaines se tracent avec l’outil Conduit.'
      : subId === 'b_escaliers' ? 'L’escalier se pose au niveau de départ. La trémie apparaît à l’étage du dessus.' : '';
    note.textContent = msg; note.hidden = !msg;
  };
  const total = libAll().length;
  const search = h('input', { class: 'txt', type: 'search', value: q, placeholder: `Rechercher dans toute la bibliothèque (${total} éléments)`, 'aria-label': 'Rechercher dans la bibliothèque', autocomplete: 'off', enterkeyhint: 'search' });
  search.addEventListener('input', () => { q = search.value; ui.libQ = q; draw(); });
  pop.replaceChildren(
    h('div', { class: 'pop-head' }, h('h2', null, 'Bibliothèque'),
      h('button', { class: 'ib', type: 'button', 'aria-label': 'Fermer', html: ICON.x, onclick: closePops })),
    h('div', { class: 'cat-search' }, search),
    doms, subs, note, grid);
  draw();
  showPop(pop, $(`.tool[data-tool="${kind}"]`), 'side');
}
function furnThumb(def) {
  const S0 = 64;
  const cvs = h('canvas', { width: S0 * 2, height: S0 * 2, 'aria-hidden': 'true' });
  const c = cvs.getContext('2d'); c.setTransform(2, 0, 0, 2, 0, 0);
  const it = makeItemFromDef(def, ui.lv);
  const ex = def.t === 'table_rect' || def.t === 'table_ronde' ? 64 : 0;
  const sc = Math.min(56 / (it.w + ex), 56 / (it.d + ex));
  c.translate(S0 / 2, S0 / 2); c.scale(sc, sc);
  const K = { px: 1 / sc, ink: C.ink, ink2: C.ink2, fill: C.room, tone: C.tone, wall: C.wall, bg: C.room, elec: C.elec, font: FONT_LABEL };
  drawItem(c, it, K, 'full');
  return cvs;
}
function toggleRow(label, get, set) {
  const b = h('button', { type: 'button', role: 'switch', 'aria-checked': String(!!get()) }, h('span', null, label), h('span', { class: 'sw', 'aria-hidden': 'true' }));
  b.addEventListener('click', () => { set(!get()); saveSettings(); b.setAttribute('aria-checked', String(!!get())); refreshUI(); });
  return b;
}
function renderViewPop() {
  const L = S.layers;
  $('#viewPop').replaceChildren(h('div', { class: 'menu' },
    h('h4', null, 'Afficher'),
    toggleRow('Grille', () => L.grid, (v) => (L.grid = v)),
    toggleRow('Noms des pièces', () => L.names, (v) => (L.names = v)),
    toggleRow('Surfaces', () => L.areas, (v) => (L.areas = v)),
    toggleRow('Mobilier', () => L.furn, (v) => (L.furn = v)),
    toggleRow('Électricité', () => L.elec, (v) => (L.elec = v)),
    toggleRow('Liaisons des commandes', () => L.links !== false, (v) => (L.links = v)),
    toggleRow('Couleurs des circuits', () => L.circ !== false, (v) => (L.circ = v)),
    toggleRow('Niveau inférieur en transparence', () => L.ghost, (v) => (L.ghost = v)),
    h('h4', null, 'Cotes des murs'),
    segCtl([{ v: 'faces', n: 'Faces' }, { v: 'axe', n: 'Axe' }, { v: 'none', n: 'Masquées' }], L.dims ? S.dimMode : 'none', (v) => { if (v === 'none') L.dims = false; else { L.dims = true; S.dimMode = v; } saveSettings(); renderViewPop(); requestRender(); }),
    h('h4', null, 'Unité des cotes'),
    segCtl([{ v: 'm', n: 'Mètres' }, { v: 'cm', n: 'Centimètres' }], S.unit, (v) => { S.unit = v; saveSettings(); renderViewPop(); refreshUI(); }),
    h('h4', null, 'Magnétisme'),
    toggleRow('Angles droits et à 45°', () => S.ortho, (v) => (S.ortho = v)),
    toggleRow('Coller les objets aux murs', () => S.magnet, (v) => (S.magnet = v)),
    segCtl([{ v: 1, n: 'Pas de 1 cm' }, { v: 5, n: '5 cm' }, { v: 10, n: '10 cm' }], S.grid, (v) => { S.grid = v; saveSettings(); renderViewPop(); }),
    h('h4', null, 'Apple Pencil'),
    toggleRow('Le stylet dessine, le doigt déplace le plan', () => S.pencil, (v) => { S.pencil = v; S.pencilSeen = true; }),
    h('h4', null, 'Épaisseurs par défaut'),
    h('div', { class: 'row', style: 'padding:0 8px 10px' },
      numField('Mur porteur', S.thMur, 'cm', (v) => { S.thMur = v; saveSettings(); updateHint(); }, { id: 'f-dthm', min: 1, max: 100 }),
      numField('Cloison', S.thCloison, 'cm', (v) => { S.thCloison = v; saveSettings(); updateHint(); }, { id: 'f-dthc', min: 1, max: 60 })),
  ));
}
function menuItem(icon, label, fn) { return h('button', { type: 'button', onclick: () => { closePops(); fn(); } }, ico(icon), h('span', null, label)); }
function renderMenuPop() {
  $('#menuPop').replaceChildren(h('div', { class: 'menu' },
    menuItem('folder', 'Mes plans', openProjects),
    menuItem('plus', 'Nouveau plan', newPlan),
    menuItem('pen', 'Renommer le plan', renamePlan),
    h('hr'),
    menuItem('book', 'Bibliothèque technique', openTechLib),
    menuItem('img', 'Importer un fond de plan (image, PDF ou DXF)', pickFond),
    h('hr'),
    menuItem('img', 'Exporter en image, PDF ou DXF', openExport),
    menuItem('book', 'Dossier PDF (plans, tableau, métrés, éclairage…)', openDossier),
    menuItem('dup', 'Variantes (économique, standard, haut de gamme…)', openVariantes),
    menuItem('up', 'Envoyer le fichier du plan', exportJSON),
    menuItem('down', 'Importer un fichier (plan ou sauvegarde)', () => $('#fileIn').click()),
    h('hr'),
    menuItem('clock', 'Historique des versions', openVersions),
    menuItem('folder', 'Sauvegarder tous mes plans', exportAll),
    h('hr'),
    menuItem('house', 'Ouvrir le plan d’exemple', openSample),
    menuItem('help', 'Gestes et raccourcis', openHelp),
  ));
}
function openLevelPop(anchor) {
  const pop = $('#lvlPop');
  pop.replaceChildren(h('div', { class: 'menu' },
    h('h4', null, 'Ajouter un niveau'),
    menuItem('plus', 'Étage vide au-dessus', () => addLevel('empty')),
    menuItem('dup', 'Étage avec les murs porteurs copiés', () => addLevel('copy')),
    menuItem('down', 'Sous-sol', () => addLevel('below'))));
  showPop(pop, anchor || $('.lvl.add'));
}

/* ---------------- niveaux ---------------- */
function renderLevels() {
  const box = $('#levels');
  const L = levelsSorted();
  const short = (n) => {
    if (!isNarrow()) return n;
    if (/^rez/i.test(n)) return 'RDC';
    let m = n.match(/^(\d+)\s*(er|e|ème)\s+étage$/i); if (m) return 'R+' + m[1];
    if (/^sous-sol/i.test(n)) return n.replace(/^sous-sol/i, 'SS');
    return n.length > 12 ? n.slice(0, 11) + '…' : n;
  };
  box.replaceChildren(...L.map((l) => h('button', { type: 'button', class: 'lvl', 'aria-pressed': String(l.id === ui.lv), onclick: () => switchLevel(l.id), title: l.name }, short(l.name))),
    h('button', { type: 'button', class: 'lvl add', 'aria-label': 'Ajouter un niveau', title: 'Ajouter un niveau', html: ICON.plus, onclick: (e) => openLevelPop(e.currentTarget) }));
  const a = box.querySelector('[aria-pressed="true"]');
  if (a && (a.offsetLeft < box.scrollLeft || a.offsetLeft + a.offsetWidth > box.scrollLeft + box.clientWidth)) box.scrollLeft = a.offsetLeft - 8;
}
function switchLevel(id) {
  if (!IDX.levels.has(id)) return;
  ui.lv = id; ui.sel = null; ui.chain = null; ui.cursor = null; ui.roomDraft = null; ui.duct = null;
  closeDimEdit();
  refreshUI();
}
function floorName() {
  const n = P.levels.filter((l) => l.elev > 0).length + 1;
  return n === 1 ? '1er étage' : n + 'e étage';
}
function addLevel(mode) {
  const L = levelsSorted();
  let lvl;
  if (mode === 'below') {
    const b = L[0];
    lvl = { id: uid('L'), name: P.levels.some((l) => l.name === 'Sous-sol') ? 'Sous-sol 2' : 'Sous-sol', elev: b.elev - 250, h: 230, slab: 20 };
  } else {
    const t = L[L.length - 1];
    lvl = { id: uid('L'), name: floorName(), elev: t.elev + (t.h || 250) + (t.slab || 20), h: 250, slab: 20 };
  }
  P.levels.push(lvl); touch();
  if (mode === 'copy') copyWalls(L[L.length - 1].id, lvl.id);
  ui.lv = lvl.id; ui.sel = null;
  commit();
  toast(mode === 'copy' ? `« ${lvl.name} » créé avec les murs porteurs et leurs fenêtres.` : `« ${lvl.name} » ajouté.`);
}
function copyWalls(src, dst) {
  const map = new Map();
  for (const w of P.walls.filter((x) => x.lv === src && x.kind === 'mur')) {
    for (const nid of [w.a, w.b]) if (!map.has(nid)) { const n = nodeOf(nid); const m = { id: uid('n'), lv: dst, x: n.x, y: n.y }; P.nodes.push(m); map.set(nid, m.id); }
    const nw = { id: uid('w'), lv: dst, a: map.get(w.a), b: map.get(w.b), th: w.th, kind: w.kind };
    P.walls.push(nw);
    for (const o of P.openings.filter((x) => x.wall === w.id && x.kind === 'window')) P.openings.push(Object.assign({}, o, { id: uid('o'), wall: nw.id }));
  }
  touch();
  // fusionner les nœuds colinéaires créés par les cloisons absentes
  for (const n of P.nodes.filter((x) => x.lv === dst)) if (wallsAt(n.id).length === 2) mergeAtNode(n.id, true);
  touch();
}
function deleteLevel(id) {
  if (P.levels.length < 2) return;
  const wallIds = new Set(P.walls.filter((w) => w.lv === id).map((w) => w.id));
  P.openings = P.openings.filter((o) => !wallIds.has(o.wall));
  for (const k of ['nodes', 'walls', 'items', 'elec', 'rooms', 'dims', 'texts', 'links', 'ducts', 'zones', 'etudes']) P[k] = (P[k] || []).filter((o) => o.lv !== id);
  for (const c of P.circuits) if (!P.elec.some((e) => e.cid === c.id)) { /* circuit conservé, sans symbole */ }
  P.levels = P.levels.filter((l) => l.id !== id);
  touch();
  ui.lv = levelsSorted().reduce((best, l) => (Math.abs(l.elev) < Math.abs(best.elev) ? l : best)).id;
  ui.sel = null;
  commit();
}

/* ---------------- fenêtre modale ---------------- */
function openModal(title, ...kids) {
  const m = $('#modal'); m.classList.remove('wide');
  m.replaceChildren(h('div', { class: 'pop-head' }, h('h2', null, title), h('button', { class: 'ib', type: 'button', 'aria-label': 'Fermer', html: ICON.x, onclick: closeModal })), h('div', { class: 'mbody' }, ...kids));
  m.hidden = false; $('#scrim').hidden = false;
  closePopsOnly();
  const f = m.querySelector('input'); if (f && !isNarrow()) f.focus();
}
function closePopsOnly() { for (const p of $$('.pop')) p.hidden = true; }
function closeModal() { $('#modal').hidden = true; $('#scrim').hidden = true; }
function renamePlan() {
  const inp = h('input', { class: 'txt', id: 'f-pname', type: 'text', value: P.name || '', 'aria-label': 'Nom du plan', autocomplete: 'off' });
  const ok = () => { P.name = inp.value.trim() || 'Plan sans nom'; closeModal(); commit(); };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  openModal('Renommer le plan', h('label', { class: 'fld' }, h('span', null, 'Nom'), inp), btns(btn('Enregistrer', ok, 'pri'), btn('Annuler', closeModal)));
}
function openHelp() {
  const li = (a, b) => [h('dt', null, a), h('dd', { style: 'text-align:left;font-family:var(--f-ui);font-weight:500' }, b)];
  openModal('Gestes et raccourcis',
    h('h3', { style: 'margin:0;font-size:13px' }, 'Sur tablette et téléphone'),
    h('dl', { class: 'kv', style: 'grid-template-columns:auto 1fr' },
      li('Pincer', 'Zoomer'), li('Glisser à 2 doigts', 'Déplacer la vue'), li('Glisser sur le vide', 'Déplacer la vue'),
      li('Toucher', 'Sélectionner'), li('Toucher 2 fois un nom', 'Renommer la pièce'), li('Toucher une cote de mur', 'Saisir la longueur de la face'),
      li('Outil Mur', 'Saisir la longueur, puis toucher dans la direction du mur : il prend cette longueur'), li('Outil Porte', 'Choisir « Porte » ou « Placard » dans le bandeau, puis toucher un mur'),
      li('Outil Conduit', 'Toucher le départ, chaque coude, puis le symbole d’arrivée'), li('Toucher 2 fois un coude', 'Retirer le coude d’un conduit sélectionné')),
    h('h3', { style: 'margin:6px 0 0;font-size:13px' }, 'Vue 3D'),
    h('dl', { class: 'kv', style: 'grid-template-columns:auto 1fr' },
      li('Glisser à 1 doigt', 'Tourner autour de la maquette'), li('Pincer, glisser à 2 doigts', 'Zoomer, déplacer'), li('Toucher 2 fois', 'S’approcher de ce point'),
      li('Toucher un objet', 'Sa fiche (hauteur de pose, circuit…) et « Voir sur le plan »'), li('Mode Visite', 'Glisser pour regarder, toucher le sol pour s’y rendre, joystick ou flèches pour marcher')),
    h('h3', { style: 'margin:6px 0 0;font-size:13px' }, 'Au clavier'),
    h('dl', { class: 'kv', style: 'grid-template-columns:auto 1fr' },
      li('Outil Groupe', 'Rectangle de sélection ; flèches : déplacer ; Suppr : supprimer ; Échap : désélectionner'), li('V M P O F B C T', 'Sélection, Mur, Pièce, pOrte, Fenêtre, ouverture liBre, Cote, Texte'), li('L G', 'Liaison, Conduit (VMC ou gaine)'), li('Entrée', 'Terminer le conduit en cours'), li('R', 'Pivoter de 90°'), li('Ctrl D', 'Dupliquer'),
      li('Suppr', 'Supprimer'), li('Flèches', 'Déplacer de 1 cm (Maj : 10 cm)'), li('Ctrl Z / Ctrl Y', 'Annuler / Rétablir'), li('Échap', 'Terminer l’outil'),
      li('Espace + glisser', 'Déplacer la vue'), li('Molette', 'Zoomer')),
    h('p', { class: 'note' }, 'Les murs se dessinent dans l’axe. Les surfaces affichées sont des surfaces au sol, murs et cloisons déduits.'));
}

export { ICON, ROOM_NAMES, addLevel, addOpeningOnWall, applyWallLength, body, btn, btns, chipRow, circuitSection,
  closeModal, closePops, closePopsOnly, confirmBtn, copyWalls, deleteLevel, deleteSel, ductsOf, duplicateSel,
  elecThumb, faceLen, floorName, fmtIn, furnThumb, h, hintKey, ico, inspCloset, inspDim, inspElec, inspGap, inspHead,
  inspItem, inspLevel, inspNode, inspOpening, inspRoom, inspText, inspWall, isNarrow, kv, linksSection, menuItem,
  libAll, newCircuitFor, nudgeSel, numField, openCatalog, openHelp, openLevelPop, openModal, openingModelSelect,
  openingPositionSec, openingSizeText, parseNum, renamePlan, renderInspector, renderLevels, renderMenuPop,
  renderViewPop, rotateSel, row, sec, segCtl, setOpeningModel, setTool, setWallAngle, setWallFace, setWallLength,
  showPop, stretchEnd, switchLevel, textField, toast, toastT, toggleRow, uniqueRoomName, updateHint, wallAngleDisp,
  wallMovingEnds, wallSideName };

/* Calque — module « tableau » : onglet « Tableau électrique » : schéma unifilaire, coffret.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { $, $$, EXT, IDX, NF0, NF1, P, bboxOf, clamp, fmtArea, isNum, labelPoint, ui, uid, vadd, vmul } from './noyau.js';
import { geo, roomOfLabel } from './geometrie.js';
import { ELEC_BY } from './symboles.js';
import { FONT_UI, V } from './rendu2d.js';
import { CALS, CK, KIND_ORDER, KVA_PALIERS, SECS, SEC_MAX, agcpLabel, agcpOf, circById, circMembers, circNumbers, circStats,
  circuitColor, defaultInstall, fmtCount, generateFromPlan, nfcChecks, orderCircuits, panelLayout, rcdById,
  rcdCircuits, rcdLoad, rcdNumbers } from './electricite.js';
import { closeDimEdit, ductPts, ductVisible, elecVisible, resetFilters, updateFilterUI } from './reseaux.js';
import { SCR, commit, finishChain, refreshUI, requestRender, resizeCanvas } from './interaction.js';
import { btn, btns, chipRow, closePops, elecThumb, h, kv, sec, segCtl, textField, toast, updateHint } from './interface.js';
import { slug } from './stockage.js';
import { openFileModal } from './export.js';
import { pastille, rapportDuPlan, rapportView } from './reglesui.js';
import { v3Show } from './vue3d.js';
import { bilanView, ficheButton } from './fiche.js';
import { metresView } from './metres.js';

/* ============================================================
   CALQUE — onglet « Tableau électrique »
   ============================================================ */
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const SCREEN_COL = { ink: 'var(--ink)', ink2: 'var(--ink-2)', ink3: 'var(--ink-3)', accent: 'var(--accent)', bg: 'var(--c-room)', panel: 'var(--panel-2)', dev: 'var(--panel)', elec: 'var(--elec)', rule: 'var(--rule)', err: 'var(--bad)', ok: 'var(--ok)' };
const PRINT_COL = { ink: '#1D2125', ink2: '#5C656C', ink3: '#8A939A', accent: '#D24F1A', bg: '#FFFFFF', panel: '#EEF0EC', dev: '#FAFAF8', elec: '#2356C4', rule: '#D0D5D0', err: '#BF3428', ok: '#2D7A4C' };
const SVG_FONT = "'Archivo Narrow', 'Arial Narrow', 'Roboto Condensed', Arial, sans-serif";
ui.view = 'plan'; ui.evTab = 'uni'; ui.evSel = null; ui.evZoom = 0; ui.hl = null; ui.linkSrc = null;
const KIND_LABEL = (k) => (CK[k] ? CK[k].n : 'Autre');
const CTRL_LABEL = { contacteur: 'Contacteur heures creuses', telerupteur: 'Télérupteur', minuterie: 'Minuterie' };

/* ---------------- symboles du schéma ---------------- */
function sLine(x1, y1, x2, y2, col, w, dash) { return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" style="stroke:${col};stroke-width:${w || 1.4};${dash ? 'stroke-dasharray:' + dash + ';' : ''}fill:none"/>`; }
function sText(x, y, s, col, size, opts) {
  opts = opts || {};
  return `<text x="${x}" y="${y}" style="fill:${col};font-size:${size}px;font-weight:${opts.w || 500};${opts.anchor ? 'text-anchor:' + opts.anchor + ';' : ''}${opts.fam ? 'font-family:' + opts.fam.replace(/"/g, "'") + ';' : ''}"${opts.rot ? ` transform="rotate(${opts.rot} ${x} ${y})"` : ''}>${esc(s)}</text>`;
}
function symBreaker(x, y0, y1, col, cross) {
  // ligne verticale, contact mobile incliné, croix sur le contact fixe (disjoncteur)
  const a = y0 + 10, b = y1 - 10;
  let s = sLine(x, y0, x, a, col) + sLine(x, b, x, y1, col) + sLine(x, b, x - 10, a + 3, col, 1.6);
  if (cross !== false) s += sLine(x - 3.5, a - 3.5, x + 3.5, a + 3.5, col, 1.4) + sLine(x + 3.5, a - 3.5, x - 3.5, a + 3.5, col, 1.4);
  return s;
}
function symRcd(x, y0, y1, col) {
  // interrupteur (sans croix) + tore différentiel
  const m = y1 - 9;
  return sLine(x, y0, x, y0 + 8, col) + sLine(x, y0 + 26, x, y1, col) + sLine(x, y0 + 26, x - 10, y0 + 10, col, 1.6) +
    `<ellipse cx="${x}" cy="${m}" rx="9" ry="4" style="fill:none;stroke:${col};stroke-width:1.3"/>` + sLine(x - 9, m, x - 16, m, col, 1, '2 2') + sLine(x - 16, m, x - 16, y0 + 17, col, 1, '2 2') + sLine(x - 16, y0 + 17, x - 6, y0 + 17, col, 1, '2 2');
}
function symBox(x, y, w, h, label, col, bg) {
  return `<rect x="${x - w / 2}" y="${y}" width="${w}" height="${h}" rx="2" style="fill:${bg};stroke:${col};stroke-width:1.2"/>` + sText(x, y + h / 2 + 3.5, label, col, 9, { anchor: 'middle', w: 700 });
}
function symEarth(x, y, col) { return sLine(x, y, x, y + 8, col) + sLine(x - 9, y + 8, x + 9, y + 8, col, 1.6) + sLine(x - 6, y + 12, x + 6, y + 12, col, 1.4) + sLine(x - 3, y + 16, x + 3, y + 16, col, 1.2); }
function symSpd(x, y, col, bg) {
  return `<rect x="${x - 8}" y="${y}" width="16" height="34" style="fill:${bg};stroke:${col};stroke-width:1.3"/>` +
    `<path d="M${x + 1} ${y + 6} L${x - 3} ${y + 17} L${x + 3} ${y + 17} L${x - 1} ${y + 28}" style="fill:none;stroke:${col};stroke-width:1.3"/>` + `<path d="M${x - 1} ${y + 28} l-3 -4 l5 0 z" style="fill:${col}"/>`;
}

/* ---------------- schéma unifilaire ---------------- */
function uniSVG(col, selId) {
  const nums = circNumbers(), rn = rcdNumbers();
  const inst = P.install || defaultInstall();
  const colW = 62, gGap = 30;
  const groups = P.rcds.map((r) => ({ r, cs: rcdCircuits(r.id) }));
  const orph = P.circuits.filter((c) => !rcdById(c.rcd));
  if (orph.length) groups.push({ r: null, cs: orph });
  let gx = 200 + (inst.parafoudre ? 80 : 0);
  for (const g of groups) { g.w = Math.max(g.cs.length, 2) * colW; g.x0 = gx; g.cx = gx + g.w / 2; gx += g.w + gGap; }
  const busY = 250, idY = 282, subY = 362, brY = 384, endY = 548;
  const W = Math.max(gx + 30, 980), H = 950;
  const s = [];
  s.push(`<rect x="0" y="0" width="${W}" height="${H}" style="fill:${col.bg}"/>`);
  // cartouche
  const tx = W - 350;
  s.push(`<rect x="${tx}" y="18" width="332" height="96" rx="4" style="fill:none;stroke:${col.ink};stroke-width:1.2"/>`);
  s.push(sText(tx + 14, 42, P.name || 'Plan', col.ink, 16, { w: 700, fam: FONT_UI }));
  s.push(sText(tx + 14, 62, 'Schéma unifilaire du tableau de répartition', col.ink, 12.5));
  s.push(sText(tx + 14, 80, (inst.reseau === 'tri' ? 'Triphasé 400 V' : 'Monophasé 230 V') + ' · NF C 15-100 (révision 2024)', col.ink2, 12));
  s.push(sText(tx + 14, 98, new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date()) + ' · ' + P.circuits.length + ' circuits · ' + P.rcds.length + ' différentiels', col.ink2, 12));
  // arrivée
  const sx = 70;
  s.push(sText(26, 36, 'Réseau public de distribution', col.ink2, 12));
  s.push(sLine(sx, 44, sx, 72, col.ink));
  s.push(`<rect x="${sx - 22}" y="72" width="44" height="30" rx="2" style="fill:${col.bg};stroke:${col.ink};stroke-width:1.3"/>`);
  s.push(sText(sx, 92, 'kWh', col.ink, 11, { anchor: 'middle', w: 700 }));
  s.push(sText(sx + 32, 91, 'Compteur', col.ink2, 12));
  s.push(sLine(sx, 102, sx, 140, col.ink));
  s.push(symBreaker(sx, 140, 196, col.ink));
  s.push(`<ellipse cx="${sx}" cy="187" rx="9" ry="4" style="fill:none;stroke:${col.ink};stroke-width:1.3"/>`);
  s.push(sText(sx + 20, 154, 'AGCP (disjoncteur de branchement)', col.ink, 12.5, { w: 700 }));
  s.push(sText(sx + 20, 170, agcpLabel(inst.kva, inst.reseau) + ' · 500 mA type S', col.ink2, 12));
  s.push(sText(sx + 20, 186, 'Puissance souscrite ' + inst.kva + ' kVA', col.ink2, 12));
  s.push(sLine(sx, 196, sx, busY, col.ink));
  s.push(sLine(sx, busY, gx - gGap + 8, busY, col.ink, 3));
  s.push(sText(sx + 20, busY - 10, 'Tableau de répartition', col.ink2, 12));
  // parafoudre
  if (inst.parafoudre) {
    const px = 150;
    s.push(sLine(px, busY, px, 284, col.ink)); s.push(symSpd(px, 284, col.ink, col.bg)); s.push(sLine(px, 318, px, 336, col.ink)); s.push(symEarth(px, 336, col.ink));
    s.push(sText(px + 16, 298, 'Parafoudre', col.ink, 12, { w: 700 })); s.push(sText(px + 16, 312, 'type 2 · In ≥ 5 kA', col.ink2, 11));
  }
  // terre
  s.push(sLine(sx, busY + 24, sx, busY + 50, col.ink, 1.4, '3 3'));
  s.push(sLine(sx - 10, busY + 24, sx + 10, busY + 24, col.ink, 2));
  s.push(symEarth(sx, busY + 50, col.ink));
  s.push(sText(sx, busY + 88, 'Prise de terre', col.ink, 11.5, { w: 700, anchor: 'middle' }));
  s.push(sText(sx, busY + 102, 'R ≤ 100 Ω', col.ink2, 11, { anchor: 'middle' }));
  s.push(sText(sx, busY + 115, '(AGCP 500 mA)', col.ink2, 10.5, { anchor: 'middle' }));
  s.push(sText(sx - 14, busY + 20, 'PE', col.ink2, 10, { anchor: 'end' }));
  // départs
  for (const g of groups) {
    const r = g.r;
    const gc = r ? col.ink : col.err;
    s.push(sLine(g.cx, busY, g.cx, idY, gc));
    if (r) {
      s.push(symRcd(g.cx, idY, idY + 52, col.ink));
      const l = rcdLoad(r.id), bad = rcdCircuits(r.id).length > 8 || (r.cal < l && r.cal < agcpOf(inst.kva, inst.reseau)[1]);
      const lc = bad ? col.err : col.ink;
      s.push(`<g data-rid="${r.id}" style="cursor:pointer">`);
      s.push(sText(g.cx + 14, idY + 14, rn.get(r.id) + (r.own ? ' · IRVE' : ''), lc, 13, { w: 700 }));
      s.push(sText(g.cx + 14, idY + 29, `${r.cal} A · 30 mA`, lc, 11.5));
      s.push(sText(g.cx + 14, idY + 43, `type ${r.type}`, r.type === 'AC' ? col.ink2 : col.accent, 11.5, { w: 700 }));
      s.push(`<rect x="${g.cx - 18}" y="${idY}" width="${Math.min(g.w / 2 + 18, 110)}" height="54" style="fill:transparent"/></g>`);
      s.push(sLine(g.cx, idY + 52, g.cx, subY, col.ink));
    } else {
      s.push(sText(g.cx + 8, idY + 22, 'Sans différentiel', col.err, 12, { w: 700 }));
      s.push(sLine(g.cx, idY, g.cx, subY, col.err, 1.4, '4 3'));
    }
    const n = g.cs.length;
    const off = (g.w - n * colW) / 2;
    const xs = g.cs.map((c, i) => g.x0 + off + colW * (i + 0.5));
    if (n > 1) s.push(sLine(xs[0], subY, xs[n - 1], subY, gc, 2));
    else if (n === 1 && Math.abs(xs[0] - g.cx) > 0.5) s.push(sLine(Math.min(xs[0], g.cx), subY, Math.max(xs[0], g.cx), subY, gc, 2));
    g.cs.forEach((c, i) => {
      const x = xs[i], sel = c.id === selId;
      const st = circStats(c);
      const k = CK[c.kind] || CK.autre;
      const smax = SEC_MAX[c.sec];
      const err = st.over || (smax && c.cal > smax) || !r || (k.typeA && r && r.type === 'AC');
      const lc = sel ? col.accent : err ? col.err : col.ink;
      const cc = circuitColor(c.id, col === PRINT_COL) || col.elec;
      s.push(`<g data-cid="${c.id}" style="cursor:pointer">`);
      s.push(`<rect x="${x - colW / 2 + 2}" y="${subY - 4}" width="${colW - 4}" height="${H - subY - 230}" rx="6" style="fill:${sel ? 'rgba(210,79,26,.08)' : 'transparent'}"/>`);
      s.push(sLine(x, subY, x, brY, lc));
      s.push(symBreaker(x, brY, brY + 46, lc));
      s.push(sText(x + 8, brY + 12, nums.get(c.id), lc, 12.5, { w: 700 }));
      s.push(sText(x + 8, brY + 27, c.cal + ' A', lc, 11.5));
      let y = brY + 46;
      if (c.dda) { s.push(sLine(x, y, x, y + 8, lc)); s.push(symBox(x, y + 8, 26, 14, 'DDA', lc, col.bg)); y += 22; }
      if (c.ctrl) { s.push(sLine(x, y, x, y + 8, lc)); s.push(symBox(x, y + 8, 26, 16, c.ctrl === 'contacteur' ? 'KM' : c.ctrl === 'telerupteur' ? 'TL' : 'MN', lc, col.bg)); y += 24; }
      s.push(sLine(x, y, x, endY, lc));
      s.push(`<circle cx="${x}" cy="${endY - 64}" r="3.2" style="fill:${cc}"/>`);
      s.push(sText(x + 8, endY - 46, String(c.sec).replace('.', ',') + ' mm²', lc, 11.5));
      const cnt = st.unit === 'pt' ? st.count + ' pts' : st.unit === 'socle' ? st.count + ' socles' : st.unit === 'W' ? NF0.format(st.count) + ' W' : '';
      if (cnt) s.push(sText(x + 8, endY - 31, cnt, st.over ? col.err : col.ink2, 11));
      s.push(`<path d="M${x - 4} ${endY} l4 6 l4 -6" style="fill:none;stroke:${lc};stroke-width:1.3"/>`);
      const nm = c.name.length > 32 ? c.name.slice(0, 31) + '…' : c.name;
      s.push(sText(x + 4, endY + 12, nm, lc, 12, { rot: -90, anchor: 'end', w: sel ? 700 : 600 }));
      s.push('</g>');
    });
  }
  // légende
  const ly = H - 112;
  s.push(sLine(20, ly - 18, W - 20, ly - 18, col.rule, 1));
  s.push(sText(26, ly, 'Légende', col.ink, 12.5, { w: 700 }));
  const items = [
    ['br', 'Disjoncteur divisionnaire'], ['rcd', 'Interrupteur différentiel 30 mA'], ['KM', 'Contacteur heures creuses'],
    ['TL', 'Télérupteur'], ['DDA', 'Détecteur d’arc'], ['spd', 'Parafoudre'],
  ];
  let lx = 110;
  for (const [k, t] of items) {
    if (k === 'br') s.push(symBreaker(lx, ly - 20, ly + 24, col.ink));
    else if (k === 'rcd') s.push(symRcd(lx, ly - 22, ly + 26, col.ink));
    else if (k === 'spd') s.push(symSpd(lx, ly - 18, col.ink, col.bg));
    else s.push(symBox(lx, ly - 6, 26, 16, k, col.ink, col.bg));
    s.push(sText(lx + 20, ly + 6, t, col.ink2, 11.5));
    lx += 30 + t.length * 6.3;
  }
  s.push(sText(26, H - 26, 'Document indicatif établi avec Calque. Faites vérifier l’installation par un professionnel avant la mise en service.', col.ink3, 11));
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="font-family:${SVG_FONT}">${s.join('')}</svg>`, W, H };
}

/* ---------------- vue du coffret ---------------- */
function panelSVG(col, selId) {
  const lay = panelLayout();
  const nums = circNumbers(), rn = rcdNumbers();
  const MW = 38, MH = 96, gap = 40, pad = 26, head = 46;
  const W = pad * 2 + lay.rowMods * MW, H = head + lay.rows.length * (MH + gap) + pad - 10;
  const s = [];
  s.push(`<rect x="1" y="1" width="${W - 2}" height="${H - 2}" rx="14" style="fill:${col.panel};stroke:${col.rule};stroke-width:1.5"/>`);
  s.push(sText(pad, 30, `${lay.rows.length} rangée${lay.rows.length > 1 ? 's' : ''} de ${lay.rowMods} modules · ${lay.used} occupés · réserve ${Math.round(lay.reserve * 100)} %`, lay.reserve < 0.2 ? col.err : col.ink2, 13, { w: 600 }));
  lay.rows.forEach((row, ri) => {
    const y = head + ri * (MH + gap);
    s.push(`<rect x="${pad - 6}" y="${y + MH / 2 - 9}" width="${lay.rowMods * MW + 12}" height="18" rx="2" style="fill:${col.rule}"/>`);
    let x = pad;
    for (const m of row.mods) {
      const w = m.w * MW;
      const sel = m.c && m.c.id === selId || (m.r && ui.evSel && ui.evSel.t === 'rcd' && ui.evSel.id === m.r.id);
      const stroke = sel ? col.accent : col.ink3;
      const attr = m.c ? ` data-cid="${m.c.id}"` : m.r ? ` data-rid="${m.r.id}"` : '';
      s.push(`<g${attr} style="cursor:pointer">`);
      s.push(`<rect x="${x + 1}" y="${y}" width="${w - 2}" height="${MH}" rx="4" style="fill:${col.dev};stroke:${stroke};stroke-width:${sel ? 2.4 : 1.2}"/>`);
      if (m.k === 'id') {
        const r = m.r;
        s.push(sText(x + w / 2, y + 16, m.label, col.ink, 12, { anchor: 'middle', w: 700 }));
        s.push(sText(x + w / 2, y + 30, r.cal + ' A', col.ink, 11, { anchor: 'middle' }));
        s.push(`<rect x="${x + w / 2 - 9}" y="${y + 38}" width="18" height="26" rx="3" style="fill:${col.ink}"/>`);
        s.push(sText(x + w / 2, y + 78, '30 mA', col.ink2, 10, { anchor: 'middle' }));
        s.push(`<rect x="${x + 7}" y="${y + 81}" width="${w - 14}" height="12" rx="3" style="fill:${r.type === 'AC' ? col.ink3 : col.accent}"/>`);
        s.push(sText(x + w / 2, y + 91, 'type ' + r.type, '#fff', 8.5, { anchor: 'middle', w: 700 }));
        s.push(`<circle cx="${x + w - 9}" cy="${y + 52}" r="4" style="fill:${col.accent}"/>`);
      } else if (m.k === 'cb') {
        const cc = circuitColor(m.c.id, col === PRINT_COL) || col.elec;
        s.push(`<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="5" rx="2" style="fill:${cc}"/>`);
        s.push(sText(x + w / 2, y + 24, m.label, m.orphan ? col.err : col.ink, 11, { anchor: 'middle', w: 700 }));
        s.push(`<rect x="${x + w / 2 - 6}" y="${y + 34}" width="12" height="24" rx="2" style="fill:${col.ink}"/>`);
        s.push(sText(x + w / 2, y + 74, m.c.cal + 'A', col.ink, 10.5, { anchor: 'middle', w: 600 }));
        s.push(sText(x + w / 2, y + 88, String(m.c.sec).replace('.', ','), col.ink2, 9, { anchor: 'middle' }));
      } else {
        const lab = { dda: 'DDA', km: 'HC', tl: 'TL', mn: 'MIN', pf: 'PF' }[m.k];
        s.push(sText(x + w / 2, y + 24, lab, col.ink, 11, { anchor: 'middle', w: 700 }));
        if (m.k === 'pf') { s.push(symSpd(x + w / 2, y + 36, col.ink, col.dev)); s.push(sText(x + w / 2, y + 88, 'type 2', col.ink2, 9, { anchor: 'middle' })); }
        else { s.push(`<rect x="${x + w / 2 - 7}" y="${y + 38}" width="14" height="20" rx="2" style="fill:none;stroke:${col.ink};stroke-width:1.3"/>`); s.push(sText(x + w / 2, y + 80, m.c ? nums.get(m.c.id) : '', col.ink2, 9.5, { anchor: 'middle' })); }
      }
      s.push('</g>');
      x += w;
    }
    for (let i = row.used; i < lay.rowMods; i++) {
      s.push(`<rect x="${x + 2}" y="${y + 2}" width="${MW - 4}" height="${MH - 4}" rx="4" style="fill:none;stroke:${col.ink3};stroke-width:1;stroke-dasharray:3 3;opacity:.7"/>`);
      x += MW;
    }
  });
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" style="font-family:${SVG_FONT}">${s.join('')}</svg>`, W, H };
}

/* ---------------- vue d'ensemble de l'onglet ---------------- */
function setView(v) {
  ui.view = v;
  try { localStorage.setItem('calque.view', v); } catch (e) { }
  const planLike = v === 'plan' || v === 'chantier';
  for (const f of EXT.view) f(v);
  $('#main').hidden = !planLike;
  $('#elecView').hidden = v !== 'elec';
  $('#view3d').hidden = v !== '3d';
  $('#levels').hidden = v === 'elec';
  $('#btnView').hidden = !planLike;
  $('#btnFilter').hidden = v === 'elec';
  $('#btnExport').hidden = v === 'elec';
  closeDimEdit(); updateFilterUI();
  for (const b of $$('.vtab')) b.setAttribute('aria-pressed', String(b.dataset.view === v));
  closePops();
  if (v === 'elec') { if (ui.chain) finishChain(); renderElecView(); }
  else if (v === '3d') { if (ui.chain) finishChain(); updateHint(); requestAnimationFrame(() => v3Show()); }
  else { requestAnimationFrame(() => { resizeCanvas(); requestRender(); }); updateHint(); }
}
function renderElecView() {
  if (ui.view !== 'elec' || !P) return;
  if (ui.evSel && ui.evSel.t === 'circuit' && !circById(ui.evSel.id)) ui.evSel = null;
  if (ui.evSel && ui.evSel.t === 'rcd' && !rcdById(ui.evSel.id)) ui.evSel = null;
  renderEvSide();
  renderEvMain();
}
function evSelect(sel) {
  const same = ui.evSel && sel && ui.evSel.t === sel.t && ui.evSel.id === sel.id;
  ui.evSel = same ? null : sel;
  renderElecView();
  if (ui.evSel) { const el = document.querySelector(`#evSide [data-key="${ui.evSel.t}:${ui.evSel.id}"]`); if (el) el.scrollIntoView({ block: 'nearest' }); }
}
function totalSurface() { let s = 0; for (const L of P.levels) for (const r of geo(L.id).rooms) s += r.area; return s; }
function renderEvSide() {
  const box = $('#evSide');
  const ae = document.activeElement, focusId = ae && box.contains(ae) ? ae.id : null;
  const scroll = box.scrollTop;
  const inst = P.install || (P.install = defaultInstall());
  const nums = circNumbers(), rn = rcdNumbers();
  const lay = P.circuits.length ? panelLayout() : null;
  const kids = [];
  kids.push(h('div', { class: 'ev-head' }, h('h2', null, 'Tableau électrique'),
    h('p', null, P.circuits.length ? `${P.circuits.length} circuits · ${P.rcds.length} différentiels · ${lay.rows.length} rangée${lay.rows.length > 1 ? 's' : ''} de ${lay.rowMods}` : 'Aucun circuit pour le moment')));
  // installation
  const instOpen = ui.evSel && ui.evSel.t === 'install';
  kids.push(h('button', { type: 'button', class: 'ev-row ev-inst', 'data-key': 'install:0', 'aria-expanded': String(!!instOpen), onclick: () => evSelect({ t: 'install', id: 0 }) },
    h('span', { class: 'ev-badge' }, 'AGCP'), h('span', { class: 'ev-main' }, h('b', null, 'Arrivée et installation'), h('small', null, `${inst.kva} kVA · ${agcpLabel(inst.kva, inst.reseau)} · ${fmtArea(totalSurface())}`))));
  if (instOpen) kids.push(h('div', { class: 'ev-edit' },
    sec('Puissance souscrite', segCtl([...new Set([...KVA_PALIERS[inst.reseau === 'tri' ? 'tri' : 'mono'], inst.kva])].sort((a, b) => a - b).map((v) => ({ v, n: v + ' kVA' })), inst.kva, (v) => { inst.kva = v; commit(); }),
      h('p', { class: 'note' }, `Disjoncteur de branchement ${agcpLabel(inst.kva, inst.reseau)}, différentiel 500 mA type S, fourni par le distributeur. Réglage usuel pour cette puissance (estimé) : à vérifier sur le contrat.`)),
    sec('Parafoudre', segCtl([{ v: false, n: 'Sans' }, { v: true, n: 'Avec parafoudre' }], !!inst.parafoudre, (v) => { inst.parafoudre = v; commit(); }),
      h('p', { class: 'note' }, 'Obligatoire si le bâtiment a un paratonnerre et dans certaines zones exposées à la foudre. Recommandé dans les autres cas.')),
    sec('Réseau', segCtl([{ v: 'mono', n: 'Monophasé 230 V' }, { v: 'tri', n: 'Triphasé 400 V' }], inst.reseau || null, (v) => { inst.reseau = v; commit(); }),
      h('p', { class: 'note' }, inst.reseau ? (inst.reseau === 'tri' ? 'Calculs en triphasé : choisissez la phase de chaque circuit dans sa fiche de calcul.' : 'Calculs en monophasé 230 V.') : 'Non précisé : les calculs retiennent le monophasé (valeur estimée).')),
    sec('Coffret', segCtl([{ v: 13, n: '13 modules par rangée' }, { v: 18, n: '18 modules' }], inst.row || 13, (v) => { inst.row = v; commit(); })),
    kv([['Surface des pièces', fmtArea(totalSurface())], ['Liaisons commandes', String(P.links.length)]])));
  kids.push(h('div', { class: 'btns ev-actions' },
    P.circuits.length
      ? confirmBtnPlain('Régénérer depuis le plan', 'Remplacer les circuits ?', () => { generateFromPlan(); ui.evSel = null; commit(); toast('Tableau régénéré à partir du plan.'); })
      : btn('Générer depuis le plan', () => { generateFromPlan(); ui.evSel = null; commit(); toast(`${P.circuits.length} circuits et ${P.rcds.length} différentiels créés.`); }, 'pri', 'plus'),
    btn('Circuit', addCircuit, 'sm', 'plus'), btn('Différentiel', addRcd, 'sm', 'plus')));
  if (!P.circuits.length && !P.rcds.length) {
    kids.push(h('div', { class: 'empty-help', style: 'padding:4px 2px' },
      h('span', null, 'La génération lit les symboles électriques du plan, les regroupe en circuits selon la NF C 15-100, puis les répartit sur les interrupteurs différentiels.'),
      h('span', null, 'Reliez d’abord vos interrupteurs à leurs éclairages avec l’outil ', h('b', null, 'Liaison'), ' du plan : les commandes suivront leurs points lumineux.')));
  }
  const groups = P.rcds.map((r) => ({ r, cs: rcdCircuits(r.id) }));
  const orph = P.circuits.filter((c) => !rcdById(c.rcd));
  if (orph.length) groups.push({ r: null, cs: orph });
  for (const g of groups) {
    const box2 = h('div', { class: 'ev-group' });
    if (g.r) {
      const r = g.r, l = rcdLoad(r.id), cnt = g.cs.length;
      const bad = cnt > 8 || (r.cal < l && r.cal < agcpOf(inst.kva, inst.reseau)[1]);
      const open = ui.evSel && ui.evSel.t === 'rcd' && ui.evSel.id === r.id;
      box2.append(h('button', { type: 'button', class: 'ev-row ev-rcd' + (bad ? ' bad' : ''), 'data-key': 'rcd:' + r.id, 'aria-expanded': String(!!open), onclick: () => evSelect({ t: 'rcd', id: r.id }) },
        h('span', { class: 'ev-badge' + (r.type !== 'AC' ? ' a' : '') }, rn.get(r.id)),
        h('span', { class: 'ev-main' }, h('b', null, `Différentiel ${r.cal} A · type ${r.type}${r.own ? ' · borne' : ''}`), h('small', null, `30 mA · ${cnt}/8 circuits · charge ${NF1.format(l)} A`)),
        h('span', { class: 'ev-dot ' + (bad ? 'err' : 'ok') })));
      if (open) box2.append(rcdEditor(r));
    } else box2.append(h('div', { class: 'ev-row ev-rcd bad' }, h('span', { class: 'ev-badge' }, '—'), h('span', { class: 'ev-main' }, h('b', null, 'Sans différentiel'), h('small', null, 'Chaque circuit doit être protégé par un différentiel 30 mA'))));
    for (const c of g.cs) {
      const st = circStats(c), k = CK[c.kind] || CK.autre;
      const smax = SEC_MAX[c.sec];
      const err = st.over || (smax && c.cal > smax) || !g.r || (k.typeA && g.r && g.r.type === 'AC');
      const open = ui.evSel && ui.evSel.t === 'circuit' && ui.evSel.id === c.id;
      box2.append(h('button', { type: 'button', class: 'ev-row ev-c', 'data-key': 'circuit:' + c.id, 'aria-expanded': String(!!open), onclick: () => evSelect({ t: 'circuit', id: c.id }) },
        h('span', { class: 'ev-num', style: `--cc:${circuitColor(c.id) || 'var(--elec)'}` }, nums.get(c.id)),
        h('span', { class: 'ev-main' }, h('b', null, c.name), h('small', null, `${c.cal} A · ${String(c.sec).replace('.', ',')} mm² · ${fmtCount(st)}${c.dda ? ' · DDA' : ''}${c.ctrl ? ' · ' + (c.ctrl === 'contacteur' ? 'contacteur HC' : c.ctrl) : ''}`)),
        h('span', { class: 'ev-dot ' + (err ? 'err' : st.ms.length ? 'ok' : 'idle') })));
      if (open) box2.append(circuitEditor(c));
    }
    kids.push(box2);
  }
  box.replaceChildren(...kids);
  box.scrollTop = scroll;
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
}
function confirmBtnPlain(label, confirmLabel, action) {
  const b = btn(label, () => {
    if (b.dataset.armed) { action(); return; }
    b.dataset.armed = '1'; b.lastChild.textContent = confirmLabel; b.classList.add('pri');
    setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.lastChild.textContent = label; b.classList.remove('pri'); } }, 3500);
  }, '', 'swap');
  return b;
}
function addCircuit() {
  const r = P.rcds.find((x) => !x.own && x.type === 'AC' && rcdCircuits(x.id).length < 8) || P.rcds.find((x) => !x.own && rcdCircuits(x.id).length < 8) || null;
  const c = { id: uid('c'), kind: 'prises', name: 'Nouveau circuit', cal: 20, sec: 2.5, rcd: r ? r.id : null, dda: false, ctrl: null };
  P.circuits.push(c); orderCircuits();
  ui.evSel = { t: 'circuit', id: c.id };
  commit();
  setTimeout(() => { const f = document.getElementById('e-name'); if (f) { f.focus(); f.select(); } }, 30);
}
function addRcd() {
  const r = { id: uid('d'), type: 'AC', cal: 40 };
  P.rcds.push(r); ui.evSel = { t: 'rcd', id: r.id };
  commit();
}
function moveIn(arr, item, dir, same) {
  const idx = arr.indexOf(item);
  let j = idx + dir;
  while (j >= 0 && j < arr.length && same && !same(arr[j])) j += dir;
  if (j < 0 || j >= arr.length) return false;
  arr.splice(idx, 1); arr.splice(j, 0, item); return true;
}
function rcdEditor(r) {
  const l = rcdLoad(r.id), agcp = agcpOf((P.install || defaultInstall()).kva, (P.install || {}).reseau)[1];
  const cs = rcdCircuits(r.id);
  return h('div', { class: 'ev-edit' },
    sec('Type', segCtl([{ v: 'AC', n: 'Type AC' }, { v: 'A', n: 'Type A' }, { v: 'F', n: 'Type F' }], r.type, (v) => { r.type = v; commit(); }),
      h('p', { class: 'note' }, r.type === 'AC' ? 'Usage courant : éclairage, prises, chauffage, chauffe-eau.' : r.type === 'A' ? 'Obligatoire pour la plaque de cuisson, le lave-linge, le sèche-linge, la pompe à chaleur et la borne de recharge.' : 'Type F : appareils à vitesse variable monophasés (pompe à chaleur, climatisation, pompe de piscine), congélateur.')),
    sec('Calibre', segCtl([25, 40, 63].map((v) => ({ v, n: v + ' A' })), r.cal, (v) => { r.cal = v; commit(); }),
      kv([['Charge calculée', NF1.format(l) + ' A'], ['Réglage de l’AGCP', agcp + ' A'], ['Circuits', cs.length + ' / 8']]),
      h('p', { class: 'note' }, 'Charge = chauffage + chauffe-eau + borne à 100 %, autres circuits à 50 % de leur calibre. Le calibre doit couvrir cette charge ou le réglage de l’AGCP.')),
    sec(null, btns(btn('Monter', () => { moveIn(P.rcds, r, -1); orderCircuits(); commit(); }, 'sm'), btn('Descendre', () => { moveIn(P.rcds, r, 1); orderCircuits(); commit(); }, 'sm'),
      btn('Supprimer', () => { for (const c of cs) c.rcd = null; P.rcds = P.rcds.filter((x) => x !== r); ui.evSel = null; commit(); }, 'sm danger', 'del'))));
}
function circuitEditor(c) {
  const st = circStats(c), k = CK[c.kind] || CK.autre, rn = rcdNumbers();
  const typeSel = h('select', { class: 'txt', id: 'e-kind', 'aria-label': 'Type de circuit' }, KIND_ORDER.map((key) => h('option', { value: key, selected: key === c.kind }, CK[key].n)));
  typeSel.addEventListener('change', () => { const nk = CK[typeSel.value]; c.kind = typeSel.value; c.cal = nk.cal; c.sec = nk.sec; c.ctrl = nk.ctrl || null; if (c.name === k.n || c.name === 'Nouveau circuit') c.name = nk.n; commit(); });
  const rcdSel = h('select', { class: 'txt', id: 'e-rcd', 'aria-label': 'Interrupteur différentiel' }, h('option', { value: '' }, 'Aucun'), P.rcds.map((r) => h('option', { value: r.id, selected: r.id === c.rcd }, `${rn.get(r.id)} · ${r.cal} A · type ${r.type} (${rcdCircuits(r.id).length}/8)`)));
  rcdSel.addEventListener('change', () => { c.rcd = rcdSel.value || null; orderCircuits(); commit(); });
  const ctrlSel = h('select', { class: 'txt', id: 'e-ctrl', 'aria-label': 'Commande' }, h('option', { value: '' }, 'Aucune'), Object.entries(CTRL_LABEL).map(([v, n]) => h('option', { value: v, selected: v === c.ctrl }, n)));
  ctrlSel.addEventListener('change', () => { c.ctrl = ctrlSel.value || null; commit(); });
  const counts = new Map(); for (const e of st.ms) counts.set(e.type, (counts.get(e.type) || 0) + 1);
  const smax = SEC_MAX[c.sec];
  return h('div', { class: 'ev-edit' },
    sec('Désignation', textField(null, c.name, (v) => { c.name = v.trim() || k.n; commit(); }, { id: 'e-name', ph: 'Nom du circuit' })),
    sec('Calcul', ficheButton(c)),
    sec('Type', typeSel),
    sec('Disjoncteur', chipRow(CALS, c.cal, (v) => { c.cal = v; commit(); }, (v) => v + ' A')),
    sec('Section des conducteurs', chipRow(SECS, c.sec, (v) => { c.sec = v; commit(); }, (v) => String(v).replace('.', ',') + ' mm²'),
      smax && c.cal > smax ? h('p', { class: 'note', style: 'color:var(--bad)' }, `${String(c.sec).replace('.', ',')} mm² n'admet pas plus de ${smax} A.`) : null),
    sec('Interrupteur différentiel', rcdSel, k.typeA ? h('p', { class: 'note' }, 'Ce circuit doit être sous un différentiel de type A (ou F).') : null),
    sec('Options', segCtl([{ v: false, n: 'Sans DDA' }, { v: true, n: 'Détecteur d’arc' }], !!c.dda, (v) => { c.dda = v; commit(); }), ctrlSel),
    sec('Sur le plan',
      h('div', { class: 'ro', style: `color:${st.over ? 'var(--bad)' : 'var(--ink)'}` }, fmtCount(st)),
      counts.size ? h('div', { class: 'list' }, [...counts].map(([t, n]) => { const d = ELEC_BY.get(t); return h('div', { class: 'li' }, d ? elecThumb(d, 26) : h('span'), h('span', null, d ? d.n : t), h('span', { class: 'v' }, '× ' + n)); })) : h('p', { class: 'note' }, 'Aucun symbole relié. Dans le plan, sélectionnez un symbole et choisissez ce circuit.'),
      st.ms.length ? btns(btn('Voir sur le plan', () => showCircuitOnPlan(c.id), 'sm pri')) : null),
    sec(null, btns(
      btn('Monter', () => { moveIn(P.circuits, c, -1, (x) => x.rcd === c.rcd); commit(); }, 'sm'),
      btn('Descendre', () => { moveIn(P.circuits, c, 1, (x) => x.rcd === c.rcd); commit(); }, 'sm'),
      btn('Supprimer', () => { for (const e of P.elec) if (e.cid === c.id) delete e.cid; P.circuits = P.circuits.filter((x) => x !== c); ui.evSel = null; commit(); }, 'sm danger', 'del'))));
}
function showCircuitOnPlan(cid) {
  const ms = circMembers(cid);
  const cnt = new Map(); for (const e of ms) cnt.set(e.lv, (cnt.get(e.lv) || 0) + 1);
  const best = [...cnt].sort((a, b) => b[1] - a[1])[0];
  ui.hl = cid; ui.sel = null;
  setView('plan');
  if (best) { ui.lv = best[0]; refreshUI(); }
  const pts = ms.filter((e) => e.lv === ui.lv);
  if (pts.length) {
    requestAnimationFrame(() => {
      const bb = bboxOf(pts);
      const W = SCR.w, Hh = SCR.h, pad = 120;
      const bw = Math.max(300, bb.x1 - bb.x0), bh = Math.max(300, bb.y1 - bb.y0);
      V.s = clamp(Math.min((W - 2 * pad) / bw, (Hh - 2 * pad) / bh), 0.05, 3);
      V.ox = W / 2 - ((bb.x0 + bb.x1) / 2) * V.s; V.oy = Hh / 2 - ((bb.y0 + bb.y1) / 2) * V.s;
      requestRender();
    });
  }
  updateHint(); requestRender();
}
function goToRef(ref) {
  if (!ref) return;
  if (ref.t === 'circuit' || ref.t === 'rcd') { ui.evSel = ref; renderElecView(); const el = document.querySelector(`#evSide [data-key="${ref.t}:${ref.id}"]`); if (el) el.scrollIntoView({ block: 'center' }); return; }
  let lv = ref.lv, obj = null;
  if (ref.t === 'elec') { obj = IDX.elec.get(ref.id); lv = obj && obj.lv; if (obj && !elecVisible(obj)) { resetFilters(); toast('Filtres retirés pour afficher l’élément.'); } }
  else if (ref.t === 'duct') { obj = IDX.ducts.get(ref.id); lv = obj && obj.lv; if (obj && !ductVisible(obj)) resetFilters(); if (obj) obj = Object.assign({}, ductPts(obj)[Math.floor(obj.pts.length / 2)]); }
  else if (ref.t === 'room') obj = IDX.rooms.get(ref.id);
  else if (ref.t === 'opening') { obj = IDX.openings.get(ref.id); }
  if (!lv) return;
  setView('plan');
  ui.lv = lv; ui.sel = { t: ref.t, id: ref.id }; ui.inspOpen = true; ui.hl = null;
  refreshUI();
  let p = obj && isNum(obj.x) ? obj : null;
  if (ref.t === 'room') { const r = roomOfLabel(obj); if (r) p = labelPoint(r.poly); }
  if (ref.t === 'opening' && obj) { const wg = geo(lv).walls.get(obj.wall); if (wg) p = vadd(wg.A, vmul(wg.d, obj.t)); }
  if (p) requestAnimationFrame(() => { V.s = Math.max(V.s, 0.9); V.ox = SCR.w / 2 - p.x * V.s; V.oy = SCR.h / 2 - p.y * V.s; requestRender(); });
}
function renderEvMain() {
  /* contrôles : moteur de règles (regles.js), trois statuts, source et édition de chaque règle */
  const rap = rapportDuPlan(), pa = pastille(rap);
  const bar = $('#evBar');
  const tab = (v, label, badge) => h('button', { type: 'button', 'aria-pressed': String(ui.evTab === v), onclick: () => { ui.evTab = v; renderEvMain(); } }, label, badge ? h('span', { class: 'ev-count' + (pa.cls ? ' ' + pa.cls : '') }, badge) : null);
  bar.replaceChildren(...[
    h('div', { class: 'seg' }, tab('uni', 'Schéma unifilaire'), tab('panel', 'Coffret'), tab('check', 'Contrôle NF C 15-100', pa.t), tab('calc', 'Bilan'), tab('chem', 'Cheminements')),
    h('div', { class: 'spacer' }),
    ui.evTab !== 'check' && ui.evTab !== 'calc' && ui.evTab !== 'chem' ? h('div', { class: 'btns' },
      h('button', { class: 'ib', type: 'button', 'aria-label': 'Dézoomer', title: 'Dézoomer', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 12h12"/></svg>', onclick: () => { ui.evZoom = clamp(ui.evZoom / 1.2, 0.3, 3); renderEvMain(); } }),
      h('button', { class: 'ib', type: 'button', 'aria-label': 'Ajuster', title: 'Ajuster à la largeur', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg>', onclick: () => { ui.evZoom = 0; renderEvMain(); } }),
      h('button', { class: 'ib', type: 'button', 'aria-label': 'Zoomer', title: 'Zoomer', html: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 12h12M12 6v12"/></svg>', onclick: () => { ui.evZoom = clamp((ui.evZoom || 1) * 1.2, 0.3, 3); renderEvMain(); } }),
      btn('Image', () => exportElec(ui.evTab, 'png'), 'sm', 'img'), btn('SVG', () => exportElec(ui.evTab, 'svg'), 'sm', 'down')) : null].filter(Boolean));
  const cv2 = $('#evCanvas');
  const sel = ui.evSel && ui.evSel.t === 'circuit' ? ui.evSel.id : null;
  if (ui.evTab === 'check') { const sc = cv2.scrollTop; cv2.replaceChildren(rapportView(rap, goToRef, () => renderEvMain())); cv2.scrollTop = sc; return; }
  if (ui.evTab === 'calc') { const sc = cv2.scrollTop; cv2.replaceChildren(bilanView()); cv2.scrollTop = sc; return; }
  if (ui.evTab === 'chem') { const sc = cv2.scrollTop; cv2.replaceChildren(metresView()); cv2.scrollTop = sc; return; }
  if (!P.circuits.length && !P.rcds.length) {
    cv2.replaceChildren(h('div', { class: 'ev-empty' }, h('h3', null, 'Pas encore de tableau'), h('p', null, 'Touchez « Générer depuis le plan » : Calque crée les circuits et les différentiels à partir des symboles électriques que vous avez posés.'), btn('Générer depuis le plan', () => { generateFromPlan(); commit(); }, 'pri', 'plus')));
    return;
  }
  const { svg, W, H } = ui.evTab === 'uni' ? uniSVG(SCREEN_COL, sel) : panelSVG(SCREEN_COL, sel);
  const wrap = h('div', { class: 'ev-svg', html: svg });
  const avail = Math.max(300, cv2.clientWidth - 32);
  const z = ui.evZoom || clamp(avail / W, 0.66, 1.4);
  const svgEl = wrap.firstChild; svgEl.setAttribute('width', Math.round(W * z)); svgEl.setAttribute('height', Math.round(H * z));
  wrap.addEventListener('click', (e) => {
    const g = e.target.closest('[data-cid],[data-rid]'); if (!g) return;
    if (g.dataset.cid) evSelect({ t: 'circuit', id: g.dataset.cid }); else evSelect({ t: 'rcd', id: g.dataset.rid });
  });
  const kids = [wrap];
  if (ui.evTab === 'panel') kids.push(repereTable());
  cv2.replaceChildren(...kids);
}
function repereTable() {
  const nums = circNumbers(), rn = rcdNumbers();
  const rows = P.circuits.map((c) => { const r = rcdById(c.rcd); return h('tr', { onclick: () => evSelect({ t: 'circuit', id: c.id }), class: ui.evSel && ui.evSel.id === c.id ? 'on' : '' },
    h('td', null, h('span', { class: 'ev-num', style: `--cc:${circuitColor(c.id) || 'var(--elec)'}` }, nums.get(c.id))), h('td', null, c.name), h('td', { class: 'n' }, c.cal + ' A'), h('td', { class: 'n' }, String(c.sec).replace('.', ',') + ' mm²'), h('td', null, r ? `${rn.get(r.id)} (${r.type})` : '—')); });
  return h('div', { class: 'ev-table' }, h('h3', null, 'Repérage des circuits'), h('table', null, h('thead', null, h('tr', null, ['Repère', 'Désignation', 'Calibre', 'Section', 'Différentiel'].map((t) => h('th', null, t)))), h('tbody', null, rows)));
}
function checksView(checks) {
  const nErr = checks.filter((c) => c.sev === 'err').length, nWarn = checks.filter((c) => c.sev === 'warn').length, nOk = checks.filter((c) => c.sev === 'ok').length;
  const groups = [...new Set(checks.map((c) => c.group))];
  const icon = { err: '✕', warn: '!', info: 'i', ok: '✓' };
  return h('div', { class: 'ev-checks' },
    h('div', { class: 'ev-sum' },
      h('div', { class: 'ev-sumbox ' + (nErr ? 'err' : 'ok') }, h('b', null, String(nErr)), h('span', null, nErr > 1 ? 'non-conformités' : 'non-conformité')),
      h('div', { class: 'ev-sumbox warn' }, h('b', null, String(nWarn)), h('span', null, nWarn > 1 ? 'avertissements' : 'avertissement')),
      h('div', { class: 'ev-sumbox okb' }, h('b', null, String(nOk)), h('span', null, 'points conformes'))),
    h('p', { class: 'note' }, 'Contrôle indicatif selon la NF C 15-100 (révision 2024), à partir du plan et du tableau. Il ne remplace ni l’avis d’un électricien ni l’attestation de conformité exigée pour la mise en service.'),
    groups.map((gname) => h('section', null, h('h3', null, gname), h('div', { class: 'ev-list' }, checks.filter((c) => c.group === gname).map((c) => h(c.ref ? 'button' : 'div', { type: c.ref ? 'button' : null, class: 'ev-chk ' + c.sev, onclick: c.ref ? () => goToRef(c.ref) : null, title: c.rule || null },
      h('span', { class: 'ic' }, icon[c.sev]), h('span', { class: 'tx' }, c.msg, c.rule && c.sev === 'err' ? h('small', null, c.rule) : null), c.ref ? h('span', { class: 'go' }, '›') : null))))));
}
async function exportElec(kind, fmt) {
  const { svg, W, H } = kind === 'panel' ? panelSVG(PRINT_COL, null) : uniSVG(PRINT_COL, null);
  const base = `${slug(P.name)}-${kind === 'panel' ? 'coffret' : 'schema-unifilaire'}`;
  const title = kind === 'panel' ? 'Coffret électrique' : 'Schéma unifilaire';
  if (fmt === 'svg') { openFileModal(title + ' (SVG)', new File([svg], base + '.svg', { type: 'image/svg+xml' }), 'Fichier vectoriel : s’ouvre dans un navigateur, Illustrator, Inkscape ou Affinity.'); return; }
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = url; });
    const k = 2, cvs = document.createElement('canvas'); cvs.width = W * k; cvs.height = H * k;
    const c2 = cvs.getContext('2d'); c2.fillStyle = '#fff'; c2.fillRect(0, 0, cvs.width, cvs.height); c2.drawImage(img, 0, 0, cvs.width, cvs.height);
    const blob = await new Promise((res) => cvs.toBlob(res, 'image/png'));
    openFileModal(title, new File([blob], base + '.png', { type: 'image/png' }), 'Collez l’image dans PowerPoint ou Keynote, ou partagez-la.');
  } catch (e) { toast('Impossible de générer l’image.'); }
  finally { URL.revokeObjectURL(url); }
}

export { CTRL_LABEL, KIND_LABEL, PRINT_COL, SCREEN_COL, SVG_FONT, addCircuit, addRcd, checksView, circuitEditor,
  confirmBtnPlain, esc, evSelect, exportElec, goToRef, moveIn, panelSVG, rcdEditor, renderElecView, renderEvMain,
  renderEvSide, repereTable, sLine, sText, setView, showCircuitOnPlan, symBox, symBreaker, symEarth, symRcd, symSpd,
  totalSurface, uniSVG };

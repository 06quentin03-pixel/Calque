/* Calque — module « export » : export : PDF intégré, image PNG, partage.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { $, $$, NF1, NFc, P, S, clamp, fmtArea, fmtLenU, levelOf, levelsSorted, saveSettings, ui, uid } from './noyau.js';
import { geo } from './geometrie.js';
import { snapshot } from './historique.js';
import { ELEC } from './symboles.js';
import { FONT_LABEL, FONT_UI, RC, drawScene, setRC, setScreen } from './rendu2d.js';
import { ductLen, ductVisible, elecVisible } from './reseaux.js';
import { contentBBox, requestRender } from './interaction.js';
import { btn, btns, closeModal, h, openModal, sec, segCtl, toast } from './interface.js';
import { LIGHT, addVersion, getDownloads, listProjects, loadProject, lsSet, migratePlan, notifySaveFail, openPlan,
  openProjects, saveBlobLocal, saveNow, scheduleSave, slug, writePlanLocal } from './stockage.js';
import { photo3D } from './vue3d.js';
import { exportUserLib, importUserLib } from './mabiblio.js';
import { sauvegardeFaite } from './rappelui.js';
import { DXF_UNITES, DxfCtx, buildDxf, dxfBilan, dxfOctets } from './dxf.js';
import { SvgCtx } from './svgexport.js';
import { VUES, avecVue, calqueVisible, vueParId } from './calques.js';
import { circNumbers, circuitColor } from './electricite.js';
import { cablagePlan } from './cablage.js';
import { exporterPhotos, importerPhotos, photosEnParties } from './photos.js';
import { estSauvegarde, lireSauvegarde } from './lecture.js';
import { photosDuPlan } from './chantier.js';
import { BASECACHE, COLCACHE, HELV, MC, PdfCtx, PdfPath, WINANSI, baselineOffset, buildPdf, deflateBytes, helvWidth, mkPath,
  parseColor, parseFont, pdfMeasure, pdfStr, pdfText16, pn, pn3, pn4, winAnsiBytes } from './pdf.js';

/* ============================================================
   CALQUE — export du plan : image PNG (copier, partager) et PDF
   vectoriel à l'échelle. Le PDF est écrit directement, sans
   bibliothèque : un contexte « canvas » factice enregistre le
   dessin du plan et le traduit en instructions PDF.
   ============================================================ */

/* ---------------- export : réglages et contenu ---------------- */
const EXP_DEF = { vue: '', unit: 'cm', fmt: 'png', lv: '', dims: true, names: true, areas: true, furn: true, elec: true, legend: true, title: true, bg: 'white', q: 'std', paper: 'A4', orient: 'auto', scale: 'auto' };
function expOpts() {
  if (!S.exp || typeof S.exp !== 'object') S.exp = {};
  for (const k in EXP_DEF) if (!(k in S.exp)) S.exp[k] = EXP_DEF[k];
  return S.exp;
}
function expLevels(o) {
  if (o.lv === 'all') return levelsSorted().filter((l) => contentBBox(l.id));
  const l = levelOf(o.lv) || levelOf(ui.lv);
  return l && contentBBox(l.id) ? [l] : [];
}
function unionBB(list) {
  const b = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  for (const x of list) if (x) { b.x0 = Math.min(b.x0, x.x0); b.y0 = Math.min(b.y0, x.y0); b.x1 = Math.max(b.x1, x.x1); b.y1 = Math.max(b.y1, x.y1); }
  return b;
}
function withExportLayers(o, fn) {
  const L = S.layers, save = Object.assign({}, L), dm = S.dimMode;
  L.ghost = false; L.grid = false; L.names = !!o.names; L.areas = !!o.areas; L.elec = !!o.elec; L.furn = !!o.furn;
  L.dims = !!o.dims;
  try { return fn(); } finally { Object.assign(L, save); S.dimMode = dm; }
}
function legendItems(ids) {
  const set = new Set(ids);
  const elecs = P.elec.filter((e) => set.has(e.lv) && elecVisible(e));
  const types = ELEC.filter((d) => elecs.some((e) => e.type === d.t)).map((d) => ({ d, n: elecs.filter((e) => e.type === d.t).length }));
  const ducts = [['vmc', 'Conduit de VMC'], ['elec', 'Gaine électrique']]
    .map(([sys, n]) => ({ sys, n, L: P.ducts.filter((d) => set.has(d.lv) && d.sys === sys && ductVisible(d)).reduce((a, d) => a + ductLen(d), 0) }))
    .filter((x) => x.L > 0);
  /* plan de câblage ou d'éclairage : couleurs des circuits et désignation des conducteurs, symbole des traits obliques */
  const circs = [];
  if (calqueVisible('circuits') && S.layers.circ !== false && P.circuits.length) {
    const nums = circNumbers(), cab = cablagePlan(P).circuits;
    for (const c of P.circuits) if (elecs.some((e) => e.cid === c.id)) circs.push({ circ: c, col: circuitColor(c.id, true), num: nums.get(c.id), des: (cab.get(c.id) || {}).desPrincipale || '' });
    circs.sort((a, b) => parseInt(a.num.slice(1), 10) - parseInt(b.num.slice(1), 10));
    if (circs.length && P.ducts.some((d) => set.has(d.lv) && d.sys === 'elec' && ductVisible(d))) circs.push({ traits: true });
  }
  return { types, ducts, circs, rows: types.length + ducts.length + circs.length };
}
/* une ligne de légende : symbole, nom, quantité (unités de l'écran courant) */
function drawLegendRow(c, row, x, y, w, rh, bg) {
  const u = rh * 0.62, fs = Math.max(5, rh * 0.36);
  if (row.circ || row.traits) {
    const yy = y + rh * 0.5;
    c.save(); c.lineCap = 'round';
    if (row.circ) { c.strokeStyle = row.col || LIGHT.elec; c.lineWidth = Math.max(0.8, rh * 0.14); c.beginPath(); c.moveTo(x + u * 0.1, yy); c.lineTo(x + u * 1.4, yy); c.stroke(); }
    else {
      c.strokeStyle = LIGHT.ink; c.lineWidth = Math.max(0.5, rh * 0.05); c.beginPath(); c.moveTo(x + u * 0.1, yy); c.lineTo(x + u * 1.4, yy);
      for (let i = 0; i < 3; i++) { const cx = x + u * (0.55 + i * 0.2); c.moveTo(cx - rh * 0.1, yy + rh * 0.16); c.lineTo(cx + rh * 0.1, yy - rh * 0.16); }
      c.stroke();
    }
    c.restore();
    c.textBaseline = 'middle'; c.fillStyle = LIGHT.ink; c.textAlign = 'left'; c.font = `500 ${fs}px ${FONT_UI}`;
    const qty = row.circ ? row.des : '';
    c.save(); c.font = `700 ${fs}px ${FONT_LABEL}`; const qw = qty ? c.measureText(qty).width : 0; c.restore();
    let name = row.circ ? `${row.num} · ${row.circ.name}` : 'Traits obliques : nombre de conducteurs'; const maxW = w - u * 1.9 - qw - fs;
    if (c.measureText(name).width > maxW) { while (name.length > 4 && c.measureText(name + '…').width > maxW) name = name.slice(0, -1); name += '…'; }
    c.fillText(name, x + u * 1.9, yy);
    if (qty) { c.textAlign = 'right'; c.font = `700 ${fs}px ${FONT_LABEL}`; c.fillText(qty, x + w, yy); c.textAlign = 'left'; }
    return;
  }
  if (row.d) {
    const d = row.d;
    c.save(); c.translate(x + u * 0.75, d.wall ? y + rh * 0.5 - u * 0.42 : y + rh * 0.5); c.scale(u, u);
    c.lineWidth = 1.5 / 26; c.strokeStyle = LIGHT.elec; c.lineJoin = 'round'; c.lineCap = 'round';
    d.draw(c, { px: 1 / 26, unit: u, ink: LIGHT.ink, ink2: LIGHT.ink2, bg, elec: LIGHT.elec, font: FONT_LABEL });
    c.restore();
  } else {
    const yy = y + rh * 0.5;
    c.save(); c.lineCap = 'round';
    if (row.sys === 'vmc') { c.strokeStyle = LIGHT.vmc; c.lineWidth = rh * 0.26; c.beginPath(); c.moveTo(x + u * 0.1, yy); c.lineTo(x + u * 1.4, yy); c.stroke(); c.strokeStyle = '#FFFFFF'; c.lineWidth = rh * 0.15; c.stroke(); }
    else { c.strokeStyle = LIGHT.gaine; c.lineWidth = Math.max(0.6, rh * 0.07); c.setLineDash([rh * 0.3, rh * 0.1, rh * 0.07, rh * 0.1]); c.beginPath(); c.moveTo(x + u * 0.1, yy); c.lineTo(x + u * 1.4, yy); c.stroke(); }
    c.restore();
  }
  c.textBaseline = 'middle';
  c.fillStyle = LIGHT.ink; c.textAlign = 'left'; c.font = `500 ${fs}px ${FONT_UI}`;
  const qty = row.d ? '× ' + row.n : fmtLenU(row.L);
  c.save(); c.font = `700 ${fs}px ${FONT_LABEL}`; const qw = c.measureText(qty).width; c.restore();
  let name = row.d ? row.d.n : row.n; const maxW = w - u * 1.9 - qw - fs;
  if (c.measureText(name).width > maxW) { while (name.length > 4 && c.measureText(name + '…').width > maxW) name = name.slice(0, -1); name += '…'; }
  c.fillText(name, x + u * 1.9, y + rh * 0.5);
  c.textAlign = 'right'; c.font = `700 ${fs}px ${FONT_LABEL}`; c.fillText(qty, x + w, y + rh * 0.5);
  c.textAlign = 'left';
}
function scaleBarLen(s, minPx, maxPx) {
  for (const L of [10, 20, 50, 100, 200, 500, 1000, 2000, 5000]) if (L * s >= minPx && L * s <= maxPx) return L;
  return 100;
}
function drawScaleBar(c, x, y, s, L, fs) {
  const w = L * s, hh = Math.max(2, fs * 0.38);
  c.save(); c.lineWidth = Math.max(0.5, fs * 0.08); c.strokeStyle = LIGHT.ink;
  for (let i = 0; i < 4; i++) { c.fillStyle = i % 2 ? '#FFFFFF' : LIGHT.ink; c.fillRect(x + (w / 4) * i, y, w / 4, hh); }
  c.strokeRect(x, y, w, hh);
  c.fillStyle = LIGHT.ink; c.font = `600 ${fs}px ${FONT_LABEL}`; c.textBaseline = 'alphabetic';
  c.textAlign = 'left'; c.fillText('0', x, y - fs * 0.35);
  c.textAlign = 'right'; c.fillText(fmtReal(L), x + w, y - fs * 0.35);
  c.restore();
}
const fmtReal = (cm) => (cm >= 100 ? NFc.format(cm / 100) + ' m' : NFc.format(cm) + ' cm');
const fmtDate = () => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date());
function levelsArea(lvs) { let s = 0; for (const L of lvs) for (const r of geo(L.id).rooms) s += r.area; return s; }

/* ---------------- image PNG ---------------- */
function composePNG(o, maxPx) {
  const lvs = expLevels(o); if (!lvs.length) return null;
  const ids = lvs.map((l) => l.id), U = unionBB(lvs.map((l) => contentBBox(l.id)));
  const pad = 70, Wcm = U.x1 - U.x0 + pad * 2, Hcm = U.y1 - U.y0 + pad * 2;
  const n = lvs.length, gap = 40;
  const leg = o.elec && o.legend ? legendItems(ids) : { types: [], ducts: [], rows: 0 };
  const legW = leg.rows ? 330 : 0, head = o.title ? 92 : 16, sub = n > 1 ? 34 : 0;
  const availW = Math.max(900, 1600 - legW), availH = 1100;
  const s = clamp(Math.min((availW - gap * (n - 1)) / (Wcm * n), availH / Hcm), 0.12, 2.4);
  const pw = Wcm * s, ph = Hcm * s;
  const cssW = Math.ceil(16 + pw * n + gap * (n - 1) + 16 + legW), cssH = Math.ceil(Math.max(head + sub + ph + 16, leg.rows * 38 + 120));
  let z = (o.q === 'hd' ? 4400 : 2400) / cssW;
  if (cssW * cssH * z * z > 15e6) z = Math.sqrt(15e6 / (cssW * cssH));
  if (maxPx) z = Math.min(z, maxPx / Math.max(cssW, cssH));
  z = clamp(z, 0.2, 6);
  const cvs = document.createElement('canvas'); cvs.width = Math.max(1, Math.round(cssW * z)); cvs.height = Math.max(1, Math.round(cssH * z));
  const c = cvs.getContext('2d');
  const transp = o.bg === 'transparent';
  const Cx = Object.assign({}, LIGHT, transp ? { paper: 'rgba(0,0,0,0)', halo: '#FFFFFF' } : {});
  if (!transp) { c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, cvs.width, cvs.height); }
  const prevRC = RC;
  try {
    withExportLayers(o, () => {
      lvs.forEach((L, i) => {
        const x0 = 16 + i * (pw + gap), y0 = head + sub;
        setRC({ ctx: c, w: cssW, h: cssH, dpr: z, s, ox: x0 + (pad - U.x0) * s, oy: y0 + (pad - U.y0) * s, px: 1 / s, C: Cx, ts: 1 });
        c.save(); setScreen(); c.beginPath(); c.rect(x0, y0, pw, ph); c.clip();
        drawScene(L.id, { export: true, furn: o.furn, dims: o.dims });
        c.restore();
        if (n > 1) { setScreen(); c.fillStyle = LIGHT.ink; c.font = `700 17px ${FONT_UI}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillText(L.name, x0 + 4, head + 22); }
      });
      setRC({ ctx: c, w: cssW, h: cssH, dpr: z, s, ox: 0, oy: 0, px: 1 / s, C: Cx, ts: 1 });
      setScreen();
      const planW = cssW - legW;
      if (o.title) {
        c.textBaseline = 'alphabetic'; c.textAlign = 'left'; c.fillStyle = LIGHT.ink;
        const vt = o.vue && vueParId(o.vue);
        c.font = `700 26px ${FONT_UI}`; c.fillText((P.name || 'Plan') + (vt ? ` — plan ${vt.n.toLowerCase()}` : ''), 24, 44);
        c.font = `500 15px ${FONT_UI}`; c.fillStyle = LIGHT.ink2;
        c.fillText(`${lvs.map((l) => l.name).join(' · ')} · ${fmtArea(levelsArea(lvs))} au sol · ${fmtDate()}`, 24, 70);
        const L = scaleBarLen(s, 70, 220);
        drawScaleBar(c, planW - 32 - L * s, 60, s, L, 13);
      }
      if (leg.rows) {
        const x0 = planW;
        if (!transp) { c.fillStyle = '#F4F5F2'; c.fillRect(x0, 0, legW, cssH); }
        c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = LIGHT.ink; c.font = `700 17px ${FONT_UI}`;
        c.fillText('Légende électrique', x0 + 24, 44);
        let y = 72;
        for (const r of leg.types) { drawLegendRow(c, r, x0 + 22, y, legW - 46, 38, transp ? '#FFFFFF' : '#F4F5F2'); y += 38; }
        for (const r of leg.ducts) { drawLegendRow(c, r, x0 + 22, y, legW - 46, 38, '#F4F5F2'); y += 38; }
        for (const r of leg.circs || []) { drawLegendRow(c, r, x0 + 22, y, legW - 46, 38, '#F4F5F2'); y += 38; }
      }
    });
  } finally { setRC(prevRC); }
  return { cvs, lvs };
}

/* ---------------- PDF à l'échelle ---------------- */
const PAPERS = { A4: [595.28, 841.89], A3: [841.89, 1190.55] };
const SCALES = [20, 25, 50, 100, 200, 500, 1000];
const PT_CM = 72 / 2.54;
function pdfLayout(o) {
  const lvs = expLevels(o); if (!lvs.length) return null;
  const ids = lvs.map((l) => l.id), U = unionBB(lvs.map((l) => contentBBox(l.id)));
  const padCm = 55, Wcm = U.x1 - U.x0 + padCm * 2, Hcm = U.y1 - U.y0 + padCm * 2;
  const leg = o.elec && o.legend ? legendItems(ids) : { types: [], ducts: [], rows: 0 };
  const hasSide = o.title || leg.rows > 0;
  const [pw, ph] = PAPERS[o.paper] || PAPERS.A4;
  const mk = (land) => {
    const W = land ? ph : pw, H = land ? pw : ph, M = 22;
    const frame = { x: M, y: M, w: W - 2 * M, h: H - 2 * M };
    let plan, side = null;
    if (!hasSide) plan = { x: frame.x + 8, y: frame.y + 8, w: frame.w - 16, h: frame.h - 16 };
    else if (land) { const sw = o.paper === 'A3' ? 200 : 170; side = { x: frame.x + frame.w - sw, y: frame.y, w: sw, h: frame.h }; plan = { x: frame.x + 8, y: frame.y + 8, w: frame.w - sw - 16, h: frame.h - 16 }; }
    else { const sh = leg.rows ? (o.paper === 'A3' ? 190 : 160) : 86; side = { x: frame.x, y: frame.y + frame.h - sh, w: frame.w, h: sh }; plan = { x: frame.x + 8, y: frame.y + 8, w: frame.w - 16, h: frame.h - sh - 16 }; }
    return { W, H, frame, plan, side, land, fit: Math.min(plan.w / Wcm, plan.h / Hcm) };
  };
  let page;
  if (o.orient === 'portrait') page = mk(false);
  else if (o.orient === 'landscape') page = mk(true);
  else { const a = mk(true), b = mk(false); page = b.fit > a.fit * 1.04 ? b : a; }
  const fitsAt = (N) => Wcm * PT_CM / N <= page.plan.w + 0.01 && Hcm * PT_CM / N <= page.plan.h + 0.01;
  let N, fitted = false;
  if (o.scale === 'auto') { N = SCALES.find(fitsAt); if (!N) { fitted = true; N = PT_CM / page.fit; } }
  else N = +o.scale || 100;
  const k = fitted ? page.fit : PT_CM / N;
  return { lvs, ids, U, leg, page, N, k, fitted, fits: fitted || fitsAt(N) };
}
function drawPdfPage(c, lay, L, idx, dpr) {
  const { page, k } = lay, { frame, plan, side } = page, o = expOpts();
  const prevRC = RC;
  try {
    setRC({ ctx: c, w: page.W, h: page.H, dpr, s: k, ox: 0, oy: 0, px: 0.62 / k, C: LIGHT, ts: 0.62 });
    setScreen(); c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, page.W, page.H);
    RC.ox = plan.x + plan.w / 2 - ((lay.U.x0 + lay.U.x1) / 2) * k;
    RC.oy = plan.y + plan.h / 2 - ((lay.U.y0 + lay.U.y1) / 2) * k;
    withExportLayers(o, () => {
      c.save(); setScreen(); c.beginPath(); c.rect(plan.x, plan.y, plan.w, plan.h); c.clip();
      drawScene(L.id, { export: true, furn: o.furn, dims: o.dims });
      c.restore();
    });
    setScreen();
    c.strokeStyle = LIGHT.ink; c.lineWidth = 0.9; c.setLineDash([]); c.strokeRect(frame.x, frame.y, frame.w, frame.h);
    if (!side) return;
    c.lineWidth = 0.6; c.beginPath();
    if (page.land) { c.moveTo(side.x, side.y); c.lineTo(side.x, side.y + side.h); } else { c.moveTo(side.x, side.y); c.lineTo(side.x + side.w, side.y); }
    c.stroke();
    // cartouche
    const cw = page.land ? side.w : Math.min(196, side.w * 0.4);
    const ch = o.title ? 142 : 0;
    const cx = page.land ? side.x : side.x + side.w - cw, cy = page.land ? side.y + side.h - ch : side.y;
    if (o.title) {
      if (!page.land) { c.beginPath(); c.moveTo(cx, side.y); c.lineTo(cx, side.y + side.h); c.stroke(); }
      else { c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + cw, cy); c.stroke(); }
      const x = cx + 10, w = cw - 20; let y = cy + 18;
      c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = LIGHT.ink;
      c.font = `700 11px ${FONT_UI}`; let t = P.name || 'Plan';
      while (t.length > 4 && c.measureText(t).width > w) t = t.slice(0, -2) + '…';
      c.fillText(t, x, y); y += 13;
      c.font = `600 9px ${FONT_UI}`; c.fillStyle = LIGHT.ink2; c.fillText(L.name, x, y); y += 9;
      const rows = [
        ...(o.vue && vueParId(o.vue) ? [['Plan', vueParId(o.vue).n]] : []),
        ['Échelle', lay.fitted ? 'ajustée à la page' : '1:' + lay.N],
        ['Format', `${o.paper} ${page.land ? 'paysage' : 'portrait'}`],
        ['Surface', fmtArea(levelsArea([L]))],
        ['Date', fmtDate()],
        ['Page', `${idx + 1} / ${lay.lvs.length}`],
      ];
      c.font = `500 7.5px ${FONT_UI}`;
      for (const [a, b] of rows) {
        y += 11.5; c.fillStyle = LIGHT.ink2; c.textAlign = 'left'; c.fillText(a, x, y);
        c.fillStyle = LIGHT.ink; c.textAlign = 'right'; c.font = `600 7.5px ${FONT_UI}`; c.fillText(b, x + w, y); c.font = `500 7.5px ${FONT_UI}`;
      }
      if (!lay.fitted) { const Lb = scaleBarLen(k, 40, w * 0.8); drawScaleBar(c, x, y + 16, k, Lb, 6.5); }
      c.textAlign = 'right'; c.fillStyle = LIGHT.ink2; c.font = `700 6px ${FONT_UI}`; c.fillText('CALQUE', x + w, cy + ch - 6);
      c.textAlign = 'left';
    }
    // légende (symboles du niveau de cette page)
    const legL = lay.lvs.length > 1 ? legendItems([L.id]) : lay.leg;
    if (lay.leg.rows && legL.rows) {
      const lx = page.land ? side.x + 10 : side.x + 10, ly = side.y + 10;
      const lw = page.land ? side.w - 20 : side.w - (o.title ? cw : 0) - 20;
      const lh = page.land ? side.h - ch - 20 : side.h - 20;
      c.fillStyle = LIGHT.ink2; c.font = `700 6.5px ${FONT_UI}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillText('LÉGENDE', lx, ly + 6);
      const all = [...legL.types, ...legL.ducts, ...(legL.circs || [])];
      const avail = lh - 14;
      let rh = 13, cols = 1;
      if (page.land) rh = clamp(avail / all.length, 8, 13);
      else { cols = Math.max(1, Math.floor(lw / 150)); rh = clamp(avail / Math.ceil(all.length / cols), 8, 13); }
      const perCol = Math.max(1, Math.floor(avail / rh)), colW = lw / cols;
      all.slice(0, perCol * cols).forEach((r, i) => {
        const col = Math.floor(i / perCol), row = i % perCol;
        drawLegendRow(c, r, lx + col * colW, ly + 12 + row * rh, colW - (cols > 1 ? 10 : 0), rh, '#FFFFFF');
      });
      if (all.length > perCol * cols) { c.fillStyle = LIGHT.ink2; c.font = `500 6px ${FONT_UI}`; c.fillText(`+ ${all.length - perCol * cols} autres symboles`, lx, ly + 12 + perCol * rh + 6); }
    }
  } finally { setRC(prevRC); }
}
/* plan d'un niveau dans une zone de page (moteur documentaire) : échelle normalisée si possible, légende à droite.
   Renvoie null si le niveau est vide, sinon { echelle } (texte du cartouche). */
function dessinerPlanZone(c, zone, L, opts) {
  /* plan d'une vue (« Plans électriques ») : la vue est appliquée le temps du dessin, puis l'affichage est rétabli */
  if (opts && opts.vue) { const v = opts.vue; return avecVue(v, () => dessinerPlanZone(c, zone, L, Object.assign({}, opts, { vue: null, furn: S.layers.furn, dims: S.layers.dims }))); }
  const bb = contentBBox(L.id); if (!bb) return null;
  const o = Object.assign({}, expOpts(), { elec: true, legend: true, title: false }, opts || {});
  const leg = legendItems([L.id]), all = [...leg.types, ...leg.ducts, ...(leg.circs || [])];
  const legW = all.length ? Math.min(160, zone.w * 0.26) : 0;
  const plan = { x: zone.x + 4, y: zone.y + 4, w: zone.w - legW - 8, h: zone.h - 8 };
  const padCm = 40, Wcm = bb.x1 - bb.x0 + padCm * 2, Hcm = bb.y1 - bb.y0 + padCm * 2;
  const fitsAt = (N) => Wcm * PT_CM / N <= plan.w + 0.01 && Hcm * PT_CM / N <= plan.h + 0.01;
  let N = SCALES.find(fitsAt), fitted = false, k;
  if (N) k = PT_CM / N; else { fitted = true; k = Math.min(plan.w / Wcm, plan.h / Hcm); }
  const prevRC = RC;
  try {
    setRC({ ctx: c, w: c.W, h: c.H, dpr: 1, s: k, ox: plan.x + plan.w / 2 - ((bb.x0 + bb.x1) / 2) * k, oy: plan.y + plan.h / 2 - ((bb.y0 + bb.y1) / 2) * k, px: 0.62 / k, C: LIGHT, ts: 0.62 });
    withExportLayers(o, () => {
      c.save(); setScreen(); c.beginPath(); c.rect(plan.x, plan.y, plan.w, plan.h); c.clip();
      drawScene(L.id, { export: true, furn: o.furn, dims: o.dims, chantier: !!o.chantier });
      c.restore();
    });
    setScreen();
    if (!fitted) { const Lb = scaleBarLen(k, 40, 120); drawScaleBar(c, plan.x + 6, plan.y + plan.h - 8, k, Lb, 6.5); }
    if (legW) {
      const lx = zone.x + zone.w - legW + 6, lw = legW - 10;
      c.strokeStyle = LIGHT.ink; c.lineWidth = 0.5; c.setLineDash([]); c.beginPath(); c.moveTo(lx - 6, zone.y); c.lineTo(lx - 6, zone.y + zone.h); c.stroke();
      c.fillStyle = LIGHT.ink2; c.font = `700 6.5px ${FONT_UI}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
      c.fillText('LÉGENDE', lx, zone.y + 12);
      const rh = clamp((zone.h - 24) / all.length, 8, 13), per = Math.max(1, Math.floor((zone.h - 24) / rh));
      all.slice(0, per).forEach((r, i) => drawLegendRow(c, r, lx, zone.y + 18 + i * rh, lw, rh, '#FFFFFF'));
      if (all.length > per) { c.fillStyle = LIGHT.ink2; c.font = `500 6px ${FONT_UI}`; c.fillText(`+ ${all.length - per} autres symboles`, lx, zone.y + 18 + per * rh + 6); }
    }
  } finally { setRC(prevRC); }
  return { echelle: fitted ? 'échelle ajustée à la page (ne pas mesurer)' : `Échelle 1:${N}`, N: fitted ? null : N };
}
async function composePDF(o) {
  const lay = pdfLayout(o); if (!lay) return null;
  const pages = lay.lvs.map((L, i) => { const ctx = new PdfCtx(lay.page.W, lay.page.H); drawPdfPage(ctx, lay, L, i, 1); return { W: lay.page.W, H: lay.page.H, ctx }; });
  return buildPdf(pages, P.name || 'Plan');
}

/* ---------------- DXF (AutoCAD) ---------------- */
/* Le plan est redessiné par le moteur 2D dans un contexte qui enregistre les traits : 1 unité du dessin = 1 cm du plan.
   Plusieurs niveaux : posés côte à côte, de gauche à droite, avec leur nom. Renvoie { texte, bilan, lvs } ou null. */
function composeDXF(o) {
  const lvs = expLevels(o); if (!lvs.length) return null;
  const c = new DxfCtx(), prevRC = RC, ecart = 300;
  try {
    withExportLayers(o, () => {
      let x = 0;
      lvs.forEach((L) => {
        const bb = contentBBox(L.id);
        c.dx = lvs.length > 1 ? x - bb.x0 : 0; c.dy = 0;
        setRC({ ctx: c, w: 1, h: 1, dpr: 1, s: 1, ox: 0, oy: 0, px: 1, C: LIGHT, ts: 1.15 });
        drawScene(L.id, { export: true, furn: o.furn, dims: o.dims });
        if (lvs.length > 1) {
          c.calque('TEXTES'); c.setTransform(1, 0, 0, 1, 0, 0);
          c.fillStyle = LIGHT.ink; c.font = `700 40px ${FONT_UI}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
          c.fillText(L.name, bb.x0, bb.y0 - 90);
          x += bb.x1 - bb.x0 + ecart;
        }
      });
    });
  } finally { setRC(prevRC); }
  const unite = DXF_UNITES[o.unit] ? o.unit : 'cm';
  return { texte: buildDxf(c.ent, { unite }), bilan: dxfBilan(c.ent), lvs, unite };
}

/* ---------------- SVG (vectoriel) ----------------
   Même principe que le DXF : 1 unité = 1 cm du plan ; niveaux côte à côte ; chaque élément porte le nom de son calque. */
function composeSVG(o) {
  const lvs = expLevels(o); if (!lvs.length) return null;
  const c = new SvgCtx(), prevRC = RC, ecart = 300, pad = 60;
  let x = 0, box = null;
  try {
    withExportLayers(o, () => {
      lvs.forEach((L) => {
        const bb = contentBBox(L.id), dx = lvs.length > 1 ? x - bb.x0 : 0;
        setRC({ ctx: c, w: 1, h: 1, dpr: 1, s: 1, ox: dx, oy: 0, px: 1, C: LIGHT, ts: 1.15 });
        drawScene(L.id, { export: true, furn: o.furn, dims: o.dims });
        const b = { x0: bb.x0 + dx - pad, y0: bb.y0 - pad - (lvs.length > 1 ? 80 : 0), x1: bb.x1 + dx + pad, y1: bb.y1 + pad };
        if (lvs.length > 1) {
          c.calque('TEXTES'); c.setTransform(1, 0, 0, 1, 0, 0);
          c.fillStyle = LIGHT.ink; c.font = `700 40px ${FONT_UI}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
          c.fillText(L.name, bb.x0 + dx, bb.y0 - 90);
        }
        box = box ? { x0: Math.min(box.x0, b.x0), y0: Math.min(box.y0, b.y0), x1: Math.max(box.x1, b.x1), y1: Math.max(box.y1, b.y1) } : b;
        x += bb.x1 - bb.x0 + ecart;
      });
    });
  } finally { setRC(prevRC); }
  const vt = o.vue && vueParId(o.vue);
  return { texte: c.svg(box, `${P.name || 'Plan'}${vt ? ' — plan ' + vt.n.toLowerCase() : ''}`), n: c.el.length, lvs };
}

/* ---------------- livrer un fichier : copier, partager, enregistrer ---------------- */
const CAN_SHARE_FILES = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.png', { type: 'image/png' })] })); } catch (e) { return false; } })();
async function saveFile(file) {
  const dl = await getDownloads();
  if (dl) { try { await dl.save({ filename: file.name, data: file }); return true; } catch (e) { if (e && e.code === 'declined') return true; } }
  return saveBlobLocal(file, file.name);
}
async function shareFile(file) {
  if (CAN_SHARE_FILES) {
    try { await navigator.share({ files: [file], title: file.name }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  return (await saveFile(file)) ? 'saved' : 'fail';
}
function copyImageBlob(blobOrPromise) {
  try {
    if (!navigator.clipboard || !navigator.clipboard.write || typeof ClipboardItem === 'undefined') return Promise.reject(new Error('clipboard'));
    return navigator.clipboard.write([new ClipboardItem({ 'image/png': blobOrPromise })]);
  } catch (e) { return Promise.reject(e); }
}
function afterShare(r, saved) {
  if (r === 'shared') toast('Fichier partagé.');
  else if (r === 'saved') toast(saved || 'Fichier enregistré.');
  else if (r === 'fail') toast('Impossible d’enregistrer le fichier ici.');
}
function fileActions(getFile, isImage, getBlobForCopy) {
  const out = [];
  if (isImage) out.push(btn('Copier l’image', () => {
    const b = getBlobForCopy();
    if (!b) { toast('Image en préparation…'); return; }
    copyImageBlob(b).then(() => toast('Image copiée : collez-la dans PowerPoint ou Keynote.'), () => toast('Copie impossible ici : utilisez « Partager » ou « Enregistrer ».'));
  }, 'pri exp-act', 'dup'));
  if (CAN_SHARE_FILES) out.push(btn('Partager…', async () => { const f = getFile(); if (!f) { toast('Fichier en préparation…'); return; } afterShare(await shareFile(f)); }, (isImage ? '' : 'pri ') + 'exp-act', 'up'));
  out.push(btn('Enregistrer', async () => { const f = getFile(); if (!f) { toast('Fichier en préparation…'); return; } afterShare((await saveFile(f)) ? 'saved' : 'fail'); }, (!isImage && !CAN_SHARE_FILES ? 'pri ' : '') + 'exp-act', 'down'));
  return out;
}
/* petite fenêtre pour une image déjà prête (tableau électrique, photo 3D) */
function openFileModal(title, file, note) {
  const isImg = /^image\//.test(file.type);
  const url = isImg ? URL.createObjectURL(file) : null;
  const prev = isImg ? h('div', { class: 'exp-prev' }, h('img', { src: url, alt: 'Aperçu' })) : null;
  openModal(title, prev, note ? h('p', { class: 'note' }, note) : null, btns(...fileActions(() => file, isImg && file.type === 'image/png', () => file)));
  $('#modal').classList.add('wide');
  if (url) setTimeout(() => URL.revokeObjectURL(url), 120000);
}

/* ---------------- fenêtre d'export du plan ---------------- */
const EXS = { gen: 0, file: null, blob: null, timer: 0 };
function openExport() {
  if (ui.view === '3d' && typeof photo3D === 'function') { photo3D(); return; }
  if (!P.levels.some((l) => contentBBox(l.id))) { toast('Le plan est vide : dessinez d’abord quelques murs.'); return; }
  const o = expOpts();
  if (o.lv !== 'all' || P.levels.length < 2) o.lv = ui.lv;
  if (!contentBBox(o.lv) && o.lv !== 'all') o.lv = (levelsSorted().find((l) => contentBBox(l.id)) || {}).id || ui.lv;
  openModal('Exporter le plan');
  $('#modal').classList.add('wide');
  renderExport();
}
function expChip(label, on, onclick) { return h('button', { type: 'button', class: 'chip', 'aria-pressed': String(!!on), onclick }, label); }
function renderExport() {
  const o = expOpts(), m = $('#modal'), body = m.querySelector('.mbody'); if (!body) return;
  const set = (k, v) => { o[k] = v; saveSettings(); renderExport(); };
  const tog = (k) => () => set(k, !o[k]);
  const lvChips = P.levels.length > 1
    ? [...levelsSorted().map((l) => expChip(l.name, o.lv === l.id, () => set('lv', l.id))), expChip(o.fmt === 'pdf' ? 'Tous (1 page par niveau)' : 'Tous côte à côte', o.lv === 'all', () => set('lv', 'all'))]
    : null;
  const lay = o.fmt === 'pdf' ? avecVue(o.vue || null, () => pdfLayout(o)) : null;
  let note;
  if (o.fmt === 'svg') note = 'Dessin vectoriel en vraie grandeur (1 unité = 1 centimètre), lisible par Illustrator, Inkscape, Affinity, les navigateurs… Chaque élément porte le nom de son calque.';
  if (o.fmt === 'svg') { /* note définie plus haut */ }
  else if (o.fmt === 'dxf') note = `Fichier pour AutoCAD, DraftSight, LibreCAD, ArchiCAD, Revit… Le dessin est en vraie grandeur : 1 unité = 1 ${({ mm: 'millimètre', cm: 'centimètre', m: 'mètre' })[o.unit] || 'centimètre'}. Les murs, ouvertures, appareils, cheminements, cotes et textes sont rangés dans des calques séparés. L’aperçu ci-dessus montre le contenu exporté.`;
  else if (o.fmt === 'png') note = 'Collez l’image directement dans PowerPoint, Keynote ou Google Slides. « Partager » l’envoie aussi vers Photos, Fichiers ou AirDrop.';
  else if (lay && !lay.fits) note = h('span', { style: 'color:var(--bad)' }, `Au 1:${lay.N}, le plan dépasse du ${o.paper} : choisissez un format plus grand ou une échelle plus petite.`);
  else if (lay && lay.fitted) note = 'Le plan est trop grand pour une échelle normalisée sur ce format : il est réduit pour tenir sur la page (ne pas mesurer à la règle).';
  else if (lay) note = `Échelle 1:${lay.N} : imprimez à 100 % (taille réelle), 1 cm sur le papier = ${fmtReal(lay.N)} en vrai.${o.lv === 'all' && lay.lvs.length > 1 ? ' Les niveaux ont le même cadrage : ils se superposent page à page.' : ''}`;
  const prevBox = $('#expPrev') || h('div', { class: 'exp-prev', id: 'expPrev' }, h('canvas', { id: 'expCv' }));
  prevBox.classList.toggle('chk', o.fmt === 'png' && o.bg === 'transparent');
  body.replaceChildren(...[
    segCtl([{ v: 'png', n: 'Image PNG' }, { v: 'pdf', n: 'PDF à l’échelle' }, { v: 'dxf', n: 'DXF (AutoCAD)' }, { v: 'svg', n: 'SVG' }], o.fmt, (v) => set('fmt', v)),
    sec('Plan', h('div', { class: 'chips' }, expChip('Affichage actuel', !o.vue, () => set('vue', '')), VUES.map((v) => expChip(v.n, o.vue === v.id, () => set('vue', v.id))))),
    prevBox,
    lvChips ? sec('Niveau', h('div', { class: 'chips' }, lvChips)) : null,
    sec('Contenu', h('div', { class: 'chips' },
      expChip('Cotes', o.dims, tog('dims')), expChip('Noms des pièces', o.names, tog('names')), expChip('Surfaces', o.areas, tog('areas')),
      expChip('Mobilier', o.furn, tog('furn')), expChip('Électricité', o.elec, tog('elec')),
      o.elec && o.fmt !== 'dxf' && o.fmt !== 'svg' ? expChip('Légende', o.legend, tog('legend')) : null, o.fmt === 'dxf' || o.fmt === 'svg' ? null : expChip(o.fmt === 'pdf' ? 'Cartouche' : 'Titre et échelle', o.title, tog('title')))),
    o.fmt === 'svg' ? null : o.fmt === 'dxf' ? sec('Unité du dessin', segCtl([{ v: 'mm', n: 'Millimètres' }, { v: 'cm', n: 'Centimètres' }, { v: 'm', n: 'Mètres' }], DXF_UNITES[o.unit] ? o.unit : 'cm', (v) => set('unit', v)))
    : o.fmt === 'png'
      ? h('div', { class: 'row' },
        sec('Fond', segCtl([{ v: 'white', n: 'Blanc' }, { v: 'transparent', n: 'Transparent' }], o.bg, (v) => set('bg', v))),
        sec('Qualité', segCtl([{ v: 'std', n: 'Standard' }, { v: 'hd', n: 'Haute' }], o.q, (v) => set('q', v))))
      : [h('div', { class: 'row' },
        sec('Papier', segCtl([{ v: 'A4', n: 'A4' }, { v: 'A3', n: 'A3' }], o.paper, (v) => set('paper', v))),
        sec('Orientation', segCtl([{ v: 'auto', n: 'Auto' }, { v: 'portrait', n: 'Portrait' }, { v: 'landscape', n: 'Paysage' }], o.orient, (v) => set('orient', v)))),
      sec('Échelle', segCtl([{ v: 'auto', n: lay && o.scale === 'auto' ? (lay.fitted ? 'Ajustée' : `Auto (1:${lay.N})`) : 'Auto' }, { v: '50', n: '1:50' }, { v: '100', n: '1:100' }, { v: '200', n: '1:200' }], String(o.scale), (v) => set('scale', v)))],
    h('p', { class: 'note' }, note),
    o.fmt === 'dxf' ? h('p', { class: 'note', id: 'expDxfInfo' }, '') : null,
    h('div', { class: 'btns exp-btns' }, fileActions(() => EXS.file, o.fmt === 'png', () => EXS.blob || EXS.blobP)),
  ].flat().filter(Boolean));
  scheduleExport();
}
function scheduleExport() {
  const g = ++EXS.gen; EXS.file = null; EXS.blob = null; EXS.blobP = null;
  for (const b of $$('.exp-act')) b.disabled = true;
  clearTimeout(EXS.timer);
  EXS.timer = setTimeout(() => runExport(g), 60);
}
async function runExport(g) {
  const o = expOpts(), cv2 = $('#expCv'); if (!cv2 || g !== EXS.gen) return;
  const base = `${slug(P.name)}-${o.vue && vueParId(o.vue) ? slug(vueParId(o.vue).n) + '-' : ''}${o.lv === 'all' ? 'niveaux' : slug((levelOf(o.lv) || {}).name)}`;
  const box = cv2.parentElement, bw = Math.max(200, box.clientWidth - 2), bh = 280;
  try {
    const V = (fn) => avecVue(o.vue || null, fn); // vue choisie (« Plans électriques »), appliquée le temps du dessin
    if (o.fmt === 'dxf' || o.fmt === 'svg') {
      /* aperçu : la même composition que l'image, sans titre ni légende */
      const out = V(() => composePNG(Object.assign({}, o, { title: false, legend: false, bg: 'white', q: 'std' }), 1200)); if (!out) return;
      const ar = out.cvs.width / out.cvs.height, w = Math.min(bw, bh * ar), hgt = w / ar, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv2.width = Math.round(w * dpr); cv2.height = Math.round(hgt * dpr); cv2.style.width = w + 'px'; cv2.style.height = hgt + 'px';
      const pc = cv2.getContext('2d'); pc.imageSmoothingQuality = 'high'; pc.drawImage(out.cvs, 0, 0, cv2.width, cv2.height);
      out.cvs.width = out.cvs.height = 0;
      await new Promise((r) => setTimeout(r, 0));
      if (g !== EXS.gen) return;
      if (o.fmt === 'svg') {
        const d = V(() => composeSVG(o)); if (!d) return;
        EXS.file = new File([d.texte], base + '.svg', { type: 'image/svg+xml' });
        for (const b of $$('.exp-act')) b.disabled = false;
        return;
      }
      const d = V(() => composeDXF(o)); if (!d) return;
      /* type accepté par le menu de partage de l'iPad : « application/dxf » n'y est pas toujours connu */
      let typ = 'application/dxf';
      for (const t of ['application/dxf', 'image/vnd.dxf', 'text/plain']) { try { if (navigator.canShare && navigator.canShare({ files: [new File(['x'], 'x.dxf', { type: t })] })) { typ = t; break; } } catch (e) { } }
      EXS.file = new File([dxfOctets(d.texte)], base + '.dxf', { type: typ });
      const info = $('#expDxfInfo');
      if (info) info.textContent = `${NFc.format(d.bilan.total)} objets (${NFc.format(d.bilan.traits)} traits, ${NFc.format(d.bilan.cercles)} cercles, ${NFc.format(d.bilan.textes)} textes) dans ${Object.keys(d.bilan.calques).length} calques · ${NF1.format(d.texte.length / 1024)} Ko`;
    } else if (o.fmt === 'png') {
      let res; EXS.blobP = new Promise((r) => (res = r));
      const out = V(() => composePNG(o)); if (!out) return;
      const ar = out.cvs.width / out.cvs.height, w = Math.min(bw, bh * ar), hgt = w / ar, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv2.width = Math.round(w * dpr); cv2.height = Math.round(hgt * dpr); cv2.style.width = w + 'px'; cv2.style.height = hgt + 'px';
      const pc = cv2.getContext('2d'); pc.clearRect(0, 0, cv2.width, cv2.height); pc.imageSmoothingQuality = 'high'; pc.drawImage(out.cvs, 0, 0, cv2.width, cv2.height);
      const blob = await new Promise((r) => out.cvs.toBlob(r, 'image/png'));
      out.cvs.width = out.cvs.height = 0;
      res(blob);
      if (g !== EXS.gen || !blob) return;
      EXS.blob = blob; EXS.file = new File([blob], base + '.png', { type: 'image/png' });
    } else {
      const lay = V(() => pdfLayout(o)); if (!lay) return;
      const ar = lay.page.W / lay.page.H, w = Math.min(bw, bh * ar), hgt = w / ar, dpr = Math.min(2, window.devicePixelRatio || 1);
      cv2.width = Math.round(w * dpr); cv2.height = Math.round(hgt * dpr); cv2.style.width = w + 'px'; cv2.style.height = hgt + 'px';
      V(() => drawPdfPage(cv2.getContext('2d'), lay, lay.lvs[0], 0, (w * dpr) / lay.page.W));
      await new Promise((r) => setTimeout(r, 0));
      if (g !== EXS.gen) return;
      const blob = await V(() => composePDF(o));
      if (g !== EXS.gen || !blob) return;
      EXS.file = new File([blob], base + '.pdf', { type: 'application/pdf' });
    }
    for (const b of $$('.exp-act')) b.disabled = false;
  } catch (err) { console.error(err); toast('Impossible de préparer l’export.'); }
  finally { requestRender(); }
}

/* fichier prêt à envoyer : le menu de partage de l'iPad (AirDrop, Mail, Messages, Fichiers) si possible, sinon téléchargement */
function shareableFile(data, name) {
  for (const type of ['application/json', 'text/plain']) {
    const f = new File([data], name, { type });
    try { if (navigator.canShare && navigator.canShare({ files: [f] })) return { file: f, share: true }; } catch (e) { }
  }
  return { file: new File([data], name, { type: 'application/json' }), share: false };
}
/* taille lisible d'un fichier */
function taille(o) { return o >= 1048576 ? NF1.format(o / 1048576) + ' Mo' : NF1.format(o / 1024) + ' Ko'; }
/* data : texte, ou Blob (sauvegarde complète assemblée par morceaux) */
function deliverFile(title, data, name, note, fait) {
  const { file, share } = shareableFile(data, name);
  const copyBox = () => {
    if (typeof data !== 'string') { toast('Enregistrement impossible ici : utilisez « Envoyer… » (menu de partage de l’iPad).'); return; }
    const ta = h('textarea', { class: 'txt', style: 'height:160px;padding:8px;font-family:var(--f-num);font-size:12px', readonly: true }, data);
    openModal(title, h('p', { class: 'note' }, 'Copiez ce texte et collez-le dans un fichier .json pour le conserver.'), ta,
      btns(btn('Copier', () => { navigator.clipboard && navigator.clipboard.writeText(data).then(() => toast('Copié.'), () => { ta.select(); toast('Sélectionné : copiez avec Ctrl+C.'); }); }, 'pri')));
  };
  openModal(title,
    h('p', null, h('b', null, name), ' · ', taille(typeof data === 'string' ? data.length : data.size)),
    h('p', { class: 'note' }, note),
    btns(
      share ? btn('Envoyer…', async () => {
        try { await navigator.share({ files: [file], title: name }); closeModal(); toast('Fichier envoyé.'); if (fait) fait(); }
        catch (e) { if (!(e && e.name === 'AbortError')) toast('Partage impossible : utilisez « Enregistrer ».'); }
      }, 'pri', 'up') : null,
      btn('Enregistrer', async () => { if (await saveFile(file)) { closeModal(); toast('Fichier enregistré.'); if (fait) fait(); } else copyBox(); }, share ? '' : 'pri', 'down')));
}
async function exportJSON() {
  /* photos du chantier jointes (images enregistrées sur l'appareil, hors du plan) : champ ignoré par les anciennes versions */
  const ids = photosDuPlan(P), photos = ids.length ? await exporterPhotos(ids) : [];
  const data = JSON.stringify(Object.assign({ format: 'calque-plan', version: 1 }, P, photos.length ? { photosJointes: photos } : {}));
  deliverFile('Envoyer le plan', data, `${slug(P.name)}.calque.json`,
    'Ce fichier contient tout le plan (murs, mobilier, électricité, tableau' + (photos.length ? `, ${photos.length} photo${photos.length > 1 ? 's' : ''} du chantier` : '') + '). Il se rouvre dans Calque sur n’importe quel appareil : menu … > Importer un fichier.');
}
/* sauvegarde complète : tous les plans de l'appareil dans un seul fichier */
async function exportAll() {
  await saveNow();
  const list = (await listProjects()).filter((p) => !(ui.isExample && P && p.id === P.id));
  const plans = [];
  for (const p of list) {
    const r = P && p.id === P.id ? { plan: JSON.parse(snapshot()), savedAt: ui.savedAt } : await loadProject(p.id);
    if (r) plans.push({ id: p.id, name: p.name, savedAt: r.savedAt || p.savedAt || 0, plan: r.plan });
  }
  if (!plans.length) { toast('Aucun plan enregistré à sauvegarder.'); return; }
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  /* « biblio » : références fabricant et composants personnalisés de l'appareil (ajouté en phase 2 ; ignoré par les anciennes versions) */
  /* « photos » (phase 7) : toutes les images du chantier enregistrées sur l'appareil (ignoré par les anciennes versions) */
  /* le fichier est assemblé par morceaux (en-tête, puis une photo par morceau) : même contenu qu'un JSON.stringify
     d'un seul tenant, sans grand texte en mémoire (iPad : beaucoup de photos de chantier) */
  const ph = await photosEnParties();
  const tete = JSON.stringify({ format: 'calque-backup', version: 1, createdAt: d.getTime(), plans, biblio: exportUserLib() });
  const parts = [tete.slice(0, -1) + ',"photos":['];
  ph.parts.forEach((b, i) => { if (i) parts.push(','); parts.push(b); });
  parts.push(']}');
  const data = new Blob(parts, { type: 'application/json' }), photos = { length: ph.n };
  deliverFile('Sauvegarder tous mes plans', data, `calque-sauvegarde-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.calque.json`,
    `${plans.length} plan${plans.length > 1 ? 's' : ''}${photos.length ? `, ${photos.length} photo${photos.length > 1 ? 's' : ''} du chantier` : ''}. Gardez ce fichier dans Fichiers (iCloud Drive) ou envoyez-le par mail : il permet de tout retrouver, même sur un autre iPad. À l’import, aucun plan existant n’est écrasé.`, sauvegardeFaite);
}
const isPlanObj = (o) => o && typeof o === 'object' && Array.isArray(o.walls) && Array.isArray(o.nodes);
/* import d'une sauvegarde complète : n'écrase jamais un plan existant */
async function importBackup(o, photosDeja) {
  await saveNow();
  const have = new Map((await listProjects()).map((p) => [p.id, p]));
  let added = 0, same = 0, copies = 0;
  for (const x of o.plans) {
    if (!x || !isPlanObj(x.plan)) continue;
    const plan = migratePlan(x.plan).plan; delete plan.format; delete plan.version; delete plan.id;
    const json = JSON.stringify(plan);
    let id = typeof x.id === 'string' && x.id ? x.id : uid('p');
    if (have.has(id)) {
      const r = await loadProject(id);
      if (r) { const cur = Object.assign({}, r.plan); delete cur.id; if (JSON.stringify(cur) === json) { same++; continue; } }
      id = uid('p'); plan.name = (plan.name || 'Plan') + ' (importé)'; copies++;
    } else added++;
    const res = await writePlanLocal(id, plan.name || 'Plan', x.savedAt || Date.now(), JSON.stringify(plan));
    if (!res.idb && !res.ls) { notifySaveFail(); break; }
    await addVersion(id, plan.name || 'Plan', JSON.stringify(plan), 'Importé d’une sauvegarde');
  }
  if (P) lsSet('calque.cur', P.id);
  const parts = [];
  const lib = o.biblio ? await importUserLib(o.biblio) : null;
  if (lib && lib.refs.added) parts.push(`${lib.refs.added} référence${lib.refs.added > 1 ? 's' : ''} fabricant ajoutée${lib.refs.added > 1 ? 's' : ''}`);
  if (lib && lib.refs.kept) parts.push(`${lib.refs.kept} référence${lib.refs.kept > 1 ? 's' : ''} différente${lib.refs.kept > 1 ? 's' : ''} ignorée${lib.refs.kept > 1 ? 's' : ''} (la vôtre est gardée)`);
  if (lib && lib.comps.added + lib.comps.copies) { const n = lib.comps.added + lib.comps.copies; parts.push(`${n} composant${n > 1 ? 's' : ''} personnalisé${n > 1 ? 's' : ''} ajouté${n > 1 ? 's' : ''}`); }
  if (lib && !lib.ok) parts.push('bibliothèque non enregistrée (stockage indisponible)');
  const ph = photosDeja || (Array.isArray(o.photos) && o.photos.length ? await importerPhotos(o.photos) : null);
  if (ph && ph.added) parts.push(`${ph.added} photo${ph.added > 1 ? 's' : ''} ajoutée${ph.added > 1 ? 's' : ''}`);
  if (ph && !ph.ok) parts.push('certaines photos n’ont pas pu être enregistrées');
  if (added) parts.push(`${added} plan${added > 1 ? 's' : ''} ajouté${added > 1 ? 's' : ''}`);
  if (copies) parts.push(`${copies} en copie (un plan du même nom existait déjà et n’a pas été modifié)`);
  if (same) parts.push(`${same} déjà à jour`);
  toast(parts.length ? 'Sauvegarde importée : ' + parts.join(', ') + '.' : 'Aucun plan dans cette sauvegarde.');
  openProjects();
}
$('#fileIn').addEventListener('change', async (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = '';
  if (!f) return;
  /* sauvegarde complète : lue par morceaux, photos enregistrées au fil de la lecture (mémoire faible : lecture.js) */
  let complete = false; try { complete = await estSauvegarde(f); } catch (err) { complete = false; }
  if (complete) {
    toast('Lecture de la sauvegarde…');
    const ph = { added: 0, kept: 0, ok: true };
    let r;
    try { r = await lireSauvegarde(f, async (lot) => { const x = await importerPhotos(lot); ph.added += x.added; ph.kept += x.kept; if (!x.ok) ph.ok = false; }); }
    catch (err) { console.error(err); toast('Sauvegarde illisible (fichier incomplet ou abîmé) : aucun plan importé.'); return; }
    if (!Array.isArray(r.tete.plans)) { toast('Ce fichier n’est pas un plan Calque valide.'); return; }
    try { await importBackup(r.tete, ph); } catch (err) { console.error(err); toast('Import interrompu : vérifiez « Mes plans ».'); }
    return;
  }
  let o;
  try { o = JSON.parse(await f.text()); } catch (err) { toast('Ce fichier n’est pas un plan Calque valide.'); return; }
  try {
    if (o && o.format === 'calque-backup' && Array.isArray(o.plans)) { await importBackup(o); return; }
    if (!isPlanObj(o)) throw new Error('format');
    const jointes = o.photosJointes; delete o.photosJointes;
    delete o.format; delete o.version; delete o.id;
    if (Array.isArray(jointes) && jointes.length) { const r = await importerPhotos(jointes); if (!r.ok) toast('Certaines photos n’ont pas pu être enregistrées.'); }
    await saveNow();
    openPlan(o, uid('p'));
    scheduleSave();
    toast(`« ${P.name} » importé.`);
  } catch (err) { toast('Ce fichier n’est pas un plan Calque valide.'); }
});

export { composeDXF, composeSVG };
export { BASECACHE, CAN_SHARE_FILES, COLCACHE, EXP_DEF, EXS, HELV, MC, PAPERS, PT_CM, PdfCtx, PdfPath, SCALES, WINANSI,
  afterShare, baselineOffset, buildPdf, composePDF, composePNG, copyImageBlob, deflateBytes, deliverFile,
  dessinerPlanZone, drawLegendRow, drawPdfPage, drawScaleBar, expChip, expLevels, expOpts, exportAll, exportJSON, fileActions, fmtDate,
  fmtReal, helvWidth, importBackup, isPlanObj, legendItems, levelsArea, mkPath, openExport, openFileModal, parseColor,
  parseFont, pdfLayout, pdfMeasure, pdfStr, pdfText16, pn, pn3, pn4, renderExport, runExport, saveFile, scaleBarLen,
  scheduleExport, shareFile, shareableFile, unionBB, winAnsiBytes, withExportLayers };

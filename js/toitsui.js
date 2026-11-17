/* Calque — module « toitsui » : outil « Toit / sol » (toit, terrasse ou dalle sans murs), panneau d'un toit ou d'une
   terrasse, panneaux solaires sur un pan, dessin sur le plan ; murs inclinés (dessin du haut du mur, section du panneau).
   Les calculs sont dans toits.js (sans écran). Module JavaScript natif (aucune compilation). */
import { EXT, IDX, P, S, isNum, levelOf, ui, uid } from './noyau.js';
import { geo } from './geometrie.js';
import { RC, V } from './rendu2d.js';
import { commit, cv, requestRender, snapPoint } from './interaction.js';
import { body, btn, btns, chipRow, deleteSel, fmtIn, h, inspHead, kv, numField, renderInspector, row, sec, segCtl, setTool, textField, toast, updateHint } from './interface.js';
import { SRC_PISCINE, V1, V2, appareilsDansVolumes, bassin, estBassin } from './piscine.js';
import { ELEC_BY } from './symboles.js';
import { makeElecFromDef, placeElecAt } from './interaction.js';
import { FORMES, MODULES_PV, ORIGINE_PV, TERR_MATS, TOIT_MATS, aireSurface, baseDe, calepinage, dedans, decalageHaut, distBords, epDe, estToit,
  formeDe, hauteurFaitage, inclDe, inclPourA, orientation, pansToit, penteDe, rampant } from './toits.js';

const TOIT_C = '#8A5A3C', TERR_C = '#7C6A4E', PV_C = '#1F3A6B';
const fmtM2 = (cm2) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(cm2 / 1e4) + ' m²';
const N1 = (v) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v);
const centre = (pts) => pts.reduce((a, p) => ({ x: a.x + p.x / pts.length, y: a.y + p.y / pts.length }), { x: 0, y: 0 });
const chemin = (c, pts) => { c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) c.lineTo(p.x, p.y); c.closePath(); };
function nomSurface(s) {
  if (s.name) return s.name;
  if (estToit(s)) return 'Toit ' + (formeDe(s) === 'plat' ? 'plat' : FORMES[formeDe(s)].toLowerCase().replace(' (appentis)', '').replace(' (croupes)', '') + ' ' + N1(penteDe(s)) + '°');
  return 'Terrasse';
}

/* ---------------- dessin sur le plan ---------------- */
/* terrasse : sous les murs (surface hachurée en lames) ; toit : au-dessus du plan (contour, faîtage, arêtiers, pente) */
EXT.under.push((c, lv) => {
  const px = RC.px;
  for (const s of P.surfaces || []) {
    if (s.lv !== lv || s.kind !== 'terrasse' || s.pts.length < 3) continue;
    const sel = ui.sel && ui.sel.t === 'surface' && ui.sel.id === s.id, col = (TERR_MATS[s.mat] || TERR_MATS.bois).coul;
    c.save(); c.globalAlpha = s.masque ? 0.35 : 1;
    chemin(c, s.pts); c.fillStyle = col + '33'; c.fill();
    c.save(); chemin(c, s.pts); c.clip();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of s.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    const a = (isNum(s.sens) ? s.sens : 0) * Math.PI / 180, d = { x: Math.cos(a), y: Math.sin(a) }, n = { x: -d.y, y: d.x }, R = Math.hypot(x1 - x0, y1 - y0), m = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
    c.beginPath(); const pas = s.mat === 'bois' || s.mat === 'composite' || !s.mat ? 14 : 50;
    for (let k = -R; k <= R; k += pas) { c.moveTo(m.x + n.x * k - d.x * R, m.y + n.y * k - d.y * R); c.lineTo(m.x + n.x * k + d.x * R, m.y + n.y * k + d.y * R); }
    c.strokeStyle = col + '88'; c.lineWidth = 0.8 * px; c.stroke(); c.restore();
    chemin(c, s.pts); c.strokeStyle = TERR_C; c.lineWidth = (sel ? 2.4 : 1.4) * px; c.stroke();
    c.restore();
  }
});
EXT.top.push((c, lv, opts) => {
  const px = RC.px, exp = opts && opts.export;
  if (c.calque) c.calque('Toits');
  for (const s of P.surfaces || []) {
    if (s.lv !== lv || s.kind !== 'toit' || s.pts.length < 3) continue;
    const sel = ui.sel && ui.sel.t === 'surface' && ui.sel.id === s.id;
    c.save(); c.globalAlpha = s.masque && !sel ? 0.4 : 1;
    chemin(c, s.pts); c.setLineDash([8 * px, 5 * px]); c.strokeStyle = TOIT_C; c.lineWidth = (sel ? 2.4 : 1.4) * px; c.stroke(); c.setLineDash([]);
    /* arêtes intérieures (faîtage, arêtiers) : côtés des pans qui ne sont pas sur le contour */
    const pans = pansToit(s);
    c.beginPath();
    for (const pn of pans) for (let i = 0; i < pn.pts.length; i++) {
      const a = pn.pts[i], b = pn.pts[(i + 1) % pn.pts.length], m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      if (distBords(m, s.pts) > 2 && Math.hypot(b.x - a.x, b.y - a.y) > 2) { c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); }
    }
    c.strokeStyle = TOIT_C; c.lineWidth = 1.6 * px; c.stroke();
    /* sens de la pente : flèche vers le bas de chaque pan */
    for (const pn of pans) {
      if (!isNum(pn.sens)) continue;
      const m = centre(pn.pts), a = pn.sens * Math.PI / 180, L = 34 * px, d = { x: Math.cos(a), y: Math.sin(a) };
      c.beginPath(); c.moveTo(m.x - d.x * L / 2, m.y - d.y * L / 2); c.lineTo(m.x + d.x * L / 2, m.y + d.y * L / 2);
      c.moveTo(m.x + d.x * L / 2 - d.x * 8 * px - d.y * 5 * px, m.y + d.y * L / 2 - d.y * 8 * px + d.x * 5 * px); c.lineTo(m.x + d.x * L / 2, m.y + d.y * L / 2);
      c.lineTo(m.x + d.x * L / 2 - d.x * 8 * px + d.y * 5 * px, m.y + d.y * L / 2 - d.y * 8 * px - d.x * 5 * px);
      c.strokeStyle = TOIT_C; c.lineWidth = 1.3 * px; c.stroke();
    }
    /* panneaux solaires */
    if (s.pv) {
      const cp = calepinage(s);
      for (const q of cp.panneaux) { chemin(c, q); c.fillStyle = 'rgba(31,58,107,0.22)'; c.fill(); c.strokeStyle = PV_C; c.lineWidth = 1 * px; c.stroke(); }
    }
    if (!exp) {
      const m = centre(s.pts);
      c.font = `600 ${11 * px}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = TOIT_C;
      c.fillText(nomSurface(s), m.x, m.y + 26 * px);
    }
    if (sel && !exp) for (const q of s.pts) { c.beginPath(); c.arc(q.x, q.y, 5 * px, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = TOIT_C; c.lineWidth = 1.6 * px; c.stroke(); }
    c.restore();
  }
  /* terrasse sélectionnée : angles déplaçables */
  const ss = ui.sel && ui.sel.t === 'surface' && IDX.surfaces.get(ui.sel.id);
  if (ss && ss.kind === 'terrasse' && ss.lv === lv && !exp) for (const q of ss.pts) { c.beginPath(); c.arc(q.x, q.y, 5 * px, 0, Math.PI * 2); c.fillStyle = '#fff'; c.fill(); c.strokeStyle = TERR_C; c.lineWidth = 1.6 * px; c.stroke(); }
  /* murs inclinés : haut du mur en pointillés, décalé de h·tan(inclinaison) */
  if (c.calque) c.calque('Murs inclinés');
  const g = geo(lv);
  for (const wg of g.walls.values()) {
    const w = wg.w; if (!inclDe(w)) continue;
    const L = levelOf(w.lv), hh = w.h || (L && L.h) || 250, dx = decalageHaut(w, hh);
    const A = { x: wg.A.x + wg.n.x * dx, y: wg.A.y + wg.n.y * dx }, B = { x: wg.B.x + wg.n.x * dx, y: wg.B.y + wg.n.y * dx };
    c.save(); c.setLineDash([5 * px, 4 * px]); c.strokeStyle = '#6B5B95'; c.lineWidth = 1.3 * px;
    c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.moveTo(wg.A.x, wg.A.y); c.lineTo(A.x, A.y); c.moveTo(wg.B.x, wg.B.y); c.lineTo(B.x, B.y); c.stroke(); c.restore();
  }
});
/* sélection : contour (toit, terrasse) ou intérieur d'une terrasse ; intérieur d'un toit hors des pièces */
EXT.hitBas.push((p, tol, g) => {
  const L = P.surfaces || [];
  for (let i = L.length - 1; i >= 0; i--) { const s = L[i]; if (s.lv === ui.lv && s.pts.length >= 3 && distBords(p, s.pts) <= tol) return { t: 'surface', id: s.id }; }
  const dansPiece = g.rooms.some((r) => dedans(p, r.loop));
  for (let i = L.length - 1; i >= 0; i--) { const s = L[i]; if (s.lv === ui.lv && s.pts.length >= 3 && dedans(p, s.pts) && (s.kind === 'terrasse' || !dansPiece)) return { t: 'surface', id: s.id }; }
  return null;
});

/* ---------------- outil « Toit / sol » ---------------- */
const SD = { pts: [], cur: null };
function startSurface(kind) { SD.pts = []; SD.cur = null; if (kind) S.surfKind = kind; setTool('surface'); }
function ajouterSurface(kind, pts, extra) {
  const L = levelOf(ui.lv);
  const s = Object.assign({ id: uid('s'), lv: ui.lv, kind, pts: pts.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })) },
    kind === 'toit' ? { forme: '2pans', pente: 35, sens: 0, z: L ? L.h : 250, e: 25, mat: 'tuile' } : { z: 0, e: 15, mat: 'bois' }, extra || {});
  if (kind === 'toit') s.sens = sensFaitage(s.pts);
  if (!P.surfaces) P.surfaces = [];
  P.surfaces.push(s); IDX.surfaces.set(s.id, s);
  return s;
}
/* faîtage parallèle au plus long côté du contour */
function sensFaitage(pts) {
  let best = 0, bl = -1;
  for (let i = 0; i < pts.length; i++) { const a = pts[i], b = pts[(i + 1) % pts.length], l = Math.hypot(b.x - a.x, b.y - a.y); if (l > bl) { bl = l; best = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; } }
  return Math.round((((best % 180) + 180) % 180) * 10) / 10;
}
function finishSurface() {
  if (SD.pts.length < 3) { toast('Un contour a au moins 3 angles.'); return; }
  const kind = S.surfKind === 'toit' ? 'toit' : 'terrasse';
  const s = ajouterSurface(kind, SD.pts);
  SD.pts = []; SD.cur = null;
  setTool('select'); commit();
  ui.sel = { t: 'surface', id: s.id }; ui.inspOpen = true; renderInspector(); requestRender();
  toast(kind === 'toit' ? 'Toit ajouté : réglez sa forme et sa pente dans le panneau.' : 'Terrasse ajoutée : réglez sa hauteur et son revêtement dans le panneau.');
}
/* enveloppe convexe des murs du niveau, élargie du débord (cm) : toit posé d'un coup sur tout le niveau */
function enveloppeNiveau(lv, debord) {
  const g = geo(lv), P0 = [];
  for (const wg of g.walls.values()) for (const q of wg.poly || [wg.A, wg.B]) P0.push({ x: q.x, y: q.y });
  if (P0.length < 3) return null;
  P0.sort((a, b) => a.x - b.x || a.y - b.y);
  const cr = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x), lo = [], hi = [];
  for (const p of P0) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of P0.slice().reverse()) { while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  let H = lo.slice(0, -1).concat(hi.slice(0, -1));
  /* angles presque alignés retirés (contour simple) */
  H = H.filter((p, i) => { const a = H[(i - 1 + H.length) % H.length], b = H[(i + 1) % H.length]; return Math.abs(cr(a, p, b)) > 1e-3 * Math.hypot(b.x - a.x, b.y - a.y) * 100; });
  if (H.length < 3) return null;
  const d = debord || 0; if (!d) return H;
  /* décalage vers l'extérieur (polygone convexe, sens trigonométrique dans le repère Y vers le bas) */
  const n = H.length, out = [];
  for (let i = 0; i < n; i++) {
    const a = H[(i - 1 + n) % n], p = H[i], b = H[(i + 1) % n];
    const e1 = { x: p.x - a.x, y: p.y - a.y }, e2 = { x: b.x - p.x, y: b.y - p.y }, l1 = Math.hypot(e1.x, e1.y), l2 = Math.hypot(e2.x, e2.y);
    const n1 = { x: e1.y / l1, y: -e1.x / l1 }, n2 = { x: e2.y / l2, y: -e2.x / l2 }, k = 1 + n1.x * n2.x + n1.y * n2.y;
    out.push({ x: p.x + (n1.x + n2.x) * d / k, y: p.y + (n1.y + n2.y) * d / k });
  }
  return out;
}
function toitSurNiveau(lv) {
  const pts = enveloppeNiveau(lv, 40);
  if (!pts) { toast('Dessinez d’abord les murs de ce niveau.'); return; }
  const s = ajouterSurface('toit', pts);
  commit(); ui.sel = { t: 'surface', id: s.id }; ui.inspOpen = true; renderInspector(); requestRender();
  toast('Toit à deux pans posé sur les murs du niveau (débord de 40 cm).');
}
EXT.tools.surface = {
  down(wp, sp) {
    let moved = false;
    return {
      move(wp2, sp2) { if (Math.hypot(sp2.x - sp.x, sp2.y - sp.y) > 10) moved = true; },
      up(wp2) {
        if (moved) return;
        const first = SD.pts[0];
        if (first && SD.pts.length >= 3 && Math.hypot(wp2.x - first.x, wp2.y - first.y) * V.s < 22) { finishSurface(); return; }
        const q = snapPoint(wp2, { corners: true });
        SD.pts.push({ x: q.x, y: q.y }); updateHint(); requestRender(true);
      },
    };
  },
  hover(wp) { SD.cur = snapPoint(wp, { corners: true }); cv.style.cursor = 'crosshair'; },
};
EXT.hintKey.push(() => (ui.tool === 'surface' ? 's' + SD.pts.length + (S.surfKind || '') : ''));
EXT.hint.surface = () => [h('b', null, 'Toit / sol'),
  segCtl([{ v: 'toit', n: 'Toit' }, { v: 'terrasse', n: 'Terrasse, dalle' }], S.surfKind === 'toit' ? 'toit' : 'terrasse', (v) => { S.surfKind = v; updateHint(); }),
  h('span', { class: 'msg' }, SD.pts.length < 3 ? (S.surfKind === 'toit' ? 'Touchez les angles du toit (débord compris).' : 'Touchez les angles de la terrasse : un sol sans murs.') : 'Continuez, ou touchez le premier angle pour fermer.'),
  SD.pts.length ? btn('Retirer le dernier point', () => { SD.pts.pop(); updateHint(); requestRender(true); }, 'sm') : null,
  SD.pts.length >= 3 ? btn('Terminer', finishSurface, 'pri sm') : null,
  S.surfKind === 'toit' && !SD.pts.length ? btn('Toit sur tout le niveau', () => { setTool('select'); toitSurNiveau(ui.lv); }, 'sm') : null,
  btn('Annuler', () => { SD.pts = []; setTool('select'); }, 'sm')];
EXT.overlay.push((c, px) => {
  if (ui.tool !== 'surface' || !SD.pts.length) return;
  const pts = SD.cur ? [...SD.pts, SD.cur] : SD.pts, col = S.surfKind === 'toit' ? TOIT_C : TERR_C;
  c.strokeStyle = col; c.fillStyle = col + '22'; c.lineWidth = 2 * px;
  c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) c.lineTo(p.x, p.y); if (pts.length >= 3) { c.closePath(); c.fill(); } c.stroke();
  for (const p of SD.pts) { c.beginPath(); c.arc(p.x, p.y, 5 * px, 0, Math.PI * 2); c.fill(); c.stroke(); }
});

/* ---------------- panneau d'un toit ou d'une terrasse ---------------- */
const maj = (s, f) => (v) => { f(v); commit(); };
function inspSurface(s) {
  const L = levelOf(s.lv), toit = estToit(s), base = baseDe(s, L);
  const parts = [
    sec('Type', segCtl([{ v: 'toit', n: 'Toit' }, { v: 'terrasse', n: 'Terrasse ou dalle' }], s.kind, (v) => {
      if (v === s.kind) return;
      s.kind = v; delete s.z; delete s.e;
      if (v === 'toit') Object.assign(s, { forme: s.forme || '2pans', pente: isNum(s.pente) ? s.pente : 35, mat: TOIT_MATS[s.mat] ? s.mat : 'tuile' });
      else { delete s.pv; s.mat = TERR_MATS[s.mat] ? s.mat : 'bois'; }
      commit();
    })),
    sec('Nom', textField(null, s.name, (v) => { v = v.trim().slice(0, 60); if (v) s.name = v; else delete s.name; commit(); }, { id: 'f-sname', ph: toit ? 'ex. Toit de la maison' : 'ex. Terrasse sud' })),
  ];
  if (toit) {
    const pans = pansToit(s), nord = P.install && P.install.nord;
    parts.push(sec('Forme',
      segCtl(Object.entries(FORMES).map(([v, n]) => ({ v, n: n.replace(' (toit-terrasse)', '').replace(' (appentis)', '').replace(' (croupes)', '') })), formeDe(s), (v) => { s.forme = v; if (v !== 'plat' && !(s.pente > 0)) s.pente = 35; commit(); }),
      formeDe(s) !== 'plat' ? [
        row(numField('Pente', penteDe(s), '°', maj(s, (v) => { s.pente = v; }), { id: 'f-spente', min: 0, max: 75 }),
          numField(formeDe(s) === '1pan' ? 'Sens de l’écoulement' : 'Direction du faîtage', isNum(s.sens) ? s.sens : 0, '°', maj(s, (v) => { s.sens = ((v % 360) + 360) % 360; }), { id: 'f-ssens', min: -360, max: 360 })),
        chipRow([15, 22, 30, 35, 40, 45, 60], penteDe(s), maj(s, (v) => { s.pente = v; }), (v) => v + '°'),
        btns(btn('Tourner de 90°', () => { s.sens = (((isNum(s.sens) ? s.sens : 0) + 90) % 360); commit(); }, 'sm')),
        h('p', { class: 'note' }, `Pente en degrés : ${N1(penteDe(s))}° ≈ ${N1(Math.tan(penteDe(s) * Math.PI / 180) * 100)} %. Hauteur au faîtage : ${fmtIn(hauteurFaitage(s))} cm au-dessus de la base.`),
      ] : h('p', { class: 'note' }, 'Toit plat : une légère pente d’écoulement (1 à 3 %) est à prévoir sur le chantier ; elle n’est pas dessinée.'),
    ));
    parts.push(sec('Hauteur et épaisseur',
      row(numField('Base (au-dessus du sol du niveau)', base, 'cm', maj(s, (v) => { s.z = v; }), { id: 'f-sz', min: -1000, max: 5000 }),
        numField('Épaisseur', epDe(s), 'cm', maj(s, (v) => { s.e = v; }), { id: 'f-se', min: 1, max: 200 })),
      h('p', { class: 'note' }, `Par défaut, la base est en haut des murs (${fmtIn(L ? L.h : 250)} cm, hauteur du niveau).`),
      h('div', { class: 'fld' }, h('span', null, 'Couverture'), segCtl(Object.entries(TOIT_MATS).map(([v, m]) => ({ v, n: m.n })), s.mat || 'tuile', maj(s, (v) => { s.mat = v; }))),
      btns(btn(s.pignons === false ? 'Pignons : non (rives ouvertes)' : 'Pignons maçonnés sous les rives : oui', () => { if (s.pignons === false) delete s.pignons; else s.pignons = false; commit(); }, 'sm'),
        btn(s.masque ? 'Afficher en 3D' : 'Masquer en 3D', () => { if (s.masque) delete s.masque; else s.masque = true; commit(); }, 'sm'))));
    parts.push(sec('Pans', kv([['Surface au sol (projetée)', fmtM2(aireSurface(s))],
      ...pans.map((pn) => { const o = orientation(pn.sens, nord); return [`Pan ${pn.i + 1}${o ? ' · vers le ' + o.nom : ''}`, `${fmtM2(pn.aire)} en rampant`]; }),
      ['Surface de couverture', fmtM2(pans.reduce((a, pn) => a + pn.aire, 0))]]),
      numField('Nord du plan (0 = haut de l’écran)', isNum(nord) ? nord : 0, '°', (v) => { P.install.nord = ((v % 360) + 360) % 360; commit(); }, { id: 'f-nord', min: -360, max: 360 })));
    parts.push(pvSection(s, pans));
  } else {
    parts.push(sec('Hauteur et épaisseur',
      row(numField('Dessus (par rapport au sol du niveau)', base, 'cm', maj(s, (v) => { s.z = v; }), { id: 'f-sz', min: -1000, max: 5000 }),
        numField('Épaisseur', epDe(s), 'cm', maj(s, (v) => { s.e = v; }), { id: 'f-se', min: 1, max: 200 })),
      chipRow([0, -2, 15, 40, 60, 100], base, maj(s, (v) => { s.z = v; }), (v) => (v > 0 ? '+' : '') + v + ' cm'),
      h('div', { class: 'fld' }, h('span', null, 'Revêtement'), segCtl(Object.entries(TERR_MATS).map(([v, m]) => ({ v, n: m.n })), s.mat || 'bois', maj(s, (v) => { s.mat = v; }))),
      row(numField('Sens des lames', isNum(s.sens) ? s.sens : 0, '°', maj(s, (v) => { s.sens = ((v % 360) + 360) % 360; }), { id: 'f-ssens', min: -360, max: 360 })),
      btns(btn(s.masque ? 'Afficher en 3D' : 'Masquer en 3D', () => { if (s.masque) delete s.masque; else s.masque = true; commit(); }, 'sm'))));
    parts.push(sec('Surface', kv([['Surface', fmtM2(aireSurface(s))], ['Angles', String(s.pts.length)]]),
      h('p', { class: 'note' }, 'Un sol sans murs : terrasse, dalle, plage de piscine, allée. Les prises et éclairages extérieurs se posent dessus avec l’outil Électricité.')));
  }
  parts.push(sec(null, h('p', { class: 'note' }, 'Faites glisser un angle pour déformer le contour (il s’aimante aux angles des murs), ou l’intérieur pour le déplacer.'),
    btns(btn('Supprimer', deleteSel, 'danger', 'del'))));
  return [inspHead(toit ? 'Toit' : 'Terrasse', `${nomSurface(s)} · ${fmtM2(aireSurface(s))}`), body(...parts)];
}
EXT.insp.surface = inspSurface;

/* panneaux solaires sur un pan du toit */
function pvSection(s, pans) {
  if (!s.pv) return sec('Panneaux solaires', h('p', { class: 'note' }, 'Calque place des modules sur un pan, à la marge près, et les compte. Aucune production n’est estimée.'),
    btns(btn('Poser des panneaux solaires', () => { s.pv = { pan: meilleurPan(pans), lm: 113, hm: 172, marge: 30, jeu: 2 }; commit(); }, 'pri sm')));
  const pv = s.pv, cp = calepinage(s), nord = P.install && P.install.nord;
  return sec('Panneaux solaires',
    pans.length > 1 ? h('div', { class: 'fld' }, h('span', null, 'Pan'), segCtl(pans.map((pn) => { const o = orientation(pn.sens, nord); return { v: pn.i, n: `Pan ${pn.i + 1}${o ? ' (' + o.nom + ')' : ''}` }; }), cp.pan, maj(s, (v) => { pv.pan = v; }))) : null,
    h('div', { class: 'fld' }, h('span', null, 'Format du module'), segCtl(MODULES_PV.map((m, i) => ({ v: i, n: m.n })), MODULES_PV.findIndex((m) => m.lm === pv.lm && m.hm === pv.hm), maj(s, (i) => { pv.lm = MODULES_PV[i].lm; pv.hm = MODULES_PV[i].hm; }))),
    row(numField('Largeur du module', pv.lm || 113, 'cm', maj(s, (v) => { pv.lm = v; }), { id: 'f-pvl', min: 20, max: 400 }),
      numField('Hauteur du module', pv.hm || 172, 'cm', maj(s, (v) => { pv.hm = v; }), { id: 'f-pvh', min: 20, max: 400 })),
    h('p', { class: 'note' }, ORIGINE_PV + '.'),
    segCtl([{ v: 'portrait', n: 'Portrait' }, { v: 'paysage', n: 'Paysage' }], pv.orient === 'paysage' ? 'paysage' : 'portrait', maj(s, (v) => { if (v === 'paysage') pv.orient = v; else delete pv.orient; })),
    row(numField('Marge au bord du pan', isNum(pv.marge) ? pv.marge : 30, 'cm', maj(s, (v) => { pv.marge = v; }), { id: 'f-pvm', min: 0, max: 300 }),
      numField('Jeu entre modules', isNum(pv.jeu) ? pv.jeu : 2, 'cm', maj(s, (v) => { pv.jeu = v; }), { id: 'f-pvj', min: 0, max: 50 })),
    numField('Puissance crête d’un module (saisie, fiche du module)', pv.wc ? pv.wc.v : 0, 'Wc', maj(s, (v) => { if (v > 0) pv.wc = { v, st: 'saisie' }; else delete pv.wc; }), { id: 'f-pvwc', min: 0, max: 1500 }),
    kv([['Modules posés', `${cp.n} (${cp.rangs} rangée${cp.rangs > 1 ? 's' : ''} × ${cp.cols} colonne${cp.cols > 1 ? 's' : ''})`],
      ['Surface des modules', N1(cp.surfaceModules || 0) + ' m²'],
      ['Puissance crête', cp.kwc ? `${N1(cp.kwc.v)} kWc (saisie : ${cp.n} × ${pv.wc.v} Wc)` : 'à calculer : saisissez la puissance d’un module']]),
    h('p', { class: 'note' }, 'L’onduleur, la batterie et la borne de recharge se posent avec l’outil Électricité (catégorie Tableau). Le raccordement d’une installation photovoltaïque suit son propre guide (UTE C 15-712) : à vérifier par l’installateur.'),
    btns(btn('Retirer les panneaux', () => { delete s.pv; commit(); }, 'sm')));
}
/* pan le mieux exposé (le plus près du sud), sinon le plus grand */
function meilleurPan(pans) {
  const nord = P.install && P.install.nord;
  let best = 0, bs = -Infinity;
  for (const pn of pans) { const o = orientation(pn.sens, nord); const sc = (o ? -Math.abs(((o.az - 180 + 540) % 360) - 180) * 100 : 0) + pn.aire / 1e6; if (sc > bs) { bs = sc; best = pn.i; } }
  return best;
}

/* ---------------- murs inclinés : section du panneau d'un mur ---------------- */
function inclinaisonMurSection(w, g) {
  const L = levelOf(w.lv), hh = w.h || (L && L.h) || 250, a = inclDe(w);
  const set = (v) => { v = Math.max(-75, Math.min(75, v)); if (Math.abs(v) < 0.05) delete w.incl; else w.incl = Math.round(v * 10) / 10; commit(); };
  /* mur parallèle le plus proche du même niveau : inclinaison qui les fait se rejoindre (maison en A) */
  let vis = null;
  for (const o of geo(w.lv).walls.values()) {
    if (o.w.id === w.id || Math.abs(o.d.x * g.d.x + o.d.y * g.d.y) < 0.995) continue;
    const dist = (o.A.x - g.A.x) * g.n.x + (o.A.y - g.A.y) * g.n.y; if (Math.abs(dist) < 50) continue;
    if (!vis || Math.abs(dist) < Math.abs(vis.dist)) vis = { o, dist };
  }
  return sec('Inclinaison',
    row(numField('Inclinaison (0 = vertical)', a, '°', set, { id: 'f-incl', min: -75, max: 75 })),
    chipRow([-45, -30, -15, 0, 15, 30, 45], a, set, (v) => (v > 0 ? '+' : '') + v + '°'),
    h('p', { class: 'note' }, a ? `Le haut du mur est décalé de ${fmtIn(Math.abs(decalageHaut(w, hh)))} cm vers le côté ${a > 0 ? 1 : 2} (pointillés violets sur le plan). Hauteur verticale ${fmtIn(hh)} cm, rampant ${fmtIn(rampant(w, hh))} cm.`
      : 'Angle positif : le mur penche vers le côté 1 ; négatif : vers le côté 2. Pour une maison en A, inclinez les deux longs murs l’un vers l’autre.'),
    vis ? btns(btn(`Maison en A : rejoindre le mur parallèle (${fmtIn(Math.abs(vis.dist))} cm)`, () => {
      const ang = inclPourA(Math.abs(vis.dist), hh), sg = vis.dist > 0 ? 1 : -1;
      w.incl = Math.round(sg * ang * 10) / 10;
      const o = vis.o.w, sgO = (g.n.x * vis.o.n.x + g.n.y * vis.o.n.y) > 0 ? -sg : sg;
      if (!o.h || o.h === w.h) { o.incl = Math.round(sgO * ang * 10) / 10; }
      commit(); toast(`Les deux murs sont inclinés de ${N1(ang)}° et se rejoignent au faîte, à ${fmtIn(hh)} cm.`);
    }, 'sm')) : null,
    btns(btn(w.masque ? 'Afficher en 3D' : 'Masquer en 3D', () => { if (w.masque) delete w.masque; else w.masque = true; commit(); }, 'sm')),
    w.masque ? h('p', { class: 'note' }, 'Ce mur est caché dans la vue 3D (il reste sur le plan et dans les calculs).') : null);
}

/* ---------------- piscine : volumes 0, 1, 2 et appareils à poser ---------------- */
EXT.top.push((c, lv, opts) => {
  const it = ui.sel && ui.sel.t === 'item' && IDX.items.get(ui.sel.id);
  if (!it || it.lv !== lv || !estBassin(it) || (opts && opts.export)) return;
  const px = RC.px, b = bassin(it), a = (it.rot || 0) * Math.PI / 180;
  c.save(); c.translate(it.x, it.y); c.rotate(a);
  const rr = (hw, hd, r) => { c.beginPath(); if (c.roundRect && r) c.roundRect(-hw - r, -hd - r, 2 * (hw + r), 2 * (hd + r), r); else c.rect(-hw - r, -hd - r, 2 * (hw + r), 2 * (hd + r)); };
  c.setLineDash([6 * px, 4 * px]); c.lineWidth = 1.3 * px;
  rr(b.hw, b.hd, V2); c.strokeStyle = '#2E86C1'; c.stroke();
  rr(b.hw, b.hd, V1); c.fillStyle = 'rgba(46,134,193,0.06)'; c.fill(); c.strokeStyle = '#1B4F72'; c.stroke();
  c.setLineDash([]);
  c.font = `600 ${10 * px}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#1B4F72';
  c.fillText('volume 1 (2 m)', 0, -b.hd - V1 / 2); c.fillText('volume 2 (+1,50 m)', 0, -b.hd - V1 - (V2 - V1) / 2); c.fillText('volume 0', 0, 0);
  c.restore();
});
function poserPres(it, t, dx) {
  const def = ELEC_BY.get(t); if (!def) return;
  const e = makeElecFromDef(def, it.lv);
  placeElecAt(e, { x: it.x + dx, y: it.y + it.d / 2 + V2 + 60 });
  P.elec.push(e); IDX.elec.set(e.id, e);
  commit(); toast(`${def.n} posé hors des volumes : déplacez-le où il faut.`);
}
function piscineSection(it) {
  if (!estBassin(it)) return null;
  const L = appareilsDansVolumes(P, it);
  return sec(it.type === 'spa' ? 'Spa : volumes' : 'Piscine : volumes',
    h('p', { class: 'note' }, 'Volume 0 : le bassin ; volume 1 : jusqu’à 2 m du bord et 2,50 m de haut ; volume 2 : 1,50 m de plus. Ils sont dessinés en bleu quand le bassin est sélectionné.'),
    L.length ? h('div', { class: 'ev-list' }, L.map((x) => h('div', { class: 'ev-chk warn' }, h('span', { class: 'ic' }, '?'),
      h('span', { class: 'tx' }, `${(ELEC_BY.get(x.e.type) || {}).n || x.e.type} — vérification nécessaire : ${x.msg}.`)))) : h('p', { class: 'note' }, 'Aucun appareil électrique dans les volumes 0, 1 et 2.'),
    h('p', { class: 'note' }, SRC_PISCINE + '. Jamais de conformité affichée.'),
    it.type === 'piscine' ? btns(btn('Poser le coffret de filtration', () => poserPres(it, 'coffret_piscine', -80), 'sm'), btn('Poser la pompe à chaleur', () => poserPres(it, 'pac_piscine', 40), 'sm'),
      btn('Poser le transformateur 12 V', () => poserPres(it, 'transfo_piscine', 140), 'sm')) : null);
}

export { piscineSection };
export { SD, ajouterSurface, enveloppeNiveau, finishSurface, inclinaisonMurSection, inspSurface, nomSurface, startSurface, toitSurNiveau };

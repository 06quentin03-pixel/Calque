/* Calque — module « schemaui » : onglet « Schémas » (éditeur de schémas électriques).
   Feuilles (folios) A3 indépendantes du bâtiment : symboles (schemasymboles.js), fils orthogonaux, textes.
   Le moteur (repères, équipotentielles, renvois, nomenclature, borniers, liste des fils, modèles, import du tableau) est
   dans schema.js (sans écran). Les schémas sont dans le plan (`P.schemas`) : enregistrement, historique des versions et
   « Annuler » sont ceux du reste de Calque.
   Gestes : Pencil ou souris pour dessiner ; doigt pour déplacer la feuille en mode Apple Pencil ; deux doigts : zoom. */
import { $, EXT, P, S, clamp, saveSettings, ui } from './noyau.js';
import { CATEGORIES, SYMBOLES, SYM_BY, boiteDe, bornesDe, dessinerSymbole } from './schemasymboles.js';
import * as SC from './schema.js';
import * as SIM from './simulation.js';
import { commit } from './interaction.js';
import { body, btn, btns, closeModal, h, inspHead, kv, openModal, sec, textField, toast } from './interface.js';
import { circNumbers } from './electricite.js';
import { agcpLabel } from './elecdonnees.js';
import { EV, on } from './evenements.js';
import { PdfCtx, buildPdf } from './pdf.js';
import { SvgCtx } from './svgexport.js';
import { DxfCtx, buildDxf, dxfOctets } from './dxf.js';
import { fileActions } from './export.js';
import { slug } from './stockage.js';

const PT_MM = 72 / 25.4;
const SU = { fi: 0, tool: 'select', place: null, rot: 0, sel: new Set(), V: { s: 2, ox: 20, oy: 20 }, ajuste: true, fil: null, cur: null, marquee: null, recents: [], dernier: null, ghostOk: false };
const sch = () => SC.schemasDe(P);
const folio = () => sch().folios[SU.fi] || null;
const cv = $('#schCv'), stage = $('#schStage');
const ctx = cv ? cv.getContext('2d') : null;
let W = 300, H = 300, dpr = 1;
const actif = () => ui.view === 'schema';

/* ---------------- vue ---------------- */
function redim() {
  if (!cv) return;
  const r = stage.getBoundingClientRect(); dpr = Math.min(3, window.devicePixelRatio || 1);
  W = Math.max(50, r.width); H = Math.max(50, r.height);
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  if (SU.ajuste) ajuster();
}
function ajuster() { const s = Math.min((W - 24) / SC.FEUILLE.W, (H - 24) / SC.FEUILLE.H); SU.V = { s, ox: (W - SC.FEUILLE.W * s) / 2, oy: (H - SC.FEUILLE.H * s) / 2 }; SU.ajuste = true; }
const monde = (p) => ({ x: (p.x - SU.V.ox) / SU.V.s, y: (p.y - SU.V.oy) / SU.V.s });
function zoomEn(px, py, k) { const v = SU.V, s2 = clamp(v.s * k, 0.6, 40); v.ox = px - (px - v.ox) * (s2 / v.s); v.oy = py - (py - v.oy) * (s2 / v.s); v.s = s2; SU.ajuste = false; dessiner(); }
let raf = 0;
function dessiner() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; peindre(); }); }
function cartouche() {
  const d = P.doc || {}, rv = d.revisions && d.revisions.length ? d.revisions[d.revisions.length - 1] : null;
  return { projet: P.name || 'Projet', client: d.client || '', affaire: d.affaire ? 'Affaire ' + d.affaire : '', date: new Intl.DateTimeFormat('fr-FR').format(new Date()), indice: rv ? rv.i : '' };
}
function peindre() {
  if (!ctx || !actif()) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#E3E7E1'; ctx.fillRect(0, 0, W, H);
  const f = folio(); if (!f) return;
  const v = SU.V;
  ctx.setTransform(dpr * v.s, 0, 0, dpr * v.s, dpr * v.ox, dpr * v.oy);
  ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 8; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SC.FEUILLE.W, SC.FEUILLE.H); ctx.restore();
  const S0 = sch(), app = SC.appareils(S0), eq = SC.equipotentielles(S0);
  /* grille de 5 mm (repère de pose), discrète */
  if (v.s >= 2.2) { ctx.fillStyle = '#C9D0C9'; const z = SC.ZONE; for (let x = z.x0 + 5; x < z.x1; x += 5) for (let y = z.y0 + 5; y < z.y1; y += 5) ctx.fillRect(x - 0.12, y - 0.12, 0.24, 0.24); }
  const sim = SU.test && SU.simR ? Object.assign({}, SU.simR, { actifs: new Set(Object.keys(SU.simE.man).filter((k) => SU.simE.man[k])) }) : null;
  SC.dessinerFolio(ctx, S0, SU.fi, { cartouche: cartouche(), sel: SU.test ? null : SU.sel, app, eq, exporter: true, sim });
  /* mode test : symboles que l'on peut actionner (cadre vert discret) */
  if (SU.test) { ctx.strokeStyle = 'rgba(30,143,78,.55)'; ctx.lineWidth = 0.3; ctx.setLineDash([1, 0.8]); for (const s of f.syms) if (SIM.actionnable(s)) { const b = boiteDe(s); ctx.strokeRect(b.x0 - 1.5, b.y0 - 1.5, b.x1 - b.x0 + 3, b.y1 - b.y0 + 3); } ctx.setLineDash([]); }
  /* bornes : visibles pendant le tracé des fils et la pose */
  if (SU.tool === 'fil' || SU.tool === 'place') { ctx.fillStyle = 'rgba(210,79,26,.55)'; for (const s of f.syms) for (const b of bornesDe(s)) { ctx.beginPath(); ctx.arc(b.x, b.y, 0.8, 0, Math.PI * 2); ctx.fill(); } }
  /* fil en cours */
  if (SU.fil) {
    const pts = SU.fil.pts.slice(); if (SU.cur && SU.fil.apercu) pts.push(...SU.fil.apercu.slice(1));
    ctx.strokeStyle = '#D24F1A'; ctx.lineWidth = 0.5; ctx.setLineDash([1.5, 1]);
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#D24F1A'; for (const p of SU.fil.pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 0.9, 0, Math.PI * 2); ctx.fill(); }
  }
  /* point d'accrochage */
  if (SU.cur && (SU.tool === 'fil' || SU.tool === 'place') && SU.cur.k !== 'grille') { ctx.strokeStyle = '#D24F1A'; ctx.lineWidth = 0.35; ctx.strokeRect(SU.cur.x - 1.6, SU.cur.y - 1.6, 3.2, 3.2); }
  /* symbole à poser (aperçu) */
  if (SU.tool === 'place' && SU.place && SU.cur && SU.ghostOk) { ctx.save(); ctx.globalAlpha = 0.55; dessinerSymbole(ctx, { t: SU.place, x: SU.cur.x, y: SU.cur.y, rot: SU.rot }, '#D24F1A'); ctx.restore(); }
  /* sélection par rectangle */
  if (SU.marquee) { const m = SU.marquee; ctx.strokeStyle = '#D24F1A'; ctx.lineWidth = 0.3; ctx.setLineDash([1.2, 0.8]); ctx.strokeRect(Math.min(m.a.x, m.b.x), Math.min(m.a.y, m.b.y), Math.abs(m.a.x - m.b.x), Math.abs(m.a.y - m.b.y)); ctx.setLineDash([]); ctx.fillStyle = 'rgba(210,79,26,.06)'; ctx.fillRect(Math.min(m.a.x, m.b.x), Math.min(m.a.y, m.b.y), Math.abs(m.a.x - m.b.x), Math.abs(m.a.y - m.b.y)); }
}

/* ---------------- accrochage ---------------- */
const grille = (p) => ({ x: Math.round(p.x / 5) * 5, y: Math.round(p.y / 5) * 5, k: 'grille' });
function accroche(p, exclureFil) {
  const f = folio(); const tol = Math.max(1.5, 14 / SU.V.s);
  let best = null, bd = tol;
  for (const s of f.syms) for (const b of bornesDe(s)) { const d = Math.hypot(b.x - p.x, b.y - p.y); if (d < bd) { bd = d; best = { x: b.x, y: b.y, k: 'borne' }; } }
  if (best) return best;
  for (const w of f.fils) { if (w === exclureFil) continue; for (const q of w.pts) { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d < bd) { bd = d; best = { x: q.x, y: q.y, k: 'fil' }; } } }
  if (best) return best;
  for (const w of f.fils) { if (w === exclureFil) continue; for (let i = 1; i < w.pts.length; i++) {
    const a = w.pts[i - 1], b = w.pts[i], g = grille(p);
    if (Math.abs(a.x - b.x) < 0.01 && Math.abs(p.x - a.x) < bd && g.y > Math.min(a.y, b.y) && g.y < Math.max(a.y, b.y)) { bd = Math.abs(p.x - a.x); best = { x: a.x, y: g.y, k: 'fil' }; }
    if (Math.abs(a.y - b.y) < 0.01 && Math.abs(p.y - a.y) < bd && g.x > Math.min(a.x, b.x) && g.x < Math.max(a.x, b.x)) { bd = Math.abs(p.y - a.y); best = { x: g.x, y: a.y, k: 'fil' }; }
  } }
  return best || grille(p);
}

/* ---------------- sélection (toucher) ---------------- */
function toucher(p) {
  const f = folio(); const tol = Math.max(1.2, 11 / SU.V.s);
  for (let i = f.syms.length - 1; i >= 0; i--) { const s = f.syms[i], b = boiteDe(s); if (p.x >= b.x0 - tol * 0.4 && p.x <= b.x1 + tol * 0.4 && p.y >= b.y0 - tol * 0.4 && p.y <= b.y1 + tol * 0.4) return { t: 'sym', o: s }; }
  for (let i = f.textes.length - 1; i >= 0; i--) { const t = f.textes[i], w = String(t.s).length * (t.taille || 3) * 0.55, hh = (t.taille || 3) * 1.2; const vert = t.rot === 90 || t.rot === 270;
    const bw = vert ? hh : w, bh = vert ? w : hh, cx = t.align === 'left' && !vert ? t.x + w / 2 : t.x, cy = t.align === 'left' && vert ? t.y + (t.rot === 270 ? w / 2 : -w / 2) : t.y;
    if (Math.abs(p.x - cx) <= bw / 2 + tol * 0.3 && Math.abs(p.y - cy) <= bh / 2 + tol * 0.3) return { t: 'texte', o: t }; }
  let best = null, bd = tol;
  for (const w of f.fils) for (let i = 1; i < w.pts.length; i++) { const d = distSeg(p, w.pts[i - 1], w.pts[i]); if (d < bd) { bd = d; best = { t: 'fil', o: w, seg: i }; } }
  return best;
}
function distSeg(p, a, b) { const L2 = (b.x - a.x) ** 2 + (b.y - a.y) ** 2; const t = L2 ? clamp(((p.x - a.x) * (b.x - a.x) + (p.y - a.y) * (b.y - a.y)) / L2, 0, 1) : 0; return Math.hypot(a.x + t * (b.x - a.x) - p.x, a.y + t * (b.y - a.y) - p.y); }
const objetParId = (id) => { const f = folio(); return f.syms.find((x) => x.id === id) || f.fils.find((x) => x.id === id) || f.textes.find((x) => x.id === id) || null; };

/* ---------------- gestes ---------------- */
const ptrs = new Map(); let geste = null;
const posEv = (e) => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
const seuil = (e) => (e.pointerType === 'touch' ? 10 : 5);
function panGeste(p0, onTap) {
  const o = { x: SU.V.ox, y: SU.V.oy }; let bouge = false;
  return { move(w, p) { if (!bouge && Math.hypot(p.x - p0.x, p.y - p0.y) < 8) return; bouge = true; SU.V.ox = o.x + p.x - p0.x; SU.V.oy = o.y + p.y - p0.y; SU.ajuste = false; dessiner(); }, up(w, p) { if (!bouge && onTap) onTap(w, p); } };
}
if (cv) {
  cv.addEventListener('pointerdown', (e) => {
    if (!folio()) return;
    cv.focus({ preventScroll: true });
    try { cv.setPointerCapture(e.pointerId); } catch (x) { }
    const p = posEv(e); ptrs.set(e.pointerId, p);
    if (e.pointerType === 'pen' && !S.pencilSeen) { S.pencil = true; S.pencilSeen = true; saveSettings(); toast('Apple Pencil : le stylet dessine, le doigt déplace la feuille.'); }
    if (ptrs.size === 2) {
      const [a, b] = [...ptrs.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y), m0 = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, v0 = Object.assign({}, SU.V);
      geste = { pinch: true, move() { const [c, d] = [...ptrs.values()]; const d1 = Math.hypot(c.x - d.x, c.y - d.y), m1 = { x: (c.x + d.x) / 2, y: (c.y + d.y) / 2 }; const s = clamp(v0.s * d1 / Math.max(1, d0), 0.6, 40);
        SU.V.s = s; SU.V.ox = m1.x - (m0.x - v0.ox) * (s / v0.s); SU.V.oy = m1.y - (m0.y - v0.oy) * (s / v0.s); SU.ajuste = false; dessiner(); }, up() { } };
      return;
    }
    if (ptrs.size > 2) return;
    const w = monde(p);
    if ((S.pencil && e.pointerType === 'touch') || e.button === 1) { geste = panGeste(p, (w2) => { if (SU.tool === 'select') { SU.sel.clear(); majInsp(); dessiner(); } }); return; }
    geste = outilDown(w, p, e);
  });
  cv.addEventListener('pointermove', (e) => {
    const p = posEv(e);
    if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, p);
    const w = monde(p);
    if (geste && geste.pinch) { geste.move(); return; }
    if (geste && ptrs.has(e.pointerId)) { geste.move(w, p); return; }
    if (e.pointerType !== 'touch') survol(w);
  });
  const fin = (e) => {
    const p = posEv(e), w = monde(p);
    if (geste && ptrs.has(e.pointerId)) { const g = geste; ptrs.delete(e.pointerId); if (!g.pinch) { geste = null; g.up(w, p); } else if (!ptrs.size) geste = null; return; }
    ptrs.delete(e.pointerId);
  };
  cv.addEventListener('pointerup', fin);
  cv.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); geste = null; SU.marquee = null; dessiner(); });
  cv.addEventListener('pointerleave', () => { if (!geste) { SU.cur = null; SU.ghostOk = false; dessiner(); } });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); const p = posEv(e); if (e.ctrlKey || e.metaKey || Math.abs(e.deltaY) > Math.abs(e.deltaX) * 2 && !e.shiftKey) zoomEn(p.x, p.y, Math.exp(-e.deltaY * 0.0022)); else { SU.V.ox -= e.deltaX; SU.V.oy -= e.deltaY; SU.ajuste = false; dessiner(); } }, { passive: false });
  $('#schZIn').addEventListener('click', () => zoomEn(W / 2, H / 2, 1.3));
  $('#schZOut').addEventListener('click', () => zoomEn(W / 2, H / 2, 1 / 1.3));
  $('#schZFit').addEventListener('click', () => { ajuster(); dessiner(); });
  if (window.ResizeObserver) new ResizeObserver(() => { if (actif()) { redim(); peindre(); } }).observe(stage);
}
function survol(w) {
  if (SU.tool === 'fil') { SU.cur = accroche(w); if (SU.fil) SU.fil.apercu = SC.enL(SU.fil.pts[SU.fil.pts.length - 1], SU.cur, Math.abs(SU.cur.x - SU.fil.pts[SU.fil.pts.length - 1].x) > Math.abs(SU.cur.y - SU.fil.pts[SU.fil.pts.length - 1].y)); dessiner(); }
  else if (SU.tool === 'place') { SU.cur = grille(w); SU.ghostOk = true; dessiner(); }
  else cv.style.cursor = toucher(w) ? 'move' : 'default';
}

/* ---------------- outils ---------------- */
/* ---------------- mode « Tester » : on actionne boutons, interrupteurs et protections ; le schéma n'est pas modifié ---------------- */
function recalculer() { SU.simR = SIM.simuler(sch(), SU.simE); SU.simE = SU.simR.etat; }
function basculerTest(v) {
  if (SU.fil) finirFil();
  SU.test = v == null ? !SU.test : !!v;
  if (SU.test) { SU.tool = 'select'; SU.sel.clear(); SU.simE = SIM.etatInitial(); recalculer(); } else SU.simR = null;
  majTout();
}
function testDown(w, p, e) {
  const f = folio(), tol = Math.max(1.2, 11 / SU.V.s);
  const s = f.syms.slice().reverse().find((x) => { const b = boiteDe(x); return SIM.actionnable(x) && w.x >= b.x0 - tol * 0.5 && w.x <= b.x1 + tol * 0.5 && w.y >= b.y0 - tol * 0.5 && w.y <= b.y1 + tol * 0.5; });
  if (!s) return panGeste(p);
  /* bouton-poussoir : appuyé tant que le doigt (ou le Pencil) reste posé */
  if (SIM.POUSSOIRS.has(s.t)) {
    SU.simE = SIM.actionner(sch(), SU.simE, s, true); recalculer(); majInsp(); dessiner();
    return { move() { }, up() { SU.simE = SIM.actionner(sch(), SU.simE, s, false); recalculer(); majInsp(); dessiner(); } };
  }
  return { move() { }, up() { SU.simE = SIM.actionner(sch(), SU.simE, s, true); recalculer(); majInsp(); dessiner(); } };
}
function testInsp() {
  const R0 = SU.simR; if (!R0) return [];
  const S0 = sch(), f = folio();
  const ici = R0.charges.filter((x) => x.fi === SU.fi), ailleurs = R0.charges.filter((x) => x.fi !== SU.fi && x.on);
  const ligne = (x) => h('div', { class: 'li sim-li' + (x.on ? ' on' : '') }, h('span', { class: 'sim-dot' }), h('span', null, `${x.rep || x.d.n}${x.s.des ? ' · ' + x.s.des : ''}`), h('span', { class: 'v' }, x.lib));
  const man = Object.keys(SU.simE.man).filter((k) => SU.simE.man[k]);
  const libAction = (k) => {
    if (k.startsWith('F:')) return `${k.slice(2)} : relais thermique déclenché`;
    for (const g of S0.folios) { const s = g.syms.find((x) => x.id === k); if (s) { const d = SYM_BY.get(s.t); return `${s.rep || d.n} : ${SIM.PROTECTIONS.has(s.t) ? 'ouvert' : SIM.POUSSOIRS.has(s.t) ? 'appuyé' : s.t === 'vv' ? 'position 2' : s.t === 'au' ? 'enfoncé' : 'actionné'}`; } }
    return k;
  };
  const tempo = R0.charges.some((x) => x.s.t === 'minuterie');
  return [inspHead('Mode test', `Folio ${SU.fi + 1} · ${f ? f.titre : ''}`), body(
    h('p', { class: 'note' }, 'Touchez un interrupteur, un va-et-vient, une protection ou un relais thermique pour changer sa position. Gardez le doigt (ou le Pencil) sur un bouton-poussoir pour l’appuyer. Le schéma n’est pas modifié.'),
    h('div', { class: 'sim-leg' }, [['phase', 'Phase'], ['neutre', 'Neutre'], ['dc+', '+ continu'], ['dc-', '− continu'], ['court', 'Court-circuit']].map(([k, n]) => h('span', null, h('i', { style: `background:${SC.SIM_COUL[k]}` }), n))),
    R0.alertes.length ? sec('Constats', h('div', { class: 'ev-list' }, R0.alertes.map((a) => h('div', { class: 'ev-chk ' + (a.niveau === 'erreur' ? 'err' : a.niveau === 'avertissement' ? 'warn' : 'info') }, h('span', { class: 'ic' }, a.niveau === 'info' ? 'i' : '!'), h('span', { class: 'tx' }, a.msg))))) : null,
    sec('Sur ce folio', ici.length ? h('div', { class: 'list' }, ici.map(ligne)) : h('p', { class: 'note' }, 'Aucun récepteur (bobine, lampe, moteur…) sur ce folio.')),
    ailleurs.length ? sec('En marche sur d’autres folios', h('div', { class: 'list' }, ailleurs.map(ligne))) : null,
    sec('Actions en cours', man.length ? h('div', { class: 'list' }, man.map((k) => h('div', { class: 'li' }, h('span', null, libAction(k))))) : h('p', { class: 'note' }, 'Tout est au repos.')),
    sec(null, btns(btn('Tout remettre au repos', () => { SU.simE = SIM.etatInitial(); recalculer(); majInsp(); dessiner(); }, 'sm'),
      tempo ? btn('Fin de temporisation', () => { SU.simE = SIM.finTempo(S0, SU.simE); recalculer(); majInsp(); dessiner(); }, 'sm') : null,
      btn('Quitter le test', () => basculerTest(false), 'pri sm'))),
    h('p', { class: 'note' }, 'Aide à la compréhension du schéma dessiné (logique des contacts) : ce n’est ni un calcul électrique ni une vérification de la norme.'))];
}
function outilDown(w, p, e) {
  if (SU.test) return testDown(w, p, e);
  const tap = (fn) => { let bouge = false; const pan = panGeste(p); return { move(w2, p2) { if (!bouge && Math.hypot(p2.x - p.x, p2.y - p.y) < seuil(e)) return; bouge = true; pan.move(w2, p2); }, up(w2, p2) { if (!bouge) fn(w2, p2); } }; };
  if (SU.tool === 'place') return tap((w2) => poser(grille(w2)));
  if (SU.tool === 'fil') return tap((w2) => filTap(w2));
  if (SU.tool === 'texte') return tap((w2) => { const f = folio(); const t = { id: 'tx' + Math.random().toString(36).slice(2, 9), x: grille(w2).x, y: grille(w2).y, s: 'Texte', taille: 3.5 }; f.textes.push(t); commit(); SU.tool = 'select'; SU.sel = new Set([t.id]); majOutils(); majInsp(); dessiner(); setTimeout(() => { const el = document.getElementById('sch-ts'); if (el) { el.focus(); el.select(); } }, 50); });
  /* sélection */
  const hit = toucher(w), f = folio();
  if (!hit) {
    if (e.pointerType === 'touch') return panGeste(p, () => { SU.sel.clear(); majInsp(); dessiner(); });
    SU.marquee = { a: w, b: w };
    return { move(w2) { SU.marquee.b = w2; dessiner(); }, up(w2) {
      const m = SU.marquee; SU.marquee = null;
      if (Math.hypot(m.a.x - m.b.x, m.a.y - m.b.y) < 1) { SU.sel.clear(); majInsp(); dessiner(); return; }
      const x0 = Math.min(m.a.x, m.b.x), x1 = Math.max(m.a.x, m.b.x), y0 = Math.min(m.a.y, m.b.y), y1 = Math.max(m.a.y, m.b.y), dans = (q) => q.x >= x0 && q.x <= x1 && q.y >= y0 && q.y <= y1;
      SU.sel = new Set([...f.syms.filter((s) => { const b = boiteDe(s); return dans({ x: b.x0, y: b.y0 }) && dans({ x: b.x1, y: b.y1 }); }), ...f.fils.filter((x) => x.pts.every(dans)), ...f.textes.filter(dans)].map((x) => x.id));
      majInsp(); dessiner();
    } };
  }
  if (!SU.sel.has(hit.o.id)) { if (!e.shiftKey) SU.sel.clear(); SU.sel.add(hit.o.id); majInsp(); dessiner(); }
  /* fil seul sélectionné : bout (accroché) ou tronçon intérieur (déplacé perpendiculairement) */
  if (hit.t === 'fil' && SU.sel.size === 1) return dragFil(hit, w, p, e);
  return dragSel(w, p, e);
}
/* déplacement des symboles et textes sélectionnés ; les fils raccordés suivent (bouts, et coude voisin pour rester d'équerre) */
function dragSel(w0, p0, e) {
  const f = folio(), syms = f.syms.filter((s) => SU.sel.has(s.id)), txts = f.textes.filter((t) => SU.sel.has(t.id)), fils = f.fils.filter((x) => SU.sel.has(x.id));
  const orig = new Map([...syms, ...txts].map((o) => [o, { x: o.x, y: o.y }]));
  const filsOrig = new Map(fils.map((x) => [x, x.pts.map((q) => ({ x: q.x, y: q.y }))]));
  /* bouts de fils posés sur une borne des symboles déplacés */
  const suivis = [];
  for (const s of syms) for (const b of bornesDe(s)) for (const x of f.fils) { if (filsOrig.has(x)) continue; [0, x.pts.length - 1].forEach((i) => { const q = x.pts[i]; if (Math.hypot(q.x - b.x, q.y - b.y) < 0.05) { const j = i === 0 ? 1 : x.pts.length - 2; suivis.push({ x, i, j, p: { x: q.x, y: q.y }, n: { x: x.pts[j].x, y: x.pts[j].y }, vert: Math.abs(x.pts[j].x - q.x) < 0.01, n2: x.pts.length > 2 }); } }); }
  let bouge = false, dx = 0, dy = 0;
  return {
    move(w) {
      if (!bouge && Math.hypot((w.x - w0.x) * SU.V.s, (w.y - w0.y) * SU.V.s) < seuil(e)) return; bouge = true;
      dx = Math.round((w.x - w0.x) / 5) * 5; dy = Math.round((w.y - w0.y) / 5) * 5;
      for (const [o, q] of orig) { o.x = q.x + dx; o.y = q.y + dy; }
      for (const [x, pts] of filsOrig) x.pts = pts.map((q) => ({ x: q.x + dx, y: q.y + dy }));
      for (const s of suivis) { s.x.pts[s.i] = { x: s.p.x + dx, y: s.p.y + dy }; if (s.n2) s.x.pts[s.j] = s.vert ? { x: s.n.x + dx, y: s.n.y } : { x: s.n.x, y: s.n.y + dy }; }
      dessiner();
    },
    up() {
      if (!bouge || (!dx && !dy)) { if (bouge) dessiner(); return; }
      for (const s of suivis) s.x.pts = SC.simplifier(s.x.pts);
      for (const s of syms) SC.insererSurFil(f, s);
      commit(); majInsp();
    },
  };
}
function dragFil(hit, w0, p0, e) {
  const x = hit.o, tol = Math.max(1.5, 12 / SU.V.s);
  const iBout = Math.hypot(x.pts[0].x - w0.x, x.pts[0].y - w0.y) < tol ? 0 : Math.hypot(x.pts[x.pts.length - 1].x - w0.x, x.pts[x.pts.length - 1].y - w0.y) < tol ? x.pts.length - 1 : -1;
  const pts0 = x.pts.map((q) => ({ x: q.x, y: q.y }));
  let bouge = false;
  return {
    move(w) {
      if (!bouge && Math.hypot((w.x - w0.x) * SU.V.s, (w.y - w0.y) * SU.V.s) < seuil(e)) return; bouge = true;
      if (iBout >= 0) { const q = accroche(w, x); const pts = pts0.map((r) => ({ x: r.x, y: r.y })); pts[iBout] = { x: q.x, y: q.y };
        const j = iBout === 0 ? 1 : pts.length - 2; if (pts.length > 2) { const vert = Math.abs(pts0[j].x - pts0[iBout].x) < 0.01; pts[j] = vert ? { x: q.x, y: pts0[j].y } : { x: pts0[j].x, y: q.y }; } x.pts = pts; }
      else {
        const i = hit.seg, a = pts0[i - 1], b = pts0[i], vert = Math.abs(a.x - b.x) < 0.01;
        const pts = pts0.map((r) => ({ x: r.x, y: r.y }));
        const d = vert ? Math.round((w.x - w0.x) / 5) * 5 : Math.round((w.y - w0.y) / 5) * 5;
        const bouger = (k) => { if (vert) pts[k].x += d; else pts[k].y += d; };
        /* tronçon extrême : on ajoute un coude pour que le bout reste sur sa borne */
        if (i - 1 === 0) { pts.splice(0, 0, { x: a.x, y: a.y }); bouger(1); bouger(2); } else if (i === pts0.length - 1) { pts.push({ x: b.x, y: b.y }); bouger(i - 1); bouger(i); }
        else { bouger(i - 1); bouger(i); }
        x.pts = pts;
      }
      dessiner();
    },
    up() { if (!bouge) return; x.pts = SC.simplifier(x.pts); if (x.pts.length < 2) folio().fils.splice(folio().fils.indexOf(x), 1); commit(); majInsp(); },
  };
}
/* pose d'un symbole : repère automatique, insertion dans un fil existant */
function poser(q) {
  const f = folio(), t = SU.place, d = SYM_BY.get(t); if (!d) return;
  const s = { id: 'sy' + Math.random().toString(36).slice(2, 9), t, x: q.x, y: q.y, rot: SU.rot };
  const rep = SC.repereNouveau(sch(), t, SU.dernier && SU.dernier.role === 'bobine' ? { pre: SYM_BY.get(SU.dernier.t).pre, rep: SU.dernier.rep } : null); if (rep) s.rep = rep;
  if (t === 'borne') s.num = SC.prochainNumBorne(sch(), s.rep);
  if (t === 'pot') s.num = 'L'; if (t === 'renvoi') s.num = 'R1';
  f.syms.push(s);
  const coupe = SC.insererSurFil(f, s);
  if (d.role === 'bobine') SU.dernier = { t, rep: s.rep, role: 'bobine' };
  SU.recents = [t, ...SU.recents.filter((x) => x !== t)].slice(0, 6);
  commit();
  SU.sel = new Set([s.id]); majInsp(); dessiner();
  toast(`${d.n}${s.rep ? ' ' + s.rep : ''} posé${coupe ? ' dans le fil' : ''}.`);
}
/* tracé d'un fil : chaque toucher ajoute un tronçon d'équerre ; fin sur une borne ou un fil, ou « Terminer » */
function filTap(w) {
  const q = accroche(w);
  if (!SU.fil) { SU.fil = { pts: [{ x: q.x, y: q.y }], apercu: null }; majHint(); dessiner(); return; }
  const last = SU.fil.pts[SU.fil.pts.length - 1];
  if (Math.hypot(q.x - last.x, q.y - last.y) < 0.05) { finirFil(); return; }
  const l = SC.enL(last, q, Math.abs(q.x - last.x) > Math.abs(q.y - last.y));
  SU.fil.pts.push(...l.slice(1).map((r) => ({ x: r.x, y: r.y })));
  if (q.k !== 'grille') { finirFil(); return; }
  majHint(); dessiner();
}
function finirFil() {
  const fl = SU.fil; SU.fil = null;
  if (fl && fl.pts.length >= 2) { const pts = SC.simplifier(fl.pts); if (pts.length >= 2) { folio().fils.push({ id: 'w' + Math.random().toString(36).slice(2, 9), pts }); commit(); } }
  majHint(); dessiner();
}
function setOutil(t, place) {
  if (SU.test) { SU.test = false; SU.simR = null; majBarre(); }
  if (SU.fil && t !== 'fil') finirFil();
  SU.tool = t; SU.place = place || null; SU.ghostOk = false;
  if (t !== 'select') SU.sel.clear();
  majOutils(); majHint(); majInsp(); dessiner();
}
function supprimerSel() {
  const f = folio(); if (!f || !SU.sel.size) return;
  const n = SU.sel.size;
  f.syms = f.syms.filter((x) => !SU.sel.has(x.id)); f.fils = f.fils.filter((x) => !SU.sel.has(x.id)); f.textes = f.textes.filter((x) => !SU.sel.has(x.id));
  SU.sel.clear(); commit(); majInsp(); dessiner(); toast(`${n} élément${n > 1 ? 's supprimés' : ' supprimé'} (Annuler pour revenir).`);
}
function tourner(sens) {
  if (SU.tool === 'place') { SU.rot = (SU.rot + (sens || 90) + 360) % 360; dessiner(); return; }
  const f = folio(); if (!f) return; let n = 0;
  for (const s of f.syms) if (SU.sel.has(s.id)) { s.rot = ((s.rot || 0) + (sens || 90) + 360) % 360; n++; }
  for (const t of f.textes) if (SU.sel.has(t.id)) { t.rot = ((t.rot || 0) + 90) % 360 || undefined; if (!t.rot) delete t.rot; n++; }
  if (n) { commit(); majInsp(); dessiner(); }
}
function miroir() { const f = folio(); let n = 0; for (const s of f.syms) if (SU.sel.has(s.id)) { if (s.mir) delete s.mir; else s.mir = true; n++; } if (n) { commit(); dessiner(); } }
function dupliquerSel() {
  const f = folio(); if (!f || !SU.sel.size) return;
  const nv = new Set(), S0 = sch();
  for (const s of f.syms.filter((x) => SU.sel.has(x.id))) {
    const c = JSON.parse(JSON.stringify(s)); c.id = 'sy' + Math.random().toString(36).slice(2, 9); c.x += 20;
    const d = SYM_BY.get(c.t);
    if (d && d.pre && d.role !== 'contact' && d.role !== 'borne') c.rep = SC.prochainRepere(S0, d.pre);
    if (c.t === 'borne') c.num = SC.prochainNumBorne(S0, c.rep);
    f.syms.push(c); nv.add(c.id);
  }
  for (const t of f.textes.filter((x) => SU.sel.has(x.id))) { const c = Object.assign({}, t, { id: 'tx' + Math.random().toString(36).slice(2, 9), x: t.x + 20 }); f.textes.push(c); nv.add(c.id); }
  for (const w of f.fils.filter((x) => SU.sel.has(x.id))) { const c = { id: 'w' + Math.random().toString(36).slice(2, 9), pts: w.pts.map((q) => ({ x: q.x + 20, y: q.y })) }; f.fils.push(c); nv.add(c.id); }
  SU.sel = nv; commit(); majInsp(); dessiner();
}
EXT.toucheSchema = (e, k) => {
  if (SU.test) { if (k === 'escape') basculerTest(false); return; } // mode test : le schéma n'est pas modifiable
  if (k === 'escape') { if (SU.fil) { SU.fil = null; majHint(); dessiner(); } else if (SU.tool !== 'select') setOutil('select'); else { SU.sel.clear(); majInsp(); dessiner(); } return; }
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); supprimerSel(); return; }
  if (k === 'enter' && SU.fil) { finirFil(); return; }
  if (k === 'r') { tourner(90); return; }
  if (k === 'v') { setOutil('select'); return; }
  if (k === 'w' || k === 'f') { setOutil('fil'); return; }
  if (k === 't') { setOutil('texte'); return; }
  if (k === 's') { ouvrirBibliotheque(); return; }
};

/* ---------------- barre d'outils, barre des folios, bandeau d'aide ---------------- */
const ICO = {
  select: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M5 3.5l13 7.2-5.6 1.4-2.6 5.4z"/></svg>',
  fil: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V9h8v10h8V5"/><circle cx="4" cy="19" r="1.4" fill="currentColor"/><circle cx="20" cy="5" r="1.4" fill="currentColor"/></svg>',
  sym: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 3v6M12 15v6"/><path d="M12 15L7.5 8.5"/><path d="M5 12h3" stroke-dasharray="1.5 1.5"/><rect x="15" y="9" width="6" height="6"/></svg>',
  texte: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 7V4.5h14V7M12 4.5v15M9 19.5h6"/></svg>',
  rot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M20 4v5h-5"/></svg>',
  mir: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"><path d="M12 3v18" stroke-dasharray="2 2"/><path d="M9 7L4 17h5zM15 7l5 10h-5z"/></svg>',
  del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>',
};
function majOutils() {
  const nav = $('#schTools'); if (!nav) return;
  const b = (id, lab, ico, fn, titre) => { const x = h('button', { type: 'button', class: 'tool', 'data-stool': id, title: titre || lab, 'aria-pressed': String(SU.tool === id || (id === 'sym' && SU.tool === 'place')), html: ICO[ico] }); x.append(lab); x.addEventListener('click', fn); return x; };
  nav.replaceChildren(
    b('select', 'Sélection', 'select', () => setOutil('select'), 'Sélection (V)'),
    b('fil', 'Fil', 'fil', () => setOutil('fil'), 'Tracer un fil (W)'),
    b('sym', 'Symboles', 'sym', ouvrirBibliotheque, 'Bibliothèque de symboles (S)'),
    b('texte', 'Texte', 'texte', () => setOutil('texte'), 'Texte (T)'),
    h('div', { class: 'tsep' }),
    b('rot', 'Tourner', 'rot', () => tourner(90), 'Tourner de 90° (R)'),
    b('mir', 'Miroir', 'mir', miroir, 'Retourner le symbole'),
    b('del', 'Supprimer', 'del', supprimerSel, 'Supprimer la sélection'));
}
function majBarre() {
  const bar = $('#schBar'); if (!bar) return;
  const fs = sch().folios;
  /* toucher le folio affiché ouvre ou ferme son panneau (utile en portrait) */
  const chips = fs.map((f, i) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(i === SU.fi), title: f.titre, onclick: () => { if (i === SU.fi) { SU.inspOuvert = !SU.inspOuvert; SU.sel.clear(); majInsp(); dessiner(); } else allerFolio(i); } }, `${i + 1} · ${f.titre}`));
  chips.push(h('button', { type: 'button', class: 'chip', id: 'schNouveau', title: 'Nouveau folio', onclick: () => ajouterFolio() }, '+ Folio'));
  bar.replaceChildren(h('div', { class: 'sch-folios' }, chips),
    h('div', { class: 'sch-acts' }, h('button', { type: 'button', class: 'btn sm' + (SU.test ? ' pri' : ''), id: 'schTester', 'aria-pressed': String(!!SU.test), title: 'Tester le fonctionnement du schéma', onclick: () => basculerTest() }, SU.test ? 'Tester : actif' : 'Tester'), btn('Modèles', ouvrirModeles, 'sm'), btn('Depuis le tableau', importerTableau, 'sm'), btn('Listes', () => ouvrirListes('nom'), 'sm'), btn('Exporter', ouvrirExport, 'sm pri')));
}
function majHint() {
  const el = $('#schHint'); if (!el) return;
  let k = null;
  if (SU.test) k = [h('b', null, 'Tester'), h('span', { class: 'msg' }, 'Touchez les commandes encadrées en vert ; fils sous tension en couleur.'), btn('Repos', () => { SU.simE = SIM.etatInitial(); recalculer(); majInsp(); dessiner(); }, 'sm'), btn('Quitter', () => basculerTest(false), 'pri sm')];
  else if (SU.tool === 'fil') k = [h('b', null, 'Fil'), h('span', { class: 'msg' }, SU.fil ? 'Touchez le point suivant : le fil se termine sur une borne ou un autre fil.' : 'Touchez une borne (point orange) ou un fil pour commencer.'),
    SU.fil ? btn('Terminer le fil', finirFil, 'sm') : null, btn('Fermer', () => setOutil('select'), 'pri sm')];
  else if (SU.tool === 'place' && SU.place) k = [h('b', null, SYM_BY.get(SU.place).n), h('span', { class: 'msg' }, 'Touchez la feuille pour le poser (plusieurs fois si besoin). Posé sur un fil, il s’y insère.'),
    btn('Tourner', () => tourner(90), 'sm'), btn('Autre symbole', ouvrirBibliotheque, 'sm'), btn('Terminer', () => setOutil('select'), 'pri sm')];
  else if (SU.tool === 'texte') k = [h('b', null, 'Texte'), h('span', { class: 'msg' }, 'Touchez la feuille à l’endroit du texte.'), btn('Fermer', () => setOutil('select'), 'pri sm')];
  el.hidden = !k; if (k) el.replaceChildren(...k.filter(Boolean));
}
function allerFolio(i, idSel) { if (SU.fil) finirFil(); SU.fi = clamp(i, 0, Math.max(0, sch().folios.length - 1)); SU.sel = new Set(idSel ? [idSel] : []); majTout(); }
function ajouterFolio(titre, type) { const f = SC.nouveauFolio(titre || `Folio ${sch().folios.length + 1}`, type || 'developpe'); sch().folios.push(f); commit(); allerFolio(sch().folios.length - 1); return f; }

/* ---------------- bibliothèque ---------------- */
let lib = null, libCat = 'commande', libQ = '';
function vignette(t, taille) {
  const c = h('canvas', { width: taille * 2, height: taille * 2, style: `width:${taille}px;height:${taille}px` });
  const d = SYM_BY.get(t), g = c.getContext('2d'), b = d.boite, w = b.x1 - b.x0, hh = b.y1 - b.y0, k = Math.min((taille * 2 - 12) / w, (taille * 2 - 12) / hh);
  g.setTransform(k, 0, 0, k, taille - ((b.x0 + b.x1) / 2) * k, taille - ((b.y0 + b.y1) / 2) * k);
  dessinerSymbole(g, { t, x: 0, y: 0, rot: 0 }, getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#1D2125');
  return c;
}
function ouvrirBibliotheque() {
  if (!lib) { lib = h('div', { class: 'pop sch-lib', id: 'schLib', hidden: true, role: 'dialog', 'aria-label': 'Symboles du schéma' }); document.body.append(lib); }
  rendreBibliotheque(); lib.hidden = false;
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, tb = $('#schTools').getBoundingClientRect();
  if (vw <= 760) { lib.classList.add('sheet'); $('#scrim').hidden = false; }
  else { lib.classList.remove('sheet'); const w = Math.min(560, vw - tb.right - 32); Object.assign(lib.style, { left: tb.right + 10 + 'px', top: tb.top + 'px', width: w + 'px', maxHeight: Math.min(vh - tb.top - 16, 680) + 'px' }); }
}
function rendreBibliotheque() {
  const q = libQ.trim().toLowerCase();
  const liste = q ? SYMBOLES.filter((s) => (s.n + ' ' + s.pre + ' ' + s.t).toLowerCase().includes(q)) : SYMBOLES.filter((s) => s.cat === libCat);
  const rech = h('input', { type: 'search', class: 'txt', placeholder: 'Chercher : contacteur, moteur, borne…', value: libQ, 'aria-label': 'Chercher un symbole' });
  rech.addEventListener('input', () => { libQ = rech.value; rendreBibliotheque(); const r = lib.querySelector('input'); if (r) { r.focus(); r.setSelectionRange(r.value.length, r.value.length); } });
  const carte = (s) => h('button', { type: 'button', class: 'card', 'data-sym': s.t, onclick: () => { lib.hidden = true; $('#scrim').hidden = true; setOutil('place', s.t); } }, vignette(s.t, 40), h('span', null, s.n), s.pre ? h('small', null, s.pre + '…') : null);
  lib.replaceChildren(...[
    h('div', { class: 'pop-head' }, h('h2', null, 'Symboles'), h('button', { type: 'button', class: 'btn sm', onclick: () => { lib.hidden = true; $('#scrim').hidden = true; } }, 'Fermer')),
    h('div', { class: 'cat-search' }, rech),
    h('div', { class: 'tabs dom' }, CATEGORIES.map((c) => h('button', { type: 'button', class: 'tab', 'aria-pressed': String(!q && c.id === libCat), onclick: () => { libCat = c.id; libQ = ''; rendreBibliotheque(); } }, c.n))),
    SU.recents.length && !q ? h('div', { class: 'tabs subs' }, h('span', { class: 'note', style: 'align-self:center' }, 'Récents :'), SU.recents.map((t) => h('button', { type: 'button', class: 'tab', onclick: () => { lib.hidden = true; setOutil('place', t); } }, SYM_BY.get(t).n))) : null,
    h('div', { class: 'grid-cat' }, liste.map(carte)),
    h('p', { class: 'note', style: 'padding:0 14px 12px' }, 'Symboles inspirés de la CEI 60617, dessinés par Calque (représentation simplifiée). Le repère est donné automatiquement ; un contact prend le repère de la dernière bobine posée.')].filter(Boolean));
}
document.addEventListener('pointerdown', (e) => { if (lib && !lib.hidden && !lib.contains(e.target) && !e.target.closest('[data-stool="sym"], #schHint')) { lib.hidden = true; } }, true);

/* ---------------- panneau de propriétés ---------------- */
function majInsp() {
  const box = $('#schInsp'); if (!box || !actif()) return;
  const ae = document.activeElement, focusId = ae && box.contains(ae) ? ae.id : null;
  const f = folio(); let parts;
  if (!f) parts = videInsp();
  else if (SU.test) parts = testInsp();
  else if (SU.sel.size === 1) { const o = objetParId([...SU.sel][0]); parts = !o ? folioInsp(f) : o.t ? symInsp(o) : o.pts ? filInsp(o) : texteInsp(o); }
  else if (SU.sel.size > 1) parts = [inspHead(`${SU.sel.size} éléments`, 'Sélection'), body(sec(null, btns(btn('Tourner', () => tourner(90), 'sm'), btn('Dupliquer', dupliquerSel, 'sm'), btn('Supprimer', supprimerSel, 'sm danger'))), h('p', { class: 'note' }, 'Faites glisser un élément pour déplacer toute la sélection (les fils raccordés suivent).'))];
  else parts = folioInsp(f);
  box.replaceChildren(...parts.filter(Boolean));
  /* écran étroit (iPad en portrait, téléphone) : panneau fermé tant que rien n'est sélectionné, comme dans la vue Plan */
  const etroit = window.matchMedia('(max-width: 1099px)').matches;
  box.classList.toggle('closed', etroit && !SU.test && !SU.sel.size && !SU.inspOuvert && !!f);
  const x = box.querySelector('.insp-head .x');
  if (x) x.onclick = (ev) => { ev.stopPropagation(); SU.inspOuvert = false; SU.sel.clear(); box.classList.add('closed'); dessiner(); };
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus(); }
}
function videInsp() {
  return [inspHead('Schémas électriques', 'Indépendants du plan du bâtiment'), body(
    h('p', { class: 'note' }, 'Dessinez ici des schémas développés (commande et puissance), de distribution, de borniers ou de principe, sur des folios A3 avec cartouche. Repères, numéros de fils, renvois croisés, nomenclature et borniers sont calculés automatiquement.'),
    sec('Commencer', btns(btn('Folio vide', () => ajouterFolio(), 'pri'), btn('Modèles', ouvrirModeles), btn('Depuis le tableau du plan', importerTableau))))];
}
function folioInsp(f) {
  const fs = sch().folios, i = SU.fi;
  const typ = h('select', { class: 'txt', id: 'sch-ftype', 'aria-label': 'Type de folio' }, Object.entries(SC.TYPES_FOLIO).map(([k, n]) => h('option', { value: k, selected: f.type === k }, n)));
  typ.addEventListener('change', () => { f.type = typ.value; commit(); majBarre(); dessiner(); });
  const ctl = SC.controlesSchema(sch());
  return [inspHead(`Folio ${i + 1} / ${fs.length}`, SC.TYPES_FOLIO[f.type] || ''), body(
    sec('Titre', textField(null, f.titre, (v) => { f.titre = v.trim() || f.titre; commit(); majBarre(); dessiner(); }, { id: 'sch-ftitre', ph: 'Titre du folio' })),
    sec('Type', typ),
    sec('Contenu', kv([['Symboles', String(f.syms.length)], ['Fils', String(f.fils.length)], ['Textes', String(f.textes.length)]])),
    sec('Folio', btns(btn('◀', () => deplacerFolio(-1), 'sm'), btn('▶', () => deplacerFolio(1), 'sm'), btn('Dupliquer', dupliquerFolio, 'sm'), btn('Supprimer', supprimerFolio, 'sm danger'))),
    ctl.length ? sec('Contrôles du schéma', h('div', { class: 'ev-list' }, ctl.slice(0, 8).map((x) => h('div', { class: 'ev-chk ' + (x.niveau === 'erreur' ? 'err' : x.niveau === 'avertissement' ? 'warn' : 'info') }, h('span', { class: 'ic' }, x.niveau === 'suggestion' ? 'i' : '!'), h('span', { class: 'tx' }, x.msg)))),
      ctl.length > 8 ? btns(btn(`Tout voir (${ctl.length})`, () => ouvrirListes('ctl'), 'sm')) : null) : null,
    h('p', { class: 'note' }, 'Outils à gauche : Fil pour relier les bornes (points orange), Symboles pour la bibliothèque. Touchez un symbole pour modifier son repère et sa désignation.'))];
}
function deplacerFolio(d) { const fs = sch().folios, i = SU.fi, j = i + d; if (j < 0 || j >= fs.length) return; [fs[i], fs[j]] = [fs[j], fs[i]]; commit(); allerFolio(j); }
function dupliquerFolio() { const f = folio(); const c = JSON.parse(JSON.stringify(f)); c.id = 'f' + Math.random().toString(36).slice(2, 9); c.titre = f.titre + ' (copie)'; const rid = (x) => { x.id = x.id.replace(/^[a-z]+/, (m) => m) + 'c' + Math.random().toString(36).slice(2, 5); }; c.syms.forEach(rid); c.fils.forEach(rid); c.textes.forEach(rid); sch().folios.splice(SU.fi + 1, 0, c); commit(); allerFolio(SU.fi + 1); toast('Folio dupliqué : pensez à changer les repères en double (contrôles du schéma).'); }
function supprimerFolio() {
  const f = folio(); if (!f) return;
  openModal('Supprimer le folio', h('p', null, `Supprimer « ${f.titre} » (${f.syms.length} symboles, ${f.fils.length} fils) ? « Annuler » le rétablit.`),
    btns(btn('Supprimer', () => { sch().folios.splice(SU.fi, 1); closeModal(); commit(); allerFolio(SU.fi - (SU.fi >= sch().folios.length ? 1 : 0)); }, 'danger'), btn('Garder', closeModal)));
}
function symInsp(s) {
  const d = SYM_BY.get(s.t), S0 = sch(), app = SC.appareils(S0), eq = SC.equipotentielles(S0), pos = SC.position(SU.fi, s.x);
  const set = (k, v) => { v = String(v).trim(); if (v) s[k] = v.slice(0, k === 'des' ? 120 : 30); else delete s[k]; commit(); majInsp(); majBarre(); dessiner(); };
  const parts = [];
  if (d.role === 'pot' || d.role === 'renvoi') {
    parts.push(sec(d.role === 'pot' ? 'Nom du potentiel' : 'Nom du renvoi', textField(null, s.num, (v) => set('num', v), { id: 'sch-snum', ph: d.role === 'pot' ? 'L1, N, PE, 24V…' : 'Même nom sur l’autre folio' }),
      h('div', { class: 'chips' }, (d.role === 'pot' ? ['L', 'N', 'L1', 'L2', 'L3', 'PE', '24V', '0V'] : ['R1', 'R2', 'R3']).map((v) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.num === v), onclick: () => set('num', v) }, v))),
      h('p', { class: 'note' }, d.role === 'pot' ? 'Tous les fils qui portent le même nom de potentiel sont reliés, sur tous les folios.' : 'Relie ce fil au renvoi de même nom sur un autre folio ; la position du correspondant s’affiche à côté.')));
  } else {
    const fam = d.role === 'contact' ? [...app.values()].filter((a) => (SC.FAMILLES[d.pre] || [d.pre]).includes(a.pre) && (a.bobines.length || a.autres.length)).map((a) => a.rep) : [];
    parts.push(sec('Repère', textField(null, s.rep, (v) => set('rep', v.toUpperCase()), { id: 'sch-srep', ph: d.pre ? d.pre + '1' : 'Repère' }),
      fam.length ? h('div', null, h('p', { class: 'note' }, 'Appartient à l’appareil :'), h('div', { class: 'chips' }, fam.map((r) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String(s.rep === r), onclick: () => set('rep', r) }, r)))) : null,
      d.pre && d.role !== 'contact' && d.role !== 'borne' ? btns(btn('Repère suivant libre', () => set('rep', SC.prochainRepere(S0, d.pre)), 'sm')) : null));
    if (d.role === 'borne') parts.push(sec('Numéro de borne', textField(null, s.num, (v) => set('num', v), { id: 'sch-snum', ph: '1' })));
    parts.push(sec('Désignation', textField(null, s.des, (v) => set('des', v), { id: 'sch-sdes', ph: 'Fonction : Marche, Moteur pompe, Éclairage…' })));
    parts.push(sec('Référence du matériel', textField(null, s.ref, (v) => set('ref', v), { id: 'sch-sref', ph: 'Saisie (facultative)' }), h('p', { class: 'note' }, 'Référence saisie par vous : Calque n’en propose aucune.')));
  }
  /* bornes et potentiels */
  const noms = SC.nomsBornes(s, app);
  if (d.role !== 'pot' && d.role !== 'renvoi') parts.push(sec('Bornes', kv(d.bornes.map((b, i) => { const n = eq.parBorne.get(`${s.id}:${i}`); return [noms[i] || b.n, n ? h('span', { class: 'sch-net' }, n.nom) : h('span', { class: 'note' }, 'non raccordée')]; }))));
  /* renvois croisés */
  if (d.role === 'bobine' && s.rep) { const a = app.get(s.rep); parts.push(sec('Contacts de cet appareil', a && a.contacts.length ? h('div', { class: 'list' }, a.contacts.map((e) => h('button', { type: 'button', class: 'li', style: 'width:100%;border:0;background:transparent;text-align:left', onclick: () => allerFolio(e.fi, e.s.id) }, h('span', null, `${e.d.type === 'P' ? 'Puissance' : (e.num || []).join('-') + ' ' + e.d.type}`), h('span', { class: 'v' }, e.pos)))) : h('p', { class: 'note' }, 'Aucun contact : posez un contact et donnez-lui le repère ' + s.rep + '.'))); }
  if (d.role === 'contact' && s.rep) { const a = app.get(s.rep), b = a && (a.bobines[0] || a.autres[0]); parts.push(sec('Appareil', b ? btns(btn(`${b.d.n} ${s.rep} : ${b.pos}`, () => allerFolio(b.fi, b.s.id), 'sm')) : h('p', { class: 'note', style: 'color:var(--bad)' }, `Aucune bobine ${s.rep} : renvoi impossible.`))); }
  parts.push(sec('Orientation', btns(btn('Tourner 90°', () => tourner(90), 'sm'), btn('Miroir', miroir, 'sm'))));
  parts.push(sec(null, btns(btn('Dupliquer', dupliquerSel, 'sm'), btn('Supprimer', supprimerSel, 'sm danger'))));
  return [inspHead(`${d.n}${s.rep ? ' · ' + s.rep : ''}`, `Folio ${SU.fi + 1}, colonne ${SC.colonne(s.x)} (${pos})`), body(...parts)];
}
function filInsp(w) {
  const S0 = sch(), eq = SC.equipotentielles(S0), n = eq.parFil.get(w.id), lf = SC.listeFils(S0, eq).find((x) => n && x.nom === n.nom);
  return [inspHead('Fil', n ? `Potentiel ${n.nom}${n.auto ? ' (numéro automatique)' : ''}` : ''), body(
    sec('Numéro ou nom imposé', textField(null, w.num, (v) => { v = v.trim(); if (v) w.num = v.slice(0, 20); else delete w.num; commit(); majInsp(); dessiner(); }, { id: 'sch-wnum', ph: 'Automatique' }),
      h('p', { class: 'note' }, 'Laissez vide pour la numérotation automatique (folio × 100 + rang). Une étiquette de potentiel (L1, N, 24V…) donne son nom à tout le fil.')),
    lf ? sec('Relie', h('p', null, lf.connexions.length ? lf.connexions.join(' · ') : 'aucune borne'), kv([['Folios', lf.folios.join(', ')]])) : null,
    h('p', { class: 'note' }, 'Faites glisser un bout pour le raccrocher, ou un tronçon pour le décaler.'),
    sec(null, btns(btn('Supprimer', supprimerSel, 'sm danger'))))];
}
function texteInsp(t) {
  const c = () => { commit(); dessiner(); };
  return [inspHead('Texte', `Folio ${SU.fi + 1}`), body(
    sec('Texte', textField(null, t.s, (v) => { if (v.trim()) { t.s = v.slice(0, 200); c(); } }, { id: 'sch-ts' })),
    sec('Taille', h('div', { class: 'chips' }, [2.5, 3.5, 5, 7].map((v) => h('button', { type: 'button', class: 'chip', 'aria-pressed': String((t.taille || 3) === v), onclick: () => { t.taille = v; c(); majInsp(); } }, v + ' mm')))),
    sec('Style', btns(btn(t.gras ? 'Normal' : 'Gras', () => { if (t.gras) delete t.gras; else t.gras = true; c(); majInsp(); }, 'sm'), btn('Tourner', () => tourner(90), 'sm'))),
    sec(null, btns(btn('Supprimer', supprimerSel, 'sm danger'))))];
}

/* ---------------- modèles et import du tableau ---------------- */
function ouvrirModeles() {
  openModal('Modèles de schémas', h('p', { class: 'note' }, 'Chaque modèle ajoute un folio complet et modifiable. Les repères déjà utilisés dans le projet sont renumérotés.'),
    h('div', { class: 'list' }, SC.MODELES.map((m) => h('div', { class: 'proj-li' }, h('div', null, h('b', null, m.n), h('small', null, m.d)),
      btn('Ajouter', () => { const f = SC.appliquerModele(sch(), m.id); closeModal(); commit(); allerFolio(sch().folios.indexOf(f)); toast(`Folio « ${m.n} » ajouté.`); }, 'pri sm')))));
}
function importerTableau() {
  if (!(P.circuits || []).length) { toast('Le tableau du plan est vide : générez-le dans l’onglet Tableau électrique.'); return; }
  const inst = P.install || {};
  const fs = SC.depuisTableau(sch(), P, { reperes: circNumbers(), arrivee: Number.isFinite(inst.kva) ? `Arrivée : disjoncteur de branchement ${agcpLabel(inst.kva, inst.reseau)} (${inst.kva} kVA, valeurs estimées)` : '' });
  commit(); allerFolio(sch().folios.indexOf(fs[0]));
  toast(`${fs.length} folio${fs.length > 1 ? 's' : ''} de distribution créé${fs.length > 1 ? 's' : ''} depuis le tableau (copie modifiable, sans lien ensuite).`);
}

/* ---------------- listes : nomenclature, borniers, fils, contrôles ---------------- */
function aller(fi, id) { closeModal(); allerFolio(fi, id); }
function ouvrirListes(onglet) {
  const S0 = sch(), eq = SC.equipotentielles(S0);
  const tab = (id, n) => h('button', { type: 'button', 'aria-pressed': String(onglet === id), onclick: () => ouvrirListes(id) }, n);
  const table = (cols, rows) => h('div', { class: 'ev-table' }, h('table', { class: 'sch-tab' }, h('thead', null, h('tr', null, cols.map((c) => h('th', null, c)))), h('tbody', null, rows)));
  let corps;
  if (onglet === 'nom') { const n = SC.nomenclature(S0); corps = [table(['Repère', 'Appareil', 'Désignation', 'Composition', 'Référence', 'Folio'], n.lignes.map((l) => h('tr', null, h('td', null, h('b', null, l.rep)), h('td', null, l.appareil), h('td', null, l.des || '—'), h('td', null, l.composition), h('td', null, l.ref || h('span', { class: 'note' }, 'à saisir')), h('td', null, l.positions.join(', '))))),
    h('h3', null, 'Quantités'), table(['Appareil', 'Quantité'], n.quantites.map((q) => h('tr', null, h('td', null, q.appareil), h('td', null, String(q.n)))))]; }
  else if (onglet === 'bor') { const b = SC.borniers(S0, eq); corps = b.length ? b.map((x) => [h('h3', null, `Bornier ${x.rep} (${x.bornes.length} bornes)`), table(['Borne', 'Potentiel', 'Désignation', 'Folio'], x.bornes.map((r) => h('tr', null, h('td', null, h('b', null, r.num)), h('td', null, h('span', { class: 'sch-net' }, r.potentiel)), h('td', null, r.des || '—'), h('td', null, r.pos))))]).flat() : [h('p', { class: 'note' }, 'Aucune borne : posez des « Bornes de bornier » (catégorie Bornes et renvois).')]; }
  else if (onglet === 'fils') { const l = SC.listeFils(S0, eq); corps = [table(['Fil', 'Relie', 'Folios'], l.map((x) => h('tr', null, h('td', null, h('span', { class: 'sch-net' }, x.nom)), h('td', null, x.connexions.join(' · ') || '—'), h('td', null, x.folios.join(', ')))))]; }
  else { const c = SC.controlesSchema(S0); corps = c.length ? [h('div', { class: 'ev-list' }, c.map((x) => h('div', { class: 'ev-chk ' + (x.niveau === 'erreur' ? 'err' : x.niveau === 'avertissement' ? 'warn' : 'info') }, h('span', { class: 'ic' }, x.niveau === 'suggestion' ? 'i' : '!'), h('span', { class: 'tx' }, h('span', { class: 'ci-niv ' + x.niveau }, x.niveau), x.msg), x.sym != null ? btn('Voir', () => aller(x.fi, x.sym), 'sm') : null)))] : [h('p', { class: 'note' }, 'Aucun constat.')]; }
  openModal('Listes du schéma', h('div', { class: 'seg' }, tab('nom', 'Nomenclature'), tab('bor', 'Borniers'), tab('fils', 'Fils'), tab('ctl', 'Contrôles')), ...corps,
    h('p', { class: 'note' }, 'Calculées depuis les folios : toute modification du schéma s’y reporte. Constats de Calque, pas une vérification réglementaire.'));
  const m = $('#modal'); if (m) m.style.width = 'min(860px, calc(100vw - 32px))';
}

/* ---------------- exports ---------------- */
/* pages des listes dessinées comme des folios (cadre et cartouche identiques) */
function pagesListes(S0) {
  const eq = SC.equipotentielles(S0), app = SC.appareils(S0), n = SC.nomenclature(S0), b = SC.borniers(S0, eq), lf = SC.listeFils(S0, eq);
  const tables = [
    { titre: 'Nomenclature', cols: [['Repère', 22], ['Appareil', 90], ['Désignation', 90], ['Composition', 110], ['Référence', 50], ['Folio', 38]], rows: n.lignes.map((l) => [l.rep, l.appareil, l.des || '—', l.composition, l.ref || 'à saisir', l.positions.join(', ')]) },
    ...b.map((x) => ({ titre: `Bornier ${x.rep}`, cols: [['Borne', 25], ['Potentiel', 40], ['Désignation', 200], ['Folio', 40]], rows: x.bornes.map((r) => [r.num, r.potentiel, r.des || '—', r.pos]) })),
    { titre: 'Liste des fils', cols: [['Fil', 25], ['Relie', 300], ['Folios', 50]], rows: lf.map((x) => [x.nom, x.connexions.join(' · ') || '—', x.folios.join(', ')]) },
  ];
  const pages = [];
  for (const t of tables) { const par = 40; for (let i = 0; i < Math.max(1, t.rows.length); i += par) pages.push({ titre: t.titre + (i ? ' (suite)' : ''), cols: t.cols, rows: t.rows.slice(i, i + par) }); }
  void app;
  return pages;
}
function dessinerListe(c, pg) {
  const z = SC.ZONE; let y = z.y0 + 10;
  c.fillStyle = '#1D2125'; c.font = 'bold 6px Helvetica, Arial, sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(pg.titre, z.x0 + 6, y); y += 10;
  let x = z.x0 + 6; c.font = 'bold 3px Helvetica, Arial, sans-serif'; for (const [n, w] of pg.cols) { c.fillText(n.toUpperCase(), x, y); x += w; }
  c.strokeStyle = '#1D2125'; c.lineWidth = 0.3; c.beginPath(); c.moveTo(z.x0 + 6, y + 2.5); c.lineTo(z.x1 - 6, y + 2.5); c.stroke(); y += 6.5;
  c.font = '3px Helvetica, Arial, sans-serif';
  for (const r of pg.rows) {
    x = z.x0 + 6;
    r.forEach((v, i) => { let s = String(v); const w = pg.cols[i][1] - 3; while (s.length > 3 && c.measureText(s).width > w) s = s.slice(0, -2) + '…'; c.fillText(s, x, y); x += pg.cols[i][1]; });
    c.strokeStyle = '#C9CFC9'; c.lineWidth = 0.15; c.beginPath(); c.moveTo(z.x0 + 6, y + 2.6); c.lineTo(z.x1 - 6, y + 2.6); c.stroke(); y += 5.2;
  }
}
async function dossierPdf() {
  const S0 = sch(), listes = pagesListes(S0);
  const tout = { folios: [...S0.folios, ...listes.map((l) => ({ id: 'liste', titre: l.titre, type: 'libre', syms: [], fils: [], textes: [] }))] };
  const app = SC.appareils(S0), eq = SC.equipotentielles(S0), ca = cartouche();
  const pages = [];
  tout.folios.forEach((f, i) => {
    const W0 = SC.FEUILLE.W * PT_MM, H0 = SC.FEUILLE.H * PT_MM, c = new PdfCtx(W0, H0);
    c.scale(PT_MM, PT_MM); c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, SC.FEUILLE.W, SC.FEUILLE.H);
    SC.dessinerFolio(c, tout, i, { cartouche: ca, app, eq, exporter: true });
    if (i >= S0.folios.length) dessinerListe(c, listes[i - S0.folios.length]);
    pages.push({ W: W0, H: H0, ctx: c });
  });
  return { blob: await buildPdf(pages, `${P.name || 'Projet'} — schémas électriques`), pages: pages.length };
}
function svgFolio(fi) {
  const S0 = sch(), c = new SvgCtx();
  SC.dessinerFolio(c, S0, fi, { cartouche: cartouche(), exporter: true });
  return c.svg({ x0: 0, y0: 0, x1: SC.FEUILLE.W, y1: SC.FEUILLE.H }, `${P.name || 'Projet'} — folio ${fi + 1} ${S0.folios[fi].titre}`, 'mm');
}
function dxfFolio(fi) {
  const S0 = sch(), c = new DxfCtx();
  c.scale(0.1, 0.1); // millimètres de la feuille → centimètres de DxfCtx, écrits ensuite en millimètres
  SC.dessinerFolio(c, S0, fi, { cartouche: cartouche(), exporter: true });
  return buildDxf(c.ent, { unite: 'mm' });
}
function ouvrirExport() {
  if (!sch().folios.length) { toast('Aucun folio à exporter.'); return; }
  const base = slug(P.name || 'projet') + '-schemas', fi = SU.fi;
  const fichier = { f: null };
  const zone = h('div', { class: 'btns exp-btns' });
  const prepare = async (fmt) => {
    zone.replaceChildren(h('span', { class: 'note' }, 'Préparation…'));
    try {
      if (fmt === 'pdf') { const r = await dossierPdf(); fichier.f = new File([r.blob], base + '.pdf', { type: 'application/pdf' }); }
      else if (fmt === 'svg') fichier.f = new File([svgFolio(fi)], `${base}-folio${fi + 1}.svg`, { type: 'image/svg+xml' });
      else fichier.f = new File([dxfOctets(dxfFolio(fi))], `${base}-folio${fi + 1}.dxf`, { type: 'application/dxf' });
      zone.replaceChildren(h('span', { class: 'note', style: 'flex-basis:100%' }, `${fichier.f.name} prêt.`), ...fileActions(() => fichier.f, false, null));
      for (const b of zone.querySelectorAll('.exp-act')) b.disabled = false;
    } catch (err) { console.error(err); zone.replaceChildren(h('span', { class: 'note', style: 'color:var(--bad)' }, 'Impossible de préparer le fichier.')); }
  };
  openModal('Exporter les schémas',
    h('p', { class: 'note' }, `PDF : dossier complet (${sch().folios.length} folio${sch().folios.length > 1 ? 's' : ''}, nomenclature, borniers, liste des fils) en A3 paysage. SVG et DXF : folio affiché (${fi + 1}), en vraie grandeur (millimètres).`),
    btns(btn('Dossier PDF', () => prepare('pdf'), 'pri'), btn('Folio en SVG', () => prepare('svg')), btn('Folio en DXF', () => prepare('dxf'))), zone);
}

/* ---------------- affichage de l'onglet ---------------- */
function majTout() { majOutils(); majBarre(); majHint(); majInsp(); requestAnimationFrame(() => { redim(); peindre(); }); }
EXT.view.push((v) => { if (v === 'schema') { if (SU.fi >= sch().folios.length) SU.fi = 0; majTout(); } });
on(EV.PLAN_OUVERT, () => { SU.test = false; SU.simR = null; SU.fi = 0; SU.sel.clear(); SU.fil = null; SU.ajuste = true; if (actif()) majTout(); });
on(EV.PLAN_CHANGE, (x) => { if (!actif() || (x && x.leger)) return; if (SU.test) recalculer(); if (SU.fi >= sch().folios.length) SU.fi = Math.max(0, sch().folios.length - 1); for (const id of [...SU.sel]) if (!objetParId(id)) SU.sel.delete(id); majBarre(); majInsp(); dessiner(); });

export { basculerTest };
export { SU as ETAT_SCHEMA, ajouterFolio, allerFolio, dossierPdf, dxfFolio, filTap, finirFil, importerTableau, majTout, ouvrirListes, poser, setOutil, supprimerSel, svgFolio };

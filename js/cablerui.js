/* Calque — module « cablerui » : câblage sur le plan.
   - Dessin du câblage (calque « Circuits et câblage ») : sur chaque tronçon de gaine, des traits obliques indiquent le
     nombre de conducteurs (symbole usuel des plans d'électricité) et la désignation de chaque circuit (C3 · 3G2,5).
   - Mise en évidence du circuit sélectionné : arbre du circuit le long des gaines, points non raccordés.
   - Outil « Câbler » : relier deux équipements (ou piquer une dérivation sur une gaine), le tracé est PROPOSÉ puis
     créé seulement après validation ; enchaînement de plusieurs points (luminaires d'un même circuit).
   - Raccordement automatique des circuits : propositions affichées sur le plan, à valider ou refuser.
   Le moteur de calcul est js/cablage.js (sans écran). Rien n'est modifié sans geste de l'utilisateur. */
import { EXT, IDX, P, S, bboxOf, saveSettings, ui, vdist, vmid } from './noyau.js';
import { FONT_LABEL, RC, TS, VIEW, bbInView, setScreen, setWorld, textHalo, w2s } from './rendu2d.js';
import { ELEC_BY } from './symboles.js';
import { accepts, circById, circNumbers, circuitColor } from './electricite.js';
import { afterFilter, circsFiltre, creerGaineElec, ductAt, ductPts, ductVisible, elecVisible, famOn } from './reseaux.js';
import { TAP, commit, hitTest, hitTol, refreshUI, requestRender } from './interaction.js';
import { btn, h, renderInspector, setTool, toast, updateHint } from './interface.js';
import { calqueVisible, setCalqueVisible } from './calques.js';
import { cablagePlan, libelleCompo } from './cablage.js';
import { ancrage, isElecDuct, pointsGaine, TRAVERSEE } from './cheminement.js';
import { chercherItineraire, raccorderCircuit } from './itineraire.js';
import { V } from './rendu2d.js';
import { EV, on } from './evenements.js';

const ORANGE = '#D24F1A', ROUGE = '#C2362B';
const fmtM = (cm) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(cm / 100) + ' m';

/* ---------------- dessin du câblage ---------------- */
/* traits obliques (un par conducteur, au-delà de 6 : un trait et le nombre) au milieu d'un tronçon */
function traits(c, a, b, n, px, col) {
  const L = vdist(a, b); if (L < 1e-6) return;
  const u = { x: (b.x - a.x) / L, y: (b.y - a.y) / L }, nn = { x: -u.y, y: u.x };
  const m = vmid(a, b), t = 5 * px, pas = 3.2 * px;
  const k = n > 6 ? 1 : n;
  c.save(); c.strokeStyle = col; c.lineWidth = 1.3 * px; c.lineCap = 'round'; c.setLineDash([]);
  c.beginPath();
  for (let i = 0; i < k; i++) {
    const o = (i - (k - 1) / 2) * pas, cx = m.x + u.x * o, cy = m.y + u.y * o;
    c.moveTo(cx - nn.x * t - u.x * t * 0.6, cy - nn.y * t - u.y * t * 0.6); c.lineTo(cx + nn.x * t + u.x * t * 0.6, cy + nn.y * t + u.y * t * 0.6);
  }
  c.stroke(); c.restore();
  return { m, nn, u };
}
function dessinerCablage(c, lv, opts) {
  if (!S.layers.elec || !calqueVisible('circuits')) return;
  if (!P.circuits.length) return;
  const R = cablagePlan(P), px = RC.px, nums = circNumbers(), fc = circsFiltre();
  const libelles = [];
  for (const a of R.parArete.values()) {
    if (a.lv !== lv || a.kind !== 'h' || !a.a || !a.b || !a.duct) continue;
    const d = IDX.ducts.get(a.duct); if (!d || !ductVisible(d)) continue;
    if (VIEW && !bbInView(bboxOf([a.a, a.b]))) continue;
    const liste = fc ? a.liste.filter((x) => fc.has(x.cid)) : a.liste;
    if (!liste.length) continue;
    const n = liste.reduce((s, x) => s + x.n, 0);
    const Ls = vdist(a.a, a.b) * RC.s; // longueur à l'écran (px)
    if (Ls < 26) continue;
    const g = traits(c, a.a, a.b, n, px, RC.C.ink);
    if (!g) continue;
    if (n > 6) libelles.push({ p: { x: g.m.x + g.nn.x * 9 * px, y: g.m.y + g.nn.y * 9 * px }, t: String(n), col: RC.C.ink, petit: true });
    /* désignation de chaque circuit, si le tronçon est assez long à l'écran */
    if (Ls < 90) continue;
    const lignes = liste.length > 3 ? [{ t: `${liste.length} circuits · ${n} conducteurs`, col: RC.C.ink2 }]
      : liste.map((x) => ({ t: `${nums.get(x.cid) || ''} · ${x.libelle || x.des}`, col: (S.layers.circ !== false && circuitColor(x.cid, !!opts.export)) || RC.C.ink2 }));
    lignes.forEach((l, i) => libelles.push({ p: { x: g.m.x - g.nn.x * (14 + i * 11) * px, y: g.m.y - g.nn.y * (14 + i * 11) * px }, t: l.t, col: l.col, ang: Math.atan2(a.b.y - a.a.y, a.b.x - a.a.x) }));
  }
  if (!libelles.length) return;
  /* textes dans le repère de l'écran, toujours lisibles ; un même texte n'est pas répété à moins de 110 px */
  setScreen();
  const vus = [], boites = [];
  c.textAlign = 'center'; c.textBaseline = 'middle';
  for (const l of libelles) {
    const s = w2s(l.p);
    if (vus.some((v) => v.t === l.t && Math.hypot(v.x - s.x, v.y - s.y) < 110)) continue;
    let an = l.ang != null ? l.ang : 0; if (an > Math.PI / 2 + 0.01) an -= Math.PI; else if (an < -Math.PI / 2 + 0.01) an += Math.PI;
    c.font = `${l.petit ? 600 : 700} ${TS(l.petit ? 9.5 : 10)}px ${FONT_LABEL}`;
    /* pas de chevauchement entre deux textes (boîte englobante à l'écran) */
    const w = (c.measureText ? c.measureText(l.t).width : l.t.length * 5) + 4, hh = TS(11);
    const cs = Math.abs(Math.cos(an)), sn = Math.abs(Math.sin(an));
    const bw = w * cs + hh * sn, bh = w * sn + hh * cs;
    const b = { x0: s.x - bw / 2, y0: s.y - bh / 2, x1: s.x + bw / 2, y1: s.y + bh / 2 };
    if (boites.some((o) => o.x0 < b.x1 && o.x1 > b.x0 && o.y0 < b.y1 && o.y1 > b.y0)) continue;
    boites.push(b); vus.push({ t: l.t, x: s.x, y: s.y });
    c.save(); c.translate(s.x, s.y); if (an) c.rotate(an);
    c.fillStyle = l.col;
    textHalo(c, l.t, 0, 0); c.restore();
  }
  setWorld();
}
EXT.cablage.push(dessinerCablage);

/* circuit mis en évidence (ui.hl) : arbre le long des gaines, points non raccordés (écran seulement) */
function dessinerSurbrillance(c, lv, opts) {
  if (opts.export || !ui.hl || !P.circuits.length) return;
  const cab = cablagePlan(P).circuits.get(ui.hl); if (!cab) return;
  const col = circuitColor(ui.hl) || ORANGE, px = RC.px;
  c.save(); c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = col; c.globalAlpha = 0.38; c.lineWidth = 12 * px;
  c.beginPath();
  for (const t of cab.troncons) if (t.lv === lv && t.a && t.b && vdist(t.a, t.b) > 0.5) { c.moveTo(t.a.x, t.a.y); c.lineTo(t.b.x, t.b.y); }
  c.stroke(); c.restore();
  /* points non raccordés : cercle rouge en tirets */
  for (const id of cab.nonAtteints) {
    const e = IDX.elec.get(id); if (!e || e.lv !== lv) continue;
    const p = ancrage(e);
    c.save(); c.strokeStyle = ROUGE; c.lineWidth = 2 * px; c.setLineDash([4 * px, 3 * px]);
    c.beginPath(); c.arc(p.x, p.y, 20 * px, 0, Math.PI * 2); c.stroke(); c.restore();
  }
}
EXT.cablage.push(dessinerSurbrillance);

/* ---------------- outil « Câbler » ---------------- */
/* ui.cabler : { a: id du départ | null, pique: { x, y, duct } | null, b, res: tracé proposé, mode: 'route' | 'direct' } */
function departDe(st) {
  if (st.a) { const e = IDX.elec.get(st.a); return e ? ancrage(e) : null; }
  return st.pique ? { x: st.pique.x, y: st.pique.y } : null;
}
function circuitDepart(st) {
  if (st.a) { const e = IDX.elec.get(st.a); return e && e.cid ? e.cid : null; }
  if (st.pique) { const d = IDX.ducts.get(st.pique.duct); return d && d.cid ? d.cid : null; }
  return null;
}
function lvDepart(st) { if (st.a) { const e = IDX.elec.get(st.a); return e && e.lv; } if (st.pique) { const d = IDX.ducts.get(st.pique.duct); return d && d.lv; } return null; }
/* point de la gaine le plus proche (dérivation) */
function pointSurGaine(d, p) {
  const pts = pointsGaine(P, d, IDX.elec); let best = null;
  for (let i = 1; i < pts.length; i++) {
    const A = pts[i - 1], B = pts[i], L2 = (B.x - A.x) ** 2 + (B.y - A.y) ** 2; if (!L2) continue;
    const t = Math.max(0, Math.min(1, ((p.x - A.x) * (B.x - A.x) + (p.y - A.y) * (B.y - A.y)) / L2));
    const q = { x: Math.round((A.x + t * (B.x - A.x)) * 10) / 10, y: Math.round((A.y + t * (B.y - A.y)) * 10) / 10 }, dd = Math.hypot(q.x - p.x, q.y - p.y);
    if (!best || dd < best.d) best = { q, d: dd };
  }
  return best && best.q;
}
function trace(st, b) {
  const A = departDe(st), B = ancrage(b);
  if (!A) return null;
  if (st.mode === 'direct') {
    const pts = Math.abs(A.x - B.x) < 1 || Math.abs(A.y - B.y) < 1 ? [A, B] : [A, { x: B.x, y: A.y }, B];
    let len = 0; for (let i = 1; i < pts.length; i++) len += vdist(pts[i - 1], pts[i]);
    return { pts: pts.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })), len, murs: null, cloisons: null, croisements: null };
  }
  return chercherItineraire(P, b.lv, A, B, { pose: S.ductPose || null });
}
function proposer(b) {
  const st = ui.cabler;
  if (lvDepart(st) !== b.lv) { toast('Les deux points sont sur des niveaux différents : posez un passage entre étages sur chaque niveau et câblez jusqu’à lui.'); return; }
  st.b = b.id;
  st.res = trace(st, b);
  if (!st.res) { toast('Aucun itinéraire trouvé : une zone interdite ou des portes bloquent le passage. Essayez le tracé direct.'); st.mode = 'direct'; st.res = trace(st, b); }
  updateHint(); requestRender(true);
}
/* circuit(s) de la gaine et circuit proposé pour l'arrivée */
function bilanCircuits(st) {
  const b = IDX.elec.get(st.b); const ca = circuitDepart(st), cb = b && b.cid;
  const nums = circNumbers();
  if (ca && !cb && b && accepts(circById(ca).kind, b.type)) return { cid: ca, rejoint: true, msg: `${(ELEC_BY.get(b.type) || {}).n || 'Le point'} rejoindra le circuit ${nums.get(ca)} (dérivation).` };
  if (ca && cb && ca !== cb) return { cid: cb, cids: [ca], msg: `Deux circuits (${nums.get(ca)} et ${nums.get(cb)}) : la gaine portera les deux.` };
  if (ca || cb) return { cid: cb || ca, msg: `Circuit ${nums.get(cb || ca)}.` };
  return { cid: null, msg: 'Aucun circuit : la gaine sera commune (rattachez les appareils à un circuit pour compter les conducteurs).' };
}
function creer() {
  const st = ui.cabler; if (!st || !st.res || !st.b) return;
  const b = IDX.elec.get(st.b); if (!b) return;
  const bc = bilanCircuits(st);
  const g = { lv: b.lv, pts: st.res.pts, a: st.a || null, b: b.id, cid: bc.cid };
  const d = creerGaineElec(g);
  if (bc.cids) d.cids = bc.cids.filter((x) => x !== d.cid);
  if (bc.rejoint) b.cid = bc.cid;
  if (!calqueVisible('gaines')) setCalqueVisible('gaines', true);
  if (!famOn('gaines')) S.filt.off = S.filt.off.filter((x) => x !== 'gaines');
  saveSettings();
  commit();
  toast(`Gaine de ${fmtM(st.res.len)} créée${bc.rejoint ? ', point ajouté au circuit' : ''}. Touchez le point suivant pour continuer, ou Terminer.`);
  /* enchaînement : l'arrivée devient le départ du tracé suivant */
  ui.cabler = { a: b.id, pique: null, b: null, res: null, mode: st.mode };
  updateHint(); requestRender();
}
function tapCabler(wp) {
  const st = ui.cabler || (ui.cabler = { a: null, pique: null, b: null, res: null, mode: 'route' });
  const hh = hitTest(wp, hitTol());
  const e = hh && hh.t === 'elec' ? IDX.elec.get(hh.id) : null;
  if (!st.a && !st.pique) {
    if (e) { st.a = e.id; ui.sel = { t: 'elec', id: e.id }; renderInspector(); updateHint(); requestRender(); return; }
    const did = ductAt(wp, hitTol() / V.s);
    const d = did && IDX.ducts.get(did);
    if (d && isElecDuct(d)) { const q = pointSurGaine(d, wp); if (q) { st.pique = { x: q.x, y: q.y, duct: d.id }; updateHint(); requestRender(); return; } }
    toast('Touchez l’équipement de départ (tableau, boîte, appareil) ou une gaine pour une dérivation.');
    return;
  }
  if (e && e.id !== st.a) { proposer(e); return; }
  if (st.res) { st.res = null; st.b = null; updateHint(); requestRender(); return; }
  if (e && e.id === st.a) return;
  ui.cabler = null; ui.sel = null; renderInspector(); updateHint(); requestRender();
}
EXT.tools.cabler = {
  down(wp, sp) {
    let moved = false; const ox0 = V.ox, oy0 = V.oy;
    return {
      move(wp2, sp2) { if (!moved && Math.hypot(sp2.x - sp.x, sp2.y - sp.y) < TAP()) return; moved = true; V.ox = ox0 + sp2.x - sp.x; V.oy = oy0 + sp2.y - sp.y; },
      up(wp2) { if (!moved) tapCabler(wp2); },
      cancel() { },
    };
  },
  hover(wp) { const hh = hitTest(wp, 7); ui.hover = hh && hh.t === 'elec' ? hh : null; },
};
EXT.hintKey.push(() => (ui.tool === 'cabler' && ui.cabler ? [ui.cabler.a, ui.cabler.pique && ui.cabler.pique.x, ui.cabler.b, ui.cabler.res && ui.cabler.res.len, ui.cabler.mode].join(',') : ''));
EXT.hint.cabler = () => {
  const st = ui.cabler;
  const fin = btn('Terminer', () => setTool('select'), 'pri sm');
  if (!st || (!st.a && !st.pique)) return [h('b', null, 'Câbler'), h('span', { class: 'msg' }, 'Touchez l’équipement de départ, ou une gaine existante pour piquer une dérivation.'), fin];
  const dep = st.a ? ((ELEC_BY.get((IDX.elec.get(st.a) || {}).type) || {}).n || 'équipement') : 'dérivation sur la gaine';
  if (!st.res) return [h('b', null, 'Câbler'), h('span', { class: 'msg' }, `Depuis : ${dep}. Touchez l’équipement à relier (plusieurs à la suite pour un même circuit).`), fin];
  const r = st.res, bc = bilanCircuits(st);
  const per = [r.murs ? `${r.murs} mur${r.murs > 1 ? 's' : ''}` : '', r.cloisons ? `${r.cloisons} cloison${r.cloisons > 1 ? 's' : ''}` : ''].filter(Boolean).join(' et ');
  const cr = r.croisements ? ` · croise ${r.croisements} gaine${r.croisements > 1 ? 's' : ''}` : '';
  return [h('b', null, 'Tracé proposé'), h('span', { class: 'msg' }, `${fmtM(r.len)}${per ? ', traverse ' + per : ''}${cr}. ${bc.msg}`),
    btn('Créer la gaine', creer, 'pri sm'),
    btn(st.mode === 'direct' ? 'Itinéraire' : 'Tracé direct', () => { st.mode = st.mode === 'direct' ? 'route' : 'direct'; proposer(IDX.elec.get(st.b)); }, 'sm'),
    btn('Refuser', () => { st.res = null; st.b = null; updateHint(); requestRender(); }, 'sm'), fin];
};
EXT.overlay.push((c, px) => {
  if (ui.tool !== 'cabler' || !ui.cabler) return;
  const st = ui.cabler, A = departDe(st);
  if (A) { c.beginPath(); c.arc(A.x, A.y, 7 * px, 0, Math.PI * 2); c.fillStyle = ORANGE; c.fill(); c.strokeStyle = '#fff'; c.lineWidth = 2 * px; c.stroke(); }
  if (!st.res) return;
  const pts = st.res.pts;
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) c.lineTo(p.x, p.y);
  c.strokeStyle = 'rgba(210,79,26,0.25)'; c.lineWidth = 9 * px; c.stroke();
  c.setLineDash([8 * px, 5 * px]); c.strokeStyle = ORANGE; c.lineWidth = 2.4 * px; c.stroke(); c.setLineDash([]);
});
function demarrerCablage(e) {
  setTool('cabler');
  ui.cabler = { a: e ? e.id : null, pique: null, b: null, res: null, mode: 'route' };
  if (e) { ui.sel = { t: 'elec', id: e.id }; }
  updateHint(); requestRender();
}

EXT.cabler = demarrerCablage;

/* ---------------- raccordement automatique : propositions à valider ---------------- */
/* calcule les gaines manquantes de plusieurs circuits SANS modifier le plan, puis les affiche pour validation */
async function proposerRaccordement(cids, suivi) {
  const tmp = Object.assign({}, P, { ducts: P.ducts.slice() });
  const prop = { gaines: [], echecs: [], len: 0, circuits: 0 };
  const pose = (S.ductPose === 'hauteur' || S.ductPose === 'cloison') && !Number.isFinite(S.ductZ) ? null : S.ductPose || null;
  for (let i = 0; i < cids.length; i++) {
    if (suivi) { suivi(i, cids.length); await new Promise((r) => setTimeout(r, 0)); }
    const r = raccorderCircuit(tmp, cids[i], { pose });
    if (r.gaines.length) prop.circuits++;
    for (const g of r.gaines) { const x = Object.assign({}, g, { id: '~prop' + prop.gaines.length }); tmp.ducts.push(x); prop.gaines.push(g); prop.len += g.len; }
    for (const e of r.echecs) prop.echecs.push(Object.assign({ cid: cids[i] }, e));
  }
  if (!prop.gaines.length) { toast(prop.echecs.length ? `Aucune gaine proposée ; ${prop.echecs.length} point${prop.echecs.length > 1 ? 's' : ''} sans itinéraire.` : 'Tout est déjà raccordé au tableau.'); return prop; }
  ui.propRacc = prop;
  const { setView } = await import('./tableau.js');
  if (ui.view !== 'plan') setView('plan');
  const parLv = new Map(); for (const g of prop.gaines) parLv.set(g.lv, (parLv.get(g.lv) || 0) + 1);
  if (!parLv.has(ui.lv)) { ui.lv = [...parLv.entries()].sort((a, b) => b[1] - a[1])[0][0]; }
  if (!calqueVisible('gaines')) setCalqueVisible('gaines', true);
  setTool('propose');
  refreshUI();
  return prop;
}
function validerRaccordement() {
  const prop = ui.propRacc; if (!prop) return;
  ui.propRacc = null;
  for (const g of prop.gaines) creerGaineElec(g);
  if (!famOn('gaines')) S.filt.off = S.filt.off.filter((x) => x !== 'gaines');
  S.layers.elec = true; saveSettings();
  setTool('select');
  commit(); afterFilter();
  const e = prop.echecs.length;
  toast(`${prop.gaines.length} gaine${prop.gaines.length > 1 ? 's' : ''} créée${prop.gaines.length > 1 ? 's' : ''} (${Math.round(prop.len / 100)} m à l’horizontale)${e ? ` ; ${e} point${e > 1 ? 's' : ''} sans itinéraire` : ''}. « Annuler » les retire toutes.`);
}
function refuserRaccordement() { ui.propRacc = null; setTool('select'); toast('Propositions refusées : le plan n’a pas changé.'); }
EXT.tools.propose = {
  down(wp, sp) {
    const ox0 = V.ox, oy0 = V.oy;
    return { move(wp2, sp2) { V.ox = ox0 + sp2.x - sp.x; V.oy = oy0 + sp2.y - sp.y; requestRender(); }, up() { }, cancel() { } };
  },
};
EXT.hintKey.push(() => (ui.tool === 'propose' && ui.propRacc ? 'prop' + ui.propRacc.gaines.length + ui.lv : ''));
EXT.hint.propose = () => {
  const p = ui.propRacc; if (!p) return [h('b', null, 'Raccordement'), btn('Fermer', () => setTool('select'), 'sm')];
  const ici = p.gaines.filter((g) => g.lv === ui.lv).length, ail = p.gaines.length - ici, e = p.echecs.length;
  const b1 = btn(`Valider (${p.gaines.length})`, validerRaccordement, 'pri sm'); b1.id = 'propValider';
  const b2 = btn('Refuser', refuserRaccordement, 'sm'); b2.id = 'propRefuser';
  return [h('b', null, 'Gaines proposées'), h('span', { class: 'msg' }, `${p.gaines.length} gaine${p.gaines.length > 1 ? 's' : ''}, ${Math.round(p.len / 100)} m à l’horizontale${ail ? ` (dont ${ail} sur d’autres niveaux)` : ''}${e ? ` ; ${e} point${e > 1 ? 's' : ''} sans itinéraire` : ''}. Rien n’est modifié avant votre validation.`), b1, b2];
};
EXT.overlay.push((c, px) => {
  if (ui.tool !== 'propose' || !ui.propRacc) return;
  c.lineJoin = 'round'; c.lineCap = 'round';
  for (const g of ui.propRacc.gaines) {
    if (g.lv !== ui.lv) continue;
    c.beginPath(); c.moveTo(g.pts[0].x, g.pts[0].y); for (const p of g.pts.slice(1)) c.lineTo(p.x, p.y);
    c.strokeStyle = 'rgba(210,79,26,0.22)'; c.lineWidth = 8 * px; c.stroke();
    c.setLineDash([7 * px, 4 * px]); c.strokeStyle = (S.layers.circ !== false && g.cid && circuitColor(g.cid)) || ORANGE; c.lineWidth = 2.2 * px; c.stroke(); c.setLineDash([]);
  }
  for (const x of ui.propRacc.echecs) { const e = IDX.elec.get(x.id); if (!e || e.lv !== ui.lv) continue; const p = ancrage(e); c.beginPath(); c.arc(p.x, p.y, 18 * px, 0, Math.PI * 2); c.strokeStyle = ROUGE; c.lineWidth = 2 * px; c.stroke(); }
});
/* une proposition en cours n'a plus de sens si le plan change (annuler, autre plan) */
on(EV.PLAN_OUVERT, () => { ui.propRacc = null; ui.cabler = null; });

export { demarrerCablage, dessinerCablage, proposerRaccordement, refuserRaccordement, validerRaccordement };

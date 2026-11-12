/* Calque — module « routeui » : zones interdites (dessin, sélection), proposition d'itinéraire de gaine,
   affichage des conflits. Les calculs sont dans itineraire.js et cheminement.js (sans écran).
   Module JavaScript natif (aucune compilation). */
import { EXT, IDX, P, S, ui, uid } from './noyau.js';
import { RC, V } from './rendu2d.js';
import { commit, cv, requestRender } from './interaction.js';
import { btn, btns, deleteSel, h, inspHead, body, kv, renderInspector, sec, setTool, textField, toast, updateHint } from './interface.js';
import { creerGaineElec, famOn, finishDuct } from './reseaux.js';
import { goToRef } from './tableau.js';
import { ancrage, cheminCircuit, grapheGaines, plusCourts, tableauDu, TRAVERSEE } from './cheminement.js';
import { chercherItineraire, conflitsGaine, raccorderCircuit } from './itineraire.js';
import { ELEC_BY } from './symboles.js';

const ROUGE = '#C2362B';
const fmtM = (cm) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(cm / 100) + ' m';

/* ---------------- zones interdites : dessin ---------------- */
function zonesVisibles() { return S.layers.elec && famOn('gaines'); }
EXT.under.push((c, lv, opts) => {
  if (!zonesVisibles() || !P.zones) return;
  const px = RC.px;
  for (const z of P.zones) {
    if (z.lv !== lv || z.pts.length < 3) continue;
    const sel = ui.sel && ui.sel.t === 'zone' && ui.sel.id === z.id;
    c.save();
    c.beginPath(); c.moveTo(z.pts[0].x, z.pts[0].y); for (const p of z.pts.slice(1)) c.lineTo(p.x, p.y); c.closePath();
    c.fillStyle = 'rgba(194,54,43,0.08)'; c.fill();
    c.save(); c.clip();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of z.pts) { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); }
    c.beginPath(); const st = 18;
    for (let k = x0 - (y1 - y0); k < x1; k += st) { c.moveTo(k, y0); c.lineTo(k + (y1 - y0), y1); }
    c.strokeStyle = 'rgba(194,54,43,0.35)'; c.lineWidth = 1.2 * px; c.stroke(); c.restore();
    c.beginPath(); c.moveTo(z.pts[0].x, z.pts[0].y); for (const p of z.pts.slice(1)) c.lineTo(p.x, p.y); c.closePath();
    c.setLineDash(sel ? [] : [6 * px, 4 * px]); c.strokeStyle = ROUGE; c.lineWidth = (sel ? 2.4 : 1.4) * px; c.stroke(); c.setLineDash([]);
    if (z.name && !(opts && opts.export)) {
      const m = z.pts.reduce((a, p) => ({ x: a.x + p.x / z.pts.length, y: a.y + p.y / z.pts.length }), { x: 0, y: 0 });
      c.font = `600 ${11 * px}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = ROUGE; c.fillText(z.name, m.x, m.y);
    }
    c.restore();
  }
});

/* ---------------- zones interdites : outil ---------------- */
const ZD = { pts: [], cur: null };
function startZone() { ZD.pts = []; ZD.cur = null; if (!famOn('gaines')) { S.filt.off = S.filt.off.filter((x) => x !== 'gaines'); } S.layers.elec = true; setTool('zone'); }
function finishZone() {
  if (ZD.pts.length < 3) { toast('Une zone a au moins 3 angles.'); return; }
  const z = { id: uid('z'), lv: ui.lv, pts: ZD.pts.map((p) => ({ x: Math.round(p.x * 10) / 10, y: Math.round(p.y * 10) / 10 })) };
  if (!P.zones) P.zones = [];
  P.zones.push(z); IDX.zones.set(z.id, z);
  ZD.pts = []; ZD.cur = null;
  setTool('select'); commit();
  ui.sel = { t: 'zone', id: z.id }; ui.inspOpen = true; refreshSel();
  toast('Zone interdite ajoutée : les itinéraires proposés l’évitent.');
}
function refreshSel() { renderInspector(); requestRender(); }
EXT.tools.zone = {
  down(wp, sp) {
    let moved = false;
    return {
      move(wp2, sp2) { if (Math.hypot(sp2.x - sp.x, sp2.y - sp.y) > 10) moved = true; },
      up(wp2) {
        if (moved) return;
        const first = ZD.pts[0];
        if (first && ZD.pts.length >= 3 && Math.hypot(wp2.x - first.x, wp2.y - first.y) * V.s < 22) { finishZone(); return; }
        ZD.pts.push({ x: wp2.x, y: wp2.y }); updateHint(); requestRender(true);
      },
    };
  },
  hover(wp) { ZD.cur = wp; cv.style.cursor = 'crosshair'; },
};
EXT.hintKey.push(() => (ui.tool === 'zone' ? 'z' + ZD.pts.length : ui.tool === 'route' && ui.route ? 'r' + ui.route.res.pts.length : ''));
EXT.hint.zone = () => [h('b', null, 'Zone interdite'),
  h('span', { class: 'msg' }, ZD.pts.length < 3 ? 'Touchez les angles de la zone où les gaines ne doivent pas passer (trémie, conduit de fumée, zone humide…).' : 'Continuez, ou touchez le premier angle pour fermer.'),
  ZD.pts.length ? btn('Retirer le dernier point', () => { ZD.pts.pop(); updateHint(); requestRender(true); }, 'sm') : null,
  ZD.pts.length >= 3 ? btn('Terminer', finishZone, 'pri sm') : null,
  btn('Annuler', () => { ZD.pts = []; setTool('select'); }, 'sm')];
EXT.overlay.push((c, px) => {
  if (ui.tool !== 'zone' || !ZD.pts.length) return;
  const pts = ui.mouse && ZD.cur ? [...ZD.pts, ZD.cur] : ZD.pts;
  c.strokeStyle = ROUGE; c.fillStyle = 'rgba(194,54,43,0.12)'; c.lineWidth = 2 * px;
  c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) c.lineTo(p.x, p.y); if (pts.length >= 3) { c.closePath(); c.fill(); } c.stroke();
  for (const p of ZD.pts) { c.beginPath(); c.arc(p.x, p.y, 5 * px, 0, Math.PI * 2); c.fill(); c.stroke(); }
});
/* sélection d'une zone (touché à l'intérieur) */
function zoneAt(p) {
  if (!zonesVisibles()) return null;
  for (let i = (P.zones || []).length - 1; i >= 0; i--) {
    const z = P.zones[i]; if (z.lv !== ui.lv) continue;
    let c = false;
    for (let a = 0, b = z.pts.length - 1; a < z.pts.length; b = a++) { const A = z.pts[a], B = z.pts[b]; if ((A.y > p.y) !== (B.y > p.y) && p.x < ((B.x - A.x) * (p.y - A.y)) / (B.y - A.y) + A.x) c = !c; }
    if (c) return z.id;
  }
  return null;
}
function inspZone(z) {
  return [inspHead('Zone interdite', z.name || 'Sans nom'),
    body(h('p', { class: 'note' }, 'Les itinéraires proposés évitent cette zone ; une gaine qui la traverse est signalée.'),
      sec('Nom', textField(null, z.name, (v) => { v = v.trim().slice(0, 60); if (v) z.name = v; else delete z.name; commit(); }, { id: 'f-zname', ph: 'ex. Trémie d’escalier, conduit de fumée' })),
      kv([['Angles', String(z.pts.length)]]),
      sec(null, btns(btn('Supprimer', deleteSel, 'danger', 'del'))))];
}
EXT.insp.zone = inspZone;

/* ---------------- proposition d'itinéraire ---------------- */
/* point de départ : le point déjà raccordé au tableau le plus proche, sur le même niveau */
function departPour(e) {
  const T = tableauDu(P);
  if (!T) return { raison: 'Posez d’abord le tableau électrique sur le plan.' };
  const cands = [];
  if (T.lv === e.lv) cands.push(T);
  const G = grapheGaines(P), sp = G.nodes.has('e:' + T.id) ? plusCourts(G, 'e:' + T.id, e.cid) : { D: new Map() };
  for (const x of P.elec) if (x.lv === e.lv && x.id !== e.id && x.id !== T.id && sp.D.has('e:' + x.id) && (x.cid === e.cid || x.type === TRAVERSEE || x.type === 'derivation')) cands.push(x);
  if (!cands.length) return { raison: 'Aucun point de ce niveau n’est raccordé au tableau : posez un passage entre étages relié au niveau du tableau, et raccordez-le.' };
  const a = ancrage(e);
  cands.sort((p, q) => Math.hypot(ancrage(p).x - a.x, ancrage(p).y - a.y) - Math.hypot(ancrage(q).x - a.x, ancrage(q).y - a.y));
  return { from: cands[0] };
}
function proposerItineraire(e) {
  const dep = departPour(e);
  if (!dep.from) { toast(dep.raison); return; }
  const res = chercherItineraire(P, e.lv, ancrage(dep.from), ancrage(e), { pose: S.ductPose || null });
  if (!res) { toast('Aucun itinéraire trouvé : une zone interdite ou des portes bloquent le passage.'); return; }
  setTool('route');
  ui.route = { a: dep.from.id, b: e.id, cid: e.cid, res };
  updateHint(); requestRender(true);
}
function validerItineraire() {
  const r = ui.route; if (!r) return;
  ui.route = null;
  setTool('select');
  ui.duct = { sys: 'elec', pts: r.res.pts.map((p) => ({ x: p.x, y: p.y })), a: r.a, b: r.b };
  const d = finishDuct();
  if (d) { ui.sel = { t: 'duct', id: d.id }; ui.inspOpen = true; refreshSel(); }
}
EXT.hint.route = () => {
  const r = ui.route; if (!r) return [h('b', null, 'Itinéraire'), btn('Fermer', () => setTool('select'), 'sm')];
  const per = [r.res.murs ? `${r.res.murs} mur${r.res.murs > 1 ? 's' : ''}` : '', r.res.cloisons ? `${r.res.cloisons} cloison${r.res.cloisons > 1 ? 's' : ''}` : ''].filter(Boolean).join(' et ');
  return [h('b', null, 'Itinéraire proposé'),
    h('span', { class: 'msg' }, `${fmtM(r.res.len)} à l’horizontale${per ? `, traverse ${per}` : ''}. Il évite les zones interdites${S.ductPose === 'hauteur' ? ' et les portes' : ''}. Vous pourrez déplacer les coudes ensuite.`),
    btn('Créer la gaine', validerItineraire, 'pri sm'), btn('Annuler', () => { ui.route = null; setTool('select'); }, 'sm')];
};
EXT.tools.route = { down() { return null; } };
EXT.overlay.push((c, px) => {
  if (ui.tool !== 'route' || !ui.route) return;
  const pts = ui.route.res.pts;
  c.lineJoin = 'round'; c.lineCap = 'round';
  c.beginPath(); c.moveTo(pts[0].x, pts[0].y); for (const p of pts.slice(1)) c.lineTo(p.x, p.y);
  c.strokeStyle = 'rgba(210,79,26,0.25)'; c.lineWidth = 9 * px; c.stroke();
  c.setLineDash([8 * px, 5 * px]); c.strokeStyle = '#D24F1A'; c.lineWidth = 2.4 * px; c.stroke(); c.setLineDash([]);
  for (const p of pts) { c.beginPath(); c.arc(p.x, p.y, 3.5 * px, 0, Math.PI * 2); c.fillStyle = '#D24F1A'; c.fill(); }
});

/* ---------------- raccordement automatique ---------------- */
/* relie par des gaines proposées tous les points non raccordés des circuits donnés : une seule étape d'« Annuler ».
   suivi(i, n) est appelé avant chaque circuit (affichage de l'avancement). Renvoie { gaines, points, echecs, len }. */
async function raccorderAuto(cids, suivi) {
  const bilan = { gaines: 0, echecs: [], len: 0, circuits: 0 };
  const pose = S.ductPose === 'hauteur' && !Number.isFinite(S.ductZ) ? null : S.ductPose || null;
  for (let i = 0; i < cids.length; i++) {
    if (suivi) { suivi(i, cids.length); await new Promise((r) => setTimeout(r, 0)); }
    const r = raccorderCircuit(P, cids[i], { pose });
    if (r.gaines.length) bilan.circuits++;
    for (const g of r.gaines) { creerGaineElec(g); bilan.gaines++; bilan.len += g.len; }
    for (const e of r.echecs) bilan.echecs.push(Object.assign({ cid: cids[i] }, e));
  }
  if (bilan.gaines) { if (!famOn('gaines')) S.filt.off = S.filt.off.filter((x) => x !== 'gaines'); S.layers.elec = true; commit(); requestRender(); }
  return bilan;
}
function messageAuto(b) {
  if (!b.gaines && !b.echecs.length) return 'Tout est déjà raccordé au tableau.';
  const e = b.echecs.length;
  return `${b.gaines} gaine${b.gaines > 1 ? 's' : ''} proposée${b.gaines > 1 ? 's' : ''} (${Math.round(b.len / 100)} m à l’horizontale)${e ? ` ; ${e} point${e > 1 ? 's' : ''} sans itinéraire` : ''}. Vérifiez les tracés ; « Annuler » retire tout.`;
}
async function raccorderEtDire(cids) {
  toast('Recherche des itinéraires…'); await new Promise((r) => setTimeout(r, 30));
  const b = await raccorderAuto(cids);
  toast(messageAuto(b)); renderInspector();
  return b;
}

/* section de l'inspecteur d'un symbole relié à un circuit : raccordement par les gaines */
function itineraireSection(e) {
  const def = ELEC_BY.get(e.type);
  if (!e.cid || !def || ['tableau', 'tab_div', TRAVERSEE].includes(e.type)) return null;
  const ch = cheminCircuit(P, e.cid), pt = ch.points.find((x) => x.id === e.id);
  const ok = pt && pt.dist != null;
  return sec('Cheminement',
    ok ? h('p', { class: 'note' }, `Raccordé au tableau par les gaines : ${fmtM(pt.dist)} (verticales comprises).`)
      : h('p', { class: 'note' }, ch.tableau ? 'Pas encore raccordé au tableau par les gaines.' : 'Pas de tableau électrique sur le plan.'),
    btns(ok ? null : btn('Proposer un itinéraire', () => proposerItineraire(e), 'sm', 'duct'), ch.tableau && !ch.complet ? btn(`Raccorder tout le circuit (${ch.nonAtteints.length})`, () => raccorderEtDire([e.cid]), 'sm') : null, btn('Zone interdite', startZone, 'sm')));
}

/* conflits d'une gaine, pour son inspecteur */
function conflitsSection(d) {
  const cs = conflitsGaine(P, d);
  if (!cs.length) return sec('Conflits', h('p', { class: 'note' }, 'Aucun conflit détecté avec les portes, fenêtres, zones interdites et conduits de VMC. Traversées de murs : aucune.'));
  return sec('Conflits', h('div', { class: 'ev-list' }, cs.map((x) => h('div', { class: 'ev-chk ' + (x.sev === 'warn' ? 'warn' : 'info') }, h('span', { class: 'ic' }, x.sev === 'warn' ? '!' : 'i'), h('span', { class: 'tx' }, x.msg)))),
    h('p', { class: 'note' }, 'Points d’attention de Calque (pas une règle de la norme).'));
}

export { messageAuto, raccorderAuto, raccorderEtDire };
export { conflitsSection, departPour, finishZone, inspZone, itineraireSection, proposerItineraire, startZone, validerItineraire, zoneAt, ZD };

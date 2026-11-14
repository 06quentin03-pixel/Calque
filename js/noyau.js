/* Calque — module « noyau » : utilitaires, vecteurs, formats, réglages, modèle du plan, état partagé de l’interface.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */

/* ============================================================
   CALQUE — noyau : utilitaires, modèle, géométrie, mutations
   Unités internes : centimètres. Axe Y vers le bas (comme l'écran).
   ============================================================ */

const DEG = Math.PI / 180;
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const uid = (p) => (p || '') + Math.random().toString(36).slice(2, 9);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const snapTo = (v, step) => (step > 0 ? Math.round(v / step) * step : v);
const isNum = (v) => typeof v === 'number' && isFinite(v);

/* ---------- vecteurs ---------- */
const vadd = (a, b) => ({ x: a.x + b.x, y: a.y + b.y });
const vsub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const vmul = (a, s) => ({ x: a.x * s, y: a.y * s });
const vdot = (a, b) => a.x * b.x + a.y * b.y;
const vcrs = (a, b) => a.x * b.y - a.y * b.x;
const vlen = (a) => Math.hypot(a.x, a.y);
const vdist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const vnorm = (a) => { const l = Math.hypot(a.x, a.y) || 1; return { x: a.x / l, y: a.y / l }; };
const vperp = (a) => ({ x: -a.y, y: a.x });
const vmid = (a, b) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const vang = (a) => Math.atan2(a.y, a.x);
const vdir = (ang) => ({ x: Math.cos(ang), y: Math.sin(ang) });

function lineX(p, d, q, e) {
  const den = vcrs(d, e);
  if (Math.abs(den) < 1e-9) return null;
  const s = vcrs(vsub(q, p), e) / den;
  return vadd(p, vmul(d, s));
}
function projSeg(p, a, b) {
  const ab = vsub(b, a);
  const L2 = vdot(ab, ab) || 1e-9;
  const t = vdot(vsub(p, a), ab) / L2;
  const tc = clamp(t, 0, 1);
  const pt = vadd(a, vmul(ab, tc));
  return { t, tc, pt, d: vdist(p, pt) };
}
function segX(a, b, c, d) {
  const r = vsub(b, a), s = vsub(d, c);
  const den = vcrs(r, s);
  if (Math.abs(den) < 1e-9) return null;
  const ca = vsub(c, a);
  const t = vcrs(ca, s) / den, u = vcrs(ca, r) / den;
  return { t, u, pt: vadd(a, vmul(r, t)) };
}
function polyArea(p) {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) {
    const a = p[i], b = p[(i + 1) % n];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}
function polyPerim(p) {
  let s = 0;
  for (let i = 0, n = p.length; i < n; i++) s += vdist(p[i], p[(i + 1) % n]);
  return s;
}
function inPoly(pt, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > pt.y) !== (b.y > pt.y) && pt.x < ((b.x - a.x) * (pt.y - a.y)) / (b.y - a.y) + a.x) c = !c;
  }
  return c;
}
function distToEdges(pt, poly) {
  let m = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) m = Math.min(m, projSeg(pt, poly[i], poly[(i + 1) % n]).d);
  return m;
}
function bboxOf(pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y; if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y; }
  return { x0, y0, x1, y1 };
}
/* point intérieur le plus éloigné des bords (approximation par grille raffinée) */
function labelPoint(poly) {
  const bb = bboxOf(poly);
  let best = null, bestD = -1;
  let cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  let wx = bb.x1 - bb.x0, wy = bb.y1 - bb.y0;
  for (let pass = 0; pass < 4; pass++) {
    const N = 10;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const p = { x: cx - wx / 2 + (wx * i) / N, y: cy - wy / 2 + (wy * j) / N };
      if (!inPoly(p, poly)) continue;
      const d = distToEdges(p, poly);
      if (d > bestD) { bestD = d; best = p; }
    }
    if (!best) break;
    cx = best.x; cy = best.y; wx /= 3; wy /= 3;
  }
  if (!best) { let sx = 0, sy = 0; for (const p of poly) { sx += p.x; sy += p.y; } best = { x: sx / poly.length, y: sy / poly.length }; }
  return best;
}

/* ---------- formats ---------- */
const NF = (d) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d });
const NF0 = NF(0), NF1 = NF(1), NF2 = NF(2);
const NFc = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 1 });
function fmtLen(cm, unit) {
  const u = unit || S.unit;
  if (u === 'cm') return NFc.format(Math.round(cm * 10) / 10);
  return NF2.format(cm / 100);
}
function fmtLenU(cm) { return S.unit === 'cm' ? fmtLen(cm) + ' cm' : fmtLen(cm) + ' m'; }
function fmtArea(cm2) { return NF2.format(cm2 / 10000) + ' m²'; }

/* ---------- réglages (par appareil) ---------- */
const S = {
  grid: 5, ortho: true, magnet: true, unit: 'm', dimMode: 'faces',
  layers: { grid: true, dims: true, areas: true, furn: true, elec: true, ghost: true, names: true, compo: true },
  thMur: 20, thCloison: 7, wallEnd: 'auto',
  filt: { off: [], circ: null }, ductSys: 'vmc', ductKind: null, ductPose: null, // dernier type et dernière pose de gaine choisis
  pencil: false, pencilSeen: false, // Apple Pencil : le stylet dessine, le doigt déplace le plan (activé au premier usage du stylet)
};
function loadSettings() {
  try {
    const raw = localStorage.getItem('calque.settings');
    if (raw) { const o = JSON.parse(raw); Object.assign(S, o, { layers: Object.assign({}, S.layers, o.layers || {}) }); }
  } catch (e) { /* stockage indisponible */ }
  if (!S.filt || typeof S.filt !== 'object' || !Array.isArray(S.filt.off)) S.filt = { off: [], circ: null };
  if (S.ductSys !== 'vmc' && S.ductSys !== 'elec') S.ductSys = 'vmc';
}
/* mode chantier : affichage simplifié temporaire ; les réglages enregistrés restent ceux du mode plan */
const LAYERS_CH = { saved: null };
function saveSettings() { try { const o = LAYERS_CH.saved ? Object.assign({}, S, { layers: LAYERS_CH.saved }) : S; localStorage.setItem('calque.settings', JSON.stringify(o)); } catch (e) { } }

/* ---------- modèle ---------- */
let P = null;          // plan courant
const IDX = { nodes: new Map(), walls: new Map(), openings: new Map(), items: new Map(), elec: new Map(), rooms: new Map(), dims: new Map(), texts: new Map(), levels: new Map(), ducts: new Map(), zones: new Map() };
let GEO = {};          // géométrie dérivée par niveau

/* version du format des plans (migrations : MIGRATIONS dans stockage.js) */
const PLAN_VERSION = 17;
function blankPlan(name) {
  return {
    v: PLAN_VERSION, name: name || 'Nouveau plan',
    levels: [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }],
    nodes: [], walls: [], openings: [], items: [], elec: [], rooms: [], dims: [], texts: [],
    circuits: [], rcds: [], links: [], ducts: [], zones: [], etudes: [], photometries: [], comps: [], fonds: [], fondImg: {}, install: { kva: 9, parafoudre: false, row: 13 },
    doc: { revisions: [] },
    chantier: { poses: { app: {}, circ: {} }, reserves: [], photos: [], notes: [], journal: [] },
    chiffrage: { prix: {}, temps: {} },
    calques: {}, vues: [],
    schemas: { folios: [] },
  };
}
function normalizePlan(p) {
  const b = blankPlan(p && p.name);
  const o = Object.assign(b, p || {});
  for (const k of ['levels', 'nodes', 'walls', 'openings', 'items', 'elec', 'rooms', 'dims', 'texts', 'circuits', 'rcds', 'links', 'ducts', 'zones', 'etudes', 'photometries', 'comps', 'fonds']) if (!Array.isArray(o[k])) o[k] = [];
  if (!o.fondImg || typeof o.fondImg !== 'object' || Array.isArray(o.fondImg)) o.fondImg = {};
  o.ducts = o.ducts.filter((d) => d && Array.isArray(d.pts) && d.pts.length >= 2);
  if (!o.install || typeof o.install !== 'object') o.install = { kva: 9, parafoudre: false, row: 13 };
  if (!o.doc || typeof o.doc !== 'object' || Array.isArray(o.doc) || !Array.isArray(o.doc.revisions)) o.doc = { revisions: [] };
  if (!o.chantier || typeof o.chantier !== 'object' || Array.isArray(o.chantier)) o.chantier = { poses: { app: {}, circ: {} }, reserves: [], photos: [], notes: [], journal: [] };
  { const c = o.chantier; if (!c.poses || typeof c.poses !== 'object') c.poses = {}; for (const k of ['app', 'circ']) if (!c.poses[k] || typeof c.poses[k] !== 'object') c.poses[k] = {};
    for (const k of ['reserves', 'photos', 'notes', 'journal']) if (!Array.isArray(c[k])) c[k] = []; }
  if (!o.chiffrage || typeof o.chiffrage !== 'object' || Array.isArray(o.chiffrage)) o.chiffrage = { prix: {}, temps: {} };
  for (const k of ['prix', 'temps']) if (!o.chiffrage[k] || typeof o.chiffrage[k] !== 'object' || Array.isArray(o.chiffrage[k])) o.chiffrage[k] = {};
  if (!o.calques || typeof o.calques !== 'object' || Array.isArray(o.calques)) o.calques = {};
  if (!Array.isArray(o.vues)) o.vues = [];
  if (!o.schemas || typeof o.schemas !== 'object' || Array.isArray(o.schemas) || !Array.isArray(o.schemas.folios)) o.schemas = { folios: [] };
  if (!o.levels.length) o.levels = blankPlan().levels;
  return o;
}
function touch() {
  for (const k of ['nodes', 'walls', 'openings', 'items', 'elec', 'rooms', 'dims', 'texts', 'levels', 'ducts', 'zones']) {
    const m = IDX[k]; m.clear();
    for (const o of P[k]) m.set(o.id, o);
  }
  GEO = {};
}
const nodeOf = (id) => IDX.nodes.get(id);
const levelOf = (id) => IDX.levels.get(id);
function levelsSorted() { return P.levels.slice().sort((a, b) => a.elev - b.elev); }
function levelAbove(lv) { const L = levelsSorted(); const i = L.findIndex((l) => l.id === lv); return i >= 0 && i < L.length - 1 ? L[i + 1] : null; }
function levelBelow(lv) { const L = levelsSorted(); const i = L.findIndex((l) => l.id === lv); return i > 0 ? L[i - 1] : null; }
/* pièces extérieures (format v15, champ `ext` de l'étiquette) : terrasse ou balcon posés sur UN niveau.
   Hors surface habitable, sans plafond ; l'étage du dessous n'est pas touché. */
const PIECES_EXT = { terrasse: 'Terrasse', balcon: 'Balcon' };
const estExterieure = (lbl) => !!(lbl && PIECES_EXT[lbl.ext]);
/* pièce non contrôlée comme une pièce d'habitation : terrasse, balcon, ou sol supprimé (trémie, vide) */
const horsHabitation = (lbl) => estExterieure(lbl) || !!(lbl && lbl.sol === 'vide');
function climbHeight(lv) {
  const l = levelOf(lv), up = levelAbove(lv);
  if (up) return up.elev - l.elev;
  return (l.h || 250) + (l.slab || 20);
}


/* ---------- état partagé de l’interface (outil, niveau, sélection…) et couleurs du thème ---------- */
const ui = {
  tool: 'select', lv: 'L0', sel: null, hover: null,
  chain: null, cursor: null, place: null, ghost: null,
  roomDraft: null, dimDraft: null, wallKind: 'mur', doorKind: 'door', wallLenTxt: '', wallHTxt: '',
  pointerType: 'mouse', mouse: null, inspOpen: false, isExample: false, savedAt: 0,
};
const C = {};
/* points d'extension : un module ajoute un outil, un bandeau d'aide ou un dessin sans modifier les moteurs.
   tools[nom] = { down, hover } (comme TOOLS) ; hint[nom]() → éléments du bandeau ; hintKey() → clé de mise à jour ;
   under[] (c, lv, opts) : dessiné sous les murs ; overlay[] (c, px) : dessiné sur la couche du dessus */
const EXT = { tools: {}, hint: {}, hintKey: [], under: [], overlay: [], insp: {},
  top: [], hit: [], obj: {}, del: {}, inspVide: null, selectDown: null, view: [], snap: [], cablage: [] };
/* cablage[] (c, lv, opts) : dessiné juste au-dessus des gaines, sous les liaisons et les appareils (câblage des circuits) */
/* snap[] (p, tol) → { x, y, kind, guides } : accrochage ajouté par un module (traits d'un fond DXF), après les angles des murs */
/* top[] (c, lv, opts) : dessiné au-dessus du plan ; hit[] (p, tol) → { t, id } avant les objets du plan ;
   obj[t](id) : objet sélectionné d'un type ajouté ; del[t](id) : suppression ; inspVide() : inspecteur sans sélection ;
   selectDown(wp, sp) : remplace l'outil Sélection s'il renvoie un geste ; view[] (v) : appelé au changement de vue */ // insp : inspecteur d'un type d'objet ajouté par un module
/* modification depuis un autre module (une variable importée ne peut pas être réaffectée directement) */
function setGEO(v) { GEO = v; }
/* modification depuis un autre module (une variable importée ne peut pas être réaffectée directement) */
function setP(v) { P = v; }

export { PIECES_EXT, estExterieure, horsHabitation };
export { $, $$, C, DEG, EXT, LAYERS_CH, GEO, IDX, NF, NF0, NF1, NF2, NFc, P, PLAN_VERSION, S, bboxOf, blankPlan, clamp, climbHeight, distToEdges,
  fmtArea, fmtLen, fmtLenU, inPoly, isNum, labelPoint, levelAbove, levelBelow, levelOf, levelsSorted, lineX,
  loadSettings, nodeOf, normalizePlan, polyArea, polyPerim, projSeg, saveSettings, segX, setGEO, setP, snapTo, touch,
  ui, uid, vadd, vang, vcrs, vdir, vdist, vdot, vlen, vmid, vmul, vnorm, vperp, vsub };

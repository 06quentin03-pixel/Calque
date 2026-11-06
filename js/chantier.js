/* Calque — module « chantier » : suivi de chantier (phase 7). SANS ÉCRAN (testable avec Node).

   Données gardées dans le plan (format v9, champ `chantier`) :
     poses    { app: { [id du symbole]: date }, circ: { [id du circuit]: date } }  cases « posé » (date en ms)
     reserves [{ id, n (numéro), lv, x, y, titre, detail, statut, cree, maj, leve, echeance, ref: { t, id } }]
     photos   [{ id, lv, x, y, at, legende, aFaire, reserve, w, h }]   seulement la position et la légende :
              l'image elle-même est dans IndexedDB (base « calque-photos », photos.js), jamais dans le plan,
              pour ne pas alourdir le plan ni l'annuler / rétablir
     notes    [{ id, lv, pts: [x0, y0, x1, y1, …] (cm), col, ep (épaisseur en cm), at }]   annotations au Pencil
     journal  [{ at, k, txt }]   historique du chantier (2000 dernières lignes)

   Le statut d'une réserve (ouverte / en cours / levée) est un statut de suivi de chantier, saisi par l'utilisateur :
   ce n'est jamais un statut de conformité. */

const STATUTS_RESERVE = [
  { v: 'ouverte', n: 'Ouverte', c: '#C2362B' },
  { v: 'en_cours', n: 'En cours', c: '#B86E00' },
  { v: 'levee', n: 'Levée', c: '#2D7A4C' },
];
const STATUT_BY = new Map(STATUTS_RESERVE.map((s) => [s.v, s]));
const COULEURS_NOTE = [
  { v: '#D0342C', n: 'Rouge' }, { v: '#1F5FD1', n: 'Bleu' }, { v: '#1E8A4C', n: 'Vert' }, { v: '#1D2125', n: 'Noir' },
];
const JOURNAL_MAX = 2000;

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const date = (v) => (num(v) && v > 0 ? v : null);
const txt = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max || 200) : '');
const ident = (s) => (typeof s === 'string' && s && s.length <= 40 ? s : null);

function chantierVide() { return { poses: { app: {}, circ: {} }, reserves: [], photos: [], notes: [], journal: [] }; }

/* nettoyage (migration v8 → v9, import) : rien n'est deviné, une valeur invalide est retirée */
function nettoyerChantier(c) {
  const o = chantierVide();
  if (!c || typeof c !== 'object' || Array.isArray(c)) return o;
  const p = c.poses && typeof c.poses === 'object' ? c.poses : {};
  for (const k of ['app', 'circ']) {
    const src = p[k] && typeof p[k] === 'object' && !Array.isArray(p[k]) ? p[k] : {};
    for (const [id, at] of Object.entries(src)) if (ident(id) && date(at)) o.poses[k][id] = at;
  }
  const lieu = (x) => ident(x.lv) && num(x.x) && num(x.y);
  for (const r of Array.isArray(c.reserves) ? c.reserves : []) {
    if (!r || typeof r !== 'object' || !ident(r.id) || !lieu(r)) continue;
    const x = { id: r.id, n: num(r.n) && r.n > 0 ? Math.floor(r.n) : 0, lv: r.lv, x: r.x, y: r.y, titre: txt(r.titre, 120), detail: txt(r.detail, 2000),
      statut: STATUT_BY.has(r.statut) ? r.statut : 'ouverte', cree: date(r.cree) || date(r.maj) || null, maj: date(r.maj) || date(r.cree) || null };
    if (date(r.leve)) x.leve = r.leve;
    if (date(r.echeance)) x.echeance = r.echeance;
    if (r.ref && typeof r.ref === 'object' && ['elec', 'circuit'].includes(r.ref.t) && ident(r.ref.id)) x.ref = { t: r.ref.t, id: r.ref.id };
    if (!x.cree) delete x.cree;
    if (!x.maj) delete x.maj;
    o.reserves.push(x);
  }
  let n = Math.max(0, ...o.reserves.map((r) => r.n));
  for (const r of o.reserves) if (!r.n) r.n = ++n; // numéro manquant : suite des numéros existants (repère, pas une donnée)
  for (const f of Array.isArray(c.photos) ? c.photos : []) {
    if (!f || typeof f !== 'object' || !ident(f.id) || !lieu(f)) continue;
    const x = { id: f.id, lv: f.lv, x: f.x, y: f.y, legende: txt(f.legende, 300) };
    if (date(f.at)) x.at = f.at;
    if (f.aFaire === true) x.aFaire = true;
    if (ident(f.reserve)) x.reserve = f.reserve;
    if (num(f.w) && num(f.h) && f.w > 0 && f.h > 0) { x.w = Math.round(f.w); x.h = Math.round(f.h); }
    o.photos.push(x);
  }
  for (const t of Array.isArray(c.notes) ? c.notes : []) {
    if (!t || typeof t !== 'object' || !ident(t.id) || !ident(t.lv) || !Array.isArray(t.pts)) continue;
    const pts = t.pts.filter(num); if (pts.length < 4) continue;
    o.notes.push({ id: t.id, lv: t.lv, pts: pts.slice(0, pts.length - (pts.length % 2)), col: typeof t.col === 'string' && /^#[0-9a-f]{6}$/i.test(t.col) ? t.col : COULEURS_NOTE[0].v,
      ep: num(t.ep) && t.ep > 0 && t.ep < 200 ? t.ep : 2, ...(date(t.at) ? { at: t.at } : {}) });
  }
  for (const j of Array.isArray(c.journal) ? c.journal : []) {
    if (!j || typeof j !== 'object' || !date(j.at)) continue;
    const t = txt(j.txt, 300); if (!t) continue;
    o.journal.push({ at: j.at, k: txt(j.k, 20) || 'note', txt: t });
  }
  if (o.journal.length > JOURNAL_MAX) o.journal = o.journal.slice(-JOURNAL_MAX);
  return o;
}
/* le chantier du plan (créé vide au besoin) */
function chantierDe(plan) {
  if (!plan.chantier || typeof plan.chantier !== 'object') plan.chantier = chantierVide();
  const c = plan.chantier;
  if (!c.poses || typeof c.poses !== 'object') c.poses = { app: {}, circ: {} };
  if (!c.poses.app) c.poses.app = {};
  if (!c.poses.circ) c.poses.circ = {};
  for (const k of ['reserves', 'photos', 'notes', 'journal']) if (!Array.isArray(c[k])) c[k] = [];
  return c;
}

/* ---------------- historique du chantier ---------------- */
function noter(plan, k, texte, at) {
  const c = chantierDe(plan);
  c.journal.push({ at: at || Date.now(), k, txt: txt(texte, 300) });
  if (c.journal.length > JOURNAL_MAX) c.journal.splice(0, c.journal.length - JOURNAL_MAX);
}

/* ---------------- cases « posé » ---------------- */
function datePose(plan, k, id) { const c = plan.chantier; return (c && c.poses && c.poses[k] && c.poses[k][id]) || null; }
/* coche ou décoche ; renvoie la nouvelle valeur (date ou null) */
function marquerPose(plan, k, id, on, at, nom) {
  const c = chantierDe(plan), m = c.poses[k];
  const avant = !!m[id];
  if (on && !avant) m[id] = at || Date.now();
  else if (!on && avant) delete m[id];
  else return m[id] || null;
  noter(plan, 'pose', `${k === 'circ' ? 'Circuit' : 'Appareil'} ${nom || id} : ${on ? 'posé' : 'case « posé » décochée'}`, at);
  return m[id] || null;
}

/* ---------------- avancement ---------------- */
/* appareils : tous les symboles électriques du plan ; circuits : tous les circuits du tableau */
function avancement(plan, opts) {
  const o = opts || {};
  const els = plan.elec || [], circs = plan.circuits || [];
  const app = (plan.chantier && plan.chantier.poses && plan.chantier.poses.app) || {}, cp = (plan.chantier && plan.chantier.poses && plan.chantier.poses.circ) || {};
  const pct = (a, b) => (b ? Math.round((100 * a) / b) : null);
  const niveaux = (plan.levels || []).map((L) => {
    const l = els.filter((e) => e.lv === L.id), p = l.filter((e) => app[e.id]).length;
    return { id: L.id, nom: L.name, n: l.length, poses: p, pct: pct(p, l.length) };
  });
  const parCircuit = circs.map((c) => {
    const l = els.filter((e) => e.cid === c.id), p = l.filter((e) => app[e.id]).length;
    return { id: c.id, nom: c.name, rep: o.reperes ? o.reperes.get(c.id) : null, n: l.length, poses: p, pct: pct(p, l.length), circuitPose: cp[c.id] || null };
  });
  const sansCircuit = els.filter((e) => !e.cid || !circs.some((c) => c.id === e.cid));
  const pa = els.filter((e) => app[e.id]).length, pc = circs.filter((c) => cp[c.id]).length;
  return {
    app: { n: els.length, poses: pa, pct: pct(pa, els.length) },
    circ: { n: circs.length, poses: pc, pct: pct(pc, circs.length) },
    niveaux, parCircuit,
    sansCircuit: { n: sansCircuit.length, poses: sansCircuit.filter((e) => app[e.id]).length },
  };
}

/* ---------------- réserves ---------------- */
function numeroSuivant(plan) { const r = (plan.chantier && plan.chantier.reserves) || []; return r.reduce((m, x) => Math.max(m, x.n || 0), 0) + 1; }
function nouvelleReserve(plan, lieu, opts) {
  const o = opts || {}, at = o.at || Date.now();
  const r = { id: o.id || 'rs' + Math.random().toString(36).slice(2, 9), n: numeroSuivant(plan), lv: lieu.lv, x: Math.round(lieu.x * 10) / 10, y: Math.round(lieu.y * 10) / 10,
    titre: txt(o.titre, 120), detail: txt(o.detail, 2000), statut: 'ouverte', cree: at, maj: at };
  if (o.ref) r.ref = o.ref;
  chantierDe(plan).reserves.push(r);
  noter(plan, 'reserve', `Réserve n° ${r.n} créée${r.titre ? ' : ' + r.titre : ''}`, at);
  return r;
}
function changerStatut(plan, r, statut, at) {
  if (!STATUT_BY.has(statut) || r.statut === statut) return false;
  at = at || Date.now();
  r.statut = statut; r.maj = at;
  if (statut === 'levee') r.leve = at; else delete r.leve;
  noter(plan, 'reserve', `Réserve n° ${r.n} : ${STATUT_BY.get(statut).n.toLowerCase()}${r.titre ? ' (' + r.titre + ')' : ''}`, at);
  return true;
}
function resumeReserves(plan, maintenant) {
  const now = maintenant || Date.now(), l = (plan.chantier && plan.chantier.reserves) || [];
  const s = { total: l.length, ouverte: 0, en_cours: 0, levee: 0, enRetard: 0 };
  for (const r of l) { s[r.statut] = (s[r.statut] || 0) + 1; if (r.statut !== 'levee' && r.echeance && r.echeance < now) s.enRetard++; }
  return s;
}

/* ---------------- annotations ---------------- */
/* simplification d'un trait (Douglas-Peucker) ; pts à plat [x0, y0, x1, y1…] ; tol en cm */
function simplifierTrait(pts, tol) {
  const n = pts.length / 2; if (n <= 2) return pts.map((v) => Math.round(v * 10) / 10);
  const keep = new Uint8Array(n); keep[0] = keep[n - 1] = 1;
  const pile = [[0, n - 1]];
  while (pile.length) {
    const [a, b] = pile.pop();
    const ax = pts[2 * a], ay = pts[2 * a + 1], bx = pts[2 * b], by = pts[2 * b + 1];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const px = pts[2 * i] - ax, py = pts[2 * i + 1] - ay;
      let d;
      if (L2 < 1e-9) d = Math.hypot(px, py);
      else { const t = Math.max(0, Math.min(1, (px * dx + py * dy) / L2)); d = Math.hypot(px - t * dx, py - t * dy); }
      if (d > best) { best = d; bi = i; }
    }
    if (best > tol && bi > 0) { keep[bi] = 1; pile.push([a, bi], [bi, b]); }
  }
  const out = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(Math.round(pts[2 * i] * 10) / 10, Math.round(pts[2 * i + 1] * 10) / 10);
  return out;
}
/* distance d'un point à un trait (cm) */
function distanceTrait(note, p) {
  const t = note.pts; let m = Infinity;
  for (let i = 0; i + 3 < t.length; i += 2) {
    const ax = t[i], ay = t[i + 1], dx = t[i + 2] - ax, dy = t[i + 3] - ay, L2 = dx * dx + dy * dy;
    const u = L2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / L2));
    m = Math.min(m, Math.hypot(p.x - ax - u * dx, p.y - ay - u * dy));
  }
  if (t.length === 2) m = Math.hypot(p.x - t[0], p.y - t[1]);
  return m;
}

/* photos d'un plan (identifiants des images à garder dans IndexedDB) */
function photosDuPlan(plan) { return ((plan && plan.chantier && plan.chantier.photos) || []).filter((f) => !f.aFaire).map((f) => f.id); }

export { COULEURS_NOTE, JOURNAL_MAX, STATUTS_RESERVE, STATUT_BY, avancement, changerStatut, chantierDe, chantierVide, datePose,
  distanceTrait, marquerPose, nettoyerChantier, noter, nouvelleReserve, numeroSuivant, photosDuPlan, resumeReserves, simplifierTrait };

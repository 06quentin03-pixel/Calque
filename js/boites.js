/* Calque — module « boites » : raccordement d'un circuit en BOÎTES DE DÉRIVATION, par les endroits techniques
   (demande du 16 novembre 2026). JavaScript pur, sans accès à l'écran : testable avec Node. Le plan n'est jamais modifié.

   Méthode (proposition de Calque, à vérifier : ce n'est pas une règle de la norme) :
   1. les points du circuit qui ne sont pas encore raccordés sont regroupés par niveau et par pièce ;
   2. une pièce où le circuit a au moins deux points reçoit une boîte de dérivation au plafond — une boîte déjà posée dans
      la pièce et libre (aucune gaine d'un autre circuit) est reprise. Sur un niveau sans boîte, des points isolés dans
      plusieurs pièces se partagent une boîte, posée dans la pièce du point le plus central ;
   3. les boîtes sont reliées au tableau (ou de boîte en boîte, ou par un passage entre étages) par des gaines au plafond ;
   4. chaque point est relié à sa boîte : gaine au plafond jusqu'au mur au-dessus de l'appareil, puis descente dans la
      couche de passage du mur ou de la cloison (vide technique, laine de verre ; sinon saignée) : itineraireEntre ;
   5. un point resté seul (circuit spécialisé, point isolé) est relié à la boîte la plus proche du circuit, sinon au
      tableau : jamais d'appareil à appareil.
   Un circuit d'un seul point (four, lave-linge, plaque…) part directement du tableau : une boîte n'y sert à rien.

   Position d'une boîte : point de la pièce qui rend la plus courte la somme des distances (en suivant des tronçons
   droits) jusqu'à ses points, à 30 cm au moins des murs, hors zone interdite et à l'écart des autres symboles.
   La boîte doit rester accessible (trappe de visite dans un faux plafond) : rappelé par l'écran. */
import { DERIVATIONS, TRAVERSEE, ancrage, cheminCircuit, circuitsDe, isElecDuct, tableauDu } from './cheminement.js';
import { inPoly, itineraireEntre, raccorderCircuit } from './itineraire.js';

const POSE_TECHNIQUE = 'plafond';
const MARGE_MUR = 30;   // cm entre la boîte et les faces des murs (estimé par Calque)
const ECART_SYMBOLE = 25; // cm entre la boîte et un autre symbole du plan (lisibilité, place pour la boîte)

function distBord(p, poly) {
  let m = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    m = Math.min(m, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return m;
}
const mediane = (l) => { const a = l.slice().sort((x, y) => x - y), n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/* position d'une boîte dans la pièce poly pour desservir pts ; autres : symboles à éviter ; zones : zones interdites.
   Renvoie { x, y } ou null (pièce trop petite). */
function placerBoite(poly, pts, autres, zones) {
  if (!Array.isArray(poly) || poly.length < 3 || !pts.length) return null;
  const somme = (c) => pts.reduce((s, p) => s + manhattan(c, p), 0);
  const libre = (c, marge) => inPoly(c, poly) && distBord(c, poly) >= marge
    && !(zones || []).some((z) => inPoly(c, z.pts))
    && !(autres || []).some((q) => Math.hypot(q.x - c.x, q.y - c.y) < ECART_SYMBOLE);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of poly) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
  const pas = Math.max(10, Math.ceil(Math.sqrt(((x1 - x0) * (y1 - y0)) / 4000)));
  const cible = { x: mediane(pts.map((p) => p.x)), y: mediane(pts.map((p) => p.y)) };
  for (const marge of [MARGE_MUR, 15, 5]) {
    let best = libre(cible, marge) ? { c: cible, s: somme(cible) } : null;
    for (let x = x0 + pas / 2; x < x1; x += pas) for (let y = y0 + pas / 2; y < y1; y += pas) {
      const c = { x, y }; const s = somme(c) + 1e-3 * Math.hypot(x - cible.x, y - cible.y); // à somme égale : au plus près de la médiane
      if (best && s >= best.s) continue;
      if (libre(c, marge)) best = { c, s };
    }
    if (best) return { x: Math.round(best.c.x), y: Math.round(best.c.y) };
  }
  return null;
}

/* boîte déjà posée dans la pièce et utilisable par le circuit : aucune gaine raccordée ne porte un autre circuit */
function boiteExistante(plan, lv, poly, cid) {
  for (const e of plan.elec || []) {
    if (e.lv !== lv || !DERIVATIONS.has(e.type) || !inPoly(ancrage(e), poly)) continue;
    const ds = (plan.ducts || []).filter((d) => isElecDuct(d) && (d.a === e.id || d.b === e.id));
    if (ds.every((d) => { const l = circuitsDe(d); return !l.length || (l.length === 1 && l[0] === cid); })) return e;
  }
  return null;
}

/* Raccordement d'un circuit en boîtes de dérivation.
   opts.pieces(lv) → [{ nom, poly }] : pièces du niveau (faces intérieures), fournies par l'appelant ;
   opts.kind : type de gaine ; opts.pose : pose des gaines (par défaut « plafond »).
   Renvoie { cid, gaines: [{ id, lv, pts, a, b, cid, len, pose }], boites: [{ id, lv, type, x, y, rot, h, piece, n }],
   reprises: [ids de boîtes existantes utilisées], echecs: [{ id, raison }], deja, raison? }.
   Les gaines désignent les nouvelles boîtes par leur identifiant provisoire (« ~boite0 »…) : l'appelant crée les
   boîtes, puis remplace ces identifiants. */
function raccorderEnBoites(plan, cid, opts = {}) {
  const pose = opts.pose || POSE_TECHNIQUE;
  const out = { cid, gaines: [], boites: [], reprises: [], echecs: [], deja: 0 };
  const T = tableauDu(plan);
  if (!T) { out.raison = 'Posez d’abord le tableau électrique sur le plan.'; return out; }
  const ch0 = cheminCircuit(plan, cid);
  out.deja = ch0.atteints;
  const byId = new Map((plan.elec || []).map((e) => [e.id, e]));
  const reste = ch0.nonAtteints.map((id) => byId.get(id)).filter(Boolean);
  if (!reste.length) return out;
  const base = { pose, kind: opts.kind };
  /* circuit d'un seul point : directement depuis le tableau (une boîte n'aurait qu'une entrée et une sortie) */
  if (ch0.points.length < 2) {
    const r = raccorderCircuit(plan, cid, base);
    return Object.assign(out, { gaines: r.gaines.map((g) => Object.assign(g, { pose })), echecs: r.echecs });
  }
  /* plan de travail : copie des listes, les boîtes provisoires y prennent le circuit pour être raccordées comme ses points */
  const tmp = Object.assign({}, plan, { ducts: (plan.ducts || []).slice(), elec: (plan.elec || []).slice() });
  let n = 0;
  const ajouter = (g) => { const x = Object.assign({}, g, { id: '~bx' + n++, pose }); tmp.ducts.push(x); out.gaines.push(x); return x; };
  const autres = () => tmp.elec.filter((e) => e.lv && e.type !== TRAVERSEE).map((e) => Object.assign({ lv: e.lv }, ancrage(e)));
  const groupes = []; // { boite (élément de tmp), pts: [éléments] }
  const niveaux = [...new Set(reste.map((e) => e.lv))];
  for (const lv of niveaux) {
    const pieces = ((opts.pieces && opts.pieces(lv)) || []).filter((p) => Array.isArray(p.poly) && p.poly.length >= 3);
    const zones = (plan.zones || []).filter((z) => z.lv === lv && Array.isArray(z.pts));
    const parPiece = new Map(), seuls = [];
    for (const e of reste.filter((x) => x.lv === lv)) {
      const a = ancrage(e), p = pieces.find((q) => inPoly(a, q.poly)) || pieces.find((q) => q.loop && inPoly(a, q.loop));
      if (!p) { seuls.push(e); continue; }
      if (!parPiece.has(p)) parPiece.set(p, []);
      parPiece.get(p).push(e);
    }
    const boiteDans = (p, pts) => {
      const ex = boiteExistante(tmp, lv, p.poly, cid);
      if (ex) {
        const i = tmp.elec.indexOf(ex), copie = Object.assign({}, ex, { cid }); tmp.elec[i] = copie; out.reprises.push(ex.id);
        return copie;
      }
      const pos = placerBoite(p.poly, pts.map(ancrage), autres().filter((q) => q.lv === lv), zones);
      if (!pos) return null;
      const b = { id: '~boite' + out.boites.length, lv, type: 'derivation', x: pos.x, y: pos.y, rot: 0, h: null, piece: p.nom || '', n: pts.length };
      out.boites.push(b); const t = Object.assign({}, b, { cid }); tmp.elec.push(t);
      return t;
    };
    let surNiveau = 0;
    for (const [p, pts] of parPiece) {
      if (pts.length < 2) { seuls.push(...pts); continue; }
      const b = boiteDans(p, pts);
      if (b) { groupes.push({ boite: b, pts }); surNiveau++; } else seuls.push(...pts);
    }
    /* niveau sans boîte : les points isolés se partagent une boîte, dans la pièce du point le plus central */
    if (!surNiveau && seuls.length >= 2) {
      const ancres = seuls.map(ancrage), m = { x: mediane(ancres.map((q) => q.x)), y: mediane(ancres.map((q) => q.y)) };
      let k = 0; ancres.forEach((q, i) => { if (manhattan(q, m) < manhattan(ancres[k], m)) k = i; });
      const p = pieces.find((q) => inPoly(ancres[k], q.poly));
      const b = p ? boiteDans(p, seuls) : null;
      if (b) { const x = out.boites.find((y) => y.id === b.id); if (x) x.n = seuls.length; groupes.push({ boite: b, pts: seuls.splice(0) }); }
    }
  }
  if (!groupes.length) { // aucune boîte possible : raccordement habituel, depuis le tableau ou une boîte
    const r = raccorderCircuit(plan, cid, Object.assign({ depart: (x) => DERIVATIONS.has(x.type) }, base));
    return Object.assign(out, { gaines: r.gaines.map((g) => Object.assign(g, { pose })), echecs: r.echecs });
  }
  /* 3. boîtes reliées au tableau : de proche en proche, de boîte en boîte (jamais depuis un appareil) */
  const ids = new Set(groupes.map((g) => g.boite.id));
  const rA = raccorderCircuit(tmp, cid, Object.assign({ seulement: ids, depart: (x) => DERIVATIONS.has(x.type) }, base));
  for (const g of rA.gaines) ajouter(g);
  const relieesA = new Set(cheminCircuit(tmp, cid).points.filter((x) => x.dist != null).map((x) => x.id));
  /* 4. chaque point relié à sa boîte (au plafond, puis descente dans le mur) */
  const restants = new Set();
  for (const G of groupes) {
    if (!relieesA.has(G.boite.id)) { for (const e of G.pts) restants.add(e.id); continue; }
    const A = ancrage(G.boite);
    for (const e of G.pts) {
      const res = itineraireEntre(tmp, e.lv, G.boite, A, e, ancrage(e), { pose });
      if (!res) { restants.add(e.id); continue; }
      ajouter({ lv: e.lv, sys: 'elec', pts: res.pts, a: G.boite.id, b: e.id, cid, len: res.len, kind: opts.kind });
    }
  }
  /* 5. points isolés ou sans itinéraire depuis leur boîte : vers la boîte la plus proche, sinon le tableau */
  for (const id of cheminCircuit(tmp, cid).nonAtteints) if (!ids.has(id)) restants.add(id);
  if (restants.size) {
    const rC = raccorderCircuit(tmp, cid, Object.assign({ seulement: restants, depart: (x) => DERIVATIONS.has(x.type) }, base));
    for (const g of rC.gaines) ajouter(g);
    out.echecs.push(...rC.echecs);
  }
  /* boîte qui n'a pas pu être reliée au tableau : elle n'est pas proposée */
  const perdues = new Set(out.boites.filter((b) => !relieesA.has(b.id)).map((b) => b.id));
  if (perdues.size) {
    out.boites = out.boites.filter((b) => !perdues.has(b.id));
    out.gaines = out.gaines.filter((g) => !perdues.has(g.a) && !perdues.has(g.b));
  }
  for (const id of out.reprises.slice()) if (!relieesA.has(id)) out.reprises.splice(out.reprises.indexOf(id), 1);
  for (const g of out.gaines) { delete g.id; if (!g.kind) delete g.kind; g.sys = 'elec'; }
  return out;
}

export { MARGE_MUR, POSE_TECHNIQUE, placerBoite, raccorderEnBoites };

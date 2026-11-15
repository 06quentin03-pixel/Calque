/* Calque — module « equipement » : équipement minimal d'une pièce (prises, éclairage, commande, sortie 32 A).
   JavaScript pur, sans accès à l'écran : testable avec Node. Le plan n'est jamais modifié : l'écran pose les symboles.

   Les besoins viennent des règles de contrôle de Calque déjà en place (« cq_socles_piece », « cq_cuisine_pt »,
   « cq_cuisine_32 », « cq_eclairage_piece » dans regles.js) : besoinsPiece est la SEULE définition de ces quantités,
   utilisée à la fois par le contrôle (electricite.js) et par l'équipement automatique. Ces règles ne sont pas encore
   rattachées à une page d'un extrait Legrand : le contrôle reste « vérification nécessaire », et l'équipement posé est
   une proposition à vérifier.

   Positions : le long des faces de murs de la pièce, en évitant les portes et fenêtres (±10 cm), les angles (25 cm),
   les volumes 1 et 2 de la salle de bain (60 cm autour de la baignoire et de la douche), l'aplomb de l'évier et de la
   plaque, et en s'écartant le plus possible des prises déjà posées (répartition régulière). */
import { inPoly, labelPoint } from './noyau.js';
import { itemToLocal } from './mutations.js';
import { ELEC_BY } from './symboles.js';
import { ALARM, NO_CIRCUIT, SOCKETS, LIGHTS } from './elecdonnees.js';
import { cheminCircuit } from './cheminement.js';

const DEG = Math.PI / 180;
const PIECE = {
  sejour: /s[ée]jour|salon/i, chambre: /chambre/i, cuisine: /cuisine/i, sdb: /salle (de bain|d.eau)|sdb/i, wc: /wc|toilette/i,
  rangement: /dressing|placard|cellier/i, principale: /s[ée]jour|chambre|salon/i,
};
/* vide fermé par des murs (gaine, creux entre deux parois, poteau creux d'un plan importé) : surface de moins de 1 m²
   et nom donné automatiquement (« Pièce 3 »). Ce n'est pas une pièce : rien n'y est demandé. Nommer l'espace (« WC »…)
   suffit pour qu'il soit de nouveau contrôlé comme une pièce. */
const VIDE_MAX = 1;
const estVide = (nom, aire) => /^Pièce \d+$/.test(String(nom || '')) && aire < VIDE_MAX;
/* besoins d'une pièce d'après son nom et sa surface (m²) */
function besoinsPiece(nom, aire, ext) {
  const n = String(nom || '');
  /* terrasse, balcon (pièce extérieure, v15) ou sol supprimé (vide) : pas une pièce d'habitation, aucun besoin imposé ici */
  if (ext) return { socles: 0, pourquoi: '', plan: 0, cuisson: false, lumiere: false, lumiereObligatoire: false, rj45: false, vide: true, exterieure: true };
  if (estVide(n, aire)) return { socles: 0, pourquoi: '', plan: 0, cuisson: false, lumiere: false, lumiereObligatoire: false, rj45: false, vide: true };
  let socles = 0, pourquoi = '';
  if (PIECE.sejour.test(n)) { socles = aire <= 28 ? Math.max(5, Math.ceil(aire / 4)) : 7; pourquoi = aire <= 28 ? '1 socle par tranche de 4 m², 5 au minimum' : '7 au minimum au-delà de 28 m²'; }
  else if (PIECE.chambre.test(n)) { socles = 3; pourquoi = '3 au minimum'; }
  else if (PIECE.cuisine.test(n)) { socles = aire <= 4 ? 3 : 6; pourquoi = aire <= 4 ? '3 si 4 m² ou moins' : '6 dont 4 au-dessus du plan de travail'; }
  else if (PIECE.sdb.test(n)) { socles = 1; pourquoi = '1 hors volumes'; }
  else if (!PIECE.wc.test(n) && aire > 4) { socles = 1; pourquoi = '1 dans toute pièce de plus de 4 m² (hors WC)'; }
  const cuisine = PIECE.cuisine.test(n);
  return {
    socles, pourquoi,
    plan: cuisine && aire > 4 ? 4 : 0, // prises au-dessus du plan de travail (comprises dans les socles)
    cuisson: cuisine, // sortie 32 A
    lumiere: true, lumiereObligatoire: !PIECE.rangement.test(n),
    rj45: PIECE.principale.test(n), // conseil
  };
}
const soclesDe = (els) => els.reduce((s, e) => s + (SOCKETS[e.type] || 0), 0);

/* ce qui manque dans une pièce : [{ type, n, pourquoi }] ; els : symboles déjà dans la pièce */
function manquants(nom, aire, els, ext) {
  const b = besoinsPiece(nom, aire, ext), out = [];
  const pt = els.filter((e) => e.type === 'pc_pt').length;
  const addPt = Math.max(0, b.plan - pt);
  if (addPt) out.push({ type: 'pc_pt', n: addPt, pourquoi: `${b.plan} prises au-dessus du plan de travail` });
  const addPc = Math.max(0, b.socles - soclesDe(els) - addPt);
  if (addPc) out.push({ type: 'pc', n: addPc, pourquoi: `socles de prise : ${b.pourquoi}` });
  if (b.cuisson && !els.some((e) => e.type === 'pc32')) out.push({ type: 'pc32', n: 1, pourquoi: 'sortie 32 A pour la plaque de cuisson' });
  if (b.vide) return out;
  if (b.lumiereObligatoire && !els.some((e) => LIGHTS.has(e.type))) {
    out.push({ type: 'pl', n: 1, pourquoi: 'un point d’éclairage dans chaque pièce' });
    out.push({ type: 'int_s', n: 1, pourquoi: 'commande du point lumineux, près de la porte', commande: true });
  }
  return out;
}

/* géométrie des murs du niveau, depuis le plan : ouvertures (segments sur l'axe) */
function ouverturesDuNiveau(plan, lv) {
  const nodes = new Map((plan.nodes || []).map((n) => [n.id, n])), murs = new Map();
  for (const w of plan.walls || []) { if (w.lv !== lv) continue; const A = nodes.get(w.a), B = nodes.get(w.b); if (!A || !B) continue; const L = Math.hypot(B.x - A.x, B.y - A.y); if (L < 1) continue; murs.set(w.id, { A, B, L, d: { x: (B.x - A.x) / L, y: (B.y - A.y) / L }, th: w.th || 20 }); }
  const out = [];
  for (const o of plan.openings || []) {
    const m = murs.get(o.wall); if (!m || !(o.w > 0)) continue;
    const t0 = Math.max(0, o.t - o.w / 2), t1 = Math.min(m.L, o.t + o.w / 2);
    out.push({ o, kind: o.kind, a: { x: m.A.x + m.d.x * t0, y: m.A.y + m.d.y * t0 }, b: { x: m.A.x + m.d.x * t1, y: m.A.y + m.d.y * t1 }, th: m.th, d: m.d });
  }
  return out;
}
function distSeg(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
  return Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy);
}

/* points candidats le long des faces de la pièce (tous les 5 cm), avec la normale vers l'intérieur */
function candidats(poly, pas) {
  const out = [], n = poly.length;
  for (let i = 0; i < n; i++) {
    const A = poly[i], B = poly[(i + 1) % n], L = Math.hypot(B.x - A.x, B.y - A.y); if (L < 1) continue;
    const ux = (B.x - A.x) / L, uy = (B.y - A.y) / L;
    let nx = -uy, ny = ux; const m = { x: (A.x + B.x) / 2 + nx * 2, y: (A.y + B.y) / 2 + ny * 2 };
    if (!inPoly(m, poly)) { nx = -nx; ny = -ny; }
    for (let s = 25; s <= L - 25 + 1e-6; s += pas) out.push({ x: A.x + ux * s, y: A.y + uy * s, nx, ny, bord: i, s, L });
  }
  return out;
}
/* centre géométrique (barycentre de la surface) d'un polygone */
function centre(poly) {
  let A = 0, cx = 0, cy = 0;
  for (let i = 0, n = poly.length; i < n; i++) { const p = poly[i], q = poly[(i + 1) % n], k = p.x * q.y - q.x * p.y; A += k; cx += (p.x + q.x) * k; cy += (p.y + q.y) * k; }
  return Math.abs(A) < 1e-9 ? null : { x: cx / (3 * A), y: cy / (3 * A) };
}
/* rot d'un symbole mural dont la face est tournée vers (nx, ny) — même convention que l'aimantation du plan */
const rotVers = (nx, ny) => { let r = Math.atan2(-nx, ny) / DEG; r = r % 360; if (r < 0) r += 360; return Math.round(r * 10) / 10; };

/* raccordement des appareils posés dans la pièce (demande du 15 novembre 2026) : un radiateur du mobilier reçoit une
   sortie de câble radiateur, un four, un lave-vaisselle, un lave-linge, un sèche-linge ou un congélateur sa prise
   spécialisée, une plaque de cuisson sa sortie 32 A. Un appareil est déjà raccordé si un symbole qui lui convient est
   à moins de RAYON cm de lui (chaque symbole ne sert qu'à un appareil). */
const RACCORD = {
  radiateur: { type: 'sortie_rad', ok: ['sortie_rad', 'rad_elec'], pourquoi: 'sortie de câble du radiateur', rayon: 100 },
  four: { type: 'pc_four', ok: ['pc_four', 'pc20'], pourquoi: 'prise spécialisée du four' },
  lave_vaisselle: { type: 'pc_lv', ok: ['pc_lv', 'pc20'], pourquoi: 'prise spécialisée du lave-vaisselle' },
  lave_linge: { type: 'pc_ll', ok: ['pc_ll', 'pc20'], pourquoi: 'prise spécialisée du lave-linge' },
  seche_linge: { type: 'pc_sl', ok: ['pc_sl', 'pc20'], pourquoi: 'prise spécialisée du sèche-linge' },
  congelateur: { type: 'pc_cg', ok: ['pc_cg', 'pc20'], pourquoi: 'prise spécialisée du congélateur' },
  plaque: { type: 'pc32', ok: ['pc32'], pourquoi: 'sortie 32 A de la plaque de cuisson' },
  plaque90: { type: 'pc32', ok: ['pc32'], pourquoi: 'sortie 32 A de la plaque de cuisson' },
  /* demande du 16 novembre 2026 : tous les appareils électriques du mobilier reçoivent leur raccordement */
  hotte: { type: 'pc_hotte', ok: ['pc_hotte', 'sortie', 'pc20'], pourquoi: 'prise de la hotte, à 1,80 m', haut: true },
  seche_serv: { type: 'sortie_rad', ok: ['sortie_rad', 'seche_serv_e', 'sortie'], pourquoi: 'sortie de câble du sèche-serviettes', rayon: 100 },
  chauffe_eau: { type: 'ce_elec', ok: ['ce_elec', 'ballon_thermo', 'sortie', 'pc20'], pourquoi: 'raccordement du chauffe-eau (circuit dédié avec contacteur)', centre: true },
  frigo: { type: 'pc_frigo', ok: ['pc_frigo', 'pc', 'pc2', 'pc20'], pourquoi: 'prise du réfrigérateur', rayon: 120 },
  frigo_us: { type: 'pc_frigo', ok: ['pc_frigo', 'pc', 'pc2', 'pc20'], pourquoi: 'prise du réfrigérateur', rayon: 120 },
  micro_ondes: { type: 'pc_mo', ok: ['pc_mo', 'pc', 'pc2', 'pc_pt'], pourquoi: 'prise du micro-ondes', rayon: 120 },
  chaudiere: { type: 'pc20', ok: ['pc20', 'pc', 'sortie'], pourquoi: 'alimentation de la chaudière (circuit spécialisé, selon sa notice)' },
};
const RAYON = 150;
function appareilsARaccorder(plan, piece, els) {
  const items = (plan.items || []).filter((it) => it.lv === piece.lv && RACCORD[it.type] && inPoly(it, piece.loop || piece.poly));
  const pris = new Set(), out = [];
  for (const it of items) {
    const R = RACCORD[it.type], ray = R.rayon || RAYON;
    let best = null, bd = Infinity;
    for (const e of els) { if (pris.has(e.id) || !R.ok.includes(e.type)) continue; const d = Math.hypot(e.x - it.x, e.y - it.y); if (d <= ray && d < bd) { bd = d; best = e; } }
    if (best) { pris.add(best.id); continue; }
    out.push({ type: R.type, n: 1, pourquoi: `${R.pourquoi}${it.name && !/^(Radiateur|Four|Lave-vaisselle|Lave-linge|Sèche-linge|Congélateur|Plaque de cuisson( 60| 90)?|Hotte|Sèche-serviettes|Chauffe-eau|Réfrigérateur( américain)?|Micro-ondes|Chaudière)$/.test(it.name) ? ` (${it.name})` : ''}`, pour: it.id });
  }
  return out;
}
/* besoins de la pièce + raccordement des appareils ; la sortie 32 A demandée par la cuisine sert à sa plaque */
function besoinsComplets(plan, piece, els) {
  const m = manquants(piece.nom, piece.aire, els, piece.ext), r = appareilsARaccorder(plan, piece, els);
  const p32 = m.find((x) => x.type === 'pc32');
  if (p32) { const i = r.findIndex((x) => x.type === 'pc32'); if (i >= 0) { p32.pour = r[i].pour; r.splice(i, 1); } }
  return m.concat(r);
}
/* nombre d'appareils à poser dans une pièce (rapide : sans chercher les positions) */
function aPoser(plan, piece) {
  const els = (plan.elec || []).filter((e) => e.lv === piece.lv && inPoly(e, piece.loop || piece.poly));
  return besoinsComplets(plan, piece, els).reduce((s, m) => s + m.n, 0);
}
/* Propose les symboles à poser dans une pièce.
   piece : { lv, nom, poly (faces intérieures), loop (axes), aire (m²), holes } ; renvoie { poses: [{ type, x, y, rot, h }], liens: [[i, j]] (indices dans poses : commande → lumière), manque: [...], impossible: [...] } */
function equiperPiece(plan, piece) {
  const els = (plan.elec || []).filter((e) => e.lv === piece.lv && inPoly(e, piece.loop || piece.poly));
  const manque = besoinsComplets(plan, piece, els);
  const out = { poses: [], liens: [], manque, impossible: [] };
  if (!manque.length) return out;
  /* seulement les ouvertures proches de la pièce (gros plans : des centaines d'ouvertures sur le niveau) */
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const q of piece.poly) { if (q.x < x0) x0 = q.x; if (q.x > x1) x1 = q.x; if (q.y < y0) y0 = q.y; if (q.y > y1) y1 = q.y; }
  const M = 60, dedans = (q) => q.x >= x0 - M && q.x <= x1 + M && q.y >= y0 - M && q.y <= y1 + M;
  const ouv = ouverturesDuNiveau(plan, piece.lv).filter((o) => dedans(o.a) || dedans(o.b));
  const items = (plan.items || []).filter((it) => it.lv === piece.lv && inPoly(it, piece.loop || piece.poly));
  const humides = items.filter((it) => /^(baignoire|baignoire_ilot|douche|douche_ita)$/.test(it.type));
  const chauds = items.filter((it) => /^(evier1|evier2|evier_eg|plaque|plaque90)$/.test(it.type));
  const plans = items.filter((it) => /^(plan_travail|plan_angle|meuble_bas|meuble_angle|ilot)$/.test(it.type));
  const C = candidats(piece.poly, 5);
  const libre = (p) => {
    for (const o of ouv) {
      /* devant une porte ou une fenêtre (élargie de 10 cm de chaque côté) : interdit */
      const L = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y), t = (p.x - o.a.x) * o.d.x + (p.y - o.a.y) * o.d.y;
      const perp = Math.abs(-(p.x - o.a.x) * o.d.y + (p.y - o.a.y) * o.d.x);
      if (perp <= o.th / 2 + 10 && t >= -10 && t <= L + 10) return false;
    }
    for (const it of humides) { const l = itemToLocal(it, p), dx = Math.max(0, Math.abs(l.x) - it.w / 2), dy = Math.max(0, Math.abs(l.y) - it.d / 2); if (Math.hypot(dx, dy) < 65) return false; }
    for (const it of chauds) { const l = itemToLocal(it, p); if (Math.abs(l.x) <= it.w / 2 + 5 && l.y <= -it.d / 2 + 15 && l.y >= -it.d / 2 - 30) return false; }
    return true;
  };
  const surPlan = (p) => plans.some((it) => { const l = itemToLocal(it, p); return Math.abs(l.x) <= it.w / 2 - 5 && l.y <= -it.d / 2 + 15 && l.y >= -it.d / 2 - 30; });
  const ok = C.filter(libre);
  const deja = els.filter((e) => SOCKETS[e.type] || e.type === 'pc32').map((e) => ({ x: e.x, y: e.y }));
  const pris = [];
  /* choisit n points : le plus éloigné de tout ce qui est déjà posé (répartition régulière) */
  const choisir = (liste, n, ecartMin) => {
    const res = [];
    for (let k = 0; k < n; k++) {
      let best = null, bd = -1;
      for (const c of liste) {
        let d = Infinity; for (const q of [...deja, ...pris]) { const v = Math.hypot(c.x - q.x, c.y - q.y); if (v < d) d = v; }
        if (d < ecartMin) continue;
        if (d > bd) { bd = d; best = c; }
      }
      if (!best) break;
      res.push(best); pris.push(best);
    }
    return res;
  };
  const poser = (type, c) => { const def = ELEC_BY.get(type); out.poses.push({ type, x: Math.round(c.x * 10) / 10, y: Math.round(c.y * 10) / 10, rot: def && def.wall ? rotVers(c.nx, c.ny) : 0, h: def ? def.h : null }); return out.poses.length - 1; };
  const ORDRE = { pl: 0, int_s: 1, pc32: 2, sortie_rad: 3, pc_four: 3, pc_lv: 3, pc_ll: 3, pc_sl: 3, pc_cg: 3, pc_hotte: 3, pc_frigo: 3, pc_mo: 3, ce_elec: 3, pc20: 3, pc_pt: 4, pc: 5 };
  /* derrière l'appareil, sur la face de mur la plus proche de son dos (à 60 cm au plus) ; une sortie de câble radiateur
     peut être sous une fenêtre (place habituelle d'un radiateur), pas devant une porte */
  const sousFenetre = (p) => {
    for (const o of ouv) {
      if (o.kind === 'window') continue;
      const L = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y), t = (p.x - o.a.x) * o.d.x + (p.y - o.a.y) * o.d.y;
      const perp = Math.abs(-(p.x - o.a.x) * o.d.y + (p.y - o.a.y) * o.d.x);
      if (perp <= o.th / 2 + 10 && t >= -10 && t <= L + 10) return false;
    }
    return true;
  };
  const derriere = (m) => {
    const it = (plan.items || []).find((x) => x.id === m.pour); if (!it) return null;
    const a = (it.rot || 0) * DEG, dos = { x: it.x + (it.d / 2) * Math.sin(a), y: it.y - (it.d / 2) * Math.cos(a) };
    /* prise de la hotte : au-dessus de la plaque (seule prise admise à cet endroit, à 1,80 m), hors ouvertures */
    const R = RACCORD[it.type] || {};
    const liste = m.type === 'sortie_rad' ? C.filter(sousFenetre) : R.haut ? C.filter((p) => sousFenetre(p) && !ouv.some((o) => o.kind === 'window' && distSeg(p, o.a, o.b) <= o.th / 2 + 10)) : ok;
    let best = null, bd = Infinity;
    for (const c of liste) { if (proche(c, 15)) continue; const d = Math.hypot(c.x - dos.x, c.y - dos.y); if (d < bd) { bd = d; best = c; } }
    return best && bd <= 60 ? best : null;
  };
  const proche = (c, min) => [...deja, ...pris].some((q) => Math.hypot(c.x - q.x, c.y - q.y) < min);
  for (const m of manque.slice().sort((x, y) => (ORDRE[x.type] ?? 9) - (ORDRE[y.type] ?? 9))) {
    if (m.type === 'pl') {
      const g = centre(piece.poly), p = g && inPoly(g, piece.poly) ? g : labelPoint(piece.poly); // pièce en L : point intérieur
      out.poses.push({ type: 'pl', x: Math.round(p.x), y: Math.round(p.y), rot: 0, h: null });
      continue;
    }
    if (m.type === 'int_s') {
      /* près de la porte de la pièce : 20 cm à côté du tableau de la porte, sur la face intérieure */
      const portes = ouv.filter((o) => o.kind === 'door' || o.kind === 'gap');
      let best = null;
      for (const o of portes) for (const c of ok) {
        const t = (c.x - o.a.x) * o.d.x + (c.y - o.a.y) * o.d.y, L = Math.hypot(o.b.x - o.a.x, o.b.y - o.a.y), dl = distSeg(c, o.a, o.b);
        if (dl > o.th / 2 + 40) continue;
        const ecart = t < 0 ? -t : t - L; if (ecart < 12 || ecart > 60 || proche(c, 25)) continue;
        const score = Math.abs(ecart - 20); if (!best || score < best.score) best = { c, score };
      }
      const c = best ? best.c : ok.find((x) => !proche(x, 25));
      if (!c) { out.impossible.push({ type: m.type, n: 1 }); continue; }
      pris.push(c);
      const i = poser('int_s', c); const j = out.poses.findIndex((x) => x.type === 'pl'); if (j >= 0) out.liens.push([i, j]);
      continue;
    }
    if (m.pour && (RACCORD[((plan.items || []).find((x) => x.id === m.pour) || {}).type] || {}).centre) {
      /* appareil raccordé par un symbole posé sur lui (chauffe-eau) : au centre de l'appareil */
      const it = (plan.items || []).find((x) => x.id === m.pour);
      out.poses.push({ type: m.type, x: Math.round(it.x * 10) / 10, y: Math.round(it.y * 10) / 10, rot: 0, h: (ELEC_BY.get(m.type) || {}).h ?? null, pour: m.pour });
      continue;
    }
    if (m.pour) {
      const c = derriere(m);
      if (c) { pris.push(c); out.poses[poser(m.type, c)].pour = m.pour; continue; }
      if (m.type !== 'pc32') { out.impossible.push({ type: m.type, n: 1 }); continue; }
    }
    if (m.type === 'pc32') {
      /* au plus près de la plaque de cuisson (sans être à son aplomb), sinon le plus loin des autres prises */
      const plaque = chauds.find((it) => /^plaque/.test(it.type));
      if (plaque) {
        let best = null, bd = Infinity;
        for (const c of ok) { if (proche(c, 25)) continue; const d = Math.hypot(c.x - plaque.x, c.y - plaque.y); if (d < bd) { bd = d; best = c; } }
        if (best) { pris.push(best); poser('pc32', best); continue; }
      }
    }
    let liste = ok;
    if (m.type === 'pc_pt') { const s = ok.filter(surPlan); if (s.length) liste = s; }
    const got = choisir(liste, m.n, m.type === 'pc_pt' ? 40 : 60);
    const got2 = got.length < m.n ? got.concat(choisir(liste, m.n - got.length, 25)) : got;
    for (const c of got2) poser(m.type, c);
    if (got2.length < m.n) out.impossible.push({ type: m.type, n: m.n - got2.length });
  }
  /* le point lumineux d'abord, puis sa commande : les indices des liens restent justes */
  return out;
}

/* ---------------- câbles à tirer (demande du 16 novembre 2026) ----------------
   Appareils électriques déjà posés dans la pièce (sèche-serviettes, sortie de hotte, radiateur, prises…) qui attendent
   leur câble : sans circuit (etat 'circuit'), ou sur un circuit mais pas encore reliés au tableau par les gaines
   (etat 'gaine'). Les symboles sans alimentation propre (communication, détecteurs autonomes, boîtes, passages) ne sont
   pas comptés : même définition que « Relier les appareils sans circuit » (affectation.js). cache : Map cid → cheminCircuit. */
const aAlimenter = (e) => !NO_CIRCUIT.has(e.type) && !(ALARM.has(e.type) && e.type !== 'centrale');
function cablesATirer(plan, piece, cache) {
  const valides = new Set((plan.circuits || []).map((c) => c.id)), C = cache || new Map(), out = [];
  for (const e of plan.elec || []) {
    if (e.lv !== piece.lv || !aAlimenter(e) || !inPoly(e, piece.loop || piece.poly)) continue;
    if (!e.cid || !valides.has(e.cid)) { out.push({ id: e.id, type: e.type, etat: 'circuit' }); continue; }
    if (!C.has(e.cid)) C.set(e.cid, cheminCircuit(plan, e.cid));
    const ch = C.get(e.cid);
    if (ch.nonAtteints.includes(e.id)) out.push({ id: e.id, type: e.type, etat: 'gaine', cid: e.cid });
  }
  return out;
}

export { cablesATirer };
export { PIECE, RACCORD, VIDE_MAX, aPoser, appareilsARaccorder, besoinsComplets, estVide, besoinsPiece, equiperPiece, manquants, ouverturesDuNiveau, rotVers };

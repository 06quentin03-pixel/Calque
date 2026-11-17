/* Calque — module « toits » : toits (plat, un pan, deux pans, quatre pans) et sols sans murs (terrasse, dalle),
   calepinage des panneaux solaires sur un pan de toit. JavaScript pur, sans accès à l'écran : testable avec Node.

   Données (format v20) : P.surfaces[] = {
     id, lv, kind ('toit' | 'terrasse'), name (facultatif), pts [{ x, y }] (contour, cm),
     z    altitude de la base par rapport au sol fini du niveau (cm). Toit : haut des murs (hauteur du niveau) par défaut ;
          terrasse : dessus de la dalle (0 = au niveau du sol fini).
     e    épaisseur (cm) : toiture (chevrons, isolant, couverture) ou dalle de la terrasse.
     forme ('plat' | '1pan' | '2pans' | '4pans'), pente (°, 0 à 75), sens (°) : pour un pan, sens où l'eau s'écoule ;
          pour deux et quatre pans, direction du faîtage. Angles dans le repère du plan (comme rot), Y vers le bas.
     mat  revêtement (TOIT_MATS ou TERR_MATS), pignons (false : pas de pignon maçonné sous les rives), masque (true : caché en 3D),
     pv   panneaux solaires { pan (indice du pan), lm, hm (largeur et hauteur d'un module, cm), orient ('portrait' | 'paysage'),
          marge (cm, bord du pan), jeu (cm, entre modules), wc (puissance crête d'un module, W, SAISIE par l'utilisateur) }
   }
   Les dimensions proposées des modules sont des formats courants du commerce : ce ne sont pas des références de fabricant.
   Aucune production solaire n'est estimée par Calque (elle dépend du site, de l'ombrage et du matériel). */
import { isNum } from './noyau.js';
import { nettoyerCE } from './ecs.js';
import { nettoyerKnxElec, nettoyerKnxPlan } from './knx.js';

const DEG = Math.PI / 180;
const FORMES = { plat: 'Toit plat (toit-terrasse)', '1pan': 'Un pan (appentis)', '2pans': 'Deux pans', '4pans': 'Quatre pans (croupes)' };
const TOIT_MATS = { tuile: { n: 'Tuiles', coul: '#B4553A' }, ardoise: { n: 'Ardoises', coul: '#4E5660' }, bac: { n: 'Bac acier', coul: '#6F7780' },
  zinc: { n: 'Zinc', coul: '#9AA3A8' }, bardeau: { n: 'Bardeaux (shingles)', coul: '#5A4E46' }, vegetal: { n: 'Toiture végétalisée', coul: '#6E8F4E' },
  etancheite: { n: 'Étanchéité (toit plat)', coul: '#777C80' } };
const TERR_MATS = { bois: { n: 'Lames de bois (platelage)', coul: '#B98A57' }, composite: { n: 'Lames composites', coul: '#8C7A6B' },
  dalle: { n: 'Dalles sur plots', coul: '#C9C2B4' }, beton: { n: 'Dalle béton', coul: '#B3B6B5' }, carrelage: { n: 'Carrelage extérieur', coul: '#D2C6B2' },
  gravier: { n: 'Gravier', coul: '#CFC8B8' }, pelouse: { n: 'Pelouse', coul: '#8DB46A' } };
/* formats courants de modules photovoltaïques (largeur × hauteur, cm) : aide à la saisie, à remplacer par la fiche du module */
const MODULES_PV = [
  { n: 'Module 60 cellules (≈ 100 × 165 cm)', lm: 100, hm: 165 },
  { n: 'Module 108 demi-cellules (≈ 113 × 172 cm)', lm: 113, hm: 172 },
  { n: 'Module 120 demi-cellules (≈ 104 × 176 cm)', lm: 104, hm: 176 },
  { n: 'Grand module (≈ 113 × 228 cm)', lm: 113, hm: 228 },
];
const ORIGINE_PV = 'Format courant du commerce proposé par Calque (à remplacer par la fiche du module choisi)';

/* ---------------- géométrie plane ---------------- */
function aire(pts) { let a = 0; for (let i = 0; i < pts.length; i++) { const p = pts[i], q = pts[(i + 1) % pts.length]; a += p.x * q.y - q.x * p.y; } return a / 2; }
function dedans(p, pts) {
  let c = false;
  for (let a = 0, b = pts.length - 1; a < pts.length; b = a++) { const A = pts[a], B = pts[b]; if ((A.y > p.y) !== (B.y > p.y) && p.x < ((B.x - A.x) * (p.y - A.y)) / (B.y - A.y) + A.x) c = !c; }
  return c;
}
/* garde la partie du polygone où f(p) ≥ 0 (f linéaire) */
function couper(pts, f) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length], fp = f(p), fq = f(q);
    if (fp >= 0) out.push(p);
    if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); out.push({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }); }
  }
  return out;
}
function distBords(p, pts) {
  let d = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2)) : 0;
    d = Math.min(d, Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t)));
  }
  return d;
}
const repere = (s) => { const a = (isNum(s.sens) ? s.sens : 0) * DEG; const d = { x: Math.cos(a), y: Math.sin(a) }; return { d, n: { x: -d.y, y: d.x } }; };

/* ---------------- lecture d'une surface ---------------- */
const estToit = (s) => !!s && s.kind === 'toit';
const formeDe = (s) => (estToit(s) && FORMES[s.forme] ? s.forme : 'plat');
const penteDe = (s) => (formeDe(s) === 'plat' ? 0 : Math.max(0, Math.min(75, isNum(s.pente) ? s.pente : 0)));
const epDe = (s) => (isNum(s.e) && s.e > 0 ? s.e : estToit(s) ? 25 : 15);
/* altitude de la base, au-dessus du sol fini du niveau (cm) ; L = niveau (h = hauteur sous plafond) */
function baseDe(s, L) { if (isNum(s.z)) return s.z; return estToit(s) ? (L && isNum(L.h) ? L.h : 250) : 0; }

/* plans du toit : hauteur au-dessus de la base h(p) = a·x + b·y + c ; le toit est le plus bas de ces plans (min) */
function plansToit(s) {
  const f = formeDe(s), t = Math.tan(penteDe(s) * DEG), pts = s.pts || [];
  if (f === 'plat' || !pts.length || !(t > 0)) return [{ a: 0, b: 0, c: 0 }];
  const { d, n } = repere(s);
  const U = pts.map((p) => p.x * d.x + p.y * d.y), W = pts.map((p) => p.x * n.x + p.y * n.y);
  const u0 = Math.min(...U), u1 = Math.max(...U), v0 = Math.min(...W), v1 = Math.max(...W);
  const pl = (kx, ky, c) => ({ a: kx * t, b: ky * t, c: c * t });
  if (f === '1pan') return [pl(-d.x, -d.y, u1)];                                   // (u1 − u)·t : l'eau coule vers +d
  const deux = [pl(n.x, n.y, -v0), pl(-n.x, -n.y, v1)];                             // (v − v0)·t et (v1 − v)·t
  if (f === '2pans') return deux;
  return [...deux, pl(d.x, d.y, -u0), pl(-d.x, -d.y, u1)];                           // croupes aux deux bouts
}
const hPlan = (q, p) => q.a * p.x + q.b * p.y + q.c;
function hauteurToit(s, p) { const Q = plansToit(s); let h = Infinity; for (const q of Q) h = Math.min(h, hPlan(q, p)); return Math.max(0, h); }
/* hauteur du faîtage (point le plus haut) au-dessus de la base */
function hauteurFaitage(s) {
  const pans = pansToit(s); let h = 0;
  for (const pn of pans) for (const p of pn.pts) h = Math.max(h, hauteurToit(s, p));
  return h;
}
/* pans du toit : contour (projection), plan, pente, sens d'écoulement (°, repère du plan), surfaces projetée et réelle (cm²) */
function pansToit(s) {
  const pts = (s.pts || []).filter((p) => p && isNum(p.x) && isNum(p.y)); if (pts.length < 3) return [];
  const Q = plansToit(s), pente = penteDe(s), out = [];
  Q.forEach((q, k) => {
    let poly = pts.slice();
    Q.forEach((r, j) => { if (j !== k && poly.length >= 3) poly = couper(poly, (p) => hPlan(r, p) - hPlan(q, p) + (j < k ? -1e-9 : 1e-9)); });
    const ap = Math.abs(aire(poly)); if (poly.length < 3 || ap < 1) return;
    const sens = Q.length === 1 && formeDe(s) === 'plat' ? null : Math.atan2(-q.b, -q.a) / DEG;
    out.push({ i: out.length, pts: poly, plan: q, pente, sens, aireProj: ap, aire: ap / Math.cos(pente * DEG) });
  });
  return out;
}
/* points cardinaux : nord du plan (install.nord, ° dans le sens des aiguilles depuis le haut de l'écran ; 0 par défaut) */
const CARD = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-ouest', 'ouest', 'nord-ouest'];
function orientation(sens, nord) {
  if (!isNum(sens)) return null;
  /* sens : angle du plan (0 = vers la droite, 90 = vers le bas) → azimut depuis le nord du plan */
  let az = sens + 90 - (isNum(nord) ? nord : 0); az = ((az % 360) + 360) % 360;
  return { az: Math.round(az), nom: CARD[Math.round(az / 45) % 8] };
}
function aireSurface(s) { return Math.abs(aire(s.pts || [])); }

/* ---------------- panneaux solaires ---------------- */
/* calepinage : modules alignés sur le pan (lignes horizontales le long de la gouttière), entièrement dans le pan à la
   marge près. Renvoie { pan, n, rangs, cols, panneaux: [[4 coins projetés]], kwc (si la puissance d'un module est saisie) } */
function calepinage(s, pv) {
  pv = pv || s.pv; const pans = pansToit(s);
  if (!pv || !pans.length) return { n: 0, panneaux: [], raison: !pans.length ? 'Toit sans contour.' : 'Aucun panneau.' };
  const pan = pans[Math.max(0, Math.min(pans.length - 1, isNum(pv.pan) ? pv.pan : 0))];
  const lm = isNum(pv.lm) && pv.lm > 10 ? pv.lm : 113, hm = isNum(pv.hm) && pv.hm > 10 ? pv.hm : 172;
  const portrait = pv.orient !== 'paysage';
  const larg = portrait ? lm : hm, haut = portrait ? hm : lm;          // le long de la gouttière / dans la pente (réel)
  const marge = isNum(pv.marge) && pv.marge >= 0 ? pv.marge : 30, jeu = isNum(pv.jeu) && pv.jeu >= 0 ? pv.jeu : 2;
  const cosP = Math.cos(pan.pente * DEG);
  /* repère du pan : u dans le sens de l'écoulement (projeté), v le long de la gouttière */
  const a = isNum(pan.sens) ? pan.sens * DEG : 0, du = { x: Math.cos(a), y: Math.sin(a) }, dv = { x: -du.y, y: du.x };
  const U = pan.pts.map((p) => p.x * du.x + p.y * du.y), W = pan.pts.map((p) => p.x * dv.x + p.y * dv.y);
  const u0 = Math.min(...U), u1 = Math.max(...U), v0 = Math.min(...W), v1 = Math.max(...W);
  const hu = haut * cosP, ju = jeu * cosP, pt = (u, v) => ({ x: du.x * u + dv.x * v, y: du.y * u + dv.y * v });
  const ok = (q) => dedans(q, pan.pts) && distBords(q, pan.pts) >= marge * cosP - 0.5;
  const panneaux = []; const rangs = new Set(), cols = new Set();
  let r = 0;
  for (let u = u0 + marge * cosP; u + hu <= u1 + 1e-6; u += hu + ju, r++) {
    let c = 0;
    for (let v = v0 + marge; v + larg <= v1 + 1e-6; v += larg + jeu, c++) {
      const P4 = [pt(u, v), pt(u, v + larg), pt(u + hu, v + larg), pt(u + hu, v)];
      if (P4.every(ok)) { panneaux.push(P4); rangs.add(r); cols.add(c); }
    }
  }
  const wc = pv.wc && isNum(pv.wc.v) && pv.wc.v > 0 ? pv.wc : null;
  return { pan: pan.i, n: panneaux.length, rangs: rangs.size, cols: cols.size, panneaux, larg, haut, pente: pan.pente,
    surfaceModules: panneaux.length * lm * hm / 1e4, kwc: wc ? { v: Math.round(panneaux.length * wc.v / 10) / 100, st: wc.st || 'saisie' } : null };
}

/* surface la plus haute qui contient le point p sur le niveau lv (pour poser un appareil sur un toit) */
function surfaceSous(plan, lv, p, kind) {
  let best = null, bz = -Infinity;
  for (const s of plan.surfaces || []) {
    if (s.lv !== lv || (kind && s.kind !== kind) || !Array.isArray(s.pts) || s.pts.length < 3 || !dedans(p, s.pts)) continue;
    const z = baseDe(s) + (estToit(s) ? hauteurToit(s, p) : 0);
    if (z > bz) { bz = z; best = s; }
  }
  return best;
}
/* altitude du dessus d'une surface au point p, au-dessus du sol fini du niveau L (cm) */
function dessusEn(s, p, L) {
  if (estToit(s)) return baseDe(s, L) + hauteurToit(s, p) + epDe(s) / Math.cos(penteDe(s) * DEG);
  return baseDe(s, L);
}

/* ---------------- nettoyage (migration v20, ouverture d'un plan) ---------------- */
function nettoyerSurface(s) {
  if (!s || typeof s !== 'object' || !Array.isArray(s.pts)) return null;
  const pts = s.pts.filter((q) => q && isNum(q.x) && isNum(q.y)).map((q) => ({ x: q.x, y: q.y }));
  if (pts.length < 3 || Math.abs(aire(pts)) < 1) return null;
  const o = { id: s.id, lv: s.lv, kind: s.kind === 'toit' ? 'toit' : 'terrasse', pts };
  if (typeof s.name === 'string' && s.name.trim()) o.name = s.name.trim().slice(0, 60);
  if (isNum(s.z) && Math.abs(s.z) <= 10000) o.z = s.z;
  if (isNum(s.e) && s.e > 0 && s.e <= 200) o.e = s.e;
  if (o.kind === 'toit') {
    o.forme = FORMES[s.forme] ? s.forme : 'plat';
    if (isNum(s.pente)) o.pente = Math.max(0, Math.min(75, s.pente));
    if (TOIT_MATS[s.mat]) o.mat = s.mat;
    if (s.pignons === false) o.pignons = false;
  } else if (TERR_MATS[s.mat]) o.mat = s.mat;
  if (isNum(s.sens)) o.sens = ((s.sens % 360) + 360) % 360;
  if (s.masque === true) o.masque = true;
  if (o.kind === 'toit' && s.pv && typeof s.pv === 'object') {
    const v = s.pv, pv = {};
    for (const k of ['pan', 'lm', 'hm', 'marge', 'jeu']) if (isNum(v[k]) && v[k] >= 0 && v[k] <= 1000) pv[k] = v[k];
    if (v.orient === 'paysage') pv.orient = 'paysage';
    if (v.wc && isNum(v.wc.v) && v.wc.v > 0 && v.wc.v < 2000) pv.wc = { v: v.wc.v, st: v.wc.st === 'verifiee' && v.wc.src ? 'verifiee' : 'saisie', ...(v.wc.src ? { src: String(v.wc.src).slice(0, 200) } : {}) };
    o.pv = pv;
  }
  return o;
}

/* ---------------- murs inclinés (format v20) ---------------- */
/* w.incl : inclinaison du mur par rapport à la verticale (°, −75 à 75), positive vers le côté 1 (normale +n) ;
   w.masque : mur caché dans la vue 3D (il reste sur le plan). Décalage du haut du mur (cm) pour une hauteur h. */
function inclDe(w) { return w && isNum(w.incl) ? Math.max(-75, Math.min(75, w.incl)) : 0; }
function decalageHaut(w, h) { return Math.tan(inclDe(w) * DEG) * (isNum(h) ? h : 250); }
/* longueur du mur sur sa pente pour une hauteur verticale h : surface réelle = longueur × rampant */
function rampant(w, h) { return (isNum(h) ? h : 250) / Math.cos(inclDe(w) * DEG); }
/* inclinaison qui fait se rejoindre au faîte deux murs parallèles distants de L (axe à axe), sur une hauteur h : maison en A */
function inclPourA(L, h) { return isNum(L) && isNum(h) && h > 0 ? Math.atan(L / 2 / h) / DEG : 0; }

/* nettoyage du format v20 (migration v19 → v20 et ouverture d'un plan) : toits et terrasses, murs inclinés, ossature,
   nord du plan, chauffe-eau, KNX. Valeur invalide retirée, rien n'est deviné. */
function nettoyerV20(p) {
  if (!p || typeof p !== 'object') return p;
  p.surfaces = (Array.isArray(p.surfaces) ? p.surfaces : []).map(nettoyerSurface).filter(Boolean);
  for (const w of Array.isArray(p.walls) ? p.walls : []) {
    if (!w || typeof w !== 'object') continue;
    if ('incl' in w) { if (isNum(w.incl) && Math.abs(w.incl) >= 0.05 && Math.abs(w.incl) <= 75) w.incl = Math.round(w.incl * 10) / 10; else delete w.incl; }
    if ('masque' in w && w.masque !== true) delete w.masque;
    if ('oss' in w) { const o = w.oss; if (o && typeof o === 'object' && isNum(o.entraxe) && o.entraxe > 10 && o.entraxe <= 200) w.oss = { entraxe: o.entraxe }; else delete w.oss; }
  }
  if (p.install && typeof p.install === 'object' && 'nord' in p.install) { if (isNum(p.install.nord)) p.install.nord = ((p.install.nord % 360) + 360) % 360; else delete p.install.nord; }
  for (const e of Array.isArray(p.elec) ? p.elec : []) { nettoyerCE(e); nettoyerKnxElec(e); }
  nettoyerKnxPlan(p);
  return p;
}

export { nettoyerV20 };
export { FORMES, MODULES_PV, ORIGINE_PV, TERR_MATS, TOIT_MATS, aire, aireSurface, baseDe, calepinage, couper, decalageHaut, dedans, dessusEn, distBords,
  epDe, estToit, formeDe, hauteurFaitage, hauteurToit, inclDe, inclPourA, nettoyerSurface, orientation, pansToit, penteDe, plansToit, rampant, surfaceSous };

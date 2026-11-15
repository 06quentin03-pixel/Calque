/* Calque — module « integration » : électroménager intégré dans un meuble (demande du 15 novembre 2026).
   Un four sous une plaque de cuisson, un lave-vaisselle sous un plan de travail, un micro-ondes dans une colonne…
   JavaScript pur, sans accès à l'écran : testable avec Node.

   Modèle (format v18) : l'appareil intégré garde sa place dans P.items et reçoit
     - `dans` : id du meuble qui le reçoit (l'« hôte ») ;
     - `ox`   : décalage de son centre le long de la largeur de l'hôte (cm, repère de l'hôte, 0 = centré).
   Sa position, sa rotation et son côté (miroir) suivent toujours l'hôte : `synchroniserIntegres(plan)` les recalcule
   (appelé à chaque étape enregistrée et pendant le déplacement d'un meuble). Le dos de l'appareil est aligné sur le dos
   de l'hôte (côté -y, contre le mur). Une plaque ou un évier peut lui-même être intégré dans un plan de travail ou un îlot,
   et recevoir un four : la chaîne est suivie (profondeur bornée, pas de boucle).
   Les hauteurs de pose proposées (four en colonne à 90 cm…) sont des valeurs d'usage de Calque, modifiables dans
   « Hauteur (vue 3D) » : ni données de fabricant ni exigences réglementaires. */

const DEG = Math.PI / 180;
/* appareils qui peuvent être intégrés, avec leur abréviation sur le plan */
const APPAREILS = {
  four: { n: 'Four', ab: 'F' }, lave_vaisselle: { n: 'Lave-vaisselle', ab: 'LV' }, lave_linge: { n: 'Lave-linge', ab: 'LL' },
  seche_linge: { n: 'Sèche-linge', ab: 'SL' }, frigo: { n: 'Réfrigérateur', ab: 'Fr' }, congelateur: { n: 'Congélateur', ab: 'Cg' },
  micro_ondes: { n: 'Micro-ondes', ab: 'MO' }, hotte: { n: 'Hotte', ab: 'H' },
  plaque: { n: 'Plaque de cuisson', ab: 'P' }, plaque90: { n: 'Plaque de cuisson', ab: 'P' },
  evier1: { n: 'Évier', ab: 'É' }, evier2: { n: 'Évier', ab: 'É' }, evier_eg: { n: 'Évier', ab: 'É' },
};
/* appareils posés « par le dessus » : visibles sur le plan (plaque, évier), les autres sont cachés sous le meuble */
const DESSUS = new Set(['plaque', 'plaque90', 'evier1', 'evier2', 'evier_eg']);
const SOUS_PLAN = ['four', 'lave_vaisselle', 'lave_linge', 'seche_linge', 'frigo', 'congelateur', 'micro_ondes'];
/* meubles qui reçoivent un appareil : liste des appareils acceptés, hauteur libre (cm) et hauteur de pose par défaut */
const HOTES = {
  plan_travail: { accepte: [...SOUS_PLAN, ...DESSUS], libre: 86, plan: true },
  ilot: { accepte: [...SOUS_PLAN, ...DESSUS], libre: 86, plan: true },
  meuble_bas: { accepte: SOUS_PLAN, libre: 86 },
  plaque: { accepte: ['four', 'lave_vaisselle', 'micro_ondes'], libre: 86 },
  plaque90: { accepte: ['four', 'lave_vaisselle', 'micro_ondes'], libre: 86 },
  evier1: { accepte: ['lave_vaisselle'], libre: 86 },
  evier2: { accepte: ['lave_vaisselle'], libre: 86 },
  evier_eg: { accepte: ['lave_vaisselle'], libre: 86 },
  colonne: { accepte: ['four', 'micro_ondes', 'frigo', 'congelateur', 'lave_vaisselle'], libre: 213, colonne: true },
  meuble_haut: { accepte: ['micro_ondes', 'hotte'], libre: 70, haut: true },
};
/* hauteur de pose par défaut d'un appareil dans un hôte (cm au-dessus du sol, valeur d'usage de Calque) */
const POSE_COLONNE = { four: 90, micro_ondes: 142, frigo: 10, congelateur: 10, lave_vaisselle: 60 };
function poseParDefaut(hote, type) {
  const H = HOTES[hote.type]; if (!H) return 0;
  if (H.colonne) return POSE_COLONNE[type] ?? 10;
  if (H.haut) return hote.zb != null ? hote.zb : 145; // posé à la hauteur du meuble haut (145 cm par défaut, vue3d.js)
  if (type === 'micro_ondes') return 45; // sous le plan, au-dessus d'un tiroir
  return 0;
}

const estHote = (it) => !!(it && HOTES[it.type]);
const estIntegrable = (it) => !!(it && APPAREILS[it.type]);
const accepte = (hote, type) => !!(hote && HOTES[hote.type] && HOTES[hote.type].accepte.includes(type));
const cache = (it) => !!(it && it.dans && !DESSUS.has(it.type)); // dessiné en pointillés sous son meuble
const nomAppareil = (t) => (APPAREILS[t] || {}).n || t;
const abrev = (t) => (APPAREILS[t] || {}).ab || '';

function versMonde(it, lx, ly) {
  const a = (it.rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a);
  return { x: it.x + lx * c - ly * s, y: it.y + lx * s + ly * c };
}
function versLocal(it, p) {
  const a = (it.rot || 0) * DEG, c = Math.cos(a), s = Math.sin(a), dx = p.x - it.x, dy = p.y - it.y;
  return { x: dx * c + dy * s, y: -dx * s + dy * c };
}
const arr = (v) => Math.round(v * 100) / 100;
/* décalage autorisé le long de l'hôte (l'appareil reste dans la largeur du meuble quand il y tient) */
function bornerOx(hote, it, ox) { const m = Math.max(0, (hote.w - it.w) / 2); return Math.max(-m, Math.min(m, ox)); }

/* place l'appareil `it` dans son hôte (position, rotation, miroir) d'après it.ox */
function placer(it, hote) {
  it.ox = arr(bornerOx(hote, it, Number.isFinite(it.ox) ? it.ox : 0));
  /* profondeur : façade alignée sur celle du meuble (four ou micro-ondes en colonne) ; sous un plan de travail, dos aligné
     sur le dos du plan (le plan déborde devant, comme au-dessus des meubles bas) ; appareil plus profond que le meuble :
     dos contre le mur, il dépasse devant */
  const ly = HOTES[hote.type].plan || it.d > hote.d ? -hote.d / 2 + it.d / 2 : hote.d / 2 - it.d / 2;
  const lx = hote.flip ? -it.ox : it.ox;
  const p = versMonde(hote, lx, ly);
  it.x = arr(p.x); it.y = arr(p.y); it.rot = hote.rot || 0; it.lv = hote.lv;
  if (hote.flip) it.flip = true; else delete it.flip;
}
/* hôte valide d'un appareil, ou null */
function hoteDe(plan, it, by) {
  if (!it || !it.dans) return null;
  const h = (by || new Map((plan.items || []).map((x) => [x.id, x]))).get(it.dans);
  return h && h !== it && accepte(h, it.type) ? h : null;
}
/* recalcule la position de tous les appareils intégrés ; un appareil dont l'hôte a disparu (meuble supprimé) est
   libéré sur place. Renvoie le nombre d'appareils libérés. */
function synchroniserIntegres(plan) {
  const items = (plan.items || []).filter((x) => x && typeof x === 'object');
  if (!items.some((x) => x.dans)) return 0;
  const by = new Map(items.map((x) => [x.id, x]));
  let liberes = 0;
  const fait = new Set();
  const suivre = (it, prof) => {
    if (fait.has(it.id)) return;
    const h = hoteDe(plan, it, by);
    if (!h || prof > 4) { delete it.dans; delete it.ox; liberes++; fait.add(it.id); return; }
    if (h.dans) suivre(h, prof + 1); // l'hôte est lui-même intégré (four sous une plaque intégrée au plan de travail)
    placer(it, h); fait.add(it.id);
  };
  for (const it of items) if (it.dans) suivre(it, 0);
  return liberes;
}
/* appareils intégrés dans un meuble */
const integresDans = (plan, hote) => (plan.items || []).filter((x) => x && x.dans === hote.id);

/* intègre l'appareil `it` dans `hote` : décalage d'après sa position actuelle, hauteur de pose par défaut */
function integrer(plan, it, hote) {
  if (!accepte(hote, it.type) || it === hote) return false;
  /* pas de boucle : l'hôte ne doit pas être (indirectement) dans l'appareil */
  const by = new Map((plan.items || []).map((x) => [x.id, x]));
  for (let h = hote, k = 0; h && k < 6; h = by.get(h.dans), k++) if (h.id === it.id) return false;
  const l = versLocal(hote, it);
  it.dans = hote.id; it.ox = hote.flip ? -l.x : l.x;
  const H = HOTES[hote.type];
  const z = poseParDefaut(hote, it.type);
  if (z) it.zb = z; else delete it.zb;
  /* trop haut pour la place libre (réfrigérateur sous un plan de travail) : hauteur réduite, modifiable ensuite */
  const libre = H.haut ? H.libre : H.libre - z;
  if (!DESSUS.has(it.type) && hauteurDe(it) > libre) it.ht = libre - 1; // 1 cm de jeu
  placer(it, hote);
  return true;
}
/* hauteur par défaut d'un appareil (cm), d'après la maquette 3D (repris ici pour rester sans écran) */
const H3 = { four: 86, lave_vaisselle: 85, lave_linge: 85, seche_linge: 85, frigo: 185, congelateur: 85, micro_ondes: 30, hotte: 14 };
const hauteurDe = (it) => (Number.isFinite(it.ht) ? it.ht : H3[it.type] || 85);
/* libère l'appareil : il reste à sa place sur le plan */
function liberer(it) { delete it.dans; delete it.ox; }

/* meubles du niveau qui peuvent recevoir l'appareil, du plus proche au plus éloigné (au plus `max` cm du centre) */
function hotesPossibles(plan, it, max = 150) {
  const out = [];
  for (const h of plan.items || []) {
    if (!h || h === it || h.lv !== it.lv || !accepte(h, it.type) || h.dans === it.id) continue;
    const l = versLocal(h, it);
    const dx = Math.max(0, Math.abs(l.x) - h.w / 2), dy = Math.max(0, Math.abs(l.y) - h.d / 2), dist = Math.hypot(dx, dy);
    if (dist <= max) out.push({ hote: h, dist });
  }
  return out.sort((a, b) => a.dist - b.dist).map((x) => x.hote);
}
/* nouvel appareil (objet du plan) à créer dans un hôte ; `def` = modèle du mobilier (FURN), `id` fourni par l'appelant */
function nouvelIntegre(plan, hote, def, id) {
  const it = { id, lv: hote.lv, k: def.k, type: def.t, name: def.n, x: hote.x, y: hote.y, w: def.w, d: def.d, rot: hote.rot || 0 };
  /* place libre le long de l'hôte : à côté des appareils déjà intégrés (de gauche à droite) */
  const occ = integresDans(plan, hote).filter((x) => !DESSUS.has(x.type) === !DESSUS.has(def.t)).map((x) => [x.ox - x.w / 2, x.ox + x.w / 2]).sort((a, b) => a[0] - b[0]);
  let x0 = -hote.w / 2, ox = null;
  for (const [a, b] of occ) { if (a - x0 >= def.w - 0.01) { ox = x0 + def.w / 2; break; } x0 = Math.max(x0, b); }
  if (!occ.length) ox = 0; // meuble vide : appareil centré
  else if (ox == null) ox = hote.w / 2 - x0 >= def.w - 0.01 ? x0 + def.w / 2 : 0;
  it.ox = ox;
  const l = { x: hote.flip ? -ox : ox };
  const p = versMonde(hote, l.x, 0); it.x = p.x; it.y = p.y;
  plan.items.push(it);
  integrer(plan, it, hote);
  it.ox = arr(bornerOx(hote, it, ox)); placer(it, hote);
  return it;
}
/* pendant le glissement d'un appareil intégré : il coulisse le long de son meuble ; renvoie false s'il en sort
   (centre à plus de `marge` cm du meuble) : l'appelant le libère alors */
function coulisser(it, hote, p, marge = 30) {
  const l = versLocal(hote, p);
  if (Math.abs(l.x) > hote.w / 2 + marge || Math.abs(l.y) > hote.d / 2 + marge) return false;
  it.ox = hote.flip ? -l.x : l.x; placer(it, hote);
  return true;
}

/* 3D : parties du meuble occupées par ses appareils cachés, dans le repère de l'hôte [{ x0, x1, z0, z1 }] (cm, z compté
   depuis le bas du meuble). hz(it) → { h, z } : hauteur et pose d'un objet dans la maquette (itemHeight3 de vue3d.js). */
function creuxDe(plan, hote, hz) {
  const zh = hz(hote).z;
  return integresDans(plan, hote).filter((x) => !DESSUS.has(x.type)).map((x) => {
    const q = hz(x), z0 = q.z - zh;
    return { x0: x.ox - x.w / 2, x1: x.ox + x.w / 2, z0, z1: z0 + q.h };
  });
}
/* découpe un pavé (x0..x1, z0..z1) en morceaux qui évitent les creux (rectangles dans le plan x-z) */
function morceaux(x0, x1, z0, z1, creux) {
  const cs = creux.map((c) => ({ x0: Math.max(x0, c.x0), x1: Math.min(x1, c.x1), z0: Math.max(z0, c.z0), z1: Math.min(z1, c.z1) })).filter((c) => c.x1 - c.x0 > 0.01 && c.z1 - c.z0 > 0.01);
  if (!cs.length) return [[x0, x1, z0, z1]];
  const xs = [...new Set([x0, x1, ...cs.flatMap((c) => [c.x0, c.x1])])].sort((a, b) => a - b);
  const zs = [...new Set([z0, z1, ...cs.flatMap((c) => [c.z0, c.z1])])].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < xs.length - 1; i++) {
    let debut = null;
    for (let j = 0; j < zs.length - 1; j++) {
      const mx = (xs[i] + xs[i + 1]) / 2, mz = (zs[j] + zs[j + 1]) / 2;
      const vide = cs.some((c) => mx > c.x0 && mx < c.x1 && mz > c.z0 && mz < c.z1);
      if (!vide && debut == null) debut = zs[j];
      if (vide && debut != null) { out.push([xs[i], xs[i + 1], debut, zs[j]]); debut = null; }
    }
    if (debut != null) out.push([xs[i], xs[i + 1], debut, zs[zs.length - 1]]);
  }
  return out;
}

/* nettoyage (migration v17 → v18) : `dans` doit être un texte, `ox` un nombre ; un lien vers un meuble absent est gardé
   pour le contrôle du plan (Menu › Vérifier le plan), qui le signale avant de le réparer */
function nettoyerV18(p) {
  for (const it of Array.isArray(p.items) ? p.items : []) {
    if (!it || typeof it !== 'object') continue;
    if ('dans' in it && !(typeof it.dans === 'string' && it.dans)) { delete it.dans; delete it.ox; }
    if ('ox' in it && !Number.isFinite(it.ox)) { if (it.dans) it.ox = 0; else delete it.ox; }
    if ('ox' in it && !it.dans) delete it.ox;
  }
  return p;
}

export { APPAREILS, DESSUS, HOTES, abrev, accepte, cache, coulisser, creuxDe, estHote, estIntegrable, hoteDe, hotesPossibles,
  integrer, integresDans, liberer, morceaux, nettoyerV18, nomAppareil, nouvelIntegre, placer, poseParDefaut, synchroniserIntegres };

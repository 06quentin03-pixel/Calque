/* Calque — module « exemple » : plan d'exemple (Menu › Ouvrir le plan d'exemple, et premier démarrage).
   RÈGLE DU PROJET : chaque nouvelle fonctionnalité est ajoutée à ce plan, pour que l'utilisateur puisse l'essayer
   tout de suite sur son iPad (voir CLAUDE.md).

   Contenu : une maison (rez-de-chaussée et combles) et un atelier industriel de 40 × 20 m avec sa bande de locaux
   (local technique, vestiaires, sanitaires, bureau) et une mezzanine de bureaux à l'étage.
   Toutes les valeurs saisies ici sont des VALEURS D'EXEMPLE, marquées « saisie » avec leur origine :
   aucune n'est une donnée de fabricant ni une valeur réglementaire. Module JavaScript natif (aucune compilation). */
import { P, blankPlan, inPoly, projSeg, setP, touch, uid, vdot, vsub } from './noyau.js';
import { geo, syncRooms } from './geometrie.js';
import { addWall, clampOpening } from './mutations.js';
import { ELEC_BY, FURN_BY } from './symboles.js';
import { generateFromPlan } from './electricite.js';
import { makeElecFromDef, makeItemFromDef, newOpening } from './interaction.js';
import { copyWalls } from './interface.js';
import { articlesFor } from './technique.js';
import { REGLES_VERSION } from './regles.js';
import { changerStatut, chantierDe, noter, nouvelleReserve } from './chantier.js';
import { dupliquer, initialiser } from './variantes.js';

const NOM_EXEMPLE = 'Exemple : maison et atelier';
const EX = 'Valeur d’exemple de Calque (fictive) : à remplacer par la fiche du fabricant';
const EXS = 'Valeur d’exemple de Calque : à adapter à votre projet';
const d = (v, src) => ({ v, st: 'saisie', src: src || EXS });

/* ---------------- maison (plan d'exemple d'origine) ---------------- */
function maison() {
  P.levels = [{ id: 'L0', name: 'Rez-de-chaussée', elev: 0, h: 250, slab: 20 }, { id: 'L1', name: 'Étage', elev: 270, h: 240, slab: 20 }];
  touch();
  const M = { th: 20, kind: 'mur' }, CL = { th: 7, kind: 'cloison' };
  const W = (x1, y1, x2, y2, pr) => addWall('L0', { x: x1, y: y1 }, { x: x2, y: y2 }, pr);
  W(0, 0, 1000, 0, M); W(1000, 0, 1000, 800, M); W(1000, 800, 0, 800, M); W(0, 800, 0, 0, M);
  W(560, 0, 560, 800, CL); W(0, 450, 560, 450, CL); W(330, 450, 330, 800, CL);
  W(560, 380, 1000, 380, CL); W(700, 380, 700, 800, CL); W(700, 620, 1000, 620, CL); W(830, 620, 830, 800, CL);
  touch();
  const op = (x, y, kind, props, toward) => {
    const g = geo('L0'); let best = null;
    for (const wg of g.walls.values()) { const pr = projSeg({ x, y }, wg.A, wg.B); if (pr.t > 0 && pr.t < 1 && pr.d < 12 && (!best || pr.d < best.d)) best = { wg, d: pr.d, t: pr.t * wg.L }; }
    if (!best) return;
    const side = toward ? Math.sign(vdot(vsub(toward, best.wg.A), best.wg.n)) || 1 : 1;
    const o = newOpening(kind, best.wg, best.t, side);
    Object.assign(o, props);
    if (toward && kind === 'door') o.side = side;
    clampOpening(o);
  };
  op(445, 800, 'door', { type: 'entree', w: 90, h: 215 }, { x: 445, y: 700 });
  op(445, 450, 'door', { w: 83 }, { x: 445, y: 550 });
  op(230, 450, 'door', { type: 'coulissante', w: 93, leaves: 1, hinge: 1 }, { x: 230, y: 520 });
  op(560, 620, 'door', { w: 83 }, { x: 630, y: 620 });
  op(630, 380, 'door', { w: 83, hinge: 1 }, { x: 630, y: 300 });
  op(700, 500, 'door', { w: 83 }, { x: 800, y: 500 });
  op(700, 710, 'door', { w: 73 }, { x: 760, y: 710 });
  op(915, 620, 'door', { w: 73, hinge: 1 }, { x: 915, y: 700 });
  op(280, 0, 'window', { type: 'baie', w: 240, h: 215, sill: 0, leaves: 2 });
  op(0, 625, 'window', { w: 100, h: 115, sill: 105, leaves: 2 });
  op(165, 800, 'window', { w: 80, h: 115, sill: 105, leaves: 1 });
  op(780, 0, 'window', { w: 140, leaves: 2 });
  op(1000, 190, 'window', { w: 80, leaves: 1 });
  op(1000, 500, 'window', { type: 'oscillo', w: 60, h: 75, sill: 145, leaves: 1 });
  const it = (k, x, y, rot, extra) => { const d = FURN_BY.get(k); const o = makeItemFromDef(d, 'L0'); Object.assign(o, { x, y, rot }, extra || {}); P.items.push(o); };
  it('tv', 32.5, 220, 270); it('canape3', 290, 210, 90); it('tbasse', 150, 210, 90); it('tab4', 395, 380, 0); it('plante', 60, 60, 0);
  it('escD', 511.5, 220, 0, { n: 16 });
  it('frigo', 42.5, 483.5, 270); it('col', 40, 543.5, 270); it('ev1', 40, 613.5, 270); it('lv', 40, 683.5, 270);
  it('mb60', 40, 760, 180); it('pl60', 100, 760, 180); it('mb60', 160, 760, 180); it('mb60', 220, 760, 180); it('hotte', 100, 765, 180);
  it('placard', 364.5, 520, 270, { w: 120 });
  it('lit160', 663.5, 190, 270); it('chevet', 583.5, 87.5, 270); it('chevet', 583.5, 292.5, 270); it('armoire', 960, 290, 90);
  it('bain', 905, 579, 180); it('vasque2', 790, 408.5, 0); it('dou90', 945, 428.5, 0); it('sserv', 708.5, 580, 270);
  it('wc', 765, 756, 180); it('lm', 814, 680, 90);
  it('ll', 870, 760, 180); it('sl', 930, 760, 180); it('ce', 962.5, 680, 90);
  const el = (t, x, y, rot, extra) => { const d = ELEC_BY.get(t); const o = makeElecFromDef(d, 'L0'); Object.assign(o, { x, y, rot }, extra || {}); P.elec.push(o); return o; };
  el('pl', 200, 290, 0, { circuit: 'C1 éclairage séjour' }); el('int_vv', 500, 446.5, 180, { circuit: 'C1' }); el('int_vv', 300, 446.5, 180, { circuit: 'C1' });
  el('pc2', 10, 130, 270, { circuit: 'C5 prises séjour' }); el('tv', 10, 262, 270); el('pc2', 10, 320, 270); el('rj45', 10, 378, 270); el('pc', 60, 10, 0, { circuit: 'C5' }); el('pc', 440, 10, 0, { circuit: 'C5' }); el('pc', 150, 446.5, 180, { circuit: 'C5' });
  el('det_ir', 10, 425, 270, { h: 220 });
  el('pl', 170, 620, 0, { circuit: 'C2 éclairage cuisine' }); el('int_s', 300, 453.5, 0, { circuit: 'C2' }); el('vmc', 280, 500, 0);
  el('pc32', 90, 790, 180, { circuit: 'C10 plaque' }); el('pc_pt', 160, 790, 180, { circuit: 'C6 prises cuisine' }); el('pc_pt', 230, 790, 180, { circuit: 'C6' });
  el('pc20', 10, 683.5, 270, { circuit: 'C11 lave-vaisselle' }); el('pc', 10, 483.5, 270, { circuit: 'C6' });
  el('pl', 445, 640, 0, { circuit: 'C3 éclairage entrée' }); el('int_s', 505, 790, 180, { circuit: 'C3' }); el('tableau', 333.5, 700, 270); el('com', 333.5, 640, 270);
  el('clavier', 556.5, 760, 90); el('hublot', 400, 810, 0, { circuit: 'C3' });
  el('pl', 630, 560, 0, { circuit: 'C3' }); el('daaf', 630, 450, 0); el('int_vv', 563.5, 680, 270, { circuit: 'C3' });
  el('pl', 800, 200, 0, { circuit: 'C4 éclairage nuit' }); el('int_s', 690, 376.5, 180, { circuit: 'C4' });
  el('pc', 563.5, 55, 270, { circuit: 'C7 prises chambre' }); el('pc', 563.5, 325, 270, { circuit: 'C7' }); el('pc', 990, 120, 90, { circuit: 'C7' }); el('rad_elec', 780, 10, 0, { circuit: 'C12 chauffage' });
  el('applique', 790, 383.5, 0, { circuit: 'C4' }); el('pc_ip', 745, 383.5, 0, { circuit: 'C8 salle de bain' }); el('pl', 915, 505, 0, { circuit: 'C4' }); el('vmc', 750, 425, 0);
  el('pl', 765, 702, 0, { circuit: 'C4' }); el('vmc', 805, 645, 0);
  el('pc20', 870, 790, 180, { circuit: 'C13 lave-linge' }); el('pc20', 930, 790, 180, { circuit: 'C14 sèche-linge' }); el('sortie', 990, 630, 90, { circuit: 'C9 chauffe-eau' }); el('pl', 935, 735, 0, { circuit: 'C4' });
  el('pc_pt', 40, 790, 180); el('pc_pt', 10, 722, 270); el('pc', 300, 790, 180);
  el('rj45', 990, 160, 90); el('pc', 556.5, 500, 90); el('pc', 696.5, 420, 90); el('centrale', 333.5, 760, 270);
  const S_ = {}; for (const [k, t, x, y, r] of [['sdb', 'int_d', 703.5, 437, 270], ['wc', 'int_s', 696.5, 660, 90], ['bua', 'int_s', 865, 623.5, 0]]) S_[k] = el(t, x, y, r);
  const vmcG = el('vmc_groupe', 635, 650, 0), vmcR = el('sortie_toit', 635, 600, 0);
  el('entree_air', 230, 10, 0); el('entree_air', 330, 10, 0); el('entree_air', 780, 10, 0);
  const el1 = (t, x, y, rot) => { const o = el(t, x, y, rot); o.lv = 'L1'; return o; };
  const plE = el1('pl', 500, 330, 0), plE2 = el1('pl', 780, 560, 0), swE = el1('int_vv', 10, 470, 270);
  el1('pc', 10, 160, 270); el1('pc', 990, 300, 90); el1('pc', 600, 790, 180); el1('daaf', 640, 430, 0);
  for (const e of P.elec) delete e.circuit;
  touch();
  P.links.push({ id: uid('k'), lv: 'L1', a: swE.id, b: plE.id }, { id: uid('k'), lv: 'L1', a: swE.id, b: plE2.id });
  const at = (t, x, y) => P.elec.find((e) => e.type === t && Math.abs(e.x - x) < 0.6 && Math.abs(e.y - y) < 0.6);
  const lk = (a, b) => { if (a && b) P.links.push({ id: uid('k'), lv: 'L0', a: a.id, b: b.id }); };
  lk(at('int_vv', 500, 446.5), at('pl', 200, 290)); lk(at('int_vv', 300, 446.5), at('pl', 200, 290));
  lk(at('int_s', 300, 453.5), at('pl', 170, 620));
  lk(at('int_s', 505, 790), at('pl', 445, 640)); lk(at('int_s', 505, 790), at('hublot', 400, 810));
  lk(at('int_vv', 563.5, 680), at('pl', 630, 560));
  lk(at('int_s', 690, 376.5), at('pl', 800, 200));
  lk(S_.sdb, at('applique', 790, 383.5)); lk(S_.sdb, at('pl', 915, 505));
  lk(S_.wc, at('pl', 765, 702)); lk(S_.bua, at('pl', 935, 735));
  const vk = (a, b2, mid, dia) => { if (a && b2) P.ducts.push({ id: uid('k'), lv: 'L0', sys: 'vmc', mat: 'souple', a: a.id, b: b2.id, dia, pts: [{ x: a.x, y: a.y }, ...mid, { x: b2.x, y: b2.y }] }); };
  vk(vmcG, at('vmc', 280, 500), [{ x: 600, y: 650 }, { x: 600, y: 500 }], 125);
  vk(vmcG, at('vmc', 750, 425), [{ x: 665, y: 650 }, { x: 665, y: 425 }], 80);
  vk(vmcG, at('vmc', 805, 645), [{ x: 635, y: 700 }, { x: 805, y: 700 }], 80);
  vk(vmcG, vmcR, [], 160);
  copyWalls('L0', 'L1');
  syncRooms();
  const name = (x, y, n, lv) => { const g = geo(lv || 'L0'); const r = g.rooms.find((q) => inPoly({ x, y }, q.loop)); if (r && r.label) { r.label.name = n; r.label.x = x; r.label.y = y; } };
  name(150, 395, 'Séjour'); name(175, 560, 'Cuisine'); name(445, 600, 'Entrée'); name(630, 520, 'Dégagement');
  name(860, 150, 'Chambre'); name(790, 505, 'Salle de bain'); name(765, 650, 'WC'); name(880, 690, 'Buanderie');
  name(760, 250, 'Combles aménageables', 'L1');
  const lab = P.rooms.find((r) => r.name === 'Séjour'); if (lab) lab.tint = 1;
  const lab2 = P.rooms.find((r) => r.name === 'Salle de bain'); if (lab2) lab2.tint = 3;
  touch();
}


/* ---------------- atelier industriel (phase 6 : vitrine de toutes les fonctions) ---------------- */
const X0 = 1200, X1 = 2000, X2 = 5200, Y1 = 2000; // bande de locaux x 1200-2000 ; atelier x 2000-5200 ; profondeur 20 m

function porte(lv, x, y, kind, props, toward) {
  const g = geo(lv); let best = null;
  for (const wg of g.walls.values()) { const pr = projSeg({ x, y }, wg.A, wg.B); if (pr.t > 0 && pr.t < 1 && pr.d < 16 && (!best || pr.d < best.d)) best = { wg, d: pr.d, t: pr.t * wg.L }; }
  if (!best) return null;
  const side = toward ? Math.sign(vdot(vsub(toward, best.wg.A), best.wg.n)) || 1 : 1;
  const o = newOpening(kind, best.wg, best.t, side);
  Object.assign(o, props);
  if (toward && kind === 'door') o.side = side;
  clampOpening(o);
  return o;
}
function sym(lv, t, x, y, rot, extra) { const o = makeElecFromDef(ELEC_BY.get(t), lv); Object.assign(o, { x, y, rot }, extra || {}); delete o.circuit; P.elec.push(o); return o; }
function meuble(lv, k, x, y, rot, extra) { const o = makeItemFromDef(FURN_BY.get(k), lv); Object.assign(o, { x, y, rot }, extra || {}); P.items.push(o); return o; }
/* composant personnalisé (phase 2) : copie dans le plan + objets posés qui le désignent */
function composant(c) { P.comps.push(c); return c; }
function poserComp(lv, c, x, y, rot) { return meuble(lv, c.base, x, y, rot, { comp: c.id, name: c.n, w: c.w, d: c.d, label: c.n }); }
/* gaine électrique (phase 4) ; une extrémité posée sur une autre gaine s'y raccorde */
function gaine(lv, pts, o) { const g = Object.assign({ id: uid('k'), lv, sys: 'elec', mat: 'icta', dia: 20, kind: 'icta', pose: 'plafond', pts: pts.map((p) => ({ x: p.x, y: p.y })) }, o || {}); P.ducts.push(g); return g; }
/* descente vers un symbole depuis un point d'une gaine. Deux descentes ne partent jamais du même point :
   une extrémité libre posée sur l'extrémité d'une autre descente s'y raccorderait au lieu de la gaine principale.
   `axe` : sens de la gaine principale ('x' ou 'y'), pour décaler le départ le long de celle-ci. */
const DEPARTS = new Set();
function vers(lv, depuis, e, o, axe) {
  const p = { x: depuis.x, y: depuis.y };
  const ax = axe || (Math.abs(e.x - p.x) > Math.abs(e.y - p.y) ? 'y' : 'x');
  while (DEPARTS.has(`${lv}:${p.x}:${p.y}`)) p[ax] += 8;
  DEPARTS.add(`${lv}:${p.x}:${p.y}`);
  return gaine(lv, [p, { x: e.x, y: e.y }], Object.assign({ b: e.id }, o || {}));
}

function atelier(tableau) {
  const M = { th: 30, kind: 'mur' }, CL = { th: 15, kind: 'cloison' };
  const W = (lv, x1, y1, x2, y2, pr) => addWall(lv, { x: x1, y: y1 }, { x: x2, y: y2 }, pr);
  /* murs du rez-de-chaussée */
  W('L0', X0, 0, X2, 0, M); W('L0', X2, 0, X2, Y1, M); W('L0', X2, Y1, X0, Y1, M); W('L0', X0, Y1, X0, 0, M);
  W('L0', X1, 0, X1, Y1, { th: 20, kind: 'mur' });
  W('L0', X0, 500, X1, 500, CL); W('L0', X0, 1000, X1, 1000, CL); W('L0', X0, 1400, X1, 1400, CL);
  /* mezzanine de bureaux au-dessus de la bande de locaux */
  W('L1', X0, 0, X1, 0, M); W('L1', X1, 0, X1, Y1, { th: 20, kind: 'mur' }); W('L1', X1, Y1, X0, Y1, M); W('L1', X0, Y1, X0, 0, M);
  W('L1', X0, 1300, X1, 1300, CL);
  touch();
  porte('L0', X1, 250, 'door', { w: 93 }, { x: 1600, y: 250 });
  porte('L0', X1, 750, 'door', { w: 93 }, { x: 1600, y: 750 });
  porte('L0', 1600, 1000, 'door', { w: 83 }, { x: 1600, y: 1200 });
  porte('L0', X1, 1700, 'door', { w: 93 }, { x: 1600, y: 1700 });
  porte('L0', 1650, Y1, 'door', { type: 'entree', w: 100, h: 215 }, { x: 1650, y: 1800 });
  porte('L0', 3600, Y1, 'gap', { w: 500 });                          // porte sectionnelle
  porte('L0', 4900, Y1, 'door', { w: 100 }, { x: 4900, y: 1800 });  // issue de secours
  for (const x of [2500, 3100, 3700, 4300, 4900]) porte('L0', x, 0, 'window', { w: 200, h: 120, sill: 200, leaves: 2 });
  porte('L0', X0, 1700, 'window', { w: 120, h: 115, sill: 105, leaves: 2 });
  porte('L0', X0, 750, 'window', { type: 'oscillo', w: 60, h: 60, sill: 170, leaves: 1 });
  porte('L1', 1600, 1300, 'door', { w: 83 }, { x: 1600, y: 1500 });
  porte('L1', X0, 650, 'window', { w: 160, h: 120, sill: 100, leaves: 2 });
  porte('L1', X0, 1650, 'window', { w: 120, h: 120, sill: 100, leaves: 2 });

  /* composants personnalisés (machines et rangements fictifs) */
  const tour = composant({ id: 'ex-tour', kind: 'furn', n: 'Tour à commande numérique', base: 'bloc', rang: 'batiment', w: 320, d: 180, desc: 'Machine-outil 400 V (exemple)', at: 0,
    tech: { desig: 'Machine-outil triphasée 400 V (exemple fictif)', ref: '', fab: '', fiab: 'saisie', source: '' } });
  const fraise = composant({ id: 'ex-fraise', kind: 'furn', n: 'Fraiseuse', base: 'bloc', rang: 'batiment', w: 260, d: 200, desc: 'Machine-outil 400 V (exemple)', at: 0 });
  const rack = composant({ id: 'ex-rack', kind: 'furn', n: 'Rayonnage de stockage', base: 'bloc', rang: 'batiment', w: 600, d: 110, desc: 'Rayonnage lourd (exemple)', at: 0 });
  const etabli = composant({ id: 'ex-etabli', kind: 'furn', n: 'Établi', base: 'bloc', rang: 'batiment', w: 200, d: 80, desc: 'Établi d’atelier (exemple)', at: 0 });
  poserComp('L0', tour, 2600, 300, 0); poserComp('L0', tour, 3400, 300, 0); poserComp('L0', fraise, 4200, 310, 0); poserComp('L0', fraise, 5000, 650, 90);
  poserComp('L0', rack, 4800, 1760, 0); poserComp('L0', rack, 4800, 1880, 0);
  poserComp('L0', etabli, 2500, 1900, 180); poserComp('L0', etabli, 2800, 1900, 180);
  for (const x of [2800, 3600, 4400]) for (const y of [700, 1300]) meuble('L0', 'poteau', x, y, 0);
  meuble('L0', 'voiture', 3600, 1350, 0, { name: 'Véhicule en atelier' });
  meuble('L0', 'escD', 2080, 1450, 0, { n: 16 });
  meuble('L0', 'placard', 1600, 520 + 30, 0, { w: 300 }); meuble('L0', 'chaise', 1600, 900, 0);
  meuble('L0', 'wc', 1260, 1180, 270); meuble('L0', 'lavabo', 1480, 1385, 180); meuble('L0', 'dou90', 1940, 1060, 0);
  meuble('L0', 'bureau', 1450, 1800, 0); meuble('L0', 'chbur', 1450, 1730, 180); meuble('L0', 'biblio', 1960, 1600, 90);
  meuble('L1', 'bureau', 1300, 250, 270); meuble('L1', 'bureau', 1300, 450, 270); meuble('L1', 'bureau', 1650, 300, 0); meuble('L1', 'bureau', 1650, 600, 0);
  for (const [x, y] of [[1300, 250], [1300, 450]]) meuble('L1', 'chbur', x + 60, y, 90);
  meuble('L1', 'tab6', 1600, 1650, 90); meuble('L1', 'plante', 1950, 50, 0);

  /* zone interdite aux cheminements (phase 4) : stockage en hauteur */
  P.zones.push({ id: uid('z'), lv: 'L0', name: 'Rayonnages (pas de cheminement)', pts: [{ x: 4450, y: 1680 }, { x: 5150, y: 1680 }, { x: 5150, y: 1950 }, { x: 4450, y: 1950 }] });

  /* ---- électricité ---- */
  const E = (t, x, y, rot, extra) => sym('L0', t, x, y, rot, extra);
  // local technique : tableau divisionnaire de l'atelier, alimenté depuis le tableau de la maison
  const td = E('tab_div', X0 + 15, 250, 270, { h: 130 });
  const feed = gaine('L0', [tableau, { x: tableau.x, y: 880 }, { x: 1100, y: 880 }, { x: 1100, y: 250 }, td], { a: tableau.id, b: td.id, kind: 'icta', dia: 63, pose: 'sol' });
  // dorsale en chemin de câbles au plafond, puis trois lignes au-dessus de l'atelier
  gaine('L0', [td, { x: 2200, y: 250 }, { x: 2200, y: 1750 }], { a: td.id, kind: 'cdc', lw: 300, lh: 60, pose: 'plafond' });
  for (const y of [400, 1000, 1600]) gaine('L0', [{ x: 2200, y }, { x: 5100, y }], { kind: 'cdc', lw: 200, lh: 60, pose: 'plafond' });
  // goulotte de prises à 1,10 m tout autour de l'atelier
  const GT = [{ x: 2200, y: 250 }, { x: 2200, y: 45 }, { x: 5160, y: 45 }, { x: 5160, y: 1955 }, { x: 2200, y: 1955 }, { x: 2200, y: 1750 }];
  gaine('L0', GT, { kind: 'goulotte', lw: 110, lh: 60, pose: 'hauteur', z: 110 });
  // éclairage de l'atelier : 15 réglettes (flux et puissance d'exemple), sur les lignes de chemin de câbles
  const lum = { flux: d(6000, EX), p: d(45, EX) };
  const regl = [];
  for (const y of [400, 1000, 1600]) for (const x of [2600, 3200, 3800, 4400, 5000]) { const e = E('reglette', x, y + 40, 0, { lum: JSON.parse(JSON.stringify(lum)) }); regl.push(e); vers('L0', { x, y }, e, { pose: 'plafond' }); }
  const cmdA = E('bp', X1 + 10, 1150, 270); vers('L0', { x: 2200, y: 1150 }, cmdA, { pose: 'hauteur', z: 110 });
  for (const e of regl) P.links.push({ id: uid('k'), lv: 'L0', a: cmdA.id, b: e.id });
  // prises : triphasées pour les machines, 16 A sur la goulotte
  const surGoulotte = (t, x, y, rot, extra) => { const e = E(t, x, y, rot, extra); const p = rot === 0 ? { x, y: 45 } : rot === 180 ? { x, y: 1955 } : { x: 5160, y }; vers('L0', p, e, { pose: 'hauteur', z: 110 }); return e; };
  for (const x of [2600, 3400, 4200]) surGoulotte('pc_tri', x, 15, 0, { h: 110 });
  for (const x of [2400, 3000, 3800, 4600]) surGoulotte('pc', x, 15, 0, { h: 110 });
  surGoulotte('pc_tri', X2 - 15, 650, 90, { h: 110 }); surGoulotte('pc', X2 - 15, 1100, 90, { h: 110 }); surGoulotte('arret_urg', X2 - 15, 900, 90);
  surGoulotte('pc', 2600, Y1 - 15, 180, { h: 110 }); surGoulotte('pc', 3000, Y1 - 15, 180, { h: 110 }); surGoulotte('pc3', 4200, Y1 - 15, 180, { h: 110 });
  surGoulotte('baes', 2400, 15, 0); surGoulotte('baes', 4900, Y1 - 15, 180); surGoulotte('baes', X2 - 15, 300, 90); surGoulotte('camera', X2 - 15, 1850, 90);
  surGoulotte('declencheur', 4700, Y1 - 15, 180); surGoulotte('arret_urg', 3300, 15, 0);
  const portail = E('garage_mot', 3600, 1920, 0); vers('L0', { x: 3600, y: 1955 }, portail, { pose: 'hauteur', z: 110 });
  const wifi = E('wifi', 3700, 1030, 0); vers('L0', { x: 3700, y: 1000 }, wifi);
  // extérieur : bornes de recharge et projecteurs (traversées du mur à percer)
  for (const x of [2700, 3150]) { const b = E('borne_ve', x, Y1 + 15, 0); vers('L0', { x, y: 1955 }, b, { pose: 'hauteur', z: 110 }); }
  for (const x of [4300, 5050]) { const p = E('proj_det', x, Y1 + 15, 0); vers('L0', { x, y: 1955 }, p, { pose: 'hauteur', z: 110 }); }
  // bande de locaux : une gaine au plafond depuis le tableau divisionnaire
  gaine('L0', [td, { x: 1500, y: 250 }, { x: 1500, y: 1975 }], { a: td.id, kind: 'irl', dia: 32, pose: 'plafond' });
  const loc = (t, x, y, rot, extra) => { const e = E(t, x, y, rot, extra); vers('L0', { x: 1500, y: Math.min(1950, Math.max(260, y)) }, e); return e; };
  loc('baie', X0 + 15, 420, 270); loc('onduleur', X1 - 10, 300, 90); loc('pl', 1650, 380, 0); loc('int_s', X1 - 10, 350, 90); loc('baes', X1 - 10, 450, 90); loc('det_chaleur', 1400, 280, 0);
  loc('pl', 1650, 750, 0); loc('int_s', X1 - 10, 640, 90); loc('pc', X0 + 15, 600, 270, { h: 30 }); loc('rad_elec', X0 + 15, 880, 270); loc('baes', X1 - 10, 900, 90);
  loc('pl', 1650, 1200, 0); loc('int_s', 1700, 1015, 0); loc('ce_elec', 1900, 1300, 0); loc('extracteur', X0 + 15, 1300, 270); loc('pc_ip', 1300, 1385, 180);
  const b1 = loc('dalle_led', 1350, 1650, 0, { lum: { flux: d(3600, EX), p: d(32, EX) } }), b2 = loc('dalle_led', 1750, 1650, 0, { lum: { flux: d(3600, EX), p: d(32, EX) } });
  const ib = loc('int_s', 1750, Y1 - 15, 180); P.links.push({ id: uid('k'), lv: 'L0', a: ib.id, b: b1.id }, { id: uid('k'), lv: 'L0', a: ib.id, b: b2.id });
  loc('pc', X0 + 15, 1500, 270, { h: 30 }); loc('pc', X0 + 15, 1900, 270, { h: 30 }); loc('pc', 1450, Y1 - 15, 180, { h: 30 }); loc('rj45', X0 + 15, 1550, 270); loc('rj45', X0 + 15, 1850, 270);
  loc('clim', X1 - 10, 1550, 90); loc('badge', 1550, Y1 + 15, 0); loc('daaf', 1650, 1600, 0);
  // passage vers la mezzanine (phase 4 : symboles jumeaux d'un étage à l'autre)
  const t0 = E('traversee', 1700, 420, 0), t1 = sym('L1', 'traversee', 1700, 420, 0);
  t0.to = t1.id; t1.to = t0.id;
  vers('L0', { x: 1500, y: 420 }, t0);
  /* mezzanine (étage) */
  const E1 = (t, x, y, rot, extra) => sym('L1', t, x, y, rot, extra);
  gaine('L1', [t1, { x: 1700, y: 1950 }], { a: t1.id, kind: 'icta', dia: 25, pose: 'sol' });
  const mez = (t, x, y, rot, extra) => { const e = E1(t, x, y, rot, extra); vers('L1', { x: 1700, y: Math.min(1950, Math.max(425, y)) }, e, { pose: 'sol' }); return e; };
  const dl = []; for (const [x, y] of [[1400, 300], [1400, 900], [1900, 300], [1900, 900], [1450, 1650], [1850, 1650]]) dl.push(mez('dalle_led', x, y, 0, { lum: { flux: d(3600, EX), p: d(32, EX) } }));
  const im = mez('int_vv', 1550, 1285, 0); for (const e of dl.slice(0, 4)) P.links.push({ id: uid('k'), lv: 'L1', a: im.id, b: e.id });
  const ir = mez('int_s', 1550, 1315, 180); for (const e of dl.slice(4)) P.links.push({ id: uid('k'), lv: 'L1', a: ir.id, b: e.id });
  for (const y of [200, 500, 800, 1100]) mez('pc', X0 + 15, y, 270, { h: 30 });
  for (const y of [350, 950]) mez('rj45', X0 + 15, y, 270);
  mez('pc', X0 + 15, 1500, 270, { h: 30 }); mez('hdmi', X0 + 15, 1800, 270); mez('tv', X1 - 10, 1650, 90); mez('clim', X1 - 10, 600, 90); mez('daaf', 1600, 650, 0);
  return { feed, regl };
}

/* ---------------- plan d'exemple complet ---------------- */
function samplePlan() {
  DEPARTS.clear();
  setP(blankPlan(NOM_EXEMPLE));
  maison();
  const tableau = P.elec.find((e) => e.type === 'tableau');
  atelier(tableau);
  syncRooms();
  const name = (x, y, n, lv) => { const g = geo(lv || 'L0'); const r = g.rooms.find((q) => inPoly({ x, y }, q.loop)); if (r && r.label) { r.label.name = n; r.label.x = x; r.label.y = y; return r.label; } return null; };
  name(1600, 220, 'Local technique'); name(1600, 700, 'Vestiaires'); name(1600, 1150, 'Sanitaires'); name(1600, 1520, 'Bureau d’atelier');
  const salle = name(3600, 1100, 'Atelier');
  name(1600, 1000, 'Open space', 'L1'); name(1450, 1450, 'Salle de réunion', 'L1');
  const lab = P.rooms.find((r) => r.name === 'Atelier'); if (lab) lab.tint = 2;
  touch();
  /* installation (phase 3) : triphasé, ks et réserve saisis à titre d'exemple */
  Object.assign(P.install, { kva: 36, parafoudre: true, row: 13, reseau: 'tri', ks: d(0.7), reserve: d(15) });
  generateFromPlan();
  /* données de calcul (phase 3) : quelques circuits complétés, les autres laissés incomplets pour voir « Manquante » */
  const ph = ['L1', 'L2', 'L3']; let k = 0;
  for (const c of P.circuits) {
    const els = P.elec.filter((e) => e.cid === c.id);
    const calc = {};
    if (els.some((e) => e.type === 'pc_tri')) Object.assign(calc, { p: d(7500), cos: d(0.85), phase: 'tri', mat: 'cu' });
    else if (els.some((e) => e.type === 'reglette')) Object.assign(calc, { cos: d(0.95), phase: ph[k++ % 3] });
    else if (c.kind === 'chauffage' || c.kind === 'chauffe_eau') Object.assign(calc, { cos: d(1), phase: ph[k++ % 3] });
    else if (c.kind === 'eclairage' || c.kind === 'prises') { if (k % 2) calc.phase = ph[k % 3]; k++; }
    if (c.kind === 'irve') Object.assign(calc, { p: d(7400), cos: d(1), len: d(32), phase: 'tri', dcab: d(14) });
    if (Object.keys(calc).length) c.calc = calc;
  }
  /* références de la bibliothèque technique (phase 2) : articles génériques sur quelques symboles */
  for (const e of P.elec) { const a = articlesFor(e.type)[0]; if (a && (e.type === 'pc_tri' || e.type === 'tab_div' || e.type === 'pc')) e.art = a.id; }
  /* études d'éclairage (phase 5) : éclairement visé saisi (aucune valeur réglementaire n'est fournie par Calque) */
  const etude = (lv, room, E, lums) => { if (room) P.etudes.push({ id: uid('et'), lv, room: room.id, E: d(E, 'Valeur d’exemple saisie : à fixer selon votre cahier des charges'), lums }); };
  etude('L0', salle, 300, [{ type: 'reglette', flux: d(6000, EX), p: d(45, EX) }, { type: 'dalle_led', flux: d(3600, EX), p: d(32, EX) }]);
  etude('L0', P.rooms.find((r) => r.name === 'Bureau d’atelier'), 500, [{ type: 'dalle_led', flux: d(3600, EX), p: d(32, EX) }]);
  etude('L1', P.rooms.find((r) => r.name === 'Open space'), 500, [{ type: 'dalle_led', flux: d(3600, EX), p: d(32, EX) }]);
  etude('L0', P.rooms.find((r) => r.name === 'Séjour'), 150, [{ type: 'spot', flux: d(450, EX), p: d(5, EX) }]);
  /* dossier PDF (phase 6) : cartouche et un premier indice */
  P.doc = { client: 'Client fictif (exemple)', adresse: '1 rue de l’Exemple, 00000 Calque-sur-Plan', entreprise: 'Entreprise fictive', auteur: 'Calque', affaire: 'EX-2026-001',
    revisions: [{ i: 'A', date: Date.UTC(2026, 10, 5, 9), objet: 'Première diffusion du plan d’exemple', par: 'Calque', regles: REGLES_VERSION }] };
  /* suivi de chantier (phase 7) : valeurs d'exemple (cases « posé », réserves, annotations, photos à prendre).
     Aucune photo n'est inventée : seulement des emplacements « photo à prendre ». */
  chantierExemple();
  variantesExemple();
  chiffrageExemple();
  plansElectriquesExemple();
  touch();
  return JSON.parse(JSON.stringify(P));
}
/* module « Plans électriques » (format v12) : personnalisation des calques, vue enregistrée, couleur, courbe et type de
   conducteur de circuits, taille de symboles, télérupteur et fil pilote pour montrer le moteur de câblage.
   Valeurs d'exemple choisies par Calque (« saisie ») : ni données de fabricant, ni exigences réglementaires. */
function plansElectriquesExemple() {
  P.calques = { mobilier: { op: 0.7 }, faibles: { col: '#0E7490' }, cotations: { nom: 'Cotes' } };
  for (const c of P.circuits) {
    const els = P.elec.filter((e) => e.cid === c.id);
    c.courbe = c.kind === 'pac' || c.kind === 'motorisation' ? 'D' : 'C';
    if (els.some((e) => e.type === 'pc_tri')) c.cond = 'r2v'; // goulotte de l'atelier : câble à gaine
    else if (c.kind === 'prises' && els.every((e) => e.lv === 'L0' && e.x < 1100)) c.cond = 'h07vu'; // maison : fils sous ICTA
    if (c.kind === 'irve') c.col = '#15803D';
    /* boutons-poussoirs de l'atelier : télérupteur au tableau (fil de commande compté par le moteur de câblage) */
    if (els.some((e) => e.type === 'bp')) c.ctrl = 'telerupteur';
  }
  const tg = P.elec.find((e) => e.type === 'tableau'); if (tg) tg.sc = 1.25;
  const td = P.elec.find((e) => e.type === 'tab_div');
  if (td) { td.sc = 1.5; sym('L0', 'prog_fp', td.x + 30, td.y + 120, 270, { h: 130 }); } // fil pilote des radiateurs
  /* mezzanine : second va-et-vient relié aux mêmes dalles (navettes comptées par le moteur de câblage) */
  const im = P.elec.find((e) => e.lv === 'L1' && e.type === 'int_vv' && e.x > 1100);
  if (im) {
    const vv = sym('L1', 'int_vv', im.x + 300, im.y, im.rot, { h: im.h, cid: im.cid });
    for (const l of P.links.filter((k) => k.a === im.id)) P.links.push({ id: uid('k'), lv: 'L1', a: vv.id, b: l.b });
    vers('L1', { x: 1700, y: im.y }, vv, { pose: 'sol' });
  }
  const eclAtelier = P.circuits.filter((c) => c.kind === 'eclairage' && P.elec.some((e) => e.cid === c.id && e.type === 'reglette')).map((c) => c.id);
  P.vues = [{ id: 'vu-ex-atelier', nom: 'Atelier : éclairage câblé', off: ['mobilier', 'prises', 'specialises', 'faibles', 'annotations', 'cotations'], fade: ['archi'], circs: eclAtelier }];
}
/* variantes (phase 7) : « Standard » (principale, affichée), « Économique » et « Haut de gamme ».
   Valeurs d'exemple de Calque (fictives) : aucune n'est une donnée de fabricant. */
function variantesExemple() {
  initialiser(P, { nom: 'Standard', gamme: 'std', at: Date.UTC(2026, 10, 2, 9) });
  const eco = dupliquer(P, { nom: 'Économique', gamme: 'eco', at: Date.UTC(2026, 10, 2, 10) });
  const haut = dupliquer(P, { nom: 'Haut de gamme', gamme: 'haut', at: Date.UTC(2026, 10, 2, 11) });
  // économique : sans climatisation, caméra ni prises multimédia de la mezzanine ; réglettes moins puissantes ; sans parafoudre
  const D = eco.data, retire = new Set(D.elec.filter((e) => ['clim', 'camera', 'tv', 'hdmi'].includes(e.type)).map((e) => e.id));
  D.elec = D.elec.filter((e) => !retire.has(e.id));
  D.links = D.links.filter((l) => !retire.has(l.a) && !retire.has(l.b));
  for (const g of D.ducts) { if (retire.has(g.a)) g.a = null; if (retire.has(g.b)) g.b = null; }
  D.circuits = D.circuits.filter((c) => D.elec.some((e) => e.cid === c.id));
  D.install.parafoudre = false;
  for (const e of D.elec) if (e.type === 'reglette' && e.lum) e.lum = { flux: d(4800, EX), p: d(36, EX) };
  eco.note = 'Exemple : version au plus juste';
  // haut de gamme : réglettes plus puissantes (valeurs d'exemple)
  for (const e of haut.data.elec) if (e.type === 'reglette' && e.lum) e.lum = { flux: d(7500, EX), p: d(52, EX) };
  haut.note = 'Exemple : éclairage renforcé de l’atelier';
  P.variantes = JSON.parse(JSON.stringify(P.variantes));
}
function chantierExemple() {
  const J = (j, h) => Date.UTC(2026, 10, j, h || 9);
  const ch = chantierDe(P);
  const local = P.rooms.find((r) => r.name === 'Local technique'), atelier = P.rooms.find((r) => r.name === 'Atelier');
  // maison : tout posé ; atelier : la bande de locaux posée, le hall en cours
  let k = 0;
  for (const e of P.elec) {
    if (e.lv === 'L0' && (e.x < 1100 || (e.x < 2000 && e.y < 1000))) ch.poses.app[e.id] = J(3 + (k++ % 3), 8 + (k % 8));
  }
  for (const c of P.circuits) {
    const els = P.elec.filter((e) => e.cid === c.id);
    if (els.length && els.every((e) => ch.poses.app[e.id])) ch.poses.circ[c.id] = J(5, 16);
  }
  noter(P, 'note', 'Début du chantier (exemple fictif de Calque)', J(3, 7));
  noter(P, 'pose', `Maison et locaux techniques : ${Object.keys(ch.poses.app).length} appareils posés (exemple)`, J(5, 17));
  const tri = P.elec.find((e) => e.type === 'pc_tri'), baes = P.elec.find((e) => e.type === 'baes' && e.x > 2000), borne = P.elec.find((e) => e.type === 'borne_ve');
  const r1 = nouvelleReserve(P, { lv: 'L0', x: tri.x + 30, y: tri.y + 30 }, { at: J(5, 10), ref: { t: 'elec', id: tri.id }, titre: 'Exemple : prise triphasée à refixer', detail: 'Valeur d’exemple de Calque : boîtier mal fixé sur le poteau.' });
  r1.echeance = J(12, 12);
  const r2 = nouvelleReserve(P, { lv: 'L0', x: baes.x - 40, y: baes.y + 30 }, { at: J(5, 11), ref: { t: 'elec', id: baes.id }, titre: 'Exemple : BAES à remplacer', detail: 'Valeur d’exemple de Calque : appareil reçu abîmé.' });
  changerStatut(P, r2, 'en_cours', J(6, 9));
  const r3 = nouvelleReserve(P, { lv: 'L0', x: (local ? local.x : 1600) + 60, y: (local ? local.y : 220) + 40 }, { at: J(4, 14), titre: 'Exemple : repérage des câbles du tableau divisionnaire', detail: 'Valeur d’exemple de Calque.' });
  changerStatut(P, r3, 'levee', J(6, 15));
  if (borne) nouvelleReserve(P, { lv: 'L0', x: borne.x + 30, y: borne.y - 30 }, { at: J(6, 16), ref: { t: 'elec', id: borne.id }, titre: 'Exemple : attendre le passage du câble enterré' }).echeance = J(4, 12); // échéance dépassée (exemple)
  // photos à prendre (aucune image inventée)
  ch.photos.push({ id: uid('ph'), lv: 'L0', x: tri.x - 40, y: tri.y + 50, legende: 'Exemple : photo à prendre de la prise triphasée', aFaire: true, reserve: r1.id });
  ch.photos.push({ id: uid('ph'), lv: 'L0', x: (atelier ? atelier.x : 3600) - 300, y: (atelier ? atelier.y : 1100) + 200, legende: 'Exemple : photo à prendre du chemin de câbles avant fermeture', aFaire: true });
  noter(P, 'photo', 'Deux photos à prendre ajoutées (exemple)', J(6, 17));
  // annotations au Pencil (exemple) : un entourage et une flèche près de la réserve n° 1
  const cx = tri.x, cy = tri.y, pts = [];
  for (let i = 0; i <= 24; i++) { const a = (i / 24) * Math.PI * 2; pts.push(Math.round((cx + 70 * Math.cos(a)) * 10) / 10, Math.round((cy + 55 * Math.sin(a)) * 10) / 10); }
  ch.notes.push({ id: uid('an'), lv: 'L0', pts, col: '#D0342C', ep: 5, at: J(5, 10) });
  ch.notes.push({ id: uid('an'), lv: 'L0', pts: [cx + 260, cy + 200, cx + 90, cy + 60, cx + 120, cy + 100, cx + 90, cy + 60, cx + 135, cy + 62], col: '#1F5FD1', ep: 5, at: J(5, 10) });
}

/* chiffrage (quantitatif) : quelques prix unitaires et temps de pose FICTIFS, marqués « saisie » avec leur origine,
   pour montrer un total « partiel » : les autres lignes restent « non chiffrées ». Aucun prix de fabricant. */
function chiffrageExemple() {
  const src = 'Valeur d’exemple fictive de Calque (pas un prix réel)';
  const prix = { 'art:pc-2pt-16': 8, 'app:pc2': 14, 'app:int_s': 7, 'app:pl': 5, 'art:pc-3pnt-20': 28, 'app:reglette': 35, 'disj:16:mono': 9, 'disj:20:mono': 9, 'disj:20:tri': 45, 'parafoudre': 90,
    'mat:Cheminements|Gaine ICTA Ø20': 0.6, 'mat:Conducteurs|Fil ou câble 2,5 mm²': 0.45 };
  const temps = { 'art:pc-2pt-16': 20, 'app:pc2': 25, 'app:int_s': 20, 'app:pl': 15, 'art:pc-3pnt-20': 40, 'app:reglette': 30 };
  const c = { prix: {}, temps: {}, tauxH: { v: 45, st: 'saisie', src }, tva: { v: 20, st: 'saisie', src } };
  for (const [k, v] of Object.entries(prix)) c.prix[k] = { v, st: 'saisie', src };
  for (const [k, v] of Object.entries(temps)) c.temps[k] = { v, st: 'saisie', src };
  P.chiffrage = c;
}

export { NOM_EXEMPLE, samplePlan };

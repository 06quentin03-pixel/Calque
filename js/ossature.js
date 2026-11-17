/* Calque — module « ossature » : maison à ossature bois « à l'américaine » (platform frame) : montants, lisses,
   sablières, linteaux d'un mur dont une couche est une ossature (matériau avec `ossature` dans compositions.js).
   JavaScript pur, sans accès à l'écran : testable avec Node.

   Dimensions nominales nord-américaines : un « 2×4 » mesure 38 × 89 mm (1 ½ × 3 ½ pouces), un « 2×6 » 38 × 140 mm ;
   entraxe 16 pouces (40,6 cm) ou 24 pouces (61 cm). Ce sont des dimensions courantes du commerce, pas des valeurs
   réglementaires : le dimensionnement (charges, contreventement, linteaux) est à faire par un bureau d'études ou suivant
   le guide applicable (DTU 31.2 en France, IRC aux États-Unis).

   Règle de pose (simplifiée, usuelle) : un montant à chaque bout, des montants à l'entraxe depuis le bout A ; de part et
   d'autre de chaque baie un montant de rive et un poteau d'appui sous le linteau ; potelets sous l'appui d'une fenêtre
   et au-dessus du linteau, à l'entraxe ; une lisse basse et une double sablière sur toute la longueur. */
import { isNum } from './noyau.js';

const ENTRAXES = [{ v: 40.6, n: '16 pouces (40,6 cm)' }, { v: 61, n: '24 pouces (61 cm)' }];
const SRC_OSS = 'Pose usuelle d’une ossature bois (platform frame), dimensions nominales du commerce : à faire valider (DTU 31.2, guide de l’ossature)';

/* montants d'un mur de longueur L (cm, sur l'axe), baies ops [{ t (milieu), w, h, sill, kind }], hauteur H (cm)
   opts : { entraxe (cm), lm (épaisseur d'un montant, cm), hl (hauteur du linteau, cm) } */
function montantsDuMur(L, ops, H, opts) {
  opts = opts || {};
  const e = isNum(opts.entraxe) && opts.entraxe > 10 ? opts.entraxe : 40.6, lm = isNum(opts.lm) && opts.lm > 0 ? opts.lm : 3.8, hl = isNum(opts.hl) ? opts.hl : 23.5;
  const Hm = isNum(H) && H > 0 ? H : 250, Hs = Hm - 3 * lm; // hauteur d'un montant entre la lisse basse et la double sablière
  const baies = (ops || []).filter((o) => isNum(o.t) && isNum(o.w) && o.w > 0).map((o) => ({ a: o.t - o.w / 2, b: o.t + o.w / 2, sill: isNum(o.sill) ? o.sill : 0, h: isNum(o.h) ? o.h : 215, kind: o.kind }))
    .sort((p, q) => p.a - q.a);
  const dansBaie = (x) => baies.find((b) => x + lm / 2 > b.a - 2 * lm && x - lm / 2 < b.b + 2 * lm) || null;
  const out = [];
  const add = (x, role, z0, z1) => out.push({ x: Math.max(lm / 2, Math.min(L - lm / 2, x)), role, z0, z1 });
  /* montants courants (à l'entraxe) et des bouts */
  const xs = [lm / 2]; for (let x = e; x < L - lm / 2 - 1e-6; x += e) xs.push(x); xs.push(L - lm / 2);
  for (const x of xs) {
    const b = dansBaie(x);
    if (!b) { add(x, x <= lm || x >= L - lm ? 'bout' : 'courant', lm, lm + Hs); continue; }
    /* dans une baie : potelets sous l'appui (fenêtre) et au-dessus du linteau */
    if (x > b.a && x < b.b) {
      if (b.sill > 2 * lm) add(x, 'potelet', lm, b.sill - lm);
      const zl = b.sill + b.h + hl; if (zl < lm + Hs - 2) add(x, 'potelet', zl, lm + Hs);
    }
  }
  for (const b of baies) {
    add(b.a - lm / 2, 'appui', lm, b.sill + b.h); add(b.b + lm / 2, 'appui', lm, b.sill + b.h);          // poteaux d'appui sous le linteau
    add(b.a - 1.5 * lm, 'rive', lm, lm + Hs); add(b.b + 1.5 * lm, 'rive', lm, lm + Hs);                 // montants de rive (pleine hauteur)
  }
  out.sort((p, q) => p.x - q.x);
  const linteaux = baies.map((b) => ({ a: b.a - lm, b: b.b + lm, z0: b.sill + b.h, z1: b.sill + b.h + hl, L: b.b - b.a + 2 * lm }));
  const pleine = out.filter((m) => m.role !== 'potelet' && m.role !== 'appui').length, autres = out.length - pleine;
  return {
    montants: out, linteaux, entraxe: e, lm,
    n: out.length, pleineHauteur: pleine, potelets: out.filter((m) => m.role === 'potelet').length, appuis: out.filter((m) => m.role === 'appui').length,
    lineaireMontants: out.reduce((s, m) => s + Math.max(0, m.z1 - m.z0), 0),
    lisses: { basse: L, sablieres: 2 * L, total: 3 * L },
    lineaireLinteaux: linteaux.reduce((s, l) => s + l.L, 0), autres,
  };
}
/* nombre de montants courants d'un mur plein : ⌈L / entraxe⌉ + 1 (formule usuelle, pour la fiche Calculs) */
function montantsCourants(L, e) { return isNum(L) && L > 0 && isNum(e) && e > 0 ? Math.ceil(L / e - 1e-9) + 1 : 0; }

export { ENTRAXES, SRC_OSS, montantsCourants, montantsDuMur };

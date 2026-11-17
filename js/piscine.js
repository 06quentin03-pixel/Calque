/* Calque — module « piscine » : volumes d'une piscine (NF C 15-100, partie 7-702) et appareils électriques qui s'y
   trouvent. JavaScript pur, sans accès à l'écran : testable avec Node.
   Volumes (règle générale de la partie 7-702, dimensions usuelles ; l'extrait Legrand reçu ne les détaille pas :
   « vérification nécessaire », jamais « conforme ») :
     volume 0 : l'intérieur du bassin ;
     volume 1 : jusqu'à 2 m du bord du bassin, et jusqu'à 2,50 m de haut ;
     volume 2 : 1,50 m au-delà du volume 1, jusqu'à 2,50 m de haut. */
import { ELEC_BY } from './symboles.js';

const SRC_PISCINE = 'NF C 15-100, partie 7-702 (piscines) : règle générale, non recopiée d’un extrait Legrand — à vérifier';
const V1 = 200, V2 = 350, HMAX = 250; // cm depuis le bord du bassin
const estBassin = (it) => !!it && (it.type === 'piscine' || it.type === 'spa');
/* bassin : rectangle intérieur (sans la margelle) dans le repère du meuble */
function bassin(it) { const m = it.type === 'piscine' ? Math.min(30, Math.min(it.w, it.d) * 0.12) : 12; return { hw: it.w / 2 - m, hd: it.d / 2 - m }; }
function versLocal(it, p) { const a = -(it.rot || 0) * Math.PI / 180, dx = p.x - it.x, dy = p.y - it.y; return { x: dx * Math.cos(a) - dy * Math.sin(a), y: dx * Math.sin(a) + dy * Math.cos(a) }; }
/* distance horizontale au bord du bassin (0 dedans) */
function distanceBassin(it, p) { const b = bassin(it), l = versLocal(it, p), dx = Math.max(0, Math.abs(l.x) - b.hw), dy = Math.max(0, Math.abs(l.y) - b.hd); return Math.hypot(dx, dy); }
function volumeDe(it, p, h) {
  const d = distanceBassin(it, p);
  if (d <= 0) return 0;
  if (h != null && h > HMAX) return null;
  return d <= V1 ? 1 : d <= V2 ? 2 : null;
}
/* appareils électriques du même niveau dans les volumes du bassin */
function appareilsDansVolumes(plan, it) {
  const out = [];
  for (const e of plan.elec || []) {
    if (e.lv !== it.lv) continue;
    const def = ELEC_BY.get(e.type) || {}, h = e.h != null ? e.h : def.floor ? 0 : def.wall ? def.h : 260;
    const v = volumeDe(it, e, h); if (v == null) continue;
    const tbts = e.type === 'proj_piscine' || e.type === 'volet_piscine';
    out.push({ e, v, d: distanceBassin(it, e), msg: v === 0 ? (tbts ? 'dans le bassin : très basse tension de sécurité (12 V) obligatoire' : 'dans le bassin : interdit sauf matériel prévu pour le volume 0 (TBTS 12 V)')
      : v === 1 ? (tbts ? 'volume 1 : TBTS 12 V, transformateur hors des volumes 0 et 1' : 'volume 1 : seuls les matériels en TBTS 12 V ou prévus pour ce volume')
        : 'volume 2 : prise protégée par un différentiel 30 mA, ou transformateur de séparation, ou TBTS ; indice de protection adapté' });
  }
  return out;
}
export { HMAX, SRC_PISCINE, V1, V2, appareilsDansVolumes, bassin, distanceBassin, estBassin, versLocal, volumeDe };

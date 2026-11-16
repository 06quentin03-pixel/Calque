/* Calque — module « vdi » : câbles RJ45 entre le coffret de communication et les prises RJ45 (demande du 16 novembre 2026).
   JavaScript pur, sans accès à l'écran : testable avec Node. Le plan n'est jamais modifié.
   Câblage en étoile (un câble par prise, depuis le coffret, la baie ou la box du même niveau), gaine au plafond puis
   descente dans le mur jusqu'à la prise. La catégorie du câble n'est pas choisie par Calque : à préciser. */
import { RJ45_PRISES, RJ45_SOURCES, ancrage, estLienRJ45, indexElec, longueurGaine } from './cheminement.js';
import { itineraireEntre } from './itineraire.js';

/* câble RJ45 raccordé à un symbole (prise ou coffret) */
function liensRJ45(plan, e) {
  const E = indexElec(plan);
  return (plan.ducts || []).filter((d) => (d.a === e.id || d.b === e.id) && estLienRJ45(d, E));
}
/* coffret (ou baie, ou box) le plus proche sur le niveau, coffret de communication en priorité */
function sourceRJ45(plan, lv, pres) {
  const l = (plan.elec || []).filter((x) => x.lv === lv && RJ45_SOURCES.has(x.type));
  const rang = (x) => (x.type === 'com' ? 0 : x.type === 'baie' ? 1 : 2);
  l.sort((a, b) => rang(a) - rang(b) || (pres ? Math.hypot(a.x - pres.x, a.y - pres.y) - Math.hypot(b.x - pres.x, b.y - pres.y) : 0));
  return l[0] || null;
}
/* prises RJ45 du niveau qui n'ont pas encore leur câble */
function prisesSansCable(plan, lv) {
  const E = indexElec(plan), relies = new Set();
  for (const d of plan.ducts || []) if (estLienRJ45(d, E)) { relies.add(d.a); relies.add(d.b); }
  return (plan.elec || []).filter((e) => e.lv === lv && RJ45_PRISES.has(e.type) && !relies.has(e.id));
}
/* câbles proposés depuis src vers chaque prise : [{ lv, sys, pts, a, b, len, kind, pose }], echecs: [ids] */
function cablesRJ45(plan, src, prises) {
  const tmp = Object.assign({}, plan, { ducts: (plan.ducts || []).slice() }), out = { cables: [], echecs: [] };
  for (const e of prises) {
    if (e.lv !== src.lv) { out.echecs.push(e.id); continue; }
    const r = itineraireEntre(tmp, e.lv, src, ancrage(src), e, ancrage(e), { pose: 'plafond' });
    if (!r) { out.echecs.push(e.id); continue; }
    const g = { lv: e.lv, sys: 'elec', pts: r.pts, a: src.id, b: e.id, len: r.len, kind: 'icta', pose: 'plafond' };
    tmp.ducts.push(Object.assign({ id: '~rj' + out.cables.length }, g)); out.cables.push(g);
  }
  return out;
}
/* longueur totale des câbles RJ45 du plan (cm, verticales comprises) et leur nombre */
function longueurRJ45(plan) {
  const E = indexElec(plan); let cm = 0, n = 0;
  for (const d of plan.ducts || []) if (estLienRJ45(d, E)) { cm += longueurGaine(plan, d, E).total; n++; }
  return { cm, n };
}

export { cablesRJ45, liensRJ45, longueurRJ45, prisesSansCable, sourceRJ45 };

/* Calque — module « calques » : calques professionnels et vues « Plans électriques ».
   Sans écran (testable avec Node) : définitions, appartenance d'un objet à un calque, état d'affichage, nettoyage (format v12).

   - Un CALQUE regroupe des objets du plan (murs, symboles d'une famille, gaines…). Il peut être masqué, VERROUILLÉ
     (ses objets ne se sélectionnent plus), recoloré et rendu plus ou moins opaque.
     La personnalisation (nom, couleur, opacité, verrouillage) est enregistrée dans le plan : `P.calques` (v12).
     Ce qui est affiché ou masqué est un réglage de l'appareil (`S.calq`, comme les autres filtres d'affichage).
   - Une VUE (plan d'implantation, de câblage, d'éclairage…) est une combinaison de calques : une seule base de données,
     aucune copie du plan. Vues prédéfinies ci-dessous ; vues de l'utilisateur dans `P.vues` (v12).
   Les anciens réglages restent la référence pour le mobilier (`S.layers.furn`), les cotes (`S.layers.dims`) et
   l'électricité (`S.layers.elec`) : rien ne change pour un plan ou un appareil qui n'utilise pas les calques. */
import { P, S } from './noyau.js';
import { ELEC_BY } from './symboles.js';

const CALQUES = [
  { id: 'archi', n: 'Architecture', d: 'Murs, ouvertures, pièces, escaliers', couleur: false },
  { id: 'mobilier', n: 'Mobilier', d: 'Meubles et équipements du bâtiment', couleur: false },
  { id: 'eclairage', n: 'Éclairage', d: 'Points lumineux et commandes', elec: true },
  { id: 'prises', n: 'Prises', d: 'Prises de courant', elec: true },
  { id: 'specialises', n: 'Équipements spécialisés', d: 'Circuits spécialisés, chauffage, VMC, volets, sécurité', elec: true },
  { id: 'faibles', n: 'Courants faibles', d: 'Communication, accès, alarme et vidéo', elec: true },
  { id: 'tableau', n: 'Tableau et distribution', d: 'Tableaux, boîtes de dérivation, passages, énergie', elec: true },
  { id: 'gaines', n: 'Gaines', d: 'Gaines ICTA, tubes IRL, zones interdites', elec: true },
  { id: 'chemins', n: 'Chemins de câbles', d: 'Goulottes et chemins de câbles', elec: true },
  { id: 'circuits', n: 'Circuits et câblage', d: 'Liaisons commandes → éclairages, conducteurs des circuits', elec: true },
  { id: 'annotations', n: 'Annotations', d: 'Textes du plan', couleur: false },
  { id: 'cotations', n: 'Cotations', d: 'Cotes des murs et cotes libres', couleur: false },
];
const CALQUE_BY = new Map(CALQUES.map((c) => [c.id, c]));
const CALQUE_IDS = CALQUES.map((c) => c.id);

/* symbole → calque */
const SPEC_PRISES = new Set(['pc20', 'pc32', 'pc_tri', 'prise_ve']);
const VERS_SPEC = new Set(['cmd_vr', 'cmd_vr_c', 'thermostat', 'borne_ve']);
function calqueDeType(t) {
  const def = ELEC_BY.get(t); if (!def) return 'tableau';
  if (VERS_SPEC.has(t) || SPEC_PRISES.has(t)) return 'specialises';
  switch (def.cat) {
    case 'eclairage': case 'commandes': return 'eclairage';
    case 'prises': return 'prises';
    case 'appareils': case 'confort': case 'ventilation': case 'moteurs': case 'securite': return 'specialises';
    case 'comm': case 'acces': case 'alarme': return 'faibles';
    default: return 'tableau';
  }
}
const calqueDeElec = (e) => calqueDeType(e && e.type);
function calqueDeGaine(d) {
  if (!d) return 'gaines';
  if (d.sys === 'vmc') return 'specialises';
  return d.kind === 'goulotte' || d.kind === 'cdc' ? 'chemins' : 'gaines';
}

/* ---------------- vues prédéfinies (« Plans électriques ») ----------------
   on : calques affichés ; fade : calques estompés (fond de plan) ; circ : couleurs des circuits */
const TOUT = CALQUE_IDS;
const VUES = [
  { id: 'synthese', n: 'Synthèse', d: 'Tout le projet : architecture, appareils, gaines et câblage', on: TOUT, fade: [], circ: true },
  { id: 'archi', n: 'Architecture', d: 'Plan du bâtiment seul', on: ['archi', 'mobilier', 'annotations', 'cotations'], fade: [], circ: false },
  { id: 'implantation', n: 'Implantation', d: 'Plan d’implantation électrique : tous les appareils, sans gaines ni câblage', on: ['archi', 'mobilier', 'eclairage', 'prises', 'specialises', 'faibles', 'tableau', 'annotations', 'cotations'], fade: [], circ: true },
  { id: 'cablage', n: 'Câblage', d: 'Plan de câblage : gaines, chemins de câbles, conducteurs par circuit', on: ['archi', 'eclairage', 'prises', 'specialises', 'faibles', 'tableau', 'gaines', 'chemins', 'circuits', 'annotations'], fade: ['archi'], circ: true },
  { id: 'eclairage', n: 'Éclairage', d: 'Plan d’éclairage : points lumineux, commandes et liaisons', on: ['archi', 'eclairage', 'tableau', 'circuits', 'annotations', 'cotations'], fade: ['archi'], circ: true },
  { id: 'prises', n: 'Prises', d: 'Plan des prises de courant', on: ['archi', 'mobilier', 'prises', 'tableau', 'annotations', 'cotations'], fade: ['archi', 'mobilier'], circ: true },
  { id: 'specialises', n: 'Spécialisés', d: 'Plan des équipements spécialisés : cuisson, lavage, chauffage, VMC, volets, recharge', on: ['archi', 'mobilier', 'specialises', 'tableau', 'annotations', 'cotations'], fade: ['archi', 'mobilier'], circ: true },
  { id: 'faibles', n: 'Courants faibles', d: 'Plan des réseaux de communication, accès, alarme et vidéo', on: ['archi', 'faibles', 'tableau', 'annotations', 'cotations'], fade: ['archi'], circ: false },
];
const VUE_BY = new Map(VUES.map((v) => [v.id, v]));

/* ---------------- état d'affichage (réglages de l'appareil) ---------------- */
function etat() {
  if (!Array.isArray(S.calq)) S.calq = [];
  if (!Array.isArray(S.calqFade)) S.calqFade = [];
  return S;
}
function calqueVisible(id) {
  if (id === 'mobilier') return S.layers.furn !== false;
  if (id === 'cotations') return S.layers.dims !== false;
  if (CALQUE_BY.get(id) && CALQUE_BY.get(id).elec && S.layers.elec === false) return false;
  return !etat().calq.includes(id);
}
function setCalqueVisible(id, v) {
  etat();
  if (id === 'mobilier') S.layers.furn = !!v;
  else if (id === 'cotations') S.layers.dims = !!v;
  else {
    S.calq = S.calq.filter((x) => x !== id);
    if (!v) S.calq.push(id);
    else if (CALQUE_BY.get(id) && CALQUE_BY.get(id).elec && S.layers.elec === false) {
      /* électricité coupée d'un bloc (ancien réglage) : on la rallume en ne gardant que ce calque électrique */
      S.layers.elec = true;
      for (const c of CALQUES) if (c.elec && c.id !== id && !S.calq.includes(c.id)) S.calq.push(c.id);
    }
  }
  S.vue = null;
}
/* personnalisation enregistrée dans le plan */
function persoCalque(id, plan) { const p = (plan || P); const o = p && p.calques && p.calques[id]; return o && typeof o === 'object' ? o : {}; }
const calqueVerrouille = (id, plan) => !!persoCalque(id, plan).lock;
function nomCalque(id, plan) { const o = persoCalque(id, plan); return o.nom || (CALQUE_BY.get(id) || {}).n || id; }
function couleurCalque(id, plan) { const o = persoCalque(id, plan); return o.col || null; }
/* opacité d'un calque : celle choisie dans le plan × estompage de la vue */
function opaciteCalque(id, plan) {
  const o = persoCalque(id, plan);
  const op = typeof o.op === 'number' ? o.op : 1;
  return op * (etat().calqFade.includes(id) ? 0.4 : 1);
}

/* vue courante : prédéfinie ou enregistrée dans le plan */
function vuesDuPlan(plan) { const p = plan || P; return (p && Array.isArray(p.vues) ? p.vues : []); }
function vueParId(id, plan) {
  if (VUE_BY.has(id)) return VUE_BY.get(id);
  const v = vuesDuPlan(plan).find((x) => x.id === id);
  return v ? { id: v.id, n: v.nom, d: 'Vue enregistrée dans ce plan', on: CALQUE_IDS.filter((c) => !v.off.includes(c)), fade: v.fade || [], circ: v.circ !== false, circs: v.circs || null, perso: true } : null;
}
/* applique une vue ; renvoie false si elle n'existe pas */
function appliquerVue(id, plan) {
  const v = vueParId(id, plan); if (!v) return false;
  etat();
  S.layers.elec = true;
  S.layers.furn = v.on.includes('mobilier');
  S.layers.dims = v.on.includes('cotations');
  S.calq = CALQUE_IDS.filter((c) => c !== 'mobilier' && c !== 'cotations' && !v.on.includes(c));
  S.calqFade = (v.fade || []).slice();
  S.layers.circ = v.circ !== false;
  S.layers.links = v.on.includes('circuits');
  if (!S.filt || typeof S.filt !== 'object') S.filt = { off: [], circ: null };
  S.filt.off = []; S.filt.circ = null; S.filt.circs = v.circs ? v.circs.slice() : [];
  S.vue = v.id;
  return true;
}
/* vue reconnue à partir de l'état actuel (null si l'utilisateur a modifié l'affichage depuis) */
function vueCourante(plan) { return S.vue && vueParId(S.vue, plan) ? S.vue : null; }
/* état actuel, pour l'enregistrer comme vue */
function etatVue() {
  return { off: CALQUE_IDS.filter((c) => !calqueVisible(c)), fade: etat().calqFade.slice(), circ: S.layers.circ !== false,
    circs: Array.isArray(S.filt && S.filt.circs) && S.filt.circs.length ? S.filt.circs.slice() : undefined };
}
/* exécute fn avec une vue appliquée temporairement (exports), puis rétablit l'affichage */
function avecVue(id, fn, plan) {
  if (!id) return fn();
  const save = JSON.stringify({ layers: S.layers, calq: S.calq || [], fade: S.calqFade || [], filt: S.filt, vue: S.vue || null });
  try { appliquerVue(id, plan); return fn(); }
  finally { const o = JSON.parse(save); for (const k of Object.keys(S.layers)) if (!(k in o.layers)) delete S.layers[k]; Object.assign(S.layers, o.layers); S.calq = o.calq; S.calqFade = o.fade; S.filt = o.filt; S.vue = o.vue; }
}

/* ---------------- nettoyage (migration v12, import) ---------------- */
const COUL = /^#[0-9a-fA-F]{6}$/;
function nettoyerCalques(c) {
  const out = {};
  if (!c || typeof c !== 'object' || Array.isArray(c)) return out;
  for (const id of CALQUE_IDS) {
    const o = c[id]; if (!o || typeof o !== 'object') continue;
    const x = {};
    if (typeof o.nom === 'string' && o.nom.trim()) x.nom = o.nom.trim().slice(0, 40);
    if (typeof o.col === 'string' && COUL.test(o.col) && CALQUE_BY.get(id).couleur !== false) x.col = o.col;
    if (typeof o.op === 'number' && isFinite(o.op) && o.op >= 0.1 && o.op < 1) x.op = Math.round(o.op * 100) / 100;
    if (o.lock === true) x.lock = true;
    if (Object.keys(x).length) out[id] = x;
  }
  return out;
}
function nettoyerVues(l) {
  if (!Array.isArray(l)) return [];
  const out = [];
  for (const v of l) {
    if (!v || typeof v !== 'object' || typeof v.id !== 'string' || !v.id || VUE_BY.has(v.id)) continue;
    const nom = typeof v.nom === 'string' && v.nom.trim() ? v.nom.trim().slice(0, 40) : 'Vue';
    const off = Array.isArray(v.off) ? [...new Set(v.off.filter((x) => CALQUE_IDS.includes(x)))] : [];
    const o = { id: v.id, nom, off };
    const fade = Array.isArray(v.fade) ? [...new Set(v.fade.filter((x) => CALQUE_IDS.includes(x)))] : [];
    if (fade.length) o.fade = fade;
    if (v.circ === false) o.circ = false;
    if (Array.isArray(v.circs)) { const cs = v.circs.filter((x) => typeof x === 'string' && x); if (cs.length) o.circs = [...new Set(cs)]; }
    out.push(o);
    if (out.length >= 30) break;
  }
  return out;
}

export { CALQUES, CALQUE_BY, CALQUE_IDS, VUES, VUE_BY, appliquerVue, avecVue, calqueDeElec, calqueDeGaine, calqueDeType, calqueVerrouille, calqueVisible,
  couleurCalque, etatVue, nettoyerCalques, nettoyerVues, nomCalque, opaciteCalque, persoCalque, setCalqueVisible, vueCourante, vueParId, vuesDuPlan };

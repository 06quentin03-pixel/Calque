/* Calque — module « bibliothèque » : classement des éléments par domaines et sous-catégories.
   Module JavaScript natif, sans accès à l'écran (testable avec Node).
   Il ne crée aucun élément : il range les 71 modèles de mobilier (FURN) et les 176 symboles électriques (ELEC)
   de symboles.js. Un même élément peut apparaître dans plusieurs sous-catégories (ex. le bureau dans
   « Mobilier › Chambre » et dans « Tertiaire › Postes de travail ») ; il n'est jamais copié.
   Les catégories d'origine (FURN_CATS, ELEC_CATS) restent inchangées : les filtres d'affichage les utilisent. */
import { ELEC, ELEC_BY, ELEC_CATS, FURN, FURN_BY } from './symboles.js';

/* furn : clés `k` du mobilier ; elec : types `t` des symboles ; elecCat : toute une catégorie de ELEC_CATS */
const DOMAINES = [
  { id: 'mobilier', name: 'Mobilier', subs: [
    { id: 'm_cuisine', name: 'Cuisine', furn: ['mb60', 'mb40', 'mb80', 'mh60', 'col', 'pt', 'ilot', 'tab4'] },
    { id: 'm_sejour', name: 'Séjour', furn: ['canape2', 'canape3', 'canapeA', 'fauteuil', 'tbasse', 'tv', 'biblio', 'tab6', 'tabR', 'chaise'] },
    { id: 'm_chambre', name: 'Chambre', furn: ['lit90', 'lit140', 'lit160', 'lit180', 'litsup', 'litbb', 'chevet', 'armoire', 'dressing', 'placard', 'commode', 'bureau', 'chbur'] },
    { id: 'm_deco', name: 'Décoration', furn: ['tapis', 'plante'] },
    { id: 'm_divers', name: 'Divers', furn: ['bloc', 'voiture'] },
  ] },
  { id: 'batiment', name: 'Équipements du bâtiment', subs: [
    { id: 'b_sanitaires', name: 'Sanitaires', furn: ['ev1', 'ev2', 'eveg', 'lavabo', 'vasque2', 'lm', 'wc', 'wcs', 'bidet', 'bain', 'bainilot', 'dou90', 'dou120', 'douita'] },
    { id: 'b_electromenager', name: 'Électroménager', furn: ['pl60', 'pl90', 'four', 'lv', 'frigo', 'frigous', 'congel', 'mo', 'hotte', 'll', 'sl'] },
    { id: 'b_chauffage', name: 'Chauffage et eau chaude', furn: ['rad', 'sserv', 'chaud', 'ce', 'poele', 'chem'] },
    { id: 'b_structure', name: 'Structure', furn: ['poteau'] },
    { id: 'b_escaliers', name: 'Escaliers', furn: ['escD', 'escQ', 'escU', 'escH'] },
  ] },
  { id: 'electricite', name: 'Électricité', subs: ELEC_CATS.map((c) => ({ id: 'e_' + c.id, name: c.name, elecCat: c.id })) },
  /* tertiaire : bureaux, salles de réunion, ERP. Renvoie vers des éléments existants (aucun nouveau dessin) */
  { id: 'tertiaire', name: 'Tertiaire', subs: [
    { id: 't_postes', name: 'Postes de travail', furn: ['bureau', 'chbur', 'biblio'], elec: ['pc', 'pc2', 'pc4', 'pc_sol', 'pc_escam', 'pc_usb', 'rj45', 'rj45_2'] },
    { id: 't_reunion', name: 'Salle de réunion', furn: ['tab6', 'tabR', 'chaise'], elec: ['hdmi', 'hp', 'pc_sol', 'wifi'] },
    { id: 't_eclairage', name: 'Éclairage', elec: ['dalle_led', 'reglette', 'spot', 'det_plaf', 'det_pres', 'bp', 'telerupteur', 'minuterie'] },
    { id: 't_cfaible', name: 'Courants faibles', elec: ['baie', 'rj45', 'rj45_2', 'fibre', 'wifi', 'tel', 'hp'] },
    { id: 't_securite', name: 'Sécurité incendie', elec: ['baes', 'declencheur', 'det_chaleur', 'daaf', 'arret_urg', 'sirene'] },
    { id: 't_acces', name: 'Contrôle d’accès et vidéo', elec: ['badge', 'digicode', 'gache', 'interphone', 'platine', 'camera', 'camera_dome', 'nvr'] },
    { id: 't_technique', name: 'Locaux techniques', elec: ['tab_div', 'tableau', 'ccpi', 'sous_compteur', 'onduleur', 'groupe', 'inverseur', 'clim', 'vmc_df'] },
  ] },
];

const DOM_BY = new Map(DOMAINES.map((d) => [d.id, d]));
const SUB_BY = new Map();
for (const d of DOMAINES) for (const s of d.subs) SUB_BY.set(s.id, Object.assign(s, { dom: d.id }));

/* une entrée de bibliothèque : { src: 'furn' | 'elec', key, def } (def = objet d'origine de symboles.js, jamais copié) */
function entry(src, key) {
  const def = src === 'furn' ? FURN_BY.get(key) : ELEC_BY.get(key);
  return def ? { src, key, def } : null;
}
function entriesOf(sub) {
  const s = typeof sub === 'string' ? SUB_BY.get(sub) : sub;
  if (!s) return [];
  const out = [];
  if (s.elecCat) for (const e of ELEC) if (e.cat === s.elecCat) out.push({ src: 'elec', key: e.t, def: e });
  for (const k of s.furn || []) { const x = entry('furn', k); if (x) out.push(x); }
  for (const t of s.elec || []) { const x = entry('elec', t); if (x) out.push(x); }
  return out;
}
/* toutes les entrées, chacune une seule fois, avec son emplacement principal (premier rangement hors « Tertiaire ») */
function allEntries() {
  const seen = new Map();
  for (const d of DOMAINES) for (const s of d.subs) for (const x of entriesOf(s)) {
    const id = x.src + ':' + x.key;
    const prev = seen.get(id);
    if (!prev) seen.set(id, Object.assign(x, { sub: s.id, dom: d.id }));
    else if (prev.dom === 'tertiaire' && d.id !== 'tertiaire') Object.assign(prev, { sub: s.id, dom: d.id });
  }
  return [...seen.values()];
}
/* chemin lisible : « Électricité › Prises » */
function pathOf(subId) { const s = SUB_BY.get(subId); return s ? DOM_BY.get(s.dom).name + ' › ' + s.name : ''; }
/* emplacement principal d'un élément (pour ouvrir la bibliothèque au bon endroit) */
function homeOf(src, key) {
  for (const d of DOMAINES) { if (d.id === 'tertiaire') continue; for (const s of d.subs) if (entriesOf(s).some((x) => x.src === src && x.key === key)) return s.id; }
  return null;
}

/* recherche sans accents ni majuscules ; tous les mots doivent être trouvés */
function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
function searchEntries(q, list) {
  const words = fold(q).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  return (list || allEntries()).filter((x) => {
    const hay = fold([x.def.n, x.def.desc, pathOf(x.sub), x.key, x.def.t].join(' '));
    return words.every((w) => hay.includes(w));
  });
}

export { DOMAINES, DOM_BY, SUB_BY, allEntries, entriesOf, fold, homeOf, pathOf, searchEntries };

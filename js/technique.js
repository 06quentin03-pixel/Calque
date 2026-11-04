/* Calque — module « technique » : bibliothèque technique générique (matériel électrique lisible sur chantier).
   Module JavaScript natif, sans accès à l'écran (testable avec Node).

   Règles (CLAUDE.md, règle 4 : aucune fausse donnée) :
   - Les articles sont GÉNÉRIQUES : uniquement des caractéristiques nominales qui découlent de leur désignation
     (« Disjoncteur 1P+N 20 A courbe C »). Aucun fabricant, aucune référence, aucun prix, aucune valeur de catalogue.
   - La référence fabricant est facultative et n'est jamais remplie par Calque : c'est l'utilisateur qui la saisit
     (ou, plus tard, un import du catalogue qu'il fournit).
   - Chaque article porte un badge de fiabilité :
       verifiee : contrôlée sur un document (fiche ou catalogue du fabricant) ; la source est obligatoire ;
       saisie   : renseignée à la main, non contrôlée (c'est le cas des articles génériques de Calque) ;
       estimee  : valeur approchée, à confirmer. */

const FIAB = [
  { id: 'verifiee', name: 'Vérifiée', desc: 'Contrôlée sur un document du fabricant (source indiquée).' },
  { id: 'saisie', name: 'Saisie', desc: 'Renseignée à la main, non contrôlée sur un document.' },
  { id: 'estimee', name: 'Estimée', desc: 'Valeur approchée, à confirmer.' },
];
const FIAB_BY = new Map(FIAB.map((f) => [f.id, f]));
const GENERIC_SOURCE = 'Bibliothèque générique Calque : caractéristiques nominales, sans référence fabricant.';

const FAMILLES = [
  { id: 'protection', name: 'Protection' },
  { id: 'commande', name: 'Commande et automatismes' },
  { id: 'appareillage', name: 'Appareillage' },
  { id: 'cables', name: 'Câbles et conducteurs' },
  { id: 'conduits', name: 'Conduits' },
  { id: 'boites', name: 'Boîtes et coffrets' },
];
const FAM_BY = new Map(FAMILLES.map((f) => [f.id, f]));

/* nombres à la française : 2,5 */
const fr = (x) => String(x).replace('.', ',');

/* ---- génération des articles génériques ----
   id stable (ne jamais le changer : il est enregistré dans les plans et dans les références de l'utilisateur) */
const ARTICLES = [];
function add(fam, id, n, carac, elec) { ARTICLES.push({ id, fam, n, carac, elec: elec || [] }); }

/* disjoncteurs divisionnaires */
for (const [courbe, cals] of [['B', [6, 10, 16, 20, 25, 32]], ['C', [2, 6, 10, 16, 20, 25, 32, 40]], ['D', [6, 10, 16, 20, 32]]]) {
  for (const cal of cals) add('protection', `dj-1pn-${courbe.toLowerCase()}${cal}`, `Disjoncteur 1P+N ${cal} A courbe ${courbe}`, { appareil: 'disjoncteur', poles: '1P+N', cal, courbe });
}
for (const cal of [10, 16, 20, 25, 32, 40, 63]) add('protection', `dj-3pn-c${cal}`, `Disjoncteur 3P+N ${cal} A courbe C`, { appareil: 'disjoncteur', poles: '3P+N', cal, courbe: 'C' });
/* interrupteurs différentiels */
for (const type of ['AC', 'A', 'F']) for (const cal of [25, 40, 63]) {
  add('protection', `id-2p-${cal}-30-${type.toLowerCase()}`, `Interrupteur différentiel 2P ${cal} A 30 mA type ${type}`, { appareil: 'interrupteur différentiel', poles: '2P', cal, sens: 30, type });
}
for (const type of ['AC', 'A']) for (const cal of [40, 63]) {
  add('protection', `id-4p-${cal}-30-${type.toLowerCase()}`, `Interrupteur différentiel 4P ${cal} A 30 mA type ${type}`, { appareil: 'interrupteur différentiel', poles: '4P', cal, sens: 30, type });
}
/* disjoncteurs différentiels */
for (const type of ['AC', 'A']) for (const cal of [10, 16, 20, 32]) {
  add('protection', `ddr-1pn-c${cal}-30-${type.toLowerCase()}`, `Disjoncteur différentiel 1P+N ${cal} A courbe C 30 mA type ${type}`, { appareil: 'disjoncteur différentiel', poles: '1P+N', cal, courbe: 'C', sens: 30, type });
}
add('protection', 'db-2p-500', 'Disjoncteur de branchement 2P 500 mA', { appareil: 'disjoncteur de branchement', poles: '2P', sens: 500 }, ['db']);
add('protection', 'db-2p-500-s', 'Disjoncteur de branchement 2P 500 mA sélectif', { appareil: 'disjoncteur de branchement', poles: '2P', sens: 500, selectif: true }, ['db']);
add('protection', 'db-4p-500', 'Disjoncteur de branchement 4P 500 mA', { appareil: 'disjoncteur de branchement', poles: '4P', sens: 500 }, ['db']);
add('protection', 'pf-t2-1pn', 'Parafoudre type 2 1P+N', { appareil: 'parafoudre', type: '2', poles: '1P+N' }, ['parafoudre']);
add('protection', 'pf-t2-3pn', 'Parafoudre type 2 3P+N', { appareil: 'parafoudre', type: '2', poles: '3P+N' }, ['parafoudre']);

/* commande */
add('commande', 'tlr-16-1f', 'Télérupteur 16 A unipolaire', { appareil: 'télérupteur', cal: 16, poles: '1P' }, ['telerupteur']);
add('commande', 'ct-2p-20-hc', 'Contacteur jour/nuit 2P 20 A', { appareil: 'contacteur', cal: 20, poles: '2P' }, ['contacteur_hc']);
add('commande', 'ct-2p-25-hc', 'Contacteur jour/nuit 2P 25 A', { appareil: 'contacteur', cal: 25, poles: '2P' }, ['contacteur_hc']);
add('commande', 'ct-4p-25', 'Contacteur 4P 25 A', { appareil: 'contacteur', cal: 25, poles: '4P' }, ['contacteur_hc']);
add('commande', 'min-mod', 'Minuterie modulaire', { appareil: 'minuterie' }, ['minuterie']);
add('commande', 'ih-mod', 'Interrupteur horaire modulaire', { appareil: 'interrupteur horaire' }, ['horloge']);

/* appareillage */
const SOCKET_TYPES = ['pc', 'pc2', 'pc3', 'pc4', 'pc_pt', 'pc20', 'pc_cmd', 'pc_hotte', 'pc_ll', 'pc_lv', 'pc_sl', 'pc_four', 'pc_cg', 'pc_frigo', 'pc_mo', 'pc_inter', 'pc_sol'];
add('appareillage', 'pc-2pt-16', 'Prise de courant 2P+T 16 A', { appareil: 'prise', poles: '2P+T', cal: 16 }, SOCKET_TYPES);
add('appareillage', 'pc-2pt-16-ip44', 'Prise de courant 2P+T 16 A étanche IP44', { appareil: 'prise', poles: '2P+T', cal: 16, ip: 'IP44' }, ['pc_ip', 'pc_jardin']);
add('appareillage', 'pc-2pt-16-usb', 'Prise de courant 2P+T 16 A avec chargeur USB', { appareil: 'prise', poles: '2P+T', cal: 16 }, ['pc_usb']);
add('appareillage', 'pc-3pnt-20', 'Prise triphasée 3P+N+T 20 A', { appareil: 'prise', poles: '3P+N+T', cal: 20 }, ['pc_tri']);
add('appareillage', 'pc-3pnt-32', 'Prise triphasée 3P+N+T 32 A', { appareil: 'prise', poles: '3P+N+T', cal: 32 }, ['pc_tri']);
add('appareillage', 'sc-32', 'Boîtier de sortie de câble 32 A', { appareil: 'sortie de câble', cal: 32 }, ['pc32', 'sortie']);
add('appareillage', 'int-sa-10', 'Interrupteur simple allumage 10 A', { appareil: 'interrupteur', cal: 10 }, ['int_s', 'int_voy', 'int_ip']);
add('appareillage', 'int-da-10', 'Interrupteur double allumage 10 A', { appareil: 'interrupteur', cal: 10 }, ['int_d']);
add('appareillage', 'int-vv-10', 'Interrupteur va-et-vient 10 A', { appareil: 'interrupteur', cal: 10 }, ['int_vv', 'vv_double', 'int_voy', 'int_ip']);
add('appareillage', 'int-bip-10', 'Interrupteur bipolaire 10 A', { appareil: 'interrupteur', cal: 10, poles: '2P' }, ['int_bip']);
add('appareillage', 'perm-10', 'Permutateur 10 A', { appareil: 'interrupteur', cal: 10 }, ['permut']);
add('appareillage', 'bp-10', 'Bouton-poussoir 10 A', { appareil: 'bouton-poussoir', cal: 10 }, ['bp', 'bp_voy']);
add('appareillage', 'rj45-c6', 'Prise RJ45 catégorie 6', { appareil: 'prise de communication', cat: '6' }, ['rj45', 'rj45_2', 'rj45_tv']);
add('appareillage', 'rj45-c6a', 'Prise RJ45 catégorie 6A', { appareil: 'prise de communication', cat: '6A' }, ['rj45', 'rj45_2', 'rj45_tv']);
add('appareillage', 'tv-coax', 'Prise TV coaxiale', { appareil: 'prise TV' }, ['tv', 'rj45_tv']);
add('appareillage', 'tv-sat', 'Prise TV + satellite', { appareil: 'prise TV' }, ['sat']);

/* câbles et conducteurs (sections en mm²) */
for (const c of ['3G1.5', '3G2.5', '3G6', '3G10', '5G1.5', '5G2.5', '5G6', '5G10']) {
  const [n, s] = c.split('G');
  add('cables', `r2v-${n}g${s.replace('.', '')}`, `Câble U-1000 R2V ${n}G${fr(s)} mm²`, { appareil: 'câble', ame: 'cuivre', conducteurs: +n, section: +s });
}
for (const s of [1.5, 2.5]) add('cables', `h07vu-${String(s).replace('.', '')}`, `Conducteur H07V-U ${fr(s)} mm²`, { appareil: 'conducteur', ame: 'cuivre rigide', section: s });
for (const s of [6, 10, 16, 25]) add('cables', `h07vr-${s}`, `Conducteur H07V-R ${s} mm²`, { appareil: 'conducteur', ame: 'cuivre câblé', section: s });
add('cables', 'cat6-futp', 'Câble réseau F/UTP catégorie 6', { appareil: 'câble de communication', cat: '6' });
add('cables', 'cat6a-sftp', 'Câble réseau S/FTP catégorie 6A', { appareil: 'câble de communication', cat: '6A' });
add('cables', 'coax-17vatc', 'Câble coaxial 17 VATC', { appareil: 'câble coaxial' });

/* conduits (diamètres en mm) */
for (const d of [16, 20, 25, 32]) add('conduits', `icta-${d}`, `Conduit ICTA Ø${d}`, { appareil: 'conduit', sys: 'icta', dia: d });
for (const d of [16, 20, 25, 32]) add('conduits', `irl-${d}`, `Tube IRL Ø${d}`, { appareil: 'conduit', sys: 'irl', dia: d });
for (const d of [40, 63, 90]) add('conduits', `tpc-${d}`, `Gaine TPC Ø${d}`, { appareil: 'conduit', sys: 'tpc', dia: d });

/* boîtes et coffrets */
add('boites', 'be-67-40', 'Boîte d’encastrement Ø67 profondeur 40 mm', { appareil: 'boîte', dia: 67, prof: 40 });
add('boites', 'be-67-50', 'Boîte d’encastrement Ø67 profondeur 50 mm', { appareil: 'boîte', dia: 67, prof: 50 });
add('boites', 'bd', 'Boîte de dérivation', { appareil: 'boîte de dérivation' }, ['derivation']);
for (const r of [1, 2, 3, 4]) add('boites', `cof-${r}r13`, `Coffret ${r} rangée${r > 1 ? 's' : ''} de 13 modules`, { appareil: 'coffret', rangees: r, modules: 13 }, ['tableau', 'tab_div']);
add('boites', 'gtl-250', 'Gaine technique logement (GTL) 250 mm', { appareil: 'GTL', larg: 250 }, ['gtl']);

const ART_BY = new Map(ARTICLES.map((a) => [a.id, a]));

/* ---- références de l'utilisateur ----
   refs : { [idArticle]: { ref, fab, fiab, source, note, at } }  (enregistrées sur l'appareil, voir mabiblio.js)
   Une référence ne modifie jamais l'article générique : elle s'y ajoute. */
function cleanRef(r) {
  if (!r || typeof r !== 'object') return null;
  const s = (v) => (typeof v === 'string' ? v.trim().slice(0, 200) : '');
  const out = { ref: s(r.ref), fab: s(r.fab), fiab: FIAB_BY.has(r.fiab) ? r.fiab : 'saisie', source: s(r.source), note: s(r.note), at: Number.isFinite(r.at) ? r.at : 0 };
  if (out.fiab === 'verifiee' && !out.source) out.fiab = 'saisie'; // « vérifiée » sans source n'est pas permis
  if (!out.ref && !out.fab && !out.note && out.fiab === 'saisie' && !out.source) return null; // rien à garder
  return out;
}
/* vue complète d'un article : générique + référence éventuelle de l'utilisateur */
function articleView(id, refs) {
  const a = ART_BY.get(id); if (!a) return null;
  const r = refs && refs[id] ? cleanRef(refs[id]) : null;
  return {
    id, fam: a.fam, n: a.n, carac: a.carac, elec: a.elec, generic: true,
    ref: r ? r.ref : '', fab: r ? r.fab : '', note: r ? r.note : '',
    fiab: r ? r.fiab : 'saisie', source: r && r.source ? r.source : GENERIC_SOURCE, userSource: r ? r.source : '',
  };
}
function articlesFor(elecType) { return ARTICLES.filter((a) => a.elec.includes(elecType)); }
/* abréviations de chantier */
const ALIAS = { 'disjoncteur': 'dj disj', 'interrupteur différentiel': 'id inter diff', 'disjoncteur différentiel': 'ddr disj diff', 'disjoncteur de branchement': 'agcp', 'télérupteur': 'tlr', 'contacteur': 'hc', 'parafoudre': 'pf' };
function fold(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
/* recherche : désignation, famille, référence et fabricant saisis ; « 20a courbe c » trouve « 20 A courbe C » */
function searchArticles(q, refs, list) {
  const words = fold(q).replace(/(\d)\s*(a|ma|mm)\b/g, '$1 $2').split(/\s+/).filter(Boolean);
  const src = list || ARTICLES.map((a) => articleView(a.id, refs));
  if (!words.length) return src;
  return src.filter((v) => {
    const hay = fold([v.n, (FAM_BY.get(v.fam) || {}).name, ALIAS[v.carac.appareil] || '', v.ref, v.fab, v.note].join(' ')).replace(/,/g, '.');
    const toks = new Set(hay.split(/[\s()/+·ø-]+/));
    /* un mot très court (« c », « 20 ») doit être un mot entier : « courbe c » ne trouve pas « courbe B » */
    return words.every((w0) => { const w = w0.replace(/,/g, '.'); return w.length <= 2 ? toks.has(w) : hay.includes(w); });
  });
}
/* fusion de références (import d'une sauvegarde) : n'écrase jamais une référence déjà saisie */
function mergeRefs(mine, theirs) {
  const out = Object.assign({}, mine || {});
  let added = 0, same = 0, kept = 0;
  for (const [id, r0] of Object.entries(theirs || {})) {
    const r = cleanRef(r0); if (!r || !ART_BY.has(id)) continue;
    const cur = out[id] && cleanRef(out[id]);
    if (!cur) { out[id] = r; added++; continue; }
    const k = (x) => JSON.stringify([x.ref, x.fab, x.fiab, x.source, x.note]);
    if (k(cur) === k(r)) same++; else kept++;
  }
  return { refs: out, added, same, kept };
}

export { ARTICLES, ART_BY, FAMILLES, FAM_BY, FIAB, FIAB_BY, GENERIC_SOURCE, articleView, articlesFor, cleanRef, mergeRefs,
  searchArticles };

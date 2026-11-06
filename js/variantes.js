/* Calque — module « variantes » : variantes d'un projet (phase 7, étape 2). SANS ÉCRAN (testable avec Node).

   Une variante (économique, standard, haut de gamme…) est une autre version de la partie électrique du même bâtiment.
   Les murs, ouvertures, pièces, mobilier, cotes, textes, fonds de plan, photométries et le suivi de chantier sont
   COMMUNS à toutes les variantes ; chaque variante a ses propres symboles, circuits, différentiels, liaisons, gaines,
   études d'éclairage et réglages d'installation (CLES_VARIANTE).

   Format (v10) : plan.variantes = { active, principale, liste: [{ id, nom, gamme, note, cree, maj, data }] }
   - la variante « active » est celle qui est dans le plan (plan.elec, plan.circuits…) : son `data` est absent ;
   - chaque autre variante garde sa partie électrique dans `data` ;
   - `principale` : la version retenue (choisie par l'utilisateur).
   Les opérations renvoient toujours un NOUVEL objet `variantes` (jamais modifié sur place) : l'annuler / rétablir
   peut ainsi réutiliser son texte d'une étape à l'autre sans le recopier. Aucune opération ne perd de variante :
   la suppression est refusée pour la variante affichée et la principale (l'écran garde une copie dans l'historique). */
import { bilanDuPlan } from './calcul.js';
import { listeMateriel } from './materiel.js';
import { implantationActuelle } from './eclairage.js';
import { ELEC_BY } from './symboles.js';

const CLES_VARIANTE = ['elec', 'circuits', 'rcds', 'links', 'ducts', 'etudes', 'install'];
const GAMMES = [
  { v: 'eco', n: 'Économique' }, { v: 'std', n: 'Standard' }, { v: 'haut', n: 'Haut de gamme' }, { v: 'autre', n: 'Autre' },
];
const GAMME_BY = new Map(GAMMES.map((g) => [g.v, g]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const txt = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 80) : '');
const nid = () => 'va' + Math.random().toString(36).slice(2, 9);

/* partie électrique d'un plan (copie) */
function extraire(plan) {
  const d = {};
  for (const k of CLES_VARIANTE) d[k] = clone(plan[k] === undefined ? (k === 'install' ? {} : []) : plan[k]);
  return d;
}
/* remplace la partie électrique du plan (copie) */
function appliquer(plan, data) {
  for (const k of CLES_VARIANTE) plan[k] = clone(data[k] === undefined ? (k === 'install' ? {} : []) : data[k]);
}
function dataValide(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return null;
  const o = {};
  for (const k of CLES_VARIANTE) {
    if (k === 'install') o.install = d.install && typeof d.install === 'object' && !Array.isArray(d.install) ? d.install : {};
    else o[k] = Array.isArray(d[k]) ? d[k].filter((x) => x && typeof x === 'object') : [];
  }
  return o;
}
/* nettoyage (migration v9 → v10, import) : sans variantes → null ; une variante n'est jamais jetée si elle a des données */
function nettoyerVariantes(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.liste)) return null;
  const liste = [], vus = new Set();
  for (const x of v.liste) {
    if (!x || typeof x !== 'object') continue;
    let id = typeof x.id === 'string' && x.id && x.id.length <= 40 ? x.id : nid();
    while (vus.has(id)) id = nid();
    vus.add(id);
    const e = { id, nom: txt(x.nom) || 'Variante', gamme: GAMME_BY.has(x.gamme) ? x.gamme : 'autre' };
    const note = txt(x.note, 300); if (note) e.note = note;
    for (const k of ['cree', 'maj']) if (typeof x[k] === 'number' && Number.isFinite(x[k]) && x[k] > 0) e[k] = x[k];
    const d = dataValide(x.data); if (d) e.data = d;
    liste.push(e);
  }
  if (!liste.length) return null;
  let active = liste.find((e) => e.id === v.active && !e.data) || liste.find((e) => !e.data);
  if (!active) {
    // toutes les variantes ont des données : la partie électrique du plan devient une variante de plus (rien n'est perdu)
    active = { id: nid(), nom: 'Variante affichée (récupérée)', gamme: 'autre' }; liste.push(active);
  }
  for (const e of liste) if (e !== active && !e.data) e.data = null; // incohérent : marquée « sans données » (signalée)
  const out = { active: active.id, principale: liste.some((e) => e.id === v.principale) ? v.principale : active.id, liste };
  for (const e of out.liste) if (e.data === null) { delete e.data; e.vide = true; }
  return out;
}

/* ---------------- opérations (renvoient un nouvel objet `variantes`) ---------------- */
function variantesDe(plan) { return plan.variantes && Array.isArray(plan.variantes.liste) && plan.variantes.liste.length ? plan.variantes : null; }
function copie(v) { return { active: v.active, principale: v.principale, liste: v.liste.map((e) => Object.assign({}, e)) }; }
/* première variante : la partie électrique actuelle devient « Standard » (ou le nom donné), principale et affichée */
function initialiser(plan, o) {
  if (variantesDe(plan)) return plan.variantes;
  const at = (o && o.at) || Date.now();
  const e = { id: nid(), nom: txt(o && o.nom) || 'Standard', gamme: (o && GAMME_BY.has(o.gamme) && o.gamme) || 'std', cree: at, maj: at };
  plan.variantes = { active: e.id, principale: e.id, liste: [e] };
  return plan.variantes;
}
/* nouvelle variante, copie d'une variante existante (par défaut la variante affichée) ; ne change pas l'affichage */
function dupliquer(plan, o) {
  initialiser(plan, {});
  const v = copie(plan.variantes), src = v.liste.find((e) => e.id === ((o && o.source) || v.active));
  if (!src) return null;
  const at = (o && o.at) || Date.now();
  const e = { id: nid(), nom: txt(o && o.nom) || src.nom + ' (copie)', gamme: (o && GAMME_BY.has(o.gamme) && o.gamme) || src.gamme, cree: at, maj: at,
    data: src.id === v.active ? extraire(plan) : clone(src.data || extraire({})) };
  v.liste.push(e);
  plan.variantes = v;
  return e;
}
/* affiche une autre variante : la partie électrique actuelle est rangée dans sa variante, l'autre est mise dans le plan */
function basculer(plan, id, at) {
  const v0 = variantesDe(plan); if (!v0 || v0.active === id) return false;
  const v = copie(v0), cur = v.liste.find((e) => e.id === v.active), dst = v.liste.find((e) => e.id === id);
  if (!dst || !dst.data) return false;
  cur.data = extraire(plan); cur.maj = at || Date.now();
  appliquer(plan, dst.data); delete dst.data;
  v.active = id;
  plan.variantes = v;
  return true;
}
function choisirPrincipale(plan, id) {
  const v0 = variantesDe(plan); if (!v0 || !v0.liste.some((e) => e.id === id) || v0.principale === id) return false;
  const v = copie(v0); v.principale = id; plan.variantes = v; return true;
}
function modifier(plan, id, champs) {
  const v0 = variantesDe(plan); if (!v0) return false;
  const v = copie(v0), e = v.liste.find((x) => x.id === id); if (!e) return false;
  if (champs.nom != null) { const n = txt(champs.nom); if (n) e.nom = n; }
  if (champs.gamme != null && GAMME_BY.has(champs.gamme)) e.gamme = champs.gamme;
  if (champs.note != null) { const n = txt(champs.note, 300); if (n) e.note = n; else delete e.note; }
  e.maj = Date.now();
  plan.variantes = v; return true;
}
/* suppression : refusée pour la variante affichée et la principale ; renvoie la variante retirée */
function supprimer(plan, id) {
  const v0 = variantesDe(plan); if (!v0 || id === v0.active || id === v0.principale) return null;
  const e = v0.liste.find((x) => x.id === id); if (!e) return null;
  const v = copie(v0); v.liste = v.liste.filter((x) => x.id !== id);
  plan.variantes = v.liste.length ? v : null;
  return e;
}
/* plan complet d'une variante (pour comparer) : partie commune du plan + partie électrique de la variante */
function planDe(plan, id) {
  const v = variantesDe(plan);
  if (!v || id === v.active) return plan;
  const e = v.liste.find((x) => x.id === id); if (!e || !e.data) return null;
  return Object.assign({}, plan, e.data);
}
const nomVariante = (e) => e.nom + (GAMME_BY.has(e.gamme) && e.gamme !== 'autre' && GAMME_BY.get(e.gamme).n !== e.nom ? ` (${GAMME_BY.get(e.gamme).n.toLowerCase()})` : '');

/* ---------------- comparaison ---------------- */
/* résumé d'un plan : appareils, circuits, puissance, éclairage, matériel, contrôles.
   opts.pieceDe(étiquette) → { poly, holes, area } (géométrie commune) ; opts.rapport(plan) → rapport du moteur de règles */
function resume(plan, opts) {
  const o = opts || {};
  const els = plan.elec || [];
  const types = new Map(); for (const e of els) types.set(e.type, (types.get(e.type) || 0) + 1);
  const lums = els.filter((e) => { const d = ELEC_BY.get(e.type); return d && d.cat === 'eclairage'; });
  const lumP = lums.filter((e) => e.lum && e.lum.p && Number.isFinite(e.lum.p.v));
  const b = bilanDuPlan(plan);
  const etudes = [];
  for (const et of plan.etudes || []) {
    const lbl = (plan.rooms || []).find((r) => r.id === et.room), L = (plan.levels || []).find((l) => l.id === et.lv);
    const piece = lbl && L && o.pieceDe ? o.pieceDe(lbl) : null;
    if (!piece) { etudes.push({ room: et.room, nom: lbl ? lbl.name : 'Pièce supprimée', res: null }); continue; }
    const ia = implantationActuelle(et, piece, L, els.filter((e) => e.lv === et.lv), plan.photometries || []);
    etudes.push({ room: et.room, nom: lbl.name, E: et.E ? et.E.v : null, n: ia.n, res: ia.res ? { Emoy: ia.res.Emoy, P: ia.res.P, U0: ia.res.U0 } : null });
  }
  const mat = listeMateriel(plan);
  const rap = o.rapport ? o.rapport(plan) : null;
  return {
    appareils: els.length, types, circuits: (plan.circuits || []).length, differentiels: (plan.rcds || []).length,
    puissance: { P: b.Pinstallee, S: b.Sinstallee, Sappelee: b.Sappelee, complet: b.complet, manquants: b.manquantes.length },
    eclairage: { n: lums.length, pConnue: lumP.length, P: lumP.reduce((s, e) => s + e.lum.p.v, 0), etudes },
    materiel: mat.lignes.map((l) => ({ cle: l.cat + ' · ' + l.des, qte: l.qte, unite: l.unite, st: l.st })),
    controles: rap ? { ...rap.synthese, global: rap.global } : null,
  };
}
/* tableau de comparaison de toutes les variantes : lignes { groupe, nom, vals[], st } */
function comparer(plan, opts) {
  const v = variantesDe(plan); if (!v) return null;
  const cols = [], res = [];
  for (const e of v.liste) {
    const p = planDe(plan, e.id); if (!p) continue;
    cols.push({ id: e.id, nom: e.nom, gamme: e.gamme, principale: e.id === v.principale, active: e.id === v.active });
    res.push(resume(p, opts));
  }
  const lignes = [], L = (groupe, nom, f, st) => lignes.push({ groupe, nom, vals: res.map(f), st: st || null });
  const n0 = (x) => (x == null ? null : x);
  L('Appareils et tableau', 'Appareils (symboles)', (r) => r.appareils);
  L('Appareils et tableau', 'Circuits', (r) => r.circuits);
  L('Appareils et tableau', 'Interrupteurs différentiels', (r) => r.differentiels);
  const tousTypes = new Set(); for (const r of res) for (const t of r.types.keys()) tousTypes.add(t);
  for (const t of [...tousTypes].sort((a, b) => ((ELEC_BY.get(a) || {}).n || a).localeCompare((ELEC_BY.get(b) || {}).n || b, 'fr'))) {
    const vals = res.map((r) => r.types.get(t) || 0);
    if (vals.some((x) => x !== vals[0])) lignes.push({ groupe: 'Appareils qui diffèrent', nom: (ELEC_BY.get(t) || {}).n || t, vals, st: null });
  }
  L('Puissance', 'Puissance active installée (W)', (r) => Math.round(r.puissance.P), 'calcul');
  L('Puissance', 'Puissance apparente appelée (VA)', (r) => n0(r.puissance.Sappelee != null ? Math.round(r.puissance.Sappelee) : null), 'calcul');
  L('Puissance', 'Circuits sans données de puissance', (r) => r.puissance.manquants);
  L('Éclairage', 'Points d’éclairage', (r) => r.eclairage.n);
  L('Éclairage', 'Puissance des luminaires dont la puissance est connue (W)', (r) => Math.round(r.eclairage.P), 'saisie');
  L('Éclairage', 'Luminaires sans puissance connue', (r) => r.eclairage.n - r.eclairage.pConnue);
  const rooms = new Map(); for (const r of res) for (const e of r.eclairage.etudes) if (!rooms.has(e.room)) rooms.set(e.room, e.nom);
  for (const [room, nom] of rooms) {
    L('Éclairage', `${nom} : éclairement moyen (lx)`, (r) => { const e = r.eclairage.etudes.find((x) => x.room === room); return e && e.res ? Math.round(e.res.Emoy) : null; }, 'estimee');
  }
  const cles = new Set(); for (const r of res) for (const m of r.materiel) cles.add(m.cle);
  for (const k of cles) {
    const unite = (res.map((r) => r.materiel.find((m) => m.cle === k)).find(Boolean) || {}).unite || '';
    L('Matériel (estimation)', `${k} (${unite})`, (r) => { const m = r.materiel.find((x) => x.cle === k); return m ? m.qte : 0; }, 'estimee');
  }
  if (res.some((r) => r.controles)) {
    L('Contrôles NF C 15-100', 'Non conformes', (r) => (r.controles ? r.controles.non_conforme : null));
    L('Contrôles NF C 15-100', 'Vérification nécessaire', (r) => (r.controles ? r.controles.verification : null));
    L('Contrôles NF C 15-100', 'Conformes (règles à source vérifiée)', (r) => (r.controles ? r.controles.conforme : null));
  }
  return { cols, lignes, globaux: res.map((r) => (r.controles ? r.controles.global : null)) };
}

export { CLES_VARIANTE, GAMMES, GAMME_BY, appliquer, basculer, choisirPrincipale, comparer, dupliquer, extraire, initialiser, modifier,
  nettoyerVariantes, nomVariante, planDe, resume, supprimer, variantesDe };

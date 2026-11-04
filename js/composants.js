/* Calque — module « composants » : composants personnalisés créés par l'utilisateur.
   Module JavaScript natif, sans accès à l'écran (testable avec Node).

   Un composant reprend l'apparence d'un modèle existant (meuble de FURN ou symbole de ELEC) et y ajoute
   ses propres valeurs : nom, dimensions ou hauteur de pose, marquage, informations techniques.
   Sur le plan, l'objet posé garde le type du modèle : circuits, tableau, contrôles et 3D le traitent comme
   ce modèle. Il porte en plus `comp` (identifiant du composant) et, pour un symbole, `mark` (marquage affiché).

   Où il est enregistré :
   - dans la bibliothèque de l'appareil (mabiblio.js), incluse dans « Sauvegarder tous mes plans » ;
   - dans chaque plan qui l'utilise (P.comps, copie) : le plan s'ouvre partout, même sans la bibliothèque. */
import { ELEC_BY, FURN_BY, isStair } from './symboles.js';
import { FIAB_BY } from './technique.js';

const COMP_RANGEMENTS = [
  { id: 'mobilier', name: 'Mobilier' },
  { id: 'batiment', name: 'Équipements du bâtiment' },
  { id: 'electricite', name: 'Électricité' },
  { id: 'tertiaire', name: 'Tertiaire' },
];
const MARK_MAX = 8;

const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n || 200) : '');
const num = (v, lo, hi) => (Number.isFinite(v) && v >= lo && v <= hi ? Math.round(v * 10) / 10 : null);

/* contrôle et nettoyage d'un composant ; null s'il est inutilisable (nom ou modèle manquant) */
function cleanComp(c) {
  if (!c || typeof c !== 'object') return null;
  const kind = c.kind === 'elec' ? 'elec' : c.kind === 'furn' ? 'furn' : null;
  const id = str(c.id, 60), n = str(c.n, 80);
  if (!kind || !id || !n) return null;
  const base = str(c.base, 40);
  const bdef = kind === 'elec' ? ELEC_BY.get(base) : FURN_BY.get(base);
  if (!bdef || (kind === 'furn' && isStair(bdef.t))) return null;
  const out = { id, kind, n, base, rang: COMP_RANGEMENTS.some((r) => r.id === c.rang) ? c.rang : kind === 'elec' ? 'electricite' : 'mobilier', desc: str(c.desc, 400), at: Number.isFinite(c.at) ? c.at : 0 };
  if (kind === 'furn') { out.w = num(c.w, 1, 5000) || bdef.w; out.d = num(c.d, 1, 5000) || bdef.d; }
  else { out.h = c.h === null ? null : num(c.h, 0, 600); if (out.h == null && c.h !== null) out.h = bdef.h ?? null; out.mark = str(c.mark, MARK_MAX); }
  const t = c.tech && typeof c.tech === 'object' ? c.tech : {};
  const tech = { desig: str(t.desig, 160), ref: str(t.ref), fab: str(t.fab), fiab: FIAB_BY.has(t.fiab) ? t.fiab : 'saisie', source: str(t.source) };
  if (tech.fiab === 'verifiee' && !tech.source) tech.fiab = 'saisie';
  if (tech.desig || tech.ref || tech.fab || tech.source || tech.fiab !== 'saisie') out.tech = tech;
  return out;
}
/* même contenu (la date de modification ne compte pas) */
const sameComp = (a, b) => { const k = (x) => JSON.stringify(Object.assign({}, x, { at: 0 })); return k(a) === k(b); };
/* même contenu, quel que soit l'identifiant (une copie déjà importée n'est pas réimportée) */
const sameContent = (a, b) => { const k = (x) => JSON.stringify(Object.assign({}, x, { id: '', at: 0, n: x.n.replace(/ \(importé\)$/, '') })); return k(a) === k(b); };

/* fusion (import d'une sauvegarde ou ajout depuis un plan) : n'écrase jamais un composant existant.
   Même identifiant et contenu différent → ajouté comme copie, avec un nouvel identifiant. */
function mergeComps(mine, theirs, newId) {
  const out = (mine || []).slice();
  let added = 0, same = 0, copies = 0;
  const mkId = newId || (() => 'cp' + Math.random().toString(36).slice(2, 10));
  for (const c0 of Array.isArray(theirs) ? theirs : []) {
    const c = cleanComp(c0); if (!c) continue;
    const cur = out.find((x) => x.id === c.id);
    if (!cur) { out.push(c); added++; continue; }
    if (out.some((x) => sameContent(x, c))) { same++; continue; }
    out.push(Object.assign({}, c, { id: mkId(), n: c.n + ' (importé)' })); copies++;
  }
  return { comps: out, added, same, copies };
}

/* applique un composant à l'objet qui vient d'être créé depuis son modèle */
function applyComp(o, comp) {
  o.comp = comp.id;
  if (comp.kind === 'furn') {
    o.name = comp.n; o.w = comp.w; o.d = comp.d;
    if (comp.base === 'bloc') o.label = comp.n; // un bloc libre n'a pas de dessin : on affiche son nom
  } else {
    o.h = comp.h;
    if (comp.mark) o.mark = comp.mark; else delete o.mark;
  }
  return o;
}
/* copie du composant dans le plan (remplace l'ancienne copie du même composant) */
function upsertPlanComp(p, comp) {
  if (!Array.isArray(p.comps)) p.comps = [];
  const i = p.comps.findIndex((x) => x.id === comp.id);
  const c = JSON.parse(JSON.stringify(comp));
  if (i >= 0) p.comps[i] = c; else p.comps.push(c);
}
/* copies devenues inutiles (plus aucun objet du plan ne s'en sert) */
function unusedPlanComps(p) {
  const used = new Set([...(p.items || []), ...(p.elec || [])].map((o) => o && o.comp).filter(Boolean));
  return (p.comps || []).filter((c) => !used.has(c.id));
}

export { COMP_RANGEMENTS, MARK_MAX, applyComp, cleanComp, mergeComps, sameComp, unusedPlanComps, upsertPlanComp };

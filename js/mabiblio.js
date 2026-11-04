/* Calque — module « ma bibliothèque » : ce que l'utilisateur ajoute aux bibliothèques, enregistré sur l'appareil.
   - refs  : références fabricant saisies sur les articles techniques génériques (voir technique.js) ;
   - comps : composants personnalisés (voir composants.js).
   Enregistrement : IndexedDB (magasin « meta », clé « biblio »), avec une copie de secours dans localStorage
   (« calque.biblio »). Chaque écriture est vérifiée. Ces données sont incluses dans « Sauvegarder tous mes plans ».
   Elles sont propres à l'appareil : elles ne font pas partie d'un plan (un plan garde sa propre copie des
   composants personnalisés qu'il utilise, pour s'ouvrir partout). */
import { DB, lsGet, lsSet } from './stockage.js';
import { cleanRef, mergeRefs } from './technique.js';
import { cleanComp, mergeComps } from './composants.js';

const UL = { refs: {}, comps: [], savedAt: 0, loaded: false };

function readLS() { try { const o = JSON.parse(lsGet('calque.biblio') || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
function sanitize(o) {
  const refs = {};
  if (o && o.refs && typeof o.refs === 'object') for (const [k, r] of Object.entries(o.refs)) { const c = cleanRef(r); if (c) refs[k] = c; }
  const comps = Array.isArray(o && o.comps) ? o.comps.map(cleanComp).filter(Boolean) : [];
  return { refs, comps, savedAt: o && Number.isFinite(o.savedAt) ? o.savedAt : 0 };
}
/* au démarrage : la copie la plus récente entre IndexedDB et localStorage */
async function loadUserLib() {
  let a = null;
  if (DB.ok) { try { const r = await DB.get('meta', 'biblio'); a = r ? r.v : null; } catch (e) { } }
  const b = readLS();
  const best = [a, b].filter(Boolean).sort((x, y) => (y.savedAt || 0) - (x.savedAt || 0))[0];
  Object.assign(UL, sanitize(best), { loaded: true });
  return UL;
}
/* enregistre ; renvoie true si au moins une écriture a réussi */
async function saveUserLib() {
  UL.savedAt = Date.now();
  const v = { refs: UL.refs, comps: UL.comps, savedAt: UL.savedAt };
  let idb = false;
  if (DB.ok) { try { await DB.tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put({ k: 'biblio', v }); }); idb = true; } catch (e) { } }
  const ls = lsSet('calque.biblio', JSON.stringify(v));
  return idb || ls;
}
function setRef(id, r) {
  const c = cleanRef(Object.assign({}, r, { at: Date.now() }));
  if (c) UL.refs[id] = c; else delete UL.refs[id];
  return saveUserLib();
}
/* composants personnalisés : ajout ou modification ; renvoie le composant nettoyé (ou null si invalide) */
async function saveComp(c) {
  const clean = cleanComp(Object.assign({}, c, { at: Date.now() }));
  if (!clean) return { ok: false, comp: null };
  const i = UL.comps.findIndex((x) => x.id === clean.id);
  const prev = i >= 0 ? UL.comps[i] : null;
  if (i >= 0) UL.comps[i] = clean; else UL.comps.push(clean);
  const ok = await saveUserLib();
  if (!ok) { if (prev) UL.comps[i] = prev; else UL.comps.pop(); } // rien n'est annoncé comme enregistré à tort
  return { ok, comp: ok ? clean : null };
}
/* retire le composant de la bibliothèque (les plans qui l'utilisent gardent leur copie) */
async function deleteComp(id) {
  const prev = UL.comps;
  UL.comps = UL.comps.filter((x) => x.id !== id);
  const ok = await saveUserLib();
  if (!ok) UL.comps = prev;
  return ok;
}
const compById = (id) => UL.comps.find((x) => x.id === id) || null;
/* pour la sauvegarde complète */
function exportUserLib() { return { refs: UL.refs, comps: UL.comps }; }
/* import d'une sauvegarde : ajoute, ne remplace jamais */
async function importUserLib(o) {
  if (!o || typeof o !== 'object') return null;
  const r = mergeRefs(UL.refs, o.refs);
  const c = mergeComps(UL.comps, o.comps);
  UL.refs = r.refs; UL.comps = c.comps;
  const ok = r.added + c.added + c.copies > 0 ? await saveUserLib() : true;
  return { ok, refs: r, comps: c };
}

export { UL, compById, deleteComp, exportUserLib, importUserLib, loadUserLib, saveComp, saveUserLib, setRef };

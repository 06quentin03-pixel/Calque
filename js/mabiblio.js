/* Calque — module « ma bibliothèque » : ce que l'utilisateur ajoute aux bibliothèques, enregistré sur l'appareil.
   - refs  : références fabricant saisies sur les articles techniques génériques (voir technique.js) ;
   - comps : composants personnalisés (voir composants.js).
   Enregistrement : IndexedDB (magasin « meta », clé « biblio »), avec une copie de secours dans localStorage
   (« calque.biblio »). Chaque écriture est vérifiée. Ces données sont incluses dans « Sauvegarder tous mes plans ».
   Elles sont propres à l'appareil : elles ne font pas partie d'un plan (un plan garde sa propre copie des
   composants personnalisés qu'il utilise, pour s'ouvrir partout). */
import { DB, lsGet, lsSet } from './stockage.js';
import { cleanRef, mergeRefs } from './technique.js';

const UL = { refs: {}, comps: [], savedAt: 0, loaded: false };

function readLS() { try { const o = JSON.parse(lsGet('calque.biblio') || 'null'); return o && typeof o === 'object' ? o : null; } catch (e) { return null; } }
function sanitize(o) {
  const refs = {};
  if (o && o.refs && typeof o.refs === 'object') for (const [k, r] of Object.entries(o.refs)) { const c = cleanRef(r); if (c) refs[k] = c; }
  const comps = Array.isArray(o && o.comps) ? o.comps.filter((c) => c && typeof c === 'object') : []; // composants : étape suivante
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
/* pour la sauvegarde complète */
function exportUserLib() { return { refs: UL.refs, comps: UL.comps }; }
/* import d'une sauvegarde : ajoute, ne remplace jamais */
async function importUserLib(o) {
  if (!o || typeof o !== 'object') return null;
  const r = mergeRefs(UL.refs, o.refs);
  UL.refs = r.refs;
  const ok = r.added > 0 ? await saveUserLib() : true;
  return { ok, refs: r };
}

export { UL, exportUserLib, importUserLib, loadUserLib, saveUserLib, setRef };

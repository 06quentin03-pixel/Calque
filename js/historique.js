/* Calque — module « historique » : annuler / rétablir.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { P } from './noyau.js';

/* ============================================================
   HISTORIQUE
   ============================================================ */
/* Annuler/rétablir économe en mémoire : chaque état du plan est rangé en blocs de texte (une propriété du plan,
   ou 64 objets d'une liste). Un bloc identique à un bloc de l'état précédent est partagé, pas recopié :
   une étape ne coûte que les blocs qu'elle a modifiés. Limites : 150 étapes et environ 30 millions de caractères. */
const H = { u: [], r: [], cur: null };
const H_STEPS = 150, H_CHARS = 30e6, H_BLOCK = 64;
/* variantes (phase 7) : objet jamais modifié sur place (variantes.js en crée un nouveau à chaque opération) ;
   son texte est donc gardé d'une étape à l'autre au lieu d'être refait à chaque modification du plan */
const TXT_VARIANTES = new WeakMap();
function snapshot() { return JSON.stringify(P); }
function packPlan(p, prev) {
  const reuse = new Map();
  if (prev) for (const b of prev.blocks) reuse.set(b, b);
  const pk = { keys: [], blocks: [], size: 0, fresh: 0 };
  const add = (str) => { const old = reuse.get(str); if (old !== undefined) str = old; else pk.fresh += str.length; pk.blocks.push(str); pk.size += str.length; };
  for (const k of Object.keys(p)) {
    const v = p[k];
    if (Array.isArray(v)) {
      const n = Math.ceil(v.length / H_BLOCK); pk.keys.push([k, n]);
      for (let i = 0; i < n; i++) add(JSON.stringify(v.slice(i * H_BLOCK, (i + 1) * H_BLOCK)));
    } else {
      let str;
      if (k === 'variantes' && v && typeof v === 'object') { str = TXT_VARIANTES.get(v); if (str === undefined) { str = JSON.stringify(v); TXT_VARIANTES.set(v, str); } }
      else str = JSON.stringify(v);
      if (str === undefined) continue; // même règle que JSON.stringify(P)
      pk.keys.push([k, -1]); add(str);
    }
  }
  return pk;
}
function unpackPlan(pk) {
  const p = {}; let bi = 0;
  for (const [k, n] of pk.keys) {
    if (n < 0) { p[k] = JSON.parse(pk.blocks[bi++]); continue; }
    const a = [];
    for (let i = 0; i < n; i++) for (const o of JSON.parse(pk.blocks[bi++])) a.push(o);
    p[k] = a;
  }
  return p;
}
function samePack(a, b) {
  if (!a || !b || a.blocks.length !== b.blocks.length || a.keys.length !== b.keys.length) return false;
  for (let i = 0; i < a.keys.length; i++) if (a.keys[i][0] !== b.keys[i][0] || a.keys[i][1] !== b.keys[i][1]) return false;
  for (let i = 0; i < a.blocks.length; i++) if (a.blocks[i] !== b.blocks[i]) return false;
  return true;
}
function historyTrim() {
  let total = 0; for (const e of H.u) total += e.fresh;
  while (H.u.length > H_STEPS || (H.u.length > 10 && total > H_CHARS)) total -= H.u.shift().fresh;
}
function historyReset() { H.u = []; H.r = []; H.cur = packPlan(P, null); }

export { H, H_BLOCK, H_CHARS, H_STEPS, historyReset, historyTrim, packPlan, samePack, snapshot, unpackPlan };

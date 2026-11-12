/* Calque — module « photos » : photos du chantier, enregistrées sur l'appareil (phase 7).
   Base IndexedDB à part, « calque-photos » (magasin « photos ») : la base des plans (« calque ») n'est pas modifiée,
   et une ancienne version de Calque continue de l'ouvrir. Les images ne sont jamais dans le plan (seulement leur
   position et leur légende, `P.chantier.photos`) : le plan reste léger et l'annuler / rétablir ne les recopie pas.
   Rien n'est envoyé en ligne. Les photos sont ajoutées à la sauvegarde complète et au fichier du plan.
     photos { id, pid (plan d'origine), blob (JPEG, 2048 px au plus), thumb (JPEG, 480 px), w, h, at, size }
   Une image n'est jamais effacée automatiquement : un plan copié, une version de l'historique ou une annulation
   peuvent encore la désigner. Seul « Libérer l'espace » supprime les images qu'aucun plan ni aucune version n'utilise.
   Module JavaScript natif (aucune compilation). */

const PH = { db: null, ok: false, opening: null, urls: new Map() };
const MAX_COTE = 2048, MINI_COTE = 480, QUALITE = 0.82;

function ouvrirPhotos() {
  if (PH.ok) return Promise.resolve(true);
  if (PH.opening) return PH.opening;
  PH.opening = new Promise((res) => {
    let req;
    try { req = indexedDB.open('calque-photos', 1); } catch (e) { res(false); return; }
    const timer = setTimeout(() => res(false), 4000);
    req.onupgradeneeded = () => { const d = req.result; if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' }).createIndex('pid', 'pid'); };
    req.onsuccess = () => {
      clearTimeout(timer); PH.db = req.result; PH.ok = true;
      PH.db.onversionchange = () => { PH.db.close(); PH.ok = false; };
      PH.db.onclose = () => { PH.ok = false; };
      res(true);
    };
    req.onerror = () => { clearTimeout(timer); res(false); };
  }).finally(() => { PH.opening = null; });
  return PH.opening;
}
async function tx(mode, fn) {
  if (!(await ouvrirPhotos())) throw new Error('photos-indisponibles');
  return new Promise((res, rej) => {
    let t; const box = {};
    try { t = PH.db.transaction(['photos'], mode); } catch (e) { rej(e); return; }
    t.oncomplete = () => res(box.v);
    t.onerror = () => rej(t.error || new Error('idb'));
    t.onabort = () => rej(t.error || new Error('idb-abort'));
    try { fn(t.objectStore('photos'), box); } catch (e) { try { t.abort(); } catch (e2) { } rej(e); }
  });
}
const lirePhoto = (id) => tx('readonly', (s, box) => { const r = s.get(id); r.onsuccess = () => { box.v = r.result || null; }; });
const toutesPhotos = () => tx('readonly', (s, box) => { const r = s.getAll(); r.onsuccess = () => { box.v = r.result || []; }; });
const clesPhotos = () => tx('readonly', (s, box) => { const r = s.getAllKeys(); r.onsuccess = () => { box.v = r.result || []; }; });
const ecrire = (rec) => tx('readwrite', (s) => { s.put(rec); });

/* image réduite en JPEG (le sens de la photo est celui de l'appareil photo : l'image du navigateur l'applique) */
function chargerImage(blob) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => res({ img, url }); img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    img.src = url;
  });
}
function reduire(img, cote) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  const k = Math.min(1, cote / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'); c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, w, h); c.drawImage(img, 0, 0, w, h);
  return new Promise((res) => cv.toBlob((b) => { cv.width = cv.height = 0; res({ blob: b, w, h }); }, 'image/jpeg', QUALITE));
}
/* enregistre une photo prise ou choisie ; renvoie { w, h, size } */
async function enregistrerPhoto(id, pid, fichier) {
  const { img, url } = await chargerImage(fichier);
  try {
    const grand = await reduire(img, MAX_COTE), mini = await reduire(img, MINI_COTE);
    if (!grand.blob || !mini.blob) throw new Error('jpeg');
    const rec = { id, pid, blob: grand.blob, thumb: mini.blob, w: grand.w, h: grand.h, tw: mini.w, th: mini.h, at: Date.now(), size: grand.blob.size + mini.blob.size };
    await ecrire(rec);
    oublierUrl(id);
    return { w: rec.w, h: rec.h, size: rec.size };
  } finally { URL.revokeObjectURL(url); }
}
/* adresse locale (blob:) de la miniature ou de l'image complète, gardée en mémoire */
async function urlPhoto(id, grande) {
  const k = id + (grande ? ':g' : ':m');
  if (PH.urls.has(k)) return PH.urls.get(k);
  let r = null; try { r = await lirePhoto(id); } catch (e) { return null; }
  if (!r) return null;
  const u = URL.createObjectURL(grande ? r.blob : r.thumb || r.blob);
  PH.urls.set(k, u); return u;
}
function oublierUrl(id) { for (const k of [id + ':g', id + ':m']) { const u = PH.urls.get(k); if (u) { URL.revokeObjectURL(u); PH.urls.delete(k); } } }
/* octets JPEG de la miniature (dossier PDF) */
async function jpegMiniature(id) {
  let r = null; try { r = await lirePhoto(id); } catch (e) { return null; }
  if (!r) return null;
  const k = r.thumb ? Math.min(1, MINI_COTE / Math.max(r.w || 1, r.h || 1)) : 1;
  return { jpeg: new Uint8Array(await (r.thumb || r.blob).arrayBuffer()), w: r.tw || Math.max(1, Math.round(r.w * k)), h: r.th || Math.max(1, Math.round(r.h * k)) };
}

/* ---------------- sauvegarde : images en base64 ---------------- */
function enBase64(blob) {
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.onerror = () => rej(fr.error); fr.readAsDataURL(blob); });
}
function deBase64(s) { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Blob([u], { type: 'image/jpeg' }); }
/* photos à joindre (ids demandés, ou toutes) */
async function exporterPhotos(ids) {
  if (!(await ouvrirPhotos())) return [];
  const want = ids ? new Set(ids) : null, out = [];
  let keys = []; try { keys = await clesPhotos(); } catch (e) { return []; }
  for (const id of keys) {
    if (want && !want.has(id)) continue;
    const r = await lirePhoto(id); if (!r || !r.blob) continue;
    out.push({ id: r.id, pid: r.pid, w: r.w, h: r.h, tw: r.tw, th: r.th, at: r.at, data: await enBase64(r.blob), thumb: r.thumb ? await enBase64(r.thumb) : null });
  }
  return out;
}
/* même contenu, pour la sauvegarde complète : un petit Blob par photo (texte JSON de la photo), sans jamais construire
   un grand texte en mémoire (150 photos ≈ 230 Mo de texte : risque de fermeture de l'onglet sur iPad).
   Renvoie { parts: [Blob], n } ; le navigateur garde les Blob hors de la mémoire du programme. */
async function photosEnParties(ids) {
  const out = { parts: [], n: 0 };
  if (!(await ouvrirPhotos())) return out;
  const want = ids ? new Set(ids) : null;
  let keys = []; try { keys = await clesPhotos(); } catch (e) { return out; }
  for (const id of keys) {
    if (want && !want.has(id)) continue;
    const r = await lirePhoto(id); if (!r || !r.blob) continue;
    const o = { id: r.id, pid: r.pid, w: r.w, h: r.h, tw: r.tw, th: r.th, at: r.at, data: await enBase64(r.blob), thumb: r.thumb ? await enBase64(r.thumb) : null };
    out.parts.push(new Blob([JSON.stringify(o)], { type: 'application/json' })); out.n++;
  }
  return out;
}
/* import : une photo déjà présente n'est jamais remplacée ; renvoie { added, kept, ok } */
async function importerPhotos(list) {
  const o = { added: 0, kept: 0, ok: true };
  if (!Array.isArray(list) || !list.length) return o;
  if (!(await ouvrirPhotos())) { o.ok = false; return o; }
  let have; try { have = new Set(await clesPhotos()); } catch (e) { o.ok = false; return o; }
  for (const x of list) {
    if (!x || typeof x.id !== 'string' || typeof x.data !== 'string') continue;
    if (have.has(x.id)) { o.kept++; continue; }
    try {
      const blob = deBase64(x.data), thumb = typeof x.thumb === 'string' && x.thumb ? deBase64(x.thumb) : null;
      await ecrire({ id: x.id, pid: typeof x.pid === 'string' ? x.pid : '', blob, thumb, w: x.w || 0, h: x.h || 0, tw: x.tw || 0, th: x.th || 0, at: x.at || Date.now(), size: blob.size + (thumb ? thumb.size : 0) });
      have.add(x.id); o.added++;
    } catch (e) { o.ok = false; }
  }
  return o;
}

/* ---------------- espace utilisé et images inutilisées ---------------- */
async function espacePhotos() {
  try { const all = await toutesPhotos(); return { n: all.length, size: all.reduce((s, r) => s + (r.size || 0), 0) }; } catch (e) { return null; }
}
/* images qu'aucun texte (plan enregistré ou version de l'historique) ne désigne ; textes fournis par l'appelant */
async function photosInutilisees(textes) {
  let keys = []; try { keys = await clesPhotos(); } catch (e) { return []; }
  return keys.filter((id) => !textes.some((t) => t.includes('"' + id + '"')));
}
async function supprimerPhotos(ids) {
  await tx('readwrite', (s) => { for (const id of ids) s.delete(id); });
  for (const id of ids) oublierUrl(id);
}

export { MAX_COTE, MINI_COTE, PH, clesPhotos, deBase64, enBase64, enregistrerPhoto, espacePhotos, exporterPhotos, importerPhotos,
  jpegMiniature, lirePhoto, oublierUrl, ouvrirPhotos, photosInutilisees, supprimerPhotos, toutesPhotos, urlPhoto , photosEnParties };

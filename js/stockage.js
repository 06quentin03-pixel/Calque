/* Calque — module « stockage » : enregistrement : IndexedDB, versions, sauvegarde, import / export du fichier.
   Module JavaScript natif (aucune compilation). Les dépendances sont importées explicitement ci-dessous. */
import { $, $$, NF1, P, PIECES_EXT, PLAN_VERSION, blankPlan, isNum, levelsSorted, normalizePlan, setP, touch, ui, uid } from './noyau.js';
import { syncRooms } from './geometrie.js';
import { historyReset, snapshot } from './historique.js';
import { fitView, refreshUI } from './interaction.js';
import { confirmBtnPlain } from './tableau.js';
import { btn, btns, closeModal, confirmBtn, h, openModal, setTool, toast } from './interface.js';
import { exportJSON } from './export.js';
import { samplePlan } from './demarrage.js';
import { EV, emit } from './evenements.js';
import { nettoyerGaine, nettoyerZone } from './cheminement.js';
import { nettoyerEtude, nettoyerLum } from './eclairage.js';
import { nettoyerPhotometrie } from './photometrie.js';
import { nettoyerDoc } from './documents.js';
import { nettoyerChantier } from './chantier.js';
import { nettoyerVariantes } from './variantes.js';
import { nettoyerChiffrage } from './quantitatif.js';
import { nettoyerCalques, nettoyerVues } from './calques.js';
import { nettoyerCircuitV12, nettoyerConds } from './cablage.js';
import { nettoyerSchemas } from './schema.js';


/* ---------------- sauvegarde ----------------
   Stockage principal : IndexedDB (base « calque »), bien plus grand que localStorage (≈ 5 Mo sur Safari).
     plans    { id, name, savedAt, sum, size }            liste des plans (sans le contenu, pour lister vite)
     data     { id, json }                                contenu du plan
     versions { k (auto), pid, name, savedAt, sum, size, why }   historique et copies de sécurité
     vdata    { k, json }                                 contenu de chaque version
     meta     { k, v }
   localStorage reste une copie de secours « au mieux », lue à chaque démarrage, jamais effacée par la migration.
   Chaque écriture est vérifiée : « Enregistré » n'est affiché que si elle a réellement réussi. */
function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { } }
function localIndex() { try { const a = JSON.parse(lsGet('calque.idx') || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
function setLocalIndex(a) { return lsSet('calque.idx', JSON.stringify(a)); }

/* version du format des plans : chaque évolution du format ajoute une fonction MIGRATIONS[n] (plan v n → v n+1) */
const MIGRATIONS = {
  /* v1 → v2 (phase 2) : un symbole électrique peut désigner un article de la bibliothèque technique (champ `art`,
     facultatif). Les plans v1 n'ont pas ce champ : rien à convertir ; une valeur invalide éventuelle est retirée. */
  1(p) {
    for (const e of Array.isArray(p.elec) ? p.elec : []) if (e && 'art' in e && (typeof e.art !== 'string' || !e.art)) delete e.art;
    return p;
  },
  /* v2 → v3 (phase 2) : composants personnalisés. Le plan garde une copie des composants qu'il utilise (`comps`),
     un meuble ou un symbole peut en désigner un (`comp`), un symbole peut afficher un marquage (`mark`).
     Les plans v2 n'en ont pas : liste vide ; une valeur invalide éventuelle est retirée. */
  2(p) {
    if (!Array.isArray(p.comps)) p.comps = [];
    for (const k of ['items', 'elec']) for (const o of Array.isArray(p[k]) ? p[k] : []) {
      if (o && 'comp' in o && (typeof o.comp !== 'string' || !o.comp)) delete o.comp;
      if (o && 'mark' in o && typeof o.mark !== 'string') delete o.mark;
    }
    return p;
  },
  /* v3 → v4 (phase 2) : fond de plan (image ou PDF) par niveau. Réglages dans `fonds`, images dans `fondImg`
     (séparées pour que l'annulation ne recopie pas l'image à chaque réglage). Les plans v3 n'en ont pas. */
  3(p) {
    if (!Array.isArray(p.fonds)) p.fonds = [];
    if (!p.fondImg || typeof p.fondImg !== 'object' || Array.isArray(p.fondImg)) p.fondImg = {};
    p.fonds = p.fonds.filter((f) => f && typeof f === 'object' && typeof f.img === 'string');
    return p;
  },
  /* v4 → v5 (phase 3) : données de calcul. Un circuit peut porter `calc` { p, cos, len : données { v, st, src } ;
     mat : 'cu' | 'al' ; phase : 'L1' | 'L2' | 'L3' | 'tri' }, l'installation `reseau` ('mono' | 'tri') et `ks`.
     Les plans v4 n'en ont pas : RIEN n'est ajouté ni deviné (une donnée absente reste « manquante » dans la fiche).
     Une valeur invalide éventuelle est retirée. */
  4(p) {
    for (const c of Array.isArray(p.circuits) ? p.circuits : []) if (c && 'calc' in c) { const k = cleanCalc(c.calc); if (k) c.calc = k; else delete c.calc; }
    const i = p.install;
    if (i && typeof i === 'object') {
      if ('reseau' in i && i.reseau !== 'mono' && i.reseau !== 'tri') delete i.reseau;
      if ('ks' in i) { const d = cleanDonnee(i.ks, (v) => v > 0 && v <= 1); if (d) i.ks = d; else delete i.ks; }
    }
    return p;
  },
  /* v5 → v6 (phase 4) : cheminements. Une gaine électrique peut porter `kind` (icta, irl, goulotte, cdc), `pose`
     (sol, plafond, hauteur), `z` (cm), `lw` / `lh` (mm, goulotte et chemin de câbles), `cids` (autres circuits) ;
     un passage entre étages (`traversee`) désigne son jumeau par `to` ; le plan a des zones interdites `zones[]` ;
     l'installation, une réserve de câble `reserve` (en %) ; un circuit, le diamètre extérieur du câble `calc.dcab` (mm).
     Les plans v5 n'en ont pas : RIEN n'est deviné (type et pose restent « non précisés »). Valeurs invalides retirées. */
  5(p) {
    for (const d of Array.isArray(p.ducts) ? p.ducts : []) nettoyerGaine(d);
    for (const e of Array.isArray(p.elec) ? p.elec : []) if (e && 'to' in e && (e.type !== 'traversee' || typeof e.to !== 'string' || !e.to)) delete e.to;
    p.zones = (Array.isArray(p.zones) ? p.zones : []).map(nettoyerZone).filter(Boolean);
    for (const c of Array.isArray(p.circuits) ? p.circuits : []) if (c && 'calc' in c) { const k = cleanCalc(c.calc); if (k) c.calc = k; else delete c.calc; }
    const i = p.install;
    if (i && typeof i === 'object' && 'reserve' in i) { const d = cleanDonnee(i.reserve, (v) => v >= 0 && v <= 100); if (d) i.reserve = d; else delete i.reserve; }
    return p;
  },
  /* v6 → v7 (phase 5) : éclairage. Le plan peut porter des photométries de luminaires lues dans des fichiers IES / LDT
     (`photometries[]`) et des études d'éclairage par pièce (`etudes[]` : éclairement visé, plan utile, facteurs,
     luminaires étudiés) ; un symbole peut porter sa photométrie `lum` { ph, flux, p }.
     Les plans v6 n'en ont pas : listes vides, RIEN n'est deviné (aucun flux, aucun éclairement). Valeurs invalides retirées. */
  6(p) {
    p.photometries = (Array.isArray(p.photometries) ? p.photometries : []).map(nettoyerPhotometrie).filter(Boolean);
    const phIds = new Set(p.photometries.map((x) => x.id));
    p.etudes = (Array.isArray(p.etudes) ? p.etudes : []).map(nettoyerEtude).filter(Boolean);
    for (const et of p.etudes) for (const l of et.lums) if (l.ph && !phIds.has(l.ph)) delete l.ph;
    for (const e of Array.isArray(p.elec) ? p.elec : []) if (e && 'lum' in e) {
      const l = nettoyerLum(e.lum); if (l && l.ph && !phIds.has(l.ph)) delete l.ph;
      if (l && Object.keys(l).length) e.lum = l; else delete e.lum;
    }
    return p;
  },
  /* v7 → v8 (phase 6) : informations du dossier PDF (`doc`) : cartouche (client, adresse, entreprise, auteur, affaire)
     et indices de révision. Les plans v7 n'en ont pas : aucun indice (le dossier est « non diffusé ») ; rien n'est deviné. */
  7(p) {
    p.doc = nettoyerDoc(p.doc);
    return p;
  },
  /* v8 → v9 (phase 7) : suivi de chantier (`chantier`) : cases « posé » des appareils et des circuits, réserves,
     positions et légendes des photos (les images restent dans IndexedDB, base « calque-photos », hors du plan),
     annotations au Pencil, historique du chantier. Les plans v8 n'en ont pas : chantier vide, rien n'est deviné. */
  8(p) {
    p.chantier = nettoyerChantier(p.chantier);
    return p;
  },
  /* v9 → v10 (phase 7) : variantes (`variantes` : variante affichée, principale, et partie électrique des autres).
     Les plans v9 n'en ont pas : champ absent ; une variante n'est jamais jetée (voir nettoyerVariantes). */
  9(p) {
    const v = nettoyerVariantes(p.variantes);
    if (v) p.variantes = v; else delete p.variantes;
    return p;
  },
  /* v10 → v11 : chiffrage (`chiffrage` : prix unitaires HT et temps de pose saisis par ligne du quantitatif, taux horaire,
     TVA). Les plans v10 n'en ont pas : chiffrage vide ; aucun prix n'est deviné. */
  10(p) {
    p.chiffrage = nettoyerChiffrage(p.chiffrage);
    return p;
  },
  /* v11 → v12 : module « Plans électriques ». Personnalisation des calques (`calques` : nom, couleur, opacité,
     verrouillage), vues enregistrées (`vues[]`), couleur, courbe et type de conducteur d'un circuit (`col`, `courbe`,
     `cond`), taille d'un symbole (`sc`). Les plans v11 n'en ont pas : calques par défaut, aucune vue, couleurs
     automatiques ; rien n'est deviné. Valeurs invalides retirées (aussi dans les variantes non affichées). */
  11(p) {
    p.calques = nettoyerCalques(p.calques);
    p.vues = nettoyerVues(p.vues);
    for (const c of Array.isArray(p.circuits) ? p.circuits : []) nettoyerCircuitV12(c);
    for (const e of Array.isArray(p.elec) ? p.elec : []) nettoyerTaille(e);
    const l = p.variantes && Array.isArray(p.variantes.liste) ? p.variantes.liste : [];
    for (const v of l) if (v && v.data) {
      for (const c of Array.isArray(v.data.circuits) ? v.data.circuits : []) nettoyerCircuitV12(c);
      for (const e of Array.isArray(v.data.elec) ? v.data.elec : []) nettoyerTaille(e);
    }
    return p;
  },
  /* v12 → v13 : pose de gaine « encastrée dans la cloison » (`pose: 'cloison'`, hauteur `z`), symboles « boîte de
     dérivation murale » (`derivation_mur`) et « sortie de câble radiateur » (`sortie_rad`). Les plans v12 n'en ont pas :
     rien à convertir ; les gaines sont revérifiées (valeur invalide retirée, rien de deviné). Le numéro de version
     prévient une ancienne version de Calque qu'elle ne connaît pas ces symboles. */
  12(p) {
    for (const d of Array.isArray(p.ducts) ? p.ducts : []) nettoyerGaine(d);
    return p;
  },
  /* v13 → v14 : schémas électriques (onglet « Schémas ») : `schemas` { folios: [{ id, titre, type, syms, fils, textes }] },
     indépendants du bâtiment. Les plans v13 n'en ont pas : aucun folio ; rien n'est deviné. */
  13(p) {
    p.schemas = nettoyerSchemas(p.schemas);
    return p;
  },
  /* v14 → v15 (demandes du 13 novembre 2026) : trémie d'un escalier (`tremie: 'aucune'` : l'étage du dessus garde son
     sol), type et sol d'une pièce (`ext` : terrasse ou balcon d'un seul niveau ; `sol: 'vide'` : sol supprimé),
     colonne de passage d'un tableau (passages `traversee` avec `col`, `tab`, taille `w` × `d`), choix des conducteurs
     par circuit dans une gaine (`conds`). Les plans v14 n'en ont pas : rien n'est deviné, valeurs invalides retirées. */
  14(p) {
    nettoyerV15(p);
    const l = p.variantes && Array.isArray(p.variantes.liste) ? p.variantes.liste : [];
    for (const v of l) if (v && v.data) nettoyerV15(v.data);
    return p;
  },
};
function nettoyerV15(p) {
  for (const it of Array.isArray(p.items) ? p.items : []) if (it && 'tremie' in it && it.tremie !== 'aucune') delete it.tremie;
  for (const r of Array.isArray(p.rooms) ? p.rooms : []) {
    if (!r || typeof r !== 'object') continue;
    if ('ext' in r && !PIECES_EXT[r.ext]) delete r.ext;
    if ('sol' in r && r.sol !== 'vide') delete r.sol;
  }
  for (const e of Array.isArray(p.elec) ? p.elec : []) {
    if (!e || typeof e !== 'object') continue;
    const okCol = e.type === 'traversee' && typeof e.col === 'string' && e.col && e.col.length <= 64;
    if (!okCol) for (const k of ['col', 'tab', 'w', 'd']) delete e[k];
    else {
      if ('tab' in e && !(typeof e.tab === 'string' && e.tab)) delete e.tab;
      for (const k of ['w', 'd']) if (k in e && !(isNum(e[k]) && e[k] >= 5 && e[k] <= 300)) delete e[k];
    }
  }
  for (const d of Array.isArray(p.ducts) ? p.ducts : []) nettoyerConds(d);
  return p;
}
/* taille d'un symbole (v12) : 0,5 à 3 ; 1 = taille normale (champ retiré) */
function nettoyerTaille(e) {
  if (!e || typeof e !== 'object' || !('sc' in e)) return e;
  if (!(isNum(e.sc) && e.sc >= 0.5 && e.sc <= 3) || e.sc === 1) delete e.sc;
  else e.sc = Math.round(e.sc * 100) / 100;
  return e;
}
/* donnée de calcul enregistrée : { v (nombre), st ('verifiee' exige src, 'saisie', 'estimee'), src } */
function cleanDonnee(d, ok) {
  if (!d || typeof d !== 'object' || !isNum(d.v) || (ok && !ok(d.v))) return null;
  const src = typeof d.src === 'string' ? d.src.trim() : '';
  let st = ['verifiee', 'saisie', 'estimee'].includes(d.st) ? d.st : 'saisie';
  if (st === 'verifiee' && !src) st = 'saisie';
  return src ? { v: d.v, st, src } : { v: d.v, st };
}
function cleanCalc(k) {
  if (!k || typeof k !== 'object' || Array.isArray(k)) return null;
  const o = {};
  const p = cleanDonnee(k.p, (v) => v > 0), cos = cleanDonnee(k.cos, (v) => v > 0 && v <= 1), len = cleanDonnee(k.len, (v) => v > 0);
  const dcab = cleanDonnee(k.dcab, (v) => v > 0 && v <= 100);
  if (p) o.p = p; if (cos) o.cos = cos; if (len) o.len = len; if (dcab) o.dcab = dcab;
  if (k.mat === 'cu' || k.mat === 'al') o.mat = k.mat;
  if (['L1', 'L2', 'L3', 'tri'].includes(k.phase)) o.phase = k.phase;
  return Object.keys(o).length ? o : null;
}
function migratePlan(p) {
  let v = isNum(p.v) && p.v >= 1 ? Math.floor(p.v) : 1;
  const from = v;
  while (v < PLAN_VERSION && MIGRATIONS[v]) { p = MIGRATIONS[v](p); v++; }
  p.v = Math.max(v, from);
  return { plan: p, from, newer: from > PLAN_VERSION };
}
/* empreinte du contenu (FNV-1a + longueur) : détecte un enregistrement tronqué ou abîmé */
function checksum(s) { let x = 0x811c9dc5; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 0x01000193); } return (x >>> 0).toString(36) + '.' + s.length; }
/* contrôle d'intégrité : signale les liens cassés sans rien modifier */
function planProblems(p) {
  const out = [];
  const ids = (a) => new Set((a || []).map((o) => o && o.id));
  const nodes = ids(p.nodes), walls = ids(p.walls), circs = ids(p.circuits), rcds = ids(p.rcds), lvs = ids(p.levels);
  const n = (cond, msg) => { if (cond) out.push(msg); };
  n((p.walls || []).some((w) => !nodes.has(w.a) || !nodes.has(w.b)), 'mur relié à un angle manquant');
  n((p.openings || []).some((o) => !walls.has(o.wall)), 'ouverture sur un mur manquant');
  n((p.elec || []).some((e) => e.cid && !circs.has(e.cid)), 'symbole relié à un circuit manquant');
  n((p.circuits || []).some((c) => c.rcd && !rcds.has(c.rcd)), 'circuit relié à un différentiel manquant');
  n((p.fonds || []).some((f) => !(p.fondImg || {})[f.img]), 'fond de plan sans image');
  n(['nodes', 'walls', 'items', 'elec', 'rooms', 'ducts', 'zones', 'etudes'].some((k) => (p[k] || []).some((o) => o && o.lv && !lvs.has(o.lv))), 'élément sur un niveau manquant');
  const ch = p.chantier || {};
  n(['reserves', 'photos', 'notes'].some((k) => (ch[k] || []).some((o) => o && o.lv && !lvs.has(o.lv))), 'élément du chantier sur un niveau manquant');
  return out;
}

const DB = {
  db: null, ok: false,
  open() {
    return new Promise((res) => {
      let req;
      try { req = indexedDB.open('calque', 1); } catch (e) { res(false); return; }
      const fail = () => res(false);
      const timer = setTimeout(fail, 4000);
      req.onupgradeneeded = () => {
        const d = req.result;
        if (!d.objectStoreNames.contains('plans')) d.createObjectStore('plans', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('data')) d.createObjectStore('data', { keyPath: 'id' });
        if (!d.objectStoreNames.contains('versions')) d.createObjectStore('versions', { keyPath: 'k', autoIncrement: true }).createIndex('pid', 'pid');
        if (!d.objectStoreNames.contains('vdata')) d.createObjectStore('vdata', { keyPath: 'k' });
        if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' });
      };
      req.onsuccess = () => {
        clearTimeout(timer);
        this.db = req.result; this.ok = true;
        this.db.onversionchange = () => { this.db.close(); this.ok = false; };
        this.db.onclose = () => { this.ok = false; };
        res(true);
      };
      req.onerror = () => { clearTimeout(timer); fail(); };
    });
  },
  /* la promesse n'est tenue que lorsque la transaction est réellement écrite (oncomplete) */
  tx(stores, mode, fn) {
    return new Promise((res, rej) => {
      if (!this.ok) { rej(new Error('idb-closed')); return; }
      let t; const box = {};
      try { t = this.db.transaction(stores, mode); } catch (e) { rej(e); return; }
      t.oncomplete = () => res(box.v);
      t.onerror = () => rej(t.error || new Error('idb'));
      t.onabort = () => rej(t.error || new Error('idb-abort'));
      try { fn(t, box); } catch (e) { try { t.abort(); } catch (e2) { } rej(e); }
    });
  },
  get(store, key) { return this.tx([store], 'readonly', (t, box) => { const r = t.objectStore(store).get(key); r.onsuccess = () => { box.v = r.result; }; }); },
  all(store) { return this.tx([store], 'readonly', (t, box) => { const r = t.objectStore(store).getAll(); r.onsuccess = () => { box.v = r.result || []; }; }); },
  byIndex(store, index, key) { return this.tx([store], 'readonly', (t, box) => { const r = t.objectStore(store).index(index).getAll(key); r.onsuccess = () => { box.v = r.result || []; }; }); },
};

const Store = {
  cloud: false, col: null, cache: new Map(), timer: 0, saving: false, again: false,
  busy: false, failNotified: false, lastErr: null,
  async init() {
    try {
      if (!window.claude || typeof window.claude.use !== 'function') return false;
      const [db, user] = await Promise.all([window.claude.use('db'), window.claude.use('user')]);
      if (!db || !user) return false;
      const id = await user.id();
      if (!id) return false;
      this.col = db.collection('data/users/' + id);
      this.cloud = true;
      return true;
    } catch (e) { return false; }
  },
  async refresh() {
    if (!this.cloud) return;
    const snap = await this.col.get();
    this.cache.clear();
    for (const d of snap.docs) {
      if (!d.exists || !d.id.startsWith('p_')) continue;
      const x = d.data() || {};
      this.cache.set(d.id.slice(2), { id: d.id.slice(2), name: x.name || 'Plan', savedAt: x.savedAt || 0, json: x.json });
    }
  },
};

/* écrit un plan dans IndexedDB (principal) et dans localStorage (secours) ; renvoie { idb, ls } */
async function writePlanLocal(id, name, savedAt, json) {
  const sum = checksum(json);
  let idb = false;
  if (DB.ok) {
    try {
      await DB.tx(['plans', 'data'], 'readwrite', (t) => {
        t.objectStore('data').put({ id, json });
        t.objectStore('plans').put({ id, name, savedAt, sum, size: json.length });
      });
      idb = true;
    } catch (e) { Store.lastErr = e; }
  }
  let ls = lsSet('calque.p.' + id, json);
  if (ls) { const idx = localIndex().filter((x) => x.id !== id); idx.push({ id, name, savedAt }); ls = setLocalIndex(idx); }
  if (!ls && idb) {
    /* localStorage plein : on retire l'ancienne copie de secours pour qu'elle ne soit jamais prise pour la bonne */
    lsDel('calque.p.' + id); setLocalIndex(localIndex().filter((x) => x.id !== id));
  }
  lsSet('calque.cur', id);
  return { idb, ls, sum };
}

/* ---- historique des versions ---- */
const VERS = { gap: 10 * 60 * 1000, keep: 40 };
const lastVer = new Map(); // pid → { savedAt, sum }
async function versionsOf(pid) {
  if (!DB.ok) return [];
  try { return (await DB.byIndex('versions', 'pid', pid)).sort((a, b) => b.savedAt - a.savedAt); } catch (e) { return []; }
}
async function addVersion(pid, name, json, why) {
  if (!DB.ok) return false;
  const sum = checksum(json), savedAt = Date.now();
  try {
    await DB.tx(['versions', 'vdata'], 'readwrite', (t) => {
      const r = t.objectStore('versions').add({ pid, name, savedAt, sum, size: json.length, why });
      r.onsuccess = () => { t.objectStore('vdata').put({ k: r.result, json }); };
    });
    lastVer.set(pid, { savedAt, sum });
    pruneVersions(pid);
    return true;
  } catch (e) { return false; }
}
async function pruneVersions(pid) {
  const vs = await versionsOf(pid);
  const extra = vs.slice(VERS.keep);
  if (!extra.length) return;
  try { await DB.tx(['versions', 'vdata'], 'readwrite', (t) => { for (const v of extra) { t.objectStore('versions').delete(v.k); t.objectStore('vdata').delete(v.k); } }); } catch (e) { }
}
async function versionJson(k) { try { const d = await DB.get('vdata', k); return d ? d.json : null; } catch (e) { return null; } }
/* une version automatique toutes les 10 minutes de travail, seulement si le plan a changé */
async function maybeVersion(pid, name, json, sum, why, force) {
  if (!DB.ok) return;
  if (!lastVer.has(pid)) { const vs = await versionsOf(pid); lastVer.set(pid, vs.length ? { savedAt: vs[0].savedAt, sum: vs[0].sum } : { savedAt: 0, sum: '' }); }
  const lv = lastVer.get(pid);
  if (lv.sum === sum) return;
  if (!force && Date.now() - lv.savedAt < VERS.gap) return;
  await addVersion(pid, name, json, why || 'Automatique');
}

function setSave(state, msg) {
  const el = $('#saveState'); el.dataset.s = state;
  $('#saveTxt').textContent = msg || { ok: 'Enregistré', dirty: 'Modifications…', local: 'Enregistré sur cet appareil', err: 'Non enregistré' }[state];
  el.title = state === 'err' ? 'Le dernier enregistrement a échoué. Exportez le plan pour ne rien perdre.' : $('#saveTxt').textContent;
}
function scheduleSave() {
  ui.isExample = false;
  ui.savedAt = Date.now();
  setSave('dirty');
  clearTimeout(Store.timer);
  Store.timer = setTimeout(saveNow, 900);
}
function notifySaveFail() {
  if (Store.failNotified) return;
  Store.failNotified = true;
  openModal('Enregistrement impossible',
    h('p', null, 'Calque n’a pas pu enregistrer vos dernières modifications sur cet appareil (espace de stockage plein ou indisponible).'),
    h('p', null, 'Le plan est toujours ouvert : exportez-le maintenant pour ne rien perdre, puis libérez de l’espace (anciens plans, historique, réglages de l’iPad > Général > Stockage).'),
    btns(btn('Exporter le plan', () => { closeModal(); exportJSON(); }, 'pri', 'up'), btn('Fermer', closeModal)));
}
async function saveNow() {
  clearTimeout(Store.timer); Store.timer = 0;
  if (!P || ui.isExample) return;
  if (Store.busy) { Store.again = true; return; }
  Store.busy = true;
  try {
    do {
      Store.again = false;
      const id = P.id, name = P.name || 'Plan', savedAt = ui.savedAt || Date.now();
      const json = JSON.stringify(P);
      const r = await writePlanLocal(id, name, savedAt, json);
      if (!r.idb && !r.ls) { setSave('err'); notifySaveFail(); return; }
      Store.failNotified = false;
      maybeVersion(id, name, json, r.sum);
      if (!Store.cloud) { setSave('local'); continue; }
      if (json.length > 240000) { setSave('local', 'Enregistré sur cet appareil seulement'); continue; }
      try {
        await Store.col.doc('p_' + id).set({ name, savedAt, json });
        Store.cache.set(id, { id, name, savedAt, json });
        setSave('ok');
      } catch (e) {
        if (e && e.code === 'unavailable') { setTimeout(() => { if (!Store.busy) saveNow(); }, 1500 + Math.random() * 1000); }
        setSave('local', e && e.code === 'quota_exceeded' ? 'Espace en ligne plein' : 'Enregistré sur cet appareil seulement');
      }
    } while (Store.again);
  } finally { Store.busy = false; }
}
/* au démarrage : reprend dans IndexedDB les plans de localStorage plus récents (anciennes versions de Calque) */
async function syncFromLocal() {
  if (!DB.ok) return 0;
  let metas = [];
  try { metas = await DB.all('plans'); } catch (e) { return 0; }
  const have = new Map(metas.map((m) => [m.id, m]));
  let n = 0;
  for (const li of localIndex()) {
    const m = have.get(li.id);
    if (m && (m.savedAt || 0) >= (li.savedAt || 0)) continue;
    const json = lsGet('calque.p.' + li.id);
    if (!json) continue;
    try { JSON.parse(json); } catch (e) { continue; }
    const sum = checksum(json);
    try {
      await DB.tx(['plans', 'data'], 'readwrite', (t) => {
        t.objectStore('data').put({ id: li.id, json });
        t.objectStore('plans').put({ id: li.id, name: li.name || 'Plan', savedAt: li.savedAt || 0, sum, size: json.length });
      });
      await addVersion(li.id, li.name || 'Plan', json, 'Copie de sécurité (reprise de l’ancien stockage)');
      n++;
    } catch (e) { }
  }
  try { await DB.tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put({ k: 'lsSync', v: Date.now() }); }); } catch (e) { }
  return n;
}
async function askPersist() {
  try { if (navigator.storage && navigator.storage.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch (e) { }
}
function openPlan(plan, id, opts) {
  opts = opts || {};
  /* copie de sécurité du plan tel qu'il était avant la mise à jour de son format (restaurable dans l'historique) */
  const before = !opts.example && plan && typeof plan === 'object' && !(isNum(plan.v) && plan.v >= PLAN_VERSION) ? JSON.stringify(plan) : null;
  const mig = migratePlan(plan);
  if (before && id) addVersion(id, plan.name || 'Plan', before, `Copie de sécurité avant mise à jour du format (v${mig.from} → v${PLAN_VERSION})`).catch(() => { });
  setP(normalizePlan(mig.plan)); P.id = id; delete P.savedAt;
  touch(); syncRooms();
  const L = levelsSorted();
  ui.lv = (L.find((l) => l.elev >= 0) || L[0]).id;
  ui.sel = null; ui.chain = null; ui.cursor = null; ui.inspOpen = false; ui.evSel = null; ui.hl = null; ui.linkSrc = null;
  ui.isExample = !!opts.example; ui.savedAt = opts.savedAt || 0;
  historyReset();
  if (!ui.isExample) lsSet('calque.cur', id);
  setTool(opts.tool || 'select');
  refreshUI();
  setSave(ui.isExample ? (Store.cloud ? 'ok' : 'local') : Store.cloud ? 'ok' : 'local', ui.isExample ? 'Exemple non enregistré' : undefined);
  fitView();
  if (mig.newer) toast('Ce plan vient d’une version plus récente de Calque : certaines données peuvent ne pas s’afficher.');
  else if (!ui.isExample && !opts.quiet) { const pb = planProblems(P); if (pb.length) toast('Plan ouvert. À vérifier : ' + pb.join(', ') + '.'); }
  /* copie de sécurité à l'ouverture (si le plan a changé depuis la dernière version) */
  if (!ui.isExample && !opts.quiet) { const json = JSON.stringify(P); maybeVersion(id, P.name || 'Plan', json, checksum(json), 'À l’ouverture', true); }
  emit(EV.PLAN_OUVERT, { id });
}
async function listProjects() {
  if (Store.cloud) { try { await Store.refresh(); } catch (e) { } }
  const m = new Map();
  const put = (x) => { const l = m.get(x.id); if (!l || (x.savedAt || 0) >= (l.savedAt || 0)) m.set(x.id, { id: x.id, name: x.name, savedAt: x.savedAt || 0 }); };
  if (DB.ok) { try { for (const x of await DB.all('plans')) put(x); } catch (e) { } }
  for (const x of localIndex()) put(x);
  for (const x of Store.cache.values()) put(x);
  if (P && !m.has(P.id)) m.set(P.id, { id: P.id, name: P.name + (ui.isExample ? ' (non enregistré)' : ''), savedAt: ui.savedAt || Date.now() });
  return [...m.values()].sort((a, b) => b.savedAt - a.savedAt);
}
/* lit le plan le plus récent parmi IndexedDB, localStorage et l'enregistrement en ligne ; ignore une copie abîmée */
async function loadProject(id) {
  const cands = [];
  if (DB.ok) {
    try {
      const meta = await DB.get('plans', id), d = meta && await DB.get('data', id);
      if (d && d.json) cands.push({ src: 'idb', savedAt: meta.savedAt || 0, json: d.json, bad: meta.sum && checksum(d.json) !== meta.sum });
    } catch (e) { }
  }
  const local = lsGet('calque.p.' + id);
  if (local) { const li = localIndex().find((x) => x.id === id); cands.push({ src: 'ls', savedAt: li ? li.savedAt || 0 : 0, json: local }); }
  let cloud = Store.cache.get(id);
  if (Store.cloud && !cloud) { try { const d = await Store.col.doc('p_' + id).get(); if (d.exists) { const x = d.data(); cloud = { id, name: x.name, savedAt: x.savedAt || 0, json: x.json }; } } catch (e) { } }
  if (cloud && cloud.json) cands.push({ src: 'cloud', savedAt: cloud.savedAt || 0, json: cloud.json });
  cands.sort((a, b) => (a.bad ? 1 : 0) - (b.bad ? 1 : 0) || b.savedAt - a.savedAt);
  for (const c of cands) {
    try { const plan = JSON.parse(c.json); if (plan && typeof plan === 'object') return { plan, savedAt: c.savedAt, damaged: cands.some((x) => x.bad) }; } catch (e) { }
  }
  /* aucune copie lisible : dernière version de l'historique */
  for (const v of await versionsOf(id)) {
    const json = await versionJson(v.k);
    try { if (json) return { plan: JSON.parse(json), savedAt: v.savedAt, damaged: true }; } catch (e) { }
  }
  return null;
}
async function openProjects() {
  const list = await listProjects();
  const fmtDate = (t) => t ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(t)) : '';
  const rows = list.map((p) => {
    const cur = P && p.id === P.id;
    return h('div', { class: 'proj-li', 'aria-current': String(cur) },
      h('div', { style: 'min-width:0' }, h('b', null, p.name), h('small', null, cur ? 'Ouvert · ' + fmtDate(p.savedAt) : fmtDate(p.savedAt))),
      h('div', { class: 'btns' },
        cur ? null : btn('Ouvrir', async () => { await saveNow(); const r = await loadProject(p.id); if (!r) { toast('Ce plan est introuvable.'); return; } closeModal(); openPlan(r.plan, p.id, { savedAt: r.savedAt }); if (r.damaged) toast('La dernière copie était abîmée : la copie valide la plus récente a été ouverte.'); }, 'sm pri'),
        btn('', async () => { const r = cur ? { plan: JSON.parse(snapshot()) } : await loadProject(p.id); if (!r) return; const nid = uid('p'); r.plan.name = (r.plan.name || 'Plan') + ' (copie)'; closeModal(); openPlan(r.plan, nid); scheduleSave(); toast('Copie créée.'); }, 'sm', 'dup'),
        confirmBtn('', 'Supprimer ?', async () => { await deleteProject(p.id); openProjects(); })));
  });
  const deleted = await deletedPlans(new Set(list.map((p) => p.id)));
  const delRows = deleted.map((v) => h('div', { class: 'proj-li' },
    h('div', { style: 'min-width:0' }, h('b', null, v.name), h('small', null, 'Supprimé · dernière copie du ' + fmtDate(v.savedAt))),
    h('div', { class: 'btns' }, btn('Récupérer', async () => {
      const json = await versionJson(v.k); if (!json) { toast('Copie illisible.'); return; }
      await saveNow(); closeModal(); openPlan(JSON.parse(json), v.pid); scheduleSave(); toast(`« ${v.name} » récupéré.`);
    }, 'sm'))));
  let space = '';
  try { if (navigator.storage && navigator.storage.estimate) { const e = await navigator.storage.estimate(); if (e.usage != null) space = ` Espace utilisé : ${NF1.format(e.usage / 1048576)} Mo.`; } } catch (e) { }
  openModal('Mes plans', ...rows, btns(btn('Nouveau plan', () => { closeModal(); newPlan(); }, 'pri', 'plus')),
    delRows.length ? h('h3', { style: 'margin:8px 0 0;font-size:13px' }, 'Plans supprimés récemment') : null, ...delRows,
    h('p', { class: 'note' }, (Store.cloud ? 'Vos plans sont enregistrés dans votre compte et vous suivent d’un appareil à l’autre.' : 'Vos plans sont enregistrés sur cet appareil, avec un historique des versions. Envoyez-vous régulièrement une sauvegarde (menu … > Sauvegarder tous mes plans).') + space));
  for (const b of $$('#modal .btn.sm')) { if (!b.textContent.trim()) b.setAttribute('aria-label', b.classList.contains('danger') ? 'Supprimer' : 'Dupliquer'); }
}
/* plans supprimés dont il reste une copie dans l'historique (la plus récente de chacun) */
async function deletedPlans(alive) {
  if (!DB.ok) return [];
  let all = [];
  try { all = await DB.all('versions'); } catch (e) { return []; }
  const best = new Map();
  for (const v of all) { if (alive.has(v.pid)) continue; const b = best.get(v.pid); if (!b || v.savedAt > b.savedAt) best.set(v.pid, v); }
  return [...best.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, 10);
}
async function deleteProject(id) {
  /* copie de sécurité avant suppression : le plan reste récupérable dans « Plans supprimés récemment » */
  const r = P && P.id === id ? { plan: JSON.parse(snapshot()) } : await loadProject(id);
  if (r) await addVersion(id, r.plan.name || 'Plan', JSON.stringify(r.plan), 'Avant suppression');
  if (DB.ok) { try { await DB.tx(['plans', 'data'], 'readwrite', (t) => { t.objectStore('plans').delete(id); t.objectStore('data').delete(id); }); } catch (e) { } }
  lsDel('calque.p.' + id);
  setLocalIndex(localIndex().filter((x) => x.id !== id));
  if (Store.cloud) { try { await Store.col.doc('p_' + id).delete(); Store.cache.delete(id); } catch (e) { toast('Suppression en ligne impossible pour le moment.'); } }
  if (P && P.id === id) {
    clearTimeout(Store.timer); Store.timer = 0;
    const rest = await listProjects();
    const next = rest.find((x) => x.id !== id);
    if (next) { const r2 = await loadProject(next.id); if (r2) { openPlan(r2.plan, next.id, { savedAt: r2.savedAt }); return; } }
    openPlan(blankPlan('Nouveau plan'), uid('p'), { tool: 'room' });
    scheduleSave();
  }
}
/* fenêtre « Historique des versions » du plan ouvert */
async function openVersions() {
  if (ui.isExample) { toast('Le plan d’exemple n’a pas d’historique : modifiez-le pour l’enregistrer.'); return; }
  if (!DB.ok) { toast('Historique indisponible sur ce navigateur.'); return; }
  await saveNow();
  const vs = await versionsOf(P.id);
  const fmt = (t) => new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t));
  const rows = vs.map((v) => h('div', { class: 'proj-li' },
    h('div', { style: 'min-width:0' }, h('b', null, fmt(v.savedAt)), h('small', null, `${v.why} · ${NF1.format(v.size / 1024)} Ko`)),
    h('div', { class: 'btns' },
      btn('Copie', async () => {
        const json = await versionJson(v.k); if (!json) { toast('Version illisible.'); return; }
        const plan = JSON.parse(json); plan.name = (plan.name || 'Plan') + ' (version du ' + fmt(v.savedAt) + ')';
        await saveNow(); closeModal(); openPlan(plan, uid('p')); scheduleSave(); toast('Version ouverte dans un nouveau plan.');
      }, 'sm'),
      confirmBtnPlain('Restaurer', 'Confirmer ?', async () => {
        const json = await versionJson(v.k); if (!json) { toast('Version illisible.'); return; }
        await saveNow();
        await addVersion(P.id, P.name || 'Plan', snapshot(), 'Avant restauration');
        const id = P.id; closeModal(); openPlan(JSON.parse(json), id, { quiet: true }); scheduleSave(); toast('Version restaurée. L’état précédent est gardé dans l’historique.');
      }))));
  openModal('Historique des versions',
    h('p', { class: 'note' }, 'Une copie est gardée à l’ouverture du plan, puis toutes les 10 minutes de travail, avant chaque restauration et avant une suppression (40 dernières copies par plan).'),
    btns(btn('Enregistrer une version maintenant', async () => { const ok = await addVersion(P.id, P.name || 'Plan', snapshot(), 'Manuelle'); toast(ok ? 'Version enregistrée.' : 'Échec de l’enregistrement de la version.'); if (ok) openVersions(); }, 'pri', 'plus')),
    ...(rows.length ? rows : [h('p', { class: 'note' }, 'Aucune version pour l’instant.')]));
}
async function newPlan() {
  await saveNow();
  openPlan(blankPlan('Nouveau plan'), uid('p'), { tool: 'room' });
  scheduleSave();
  toast('Plan vierge créé. Dessinez une première pièce en faisant glisser.');
}
async function openSample() {
  await saveNow();
  openPlan(samplePlan(), uid('p'), { example: true });
}

/* ---------------- export / import ---------------- */
let DL;
async function getDownloads() {
  if (DL !== undefined) return DL;
  try { DL = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('downloads') : null; } catch (e) { DL = null; }
  return DL;
}
function slug(s) { return (s || 'plan').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'plan'; }
const LIGHT = { paper: '#FFFFFF', room: '#FFFFFF', ink: '#1D2125', ink2: '#5C656C', wall: '#252A2F', part: '#98A0A6', fill: '#FFFFFF', tone: '#E8EAE6', grid: 'rgba(0,0,0,0)', gridMajor: 'rgba(0,0,0,0)', accent: '#D24F1A', accentSoft: 'rgba(210,79,26,.12)', elec: '#2356C4', ghost: 'rgba(0,0,0,0)', t1: 'rgba(214,165,80,.22)', t2: 'rgba(96,160,104,.2)', t3: 'rgba(80,146,214,.18)', t4: 'rgba(222,110,132,.18)', t5: 'rgba(146,114,214,.18)', t6: 'rgba(84,96,108,.16)' , vmc: '#0B8C88', gaine: '#6D4FC2' };
function saveBlobLocal(blob, filename) {
  try {
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000); return true;
  } catch (e) { return false; }
}

export { DB, DL, LIGHT, MIGRATIONS, cleanCalc, cleanDonnee, nettoyerTaille, PLAN_VERSION, Store, VERS, addVersion, askPersist, checksum, deleteProject,
  deletedPlans, getDownloads, lastVer, listProjects, loadProject, localIndex, lsDel, lsGet, lsSet, maybeVersion,
  migratePlan, newPlan, notifySaveFail, openPlan, openProjects, openSample, openVersions, planProblems, pruneVersions,
  saveBlobLocal, saveNow, scheduleSave, setLocalIndex, setSave, slug, syncFromLocal, versionJson, versionsOf,
  writePlanLocal };

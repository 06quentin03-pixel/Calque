/* Calque — module « catalogue » : lecture des catalogues fabricants fournis par l'utilisateur (CSV, Excel .xlsx).
   Module JavaScript natif, sans accès à l'écran (testable avec Node). Aucune bibliothèque externe :
   le .xlsx (archive ZIP de fichiers XML) est décompressé avec DecompressionStream (Safari 16.4 et plus).

   PRÉPARATION (phase 2) : lecture, reconnaissance des colonnes, conversion en articles, contrôles.
   En attente des fichiers de l'utilisateur : la correspondance exacte des colonnes FAB-DIS, l'enregistrement
   (volume) et l'écran d'import. Aucune donnée de catalogue n'est fournie par Calque.

   Règle 4 (aucune fausse donnée) : une valeur absente reste absente ; rien n'est complété ni deviné.
   Fiabilité des articles importés : « vérifiée » seulement si l'utilisateur confirme que le fichier vient du
   fabricant ou du distributeur (la source est le nom du fichier) ; sinon « saisie ». */

/* ---- texte : UTF-8 (avec ou sans BOM), sinon Windows-1252 (CSV enregistrés par Excel en France) ---- */
function decodeText(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (u[0] === 0xef && u[1] === 0xbb && u[2] === 0xbf) return { text: new TextDecoder('utf-8').decode(u.subarray(3)), encoding: 'utf-8' };
  if (u[0] === 0xff && u[1] === 0xfe) return { text: new TextDecoder('utf-16le').decode(u.subarray(2)), encoding: 'utf-16le' };
  try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(u), encoding: 'utf-8' }; } catch (e) { /* pas de l'UTF-8 */ }
  return { text: new TextDecoder('windows-1252').decode(u), encoding: 'windows-1252' };
}

/* ---- CSV : séparateur détecté (; , tabulation |), guillemets, retours à la ligne dans un champ ---- */
function detectDelimiter(text) {
  const line = text.slice(0, 20000).split(/\r?\n/).find((l) => l.trim()) || '';
  let best = ';', n = -1;
  for (const d of [';', ',', '\t', '|']) {
    let c = 0, q = false;
    for (const ch of line) { if (ch === '"') q = !q; else if (ch === d && !q) c++; }
    if (c > n) { n = c; best = d; }
  }
  return best;
}
function parseCSV(text, delim) {
  const d = delim || detectDelimiter(text);
  const rows = []; let row = [], f = '', q = false, i = 0;
  const s = text.replace(/^﻿/, '');
  while (i < s.length) {
    const ch = s[i];
    if (q) {
      if (ch === '"') { if (s[i + 1] === '"') { f += '"'; i += 2; continue; } q = false; i++; continue; }
      f += ch; i++; continue;
    }
    if (ch === '"' && f === '') { q = true; i++; continue; }
    if (ch === d) { row.push(f); f = ''; i++; continue; }
    if (ch === '\r' || ch === '\n') { row.push(f); rows.push(row); row = []; f = ''; i += ch === '\r' && s[i + 1] === '\n' ? 2 : 1; continue; }
    f += ch; i++;
  }
  if (f !== '' || row.length) { row.push(f); rows.push(row); }
  return { rows: rows.filter((r) => r.some((x) => x.trim() !== '')), delimiter: d };
}

/* ---- ZIP (lecture seule) ---- */
async function inflateRaw(data) {
  const ds = new DecompressionStream('deflate-raw');
  const out = new Response(new Blob([data]).stream().pipeThrough(ds));
  return new Uint8Array(await out.arrayBuffer());
}
async function unzip(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u.buffer, u.byteOffset, u.byteLength);
  let eocd = -1;
  for (let i = u.length - 22; i >= Math.max(0, u.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('zip');
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true);
  const files = new Map();
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip');
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(u.subarray(p + 46, p + 46 + nl));
    files.set(name, { method, csize, off });
    p += 46 + nl + xl + cl;
  }
  return {
    names: [...files.keys()],
    async read(name) {
      const e = files.get(name); if (!e) return null;
      if (dv.getUint32(e.off, true) !== 0x04034b50) throw new Error('zip');
      const start = e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
      const data = u.subarray(start, start + e.csize);
      if (e.method === 0) return data;
      if (e.method === 8) return inflateRaw(data);
      throw new Error('zip-methode');
    },
  };
}

/* ---- Excel .xlsx : feuilles, chaînes partagées, cellules ---- */
const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
function unxml(s) { return s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : +e.slice(1)) : XML_ENT[e] ?? m); }
const attr = (tag, a) => { const m = tag.match(new RegExp('\\s' + a + '="([^"]*)"')); return m ? unxml(m[1]) : null; };
const allText = (xml) => { let s = ''; for (const m of xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) s += unxml(m[1]); return s; };
function colIndex(ref) { let n = 0; for (const ch of ref.replace(/\d+$/, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; }
async function readXlsx(bytes) {
  const z = await unzip(bytes);
  const txt = async (n) => { const b = await z.read(n); return b ? new TextDecoder().decode(b) : null; };
  const wb = await txt('xl/workbook.xml'); if (!wb) throw new Error('xlsx');
  const rels = (await txt('xl/_rels/workbook.xml.rels')) || '';
  const target = new Map([...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => [attr(m[0], 'Id'), attr(m[0], 'Target')]));
  const ss = (await txt('xl/sharedStrings.xml')) || '';
  const shared = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => allText(m[1]));
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = attr(m[0], 'name'), rid = attr(m[0], 'r:id');
    let t = target.get(rid) || ''; t = t.startsWith('/') ? t.slice(1) : 'xl/' + t.replace(/^\.\//, '');
    const xml = await txt(t); if (xml == null) continue;
    const rows = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const row = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const head = '<c' + c[1] + '>', body = c[2] || '';
        const ref = attr(head, 'r'), type = attr(head, 't');
        const v = (body.match(/<v>([\s\S]*?)<\/v>/) || [])[1];
        let val = '';
        if (type === 's') val = v != null ? shared[+v] ?? '' : '';
        else if (type === 'inlineStr') val = allText(body);
        else if (type === 'b') val = v === '1' ? 'VRAI' : v === '0' ? 'FAUX' : '';
        else val = v != null ? unxml(v) : '';
        const i = ref ? colIndex(ref) : row.length;
        while (row.length < i) row.push('');
        row[i] = val;
      }
      rows.push(row);
    }
    sheets.push({ name, rows: rows.filter((r) => r.some((x) => String(x).trim() !== '')) });
  }
  return { sheets };
}

/* ---- reconnaissance des colonnes (intitulés usuels ; FAB-DIS à confirmer avec les fichiers réels) ---- */
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const COLS = {
  ref: ['reference', 'ref', 'referencecommerciale', 'refcommerciale', 'refciale', 'referencefabricant', 'reffabricant', 'codearticle', 'codeproduit', 'article'],
  n: ['designation', 'libelle', 'libellelong', 'description', 'libellecourt', 'designationcommerciale', 'nom', 'produit'],
  fab: ['marque', 'fabricant', 'fournisseur', 'brand', 'manufacturer'],
  ean: ['ean', 'ean13', 'gtin', 'codeean', 'codebarre', 'codebarres'],
  fam: ['famille', 'sousfamille', 'categorie', 'gamme', 'rubrique'],
  unite: ['unite', 'unitedevente', 'uv', 'conditionnement'],
  prix: ['prixpublicht', 'prixht', 'tarifht', 'prixpublic', 'tarif', 'prix', 'pvht'],
};
const FIELD_NAMES = { ref: 'Référence', n: 'Désignation', fab: 'Fabricant', ean: 'EAN', fam: 'Famille', unite: 'Unité', prix: 'Prix' };
function guessColumns(headers) {
  const H = headers.map(norm), map = {}, used = new Set();
  for (const pass of ['exact', 'debut']) for (const [field, keys] of Object.entries(COLS)) {
    if (field in map) continue;
    for (const k of keys) {
      const i = H.findIndex((x, j) => !used.has(j) && x && (pass === 'exact' ? x === k : x.startsWith(k)));
      if (i >= 0) { map[field] = i; used.add(i); break; }
    }
  }
  return map;
}
/* ligne des intitulés : la première (parmi les 15 premières) où l'on reconnaît au moins deux colonnes */
function findHeader(rows) {
  for (let i = 0; i < Math.min(15, rows.length); i++) { const m = guessColumns(rows[i]); if (Object.keys(m).length >= 2 && ('ref' in m || 'n' in m)) return { index: i, map: m }; }
  return null;
}

/* ---- conversion en articles ----
   opts : { map (colonne par champ, sinon reconnue), fab (fabricant si le fichier n'a pas de colonne), source (nom du fichier),
            officiel (true : fichier du fabricant ou du distributeur, confirmé par l'utilisateur), date } */
function toArticles(rows, opts = {}) {
  const head = opts.map ? { index: opts.headerIndex ?? 0, map: opts.map } : findHeader(rows);
  if (!head) return { articles: [], stats: { lignes: rows.length, gardees: 0, vides: 0, doublons: 0 }, erreur: 'Aucune ligne d’intitulés reconnue (Référence, Désignation…).' };
  const { map } = head;
  const cell = (r, f) => (f in map ? String(r[map[f]] ?? '').trim() : '');
  const seen = new Set(), out = [];
  let vides = 0, doublons = 0;
  const fiab = opts.officiel ? 'verifiee' : 'saisie';
  const source = (opts.source || 'catalogue importé') + (opts.date ? ' (' + opts.date + ')' : '');
  for (const r of rows.slice(head.index + 1)) {
    const ref = cell(r, 'ref'), n = cell(r, 'n');
    if (!ref && !n) { vides++; continue; }
    const fab = cell(r, 'fab') || String(opts.fab || '').trim();
    const key = norm(fab) + '|' + (ref ? norm(ref) : 'n:' + norm(n));
    if (seen.has(key)) { doublons++; continue; }
    seen.add(key);
    const a = { id: 'cat:' + key, ref, n, fab, fiab, source };
    for (const f of ['ean', 'fam', 'unite', 'prix']) { const v = cell(r, f); if (v) a[f] = v; } // valeur absente : champ absent
    if (!ref) a.manque = ['référence'];
    out.push(a);
  }
  return { articles: out, stats: { lignes: rows.length - head.index - 1, gardees: out.length, vides, doublons }, map, headerIndex: head.index, headers: rows[head.index] };
}

/* lecture d'un fichier selon son extension ; renvoie des tableaux de lignes (une par feuille) */
async function readCatalogFile(name, bytes) {
  if (/\.xlsx$/i.test(name)) return { kind: 'xlsx', sheets: (await readXlsx(bytes)).sheets };
  if (/\.(csv|txt|tsv)$/i.test(name)) { const t = decodeText(bytes); const p = parseCSV(t.text); return { kind: 'csv', encoding: t.encoding, delimiter: p.delimiter, sheets: [{ name, rows: p.rows }] }; }
  if (/\.xls$/i.test(name)) throw new Error('xls'); // ancien format binaire d'Excel : à réenregistrer en .xlsx ou .csv
  throw new Error('format');
}

export { COLS, FIELD_NAMES, decodeText, detectDelimiter, findHeader, guessColumns, parseCSV, readCatalogFile, readXlsx,
  toArticles, unzip };

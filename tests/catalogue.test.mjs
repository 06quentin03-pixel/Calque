// Tests de la phase 2 (préparation) : lecture des catalogues fabricants CSV et Excel, sans les fichiers de l'utilisateur.
// Les données ci-dessous sont des données de TEST (références « TEST-… », fabricant « Exemple ») : elles ne sont pas
// présentes dans l'application. Lancer depuis la racine du dépôt :  node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './outils.mjs';

const CA = await import(path.join(ROOT, 'js', 'catalogue.js'));

/* encodage Windows-1252 (CSV enregistré par Excel en France) */
function cp1252(s) { const m = { '€': 0x80, '’': 0x92, 'œ': 0x9c }; return Uint8Array.from([...s].map((c) => m[c] ?? c.charCodeAt(0))); }

test('CSV : encodage, séparateur, guillemets et retours à la ligne', () => {
  const t = 'Référence;Désignation;Marque;Prix public HT\r\nTEST-001;"Disjoncteur 1P+N 20 A ; courbe C";Exemple;12,50 €\r\nTEST-002;"Prise ""étanche""\nIP55";Exemple;\r\n;;;\r\n';
  const win = CA.decodeText(cp1252(t));
  assert.equal(win.encoding, 'windows-1252');
  const utf = CA.decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(t)]));
  assert.equal(utf.encoding, 'utf-8'); assert.equal(utf.text, win.text, 'même texte quel que soit l’encodage');
  const p = CA.parseCSV(win.text);
  assert.equal(p.delimiter, ';');
  assert.equal(p.rows.length, 3, 'ligne vide ignorée');
  assert.equal(p.rows[1][1], 'Disjoncteur 1P+N 20 A ; courbe C');
  assert.equal(p.rows[2][1], 'Prise "étanche"\nIP55');
  assert.equal(CA.detectDelimiter('a,b,c\n1,2,3'), ',');
  assert.equal(CA.detectDelimiter('a\tb\tc'), '\t');
});

test('colonnes reconnues et articles : aucune valeur inventée, doublons et lignes vides comptés', () => {
  const rows = [['Catalogue de test'], ['Réf. fabricant', 'Libellé', 'Code EAN', 'Famille'],
    ['TEST-001', 'Interrupteur différentiel 40 A 30 mA type A', '', 'Protection'],
    ['TEST-001', 'doublon', '', ''], ['', '', '', ''], ['', 'Article sans référence', '', ''], ['TEST-003', '', '', '']];
  const r = CA.toArticles(rows, { fab: 'Exemple', source: 'test.csv', officiel: true });
  assert.equal(r.headerIndex, 1);
  assert.deepEqual(r.map, { ref: 0, n: 1, ean: 2, fam: 3 });
  assert.deepEqual(r.stats, { lignes: 5, gardees: 3, vides: 1, doublons: 1 });
  const [a, b, c] = r.articles;
  assert.deepEqual([a.ref, a.fab, a.fiab, a.source, a.fam], ['TEST-001', 'Exemple', 'verifiee', 'test.csv', 'Protection']);
  assert.ok(!('ean' in a), 'EAN absent : champ absent, pas de valeur inventée');
  assert.deepEqual(b.manque, ['référence']);
  assert.equal(c.n, '', 'désignation absente laissée vide');
  assert.equal(CA.toArticles(rows, { fab: 'Exemple' }).articles[0].fiab, 'saisie', 'sans confirmation : « saisie »');
  assert.match(CA.toArticles([['a', 'b'], ['1', '2']]).erreur, /intitulés/);
});

/* petite archive .xlsx fabriquée pour le test (une entrée compressée, les autres stockées) */
async function deflateRaw(u8) { return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); }
function crc32(u8) { let c, crc = 0xffffffff; for (const b of u8) { c = (crc ^ b) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
async function makeZip(files) {
  const parts = [], central = []; let off = 0;
  for (const [name, text, deflate] of files) {
    const raw = new TextEncoder().encode(text), data = deflate ? await deflateRaw(raw) : raw, nm = new TextEncoder().encode(name);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(8, deflate ? 8 : 0, true); lh.setUint32(14, crc32(raw), true); lh.setUint32(18, data.length, true); lh.setUint32(22, raw.length, true); lh.setUint16(26, nm.length, true);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(10, deflate ? 8 : 0, true); ch.setUint32(16, crc32(raw), true); ch.setUint32(20, data.length, true); ch.setUint32(24, raw.length, true); ch.setUint16(28, nm.length, true); ch.setUint32(42, off, true);
    parts.push(new Uint8Array(lh.buffer), nm, data); central.push(new Uint8Array(ch.buffer), nm);
    off += 30 + nm.length + data.length;
  }
  const cdSize = central.reduce((s, x) => s + x.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, off, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((s, x) => s + x.length, 0)); let p = 0; for (const x of all) { out.set(x, p); p += x.length; }
  return out;
}

test('Excel .xlsx : feuilles, chaînes partagées, texte en ligne, cellules vides', async () => {
  const xlsx = await makeZip([
    ['xl/workbook.xml', '<?xml version="1.0"?><workbook xmlns:r="r"><sheets><sheet name="Tarif &amp; articles" sheetId="1" r:id="rId1"/></sheets></workbook>'],
    ['xl/_rels/workbook.xml.rels', '<Relationships><Relationship Id="rId1" Type="x" Target="worksheets/sheet1.xml"/></Relationships>'],
    ['xl/sharedStrings.xml', '<sst><si><t>Référence</t></si><si><t>Désignation</t></si><si><r><t>Câble </t></r><r><t xml:space="preserve">R2V 3G2,5 mm²</t></r></si><si><t>TEST-010</t></si></sst>', true],
    ['xl/worksheets/sheet1.xml', '<worksheet><sheetData>' +
      '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Prix HT</t></is></c></row>' +
      '<row r="2"><c r="A2" t="s"><v>3</v></c><c r="B2" t="s"><v>2</v></c><c r="C2"/><c r="D2"><v>1.25</v></c></row>' +
      '<row r="3"><c r="A3" t="inlineStr"><is><t>TEST-011 &lt;b&gt;</t></is></c></row></sheetData></worksheet>', true],
  ]);
  const { sheets } = await CA.readXlsx(xlsx);
  assert.equal(sheets.length, 1);
  assert.equal(sheets[0].name, 'Tarif & articles');
  assert.deepEqual(sheets[0].rows, [['Référence', 'Désignation', '', 'Prix HT'], ['TEST-010', 'Câble R2V 3G2,5 mm²', '', '1.25'], ['TEST-011 <b>']]);
  const r = CA.toArticles(sheets[0].rows, { fab: 'Exemple', source: 'tarif.xlsx' });
  assert.deepEqual(r.articles.map((a) => [a.ref, a.n, a.prix]), [['TEST-010', 'Câble R2V 3G2,5 mm²', '1.25'], ['TEST-011 <b>', '', undefined]]);
  /* lecture par nom de fichier */
  const f = await CA.readCatalogFile('tarif.xlsx', xlsx);
  assert.equal(f.kind, 'xlsx');
  await assert.rejects(CA.readCatalogFile('ancien.xls', new Uint8Array(8)), /xls/);
  await assert.rejects(CA.readXlsx(new Uint8Array(40)), /zip/);
});

test('le catalogue n’est pas encore branché sur l’interface et ne contient aucune donnée', () => {
  const src = fs.readFileSync(path.join(ROOT, 'js', 'catalogue.js'), 'utf8');
  assert.ok(!/TEST-0|Exemple/.test(src), 'aucune donnée de test dans le module');
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert.ok(sw.includes("'./js/catalogue.js'"), 'disponible hors ligne');
});

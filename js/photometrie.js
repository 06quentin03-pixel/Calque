/* Calque — module « photométrie » : données photométriques des luminaires (fichiers IES / LDT).
   JavaScript pur, sans accès à l'écran : testable avec Node.

   Photométrie enregistrée dans le plan (`P.photometries[]`, format v7) :
   { id, name (luminaire), fab (fabricant, tel qu'écrit dans le fichier), file (nom du fichier), fmt ('ies' | 'ldt'),
     flux { v (lm), st, src }, p { v (W), st, src } (facultatif), C [angles C en degrés, croissants, dans [0, 360[ ;
     un seul plan = répartition de révolution], G [angles γ en degrés, croissants, 0 = vers le bas],
     I [[intensité en cd pour chaque γ] pour chaque C] }. */

/* ---------------- intensité I(C, γ) en candelas (interpolation bilinéaire) ---------------- */
function encadre(a, x) {
  // indices i, j et poids t tels que x ≈ a[i] + t (a[j] - a[i]) ; a croissant
  if (x <= a[0]) return [0, 0, 0];
  const n = a.length; if (x >= a[n - 1]) return [n - 1, n - 1, 0];
  let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (a[m] <= x) lo = m; else hi = m; }
  const d = a[hi] - a[lo]; return [lo, hi, d > 0 ? (x - a[lo]) / d : 0];
}
function intensitePhotometrie(ph, C, g) {
  const G = ph.G, Cs = ph.C, I = ph.I;
  if (!G || !G.length || !I || !I.length) return 0;
  if (g < G[0] - 1e-9 || g > G[G.length - 1] + 1e-9) return 0; // hors des angles mesurés : rien n'est émis
  const [g0, g1, tg] = encadre(G, g);
  const plan = (k) => I[k][g0] + (I[k][g1] - I[k][g0]) * tg;
  if (Cs.length === 1) return plan(0);
  let c = ((C % 360) + 360) % 360;
  // plans C répartis sur [0, 360[ : interpolation entre le dernier plan et le premier (+ 360°)
  const n = Cs.length;
  if (c < Cs[0]) c += 360;
  let k0 = n - 1, k1 = 0, t = 0;
  for (let k = 0; k < n; k++) {
    const a = Cs[k], b = k + 1 < n ? Cs[k + 1] : Cs[0] + 360;
    if (c >= a && c <= b) { k0 = k; k1 = (k + 1) % n; t = b > a ? (c - a) / (b - a) : 0; break; }
  }
  return plan(k0) + (plan(k1) - plan(k0)) * t;
}

/* ---------------- flux d'une répartition : Φ = ∫ I dΩ ----------------
   intégration numérique (règle des trapèzes en γ, moyenne des plans en C) ; résultat en lumens */
function fluxIntegre(ph) {
  const G = ph.G, n = ph.C.length;
  if (!G || G.length < 2) return 0;
  // poids angulaire de chaque plan C (demi-intervalles de part et d'autre, cycliquement)
  const w = [];
  if (n === 1) w.push(2 * Math.PI);
  else for (let k = 0; k < n; k++) {
    const prev = k ? ph.C[k - 1] : ph.C[n - 1] - 360, next = k + 1 < n ? ph.C[k + 1] : ph.C[0] + 360;
    w.push((((next - prev) / 2) * Math.PI) / 180);
  }
  let s = 0;
  for (let k = 0; k < n; k++) {
    let sk = 0;
    for (let j = 1; j < G.length; j++) {
      const a = (G[j - 1] * Math.PI) / 180, b = (G[j] * Math.PI) / 180;
      // ∫ I(γ) sin γ dγ sur [a, b], I linéaire en γ : formule exacte par morceaux
      const Ia = ph.I[k][j - 1], Ib = ph.I[k][j], d = b - a; if (d <= 0) continue;
      const m = (Ib - Ia) / d; // I(γ) = Ia + m (γ − a)
      const F = (x) => -(Ia + m * (x - a)) * Math.cos(x) + m * Math.sin(x);
      sk += F(b) - F(a);
    }
    s += w[k] * sk;
  }
  return s;
}

/* ---------------- nettoyage (migration et ouverture d'un plan) ---------------- */
function cleanD(d, ok) {
  if (!d || typeof d !== 'object' || !Number.isFinite(d.v) || (ok && !ok(d.v))) return null;
  const src = typeof d.src === 'string' ? d.src.trim() : '';
  let st = ['verifiee', 'saisie', 'estimee'].includes(d.st) ? d.st : 'saisie';
  if (st === 'verifiee' && !src) st = 'saisie';
  return src ? { v: d.v, st, src } : { v: d.v, st };
}
const croissant = (a) => Array.isArray(a) && a.length > 0 && a.every((x, i) => Number.isFinite(x) && (!i || x > a[i - 1]));
/* photométrie valide ou null (tableau d'intensités cohérent avec les angles, flux positif) */
function nettoyerPhotometrie(ph) {
  if (!ph || typeof ph !== 'object' || typeof ph.id !== 'string' || !ph.id) return null;
  if (!croissant(ph.C) || !croissant(ph.G) || ph.C[0] < 0 || ph.C[ph.C.length - 1] >= 360 || ph.G[0] < 0 || ph.G[ph.G.length - 1] > 180) return null;
  if (!Array.isArray(ph.I) || ph.I.length !== ph.C.length || !ph.I.every((r) => Array.isArray(r) && r.length === ph.G.length && r.every((x) => Number.isFinite(x) && x >= 0))) return null;
  const flux = cleanD(ph.flux, (v) => v > 0 && v < 1e7); if (!flux) return null;
  const o = { id: ph.id, name: typeof ph.name === 'string' ? ph.name.slice(0, 200) : 'Luminaire', fab: typeof ph.fab === 'string' ? ph.fab.slice(0, 200) : '',
    file: typeof ph.file === 'string' ? ph.file.slice(0, 200) : '', fmt: ph.fmt === 'ldt' ? 'ldt' : 'ies', flux, C: ph.C.slice(), G: ph.G.slice(), I: ph.I.map((r) => r.slice()) };
  const p = cleanD(ph.p, (v) => v > 0 && v < 1e6); if (p) o.p = p;
  if (Number.isFinite(ph.fluxLampes) && ph.fluxLampes > 0) o.fluxLampes = ph.fluxLampes;
  return o;
}

/* ---------------- lecture des fichiers ----------------
   Aucun résultat n'est inventé : un fichier illisible, incomplet ou d'un type non pris en charge renvoie
   { erreur: 'texte' } et rien n'est ajouté au plan.
   Flux du luminaire : calculé en intégrant la répartition lue dans le fichier (c'est la lumière qui sort du
   luminaire) ; le flux déclaré par le fichier (lampes × rendement) est gardé pour comparaison. */
const MAX_VALEURS = 200000;
const arrondi = (v) => Math.round(v * 100) / 100;
const presque = (a, b) => Math.abs(a - b) < 1e-6;
/* complète une répartition donnée sur une partie des plans C grâce à sa symétrie.
   base : [{ c, row }] plans lus ; image(c) : angle d'un plan lu équivalent à c ; angles : tous les plans C voulus */
function completer(base, angles, image) {
  const C = [...new Set(angles.map((c) => Math.round((((c % 360) + 360) % 360) * 1e6) / 1e6))].sort((a, b) => a - b);
  const I = C.map((c) => {
    const b = image(c), r = base.find((x) => presque(x.c, b) || presque(x.c, b + 360) || presque(x.c + 360, b));
    if (!r) throw new Error(`plan C ${c}° introuvable`);
    return r.row.slice();
  });
  return { C, I };
}
function finir(o, nom, fmtF) {
  if (o.C.length * o.G.length > MAX_VALEURS) return { erreur: 'Fichier trop détaillé pour être enregistré dans le plan.' };
  if (!o.G.every((g, i) => g >= 0 && g <= 180 && (!i || g > o.G[i - 1]))) return { erreur: 'Angles verticaux (γ) incohérents.' };
  const ph = { C: o.C, G: o.G, I: o.I.map((r) => r.map(arrondi)) };
  const flux = fluxIntegre(ph);
  if (!(flux > 0)) return { erreur: 'La répartition lue ne contient aucune lumière.' };
  const src = `Fichier ${fmtF.toUpperCase()} « ${nom || 'sans nom'} »${o.fab ? ' (' + o.fab + ')' : ''}`;
  const res = Object.assign(ph, { name: o.name || nom || 'Luminaire', fab: o.fab || '', file: nom || '', fmt: fmtF,
    flux: { v: Math.round(flux * 10) / 10, st: 'verifiee', src: src + ' : flux calculé en intégrant la répartition' } });
  if (o.watts > 0) res.p = { v: o.watts, st: 'verifiee', src: src + ' : puissance indiquée par le fichier' };
  if (o.fluxDeclare > 0) res.fluxLampes = Math.round(o.fluxDeclare * 10) / 10;
  return res;
}

/* IES (IESNA LM-63, versions 1986 à 2019), photométrie de type C */
function lireIES(texte, nom) {
  if (typeof texte !== 'string' || !texte.trim()) return { erreur: 'Fichier vide.' };
  const lignes = texte.replace(/\r\n?/g, '\n').split('\n');
  const mots = {}; let i = 0;
  for (; i < lignes.length; i++) {
    const l = lignes[i].trim();
    const m = /^\[([^\]]+)\]\s*(.*)$/.exec(l);
    if (m) { const k = m[1].toUpperCase(); if (!mots[k]) mots[k] = m[2].trim(); continue; }
    if (/^TILT\s*=/i.test(l)) break;
  }
  if (i >= lignes.length) return { erreur: 'Ce n’est pas un fichier IES (ligne « TILT= » absente).' };
  const tilt = lignes[i].trim().replace(/^TILT\s*=\s*/i, '').toUpperCase();
  const nums = lignes.slice(i + 1).join(' ').split(/[\s,]+/).filter(Boolean).map(Number);
  if (nums.some((x) => !Number.isFinite(x))) return { erreur: 'Valeur non numérique dans les données du fichier IES.' };
  let k = 0;
  const lire = (n) => { if (k + n > nums.length) throw new Error('court'); const a = nums.slice(k, k + n); k += n; return a; };
  try {
    if (tilt === 'INCLUDE') { lire(1); const n = lire(1)[0]; lire(2 * n); } // géométrie lampe et facteurs d'inclinaison : sans effet sur le flux
    const [nLampes, lmLampe, mult, nV, nH, type] = lire(10);
    const [fBallast, fLampe, watts] = lire(3);
    if (type !== 1) return { erreur: `Photométrie de type ${type === 2 ? 'B' : type === 3 ? 'A' : '?'} : seul le type C (luminaires d'intérieur) est pris en charge.` };
    if (!(nV >= 2 && nH >= 1 && Number.isInteger(nV) && Number.isInteger(nH))) return { erreur: 'Nombre d’angles incohérent.' };
    const G = lire(nV), H = lire(nH), vals = lire(nV * nH);
    const f = (mult || 1) * (fBallast || 1) * (fLampe || 1);
    const base = H.map((c, j) => ({ c, row: vals.slice(j * nV, (j + 1) * nV).map((v) => v * f) }));
    const h0 = H[0], h1 = H[H.length - 1];
    let C, I;
    if (nH === 1 || presque(h1, h0)) { C = [0]; I = [base[0].row]; }
    else if (presque(h0, 0) && presque(h1, 90)) ({ C, I } = completer(base, H.flatMap((c) => [c, 180 - c, 180 + c, 360 - c]).filter((c) => c < 360), (c) => { const x = c % 180; return x > 90 ? 180 - x : x; }));
    else if (presque(h0, 0) && presque(h1, 180)) ({ C, I } = completer(base, H.flatMap((c) => [c, 360 - c]).filter((c) => c < 360), (c) => (c > 180 ? 360 - c : c)));
    else if (presque(h0, 90) && presque(h1, 270)) ({ C, I } = completer(base, H.flatMap((c) => [c, (540 - c) % 360]), (c) => (c >= 90 && c <= 270 ? c : (540 - c) % 360)));
    else if (presque(h0, 0) && h1 > 180 && h1 <= 360) { const b = presque(h1, 360) ? base.slice(0, -1) : base; C = b.map((x) => x.c); I = b.map((x) => x.row); }
    else return { erreur: `Plans horizontaux non pris en charge (${h0}° à ${h1}°).` };
    const declare = lmLampe > 0 && nLampes > 0 ? lmLampe * nLampes * (fBallast || 1) : 0; // −1 : photométrie absolue (pas de flux des lampes)
    return finir({ C, G, I, watts, fluxDeclare: declare, name: mots.LUMINAIRE || mots.LUMCAT || '', fab: mots.MANUFAC || '' }, nom, 'ies');
  } catch (e) {
    return { erreur: e.message === 'court' ? 'Fichier IES incomplet : il manque des valeurs.' : 'Fichier IES illisible : ' + e.message + '.' };
  }
}

/* LDT (EULUMDAT) */
function lireLDT(texte, nom) {
  if (typeof texte !== 'string' || !texte.trim()) return { erreur: 'Fichier vide.' };
  const L = texte.replace(/\r\n?/g, '\n').split('\n');
  let k = 0;
  const ligne = () => { if (k >= L.length) throw new Error('court'); return L[k++].trim(); };
  const num = () => { const t = ligne().replace(',', '.'); const v = Number(t); if (t === '' || !Number.isFinite(v)) throw new Error('nombre'); return v; };
  try {
    const fab = ligne(); num(); const Isym = num(); const Mc = num(); num(); const Ng = num(); num();
    ligne(); const nomLum = ligne(); ligne(); ligne(); ligne();
    for (let j = 0; j < 10; j++) num(); // lignes 13 à 22 : dimensions, zone lumineuse, part du flux vers le bas
    const lorl = num(), cf = num(); num();
    const n = num(); if (!(n >= 1 && Number.isInteger(n))) return { erreur: 'Nombre de jeux de lampes incohérent.' };
    const nbL = [], flux = [], watts = [];
    for (let j = 0; j < n; j++) nbL.push(num());
    for (let j = 0; j < n; j++) ligne();
    for (let j = 0; j < n; j++) flux.push(num());
    for (let j = 0; j < n; j++) ligne();
    for (let j = 0; j < n; j++) ligne();
    for (let j = 0; j < n; j++) watts.push(num());
    for (let j = 0; j < 10; j++) num(); // rapports directs
    if (![0, 1, 2, 3, 4].includes(Isym) || !(Mc >= 1 && Ng >= 2) || !Number.isInteger(Mc) || !Number.isInteger(Ng)) return { erreur: 'En-tête EULUMDAT incohérent (symétrie ou nombre d’angles).' };
    const Ca = []; for (let j = 0; j < Mc; j++) Ca.push(num());
    const G = []; for (let j = 0; j < Ng; j++) G.push(num());
    // plans enregistrés selon la symétrie (indices à partir de 1, Mc1 à Mc2)
    let Mc1 = 1, Mc2 = Mc;
    if (Isym === 1) Mc2 = 1;
    else if (Isym === 2) Mc2 = Mc / 2 + 1;
    else if (Isym === 3) { Mc1 = (3 * Mc) / 4 + 1; Mc2 = Mc1 + Mc / 2; }
    else if (Isym === 4) Mc2 = Mc / 4 + 1;
    if (!Number.isInteger(Mc1) || !Number.isInteger(Mc2)) return { erreur: 'Nombre de plans C incompatible avec la symétrie indiquée.' };
    const phiL = flux[0] || 0; // premier jeu de lampes (usage courant)
    if (!(phiL > 0)) return { erreur: 'Flux des lampes absent : impossible de convertir les intensités (cd/klm).' };
    const kcd = (phiL / 1000) * (cf || 1);
    const base = [];
    for (let m = Mc1; m <= Mc2; m++) {
      const row = []; for (let j = 0; j < Ng; j++) row.push(num() * kcd);
      const c = Isym === 1 ? 0 : Ca[(m - 1) % Mc] + (m > Mc ? 360 : 0);
      base.push({ c: c % 360, row });
    }
    let C, I;
    if (Isym === 1) { C = [0]; I = [base[0].row]; }
    else if (Isym === 0) { C = base.map((x) => x.c); I = base.map((x) => x.row); const o = C.map((c, j) => j).sort((a, b) => C[a] - C[b]); C = o.map((j) => C[j]); I = o.map((j) => I[j]); }
    else if (Isym === 2) ({ C, I } = completer(base, Ca, (c) => (c > 180 ? 360 - c : c)));
    else if (Isym === 3) ({ C, I } = completer(base, Ca, (c) => (c > 90 && c < 270 ? (540 - c) % 360 : c)));
    else ({ C, I } = completer(base, Ca, (c) => { const x = c % 180; return x > 90 ? 180 - x : x; }));
    const declare = phiL * (lorl > 0 ? lorl / 100 : 1);
    return finir({ C, G, I, watts: watts[0] > 0 ? watts[0] : 0, fluxDeclare: declare, name: nomLum, fab: fab }, nom, 'ldt');
  } catch (e) {
    return { erreur: e.message === 'court' ? 'Fichier LDT incomplet : il manque des lignes.' : e.message === 'nombre' ? 'Fichier LDT illisible : valeur non numérique.' : 'Fichier LDT illisible : ' + e.message + '.' };
  }
}
/* choix du lecteur d'après l'extension, sinon d'après le contenu */
function lireFichierPhotometrique(texte, nom) {
  const ext = String(nom || '').toLowerCase().split('.').pop();
  if (ext === 'ies') return lireIES(texte, nom);
  if (ext === 'ldt') return lireLDT(texte, nom);
  if (/^\s*IESNA|TILT\s*=/im.test(texte || '')) return lireIES(texte, nom);
  return { erreur: 'Choisissez un fichier .ies ou .ldt (données photométriques du fabricant).' };
}

export { encadre, fluxIntegre, intensitePhotometrie, lireFichierPhotometrique, lireIES, lireLDT, nettoyerPhotometrie };

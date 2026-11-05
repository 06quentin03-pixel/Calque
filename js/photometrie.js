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

export { encadre, fluxIntegre, intensitePhotometrie, nettoyerPhotometrie };

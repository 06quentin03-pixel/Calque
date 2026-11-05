// Fichiers photométriques DE SYNTHÈSE pour les tests (aucune donnée de fabricant).
// Répartition connue : I(C, γ) = I0 cos γ (1 + 0,5 cos 2C), dont le flux vaut exactement Φ = π I0 (moyenne de cos 2C nulle).
const rad = (d) => d * Math.PI / 180;
export function iesSynthese({ flux = 1000, watts = 12.5, H = [0, 45, 90], type = 1, lm = -1 } = {}) {
  const G = []; for (let g = 0; g <= 90; g += 5) G.push(g);
  const I0 = flux / Math.PI;
  const rows = H.map((c) => G.map((g) => (I0 * Math.cos(rad(g)) * (1 + 0.5 * Math.cos(rad(2 * c)))).toFixed(3)));
  return ['IESNA:LM-63-2002', '[TEST] Fichier de synthèse Calque', '[MANUFAC] Essai', '[LUMINAIRE] Downlight de synthèse', 'TILT=NONE',
    `1 ${lm} 1 ${G.length} ${H.length} ${type} 2 0.2 0.2 0`, `1 1 ${watts}`, G.join(' '), H.join(' '), ...rows.map((r) => r.join(' '))].join('\r\n');
}
export function ldtSynthese({ phiL = 2000, lorl = 80, watts = 20, Isym = 4, Mc = 24 } = {}) {
  const Dc = 360 / Mc, Ca = []; for (let i = 0; i < Mc; i++) Ca.push(i * Dc);
  const G = []; for (let g = 0; g <= 180; g += 5) G.push(g);
  const I0 = (phiL * lorl / 100) / Math.PI, v0 = I0 / (phiL / 1000);
  const v = (c, g) => (g <= 90 ? v0 * Math.cos(rad(g)) * (1 + 0.5 * Math.cos(rad(2 * c))) : 0);
  let planes;
  if (Isym === 1) planes = [0];
  else if (Isym === 4) planes = Ca.filter((c) => c <= 90);
  else if (Isym === 2) planes = Ca.filter((c) => c <= 180);
  else if (Isym === 3) planes = [...Ca.filter((c) => c >= 270), ...Ca.filter((c) => c <= 90)];
  else planes = Ca;
  const L = ['Essai Calque (synthèse)', '1', String(Isym), String(Mc), String(Dc), String(G.length), '5', 'R-0', 'Luminaire de synthèse', 'N-0', 'synth.ldt', '2026-11-05',
    '600', '600', '50', '580', '580', '0', '0', '0', '0', '100', String(lorl), '1', '0', '1', '1', 'LED', String(phiL), '4000', '80', String(watts),
    ...Array(10).fill('0.5'), ...Ca.map(String), ...G.map(String)];
  for (const c of planes) for (const g of G) L.push(v(Isym === 1 ? 0 : c, g).toFixed(3).replace('.', ','));
  return L.join('\r\n');
}

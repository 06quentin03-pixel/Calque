/* Calque — module « calculs du fond de plan » : mise à l'échelle, rotation, position.
   Module JavaScript natif, sans accès à l'écran (testable avec Node).

   Un fond de plan (P.fonds[]) : { id, lv, img (clé dans P.fondImg), name, wpx, hpx (taille de l'image en pixels),
     s (centimètres réels par pixel), cx, cy (centre, en cm), rot (0, 90, 180 ou 270), op (opacité 0,1 à 1),
     visible, cal (true si l'échelle a été réglée : par 2 points ou par l'échelle du PDF) } */

const PT_CM = 2.54 / 72; // un point PDF (1/72 de pouce) en centimètres sur le papier

/* taille réelle (cm) une fois tourné */
function fondSize(f) {
  const w = f.wpx * f.s, h = f.hpx * f.s;
  return f.rot % 180 ? { w: h, h: w } : { w, h };
}
function fondBBox(f) { const z = fondSize(f); return { x0: f.cx - z.w / 2, y0: f.cy - z.h / 2, x1: f.cx + z.w / 2, y1: f.cy + z.h / 2 }; }

/* mise à l'échelle par deux points : A et B (en cm sur le plan) doivent être distants de `real` cm.
   Le point A reste en place ; l'image grandit ou rétrécit autour de lui. */
function calibrate(f, A, B, real) {
  const d = Math.hypot(B.x - A.x, B.y - A.y);
  if (!(d > 0.01) || !(real > 0)) return null;
  const k = real / d;
  return Object.assign({}, f, { s: f.s * k, cx: A.x + (f.cx - A.x) * k, cy: A.y + (f.cy - A.y) * k, cal: true });
}
/* PDF imprimé à l'échelle 1/e, image rendue à `k` pixels par point : centimètres réels par pixel */
function pdfScale(e, k) { return (PT_CM * e) / k; }
/* rotation d'un quart de tour autour du centre (dir = 1 : sens horaire) */
function rotate90(f, dir) { return Object.assign({}, f, { rot: (((f.rot || 0) + (dir < 0 ? 270 : 90)) % 360) }); }
/* échelle initiale (avant réglage) : l'image occupe 80 % de la zone visible */
function fitScale(wpx, hpx, view) { return Math.min((view.w * 0.8) / wpx, (view.h * 0.8) / hpx); }
/* « 3,50 m », « 350 », « 350 cm », « 3.5m » → centimètres */
function parseLength(txt) {
  const t = String(txt || '').trim().toLowerCase().replace(',', '.').replace(/\s+/g, '');
  const m = t.match(/^(\d+(?:\.\d+)?)(mm|cm|m)?$/);
  if (!m) return null;
  const v = parseFloat(m[1]), u = m[2] || 'cm';
  const cm = u === 'm' ? v * 100 : u === 'mm' ? v / 10 : v;
  return cm > 0 ? cm : null;
}
/* taille de rendu : côté le plus long limité (mémoire de l'iPad), sans agrandir au-delà de `maxUp` */
function renderSize(w, h, maxSide, maxUp) {
  const k = Math.min(maxSide / Math.max(w, h), maxUp || 1);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)), k };
}

export { PT_CM, calibrate, fitScale, fondBBox, fondSize, parseLength, pdfScale, renderSize, rotate90 };

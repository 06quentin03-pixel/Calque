/* Calque — module « fond de plan » : un plan existant (image ou PDF) placé sous le dessin, par niveau,
   pour le recopier. Mise à l'échelle par deux points (ou par l'échelle d'impression du PDF), transparence,
   déplacement, rotation. Le fond n'est jamais exporté (PDF/PNG) : il ne sert qu'à dessiner.
   Module JavaScript natif (aucune compilation). */
import { DEG, EXT, P, ui, uid } from './noyau.js';
import { V } from './rendu2d.js';
import { commit, cv, requestRender } from './interaction.js';
import { btn, btns, closeModal, confirmBtn, h, openModal, renderInspector, sec, setTool, toast, updateHint } from './interface.js';
import { calibrate, fitScale, fondSize, parseLength, pdfScale, renderSize, rotate90 } from './fondcalc.js';

const MAX_SIDE = 4096;          // côté le plus long de l'image gardée (pixels) : lisible, et supportable par l'iPad
const MAX_CHARS = 14e6;         // taille maximale de l'image enregistrée (≈ 10 Mo)
const PDF_K = 4;                // rendu d'un PDF : 4 pixels par point (≈ 288 ppp)

const fondOf = (lv) => (P.fonds || []).find((f) => f.lv === lv) || null;

/* ---- images décodées (mémoire seulement) ---- */
const IMG = new Map(); // clé → { img, ok, src }
function imgOf(key) {
  const src = P.fondImg && P.fondImg[key]; if (!src) return null;
  let e = IMG.get(key);
  if (!e || e.src !== src) {
    const img = new Image();
    e = { img, ok: false, src };
    img.onload = () => { e.ok = true; requestRender(); };
    img.onerror = () => { e.ok = false; };
    img.src = src;
    IMG.set(key, e);
  }
  return e.ok ? e.img : null;
}

/* ---- dessin sous les murs (jamais dans les exports) ---- */
EXT.under.push((c, lv, opts) => {
  if (opts && opts.export) return;
  const f = fondOf(lv); if (!f || f.visible === false) return;
  const img = imgOf(f.img); if (!img) return;
  const w = f.wpx * f.s, hh = f.hpx * f.s;
  c.globalAlpha = Math.min(1, Math.max(0.05, f.op ?? 0.5));
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.translate(f.cx, f.cy); c.rotate((f.rot || 0) * DEG);
  c.drawImage(img, -w / 2, -hh / 2, w, hh);
});

/* ---- lecture du fichier ---- */
function loadImage(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('image')); i.src = url; });
}
/* convertit en JPEG de taille raisonnable ; renvoie { src, wpx, hpx, k } (k : agrandissement appliqué) */
function rasterize(img, maxUp) {
  const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
  if (!W || !H) throw new Error('vide');
  const z = renderSize(W, H, MAX_SIDE, maxUp);
  const cvs = document.createElement('canvas'); cvs.width = z.w; cvs.height = z.h;
  const c = cvs.getContext('2d');
  c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, z.w, z.h); // un PDF ou un PNG transparent : fond blanc
  c.imageSmoothingQuality = 'high';
  c.drawImage(img, 0, 0, z.w, z.h);
  let src = cvs.toDataURL('image/jpeg', 0.86);
  if (src.length > MAX_CHARS) src = cvs.toDataURL('image/jpeg', 0.7);
  if (src.length > MAX_CHARS) throw new Error('trop-lourd');
  return { src, wpx: z.w, hpx: z.h, k: z.k };
}
async function readFond(file) {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  const url = URL.createObjectURL(file);
  try {
    let img;
    try { img = await loadImage(url); } catch (e) {
      throw new Error(isPdf ? 'pdf' : 'image');
    }
    /* PDF : Safari (iPad) affiche la première page comme une image ; on la rend 4 fois plus fine pour la lisibilité */
    const r = rasterize(img, isPdf ? PDF_K : 1);
    return Object.assign(r, { isPdf, ptW: isPdf ? img.naturalWidth : 0 });
  } finally { URL.revokeObjectURL(url); }
}
const ERR = {
  pdf: 'Ce navigateur ne sait pas ouvrir ce PDF comme une image. Sur iPad (Safari), la première page est importée. Sinon, enregistrez la page en image (capture d’écran ou export JPEG/PNG) et importez l’image.',
  image: 'Ce fichier n’est pas une image lisible (formats conseillés : JPEG, PNG, HEIC sur iPad).',
  'trop-lourd': 'Image trop lourde, même réduite. Recadrez-la ou réduisez-la, puis réessayez.',
  vide: 'Image vide.',
};

/* ---- import ---- */
let fileIn = null;
function pickFond() {
  if (!fileIn) {
    fileIn = h('input', { type: 'file', accept: 'image/*,application/pdf,.pdf', hidden: true, id: 'fondIn' });
    fileIn.addEventListener('change', async () => {
      const f = fileIn.files && fileIn.files[0]; fileIn.value = '';
      if (f) await importFond(f);
    });
    document.body.append(fileIn);
  }
  fileIn.click();
}
async function importFond(file) {
  toast('Lecture du fichier…');
  let r;
  try { r = await readFond(file); } catch (e) { openModal('Import impossible', h('p', null, ERR[e.message] || ERR.image), btns(btn('Fermer', closeModal))); return false; }
  const old = fondOf(ui.lv);
  const view = { w: cv.clientWidth / V.s, h: cv.clientHeight / V.s };
  const center = { x: (cv.clientWidth / 2 - V.ox) / V.s, y: (cv.clientHeight / 2 - V.oy) / V.s };
  const key = uid('img');
  P.fondImg[key] = r.src;
  const f = { id: uid('f'), lv: ui.lv, img: key, name: file.name.slice(0, 120), wpx: r.wpx, hpx: r.hpx,
    s: fitScale(r.wpx, r.hpx, view), cx: Math.round(center.x), cy: Math.round(center.y), rot: 0, op: 0.5, visible: true, cal: false };
  if (r.isPdf) f.pdfK = r.k; // pixels par point PDF, pour l'échelle d'impression
  if (old) { P.fonds.splice(P.fonds.indexOf(old), 1); if (!P.fonds.some((x) => x.img === old.img)) delete P.fondImg[old.img]; }
  P.fonds.push(f);
  commit(); requestRender();
  afterImport(f);
  return true;
}
function afterImport(f) {
  const kb = Math.round(P.fondImg[f.img].length * 0.75 / 1024);
  openModal('Fond de plan importé',
    h('p', null, `« ${f.name} » est placé sous le niveau « ${(P.levels.find((l) => l.id === f.lv) || {}).name} », à 50 % de transparence (${kb} Ko).`),
    h('p', { class: 'note' }, 'Il faut maintenant le mettre à l’échelle pour que les longueurs dessinées soient justes.'),
    f.pdfK ? pdfScaleRow(f) : null,
    btns(btn('Mettre à l’échelle par 2 points', () => { closeModal(); startCal(); }, 'pri'), btn('Plus tard', closeModal)));
}
/* PDF imprimé à une échelle connue (1:50, 1:100…) : échelle directe, sans mesure */
function pdfScaleRow(f) {
  const set = (e) => { Object.assign(f, { s: pdfScale(e, f.pdfK), cal: true, pdfE: e }); commit(); closeModal(); renderInspector(); toast(`Échelle 1:${e} appliquée.`); };
  return h('div', { class: 'fld' }, h('span', null, 'Plan PDF à l’échelle d’impression connue :'),
    h('div', { class: 'chips' }, [20, 50, 100, 200, 500].map((e) => h('button', { type: 'button', class: 'chip', onclick: () => set(e) }, '1:' + e))),
    h('p', { class: 'note' }, 'Seulement si le PDF n’a pas été agrandi ni réduit. En cas de doute, utilisez la mise à l’échelle par 2 points.'));
}

/* ---- outil « mise à l'échelle par 2 points » ---- */
const CAL = { a: null, b: null, cur: null };
function startCal() {
  const f = fondOf(ui.lv); if (!f) return;
  if (f.visible === false) f.visible = true;
  CAL.a = CAL.b = CAL.cur = null;
  setTool('fondcal');
}
EXT.tools.fondcal = {
  down(wp, sp) {
    let moved = false;
    return {
      move(wp2, sp2) { if (Math.hypot(sp2.x - sp.x, sp2.y - sp.y) > 10) moved = true; },
      up(wp2) {
        if (moved) return; // un glissé n'est pas un point
        if (!CAL.a) { CAL.a = wp2; requestRender(true); updateHint(); return; }
        CAL.b = wp2; requestRender(true); updateHint(); askDistance();
      },
    };
  },
  hover(wp) { CAL.cur = wp; cv.style.cursor = 'crosshair'; },
};
EXT.hintKey.push(() => (ui.tool === 'fondcal' ? (CAL.a ? 1 : 0) + (CAL.b ? 1 : 0) : ui.tool === 'fondmove' ? 'm' : ''));
EXT.hint.fondcal = () => {
  const msg = !CAL.a ? 'Touchez le premier point d’une longueur connue sur le fond (une cote, un mur).' : !CAL.b ? 'Touchez le second point.' : 'Indiquez la longueur réelle.';
  return [h('b', null, 'Échelle du fond'), h('span', { class: 'msg' }, msg),
    CAL.a ? btn('Recommencer', () => { CAL.a = CAL.b = null; requestRender(true); updateHint(); }, 'sm') : null,
    btn('Annuler', () => { CAL.a = CAL.b = null; setTool('select'); }, 'sm')];
};
EXT.overlay.push((c, px) => {
  if (ui.tool !== 'fondcal') return;
  const pts = [CAL.a, CAL.b || (CAL.a && CAL.cur)].filter(Boolean);
  c.strokeStyle = '#D24F1A'; c.fillStyle = '#D24F1A'; c.lineWidth = 2 * px;
  if (pts.length === 2) { c.setLineDash([6 * px, 4 * px]); c.beginPath(); c.moveTo(pts[0].x, pts[0].y); c.lineTo(pts[1].x, pts[1].y); c.stroke(); c.setLineDash([]); }
  for (const p of [CAL.a, CAL.b].filter(Boolean)) {
    c.beginPath(); c.arc(p.x, p.y, 7 * px, 0, Math.PI * 2); c.stroke();
    c.beginPath(); c.moveTo(p.x - 11 * px, p.y); c.lineTo(p.x + 11 * px, p.y); c.moveTo(p.x, p.y - 11 * px); c.lineTo(p.x, p.y + 11 * px); c.stroke();
  }
});
function askDistance() {
  const f = fondOf(ui.lv);
  const inp = h('input', { class: 'txt', id: 'f-caldist', type: 'text', inputmode: 'decimal', placeholder: 'ex. 3,50 m ou 350', 'aria-label': 'Longueur réelle', autocomplete: 'off', enterkeyhint: 'done' });
  const warn = h('p', { class: 'note', style: 'color:var(--bad)' });
  const ok = () => {
    const real = parseLength(inp.value);
    if (!real) { warn.textContent = 'Saisissez une longueur : « 350 » (cm) ou « 3,50 m ».'; return; }
    const n = calibrate(f, CAL.a, CAL.b, real);
    if (!n) { warn.textContent = 'Les deux points sont confondus : recommencez.'; return; }
    Object.assign(f, n); delete f.pdfE;
    CAL.a = CAL.b = null; closeModal(); setTool('select'); commit(); renderInspector();
    toast('Fond mis à l’échelle. Vérifiez sur une autre cote connue.');
  };
  inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  openModal('Longueur réelle', h('p', { class: 'note' }, 'Quelle est la longueur réelle entre les deux points touchés ?'),
    h('label', { class: 'fld' }, h('span', null, 'Longueur (cm, ou en m avec « m »)'), inp), warn,
    btns(btn('Appliquer', ok, 'pri'), btn('Recommencer', () => { CAL.a = CAL.b = null; closeModal(); requestRender(true); updateHint(); }), btn('Annuler', () => { CAL.a = CAL.b = null; closeModal(); setTool('select'); })));
}

/* ---- outil « déplacer le fond » ---- */
EXT.tools.fondmove = {
  down(wp) {
    const f = fondOf(ui.lv); if (!f) return null;
    const c0 = { x: f.cx, y: f.cy };
    let moved = false;
    return {
      move(wp2) { moved = true; f.cx = c0.x + wp2.x - wp.x; f.cy = c0.y + wp2.y - wp.y; requestRender(); },
      up() { if (moved) { f.cx = Math.round(f.cx * 10) / 10; f.cy = Math.round(f.cy * 10) / 10; commit(); } },
      cancel() { f.cx = c0.x; f.cy = c0.y; requestRender(); },
    };
  },
  hover() { cv.style.cursor = 'move'; },
};
EXT.hint.fondmove = () => [h('b', null, 'Déplacer le fond'), h('span', { class: 'msg' }, 'Faites glisser le fond pour le caler sur le dessin. Deux doigts : zoom.'), btn('Terminer', () => setTool('select'), 'pri sm')];

const lab = (b, t) => { b.setAttribute('aria-label', t); b.title = t; return b; };
/* ---- section « Fond de plan » de l'inspecteur du niveau ---- */
function fondSection() {
  const f = fondOf(ui.lv);
  if (!f) return sec('Fond de plan', h('p', { class: 'note' }, 'Importez un plan existant (photo, image ou PDF) pour le redessiner par-dessus.'),
    btns(btn('Importer un fond de plan', pickFond, '', 'img')));
  const z = fondSize(f);
  const op = h('input', { type: 'range', min: '10', max: '100', step: '5', value: String(Math.round((f.op ?? 0.5) * 100)), id: 'f-fondop', 'aria-label': 'Opacité du fond', class: 'range' });
  const opv = h('span', { class: 'v' }, Math.round((f.op ?? 0.5) * 100) + ' %');
  op.addEventListener('input', () => { f.op = +op.value / 100; opv.textContent = op.value + ' %'; requestRender(); });
  op.addEventListener('change', () => { f.op = +op.value / 100; commit(); });
  const vis = f.visible !== false;
  return sec('Fond de plan',
    h('p', { class: 'note' }, h('b', null, f.name), ' · ', f.cal ? `${(z.w / 100).toFixed(2).replace('.', ',')} × ${(z.h / 100).toFixed(2).replace('.', ',')} m` + (f.pdfE ? ` (échelle 1:${f.pdfE})` : '') : h('span', { style: 'color:var(--warn);font-weight:700' }, 'échelle non réglée')),
    h('label', { class: 'fld range-fld' }, h('span', null, 'Opacité'), op, opv),
    btns(btn('Mettre à l’échelle', startCal, 'sm'), btn('Déplacer', () => setTool('fondmove'), 'sm'),
      lab(btn('', () => { Object.assign(f, rotate90(f, -1)); commit(); }, 'sm', 'rotL'), 'Tourner le fond d’un quart de tour à gauche'),
      lab(btn('', () => { Object.assign(f, rotate90(f, 1)); commit(); }, 'sm', 'rotR'), 'Tourner le fond d’un quart de tour à droite')),
    f.pdfK ? pdfScaleRow(f) : null,
    btns(btn(vis ? 'Masquer' : 'Afficher', () => { f.visible = !vis; commit(); }, 'sm'),
      btn('Remplacer', pickFond, 'sm', 'img'),
      confirmBtn('Retirer', 'Confirmer ?', () => { P.fonds.splice(P.fonds.indexOf(f), 1); if (!P.fonds.some((x) => x.img === f.img)) delete P.fondImg[f.img]; commit(); toast('Fond retiré (Annuler pour le récupérer).'); })),
    h('p', { class: 'note' }, 'Le fond aide à dessiner : il n’apparaît pas dans les exports PDF et image.'));
}

export { fondOf, fondSection, importFond, pickFond, startCal };

/* Calque — module « pc » : confort à la souris et au clavier sur ordinateur.
   - barres de défilement du plan (horizontale et verticale) : glisser le curseur, cliquer dans la barre pour avancer d'une page ;
   - menu du clic droit (objet sous la souris : propriétés, dupliquer, pivoter, supprimer ; vue : recadrer, zoomer) ;
     clic droit maintenu + glisser = déplacer le plan ;
   - raccourcis : + / − / 0 (zoom, recadrer), ? (aide), Ctrl S (enregistrer tout de suite) ;
   - panneau de droite redimensionnable (glisser son bord gauche, double-clic : largeur d'origine).
   Sur l'iPad sans souris, rien ne change : les barres ne s'affichent qu'avec une souris ou un pavé tactile (réglage « Automatique »).
   Module JavaScript natif (aucune compilation). */
import { $, EXT, P, S, clamp, saveSettings, ui } from './noyau.js';
import { V } from './rendu2d.js';
import { SCR, contentBBox, fitView, hitTest, hitTol, requestRender, screenToWorld, select, selObj, undo, zoomAt } from './interaction.js';
import { ICON, closePops, deleteSel, duplicateSel, h, openHelp, renderInspector, rotateSel, toast } from './interface.js';
import { Store, saveNow } from './stockage.js';

/* ---------------- réglages ---------------- */
/* S.barres : 'auto' (avec une souris ou un pavé tactile), 'oui', 'non' ; S.molette : 'zoom' (par défaut, comme avant) ou 'defiler' */
const aSouris = () => { try { return matchMedia('(any-pointer: fine)').matches && matchMedia('(any-hover: hover)').matches; } catch (e) { return false; } };
function barresVisibles() { const v = S.barres || 'auto'; return v === 'oui' || (v === 'auto' && aSouris()); }

/* ---------------- calcul des barres (sans écran, testable) ----------------
   vue = [v0, v1] (monde), contenu = [c0, c1] ou null, piste = longueur en px.
   L'étendue défilable = contenu + une demi-vue de marge de chaque côté, réunie à la vue. */
function calculBarre(v0, v1, c0, c1, piste) {
  const vw = v1 - v0;
  if (!(vw > 0) || !(piste > 0)) return null;
  const m = vw * 0.5;
  const e0 = c0 == null ? v0 : Math.min(c0 - m, v0), e1 = c1 == null ? v1 : Math.max(c1 + m, v1);
  const ew = e1 - e0;
  const taille = clamp(piste * (vw / ew), Math.min(28, piste), piste);
  const libre = ew - vw;
  const pos = libre > 0.01 ? ((v0 - e0) / libre) * (piste - taille) : 0;
  return { e0, e1, ew, vw, taille, pos, plein: libre <= 0.01 };
}

/* ---------------- barres de défilement ---------------- */
const stage = $('#stage');
const mk = (cls) => { const b = h('div', { class: 'sbar ' + cls, 'aria-hidden': 'true' }); const t = h('div', { class: 'sthumb' }); b.append(t); stage.append(b); return { b, t }; };
const BH = mk('h'), BV = mk('v');
let fige = null;            // étendue gardée pendant un glissement du curseur (le curseur ne « saute » pas)
let bbCache = { t: 0, lv: null, P: null, bb: null };
function contenu() {
  const now = performance.now();
  if (bbCache.P === P && bbCache.lv === ui.lv && now - bbCache.t < 300) return bbCache.bb;
  const bb = P ? (contentBBox(ui.lv) || contentBBox(ui.lv, true)) : null;
  bbCache = { t: now, lv: ui.lv, P, bb };
  return bb;
}
function etatBarres() {
  const bb = contenu();
  const pisteH = BH.b.clientWidth, pisteV = BV.b.clientHeight;
  const x0 = -V.ox / V.s, x1 = (SCR.w - V.ox) / V.s, y0 = -V.oy / V.s, y1 = (SCR.h - V.oy) / V.s;
  return {
    h: calculBarre(x0, x1, bb ? bb.x0 : null, bb ? bb.x1 : null, pisteH),
    v: calculBarre(y0, y1, bb ? bb.y0 : null, bb ? bb.y1 : null, pisteV),
  };
}
function majBarres() {
  const vis = barresVisibles() && !stage.closest('[hidden]');
  stage.classList.toggle('barres', vis);
  if (!vis) return;
  const st = etatBarres();
  for (const [B, s, horiz] of [[BH, st.h, true], [BV, st.v, false]]) {
    if (!s) continue;
    let { taille, pos } = s;
    if (fige && fige.horiz === horiz) { const libre = fige.ew - fige.vw; const v0 = horiz ? -V.ox / V.s : -V.oy / V.s; pos = libre > 0 ? clamp((v0 - fige.e0) / libre, 0, 1) * (fige.piste - fige.taille) : 0; taille = fige.taille; }
    B.b.classList.toggle('plein', s.plein && !fige);
    if (horiz) { B.t.style.width = taille + 'px'; B.t.style.transform = `translateX(${pos}px)`; }
    else { B.t.style.height = taille + 'px'; B.t.style.transform = `translateY(${pos}px)`; }
  }
}
function brancherBarre(B, horiz) {
  B.b.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    closePops();
    const s = etatBarres()[horiz ? 'h' : 'v']; if (!s) return;
    const r = B.b.getBoundingClientRect();
    const posPx = horiz ? e.clientX - r.left : e.clientY - r.top;
    if (e.target !== B.t) {
      /* clic dans la barre, hors du curseur : une page (85 % de la vue) vers le clic */
      const sens = posPx < s.pos ? -1 : 1, d = sens * s.vw * 0.85 * V.s;
      if (horiz) V.ox -= d; else V.oy -= d;
      requestRender(); return;
    }
    const piste = horiz ? B.b.clientWidth : B.b.clientHeight;
    fige = { horiz, e0: s.e0, ew: s.ew, vw: s.vw, taille: s.taille, piste };
    const depart = horiz ? e.clientX : e.clientY, o0 = horiz ? V.ox : V.oy;
    const ratio = piste - s.taille > 0 ? (s.ew - s.vw) / (piste - s.taille) : 0; // monde par pixel de piste
    B.b.classList.add('actif');
    try { B.b.setPointerCapture(e.pointerId); } catch (err) { }
    const move = (ev) => {
      const d = ((horiz ? ev.clientX : ev.clientY) - depart) * ratio * V.s;
      if (horiz) V.ox = o0 - d; else V.oy = o0 - d;
      requestRender();
    };
    const fin = () => { fige = null; B.b.classList.remove('actif'); B.b.removeEventListener('pointermove', move); B.b.removeEventListener('pointerup', fin); B.b.removeEventListener('pointercancel', fin); requestRender(); };
    B.b.addEventListener('pointermove', move);
    B.b.addEventListener('pointerup', fin);
    B.b.addEventListener('pointercancel', fin);
  });
  /* molette au-dessus d'une barre : défiler dans son sens */
  B.b.addEventListener('wheel', (e) => {
    e.preventDefault();
    const d = (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX) * (e.deltaMode === 1 ? 40 : 1);
    if (horiz) V.ox -= d; else V.oy -= d;
    requestRender();
  }, { passive: false });
}
brancherBarre(BH, true); brancherBarre(BV, false);
EXT.rendu.push(majBarres);
try { matchMedia('(any-pointer: fine)').addEventListener('change', () => requestRender(true)); } catch (e) { }

/* ---------------- menu du clic droit ---------------- */
let menu = null;
function fermerMenu() { if (menu) { menu.remove(); menu = null; } }
function item(icon, label, raccourci, fn, desactive) {
  return h('button', { type: 'button', disabled: desactive ? '' : null, onclick: () => { fermerMenu(); fn(); } },
    h('span', { class: 'ico', html: ICON[icon] || '' }), h('span', null, label), raccourci ? h('kbd', null, raccourci) : null);
}
const NOMS = { wall: 'Mur', node: 'Angle', opening: 'Ouverture', item: 'Meuble', elec: 'Appareil électrique', room: 'Pièce', dim: 'Cote', text: 'Texte', duct: 'Gaine', zone: 'Zone interdite', surface: 'Toit ou terrasse' };
function ouvrirMenu(wp, sp) {
  fermerMenu(); closePops();
  const hit = hitTest(wp, hitTol());
  if (hit && hit.t !== 'handle') select(hit);
  else if (!hit) select(null);
  const s = ui.sel, o = s ? selObj() : null;
  const pivote = s && ['item', 'elec', 'text'].includes(s.t);
  const lignes = [];
  if (s && o) {
    lignes.push(h('h4', null, NOMS[s.t] || 'Objet'));
    lignes.push(item('info', 'Propriétés', '', () => { ui.inspOpen = true; renderInspector(); requestRender(); }));
    lignes.push(item('dup', 'Dupliquer', 'Ctrl D', duplicateSel));
    if (pivote) lignes.push(item('rotR', 'Pivoter de 90°', 'R', () => rotateSel(90)));
    lignes.push(item('del', 'Supprimer', 'Suppr', deleteSel));
    lignes.push(h('hr'));
  }
  lignes.push(h('h4', null, 'Vue'));
  lignes.push(item('center', 'Recadrer le plan', '0', fitView));
  lignes.push(item('plus', 'Zoomer ici', '+', () => zoomAt(sp.x, sp.y, 1.6)));
  lignes.push(item('rotL', 'Annuler', 'Ctrl Z', undo));
  lignes.push(item('help', 'Gestes et raccourcis', '?', openHelp));
  menu = h('div', { class: 'pop ctxmenu', role: 'menu' }, h('div', { class: 'menu' }, ...lignes));
  document.body.append(menu);
  const r = stage.getBoundingClientRect(), mw = menu.offsetWidth, mh = menu.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  menu.style.left = clamp(r.left + sp.x, 6, vw - mw - 6) + 'px';
  menu.style.top = clamp(r.top + sp.y, 6, vh - mh - 6) + 'px';
}
EXT.menuContextuel = ouvrirMenu;
window.addEventListener('pointerdown', (e) => { if (menu && !menu.contains(e.target)) fermerMenu(); }, true);
window.addEventListener('keydown', (e) => { if (menu && e.key === 'Escape') { e.stopImmediatePropagation(); fermerMenu(); } }, true);
window.addEventListener('blur', fermerMenu);
window.addEventListener('resize', fermerMenu);

/* ---------------- raccourcis clavier ---------------- */
window.addEventListener('keydown', (e) => {
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA' || (e.target && e.target.isContentEditable)) return;
  const mod = e.ctrlKey || e.metaKey;
  /* Ctrl S : le navigateur proposerait d'enregistrer la page ; Calque enregistre tout seul, on le fait tout de suite */
  if (mod && !e.altKey && e.key.toLowerCase() === 's') {
    e.preventDefault();
    if (ui.isExample) { toast('Plan d’exemple : il n’est pas enregistré. Menu › Nouveau plan pour un plan à vous.'); return; }
    if (Store.timer) saveNow(); else toast('Le plan est déjà enregistré (Calque enregistre automatiquement).');
    return;
  }
  if (mod || e.altKey || !$('#modal').hidden || ui.view !== 'plan') return;
  if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(SCR.w / 2, SCR.h / 2, 1.25); }
  else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(SCR.w / 2, SCR.h / 2, 0.8); }
  else if (e.key === '0') { e.preventDefault(); fitView(); }
  else if (e.key === '?') { e.preventDefault(); openHelp(); }
});

/* ---------------- panneau de droite redimensionnable ---------------- */
const main = $('#main'), insp = $('#insp');
const LARG = { min: 280, max: 720 };
const poignee = h('div', { class: 'insp-poignee', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Largeur du panneau', title: 'Glisser pour élargir le panneau (double-clic : largeur d’origine)' });
main.append(poignee);
function appliquerLargeur() {
  const w = Number(S.largeurPanneau);
  if (w > 0) main.style.setProperty('--insp-w', clamp(w, LARG.min, Math.min(LARG.max, innerWidth * 0.5)) + 'px');
  else main.style.removeProperty('--insp-w');
  placerPoignee();
}
function placerPoignee() {
  /* le panneau est une colonne de la grille à partir de 1100 px ; en dessous il flotte au-dessus du plan (pas de poignée) */
  const visible = !!insp.offsetParent && matchMedia('(min-width: 1100px)').matches && getComputedStyle(insp).position !== 'absolute';
  poignee.hidden = !visible;
  if (visible) poignee.style.left = (insp.offsetLeft - 9) + 'px';
}
poignee.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  const x0 = e.clientX, w0 = insp.getBoundingClientRect().width;
  poignee.classList.add('actif'); document.body.classList.add('redim');
  try { poignee.setPointerCapture(e.pointerId); } catch (err) { }
  const move = (ev) => { S.largeurPanneau = Math.round(clamp(w0 - (ev.clientX - x0), LARG.min, Math.min(LARG.max, innerWidth * 0.5))); appliquerLargeur(); };
  const fin = () => { poignee.classList.remove('actif'); document.body.classList.remove('redim'); poignee.removeEventListener('pointermove', move); poignee.removeEventListener('pointerup', fin); poignee.removeEventListener('pointercancel', fin); saveSettings(); };
  poignee.addEventListener('pointermove', move);
  poignee.addEventListener('pointerup', fin);
  poignee.addEventListener('pointercancel', fin);
});
poignee.addEventListener('dblclick', () => { delete S.largeurPanneau; saveSettings(); appliquerLargeur(); });
new ResizeObserver(placerPoignee).observe(main);
new ResizeObserver(placerPoignee).observe(insp);
/* les réglages sont lus au démarrage (loadSettings), après le chargement de ce module */
requestAnimationFrame(appliquerLargeur);

export { calculBarre, barresVisibles, majBarres, ouvrirMenu, fermerMenu, appliquerLargeur };

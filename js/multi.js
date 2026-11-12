/* Calque — module « multi » : sélection multiple (outil « Groupe »).
   Rectangle de sélection ou toucher les objets un par un, puis agir sur tout le groupe : déplacer (au doigt, au Pencil
   ou d'une distance exacte), tourner, dupliquer, copier vers un autre niveau, supprimer ; pour les appareils électriques :
   hauteur de pose et circuit. Types gérés : symboles électriques, mobilier, textes, cotes libres, conduits et murs.
   Chaque action est une seule étape de l'annuler/rétablir.
   Module JavaScript natif (aucune compilation). */
import { EXT, IDX, P, S, levelsSorted, nodeOf, setGEO, snapTo, touch, ui, uid } from './noyau.js';
import { geo } from './geometrie.js';
import { addWall, clampOpening, deleteWall, normDeg, wallsAt } from './mutations.js';
import { isStair } from './symboles.js';
import { accepts, circNumbers, circuitLabel, cleanLinks } from './electricite.js';
import { ductVisible, elecVisible } from './reseaux.js';
import { TAP, commit, cv, drawSelShape, hitTest, hitTol, panDrag, pencilMode, requestRender, revert } from './interaction.js';
import { body, btn, btns, confirmBtn, h, inspHead, numField, renderInspector, sec, setTool, toast, updateHint } from './interface.js';

const TYPES = ['elec', 'item', 'text', 'dim', 'duct', 'wall'];
const LISTE = { elec: 'elec', item: 'items', text: 'texts', dim: 'dims', duct: 'ducts', wall: 'walls' };
const NOMS = { elec: ['appareil', 'appareils'], item: ['meuble', 'meubles'], text: ['texte', 'textes'], dim: ['cote', 'cotes'], duct: ['conduit', 'conduits'], wall: ['mur', 'murs'] };
const M = { rect: null, pas: { dx: 0, dy: 0 } }; // rectangle en cours, dernière distance saisie
const sel = () => ui.multi || (ui.multi = []);
const cle = (r) => r.t + ':' + r.id;
const objet = (r) => (IDX[LISTE[r.t]] ? IDX[LISTE[r.t]].get(r.id) : null) || null;

/* retire de la sélection ce qui n'existe plus ou a changé de niveau (annuler, suppression ailleurs) */
function valider() {
  const s = sel(), ok = s.filter((r) => { const o = objet(r); return o && o.lv === ui.lv; });
  if (ok.length !== s.length) ui.multi = ok;
  return ui.multi;
}
function visible(t, o) {
  if (o.lv !== ui.lv) return false;
  if (t === 'elec') return S.layers.elec && elecVisible(o);
  if (t === 'duct') return S.layers.elec && ductVisible(o);
  if (t === 'item') return isStair(o.type) || S.layers.furn;
  return true;
}
/* points de référence d'un objet : il est pris par le rectangle si tous y sont */
function points(t, o) {
  if (t === 'dim') return [{ x: o.ax, y: o.ay }, { x: o.bx, y: o.by }];
  if (t === 'duct') return o.pts;
  if (t === 'wall') return [nodeOf(o.a), nodeOf(o.b)].filter(Boolean);
  return [o];
}
function dansRect(r) {
  const x0 = Math.min(r.a.x, r.b.x), x1 = Math.max(r.a.x, r.b.x), y0 = Math.min(r.a.y, r.b.y), y1 = Math.max(r.a.y, r.b.y), out = [];
  for (const t of TYPES) for (const o of P[LISTE[t]]) {
    if (!visible(t, o)) continue;
    const ps = points(t, o);
    if (ps.length && ps.every((p) => p.x >= x0 && p.x <= x1 && p.y >= y0 && p.y <= y1)) out.push({ t, id: o.id });
  }
  return out;
}
function ajouter(refs) { const s = sel(), vu = new Set(s.map(cle)); for (const r of refs) if (!vu.has(cle(r))) { s.push(r); vu.add(cle(r)); } }
function basculer(r) { const s = sel(), i = s.findIndex((x) => cle(x) === cle(r)); if (i >= 0) s.splice(i, 1); else s.push(r); }
function vider() { ui.multi = []; rafraichir(); }
function rafraichir() {
  /* grand écran : le panneau du groupe s'ouvre dès qu'il y a une sélection (sur petit écran : bouton « Actions ») */
  if (sel().length && !ui.inspOpen && !window.matchMedia('(max-width: 1099px)').matches) ui.inspOpen = true;
  updateHint(); renderInspector(); requestRender(true);
}
function compte() {
  const n = {}; for (const r of valider()) n[r.t] = (n[r.t] || 0) + 1;
  return TYPES.filter((t) => n[t]).map((t) => `${n[t]} ${NOMS[t][n[t] > 1 ? 1 : 0]}`).join(', ');
}
function centre() {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const r of valider()) for (const p of points(r.t, objet(r))) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  return isFinite(x0) ? { x: (x0 + x1) / 2, y: (y0 + y1) / 2 } : null;
}

/* étiquettes (nom, couleur) des pièces entièrement entourées par des murs du groupe : elles suivent les murs */
function etiquettes() {
  const ids = new Set(); for (const r of valider()) if (r.t === 'wall') { const w = objet(r); ids.add(w.a); ids.add(w.b); }
  if (ids.size < 3) return [];
  const ns = [...ids].map(nodeOf).filter(Boolean), out = [];
  for (const room of geo(ui.lv).rooms) {
    if (!room.label) continue;
    if (room.poly.every((p) => ns.some((n) => Math.hypot(n.x - p.x, n.y - p.y) < 60))) out.push(room.label);
  }
  return out;
}

/* ---------- transformation du groupe : f(point) → point, dRot en degrés ---------- */
function etat() {
  const refs = valider(), noeuds = new Map(), objs = [];
  for (const r of refs) {
    const o = objet(r);
    if (r.t === 'wall') { for (const id of [o.a, o.b]) { const n = nodeOf(id); if (n && !noeuds.has(id)) noeuds.set(id, { n, x: n.x, y: n.y }); } }
    else objs.push({ r, o, base: JSON.parse(JSON.stringify(o)) });
  }
  for (const l of etiquettes()) objs.push({ r: { t: 'room', id: l.id }, o: l, base: { x: l.x, y: l.y } });
  return { objs, noeuds };
}
function appliquer(E, f, dRot) {
  for (const { r, o, base } of E.objs) {
    if (r.t === 'dim') { const a = f({ x: base.ax, y: base.ay }), b = f({ x: base.bx, y: base.by }); o.ax = a.x; o.ay = a.y; o.bx = b.x; o.by = b.y; }
    else if (r.t === 'duct') o.pts = base.pts.map((q) => f(q));
    else { const p = f(base); o.x = p.x; o.y = p.y; if (dRot && r.t !== 'room') o.rot = normDeg((base.rot || 0) + dRot); }
  }
  for (const { n, x, y } of E.noeuds.values()) { const p = f({ x, y }); n.x = p.x; n.y = p.y; }
  if (E.noeuds.size) setGEO({});
}
/* après un déplacement de murs : les ouvertures des murs voisins étirés restent dans leur mur */
function recalerOuvertures(E) {
  if (!E.noeuds.size) return;
  const ws = new Set(); for (const id of E.noeuds.keys()) for (const w of wallsAt(id)) ws.add(w.id);
  touch();
  for (const o of P.openings) if (ws.has(o.wall)) clampOpening(o);
}
const arr = (v) => Math.round(v * 10) / 10;
function deplacer(dx, dy) {
  if (!valider().length || (!dx && !dy)) return;
  const E = etat();
  appliquer(E, (p) => ({ x: arr(p.x + dx), y: arr(p.y + dy) }), 0);
  recalerOuvertures(E); commit(); requestRender();
}
function tourner(deg) {
  const c = centre(); if (!c) return;
  const E = etat(), a = deg * Math.PI / 180, co = Math.round(Math.cos(a)), si = Math.round(Math.sin(a));
  appliquer(E, (p) => ({ x: arr(c.x + (p.x - c.x) * co - (p.y - c.y) * si), y: arr(c.y + (p.x - c.x) * si + (p.y - c.y) * co) }), deg);
  recalerOuvertures(E); commit(); requestRender();
}

/* ---------- copie (même niveau avec décalage, ou autre niveau à la même place) ---------- */
function copier(dst, dx, dy) {
  const refs = valider(); if (!refs.length) return;
  const ids = new Map(), neufs = [], noms = etiquettes();
  const dec = (p) => ({ x: arr(p.x + dx), y: arr(p.y + dy) });
  for (const r of refs) {
    const o = objet(r);
    if (r.t === 'wall') {
      const A = nodeOf(o.a), B = nodeOf(o.b); if (!A || !B) continue;
      const props = { th: o.th, kind: o.kind }; if (o.h) props.h = o.h;
      const ws = addWall(dst, dec(A), dec(B), props);
      for (const w of ws) neufs.push({ t: 'wall', id: w.id });
      /* ouvertures recopiées si le mur a été créé d'un seul tenant, dans le même sens */
      if (ws.length === 1) {
        const a2 = nodeOf(ws[0].a), pa = dec(A), inverse = !(Math.abs(a2.x - pa.x) < 0.6 && Math.abs(a2.y - pa.y) < 0.6);
        const L = Math.hypot(B.x - A.x, B.y - A.y);
        for (const op of P.openings.filter((x) => x.wall === o.id)) {
          const c = JSON.parse(JSON.stringify(op)); c.id = uid('o'); c.wall = ws[0].id;
          if (inverse) { c.t = L - op.t; if (c.side) c.side = -c.side; }
          P.openings.push(c);
        }
      }
      continue;
    }
    const c = JSON.parse(JSON.stringify(o)); c.id = uid(r.t[0]); c.lv = dst;
    if (r.t === 'dim') { const a = dec({ x: o.ax, y: o.ay }), b = dec({ x: o.bx, y: o.by }); c.ax = a.x; c.ay = a.y; c.bx = b.x; c.by = b.y; }
    else if (r.t === 'duct') c.pts = o.pts.map(dec);
    else { const p = dec(o); c.x = p.x; c.y = p.y; }
    if (r.t === 'elec') delete c.to; // un passage entre étages copié n'a pas encore de jumeau
    ids.set(o.id, c.id);
    P[LISTE[r.t]].push(c); neufs.push({ t: r.t, id: c.id });
  }
  /* conduits copiés : raccordés aux appareils copiés avec eux, libres sinon ; liaisons entre appareils copiés */
  for (const n of neufs) if (n.t === 'duct') { const d = P.ducts.find((x) => x.id === n.id); for (const k of ['a', 'b']) d[k] = d[k] && ids.has(d[k]) ? ids.get(d[k]) : null; }
  for (const l of P.links.slice()) if (ids.has(l.a) && ids.has(l.b)) P.links.push({ id: uid('k'), lv: dst, a: ids.get(l.a), b: ids.get(l.b) });
  /* noms et couleurs des pièces copiées avec leurs murs (la pièce est retrouvée par la position de l'étiquette) */
  if (neufs.some((n) => n.t === 'wall')) for (const l of noms) { const c = JSON.parse(JSON.stringify(l)), p = dec(l); c.id = uid('r'); c.lv = dst; c.x = p.x; c.y = p.y; P.rooms.push(c); }
  touch();
  for (const n of neufs) if (n.t === 'wall') for (const op of P.openings) if (op.wall === n.id) clampOpening(op);
  if (dst === ui.lv) ui.multi = neufs;
  commit(); rafraichir(); requestRender();
  return neufs.length;
}
function supprimer() {
  const refs = valider(); if (!refs.length) return;
  const par = {}; for (const r of refs) (par[r.t] = par[r.t] || new Set()).add(r.id);
  for (const t of ['elec', 'item', 'text', 'dim', 'duct']) if (par[t]) P[LISTE[t]] = P[LISTE[t]].filter((o) => !par[t].has(o.id));
  touch();
  if (par.wall) for (const id of par.wall) { deleteWall(id); touch(); }
  if (par.elec) cleanLinks();
  const n = refs.length; ui.multi = [];
  commit(); rafraichir(); requestRender();
  toast(`${n} objet${n > 1 ? 's supprimés' : ' supprimé'}. « Annuler » les fait revenir.`);
}

/* ---------- appareils électriques du groupe ---------- */
const appareils = () => valider().filter((r) => r.t === 'elec').map(objet);
function hauteur(v) { const es = appareils(); for (const e of es) e.h = v; commit(); toast(`Hauteur de pose : ${v} cm pour ${es.length} appareil${es.length > 1 ? 's' : ''}.`); }
function affecter(cid) {
  const c = P.circuits.find((x) => x.id === cid), es = appareils(); let n = 0, non = 0;
  for (const e of es) { if (!cid) { if (e.cid) { e.cid = null; n++; } } else if (accepts(c.kind, e.type)) { if (e.cid !== cid) { e.cid = cid; n++; } } else non++; }
  commit();
  toast(cid ? `${n} appareil${n > 1 ? 's reliés' : ' relié'} au circuit « ${c.name} »${non ? ` ; ${non} non compatible${non > 1 ? 's' : ''} laissé${non > 1 ? 's' : ''} tel${non > 1 ? 's' : ''} quel${non > 1 ? 's' : ''}` : ''}.` : `${n} appareil${n > 1 ? 's retirés' : ' retiré'} de leur circuit.`);
}

/* ---------- outil ---------- */
function glisserGroupe(wp0, sp0, touche) {
  let moved = false; const E = etat();
  return {
    move(wp, sp) {
      if (!moved && Math.hypot(sp.x - sp0.x, sp.y - sp0.y) < TAP()) return;
      moved = true; cv.style.cursor = 'grabbing';
      const dx = snapTo(wp.x - wp0.x, S.grid), dy = snapTo(wp.y - wp0.y, S.grid);
      appliquer(E, (p) => ({ x: arr(p.x + dx), y: arr(p.y + dy) }), 0);
    },
    up() { if (moved) { recalerOuvertures(E); commit(); } else if (touche) { basculer(touche); rafraichir(); } },
    cancel() { if (moved) revert(); },
  };
}
EXT.tools.multi = {
  doigt: true, // au doigt aussi en mode Apple Pencil (deux doigts déplacent la vue)
  down(wp, sp, e) {
    valider();
    const hit = hitTest(wp, hitTol()), ref = hit && TYPES.includes(hit.t) ? { t: hit.t, id: hit.id } : null;
    if (ref && sel().some((x) => cle(x) === cle(ref))) return glisserGroupe(wp, sp, ref);
    if (ref) { let moved = false; return { move(w2, s2) { if (Math.hypot(s2.x - sp.x, s2.y - sp.y) > TAP()) moved = true; }, up() { if (!moved) { basculer(ref); rafraichir(); } } }; }
    /* mode Apple Pencil : le doigt sur le vide déplace la vue, le stylet trace le rectangle */
    if (e && e.pointerType === 'touch' && pencilMode()) return panDrag(sp, null);
    M.rect = { a: wp, b: wp };
    let moved = false;
    return {
      overlay: true,
      move(w2, s2) { if (Math.hypot(s2.x - sp.x, s2.y - sp.y) > TAP()) moved = true; M.rect.b = w2; },
      up(w2) {
        const r = M.rect; M.rect = null;
        if (moved && r) { r.b = w2; const avant = sel().length; ajouter(dansRect(r)); if (sel().length === avant) toast('Aucun objet entièrement dans le rectangle.'); }
        rafraichir();
      },
      cancel() { M.rect = null; },
    };
  },
  hover(wp) {
    const hit = hitTest(wp, 6);
    cv.style.cursor = hit && TYPES.includes(hit.t) ? (sel().some((x) => x.id === hit.id && x.t === hit.t) ? 'move' : 'pointer') : 'crosshair';
  },
};
EXT.hintKey.push(() => (ui.tool === 'multi' ? 'm' + sel().length : ''));
EXT.hint.multi = () => {
  const n = valider().length;
  return [h('b', null, 'Groupe'),
    h('span', { class: 'msg' }, n ? `${compte()} · faites glisser un objet du groupe pour tout déplacer` : 'Tracez un rectangle autour des objets, ou touchez-les un par un.'),
    n ? btn('Actions…', () => { ui.inspOpen = true; renderInspector(); }, 'sm') : null,
    n ? btn('Dupliquer', () => copier(ui.lv, 40, 40), 'sm') : null,
    n ? btn('Tout désélectionner', vider, 'sm') : btn('Tout le niveau', () => { ajouter(dansRect({ a: { x: -1e9, y: -1e9 }, b: { x: 1e9, y: 1e9 } })); rafraichir(); }, 'sm'),
    btn('Terminer', () => setTool('select'), 'pri sm')];
};
EXT.overlay.push((c, px) => {
  if (ui.tool !== 'multi') return;
  for (const r of valider()) drawSelShape(r.t === 'wall' ? { t: 'wall', id: r.id } : r, true);
  if (M.rect) {
    const r = M.rect;
    c.save(); c.setLineDash([6 * px, 4 * px]); c.lineWidth = 1.5 * px; c.strokeStyle = 'rgba(210,79,26,1)'; c.fillStyle = 'rgba(210,79,26,0.08)';
    c.beginPath(); c.rect(Math.min(r.a.x, r.b.x), Math.min(r.a.y, r.b.y), Math.abs(r.b.x - r.a.x), Math.abs(r.b.y - r.a.y)); c.fill(); c.stroke(); c.restore();
  }
});

/* ---------- panneau du groupe (à la place de l'inspecteur) ---------- */
function panneau() {
  const n = valider().length;
  if (!n) return [inspHead('Groupe', 'Aucun objet sélectionné'), body(h('p', { class: 'note' }, 'Tracez un rectangle autour des objets à sélectionner (un objet est pris s’il est entièrement dedans), ou touchez-les un par un. Touchez de nouveau un objet pour le retirer du groupe.'),
    h('p', { class: 'note' }, 'Types pris en compte : appareils électriques, mobilier, textes, cotes, conduits et murs. Les objets masqués par un filtre ne sont pas sélectionnés.'))];
  const es = appareils(), nums = circNumbers();
  const parts = [];
  parts.push(sec('Déplacer d’une distance exacte',
    h('div', { class: 'row' }, numField('Vers la droite', M.pas.dx, 'cm', (v) => { M.pas.dx = v; }, { id: 'f-mdx', min: -100000, max: 100000 }), numField('Vers le bas', M.pas.dy, 'cm', (v) => { M.pas.dy = v; }, { id: 'f-mdy', min: -100000, max: 100000 })),
    btns(btn('Déplacer', () => { if (!M.pas.dx && !M.pas.dy) { toast('Saisissez une distance (négative : vers la gauche ou vers le haut).'); return; } deplacer(M.pas.dx, M.pas.dy); }, 'pri'),
      btn('Tourner de 90°', () => tourner(90)))));
  if (es.length) {
    const hs = new Set(es.map((e) => e.h)), cs = new Set(es.map((e) => e.cid || ''));
    const selC = h('select', { class: 'txt', id: 'f-mcirc', 'aria-label': 'Circuit du groupe' },
      h('option', { value: '~', selected: cs.size > 1 }, cs.size > 1 ? 'Plusieurs circuits…' : 'Choisir…'), h('option', { value: '' , selected: cs.size === 1 && cs.has('') }, 'Aucun circuit'),
      P.circuits.map((c) => h('option', { value: c.id, selected: cs.size === 1 && cs.has(c.id) }, circuitLabel(c, nums))));
    selC.addEventListener('change', () => { if (selC.value !== '~') affecter(selC.value || null); });
    parts.push(sec(`${es.length} appareil${es.length > 1 ? 's' : ''} électrique${es.length > 1 ? 's' : ''}`,
      numField('Hauteur de pose', hs.size === 1 && typeof [...hs][0] === 'number' ? [...hs][0] : null, 'cm', hauteur, { id: 'f-mh', min: 0, max: 1000 }),
      hs.size > 1 ? h('p', { class: 'note' }, 'Hauteurs différentes dans le groupe : une saisie les remplace toutes.') : null,
      P.circuits.length ? h('label', { class: 'fld' }, h('span', null, 'Circuit'), selC) : h('p', { class: 'note' }, 'Aucun circuit : générez d’abord le tableau.')));
  }
  const autres = levelsSorted().filter((l) => l.id !== ui.lv);
  parts.push(sec('Copier', btns(btn('Dupliquer ici', () => copier(ui.lv, 40, 40), '', 'dup')),
    autres.length ? [h('p', { class: 'note' }, 'Copier au même endroit sur un autre niveau (étages identiques) :'), h('div', { class: 'chips' }, autres.map((l) => h('button', { type: 'button', class: 'chip', onclick: () => { const k = copier(l.id, 0, 0); toast(`${k} objet${k > 1 ? 's copiés' : ' copié'} vers « ${l.name} ».`); } }, l.name)))] : null));
  parts.push(sec(null, btns(confirmBtn(`Supprimer les ${n} objets`, 'Confirmer la suppression', supprimer), btn('Tout désélectionner', vider))));
  return [inspHead('Groupe', compte()), body(...parts)];
}
{ const avant = EXT.inspVide; EXT.inspVide = () => (ui.tool === 'multi' && ui.view !== '3d' && !ui.chantier ? panneau() : avant ? avant() : null); }

/* clavier (appelé par demarrage.js) : renvoie true si la touche est traitée */
function toucheGroupe(e, k) {
  if (ui.tool !== 'multi') return false;
  if (k === 'escape') { if (sel().length) vider(); else setTool('select'); return true; }
  if (!valider().length) return false;
  if (k === 'delete' || k === 'backspace') { e.preventDefault(); supprimer(); return true; }
  const pas = e.shiftKey ? 10 : 1, d = { arrowleft: [-pas, 0], arrowright: [pas, 0], arrowup: [0, -pas], arrowdown: [0, pas] }[k];
  if (d) { e.preventDefault(); deplacer(d[0], d[1]); return true; }
  if ((e.ctrlKey || e.metaKey) && k === 'd') { e.preventDefault(); copier(ui.lv, 40, 40); return true; }
  return false;
}

export { affecter, copier, dansRect, deplacer, hauteur, supprimer, toucheGroupe, tourner, valider, vider };

/* Calque — module « chantierui » : mode chantier (écran), phase 7.
   Onglet « Chantier » : le plan simplifié (sans mobilier, grille ni cotes), les cases « posé » des appareils et
   des circuits, les annotations au Pencil, les réserves (numéro, statut, dates), les photos localisées sur le plan
   et l'historique du chantier. Les calculs et le nettoyage des données sont dans chantier.js (sans écran) ;
   les images des photos sont dans photos.js (IndexedDB, base à part, jamais dans le plan).
   Module JavaScript natif (aucune compilation). */
import { $, EXT, IDX, LAYERS_CH, P, S, levelOf, ui, uid } from './noyau.js';
import { RC, V } from './rendu2d.js';
import { SCR, commit, cv, hitTest, hitTol, panDrag, requestRender, select, TAP } from './interaction.js';
import { body, btn, btns, closeModal, confirmBtn, h, inspElec, inspHead, isNarrow, kv, openModal, renderInspector, sec, segCtl, setTool,
  switchLevel, textField, toast, updateHint } from './interface.js';
import { ELEC_BY } from './symboles.js';
import { circNumbers } from './electricite.js';
import { setView } from './tableau.js';
import { openDossierChantier } from './dossierui.js';
import { COULEURS_NOTE, STATUTS_RESERVE, STATUT_BY, avancement, changerStatut, chantierDe, datePose, distanceTrait, marquerPose,
  noter, nouvelleReserve, resumeReserves, simplifierTrait } from './chantier.js';
import { enregistrerPhoto, espacePhotos, ouvrirPhotos, photosInutilisees, supprimerPhotos, urlPhoto } from './photos.js';

const fmtD = (t) => (t ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(t)) : '—');
const fmtDH = (t) => (t ? new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(t)) : '—');
const VERT = '#2D7A4C', GRIS = '#8A939A', ORANGE = '#B86E00', BLEU = '#1F5FD1';
const CH = () => chantierDe(P);
const nomElec = (e) => (e && ELEC_BY.get(e.type) ? ELEC_BY.get(e.type).n : 'Appareil');
const nomCirc = (c) => { const n = circNumbers().get(c.id); return (n ? n + ' · ' : '') + c.name; };
if (!ui.chOpt) ui.chOpt = { col: COULEURS_NOTE[0].v, ep: 3, gomme: false, filtre: 'tous' };

/* ---------------- entrer / sortir du mode chantier ---------------- */
function entrer() {
  if (ui.chantier) return;
  ui.chantier = true;
  LAYERS_CH.saved = S.layers;
  S.layers = Object.assign({}, S.layers, { grid: false, furn: false, dims: false, areas: false, ghost: false, links: false, elec: true, names: true });
  $('#app').classList.add('chantier');
  ui.sel = null; ui.inspOpen = !isNarrow();
  setTool('select');
  renderInspector(); requestRender();
}
function sortir() {
  if (!ui.chantier) return;
  ui.chantier = false;
  if (LAYERS_CH.saved) { S.layers = LAYERS_CH.saved; LAYERS_CH.saved = null; }
  $('#app').classList.remove('chantier');
  if (ui.sel && ['reserve', 'photo', 'note'].includes(ui.sel.t)) ui.sel = null;
  setTool('select');
  renderInspector(); requestRender();
}
EXT.view.push((v) => { if (v === 'chantier') entrer(); else sortir(); });

/* ---------------- objets du chantier ---------------- */
const trouve = (k, id) => ((P.chantier && P.chantier[k]) || []).find((o) => o.id === id) || null;
EXT.obj.reserve = (id) => trouve('reserves', id);
EXT.obj.photo = (id) => trouve('photos', id);
EXT.obj.note = (id) => trouve('notes', id);
EXT.del.reserve = (id) => { const r = trouve('reserves', id); if (!r) return; CH().reserves = CH().reserves.filter((x) => x !== r); for (const f of CH().photos) if (f.reserve === id) delete f.reserve; noter(P, 'reserve', `Réserve n° ${r.n} supprimée${r.titre ? ' (' + r.titre + ')' : ''}`); };
EXT.del.photo = (id) => { const f = trouve('photos', id); if (!f) return; CH().photos = CH().photos.filter((x) => x !== f); noter(P, 'photo', `Photo retirée du plan${f.legende ? ' (' + f.legende + ')' : ''}`); };
EXT.del.note = (id) => { CH().notes = CH().notes.filter((x) => x.id !== id); };

/* ---------------- dessin (au-dessus du plan) ---------------- */
function rond(c, x, y, r) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }
function dessinerNote(c, n, px, sel) {
  const t = n.pts; if (t.length < 4) return;
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (sel) { c.strokeStyle = 'rgba(210,79,26,.35)'; c.lineWidth = n.ep + 8 * px; tracer(c, t); c.stroke(); }
  c.strokeStyle = n.col; c.lineWidth = n.ep; tracer(c, t); c.stroke();
}
function tracer(c, t) { c.beginPath(); c.moveTo(t[0], t[1]); for (let i = 2; i + 1 < t.length; i += 2) c.lineTo(t[i], t[i + 1]); }
function pinReserve(c, r, px, sel) {
  const st = STATUT_BY.get(r.statut) || STATUTS_RESERVE[0], R = 12 * px;
  c.save();
  rond(c, r.x, r.y, R + 2 * px); c.fillStyle = '#FFFFFF'; c.fill();
  rond(c, r.x, r.y, R); c.fillStyle = st.c; c.fill();
  if (sel) { rond(c, r.x, r.y, R + 5 * px); c.strokeStyle = '#D24F1A'; c.lineWidth = 3 * px; c.stroke(); }
  c.fillStyle = '#FFFFFF'; c.font = `700 ${(r.n > 99 ? 9 : 11) * px}px system-ui, sans-serif`; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(r.n), r.x, r.y + 0.5 * px);
  c.restore();
}
function pinPhoto(c, f, px, sel) {
  const w = 22 * px, hh = 17 * px, x = f.x - w / 2, y = f.y - hh / 2;
  c.save();
  c.beginPath(); c.roundRect ? c.roundRect(x, y, w, hh, 4 * px) : c.rect(x, y, w, hh);
  c.fillStyle = f.aFaire ? '#FFFFFF' : BLEU; c.fill();
  c.lineWidth = 2 * px; c.strokeStyle = f.aFaire ? ORANGE : '#FFFFFF'; if (f.aFaire) c.setLineDash([3 * px, 2 * px]); c.stroke(); c.setLineDash([]);
  rond(c, f.x, f.y + 1 * px, 4.5 * px); c.strokeStyle = f.aFaire ? ORANGE : '#FFFFFF'; c.lineWidth = 1.8 * px; c.stroke();
  c.fillStyle = f.aFaire ? ORANGE : '#FFFFFF'; c.fillRect(f.x - 6 * px, y - 2.5 * px, 6 * px, 3 * px);
  if (sel) { c.beginPath(); c.rect(x - 4 * px, y - 4 * px, w + 8 * px, hh + 8 * px); c.strokeStyle = '#D24F1A'; c.lineWidth = 3 * px; c.stroke(); }
  c.restore();
}
function badgePose(c, e, px, pose) {
  // taille proportionnelle au symbole (même règle que symboles.js) : lisible de près, discrète de loin
  const u = Math.max(30, 20 * px), k = u / 20, x = e.x + 0.42 * u, y = e.y - 0.42 * u, r = 0.2 * u;
  rond(c, x, y, r + 0.06 * u); c.fillStyle = '#FFFFFF'; c.fill();
  rond(c, x, y, r);
  if (pose) {
    c.fillStyle = VERT; c.fill();
    c.beginPath(); c.moveTo(x - 2.2 * k, y); c.lineTo(x - 0.5 * k, y + 1.9 * k); c.lineTo(x + 2.4 * k, y - 1.9 * k);
    c.strokeStyle = '#FFFFFF'; c.lineWidth = 1.4 * k; c.lineCap = 'round'; c.lineJoin = 'round'; c.stroke();
  } else { c.strokeStyle = GRIS; c.lineWidth = Math.min(1.4 * px, 0.06 * u); c.stroke(); }
}
/* dessin du chantier : à l'écran en mode chantier, et dans le dossier PDF (option chantier) */
function dessinerChantier(c, lv, opts) {
  const o = opts || {};
  if (!(o.export ? o.chantier : ui.chantier) || !P.chantier) return;
  const px = RC.px, ch = P.chantier, sel = !o.export && ui.sel;
  for (const n of ch.notes) if (n.lv === lv) dessinerNote(c, n, px, sel && sel.t === 'note' && sel.id === n.id);
  if (S.layers.elec || o.export) for (const e of P.elec) if (e.lv === lv) badgePose(c, e, px, !!ch.poses.app[e.id]);
  for (const f of ch.photos) if (f.lv === lv) pinPhoto(c, f, px, sel && sel.t === 'photo' && sel.id === f.id);
  for (const r of ch.reserves) if (r.lv === lv && (o.export || ui.chOpt.filtre === 'tous' || r.statut === ui.chOpt.filtre)) pinReserve(c, r, px, sel && sel.t === 'reserve' && sel.id === r.id);
}
EXT.top.push(dessinerChantier);
/* trait en cours (couche du dessus) */
const TR = { pts: null };
EXT.overlay.push((c, px) => {
  if (!ui.chantier || !TR.pts || TR.pts.length < 4) return;
  dessinerNote(c, { pts: TR.pts, col: ui.chOpt.col, ep: ui.chOpt.ep * px }, px, false);
});

/* ---------------- sélection au doigt ou au Pencil ---------------- */
EXT.hit.push((p, tol) => {
  if (!ui.chantier || !P.chantier) return null;
  const ch = P.chantier, px = 1 / V.s;
  for (let i = ch.reserves.length - 1; i >= 0; i--) { const r = ch.reserves[i]; if (r.lv === ui.lv && (ui.chOpt.filtre === 'tous' || r.statut === ui.chOpt.filtre) && Math.hypot(p.x - r.x, p.y - r.y) <= 13 * px + tol * 0.5) return { t: 'reserve', id: r.id }; }
  for (let i = ch.photos.length - 1; i >= 0; i--) { const f = ch.photos[i]; if (f.lv === ui.lv && Math.abs(p.x - f.x) <= 12 * px + tol * 0.4 && Math.abs(p.y - f.y) <= 10 * px + tol * 0.4) return { t: 'photo', id: f.id }; }
  return null;
});
function noteAt(p, tol) {
  const l = (P.chantier && P.chantier.notes) || [];
  for (let i = l.length - 1; i >= 0; i--) { const n = l[i]; if (n.lv === ui.lv && distanceTrait(n, p) <= n.ep / 2 + tol * 0.6) return n; }
  return null;
}
/* outil Sélection en mode chantier : consultation, aucun déplacement d'objet du plan */
EXT.selectDown = (wp, sp) => {
  if (!ui.chantier) return undefined;
  return panDrag(sp, (w) => {
    const tol = hitTol();
    let hh = hitTest(w, tol);
    if (!hh || !['elec', 'reserve', 'photo'].includes(hh.t)) { const n = noteAt(w, tol / V.s); hh = n ? { t: 'note', id: n.id } : null; }
    if (hh) select(hh); else { select(null); ui.inspOpen = !isNarrow() || ui.inspOpen; renderInspector(); }
  });
};

/* ---------------- outils du mode chantier ---------------- */
function elecAt(w) { const hh = hitTest(w, hitTol()); return hh && hh.t === 'elec' ? IDX.elec.get(hh.id) : null; }
EXT.tools.ch_pose = {
  doigt: true, // le doigt agit aussi en mode Apple Pencil (toucher = action, glisser = déplacer le plan)
  down(wp, sp) {
    return panDrag(sp, (w) => {
      const e = elecAt(w);
      if (!e) { toast('Touchez un appareil (symbole électrique).'); return; }
      const on = !datePose(P, 'app', e.id);
      marquerPose(P, 'app', e.id, on, null, nomElec(e)); commit();
      toast(`${nomElec(e)} : ${on ? 'posé' : 'non posé'}.`);
    });
  },
};
EXT.tools.ch_note = {
  down(wp, sp) {
    const px = 1 / V.s;
    if (ui.chOpt.gomme) {
      let n0 = CH().notes.length;
      const efface = (w) => { const n = noteAt(w, hitTol() * px); if (n) { CH().notes = CH().notes.filter((x) => x !== n); requestRender(); } };
      efface(wp);
      return { move(w) { efface(w); }, up() { if (CH().notes.length !== n0) commit(); }, cancel() { if (CH().notes.length !== n0) commit(); } };
    }
    TR.pts = [wp.x, wp.y];
    let lastS = sp;
    return {
      overlay: true,
      move(w, s) { if (Math.hypot(s.x - lastS.x, s.y - lastS.y) < 1.5) return; lastS = s; TR.pts.push(w.x, w.y); },
      up(w, s) {
        const t = TR.pts; TR.pts = null;
        if (!t) return;
        if (t.length < 4) { if (Math.hypot(s.x - sp.x, s.y - sp.y) < TAP()) t.push(w.x + 0.5 * px, w.y + 0.5 * px); else { requestRender(); return; } }
        const n = { id: uid('an'), lv: ui.lv, pts: simplifierTrait(t, 0.6 * px), col: ui.chOpt.col, ep: Math.round(ui.chOpt.ep * px * 10) / 10 || 0.1, at: Date.now() };
        CH().notes.push(n); commit();
      },
      cancel() { TR.pts = null; requestRender(); },
    };
  },
  hover() { cv.style.cursor = 'crosshair'; },
};
EXT.tools.ch_res = {
  doigt: true, // le doigt agit aussi en mode Apple Pencil (toucher = action, glisser = déplacer le plan)
  down(wp, sp) {
    return panDrag(sp, (w) => {
      const e = elecAt(w);
      const r = nouvelleReserve(P, { lv: ui.lv, x: e ? e.x : w.x, y: e ? e.y : w.y }, { ref: e ? { t: 'elec', id: e.id } : undefined, titre: e ? nomElec(e) : '' });
      if (e) { r.x += 22 / V.s; r.y += 22 / V.s; }
      setTool('select'); ui.sel = { t: 'reserve', id: r.id }; ui.inspOpen = true; commit();
      setTimeout(() => { const f = document.getElementById('f-rs-titre'); if (f) { f.focus(); f.select(); } }, 60);
    });
  },
  hover() { cv.style.cursor = 'crosshair'; },
};
EXT.tools.ch_photo = {
  doigt: true, // le doigt agit aussi en mode Apple Pencil (toucher = action, glisser = déplacer le plan)
  down(wp, sp) { return panDrag(sp, (w) => { setTool('select'); fenetrePhoto({ lv: ui.lv, x: w.x, y: w.y }); }); },
  hover() { cv.style.cursor = 'crosshair'; },
};
/* déplacer une réserve ou une photo : touchez le nouvel emplacement */
EXT.tools.ch_move = {
  doigt: true, // le doigt agit aussi en mode Apple Pencil (toucher = action, glisser = déplacer le plan)
  down(wp, sp) {
    return panDrag(sp, (w) => {
      const m = ui.chMove, o = m && EXT.obj[m.t](m.id); ui.chMove = null;
      setTool('select');
      if (!o) return;
      o.x = Math.round(w.x * 10) / 10; o.y = Math.round(w.y * 10) / 10; o.lv = ui.lv;
      if (m.t === 'reserve') o.maj = Date.now();
      ui.sel = { t: m.t, id: o.id }; commit();
    });
  },
  hover() { cv.style.cursor = 'crosshair'; },
};
EXT.hintKey.push(() => (ui.chantier ? ['ch', ui.chOpt.col, ui.chOpt.ep, ui.chOpt.gomme].join(',') : ''));
const fin = () => btn('Terminer', () => setTool('select'), 'pri sm');
EXT.hint.ch_pose = () => [h('b', null, 'Posé'), h('span', { class: 'msg' }, 'Touchez un appareil pour cocher ou décocher « posé ». Le doigt glissé déplace le plan.'), fin()];
EXT.hint.ch_res = () => [h('b', null, 'Réserve'), h('span', { class: 'msg' }, 'Touchez l’endroit de la réserve (sur un appareil pour la lui rattacher).'), btn('Annuler', () => setTool('select'), 'sm')];
EXT.hint.ch_photo = () => [h('b', null, 'Photo'), h('span', { class: 'msg' }, 'Touchez l’endroit où la photo est prise.'), btn('Annuler', () => setTool('select'), 'sm')];
EXT.hint.ch_move = () => [h('b', null, 'Déplacer'), h('span', { class: 'msg' }, 'Touchez le nouvel emplacement (vous pouvez changer de niveau avant).'), btn('Annuler', () => { ui.chMove = null; setTool('select'); }, 'sm')];
EXT.hint.ch_note = () => [h('b', null, 'Annoter'),
  h('span', { class: 'msg' }, S.pencil ? 'Écrivez au Pencil ; le doigt déplace le plan.' : 'Écrivez au doigt ou au Pencil ; deux doigts déplacent le plan.'),
  h('div', { class: 'seg ch-cols', role: 'group', 'aria-label': 'Couleur' }, COULEURS_NOTE.map((k) => h('button', { type: 'button', 'aria-label': k.n, title: k.n, 'aria-pressed': String(!ui.chOpt.gomme && ui.chOpt.col === k.v), onclick: () => { ui.chOpt.col = k.v; ui.chOpt.gomme = false; updateHint(); } }, h('i', { style: `background:${k.v}` })))),
  segCtl([{ v: 2, n: 'Fin' }, { v: 3, n: 'Moyen' }, { v: 6, n: 'Épais' }], ui.chOpt.ep, (v) => { ui.chOpt.ep = v; ui.chOpt.gomme = false; updateHint(); }),
  h('button', { type: 'button', class: 'btn sm' + (ui.chOpt.gomme ? ' pri' : ''), 'aria-pressed': String(ui.chOpt.gomme), onclick: () => { ui.chOpt.gomme = !ui.chOpt.gomme; updateHint(); } }, 'Gomme'),
  fin()];

/* ---------------- photos ---------------- */
const PIN = h('input', { type: 'file', accept: 'image/*', hidden: true, id: 'photoIn' });
document.body.append(PIN);
let attentePhoto = null;
PIN.addEventListener('change', async () => {
  const f = PIN.files && PIN.files[0], cb = attentePhoto; PIN.value = ''; attentePhoto = null;
  if (f && cb) await cb(f);
});
function choisirPhoto(cb) { attentePhoto = cb; PIN.click(); }
/* enregistre l'image puis place (ou complète) la photo sur le plan */
async function ajouterImage(fichier, lieu, existante) {
  if (!(await ouvrirPhotos())) { toast('Photos indisponibles sur ce navigateur (stockage).'); return null; }
  const id = uid('ph');
  toast('Enregistrement de la photo sur l’iPad…');
  let r;
  try { r = await enregistrerPhoto(id, P.id, fichier); } catch (e) { console.error(e); toast('Photo non enregistrée : image illisible ou stockage plein.'); return null; }
  const ch = CH();
  let f;
  if (existante) {
    // nouvelle image : nouvel identifiant (l'ancienne image reste disponible pour l'historique des versions)
    f = Object.assign({}, existante, { id, at: Date.now(), w: r.w, h: r.h }); delete f.aFaire;
    ch.photos = ch.photos.map((x) => (x === existante ? f : x));
  } else {
    f = { id, lv: lieu.lv, x: Math.round(lieu.x * 10) / 10, y: Math.round(lieu.y * 10) / 10, at: Date.now(), legende: lieu.legende || '', w: r.w, h: r.h };
    if (lieu.reserve) f.reserve = lieu.reserve;
    ch.photos.push(f);
  }
  noter(P, 'photo', `Photo ${existante && existante.aFaire ? 'prise' : 'ajoutée'}${f.legende ? ' : ' + f.legende : ''}`);
  ui.sel = { t: 'photo', id: f.id }; ui.inspOpen = true;
  commit();
  toast('Photo enregistrée sur cet appareil.');
  return f;
}
function fenetrePhoto(lieu) {
  openModal('Photo sur le plan',
    h('p', { class: 'note' }, 'La photo reste sur cet iPad (rien n’est envoyé en ligne). Elle est ajoutée à la sauvegarde complète de vos plans.'),
    btns(btn('Prendre ou choisir une photo', () => { closeModal(); choisirPhoto((f) => ajouterImage(f, lieu)); }, 'pri', 'img'),
      btn('Marquer « photo à prendre »', () => {
        closeModal();
        const f = { id: uid('ph'), lv: lieu.lv, x: Math.round(lieu.x * 10) / 10, y: Math.round(lieu.y * 10) / 10, legende: lieu.legende || '', aFaire: true };
        if (lieu.reserve) f.reserve = lieu.reserve;
        CH().photos.push(f); noter(P, 'photo', 'Photo à prendre ajoutée' + (f.legende ? ' : ' + f.legende : ''));
        ui.sel = { t: 'photo', id: f.id }; ui.inspOpen = true; commit();
      })));
}
function vignette(f, grande) {
  const img = h('img', { class: grande ? 'ch-photo-g' : 'ch-photo', alt: f.legende || 'Photo du chantier' });
  if (f.aFaire) return h('div', { class: 'ch-photo vide' }, 'Photo à prendre');
  urlPhoto(f.id, grande).then((u) => { if (u) img.src = u; else img.replaceWith(h('div', { class: 'ch-photo vide' }, 'Image absente de cet appareil')); });
  return img;
}
function voirPhoto(f) {
  openModal(f.legende || 'Photo', vignette(f, true), h('p', { class: 'note' }, `Prise le ${fmtDH(f.at)}${f.w ? ` · ${f.w} × ${f.h} px` : ''}`));
  $('#modal').classList.add('wide');
}

/* ---------------- inspecteurs ---------------- */
function centrer(o) {
  if (o.lv !== ui.lv) switchLevel(o.lv);
  V.ox = SCR.w / 2 - o.x * V.s; V.oy = SCR.h / 2 - o.y * V.s; requestRender();
}
function bouton(on, label, onclick, id) {
  return h('button', { type: 'button', class: 'btn ch-tog', id, 'aria-pressed': String(!!on), onclick }, h('span', { class: 'ch-box', 'aria-hidden': 'true' }), h('span', null, label));
}
function champTexte(id, label, val, max, onSet, multi) {
  const i = h(multi ? 'textarea' : 'input', { class: 'txt', id, 'aria-label': label, autocomplete: 'off', ...(multi ? { rows: 3 } : { type: 'text', enterkeyhint: 'done' }) });
  i.value = val || '';
  i.addEventListener('change', () => onSet(i.value.replace(/[\u0000-\u0008\u000b-\u001f]/g, ' ').trim().slice(0, max)));
  if (!multi) i.addEventListener('keydown', (e) => { if (e.key === 'Enter') i.blur(); });
  return h('label', { class: 'fld' }, h('span', null, label), i);
}
function inspChantierElec(e) {
  const c = e.cid && P.circuits.find((x) => x.id === e.cid);
  const dp = datePose(P, 'app', e.id), dc = c && datePose(P, 'circ', c.id);
  const res = CH().reserves.filter((r) => r.ref && r.ref.t === 'elec' && r.ref.id === e.id);
  return [inspHead(nomElec(e), c ? nomCirc(c) : 'Sans circuit'),
    body(
      sec('Pose', bouton(dp, dp ? `Posé (le ${fmtD(dp)})` : 'Posé', () => { marquerPose(P, 'app', e.id, !dp, null, nomElec(e)); commit(); }, 'ch-pose-app'),
        c ? bouton(dc, dc ? `Circuit posé : ${c.name} (le ${fmtD(dc)})` : `Circuit posé : ${c.name}`, () => { marquerPose(P, 'circ', c.id, !dc, null, nomCirc(c)); commit(); }, 'ch-pose-circ') : null,
        c ? h('p', { class: 'note' }, 'Circuit posé : câble tiré et raccordé au tableau (case de suivi, saisie par vous).') : null),
      sec('Réserves', res.length ? listeReserves(res) : h('p', { class: 'note' }, 'Aucune réserve sur cet appareil.'),
        btns(btn('Réserve sur cet appareil', () => {
          const r = nouvelleReserve(P, { lv: e.lv, x: e.x + 22 / V.s, y: e.y + 22 / V.s }, { ref: { t: 'elec', id: e.id }, titre: nomElec(e) });
          ui.sel = { t: 'reserve', id: r.id }; commit();
        }, 'sm', 'plus'), btn('Photo de cet appareil', () => fenetrePhoto({ lv: e.lv, x: e.x - 22 / V.s, y: e.y + 22 / V.s, legende: nomElec(e) }), 'sm', 'img'))),
      sec(null, btns(btn('Modifier dans l’onglet Plan', () => { const s = ui.sel; setView('plan'); ui.sel = s; ui.inspOpen = true; renderInspector(); requestRender(); }, 'sm'))),
    )];
}
EXT.insp.elec = (e) => (ui.chantier ? inspChantierElec(e) : inspElec(e));
function dateChamp(id, label, val, onSet) {
  const z = (n) => String(n).padStart(2, '0'), d = val ? new Date(val) : null;
  const i = h('input', { class: 'txt', id, type: 'date', 'aria-label': label, value: d ? `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}` : '' });
  i.addEventListener('change', () => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(i.value); onSet(m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() : null); });
  return h('label', { class: 'fld' }, h('span', null, label), i);
}
function inspReserve(r) {
  const st = STATUT_BY.get(r.statut);
  const lie = r.ref && r.ref.t === 'elec' ? IDX.elec.get(r.ref.id) : null;
  const ph = CH().photos.filter((f) => f.reserve === r.id);
  const maj = () => { r.maj = Date.now(); commit(); };
  return [inspHead(`Réserve n° ${r.n}`, `${st.n} · ${(levelOf(r.lv) || {}).name || ''}`),
    body(
      champTexte('f-rs-titre', 'Titre', r.titre, 120, (v) => { if (v === r.titre) return; r.titre = v; maj(); }),
      champTexte('f-rs-det', 'Description', r.detail, 2000, (v) => { if (v === r.detail) return; r.detail = v; maj(); }, true),
      sec('Statut', segCtl(STATUTS_RESERVE.map((s) => ({ v: s.v, n: s.n })), r.statut, (v) => { if (changerStatut(P, r, v)) commit(); })),
      dateChamp('f-rs-ech', 'Échéance (facultative)', r.echeance, (t) => { if (t) r.echeance = t; else delete r.echeance; maj(); }),
      kv([['Créée le', fmtDH(r.cree)], ['Modifiée le', fmtDH(r.maj)], r.leve ? ['Levée le', fmtDH(r.leve)] : null,
        r.echeance && r.statut !== 'levee' && r.echeance < Date.now() ? ['Échéance', h('b', { style: 'color:#C2362B' }, 'dépassée')] : null]),
      lie ? sec('Appareil concerné', btns(btn(nomElec(lie), () => { select({ t: 'elec', id: lie.id }); centrer(lie); }, 'sm'))) : null,
      sec('Photos', ph.length ? h('div', { class: 'ch-vigs' }, ph.map((f) => h('button', { type: 'button', class: 'ch-vig', onclick: () => select({ t: 'photo', id: f.id }) }, vignette(f)))) : null,
        btns(btn('Ajouter une photo', () => fenetrePhoto({ lv: r.lv, x: r.x + 26 / V.s, y: r.y, reserve: r.id, legende: `Réserve n° ${r.n}` }), 'sm', 'img'))),
      sec(null, btns(btn('Déplacer', () => { ui.chMove = { t: 'reserve', id: r.id }; setTool('ch_move'); }, 'sm'),
        confirmBtn('Supprimer', 'Confirmer ?', () => { ui.sel = { t: 'reserve', id: r.id }; EXT.del.reserve(r.id); ui.sel = null; commit(); }))),
      h('p', { class: 'note' }, 'Statut de suivi saisi par vous (ouverte, en cours, levée) : ce n’est pas un statut de conformité.'),
    )];
}
EXT.insp.reserve = inspReserve;
function inspPhoto(f) {
  const res = CH().reserves;
  const sel = h('select', { class: 'txt', id: 'f-ph-res', 'aria-label': 'Réserve liée' }, h('option', { value: '' }, 'Aucune'),
    res.map((r) => h('option', { value: r.id, selected: r.id === f.reserve }, `n° ${r.n}${r.titre ? ' · ' + r.titre : ''}`)));
  sel.addEventListener('change', () => { if (sel.value) f.reserve = sel.value; else delete f.reserve; commit(); });
  return [inspHead(f.aFaire ? 'Photo à prendre' : 'Photo', (levelOf(f.lv) || {}).name || ''),
    body(
      f.aFaire ? h('div', { class: 'ch-photo vide' }, 'Photo à prendre') : h('button', { type: 'button', class: 'ch-vig grand', 'aria-label': 'Agrandir la photo', onclick: () => voirPhoto(f) }, vignette(f)),
      champTexte('f-ph-leg', 'Légende', f.legende, 300, (v) => { if (v === f.legende) return; f.legende = v; commit(); }),
      f.at ? kv([['Prise le', fmtDH(f.at)], f.w ? ['Taille', `${f.w} × ${f.h} px`] : null]) : null,
      sec('Réserve liée', sel),
      sec(null, btns(btn(f.aFaire ? 'Prendre ou choisir la photo' : 'Remplacer la photo', () => choisirPhoto((x) => ajouterImage(x, null, f)), f.aFaire ? 'pri sm' : 'sm', 'img'),
        btn('Déplacer', () => { ui.chMove = { t: 'photo', id: f.id }; setTool('ch_move'); }, 'sm'),
        confirmBtn('Retirer', 'Confirmer ?', () => { EXT.del.photo(f.id); ui.sel = null; commit(); }))),
      h('p', { class: 'note' }, 'Image enregistrée sur cet appareil seulement, hors du plan. Retirer la photo du plan garde l’image (historique des versions) : Menu › Mes plans… « Libérer l’espace » efface les images inutilisées.'),
    )];
}
EXT.insp.photo = inspPhoto;
function inspNote(n) {
  return [inspHead('Annotation', (levelOf(n.lv) || {}).name || ''),
    body(n.at ? kv([['Écrite le', fmtDH(n.at)]]) : null,
      sec('Couleur', h('div', { class: 'seg ch-cols' }, COULEURS_NOTE.map((k) => h('button', { type: 'button', 'aria-label': k.n, 'aria-pressed': String(n.col === k.v), onclick: () => { n.col = k.v; commit(); } }, h('i', { style: `background:${k.v}` }))))),
      sec(null, btns(btn('Supprimer', () => { EXT.del.note(n.id); ui.sel = null; commit(); }, 'danger', 'del'))))];
}
EXT.insp.note = inspNote;

/* ---------------- panneau « Suivi de chantier » (aucune sélection) ---------------- */
function barre(p) { return h('div', { class: 'ch-bar', role: 'progressbar', 'aria-valuenow': String(p || 0), 'aria-valuemin': '0', 'aria-valuemax': '100' }, h('i', { style: `width:${p || 0}%` })); }
function listeReserves(l) {
  return h('div', { class: 'list ch-res' }, l.map((r) => {
    const st = STATUT_BY.get(r.statut);
    return h('button', { type: 'button', class: 'li', 'data-reserve': r.id, onclick: () => { select({ t: 'reserve', id: r.id }); centrer(r); } },
      h('span', { class: 'ch-num', style: `background:${st.c}` }, String(r.n)),
      h('span', null, r.titre || 'Sans titre', h('small', null, `${st.n} · ${fmtD(r.cree)}${r.echeance && r.statut !== 'levee' ? ' · échéance ' + fmtD(r.echeance) : ''}`)),
      h('span', { class: 'v' }, (levelOf(r.lv) || {}).name || ''));
  }));
}
function panneau() {
  if (!ui.chantier) return null;
  const ch = CH(), av = avancement(P, { reperes: circNumbers() }), rs = resumeReserves(P), L = levelOf(ui.lv);
  const nv = av.niveaux.find((x) => x.id === ui.lv);
  const filt = ui.chOpt.filtre, liste = ch.reserves.filter((r) => filt === 'tous' || r.statut === filt).slice().sort((a, b) => a.n - b.n);
  const notesNv = ch.notes.filter((n) => n.lv === ui.lv).length, aPrendre = ch.photos.filter((f) => f.aFaire).length;
  const esp = h('p', { class: 'note', id: 'chEspace' }, '');
  espacePhotos().then((e) => { if (e && esp.isConnected) esp.textContent = `${e.n} image${e.n > 1 ? 's' : ''} sur cet appareil (${(e.size / 1048576).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo), tous plans confondus.`; });
  return [inspHead('Suivi de chantier', L ? L.name : ''),
    body(
      sec('Avancement',
        h('div', { class: 'ch-av' }, h('span', null, 'Appareils posés'), h('b', null, `${av.app.poses} / ${av.app.n}`), barre(av.app.pct)),
        h('div', { class: 'ch-av' }, h('span', null, 'Circuits posés'), h('b', null, `${av.circ.poses} / ${av.circ.n}`), barre(av.circ.pct)),
        nv ? h('div', { class: 'ch-av' }, h('span', null, `Ce niveau (${nv.nom})`), h('b', null, `${nv.poses} / ${nv.n}`), barre(nv.pct)) : null,
        h('p', { class: 'note' }, 'Cases « posé » cochées par vous (outil « Posé », ou en touchant un appareil).')),
      sec('Réserves',
        h('p', null, h('b', null, `${rs.total} réserve${rs.total > 1 ? 's' : ''}`), ` : ${rs.ouverte} ouverte${rs.ouverte > 1 ? 's' : ''}, ${rs.en_cours} en cours, ${rs.levee} levée${rs.levee > 1 ? 's' : ''}`, rs.enRetard ? h('b', { style: 'color:#C2362B' }, ` · ${rs.enRetard} en retard`) : null),
        segCtl([{ v: 'tous', n: 'Toutes' }, ...STATUTS_RESERVE.map((s) => ({ v: s.v, n: s.n }))], filt, (v) => { ui.chOpt.filtre = v; renderInspector(); requestRender(); }),
        liste.length ? listeReserves(liste) : h('p', { class: 'note' }, 'Aucune réserve dans ce filtre.'),
        btns(btn('Nouvelle réserve', () => setTool('ch_res'), 'sm', 'plus'))),
      h('details', { class: 'ch-det' }, h('summary', null, `Circuits (${av.circ.poses} / ${av.circ.n} posés)`),
        h('div', { class: 'list' }, av.parCircuit.map((c) => h('div', { class: 'li ch-circ' },
          bouton(c.circuitPose, (c.rep ? c.rep + ' · ' : '') + c.nom, () => { const cc = P.circuits.find((x) => x.id === c.id); marquerPose(P, 'circ', c.id, !c.circuitPose, null, nomCirc(cc)); commit(); }, 'ch-c-' + c.id),
          h('span', { class: 'v' }, c.n ? `${c.poses} / ${c.n} app.` : '—'))))),
      sec('Photos', h('p', null, `${ch.photos.length - aPrendre} photo${ch.photos.length - aPrendre > 1 ? 's' : ''}${aPrendre ? `, ${aPrendre} à prendre` : ''}.`),
        ch.photos.length ? h('div', { class: 'ch-vigs' }, ch.photos.slice(-12).map((f) => h('button', { type: 'button', class: 'ch-vig', onclick: () => { select({ t: 'photo', id: f.id }); centrer(f); } }, vignette(f)))) : null,
        btns(btn('Photo sur le plan', () => setTool('ch_photo'), 'sm', 'img')), esp,
        btns(btn('Libérer l’espace', libererEspace, 'sm'))),
      sec('Annotations', h('p', null, `${notesNv} sur ce niveau, ${ch.notes.length} en tout.`),
        btns(btn('Annoter', () => setTool('ch_note'), 'sm', 'pen'), notesNv ? confirmBtn('Effacer celles de ce niveau', 'Confirmer ?', () => { ch.notes = ch.notes.filter((n) => n.lv !== ui.lv); noter(P, 'note', `Annotations effacées (${L ? L.name : ''})`); commit(); }) : null)),
      h('details', { class: 'ch-det', open: true }, h('summary', null, `Historique du chantier (${ch.journal.length})`),
        ch.journal.length ? h('ol', { class: 'ch-jr', reversed: true }, ch.journal.slice().sort((x, y) => x.at - y.at).slice(-40).reverse().map((j) => h('li', null, h('small', null, fmtDH(j.at)), ' ', j.txt))) : h('p', { class: 'note' }, 'Rien pour l’instant.')),
      sec('Dossier PDF', h('p', { class: 'note' }, 'Avancement, réserves, plans annotés, photos et historique : chapitre « Suivi de chantier » du dossier.'),
        btns(btn('Dossier PDF du chantier', openDossierChantier, 'sm', 'book'))),
    )];
}
EXT.inspVide = panneau;

/* images qu'aucun plan ni aucune version n'utilise */
async function libererEspace() {
  const { DB } = await import('./stockage.js');
  if (!DB.ok) { toast('Stockage indisponible.'); return; }
  const textes = [JSON.stringify(P)];
  try {
    for (const d of await DB.all('data')) if (d && d.json) textes.push(d.json);
    for (const d of await DB.all('vdata')) if (d && d.json) textes.push(d.json);
  } catch (e) { toast('Lecture des plans impossible : rien n’a été effacé.'); return; }
  const ids = await photosInutilisees(textes);
  if (!ids.length) { toast('Aucune image inutilisée : rien à effacer.'); return; }
  openModal('Libérer l’espace',
    h('p', null, `${ids.length} image${ids.length > 1 ? 's' : ''} ne ${ids.length > 1 ? 'sont' : 'est'} utilisée${ids.length > 1 ? 's' : ''} par aucun plan ni aucune version de l’historique.`),
    h('p', { class: 'note' }, 'Faites d’abord une sauvegarde complète si vous voulez les garder (Menu › Sauvegarder tous mes plans).'),
    btns(confirmBtn('Effacer ces images', 'Confirmer l’effacement', async () => { await supprimerPhotos(ids); closeModal(); toast('Images effacées.'); renderInspector(); }), btn('Annuler', closeModal)));
}

/* bouton « Suivi » de la barre d'outils du chantier */
document.getElementById('btnSuivi')?.addEventListener('click', () => { ui.sel = null; ui.inspOpen = true; renderInspector(); requestRender(); });
document.getElementById('btnQuitCh')?.addEventListener('click', () => setView('plan'));

export { ajouterImage, centrer, dessinerChantier, entrer, fenetrePhoto, inspChantierElec, inspPhoto, inspReserve, libererEspace, panneau, sortir };

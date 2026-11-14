/* Calque — module « compositionsui » : écran de la composition des murs, des cloisons, du plancher et du plafond
   (sections de l'inspecteur d'un mur, d'un niveau et d'une gaine). Calculs dans compositions.js (sans écran).
   Les épaisseurs proposées sont des dimensions nominales courantes, présentées comme telles (à vérifier). */
import { P, S, estExterieure, isNum, saveSettings, setGEO } from './noyau.js';
import { geo } from './geometrie.js';
import { clampOpening } from './mutations.js';
import { commit } from './interaction.js';
import { btn, btns, chipRow, confirmBtn, h, kv, numField, renderInspector, sec, segCtl, textField, toast, wallSideName } from './interface.js';
import { CATS, COMPOSITIONS, MATERIAUX, ORIGINE, aCouches, appliquerAuMur, appliquerAuNiveau, changerEpaisseur, compoNiveau, copierCouches, courtCouche,
  couchesOrientees, couchesPassage, epaisseur, logementGaine, matDe, nomCouche, placerDansCouche, resumePassage, surfacesMateriaux } from './compositions.js';

import { LAMBDA } from './thermique.js';

const fmt = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
const ETATS = { ok: ['ok', 'Place suffisante'], noyee: ['warn', 'Gaine noyée'], insuffisant: ['bad', 'Épaisseur insuffisante'], saignee: ['warn', 'Saignée à prévoir'], inconnu: ['', 'Non vérifié'] };
const ui_ = { tous: false }; // afficher aussi les compositions types des autres usages

/* barre empilée : une case par couche, largeur proportionnelle à l'épaisseur */
function barre(couches, gauche, droite) {
  const tot = epaisseur(couches) || 1;
  return h('div', { class: 'compo-bar-w' },
    gauche || droite ? h('div', { class: 'compo-sides' }, h('span', null, gauche || ''), h('span', null, droite || '')) : null,
    h('div', { class: 'compo-bar', role: 'img', 'aria-label': couches.map((c) => `${nomCouche(c)} ${fmt(c.e)} cm`).join(', ') },
      couches.map((c) => h('span', { title: `${nomCouche(c)} · ${fmt(c.e)} cm`, style: `flex:${Math.max(c.e / tot, 0.02)} 1 0;background:${matDe(c).coul || 'var(--c-room)'}${matDe(c).passage === 'libre' ? ';background-image:repeating-linear-gradient(135deg,transparent 0 4px,rgba(0,0,0,.12) 4px 6px)' : ''}` },
        c.e / tot > 0.16 ? courtCouche(c) : ''))));
}
/* liste des matériaux (ceux de l'usage d'abord) */
function selectMateriau(c, usage, onPick) {
  const s = h('select', { class: 'txt', 'aria-label': 'Matériau de la couche' });
  const groupes = new Map();
  const ent = Object.entries(MATERIAUX);
  for (const [id, m] of [...ent.filter(([, m]) => m.usage.includes(usage)), ...ent.filter(([, m]) => !m.usage.includes(usage))]) {
    const k = m.usage.includes(usage) ? CATS[m.cat] : 'Autres usages';
    if (!groupes.has(k)) groupes.set(k, []);
    groupes.get(k).push(h('option', { value: id, selected: id === c.m }, m.n));
  }
  for (const [k, l] of groupes) s.append(h('optgroup', { label: k }, l));
  s.addEventListener('change', () => onPick(s.value));
  return s;
}
const off = (b, v) => { if (v) b.disabled = true; b.setAttribute('aria-label', b.textContent === '↑' ? 'Monter la couche' : b.textContent === '↓' ? 'Descendre la couche' : b.textContent); return b; };
/* éditeur d'une liste de couches ; set(couches) enregistre (une étape d'« Annuler ») */
function editeurCouches(couches, usage, set, prefix) {
  const l = copierCouches(couches);
  const maj = (f) => { const x = copierCouches(l); f(x); set(x); };
  return h('div', { class: 'compo-list' }, l.map((c, i) => {
    const m = matDe(c);
    return h('div', { class: 'compo-row' },
      h('div', { class: 'compo-top' },
        h('span', { class: 'compo-sw', style: `background:${m.coul || 'var(--c-room)'}` }),
        selectMateriau(c, usage, (v) => maj((x) => { x[i].m = v; if (v !== 'autre') delete x[i].n; const e = MATERIAUX[v].eps; if (e.length && !e.includes(x[i].e)) x[i].e = e[Math.min(1, e.length - 1)]; }))),
      c.m === 'autre' ? textField('Nom du matériau', c.n || '', (v) => maj((x) => { if (v.trim()) x[i].n = v.trim().slice(0, 60); else delete x[i].n; }), { id: `${prefix}-n${i}` }) : null,
      h('div', { class: 'compo-top' }, numField('Épaisseur', c.e, 'cm', (v) => maj((x) => { x[i].e = v; }), { id: `${prefix}-e${i}`, min: 0.1, max: 200, fmt }),
        h('div', { class: 'compo-mv' },
          off(btn('↑', () => maj((x) => { if (i > 0) [x[i - 1], x[i]] = [x[i], x[i - 1]]; }), 'sm'), !i),
          off(btn('↓', () => maj((x) => { if (i < x.length - 1) [x[i + 1], x[i]] = [x[i], x[i + 1]]; }), 'sm'), i === l.length - 1),
          off(btn('✕', () => maj((x) => x.splice(i, 1)), 'sm danger'), false))),
      m.passage ? h('p', { class: 'note' }, m.passage === 'libre' ? `Passage des gaines jusqu’à Ø${Math.floor(c.e * 10)}.` : 'Gaines noyées à la coulée.') : null,
      m.eps.length ? chipRow(m.eps, c.e, (v) => maj((x) => { x[i].e = v; }), (v) => fmt(v)) : null,
      champThermique(c, i, maj, prefix));
  }),
  btns(btn('Ajouter une couche', () => maj((x) => x.push({ m: usage === 'sol' ? 'chape' : usage === 'plafond' ? 'plaque' : 'plaque', e: usage === 'sol' ? 5 : 1.25 })), 'sm', 'plus')));
}
/* conductivité λ (ou résistance R d'un vide) d'une couche : estimée par Calque tant qu'elle n'est pas saisie */
function champThermique(c, i, maj, prefix) {
  const t = LAMBDA[c.m] || {}, parR = isNum(c.r) || (!isNum(c.l) && isNum(t.r));
  const v = parR ? (isNum(c.r) ? c.r : t.r) : isNum(c.l) ? c.l : t.l;
  const saisi = isNum(c.l) || isNum(c.r);
  return h('div', { class: 'compo-th' },
    numField(parR ? 'Résistance R' : 'Conductivité λ', isNum(v) ? v : null, parR ? 'm²·K/W' : 'W/m·K',
      (x) => maj((y) => { if (parR) { y[i].r = x; delete y[i].l; } else { y[i].l = x; delete y[i].r; } }), { id: `${prefix}-l${i}`, min: 0.001, max: parR ? 50 : 400, fmt: (x) => (isNum(x) ? String(Math.round(x * 1000) / 1000).replace('.', ',') : '') }),
    h('p', { class: 'note' }, saisi ? 'Saisie (fiche du fabricant).' : isNum(v) ? 'Estimée par Calque : remplacez-la par la valeur du fabricant.' : 'Manquante : saisissez-la pour calculer les déperditions.'),
    saisi ? btns(btn('Revenir à la valeur estimée', () => maj((y) => { delete y[i].l; delete y[i].r; }), 'sm')) : null);
}
/* compositions types d'un usage */
function choixTypes(usage, onPick) {
  const l = COMPOSITIONS.filter((c) => ui_.tous || c.usage === usage || (usage === 'cloison' && c.usage === 'mur' && /Refend/.test(c.n)));
  return h('div', null,
    h('div', { class: 'list' }, l.map((c) => h('button', { type: 'button', class: 'li', onclick: () => onPick(c) },
      h('span', { class: 'sw', style: `background:${matDe(c.couches.find((x) => matDe(x).cat === 'structure') || c.couches[0]).coul}` }),
      h('span', null, c.n), h('span', { class: 'v' }, fmt(epaisseur(c.couches)) + ' cm')))),
    usage === 'mur' || usage === 'cloison' ? btns(btn(ui_.tous ? 'Seulement les ' + (usage === 'mur' ? 'murs' : 'cloisons') : 'Voir aussi les ' + (usage === 'mur' ? 'cloisons' : 'murs'), () => { ui_.tous = !ui_.tous; renderInspector(); }, 'sm')) : null,
    h('p', { class: 'note' }, ORIGINE + '. Chaque couche reste modifiable ensuite.'));
}

/* ---------------- mur ou cloison ---------------- */
const regeo = () => { setGEO({}); for (const o of P.openings) clampOpening(o); };
/* nouvelle composition : le mur s'élargit dans le sens choisi (sensElargissement) ; tronçons alignés du même mur compris */
function appliquerMur(w, couches, nom) { changerEpaisseur(P, w, null, sensDe(w), couches, nom); regeo(); commit(); }
/* sens d'élargissement choisi pour un mur (pendant la session) : 'centre', 'c1' (vers le côté 1), 'c2' (vers le côté 2) */
const SENS = new Map();
const sensDe = (w) => SENS.get(w.id) || 'centre';
function epaissir(w, v) { changerEpaisseur(P, w, v, sensDe(w)); regeo(); commit(); }
function sensElargissement(w, g) {
  const c1 = wallSideName(g, 1), c2 = wallSideName(g, -1), s = sensDe(w);
  return h('div', { class: 'fld' }, h('span', null, 'Quand l’épaisseur change, le mur s’élargit'),
    segCtl([{ v: 'centre', n: 'Des deux côtés' }, { v: 'c1', n: 'Vers ' + c1 }, { v: 'c2', n: 'Vers ' + c2 }], s, (v) => { SENS.set(w.id, v); renderInspector(); }),
    h('p', { class: 'note' }, s === 'centre' ? 'Les deux faces s’écartent de la même valeur.'
      : `La face côté ${s === 'c1' ? c2 : c1} ne bouge pas. Les angles du mur se déplacent : les murs adjacents s’allongent ou raccourcissent pour suivre, leurs portes et fenêtres restent en place, les appareils posés sur la face qui bouge la suivent.`));
}
function exterieurCote1(g) { return wallSideName(g, 1) === 'extérieur' && wallSideName(g, -1) !== 'extérieur'; }
/* section « Composition » de l'inspecteur d'un mur */
function compoMurSection(w, g) {
  const usage = w.kind === 'cloison' ? 'cloison' : 'mur';
  const c1 = wallSideName(g, 1), c2 = wallSideName(g, -1);
  if (!aCouches(w)) {
    const def = S.compo && S.compo[usage];
    return sec('Composition',
      h('p', { class: 'note' }, 'Composition non renseignée. Choisissez une composition type (plaque de plâtre, laine de verre, parpaing, brique…) : l’épaisseur du mur devient celle des couches.'),
      def && aCouches(def) ? btns(btn(`Comme les prochains ${usage === 'mur' ? 'murs' : 'cloisons'} : ${def.cn || fmt(epaisseur(def.couches)) + ' cm'}`, () => appliquerMur(w, exterieurCote1(g) ? copierCouches(def.couches).reverse() : def.couches, def.cn), 'sm')) : null,
      choixTypes(usage, (c) => appliquerMur(w, couchesOrientees(c, exterieurCote1(g)), c.n)),
      btns(btn('Composer couche par couche', () => appliquerMur(w, [{ m: usage === 'mur' ? 'parpaing' : 'brique_platriere', e: Math.round(w.th * 100) / 100 }], null), 'sm')));
  }
  const pass = resumePassage(w.couches);
  const gaines = P.ducts.filter((d) => d.lv === w.lv && d.pose === 'cloison').flatMap((d) => logementGaine(P, d).filter((x) => x.wall === w.id).map((x) => Object.assign(x, { d })));
  const autres = P.walls.filter((x) => x.lv === w.lv && x.id !== w.id && x.kind === w.kind);
  return sec('Composition',
    w.cn ? h('p', { class: 'note' }, h('b', null, w.cn)) : null,
    barre(w.couches, 'Côté 1 : ' + c1, 'Côté 2 : ' + c2),
    kv([['Épaisseur totale', fmt(epaisseur(w.couches)) + ' cm'], ['Passage des gaines', pass ? pass.txt : '—']]),
    editeurCouches(w.couches, usage, (x) => appliquerMur(w, x, w.cn), 'f-cm'),
    gaines.length ? h('div', null, h('p', { class: 'note' }, 'Gaines encastrées dans ce ' + (usage === 'mur' ? 'mur' : 'cloison') + ' :'),
      gaines.map((x) => h('div', { class: 'compo-ok' }, h('span', { class: 'pill ' + ETATS[x.statut][0] }, ETATS[x.statut][1]), h('span', { class: 'note' }, x.msg)))) : null,
    btns(btn('Inverser les côtés', () => appliquerMur(w, copierCouches(w.couches).reverse(), w.cn), 'sm'),
      btn(`Utiliser pour les prochain${usage === 'mur' ? 's murs' : 'es cloisons'}`, () => {
        S.compo = Object.assign({}, S.compo || {}, { [usage]: Object.assign({ couches: copierCouches(exterieurCote1(g) ? copierCouches(w.couches).reverse() : w.couches) }, w.cn ? { cn: w.cn } : {}) });
        saveSettings(); toast(`Les prochain${usage === 'mur' ? 's murs' : 'es cloisons'} tracé${usage === 'mur' ? 's' : 'es'} auront cette composition.`); renderInspector();
      }, 'sm'),
      autres.length ? confirmBtnSimple(`Appliquer aux ${autres.length} autre${autres.length > 1 ? 's' : ''} ${usage === 'mur' ? 'mur' : 'cloison'}${autres.length > 1 ? 's' : ''} du niveau`, 'Confirmer', () => {
        const ext1 = exterieurCote1(g), base = ext1 ? copierCouches(w.couches).reverse() : w.couches; // couches vues depuis la pièce
        for (const x of autres) { const gx = geo(x.lv).walls.get(x.id); appliquerAuMur(x, gx && exterieurCote1(gx) ? copierCouches(base).reverse() : base, w.cn); }
        regeo(); commit(); toast('Composition appliquée.');
      }) : null,
      confirmBtn('Retirer la composition', 'Confirmer le retrait', () => { appliquerAuMur(w, null); commit(); })),
    h('p', { class: 'note' }, 'Couches du côté 1 vers le côté 2. ' + ORIGINE + '.'));
}
function confirmBtnSimple(label, confirmLabel, action) {
  const b = btn(label, () => {
    if (b.dataset.armed) { action(); return; }
    b.dataset.armed = '1'; b.textContent = confirmLabel; b.classList.add('pri');
    setTimeout(() => { if (b.isConnected) { delete b.dataset.armed; b.textContent = label; b.classList.remove('pri'); } }, 3500);
  }, 'sm');
  return b;
}
/* épaisseur d'un mur composé : calculée (le champ libre est remplacé) */
function epaisseurComposee(w, g) {
  return sec('Épaisseur', h('p', { class: 'note' }, `${fmt(w.th)} cm : somme des couches de la composition (modifiez une couche pour la changer).`), g ? sensElargissement(w, g) : null);
}
/* propriétés d'un nouveau mur : composition choisie pour les prochains murs ou cloisons */
function compoNouveauMur(pr) {
  const def = S.compo && S.compo[pr.kind === 'cloison' ? 'cloison' : 'mur'];
  if (def && aCouches(def)) appliquerAuMur(pr, def.couches, def.cn);
  return pr;
}
function nomCompoNouveauMur(kind) { const def = S.compo && S.compo[kind === 'cloison' ? 'cloison' : 'mur']; return def && aCouches(def) ? def.cn || fmt(epaisseur(def.couches)) + ' cm' : null; }
function oublierCompoNouveauMur(kind) { if (S.compo) { delete S.compo[kind === 'cloison' ? 'cloison' : 'mur']; saveSettings(); } }

/* ---------------- plancher et plafond d'un niveau ---------------- */
const ui2 = { ouvert: null }; // 'sol' | 'plafond' : liste des compositions types dépliée
function compoNiveauSection(lvl) {
  const bloc = (k, titre) => {
    const cp = compoNiveau(lvl, k);
    const set = (couches, nom) => { appliquerAuNiveau(lvl, k, couches, nom); ui2.ouvert = null; commit(); };
    if (!cp) return h('div', { class: 'compo-niv' }, h('h4', null, titre),
      h('p', { class: 'note' }, k === 'sol' ? 'Non renseigné. Le plancher donne son épaisseur au niveau et indique où passent les gaines posées « dans le sol ».' : 'Non renseigné. Le plafond indique où passent les gaines posées « au plafond » (plénum du faux plafond, isolant des combles).'),
      ui2.ouvert === k ? choixTypes(k, (c) => set(c.couches, c.n)) : btns(btn('Choisir une composition', () => { ui2.ouvert = k; renderInspector(); }, 'sm')));
    const pass = resumePassage(cp.couches);
    return h('div', { class: 'compo-niv' }, h('h4', null, titre),
      cp.cn ? h('p', { class: 'note' }, h('b', null, cp.cn)) : null,
      barre(cp.couches, 'Dessus', 'Dessous'),
      kv([['Épaisseur', fmt(epaisseur(cp.couches)) + ' cm' + (k === 'plafond' ? ' (non ajoutée aux hauteurs du niveau)' : '')], ['Passage des gaines', pass ? pass.txt : '—']]),
      editeurCouches(cp.couches, k, (x) => set(x, cp.cn), 'f-' + k),
      btns(confirmBtn('Retirer', 'Confirmer le retrait', () => set(null))));
  };
  const g = geo(lvl.id), aire = g.rooms.reduce((s, r) => s + (estExterieure(r.label) ? 0 : r.area), 0) / 1e4;
  const surf = surfacesMateriaux(P, lvl.id, aire);
  return sec('Plancher, plafond et matériaux',
    bloc('sol', 'Plancher (sol du niveau)'),
    bloc('plafond', 'Plafond'),
    surf.length ? h('div', null, h('h4', null, 'Surfaces des matériaux (estimées)'),
      h('div', { class: 'list' }, surf.map((s) => h('div', { class: 'li' }, h('span', { class: 'sw', style: `background:${matDe(s).coul || 'var(--c-room)'}` }),
        h('span', null, `${s.n} ${fmt(s.e)} cm`, h('small', { style: 'display:block;opacity:.7' }, s.ou)), h('span', { class: 'v' }, fmt(s.m2) + ' m²')))),
      h('p', { class: 'note' }, 'Estimation de Calque : murs en longueur d’axe × hauteur, ouvertures déduites ; plancher et plafond à la surface des pièces. Jonctions, chutes et retours non comptés.')) : null);
}

/* ---------------- gaine : logement dans les couches ---------------- */
function logementSection(d) {
  if (!(d.pose === 'cloison' || d.pose === 'sol' || d.pose === 'plafond')) return null;
  const l = logementGaine(P, d);
  const L = P.levels.find((x) => x.id === d.lv), cp = d.pose !== 'cloison' ? compoNiveau(L, d.pose === 'sol' ? 'sol' : 'plafond') : null;
  const choix = cp ? couchesPassage(cp.couches) : [];
  const peutPlacer = d.pose === 'cloison' && l.some((x) => x.wall && P.walls.some((w) => w.id === x.wall && aCouches(w) && w.couches.some((c) => matDe(c).passage === 'libre')));
  return sec('Logement dans les couches',
    l.length ? l.map((x) => h('div', { class: 'compo-ok' }, h('span', { class: 'pill ' + ETATS[x.statut][0] }, ETATS[x.statut][1]), h('span', { class: 'note' }, x.msg)))
      : h('p', { class: 'note' }, 'Aucun tronçon dans l’épaisseur d’un mur : tracez la gaine le long de l’axe du mur.'),
    choix.length > 1 ? h('div', { class: 'fld' }, h('span', null, `Couche ${d.pose === 'sol' ? 'du plancher' : 'du plafond'} où passe la gaine`),
      segCtl([{ v: null, n: 'Automatique' }, ...choix.map((x) => ({ v: x.c.m, n: courtCouche(x.c) }))], d.couche || null, (v) => { if (v) d.couche = v; else delete d.couche; commit(); })) : null,
    peutPlacer ? btns(btn('Placer dans la couche de passage (laine, vide technique)', () => {
      const n = placerDansCouche(P, d);
      if (!n) { toast('Aucun tronçon à déplacer.'); return; }
      commit(); toast('Gaine placée dans la couche de passage.');
    }, 'sm')) : null,
    h('p', { class: 'note' }, 'Contrôle géométrique de Calque (épaisseur de la couche et diamètre de la gaine), sans valeur réglementaire. Les compositions se règlent en touchant un mur, ou le niveau (plancher et plafond).'));
}

export { epaissir, sensElargissement };
export { compoMurSection, compoNiveauSection, compoNouveauMur, epaisseurComposee, logementSection, nomCompoNouveauMur, oublierCompoNouveauMur };

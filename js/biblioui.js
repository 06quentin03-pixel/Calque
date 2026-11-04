/* Calque — module « interface des bibliothèques » : bibliothèque technique (consultation, références fabricant),
   section « Matériel » de l'inspecteur des symboles électriques.
   Module JavaScript natif (aucune compilation). */
import { P, ui, uid } from './noyau.js';
import { ARTICLES, FAMILLES, FAM_BY, FIAB, FIAB_BY, articleView, articlesFor, searchArticles } from './technique.js';
import { UL, compById, deleteComp, saveComp, setRef } from './mabiblio.js';
import { COMP_RANGEMENTS, MARK_MAX, applyComp, sameComp, unusedPlanComps, upsertPlanComp } from './composants.js';
import { ELEC, ELEC_BY, ELEC_CATS, FURN, FURN_BY, isStair } from './symboles.js';
import { DOMAINES, LIB_EXTRA } from './bibliotheque.js';
import { btn, btns, closeModal, confirmBtn, elecThumb, furnThumb, h, openCatalog, openModal, renderInspector,
  sec, segCtl, toast } from './interface.js';
import { commit } from './interaction.js';

function badge(fiab) {
  const f = FIAB_BY.get(fiab) || FIAB_BY.get('saisie');
  return h('span', { class: 'badge b-' + f.id, title: f.desc }, f.name);
}
function refLine(v) {
  if (!v.ref && !v.fab) return h('small', null, 'Article générique · sans référence fabricant');
  return h('small', null, [v.fab, v.ref ? 'réf. ' + v.ref : null].filter(Boolean).join(' · '));
}

/* ---- fenêtre « Bibliothèque technique » ---- */
const TL = { q: '', fam: '' };
function openTechLib() {
  const list = h('div', { class: 'art-list' });
  const count = h('p', { class: 'note' });
  const fams = h('div', { class: 'tabs subs', style: 'margin:0;border:0;padding:0' });
  const draw = () => {
    let vs = searchArticles(TL.q, UL.refs);
    if (TL.fam) vs = vs.filter((v) => v.fam === TL.fam);
    fams.replaceChildren(...[{ id: '', name: 'Tout' }, ...FAMILLES].map((f) => h('button', { type: 'button', class: 'tab', 'aria-pressed': String(f.id === TL.fam), onclick: () => { TL.fam = f.id; draw(); } }, f.name)));
    const withRef = vs.filter((v) => v.ref).length;
    count.textContent = `${vs.length} article${vs.length > 1 ? 's' : ''}${withRef ? `, dont ${withRef} avec une référence fabricant` : ''}.`;
    list.replaceChildren(...vs.map((v) => h('div', { class: 'art-li', 'data-art': v.id },
      h('div', { style: 'min-width:0' }, h('b', null, v.n), refLine(v)),
      badge(v.fiab),
      btn(v.ref || v.fab ? 'Modifier' : 'Référence', () => editRef(v.id, openTechLib), 'sm'))));
  };
  const search = h('input', { class: 'txt', type: 'search', value: TL.q, placeholder: 'Rechercher (dj 20 courbe c, id 40 A type A, R2V 3G2,5…)', 'aria-label': 'Rechercher un article', autocomplete: 'off', enterkeyhint: 'search' });
  search.addEventListener('input', () => { TL.q = search.value; draw(); });
  openModal('Bibliothèque technique',
    h('p', { class: 'note' }, `${ARTICLES.length} articles génériques, désignés comme sur le chantier. Calque ne contient aucune référence fabricant : vous pouvez saisir la vôtre sur chaque article (facultatif).`),
    legend(), search, fams, count, list);
  $modal().classList.add('wide');
  draw();
}
function legend() {
  return h('div', { class: 'fiab-legend' }, FIAB.map((f) => h('span', null, badge(f.id), ' ', f.desc)));
}
const $modal = () => document.getElementById('modal');

/* ---- saisie de la référence fabricant d'un article ---- */
function editRef(id, back) {
  const v = articleView(id, UL.refs); if (!v) return;
  let fiab = UL.refs[id] ? v.fiab : 'saisie';
  const inp = (lab, val, ph, fid) => { const i = h('input', { class: 'txt', id: fid, type: 'text', value: val || '', placeholder: ph || '', 'aria-label': lab, autocomplete: 'off' }); return [h('label', { class: 'fld' }, h('span', null, lab), i), i]; };
  const [lRef, iRef] = inp('Référence fabricant (facultatif)', v.ref, 'telle qu’indiquée sur le catalogue', 'f-aref');
  const [lFab, iFab] = inp('Fabricant (facultatif)', v.fab, '', 'f-afab');
  const [lSrc, iSrc] = inp('Source', v.userSource, 'catalogue, fiche technique, page…', 'f-asrc');
  const [lNote, iNote] = inp('Remarque (facultatif)', v.note, '', 'f-anote');
  const warn = h('p', { class: 'note', style: 'color:var(--bad)' });
  const seg = h('div');
  const drawSeg = () => { seg.replaceChildren(segCtl(FIAB.map((f) => ({ v: f.id, n: f.name })), fiab, (x) => { fiab = x; drawSeg(); })); warn.textContent = ''; };
  drawSeg();
  const done = () => { if (back) back(); else { closeModal(); renderInspector(); } };
  const save = async () => {
    if (fiab === 'verifiee' && !iSrc.value.trim()) { warn.textContent = 'Indiquez la source (document du fabricant) pour marquer l’article « Vérifiée ».'; iSrc.focus(); return; }
    const ok = await setRef(id, { ref: iRef.value, fab: iFab.value, fiab, source: iSrc.value, note: iNote.value });
    toast(ok ? 'Référence enregistrée sur cet appareil.' : 'Non enregistré : stockage indisponible.');
    if (ok) done();
  };
  openModal(v.n,
    h('p', { class: 'note' }, FAM_BY.get(v.fam).name + ' · article générique. Caractéristiques nominales : ' + caracText(v.carac) + '.'),
    lRef, lFab,
    h('div', { class: 'fld' }, h('span', null, 'Fiabilité'), seg),
    lSrc, lNote, warn,
    btns(btn('Enregistrer', save, 'pri'),
      UL.refs[id] ? btn('Effacer la référence', async () => { const ok = await setRef(id, null); toast(ok ? 'Référence effacée.' : 'Non enregistré.'); if (ok) done(); }, 'danger') : null,
      btn('Annuler', done)));
}
const CARAC = { poles: 'pôles', cal: 'calibre', courbe: 'courbe', sens: 'sensibilité', type: 'type', section: 'section', conducteurs: 'conducteurs', dia: 'diamètre', prof: 'profondeur', rangees: 'rangées', modules: 'modules par rangée', ip: 'indice', cat: 'catégorie', larg: 'largeur', ame: 'âme', sys: 'système' };
const UNIT = { cal: ' A', sens: ' mA', section: ' mm²', dia: ' mm', prof: ' mm', larg: ' mm' };
function caracText(c) {
  return Object.entries(c).filter(([k]) => k !== 'appareil' && k !== 'selectif' && CARAC[k]).map(([k, x]) => `${CARAC[k]} ${String(x).replace('.', ',')}${UNIT[k] || ''}`).join(', ') || c.appareil;
}

/* ---- inspecteur d'un symbole électrique : « Matériel » ---- */
function materielSection(e) {
  const arts = articlesFor(e.type);
  if (!arts.length && !e.art) return sec('Matériel', h('p', { class: 'note' }, 'Pas d’article générique pour ce symbole.'), btns(btn('Bibliothèque technique', openTechLib, 'sm', 'book')));
  const sel = h('select', { class: 'txt', id: 'f-eart', 'aria-label': 'Article' },
    h('option', { value: '' }, 'Non précisé'),
    arts.map((a) => h('option', { value: a.id, selected: a.id === e.art }, a.n)),
    e.art && !arts.some((a) => a.id === e.art) ? h('option', { value: e.art, selected: true }, (articleView(e.art, UL.refs) || { n: 'Article inconnu' }).n) : null);
  sel.addEventListener('change', () => { if (sel.value) e.art = sel.value; else delete e.art; commit(); });
  const v = e.art ? articleView(e.art, UL.refs) : null;
  return sec('Matériel', sel,
    v ? h('div', { class: 'art-mini' }, h('div', { class: 'art-mini-l' }, badge(v.fiab), refLine(v)), btn(v.ref || v.fab ? 'Modifier la référence' : 'Saisir la référence fabricant', () => editRef(v.id), 'sm')) : null,
    e.art && !v ? h('p', { class: 'note' }, 'Cet article n’existe pas dans cette version de Calque : il est conservé tel quel.') : null);
}

/* ============================================================
   COMPOSANTS PERSONNALISÉS
   ============================================================ */
const compBase = (c) => (c.kind === 'elec' ? ELEC_BY.get(c.base) : FURN_BY.get(c.base));
function compThumb(c) {
  const d = compBase(c); if (!d) return h('span');
  return c.kind === 'elec' ? elecThumb(d, 64) : furnThumb(Object.assign({}, d, { w: c.w, d: c.d }));
}
function compInfo(c) {
  if (c.kind === 'furn') return `${c.w} × ${c.d} cm`;
  return [c.mark, c.tech && c.tech.ref ? 'réf. ' + c.tech.ref : null].filter(Boolean).join(' · ') || (compBase(c) || {}).n;
}
function compEntry(c) {
  return { src: c.kind, key: c.id, def: compBase(c), name: c.n, info: compInfo(c), title: c.desc || c.n, thumb: () => compThumb(c),
    place: { comp: c }, path: 'Mes composants › ' + (COMP_RANGEMENTS.find((r) => r.id === c.rang) || {}).name, sub: 'p_' + c.rang };
}
const validComps = () => UL.comps.filter((c) => compBase(c));
/* « Mes composants » : un domaine de la bibliothèque, ajouté par ce module */
LIB_EXTRA.push({
  dom: { id: 'perso', name: 'Mes composants', get subs() { return [{ id: 'p_tous', name: 'Tous' }, ...COMP_RANGEMENTS.filter((r) => UL.comps.some((c) => c.rang === r.id)).map((r) => ({ id: 'p_' + r.id, name: r.name }))]; } },
  entries: (subId) => validComps().filter((c) => subId === 'p_tous' || 'p_' + c.rang === subId).map(compEntry),
  all: () => validComps().map(compEntry),
  after: (subId) => h('button', { type: 'button', class: 'card card-add', onclick: () => {
    const kind = ui.libKind || 'furn';
    openCompEditor(null, { rang: subId !== 'p_tous' ? subId.slice(2) : null, back: () => { closeModal(); openCatalog(kind); } });
  } }, h('span', { class: 'plus', 'aria-hidden': 'true' }, '+'), h('span', null, 'Nouveau composant')),
  note: () => UL.comps.length ? 'Vos composants sont enregistrés sur cet appareil et inclus dans « Sauvegarder tous mes plans ». Chaque plan garde une copie de ceux qu’il utilise.'
    : 'Créez vos propres éléments : un modèle existant, vos dimensions ou votre marquage, et si vous le souhaitez votre référence fabricant. Ils restent disponibles hors ligne.',
});

/* fenêtre de création / modification d'un composant.
   o.from : objet du plan servant de point de départ (« Enregistrer comme composant ») ; o.back : retour */
function openCompEditor(comp, o = {}) {
  const src = o.from || null;
  const st = comp ? JSON.parse(JSON.stringify(comp)) : {
    id: uid('cp'), kind: src ? (o.fromKind === 'elec' ? 'elec' : 'furn') : 'furn',
    n: src ? (src.name || (ELEC_BY.get(src.type) || {}).n || '') : '', rang: o.rang || null, desc: '', tech: {},
  };
  if (!comp && src) {
    if (st.kind === 'elec') { st.base = src.type; st.h = src.h; st.mark = src.mark || ''; }
    else { st.base = src.k; st.w = src.w; st.d = src.d; }
  }
  if (!st.tech) st.tech = {};
  const warn = h('p', { class: 'note', style: 'color:var(--bad)' });
  const form = h('div', { class: 'cform' });
  const inp = (lab, val, fid, attrs) => { const i = h('input', Object.assign({ class: 'txt', id: fid, type: 'text', value: val == null ? '' : String(val), 'aria-label': lab, autocomplete: 'off' }, attrs || {})); return [h('label', { class: 'fld' }, h('span', null, lab), i), i]; };
  const numIn = (lab, val, fid) => inp(lab, val == null ? '' : String(val).replace('.', ','), fid, { inputmode: 'decimal' });
  const parse = (i) => { const v = parseFloat(String(i.value).replace(',', '.').replace(/\s/g, '')); return Number.isFinite(v) ? v : null; };
  let F = {};
  const draw = () => {
    const kindSeg = segCtl([{ v: 'furn', n: 'Meuble ou équipement' }, { v: 'elec', n: 'Symbole électrique' }], st.kind, (v) => {
      if (v === st.kind) return; read(); st.kind = v; st.base = null; st.rang = null; draw();
    });
    if (!st.rang) st.rang = st.kind === 'elec' ? 'electricite' : 'mobilier';
    const groups = st.kind === 'elec'
      ? ELEC_CATS.map((c) => ({ name: c.name, list: ELEC.filter((e) => e.cat === c.id).map((e) => [e.t, e.n]) }))
      : DOMAINES.filter((d) => d.id === 'mobilier' || d.id === 'batiment').flatMap((d) => d.subs).map((sb) => ({ name: sb.name, list: (sb.furn || []).map((k) => FURN_BY.get(k)).filter((f) => f && !isStair(f.t)).map((f) => [f.k, f.n]) })).filter((g) => g.list.length);
    if (!st.base) st.base = groups[0].list[0][0];
    const baseSel = h('select', { class: 'txt', id: 'f-cbase', 'aria-label': 'Apparence' }, groups.map((g) => h('optgroup', { label: g.name }, g.list.map(([k, n]) => h('option', { value: k, selected: k === st.base }, n)))));
    baseSel.addEventListener('change', () => {
      read(); st.base = baseSel.value; const d = compBase(st);
      if (st.kind === 'furn') { st.w = d.w; st.d = d.d; } else st.h = d.h ?? null;
      draw();
    });
    const rangSel = h('select', { class: 'txt', id: 'f-crang', 'aria-label': 'Rangement' }, COMP_RANGEMENTS.map((r) => h('option', { value: r.id, selected: r.id === st.rang }, r.name)));
    const bdef = compBase(st);
    const [lN, iN] = inp('Nom', st.n, 'f-cname', { placeholder: 'ex. Prise de sol tertiaire, Meuble vasque 80' });
    const parts = [lN,
      h('div', { class: 'fld' }, h('span', null, 'Type'), kindSeg),
      h('div', { class: 'row' }, h('label', { class: 'fld' }, h('span', null, 'Apparence (modèle existant)'), baseSel), h('div', { class: 'cthumb' }, compThumb(Object.assign({}, st, { w: st.w || bdef.w, d: st.d || bdef.d })))),
      h('label', { class: 'fld' }, h('span', null, 'Rangé dans'), rangSel)];
    F = { iN, baseSel, rangSel };
    if (st.kind === 'furn') {
      const [lW, iW] = numIn('Largeur (cm)', st.w ?? bdef.w, 'f-cw'); const [lD, iD] = numIn('Profondeur (cm)', st.d ?? bdef.d, 'f-cd');
      parts.push(h('div', { class: 'row' }, lW, lD)); Object.assign(F, { iW, iD });
    } else {
      const [lM, iM] = inp(`Marquage affiché sur le plan (${MARK_MAX} caractères au plus)`, st.mark || '', 'f-cmark', { maxlength: String(MARK_MAX), placeholder: 'ex. IP55, 20A, PC' });
      parts.push(lM); F.iM = iM;
      if (bdef.wall) { const [lH, iH] = numIn('Hauteur de pose (cm)', st.h ?? bdef.h, 'f-ch'); parts.push(lH); F.iH = iH; }
    }
    const t = st.tech;
    const [lDs, iDs] = inp('Désignation technique (facultatif)', t.desig, 'f-cdesig', { placeholder: 'ex. Prise 2P+T 16 A IP55 saillie' });
    const [lR, iR] = inp('Référence fabricant (facultatif)', t.ref, 'f-cref');
    const [lF, iF] = inp('Fabricant (facultatif)', t.fab, 'f-cfab');
    const [lS, iS] = inp('Source', t.source, 'f-csrc', { placeholder: 'catalogue, fiche technique, page…' });
    const [lX, iX] = inp('Description (facultatif)', st.desc, 'f-cdesc');
    const fseg = h('div');
    const drawF = () => fseg.replaceChildren(segCtl(FIAB.map((f) => ({ v: f.id, n: f.name })), t.fiab || 'saisie', (v) => { t.fiab = v; drawF(); }));
    drawF();
    parts.push(h('h3', { class: 'csub' }, 'Informations techniques'), lDs, h('div', { class: 'row' }, lR, lF), h('div', { class: 'fld' }, h('span', null, 'Fiabilité'), fseg), lS, lX);
    Object.assign(F, { iDs, iR, iF, iS, iX });
    form.replaceChildren(...parts);
  };
  const read = () => {
    if (!F.iN) return;
    st.n = F.iN.value; st.base = F.baseSel.value; st.rang = F.rangSel.value;
    if (st.kind === 'furn') { st.w = parse(F.iW); st.d = parse(F.iD); delete st.h; delete st.mark; }
    else { st.mark = F.iM.value; st.h = F.iH ? parse(F.iH) : (compBase(st).h ?? null); delete st.w; delete st.d; }
    Object.assign(st.tech, { desig: F.iDs.value, ref: F.iR.value, fab: F.iF.value, source: F.iS.value }); st.desc = F.iX.value;
  };
  const done = () => { if (o.back) o.back(); else { closeModal(); renderInspector(); } };
  const save = async () => {
    read();
    if (!st.n.trim()) { warn.textContent = 'Donnez un nom au composant.'; F.iN.focus(); return; }
    if (st.kind === 'furn' && (!(st.w >= 1) || !(st.d >= 1) || st.w > 5000 || st.d > 5000)) { warn.textContent = 'Largeur et profondeur : entre 1 et 5000 cm.'; return; }
    if (st.kind === 'elec' && F.iH && st.h != null && (st.h < 0 || st.h > 600)) { warn.textContent = 'Hauteur de pose : entre 0 et 600 cm.'; return; }
    if (st.tech.fiab === 'verifiee' && !st.tech.source.trim()) { warn.textContent = 'Indiquez la source pour marquer les informations « Vérifiée ».'; F.iS.focus(); return; }
    const r = await saveComp(st);
    if (!r.ok) { toast('Non enregistré : stockage indisponible.'); return; }
    if (src) { applyComp(src, r.comp); upsertPlanComp(P, r.comp); commit(); }
    else if (P.comps && P.comps.some((c) => c.id === r.comp.id)) { /* le plan ouvert utilise ce composant : sa copie suit la modification */ syncPlanComp(r.comp); commit(); }
    toast(comp ? 'Composant modifié.' : 'Composant enregistré dans « Mes composants ».');
    done();
  };
  draw();
  openModal(comp ? 'Modifier le composant' : 'Nouveau composant',
    h('p', { class: 'note' }, 'Le composant reprend le dessin d’un modèle existant : sur le plan, il se comporte comme lui (circuits, tableau, 3D).'),
    form, warn,
    btns(btn('Enregistrer', save, 'pri'),
      comp ? confirmBtn('Supprimer', 'Confirmer ?', async () => { const ok = await deleteComp(comp.id); toast(ok ? 'Composant retiré de la bibliothèque. Les plans qui l’utilisent gardent leur copie.' : 'Non enregistré.'); if (ok) done(); }) : null,
      btn('Annuler', done)));
  document.getElementById('modal').classList.add('wide');
}
/* met à jour la copie du plan et tous les objets qui utilisent ce composant */
function syncPlanComp(c) {
  upsertPlanComp(P, c);
  for (const x of c.kind === 'elec' ? P.elec : P.items) if (x.comp === c.id) {
    const keepPos = c.kind === 'furn' ? null : x.h;
    applyComp(x, c);
    if (c.kind === 'elec' && keepPos != null && c.h == null) x.h = keepPos;
  }
  for (const u of unusedPlanComps(P)) P.comps.splice(P.comps.indexOf(u), 1);
}
/* inspecteur : objet issu d'un composant, ou proposition d'en créer un */
function compSection(o, kind) {
  if (!o.comp) {
    if (kind === 'item' && isStair(o.type)) return null;
    return sec('Composant', btns(btn('Enregistrer comme composant', () => openCompEditor(null, { from: o, fromKind: kind }), 'sm', 'plus')),
      h('p', { class: 'note' }, 'Pour le réutiliser dans vos plans (onglet « Mes composants » de la bibliothèque).'));
  }
  const mine = compById(o.comp), copy = (P.comps || []).find((c) => c.id === o.comp);
  const c = copy || mine;
  const t = c && c.tech;
  return sec('Composant personnalisé',
    c ? h('div', { class: 'art-mini' },
      h('b', null, c.n),
      t && (t.desig || t.ref || t.fab) ? h('div', { class: 'art-mini-l' }, badge(t.fiab), h('small', null, [t.desig, t.fab, t.ref ? 'réf. ' + t.ref : null].filter(Boolean).join(' · '))) : null) : h('p', { class: 'note' }, 'Composant introuvable : l’objet garde son apparence.'),
    btns(
      mine ? btn('Modifier le composant', () => openCompEditor(mine), 'sm', 'pen') : null,
      !mine && copy ? btn('Ajouter à ma bibliothèque', async () => { const r = await saveComp(copy); toast(r.ok ? 'Ajouté à « Mes composants ».' : 'Non enregistré.'); renderInspector(); }, 'sm', 'plus') : null,
      mine && copy && !sameComp(mine, copy) ? btn('Mettre à jour depuis ma bibliothèque', () => { syncPlanComp(mine); commit(); toast('Composant mis à jour dans ce plan.'); }, 'sm') : null));
}

export { badge, compSection, editRef, materielSection, openCompEditor, openTechLib, syncPlanComp };

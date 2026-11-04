/* Calque — module « interface des bibliothèques » : bibliothèque technique (consultation, références fabricant),
   section « Matériel » de l'inspecteur des symboles électriques.
   Module JavaScript natif (aucune compilation). */
import { ARTICLES, FAMILLES, FAM_BY, FIAB, FIAB_BY, articleView, articlesFor, searchArticles } from './technique.js';
import { UL, setRef } from './mabiblio.js';
import { btn, btns, closeModal, h, openModal, renderInspector, sec, segCtl, toast } from './interface.js';
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

export { badge, editRef, materielSection, openTechLib };

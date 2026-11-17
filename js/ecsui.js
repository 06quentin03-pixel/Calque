/* Calque — module « ecsui » : section « Chauffe-eau » du panneau d'un chauffe-eau (type, nombre de personnes, volume
   conseillé, puissance, circuit à prévoir). Les calculs sont dans ecs.js (sans écran). Module JavaScript natif. */
import { P, isNum } from './noyau.js';
import { ELEC_BY } from './symboles.js';
import { commit } from './interaction.js';
import { btn, btns, chipRow, h, kv, numField, sec, segCtl, toast } from './interface.js';
import { TYPES_CE, USAGES, VOL_STD, estCE, puissanceInstantane, resumeCE } from './ecs.js';

const N = (v, d = 1) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d }).format(v);
const ST = { verifiee: 'vérifiée', saisie: 'saisie', estimee: 'estimée' };
const CE = (e) => { if (!e.ce || typeof e.ce !== 'object') e.ce = {}; return e.ce; };

/* changer de type de chauffe-eau : même emplacement ; la pose (au sol / au mur) suit le symbole */
function changerType(e, t) {
  if (t === e.type) return;
  const avant = ELEC_BY.get(e.type), nd = ELEC_BY.get(t); if (!nd) return;
  if (e.h === (avant && avant.h)) e.h = nd.h;
  e.type = t; delete e.comp;
  const c = e.ce; if (c) { delete c.p; if (!TYPES_CE[t].vol) delete c.vol; }
  if (!TYPES_CE[t].elec && e.cid) toast('Ce chauffe-eau n’a pas de circuit électrique dédié : vous pouvez le retirer de son circuit dans la section Circuit.');
  commit();
}
function chauffeEauSection(e) {
  if (!estCE(e.type)) return null;
  const r = resumeCE(e), T = r.T, c = e.ce || {};
  const parts = [
    h('div', { class: 'fld' }, h('span', null, 'Type de chauffe-eau'),
      segCtl(Object.entries(TYPES_CE).map(([v, x]) => ({ v, n: x.court })), e.type, (v) => changerType(e, v))),
    h('p', { class: 'note' }, T.n + ' : ' + T.note),
  ];
  if (T.vol || T.capteurs) {
    parts.push(numField('Personnes dans le logement', r.pers, '', (v) => { CE(e).pers = Math.round(v); commit(); }, { id: 'f-cepers', min: 1, max: 50 }),
      chipRow([1, 2, 3, 4, 5, 6], r.pers, (v) => { CE(e).pers = v; commit(); }, (v) => v + ' pers.'),
      h('div', { class: 'fld' }, h('span', null, 'Habitudes'), segCtl(Object.entries(USAGES).map(([v, u]) => ({ v, n: u.n })), r.usage, (v) => { CE(e).usage = v; commit(); })));
  }
  if (T.vol) {
    const co = r.conseil;
    parts.push(kv([['Volume conseillé', `${N(co.v, 0)} L (estimé : ${N(co.base, 0)} L pour ${r.pers} personne${r.pers > 1 ? 's' : ''}${r.usage !== 'normal' ? ' × ' + N(USAGES[r.usage].k, 1) : ''}, arrondi au volume courant)`],
      ['Volume choisi', r.vol ? `${N(r.vol.v, 0)} L (${ST[r.vol.st] || r.vol.st})` : 'non choisi']]),
      chipRow(VOL_STD.filter((v) => v >= 50), r.vol ? r.vol.v : -1, (v) => { CE(e).vol = { v, st: 'saisie' }; commit(); }, (v) => v + ' L'),
      btns(btn(`Prendre le volume conseillé (${N(co.v, 0)} L)`, () => { CE(e).vol = { v: co.v, st: 'estimee', src: co.src }; commit(); }, 'sm')),
      h('p', { class: 'note' }, 'Repères usuels : 1 personne 50 à 75 L, 2 personnes 100 L, 3 personnes 150 L, 4 personnes 200 L, 5 personnes 250 L. Un ballon thermodynamique chauffe plus lentement (prévoir plus grand) ; un ballon solaire stocke l’énergie du soleil (50 à 70 L par personne). Ordres de grandeur estimés : la fiche du fabricant fait foi.'));
  }
  if (r.capteurs) parts.push(kv([['Capteurs solaires (ordre de grandeur)', `environ ${N(r.capteurs.v, 0)} m² (≈ 1 m² par personne, estimé ; plus au nord, moins au sud)`]]),
    h('p', { class: 'note' }, 'Posez les capteurs sur le toit avec l’outil Électricité (Chauffage › Capteurs solaires thermiques) : sur un toit dessiné, ils s’affichent sur le pan en 3D.'));
  if (T.instant) {
    const pn = r.pNecessaire;
    parts.push(row2(numField('Débit au puisage', r.q, 'L/min', (v) => { CE(e).q = v; commit(); }, { id: 'f-ceq', min: 1, max: 100 }),
      numField('Élévation de température', r.dt, '°C', (v) => { CE(e).dt = v; commit(); }, { id: 'f-cedt', min: 1, max: 80 })),
      chipRow([3, 5, 8, 10, 12], r.q, (v) => { CE(e).q = v; commit(); }, (v) => v + ' L/min'),
      kv([['Puissance nécessaire', `${N(pn / 1000, 1)} kW (${N(r.q, 1)} L/min × 4,185 × ${N(r.dt, 0)} °C / 60)`]]),
      h('p', { class: 'note' }, 'Repères : lavabo ou évier 3 à 5 L/min, douche 8 à 10 L/min ; l’eau froide arrive vers 10 °C, la douche se prend vers 40 °C (élévation 30 °C).'),
      btns(btn(`Prendre ${N(pn / 1000, 1)} kW`, () => { CE(e).p = { v: Math.round(pn / 100) * 100, st: 'estimee', src: 'Calculé par Calque d’après le débit et l’élévation de température saisis' }; commit(); }, 'sm')));
  }
  if (T.elec) {
    const p = r.p;
    parts.push(numField('Puissance électrique de l’appareil', p ? p.v : 0, 'W', (v) => { if (v > 0) CE(e).p = { v, st: 'saisie' }; else delete CE(e).p; commit(); }, { id: 'f-cep', min: 0, max: 60000 }),
      T.pChoix.length ? chipRow(T.pChoix, p ? p.v : -1, (v) => { CE(e).p = { v, st: 'saisie' }; commit(); }, (v) => (v >= 1000 ? N(v / 1000, 1) + ' kW' : v + ' W')) : null,
      p ? h('p', { class: 'note' }, `Puissance ${ST[p.st] || p.st}${p.src ? ' : ' + p.src : ''}.`) : null);
    if (isNum(r.tChauffe)) parts.push(kv([['Temps de chauffe (10 → 55 °C)', `${N(r.tChauffe, 1)} h${T.hc ? (r.tChauffe <= 8 ? ' : tient dans 8 h d’heures creuses' : ' : dépasse 8 h d’heures creuses, augmentez la puissance') : ''}`]]));
    const ci = r.circuit;
    if (ci) parts.push(h('div', { class: 'fld' }, h('span', null, 'Réseau'), segCtl([{ v: 'mono', n: 'Monophasé 230 V' }, { v: 'tri', n: 'Triphasé 400 V' }], c.reseau === 'tri' ? 'tri' : 'mono', (v) => { if (v === 'tri') CE(e).reseau = 'tri'; else delete CE(e).reseau; commit(); })),
      kv([['Intensité', `${N(ci.I, 1)} A${ci.tri ? ' par phase' : ''}`], ['Circuit à prévoir (estimé)', ci.cal ? `disjoncteur ${ci.cal} A, ${N(ci.sec, 1)} mm²${T.hc ? ', contacteur heures creuses' : ''}` : 'au-delà de 63 A : à étudier']]),
      h('p', { class: 'note' }, ci.src + '.'));
  } else parts.push(h('p', { class: 'note' }, 'Pas de circuit électrique dédié : le ballon est chauffé par la chaudière (son circuit est celui de la chaudière).'));
  return sec('Chauffe-eau', ...parts);
}
const row2 = (a, b) => h('div', { class: 'row' }, a, b);
/* puissance d'un instantané pour la fiche Calculs : export pour les tests */
const exemplePuissance = () => puissanceInstantane(8, 30);

export { changerType, chauffeEauSection, exemplePuissance };

/* Calque — module « thermiqueui » : écran des déperditions thermiques (panneaux d'un mur, d'une pièce, d'un niveau et
   d'une ouverture). Calculs dans thermique.js (sans écran). Méthode simplifiée, présentée comme telle : aide au
   dimensionnement du chauffage, pas une étude thermique réglementaire. */
import { P } from './noyau.js';
import { geo } from './geometrie.js';
import { commit } from './interaction.js';
import { chipRow, h, kv, numField, sec, segCtl } from './interface.js';
import { COTES, DEF, bilanThermique, chauffagePose, coteNiveau, deperditionsPiece, ficheMur, tExt, tInt, uOuverture } from './thermique.js';
import { nomCouche } from './compositions.js';

const f1 = (v) => (v == null ? '—' : String(Math.round(v * 10) / 10).replace('.', ','));
const f2 = (v) => (v == null ? '—' : String(Math.round(v * 100) / 100).replace('.', ','));
const f3 = (v) => (v == null ? '—' : String(Math.round(v * 1000) / 1000).replace('.', ','));
const W_ = (v) => (v == null ? '—' : Math.round(v).toLocaleString('fr-FR') + ' W');
const ST = { saisie: ['ok', 'Saisie'], estimee: ['warn', 'Estimée'], partiel: ['bad', 'Partiel'] };
const pill = (st) => h('span', { class: 'pill ' + ST[st][0] }, ST[st][1]);
const NOTE = 'Méthode simplifiée de Calque (inspirée de la NF EN 12831) : aide au dimensionnement du chauffage, pas une étude thermique réglementaire. Les valeurs « estimées » sont des ordres de grandeur à remplacer par celles de vos matériaux.';

function contexte() {
  const toutes = new Map(P.levels.map((l) => [l.id, geo(l.id).rooms]));
  return { toutes, te: tExt(P) };
}
/* température extérieure de base (projet) */
function teField() {
  const t = tExt(P);
  return h('div', null,
    numField('Température extérieure de base', t ? t.v : null, '°C', (v) => { P.install.text = { v, st: 'saisie', src: 'Saisie pour le projet' }; commit(); }, { id: 'f-text', min: -60, max: 40 }),
    chipRow([-15, -12, -10, -9, -8, -7, -6, -5, -4, -2], t ? t.v : NaN, (v) => { P.install.text = { v, st: 'saisie', src: 'Saisie pour le projet' }; commit(); }, (v) => v + ' °C'),
    h('p', { class: 'note' }, t ? `Valeur ${t.st === 'saisie' ? 'saisie' : 'estimée'}${t.src ? ' : ' + t.src : ''}. Elle dépend de la commune (zone climatique et altitude) : vérifiez-la.` : 'Non renseignée : choisissez la valeur de votre commune (zone climatique et altitude). Sans elle, seules les déperditions par degré (W/K) sont calculées.'));
}
function tableau(lignes) {
  return h('div', { class: 'list' }, lignes.map((l) => h('div', { class: 'li' },
    h('span', null, `${l.quoi} → ${l.vers}`, h('small', { style: 'display:block;opacity:.75' },
      `${f2(l.A)} m² · U ${l.u == null ? 'manquant' : f3(l.u)}${l.b != null && l.b !== 1 ? ' · b ' + f2(l.b) : ''}${l.dT != null ? ' · ΔT ' + f1(l.dT) + ' K' : ''}`)),
    h('span', { class: 'v' }, l.phi != null ? W_(l.phi) : l.H != null ? f1(l.H) + ' W/K' : '—'))));
}

/* ---------------- mur ---------------- */
function thermiqueMurSection(w) {
  const ctx = contexte(), F = ficheMur(P, w, Object.assign({}, ctx, { pieces: ctx.toutes.get(w.lv) }));
  if (!F) return null;
  const U = F.U;
  const parts = [
    kv([['Coefficient U', U.u != null ? f3(U.u) + ' W/m²·K' : 'manquant'], ['Résistance R', U.R != null ? f2(U.R) + ' m²·K/W' : '—']]),
    U.u != null ? pill(U.st) : h('p', { class: 'note', style: 'color:var(--bad)' }, 'Manque : ' + U.manque.join(', ') + '. Renseignez la composition du mur ci-dessus.'),
  ];
  if (U.couches.length) parts.push(h('div', { class: 'list' },
    h('div', { class: 'li' }, h('span', null, 'Rsi (surface intérieure)'), h('span', { class: 'v' }, f2(U.rsi))),
    U.couches.map((x) => h('div', { class: 'li' }, h('span', null, `${nomCouche(x.c)} ${f2(x.c.e)} cm`, h('small', { style: 'display:block;opacity:.75' },
      x.r == null ? 'λ manquant' : `${x.l != null && x.c.r == null ? 'λ ' + f3(x.l) + ' · ' : ''}${x.st === 'saisie' ? 'saisi' : 'estimé'}`)), h('span', { class: 'v' }, x.r == null ? '—' : f2(x.r)))),
    h('div', { class: 'li' }, h('span', null, F.ext ? 'Rse (surface extérieure)' : 'Rsi (autre côté)'), h('span', { class: 'v' }, f2(U.rse)))));
  for (const v of F.vues) {
    if (v.nul) { parts.push(h('p', { class: 'note' }, `${v.depuis} → ${v.vers} : même température, pas de déperdition.`)); continue; }
    parts.push(h('h4', null, `Depuis ${v.depuis} (${f1(v.ti.v)} °C) → ${v.vers}`),
      h('div', { class: 'list' }, v.items.map((it) => h('div', { class: 'li' },
        h('span', null, it.quoi, h('small', { style: 'display:block;opacity:.75' }, `${f2(it.A)} m² · U ${it.U.u == null ? 'manquant' : f3(it.U.u)}${it.U.st === 'estimee' ? ' (estimé)' : ''}`)),
        h('span', { class: 'v' }, it.phi != null ? W_(it.phi) : it.H != null ? f1(it.H) + ' W/K' : '—')))),
      kv([['Par degré', f1(v.H) + ' W/K'], ['ΔT', v.dT != null ? f1(v.dT) + ' K' + (v.b.v !== 1 ? ` × b ${f2(v.b.v)}` : '') : 'température extérieure manquante'], ['Déperdition', W_(v.phi)]]),
      v.manque.length ? h('p', { class: 'note', style: 'color:var(--bad)' }, 'Manque : ' + v.manque.join(' ; ')) : null);
  }
  if (!F.vues.length) parts.push(h('p', { class: 'note' }, 'Aucune pièce chauffée de part et d’autre : pas de déperdition calculée.'));
  if (!ctx.te) parts.push(teField());
  parts.push(h('p', { class: 'note' }, NOTE));
  return sec('Thermique (déperditions)', ...parts);
}

/* ---------------- pièce ---------------- */
function thermiquePieceSection(lbl, r) {
  if (lbl.ext || lbl.sol === 'vide') return null;
  const ctx = contexte();
  const ti = tInt(lbl);
  const reglages = h('div', null,
    h('div', { class: 'fld' }, h('span', null, 'Pièce'), segCtl([{ v: false, n: 'Chauffée' }, { v: true, n: 'Non chauffée' }], !!lbl.nc, (v) => { if (v) lbl.nc = true; else delete lbl.nc; commit(); })),
    lbl.nc ? null : h('div', null,
      numField('Température intérieure', ti.v, '°C', (v) => { lbl.ti = v; commit(); }, { id: 'f-ti', min: 0, max: 40 }),
      chipRow([16, 18, 19, 20, 21, 22, 24], ti.v, (v) => { lbl.ti = v; commit(); }, (v) => v + ' °C'),
      ti.st === 'estimee' ? h('p', { class: 'note' }, 'Estimée : ' + ti.src + '.') : null));
  if (lbl.nc) return sec('Thermique (déperditions)', reglages, h('p', { class: 'note' }, 'Pièce non chauffée : les pièces chauffées voisines comptent leurs pertes vers elle (coefficient b estimé).'));
  const D = deperditionsPiece(P, r, Object.assign({}, ctx, { pieces: ctx.toutes.get(lbl.lv) }));
  const pose = chauffagePose(P, r);
  const ach = D.ach;
  const parts = [reglages,
    numField('Renouvellement d’air', ach.v, 'vol/h', (v) => { lbl.ach = v; commit(); }, { id: 'f-ach', min: 0, max: 50 }),
    ach.st === 'estimee' ? h('p', { class: 'note' }, 'Estimé : ' + ach.src + '.') : null,
    h('div', { class: 'ro', style: 'font-size:26px;font-weight:700;margin-top:6px' }, D.total != null ? W_(D.total) : f1(D.H) + ' W/K'),
    h('div', null, pill(D.statut), ' ', h('span', { class: 'note' }, D.total != null ? `soit ${f1(D.parM2)} W/m² · ${f1(D.total / Math.max(D.V, 0.01))} W/m³ pour ΔT = ${f1(D.dT)} K` : 'Déperdition par degré d’écart (température extérieure manquante)')),
    kv([['Parois', D.phiT != null ? W_(D.phiT) : f1(D.Ht) + ' W/K'], ['Ponts thermiques', D.phiPt != null ? W_(D.phiPt) : f1(D.Hpt) + ' W/K'],
      ['Renouvellement d’air', D.phiV != null ? W_(D.phiV) : f1(D.Hv) + ' W/K'], ['Surface · volume', `${f1(D.S)} m² · ${f1(D.V)} m³`]]),
    tableau(D.lignes)];
  if (D.manque.length) parts.push(h('p', { class: 'note', style: 'color:var(--bad)' }, 'Manque : ' + D.manque.join(' ; ') + '.'));
  if (D.estimees.length) parts.push(h('details', null, h('summary', { class: 'note' }, `${D.estimees.length} valeur${D.estimees.length > 1 ? 's' : ''} estimée${D.estimees.length > 1 ? 's' : ''}`),
    h('ul', { class: 'note' }, D.estimees.map((x) => h('li', null, x)))));
  /* chauffage */
  if (D.total != null) {
    const ok = pose.p >= D.total;
    parts.push(h('h4', null, 'Chauffage'),
      kv([['Puissance à couvrir', W_(D.total)], ['Chauffage posé dans la pièce', pose.n ? `${W_(pose.p)} (${pose.n} appareil${pose.n > 1 ? 's' : ''}${pose.saisi ? '' : ', puissance par défaut'})` : 'aucun']]),
      pose.n ? h('span', { class: 'pill ' + (ok ? 'ok' : 'warn') }, ok ? 'Puissance posée suffisante' : `Il manque ${W_(D.total - pose.p)}`) : null,
      h('p', { class: 'note' }, 'Choisissez un appareil de puissance égale ou supérieure (modèle du commerce au-dessus), en ajoutant si besoin une marge de relance.'));
  }
  if (!ctx.te) parts.push(teField());
  parts.push(h('p', { class: 'note' }, NOTE));
  return sec('Thermique (déperditions)', ...parts);
}

/* ---------------- niveau ---------------- */
function thermiqueNiveauSection(lvl) {
  const ctx = contexte(), B = bilanThermique(P, lvl.id, ctx);
  const cote = (k) => {
    const c = coteNiveau(P, lvl, k), champ = k === 'sol' ? 'dessous' : 'dessus', bch = k === 'sol' ? 'bsol' : 'bplaf';
    const opts = (k === 'sol' ? ['terreplein', 'vide_sanitaire', 'non_chauffe', 'exterieur'] : ['combles', 'non_chauffe', 'toiture']).map((v) => ({ v, n: COTES[v].n.split(' (')[0] }));
    return h('div', null, h('div', { class: 'fld' }, h('span', null, k === 'sol' ? 'Sous le plancher (là où aucune pièce chauffée n’est dessous)' : 'Au-dessus du plafond (là où aucune pièce chauffée n’est dessus)'),
      segCtl(opts, lvl[champ] || null, (v) => { lvl[champ] = v; delete lvl[bch]; commit(); })),
      h('p', { class: 'note' }, `${c.st === 'estimee' ? 'Non précisé, supposé : ' + c.n + '. ' : ''}Coefficient b ${f2(c.b.v)} (${c.b.st === 'saisie' ? 'saisi' : 'estimé'}).`),
      numField('Coefficient b', c.b.v, '', (v) => { lvl[bch] = v; commit(); }, { id: 'f-' + bch, min: 0, max: 1 }));
  };
  const dupt = P.install.dupt && P.install.dupt.v != null ? P.install.dupt : DEF.dupt;
  return sec('Thermique (déperditions)',
    teField(),
    numField('Ponts thermiques (majoration ΔU)', dupt.v, 'W/m²·K', (v) => { P.install.dupt = { v, st: 'saisie', src: 'Saisie pour le projet' }; commit(); }, { id: 'f-dupt', min: 0, max: 2 }),
    dupt.st === 'estimee' ? h('p', { class: 'note' }, 'Estimée : ' + dupt.src + '.') : null,
    cote('sol'), cote('plafond'),
    B.lignes.length ? h('div', null, h('h4', null, 'Bilan des pièces chauffées'),
      h('div', { class: 'list' }, B.lignes.map((x) => h('div', { class: 'li' },
        h('span', null, x.piece.name, h('small', { style: 'display:block;opacity:.75' }, `${f1(x.ti.v)} °C · ${f1(x.S)} m²${x.pose.n ? ' · posé ' + W_(x.pose.p) : ''}`)),
        h('span', { class: 'v' }, x.total != null ? W_(x.total) : f1(x.H) + ' W/K', ' ', pill(x.statut)))),
        h('div', { class: 'li tot' }, h('span'), h('span', null, 'Total du niveau'), h('span', { class: 'v' }, B.total != null ? W_(B.total) + (B.partiel ? ' (partiel)' : '') : '—')))) : h('p', { class: 'note' }, 'Aucune pièce chauffée sur ce niveau.'),
    h('p', { class: 'note' }, NOTE));
}

/* ---------------- ouverture ---------------- */
function thermiqueOuvertureSection(o) {
  const u = uOuverture(o); if (!u) return null;
  return sec('Thermique', numField(o.kind === 'window' ? 'Coefficient Uw' : 'Coefficient Ud', u.v, 'W/m²·K', (v) => { o.uw = v; commit(); }, { id: 'f-uw', min: 0.1, max: 10 }),
    chipRow([0.8, 1.1, 1.3, 1.5, 1.8, 2.5, 3.5], u.v, (v) => { o.uw = v; commit(); }, (v) => String(v).replace('.', ',')),
    h('p', { class: 'note' }, u.st === 'estimee' ? 'Estimé : ' + u.src + '.' : 'Saisi (valeur de la fiche du fabricant).'));
}

export { thermiqueMurSection, thermiqueNiveauSection, thermiqueOuvertureSection, thermiquePieceSection };

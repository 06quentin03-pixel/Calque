/* Calque — module « integrationui » : sections du panneau de droite (demande du 15 novembre 2026)
   - « Électroménager intégré » d'un meuble : appareils logés dedans (four sous la plaque, lave-vaisselle sous le plan de
     travail, micro-ondes dans la colonne…), ajout d'un appareil en un toucher ;
   - « Intégration » d'un appareil : l'intégrer dans un meuble voisin, ou l'en sortir ;
   - « Raccordement » d'un appareil : sa prise spécialisée (ou sa sortie de câble pour un radiateur) posée derrière lui ;
   - « Puissance conseillée » d'un radiateur : d'après les déperditions de la pièce où il se trouve (thermique.js).
   Calculs sans écran : integration.js, equipement.js, thermique.js. */
import { IDX, P, horsHabitation, inPoly, ui, uid } from './noyau.js';
import { geo } from './geometrie.js';
import { commit, makeItemFromDef, select } from './interaction.js';
import { btn, btns, chipRow, h, kv, numField, sec, toast } from './interface.js';
import { ELEC_BY, FURN_BY } from './symboles.js';
import { DESSUS, HOTES, accepte, estIntegrable, hoteDe, hotesPossibles, integrer, integresDans, liberer, nomAppareil, nouvelIntegre, placer } from './integration.js';
import { RACCORD, equiperPiece } from './equipement.js';
import { puissanceConseillee, tExt } from './thermique.js';

/* modèle du mobilier (FURN) utilisé pour créer un appareil dans un meuble */
const MODELE = { four: 'four', lave_vaisselle: 'lv', lave_linge: 'll', seche_linge: 'sl', frigo: 'frigo', congelateur: 'congel', micro_ondes: 'mo', hotte: 'hotte', plaque: 'pl60', plaque90: 'pl90', evier1: 'ev1', evier2: 'ev2', evier_eg: 'eveg' };
const COURT = { plaque: 'Plaque 60', plaque90: 'Plaque 90', evier1: 'Évier 1 bac', evier2: 'Évier 2 bacs', evier_eg: 'Évier + égouttoir', frigo: 'Réfrigérateur' };
const nomItem = (it) => it.label || it.name || nomAppareil(it.type);
const fmtW = (v) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(v)) + ' W';

/* ---------------- électroménager intégré ---------------- */
function ajouter(hote, type) {
  const def = FURN_BY.get(MODELE[type]); if (!def) return;
  const tmp = makeItemFromDef(def, hote.lv); // même identifiant et mêmes champs qu'un objet posé à la main
  const it = nouvelIntegre(P, hote, def, tmp.id);
  IDX.items.set(it.id, it);
  commit();
  toast(`${nomAppareil(type)} intégré${type === 'plaque' || type === 'plaque90' ? 'e' : ''} dans « ${nomItem(hote)} ». Touchez de nouveau le meuble pour le choisir.`);
}
function sectionHote(it) {
  const H = HOTES[it.type]; if (!H) return null;
  const liste = integresDans(P, it);
  const parts = [];
  if (liste.length) parts.push(h('ul', { class: 'eq-liste' }, liste.map((x) => h('li', null, h('b', null, nomItem(x)), h('small', null, DESSUS.has(x.type) ? ' — dans le plan' : ` — à ${Math.round(x.zb || 0)} cm du sol`), ' ',
    btn('Choisir', () => select({ t: 'item', id: x.id }), 'sm'), btn('Sortir', () => { liberer(x); commit(); toast(`${nomItem(x)} sorti du meuble (il reste à sa place).`); }, 'sm')))));
  else parts.push(h('p', { class: 'note' }, H.plan ? 'Logez un appareil sous ce plan (four, lave-vaisselle…) ou dans le plan (plaque, évier) : il suit le meuble quand vous le déplacez.' : 'Logez un appareil dans ce meuble : il suit le meuble quand vous le déplacez.'));
  parts.push(h('p', { class: 'note' }, 'Ajouter :'), btns(...H.accepte.filter((t) => MODELE[t]).map((t) => btn(COURT[t] || nomAppareil(t), () => ajouter(it, t), 'sm', 'plus'))));
  /* appareils posés à côté, pas encore intégrés */
  const voisins = (P.items || []).filter((x) => x.lv === it.lv && !x.dans && x !== it && accepte(it, x.type) && hotesPossibles(P, x, 20).includes(it));
  if (voisins.length) parts.push(btns(...voisins.slice(0, 4).map((x) => btn(`Intégrer « ${nomItem(x)} » posé ici`, () => { integrer(P, x, it); commit(); }, 'sm'))));
  return sec('Électroménager intégré', ...parts);
}
function sectionAppareil(it) {
  if (!estIntegrable(it)) return null;
  const hote = hoteDe(P, it);
  if (hote) {
    return sec('Intégration',
      kv([['Intégré dans', nomItem(hote)]]),
      numField('Position le long du meuble', it.ox || 0, 'cm', (v) => { it.ox = v; placer(it, hote); commit(); }, { id: 'f-iox', min: -1000, max: 1000 }),
      btns(btn('Choisir le meuble', () => select({ t: 'item', id: hote.id }), 'sm'), btn('Sortir du meuble', () => { liberer(it); commit(); }, 'sm')),
      h('p', { class: 'note' }, `L’appareil suit le meuble (déplacement, rotation, miroir). Glissez-le pour le faire coulisser le long du meuble ; tirez-le plus loin pour l’en sortir. 0 cm = centré. Hauteur de pose : « Hauteur (vue 3D) ».`));
  }
  const possibles = hotesPossibles(P, it);
  return sec('Intégration',
    possibles.length ? btns(...possibles.slice(0, 3).map((x) => btn(`Intégrer dans « ${nomItem(x)} »`, () => { integrer(P, it, x); commit(); toast(`${nomItem(it)} intégré dans « ${nomItem(x)} ».`); }, 'sm pri')))
      : h('p', { class: 'note' }, 'Approchez l’appareil d’un plan de travail, d’un meuble bas, d’une plaque, d’un évier, d’une colonne ou d’un meuble haut pour l’y intégrer (ou choisissez le meuble et « Ajouter »).'));
}

/* ---------------- raccordement d'un appareil (prise ou sortie de câble derrière lui) ---------------- */
function pieceDe(it) {
  for (const r of geo(it.lv).rooms) if (r.label && inPoly(it, r.loop)) return r;
  return null;
}
const pieceEq = (r) => ({ lv: r.label.lv, nom: r.label.name, poly: r.poly, loop: r.loop, aire: r.area / 10000, ext: horsHabitation(r.label) });
function raccordDe(it) {
  const R = RACCORD[it.type]; if (!R) return null;
  const ray = R.rayon || 150;
  let best = null, bd = Infinity;
  for (const e of P.elec) { if (e.lv !== it.lv || !R.ok.includes(e.type)) continue; const d = Math.hypot(e.x - it.x, e.y - it.y); if (d <= ray && d < bd) { bd = d; best = e; } }
  return best;
}
/* contexte thermique et puissance conseillée pour un appareil de chauffage e (ou un nouvel appareil) dans la pièce r */
function conseil(r, e) {
  const toutes = new Map(P.levels.map((l) => [l.id, geo(l.id).rooms]));
  return puissanceConseillee(P, r, { toutes, te: tExt(P), pieces: toutes.get(r.label.lv) }, e);
}
function poserRaccord(it) {
  const r = pieceDe(it); if (!r) { toast('L’appareil n’est dans aucune pièce fermée par des murs.'); return; }
  const prop = equiperPiece(P, pieceEq(r)), p = prop.poses.find((x) => x.pour === it.id);
  if (!p) { toast('Aucune place libre trouvée sur le mur derrière l’appareil (à 60 cm au plus) : posez le symbole à la main.'); return; }
  const e = { id: uid('e'), lv: it.lv, type: p.type, x: p.x, y: p.y, rot: p.rot, h: p.h };
  if (p.type === 'sortie_rad') { const c = r.label && !r.label.nc ? conseil(r, null) : null; if (c && c.conseil) e.p = c.conseil; }
  P.elec.push(e); IDX.elec.set(e.id, e);
  commit();
  select({ t: 'elec', id: e.id });
  toast(`${(ELEC_BY.get(p.type) || {}).n || 'Symbole'} posé${e.p ? ` (${fmtW(e.p)}, puissance conseillée pour la pièce)` : ''}. Reliez-le à un circuit, puis « Proposer le raccordement » trace les gaines.`);
}
function sectionRaccord(it) {
  const R = RACCORD[it.type]; if (!R) return null;
  const e = raccordDe(it);
  const nom = (ELEC_BY.get(R.type) || {}).n || R.type;
  const parts = [];
  if (e) parts.push(kv([['Raccordé par', `${(ELEC_BY.get(e.type) || {}).n || e.type}${e.p ? ` (${fmtW(e.p)})` : ''}`]]), btns(btn('Choisir le symbole', () => select({ t: 'elec', id: e.id }), 'sm')));
  else parts.push(h('p', { class: 'note' }, `Pas encore de ${nom.toLowerCase()} près de l’appareil.`), btns(btn(`Poser : ${nom}`, () => poserRaccord(it), 'sm pri', 'plus')));
  if (it.type === 'radiateur') parts.push(sectionConseil(it, e));
  return sec('Raccordement électrique', ...parts);
}

/* ---------------- puissance conseillée d'un radiateur ---------------- */
const CHAUFFAGES = new Set(['rad_elec', 'sortie_rad', 'seche_serv_e', 'plancher', 'soufflant_sdb']);
const PUISSANCES = [500, 750, 1000, 1250, 1500, 1750, 2000];
/* e : symbole de chauffage (ou null pour un radiateur du mobilier sans sortie) ; o : objet dont la position compte */
function sectionConseil(o, e) {
  const r = pieceDe(o);
  if (!r || !r.label) return h('p', { class: 'note' }, 'Puissance conseillée : posez l’appareil dans une pièce fermée par des murs.');
  if (r.label.nc) return h('p', { class: 'note' }, `« ${r.label.name} » est marquée non chauffée (Thermique de la pièce) : pas de puissance conseillée.`);
  const c = conseil(r, e);
  if (c.conseil == null) return h('div', null, h('p', { class: 'note garder' }, `Puissance conseillée pour « ${r.label.name} » : indiquez d’abord la température extérieure de base de votre commune.`),
    numField('Température extérieure de base', null, '°C', (v) => { P.install.text = { v, st: 'saisie', src: 'Saisie pour le projet' }; commit(); }, { id: 'f-rtext', min: -60, max: 40 }));
  const lignes = [['Pièce', r.label.name], ['Déperditions de la pièce', `${fmtW(c.besoin)} (${c.statut === 'saisie' ? 'saisie' : c.statut === 'partiel' ? 'partielle' : 'estimée'})`]];
  if (c.nAutres) lignes.push(['Autres appareils de la pièce', `${fmtW(c.autres)}${c.autresSaisi ? '' : ' (puissance par défaut pour certains)'}`]);
  lignes.push(['Puissance conseillée', c.conseil ? fmtW(c.conseil) : 'aucune : déjà couverte']);
  const cur = e && Number.isFinite(e.p) ? e.p : null;
  return h('div', { class: 'conseil-rad' },
    kv(lignes),
    e && c.conseil && cur !== c.conseil ? btns(btn(`Prendre ${fmtW(c.conseil)}`, () => { e.p = c.conseil; commit(); }, cur == null || cur < c.conseil ? 'sm pri' : 'sm')) : null,
    e && c.conseil && cur != null ? h('span', { class: 'pill ' + (cur >= c.conseil ? 'ok' : 'warn') }, cur >= c.conseil ? 'Puissance suffisante' : `Il manque ${fmtW(c.conseil - cur)}`) : null,
    h('p', { class: 'note' }, 'Déperditions de la pièce moins les autres appareils de chauffage de la pièce, arrondies aux 250 W supérieurs (méthode simplifiée de Calque, pas une étude thermique réglementaire). Détail : panneau de la pièce › Thermique.'));
}
/* champ « Puissance » d'un symbole de chauffage : choix rapides + conseil */
function puissanceChauffageSection(e) {
  if (!CHAUFFAGES.has(e.type)) return null;
  return sec('Puissance du chauffage',
    chipRow(PUISSANCES, Number.isFinite(e.p) ? e.p : -1, (v) => { e.p = v; commit(); }, (v) => fmtW(v)),
    sectionConseil(e, e));
}

/* toutes les sections d'un objet du mobilier */
function integrationSections(it) {
  return [sectionHote(it), sectionAppareil(it), sectionRaccord(it)].filter(Boolean);
}

export { integrationSections, puissanceChauffageSection, raccordDe };

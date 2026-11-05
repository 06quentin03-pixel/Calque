/* Calque — module « materiel » : taux de remplissage des cheminements et liste de matériel (métrés).
   JavaScript pur, sans accès à l'écran : testable avec Node. Le plan n'est jamais modifié.
   - Remplissage : la règle (taux maximal) n'est pas dans l'extrait Legrand fourni → toujours « vérification nécessaire ».
     L'occupation n'est calculée que si toutes les données sont connues (diamètre extérieur de chaque câble, dimensions
     du cheminement) ; rien n'est deviné.
   - Matériel : quantités estimées depuis le plan (longueurs + réserve), à vérifier avant commande. */
import { isNum } from './noyau.js';
import { REGLES, tableDisponible } from './normes.js';
import { aCommander, cheminCircuit, circuitsDe, isElecDuct, longueurGaine, nomChemin, reserveDe, sectionNominale, tailleChemin, TRAVERSEE, typeChemin } from './cheminement.js';
import { conflitsPlan } from './itineraire.js';
import { ELEC_BY } from './symboles.js';

const nf = (d) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d });
const lire = (x) => (x && typeof x === 'object' && isNum(x.v) && x.v > 0 ? x : null);

/* circuits passant dans chaque gaine : ceux qu'elle déclare + ceux dont le cheminement l'emprunte */
function circuitsParGaine(plan) {
  const ducts = (plan.ducts || []).filter(isElecDuct);
  const per = new Map(ducts.map((d) => [d.id, new Set(circuitsDe(d))]));
  const chs = new Map();
  for (const c of plan.circuits || []) {
    const ch = cheminCircuit(plan, c.id); chs.set(c.id, ch);
    for (const id of ch.ducts) if (per.has(id)) per.get(id).add(c.id);
  }
  return { ducts, per, chs };
}

/* taux de remplissage de chaque gaine électrique */
function remplissageGaines(plan) {
  const { ducts, per } = circuitsParGaine(plan);
  const byId = new Map((plan.circuits || []).map((c) => [c.id, c]));
  const R = REGLES.remplissage;
  return ducts.map((d) => {
    const cs = [...per.get(d.id)].map((id) => byId.get(id)).filter(Boolean);
    const S = sectionNominale(d);
    const cab = cs.map((c) => ({ c, dc: lire(c.calc && c.calc.dcab) }));
    const manq = [];
    if (!typeChemin(d)) manq.push('type du cheminement');
    if (S == null) manq.push(typeChemin(d) && typeChemin(d).forme === 'rect' ? 'largeur et hauteur du cheminement' : 'diamètre du conduit');
    const sans = cab.filter((x) => !x.dc);
    if (sans.length) manq.push(`diamètre extérieur du câble (${sans.map((x) => x.c.name).slice(0, 3).join(', ')}${sans.length > 3 ? '…' : ''})`);
    const occ = cs.length && !sans.length ? cab.reduce((s, x) => s + (Math.PI * x.dc.v * x.dc.v) / 4, 0) : null;
    const taux = occ != null && S ? (occ / S) * 100 : null;
    const st = cab.some((x) => x.dc && x.dc.st === 'estimee') ? 'estimee' : 'saisie';
    let detail;
    if (!cs.length) detail = 'Aucun circuit ne passe dans ce cheminement.';
    else if (taux != null) detail = `Occupation indicative : ${nf(1).format(taux)} % de la section nominale (le diamètre intérieur réel est plus petit : occupation réelle plus forte). Taux maximal admis non couvert par l’extrait Legrand fourni : à vérifier par un professionnel.`;
    else detail = `Occupation non calculée, données manquantes : ${manq.join(' ; ')}.`;
    return {
      id: d.id, lv: d.lv, nom: nomChemin(d), taille: tailleChemin(d), circuits: cs.map((c) => c.id), n: cs.length,
      section: S, occupation: occ, taux, st: taux != null ? st : null, manquantes: manq,
      controle: { id: 'remplissage', nom: R.nom, source: R.source, edition: R.edition, statut: 'verification', detail, tablesManquantes: tableDisponible('remplissage_conduits') ? [] : ['remplissage_conduits'] },
    };
  });
}

/* conducteurs d'un circuit (estimation) : phase + neutre + terre ; triphasé : 3 phases + neutre + terre */
function conducteurs(plan, c) {
  const tri = c.calc && c.calc.phase === 'tri';
  return { n: tri ? 5 : 3, txt: tri ? '3 phases, neutre, terre' : 'phase, neutre, terre' };
}

/* liste de matériel estimée */
function listeMateriel(plan) {
  const res = reserveDe(plan);
  const { ducts, chs } = circuitsParGaine(plan);
  const lignes = [];
  const add = (cat, des, qte, unite, note) => lignes.push({ cat, des, qte, unite, note: note || '', st: 'estimee' });
  /* cheminements : longueur totale (verticales comprises) + réserve */
  const gr = new Map();
  let vertInconnues = 0;
  for (const d of ducts) {
    const k = `${nomChemin(d)}${tailleChemin(d) ? ' ' + tailleChemin(d) : ''}`;
    const L = longueurGaine(plan, d); vertInconnues += L.inconnu;
    const g = gr.get(k) || { cm: 0, n: 0 }; g.cm += L.total; g.n++; gr.set(k, g);
  }
  for (const [k, g] of [...gr.entries()].sort()) add('Cheminements', k, aCommander(g.cm, res), 'm', `${g.n} tronçon${g.n > 1 ? 's' : ''}, ${nf(1).format(g.cm / 100)} m mesurés + réserve`);
  /* conducteurs par section, pour les circuits entièrement raccordés */
  const sec = new Map(), sansL = [];
  for (const c of plan.circuits || []) {
    const ch = chs.get(c.id);
    if (!ch || !ch.complet || ch.arbre == null) { if (ch && ch.points.length) sansL.push(c.name); continue; }
    const m = aCommander(ch.arbre, res), k = conducteurs(plan, c);
    const key = isNum(c.sec) ? c.sec : null;
    const s = sec.get(key) || { m: 0, circuits: [] }; s.m += m * k.n; s.circuits.push(c.name); sec.set(key, s);
  }
  for (const [s, v] of [...sec.entries()].sort((a, b) => (a[0] || 0) - (b[0] || 0))) {
    add('Conducteurs', s != null ? `Fil ou câble ${nf(1).format(s)} mm²` : 'Section non indiquée', v.m, 'm', `${v.circuits.length} circuit${v.circuits.length > 1 ? 's' : ''} ; phase, neutre et terre comptés (navettes et retours de commande non comptés)`);
  }
  /* boîtes et accessoires comptés sur le plan */
  const elec = (plan.elec || []);
  const murales = elec.filter((e) => e.cid && (ELEC_BY.get(e.type) || {}).wall).length;
  const plafond = elec.filter((e) => e.cid && e.type === 'pl').length;
  const deriv = elec.filter((e) => e.type === 'derivation').length;
  const passages = elec.filter((e) => e.type === TRAVERSEE).length;
  if (murales) add('Boîtes', 'Boîtes d’encastrement (appareils muraux)', murales, 'u', '1 par symbole mural relié à un circuit (à adapter : boîtes doubles ou triples, cloison ou maçonnerie)');
  if (plafond) add('Boîtes', 'Boîtiers DCL de plafond', plafond, 'u', '1 par point lumineux au plafond');
  if (deriv) add('Boîtes', 'Boîtes de dérivation', deriv, 'u', 'posées sur le plan');
  if (passages) add('Percements', 'Passages entre étages', passages, 'u', 'symboles posés (un de chaque côté du plancher)');
  const cf = conflitsPlan(plan);
  const murs = cf.filter((x) => x.kind === 'mur').length, cl = cf.filter((x) => x.kind === 'cloison').length;
  if (murs) add('Percements', 'Traversées de murs', murs, 'u', 'percement ou réservation (vérifier s’il est porteur)');
  if (cl) add('Percements', 'Traversées de cloisons', cl, 'u', 'percement');
  return { lignes, reserve: res, sansLongueur: sansL, vertInconnues };
}

export { circuitsParGaine, conducteurs, listeMateriel, remplissageGaines };

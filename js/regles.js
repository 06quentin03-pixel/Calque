/* Calque — module « regles » : moteur de règles versionnées (contrôles NF C 15-100).
   SANS ÉCRAN (testable avec Node).

   Chaque règle du catalogue a : un identifiant, une version (v), un groupe, un nom, une SOURCE et une ÉDITION
   de la norme, sa nature (règle, conseil, point d'attention) et les données qu'elle utilise.
   Chaque résultat a l'un des trois statuts : conforme / non conforme / vérification nécessaire,
   avec le détail, les données utilisées et les données manquantes.

   Le moteur reprend TOUS les contrôles existants, sans en perdre :
   - ceux du moteur de calcul (calcul.js, extraits Legrand fournis) : par circuit (fiche de calcul), pour les
     interrupteurs différentiels et l'installation, et le remplissage des cheminements (materiel.js) ;
   - ceux de l'ancien contrôle « NF C 15-100 » du tableau (nfcChecks, electricite.js), transmis par l'écran
     (ils demandent la géométrie du plan) avec l'identifiant de leur règle (`rid`).

   Règles de l'utilisateur appliquées ici :
   - « conforme » seulement si la règle a une source vérifiée (extrait Legrand fourni) : une règle de Calque dont
     la source n'est pas encore rattachée à un extrait est au mieux « vérification nécessaire » (respectée selon
     Calque, à confirmer) ; un manquement reste « non conforme » (il signale un problème à corriger) ;
   - jamais de conformité globale si tout n'a pas été vérifié ;
   - les tableaux absents du guide Legrand fourni restent reportés (phase 8) : rien n'est inventé. */
import { CONF, ficheDuPlan, controlesDifferentiels, statutGlobal } from './calcul.js';
import { ED_2024, NORME, REGLES, SRC_GUIDE, tablesManquantes } from './normes.js';
import { remplissageGaines } from './materiel.js';
import { controlesCablage } from './cablage.js';

/* version du jeu de règles : à changer à chaque modification d'une règle (et la version `v` de la règle) */
const REGLES_VERSION = 'Calque-règles 2026.11 (2)';

/* origines des règles */
const REFERENTIELS = {
  legrand: { n: 'Extrait Legrand fourni', verifie: true },
  /* règle générale (ex. IB ≤ In) : condition calculée directement, statut décidé par le moteur de calcul (phase 3) */
  norme: { n: 'Règle générale de la norme citée (extrait à fournir)', verifie: true },
  calque: { n: 'Contrôle de Calque (source à rattacher à un extrait Legrand)', verifie: false,
    source: `Contrôle de Calque d’après la ${NORME} — source à rattacher à un extrait Legrand (non fourni pour cette règle)`,
    edition: `${NORME}, révision du 23 août 2024 (édition à confirmer par un extrait Legrand)` },
  conseil: { n: 'Recommandation de Calque', verifie: false, source: 'Recommandation de Calque (ce n’est pas une exigence vérifiée)', edition: '—' },
  attention: { n: 'Point d’attention de Calque', verifie: false, source: 'Point d’attention de Calque (ce n’est pas une règle de la norme)', edition: '—' },
};

const G_CAB = 'Câblage et cohérence', G_INST = 'Tableau et protections', G_CIRC = 'Circuits', G_PIECES = 'Pièces', G_HAUT = 'Hauteurs de pose', G_VMC = 'Ventilation (VMC)', G_CALC = 'Calculs des circuits', G_CHEM = 'Cheminements';

/* règles du moteur de calcul (calcul.js / normes.js) : source et édition reprises de normes.js */
const DONNEES_CALC = {
  nb_points: [], type_dd: [],
  ib_in: ['Puissance active P', 'Facteur de puissance cos φ', 'Tension phase-neutre U0', 'Tension entre phases U', 'Calibre de la protection In'],
  in_iz: ['Section S', 'Calibre de la protection In'],
  sec_logement: ['Section S', 'Calibre de la protection In', 'Puissance active P'],
  chute_tension: ['Puissance active P', 'Facteur de puissance cos φ', 'Longueur du câble L', 'Section S', 'Résistivité ρ (service normal)', 'Réactance linéique λ', 'Tension phase-neutre U0'],
  pdc: ['Calibre de la protection In'],
  dd_nombre: ['Interrupteurs différentiels du tableau'], dd_lp: ['Circuits et leur différentiel'], dd_circuits: ['Circuits du différentiel'],
  dd_calibre: ['Calibres des disjoncteurs en aval', 'Calibre du différentiel', 'Puissance souscrite (disjoncteur d’abonné)'],
  remplissage: ['Diamètre extérieur des câbles', 'Dimensions du cheminement'],
};
/* données décrites (pas de ligne dans la fiche de calcul) */
const DONNEES_DESC = { nb_points: ['Symboles reliés au circuit'], type_dd: ['Type de l’interrupteur différentiel du circuit'] };
const GROUPE_CALC = { dd_nombre: G_INST, dd_lp: G_INST, dd_circuits: G_INST, dd_calibre: G_INST, remplissage: G_CHEM };
function regleCalcul(id) {
  const r = REGLES[id];
  const verifie = String(r.source || '').startsWith(SRC_GUIDE) && r.edition === ED_2024;
  return { id, v: 1, groupe: GROUPE_CALC[id] || G_CALC, nom: r.nom, source: r.source, edition: r.edition, ref: verifie ? 'legrand' : 'norme', nature: 'regle', tables: r.tables || [], donnees: DONNEES_DESC[id] || DONNEES_CALC[id] || [] };
}

/* règles de l'ancien contrôle du tableau (nfcChecks) : [id, groupe, nom, nature, données utilisées, règle Legrand liée] */
const CALQUE = [
  ['cq_circuits', G_INST, 'Le tableau comporte des circuits', 'regle', ['Circuits du tableau']],
  ['cq_dd_nombre', G_INST, 'Au moins 2 interrupteurs différentiels 30 mA', 'regle', ['Interrupteurs différentiels'], 'dd_nombre'],
  ['cq_dd_type_a', G_INST, 'Au moins un différentiel de type A (ou F)', 'regle', ['Types des interrupteurs différentiels'], 'dd_nombre'],
  ['cq_dd_8', G_INST, '8 circuits au plus par interrupteur différentiel', 'regle', ['Circuits de chaque différentiel'], 'dd_circuits'],
  ['cq_dd_vide', G_INST, 'Chaque interrupteur différentiel protège au moins un circuit', 'attention', ['Circuits de chaque différentiel']],
  ['cq_dd_calibre', G_INST, 'Calibre du différentiel suffisant (charge en aval ou réglage du disjoncteur d’abonné)', 'regle', ['Calibres en aval', 'Puissance souscrite'], 'dd_calibre'],
  ['cq_irve_dd', G_INST, 'Borne de recharge sur son propre différentiel 30 mA', 'regle', ['Circuits du différentiel de la borne']],
  ['cq_circuit_dd', G_INST, 'Chaque circuit est protégé par un différentiel 30 mA', 'regle', ['Différentiel de chaque circuit'], 'type_dd'],
  ['cq_type_a_circuit', G_INST, 'Type A au moins pour les circuits qui l’exigent', 'regle', ['Type de circuit', 'Type du différentiel'], 'type_dd'],
  ['cq_dd_lp', G_INST, 'Éclairage et prises répartis sur au moins 2 différentiels', 'regle', ['Circuits d’éclairage et de prises'], 'dd_lp'],
  ['cq_reserve', G_INST, 'Réserve d’au moins 20 % de modules libres dans le tableau', 'regle', ['Implantation du coffret']],
  ['cq_parafoudre', G_INST, 'Parafoudre (selon le bâtiment et la zone)', 'conseil', ['Réglage « parafoudre » de l’installation']],
  ['cq_gtl', G_INST, 'Gaine technique logement (GTL) en logement neuf', 'conseil', ['Symboles du plan']],
  ['cq_sec_cal', G_CIRC, 'Calibre de la protection adapté à la section', 'regle', ['Section', 'Calibre'], 'sec_logement'],
  ['cq_ecl_16', G_CIRC, 'Circuit d’éclairage protégé à 16 A au plus', 'regle', ['Calibre du circuit d’éclairage'], 'sec_logement'],
  ['cq_points', G_CIRC, 'Nombre de points, de socles ou puissance par circuit', 'regle', ['Symboles reliés au circuit', 'Section', 'Calibre'], 'nb_points'],
  ['cq_cuisine_dedie', G_CIRC, 'Circuit des prises de la cuisine dédié à la cuisine', 'regle', ['Symboles reliés', 'Pièces']],
  ['cq_circuit_adapte', G_CIRC, 'Appareil relié à un circuit adapté', 'attention', ['Symboles reliés', 'Type de circuit']],
  ['cq_sans_circuit', G_CIRC, 'Chaque symbole est relié à un circuit', 'attention', ['Symboles du plan']],
  ['cq_ecl_2', G_CIRC, 'Au moins 2 circuits d’éclairage (2 pièces principales ou plus)', 'regle', ['Circuits d’éclairage', 'Pièces principales']],
  ['cq_specialises', G_CIRC, 'Au moins 3 circuits spécialisés', 'regle', ['Circuits spécialisés']],
  ['cq_cuisson', G_CIRC, 'Circuit de cuisson 32 A en 6 mm² quand le logement a une cuisine', 'regle', ['Circuits', 'Pièces']],
  ['cq_dda', G_CIRC, 'Détecteur d’arc (DDA) pour les prises des chambres', 'conseil', ['Circuits de prises', 'Pièces']],
  ['cq_daaf', G_PIECES, 'Au moins un détecteur de fumée (DAAF) par logement', 'regle', ['Symboles du plan']],
  ['cq_terre', G_PIECES, 'Prises de courant avec contact de terre', 'regle', ['Symboles du plan']],
  ['cq_socles_piece', G_PIECES, 'Nombre minimal de socles de prise par pièce', 'regle', ['Symboles dans la pièce', 'Surface de la pièce']],
  ['cq_cuisine_pt', G_PIECES, '4 prises au-dessus du plan de travail de la cuisine', 'regle', ['Symboles dans la cuisine']],
  ['cq_cuisine_32', G_PIECES, 'Sortie 32 A pour la plaque de cuisson dans la cuisine', 'regle', ['Symboles dans la cuisine']],
  ['cq_eclairage_piece', G_PIECES, 'Un point d’éclairage dans chaque pièce', 'regle', ['Symboles dans la pièce']],
  ['cq_rj45', G_PIECES, 'Prise RJ45 dans chaque pièce principale', 'conseil', ['Symboles dans la pièce']],
  ['cq_sdb_volumes', G_PIECES, 'Pas de prise dans les volumes 1 et 2 de la salle de bain (60 cm)', 'regle', ['Position des prises', 'Baignoire et douche']],
  ['cq_cuisine_evier', G_PIECES, 'Pas de prise au-dessus de l’évier ou de la plaque', 'regle', ['Position des prises', 'Évier et plaque']],
  ['cq_prise_com', G_PIECES, 'Une prise de courant près de chaque prise de communication', 'regle', ['Position des prises']],
  ['cq_eclairage_acces', G_PIECES, 'Point d’éclairage au-dessus de chaque accès extérieur', 'regle', ['Portes', 'Éclairages extérieurs']],
  ['cq_h_commandes', G_HAUT, 'Commandes entre 90 et 130 cm du sol fini', 'regle', ['Hauteur de pose']],
  ['cq_h_pc32', G_HAUT, 'Sortie 32 A entre 12 et 130 cm (axe)', 'regle', ['Hauteur de pose']],
  ['cq_h_prises', G_HAUT, 'Hauteur de l’axe des prises (5 cm au moins, 130 cm au plus sauf exceptions)', 'regle', ['Hauteur de pose']],
  ['cq_h_tableau', G_HAUT, 'Organes de manœuvre du tableau entre 0,90 et 1,80 m environ', 'regle', ['Hauteur de pose']],
  ['cq_vmc', G_VMC, 'Ventilation (bouches, conduits, groupe)', 'attention', ['Conduits et bouches de VMC']],
].map(([id, groupe, nom, nature, donnees, voir]) => {
  const R = REFERENTIELS[nature === 'regle' ? 'calque' : nature];
  return { id, v: 1, groupe, nom, nature, ref: nature === 'regle' ? 'calque' : nature, source: R.source, edition: R.edition, donnees, voir: voir || null, tables: [] };
});
/* règles du module « Plans électriques » (moteur de câblage, cablage.js) : constats de conception d'après un schéma de
   câblage usuel ; jamais « conformes » (sources non rattachées à un extrait Legrand) */
const CABLAGE = [
  ['cb_raccord', G_CAB, 'Points du circuit raccordés au tableau par les gaines', 'attention', ['Gaines', 'Symboles reliés au circuit']],
  ['cb_cmd_seule', G_CAB, 'Chaque commande commande au moins un éclairage', 'attention', ['Liaisons commandes → éclairages']],
  ['cb_lum_sans_cmd', G_CAB, 'Chaque éclairage est relié à une commande', 'attention', ['Liaisons commandes → éclairages']],
  ['cb_vv', G_CAB, 'Va-et-vient par paires (permutateurs entre deux va-et-vient)', 'attention', ['Liaisons', 'Types des commandes']],
  ['cb_bp', G_CAB, 'Boutons-poussoirs avec télérupteur', 'conseil', ['Commande du circuit', 'Types des commandes']],
  ['cb_autre_circuit', G_CAB, 'Commande et éclairage sur le même circuit', 'attention', ['Liaisons', 'Circuits des symboles']],
  ['cb_fils_cdc', G_CAB, 'Pas de fils isolés seuls sur un chemin de câbles', 'regle', ['Type de conducteur du circuit', 'Type du cheminement']],
  ['cb_tab_tri', G_CAB, 'Circuit triphasé sur une installation triphasée', 'regle', ['Réseau de l’installation', 'Appareils du circuit']],
  ['cb_tab_courbe', G_CAB, 'Courbe de déclenchement adaptée au circuit', 'attention', ['Courbe de la protection', 'Type de circuit']],
  ['cb_tab_cond', G_CAB, 'Type de conducteur adapté à une installation fixe', 'conseil', ['Type de conducteur du circuit']],
].map(([id, groupe, nom, nature, donnees, voir]) => {
  const R = REFERENTIELS[nature === 'regle' ? 'calque' : nature];
  return { id, v: 1, groupe, nom, nature, ref: nature === 'regle' ? 'calque' : nature, source: R.source, edition: R.edition, donnees, voir: voir || null, tables: [] };
});

const CATALOGUE = [...Object.keys(REGLES).map(regleCalcul), ...CALQUE, ...CABLAGE];
const CAT_BY = new Map(CATALOGUE.map((r) => [r.id, r]));
const regle = (id) => CAT_BY.get(id) || null;
const ORDRE_GROUPES = [G_INST, G_CIRC, G_CALC, G_CHEM, G_CAB, G_PIECES, G_HAUT, G_VMC];

/* ---------------- résultats ---------------- */
/* un résultat ; « conforme » est refusé à une règle dont la source n'est pas vérifiée ou à qui il manque des données */
function resultat(id, statut, detail, extra) {
  const r = regle(id); if (!r) throw new Error('Règle inconnue : ' + id);
  const x = extra || {};
  const manquantes = (x.manquantes || []).filter(Boolean);
  let st = statut === 'conforme' || statut === 'non_conforme' ? statut : 'verification';
  let constat = x.constat || (st === 'conforme' ? 'respecte' : st === 'non_conforme' ? 'non_respecte' : 'indetermine');
  let d = String(detail || '');
  if (st === 'conforme' && !REFERENTIELS[r.ref].verifie) {
    st = 'verification'; constat = 'respecte';
    d += ' Respecté d’après le contrôle de Calque ; source à rattacher à un extrait Legrand : à confirmer.';
  }
  if (r.nature === 'conseil') constat = st === 'non_conforme' ? 'conseil' : constat;
  return { id, v: r.v, groupe: r.groupe, nom: r.nom, nature: r.nature, source: r.source, edition: r.edition, referentiel: REFERENTIELS[r.ref].n,
    statut: st, constat, detail: d.trim(), objet: x.objet || null, ref: x.ref || null, utilisees: x.utilisees || [], manquantes, voir: r.voir,
    tablesManquantes: x.tablesManquantes || [] };
}

/* conversion d'un contrôle de l'ancien nfcChecks : { sev, group, msg, ref, rule, rid } */
function depuisControleCalque(c) {
  const r = regle(c.rid) || regle('cq_circuits');
  const statut = c.sev === 'err' ? (r.nature === 'regle' ? 'non_conforme' : 'verification') : c.sev === 'ok' ? 'conforme' : 'verification';
  const constat = c.sev === 'warn' ? 'a_revoir' : c.sev === 'info' ? 'conseil' : undefined;
  return resultat(r.id, statut, c.msg + (c.rule && c.sev === 'err' ? ` (${c.rule})` : ''), { ref: c.ref, constat, utilisees: r.donnees.map((n) => n + ' (plan)') });
}

/* données utilisées par un contrôle d'une fiche de calcul : nom = valeur unité (statut) */
const LIB = { verifiee: 'vérifiée', saisie: 'saisie', estimee: 'estimée' };
function donneesUtilisees(fiche, noms) {
  const out = [];
  for (const d of fiche.donnees) if (noms.includes(d.nom) && d.aff != null) out.push(`${d.nom} = ${d.aff}${d.unite ? ' ' + d.unite : ''} (${LIB[d.st] || d.st})`);
  return out;
}
function manquantesDe(fiche, noms, tables) {
  const out = fiche.manquantes.filter((m) => noms.includes(m.nom)).map((m) => m.nom);
  for (const t of tables || []) out.push('Tableau non fourni : ' + t);
  return out;
}

/* ---------------- évaluation d'un plan ----------------
   plan : le plan P (aucune donnée n'est modifiée).
   opts.calque : contrôles de l'ancien contrôle du tableau (nfcChecks, avec `rid`), fournis par l'écran ;
   opts.reperes : Map id du circuit → repère (C1…), facultatif. */
function evaluerPlan(plan, opts) {
  const o = opts || {};
  const res = [];
  const nums = o.reperes || new Map((plan.circuits || []).map((c, i) => [c.id, 'C' + (i + 1)]));
  const rn = new Map((plan.rcds || []).map((r, i) => [r.id, 'ID' + (i + 1)]));
  /* 1. installation et interrupteurs différentiels (extrait Legrand) */
  const dd = controlesDifferentiels(plan);
  for (const c of dd.global) res.push(resultat(c.id, c.statut, c.detail, { utilisees: regle(c.id).donnees.map((n) => n + ' (tableau)') }));
  for (const r of dd.rcds) for (const c of r.controles) {
    const ut = regle(c.id).donnees.map((n) => n + ' (tableau)');
    const man = c.id === 'dd_calibre' && !(plan.install && Number.isFinite(plan.install.kva)) ? ['Puissance souscrite'] : [];
    res.push(resultat(c.id, c.statut, c.detail, { objet: `${rn.get(r.id)} ${r.type} ${r.cal} A`, ref: { t: 'rcd', id: r.id }, utilisees: ut, manquantes: man }));
  }
  /* 2. chaque circuit : contrôles de la fiche de calcul */
  for (const c of plan.circuits || []) {
    const f = ficheDuPlan(plan, c);
    for (const k of f.controles) {
      const noms = (DONNEES_CALC[k.id] || []).filter((n) => !(k.id === 'sec_logement' && n === 'Puissance active P' && c.kind !== 'chauffage'));
      const tabs = (k.tablesManquantes || []);
      res.push(resultat(k.id, k.statut, k.detail, { objet: `${nums.get(c.id) || ''} ${c.name}`.trim(), ref: { t: 'circuit', id: c.id },
        utilisees: donneesUtilisees(f, noms).concat(noms.length ? [] : regle(k.id).donnees.map((n) => n + ' (plan)')), manquantes: manquantesDe(f, noms, tabs), tablesManquantes: tabs }));
    }
  }
  /* 3. remplissage des cheminements (règle non couverte par l'extrait : vérification nécessaire) */
  for (const g of remplissageGaines(plan)) {
    if (!g.n) continue;
    res.push(resultat('remplissage', g.controle.statut, g.taux != null ? `Occupation estimée ${String(Math.round(g.taux * 10) / 10).replace('.', ',')} % : taux maximal non fourni (extrait Legrand reporté en phase 8).` : 'Occupation non calculée.',
      { objet: g.nom + (g.taille ? ' · ' + g.taille : ''), ref: { t: 'duct', id: g.id }, utilisees: regle('remplissage').donnees, manquantes: (g.manquantes || []).concat(tablesManquantes(['remplissage_conduits']).map((t) => 'Tableau non fourni : ' + t.titre)) }));
  }
  /* 4. contrôles de l'ancien contrôle du tableau */
  for (const c of o.calque || []) res.push(depuisControleCalque(c));
  /* 5. câblage et cohérence circuit ↔ tableau (cablage.js) : erreur → non conforme pour une règle (à corriger),
     sinon « vérification nécessaire » ; avertissement → à revoir ; suggestion → recommandation */
  if (o.cablage !== false) for (const x of controlesCablage(plan)) {
    const r = regle(x.id); if (!r) continue;
    const statut = x.niveau === 'erreur' && r.nature === 'regle' ? 'non_conforme' : 'verification';
    const constat = x.niveau === 'suggestion' ? 'conseil' : x.niveau === 'avertissement' || x.niveau === 'erreur' ? 'a_revoir' : undefined;
    res.push(resultat(x.id, statut, x.msg + ' (constat de Calque d’après un schéma de câblage usuel)', { objet: x.cid ? `${nums.get(x.cid) || ''} ${(plan.circuits.find((c) => c.id === x.cid) || {}).name || ''}`.trim() : null,
      ref: x.cid ? { t: 'circuit', id: x.cid } : x.refs && x.refs[0] ? { t: 'elec', id: x.refs[0] } : null, constat: statut === 'non_conforme' ? undefined : constat, utilisees: r.donnees.map((n) => n + ' (plan)') }));
  }
  res.sort((a, b) => ORDRE_GROUPES.indexOf(a.groupe) - ORDRE_GROUPES.indexOf(b.groupe) || RANG[a.statut] - RANG[b.statut] || (RANG_C[a.constat] || 0) - (RANG_C[b.constat] || 0));
  return rapport(res);
}
const RANG = { non_conforme: 0, verification: 1, conforme: 2 };
const RANG_C = { non_respecte: 0, a_revoir: 1, indetermine: 2, respecte: 3, conseil: 4 };

function rapport(resultats) {
  const synthese = { total: resultats.length, conforme: 0, non_conforme: 0, verification: 0, respectesNonVerifies: 0, conseils: 0 };
  for (const r of resultats) { synthese[r.statut]++; if (r.statut === 'verification' && r.constat === 'respecte') synthese.respectesNonVerifies++; if (r.constat === 'conseil') synthese.conseils++; }
  const global = statutGlobal(resultats);
  const tm = new Set(); for (const r of resultats) for (const t of r.tablesManquantes || []) tm.add(t);
  for (const t of tablesManquantes()) if (resultats.some((r) => (regle(r.id).tables || []).includes(t.id))) tm.add(t.titre);
  const avis = global === 'conforme'
    ? 'Tous les contrôles sont conformes, avec des sources vérifiées.'
    : global === 'non_conforme'
      ? `${synthese.non_conforme} point${synthese.non_conforme > 1 ? 's' : ''} non conforme${synthese.non_conforme > 1 ? 's' : ''} à corriger. Aucune conformité globale ne peut être affichée : ${synthese.verification} contrôle${synthese.verification > 1 ? 's' : ''} reste${synthese.verification > 1 ? 'nt' : ''} à vérifier.`
      : `Aucune conformité globale ne peut être affichée : ${synthese.verification} contrôle${synthese.verification > 1 ? 's' : ''} reste${synthese.verification > 1 ? 'nt' : ''} à vérifier (tableaux de la norme non fournis, données manquantes ou règles de Calque à confirmer).`;
  return { version: REGLES_VERSION, resultats, synthese, global, globalLib: CONF[global], avis: avis + ' Ce rapport ne remplace ni l’avis d’un électricien qualifié ni l’attestation de conformité exigée pour la mise en service.', tablesManquantes: [...tm] };
}

export { CABLAGE, CATALOGUE, CALQUE, ORDRE_GROUPES, REFERENTIELS, REGLES_VERSION, depuisControleCalque, evaluerPlan, rapport, regle, resultat };

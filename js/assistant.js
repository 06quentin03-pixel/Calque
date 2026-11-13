/* Calque — module « assistant » : où en est le projet, et que faire ensuite.
   JavaScript pur, sans accès à l'écran : testable avec Node. Le plan n'est jamais modifié.
   Ce n'est pas une intelligence artificielle : une liste d'étapes déduites du plan (dessin, électricité, tableau,
   contrôles, calculs, cheminements, chiffrage, dossier), chacune avec ce qui est fait et ce qui manque, comptée
   sur le plan. Aucune conformité n'est annoncée ici : l'étape « Contrôles » renvoie au rapport de contrôle.
   avancement(plan, ctx) : ctx.pieces { [niveau]: [{ nom }] } (pièces détectées), ctx.rapport { non_conforme, verification }
   (synthèse du moteur de règles) — fournis par l'écran ; sans eux, les étapes concernées sont « non évaluées ». */
import { NO_CIRCUIT, ALARM } from './elecdonnees.js';
import { bilanDuPlan } from './calcul.js';
import { cheminCircuit, tableauDu } from './cheminement.js';
import { chiffrer, quantitatif } from './quantitatif.js';

const pl = (n, s, p) => `${n} ${n > 1 ? p || s + 's' : s}`;
/* étape : { id, titre, etat: 'fait' | 'afaire' | 'attention' | 'attente' (dépend d'une étape précédente), detail, action (identifiant pour l'écran) } */
function avancement(plan, ctx) {
  const c = ctx || {}, E = [];
  const add = (id, titre, etat, detail, action) => E.push({ id, titre, etat, detail, action: action || null });
  const murs = (plan.walls || []).length, elec = plan.elec || [], circuits = plan.circuits || [];
  /* 1. bâtiment */
  const pieces = c.pieces ? Object.values(c.pieces).flat() : null;
  const sansNom = pieces ? pieces.filter((p) => /^Pièce \d+$/.test(p.nom || '')).length : 0;
  if (!murs) add('murs', 'Dessiner le bâtiment', 'afaire', 'Aucun mur : dessinez les pièces, ou importez un plan (image, PDF, DXF) ou une maquette IFC.', 'piece');
  else if (pieces && !pieces.length) add('murs', 'Dessiner le bâtiment', 'attention', `${pl(murs, 'mur')} mais aucune pièce fermée : les murs doivent se rejoindre pour former des pièces.`, 'plan');
  else add('murs', 'Dessiner le bâtiment', sansNom ? 'attention' : 'fait', `${pl(murs, 'mur')}${pieces ? `, ${pl(pieces.length, 'pièce')}` : ''}, ${pl((plan.levels || []).length, 'niveau', 'niveaux')}.${sansNom ? ` ${pl(sansNom, 'pièce')} sans nom : le tableau est généré d’après le nom des pièces (cuisine, salle de bain…).` : ''}`, sansNom ? 'plan' : null);
  /* fond de plan non mis à l'échelle */
  const fonds = (plan.fonds || []).filter((f) => !f.cal);
  if (fonds.length) add('fond', 'Mettre le fond de plan à l’échelle', 'attention', `${pl(fonds.length, 'fond')} de plan sans échelle réglée : les longueurs dessinées par-dessus seraient fausses.`, 'fond');
  /* 2. implantation électrique */
  const T = tableauDu(plan), app = elec.filter((e) => !['tableau', 'traversee', 'derivation', 'derivation_mur'].includes(e.type));
  if (!murs) add('elec', 'Implanter l’électricité', 'attente', 'Après le dessin du bâtiment.');
  else if (!app.length) add('elec', 'Implanter l’électricité', 'afaire', 'Aucun appareil : posez les prises, interrupteurs, points lumineux et le tableau (outil Électricité).', 'elec');
  else add('elec', 'Implanter l’électricité', T ? 'fait' : 'attention', `${pl(app.length, 'appareil')} posé${app.length > 1 ? 's' : ''}.${T ? '' : ' Le tableau électrique n’est pas posé sur le plan : il sert de départ aux circuits et aux longueurs.'}`, T ? null : 'elec');
  /* 3. tableau et circuits */
  const orph = elec.filter((e) => !NO_CIRCUIT.has(e.type) && !e.cid && !(ALARM.has(e.type) && e.type !== 'centrale'));
  if (!app.length) add('tableau', 'Générer le tableau électrique', 'attente', 'Après l’implantation des appareils.');
  else if (!circuits.length) add('tableau', 'Générer le tableau électrique', 'afaire', 'Aucun circuit : onglet Tableau électrique › « Générer depuis le plan ».', 'tableau');
  else add('tableau', 'Générer le tableau électrique', orph.length ? 'attention' : 'fait', `${pl(circuits.length, 'circuit')}, ${pl((plan.rcds || []).length, 'différentiel')}.${orph.length ? ` ${pl(orph.length, 'appareil')} sans circuit : « Relier les appareils sans circuit » les rattache sans modifier les circuits existants.` : ''}`, orph.length ? 'tableau' : null);
  /* 4. contrôles (jamais « conforme » ici : renvoi au rapport) */
  if (!circuits.length) add('controles', 'Voir le rapport de contrôle', 'attente', 'Après la génération du tableau.');
  else if (!c.rapport) add('controles', 'Voir le rapport de contrôle', 'afaire', 'Onglet Tableau électrique › Contrôle NF C 15-100.', 'controles');
  else add('controles', 'Voir le rapport de contrôle', c.rapport.non_conforme ? 'attention' : 'fait', c.rapport.non_conforme ? `${pl(c.rapport.non_conforme, 'point')} non conforme${c.rapport.non_conforme > 1 ? 's' : ''} à corriger, ${c.rapport.verification} à vérifier.` : `Aucun point non conforme relevé ; ${pl(c.rapport.verification, 'contrôle')} reste${c.rapport.verification > 1 ? 'nt' : ''} à vérifier (ce n’est pas une conformité globale).`, 'controles');
  /* 5. données de calcul */
  if (!circuits.length) add('calcul', 'Compléter les données de calcul', 'attente', 'Après la génération du tableau.');
  else {
    const b = bilanDuPlan(plan), sansP = b.lignes.filter((l) => l.P == null).length;
    const ks = !!(plan.install && plan.install.ks), res = !!(plan.install && plan.install.reseau);
    const manq = [sansP ? `puissance de ${pl(sansP, 'circuit')}` : '', ks ? '' : 'coefficient de simultanéité', res ? '' : 'type de réseau (monophasé ou triphasé)'].filter(Boolean);
    add('calcul', 'Compléter les données de calcul', manq.length ? 'afaire' : 'fait', manq.length ? `Manque : ${manq.join(', ')}. Une donnée absente n’est jamais remplacée : le bilan reste partiel.` : 'Puissances, réseau et coefficient de simultanéité renseignés : bilan de puissance complet.', 'bilan');
  }
  /* 6. cheminements */
  if (!circuits.length || !T) add('chemins', 'Tracer les cheminements', 'attente', T ? 'Après la génération du tableau.' : 'Après la pose du tableau sur le plan.');
  else {
    const avecPoints = circuits.filter((x) => elec.some((e) => e.cid === x.id && e.type !== 'traversee'));
    const inc = avecPoints.filter((x) => !cheminCircuit(plan, x.id).complet).length;
    add('chemins', 'Tracer les cheminements', inc ? 'afaire' : 'fait', inc ? `${pl(inc, 'circuit')} sur ${avecPoints.length} pas entièrement raccordé${inc > 1 ? 's' : ''} au tableau par les gaines : longueurs et câbles non comptés. « Raccorder les circuits incomplets » propose les gaines.` : `Les ${avecPoints.length} circuits sont raccordés au tableau par les gaines : longueurs mesurées sur le plan.`, 'chemins');
  }
  /* 7. chiffrage */
  if (!app.length) add('chiffrage', 'Chiffrer le quantitatif', 'attente', 'Après l’implantation des appareils.');
  else {
    const ch = chiffrer(quantitatif(plan, {}), plan.chiffrage);
    add('chiffrage', 'Chiffrer le quantitatif', ch.complet ? 'fait' : 'afaire', ch.complet ? `Les ${ch.lignes.length} lignes ont un prix.` : `${ch.chiffrees} ligne${ch.chiffrees > 1 ? 's' : ''} chiffrée${ch.chiffrees > 1 ? 's' : ''} sur ${ch.lignes.length} : le total est partiel. Les prix sont les vôtres (Calque n’en fournit pas).`, 'quantitatif');
  }
  /* 8. dossier */
  const d = plan.doc || {}, rev = (d.revisions || []).length;
  if (!circuits.length) add('dossier', 'Préparer le dossier PDF', 'attente', 'Après la génération du tableau.');
  else add('dossier', 'Préparer le dossier PDF', d.client && rev ? 'fait' : 'afaire', d.client && rev ? `Cartouche rempli, ${pl(rev, 'indice')} de révision.` : `${d.client ? '' : 'Cartouche à remplir (client, adresse, affaire). '}${rev ? '' : 'Aucun indice de révision : le dossier n’a pas encore été diffusé.'}`.trim(), 'dossier');
  /* suivi de chantier : pour information */
  const resv = ((plan.chantier || {}).reserves || []).filter((r) => r.statut !== 'levee').length;
  if (resv) add('chantier', 'Lever les réserves du chantier', 'attention', `${pl(resv, 'réserve')} non levée${resv > 1 ? 's' : ''}.`, 'chantier');
  const comptees = E.filter((e) => e.etat !== 'attente' && e.id !== 'chantier' && e.id !== 'fond');
  const suivante = E.find((e) => e.etat === 'afaire' || e.etat === 'attention') || null;
  return { etapes: E, faites: E.filter((e) => e.etat === 'fait').length, total: E.filter((e) => e.id !== 'chantier' && e.id !== 'fond').length, evaluees: comptees.length, suivante: suivante ? suivante.id : null };
}

export { avancement };

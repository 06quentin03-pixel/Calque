/* Calque — module « notechauffage » : note de calcul du chauffage, pièce par pièce (demande du 16 novembre 2026).
   JavaScript pur, sans accès à l'écran : testable avec Node. Le plan n'est jamais modifié.

   Méthode (inspirée de la NF EN 12831-1, simplifiée ; ce n'est PAS une étude thermique réglementaire RE2020 / DPE) :
     Φ pièce = Φ parois + Φ ponts thermiques + Φ air + Φ relance
       Φ parois    = Σ U × A × b × ΔT                         (thermique.js : deperditionsPiece)
       Φ ponts     = ΔUpt × A(enveloppe) × ΔT                 majoration forfaitaire
       Φ air       = 0,34 × n × V × ΔT                        n : renouvellement d'air (vol/h)
       Φ relance   = S × f_RH                                 f_RH : puissance de relance saisie (W/m²), facultative
   Puis la puissance de chauffage posée dans la pièce est comparée à Φ pièce. Aucune conformité n'est affichée : c'est
   une aide au dimensionnement, dont chaque donnée garde son statut (saisie, estimée, manquante).

   Donnée du plan (format v19) : install.frh { v, st, src } — puissance de relance (W/m²), saisie par l'utilisateur
   (aucune valeur par défaut : elle dépend du réduit de nuit et du temps de remise en température choisis). */
import { isNum } from './noyau.js';
import { DEF, arrondiConseil, bilanThermique, tExt } from './thermique.js';

const METHODE = [
  'Φ pièce = Φ parois + Φ ponts thermiques + Φ air + Φ relance',
  'Φ parois = Σ U × A × b × ΔT, avec U = 1 / (Rsi + Σ e/λ + Rse) (résistances superficielles de l’EN ISO 6946)',
  'Φ ponts thermiques = ΔUpt × A(enveloppe) × ΔT',
  'Φ air = 0,34 × n × V × ΔT (n : renouvellement d’air en vol/h, V : volume de la pièce)',
  'Φ relance = S × f_RH (f_RH : puissance de relance saisie, en W/m²)',
];
const AVERTISSEMENT = 'Note de dimensionnement établie par Calque selon une méthode simplifiée inspirée de la NF EN 12831-1. Ce n’est pas une étude thermique réglementaire (RE2020, DPE) : celle-ci exige un logiciel évalué et un professionnel qui signe l’attestation. Les valeurs « estimées » sont des ordres de grandeur à remplacer par celles de vos matériaux et de votre projet ; une donnée manquante rend le résultat « partiel ».';

/* puissance de relance (W/m²) saisie, ou null */
function relance(plan) { const x = plan && plan.install && plan.install.frh; return x && isNum(x.v) && x.v >= 0 ? x : null; }
/* puissance d'une pièce : relance ajoutée aux déperditions (sert aussi à la fiche de l'onglet Calculs) */
function puissancePiece({ phiT, phiPt, phiV, S, frh }) {
  const phiRH = frh != null ? S * frh : 0;
  return { phiRH, total: phiT + phiPt + phiV + phiRH };
}
const VERDICTS = {
  suffisant: 'Puissance posée suffisante',
  insuffisant: 'Puissance posée insuffisante',
  sans: 'Aucun chauffage posé',
  incalculable: 'Non calculable (donnée manquante)',
};

/* note complète. toutes : Map niveau → pièces (géométrie fournie par l'appelant : [{ label, loop, holes, area, poly }]) */
function noteChauffage(plan, toutes) {
  const te = tExt(plan), frh = relance(plan);
  const dupt = plan.install && plan.install.dupt && isNum(plan.install.dupt.v) ? plan.install.dupt : DEF.dupt;
  const niveaux = (plan.levels || []).slice().sort((a, b) => a.elev - b.elev);
  const manque = new Set(), estimees = new Set();
  if (!te) manque.add('température extérieure de base');
  const out = { te, frh, dupt, methode: METHODE, avertissement: AVERTISSEMENT, niveaux: [], total: 0, pose: 0, complet: true, nPieces: 0 };
  for (const L of niveaux) {
    const B = bilanThermique(plan, L.id, { toutes, te });
    const pieces = B.lignes.map((D) => {
      for (const m of D.manque) manque.add(`${D.piece.name} : ${m}`);
      for (const e of D.estimees) estimees.add(e);
      const phiRH = D.phiRH, total = D.total; // relance comprise (thermique.js)
      const pose = D.pose;
      const verdict = total == null ? 'incalculable' : !pose.n ? 'sans' : pose.p >= total ? 'suffisant' : 'insuffisant';
      return { nom: D.piece.name, id: D.piece.id, ti: D.ti, S: D.S, V: D.V, lignes: D.lignes, phiT: D.phiT, phiPt: D.phiPt, phiV: D.phiV, phiRH, total,
        parM2: total != null && D.S > 0 ? total / D.S : null, H: D.H, ach: D.ach, pose, verdict, manque: total != null ? Math.max(0, total - pose.p) : null,
        conseil: total != null ? arrondiConseil(total, pose.p) : null, statut: D.statut === 'partiel' ? 'partiel' : D.statut === 'saisie' && pose.saisi ? 'saisie' : 'estimee' };
    });
    const total = pieces.every((p) => p.total != null) ? pieces.reduce((s, p) => s + p.total, 0) : null;
    const pose = pieces.reduce((s, p) => s + p.pose.p, 0);
    if (total == null) out.complet = false;
    out.niveaux.push({ id: L.id, nom: L.name, pieces, total, pose });
    out.nPieces += pieces.length;
  }
  out.total = out.complet ? out.niveaux.reduce((s, n) => s + n.total, 0) : null;
  out.pose = out.niveaux.reduce((s, n) => s + n.pose, 0);
  if (!frh) estimees.add('Relance non comptée (puissance de relance non saisie)');
  out.manque = [...manque]; out.estimees = [...estimees];
  out.statut = out.manque.length ? 'partiel' : 'estimee'; // jamais « vérifiée » : méthode simplifiée
  out.aRevoir = out.niveaux.flatMap((n) => n.pieces.filter((p) => p.verdict === 'insuffisant' || p.verdict === 'sans').map((p) => ({ niveau: n.nom, nom: p.nom, verdict: p.verdict, manque: p.manque })));
  return out;
}

/* ---------------- nettoyage (migration v19) ---------------- */
function nettoyerV19(p) {
  const i = p && p.install;
  if (i && typeof i === 'object' && 'frh' in i) {
    const x = i.frh;
    if (x && typeof x === 'object' && isNum(x.v) && x.v >= 0 && x.v <= 300) i.frh = Object.assign({ v: x.v, st: ['saisie', 'estimee', 'verifiee'].includes(x.st) && x.st !== 'verifiee' ? x.st : 'saisie' }, typeof x.src === 'string' && x.src ? { src: x.src.slice(0, 200) } : {});
    else delete i.frh;
  }
  return p;
}

export { AVERTISSEMENT, METHODE, VERDICTS, noteChauffage, nettoyerV19, puissancePiece, relance };

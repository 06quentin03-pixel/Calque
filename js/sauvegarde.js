/* Calque — module « sauvegarde » : rappel de la sauvegarde complète (Menu › Sauvegarder tous mes plans).
   Sur iPad, Safari peut effacer les données d'un site peu utilisé, et un iPad peut être perdu ou remplacé : la seule
   copie sûre est le fichier de sauvegarde gardé dans Fichiers (iCloud Drive) ou envoyé ailleurs.
   Calque note la date de la dernière sauvegarde complète réussie (enregistrée ou envoyée) et rappelle d'en faire une
   quand des plans ont changé depuis plus de 7 jours, ou n'ont jamais été sauvegardés. « Plus tard » reporte de 3 jours.
   La décision (etatSauvegarde) est sans écran, testable avec Node ; le bandeau et l'enregistrement de la date sont
   dans rappelui (fonctions plus bas, appelées par demarrage.js et export.js). */

const JOUR = 864e5;
const DELAI = 7 * JOUR, REPORT = 3 * JOUR;

/* derniere : date de la dernière sauvegarde complète (ms) ou 0 ; report : rappel reporté jusqu'à (ms) ;
   plans : [{ savedAt }] (plans enregistrés sur l'appareil, plan d'exemple exclu) ; maintenant : ms */
function etatSauvegarde({ derniere, report, plans, maintenant }) {
  const d = derniere > 0 ? derniere : 0;
  const modifies = (plans || []).filter((p) => (p.savedAt || 0) > d).length;
  const age = d ? Math.floor((maintenant - d) / JOUR) : null;
  const out = { modifies, age, jamais: !d, rappel: false, texte: '' };
  if (!modifies) return out;
  if (d && maintenant - d < DELAI) return out;
  if (report && maintenant < report) return out;
  const pl = (n) => `${n} plan${n > 1 ? 's' : ''}`;
  out.rappel = true;
  out.texte = d
    ? `Dernière sauvegarde complète il y a ${age} jour${age > 1 ? 's' : ''} : ${pl(modifies)} modifié${modifies > 1 ? 's' : ''} depuis.`
    : `Aucune sauvegarde complète : ${pl(modifies)} ${modifies > 1 ? 'ne sont enregistrés' : 'n’est enregistré'} que sur cet appareil.`;
  return out;
}
/* texte court pour le menu */
function libelleDerniere(derniere, maintenant) {
  if (!(derniere > 0)) return 'jamais faite';
  const j = Math.floor((maintenant - derniere) / JOUR);
  return j <= 0 ? 'faite aujourd’hui' : j === 1 ? 'faite hier' : `il y a ${j} jours`;
}

export { DELAI, JOUR, REPORT, etatSauvegarde, libelleDerniere };

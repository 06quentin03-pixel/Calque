/* Calque — module « ecs » : chauffe-eau (eau chaude sanitaire). Choix du type, volume conseillé d'après le nombre de
   personnes, puissance d'un chauffe-eau instantané, temps de chauffe d'un ballon, circuit à prévoir.
   JavaScript pur, sans accès à l'écran : testable avec Node.

   Données (format v20) : symbole électrique de type TYPES_CE (ce_elec, ballon_thermo, ce_solaire, ce_instant, ce_chaudiere)
   e.ce = { pers (personnes), usage ('econome' | 'normal' | 'fort'), vol { v (L), st, src }, p { v (W), st, src },
            q (débit d'un instantané, L/min), dt (élévation de température, K), reseau ('mono' | 'tri') }

   IMPORTANT : les volumes conseillés sont des ORDRES DE GRANDEUR USUELS (« estimés »), pas des valeurs réglementaires
   ni des données de fabricant. Les puissances et temps de chauffe sont calculés par la physique de l'eau (1,163 Wh pour
   chauffer 1 litre de 1 °C). La fiche du fabricant fait foi. */
import { isNum } from './noyau.js';

const ORIGINE_VOL = 'Ordre de grandeur usuel proposé par Calque (estimé), à confirmer avec la fiche du fabricant et vos habitudes';
/* eau : 1 L ≈ 1 kg ; capacité thermique 4,185 kJ/kg·K = 1,163 Wh/L·K */
const CP_WH = 1.163, CP_KJ = 4.185;

const TYPES_CE = {
  ce_elec: { n: 'Électrique à accumulation (cumulus)', court: 'Accumulation', vol: true, elec: true, hc: true,
    pDef: 2200, pChoix: [1200, 1500, 1800, 2200, 2400, 3000],
    note: 'Ballon chauffé par une résistance, de préférence la nuit (heures creuses) : circuit dédié avec contacteur.' },
  ballon_thermo: { n: 'Thermodynamique (pompe à chaleur)', court: 'Thermodynamique', vol: true, elec: true, hc: false,
    pDef: 1800, pChoix: [800, 1200, 1500, 1800, 2400],
    note: 'Une petite pompe à chaleur chauffe l’eau en prenant les calories de l’air (local non chauffé d’au moins 20 m³ ou gaines vers l’extérieur), avec une résistance d’appoint. Chauffe plus lentement : ballon un peu plus grand.' },
  ce_solaire: { n: 'Solaire individuel (CESI, appoint électrique)', court: 'Solaire', vol: true, elec: true, hc: false, capteurs: true,
    pDef: 2400, pChoix: [1500, 2000, 2400, 3000],
    note: 'Capteurs solaires sur le toit et ballon à échangeur, avec un appoint (résistance électrique ou chaudière) pour les jours sans soleil.' },
  ce_instant: { n: 'Instantané électrique', court: 'Instantané', vol: false, elec: true, hc: false, instant: true,
    pDef: 6000, pChoix: [3500, 5500, 6500, 9000, 11000, 18000, 21000, 24000],
    note: 'Chauffe l’eau au moment où elle coule, sans réserve. Très forte puissance pour une douche (souvent en triphasé) : vérifier la puissance souscrite.' },
  ce_chaudiere: { n: 'Ballon relié à une chaudière (préparateur)', court: 'Sur chaudière', vol: true, elec: false, hc: false,
    pDef: 0, pChoix: [],
    note: 'Ballon à échangeur chauffé par la chaudière (gaz, fioul, bois, pompe à chaleur air-eau). Pas de circuit électrique dédié au ballon, sauf résistance d’appoint.' },
};
const USAGES = { econome: { n: 'Économe (douches courtes)', k: 0.8 }, normal: { n: 'Normal', k: 1 }, fort: { n: 'Important (bains, douches longues)', k: 1.3 } };
/* volume conseillé par nombre de personnes (1 à 6), en litres : ordres de grandeur usuels, estimés */
const VOL_PERS = {
  ce_elec: [75, 100, 150, 200, 250, 300],
  ballon_thermo: [100, 150, 200, 200, 270, 300],
  ce_solaire: [150, 150, 200, 300, 300, 400],
  ce_chaudiere: [75, 100, 120, 150, 200, 250],
};
const VOL_STD = [30, 50, 75, 100, 120, 150, 200, 250, 270, 300, 400, 500];
const estCE = (t) => Object.prototype.hasOwnProperty.call(TYPES_CE, t);

/* volume conseillé (L) : table par personne, × usage, arrondi au volume courant supérieur */
function volumeConseille(type, pers, usage) {
  const T = VOL_PERS[type]; if (!T) return null;
  const n = Math.max(1, Math.round(isNum(pers) ? pers : 4));
  const base = n <= T.length ? T[n - 1] : T[T.length - 1] + (n - T.length) * 50;
  const brut = base * (USAGES[usage] || USAGES.normal).k;
  const v = VOL_STD.find((x) => x >= brut - 1e-6) || Math.ceil(brut / 50) * 50;
  return { v, brut, base, st: 'estimee', src: ORIGINE_VOL };
}
/* capteurs solaires : environ 1 m² par personne (ordre de grandeur usuel, à adapter à la région et à l'inclinaison) */
function capteursConseilles(pers) { const n = Math.max(1, Math.round(isNum(pers) ? pers : 4)); return { v: Math.max(2, n), st: 'estimee', src: ORIGINE_VOL }; }
/* puissance d'un instantané : P (W) = débit (L/min) / 60 × 4,185 kJ/kg·K × ΔT × 1000 */
function puissanceInstantane(q, dt) { return isNum(q) && isNum(dt) && q > 0 && dt > 0 ? (q / 60) * CP_KJ * dt * 1000 : null; }
/* énergie pour chauffer un ballon (Wh) et temps de chauffe (h) avec une puissance P (W) */
function energieBallon(vol, dt) { return isNum(vol) && isNum(dt) && vol > 0 && dt > 0 ? vol * CP_WH * dt : null; }
function tempsChauffe(vol, dt, p) { const E = energieBallon(vol, dt); return E && isNum(p) && p > 0 ? E / p : null; }

/* circuit conseillé : intensité, calibre et section (valeurs du contrôle de Calque, estimées) */
const CALS_CE = [16, 20, 25, 32, 40, 50, 63];
const SEC_CAL = [[1.5, 16], [2.5, 20], [4, 25], [6, 32], [10, 40], [16, 63]]; // section → calibre maximal (SEC_MAX de Calque)
function circuitConseille(p, reseau) {
  if (!isNum(p) || p <= 0) return null;
  const tri = reseau === 'tri', I = tri ? p / (Math.sqrt(3) * 400) : p / 230;
  const cal = CALS_CE.find((c) => c >= I - 1e-9) || null;
  const s = cal ? (SEC_CAL.find(([, cmax]) => cmax >= cal) || [null])[0] : null;
  return { I, cal, sec: s, tri, st: 'estimee', src: 'Calcul IB = P / U (cos φ = 1) ; calibre et section d’après les valeurs du contrôle de Calque, à vérifier (longueur, mode de pose)' };
}

/* résumé d'un chauffe-eau posé sur le plan */
function resumeCE(e) {
  const T = TYPES_CE[e && e.type]; if (!T) return null;
  const ce = (e.ce && typeof e.ce === 'object') ? e.ce : {};
  const pers = isNum(ce.pers) ? ce.pers : 4, usage = USAGES[ce.usage] ? ce.usage : 'normal';
  const conseil = T.vol ? volumeConseille(e.type, pers, usage) : null;
  const vol = ce.vol && isNum(ce.vol.v) ? ce.vol : null;
  const p = ce.p && isNum(ce.p.v) ? ce.p : (T.pDef ? { v: T.pDef, st: 'estimee', src: 'Puissance courante proposée par Calque, à remplacer par celle de l’appareil' } : null);
  const out = { type: e.type, T, pers, usage, conseil, vol, p };
  if (T.instant) {
    const q = isNum(ce.q) ? ce.q : 8, dt = isNum(ce.dt) ? ce.dt : 30;
    out.q = q; out.dt = dt; out.pNecessaire = puissanceInstantane(q, dt);
  } else if (T.vol && p && p.v > 0) {
    const v = (vol || conseil || {}).v;
    out.tChauffe = tempsChauffe(v, 45, p.v); // de 10 °C à 55 °C
  }
  if (T.capteurs) out.capteurs = capteursConseilles(pers);
  if (T.elec && p && p.v > 0) out.circuit = circuitConseille(p.v, ce.reseau);
  return out;
}

/* nettoyage (migration v20, ouverture d'un plan) */
function nettoyerCE(e) {
  if (!e || typeof e !== 'object' || !('ce' in e)) return e;
  const c = e.ce;
  if (!estCE(e.type) || !c || typeof c !== 'object' || Array.isArray(c)) { delete e.ce; return e; }
  const o = {};
  if (isNum(c.pers) && c.pers >= 1 && c.pers <= 50) o.pers = Math.round(c.pers);
  if (USAGES[c.usage]) o.usage = c.usage;
  const don = (d, max) => (d && isNum(d.v) && d.v > 0 && d.v <= max ? Object.assign({ v: d.v, st: ['verifiee', 'saisie', 'estimee'].includes(d.st) && (d.st !== 'verifiee' || d.src) ? d.st : 'saisie' }, d.src ? { src: String(d.src).slice(0, 300) } : {}) : null);
  const vol = don(c.vol, 5000), p = don(c.p, 60000);
  if (vol) o.vol = vol; if (p) o.p = p;
  if (isNum(c.q) && c.q > 0 && c.q <= 100) o.q = c.q;
  if (isNum(c.dt) && c.dt > 0 && c.dt <= 80) o.dt = c.dt;
  if (c.reseau === 'tri') o.reseau = 'tri';
  if (Object.keys(o).length) e.ce = o; else delete e.ce;
  return e;
}

export { CP_KJ, CP_WH, ORIGINE_VOL, TYPES_CE, USAGES, VOL_PERS, VOL_STD, capteursConseilles, circuitConseille, energieBallon, estCE, nettoyerCE,
  puissanceInstantane, resumeCE, tempsChauffe, volumeConseille };

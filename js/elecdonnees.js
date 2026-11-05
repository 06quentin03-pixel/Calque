/* Calque — module « données électriques » : classement des symboles, types de circuits, valeurs du tableau.
   Partie SANS ÉCRAN, sortie de electricite.js (phase 3) pour servir au moteur de calcul et aux tests Node.
   electricite.js réexporte tout ce module : les autres modules ne changent pas.
   Attention : les valeurs « normatives » ci-dessous (SEC_MAX, HEAT_MAX, points et socles par circuit…) sont celles
   du contrôle existant de Calque. Leur source n'a pas encore été vérifiée sur les extraits Legrand de la NF C 15-100 :
   le moteur de calcul les présente comme « estimées » (voir normes.js). */
import { isNum } from './noyau.js';

const LIGHTS = new Set(['pl', 'applique', 'spot', 'reglette', 'led', 'hublot', 'projecteur', 'proj_det', 'borne_ext', 'dalle_led', 'rail_spot', 'miroir', 'veilleuse', 'suspension', 'plafonnier', 'spot_orient', 'encastre_sol', 'balise_marche', 'applique_ext', 'eclairage_placard', 'spot_jardin']);
const SPOTLIKE = new Set(['spot', 'led', 'rail_spot']);
const CMDS = new Set(['int_s', 'int_d', 'int_vv', 'bp', 'var', 'det_pres', 'int_bip', 'int_voy', 'permut', 'bp_voy', 'int_radio', 'int_ip', 'det_plaf', 'int_crep', 'horloge', 'bouton_scen', 'int_triple', 'vv_double', 'int_tempo', 'int_cle', 'int_tirette']);
const CMDS_FREE_H = new Set(['det_pres', 'det_plaf', 'int_crep']); // détecteurs : posés en hauteur, hors règle 0,90–1,30 m
const SOCKETS = { pc: 1, pc2: 2, pc3: 3, pc4: 4, pc_pt: 1, pc_cmd: 1, pc_ip: 1, pc_usb: 1, pc_2p: 1, pc_hotte: 1, pc_sol: 1, pc_inter: 1, pc_escam: 3, pc_jardin: 1, pc_frigo: 1, pc_mo: 1 };
/* sorties dédiées à un appareil (circuit spécialisé) */
const DEDIC = { pc_ll: 'lave_linge', pc_lv: 'lave_vaisselle', pc_sl: 'seche_linge', pc_four: 'four', pc_cg: 'congelateur', poele_granules: 'specialise' };
const isSpecOutlet = (t) => t === 'pc20' || t in DEDIC;
const ALARM = new Set(['centrale', 'clavier', 'det_ir', 'det_ouv', 'sirene', 'sirene_ext', 'det_bris', 'transmetteur', 'barriere_ir']);
const ACCESS = new Set(['sonnette', 'interphone', 'platine', 'gache', 'digicode', 'badge', 'serrure']);
const AUTONOMOUS = new Set(['daaf', 'det_co', 'det_gaz', 'det_fuite', 'det_chaleur']);
const COMM_OUTLETS = new Set(['tv', 'rj45', 'rj45_2', 'sat', 'fibre', 'hdmi', 'rj45_tv']);
const LIGHT_ACC = new Set(['baes', 'extracteur', 'ventilo', 'transfo', 'pc_rasoir']); // rattachés à l'éclairage de la pièce
const LINK_TARGETS = new Set([...LIGHTS, 'pc_cmd', 'extracteur', 'ventilo']);
const NO_CIRCUIT = new Set(['daaf', 'camera', 'thermostat', 'derivation', 'traversee', 'compteur', 'db', 'tableau', 'tv', 'rj45', 'rj45_2', 'sat', 'fibre', 'tel', 'hdmi', 'hp', 'wifi', 'terre', 'les', 'gtl', 'ccpi', 'panneau_pv', 'batterie', 'groupe', 'inverseur', 'det_co', 'det_gaz', 'det_fuite', 'arret_urg', 'camera_dome', 'nvr', 'rj45_tv', 'antenne', 'parabole', 'box', 'baie', 'repart_tv', 'telerupteur', 'minuterie', 'contacteur_hc', 'parafoudre', 'delesteur', 'gest_energie', 'sous_compteur', 'sonde_ext', 'prog_fp', 'vmc_insuff', 'entree_air', 'sortie_toit', 'prise_air_neuf', 'plenum', 'capteur_vent', 'det_chaleur', 'declencheur', 'ev_gaz']);
const SEC_MAX = { 1.5: 16, 2.5: 20, 4: 25, 6: 32, 10: 40, 16: 63 };
const CALS = [2, 10, 16, 20, 25, 32, 40];
const SECS = [1.5, 2.5, 4, 6, 10, 16];
const HEAT_MAX = { 10: 2250, 16: 3500, 20: 4500, 25: 5750, 32: 7250 };
const SPEC = ['lave_linge', 'lave_vaisselle', 'seche_linge', 'four', 'congelateur', 'specialise'];
const CK = {
  eclairage: { n: 'Éclairage', sec: 1.5, cal: 16, unit: 'pt' },
  prises: { n: 'Prises de courant', sec: 2.5, cal: 20, unit: 'socle' },
  prises_cuisine: { n: 'Prises cuisine', sec: 2.5, cal: 20, unit: 'socle' },
  cuisson: { n: 'Plaque de cuisson', sec: 6, cal: 32, unit: 'app', typeA: true },
  lave_linge: { n: 'Lave-linge', sec: 2.5, cal: 20, unit: 'app', typeA: true, spec: true },
  lave_vaisselle: { n: 'Lave-vaisselle', sec: 2.5, cal: 20, unit: 'app', spec: true },
  /* type A : extrait Legrand NF C 15-100 (révision 2024), p. 13 « Bien choisir son interrupteur différentiel » */
  seche_linge: { n: 'Sèche-linge', sec: 2.5, cal: 20, unit: 'app', typeA: true, spec: true },
  four: { n: 'Four', sec: 2.5, cal: 20, unit: 'app', spec: true },
  congelateur: { n: 'Congélateur', sec: 2.5, cal: 20, unit: 'app', spec: true },
  specialise: { n: 'Circuit spécialisé', sec: 2.5, cal: 20, unit: 'app', spec: true },
  chauffe_eau: { n: 'Chauffe-eau', sec: 2.5, cal: 20, unit: 'app', full: true, ctrl: 'contacteur' },
  chauffage: { n: 'Chauffage', sec: 2.5, cal: 20, unit: 'W', full: true },
  pac: { n: 'Pompe à chaleur / climatisation', sec: 4, cal: 25, unit: 'app', typeA: true, full: true },
  vmc: { n: 'VMC', sec: 1.5, cal: 2, unit: 'none' },
  volets: { n: 'Volets roulants', sec: 1.5, cal: 16, unit: 'none' },
  motorisation: { n: 'Motorisations', sec: 1.5, cal: 16, unit: 'none' },
  hotte: { n: 'Hotte', sec: 2.5, cal: 20, unit: 'app' },
  irve: { n: 'Borne de recharge (IRVE)', sec: 10, cal: 40, unit: 'app', typeA: true, full: true, ownRcd: true },
  communication: { n: 'Coffret de communication', sec: 1.5, cal: 16, unit: 'none' },
  alarme: { n: 'Alarme', sec: 1.5, cal: 10, unit: 'none' },
  sonnette: { n: 'Sonnette / interphone', sec: 1.5, cal: 2, unit: 'none' },
  autre: { n: 'Autre circuit', sec: 1.5, cal: 16, unit: 'none' },
};
const KIND_ORDER = Object.keys(CK);
const ACCEPT = {
  eclairage: (t) => LIGHTS.has(t) || CMDS.has(t) || LIGHT_ACC.has(t),
  prises: (t) => t in SOCKETS || t === 'com' || t === 'pc_rasoir',
  prises_cuisine: (t) => t in SOCKETS,
  cuisson: (t) => t === 'pc32' || t === 'sortie',
  chauffe_eau: (t) => t === 'sortie' || t === 'ce_elec' || t === 'ballon_thermo',
  chauffage: (t) => t === 'rad_elec' || t === 'seche_serv_e' || t === 'thermostat' || t === 'plancher' || t === 'soufflant_sdb',
  pac: (t) => t === 'pac' || t === 'clim' || t === 'pac_int' || t === 'sortie',
  vmc: (t) => t === 'vmc' || t === 'vmc_groupe' || t === 'vmc_df' || t === 'extracteur' || t === 'sortie',
  volets: (t) => t === 'cmd_vr' || t === 'cmd_vr_c' || t === 'volet_mot' || t === 'velux_mot' || t === 'volet_bat' || t === 'sortie',
  motorisation: (t) => ['portail', 'garage_mot', 'store', 'moteur', 'volet_mot', 'arrosage', 'pergola', 'sortie'].includes(t),
  irve: (t) => t === 'borne_ve' || t === 'prise_ve',
  communication: (t) => t === 'com' || t === 'domo' || t === 'pc' || t === 'pc2',
  alarme: (t) => ALARM.has(t),
  sonnette: (t) => ACCESS.has(t),
  hotte: (t) => t === 'sortie' || t === 'pc20' || t === 'pc' || t === 'pc_hotte',
  autre: (t) => !NO_CIRCUIT.has(t),
};
for (const k of SPEC) ACCEPT[k] = (t) => t === 'pc20' || t === 'sortie' || t === 'pc' || t === 'pc_tri' || DEDIC[t] === k || (k === 'specialise' && t in DEDIC);
const accepts = (kind, t) => (ACCEPT[kind] ? ACCEPT[kind](t) : false);
function defaultKindFor(t) {
  if (LIGHTS.has(t) || CMDS.has(t) || (LIGHT_ACC.has(t) && t !== 'pc_rasoir')) return 'eclairage';
  if (t === 'pc_pt' || t === 'pc_escam' || t === 'pc_frigo' || t === 'pc_mo') return 'prises_cuisine';
  if (t in DEDIC) return DEDIC[t];
  if (t in SOCKETS || t === 'pc_rasoir') return 'prises';
  if (t === 'pc32') return 'cuisson';
  if (t === 'pc20') return 'specialise';
  if (t === 'ce_elec' || t === 'ballon_thermo') return 'chauffe_eau';
  if (t === 'rad_elec' || t === 'seche_serv_e' || t === 'thermostat' || t === 'plancher' || t === 'soufflant_sdb') return 'chauffage';
  if (t === 'pac' || t === 'clim' || t === 'pac_int') return 'pac';
  if (t === 'vmc' || t === 'vmc_groupe' || t === 'vmc_df') return 'vmc';
  if (t === 'cmd_vr' || t === 'cmd_vr_c' || t === 'volet_mot' || t === 'velux_mot' || t === 'volet_bat') return 'volets';
  if (t === 'portail' || t === 'garage_mot' || t === 'store' || t === 'arrosage' || t === 'pergola') return 'motorisation';
  if (t === 'borne_ve' || t === 'prise_ve') return 'irve';
  if (t === 'com' || t === 'domo') return 'communication';
  if (ALARM.has(t)) return 'alarme';
  if (ACCESS.has(t)) return 'sonnette';
  if (NO_CIRCUIT.has(t)) return null;
  return 'autre';
}

/* ---------------- installation et protections ---------------- */
function defaultInstall() { return { kva: 9, parafoudre: false, row: 13 }; }
function agcpOf(kva) { return { 3: [15, 15], 6: [15, 30], 9: [15, 45], 12: [30, 60] }[kva] || [15, 45]; }
function agcpLabel(kva) { const [lo, set] = agcpOf(kva); return lo === 15 ? `15/45 A réglé à ${set} A` : `30/60 A réglé à ${set} A`; }
function circLoad(c) { const k = CK[c.kind] || CK.autre; return (k.full ? 1 : 0.5) * (c.cal || 0); }

/* ---------------- puissance des symboles ---------------- */
/* puissances par défaut utilisées par le tableau (comptage du chauffage, des spots) : valeurs ESTIMÉES */
const POWER_DEFAULT = { rad_elec: 1500, seche_serv_e: 500, spot: 10, led: 20, rail_spot: 40, plancher: 1000, soufflant_sdb: 2000 };
function elecPower(e) {
  if (isNum(e.p) && e.p > 0) return e.p;
  return POWER_DEFAULT[e.type] || 0;
}
/* même valeur, avec son statut : saisie (champ « Puissance » de l'inspecteur), estimée (valeur par défaut) ou absente (null) */
function puissanceSymbole(e) {
  if (isNum(e.p) && e.p > 0) return { v: e.p, st: 'saisie', src: 'Puissance saisie sur le symbole' };
  if (POWER_DEFAULT[e.type]) return { v: POWER_DEFAULT[e.type], st: 'estimee', src: 'Valeur par défaut de Calque pour ce symbole' };
  return null;
}

export { ACCEPT, ACCESS, ALARM, AUTONOMOUS, CALS, CK, CMDS, CMDS_FREE_H, COMM_OUTLETS, DEDIC, HEAT_MAX, KIND_ORDER,
  LIGHTS, LIGHT_ACC, LINK_TARGETS, NO_CIRCUIT, POWER_DEFAULT, SECS, SEC_MAX, SOCKETS, SPEC, SPOTLIKE, accepts, agcpLabel,
  agcpOf, circLoad, defaultInstall, defaultKindFor, elecPower, isSpecOutlet, puissanceSymbole };

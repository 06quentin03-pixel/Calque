/* Calque — module « calcul » : moteur de calcul électrique.
   JavaScript pur, SANS ÉCRAN (aucun accès au DOM), testable avec Node : node --test tests/calcul.test.mjs

   Principes (règles de l'utilisateur) :
   - aucune valeur devinée en silence : chaque donnée porte un statut « vérifiée », « saisie » ou « estimée »
     et son origine ; une donnée absente est signalée dans « données manquantes » et le résultat n'est pas calculé ;
   - trois statuts de contrôle seulement : conforme, non conforme, vérification nécessaire ;
     un circuit n'est jamais « conforme » si un de ses contrôles n'a pas pu être vérifié ;
   - les tableaux de la NF C 15-100 viennent des extraits Legrand (normes.js) : tant qu'ils manquent,
     les contrôles qui en dépendent restent « vérification nécessaire ».

   Unités : W, var, VA, V, A, m, mm², Ω·mm²/m, Ω/m. */
import { CK, CMDS, SEC_MAX, puissanceSymbole } from './elecdonnees.js';
import { CONSTANTES, REGLES, TABLE_BY, tableDisponible } from './normes.js';

/* ---------------- données marquées ---------------- */
const STATUTS = ['verifiee', 'saisie', 'estimee'];
const LIB_STATUT = { verifiee: 'Vérifiée', saisie: 'Saisie', estimee: 'Estimée' };
const QUALITE = { verifiee: 0, saisie: 1, estimee: 2 };
const fini = (x) => typeof x === 'number' && Number.isFinite(x);
/* une donnée : { v, st, src }. « vérifiée » exige une source, sinon elle redevient « saisie » */
function donnee(v, st, src) {
  if (!fini(v) && typeof v !== 'string') return null;
  const s = String(src == null ? '' : src).trim();
  let statut = STATUTS.includes(st) ? st : 'saisie';
  if (statut === 'verifiee' && !s) statut = 'saisie';
  return { v, st: statut, src: s };
}
/* lecture d'une donnée enregistrée dans le plan (nombre seul = saisie) ; null si absente ou invalide */
function lireDonnee(x, ok) {
  const d = typeof x === 'number' ? donnee(x, 'saisie', '') : x && typeof x === 'object' ? donnee(x.v, x.st, x.src) : null;
  if (!d) return null;
  if (ok && !ok(d.v)) return null;
  return d;
}
/* statut d'un résultat calculé à partir de plusieurs données : le moins sûr l'emporte */
function statutDe(...ds) {
  let worst = 'verifiee';
  for (const d of ds.flat()) { const st = d && d.st; if (st && QUALITE[st] > QUALITE[worst]) worst = st; }
  return worst;
}

/* ---------------- statuts de contrôle ---------------- */
const CONF = { conforme: 'Conforme', non_conforme: 'Non conforme', verification: 'Vérification nécessaire' };
function statutGlobal(controles) {
  if (!controles.length) return 'verification';
  if (controles.some((c) => c.statut === 'non_conforme')) return 'non_conforme';
  if (controles.some((c) => c.statut !== 'conforme')) return 'verification';
  return 'conforme';
}

/* ---------------- formules ---------------- */
const SQRT3 = Math.sqrt(3);
const cosOk = (c) => fini(c) && c > 0 && c <= 1;
/* intensité en monophasé : I = P / (U0 × cos φ) */
function courantMono(P, U0, cos) { return fini(P) && P >= 0 && fini(U0) && U0 > 0 && cosOk(cos) ? P / (U0 * cos) : NaN; }
/* intensité en triphasé équilibré : I = P / (√3 × U × cos φ) */
function courantTri(P, U, cos) { return fini(P) && P >= 0 && fini(U) && U > 0 && cosOk(cos) ? P / (SQRT3 * U * cos) : NaN; }
/* puissances à partir de P et cos φ : S = P / cos φ ; Q = S × sin φ = P × tan φ */
function puissances(P, cos) {
  if (!fini(P) || P < 0 || !cosOk(cos)) return null;
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos)), S = P / cos;
  return { P, Q: S * sin, S, cos, sin, tan: sin / cos };
}
/* puissance apparente à partir de l'intensité : S = U0 × I (mono) ; S = √3 × U × I (tri) */
function apparenteMono(U0, I) { return fini(U0) && fini(I) ? U0 * I : NaN; }
function apparenteTri(U, I) { return fini(U) && fini(I) ? SQRT3 * U * I : NaN; }
/* facteur de puissance : cos φ = P / S, ou P / √(P² + Q²) */
function cosPhi(P, S) { return fini(P) && fini(S) && S > 0 && P >= 0 && P <= S * (1 + 1e-12) ? Math.min(1, P / S) : NaN; }
function cosPhiPQ(P, Q) { const S = Math.hypot(P, Q); return fini(P) && fini(Q) && S > 0 && P >= 0 ? P / S : NaN; }
/* chute de tension : ΔU = b × (ρ × L / S × cos φ + λ × L × sin φ) × IB ; ΔU % = 100 × ΔU / U0
   b = 2 en monophasé (aller et retour), 1 en triphasé équilibré */
function chuteTension({ b, rho, L, S, cos, lambda, I, U0 }) {
  if (![b, rho, L, S, lambda, I, U0].every(fini) || !cosOk(cos) || S <= 0 || L < 0 || I < 0 || U0 <= 0) return null;
  const sin = Math.sqrt(Math.max(0, 1 - cos * cos));
  const dU = b * (rho * L / S * cos + lambda * L * sin) * I;
  return { dU, pct: 100 * dU / U0 };
}
/* bilan : somme des puissances actives et réactives, S = √(ΣP² + ΣQ²) (pas la somme des S) ; ks facultatif */
function bilanPuissance(lignes, ks) {
  let P = 0, Q = 0;
  for (const l of lignes) { P += l.P; Q += l.Q; }
  const S = Math.hypot(P, Q);
  const k = fini(ks) && ks > 0 ? ks : null;
  return { P, Q, S, cos: S > 0 ? P / S : NaN, ks: k, Pappelee: k ? P * k : null, Sappelee: k ? S * k : null };
}
/* équilibrage : déséquilibre = (I max − I moyen) / I moyen × 100 */
function equilibrage(ch) {
  const v = [ch.L1 || 0, ch.L2 || 0, ch.L3 || 0];
  const moy = (v[0] + v[1] + v[2]) / 3, max = Math.max(...v), min = Math.min(...v);
  return { L1: v[0], L2: v[1], L3: v[2], moyenne: moy, max, min, ecart: max - min, desequilibre: moy > 0 ? (max - moy) / moy * 100 : 0 };
}
/* répartition proposée : du plus fort au plus faible courant, chaque circuit sur la phase la moins chargée */
function repartirPhases(items, base) {
  const ch = { L1: 0, L2: 0, L3: 0, ...(base || {}) };
  const phases = {};
  const list = items.filter((x) => fini(x.I) && x.I >= 0).slice().sort((a, b) => b.I - a.I || String(a.id).localeCompare(String(b.id)));
  for (const x of list) {
    const ph = ['L1', 'L2', 'L3'].reduce((best, p) => (ch[p] < ch[best] - 1e-9 ? p : best), 'L1');
    phases[x.id] = ph; ch[ph] += x.I;
  }
  return { phases, charges: ch };
}

/* ---------------- mise en forme (pour les formules affichées) ---------------- */
const nf = (d) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
function fmt(x, d = 2) { return fini(x) ? nf(d).format(x) : '—'; }

/* ---------------- fiche de calcul d'un circuit ----------------
   entrée (préparée par entreesDuPlan, ou à la main dans les tests) :
   { nom, kind, reseau, phase, P, Pdetail, cos, L, sec, In, mat, U0, U, rho, lambda, secMaxCalque }
   chaque valeur est une donnée { v, st, src } ou null (absente). */
const MAT_NOM = { cu: 'cuivre', al: 'aluminium' };
function ficheCircuit(e) {
  const U0 = e.U0 || CONSTANTES.U0, U = e.U || CONSTANTES.U, lambda = e.lambda || CONSTANTES.lambda;
  const mat = e.mat || { v: 'cu', st: 'estimee', src: 'Non précisé : cuivre (usage courant en logement)' };
  const rho = e.rho || (mat.v === 'al' ? CONSTANTES.rho_al : CONSTANTES.rho_cu);
  const reseau = e.reseau || { v: 'mono', st: 'estimee', src: 'Non précisé : monophasé' };
  const tri = !!(e.phase && e.phase.v === 'tri');
  const out = { nom: e.nom, hypotheses: [], formules: [], donnees: [], manquantes: [], alertes: [], controles: [], resultats: {} };
  const D = (nom, d, unite, aff) => out.donnees.push({ nom, v: d ? d.v : null, aff: d ? (aff ? aff(d.v) : fmt(d.v, 4)) : null, unite, st: d ? d.st : null, src: d ? d.src : '' });
  const M = (nom, pourquoi) => out.manquantes.push({ nom, pourquoi });
  const A = (niveau, texte) => out.alertes.push({ niveau, texte });
  const F = (nom, expr, appli, res, unite, st) => out.formules.push({ nom, expr, appli, res, unite, st });
  const R = (k, v, st) => { out.resultats[k] = { v, st }; };

  /* données utilisées */
  D('Réseau', reseau, '', (v) => (v === 'tri' ? 'triphasé' : 'monophasé'));
  D('Raccordement', e.phase, '', (v) => (v === 'tri' ? 'triphasé (3 phases)' : 'phase ' + v));
  D('Puissance active P', e.P, 'W', (v) => fmt(v, 0));
  D('Facteur de puissance cos φ', e.cos, '', (v) => fmt(v, 3));
  D('Longueur du câble L', e.L, 'm', (v) => fmt(v, 1));
  D('Section S', e.sec, 'mm²', (v) => fmt(v, 1));
  D('Calibre de la protection In', e.In, 'A', (v) => fmt(v, 0));
  D('Métal des conducteurs', mat, '', (v) => MAT_NOM[v] || v);
  D(tri ? 'Tension entre phases U' : 'Tension phase-neutre U0', tri ? U : U0, 'V', (v) => fmt(v, 0));
  if (tri) D('Tension phase-neutre U0', U0, 'V', (v) => fmt(v, 0));
  D('Résistivité ρ (service normal)', rho, 'Ω·mm²/m', (v) => fmt(v, 4));
  D('Réactance linéique λ', lambda, 'Ω/m', (v) => fmt(v, 5));

  /* hypothèses */
  out.hypotheses.push(`Tension nominale ${fmt(U0.v, 0)} V entre phase et neutre${reseau.v === 'tri' ? `, ${fmt(U.v, 0)} V entre phases` : ''} (valeur estimée : la tension réelle du réseau peut varier).`);
  if (reseau.st !== 'saisie' && reseau.st !== 'verifiee') out.hypotheses.push(`Type de réseau non précisé : ${reseau.v === 'tri' ? 'triphasé' : 'monophasé'} retenu (${reseau.src}).`);
  out.hypotheses.push('Régime permanent, toute la puissance du circuit est supposée appelée en même temps et placée au bout du câble (calcul défavorable).');
  if (tri) out.hypotheses.push('Charge triphasée supposée équilibrée sur les trois phases.');
  out.hypotheses.push('La chute de tension calculée ne concerne que ce circuit, depuis le tableau. La limite s’applique depuis l’origine de l’installation : la chute de tension en amont (branchement, liaison jusqu’au tableau) doit y être ajoutée.');
  if (mat.st === 'estimee') out.hypotheses.push(`Métal non précisé : ${MAT_NOM[mat.v]} retenu.`);

  /* données manquantes */
  if (!e.P) M('Puissance active P', e.Pdetail && e.Pdetail.raison ? e.Pdetail.raison : 'Indiquez la puissance prévue du circuit.');
  if (!e.cos) M('Facteur de puissance cos φ', 'Indiquez le cos φ des appareils (1 pour une charge résistive ; voir la notice ou la plaque signalétique).');
  if (!e.L) M('Longueur du câble L', 'Indiquez la longueur du câble entre le tableau et le point le plus éloigné.');
  if (reseau.v === 'tri' && !e.phase) M('Phase de raccordement', 'En triphasé, indiquez la phase (L1, L2, L3) du circuit pour l’équilibrage.');
  if (tri && reseau.v !== 'tri') A('bad', 'Circuit triphasé sur une installation monophasée : précisez le réseau de l’installation ou le raccordement du circuit.');
  if (e.Pdetail && e.Pdetail.estimees) A('info', `Puissance calculée avec ${e.Pdetail.estimees} valeur${e.Pdetail.estimees > 1 ? 's' : ''} par défaut de Calque (estimée${e.Pdetail.estimees > 1 ? 's' : ''}) : vérifiez la puissance réelle des appareils.`);

  /* intensité d'emploi IB et puissances */
  let IB = NaN;
  const pw = e.P && e.cos ? puissances(e.P.v, e.cos.v) : null;
  if (pw && !(tri && reseau.v !== 'tri')) {
    const st = statutDe(e.P, e.cos, tri ? U : U0);
    if (tri) {
      IB = courantTri(e.P.v, U.v, e.cos.v);
      F('Intensité d’emploi (triphasé)', 'IB = P / (√3 × U × cos φ)', `IB = ${fmt(e.P.v, 0)} / (√3 × ${fmt(U.v, 0)} × ${fmt(e.cos.v, 3)})`, IB, 'A', st);
    } else {
      IB = courantMono(e.P.v, U0.v, e.cos.v);
      F('Intensité d’emploi (monophasé)', 'IB = P / (U0 × cos φ)', `IB = ${fmt(e.P.v, 0)} / (${fmt(U0.v, 0)} × ${fmt(e.cos.v, 3)})`, IB, 'A', st);
    }
    F('Puissance apparente', 'S = P / cos φ', `S = ${fmt(e.P.v, 0)} / ${fmt(e.cos.v, 3)}`, pw.S, 'VA', statutDe(e.P, e.cos));
    F('Puissance réactive', 'Q = S × sin φ', `Q = ${fmt(pw.S, 1)} × ${fmt(pw.sin, 3)}`, pw.Q, 'var', statutDe(e.P, e.cos));
    R('IB', IB, st); R('P', pw.P, statutDe(e.P)); R('Q', pw.Q, statutDe(e.P, e.cos)); R('S', pw.S, statutDe(e.P, e.cos)); R('cos', pw.cos, statutDe(e.cos));
  }

  /* chute de tension */
  let dU = null;
  if (fini(IB) && e.L && e.sec && e.sec.v > 0) {
    const b = tri ? 1 : 2;
    dU = chuteTension({ b, rho: rho.v, L: e.L.v, S: e.sec.v, cos: e.cos.v, lambda: lambda.v, I: IB, U0: U0.v });
    const st = statutDe(e.P, e.cos, e.L, e.sec, rho, lambda, U0);
    F('Chute de tension', 'ΔU = b × (ρ × L / S × cos φ + λ × L × sin φ) × IB', `ΔU = ${b} × (${fmt(rho.v, 4)} × ${fmt(e.L.v, 1)} / ${fmt(e.sec.v, 1)} × ${fmt(e.cos.v, 3)} + ${fmt(lambda.v, 5)} × ${fmt(e.L.v, 1)} × ${fmt(pw.sin, 3)}) × ${fmt(IB, 2)}   (b = ${b} en ${tri ? 'triphasé' : 'monophasé'})`, dU.dU, 'V', st);
    F('Chute de tension relative', 'ΔU % = 100 × ΔU / U0', `ΔU % = 100 × ${fmt(dU.dU, 2)} / ${fmt(U0.v, 0)}`, dU.pct, '%', st);
    R('dU', dU.dU, st); R('dUpct', dU.pct, st);
  }

  /* contrôles */
  const C = (id, statut, detail, extra) => { const r = REGLES[id]; out.controles.push({ id, nom: r.nom, source: r.source, edition: r.edition, statut, detail, ...(extra || {}) }); };
  const manque = (tables) => tables.filter((t) => !tableDisponible(t)).map((t) => TABLE_BY.get(t).titre);
  // IB ≤ In
  if (fini(IB) && e.In) {
    if (IB <= e.In.v + 1e-9) C('ib_in', 'conforme', `IB = ${fmt(IB, 2)} A ≤ In = ${fmt(e.In.v, 0)} A.`);
    else { C('ib_in', 'non_conforme', `IB = ${fmt(IB, 2)} A dépasse In = ${fmt(e.In.v, 0)} A : la protection déclencherait en fonctionnement normal.`); A('bad', `Courant d’emploi ${fmt(IB, 1)} A supérieur au calibre ${fmt(e.In.v, 0)} A.`); }
    if (statutDe(e.P, e.cos) === 'estimee') A('info', 'Le contrôle IB ≤ In repose sur des données estimées.');
  } else C('ib_in', 'verification', 'Intensité d’emploi non calculée : données manquantes.');
  // In ≤ Iz
  const mIz = manque(REGLES.in_iz.tables);
  C('in_iz', 'verification', mIz.length ? `Tableaux manquants (extraits Legrand à fournir) : ${mIz.join(' ; ')}. Mode de pose non renseigné.` : 'Mode de pose et conditions d’installation non renseignés.', { tablesManquantes: mIz });
  // section / calibre du logement
  const mSec = manque(REGLES.sec_logement.tables);
  const sm = e.secMaxCalque;
  let dSec = mSec.length ? `Tableau manquant : ${mSec.join(' ; ')}.` : '';
  if (fini(sm) && e.sec && e.In) dSec += ` Valeur du contrôle actuel de Calque (source non vérifiée) : ${fmt(e.sec.v, 1)} mm² → ${fmt(sm, 0)} A au plus.`;
  C('sec_logement', 'verification', dSec.trim(), { tablesManquantes: mSec });
  if (fini(sm) && e.In && e.In.v > sm) A('bad', `Le contrôle actuel de Calque signale un calibre de ${fmt(e.In.v, 0)} A trop élevé pour ${fmt(e.sec.v, 1)} mm² (${fmt(sm, 0)} A au plus). À confirmer avec l’extrait Legrand.`);
  // chute de tension
  const mDu = manque(REGLES.chute_tension.tables);
  if (dU) C('chute_tension', 'verification', `ΔU = ${fmt(dU.pct, 2)} % calculé (constantes estimées).${mDu.length ? ` Limite à confirmer, tableau manquant : ${mDu.join(' ; ')}.` : ''}`, { tablesManquantes: mDu });
  else C('chute_tension', 'verification', 'Chute de tension non calculée : données manquantes.', { tablesManquantes: mDu });
  // pouvoir de coupure
  C('pdc', 'verification', 'Courant de court-circuit au point d’installation, courbe et pouvoir de coupure du disjoncteur non renseignés.');

  out.statut = statutGlobal(out.controles);
  return out;
}

/* ---------------- lecture d'un circuit du plan ----------------
   `plan` est un objet plan (P) ; aucune donnée n'est modifiée. Données de calcul du circuit : c.calc (format v5) :
   { p, cos, len : données { v, st, src } ; mat : 'cu' | 'al' ; phase : 'L1' | 'L2' | 'L3' | 'tri' } */
const PHASES = ['L1', 'L2', 'L3', 'tri'];
const RESISTIF = new Set(['chauffage', 'chauffe_eau']);
function reseauDe(plan) {
  const r = plan && plan.install && plan.install.reseau;
  return r === 'mono' || r === 'tri' ? { v: r, st: 'saisie', src: 'Réglage de l’installation' } : { v: 'mono', st: 'estimee', src: 'Non précisé : monophasé, comme le schéma du tableau' };
}
function puissanceCircuit(plan, c) {
  const calc = c.calc || {};
  const saisie = lireDonnee(calc.p, (v) => fini(v) && v > 0);
  if (saisie) return { P: saisie, detail: { mode: 'circuit' } };
  const ms = (plan.elec || []).filter((e) => e.cid === c.id && !CMDS.has(e.type));
  if (!ms.length) return { P: null, detail: { raison: 'Aucun appareil n’est relié à ce circuit : indiquez la puissance prévue.' } };
  const ps = ms.map((e) => ({ e, p: puissanceSymbole(e) }));
  const sans = ps.filter((x) => !x.p);
  if (sans.length) return { P: null, detail: { raison: `${sans.length} symbole${sans.length > 1 ? 's' : ''} sur ${ms.length} sans puissance connue : indiquez la puissance prévue du circuit.`, sans: sans.map((x) => x.e.id) } };
  const v = ps.reduce((s, x) => s + x.p.v, 0);
  const estimees = ps.filter((x) => x.p.st === 'estimee').length;
  return { P: { v, st: statutDe(ps.map((x) => x.p)), src: `Somme des ${ms.length} appareils reliés` }, detail: { mode: 'symboles', estimees } };
}
function entreesDuPlan(plan, c) {
  const calc = c.calc || {};
  const { P: Pw, detail } = puissanceCircuit(plan, c);
  let cos = lireDonnee(calc.cos, cosOk);
  if (!cos && RESISTIF.has(c.kind)) cos = { v: 1, st: 'estimee', src: 'Charge résistive supposée (radiateurs, résistance)' };
  let phase = PHASES.includes(calc.phase) ? { v: calc.phase, st: 'saisie', src: 'Choisi dans la fiche du circuit' } : null;
  if (!phase && (plan.elec || []).some((e) => e.cid === c.id && e.type === 'pc_tri')) phase = { v: 'tri', st: 'estimee', src: 'Une prise triphasée est reliée au circuit' };
  const mat = calc.mat === 'cu' || calc.mat === 'al' ? { v: calc.mat, st: 'saisie', src: 'Choisi dans la fiche du circuit' } : null;
  return {
    nom: c.name, kind: c.kind, reseau: reseauDe(plan), phase,
    P: Pw, Pdetail: detail, cos,
    L: lireDonnee(calc.len, (v) => fini(v) && v > 0),
    sec: fini(c.sec) ? { v: c.sec, st: 'saisie', src: 'Section choisie dans le tableau' } : null,
    In: fini(c.cal) ? { v: c.cal, st: 'saisie', src: 'Calibre choisi dans le tableau' } : null,
    mat, secMaxCalque: fini(SEC_MAX[c.sec]) ? SEC_MAX[c.sec] : null,
    usage: c.kind === 'eclairage' ? 'eclairage' : 'autres', kindName: (CK[c.kind] || CK.autre).n,
  };
}
function ficheDuPlan(plan, c) { return ficheCircuit(entreesDuPlan(plan, c)); }

/* ---------------- bilan de puissance et équilibrage de l'installation ---------------- */
function bilanDuPlan(plan) {
  const inst = plan.install || {};
  const reseau = reseauDe(plan);
  const lignes = (plan.circuits || []).map((c) => {
    const en = entreesDuPlan(plan, c), f = ficheCircuit(en), r = f.resultats;
    return { id: c.id, nom: c.name, kind: c.kind, phase: en.phase ? en.phase.v : null, phaseSt: en.phase ? en.phase.st : null,
      P: en.P ? en.P.v : null, Pst: en.P ? en.P.st : null, cos: en.cos ? en.cos.v : null,
      Q: r.Q ? r.Q.v : null, S: r.S ? r.S.v : null, IB: r.IB ? r.IB.v : null, statut: f.statut, manquantes: f.manquantes.map((m) => m.nom) };
  });
  const avecP = lignes.filter((l) => fini(l.P)), avecQ = avecP.filter((l) => fini(l.Q));
  const ks = lireDonnee(inst.ks, (v) => fini(v) && v > 0 && v <= 1);
  const b = bilanPuissance(avecQ.map((l) => ({ P: l.P, Q: l.Q })), ks ? ks.v : null);
  const Pinst = avecP.reduce((s, l) => s + l.P, 0);
  const sous = fini(inst.kva) ? { v: inst.kva * 1000, st: 'saisie', src: 'Puissance souscrite (réglage de l’installation)' } : null;
  const manquantes = [];
  const sansP = lignes.filter((l) => !fini(l.P)), sansCos = avecP.filter((l) => !fini(l.Q));
  if (sansP.length) manquantes.push({ nom: 'Puissance', pourquoi: `${sansP.length} circuit${sansP.length > 1 ? 's' : ''} sans puissance connue : ${sansP.map((l) => l.nom).slice(0, 4).join(', ')}${sansP.length > 4 ? '…' : ''}.` });
  if (sansCos.length) manquantes.push({ nom: 'Facteur de puissance cos φ', pourquoi: `${sansCos.length} circuit${sansCos.length > 1 ? 's' : ''} sans cos φ : puissances réactive et apparente incomplètes.` });
  if (!ks) manquantes.push({ nom: 'Coefficient de simultanéité ks', pourquoi: tableDisponible('simultaneite') ? 'Choisissez le coefficient à appliquer.' : 'Tableau des coefficients manquant (extrait Legrand à fournir) : saisissez une valeur si vous la connaissez.' });
  const complet = !sansP.length && !sansCos.length;
  const alertes = [];
  if (!complet) alertes.push({ niveau: 'info', texte: 'Bilan partiel : les totaux ne comptent que les circuits dont les données sont connues (valeurs minimales).' });
  const Sref = ks ? b.Sappelee : null;
  if (sous && fini(Sref) && Sref > sous.v) alertes.push({ niveau: 'bad', texte: `Puissance appelée estimée ${fmt(Sref / 1000, 1)} kVA supérieure à la puissance souscrite ${fmt(sous.v / 1000, 0)} kVA.` });
  if (sous && !ks && fini(b.S) && b.S > sous.v) alertes.push({ niveau: 'info', texte: `Puissance installée ${fmt(b.S / 1000, 1)} kVA supérieure à la puissance souscrite : normal si tous les appareils ne fonctionnent pas en même temps (coefficient de simultanéité à préciser).` });
  return { reseau, lignes, Pinstallee: Pinst, Qinstallee: b.Q, Sinstallee: complet ? b.S : null, cos: complet ? b.cos : null,
    ks, Pappelee: ks ? Pinst * ks.v : null, Sappelee: ks && complet ? b.Sappelee : null, souscrite: sous, complet, manquantes, alertes,
    Itotal: complet && reseau.v === 'mono' ? b.S / CONSTANTES.U0.v : null };
}
function equilibrageDuPlan(plan, bilan) {
  bilan = bilan || bilanDuPlan(plan);
  const ch = { L1: 0, L2: 0, L3: 0 }, base = { L1: 0, L2: 0, L3: 0 };
  const sansPhase = [], sansI = [], monos = [];
  for (const l of bilan.lignes) {
    if (!fini(l.IB)) { sansI.push(l); continue; }
    if (l.phase === 'tri') { for (const p of ['L1', 'L2', 'L3']) { ch[p] += l.IB; base[p] += l.IB; } continue; }
    monos.push({ id: l.id, I: l.IB });
    if (l.phase) ch[l.phase] += l.IB; else sansPhase.push(l);
  }
  const eq = equilibrage(ch);
  const prop = repartirPhases(monos, base);
  return { applicable: bilan.reseau.v === 'tri', ...eq, sansPhase: sansPhase.map((l) => l.nom), sansI: sansI.map((l) => l.nom),
    proposition: { phases: prop.phases, ...equilibrage(prop.charges) } };
}

export { CONF, LIB_STATUT, MAT_NOM, PHASES, SQRT3, STATUTS, apparenteMono, apparenteTri, bilanDuPlan, bilanPuissance,
  chuteTension, cosPhi, cosPhiPQ, courantMono, courantTri, donnee, entreesDuPlan, equilibrage, equilibrageDuPlan,
  ficheCircuit, ficheDuPlan, fmt, lireDonnee, puissanceCircuit, puissances, repartirPhases, reseauDe, statutDe, statutGlobal };

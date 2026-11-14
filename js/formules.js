/* Calque — module « formules » : catalogue de TOUS les calculs faits par Calque, pour l'onglet « Calculs ».
   Pour chaque calcul : à quoi il sert, la formule, le sens de chaque lettre, où le trouver dans l'application, d'où
   viennent les données, et un exemple chiffré. JavaScript pur, sans accès à l'écran : testable avec Node.

   RÈGLE : l'exemple n'est jamais recopié à la main. Il est calculé par les fonctions mêmes des moteurs de Calque
   (calcul.js, cheminement.js, eclairage.js, thermique.js, quantitatif.js…), avec les valeurs saisies par l'utilisateur
   dans la fiche. Ainsi l'explication et le calcul réel ne peuvent pas se contredire.
   Les valeurs proposées par défaut dans les fiches sont des VALEURS D'EXEMPLE, pas des données de projet. */
import { polyArea, polyPerim } from './noyau.js';
import { CONSTANTES, TABLE_BY } from './normes.js';
import { bilanPuissance, chuteTension, courantMono, courantTri, equilibrage, puissances, repartirPhases } from './calcul.js';
import { aCommander } from './cheminement.js';
import { intensiteLambert } from './eclairage.js';
import { LAMBDA, RS, uParoi } from './thermique.js';
import { chiffrer } from './quantitatif.js';
import { epaisseur } from './compositions.js';

const nf = (d) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: 0 });
const f = (x, d = 2) => (Number.isFinite(x) ? nf(d).format(x) : '—');
const SQ = Math.sqrt(3);

/* familles, dans l'ordre d'affichage */
const FAMILLES = [
  { id: 'elec', n: 'Électricité d’un circuit', ou: 'Tableau électrique › un circuit › Fiche de calcul' },
  { id: 'install', n: 'Installation et tableau', ou: 'Tableau électrique › Bilan, Différentiels' },
  { id: 'chemin', n: 'Gaines et câbles', ou: 'Panneau d’une gaine, Tableau électrique › Cheminements' },
  { id: 'eclairage', n: 'Éclairage', ou: 'Panneau d’une pièce › Concevoir l’éclairage' },
  { id: 'batiment', n: 'Bâtiment et matériaux', ou: 'Panneaux d’une pièce, d’un mur et du niveau' },
  { id: 'thermique', n: 'Thermique (déperditions)', ou: 'Panneaux d’un mur, d’une pièce et du niveau › Thermique' },
  { id: 'chiffrage', n: 'Chiffrage', ou: 'Tableau électrique › Quantitatif' },
];
const STATUT_NOTE = 'Dans Calque, chaque donnée est « vérifiée » (source contrôlée), « saisie » (tapée par vous) ou « estimée » (valeur courante proposée par Calque, à confirmer). Un résultat calculé avec une donnée estimée est lui-même « estimé ».';

/* e : entrées de l'exemple { k, n (nom), u (unité), v (valeur d'exemple), min, max, choix? [{ v, n }] }
   calc(v) → { etapes: [texte], res: [[nom, valeur affichée]] } ; tout est calculé par les moteurs de Calque */
const FORMULES = [
  /* ---------------- électricité d'un circuit ---------------- */
  { id: 'ib_mono', fam: 'elec', titre: 'Intensité d’emploi en monophasé (IB)',
    but: 'Le courant qui circule dans le câble quand les appareils du circuit fonctionnent. Il sert à choisir le disjoncteur (IB ≤ In) et à calculer la chute de tension.',
    formule: 'IB = P / (U0 × cos φ)',
    vars: [['IB', 'intensité d’emploi', 'A (ampères)'], ['P', 'puissance active du circuit (somme des appareils)', 'W (watts)'], ['U0', 'tension entre phase et neutre', 'V (volts), 230 V en France'], ['cos φ', 'facteur de puissance : 1 pour un radiateur ou un chauffe-eau, moins pour un moteur ou des LED', 'sans unité, entre 0 et 1']],
    e: [{ k: 'P', n: 'Puissance P', u: 'W', v: 3680, min: 0, max: 1e6 }, { k: 'cos', n: 'cos φ', u: '', v: 1, min: 0.01, max: 1 }, { k: 'U0', n: 'Tension U0', u: 'V', v: CONSTANTES.U0.v, min: 1, max: 1000 }],
    calc: (x) => { const I = courantMono(x.P, x.U0, x.cos); return { etapes: [`IB = ${f(x.P, 0)} / (${f(x.U0, 0)} × ${f(x.cos, 3)})`], res: [['IB', f(I, 2) + ' A']] }; },
    donnees: `U0 = ${CONSTANTES.U0.v} V : ${CONSTANTES.U0.src}. P vient des appareils reliés au circuit (ou de la puissance saisie dans la fiche), cos φ est saisi (1 estimé pour le chauffage et le chauffe-eau).` },
  { id: 'ib_tri', fam: 'elec', titre: 'Intensité d’emploi en triphasé (IB)',
    but: 'Même rôle qu’en monophasé, pour un appareil branché sur les trois phases (moteur, plaque triphasée, borne de recharge triphasée). La charge est supposée équilibrée.',
    formule: 'IB = P / (√3 × U × cos φ)',
    vars: [['IB', 'intensité dans chaque phase', 'A'], ['P', 'puissance active totale', 'W'], ['√3', '≈ 1,732 : passage de la tension entre phases au courant d’une phase', ''], ['U', 'tension entre deux phases', 'V, 400 V en France'], ['cos φ', 'facteur de puissance', '']],
    e: [{ k: 'P', n: 'Puissance P', u: 'W', v: 7500, min: 0, max: 1e7 }, { k: 'cos', n: 'cos φ', u: '', v: 0.85, min: 0.01, max: 1 }, { k: 'U', n: 'Tension U', u: 'V', v: CONSTANTES.U.v, min: 1, max: 2000 }],
    calc: (x) => { const I = courantTri(x.P, x.U, x.cos); return { etapes: [`IB = ${f(x.P, 0)} / (1,732 × ${f(x.U, 0)} × ${f(x.cos, 3)})`], res: [['IB', f(I, 2) + ' A par phase']] }; },
    donnees: `U = ${CONSTANTES.U.v} V : ${CONSTANTES.U.src}.` },
  { id: 'puissances', fam: 'elec', titre: 'Puissances apparente (S) et réactive (Q)',
    but: 'Un appareil qui n’est pas purement résistif (moteur, transformateur, LED) consomme plus de courant que sa puissance utile ne le laisse croire : c’est la puissance apparente S qui compte pour le câble et l’abonnement.',
    formule: 'S = P / cos φ\nsin φ = √(1 − cos² φ)\nQ = S × sin φ',
    vars: [['S', 'puissance apparente', 'VA (voltampères)'], ['P', 'puissance active (utile)', 'W'], ['Q', 'puissance réactive', 'var'], ['φ', 'déphasage entre tension et courant', '']],
    e: [{ k: 'P', n: 'Puissance P', u: 'W', v: 2000, min: 0, max: 1e7 }, { k: 'cos', n: 'cos φ', u: '', v: 0.8, min: 0.01, max: 1 }],
    calc: (x) => { const p = puissances(x.P, x.cos); return p ? { etapes: [`S = ${f(x.P, 0)} / ${f(x.cos, 3)}`, `sin φ = √(1 − ${f(x.cos, 3)}²) = ${f(p.sin, 3)}`, `Q = ${f(p.S, 1)} × ${f(p.sin, 3)}`], res: [['S', f(p.S, 1) + ' VA'], ['Q', f(p.Q, 1) + ' var']] } : { etapes: [], res: [] }; },
    donnees: 'Calculé dans la fiche de calcul du circuit et dans le bilan de puissance.' },
  { id: 'chute', fam: 'elec', titre: 'Chute de tension (ΔU)',
    but: 'Le câble a une résistance : plus il est long et fin, plus la tension baisse au bout. Trop de chute de tension fait mal fonctionner les appareils. Calque la calcule du tableau jusqu’au point le plus éloigné.',
    formule: 'ΔU = b × (ρ × L / S × cos φ + λ × L × sin φ) × IB\nΔU % = 100 × ΔU / U0',
    vars: [['ΔU', 'chute de tension', 'V'], ['b', '2 en monophasé (aller et retour par la phase et le neutre), 1 en triphasé équilibré', ''], ['ρ', 'résistivité du métal en service (cuivre ≈ 0,0225)', 'Ω·mm²/m'], ['L', 'longueur du câble (un seul sens)', 'm'], ['S', 'section des conducteurs', 'mm²'], ['λ', 'réactance du câble (≈ 0,08 mΩ/m)', 'Ω/m'], ['IB', 'intensité d’emploi (voir plus haut)', 'A']],
    e: [{ k: 'P', n: 'Puissance P', u: 'W', v: 3680, min: 0, max: 1e6 }, { k: 'cos', n: 'cos φ', u: '', v: 1, min: 0.01, max: 1 }, { k: 'L', n: 'Longueur L', u: 'm', v: 20, min: 0, max: 5000 },
      { k: 'S', n: 'Section S', u: 'mm²', v: 2.5, min: 0.1, max: 500, choix: [1.5, 2.5, 4, 6, 10, 16] }, { k: 'tri', n: 'Réseau', u: '', v: 0, choix: [{ v: 0, n: 'Monophasé' }, { v: 1, n: 'Triphasé' }] }],
    calc: (x) => {
      const tri = !!x.tri, U0 = CONSTANTES.U0.v, rho = CONSTANTES.rho_cu.v, lam = CONSTANTES.lambda.v;
      const I = tri ? courantTri(x.P, CONSTANTES.U.v, x.cos) : courantMono(x.P, U0, x.cos), b = tri ? 1 : 2;
      const r = chuteTension({ b, rho, L: x.L, S: x.S, cos: x.cos, lambda: lam, I, U0 }), sin = Math.sqrt(Math.max(0, 1 - x.cos * x.cos));
      return r ? { etapes: [`IB = ${f(I, 2)} A`, `ΔU = ${b} × (${f(rho, 4)} × ${f(x.L, 1)} / ${f(x.S, 1)} × ${f(x.cos, 3)} + ${f(lam, 5)} × ${f(x.L, 1)} × ${f(sin, 3)}) × ${f(I, 2)}`, `ΔU % = 100 × ${f(r.dU, 2)} / ${f(U0, 0)}`],
        res: [['ΔU', f(r.dU, 2) + ' V'], ['ΔU %', f(r.pct, 2) + ' %']] } : { etapes: [], res: [] };
    },
    donnees: `ρ cuivre ${CONSTANTES.rho_cu.v} : ${CONSTANTES.rho_cu.src}. λ ${CONSTANTES.lambda.v} : ${CONSTANTES.lambda.src}. L vient du plan (le long des gaines, verticales comprises, « estimée ») tant qu’aucune longueur n’est saisie. La limite admise n’est pas dans l’extrait Legrand reçu : le contrôle reste « vérification nécessaire ».` },
  { id: 'ib_in', fam: 'elec', titre: 'Contrôle IB ≤ In (courant et calibre du disjoncteur)',
    but: 'Le disjoncteur doit laisser passer le courant normal du circuit sans déclencher : son calibre In doit être au moins égal à IB. (Il doit aussi protéger le câble : In ≤ Iz, contrôle qui demande les tableaux de courants admissibles, pas encore fournis.)',
    formule: 'IB ≤ In\n(et In ≤ Iz)',
    vars: [['IB', 'intensité d’emploi', 'A'], ['In', 'calibre du disjoncteur', 'A'], ['Iz', 'courant que le câble supporte selon sa pose', 'A']],
    e: [{ k: 'P', n: 'Puissance P', u: 'W', v: 4500, min: 0, max: 1e6 }, { k: 'cos', n: 'cos φ', u: '', v: 1, min: 0.01, max: 1 }, { k: 'In', n: 'Calibre In', u: 'A', v: 20, min: 1, max: 1000, choix: [10, 16, 20, 25, 32, 40] }],
    calc: (x) => { const I = courantMono(x.P, CONSTANTES.U0.v, x.cos); const ok = I <= x.In + 1e-9; return { etapes: [`IB = ${f(x.P, 0)} / (${CONSTANTES.U0.v} × ${f(x.cos, 3)}) = ${f(I, 2)} A`, `${f(I, 2)} A ${ok ? '≤' : '>'} ${f(x.In, 0)} A`], res: [['Résultat', ok ? 'Conforme (IB ≤ In)' : 'Non conforme : le disjoncteur déclencherait']] }; },
    donnees: 'Règle générale de la NF C 15-100 (partie 4-43), affichée avec sa source dans le rapport de contrôle.' },
  { id: 'section', fam: 'elec', titre: 'Section et calibre d’un circuit de logement',
    but: 'Pour les circuits courants d’un logement, la norme donne directement la section minimale du câble et le calibre maximal du disjoncteur. Ce n’est pas une formule : Calque lit le tableau de l’extrait Legrand.',
    formule: 'section du circuit ≥ section minimale du tableau\net\ncalibre ≤ calibre maximal du tableau',
    vars: [['Section', 'section des conducteurs du circuit', 'mm²'], ['Calibre', 'calibre du disjoncteur', 'A']],
    e: [], calc: () => {
      const t = TABLE_BY.get('section_protection_logement'), l = t && t.donnees && t.donnees.circuits ? t.donnees.circuits.slice(0, 6) : [];
      return { etapes: l.map((c) => `${c.nom} : ${c.choix.map((x) => `${f(x.sec, 1)} mm² / ${f(x.inMax, 0)} A`).join(' ou ')}`), res: [] };
    },
    donnees: 'Guide Legrand « NF C 15-100 — Points clés » (2024), tableau recopié dans js/normes.js. Chauffage : un circuit par tranche de 4 500 W (16 à 32 A selon la section).' },
  /* ---------------- installation ---------------- */
  { id: 'bilan', fam: 'install', titre: 'Bilan de puissance de l’installation',
    but: 'Additionner tous les circuits pour savoir quelle puissance l’installation peut appeler, et la comparer à l’abonnement (puissance souscrite).',
    formule: 'P = Σ Pi\nQ = Σ Qi\nS = √(P² + Q²)\ncos φ = P / S\npuissance appelée = ks × S',
    vars: [['Σ', 'somme sur tous les circuits', ''], ['S', 'puissance apparente totale (on additionne P et Q, pas les S)', 'VA'], ['ks', 'coefficient de simultanéité : tous les appareils ne marchent pas en même temps', 'entre 0 et 1, saisi']],
    e: [{ k: 'P1', n: 'Circuit 1 : P', u: 'W', v: 3000, min: 0, max: 1e6 }, { k: 'c1', n: 'Circuit 1 : cos φ', u: '', v: 1, min: 0.01, max: 1 }, { k: 'P2', n: 'Circuit 2 : P', u: 'W', v: 2000, min: 0, max: 1e6 }, { k: 'c2', n: 'Circuit 2 : cos φ', u: '', v: 0.8, min: 0.01, max: 1 }, { k: 'ks', n: 'ks', u: '', v: 0.7, min: 0.01, max: 1 }],
    calc: (x) => { const a = puissances(x.P1, x.c1), b = puissances(x.P2, x.c2); if (!a || !b) return { etapes: [], res: [] }; const r = bilanPuissance([a, b], x.ks);
      return { etapes: [`P = ${f(a.P, 0)} + ${f(b.P, 0)} = ${f(r.P, 0)} W`, `Q = ${f(a.Q, 0)} + ${f(b.Q, 0)} = ${f(r.Q, 0)} var`, `S = √(${f(r.P, 0)}² + ${f(r.Q, 0)}²)`, `appelée = ${f(x.ks, 2)} × ${f(r.S, 0)}`], res: [['S installée', f(r.S, 0) + ' VA'], ['cos φ global', f(r.cos, 3)], ['S appelée', f(r.Sappelee, 0) + ' VA']] }; },
    donnees: 'ks est saisi (Tableau électrique › Bilan) : la table de simultanéité n’est pas dans l’extrait Legrand reçu. Sans ks, Calque affiche la puissance installée seulement.' },
  { id: 'equilibrage', fam: 'install', titre: 'Équilibrage des phases (triphasé)',
    but: 'En triphasé, les circuits monophasés sont répartis sur L1, L2 et L3. Si une phase est beaucoup plus chargée, elle limite l’installation. Calque mesure l’écart et propose une meilleure répartition.',
    formule: 'déséquilibre = (I max − I moyen) / I moyen × 100',
    vars: [['I max', 'courant de la phase la plus chargée', 'A'], ['I moyen', '(IL1 + IL2 + IL3) / 3', 'A']],
    e: [{ k: 'L1', n: 'Courant L1', u: 'A', v: 20, min: 0, max: 1e4 }, { k: 'L2', n: 'Courant L2', u: 'A', v: 15, min: 0, max: 1e4 }, { k: 'L3', n: 'Courant L3', u: 'A', v: 10, min: 0, max: 1e4 }],
    calc: (x) => { const r = equilibrage({ L1: x.L1, L2: x.L2, L3: x.L3 }); return { etapes: [`I moyen = (${f(x.L1, 1)} + ${f(x.L2, 1)} + ${f(x.L3, 1)}) / 3 = ${f(r.moyenne, 2)} A`, `(${f(r.max, 1)} − ${f(r.moyenne, 2)}) / ${f(r.moyenne, 2)} × 100`], res: [['Déséquilibre', f(r.desequilibre, 1) + ' %']] }; },
    donnees: 'Répartition proposée : les circuits sont pris du plus fort au plus faible courant, chacun sur la phase la moins chargée à ce moment.',
    extra: () => { const r = repartirPhases([{ id: 'a', I: 16 }, { id: 'b', I: 10 }, { id: 'c', I: 8 }, { id: 'd', I: 6 }]); return `Exemple de répartition (16, 10, 8, 6 A) : ${Object.entries(r.phases).map(([k, v]) => `${f({ a: 16, b: 10, c: 8, d: 6 }[k], 0)} A → ${v}`).join(', ')}.`; } },
  { id: 'dd_aval', fam: 'install', titre: 'Calibre d’un interrupteur différentiel (règle de l’aval)',
    but: 'L’interrupteur différentiel doit supporter le courant des circuits qu’il protège. On compte en entier les circuits de chauffage et de chauffe-eau, et pour moitié les autres (ils ne tirent pas tous leur maximum en même temps).',
    formule: 'calibre de l’interrupteur ≥ 1 × Σ In (chauffage, chauffe-eau) + 0,5 × Σ In (autres circuits)',
    vars: [['Σ In', 'somme des calibres des disjoncteurs placés sous cet interrupteur', 'A']],
    e: [{ k: 'plein', n: 'Σ calibres chauffage + chauffe-eau', u: 'A', v: 20, min: 0, max: 1000 }, { k: 'autres', n: 'Σ calibres des autres circuits', u: 'A', v: 66, min: 0, max: 1000 }, { k: 'cal', n: 'Calibre de l’interrupteur', u: 'A', v: 63, min: 1, max: 1000, choix: [25, 40, 63, 80, 100] }],
    calc: (x) => { const k = TABLE_BY.get('differentiels_logement').donnees.aval.coefAutres, v = x.plein + k * x.autres, ok = x.cal >= v - 1e-9;
      return { etapes: [`1 × ${f(x.plein, 0)} + ${f(k, 1)} × ${f(x.autres, 0)} = ${f(v, 1)} A`, `${f(v, 1)} A ${ok ? '≤' : '>'} ${f(x.cal, 0)} A`], res: [['Résultat', ok ? 'Calibre suffisant' : 'Insuffisant (sauf si la règle de l’amont s’applique)']] }; },
    donnees: 'Guide Legrand « Points clés » (2024), p. 12-15. Règle de l’amont : si le calibre est au moins celui du disjoncteur d’abonné, la règle de l’aval n’est pas exigée (réglage du disjoncteur estimé d’après les kVA, à vérifier sur le contrat).' },
  { id: 'points', fam: 'install', titre: 'Nombre de points d’éclairage (spots et rubans)',
    but: 'Un circuit d’éclairage est limité en nombre de points. Des spots ou des rubans LED ne se comptent pas un par un : Calque les regroupe par tranches de puissance.',
    formule: 'points = nombre de luminaires ordinaires + max(1, arrondi supérieur(VA des spots / 300))',
    vars: [['VA des spots', 'puissance totale des spots d’une même pièce', 'VA']],
    e: [{ k: 'n', n: 'Luminaires ordinaires', u: '', v: 3, min: 0, max: 100 }, { k: 'va', n: 'Puissance des spots', u: 'VA', v: 70, min: 0, max: 1e5 }],
    calc: (x) => { const s = x.va > 0 ? Math.max(1, Math.ceil(x.va / 300)) : 0; return { etapes: [`spots : max(1, ⌈${f(x.va, 0)} / 300⌉) = ${s}`, `${f(x.n, 0)} + ${s}`], res: [['Points', String(x.n + s)]] }; },
    donnees: 'Règle de décompte du contrôle du tableau de Calque (1 point par tranche de 300 VA) ; le maximum par circuit vient de l’extrait Legrand.' },
  /* ---------------- gaines et câbles ---------------- */
  { id: 'longueur', fam: 'chemin', titre: 'Longueur d’une gaine et d’un câble',
    but: 'Mesurer le câble à prévoir : le parcours horizontal dessiné sur le plan, plus les montées et descentes jusqu’aux appareils (de la hauteur de la gaine à la hauteur de pose de l’appareil).',
    formule: 'L = Σ √(Δx² + Δy²)  +  Σ | z appareil − z gaine |',
    vars: [['Δx, Δy', 'écarts entre deux points du tracé', 'cm'], ['z gaine', 'hauteur du parcours : 0 au sol, hauteur sous plafond au plafond, hauteur saisie sinon', 'cm'], ['z appareil', 'hauteur de pose de l’appareil', 'cm']],
    e: [{ k: 'h', n: 'Parcours horizontal', u: 'cm', v: 640, min: 0, max: 1e6 }, { k: 'zg', n: 'Hauteur de la gaine', u: 'cm', v: 250, min: 0, max: 2000 }, { k: 'za', n: 'Hauteur de l’appareil', u: 'cm', v: 30, min: 0, max: 2000 }],
    calc: (x) => { const v = Math.abs(x.za - x.zg); return { etapes: [`verticale = |${f(x.za, 0)} − ${f(x.zg, 0)}| = ${f(v, 0)} cm`, `${f(x.h, 0)} + ${f(v, 0)}`], res: [['Longueur', f((x.h + v) / 100, 2) + ' m']] }; },
    donnees: 'Pose de la gaine choisie dans son panneau ; si elle n’est pas précisée, la verticale n’est pas comptée et Calque le signale.' },
  { id: 'commander', fam: 'chemin', titre: 'Longueur de câble à commander (réserve)',
    but: 'On commande toujours un peu plus que la longueur mesurée : chutes, raccordements, boucles dans les boîtes.',
    formule: 'à commander = arrondi au mètre supérieur ( L × (1 + réserve / 100) )',
    vars: [['L', 'longueur mesurée', 'm'], ['réserve', 'pourcentage ajouté (10 % estimé par défaut, modifiable)', '%']],
    e: [{ k: 'L', n: 'Longueur mesurée', u: 'm', v: 23.4, min: 0, max: 1e5 }, { k: 'r', n: 'Réserve', u: '%', v: 10, min: 0, max: 100 }],
    calc: (x) => { const m = aCommander(x.L * 100, { v: x.r }); return { etapes: [`${f(x.L, 2)} × (1 + ${f(x.r, 0)} / 100) = ${f(x.L * (1 + x.r / 100), 2)} m`], res: [['À commander', m + ' m']] }; },
    donnees: 'Réserve par défaut : 10 % (valeur de Calque, « estimée »), réglable dans Tableau électrique › Cheminements.' },
  { id: 'remplissage', fam: 'chemin', titre: 'Remplissage d’une gaine',
    but: 'Vérifier qu’il reste de la place dans un conduit pour tirer les câbles. Calque compare la place prise par les câbles à la section du conduit.',
    formule: 'taux = Σ (π × d² / 4) / (π × D² / 4) × 100\n(rectangle : section = largeur × hauteur)',
    vars: [['d', 'diamètre extérieur de chaque câble', 'mm'], ['D', 'diamètre nominal de la gaine', 'mm']],
    e: [{ k: 'D', n: 'Diamètre de la gaine', u: 'mm', v: 20, min: 1, max: 500, choix: [16, 20, 25, 32] }, { k: 'd', n: 'Diamètre d’un câble', u: 'mm', v: 9, min: 0.1, max: 200 }, { k: 'n', n: 'Nombre de câbles', u: '', v: 2, min: 0, max: 100 }],
    calc: (x) => { const occ = x.n * Math.PI * x.d * x.d / 4, S = Math.PI * x.D * x.D / 4; return { etapes: [`câbles : ${f(x.n, 0)} × π × ${f(x.d, 1)}² / 4 = ${f(occ, 1)} mm²`, `gaine : π × ${f(x.D, 0)}² / 4 = ${f(S, 1)} mm²`], res: [['Occupation', f(occ / S * 100, 1) + ' %']] }; },
    donnees: 'Indicatif : le diamètre intérieur réel est plus petit que le nominal. Le taux maximal admis n’est pas dans l’extrait Legrand reçu (« vérification nécessaire »).' },
  /* ---------------- éclairage ---------------- */
  { id: 'lumens', fam: 'eclairage', titre: 'Méthode des lumens (éclairement moyen)',
    but: 'Savoir combien de luminaires il faut pour éclairer une pièce à un niveau donné (en lux). Le flux de chaque luminaire, utile et entretenu, est réparti sur la surface.',
    formule: 'E moyen = N × Φ × U × MF / A',
    vars: [['E moyen', 'éclairement moyen sur le plan de travail', 'lx (lux)'], ['N', 'nombre de luminaires', ''], ['Φ', 'flux lumineux d’un luminaire (fiche du fabricant)', 'lm (lumens)'], ['U', 'utilance : part du flux qui arrive sur le plan de travail', 'entre 0 et 1'], ['MF', 'facteur de maintenance : baisse avec le temps et la poussière (0,8 estimé)', ''], ['A', 'surface de la pièce', 'm²']],
    e: [{ k: 'N', n: 'Nombre N', u: '', v: 6, min: 0, max: 500 }, { k: 'F', n: 'Flux Φ', u: 'lm', v: 3600, min: 0, max: 1e6 }, { k: 'U', n: 'Utilance U', u: '', v: 0.6, min: 0, max: 1.5 }, { k: 'MF', n: 'Maintenance MF', u: '', v: 0.8, min: 0.01, max: 1 }, { k: 'A', n: 'Surface A', u: 'm²', v: 40, min: 0.1, max: 1e5 }],
    calc: (x) => { const E = x.N * x.F * x.U * x.MF / x.A; return { etapes: [`${f(x.N, 0)} × ${f(x.F, 0)} × ${f(x.U, 2)} × ${f(x.MF, 2)} / ${f(x.A, 1)}`], res: [['E moyen', f(E, 0) + ' lx']] }; },
    donnees: 'L’éclairement visé est toujours saisi par vous : Calque ne fournit aucune valeur réglementaire. U est saisi (tableau du fabricant) ou estimé par le calcul point par point (réflexions ignorées).' },
  { id: 'point', fam: 'eclairage', titre: 'Calcul point par point (éclairement direct)',
    but: 'Calculer la lumière reçue en chaque point du plan de travail, pour connaître l’éclairement minimal et l’uniformité (pas seulement la moyenne).',
    formule: 'E = I(γ) × cos γ / d²\nluminaire sans fichier : I(γ) = Φ / π × cos γ',
    vars: [['E', 'éclairement au point', 'lx'], ['I(γ)', 'intensité du luminaire dans la direction du point (fichier IES / LDT, sinon lambertienne)', 'cd (candelas)'], ['γ', 'angle entre la verticale et la direction du point', '°'], ['d', 'distance luminaire → point', 'm']],
    e: [{ k: 'F', n: 'Flux Φ', u: 'lm', v: 3600, min: 0, max: 1e6 }, { k: 'h', n: 'Hauteur au-dessus du plan', u: 'm', v: 1.7, min: 0.1, max: 50 }, { k: 'r', n: 'Écart horizontal', u: 'm', v: 1, min: 0, max: 100 }],
    calc: (x) => { const d = Math.hypot(x.h, x.r), g = Math.acos(x.h / d) * 180 / Math.PI, I = intensiteLambert(x.F)(0, g), E = I * (x.h / d) / (d * d);
      return { etapes: [`d = √(${f(x.h, 2)}² + ${f(x.r, 2)}²) = ${f(d, 3)} m ; γ = ${f(g, 1)}°`, `I = ${f(x.F, 0)} / π × cos ${f(g, 1)}° = ${f(I, 1)} cd`, `E = ${f(I, 1)} × ${f(x.h / d, 3)} / ${f(d, 3)}²`], res: [['E au point', f(E, 1) + ' lx']] }; },
    donnees: 'Uniformité = E min / E moyen sur la grille de la pièce. Puissance surfacique = N × P / A (W/m²). Flux d’un fichier photométrique : Φ = ∫ I dΩ (intégration numérique).' },
  /* ---------------- bâtiment ---------------- */
  { id: 'surface', fam: 'batiment', titre: 'Surface, périmètre et volume d’une pièce',
    but: 'La surface est calculée à partir du contour intérieur de la pièce (faces des murs), quelle que soit sa forme.',
    formule: 'S = ½ × | Σ (xi × yi+1 − xi+1 × yi) |\nV = S × hauteur sous plafond',
    vars: [['xi, yi', 'coordonnées des angles du contour, dans l’ordre', 'cm'], ['S', 'surface (formule « du lacet »)', 'm²'], ['V', 'volume', 'm³']],
    e: [{ k: 'a', n: 'Longueur', u: 'cm', v: 450, min: 1, max: 1e5 }, { k: 'b', n: 'Largeur', u: 'cm', v: 380, min: 1, max: 1e5 }, { k: 'h', n: 'Hauteur sous plafond', u: 'cm', v: 250, min: 1, max: 2000 }],
    calc: (x) => { const p = [{ x: 0, y: 0 }, { x: x.a, y: 0 }, { x: x.a, y: x.b }, { x: 0, y: x.b }], S = Math.abs(polyArea(p)) / 1e4;
      return { etapes: [`contour : (0,0) (${f(x.a, 0)},0) (${f(x.a, 0)},${f(x.b, 0)}) (0,${f(x.b, 0)})`], res: [['Surface', f(S, 2) + ' m²'], ['Périmètre', f(polyPerim(p) / 100, 2) + ' m'], ['Volume', f(S * x.h / 100, 2) + ' m³']] }; },
    donnees: 'Les îlots (poteaux, gaines techniques) sont retirés. Terrasses, balcons et sols supprimés ne comptent pas dans la surface habitable.' },
  { id: 'compo', fam: 'batiment', titre: 'Épaisseur d’un mur composé et logement d’une gaine',
    but: 'Un mur composé (plaque, laine, parpaing…) a pour épaisseur la somme de ses couches. Une gaine tient dans une couche de laine ou de vide si son diamètre ne dépasse pas l’épaisseur de la couche.',
    formule: 'épaisseur = Σ ei\ngaine logée si Ø ≤ e (couche, en mm)',
    vars: [['ei', 'épaisseur de chaque couche', 'cm'], ['Ø', 'diamètre de la gaine', 'mm']],
    e: [{ k: 'p', n: 'Plaque', u: 'cm', v: 1.25, min: 0, max: 100 }, { k: 'l', n: 'Laine de verre', u: 'cm', v: 4.5, min: 0, max: 100 }, { k: 'm', n: 'Parpaing', u: 'cm', v: 20, min: 0, max: 100 }, { k: 'd', n: 'Gaine Ø', u: 'mm', v: 20, min: 1, max: 200, choix: [16, 20, 25, 32] }],
    calc: (x) => { const e = epaisseur([{ m: 'plaque', e: x.p }, { m: 'laine_verre', e: x.l }, { m: 'parpaing', e: x.m }]), ok = x.d <= x.l * 10 + 1e-9;
      return { etapes: [`${f(x.p, 2)} + ${f(x.l, 2)} + ${f(x.m, 2)}`, `Ø${f(x.d, 0)} ${ok ? '≤' : '>'} ${f(x.l * 10, 0)} mm de laine`], res: [['Épaisseur', f(e, 2) + ' cm'], ['Gaine', ok ? 'logée dans la laine' : 'épaisseur insuffisante']] }; },
    donnees: 'Contrôle géométrique de Calque, sans valeur réglementaire. Surfaces des matériaux : longueur du mur × hauteur, ouvertures déduites (estimation).' },
  /* ---------------- thermique ---------------- */
  { id: 'u', fam: 'thermique', titre: 'Résistance thermique et coefficient U d’une paroi',
    but: 'U dit combien de chaleur traverse 1 m² de paroi pour 1 °C d’écart. Plus U est petit, mieux la paroi isole. Chaque couche résiste au passage de la chaleur : on additionne les résistances.',
    formule: 'R couche = e / λ\nU = 1 / (Rsi + Σ R couches + Rse)',
    vars: [['e', 'épaisseur de la couche', 'm'], ['λ', 'conductivité du matériau (laine ≈ 0,035, béton ≈ 2,3)', 'W/m·K'], ['R', 'résistance thermique', 'm²·K/W'], ['Rsi, Rse', 'résistances de l’air contre la paroi, côté intérieur et extérieur (mur : 0,13 et 0,04)', 'm²·K/W'], ['U', 'coefficient de transmission', 'W/m²·K']],
    e: [{ k: 'l', n: 'Laine de verre', u: 'cm', v: 10, min: 0, max: 100 }, { k: 'lam', n: 'λ de la laine', u: 'W/m·K', v: LAMBDA.laine_verre.l, min: 0.005, max: 5 }, { k: 'm', n: 'Parpaing', u: 'cm', v: 20, min: 0, max: 100 }],
    calc: (x) => { const r = uParoi([{ m: 'laine_verre', e: x.l, l: x.lam }, { m: 'parpaing', e: x.m }], 'h', 'ext'), rp = x.m / 100 / LAMBDA.parpaing.l;
      return { etapes: [`laine : ${f(x.l / 100, 3)} / ${f(x.lam, 3)} = ${f(x.l / 100 / x.lam, 3)}`, `parpaing : ${f(x.m / 100, 3)} / ${f(LAMBDA.parpaing.l, 2)} (λ équivalent estimé) = ${f(rp, 3)}`, `U = 1 / (${f(RS.h.si, 2)} + ${f(x.l / 100 / x.lam, 3)} + ${f(rp, 3)} + ${f(RS.h.se, 2)})`],
        res: [['R totale', f(r.R, 2) + ' m²·K/W'], ['U', f(r.u, 3) + ' W/m²·K']] }; },
    donnees: 'Rsi et Rse : valeurs conventionnelles de l’EN ISO 6946 (plafond 0,10 ; plancher 0,17). λ : valeurs courantes estimées par Calque, à remplacer par la fiche du fabricant (champ « Conductivité λ » de chaque couche).' },
  { id: 'paroi', fam: 'thermique', titre: 'Déperdition par une paroi',
    but: 'La chaleur perdue à travers un mur, une fenêtre, un plancher ou un plafond quand il fait froid dehors.',
    formule: 'Φ = U × A × ΔT × b\nΔT = T intérieure − T extérieure de base',
    vars: [['Φ', 'puissance perdue', 'W'], ['A', 'surface de la paroi (ouvertures déduites du mur, comptées à part avec leur Uw)', 'm²'], ['ΔT', 'écart de température', 'K (= °C d’écart)'], ['b', '1 vers l’extérieur ; moins vers un local non chauffé, des combles, le sol (estimé)', 'entre 0 et 1']],
    e: [{ k: 'U', n: 'U', u: 'W/m²·K', v: 0.3, min: 0, max: 10 }, { k: 'A', n: 'Surface A', u: 'm²', v: 10, min: 0, max: 1e5 }, { k: 'ti', n: 'T intérieure', u: '°C', v: 19, min: -20, max: 40 }, { k: 'te', n: 'T extérieure de base', u: '°C', v: -7, min: -60, max: 40 }, { k: 'b', n: 'Coefficient b', u: '', v: 1, min: 0, max: 1 }],
    calc: (x) => { const dT = x.ti - x.te; return { etapes: [`ΔT = ${f(x.ti, 1)} − (${f(x.te, 1)}) = ${f(dT, 1)} K`, `Φ = ${f(x.U, 3)} × ${f(x.A, 2)} × ${f(dT, 1)} × ${f(x.b, 2)}`], res: [['Φ', f(x.U * x.A * dT * x.b, 0) + ' W']] }; },
    donnees: 'La température extérieure de base dépend de la commune (zone climatique et altitude) : vous la saisissez, Calque ne la devine jamais.' },
  { id: 'air', fam: 'thermique', titre: 'Déperdition par le renouvellement d’air et les ponts thermiques',
    but: 'L’air neuf qui entre (ventilation, fuites) doit être chauffé. Les ponts thermiques (jonctions mur-plancher, tableaux de fenêtres) laissent passer un peu plus de chaleur que les parois seules.',
    formule: 'Φ air = 0,34 × n × V × ΔT\nΦ ponts = ΔU × A enveloppe × ΔT',
    vars: [['0,34', 'chaleur pour réchauffer 1 m³ d’air de 1 °C', 'Wh/m³·K'], ['n', 'renouvellement d’air (0,5 vol/h estimé)', 'vol/h'], ['V', 'volume de la pièce', 'm³'], ['ΔU', 'majoration forfaitaire (0,1 estimé)', 'W/m²·K'], ['A enveloppe', 'surface des parois donnant sur l’extérieur ou le non chauffé', 'm²']],
    e: [{ k: 'n', n: 'Renouvellement n', u: 'vol/h', v: 0.5, min: 0, max: 50 }, { k: 'V', n: 'Volume V', u: 'm³', v: 40, min: 0, max: 1e5 }, { k: 'dU', n: 'ΔU', u: 'W/m²·K', v: 0.1, min: 0, max: 2 }, { k: 'Ae', n: 'A enveloppe', u: 'm²', v: 25, min: 0, max: 1e5 }, { k: 'dT', n: 'ΔT', u: 'K', v: 26, min: 0, max: 100 }],
    calc: (x) => ({ etapes: [`air : 0,34 × ${f(x.n, 2)} × ${f(x.V, 1)} × ${f(x.dT, 1)}`, `ponts : ${f(x.dU, 2)} × ${f(x.Ae, 1)} × ${f(x.dT, 1)}`], res: [['Φ air', f(0.34 * x.n * x.V * x.dT, 0) + ' W'], ['Φ ponts', f(x.dU * x.Ae * x.dT, 0) + ' W']] }),
    donnees: 'Total d’une pièce = Σ parois + ponts thermiques + air. Puissance à couvrir par le chauffage, comparée à celle des appareils posés dans la pièce. Méthode simplifiée inspirée de la NF EN 12831 : pas une étude thermique réglementaire.' },
  /* ---------------- chiffrage ---------------- */
  { id: 'chiffrage', fam: 'chiffrage', titre: 'Chiffrage du quantitatif',
    but: 'Transformer les quantités du plan en prix : fournitures, main-d’œuvre, TVA. Calque ne fournit aucun prix : ils sont saisis.',
    formule: 'ligne = prix unitaire × quantité\nmain-d’œuvre = Σ (temps × quantité) / 60 × taux horaire\nTTC = HT × (1 + TVA / 100)',
    vars: [['temps', 'temps de pose unitaire', 'min'], ['taux horaire', 'prix d’une heure de travail', '€ HT/h'], ['TVA', 'taux de TVA', '%']],
    e: [{ k: 'pu', n: 'Prix unitaire', u: '€', v: 8.5, min: 0, max: 1e6 }, { k: 'q', n: 'Quantité', u: '', v: 12, min: 0, max: 1e6 }, { k: 't', n: 'Temps unitaire', u: 'min', v: 15, min: 0, max: 1e4 }, { k: 'th', n: 'Taux horaire', u: '€/h', v: 45, min: 0, max: 1e4 }, { k: 'tva', n: 'TVA', u: '%', v: 10, min: 0, max: 100 }],
    calc: (x) => { const r = chiffrer({ lignes: [{ cle: 'x', qte: x.q }] }, { prix: { x: { v: x.pu } }, temps: { x: { v: x.t } }, tauxH: { v: x.th }, tva: { v: x.tva } });
      return { etapes: [`fournitures : ${f(x.pu, 2)} × ${f(x.q, 0)} = ${f(r.fournitures, 2)} €`, `main-d’œuvre : ${f(x.t, 0)} × ${f(x.q, 0)} / 60 = ${f(r.heures, 2)} h × ${f(x.th, 2)} €`, `TTC = ${f(r.totalHT, 2)} × (1 + ${f(x.tva, 1)} / 100)`], res: [['Total HT', f(r.totalHT, 2) + ' €'], ['TVA', f(r.montantTVA, 2) + ' €'], ['Total TTC', f(r.totalTTC, 2) + ' €']] }; },
    donnees: 'Tant qu’une ligne n’a pas de prix, le total est marqué « partiel ».' },
];

/* valeurs d'exemple d'une fiche (pour l'affichage initial et les tests) */
function valeursExemple(F) { const o = {}; for (const e of F.e) o[e.k] = e.v; return o; }
/* résultat d'une fiche pour des valeurs données (les valeurs absentes prennent celles de l'exemple) */
function calculer(F, vals) {
  const x = Object.assign(valeursExemple(F), vals || {});
  for (const e of F.e) if (!Number.isFinite(x[e.k]) || (e.min != null && x[e.k] < e.min) || (e.max != null && x[e.k] > e.max)) return { erreur: `${e.n} : valeur hors des limites (${e.min} à ${e.max}).` };
  try { return F.calc(x); } catch (err) { return { erreur: 'Calcul impossible avec ces valeurs.' }; }
}

export { FAMILLES, FORMULES, STATUT_NOTE, calculer, valeursExemple };

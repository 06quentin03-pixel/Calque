/* Calque — module « normes » : emplacement des tableaux de la NF C 15-100 utilisés par le moteur de calcul.
   SANS ÉCRAN (testable avec Node).

   Règle de l'utilisateur : les tableaux de la NF C 15-100 viennent UNIQUEMENT des extraits publiés par Legrand.
   Le texte de la norme AFNOR n'est pas reproduit. Tant qu'un tableau n'a pas été recopié depuis un extrait
   (champ `donnees` rempli, avec `source`, `edition` et `page`), il est « manquant » : tout résultat qui en dépend
   reste « vérification nécessaire ».

   Décision de l'utilisateur (4 novembre 2026) : les tableaux absents du guide « Points clés » sont REPORTÉS à la fin
   du projet (phase 8), car les documents qui les contiennent sont payants. En attendant, ils restent « manquante »
   (aucune valeur inventée) et les contrôles qui en dépendent restent « vérification nécessaire ».

   Pour remplir un tableau (quand l'extrait sera fourni) :
     - recopier les valeurs dans `donnees` (format indiqué dans `format`) ;
     - indiquer `source` (titre exact du document Legrand), `edition` (édition de la norme citée par le document),
       `page` (page ou numéro du tableau dans le document) ;
     - passer `statut` à 'verifiee' ;
     - ajouter un test qui vérifie quelques valeurs recopiées.
*/

const NORME = 'NF C 15-100';
/* extrait fourni par l'utilisateur le 4 novembre 2026 */
const SRC_GUIDE = 'Legrand, « NF C 15-100 — Révision 23 août 2024 — Points clés & solutions Legrand » (réf. MM224003, août 2026)';
const ED_2024 = 'NF C 15-100, révision du 23 août 2024 (série NF C 15-100-1 à -11 ; logement : NF C 15-100-10)';

/* statut d'un tableau : 'manquante' (pas encore d'extrait) ou 'verifiee' (recopié depuis un extrait Legrand) */
const TABLES = [
  {
    id: 'iz',
    titre: 'Courants admissibles des conducteurs (Iz)',
    contenu: 'Courant admissible Iz selon la section, le métal (cuivre, aluminium), l’isolant (PVC, PR), le nombre de conducteurs chargés (2 ou 3) et la méthode de référence du mode de pose.',
    sert: ['Contrôle In ≤ Iz (protection du câble)', 'Choix de la section'],
    format: '{ [methode]: { [isolant]: { [nbChargés]: { [section mm²]: Iz en A } } } }',
    statut: 'manquante', source: null, edition: null, page: null, donnees: null,
  },
  {
    id: 'modes_pose',
    titre: 'Modes de pose et méthodes de référence',
    contenu: 'Correspondance entre le mode de pose (conduit encastré, apparent, câble enterré…) et la méthode de référence (B, C, D, E, F…) utilisée par le tableau des courants admissibles.',
    sert: ['Choix de la ligne du tableau Iz'],
    format: '[{ code, description, methode }]',
    statut: 'manquante', source: null, edition: null, page: null, donnees: null,
  },
  {
    id: 'facteurs_correction',
    titre: 'Facteurs de correction (température ambiante, groupement de circuits)',
    contenu: 'Coefficients qui réduisent Iz selon la température ambiante et le nombre de circuits posés ensemble (dans un même conduit ou une même goulotte).',
    sert: ['Iz corrigé', 'Contrôle In ≤ Iz'],
    format: '{ temperature: { [isolant]: { [°C]: k } }, groupement: { [disposition]: { [nbCircuits]: k } } }',
    statut: 'manquante', source: null, edition: null, page: null, donnees: null,
  },
  {
    id: 'section_protection_logement',
    titre: 'Section des conducteurs et courant assigné de la protection, par type de circuit (logement)',
    contenu: 'Pour chaque circuit d’un logement (éclairage, prises, spécialisés, cuisson, chauffage…) : section minimale en cuivre et calibre maximal du disjoncteur, nombre maximal de points ou de socles.',
    sert: ['Contrôle section / calibre des circuits', 'Confirmation des valeurs du contrôle actuel de Calque'],
    format: '{ circuits: [{ id, nom, choix: [{ sec, inMax, max? }] }], chauffage: [{ pMax, sec, inMax }] }',
    statut: 'verifiee', source: SRC_GUIDE, edition: ED_2024,
    page: 'p. 16-17 « Les protections par circuit » ; p. 24-25 « Les prises et circuits spécialisés » ; p. 26 « Le circuit volets roulants » ; p. 28-29 « Le circuit chauffage »',
    donnees: {
      /* sec : section mini des fils (mm², cuivre) ; inMax : intensité maxi du disjoncteur (A) ; max : points ou prises maxi par circuit */
      circuits: [
        { id: 'eclairage', nom: 'Lumières', choix: [{ sec: 1.5, inMax: 16, max: 8 }], note: 'Au moins 2 circuits par logement (un seul admis pour un studio ou T1) ; 8 points lumineux maxi par circuit.' },
        { id: 'prises', nom: 'Prises 2P+T', choix: [{ sec: 1.5, inMax: 16, max: 8 }, { sec: 2.5, inMax: 20, max: 12 }] },
        { id: 'prises_cuisine', nom: 'Prises cuisine (hors circuits spécialisés)', choix: [{ sec: 2.5, inMax: 20, max: 6 }] },
        { id: 'volets', nom: 'Volets roulants', choix: [{ sec: 1.5, inMax: 16 }, { sec: 2.5, inMax: 20 }], note: 'Au moins 1 circuit dédié ; intensité choisie suivant la puissance des moteurs.' },
        { id: 'specialise', nom: 'Circuits spécialisés (lave-vaisselle, lave-linge, sèche-linge, four, chauffe-eau, congélateur, micro-ondes)', choix: [{ sec: 2.5, inMax: 20, max: 1 }], note: '3 circuits minimum, 1 appareil par circuit.', kinds: ['lave_linge', 'lave_vaisselle', 'seche_linge', 'four', 'congelateur', 'specialise', 'chauffe_eau'] },
        { id: 'cuisson', nom: 'Plaques de cuisson', choix: [{ sec: 6, inMax: 32, max: 1 }], note: '1 circuit dédié.' },
        { id: 'prise_ve', nom: 'Prise recharge VE (prise renforcée)', choix: [{ sec: 2.5, inMax: 20, max: 1 }], note: '1 circuit dédié.' },
      ],
      chauffage: [{ pMax: 3500, sec: 1.5, inMax: 16 }, { pMax: 4500, sec: 2.5, inMax: 20 }, { pMax: 5750, sec: 4, inMax: 25 }, { pMax: 7250, sec: 6, inMax: 32 }],
    },
    valeursCalque: 'Confirmées par l’extrait : 1,5 mm² → 16 A ; 2,5 → 20 ; 4 → 25 (chauffage) ; 6 → 32 ; 8 points d’éclairage, 12 socles en 2,5 mm², 8 en 1,5 mm², 6 en cuisine ; chauffage 3 500 / 4 500 / 5 750 / 7 250 W. Non couvertes par l’extrait : 10 mm² → 40 A et 16 mm² → 63 A.',
  },
  {
    id: 'chute_tension_max',
    titre: 'Chutes de tension maximales admissibles',
    contenu: 'Chute de tension maximale entre l’origine de l’installation et tout point d’utilisation, en %, pour l’éclairage et pour les autres usages, selon le type d’alimentation (réseau public basse tension ou poste privé).',
    sert: ['Contrôle de la chute de tension'],
    format: '{ reseauPublic: { eclairage: %, autres: % }, postePrive: { eclairage: %, autres: % } }',
    statut: 'manquante', source: null, edition: null, page: null, donnees: null,
  },
  {
    id: 'chute_tension_calcul',
    titre: 'Formule de la chute de tension et constantes (résistivité ρ, réactance linéique λ)',
    contenu: 'Formule de calcul (coefficient b mono / tri), résistivité des conducteurs en service normal (cuivre, aluminium) et réactance linéique à retenir.',
    sert: ['Calcul de la chute de tension (confirmation des constantes)'],
    format: '{ rho: { cu, al } en Ω·mm²/m, lambda en Ω/m, b: { mono: 2, tri: 1 } }',
    statut: 'manquante', source: null, edition: null, page: null, donnees: null,
  },
  {
    id: 'simultaneite',
    titre: 'Coefficients d’utilisation et de simultanéité',
    contenu: 'Coefficients à appliquer au bilan de puissance selon le type de circuit et le nombre de logements ou de circuits.',
    sert: ['Bilan de puissance (puissance appelée)'],
    format: '{ utilisation: { [usage]: ku }, simultaneite: { [nb]: ks } }',
    statut: 'manquante', source: null, edition: null, page: null, donnees: null,
  },
  {
    id: 'remplissage_conduits',
    titre: 'Remplissage des conduits et goulottes',
    contenu: 'Taux d’occupation maximal de la section d’un conduit, d’une goulotte ou d’un chemin de câbles par les conducteurs et câbles.',
    sert: ['Taux de remplissage des cheminements (onglet Cheminements)'],
    format: '{ [type de cheminement]: taux maximal en % }',
    statut: 'manquante', source: null, edition: null, page: null, donnees: null,
  },
  {
    id: 'differentiels_logement',
    titre: 'Interrupteurs différentiels : nombre, type et calibre minimal (logement)',
    contenu: 'Nombre minimal d’interrupteurs différentiels 30 mA, type (AC, A, F, B) selon les circuits, nombre maximal de circuits et calcul du calibre.',
    sert: ['Contrôle des différentiels', 'Type de différentiel de chaque circuit'],
    format: '{ nbMin, nbTypeAMin, circuitsMax, aval: { plein: [kinds], demi: "autres" }, types: { [kind]: [types admis] } }',
    statut: 'verifiee', source: SRC_GUIDE, edition: ED_2024,
    page: 'p. 12-13 « Le nombre d’interrupteurs différentiels », « La répartition des circuits », « Bien choisir son interrupteur différentiel » ; p. 14-15 « Le nombre de circuits », « Le calcul de l’intensité »',
    donnees: {
      nbMin: 2, nbTypeAMin: 1, sensibilite: 30, circuitsMax: 8,
      /* éclairage et prises à répartir sous au moins 2 différentiels (type A ou AC indifféremment) */
      lumieresPrisesMin: 2,
      /* règle de l'aval : I différentiel ≥ 1 × Σ disjoncteurs (convecteurs, chauffe-eau) + 0,5 × Σ disjoncteurs (prises, lumières, autres usages) ;
         règle de l'amont : I différentiel ≥ I disjoncteur d'abonné + I générateur (photovoltaïque, éolien…) */
      aval: { plein: ['chauffage', 'chauffe_eau'], coefAutres: 0.5 },
      /* exemple de l'extrait (p. 15) : convecteurs 20 A + prises 16 A + lumières 10 A → 20 + 8 + 5 = 33 A → différentiel 40 A */
      /* types admis selon les appareils (tableau p. 13) ; un circuit absent de cette liste n'est pas couvert par l'extrait */
      types: {
        eclairage: ['AC', 'A', 'F', 'B'], prises: ['AC', 'A', 'F', 'B'], prises_cuisine: ['AC', 'A', 'F', 'B'], volets: ['AC', 'A', 'F', 'B'],
        chauffage: ['AC', 'A', 'F', 'B'], chauffe_eau: ['AC', 'A', 'F', 'B'], four: ['AC', 'A', 'F', 'B'], lave_vaisselle: ['AC', 'A', 'F', 'B'],
        lave_linge: ['A', 'F', 'B'], seche_linge: ['A', 'F', 'B'], cuisson: ['A', 'F', 'B'], pac: ['A', 'F', 'B'], irve: ['A', 'F', 'B'],
      },
      notes: { irve: 'Recharge VE mode 3 triphasé : type A ou F avec dispositif de détection 6 mA, ou type B.', pac: 'Climatiseur, pompe à chaleur, pompe de piscine : type B également compatible.' },
    },
  },
];
const TABLE_BY = new Map(TABLES.map((t) => [t.id, t]));

/* un tableau est utilisable seulement s'il a été recopié d'un extrait Legrand, avec sa source et l'édition */
function tableDisponible(id) {
  const t = TABLE_BY.get(id);
  return !!(t && t.statut === 'verifiee' && t.donnees && t.source && t.edition);
}
function tablesManquantes(ids) {
  return (ids || TABLES.map((t) => t.id)).filter((id) => !tableDisponible(id)).map((id) => TABLE_BY.get(id)).filter(Boolean);
}

/* Constantes de calcul qui ne sont PAS des tableaux recopiés : elles sont toujours marquées « estimée »,
   avec leur origine, et affichées dans la fiche de calcul. Elles seront confirmées par l'extrait
   « chute_tension_calcul » ; en attendant, la chute de tension calculée reste une estimation. */
const CONSTANTES = {
  U0: { v: 230, st: 'estimee', src: 'Tension nominale phase-neutre du réseau public (230 V, NF EN IEC 60038), hypothèse de calcul' },
  U: { v: 400, st: 'estimee', src: 'Tension nominale entre phases du réseau public (400 V, NF EN IEC 60038), hypothèse de calcul' },
  rho_cu: { v: 0.0225, st: 'estimee', src: 'Résistivité du cuivre en service normal couramment retenue par les guides de calcul (≈ 1,25 × résistivité à 20 °C) : à confirmer par l’extrait Legrand' },
  rho_al: { v: 0.036, st: 'estimee', src: 'Résistivité de l’aluminium en service normal couramment retenue par les guides de calcul : à confirmer par l’extrait Legrand' },
  lambda: { v: 0.00008, st: 'estimee', src: 'Réactance linéique couramment retenue (0,08 mΩ/m) : à confirmer par l’extrait Legrand' },
};

/* Règles générales citées par le moteur (pas des tableaux) : source et édition à confirmer par un extrait. */
const REGLES = {
  ib_in: { nom: 'Courant d’emploi inférieur ou égal au calibre de la protection (IB ≤ In)', source: `${NORME}, partie 4-43 (protection contre les surintensités), condition IB ≤ In ≤ Iz`, edition: 'à confirmer avec l’extrait Legrand' },
  in_iz: { nom: 'Calibre de la protection inférieur ou égal au courant admissible du câble (In ≤ Iz)', source: `${NORME}, partie 4-43 et tableaux des courants admissibles (partie 5-52)`, edition: 'à confirmer avec l’extrait Legrand', tables: ['iz', 'modes_pose', 'facteurs_correction'] },
  sec_logement: { nom: 'Section et calibre du circuit (logement)', source: `${SRC_GUIDE}, p. 16-17 et 28-29`, edition: ED_2024, tables: ['section_protection_logement'] },
  nb_points: { nom: 'Nombre maximal de points d’éclairage ou de prises par circuit', source: `${SRC_GUIDE}, p. 16-17, 22, 24`, edition: ED_2024, tables: ['section_protection_logement'] },
  type_dd: { nom: 'Type de l’interrupteur différentiel adapté au circuit', source: `${SRC_GUIDE}, p. 12-13`, edition: ED_2024, tables: ['differentiels_logement'] },
  dd_circuits: { nom: '8 circuits au maximum par interrupteur différentiel', source: `${SRC_GUIDE}, p. 14`, edition: ED_2024, tables: ['differentiels_logement'] },
  dd_calibre: { nom: 'Calibre de l’interrupteur différentiel (règle de l’amont ou de l’aval)', source: `${SRC_GUIDE}, p. 14-15`, edition: ED_2024, tables: ['differentiels_logement'] },
  dd_nombre: { nom: 'Au moins 2 interrupteurs différentiels 30 mA, dont au moins 1 de type A', source: `${SRC_GUIDE}, p. 12`, edition: ED_2024, tables: ['differentiels_logement'] },
  dd_lp: { nom: 'Lumières et prises réparties sous au moins 2 interrupteurs différentiels', source: `${SRC_GUIDE}, p. 12`, edition: ED_2024, tables: ['differentiels_logement'] },
  chute_tension: { nom: 'Chute de tension inférieure à la limite admise', source: `${NORME}, partie 5-52 (chutes de tension)`, edition: 'à confirmer avec l’extrait Legrand', tables: ['chute_tension_max', 'chute_tension_calcul'] },
  remplissage: { nom: 'Taux de remplissage des conduits, goulottes et chemins de câbles', source: `${NORME}, règles de mise en œuvre des canalisations`, edition: 'à confirmer avec l’extrait Legrand', tables: ['remplissage_conduits'] },
  pdc: { nom: 'Pouvoir de coupure et courbe du disjoncteur', source: `${NORME}, partie 4-43 (protection contre les courts-circuits)`, edition: 'à confirmer avec l’extrait Legrand' },
};

export { CONSTANTES, ED_2024, NORME, REGLES, SRC_GUIDE, TABLES, TABLE_BY, tableDisponible, tablesManquantes };

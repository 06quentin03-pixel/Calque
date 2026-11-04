/* Calque — module « normes » : emplacement des tableaux de la NF C 15-100 utilisés par le moteur de calcul.
   SANS ÉCRAN (testable avec Node).

   Règle de l'utilisateur : les tableaux de la NF C 15-100 viennent UNIQUEMENT des extraits publiés par Legrand.
   Le texte de la norme AFNOR n'est pas reproduit. Tant qu'un tableau n'a pas été recopié depuis un extrait
   (champ `donnees` rempli, avec `source`, `edition` et `page`), il est « manquant » : tout résultat qui en dépend
   reste « vérification nécessaire ».

   Pour remplir un tableau (quand l'utilisateur aura fourni l'extrait) :
     - recopier les valeurs dans `donnees` (format indiqué dans `format`) ;
     - indiquer `source` (titre exact du document Legrand), `edition` (édition de la norme citée par le document),
       `page` (page ou numéro du tableau dans le document) ;
     - passer `statut` à 'verifiee' ;
     - ajouter un test qui vérifie quelques valeurs recopiées.
*/

const NORME = 'NF C 15-100';

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
    sert: ['Contrôle section / calibre des circuits', 'Remplacement des valeurs du contrôle actuel de Calque'],
    format: '[{ circuit, section, calibreMax, maxPoints }]',
    statut: 'manquante', source: null, edition: null, page: null, donnees: null,
    /* valeurs utilisées aujourd'hui par le contrôle de Calque (electricite.js / elecdonnees.js), source non vérifiée */
    valeursCalque: 'SEC_MAX (1,5 mm² → 16 A ; 2,5 → 20 ; 4 → 25 ; 6 → 32 ; 10 → 40 ; 16 → 63), 8 points d’éclairage, 12 socles en 2,5 mm², 8 en 1,5 mm², 6 en cuisine.',
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
    id: 'differentiels_logement',
    titre: 'Interrupteurs différentiels : nombre, type et calibre minimal (logement)',
    contenu: 'Nombre minimal d’interrupteurs différentiels 30 mA, type (AC, A, F) selon les circuits, et calibre minimal selon la puissance souscrite ou les circuits protégés.',
    sert: ['Contrôle des différentiels'],
    format: '[{ condition, nombre, type, calibre }]',
    statut: 'manquante', source: null, edition: null, page: null, donnees: null,
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
  sec_logement: { nom: 'Section et calibre du circuit (logement)', source: `${NORME}, partie 7-771 (locaux d’habitation)`, edition: 'à confirmer avec l’extrait Legrand', tables: ['section_protection_logement'] },
  chute_tension: { nom: 'Chute de tension inférieure à la limite admise', source: `${NORME}, partie 5-52 (chutes de tension)`, edition: 'à confirmer avec l’extrait Legrand', tables: ['chute_tension_max', 'chute_tension_calcul'] },
  pdc: { nom: 'Pouvoir de coupure et courbe du disjoncteur', source: `${NORME}, partie 4-43 (protection contre les courts-circuits)`, edition: 'à confirmer avec l’extrait Legrand' },
};

export { CONSTANTES, NORME, REGLES, TABLES, TABLE_BY, tableDisponible, tablesManquantes };

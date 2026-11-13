/* Calque — module « nomenclature » : nomenclature du tableau électrique (liste des appareils modulaires et du coffret).
   Sans écran (testable avec Node). Le plan n'est jamais modifié.
   Ce qui est lu dans le tableau (différentiels, disjoncteurs, options des circuits) est « saisi » ; ce qui est déduit
   (peignes, bornier, répartiteur) est « estimé ». Aucune référence de fabricant. */
import { isNum } from './noyau.js';
import { agcpLabel } from './elecdonnees.js';

const PH = (c, plan) => (c.calc && c.calc.phase === 'tri') || (plan.elec || []).some((e) => e.cid === c.id && e.type === 'pc_tri');
const CTRL = { contacteur: 'Contacteur heures creuses (commande du chauffe-eau)', telerupteur: 'Télérupteur', minuterie: 'Minuterie' };
const triRep = (a, b) => (parseInt(a.slice(a.search(/\d/)), 10) || 0) - (parseInt(b.slice(b.search(/\d/)), 10) || 0);

/* reperes : Map id du circuit → « C1 »… ; rn : Map id du différentiel → « ID1 »… ; lay : implantation du coffret (facultative) */
function nomenclatureTableau(plan, reperes, rn, lay) {
  const lignes = [];
  const add = (groupe, des, qte, rep, st, note) => lignes.push({ groupe, des, qte, reperes: (rep || []).slice().sort(triRep), st, note: note || '' });
  const inst = plan.install || {}, tri = inst.reseau === 'tri';
  /* arrivée */
  if (isNum(inst.kva)) add('Arrivée', `Disjoncteur de branchement (AGCP) ${agcpLabel(inst.kva, inst.reseau)}`, 1, [], 'estimee', `Puissance souscrite ${inst.kva} kVA ; appareil du distributeur, réglage à vérifier sur le contrat`);
  /* interrupteurs différentiels */
  const dd = new Map();
  for (const r of plan.rcds || []) {
    const k = `${r.type}|${r.cal}`; const g = dd.get(k) || { r, rep: [] }; g.rep.push(rn.get(r.id) || ''); dd.set(k, g);
  }
  for (const g of [...dd.values()].sort((a, b) => a.r.cal - b.r.cal || String(a.r.type).localeCompare(b.r.type)))
    add('Protection différentielle', `Interrupteur différentiel 30 mA type ${g.r.type} ${g.r.cal} A${tri ? ' tétrapolaire' : ' bipolaire'}`, g.rep.length, g.rep, 'saisie', tri ? '4 modules chacun (usage courant)' : '2 modules chacun (usage courant)');
  /* disjoncteurs divisionnaires : calibre, courbe, pôles */
  const dj = new Map(), opts = new Map();
  for (const c of plan.circuits || []) {
    if (!isNum(c.cal)) continue;
    const t = PH(c, plan);
    const k = `${c.cal}|${c.courbe || ''}|${t ? 'tri' : 'mono'}`; const g = dj.get(k) || { cal: c.cal, courbe: c.courbe || null, t, rep: [] };
    g.rep.push(reperes.get(c.id) || ''); dj.set(k, g);
    if (c.dda) { const o = opts.get('dda') || []; o.push(reperes.get(c.id) || ''); opts.set('dda', o); }
    if (CTRL[c.ctrl]) { const o = opts.get(c.ctrl) || []; o.push(reperes.get(c.id) || ''); opts.set(c.ctrl, o); }
  }
  for (const g of [...dj.values()].sort((a, b) => a.cal - b.cal || (a.t - b.t)))
    add('Disjoncteurs divisionnaires', `Disjoncteur ${g.t ? '3P+N' : '1P+N'} ${g.cal} A${g.courbe ? ' courbe ' + g.courbe : ''}`, g.rep.length, g.rep, 'saisie', g.courbe ? '' : 'courbe non précisée (C en usage courant : à confirmer)');
  if (opts.get('dda')) add('Options des circuits', 'Détecteur d’arc (DDA)', opts.get('dda').length, opts.get('dda'), 'saisie');
  for (const k of ['contacteur', 'telerupteur', 'minuterie']) if (opts.get(k)) add('Options des circuits', CTRL[k], opts.get(k).length, opts.get(k), 'saisie');
  if (inst.parafoudre) add('Options des circuits', 'Parafoudre', 1, [], 'saisie', 'option de l’installation');
  /* coffret et accessoires (déduits de l'implantation) */
  if (lay && lay.rows) {
    add('Coffret', `Coffret ${lay.rows.length} rangée${lay.rows.length > 1 ? 's' : ''} de ${lay.rowMods} modules`, 1, [], 'estimee', `${lay.used} modules occupés, réserve ${Math.round(lay.reserve * 100)} %`);
    const occ = lay.rows.filter((r) => r.used > 0).length;
    if (occ) add('Coffret', 'Peigne d’alimentation (une rangée)', occ, [], 'estimee', 'un par rangée occupée (à adapter au matériel choisi)');
    add('Coffret', 'Bornier de terre (répartiteur de terre)', 1, [], 'estimee', 'un par tableau');
    add('Coffret', 'Obturateurs de modules libres', Math.max(0, lay.total - lay.used), [], 'estimee', 'places libres de la réserve');
  }
  return { lignes, st: 'mixte' };
}

export { nomenclatureTableau };

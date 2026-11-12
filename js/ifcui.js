/* Calque — module « ifcui » : import d'une maquette IFC (BIM) dans un nouveau plan.
   La lecture est dans ifcimport.js (sans écran). Le plan en cours n'est jamais modifié : il est enregistré, puis un
   nouveau plan est créé avec les niveaux, les murs, les portes, les fenêtres et les noms des locaux de la maquette.
   Module JavaScript natif (aucune compilation). */
import { P, blankPlan, inPoly, projSeg, touch, ui, uid } from './noyau.js';
import { geo, syncRooms } from './geometrie.js';
import { addWall, clampOpening } from './mutations.js';
import { historyReset } from './historique.js';
import { fitView, newOpening, refreshUI } from './interaction.js';
import { btn, btns, closeModal, h, kv, openModal, toast } from './interface.js';
import { openPlan, saveNow, scheduleSave } from './stockage.js';
import { lireIfc } from './ifcimport.js';

const MAX_OCTETS = 150e6; // au-delà, l'iPad risque de manquer de mémoire
let fileIn = null;
function pickIfc() {
  if (!fileIn) {
    fileIn = h('input', { type: 'file', accept: '.ifc,.ifczip,.ifcxml', hidden: true, id: 'ifcIn' });
    fileIn.addEventListener('change', async () => { const f = fileIn.files && fileIn.files[0]; fileIn.value = ''; if (f) await importIfc(f); });
    document.body.append(fileIn);
  }
  fileIn.click();
}
const refus = (msg) => { openModal('Import impossible', h('p', null, msg), btns(btn('Fermer', closeModal))); return false; };
async function importIfc(file) {
  if (/\.(ifczip|ifcxml)$/i.test(file.name)) return refus('Calque lit les fichiers IFC en texte (« .ifc »). Ce fichier est compressé ou en XML : dans le logiciel d’origine (Revit, ArchiCAD, Allplan…), exportez en « IFC 2x3 » ou « IFC 4 », fichier .ifc.');
  if (file.size > MAX_OCTETS) return refus(`Ce fichier fait ${Math.round(file.size / 1e6)} Mo : il est trop lourd pour être lu sur cet appareil (limite : 150 Mo). Demandez un export de l’architecture seule, sans les réseaux ni le mobilier.`);
  toast('Lecture de la maquette…'); await new Promise((r) => setTimeout(r, 30));
  let R; try { R = lireIfc(await file.text()); } catch (e) { console.error(e); R = null; }
  if (!R || !R.murs.length) return refus(R && R.alertes.length ? R.alertes[0] : 'Aucun mur lisible dans ce fichier IFC (pas de mur, ou murs courbes ou de forme complexe).');
  const nb = (k) => R.ouvertures.filter((o) => o.kind === k).length;
  const deduites = R.ouvertures.filter((o) => o.deduite).length;
  const ign = Object.entries(R.ignores).map(([k, v]) => `${v} ${k}`).join(', ');
  openModal('Importer une maquette IFC',
    h('p', null, h('b', null, file.name), ` · ${R.schema || 'IFC'} · unité : ${R.unite.nom}`),
    kv([['Niveaux', R.niveaux.map((n) => `${n.nom} (${n.murs} murs${n.h ? '' : ', hauteur 2,50 m par défaut'})`).join(', ')], ['Murs', String(R.murs.length)], ['Portes', String(nb('door'))], ['Fenêtres', String(nb('window'))],
      nb('gap') ? ['Réservations sans menuiserie', String(nb('gap'))] : null, ['Locaux nommés', String(R.espaces.length)]]),
    h('p', { class: 'note' }, `Un nouveau plan sera créé ; le plan en cours est enregistré et n’est pas modifié. Chaque mur est repris par son axe, son épaisseur et sa hauteur.${R.murs.some((m) => m.approx) ? ' Certains murs ne sont pas rectangulaires : ils sont repris par leur plus grande longueur (à vérifier).' : ''}`),
    R.illisibles ? h('p', { class: 'note', style: 'color:var(--bad)' }, `${R.illisibles} mur${R.illisibles > 1 ? 's' : ''} non repris (géométrie non lue : murs courbes, inclinés ou de forme complexe).`) : null,
    deduites ? h('p', { class: 'note' }, `${deduites} porte${deduites > 1 ? 's' : ''} ou fenêtre${deduites > 1 ? 's' : ''} sans réservation dans la maquette : placée${deduites > 1 ? 's' : ''} dans le mur qui ${deduites > 1 ? 'les' : 'la'} contient, d’après ${deduites > 1 ? 'leur' : 'sa'} position (à vérifier).`) : null,
    R.fusions ? h('p', { class: 'note' }, `${R.fusions} morceau${R.fusions > 1 ? 'x' : ''} de mur superposé${R.fusions > 1 ? 's' : ''} (même axe, même épaisseur) regroupé${R.fusions > 1 ? 's' : ''} avec ${R.fusions > 1 ? 'leur' : 'son'} mur.`) : null,
    ign ? h('p', { class: 'note' }, `Non repris dans le plan : ${ign}.`) : null,
    btns(btn('Créer le plan', () => creerPlan(R, file.name), 'pri'), btn('Annuler', closeModal)));
  return true;
}
/* construit le nouveau plan à partir de la maquette lue */
async function creerPlan(R, nomFichier) {
  closeModal();
  await saveNow();
  const nom = (R.projet || nomFichier.replace(/\.ifc$/i, '')).slice(0, 80) || 'Maquette IFC';
  const plan = blankPlan(nom);
  const idNiv = new Map();
  plan.levels = R.niveaux.map((n, i) => { const id = 'L' + i; idNiv.set(n.id, id); return { id, name: n.nom.slice(0, 40), elev: n.elev, h: n.h || 250, slab: n.dalle || 20 }; });
  openPlan(plan, uid('p'), { quiet: true });
  let nm = 0, no = 0, nn = 0;
  for (const m of R.murs) {
    const lv = idNiv.get(m.niveau); if (!lv) continue;
    const L = P.levels.find((x) => x.id === lv), props = { th: m.th, kind: m.th < 12 ? 'cloison' : 'mur' };
    if (m.h > 50 && Math.abs(m.h - L.h) > 5) props.h = Math.round(m.h);
    nm += addWall(lv, m.a, m.b, props).length;
  }
  touch();
  for (const o of R.ouvertures) {
    const lv = idNiv.get(o.niveau); if (!lv) continue;
    let best = null;
    for (const wg of geo(lv).walls.values()) { const pr = projSeg(o, wg.A, wg.B); if (pr.t > 0 && pr.t < 1 && pr.d < 5 && (!best || pr.d < best.d)) best = { wg, d: pr.d, t: pr.t * wg.L }; }
    if (!best || best.wg.L < o.w + 2) continue;
    const op = newOpening(o.kind, best.wg, best.t, 1); op.w = Math.round(o.w);
    if (o.h > 20) op.h = Math.round(o.h);
    if (o.kind === 'window' && o.sill != null) op.sill = Math.round(o.sill);
    clampOpening(op); no++;
  }
  touch(); syncRooms();
  /* nom des pièces : quand plusieurs locaux de la maquette tombent dans une même pièce du plan (séjour, cuisine et entrée
     ouverts l'un sur l'autre), elle prend le nom du plus grand */
  const choisi = new Map();
  for (const e of R.espaces) {
    const lv = idNiv.get(e.niveau); if (!lv) continue;
    const room = geo(lv).rooms.find((r) => r.label && inPoly(e, r.poly) && !(r.holes || []).some((t) => inPoly(e, t)));
    if (!room) continue;
    const c = choisi.get(room.label); if (!c || (e.aire || 0) > (c.aire || 0)) choisi.set(room.label, e);
  }
  for (const [label, e] of choisi) { label.name = e.nom; nn++; }
  touch(); historyReset(); ui.inspOpen = false; refreshUI(); fitView(); scheduleSave();
  toast(`Maquette importée : ${P.levels.length} niveau${P.levels.length > 1 ? 'x' : ''}, ${nm} murs, ${no} ouvertures${nn ? `, ${nn} pièce${nn > 1 ? 's nommées' : ' nommée'}` : ''}. Vérifiez les cotes avant d’implanter l’électricité.`);
  return { murs: nm, ouvertures: no, noms: nn };
}

export { creerPlan, importIfc, pickIfc };

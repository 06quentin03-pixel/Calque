/* Calque — module « equipementui » : section « Équipement minimal » de l'inspecteur d'une pièce et du niveau.
   Pose, en une seule étape d'« Annuler », les prises, la sortie 32 A, le point lumineux et sa commande qui manquent
   d'après les règles de contrôle de Calque (calculs dans equipement.js, sans écran). Les symboles posés ne sont reliés
   à aucun circuit : « Relier les appareils sans circuit » (onglet Tableau électrique, affectation.js) les rattache
   sans modifier les circuits existants. */
import { IDX, P, ui, uid } from './noyau.js';
import { geo, roomOfLabel } from './geometrie.js';
import { commit } from './interaction.js';
import { btn, btns, h, sec, toast } from './interface.js';
import { ELEC_BY } from './symboles.js';
import { aPoser, equiperPiece } from './equipement.js';

const NOTE = 'D’après les règles de contrôle de Calque (nombre de socles par pièce, prises du plan de travail, sortie 32 A, point d’éclairage), pas encore rattachées à un extrait Legrand : proposition à vérifier. Les positions évitent portes, fenêtres, angles, volumes de la salle de bain, évier et plaque.';
const pieceDe = (r) => ({ lv: r.label.lv, nom: r.label.name, poly: r.poly, loop: r.loop, aire: r.area / 10000 });
const nomType = (t) => (ELEC_BY.get(t) || {}).n || t;

/* crée les symboles proposés (sans enregistrer l'étape) ; renvoie le nombre de symboles posés */
function poser(lv, prop) {
  const ids = prop.poses.map((p) => { const e = { id: uid('e'), lv, type: p.type, x: p.x, y: p.y, rot: p.rot, h: p.h }; P.elec.push(e); IDX.elec.set(e.id, e); return e.id; });
  for (const [i, j] of prop.liens) P.links.push({ id: uid('k'), lv, a: ids[i], b: ids[j] });
  return ids.length;
}
function message(n, impossibles, pieces) {
  if (!n && !impossibles) return 'Rien à ajouter : l’équipement minimal est déjà présent.';
  return `${n} appareil${n > 1 ? 's posés' : ' posé'}${pieces > 1 ? ` dans ${pieces} pièces` : ''}${impossibles ? ` ; ${impossibles} sans place libre le long des murs` : ''}. Vérifiez les positions, puis « Relier les appareils sans circuit » (Tableau électrique) : ils rejoignent les circuits sans modifier ceux qui existent.`;
}
function equiperUne(lbl) {
  const r = roomOfLabel(lbl); if (!r) return;
  const prop = equiperPiece(P, pieceDe(r)), n = poser(lbl.lv, prop);
  if (n) commit();
  toast(message(n, prop.impossible.reduce((s, x) => s + x.n, 0), 1));
}
function equiperNiveau(lv) {
  let n = 0, imp = 0, pieces = 0;
  for (const r of geo(lv).rooms) {
    if (!r.label) continue;
    const prop = equiperPiece(P, pieceDe(r)); // recalculé pièce par pièce : les prises posées comptent pour la suivante
    const k = poser(lv, prop); if (k) pieces++;
    n += k; imp += prop.impossible.reduce((s, x) => s + x.n, 0);
  }
  if (n) commit();
  toast(message(n, imp, pieces));
}

/* section de l'inspecteur d'une pièce */
function equipementSection(lbl) {
  const r = roomOfLabel(lbl); if (!r) return null;
  const prop = equiperPiece(P, pieceDe(r));
  if (!prop.manque.length) return sec('Équipement minimal', h('p', { class: 'note' }, 'Présent d’après les règles de contrôle de Calque (à confirmer : règles pas encore rattachées à un extrait Legrand).'));
  const n = prop.poses.length;
  return sec('Équipement minimal',
    h('ul', { class: 'eq-liste' }, prop.manque.map((m) => h('li', null, h('b', null, `${m.n} × ${nomType(m.type)}`), h('small', null, ' — ' + m.pourquoi)))),
    btns(btn(n ? `Poser l’équipement manquant (${n})` : 'Aucune place libre trouvée', () => equiperUne(lbl), n ? 'pri sm' : 'sm')),
    h('p', { class: 'note' }, NOTE));
}
/* section de l'inspecteur du niveau : toutes les pièces d'un coup */
function equipementNiveauSection(lv) {
  let n = 0, pieces = 0;
  for (const r of geo(lv).rooms) { if (!r.label) continue; const k = aPoser(P, pieceDe(r)); if (k) { n += k; pieces++; } } // rapide : sans les positions
  if (!n) return null;
  return sec('Équipement minimal',
    h('p', { class: 'note' }, `${pieces} pièce${pieces > 1 ? 's' : ''} de ce niveau n’${pieces > 1 ? 'ont' : 'a'} pas l’équipement minimal (environ ${n} appareil${n > 1 ? 's' : ''} à poser).`),
    btns(btn('Équiper toutes les pièces du niveau', () => equiperNiveau(lv), 'sm')),
    h('p', { class: 'note' }, NOTE));
}

export { equipementNiveauSection, equipementSection, equiperNiveau, equiperUne };

/* Calque — écran « Journal des erreurs » (Menu › Journal des erreurs).
   Montre les incidents notés par le filet (js/incidents.js), du plus récent au plus ancien.
   « Copier le journal » met un texte simple dans le presse-papiers, à coller dans un message pour faire corriger le problème.
   Le journal reste sur l'appareil : rien n'est envoyé. */
import { effacerIncidents, essaiFilet, lireIncidents } from './incidents.js';
import { btn, btns, closeModal, confirmBtn, h, openModal, toast } from './interface.js';

const ORIGINES = { promesse: 'tâche en arrière-plan', page: 'page', demarrage: 'ouverture du plan', 'enregistrement': 'enregistrement' };
function quand(t) {
  try { return new Date(t).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' }); } catch (e) { return String(t); }
}
function origineLisible(o) { return ORIGINES[o] || o || 'inconnue'; }
function contexteLisible(c) {
  if (!c) return '';
  const p = [];
  if (c.vue) p.push('onglet ' + c.vue);
  if (c.outil) p.push('outil ' + c.outil);
  if (c.objets != null) p.push(c.objets + ' objets');
  if (c.format != null) p.push('format v' + c.format);
  return p.join(' · ');
}
/* texte à coller dans un message (sans le nom ni le contenu du plan) */
function journalTexte(a = lireIncidents()) {
  const l = ['Journal des erreurs de Calque — ' + a.length + ' incident' + (a.length > 1 ? 's' : ''), 'Appareil : ' + (typeof navigator !== 'undefined' ? navigator.userAgent : '')];
  for (const i of [...a].reverse()) {
    l.push('', `${quand(i.t)}${i.essai ? ' (essai)' : ''}${i.n > 1 ? ' ×' + i.n : ''} — ${origineLisible(i.origine)}`, '  ' + i.msg);
    const c = contexteLisible(i.ctx); if (c) l.push('  ' + c);
    if (i.pile) l.push(...i.pile.split('\n').slice(0, 8).map((x) => '    ' + x.trim()));
  }
  return l.join('\n');
}
async function copier(texte) {
  try { await navigator.clipboard.writeText(texte); return true; } catch (e) { }
  /* repli (Safari sans autorisation) : zone de texte sélectionnée */
  try {
    const ta = document.createElement('textarea'); ta.value = texte; ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0'; document.body.append(ta); ta.select();
    const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch (e) { return false; }
}
function ouvrirJournal() {
  const a = lireIncidents();
  const liste = a.length
    ? h('div', { class: 'journal' }, [...a].reverse().map((i) => h('div', { class: 'jr' + (i.essai ? ' essai' : '') },
      h('div', { class: 'jr-t' }, h('b', null, quand(i.t)), i.essai ? h('span', { class: 'jr-tag' }, 'essai') : null, i.n > 1 ? h('span', { class: 'jr-tag' }, '×' + i.n) : null,
        h('span', { class: 'jr-o' }, origineLisible(i.origine))),
      h('div', { class: 'jr-m' }, i.msg),
      contexteLisible(i.ctx) ? h('div', { class: 'jr-c' }, contexteLisible(i.ctx)) : null,
      i.pile ? h('details', null, h('summary', null, 'Détail technique'), h('pre', null, i.pile)) : null)))
    : h('p', { class: 'note' }, 'Aucun incident noté sur cet appareil.');
  openModal('Journal des erreurs',
    h('p', null, 'Quand quelque chose ne fonctionne pas comme prévu, Calque le note ici. Le journal reste sur cet appareil : rien n’est envoyé.'),
    h('p', { class: 'note' }, 'Pour faire corriger un problème : « Copier le journal », puis collez-le dans votre message.'),
    liste,
    btns(
      a.length ? btn('Copier le journal', async () => { toast(await copier(journalTexte()) ? 'Journal copié.' : 'Copie impossible : faites une capture d’écran.'); }, 'pri', 'dup') : null,
      btn('Essayer le filet', () => { closeModal(); essaiFilet(); }, '', 'help'),
      a.length ? confirmBtn('Effacer le journal', 'Confirmer l’effacement', () => { effacerIncidents(); closeModal(); toast('Journal effacé.'); }) : null,
      btn('Fermer', closeModal)));
  document.getElementById('modal').classList.add('wide');
}

export { journalTexte, ouvrirJournal };

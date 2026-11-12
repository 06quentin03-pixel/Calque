/* Calque — module « assistantui » : fenêtre « Où en est mon projet ? » (Menu › Assistant).
   Les étapes sont calculées par assistant.js (sans écran). Chaque étape mène au bon endroit de l'application. */
import { P, ui } from './noyau.js';
import { geo } from './geometrie.js';
import { btn, closeModal, h, openModal, renderInspector, setTool } from './interface.js';
import { renderEvMain, setView } from './tableau.js';
import { rapportDuPlan } from './reglesui.js';
import { openDossier } from './dossierui.js';
import { startCal } from './fond.js';
import { avancement } from './assistant.js';

function avancementDuPlan() {
  const pieces = {}; for (const L of P.levels) pieces[L.id] = geo(L.id).rooms.map((r) => ({ nom: r.label ? r.label.name : '' }));
  let rapport = null; if (P.circuits.length) { try { const s = rapportDuPlan().synthese; rapport = { non_conforme: s.non_conforme, verification: s.verification }; } catch (e) { rapport = null; } }
  return avancement(P, { pieces, rapport });
}
const onglet = (t) => () => { setView('elec'); ui.evTab = t; renderEvMain(); };
const ACTIONS = {
  piece: ['Dessiner une pièce', () => { setView('plan'); setTool('room'); }],
  plan: ['Voir le plan', () => { setView('plan'); setTool('select'); ui.sel = null; ui.inspOpen = true; renderInspector(); }],
  fond: ['Mettre à l’échelle', () => { setView('plan'); startCal(); }],
  elec: ['Poser des appareils', () => { setView('plan'); setTool('elec'); }],
  tableau: ['Ouvrir le tableau', onglet('uni')],
  controles: ['Voir les contrôles', onglet('check')],
  bilan: ['Ouvrir le bilan', onglet('calc')],
  chemins: ['Ouvrir les cheminements', onglet('chem')],
  quantitatif: ['Ouvrir le quantitatif', onglet('quant')],
  dossier: ['Ouvrir le dossier PDF', openDossier],
  chantier: ['Ouvrir le chantier', () => setView('chantier')],
};
const SIGNE = { fait: '✓', afaire: '○', attention: '!', attente: '…' };
function openAssistant() {
  const a = avancementDuPlan();
  openModal('Où en est mon projet ?',
    h('p', null, h('b', null, `${a.faites} étape${a.faites > 1 ? 's' : ''} sur ${a.total} terminée${a.faites > 1 ? 's' : ''}`), ` · ${P.name || 'Plan'}`),
    h('div', { class: 'as-liste' }, a.etapes.map((e) => {
      const act = e.action && ACTIONS[e.action];
      return h('div', { class: 'as-etape as-' + e.etat + (a.suivante === e.id ? ' as-suivante' : ''), 'data-id': e.id, 'data-etat': e.etat },
        h('span', { class: 'as-signe', 'aria-hidden': 'true' }, SIGNE[e.etat]),
        h('div', { class: 'as-texte' }, h('b', null, e.titre, a.suivante === e.id ? h('span', { class: 'as-puce' }, 'à faire maintenant') : null), h('small', null, e.detail)),
        act && e.etat !== 'attente' ? btn(act[0], () => { closeModal(); act[1](); }, a.suivante === e.id ? 'pri sm' : 'sm') : null);
    })),
    h('p', { class: 'note' }, 'Liste déduite du plan, à titre de guide : elle ne remplace ni le rapport de contrôle ni l’avis d’un professionnel.'));
}

export { avancementDuPlan, openAssistant };

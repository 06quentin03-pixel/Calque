/* Calque — module « volets » : sections repliables du panneau de droite (demande du 15 novembre 2026).
   Chaque section titrée du panneau (.sec avec un h3) devient un volet : toucher son titre l'ouvre ou le ferme.
   Par défaut, seule la première section est ouverte (l'essentiel : dimensions, nom…) ; les choix de l'utilisateur
   sont retenus par sorte d'objet (mur, pièce, appareil, niveau…) dans les réglages de l'appareil (S.volets).
   Les sections sans titre (boutons « Supprimer »…) restent toujours visibles.
   Un observateur traite aussi les sections ajoutées après coup. */
import { S, saveSettings, ui } from './noyau.js';

/* sorte d'objet affichée dans le panneau : les choix sont retenus pour chaque sorte */
const sorte = () => (ui.sel && ui.sel.t) || 'niveau';
const cle = (titre) => sorte() + '|' + titre;
function etats() { if (!S.volets || typeof S.volets !== 'object' || Array.isArray(S.volets)) S.volets = {}; return S.volets; }
/* ouvert par défaut : la première section et les dimensions (l'essentiel) */
const ESSENTIEL = /^Dimensions$/i;
/* S.voletsTous : « Tout ouvrir » choisi (toutes les sections ouvertes, pour toutes les sortes d'objets) */
function estOuvert(titre, rang) { const v = etats()[cle(titre)]; return typeof v === 'boolean' ? v : S.voletsTous === true || rang === 0 || ESSENTIEL.test(titre); }

const CHEVRON = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>';

function poser(sec, ouvert) {
  sec.classList.toggle('ferme', !ouvert);
  const t = sec.querySelector(':scope > .volet-tete');
  if (t) t.setAttribute('aria-expanded', String(ouvert));
}
/* transforme une section titrée en volet */
function enVolet(sec, rang) {
  const h3 = sec.querySelector(':scope > h3');
  if (!h3) return false;
  const titre = h3.textContent.trim();
  sec.dataset.volet = titre;
  sec.classList.add('volet');
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'volet-tete';
  b.innerHTML = CHEVRON;
  h3.replaceWith(b);
  b.prepend(h3);
  b.addEventListener('click', () => {
    const ouvrir = sec.classList.contains('ferme');
    poser(sec, ouvrir);
    etats()[cle(titre)] = ouvrir; saveSettings();
  });
  poser(sec, estOuvert(titre, rang));
  return true;
}
/* « Tout ouvrir » / « Tout fermer » en haut du panneau (dès 3 volets) */
function barreTout(corps, volets) {
  let barre = corps.querySelector(':scope > .volets-tout');
  if (volets.length < 3) { if (barre) barre.remove(); return; }
  if (barre) return;
  barre = document.createElement('div'); barre.className = 'volets-tout';
  /* « Tout ouvrir » : toutes les sections ouvertes partout (réglage retenu) ; « Tout fermer » : les volets reviennent */
  const tout = (ouvrir) => () => {
    S.voletsTous = ouvrir; S.volets = {};
    if (!ouvrir) for (const s of corps.querySelectorAll(':scope > .sec.volet')) etats()[cle(s.dataset.volet)] = false;
    for (const s of corps.querySelectorAll(':scope > .sec.volet')) poser(s, ouvrir);
    saveSettings();
  };
  for (const [lib, v] of [['Tout ouvrir', true], ['Tout fermer', false]]) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = lib; b.addEventListener('click', tout(v)); barre.append(b);
  }
  corps.prepend(barre);
}
function traiter(insp) {
  const corps = insp.querySelector('.insp-body');
  if (!corps) return;
  const secs = [...corps.querySelectorAll(':scope > .sec')].filter((s) => s.querySelector(':scope > h3, :scope > .volet-tete'));
  secs.forEach((s, i) => { if (!s.dataset.volet) enVolet(s, i); });
  barreTout(corps, secs);
}
function installerVolets() {
  const insp = document.getElementById('insp');
  if (!insp || installerVolets.fait) return;
  installerVolets.fait = true;
  traiter(insp);
  new MutationObserver(() => traiter(insp)).observe(insp, { childList: true, subtree: true });
}

export { installerVolets };

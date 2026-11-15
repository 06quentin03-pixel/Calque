/* Calque — module « aide » : explications repliées dans le panneau de droite (demande du 15 novembre 2026).
   Les longs textes d'explication (p.note) du panneau ne montrent que leur première phrase, suivie d'un bouton ⓘ ;
   toucher ⓘ ouvre une petite fenêtre « Explication » avec le texte complet, par-dessus l'application.
   Rien n'est retiré : le texte complet reste dans la page (lu par VoiceOver) et s'affiche d'un toucher.
   Un texte court, ou marqué `garder` (alerte importante), reste affiché en entier.
   Un observateur traite aussi les sections ajoutées après coup (Thermique, Composition…). */

const LONG = 110; // au-delà, le texte est replié
const PHRASE_MAX = 95; // première phrase gardée visible si elle est assez courte

/* première phrase lisible d'un texte (coupée au premier « . », « ; » ou « : » suivi d'un espace) */
function premierePhrase(t) {
  const m = t.match(/^(.{12,}?[.;:])\s/);
  if (m && m[1].length <= PHRASE_MAX) return m[1].replace(/\s*[;:]$/, '…');
  const coupe = t.slice(0, 70);
  return coupe.slice(0, Math.max(coupe.lastIndexOf(' '), 40)) + '…';
}

let pop = null, ouvertA = 0;
function fermer() { if (pop) { pop.remove(); pop = null; document.removeEventListener('pointerdown', dehors, true); } }
function dehors(e) { if (pop && !pop.contains(e.target) && !e.target.closest('.aide-i')) fermer(); }
/* petite fenêtre d'explication, à côté du bouton (en bas de l'écran sur un téléphone) */
function montrer(btnEl, contenu) {
  const deja = pop && pop.dataset.pour === btnEl.dataset.id;
  fermer();
  if (deja) return;
  pop = document.createElement('div');
  pop.className = 'aide-pop'; pop.setAttribute('role', 'dialog'); pop.setAttribute('aria-label', 'Explication');
  pop.dataset.pour = btnEl.dataset.id;
  const tete = document.createElement('div'); tete.className = 'aide-t';
  const titre = document.createElement('b'); titre.textContent = 'Explication';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'aide-x'; x.textContent = 'Fermer'; x.addEventListener('click', fermer);
  tete.append(titre, x);
  const corps = document.createElement('div'); corps.className = 'aide-c';
  corps.append(...[...contenu.childNodes].map((n) => n.cloneNode(true)));
  pop.append(tete, corps);
  document.body.append(pop);
  ouvertA = Date.now();
  const r = btnEl.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  if (W <= 760) { pop.classList.add('bas'); }
  else {
    const w = Math.min(360, W - 24);
    pop.style.width = w + 'px';
    /* à gauche du panneau de droite, à hauteur du bouton */
    const bord = (btnEl.closest('.insp') || btnEl).getBoundingClientRect().left;
    pop.style.left = Math.max(12, Math.min(bord - w - 10, W - w - 12)) + 'px';
    pop.style.top = Math.max(12, Math.min(r.top - 20, H - pop.offsetHeight - 12)) + 'px';
  }
  setTimeout(() => document.addEventListener('pointerdown', dehors, true), 0);
}

let n = 0;
/* replie un texte d'explication : première phrase + ⓘ ; le texte complet est gardé (caché) pour la fenêtre */
function replier(p) {
  if (p.dataset.aide || p.classList.contains('garder')) return;
  p.dataset.aide = '1';
  const t = p.textContent.replace(/\s+/g, ' ').trim();
  if (t.length <= LONG) return;
  const complet = document.createElement('span'); complet.className = 'aide-complet'; complet.hidden = true;
  complet.append(...p.childNodes);
  const court = document.createElement('span'); court.className = 'aide-court'; court.textContent = premierePhrase(t) + ' ';
  const b = document.createElement('button'); b.type = 'button'; b.className = 'aide-i'; b.dataset.id = 'a' + (++n);
  b.setAttribute('aria-label', 'Explication complète'); b.textContent = 'ⓘ';
  b.addEventListener('click', (e) => { e.stopPropagation(); montrer(b, complet); });
  p.append(court, b, complet);
}
function traiter(racine) { for (const p of racine.querySelectorAll('p.note')) replier(p); }

/* le panneau de droite (#insp) */
function installerAide() {
  const insp = document.getElementById('insp');
  if (!insp || installerAide.fait) return;
  installerAide.fait = true;
  traiter(insp);
  new MutationObserver(() => { traiter(insp); if (pop && !insp.querySelector(`[data-id="${pop.dataset.pour}"]`)) fermer(); }).observe(insp, { childList: true, subtree: true });
  /* le panneau change de contenu : la fenêtre se ferme */
  insp.addEventListener('scroll', () => { if (pop && Date.now() - ouvertA > 400) fermer(); }, { passive: true });
}

export { fermer as fermerAide, installerAide, premierePhrase, replier };

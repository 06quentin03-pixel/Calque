/* Calque — module « rappelui » : date de la dernière sauvegarde complète et bandeau de rappel.
   La décision est dans sauvegarde.js (sans écran). La date est gardée dans IndexedDB (magasin « meta », clé
   « sauvegarde ») et dans localStorage (« calque.sauvegarde », secours) ; la plus récente des deux fait foi. */
import { ui } from './noyau.js';
import { DB, listProjects, lsGet, lsSet } from './stockage.js';
import { REPORT, etatSauvegarde, libelleDerniere } from './sauvegarde.js';

const ETAT = { derniere: 0, report: 0, lu: false };
function lireLS() { try { const o = JSON.parse(lsGet('calque.sauvegarde') || 'null'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
async function lireEtat() {
  let a = {};
  if (DB.ok) { try { const r = await DB.get('meta', 'sauvegarde'); a = (r && r.v) || {}; } catch (e) { } }
  const b = lireLS();
  ETAT.derniere = Math.max(+a.derniere || 0, +b.derniere || 0);
  ETAT.report = Math.max(+a.report || 0, +b.report || 0);
  ETAT.lu = true;
  return ETAT;
}
async function ecrireEtat() {
  const v = { derniere: ETAT.derniere, report: ETAT.report };
  lsSet('calque.sauvegarde', JSON.stringify(v));
  if (DB.ok) { try { await DB.tx(['meta'], 'readwrite', (t) => { t.objectStore('meta').put({ k: 'sauvegarde', v }); }); } catch (e) { } }
}
/* appelé quand le fichier de sauvegarde complète a été enregistré ou envoyé */
async function sauvegardeFaite() {
  ETAT.derniere = Date.now(); ETAT.report = 0;
  const b = document.getElementById('sauvBar'); if (b) b.remove();
  await ecrireEtat();
}
async function reporter() { ETAT.report = Date.now() + REPORT; await ecrireEtat(); }
/* libellé du menu (synchrone : état lu au démarrage) */
function libelleMenu() { return `Sauvegarder tous mes plans (${libelleDerniere(ETAT.derniere, Date.now())})`; }

/* vérifie et affiche le bandeau si besoin ; agir() lance la sauvegarde complète.
   Le bandeau ne s'affiche que dans la vue Plan (ailleurs, il recouvrirait la fiche 3D ou le tableau : on réessaie
   une minute plus tard) et disparaît seul au bout de 45 secondes, sans reporter le rappel (il reviendra à la
   prochaine ouverture). */
async function verifierSauvegarde(agir) {
  await lireEtat();
  if (ui.view && ui.view !== 'plan') { setTimeout(() => { verifierSauvegarde(agir).catch(() => { }); }, 60e3); return null; }
  let plans = []; try { plans = await listProjects(); } catch (e) { return null; }
  const e = etatSauvegarde({ derniere: ETAT.derniere, report: ETAT.report, plans, maintenant: Date.now() });
  if (!e.rappel || document.getElementById('sauvBar')) return e;
  const bar = document.createElement('div');
  bar.className = 'upd sauv'; bar.id = 'sauvBar'; bar.setAttribute('role', 'status');
  const txt = document.createElement('span'); txt.textContent = e.texte + ' Gardez une copie dans Fichiers.';
  const go = document.createElement('button'); go.type = 'button'; go.className = 'pri'; go.textContent = 'Sauvegarder maintenant';
  const later = document.createElement('button'); later.type = 'button'; later.textContent = 'Plus tard';
  go.addEventListener('click', () => { bar.remove(); agir(); });
  later.addEventListener('click', () => { bar.remove(); reporter(); });
  bar.append(txt, go, later);
  document.body.append(bar);
  setTimeout(() => bar.remove(), 45e3);
  return e;
}

export { ETAT, libelleMenu, lireEtat, reporter, sauvegardeFaite, verifierSauvegarde };

/* Calque — module « incidents » : filet contre les plantages.
   Toute erreur non prévue (dans un geste, un bouton, le dessin, un enregistrement…) est :
   1. notée dans un journal local (localStorage « calque.incidents », 50 incidents au plus, jamais envoyé nulle part) ;
   2. signalée par un bandeau discret, avec l'état réel de l'enregistrement (jamais « enregistré » si ce n'est pas vrai) ;
   3. suivie de l'enregistrement des modifications en attente (celles déjà validées, voir brancherFilet).
   Ce module est chargé en premier par main.js et n'importe rien : il attrape aussi les erreurs du chargement des autres modules.
   Le journal se lit dans Menu › Journal des erreurs (js/journalui.js). */
const CLE = 'calque.incidents', MAX = 50;
/* bruits connus du navigateur, sans effet sur Calque */
const BENINS = [/ResizeObserver loop/i, /^Script error\.?$/i];
/* branchements fournis au démarrage (demarrage.js) : contexte (vue, outil, taille du plan), enregistrement, ouverture du journal */
const B = { contexte: null, sauver: null, journal: null };
let bandeauVu = 0, installe = false;

function lireIncidents() {
  try { const a = JSON.parse(localStorage.getItem(CLE) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function ecrire(a) { try { localStorage.setItem(CLE, JSON.stringify(a.slice(-MAX))); return true; } catch (e) { return false; } }
function effacerIncidents() { try { localStorage.removeItem(CLE); return true; } catch (e) { return false; } }

function texteErreur(err) {
  if (err instanceof Error) return { msg: String(err.message || err.name || 'Erreur'), pile: String(err.stack || '').slice(0, 1500) };
  if (err && typeof err === 'object' && 'message' in err) return { msg: String(err.message), pile: String(err.stack || '').slice(0, 1500) };
  return { msg: String(err), pile: '' };
}
/* note un incident ; renvoie l'incident noté (null s'il est ignoré). Un incident identique dans les 5 s est compté, pas répété. */
function noterIncident(err, origine = '', opts = {}) {
  if (err && err.essai) opts = { ...opts, essai: true };
  const { msg, pile } = texteErreur(err);
  if (!opts.essai && BENINS.some((r) => r.test(msg))) return null;
  let ctx = {};
  try { ctx = (B.contexte && B.contexte()) || {}; } catch (e) { }
  const a = lireIncidents(), t = Date.now();
  const der = a.slice(-5).reverse().find((x) => x.msg === msg.slice(0, 500) && x.origine === origine && t - x.t < 5000);
  if (der) { der.n = (der.n || 1) + 1; der.t = t; ecrire(a); return der; }
  const inc = { t, origine, msg: msg.slice(0, 500), pile, ctx, n: 1 };
  if (opts.essai) inc.essai = true;
  a.push(inc); ecrire(a);
  return inc;
}

/* bandeau : un seul à la fois, au plus un toutes les 8 s */
function etatEnregistrement() { const el = document.getElementById('saveState'); return el ? el.dataset.s || '' : ''; }
async function signaler(inc) {
  if (!inc || typeof document === 'undefined' || !document.body) return;
  const t = Date.now();
  if (t - bandeauVu < 8000 && document.getElementById('incBar')) return;
  bandeauVu = t;
  let ok = null;
  try { if (B.sauver) ok = await B.sauver(); } catch (e) { ok = false; }
  /* état réel de l'enregistrement, tel qu'affiché en haut de l'écran (jamais deviné) */
  const s = etatEnregistrement(), libelle = (document.getElementById('saveTxt')?.textContent || '').trim();
  const enreg = ok === false || s === 'err'
    ? 'L’enregistrement a échoué : exportez le plan (Menu › Envoyer le fichier du plan).'
    : libelle ? `Enregistrement : « ${libelle} ».` : '';
  document.getElementById('incBar')?.remove();
  const bar = document.createElement('div');
  bar.className = 'upd inc'; bar.id = 'incBar'; bar.setAttribute('role', 'alert');
  const txt = document.createElement('span');
  txt.textContent = (inc.essai ? 'Essai du filet : ' : '') + 'Un problème inattendu est survenu. ' + enreg;
  const det = document.createElement('button'); det.type = 'button'; det.textContent = 'Détails';
  det.addEventListener('click', () => { bar.remove(); try { B.journal && B.journal(); } catch (e) { } });
  const fer = document.createElement('button'); fer.type = 'button'; fer.textContent = 'Fermer';
  fer.addEventListener('click', () => bar.remove());
  bar.append(txt, det, fer);
  document.body.append(bar);
  setTimeout(() => { if (bar.isConnected) bar.remove(); }, 15000);
}
/* note et signale (utilisable par le code qui attrape lui-même une erreur qu'il ne sait pas traiter) */
function incident(err, origine = '', opts = {}) { const inc = noterIncident(err, origine, opts); signaler(inc); return inc; }

function installerFilet() {
  if (installe || typeof window === 'undefined') return;
  installe = true;
  window.addEventListener('error', (e) => {
    /* erreur de chargement d'une ressource (image, police) : pas un plantage */
    if (!e.error && !e.message) return;
    incident(e.error || e.message, e.filename ? `${String(e.filename).split('/').pop()}:${e.lineno || 0}` : 'page');
  });
  window.addEventListener('unhandledrejection', (e) => incident(e.reason, 'promesse'));
}
/* demarrage.js branche le contexte, l'enregistrement et l'ouverture du journal */
function brancherFilet(o) { Object.assign(B, o || {}); }
/* essai volontaire, depuis le journal : une vraie erreur non attrapée, marquée « essai » */
function essaiFilet() {
  const e = new Error('Essai volontaire du filet (aucun problème réel)');
  e.essai = true;
  setTimeout(() => { throw e; }, 0);
}
installerFilet();

export { BENINS, brancherFilet, effacerIncidents, essaiFilet, incident, installerFilet, lireIncidents, noterIncident };

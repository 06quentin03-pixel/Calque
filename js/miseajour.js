/* Calque — module « miseajour » : avis « nouvelle version disponible ».
   Le Service Worker (sw.js) installe la nouvelle version en arrière-plan. Si l'application était déjà ouverte,
   un bandeau propose de recharger : le plan est enregistré avant le rechargement. */
import { saveNow } from './stockage.js';

let shown = false;
function showUpdate() {
  if (shown) return; shown = true;
  const bar = document.createElement('div');
  bar.className = 'upd'; bar.id = 'updBar'; bar.setAttribute('role', 'status');
  const txt = document.createElement('span'); txt.textContent = 'Une nouvelle version de Calque est disponible.';
  const go = document.createElement('button'); go.type = 'button'; go.className = 'pri'; go.textContent = 'Recharger';
  const later = document.createElement('button'); later.type = 'button'; later.textContent = 'Plus tard';
  go.addEventListener('click', async () => { go.disabled = true; try { await saveNow(); } catch (e) { } location.reload(); });
  later.addEventListener('click', () => bar.remove());
  bar.append(txt, go, later);
  document.body.append(bar);
}
async function watchUpdates() {
  if (!('serviceWorker' in navigator)) return;
  const hadController = !!navigator.serviceWorker.controller; // premier lancement : pas d'avis
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) showUpdate(); });
  // vérifier les mises à jour quand l'application revient au premier plan (iPad : l'app reste souvent ouverte des jours)
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible' || !navigator.onLine) return;
    try { const reg = await navigator.serviceWorker.getRegistration(); if (reg) await reg.update(); } catch (e) { }
  });
}

export { showUpdate, watchUpdates };

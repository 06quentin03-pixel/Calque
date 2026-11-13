/* Calque : fonctionnement hors ligne.
   Réseau d'abord pour les fichiers du site (les mises à jour arrivent dès qu'il y a internet),
   copie locale sinon. Tous les modules de js/ sont mis en cache à l'installation : l'application marche hors ligne.
   À chaque ajout de fichier : l'ajouter à CORE et changer le nom du cache (un test le vérifie). */
const CACHE = 'calque-v44';
const CORE = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './apple-touch-icon.png', './js/affectation.js',
  './js/assistant.js', './js/assistantui.js',
  './js/bibliotheque.js', './js/biblioui.js', './js/cablage.js', './js/cablerui.js', './js/calcul.js', './js/calques.js', './js/calquesui.js', './js/circuitsui.js', './js/catalogue.js', './js/chantier.js', './js/chantierui.js', './js/cheminement.js', './js/composants.js', './js/demarrage.js', './js/documents.js', './js/dossierui.js', './js/dxf.js', './js/dxfimport.js', './js/dxfmurs.js', './js/eclairage.js', './js/eclairageui.js', './js/equipement.js', './js/equipementui.js', './js/elecdonnees.js', './js/electricite.js', './js/evenements.js', './js/exemple.js', './js/export.js', './js/fiche.js', './js/fond.js', './js/fondtraits.js', './js/fondcalc.js', './js/geometrie.js', './js/historique.js', './js/ifcimport.js', './js/ifcui.js', './js/interaction.js', './js/interface.js', './js/itineraire.js', './js/lecture.js', './js/mabiblio.js', './js/main.js', './js/materiel.js', './js/metres.js', './js/mesure.js', './js/miseajour.js', './js/multi.js', './js/mutations.js', './js/nomenclature.js', './js/normes.js', './js/noyau.js', './js/pdf.js', './js/quantitatif.js', './js/quantitatifui.js', './js/photometrie.js', './js/photos.js', './js/regles.js', './js/reglesui.js', './js/rendu2d.js', './js/reseaux.js', './js/rappelui.js', './js/routeui.js', './js/sauvegarde.js', './js/schema.js', './js/schemasymboles.js', './js/schemaui.js', './js/stockage.js', './js/svgexport.js', './js/svgpdf.js', './js/symboles.js', './js/tableau.js', './js/technique.js', './js/variantes.js', './js/variantesui.js', './js/vue3d.js'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)); }
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    e.respondWith(
      Promise.race([fetch(req, { cache: 'no-cache' }), timeout(5000)])
        .then((res) => { if (res && res.ok) { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); } return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match('./index.html')))
    );
  } else if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.match(req).then((r) => r || fetch(req).then((res) => { const cp = res.clone(); caches.open(CACHE).then((c) => c.put(req, cp)); return res; })));
  }
});

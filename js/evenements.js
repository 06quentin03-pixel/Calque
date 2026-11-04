/* Calque — module « evenements » : signaux entre modules, sans accès à l'écran (utilisable par Node).
   Un module s'abonne avec on(type, fonction) et reçoit chaque signal émis par emit(type, détail).
   Signaux du plan (voir docs/ARCHITECTURE.md) :
   - EV.PLAN_OUVERT  : un plan vient d'être ouvert (détail : { id }).
   - EV.PLAN_CHANGE  : le contenu du plan a changé (détail : { cause : 'modification' | 'annuler' | 'rétablir' | 'retour' }).
   Une erreur dans un abonné est signalée dans la console sans empêcher les autres abonnés ni l'application de fonctionner. */
const EV = Object.freeze({ PLAN_OUVERT: 'plan:ouvert', PLAN_CHANGE: 'plan:change' });
const abonnes = new Map();
function on(type, fn) {
  if (!abonnes.has(type)) abonnes.set(type, new Set());
  abonnes.get(type).add(fn);
  return () => off(type, fn);
}
function off(type, fn) { const s = abonnes.get(type); if (s) s.delete(fn); }
function emit(type, detail) {
  const s = abonnes.get(type); if (!s) return;
  for (const fn of [...s]) { try { fn(detail); } catch (e) { console.error('Calque : erreur dans un abonné à « ' + type + ' »', e); } }
}

export { EV, emit, off, on };

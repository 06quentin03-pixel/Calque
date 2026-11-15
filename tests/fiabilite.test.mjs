// Fiabilisation (15 novembre 2026) : lisibilité, filet contre les plantages, contrôle du plan, résistance.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh, boot, wait } from './outils.mjs';

/* contraste WCAG entre deux couleurs « rgb(r, g, b) » */
function contraste(a, b) {
  const lum = (c) => {
    const [r, g, bl] = c.match(/\d+(\.\d+)?/g).slice(0, 3).map(Number).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

test('bouton « Confirmer la suppression » lisible (contraste ≥ 4,5) en thème clair et sombre', async () => {
  for (const theme of ['light', 'dark']) {
    const { ctx, page, errors } = await fresh();
    await boot(page);
    const r = await page.evaluate(async (theme) => {
      document.documentElement.dataset.theme = theme;
      const m = await import('./js/interface.js');
      let fait = 0;
      const b = m.confirmBtn('Supprimer', 'Confirmer la suppression', () => { fait++; });
      document.body.appendChild(b);
      const avant = getComputedStyle(b).color;
      b.click();
      const cs = getComputedStyle(b);
      const res = { avant, texte: b.textContent, fond: cs.backgroundColor, couleur: cs.color, faitApres1: fait };
      b.click();
      res.faitApres2 = fait;
      return res;
    }, theme);
    assert.match(r.texte, /Confirmer la suppression/);
    assert.equal(r.faitApres1, 0, 'le premier toucher ne supprime pas');
    assert.equal(r.faitApres2, 1, 'le second toucher supprime');
    const c = contraste(r.fond, r.couleur);
    assert.ok(c >= 4.5, `${theme} : contraste ${c.toFixed(2)} (${r.couleur} sur ${r.fond})`);
    assert.deepEqual(errors, []);
    await ctx.close();
  }
});

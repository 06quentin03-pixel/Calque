/* Calque — module « integrite » : contrôle des liens entre les objets d'un plan, et réparation proposée.
   JavaScript pur, sans accès au DOM (testable avec Node).
   - controlerPlan(p) : liste des problèmes { code, n, msg, rep } — rep = ce que fait la réparation, ou null si elle
     demande une décision humaine (rien n'est deviné : par exemple des coordonnées manquantes ne sont pas inventées).
   - reparerPlan(p) : applique les réparations sûres (liens vers des objets disparus) ; renvoie la liste de ce qui a été fait.
   Le contrôle ne modifie jamais le plan. L'écran (Menu › Vérifier le plan) fait une copie de sécurité avant de réparer.
   Ce contrôle porte sur la cohérence des données, pas sur la conformité NF C 15-100 (onglet Tableau › Contrôle). */

const liste = (p, k) => (Array.isArray(p[k]) ? p[k] : []).filter((o) => o && typeof o === 'object');
const ids = (a) => new Set(a.map((o) => o.id));
const num = (v) => typeof v === 'number' && isFinite(v);
const pl = (n, s, p) => (n > 1 ? (p || s + 's') : s);

/* chaque contrôle : code, test (renvoie le nombre de cas), message, réparation (texte) et action de réparation */
function regles(p) {
  const L = (k) => liste(p, k);
  const nodes = ids(L('nodes')), walls = ids(L('walls')), elec = ids(L('elec')), circs = ids(L('circuits')), rcds = ids(L('rcds')), lvs = ids(L('levels'));
  const photos = ids(L('photometries')), comps = ids(L('comps'));
  const elecBy = new Map(L('elec').map((e) => [e.id, e]));
  const ch = p.chantier && typeof p.chantier === 'object' ? p.chantier : {};
  const poses = ch.poses && typeof ch.poses === 'object' ? ch.poses : {};
  const LV = ['nodes', 'walls', 'items', 'elec', 'rooms', 'dims', 'texts', 'links', 'ducts', 'zones', 'etudes'];
  const jumeauCasse = (e) => e.to != null && (!elecBy.has(e.to) || elecBy.get(e.to).to !== e.id);
  return [
    { code: 'mur-angle', cas: () => L('walls').filter((w) => !nodes.has(w.a) || !nodes.has(w.b)),
      msg: (n) => `${n} ${pl(n, 'mur')} relié${n > 1 ? 's' : ''} à un angle manquant`, rep: 'mur retiré, avec ses ouvertures (sans angle, il n’a plus de position)',
      fix: (c) => { const s = ids(c); p.walls = p.walls.filter((w) => !s.has(w && w.id)); p.openings = (p.openings || []).filter((o) => !s.has(o && o.wall)); } },
    { code: 'ouverture-mur', cas: () => L('openings').filter((o) => !walls.has(o.wall)),
      msg: (n) => `${n} ${pl(n, 'ouverture')} sur un mur manquant`, rep: 'ouverture retirée (sans mur, elle n’a plus de position)',
      fix: (c) => { const s = ids(c); p.openings = p.openings.filter((o) => !s.has(o && o.id)); } },
    { code: 'symbole-circuit', cas: () => L('elec').filter((e) => e.cid && !circs.has(e.cid)),
      msg: (n) => `${n} ${pl(n, 'symbole')} relié${n > 1 ? 's' : ''} à un circuit manquant`, rep: 'symbole gardé, sans circuit (à relier de nouveau)',
      fix: (c) => { for (const e of c) delete e.cid; } },
    { code: 'circuit-differentiel', cas: () => L('circuits').filter((c) => c.rcd && !rcds.has(c.rcd)),
      msg: (n) => `${n} ${pl(n, 'circuit')} relié${n > 1 ? 's' : ''} à un différentiel manquant`, rep: 'circuit gardé, sans différentiel (à choisir dans le tableau)',
      fix: (c) => { for (const x of c) delete x.rcd; } },
    { code: 'liaison-symbole', cas: () => L('links').filter((l) => !elec.has(l.a) || !elec.has(l.b)),
      msg: (n) => `${n} ${pl(n, 'liaison')} commande → éclairage vers un symbole manquant`, rep: 'liaison retirée',
      fix: (c) => { const s = ids(c); p.links = p.links.filter((l) => !s.has(l && l.id)); } },
    { code: 'gaine-circuit', cas: () => L('ducts').filter((d) => (d.cid && !circs.has(d.cid)) || (Array.isArray(d.cids) && d.cids.some((x) => !circs.has(x)))),
      msg: (n) => `${n} ${pl(n, 'gaine')} parcourue${n > 1 ? 's' : ''} par un circuit manquant`, rep: 'circuit manquant retiré de la gaine (la gaine est gardée)',
      fix: (c) => { for (const d of c) { if (d.cid && !circs.has(d.cid)) delete d.cid; if (Array.isArray(d.cids)) { d.cids = d.cids.filter((x) => circs.has(x)); if (!d.cids.length) delete d.cids; } } } },
    { code: 'gaine-bout', cas: () => L('ducts').filter((d) => (d.a && !elec.has(d.a)) || (d.b && !elec.has(d.b))),
      msg: (n) => `${n} ${pl(n, 'gaine')} accrochée${n > 1 ? 's' : ''} à un symbole manquant`, rep: 'bout de la gaine laissé libre (le tracé ne bouge pas)',
      fix: (c) => { for (const d of c) { if (d.a && !elec.has(d.a)) d.a = null; if (d.b && !elec.has(d.b)) d.b = null; } } },
    { code: 'traversee-jumeau', cas: () => L('elec').filter(jumeauCasse),
      msg: (n) => `${n} ${pl(n, 'passage')} entre étages sans son jumeau sur l’autre niveau`, rep: 'passage gardé, sans jumeau (à relier de nouveau)',
      fix: (c) => { for (const e of c) delete e.to; } },
    { code: 'niveau', cas: () => LV.flatMap((k) => L(k).filter((o) => o.lv && !lvs.has(o.lv))),
      msg: (n) => `${n} ${pl(n, 'élément')} sur un niveau manquant`, rep: null },
    { code: 'chantier-niveau', cas: () => ['reserves', 'photos', 'notes'].flatMap((k) => (Array.isArray(ch[k]) ? ch[k] : []).filter((o) => o && o.lv && !lvs.has(o.lv))),
      msg: (n) => `${n} ${pl(n, 'élément')} du chantier sur un niveau manquant`, rep: null },
    { code: 'fond-image', cas: () => L('fonds').filter((f) => !(p.fondImg || {})[f.img]),
      msg: (n) => `${n} ${pl(n, 'fond')} de plan sans image`, rep: 'fond de plan retiré (son image n’existe plus)',
      fix: (c) => { const s = ids(c); p.fonds = p.fonds.filter((f) => !s.has(f && f.id)); } },
    { code: 'reserve-appareil', cas: () => (Array.isArray(ch.reserves) ? ch.reserves : []).filter((r) => r && r.ref && r.ref.t === 'elec' && !elec.has(r.ref.id)),
      msg: (n) => `${n} ${pl(n, 'réserve')} de chantier liée${n > 1 ? 's' : ''} à un appareil manquant`, rep: 'réserve gardée, sans lien vers l’appareil',
      fix: (c) => { for (const r of c) delete r.ref; } },
    { code: 'pose-orpheline', cas: () => [...Object.keys(poses.app || {}).filter((k) => !elec.has(k)).map((k) => ({ t: 'app', k })), ...Object.keys(poses.circ || {}).filter((k) => !circs.has(k)).map((k) => ({ t: 'circ', k }))],
      msg: (n) => `${n} ${pl(n, 'case')} « posé » du chantier pour un appareil ou un circuit manquant`, rep: 'case retirée',
      fix: (c) => { for (const x of c) delete poses[x.t][x.k]; } },
    { code: 'vue-circuit', cas: () => (Array.isArray(p.vues) ? p.vues : []).filter((v) => v && Array.isArray(v.circs) && v.circs.some((x) => !circs.has(x))),
      msg: (n) => `${n} ${pl(n, 'vue enregistrée', 'vues enregistrées')} avec un circuit manquant`, rep: 'circuit manquant retiré de la vue',
      fix: (c) => { for (const v of c) v.circs = v.circs.filter((x) => circs.has(x)); } },
    { code: 'photometrie', cas: () => L('elec').filter((e) => e.lum && typeof e.lum.ph === 'string' && e.lum.ph && !photos.has(e.lum.ph)),
      msg: (n) => `${n} ${pl(n, 'luminaire')} relié${n > 1 ? 's' : ''} à une photométrie manquante`, rep: 'luminaire gardé, sans photométrie (calcul par la méthode générale)',
      fix: (c) => { for (const e of c) delete e.lum.ph; } },
    { code: 'composant', cas: () => [...L('items'), ...L('elec')].filter((o) => o.comp && !comps.has(o.comp)),
      msg: (n) => `${n} ${pl(n, 'objet')} relié${n > 1 ? 's' : ''} à un composant personnalisé manquant`, rep: null },
    { code: 'id-double', cas: () => ['levels', 'nodes', 'walls', 'openings', 'items', 'elec', 'rooms', 'dims', 'texts', 'circuits', 'rcds', 'links', 'ducts', 'zones']
      .flatMap((k) => { const vus = new Set(); return L(k).filter((o) => { const d = vus.has(o.id); vus.add(o.id); return d; }); }),
      msg: (n) => `${n} ${pl(n, 'identifiant')} en double`, rep: null },
    { code: 'coordonnees', cas: () => [...L('nodes'), ...L('elec'), ...L('items'), ...L('texts')].filter((o) => !num(o.x) || !num(o.y)),
      msg: (n) => `${n} ${pl(n, 'objet')} sans position valide`, rep: null },
    { code: 'epaisseur', cas: () => L('walls').filter((w) => !num(w.th) || w.th <= 0),
      msg: (n) => `${n} ${pl(n, 'mur')} sans épaisseur valide`, rep: null },
  ];
}

function controlerPlan(p) {
  if (!p || typeof p !== 'object') return [{ code: 'plan', n: 1, msg: 'plan illisible', rep: null }];
  const out = [];
  for (const r of regles(p)) {
    const c = r.cas();
    if (c.length) out.push({ code: r.code, n: c.length, msg: r.msg(c.length), rep: r.fix ? r.rep : null });
  }
  return out;
}
/* applique les réparations sûres ; codes (facultatif) : seulement celles-ci. Renvoie [{ code, n, msg, rep }] réparés */
function reparerPlan(p, codes) {
  const fait = [];
  for (const code of regles(p).filter((r) => r.fix).map((r) => r.code)) {
    if (codes && !codes.includes(code)) continue;
    const r = regles(p).find((x) => x.code === code); // liens recalculés après chaque réparation
    const c = r.cas();
    if (!c.length) continue;
    r.fix(c);
    fait.push({ code, n: c.length, msg: r.msg(c.length), rep: r.rep });
  }
  return fait;
}

export { controlerPlan, reparerPlan };

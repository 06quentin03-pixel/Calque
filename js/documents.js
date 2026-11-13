/* Calque — module « documents » : moteur documentaire (dossier PDF avec cartouche et indice de révision).
   SANS ÉCRAN (testable avec Node). Écrit le PDF avec pdf.js (aucune bibliothèque, hors ligne).

   Le dossier est fait de chapitres : page de garde (sommaire, révisions, lecture des statuts), plans techniques,
   schéma unifilaire, coffret, nomenclatures, bilan de puissance, métrés et matériel, études d'éclairage,
   rapport de contrôle. Chaque page porte le même cartouche : projet, chapitre, indice, date, page n / N.

   Règles de l'utilisateur appliquées ici :
   - chaque valeur reprend son statut (vérifiée / saisie / estimée) ; ce qui est estimé est écrit « estimée » ;
   - une valeur manquante est écrite « manquante », jamais remplacée ;
   - le rapport de contrôle n'affiche jamais de conformité globale si tout n'est pas vérifié.

   Ce qui demande l'écran (dessin du plan, SVG du tableau, contour des pièces, règles du plan) est fourni par
   l'appelant (`dossierui.js`) au moyen des options ; sans ces options, le chapitre l'indique au lieu d'inventer. */
import { nomenclatureTableau } from './nomenclature.js';
import { PdfCtx, buildPdf, textWidth } from './pdf.js';
import { dessinerSVG } from './svgpdf.js';
import { CONF, LIB_STATUT, bilanDuPlan, equilibrageDuPlan, fmt } from './calcul.js';
import { CK } from './elecdonnees.js';
import { ELEC_BY } from './symboles.js';
import { lignesCircuits, listeMateriel, remplissageGaines } from './materiel.js';
import { implantationActuelle, propositions, TYPES_ECL } from './eclairage.js';
import { REGLES_VERSION } from './regles.js';
import { STATUT_BY, avancement, resumeReserves } from './chantier.js';
import { chiffrer, quantitatif } from './quantitatif.js';

/* ---------------- réglages de mise en page ---------------- */
const FORMATS = { A4: [595.28, 841.89], A3: [841.89, 1190.55] };
const MARGE = 28, CART_H = 54;
const FONT = 'Helvetica, Arial, sans-serif';
const COL = { ink: '#1D2125', ink2: '#5C656C', ink3: '#8A939A', rule: '#C9CFC9', fond: '#F1F3F0', accent: '#D24F1A',
  bad: '#BF3428', ok: '#2D7A4C', ver: '#9A6200', est: '#8A5A00', estFond: '#FFF2CC', manq: '#BF3428' };
const CTRL_COL = { conforme: COL.ok, non_conforme: COL.bad, verification: COL.ver };

const CHAPITRES = [
  { id: 'garde', n: 'Page de garde, sommaire et révisions' },
  { id: 'plans', n: 'Plans techniques' },
  { id: 'plans_elec', n: 'Plans électriques (implantation, câblage, éclairage, prises, spécialisés, courants faibles)' },
  { id: 'unifilaire', n: 'Schéma unifilaire' },
  { id: 'coffret', n: 'Coffret électrique' },
  { id: 'nomenclature', n: 'Nomenclatures' },
  { id: 'bilan', n: 'Bilan de puissance' },
  { id: 'metres', n: 'Métrés et matériel' },
  { id: 'quantitatif', n: 'Quantitatif et chiffrage' },
  { id: 'eclairage', n: 'Études d’éclairage' },
  { id: 'controles', n: 'Rapport de contrôle' },
  { id: 'chantier', n: 'Suivi de chantier (avancement, réserves, photos)' },
  { id: 'variantes', n: 'Comparaison des variantes' },
];
const CHAP_BY = new Map(CHAPITRES.map((c) => [c.id, c]));

/* ---------------- informations du dossier (plan.doc, format v8) ----------------
   doc : { client, adresse, auteur, entreprise, affaire, revisions: [{ i (indice), date (ms), objet, par, regles (version des règles) }] } */
const CHAMPS_DOC = ['client', 'adresse', 'auteur', 'entreprise', 'affaire'];
const txt = (s, max) => (typeof s === 'string' ? s.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max || 200) : '');
function nettoyerDoc(d) {
  const o = { revisions: [] };
  if (!d || typeof d !== 'object' || Array.isArray(d)) return o;
  for (const k of CHAMPS_DOC) { const v = txt(d[k]); if (v) o[k] = v; }
  for (const r of Array.isArray(d.revisions) ? d.revisions : []) {
    if (!r || typeof r !== 'object') continue;
    const i = txt(r.i, 4), date = typeof r.date === 'number' && Number.isFinite(r.date) && r.date > 0 ? r.date : null;
    if (!i || !date) continue;
    const x = { i, date, objet: txt(r.objet, 300) }; const par = txt(r.par, 80); if (par) x.par = par;
    const rg = txt(r.regles, 80); if (rg) x.regles = rg; // version du moteur de règles à cet indice
    o.revisions.push(x);
  }
  return o;
}
/* indice suivant : A, B, … Z, puis AA, AB… */
function indiceSuivant(doc) {
  const revs = (doc && doc.revisions) || [];
  const last = revs.length ? revs[revs.length - 1].i : null;
  if (!last || !/^[A-Z]+$/.test(last)) return 'A';
  const a = last.split('').map((c) => c.charCodeAt(0) - 65);
  let k = a.length - 1;
  while (k >= 0 && a[k] === 25) { a[k] = 0; k--; }
  if (k < 0) a.unshift(0); else a[k]++;
  return a.map((v) => String.fromCharCode(65 + v)).join('');
}
function indiceCourant(doc) { const r = doc && doc.revisions; return r && r.length ? r[r.length - 1] : null; }
const fmtJour = (t) => new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(new Date(t));
const fmtJourCourt = (t) => new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(t));

/* repères des circuits : même numérotation que le tableau (circuits rangés par différentiel) */
function reperes(plan) {
  const m = new Map(); let i = 1;
  for (const r of plan.rcds || []) for (const c of (plan.circuits || []).filter((x) => x.rcd === r.id)) m.set(c.id, 'C' + i++);
  for (const c of plan.circuits || []) if (!m.has(c.id)) m.set(c.id, 'C' + i++);
  return m;
}
const reperesDD = (plan) => new Map((plan.rcds || []).map((r, i) => [r.id, 'ID' + (i + 1)]));

/* ---------------- coupure du texte ---------------- */
function couper(str, size, bold, maxW) {
  const out = [];
  for (const para of String(str == null ? '' : str).split('\n')) {
    const mots = para.split(/ +/); let l = '';
    for (let w of mots) {
      const essai = l ? l + ' ' + w : w;
      if (textWidth(essai, size, bold) <= maxW) { l = essai; continue; }
      if (l) out.push(l);
      while (textWidth(w, size, bold) > maxW && w.length > 1) { // mot trop long : coupé
        let k = w.length; while (k > 1 && textWidth(w.slice(0, k), size, bold) > maxW) k--;
        out.push(w.slice(0, k)); w = w.slice(k);
      }
      l = w;
    }
    out.push(l);
  }
  return out;
}

/* ---------------- rédacteur : pages, titres, paragraphes, tableaux ---------------- */
class Redacteur {
  constructor(info) {
    this.info = info; this.pages = []; this.pg = null; this.chap = null; this.premieres = new Map(); this.c = null;
  }
  page(chapId, opts) {
    const o = opts || {};
    const [w, h] = FORMATS[o.format] || FORMATS.A4;
    const land = !!o.paysage, W = land ? h : w, H = land ? w : h;
    const c = new PdfCtx(W, H, { helv: o.helv !== false });
    c.fillStyle = '#FFFFFF'; c.fillRect(0, 0, W, H);
    const pg = { W, H, ctx: c, chap: chapId, titre: o.titre || (CHAP_BY.get(chapId) || {}).n || '', echelle: o.echelle || null, format: o.format || 'A4', land };
    pg.corps = { x: MARGE + 10, y: MARGE + 12, w: W - 2 * MARGE - 20, h: H - 2 * MARGE - CART_H - 22 };
    this.pages.push(pg); this.pg = pg; this.c = c; this.y = pg.corps.y;
    if (!this.premieres.has(chapId)) this.premieres.set(chapId, this.pages.length);
    return pg;
  }
  get bas() { return this.pg.corps.y + this.pg.corps.h; }
  place(h) { if (this.y + h > this.bas) { this.page(this.pg.chap, { titre: this.pg.titre, format: this.pg.format, paysage: this.pg.land }); return true; } return false; }
  _t(s, x, y, size, bold, color, align) {
    const c = this.c; c.font = `${bold ? 700 : 400} ${size}px ${FONT}`; c.fillStyle = color || COL.ink; c.textAlign = align || 'left'; c.textBaseline = 'alphabetic';
    c.fillText(s, x, y);
  }
  titre(s, niveau) {
    const size = niveau === 2 ? 11.5 : 15;
    this.place(size * 2.6);
    this.y += niveau === 2 ? 8 : 4;
    this._t(s, this.pg.corps.x, this.y + size, size, true, COL.ink);
    this.y += size + (niveau === 2 ? 6 : 6);
    if (niveau !== 2) { const c = this.c; c.strokeStyle = COL.accent; c.lineWidth = 1.2; c.beginPath(); c.moveTo(this.pg.corps.x, this.y); c.lineTo(this.pg.corps.x + 40, this.y); c.stroke(); this.y += 8; }
  }
  texte(s, o) {
    o = o || {};
    const size = o.size || 8.5, lh = size * 1.32, x = this.pg.corps.x + (o.retrait || 0), w = this.pg.corps.w - (o.retrait || 0);
    for (const l of couper(s, size, o.bold, w)) { this.place(lh); this._t(l, x, this.y + size, size, o.bold, o.color || COL.ink); this.y += lh; }
    this.y += o.apres != null ? o.apres : 3;
  }
  espace(h) { this.y += h; }
  /* encadré d'avertissement */
  encadre(s, couleur) {
    const size = 8, lh = size * 1.32, w = this.pg.corps.w - 16;
    const lignes = couper(s, size, false, w), h = lignes.length * lh + 10;
    this.place(h + 4);
    const c = this.c, x = this.pg.corps.x;
    c.fillStyle = COL.fond; c.fillRect(x, this.y, this.pg.corps.w, h);
    c.fillStyle = couleur || COL.ver; c.fillRect(x, this.y, 2.5, h);
    let y = this.y + 5;
    for (const l of lignes) { this._t(l, x + 9, y + size, size, false, COL.ink); y += lh; }
    this.y += h + 6;
  }
  /* tableau : cols [{ t, w (part de la largeur), al: 'l'|'r'|'c' }] ; cellule : texte ou { t, st, ctrl, b, c, petit } */
  tableau(cols, rows, o) {
    o = o || {};
    const size = o.size || 7.6, lh = size * 1.3, pad = 3.5, X = this.pg.corps.x, W = this.pg.corps.w;
    const tot = cols.reduce((s, c) => s + (c.w || 1), 0);
    const xs = []; let acc = X; for (const c of cols) { xs.push(acc); acc += ((c.w || 1) / tot) * W; }
    const ws = cols.map((c, i) => (i < cols.length - 1 ? xs[i + 1] : X + W) - xs[i]);
    const entete = () => {
      const lignes = cols.map((c, i) => couper(c.t, size, true, ws[i] - 2 * pad));
      const h = Math.max(...lignes.map((l) => l.length)) * lh + 2 * pad;
      const cx = this.c; cx.fillStyle = COL.fond; cx.fillRect(X, this.y, W, h);
      lignes.forEach((ls, i) => ls.forEach((l, k) => this._cell(l, xs[i], ws[i], this.y + pad + size + k * lh, size, true, COL.ink2, cols[i].al, pad)));
      this.y += h;
      cx.strokeStyle = COL.ink2; cx.lineWidth = 0.6; cx.beginPath(); cx.moveTo(X, this.y); cx.lineTo(X + W, this.y); cx.stroke();
    };
    this.place(lh * 3 + 2 * pad);
    entete();
    rows.forEach((row) => {
      const cells = row.map((v, i) => this._prep(v, ws[i] - 2 * pad, size));
      const h = Math.max(...cells.map((c) => c.h)) * 1 + 2 * pad;
      if (this.y + h > this.bas) { this.page(this.pg.chap, { titre: this.pg.titre, format: this.pg.format, paysage: this.pg.land }); this._t('(suite)', X, this.y + 7, 7, false, COL.ink3); this.y += 11; entete(); }
      cells.forEach((cl, i) => this._drawCell(cl, xs[i], ws[i], this.y + pad, cols[i].al, pad));
      this.y += h;
      const cx = this.c; cx.strokeStyle = COL.rule; cx.lineWidth = 0.4; cx.beginPath(); cx.moveTo(X, this.y); cx.lineTo(X + W, this.y); cx.stroke();
    });
    this.y += o.apres != null ? o.apres : 8;
  }
  _cell(s, x, w, y, size, bold, color, al, pad) {
    const tx = al === 'r' ? x + w - pad : al === 'c' ? x + w / 2 : x + pad;
    this._t(s, tx, y, size, bold, color, al === 'r' ? 'right' : al === 'c' ? 'center' : 'left');
  }
  _prep(v, w, size) {
    const cell = v && typeof v === 'object' ? v : { t: v == null ? '' : String(v) };
    const sz = cell.petit ? size * 0.88 : size, lh = sz * 1.3;
    const lignes = couper(cell.t == null ? '' : String(cell.t), sz, !!cell.b, w);
    const tag = cell.ctrl ? { t: CONF[cell.ctrl], c: CTRL_COL[cell.ctrl] } : cell.st ? { t: LIB_STATUT[cell.st] || cell.st, c: cell.st === 'estimee' ? COL.est : COL.ink3, f: cell.st === 'estimee' ? COL.estFond : null } : cell.manquante ? { t: 'Manquante', c: COL.manq } : null;
    let h = (lignes.length && lignes.join('') ? lignes.length : 0) * lh;
    if (tag) h += 9.5;
    return { cell, lignes, tag, sz, lh, h: Math.max(h, lh) };
  }
  _drawCell(p, x, w, y, al, pad) {
    let yy = y;
    for (const l of p.lignes) { if (l) this._cell(l, x, w, yy + p.sz, p.sz, !!p.cell.b, p.cell.c || COL.ink, al, pad); yy += p.lh; }
    if (!p.lignes.join('')) yy = y;
    if (p.tag) {
      const c = this.c, ts = 6, tw = textWidth(p.tag.t, ts, true) + 6;
      const tx = al === 'r' ? x + w - pad - tw : al === 'c' ? x + (w - tw) / 2 : x + pad;
      if (p.tag.f) { c.fillStyle = p.tag.f; c.fillRect(tx, yy + 1, tw, 8); }
      c.strokeStyle = p.tag.c; c.lineWidth = 0.5; c.strokeRect(tx, yy + 1, tw, 8);
      this._t(p.tag.t, tx + 3, yy + 7.2, ts, true, p.tag.c);
    }
  }
  /* cartouche et numéros de page, écrits à la fin (on connaît alors le nombre de pages) */
  finir() {
    const N = this.pages.length, info = this.info;
    this.pages.forEach((pg, i) => {
      const c = pg.ctx; this.c = c; this.pg = pg;
      const fx = MARGE, fy = MARGE, fw = pg.W - 2 * MARGE, fh = pg.H - 2 * MARGE;
      c.setLineDash([]); c.strokeStyle = COL.ink; c.lineWidth = 0.9; c.strokeRect(fx, fy, fw, fh);
      const cy = fy + fh - CART_H;
      c.lineWidth = 0.6; c.beginPath(); c.moveTo(fx, cy); c.lineTo(fx + fw, cy); c.stroke();
      const c1 = fx + Math.min(230, fw * 0.36), c3 = fx + fw - 150;
      c.beginPath(); c.moveTo(c1, cy); c.lineTo(c1, cy + CART_H); c.moveTo(c3, cy); c.lineTo(c3, cy + CART_H); c.stroke();
      const cut = (s, size, bold, w) => { let t = String(s || ''); while (t.length > 3 && textWidth(t, size, bold) > w) t = t.slice(0, -2) + '…'; return t; };
      // bloc projet
      this._t('CALQUE', fx + 8, cy + 11, 6, true, COL.accent);
      this._t(cut(info.projet, 10, true, c1 - fx - 16), fx + 8, cy + 24, 10, true);
      const l2 = [info.client, info.adresse].filter(Boolean).join(' · ');
      if (l2) this._t(cut(l2, 7, false, c1 - fx - 16), fx + 8, cy + 35, 7, false, COL.ink2);
      const l3 = [info.entreprise, info.auteur ? 'Établi par ' + info.auteur : ''].filter(Boolean).join(' · ');
      if (l3) this._t(cut(l3, 7, false, c1 - fx - 16), fx + 8, cy + 45, 7, false, COL.ink2);
      // bloc document
      this._t(cut(pg.titre, 10.5, true, c3 - c1 - 16), c1 + 8, cy + 18, 10.5, true);
      this._t(cut(['Dossier électrique', info.affaire ? 'Affaire ' + info.affaire : '', info.variante ? 'Variante ' + info.variante : '', pg.echelle].filter(Boolean).join(' · '), 7.5, false, c3 - c1 - 16), c1 + 8, cy + 30, 7.5, false, COL.ink2);
      this._t(cut(`Règles : ${info.regles} · Statuts des données : vérifiée, saisie, estimée`, 6.3, false, c3 - c1 - 16), c1 + 8, cy + 44, 6.3, false, COL.ink3);
      // bloc révision
      const rows = [['Indice', info.indice ? info.indice.i : '— (non diffusé)'], ['Date', info.indice ? fmtJourCourt(info.indice.date) : fmtJourCourt(info.date)], ['Page', `${i + 1} / ${N}`]];
      rows.forEach(([a, b], k) => {
        const y = cy + 14 + k * 14;
        this._t(a, c3 + 8, y, 7, false, COL.ink2);
        this._t(b, fx + fw - 8, y, a === 'Indice' ? 10 : 8, true, COL.ink, 'right');
      });
    });
    // sommaire de la page de garde
    if (this.sommaire) {
      const pg = this.sommaire.pg; this.c = pg.ctx; this.pg = pg;
      let y = this.sommaire.y;
      for (const ch of CHAPITRES) {
        if (!this.premieres.has(ch.id)) continue;
        const n = this.premieres.get(ch.id);
        this._t(ch.n, pg.corps.x, y, 9, false);
        const c = this.c; c.strokeStyle = COL.rule; c.lineWidth = 0.4; c.setLineDash([1, 2]); c.beginPath(); c.moveTo(pg.corps.x + textWidth(ch.n, 9) + 6, y - 2); c.lineTo(pg.corps.x + pg.corps.w - 26, y - 2); c.stroke(); c.setLineDash([]);
        this._t(String(n), pg.corps.x + pg.corps.w, y, 9, true, COL.ink, 'right');
        y += 14;
      }
    }
  }
}

/* ---------------- chapitres ---------------- */
const V = (d, unite, dec) => (d == null || d.v == null || !Number.isFinite(d.v) ? { t: '', manquante: true } : { t: fmt(d.v, dec == null ? 0 : dec) + (unite ? ' ' + unite : ''), st: d.st });
const lvName = (plan) => new Map((plan.levels || []).map((l) => [l.id, l.name]));

function chapGarde(R, plan, o) {
  const info = R.info;
  R.page('garde', { titre: 'Page de garde' });
  R.y += 40;
  R._t('DOSSIER ÉLECTRIQUE', R.pg.corps.x, R.y, 9, true, COL.accent); R.y += 26;
  for (const l of couper(info.projet, 24, true, R.pg.corps.w)) { R._t(l, R.pg.corps.x, R.y, 24, true); R.y += 28; }
  const sous = [info.client, info.adresse].filter(Boolean).join(' · ');
  if (sous) { R._t(sous, R.pg.corps.x, R.y, 11, false, COL.ink2); R.y += 16; }
  R._t(`Indice ${info.indice ? info.indice.i + ' du ' + fmtJour(info.indice.date) : '— : dossier non diffusé (aucun indice enregistré)'}`, R.pg.corps.x, R.y, 10, true); R.y += 14;
  if (info.variante) { R._t('Variante : ' + info.variante, R.pg.corps.x, R.y, 9.5, true, COL.accent); R.y += 14; }
  R._t(`Édité le ${fmtJour(info.date)}${info.auteur ? ' par ' + info.auteur : ''}${info.entreprise ? ' (' + info.entreprise + ')' : ''}`, R.pg.corps.x, R.y, 8.5, false, COL.ink2); R.y += 30;
  R.titre('Sommaire', 2);
  R.sommaire = { pg: R.pg, y: R.y + 9 };
  R.y += 14 * CHAPITRES.length + 14;
  R.titre('Révisions', 2);
  const revs = (plan.doc && plan.doc.revisions) || [];
  if (revs.length) R.tableau([{ t: 'Indice', w: 0.6 }, { t: 'Date', w: 1 }, { t: 'Objet de la révision', w: 3.2 }, { t: 'Par', w: 1.2 }, { t: 'Règles', w: 1.4 }],
    revs.slice().reverse().map((r) => [{ t: r.i, b: true }, fmtJourCourt(r.date), r.objet || '—', r.par || '', { t: r.regles || '—', petit: true }]));
  else R.texte('Aucun indice enregistré : ce dossier est un document de travail. Enregistrez un indice (A, B, C…) au moment de le diffuser.', { color: COL.ink2 });
  R.titre('Lecture du dossier', 2);
  R.tableau([{ t: 'Mention', w: 1.2 }, { t: 'Signification', w: 5 }], [
    [{ t: '', st: 'verifiee' }, 'Donnée vérifiée : sa source est indiquée (fiche du fabricant, fichier photométrique, extrait Legrand…).'],
    [{ t: '', st: 'saisie' }, 'Donnée saisie par l’utilisateur, sans source vérifiée.'],
    [{ t: '', st: 'estimee' }, 'Donnée estimée par Calque (mesure sur le plan, valeur par défaut, calcul simplifié) : à confirmer avant commande ou exécution.'],
    [{ t: '', manquante: true }, 'Donnée manquante : rien n’a été inventé à sa place ; le résultat qui en dépend n’est pas calculé.'],
    [{ t: '', ctrl: 'conforme' }, 'Règle vérifiée, avec sa source et l’édition de la norme, à partir de données connues.'],
    [{ t: '', ctrl: 'non_conforme' }, 'Règle non respectée d’après les données du plan.'],
    [{ t: '', ctrl: 'verification' }, 'Règle non vérifiable par Calque (tableau de la norme non fourni, donnée manquante) : à vérifier par un professionnel.'],
  ]);
  R.encadre('Ce dossier est établi à partir du plan Calque. Il ne remplace ni l’étude d’un bureau d’études, ni l’avis d’un électricien qualifié, ni l’attestation de conformité exigée pour la mise en service. Les tableaux de la NF C 15-100 utilisés viennent uniquement des extraits Legrand fournis ; le texte de la norme n’est pas reproduit.');
}

function chapPlans(R, plan, o) {
  const niveaux = (plan.levels || []).filter((l) => !o.niveaux || o.niveaux.includes(l.id));
  if (!o.dessinerPlan) { R.page('plans'); R.texte('Plans non disponibles : le dessin du plan se fait depuis l’application.', { color: COL.ink2 }); return; }
  let n = 0;
  for (const L of niveaux) {
    const pg = R.page('plans', { titre: `Plan technique · ${L.name}`, format: o.formatPlans || 'A4', paysage: o.paysagePlans !== false, helv: false });
    const r = o.dessinerPlan(pg.ctx, { x: pg.corps.x - 6, y: pg.corps.y - 8, w: pg.corps.w + 12, h: pg.corps.h + 16 }, L);
    if (!r) { R.texte(`${L.name} : niveau vide.`, { color: COL.ink2 }); continue; }
    pg.echelle = r.echelle || null; n++;
  }
  if (!niveaux.length) { R.page('plans'); R.texte('Aucun niveau.', { color: COL.ink2 }); }
  return n;
}

/* plans électriques : une page par vue et par niveau (vues de calques.js), légende automatique (symboles, circuits,
   conducteurs). Un niveau sans rien à montrer dans une vue est sauté. */
const VUES_DOSSIER = [['implantation', 'Plan d’implantation électrique'], ['cablage', 'Plan de câblage'], ['eclairage', 'Plan d’éclairage'],
  ['prises', 'Plan des prises'], ['specialises', 'Plan des équipements spécialisés'], ['faibles', 'Plan des courants faibles']];
function chapPlansElec(R, plan, o) {
  const niveaux = (plan.levels || []).filter((l) => !o.niveaux || o.niveaux.includes(l.id));
  if (!o.dessinerPlan) { R.page('plans_elec'); R.texte('Plans non disponibles : le dessin du plan se fait depuis l’application.', { color: COL.ink2 }); return 0; }
  const vues = VUES_DOSSIER.filter(([id]) => !o.vuesPlans || o.vuesPlans.includes(id));
  let n = 0;
  for (const [vue, titre] of vues) for (const L of niveaux) {
    if (o.vueAContenu && !o.vueAContenu(vue, L.id)) continue;
    const pg = R.page('plans_elec', { titre: `${titre} · ${L.name}`, format: o.formatPlans || 'A4', paysage: o.paysagePlans !== false, helv: false });
    const r = o.dessinerPlan(pg.ctx, { x: pg.corps.x - 6, y: pg.corps.y - 8, w: pg.corps.w + 12, h: pg.corps.h + 16 }, L, { vue });
    if (!r) { R.texte(`${L.name} : niveau vide.`, { color: COL.ink2 }); continue; }
    pg.echelle = r.echelle || null; n++;
  }
  if (!n) { R.page('plans_elec'); R.texte('Aucun appareil électrique à montrer.', { color: COL.ink2 }); }
  return n;
}

function chapSVG(R, id, svg, titre, o) {
  if (!svg) { R.page(id, { titre }); R.texte('Pas encore de tableau : générez-le depuis le plan (Tableau électrique).', { color: COL.ink2 }); return; }
  const pg = R.page(id, { titre, format: o.formatSchemas || 'A4', paysage: true });
  const r = dessinerSVG(pg.ctx, svg, pg.corps, { serre: 0.84 });
  pg.echelle = 'sans échelle';
  return r;
}

function chapNomenclature(R, plan, o) {
  R.page('nomenclature');
  const nums = reperes(plan), rn = reperesDD(plan), bil = o.bilan || bilanDuPlan(plan), byId = new Map(bil.lignes.map((l) => [l.id, l]));
  R.titre('Nomenclature des circuits');
  const circs = (plan.circuits || []).slice().sort((a, b) => (+nums.get(a.id).slice(1)) - (+nums.get(b.id).slice(1)));
  if (!circs.length) R.texte('Aucun circuit : générez le tableau depuis le plan.', { color: COL.ink2 });
  else R.tableau([{ t: 'Repère', w: 0.6 }, { t: 'Désignation', w: 2.2 }, { t: 'Type', w: 1.5 }, { t: 'Protection', w: 0.9, al: 'r' }, { t: 'Section', w: 0.9, al: 'r' }, { t: 'Différentiel', w: 0.9 }, { t: 'Appareils reliés', w: 0.9, al: 'r' }, { t: 'Puissance', w: 1.1, al: 'r' }],
    circs.map((c) => {
      const l = byId.get(c.id) || {}, n = (plan.elec || []).filter((e) => e.cid === c.id).length;
      const r = (plan.rcds || []).find((x) => x.id === c.rcd);
      return [{ t: nums.get(c.id), b: true }, c.name, (CK[c.kind] || { n: 'Autre' }).n, Number.isFinite(c.cal) ? c.cal + ' A' : { t: '', manquante: true }, Number.isFinite(c.sec) ? fmt(c.sec, 1) + ' mm²' : { t: '', manquante: true },
        r ? `${rn.get(r.id)} ${r.type} ${r.cal} A` : { t: 'aucun', c: COL.bad }, String(n), l.P != null ? { t: fmt(l.P, 0) + ' W', st: l.Pst } : { t: '', manquante: true }];
    }));
  R.titre('Interrupteurs différentiels', 2);
  const rcds = plan.rcds || [];
  if (!rcds.length) R.texte('Aucun interrupteur différentiel.', { color: COL.ink2 });
  else R.tableau([{ t: 'Repère', w: 0.7 }, { t: 'Type', w: 0.6 }, { t: 'Calibre', w: 0.7, al: 'r' }, { t: 'Sensibilité', w: 0.8, al: 'r' }, { t: 'Circuits protégés', w: 4 }],
    rcds.map((r) => [{ t: rn.get(r.id), b: true }, r.type, r.cal + ' A', '30 mA', (plan.circuits || []).filter((c) => c.rcd === r.id).map((c) => nums.get(c.id) + ' ' + c.name).join(', ') || '—']));
  /* nomenclature du tableau (appareils modulaires regroupés, repères) : nomenclature.js */
  const nt = nomenclatureTableau(plan, nums, rn, o.layCoffret || null);
  if (nt.lignes.length) {
    R.titre('Nomenclature du tableau', 2);
    R.tableau([{ t: 'Groupe', w: 1.4 }, { t: 'Désignation', w: 3 }, { t: 'Qté', w: 0.5, al: 'r' }, { t: 'Repères', w: 2 }, { t: 'Fiabilité', w: 0.8 }],
      nt.lignes.map((l) => [l.groupe, l.des, { t: String(l.qte), b: true }, l.reperes.join(', ') || '—', l.st === 'estimee' ? { t: 'Estimée', st: 'estimee' } : 'Lue']));
  }
  R.titre('Nomenclature des appareils (symboles du plan)', 2);
  const names = lvName(plan), rows = [];
  for (const L of plan.levels || []) {
    const els = (plan.elec || []).filter((e) => e.lv === L.id), types = new Map();
    for (const e of els) types.set(e.type, (types.get(e.type) || 0) + 1);
    for (const [t, n] of [...types.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(b[0]))) {
      const d = ELEC_BY.get(t), ref = refsDe(els.filter((e) => e.type === t), o);
      rows.push([names.get(L.id), d ? d.n : t, { t: String(n), b: true }, ref]);
    }
  }
  if (!rows.length) R.texte('Aucun symbole électrique sur le plan.', { color: COL.ink2 });
  else R.tableau([{ t: 'Niveau', w: 1.2 }, { t: 'Appareil', w: 2.6 }, { t: 'Quantité', w: 0.7, al: 'r' }, { t: 'Référence (bibliothèque technique)', w: 2.6 }], rows);
}
/* référence fabricant des symboles : seulement celle enregistrée par l'utilisateur, avec sa fiabilité ; sinon « non renseignée » */
function refsDe(els, o) {
  const f = o.referenceDe; if (!f) return { t: 'non renseignée', c: COL.ink3 };
  const refs = new Map();
  for (const e of els) { const r = f(e); if (r && r.ref) refs.set(r.ref + '|' + (r.fiab || ''), r); }
  if (!refs.size) return { t: 'non renseignée', c: COL.ink3 };
  const l = [...refs.values()];
  return { t: l.map((r) => [r.fab, r.ref].filter(Boolean).join(' ')).join(' ; '), st: l.every((r) => r.fiab === 'verifiee') ? 'verifiee' : l.some((r) => r.fiab === 'estimee') ? 'estimee' : 'saisie' };
}

function chapBilan(R, plan, o) {
  R.page('bilan');
  const b = o.bilan || bilanDuPlan(plan), nums = reperes(plan);
  R.titre('Bilan de puissance');
  R.texte(`Réseau : ${b.reseau.v === 'tri' ? 'triphasé 400 V' : 'monophasé 230 V'} (${LIB_STATUT[b.reseau.st].toLowerCase()}).${b.complet ? '' : ' Bilan partiel : seuls les circuits dont les données sont connues sont comptés (valeurs minimales).'}`);
  if (!b.lignes.length) { R.texte('Aucun circuit.', { color: COL.ink2 }); return; }
  R.tableau([{ t: 'Repère', w: 0.6 }, { t: 'Circuit', w: 2.2 }, { t: 'Phase', w: 0.7 }, { t: 'P', w: 1, al: 'r' }, { t: 'cos φ', w: 0.7, al: 'r' }, { t: 'Q', w: 0.9, al: 'r' }, { t: 'S', w: 0.9, al: 'r' }, { t: 'IB', w: 0.8, al: 'r' }, { t: 'Manquant', w: 1.6 }],
    b.lignes.map((l) => [{ t: nums.get(l.id), b: true }, l.nom, l.phase ? { t: l.phase, st: l.phaseSt } : '—', l.P != null ? { t: fmt(l.P, 0) + ' W', st: l.Pst } : { t: '', manquante: true },
      l.cos != null ? fmt(l.cos, 2) : { t: '', manquante: true }, l.Q != null ? fmt(l.Q, 0) + ' var' : '—', l.S != null ? fmt(l.S, 0) + ' VA' : '—', l.IB != null ? fmt(l.IB, 1) + ' A' : '—', { t: l.manquantes.join(', ') || '—', petit: true }]));
  R.titre('Totaux', 2);
  const kva = (x) => (x == null ? { t: '', manquante: true } : fmt(x / 1000, 2) + ' kVA');
  R.tableau([{ t: 'Grandeur', w: 3 }, { t: 'Valeur', w: 1.5, al: 'r' }], [
    ['Puissance active installée (circuits connus)', fmt(b.Pinstallee / 1000, 2) + ' kW'],
    ['Puissance apparente installée', kva(b.Sinstallee)],
    ['Coefficient de simultanéité ks', b.ks ? { t: fmt(b.ks.v, 2), st: b.ks.st } : { t: '', manquante: true }],
    ['Puissance apparente appelée', kva(b.Sappelee)],
    ['Puissance souscrite', b.souscrite ? { t: fmt(b.souscrite.v / 1000, 0) + ' kVA', st: b.souscrite.st } : { t: '', manquante: true }],
  ]);
  for (const m of b.manquantes) R.texte(`Manquant — ${m.nom} : ${m.pourquoi}`, { color: COL.manq, size: 8 });
  for (const a of b.alertes) R.texte(a.texte, { color: a.niveau === 'bad' ? COL.bad : COL.ink2, size: 8 });
  const eq = o.equilibrage || equilibrageDuPlan(plan, b);
  if (eq && eq.applicable) {
    R.titre('Équilibrage des phases (courants d’emploi)', 2);
    R.tableau([{ t: 'Phase', w: 1 }, { t: 'Courant actuel', w: 1.3, al: 'r' }, { t: 'Répartition proposée', w: 1.3, al: 'r' }],
      ['L1', 'L2', 'L3'].map((k) => [k, fmt(eq[k], 1) + ' A', fmt(eq.proposition[k], 1) + ' A']));
    R.texte(`Déséquilibre actuel : ${fmt(eq.desequilibre, 0)} % ; proposé : ${fmt(eq.proposition.desequilibre, 0)} %.${eq.sansPhase.length ? ' Sans phase : ' + eq.sansPhase.join(', ') + '.' : ''}${eq.sansI.length ? ' Courant inconnu : ' + eq.sansI.join(', ') + '.' : ''}`, { size: 8 });
  }
}

function chapMetres(R, plan, o) {
  R.page('metres');
  const nums = reperes(plan), names = lvName(plan);
  R.titre('Longueurs des circuits');
  R.encadre('Toutes les longueurs et quantités de ce chapitre sont ESTIMÉES : mesurées sur le plan, le long des gaines tracées, avec la réserve indiquée. À vérifier sur place avant commande.', COL.est);
  const lignes = lignesCircuits(plan);
  const m = (cm) => (cm == null ? '—' : fmt(cm / 100, 1) + ' m');
  if (!lignes.length) R.texte('Aucun circuit.', { color: COL.ink2 });
  else R.tableau([{ t: 'Repère', w: 0.6 }, { t: 'Circuit', w: 2 }, { t: 'Points raccordés', w: 0.9, al: 'r' }, { t: 'Vol d’oiseau', w: 0.9, al: 'r' }, { t: 'Point le plus éloigné', w: 1, al: 'r' }, { t: 'Câble', w: 0.9, al: 'r' }, { t: 'À commander', w: 1, al: 'r' }, { t: 'L de la fiche', w: 1, al: 'r' }],
    lignes.map((l) => [{ t: nums.get(l.c.id), b: true }, { t: l.c.name + (l.ch.raison ? '\n' + l.ch.raison : ''), petit: !!l.ch.raison }, l.ch.points.length ? `${l.ch.atteints} / ${l.ch.points.length}` : '—',
      l.ch.Lgeo != null ? { t: m(l.ch.Lgeo), st: 'estimee' } : '—', l.ch.complet ? { t: m(l.ch.Lmax), st: 'estimee' } : '—', l.ch.arbre != null ? { t: m(l.ch.arbre), st: 'estimee' } : '—',
      l.cmd != null ? { t: fmt(l.cmd, 0) + ' m', st: 'estimee' } : '—', l.Lfiche ? { t: fmt(l.Lfiche.v, 1) + ' m', st: l.Lfiche.st } : { t: '', manquante: true }]));
  const res = lignes.res;
  if (res) R.texte(`Réserve de câble : ${fmt(res.v, 0)} % (${LIB_STATUT[res.st].toLowerCase()}${res.src ? ' — ' + res.src : ''}).`, { size: 8 });
  const rs = remplissageGaines(plan);
  if (rs.length) {
    R.titre('Remplissage des cheminements', 2);
    R.texte('Un câble par circuit dans chaque cheminement emprunté. Le taux maximal admis n’est pas couvert par l’extrait Legrand fourni : statut « vérification nécessaire ».', { size: 8 });
    R.tableau([{ t: 'Cheminement', w: 2 }, { t: 'Niveau', w: 1 }, { t: 'Circuits', w: 1.4 }, { t: 'Occupation', w: 1, al: 'r' }, { t: 'Statut', w: 1.3 }],
      rs.map((r) => [{ t: r.nom + (r.taille ? ' · ' + r.taille : '') + (r.taux == null && r.n ? '\nManque : ' + r.manquantes.join(' ; ') : ''), petit: r.taux == null && !!r.n }, names.get(r.lv) || '',
        r.n ? r.circuits.map((id) => nums.get(id)).join(', ') : '—', r.taux != null ? { t: fmt(r.taux, 1) + ' %', st: 'estimee' } : '—', { t: '', ctrl: r.controle.statut }]));
    const C = rs[0].controle; R.texte(`Règle : ${C.nom}. Source : ${C.source}. Édition : ${C.edition}.`, { size: 7, color: COL.ink2 });
  }
  const L = listeMateriel(plan);
  R.titre('Liste de matériel (estimation)', 2);
  R.texte(`Quantités mesurées sur le plan, réserve de ${fmt(L.reserve.v, 0)} % comprise, arrondies à l’unité supérieure. Aucune référence fabricant n’est inventée : à vérifier avant commande.`, { size: 8 });
  if (!L.lignes.length) R.texte('Rien à compter pour le moment : tracez les gaines des circuits.', { color: COL.ink2 });
  else R.tableau([{ t: 'Catégorie', w: 1 }, { t: 'Désignation', w: 2.2 }, { t: 'Quantité', w: 0.9, al: 'r' }, { t: 'Détail', w: 2.6 }],
    L.lignes.map((l) => [l.cat, l.des, { t: `${fmt(l.qte, 0)} ${l.unite}`, st: l.st }, { t: l.note, petit: true }]));
  if (L.sansLongueur.length) R.texte(`Conducteurs non comptés (circuits pas entièrement raccordés par les gaines) : ${L.sansLongueur.join(', ')}.`, { color: COL.bad, size: 8 });
  if (L.vertInconnues) R.texte(`${L.vertInconnues} verticale(s) non comptée(s) (pose de gaine non précisée) : longueurs sous-estimées.`, { color: COL.bad, size: 8 });
}

/* quantitatif complet et chiffrage : prix et temps saisis par l'utilisateur seulement ; total « partiel » s'il manque un prix */
function chapQuantitatif(R, plan, o) {
  R.page('quantitatif');
  const q = quantitatif(plan, { pieces: o.pieces || null }), ch = chiffrer(q, plan.chiffrage);
  const eur = (v) => new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v).replace(/[\u202F\u00A0]/g, ' ') + ' €';
  R.titre('Quantitatif et chiffrage');
  R.encadre('Appareils comptés sur le plan, protections lues dans le tableau ; cheminements et conducteurs ESTIMÉS (mesurés sur le plan, réserve comprise). Prix unitaires et temps de pose saisis par l’utilisateur : document estimatif, pas un devis contractuel.', COL.est);
  if (!ch.lignes.length) { R.texte('Rien à compter pour le moment.', { color: COL.ink2 }); return; }
  const prix = ch.chiffrees > 0;
  const ref = (l) => { const r = l.art && o.referenceDe ? o.referenceDe({ art: l.art }) : null; return r && r.ref ? '\n' + [r.fab, r.ref].filter(Boolean).join(' ') : ''; };
  const cols = [{ t: 'Catégorie', w: 1 }, { t: 'Désignation', w: 2.6 }, { t: 'Quantité', w: 0.8, al: 'r' }];
  if (prix) cols.push({ t: 'Prix unitaire HT', w: 0.9, al: 'r' }, { t: 'Total HT', w: 0.9, al: 'r' });
  R.tableau(cols, ch.lignes.map((l) => {
    const r = ref(l), row = [l.cat, { t: l.des + r, petit: !!r }, { t: `${fmt(l.qte, 0)} ${l.unite}`, st: l.st === 'estimee' ? 'estimee' : undefined, b: true }];
    if (prix) row.push(l.pu ? { t: eur(l.pu.v), st: l.pu.st } : { t: '', manquante: true }, l.total != null ? eur(l.total) : '—');
    return row;
  }));
  if (prix) {
    const part = ch.complet ? '' : ` — PARTIEL : ${ch.sansPrix} ligne${ch.sansPrix > 1 ? 's' : ''} sans prix`;
    const tot = [[`Fournitures HT${part}`, eur(ch.fournitures)]];
    if (ch.mainOeuvre != null) tot.push([`Main-d’œuvre HT (${fmt(ch.heures, 1)} h × ${fmt(ch.tauxH.v, 2)} €/h, ${ch.lignesAvecTemps} ligne${ch.lignesAvecTemps > 1 ? 's' : ''} avec un temps de pose)`, eur(ch.mainOeuvre)]);
    tot.push([{ t: `Total HT${ch.complet ? '' : ' partiel'}`, b: true }, { t: eur(ch.totalHT), b: true }]);
    if (ch.tva) tot.push([`TVA ${fmt(ch.tva.v, 1)} %`, eur(ch.montantTVA)], [{ t: `Total TTC${ch.complet ? '' : ' partiel'}`, b: true }, { t: eur(ch.totalTTC), b: true }]);
    else tot.push([{ t: 'TVA non saisie : total hors taxes seulement.', petit: true }, '']);
    R.titre('Totaux', 2);
    R.tableau([{ t: '', w: 4 }, { t: 'Montant', w: 1, al: 'r' }], tot);
  } else R.texte('Aucun prix saisi : quantités seules (onglet Tableau électrique › Quantitatif pour saisir les prix).', { size: 8, color: COL.ink2 });
  if (q.parPiece.length) {
    R.titre('Appareils par pièce', 2);
    const rows = [];
    for (const g of q.parPiece) g.lignes.forEach((l, i) => rows.push([i ? '' : g.niveau, i ? '' : { t: g.piece, b: true }, l.des, { t: `${fmt(l.qte, 0)} ${l.unite}`, b: true }]));
    R.tableau([{ t: 'Niveau', w: 1.1 }, { t: 'Pièce', w: 1.5 }, { t: 'Appareil', w: 2.8 }, { t: 'Quantité', w: 0.7, al: 'r' }], rows);
  }
  if (q.sansLongueur.length) R.texte(`Conducteurs non comptés (circuits pas entièrement raccordés par les gaines) : ${q.sansLongueur.join(', ')}.`, { color: COL.bad, size: 8 });
}

function chapEclairage(R, plan, o) {
  R.page('eclairage');
  R.titre('Études d’éclairage');
  R.encadre('Résultats ESTIMÉS par la méthode des lumens et un calcul point par point de la composante directe (réflexions ignorées). Ils ne remplacent pas l’étude photométrique d’un fabricant. Aucun éclairement réglementaire n’est fourni par Calque : la valeur visée est celle saisie par l’utilisateur.', COL.est);
  const etudes = plan.etudes || [];
  if (!etudes.length) { R.texte('Aucune étude d’éclairage dans ce plan (inspecteur d’une pièce › « Concevoir l’éclairage »).', { color: COL.ink2 }); return; }
  const names = lvName(plan), phs = plan.photometries || [];
  for (const et of etudes) {
    const lbl = (plan.rooms || []).find((r) => r.id === et.room);
    const L = (plan.levels || []).find((l) => l.id === et.lv);
    const piece = lbl && o.pieceDe ? o.pieceDe(lbl) : null;
    R.titre(`${lbl ? lbl.name : 'Pièce supprimée'} · ${names.get(et.lv) || ''}`, 2);
    if (!lbl || !piece || !L) { R.texte('Pièce introuvable ou contour non fermé : étude non calculée.', { color: COL.manq }); continue; }
    const symboles = (plan.elec || []).filter((e) => e.lv === et.lv);
    const ia = implantationActuelle(et, piece, L, symboles, phs);
    const en = ia.en;
    const D = (n, d, u, dec) => [n, d ? V(d, u, dec) : { t: '', manquante: true }, d && d.src ? { t: d.src, petit: true } : ''];
    R.tableau([{ t: 'Donnée', w: 2 }, { t: 'Valeur', w: 1.2, al: 'r' }, { t: 'Origine', w: 3 }], [
      ['Surface de la pièce', { t: fmt(piece.area / 10000, 2) + ' m²', st: 'estimee' }, { t: 'Contour mesuré sur le plan', petit: true }],
      D('Éclairement visé', en.E, 'lx'), D('Hauteur du plan utile', en.hu, 'cm'), D('Facteur de maintenance', en.mf, '', 2),
      en.u ? D('Facteur d’utilance', en.u, '', 2) : ['Facteur d’utilance', { t: 'calculé', st: 'estimee' }, { t: 'Part du flux qui atteint directement le plan utile', petit: true }],
    ]);
    for (const m of en.manquantes || []) R.texte(`Manquant — ${m.nom}${m.pourquoi ? ' : ' + m.pourquoi : ''}`, { color: COL.manq, size: 8 });
    R.texte(`Implantation actuelle : ${ia.n} luminaire${ia.n > 1 ? 's' : ''} dans la pièce${ia.sansFlux ? `, dont ${ia.sansFlux} sans flux connu (non comptés)` : ''}.`, { size: 8.5, bold: true });
    if (ia.res) {
      const r = ia.res;
      R.tableau([{ t: 'Résultat (estimé)', w: 2 }, { t: 'Valeur', w: 1.2, al: 'r' }], [
        ['Flux total des luminaires', { t: fmt(r.fluxTot, 0) + ' lm', st: 'estimee' }],
        ['Éclairement moyen', { t: fmt(r.Emoy, 0) + ' lx', st: 'estimee' }],
        ['Éclairement minimal (direct)', { t: fmt(r.Emin, 0) + ' lx', st: 'estimee' }],
        ['Uniformité U0 = Emin / Emoy (direct)', { t: fmt(r.U0, 2), st: 'estimee' }],
        ['Puissance installée', r.P != null ? { t: fmt(r.P, 0) + ' W', st: 'estimee' } : { t: '', manquante: true }],
        ['Puissance surfacique', r.Wm2 != null ? { t: fmt(r.Wm2, 1) + ' W/m²', st: 'estimee' } : { t: '', manquante: true }],
        ['Comparaison à l’éclairement visé', r.ok == null ? { t: '', manquante: true } : { t: r.ok ? 'atteint (estimation)' : 'non atteint (estimation)', c: r.ok ? COL.ok : COL.bad }],
      ]);
    }
    if ((et.lums || []).length && en.E) {
      const pr = propositions(et, piece, L, phs);
      if (pr.props.length) {
        R.texte('Propositions de Calque (estimations) :', { size: 8.5, bold: true });
        R.tableau([{ t: 'Proposition', w: 1.6 }, { t: 'Luminaire', w: 1.6 }, { t: 'Disposition', w: 0.9, al: 'r' }, { t: 'Emoy', w: 0.8, al: 'r' }, { t: 'U0', w: 0.6, al: 'r' }, { t: 'Puissance', w: 0.9, al: 'r' }],
          pr.props.map((p) => [p.titre, (TYPES_ECL[p.type] || {}).n || p.type, `${p.n} (${p.rows} × ${p.cols})`, { t: fmt(p.Emoy, 0) + ' lx', st: 'estimee' }, fmt(p.U0, 2), p.P != null ? { t: fmt(p.P, 0) + ' W', st: 'estimee' } : '—']));
      } else if (pr.aucun) R.texte('Aucune disposition étudiée n’atteint l’éclairement visé (estimation).', { size: 8, color: COL.bad });
    }
  }
}

/* rapport de contrôle : résultats du moteur de règles (regles.js), fournis par l'appelant */
function chapControles(R, plan, o) {
  R.page('controles');
  R.titre('Rapport de contrôle');
  const rap = o.rapport;
  if (!rap) { R.texte('Rapport non disponible.', { color: COL.ink2 }); return; }
  const s = rap.synthese;
  R.texte(`Moteur de règles ${rap.version} · ${s.total} contrôles : ${s.conforme} conforme${s.conforme > 1 ? 's' : ''}, ${s.non_conforme} non conforme${s.non_conforme > 1 ? 's' : ''}, ${s.verification} à vérifier.`, { bold: true });
  R.encadre(rap.avis, rap.global === 'non_conforme' ? COL.bad : COL.ver);
  const groupes = [...new Set(rap.resultats.map((r) => r.groupe))];
  for (const g of groupes) {
    R.titre(g, 2);
    R.tableau([{ t: 'Statut', w: 1.15 }, { t: 'Contrôle', w: 3.6 }, { t: 'Règle, source et édition', w: 2.6 }],
      rap.resultats.filter((r) => r.groupe === g).map((r) => [{ t: '', ctrl: r.statut },
        { t: r.detail + (r.objet ? ` (${r.objet})` : '') + (r.manquantes && r.manquantes.length ? '\nManquant : ' + r.manquantes.join(' ; ') : '') + (r.utilisees && r.utilisees.length ? '\nDonnées : ' + r.utilisees.join(' ; ') : '') },
        { t: `${r.nom} [${r.id} v${r.v}]\n${r.source}\n${r.edition}`, petit: true }]), { size: 7.2 });
  }
  if (rap.tablesManquantes && rap.tablesManquantes.length) {
    R.titre('Tableaux de la norme non fournis', 2);
    R.texte('Les contrôles qui en dépendent restent « vérification nécessaire » : ' + rap.tablesManquantes.join(' ; ') + '.', { size: 8 });
  }
}

/* suivi de chantier (phase 7) : avancement, réserves, photos, plans annotés, historique.
   Tout vient des cases et des saisies de l'utilisateur sur le chantier : statut de suivi, jamais de conformité. */
function chapChantier(R, plan, o) {
  R.page('chantier');
  const ch = plan.chantier || {}, nums = reperes(plan), names = lvName(plan), now = o.date || Date.now();
  const av = avancement(plan, { reperes: nums }), rs = resumeReserves(plan, now);
  const pc = (x) => (x == null ? '—' : x + ' %');
  R.titre('Suivi de chantier');
  R.encadre('Avancement et réserves saisis sur le chantier dans Calque (cases « posé », réserves, photos). Le statut d’une réserve (ouverte, en cours, levée) est un statut de suivi, pas un statut de conformité. Ce chapitre ne remplace ni le procès-verbal de réception ni l’attestation de conformité.');
  R.titre('Avancement', 2);
  R.tableau([{ t: 'Élément', w: 2.4 }, { t: 'Posés', w: 1, al: 'r' }, { t: 'Total', w: 1, al: 'r' }, { t: 'Avancement', w: 1, al: 'r' }], [
    [{ t: 'Appareils (symboles du plan)', b: true }, String(av.app.poses), String(av.app.n), pc(av.app.pct)],
    [{ t: 'Circuits (câble tiré et raccordé)', b: true }, String(av.circ.poses), String(av.circ.n), pc(av.circ.pct)],
    ...av.niveaux.map((n) => ['Appareils · ' + n.nom, String(n.poses), String(n.n), pc(n.pct)]),
  ]);
  if (av.parCircuit.length) R.tableau([{ t: 'Repère', w: 0.6 }, { t: 'Circuit', w: 2.4 }, { t: 'Appareils posés', w: 1.1, al: 'r' }, { t: 'Circuit posé', w: 1.3 }],
    av.parCircuit.slice().sort((a, b) => (+String(nums.get(a.id) || 'C0').slice(1)) - (+String(nums.get(b.id) || 'C0').slice(1)))
      .map((c) => [{ t: nums.get(c.id) || '', b: true }, c.nom, c.n ? `${c.poses} / ${c.n}` : '—', c.circuitPose ? { t: 'posé le ' + fmtJourCourt(c.circuitPose), c: COL.ok } : { t: 'non', c: COL.ink3 }]));
  R.titre('Réserves', 2);
  const lr = (ch.reserves || []).slice().sort((a, b) => a.n - b.n);
  R.texte(`${rs.total} réserve${rs.total > 1 ? 's' : ''} : ${rs.ouverte} ouverte${rs.ouverte > 1 ? 's' : ''}, ${rs.en_cours} en cours, ${rs.levee} levée${rs.levee > 1 ? 's' : ''}${rs.enRetard ? `, dont ${rs.enRetard} dont l’échéance est dépassée` : ''}.`, { bold: true });
  const byId = new Map((plan.elec || []).map((e) => [e.id, e]));
  if (lr.length) R.tableau([{ t: 'N°', w: 0.45 }, { t: 'Niveau', w: 0.9 }, { t: 'Réserve', w: 3 }, { t: 'Statut', w: 0.8 }, { t: 'Créée', w: 0.8 }, { t: 'Levée', w: 0.8 }, { t: 'Échéance', w: 0.8 }],
    lr.map((r) => {
      const st = STATUT_BY.get(r.statut) || { n: r.statut, c: COL.ink }, e = r.ref && r.ref.t === 'elec' ? byId.get(r.ref.id) : null;
      const app = e ? ((ELEC_BY.get(e.type) || {}).n || e.type) + (e.cid && nums.get(e.cid) ? ' (' + nums.get(e.cid) + ')' : '') : '';
      const nph = (ch.photos || []).filter((f) => f.reserve === r.id).length;
      return [{ t: String(r.n), b: true }, names.get(r.lv) || '', { t: (r.titre || 'Sans titre') + (r.detail ? '\n' + r.detail : '') + (app ? '\nAppareil : ' + app : '') + (nph ? `\n${nph} photo${nph > 1 ? 's' : ''}` : '') },
        { t: st.n, c: st.c, b: true }, r.cree ? fmtJourCourt(r.cree) : '—', r.leve ? fmtJourCourt(r.leve) : '—',
        r.echeance ? { t: fmtJourCourt(r.echeance) + (r.statut !== 'levee' && r.echeance < now ? ' (dépassée)' : ''), c: r.statut !== 'levee' && r.echeance < now ? COL.bad : COL.ink } : '—'];
    }), { size: 7.4 });
  else R.texte('Aucune réserve.', { color: COL.ink2 });
  /* plans annotés : niveaux qui portent des réserves, des photos ou des annotations */
  const lvUtiles = (plan.levels || []).filter((L) => ['reserves', 'photos', 'notes'].some((k) => (ch[k] || []).some((x) => x.lv === L.id)));
  if (o.dessinerPlanChantier) for (const L of lvUtiles) {
    const pg = R.page('chantier', { titre: `Plan de chantier · ${L.name}`, format: o.formatPlans || 'A4', paysage: true, helv: false });
    const r = o.dessinerPlanChantier(pg.ctx, { x: pg.corps.x - 6, y: pg.corps.y - 8, w: pg.corps.w + 12, h: pg.corps.h + 16 }, L);
    if (r) pg.echelle = r.echelle || null;
  }
  /* photos */
  const photos = ch.photos || [];
  if (photos.length) {
    R.page('chantier', { titre: 'Photos du chantier' });
    R.titre('Photos', 2);
    const cols = 3, gap = 10, W = R.pg.corps.w, cw = (W - gap * (cols - 1)) / cols, ih = cw * 0.75, cellH = ih + 30;
    let col = 0;
    for (const f of photos) {
      if (col === 0) R.place(cellH);
      const x = R.pg.corps.x + col * (cw + gap), y = R.y, c = R.c;
      const img = o.photos && o.photos.get(f.id);
      c.fillStyle = COL.fond; c.fillRect(x, y, cw, ih);
      if (img) { const k = Math.min(cw / img.w, ih / img.h), w = img.w * k, hh = img.h * k; c.drawImage(img, x + (cw - w) / 2, y + (ih - hh) / 2, w, hh); }
      else R._t(f.aFaire ? 'Photo à prendre' : 'Image absente de cet appareil', x + cw / 2, y + ih / 2, 8, true, f.aFaire ? COL.est : COL.ink3, 'center');
      const rr = f.reserve && (ch.reserves || []).find((r) => r.id === f.reserve);
      const l1 = [names.get(f.lv), f.at ? fmtJourCourt(f.at) : '', rr ? 'Réserve n° ' + rr.n : ''].filter(Boolean).join(' · ');
      R._t(couper(f.legende || 'Sans légende', 7.5, true, cw)[0], x, y + ih + 10, 7.5, true);
      R._t(couper(l1, 6.8, false, cw)[0] || '', x, y + ih + 20, 6.8, false, COL.ink2);
      col++; if (col === cols) { col = 0; R.y += cellH; }
    }
    if (col) R.y += cellH;
  }
  /* historique */
  const jr = ch.journal || [];
  R.titre('Historique du chantier', 2);
  if (!jr.length) R.texte('Aucun événement enregistré.', { color: COL.ink2 });
  else {
    const l = jr.slice().sort((a, b) => a.at - b.at).slice(-300).reverse();
    if (jr.length > l.length) R.texte(`${l.length} derniers événements sur ${jr.length}.`, { size: 8, color: COL.ink2 });
    R.tableau([{ t: 'Date', w: 1 }, { t: 'Événement', w: 5 }], l.map((j) => [new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(j.at)), j.txt]), { size: 7.2 });
  }
}

/* comparaison des variantes (phase 7) : tableau calculé par variantes.js, fourni par l'appelant */
function chapVariantes(R, plan, o) {
  R.page('variantes');
  R.titre('Comparaison des variantes');
  const c = o.comparaison;
  if (!c || c.cols.length < 2) { R.texte('Ce projet n’a pas plusieurs variantes (Menu › Variantes).', { color: COL.ink2 }); return; }
  R.encadre('Chaque variante est une autre version de l’électricité du même bâtiment. Quantités de matériel et éclairements : estimations de Calque (à vérifier avant commande). Contrôles : nombre de contrôles du moteur de règles par statut ; aucune variante n’est déclarée conforme globalement tant que tout n’est pas vérifié.');
  R.texte('Variantes : ' + c.cols.map((k) => k.nom + (k.principale ? ' (version principale)' : '') + (k.active ? ' — variante de ce dossier' : '')).join(' ; ') + '.', { bold: true });
  const fmtV = (x) => (x == null ? { t: '', manquante: true } : fmt(x, Number.isInteger(x) ? 0 : 1));
  const ST = { estimee: 'estimee', saisie: 'saisie' };
  for (const g of [...new Set(c.lignes.map((l) => l.groupe))]) {
    R.titre(g, 2);
    R.tableau([{ t: 'Élément', w: 3 }, ...c.cols.map((k) => ({ t: k.nom + (k.principale ? ' ★' : ''), w: 1.1, al: 'r' }))],
      c.lignes.filter((l) => l.groupe === g).map((l) => [{ t: l.nom, b: l.vals.some((x) => x !== l.vals[0]) }, ...l.vals.map((x) => { const v = fmtV(x); return ST[l.st] && x != null ? { t: v, st: ST[l.st] } : v; })]), { size: 7.4 });
  }
}

/* ---------------- assemblage ---------------- */
/* variante affichée (phase 7) : « Économique (variante non principale) » ; null sans variantes */
function varianteDe(plan) {
  const v = plan.variantes; if (!v || !Array.isArray(v.liste)) return null;
  const e = v.liste.find((x) => x.id === v.active); if (!e) return null;
  return e.nom + (v.active === v.principale ? ' (version principale)' : ' (variante non principale)');
}
function infoDossier(plan, o) {
  const d = nettoyerDoc(plan.doc);
  return { projet: plan.name || 'Plan', client: d.client, adresse: d.adresse, auteur: d.auteur, entreprise: d.entreprise, affaire: d.affaire,
    indice: indiceCourant(d), date: o.date || Date.now(), regles: o.rapport ? o.rapport.version : REGLES_VERSION, variante: varianteDe(plan) };
}
/* compose le dossier : renvoie les pages (PdfCtx) et la table des chapitres */
function composerDossier(plan, opts) {
  const o = opts || {};
  const choix = new Set(o.chapitres || CHAPITRES.map((c) => c.id));
  const R = new Redacteur(infoDossier(plan, o));
  if (choix.has('garde')) chapGarde(R, plan, o);
  if (choix.has('plans')) chapPlans(R, plan, o);
  if (choix.has('plans_elec')) chapPlansElec(R, plan, o);
  if (choix.has('unifilaire')) chapSVG(R, 'unifilaire', o.svgUnifilaire, 'Schéma unifilaire du tableau de répartition', o);
  if (choix.has('coffret')) chapSVG(R, 'coffret', o.svgCoffret, 'Coffret électrique (implantation des appareils)', o);
  if (choix.has('nomenclature')) chapNomenclature(R, plan, o);
  if (choix.has('bilan')) chapBilan(R, plan, o);
  if (choix.has('metres')) chapMetres(R, plan, o);
  if (choix.has('quantitatif')) chapQuantitatif(R, plan, o);
  if (choix.has('eclairage')) chapEclairage(R, plan, o);
  if (choix.has('controles')) chapControles(R, plan, o);
  if (choix.has('chantier')) chapChantier(R, plan, o);
  if (choix.has('variantes')) chapVariantes(R, plan, o);
  if (!R.pages.length) R.page('garde', { titre: 'Dossier vide' });
  R.finir();
  return { pages: R.pages, chapitres: [...R.premieres.entries()].map(([id, p]) => ({ id, n: (CHAP_BY.get(id) || {}).n, page: p })), info: R.info };
}
async function dossierPDF(plan, opts) {
  const d = composerDossier(plan, opts);
  const blob = await buildPdf(d.pages.map((p) => ({ W: p.W, H: p.H, ctx: p.ctx })), `${plan.name || 'Plan'} — dossier électrique${d.info.indice ? ' indice ' + d.info.indice.i : ''}`, { compress: !(opts && opts.compress === false) });
  return { blob, chapitres: d.chapitres, pages: d.pages.length, info: d.info };
}

export { CHAMPS_DOC, CHAPITRES, COL, FORMATS, Redacteur, composerDossier, couper, dossierPDF, indiceCourant, indiceSuivant,
  infoDossier, nettoyerDoc, reperes, reperesDD };

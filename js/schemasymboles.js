/* Calque — module « schemasymboles » : bibliothèque de symboles des schémas électriques (onglet « Schémas »).
   Sans écran (testable avec Node) : chaque symbole est dessiné avec l'API canvas (écran, PDF, SVG, DXF), en millimètres.
   Dessins inspirés des symboles graphiques usuels de la CEI 60617 (représentation simplifiée par Calque : ce n'est pas
   une reproduction de la norme). Le courant circule de haut en bas ; les bornes tombent sur la grille de 5 mm.

   Un symbole : { t, cat, n, pre (préfixe du repère : Q, KM, KA, S, H…), role ('bobine' | 'contact' | 'borne' | 'pot' |
   'renvoi' | null), bornes [{ n, x, y }], boite { x0, y0, x1, y1 }, draw(c, o) } ; o = { bornes: [noms affichés] }.
   Un contact appartient à l'appareil (bobine, relais thermique…) qui porte le même repère : renvois croisés. */

const T = 0.35; // épaisseur des traits (mm)

/* ---------------- primitives ---------------- */
function ln(c, x1, y1, x2, y2) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); }
function pl(c, pts, ferme) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); if (ferme) c.closePath(); c.stroke(); }
function rect(c, x, y, w, h, plein) { c.beginPath(); c.rect(x, y, w, h); if (plein) { c.fillStyle = plein; c.fill(); } c.stroke(); }
function cercle(c, x, y, r, plein) { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); if (plein) { c.fillStyle = plein; c.fill(); } c.stroke(); }
function tirets(c, x1, y1, x2, y2) { c.save(); c.setLineDash([1, 0.8]); ln(c, x1, y1, x2, y2); c.restore(); }
function txt(c, s, x, y, taille, gras, align) {
  c.save(); c.font = `${gras ? 'bold ' : ''}${taille || 2.5}px Helvetica, Arial, sans-serif`; c.textAlign = align || 'center'; c.textBaseline = 'middle';
  c.fillStyle = c.strokeStyle; c.fillText(s, x, y); c.restore();
}

/* ---------------- éléments de contacts (pôle vertical en x, bornes en (x, y0) et (x, y1)) ---------------- */
/* état forcé pendant le dessin (mode « Tester » des schémas) : { ferme: true | false, pos: 1 | 2 } ou null (position de repos) */
let ETAT = null;
/* contact à fermeture (NO) : lame inclinée qui ne touche pas le contact fixe (fermé en mode test : lame droite) */
function lameNO(c, x, y0 = -10, y1 = 10) { ln(c, x, y0, x, -4); ln(c, x, 4, x, y1); if (ETAT && ETAT.ferme === true) ln(c, x, 4, x - 0.6, -4); else ln(c, x, 4, x - 3.5, -4.5); }
/* contact à ouverture (NF) : lame qui passe derrière le contact fixe (crochet) ; ouvert en mode test : lame écartée */
function lameNF(c, x, y0 = -10, y1 = 10) { ln(c, x, y0, x, -4); ln(c, x, -4, x + 2.5, -4); ln(c, x, 4, x, y1); if (ETAT && ETAT.ferme === false) ln(c, x, 4, x - 3.5, -4.5); else ln(c, x, 4, x + 3, -5); }
/* fonction de contacteur (demi-cercle), de disjoncteur (croix), de sectionneur (trait) sur le contact fixe */
const fnContacteur = (c, x) => { c.beginPath(); c.arc(x, -4 - 1.2, 1.2, Math.PI * 0.5, Math.PI * 1.5, true); c.stroke(); };
const fnDisj = (c, x) => { ln(c, x - 1.3, -5.3, x + 1.3, -2.7); ln(c, x + 1.3, -5.3, x - 1.3, -2.7); };
const fnSect = (c, x) => ln(c, x - 1.5, -4, x + 1.5, -4);
/* commande mécanique : lien en tirets depuis le milieu de la lame vers la gauche */
const lienG = (c, x, dx = 8) => tirets(c, x - 1.75, 0, x - dx, 0);
const bouton = (c, x) => { lienG(c, x); ln(c, x - 8, -2, x - 8, 2); ln(c, x - 8, -2, x - 9, -2); ln(c, x - 8, 2, x - 9, 2); };
const manuel = (c, x) => { lienG(c, x); ln(c, x - 8, -2, x - 8, 2); };
const coupPoing = (c, x) => { lienG(c, x, 7); c.beginPath(); c.arc(x - 8.5, 0, 2.3, Math.PI * 0.5, Math.PI * 1.5); c.stroke(); ln(c, x - 8.5, -2.3, x - 8.5, 2.3); };
const galet = (c, x) => { lienG(c, x, 6.5); cercle(c, x - 8, 0, 1.5); };
const thermique = (c, x) => { lienG(c, x, 6); pl(c, [x - 6, -1.5, x - 7.5, -1.5, x - 7.5, 1.5, x - 9, 1.5]); };
/* temporisation (« parachute ») sur la lame */
const tempo = (c, x, travail) => { c.beginPath(); c.arc(x - 3.2, travail ? -2.5 : 2.5, 1.6, 0, Math.PI, !travail); c.stroke(); ln(c, x - 1.6, travail ? -2.5 : 2.5, x - 1.6, 0); };

/* ---------------- symboles ---------------- */
const B2 = [{ n: '1', x: 0, y: -10 }, { n: '2', x: 0, y: 10 }];
const poles = (n, noms) => { const b = []; for (let i = 0; i < n; i++) { b.push({ n: noms ? noms[i][0] : String(2 * i + 1), x: i * 10, y: -10 }); b.push({ n: noms ? noms[i][1] : String(2 * i + 2), x: i * 10, y: 10 }); } return b; };
const boite = (x0, y0, x1, y1) => ({ x0, y0, x1, y1 });

const SYMBOLES = [
  /* ---- protection et coupure ---- */
  { t: 'disj1', cat: 'protection', n: 'Disjoncteur unipolaire', pre: 'Q', bornes: poles(1), boite: boite(-5, -10, 3, 10), draw(c) { lameNO(c, 0); fnDisj(c, 0); } },
  { t: 'disj2', cat: 'protection', n: 'Disjoncteur bipolaire (1P+N)', pre: 'Q', bornes: poles(2), boite: boite(-5, -10, 13, 10), draw(c) { for (const x of [0, 10]) { lameNO(c, x); fnDisj(c, x); } tirets(c, -1.75, 0, 8.25, 0); } },
  { t: 'disj3', cat: 'protection', n: 'Disjoncteur tripolaire', pre: 'Q', bornes: poles(3), boite: boite(-5, -10, 23, 10), draw(c) { for (const x of [0, 10, 20]) { lameNO(c, x); fnDisj(c, x); } tirets(c, -1.75, 0, 18.25, 0); } },
  { t: 'disj4', cat: 'protection', n: 'Disjoncteur tétrapolaire (3P+N)', pre: 'Q', bornes: poles(4), boite: boite(-5, -10, 33, 10), draw(c) { for (const x of [0, 10, 20, 30]) { lameNO(c, x); fnDisj(c, x); } tirets(c, -1.75, 0, 28.25, 0); } },
  { t: 'disjmot', cat: 'protection', n: 'Disjoncteur moteur magnétothermique', pre: 'Q', bornes: poles(3), boite: boite(-11, -10, 23, 10), draw(c) { for (const x of [0, 10, 20]) { lameNO(c, x); fnDisj(c, x); } tirets(c, -1.75, 0, 18.25, 0); lienG(c, 0, 6); rect(c, -10, -2, 3, 4); } },
  { t: 'id2', cat: 'protection', n: 'Interrupteur différentiel bipolaire', pre: 'Q', bornes: poles(2), boite: boite(-6, -10, 16, 10), draw(c) { for (const x of [0, 10]) lameNO(c, x); tirets(c, -1.75, 0, 8.25, 0); c.beginPath(); c.ellipse(5, 6.5, 8, 1.6, 0, 0, Math.PI * 2); c.stroke(); txt(c, 'IΔn', 13.5, 2.5, 2); } },
  { t: 'id4', cat: 'protection', n: 'Interrupteur différentiel tétrapolaire', pre: 'Q', bornes: poles(4), boite: boite(-6, -10, 36, 10), draw(c) { for (const x of [0, 10, 20, 30]) lameNO(c, x); tirets(c, -1.75, 0, 28.25, 0); c.beginPath(); c.ellipse(15, 6.5, 18, 1.6, 0, 0, Math.PI * 2); c.stroke(); txt(c, 'IΔn', 33.5, 2.5, 2); } },
  { t: 'sect3', cat: 'protection', n: 'Interrupteur-sectionneur tripolaire', pre: 'Q', bornes: poles(3), boite: boite(-11, -10, 23, 10), draw(c) { for (const x of [0, 10, 20]) { lameNO(c, x); fnSect(c, x); } tirets(c, -1.75, 0, 18.25, 0); manuel(c, 0); } },
  { t: 'sectfus3', cat: 'protection', n: 'Sectionneur porte-fusibles tripolaire', pre: 'Q', bornes: poles(3), boite: boite(-11, -10, 23, 10), draw(c) { for (const x of [0, 10, 20]) { ln(c, x, -10, x, -4); ln(c, x, 6, x, 10); c.save(); c.translate(x, 6); c.rotate(-0.42); rect(c, -1.2, -10, 2.4, 6); ln(c, 0, -10, 0, 0); c.restore(); fnSect(c, x); } tirets(c, -2, 0, 18, 0); manuel(c, 0); } },
  { t: 'fusible', cat: 'protection', n: 'Fusible', pre: 'F', bornes: B2, boite: boite(-2, -10, 2, 10), draw(c) { ln(c, 0, -10, 0, 10); rect(c, -1.4, -4.5, 2.8, 9); } },
  { t: 'relth3', cat: 'protection', n: 'Relais thermique tripolaire', pre: 'F', bornes: poles(3), boite: boite(-4, -10, 24, 10), draw(c) { for (const x of [0, 10, 20]) { ln(c, x, -10, x, -3); ln(c, x, 3, x, 10); pl(c, [x, -3, x + 2, -3, x + 2, 3, x, 3]); } rect(c, -3, -5, 26, 10); } },
  { t: 'parafoudre', cat: 'protection', n: 'Parafoudre', pre: 'F', bornes: [{ n: '1', x: 0, y: -10 }, { n: 'PE', x: 0, y: 10 }], boite: boite(-3, -10, 3, 10), draw(c) { ln(c, 0, -10, 0, -5); ln(c, 0, 5, 0, 10); rect(c, -2.5, -5, 5, 10); pl(c, [0.8, -3.5, -0.8, 0.5, 0.8, -0.5, -0.8, 3.5]); } },
  /* ---- commande : appareils (bobines) ---- */
  { t: 'bobine_km', cat: 'commande', n: 'Bobine de contacteur', pre: 'KM', role: 'bobine', bornes: [{ n: 'A1', x: 0, y: -10 }, { n: 'A2', x: 0, y: 10 }], boite: boite(-5, -10, 5, 10), draw(c) { ln(c, 0, -10, 0, -3); ln(c, 0, 3, 0, 10); rect(c, -5, -3, 10, 6); } },
  { t: 'bobine_ka', cat: 'commande', n: 'Bobine de relais auxiliaire', pre: 'KA', role: 'bobine', bornes: [{ n: 'A1', x: 0, y: -10 }, { n: 'A2', x: 0, y: 10 }], boite: boite(-5, -10, 5, 10), draw(c) { ln(c, 0, -10, 0, -3); ln(c, 0, 3, 0, 10); rect(c, -5, -3, 10, 6); } },
  { t: 'bobine_kt', cat: 'commande', n: 'Bobine de relais temporisé (travail)', pre: 'KT', role: 'bobine', bornes: [{ n: 'A1', x: 0, y: -10 }, { n: 'A2', x: 0, y: 10 }], boite: boite(-8, -10, 5, 10), draw(c) { ln(c, 0, -10, 0, -3); ln(c, 0, 3, 0, 10); rect(c, -5, -3, 10, 6); rect(c, -8, -3, 3, 6); ln(c, -8, -3, -5, 3); ln(c, -8, 3, -5, -3); } },
  { t: 'bobine_tl', cat: 'commande', n: 'Télérupteur (bobine)', pre: 'KL', role: 'bobine', bornes: [{ n: 'A1', x: 0, y: -10 }, { n: 'A2', x: 0, y: 10 }], boite: boite(-5, -10, 5, 10), draw(c) { ln(c, 0, -10, 0, -3); ln(c, 0, 3, 0, 10); rect(c, -5, -3, 10, 6); pl(c, [-3, 1.5, -1, 1.5, -1, -1.5, 1, -1.5, 1, 1.5, 3, 1.5]); } },
  { t: 'minuterie', cat: 'commande', n: 'Minuterie (bobine)', pre: 'KT', role: 'bobine', bornes: [{ n: 'A1', x: 0, y: -10 }, { n: 'A2', x: 0, y: 10 }], boite: boite(-5, -10, 5, 10), draw(c) { ln(c, 0, -10, 0, -3); ln(c, 0, 3, 0, 10); rect(c, -5, -3, 10, 6); cercle(c, 0, 0, 2); ln(c, 0, 0, 0, -1.4); ln(c, 0, 0, 1.1, 0.6); } },
  /* ---- commande : contacts (appartiennent à l'appareil de même repère) ---- */
  { t: 'contact_no', cat: 'commande', n: 'Contact auxiliaire à fermeture (NO)', pre: 'KA', role: 'contact', type: 'NO', bornes: B2, boite: boite(-5, -10, 3, 10), draw(c) { lameNO(c, 0); } },
  { t: 'contact_nf', cat: 'commande', n: 'Contact auxiliaire à ouverture (NF)', pre: 'KA', role: 'contact', type: 'NF', bornes: B2, boite: boite(-3, -10, 4, 10), draw(c) { lameNF(c, 0); } },
  { t: 'contact_tno', cat: 'commande', n: 'Contact temporisé à la fermeture', pre: 'KT', role: 'contact', type: 'NO', bornes: B2, boite: boite(-6, -10, 3, 10), draw(c) { lameNO(c, 0); tempo(c, 0, true); } },
  { t: 'contact_tnf', cat: 'commande', n: 'Contact temporisé à l’ouverture', pre: 'KT', role: 'contact', type: 'NF', bornes: B2, boite: boite(-6, -10, 4, 10), draw(c) { lameNF(c, 0); tempo(c, 0, false); } },
  { t: 'contact_th', cat: 'commande', n: 'Contact du relais thermique (95-96)', pre: 'F', role: 'contact', type: 'NF', num: ['95', '96'], bornes: B2, boite: boite(-10, -10, 4, 10), draw(c) { lameNF(c, 0); thermique(c, 0); } },
  { t: 'km3', cat: 'puissance', n: 'Contacts de puissance de contacteur (3 pôles)', pre: 'KM', role: 'contact', type: 'P', pp: 3, bornes: poles(3), boite: boite(-5, -10, 23, 10), draw(c) { for (const x of [0, 10, 20]) { lameNO(c, x); fnContacteur(c, x); } tirets(c, -1.75, 0, 18.25, 0); } },
  { t: 'km2', cat: 'puissance', n: 'Contacts de puissance de contacteur (2 pôles)', pre: 'KM', role: 'contact', type: 'P', pp: 2, bornes: poles(2), boite: boite(-5, -10, 13, 10), draw(c) { for (const x of [0, 10]) { lameNO(c, x); fnContacteur(c, x); } tirets(c, -1.75, 0, 8.25, 0); } },
  /* ---- organes de commande ---- */
  { t: 'bp_no', cat: 'commande', n: 'Bouton-poussoir à fermeture (marche)', pre: 'S', bornes: [{ n: '13', x: 0, y: -10 }, { n: '14', x: 0, y: 10 }], boite: boite(-10, -10, 3, 10), draw(c) { lameNO(c, 0); bouton(c, 0); } },
  { t: 'bp_nf', cat: 'commande', n: 'Bouton-poussoir à ouverture (arrêt)', pre: 'S', bornes: [{ n: '11', x: 0, y: -10 }, { n: '12', x: 0, y: 10 }], boite: boite(-10, -10, 4, 10), draw(c) { lameNF(c, 0); bouton(c, 0); } },
  { t: 'au', cat: 'commande', n: 'Arrêt d’urgence (coup de poing)', pre: 'S', bornes: [{ n: '11', x: 0, y: -10 }, { n: '12', x: 0, y: 10 }], boite: boite(-11, -10, 4, 10), draw(c) { lameNF(c, 0); coupPoing(c, 0); } },
  { t: 'inter', cat: 'commande', n: 'Interrupteur (commande manuelle)', pre: 'S', bornes: B2, boite: boite(-10, -10, 3, 10), draw(c) { lameNO(c, 0); manuel(c, 0); } },
  { t: 'vv', cat: 'commande', n: 'Commutateur va-et-vient', pre: 'S', bornes: [{ n: 'C', x: 0, y: 10 }, { n: '1', x: -5, y: -10 }, { n: '2', x: 5, y: -10 }], boite: boite(-7, -10, 7, 10), draw(c) { ln(c, 0, 10, 0, 4); ln(c, -5, -10, -5, -4); ln(c, 5, -10, 5, -4); if (ETAT && ETAT.pos === 2) ln(c, 0, 4, 4.5, -4.5); else ln(c, 0, 4, -4.5, -4.5); cercle(c, 0, 4, 0.5, c.strokeStyle); } },
  { t: 'fdc', cat: 'commande', n: 'Interrupteur de position (fin de course)', pre: 'B', bornes: B2, boite: boite(-10, -10, 3, 10), draw(c) { lameNO(c, 0); galet(c, 0); } },
  { t: 'detecteur', cat: 'commande', n: 'Détecteur (3 fils)', pre: 'B', bornes: [{ n: '+', x: -5, y: -10 }, { n: '−', x: 5, y: -10 }, { n: 'S', x: 0, y: 10 }], boite: boite(-8, -10, 8, 10), draw(c) { ln(c, -5, -10, -5, -5); ln(c, 5, -10, 5, -5); ln(c, 0, 5, 0, 10); rect(c, -7.5, -5, 15, 10); pl(c, [0, -3, 3, 0, 0, 3, -3, 0], true); } },
  { t: 'voyant', cat: 'commande', n: 'Voyant lumineux', pre: 'H', bornes: [{ n: 'X1', x: 0, y: -10 }, { n: 'X2', x: 0, y: 10 }], boite: boite(-4, -10, 4, 10), draw(c) { ln(c, 0, -10, 0, -3.5); ln(c, 0, 3.5, 0, 10); cercle(c, 0, 0, 3.5); ln(c, -2.5, -2.5, 2.5, 2.5); ln(c, -2.5, 2.5, 2.5, -2.5); } },
  { t: 'sonnerie', cat: 'commande', n: 'Sonnerie / avertisseur', pre: 'H', bornes: B2, boite: boite(-5, -10, 5, 10), draw(c) { ln(c, 0, -10, 0, -2); ln(c, 0, 4, 0, 10); c.beginPath(); c.arc(0, 2, 4.5, Math.PI, 0); c.closePath(); c.stroke(); } },
  /* ---- récepteurs et puissance ---- */
  { t: 'moteur3', cat: 'puissance', n: 'Moteur triphasé', pre: 'M', bornes: [{ n: 'U', x: 0, y: -10 }, { n: 'V', x: 10, y: -10 }, { n: 'W', x: 20, y: -10 }], boite: boite(-1, -10, 21, 18), draw(c) { ln(c, 0, -10, 4.5, 0.5); ln(c, 10, -10, 10, -1.5); ln(c, 20, -10, 15.5, 0.5); cercle(c, 10, 7.5, 9); txt(c, 'M', 10, 5.5, 4.5, true); txt(c, '3~', 10, 10.5, 3); } },
  { t: 'moteur1', cat: 'puissance', n: 'Moteur monophasé', pre: 'M', bornes: [{ n: 'L', x: 0, y: -10 }, { n: 'N', x: 10, y: -10 }], boite: boite(-2, -10, 12, 13), draw(c) { ln(c, 0, -10, 1.8, -0.6); ln(c, 10, -10, 8.2, -0.6); cercle(c, 5, 5, 7); txt(c, 'M', 5, 3.5, 4, true); txt(c, '1~', 5, 7.5, 2.6); } },
  { t: 'lampe', cat: 'puissance', n: 'Lampe / point lumineux', pre: 'E', bornes: B2, boite: boite(-4, -10, 4, 10), draw(c) { ln(c, 0, -10, 0, -3.5); ln(c, 0, 3.5, 0, 10); cercle(c, 0, 0, 3.5); ln(c, -2.5, -2.5, 2.5, 2.5); ln(c, -2.5, 2.5, 2.5, -2.5); } },
  { t: 'chauffage', cat: 'puissance', n: 'Résistance / élément chauffant', pre: 'E', bornes: B2, boite: boite(-2, -10, 2, 10), draw(c) { ln(c, 0, -10, 0, -5); ln(c, 0, 5, 0, 10); rect(c, -1.8, -5, 3.6, 10); } },
  { t: 'prise', cat: 'puissance', n: 'Prise de courant (L, N)', pre: 'X', bornes: [{ n: 'L', x: 0, y: -10 }, { n: 'N', x: 10, y: -10 }], boite: boite(-1, -10, 11, 4), draw(c) { ln(c, 0, -10, 0, -3); ln(c, 10, -10, 10, -3); ln(c, 0, -3, 10, -3); c.beginPath(); c.arc(5, -3, 5, 0, Math.PI); c.stroke(); } },
  { t: 'transfo', cat: 'puissance', n: 'Transformateur monophasé', pre: 'T', bornes: [{ n: '1', x: -5, y: -15 }, { n: '2', x: 5, y: -15 }, { n: '3', x: -5, y: 15 }, { n: '4', x: 5, y: 15 }], boite: boite(-6, -15, 6, 15), draw(c) { ln(c, -5, -15, -5, -10); ln(c, 5, -15, 5, -10); ln(c, -5, -10, 5, -10); ln(c, 0, -10, 0, -7.5); ln(c, -5, 15, -5, 10); ln(c, 5, 15, 5, 10); ln(c, -5, 10, 5, 10); ln(c, 0, 10, 0, 7.5); cercle(c, 0, -3, 4.5); cercle(c, 0, 3, 4.5); } },
  { t: 'alim', cat: 'puissance', n: 'Alimentation (230 V ~ / 24 V =)', pre: 'G', bornes: [{ n: 'L', x: -5, y: -15 }, { n: 'N', x: 5, y: -15 }, { n: '+', x: -5, y: 15 }, { n: '−', x: 5, y: 15 }], boite: boite(-10, -15, 10, 15), draw(c) { for (const x of [-5, 5]) { ln(c, x, -15, x, -8); ln(c, x, 8, x, 15); } rect(c, -10, -8, 20, 16); ln(c, -10, 8, 10, -8); txt(c, '~', -5, -3.5, 4); txt(c, '=', 5, 3.5, 4); } },
  { t: 'variateur', cat: 'puissance', n: 'Variateur de vitesse', pre: 'U', bornes: [{ n: 'L1', x: -10, y: -15 }, { n: 'L2', x: 0, y: -15 }, { n: 'L3', x: 10, y: -15 }, { n: 'U', x: -10, y: 15 }, { n: 'V', x: 0, y: 15 }, { n: 'W', x: 10, y: 15 }], boite: boite(-15, -15, 15, 15), draw(c) { for (const x of [-10, 0, 10]) { ln(c, x, -15, x, -8); ln(c, x, 8, x, 15); } rect(c, -15, -8, 30, 16); ln(c, -15, 8, 15, -8); txt(c, '~', -7, -3.5, 4); txt(c, '~', 7, 3.5, 4); txt(c, 'f', 10, -4.5, 2.5); } },
  { t: 'compteur', cat: 'puissance', n: 'Compteur d’énergie', pre: 'P', bornes: B2, boite: boite(-7, -10, 7, 10), draw(c) { ln(c, 0, -10, 0, -5); ln(c, 0, 5, 0, 10); rect(c, -7, -5, 14, 10); txt(c, 'kWh', 0, 0, 3, true); } },
  { t: 'terre', cat: 'puissance', n: 'Prise de terre', pre: '', bornes: [{ n: 'PE', x: 0, y: -5 }], boite: boite(-4, -5, 4, 3), draw(c) { ln(c, 0, -5, 0, 0); ln(c, -4, 0, 4, 0); ln(c, -2.6, 1.3, 2.6, 1.3); ln(c, -1.2, 2.6, 1.2, 2.6); } },
  /* ---- automate ---- */
  { t: 'api_e4', cat: 'automate', n: 'Automate : 4 entrées', pre: 'A', bornes: [{ n: 'I0', x: 0, y: -10 }, { n: 'I1', x: 10, y: -10 }, { n: 'I2', x: 20, y: -10 }, { n: 'I3', x: 30, y: -10 }, { n: 'COM', x: 40, y: -10 }], boite: boite(-3, -10, 43, 8), draw(c) { for (const x of [0, 10, 20, 30, 40]) ln(c, x, -10, x, -2); rect(c, -3, -2, 46, 10); txt(c, 'ENTRÉES', 20, 3, 2.6, true); } },
  { t: 'api_s4', cat: 'automate', n: 'Automate : 4 sorties', pre: 'A', bornes: [{ n: 'Q0', x: 0, y: 10 }, { n: 'Q1', x: 10, y: 10 }, { n: 'Q2', x: 20, y: 10 }, { n: 'Q3', x: 30, y: 10 }, { n: 'COM', x: 40, y: 10 }], boite: boite(-3, -8, 43, 10), draw(c) { for (const x of [0, 10, 20, 30, 40]) ln(c, x, 2, x, 10); rect(c, -3, -8, 46, 10); txt(c, 'SORTIES', 20, -3, 2.6, true); } },
  /* ---- liaisons : bornes, potentiels, renvois ---- */
  { t: 'borne', cat: 'liaisons', n: 'Borne de bornier', pre: 'X', role: 'borne', bornes: [{ n: 'h', x: 0, y: -5 }, { n: 'b', x: 0, y: 5 }], boite: boite(-2, -5, 2, 5), draw(c) { ln(c, 0, -5, 0, -1.3); ln(c, 0, 1.3, 0, 5); cercle(c, 0, 0, 1.3); ln(c, -0.9, 0.9, 0.9, -0.9); } },
  { t: 'pot', cat: 'liaisons', n: 'Étiquette de potentiel (L1, N, 24 V…)', pre: '', role: 'pot', bornes: [{ n: 'p', x: 0, y: 0 }], boite: boite(-1, -3, 14, 3), draw(c) { pl(c, [0, 0, 2.5, -2.5, 13, -2.5, 13, 2.5, 2.5, 2.5], true); } },
  { t: 'renvoi', cat: 'liaisons', n: 'Renvoi vers un autre folio', pre: '', role: 'renvoi', bornes: [{ n: 'r', x: 0, y: 0 }], boite: boite(-1, -3, 14, 3), draw(c) { pl(c, [0, -2.5, 10, -2.5, 13, 0, 10, 2.5, 0, 2.5], true); } },
];
const SYM_BY = new Map(SYMBOLES.map((s) => [s.t, s]));
const CATEGORIES = [
  { id: 'protection', n: 'Protection et coupure' }, { id: 'commande', n: 'Commande' }, { id: 'puissance', n: 'Puissance et récepteurs' },
  { id: 'automate', n: 'Automate' }, { id: 'liaisons', n: 'Bornes et renvois' },
];

/* ---------------- géométrie d'un symbole posé ---------------- */
/* o : { t, x, y, rot (0, 90, 180, 270), mir (miroir) } → point du monde (mm) d'un point local */
function versMonde(o, px, py) {
  let x = o.mir ? -px : px, y = py;
  const r = ((o.rot || 0) % 360 + 360) % 360;
  if (r === 90) [x, y] = [-y, x]; else if (r === 180) [x, y] = [-x, -y]; else if (r === 270) [x, y] = [y, -x];
  return { x: Math.round((o.x + x) * 100) / 100, y: Math.round((o.y + y) * 100) / 100 };
}
function bornesDe(o) { const d = SYM_BY.get(o.t); return d ? d.bornes.map((b) => Object.assign({ n: b.n }, versMonde(o, b.x, b.y))) : []; }
function boiteDe(o) {
  const d = SYM_BY.get(o.t); if (!d) return { x0: o.x - 3, y0: o.y - 3, x1: o.x + 3, y1: o.y + 3 };
  const b = d.boite, pts = [versMonde(o, b.x0, b.y0), versMonde(o, b.x1, b.y1), versMonde(o, b.x0, b.y1), versMonde(o, b.x1, b.y0)];
  return { x0: Math.min(...pts.map((p) => p.x)), y0: Math.min(...pts.map((p) => p.y)), x1: Math.max(...pts.map((p) => p.x)), y1: Math.max(...pts.map((p) => p.y)) };
}
/* dessin d'un symbole posé (contexte canvas en mm) ; etat (facultatif, mode test) : position des contacts */
function dessinerSymbole(c, o, coul, etat) {
  const d = SYM_BY.get(o.t); if (!d) return;
  c.save(); c.translate(o.x, o.y);
  c.rotate(((o.rot || 0) * Math.PI) / 180); if (o.mir) c.scale(-1, 1);
  c.lineWidth = T; c.strokeStyle = coul || '#1D2125'; c.fillStyle = coul || '#1D2125'; c.lineCap = 'round'; c.lineJoin = 'round';
  ETAT = etat || null;
  try { d.draw(c); } finally { ETAT = null; }
  c.restore();
}

export { CATEGORIES, SYMBOLES, SYM_BY, T as EPAISSEUR, boiteDe, bornesDe, dessinerSymbole, versMonde };

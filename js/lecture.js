/* Calque — module « lecture » : lecture d'une sauvegarde complète par morceaux (« Importer un fichier »).
   Sans écran (Blob, TextDecoder) : testable avec Node.
   Une sauvegarde de chantier peut peser des centaines de Mo (photos en base64). La lire d'un coup (texte entier puis
   JSON.parse) demande environ deux fois sa taille en mémoire : sur iPad, Safari peut fermer l'onglet, au moment même
   où l'on restaure ses plans. Ici le fichier est parcouru par tranches de 4 Mo : chaque photo du tableau « photos »
   (au premier niveau) est lue seule et confiée par petits paquets à `parLot` (enregistrement) ; le reste (plans,
   bibliothèque) est gardé et relu à la fin, avec « photos »: [].
   Le résultat est exactement celui de JSON.parse sur le fichier entier (les photos étant remises une par une). */

const TRANCHE = 4 << 20; // octets lus à la fois
const LOT = 8; // photos confiées ensemble

/* fichier : Blob / File ; parLot(photos) : async, appelé pour chaque paquet. Renvoie { tete (objet, photos vidées), photos (nombre) }.
   Lève une erreur si le fichier n'est pas un JSON valide. */
async function lireSauvegarde(fichier, parLot, opts) {
  const tranche = (opts && opts.tranche) || TRANCHE;
  const dec = new TextDecoder('utf-8');
  let profondeur = 0, dansTexte = false, echap = false, avant = '', cle = '', lireCle = false, cleCourante = null;
  let mode = 0; // 0 : en-tête ; 1 : dans le tableau « photos » ; 2 : dans une photo
  const tete = [], elem = []; let lot = [], n = 0;
  for (let pos = 0; pos < fichier.size || pos === 0; pos += tranche) {
    const fin = pos + tranche >= fichier.size;
    const t = dec.decode(new Uint8Array(await fichier.slice(pos, pos + tranche).arrayBuffer()), { stream: !fin });
    let debut = 0; // début du segment à recopier (en-tête ou photo)
    const vider = (i) => { if (i > debut) (mode === 2 ? elem : mode === 0 ? tete : null)?.push(t.slice(debut, i)); debut = i; };
    for (let i = 0; i < t.length; i++) {
      let c = t.charCodeAt(i);
      if (dansTexte) {
        if (echap) { echap = false; if (lireCle) cle += t[i]; continue; }
        /* saut rapide jusqu'au prochain guillemet ou antislash (base64 : aucun) */
        const q = t.indexOf('"', i), b = t.indexOf('\\', i);
        const j = q < 0 ? b : b < 0 ? q : Math.min(q, b);
        if (j < 0) { if (lireCle) cle += t.slice(i); i = t.length; break; }
        if (lireCle) cle += t.slice(i, j);
        i = j; c = t.charCodeAt(i);
        if (c === 92) { echap = true; continue; }
        dansTexte = false; if (lireCle) { lireCle = false; cleCourante = cle; } avant = '"';
        continue;
      }
      if (c === 34) { dansTexte = true; lireCle = profondeur === 1 && (avant === '{' || avant === ','); if (lireCle) cle = ''; continue; }
      if (c === 32 || c === 10 || c === 13 || c === 9) continue;
      if (c === 123 || c === 91) { // { [
        if (mode === 0 && c === 91 && profondeur === 1 && avant === ':' && cleCourante === 'photos') {
          vider(i + 1); profondeur++; mode = 1; avant = '['; continue; // « [ » gardé dans l'en-tête, la suite non
        }
        if (mode === 1 && c === 123 && profondeur === 2) { vider(i); mode = 2; }
        profondeur++; avant = String.fromCharCode(c); continue;
      }
      if (c === 125 || c === 93) { // } ]
        profondeur--; avant = String.fromCharCode(c);
        if (mode === 2 && profondeur === 2) {
          vider(i + 1); mode = 1;
          lot.push(JSON.parse(elem.join(''))); elem.length = 0; n++;
          if (lot.length >= LOT) { await parLot(lot); lot = []; }
        } else if (mode === 1 && profondeur === 1) { debut = i; mode = 0; } // « ] » repris dans l'en-tête
        continue;
      }
      avant = String.fromCharCode(c);
    }
    vider(t.length);
    if (fin) break;
  }
  if (lot.length) await parLot(lot);
  if (dansTexte || profondeur !== 0) throw new Error('JSON incomplet');
  return { tete: JSON.parse(tete.join('')), photos: n };
}
/* une sauvegarde complète ? (premiers octets : {"format":"calque-backup", écrit en premier par Calque) */
async function estSauvegarde(fichier) {
  const debut = await fichier.slice(0, 200).text();
  return /^\s*\{\s*"format"\s*:\s*"calque-backup"/.test(debut);
}

export { estSauvegarde, lireSauvegarde };

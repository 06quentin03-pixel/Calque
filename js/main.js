/* Calque — point d'entrée : charge les modules puis démarre l'application.
   L'ordre ci-dessous est celui du code d'origine ; le navigateur charge de toute façon chaque module avant ceux qui l'utilisent. */
import './noyau.js';
import './geometrie.js';
import './mutations.js';
import './historique.js';
import './symboles.js';
import './rendu2d.js';
import './electricite.js';
import './reseaux.js';
import './interaction.js';
import './tableau.js';
import './interface.js';
import './stockage.js';
import './export.js';
import './vue3d.js';
import './fiche.js';
import './chantierui.js';
import './multi.js';
import './mesure.js';
import './fondtraits.js';
import './calquesui.js';
import './cablerui.js';
import './circuitsui.js';
import './schemaui.js';
import './demarrage.js';
import { boot } from './demarrage.js';
import { watchUpdates } from './miseajour.js';

boot();
watchUpdates();

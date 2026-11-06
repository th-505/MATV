// Beta-owned implementation. Edit independently from Najd source parsers.
// server/browser/providers/sites/specialized-portals.mjs
// Backward-compatibility barrel re-exporting dedicated provider modules:
// - RistoAnime (RE): ./ristoanime.mjs
// - QFilm (QM): ./qfilm.mjs
// - IPA Universe (IE): ./ipauniverse.mjs
// - Mewsry (MY): ./mewsry.mjs

export {
  extractRistoAnimeStreams
} from './ristoanime.mjs';

export {
  extractQFilmStreams
} from './qfilm.mjs';

export {
  extractIpaUniverseStreams
} from './ipauniverse.mjs';

export {
  extractMewsryStreams
} from './mewsry.mjs';

export default {
  name: 'specialized-portals-barrel'
};

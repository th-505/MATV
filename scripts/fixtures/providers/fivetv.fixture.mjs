import {readFileSync} from 'node:fs';
const read = name => readFileSync(new URL('./fivetv/' + name + '.html', import.meta.url), 'utf8');
export const FIXTURE_META = {providerId: 'fivetv', provenance: 'Sanitized public DOM from user Safari capture, 2026-11-06',
  urls: {search: 'https://ho26374qa.5ivtv.in/search/?q=فرانشيسكا'}};
export const CATALOG_HTML = read('catalog');
export const SEARCH_HTML = read('search');
export const SERIES_HTML = read('series');
export const EPISODE_HTML = read('episode');
export const MOVIE_HTML = read('movie');
export const HOME_HTML = read('home');
export const TAXONOMY_HTML = read('taxonomy');

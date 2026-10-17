import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../Player.html', import.meta.url), 'utf8');
assert.match(html, /frame-src https:\/\/ukrcdn\.club[^"]*vidmoly\.biz/);
assert.match(html, /url\.protocol!=='https:'/);
assert.match(html, /url\.username\|\|url\.password\|\|url\.port/);
assert.doesNotMatch(html, /allow-popups|allow-top-navigation/);
assert.match(html, /sources\.filter\(safeSource\)/);
assert.doesNotMatch(html, /createElement\(['"]iframe['"]\)/);
console.log('web direct-media HTTPS validation and no-popup embed policy passed');

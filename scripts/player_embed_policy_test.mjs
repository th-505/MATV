import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../Player.html', import.meta.url), 'utf8');
assert.match(html, /const EMBED_HOSTS=new Set\(\[/);
assert.match(html, /url\.protocol!=='https:'/);
assert.match(html, /f\.setAttribute\('sandbox','allow-scripts allow-same-origin allow-forms allow-presentation'\)/);
assert.doesNotMatch(html, /allow-popups|allow-top-navigation/);
assert.match(html, /sources\.filter\(safeSource\)/);
console.log('web embed allowlist and strict iframe sandbox policy passed');

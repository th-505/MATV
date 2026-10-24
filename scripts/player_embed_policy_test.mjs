import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const html = await readFile(new URL('../Player.html', import.meta.url), 'utf8');
assert.match(html, /frame-src 'none'/);
assert.doesNotMatch(html, /allow-popups|allow-top-navigation|تشغيل المشغل الخارجي|<iframe/);
assert.match(html, /sources\.filter\(safeSource\)/);
const source = html.slice(html.indexOf('function safeSource('), html.indexOf('\nfunction b64uDecode'));
const context = vm.createContext({ URL });
vm.runInContext(source, context);
for (const type of ['m3u8','mp4','stream']) assert.equal(context.safeSource({url:'https://media.example/video',type}),true);
for (const url of ['http://media.example/video.mp4','https://user:secret@media.example/video.mp4','https://media.example:8443/video.mp4','javascript:alert(1)'])
  assert.equal(context.safeSource({url,type:'mp4'}),false);
assert.equal(context.safeSource({url:'https://media.example/player',type:'embed'}),false);
console.log('Player policy: direct HTTPS playback only, no third-party iframe or external player fallback');

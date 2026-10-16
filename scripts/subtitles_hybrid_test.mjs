import assert from 'node:assert/strict';
import { decodeArabicBuffer, srtToVtt } from '../web/core/subtitles-hybrid.js';

const cp1256Arabic = Uint8Array.from([0xC7, 0xE1, 0xD3, 0xE1, 0xC7, 0xE3]);
assert.equal(decodeArabicBuffer(cp1256Arabic.buffer), 'السلام');
assert.equal(decodeArabicBuffer(new TextEncoder().encode('العربية').buffer), 'العربية');
assert.match(srtToVtt('1\n00:00:01,250 --> 00:00:02,500\nمرحبا'), /00:00:01\.250 --> 00:00:02\.500/);
console.log('web subtitle decoder and SRT conversion passed');

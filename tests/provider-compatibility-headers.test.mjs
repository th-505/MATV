import test from 'node:test';import assert from 'node:assert/strict';
import {buildAntiBanHeaders,BROWSER_USER_AGENTS} from '../server/scrapers/anti-ban.mjs';
test('public compatibility headers stay stable and do not contradict the Safari user agent with fake desktop client hints',()=>{
 const a=buildAntiBanHeaders('https://source.example/search','https://source.example/');
 const b=buildAntiBanHeaders('https://source.example/work','https://source.example/');
 assert.equal(a['User-Agent'],BROWSER_USER_AGENTS[0]);assert.equal(a['User-Agent'],b['User-Agent']);
 assert.equal(a.Referer,'https://source.example/');
 assert(!Object.keys(a).some(key=>/^sec-ch-ua|^sec-fetch-/i.test(key)));
 assert.equal(a.Cookie,undefined);assert.equal(a.Authorization,undefined);
});

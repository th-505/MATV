import test from 'node:test';
import assert from 'node:assert/strict';
import {scanEpisodeIndex} from '../server/harvest/episode-index.mjs';
import {matchHarvestIdentity,mediaExpiry} from '../server/harvest/identity.mjs';
import {createHarvestWorker} from '../server/harvest/worker.mjs';
import {validateProviderConfig,registerProviderOrigins,installProviderConfigs,rewriteProviderRequest} from '../server/scrapers/shared/provider-config.mjs';

test('all 1217 actual episode links survive without synthetic numbering or a sixty-item cap',()=>{
 const html='<div class="episodes">'+Array.from({length:1217},(_,i)=>`<a href="/episode-${i+1}/">الحلقة ${i+1}</a>`).join('')+'</div><a rel="next" href="/?page=2">التالي</a>';
 const index=scanEpisodeIndex(html,'https://source.example/',{provider:'fixture',domains:['source.example']});
 assert.equal(index.episodes.length,1217);assert.equal(index.episodes.at(-1).episode,1217);
 assert.equal(index.pages[0],'https://source.example/?page=2');
 const missing=scanEpisodeIndex('<div class="episodes"><a href="/film-12-2025/">فيلم 12 2025</a></div>','https://source.example/',{provider:'fixture',domains:['source.example']});
 assert.equal(missing.episodes.length,0);
});
test('name and conflicting year never match and metadata cannot lengthen media expiry',()=>{
 assert.equal(matchHarvestIdentity({title:'Example',year:2025,type:'movie'},{title:'Example',year:2024,type:'movie'}).accepted,false);
 assert.equal(matchHarvestIdentity({title:'Example',year:2025,type:'movie'},{title:'Different',year:2025,type:'movie'}).accepted,false);
 const now=Date.UTC(2026,9,27);const expiry=now+120_000;
 assert.equal(mediaExpiry({url:`https://cdn.example/movie.mp4?exp=${expiry/1000}`},now),expiry);
 assert.equal(mediaExpiry({url:`https://cdn.example/movie.mp4?exp=${(now-1000)/1000}`},now),null);
});
test('provider config rejects arbitrary fields, credentials and private domains',()=>{
 for(const config of [{code:'eval()'},{primary_domain:'http://source.example'},{primary_domain:'https://user:pass@source.example'},{primary_domain:'https://a.internal'},{search_parameter:'api_key'},{card_selector:'.x:has(script)'}])assert.throws(()=>validateProviderConfig(config));
});
test('domain rotation strips old credentials and preserves third-party embed origins',()=>{
 registerProviderOrigins('fixture',['https://old.example']);
 installProviderConfigs([{provider:'fixture',config:{primary_domain:'https://new.example',search_path:'/?s={query}'}}]);
 const out=rewriteProviderRequest('https://old.example/search?q=Example',{providerId:'fixture',headers:{Cookie:'secret',Authorization:'Bearer secret',Referer:'https://old.example/'},cookies:'secret'});
 assert.equal(out.url,'https://new.example/?s=Example');assert.equal(out.options.cookies,'');
 assert.equal(out.options.headers.Cookie,undefined);assert.equal(out.options.headers.Authorization,undefined);
 assert.equal(out.options.headers.Referer,'https://new.example/');
 assert.equal(rewriteProviderRequest('https://embed.example/player',{providerId:'fixture'}).url,'https://embed.example/player');
 installProviderConfigs([]);
});
test('a synchronous handler failure releases the worker slot and records a failed job',async()=>{
 let claimed=false,failures=0;
 const store={claim:async()=>claimed?[]:(claimed=true,[{job_key:'a',stage:'work',attempts:1}]),heartbeat:async()=>{},complete:async()=>{},fail:async()=>{failures++}};
 const worker=createHarvestWorker({store,handlers:{work:()=>{throw Error('FIXTURE_FAILURE')}},pollMs:60000});
 worker.start();await new Promise(r=>setImmediate(r));await worker.stop();
 assert.equal(failures,1);assert.equal(worker.metrics().active,0);
});

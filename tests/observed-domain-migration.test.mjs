import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import * as najd from '../server/scrapers/registry.mjs';import * as beta from '../server/browser/registry.mjs';
import {installProviderConfigs} from '../server/scrapers/shared/provider-config.mjs';
import {installBrowserConfigs} from '../server/browser/traffic.mjs';
const sources=[{id:'fosta',current:'ffosta-tv.lat',legacy:'ffosta-tv.autos',parse:'parseFostaCatalog',path:'/watch.php?vid=abc123'},{id:'brstej',current:'brstej.garden',fixtureHost:'prstej.study',legacy:'su.brstej.com',parse:'parseBrstejCatalog',path:'/video.php?vid=abc123'}];
const ref=(id,url)=>id+':'+Buffer.from(url).toString('base64url');
for(const [scope,family]of [['najd',najd],['beta',beta]])for(const s of sources)test(scope+' '+s.id+' keeps new cards, next pages, old references and strict URL guards',()=>{
 const entry=family.getProvider(s.id),html=fs.readFileSync(new URL('../scripts/fixtures/providers/domain-migrations/'+s.id+'-search-card.html',import.meta.url),'utf8');
 assert.equal(new URL(entry.meta.domains[0]).hostname,s.current);
 const items=entry.module[s.parse](html,'https://'+s.current+'/search.php?keywords=fixture');
 assert.equal(items.length,1);assert.equal(new URL(items[0].url).hostname,s.fixtureHost||s.current);assert.equal(items._meta.next_page,2);
 assert.equal(new URL(entry.module.decodeProviderRef(ref(s.id,'https://'+s.legacy+s.path))).hostname,s.legacy);
 for(const url of ['https://unrelated.example'+s.path,'https://127.0.0.1'+s.path,'https://user:secret@'+s.current+s.path])assert.throws(()=>entry.module.decodeProviderRef(ref(s.id,url)));
});
for(const s of sources)test(s.id+' owner domain updates are synchronous and independent in Najd and beta',async()=>{
 const a='https://najd-'+s.id+'.example',b='https://beta-'+s.id+'.example';
 installProviderConfigs([{provider:s.id,config:{primary_domain:a}}]);installBrowserConfigs([{provider:s.id,config:{primary_domain:b}}]);
 try{for(const [family,domain,other] of [[najd,a,b],[beta,b,a]]){
  const entry=family.getProvider(s.id),html=fs.readFileSync(new URL('../scripts/fixtures/providers/domain-migrations/'+s.id+'-search-card.html',import.meta.url),'utf8').replaceAll('https://'+(s.fixtureHost||s.current),domain);
  const items=await entry.module.scrapeSearch('fixture',1,{fixtureHtml:html});
  assert.equal(items.length,1);assert.equal(new URL(items[0].url).origin,domain);
  const decoded=entry.module.decodeProviderRef(ref(s.id,domain+s.path));
  assert.equal(typeof decoded,'string');assert.equal(new URL(decoded).origin,domain);
  assert.throws(()=>entry.module.decodeProviderRef(ref(s.id,other+s.path)));
 }}finally{installProviderConfigs([]);installBrowserConfigs([])}
});

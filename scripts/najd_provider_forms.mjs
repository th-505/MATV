import fs from 'node:fs/promises';
import * as cheerio from 'cheerio';
import {listIndependentProviders,getProvider} from '../server/scrapers/registry.mjs';
import {maintenanceExample} from '../server/maintenance/verify-config.mjs';
import {providerScope} from '../server/scrapers/content-scope.mjs';
import {matchHarvestIdentity} from '../server/harvest/identity.mjs';
import {fetchProviderHtml} from '../server/scrapers/shared/http.mjs';
const rows=listIndependentProviders().filter(meta=>meta.capabilities?.search),results=[];
const fields=new Set(['s','q','query','search','keyword','keywords','search_query','story']);
let cursor=0;
async function worker(){while(cursor<rows.length){const meta=rows[cursor++];const record={id:meta.id,form:null};
 try{const domains=meta.domains.map(x=>new URL(x).hostname);const page=await fetchProviderHtml(meta.domains[0],{providerId:meta.id,allowedHosts:domains,strict:true,timeoutMs:5000,maxRetries:0});
  const $=cheerio.load(page.html);
  $('form').each((_,el)=>{if(record.form)return;const form=$(el);const input=form.find('input').toArray().map(x=>$(x).attr('name')).find(x=>fields.has(x));if(!input)return;
   const target=new URL(form.attr('action')||page.url,page.url);if(target.protocol!=='https:'||target.origin!==new URL(page.url).origin)return;
   const method=(form.attr('method')||'GET').toUpperCase();if(!['GET','POST'].includes(method))return;
   target.search='';target.hash='';
   const pathname=target.pathname;if(pathname.length>160||/[\r\n\\]/.test(pathname))return;
   record.form={primary_domain:target.origin,search_path:pathname,search_parameter:input,search_method:method};
  });
  record.status=record.form?'observed_search_form':'no_observed_form';
 }catch(error){record.status='unavailable';record.reason=/^[A-Z_0-9]{3,80}$/.test(error.code||error.message)?error.code||error.message:'SOURCE_UNAVAILABLE'}
 if(providerScope(meta.id).live){record.search_check={outcome:'live_source_not_a_tmdb_work'};}
 else {
  const expected=maintenanceExample(meta.id);
  try{const hits=await getProvider(meta.id).module.scrapeSearch(expected.query,1,{strict:true,timeoutMs:5000,maxRetries:0});
   const reason=hits?._meta?.errorCode;
   record.search_check={outcome:reason&&reason!=='EMPTY_RESULT'?'error':Array.isArray(hits)&&hits.length?'results':'empty_unconfirmed',result_count:Array.isArray(hits)?hits.length:0,identity_confirmed:Array.isArray(hits)&&hits.some(hit=>matchHarvestIdentity(expected,hit).accepted),...(reason?{reason}:{}),sample:expected.query};
  }catch(error){record.search_check={outcome:'error',reason:/^[A-Z_0-9]{3,80}$/.test(error.code||error.message)?error.code||error.message:'SOURCE_UNAVAILABLE'};}
 }
 results.push(record);
}}
await Promise.all([worker(),worker(),worker()]);
const output=process.argv[2];if(!output)throw Error('OUTPUT_PATH_REQUIRED');
await fs.writeFile(output,JSON.stringify({providers:results.sort((a,b)=>a.id.localeCompare(b.id))},null,2));
console.log(JSON.stringify({form_sources:results.length,observed:results.filter(x=>x.form).length}));

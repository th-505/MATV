import test from 'node:test';
import assert from 'node:assert/strict';
import {buildSupportReport,redactSupportValue} from '../server/diagnostics/support-report.mjs';
const stamp='2026-10-28T06:00:00.000Z';
const options={now:()=>Date.parse(stamp),reportId:'fixture-report',version:'1.1.7',commit:'a'.repeat(40)};
const snapshot=()=>({server:{node:'v24.22.1',openssl:'3.0.18',version:'1.1.7',commit:'a'.repeat(40)},harvest:{configured:true,worker:{active:2,concurrency:2,polling:false},recent_limit:100,unavailable:[],jobs:[{job_key:'tmdb:tv:34587:work',content_ref:'tmdb:tv:34587',provider:'3cktv',stage:'provider',status:'failed',attempts:2,error_code:'NETWORK_TIMEOUT',updated_at:stamp,progress:{observed_episodes:97}}],works:[{ref:'tmdb:tv:34587',title:'وادي الذئاب',type:'series',state:'partial',episode_count:97}],sources:[],events:[],providers:[],totals:{job_status:{queued:12,running:2,ready:133,failed:36},job_stage:[{stage:'provider',status:'queued',count:12},{stage:'episode',status:'running',count:2},{stage:'episode',status:'ready',count:133},{stage:'provider',status:'failed',count:36}],work_state:{partial:7,playable:5},favorite_types:[{provider:'tmdb',count:5},{provider:'3isk',count:3},{provider:'alooy',count:2},{provider:'legacy',count:2}],favorites:{rows:12,distinct_works:12,with_work_job:5,missing_work_job:7},sources:{total:28,partial:4}}},traces:[]});

test('report uses actual aggregate RPC counters and distinguishes the recent sample',()=>{
 const report=buildSupportReport(snapshot(),options);
 assert.equal(report.schema_version,1);assert.equal(report.generated_at,stamp);
 assert.equal(report.server.source_commit,'a'.repeat(40));assert.equal(report.server.version,'1.1.7');
 assert.equal(report.summary.failed,1);assert.equal(report.totals.jobs.find(x=>x.status==='failed').count,36);
 assert.equal(report.totals.favorite_summary.rows,12);assert.equal(report.totals.favorite_summary.distinct_works,12);
 assert.equal(report.totals.missing_favorite_jobs,7);assert.equal(report.findings[0].code,'MISSING_FAVORITE_JOB');
 assert.equal(report.totals.favorites.find(x=>x.ref_type==='3isk').count,3);
 assert.equal(report.totals.works.find(x=>x.state==='partial').count,7);
 assert.equal(report.scope.kind,'recent_sample');assert.match(report.scope.message,/ليست إجمالي/);
 assert.match(report.explanation.media_probe,/لا يثبت فك الفيديو/);
 assert.match(report.findings.find(f=>f.code==='NETWORK_TIMEOUT').next_step,/التقرير/);
});

test('shareable report strips nested secrets, signed URLs, UUIDs and HTML even inside titles and reasons',()=>{
 const uuid='c83dfe15-7513-41fd-83c4-aa7cbb901234';
 const secrets=['bearer-canary-89','cookie-canary-10','password-canary-11','signature-canary-12','encoded-canary-13','html-canary-14','nested-canary-15','refresh-canary-16','relative-canary-17','json-canary-18','deep-encoded-canary-19','basic-canary-20'];
 const raw=snapshot();
 raw.server.authorization='Bearer '+secrets[0];raw.server.user_id=uuid;raw.server.config={nested:{password:secrets[6]}};
 raw.harvest.worker.worker=uuid;
 raw.harvest.jobs.push({job_key:secrets[0]+uuid,provider:'sb_secret_unsafevalue',content_ref:'https://cdn.example/video.mp4?token='+secrets[6],stage:'episode',status:'failed',error_code:'Bearer '+secrets[0],progress:{reason:'cookie='+secrets[1],source_ref:'https://source.example/?token='+secrets[6],headers:{Cookie:secrets[1]},media:[{url:'https://cdn.example/video.mp4?signature='+secrets[3]}],catalog_decision:{decision:'source_indexed',edition:'dubbed',index:{seasons:[null,{season:1,distinct_episodes:10,first:1,last:10}],media:secrets[6]}}}});
 raw.harvest.works.push(...[
  'Bearer '+secrets[0], 'password: '+secrets[2], 'https://cdn.example/video.mp4?X-Amz-Signature='+secrets[3],
  encodeURIComponent('https://cdn.example/video.mp4?token='+secrets[4]), '<script>'+secrets[5]+'</script>',
  '/video.mp4?token='+secrets[8], 'refresh_token='+secrets[7], 'عمل '+uuid,
  JSON.stringify({password:secrets[9]}), encodeURIComponent(encodeURIComponent(encodeURIComponent(encodeURIComponent('https://cdn.example/?token='+secrets[10])))), 'Basic '+secrets[11],
 ].map(title=>({ref:'tmdb:tv:34587',title,type:'series',state:'partial',metadata:{password:secrets[2]}})));
 raw.harvest.sources.push({provider:'3isk',work_ref:'source:3isk:'+'b'.repeat(24),source_ref:secrets[6],evidence:{password:secrets[6]},progress:{source_ref:secrets[6],reason:'Authorization: Bearer '+secrets[0]}});
 raw.harvest.events.push({id:1,provider:'3cktv',stage:'episode',outcome:'failed',reason:'token='+secrets[6],details:{payload:{headers:{authorization:secrets[0]}}}});
 raw.harvest.providers.push({provider:'3cktv',enabled:true,revision:4,config:{headers:{cookie:secrets[1]},token:secrets[6]}});
 raw.traces=[{id:uuid,provider:'3cktv',query:secrets[6],session:uuid,headers:{Cookie:secrets[1]},state:'error',reason:'password: '+secrets[2],events:[{stage:'upstream_response',status:200,html:'<html>'+secrets[5]+'</html>',url:'https://cdn.example/'+secrets[6],reason:'secret='+secrets[6]}]}];
 const report=buildSupportReport(raw,options),json=JSON.stringify(report);
 for(const secret of secrets)assert(!json.includes(secret),secret+' leaked');
 assert(!json.includes(uuid));assert(!json.includes('https://'));assert(!json.includes('<script>'));assert(!json.includes('sb_secret_unsafevalue'));
 assert.equal(report.harvest,undefined);assert.equal(report.providers.find(x=>x.provider==='3cktv').revision,4);
 assert.match(report.traces[0].trace_ref,/^trace-[a-f0-9]{16}$/);
});

test('unknown or malformed nested fields are discarded and report size remains bounded',()=>{
 const raw=snapshot();raw.harvest.jobs=[null,'not a record',...Array.from({length:500},()=>raw.harvest.jobs[0])];
 raw.harvest.works=[null,{title:'عرض',metadata:{rawHTML:'<script>do not export</script>'}}];
 const report=buildSupportReport(raw,options);assert(report.jobs.length<=100);assert(report.works.length<=100);
 assert.equal(report.jobs.some(x=>x.rawHTML),false);
 const deep={details:{items:[{title:'عمل',authorization:'secret',payload:{password:'secret'},unknown:{token:'secret'},details:{headers:{Cookie:'secret'},message:'secret=hidden-canary'}}]}};
 const cleaned=redactSupportValue(deep),json=JSON.stringify(cleaned);assert(!json.includes('hidden-canary'));assert(!json.includes('password'));assert(!json.includes('authorization'));assert(!json.includes('Cookie'));
});

test('entry gates, missing source references, release metadata and harvest errors have useful Arabic guidance',()=>{
 const raw=snapshot();raw.harvest.jobs=[];
 raw.harvest.events=['ENTRY_GATE','SOURCE_REFERENCE_MISSING','RELEASE_YEAR_MISSING','HARVEST_EPISODE_IDENTITY_CONFLICT','HARVEST_NEW_STAGE_UNAVAILABLE','DIRECT_MEDIA_NOT_FOUND'].map((reason,id)=>({id,provider:'3cktv',stage:'episode',reason,outcome:'failed'}));
 const report=buildSupportReport(raw,options);
 for(const reason of raw.harvest.events.map(e=>e.reason)){const item=report.findings.find(f=>f.code===reason);assert(item);assert.match(item.message,/[\u0600-\u06ff]/);assert.match(item.next_step,/[\u0600-\u06ff]/);}
 assert.match(report.findings.find(f=>f.code==='ENTRY_GATE').message,/بوابة دخول/);
 assert.match(report.findings.find(f=>f.code==='SOURCE_REFERENCE_MISSING').next_step,/لا تحذف/);
});

test('missing totals are not presented as an aggregate zero',()=>{
 const raw=snapshot();delete raw.harvest.totals;assert.equal(buildSupportReport(raw,options).totals,null);
 raw.harvest.totals={};assert.equal(buildSupportReport(raw,options).totals,null);
 const fallback=snapshot();delete fallback.harvest.totals.job_stage;assert.equal(buildSupportReport(fallback,options).totals.jobs.find(x=>x.status==='ready').count,133);
});

test('client playback failures retain the actual client version and phase without blaming source search',()=>{
 const raw=snapshot();raw.harvest.jobs=[];raw.harvest.events=[{id:5,work_ref:'source:3cktv:'+'b'.repeat(24),provider:'3cktv',stage:'playback',outcome:'failed',reason:'BUFFER_STALLED',details:{client_version:'1.1.6',client_build:106,platform:'tv',phase:'buffering',season:1,episode:49,raw_error:'https://cdn.example/video.m3u8?token=raw-device-error-canary',headers:{Authorization:'Bearer device-auth-canary'}}}];
 raw.traces=[{id:'client-trace',provider:'3cktv',platform:'tv',state:'error',reason:'NATIVE_DECODER_ERROR',client_version:'1.1.6',client_build:106,work_ref:'source:3cktv:'+'b'.repeat(24),phase:'decoder',raw_error:'native-secret-canary',events:[{stage:'playback_failed',phase:'decoder',reason:'NATIVE_DECODER_ERROR',raw_error:'Cookie=device-cookie-canary',at_ms:1700}]},{id:'network-trace',provider:'3cktv',state:'error',reason:'NETWORK_TIMEOUT',events:[]}];
 const report=buildSupportReport(raw,options),client=report.traces[0],legacy=report.traces[1],json=JSON.stringify(report);
 assert.equal(report.server.version,'1.1.7');assert.equal(client.client_version,'1.1.6');assert.equal(client.client_build,106);assert.equal(client.phase,'decoder');assert.equal(client.work_ref,'source:3cktv:'+'b'.repeat(24));assert.equal(client.failure_scope,'client_playback');
 assert.equal(legacy.client_version,null);assert.equal(legacy.client_build,null);assert.equal(legacy.failure_scope,'source_network');
 const finding=report.findings.find(f=>f.code==='NATIVE_DECODER_ERROR');assert.equal(finding.stage,'playback_failed');assert.equal(finding.phase,'decoder');assert.equal(finding.failure_scope,'client_playback');assert.equal(finding.occurrences,1);assert.match(finding.message,/داخل المشغل/);assert.match(finding.next_step,/لا نعتبره خطأ بحث/);
 const stalled=report.findings.find(f=>f.code==='BUFFER_STALLED');assert.equal(stalled.phase,'buffering');assert.equal(stalled.failure_scope,'client_playback');assert.match(stalled.next_step,/دون الجزم بسببه/);
 assert.equal(report.events[0].stage,'playback');assert.equal(report.events[0].work_ref,client.work_ref);assert.equal(report.events[0].details.client_version,'1.1.6');assert.equal(report.events[0].details.client_build,106);
 for(const canary of ['raw-device-error-canary','device-auth-canary','native-secret-canary','device-cookie-canary'])assert(!json.includes(canary));
});

test('untrusted client fields cannot inject errors, secret-bearing versions or references into a report',()=>{
 const raw=snapshot();raw.traces=[{provider:'3cktv',state:'error',client_version:'1.1.7+token=client-version-canary',client_build:1.5,work_ref:'https://cdn.example/?token=work-ref-canary',phase:'Bearer phase-canary',reason:'Authorization: Bearer reason-canary',events:[{stage:'playback_failed',phase:'token=event-phase-canary',reason:'Cookie=event-reason-canary'}]}];
 const report=buildSupportReport(raw,options),trace=report.traces[0],json=JSON.stringify(report);
 assert.equal(trace.client_version,null);assert.equal(trace.client_build,null);assert.equal(trace.work_ref,null);assert.equal(trace.phase,'unknown');assert.equal(trace.reason,null);assert.equal(trace.events[0].phase,'unknown');assert.equal(trace.events[0].reason,null);
 assert(!json.includes('canary'));
});

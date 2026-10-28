import {createHash,randomUUID} from 'node:crypto';

const MAX_ROWS=100;
const UUID=/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;
const SENSITIVE_KEY=/(?:authorization|auth(?:entication)?|cookie|password|passwd|secret|token|api.?key|credential|session|(?:^|_)user(?:_|$)|owner|device.?id|raw.?html|html|media|url|uri|headers|config|query|search|payload|source.?ref)/i;
const PROVIDERS=new Set(['unknown','tmdb','mycima','akwam','cimanow','shahid4u','moviztime','shii4u','egydead','ipauniverse','3cktv','anime4up','qfilm','ristoanime','arabseed','mewsry','anime4up_rest','witanime','egydead_live','yallashoot','3isk','alooy','laroza','legacy','akoam','wecima','moviz','3ck']);
const text=(value,max=160)=>{
 if(typeof value!=='string')return null;
 let decoded=value;
 // Decode only for redaction; never execute markup or follow a supplied URL.
 for(let i=0;i<3;i++){try{const next=decodeURIComponent(decoded);if(next===decoded)break;decoded=next;}catch{break;}}
 if(/%[a-f0-9]{2}/i.test(decoded))return '[نص مشفر محجوب]';
 decoded=decoded.normalize('NFKC').replace(/\p{Cf}/gu,'').replace(/&amp;/gi,'&').replace(/&#(?:x([0-9a-f]{1,6})|(\d{1,7}));/gi,(_all,hex,decimal)=>{const n=parseInt(hex||decimal,hex?16:10);return n<=0x10ffff?String.fromCodePoint(n):'';});
 if(/<\/?[a-z!][^>]*>/i.test(decoded))return '[محتوى صفحة محجوب]';
 if(/(?:(?:Bearer|Basic)\s+\S+|(?:sb_secret_|sb_publishable_|gh[pousr]_|github_pat_|AIza)[A-Za-z0-9_.-]{8,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+|(?:authorization|cookie|password|passwd|secret|(?:access[_-]?|refresh[_-]?)?token|api[_-]?key|signature|credential|x-amz-[\w-]+|x-goog-[\w-]+|key-pair-id|policy)[\"'`]?\s*[:=])/i.test(decoded))return '[نص حساس محجوب]';
 return decoded.replace(/(?:https?:\/\/|\/\/)[^\s<>"']+/gi,'[رابط محجوب]')
  .replace(/(?:^|\s)\/[^\s<>"']*\?[^\s<>"']*/g,' [رابط محجوب]')
  .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,'[بريد محجوب]').replace(UUID,'[معرّف شخصي محجوب]').replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,max).trim()||null;
};
const code=value=>typeof value==='string'&&/^[A-Z][A-Z0-9_]{1,79}$/.test(value)&&!/(?:SB_SECRET_|GITHUB_PAT_|BEARER|PASSWORD_|COOKIE_|API_KEY_)/i.test(value)?value:null;
const provider=value=>PROVIDERS.has(value)?value:'unknown';
const number=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?Math.min(value,1e12):null;
const bool=value=>typeof value==='boolean'?value:null;
const date=value=>typeof value==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value)&&Number.isFinite(Date.parse(value))?new Date(value).toISOString():null;
const enumValue=(value,values)=>values.includes(value)?value:'unknown';
const rows=value=>Array.isArray(value)?value.slice(0,MAX_ROWS):[];
const records=value=>rows(value).filter(item=>item&&typeof item==='object'&&!Array.isArray(item));
const reference=(prefix,value)=>typeof value==='string'&&value?prefix+'-'+createHash('sha256').update(value).digest('hex').slice(0,16):null;
const workRef=value=>typeof value==='string'&&(/^(?:tmdb:(?:movie|tv):[1-9]\d{0,9})$/.test(value)||(/^source:[a-z0-9_-]{2,30}:[a-f0-9]{24}$/.test(value)&&PROVIDERS.has(value.split(':')[1])))?value:null;
const STAGES=['work','provider','catalog','episode','season','search','identity','manual_verification','server_received','upstream_prepare','upstream_sent','upstream_redirect','upstream_response','upstream_error','parser_result','filter_result','search_failed','response_ready','response_finished','client_disconnected','playback','playback_failed'];
const STATES=['pending','queued','running','ready','failed','partial','indexed','harvesting','playable','unavailable','identity_unconfirmed','quarantined','results','empty_unconfirmed','error','success','unknown'];
const OUTCOMES=['indexed','partial','playable','unavailable','failed','empty_unconfirmed','candidates','quarantined','alias','metadata_only','no_verified_match','no_work_search_capability','identity_unconfirmed','searching_aliases','search_paginating','candidates_queued','canonical_indexed','canonical_season_indexed','episode_jobs_queued','valid_cached_media','no_observed_episodes','source_indexed','playback_failed'];
const PROGRESS_NUMBERS=['providers','declared_episodes','observed_episodes','observed_references','distinct_episodes','source_declared_references','canonical_declared_episodes','additional_pages','parent_pages','more_pages','queued_catalogs','examined','media_count','season','episode','raw_count','kept_count','result_count','duration_ms','elapsed_ms','source_count','playable_count','indexed_count','attempts'];
const CLIENT_PHASES=['startup','initialization','initialize','resolve','handoff','metadata','refresh','source_refresh','playback','playing','buffering','decoder','unknown'];
const PLATFORMS=['tv','mobile','ios','desktop','web','native-unknown','unknown'];
const CLIENT_FAILURES=new Set(['NATIVE_DECODER_ERROR','BUFFER_STALLED','PLAYER_START_FAILED','NATIVE_PLAYBACK_FAILED']);
const clientVersion=value=>typeof value==='string'&&value.length<=80&&/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z.-]{1,30})?(?:\+[0-9A-Za-z.-]{1,30})?$/.test(value)&&text(value,80)===value?value:null;
const clientBuild=value=>Number.isSafeInteger(value)&&value>0&&value<=2147483647?value:null;
function failureScope(reason){if(CLIENT_FAILURES.has(reason))return 'client_playback';if(['NETWORK_TIMEOUT','ACCESS_BLOCKED','UNSAFE_URL','DOMAIN_SUSPENDED','LOGIN_REQUIRED'].includes(reason))return 'source_network';if(['ENTRY_GATE','DIRECT_MEDIA_NOT_FOUND','MEDIA_READ_FAILED','MEDIA_CONTAINER_UNAVAILABLE','IDENTITY_UNCONFIRMED','YEAR_CONFLICT','TYPE_CONFLICT','RELEASE_YEAR_MISSING'].includes(reason))return 'source_catalog';return reason?.startsWith('HARVEST_')?'server':'unknown';}

/** Last defensive pass: unknown nested keys are discarded, never stringified. */
export function redactSupportValue(value,{depth=0}={}){
 if(depth>8)return '[بيانات عميقة محجوبة]';
 if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number')return number(value);
 if(typeof value==='string')return text(value,400);
 if(Array.isArray(value))return value.slice(0,MAX_ROWS).map(item=>redactSupportValue(item,{depth:depth+1}));
 if(value&&typeof value==='object'){
  const result=Object.create(null);
  for(const [key,item]of Object.entries(value).slice(0,100)){
   if(SENSITIVE_KEY.test(key)||!new Set([...PROGRESS_NUMBERS,'stage','state','status','provider','outcome','reason','message','next_step','title','events','details','items','counts','progress','enabled','revision','at_ms']).has(key))continue;
   result[key]=redactSupportValue(item,{depth:depth+1});
  }
  return result;
 }
 return null;
}
function progress(raw){
 const result={};if(!raw||typeof raw!=='object')return result;
 for(const key of PROGRESS_NUMBERS){const n=number(raw[key]);if(n!==null)result[key]=n;}
 const outcome=enumValue(raw.outcome,OUTCOMES);if(outcome!=='unknown')result.outcome=outcome;
 const reason=code(raw.reason);if(reason)result.reason=reason;
 if(bool(raw.source_index_complete)!==null)result.source_index_complete=raw.source_index_complete;
 if(raw.catalog_decision&&typeof raw.catalog_decision==='object')result.catalog_decision=catalogDecision(raw.catalog_decision);
 if(raw.client_version!==undefined)result.client_version=clientVersion(raw.client_version);
 if(raw.client_build!==undefined)result.client_build=clientBuild(raw.client_build);
 if(raw.platform!==undefined)result.platform=enumValue(raw.platform,PLATFORMS);
 if(raw.phase!==undefined)result.phase=enumValue(raw.phase,CLIENT_PHASES);
 if(Array.isArray(raw.probe_failures))result.probe_failures=records(raw.probe_failures).slice(0,10).map(item=>({reason:code(item?.reason),status:number(item?.status)}));
 return result;
}
function catalogDecision(raw){
 const index=raw.index||{},seasons=records(index.seasons).slice(0,20);
 return {decision:enumValue(raw.decision,['identity_unconfirmed','ambiguous','no_observed_episodes','partial','source_indexed']),edition:enumValue(raw.edition,['dubbed','subtitled','ambiguous','unknown']),runtime_minutes:number(raw.runtime_minutes),canonical_identity_verified:raw.canonical_identity_verified===true,canonical_complete:raw.canonical_complete===true,playback_verified:raw.playback_verified===true,completeness:enumValue(raw.completeness,['canonical_complete','partial','unconfirmed']),reasons:rows(raw.reasons).map(code).filter(Boolean),index:{observed_references:number(index.observed_references),distinct_episodes:number(index.distinct_episodes),unnumbered_references:number(index.unnumbered_references),conflicting_references:number(index.conflicting_references),season_rows_truncated:Array.isArray(index.seasons)&&index.seasons.length>20,seasons:seasons.map(row=>({season:number(row.season),distinct_episodes:number(row.distinct_episodes),first:number(row.first),last:number(row.last),contiguous_from_one:row.contiguous_from_one===true,alternative_references:number(row.alternative_references),gap_ranges:rows(row.gap_ranges).slice(0,20).map(gap=>({from:number(gap.from),to:number(gap.to)})),gap_rows_truncated:Array.isArray(row.gap_ranges)&&row.gap_ranges.length>20}))}};
}
function totalsOf(raw){
 if(!raw||typeof raw!=='object')return null;
 const hasRows=Array.isArray(raw.job_stage)||Array.isArray(raw.jobs);
 const statusObject=raw.job_status&&typeof raw.job_status==='object';
 if(!hasRows&&!statusObject)return null;
 const jobRows=hasRows?(raw.job_stage||raw.jobs):Object.entries(raw.job_status).map(([status,count])=>({stage:'unknown',status,count}));
 const works=Array.isArray(raw.works)?raw.works:Object.entries(raw.work_state||{}).map(([state,count])=>({state,count}));
 const favorites=Array.isArray(raw.favorite_types)?raw.favorite_types:Array.isArray(raw.favorites)?raw.favorites:[];
 const detail=raw.favorites&&!Array.isArray(raw.favorites)&&typeof raw.favorites==='object'?raw.favorites:{};
 return {jobs:rows(jobRows).map(row=>({stage:enumValue(row?.stage,STAGES),status:enumValue(row?.status,STATES),count:number(row?.count)})),works:rows(works).map(row=>({state:enumValue(row?.state,STATES),count:number(row?.count)})),favorites:rows(favorites).map(row=>({ref_type:provider(row?.provider??row?.ref_type),count:number(row?.count)})),favorite_summary:{rows:number(detail.rows),distinct_works:number(detail.distinct_works),with_work_job:number(detail.with_work_job)},missing_favorite_jobs:number(detail.missing_work_job??raw.missing_favorite_jobs),sources:{total:number(raw.sources?.total),partial:number(raw.sources?.partial)}};
}
const guidance={
 NATIVE_DECODER_ERROR:['التطبيق أبلغ عن خطأ في فك الفيديو داخل المشغل','نجاح فحص الرابط لا يثبت فك الفيديو على الجهاز. أرسل التقرير مع نوع الجهاز؛ لا نعتبره خطأ بحث تلقائيًا.'],
 BUFFER_STALLED:['التطبيق أبلغ عن توقف استمرار التحميل داخل المشغل','قد يكون الاتصال أو المصدر سببًا؛ التقرير يسجل ما حدث على الجهاز دون الجزم بسببه. أرسله مع وقت التوقف.'],
 PLAYER_START_FAILED:['التطبيق لم يتمكن من بدء التشغيل','راجع إصدار التطبيق والمرحلة في التقرير. وجود رابط مفهرس لا يكفي لإثبات بدء الفيديو على الجهاز.'],
 NATIVE_PLAYBACK_FAILED:['التطبيق أبلغ عن تعذر التشغيل داخل المشغل','التعثر مسجل في مسار تشغيل الجهاز، وليس دليلًا على فشل البحث. أرسل التقرير مع نوع الجهاز ورقم الحلقة.'],
 SOURCE_REFERENCE_MISSING:['مرجع الموقع الأصلي غير محفوظ لهذا العمل','المفضلة محفوظة، لكن القاشط يحتاج مرجع صفحة العمل. أرسل التقرير؛ لا تحذف المفضلة.'],
 SOURCE_NOT_SUPPORTED:['هذا المصدر غير معروف للقاشط الحالي','أرسل التقرير مع اسم المصدر؛ لن نستخدم موقعًا آخر بدلًا منه دون توضيح.'],
 ENTRY_GATE:['المصدر أعاد بوابة دخول بدل ملف التشغيل','أُوقفت هذه العينة دون تجاوز البوابة؛ أرسل التقرير لتحديد مسار المشاهدة الصحيح.'],
 HARVEST_BAD_REFERENCE:['مرجع العمل غير صالح للفهرسة','أرسل التقرير؛ الخلل في ربط البطاقة بالمصدر، وليس دليلًا على غياب العمل.'],
 HARVEST_SOURCE_REFERENCE_CONFLICT:['مرجع النسخة لا يطابق المصدر المحفوظ','أُبقيت النسخ منفصلة لحماية الترقيم والهوية؛ يحتاج المطور مراجعة الربط.'],
 HARVEST_EPISODE_IDENTITY_CONFLICT:['رقم الحلقة لدى المصدر لا يطابق الطلب','لم نستبدلها بحلقة أخرى؛ أرسل التقرير مع رقم الحلقة الذي اخترته.'],
 HARVEST_SEASON_IDENTITY_CONFLICT:['موسم المصدر لا يطابق الطلب','يجب استخدام فهرس المصدر نفسه، دون فرض مواسم من مصدر آخر.'],
 HARVEST_WORK_MISSING:['بيانات العمل لم تصل إلى الفهرسة بعد','أعد تحديث الحالة ثم أرسل التقرير إذا استمرت المشكلة.'],
 HARVEST_JOB_FAILED:['تعذرت مهمة قشط ولم يكتمل حفظ النتيجة','أرسل التقرير؛ سيوضح المصدر والمرحلة وآخر محاولة.'],
 ACCESS_BLOCKED:['المصدر رفض الطلب أو يتطلب خطوة دخول','افتح تفاصيل المصدر في اللوحة وأرسل التقرير؛ لا تعتبر العمل غير موجود.'],
 NETWORK_TIMEOUT:['المصدر لم يرد في الوقت المحدد','جرّب التحديث لاحقًا؛ التقرير يحدد المصدر والمرحلة المتعثرة.'],
 UNSAFE_URL:['أوقف فحص الأمان رابطًا غير مسموح','يحتاج المطور مراجعة الدومين أو التحويل المرصود؛ لا تُعطّل الحماية.'],
 IDENTITY_UNCONFIRMED:['لم تتأكد مطابقة العمل','الاسم وحده غير كافٍ؛ لم نعتمد رابط تشغيل لهذا العمل.'],
 YEAR_CONFLICT:['سنة العمل لدى المصدر مختلفة','أُبقي المصدر منفصلًا حتى لا تُعرض نسخة لعمل آخر.'],
 TYPE_CONFLICT:['نوع العمل لدى المصدر مختلف','قد تكون النتيجة فيلمًا أو جزءًا مختلفًا؛ أرسل التقرير للمراجعة.'],
 RELEASE_YEAR_MISSING:['المصدر لا يعرض سنة إصدار واضحة','يحتاج القاشط أدلة إضافية؛ تاريخ رفع الصفحة ليس سنة العمل.'],
 DIRECT_MEDIA_NOT_FOUND:['لم نجد رابطًا اجتاز فحص الوسائط بعد الفهرسة','ظهور الحلقات لا يعني جاهزية تشغيلها؛ التقرير يبين آخر مرحلة.'],
 MEDIA_READ_FAILED:['تعذر قراءة عينة من ملف الفيديو','الرابط لم يجتز التحقق؛ لم نعتبر فحص العنوان وحده نجاح تشغيل.'],
 MEDIA_CONTAINER_UNAVAILABLE:['استجابة الرابط ليست فيديو موثقًا','يحتاج المطور مراجعة صفحة المشاهدة أو صيغة الوسائط.'],
 DOMAIN_SUSPENDED:['دومين المصدر متوقف','يحتاج المصدر إلى دومين فعلي صالح؛ لا توجد نتيجة مؤكدة.'],
 LOGIN_REQUIRED:['المصدر يطلب تسجيل دخول','لم نتجاوز الدخول ولم نعتمد الصفحة كرابط فيديو.'],
 DATABASE_UNAVAILABLE:['تعذر الوصول لقاعدة البيانات','تحقق من حالة الخادم ثم أرسل التقرير؛ قد تكون الحالة مؤقتة.'],
 HARVEST_NOT_CONFIGURED:['الفهرسة الخلفية غير مفعلة','إعداد الخادم يحتاج مراجعة من المطور.'],
 LIBRARY_SYNC_UNAVAILABLE:['مزامنة المفضلة لم تكتمل','المفضلة المحلية لا تثبت وصول طلب القشط للخادم.'],
};
function reasonGuidance(reason){return guidance[reason]||(reason?.startsWith('HARVEST_')?['توقفت مهمة القشط في مرحلة محددة','أرسل التقرير؛ رمز السبب والمرحلة يوضحان موضع التعثر دون بيانات الدخول.']:null)||['توقفت خطوة وتحتاج مراجعة','أرسل ملف التشخيص؛ يحتوي رمز السبب والمرحلة دون مفاتيح الوصول.'];}
function aggregateProviders(jobs,sources,events,configs){
 const map=new Map();const get=id=>{if(!map.has(id))map.set(id,{provider:id,enabled:null,revision:null,queued_jobs:0,running_jobs:0,completed_jobs:0,failed_jobs:0,indexed_sources:0,playable_events:0,last_reason:null,last_stage:null});return map.get(id)};
 for(const row of configs){const p=get(row.provider);p.enabled=row.enabled;p.revision=row.revision;}
 for(const row of jobs){const p=get(row.provider);if(row.status==='queued')p.queued_jobs++;if(row.status==='running')p.running_jobs++;if(row.status==='ready')p.completed_jobs++;if(row.status==='failed')p.failed_jobs++;if(!p.last_reason&&row.error_code)p.last_reason=row.error_code;if(!p.last_stage)p.last_stage=row.stage;}
 for(const row of sources){const p=get(row.provider);if(['indexed','partial'].includes(row.state))p.indexed_sources++;}
 for(const row of events){const p=get(row.provider);if(row.outcome==='playable')p.playable_events++;if(!p.last_reason&&row.reason)p.last_reason=row.reason;if(!p.last_stage)p.last_stage=row.stage;}
 return [...map.values()].map(p=>({...p,status:p.last_reason?'needs_review':p.running_jobs?'working':p.playable_events?'media_observed':p.indexed_sources?'index_only':'no_recent_evidence'}));
}

/** Build a shareable report from explicit non-secret fields, not a dump of DB rows. */
export function buildSupportReport(snapshot={}, {now=Date.now,reportId=randomUUID(),version,commit}={}){
 const harvest=snapshot.harvest||{},server=snapshot.server||{};
 const jobs=records(harvest.jobs).map(row=>({job_ref:reference('job',row.job_key),work_ref:workRef(row.content_ref||row.work_ref),provider:provider(row.provider),stage:enumValue(row.stage,STAGES),status:enumValue(row.status,STATES),attempts:number(row.attempts),error_code:code(row.error_code),updated_at:date(row.updated_at),progress:progress(row.progress)}));
 const works=records(harvest.works).map(row=>({ref:workRef(row.ref),title:text(row.title),type:enumValue(row.type,['movie','series']),state:enumValue(row.state,STATES),episode_count:number(row.episode_count),last_checked_at:date(row.last_checked_at),expires_at:date(row.expires_at)}));
 const sources=records(harvest.sources).map(row=>({work_ref:workRef(row.work_ref),provider:provider(row.provider),state:enumValue(row.state,STATES),identity_score:number(row.identity_score),updated_at:date(row.updated_at),progress:progress(row.progress)}));
 const events=records(harvest.events).map(row=>({event_ref:typeof row.id==='number'?'event-'+row.id:null,work_ref:workRef(row.work_ref),provider:provider(row.provider),stage:enumValue(row.stage,STAGES),outcome:enumValue(row.outcome,OUTCOMES),reason:code(row.reason),created_at:date(row.created_at),details:progress(row.details)}));
 const configs=records(harvest.providers).map(row=>({provider:provider(row.provider),enabled:bool(row.enabled),revision:number(row.revision)}));
 const traces=records(snapshot.traces||snapshot.searches).map(row=>{
  const events=records(row.events).slice(-40).map(event=>({stage:enumValue(event.stage,STAGES),phase:enumValue(event.phase,CLIENT_PHASES),at_ms:number(event.at_ms),status:number(event.status),reason:code(event.reason),raw_count:number(event.raw_count),kept_count:number(event.kept_count),bytes:number(event.bytes)}));
  const reason=code(row.reason),clientReason=events.findLast(event=>event.stage==='playback_failed'&&CLIENT_FAILURES.has(event.reason))?.reason;
  return {trace_ref:reference('trace',row.id||row.trace_id),provider:provider(row.provider),platform:enumValue(row.platform,PLATFORMS),client_version:clientVersion(row.client_version),client_build:clientBuild(row.client_build),work_ref:workRef(row.work_ref),phase:enumValue(row.phase,CLIENT_PHASES),failure_scope:failureScope(reason||clientReason),state:enumValue(row.state,STATES),reason,started_at:date(row.started_at),duration_ms:number(row.duration_ms),result_count:number(row.result_count),events};
 });
 const evidence=[...jobs.map(j=>({reason:j.error_code,stage:j.stage,provider:j.provider})),...events.map(event=>({...event,phase:event.details.phase}))];
 for(const trace of traces){
  const perTrace=new Map();for(const event of trace.events)if(event.reason){const stage=event.stage==='playback_failed'?'playback_failed':'search';const key=event.reason+':'+stage;perTrace.set(key,{reason:event.reason,stage,phase:event.phase,provider:trace.provider});}
  if(trace.reason){const stage=CLIENT_FAILURES.has(trace.reason)?'playback_failed':'search',key=trace.reason+':'+stage;if(!perTrace.has(key))perTrace.set(key,{reason:trace.reason,stage,phase:trace.phase,provider:trace.provider});}
  evidence.push(...perTrace.values());
 }
 const reasonCounts=new Map();for(const row of evidence)if(row.reason){const scope=failureScope(row.reason),phase=enumValue(row.phase,CLIENT_PHASES),k=[row.reason,row.stage||'search',row.provider,phase].join(':');const old=reasonCounts.get(k)||{code:row.reason,stage:row.stage||'search',provider:row.provider,phase,failure_scope:scope,occurrences:0};old.occurrences++;reasonCounts.set(k,old);}
 const totals=totalsOf(harvest.totals);
 const findings=[...reasonCounts.values()].slice(0,50).map(row=>{const [message,next_step]=reasonGuidance(row.code);return{...row,message,next_step}});
 if(totals?.missing_favorite_jobs>0)findings.unshift({code:'MISSING_FAVORITE_JOB',stage:'work',provider:'unknown',occurrences:totals.missing_favorite_jobs,message:'بعض الأعمال في المفضلة ليس لها طلب قشط',next_step:'أرسل التقرير للمطور؛ حفظ المفضلة وحده لا يعني أن فهرستها بدأت.'});
 const counts={queued:jobs.filter(j=>j.status==='queued').length,running:jobs.filter(j=>j.status==='running').length,completed:jobs.filter(j=>j.status==='ready').length,failed:jobs.filter(j=>j.status==='failed').length,works:works.length,sources:sources.length,playable_events:events.filter(e=>e.outcome==='playable').length};
 const versionValue=version??server.version;const commitValue=commit??server.commit??server.source_commit;
 return {schema_version:1,product:'نجد — Najd TV',report_ref:reference('najd',String(reportId)),generated_at:new Date(typeof now==='function'?now():now).toISOString(),purpose:'ملف تشخيص للمشاركة مع المطور',privacy:{credentials_removed:true,personal_identifiers_removed:true,media_links_removed:true,raw_pages_removed:true,search_text_removed:true,trace_references:'معرّفات البحث مجزأة؛ يمكن للمطور مطابقتها بسجل الخادم'},server:{version:typeof versionValue==='string'&&/^\d+\.\d+\.\d+(?:[+-][a-z0-9.-]+)?$/i.test(versionValue)?versionValue:null,source_commit:typeof commitValue==='string'&&/^[a-f0-9]{40}$/i.test(commitValue)?commitValue:null,node:typeof server.node==='string'&&/^v?\d+\.\d+\.\d+$/.test(server.node)?server.node:null,openssl:typeof server.openssl==='string'&&/^\d+\.\d+\.\d+[a-z0-9.+-]{0,30}$/i.test(server.openssl)?server.openssl:null,uptime_seconds:number(server.uptime_seconds),memory_bytes:{rss:number(server.memory?.rss),heap_used:number(server.memory?.heapUsed)},harvest_configured:harvest.configured===true,worker:{active:number(harvest.worker?.active),concurrency:number(harvest.worker?.concurrency),polling:bool(harvest.worker?.polling)}},scope:{kind:'recent_sample',recent_limit:Math.min(MAX_ROWS,number(harvest.recent_limit)||MAX_ROWS),message:'الأعداد أدناه تخص السجلات الحديثة المحمّلة، وليست إجمالي قاعدة البيانات أو دليل اكتمال العمل.',unavailable:rows(harvest.unavailable).filter(x=>['jobs','works','sources','events','providers'].includes(x))},totals,summary:counts,providers:aggregateProviders(jobs,sources,events,configs),findings,jobs,works,sources,events,traces,explanation:{indexing:'الفهرسة تعني العثور على أسماء وروابط صفحات الحلقات.',media_probe:'فحص الوسائط يعني قراءة محدودة من ملف أو قائمة تشغيل؛ لا يثبت فك الفيديو أو التشغيل على جهازك.',completed_jobs:'اكتمال مهمة البحث لا يعني أن حلقات العمل كلها جاهزة.',no_recent_evidence:'غياب سجل حديث لا يعني توقف المصدر أو عدم وجود العمل.',source_index:'تقسيم المواسم والحلقات يتبع فهرس المصدر؛ TMDB يزوّد بيانات العمل.',dubbed:'المدبلج نسخة مستقلة لكل مصدر، ولا يُدمج بالمترجم أو بمدبلج موقع آخر.'}};
}

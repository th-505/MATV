const DIRECT_FORMATS = /\.(mp4|m3u8)$/i;
export function browserDirectSource(source) {
  const raw=source?.url || source?.media_url || source?.media_path || source?.stream_url;
  try {
    const url=new URL(raw);
    if(url.protocol!=='https:' || url.username || url.password || url.port || !DIRECT_FORMATS.test(url.pathname) ||
       source.kind==='embed' || source.type==='embed' || source.web_playable===false) return null;
    // Browsers cannot set an arbitrary Referer/Cookie on media requests.
    const headers=source.headers || source.playback_headers || {};
    if(Object.keys(headers).some(key=>/^(authorization|cookie|referer|origin)$/i.test(key)) && source.web_playable!==true) return null;
    if(source.expires_at && Date.parse(source.expires_at)<=Date.now()+5000)return null;
    return {...source,url:url.href,kind:'direct',type:/\.m3u8$/i.test(url.pathname)?'m3u8':'mp4'};
  }catch{return null;}
}
const abortError=()=>Object.assign(new Error('PLAYBACK_CANCELLED'),{name:'AbortError'});
function pause(ms,signal){return new Promise((resolve,reject)=>{
 if(signal?.aborted)return reject(abortError());
 const done=()=>{signal?.removeEventListener('abort',abort);resolve();};
 const timer=setTimeout(done,ms);const abort=()=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);reject(abortError());};
 signal?.addEventListener('abort',abort,{once:true});
});}
function tmdbReference(item){
 const ref=String(item?.ref || item?.id || '');
 if(/^tmdb:(movie|tv):\d+$/.test(ref))return ref;
 if(ref && /^[a-z0-9_-]+:/i.test(ref) && !ref.startsWith('tmdb:') && !ref.startsWith('work:'))return '';
 if(item?.selected_source || item?.source && item.source!=='tmdb')return '';
 const id=String(item?.tmdbId || item?.tmdb_id || '');
 return /^\d+$/.test(id)?`tmdb:${item.mediaType==='tv'||item.type==='series'?'tv':'movie'}:${id}`:'';
}
export function createPlaybackClient({fetchImpl=globalThis.fetch, now=Date.now, delay=pause,
 maxWaitMs=90000, pollMs=1500}={}) {
 async function resolve(item,{season=1,episode=1,apiBase='https://matv.onrender.com',signal,onState=()=>{}}={}){
  const base=new URL(apiBase);
  if(base.protocol!=='https:' && !(base.protocol==='http:' && ['localhost','127.0.0.1'].includes(base.hostname)))throw Error('PLAYBACK_BAD_API_BASE');
  const started=now();
  const emit=value=>{if(signal?.aborted)throw abortError();onState(value);return value;};
  async function request(path,params,method='GET'){
   if(signal?.aborted)throw abortError();
   const url=new URL(path,base);for(const [key,value]of Object.entries(params))if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));
   const timeout=AbortSignal.timeout(path==='/api/v1/playback'?45000:12000);
   const res=await fetchImpl(url,{method,signal:signal?AbortSignal.any([signal,timeout]):timeout,redirect:'error'});
   const body=await res.json();if(!res.ok){const e=Error(body.message||body.error||'PLAYBACK_REQUEST_FAILED');e.status=res.status;throw e;}return body;
  }
  const normalize=raw=>(Array.isArray(raw)?raw:[]).map(browserDirectSource).filter(Boolean);
  try{
   const canonical=tmdbReference(item);
   const supplied=(item?.servers || item?.media_sources || []);
   const sameEpisode=!(item?.mediaType==='tv'||item?.type==='series') ||
      Number(item.loadedSeason)===Number(season)&&Number(item.loadedEpisode)===Number(episode);
   if(sameEpisode){const direct=normalize(supplied);if(direct.length)return emit({state:'ready',servers:direct,reason:null});}
   emit({state:'resolving',servers:[],reason:null});
   if(!canonical){
    const ref=String(item?.ref || item?.id || item?.href || '');
    if(!ref || !/^[a-z0-9_-]+:/i.test(ref))return emit({state:'unavailable',servers:[],reason:'INVALID_SOURCE_REFERENCE'});
    const body=await request('/api/v1/playback',{ref,season,episode,type:item?.type || (item?.mediaType==='tv'?'series':'movie'),platform:'web'});
    const servers=normalize(body.servers || body.data?.media_sources);
    return emit({state:servers.length?'ready':'unavailable',servers,reason:servers.length?null:body.reason||'NO_PLAYABLE_SOURCE'});
   }
   const input={ref:canonical,title:item.title||item.name||'TMDB',year:item.year||'',season:canonical.startsWith('tmdb:tv:')?season:0,episode:canonical.startsWith('tmdb:tv:')?episode:0};
   const begin=await request('/api/v1/discovery/start',input,'POST');
   let state=begin.data || {};
   while(now()-started<maxWaitMs){
    if(state.state==='busy')return emit({state:'busy',servers:[],reason:'DISCOVERY_BUSY'});
    if(state.state==='failed')return emit({state:'unavailable',servers:[],reason:state.error||'DISCOVERY_FAILED'});
    if(state.state==='ready' || state.result?.servers?.length){
     const result=state.result;
     const servers=normalize(Array.isArray(result)?result:result?.servers);
     return emit({state:servers.length?'ready':'unavailable',servers,reason:servers.length?null:result?.reason||'NO_PLAYABLE_SOURCE'});
    }
    emit({state:state.state==='running'?'resolving':'queued',servers:[],reason:null});
    await delay(pollMs,signal);
    state=(await request('/api/v1/discovery/status',{ref:canonical,season:input.season,episode:input.episode})).data || {};
    if(state.state==='missing')return emit({state:'unavailable',servers:[],reason:'DISCOVERY_EXPIRED'});
   }
   return emit({state:'pending',servers:[],reason:'DISCOVERY_STILL_RUNNING'});
  }catch(error){
   if(signal?.aborted)throw abortError();
   return emit({state:'unavailable',servers:[],reason:/^[A-Z0-9_]{2,80}$/.test(error.message)?error.message:'PLAYBACK_REQUEST_FAILED'});
  }
 }
 return Object.freeze({resolve});
}
export const playbackClient=createPlaybackClient();
export function playbackMessage(result){
 const reasons={PINNED_EPISODE_NOT_FOUND:'الحلقة المطلوبة غير موجودة في المصدر المحدد.',PINNED_DIRECT_WEB_UNAVAILABLE:'لا يتوفر رابط من هذا المصدر يمكن للمتصفح تشغيله مباشرة. اختر مصدرًا آخر من البحث المتقدم.',PINNED_SOURCE_UNAVAILABLE:'المصدر المختار لا يستجيب حاليًا. أعد المحاولة أو اختر مصدرًا آخر.',PINNED_DIRECT_MEDIA_NOT_FOUND:'لم يقدم المصدر رابط فيديو مباشر لهذه الحلقة.',AI_NOT_CONFIGURED:'التحقق من مصادر هذا العمل غير مفعّل حاليًا. جرّب البحث المتقدم من مصدر محدد.',
  NO_PLAYABLE_SOURCE:'لم نعثر على رابط مباشر صالح لهذه الحلقة. يمكنك اختيار مصدر من البحث المتقدم.',
  WEB_PLAYBACK_UNAVAILABLE:'روابط هذا المصدر تتطلب ترويسات لا يستطيع المتصفح إرسالها. اختر مصدرًا آخر.',
  EPISODE_NOT_FOUND:'هذه الحلقة غير موجودة في المصدر المختار.',DISCOVERY_BUSY:'الخادم مشغول حاليًا. أعد المحاولة بعد قليل.',
  DISCOVERY_STILL_RUNNING:'لم ينتهِ تجهيز المصادر بعد. أعد المحاولة لمتابعة حالة المهمة.',
  IDENTITY_NOT_VERIFIED:'لم تتوفر أدلة كافية على تطابق رابط الفيديو مع العمل والحلقة.',
  DISCOVERY_EXPIRED:'انتهت صلاحية مهمة التجهيز. أعد المحاولة.',PLAYBACK_REQUEST_FAILED:'تعذر الاتصال بخدمة التشغيل. أعد المحاولة.'};
 return reasons[result?.reason] || (result?.state==='ready'?'المصدر جاهز للتشغيل':result?.state==='queued'?'طلب التشغيل في الانتظار…':result?.state==='resolving'?'جارٍ التحقق من مصادر الحلقة…':'لا يتوفر مصدر صالح للتشغيل حاليًا. جرّب البحث المتقدم.');
}

import {AsyncLocalStorage} from 'node:async_hooks';
const configScope=new AsyncLocalStorage();
// Private owner-managed runtime settings. Domain/query changes do not require app rebuilds.
const rows=new Map();
const origins=new Map();
export function registerProviderOrigins(id,domains){origins.set(id,new Set(domains.map(x=>{try{return new URL(x).origin}catch{return "https://"+x}})));}
const FIELDS=new Set(['primary_domain','search_path','search_parameter','search_method','card_selector','title_selector','link_selector','poster_selector','year_selector','default_type']);
const selector=s=>typeof s==='string'&&s.length<=180&&!/[{};\\()]/.test(s);
export function validateProviderConfig(config){
 if(!config||typeof config!=='object'||Array.isArray(config)||Object.keys(config).some(k=>!FIELDS.has(k)))throw Error('INVALID_PROVIDER_CONFIG');
 const result={};
 for(const[k,v]of Object.entries(config)){
  if(typeof v!=='string'||v.length>300)throw Error('INVALID_PROVIDER_CONFIG');
  if(k==='primary_domain'){
   const u=new URL(v);if(u.protocol!=='https:'||u.username||u.password||u.port||u.pathname!=='/'||u.search||u.hash||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(u.hostname)||/\.(?:local|localhost|internal|test)$/i.test(u.hostname))throw Error('INVALID_PROVIDER_DOMAIN');result[k]=u.origin;
  }else if(k==='search_path'){
   if(!v.startsWith('/')||v.startsWith('//')||/[\r\n\\]/.test(v)||v.includes('://'))throw Error('INVALID_PROVIDER_SEARCH_PATH');result[k]=v;
  }else if(k==='search_parameter'){
   if(!/^[A-Za-z_][A-Za-z0-9_-]{0,39}$/.test(v)||/token|key|auth|cookie/i.test(v))throw Error('INVALID_PROVIDER_SEARCH_PARAMETER');result[k]=v;
  }else if(k==='search_method'){
   if(!['GET','POST'].includes(v))throw Error('INVALID_PROVIDER_SEARCH_METHOD');result[k]=v;
  }else if(k.endsWith('_selector')){if(!selector(v))throw Error('INVALID_PROVIDER_SELECTOR');result[k]=v;
  }else if(k==='default_type'){if(!['movie','series','anime'].includes(v))throw Error('INVALID_PROVIDER_TYPE');result[k]=v;}
 }
 return result;
}
export function installProviderConfigs(entries){
 const next=new Map();
 for(const row of entries||[]){if(!/^[a-z0-9][a-z0-9_-]{1,29}$/.test(row.provider))continue;
  try{next.set(row.provider,{...validateProviderConfig(row.config||{}),enabled:row.enabled!==false,revision:row.revision||1})}catch{continue}}
 rows.clear();for(const[k,v]of next)rows.set(k,v);return rows.size;
}
export function getProviderConfig(id){return configScope.getStore()?.get(id)||rows.get(id)||null}
export function withProviderConfig(id,config,callback){return configScope.run(new Map([[id,{...validateProviderConfig(config),enabled:true,revision:0}]]),callback)}
export function effectiveProviderDomains(id,defaults){const c=getProviderConfig(id);return c?.primary_domain?[new URL(c.primary_domain).hostname,...defaults.map(x=>{try{return new URL(x).hostname}catch{return x}})]:defaults.map(x=>{try{return new URL(x).hostname}catch{return x}})}
function moveOrigin(value,origin){try{const u=new URL(value);return origin+u.pathname+u.search+u.hash}catch{return value}}
export function rewriteProviderRequest(target,options={}){
 if(options.searchPageUrl){try{const n=new URL(options.searchPageUrl);const defaults=origins.get(options.providerId);const current=getProviderConfig(options.providerId)?.primary_domain;if(defaults?.has(n.origin)||n.origin===current)target=n.href;}catch{throw Error('INVALID_PROVIDER_PAGE_URL')}}
 const c=getProviderConfig(options.providerId);if(!c)return {url:target,options};if(!c.enabled)throw Error('SOURCE_DISABLED');
 let u=new URL(target);if(!origins.get(options.providerId)?.has(u.origin)&&u.origin!==c.primary_domain)return {url:target,options};const previousOrigin=u.origin;const changed=c.primary_domain&&c.primary_domain!==u.origin;
 if(c.primary_domain)u=new URL(moveOrigin(u.href,c.primary_domain));
 let next={...options,headers:{...(options.headers||{})}};
 if(changed){next.cookies='';for(const k of Object.keys(next.headers))if(/^(cookie|authorization)$/i.test(k))delete next.headers[k];
  if(options.referer){try{if(new URL(options.referer).origin===previousOrigin)next.referer=moveOrigin(options.referer,c.primary_domain)}catch{next.referer=c.primary_domain+'/';}}
  for(const k of Object.keys(next.headers))if(/^(origin|referer)$/i.test(k)){try{if(new URL(next.headers[k]).origin===previousOrigin)next.headers[k]=k.toLowerCase()==='origin'?c.primary_domain:moveOrigin(next.headers[k],c.primary_domain)}catch{delete next.headers[k]}}
  if(next.allowedHosts)next.allowedHosts=[...new Set([...next.allowedHosts,new URL(c.primary_domain).hostname])];
 }
 if(c.search_path&&!options.searchPageUrl){
  const keys=['s','q','query','search','keyword','keywords','search_query','story'];const body=new URLSearchParams(typeof options.body==='string'?options.body:options.body instanceof URLSearchParams?options.body:undefined);
  const query=keys.map(k=>u.searchParams.get(k)||body.get(k)).find(Boolean);
  if(query){const path=c.search_path.replaceAll('{query}',encodeURIComponent(query));u=new URL(path,c.primary_domain||u.origin);
   const field=c.search_parameter||'q';if(!c.search_path.includes('{query}')){
    if(c.search_method==='POST'){next.method='POST';next.body=new URLSearchParams({[field]:query}).toString();next.headers['Content-Type']='application/x-www-form-urlencoded';}
    else{next.method='GET';next.body=undefined;u.searchParams.set(field,query);}
   }
  }
 }
 return {url:u.href,options:next};
}

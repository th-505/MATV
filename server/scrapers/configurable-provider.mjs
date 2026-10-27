import * as cheerio from 'cheerio';
import {getProviderConfig,registerProviderOrigins} from './shared/provider-config.mjs';
import {fetchProviderHtml,resolveSafeUrl} from './shared/http.mjs';
import {contentIdentity} from '../../shared/content-identity.js';
const wrapped=new WeakMap();
function convert(value,meta,actual){
 const c=getProviderConfig(meta.id);if(!c?.primary_domain||typeof value!=='string')return value;
 const base=new URL(meta.domains[0]);let prefix='',text=value,encoded=false;
 if(!text.startsWith('https://')){const m=text.match(/^([a-z0-9_-]+:)(.*)$/i);if(!m)return value;prefix=m[1];text=m[2];if(!text.startsWith('https://')){try{text=Buffer.from(text,'base64url').toString('utf8');encoded=true}catch{return value}}}
 try{const u=new URL(text);const from=actual?base.origin:c.primary_domain;const to=actual?c.primary_domain:base.origin;if(u.origin!==from)return value;const result=to+u.pathname+u.search+u.hash;return prefix+(encoded?Buffer.from(result).toString('base64url'):result)}catch{return value}
}
function mapResult(value,meta,depth=0){
 if(depth>10||value===null||typeof value!=='object')return value;
 if(Array.isArray(value)){const output=value.map(x=>mapResult(x,meta,depth+1));const descriptor=Object.getOwnPropertyDescriptor(value,'_meta');if(descriptor)Object.defineProperty(output,'_meta',{...descriptor,value:mapResult(descriptor.value,meta,depth+1)});return output;}
 const out={...value};for(const[k,v]of Object.entries(out)){if(typeof v==='string'&&['ref','id','url','sourceUrl','link','poster','image','media_url','media_path','Referer','referer'].includes(k))out[k]=convert(v,meta,true);else if(typeof v==='string'&&k.toLowerCase()==='origin'){try{out[k]=new URL(convert(v,meta,true)).origin}catch{out[k]=v}}else if(v&&typeof v==='object')out[k]=mapResult(v,meta,depth+1);}return out;
}
async function configuredSearch(entry,query,page,config,options){
 const primary=config.primary_domain||entry.meta.domains[0];const u=new URL(config.search_path||'/',primary);
 const field=config.search_parameter||'s';u.searchParams.set(field,String(query).slice(0,120));if(page>1)u.searchParams.set('page',String(page));
 const response=await fetchProviderHtml(u.href,{...options,providerId:entry.meta.id,referer:primary+'/'});
 const $=cheerio.load(response.html),items=[];
 $(config.card_selector).each((_,el)=>{
  const card=$(el),link=card.is('a')?card:card.find(config.link_selector||'a[href]').first();
  const url=resolveSafeUrl(link.attr('href')||'',u.href,{allowHttp:false});if(!url)return;
  const label=card.find(config.title_selector||'h2,h3,.title').first().text()||link.attr('title')||link.text();const title=label.replace(/\s+/g,' ').trim().slice(0,250);if(!title)return;
  const img=card.find(config.poster_selector||'img').first();const poster=resolveSafeUrl(img.attr('data-src')||img.attr('src')||'',u.href,{allowHttp:false});
  const year=(card.find(config.year_selector||'.year').first().text()||title).match(/(?:18|19|20|21)\d{2}/)?.[0]||null;
  const ref=entry.meta.id+':'+Buffer.from(url).toString('base64url');items.push({id:ref,ref,url,title,poster,year,source:entry.meta.id,...contentIdentity({title,url,type:config.default_type||'movie'})});
 });
 let next=null;const href=$('a[rel=next]').attr('href');if(href){try{next=Number(new URL(href,u).searchParams.get('page'))||null}catch{}}
 Object.defineProperty(items,'_meta',{value:{providerId:entry.meta.id,url:response.url,next_page:next},enumerable:false});return items;
}
export function wrapConfiguredProvider(entry){
 if(!entry)return entry;if(wrapped.has(entry))return wrapped.get(entry);
 registerProviderOrigins(entry.meta.id,entry.meta.domains);
 const meta={...entry.meta};Object.defineProperty(meta,'domains',{enumerable:true,get:()=>{const c=getProviderConfig(entry.meta.id);return c?.primary_domain?[c.primary_domain,...entry.meta.domains.filter(x=>x!==c.primary_domain)]:entry.meta.domains}});
 Object.defineProperty(meta,'enabled',{enumerable:true,get:()=>getProviderConfig(entry.meta.id)?.enabled!==false});
 const module={...entry.module,PROVIDER_META:meta};
 for(const[name,fn]of Object.entries(entry.module))if(typeof fn==='function'&&/^(scrape|resolveStream)/.test(name))module[name]=async(...args)=>{
  const config=getProviderConfig(entry.meta.id);if(config?.enabled===false)throw Error('SOURCE_DISABLED');
  if(name==='scrapeSearch'&&config?.card_selector)return configuredSearch(entry,args[0],args[1]||1,config,args[2]||{});
  const values=[...args];let pagination=null;
  if(name==='scrapeSearch')values[2]={...(values[2]||{}),onProviderPage:response=>{
   const html=response.html||'';const tag=html.match(/<a\b[^>]*(?:rel=["']next["']|class=["'][^"']*\bnext\b)[^>]*>/i)?.[0];
   const href=tag?.match(/href=["']([^"']+)["']/i)?.[1]?.replaceAll('&amp;','&');
   if(!href)return;try{const n=new URL(href,response.url);const base=new URL(response.url);if(n.origin!==base.origin||n.hash)return;const next=Number(n.searchParams.get('page')||n.searchParams.get('paged')||n.searchParams.get('p'))||Number(n.pathname.match(/\/page\/(\d+)/)?.[1])||Number(args[1]||1)+1;if(next>Number(args[1]||1))pagination={next_page:next,next_url:n.href}}catch{}
  }};
  if(name!=='scrapeSearch'&&typeof values[0]==='string')values[0]=convert(values[0],entry.meta,false);
  const result=mapResult(await fn(...values),entry.meta);
  if(Array.isArray(result)&&pagination){if(result._meta)Object.assign(result._meta,pagination);else Object.defineProperty(result,'_meta',{value:pagination,enumerable:false});}
  return result;
 };
 const output={meta:Object.freeze(meta),module:Object.freeze(module)};wrapped.set(entry,output);return output;
}

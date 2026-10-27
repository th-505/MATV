import * as cheerio from 'cheerio';
import {explicitEpisode,contentIdentity,identityDigits} from '../../shared/content-identity.js';
import {resolveSafeUrl,assertSafeScraperUrl} from '../scrapers/shared/http.mjs';
import {identityTitle} from '../scrapers/content-discovery.mjs';
import {createHash} from 'node:crypto';
export const shortHash=value=>createHash('sha256').update(String(value)).digest('hex').slice(0,24);
export function referenceUrl(ref,domains){
 let text=String(ref||'');if(!text.startsWith('https://'))text=text.replace(/^[a-z0-9_-]+:/i,'');
 if(!text.startsWith('https://')&&!text.startsWith('/')){try{text=Buffer.from(text,'base64url').toString('utf8')}catch{throw Error('HARVEST_BAD_REFERENCE')}}
 const u=new URL(text,'https://'+domains[0]);assertSafeScraperUrl(u.href,{allowHttp:false,allowedHosts:domains});return u.href;
}
function safePage(raw,base,domains){const url=resolveSafeUrl(raw,base,{allowHttp:false,allowedHosts:domains});if(!url)return null;const u=new URL(url);if(u.hash||u.username||u.password)return null;return url}
const cleanTitle=x=>identityTitle(x).replace(/^(?:انمي|أنمي|anime)\s+/i,'').replace(/[أإآ]/g,'ا');
/** Observed links only. Never synthesize a guessed page count or number range. */
export function scanEpisodeIndex(html,url,{provider,domains,title='',episodes=[]}={}){
 const $=cheerio.load(html);const byRef=new Map();
 function add(raw){
  const target=safePage(raw.url||raw.link||raw.ref?.replace(/^[a-z0-9_-]+:/i,'')||'',url,domains);if(!target)return;
  const text=String(raw.title||raw.name||'').trim().slice(0,500);const number=explicitEpisode(text,target)||Number(raw.episode_number??raw.number??raw.num);
  if(!Number.isSafeInteger(number)||number<1||number>100000)return;
  const season=Number(raw.season_number??raw.season)||contentIdentity({title:text,url:target,type:'series'}).season_number||1;
  const ref=raw.ref||provider+':'+Buffer.from(target).toString('base64url');
  byRef.set(target,{source_ref:ref,url:target,title:text||'الحلقة '+number,season,episode:number});
 }
 for(const row of episodes)add(row);
 $('.sh-single-episode-grid a[href],.EpisodesList a[href],.episodes-list a[href],.episodes-grid a[href],.episodes a[href],a.episode-tile[href],a.br-series-detail-card-link[href]').each((_,el)=>{
  const a=$(el);add({url:a.attr('href'),title:a.find('.sh-episode-tile-title,.episode-title,.ep-title').first().text()||a.attr('title')||a.text(),number:a.attr('data-episode'),season:a.attr('data-season')});
 });
 const pages=new Set();
 const current=new URL(url);const page=Number(current.searchParams.get('page')||current.searchParams.get('paged')||current.searchParams.get('p'))||Number(current.pathname.match(/\/page\/(\d+)/)?.[1])||1;
 $('a[rel="next"][href],.pagination a[href],.page-numbers a[href],.sh-pagination a[href],.episodes-pagination a[href]').each((_,el)=>{
  const a=$(el),next=safePage(a.attr('href'),url,domains);if(!next||next===url)return;const n=new URL(next);
  const number=Number(n.searchParams.get('page')||n.searchParams.get('paged')||n.searchParams.get('p'))||Number(n.pathname.match(/\/page\/(\d+)/)?.[1])||null;
  const samePath=n.pathname.replace(/\/page\/\d+\/?$/,'/')===current.pathname.replace(/\/page\/\d+\/?$/,'/');
  if(samePath&&((number&&number>page)||a.attr('rel')==='next'||/التالي|Next/i.test(a.text())))pages.add(next);
 });
 const parents=new Set();
 $('.br-series-detail-breadcrumb a[href],.breadcrumbs a[href],.breadcrumb a[href],.sh-single-breadcrumb a[href],.sh-single-info a[href],.episode-parent a[href],a[rel="up"][href]').each((_,el)=>{
  const a=$(el),href=safePage(a.attr('href'),url,domains);if(!href||href===url)return;
  if(/series|serie|season|مسلسل|انمي|anime/i.test(new URL(href).pathname)&&title&&cleanTitle(a.text())===cleanTitle(title))parents.add(href);
 });
 const declared=identityDigits($('.br-series-stats').text()).match(/(\d{1,5})\s*(?:حلقات|حلقة)/)?.[1];
 return {source_declared_references:declared?Number(declared):null,episodes:[...byRef.values()],pages:[...pages],parents:[...parents],page_fingerprint:shortHash([...byRef.keys()].sort().join('\n')),declared_title:$('h1').first().text().trim()};
}

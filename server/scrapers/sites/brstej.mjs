// Independent Brstej adapter. Public DOM/routes observed 2026-11-04.
import * as cheerio from 'cheerio';
import {fetchProviderHtml, assertSafeScraperUrl, resolveSafeUrl} from '../shared/http.mjs';
import {normalizeCatalogItem, normalizeDetailsResult, normalizeEpisodeList, normalizeServerList,
  extractEpisodeNumber, extractYear, inferContentType} from '../shared/normalize.mjs';
import {attachResultMeta} from '../shared/errors.mjs';
import {extractRawStreamsFromText, isValidDirectMediaUrl, unwrapEmbedToDirectStreams} from '../stream-unwrapper.mjs';
import {BRSTEJ_CATEGORIES, BRSTEJ_CATEGORY_LABELS} from './brstej-categories.mjs';
// The supplied .beer origin redirects to this observed public primary (2026-11-04).
const ORIGIN='https://brstejj.pics', HOSTS=['brstejj.pics','brstejj.beer'];
export const PROVIDER_META = Object.freeze({id:'brstej',name:'برستيج',code:'BR',domains:[ORIGIN,'https://brstejj.beer'],mirrorOf:null,resolveOnDetails:true,
  capabilities:{catalog:true,search:true,details:true,episodes:true,servers:true,resolve:true,live:false},
  searchSpec:{method:'GET',pathTemplate:'/search.php?keywords={query}',queryParam:'keywords',pagination:true},notImplemented:{}});
export const BRSTEJ_CONFIG=Object.freeze({id:'brstej',baseUrl:ORIGIN,
  categories:{latest:'/home03',movies:'/cat03.php?cat=movies2-2224',series:'/moslslat.php',...BRSTEJ_CATEGORIES},
  categoryLabels:{latest:'الرئيسية',movies:'الأفلام',series:'المسلسلات',...BRSTEJ_CATEGORY_LABELS}});
const context=baseUrl=>({providerId:'brstej',baseUrl,allowHttp:false});
const refFor=url=>'brstej:'+Buffer.from(url).toString('base64url');
export function decodeProviderRef(input){
  let value=String(input||'');
  if(value.startsWith('brstej:')){value=value.slice(7);if(!value.startsWith('https://'))value=Buffer.from(value,'base64url').toString('utf8');}
  const url=assertSafeScraperUrl(value,{allowHttp:false,allowedHosts:HOSTS});
  const key=url.pathname==='/series1.php'?'id':'vid';
  if(!['/series1.php','/video.php','/play.php'].includes(url.pathname)||!/^\w{1,64}$/.test(url.searchParams.get(key)||''))throw Error('BRSTEJ_INVALID_REFERENCE');
  return url.href;
}
async function page(url,options={}){
  return fetchProviderHtml(url,{...options,providerId:'brstej',allowHttp:false,allowedHosts:HOSTS,
    maxRetries:0,timeoutMs:Math.min(15000,options.timeoutMs||12000),maxBytes:4*1024*1024});
}
export function parseBrstejCatalog(html,baseUrl=ORIGIN){
  const $=cheerio.load(html),items=[],seen=new Set();
  // Scope to observed content cards, excluding navigation/footer/recommendations.
  $('.ptoday-card,.pgh-series-card,.prs-card,.pmc-card,.pcg-card,.pln-card,.psd-card,.thumbnail').each((_,el)=>{
    const card=$(el),anchor=card.is('a')?card:card.find('h3 a[href],h2 a[href],a[href*="video.php?vid="],a[href*="series1.php?id="]').first();
    const url=resolveSafeUrl(anchor.attr('href')||'',baseUrl,{allowHttp:false,allowedHosts:HOSTS});
    if(!url||!['/video.php','/series1.php'].includes(new URL(url).pathname)||seen.has(url))return;
    const image=card.find('img').first();
    const title=(anchor.attr('title')||anchor.attr('aria-label')||card.find('h3,h2,.ptoday-title,.pgh-series-title').first().text()||image.attr('alt')||anchor.text()).replace(/\s+/g,' ').trim();
    if(!title)return;seen.add(url);
    const type=new URL(url).pathname==='/series1.php'?'series':inferContentType(title,url,'movie');
    const item=normalizeCatalogItem({ref:refFor(url),url,title,type,
      poster:image.attr('data-src')||image.attr('data-echo')||image.attr('src')||''},context(baseUrl));
    if(item)items.push(item);
  });
  const current=Number(new URL(baseUrl).searchParams.get('page'))||1;
  const next=$('main a[rel=next],main .pagination li.active + li a,main .prs-pagination li.active + li a,main .psd-pages a[rel=next]').first().attr('href');
  const safe=next&&resolveSafeUrl(next,baseUrl,{allowHttp:false,allowedHosts:HOSTS});
  const n=safe?Number(new URL(safe).searchParams.get('page')):null;
  return attachResultMeta(items,{ok:true,providerId:'brstej',url:baseUrl,next_page:Number.isInteger(n)&&n>current?n:null});
}
export async function scrapeCatalog(category='latest',n=1,options={}){
  const path=BRSTEJ_CONFIG.categories[category];if(!path)throw Error('BRSTEJ_UNKNOWN_CATEGORY');
  if(!Number.isInteger(n)||n<1||n>500)throw Error('BRSTEJ_BAD_PAGE');
  const url=new URL(path,ORIGIN);if(n>1)url.searchParams.set('page',n);
  const result=await page(url.href,options);return parseBrstejCatalog(result.html,result.url);
}
export async function scrapeSearch(query,n=1,options={}){
  const q=String(query||'').trim();if(q.length<2||q.length>120)return[];
  if(!Number.isInteger(n)||n<1||n>500)throw Error('BRSTEJ_BAD_PAGE');
  const url=new URL('/search.php',ORIGIN);url.searchParams.set('keywords',q);if(n>1)url.searchParams.set('page',n);
  const result=await page(url.href,options);return parseBrstejCatalog(result.html,result.url);
}
export function parseBrstejDetails(html,baseUrl){
  const $=cheerio.load(html),title=$('main h1').first().text().trim()||$('h1').first().text().trim();
  if(!title)throw Error('BRSTEJ_DETAILS_STRUCTURE_CHANGED');
  const episodes=[];
  $('#pds-detail .pds-season').each((_,el)=>{
    const season=Number(($(el).attr('id')||'').match(/^pds-season-(\d+)$/)?.[1]);
    if(!Number.isInteger(season)||season<1)return;
    $(el).find('.pds-episode').each((_,card)=>{
      const anchor=$(card).find('h4 a[href*="video.php?vid="]').first();
      const observed=anchor.attr('title')||anchor.text().trim();
      const url=resolveSafeUrl(anchor.attr('href')||'',baseUrl,{allowHttp:false,allowedHosts:HOSTS});
      const number=extractEpisodeNumber(observed,url);if(!url||!number)return;
      episodes.push({title:observed,url,ref:refFor(url),season,number});
    });
  });
  const series=new URL(baseUrl).pathname==='/series1.php';
  return normalizeDetailsResult({ref:refFor(baseUrl),sourceUrl:baseUrl,title,
    poster:$('.pds-art img').first().attr('src')||$('meta[property="og:image"]').attr('content')||'',
    overview:$('.pds-description,#pwr-description-copy').first().text().trim(),year:extractYear(title),
    type:series?'series':inferContentType(title,baseUrl,'movie'),
    episodes:normalizeEpisodeList(episodes,context(baseUrl)),servers:[]},context(baseUrl));
}
export async function scrapeDetails(ref,options={}){
  let result=await page(decodeProviderRef(ref),options);const original=result.url;
  const $=cheerio.load(result.html);
  // Only the work breadcrumb can identify its actual parent series.
  const parent=$('#pwr-watch .pwr-crumb a[href*="series1.php?id="],#pwr-watch .pwr-series-all[href]').first().attr('href');
  let parentRef=null;
  if(new URL(original).pathname==='/video.php'&&parent){const target=decodeProviderRef(new URL(parent,original).href);result=await page(target,options);parentRef=refFor(target);}
  return attachResultMeta({...parseBrstejDetails(result.html,result.url),requested_source_ref:refFor(original),observed_parent_ref:parentRef},
    {ok:true,providerId:'brstej',url:result.url});
}
export async function scrapeEpisodes(ref,options={}){return(await scrapeDetails(ref,options)).episodes;}
export async function scrapeServers(ref,options={}){
  let result=await page(decodeProviderRef(ref),options);let $=cheerio.load(result.html);
  const play=$('#pwr-watch a.pwu-watch-link[href*="play.php?vid="],a.pwu-watch-link[href*="play.php?vid="]').first().attr('href');
  if(play){result=await page(decodeProviderRef(new URL(play,result.url).href),options);$=cheerio.load(result.html);}
  const raw=extractRawStreamsFromText(result.html,result.url);
  $('[data-embed-url]').each((_,el)=>{const url=resolveSafeUrl($(el).attr('data-embed-url')||'',result.url,{allowHttp:false});if(url)raw.push({url,type:'embed',label:$(el).text().trim()});});
  return attachResultMeta(normalizeServerList(raw,{...context(result.url),providerName:'برستيج',codePrefix:'BR'}),{ok:raw.length>0,providerId:'brstej',url:result.url});
}
export async function resolveStream(ref,options={}){
  const servers=await scrapeServers(ref,options),pending=servers.slice(0,6),direct=[];let cursor=0;
  async function worker(){while(cursor<pending.length){const s=pending[cursor++];if(isValidDirectMediaUrl(s.url))direct.push(s);else if(!options.fixtureHtml){try{direct.push(...await unwrapEmbedToDirectStreams(s.url,decodeProviderRef(ref)));}catch{}}}}
  await Promise.all([worker(),worker(),worker()]);
  const safe=direct.filter(s=>isValidDirectMediaUrl(s.url)),top=safe[0];
  return attachResultMeta({ok:Boolean(top),providerId:'brstej',url:top?.url||null,streamUrl:top?.url||null,
    streamType:top?.streamType||top?.type||null,headers:top?.headers||{},servers:safe},
    {ok:Boolean(top),providerId:'brstej',errorCode:top?null:'SERVER_EXTRACTION_FAILED'});
}

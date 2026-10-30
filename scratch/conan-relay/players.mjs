import {fetchProviderHtml,fetchSafeResponse,assertSafeScraperUrl,loadHtml,unpackDeanEdwards,extractRawStreamsFromText,unwrapEmbedToDirectStreams} from './provider-runtime.mjs';
export const PLAYER_TEMPLATES=Object.freeze(['html5','artplayer','jwplayer-packed','mixdrop','ok-metadata','streamtape-literals','download-bridge','iframe-chain','legacy-host-adapters']);
export function decodeLiteral(input){
 if(typeof input!=='string'||input.length>32768)throw Error('LITERAL_LIMIT');
 return input.replace(/\\(x[0-9a-f]{2}|u[0-9a-f]{4}|["'\\/bnfrt])/gi,(_,v)=>v[0]==='x'||v[0]==='u'?String.fromCharCode(parseInt(v.slice(1),16)):({b:'\b',n:'\n',f:'\f',r:'\r',t:'\t'}[v]??v));
}
export function literalConcat(expression){
 if(typeof expression!=='string'||expression.length>32768)throw Error('EXPRESSION_LIMIT');
 let rest=expression.trim(),result='',parts=0;
 while(rest){if(++parts>32)throw Error('EXPRESSION_LIMIT');const match=rest.match(/^(['"])((?:\\.|(?!\1)[^\\])*)\1/);if(!match)throw Error('UNSUPPORTED_EXPRESSION');let value=decodeLiteral(match[2]);rest=rest.slice(match[0].length).trim();const substring=rest.match(/^\.substring\(\s*(\d+)\s*(?:,\s*(\d+)\s*)?\)/);if(substring){value=value.substring(Number(substring[1]),substring[2]===undefined?undefined:Number(substring[2]));rest=rest.slice(substring[0].length).trim();}result+=value;if(!rest)break;if(!rest.startsWith('+'))throw Error('UNSUPPORTED_EXPRESSION');rest=rest.slice(1).trim();}
 return result;
}
export function parsePlayerDocument(html,pageUrl){
 if(typeof html!=='string'||html.length>1024*1024)throw Error('PLAYER_SIZE_LIMIT');
 const $=loadHtml(html),plain=html+'\n'+unpackDeanEdwards(html),media=[],children=[],seen=new Set(),used=new Set();
 const add=(value,template,type=null)=>{try{const u=assertSafeScraperUrl(new URL(decodeLiteral(value).replaceAll('&amp;','&'),pageUrl).href,{allowHttp:false});if(seen.has('m:'+u.href))return;seen.add('m:'+u.href);used.add(template);media.push({url:u.href,streamType:type,headers:{Referer:pageUrl},player:template});}catch{}};
 $('video[src],source[src]').each((_,el)=>add($(el).attr('src'),'html5',/mpegurl/i.test($(el).attr('type')||'')?'m3u8':null));
 for(const m of plain.matchAll(/(?:const|let|var)\s+(?:videoUrl|hlsUrl|hlsManifestUrl)\s*=\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g))add(m[2],'artplayer',/type\s*:\s*['"]m3u8['"]/.test(plain)?'m3u8':null);
 for(const raw of extractRawStreamsFromText(html,pageUrl))add(raw.url,'jwplayer-packed',raw.streamType);
 for(const m of plain.matchAll(/MDCore\.wurl\s*=\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g))add(m[2],'mixdrop','mp4');
 $('[data-options]').each((_,e)=>{try{const opts=JSON.parse($(e).attr('data-options')),metadata=JSON.parse(opts.flashvars?.metadata||'{}');if(metadata.hlsManifestUrl)add(metadata.hlsManifestUrl,'ok-metadata','m3u8');for(const video of metadata.videos||[])if(video.url)add(video.url,'ok-metadata','mp4');}catch{}});
 const robot=plain.match(/getElementById\(\s*['"](?:robotlink|norobotlink)['"]\s*\)\.innerHTML\s*=\s*([^;\n]+)/);
 if(robot){try{add(literalConcat(robot[1]),'streamtape-literals',null);}catch{}}
 for(const match of plain.matchAll(/(?:window\.)?location(?:\.href)?\s*=\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g))if(match[2].includes('start_download='))add(match[2],'download-bridge',null);
 $('iframe[src],iframe[data-src],iframe[data-lazy-src]').each((_,e)=>{try{const u=assertSafeScraperUrl(new URL($(e).attr('src')||$(e).attr('data-src')||$(e).attr('data-lazy-src'),pageUrl).href,{allowHttp:false});if(!seen.has('c:'+u.href)){seen.add('c:'+u.href);children.push(u.href);used.add('iframe-chain');}}catch{}});
 return {media,children,templates:[...used],title:$('title').text().trim().slice(0,160)};
}
export async function probePlayerMedia(raw,{fetchResponse=fetchSafeResponse}={}){
 const r=await fetchResponse(raw.url,{allowHttp:false,timeoutMs:15000,maxRetries:0,responseType:'bytes',prefixBytes:1024,headers:{...raw.headers,Range:'bytes=0-1023'}});
 if(!r.ok)return null;const bytes=Buffer.from(r.bytes||[]),hls=bytes.toString('utf8').trimStart().startsWith('#EXTM3U'),mp4=bytes.subarray(4,8).toString()==='ftyp';
 if(!hls&&!mp4)return null;
 return {...raw,url:r.url,streamType:hls?'m3u8':'mp4',verified:true,contentType:r.headers?.get?.('content-type')||null};
}
export async function resolvePlayer(url,referer='',{onEvent=()=>{},deadline=Date.now()+45000,visited=new Set(),depth=0,fetchPage=fetchProviderHtml,probe=probePlayerMedia,legacy=unwrapEmbedToDirectStreams}={}){
 if(depth>4||visited.size>=24||Date.now()>deadline)return [];
 const target=assertSafeScraperUrl(url,{allowHttp:false});if(visited.has(target.href))return [];visited.add(target.href);
 const streams=[];
 const event=data=>onEvent({host:target.hostname,depth,...data});
 try{
  const response=await fetchPage(target.href,{allowHttp:false,timeoutMs:15000,maxRetries:0,referer});
  if(!response.ok){event({stage:'page',status:response.status,reason:'HTTP_UNAVAILABLE'});return [];}
  const body=response.html||'';const barrier=/Video embed restricted for this domain/i.test(body)?'EMBED_DOMAIN_RESTRICTED':(/hcaptcha|g-recaptcha/i.test(body)&&/verify you are human|security of your connection/i.test(body))?'INTERACTIVE_VERIFICATION_REQUIRED':!body.trim()?'EMPTY_PLAYER_DOCUMENT':null;if(barrier){event({stage:'barrier',status:response.status,reason:barrier});return [];}
  const parsed=parsePlayerDocument(body,response.url||target.href);event({stage:'parsed',status:response.status,templates:parsed.templates,mediaCandidates:parsed.media.length,childPlayers:parsed.children.length});
  for(const candidate of parsed.media){if(Date.now()>deadline)break;try{const verified=await probe(candidate);if(verified){streams.push(verified);event({stage:'verified',template:candidate.player,format:verified.streamType});}}catch(e){event({stage:'media',reason:e.code||e.name,status:e.status||null});}}
  for(const child of parsed.children){if(Date.now()>deadline)break;streams.push(...await resolvePlayer(child,response.url||target.href,{onEvent,deadline,visited,depth:depth+1,fetchPage,probe,legacy}));}
  if(!streams.length&&Date.now()<deadline){const fallback=await legacy(target.href,referer);for(const candidate of fallback){if(Date.now()>deadline)break;try{const verified=await probe({...candidate,player:'legacy-host-adapters'});if(verified)streams.push(verified);}catch{}}}
 }catch(e){event({stage:'page',reason:e.code||e.name,status:e.status||null});}
 return [...new Map(streams.map(s=>[s.url,s])).values()];
}

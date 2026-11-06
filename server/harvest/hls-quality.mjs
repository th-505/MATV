import {assertSafeScraperUrl} from '../scrapers/shared/http.mjs';
/** Metadata from observed master entries only. The original master owns audio/subtitles. */
export function observedHlsQualities(text,baseUrl){
 if(typeof text!=='string'||text.length>65536||!text.trimStart().startsWith('#EXTM3U'))return[];
 const lines=text.split(/\r?\n/),levels=[];
 for(let i=0;i<lines.length&&levels.length<64;i++){
  if(!lines[i].startsWith('#EXT-X-STREAM-INF:'))continue;
  const attributes={};for(const match of lines[i].slice(18).matchAll(/([A-Z0-9-]+)=("[^"]*"|[^,]*)/g))attributes[match[1]]=match[2].replace(/^"|"$/g,'');
  const uri=lines[i+1]?.trim();if(!uri||uri.startsWith('#'))continue;
  try{assertSafeScraperUrl(new URL(uri,baseUrl).href,{allowHttp:false});}catch{continue;}
  const resolution=/^(\d{1,5})x(\d{1,5})$/.exec(attributes.RESOLUTION||'');
  const width=resolution?Number(resolution[1]):null,height=resolution?Number(resolution[2]):null;
  const bandwidth=Number(attributes['AVERAGE-BANDWIDTH']||attributes.BANDWIDTH)||null;
  if((width!==null&&(width<1||width>16384||height<1||height>16384))||(bandwidth!==null&&(!Number.isSafeInteger(bandwidth)||bandwidth<1||bandwidth>1000000000)))continue;
  levels.push({index:levels.length,width,height,bandwidth,codecs:String(attributes.CODECS||'').slice(0,256),label:height?`${height}p`:bandwidth?`${Math.round(bandwidth/1000)} kbps`:'تلقائي'});
 }
 return levels;
}

import { load } from 'cheerio';
import { hasSearchTrace, searchTraceEvent } from './search-trace.mjs';
export function searchTraceHtml(html, pageUrl) {
  if (!hasSearchTrace()) return;
  const $ = load(String(html).slice(0,1500000));
  $('form').slice(0,20).each((_,form)=>{
    const fields=$(form).find('input[name],select[name]').map((_,el)=>$(el).attr('name')).get();
    if (!fields.some(name=>/^(s|q|search|query|search_query|keyword|keywords|story)$/i.test(name))) return;
    try { searchTraceEvent('search_form',{url:new URL($(form).attr('action')||pageUrl,pageUrl).href,method:($(form).attr('method')||'GET').toUpperCase(),fields}); } catch {}
  });
}

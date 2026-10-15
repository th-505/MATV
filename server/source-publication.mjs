// Read explicit publication metadata only; never infer a date from release
// years, search position, recommendations, relative labels or arbitrary JS.
export function sourcePublishedAt(html='') {
  for(const match of String(html).matchAll(/<(?:meta|time)\b[^>]{0,2048}>/gi)) {
    const attrs={};
    for(const attr of match[0].matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[attr[1].toLowerCase()]=attr[2] ?? attr[3];
    const marker=String(attrs.property || attrs.itemprop || attrs.name || '').toLowerCase();
    if(!['article:published_time','og:published_time','datepublished'].includes(marker)) continue;
    const raw=attrs.content || attrs.datetime || '';
    const parts=raw.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/i);
    if(!parts) continue;
    const [year,month,day,hour,minute]=parts.slice(1,6).map(Number),second=Number(parts[6] || 0);
    const calendar=new Date(Date.UTC(year,month-1,day));
    if(year<1870 || year>2200 || calendar.getUTCFullYear()!==year || calendar.getUTCMonth()!==month-1 ||
      calendar.getUTCDate()!==day || hour>23 || minute>59 || second>59) continue;
    const stamp=Date.parse(raw);if(Number.isFinite(stamp)) return new Date(stamp).toISOString();
  }
  return null;
}

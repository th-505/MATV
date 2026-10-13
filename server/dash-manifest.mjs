import { load } from 'cheerio';

export function rewriteDashManifest(xml, baseUrl, createProxy, assertUrl) {
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('UNSAFE_DASH_XML');
  const $ = load(xml, {xml:true});
  if (!$('MPD').length) throw new Error('INVALID_DASH_MANIFEST');
  function baseFor(node) {
    let base = baseUrl;
    for (const ancestor of [...$(node).parents().toArray().reverse(), node]) {
      const value = $(ancestor).children('BaseURL').first().text().trim();
      if (value) base = assertUrl(new URL(value,base).href).href;
    }
    return base;
  }
  $('BaseURL').each((_,node)=>baseFor(node.parent));
  // Expand inherited templates before resolving representation-specific bases.
  $('Representation').each((_,node) => {
    for (const kind of ['SegmentTemplate','SegmentList']) {
      if ($(node).children(kind).length) continue;
      for (const parent of $(node).parents().toArray()) {
        const inherited = $(parent).children(kind).first();
        if (inherited.length) {$(node).append(inherited.clone());break;}
      }
    }
  });
  $('SegmentTemplate,SegmentList').each((_,node) => {if (!$(node).parents('Representation').length) $(node).remove();});
  const urls = [];
  $('SegmentTemplate, SegmentURL, Initialization, RepresentationIndex').each((_,node) => {
    for (const name of ['media','initialization','sourceURL','index']) {
      const value = $(node).attr(name);
      if (value) urls.push({node,name,url:assertUrl(new URL(value,baseFor(node)).href).href});
    }
  });
  for (const {node,name,url} of urls) $(node).attr(name,createProxy(url));
  // BaseURL is also the full resource used by SegmentBase/range based MPDs.
  const leaves = [];
  $('Representation').each((_,node) => {
    if ($(node).children('BaseURL').length && !$(node).find('SegmentTemplate,SegmentList').length &&
        !$(node).find('SegmentTemplate').length) leaves.push({node,url:baseFor(node)});
  });
  $('BaseURL').remove();
  for (const {node,url} of leaves) $(node).prepend(`<BaseURL>${createProxy(url).replaceAll('&','&amp;')}</BaseURL>`);
  return $.xml();
}

export function dashProxyParameters(template) {
  let query = '';
  for (const token of new Set(template.match(/\$(?:Number|Time|RepresentationID|Bandwidth)(?:%0\d+d)?\$/g) || [])) {
    const name = token.slice(1,-1).split('%')[0].toLowerCase();
    query += `&${name}=${token}`;
  }
  if (template.replace(/\$(?:Number|Time|RepresentationID|Bandwidth)(?:%0\d+d)?\$/g,'').includes('$')) throw new Error('UNSUPPORTED_DASH_TEMPLATE');
  return query;
}

export function expandDashTemplate(template, parameters) {
  return template.replace(/\$(Number|Time|RepresentationID|Bandwidth)(?:%0\d+d)?\$/g, (_,kind) => {
    const value = parameters.get(kind.toLowerCase()) || '';
    const valid = kind === 'RepresentationID' ? /^[a-zA-Z0-9_-]{1,128}$/.test(value) : /^\d{1,20}$/.test(value);
    if (!valid) throw new Error('INVALID_DASH_PARAMETER');
    return value;
  });
}

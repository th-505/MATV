import {createHash} from 'node:crypto';
import {getProvider} from '../scrapers/registry.mjs';
export const canonicalWorkRef=ref=>/^tmdb:(movie|tv):[1-9]\d{0,9}$/.test(String(ref));
export const sourceWorkRef=ref=>/^source:[a-z0-9][a-z0-9_-]{1,29}:[a-f0-9]{24}$/.test(String(ref));
const aliases={legacy:'akwam',akoam:'akwam',wecima:'mycima',moviz:'moviztime','3ck':'3cktv'};
export function providerForReference(ref){const id=String(ref).split(':')[0],canonical=aliases[id]||id;return getProvider(canonical)?.meta?.mirrorOf||canonical;}
export function workReference(ref){
 if(canonicalWorkRef(ref))return ref;
 if(sourceWorkRef(ref)){const id=ref.split(':')[1];if(!getProvider(aliases[id]||id))throw Error('SOURCE_NOT_SUPPORTED');return ref;}
 if(typeof ref!=='string'||Buffer.byteLength(ref)>1536||/[\u0000-\u0020\u007f]/.test(ref)||!/^([a-z0-9][a-z0-9_-]{1,29}):.+$/.test(ref))throw Error('HARVEST_BAD_REFERENCE');
 if(!getProvider(providerForReference(ref)))throw Error('SOURCE_NOT_SUPPORTED');
 return 'source:'+ref.split(':')[0]+':'+createHash('sha256').update(ref).digest('hex').slice(0,24);
}
export function scraperReference(ref){
 const provider=providerForReference(ref);if(ref.startsWith('legacy:')){let url;try{url=decodeURIComponent(ref.slice(7));}catch{throw Error('HARVEST_BAD_REFERENCE');}return provider+':'+Buffer.from(url).toString('base64url');}
 return provider+':'+ref.slice(ref.indexOf(':')+1);
}

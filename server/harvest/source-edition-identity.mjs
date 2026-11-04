import {createHash} from 'node:crypto';
/** Exact observed episode references, scoped to provider and language edition.
 * Titles/counts alone must never collapse different catalogues or dubbed cuts. */
export function sourceIndexIdentity(provider,edition,episodes=[]){
 const refs=[...new Set(episodes.filter(e=>e.source_ref).map(e=>`${e.season}:${e.episode}:${e.source_ref}`))].sort();
 return refs.length?createHash('sha256').update(`${provider}|${edition||'unknown'}|${refs.join('\n')}`).digest('hex'):null;
}
export function distinctSourceEditions(rows=[]){
 const result=new Map();
 for(const row of rows){
  const proof=/^[a-f0-9]{64}$/.test(row.index_identity||'')?`${row.provider}|${row.edition}|${row.index_identity}`:row.ref;
  if(!result.has(proof))result.set(proof,row);
 }
 return [...result.values()];
}
export function editionDisplayTitle(title=''){
 return String(title).replace(/^مشاهدة\s+(?=(?:مسلسل|فيلم|انمي|أنمي)\s)/,'')
  .replace(/\s+(?:الحلقة|حلقة|episode|ep)\s*[0-9٠-٩]+.*$/i,'')
  .replace(/\s+\(\s*(?:19|20)[0-9]{2}\s*\)\s*$/,'').trim();
}

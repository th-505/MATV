import fs from 'node:fs';
import { refKey, providerOf } from '../edge/src/router.mjs';
const identities=JSON.parse(fs.readFileSync('edge/config/episodes.json'));
const rows=[],seen=new Set();
for(const identity of identities){
 if(!/^[a-zA-Z0-9_-]{1,100}$/.test(identity.episode_id)||!identity.edition||!Object.keys(identity.refs).length)throw Error('Invalid identity');
 const value=JSON.stringify(identity);rows.push({key:'episode:'+identity.episode_id,value});
 for(const [provider,ref] of Object.entries(identity.refs)){
  if(providerOf(ref)!==provider||seen.has(ref))throw Error('Ambiguous provider identity');seen.add(ref);
  rows.push({key:await refKey(ref),value});
 }
}
if(process.argv.includes('--json'))console.log(JSON.stringify(rows));else console.log(`Validated ${identities.length} exact edition identities (${rows.length} KV rows)`);

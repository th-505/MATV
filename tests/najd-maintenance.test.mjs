import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {createGithubIdentityVerifier} from '../server/maintenance/github-identity.mjs';
import {verifyProviderConfiguration} from '../server/maintenance/verify-config.mjs';
import {getProviderConfig,withProviderConfig} from '../server/scrapers/shared/provider-config.mjs';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const now=Date.now();
const claims={iss:'https://token.actions.githubusercontent.com',aud:'najd-maintenance',repository:'th-505/MATV',ref:'refs/heads/main',workflow_ref:'th-505/MATV/.github/workflows/daily-scrapers-sync.yml@refs/heads/main',event_name:'schedule',iat:Math.floor(now/1000),exp:Math.floor(now/1000)+300};
function token(overrides={}){const parts=[{alg:'RS256',kid:'fixture'}, {...claims,...overrides}].map(x=>Buffer.from(JSON.stringify(x)).toString('base64url'));return parts.join('.')+'.'+sign('RSA-SHA256',Buffer.from(parts.join('.')),privateKey).toString('base64url')}
test('maintenance identity accepts only signed main workflow tokens, not forks, other jobs or expiry',async()=>{
 let requests=0;const validate=createGithubIdentityVerifier({now:()=>now,fetchImpl:async()=>{requests++;return Response.json({keys:[{...publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'}]})}});
 assert.equal((await validate(token())).repository,'th-505/MATV');
 for(const bad of [{repository:'other/MATV'},{ref:'refs/heads/fork'},{workflow_ref:'th-505/MATV/.github/workflows/other.yml@refs/heads/main'},{exp:Math.floor(now/1000)-1},{aud:'other'},{event_name:'pull_request'}])await assert.rejects(validate(token(bad)),/MAINTENANCE_AUTH_REQUIRED/);
 const parts=token().split('.');parts[2]=Buffer.from('fake').toString('base64url');await assert.rejects(validate(parts.join('.')),/MAINTENANCE_AUTH_REQUIRED/);
 assert.equal(requests,1);
});
test('proposal configuration is isolated from concurrent real requests',async()=>{
 let entered,release;const ready=new Promise(r=>entered=r),gate=new Promise(r=>release=r);
 const probe=withProviderConfig('fixture',{search_path:'/proposed'},async()=>{entered();await gate;assert.equal(getProviderConfig('fixture').search_path,'/proposed')});
 await ready;assert.equal(getProviderConfig('fixture'),null);release();await probe;assert.equal(getProviderConfig('fixture'),null);
});
function entry({baselineWorks=false,negativeFails=false}={}){return {meta:{id:'fixture',enabled:true,capabilities:{search:true}},module:{scrapeSearch:async query=>{
 const configured=Boolean(getProviderConfig('fixture'));
 return (baselineWorks||configured)&&(query==='Avatar'||negativeFails)?[{title:'Avatar',year:2009,type:'movie'}]:[];
}}}}
test('config repair requires failing baseline, real identity and an empty negative check',async()=>{
 const result=await verifyProviderConfiguration(entry(),{search_path:'/search'});
 assert.equal(result.evidence.positive_identity,true);assert.equal(result.evidence.negative_empty,true);
 await assert.rejects(verifyProviderConfiguration(entry({baselineWorks:true}),{search_path:'/search'}),/SOURCE_ALREADY_WORKING/);
 await assert.rejects(verifyProviderConfiguration(entry({negativeFails:true}),{search_path:'/search'}),/NEGATIVE_CHECK_FAILED/);
 assert.equal(getProviderConfig('fixture'),null);
});

import {createPublicKey,verify} from 'node:crypto';
import {readBoundedText} from '../scrapers/shared/http.mjs';
export function createGithubIdentityVerifier({fetchImpl=globalThis.fetch,now=Date.now}={}){
 let keys=null,expires=0;
 return async function validate(token){
  if(typeof token!=='string'||token.length>12000)throw Error('MAINTENANCE_AUTH_REQUIRED');
  const parts=token.split('.');if(parts.length!==3||parts.some(p=>!p||!/^[A-Za-z0-9_-]+$/.test(p)))throw Error('MAINTENANCE_AUTH_REQUIRED');
  let head,claims;try{head=JSON.parse(Buffer.from(parts[0],'base64url'));claims=JSON.parse(Buffer.from(parts[1],'base64url'))}catch{throw Error('MAINTENANCE_AUTH_REQUIRED')}
  const clock=Math.floor(now()/1000);
  if(head.alg!=='RS256'||typeof head.kid!=='string'||head.kid.length>100||claims.iss!=='https://token.actions.githubusercontent.com'||claims.aud!=='najd-maintenance'||claims.repository!=='th-505/MATV'||claims.ref!=='refs/heads/main'||claims.workflow_ref!=='th-505/MATV/.github/workflows/daily-scrapers-sync.yml@refs/heads/main'||!['schedule','workflow_dispatch'].includes(claims.event_name)||!Number.isFinite(claims.exp)||!Number.isFinite(claims.iat)||claims.exp<=clock||claims.exp>clock+600||claims.iat>clock+60||claims.iat<clock-600||(claims.nbf&&claims.nbf>clock+30))throw Error('MAINTENANCE_AUTH_REQUIRED');
  if(!keys||expires<=now()){
   const response=await fetchImpl('https://token.actions.githubusercontent.com/.well-known/jwks',{redirect:'error',signal:AbortSignal.timeout(5000)});
   if(!response.ok)throw Error('MAINTENANCE_IDENTITY_UNAVAILABLE');
   const body=JSON.parse(await readBoundedText(response,65536));
   if(!Array.isArray(body.keys)||body.keys.length>30)throw Error('MAINTENANCE_IDENTITY_UNAVAILABLE');
   keys=body.keys;expires=now()+3600000;
  }
  const jwk=keys.find(k=>k.kid===head.kid&&k.kty==='RSA'&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  if(!jwk||!verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url')))throw Error('MAINTENANCE_AUTH_REQUIRED');
  return {repository:claims.repository,event:claims.event_name};
 };
}

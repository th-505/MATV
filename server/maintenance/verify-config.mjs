import {randomBytes} from 'node:crypto';
import {withProviderConfig,validateProviderConfig} from '../scrapers/shared/provider-config.mjs';
import {matchHarvestIdentity} from '../harvest/identity.mjs';
const example=id=>['3isk','3cktv'].includes(id)?{query:'المؤسس عثمان',title:'المؤسس عثمان',aliases:['Kuruluş Osman','Kurulus Osman'],year:2019}:['anime4up','anime4up_rest','ristoanime','witanime'].includes(id)?{query:'One Piece',title:'One Piece',aliases:['ون بيس','ونبيس'],year:1999}:{query:'Avatar',title:'Avatar',aliases:['أفاتار','افاتار'],year:2009};
async function verifyConfiguration(entry,config){
 if(!entry||entry.meta.enabled===false||entry.meta.mirrorOf||!entry.meta.capabilities?.search||typeof entry.module.scrapeSearch!=='function')throw Error('MAINTENANCE_SOURCE_UNSUPPORTED');
 const safe=validateProviderConfig(config),expected=example(entry.meta.id);
 let baseline;try{baseline=await entry.module.scrapeSearch(expected.query,1,{strict:true,timeoutMs:5000,maxRetries:0})}catch{}
 if(Array.isArray(baseline)&&!baseline?._meta?.errorCode&&baseline.some(hit=>matchHarvestIdentity(expected,hit).accepted))throw Error('MAINTENANCE_SOURCE_ALREADY_WORKING');
 return withProviderConfig(entry.meta.id,safe,async()=>{
  const opts={strict:true,timeoutMs:7000,maxRetries:0};
  const positive=await entry.module.scrapeSearch(expected.query,1,opts);
  if(!Array.isArray(positive)||positive?._meta?.errorCode||!positive.some(hit=>matchHarvestIdentity(expected,hit).accepted))throw Error('MAINTENANCE_POSITIVE_CHECK_FAILED');
  const negative=await entry.module.scrapeSearch('najd_no_such_work_'+randomBytes(10).toString('hex'),1,opts);
  if(!Array.isArray(negative)||(negative?._meta?.errorCode&&negative._meta.errorCode!=='EMPTY_RESULT')||negative.length)throw Error('MAINTENANCE_NEGATIVE_CHECK_FAILED');
  return {config:safe,evidence:{positive_identity:true,negative_empty:true,checked_at:new Date().toISOString()}};
 });
}

export async function verifyProviderConfiguration(entry,config,{timeoutMs=22000}={}){
 let timer;try{return await Promise.race([verifyConfiguration(entry,config),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('MAINTENANCE_CHECK_TIMEOUT')),timeoutMs);timer.unref?.()})])}finally{clearTimeout(timer)}
}

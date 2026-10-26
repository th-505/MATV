import test from 'node:test';
import assert from 'node:assert/strict';
import { createDiscoveryAudit } from '../server/discovery-audit.mjs';
const candidate={provider:'example',url:'https://media.example/a.mp4?token=private',observed_identity:{title:'Example',year:2025}};
test('probe precedes audit; signed URL never appears in quarantined output',async()=>{
  const calls=[];
  const review=createDiscoveryAudit({probe:async()=>{calls.push('probe');return{playable:true,statusCode:200,container:'mp4'};},
    auditor:{status:()=>({}),audit:async input=>{calls.push('audit');assert.equal(input.observed.title,'Example');return{eligible:false,id:'id',decision:'suspicious',reasons:['uncertain']};}}});
  const result=await review.review([candidate],{title:'Example'});
  assert.deepEqual(calls,['probe','audit']);assert.deepEqual(result.approved,[]);
  assert(!JSON.stringify(result).includes('private'));
});
test('AI eligible required; probe failures fail closed without copying expected into observed',async()=>{
  const review=createDiscoveryAudit({probe:async()=>{throw Error('network');},auditor:{status:()=>({}),audit:async input=>{
    assert.equal(input.technical.playable,false);assert.deepEqual(input.observed,{});return{eligible:false};}}});
  assert.equal((await review.review([{...candidate,observed_identity:undefined}],{title:'Example'})).approved.length,0);
});
test('only direct approved streams survive; rejected provider cannot discard another',async()=>{
  const review=createDiscoveryAudit({probe:async()=>({playable:true}),auditor:{status:()=>({}),audit:async()=>({eligible:true,id:'good'})}});
  const result=await review.review([candidate,{url:'https://example.com/player?file=.mp4'}],{});
  assert.equal(result.approved.length,1);assert.equal(result.approved[0].identity_verified,true);
});

test('AI outage does not block a technically valid exact metadata match, but never overrides a mismatch',async()=>{
 const source={...candidate,observed_identity:{title:'Example',year:2025,season:2,episode:4}};
 const expected={title:'Example',year:2025,season:2,episode:4};
 const auditor={status:()=>({}),audit:async()=>({eligible:false,aiReviewed:false,reasons:['AI_NOT_CONFIGURED']})};
 const review=createDiscoveryAudit({probe:async()=>({playable:true,statusCode:200,container:'mp4'}),auditor});
 const result=await review.review([source],expected);assert.equal(result.approved.length,1);assert.equal(result.approved[0].identity_verified,false);assert.equal(result.approved[0].audit_pending,true);
 assert.equal((await review.review([{...source,observed_identity:{...source.observed_identity,episode:3}}],expected)).approved.length,0);
 const veto=createDiscoveryAudit({probe:async()=>({playable:true}),auditor:{status:()=>({}),audit:async()=>({eligible:false,aiReviewed:true,decision:'mismatch',reasons:['wrong content']})}});
 assert.equal((await veto.review([source],expected)).approved.length,0);
});
